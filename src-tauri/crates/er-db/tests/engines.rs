//! Live queries, transactions and schema reading on every engine. Start the servers with tests/env/up.sh
//! (ERDB_MSSQL=1 adds SQL Server) and run with ERDB_TEST=1.

use std::path::PathBuf;
use std::sync::Arc;

use er_db::session::Sessions;
use er_db::{ConnectionConfig, Engine, Error, Hop, SshAuth, TlsConfig, TlsMode};

fn enabled() -> bool {
    std::env::var("ERDB_TEST").is_ok()
}

fn generated() -> PathBuf {
    std::env::var("ERDB_TEST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/env/.generated"))
}

fn config(engine: Engine, port: u16, user: &str, password: &str, database: &str, tls: TlsMode, allow_writes: bool) -> ConnectionConfig {
    ConnectionConfig {
        engine,
        host: "127.0.0.1".into(),
        port,
        database: database.into(),
        user: user.into(),
        password: Some(password.into()),
        tls: TlsConfig {
            mode: tls,
            ..Default::default()
        },
        timeout_secs: 30,
        allow_writes,
        ..Default::default()
    }
}

async fn open(sessions: &Arc<Sessions>, config: &ConnectionConfig) -> u64 {
    let opened = sessions.open(config).await;
    opened
        .session_id
        .unwrap_or_else(|| panic!("{:?} {:?}", opened.report.error, opened.report.steps))
}

async fn count(sessions: &Arc<Sessions>, id: u64, table: &str) -> String {
    let result = sessions.run(id, &format!("SELECT COUNT(*) AS n FROM {table}"), false, 10).await.unwrap();
    result.output.rows[0][0].clone().unwrap()
}

/// The same checks on any engine: reads roll back, writes wait for a decision, and the guard rails hold.
async fn transactions(sessions: &Arc<Sessions>, id: u64, read_only_id: u64, table: &str) {
    // A read gives rows as text.
    let read = sessions
        .run(id, &format!("SELECT id, nombre FROM {table} ORDER BY id"), false, 1)
        .await
        .unwrap();
    // Oracle names the columns in uppercase.
    let columns: Vec<String> = read.output.columns.iter().map(|c| c.to_lowercase()).collect();
    assert_eq!(columns, ["id", "nombre"]);
    assert_eq!(read.output.rows, [[Some("1".to_string()), Some("Ana".to_string())]]);
    assert!(read.output.truncated, "two rows, one kept");
    assert!(!read.pending);

    // A write without confirmation is refused, and so is any write on a read-only connection.
    let refused = sessions.run(id, &format!("DELETE FROM {table}"), false, 10).await;
    assert!(matches!(refused, Err(Error::NotReadOnly)), "{refused:?}");
    let refused = sessions.run(read_only_id, &format!("DELETE FROM {table}"), true, 10).await;
    assert!(matches!(refused, Err(Error::WritesDisabled)), "{refused:?}");

    // A write stays pending: undo brings everything back.
    let write = sessions
        .run(id, &format!("UPDATE {table} SET nombre = 'Zoe' WHERE id = 1"), true, 10)
        .await
        .unwrap();
    assert!(write.pending);
    assert_eq!(write.output.rows_affected, Some(1));
    let busy = sessions.run(id, &format!("SELECT id FROM {table}"), false, 10).await;
    assert!(matches!(busy, Err(Error::PendingWrite)), "{busy:?}");
    sessions.finish(id, false).await.unwrap();
    let after = sessions.run(id, &format!("SELECT nombre FROM {table} WHERE id = 1"), false, 10).await.unwrap();
    assert_eq!(after.output.rows[0][0].as_deref(), Some("Ana"));

    // Confirmed, it stays.
    sessions
        .run(id, &format!("INSERT INTO {table} (id, nombre) VALUES (3, 'Eva')"), true, 10)
        .await
        .unwrap();
    sessions.finish(id, true).await.unwrap();
    assert_eq!(count(sessions, id, table).await, "3");
    assert!(matches!(sessions.finish(id, true).await, Err(Error::NothingPending)));

    // A script runs as one unit.
    sessions.script(id, &format!("DELETE FROM {table} WHERE id = 3")).await.unwrap();
    assert_eq!(count(sessions, id, table).await, "2");
}

