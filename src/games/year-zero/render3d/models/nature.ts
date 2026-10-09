// Procedural models of the natural world and of tile improvements, built
// from soft primitives with painted vertex colours. All sizes are in tile
// units (a hex has a corner radius of 1). Every builder returns one merged
// geometry, so each kind is drawn with a single instanced mesh.

import { BufferGeometry, Color, Vector3 } from 'three';
import { Rng } from '../../../shared/rng';
import {
  box, capColor, capsule, cone, cylinder, ellipsoid, faceted, gradient, ico, lathe, lumpy, merge, part, prep, radialNormals, rockGeo, sphere, xf,
} from '../geo';

const BARK = '#7a5232';
const BARK_D = '#5a3b22';
const WOOD = '#a8774a';
const WOOD_L = '#c9965e';
const STONE = '#c9c0b0';

/** Smooth leafy blob. Map trees use detail 1 (light); close-up scenes may ask for more. */
export let CANOPY_DETAIL = 1;
export function setCanopyDetail(d: number): void {
  CANOPY_DETAIL = d;
}

function canopy(r: number, seed: number, low: string, high: string, sx = 1, sy = 0.9): BufferGeometry {
  const g = ico(r, CANOPY_DETAIL);
  g.scale(sx, sy, sx);
  lumpy(g, r * 0.22, 6 / r * 0.12, seed);
  radialNormals(g);
  return gradient(g, low, high, { jitter: 0.05, seed });
}

export function pineTree(seed = 1, snow = false): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [part(cylinder(0.022, 0.032, 0.09, 6), BARK, { p: [0, 0.045, 0] })];
  const tiers: [number, number, number][] = [[0.13, 0.17, 0.13], [0.105, 0.15, 0.21], [0.075, 0.13, 0.285]];
  tiers.forEach(([r, h, y], k) => {
    let g = cone(r * rng.float(0.95, 1.08), h, 9);
    g = xf(g, { p: [0, y, 0], r: [0, rng.float(0, 1), 0] });
    g = gradient(g, k === 0 ? '#1f6b34' : '#277a3a', k === 2 ? '#5aa84a' : '#3f9444');
    if (snow) capColor(g, y + h * 0.05, '#f4f8fb', 0.06, 0.35);
    parts.push(g);
  });
  return merge(parts);
}

export function roundTree(seed = 1, tint: [string, string] = ['#3f8f2f', '#9bd34f']): BufferGeometry {
  const rng = new Rng(seed);
  const h = rng.float(0.1, 0.13);
  const parts: BufferGeometry[] = [part(cylinder(0.02, 0.03, h + 0.04, 6), BARK, { p: [0, (h + 0.04) / 2, 0] })];
  const c = canopy(0.12, seed, tint[0], tint[1]);
  xf(c, { p: [0, h + 0.1, 0] });
  parts.push(c);
  if (rng.chance(0.6)) {
    const c2 = canopy(0.075, seed + 7, tint[0], tint[1]);
    xf(c2, { p: [rng.float(-0.08, 0.08), h + 0.07, rng.float(0.04, 0.08)] });
    parts.push(c2);
  }
  return merge(parts);
}

export function poplar(seed = 1): BufferGeometry {
  const parts: BufferGeometry[] = [part(cylinder(0.016, 0.022, 0.08, 6), BARK, { p: [0, 0.04, 0] })];
  const c = ico(1, 2);
  c.scale(0.07, 0.17, 0.07);
  lumpy(c, 0.012, 9, seed);
  radialNormals(c);
  xf(c, { p: [0, 0.22, 0] });
  parts.push(gradient(c, '#4f9a32', '#b9dc5a', { jitter: 0.04, seed }));
  return merge(parts);
}

