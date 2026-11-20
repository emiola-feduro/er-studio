//! Open connections kept between commands, addressed by a number the interface keeps. Every statement
//! runs inside a transaction: reads are always rolled back, and a write stays pending until the person
//! confirms or undoes it (or two minutes pass, which undoes it).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tokio::sync::Mutex;

use crate::config::{ConnectionConfig, Engine};
use crate::driver::{Driver, QueryOutput};
use crate::error::{Error, Result};
use crate::introspect::{self, RowsPage, SchemaInfo, SchemaRead};
use crate::transport::Guards;
use crate::{Step, TestReport};

/// How long a pending change waits for a decision before it is undone.
pub const PENDING_LIMIT: Duration = Duration::from_secs(120);

pub struct Session {
    pub driver: Driver,
    pub engine: Engine,
    pub server_version: String,
    allow_writes: bool,
    query_timeout: u64,
    /// The id of the write waiting for a decision, if any.
    pending: Mutex<Option<u64>>,
    _guards: StdMutex<Guards>,
}

#[derive(Default)]
pub struct Sessions {
    next: AtomicU64,
    open: Mutex<HashMap<u64, Arc<Session>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    pub session_id: Option<u64>,
    pub report: TestReport,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResult {
    #[serde(flatten)]
    pub output: QueryOutput,
    pub ms: u64,
    /// A write ran and waits for "confirm" or "undo".
    pub pending: bool,
}

/// Opens the connection of any engine and reads the server version.
pub async fn connect(config: &ConnectionConfig, steps: &mut Vec<Step>) -> Result<(Driver, String, Guards)> {
    match config.engine {
        Engine::Postgres => crate::postgres::connect(config, steps).await.map(|(d, v)| (d, v, Vec::new())),
        Engine::Mysql => crate::mysql::connect(config, steps).await.map(|(d, v)| (d, v, Vec::new())),
        Engine::SqlServer => crate::sqlserver::connect(config, steps).await,
        Engine::Sqlite => crate::sqlite::connect(config, steps).await.map(|(d, v)| (d, v, Vec::new())),
        Engine::Oracle => crate::oracle::connect(config, steps).await,
    }
}

/// Whether a statement only reads: the first keyword, after comments, is one of the reading ones.
pub fn is_read_only(sql: &str) -> bool {
    let mut text = sql.trim_start();
    loop {
        if let Some(rest) = text.strip_prefix("--") {
            text = rest.split_once('\n').map(|(_, r)| r).unwrap_or("").trim_start();
        } else if let Some(rest) = text.strip_prefix("/*") {
            text = rest.split_once("*/").map(|(_, r)| r).unwrap_or("").trim_start();
        } else if let Some(rest) = text.strip_prefix('(') {
            text = rest.trim_start();
        } else {
            break;
        }
    }
    let word: String = text.chars().take_while(|c| c.is_ascii_alphabetic()).collect::<String>().to_uppercase();
    match word.as_str() {
        "SELECT" | "WITH" | "SHOW" | "EXPLAIN" | "DESCRIBE" | "DESC" | "VALUES" | "TABLE" => true,
        // PRAGMA reads unless it assigns.
        "PRAGMA" => !text.contains('='),
        _ => false,
    }
}

fn closed() -> Error {
    Error::SessionClosed
}

impl Session {
    async fn rollback_quietly(&self) {
        let _ = self.driver.execute("ROLLBACK").await;
    }

    async fn run_in_transaction(&self, sql: &str, max_rows: usize, read_only: bool) -> Result<QueryOutput> {
        let mut attempt = 0;
        loop {
            match self.run_once(sql, max_rows, read_only).await {
                // An Oracle read-only transaction sees the database as of a moment that is only precise to
                // about a second, so a table created or changed just before cannot be read yet (ORA-01466).
                Err(Error::Database { sql_state: Some(code), .. }) if read_only && code == "ORA-01466" && attempt < 3 => {
                    attempt += 1;
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
                other => return other,
            }
        }
    }

    async fn run_once(&self, sql: &str, max_rows: usize, read_only: bool) -> Result<QueryOutput> {
        if let Some(begin) = self.driver.begin(read_only) {
            self.driver.execute(begin).await?;
        }
        if self.engine == Engine::Postgres {
            self.driver.execute(&format!("SET LOCAL statement_timeout = '{}s'", self.query_timeout)).await?;
        }
        let ran = tokio::time::timeout(Duration::from_secs(self.query_timeout), self.driver.run(sql, max_rows)).await;
        match ran {
            Ok(Ok(output)) => Ok(output),
            Ok(Err(error)) => {
                self.rollback_quietly().await;
                Err(error)
            }
            Err(_) => Err(Error::Timeout {
                step: "query".into(),
                target: String::new(),
                seconds: self.query_timeout,
            }),
        }
    }
}

impl Sessions {
    pub async fn open(&self, config: &ConnectionConfig) -> Opened {
        let mut steps: Vec<Step> = Vec::new();
        match connect(config, &mut steps).await {
            Ok((driver, version, guards)) => {
                if let Driver::Oracle(connection) = &driver {
                    let _ = crate::oracle::set_call_timeout(connection, config.timeout_secs.max(30)).await;
                }
                let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
                let session = Session {
                    driver,
                    engine: config.engine,
                    server_version: version.clone(),
                    allow_writes: config.allow_writes,
                    query_timeout: config.timeout_secs.max(30),
                    pending: Mutex::new(None),
                    _guards: StdMutex::new(guards),
                };
                self.open.lock().await.insert(id, Arc::new(session));
                Opened {
                    session_id: Some(id),
                    report: TestReport {
                        steps,
                        server_version: Some(version),
                        error: None,
                    },
                }
            }
            Err(error) => Opened {
                session_id: None,
                report: TestReport {
                    steps,
                    server_version: None,
                    error: Some(error),
                },
            },
        }
    }

