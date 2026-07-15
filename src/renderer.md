# renderer.ts

## Purpose
Owns Canvas drawing and direct map interaction. It renders layout-independent scenes, animates newly discovered nodes, controls the camera, applies the radial fisheye, hit-tests transformed geometry, and manages tooltips.

## Components

### `CanvasRenderer`
- **Does**: Draws radial or treemap scenes and manages pan, zoom, hover, search fading, and visual encoding.
- **Interacts with**: Scene types from `types.ts`, byte formatting from `tree.ts`, and DOM elements from `index.html`.
- **Rationale**: Layout computation stays pure while stateful browser interaction remains isolated here.

### `setScene`
- **Does**: Replaces geometry, tracks node birth times, builds constant-time path lookup, recalculates size-color bounds, and optionally fits the camera.

### `clearScene`
- **Does**: Removes prior-root geometry immediately when a new progressive scan begins.

### `setOptions`
- **Does**: Applies color and search-mark changes without recomputing layout.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `main.ts` | `setScene` can preserve the camera and fade new nodes during batch updates | Update option or camera lifecycle changes |
| Layout modules | Scene coordinates are never mutated | Renderer mutating geometry |
| `index.html` | Tooltip can contain generated child elements | Tooltip markup contract changes |

## Notes
- Treemap intentionally disables the fisheye because rectangle distortion harms area comparison.
- The radial fisheye uses a compact 130 px screen-space radius so magnification remains local to the pointer.
- Rendering is dirty-frame driven, so the app is idle when no visual state changes.
- Radial hit-testing uses projected positions, keeping hover accurate under fisheye distortion.
- Edge coloring uses a scene-local path map and size bounds are accumulated without large-array spreading.
- Emergence frames run only for the 420 ms transition window, preserving idle rendering afterward.
