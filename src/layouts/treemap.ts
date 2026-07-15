import type { Rect, TreeNode, VisualNode, VisualScene } from "../types";

export interface TreemapOptions {
  maxDepth: number;
  maxNodes: number;
}

interface AreaItem {
  node: TreeNode;
  area: number;
}

const ROOT_BOUNDS: Rect = { x: 0, y: 0, width: 1400, height: 900 };

export function treemapLayout(root: TreeNode, options: TreemapOptions): VisualScene {
  const nodes: VisualNode[] = [];
  let budget = options.maxNodes;

  function addNode(node: TreeNode, rect: Rect, depth: number): void {
    if (budget-- <= 0 || rect.width < 0.75 || rect.height < 0.75) return;
    nodes.push({
      path: node.path,
      parent_path: node.parent_path,
      name: node.name,
      kind: node.kind,
      size: node.size,
      depth,
      child_count: node.child_count,
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      radius: 0,
      rect,
    });

    if (node.kind !== "directory" || depth >= options.maxDepth || node.children.length === 0) return;
    const inset = Math.min(10, Math.max(2, Math.min(rect.width, rect.height) * 0.015));
    const header = rect.height > 45 ? 18 : inset;
    const content = {
      x: rect.x + inset,
      y: rect.y + header,
      width: Math.max(0, rect.width - inset * 2),
      height: Math.max(0, rect.height - header - inset),
    };
    const available = Math.max(0, budget);
    if (available === 0) return;
    let visibleChildren = node.children;
    if (node.children.length > available) {
      const shown = node.children.slice(0, Math.max(0, available - 1));
      const hidden = node.children.slice(shown.length);
      const aggregate: TreeNode = {
        path: `${node.path}/::treemap-aggregate`,
        parent_path: node.path,
        name: `+${hidden.length.toLocaleString()} more`,
        kind: "aggregate",
        size: hidden.reduce((sum, child) => sum + child.size, 0),
        modified_ms: null,
        extension: "",
        depth: node.depth + 1,
        child_count: hidden.length,
        children: [],
      };
      visibleChildren = shown.concat(aggregate);
    }
    const childRects = squarify(visibleChildren, content);
    for (const [child, childRect] of childRects) addNode(child, childRect, depth + 1);
  }

  addNode(root, ROOT_BOUNDS, 0);
  return { kind: "treemap", nodes, edges: [], bounds: ROOT_BOUNDS };
}

function squarify(children: TreeNode[], bounds: Rect): Array<[TreeNode, Rect]> {
  if (children.length === 0 || bounds.width <= 0 || bounds.height <= 0) return [];
  const totalWeight = children.reduce((sum, child) => sum + Math.max(1, child.size), 0);
  const scale = (bounds.width * bounds.height) / totalWeight;
  const remaining: AreaItem[] = children
    .map((node) => ({ node, area: Math.max(1, node.size) * scale }))
    .sort((a, b) => b.area - a.area);
  const output: Array<[TreeNode, Rect]> = [];
  let rect = { ...bounds };
  let row: AreaItem[] = [];

  while (remaining.length > 0) {
    const candidate = remaining[0];
    const side = Math.max(0.001, Math.min(rect.width, rect.height));
    if (row.length === 0 || worst(row.concat(candidate), side) <= worst(row, side)) {
      row.push(candidate);
      remaining.shift();
    } else {
      rect = layoutRow(row, rect, output);
      row = [];
    }
  }
  if (row.length > 0) layoutRow(row, rect, output);
  return output;
}

function worst(row: AreaItem[], side: number): number {
  if (row.length === 0) return Number.POSITIVE_INFINITY;
  const sum = row.reduce((value, item) => value + item.area, 0);
  const largest = Math.max(...row.map((item) => item.area));
  const smallest = Math.min(...row.map((item) => item.area));
  const sideSquared = side * side;
  return Math.max((sideSquared * largest) / (sum * sum), (sum * sum) / (sideSquared * smallest));
}

function layoutRow(row: AreaItem[], rect: Rect, output: Array<[TreeNode, Rect]>): Rect {
  const area = row.reduce((sum, item) => sum + item.area, 0);
  if (rect.width >= rect.height) {
    const width = Math.min(rect.width, area / Math.max(rect.height, 0.001));
    let y = rect.y;
    for (const item of row) {
      const height = item.area / Math.max(width, 0.001);
      output.push([item.node, { x: rect.x, y, width, height }]);
      y += height;
    }
    return { x: rect.x + width, y: rect.y, width: Math.max(0, rect.width - width), height: rect.height };
  }

  const height = Math.min(rect.height, area / Math.max(rect.width, 0.001));
  let x = rect.x;
  for (const item of row) {
    const width = item.area / Math.max(height, 0.001);
    output.push([item.node, { x, y: rect.y, width, height }]);
    x += width;
  }
  return { x: rect.x, y: rect.y + height, width: rect.width, height: Math.max(0, rect.height - height) };
}
