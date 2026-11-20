//! Oracle Database and Autonomous Database, through Oracle's own pure Rust driver (no Instant Client).
//!
//! The driver is synchronous and opens its own TCP connection, so it runs on blocking threads. Through
//! SSH or a proxy the tunnel is handed to it on a one-shot listener on 127.0.0.1, which only works without
//! TLS: the driver checks the certificate against the host it connected to. An ADB wallet (the zip the
//! console gives, or its folder) brings the client certificate and the tnsnames.ora aliases.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::config::{ConnectionConfig, TlsMode};
use crate::driver::{hex, Driver, QueryOutput};
use crate::error::{Error, Result};
use crate::transport::{self, within, Step};

pub type OracleConnection = Arc<Mutex<oracledb::Connection>>;

pub(crate) fn oracle_error(error: oracledb::Error) -> Error {
    Error::Database {
        sql_state: error.db_error_code().map(|code| format!("ORA-{code:05}")),
        message: error.to_string(),
    }
}

fn joined(error: tokio::task::JoinError) -> Error {
    Error::Database {
        message: error.to_string(),
        sql_state: None,
    }
}

fn unsupported(message: &str) -> Error {
    Error::Unsupported { message: message.into() }
}

/// Whether the connection uses TLS (TCPS). Oracle has no "TLS if offered": the listener speaks one or the
/// other on each port, so "prefer" stays in the clear and every other mode verifies the certificate.
pub fn uses_tls(config: &ConnectionConfig) -> bool {
    config.wallet.as_deref().is_some_and(|w| !w.trim().is_empty()) || matches!(config.tls.mode, TlsMode::Require | TlsMode::VerifyCa | TlsMode::VerifyFull)
}

/// The connect descriptor for a host, port and service name (or SID).
pub fn descriptor(host: &str, port: u16, service: &str, sid: bool, tls: bool) -> String {
    let protocol = if tls { "TCPS" } else { "TCP" };
    let data = if service.trim().is_empty() {
        String::new()
    } else if sid {
        format!("(SID={})", service.trim())
    } else {
        format!("(SERVICE_NAME={})", service.trim())
    };
    format!("(DESCRIPTION=(ADDRESS=(PROTOCOL={protocol})(HOST={host})(PORT={port}))(CONNECT_DATA={data}))")
}

fn given_connect_string(config: &ConnectionConfig) -> Option<String> {
    config.connect_string.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

/// The aliases of a tnsnames.ora ("mydb_high", "mydb_low"...), in file order.
pub fn tns_aliases(text: &str) -> Vec<String> {
    let mut aliases = Vec::new();
    let mut depth = 0i32;
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("");
        if depth == 0 {
            if let Some((names, _)) = line.split_once('=') {
                for name in names.split(',') {
                    let name = name.trim();
                    if !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c)) {
                        aliases.push(name.to_string());
                    }
                }
            }
        }
        depth += line.matches('(').count() as i32 - line.matches(')').count() as i32;
        depth = depth.max(0);
    }
    aliases
}

/// The files of a wallet that the driver reads, from the zip or the folder.
fn wallet_files(path: &str) -> Result<Vec<(&'static str, Vec<u8>)>> {
    let wallet_error = |message: String| Error::TlsConfig {
        message: format!("wallet {path}: {message}"),
    };
    let wanted = ["ewallet.pem", "tnsnames.ora", "sqlnet.ora"];
    let mut found = Vec::new();
    let location = Path::new(path);
    if location.is_dir() {
        for name in wanted {
            if let Ok(bytes) = std::fs::read(location.join(name)) {
                found.push((name, bytes));
            }
        }
    } else {
        let file = std::fs::File::open(location).map_err(|e| wallet_error(e.to_string()))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| wallet_error(e.to_string()))?;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|e| wallet_error(e.to_string()))?;
            let full = entry.name().map_err(|e| wallet_error(e.to_string()))?.to_string();
            let base = full.rsplit(['/', '\\']).next().unwrap_or("").to_string();
            if let Some(name) = wanted.iter().find(|w| w.eq_ignore_ascii_case(&base)) {
                let mut bytes = Vec::new();
                entry.read_to_end(&mut bytes).map_err(|e| wallet_error(e.to_string()))?;
                found.push((*name, bytes));
            }
        }
    }
    if !found.iter().any(|(name, _)| *name == "ewallet.pem") {
        return Err(wallet_error("it has no ewallet.pem; download the wallet again from the console".into()));
    }
    Ok(found)
}

