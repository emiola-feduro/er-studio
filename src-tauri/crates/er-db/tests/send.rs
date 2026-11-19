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

#[tokio::test]
async fn a_silent_address_does_not_block_the_next_one() {
    // 10.255.255.1 drops packets; the listener on 127.0.0.1 must still win quickly.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let addresses = vec![format!("10.255.255.1:{port}").parse().unwrap(), format!("127.0.0.1:{port}").parse().unwrap()];
    let started = std::time::Instant::now();
    er_db::transport::connect_any(addresses).await.unwrap();
    assert!(started.elapsed() < std::time::Duration::from_secs(2), "{:?}", started.elapsed());
}

#[allow(dead_code)]
fn session_futures_are_send(sessions: &er_db::session::Sessions, config: &ConnectionConfig, schemas: &[String], order: &[String]) {
    is_send(sessions.open(config));
    is_send(sessions.schemas(1));
    is_send(sessions.schema(1, schemas));
    is_send(sessions.rows(1, "s", "t", order, 0, 10));
    is_send(sessions.close(1));
}

#[allow(dead_code)]
fn live_query_futures_are_send(sessions: &std::sync::Arc<er_db::session::Sessions>, sql: &str) {
    is_send(sessions.run(1, sql, false, 10));
    is_send(sessions.finish(1, true));
    is_send(sessions.script(1, sql));
}
