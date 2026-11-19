//! A SQLite file on this computer, opened in place.

use std::sync::{Arc, Mutex};
use std::time::Instant;

use rusqlite::{Connection, OpenFlags};

use crate::config::ConnectionConfig;
use crate::driver::{sqlite_error, Driver};
use crate::error::{Error, Result};
use crate::transport::Step;

pub async fn connect(config: &ConnectionConfig, steps: &mut Vec<Step>) -> Result<(Driver, String)> {
    let path = config.file.clone().filter(|f| !f.trim().is_empty()).ok_or(Error::Unsupported {
        message: "no SQLite file chosen".into(),
    })?;
    let started = Instant::now();
    let read_only = config.read_only_file;
    let opened = tokio::task::spawn_blocking(move || {
        // Never create a file: a mistyped path should fail, not leave an empty database behind.
        let flags = if read_only {
            OpenFlags::SQLITE_OPEN_READ_ONLY
        } else {
            OpenFlags::SQLITE_OPEN_READ_WRITE
        } | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_URI;
        let conn = Connection::open_with_flags(&path, flags).map_err(sqlite_error)?;
        conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(sqlite_error)?;
        // Reading the schema fails here, and not later, when the file is not a database.
        let version: String = conn.query_row("SELECT sqlite_version()", [], |r| r.get(0)).map_err(sqlite_error)?;
        conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
            .map_err(sqlite_error)?;
        Ok::<_, Error>((conn, version))
    })
    .await
    .map_err(|e| Error::Database {
        message: e.to_string(),
        sql_state: None,
    })??;
    steps.push(Step {
        kind: "file",
        target: config.file.clone().unwrap_or_default(),
        ms: started.elapsed().as_millis() as u64,
    });
    Ok((Driver::Sqlite(Arc::new(Mutex::new(opened.0))), opened.1))
}
