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
use crate::transport::{self, within, BoxStream, Step, Tunnel};

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

type Connecting<'a, T> =
    Pin<Box<dyn Future<Output = std::result::Result<(Client, tokio_postgres::Connection<BoxStream, T>), tokio_postgres::Error>> + Send + 'a>>;

/// Signs in over the stream. The connect futures are boxed as `dyn Future + Send`: tokio-postgres keeps a
/// `&Config` across an await, and without the box rustc cannot prove the future Send for every lifetime,
/// which Tauri commands require.
async fn sign_in(pg: tokio_postgres::Config, stream: BoxStream, tls: Option<RustlsConnect>, guards: Vec<Box<dyn std::any::Any + Send>>) -> Result<Client> {
    match tls {
        None => {
            let connecting: Connecting<'_, tokio_postgres::tls::NoTlsStream> = Box::pin(pg.connect_raw(stream, NoTls));
            let (client, connection) = connecting.await.map_err(database)?;
            spawn_connection(connection, guards);
            Ok(client)
        }
        Some(tls) => {
            let connecting: Connecting<'_, RustlsStream<BoxStream>> = Box::pin(pg.connect_raw(stream, tls));
            let (client, connection) = connecting.await.map_err(database)?;
            spawn_connection(connection, guards);
            Ok(client)
        }
    }
}

/// Opens the tunnel and the database session, and reads the server version.
pub async fn connect(config: &ConnectionConfig, steps: &mut Vec<Step>) -> Result<Session> {
    let Tunnel { stream, guards } = transport::open(config, steps).await?;
    let started = Instant::now();
    let pg = pg_config(config);
    let seconds = config.timeout_secs;
    // TLS settings are resolved before the sign-in, so the future below owns everything it uses (Tauri needs it Send).
    let tls = match tls::client_config(&config.tls)? {
        None => None,
        Some(tls_config) => Some(RustlsConnect {
            config: tls_config,
            name: tls::server_name(&config.tls, &config.host)?,
        }),
    };
    let client = within(seconds, "signing in to the database", sign_in(pg, stream, tls, guards)).await?;
    // simple_query, not query_one: an empty parameter slice makes the future Send only for one lifetime.
    let server_version = client
        .simple_query("SHOW server_version")
        .await
        .map_err(database)?
        .into_iter()
        .find_map(|message| match message {
            tokio_postgres::SimpleQueryMessage::Row(row) => row.get(0).map(str::to_string),
            _ => None,
        })
        .unwrap_or_default();
    steps.push(Step {
        kind: "database",
        target: format!("{}/{}", config.host, config.database),
        ms: started.elapsed().as_millis() as u64,
    });
    Ok(Session { client, server_version })
}
