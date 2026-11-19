use serde::Serialize;

/// Errors carry a stable code so the interface can explain them in its own language.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "code")]
pub enum Error {
    #[error("could not reach {target}: {message}")]
    Unreachable { target: String, message: String },
    #[error("timed out after {seconds} s while {step}")]
    Timeout { step: String, seconds: u64 },
    #[error("proxy {target} refused: {message}")]
    ProxyRefused { target: String, message: String },
    #[error("unknown SSH host key for {host}: {fingerprint}")]
    UnknownHostKey { host: String, fingerprint: String },
    #[error("SSH host key for {host} changed: expected {expected}, got {actual}")]
    HostKeyChanged { host: String, expected: String, actual: String },
    #[error("SSH authentication failed for {user}@{host}")]
    SshAuthFailed { host: String, user: String, message: String },
    #[error("invalid SSH key: {message}")]
    InvalidKey { message: String },
    #[error("SSH tunnel to {target} refused: {message}")]
    TunnelRefused { target: String, message: String },
    #[error("invalid TLS settings: {message}")]
    TlsConfig { message: String },
    #[error("database error: {message}")]
    Database { message: String, sql_state: Option<String> },
}

pub type Result<T> = std::result::Result<T, Error>;

pub(crate) fn unreachable(target: &str, error: impl std::fmt::Display) -> Error {
    Error::Unreachable {
        target: target.to_string(),
        message: error.to_string(),
    }
}

pub(crate) fn database(error: tokio_postgres::Error) -> Error {
    // The source error holds the useful part (a TLS or I/O message); Display alone only says "error connecting".
    let mut message = error.to_string();
    let mut source = std::error::Error::source(&error);
    while let Some(inner) = source {
        message = format!("{message}: {inner}");
        source = inner.source();
    }
    Error::Database {
        message,
        sql_state: error.code().map(|c| c.code().to_string()),
    }
}
