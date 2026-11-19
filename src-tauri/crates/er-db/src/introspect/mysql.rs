//! MySQL and MariaDB: the schema from information_schema.

use std::collections::HashMap;

use regex::Regex;

use super::{in_list, opt, quote_literal, rows, simplify_check, split_type, text, Row, SchemaInfo, SchemaRead, TableSource};
use crate::driver::Driver;
use crate::error::Result;
use crate::ir::{Ir, IrCheck, IrColumn, IrForeignKey, IrIndex, IrIndexColumn, IrKey, IrTable};

const SYSTEM: &str = "'mysql', 'information_schema', 'performance_schema', 'sys'";

pub async fn list_schemas(driver: &Driver) -> Result<Vec<SchemaInfo>> {
    let found = rows(
        driver,
        &format!(
            "SELECT s.schema_name AS name,
                    (SELECT COUNT(*) FROM information_schema.tables t WHERE t.table_schema = s.schema_name AND t.table_type = 'BASE TABLE') AS tables
             FROM information_schema.schemata s WHERE s.schema_name NOT IN ({SYSTEM}) ORDER BY s.schema_name"
        ),
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

/// "enum('a','it''s')" → ["a", "it's"].
fn enum_values(column_type: &str) -> Vec<String> {
    let inner = column_type.split_once('(').map(|(_, rest)| rest.trim_end_matches(')')).unwrap_or("");
    let quoted = Regex::new(r"'((?:[^']|'')*)'").unwrap();
    quoted.captures_iter(inner).map(|c| c[1].replace("''", "'")).collect()
}

/// The default as DDL text. MariaDB already quotes literals (and writes NULL for none); MySQL gives the
/// bare value, and marks expressions with DEFAULT_GENERATED.
fn default_value(raw: Option<String>, data_type: &str, extra: &str, mariadb: bool) -> Option<String> {
    let value = raw?;
    if mariadb {
        return (value != "NULL").then_some(value);
    }
    let numeric = matches!(
        data_type,
        "tinyint" | "smallint" | "mediumint" | "int" | "bigint" | "decimal" | "float" | "double" | "bit" | "year"
    );
    if extra.contains("DEFAULT_GENERATED") || numeric || value.eq_ignore_ascii_case("CURRENT_TIMESTAMP") {
        Some(value)
    } else {
        Some(quote_literal(&value))
    }
}

fn rule(value: &str) -> String {
    match value {
        "CASCADE" | "SET NULL" | "SET DEFAULT" | "RESTRICT" => value.to_string(),
        _ => "NO ACTION".into(),
    }
}

pub async fn read_schema(driver: &Driver, schemas: &[String]) -> Result<SchemaRead> {
    let list = in_list(schemas.iter().map(|s| quote_literal(s)));
    let version = rows(driver, "SELECT VERSION() AS v").await?.first().map(|r| text(r, "v")).unwrap_or_default();
    let mariadb = version.to_lowercase().contains("mariadb");
    let mut ir = Ir {
        dialect: "mysql",
        database_name: (schemas.len() == 1).then(|| schemas[0].clone()),
        ..Default::default()
    };

    let tables = rows(
        driver,
        &format!("SELECT table_schema AS s, table_name AS t, table_type AS kind FROM information_schema.tables WHERE table_schema IN ({list}) ORDER BY table_schema, table_name"),
    )
    .await?;
    let base: Vec<&Row> = tables.iter().filter(|t| text(t, "kind") == "BASE TABLE").collect();
    for view in tables.iter().filter(|t| text(t, "kind") != "BASE TABLE") {
        ir.skipped.push(format!("VIEW {}", text(view, "t")));
    }
    let mut repeated: HashMap<String, u32> = HashMap::new();
    for t in &base {
        *repeated.entry(text(t, "t").to_lowercase()).or_default() += 1;
    }
    // (schema, table) → IR name
    let mut names: HashMap<(String, String), String> = HashMap::new();
    let mut order = Vec::new();
    let mut sources = Vec::new();
    for t in &base {
        let (schema, table) = (text(t, "s"), text(t, "t"));
        let name = if repeated[&table.to_lowercase()] > 1 {
            format!("{schema}_{table}")
        } else {
            table.clone()
        };
        names.insert((schema.clone(), table.clone()), name.clone());
        order.push((schema.clone(), table.clone()));
        sources.push(TableSource {
            name,
            schema,
            table,
            key: Vec::new(),
        });
    }
    let mut built: HashMap<(String, String), IrTable> = order
        .iter()
        .map(|key| {
            (
                key.clone(),
                IrTable {
                    name: names[key].clone(),
                    ..Default::default()
                },
            )
        })
        .collect();

    for c in rows(
        driver,
        &format!(
            "SELECT table_schema AS s, table_name AS t, column_name AS name, column_type AS column_type, data_type AS data_type,
                    is_nullable AS nullable, column_default AS default_value, extra AS extra, generation_expression AS gen_expr
             FROM information_schema.columns WHERE table_schema IN ({list}) ORDER BY table_schema, table_name, ordinal_position"
        ),
    )
    .await?
    {
        let key = (text(&c, "s"), text(&c, "t"));
        let Some(table) = built.get_mut(&key) else { continue };
        let column_type = text(&c, "column_type");
        let data_type = text(&c, "data_type").to_lowercase();
        let extra = text(&c, "extra");
        let name = text(&c, "name");
        let generated = opt(&c, "gen_expr");
        if let Some(expression) = &generated {
            ir.skipped.push(format!("{}.{name} GENERATED ALWAYS AS ({expression})", table.name));
        }
        // The type without UNSIGNED or ZEROFILL, as the DDL importer reads it; tinyint(1) keeps its width.
        let (_, params) = split_type(&column_type);
        let mut kind = data_type.to_uppercase();
        let enum_values = (data_type == "enum").then(|| enum_values(&column_type));
        if enum_values.is_some() {
            kind = "ENUM".into();
        } else if data_type == "set" {
            kind = "SET".into();
        }
        let params = if enum_values.is_some() || data_type == "set" { Vec::new() } else { params };
        table.columns.push(IrColumn {
            name,
            kind,
            params,
            not_null: text(&c, "nullable") == "NO",
            auto_increment: extra.contains("auto_increment"),
            default_value: if generated.is_some() {
                None
            } else {
                default_value(c.get("default_value").cloned().flatten(), &data_type, &extra, mariadb)
            },
            enum_values,
            ..Default::default()
        });
    }

    // Key columns of every constraint, in order.
    let mut key_columns: HashMap<(String, String, String), Vec<Row>> = HashMap::new();
    for k in rows(
        driver,
        &format!(
            "SELECT table_schema AS s, table_name AS t, constraint_name AS name, column_name AS col, referenced_table_schema AS ref_s,
                    referenced_table_name AS ref_t, referenced_column_name AS ref_col
             FROM information_schema.key_column_usage WHERE table_schema IN ({list}) ORDER BY table_schema, table_name, constraint_name, ordinal_position"
        ),
    )
    .await?
    {
        key_columns.entry((text(&k, "s"), text(&k, "t"), text(&k, "name"))).or_default().push(k);
    }
    let mut rules: HashMap<(String, String), (String, String)> = HashMap::new();
    for r in rows(
        driver,
        &format!("SELECT constraint_schema AS s, constraint_name AS name, update_rule AS up, delete_rule AS del FROM information_schema.referential_constraints WHERE constraint_schema IN ({list})"),
    )
    .await?
    {
        rules.insert((text(&r, "s"), text(&r, "name")), (text(&r, "del"), text(&r, "up")));
    }
    let constraints = rows(
        driver,
        &format!(
            "SELECT table_schema AS s, table_name AS t, constraint_name AS name, constraint_type AS kind
             FROM information_schema.table_constraints WHERE table_schema IN ({list}) ORDER BY table_schema, table_name, constraint_name"
        ),
    )
    .await?;
    let mut fk_names = Vec::new();
    for k in &constraints {
        let key = (text(k, "s"), text(k, "t"));
        let name = text(k, "name");
        let Some(table) = built.get_mut(&key) else { continue };
        let cols = key_columns.get(&(key.0.clone(), key.1.clone(), name.clone())).cloned().unwrap_or_default();
        let columns: Vec<String> = cols.iter().map(|c| text(c, "col")).collect();
        match text(k, "kind").as_str() {
            "PRIMARY KEY" => {
                if let [only] = columns.as_slice() {
                    if let Some(column) = table.columns.iter_mut().find(|c| &c.name == only) {
                        column.pk = true;
                    }
                }
                table.pk = Some(IrKey { name: None, columns });
            }
            "UNIQUE" => table.uniques.push(IrKey { name: Some(name), columns }),
            "FOREIGN KEY" => {
                let Some(first) = cols.first() else { continue };
                let reference = (text(first, "ref_s"), text(first, "ref_t"));
                let Some(ref_table) = names.get(&reference).cloned() else {
                    ir.skipped.push(format!("FOREIGN KEY {name} → table outside the chosen schemas"));
                    continue;
                };
                let (on_delete, on_update) = rules.get(&(key.0.clone(), name.clone())).cloned().unwrap_or_default();
                fk_names.push((key.clone(), name.clone(), columns.clone()));
                table.foreign_keys.push(IrForeignKey {
                    name: Some(name),
                    columns,
                    ref_table,
                    ref_columns: cols.iter().map(|c| text(c, "ref_col")).collect(),
                    on_delete: rule(&on_delete),
                    on_update: rule(&on_update),
                });
            }
            _ => {}
        }
    }

    // CHECK constraints exist from MySQL 8.0.16 and MariaDB 10.2; older servers do not have the view.
    let checks = rows(
        driver,
        &format!(
            "SELECT tc.table_schema AS s, tc.table_name AS t, cc.constraint_name AS name, cc.check_clause AS clause
             FROM information_schema.check_constraints cc
             JOIN information_schema.table_constraints tc ON tc.constraint_schema = cc.constraint_schema AND tc.constraint_name = cc.constraint_name AND tc.constraint_type = 'CHECK'
             WHERE cc.constraint_schema IN ({list})"
        ),
    )
    .await
    .unwrap_or_default();
    let charset = Regex::new(r"_[a-z0-9]+'").unwrap();
    for c in checks {
        let key = (text(&c, "s"), text(&c, "t"));
        let Some(table) = built.get_mut(&key) else { continue };
        // MySQL writes `col` with backquotes and charset prefixes like _utf8mb4'a'; drop both.
        let clause = text(&c, "clause").replace('`', "");
        let clause = charset.replace_all(&clause, "'").to_string();
        // MariaDB adds the NOT NULL of an ENUM-like check by itself (json_valid and the like): skip those.
        if clause.starts_with("json_valid(") {
            continue;
        }
        table.checks.push(IrCheck {
            name: opt(&c, "name"),
            expression: simplify_check(&clause),
        });
    }

    // Indexes: everything but the primary key, the ones behind unique constraints and the ones MySQL makes for FKs.
    let mut indexes: Vec<((String, String), String, IrIndex)> = Vec::new();
    for i in rows(
        driver,
        &format!(
            "SELECT table_schema AS s, table_name AS t, index_name AS name, non_unique AS non_unique, column_name AS col, collation AS coll,
                    index_type AS method, sub_part AS sub_part
             FROM information_schema.statistics WHERE table_schema IN ({list}) ORDER BY table_schema, table_name, index_name, seq_in_index"
        ),
    )
    .await?
    {
        let key = (text(&i, "s"), text(&i, "t"));
        let name = text(&i, "name");
        if name == "PRIMARY" {
            continue;
        }
        let entry = match indexes.iter_mut().find(|(k, n, _)| *k == key && *n == name) {
            Some((_, _, index)) => index,
            None => {
                let method = text(&i, "method");
                indexes.push((
                    key.clone(),
                    name.clone(),
                    IrIndex {
                        name: Some(name.clone()),
                        columns: Vec::new(),
                        unique: text(&i, "non_unique") == "0",
                        predicate: None,
                        method: (method != "BTREE").then_some(method),
                    },
                ));
                &mut indexes.last_mut().unwrap().2
            }
        };
        match opt(&i, "col") {
            Some(col) => entry.columns.push(IrIndexColumn {
                name: col,
                order: if text(&i, "coll") == "D" { "DESC" } else { "ASC" },
            }),
            // A functional index (MySQL 8) has no column.
            None => entry.method = Some("expression".into()),
        }
    }
    for (key, name, index) in indexes {
        let Some(table) = built.get_mut(&key) else { continue };
        if index.method.as_deref() == Some("expression") {
            ir.skipped.push(format!("INDEX {name} (expression)"));
            continue;
        }
        let columns: Vec<String> = index.columns.iter().map(|c| c.name.clone()).collect();
        let backs_unique = table.uniques.iter().any(|u| u.name.as_deref() == Some(name.as_str()));
        let backs_fk = fk_names.iter().any(|(k, n, cols)| *k == key && (*n == name || *cols == columns));
        if backs_unique || (backs_fk && !index.unique) {
            continue;
        }
        table.indexes.push(index);
    }

    for source in &mut sources {
        let key = (source.schema.clone(), source.table.clone());
        source.key = built.get(&key).and_then(|t| t.pk.as_ref()).map(|pk| pk.columns.clone()).unwrap_or_default();
    }
    ir.tables = order.iter().filter_map(|key| built.remove(key)).collect();
    Ok(SchemaRead { ir, sources })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_enum_values_and_defaults() {
        assert_eq!(enum_values("enum('nuevo','it''s')"), ["nuevo", "it's"]);
        assert_eq!(default_value(Some("activo".into()), "varchar", "", false), Some("'activo'".into()));
        assert_eq!(default_value(Some("0".into()), "int", "", false), Some("0".into()));
        assert_eq!(
            default_value(Some("CURRENT_TIMESTAMP".into()), "timestamp", "DEFAULT_GENERATED", false),
            Some("CURRENT_TIMESTAMP".into())
        );
        assert_eq!(default_value(Some("'activo'".into()), "varchar", "", true), Some("'activo'".into()));
        assert_eq!(default_value(Some("NULL".into()), "varchar", "", true), None);
    }
}
