use std::path::PathBuf;

use tauri::{ipc::Channel, State};

use crate::{
    index_store::IndexStore,
    models::{IndexEvent, RootSummary, SearchResponse, TreeSnapshot},
    scanner, AppState,
};

#[tauri::command]
pub async fn index_folder(
    path: String,
    on_event: Channel<IndexEvent>,
    state: State<'_, AppState>,
) -> Result<TreeSnapshot, String> {
    let database_path = state.database_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let scan = scanner::scan_folder_with_progress(&PathBuf::from(path), |event| {
            let _ = on_event.send(event);
        })
        .map_err(|error| error.to_string())?;
        let store = IndexStore::new(database_path).map_err(|error| error.to_string())?;
        let root_id = store
            .replace_scan(&scan)
            .map_err(|error| error.to_string())?;
        store
            .load_snapshot(root_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "indexed root disappeared before it could be loaded".to_owned())
    })
    .await
    .map_err(|error| format!("indexing task failed: {error}"))?
}

#[tauri::command]
pub async fn list_roots(state: State<'_, AppState>) -> Result<Vec<RootSummary>, String> {
    let database_path = state.database_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        IndexStore::new(database_path)
            .and_then(|store| store.list_roots())
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("list task failed: {error}"))?
}

#[tauri::command]
pub async fn load_root(root_id: i64, state: State<'_, AppState>) -> Result<TreeSnapshot, String> {
    let database_path = state.database_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        IndexStore::new(database_path)
            .and_then(|store| store.load_snapshot(root_id))
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("indexed root {root_id} was not found"))
    })
    .await
    .map_err(|error| format!("load task failed: {error}"))?
}

#[tauri::command]
pub async fn search_entries(
    root_id: i64,
    query: String,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<SearchResponse, String> {
    let database_path = state.database_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        IndexStore::new(database_path)
            .and_then(|store| store.search(root_id, &query, limit))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("search task failed: {error}"))?
}
