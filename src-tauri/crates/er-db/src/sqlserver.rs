//! SQL Server over the tunnel stream. tiberius takes any stream and does the TLS of TDS itself, checking
//! the certificate against the configured host name.

use std::time::Instant;

use tiberius::{AuthMethod, Client, Config, EncryptionLevel};
use tokio_util::compat::TokioAsyncWriteCompatExt;

use crate::config::{ConnectionConfig, TlsMode};
use crate::driver::{sqlserver_error, Driver};
use crate::error::{unreachable, Error, Result};
use crate::transport::{self, within, Guards, Step, Tunnel};

/// Asks SQL Browser (UDP 1434) for the TCP port of a named instance.
async fn instance_port(host: &str, instance: &str) -> Result<u16> {
    let target = format!("{host}:1434");
    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0").await.map_err(|e| unreachable(&target, e))?;
    socket.connect(&target).await.map_err(|e| unreachable(&target, e))?;
    let mut request = vec![0x04];
    request.extend_from_slice(instance.as_bytes());
    socket.send(&request).await.map_err(|e| unreachable(&target, e))?;
    let mut buffer = vec![0u8; 4096];
    let read = tokio::time::timeout(std::time::Duration::from_secs(3), socket.recv(&mut buffer))
        .await
        .map_err(|_| Error::Unreachable {
            target: target.clone(),
            message: "SQL Browser did not answer; give the instance's port".into(),
        })?
        .map_err(|e| unreachable(&target, e))?;
    // The answer is "ServerName;X;InstanceName;Y;...;tcp;1433;..." after a 3-byte header.
    let text = String::from_utf8_lossy(&buffer[3.min(read)..read]).to_string();
    let parts: Vec<&str> = text.split(';').collect();
    parts
        .iter()
        .position(|p| p.eq_ignore_ascii_case("tcp"))
        .and_then(|i| parts.get(i + 1))
        .and_then(|p| p.parse().ok())
        .ok_or(Error::Unreachable {
            target,
            message: format!("instance {instance} has no TCP port enabled"),
        })
}

fn tiberius_config(config: &ConnectionConfig, port: u16) -> Result<Config> {
    let mut cfg = Config::new();
    cfg.host(&config.host);
    cfg.port(port);
    if !config.database.is_empty() {
        cfg.database(&config.database);
    }
    cfg.application_name("ER Studio");
    if config.integrated_auth {
        #[cfg(windows)]
        cfg.authentication(AuthMethod::Integrated);
        #[cfg(not(windows))]
        return Err(Error::Unsupported {
            message: "Windows authentication only works on Windows".into(),
        });
    } else {
        cfg.authentication(AuthMethod::sql_server(&config.user, config.password.as_deref().unwrap_or("")));
    }
    let tls = &config.tls;
    let ca = tls.ca_pem.clone().filter(|p| !p.trim().is_empty());
    match tls.mode {
        TlsMode::Disable => cfg.encryption(EncryptionLevel::NotSupported),
        TlsMode::Prefer => {
            cfg.encryption(EncryptionLevel::On);
            cfg.trust_cert();
        }
        TlsMode::Require => {
            cfg.encryption(EncryptionLevel::Required);
            cfg.trust_cert();
        }
        // tiberius always checks the name against the CA chain, so verify-ca behaves as verify-full here.
        TlsMode::VerifyCa | TlsMode::VerifyFull => {
            cfg.encryption(EncryptionLevel::Required);
            if let Some(pem) = ca {
                cfg.trust_cert_ca_bundle(pem.into_bytes());
            }
            if let Some(name) = tls.server_name.clone().filter(|n| !n.trim().is_empty()) {
                cfg.hostname_in_certificate(name);
            }
        }
    }
    Ok(cfg)
}

pub async fn connect(config: &ConnectionConfig, steps: &mut Vec<Step>) -> Result<(Driver, String, Guards)> {
    crate::init();
    let mut config = config.clone();
    let instance = config.instance.clone().filter(|i| !i.trim().is_empty());
    if config.port == 0 {
        match (&instance, config.hops.is_empty()) {
            (Some(name), true) => config.port = instance_port(&config.host, name).await?,
            (Some(_), false) => {
                return Err(Error::Unsupported {
                    message: "through hops SQL Browser cannot be asked; give the instance's port".into(),
                })
            }
            (None, _) => config.port = 1433,
        }
    }
    let target = format!("{}/{}", config.host, config.database);
    let Tunnel { stream, guards } = transport::open(&config, steps).await?;
    let started = Instant::now();
    let cfg = tiberius_config(&config, config.port)?;
    let client = within(config.timeout_secs, "database", &target, async move {
        Client::connect(cfg, stream.compat_write()).await.map_err(|e| match e {
            tiberius::error::Error::Routing { host, port } => Error::Unsupported {
                message: format!("the server redirects to {host}:{port}; connect to that address"),
            },
            other => sqlserver_error(other),
        })
    })
    .await?;
    let driver = Driver::SqlServer(Box::new(tokio::sync::Mutex::new(client)));
    let version = driver
        .run(
            "SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64)) + ' ' + CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS v",
            1,
        )
        .await?;
    steps.push(Step {
        kind: "database",
        target,
        ms: started.elapsed().as_millis() as u64,
    });
    Ok((driver, version.rows.first().and_then(|r| r[0].clone()).unwrap_or_default(), guards))
}
