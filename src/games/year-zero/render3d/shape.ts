// The shape of the 3D world, shared by the terrain, rivers, props, cities and
// units so everything stands on the same ground. One hex has a corner radius
// of 1 world unit; tile centres come from Grid.center(i, 1), so x/z in the 3D
// scene are the old 2D map's pixel coordinates divided by HEX.

import { Color } from 'three';
import type { Grid } from '../core/hex';
import { Noise2D } from '../../shared/noise';
import { Rng } from '../../shared/rng';
import { F, Relief, T } from '../data/terrain';
import type { WorldMap } from '../sim/state';

export const LAND_Y = 0.12;
export const WATER_Y = 0;
export const ICE_Y = 0.07;
/** Fraction of the radius covered by the flat top before the bevel to the tile edge. */
export const TOP_R = 0.93;
export const BEVEL = 0.035;
export const SQ3 = Math.sqrt(3);

/** Edge normals of a pointy-top hex in x/z, in the Grid's direction order (E, NE, NW, W, SW, SE). */
export const EDGE_N: [number, number][] = [0, 1, 2, 3, 4, 5].map((d) => [Math.cos((-60 * d * Math.PI) / 180), Math.sin((-60 * d * Math.PI) / 180)]);
/** Corners (x, z) of a unit pointy-top hex, matching core/hex CORNERS. */
export const CORNER: [number, number][] = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos(((60 * k - 30) * Math.PI) / 180), Math.sin(((60 * k - 30) * Math.PI) / 180)]);

/** 0 at the centre, 1 on every edge of a unit hex. */
export function hexDist(x: number, z: number): number {
  let m = 0;
  for (let d = 0; d < 3; d++) m = Math.max(m, Math.abs(x * EDGE_N[d][0] + z * EDGE_N[d][1]));
  return m / (SQ3 / 2);
}

