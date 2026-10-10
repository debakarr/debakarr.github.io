// Hand-made architecture for what the KayKit town kit lacks: tribal huts and
// teepees, palisades, fields, domes, arenas, aqueducts, factories, harbours,
// lighthouses and world wonders. Roofs and banners take the owner's colour.

import { BufferGeometry } from 'three';
import { Rng } from '../../../shared/rng';
import {
  box, cone, cylinder, faceted, gable, gradient, hemisphere, lathe, merge, part, prep, pyramid, sphere, torus, xf, type V3,
} from '../geo';

export const STYLE = {
  plaster: ['#f4ead4', '#efe1c2', '#f7f0e2', '#e9d9bb'],
  timber: '#8a5a36',
  stone: '#cfc7b8',
  stoneDark: '#a39a8c',
  brick: ['#b9643f', '#a9583a', '#c47148'],
  glass: '#7fc8ee',
  glassDark: '#4c8fbf',
  thatch: '#d6ad55',
  mud: '#c4976a',
  roofs: ['#c9623a', '#a5532f', '#8d5a3c'],
  door: '#5a3a24',
  window: '#3b5e86',
  windowLit: '#ffd77a',
  gold: '#f2c14e',
};

type Parts = BufferGeometry[];

/** Moves and turns a finished geometry into place. */
export function place(g: BufferGeometry, x: number, y: number, z: number, rot = 0, s = 1): BufferGeometry {
  g.scale(s, s, s);
  g.rotateY(rot);
  g.translate(x, y, z);
  return g;
}

function windows(parts: Parts, w: number, h: number, d: number, y0: number, rows: number, cols: number, lit: boolean, color = STYLE.window): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + ((c + 0.5) * w) / cols;
      const y = y0 + ((r + 0.5) * h) / rows;
      parts.push(part(box(Math.min(0.016, w / cols * 0.5), Math.min(0.018, h / rows * 0.55), 0.004), lit && (r + c) % 3 === 0 ? STYLE.windowLit : color, { p: [x, y, d / 2 + 0.002] }));
    }
  }
}

/** A cottage: plaster or timber walls, a pitched roof, a door and windows. */
export function house(rng: Rng, roof: string, opts: { w?: number; d?: number; h?: number; wall?: string; chimney?: boolean; floors?: number } = {}): BufferGeometry {
  const w = opts.w ?? rng.float(0.085, 0.11);
  const d = opts.d ?? rng.float(0.07, 0.085);
  const floors = opts.floors ?? 1;
  const h = (opts.h ?? rng.float(0.06, 0.075)) * floors;
  const wall = opts.wall ?? rng.pick(STYLE.plaster);
  const parts: Parts = [part(box(w, h, d), wall, { p: [0, h / 2, 0] })];
  // timber frame accents
  if (rng.chance(0.5)) {
    parts.push(part(box(w + 0.004, 0.008, d + 0.004), STYLE.timber, { p: [0, h * 0.55, 0] }));
    parts.push(part(box(0.008, h, 0.008), STYLE.timber, { p: [w / 2, h / 2, d / 2] }), part(box(0.008, h, 0.008), STYLE.timber, { p: [-w / 2, h / 2, d / 2] }));
  }
  parts.push(part(gable(w, d, d * 0.62, 0.012), roof, { p: [0, h, 0] }));
  parts.push(part(box(0.018, 0.03, 0.004), STYLE.door, { p: [rng.float(-w / 4, w / 4), 0.015, d / 2 + 0.002] }));
  windows(parts, w * 0.9, h - 0.03, d, 0.03, floors, 2, rng.chance(0.4));
  if (opts.chimney ?? rng.chance(0.35)) parts.push(part(box(0.014, 0.04, 0.014), '#8b7f74', { p: [w * 0.3, h + d * 0.4, -d * 0.15] }));
  return merge(parts);
}

/** Round tribal hut: log wall, layered faceted thatch, door frame and a painted band in the owner's colour. */
export function tribalHut(rng: Rng, team: string): BufferGeometry {
  const r = rng.float(0.05, 0.06);
  const h = rng.float(0.042, 0.05);
  const parts: Parts = [
    gradient(faceted(cylinder(r, r * 1.06, h, 9)), '#7a5232', '#b07a4a', { jitter: 0.06, seed: rng.int(999) }),
    part(cylinder(r * 1.08, r * 1.08, 0.008, 9), team, { p: [0, h * 0.62, 0] }),
  ];
  xf(parts[0], { p: [0, h / 2, 0] });
  // two layers of thatch, the lower one wider
  parts.push(xf(gradient(faceted(cone(r * 1.55, r * 0.95, 9)), '#a07a32', '#e2bf62', { jitter: 0.05, seed: rng.int(999) }), { p: [0, h + r * 0.4, 0], r: [0, 0.2, 0] }));
  parts.push(xf(gradient(faceted(cone(r * 1.05, r * 0.9, 9)), '#b58a3c', '#f0d077', { jitter: 0.05, seed: rng.int(999) }), { p: [0, h + r * 1.0, 0], r: [0, 0.5, 0] }));
  parts.push(part(cylinder(0.003, 0.004, r * 0.6, 5), '#6a4529', { p: [0, h + r * 1.6, 0] }));
  parts.push(part(box(0.02, 0.03, 0.006), STYLE.door, { p: [0, 0.015, r * 1.02] }));
  parts.push(part(box(0.026, 0.004, 0.008), '#6a4529', { p: [0, 0.031, r * 1.03] }));
  return merge(parts);
}

