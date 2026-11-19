mod connections;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(std::sync::Arc::new(er_db::session::Sessions::default()))
        .setup(|_| {
            er_db::init();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connections::connection_test,
            connections::secrets_save,
            connections::secrets_delete,
            connections::ssh_config_read,
            connections::connection_open,
            connections::connection_close,
            connections::session_schemas,
            connections::session_schema,
            connections::session_rows,
            connections::query_run,
            connections::query_finish,
            connections::session_script
        ])
        .run(tauri::generate_context!())
        .expect("error while running ER Studio");
}
