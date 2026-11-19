//! Reads a PostgreSQL schema from the catalog (pg_catalog) into the intermediate representation.
//! Every query goes through simple_query with literals built here (numbers and quoted names only), so
//! no parameter lists are involved and the results come back as text.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;
use tokio_postgres::{Client, SimpleQueryMessage};

use crate::error::{database, Result};
use crate::ir::{Ir, IrCheck, IrColumn, IrForeignKey, IrIndex, IrIndexColumn, IrKey, IrTable};

type Row = HashMap<String, Option<String>>;

pub(crate) async fn rows(client: &Client, sql: &str) -> Result<Vec<Row>> {
    let messages = client.simple_query(sql).await.map_err(database)?;
    Ok(messages
        .into_iter()
        .filter_map(|message| match message {
            SimpleQueryMessage::Row(row) => Some(
                row.columns()
                    .iter()
                    .enumerate()
                    .map(|(i, column)| (column.name().to_string(), row.get(i).map(str::to_string)))
                    .collect(),
            ),
            _ => None,
        })
        .collect())
}

fn text(row: &Row, key: &str) -> String {
    row.get(key).cloned().flatten().unwrap_or_default()
}

fn opt(row: &Row, key: &str) -> Option<String> {
    row.get(key).cloned().flatten().filter(|s| !s.is_empty())
}

fn flag(row: &Row, key: &str) -> bool {
    text(row, key) == "t"
}

/// 'it''s' for a string literal.
pub fn quote_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// "My Table" for an identifier.
pub fn quote_ident(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

/// "{1,2}" (an array) or "1 2" (an int2vector) as numbers.
fn numbers(value: &str) -> Vec<i64> {
    value
        .trim_matches(|c| c == '{' || c == '}')
        .split([',', ' '])
        .filter_map(|n| n.trim().parse().ok())
        .collect()
}

fn in_list(values: impl IntoIterator<Item = String>) -> String {
    let list: Vec<String> = values.into_iter().collect();
    if list.is_empty() {
        "NULL".into()
    } else {
        list.join(", ")
    }
}

/// "character varying(80)" → (CHARACTER VARYING, [80]); "timestamp(3) with time zone" → (TIMESTAMP WITH TIME ZONE, [3]).
pub fn split_type(formatted: &str) -> (String, Vec<String>) {
    static PARAMS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\(([^)]*)\)").unwrap());
    let params = PARAMS
        .captures(formatted)
        .map(|c| c[1].split(',').map(|p| p.trim().to_string()).collect())
        .unwrap_or_default();
    let name = PARAMS.replace(formatted, "").split_whitespace().collect::<Vec<_>>().join(" ").to_uppercase();
    (name, params)
}

/// pg_get_constraintdef gives "CHECK ((precio >= (0)::numeric))" and writes IN lists as
/// "((estado)::text = ANY ((ARRAY['a'::character varying, ...])::text[]))". This returns "estado IN ('a', ...)"
/// for the second form, and the bare expression otherwise.
pub fn simplify_check(definition: &str) -> String {
    static ANY: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^\(*([A-Za-z_][A-Za-z0-9_]*|\x22[^\x22]+\x22)\)*(?:::[a-z ]+)?\s*=\s*ANY\s*\(+ARRAY\[(.*)\]\)*(?:::[a-z ]+\[\])?\)*$").unwrap()
    });
    static LITERAL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"'((?:[^']|'')*)'(?:::[a-z ]+)?").unwrap());
    let mut expression = definition
        .trim()
        .trim_start_matches("CHECK")
        .trim()
        .trim_end_matches("NOT VALID")
        .trim()
        .to_string();
    // Drop the parentheses that wrap the whole expression.
    while expression.starts_with('(') && expression.ends_with(')') && wraps_whole(&expression) {
        expression = expression[1..expression.len() - 1].trim().to_string();
    }
    if let Some(captures) = ANY.captures(&expression) {
        let values: Vec<String> = LITERAL.captures_iter(&captures[2]).map(|c| format!("'{}'", &c[1])).collect();
        if !values.is_empty() {
            return format!("{} IN ({})", &captures[1], values.join(", "));
        }
    }
    expression
}

fn wraps_whole(expression: &str) -> bool {
    let mut depth = 0;
    let mut quoted = false;
    for (i, c) in expression.char_indices() {
        match c {
            '\'' => quoted = !quoted,
            '(' if !quoted => depth += 1,
            ')' if !quoted => {
                depth -= 1;
                if depth == 0 && i < expression.len() - 1 {
                    return false;
                }
            }
            _ => {}
        }
    }
    depth == 0
}