export function palm(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [];
  const lean = rng.float(0.15, 0.35);
  let x = 0;
  let y = 0;
  for (let k = 0; k < 5; k++) {
    const seg = part(cylinder(0.018 - k * 0.002, 0.022 - k * 0.002, 0.065, 6), k % 2 ? '#a07a4c' : '#8a6640', { r: [0, 0, -lean * (k / 5)], p: [x, y + 0.032, 0] });
    parts.push(seg);
    x += Math.sin(lean * (k / 5)) * 0.065;
    y += Math.cos(lean * (k / 5)) * 0.062;
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rng.float(0, 0.4);
    const leaf = ellipsoid(0.11, 0.012, 0.035, 8, 4);
    leaf.translate(0.1, 0, 0);
    leaf.rotateZ(-0.45);
    leaf.rotateY(a);
    leaf.translate(x, y + 0.01, 0);
    parts.push(gradient(leaf, '#2f8a3a', '#7cc94a'));
  }
  for (let k = 0; k < 3; k++) parts.push(part(sphere(0.016, 6, 5), '#6b4a26', { p: [x + Math.cos(k * 2.1) * 0.02, y - 0.012, Math.sin(k * 2.1) * 0.02] }));
  return merge(parts);
}

export function jungleTree(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [part(cylinder(0.025, 0.04, 0.22, 7), '#6b4a2e', { p: [0, 0.11, 0] })];
  const blobs = 3 + rng.int(2);
  for (let k = 0; k < blobs; k++) {
    const a = (k / blobs) * Math.PI * 2;
    const c = canopy(rng.float(0.09, 0.12), seed + k * 13, '#1f6e2e', '#5fbf45', 1.25, 0.7);
    xf(c, { p: [Math.cos(a) * 0.08, 0.25 + rng.float(-0.02, 0.03), Math.sin(a) * 0.08] });
    parts.push(c);
  }
  const top = canopy(0.1, seed + 99, '#2a7f35', '#74d052', 1.2, 0.75);
  xf(top, { p: [0, 0.32, 0] });
  parts.push(top);
  return merge(parts);
}

export function deadTree(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [part(cylinder(0.014, 0.026, 0.2, 6), '#4a3a32', { p: [0, 0.1, 0] })];
  for (let k = 0; k < 3; k++) {
    const a = rng.float(0, Math.PI * 2);
    parts.push(part(cylinder(0.006, 0.01, 0.09, 5), '#4a3a32', { r: [0.8, a, 0], p: [Math.cos(a) * 0.03, 0.14 + k * 0.025, Math.sin(a) * 0.03] }));
  }
  return merge(parts);
}

export function bush(seed = 1): BufferGeometry {
  const g = ico(0.06, 1);
  g.scale(1.2, 0.8, 1.1);
  lumpy(g, 0.012, 14, seed);
  radialNormals(g);
  xf(g, { p: [0, 0.035, 0] });
  return gradient(g, '#3d8a33', '#86c94a', { jitter: 0.05, seed });
}

/** Petals only: tinted per instance (pink, yellow, white, violet). */
export function flowers(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const a = rng.float(0, Math.PI * 2);
    const r = rng.float(0.01, 0.06);
    parts.push(part(sphere(0.013, 6, 4), '#ffffff', { p: [Math.cos(a) * r, 0.025 + rng.float(0, 0.015), Math.sin(a) * r] }));
    parts.push(part(cylinder(0.002, 0.002, 0.03, 3), '#4c8f35', { p: [Math.cos(a) * r, 0.012, Math.sin(a) * r] }));
  }
  return merge(parts);
}

/** Grass blades, greyish so the instance tint sets the hue. */
export function tuft(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const a = rng.float(0, Math.PI * 2);
    const r = rng.float(0, 0.025);
    const g = cone(0.007, rng.float(0.05, 0.085), 3);
    xf(g, { p: [0, 0.03, 0], r: [rng.float(-0.35, 0.35), 0, rng.float(-0.35, 0.35)] });
    g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    parts.push(gradient(g, '#8a8a8a', '#ffffff'));
  }
  return merge(parts);
}