#[tokio::test]
async fn postgres_live_queries() {
    if !enabled() {
        return;
    }
    let sessions = Arc::new(Sessions::default());
    let admin = config(Engine::Postgres, 55432, "postgres", "secreto", "tienda", TlsMode::Require, true);
    let id = open(&sessions, &admin).await;
    sessions
        .script(
            id,
            "DROP TABLE IF EXISTS vivo; CREATE TABLE vivo (id int PRIMARY KEY, nombre text NOT NULL); INSERT INTO vivo VALUES (1, 'Ana'), (2, 'Luis');",
        )
        .await
        .unwrap();
    let read_only = open(
        &sessions,
        &ConnectionConfig {
            allow_writes: false,
            ..admin.clone()
        },
    )
    .await;
    transactions(&sessions, id, read_only, "vivo").await;
    // Even a statement that slips past the check cannot write in a read-only transaction.
    let sneaky = sessions
        .run(read_only, "WITH x AS (DELETE FROM vivo RETURNING 1) SELECT count(*) FROM x", false, 10)
        .await;
    assert!(sneaky.is_err(), "{sneaky:?}");
    assert_eq!(count(&sessions, id, "vivo").await, "2");
    sessions.script(id, "DROP TABLE vivo").await.unwrap();
}

const MYSQL_FIXTURE: &str = "
DROP TABLE IF EXISTS pedido; DROP TABLE IF EXISTS cliente; DROP VIEW IF EXISTS v_cliente;
CREATE TABLE cliente (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  email VARCHAR(120) UNIQUE,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  tipo ENUM('persona','empresa') NOT NULL DEFAULT 'persona',
  saldo DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (saldo >= 0),
  creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE pedido (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT UNSIGNED NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id) ON DELETE CASCADE,
  INDEX idx_pedido_total (total DESC)
);
CREATE VIEW v_cliente AS SELECT nombre FROM cliente;
INSERT INTO cliente (id, nombre, email, tipo) VALUES (1, 'Ana', 'ana@x.com', 'persona'), (2, 'Luis', NULL, 'empresa');
INSERT INTO pedido (cliente_id, total) VALUES (1, 10.5);
";

async fn mysql_like(port: u16, tls: TlsMode, label: &str) {
    let sessions = Arc::new(Sessions::default());
    let admin = config(Engine::Mysql, port, "root", "secreto", "tienda", tls, true);
    let id = open(&sessions, &admin).await;
    sessions.script(id, MYSQL_FIXTURE).await.unwrap();

    let schemas = sessions.schemas(id).await.unwrap();
    assert!(schemas.iter().any(|s| s.name == "tienda" && s.tables == 2), "{label}: {schemas:?}");
    let read = sessions.schema(id, &["tienda".into()]).await.unwrap();
    let json = serde_json::to_value(&read.ir).unwrap();
    // The interface's tests read this output as a fixture; regenerate it with ERDB_DUMP_DIR=<folder>.
    if let Ok(dir) = std::env::var("ERDB_DUMP_DIR") {
        std::fs::write(format!("{dir}/{label}-schema.json"), serde_json::to_string_pretty(&read).unwrap()).unwrap();
    }
    let table = |name: &str| json["tables"].as_array().unwrap().iter().find(|t| t["name"] == name).unwrap().clone();
    let column = |t: &serde_json::Value, name: &str| t["columns"].as_array().unwrap().iter().find(|c| c["name"] == name).unwrap().clone();
    assert_eq!(json["dialect"], "mysql");
    let cliente = table("cliente");
    assert_eq!(column(&cliente, "id")["autoIncrement"], true, "{label}");
    assert_eq!(column(&cliente, "id")["pk"], true, "{label}");
    assert_eq!(column(&cliente, "tipo")["enumValues"], serde_json::json!(["persona", "empresa"]), "{label}");
    assert_eq!(column(&cliente, "tipo")["defaultValue"], "'persona'", "{label}");
    assert_eq!(column(&cliente, "nombre")["params"], serde_json::json!(["80"]), "{label}");
    assert_eq!(column(&cliente, "saldo")["params"], serde_json::json!(["10", "2"]), "{label}");
    assert_eq!(cliente["uniques"][0]["columns"], serde_json::json!(["email"]), "{label}");
    assert!(
        cliente["checks"][0]["expression"].as_str().unwrap().contains("saldo >= 0"),
        "{label}: {}",
        cliente["checks"]
    );
    let pedido = table("pedido");
    let fk = &pedido["foreignKeys"][0];
    assert_eq!(
        (fk["refTable"].as_str(), fk["onDelete"].as_str()),
        (Some("cliente"), Some("CASCADE")),
        "{label}"
    );
    let indexes: Vec<&str> = pedido["indexes"].as_array().unwrap().iter().map(|i| i["name"].as_str().unwrap()).collect();
    assert_eq!(indexes, ["idx_pedido_total"], "{label}: the FK's own index is left out");
    assert!(json["skipped"].as_array().unwrap().iter().any(|s| s == "VIEW v_cliente"), "{label}");

    let page = sessions.rows(id, "tienda", "cliente", &["id".to_string()], 0, 10).await.unwrap();
    assert_eq!(page.rows.len(), 2);
    assert_eq!(page.rows[1][2], None, "{label}: NULL email");

    let read_only = open(
        &sessions,
        &ConnectionConfig {
            allow_writes: false,
            ..admin.clone()
        },
    )
    .await;
    sessions.script(id, "DELETE FROM pedido").await.unwrap();
    transactions(&sessions, id, read_only, "cliente").await;
}

