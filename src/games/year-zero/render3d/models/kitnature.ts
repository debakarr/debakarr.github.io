// Nature and tile-improvement models built from the KayKit kit (CC0), recoloured
// per biome, plus hand-made broadleaf trees and bushes in the same faceted,
// gradient-shaded style so mixed forests read as one art set.
//
// KayKit hexes have a corner radius of 1.155; ours have 1, hence HEXK.

import { BufferAttribute, BufferGeometry, Color } from 'three';
import { Noise2D } from '../../../shared/noise';
import { Rng } from '../../../shared/rng';
import { CELL, kitGeo, type Recolor } from '../kit';
import { cylinder, faceted, gradient, ico, lumpy, merge, part, prep, xf } from '../geo';

export const HEXK = 1 / 1.155;

export type Biome = 'temperate' | 'plains' | 'tundra' | 'snow' | 'desert' | 'jungle' | 'marsh';

/** Ground, conifer and rock colours per biome. */
const PAL: Record<Biome, { grass: string; conifer: string; rock: string; rockDark: string }> = {
  temperate: { grass: '#7fc24a', conifer: '#2f8a4a', rock: '#a59d94', rockDark: '#7e766e' },
  plains: { grass: '#b9c35a', conifer: '#3b8a43', rock: '#ab9f8e', rockDark: '#857868' },
  tundra: { grass: '#9fb18c', conifer: '#2a6e52', rock: '#9aa0a6', rockDark: '#767d85' },
  snow: { grass: '#e9f0f6', conifer: '#2d6a55', rock: '#a9b2bd', rockDark: '#838c98' },
  desert: { grass: '#e7c983', conifer: '#4f8a43', rock: '#c9a476', rockDark: '#a7835a' },
  jungle: { grass: '#5cae3c', conifer: '#2a7a3a', rock: '#8f948a', rockDark: '#6d7268' },
  marsh: { grass: '#82a85a', conifer: '#33704a', rock: '#8f948a', rockDark: '#6d7268' },
};

function recolor(b: Biome, extra: Partial<Record<number, string>> = {}): Recolor {
  const p = PAL[b];
  return { cells: { [CELL.grass]: p.grass, [CELL.leaves]: p.conifer, [CELL.rockLight]: p.rock, [CELL.rockMid]: p.rockDark, [CELL.rockDark]: p.rockDark, ...extra } };
}

/** A kit model recoloured for a biome, cloned and transformed (caller owns it). */
export function kit(name: string, biome: Biome = 'temperate', t: { s?: number; p?: [number, number, number]; r?: [number, number, number] } = {}, extra?: Partial<Record<number, string>>): BufferGeometry {
  const key = `${biome}${extra ? JSON.stringify(extra) : ''}`;
  return xf(kitGeo(name, recolor(biome, extra), key).clone(), t);
}

/** Paints the upward-facing top of a model white (snowy peaks and pines). */
export function snowCap(geo: BufferGeometry, from: number, color = '#f4f8fb'): BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const span = bb.max.y - bb.min.y;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = geo.attributes.color;
  const c = new Color(color);
  const tmp = new Color();
  for (let i = 0; i < pos.count; i++) {
    const h = (pos.getY(i) - bb.min.y) / span;
    const t = Math.max(0, Math.min(1, (h - from) / 0.08)) * Math.max(0, Math.min(1, (nor.getY(i) + 0.15) * 1.6));
    if (t <= 0) continue;
    tmp.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(c, t);
    col.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  col.needsUpdate = true;
  return geo;
}

// --- trees -----------------------------------------------------------------------------------------

/** KayKit conifer (A: slim and pointed, B: round tiers), sized for the map. */
export function conifer(kind: 'A' | 'B', biome: Biome, snow = false): BufferGeometry {
  const g = kit(`tree_single_${kind}`, biome, { s: 0.36 });
  return snow ? snowCap(g, 0.45) : g;
}

/** A whole-hex KayKit forest clump. */
export function forestClump(kind: 'A' | 'B', size: 'small' | 'medium' | 'large', biome: Biome, snow = false): BufferGeometry {
  const g = kit(`trees_${kind}_${size}`, biome, { s: HEXK * 0.62 });
  return snow ? snowCap(g, 0.5) : g;
}

