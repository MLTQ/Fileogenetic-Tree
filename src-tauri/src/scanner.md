# scanner.rs

## Purpose
Performs a read-only recursive metadata scan, streams bounded visualization samples throughout discovery, and calculates aggregate directory statistics. It never follows symbolic links and never mutates user files.

## Components

### `scan_folder`
- **Does**: Provides a test-only no-progress wrapper around the streaming scanner.
- **Interacts with**: Persistence integration tests in `index_store.rs`.

### `scan_folder_with_progress`
- **Does**: Runs the same complete scan while emitting lifecycle events, renderable entry batches, and uncapped live counters.
- **Rationale**: The UI can emerge for the duration of a large scan without allowing IPC or Canvas work to scale with millions of files.

### `ProgressSampler`
- **Does**: Streams the early tree densely, then spaces later leaf samples adaptively while retaining their visible parent directories.
- **Rationale**: A first-N cutoff fills almost instantly on fast disks; adaptive sampling keeps later discoveries reaching the map within a fixed 1,000,000-entry ceiling.

### `aggregate_directories`
- **Does**: Propagates sizes from deepest entries through every ancestor and counts direct children.
- **Rationale**: Layouts need folder sizes without recursively recomputing them on every load.

### `ScanError`
- **Does**: Produces user-readable validation and I/O failures.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `commands.rs` | Scan is read-only and safe on a background thread | Side effects or async requirement |
| `index_store.rs` | Root entry is first and directory sizes are aggregated | Entry ordering or aggregation changes |
| Frontend layouts | Symlinks are leaves and cannot create traversal loops | Following symlinks |
| Progressive UI | Directory and adaptive leaf samples remain hierarchy-safe and capped at 1,000,000 while counters cover the complete scan | Sampling limits or event cadence changes |

## Notes
- Individual unreadable entries are counted and skipped rather than failing the entire scan.
- The visualization ceiling reserves 250,000 entries for directories and 750,000 for adaptively sampled files or symlinks.
- Non-UTF-8 paths are represented lossily at the UI boundary; a future stable binary path key can preserve raw bytes on Unix.
- Progress tests verify `Started` → `Batch` → `Finalizing` ordering, batch contents, bounded sampling, and continued late-scan selection.
- Counter-only events are emitted every 1,024 discovered objects after the visualization stream reaches its cap.