export function rock(seed = 1, color = '#9d958c', moss = '#7fae55'): BufferGeometry {
  const g = faceted(rockGeo(seed, 1));
  g.scale(0.055, 0.055, 0.055);
  g.translate(0, 0.022, 0);
  return gradient(g, '#6f6861', color, { moss, mossAmount: 0.5, jitter: 0.06, seed });
}

/** A cluster of peaks with green foothills: one map mountain tile. */
export function mountainRange(seed = 1, snow = true): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [mountain(seed, snow, 1)];
  const n = 2 + rng.int(2);
  for (let k = 0; k < n; k++) {
    const a = rng.float(0, Math.PI * 2);
    const r = rng.float(0.32, 0.46);
    const s = rng.float(0.5, 0.68);
    const g = mountain(seed * 7 + k, snow && s > 0.58, s);
    g.translate(Math.cos(a) * r, -0.02, Math.sin(a) * r * 0.85);
    parts.push(g);
  }
  for (let k = 0; k < 5; k++) {
    const a = rng.float(0, Math.PI * 2);
    const hill = ico(rng.float(0.14, 0.2), 1);
    hill.scale(1.4, 0.6, 1.2);
    lumpy(hill, 0.03, 6, seed + k * 13);
    hill.translate(Math.cos(a) * 0.58, 0.0, Math.sin(a) * 0.5);
    parts.push(gradient(hill, '#5d8f3a', '#8cc04e', { jitter: 0.05, seed: seed + k }));
  }
  return merge(parts);
}

export function mountain(seed = 1, snow = true, scale = 1): BufferGeometry {
  const rng = new Rng(seed);
  const g = lathe([[0.66, 0], [0.6, 0.1], [0.47, 0.3], [0.32, 0.52], [0.17, 0.72], [0.05, 0.86], [0, 0.88]], 10);
  // break the symmetry: ridges and a leaning summit
  const pos = g.attributes.position;
  const v = new Vector3();
  const lean = rng.float(-0.08, 0.08);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const ridge = 1 + 0.16 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 5 + seed * 2);
    v.x *= ridge;
    v.z *= ridge * 0.85;
    v.x += lean * v.y;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  lumpy(g, 0.05, 3, seed);
  let f = faceted(g);
  f.scale(scale, scale * rng.float(0.92, 1.1), scale);
  f = gradient(f, '#6f655d', '#b3a596', { jitter: 0.08, seed, moss: '#79a84a', mossAmount: 0.45, above: 0 });
  // greener lower slopes
  {
    const pos = f.attributes.position;
    const col = f.attributes.color;
    const green = new Color('#6f9a45');
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const t = 1 - pos.getY(i) / (0.2 * scale);
      if (t <= 0) continue;
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(green, Math.min(1, t) * 0.7);
      col.setXYZ(i, c.r, c.g, c.b);
    }
  }
  if (snow) capColor(f, 0.48 * scale, '#f7faff', 0.07 * scale, 0.15);
  return f;
}

export function volcano(seed = 2): BufferGeometry {
  const g = lathe([[0.7, 0], [0.6, 0.12], [0.42, 0.38], [0.26, 0.62], [0.2, 0.7], [0.15, 0.66], [0.001, 0.6]], 11);
  lumpy(g, 0.04, 3, seed);
  const f = faceted(g);
  return gradient(f, '#5e4b42', '#3b302b', { jitter: 0.08, seed });
}

/** Glowing lava in a volcano's crater. */
export function lava(): BufferGeometry {
  const g = cylinder(0.15, 0.13, 0.03, 10);
  g.translate(0, 0.665, 0);
  const s = sphere(0.05, 8, 6);
  s.translate(0.04, 0.68, 0.02);
  return merge([prep(g, '#ff7a1a'), prep(s, '#ffc240')]);
}