fn action(code: &str) -> String {
    match code {
        "r" => "RESTRICT",
        "c" => "CASCADE",
        "n" => "SET NULL",
        "d" => "SET DEFAULT",
        _ => "NO ACTION",
    }
    .into()
}

/// Where each table of the IR comes from, so its rows can be read later.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSource {
    /// Name in the IR (the table name, or schema_table when two schemas share it).
    pub name: String,
    pub schema: String,
    pub table: String,
    /// Primary key columns, to read the rows in a stable order.
    pub key: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaRead {
    pub ir: Ir,
    pub sources: Vec<TableSource>,
}

/// Schemas a person can choose from: everything but the system ones, with how many tables each has.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaInfo {
    pub name: String,
    pub tables: u32,
}

pub async fn list_schemas(client: &Client) -> Result<Vec<SchemaInfo>> {
    let found = rows(
        client,
        "SELECT n.nspname AS name, count(c.oid) FILTER (WHERE c.relkind IN ('r', 'p')) AS tables
         FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace = n.oid
         WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_toast%' AND n.nspname NOT LIKE 'pg\\_temp%'
         GROUP BY n.nspname ORDER BY n.nspname",
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

pub async fn read_schema(client: &Client, schemas: &[String]) -> Result<SchemaRead> {
    let schema_list = in_list(schemas.iter().map(|s| quote_literal(s)));
    let mut ir = Ir {
        dialect: "postgresql",
        ..Default::default()
    };
    ir.database_name = rows(client, "SELECT current_database() AS db").await?.first().and_then(|r| opt(r, "db"));

    // Tables (partitioned parents included, partitions left out).
    let tables = rows(
        client,
        &format!(
            "SELECT c.oid, n.nspname AS schema, c.relname AS name
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition AND n.nspname IN ({schema_list})
             ORDER BY n.nspname, c.relname"
        ),
    )
    .await?;
    let mut repeated: HashMap<String, u32> = HashMap::new();
    for t in &tables {
        *repeated.entry(text(t, "name").to_lowercase()).or_default() += 1;
    }
    let mut names: HashMap<String, String> = HashMap::new(); // oid → IR name
    let mut order = Vec::new();
    let mut sources = Vec::new();
    for t in &tables {
        let (oid, schema, name) = (text(t, "oid"), text(t, "schema"), text(t, "name"));
        let ir_name = if repeated[&name.to_lowercase()] > 1 {
            format!("{schema}_{name}")
        } else {
            name.clone()
        };
        names.insert(oid.clone(), ir_name.clone());
        order.push(oid);
        sources.push(TableSource {
            name: ir_name,
            schema,
            table: name,
            key: Vec::new(),
        });
    }
    let oids = in_list(order.iter().cloned());

    // Views and other relations do not become tables; say so.
    for other in rows(
        client,
        &format!(
            "SELECT c.relname AS name, c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('v', 'm', 'f') AND n.nspname IN ({schema_list}) ORDER BY c.relname"
        ),
    )
    .await?
    {
        let kind = match text(&other, "kind").as_str() {
            "v" => "VIEW",
            "m" => "MATERIALIZED VIEW",
            _ => "FOREIGN TABLE",
        };
        ir.skipped.push(format!("{kind} {}", text(&other, "name")));
    }

    // Enum labels by type.
    let mut enums: HashMap<String, Vec<String>> = HashMap::new();
    for e in rows(
        client,
        "SELECT enumtypid AS oid, enumlabel AS label FROM pg_enum ORDER BY enumtypid, enumsortorder",
    )
    .await?
    {
        enums.entry(text(&e, "oid")).or_default().push(text(&e, "label"));
    }

    // Columns. to_jsonb(a) reads attidentity and attgenerated without failing on servers that lack them.
    let mut columns: HashMap<String, Vec<(i64, IrColumn)>> = HashMap::new();
    for c in rows(
        client,
        &format!(
            "SELECT a.attrelid AS rel, a.attnum AS num, a.attname AS name, a.attnotnull AS not_null,
                    CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype, t.typtypmod) ELSE format_type(a.atttypid, a.atttypmod) END AS type,
                    t.typtype AS typtype, t.oid AS type_oid, pg_get_expr(d.adbin, d.adrelid) AS default_value,
                    to_jsonb(a) ->> 'attidentity' AS identity, to_jsonb(a) ->> 'attgenerated' AS generated
             FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
             LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
             WHERE a.attrelid IN ({oids}) AND a.attnum > 0 AND NOT a.attisdropped
             ORDER BY a.attrelid, a.attnum"
        ),
    )
    .await?
    {
        let rel = text(&c, "rel");
        let name = text(&c, "name");
        let (mut kind, params) = split_type(&text(&c, "type"));
        let default = opt(&c, "default_value");
        let identity = opt(&c, "identity").is_some_and(|i| i == "a" || i == "d");
        let serial = default.as_deref().is_some_and(|d| d.starts_with("nextval("));
        // A generated column keeps its expression where a default would be; the model has no such column, so it
        // comes in as a plain one and the note shows what is not kept.
        let generated = opt(&c, "generated").is_some_and(|g| g == "s");
        if generated {
            let table = names.get(&rel).cloned().unwrap_or_default();
            ir.skipped
                .push(format!("{table}.{name} GENERATED ALWAYS AS ({}) STORED", default.clone().unwrap_or_default()));
        }
        let enum_values = (text(&c, "typtype") == "e").then(|| enums.get(&text(&c, "type_oid")).cloned().unwrap_or_default());
        if enum_values.is_some() {
            kind = "ENUM".into();
        }
        let column = IrColumn {
            name,
            kind,
            params,
            not_null: flag(&c, "not_null"),
            auto_increment: identity || serial,
            default_value: if serial || generated { None } else { default },
            enum_values,
            ..Default::default()
        };
        columns.entry(rel).or_default().push((text(&c, "num").parse().unwrap_or(0), column));
    }
    let column_name = |rel: &str, num: i64| {
        columns
            .get(rel)
            .and_then(|cols| cols.iter().find(|(n, _)| *n == num))
            .map(|(_, c)| c.name.clone())
    };

    let mut built: HashMap<String, IrTable> = order
        .iter()
        .map(|oid| {
            let table = IrTable {
                name: names[oid].clone(),
                columns: columns.get(oid).map(|cols| cols.iter().map(|(_, c)| c.clone()).collect()).unwrap_or_default(),
                ..Default::default()
            };
            (oid.clone(), table)
        })
        .collect();

    // Constraints: primary key, unique, foreign keys and checks.
    let mut constraint_indexes = HashSet::new();
    for k in rows(
        client,
        &format!(
            "SELECT conrelid AS rel, conname AS name, contype AS kind, conkey AS cols, confrelid AS ref, confkey AS ref_cols,
                    confdeltype AS on_delete, confupdtype AS on_update, conindid AS index, pg_get_constraintdef(oid) AS definition
             FROM pg_constraint WHERE conrelid IN ({oids}) AND contype IN ('p', 'u', 'f', 'c') ORDER BY conrelid, conname"
        ),
    )
    .await?
    {
        let rel = text(&k, "rel");
        let Some(table) = built.get_mut(&rel) else { continue };
        let cols: Vec<String> = numbers(&text(&k, "cols")).into_iter().filter_map(|n| column_name(&rel, n)).collect();
        let name = opt(&k, "name");
        constraint_indexes.insert(text(&k, "index"));
        match text(&k, "kind").as_str() {
            "p" => {
                if let [only] = cols.as_slice() {
                    if let Some(column) = table.columns.iter_mut().find(|c| &c.name == only) {
                        column.pk = true;
                    }
                }
                table.pk = Some(IrKey { name, columns: cols });
            }
            "u" => table.uniques.push(IrKey { name, columns: cols }),
            "c" => {
                // A NOT NULL written as a check is already in the column.
                let expression = simplify_check(&text(&k, "definition"));
                table.checks.push(IrCheck { name, expression });
            }
            "f" => {
                let reference = text(&k, "ref");
                let Some(ref_table) = names.get(&reference).cloned() else {
                    ir.skipped
                        .push(format!("FOREIGN KEY {} → table outside the chosen schemas", name.unwrap_or_default()));
                    continue;
                };
                let ref_columns = numbers(&text(&k, "ref_cols")).into_iter().filter_map(|n| column_name(&reference, n)).collect();
                table.foreign_keys.push(IrForeignKey {
                    name,
                    columns: cols,
                    ref_table,
                    ref_columns,
                    on_delete: action(&text(&k, "on_delete")),
                    on_update: action(&text(&k, "on_update")),
                });
            }
            _ => {}
        }
    }

    // Indexes that do not back a primary key or unique constraint.
    for i in rows(
        client,
        &format!(
            "SELECT i.indrelid AS rel, i.indexrelid AS oid, ci.relname AS name, i.indisunique AS is_unique, i.indkey AS cols, i.indoption AS options,
                    pg_get_expr(i.indpred, i.indrelid) AS predicate, am.amname AS method
             FROM pg_index i JOIN pg_class ci ON ci.oid = i.indexrelid JOIN pg_am am ON am.oid = ci.relam
             WHERE i.indrelid IN ({oids}) ORDER BY i.indrelid, ci.relname"
        ),
    )
    .await?
    {
        if constraint_indexes.contains(&text(&i, "oid")) {
            continue;
        }
        let rel = text(&i, "rel");
        let name = text(&i, "name");
        let nums = numbers(&text(&i, "cols"));
        let options = numbers(&text(&i, "options"));
        if nums.contains(&0) {
            ir.skipped.push(format!("INDEX {name} (expression)"));
            continue;
        }
        let Some(table) = built.get_mut(&rel) else { continue };
        let index_columns = nums
            .iter()
            .enumerate()
            .filter_map(|(position, n)| {
                column_name(&rel, *n).map(|name| IrIndexColumn {
                    name,
                    order: if options.get(position).is_some_and(|o| o & 1 == 1) { "DESC" } else { "ASC" },
                })
            })
            .collect();
        let method = opt(&i, "method").filter(|m| m != "btree");
        table.indexes.push(IrIndex {
            name: Some(name),
            columns: index_columns,
            unique: flag(&i, "is_unique"),
            predicate: opt(&i, "predicate"),
            method,
        });
    }

    for source in &mut sources {
        let oid = names.iter().find(|(_, n)| **n == source.name).map(|(o, _)| o.clone()).unwrap_or_default();
        source.key = built.get(&oid).and_then(|t| t.pk.as_ref()).map(|pk| pk.columns.clone()).unwrap_or_default();
    }
    ir.tables = order.iter().filter_map(|oid| built.remove(oid)).collect();
    Ok(SchemaRead { ir, sources })
}

/// One page of a table's rows, every value as PostgreSQL prints it (NULL as None).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RowsPage {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Option<String>>>,
}

