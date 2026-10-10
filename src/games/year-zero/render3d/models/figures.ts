// War machines, vehicles, ships and aircraft for the unit looks (looks.ts)
// where the KayKit and Kenney kits have nothing: catapults, cannon, gatling
// guns, tanks, modern warships, planes, carts and the fortification ring.
// Vertices with `team = 1` take the owner's colour (banners, sails, stripes).

import { BufferGeometry } from 'three';
import {
  box, capsule, cone, cylinder, ellipsoid, faceted, gradient, hemisphere, lathe, merge, part, prep, softBox, sphere, xf,
} from '../geo';

const WOOD = '#8a5a34';

// --- Mounts, machines, ships and aircraft ----------------------------------------------------------

function wheel(r: number, w = 0.01, c = '#6b4a2e'): BufferGeometry {
  return merge([part(cylinder(r, r, w, 12), c, { r: [0, 0, Math.PI / 2] }), part(cylinder(r * 0.3, r * 0.3, w * 1.4, 8), '#3a2a1e', { r: [0, 0, Math.PI / 2] })]);
}

export function catapult(treb = false): BufferGeometry {
  const parts: BufferGeometry[] = [part(box(0.06, 0.012, 0.13), WOOD, { p: [0, 0.03, 0] })];
  for (const x of [-0.035, 0.035]) for (const z of [-0.045, 0.045]) parts.push(xf(wheel(0.022), { p: [x, 0.022, z] }));
  if (treb) {
    parts.push(part(box(0.01, 0.2, 0.01), WOOD, { p: [-0.028, 0.13, 0], r: [0, 0, 0.12] }), part(box(0.01, 0.2, 0.01), WOOD, { p: [0.028, 0.13, 0], r: [0, 0, -0.12] }));
    parts.push(part(box(0.008, 0.26, 0.008), '#7a5232', { p: [0, 0.2, 0.02], r: [0.9, 0, 0] }));
    parts.push(part(box(0.04, 0.04, 0.04), '#6b6f75', { p: [0, 0.16, -0.08] }));
    parts.push(part(box(0.034, 0.012, 0.02), '#ffffff', { p: [0, 0.23, 0.0] }, 1));
  } else {
    parts.push(part(box(0.05, 0.05, 0.01), WOOD, { p: [0, 0.06, -0.02] }));
    parts.push(part(box(0.008, 0.12, 0.008), '#7a5232', { p: [0, 0.08, 0.02], r: [-0.8, 0, 0] }));
    parts.push(part(hemisphere(0.016, 8, 4), '#5a3a22', { p: [0, 0.12, -0.03], r: [Math.PI, 0, 0] }));
    parts.push(part(sphere(0.012, 6, 5), '#8a8a8a', { p: [0, 0.12, -0.03] }));
    parts.push(part(box(0.064, 0.016, 0.01), '#ffffff', { p: [0, 0.042, 0.066] }, 1));
  }
  return merge(parts);
}

export function cannon(modern = false): BufferGeometry {
  const parts: BufferGeometry[] = [
    part(box(0.03, 0.02, 0.08), modern ? '#5f6b45' : WOOD, { p: [0, 0.03, -0.02] }),
    xf(wheel(0.032, 0.01, modern ? '#2a2c30' : '#6b4a2e'), { p: [0.03, 0.032, 0] }),
    xf(wheel(0.032, 0.01, modern ? '#2a2c30' : '#6b4a2e'), { p: [-0.03, 0.032, 0] }),
    part(cylinder(0.011, 0.016, 0.11, 10), modern ? '#4a5238' : '#2e2c30', { r: [Math.PI / 2 - 0.35, 0, 0], p: [0, 0.055, 0.03] }),
  ];
  if (modern) parts.push(part(box(0.07, 0.05, 0.006), '#5f6b45', { p: [0, 0.06, 0.012] }), part(box(0.03, 0.01, 0.006), '#ffffff', { p: [0, 0.07, 0.016] }, 1));
  else parts.push(part(box(0.026, 0.012, 0.006), '#ffffff', { p: [0, 0.042, -0.06] }, 1));
  return merge(parts);
}

export function rocketTruck(): BufferGeometry {
  const parts: BufferGeometry[] = [
    part(softBox(0.07, 0.03, 0.16), '#5f6b45', { p: [0, 0.03, 0] }),
    part(softBox(0.066, 0.04, 0.04), '#ffffff', { p: [0, 0.06, 0.06] }, 1),
    part(box(0.05, 0.008, 0.02), '#9ad0ee', { p: [0, 0.07, 0.081] }),
    part(xf(box(0.06, 0.04, 0.08), { r: [-0.4, 0, 0] }), '#4a5238', { p: [0, 0.08, -0.03] }),
  ];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) parts.push(part(cylinder(0.007, 0.007, 0.004, 8), '#1a1a1a', { r: [Math.PI / 2 - 0.4, 0, 0], p: [-0.018 + x * 0.018, 0.075 + y * 0.016 + 0.02, 0.006 + y * 0.008] }));
  for (const z of [-0.05, 0, 0.05]) for (const x of [-0.04, 0.04]) parts.push(xf(wheel(0.018, 0.012, '#2a2c30'), { p: [x, 0.018, z] }));
  return merge(parts);
}