export function cactus(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const c = '#4f9a48';
  const parts = [part(capsule(0.022, 0.12, 4, 7), c, { p: [0, 0.08, 0] })];
  if (rng.chance(0.8)) parts.push(part(capsule(0.014, 0.05, 3, 6), c, { p: [0.04, 0.1, 0] }), part(capsule(0.014, 0.03, 3, 6), c, { r: [0, 0, Math.PI / 2], p: [0.025, 0.07, 0] }));
  if (rng.chance(0.6)) parts.push(part(capsule(0.013, 0.04, 3, 6), c, { p: [-0.04, 0.12, 0] }), part(capsule(0.013, 0.025, 3, 6), c, { r: [0, 0, Math.PI / 2], p: [-0.025, 0.095, 0] }));
  parts.push(part(sphere(0.012, 6, 4), '#ff6fa8', { p: [0, 0.155, 0] }));
  return merge(parts);
}

export function reeds(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const a = rng.float(0, Math.PI * 2);
    const r = rng.float(0, 0.04);
    const h = rng.float(0.07, 0.12);
    const tilt: [number, number, number] = [rng.float(-0.2, 0.2), 0, rng.float(-0.2, 0.2)];
    parts.push(part(cylinder(0.003, 0.004, h, 3), '#7a9a45', { r: tilt, p: [Math.cos(a) * r, h / 2, Math.sin(a) * r] }));
    if (k % 2 === 0) parts.push(part(capsule(0.006, 0.018, 2, 5), '#6b4a2a', { r: tilt, p: [Math.cos(a) * r, h, Math.sin(a) * r] }));
  }
  return merge(parts);
}

export function puddle(seed = 1): BufferGeometry {
  const g = cylinder(0.12, 0.12, 0.01, 12);
  const rng = new Rng(seed);
  g.scale(1, 1, rng.float(0.6, 0.9));
  g.translate(0, 0.004, 0);
  const pad = cylinder(0.02, 0.02, 0.004, 7);
  pad.translate(0.04, 0.012, 0.01);
  const pad2 = cylinder(0.016, 0.016, 0.004, 7);
  pad2.translate(-0.05, 0.012, -0.02);
  return merge([prep(g, '#3f9fcf'), prep(pad, '#4f9f3a'), prep(pad2, '#5aaa40')]);
}

export function iceChunk(seed = 1): BufferGeometry {
  const g = faceted(rockGeo(seed, 0));
  g.scale(0.09, 0.05, 0.08);
  g.translate(0, 0.02, 0);
  return gradient(g, '#a9d4ec', '#ffffff');
}

// --- Improvements ----------------------------------------------------------------

export function wheatField(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [part(box(0.44, 0.008, 0.32), '#a07a42', { p: [0, 0.004, 0] })];
  for (let k = 0; k < 6; k++) {
    const row = box(0.4, 0.022, 0.036);
    lumpy(row, 0.005, 40, seed + k);
    const ripe = rng.chance(0.5);
    parts.push(gradient(xf(row, { p: [0, 0.016, -0.125 + k * 0.05] }), ripe ? '#b8a23a' : '#7fae3c', ripe ? '#e8d26a' : '#b4d65a'));
  }
  return merge(parts);
}

export function hayBale(): BufferGeometry {
  const g = cylinder(0.035, 0.035, 0.05, 10);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.035, 0);
  return gradient(g, '#c99a3a', '#ecd06a');
}

export function fence(len = 0.3): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const n = Math.max(2, Math.round(len / 0.1) + 1);
  for (let k = 0; k < n; k++) parts.push(part(box(0.012, 0.05, 0.012), WOOD, { p: [-len / 2 + (k * len) / (n - 1), 0.025, 0] }));
  parts.push(part(box(len, 0.008, 0.008), WOOD_L, { p: [0, 0.038, 0] }), part(box(len, 0.008, 0.008), WOOD_L, { p: [0, 0.018, 0] }));
  return merge(parts);
}

