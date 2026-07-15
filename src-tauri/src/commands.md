# commands.rs

## Purpose
Exposes the backend's narrow Tauri command API. Each blocking scan or SQLite operation runs off the UI thread and errors cross the boundary as readable strings.

## Components

### `index_folder`
- **Does**: Streams scan progress over an IPC channel, transactionally stores the completed scan, and returns a bounded snapshot.
- **Interacts with**: `scanner.rs`, `index_store.rs`, and managed `AppState`.

### `list_roots` / `load_root`
- **Does**: Restores persisted indexes without rescanning the filesystem.

### `search_entries`
- **Does**: Executes complete-index FTS search for one root.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| Frontend `api.ts` | Command names, camel-case arguments, and `onEvent` channel stay stable | Function or parameter rename |
| `lib.rs` | Commands are public for handler registration | Visibility changes |
| UI thread | Blocking work remains inside `spawn_blocking` | Moving scan/SQL work outside tasks |
