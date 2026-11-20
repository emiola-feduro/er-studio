//! SSH terminals on the test bastions of tests/env/up.sh. Run with ERDB_TEST=1.

use std::time::Duration;

use er_db::terminal::{TerminalEvent, TerminalSpec, Terminals};
use er_db::{Error, Hop, SshAuth};
use tokio::sync::mpsc;

fn enabled() -> bool {
    std::env::var("ERDB_TEST").is_ok()
}

fn ssh(host: &str, port: u16, host_key: Option<String>) -> Hop {
    Hop::Ssh {
        host: host.into(),
        port,
        user: "tunnel".into(),
        auth: SshAuth::Password { password: "clave-ssh".into() },
        host_key,
        secret_id: None,
    }
}

fn spec(hops: Vec<Hop>, command: Option<&str>) -> TerminalSpec {
    TerminalSpec {
        hops,
        command: command.map(str::to_string),
        timeout_secs: 15,
    }
}

/// The fingerprint a host shows the first time, as the interface learns it.
async fn learn(terminals: &Terminals, hops: Vec<Hop>) -> String {
    let opened = terminals.open(&spec(hops, None), 80, 24, |_| {}).await;
    match opened.report.error {
        Some(Error::UnknownHostKey { fingerprint, .. }) => fingerprint,
        other => panic!("{other:?}"),
    }
}

/// Reads output until `wanted` shows up; returns everything read and the exit code if it ended.
async fn until(events: &mut mpsc::UnboundedReceiver<TerminalEvent>, wanted: &str) -> (String, Option<Option<u32>>) {
    let mut text = String::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        let event = tokio::time::timeout_at(deadline, events.recv())
            .await
            .unwrap_or_else(|_| panic!("no {wanted:?} in {text:?}"));
        match event {
            Some(TerminalEvent::Output(bytes)) => {
                text.push_str(&String::from_utf8_lossy(&bytes));
                if text.contains(wanted) {
                    return (text, None);
                }
            }
            Some(TerminalEvent::Exit(code)) => return (text, Some(code)),
            None => panic!("closed before {wanted:?}: {text:?}"),
        }
    }
}

fn channel() -> (impl Fn(TerminalEvent) + Send + Sync + 'static, mpsc::UnboundedReceiver<TerminalEvent>) {
    let (tx, rx) = mpsc::unbounded_channel();
    (move |event| drop(tx.send(event)), rx)
}

#[tokio::test]
async fn a_shell_on_the_vm() {
    if !enabled() {
        return;
    }
    let terminals = Terminals::default();
    let key = learn(&terminals, vec![ssh("127.0.0.1", 52222, None)]).await;
    let (send, mut events) = channel();
    let opened = terminals.open(&spec(vec![ssh("127.0.0.1", 52222, Some(key))], None), 100, 30, send).await;
    let id = opened.terminal_id.unwrap_or_else(|| panic!("{:?}", opened.report.error));
    assert_eq!(opened.report.steps.iter().map(|s| s.kind).collect::<Vec<_>>(), ["tcp", "ssh"]);

    terminals.write(id, b"echo hola-$((40+2))\n".to_vec()).await.unwrap();
    until(&mut events, "hola-42").await;
    // The size reaches the pseudo-terminal.
    terminals.resize(id, 132, 40).await.unwrap();
    terminals.write(id, b"stty size\n".to_vec()).await.unwrap();
    until(&mut events, "40 132").await;
    terminals.write(id, b"exit 0\n".to_vec()).await.unwrap();
    let (_, exit) = until(&mut events, "\u{0}never").await;
    assert_eq!(exit, Some(Some(0)));
    terminals.close(id).await;
    assert!(matches!(terminals.write(id, b"x".to_vec()).await, Err(Error::SessionClosed)));
}

#[tokio::test]
async fn a_chosen_program_through_a_jump() {
    if !enabled() {
        return;
    }
    let terminals = Terminals::default();
    let first = learn(&terminals, vec![ssh("127.0.0.1", 52222, None)]).await;
    let bastion = ssh("127.0.0.1", 52222, Some(first));
    // ssh2 is only reachable from ssh1, like a VM behind a bastion.
    let second = learn(&terminals, vec![bastion.clone(), ssh("ssh2", 22, None)]).await;
    let (send, mut events) = channel();
    let hops = vec![bastion, ssh("ssh2", 22, Some(second))];
    let opened = terminals.open(&spec(hops, Some("echo elegido-$(hostname); exit 3")), 80, 24, send).await;
    assert!(opened.terminal_id.is_some(), "{:?}", opened.report.error);
    let (text, exit) = until(&mut events, "\u{0}never").await;
    assert!(text.contains("elegido-"), "{text:?}");
    assert_eq!(exit, Some(Some(3)));
}

#[tokio::test]
async fn a_route_must_end_in_an_ssh_host() {
    let terminals = Terminals::default();
    let socks = Hop::Socks5 {
        host: "127.0.0.1".into(),
        port: 1,
        username: None,
        password: None,
    };
    let opened = terminals.open(&spec(vec![socks], None), 80, 24, |_| {}).await;
    assert!(matches!(opened.report.error, Some(Error::Unsupported { .. })));
}

#[tokio::test]
async fn testing_a_vm_signs_in_without_a_shell() {
    if !enabled() {
        return;
    }
    let terminals = Terminals::default();
    let key = learn(&terminals, vec![ssh("127.0.0.1", 52222, None)]).await;
    let report = er_db::terminal::test(&spec(vec![ssh("127.0.0.1", 52222, Some(key.clone()))], None)).await;
    assert!(report.error.is_none(), "{:?}", report.error);
    assert_eq!(report.steps.iter().map(|s| s.kind).collect::<Vec<_>>(), ["tcp", "ssh"]);
    let mut wrong = ssh("127.0.0.1", 52222, Some(key));
    if let Hop::Ssh { auth, .. } = &mut wrong {
        *auth = SshAuth::Password { password: "otra".into() };
    }
    let report = er_db::terminal::test(&spec(vec![wrong], None)).await;
    assert!(matches!(report.error, Some(Error::SshAuthFailed { .. })), "{:?}", report.error);
}