export function sheep(): BufferGeometry {
  const body = ico(0.04, 1);
  body.scale(1.25, 0.9, 0.95);
  lumpy(body, 0.006, 40, 3);
  radialNormals(body);
  body.translate(0, 0.05, 0);
  const parts = [gradient(body, '#e9e4dc', '#ffffff'), part(sphere(0.02, 8, 6), '#2a2422', { p: [0.05, 0.06, 0], s: [1.1, 1, 0.9] })];
  for (const [x, z] of [[0.025, 0.018], [0.025, -0.018], [-0.025, 0.018], [-0.025, -0.018]]) parts.push(part(cylinder(0.006, 0.006, 0.03, 4), '#2a2422', { p: [x, 0.015, z] }));
  return merge(parts);
}

export function cow(): BufferGeometry {
  const parts = [
    part(capsule(0.03, 0.06, 4, 8), '#f2ece2', { r: [0, 0, Math.PI / 2], p: [0, 0.06, 0] }),
    part(sphere(0.02, 6, 5), '#3a2a22', { p: [0.0, 0.075, 0.022] }),
    part(sphere(0.018, 6, 5), '#3a2a22', { p: [-0.03, 0.065, -0.02] }),
    part(ellipsoid(0.024, 0.022, 0.02), '#f2ece2', { p: [0.07, 0.075, 0] }),
    part(ellipsoid(0.012, 0.01, 0.014), '#e8a7a0', { p: [0.09, 0.068, 0] }),
    part(cone(0.005, 0.02, 4), '#e8dcc0', { r: [0, 0, -0.6], p: [0.07, 0.1, 0.015] }),
    part(cone(0.005, 0.02, 4), '#e8dcc0', { r: [0, 0, -0.6], p: [0.07, 0.1, -0.015] }),
  ];
  for (const [x, z] of [[0.035, 0.018], [0.035, -0.018], [-0.035, 0.018], [-0.035, -0.018]]) parts.push(part(cylinder(0.007, 0.006, 0.04, 4), '#3a2a22', { p: [x, 0.02, z] }));
  return merge(parts);
}

export function horse(color = '#8a5a34', mane = '#3a2618'): BufferGeometry {
  const parts = [
    part(capsule(0.028, 0.07, 4, 8), color, { r: [0, 0, Math.PI / 2], p: [0, 0.075, 0] }),
    part(capsule(0.016, 0.045, 3, 6), color, { r: [0, 0, -0.7], p: [0.055, 0.105, 0] }),
    part(capsule(0.014, 0.035, 3, 6), color, { r: [0, 0, 1.25], p: [0.085, 0.125, 0] }),
    part(box(0.012, 0.05, 0.008), mane, { r: [0, 0, -0.7], p: [0.05, 0.12, 0] }),
    part(capsule(0.008, 0.04, 2, 5), mane, { r: [0, 0, -0.9], p: [-0.06, 0.07, 0] }),
  ];
  for (const [x, z] of [[0.04, 0.016], [0.04, -0.016], [-0.04, 0.016], [-0.04, -0.016]]) parts.push(part(cylinder(0.008, 0.006, 0.055, 5), color, { p: [x, 0.027, z] }));
  return merge(parts);
}

export function mineEntrance(): BufferGeometry {
  return merge([
    part(box(0.1, 0.08, 0.04), '#2a2420', { p: [0, 0.04, -0.01] }),
    part(box(0.016, 0.1, 0.016), WOOD, { p: [-0.06, 0.05, 0.01] }),
    part(box(0.016, 0.1, 0.016), WOOD, { p: [0.06, 0.05, 0.01] }),
    part(box(0.15, 0.018, 0.02), WOOD_L, { p: [0, 0.1, 0.01] }),
    part(box(0.06, 0.03, 0.04), '#6b6f75', { p: [0.08, 0.025, 0.08] }),
    part(cylinder(0.012, 0.012, 0.008, 8), '#3a3a3a', { r: [Math.PI / 2, 0, 0], p: [0.06, 0.01, 0.1] }),
    part(cylinder(0.012, 0.012, 0.008, 8), '#3a3a3a', { r: [Math.PI / 2, 0, 0], p: [0.1, 0.01, 0.1] }),
    part(ico(0.02, 0), '#8f8a85', { p: [0.08, 0.045, 0.08] }),
  ]);
}

