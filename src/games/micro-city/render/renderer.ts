import type { City } from '../sim/city';
import { BUILDING, Road, Ter, Zone, ZONE_COLOR } from '../sim/defs';
import { floodReach } from '../sim/events';
import { FLAG_ABANDONED, FLAG_FIRE, FLAG_FLOODED, FLAG_POWER, FLAG_WATER } from '../sim/state';
import { drawService, drawZoneBuilding, type DrawOpts } from './buildings';
import { diamond, hash, HH, HW, iso, mix, shade, tree, UNIT } from './paint';

export type Overlay =
  | 'land' | 'air' | 'noise' | 'crime' | 'happy' | 'traffic' | 'power' | 'water'
  | 'police' | 'fire' | 'health' | 'education' | 'transit' | 'park' | 'flood';

export interface Preview {
  tiles: number[];
  ok: boolean;
  kind: 'road' | 'zone' | 'building' | 'bulldoze';
  zone?: number;
  building?: { type: string; x: number; y: number };
}

/** Below this zoom the city is drawn as a flat colored map. */
const FAR = 0.22;
/** Below this zoom buildings lose windows, trees and road markings. */
const DETAIL = 0.42;
const MAX_LIFT = 9 * UNIT + 60;

const WATER = '#4aa3df';
const SHORE = '#69b7e6';
const SAND = '#e6d39c';
const ROCK = '#a5a198';
const ROAD_COLOR = ['', '#6b7079', '#5e636c', '#4c5159'];
const LOT = ['', '#cfd8bd', '#d9d4cb', '#bcb6aa', '#dcd9d2'];

function grass(elev: number, style: number, forest: boolean): string {
  const base = forest ? '#7ab35c' : '#8cc56b';
  const e = Math.max(-0.2, Math.min(0.25, (elev - 120) / 520));
  const v = ((style % 3) - 1) * 0.03;
  const f = Math.round((e + v) * 40) / 40;
  return f >= 0 ? shade(base, f) : shade(base, f * 1.2);
}

const rgbCache = new Map<string, [number, number, number]>();

