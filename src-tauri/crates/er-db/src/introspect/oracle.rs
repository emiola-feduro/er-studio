//! Oracle: the schema from the ALL_* dictionary views, so it works with the privileges of any user.
//! Every alias is quoted in lowercase, because Oracle folds unquoted aliases to uppercase.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;

use super::{in_list, opt, quote_literal, rows, text, SchemaInfo, SchemaRead, TableSource};
use crate::driver::Driver;
use crate::error::Result;
use crate::ir::{Ir, IrCheck, IrColumn, IrForeignKey, IrIndex, IrIndexColumn, IrKey, IrTable};

/// Tables Oracle creates for its own features (recycle bin, materialized view logs, text indexes).
const NOT_SYSTEM_TABLE: &str = "t.nested = 'NO' AND t.secondary = 'N' AND t.dropped = 'NO' AND (t.iot_type IS NULL OR t.iot_type = 'IOT')
     AND t.table_name NOT LIKE 'BIN$%' AND t.table_name NOT LIKE 'MLOG$\\_%' ESCAPE '\\' AND t.table_name NOT LIKE 'RUPD$\\_%' ESCAPE '\\'
     AND t.table_name NOT LIKE 'DR$%'";

pub async fn list_schemas(driver: &Driver) -> Result<Vec<SchemaInfo>> {
    let found = rows(
        driver,
        &format!(
            "SELECT u.username AS \"name\", (SELECT COUNT(*) FROM all_tables t WHERE t.owner = u.username AND {NOT_SYSTEM_TABLE}) AS \"tables\"
             FROM all_users u WHERE u.oracle_maintained = 'N'
             ORDER BY CASE WHEN u.username = USER THEN 0 ELSE 1 END, u.username"
        ),
    )
    .await?;
    Ok(found
        .iter()
        .map(|r| SchemaInfo {
            name: text(r, "name"),
            tables: text(r, "tables").parse().unwrap_or(0),
        })
        // Users without tables only clutter the list on a shared database; the current one always shows.
        .enumerate()
        .filter(|(i, s)| *i == 0 || s.tables > 0)
        .map(|(_, s)| s)
        .collect())
}

/// The type of a column as the importer reads it, from the parts ALL_TAB_COLS gives.
pub fn column_type(data_type: &str, chars: Option<i64>, bytes: Option<i64>, precision: Option<i64>, scale: Option<i64>) -> (String, Vec<String>) {
    static PARAMS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\(\d+\)").unwrap());
    let base = PARAMS.replace_all(data_type, "").split_whitespace().collect::<Vec<_>>().join(" ").to_uppercase();
    let declared = PARAMS.find(data_type).map(|m| m.as_str().trim_matches(|c| c == '(' || c == ')').to_string());
    match base.as_str() {
        "VARCHAR2" | "NVARCHAR2" | "CHAR" | "NCHAR" => (base, chars.filter(|n| *n > 0).map(|n| vec![n.to_string()]).unwrap_or_default()),
        "RAW" => (base, bytes.map(|n| vec![n.to_string()]).unwrap_or_default()),
        "NUMBER" => match (precision, scale) {
            (None, Some(0)) => ("INTEGER".into(), Vec::new()),
            (None, _) => (base, Vec::new()),
            (Some(p), s) => (base, vec![p.to_string(), s.unwrap_or(0).to_string()]),
        },
        "FLOAT" => (base, precision.filter(|p| *p != 126).map(|p| vec![p.to_string()]).unwrap_or_default()),
        b if b.starts_with("TIMESTAMP") => (base, declared.filter(|p| p != "6").map(|p| vec![p]).unwrap_or_default()),
        _ => (base, Vec::new()),
    }
}

