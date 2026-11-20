//! Commands for SSH terminals on VMs. The logic lives in er_db::terminal; these fill the secrets from the
//! keychain and carry the output to the interface through a channel.

use std::sync::Arc;

use base64::Engine;
use er_db::secrets;
use er_db::terminal::{TerminalEvent, TerminalOpened, TerminalSpec, Terminals};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

/// What the interface receives while a terminal runs. Output travels as base64 so a character split
/// between two packets reaches the terminal intact.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum TerminalMessage {
    Output { data: String },
    Exit { code: Option<u32> },
}

fn message(error: er_db::Error) -> String {
    serde_json::to_string(&error).unwrap_or_else(|_| error.to_string())
}

/// Opens a terminal at the end of the route. `connection_id` names the keychain entry of hops that are
/// not saved VMs (those use their own).
#[tauri::command]
pub async fn terminal_open(
    terminals: State<'_, Arc<Terminals>>,
    spec: TerminalSpec,
    connection_id: Option<String>,
    cols: u32,
    rows: u32,
    on_event: Channel<TerminalMessage>,
) -> Result<TerminalOpened, String> {
    let mut spec = spec;
    secrets::fill_hops(&mut spec.hops, connection_id.as_deref().unwrap_or(""))?;
    Ok(terminals
        .open(&spec, cols, rows, move |event| {
            let message = match event {
                TerminalEvent::Output(bytes) => TerminalMessage::Output {
                    data: base64::engine::general_purpose::STANDARD.encode(bytes),
                },
                TerminalEvent::Exit(code) => TerminalMessage::Exit { code },
            };
            let _ = on_event.send(message);
        })
        .await)
}

/// Reaches a VM and signs in, without opening a terminal.
#[tauri::command]
pub async fn vm_test(spec: TerminalSpec, connection_id: Option<String>) -> Result<er_db::TestReport, String> {
    let mut spec = spec;
    secrets::fill_hops(&mut spec.hops, connection_id.as_deref().unwrap_or(""))?;
    Ok(er_db::terminal::test(&spec).await)
}

#[tauri::command]
pub async fn terminal_write(terminals: State<'_, Arc<Terminals>>, terminal_id: u64, data: String) -> Result<(), String> {
    terminals.write(terminal_id, data.into_bytes()).await.map_err(message)
}

#[tauri::command]
pub async fn terminal_resize(terminals: State<'_, Arc<Terminals>>, terminal_id: u64, cols: u32, rows: u32) -> Result<(), String> {
    terminals.resize(terminal_id, cols, rows).await.map_err(message)
}

#[tauri::command]
pub async fn terminal_close(terminals: State<'_, Arc<Terminals>>, terminal_id: u64) -> Result<(), String> {
    terminals.close(terminal_id).await;
    Ok(())
}
