// Creatures are sculpted, not assembled: each design is a list of smooth
// shapes (spheres, ellipsoids, rounded cones) blended into one continuous
// signed-distance field, then turned into a mesh with naive surface nets.
// The same distances give every vertex its colour region (crisp, like
// anime colour blocks) and its bone weights (soft, so joints bend smoothly).

export type V3 = [number, number, number];

export type Shape =
  | { k: 'sphere'; c: V3; r: number }
  | { k: 'ellipsoid'; c: V3; r: V3 }
  /** A rounded cone from `a` (radius ra) to `b` (radius rb); a capsule when they match. */
  | { k: 'cone'; a: V3; b: V3; ra: number; rb: number };

export interface Part {
  shape: Shape;
  /** Bone that carries this part. */
  bone: string;
  /** Palette key (body, belly, accent, ...) or a literal #colour. */
  color: string;
  /** Smooth-union radius with everything before it, in metres. */
  blend?: number;
  /** Cut this shape away instead of adding it. */
  carve?: boolean;
  /** Also add a copy mirrored across x = 0 (bone names ending in L become R). */
  mirror?: boolean;
}

/** Recolours whatever surface lies inside a shape (bellies, ear insides, tips). */
export interface Paint {
  shape: Shape;
  color: string;
  /** Edge softness in metres (0 = hard). */
  soft?: number;
  mirror?: boolean;
  /** Only paint vertices whose nearest part uses one of these bones. */
  bones?: string[];
}

export function mirrorShape(s: Shape): Shape {
  const m = (v: V3): V3 => [-v[0], v[1], v[2]];
  if (s.k === 'sphere') return { ...s, c: m(s.c) };
  if (s.k === 'ellipsoid') return { ...s, c: m(s.c) };
  return { ...s, a: m(s.a), b: m(s.b) };
}

export function mirrorBone(b: string): string {
  return b.endsWith('L') ? `${b.slice(0, -1)}R` : b;
}

export function expandParts(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    out.push(p);
    if (p.mirror) out.push({ ...p, shape: mirrorShape(p.shape), bone: mirrorBone(p.bone), mirror: false });
  }
  return out;
}

export function expandPaints(paints: Paint[]): Paint[] {
  const out: Paint[] = [];
  for (const p of paints) {
    out.push(p);
    if (p.mirror) out.push({ ...p, shape: mirrorShape(p.shape), bones: p.bones?.map(mirrorBone), mirror: false });
  }
  return out;
}

/** Signed distance from (x, y, z) to one shape. */
export function shapeDist(s: Shape, x: number, y: number, z: number): number {
  switch (s.k) {
    case 'sphere':
      return Math.hypot(x - s.c[0], y - s.c[1], z - s.c[2]) - s.r;
    case 'ellipsoid': {
      // Inigo Quilez's bound: exact on the surface, good near it
      const px = (x - s.c[0]) / s.r[0];
      const py = (y - s.c[1]) / s.r[1];
      const pz = (z - s.c[2]) / s.r[2];
      const k0 = Math.hypot(px, py, pz);
      const k1 = Math.hypot(px / s.r[0], py / s.r[1], pz / s.r[2]);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(s.r[0], s.r[1], s.r[2]);
    }
    case 'cone': {
      // rounded cone (Inigo Quilez)
      const bax = s.b[0] - s.a[0];
      const bay = s.b[1] - s.a[1];
      const baz = s.b[2] - s.a[2];
      const l2 = bax * bax + bay * bay + baz * baz;
      const rr = s.ra - s.rb;
      const a2 = l2 - rr * rr;
      const il2 = 1 / l2;
      const pax = x - s.a[0];
      const pay = y - s.a[1];
      const paz = z - s.a[2];
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const qx = pax * l2 - bax * yy;
      const qy = pay * l2 - bay * yy;
      const qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - s.rb;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - s.ra;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - s.ra;
    }
  }
}

function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/** The blended field of a list of (already expanded) parts. */
export function field(parts: Part[]): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    let d = Infinity;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const di = shapeDist(p.shape, x, y, z);
      if (i === 0) d = p.carve ? -di : di;
      else d = p.carve ? smax(d, -di, p.blend ?? 0) : smin(d, di, p.blend ?? 0);
    }
    return d;
  };
}