const LEAF: Record<string, [string, string]> = {
  green: ['#3f8f2f', '#a8d65a'],
  fresh: ['#56a83a', '#c4e46a'],
  olive: ['#5d8f2c', '#b9cc58'],
  deep: ['#2e7a2e', '#7fbd45'],
  autumn: ['#c0602a', '#f4bc4a'],
  gold: ['#c99a2c', '#f5dc6a'],
  blossom: ['#e58fb0', '#ffd6e6'],
  jungle: ['#1f7a34', '#62b445'],
};

/** Faceted broadleaf tree: a short trunk with a crown of three to five low-poly lobes. */
export function broadleaf(seed: number, leaf: keyof typeof LEAF = 'green', tall = false): BufferGeometry {
  const rng = new Rng(seed);
  const trunkH = tall ? 0.16 : rng.float(0.09, 0.12);
  const parts: BufferGeometry[] = [part(cylinder(0.016, 0.026, trunkH + 0.06, 6), '#7a5232', { p: [0, (trunkH + 0.06) / 2, 0] })];
  // a couple of branch stubs
  for (let k = 0; k < 2; k++) {
    const a = rng.float(0, Math.PI * 2);
    parts.push(part(cylinder(0.006, 0.01, 0.07, 5), '#6a4529', { p: [Math.cos(a) * 0.022, trunkH + 0.015, Math.sin(a) * 0.022], r: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7] }));
  }
  const [low, high] = LEAF[leaf];
  const lobes = tall ? 3 : rng.range(3, 5);
  const crownY = trunkH + (tall ? 0.15 : 0.1);
  for (let k = 0; k < lobes; k++) {
    const main = k === 0;
    const r = main ? (tall ? 0.085 : 0.11) : rng.float(0.06, 0.085);
    const a = (k / lobes) * Math.PI * 2 + rng.float(-0.4, 0.4);
    const off = main ? 0 : rng.float(0.06, 0.09);
    let g = ico(r, 1);
    g.scale(1, tall ? 1.9 : rng.float(0.82, 0.95), 1);
    g = lumpy(g, r * 0.18, 9, seed * 7 + k);
    g = faceted(g);
    xf(g, { p: [Math.cos(a) * off, crownY + (main ? (tall ? 0.06 : 0.035) : rng.float(-0.03, 0.02)) + (tall && !main ? 0.05 * k : 0), Math.sin(a) * off] });
    parts.push(gradient(g, low, high, { jitter: 0.035, seed: seed + k }));
  }
  return merge(parts);
}

/** Low faceted shrub. */
export function shrub(seed: number, leaf: keyof typeof LEAF = 'green', berries = false): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [];
  const n = rng.range(2, 4);
  const [low, high] = LEAF[leaf];
  for (let k = 0; k < n; k++) {
    const r = rng.float(0.035, 0.055);
    let g = ico(r, 1);
    g.scale(1, 0.78, 1);
    g = faceted(lumpy(g, r * 0.2, 12, seed + k));
    const a = rng.float(0, Math.PI * 2);
    xf(g, { p: [Math.cos(a) * 0.035 * (k ? 1 : 0), r * 0.62, Math.sin(a) * 0.035 * (k ? 1 : 0)] });
    parts.push(gradient(g, low, high, { jitter: 0.04, seed: seed + k }));
  }
  if (berries) for (let k = 0; k < 5; k++) {
    const a = rng.float(0, Math.PI * 2);
    parts.push(part(ico(0.008, 0), '#e8384a', { p: [Math.cos(a) * 0.045, rng.float(0.03, 0.06), Math.sin(a) * 0.045] }));
  }
  return merge(parts);
}

// --- rocks, hills and mountains ---------------------------------------------------------------------

export function rockKit(letter: 'A' | 'B' | 'C' | 'D' | 'E', biome: Biome, s = 0.75): BufferGeometry {
  return kit(`rock_single_${letter}`, biome, { s });
}

