mod commands;
mod index_store;
mod models;
mod scanner;

use std::path::PathBuf;

use tauri::Manager;

pub struct AppState {
    pub database_path: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database_path = data_dir.join("fileogenetic-index.db");
            index_store::IndexStore::new(&database_path)?.initialize()?;
            app.manage(AppState { database_path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::index_folder,
            commands::list_roots,
            commands::load_root,
            commands::search_entries,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Fileogenetic Tree");
}