export function tileHash(i: number, salt = 0): number {
  let x = (i * 2654435761 + salt * 40503) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const C = (hex: string) => new Color(hex);
export const BIOME = {
  grass: C('#7ccb43'),
  grass2: C('#9fd84c'),
  plains: C('#c3cc55'),
  plains2: C('#dcc85e'),
  desert: C('#f0d595'),
  desert2: C('#e8c17e'),
  tundra: C('#a5b796'),
  snow: C('#f2f6fb'),
  forest: C('#5fa63a'),
  jungle: C('#3f9a3e'),
  marsh: C('#78a85a'),
  flood: C('#96d653'),
  ash: C('#6d5a50'),
  rock: C('#a39486'),
  rock2: C('#8d8075'),
  sand: C('#efdca2'),
  ice: C('#e6f3fb'),
  cliff: C('#9b7a55'),
  cliffDark: C('#6a5238'),
};

interface RiverSeg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface RiverPath {
  /** Smoothed points (x, z). */
  pts: [number, number][];
  /** Width at each point. */
  width: number[];
  /** Ends in the sea or a lake (fade into the water). */
  mouth: boolean;
}

export class Shape {
  readonly map: WorldMap;
  readonly grid: Grid;
  private noise: Noise2D;
  private noise2: Noise2D;
  /** Per tile: river segments passing through it (for flattening hills under the water). */
  private riverSegs = new Map<number, RiverSeg[]>();
  readonly rivers: RiverPath[] = [];
  /** Per tile: bumps for hills [x, z, radius, height] in local coordinates. */
  private bumps = new Map<number, [number, number, number, number][]>();
  readonly centers: Float32Array;

  constructor(map: WorldMap, grid: Grid) {
    this.map = map;
    this.grid = grid;
    const seed = map.w * 7919 + map.h * 104729 + map.terrain.length;
    this.noise = new Noise2D(new Rng(seed));
    this.noise2 = new Noise2D(new Rng(seed ^ 0x5bd1e995));
    this.centers = new Float32Array(map.w * map.h * 2);
    for (let i = 0; i < map.w * map.h; i++) {
      const [x, z] = grid.center(i, 1);
      this.centers[i * 2] = x;
      this.centers[i * 2 + 1] = z;
    }
    this.buildRivers();
    for (let i = 0; i < map.w * map.h; i++) this.makeBumps(i);
  }

  cx(i: number): number {
    return this.centers[i * 2];
  }

  cz(i: number): number {
    return this.centers[i * 2 + 1];
  }

  isWater(i: number): boolean {
    return this.map.terrain[i] <= T.Lake;
  }

  /** Water tiles carrying ice floes are drawn as ice sheets. */
  isIce(i: number): boolean {
    return this.isWater(i) && this.map.feature[i] === F.Ice;
  }

  private makeBumps(i: number): void {
    const map = this.map;
    if (this.isWater(i)) return;
    const relief = map.relief[i];
    const out: [number, number, number, number][] = [];
    const h = (k: number) => tileHash(i, 50 + k);
    if (relief === Relief.Hills) {
      const n = 2 + Math.floor(h(0) * 2);
      const a0 = h(1) * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const a = a0 + (k * Math.PI * 2) / n + (h(k + 2) - 0.5) * 0.6;
        const r = n === 1 ? 0 : 0.3 + h(k + 5) * 0.12;
        out.push([Math.cos(a) * r, Math.sin(a) * r, 0.36 + h(k + 8) * 0.12, 0.16 + h(k + 11) * 0.09]);
      }
    } else if (relief === Relief.Mountain) {
      out.push([0, 0, 0.62, 0.16]);
    } else if (map.terrain[i] === T.Desert && map.feature[i] === F.None) {
      // dunes
      const a0 = h(1) * Math.PI * 2;
      for (let k = 0; k < 2; k++) out.push([Math.cos(a0 + k * 3) * 0.35, Math.sin(a0 + k * 3) * 0.35, 0.34, 0.05]);
    }
    if (out.length) this.bumps.set(i, out);
  }

  /** Ground height at world (x, z) inside tile i. */
  height(i: number, x: number, z: number): number {
    if (i < 0) return WATER_Y;
    if (this.isWater(i)) return this.isIce(i) ? ICE_Y : WATER_Y;
    const lx = x - this.cx(i);
    const lz = z - this.cz(i);
    const hd = hexDist(lx, lz);
    let y = LAND_Y;
    // gentle undulation everywhere, fading out toward the tile rim so neighbours meet
    const edge = 1 - smoothstep(0.55, 0.92, hd);
    y += this.noise.fbm(x * 0.9, z * 0.9, 2) * 0.018 * edge;
    const bumps = this.bumps.get(i);
    if (bumps) {
      let amp = 1;
      const segs = this.riverSegs.get(i);
      if (segs) amp *= smoothstep(0.12, 0.42, this.riverDist(segs, x, z));
      let b = 0;
      for (const [bx, bz, br, bh] of bumps) {
        const d = Math.hypot(lx - bx, lz - bz) / br;
        if (d < 1.6) b = Math.max(b, bh * Math.exp(-d * d * 1.6));
      }
      b += this.noise2.fbm(x * 2.2, z * 2.2, 2) * 0.02 * Math.min(1, b * 8);
      y += b * edge * amp;
    }
    return y;
  }

  /** Ground height without knowing the tile. */
  heightAt(x: number, z: number): number {
    return this.height(this.grid.pick(x, z, 1), x, z);
  }

  /** Normal (x, y, z) of the ground at a point, by central differences. */
  normal(i: number, x: number, z: number): [number, number, number] {
    const e = 0.04;
    const dx = this.height(i, x + e, z) - this.height(i, x - e, z);
    const dz = this.height(i, x, z + e) - this.height(i, x, z - e);
    const nx = -dx / (2 * e);
    const nz = -dz / (2 * e);
    const l = Math.hypot(nx, 1, nz);
    return [nx / l, 1 / l, nz / l];
  }

  /** Distance from (x, z) to the nearest river centre line in tile i (Infinity if none). */
  riverDistance(i: number, x: number, z: number): number {
    const segs = this.riverSegs.get(i);
    return segs ? this.riverDist(segs, x, z) : Infinity;
  }

  private riverDist(segs: RiverSeg[], x: number, z: number): number {
    let best = Infinity;
    for (const s of segs) {
      const vx = s.bx - s.ax;
      const vz = s.bz - s.az;
      const l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / l2));
      const d = Math.hypot(x - (s.ax + vx * t), z - (s.az + vz * t));
      if (d < best) best = d;
    }
    return best;
  }

  /** Biome colour of the ground at a point (before lighting). */
  groundColor(i: number, x: number, z: number, out: Color): Color {
    const map = this.map;
    const t = map.terrain[i];
    const f = map.feature[i];
    const relief = map.relief[i];
    const n = this.noise2.fbm(x * 0.55, z * 0.55, 3);
    const n2 = this.noise.fbm(x * 2.6 + 11, z * 2.6 - 7, 2);
    if (this.isIce(i)) return out.copy(BIOME.ice).offsetHSL(0, 0, n2 * 0.04);
    switch (t) {
      case T.Grass: out.copy(BIOME.grass).lerp(BIOME.grass2, 0.5 + n * 0.9); break;
      case T.Plains: out.copy(BIOME.plains).lerp(BIOME.plains2, 0.5 + n * 0.9); break;
      case T.Desert: out.copy(BIOME.desert).lerp(BIOME.desert2, 0.4 + n * 0.8); break;
      case T.Tundra: out.copy(BIOME.tundra).offsetHSL(0, 0, n * 0.05); break;
      case T.Snow: out.copy(BIOME.snow).offsetHSL(0, 0, n * 0.03); break;
      default: out.copy(BIOME.grass);
    }
    if (f === F.Forest && t !== T.Snow) out.lerp(t === T.Tundra ? BIOME.tundra : BIOME.forest, 0.55);
    else if (f === F.Jungle) out.lerp(BIOME.jungle, 0.75);
    else if (f === F.Marsh) out.lerp(BIOME.marsh, 0.7);
    else if (f === F.Floodplain) out.lerp(BIOME.flood, 0.6);
    else if (f === F.Ash || f === F.Volcano) out.lerp(BIOME.ash, 0.85);
    else if (f === F.Oasis) out.lerp(BIOME.grass, 0.25);
    const lx = x - this.cx(i);
    const lz = z - this.cz(i);
    const hd = hexDist(lx, lz);
    if (relief === Relief.Mountain) {
      const rock = 1 - smoothstep(0.45, 0.85, hd);
      out.lerp(BIOME.rock, rock * 0.85);
    } else if (relief === Relief.Hills) {
      // lighter, sunnier tops
      const y = this.height(i, x, z) - LAND_Y;
      out.offsetHSL(0, 0.02, Math.min(0.06, y * 0.35));
    }
    // sandy beaches on edges that meet the water
    if (t !== T.Snow && t !== T.Tundra && f !== F.Marsh && hd > 0.6) {
      let beach = 0;
      for (let d = 0; d < 6; d++) {
        const nb = this.grid.neighbor(i, d);
        if (nb < 0 || !this.isWater(nb) || this.isIce(nb)) continue;
        const e = 1 - (lx * EDGE_N[d][0] + lz * EDGE_N[d][1]) / (SQ3 / 2);
        beach = Math.max(beach, 1 - smoothstep(0.08, 0.2 + n2 * 0.06, e));
      }
      if (beach > 0) out.lerp(t === T.Desert ? BIOME.desert2 : BIOME.sand, beach * 0.9);
    }
    // river banks are lusher
    const rd = this.riverDistance(i, x, z);
    if (rd < 0.45 && t !== T.Snow) out.lerp(BIOME.flood, (1 - smoothstep(0.15, 0.45, rd)) * 0.35);
    out.offsetHSL(0, 0, n2 * 0.025);
    return out;
  }

  // --- Rivers --------------------------------------------------------------------------

  private buildRivers(): void {
    const map = this.map;
    const grid = this.grid;
    const n = map.w * map.h;
    const incoming = new Int32Array(n);
    for (let i = 0; i < n; i++) if (map.river[i] > 0 && map.riverTo[i] >= 0) incoming[map.riverTo[i]]++;
    const visited = new Uint8Array(n);
    const sources: number[] = [];
    for (let i = 0; i < n; i++) if (map.river[i] > 0 && !this.isWater(i) && incoming[i] === 0) sources.push(i);
    // Longest (largest flow) rivers first so tributaries join them.
    sources.sort((a, b) => this.flowLength(b) - this.flowLength(a));
    const edgeMid = (a: number, b: number, k: number): [number, number] => {
      const mx = (this.cx(a) + this.cx(b)) / 2;
      const mz = (this.cz(a) + this.cz(b)) / 2;
      // slide along the shared edge a little for a meander
      const ex = -(this.cz(b) - this.cz(a));
      const ez = this.cx(b) - this.cx(a);
      const l = Math.hypot(ex, ez) || 1;
      const s = (tileHash(Math.min(a, b) * 31 + Math.max(a, b), k) - 0.5) * 0.5;
      return [mx + (ex / l) * s, mz + (ez / l) * s];
    };
    for (const src of sources) {
      const ctrl: [number, number][] = [[this.cx(src), this.cz(src)]];
      const flows: number[] = [map.river[src]];
      let cur = src;
      let mouth = false;
      let guard = 0;
      visited[src] = 1;
      while (guard++ < 400) {
        const nx = map.riverTo[cur];
        if (nx < 0) break;
        if (this.isWater(nx)) {
          const m = edgeMid(cur, nx, 1);
          ctrl.push(m);
          // a short way into the water so the river meets the sea
          ctrl.push([m[0] + (this.cx(nx) - m[0]) * 0.35, m[1] + (this.cz(nx) - m[1]) * 0.35]);
          flows.push(map.river[cur], map.river[cur]);
          mouth = true;
          break;
        }
        ctrl.push(edgeMid(cur, nx, 1));
        flows.push((map.river[cur] + map.river[nx]) / 2);
        ctrl.push([this.cx(nx), this.cz(nx)]);
        flows.push(map.river[nx]);
        if (visited[nx]) break;
        visited[nx] = 1;
        cur = nx;
      }
      if (ctrl.length < 2) continue;
      const pts: [number, number][] = [];
      const width: number[] = [];
      // Catmull-Rom through the control points.
      for (let k = 0; k < ctrl.length - 1; k++) {
        const p0 = ctrl[Math.max(0, k - 1)];
        const p1 = ctrl[k];
        const p2 = ctrl[k + 1];
        const p3 = ctrl[Math.min(ctrl.length - 1, k + 2)];
        const steps = 6;
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const t2 = t * t;
          const t3 = t2 * t;
          const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
          pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
          const fl = flows[k] + (flows[k + 1] - flows[k]) * t;
          width.push(0.13 + Math.min(0.2, Math.log2(1 + fl) * 0.045));
        }
      }
      pts.push(ctrl[ctrl.length - 1]);
      width.push(width[width.length - 1]);
      // the source starts thin
      for (let k = 0; k < Math.min(6, width.length); k++) width[k] *= 0.45 + (k / 6) * 0.55;
      this.rivers.push({ pts, width, mouth });
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k];
        const [bx, bz] = pts[k + 1];
        const ti = grid.pick((ax + bx) / 2, (az + bz) / 2, 1);
        for (const t of ti >= 0 ? [ti, ...grid.neighborList(ti)] : []) {
          let list = this.riverSegs.get(t);
          if (!list) this.riverSegs.set(t, (list = []));
          list.push({ ax, az, bx, bz });
        }
      }
    }
  }

  private flowLength(i: number): number {
    let c = i;
    let k = 0;
    while (c >= 0 && k < 400 && this.map.river[c] > 0) {
      c = this.map.riverTo[c];
      k++;
    }
    return k;
  }
}