/// The aliases a wallet offers, for the connection dialog.
pub fn wallet_aliases(path: &str) -> Result<Vec<String>> {
    let files = wallet_files(path)?;
    Ok(files
        .iter()
        .find(|(name, _)| *name == "tnsnames.ora")
        .map(|(_, bytes)| tns_aliases(&String::from_utf8_lossy(bytes)))
        .unwrap_or_default())
}

/// A private folder with the wallet files (and the extra CA), removed when dropped. The driver reads it
/// only while connecting.
struct WalletDir(PathBuf);

impl Drop for WalletDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn private_dir() -> Result<WalletDir> {
    let unique = format!(
        "er-studio-wallet-{}-{}",
        std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
    );
    let dir = std::env::temp_dir().join(unique);
    let mut builder = std::fs::DirBuilder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(&dir).map_err(|e| Error::TlsConfig { message: e.to_string() })?;
    Ok(WalletDir(dir))
}

fn wallet_dir(config: &ConnectionConfig) -> Result<Option<WalletDir>> {
    let wallet = config.wallet.as_deref().map(str::trim).filter(|w| !w.is_empty());
    let ca = config.tls.ca_pem.as_deref().map(str::trim).filter(|p| !p.is_empty());
    if wallet.is_none() && ca.is_none() {
        return Ok(None);
    }
    let mut files = match wallet {
        Some(path) => wallet_files(path)?,
        None => Vec::new(),
    };
    // An extra CA joins the certificates of ewallet.pem, which the driver trusts along with the public ones.
    if let Some(ca) = ca {
        match files.iter_mut().find(|(name, _)| *name == "ewallet.pem") {
            Some((_, bytes)) => {
                bytes.push(b'\n');
                bytes.extend_from_slice(ca.as_bytes());
            }
            None => files.push(("ewallet.pem", ca.as_bytes().to_vec())),
        }
    }
    let dir = private_dir()?;
    for (name, bytes) in files {
        std::fs::write(dir.0.join(name), bytes).map_err(|e| Error::TlsConfig { message: e.to_string() })?;
    }
    Ok(Some(dir))
}

fn auth_mode(role: Option<&str>) -> Result<Option<u8>> {
    match role.map(|r| r.trim().to_lowercase()).as_deref() {
        None | Some("") | Some("normal") => Ok(None),
        Some("sysdba") => Ok(Some(oracledb::AUTH_MODE_SYSDBA)),
        Some("sysoper") => Ok(Some(oracledb::AUTH_MODE_SYSOPER)),
        Some(other) => Err(unsupported(&format!("unknown Oracle role {other}"))),
    }
}

/// How the session shows in V$SESSION; Oracle only takes letters, digits and a few signs there.
const PROGRAM: &str = "ERStudio";

fn open_blocking(config: ConnectionConfig, connect_string: String, wallet: Option<WalletDir>) -> Result<(oracledb::Connection, String)> {
    let mut options = oracledb::Config::default()
        .set_credentials(&config.user, config.password.as_deref().unwrap_or(""))
        .set_driver_name(PROGRAM)
        .set_transport_connect_timeout(Some(Duration::from_secs(config.timeout_secs.max(1))))
        .set_program(PROGRAM)
        .map_err(oracle_error)?;
    if let Some(dir) = &wallet {
        let dir = dir.0.to_string_lossy().to_string();
        // tnsnames.ora is looked up in the config folder, so it must be set before the connect string.
        options = options.set_config_dir(&dir).set_wallet_location(dir);
        if let Some(password) = config.wallet_password.as_deref() {
            options = options.set_wallet_password(password);
        }
    }
    if let Some(mode) = auth_mode(config.role.as_deref())? {
        options = options.set_auth_mode(mode);
    }
    let options = options.set_connect_string(&connect_string).map_err(oracle_error)?;
    let connection = oracledb::connect(options).map_err(oracle_error)?;
    drop(wallet);
    let version = connection.version().map(|v| v.to_string()).unwrap_or_default();
    Ok((connection, version))
}

