//! Database connections for ER Studio desktop.
//!
//! A connection is a chain of hops (SSH, SOCKS5, SOCKS4, HTTP CONNECT) that ends in a stream to the
//! database server; the driver runs over that stream, with TLS checked against the real server name.

pub mod config;
pub mod driver;
pub mod error;
pub mod introspect;
pub mod ir;
pub mod mysql;
pub mod oracle;
pub mod postgres;
pub mod secrets;
pub mod session;
pub mod sqlite;
pub mod sqlserver;
pub mod terminal;
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

/// Makes rustls use ring for every driver. The drivers pull in two crypto providers, and rustls refuses
/// to choose between them on its own.
pub fn init() {
    let _ = tokio_rustls::rustls::crypto::ring::default_provider().install_default();
}

pub async fn test_connection(config: &ConnectionConfig) -> TestReport {
    init();
    let mut steps = Vec::new();
    match session::connect(config, &mut steps).await {
        Ok((_, version, _)) => TestReport {
            steps,
            server_version: Some(version),
            error: None,
        },
        Err(error) => TestReport {
            steps,
            server_version: None,
            error: Some(error),
        },
    }
}
