//! Open connections kept between commands, so reading a schema and then its rows does not repeat the
//! SSH and TLS handshakes. Each one is addressed by a number the interface keeps.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tokio::sync::Mutex;

use crate::config::{ConnectionConfig, Engine};
use crate::error::{Error, Result};
use crate::introspect::{self, RowsPage, SchemaInfo, SchemaRead};
use crate::{postgres, Step, TestReport};

#[derive(Default)]
pub struct Sessions {
    next: AtomicU64,
    open: Mutex<HashMap<u64, Arc<postgres::Session>>>,
}

/// The result of opening: the session to use next, or the report of why it failed.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    pub session_id: Option<u64>,
    pub report: TestReport,
}

fn closed(id: u64) -> Error {
    Error::Database {
        message: format!("session {id} is not open"),
        sql_state: None,
    }
}

impl Sessions {
    pub async fn open(&self, config: &ConnectionConfig) -> Opened {
        let mut steps: Vec<Step> = Vec::new();
        let result = match config.engine {
            Engine::Postgres => postgres::connect(config, &mut steps).await,
        };
        match result {
            Ok(session) => {
                let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
                let version = session.server_version.clone();
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

    async fn get(&self, id: u64) -> Result<Arc<postgres::Session>> {
        self.open.lock().await.get(&id).cloned().ok_or_else(|| closed(id))
    }

    pub async fn close(&self, id: u64) {
        self.open.lock().await.remove(&id);
    }

    pub async fn schemas(&self, id: u64) -> Result<Vec<SchemaInfo>> {
        introspect::list_schemas(&self.get(id).await?.client).await
    }

    pub async fn schema(&self, id: u64, schemas: &[String]) -> Result<SchemaRead> {
        introspect::read_schema(&self.get(id).await?.client, schemas).await
    }

    pub async fn rows(&self, id: u64, schema: &str, table: &str, order_by: &[String], offset: u64, limit: u64) -> Result<RowsPage> {
        introspect::read_rows(&self.get(id).await?.client, schema, table, order_by, offset, limit).await
    }
}