pub async fn connect(config: &ConnectionConfig, steps: &mut Vec<Step>) -> Result<(Driver, String, transport::Guards)> {
    crate::init();
    let tls = uses_tls(config);
    let given = given_connect_string(config);
    let connect_string = if !config.hops.is_empty() {
        if given.is_some() {
            return Err(unsupported("Through SSH or a proxy, Oracle connects with host, port and service, not with a connect string or alias"));
        }
        if tls {
            return Err(unsupported("Oracle TLS (TCPS) does not work through SSH or a proxy yet; connect directly or through a VPN"));
        }
        let tunnel = transport::open(config, steps).await?;
        let port = transport::local_forward(tunnel).await?;
        descriptor("127.0.0.1", port, &config.database, config.sid, false)
    } else if let Some(given) = given {
        given
    } else if tls {
        descriptor(config.host.trim(), config.port, &config.database, config.sid, true)
    } else {
        // Find the address that answers (localhost may be ::1 or 127.0.0.1) and hand that one to the driver.
        let started = Instant::now();
        let target = format!("{}:{}", config.host.trim(), config.port);
        let probe = within(config.timeout_secs, "tcp", &target, async {
            transport::connect_tcp(config.host.trim(), config.port).await.map_err(|e| crate::error::unreachable(&target, e))
        })
        .await?;
        let address = probe.peer_addr().map_err(|e| crate::error::unreachable(&target, e))?;
        drop(probe);
        steps.push(Step {
            kind: "tcp",
            target,
            ms: started.elapsed().as_millis() as u64,
        });
        descriptor(&address.ip().to_string(), config.port, &config.database, config.sid, false)
    };
    let wallet = wallet_dir(config)?;
    let target = if config.connect_string.as_deref().is_some_and(|s| !s.trim().is_empty()) {
        config.connect_string.clone().unwrap_or_default()
    } else {
        format!("{}/{}", config.host, config.database)
    };
    let started = Instant::now();
    let owned = config.clone();
    let (connection, version) = within(config.timeout_secs + 5, "database", &target, async move {
        tokio::task::spawn_blocking(move || open_blocking(owned, connect_string, wallet)).await.map_err(joined)?
    })
    .await?;
    steps.push(Step {
        kind: "database",
        target,
        ms: started.elapsed().as_millis() as u64,
    });
    Ok((Driver::Oracle(Arc::new(Mutex::new(connection))), version, Vec::new()))
}

/// The value of an Oracle timestamp as "2024-05-01 13:45:00" (fractions without trailing zeros).
fn timestamp_text(value: &oracledb::OracleTimestamp) -> String {
    let text = value.to_string().replacen('T', " ", 1);
    match text.split_once('.') {
        Some((whole, fraction)) => {
            let utc = fraction.ends_with('Z');
            let digits = fraction.trim_end_matches('Z').trim_end_matches('0');
            let mut out = if digits.is_empty() { whole.to_string() } else { format!("{whole}.{digits}") };
            if utc {
                out.push('Z');
            }
            out
        }
        None => text,
    }
}

fn json_text(value: &oracledb::JsonValue, out: &mut String) {
    use oracledb::JsonValue as J;
    match value {
        J::Null => out.push_str("null"),
        J::Boolean(b) => out.push_str(if *b { "true" } else { "false" }),
        J::Number(n) => out.push_str(&n.to_string()),
        J::BinaryDouble(n) => out.push_str(&n.to_string()),
        J::BinaryFloat(n) => out.push_str(&n.to_string()),
        J::String(s) => {
            out.push('"');
            for c in s.chars() {
                match c {
                    '"' => out.push_str("\\\""),
                    '\\' => out.push_str("\\\\"),
                    '\n' => out.push_str("\\n"),
                    '\r' => out.push_str("\\r"),
                    '\t' => out.push_str("\\t"),
                    c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
                    c => out.push(c),
                }
            }
            out.push('"');
        }
        J::Timestamp(t) => {
            out.push('"');
            out.push_str(&timestamp_text(t));
            out.push('"');
        }
        J::IntervalDS(v) => out.push_str(&format!("\"{v}\"")),
        J::IntervalYM(v) => out.push_str(&format!("\"{v}\"")),
        J::Raw(b) | J::JsonId(b) => out.push_str(&format!("\"{}\"", hex(b))),
        J::Vector(_) => out.push_str("\"(vector)\""),
        J::JsonArray(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json_text(item, out);
            }
            out.push(']');
        }
        J::JsonObject(fields) => {
            let mut keys: Vec<&String> = fields.keys().collect();
            keys.sort();
            out.push('{');
            for (i, key) in keys.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json_text(&oracledb::JsonValue::String(key.clone()), out);
                out.push(':');
                json_text(&fields[key], out);
            }
            out.push('}');
        }
    }
}

