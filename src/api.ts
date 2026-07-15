import { Channel, invoke } from "@tauri-apps/api/core";
import type { IndexEvent, RootSummary, SearchResponse, TreeSnapshot } from "./types";

export function indexFolder(path: string, onProgress: (event: IndexEvent) => void): Promise<TreeSnapshot> {
  const onEvent = new Channel<IndexEvent>(onProgress);
  return invoke<TreeSnapshot>("index_folder", { path, onEvent });
}

export function listRoots(): Promise<RootSummary[]> {
  return invoke<RootSummary[]>("list_roots");
}

export function loadRoot(rootId: number): Promise<TreeSnapshot> {
  return invoke<TreeSnapshot>("load_root", { rootId });
}

export function searchEntries(rootId: number, query: string, limit = 10_000): Promise<SearchResponse> {
  return invoke<SearchResponse>("search_entries", { rootId, query, limit });
}
