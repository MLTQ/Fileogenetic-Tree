# api.ts

## Purpose
Provides the only frontend boundary to Tauri commands. Keeping invocation details here prevents UI and visualization modules from depending directly on Tauri.

## Components

### `indexFolder`
- **Does**: Scans and persists a selected filesystem root, streams progress through a typed channel, and returns its final snapshot.
- **Interacts with**: Rust `index_folder` command and frontend `IndexEvent` contract.

### `listRoots` / `loadRoot`
- **Does**: Restores previously indexed roots without rescanning.
- **Interacts with**: Rust persistence commands.

### `searchEntries`
- **Does**: Executes an FTS-backed search and returns matching paths.
- **Interacts with**: Rust `search_entries` command.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `main.ts` | Rejected promises contain user-displayable errors | Command name or argument changes |
| Rust commands | Camel-case invocation arguments and `Channel` map to Rust parameters | Parameter rename or channel removal |
