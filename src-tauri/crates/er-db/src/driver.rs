//! One open database connection, whatever the engine, with the few operations the rest of the crate needs:
//! run a statement and get its rows as text, run a script, and the transaction statements of each engine.

use std::sync::Arc;

use futures_util::{StreamExt, TryStreamExt};
use serde::Serialize;
use tokio_util::compat::Compat;

use crate::config::Engine;
use crate::error::{database, Error, Result};
use crate::transport::BoxStream;

pub type SqlServerClient = tiberius::Client<Compat<BoxStream>>;

pub enum Driver {
    Postgres(tokio_postgres::Client),
    Mysql(tokio::sync::Mutex<mysql_async::Conn>),
    SqlServer(Box<tokio::sync::Mutex<SqlServerClient>>),
    Sqlite(Arc<std::sync::Mutex<rusqlite::Connection>>),
}

/// The rows of a statement, every value as text (NULL as None), or how many rows it changed.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryOutput {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Option<String>>>,
    pub rows_affected: Option<u64>,
    /// More rows came back than the limit; only the first ones are kept.
    pub truncated: bool,
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(2 + bytes.len() * 2);
    out.push_str("0x");
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

pub(crate) fn mysql_error(error: mysql_async::Error) -> Error {
    let sql_state = match &error {
        mysql_async::Error::Server(server) => Some(server.state.clone()),
        _ => None,
    };
    Error::Database {
        message: error.to_string(),
        sql_state,
    }
}

pub(crate) fn sqlserver_error(error: tiberius::error::Error) -> Error {
    let sql_state = match &error {
        tiberius::error::Error::Server(token) => Some(token.code().to_string()),
        _ => None,
    };
    Error::Database {
        message: error.to_string(),
        sql_state,
    }
}

pub(crate) fn sqlite_error(error: rusqlite::Error) -> Error {
    Error::Database {
        message: error.to_string(),
        sql_state: None,
    }
}

fn mysql_text(value: mysql_async::Value) -> Option<String> {
    use mysql_async::Value;
    match value {
        Value::NULL => None,
        // The text protocol sends every value as bytes; binary data that is not UTF-8 shows as hex.
        Value::Bytes(bytes) => Some(String::from_utf8(bytes).unwrap_or_else(|e| hex(e.as_bytes()))),
        Value::Int(n) => Some(n.to_string()),
        Value::UInt(n) => Some(n.to_string()),
        Value::Float(n) => Some(n.to_string()),
        Value::Double(n) => Some(n.to_string()),
        Value::Date(y, mo, d, h, mi, s, us) => Some(if (h, mi, s, us) == (0, 0, 0, 0) {
            format!("{y:04}-{mo:02}-{d:02}")
        } else if us == 0 {
            format!("{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}:{s:02}")
        } else {
            format!("{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}:{s:02}.{us:06}")
        }),
        Value::Time(negative, days, h, mi, s, us) => {
            let hours = days * 24 + u32::from(h);
            let sign = if negative { "-" } else { "" };
            Some(if us == 0 {
                format!("{sign}{hours:02}:{mi:02}:{s:02}")
            } else {
                format!("{sign}{hours:02}:{mi:02}:{s:02}.{us:06}")
            })
        }
    }
}