export function tank(kind: 'tank' | 'modern' | 'hover'): BufferGeometry {
  const hull = kind === 'modern' ? '#9a8a6a' : kind === 'hover' ? '#d8dee6' : '#5f6b45';
  const parts: BufferGeometry[] = [
    part(softBox(0.1, 0.035, 0.17, 0.12), hull, { p: [0, kind === 'hover' ? 0.04 : 0.028, 0] }),
    part(box(0.08, 0.006, 0.12), '#ffffff', { p: [0, (kind === 'hover' ? 0.04 : 0.028) + 0.036, -0.01] }, 1),
  ];
  const ty = kind === 'hover' ? 0.085 : 0.075;
  parts.push(part(kind === 'tank' ? cylinder(0.036, 0.04, 0.03, 10) : softBox(0.07, 0.028, 0.08, 0.2), hull, { p: [0, ty, -0.01] }));
  parts.push(part(cylinder(0.006, 0.008, 0.12, 8), '#3a3e30', { r: [Math.PI / 2, 0, 0], p: [0, ty + 0.004, 0.08] }));
  parts.push(part(sphere(0.012, 6, 5), '#ffffff', { p: [0.018, ty + 0.018, -0.03] }, 1));
  if (kind === 'hover') {
    for (const z of [-0.05, 0.05]) for (const x of [-0.04, 0.04]) parts.push(part(cylinder(0.018, 0.022, 0.012, 10), '#5ff0ff', { p: [x, 0.016, z] }));
  } else {
    for (const x of [-0.055, 0.055]) {
      parts.push(part(softBox(0.026, 0.034, 0.18, 0.3), '#2a2c30', { p: [x, 0.017, 0] }));
      for (let k = 0; k < 4; k++) parts.push(xf(wheel(0.012, 0.028, '#4a4e52'), { p: [x, 0.016, -0.06 + k * 0.04] }));
    }
  }
  return merge(parts);
}

export function gatlingGun(modern = false): BufferGeometry {
  if (modern) {
    return merge([
      part(box(0.014, 0.018, 0.08), '#2a2c30', { p: [0, 0.04, 0.02] }),
      part(cylinder(0.002, 0.002, 0.07, 4), '#2a2c30', { p: [0.02, 0.018, 0], r: [0, 0, 0.5] }),
      part(cylinder(0.002, 0.002, 0.07, 4), '#2a2c30', { p: [-0.02, 0.018, 0], r: [0, 0, -0.5] }),
      part(cylinder(0.002, 0.002, 0.07, 4), '#2a2c30', { p: [0, 0.018, -0.02], r: [0.5, 0, 0] }),
      part(box(0.05, 0.03, 0.04), '#c8b88a', { p: [0, 0.015, -0.05] }),
    ]);
  }
  return merge([
    part(cylinder(0.014, 0.014, 0.09, 8), '#a88a4a', { r: [Math.PI / 2, 0, 0], p: [0, 0.05, 0.02] }),
    xf(wheel(0.028), { p: [0.03, 0.028, 0] }),
    xf(wheel(0.028), { p: [-0.03, 0.028, 0] }),
    part(box(0.02, 0.012, 0.06), WOOD, { p: [0, 0.025, -0.04] }),
  ]);
}

export function cart(): BufferGeometry {
  return merge([
    part(box(0.07, 0.025, 0.09), WOOD, { p: [0, 0.04, 0] }),
    xf(wheel(0.026), { p: [0.042, 0.026, 0] }),
    xf(wheel(0.026), { p: [-0.042, 0.026, 0] }),
    part(xf(ellipsoid(0.04, 0.03, 0.05, 10, 6), { p: [0, 0.065, 0] }), '#f2ead6', {}),
    part(box(0.084, 0.006, 0.006), '#ffffff', { p: [0, 0.07, 0.0] }, 1),
    part(box(0.006, 0.006, 0.08), WOOD, { p: [0.015, 0.03, 0.08] }),
    part(box(0.006, 0.006, 0.08), WOOD, { p: [-0.015, 0.03, 0.08] }),
  ]);
}

function hull(len: number, beam: number, depth: number, color: string): BufferGeometry {
  const g = lathe([[0.001, -depth], [beam * 0.7, -depth * 0.8], [beam, -depth * 0.2], [beam * 1.04, 0.0]], 14);
  g.scale(1, 1, len / beam / 2);
  return gradient(g, '#4a2e1a', color);
}

