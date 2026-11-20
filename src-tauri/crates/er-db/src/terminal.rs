//! An interactive SSH terminal on a VM: the route of hops ends in the VM, where a session asks for a
//! pseudo-terminal and starts the login shell (or the program chosen, such as zsh or PowerShell). Output
//! goes to a callback as it arrives; input, size changes and closing go through the `Terminal` handle.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use russh::ChannelMsg;
use serde::Deserialize;
use tokio::sync::{mpsc, Mutex};

use crate::config::{ConnectionConfig, Hop};
use crate::error::{Error, Result};
use crate::transport::{self, within, Step};
use crate::{ssh, TestReport};

/// What the interface sends to open a terminal: the route, whose last hop is the VM, and the program.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSpec {
    pub hops: Vec<Hop>,
    /// Program to run instead of the login shell ("bash -l", "pwsh"...). None or empty: the login shell.
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
}

fn default_timeout() -> u64 {
    15
}

/// What the terminal reports while it runs.
#[derive(Debug)]
pub enum TerminalEvent {
    Output(Vec<u8>),
    /// The program ended (with its exit code when the server sends one) or the connection dropped.
    Exit(Option<u32>),
}

enum Input {
    Data(Vec<u8>),
    Resize(u32, u32),
}

/// An open terminal. Dropping it closes the session.
pub struct Terminal {
    input: mpsc::UnboundedSender<Input>,
    task: tokio::task::AbortHandle,
}

impl Terminal {
    pub fn write(&self, data: Vec<u8>) {
        let _ = self.input.send(Input::Data(data));
    }

    pub fn resize(&self, cols: u32, rows: u32) {
        let _ = self.input.send(Input::Resize(cols.max(1), rows.max(1)));
    }
}

impl Drop for Terminal {
    fn drop(&mut self) {
        self.task.abort();
    }
}

fn not_a_vm() -> Error {
    Error::Unsupported {
        message: "the last step of a terminal route must be an SSH host".into(),
    }
}

/// Reaches the VM and signs in, without starting anything: what "Test connection" does for a saved VM.
pub async fn test(spec: &TerminalSpec) -> TestReport {
    crate::init();
    let mut steps = Vec::new();
    let error = session(spec, &mut steps).await.err();
    TestReport {
        steps,
        server_version: None,
        error,
    }
}

/// The route to the VM and an authenticated SSH session on it, with what must stay alive under it.
async fn session(spec: &TerminalSpec, steps: &mut Vec<Step>) -> Result<(russh::client::Handle<ssh::HostCheck>, transport::Guards)> {
    let (vm, before) = spec.hops.split_last().ok_or_else(not_a_vm)?;
    let Hop::Ssh {
        host,
        port,
        user,
        auth,
        host_key,
        ..
    } = vm
    else {
        return Err(not_a_vm());
    };
    // The hops before the VM lead to its SSH port, exactly as they lead to a database.
    let route = ConnectionConfig {
        host: host.clone(),
        port: *port,
        hops: before.to_vec(),
        timeout_secs: spec.timeout_secs,
        ..Default::default()
    };
    let tunnel = transport::open(&route, steps).await?;
    let target = format!("{host}:{port}");
    let started = Instant::now();
    let handle = within(
        spec.timeout_secs,
        "ssh",
        &target,
        ssh::session(tunnel.stream, host, *port, user, auth, host_key.as_deref()),
    )
    .await?;
    steps.push(Step {
        kind: "ssh",
        target,
        ms: started.elapsed().as_millis() as u64,
    });
    Ok((handle, tunnel.guards))
}

/// Opens the route, the SSH session on the VM, a pseudo-terminal and the shell.
pub async fn open(
    spec: &TerminalSpec,
    cols: u32,
    rows: u32,
    steps: &mut Vec<Step>,
    on_event: impl Fn(TerminalEvent) + Send + Sync + 'static,
) -> Result<Terminal> {
    crate::init();
    let (handle, guards) = session(spec, steps).await?;
    let target = steps.last().map(|s| s.target.clone()).unwrap_or_default();
    let refused = |e: russh::Error| Error::TunnelRefused {
        target: target.clone(),
        message: e.to_string(),
    };
    let channel = handle.channel_open_session().await.map_err(refused)?;
    channel
        .request_pty(false, "xterm-256color", cols.max(1), rows.max(1), 0, 0, &[])
        .await
        .map_err(refused)?;
    match spec.command.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
        Some(command) => channel.exec(false, command).await.map_err(refused)?,
        None => channel.request_shell(false).await.map_err(refused)?,
    }

    let (mut read, write) = channel.split();
    let (input, mut inputs) = mpsc::unbounded_channel();
    let task = tokio::spawn(async move {
        // The session and the hops under it stay alive while the terminal runs.
        let _session = handle;
        let _guards = guards;
        let mut code = None;
        loop {
            tokio::select! {
                message = read.wait() => match message {
                    Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => on_event(TerminalEvent::Output(data.to_vec())),
                    Some(ChannelMsg::ExitStatus { exit_status }) => code = Some(exit_status),
                    // The exit code comes after the end of the output, and the close after both.
                    Some(ChannelMsg::Close) | None => break,
                    _ => {}
                },
                next = inputs.recv() => match next {
                    Some(Input::Data(bytes)) => {
                        if write.data_bytes(bytes).await.is_err() {
                            break;
                        }
                    }
                    Some(Input::Resize(cols, rows)) => {
                        let _ = write.window_change(cols, rows, 0, 0).await;
                    }
                    None => {
                        let _ = write.close().await;
                        break;
                    }
                },
            }
        }
        on_event(TerminalEvent::Exit(code));
    });
    Ok(Terminal {
        input,
        task: task.abort_handle(),
    })
}

/// Open terminals, addressed by a number the interface keeps.
#[derive(Default)]
pub struct Terminals {
    next: AtomicU64,
    open: Mutex<HashMap<u64, Terminal>>,
}

/// What opening reports: the terminal id, or the steps that worked and the error.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOpened {
    pub terminal_id: Option<u64>,
    pub report: TestReport,
}

impl Terminals {
    pub async fn open(&self, spec: &TerminalSpec, cols: u32, rows: u32, on_event: impl Fn(TerminalEvent) + Send + Sync + 'static) -> TerminalOpened {
        let mut steps = Vec::new();
        match open(spec, cols, rows, &mut steps, on_event).await {
            Ok(terminal) => {
                let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
                self.open.lock().await.insert(id, terminal);
                TerminalOpened {
                    terminal_id: Some(id),
                    report: TestReport {
                        steps,
                        server_version: None,
                        error: None,
                    },
                }
            }
            Err(error) => TerminalOpened {
                terminal_id: None,
                report: TestReport {
                    steps,
                    server_version: None,
                    error: Some(error),
                },
            },
        }
    }

    pub async fn write(&self, id: u64, data: Vec<u8>) -> Result<()> {
        self.open.lock().await.get(&id).ok_or(Error::SessionClosed)?.write(data);
        Ok(())
    }

    pub async fn resize(&self, id: u64, cols: u32, rows: u32) -> Result<()> {
        self.open.lock().await.get(&id).ok_or(Error::SessionClosed)?.resize(cols, rows);
        Ok(())
    }

    pub async fn close(&self, id: u64) {
        self.open.lock().await.remove(&id);
    }
}