/** Painted hide teepee with poles poking out of the top. */
export function teepee(rng: Rng, team: string): BufferGeometry {
  const r = rng.float(0.04, 0.05);
  const h = r * 2.1;
  const parts: Parts = [
    xf(gradient(faceted(cone(r, h, 7)), '#c9a77a', '#f2e1c0', { jitter: 0.04, seed: rng.int(999) }), { p: [0, h / 2, 0] }),
    part(cylinder(r * 0.62, r * 0.78, h * 0.14, 7, true), team, { p: [0, h * 0.28, 0] }),
    part(cylinder(r * 0.36, r * 0.45, h * 0.08, 7, true), team, { p: [0, h * 0.58, 0] }),
    part(box(0.012, 0.03, 0.004), '#5a3a24', { p: [0, 0.015, r * 0.86], r: [-0.42, 0, 0] }),
  ];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    parts.push(part(cylinder(0.0018, 0.0018, h * 0.4, 4), '#6a4529', { p: [Math.cos(a) * 0.006, h * 1.02, Math.sin(a) * 0.006], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] }));
  }
  return merge(parts);
}

/** Furrowed field with ripe rows (for the edge of town and for farms). */
export function cropField(rng: Rng, w = 0.16, d = 0.12): BufferGeometry {
  const parts: Parts = [part(box(w, 0.006, d), '#9a6b3c', { p: [0, 0.003, 0] })];
  const rows = Math.round(d / 0.022);
  const crop = rng.pick(['#e9c25a', '#d8b04a', '#9fcf4f', '#c8d860']);
  for (let k = 0; k < rows; k++) {
    const z = -d / 2 + (k + 0.5) * (d / rows);
    parts.push(xf(gradient(box(w * 0.94, 0.016, 0.012), '#b88a34', crop), { p: [0, 0.012, z] }));
  }
  return merge(parts);
}

export function tent(color: string): BufferGeometry {
  return merge([part(cone(0.045, 0.07, 6), color, { p: [0, 0.035, 0] }), part(cylinder(0.002, 0.002, 0.09, 3), STYLE.timber, { p: [0, 0.045, 0] })]);
}

export function campfire(): BufferGeometry {
  return merge([
    part(cylinder(0.03, 0.032, 0.008, 8), '#6b6b6b', { p: [0, 0.004, 0] }),
    part(cone(0.016, 0.04, 6), '#ff9a2e', { p: [0, 0.028, 0] }),
    part(cone(0.009, 0.026, 6), '#ffe35a', { p: [0, 0.03, 0] }),
  ]);
}

/** A stone tower with a pointed roof in the owner's colour and a pennant. */
export function tower(roof: string, h = 0.2, r = 0.036, stone = STYLE.stone): BufferGeometry {
  const parts: Parts = [
    gradient(cylinder(r, r * 1.08, h, 10), STYLE.stoneDark, stone),
    part(cylinder(r * 1.25, r * 1.25, 0.012, 10), STYLE.stoneDark, { p: [0, h / 2 + 0.006, 0] }),
    part(cone(r * 1.35, r * 2.6, 10), roof, { p: [0, h / 2 + 0.012 + r * 1.3, 0] }),
  ];
  parts[0].translate(0, h / 2, 0);
  parts[1].translate(0, h / 2, 0);
  parts[2].translate(0, h / 2, 0);
  windows(parts, r * 1.2, h * 0.5, r * 2, h * 0.35, 2, 1, true);
  return merge(parts);
}