/** KayKit mountain (A: spires, B: mesa, C: stepped), grassy or bare, sized to fill most of a hex. */
export function mountainKit(letter: 'A' | 'B' | 'C', biome: Biome, opts: { grass?: boolean; trees?: boolean; snow?: number } = {}): BufferGeometry {
  const name = `mountain_${letter}${opts.grass ? '_grass' : ''}${opts.grass && opts.trees ? '_trees' : ''}`;
  const g = kit(name, biome, { s: HEXK * 0.98 });
  g.scale(1, 0.86, 1);
  return opts.snow !== undefined ? snowCap(g, opts.snow) : g;
}

/**
 * A faceted mountain massif: two to four jagged peaks over a grassy foot,
 * with stratified rock and (optionally) snow above a line. Sized to fill a hex.
 */
export function peak(seed: number, biome: Biome, snow: number | null): BufferGeometry {
  const rng = new Rng(seed);
  const noise = new Noise2D(new Rng(seed * 31 + 7));
  const peaks: [number, number, number, number][] = [];
  const n = rng.range(2, 4);
  for (let k = 0; k < n; k++) {
    const main = k === 0;
    const a = rng.float(0, Math.PI * 2);
    const d = main ? rng.float(0, 0.12) : rng.float(0.28, 0.5);
    peaks.push([Math.cos(a) * d, Math.sin(a) * d, main ? rng.float(0.78, 0.92) : rng.float(0.42, 0.62), main ? 0.78 : rng.float(0.42, 0.55)]);
  }
  const R = 0.9;
  const RINGS = 7;
  const SEG = 18;
  const height = (x: number, z: number): number => {
    let h = 0;
    for (const [px, pz, ph, pr] of peaks) {
      const d = Math.hypot(x - px, z - pz) / pr;
      if (d < 1) h = Math.max(h, ph * Math.pow(1 - d, 1.25));
    }
    const r = Math.hypot(x, z) / R;
    const ridge = 1 - Math.abs(noise.get(x * 4.2, z * 4.2));
    h += (ridge - 0.5) * 0.08 * Math.min(1, h * 3);
    return Math.max(0, h * (1 - Math.pow(Math.min(1, r), 6)));
  };
  // a polar grid with a jittered rim so the foot is not a perfect circle
  const pts: [number, number, number][][] = [];
  for (let i = 0; i <= RINGS; i++) {
    const ring: [number, number, number][] = [];
    const rr = (i / RINGS) * R;
    const segs = i === 0 ? 1 : SEG;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2 + (i % 2) * (Math.PI / segs);
      const jr = i === RINGS ? rr * (0.92 + 0.12 * noise.get(Math.cos(a) * 2 + seed, Math.sin(a) * 2)) : rr * (1 + rng.float(-0.05, 0.05));
      const x = Math.cos(a) * jr;
      const z = Math.sin(a) * jr;
      ring.push([x, i === RINGS ? -0.02 : height(x, z), z]);
    }
    pts.push(ring);
  }
  const pos: number[] = [];
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => pos.push(...a, ...c, ...b);
  for (let i = 1; i <= RINGS; i++) {
    const outer = pts[i];
    const inner = pts[i - 1];
    for (let j = 0; j < SEG; j++) {
      const o0 = outer[j];
      const o1 = outer[(j + 1) % SEG];
      if (i === 1) {
        tri(inner[0], o0, o1);
        continue;
      }
      const i0 = inner[j];
      const i1 = inner[(j + 1) % SEG];
      // alternate diagonals by ring parity (rings are offset by half a segment)
      if (i % 2) {
        tri(i0, o0, o1);
        tri(i0, o1, i1);
      } else {
        tri(i0, o0, i1);
        tri(i1, o0, o1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  const p = PAL[biome];
  const grass = new Color(p.grass);
  const rock = new Color(p.rock);
  const rockDark = new Color(p.rockDark);
  const snowC = new Color('#f3f7fb');
  const col = new Float32Array(pos.length);
  const c = new Color();
  // one colour per face (flat shading): grass on the gentle foot, banded rock, snow on top
  for (let f = 0; f < pos.length / 9; f++) {
    const y = (pos[f * 9 + 1] + pos[f * 9 + 4] + pos[f * 9 + 7]) / 3;
    const x = (pos[f * 9] + pos[f * 9 + 3] + pos[f * 9 + 6]) / 3;
    const z = (pos[f * 9 + 2] + pos[f * 9 + 5] + pos[f * 9 + 8]) / 3;
    const ux = pos[f * 9 + 3] - pos[f * 9], uy = pos[f * 9 + 4] - pos[f * 9 + 1], uz = pos[f * 9 + 5] - pos[f * 9 + 2];
    const vx = pos[f * 9 + 6] - pos[f * 9], vy = pos[f * 9 + 7] - pos[f * 9 + 1], vz = pos[f * 9 + 8] - pos[f * 9 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const up = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
    const band = 0.5 + 0.5 * Math.sin(y * 38 + noise.get(x * 3, z * 3) * 2.5);
    c.copy(rock).lerp(rockDark, band * 0.6 + (1 - up) * 0.3);
    if (y < 0.1 + noise.get(x * 5, z * 5) * 0.05 && up > 0.55) c.copy(grass).multiplyScalar(0.9 + band * 0.12);
    if (snow !== null && y > snow * 0.9 + noise.get(x * 6 + 3, z * 6) * 0.07 && up > 0.32) c.copy(snowC).multiplyScalar(0.94 + up * 0.06);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], f * 9 + k * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return prep(faceted(g));
}

/** Grassy rocky knoll for hill tiles. */
export function hillKit(name: 'hill_single_A' | 'hill_single_B' | 'hill_single_C' | 'hills_A' | 'hills_B' | 'hills_C' | 'hills_A_trees' | 'hills_B_trees' | 'hills_C_trees', biome: Biome, s = 0.5): BufferGeometry {
  return kit(name, biome, { s: HEXK * s });
}

// --- improvements and props -----------------------------------------------------------------------

/** A patch of the KayKit wheat field. */
export function grainPatch(): BufferGeometry {
  return kit('building_grain', 'plains', { s: HEXK * 0.34 });
}

export function fenceKit(gate = false): BufferGeometry {
  return kit(gate ? 'fence_wood_straight_gate' : 'fence_wood_straight', 'temperate', { s: HEXK * 0.32 });
}

export function mineKit(): BufferGeometry {
  return kit('building_mine', 'temperate', { s: HEXK * 0.5 });
}

export function ruinsKit(): BufferGeometry {
  return kit('building_destroyed', 'temperate', { s: HEXK * 0.58 });
}

export function lumberKit(): BufferGeometry {
  return merge([kit('resource_lumber', 'temperate', { s: 0.5, p: [0.06, 0, 0] }), kit('trees_A_cut', 'temperate', { s: HEXK * 0.3, p: [-0.05, 0, 0.02] })]);
}

export function stoneKit(): BufferGeometry {
  return kit('resource_stone', 'temperate', { s: 0.5 });
}

export function lilyKit(letter: 'A' | 'B'): BufferGeometry {
  return kit(`waterlily_${letter}`, 'temperate', { s: 1.1 });
}

export function waterPlantKit(letter: 'A' | 'B' | 'C'): BufferGeometry {
  return kit(`waterplant_${letter}`, 'temperate', { s: 1.2 });
}

export function palmKit(kind: 'long' | 'short' | 'detailed-long' | 'detailed-short'): BufferGeometry {
  return kit(`k_palm-${kind}`, 'temperate', { s: 0.24 });
}

export function boatKit(): BufferGeometry {
  return kit('k_boat-small', 'temperate', { s: 0.28 });
}

export function tentKit(): BufferGeometry {
  return kit('tent', 'temperate', { s: 0.55 });
}

/** A few props stacked beside a building or in a camp. */
export function propPile(seed: number): BufferGeometry {
  const rng = new Rng(seed);
  const names = ['barrel', 'crate_A_small', 'crate_B_small', 'sack', 'crate_A_big', 'bucket_water'];
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = rng.float(0, Math.PI * 2);
    parts.push(kit(names[rng.int(names.length)], 'temperate', { s: 0.42, p: [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], r: [0, rng.float(0, 6), 0] }));
  }
  return merge(parts);
}

export { prep };
