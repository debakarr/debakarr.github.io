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
  /** Merge flat, evenly lit faces of one colour into larger quads (fewer triangles). */
  greedy?: boolean;
}

/**
 * Voxel values may carry a team weight above the colour: value = rgb | (round(team × 100) << 24).
 * Meshes always get a `team` attribute (0 when there is none).
 */
export function withTeam(rgb: number, team: number): number {
  return (rgb & 0xffffff) + Math.round(Math.max(0, Math.min(1, team)) * 100) * 0x1000000;
}

/** Meshes a grid: one quad per exposed face, AO and colour baked into vertices. */
export function meshGrid(g: VoxelGrid, opts: MeshOptions = {}): { main: BufferGeometry; split: BufferGeometry | null } {
  const S = VOX * (opts.scale ?? 1);
  const jitter = opts.jitter ?? 0.07;
  const useAO = opts.ao !== false;
  const out = [newBuf(), newBuf()];
  const solid = (x: number, y: number, z: number) => g.cells.has(VoxelGrid.key(x, y, z));
  const c = new Color();
  // flat faces waiting to be merged: per buffer, direction and slice
  const flat = new Map<string, Map<string, number>>();
  const emit = (buf: Buf, f: Face, origin: number[], du: number, dv: number, rgb: number, team: number, ao: number[]) => {
    c.setHex(rgb);
    const base = buf.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      const corner = f.corners[i];
      const q = [origin[0] + corner[0], origin[1] + corner[1], origin[2] + corner[2]];
      q[f.u] = origin[f.u] + corner[f.u] * du;
      q[f.v] = origin[f.v] + corner[f.v] * dv;
      buf.pos.push((q[0] + g.offset[0]) * S, (q[1] + g.offset[1]) * S, (q[2] + g.offset[2]) * S);
      buf.nor.push(f.n[0], f.n[1], f.n[2]);
      const l = AO[ao[i]];
      buf.col.push(c.r * l, c.g * l, c.b * l);
      buf.team.push(team);
    }
    if (ao[0] + ao[2] > ao[1] + ao[3]) buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const [k, value] of g.cells) {
    const z = (k % 512) - 256;
    const y = (Math.floor(k / 512) % 512) - 256;
    const x = Math.floor(k / (512 * 512)) - 256;
    const col = value & 0xffffff;
    const team = Math.floor(value / 0x1000000) / 100;
    const plain = opts.plain?.(value) ?? false;
    const bi = opts.split?.(value) ? 1 : 0;
    const buf = out[bi];
    let rgb = col;
    if (!plain && jitter) {
      c.setHex(col);
      const j = 1 + (hash(x, y, z) - 0.5) * jitter;
      c.setRGB(Math.min(1, c.r * j), Math.min(1, c.g * j), Math.min(1, c.b * j));
      rgb = c.getHex();
    }
    for (let fi = 0; fi < 6; fi++) {
      const f = FACES[fi];
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
      const p = [x, y, z];
      if (opts.greedy && ao[0] === 3 && ao[1] === 3 && ao[2] === 3 && ao[3] === 3) {
        const axis = f.n[0] ? 0 : f.n[1] ? 1 : 2;
        const key = `${bi}|${fi}|${p[axis]}`;
        let m = flat.get(key);
        if (!m) flat.set(key, (m = new Map()));
        m.set(`${p[f.u]},${p[f.v]}`, rgb + team * 100 * 0x1000000);
        continue;
      }
      emit(buf, f, p, 1, 1, rgb, team, ao);
    }
  }
  // greedy merge: grow rectangles of equal colour over each slice
  for (const [key, m] of flat) {
    const [bs, fs, ss] = key.split('|');
    const f = FACES[Number(fs)];
    const axis = f.n[0] ? 0 : f.n[1] ? 1 : 2;
    const slice = Number(ss);
    const cells = [...m.keys()].map((k2) => k2.split(',').map(Number) as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const done = new Set<string>();
    for (const [u0, v0] of cells) {
      const k0 = `${u0},${v0}`;
      if (done.has(k0)) continue;
      const val = m.get(k0)!;
      let w = 1;
      while (m.get(`${u0 + w},${v0}`) === val && !done.has(`${u0 + w},${v0}`)) w++;
      let h = 1;
      grow: for (;;) {
        for (let du = 0; du < w; du++) {
          const k2 = `${u0 + du},${v0 + h}`;
          if (m.get(k2) !== val || done.has(k2)) break grow;
        }
        h++;
      }
      for (let dv = 0; dv < h; dv++) for (let du = 0; du < w; du++) done.add(`${u0 + du},${v0 + dv}`);
      const origin = [0, 0, 0];
      origin[axis] = slice;
      origin[f.u] = u0;
      origin[f.v] = v0;
      emit(out[Number(bs)], f, origin, w, h, val & 0xffffff, Math.floor(val / 0x1000000) / 100, [3, 3, 3, 3]);
    }
  }
  return { main: toGeo(out[0]), split: out[1].pos.length ? toGeo(out[1]) : null };
}

