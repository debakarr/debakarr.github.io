import { drawIcon, hasIcon, type IconKey } from '../art';
import { CORNERS, EDGE_CORNERS, SQRT3 } from '../core/hex';
import { Noise2D } from '../../shared/noise';
import { Rng } from '../../shared/rng';
import { F, Imp, RESOURCES, Relief, T, TERRAIN_COLOR } from '../data/terrain';
import { UNIT } from '../data/units';
import type { Game } from '../sim/game';
import { resourceVisible } from '../sim/tiles';
import { sprites } from './sprites';

// Canvas renderer. It never runs continuously: frames are requested when the
// camera, the selection or the world changes, or while a short effect plays.
//
// Terrain, features, cities and improvements use Kenney's Hexagon Pack (CC0);
// unit and resource symbols are game-icons.net silhouettes (CC BY 3.0).

export const HEX = 32;
const TILE_W = SQRT3 * HEX;
const TILE_H = 2 * HEX;
/** Kenney tiles are 120x140 px; this maps sprite pixels to world units. */
const SPRITE_K = TILE_W / 120;

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

const UNCHARTED = '#131a23';

/** Stable pseudo-random value in [0,1) per tile, for picking sprite variants. */
function tileHash(i: number, salt = 0): number {
  let x = (i * 2654435761 + salt * 40503) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

function pick<T>(arr: readonly T[], h: number): T {
  return arr[Math.floor(h * arr.length) % arr.length];
}

/** A small speckle tile, used to give the uncharted map a paper grain. */
let grainTile: HTMLCanvasElement | null = null;
function makeGrain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const cv = document.createElement('canvas');
  cv.width = 96;
  cv.height = 96;
  const g = cv.getContext('2d')!;
  const rng = new Rng(99);
  for (let k = 0; k < 900; k++) {
    const a = rng.float(0.05, 0.16);
    g.fillStyle = rng.chance(0.5) ? `rgba(190,210,230,${a})` : `rgba(0,0,0,${a})`;
    g.fillRect(rng.int(96), rng.int(96), 1, 1);
  }
  grainTile = cv;
  return cv;
}

/** Cloudy chart mottling for the unexplored sea, tiled behind the grain. */
let chartTile: HTMLCanvasElement | null = null;
function makeChart(): HTMLCanvasElement {
  if (chartTile) return chartTile;
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d')!;
  const rng = new Rng(4242);
  const noise = new Noise2D(rng);
  // Soft cloudy variation, so the dark area has depth instead of one tone.
  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const a = Math.max(0, noise.fbm(x * 0.02, y * 0.02, 3)) * 0.2;
      g.fillStyle = `rgba(120,155,190,${a.toFixed(3)})`;
      g.fillRect(x, y, 4, 4);
    }
  }
  // A few faint sounding circles, like an old survey chart.
  for (let k = 0; k < 40; k++) {
    g.strokeStyle = `rgba(150,185,215,${rng.float(0.06, 0.14).toFixed(3)})`;
    g.lineWidth = 1;
    const x = rng.int(size);
    const y = rng.int(size);
    g.beginPath();
    g.arc(x, y, rng.float(6, 26), 0, Math.PI * 2);
    g.stroke();
  }
  chartTile = cv;
  return cv;
}

