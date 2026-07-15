# types.ts

## Purpose
Defines shared frontend contracts for backend DTOs, hierarchy nodes, layout output, and renderer configuration. It contains no behavior.

## Components

### Backend DTOs
- **Does**: Models roots, entries, snapshots, search responses, and streaming index events serialized by Rust.
- **Interacts with**: `api.ts`, `tree.ts`, and Rust models in `src-tauri/src/models.rs`.

### Visualization types
- **Does**: Gives layout engines a renderer-independent scene format.
- **Interacts with**: `radial.ts`, `treemap.ts`, and `renderer.ts`.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `api.ts` | DTO keys match Rust's snake_case serialization | Field rename or type change |
| `main.ts` | `IndexEvent.event` discriminates lifecycle variants | Event tag or variant change |
| Layout modules | `TreeNode.children` is populated | Removing hierarchy fields |
| `renderer.ts` | Scene nodes use world coordinates | Coordinate meaning changes |