/** Parse a hex or rgb() color once. */
function rgbOf(h: string): [number, number, number] {
  let v = rgbCache.get(h);
  if (!v) {
    if (h.startsWith('rgb')) {
      const m = h.match(/\d+/g)!;
      v = [+m[0], +m[1], +m[2]];
    } else {
      const n = parseInt(h.slice(1), 16);
      v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    rgbCache.set(h, v);
  }
  return v;
}

/** 0..1 → overlay color; `good` flips the ramp so green means good. */
const RAMP: string[] = [];
for (let k = 0; k <= 16; k++) {
  const t = k / 16;
  const stops = ['#2e7d32', '#9ccc65', '#ffee58', '#ffa726', '#e53935'];
  const p = t * (stops.length - 1);
  const a = Math.floor(p);
  RAMP.push(mix(stops[a], stops[Math.min(stops.length - 1, a + 1)], p - a));
}
function ramp(v: number, good: boolean): string {
  const t = Math.max(0, Math.min(1, good ? 1 - v : v));
  return RAMP[Math.round(t * 16)];
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  city: City;
  W = 0;
  H = 0;
  dpr = 1;
  cx = 0;
  cy = 0;
  z = 0.6;
  overlay: Overlay | null = null;
  preview: Preview | null = null;
  selected: number[] = [];
  hover = -1;
  /** Radius preview (tiles) around a building being placed. */
  radius: { x: number; y: number; r: number } | null = null;
  running = false;

  /** Ground (terrain, roads, zones, overlay) and objects (trees, buildings) are cached apart so traffic can drive between them. */
  private cache = document.createElement('canvas');
  private cctx: CanvasRenderingContext2D;
  private cacheObj = document.createElement('canvas');
  private octx: CanvasRenderingContext2D;
  private view = { cx: 0, cy: 0, z: 0, cdpr: 1, margin: 0, valid: false };
  private dirty = true;
  private lastBuild = 0;
  private buildMs = 0;
  private mapImg = document.createElement('canvas');
  private mapDirty = true;
  private flood: Uint8Array | null = null;
  /** Last cache build timings (ms), for tuning. */
  stats = { ground: 0, objects: 0, map: 0 };

  constructor(canvas: HTMLCanvasElement, city: City) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.cctx = this.cache.getContext('2d')!;
    this.octx = this.cacheObj.getContext('2d')!;
    this.city = city;
    this.setCity(city);
  }

  setCity(city: City): void {
    this.city = city;
    this.mapImg.width = city.w;
    this.mapImg.height = city.h;
    this.flood = null;
    this.invalidate();
  }

  invalidate(): void {
    this.dirty = true;
    this.mapDirty = true;
    if (this.overlay === 'flood') this.flood = null;
  }

  setOverlay(o: Overlay | null): void {
    this.overlay = o;
    this.flood = null;
    this.invalidate();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.view.valid = false;
  }

  // --- Camera ---------------------------------------------------------------------

  get minZoom(): number {
    return Math.min(0.5, Math.max(0.06, Math.min(this.W / (this.city.w * HW * 2.1), this.H / (this.city.h * HH * 2.1))));
  }

  clamp(): void {
    const n = this.city.w;
    this.z = Math.max(this.minZoom, Math.min(2.4, this.z));
    this.cx = Math.max(-n * HW, Math.min(n * HW, this.cx));
    this.cy = Math.max(0, Math.min(2 * n * HH, this.cy));
  }

  pan(dx: number, dy: number): void {
    this.cx -= dx / this.z;
    this.cy -= dy / this.z;
    this.clamp();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.z *= factor;
    this.clamp();
    this.cx = wx - (sx - this.W / 2) / this.z;
    this.cy = wy - (sy - this.H / 2) / this.z;
    this.clamp();
  }

  centerOn(i: number, zoom?: number): void {
    const [wx, wy] = iso(this.city.x(i) + 0.5, this.city.y(i) + 0.5);
    this.cx = wx;
    this.cy = wy;
    if (zoom) this.z = zoom;
    this.clamp();
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.W / 2) / this.z + this.cx, (sy - this.H / 2) / this.z + this.cy];
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.cx) * this.z + this.W / 2, (wy - this.cy) * this.z + this.H / 2];
  }

  /** Fractional tile coordinates under a screen point. */
  tileXY(sx: number, sy: number): [number, number] {
    const [wx, wy] = this.toWorld(sx, sy);
    return [(wy / HH + wx / HW) / 2, (wy / HH - wx / HW) / 2];
  }

  pick(sx: number, sy: number): number {
    const [fx, fy] = this.tileXY(sx, sy);
    return this.city.idx(Math.floor(fx), Math.floor(fy));
  }

  // --- Frame ----------------------------------------------------------------------

  frame(now: number): void {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#3d8fcf';
    ctx.fillRect(0, 0, this.W, this.H);
    if (this.mapDirty) this.paintMap();
    if (this.z < FAR) {
      this.drawFlat();
    } else {
      this.ensureCache(now);
      const v = this.view;
      const s = this.z / v.z;
      const ox = (v.cx - this.cx) * this.z + this.W / 2 - (this.W / 2 + v.margin) * s;
      const oy = (v.cy - this.cy) * this.z + this.H / 2 - (this.H / 2 + v.margin) * s;
      const dw = (this.cache.width / v.cdpr) * s;
      const dh = (this.cache.height / v.cdpr) * s;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.cache, ox, oy, dw, dh);
      this.drawTraffic(now);
      ctx.drawImage(this.cacheObj, ox, oy, dw, dh);
    }
    this.drawLive(now);
  }

  /** Rebuild the cached city layer when the view leaves it or the city changed. */
  private ensureCache(now: number): void {
    const v = this.view;
    const zoomChanged = Math.abs(this.z / v.z - 1) > 0.001;
    const out = Math.abs(this.cx - v.cx) * this.z > v.margin * 0.9 || Math.abs(this.cy - v.cy) * this.z > v.margin * 0.9;
    // Throttle rebuilds caused only by simulation changes when they are expensive.
    const throttle = this.buildMs > 25 ? this.buildMs * 6 : 0;
    const needDirty = this.dirty && now - this.lastBuild >= throttle;
    if (!v.valid || out || needDirty || (zoomChanged && !this.zooming)) this.buildCache(now);
  }

  /** While pinching, keep scaling the old cache instead of rebuilding every frame. */
  zooming = false;

  private buildCache(now: number): void {
    const t0 = performance.now();
    const margin = Math.round(Math.min(260, Math.max(this.W, this.H) * 0.25));
    const cw = this.W + 2 * margin;
    const ch = this.H + 2 * margin;
    const cdpr = Math.max(0.75, Math.min(this.dpr, Math.sqrt(6_000_000 / (cw * ch))));
    const pw = Math.round(cw * cdpr);
    const ph = Math.round(ch * cdpr);
    for (const cv of [this.cache, this.cacheObj]) {
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw;
        cv.height = ph;
      }
    }
    const v = this.view;
    v.cx = this.cx;
    v.cy = this.cy;
    v.z = this.z;
    v.cdpr = cdpr;
    v.margin = margin;
    v.valid = true;
    for (const ctx of [this.cctx, this.octx]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pw, ph);
      ctx.setTransform(cdpr * this.z, 0, 0, cdpr * this.z, cdpr * (cw / 2 - this.cx * this.z), cdpr * (ch / 2 - this.cy * this.z));
    }
    this.paintCity(this.cctx, this.octx, this.cx - cw / 2 / this.z, this.cy - ch / 2 / this.z, this.cx + cw / 2 / this.z, this.cy + ch / 2 / this.z);
    this.dirty = false;
    this.lastBuild = now;
    this.buildMs = performance.now() - t0;
  }

  /** Tile index range covering a world rectangle. */
  private range(wx0: number, wy0: number, wx1: number, wy1: number): [number, number, number, number] {
    const fx = (wx: number, wy: number) => (wy / HH + wx / HW) / 2;
    const fy = (wx: number, wy: number) => (wy / HH - wx / HW) / 2;
    const xs = [fx(wx0, wy0), fx(wx1, wy0), fx(wx0, wy1), fx(wx1, wy1)];
    const ys = [fy(wx0, wy0), fy(wx1, wy0), fy(wx0, wy1), fy(wx1, wy1)];
    const c = this.city;
    return [
      Math.max(0, Math.floor(Math.min(...xs)) - 1),
      Math.max(0, Math.floor(Math.min(...ys)) - 1),
      Math.min(c.w - 1, Math.ceil(Math.max(...xs)) + 1),
      Math.min(c.h - 1, Math.ceil(Math.max(...ys)) + 1),
    ];
  }

  private overlayValue(i: number): [number, boolean] | null {
    const c = this.city;
    const t = c.s.tiles;
    switch (this.overlay) {
      case 'land': return [(c.land[i] - 20) / 60, true];
      case 'air': return [c.air[i] / 60, false];
      case 'noise': return [c.noise[i] / 60, false];
      case 'crime': return t.level[i] ? [c.crime[i] / 70, false] : null;
      case 'happy': return t.zone[i] === Zone.Res && t.level[i] ? [c.happy[i] / 100, true] : null;
      case 'power': return t.zone[i] || t.bld[i] >= 0 ? [t.flags[i] & FLAG_POWER ? 1 : 0, true] : null;
      case 'water': return t.zone[i] || t.bld[i] >= 0 ? [t.flags[i] & FLAG_WATER ? 1 : 0, true] : null;
      case 'transit': return [Math.max(c.cov.transit[i], c.cov.metro[i]), true];
      case 'police': case 'fire': case 'health': case 'park':
        return [Math.min(1, c.cov[this.overlay][i]), true];
      case 'education': return [Math.min(1, c.edu[i] / 2.2), true];
      default: return null;
    }
  }

  private paintCity(ctx: CanvasRenderingContext2D, octx: CanvasRenderingContext2D, wx0: number, wy0: number, wx1: number, wy1: number): void {
    const c = this.city;
    const t = c.s.tiles;
    const tStart = performance.now();
    const detail = this.z >= DETAIL;
    const [x0, y0, x1, y1] = this.range(wx0, wy0 - 40, wx1, wy1 + MAX_LIFT);
    const buckets = new Map<string, Path2D>();
    const fill = (color: string, i: number, inset = 0) => {
      let p = buckets.get(color);
      if (!p) buckets.set(color, (p = new Path2D()));
      diamond(p, c.x(i), c.y(i), 1, 1, inset);
    };
    const visible = (x: number, y: number, lift: number) => {
      const wx = (x - y) * HW;
      const wy = (x + y) * HH;
      return wx + HW >= wx0 && wx - HW <= wx1 && wy + 2 * HH >= wy0 && wy - lift <= wy1;
    };
    const overlay = this.overlay;
    if (overlay === 'flood' && !this.flood) {
      this.flood = new Uint8Array(c.n);
      for (const i of floodReach(c, 120)) this.flood[i] = 1;
      for (const i of floodReach(c, 140)) if (!this.flood[i]) this.flood[i] = 2;
    }

    // Ground: terrain, lots, roads and zone tints, batched by color.
    const zoneTint: Path2D[] = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const marks = { street: new Path2D(), avenue: new Path2D(), highway: new Path2D() };
    const bridges = new Path2D();
    const flooded = new Path2D();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!visible(x, y, 0)) continue;
        const i = y * c.w + x;
        const ter = t.ter[i];
        const road = t.road[i];
        if (ter === Ter.Water) {
          let shore = false;
          for (let k = 0; k < 4; k++) {
            const nb = c.nb[i * 4 + k];
            if (nb >= 0 && t.ter[nb] !== Ter.Water) shore = true;
          }
          fill(shore ? SHORE : WATER, i);
          if (road) {
            diamond(bridges, x, y, 1, 1, 0.12);
            fill(ROAD_COLOR[road], i, 0.18);
          }
        } else if (road) {
          fill(ROAD_COLOR[road], i);
        } else if (t.bld[i] >= 0) {
          const def = BUILDING[c.s.buildings[t.bld[i]]?.type ?? 'park'];
          fill(def.cat === 'park' ? (def.id === 'plaza' ? '#e3d9c3' : '#7cc66a') : def.id === 'solar' || def.id === 'landfill' ? '#b9a98a' : '#cfcac0', i);
        } else if (t.zone[i] && t.level[i]) {
          const z = t.zone[i];
          fill(z === Zone.Res && t.level[i] <= 2 ? grass(t.elev[i], t.style[i], false) : LOT[z], i);
        } else {
          fill(ter === Ter.Sand ? SAND : ter === Ter.Rock ? ROCK : grass(t.elev[i], t.style[i], ter === Ter.Forest), i);
          if (t.zone[i]) diamond(zoneTint[t.zone[i]], x, y, 1, 1, 0.06);
        }
        if (t.flags[i] & FLAG_FLOODED) diamond(flooded, x, y);
        if (road && detail) this.roadMarks(marks, i, road);
      }
    }
    for (const [color, p] of buckets) {
      ctx.fillStyle = color;
      ctx.fill(p);
    }
    // Hairline seams between same-colored tiles.
    if (detail) {
      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 1 / this.z;
      for (const [color, p] of buckets) if (color !== WATER && color !== SHORE) ctx.stroke(p);
    }
    ctx.fillStyle = 'rgba(120,110,95,0.9)';
    ctx.fill(bridges);
    for (let z = 1; z <= 4; z++) {
      ctx.fillStyle = `${ZONE_COLOR[z]}55`;
      ctx.fill(zoneTint[z]);
      if (detail) {
        ctx.strokeStyle = `${ZONE_COLOR[z]}cc`;
        ctx.lineWidth = 1.2;
        ctx.stroke(zoneTint[z]);
      }
    }
    if (detail) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke(marks.street);
      ctx.setLineDash([]);
      ctx.strokeStyle = '#8fbf6a';
      ctx.lineWidth = 3;
      ctx.stroke(marks.avenue);
      ctx.strokeStyle = '#f2c94c';
      ctx.lineWidth = 2;
      ctx.stroke(marks.highway);
      ctx.lineCap = 'butt';
    }

    // Overlay tint on the ground.
    if (overlay) {
      const tint = new Map<string, Path2D>();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!visible(x, y, 0)) continue;
          const i = y * c.w + x;
          if (t.ter[i] === Ter.Water) continue;
          let color: string | null = null;
          if (overlay === 'traffic') {
            if (t.road[i]) color = ramp(Math.min(1, c.congestion[i] / 1.2), false);
          } else if (overlay === 'flood') {
            if (this.flood![i]) color = this.flood![i] === 1 ? '#1e63b8' : '#64a6e8';
          } else {
            const v = this.overlayValue(i);
            if (v) color = ramp(v[0], v[1]);
          }
          if (!color) continue;
          let p = tint.get(color);
          if (!p) tint.set(color, (p = new Path2D()));
          diamond(p, x, y);
        }
      }
      ctx.globalAlpha = 0.62;
      for (const [color, p] of tint) {
        ctx.fillStyle = color;
        ctx.fill(p);
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(40,120,210,0.5)';
    ctx.fill(flooded);

    const tObj = performance.now();
    this.stats.ground = tObj - tStart;
    // Objects, back to front along diagonals.
    const o: DrawOpts = { detail, india: c.s.settings.region === 'india', squash: overlay ? 0.3 : 1 };
    const sMin = x0 + y0;
    const sMax = x1 + y1;
    for (let s = sMin; s <= sMax; s++) {
      const xa = Math.max(x0, s - y1);
      const xb = Math.min(x1, s - y0);
      for (let x = xa; x <= xb; x++) {
        const y = s - x;
        const i = y * c.w + x;
        if (t.bld[i] >= 0) {
          const b = c.s.buildings[t.bld[i]];
          if (!b) continue;
          const def = BUILDING[b.type];
          if (x !== b.x + def.w - 1 || y !== b.y + def.h - 1) continue;
          if (!visible(b.x + def.w / 2, b.y + def.h / 2, MAX_LIFT)) continue;
          o.tint = undefined;
          drawService(octx, b, o);
          continue;
        }
        if (!visible(x, y, MAX_LIFT)) continue;
        if (t.zone[i] && t.level[i]) {
          const v = overlay ? this.overlayValue(i) : null;
          o.tint = v ? ramp(v[0], v[1]) : undefined;
          drawZoneBuilding(octx, x, y, t.zone[i], t.level[i], t.style[i], (t.flags[i] & FLAG_ABANDONED) !== 0, o);
          if (t.flags[i] & FLAG_FIRE) {
            const [cx, cy] = iso(x + 0.5, y + 0.5);
            octx.fillStyle = 'rgba(40,30,25,0.55)';
            octx.beginPath();
            octx.ellipse(cx, cy, 22, 11, 0, 0, Math.PI * 2);
            octx.fill();
          }
          continue;
        }
        if (t.trees[i] && !t.road[i] && !overlay) {
          const n = t.trees[i];
          for (let k = 0; k < n; k++) {
            const h = hash(i, k);
            const tx = x + 0.2 + ((h & 255) / 255) * 0.6;
            const ty = y + 0.2 + (((h >> 8) & 255) / 255) * 0.6;
            const color = ['#3f8f3a', '#4ea845', '#2f7a3a', '#5aa64a'][(h >> 16) & 3];
            tree(octx, tx, ty, detail ? 4.5 + ((h >> 20) & 3) : 5, color, detail);
          }
        }
      }
    }
    this.stats.objects = performance.now() - tObj;
  }

  private roadMarks(m: { street: Path2D; avenue: Path2D; highway: Path2D }, i: number, road: number): void {
    const c = this.city;
    const x = c.x(i);
    const y = c.y(i);
    const [cx, cy] = iso(x + 0.5, y + 0.5);
    const p = road === Road.Highway ? m.highway : road === Road.Avenue ? m.avenue : m.street;
    let any = false;
    for (let k = 0; k < 4; k++) {
      const nb = c.nb[i * 4 + k];
      if (nb < 0 || !c.s.tiles.road[nb]) continue;
      any = true;
      const [ex, ey] = iso(x + 0.5 + [0.5, 0, -0.5, 0][k], y + 0.5 + [0, 0.5, 0, -0.5][k]);
      p.moveTo(cx, cy);
      p.lineTo(ex, ey);
    }
    if (!any) {
      p.moveTo(cx - 4, cy);
      p.lineTo(cx + 4, cy);
    }
  }

  // --- Flat map (far zoom and minimap) ---------------------------------------

  tileColor(i: number): [number, number, number] {
    const c = this.city;
    const t = c.s.tiles;
    const hex = rgbOf;
    if (this.overlay && this.overlay !== 'flood' && this.overlay !== 'traffic' && t.ter[i] !== Ter.Water) {
      const v = this.overlayValue(i);
      if (v) return hex(ramp(v[0], v[1]));
    }
    if (this.overlay === 'traffic' && t.road[i]) return hex(ramp(Math.min(1, c.congestion[i] / 1.2), false));
    if (t.flags[i] & FLAG_FLOODED) return [70, 140, 220];
    if (t.road[i]) return hex(ROAD_COLOR[t.road[i]]);
    if (t.ter[i] === Ter.Water) return hex(WATER);
    if (t.bld[i] >= 0) {
      const b = c.s.buildings[t.bld[i]];
      return hex(b ? BUILDING[b.type].cat === 'park' ? '#5fbf5a' : BUILDING[b.type].color : '#cccccc');
    }
    if (t.zone[i]) {
      const base = hex(ZONE_COLOR[t.zone[i]]);
      const lv = t.level[i];
      const f = lv ? 0.15 + lv * 0.12 : 0.55;
      const mixTo = lv ? [60, 60, 70] : [190, 215, 170];
      return [0, 1, 2].map((k) => Math.round(base[k] * (1 - f) + mixTo[k] * f)) as [number, number, number];
    }
    if (t.ter[i] === Ter.Sand) return hex(SAND);
    if (t.ter[i] === Ter.Rock) return hex(ROCK);
    const g = hex(grass(t.elev[i], t.style[i], t.ter[i] === Ter.Forest));
    return t.trees[i] > 1 ? [g[0] - 30, g[1] - 25, g[2] - 30] : g;
  }

  private paintMap(): void {
    const t0 = performance.now();
    const c = this.city;
    const ctx = this.mapImg.getContext('2d')!;
    const img = ctx.createImageData(c.w, c.h);
    for (let i = 0; i < c.n; i++) {
      const [r, g, b] = this.tileColor(i);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapDirty = false;
    this.stats.map = performance.now() - t0;
  }

  get map(): HTMLCanvasElement {
    if (this.mapDirty) this.paintMap();
    return this.mapImg;
  }

  private drawFlat(): void {
    const { ctx, dpr, z } = this;
    ctx.save();
    ctx.setTransform(z * HW * dpr, z * HH * dpr, -z * HW * dpr, z * HH * dpr, (this.W / 2 - this.cx * z) * dpr, (this.H / 2 - this.cy * z) * dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapImg, 0, 0);
    ctx.restore();
  }

  // --- Live layer: traffic, fires, rotors, cursor and previews -----------------

  private drawLive(now: number): void {
    const { ctx, dpr, z } = this;
    const c = this.city;
    const t = c.s.tiles;
    ctx.save();
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.W / 2 - this.cx * z), dpr * (this.H / 2 - this.cy * z));
    const [wx0, wy0] = this.toWorld(0, 0);
    const [wx1, wy1] = this.toWorld(this.W, this.H);
    const [x0, y0, x1, y1] = this.range(wx0, wy0, wx1, wy1 + MAX_LIFT);
    const sec = now / 1000;
    const near = z >= 0.45;

    if (z >= FAR) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * c.w + x;
          if (t.flags[i] & FLAG_FIRE) this.flame(x, y, sec, i);
        }
      }
      // Wind turbine rotors.
      for (const b of Object.values(c.s.buildings)) {
        if (b.type !== 'wind') continue;
        if (b.x < x0 - 1 || b.x > x1 + 1 || b.y < y0 - 1 || b.y > y1 + 1) continue;
        const [cx, cy] = iso(b.x + 0.5, b.y + 0.5);
        const hy = cy - BUILDING.wind.height * UNIT;
        const a0 = this.running ? sec * 2.2 + b.id : b.id;
        ctx.strokeStyle = '#f7f9fb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = a0 + (k * Math.PI * 2) / 3;
          ctx.moveTo(cx, hy);
          ctx.lineTo(cx + Math.cos(a) * 16, hy + Math.sin(a) * 16);
        }
        ctx.stroke();
      }
      // Blinking "no power" badges on developed lots.
      if (near && !this.overlay && Math.floor(sec * 1.5) % 2 === 0) {
        let k = 0;
        ctx.fillStyle = '#f9a825';
        for (let y = y0; y <= y1 && k < 300; y++) {
          for (let x = x0; x <= x1; x++) {
            const i = y * c.w + x;
            if (!t.level[i] || t.flags[i] & (FLAG_POWER | FLAG_ABANDONED)) continue;
            const [cx, cy] = iso(x + 0.5, y + 0.5);
            const top = cy - 26;
            ctx.beginPath();
            ctx.moveTo(cx + 1, top - 7);
            ctx.lineTo(cx - 4, top + 1);
            ctx.lineTo(cx, top + 1);
            ctx.lineTo(cx - 1, top + 7);
            ctx.lineTo(cx + 4, top - 1);
            ctx.lineTo(cx, top - 1);
            ctx.closePath();
            ctx.fill();
            k++;
          }
        }
      }
    }

    // Placement radius.
    if (this.radius) {
      const [cx, cy] = iso(this.radius.x, this.radius.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2 / z;
      ctx.setLineDash([8 / z, 6 / z]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, this.radius.r * HW * Math.SQRT2, this.radius.r * HH * Math.SQRT2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Selection and hover.
    if (this.selected.length) {
      const p = new Path2D();
      for (const i of this.selected) diamond(p, c.x(i), c.y(i));
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill(p);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / z;
      ctx.stroke(p);
    }
    if (this.hover >= 0 && !this.preview) {
      const p = new Path2D();
      diamond(p, c.x(this.hover), c.y(this.hover));
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5 / z;
      ctx.stroke(p);
    }

    // Tool preview.
    const pv = this.preview;
    if (pv) {
      const p = new Path2D();
      for (const i of pv.tiles) diamond(p, c.x(i), c.y(i));
      let color = pv.ok ? 'rgba(80,200,120,0.45)' : 'rgba(230,70,60,0.45)';
      if (pv.ok && pv.kind === 'zone' && pv.zone) color = `${ZONE_COLOR[pv.zone]}88`;
      if (pv.ok && pv.kind === 'road') color = 'rgba(90,95,105,0.75)';
      if (pv.kind === 'bulldoze') color = 'rgba(230,90,60,0.4)';
      ctx.fillStyle = color;
      ctx.fill(p);
      ctx.strokeStyle = pv.ok ? 'rgba(255,255,255,0.85)' : 'rgba(255,200,200,0.9)';
      ctx.lineWidth = 1.2 / z;
      ctx.stroke(p);
      if (pv.building && z >= FAR) {
        ctx.globalAlpha = pv.ok ? 0.8 : 0.45;
        drawService(ctx, { id: 0, type: pv.building.type, x: pv.building.x, y: pv.building.y, built: 0 }, { detail: true, india: false, squash: 1 });
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /** Cars between the ground and building layers, so buildings hide them. */
  private drawTraffic(now: number): void {
    const { ctx, dpr, z } = this;
    if (z < 0.45 || this.overlay) return;
    const c = this.city;
    const t = c.s.tiles;
    ctx.save();
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.W / 2 - this.cx * z), dpr * (this.H / 2 - this.cy * z));
    const [wx0, wy0] = this.toWorld(0, 0);
    const [wx1, wy1] = this.toWorld(this.W, this.H);
    const [x0, y0, x1, y1] = this.range(wx0, wy0, wx1, wy1);
    const sec = now / 1000;
    const colors = ['#e74c3c', '#f1c40f', '#ecf0f1', '#3498db', '#2c3e50', '#e67e22', '#95a5a6'];
    let cars = 0;
    for (let y = y0; y <= y1 && cars < 1200; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * c.w + x;
        if (!t.road[i] || c.flow[i] < 40) continue;
        const n = Math.min(t.road[i] === Road.Street ? 2 : 4, Math.ceil(c.flow[i] / 300));
        const ew = t.road[c.nb[i * 4]] || t.road[c.nb[i * 4 + 2]];
        const ns = t.road[c.nb[i * 4 + 1]] || t.road[c.nb[i * 4 + 3]];
        const speed = (this.running ? 0.6 : 0) / (1 + c.congestion[i] * 1.5);
        for (let k = 0; k < n; k++) {
          const h = hash(i, k + 7);
          const alongX = !!ew && (!ns || k % 2 === 0);
          const dir = (k >> 1) % 2 === 0 ? 1 : -1;
          let u = ((h & 1023) / 1023 + sec * speed * dir) % 1;
          if (u < 0) u += 1;
          const lane = dir * 0.14;
          const [sx, sy] = iso(alongX ? x + u : x + 0.5 + lane, alongX ? y + 0.5 + lane : y + u);
          ctx.fillStyle = colors[(h >>> 10) % colors.length];
          ctx.fillRect(sx - 2, sy - 2, 4, 3);
          cars++;
        }
      }
    }
    ctx.restore();
  }

  private flame(x: number, y: number, sec: number, i: number): void {
    const ctx = this.ctx;
    const [cx, cy] = iso(x + 0.5, y + 0.5);
    const f = Math.sin(sec * 9 + i) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(255,${120 + f * 80},40,0.9)`;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 10);
    ctx.quadraticCurveTo(cx - 6, cy - 34 - f * 8, cx, cy - 46 - f * 10);
    ctx.quadraticCurveTo(cx + 6, cy - 34 - f * 8, cx + 10, cy - 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(90,90,90,0.35)';
    ctx.beginPath();
    ctx.arc(cx + 6 + f * 4, cy - 56 - f * 12, 9 + f * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