/**
 * Voxelises a vertex-coloured mesh (with an optional `team` attribute): every
 * triangle is sampled into cells of `size`, keeping colour and team. The
 * result is meshed with AO and greedy merging, in the source's coordinates.
 */
export interface VoxelizeOptions {
  /** Texture colour at a UV (sRGB 0–1, multiplied in); return false to leave the point empty (alpha cut). */
  texture?: (u: number, v: number, out: Color) => boolean;
  /** Colour multiplier (a material's colour). */
  tint?: Color;
  /** Snap colours to this many levels per channel, so flat areas merge into larger quads. */
  levels?: number;
  /** Corner ambient occlusion (default on; off merges more faces on big pieces). */
  ao?: boolean;
}

export function voxelize(src: BufferGeometry, size: number, vopts: VoxelizeOptions = {}): BufferGeometry {
  // cells are counted from the mesh's own corner (grid keys hold ±256 cells),
  // on the world-aligned lattice of `size`, so neighbouring meshes line up
  src.computeBoundingBox();
  const bmin = src.boundingBox!.min;
  const bmax = src.boundingBox!.max;
  size = Math.max(size, (Math.max(bmax.x - bmin.x, bmax.y - bmin.y, bmax.z - bmin.z) + 1e-6) / 480);
  const o0 = Math.floor(bmin.x / size);
  const o1 = Math.floor(bmin.y / size);
  const o2 = Math.floor(bmin.z / size);
  const g = new VoxelGrid([o0 - 200, o1 - 200, o2 - 200]);
  const pos = src.attributes.position;
  const col = src.attributes.color;
  const team = src.attributes.team;
  const uvs = vopts.texture ? src.attributes.uv : undefined;
  const T = new Color();
  const idx = src.index;
  const tri = idx ? idx.count / 3 : pos.count / 3;
  const A = new Color();
  const B = new Color();
  const C = new Color();
  const at = (i: number) => (idx ? idx.getX(i) : i);
  const pa = [0, 0, 0];
  const pb = [0, 0, 0];
  const pc = [0, 0, 0];
  const votes = new Map<number, Map<number, [number, number]>>();
  const mix = new Color();
  for (let t = 0; t < tri; t++) {
    const ia = at(t * 3);
    const ib = at(t * 3 + 1);
    const ic = at(t * 3 + 2);
    pa[0] = pos.getX(ia); pa[1] = pos.getY(ia); pa[2] = pos.getZ(ia);
    pb[0] = pos.getX(ib); pb[1] = pos.getY(ib); pb[2] = pos.getZ(ib);
    pc[0] = pos.getX(ic); pc[1] = pos.getY(ic); pc[2] = pos.getZ(ic);
    if (col) {
      A.setRGB(col.getX(ia), col.getY(ia), col.getZ(ia));
      B.setRGB(col.getX(ib), col.getY(ib), col.getZ(ib));
      C.setRGB(col.getX(ic), col.getY(ic), col.getZ(ic));
    } else A.setRGB(1, 1, 1), B.setRGB(1, 1, 1), C.setRGB(1, 1, 1);
    const ta = team ? team.getX(ia) : 0;
    const tb = team ? team.getX(ib) : 0;
    const tc = team ? team.getX(ic) : 0;
    const e = Math.max(Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]), Math.hypot(pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]), Math.hypot(pc[0] - pb[0], pc[1] - pb[1], pc[2] - pb[2]));
    const n = Math.max(1, Math.ceil(e / (size * 0.45)));
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n - i; j++) {
        const u = i / n;
        const v = j / n;
        const w = 1 - u - v;
        const x = Math.floor((pa[0] * w + pb[0] * u + pc[0] * v) / size) - o0 + 200;
        const y = Math.floor((pa[1] * w + pb[1] * u + pc[1] * v) / size) - o1 + 200;
        const z = Math.floor((pa[2] * w + pb[2] * u + pc[2] * v) / size) - o2 + 200;
        let r = A.r * w + B.r * u + C.r * v;
        let gg = A.g * w + B.g * u + C.g * v;
        let bb = A.b * w + B.b * u + C.b * v;
        const tm = ta * w + tb * u + tc * v;
        if (uvs && vopts.texture) {
          const tu = uvs.getX(ia) * w + uvs.getX(ib) * u + uvs.getX(ic) * v;
          const tv = uvs.getY(ia) * w + uvs.getY(ib) * u + uvs.getY(ic) * v;
          if (!vopts.texture(tu, tv, T)) continue;
          T.convertSRGBToLinear();
          r *= T.r;
          gg *= T.g;
          bb *= T.b;
        }
        if (vopts.tint) {
          r *= vopts.tint.r;
          gg *= vopts.tint.g;
          bb *= vopts.tint.b;
        }
        // vertex colours are linear; voxel values are sRGB hex like every other colour here
        let rgb = mix.setRGB(Math.min(1, r), Math.min(1, gg), Math.min(1, bb)).getHex();
        if (vopts.levels) {
          const L = vopts.levels - 1;
          const q = (c: number) => Math.round((Math.round((c / 255) * L) / L) * 255);
          rgb = (q((rgb >> 16) & 255) << 16) | (q((rgb >> 8) & 255) << 8) | q(rgb & 255);
        }
        const value = withTeam(rgb, tm);
        // vote: the colour covering most of the cell's surface wins (bricks over mortar)
        const ck = VoxelGrid.key(x, y, z);
        let tally = votes.get(ck);
        if (!tally) votes.set(ck, (tally = new Map()));
        const q = ((rgb >> 3) & 0x1f1f1f) + Math.round(tm * 4) * 0x1000000;
        const t0 = tally.get(q);
        if (t0) t0[0]++;
        else tally.set(q, [1, value]);
      }
  }
  for (const [ck, tally] of votes) {
    let best: [number, number] | null = null;
    for (const t of tally.values()) if (!best || t[0] > best[0]) best = t;
    g.cells.set(ck, best![1]);
  }
  return meshGrid(g, { jitter: 0, scale: size / VOX, greedy: true, ao: vopts.ao }).main;
}

interface Buf {
  pos: number[];
  nor: number[];
  col: number[];
  team: number[];
  idx: number[];
}

function newBuf(): Buf {
  return { pos: [], nor: [], col: [], team: [], idx: [] };
}

function toGeo(b: Buf): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(b.nor), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(b.col), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((b.pos.length / 3) * 2), 2));
  g.setAttribute('team', new BufferAttribute(new Float32Array(b.team.length ? b.team : new Array(b.pos.length / 3).fill(0)), 1));
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
      buf.team.push(0);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return toGeo(buf);
}
