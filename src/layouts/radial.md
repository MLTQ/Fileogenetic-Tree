# radial.ts

## Purpose
Converts a filesystem hierarchy into a depth-radius circular dendrogram. It also applies visualization-only node and child budgets without altering the complete index.

## Components

### `radialLayout`
- **Does**: Selects visible descendants, assigns angular leaf slots, places every node on its filesystem-depth ring, and produces nodes plus curved elbow edges.
- **Interacts with**: `TreeNode` from `types.ts`; `CanvasRenderer` consumes the returned scene.
- **Rationale**: Index completeness and render density are separate concerns, so aggregation happens only here.
- **Geometry**: Every parent-to-child hop has the same radial length. Shallow directory branches terminate naturally instead of stretching their files to the deepest outer ring.

### `RadialOptions`
- **Does**: Controls depth, fanout, node budget, and size encoding.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `main.ts` | Layout is deterministic for a sorted tree | Ordering or budget semantics |
| `renderer.ts` | Edge points are world-space polylines | Edge representation changes |
| Search UI | Aggregate nodes use synthetic paths | Synthetic path convention changes |
