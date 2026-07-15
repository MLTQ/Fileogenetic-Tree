export type EntryKind = "file" | "directory" | "symlink" | "aggregate";
export type LayoutKind = "radial" | "treemap";
export type ColorMode = "size" | "type";

export interface RootSummary {
  id: number;
  path: string;
  indexed_at_ms: number;
  total_files: number;
  total_dirs: number;
  total_bytes: number;
  unreadable: number;
}

export interface EntryDto {
  path: string;
  parent_path: string | null;
  name: string;
  kind: EntryKind;
  size: number;
  modified_ms: number | null;
  extension: string;
  depth: number;
  child_count: number;
}

export interface TreeSnapshot {
  root: RootSummary;
  entries: EntryDto[];
  truncated: boolean;
}

export interface SearchResponse {
  paths: string[];
  limited: boolean;
}

export type IndexEvent =
  | { event: "started"; root_path: string }
  | {
      event: "batch";
      entries: EntryDto[];
      scanned: number;
      total_files: number;
      total_dirs: number;
      total_bytes: number;
      unreadable: number;
    }
  | {
      event: "finalizing";
      scanned: number;
      total_files: number;
      total_dirs: number;
      total_bytes: number;
      unreadable: number;
    };

export interface TreeNode extends EntryDto {
  children: TreeNode[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualNode {
  path: string;
  parent_path: string | null;
  name: string;
  kind: EntryKind;
  size: number;
  depth: number;
  child_count: number;
  x: number;
  y: number;
  radius: number;
  angle?: number;
  rect?: Rect;
  synthetic?: boolean;
}

export interface VisualEdge {
  parent_path: string;
  child_path: string;
  points: Point[];
}

export interface VisualScene {
  kind: LayoutKind;
  nodes: VisualNode[];
  edges: VisualEdge[];
  bounds: Rect;
}

export interface RenderOptions {
  colorMode: ColorMode;
  queryActive: boolean;
  matches: Set<string>;
  context: Set<string>;
}