export function logPile(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const spots: [number, number][] = [[-0.03, 0.018], [0, 0.018], [0.03, 0.018], [-0.015, 0.045], [0.015, 0.045], [0, 0.07]];
  for (const [x, y] of spots) {
    parts.push(part(cylinder(0.016, 0.016, 0.13, 7), BARK, { r: [Math.PI / 2, 0, 0], p: [x, y, 0] }));
    parts.push(part(cylinder(0.012, 0.012, 0.132, 7), '#dcb780', { r: [Math.PI / 2, 0, 0], p: [x, y, 0] }));
  }
  parts.push(part(cylinder(0.03, 0.035, 0.04, 8), BARK_D, { p: [0.12, 0.02, 0.05] }), part(cylinder(0.026, 0.026, 0.002, 8), '#dcb780', { p: [0.12, 0.041, 0.05] }));
  return merge(parts);
}

export function oilDerrick(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const h = 0.28;
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const leg = cylinder(0.005, 0.007, h, 4);
    leg.rotateX(z * 0.12);
    leg.rotateZ(-x * 0.12);
    leg.translate(x * 0.035, h / 2, z * 0.035);
    parts.push(prep(leg, '#3c3a40'));
  }
  for (let k = 1; k < 4; k++) parts.push(part(box(0.09 - k * 0.018, 0.006, 0.09 - k * 0.018), '#55525a', { p: [0, k * 0.065, 0] }));
  parts.push(part(box(0.08, 0.05, 0.06), '#7a3a2a', { p: [0.09, 0.025, 0.04] }), part(cylinder(0.02, 0.02, 0.05, 8), '#2b2b30', { p: [-0.08, 0.025, 0.06] }));
  return merge(parts);
}

export function fishingBoat(): BufferGeometry {
  const hull = lathe([[0.001, -0.02], [0.03, -0.012], [0.04, 0.01], [0.042, 0.02]], 10);
  hull.scale(1, 1, 2.2);
  hull.rotateY(Math.PI / 2);
  hull.translate(0, 0.02, 0);
  const s = prep(xf(cone(0.05, 0.11, 3), { s: [0.08, 1, 1], p: [0, 0.1, 0] }), '#fff8ea');
  return merge([prep(hull, '#8a5a32'), part(cylinder(0.004, 0.004, 0.13, 4), BARK_D, { p: [0, 0.09, 0] }), s]);
}

export function plantationRow(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [];
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 4; k++) {
      const b = ico(0.03, 1);
      lumpy(b, 0.004, 40, seed + r * 7 + k);
      radialNormals(b);
      b.translate(-0.11 + k * 0.075, 0.03, -0.08 + r * 0.08);
      parts.push(gradient(b, '#2f7a32', '#5bb04a'));
      if (rng.chance(0.8)) parts.push(part(sphere(0.008, 5, 4), rng.chance(0.5) ? '#ff5a3c' : '#ffb02e', { p: [-0.11 + k * 0.075 + 0.015, 0.05, -0.08 + r * 0.08 + 0.015] }));
    }
  }
  return merge(parts);
}

// --- Ruins and wonders ----------------------------------------------------------------

