//! SQL Server: the schema from the sys catalog views.

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

use super::{flag, in_list, numbers, opt, quote_literal, rows, text, SchemaInfo, SchemaRead, TableSource};
use crate::driver::Driver;
use crate::error::Result;
use crate::ir::{Ir, IrCheck, IrColumn, IrForeignKey, IrIndex, IrIndexColumn, IrKey, IrTable};

pub async fn list_schemas(driver: &Driver) -> Result<Vec<SchemaInfo>> {
    let found = rows(
        driver,
        "SELECT s.name AS name, CAST(COUNT(t.object_id) AS int) AS tables
         FROM sys.schemas s LEFT JOIN sys.tables t ON t.schema_id = s.schema_id AND t.is_ms_shipped = 0
         WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest') AND s.name NOT LIKE 'db[_]%'
         GROUP BY s.name ORDER BY s.name",
    )
    .await?;
    Ok(found
        .iter()
        .map(|r| SchemaInfo {
            name: text(r, "name"),
            tables: text(r, "tables").parse().unwrap_or(0),
        })
        .collect())
}

/// SQL Server keeps expressions wrapped: "((0))", "(getdate())", "([precio]>=(0))". Strip the outer
/// parentheses and the brackets around plain names, and turn "x='a' OR x='b'" into "x IN ('a', 'b')".
pub fn simplify(expression: &str) -> String {
    static NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[([A-Za-z_][A-Za-z0-9_]*)\]").unwrap());
    static EQUALS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*N?'((?:[^']|'')*)'$").unwrap());
    let mut text = NAME.replace_all(expression.trim(), "$1").to_string();
    while text.starts_with('(') && text.ends_with(')') && super::wraps_whole(&text) {
        text = text[1..text.len() - 1].trim().to_string();
    }
    let parts: Vec<String> = text
        .split(" OR ")
        .map(|p| {
            let mut p = p.trim().to_string();
            while p.starts_with('(') && p.ends_with(')') && super::wraps_whole(&p) {
                p = p[1..p.len() - 1].trim().to_string();
            }
            p
        })
        .collect();
    let matches: Vec<_> = parts.iter().filter_map(|p| EQUALS.captures(p)).collect();
    if parts.len() > 1 && matches.len() == parts.len() && matches.iter().all(|m| m[1] == matches[0][1]) {
        let mut values: Vec<String> = matches.iter().map(|m| format!("'{}'", &m[2])).collect();
        // SQL Server stores the list in its own order; keep the one that reads naturally.
        values.reverse();
        return format!("{} IN ({})", &matches[0][1], values.join(", "));
    }
    // "(0)" inside a default becomes "0".
    let inner = text.trim_start_matches('(').trim_end_matches(')');
    if inner.parse::<f64>().is_ok() {
        return inner.to_string();
    }
    text
}

fn action(desc: &str) -> String {
    desc.replace('_', " ")
}

/// sys.columns gives max_length in bytes (-1 for MAX); the Unicode types use two bytes per character.
fn params_of(type_name: &str, max_length: i64, precision: i64, scale: i64) -> Vec<String> {
    match type_name {
        "varchar" | "char" | "varbinary" | "binary" => vec![if max_length < 0 { "MAX".into() } else { max_length.to_string() }],
        "nvarchar" | "nchar" => vec![if max_length < 0 { "MAX".into() } else { (max_length / 2).to_string() }],
        "decimal" | "numeric" => vec![precision.to_string(), scale.to_string()],
        "datetime2" | "time" | "datetimeoffset" if scale != 7 => vec![scale.to_string()],
        _ => Vec::new(),
    }
}

