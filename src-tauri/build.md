# build.rs

## Purpose
Runs Tauri's build-time configuration and resource generation. It intentionally contains no application behavior.

## Components

### `main`
- **Does**: Delegates to `tauri_build::build`.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| Cargo | Build script completes before compiling the app | Removing Tauri build invocation |

