import { open } from "@tauri-apps/plugin-dialog";
import { indexFolder, listRoots, loadRoot, searchEntries } from "./api";
import { radialLayout } from "./layouts/radial";
import { treemapLayout } from "./layouts/treemap";
import { CanvasRenderer } from "./renderer";
import { buildTree, formatBytes, markSearch, type SearchMarks } from "./tree";
import type { ColorMode, EntryDto, IndexEvent, LayoutKind, TreeNode, TreeSnapshot, VisualScene } from "./types";
import "./styles.css";

const canvas = required<HTMLCanvasElement>("map");
const tooltip = required<HTMLElement>("tooltip");
const chooseFolder = required<HTMLButtonElement>("choose-folder");
const roots = required<HTMLSelectElement>("roots");
const search = required<HTMLInputElement>("search");
const searchStatus = required<HTMLElement>("search-status");
const status = required<HTMLElement>("status");
const sizeNodes = required<HTMLInputElement>("size-nodes");
const indexingActivity = required<HTMLElement>("indexing-activity");
const indexingLabel = required<HTMLElement>("indexing-label");
const indexingDetail = required<HTMLElement>("indexing-detail");
const renderer = new CanvasRenderer(canvas, tooltip);

let snapshot: TreeSnapshot | null = null;
let rootNode: TreeNode | null = null;
let byPath = new Map<string, TreeNode>();
let layoutKind: LayoutKind = "radial";
let colorMode: ColorMode = "size";
let marks: SearchMarks = { matches: new Set(), context: new Set() };
let searchSequence = 0;
let progressiveEntries = new Map<string, EntryDto>();
let progressRenderTimer: number | undefined;
let progressSceneRendered = false;

chooseFolder.addEventListener("click", async () => {
  const selected = await open({ directory: true, multiple: false, title: "Choose a folder to index" });
  if (typeof selected !== "string") return;
  setBusy(true, `Indexing ${selected}…`);
  try {
    beginProgress();
    await applySnapshot(await indexFolder(selected, handleIndexEvent));
    await refreshRoots();
  } catch (error) {
    finishProgress();
    setStatus(errorMessage(error), true);
  } finally {
    setBusy(false);
  }
});

roots.addEventListener("change", async () => {
  const rootId = Number(roots.value);
  if (!rootId) return;
  setBusy(true, "Loading index…");
  try {
    await applySnapshot(await loadRoot(rootId));
  } catch (error) {
    setStatus(errorMessage(error), true);
  } finally {
    setBusy(false);
  }
});

search.addEventListener("input", () => {
  const sequence = ++searchSequence;
  const query = search.value.trim();
  window.setTimeout(async () => {
    if (sequence !== searchSequence || !snapshot) return;
    if (!query) {
      marks = { matches: new Set(), context: new Set() };
      searchStatus.textContent = snapshot.truncated ? "Map detail is capped; the complete index is searchable." : "Showing the complete indexed map.";
      applyRenderOptions();
      return;
    }
    try {
      const result = await searchEntries(snapshot.root.id, query);
      if (sequence !== searchSequence) return;
      marks = markSearch(result.paths, byPath);
      searchStatus.textContent = `${result.paths.length.toLocaleString()} match${result.paths.length === 1 ? "" : "es"}${result.limited ? "+" : ""}`;
      applyRenderOptions();
    } catch (error) {
      searchStatus.textContent = errorMessage(error);
    }
  }, 140);
});

required<HTMLElement>("layout-controls").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-layout]");
  if (!button) return;
  layoutKind = button.dataset.layout as LayoutKind;
  setActiveButton("layout-controls", button);
  rebuildScene();
});

required<HTMLElement>("color-controls").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-color]");
  if (!button) return;
  colorMode = button.dataset.color as ColorMode;
  setActiveButton("color-controls", button);
  updateLegend();
  applyRenderOptions();
});

sizeNodes.addEventListener("change", rebuildScene);

async function applySnapshot(next: TreeSnapshot): Promise<void> {
  const animateFinalScene = progressSceneRendered;
  finishProgress();
  snapshot = next;
  const tree = buildTree(next.entries);
  rootNode = tree.root;
  byPath = tree.byPath;
  marks = { matches: new Set(), context: new Set() };
  search.value = "";
  required<HTMLElement>("stat-files").textContent = next.root.total_files.toLocaleString();
  required<HTMLElement>("stat-folders").textContent = next.root.total_dirs.toLocaleString();
  required<HTMLElement>("stat-size").textContent = formatBytes(next.root.total_bytes);
  required<HTMLElement>("stat-indexed").textContent = new Date(next.root.indexed_at_ms).toLocaleString();
  searchStatus.textContent = next.truncated ? "The stored index is larger than the current map detail cap." : `${next.entries.length.toLocaleString()} indexed objects.`;
  roots.value = String(next.root.id);
  renderer.setScene(createScene(rootNode), { fit: true, animateNew: animateFinalScene });
  progressSceneRendered = false;
  applyRenderOptions();
  setStatus(`Indexed ${next.root.path}${next.root.unreadable ? ` · ${next.root.unreadable} unreadable` : ""}`);
}

