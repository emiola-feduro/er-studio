//! SSH hop: opens a session over the previous stream, checks the host key, authenticates and asks the
//! server for a direct-tcpip channel to the next address. The channel is the new stream.

use std::any::Any;
use std::sync::{Arc, Mutex};

use russh::client::AuthResult;
use russh::client::{self, Handle};
use russh::keys::PublicKeyOrCertificate;
use russh::keys::{HashAlg, PrivateKeyWithHashAlg, PublicKey};

use crate::config::SshAuth;
use crate::error::{Error, Result};
use crate::transport::BoxStream;

/// SHA256 fingerprint as OpenSSH prints it: "SHA256:base64".
pub fn fingerprint(key: &PublicKey) -> String {
    key.fingerprint(HashAlg::Sha256).to_string()
}

struct HostCheck {
    host: String,
    port: u16,
    expected: Option<String>,
    /// Why the key was rejected, read after the handshake fails.
    rejection: Arc<Mutex<Option<Error>>>,
}

impl client::Handler for HostCheck {
    type Error = russh::Error;

    async fn check_server_key(&mut self, server_key: &PublicKeyOrCertificate) -> std::result::Result<bool, Self::Error> {
        let key = match server_key {
            PublicKeyOrCertificate::PublicKey { key, .. } => key.clone(),
            PublicKeyOrCertificate::Certificate(cert) => PublicKey::new(cert.public_key().clone(), ""),
        };
        let actual = fingerprint(&key);
        let host = if self.port == 22 {
            self.host.clone()
        } else {
            format!("[{}]:{}", self.host, self.port)
        };
        let verdict = match &self.expected {
            Some(expected) if *expected == actual => Ok(()),
            Some(expected) => Err(Error::HostKeyChanged {
                host,
                expected: expected.clone(),
                actual,
            }),
            None => match russh::keys::check_known_hosts(&self.host, self.port, &key) {
                Ok(true) => Ok(()),
                Err(russh::keys::Error::KeyChanged { .. }) => Err(Error::HostKeyChanged {
                    host,
                    expected: "~/.ssh/known_hosts".into(),
                    actual,
                }),
                _ => Err(Error::UnknownHostKey { host, fingerprint: actual }),
            },
        };
        match verdict {
            Ok(()) => Ok(true),
            Err(error) => {
                *self.rejection.lock().unwrap() = Some(error);
                Ok(false)
            }
        }
    }
}

/// Keeps the SSH session open while its channel is in use.
struct SessionGuard(#[allow(dead_code)] Handle<HostCheck>);

#[allow(clippy::too_many_arguments)]
pub(crate) async fn tunnel(
    stream: BoxStream,
    host: &str,
    port: u16,
    user: &str,
    auth: &SshAuth,
    host_key: Option<&str>,
    next_host: &str,
    next_port: u16,
) -> Result<(BoxStream, Box<dyn Any + Send>)> {
    let target = format!("{host}:{port}");
    let rejection = Arc::new(Mutex::new(None));
    let handler = HostCheck {
        host: host.to_string(),
        port,
        expected: host_key.map(str::to_string),
        rejection: rejection.clone(),
    };
    let config = Arc::new(client::Config {
        keepalive_interval: Some(std::time::Duration::from_secs(30)),
        ..Default::default()
    });

    let mut handle = match client::connect_stream(config, stream, handler).await {
        Ok(handle) => handle,
        Err(error) => {
            return Err(rejection.lock().unwrap().take().unwrap_or_else(|| Error::Unreachable {
                target,
                message: error.to_string(),
            }));
        }
    };

    let failed = |message: String| Error::SshAuthFailed {
        host: host.to_string(),
        user: user.to_string(),
        message,
    };
    let result = match auth {
        SshAuth::Password { password } => handle.authenticate_password(user, password).await.map_err(|e| failed(e.to_string()))?,
        SshAuth::Key {
            private_key,
            private_key_path,
            passphrase,
        } => {
            let text = match (
                private_key.as_deref().filter(|k| !k.trim().is_empty()),
                private_key_path.as_deref().filter(|p| !p.trim().is_empty()),
            ) {
                (Some(text), _) => text.to_string(),
                (None, Some(path)) => std::fs::read_to_string(expand_home(path)).map_err(|e| Error::InvalidKey {
                    message: format!("{path}: {e}"),
                })?,
                (None, None) => {
                    return Err(Error::InvalidKey {
                        message: "no private key given".into(),
                    })
                }
            };
            let key = russh::keys::decode_secret_key(&text, passphrase.as_deref().filter(|p| !p.is_empty()))
                .map_err(|e| Error::InvalidKey { message: e.to_string() })?;
            let hash = handle.best_supported_rsa_hash().await.map_err(|e| failed(e.to_string()))?.flatten();
            handle
                .authenticate_publickey(user, PrivateKeyWithHashAlg::new(Arc::new(key), hash))
                .await
                .map_err(|e| failed(e.to_string()))?
        }
        SshAuth::Agent => agent_auth(&mut handle, user).await.map_err(failed)?,
    };
    if !matches!(result, AuthResult::Success) {
        return Err(failed("the server rejected the credentials".into()));
    }

    let channel = handle
        .channel_open_direct_tcpip(next_host, next_port as u32, "127.0.0.1", 0)
        .await
        .map_err(|e| Error::TunnelRefused {
            target: format!("{next_host}:{next_port}"),
            message: e.to_string(),
        })?;
    Ok((Box::new(channel.into_stream()), Box::new(SessionGuard(handle))))
}

/// Tries every key the agent holds until one is accepted.
async fn agent_auth(handle: &mut Handle<HostCheck>, user: &str) -> std::result::Result<AuthResult, String> {
    #[cfg(unix)]
    let agent = russh::keys::agent::client::AgentClient::connect_env().await.map(|a| a.dynamic());
    #[cfg(windows)]
    let agent = match russh::keys::agent::client::AgentClient::connect_named_pipe(r"\\.\pipe\openssh-ssh-agent").await {
        Ok(agent) => Ok(agent.dynamic()),
        Err(_) => russh::keys::agent::client::AgentClient::connect_pageant().await.map(|a| a.dynamic()),
    };
    let mut agent = agent.map_err(|e| format!("no SSH agent available: {e}"))?;
    let identities = agent.request_identities().await.map_err(|e| e.to_string())?;
    if identities.is_empty() {
        return Err("the SSH agent holds no keys".into());
    }
    let hash = handle.best_supported_rsa_hash().await.map_err(|e| e.to_string())?.flatten();
    for identity in identities {
        let key = identity.public_key().into_owned();
        if let Ok(AuthResult::Success) = handle.authenticate_publickey_with(user, key, hash, &mut agent).await {
            return Ok(AuthResult::Success);
        }
    }
    Err("no key in the SSH agent was accepted".into())
}

/// "~/.ssh/id_ed25519" → the file in the home folder.
fn expand_home(path: &str) -> std::path::PathBuf {
    match path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        Some(rest) => std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(std::path::PathBuf::from)
            .unwrap_or_default()
            .join(rest),
        None => std::path::PathBuf::from(path),
    }
}