pub async fn read_rows(client: &Client, schema: &str, table: &str, order_by: &[String], offset: u64, limit: u64) -> Result<RowsPage> {
    let order = if order_by.is_empty() {
        String::new()
    } else {
        format!(" ORDER BY {}", order_by.iter().map(|c| quote_ident(c)).collect::<Vec<_>>().join(", "))
    };
    let sql = format!(
        "SELECT * FROM {}.{}{order} LIMIT {limit} OFFSET {offset}",
        quote_ident(schema),
        quote_ident(table)
    );
    let messages = client.simple_query(&sql).await.map_err(database)?;
    let mut page = RowsPage {
        columns: Vec::new(),
        rows: Vec::new(),
    };
    for message in messages {
        match message {
            SimpleQueryMessage::RowDescription(columns) => page.columns = columns.iter().map(|c| c.name().to_string()).collect(),
            SimpleQueryMessage::Row(row) => {
                if page.columns.is_empty() {
                    page.columns = row.columns().iter().map(|c| c.name().to_string()).collect();
                }
                page.rows.push((0..row.len()).map(|i| row.get(i).map(str::to_string)).collect());
            }
            _ => {}
        }
    }
    Ok(page)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_types() {
        assert_eq!(split_type("character varying(80)"), ("CHARACTER VARYING".into(), vec!["80".into()]));
        assert_eq!(split_type("numeric(10,2)"), ("NUMERIC".into(), vec!["10".into(), "2".into()]));
        assert_eq!(split_type("timestamp(3) with time zone"), ("TIMESTAMP WITH TIME ZONE".into(), vec!["3".into()]));
        assert_eq!(split_type("integer"), ("INTEGER".into(), vec![]));
    }

    #[test]
    fn simplifies_checks() {
        assert_eq!(simplify_check("CHECK ((precio >= (0)::numeric))"), "precio >= (0)::numeric");
        assert_eq!(
            simplify_check("CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'baja'::character varying])::text[])))"),
            "estado IN ('activo', 'baja')"
        );
        assert_eq!(simplify_check("CHECK ((a > 0) AND (b > 0)) NOT VALID"), "(a > 0) AND (b > 0)");
        assert_eq!(simplify_check("CHECK ((nota = ANY (ARRAY['A'::text, 'B'::text])))"), "nota IN ('A', 'B')");
    }

    #[test]
    fn reads_arrays() {
        assert_eq!(numbers("{1,3}"), vec![1, 3]);
        assert_eq!(numbers("2 1"), vec![2, 1]);
    }
}