    async fn get(&self, id: u64) -> Result<Arc<Session>> {
        self.open.lock().await.get(&id).cloned().ok_or_else(closed)
    }

    /// Closes a session; a change still pending is undone first.
    pub async fn close(&self, id: u64) {
        let session = self.open.lock().await.remove(&id);
        if let Some(session) = session {
            if session.pending.lock().await.take().is_some() {
                session.rollback_quietly().await;
            }
        }
    }

    pub async fn schemas(&self, id: u64) -> Result<Vec<SchemaInfo>> {
        introspect::list_schemas(&self.get(id).await?.driver).await
    }

    pub async fn schema(&self, id: u64, schemas: &[String]) -> Result<SchemaRead> {
        introspect::read_schema(&self.get(id).await?.driver, schemas).await
    }

    pub async fn rows(&self, id: u64, schema: &str, table: &str, order_by: &[String], offset: u64, limit: u64) -> Result<RowsPage> {
        introspect::read_rows(&self.get(id).await?.driver, schema, table, order_by, offset, limit).await
    }

    /// Runs one statement. A read runs in a read-only transaction that is always rolled back. A write
    /// (`write`) needs the connection to allow writes, and stays pending until `finish`.
    pub async fn run(self: &Arc<Self>, id: u64, sql: &str, write: bool, max_rows: usize) -> Result<RunResult> {
        let session = self.get(id).await?;
        let mut pending = session.pending.lock().await;
        if pending.is_some() {
            return Err(Error::PendingWrite);
        }
        if !write && !is_read_only(sql) {
            return Err(Error::NotReadOnly);
        }
        if write && !session.allow_writes {
            return Err(Error::WritesDisabled);
        }
        let started = Instant::now();
        let output = match session.run_in_transaction(sql, max_rows, !write).await {
            Ok(output) => output,
            Err(error @ Error::Timeout { .. }) => {
                // The connection may still be busy with the statement; it cannot be trusted any more.
                drop(pending);
                self.close(id).await;
                return Err(error);
            }
            Err(error) => return Err(error),
        };
        let ms = started.elapsed().as_millis() as u64;
        if !write {
            session.rollback_quietly().await;
            return Ok(RunResult { output, ms, pending: false });
        }
        let token = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        *pending = Some(token);
        drop(pending);
        // Undo the change if nobody decides in time.
        let sessions = Arc::clone(self);
        tokio::spawn(async move {
            tokio::time::sleep(PENDING_LIMIT).await;
            if let Ok(session) = sessions.get(id).await {
                let mut pending = session.pending.lock().await;
                if *pending == Some(token) {
                    *pending = None;
                    session.rollback_quietly().await;
                }
            }
        });
        Ok(RunResult { output, ms, pending: true })
    }

    /// Confirms (commit) or undoes (rollback) the pending write.
    pub async fn finish(&self, id: u64, commit: bool) -> Result<()> {
        let session = self.get(id).await?;
        let mut pending = session.pending.lock().await;
        if pending.take().is_none() {
            return Err(Error::NothingPending);
        }
        session.driver.execute(if commit { "COMMIT" } else { "ROLLBACK" }).await
    }

    /// Runs a migration script in one transaction where the engine allows it (all but MySQL and Oracle,
    /// whose DDL commits by itself). Needs the connection to allow writes.
    pub async fn script(&self, id: u64, sql: &str) -> Result<()> {
        let session = self.get(id).await?;
        if !session.allow_writes {
            return Err(Error::WritesDisabled);
        }
        let pending = session.pending.lock().await;
        if pending.is_some() {
            return Err(Error::PendingWrite);
        }
        let transactional = session.driver.transactional_ddl();
        if let Some(begin) = session.driver.begin(false).filter(|_| transactional) {
            session.driver.execute(begin).await?;
        }
        // Oracle has no autocommit: its rows wait for COMMIT even though each DDL commits by itself.
        let ends = transactional || session.engine == Engine::Oracle;
        match session.driver.execute(sql).await {
            Ok(()) if ends => session.driver.execute("COMMIT").await,
            Ok(()) => Ok(()),
            Err(error) => {
                if ends {
                    session.rollback_quietly().await;
                }
                Err(error)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_read_only;

    #[test]
    fn tells_reads_from_writes() {
        for sql in [
            "SELECT 1",
            "  -- note\n select * from t",
            "/* x */ WITH a AS (SELECT 1) SELECT * FROM a",
            "(SELECT 1) UNION (SELECT 2)",
            "explain select 1",
            "PRAGMA table_info(t)",
            "SHOW TABLES",
        ] {
            assert!(is_read_only(sql), "{sql}");
        }
        for sql in [
            "UPDATE t SET a = 1",
            "delete from t",
            "INSERT INTO t VALUES (1)",
            "DROP TABLE t",
            "PRAGMA journal_mode = WAL",
            "CREATE TABLE t (a int)",
            "",
        ] {
            assert!(!is_read_only(sql), "{sql}");
        }
    }
}
