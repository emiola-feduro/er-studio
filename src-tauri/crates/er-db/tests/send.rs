//! Tauri runs async commands on a thread pool, so the connection futures must be Send for any lifetime.

use er_db::ConnectionConfig;

fn is_send<T: Send>(_: T) {}

#[allow(dead_code)]
fn connection_futures_are_send(config: &ConnectionConfig) {
    is_send(er_db::test_connection(config));
}

#[allow(dead_code)]
async fn as_a_command(config: ConnectionConfig) -> er_db::TestReport {
    er_db::test_connection(&config).await
}

#[test]
fn spawnable() {
    let config: ConnectionConfig =
        serde_json::from_str(r#"{"engine":"postgres","host":"127.0.0.1","port":1,"database":"x","user":"x","tls":{"mode":"disable"},"timeoutSecs":1}"#)
            .unwrap();
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let report = runtime.block_on(async { tokio::spawn(as_a_command(config)).await.unwrap() });
    assert!(report.error.is_some());
}

#[allow(dead_code)]
fn open_is_send(config: &ConnectionConfig, steps: &mut Vec<er_db::Step>) {
    is_send(er_db::transport::open(config, steps));
}

#[allow(dead_code)]
fn connect_is_send(config: &ConnectionConfig, steps: &mut Vec<er_db::Step>) {
    is_send(er_db::postgres::connect(config, steps));
}
