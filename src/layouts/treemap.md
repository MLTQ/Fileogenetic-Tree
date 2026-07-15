# treemap.ts

## Purpose
Builds the square, space-filling filesystem view. Rectangle area is proportional to aggregated byte size, making it the most direct disk-usage layout.

## Components

### `treemapLayout`
- **Does**: Recursively lays out directories within a fixed world-space rectangle and folds overflow into an area-preserving aggregate.
- **Interacts with**: `TreeNode` from `types.ts`; `CanvasRenderer` draws its scene.

### `squarify`
- **Does**: Groups size-sorted children into rows with reasonably square aspect ratios.
- **Rationale**: Square cells are easier to compare and label than slice-only treemaps.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `main.ts` | Byte size controls rectangle area | Weighting policy changes |
| `renderer.ts` | Every treemap node has a world-space `rect` | Missing rectangles or coordinate changes |

## Notes
- An exhausted renderer budget stops descent immediately; otherwise it bounds both output geometry and sibling data passed into squarification.
