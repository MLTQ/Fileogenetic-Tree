# index_store.rs

## Purpose
Owns the persistent SQLite schema and all index queries. It stores complete scans transactionally, maintains an FTS5 search table, and returns bounded map snapshots.

## Components

### `IndexStore::initialize`
- **Does**: Creates root, entry, supporting index, and FTS5 tables with WAL enabled.

### `replace_scan`
- **Does**: Atomically replaces one root's entries and corresponding search records.
- **Interacts with**: `ScanResult` from `scanner.rs` via `models.rs`.

### `list_roots` / `load_snapshot`
- **Does**: Restores prior indexes and caps frontend transfer at 200,000 entries.

### `search`
- **Does**: Runs tokenized prefix search over the complete persisted root.
- **Rationale**: Search must remain complete even when map geometry is intentionally bounded.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `commands.rs` | Store methods open independent connections and are background-thread safe | Persistent connection state |
| Frontend | Snapshot root and entries share the same root ID | Root replacement semantics |
| Search UI | Paths uniquely identify visible nodes | Path representation changes |

## Notes
- FTS data is intentionally duplicated rather than using an external-content table, simplifying transactional replacement.
- Byte sizes are saturated to SQLite's signed integer range.
- Tests exercise the complete scan → transaction → snapshot → FTS search path against an isolated temporary database.