pub async fn read_schema(driver: &Driver, schemas: &[String]) -> Result<SchemaRead> {
    let list = in_list(schemas.iter().map(|s| quote_literal(s)));
    let mut ir = Ir {
        dialect: "sqlserver",
        ..Default::default()
    };
    ir.database_name = rows(driver, "SELECT DB_NAME() AS db").await?.first().and_then(|r| opt(r, "db"));

    let tables = rows(
        driver,
        &format!(
            "SELECT CAST(t.object_id AS varchar(20)) AS id, s.name AS s, t.name AS t FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
             WHERE t.is_ms_shipped = 0 AND s.name IN ({list}) ORDER BY s.name, t.name"
        ),
    )
    .await?;
    for view in rows(
        driver,
        &format!("SELECT v.name AS name FROM sys.views v JOIN sys.schemas s ON s.schema_id = v.schema_id WHERE s.name IN ({list}) ORDER BY v.name"),
    )
    .await?
    {
        ir.skipped.push(format!("VIEW {}", text(&view, "name")));
    }
    let mut repeated: HashMap<String, u32> = HashMap::new();
    for t in &tables {
        *repeated.entry(text(t, "t").to_lowercase()).or_default() += 1;
    }
    let mut names: HashMap<String, String> = HashMap::new();
    let mut order = Vec::new();
    let mut sources = Vec::new();
    for t in &tables {
        let (id, schema, table) = (text(t, "id"), text(t, "s"), text(t, "t"));
        let name = if repeated[&table.to_lowercase()] > 1 {
            format!("{schema}_{table}")
        } else {
            table.clone()
        };
        names.insert(id.clone(), name.clone());
        order.push(id);
        sources.push(TableSource {
            name,
            schema,
            table,
            key: Vec::new(),
        });
    }
    let ids = in_list(order.iter().cloned());

    let mut built: HashMap<String, IrTable> = order
        .iter()
        .map(|id| {
            (
                id.clone(),
                IrTable {
                    name: names[id].clone(),
                    ..Default::default()
                },
            )
        })
        .collect();
    let mut column_ids: HashMap<(String, i64), String> = HashMap::new();
    for c in rows(
        driver,
        &format!(
            "SELECT CAST(c.object_id AS varchar(20)) AS id, CAST(c.column_id AS int) AS num, c.name AS name, TYPE_NAME(c.system_type_id) AS type,
                    CAST(c.max_length AS int) AS max_length, CAST(c.precision AS int) AS prec, CAST(c.scale AS int) AS scale,
                    CASE WHEN c.is_nullable = 1 THEN 't' ELSE 'f' END AS nullable, CASE WHEN c.is_identity = 1 THEN 't' ELSE 'f' END AS is_identity,
                    cc.definition AS computed, dc.definition AS default_value
             FROM sys.columns c
             LEFT JOIN sys.computed_columns cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id
             LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
             WHERE c.object_id IN ({ids}) ORDER BY c.object_id, c.column_id"
        ),
    )
    .await?
    {
        let id = text(&c, "id");
        let Some(table) = built.get_mut(&id) else { continue };
        let name = text(&c, "name");
        column_ids.insert((id.clone(), text(&c, "num").parse().unwrap_or(0)), name.clone());
        let type_name = text(&c, "type").to_lowercase();
        let num = |key: &str| text(&c, key).parse::<i64>().unwrap_or(0);
        if let Some(expression) = opt(&c, "computed") {
            ir.skipped.push(format!("{}.{name} AS {}", table.name, simplify(&expression)));
        }
        table.columns.push(IrColumn {
            name,
            kind: type_name.to_uppercase(),
            params: params_of(&type_name, num("max_length"), num("prec"), num("scale")),
            not_null: !flag(&c, "nullable"),
            auto_increment: flag(&c, "is_identity"),
            default_value: opt(&c, "default_value").map(|d| simplify(&d)),
            ..Default::default()
        });
    }
    let column_name = |id: &str, num: i64| column_ids.get(&(id.to_string(), num)).cloned();

    // Primary keys and unique constraints, with their columns in key order.
    for k in rows(
        driver,
        &format!(
            "SELECT CAST(kc.parent_object_id AS varchar(20)) AS id, kc.name AS name, kc.type AS kind,
                    STUFF((SELECT ',' + CAST(ic.column_id AS varchar(10)) FROM sys.index_columns ic
                           WHERE ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 1, '') AS cols
             FROM sys.key_constraints kc WHERE kc.parent_object_id IN ({ids}) ORDER BY kc.parent_object_id, kc.name"
        ),
    )
    .await?
    {
        let id = text(&k, "id");
        let columns: Vec<String> = numbers(&text(&k, "cols")).into_iter().filter_map(|n| column_name(&id, n)).collect();
        let Some(table) = built.get_mut(&id) else { continue };
        if text(&k, "kind").trim() == "PK" {
            if let [only] = columns.as_slice() {
                if let Some(column) = table.columns.iter_mut().find(|c| &c.name == only) {
                    column.pk = true;
                }
            }
            table.pk = Some(IrKey { name: opt(&k, "name"), columns });
        } else {
            table.uniques.push(IrKey { name: opt(&k, "name"), columns });
        }
    }

    for f in rows(
        driver,
        &format!(
            "SELECT CAST(fk.parent_object_id AS varchar(20)) AS id, CAST(fk.referenced_object_id AS varchar(20)) AS ref, fk.name AS name,
                    fk.delete_referential_action_desc AS on_delete, fk.update_referential_action_desc AS on_update,
                    STUFF((SELECT ',' + CAST(c.parent_column_id AS varchar(10)) FROM sys.foreign_key_columns c WHERE c.constraint_object_id = fk.object_id ORDER BY c.constraint_column_id FOR XML PATH('')), 1, 1, '') AS cols,
                    STUFF((SELECT ',' + CAST(c.referenced_column_id AS varchar(10)) FROM sys.foreign_key_columns c WHERE c.constraint_object_id = fk.object_id ORDER BY c.constraint_column_id FOR XML PATH('')), 1, 1, '') AS ref_cols
             FROM sys.foreign_keys fk WHERE fk.parent_object_id IN ({ids}) ORDER BY fk.parent_object_id, fk.name"
        ),
    )
    .await?
    {
        let id = text(&f, "id");
        let reference = text(&f, "ref");
        let name = opt(&f, "name");
        let Some(ref_table) = names.get(&reference).cloned() else {
            ir.skipped.push(format!("FOREIGN KEY {} → table outside the chosen schemas", name.unwrap_or_default()));
            continue;
        };
        let columns = numbers(&text(&f, "cols")).into_iter().filter_map(|n| column_name(&id, n)).collect();
        let ref_columns = numbers(&text(&f, "ref_cols")).into_iter().filter_map(|n| column_name(&reference, n)).collect();
        if let Some(table) = built.get_mut(&id) {
            table.foreign_keys.push(IrForeignKey {
                name,
                columns,
                ref_table,
                ref_columns,
                on_delete: action(&text(&f, "on_delete")),
                on_update: action(&text(&f, "on_update")),
            });
        }
    }

    for c in rows(
        driver,
        &format!("SELECT CAST(parent_object_id AS varchar(20)) AS id, name AS name, definition AS definition FROM sys.check_constraints WHERE parent_object_id IN ({ids})"),
    )
    .await?
    {
        if let Some(table) = built.get_mut(&text(&c, "id")) {
            table.checks.push(IrCheck {
                name: opt(&c, "name"),
                expression: simplify(&text(&c, "definition")),
            });
        }
    }

    for i in rows(
        driver,
        &format!(
            "SELECT CAST(i.object_id AS varchar(20)) AS id, i.name AS name, CASE WHEN i.is_unique = 1 THEN 't' ELSE 'f' END AS is_unique,
                    i.type_desc AS method, i.filter_definition AS predicate,
                    STUFF((SELECT ',' + CAST(ic.column_id AS varchar(10)) + ':' + CAST(ic.is_descending_key AS varchar(1)) FROM sys.index_columns ic
                           WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0 ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 1, '') AS cols
             FROM sys.indexes i WHERE i.object_id IN ({ids}) AND i.is_primary_key = 0 AND i.is_unique_constraint = 0 AND i.type > 0 AND i.is_hypothetical = 0
             ORDER BY i.object_id, i.name"
        ),
    )
    .await?
    {
        let id = text(&i, "id");
        let columns = text(&i, "cols")
            .split(',')
            .filter_map(|part| {
                let (num, desc) = part.split_once(':')?;
                Some(IrIndexColumn {
                    name: column_name(&id, num.parse().ok()?)?,
                    order: if desc == "1" { "DESC" } else { "ASC" },
                })
            })
            .collect();
        let method = text(&i, "method");
        if let Some(table) = built.get_mut(&id) {
            table.indexes.push(IrIndex {
                name: opt(&i, "name"),
                columns,
                unique: flag(&i, "is_unique"),
                predicate: opt(&i, "predicate").map(|p| simplify(&p)),
                method: (method != "NONCLUSTERED").then(|| method.to_lowercase()),
            });
        }
    }

    for source in &mut sources {
        let id = names.iter().find(|(_, n)| **n == source.name).map(|(i, _)| i.clone()).unwrap_or_default();
        source.key = built.get(&id).and_then(|t| t.pk.as_ref()).map(|pk| pk.columns.clone()).unwrap_or_default();
    }
    ir.tables = order.iter().filter_map(|id| built.remove(id)).collect();
    Ok(SchemaRead { ir, sources })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simplifies_sql_server_expressions() {
        assert_eq!(simplify("((0))"), "0");
        assert_eq!(simplify("(getdate())"), "getdate()");
        assert_eq!(simplify("([precio]>=(0))"), "precio>=(0)");
        assert_eq!(simplify("([tipo]='empresa' OR [tipo]='persona')"), "tipo IN ('persona', 'empresa')");
        assert_eq!(simplify("(N'activo')"), "N'activo'");
    }

    #[test]
    fn computes_params() {
        assert_eq!(params_of("nvarchar", 160, 0, 0), ["80"]);
        assert_eq!(params_of("varchar", -1, 0, 0), ["MAX"]);
        assert_eq!(params_of("decimal", 9, 10, 2), ["10", "2"]);
        assert!(params_of("datetime2", 8, 27, 7).is_empty());
    }
}