/** The keep of a capital: a hall with corner towers, crenellations and a tall central spire. */
export function keep(rng: Rng, roof: string): BufferGeometry {
  const parts: Parts = [];
  const w = 0.2;
  const h = 0.13;
  parts.push(gradient(xf(box(w, h, w * 0.85), { p: [0, h / 2, 0] }), STYLE.stoneDark, STYLE.stone));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    parts.push(part(box(0.022, 0.02, 0.022), STYLE.stone, { p: [Math.cos(a) * w * 0.48, h + 0.01, Math.sin(a) * w * 0.4] }));
  }
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) parts.push(place(tower(roof, 0.17, 0.03), x * w * 0.5, 0, z * w * 0.42));
  parts.push(place(tower(roof, 0.3, 0.045), 0, h - 0.02, -0.01));
  parts.push(part(box(0.04, 0.06, 0.006), STYLE.door, { p: [0, 0.03, w * 0.43] }));
  parts.push(part(gable(0.08, 0.05, 0.03, 0.005), roof, { p: [0, 0.07, w * 0.43] }));
  void rng;
  return merge(parts);
}

export function palisade(len: number): BufferGeometry {
  const parts: Parts = [];
  const n = Math.max(2, Math.round(len / 0.018));
  for (let k = 0; k < n; k++) {
    const x = -len / 2 + (k + 0.5) * (len / n);
    const h = 0.05 + ((k * 7) % 3) * 0.006;
    parts.push(part(cylinder(0.007, 0.008, h, 5), '#8a6440', { p: [x, h / 2, 0] }), part(cone(0.007, 0.012, 5), '#a07650', { p: [x, h + 0.006, 0] }));
  }
  return merge(parts);
}

/** A classical temple: steps, columns and a pediment. */
export function temple(roof: string, marble = '#f2ede2'): BufferGeometry {
  const parts: Parts = [part(box(0.17, 0.016, 0.12), '#d9d2c4', { p: [0, 0.008, 0] }), part(box(0.15, 0.012, 0.1), '#e6dfd2', { p: [0, 0.022, 0] })];
  for (let k = 0; k < 5; k++) {
    for (const z of [-0.04, 0.04]) parts.push(part(cylinder(0.008, 0.009, 0.07, 7), marble, { p: [-0.06 + k * 0.03, 0.063, z] }));
  }
  parts.push(part(box(0.15, 0.012, 0.1), marble, { p: [0, 0.104, 0] }));
  parts.push(part(gable(0.15, 0.1, 0.04, 0.008), roof, { p: [0, 0.11, 0] }));
  return merge(parts);
}

/** A domed hall (library, university, observatory, bank). */
export function domeHall(dome: string, wall = '#efe6d4'): BufferGeometry {
  const parts: Parts = [part(box(0.15, 0.07, 0.11), wall, { p: [0, 0.035, 0] })];
  for (let k = 0; k < 4; k++) parts.push(part(cylinder(0.007, 0.007, 0.06, 6), '#fbf6ea', { p: [-0.05 + k * 0.033, 0.035, 0.058] }));
  parts.push(part(cylinder(0.045, 0.045, 0.02, 12), wall, { p: [0, 0.08, 0] }));
  parts.push(part(hemisphere(0.046, 14, 7), dome, { p: [0, 0.09, 0] }));
  parts.push(part(sphere(0.008, 6, 4), STYLE.gold, { p: [0, 0.14, 0] }));
  return merge(parts);
}

export function smokestack(h = 0.2): BufferGeometry {
  return merge([
    gradient(xf(cylinder(0.016, 0.022, h, 9), { p: [0, h / 2, 0] }), '#7a3a26', '#b8643f'),
    part(cylinder(0.02, 0.018, 0.014, 9), '#3a3a3a', { p: [0, h, 0] }),
  ]);
}

export function factory(roof = '#5a5f66'): BufferGeometry {
  const parts: Parts = [part(box(0.18, 0.08, 0.11), STYLE.brick[1], { p: [0, 0.04, 0] })];
  for (let k = 0; k < 3; k++) parts.push(part(gable(0.06, 0.11, 0.035, 0.004), roof, { p: [-0.06 + k * 0.06, 0.08, 0], r: [0, Math.PI / 2, 0] }));
  windows(parts, 0.16, 0.05, 0.11, 0.015, 1, 5, true);
  parts.push(place(smokestack(0.2), 0.07, 0, -0.03));
  return merge(parts);
}

export function harbor(): BufferGeometry {
  const parts: Parts = [part(box(0.22, 0.012, 0.06), '#a8774a', { p: [0, 0.02, 0] })];
  for (let k = 0; k < 4; k++) parts.push(part(cylinder(0.006, 0.006, 0.08, 5), '#6b4a2e', { p: [-0.1 + k * 0.066, -0.01, 0.03] }));
  parts.push(part(box(0.05, 0.035, 0.035), '#c9b08a', { p: [-0.07, 0.04, -0.01] }));
  return merge(parts);
}

