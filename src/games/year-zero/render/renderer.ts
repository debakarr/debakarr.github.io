import { CORNERS, EDGE_CORNERS, SQRT3 } from '../core/hex';
import { Noise2D } from '../core/noise';
import { Rng } from '../core/rng';
import { F, Imp, RESOURCES, Relief, T, TERRAIN_COLOR } from '../data/terrain';
import { UNIT, type UnitClass } from '../data/units';
import type { Game } from '../sim/game';
import { resourceVisible } from '../sim/tiles';

// Canvas renderer. It never runs continuously: frames are requested when the
// camera, the selection or the world changes, or while a short effect plays.

export const HEX = 32;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface Effect {
  kind: 'text' | 'ring' | 'flash';
  tile: number;
  text?: string;
  color: string;
  start: number;
  dur: number;
}

interface MoveAnim {
  from: number;
  to: number;
  start: number;
}

export interface Overlay {
  selectedTile: number;
  selectedUnit: number;
  hoverTile: number;
  reach: Map<number, number> | null;
  attack: Set<number> | null;
  path: number[] | null;
  pathTurns: number[] | null;
  pathAttack: boolean;
}

const PARCHMENT = '#cbb88f';
const FOG = 'rgba(203, 184, 143, 0.42)';

export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private g: Game;
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  private dpr = 1;
  private w = 0;
  private h = 0;
  /** Per-tile index into `palette`; colors are quantized so tiles batch into few fills. */
  private fillIdx: Uint16Array = new Uint16Array(0);
  private palette: string[] = [];
  private staticCanvas: HTMLCanvasElement;
  private staticKey = '';
  private staticVersion = 0;
  /** The static layer is rendered with a margin so small pans only blit it. */
  private margin = 0;
  private anchor = { x: 0, y: 0, zoom: 1 };
  private frame = 0;
  private effects: Effect[] = [];
  private anims = new Map<number, MoveAnim>();
  overlay: Overlay = {
    selectedTile: -1, selectedUnit: -1, hoverTile: -1, reach: null, attack: null, path: null, pathTurns: null, pathAttack: false,
  };
  animations = true;
  onCamera?: () => void;

  constructor(canvas: HTMLCanvasElement, g: Game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.staticCanvas = document.createElement('canvas');
    this.g = g;
    this.setGame(g);
  }

  setGame(g: Game): void {
    this.g = g;
    this.anims.clear();
    this.effects = [];
    this.buildFills();
    this.invalidate();
  }

  /** Pre-compute per-tile colors with gentle variation so the map feels hand-tinted. */
  private buildFills(): void {
    const map = this.g.s.map;
    const n = map.w * map.h;
    const noise = new Noise2D(new Rng(map.w * 7919 + map.h));
    this.fillIdx = new Uint16Array(n);
    this.palette = [];
    const lookup = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const t = map.terrain[i];
      const [r, g, b] = TERRAIN_COLOR[t];
      const col = i % map.w;
      const row = (i / map.w) | 0;
      const v = noise.fbm(col * 0.18, row * 0.18, 3) * 0.08;
      let k = 1 + v;
      if (t <= T.Lake) {
        const depth = map.elevation[i] / 127;
        k *= t === T.Ocean ? 0.82 + depth * 0.28 : 0.95 + depth * 0.1;
      } else {
        k *= 0.92 + (map.elevation[i] - 128) / 900;
        if (map.feature[i] === F.Forest) k *= 0.86;
        if (map.feature[i] === F.Jungle) k *= 0.78;
      }
      let rr = r * k;
      let gg = g * k;
      let bb = b * k;
      if (map.feature[i] === F.Floodplain || map.feature[i] === F.Ash) {
        rr = rr * 0.85 + 30;
        gg = gg * 0.85 + 34;
        bb = bb * 0.85 + 6;
      }
      if (map.feature[i] === F.Marsh) {
        gg += 6;
        bb += 10;
      }
      if (map.feature[i] === F.Ice) {
        rr = 222;
        gg = 232;
        bb = 238;
      }
      // Quantize to steps of 6 so neighbouring tiles share colors (and draw calls).
      const q = (v: number) => Math.max(0, Math.min(255, Math.round(v / 6) * 6));
      const css = `rgb(${q(rr)},${q(gg)},${q(bb)})`;
      let idx = lookup.get(css);
      if (idx === undefined) {
        idx = this.palette.length;
        this.palette.push(css);
        lookup.set(css, idx);
      }
      this.fillIdx[i] = idx;
    }
  }

  invalidate(): void {
    this.staticVersion++;
    this.request();
  }

  request(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.margin = Math.round(Math.min(240, Math.max(this.w, this.h) * 0.25));
    this.staticCanvas.width = Math.round((this.w + 2 * this.margin) * this.dpr);
    this.staticCanvas.height = Math.round((this.h + 2 * this.margin) * this.dpr);
    this.clampCamera();
    this.invalidate();
  }

  get viewW(): number {
    return this.w;
  }

  get viewH(): number {
    return this.h;
  }

  // --- Camera -------------------------------------------------------------------

  worldSize(): [number, number] {
    return [this.g.grid.pixelWidth(HEX), this.g.grid.pixelHeight(HEX)];
  }

  clampCamera(): void {
    const [ww, wh] = this.worldSize();
    const minZoom = Math.max(0.22, Math.min(this.w / ww, this.h / wh) * 0.9);
    this.cam.zoom = Math.max(minZoom, Math.min(2.6, this.cam.zoom));
    const halfW = this.w / 2 / this.cam.zoom;
    const halfH = this.h / 2 / this.cam.zoom;
    this.cam.x = Math.max(Math.min(halfW, ww / 2), Math.min(ww - Math.min(halfW, ww / 2), this.cam.x));
    this.cam.y = Math.max(Math.min(halfH * 0.6, wh / 2), Math.min(wh - Math.min(halfH * 0.6, wh / 2), this.cam.y));
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.w / 2) / this.cam.zoom + this.cam.x, (sy - this.h / 2) / this.cam.zoom + this.cam.y];
  }

  worldToScreen(x: number, y: number): [number, number] {
    return [(x - this.cam.x) * this.cam.zoom + this.w / 2, (y - this.cam.y) * this.cam.zoom + this.h / 2];
  }

  tileAt(sx: number, sy: number): number {
    const [x, y] = this.screenToWorld(sx, sy);
    return this.g.grid.pick(x, y, HEX);
  }

  tileScreen(tile: number): [number, number] {
    const [x, y] = this.g.grid.center(tile, HEX);
    return this.worldToScreen(x, y);
  }

  pan(dx: number, dy: number): void {
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.clampCamera();
    this.request();
    this.onCamera?.();
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.cam.zoom *= factor;
    this.clampCamera();
    const [nx, ny] = this.screenToWorld(sx, sy);
    this.cam.x += wx - nx;
    this.cam.y += wy - ny;
    this.clampCamera();
    this.request();
    this.onCamera?.();
  }

  /** Center the camera on a tile; `lift` raises it that many screen pixels above center. */
  centerOn(tile: number, smooth = true, lift = 0): void {
    if (tile < 0) return;
    const [x, y0] = this.g.grid.center(tile, HEX);
    const y = y0 + lift / this.cam.zoom;
    if (!smooth || !this.animations) {
      this.cam.x = x;
      this.cam.y = y;
      this.clampCamera();
      this.request();
      this.onCamera?.();
      return;
    }
    const sx = this.cam.x;
    const sy = this.cam.y;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 320);
      const e = 1 - Math.pow(1 - t, 3);
      this.cam.x = sx + (x - sx) * e;
      this.cam.y = sy + (y - sy) * e;
      this.clampCamera();
      this.draw();
      this.onCamera?.();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  isOnScreen(tile: number, margin = 60): boolean {
    const [sx, sy] = this.tileScreen(tile);
    return sx > margin && sy > margin && sx < this.w - margin && sy < this.h - margin;
  }

  // --- Effects -------------------------------------------------------------------

  addEffect(kind: Effect['kind'], tile: number, color: string, text?: string, dur = 1100): void {
    if (!this.animations && kind !== 'text') return;
    this.effects.push({ kind, tile, color, text, start: performance.now(), dur });
    this.request();
  }

  animateMove(unitId: number, from: number, to: number): void {
    if (!this.animations) return;
    this.anims.set(unitId, { from, to, start: performance.now() });
    this.request();
  }

  // --- Drawing -------------------------------------------------------------------

  private visibleRange(pad = 0): { r0: number; r1: number; c0: number; c1: number } {
    const [x0, y0] = this.screenToWorld(-pad, -pad);
    const [x1, y1] = this.screenToWorld(this.w + pad, this.h + pad);
    const map = this.g.s.map;
    const r0 = Math.max(0, Math.floor((y0 - HEX) / (1.5 * HEX)) - 1);
    const r1 = Math.min(map.h - 1, Math.ceil(y1 / (1.5 * HEX)) + 1);
    const c0 = Math.max(0, Math.floor(x0 / (SQRT3 * HEX)) - 1);
    const c1 = Math.min(map.w - 1, Math.ceil(x1 / (SQRT3 * HEX)) + 1);
    return { r0, r1, c0, c1 };
  }

  private hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
    ctx.moveTo(cx + CORNERS[0][0] * s, cy + CORNERS[0][1] * s);
    for (let k = 1; k < 6; k++) ctx.lineTo(cx + CORNERS[k][0] * s, cy + CORNERS[k][1] * s);
    ctx.closePath();
  }

  draw(): void {
    const ctx = this.ctx;
    const key = `${this.cam.zoom.toFixed(4)}|${this.w}|${this.h}|${this.staticVersion}`;
    const a = this.anchor;
    const offX = (a.x - this.cam.x) * this.cam.zoom;
    const offY = (a.y - this.cam.y) * this.cam.zoom;
    if (key !== this.staticKey || Math.abs(offX) > this.margin || Math.abs(offY) > this.margin) {
      this.anchor = { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom };
      this.drawStatic();
      this.staticKey = key;
    }
    const dx = ((this.anchor.x - this.cam.x) * this.cam.zoom - this.margin) * this.dpr;
    const dy = ((this.anchor.y - this.cam.y) * this.cam.zoom - this.margin) * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PARCHMENT;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.staticCanvas, Math.round(dx), Math.round(dy));
    this.drawVignette(ctx);
    ctx.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * (this.w / 2 - this.cam.x * this.cam.zoom), this.dpr * (this.h / 2 - this.cam.y * this.cam.zoom));
    this.drawDynamic(ctx);
    const now = performance.now();
    if (this.effects.length || this.anims.size) {
      this.effects = this.effects.filter((e) => now - e.start < e.dur);
      for (const [id, a] of this.anims) if (now - a.start > 160) this.anims.delete(id);
      this.request();
    }
  }

  private drawStatic(): void {
    const ctx = this.staticCanvas.getContext('2d', { alpha: false })!;
    const g = this.g;
    const map = g.s.map;
    const player = g.player;
    const explored = player.explored;
    const visible = player.visible;
    const z = this.cam.zoom;
    const px = HEX * z;
    const m = this.margin;
    const { r0, r1, c0, c1 } = this.visibleRange(m);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PARCHMENT;
    ctx.fillRect(0, 0, this.staticCanvas.width, this.staticCanvas.height);
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (m + this.w / 2 - this.cam.x * z), this.dpr * (m + this.h / 2 - this.cam.y * z));
    const grid = g.grid;
    const tiles: number[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tiles.push(r * map.w + c);

    // Unexplored parchment grid.
    if (px > 9) {
      ctx.beginPath();
      for (const i of tiles) {
        if (explored[i]) continue;
        const [cx, cy] = grid.center(i, HEX);
        this.hexPath(ctx, cx, cy, HEX * 0.98);
      }
      ctx.strokeStyle = 'rgba(110, 85, 50, 0.13)';
      ctx.lineWidth = 1 / z;
      ctx.stroke();
    }

    // Terrain fills (slightly oversized to hide seams), batched by color.
    const batches = new Map<number, Path2D>();
    for (const i of tiles) {
      if (!explored[i]) continue;
      const [cx, cy] = grid.center(i, HEX);
      const k = this.fillIdx[i];
      let p = batches.get(k);
      if (!p) batches.set(k, (p = new Path2D()));
      const s = HEX + 0.6;
      p.moveTo(cx + CORNERS[0][0] * s, cy + CORNERS[0][1] * s);
      for (let c = 1; c < 6; c++) p.lineTo(cx + CORNERS[c][0] * s, cy + CORNERS[c][1] * s);
      p.closePath();
    }
    for (const [k, p] of batches) {
      ctx.fillStyle = this.palette[k];
      ctx.fill(p);
    }

    // Coastline: soft light edge where land meets water.
    if (px > 7) {
      ctx.beginPath();
      for (const i of tiles) {
        if (!explored[i] || map.terrain[i] <= T.Lake) continue;
        const [cx, cy] = grid.center(i, HEX);
        for (let d = 0; d < 6; d++) {
          const nb = grid.neighbor(i, d);
          if (nb < 0 || map.terrain[nb] > T.Lake) continue;
          const [a, b] = EDGE_CORNERS[d];
          ctx.moveTo(cx + CORNERS[a][0] * HEX, cy + CORNERS[a][1] * HEX);
          ctx.lineTo(cx + CORNERS[b][0] * HEX, cy + CORNERS[b][1] * HEX);
        }
      }
      ctx.strokeStyle = 'rgba(236, 226, 196, 0.55)';
      ctx.lineWidth = 2.2 / Math.sqrt(z);
      ctx.stroke();
    }

    if (px > 13) this.drawFeatures(ctx, tiles, explored);
    this.drawRivers(ctx, tiles, explored, z);
    this.drawRoads(ctx, tiles, explored, z);
    if (px > 24) this.drawImprovements(ctx, tiles, explored);
    if (px > 19) this.drawResources(ctx, tiles, explored);
    this.drawTerritory(ctx, tiles, explored, z);
    this.drawRuinsAndWonders(ctx, tiles, explored, px);

    // Fog: explored but not currently seen.
    ctx.beginPath();
    for (const i of tiles) {
      if (!explored[i] || visible[i]) continue;
      const [cx, cy] = grid.center(i, HEX);
      this.hexPath(ctx, cx, cy, HEX + 0.6);
    }
    ctx.fillStyle = FOG;
    ctx.fill();
  }

  /** Soft vignette, like the worn edge of an old map. */
  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    grad.addColorStop(0, 'rgba(40, 28, 10, 0)');
    grad.addColorStop(1, 'rgba(40, 28, 10, 0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  private drawFeatures(ctx: CanvasRenderingContext2D, tiles: number[], explored: Uint8Array): void {
    const g = this.g;
    const map = g.s.map;
    const grid = g.grid;
    const H = HEX;
    const trees = new Path2D();
    const jungle = new Path2D();
    const hills = new Path2D();
    const marsh = new Path2D();
    const dunes = new Path2D();
    for (const i of tiles) {
      if (!explored[i]) continue;
      const [cx, cy] = grid.center(i, H);
      const f = map.feature[i];
      const relief = map.relief[i];
      const jitter = ((i * 2654435761) >>> 0) / 4294967296;
      if (relief === Relief.Mountain) {
        this.drawMountain(ctx, cx, cy, f === F.Volcano, map.terrain[i] === T.Snow || map.terrain[i] === T.Tundra);
        continue;
      }
      if (relief === Relief.Hills) {
        hills.moveTo(cx - H * 0.55, cy + H * 0.18);
        hills.quadraticCurveTo(cx - H * 0.28, cy - H * 0.32, cx, cy + H * 0.18);
        hills.moveTo(cx - H * 0.05, cy + H * 0.05);
        hills.quadraticCurveTo(cx + H * 0.25, cy - H * 0.42, cx + H * 0.55, cy + H * 0.05);
      }
      if (f === F.Forest || f === F.Jungle) {
        const path = f === F.Forest ? trees : jungle;
        const spots: [number, number][] = [[-0.38, -0.12], [0.02, -0.35], [0.36, -0.08], [-0.15, 0.3], [0.25, 0.32]];
        for (let k = 0; k < spots.length; k++) {
          if (relief === Relief.Hills && k < 2) continue;
          const tx = cx + (spots[k][0] + (jitter - 0.5) * 0.1) * H;
          const ty = cy + spots[k][1] * H;
          if (f === F.Forest) {
            path.moveTo(tx, ty - H * 0.2);
            path.lineTo(tx + H * 0.13, ty + H * 0.08);
            path.lineTo(tx - H * 0.13, ty + H * 0.08);
            path.closePath();
          } else {
            path.moveTo(tx + H * 0.14, ty);
            path.arc(tx, ty, H * 0.14, 0, Math.PI * 2);
          }
        }
      } else if (f === F.Marsh) {
        for (let k = -1; k <= 1; k++) {
          marsh.moveTo(cx - H * 0.35, cy + k * H * 0.25);
          marsh.lineTo(cx + H * 0.1, cy + k * H * 0.25);
          marsh.moveTo(cx + H * 0.2, cy + k * H * 0.25 + H * 0.08);
          marsh.lineTo(cx + H * 0.4, cy + k * H * 0.25 + H * 0.08);
        }
      } else if (map.terrain[i] === T.Desert && f === F.None && relief === Relief.Flat) {
        dunes.moveTo(cx - H * 0.4, cy + H * 0.1);
        dunes.quadraticCurveTo(cx - H * 0.15, cy - H * 0.15, cx + H * 0.1, cy + H * 0.1);
        dunes.moveTo(cx + H * 0.0, cy - H * 0.25);
        dunes.quadraticCurveTo(cx + H * 0.2, cy - H * 0.45, cx + H * 0.42, cy - H * 0.25);
      } else if (f === F.Oasis) {
        ctx.fillStyle = '#4f9fb8';
        ctx.beginPath();
        ctx.ellipse(cx, cy + H * 0.1, H * 0.22, H * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4c7a3a';
        ctx.beginPath();
        ctx.arc(cx + H * 0.22, cy - H * 0.12, H * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(70, 48, 26, 0.5)';
    ctx.lineWidth = H * 0.07;
    ctx.stroke(hills);
    ctx.fillStyle = 'rgba(38, 66, 34, 0.85)';
    ctx.fill(trees);
    ctx.fillStyle = 'rgba(28, 74, 44, 0.8)';
    ctx.fill(jungle);
    ctx.strokeStyle = 'rgba(40, 90, 96, 0.6)';
    ctx.lineWidth = H * 0.05;
    ctx.stroke(marsh);
    ctx.strokeStyle = 'rgba(150, 110, 60, 0.45)';
    ctx.lineWidth = H * 0.05;
    ctx.stroke(dunes);
  }

  private drawMountain(ctx: CanvasRenderingContext2D, cx: number, cy: number, volcano: boolean, cold: boolean): void {
    const H = HEX;
    ctx.beginPath();
    ctx.moveTo(cx - H * 0.62, cy + H * 0.38);
    ctx.lineTo(cx - H * 0.12, cy - H * 0.5);
    ctx.lineTo(cx + H * 0.12, cy - H * 0.12);
    ctx.lineTo(cx + H * 0.28, cy - H * 0.36);
    ctx.lineTo(cx + H * 0.66, cy + H * 0.38);
    ctx.closePath();
    ctx.fillStyle = volcano ? '#5b4a44' : '#7d7466';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - H * 0.12, cy - H * 0.5);
    ctx.lineTo(cx + H * 0.12, cy - H * 0.12);
    ctx.lineTo(cx + H * 0.02, cy + H * 0.38);
    ctx.lineTo(cx - H * 0.12, cy + H * 0.38);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    if (volcano) {
      ctx.fillStyle = '#e0602e';
      ctx.beginPath();
      ctx.arc(cx - H * 0.12, cy - H * 0.46, H * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(80,70,70,0.35)';
      ctx.beginPath();
      ctx.arc(cx - H * 0.05, cy - H * 0.7, H * 0.14, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - H * 0.12, cy - H * 0.5);
      ctx.lineTo(cx - (cold ? H * 0.34 : H * 0.24), cy - (cold ? H * 0.1 : H * 0.25));
      ctx.lineTo(cx - H * 0.02, cy - H * 0.22);
      ctx.closePath();
      ctx.fillStyle = 'rgba(244, 244, 238, 0.9)';
      ctx.fill();
    }
  }

  private drawRivers(ctx: CanvasRenderingContext2D, tiles: number[], explored: Uint8Array, z: number): void {
    const map = this.g.s.map;
    const grid = this.g.grid;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const byWidth = new Map<number, Path2D>();
    for (const i of tiles) {
      if (!explored[i] || map.river[i] === 0) continue;
      const to = map.riverTo[i];
      if (to < 0) continue;
      const [ax, ay] = grid.center(i, HEX);
      let [bx, by] = grid.center(to, HEX);
      if (map.terrain[to] <= T.Lake) {
        bx = (ax + bx) / 2;
        by = (ay + by) / 2;
      }
      const w = Math.min(4, 1 + Math.log2(map.river[i] + 1) * 0.7);
      const key = Math.round(w * 2) / 2;
      let p = byWidth.get(key);
      if (!p) byWidth.set(key, (p = new Path2D()));
      const mx = (ax + bx) / 2 + ((i % 7) - 3) * 0.9;
      const my = (ay + by) / 2 + ((i % 5) - 2) * 0.9;
      p.moveTo(ax, ay);
      p.quadraticCurveTo(mx, my, bx, by);
    }
    for (const [w, p] of byWidth) {
      ctx.strokeStyle = 'rgba(232, 222, 190, 0.6)';
      ctx.lineWidth = (w + 1.6) * Math.max(1, 1 / z) * 0.9;
      ctx.stroke(p);
      ctx.strokeStyle = '#3f86ad';
      ctx.lineWidth = w * Math.max(1, 1 / z) * 0.9;
      ctx.stroke(p);
    }
  }

  private drawRoads(ctx: CanvasRenderingContext2D, tiles: number[], explored: Uint8Array, z: number): void {
    const map = this.g.s.map;
    const grid = this.g.grid;
    const road = new Path2D();
    const rail = new Path2D();
    for (const i of tiles) {
      if (!explored[i] || !map.road[i]) continue;
      const [ax, ay] = grid.center(i, HEX);
      for (let d = 0; d < 3; d++) {
        const nb = grid.neighbor(i, d === 0 ? 0 : d === 1 ? 5 : 4);
        if (nb < 0 || !map.road[nb]) continue;
        const [bx, by] = grid.center(nb, HEX);
        const p = map.road[i] >= 2 && map.road[nb] >= 2 ? rail : road;
        p.moveTo(ax, ay);
        p.lineTo(bx, by);
      }
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(112, 82, 48, 0.75)';
    ctx.lineWidth = Math.max(1.6, 2.2 / z);
    ctx.setLineDash([HEX * 0.22, HEX * 0.14]);
    ctx.stroke(road);
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(52, 44, 40, 0.85)';
    ctx.lineWidth = Math.max(2, 2.6 / z);
    ctx.stroke(rail);
  }

  private drawImprovements(ctx: CanvasRenderingContext2D, tiles: number[], explored: Uint8Array): void {
    const map = this.g.s.map;
    const grid = this.g.grid;
    const H = HEX;
    const farms = new Path2D();
    const marks = new Path2D();
    for (const i of tiles) {
      if (!explored[i]) continue;
      const imp = map.improvement[i];
      if (!imp || map.cityAt[i] >= 0) continue;
      const [cx, cy] = grid.center(i, H);
      switch (imp) {
        case Imp.Farm:
          for (let k = -2; k <= 2; k++) {
            farms.moveTo(cx - H * 0.42, cy + k * H * 0.12 + H * 0.12);
            farms.lineTo(cx + H * 0.05, cy + k * H * 0.12 - H * 0.1);
          }
          break;
        case Imp.Mine:
          marks.moveTo(cx + H * 0.22, cy + H * 0.36);
          marks.lineTo(cx + H * 0.42, cy + H * 0.12);
          marks.moveTo(cx + H * 0.3, cy + H * 0.12);
          marks.lineTo(cx + H * 0.48, cy + H * 0.26);
          break;
        case Imp.Pasture:
          marks.moveTo(cx - H * 0.45, cy + H * 0.38);
          marks.lineTo(cx + H * 0.1, cy + H * 0.38);
          for (let k = 0; k < 4; k++) {
            marks.moveTo(cx - H * 0.45 + k * H * 0.18, cy + H * 0.3);
            marks.lineTo(cx - H * 0.45 + k * H * 0.18, cy + H * 0.44);
          }
          break;
        case Imp.Plantation:
        case Imp.Lumber:
          marks.moveTo(cx - H * 0.4, cy + H * 0.4);
          marks.lineTo(cx - H * 0.05, cy + H * 0.4);
          marks.moveTo(cx - H * 0.4, cy + H * 0.3);
          marks.lineTo(cx - H * 0.05, cy + H * 0.3);
          break;
        case Imp.Boats:
          marks.moveTo(cx - H * 0.3, cy + H * 0.3);
          marks.quadraticCurveTo(cx - H * 0.1, cy + H * 0.45, cx + H * 0.1, cy + H * 0.3);
          marks.moveTo(cx - H * 0.1, cy + H * 0.3);
          marks.lineTo(cx - H * 0.1, cy + H * 0.05);
          break;
        case Imp.OilWell:
          marks.moveTo(cx + H * 0.2, cy + H * 0.42);
          marks.lineTo(cx + H * 0.32, cy + H * 0.05);
          marks.lineTo(cx + H * 0.44, cy + H * 0.42);
          break;
      }
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(214, 188, 98, 0.75)';
    ctx.lineWidth = H * 0.045;
    ctx.stroke(farms);
    ctx.strokeStyle = 'rgba(48, 36, 24, 0.75)';
    ctx.lineWidth = H * 0.05;
    ctx.stroke(marks);
  }

  private drawResources(ctx: CanvasRenderingContext2D, tiles: number[], explored: Uint8Array): void {
    const map = this.g.s.map;
    const grid = this.g.grid;
    const player = this.g.player;
    for (const i of tiles) {
      if (!explored[i]) continue;
      const r = map.resource[i];
      if (!r || !resourceVisible(player, r) || map.cityAt[i] >= 0) continue;
      const def = RESOURCES[r];
      const [cx, cy] = grid.center(i, HEX);
      const x = cx - HEX * 0.38;
      const y = cy - HEX * 0.36;
      ctx.beginPath();
      if (def.kind === 'luxury') {
        ctx.moveTo(x, y - HEX * 0.17);
        ctx.lineTo(x + HEX * 0.15, y);
        ctx.lineTo(x, y + HEX * 0.17);
        ctx.lineTo(x - HEX * 0.15, y);
        ctx.closePath();
      } else if (def.kind === 'strategic') {
        ctx.rect(x - HEX * 0.13, y - HEX * 0.13, HEX * 0.26, HEX * 0.26);
      } else {
        ctx.arc(x, y, HEX * 0.14, 0, Math.PI * 2);
      }
      ctx.fillStyle = def.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(30, 22, 12, 0.85)';
      ctx.lineWidth = HEX * 0.035;
      ctx.stroke();
    }
  }

  private drawTerritory(ctx: CanvasRenderingContext2D, tiles: number[], explored: Uint8Array, z: number): void {
    const g = this.g;
    const map = g.s.map;
    const grid = g.grid;
    const fills = new Map<number, Path2D>();
    const edges = new Map<number, Path2D>();
    for (const i of tiles) {
      if (!explored[i]) continue;
      const o = map.owner[i];
      if (o < 0) continue;
      const [cx, cy] = grid.center(i, HEX);
      let f = fills.get(o);
      if (!f) fills.set(o, (f = new Path2D()));
      f.moveTo(cx + CORNERS[0][0] * (HEX + 0.5), cy + CORNERS[0][1] * (HEX + 0.5));
      for (let k = 1; k < 6; k++) f.lineTo(cx + CORNERS[k][0] * (HEX + 0.5), cy + CORNERS[k][1] * (HEX + 0.5));
      f.closePath();
      let e = edges.get(o);
      if (!e) edges.set(o, (e = new Path2D()));
      for (let d = 0; d < 6; d++) {
        const nb = grid.neighbor(i, d);
        if (nb >= 0 && map.owner[nb] === o) continue;
        const [a, b] = EDGE_CORNERS[d];
        const inset = HEX * 0.9;
        e.moveTo(cx + CORNERS[a][0] * inset, cy + CORNERS[a][1] * inset);
        e.lineTo(cx + CORNERS[b][0] * inset, cy + CORNERS[b][1] * inset);
      }
    }
    for (const [o, f] of fills) {
      ctx.fillStyle = hexAlpha(g.civ(o).color, 0.16);
      ctx.fill(f);
    }
    ctx.lineCap = 'round';
    for (const [o, e] of edges) {
      ctx.strokeStyle = 'rgba(20, 16, 10, 0.45)';
      ctx.lineWidth = Math.max(3, 4.4 / z);
      ctx.stroke(e);
      ctx.strokeStyle = g.civ(o).color;
      ctx.lineWidth = Math.max(1.8, 2.6 / z);
      ctx.stroke(e);
    }
  }

  private drawRuinsAndWonders(ctx: CanvasRenderingContext2D, tiles: number[], explored: Uint8Array, px: number): void {
    const map = this.g.s.map;
    const grid = this.g.grid;
    if (px < 10) return;
    for (const i of tiles) {
      if (!explored[i]) continue;
      const [cx, cy] = grid.center(i, HEX);
      if (map.ruinAt[i] >= 0 && map.cityAt[i] < 0) {
        ctx.fillStyle = 'rgba(70, 58, 44, 0.9)';
        const x = cx + HEX * 0.05;
        const y = cy - HEX * 0.05;
        ctx.fillRect(x - HEX * 0.3, y + HEX * 0.18, HEX * 0.6, HEX * 0.08);
        ctx.fillRect(x - HEX * 0.24, y - HEX * 0.2, HEX * 0.09, HEX * 0.38);
        ctx.fillRect(x + HEX * 0.14, y - HEX * 0.05, HEX * 0.09, HEX * 0.23);
        ctx.fillRect(x - HEX * 0.05, y - HEX * 0.3, HEX * 0.09, HEX * 0.1);
        ctx.fillRect(x - HEX * 0.05, y - HEX * 0.08, HEX * 0.09, HEX * 0.26);
      }
      if (map.wonder[i] >= 0) {
        ctx.save();
        ctx.translate(cx + HEX * 0.36, cy - HEX * 0.38);
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const r = k % 2 === 0 ? HEX * 0.2 : HEX * 0.09;
          const a = (k * Math.PI) / 5 - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = '#f2cf5b';
        ctx.fill();
        ctx.strokeStyle = 'rgba(60, 40, 10, 0.9)';
        ctx.lineWidth = HEX * 0.03;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // --- Dynamic layer: overlays, cities, units, effects ---------------------------------

  private drawDynamic(ctx: CanvasRenderingContext2D): void {
    const g = this.g;
    const map = g.s.map;
    const grid = g.grid;
    const player = g.player;
    const o = this.overlay;
    const z = this.cam.zoom;
    const { r0, r1, c0, c1 } = this.visibleRange();

    // Reachable area.
    if (o.reach && o.reach.size) {
      ctx.beginPath();
      for (const t of o.reach.keys()) {
        const [cx, cy] = grid.center(t, HEX);
        this.hexPath(ctx, cx, cy, HEX * 0.86);
      }
      ctx.fillStyle = 'rgba(255, 248, 220, 0.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 248, 220, 0.45)';
      ctx.lineWidth = 1.2 / z;
      ctx.stroke();
    }
    if (o.attack && o.attack.size) {
      ctx.beginPath();
      for (const t of o.attack) {
        const [cx, cy] = grid.center(t, HEX);
        this.hexPath(ctx, cx, cy, HEX * 0.86);
      }
      ctx.strokeStyle = 'rgba(232, 80, 64, 0.95)';
      ctx.lineWidth = Math.max(2, 2.5 / z);
      ctx.stroke();
    }

    // Path preview.
    if (o.path && o.path.length && o.selectedUnit >= 0) {
      const u = g.unit(o.selectedUnit);
      if (u) {
        const pts = [u.tile, ...o.path].map((t) => grid.center(t, HEX));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.strokeStyle = o.pathAttack ? 'rgba(232, 80, 64, 0.95)' : 'rgba(255, 250, 230, 0.95)';
        ctx.lineWidth = Math.max(2.5, 3 / z);
        ctx.setLineDash([HEX * 0.25, HEX * 0.18]);
        ctx.stroke();
        ctx.setLineDash([]);
        const turns = o.pathTurns ?? [];
        ctx.font = `600 ${Math.max(11, 12 / z)}px Inter Variable, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let k = 0; k < o.path.length; k++) {
          const isEnd = k === o.path.length - 1 || turns[k + 1] !== turns[k];
          if (!isEnd) continue;
          const [x, y] = pts[k + 1];
          const r = Math.max(8, 9 / z);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(20, 24, 32, 0.85)';
          ctx.fill();
          ctx.fillStyle = '#f4ead2';
          ctx.fillText(String((turns[k] ?? 0) + 1), x, y + 0.5);
        }
      }
    }

    // Cities.
    const cityLabels: { x: number; y: number; name: string; size: number; color: string; capital: boolean; own: boolean; dim: boolean }[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * map.w + c;
        if (!player.explored[i]) continue;
        const city = g.cityAt(i);
        if (!city) continue;
        const civ = g.civ(city.civId);
        const [cx, cy] = grid.center(i, HEX);
        this.drawCity(ctx, cx, cy, city.size, civ.color);
        cityLabels.push({ x: cx, y: cy, name: city.name, size: city.size, color: civ.color, capital: civ.capitalId === city.id, own: civ.id === player.id, dim: !player.visible[i] });
      }
    }

    // Units (own always; others only where we can see).
    const now = performance.now();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * map.w + c;
        const ids = g.unitsAt.get(i);
        if (!ids || !ids.length) continue;
        if (!player.visible[i]) continue;
        const units = ids.map((id) => g.s.units[id]).filter(Boolean);
        if (!units.length) continue;
        const isCity = map.cityAt[i] >= 0;
        // Show the selected unit on top, otherwise the strongest.
        const top = units.find((u) => u.id === o.selectedUnit) ?? units.reduce((a, b) => (UNIT[b.type].str > UNIT[a.type].str ? b : a));
        const anim = this.anims.get(top.id);
        let [cx, cy] = grid.center(i, HEX);
        if (anim && anim.to === i) {
          const t = Math.min(1, (now - anim.start) / 150);
          const [fx, fy] = grid.center(anim.from, HEX);
          cx = fx + (cx - fx) * t;
          cy = fy + (cy - fy) * t;
        }
        if (isCity) {
          cx += HEX * 0.42;
          cy -= HEX * 0.3;
        }
        const civ = g.civ(top.civId);
        const embarked = map.terrain[top.tile] <= T.Lake && UNIT[top.type].cls !== 'naval' && UNIT[top.type].cls !== 'air';
        this.drawUnit(ctx, cx, cy, top.type, civ.color, top.hp, units.length, top.id === o.selectedUnit, top.order?.kind === 'fortify' && top.fortified > 0, embarked, isCity ? 0.78 : 1);
      }
    }

    // City banners last so they sit on top.
    const showNames = z > 0.42;
    for (const l of cityLabels) {
      if (!showNames && !l.capital) continue;
      this.drawBanner(ctx, l.x, l.y + HEX * 0.72, l.name, l.size, l.color, l.capital, l.dim, z);
    }

    // Selection and hover.
    const outline = (t: number, color: string, wid: number) => {
      if (t < 0) return;
      const [cx, cy] = grid.center(t, HEX);
      ctx.beginPath();
      this.hexPath(ctx, cx, cy, HEX * 0.94);
      ctx.strokeStyle = color;
      ctx.lineWidth = wid / z;
      ctx.stroke();
    };
    outline(o.hoverTile, 'rgba(255, 255, 255, 0.55)', 1.6);
    outline(o.selectedTile, '#fff6d8', 2.6);

    // Effects.
    for (const e of this.effects) {
      const t = (now - e.start) / e.dur;
      if (t < 0 || t > 1) continue;
      const [cx, cy] = grid.center(e.tile, HEX);
      if (e.kind === 'text' && e.text) {
        ctx.globalAlpha = 1 - t * t;
        ctx.font = `700 ${Math.max(14, 16 / z)}px Inter Variable, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4 / z;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(e.text, cx, cy - HEX * 0.5 - t * HEX * 0.8);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, cx, cy - HEX * 0.5 - t * HEX * 0.8);
        ctx.globalAlpha = 1;
      } else if (e.kind === 'ring') {
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        this.hexPath(ctx, cx, cy, HEX * (0.6 + t * 1.6));
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3 / z;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'flash') {
        ctx.globalAlpha = 0.5 * (1 - t);
        ctx.beginPath();
        this.hexPath(ctx, cx, cy, HEX);
        ctx.fillStyle = e.color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawCity(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
    const H = HEX;
    ctx.beginPath();
    ctx.ellipse(cx, cy + H * 0.12, H * 0.62, H * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40, 30, 20, 0.35)';
    ctx.fill();
    const houses = size >= 12 ? 5 : size >= 6 ? 4 : size >= 3 ? 3 : 2;
    const spots: [number, number, number][] = [[0, -0.12, 1.15], [-0.32, 0.08, 0.9], [0.32, 0.1, 0.95], [-0.12, 0.26, 0.8], [0.18, -0.34, 0.85]];
    for (let k = 0; k < houses; k++) {
      const [dx, dy, s] = spots[k];
      const x = cx + dx * H;
      const y = cy + dy * H;
      const w = H * 0.22 * s;
      const hgt = H * (size >= 16 && k === 0 ? 0.42 : 0.22) * s;
      ctx.fillStyle = '#efe4c8';
      ctx.fillRect(x - w, y - hgt, w * 2, hgt + H * 0.12);
      ctx.beginPath();
      ctx.moveTo(x - w * 1.2, y - hgt);
      ctx.lineTo(x, y - hgt - w * 0.9);
      ctx.lineTo(x + w * 1.2, y - hgt);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(30, 22, 14, 0.8)';
      ctx.lineWidth = H * 0.03;
      ctx.stroke();
      ctx.strokeRect(x - w, y - hgt, w * 2, hgt + H * 0.12);
    }
  }

  private drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, size: number, color: string, capital: boolean, dim: boolean, z: number): void {
    const scale = Math.min(1.25, Math.max(0.75, 1 / Math.sqrt(z))) / z;
    const fs = 11.5 * scale;
    ctx.font = `600 ${fs}px Inter Variable, system-ui, sans-serif`;
    const label = `${capital ? '★ ' : ''}${name}`;
    const tw = ctx.measureText(label).width;
    const pad = 5 * scale;
    const badge = fs * 1.35;
    const bw = tw + pad * 2 + badge;
    const bh = fs * 1.6;
    const bx = x - bw / 2;
    const by = y - bh / 2;
    ctx.globalAlpha = dim ? 0.75 : 1;
    ctx.beginPath();
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(16, 20, 28, 0.88)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx + bh / 2, y, badge / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#121212';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${fs * 0.9}px Inter Variable, system-ui, sans-serif`;
    ctx.fillText(String(size), bx + bh / 2, y + 0.5 * scale);
    ctx.font = `600 ${fs}px Inter Variable, system-ui, sans-serif`;
    ctx.fillStyle = '#f2ead6';
    ctx.textAlign = 'left';
    ctx.fillText(label, bx + bh / 2 + badge / 2 + pad * 0.6, y + 0.5 * scale);
    ctx.globalAlpha = 1;
  }

  private drawUnit(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, type: string, color: string, hp: number,
    count: number, selected: boolean, fortified: boolean, embarked: boolean, scale: number,
  ): void {
    const H = HEX * scale;
    const r = H * 0.4;
    if (selected) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + H * 0.13, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 246, 216, 0.85)';
      ctx.fill();
    }
    if (embarked) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.2, cy + r * 0.5);
      ctx.quadraticCurveTo(cx, cy + r * 1.5, cx + r * 1.2, cy + r * 0.5);
      ctx.closePath();
      ctx.fillStyle = '#6b4a2a';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = H * 0.06;
    ctx.strokeStyle = 'rgba(16, 14, 10, 0.9)';
    ctx.stroke();
    if (fortified) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + H * 0.05, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.strokeStyle = '#f4ead2';
      ctx.lineWidth = H * 0.06;
      ctx.stroke();
    }
    drawGlyph(ctx, UNIT[type].cls, cx, cy, r * 0.62);
    if (hp < 100) {
      const w = r * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(cx - w / 2, cy + r + H * 0.06, w, H * 0.09);
      ctx.fillStyle = hp > 60 ? '#7bc47f' : hp > 30 ? '#e8c25a' : '#e06a5f';
      ctx.fillRect(cx - w / 2, cy + r + H * 0.06, (w * hp) / 100, H * 0.09);
    }
    if (count > 1) {
      const bx = cx + r * 0.8;
      const by = cy - r * 0.8;
      ctx.beginPath();
      ctx.arc(bx, by, H * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#121620';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = H * 0.03;
      ctx.stroke();
      ctx.fillStyle = '#f4ead2';
      ctx.font = `700 ${H * 0.2}px Inter Variable, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(count), bx, by + 0.5);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Simple line glyphs for unit classes, drawn in the token. */
export function drawGlyph(ctx: CanvasRenderingContext2D, cls: UnitClass, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#141414';
  ctx.fillStyle = '#141414';
  ctx.lineWidth = s * 0.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (cls) {
    case 'civilian':
      // A small house: the settlers' new home.
      ctx.moveTo(-s * 0.85, -s * 0.05);
      ctx.lineTo(0, -s * 0.8);
      ctx.lineTo(s * 0.85, -s * 0.05);
      ctx.moveTo(-s * 0.6, -s * 0.2);
      ctx.lineTo(-s * 0.6, s * 0.7);
      ctx.lineTo(s * 0.6, s * 0.7);
      ctx.lineTo(s * 0.6, -s * 0.2);
      ctx.moveTo(-s * 0.15, s * 0.7);
      ctx.lineTo(-s * 0.15, s * 0.25);
      ctx.lineTo(s * 0.15, s * 0.25);
      ctx.lineTo(s * 0.15, s * 0.7);
      break;
    case 'recon':
      ctx.ellipse(0, 0, s * 0.85, s * 0.48, 0, 0, Math.PI * 2);
      ctx.moveTo(s * 0.22, 0);
      ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
      break;
    case 'infantry':
      ctx.moveTo(0, -s * 0.85);
      ctx.lineTo(0, s * 0.55);
      ctx.moveTo(-s * 0.42, s * 0.3);
      ctx.lineTo(s * 0.42, s * 0.3);
      ctx.moveTo(0, s * 0.55);
      ctx.lineTo(0, s * 0.85);
      break;
    case 'cavalry':
      ctx.arc(0, -s * 0.05, s * 0.6, Math.PI * 0.85, Math.PI * 2.15);
      ctx.moveTo(-s * 0.56, s * 0.15);
      ctx.lineTo(-s * 0.56, s * 0.7);
      ctx.moveTo(s * 0.56, s * 0.15);
      ctx.lineTo(s * 0.56, s * 0.7);
      break;
    case 'ranged':
      ctx.arc(-s * 0.45, 0, s * 0.85, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.moveTo(-s * 0.13, -s * 0.78);
      ctx.lineTo(-s * 0.13, s * 0.78);
      ctx.moveTo(-s * 0.6, 0);
      ctx.lineTo(s * 0.85, 0);
      break;
    case 'siege':
      ctx.moveTo(-s * 0.3, s * 0.4);
      ctx.arc(-s * 0.3, s * 0.4, s * 0.3, 0, Math.PI * 2);
      ctx.moveTo(-s * 0.2, s * 0.15);
      ctx.lineTo(s * 0.85, -s * 0.55);
      break;
    case 'naval':
      ctx.moveTo(-s * 0.85, s * 0.3);
      ctx.quadraticCurveTo(0, s * 0.95, s * 0.85, s * 0.3);
      ctx.closePath();
      ctx.moveTo(0, s * 0.3);
      ctx.lineTo(0, -s * 0.85);
      ctx.lineTo(s * 0.55, -s * 0.05);
      ctx.lineTo(0, -s * 0.05);
      break;
    case 'air':
      ctx.moveTo(0, -s * 0.9);
      ctx.lineTo(s * 0.85, s * 0.5);
      ctx.lineTo(0, s * 0.2);
      ctx.lineTo(-s * 0.85, s * 0.5);
      ctx.closePath();
      break;
  }
  ctx.stroke();
  ctx.restore();
}
