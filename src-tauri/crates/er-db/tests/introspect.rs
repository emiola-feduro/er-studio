//! Reads a schema with every feature the importer understands from the test PostgreSQL. Start the
//! servers with tests/env/up.sh and run with ERDB_TEST=1.

use std::sync::Arc;

use er_db::session::Sessions;
use er_db::{ConnectionConfig, Engine, TlsConfig, TlsMode};

const FIXTURE: &str = r#"
DROP SCHEMA IF EXISTS tienda CASCADE;
DROP SCHEMA IF EXISTS archivo CASCADE;
CREATE SCHEMA tienda;
CREATE SCHEMA archivo;
SET search_path = tienda;
CREATE TYPE estado_pedido AS ENUM ('nuevo', 'pagado', 'enviado');
CREATE DOMAIN correo AS varchar(120);
CREATE TABLE cliente (
  id serial PRIMARY KEY,
  nombre varchar(80) NOT NULL,
  email correo UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  tipo varchar(10) CHECK (tipo IN ('persona', 'empresa')),
  foto bytea
);
COMMENT ON TABLE cliente IS 'Clientes de la tienda';
CREATE TABLE producto (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL,
  precio numeric(10, 2) NOT NULL CHECK (precio >= 0),
  precio_iva numeric(10, 2) GENERATED ALWAYS AS (precio * 1.16) STORED
);
CREATE TABLE pedido (
  id bigserial PRIMARY KEY,
  cliente_id integer NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  creado timestamp(3) with time zone NOT NULL DEFAULT now(),
  estado estado_pedido NOT NULL DEFAULT 'nuevo'
);
CREATE TABLE pedido_producto (
  pedido_id bigint REFERENCES pedido (id),
  producto_id integer REFERENCES producto (id) ON UPDATE RESTRICT,
  cantidad integer NOT NULL DEFAULT 1,
  PRIMARY KEY (pedido_id, producto_id)
);
CREATE INDEX idx_pedido_creado ON pedido (creado DESC);
CREATE INDEX idx_pedido_pagado ON pedido (cliente_id) WHERE estado = 'pagado';
CREATE INDEX idx_cliente_lower ON cliente (lower(nombre));
CREATE UNIQUE INDEX idx_producto_nombre ON producto USING btree (nombre);
CREATE VIEW v_clientes AS SELECT nombre FROM cliente;
CREATE TABLE archivo.cliente (id integer PRIMARY KEY, nota text);
INSERT INTO cliente (nombre, email, activo, tipo, foto) VALUES ('Ana', 'ana@x.com', true, 'persona', '\xcafe'), ('Luis', NULL, false, 'empresa', NULL);
INSERT INTO producto (nombre, precio) VALUES ('Lápiz', 1.5);
INSERT INTO pedido (cliente_id, creado, estado) VALUES (1, '2026-01-10 12:00:00+00', 'pagado');
INSERT INTO pedido_producto VALUES (1, 1, 3);
"#;

fn config() -> ConnectionConfig {
    ConnectionConfig {
        engine: Engine::Postgres,
        host: "127.0.0.1".into(),
        port: 55432,
        database: "tienda".into(),
        user: "postgres".into(),
        password: Some("secreto".into()),
        tls: TlsConfig {
            mode: TlsMode::Require,
            ..Default::default()
        },
        hops: vec![],
        timeout_secs: 20,
    }
}