#[tokio::test]
async fn mysql_and_mariadb() {
    if !enabled() {
        return;
    }
    er_db::init();
    // MySQL 8.4 makes its own certificate, so TLS is required; MariaDB has none, so "prefer" falls back.
    mysql_like(53306, TlsMode::Require, "mysql").await;
    mysql_like(53307, TlsMode::Prefer, "mariadb").await;
}

#[tokio::test]
async fn mysql_through_an_ssh_tunnel() {
    if !enabled() {
        return;
    }
    let sessions = Arc::new(Sessions::default());
    // Learn the bastion key first, as the interface does.
    let mut cfg = config(Engine::Mysql, 3306, "root", "secreto", "tienda", TlsMode::Require, false);
    cfg.host = "mysql".into();
    let hop = |host_key| Hop::Ssh {
        host: "127.0.0.1".into(),
        port: 52222,
        user: "tunnel".into(),
        auth: SshAuth::Password { password: "clave-ssh".into() },
        host_key,
    };
    cfg.hops = vec![hop(None)];
    let report = er_db::test_connection(&cfg).await;
    let Some(Error::UnknownHostKey { fingerprint, .. }) = report.error else {
        panic!("{:?}", report.error)
    };
    cfg.hops = vec![hop(Some(fingerprint))];
    let id = open(&sessions, &cfg).await;
    let one = sessions.run(id, "SELECT 1 AS uno", false, 10).await.unwrap();
    assert_eq!(one.output.rows[0][0].as_deref(), Some("1"));
}