/// `"ESTADO" IN ('A','B')` reads as `ESTADO IN ('A','B')`; quotes stay only where a name needs them.
pub fn simplify_condition(condition: &str) -> String {
    static NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#""([A-Z][A-Z0-9_$#]*)""#).unwrap());
    let mut out = String::new();
    // Leave string literals alone.
    for (i, part) in condition.trim().split('\'').enumerate() {
        if i > 0 {
            out.push('\'');
        }
        if i % 2 == 0 {
            out.push_str(&NAME.replace_all(part, "$1"));
        } else {
            out.push_str(part);
        }
    }
    out
}

/// The NOT NULL of a column is a check constraint in Oracle; the column already says it.
pub fn is_not_null_check(condition: &str) -> bool {
    static NOT_NULL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)^\s*"?[A-Za-z0-9_$# ]+"?\s+IS\s+NOT\s+NULL\s*$"#).unwrap());
    NOT_NULL.is_match(condition)
}

/// A default as written, without the trailing spaces Oracle keeps.
fn default_of(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty() && !v.eq_ignore_ascii_case("NULL"))
}

fn number(row: &super::Row, key: &str) -> Option<i64> {
    opt(row, key).and_then(|v| v.parse().ok())
}

pub async fn read_schema(driver: &Driver, schemas: &[String]) -> Result<SchemaRead> {
    let list = in_list(schemas.iter().map(|s| quote_literal(s)));
    let mut ir = Ir {
        dialect: "oracle",
        ..Default::default()
    };
    ir.database_name = rows(driver, "SELECT SYS_CONTEXT('USERENV', 'DB_NAME') AS \"db\" FROM dual")
        .await?
        .first()
        .and_then(|r| opt(r, "db"));

    for view in rows(driver, &format!("SELECT owner AS \"s\", view_name AS \"name\" FROM all_views WHERE owner IN ({list}) ORDER BY owner, view_name")).await? {
        ir.skipped.push(format!("VIEW {}", text(&view, "name")));
    }
    let mviews: HashSet<(String, String)> = rows(
        driver,
        &format!("SELECT owner AS \"s\", mview_name AS \"name\" FROM all_mviews WHERE owner IN ({list})"),
    )
    .await?
    .iter()
    .map(|r| (text(r, "s"), text(r, "name")))
    .collect();
    for (_, name) in &mviews {
        ir.skipped.push(format!("MATERIALIZED VIEW {name}"));
    }

    let tables: Vec<(String, String)> = rows(
        driver,
        &format!("SELECT t.owner AS \"s\", t.table_name AS \"t\" FROM all_tables t WHERE t.owner IN ({list}) AND {NOT_SYSTEM_TABLE} ORDER BY t.owner, t.table_name"),
    )
    .await?
    .iter()
    .map(|r| (text(r, "s"), text(r, "t")))
    .filter(|key| !mviews.contains(key))
    .collect();
    let mut repeated: HashMap<String, u32> = HashMap::new();
    for (_, table) in &tables {
        *repeated.entry(table.to_lowercase()).or_default() += 1;
    }
    let mut names: HashMap<(String, String), String> = HashMap::new();
    let mut sources = Vec::new();
    let mut built: HashMap<(String, String), IrTable> = HashMap::new();
    for (schema, table) in &tables {
        let name = if repeated[&table.to_lowercase()] > 1 {
            format!("{schema}_{table}")
        } else {
            table.clone()
        };
        names.insert((schema.clone(), table.clone()), name.clone());
        built.insert(
            (schema.clone(), table.clone()),
            IrTable {
                name: name.clone(),
                ..Default::default()
            },
        );
        sources.push(TableSource {
            name,
            schema: schema.clone(),
            table: table.clone(),
            key: Vec::new(),
        });
    }

    for c in rows(
        driver,
        &format!(
            "SELECT c.owner AS \"s\", c.table_name AS \"t\", c.column_name AS \"name\", c.data_type AS \"type\", c.char_length AS \"chars\",
                    c.data_length AS \"bytes\", c.data_precision AS \"prec\", c.data_scale AS \"scale\", c.nullable AS \"nullable\",
                    c.data_default AS \"default_value\", c.identity_column AS \"is_identity\", c.virtual_column AS \"is_virtual\"
             FROM all_tab_cols c WHERE c.owner IN ({list}) AND c.hidden_column = 'NO' ORDER BY c.owner, c.table_name, c.column_id"
        ),
    )
    .await?
    {
        let Some(table) = built.get_mut(&(text(&c, "s"), text(&c, "t"))) else { continue };
        let name = text(&c, "name");
        let default_value = default_of(opt(&c, "default_value"));
        if text(&c, "is_virtual") == "YES" {
            ir.skipped.push(format!("{}.{name} AS ({})", table.name, simplify_condition(&default_value.unwrap_or_default())));
            continue;
        }
        let identity = text(&c, "is_identity") == "YES";
        let (kind, params) = column_type(&text(&c, "type"), number(&c, "chars"), number(&c, "bytes"), number(&c, "prec"), number(&c, "scale"));
        table.columns.push(IrColumn {
            name,
            kind,
            params,
            not_null: text(&c, "nullable") == "N",
            auto_increment: identity,
            // An identity column's default is its hidden sequence.
            default_value: if identity { None } else { default_value },
            ..Default::default()
        });
    }

    // Constraint columns, in key order.
    let mut constraint_columns: HashMap<(String, String), Vec<String>> = HashMap::new();
    for cc in rows(
        driver,
        &format!(
            "SELECT owner AS \"s\", constraint_name AS \"name\", column_name AS \"col\" FROM all_cons_columns
             WHERE owner IN ({list}) ORDER BY owner, constraint_name, position"
        ),
    )
    .await?
    {
        constraint_columns.entry((text(&cc, "s"), text(&cc, "name"))).or_default().push(text(&cc, "col"));
    }
    let constraints = rows(
        driver,
        &format!(
            "SELECT owner AS \"s\", table_name AS \"t\", constraint_name AS \"name\", constraint_type AS \"kind\", r_owner AS \"r_owner\",
                    r_constraint_name AS \"r_name\", delete_rule AS \"on_delete\", search_condition AS \"condition\", generated AS \"generated\",
                    index_owner AS \"index_owner\", index_name AS \"index_name\"
             FROM all_constraints WHERE owner IN ({list}) AND constraint_type IN ('P', 'U', 'R', 'C') AND table_name NOT LIKE 'BIN$%'
             ORDER BY owner, table_name, constraint_name"
        ),
    )
    .await?;
    // Primary and unique keys, by owner and name, to find what a foreign key points to.
    let mut keys: HashMap<(String, String), (String, String)> = HashMap::new();
    let mut constraint_indexes: HashSet<(String, String)> = HashSet::new();
    for k in &constraints {
        let kind = text(k, "kind");
        if kind == "P" || kind == "U" {
            keys.insert((text(k, "s"), text(k, "name")), (text(k, "s"), text(k, "t")));
            if let Some(index) = opt(k, "index_name") {
                constraint_indexes.insert((opt(k, "index_owner").unwrap_or_else(|| text(k, "s")), index));
            }
        }
    }
    for k in &constraints {
        let owner = text(k, "s");
        let table_key = (owner.clone(), text(k, "t"));
        let name = text(k, "name");
        let columns = constraint_columns.get(&(owner.clone(), name.clone())).cloned().unwrap_or_default();
        let Some(table) = built.get_mut(&table_key) else { continue };
        // Names Oracle generates (SYS_C0012345) are left out, so the model names them its own way.
        let given = (text(k, "generated") != "GENERATED NAME").then(|| name.clone());
        match text(k, "kind").as_str() {
            "P" => {
                if let [only] = columns.as_slice() {
                    if let Some(column) = table.columns.iter_mut().find(|c| &c.name == only) {
                        column.pk = true;
                    }
                }
                table.pk = Some(IrKey { name: given, columns });
            }
            "U" => table.uniques.push(IrKey { name: given, columns }),
            "C" => {
                let condition = text(k, "condition");
                if !condition.trim().is_empty() && !is_not_null_check(&condition) {
                    table.checks.push(IrCheck {
                        name: given,
                        expression: simplify_condition(&condition),
                    });
                }
            }
            "R" => {
                let target = (text(k, "r_owner"), text(k, "r_name"));
                let referenced = keys.get(&target).and_then(|t| names.get(t).cloned());
                let Some(ref_table) = referenced else {
                    ir.skipped.push(format!("FOREIGN KEY {name} → table outside the chosen schemas"));
                    continue;
                };
                let ref_columns = constraint_columns.get(&target).cloned().unwrap_or_default();
                let on_delete = match text(k, "on_delete").as_str() {
                    "CASCADE" => "CASCADE",
                    "SET NULL" => "SET NULL",
                    _ => "NO ACTION",
                };
                table.foreign_keys.push(IrForeignKey {
                    name: given,
                    columns,
                    ref_table,
                    ref_columns,
                    on_delete: on_delete.into(),
                    on_update: "NO ACTION".into(),
                });
            }
            _ => {}
        }
    }

    // A NUMBER without precision holds any number; as a key (identity, primary or foreign) it is an
    // integer, and the model says so instead of giving it the default NUMBER(10,2).
    for table in built.values_mut() {
        let mut keys: HashSet<String> = table.pk.iter().flat_map(|pk| pk.columns.clone()).collect();
        keys.extend(table.foreign_keys.iter().flat_map(|fk| fk.columns.clone()));
        for column in &mut table.columns {
            if column.kind == "NUMBER" && column.params.is_empty() && (column.auto_increment || keys.contains(&column.name)) {
                column.kind = "INTEGER".into();
            }
        }
    }

    // Indexes, without the ones that back a key. A DESC column shows as a hidden SYS_NC column whose
    // expression is the quoted column name.
    let mut expressions: HashMap<(String, String, String), String> = HashMap::new();
    for e in rows(
        driver,
        &format!(
            "SELECT index_owner AS \"io\", index_name AS \"name\", column_position AS \"pos\", column_expression AS \"expr\"
             FROM all_ind_expressions WHERE table_owner IN ({list})"
        ),
    )
    .await?
    {
        expressions.insert((text(&e, "io"), text(&e, "name"), text(&e, "pos")), text(&e, "expr"));
    }
    // Per index: (column, ASC or DESC, position).
    type IndexColumns = Vec<(String, String, String)>;
    let mut index_columns: HashMap<(String, String), IndexColumns> = HashMap::new();
    for ic in rows(
        driver,
        &format!(
            "SELECT index_owner AS \"io\", index_name AS \"name\", column_name AS \"col\", descend AS \"descend\", column_position AS \"pos\"
             FROM all_ind_columns WHERE table_owner IN ({list}) ORDER BY index_owner, index_name, column_position"
        ),
    )
    .await?
    {
        index_columns
            .entry((text(&ic, "io"), text(&ic, "name")))
            .or_default()
            .push((text(&ic, "col"), text(&ic, "descend"), text(&ic, "pos")));
    }
    static QUOTED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"^"([^"]+)"$"#).unwrap());
    for i in rows(
        driver,
        &format!(
            "SELECT owner AS \"io\", index_name AS \"name\", table_owner AS \"s\", table_name AS \"t\", uniqueness AS \"uniq\", index_type AS \"type\"
             FROM all_indexes WHERE table_owner IN ({list}) AND index_type IN ('NORMAL', 'NORMAL/REV', 'BITMAP', 'FUNCTION-BASED NORMAL', 'FUNCTION-BASED BITMAP')
             ORDER BY owner, index_name"
        ),
    )
    .await?
    {
        let index_key = (text(&i, "io"), text(&i, "name"));
        if constraint_indexes.contains(&index_key) {
            continue;
        }
        let Some(table) = built.get_mut(&(text(&i, "s"), text(&i, "t"))) else { continue };
        let mut columns = Vec::new();
        let mut expression = None;
        for (column, descend, position) in index_columns.get(&index_key).cloned().unwrap_or_default() {
            let order = if descend == "DESC" { "DESC" } else { "ASC" };
            let name = match expressions.get(&(index_key.0.clone(), index_key.1.clone(), position)) {
                Some(expr) => match QUOTED.captures(expr.trim()) {
                    Some(m) => m[1].to_string(),
                    None => {
                        expression = Some(expr.trim().to_string());
                        break;
                    }
                },
                None => column,
            };
            columns.push(IrIndexColumn { name, order });
        }
        if let Some(expression) = expression {
            ir.skipped.push(format!("INDEX {} ({})", index_key.1, simplify_condition(&expression)));
            continue;
        }
        table.indexes.push(IrIndex {
            name: Some(index_key.1.clone()),
            columns,
            unique: text(&i, "uniq") == "UNIQUE",
            predicate: None,
            method: text(&i, "type").contains("BITMAP").then(|| "BITMAP".to_string()),
        });
    }

    for source in &mut sources {
        source.key = built
            .get(&(source.schema.clone(), source.table.clone()))
            .and_then(|t| t.pk.as_ref())
            .map(|pk| pk.columns.clone())
            .unwrap_or_default();
    }
    ir.tables = tables.iter().filter_map(|key| built.remove(key)).collect();
    Ok(SchemaRead { ir, sources })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_column_types() {
        assert_eq!(column_type("VARCHAR2", Some(80), Some(320), None, None), ("VARCHAR2".into(), vec!["80".into()]));
        assert_eq!(column_type("NUMBER", None, Some(22), None, Some(0)), ("INTEGER".into(), vec![]));
        assert_eq!(column_type("NUMBER", None, Some(22), None, None), ("NUMBER".into(), vec![]));
        assert_eq!(column_type("NUMBER", None, Some(22), Some(10), Some(2)), ("NUMBER".into(), vec!["10".into(), "2".into()]));
        assert_eq!(column_type("NUMBER", None, Some(22), Some(5), Some(0)), ("NUMBER".into(), vec!["5".into(), "0".into()]));
        assert_eq!(column_type("TIMESTAMP(6)", None, Some(11), None, Some(6)), ("TIMESTAMP".into(), vec![]));
        assert_eq!(column_type("TIMESTAMP(3) WITH TIME ZONE", None, Some(13), None, Some(3)), ("TIMESTAMP WITH TIME ZONE".into(), vec!["3".into()]));
        assert_eq!(column_type("INTERVAL DAY(2) TO SECOND(6)", None, Some(11), Some(2), Some(6)), ("INTERVAL DAY TO SECOND".into(), vec![]));
        assert_eq!(column_type("RAW", None, Some(16), None, None), ("RAW".into(), vec!["16".into()]));
        assert_eq!(column_type("FLOAT", None, Some(22), Some(126), None), ("FLOAT".into(), vec![]));
        assert_eq!(column_type("DATE", None, Some(7), None, None), ("DATE".into(), vec![]));
    }

    #[test]
    fn simplifies_conditions() {
        assert_eq!(simplify_condition("\"ESTADO\" IN ('ACTIVO','BAJA')"), "ESTADO IN ('ACTIVO','BAJA')");
        assert_eq!(simplify_condition("\"precio\" >= 0"), "\"precio\" >= 0");
        assert_eq!(simplify_condition("NOTA = '\"X\"'"), "NOTA = '\"X\"'");
        assert!(is_not_null_check("\"NOMBRE\" IS NOT NULL"));
        assert!(!is_not_null_check("\"NOMBRE\" IS NOT NULL AND LENGTH(\"NOMBRE\") > 1"));
    }

    #[test]
    fn trims_defaults() {
        assert_eq!(default_of(Some("SYSDATE  \n".into())), Some("SYSDATE".into()));
        assert_eq!(default_of(Some("NULL ".into())), None);
        assert_eq!(default_of(None), None);
    }
}
