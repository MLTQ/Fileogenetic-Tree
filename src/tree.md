# tree.ts

## Purpose
Transforms flat indexed entries into an in-memory hierarchy and derives search highlighting context. Formatting helpers live here because they describe filesystem model values.

## Components

### `buildTree`
- **Does**: Links entries by path, sorts children consistently, and recomputes directory aggregates from the currently available descendants.
- **Interacts with**: DTOs from `types.ts`; layout engines consume its result.
- **Rationale**: The same hierarchy builder remains correct for both partial streaming batches and finalized snapshots.

### `markSearch`
- **Does**: Marks direct matches and every ancestor needed to reveal their location.
- **Interacts with**: Search paths returned by `api.ts`.

### `formatBytes`
- **Does**: Formats byte totals for statistics and tooltips.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `main.ts` | Exactly one entry has `parent_path === null` | Root representation changes |
| Layout modules | Directories precede files and children are size sorted | Sort policy changes |
| Progressive indexing | Directory sizes and child counts reflect entries received so far | Aggregate recomputation changes |
| `renderer.ts` | Search context contains ancestor paths | Context semantics change |