fn sqlserver_text(data: tiberius::ColumnData<'static>) -> Option<String> {
    use tiberius::{ColumnData, FromSql};
    let text = match &data {
        ColumnData::U8(v) => v.map(|n| n.to_string()),
        ColumnData::I16(v) => v.map(|n| n.to_string()),
        ColumnData::I32(v) => v.map(|n| n.to_string()),
        ColumnData::I64(v) => v.map(|n| n.to_string()),
        ColumnData::F32(v) => v.map(|n| n.to_string()),
        ColumnData::F64(v) => v.map(|n| n.to_string()),
        ColumnData::Bit(v) => v.map(|b| if b { "1".into() } else { "0".into() }),
        ColumnData::String(v) => v.as_ref().map(|s| s.to_string()),
        ColumnData::Guid(v) => v.map(|g| g.to_string()),
        ColumnData::Binary(v) => v.as_ref().map(|b| hex(b)),
        ColumnData::Numeric(v) => v.map(|n| n.to_string()),
        ColumnData::Xml(v) => v.as_ref().map(|x| x.to_string()),
        ColumnData::DateTime(_) | ColumnData::SmallDateTime(_) | ColumnData::DateTime2(_) => chrono::NaiveDateTime::from_sql(&data)
            .ok()
            .flatten()
            .map(|d| d.format("%Y-%m-%d %H:%M:%S%.f").to_string()),
        ColumnData::Date(_) => chrono::NaiveDate::from_sql(&data).ok().flatten().map(|d| d.to_string()),
        ColumnData::Time(_) => chrono::NaiveTime::from_sql(&data).ok().flatten().map(|t| t.format("%H:%M:%S%.f").to_string()),
        ColumnData::DateTimeOffset(_) => chrono::DateTime::<chrono::FixedOffset>::from_sql(&data)
            .ok()
            .flatten()
            .map(|d| d.format("%Y-%m-%d %H:%M:%S%.f%:z").to_string()),
    };
    text
}