function rebuildScene(): void {
  if (!rootNode) return;
  renderer.setScene(createScene(rootNode));
  applyRenderOptions();
}

function createScene(node: TreeNode): VisualScene {
  return layoutKind === "radial"
    ? radialLayout(node, { maxDepth: 12, maxChildren: 80, maxNodes: 12_000, sizeNodes: sizeNodes.checked })
    : treemapLayout(node, { maxDepth: 9, maxNodes: 14_000 });
}

function beginProgress(): void {
  snapshot = null;
  progressiveEntries = new Map();
  progressSceneRendered = false;
  rootNode = null;
  byPath = new Map();
  marks = { matches: new Set(), context: new Set() };
  search.value = "";
  renderer.clearScene();
  indexingActivity.hidden = false;
  indexingLabel.textContent = "Discovering files…";
  indexingDetail.textContent = "Preparing the map";
  for (const id of ["stat-files", "stat-folders", "stat-size", "stat-indexed"]) required<HTMLElement>(id).textContent = "–";
}

function handleIndexEvent(event: IndexEvent): void {
  if (event.event === "started") {
    indexingLabel.textContent = "Growing the map…";
    indexingDetail.textContent = event.root_path;
    return;
  }
  if (event.event === "batch") {
    for (const entry of event.entries) progressiveEntries.set(entry.path, entry);
    updateProgressCounters(event);
    scheduleProgressRender();
    return;
  }
  updateProgressCounters(event);
  indexingLabel.textContent = "Finalizing the index…";
  indexingDetail.textContent = `${event.scanned.toLocaleString()} objects · aggregating folders and saving search data`;
  renderProgressScene();
}

function updateProgressCounters(event: Extract<IndexEvent, { event: "batch" | "finalizing" }>): void {
  required<HTMLElement>("stat-files").textContent = event.total_files.toLocaleString();
  required<HTMLElement>("stat-folders").textContent = event.total_dirs.toLocaleString();
  required<HTMLElement>("stat-size").textContent = formatBytes(event.total_bytes);
  required<HTMLElement>("stat-indexed").textContent = "scanning…";
  indexingDetail.textContent = `${event.scanned.toLocaleString()} objects · ${formatBytes(event.total_bytes)}${event.unreadable ? ` · ${event.unreadable} unreadable` : ""}`;
}

function scheduleProgressRender(): void {
  if (progressRenderTimer !== undefined) return;
  progressRenderTimer = window.setTimeout(() => {
    progressRenderTimer = undefined;
    renderProgressScene();
  }, 110);
}

function renderProgressScene(): void {
  if (progressiveEntries.size === 0) return;
  if (progressRenderTimer !== undefined) {
    window.clearTimeout(progressRenderTimer);
    progressRenderTimer = undefined;
  }
  const tree = buildTree(Array.from(progressiveEntries.values()));
  rootNode = tree.root;
  byPath = tree.byPath;
  renderer.setScene(createScene(rootNode), { fit: !progressSceneRendered, animateNew: true });
  progressSceneRendered = true;
  applyRenderOptions();
}

function finishProgress(): void {
  if (progressRenderTimer !== undefined) window.clearTimeout(progressRenderTimer);
  progressRenderTimer = undefined;
  progressiveEntries.clear();
  indexingActivity.hidden = true;
}

function applyRenderOptions(): void {
  renderer.setOptions({ colorMode, queryActive: search.value.trim().length > 0, matches: marks.matches, context: marks.context });
}

async function refreshRoots(): Promise<void> {
  const indexed = await listRoots();
  const selected = snapshot?.root.id;
  roots.replaceChildren(new Option("Previously indexed folders…", ""));
  for (const root of indexed) roots.add(new Option(root.path, String(root.id)));
  if (selected) roots.value = String(selected);
}

function updateLegend(): void {
  const sizeGradient = required<HTMLElement>("size-gradient");
  const typeLegend = required<HTMLElement>("type-legend");
  required<HTMLElement>("legend-title").textContent = colorMode === "size" ? "color = file size" : "color = object type";
  sizeGradient.hidden = colorMode !== "size";
  typeLegend.hidden = colorMode !== "type";
  if (colorMode === "type" && typeLegend.childElementCount === 0) {
    for (const [label, color] of [["folder", "#e8b04b"], ["file", "#5fd4c4"], ["symlink", "#9d7bf0"]]) {
      const item = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.style.background = color;
      item.append(swatch, label);
      typeLegend.append(item);
    }
  }
}

function setBusy(busy: boolean, message?: string): void {
  chooseFolder.disabled = busy;
  roots.disabled = busy;
  search.disabled = busy;
  document.body.classList.toggle("busy", busy);
  if (message) setStatus(message);
}

function setStatus(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function setActiveButton(containerId: string, active: HTMLButtonElement): void {
  for (const button of required<HTMLElement>(containerId).querySelectorAll("button")) button.classList.toggle("active", button === active);
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

refreshRoots().catch((error) => setStatus(`Desktop backend unavailable: ${errorMessage(error)}`, true));
updateLegend();