#[tokio::test]
async fn sqlite_file_in_place() {
    let dir = std::env::temp_dir().join(format!("erdb-sqlite-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("tienda.db");
    {
        let conn = rusqlite::Connection::open(&file).unwrap();
        conn.execute_batch("CREATE TABLE cliente (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, foto BLOB); INSERT INTO cliente VALUES (1, 'Ana', x'cafe'), (2, 'Luis', NULL);")
            .unwrap();
    }
    let sessions = Arc::new(Sessions::default());
    let base = ConnectionConfig {
        engine: Engine::Sqlite,
        file: Some(file.display().to_string()),
        timeout_secs: 30,
        allow_writes: true,
        ..Default::default()
    };
    let id = open(&sessions, &base).await;
    let read_only = open(
        &sessions,
        &ConnectionConfig {
            allow_writes: false,
            ..base.clone()
        },
    )
    .await;
    let blob = sessions.run(id, "SELECT foto FROM cliente WHERE id = 1", false, 10).await.unwrap();
    assert_eq!(blob.output.rows[0][0].as_deref(), Some("0xcafe"));
    transactions(&sessions, id, read_only, "cliente").await;
    sessions.close(id).await;
    sessions.close(read_only).await;
    // The change confirmed above is in the file itself.
    let conn = rusqlite::Connection::open(&file).unwrap();
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM cliente", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 2);
    // A missing file is an error, not a new empty database.
    let missing = er_db::test_connection(&ConnectionConfig {
        file: Some(dir.join("no-existe.db").display().to_string()),
        ..base.clone()
    })
    .await;
    assert!(missing.error.is_some());
    assert!(!dir.join("no-existe.db").exists());
    std::fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn sql_server() {
    if !enabled() || std::env::var("ERDB_MSSQL").is_err() {
        return;
    }
    let sessions = Arc::new(Sessions::default());
    // tests/env/up.sh creates the "tienda" database: CREATE DATABASE cannot run inside a transaction.
    let admin = config(Engine::SqlServer, 51433, "sa", "Secreto.2026", "tienda", TlsMode::Require, true);
    let id = open(&sessions, &admin).await;
    sessions
        .script(
            id,
            "IF OBJECT_ID('dbo.pedido') IS NOT NULL DROP TABLE dbo.pedido;
             IF OBJECT_ID('dbo.cliente') IS NOT NULL DROP TABLE dbo.cliente;
             CREATE TABLE dbo.cliente (
               id int IDENTITY(1,1) PRIMARY KEY,
               nombre nvarchar(80) NOT NULL,
               tipo varchar(10) NOT NULL CONSTRAINT df_tipo DEFAULT 'persona' CONSTRAINT ck_tipo CHECK (tipo IN ('persona', 'empresa')),
               saldo decimal(10,2) NOT NULL DEFAULT 0,
               creado datetime2 NOT NULL DEFAULT SYSDATETIME(),
               foto varbinary(max) NULL
             );
             CREATE TABLE dbo.pedido (
               id int IDENTITY PRIMARY KEY,
               cliente_id int NOT NULL CONSTRAINT fk_pedido_cliente REFERENCES dbo.cliente (id) ON DELETE CASCADE,
               total decimal(10,2) NOT NULL
             );
             CREATE INDEX idx_pedido_total ON dbo.pedido (total DESC) WHERE total > 0;
             SET IDENTITY_INSERT dbo.cliente ON;
             INSERT INTO dbo.cliente (id, nombre, tipo, foto) VALUES (1, N'Ana', 'persona', 0xCAFE), (2, N'Luis', 'empresa', NULL);
             SET IDENTITY_INSERT dbo.cliente OFF;",
        )
        .await
        .unwrap();
    let read = sessions.schema(id, &["dbo".into()]).await.unwrap();
    let json = serde_json::to_value(&read.ir).unwrap();
    let table = |name: &str| json["tables"].as_array().unwrap().iter().find(|t| t["name"] == name).unwrap().clone();
    let column = |t: &serde_json::Value, name: &str| t["columns"].as_array().unwrap().iter().find(|c| c["name"] == name).unwrap().clone();
    let cliente = table("cliente");
    assert_eq!(column(&cliente, "id")["autoIncrement"], true);
    assert_eq!(column(&cliente, "nombre")["params"], serde_json::json!(["80"]));
    assert_eq!(column(&cliente, "foto")["params"], serde_json::json!(["MAX"]));
    assert_eq!(column(&cliente, "tipo")["defaultValue"], "'persona'");
    assert_eq!(cliente["checks"][0]["expression"], "tipo IN ('persona', 'empresa')");
    let pedido = table("pedido");
    assert_eq!(pedido["foreignKeys"][0]["onDelete"], "CASCADE");
    assert_eq!(pedido["indexes"][0]["columns"][0]["order"], "DESC");
    let page = sessions.rows(id, "dbo", "cliente", &["id".to_string()], 0, 10).await.unwrap();
    assert_eq!(page.rows[0][5].as_deref(), Some("0xcafe"));

    // Write a table without IDENTITY for the shared checks.
    sessions
        .script(id, "IF OBJECT_ID('dbo.vivo') IS NOT NULL DROP TABLE dbo.vivo; CREATE TABLE dbo.vivo (id int PRIMARY KEY, nombre nvarchar(40) NOT NULL); INSERT INTO dbo.vivo VALUES (1, N'Ana'), (2, N'Luis');")
        .await
        .unwrap();
    let read_only = open(
        &sessions,
        &ConnectionConfig {
            allow_writes: false,
            ..admin.clone()
        },
    )
    .await;
    transactions(&sessions, id, read_only, "dbo.vivo").await;
    let _ = generated();
}

const ORACLE_FIXTURE: &str = "
DROP TABLE IF EXISTS pedido PURGE;
DROP TABLE IF EXISTS cliente PURGE;
DROP VIEW IF EXISTS v_cliente;
CREATE TABLE cliente (
  id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre VARCHAR2(80 CHAR) NOT NULL,
  email VARCHAR2(120) CONSTRAINT uq_cliente_email UNIQUE,
  tipo VARCHAR2(10) DEFAULT 'persona' NOT NULL CONSTRAINT ck_tipo CHECK (tipo IN ('persona', 'empresa')),
  saldo NUMBER(10,2) DEFAULT 0 NOT NULL,
  creado TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  foto BLOB,
  notas CLOB
);
CREATE TABLE pedido (
  id NUMBER(10) PRIMARY KEY,
  cliente_id NUMBER NOT NULL CONSTRAINT fk_pedido_cliente REFERENCES cliente (id) ON DELETE CASCADE,
  total NUMBER(10,2) NOT NULL
);
CREATE INDEX idx_pedido_total ON pedido (total DESC);
CREATE VIEW v_cliente AS SELECT nombre FROM cliente;
BEGIN
  INSERT INTO cliente (id, nombre, email, tipo, foto, notas) VALUES (1, 'Ana', 'ana@x.com', 'persona', HEXTORAW('CAFE'), 'nota; larga');
  INSERT INTO cliente (id, nombre, tipo) VALUES (2, 'Luis', 'empresa');
END;
/
INSERT INTO pedido (id, cliente_id, total) VALUES (1, 1, 10.5);
";

fn oracle_config(allow_writes: bool) -> ConnectionConfig {
    config(Engine::Oracle, 51521, "tienda", "secreto", "FREEPDB1", TlsMode::Disable, allow_writes)
}

/// Runs an Oracle test with a time limit. The driver blocks threads, and a runtime waits for them when it
/// shuts down, so a stuck call would hang the whole test run instead of failing it.
fn bounded(future: impl std::future::Future<Output = ()> + Send + 'static) {
    if !enabled() || std::env::var("ERDB_ORACLE").is_err() {
        return;
    }
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let task = runtime.spawn(future);
    // The timer needs the runtime, so it is made inside it.
    let outcome = runtime.block_on(async { tokio::time::timeout(std::time::Duration::from_secs(240), task).await });
    runtime.shutdown_timeout(std::time::Duration::from_secs(2));
    match outcome {
        Ok(Ok(())) => {}
        Ok(Err(error)) if error.is_panic() => std::panic::resume_unwind(error.into_panic()),
        Ok(Err(error)) => panic!("{error}"),
        Err(_) => panic!("no answer after 240 s"),
    }
}

#[test]
fn oracle() {
    bounded(oracle_checks());
}

async fn oracle_checks() {
    er_db::init();
    let sessions = Arc::new(Sessions::default());
    let admin = oracle_config(true);
    let id = open(&sessions, &admin).await;
    // The fixture mixes plain statements, a PL/SQL block and DDL, as a migration may.
    sessions.script(id, ORACLE_FIXTURE).await.unwrap();

    let schemas = sessions.schemas(id).await.unwrap();
    assert_eq!(schemas[0].name, "TIENDA", "{schemas:?}");
    assert_eq!(schemas[0].tables, 2, "{schemas:?}");
    let read = sessions.schema(id, &["TIENDA".into()]).await.unwrap();
    if let Ok(dir) = std::env::var("ERDB_DUMP_DIR") {
        std::fs::write(format!("{dir}/oracle-schema.json"), serde_json::to_string_pretty(&read).unwrap()).unwrap();
    }
    let json = serde_json::to_value(&read.ir).unwrap();
    let table = |name: &str| json["tables"].as_array().unwrap().iter().find(|t| t["name"] == name).unwrap().clone();
    let column = |t: &serde_json::Value, name: &str| t["columns"].as_array().unwrap().iter().find(|c| c["name"] == name).unwrap().clone();
    assert_eq!(json["dialect"], "oracle");
    let cliente = table("CLIENTE");
    assert_eq!(column(&cliente, "ID")["autoIncrement"], true);
    assert_eq!(column(&cliente, "ID")["pk"], true);
    assert!(column(&cliente, "ID").get("defaultValue").is_none());
    assert_eq!(column(&cliente, "NOMBRE")["params"], serde_json::json!(["80"]));
    assert_eq!(column(&cliente, "SALDO")["params"], serde_json::json!(["10", "2"]));
    assert_eq!(column(&cliente, "TIPO")["defaultValue"], "'persona'");
    assert_eq!(column(&cliente, "CREADO")["type"], "TIMESTAMP");
    assert_eq!(column(&cliente, "CREADO")["defaultValue"], "SYSTIMESTAMP");
    assert_eq!(cliente["uniques"][0]["columns"], serde_json::json!(["EMAIL"]));
    assert_eq!(cliente["checks"], serde_json::json!([{ "name": "CK_TIPO", "expression": "TIPO IN ('persona', 'empresa')" }]));
    assert!(cliente["pk"].get("name").is_none(), "a generated SYS_C name is left out");
    let pedido = table("PEDIDO");
    assert_eq!(column(&pedido, "ID")["params"], serde_json::json!(["10", "0"]));
    assert_eq!(column(&cliente, "ID")["type"], "INTEGER", "a key NUMBER without precision is an integer");
    assert_eq!(column(&pedido, "CLIENTE_ID")["type"], "INTEGER");
    let fk = &pedido["foreignKeys"][0];
    assert_eq!((fk["refTable"].as_str(), fk["onDelete"].as_str()), (Some("CLIENTE"), Some("CASCADE")));
    assert_eq!(
        pedido["indexes"],
        serde_json::json!([{ "name": "IDX_PEDIDO_TOTAL", "columns": [{ "name": "TOTAL", "order": "DESC" }], "unique": false }])
    );
    assert!(json["skipped"].as_array().unwrap().iter().any(|s| s == "VIEW V_CLIENTE"), "{}", json["skipped"]);
    assert_eq!(read.sources.iter().find(|s| s.name == "CLIENTE").unwrap().key, ["ID"]);

    let page = sessions.rows(id, "TIENDA", "CLIENTE", &["ID".to_string()], 0, 10).await.unwrap();
    assert_eq!(page.columns[0], "ID");
    assert_eq!(page.rows.len(), 2);
    assert_eq!(page.rows[0][6].as_deref(), Some("0xcafe"), "BLOB as hex");
    assert_eq!(page.rows[0][7].as_deref(), Some("nota; larga"), "CLOB as text");
    assert_eq!(page.rows[1][2], None, "NULL email");
    assert!(page.rows[0][5].as_deref().unwrap().starts_with("20"), "timestamp {:?}", page.rows[0][5]);
    let second = sessions.rows(id, "TIENDA", "CLIENTE", &["ID".to_string()], 1, 10).await.unwrap();
    assert_eq!(second.rows[0][0].as_deref(), Some("2"), "OFFSET pages");

    // A read-only transaction stops a write that slips past the check.
    let sneaky = sessions.run(id, "SELECT * FROM cliente FOR UPDATE", false, 10).await;
    assert!(sneaky.is_err(), "{sneaky:?}");
    let semicolon = sessions.run(id, "SELECT COUNT(*) AS n FROM cliente;", false, 10).await.unwrap();
    assert_eq!(semicolon.output.rows[0][0].as_deref(), Some("2"));

    sessions
        .script(
            id,
            "DROP TABLE IF EXISTS vivo PURGE; CREATE TABLE vivo (id NUMBER PRIMARY KEY, nombre VARCHAR2(40) NOT NULL); INSERT INTO vivo VALUES (1, 'Ana'); INSERT INTO vivo VALUES (2, 'Luis');",
        )
        .await
        .unwrap();
    let read_only = open(&sessions, &oracle_config(false)).await;
    transactions(&sessions, id, read_only, "vivo").await;
    // A failed script undoes its rows (DDL before the error stays, as Oracle commits it).
    let failed = sessions.script(id, "INSERT INTO vivo VALUES (9, 'X'); INSERT INTO vivo VALUES (1, 'duplicada');").await;
    assert!(matches!(&failed, Err(Error::Database { sql_state: Some(code), .. }) if code == "ORA-00001"), "{failed:?}");
    assert_eq!(count(&sessions, id, "vivo").await, "2");
    sessions.close(id).await;
    sessions.close(read_only).await;
}

#[test]
fn oracle_through_an_ssh_tunnel() {
    bounded(oracle_tunnel_checks());
}

async fn oracle_tunnel_checks() {
    let sessions = Arc::new(Sessions::default());
    let mut cfg = oracle_config(false);
    cfg.host = "oracle".into();
    cfg.port = 1521;
    let hop = |host_key| Hop::Ssh {
        host: "127.0.0.1".into(),
        port: 52222,
        user: "tunnel".into(),
        auth: SshAuth::Password { password: "clave-ssh".into() },
        host_key,
    };
    cfg.hops = vec![hop(None)];
    let report = er_db::test_connection(&cfg).await;
    let Some(Error::UnknownHostKey { fingerprint, .. }) = report.error else {
        panic!("{:?}", report.error)
    };
    cfg.hops = vec![hop(Some(fingerprint))];
    let id = open(&sessions, &cfg).await;
    let one = sessions.run(id, "SELECT 1 AS uno FROM dual", false, 10).await.unwrap();
    assert_eq!(one.output.rows[0][0].as_deref(), Some("1"));
    // TLS cannot go through the tunnel yet, and says so.
    cfg.tls.mode = TlsMode::VerifyFull;
    let report = er_db::test_connection(&cfg).await;
    assert!(matches!(report.error, Some(Error::Unsupported { .. })), "{:?}", report.error);
}
