//! Reads a live schema into the importer's intermediate representation, one module per engine. Every
//! catalog query is plain SQL with literals built here (numbers and quoted names only) and comes back as
//! text, so no parameter lists are involved.

use std::collections::HashMap;
use std::sync::LazyLock;

use crate::config::Engine;
use crate::driver::Driver;
use crate::error::Result;
use crate::ir::Ir;
use regex::Regex;
use serde::Serialize;

mod mysql;
mod postgres;
mod sqlserver;

pub(crate) type Row = HashMap<String, Option<String>>;

pub(crate) async fn rows(driver: &Driver, sql: &str) -> Result<Vec<Row>> {
    let output = driver.run(sql, usize::MAX).await?;
    Ok(output
        .rows
        .into_iter()
        .map(|values| output.columns.iter().cloned().zip(values).collect())
        .collect())
}

pub(crate) fn text(row: &Row, key: &str) -> String {
    row.get(key).cloned().flatten().unwrap_or_default()
}

pub(crate) fn opt(row: &Row, key: &str) -> Option<String> {
    row.get(key).cloned().flatten().filter(|s| !s.is_empty())
}

pub(crate) fn flag(row: &Row, key: &str) -> bool {
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
pub(crate) fn numbers(value: &str) -> Vec<i64> {
    value
        .trim_matches(|c| c == '{' || c == '}')
        .split([',', ' '])
        .filter_map(|n| n.trim().parse().ok())
        .collect()
}

pub(crate) fn in_list(values: impl IntoIterator<Item = String>) -> String {
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

pub(crate) fn wraps_whole(expression: &str) -> bool {
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

pub(crate) fn action(code: &str) -> String {
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

pub async fn list_schemas(driver: &Driver) -> Result<Vec<SchemaInfo>> {
    match driver.engine() {
        Engine::Postgres => postgres::list_schemas(driver).await,
        Engine::Mysql => mysql::list_schemas(driver).await,
        Engine::SqlServer => sqlserver::list_schemas(driver).await,
        Engine::Sqlite => Ok(vec![SchemaInfo {
            name: "main".into(),
            tables: 0,
        }]),
    }
}

pub async fn read_schema(driver: &Driver, schemas: &[String]) -> Result<SchemaRead> {
    match driver.engine() {
        Engine::Postgres => postgres::read_schema(driver, schemas).await,
        Engine::Mysql => mysql::read_schema(driver, schemas).await,
        Engine::SqlServer => sqlserver::read_schema(driver, schemas).await,
        Engine::Sqlite => Err(crate::error::Error::Database {
            message: "a SQLite file is read by the interface".into(),
            sql_state: None,
        }),
    }
}

/// One page of a table's rows, every value as text (NULL as None).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RowsPage {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Option<String>>>,
}

/// `name` quoted the way the engine quotes identifiers.
pub fn quote_name(engine: Engine, name: &str) -> String {
    match engine {
        Engine::Mysql => format!("`{}`", name.replace('`', "``")),
        Engine::SqlServer => format!("[{}]", name.replace(']', "]]")),
        Engine::Postgres | Engine::Sqlite => quote_ident(name),
    }
}

pub async fn read_rows(driver: &Driver, schema: &str, table: &str, order_by: &[String], offset: u64, limit: u64) -> Result<RowsPage> {
    let engine = driver.engine();
    let q = |name: &str| quote_name(engine, name);
    let from = if engine == Engine::Sqlite {
        q(table)
    } else {
        format!("{}.{}", q(schema), q(table))
    };
    let order = order_by.iter().map(|c| q(c)).collect::<Vec<_>>().join(", ");
    let sql = match engine {
        // SQL Server pages with OFFSET ... FETCH, which needs an ORDER BY.
        Engine::SqlServer => format!(
            "SELECT * FROM {from} ORDER BY {} OFFSET {offset} ROWS FETCH NEXT {limit} ROWS ONLY",
            if order.is_empty() { "(SELECT NULL)".to_string() } else { order }
        ),
        _ => {
            let order = if order.is_empty() { String::new() } else { format!(" ORDER BY {order}") };
            format!("SELECT * FROM {from}{order} LIMIT {limit} OFFSET {offset}")
        }
    };
    let output = driver.run(&sql, usize::MAX).await?;
    Ok(RowsPage {
        columns: output.columns,
        rows: output.rows,
    })
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
