// Geometry helpers for the procedural art: rounded shapes, lathes, organic
// displacement, vertex colour painting and merging into one buffer so a
// whole tree or rock can be drawn as a single instanced mesh.

import {
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise2D } from '../../shared/noise';
import { Rng } from '../../shared/rng';

const tmpColor = new Color();

/** Normalizes a geometry to non-indexed position/normal/uv/color so merges never fail. */
export function prep(geo: BufferGeometry, color?: string | Color): BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color || color !== undefined) {
    tmpColor.set(color ?? '#ffffff');
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = tmpColor.r;
      c[i * 3 + 1] = tmpColor.g;
      c[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new BufferAttribute(c, 3));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

export function merge(geos: BufferGeometry[]): BufferGeometry {
  const ready = geos.map((g) => prep(g));
  const out = mergeGeometries(ready, false)!;
  ready.forEach((g) => g.dispose());
  return out;
}

/** Applies translation/rotation/scale in one go (returns the same geometry). */
export function xf(geo: BufferGeometry, t: { p?: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] | number }): BufferGeometry {
  if (t.s !== undefined) {
    const s = typeof t.s === 'number' ? [t.s, t.s, t.s] : t.s;
    geo.scale(s[0], s[1], s[2]);
  }
  if (t.r) {
    geo.rotateX(t.r[0]);
    geo.rotateY(t.r[1]);
    geo.rotateZ(t.r[2]);
  }
  if (t.p) geo.translate(t.p[0], t.p[1], t.p[2]);
  return geo;
}

export function ellipsoid(rx: number, ry: number, rz: number, w = 20, h = 14): BufferGeometry {
  const g = new SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}

export function capsule(r: number, len: number, cap = 6, radial = 12): BufferGeometry {
  return new CapsuleGeometry(r, len, cap, radial);
}

export function cylinder(rt: number, rb: number, h: number, seg = 12, open = false): BufferGeometry {
  return new CylinderGeometry(rt, rb, h, seg, 1, open);
}

export function cone(r: number, h: number, seg = 12): BufferGeometry {
  return new ConeGeometry(r, h, seg);
}

export function torus(r: number, tube: number, rs = 8, ts = 20, arc = Math.PI * 2): BufferGeometry {
  return new TorusGeometry(r, tube, rs, ts, arc);
}

/** Revolves a [radius, y] profile around Y. */
export function lathe(profile: [number, number][], seg = 16): BufferGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(0.0001, r), y)), seg);
}

/** A rounded teardrop/petal: good for ears, leaves, fins, flames, hair locks. */
export function teardrop(r: number, len: number, seg = 12, sharp = 1.6): BufferGeometry {
  const pts: [number, number][] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = r * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.0 + 0.0001)), 0.8) * Math.pow(1 - t, sharp * 0.35);
    pts.push([rr, t * len]);
  }
  pts[0][0] = 0.0001;
  pts[n][0] = 0.0001;
  return lathe(pts, seg);
}

/** Organic lumpiness: offsets vertices along their normal with noise. */
export function lumpy(geo: BufferGeometry, amount: number, freq: number, seed: number): BufferGeometry {
  const noise = new Noise2D(new Rng(seed));
  const pos = geo.attributes.position;
  const v = new Vector3();
  // Displace along the direction from the centre so shared seams stay closed.
  geo.computeBoundingSphere();
  const c = geo.boundingSphere!.center;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = v.clone().sub(c);
    const len = d.length() || 1;
    const k = noise.fbm(v.x * freq + v.y * 0.7 * freq, v.z * freq - v.y * 0.4 * freq, 3);
    d.multiplyScalar((len + k * amount) / len);
    pos.setXYZ(i, c.x + d.x, c.y + d.y, c.z + d.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function rockGeo(seed: number, detail = 1): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail);
  const rng = new Rng(seed);
  g.scale(rng.float(0.9, 1.3), rng.float(0.6, 0.9), rng.float(0.8, 1.2));
  lumpy(g, 0.28, 1.4, seed);
  return g;
}

/** Paints vertex colours by height (and optionally top-facing moss). */
export function gradient(geo: BufferGeometry, bottom: string, top: string, opts: { moss?: string; mossAmount?: number; jitter?: number; seed?: number } = {}): BufferGeometry {
  const g = prep(geo);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const col = g.attributes.color as BufferAttribute;
  const a = new Color(bottom);
  const b = new Color(top);
  const moss = opts.moss ? new Color(opts.moss) : null;
  const rng = new Rng(opts.seed ?? 1);
  const span = Math.max(0.0001, bb.max.y - bb.min.y);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / span;
    tmpColor.copy(a).lerp(b, t);
    if (moss && nor.getY(i) > 0.45) tmpColor.lerp(moss, Math.min(1, (nor.getY(i) - 0.45) * 2.2) * (opts.mossAmount ?? 0.85));
    if (opts.jitter) tmpColor.offsetHSL(0, 0, (rng.next() - 0.5) * opts.jitter);
    col.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
  }
  col.needsUpdate = true;
  return g;
}

export function solid(geo: BufferGeometry, color: string): BufferGeometry {
  return prep(geo, color);
}
