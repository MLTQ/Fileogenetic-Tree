# styles.css

## Purpose
Defines the desktop shell, control panel, tooltip, and responsive presentation. Canvas geometry and visualization colors remain renderer concerns.

## Components

### `#map`
- **Does**: Fills the window and provides the dark spatial backdrop.

### `.panel`
- **Does**: Presents a compact, scrollable HUD above the canvas.

### `.indexing-activity`
- **Does**: Animates an indeterminate dendrite and scan track while preserving live textual counters.
- **Interacts with**: `main.ts` visibility and phase updates.

### `.tooltip` / `.hint`
- **Does**: Styles transient map guidance without intercepting pointer input.

## Contracts

| Dependent | Expects | Breaking changes |
|-----------|---------|------------------|
| `renderer.ts` | Canvas has a measurable full-window CSS box | Canvas positioning changes |
| `main.ts` | `.active`, `.busy`, and `.error` reflect UI state | State class rename |
| `index.html` | Theme variables and component classes exist | Selector removal |
| Reduced-motion users | Indexing state remains legible with animations effectively disabled | Removing motion fallback |
