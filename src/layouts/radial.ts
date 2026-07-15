import type { TreeNode, VisualEdge, VisualNode, VisualScene } from "../types";

export interface RadialOptions {
  maxDepth: number;
  maxChildren: number;
  maxNodes: number;
  sizeNodes: boolean;
}

interface Branch {
  node: TreeNode;
  parent: Branch | null;
  children: Branch[];
  slotMin: number;
  slotMax: number;
  angle: number;
  radialDepth: number;
  synthetic: boolean;
}

const RING_GAP = 110;

export function radialLayout(root: TreeNode, options: RadialOptions): VisualScene {
  let budget = options.maxNodes;
  let nextSlot = 0;
  const branches: Branch[] = [];

  function visit(node: TreeNode, parent: Branch | null, radialDepth: number, synthetic = false): Branch | null {
    if (budget-- <= 0) return null;
    const branch: Branch = { node, parent, children: [], slotMin: 0, slotMax: 0, angle: 0, radialDepth, synthetic };
    branches.push(branch);

    if (node.kind === "directory" && radialDepth < options.maxDepth) {
      const shown = node.children.slice(0, options.maxChildren);
      for (const child of shown) {
        const built = visit(child, branch, radialDepth + 1);
        if (built) branch.children.push(built);
      }
      if (node.children.length > shown.length && budget > 0) {
        const hidden = node.children.slice(shown.length);
        const aggregate: TreeNode = {
          path: `${node.path}/::aggregate`,
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
        const built = visit(aggregate, branch, radialDepth + 1, true);
        if (built) branch.children.push(built);
      }
    }

    if (branch.children.length === 0) {
      branch.slotMin = nextSlot;
      branch.slotMax = nextSlot;
      nextSlot += 1;
    } else {
      branch.slotMin = branch.children[0].slotMin;
      branch.slotMax = branch.children[branch.children.length - 1].slotMax;
    }
    return branch;
  }

  visit(root, null, 0);
  const slotCount = Math.max(1, nextSlot);
  const maxDepth = Math.max(1, ...branches.map((branch) => branch.radialDepth));
  const rim = maxDepth * RING_GAP;
  const visualNodes: VisualNode[] = [];
  const edges: VisualEdge[] = [];

  for (const branch of branches) {
    const slot = (branch.slotMin + branch.slotMax) / 2;
    branch.angle = -Math.PI / 2 + ((slot + 0.5) / slotCount) * Math.PI * 2;
    const distance = branch.radialDepth * RING_GAP;
    const x = Math.cos(branch.angle) * distance;
    const y = Math.sin(branch.angle) * distance;
    const radius = options.sizeNodes
      ? 2.4 + Math.min(10, Math.sqrt(Math.max(0, Math.log2(branch.node.size + 1))) * 1.4)
      : branch.node.kind === "directory" ? 5 : 3;

    visualNodes.push({
      path: branch.node.path,
      parent_path: branch.node.parent_path,
      name: branch.node.name,
      kind: branch.node.kind,
      size: branch.node.size,
      depth: branch.radialDepth,
      child_count: branch.node.child_count,
      x,
      y,
      radius,
      angle: branch.angle,
      synthetic: branch.synthetic,
    });

    if (branch.parent) {
      const parentDistance = branch.parent.radialDepth * RING_GAP;
      const points = [];
      const span = branch.angle - branch.parent.angle;
      const arcSegments = Math.max(2, Math.min(24, Math.ceil(Math.abs(span) * 10)));
      for (let index = 0; index <= arcSegments; index += 1) {
        const angle = branch.parent.angle + span * (index / arcSegments);
        points.push({ x: Math.cos(angle) * parentDistance, y: Math.sin(angle) * parentDistance });
      }
      points.push({ x, y });
      edges.push({ parent_path: branch.parent.node.path, child_path: branch.node.path, points });
    }
  }

  return {
    kind: "radial",
    nodes: visualNodes,
    edges,
    bounds: { x: -rim, y: -rim, width: rim * 2, height: rim * 2 },
  };
}
