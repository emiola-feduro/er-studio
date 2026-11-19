//! Database connections for ER Studio desktop.
//!
//! A connection is a chain of hops (SSH, SOCKS5, SOCKS4, HTTP CONNECT) that ends in a stream to the
//! database server; the driver runs over that stream, with TLS checked against the real server name.

pub mod config;
pub mod error;
pub mod postgres;
pub mod secrets;
pub mod ssh;
pub mod tls;
pub mod transport;

use serde::Serialize;

pub use config::{ConnectionConfig, Engine, Hop, SshAuth, TlsConfig, TlsMode};
pub use error::{Error, Result};
pub use transport::Step;

/// What "Test connection" shows: each step that worked, and the error of the one that did not.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestReport {
    pub steps: Vec<Step>,
    pub server_version: Option<String>,
    pub error: Option<Error>,
}

pub async fn test_connection(config: &ConnectionConfig) -> TestReport {
    let mut steps = Vec::new();
    let result = match config.engine {
        Engine::Postgres => postgres::connect(config, &mut steps).await,
    };
    match result {
        Ok(session) => TestReport {
            steps,
            server_version: Some(session.server_version),
            error: None,
        },
        Err(error) => TestReport {
            steps,
            server_version: None,
            error: Some(error),
        },
    }
}
