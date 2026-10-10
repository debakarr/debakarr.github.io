// Voxel grids and their meshes. Every character is drawn voxel by voxel in
// code; the mesher keeps only faces that touch air and bakes per-corner
// ambient occlusion and a little per-voxel colour variation into the vertex
// colours, so figures read as rendered voxel art rather than flat boxes.

import { BufferAttribute, BufferGeometry, Color } from 'three';

/** World size of one voxel (a standing figure is 30 voxels, 1.26 tall). */
export const VOX = 0.042;

const tmp = new Color();

export function packColor(c: string | number): number {
  return typeof c === 'number' ? c : tmp.set(c).getHex();
}

/** A sparse grid of coloured voxels. Coordinates are integers; `offset` shifts the mesh (in voxels). */
export class VoxelGrid {
  readonly cells = new Map<number, number>();
  constructor(public offset: [number, number, number] = [0, 0, 0]) {}

  static key(x: number, y: number, z: number): number {
    return ((x + 256) * 512 + (y + 256)) * 512 + (z + 256);
  }

  set(x: number, y: number, z: number, color: string | number): void {
    this.cells.set(VoxelGrid.key(x, y, z), packColor(color));
  }

  get(x: number, y: number, z: number): number | undefined {
    return this.cells.get(VoxelGrid.key(x, y, z));
  }

  has(x: number, y: number, z: number): boolean {
    return this.cells.has(VoxelGrid.key(x, y, z));
  }

  delete(x: number, y: number, z: number): void {
    this.cells.delete(VoxelGrid.key(x, y, z));
  }

  /** Fills x0 ≤ x < x1 (and likewise y, z). */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string | number): this {
    const c = packColor(color);
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) this.cells.set(VoxelGrid.key(x, y, z), c);
    return this;
  }

  /** Recolours existing voxels in a box (paint, never adds). */
  paint(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string | number): this {
    const c = packColor(color);
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const k = VoxelGrid.key(x, y, z);
          if (this.cells.has(k)) this.cells.set(k, c);
        }
    return this;
  }

  /** Voxels whose centres fall inside the ellipsoid. */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: string | number): this {
    const c = packColor(color);
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          const dz = (z + 0.5 - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1) this.cells.set(VoxelGrid.key(x, y, z), c);
        }
    return this;
  }

  /** An upright cylinder (voxel centres within r of the axis). */
  cylinder(cx: number, cz: number, r: number, y0: number, y1: number, color: string | number, rz = r): this {
    const c = packColor(color);
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
        const dx = (x + 0.5 - cx) / r;
        const dz = (z + 0.5 - cz) / rz;
        if (dx * dx + dz * dz > 1) continue;
        for (let y = y0; y < y1; y++) this.cells.set(VoxelGrid.key(x, y, z), c);
      }
    return this;
  }

  /** A one-voxel line between two points (inclusive). */
  line(a: [number, number, number], b: [number, number, number], color: string | number): this {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]), 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.set(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), color);
    }
    return this;
  }

  /** Recolours every voxel the predicate answers for. */
  recolor(fn: (x: number, y: number, z: number, color: number) => string | number | null | undefined): this {
    for (const [k, col] of this.cells) {
      const z = (k % 512) - 256;
      const y = (Math.floor(k / 512) % 512) - 256;
      const x = Math.floor(k / (512 * 512)) - 256;
      const out = fn(x, y, z, col);
      if (out !== null && out !== undefined) this.cells.set(k, packColor(out));
    }
    return this;
  }

  /** Removes every voxel the predicate accepts. */
  remove(fn: (x: number, y: number, z: number, color: number) => boolean): this {
    for (const [k, col] of [...this.cells]) {
      const z = (k % 512) - 256;
      const y = (Math.floor(k / 512) % 512) - 256;
      const x = Math.floor(k / (512 * 512)) - 256;
      if (fn(x, y, z, col)) this.cells.delete(k);
    }
    return this;
  }

  get size(): number {
    return this.cells.size;
  }
}

// ---------------------------------------------------------------------------
// Meshing

interface Face {
  n: [number, number, number];
  corners: [number, number, number][];
  /** The two tangent axes (indices into xyz). */
  u: number;
  v: number;
}

const FACES: Face[] = (() => {
  const raw: [number, number, number][] = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];
  return raw.map((n) => {
    const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const side = n[axis] > 0 ? 1 : 0;
    const quad: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    let corners = quad.map(([a, b]) => {
      const c: [number, number, number] = [0, 0, 0];
      c[axis] = side;
      c[u] = a;
      c[v] = b;
      return c;
    });
    // wind counter-clockwise seen from outside
    const e1 = corners[1].map((x, i) => x - corners[0][i]);
    const e2 = corners[2].map((x, i) => x - corners[0][i]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) corners = corners.reverse();
    return { n, corners, u, v };
  });
})();

