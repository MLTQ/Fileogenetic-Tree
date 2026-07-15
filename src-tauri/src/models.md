# models.rs

## Purpose
Defines backend domain records and serialized command responses. The DTO field names intentionally mirror frontend TypeScript contracts.

## Components

### `EntryKind` / `EntryDto`
- **Does**: Represents indexed filesystem objects and their hierarchy metadata.
- **Interacts with**: `scanner.rs`, `index_store.rs`, and frontend `types.ts`.

### `RootSummary` / `TreeSnapshot`
- **Does**: Describes an indexed root and a bounded map snapshot.

### `SearchResponse`
- **Does**: Returns matching indexed paths and whether the configured result limit was reached.

### `IndexEvent`
- **Does**: Streams scan lifecycle, entry batches, and live counters to the frontend over a Tauri channel.
- **Interacts with**: `scanner.rs`, `commands.rs`, and frontend `types.ts`.

### `ScanResult`
- **Does**: Transfers a completed scan into persistence without exposing internal database details.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| Frontend `types.ts` | Serialized snake_case fields and lowercase kinds | Field or enum serialization changes |
| `index_store.rs` | `EntryKind` converts to/from stable database strings | String mapping changes |
| `commands.rs` | Response types implement `Serialize` | Removing serialization |
| Frontend progressive UI | `IndexEvent` uses an `event` discriminator and snake_case fields | Variant or field changes |