function sail(w: number, h: number, team = true, color = '#ffffff'): BufferGeometry {
  const g = box(w, h, 0.004);
  return prep(g, color, team ? 1 : 0);
}

export function ship(kind: string): BufferGeometry {
  const parts: BufferGeometry[] = [];
  switch (kind) {
    case 'galley': {
      parts.push(xf(hull(0.32, 0.055, 0.04, '#9a6a3c'), { p: [0, 0.03, 0] }));
      for (let k = 0; k < 5; k++) for (const s of [-1, 1]) parts.push(part(box(0.09, 0.004, 0.006), '#c9a06a', { r: [0, 0, s * 0.45], p: [s * 0.075, 0.02, -0.1 + k * 0.05] }));
      parts.push(part(cylinder(0.004, 0.005, 0.2, 5), '#6b4a2e', { p: [0, 0.13, 0] }));
      const s = sail(0.12, 0.09);
      parts.push(xf(s, { p: [0, 0.16, 0.004] }));
      parts.push(part(box(0.12, 0.012, 0.005), '#f4ecdc', { p: [0, 0.16, 0.007] }));
      parts.push(part(cone(0.012, 0.04, 5), '#c9a06a', { r: [Math.PI / 2, 0, 0], p: [0, 0.04, 0.18] }));
      break;
    }
    case 'caravel': case 'frigate': {
      const big = kind === 'frigate';
      const len = big ? 0.42 : 0.34;
      parts.push(xf(hull(len, big ? 0.075 : 0.065, 0.05, big ? '#6a4a2e' : '#9a6a3c'), { p: [0, 0.035, 0] }));
      parts.push(part(box(0.11, 0.04, 0.08), big ? '#5a3e26' : '#8a5a34', { p: [0, 0.055, -len * 0.38] }));
      const masts = big ? [-0.11, 0, 0.11] : [-0.06, 0.07];
      masts.forEach((z, k) => {
        const h = big ? (k === 1 ? 0.3 : 0.25) : 0.24;
        parts.push(part(cylinder(0.004, 0.005, h, 5), '#5a3a22', { p: [0, 0.04 + h / 2, z] }));
        parts.push(xf(sail(0.12, 0.08, false, '#fbf6ea'), { p: [0, 0.04 + h * 0.55, z + 0.006] }));
        parts.push(xf(sail(0.09, 0.06, false, '#fbf6ea'), { p: [0, 0.04 + h * 0.85, z + 0.006] }));
        parts.push(part(box(0.03, 0.08, 0.006), '#ffffff', { p: [0, 0.04 + h * 0.55, z + 0.01] }, 1));
        parts.push(part(box(0.1, 0.012, 0.006), '#ffffff', { p: [0, 0.04 + h * 0.55, z + 0.011] }, 1));
      });
      if (big) for (let k = 0; k < 4; k++) for (const s of [-1, 1]) parts.push(part(cylinder(0.005, 0.005, 0.02, 6), '#222', { r: [0, 0, Math.PI / 2], p: [s * 0.075, 0.03, -0.1 + k * 0.06] }));
      parts.push(part(box(0.04, 0.025, 0.003), '#ffffff', { p: [0.02, 0.04 + (big ? 0.33 : 0.27), masts[0]] }, 1));
      break;
    }
    case 'ironclad': {
      parts.push(xf(hull(0.36, 0.07, 0.04, '#3a3a40'), { p: [0, 0.03, 0] }));
      parts.push(part(softBox(0.1, 0.035, 0.16, 0.25), '#4a4a52', { p: [0, 0.03, 0] }));
      parts.push(part(cylinder(0.014, 0.016, 0.08, 10), '#2a2a2e', { p: [0, 0.09, 0.0] }));
      parts.push(part(box(0.1, 0.008, 0.02), '#ffffff', { p: [0, 0.066, -0.06] }, 1));
      break;
    }
    case 'destroyer': case 'battleship': case 'stealthcruiser': {
      const bb = kind === 'battleship';
      const st = kind === 'stealthcruiser';
      const len = bb ? 0.5 : 0.42;
      const col = st ? '#4a4e56' : '#8a96a2';
      parts.push(xf(hull(len, bb ? 0.08 : 0.065, 0.04, col), { p: [0, 0.03, 0] }));
      parts.push(part(box(bb ? 0.13 : 0.11, 0.012, len * 0.85), col, { p: [0, 0.035, 0] }));
      if (st) {
        parts.push(part(faceted(xf(cone(0.06, 0.09, 4), { r: [0, Math.PI / 4, 0], s: [1, 1, 1.8] })), '#3a3e46', { p: [0, 0.085, -0.03] }));
      } else {
        parts.push(part(softBox(0.06, bb ? 0.08 : 0.06, 0.08), '#dfe4ea', { p: [0, 0.04 + (bb ? 0.04 : 0.03), -0.02] }));
        parts.push(part(cylinder(0.004, 0.004, 0.08, 4), '#dfe4ea', { p: [0, 0.16, -0.02] }));
        const turrets = bb ? [0.14, 0.07, -0.13] : [0.11, -0.12];
        for (const z of turrets) {
          parts.push(part(cylinder(0.022, 0.024, 0.018, 10), col, { p: [0, 0.05, z] }));
          parts.push(part(cylinder(0.004, 0.004, 0.06, 5), '#3a3e44', { r: [Math.PI / 2, 0, 0], p: [0.008, 0.054, z + Math.sign(z) * 0.04] }));
          parts.push(part(cylinder(0.004, 0.004, 0.06, 5), '#3a3e44', { r: [Math.PI / 2, 0, 0], p: [-0.008, 0.054, z + Math.sign(z) * 0.04] }));
        }
      }
      parts.push(part(box(0.03, 0.02, 0.003), '#ffffff', { p: [0.016, st ? 0.15 : 0.19, -0.02] }, 1));
      parts.push(part(box(bb ? 0.13 : 0.11, 0.006, 0.03), '#ffffff', { p: [0, 0.042, len * 0.38] }, 1));
      break;
    }
  }
  return merge(parts);
}

