# main.ts

## Purpose
Coordinates the application UI, backend API, hierarchy model, layout selection, and renderer. It is the composition root; feature algorithms belong in their dedicated modules.

## Components

### Folder indexing flow
- **Does**: Opens the native folder dialog, consumes streamed scan batches, grows a partial map, then replaces it with the finalized persisted snapshot.
- **Interacts with**: `api.ts`, `tree.ts`, and controls in `index.html`.

### Search flow
- **Does**: Debounces backend FTS queries and applies direct-match plus ancestor marks.
- **Interacts with**: `searchEntries`, `markSearch`, and `CanvasRenderer`.

### `rebuildScene`
- **Does**: Selects the radial or treemap layout and replaces renderer geometry.
- **Interacts with**: Both layout modules and visual controls.

### Progressive indexing flow
- **Does**: Throttles batch-driven hierarchy rebuilds, updates live counters, and preserves the camera while new nodes emerge.
- **Interacts with**: `IndexEvent` from `api.ts`, `buildTree`, the indexing loader, and animated `CanvasRenderer.setScene` updates.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `index.html` | IDs and data attributes match event wiring | Selector changes |
| `api.ts` | Commands return complete DTO contracts | DTO changes |
| `renderer.ts` | Layout and search updates can be applied independently | Renderer method changes |
| Rust scanner | Lifecycle events arrive in started/batch/finalizing order | Event ordering or fields |

## Notes
- Search sequencing discards stale asynchronous responses.
- The full index may exceed the current snapshot/map cap; backend search remains complete.
- Backend DTOs and scene contracts are imported as types so the composition root adds no runtime coupling.
- Partial map rebuilds are throttled to roughly nine updates per second; the final snapshot always replaces provisional aggregates.
- The final snapshot preserves the active emergence transition so fast scans do not snap abruptly to a static result.