const AO = [0.52, 0.7, 0.86, 1];

function hash(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export interface MeshOptions {
  /** Lightness variation per voxel (0.06 = ±3%). */
  jitter?: number;
  /** Corner ambient occlusion (default on). */
  ao?: boolean;
  /** Colours kept exactly as given: no AO, no jitter (marker colours for team tinting). */
  plain?: (color: number) => boolean;
  /** Voxels of these colours go to a second geometry (e.g. skin). */
  split?: (color: number) => boolean;
  /** Extra world scale on top of VOX. */
  scale?: number;
}

/** Meshes a grid: one quad per exposed face, AO and colour baked into vertices. */
export function meshGrid(g: VoxelGrid, opts: MeshOptions = {}): { main: BufferGeometry; split: BufferGeometry | null } {
  const S = VOX * (opts.scale ?? 1);
  const jitter = opts.jitter ?? 0.07;
  const useAO = opts.ao !== false;
  const out = [newBuf(), newBuf()];
  const solid = (x: number, y: number, z: number) => g.cells.has(VoxelGrid.key(x, y, z));
  const c = new Color();
  for (const [k, col] of g.cells) {
    const z = (k % 512) - 256;
    const y = (Math.floor(k / 512) % 512) - 256;
    const x = Math.floor(k / (512 * 512)) - 256;
    const p = [x, y, z];
    const plain = opts.plain?.(col) ?? false;
    const buf = out[opts.split?.(col) ? 1 : 0];
    for (const f of FACES) {
      const nx = x + f.n[0];
      const ny = y + f.n[1];
      const nz = z + f.n[2];
      if (solid(nx, ny, nz)) continue;
      const ao: number[] = [];
      for (const corner of f.corners) {
        if (!useAO || plain) {
          ao.push(3);
          continue;
        }
        const du = corner[f.u] ? 1 : -1;
        const dv = corner[f.v] ? 1 : -1;
        const q = [nx, ny, nz];
        const s1 = [...q];
        s1[f.u] += du;
        const s2 = [...q];
        s2[f.v] += dv;
        const cc = [...q];
        cc[f.u] += du;
        cc[f.v] += dv;
        const a = solid(s1[0], s1[1], s1[2]) ? 1 : 0;
        const b = solid(s2[0], s2[1], s2[2]) ? 1 : 0;
        const d = solid(cc[0], cc[1], cc[2]) ? 1 : 0;
        ao.push(a && b ? 0 : 3 - (a + b + d));
      }
      c.setHex(col);
      if (!plain && jitter) {
        const j = 1 + (hash(x, y, z) - 0.5) * jitter;
        c.r = Math.min(1, c.r * j);
        c.g = Math.min(1, c.g * j);
        c.b = Math.min(1, c.b * j);
      }
      const base = buf.pos.length / 3;
      for (let i = 0; i < 4; i++) {
        const corner = f.corners[i];
        buf.pos.push((p[0] + corner[0] + g.offset[0]) * S, (p[1] + corner[1] + g.offset[1]) * S, (p[2] + corner[2] + g.offset[2]) * S);
        buf.nor.push(f.n[0], f.n[1], f.n[2]);
        const l = AO[ao[i]];
        buf.col.push(c.r * l, c.g * l, c.b * l);
      }
      // flip the diagonal so AO gradients don't crease
      if (ao[0] + ao[2] > ao[1] + ao[3]) buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { main: toGeo(out[0]), split: out[1].pos.length ? toGeo(out[1]) : null };
}

interface Buf {
  pos: number[];
  nor: number[];
  col: number[];
  idx: number[];
}

function newBuf(): Buf {
  return { pos: [], nor: [], col: [], idx: [] };
}

function toGeo(b: Buf): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(b.nor), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(b.col), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((b.pos.length / 3) * 2), 2));
  g.setIndex(b.idx);
  return g;
}

/** Flat coloured quads on a plane facing +Z (face decals): pixels are [x, y, z, colour] in voxels. */
export function decalGeometry(pixels: [number, number, number, string][], scale = 1): BufferGeometry {
  const S = VOX * scale;
  const buf = newBuf();
  const c = new Color();
  for (const [x, y, z, col] of pixels) {
    c.set(col);
    const base = buf.pos.length / 3;
    const zz = z * S + 0.0016;
    buf.pos.push(x * S, y * S, zz, (x + 1) * S, y * S, zz, (x + 1) * S, (y + 1) * S, zz, x * S, (y + 1) * S, zz);
    for (let i = 0; i < 4; i++) {
      buf.nor.push(0, 0, 1);
      buf.col.push(c.r, c.g, c.b);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return toGeo(buf);
}
