# Fileogenetic Tree

A cross-platform desktop filesystem map for macOS and Linux. The application indexes a selected folder into a local SQLite database, then visualizes it as either a radial dendrogram or a size-proportional square treemap.

## Current vertical slice

- Native folder selection through Tauri
- Read-only recursive metadata indexing in Rust
- Live streamed indexing with an animated, progressively emerging tree
- Persistent SQLite root and entry storage
- FTS5 filename/path search with map fading
- Radial fisheye layout and square treemap layout
- Color by size or object type
- Optional radial node sizing by file size
- Pan, zoom, hover metadata, and saved-index reopening

The original standalone concept remains available in `file-dendrite.html`.

## Development

Prerequisites are Node.js, Rust, the Tauri CLI dependencies for your platform, and WebKitGTK 4.1 on Arch Linux.

```sh
npm install
npm run tauri dev
```

Run validation without opening the desktop window:

```sh
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## Data and privacy

The index is stored under the operating system's per-user application-data directory. Scanning is read-only, symbolic links are not followed, and no file metadata leaves the machine.

## Next milestones

1. Incremental FSEvents/inotify updates and rescan reconciliation
2. Lazy native thumbnail generation and an LRU thumbnail cache
3. Open/reveal actions and a preview inspector
4. Search query filters for type, size, and modification time
5. Signed macOS distribution and an Arch/AUR package