export function aircraft(kind: string): BufferGeometry {
  const parts: BufferGeometry[] = [];
  if (kind === 'biplane') {
    parts.push(part(capsule(0.018, 0.1, 4, 10), '#ffffff', { r: [Math.PI / 2, 0, 0] }, 1));
    parts.push(part(box(0.24, 0.006, 0.05), '#f2e6c8', { p: [0, 0.022, 0.02] }), part(box(0.24, 0.006, 0.05), '#f2e6c8', { p: [0, -0.012, 0.02] }));
    for (const x of [-0.08, 0.08]) parts.push(part(cylinder(0.002, 0.002, 0.034, 3), WOOD, { p: [x, 0.005, 0.02] }));
    parts.push(part(box(0.08, 0.004, 0.03), '#f2e6c8', { p: [0, 0.0, -0.075] }), part(box(0.004, 0.04, 0.03), '#ffffff', { p: [0, 0.02, -0.075] }, 1));
    parts.push(part(box(0.08, 0.006, 0.004), '#3a3a3a', { p: [0, 0, 0.08] }));
  } else if (kind === 'jet') {
    parts.push(part(capsule(0.016, 0.14, 4, 10), '#c8d0d8', { r: [Math.PI / 2, 0, 0] }));
    parts.push(part(cone(0.016, 0.05, 10), '#c8d0d8', { r: [Math.PI / 2, 0, 0], p: [0, 0, 0.1] }));
    const wing = cone(0.1, 0.12, 3);
    wing.scale(1, 1, 0.06);
    wing.rotateX(Math.PI / 2);
    wing.rotateY(Math.PI);
    parts.push(part(wing, '#ffffff', { p: [0, 0, -0.01] }, 1));
    parts.push(part(box(0.004, 0.05, 0.04), '#c8d0d8', { p: [0, 0.03, -0.07] }));
    parts.push(part(ellipsoid(0.012, 0.01, 0.03, 8, 6), '#5fd0ff', { p: [0, 0.014, 0.05] }));
  } else {
    for (const [x, z] of [[0, 0.05], [-0.06, -0.03], [0.06, -0.03]]) {
      parts.push(part(softBox(0.03, 0.012, 0.03), '#2a2c30', { p: [x, 0, z] }));
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(part(cylinder(0.012, 0.012, 0.002, 10), '#5ff0ff', { p: [x + dx * 0.02, 0.006, z + dz * 0.02] }));
      parts.push(part(sphere(0.006, 6, 4), '#ffffff', { p: [x, 0.008, z] }, 1));
    }
  }
  return merge(parts);
}

/** A ring of sandbags and stakes around a fortified squad. */
export function fort(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 11; k++) {
    const a = Math.PI * 0.62 + (k / 10) * Math.PI * 1.76;
    const g = ellipsoid(0.03, 0.016, 0.018, 8, 5);
    g.rotateY(-a);
    g.translate(Math.cos(a) * 0.17, 0.014, Math.sin(a) * 0.17);
    parts.push(prep(g, k % 2 ? '#c9b07a' : '#bba06a'));
    if (k % 3 === 0) parts.push(part(cone(0.007, 0.05, 5), '#8a6440', { p: [Math.cos(a) * 0.2, 0.025, Math.sin(a) * 0.2], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] }));
  }
  return merge(parts);
}

// --- Squads on the map ----------------------------------------------------------------------
