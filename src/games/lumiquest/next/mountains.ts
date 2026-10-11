// Distant mountains as a matte painting: three rings of ridge silhouettes
// around the vale, unlit and coloured by aerial perspective (the farther the
// range, the paler and bluer, melting into the horizon haze at the foot),
// with snow on the far peaks and a warmer cast on the side facing the sun.

import { BufferAttribute, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, type Vector3 } from 'three';
import { Noise2D } from '../../shared/noise';
import { Rng } from '../../shared/rng';

interface Layer {
  radius: number;
  base: number;
  height: number;
  /** 0 = nearest (darkest, greenest) .. 1 = farthest (palest, bluest). */
  depth: number;
  snow: boolean;
  seed: number;
}

const LAYERS: Layer[] = [
  { radius: 860, base: -8, height: 230, depth: 1, snow: true, seed: 11 },
  { radius: 700, base: -8, height: 150, depth: 0.6, snow: false, seed: 23 },
  { radius: 560, base: -6, height: 90, depth: 0.25, snow: false, seed: 37 },
];

export function mountainBackdrop(horizon: Color, sunDir: Vector3): Group {
  const g = new Group();
  const near = new Color('#46646e');
  const far = new Color('#9fb2d0');
  const snowC = new Color('#f2efe8');
  const warm = new Color('#f0c890');
  for (const L of LAYERS) {
    const noise = new Noise2D(new Rng(L.seed));
    const geo = new CylinderGeometry(1, 1, 1, 360, 12, true);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const t = pos.getY(i) + 0.5; // 0 foot .. 1 crest
      const ca = Math.cos(a) * 2.2;
      const sa = Math.sin(a) * 2.2;
      const ridge = 0.35 + 0.65 * (0.6 * noise.ridged(ca + 4, sa - 3, 5) + 0.4 * noise.fbm(ca * 3 + 1, sa * 3, 3) * 0.5 + 0.2);
      const crest = L.height * ridge;
      const y = L.base + t * crest;
      pos.setXYZ(i, Math.cos(a) * L.radius, y, Math.sin(a) * L.radius);
      // colour: aerial perspective by layer, haze at the foot, sun side warmer
      c.copy(near).lerp(far, L.depth);
      const toward = Math.max(0, Math.cos(a) * sunDir.x + Math.sin(a) * sunDir.z);
      c.lerp(warm, toward * 0.18 * (0.4 + L.depth * 0.6));
      if (L.snow && y > L.base + L.height * 0.62) c.lerp(snowC, Math.min(1, (y - (L.base + L.height * 0.62)) / (L.height * 0.12)) * 0.85);
      c.lerp(horizon, (1 - t) * (0.35 + L.depth * 0.3));
      c.lerp(horizon, L.depth * 0.18);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    const m = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }));
    m.frustumCulled = false;
    m.renderOrder = -9;
    g.add(m);
  }
  return g;
}
