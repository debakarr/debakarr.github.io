// Geometry helpers for the procedural 3D art: primitives, vertex-colour
// painting and merging into one buffer so a whole tree, house or soldier is
// drawn as a single (often instanced) mesh. Every geometry carries a `team`
// attribute: 1 where the owner's colour shows (tunics, roofs, banners).

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
  BoxGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise2D } from '../../shared/noise';
import { Rng } from '../../shared/rng';

const tmpColor = new Color();
const KEEP = ['position', 'normal', 'uv', 'color', 'team', 'bob'];

/** Normalizes a geometry to non-indexed position/normal/uv/color/team so merges never fail. */
export function prep(geo: BufferGeometry, color?: string | Color, team?: number): BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
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
  if (!g.attributes.team || team !== undefined) g.setAttribute('team', new BufferAttribute(new Float32Array(n).fill(team ?? 0), 1));
  if (!g.attributes.bob) g.setAttribute('bob', new BufferAttribute(new Float32Array(n), 1));
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

export type V3 = [number, number, number];

/** Applies scale, rotation (XYZ order) and translation in one go (returns the same geometry). */
export function xf(geo: BufferGeometry, t: { p?: V3; r?: V3; s?: V3 | number }): BufferGeometry {
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

/** A coloured, positioned part ready for merging. */
export function part(geo: BufferGeometry, color: string, t: { p?: V3; r?: V3; s?: V3 | number } = {}, team = 0): BufferGeometry {
  return xf(prep(geo, color, team), t);
}

export function ellipsoid(rx: number, ry: number, rz: number, w = 16, h = 12): BufferGeometry {
  const g = new SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}

export function sphere(r: number, w = 16, h = 12): BufferGeometry {
  return new SphereGeometry(r, w, h);
}

export function hemisphere(r: number, w = 16, h = 8): BufferGeometry {
  return new SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2);
}

export function box(w: number, h: number, d: number): BufferGeometry {
  return new BoxGeometry(w, h, d);
}

/** A box with softly bevelled vertical edges (a chamfered octagonal prism) — reads friendlier than a hard cube. */
export function softBox(w: number, h: number, d: number, bevel = 0.18): BufferGeometry {
  const bx = (w / 2) * bevel * 2;
  const bz = (d / 2) * bevel * 2;
  const pts: [number, number][] = [
    [w / 2 - bx, -d / 2], [w / 2, -d / 2 + bz], [w / 2, d / 2 - bz], [w / 2 - bx, d / 2],
    [-w / 2 + bx, d / 2], [-w / 2, d / 2 - bz], [-w / 2, -d / 2 + bz], [-w / 2 + bx, -d / 2],
  ];
  return prism(pts, h);
}

/** Extrudes a convex polygon (x, z points, counter-clockwise seen from above) to height h, base at y=0. */
export function prism(pts: [number, number][], h: number): BufferGeometry {
  const pos: number[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % n];
    pos.push(ax, 0, az, bx, 0, bz, bx, h, bz, ax, 0, az, bx, h, bz, ax, h, az);
  }
  for (let i = 1; i < n - 1; i++) {
    pos.push(pts[0][0], h, pts[0][1], pts[i + 1][0], h, pts[i + 1][1], pts[i][0], h, pts[i][1]);
    pos.push(pts[0][0], 0, pts[0][1], pts[i][0], 0, pts[i][1], pts[i + 1][0], 0, pts[i + 1][1]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  fixWinding(g);
  g.computeVertexNormals();
  return g;
}

/** Makes every triangle face away from the geometry's centroid (for convex shapes built by hand). */
function fixWinding(g: BufferGeometry): void {
  const p = g.attributes.position;
  const c = new Vector3();
  for (let i = 0; i < p.count; i++) c.x += p.getX(i), c.y += p.getY(i), c.z += p.getZ(i);
  c.divideScalar(p.count);
  const a = new Vector3(), b = new Vector3(), d = new Vector3(), n = new Vector3(), m = new Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    d.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(m.subVectors(d, a));
    m.copy(a).add(b).add(d).divideScalar(3).sub(c);
    if (n.dot(m) < 0) {
      p.setXYZ(i + 1, d.x, d.y, d.z);
      p.setXYZ(i + 2, b.x, b.y, b.z);
    }
  }
}

