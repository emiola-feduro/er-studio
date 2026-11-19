//! Commands for database connections. The logic lives in the er-db crate; these only fill the secrets
//! from the system keychain and hand over the settings.

use std::collections::HashMap;

use er_db::introspect::{RowsPage, SchemaInfo, SchemaRead};
use er_db::session::{Opened, Sessions};
use er_db::{secrets, ConnectionConfig, TestReport};
use tauri::State;

/// Opens the chain and the database session once and reports each step.
#[tauri::command]
pub async fn connection_test(config: ConnectionConfig, connection_id: Option<String>) -> Result<TestReport, String> {
    let mut config = config;
    if let Some(id) = connection_id.as_deref() {
        secrets::fill(&mut config, id)?;
    }
    Ok(er_db::test_connection(&config).await)
}

/// Saves the secrets given (slot → value) and removes the ones sent as null.
#[tauri::command]
pub fn secrets_save(connection_id: String, secrets: HashMap<String, Option<String>>) -> Result<(), String> {
    for (slot, value) in &secrets {
        secrets::set(&connection_id, slot, value.as_deref())?;
    }
    Ok(())
}

/// Removes every secret of a connection that is being deleted.
#[tauri::command]
pub fn secrets_delete(connection_id: String) -> Result<(), String> {
    secrets::delete_all(&connection_id)
}

/// The text of ~/.ssh/config, to import its hosts. None when there is no such file.
#[tauri::command]
pub fn ssh_config_read() -> Option<String> {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
    std::fs::read_to_string(std::path::PathBuf::from(home).join(".ssh").join("config")).ok()
}

fn message(error: er_db::Error) -> String {
    serde_json::to_string(&error).unwrap_or_else(|_| error.to_string())
}

/// Opens a connection that stays open for the next commands (schema, rows) until it is closed.
#[tauri::command]
pub async fn connection_open(sessions: State<'_, Sessions>, config: ConnectionConfig, connection_id: Option<String>) -> Result<Opened, String> {
    let mut config = config;
    if let Some(id) = connection_id.as_deref() {
        secrets::fill(&mut config, id)?;
    }
    Ok(sessions.open(&config).await)
}

#[tauri::command]
pub async fn connection_close(sessions: State<'_, Sessions>, session_id: u64) -> Result<(), String> {
    sessions.close(session_id).await;
    Ok(())
}

#[tauri::command]
pub async fn session_schemas(sessions: State<'_, Sessions>, session_id: u64) -> Result<Vec<SchemaInfo>, String> {
    sessions.schemas(session_id).await.map_err(message)
}

#[tauri::command]
pub async fn session_schema(sessions: State<'_, Sessions>, session_id: u64, schemas: Vec<String>) -> Result<SchemaRead, String> {
    sessions.schema(session_id, &schemas).await.map_err(message)
}

#[tauri::command]
pub async fn session_rows(
    sessions: State<'_, Sessions>,
    session_id: u64,
    schema: String,
    table: String,
    order_by: Vec<String>,
    offset: u64,
    limit: u64,
) -> Result<RowsPage, String> {
    sessions.rows(session_id, &schema, &table, &order_by, offset, limit).await.map_err(message)
}