export function shapeBounds(s: Shape): [V3, V3] {
  if (s.k === 'sphere') return [[s.c[0] - s.r, s.c[1] - s.r, s.c[2] - s.r], [s.c[0] + s.r, s.c[1] + s.r, s.c[2] + s.r]];
  if (s.k === 'ellipsoid') return [[s.c[0] - s.r[0], s.c[1] - s.r[1], s.c[2] - s.r[2]], [s.c[0] + s.r[0], s.c[1] + s.r[1], s.c[2] + s.r[2]]];
  const r = Math.max(s.ra, s.rb);
  return [
    [Math.min(s.a[0], s.b[0]) - r, Math.min(s.a[1], s.b[1]) - r, Math.min(s.a[2], s.b[2]) - r],
    [Math.max(s.a[0], s.b[0]) + r, Math.max(s.a[1], s.b[1]) + r, Math.max(s.a[2], s.b[2]) + r],
  ];
}

export interface RawMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/**
 * Naive surface nets: one vertex per grid cell the surface passes through
 * (the average of its edge crossings, then projected onto the surface), one
 * quad per grid edge the surface crosses. Normals come from the field's
 * gradient, so the result is smooth like a sculpt.
 */
export function surfaceNets(f: (x: number, y: number, z: number) => number, lo: V3, hi: V3, h: number): RawMesh {
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 2;
  const ny = Math.ceil((hi[1] - lo[1]) / h) + 2;
  const nz = Math.ceil((hi[2] - lo[2]) / h) + 2;
  const ox = lo[0] - h * 0.5;
  const oy = lo[1] - h * 0.5;
  const oz = lo[2] - h * 0.5;
  const val = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[at(i, j, k)] = f(ox + i * h, oy + j * h, oz + k * h);
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cat = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corner = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = val[at(i + corner[c][0], j + corner[c][1], k + corner[c][2])];
          cv[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of edges) {
          const va = cv[a];
          const vb = cv[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
          sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
          sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
          n++;
        }
        cellVert[cat(i, j, k)] = pos.length / 3;
        pos.push(ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h);
      }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = val[at(i, j, k)] < 0;
        // edge along +x from (i,j,k)
        if (i < nx - 2 && v0 !== val[at(i + 1, j, k)] < 0)
          quad(cellVert[cat(i, j - 1, k - 1)], cellVert[cat(i, j, k - 1)], cellVert[cat(i, j, k)], cellVert[cat(i, j - 1, k)], !v0);
        // edge along +y
        if (j < ny - 2 && v0 !== val[at(i, j + 1, k)] < 0)
          quad(cellVert[cat(i - 1, j, k - 1)], cellVert[cat(i - 1, j, k)], cellVert[cat(i, j, k)], cellVert[cat(i, j, k - 1)], !v0);
        // edge along +z
        if (k < nz - 2 && v0 !== val[at(i, j, k + 1)] < 0)
          quad(cellVert[cat(i - 1, j - 1, k)], cellVert[cat(i, j - 1, k)], cellVert[cat(i, j, k)], cellVert[cat(i - 1, j, k)], !v0);
      }
  // project onto the surface and take the gradient for normals
  const positions = new Float32Array(pos);
  const normals = new Float32Array(pos.length);
  const e = h * 0.35;
  for (let v = 0; v < positions.length; v += 3) {
    let x = positions[v];
    let y = positions[v + 1];
    let z = positions[v + 2];
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let it = 0; it < 3; it++) {
      gx = f(x + e, y, z) - f(x - e, y, z);
      gy = f(x, y + e, z) - f(x, y - e, z);
      gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl;
      gy /= gl;
      gz /= gl;
      const d = f(x, y, z);
      x -= gx * d;
      y -= gy * d;
      z -= gz * d;
    }
    positions[v] = x;
    positions[v + 1] = y;
    positions[v + 2] = z;
    normals[v] = gx;
    normals[v + 1] = gy;
    normals[v + 2] = gz;
  }
  return { positions, normals, indices: new Uint32Array(idx) };
}

/** Walks from `from` along `dir` (unit) until it meets the surface; returns the hit point. */
export function march(f: (x: number, y: number, z: number) => number, from: V3, dir: V3, maxDist = 2): V3 | null {
  let t = 0;
  for (let i = 0; i < 96 && t < maxDist; i++) {
    const x = from[0] + dir[0] * t;
    const y = from[1] + dir[1] * t;
    const z = from[2] + dir[2] * t;
    const d = f(x, y, z);
    if (Math.abs(d) < 1e-4) return [x, y, z];
    t += d * 0.9;
    if (t < 0) t = 0;
  }
  return null;
}

export function gradient(f: (x: number, y: number, z: number) => number, p: V3, e = 0.002): V3 {
  const gx = f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]);
  const gy = f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]);
  const gz = f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}