/// One value as text, whatever its Oracle type; None for NULL.
fn value_text(row: &oracledb::Row, index: usize) -> Option<String> {
    if let Ok(value) = row.get::<Option<String>>(index) {
        return value;
    }
    if let Ok(value) = row.get::<Option<oracledb::OracleTimestamp>>(index) {
        return value.map(|v| timestamp_text(&v));
    }
    if let Ok(value) = row.get::<Option<f64>>(index) {
        return value.map(|v| v.to_string());
    }
    if let Ok(value) = row.get::<Option<f32>>(index) {
        return value.map(|v| v.to_string());
    }
    if let Ok(value) = row.get::<Option<bool>>(index) {
        return value.map(|v| if v { "true".into() } else { "false".into() });
    }
    if let Ok(value) = row.get::<Option<Vec<u8>>>(index) {
        return value.map(|v| hex(&v));
    }
    if let Ok(value) = row.get::<Option<oracledb::OracleIntervalDS>>(index) {
        return value.map(|v| v.to_string());
    }
    if let Ok(value) = row.get::<Option<oracledb::OracleIntervalYM>>(index) {
        return value.map(|v| v.to_string());
    }
    if let Ok(value) = row.get::<Option<oracledb::JsonValue>>(index) {
        return value.map(|v| {
            let mut out = String::new();
            json_text(&v, &mut out);
            out
        });
    }
    let kind = row.columns().get(index).map(|c| c.data_type()).unwrap_or_default();
    Some(format!("({})", kind.to_lowercase()))
}

/// The statement as the driver takes it: Oracle refuses the final ";" of a SQL statement, but a PL/SQL
/// block keeps the one after its END.
pub fn statement_text(sql: &str) -> String {
    let trimmed = sql.trim().trim_end_matches('/').trim_end();
    if is_plsql(trimmed) {
        trimmed.to_string()
    } else {
        trimmed.trim_end_matches(';').trim_end().to_string()
    }
}

fn first_words(sql: &str, count: usize) -> Vec<String> {
    let mut text = sql.trim_start();
    loop {
        if let Some(rest) = text.strip_prefix("--") {
            text = rest.split_once('\n').map(|(_, r)| r).unwrap_or("").trim_start();
        } else if let Some(rest) = text.strip_prefix("/*") {
            text = rest.split_once("*/").map(|(_, r)| r).unwrap_or("").trim_start();
        } else {
            break;
        }
    }
    text.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .filter(|w| !w.is_empty())
        .take(count)
        .map(|w| w.to_uppercase())
        .collect()
}

/// Whether a statement is a PL/SQL block or creates a stored unit, which ends with "END;" and a "/" line.
pub fn is_plsql(sql: &str) -> bool {
    let words = first_words(sql, 6);
    let mut rest = words.iter().map(String::as_str).peekable();
    match rest.next() {
        Some("BEGIN" | "DECLARE") => true,
        Some("CREATE") => {
            let mut word = rest.next();
            if word == Some("OR") {
                rest.next();
                word = rest.next();
            }
            while matches!(word, Some("EDITIONABLE" | "NONEDITIONABLE" | "EDITIONING")) {
                word = rest.next();
            }
            matches!(word, Some("FUNCTION" | "PROCEDURE" | "PACKAGE" | "TRIGGER" | "TYPE" | "LIBRARY"))
        }
        _ => false,
    }
}

