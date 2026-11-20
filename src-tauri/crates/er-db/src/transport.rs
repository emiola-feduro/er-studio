//! A chain of hops (SSH, SOCKS, HTTP CONNECT) ending in a byte stream to the database server. Each hop
//! runs over the stream of the previous one, so nothing listens on a local port and TLS can later check
//! the real server name.

use std::any::Any;
use std::net::SocketAddr;
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

/// What must stay alive while a stream is used (the SSH sessions under it).
pub type Guards = Vec<Box<dyn Any + Send>>;

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

/// Runs one step with the connection's time limit. `step` is the kind of step ("tcp", "ssh", "database"...)
/// and `target` the address it was waiting for, so the error says where the connection stopped.
pub(crate) async fn within<T>(seconds: u64, step: &str, target: &str, future: impl std::future::Future<Output = Result<T>>) -> Result<T> {
    tokio::time::timeout(Duration::from_secs(seconds), future).await.map_err(|_| Error::Timeout {
        step: step.to_string(),
        target: target.to_string(),
        seconds,
    })?
}

/// Connects to every address the name resolves to, staggered by 250 ms and in parallel, and keeps the
/// first that answers (as browsers do). A name like "localhost" gives ::1 and 127.0.0.1; trying them one
/// after the other hangs when the first one is silently dropped.
pub(crate) async fn connect_tcp(host: &str, port: u16) -> std::io::Result<TcpStream> {
    let addresses: Vec<SocketAddr> = tokio::net::lookup_host(target_of(host, port)).await?.collect();
    connect_any(addresses).await
}

pub async fn connect_any(addresses: Vec<SocketAddr>) -> std::io::Result<TcpStream> {
    // Alternate the families, starting with the one the resolver put first.
    let first_v6 = addresses.first().is_some_and(SocketAddr::is_ipv6);
    let (mut same, mut other): (Vec<_>, Vec<_>) = addresses.into_iter().partition(|a| a.is_ipv6() == first_v6);
    same.reverse();
    other.reverse();
    let mut ordered = Vec::new();
    while !same.is_empty() || !other.is_empty() {
        ordered.extend(same.pop());
        ordered.extend(other.pop());
    }

    let mut attempts = tokio::task::JoinSet::new();
    for (index, address) in ordered.into_iter().enumerate() {
        attempts.spawn(async move {
            tokio::time::sleep(Duration::from_millis(250 * index as u64)).await;
            TcpStream::connect(address).await
        });
    }
    let mut last_error = None;
    while let Some(attempt) = attempts.join_next().await {
        match attempt {
            Ok(Ok(stream)) => {
                attempts.abort_all();
                return Ok(stream);
            }
            Ok(Err(error)) => last_error = Some(error),
            Err(_) => {}
        }
    }
    Err(last_error.unwrap_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "the name has no addresses")))
}

fn target_of(host: &str, port: u16) -> String {
    if host.contains(':') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

/// Opens a Unix socket on this computer (a local PostgreSQL or MySQL without TCP).
#[cfg(unix)]
pub async fn open_socket(path: &str, seconds: u64, steps: &mut Vec<Step>) -> Result<Tunnel> {
    let started = Instant::now();
    let stream = within(seconds, "socket", path, async {
        tokio::net::UnixStream::connect(path).await.map_err(|e| unreachable(path, e))
    })
    .await?;
    steps.push(Step {
        kind: "socket",
        target: path.to_string(),
        ms: started.elapsed().as_millis() as u64,
    });
    Ok(Tunnel {
        stream: Box::new(stream),
        guards: Vec::new(),
    })
}

#[cfg(not(unix))]
pub async fn open_socket(path: &str, _seconds: u64, _steps: &mut Vec<Step>) -> Result<Tunnel> {
    Err(unreachable(path, "Unix sockets only exist on Linux and macOS"))
}

/// For drivers that open their own TCP connection (MySQL): a one-shot listener on 127.0.0.1 that hands the
/// first connection to the tunnel. It serves one connection and then stops listening.
pub async fn local_forward(tunnel: Tunnel) -> Result<u16> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| unreachable("127.0.0.1", e))?;
    let port = listener.local_addr().map_err(|e| unreachable("127.0.0.1", e))?.port();
    tokio::spawn(async move {
        if let Ok((mut local, _)) = listener.accept().await {
            drop(listener);
            let Tunnel { mut stream, guards } = tunnel;
            let _ = tokio::io::copy_bidirectional(&mut local, &mut stream).await;
            drop(guards);
        }
    });
    Ok(port)
}

/// Stops a local forward when dropped, closing both of its sockets: a driver blocked reading from it
/// gets an error instead of waiting forever.
pub struct ForwardGuard(tokio::task::AbortHandle);

impl Drop for ForwardGuard {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// Like `local_forward`, but the forward lives only as long as the guard it returns.
pub async fn local_forward_guarded(tunnel: Tunnel) -> Result<(u16, ForwardGuard)> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| unreachable("127.0.0.1", e))?;
    let port = listener.local_addr().map_err(|e| unreachable("127.0.0.1", e))?.port();
    let task = tokio::spawn(async move {
        if let Ok((mut local, _)) = listener.accept().await {
            drop(listener);
            let Tunnel { mut stream, guards } = tunnel;
            let _ = tokio::io::copy_bidirectional(&mut local, &mut stream).await;
            drop(guards);
        }
    });
    Ok((port, ForwardGuard(task.abort_handle())))
}

/// Opens the chain and returns the stream to `config.host:config.port`, recording each step.
pub async fn open(config: &ConnectionConfig, steps: &mut Vec<Step>) -> Result<Tunnel> {
    let seconds = config.timeout_secs;
    let (first_host, first_port) = config.hops.first().map(Hop::address).unwrap_or((config.host.clone(), config.port));
    let first = target_of(&first_host, first_port);

    let started = Instant::now();
    let tcp = within(seconds, "tcp", &first, async {
        connect_tcp(&first_host, first_port).await.map_err(|e| unreachable(&first, e))
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
                let stream = within(seconds, "socks5", &next, socks5(stream, &via, &next_host, next_port, username, password)).await?;
                ("socks5", stream)
            }
            Hop::Socks4 { host, port, user_id } => {
                let via = target_of(host, *port);
                let stream = within(seconds, "socks4", &next, socks4(stream, &via, &next_host, next_port, user_id)).await?;
                ("socks4", stream)
            }
            Hop::HttpConnect {
                host,
                port,
                username,
                password,
            } => {
                let via = target_of(host, *port);
                let stream = within(seconds, "http", &next, http_connect(stream, &via, &next_host, next_port, username, password)).await?;
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
                    "ssh",
                    &next,
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