export function ruins(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rng.float(0, 0.5);
    const r = 0.16;
    const h = rng.float(0.06, 0.2);
    parts.push(part(cylinder(0.024, 0.027, h, 8), STONE, { p: [Math.cos(a) * r, h / 2, Math.sin(a) * r] }));
    if (h > 0.15) parts.push(part(box(0.06, 0.02, 0.06), '#d8d0c0', { p: [Math.cos(a) * r, h + 0.01, Math.sin(a) * r] }));
  }
  const wall = box(0.22, 0.08, 0.035);
  lumpy(wall, 0.01, 20, seed);
  parts.push(gradient(xf(wall, { p: [0.02, 0.04, -0.2], r: [0, 0.3, 0] }), '#a89e8e', '#d0c8b8', { moss: '#7fae55', mossAmount: 0.6 }));
  for (let k = 0; k < 5; k++) parts.push(part(ico(0.02, 0), '#b5ad9e', { p: [rng.float(-0.2, 0.2), 0.01, rng.float(-0.1, 0.2)] }));
  parts.push(part(box(0.3, 0.012, 0.3), '#bdb3a2', { p: [0, 0.006, 0], r: [0, 0.4, 0] }));
  return merge(parts);
}

export function pillars(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const h = rng.float(0.4, 0.65);
    const g = cylinder(0.05, 0.08, h, 7, false);
    lumpy(g, 0.015, 10, seed + k);
    parts.push(gradient(faceted(xf(g, { p: [Math.cos(a) * 0.22, h / 2, Math.sin(a) * 0.22] })), '#a8784e', '#e0b07a', { jitter: 0.06 }));
  }
  return merge(parts);
}

export function giantTree(): BufferGeometry {
  const parts = [part(cylinder(0.06, 0.11, 0.36, 9), '#6a4428', { p: [0, 0.18, 0] })];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const c = canopy(0.2, 40 + k, '#2f7a2e', '#8fd04e');
    xf(c, { p: [Math.cos(a) * 0.16, 0.45 + (k % 2) * 0.05, Math.sin(a) * 0.16] });
    parts.push(c);
  }
  const top = canopy(0.24, 77, '#3a8a32', '#a6dc5c');
  xf(top, { p: [0, 0.6, 0] });
  parts.push(top);
  return merge(parts);
}

/** Crystal shards: glow under bloom. */
export function crystals(seed = 1, color = '#7ff3ff'): BufferGeometry {
  const rng = new Rng(seed);
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const h = rng.float(0.08, 0.22);
    const g = cone(0.03, h, 5);
    g.translate(0, h / 2, 0);
    g.rotateX(rng.float(-0.4, 0.4));
    g.rotateZ(rng.float(-0.4, 0.4));
    g.translate(rng.float(-0.18, 0.18), 0, rng.float(-0.18, 0.18));
    parts.push(gradient(faceted(g), '#ffffff', color));
  }
  return merge(parts);
}

export function coral(seed = 1): BufferGeometry {
  const rng = new Rng(seed);
  const cols = ['#ff7aa2', '#ffb347', '#b57bff', '#ff6b5a', '#5fe0c9'];
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const g = ico(rng.float(0.03, 0.06), 1);
    lumpy(g, 0.01, 30, seed + k);
    g.translate(rng.float(-0.3, 0.3), rng.float(-0.01, 0.02), rng.float(-0.3, 0.3));
    parts.push(prep(g, rng.pick(cols)));
  }
  return merge(parts);
}

export function waterfall(): BufferGeometry {
  const cliff = box(0.5, 0.26, 0.14);
  lumpy(cliff, 0.03, 8, 5);
  const fall = box(0.16, 0.26, 0.02);
  const pool = cylinder(0.14, 0.14, 0.01, 12);
  return merge([
    gradient(faceted(xf(cliff, { p: [0, 0.13, -0.08] })), '#4a4440', '#7a706a', { moss: '#5f9a42', mossAmount: 0.8 }),
    gradient(xf(fall, { p: [0, 0.13, 0.0] }), '#bfe9ff', '#ffffff'),
    prep(xf(pool, { p: [0, 0.006, 0.1] }), '#dff6ff'),
    part(sphere(0.04, 8, 6), '#ffffff', { p: [0.04, 0.02, 0.06] }),
    part(sphere(0.035, 8, 6), '#ffffff', { p: [-0.04, 0.02, 0.07] }),
  ]);
}