/// Splits a script into statements: at ";" outside quotes and comments, except inside PL/SQL, which ends
/// at a line holding only "/". The statements come back without their final ";" (PL/SQL keeps it).
pub fn split_script(script: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = script.chars().collect();
    let mut i = 0;
    let mut at_line_start = true;
    let push = |current: &mut String, statements: &mut Vec<String>| {
        let text = statement_text(current);
        if !text.is_empty() {
            statements.push(text);
        }
        current.clear();
    };
    while i < chars.len() {
        let c = chars[i];
        // A line with only "/" ends the statement (PL/SQL, or a SQL*Plus habit after plain SQL).
        if at_line_start {
            let line_end = chars[i..].iter().position(|&c| c == '\n').map(|p| i + p).unwrap_or(chars.len());
            let line: String = chars[i..line_end].iter().collect();
            if line.trim() == "/" {
                push(&mut current, &mut statements);
                i = line_end + 1;
                continue;
            }
        }
        at_line_start = c == '\n';
        match c {
            '\'' | '"' => {
                current.push(c);
                i += 1;
                while i < chars.len() {
                    current.push(chars[i]);
                    if chars[i] == c {
                        if chars.get(i + 1) == Some(&c) {
                            current.push(c);
                            i += 2;
                            continue;
                        }
                        i += 1;
                        break;
                    }
                    i += 1;
                }
            }
            '-' if chars.get(i + 1) == Some(&'-') => {
                while i < chars.len() && chars[i] != '\n' {
                    current.push(chars[i]);
                    i += 1;
                }
            }
            '/' if chars.get(i + 1) == Some(&'*') => {
                current.push_str("/*");
                i += 2;
                while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                    current.push(chars[i]);
                    i += 1;
                }
                if i < chars.len() {
                    current.push_str("*/");
                    i += 2;
                }
            }
            ';' if !is_plsql(&current) => {
                push(&mut current, &mut statements);
                i += 1;
            }
            _ => {
                current.push(c);
                i += 1;
            }
        }
    }
    push(&mut current, &mut statements);
    statements
}

pub(crate) fn run_blocking(connection: &oracledb::Connection, sql: &str, max_rows: usize) -> Result<QueryOutput> {
    let text = statement_text(sql);
    let upper = first_words(&text, 2);
    // COMMIT and ROLLBACK go through the protocol calls, which also end a read-only transaction.
    match upper.first().map(String::as_str) {
        Some("COMMIT") if upper.len() == 1 => {
            connection.commit().map_err(oracle_error)?;
            return Ok(QueryOutput::default());
        }
        Some("ROLLBACK") if upper.len() == 1 => {
            connection.rollback().map_err(oracle_error)?;
            return Ok(QueryOutput::default());
        }
        _ => {}
    }
    let mut statement = connection.statement(&text).map_err(oracle_error)?.build().map_err(oracle_error)?;
    let mut out = QueryOutput::default();
    if statement.is_query() {
        let cursor = statement.query(&[]).map_err(oracle_error)?;
        out.columns = cursor.columns().iter().map(|c| c.name().to_string()).collect();
        for row in cursor {
            let row = row.map_err(oracle_error)?;
            if out.columns.is_empty() {
                out.columns = row.columns().iter().map(|c| c.name().to_string()).collect();
            }
            if out.rows.len() >= max_rows {
                out.truncated = true;
                break;
            }
            out.rows.push((0..out.columns.len()).map(|i| value_text(&row, i)).collect());
        }
    } else {
        let result = statement.execute(&[]).map_err(oracle_error)?;
        out.rows_affected = Some(result.rows_affected());
    }
    Ok(out)
}

pub(crate) async fn run(connection: &OracleConnection, sql: &str, max_rows: usize) -> Result<QueryOutput> {
    let connection = Arc::clone(connection);
    let sql = sql.to_string();
    tokio::task::spawn_blocking(move || run_blocking(&connection.lock().unwrap(), &sql, max_rows)).await.map_err(joined)?
}

pub(crate) async fn execute(connection: &OracleConnection, script: &str) -> Result<()> {
    let connection = Arc::clone(connection);
    let statements = split_script(script);
    tokio::task::spawn_blocking(move || {
        let connection = connection.lock().unwrap();
        for statement in statements {
            run_blocking(&connection, &statement, 0)?;
        }
        Ok(())
    })
    .await
    .map_err(joined)?
}

