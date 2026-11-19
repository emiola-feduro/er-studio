//! PostgreSQL over the tunnel stream. tokio-postgres takes any stream, and the TLS handshake (after the
//! SSLRequest) goes through rustls with the server name of the configuration.

use std::future::Future;
use std::io;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Instant;

use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio_postgres::config::SslMode;
use tokio_postgres::tls::{ChannelBinding, TlsConnect};
use tokio_postgres::{Client, NoTls};
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::ClientConfig;
use tokio_rustls::TlsConnector;

use crate::config::{ConnectionConfig, TlsMode};
use crate::error::{database, Result};
use crate::tls;
use crate::transport::{self, within, Step, Tunnel};

pub struct RustlsConnect {
    config: Arc<ClientConfig>,
    name: ServerName<'static>,
}

pub struct RustlsStream<S>(tokio_rustls::client::TlsStream<S>);

impl<S: AsyncRead + AsyncWrite + Unpin> AsyncRead for RustlsStream<S> {
    fn poll_read(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.0).poll_read(cx, buf)
    }
}

impl<S: AsyncRead + AsyncWrite + Unpin> AsyncWrite for RustlsStream<S> {
    fn poll_write(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &[u8]) -> Poll<io::Result<usize>> {
        Pin::new(&mut self.0).poll_write(cx, buf)
    }
    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.0).poll_flush(cx)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.0).poll_shutdown(cx)
    }
}

impl<S: AsyncRead + AsyncWrite + Unpin> tokio_postgres::tls::TlsStream for RustlsStream<S> {
    fn channel_binding(&self) -> ChannelBinding {
        ChannelBinding::none()
    }
}

impl<S: AsyncRead + AsyncWrite + Unpin + Send + 'static> TlsConnect<S> for RustlsConnect {
    type Stream = RustlsStream<S>;
    type Error = io::Error;
    type Future = Pin<Box<dyn Future<Output = io::Result<RustlsStream<S>>> + Send>>;

    fn connect(self, stream: S) -> Self::Future {
        Box::pin(async move {
            let stream = TlsConnector::from(self.config).connect(self.name, stream).await?;
            Ok(RustlsStream(stream))
        })
    }
}

/// An open session. Dropping it closes the connection and the tunnel behind it.
pub struct Session {
    pub client: Client,
    pub server_version: String,
}

fn pg_config(config: &ConnectionConfig) -> tokio_postgres::Config {
    let mut pg = tokio_postgres::Config::new();
    pg.host(&config.host)
        .port(config.port)
        .dbname(&config.database)
        .user(&config.user)
        .application_name("ER Studio");
    if let Some(password) = config.password.as_deref() {
        pg.password(password);
    }
    pg.ssl_mode(match config.tls.mode {
        TlsMode::Disable => SslMode::Disable,
        TlsMode::Prefer => SslMode::Prefer,
        _ => SslMode::Require,
    });
    pg
}

fn spawn_connection<F>(connection: F, tunnel_guards: Vec<Box<dyn std::any::Any + Send>>)
where
    F: Future<Output = std::result::Result<(), tokio_postgres::Error>> + Send + 'static,
{
    tokio::spawn(async move {
        let _ = connection.await;
        // The SSH sessions live as long as the connection that runs through them.
        drop(tunnel_guards);
    });
}

/// Opens the tunnel and the database session, and reads the server version.
pub async fn connect(config: &ConnectionConfig, steps: &mut Vec<Step>) -> Result<Session> {
    let Tunnel { stream, guards } = transport::open(config, steps).await?;
    let started = Instant::now();
    let pg = pg_config(config);
    let seconds = config.timeout_secs;
    let client = within(seconds, "signing in to the database", async {
        match tls::client_config(&config.tls)? {
            None => {
                let (client, connection) = pg.connect_raw(stream, NoTls).await.map_err(database)?;
                spawn_connection(connection, guards);
                Ok(client)
            }
            Some(tls_config) => {
                let tls = RustlsConnect {
                    config: tls_config,
                    name: tls::server_name(&config.tls, &config.host)?,
                };
                let (client, connection) = pg.connect_raw(stream, tls).await.map_err(database)?;
                spawn_connection(connection, guards);
                Ok(client)
            }
        }
    })
    .await?;
    let row = client.query_one("SELECT current_setting('server_version')", &[]).await.map_err(database)?;
    let server_version: String = row.get(0);
    steps.push(Step {
        kind: "database",
        target: format!("{}/{}", config.host, config.database),
        ms: started.elapsed().as_millis() as u64,
    });
    Ok(Session { client, server_version })
}
