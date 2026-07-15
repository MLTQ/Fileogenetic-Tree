import type { Point, RenderOptions, VisualNode, VisualScene } from "./types";
import { formatBytes } from "./tree";

const TYPE_COLORS: Record<string, string> = {
  directory: "#e8b04b",
  file: "#5fd4c4",
  symlink: "#9d7bf0",
  aggregate: "#596579",
};

const FISHEYE_RADIUS = 130;

export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private scene: VisualScene | null = null;
  private nodesByPath = new Map<string, VisualNode>();
  private options: RenderOptions = { colorMode: "size", queryActive: false, matches: new Set(), context: new Set() };
  private camera = { x: 0, y: 0, zoom: 1 };
  private pointer = { x: 0, y: 0, inside: false };
  private panning = false;
  private moved = 0;
  private last = { x: 0, y: 0 };
  private hover: VisualNode | null = null;
  private framePending = false;
  private minLogSize = 0;
  private maxLogSize = 1;
  private birthTimes = new Map<string, number>();
  private animationUntil = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly tooltip: HTMLElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    this.bindEvents();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  setScene(scene: VisualScene, update: { fit?: boolean; animateNew?: boolean } = {}): void {
    const previousPaths = this.nodesByPath;
    this.scene = scene;
    this.nodesByPath = new Map(scene.nodes.map((node) => [node.path, node]));
    const now = performance.now();
    if (update.animateNew) {
      for (const node of scene.nodes) {
        if (!previousPaths.has(node.path)) this.birthTimes.set(node.path, now);
      }
      for (const path of this.birthTimes.keys()) {
        if (!this.nodesByPath.has(path)) this.birthTimes.delete(path);
      }
      this.animationUntil = now + 420;
    } else {
      this.birthTimes.clear();
      this.animationUntil = 0;
    }
    this.minLogSize = Number.POSITIVE_INFINITY;
    this.maxLogSize = Number.NEGATIVE_INFINITY;
    for (const node of scene.nodes) {
      if (node.size <= 0) continue;
      const value = Math.log10(node.size + 1);
      this.minLogSize = Math.min(this.minLogSize, value);
      this.maxLogSize = Math.max(this.maxLogSize, value);
    }
    if (!Number.isFinite(this.minLogSize)) this.minLogSize = 0;
    if (!Number.isFinite(this.maxLogSize)) this.maxLogSize = 1;
    if (update.fit ?? true) this.fit();
    else this.scheduleDraw();
  }

  clearScene(): void {
    this.scene = null;
    this.nodesByPath.clear();
    this.birthTimes.clear();
    this.hover = null;
    this.tooltip.hidden = true;
    this.scheduleDraw();
  }

  setOptions(options: RenderOptions): void {
    this.options = options;
    this.scheduleDraw();
  }

  private bindEvents(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.panning = true;
      this.moved = 0;
      this.last = { x: event.clientX, y: event.clientY };
      this.canvas.classList.add("panning");
    });
    this.canvas.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, inside: true };
      if (this.panning) {
        const dx = event.clientX - this.last.x;
        const dy = event.clientY - this.last.y;
        this.moved += Math.abs(dx) + Math.abs(dy);
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
        this.last = { x: event.clientX, y: event.clientY };
      }
      this.updateHover();
      this.scheduleDraw();
    });
    this.canvas.addEventListener("pointerup", () => {
      this.panning = false;
      this.canvas.classList.remove("panning");
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.pointer.inside = false;
      this.hover = null;
      this.tooltip.hidden = true;
      this.scheduleDraw();
    });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const before = this.screenToWorld(sx, sy);
      this.camera.zoom = Math.max(0.04, Math.min(18, this.camera.zoom * Math.exp(-event.deltaY * 0.0015)));
      const after = this.screenToWorld(sx, sy);
      this.camera.x += before.x - after.x;
      this.camera.y += before.y - after.y;
      this.updateHover();
      this.scheduleDraw();
    }, { passive: false });
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scheduleDraw();
  }

  private fit(): void {
    if (!this.scene) return;
    const { bounds } = this.scene;
    const rect = this.canvas.getBoundingClientRect();
    const padding = this.scene.kind === "radial" ? 60 : 28;
    this.camera.x = bounds.x + bounds.width / 2;
    this.camera.y = bounds.y + bounds.height / 2;
    this.camera.zoom = Math.max(0.04, Math.min((rect.width - padding * 2) / Math.max(1, bounds.width), (rect.height - padding * 2) / Math.max(1, bounds.height)));
    this.scheduleDraw();
  }

  private scheduleDraw(): void {
    if (this.framePending) return;
    this.framePending = true;
    requestAnimationFrame(() => {
      this.framePending = false;
      this.draw();
    });
  }

  private draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.context.clearRect(0, 0, rect.width, rect.height);
    if (!this.scene) return;
    if (this.scene.kind === "radial") this.drawRadial();
    else this.drawTreemap();
    if (performance.now() < this.animationUntil) this.scheduleDraw();
  }

  private drawRadial(): void {
    if (!this.scene) return;
    this.context.lineCap = "round";
    this.context.lineJoin = "round";
    for (const edge of this.scene.edges) {
      const dimmed = this.isDimmed(edge.child_path) && !this.options.context.has(edge.child_path);
      const emergence = this.emergence(edge.child_path);
      this.context.strokeStyle = this.colorFor(this.nodesByPath.get(edge.child_path), (dimmed ? 0.07 : 0.62) * emergence);
      this.context.lineWidth = Math.max(0.55, Math.min(1.6, this.camera.zoom * 1.2));
      this.context.beginPath();
      edge.points.forEach((point, index) => {
        const projected = this.project(point);
        if (index === 0) this.context.moveTo(projected.x, projected.y);
        else this.context.lineTo(projected.x, projected.y);
      });
      this.context.stroke();
    }

    for (const node of this.scene.nodes) {
      const point = this.project(node);
      if (!this.onScreen(point, 40)) continue;
      const radius = Math.max(1.25, Math.min(18, node.radius * Math.sqrt(Math.max(0.4, this.camera.zoom))));
      this.context.globalAlpha = (this.isDimmed(node.path) ? 0.11 : 1) * this.emergence(node.path);
      this.context.fillStyle = this.colorFor(node, 1);
      this.context.beginPath();
      this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      this.context.fill();
      if (node === this.hover) {
        this.context.strokeStyle = "rgba(255,255,255,.9)";
        this.context.lineWidth = 1;
        this.context.beginPath();
        this.context.arc(point.x, point.y, radius + 4, 0, Math.PI * 2);
        this.context.stroke();
      }
      this.context.globalAlpha = 1;

      if (node === this.hover || this.options.matches.has(node.path) || (node.kind === "directory" && this.camera.zoom > 0.9)) {
        this.context.font = `${node.kind === "directory" ? 600 : 400} 11px ui-monospace, Menlo, monospace`;
        this.context.fillStyle = this.isDimmed(node.path) ? "rgba(200,210,222,.18)" : "rgba(220,228,238,.92)";
        this.context.fillText(node.name, point.x + radius + 5, point.y + 3);
      }
    }
  }

  private drawTreemap(): void {
    if (!this.scene) return;
    for (const node of this.scene.nodes) {
      if (!node.rect) continue;
      const topLeft = this.project({ x: node.rect.x, y: node.rect.y });
      const width = node.rect.width * this.camera.zoom;
      const height = node.rect.height * this.camera.zoom;
      if (width < 0.5 || height < 0.5 || !this.rectOnScreen(topLeft, width, height)) continue;
      this.context.globalAlpha = (this.isDimmed(node.path) ? 0.1 : 0.9) * this.emergence(node.path);
      this.context.fillStyle = this.colorFor(node, 0.82);
      this.context.fillRect(topLeft.x, topLeft.y, width, height);
      this.context.strokeStyle = node === this.hover ? "rgba(255,255,255,.95)" : "rgba(7,10,14,.78)";
      this.context.lineWidth = node === this.hover ? 2 : 1;
      this.context.strokeRect(topLeft.x, topLeft.y, width, height);
      this.context.globalAlpha = 1;
      if (width > 55 && height > 20) {
        this.context.save();
        this.context.beginPath();
        this.context.rect(topLeft.x + 2, topLeft.y + 2, width - 4, height - 4);
        this.context.clip();
        this.context.fillStyle = "rgba(245,247,250,.9)";
        this.context.font = `${node.kind === "directory" ? 600 : 400} ${Math.min(13, Math.max(9, height / 5))}px ui-monospace, Menlo, monospace`;
        this.context.fillText(node.name, topLeft.x + 5, topLeft.y + 14);
        this.context.restore();
      }
    }
  }

  private updateHover(): void {
    if (!this.scene || !this.pointer.inside || this.panning) return;
    let next: VisualNode | null = null;
    if (this.scene.kind === "radial") {
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const node of this.scene.nodes) {
        const point = this.project(node);
        const distance = Math.hypot(point.x - this.pointer.x, point.y - this.pointer.y);
        if (distance < Math.max(8, node.radius * this.camera.zoom + 5) && distance < bestDistance) {
          next = node;
          bestDistance = distance;
        }
      }
    } else {
      const world = this.screenToWorld(this.pointer.x, this.pointer.y);
      for (let index = this.scene.nodes.length - 1; index >= 0; index -= 1) {
        const node = this.scene.nodes[index];
        const rect = node.rect;
        if (rect && world.x >= rect.x && world.x <= rect.x + rect.width && world.y >= rect.y && world.y <= rect.y + rect.height) {
          next = node;
          break;
        }
      }
    }
    if (next !== this.hover) {
      this.hover = next;
      this.updateTooltip();
    } else if (next) {
      this.positionTooltip();
    }
  }

  private updateTooltip(): void {
    if (!this.hover) {
      this.tooltip.hidden = true;
      return;
    }
    const kind = this.hover.kind === "directory" ? `${this.hover.child_count.toLocaleString()} children` : this.hover.kind;
    this.tooltip.replaceChildren();
    const name = document.createElement("strong");
    name.textContent = this.hover.name;
    const path = document.createElement("span");
    path.textContent = this.hover.path;
    const metadata = document.createElement("em");
    metadata.textContent = `${formatBytes(this.hover.size)} · ${kind}`;
    this.tooltip.append(name, path, metadata);
    this.tooltip.hidden = false;
    this.positionTooltip();
  }

  private positionTooltip(): void {
    const margin = 12;
    const left = Math.min(window.innerWidth - this.tooltip.offsetWidth - margin, this.pointer.x + 18);
    const top = Math.min(window.innerHeight - this.tooltip.offsetHeight - margin, this.pointer.y + 18);
    this.tooltip.style.left = `${Math.max(margin, left)}px`;
    this.tooltip.style.top = `${Math.max(margin, top)}px`;
  }

  private project(point: Point): Point {
    const rect = this.canvas.getBoundingClientRect();
    let x = rect.width / 2 + (point.x - this.camera.x) * this.camera.zoom;
    let y = rect.height / 2 + (point.y - this.camera.y) * this.camera.zoom;
    if (this.scene?.kind === "radial" && this.pointer.inside && !this.panning) {
      const dx = x - this.pointer.x;
      const dy = y - this.pointer.y;
      const distance = Math.hypot(dx, dy);
      const lensRadius = FISHEYE_RADIUS;
      if (distance > 0.001 && distance < lensRadius) {
        const normalized = distance / lensRadius;
        const distorted = lensRadius * ((3.6 * normalized) / (2.6 * normalized + 1));
        const factor = distorted / distance;
        x = this.pointer.x + dx * factor;
        y = this.pointer.y + dy * factor;
      }
    }
    return { x, y };
  }

  private screenToWorld(x: number, y: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (x - rect.width / 2) / this.camera.zoom + this.camera.x,
      y: (y - rect.height / 2) / this.camera.zoom + this.camera.y,
    };
  }

  private colorFor(node: VisualNode | undefined, alpha: number): string {
    if (!node) return `rgba(100,115,135,${alpha})`;
    if (this.options.colorMode === "type") return withAlpha(TYPE_COLORS[node.kind] ?? "#6b7688", alpha);
    const value = Math.log10(node.size + 1);
    const normalized = Math.max(0, Math.min(1, (value - this.minLogSize) / Math.max(0.0001, this.maxLogSize - this.minLogSize)));
    return `hsla(${(1 - normalized) * 230}, 70%, 54%, ${alpha})`;
  }

  private isDimmed(path: string): boolean {
    return this.options.queryActive && !this.options.matches.has(path) && !this.options.context.has(path);
  }

  private emergence(path: string): number {
    const born = this.birthTimes.get(path);
    if (born === undefined) return 1;
    return Math.max(0.08, Math.min(1, (performance.now() - born) / 380));
  }

  private onScreen(point: Point, margin: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    return point.x >= -margin && point.y >= -margin && point.x <= rect.width + margin && point.y <= rect.height + margin;
  }

  private rectOnScreen(point: Point, width: number, height: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    return point.x + width >= 0 && point.y + height >= 0 && point.x <= rect.width && point.y <= rect.height;
  }
}

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}