#[tokio::test]
async fn reads_the_catalog_and_rows() {
    if std::env::var("ERDB_TEST").is_err() {
        return;
    }
    let sessions = Arc::new(Sessions::default());
    let opened = sessions.open(&config()).await;
    let id = opened.session_id.unwrap_or_else(|| panic!("{:?}", opened.report.error));

    // The fixture runs over a session of its own.
    let (client, connection) = tokio_postgres::connect("host=127.0.0.1 port=55432 user=postgres password=secreto dbname=tienda", tokio_postgres::NoTls)
        .await
        .unwrap();
    tokio::spawn(connection);
    client.batch_execute(FIXTURE).await.unwrap();

    let schemas = sessions.schemas(id).await.unwrap();
    let tienda = schemas.iter().find(|s| s.name == "tienda").unwrap();
    assert_eq!(tienda.tables, 4);

    // A spawned task, as Tauri runs commands.
    let read = {
        let sessions = sessions.clone();
        tokio::spawn(async move { sessions.schema(id, &["tienda".into(), "archivo".into()]).await })
            .await
            .unwrap()
            .unwrap()
    };
    let json = serde_json::to_value(&read.ir).unwrap();
    // The interface's tests read this output as a fixture; regenerate it with ERDB_DUMP_IR=<file>.
    if let Ok(path) = std::env::var("ERDB_DUMP_IR") {
        std::fs::write(path, serde_json::to_string_pretty(&read).unwrap()).unwrap();
    }
    let table = |name: &str| {
        json["tables"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["name"] == name)
            .unwrap_or_else(|| panic!("{name}: {json:#}"))
            .clone()
    };
    let column = |t: &serde_json::Value, name: &str| t["columns"].as_array().unwrap().iter().find(|c| c["name"] == name).unwrap().clone();

    assert_eq!(json["dialect"], "postgresql");
    assert_eq!(json["databaseName"], "tienda");
    // The same name in two schemas gets the schema in front.
    let names: Vec<&str> = json["tables"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["archivo_cliente", "tienda_cliente", "pedido", "pedido_producto", "producto"]);

    let cliente = table("tienda_cliente");
    let id_column = column(&cliente, "id");
    assert_eq!(
        (id_column["type"].as_str(), id_column["autoIncrement"].as_bool(), id_column["pk"].as_bool()),
        (Some("INTEGER"), Some(true), Some(true))
    );
    assert!(id_column.get("defaultValue").is_none());
    assert_eq!(column(&cliente, "nombre")["params"], serde_json::json!(["80"]));
    assert_eq!(column(&cliente, "email")["type"], "CHARACTER VARYING", "the domain gives its base type");
    assert_eq!(column(&cliente, "activo")["defaultValue"], "true");
    assert_eq!(cliente["uniques"][0]["columns"], serde_json::json!(["email"]));
    assert_eq!(cliente["checks"][0]["expression"], "tipo IN ('persona', 'empresa')");

    let producto = table("producto");
    assert_eq!(column(&producto, "id")["autoIncrement"], true);
    assert_eq!(producto["indexes"][0]["name"], "idx_producto_nombre");
    assert_eq!(producto["indexes"][0]["unique"], true);
    assert_eq!(producto["checks"][0]["expression"], "precio >= (0)::numeric");

    let pedido = table("pedido");
    assert_eq!(column(&pedido, "id")["type"], "BIGINT");
    let creado = column(&pedido, "creado");
    assert_eq!(
        (creado["type"].as_str(), creado["params"][0].as_str()),
        (Some("TIMESTAMP WITH TIME ZONE"), Some("3"))
    );
    let estado = column(&pedido, "estado");
    assert_eq!(estado["type"], "ENUM");
    assert_eq!(estado["enumValues"], serde_json::json!(["nuevo", "pagado", "enviado"]));
    let fk = &pedido["foreignKeys"][0];
    assert_eq!(
        (fk["refTable"].as_str(), fk["onDelete"].as_str(), fk["refColumns"][0].as_str()),
        (Some("tienda_cliente"), Some("CASCADE"), Some("id"))
    );
    let indexes = pedido["indexes"].as_array().unwrap();
    assert_eq!(indexes[0]["columns"][0]["order"], "DESC");
    assert_eq!(indexes[1]["where"], "(estado = 'pagado'::tienda.estado_pedido)");

    let junction = table("pedido_producto");
    assert_eq!(junction["pk"]["columns"], serde_json::json!(["pedido_id", "producto_id"]));
    assert_eq!(junction["foreignKeys"].as_array().unwrap().len(), 2);

    let skipped: Vec<&str> = json["skipped"].as_array().unwrap().iter().map(|s| s.as_str().unwrap()).collect();
    assert!(skipped.contains(&"VIEW v_clientes"), "{skipped:?}");
    assert!(skipped.contains(&"INDEX idx_cliente_lower (expression)"), "{skipped:?}");
    assert!(
        skipped.contains(&"producto.precio_iva GENERATED ALWAYS AS ((precio * 1.16)) STORED"),
        "{skipped:?}"
    );
    assert!(column(&producto, "precio_iva").get("defaultValue").is_none());

    // Rows come in key order and as PostgreSQL prints them.
    let source = read.sources.iter().find(|s| s.name == "tienda_cliente").unwrap();
    assert_eq!(
        (source.schema.as_str(), source.table.as_str(), source.key.clone()),
        ("tienda", "cliente", vec!["id".to_string()])
    );
    let page = sessions.rows(id, &source.schema, &source.table, &source.key, 0, 10).await.unwrap();
    assert_eq!(page.columns, ["id", "nombre", "email", "activo", "tipo", "foto"]);
    assert_eq!(
        page.rows[0],
        [Some("1"), Some("Ana"), Some("ana@x.com"), Some("t"), Some("persona"), Some("\\xcafe")].map(|v| v.map(str::to_string))
    );
    assert_eq!(page.rows[1][2], None);
    assert_eq!(
        sessions.rows(id, &source.schema, &source.table, &source.key, 1, 10).await.unwrap().rows.len(),
        1
    );
    let empty = sessions.rows(id, "archivo", "cliente", &[], 0, 10).await.unwrap();
    assert_eq!((empty.columns.len(), empty.rows.len()), (2, 0));

    sessions.close(id).await;
    assert!(sessions.schemas(id).await.is_err());
    client.batch_execute("DROP SCHEMA tienda CASCADE; DROP SCHEMA archivo CASCADE;").await.unwrap();
}