/// Limits how long one round trip may wait, so a slow statement fails instead of holding the session.
pub(crate) async fn set_call_timeout(connection: &OracleConnection, seconds: u64) -> Result<()> {
    let connection = Arc::clone(connection);
    tokio::task::spawn_blocking(move || {
        connection
            .lock()
            .unwrap()
            .set_call_timeout(Some(Duration::from_secs(seconds)))
            .map_err(oracle_error)
    })
    .await
    .map_err(joined)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_descriptors() {
        assert_eq!(
            descriptor("db.example.com", 1521, "ORCLPDB1", false, false),
            "(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=db.example.com)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=ORCLPDB1)))"
        );
        assert_eq!(
            descriptor("10.0.0.5", 2484, "ORCL", true, true),
            "(DESCRIPTION=(ADDRESS=(PROTOCOL=TCPS)(HOST=10.0.0.5)(PORT=2484))(CONNECT_DATA=(SID=ORCL)))"
        );
    }

    #[test]
    fn reads_tns_aliases() {
        let text = "# ADB\nmydb_high = (description= (retry_count=20)(address=(protocol=tcps)(port=1522)(host=adb.example.com))\n  (connect_data=(service_name=x_high.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))\n\nmydb_low = (description=(address=(protocol=tcps)(port=1522)(host=adb.example.com))(connect_data=(service_name=x_low.adb.oraclecloud.com)))\nA, B = (DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=h)(PORT=1521)))\n";
        assert_eq!(tns_aliases(text), ["mydb_high", "mydb_low", "A", "B"]);
    }

    #[test]
    fn strips_the_final_semicolon_of_sql_only() {
        assert_eq!(statement_text("SELECT 1 FROM dual;"), "SELECT 1 FROM dual");
        assert_eq!(statement_text("BEGIN NULL; END;\n/"), "BEGIN NULL; END;");
        assert_eq!(statement_text("create or replace procedure p as begin null; end;"), "create or replace procedure p as begin null; end;");
    }

    #[test]
    fn tells_plsql() {
        assert!(is_plsql("BEGIN x; END;"));
        assert!(is_plsql("-- note\nDECLARE n NUMBER; BEGIN NULL; END;"));
        assert!(is_plsql("CREATE OR REPLACE EDITIONABLE TRIGGER t BEFORE INSERT ON x FOR EACH ROW BEGIN NULL; END;"));
        assert!(is_plsql("create type body t as member function f return number is begin return 1; end; end;"));
        assert!(!is_plsql("CREATE TABLE t (a NUMBER)"));
        assert!(!is_plsql("CREATE OR REPLACE VIEW v AS SELECT 1 FROM dual"));
    }

    #[test]
    fn splits_scripts() {
        let script = "CREATE TABLE a (x VARCHAR2(10) DEFAULT 'a;b');\n-- comment; with semicolon\nALTER TABLE a ADD (y NUMBER);\n\nCREATE OR REPLACE TRIGGER t BEFORE INSERT ON a FOR EACH ROW\nBEGIN\n  :new.x := 'v';\nEND;\n/\nINSERT INTO a (x) VALUES ('it''s; fine');\n/* block; comment */ COMMIT;";
        assert_eq!(
            split_script(script),
            [
                "CREATE TABLE a (x VARCHAR2(10) DEFAULT 'a;b')",
                "-- comment; with semicolon\nALTER TABLE a ADD (y NUMBER)",
                "CREATE OR REPLACE TRIGGER t BEFORE INSERT ON a FOR EACH ROW\nBEGIN\n  :new.x := 'v';\nEND;",
                "INSERT INTO a (x) VALUES ('it''s; fine')",
                "/* block; comment */ COMMIT",
            ]
        );
        assert_eq!(split_script("SELECT 1 FROM dual\n/\n"), ["SELECT 1 FROM dual"]);
        assert!(split_script("  ;\n").is_empty());
    }

    #[test]
    fn the_program_name_is_accepted() {
        assert!(oracledb::Config::default().set_program(PROGRAM).is_ok());
        assert!(oracledb::Config::default().set_program("ER Studio ++").is_err());
    }

    #[test]
    fn reads_roles() {
        assert_eq!(auth_mode(None).unwrap(), None);
        assert_eq!(auth_mode(Some("SYSDBA")).unwrap(), Some(oracledb::AUTH_MODE_SYSDBA));
        assert!(auth_mode(Some("king")).is_err());
    }
}