/** A pitched (gable) roof: ridge along X, width w (x), depth d (z), height h, base at y=0. */
export function gable(w: number, d: number, h: number, over = 0.06): BufferGeometry {
  const x = w / 2 + over;
  const z = d / 2 + over;
  const pos = [
    // slopes
    -x, 0, z, x, 0, z, x, h, 0, -x, 0, z, x, h, 0, -x, h, 0,
    x, 0, -z, -x, 0, -z, -x, h, 0, x, 0, -z, -x, h, 0, x, h, 0,
    // gables
    x, 0, z, x, 0, -z, x, h, 0,
    -x, 0, -z, -x, 0, z, -x, h, 0,
    // underside
    -x, 0, z, -x, 0, -z, x, 0, -z, -x, 0, z, x, 0, -z, x, 0, z,
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  fixWinding(g);
  g.computeVertexNormals();
  return g;
}

/** A four-sided pyramid roof. */
export function pyramid(w: number, d: number, h: number, over = 0.05): BufferGeometry {
  const g = new ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(w + over * 2, h, d + over * 2);
  g.translate(0, h / 2, 0);
  return g;
}

export function capsule(r: number, len: number, cap = 5, radial = 10): BufferGeometry {
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
export function lathe(profile: [number, number][], seg = 14): BufferGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(0.0001, r), y)), seg);
}

export function ico(r: number, detail = 1): BufferGeometry {
  return new IcosahedronGeometry(r, detail);
}

/** Organic lumpiness: offsets vertices away from the centre with noise. */
export function lumpy(geo: BufferGeometry, amount: number, freq: number, seed: number): BufferGeometry {
  const noise = new Noise2D(new Rng(seed));
  const pos = geo.attributes.position;
  const v = new Vector3();
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

/** Smooth normals that point away from a centre — soft round canopies without facets. */
export function radialNormals(geo: BufferGeometry, center = new Vector3()): BufferGeometry {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal as BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(center).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  nor.needsUpdate = true;
  return geo;
}

export function rockGeo(seed: number, detail = 1): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail);
  const rng = new Rng(seed);
  g.scale(rng.float(0.9, 1.3), rng.float(0.6, 0.9), rng.float(0.8, 1.2));
  lumpy(g, 0.28, 1.4, seed);
  return g;
}

/** Paints vertex colours by height (and optionally top-facing moss/snow). */
export function gradient(geo: BufferGeometry, bottom: string, top: string, opts: { moss?: string; mossAmount?: number; jitter?: number; seed?: number; above?: number } = {}): BufferGeometry {
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
    if (moss && nor.getY(i) > 0.45 && t >= (opts.above ?? 0)) tmpColor.lerp(moss, Math.min(1, (nor.getY(i) - 0.45) * 2.2) * (opts.mossAmount ?? 0.85));
    if (opts.jitter) tmpColor.offsetHSL(0, 0, (rng.next() - 0.5) * opts.jitter);
    col.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
  }
  col.needsUpdate = true;
  return g;
}

/** Recolours the vertices above a height (e.g. snow caps). */
export function capColor(geo: BufferGeometry, y: number, color: string, soft = 0.08, up = 0.2): BufferGeometry {
  const g = prep(geo);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const col = g.attributes.color as BufferAttribute;
  const c = new Color(color);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) - y) / soft + (nor.getY(i) - up) * 0.6));
    if (t <= 0) continue;
    tmpColor.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(c, t);
    col.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
  }
  col.needsUpdate = true;
  return g;
}

/** Flat-shades a geometry (for crisp low-poly rock faces). */
export function faceted(geo: BufferGeometry): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

/** Tags every vertex with a value of the `bob` attribute (which figure of a squad it belongs to). */
export function tagBob(geo: BufferGeometry, v: number): BufferGeometry {
  const g = prep(geo);
  (g.attributes.bob as BufferAttribute).array.fill(v);
  g.attributes.bob.needsUpdate = true;
  return g;
}
