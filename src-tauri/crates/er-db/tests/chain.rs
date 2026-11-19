//! Connection chains against real servers. Start them with tests/env/up.sh and run with ERDB_TEST=1;
//! without it these tests return right away.

use std::path::PathBuf;

use er_db::{test_connection, ConnectionConfig, Engine, Error, Hop, SshAuth, TestReport, TlsConfig, TlsMode};

fn enabled() -> bool {
    std::env::var("ERDB_TEST").is_ok()
}

fn dir() -> PathBuf {
    std::env::var("ERDB_TEST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/env/.generated"))
}

fn read(name: &str) -> String {
    std::fs::read_to_string(dir().join(name)).unwrap_or_else(|e| panic!("{name}: {e}"))
}

/// The database as seen from inside the container network: host "db", which the certificate names.
fn db_inside(tls: TlsMode, hops: Vec<Hop>) -> ConnectionConfig {
    ConnectionConfig {
        engine: Engine::Postgres,
        host: "db".into(),
        port: 5432,
        database: "tienda".into(),
        user: "postgres".into(),
        password: Some("secreto".into()),
        tls: TlsConfig {
            mode: tls,
            ca_pem: Some(read("ca.pem")),
            ..Default::default()
        },
        hops,
        timeout_secs: 20,
        ..Default::default()
    }
}

fn db_published(tls: TlsMode) -> ConnectionConfig {
    ConnectionConfig {
        host: "127.0.0.1".into(),
        port: 55432,
        ..db_inside(tls, vec![])
    }
}

fn ssh1(auth: SshAuth, host_key: Option<String>) -> Hop {
    Hop::Ssh {
        host: "127.0.0.1".into(),
        port: 52222,
        user: "tunnel".into(),
        auth,
        host_key,
    }
}

fn password() -> SshAuth {
    SshAuth::Password { password: "clave-ssh".into() }
}

/// Learns the bastion's host key the way the interface does: the first attempt reports it.
async fn ssh1_key() -> String {
    let report = test_connection(&db_inside(TlsMode::Disable, vec![ssh1(password(), None)])).await;
    match report.error {
        Some(Error::UnknownHostKey { fingerprint, .. }) => fingerprint,
        other => panic!("expected an unknown host key, got {other:?}"),
    }
}

fn ok(report: &TestReport) {
    assert!(report.error.is_none(), "error: {:?}\nsteps: {:?}", report.error, report.steps);
    assert!(
        report.server_version.as_deref().unwrap_or_default().starts_with("17"),
        "{:?}",
        report.server_version
    );
}

fn kinds(report: &TestReport) -> Vec<&str> {
    report.steps.iter().map(|s| s.kind).collect()
}

#[tokio::test]
async fn direct_without_tls() {
    if !enabled() {
        return;
    }
    let report = test_connection(&db_published(TlsMode::Disable)).await;
    ok(&report);
    assert_eq!(kinds(&report), ["tcp", "database"]);
}

#[tokio::test]
async fn verify_full_checks_the_host_name() {
    if !enabled() {
        return;
    }
    // The certificate names db and localhost, not 127.0.0.1.
    let report = test_connection(&db_published(TlsMode::VerifyFull)).await;
    assert!(
        matches!(&report.error, Some(Error::Database { message, .. }) if message.contains("not valid for name")),
        "{:?}",
        report.error
    );
    // verify-ca checks the chain only.
    ok(&test_connection(&db_published(TlsMode::VerifyCa)).await);
    // And with the name the certificate carries, verify-full passes.
    let mut config = db_published(TlsMode::VerifyFull);
    config.tls.server_name = Some("localhost".into());
    ok(&test_connection(&config).await);
    // Without the test CA the chain is not trusted.
    let mut config = db_published(TlsMode::VerifyCa);
    config.tls.ca_pem = None;
    assert!(test_connection(&config).await.error.is_some());
}

#[tokio::test]
async fn wrong_database_password() {
    if !enabled() {
        return;
    }
    let mut config = db_published(TlsMode::Require);
    config.password = Some("otra".into());
    let report = test_connection(&config).await;
    assert!(
        matches!(&report.error, Some(Error::Database { sql_state: Some(code), .. }) if code == "28P01"),
        "{:?}",
        report.error
    );
}

#[tokio::test]
async fn ssh_host_key_is_checked() {
    if !enabled() {
        return;
    }
    let key = ssh1_key().await;
    assert!(key.starts_with("SHA256:"));
    let report = test_connection(&db_inside(TlsMode::Disable, vec![ssh1(password(), Some("SHA256:otra".into()))])).await;
    assert!(matches!(report.error, Some(Error::HostKeyChanged { .. })), "{:?}", report.error);
}

#[tokio::test]
async fn ssh_password_then_tls_with_the_real_name() {
    if !enabled() {
        return;
    }
    let key = ssh1_key().await;
    // Through the tunnel the database is "db", the name in its certificate, so verify-full works.
    let report = test_connection(&db_inside(TlsMode::VerifyFull, vec![ssh1(password(), Some(key))])).await;
    ok(&report);
    assert_eq!(kinds(&report), ["tcp", "ssh", "database"]);
}