/** Kenney city tile for a city, by its owner's era, size and status. */
export function cityTileName(tier: number, size: number, capital: boolean): string {
  if (tier >= 8) return capital ? 'scifi_headquarters' : size >= 14 ? 'scifi_skyscraper' : size >= 8 ? 'scifi_domes' : 'scifi_living';
  if (tier >= 7) return capital ? 'modern_skyscraperGlass' : size >= 12 ? 'modern_skyscraper' : 'modern_largeBuilding';
  if (tier >= 5) return capital ? 'modern_largeBuilding' : size >= 10 ? 'modern_oldBuilding' : size >= 5 ? 'modern_villageLarge' : 'modern_houseSmall';
  if (tier >= 2) return capital ? 'medieval_largeCastle' : size >= 9 ? 'medieval_church' : size >= 4 ? 'medieval_house' : 'medieval_cabin';
  return capital ? 'medieval_smallCastle' : size >= 4 ? 'medieval_house' : 'medieval_cabin';
}

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
  /** Paper grain for the uncharted area. */
  private grain: HTMLCanvasElement | null = null;
  private staticKey = '';
  private staticVersion = 0;
  /** The static layer is rendered with a margin so small pans only blit it. */
  private margin = 0;
  /** Pixel ratio of the cached layer; capped so big Retina screens and tablets don't run out of canvas memory. */
  private sdpr = 1;
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
    void sprites.load().then(() => this.invalidate());
  }

  setGame(g: Game): void {
    this.g = g;
    this.anims.clear();
    this.effects = [];
    this.buildFills();
    this.invalidate();
  }

  /** Flat per-tile colors for far zoom levels and before sprites load. */
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
      let k = 1 + noise.fbm(col * 0.18, row * 0.18, 3) * 0.06;
      if (t <= T.Lake) {
        const depth = map.elevation[i] / 127;
        k *= t === T.Ocean ? 0.86 + depth * 0.22 : 0.97 + depth * 0.06;
      } else {
        if (map.feature[i] === F.Forest) k *= 0.88;
        if (map.feature[i] === F.Jungle) k *= 0.78;
        if (map.relief[i] === Relief.Mountain) k *= 0.8;
      }
      let rr = r * k;
      let gg = g * k;
      let bb = b * k;
      if (map.relief[i] === Relief.Mountain) {
        rr = rr * 0.5 + 75;
        gg = gg * 0.5 + 78;
        bb = bb * 0.5 + 80;
      }
      if (map.feature[i] === F.Ice) {
        rr = 214;
        gg = 234;
        bb = 244;
      }
      if (map.feature[i] === F.Ash || map.feature[i] === F.Volcano) {
        rr = 187;
        gg = 100;
        bb = 68;
      }
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
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.margin = Math.round(Math.min(200, Math.max(this.w, this.h) * 0.2));
    // One pixel ratio for the screen and the cached layer, within a total
    // budget: huge high-density screens render a little below native
    // resolution instead of allocating tens of megapixels for a map.
    const area = (this.w + 2 * this.margin) * (this.h + 2 * this.margin) + this.w * this.h;
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / area)));
    this.sdpr = this.dpr;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.staticCanvas.width = Math.round((this.w + 2 * this.margin) * this.sdpr);
    this.staticCanvas.height = Math.round((this.h + 2 * this.margin) * this.sdpr);
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

  /**
   * Center the camera on a tile. `lift` raises it that many screen pixels above
   * center, `shift` moves it left (to clear panels that cover part of the map).
   */
  centerOn(tile: number, smooth = true, lift = 0, shift = 0): void {
    if (tile < 0) return;
    const [x0, y0] = this.g.grid.center(tile, HEX);
    const x = x0 + shift / this.cam.zoom;
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

  // --- Drawing helpers -------------------------------------------------------------

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

  private hexPath(ctx: CanvasRenderingContext2D | Path2D, cx: number, cy: number, s: number): void {
    ctx.moveTo(cx + CORNERS[0][0] * s, cy + CORNERS[0][1] * s);
    for (let k = 1; k < 6; k++) ctx.lineTo(cx + CORNERS[k][0] * s, cy + CORNERS[k][1] * s);
    ctx.closePath();
  }

  /** Draw a full-hex Kenney tile centered on (cx, cy). */
  private tile(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number): boolean {
    const s = sprites.get(name);
    if (!s) return false;
    const w = TILE_W * 1.025;
    const h = TILE_H * 1.025;
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, cx - w / 2, cy - h / 2, w, h);
    return true;
  }

  /** Draw a Kenney object standing on (x, y) (bottom-center anchor). */
  private obj(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, scale = 1): void {
    const s = sprites.get(name);
    if (!s) return;
    const w = s.w * SPRITE_K * scale;
    const h = s.h * SPRITE_K * scale;
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x - w / 2, y - h, w, h);
  }

  /** Which Kenney tile represents a land tile's ground (and its trees and rocks). */
  private groundTile(i: number): string | null {
    const map = this.g.s.map;
    const t = map.terrain[i];
    const f = map.feature[i];
    const relief = map.relief[i];
    const h = tileHash(i);
    if (t <= T.Lake || t === T.Snow || f === F.Ice) return null;
    if (f === F.Volcano) return 'mars_17';
    if (f === F.Ash) return h < 0.5 ? 'mars_07' : 'mars_18';
    switch (t) {
      case T.Grass:
        if (relief === Relief.Mountain) return 'grass_05';
        if (f === F.Forest || f === F.Jungle) return pick(['grass_12', 'grass_13'], h);
        if (relief === Relief.Hills) return 'grass_05';
        return h < 0.85 ? 'grass_05' : pick(['grass_10', 'grass_11'], h * 7);
      case T.Plains:
        if (relief === Relief.Mountain) return 'dirt_06';
        if (f === F.Forest) return pick(['dirt_13', 'dirt_14', 'dirt_17'], h);
        if (relief === Relief.Hills) return 'dirt_06';
        return h < 0.9 ? 'dirt_06' : pick(['dirt_11', 'dirt_12'], h * 7);
      case T.Desert:
        if (relief === Relief.Mountain) return 'sand_07';
        if (relief === Relief.Hills) return 'sand_07';
        if (f === F.Oasis || f === F.Floodplain) return 'sand_07';
        return h < 0.78 ? 'sand_07' : pick(['sand_12', 'sand_13', 'sand_14'], h * 7);
      case T.Tundra:
        if (f === F.Forest) return pick(['stone_12', 'stone_13'], h);
        return 'stone_07';
    }
    return null;
  }

  // --- Frame -----------------------------------------------------------------------

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
    const up = this.dpr / this.sdpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = UNCHARTED;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (up === 1) ctx.drawImage(this.staticCanvas, Math.round(dx), Math.round(dy));
    else ctx.drawImage(this.staticCanvas, dx, dy, this.staticCanvas.width * up, this.staticCanvas.height * up);
    this.drawVignette(ctx);
    ctx.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * (this.w / 2 - this.cam.x * this.cam.zoom), this.dpr * (this.h / 2 - this.cam.y * this.cam.zoom));
    this.drawDynamic(ctx);
    const now = performance.now();
    if (this.effects.length || this.anims.size) {
      this.effects = this.effects.filter((e) => now - e.start < e.dur);
      for (const [id, an] of this.anims) if (now - an.start > 160) this.anims.delete(id);
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
    ctx.fillStyle = UNCHARTED;
    ctx.fillRect(0, 0, this.staticCanvas.width, this.staticCanvas.height);
    this.drawUncharted(ctx);
    const sd = this.sdpr;
    ctx.setTransform(sd * z, 0, 0, sd * z, sd * (m + this.w / 2 - this.cam.x * z), sd * (m + this.h / 2 - this.cam.y * z));
    ctx.imageSmoothingQuality = 'high';
    const grid = g.grid;
    const tiles: number[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tiles.push(r * map.w + c);

    // The uncharted world: a faint hex lattice on dark slate.
    if (px > 9) {
      ctx.beginPath();
      for (const i of tiles) {
        if (explored[i]) continue;
        const [cx, cy] = grid.center(i, HEX);
        this.hexPath(ctx, cx, cy, HEX * 0.97);
      }
      ctx.strokeStyle = 'rgba(160, 190, 220, 0.07)';
      ctx.lineWidth = 1 / z;
      ctx.stroke();
    }

    const detailed = sprites.loaded && px >= 11;
    // Flat fills: everything at far zoom; water, snow and ice always.
    const batches = new Map<number, Path2D>();
    for (const i of tiles) {
      if (!explored[i]) continue;
      if (detailed && this.groundTile(i)) continue;
      const [cx, cy] = grid.center(i, HEX);
      const k = this.fillIdx[i];
      let p = batches.get(k);
      if (!p) batches.set(k, (p = new Path2D()));
      this.hexPath(p, cx, cy, HEX + 0.6);
    }
    for (const [k, p] of batches) {
      ctx.fillStyle = this.palette[k];
      ctx.fill(p);
    }
    if (detailed) {
      for (const i of tiles) {
        if (!explored[i]) continue;
        const name = this.groundTile(i);
        if (!name) continue;
        const [cx, cy] = grid.center(i, HEX);
        this.tile(ctx, name, cx, cy);
      }
    }

    // Shorelines: a bright rim where land meets water.
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
      ctx.strokeStyle = 'rgba(236, 246, 255, 0.55)';
      ctx.lineWidth = 2.4 / Math.sqrt(z);
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    if (px > 13) this.drawWater(ctx, tiles, explored);
    if (detailed) this.drawFeatures(ctx, tiles, explored, px);
    this.drawRivers(ctx, tiles, explored, z);
    this.drawRoads(ctx, tiles, explored, z);
    if (detailed && px > 22) this.drawImprovements(ctx, tiles, explored);
    if (px > 19) this.drawResources(ctx, tiles, explored);
    this.drawTerritory(ctx, tiles, explored, z);
    this.drawSites(ctx, tiles, explored, px, detailed);

    // Fog: what we have seen but cannot see now is remembered, faded and grey.
    const fog = new Path2D();
    let any = false;
    for (const i of tiles) {
      if (!explored[i] || visible[i]) continue;
      const [cx, cy] = grid.center(i, HEX);
      this.hexPath(fog, cx, cy, HEX + 0.6);
      any = true;
    }
    if (any) {
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#808080';
      ctx.fill(fog);
      ctx.restore();
      ctx.fillStyle = 'rgba(16, 24, 38, 0.3)';
      ctx.fill(fog);
    }
  }

  /**
   * The unexplored map is not a flat fill: a faint chart grain and a hex
   * lattice suggest a map that exists but has not been drawn yet.
   */
  private drawUncharted(ctx: CanvasRenderingContext2D): void {
    const W = this.staticCanvas.width;
    const H = this.staticCanvas.height;
    const step = HEX * this.cam.zoom * this.sdpr;
    if (step > 10) {
      ctx.strokeStyle = 'rgba(150,180,210,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = (this.cam.x * step) % step; x < W + step; x += step) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, H);
      }
      for (let y = (this.cam.y * step) % step; y < H + step; y += step) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(W, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }
    if (!this.grain) this.grain = makeGrain();
    const chart = ctx.createPattern(makeChart(), 'repeat');
    if (chart) {
      ctx.fillStyle = chart;
      ctx.fillRect(0, 0, W, H);
    }
    const pattern = ctx.createPattern(this.grain, 'repeat');
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.5, W / 2, H / 2, Math.max(W, H) * 0.78);
    grad.addColorStop(0, 'rgba(8, 12, 20, 0)');
    grad.addColorStop(1, 'rgba(8, 12, 20, 0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  /** Gentle wave strokes so water reads as water at close range. */
  private drawWater(ctx: CanvasRenderingContext2D, tiles: number[], explored: Uint8Array): void {
    const map = this.g.s.map;
    const grid = this.g.grid;
    const waves = new Path2D();
    for (const i of tiles) {
      if (!explored[i] || map.terrain[i] > T.Lake || map.feature[i] === F.Ice) continue;
      if (tileHash(i, 3) > 0.45) continue;
      const [cx, cy] = grid.center(i, HEX);
      const ox = (tileHash(i, 5) - 0.5) * HEX * 0.6;
      const oy = (tileHash(i, 7) - 0.5) * HEX * 0.6;
      const x = cx + ox;
      const y = cy + oy;
      waves.moveTo(x - HEX * 0.3, y);
      waves.quadraticCurveTo(x - HEX * 0.15, y - HEX * 0.12, x, y);
      waves.quadraticCurveTo(x + HEX * 0.15, y - HEX * 0.12, x + HEX * 0.3, y);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = HEX * 0.05;
    ctx.lineCap = 'round';
    ctx.stroke(waves);
  }

  private drawFeatures(ctx: CanvasRenderingContext2D, tiles: number[], explored: Uint8Array, px: number): void {
    const g = this.g;
    const map = g.s.map;
    const grid = g.grid;
    const H = HEX;
    const marsh = new Path2D();
    for (const i of tiles) {
      if (!explored[i] || map.cityAt[i] >= 0) continue;
      const [cx, cy] = grid.center(i, H);
      const f = map.feature[i];
      const relief = map.relief[i];
      const t = map.terrain[i];
      const h = tileHash(i, 11);
      if (t === T.Snow && relief !== Relief.Mountain) {
        if (f === F.Forest && px > 16) {
          this.obj(ctx, 'treePine_small', cx - H * 0.25, cy + H * 0.15);
          this.obj(ctx, 'treePine_small', cx + H * 0.2, cy + H * 0.3);
        }
        continue;
      }
      if (relief === Relief.Mountain) {
        this.obj(ctx, h < 0.5 ? 'rockGrey_large' : 'rockGrey_large', cx + (h - 0.5) * H * 0.2, cy + H * 0.48, 0.92);
        this.obj(ctx, 'rockGrey_medium1', cx + H * 0.42, cy + H * 0.55, 0.75);
        if (t === T.Snow || t === T.Tundra) {
          // Snow caps.
          ctx.fillStyle = 'rgba(250, 252, 255, 0.85)';
          ctx.beginPath();
          ctx.ellipse(cx + (h - 0.5) * H * 0.2, cy - H * 0.32, H * 0.2, H * 0.08, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        if (f === F.Volcano) this.obj(ctx, 'fire', cx + (h - 0.5) * H * 0.2, cy - H * 0.32, 1.1);
        continue;
      }
      if (f === F.Volcano) {
        this.obj(ctx, 'fire', cx, cy - H * 0.05, 1.1);
        continue;
      }
      if (relief === Relief.Hills && f !== F.Forest && f !== F.Jungle) this.drawHills(ctx, cx, cy, h);
      if (f === F.Jungle) {
        this.obj(ctx, 'treeRound_large', cx - H * 0.35, cy + H * 0.45);
        this.obj(ctx, 'treeRound_large', cx + H * 0.38, cy + H * 0.5);
        ctx.fillStyle = 'rgba(10, 60, 30, 0.22)';
        ctx.beginPath();
        this.hexPath(ctx, cx, cy, H);
        ctx.fill();
      } else if (f === F.Marsh) {
        for (let k = -1; k <= 1; k++) {
          marsh.moveTo(cx - H * 0.38, cy + k * H * 0.25);
          marsh.lineTo(cx + H * 0.08, cy + k * H * 0.25);
          marsh.moveTo(cx + H * 0.18, cy + k * H * 0.25 + H * 0.08);
          marsh.lineTo(cx + H * 0.4, cy + k * H * 0.25 + H * 0.08);
        }
      } else if (f === F.Oasis) {
        ctx.fillStyle = '#48a6dc';
        ctx.beginPath();
        ctx.ellipse(cx, cy + H * 0.08, H * 0.24, H * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        this.obj(ctx, 'treeRound_small', cx + H * 0.3, cy + H * 0.05);
        this.obj(ctx, 'treeRound_small', cx - H * 0.32, cy + H * 0.1);
      } else if (f === F.Floodplain) {
        ctx.fillStyle = 'rgba(70, 140, 40, 0.28)';
        ctx.beginPath();
        this.hexPath(ctx, cx, cy, H);
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(30, 110, 130, 0.7)';
    ctx.lineWidth = H * 0.06;
    ctx.lineCap = 'round';
    ctx.stroke(marsh);
  }

  /** Soft rolling mounds: clearly hills, never confused with Kenney's rock mountains. */
  private drawHills(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number): void {
    const H = HEX;
    const mounds: [number, number, number, number][] = h < 0.5
      ? [[-0.2, 0.32, 0.42, 0.34], [0.24, 0.42, 0.34, 0.26]]
      : [[0.18, 0.32, 0.42, 0.34], [-0.26, 0.44, 0.32, 0.25]];
    for (const [dx, dy, rx, ry] of mounds) {
      const x = cx + dx * H;
      const y = cy + dy * H;
      ctx.beginPath();
      ctx.ellipse(x, y, rx * H, ry * H * 1.25, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(40, 26, 12, 0.32)';
      ctx.fill();
      ctx.lineWidth = H * 0.04;
      ctx.strokeStyle = 'rgba(30, 20, 10, 0.35)';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y, rx * H * 0.92, ry * H * 1.12, 0, Math.PI * 1.12, Math.PI * 1.62);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = H * 0.05;
      ctx.lineCap = 'round';
      ctx.stroke();
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
      const w = Math.min(4.5, 1.6 + Math.log2(map.river[i] + 1) * 0.8);
      const key = Math.round(w * 2) / 2;
      let p = byWidth.get(key);
      if (!p) byWidth.set(key, (p = new Path2D()));
      const mx = (ax + bx) / 2 + ((i % 7) - 3) * 0.9;
      const my = (ay + by) / 2 + ((i % 5) - 2) * 0.9;
      p.moveTo(ax, ay);
      p.quadraticCurveTo(mx, my, bx, by);
    }
    for (const [w, p] of byWidth) {
      ctx.strokeStyle = 'rgba(235, 246, 255, 0.75)';
      ctx.lineWidth = (w + 2.2) * Math.max(1, 1 / z) * 0.9;
      ctx.stroke(p);
      ctx.strokeStyle = '#3d9ce0';
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
    ctx.strokeStyle = 'rgba(92, 64, 40, 0.55)';
    ctx.lineWidth = Math.max(3.4, 4.2 / z);
    ctx.stroke(road);
    ctx.strokeStyle = 'rgba(236, 214, 170, 0.95)';
    ctx.lineWidth = Math.max(1.8, 2.4 / z);
    ctx.stroke(road);
    ctx.strokeStyle = 'rgba(40, 40, 46, 0.9)';
    ctx.lineWidth = Math.max(3, 3.4 / z);
    ctx.stroke(rail);
    ctx.strokeStyle = 'rgba(200, 200, 210, 0.9)';
    ctx.lineWidth = Math.max(1, 1.2 / z);
    ctx.setLineDash([HEX * 0.08, HEX * 0.1]);
    ctx.stroke(rail);
    ctx.setLineDash([]);
  }

  private drawImprovements(ctx: CanvasRenderingContext2D, tiles: number[], explored: Uint8Array): void {
    const map = this.g.s.map;
    const grid = this.g.grid;
    const H = HEX;
    const boats = new Path2D();
    for (const i of tiles) {
      if (!explored[i]) continue;
      const imp = map.improvement[i];
      if (!imp || map.cityAt[i] >= 0) continue;
      const [cx, cy] = grid.center(i, H);
      const x = cx + H * 0.22;
      const y = cy + H * 0.62;
      switch (imp) {
        case Imp.Farm:
          this.drawField(ctx, x - H * 0.06, y - H * 0.12);
          break;
        case Imp.Mine:
          this.obj(ctx, 'mine', x, y, 0.7);
          break;
        case Imp.Pasture:
          this.obj(ctx, 'fence', x - H * 0.12, y);
          this.obj(ctx, 'hay', x + H * 0.12, y - H * 0.02, 0.8);
          break;
        case Imp.Plantation:
          this.obj(ctx, 'hay', x, y, 0.9);
          break;
        case Imp.Lumber:
          this.obj(ctx, 'logPile', x, y, 0.7);
          break;
        case Imp.OilWell:
          this.obj(ctx, 'oil', x, y, 0.75);
          break;
        case Imp.Boats:
          boats.moveTo(cx + H * 0.05, cy + H * 0.38);
          boats.quadraticCurveTo(cx + H * 0.25, cy + H * 0.52, cx + H * 0.45, cy + H * 0.38);
          boats.closePath();
          boats.moveTo(cx + H * 0.25, cy + H * 0.38);
          boats.lineTo(cx + H * 0.25, cy + H * 0.1);
          boats.lineTo(cx + H * 0.4, cy + H * 0.3);
          break;
      }
    }
    ctx.fillStyle = '#f4ead2';
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.85)';
    ctx.lineWidth = H * 0.03;
    ctx.fill(boats);
    ctx.stroke(boats);
  }

  /** A small striped crop field. */
  private drawField(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const H = HEX;
    const w = H * 0.46;
    const hgt = H * 0.24;
    const skew = H * 0.1;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + skew, y - hgt / 2);
    ctx.lineTo(x + w / 2 + skew, y - hgt / 2);
    ctx.lineTo(x + w / 2 - skew, y + hgt / 2);
    ctx.lineTo(x - w / 2 - skew, y + hgt / 2);
    ctx.closePath();
    ctx.fillStyle = '#e9c45a';
    ctx.fill();
    ctx.lineWidth = H * 0.03;
    ctx.strokeStyle = 'rgba(70, 48, 20, 0.85)';
    ctx.stroke();
    ctx.beginPath();
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      const sx = x - w / 2 + skew + w * t;
      ctx.moveTo(sx, y - hgt / 2);
      ctx.lineTo(sx - 2 * skew, y + hgt / 2);
    }
    ctx.strokeStyle = 'rgba(150, 110, 30, 0.8)';
    ctx.lineWidth = H * 0.025;
    ctx.stroke();
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
      const x = cx - HEX * 0.42;
      const y = cy - HEX * 0.42;
      const rad = HEX * 0.21;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(18, 22, 30, 0.88)';
      ctx.fill();
      ctx.lineWidth = HEX * 0.05;
      ctx.strokeStyle = def.color;
      ctx.stroke();
      const key = `r-${def.key}`;
      if (hasIcon(key)) drawIcon(ctx, key, x, y, rad * 1.45, def.color);
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
      this.hexPath(f, cx, cy, HEX + 0.5);
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
      ctx.fillStyle = hexAlpha(g.civ(o).color, 0.13);
      ctx.fill(f);
    }
    ctx.lineCap = 'round';
    for (const [o, e] of edges) {
      ctx.strokeStyle = 'rgba(12, 16, 24, 0.5)';
      ctx.lineWidth = Math.max(3.6, 5 / z);
      ctx.stroke(e);
      ctx.strokeStyle = g.civ(o).color;
      ctx.lineWidth = Math.max(2, 3 / z);
      ctx.stroke(e);
    }
  }

  /** Cities, ruins and natural wonders. */
  private drawSites(ctx: CanvasRenderingContext2D, tiles: number[], explored: Uint8Array, px: number, detailed: boolean): void {
    const g = this.g;
    const map = g.s.map;
    const grid = g.grid;
    for (const i of tiles) {
      if (!explored[i]) continue;
      const [cx, cy] = grid.center(i, HEX);
      const city = g.cityAt(i);
      if (city) {
        const civ = g.civ(city.civId);
        const name = cityTileName(civ.eraTier, city.size, civ.capitalId === city.id);
        if (!detailed || !this.tile(ctx, name, cx, cy)) this.drawCityFallback(ctx, cx, cy, city.size, civ.color);
        // A ring in the owner's color ties the city to its people.
        ctx.beginPath();
        this.hexPath(ctx, cx, cy, HEX * 0.97);
        ctx.strokeStyle = civ.color;
        ctx.lineWidth = Math.max(2, 2.6 / this.cam.zoom);
        ctx.stroke();
        continue;
      }
      if (map.ruinAt[i] >= 0 && px >= 10) {
        if (!detailed || !this.tile(ctx, 'medieval_ruins', cx, cy)) {
          ctx.fillStyle = 'rgba(70, 58, 44, 0.9)';
          ctx.fillRect(cx - HEX * 0.25, cy - HEX * 0.1, HEX * 0.5, HEX * 0.25);
        }
      }
      if (map.wonder[i] >= 0 && px >= 10) {
        ctx.save();
        ctx.translate(cx + HEX * 0.38, cy - HEX * 0.42);
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const r = k % 2 === 0 ? HEX * 0.22 : HEX * 0.1;
          const a = (k * Math.PI) / 5 - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = '#ffd34d';
        ctx.fill();
        ctx.strokeStyle = 'rgba(70, 40, 0, 0.95)';
        ctx.lineWidth = HEX * 0.035;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawCityFallback(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
    const H = HEX;
    const houses = size >= 12 ? 4 : size >= 5 ? 3 : 2;
    const spots: [number, number][] = [[0, -0.1], [-0.3, 0.12], [0.3, 0.14], [0, 0.3]];
    for (let k = 0; k < houses; k++) {
      const [dx, dy] = spots[k];
      const x = cx + dx * H;
      const y = cy + dy * H;
      ctx.fillStyle = '#efe4c8';
      ctx.fillRect(x - H * 0.18, y - H * 0.12, H * 0.36, H * 0.26);
      ctx.beginPath();
      ctx.moveTo(x - H * 0.24, y - H * 0.12);
      ctx.lineTo(x, y - H * 0.34);
      ctx.lineTo(x + H * 0.24, y - H * 0.12);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  // --- Dynamic layer: overlays, units, banners, effects ------------------------------------

  private drawDynamic(ctx: CanvasRenderingContext2D): void {
    const g = this.g;
    const map = g.s.map;
    const grid = g.grid;
    const player = g.player;
    const o = this.overlay;
    const z = this.cam.zoom;
    const { r0, r1, c0, c1 } = this.visibleRange();

    if (o.reach && o.reach.size) {
      ctx.beginPath();
      for (const t of o.reach.keys()) {
        const [cx, cy] = grid.center(t, HEX);
        this.hexPath(ctx, cx, cy, HEX * 0.86);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.4 / z;
      ctx.stroke();
    }
    if (o.attack && o.attack.size) {
      ctx.beginPath();
      for (const t of o.attack) {
        const [cx, cy] = grid.center(t, HEX);
        this.hexPath(ctx, cx, cy, HEX * 0.86);
      }
      ctx.strokeStyle = 'rgba(255, 70, 52, 0.95)';
      ctx.lineWidth = Math.max(2.5, 3 / z);
      ctx.stroke();
    }

    if (o.path && o.path.length && o.selectedUnit >= 0) {
      const u = g.unit(o.selectedUnit);
      if (u) {
        const pts = [u.tile, ...o.path].map((t) => grid.center(t, HEX));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.strokeStyle = 'rgba(10, 14, 22, 0.55)';
        ctx.lineWidth = Math.max(5, 6 / z);
        ctx.stroke();
        ctx.strokeStyle = o.pathAttack ? 'rgba(255, 90, 70, 1)' : 'rgba(255, 252, 238, 1)';
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
          ctx.fillStyle = 'rgba(16, 20, 28, 0.9)';
          ctx.fill();
          ctx.fillStyle = '#f4ead2';
          ctx.fillText(String((turns[k] ?? 0) + 1), x, y + 0.5);
        }
      }
    }

    const cityLabels: { x: number; y: number; name: string; size: number; color: string; capital: boolean; dim: boolean }[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * map.w + c;
        if (!player.explored[i]) continue;
        const city = g.cityAt(i);
        if (!city) continue;
        const civ = g.civ(city.civId);
        const [cx, cy] = grid.center(i, HEX);
        cityLabels.push({ x: cx, y: cy, name: city.name, size: city.size, color: civ.color, capital: civ.capitalId === city.id, dim: !player.visible[i] });
      }
    }

    const now = performance.now();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * map.w + c;
        const ids = g.unitsAt.get(i);
        if (!ids || !ids.length || !player.visible[i]) continue;
        const units = ids.map((id) => g.s.units[id]).filter(Boolean);
        if (!units.length) continue;
        const isCity = map.cityAt[i] >= 0;
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
          cx += HEX * 0.45;
          cy -= HEX * 0.38;
        }
        const civ = g.civ(top.civId);
        const embarked = map.terrain[top.tile] <= T.Lake && UNIT[top.type].cls !== 'naval' && UNIT[top.type].cls !== 'air';
        this.drawUnit(ctx, cx, cy, top.type, civ.color, top.hp, units.length, top.id === o.selectedUnit, top.order?.kind === 'fortify' && top.fortified > 0, embarked, isCity ? 0.8 : 1);
      }
    }

    const showNames = z > 0.42;
    for (const l of cityLabels) {
      if (!showNames && !l.capital) continue;
      this.drawBanner(ctx, l.x, l.y + HEX * 0.78, l.name, l.size, l.color, l.capital, l.dim, z);
    }

    const outline = (t: number, color: string, wid: number) => {
      if (t < 0) return;
      const [cx, cy] = grid.center(t, HEX);
      ctx.beginPath();
      this.hexPath(ctx, cx, cy, HEX * 0.94);
      ctx.strokeStyle = color;
      ctx.lineWidth = wid / z;
      ctx.stroke();
    };
    outline(o.hoverTile, 'rgba(255, 255, 255, 0.7)', 1.8);
    outline(o.selectedTile, '#fff7dd', 3);

    for (const e of this.effects) {
      const t = (now - e.start) / e.dur;
      if (t < 0 || t > 1) continue;
      const [cx, cy] = grid.center(e.tile, HEX);
      if (e.kind === 'text' && e.text) {
        ctx.globalAlpha = 1 - t * t;
        ctx.font = `800 ${Math.max(14, 16 / z)}px Inter Variable, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4 / z;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
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

  private drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, size: number, color: string, capital: boolean, dim: boolean, z: number): void {
    // Roughly constant on screen: a touch larger when zoomed in, never tiny.
    const scale = Math.min(1.2, Math.max(0.9, Math.pow(z, 0.25))) / z;
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
    ctx.globalAlpha = dim ? 0.8 : 1;
    ctx.beginPath();
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(16, 20, 28, 0.92)';
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
    const r = H * 0.42;
    // Ground shadow lifts the token off the tile art.
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.95, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fill();
    if (selected) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + H * 0.13, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 247, 221, 0.95)';
      ctx.fill();
    }
    if (embarked) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.25, cy + r * 0.45);
      ctx.quadraticCurveTo(cx, cy + r * 1.55, cx + r * 1.25, cy + r * 0.45);
      ctx.closePath();
      ctx.fillStyle = '#7a5530';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = H * 0.07;
    ctx.strokeStyle = 'rgba(14, 12, 10, 0.92)';
    ctx.stroke();
    const key = `u-${type}`;
    const ink = luminance(color) > 0.55 ? '#16130f' : '#fff9ec';
    if (hasIcon(key)) drawIcon(ctx, key as IconKey, cx, cy, r * 1.42, ink);
    if (fortified) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + H * 0.06, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.strokeStyle = '#fff7dd';
      ctx.lineWidth = H * 0.07;
      ctx.stroke();
    }
    if (hp < 100) {
      const w = r * 1.7;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(cx - w / 2, cy + r + H * 0.07, w, H * 0.1);
      ctx.fillStyle = hp > 60 ? '#7bc47f' : hp > 30 ? '#e8c25a' : '#e06a5f';
      ctx.fillRect(cx - w / 2, cy + r + H * 0.07, (w * hp) / 100, H * 0.1);
    }
    if (count > 1) {
      const bx = cx + r * 0.82;
      const by = cy - r * 0.82;
      ctx.beginPath();
      ctx.arc(bx, by, H * 0.17, 0, Math.PI * 2);
      ctx.fillStyle = '#121620';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = H * 0.035;
      ctx.stroke();
      ctx.fillStyle = '#f4ead2';
      ctx.font = `700 ${H * 0.21}px Inter Variable, system-ui, sans-serif`;
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

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
