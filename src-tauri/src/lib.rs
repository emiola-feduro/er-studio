mod connections;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            connections::connection_test,
            connections::secrets_save,
            connections::secrets_delete,
            connections::ssh_config_read
        ])
        .run(tauri::generate_context!())
        .expect("error while running ER Studio");
}
