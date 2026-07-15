# main.rs

## Purpose
Provides the smallest possible desktop binary entry point. All reusable application setup lives in the library crate.

## Components

### `main`
- **Does**: Starts the Tauri application through `fileogenetic_tree_lib::run`.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| Desktop launcher | Process starts the library application | Removing `run` invocation |

