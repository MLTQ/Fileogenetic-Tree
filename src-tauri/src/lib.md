# lib.rs

## Purpose
Composes the desktop application: plugins, persistent state, command registration, and Tauri lifecycle. Filesystem and database behavior stay in dedicated modules.

## Components

### `AppState`
- **Does**: Shares the application database path with command handlers.
- **Interacts with**: `commands.rs` and `index_store.rs`.

### `run`
- **Does**: Initializes the data directory and database, registers commands, and starts Tauri.
- **Interacts with**: Dialog plugin and all backend modules.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `main.rs` | Public `run()` starts the application | Function rename/signature |
| Frontend `api.ts` | Registered command names remain stable | Handler removal or rename |
| `commands.rs` | Managed `AppState` contains a database path | State shape changes |