fn sqlite_text(value: rusqlite::types::ValueRef<'_>) -> Option<String> {
    use rusqlite::types::ValueRef;
    match value {
        ValueRef::Null => None,
        ValueRef::Integer(n) => Some(n.to_string()),
        ValueRef::Real(n) => Some(n.to_string()),
        ValueRef::Text(t) => Some(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Some(hex(b)),
    }
}

impl Driver {
    pub fn engine(&self) -> Engine {
        match self {
            Driver::Postgres(_) => Engine::Postgres,
            Driver::Mysql(_) => Engine::Mysql,
            Driver::SqlServer(_) => Engine::SqlServer,
            Driver::Sqlite(_) => Engine::Sqlite,
        }
    }

    /// Runs one statement (or, in PostgreSQL and SQL Server, a batch) and keeps up to `max_rows` rows of
    /// the last result that has columns.
    pub async fn run(&self, sql: &str, max_rows: usize) -> Result<QueryOutput> {
        let mut out = QueryOutput::default();
        match self {
            Driver::Postgres(client) => {
                use tokio_postgres::SimpleQueryMessage;
                let mut stream = Box::pin(client.simple_query_raw(sql).await.map_err(database)?);
                let mut fresh = true;
                while let Some(message) = stream.next().await {
                    match message.map_err(database)? {
                        SimpleQueryMessage::RowDescription(columns) => {
                            out.columns = columns.iter().map(|c| c.name().to_string()).collect();
                            out.rows.clear();
                            out.truncated = false;
                            fresh = false;
                        }
                        SimpleQueryMessage::Row(row) => {
                            if fresh {
                                out.columns = row.columns().iter().map(|c| c.name().to_string()).collect();
                                fresh = false;
                            }
                            if out.rows.len() < max_rows {
                                out.rows.push((0..row.len()).map(|i| row.get(i).map(str::to_string)).collect());
                            } else {
                                out.truncated = true;
                            }
                        }
                        SimpleQueryMessage::CommandComplete(n) => {
                            out.rows_affected = Some(n);
                            fresh = true;
                        }
                        _ => {}
                    }
                }
            }
            Driver::Mysql(conn) => {
                use mysql_async::prelude::Queryable;
                let mut conn = conn.lock().await;
                let mut result = conn.query_iter(sql).await.map_err(mysql_error)?;
                loop {
                    if let Some(columns) = result.columns() {
                        if !columns.is_empty() {
                            out.columns = columns.iter().map(|c| c.name_str().to_string()).collect();
                            out.rows.clear();
                            out.truncated = false;
                        }
                    }
                    while let Some(row) = result.next().await.map_err(mysql_error)? {
                        if out.rows.len() < max_rows {
                            out.rows.push(row.unwrap().into_iter().map(mysql_text).collect());
                        } else {
                            out.truncated = true;
                        }
                    }
                    out.rows_affected = Some(result.affected_rows());
                    if result.is_empty() {
                        break;
                    }
                }
            }
            Driver::SqlServer(client) => {
                use tiberius::QueryItem;
                let mut client = client.lock().await;
                let mut stream = client.simple_query(sql).await.map_err(sqlserver_error)?;
                while let Some(item) = stream.try_next().await.map_err(sqlserver_error)? {
                    match item {
                        QueryItem::Metadata(meta) => {
                            out.columns = meta.columns().iter().map(|c| c.name().to_string()).collect();
                            out.rows.clear();
                            out.truncated = false;
                        }
                        QueryItem::Row(row) => {
                            if out.rows.len() < max_rows {
                                out.rows.push(row.into_iter().map(sqlserver_text).collect());
                            } else {
                                out.truncated = true;
                            }
                        }
                    }
                }
                drop(stream);
                // A statement without results (UPDATE, DELETE...) reports its count through @@ROWCOUNT.
                if out.columns.is_empty() {
                    let count = client.simple_query("SELECT @@ROWCOUNT").await.map_err(sqlserver_error)?;
                    let row = count.into_row().await.map_err(sqlserver_error)?;
                    out.rows_affected = row.and_then(|r| r.get::<i32, _>(0)).map(|n| n as u64);
                }
            }
            Driver::Sqlite(conn) => {
                let conn = conn.clone();
                let sql = sql.to_string();
                return tokio::task::spawn_blocking(move || {
                    let conn = conn.lock().unwrap();
                    let mut statement = conn.prepare(&sql).map_err(sqlite_error)?;
                    let mut out = QueryOutput::default();
                    if statement.column_count() == 0 {
                        out.rows_affected = Some(statement.execute([]).map_err(sqlite_error)? as u64);
                        return Ok(out);
                    }
                    out.columns = statement.column_names().map(|c| c.to_string()).collect();
                    let count = out.columns.len();
                    let mut rows = statement.query([]).map_err(sqlite_error)?;
                    while let Some(row) = rows.next().map_err(sqlite_error)? {
                        if out.rows.len() >= max_rows {
                            out.truncated = true;
                            break;
                        }
                        out.rows.push((0..count).map(|i| row.get_ref(i).ok().and_then(sqlite_text)).collect());
                    }
                    Ok(out)
                })
                .await
                .map_err(|e| Error::Database {
                    message: e.to_string(),
                    sql_state: None,
                })?;
            }
        }
        Ok(out)
    }

    /// Runs a script of several statements, without results (a migration, a transaction statement).
    pub async fn execute(&self, sql: &str) -> Result<()> {
        match self {
            Driver::Postgres(client) => client.batch_execute(sql).await.map_err(database),
            Driver::Mysql(conn) => {
                use mysql_async::prelude::Queryable;
                conn.lock().await.query_drop(sql).await.map_err(mysql_error)
            }
            Driver::SqlServer(client) => {
                let mut client = client.lock().await;
                let stream = client.simple_query(sql).await.map_err(sqlserver_error)?;
                stream.into_results().await.map_err(sqlserver_error).map(|_| ())
            }
            Driver::Sqlite(conn) => {
                let conn = conn.clone();
                let sql = sql.to_string();
                tokio::task::spawn_blocking(move || conn.lock().unwrap().execute_batch(&sql).map_err(sqlite_error))
                    .await
                    .map_err(|e| Error::Database {
                        message: e.to_string(),
                        sql_state: None,
                    })?
            }
        }
    }

    /// The statement that opens a transaction; read-only where the engine can enforce it.
    pub fn begin(&self, read_only: bool) -> &'static str {
        match (self, read_only) {
            (Driver::Postgres(_), true) => "BEGIN READ ONLY",
            (Driver::Postgres(_), false) => "BEGIN",
            (Driver::Mysql(_), true) => "START TRANSACTION READ ONLY",
            (Driver::Mysql(_), false) => "START TRANSACTION",
            (Driver::SqlServer(_), _) => "BEGIN TRANSACTION",
            (Driver::Sqlite(_), _) => "BEGIN",
        }
    }

    /// Whether a failed migration can be undone: MySQL commits each DDL statement on its own.
    pub fn transactional_ddl(&self) -> bool {
        !matches!(self, Driver::Mysql(_))
    }
}
