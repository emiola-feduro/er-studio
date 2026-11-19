//! MySQL and MariaDB. mysql_async opens its own TCP connection, so the tunnel is handed to it through a
//! one-shot listener on 127.0.0.1; TLS still checks the real server name (tls_hostname_override).

use std::time::Instant;

use mysql_async::prelude::Queryable;
use mysql_async::{ClientIdentity, Conn, OptsBuilder, SslOpts};

use crate::config::{ConnectionConfig, TlsMode};
use crate::driver::{mysql_error, Driver};
use crate::error::{Error, Result};
use crate::transport::{self, within, Step};

fn ssl_opts(config: &ConnectionConfig) -> Option<SslOpts> {
    let tls = &config.tls;
    let name = tls.server_name.clone().filter(|n| !n.trim().is_empty()).unwrap_or_else(|| config.host.clone());
    let mut opts = SslOpts::default();
    if let Some(pem) = tls.ca_pem.clone().filter(|p| !p.trim().is_empty()) {
        opts = opts.with_root_certs(vec![pem.into_bytes().into()]);
    }
    if let (Some(cert), Some(key)) = (tls.client_cert_pem.clone(), tls.client_key_pem.clone()) {
        if !cert.trim().is_empty() && !key.trim().is_empty() {
            opts = opts.with_client_identity(Some(ClientIdentity::new(cert.into_bytes().into(), key.into_bytes().into())));
        }
    }
    match tls.mode {
        TlsMode::Disable => None,
        TlsMode::Prefer | TlsMode::Require => Some(opts.with_danger_accept_invalid_certs(true)),
        TlsMode::VerifyCa => Some(opts.with_danger_skip_domain_validation(true).with_danger_tls_hostname_override(Some(name))),
        TlsMode::VerifyFull => Some(opts.with_danger_tls_hostname_override(Some(name))),
    }
}

async fn attempt(config: &ConnectionConfig, ssl: Option<SslOpts>, steps: &mut Vec<Step>) -> Result<Conn> {
    let mut builder = OptsBuilder::default()
        .user(Some(config.user.clone()))
        .pass(config.password.clone())
        .db_name((!config.database.is_empty()).then(|| config.database.clone()))
        .prefer_socket(false)
        .ssl_opts(ssl);
    let socket = config.hops.is_empty() && config.host.starts_with('/');
    if socket {
        builder = builder.socket(Some(config.host.clone()));
        steps.push(Step {
            kind: "socket",
            target: config.host.clone(),
            ms: 0,
        });
    } else {
        let tunnel = transport::open(config, steps).await?;
        let port = transport::local_forward(tunnel).await?;
        builder = builder.ip_or_hostname("127.0.0.1").tcp_port(port);
    }
    Conn::new(builder).await.map_err(mysql_error)
}

pub async fn connect(config: &ConnectionConfig, steps: &mut Vec<Step>) -> Result<(Driver, String)> {
    crate::init();
    let target = format!("{}/{}", config.host, config.database);
    let started = Instant::now();
    let conn = within(config.timeout_secs, "database", &target, async {
        match attempt(config, ssl_opts(config), steps).await {
            // "Prefer": a server without TLS is fine; try again in the clear.
            Err(Error::Database { message, .. }) if config.tls.mode == TlsMode::Prefer && message.to_lowercase().contains("tls") => {
                steps.clear();
                attempt(config, None, steps).await
            }
            other => other,
        }
    })
    .await?;
    let mut conn = conn;
    let version: Option<String> = conn.query_first("SELECT VERSION()").await.map_err(mysql_error)?;
    steps.push(Step {
        kind: "database",
        target,
        ms: started.elapsed().as_millis() as u64,
    });
    Ok((Driver::Mysql(tokio::sync::Mutex::new(conn)), version.unwrap_or_default()))
}