export function obelisk(): BufferGeometry {
  return merge([part(box(0.05, 0.015, 0.05), '#d8d0c0', { p: [0, 0.0075, 0] }), part(pyramid(0.026, 0.026, 0.15, 0), '#e8e0d0', { p: [0, 0.015, 0] }), part(pyramid(0.026, 0.026, 0.02, 0), STYLE.gold, { p: [0, 0.14, 0] })]);
}

export function arena(): BufferGeometry {
  const ring = lathe([[0.085, 0], [0.09, 0.04], [0.06, 0.045], [0.055, 0.005]], 18);
  return merge([gradient(ring, '#cbb89a', '#ece0c8'), part(cylinder(0.055, 0.055, 0.004, 18), '#d9c08a', { p: [0, 0.004, 0] })]);
}

export function aqueduct(len = 0.3): BufferGeometry {
  const parts: Parts = [part(box(len, 0.018, 0.03), '#d9cfbd', { p: [0, 0.085, 0] })];
  const n = 4;
  for (let k = 0; k <= n; k++) parts.push(part(box(0.018, 0.08, 0.03), '#cfc4b0', { p: [-len / 2 + (k * len) / n, 0.04, 0] }));
  return merge(parts);
}

export function lighthouse(): BufferGeometry {
  return merge([
    gradient(xf(cylinder(0.03, 0.045, 0.3, 10), { p: [0, 0.15, 0] }), '#d9d2c4', '#f6f2ea'),
    part(cylinder(0.034, 0.034, 0.03, 10), '#ffe48a', { p: [0, 0.315, 0] }),
    part(cone(0.04, 0.05, 10), '#c9623a', { p: [0, 0.355, 0] }),
    part(torus(0.032, 0.006, 5, 14), '#c9623a', { r: [Math.PI / 2, 0, 0], p: [0, 0.12, 0] }),
  ]);
}

export function stepPyramid(): BufferGeometry {
  const parts: Parts = [];
  for (let k = 0; k < 4; k++) parts.push(part(box(0.24 - k * 0.05, 0.04, 0.24 - k * 0.05), k % 2 ? '#d9c08a' : '#cdb07a', { p: [0, 0.02 + k * 0.04, 0] }));
  parts.push(part(box(0.06, 0.05, 0.06), '#b85a3a', { p: [0, 0.185, 0] }));
  for (let k = 0; k < 4; k++) parts.push(part(box(0.02, 0.02, 0.02), '#5bbf5a', { p: [0.1 - k * 0.025, 0.05 + k * 0.04, 0.11 - k * 0.025] }));
  return merge(parts);
}

export function stoneCircle(): BufferGeometry {
  const parts: Parts = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    parts.push(part(box(0.024, 0.08, 0.016), '#a8a196', { p: [Math.cos(a) * 0.11, 0.04, Math.sin(a) * 0.11], r: [0, -a, 0] }));
  }
  parts.push(part(box(0.06, 0.016, 0.02), '#a8a196', { p: [0.11, 0.088, 0], r: [0, Math.PI / 2, 0] }));
  return merge(parts);
}

export function clockTower(roof: string): BufferGeometry {
  return merge([
    part(box(0.06, 0.26, 0.06), '#e6dccb', { p: [0, 0.13, 0] }),
    part(cylinder(0.022, 0.022, 0.006, 14), '#fff8e8', { r: [Math.PI / 2, 0, 0], p: [0, 0.21, 0.031] }),
    part(pyramid(0.07, 0.07, 0.09), roof, { p: [0, 0.26, 0] }),
  ]);
}

export function rocketPad(accent: string): BufferGeometry {
  return merge([
    part(cylinder(0.08, 0.08, 0.01, 12), '#9aa3ad', { p: [0, 0.005, 0] }),
    part(capsule2(), '#f4f6f8', {}),
    part(cone(0.018, 0.05, 10), accent, { p: [0, 0.3, 0] }),
  ]);
}

function capsule2(): BufferGeometry {
  const g = cylinder(0.018, 0.02, 0.26, 10);
  g.translate(0, 0.14, 0);
  return g;
}

/** A small flag on a pole; the cloth is tinted per instance and waves in the shader. */
export function flagPole(h = 0.14): BufferGeometry {
  return merge([part(cylinder(0.003, 0.003, h, 4), '#e8e0d0', { p: [0, h / 2, 0] }), part(sphere(0.006, 5, 4), STYLE.gold, { p: [0, h, 0] })]);
}

export function flagCloth(): BufferGeometry {
  const g = box(0.06, 0.035, 0.002, ) as BufferGeometry;
  g.translate(0.03, 0, 0);
  return prep(g, '#ffffff', 1);
}

export function plaza(r: number, color = '#d9cdb4'): BufferGeometry {
  return part(cylinder(r, r, 0.008, 6), color, { p: [0, 0.004, 0], r: [0, Math.PI / 6, 0] });
}

export type { V3 };
