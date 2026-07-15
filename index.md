# index.html

## Purpose
Defines the desktop application's accessible UI shell. The canvas owns the map while the panel exposes indexing, search, layout, and visual encoding controls.

## Components

### `#map`
- **Does**: Hosts the filesystem visualization rendered by `CanvasRenderer`.
- **Interacts with**: `renderer.ts`.

### `.panel`
- **Does**: Provides commands and live index statistics.
- **Interacts with**: Event wiring in `main.ts`.

### `#indexing-activity`
- **Does**: Announces the active scan phase and shows a dendrite loader plus indeterminate activity track.
- **Interacts with**: Streaming lifecycle events handled by `main.ts`.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `main.ts` | Stable control IDs for event binding | Renaming any ID |
| `renderer.ts` | `#map` canvas and `#tooltip` element | Element type or removal |
| Progressive indexing | Loader label, detail, and activity IDs remain stable | ID or hidden-state changes |
