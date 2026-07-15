import type { EntryDto, TreeNode } from "./types";

export interface SearchMarks {
  matches: Set<string>;
  context: Set<string>;
}

export function buildTree(entries: EntryDto[]): { root: TreeNode; byPath: Map<string, TreeNode> } {
  if (entries.length === 0) throw new Error("The index did not contain a root entry.");

  const byPath = new Map<string, TreeNode>();
  for (const entry of entries) byPath.set(entry.path, { ...entry, children: [] });

  let root: TreeNode | undefined;
  for (const node of byPath.values()) {
    if (node.parent_path === null) {
      root = node;
      continue;
    }
    byPath.get(node.parent_path)?.children.push(node);
  }

  if (!root) throw new Error("The index hierarchy did not contain a root node.");
  for (const node of byPath.values()) {
    node.children.sort((a, b) => Number(b.kind === "directory") - Number(a.kind === "directory") || b.size - a.size || a.name.localeCompare(b.name));
  }
  const deepestFirst = Array.from(byPath.values()).sort((a, b) => b.depth - a.depth);
  for (const node of deepestFirst) {
    if (node.kind !== "directory") continue;
    node.size = node.children.reduce((sum, child) => sum + child.size, 0);
    node.child_count = node.children.length;
  }
  return { root, byPath };
}

export function markSearch(paths: string[], byPath: Map<string, TreeNode>): SearchMarks {
  const matches = new Set(paths);
  const context = new Set<string>();
  for (const path of matches) {
    let node = byPath.get(path);
    while (node?.parent_path) {
      context.add(node.parent_path);
      node = byPath.get(node.parent_path);
    }
  }
  return { matches, context };
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}
