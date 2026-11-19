//! A chain of hops (SSH, SOCKS, HTTP CONNECT) ending in a byte stream to the database server. Each hop
//! runs over the stream of the previous one, so nothing listens on a local port and TLS can later check
//! the real server name.

use std::any::Any;
use std::time::{Duration, Instant};

use serde::Serialize;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpStream;

use crate::config::{ConnectionConfig, Hop};
use crate::error::{unreachable, Error, Result};
use crate::ssh;

pub trait AsyncStream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> AsyncStream for T {}

pub type BoxStream = Box<dyn AsyncStream>;

/// The stream to the server plus what must stay alive while it is used (SSH sessions).
pub struct Tunnel {
    pub stream: BoxStream,
    pub(crate) guards: Vec<Box<dyn Any + Send>>,
}

/// One line of the "Test connection" report.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub kind: &'static str,
    pub target: String,
    pub ms: u64,
}

pub(crate) async fn within<T>(seconds: u64, step: &str, future: impl std::future::Future<Output = Result<T>>) -> Result<T> {
    tokio::time::timeout(Duration::from_secs(seconds), future).await.map_err(|_| Error::Timeout {
        step: step.to_string(),
        seconds,
    })?
}

fn target_of(host: &str, port: u16) -> String {
    if host.contains(':') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

/// Opens the chain and returns the stream to `config.host:config.port`, recording each step.
pub async fn open(config: &ConnectionConfig, steps: &mut Vec<Step>) -> Result<Tunnel> {
    let seconds = config.timeout_secs;
    let (first_host, first_port) = config.hops.first().map(Hop::address).unwrap_or((config.host.clone(), config.port));
    let first = target_of(&first_host, first_port);

    let started = Instant::now();
    let tcp = within(seconds, &format!("connecting to {first}"), async {
        TcpStream::connect((first_host.as_str(), first_port)).await.map_err(|e| unreachable(&first, e))
    })
    .await?;
    let _ = tcp.set_nodelay(true);
    steps.push(Step {
        kind: "tcp",
        target: first.clone(),
        ms: started.elapsed().as_millis() as u64,
    });

    let mut stream: BoxStream = Box::new(tcp);
    let mut guards: Vec<Box<dyn Any + Send>> = Vec::new();
    for (index, hop) in config.hops.iter().enumerate() {
        let (next_host, next_port) = config.hops.get(index + 1).map(Hop::address).unwrap_or((config.host.clone(), config.port));
        let next = target_of(&next_host, next_port);
        let started = Instant::now();
        let (kind, next_stream) = match hop {
            Hop::Socks5 {
                host,
                port,
                username,
                password,
            } => {
                let via = target_of(host, *port);
                let stream = within(
                    seconds,
                    &format!("opening SOCKS5 tunnel to {next}"),
                    socks5(stream, &via, &next_host, next_port, username, password),
                )
                .await?;
                ("socks5", stream)
            }
            Hop::Socks4 { host, port, user_id } => {
                let via = target_of(host, *port);
                let stream = within(
                    seconds,
                    &format!("opening SOCKS4 tunnel to {next}"),
                    socks4(stream, &via, &next_host, next_port, user_id),
                )
                .await?;
                ("socks4", stream)
            }
            Hop::HttpConnect {
                host,
                port,
                username,
                password,
            } => {
                let via = target_of(host, *port);
                let stream = within(
                    seconds,
                    &format!("opening HTTP tunnel to {next}"),
                    http_connect(stream, &via, &next_host, next_port, username, password),
                )
                .await?;
                ("http", stream)
            }
            Hop::Ssh {
                host,
                port,
                user,
                auth,
                host_key,
            } => {
                let (stream, guard) = within(
                    seconds,
                    &format!("opening SSH tunnel to {next}"),
                    ssh::tunnel(stream, host, *port, user, auth, host_key.as_deref(), &next_host, next_port),
                )
                .await?;
                guards.push(guard);
                ("ssh", stream)
            }
        };
        stream = next_stream;
        steps.push(Step {
            kind,
            target: next,
            ms: started.elapsed().as_millis() as u64,
        });
    }
    Ok(Tunnel { stream, guards })
}

async fn socks5(stream: BoxStream, via: &str, host: &str, port: u16, username: &Option<String>, password: &Option<String>) -> Result<BoxStream> {
    use tokio_socks::tcp::Socks5Stream;
    let refused = |e: tokio_socks::Error| Error::ProxyRefused {
        target: via.to_string(),
        message: e.to_string(),
    };
    // The proxy resolves the name, so hosts only it can see (internal DNS) work too.
    let target = (host, port);
    let stream = match (username, password) {
        (Some(user), Some(pass)) if !user.is_empty() => Socks5Stream::connect_with_password_and_socket(stream, target, user, pass)
            .await
            .map_err(refused)?,
        _ => Socks5Stream::connect_with_socket(stream, target).await.map_err(refused)?,
    };
    Ok(Box::new(stream))
}

async fn socks4(stream: BoxStream, via: &str, host: &str, port: u16, user_id: &Option<String>) -> Result<BoxStream> {
    use tokio_socks::tcp::Socks4Stream;
    let refused = |e: tokio_socks::Error| Error::ProxyRefused {
        target: via.to_string(),
        message: e.to_string(),
    };
    let target = (host, port);
    let stream = match user_id {
        Some(id) if !id.is_empty() => Socks4Stream::connect_with_userid_and_socket(stream, target, id).await.map_err(refused)?,
        _ => Socks4Stream::connect_with_socket(stream, target).await.map_err(refused)?,
    };
    Ok(Box::new(stream))
}

async fn http_connect(mut stream: BoxStream, via: &str, host: &str, port: u16, username: &Option<String>, password: &Option<String>) -> Result<BoxStream> {
    use base64::Engine as _;
    let authority = target_of(host, port);
    let mut request = format!("CONNECT {authority} HTTP/1.1\r\nHost: {authority}\r\n");
    if let Some(user) = username.as_deref().filter(|u| !u.is_empty()) {
        let token = base64::engine::general_purpose::STANDARD.encode(format!("{user}:{}", password.as_deref().unwrap_or("")));
        request.push_str(&format!("Proxy-Authorization: Basic {token}\r\n"));
    }
    request.push_str("\r\n");
    let io = |e: std::io::Error| unreachable(via, e);
    stream.write_all(request.as_bytes()).await.map_err(io)?;
    stream.flush().await.map_err(io)?;

    // Read byte by byte up to the blank line, so nothing that belongs to the tunnel is consumed.
    let mut head = Vec::with_capacity(256);
    let mut byte = [0u8; 1];
    while !head.ends_with(b"\r\n\r\n") {
        if stream.read(&mut byte).await.map_err(io)? == 0 || head.len() > 16 * 1024 {
            return Err(Error::ProxyRefused {
                target: via.to_string(),
                message: "the proxy closed the connection".into(),
            });
        }
        head.push(byte[0]);
    }
    let text = String::from_utf8_lossy(&head);
    let status = text.lines().next().unwrap_or_default();
    let code = status.split_whitespace().nth(1).unwrap_or_default();
    if !code.starts_with('2') {
        return Err(Error::ProxyRefused {
            target: via.to_string(),
            message: status.to_string(),
        });
    }
    Ok(stream)
}