#[tokio::test]
async fn ssh_wrong_password() {
    if !enabled() {
        return;
    }
    let key = ssh1_key().await;
    let report = test_connection(&db_inside(
        TlsMode::Disable,
        vec![ssh1(SshAuth::Password { password: "mala".into() }, Some(key))],
    ))
    .await;
    assert!(matches!(report.error, Some(Error::SshAuthFailed { .. })), "{:?}", report.error);
}

#[tokio::test]
async fn ssh_keys_and_two_jumps() {
    if !enabled() {
        return;
    }
    let key1 = ssh1_key().await;
    let plain = SshAuth::Key {
        private_key: None,
        private_key_path: Some(dir().join("id_ed25519").display().to_string()),
        passphrase: None,
    };
    let with_passphrase = SshAuth::Key {
        private_key: Some(read("id_ed25519_pass")),
        private_key_path: None,
        passphrase: Some("frase".into()),
    };
    // First learn ssh2's key through ssh1.
    let second = |host_key| Hop::Ssh {
        host: "ssh2".into(),
        port: 22,
        user: "tunnel".into(),
        auth: with_passphrase.clone(),
        host_key,
    };
    let report = test_connection(&db_inside(TlsMode::Disable, vec![ssh1(plain.clone(), Some(key1.clone())), second(None)])).await;
    let Some(Error::UnknownHostKey { fingerprint: key2, .. }) = report.error else {
        panic!("{:?}", report.error)
    };
    let report = test_connection(&db_inside(TlsMode::VerifyFull, vec![ssh1(plain, Some(key1)), second(Some(key2))])).await;
    ok(&report);
    assert_eq!(kinds(&report), ["tcp", "ssh", "ssh", "database"]);

    let wrong = SshAuth::Key {
        private_key: Some(read("id_ed25519_pass")),
        private_key_path: None,
        passphrase: Some("otra".into()),
    };
    let report = test_connection(&db_inside(TlsMode::Disable, vec![ssh1(wrong, None)])).await;
    assert!(
        matches!(report.error, Some(Error::InvalidKey { .. }) | Some(Error::UnknownHostKey { .. })),
        "{:?}",
        report.error
    );
}

fn socks(password: &str) -> Hop {
    Hop::Socks5 {
        host: "127.0.0.1".into(),
        port: 51080,
        username: Some("proxy".into()),
        password: Some(password.into()),
    }
}

fn http(password: &str) -> Hop {
    Hop::HttpConnect {
        host: "127.0.0.1".into(),
        port: 58888,
        username: Some("proxy".into()),
        password: Some(password.into()),
    }
}

#[tokio::test]
async fn socks5_proxy() {
    if !enabled() {
        return;
    }
    let report = test_connection(&db_inside(TlsMode::VerifyFull, vec![socks("clave-proxy")])).await;
    ok(&report);
    assert_eq!(kinds(&report), ["tcp", "socks5", "database"]);
    let report = test_connection(&db_inside(TlsMode::Disable, vec![socks("mala")])).await;
    assert!(matches!(report.error, Some(Error::ProxyRefused { .. })), "{:?}", report.error);
}

#[tokio::test]
async fn http_connect_proxy() {
    if !enabled() {
        return;
    }
    let report = test_connection(&db_inside(TlsMode::VerifyFull, vec![http("clave-proxy")])).await;
    ok(&report);
    assert_eq!(kinds(&report), ["tcp", "http", "database"]);
    let report = test_connection(&db_inside(TlsMode::Disable, vec![http("mala")])).await;
    assert!(
        matches!(&report.error, Some(Error::ProxyRefused { message, .. }) if message.contains("407") || message.contains("401")),
        "{:?}",
        report.error
    );
}

#[tokio::test]
async fn proxy_then_ssh_then_database() {
    if !enabled() {
        return;
    }
    // The proxy reaches the bastion by its network name; the bastion reaches the database.
    let bastion = |host_key| Hop::Ssh {
        host: "ssh1".into(),
        port: 22,
        user: "tunnel".into(),
        auth: password(),
        host_key,
    };
    let report = test_connection(&db_inside(TlsMode::Disable, vec![http("clave-proxy"), bastion(None)])).await;
    let Some(Error::UnknownHostKey { fingerprint, .. }) = report.error else {
        panic!("{:?}", report.error)
    };
    let report = test_connection(&db_inside(TlsMode::VerifyFull, vec![socks("clave-proxy"), bastion(Some(fingerprint))])).await;
    ok(&report);
    assert_eq!(kinds(&report), ["tcp", "socks5", "ssh", "database"]);
}

#[tokio::test]
async fn unreachable_host_and_timeout() {
    if !enabled() {
        return;
    }
    let mut config = db_published(TlsMode::Disable);
    config.port = 1;
    assert!(matches!(test_connection(&config).await.error, Some(Error::Unreachable { .. })));
    // 10.255.255.1 does not answer, so the connection times out.
    let mut config = db_published(TlsMode::Disable);
    config.host = "10.255.255.1".into();
    config.timeout_secs = 1;
    assert!(matches!(test_connection(&config).await.error, Some(Error::Timeout { .. })));
}
