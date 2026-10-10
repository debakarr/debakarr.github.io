// The heightfield of Brightwater Vale. Heights are computed once from the
// layout in data/world.ts (hills, plateaus, river, pool, cove, cave) plus
// seeded noise, stored in a grid, and drawn as chunked meshes so most of the
// map is frustum-culled. Collision samples the same triangles the mesh draws.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Texture,
} from 'three';
import { Noise2D } from '../../shared/noise';
import { Rng } from '../../shared/rng';
import {
  CAVE, CHANNEL, COVE, HILL, LOCATION_BY_ID, OUTPOST, PATHS, POOL, RIVER, RIVER_HALF_WIDTH, RUINS,
  WATER_LEVEL, WORLD_HALF, type V2,
} from '../data/world';
import { groundDetail } from '../engine/textures';

export const STEP = 1.5;
export const RES = Math.round((WORLD_HALF * 2) / STEP) + 1; // vertices per side
const CHUNK_QUADS = 40;

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const dist = (x: number, z: number, p: V2): number => Math.hypot(x - p[0], z - p[1]);

export interface PolyHit {
  d: number;
  /** Position along the polyline in segments (0..n-1). */
  t: number;
  /** Unit direction of the segment. */
  dx: number;
  dz: number;
}

export function polyDistance(points: readonly V2[], x: number, z: number): PolyHit {
  let best: PolyHit = { d: Infinity, t: 0, dx: 0, dz: 1 };
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
    const px = ax + vx * u;
    const pz = az + vz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) {
      const l = Math.sqrt(len2);
      best = { d, t: i + u, dx: vx / l, dz: vz / l };
    }
  }
  return best;
}

export type Surface = 'grass' | 'path' | 'sand' | 'rock' | 'stone' | 'water' | 'cave' | 'snow' | 'plaza';

export class Terrain {
  readonly heights = new Float32Array(RES * RES);
  readonly colors = new Float32Array(RES * RES * 3);
  readonly surface = new Uint8Array(RES * RES);
  private noise: Noise2D;
  private noise2: Noise2D;
  readonly group = new Group();
  readonly chunks: Mesh[] = [];
  material: MeshStandardMaterial | null = null;

  constructor(seed = 1337) {
    const rng = new Rng(seed);
    this.noise = new Noise2D(rng.fork('h'));
    this.noise2 = new Noise2D(rng.fork('c'));
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const x = -WORLD_HALF + i * STEP;
        const z = -WORLD_HALF + j * STEP;
        this.heights[j * RES + i] = this.compute(x, z);
      }
    }
    this.paint();
  }

  /** Raw terrain shape at a point (before grid sampling). */
  compute(x: number, z: number): number {
    const n = this.noise;
    let h = 3.4 + 1.5 * n.fbm(x / 70, z / 70, 4) + 0.55 * n.fbm(x / 22 + 9, z / 22 - 4, 3);
    // forest floor rolls more
    const forest = smoothstep(-30, -60, x) * smoothstep(30, 0, z);
    h += forest * 1.4 * n.fbm(x / 30 - 3, z / 30 + 7, 3);
    // windmill rise
    h += 3 * (1 - smoothstep(4, 20, dist(x, z, LOCATION_BY_ID.windmill.at)));
    // Beacon Hill: a plateau with a gentle slope
    const dh = dist(x, z, HILL.at);
    const hill = 1 - smoothstep(HILL.plateau, HILL.foot, dh);
    h += HILL.height * hill + 0.25 * n.fbm(x / 8, z / 8, 2) * hill;
    // Ruins plateau
    const dr = dist(x, z, RUINS.at);
    h += RUINS.height * (1 - smoothstep(RUINS.plateau, RUINS.foot, dr));
    // Outpost: flatten
    const dout = dist(x, z, OUTPOST.at);
    h = mix(OUTPOST.height + 0.15 * n.fbm(x / 10, z / 10, 2), h, smoothstep(OUTPOST.radius * 0.6, OUTPOST.radius, dout));
    // Mountain ring at the edges
    const rd = Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(z), 4), 0.25);
    const ridge = n.ridged(x / 45 + 3, z / 45 - 2, 4);
    const edge = smoothstep(120, 168, rd);
    h += edge * edge * (22 + 16 * ridge + 6 * n.fbm(x / 20, z / 20, 3));
    // Northern cliffs behind the falls and the cave
    const north = smoothstep(-97, -110, z);
    h += north * (20 + 9 * ridge + 3 * n.fbm(x / 9, z / 9, 2));
    // River bed
    const rv = polyDistance(RIVER, x, z);
    const bed = WATER_LEVEL - 1.75 - 0.3 * n.get(x / 12, z / 12);
    const bank = smoothstep(RIVER_HALF_WIDTH - 1.2, RIVER_HALF_WIDTH + 5.5, rv.d);
    const nearBank = mix(Math.min(h, 2.6), h, smoothstep(RIVER_HALF_WIDTH + 3, RIVER_HALF_WIDTH + 12, rv.d));
    h = mix(bed, nearBank, bank);
    // Falls pool
    const dp = dist(x, z, POOL.at);
    if (dp < POOL.radius + 8) h = Math.min(h, mix(POOL.floor, h, smoothstep(POOL.radius - 3, POOL.radius + 5, dp)));
    // Channel under the falls and the hidden cove
    const inChan = smoothstep(CHANNEL.x0 - 1.2, CHANNEL.x0 + 0.5, x) * smoothstep(CHANNEL.x1 + 1.2, CHANNEL.x1 - 0.5, x) * smoothstep(CHANNEL.z1 + 1, CHANNEL.z1 - 0.5, z) * smoothstep(CHANNEL.z0 - 2, CHANNEL.z0, z);
    if (inChan > 0) h = mix(h, CHANNEL.floor, inChan);
    const dc = dist(x, z, COVE.at);
    if (dc < COVE.radius + 3) {
      const floor = mix(CHANNEL.floor, 2.1, smoothstep(-111.5, -118, z)) + 0.15 * n.get(x / 3, z / 3);
      h = mix(floor, h, smoothstep(COVE.radius - 1, COVE.radius + 2.2, dc));
    }
    // Glimmer Cave: a corridor and a hall carved into the cliff
    const cf = CAVE.floor + 0.12 * n.get(x / 4, z / 4);
    const c = CAVE.corridor;
    const inCorr = smoothstep(c.half + 1.4, c.half - 0.2, Math.abs(x - c.x)) * smoothstep(c.z0 - 2, c.z0 + 1, z) * smoothstep(c.z1 + 2, c.z1 - 1, z);
    const inHall = 1 - smoothstep(CAVE.hallRadius - 0.8, CAVE.hallRadius + 1.4, dist(x, z, CAVE.hall));
    const inDeep = 1 - smoothstep(5.5, 7.5, dist(x, z, CAVE.deep));
    const cave = Math.max(inCorr, inHall, inDeep);
    if (cave > 0 && h > cf) h = mix(h, cf, cave);
    // Moonwell pond
    const dm = dist(x, z, LOCATION_BY_ID.moonwell.at);
    if (dm < 6) h -= 0.9 * (1 - smoothstep(2.5, 5.5, dm));
    // Paths sink a touch
    for (const p of PATHS) {
      const pd = polyDistance(p.points, x, z).d;
      if (pd < p.width) h -= 0.06 * (1 - pd / p.width);
    }
    return h;
  }

  private paint(): void {
    const col = new Color();
    const tmp = new Color();
    const grassA = new Color('#4cae38');
    const grassB = new Color('#a6dc4c');
    const forestG = new Color('#358a38');
    const dirt = new Color('#c7a06a');
    const sand = new Color('#e6d39c');
    const rock = new Color('#958f86');
    const rockDark = new Color('#6f6a66');
    const snow = new Color('#f2f6ff');
    const caveC = new Color('#5c5868');
    const plaza = new Color('#d2c2a0');
    const ruinStone = new Color('#bdb7a8');
    const flowerTint = new Color('#c7e06a');
    const n = this.noise2;
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const k = j * RES + i;
        const x = -WORLD_HALF + i * STEP;
        const z = -WORLD_HALF + j * STEP;
        const h = this.heights[k];
        const slope = this.slopeAtIndex(i, j);
        let surf: Surface = 'grass';
        const v = n.fbm(x / 25, z / 25, 3) * 0.5 + 0.5;
        col.copy(grassA).lerp(grassB, Math.min(1, Math.max(0, v * 1.3 - 0.15)));
        const forest = smoothstep(-30, -62, x) * smoothstep(34, 4, z);
        col.lerp(forestG, forest * 0.75);
        // meadow flowers tint
        const meadow = 1 - smoothstep(18, 40, dist(x, z, LOCATION_BY_ID.meadow.at));
        if (meadow > 0) col.lerp(flowerTint, meadow * 0.25 * (n.get(x / 6, z / 6) * 0.5 + 0.5));
        // ruins plateau stone
        const dr = dist(x, z, RUINS.at);
        if (dr < RUINS.plateau + 1) {
          const t = (1 - smoothstep(RUINS.plateau - 6, RUINS.plateau + 1, dr)) * (0.55 + 0.45 * Math.max(0, n.get(x / 3, z / 3)));
          col.lerp(ruinStone, t);
          if (t > 0.5) surf = 'stone';
        }
        // outpost plaza
        const dout = dist(x, z, OUTPOST.at);
        if (dout < 14) {
          const t = (1 - smoothstep(9, 14, dout)) * 0.75;
          col.lerp(plaza, t);
          if (t > 0.4) surf = 'plaza';
        }
        // paths
        for (const p of PATHS) {
          const pd = polyDistance(p.points, x, z).d;
          const t = 1 - smoothstep(p.width * 0.35, p.width * 0.75 + 0.6 * n.get(x / 2, z / 2), pd);
          if (t > 0) {
            tmp.copy(dirt).offsetHSL(0, 0, (n.get(x / 3, z / 3)) * 0.05);
            col.lerp(tmp, t);
            if (t > 0.5) surf = 'path';
          }
        }
        // sand along water
        if (h < WATER_LEVEL + 1.1) {
          const t = smoothstep(WATER_LEVEL + 1.1, WATER_LEVEL + 0.3, h);
          col.lerp(sand, t);
          if (t > 0.5) surf = 'sand';
        }
        if (h < WATER_LEVEL - 0.05) {
          col.lerp(new Color('#7a9a78'), smoothstep(WATER_LEVEL, WATER_LEVEL - 1.5, h) * 0.6);
          surf = 'water';
        }
        // cliffs and mountains
        const rockT = smoothstep(0.75, 1.25, slope);
        if (rockT > 0) {
          tmp.copy(rock).lerp(rockDark, n.get(x / 5, z / 5) * 0.5 + 0.5);
          col.lerp(tmp, rockT);
          if (rockT > 0.5) surf = 'rock';
        }
        if (h > 30) {
          const t = smoothstep(30, 40, h + 4 * n.get(x / 9, z / 9)) * (1 - rockT * 0.6);
          col.lerp(snow, t);
          if (t > 0.5) surf = 'snow';
        }
        // cave floor
        if (this.inCave(x, z) && h < CAVE.floor + 1.5) {
          col.copy(caveC).offsetHSL(0, 0, n.get(x / 2, z / 2) * 0.04);
          surf = 'cave';
        }
        this.colors[k * 3] = col.r;
        this.colors[k * 3 + 1] = col.g;
        this.colors[k * 3 + 2] = col.b;
        this.surface[k] = SURFACES.indexOf(surf);
      }
    }
  }

  private slopeAtIndex(i: number, j: number): number {
    const H = this.heights;
    const a = H[j * RES + Math.max(0, i - 1)];
    const b = H[j * RES + Math.min(RES - 1, i + 1)];
    const c = H[Math.max(0, j - 1) * RES + i];
    const d = H[Math.min(RES - 1, j + 1) * RES + i];
    const gx = (b - a) / (2 * STEP);
    const gz = (d - c) / (2 * STEP);
    return Math.hypot(gx, gz);
  }

  inCave(x: number, z: number): boolean {
    const c = CAVE.corridor;
    if (Math.abs(x - c.x) < c.half + 0.5 && z < c.z1 - 3 && z > c.z0 - 2) return true;
    if (dist(x, z, CAVE.hall) < CAVE.hallRadius + 0.5) return true;
    return dist(x, z, CAVE.deep) < 6.5;
  }

  /** Height of the drawn terrain surface (matches the mesh triangles). */
  height(x: number, z: number): number {
    const fx = (x + WORLD_HALF) / STEP;
    const fz = (z + WORLD_HALF) / STEP;
    const i = Math.max(0, Math.min(RES - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(RES - 2, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i));
    const v = Math.min(1, Math.max(0, fz - j));
    const H = this.heights;
    const h00 = H[j * RES + i];
    const h10 = H[j * RES + i + 1];
    const h01 = H[(j + 1) * RES + i];
    const h11 = H[(j + 1) * RES + i + 1];
    // Triangles split along the (i,j+1)-(i+1,j) diagonal, as in the mesh.
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  /** Approximate surface normal (y-up) via central differences. */
  normal(x: number, z: number, out: { x: number; y: number; z: number }): void {
    const e = 0.6;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    out.x = -hx / l;
    out.y = (2 * e) / l;
    out.z = -hz / l;
  }

  surfaceAt(x: number, z: number): Surface {
    const i = Math.round((x + WORLD_HALF) / STEP);
    const j = Math.round((z + WORLD_HALF) / STEP);
    if (i < 0 || j < 0 || i >= RES || j >= RES) return 'rock';
    return SURFACES[this.surface[j * RES + i]];
  }

  colorAt(x: number, z: number, out: Color): Color {
    const i = Math.max(0, Math.min(RES - 1, Math.round((x + WORLD_HALF) / STEP)));
    const j = Math.max(0, Math.min(RES - 1, Math.round((z + WORLD_HALF) / STEP)));
    const k = (j * RES + i) * 3;
    return out.setRGB(this.colors[k], this.colors[k + 1], this.colors[k + 2]);
  }

  /** Builds the chunk meshes. */
  build(detail: Texture = groundDetail()): Group {
    void detail;
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
    // voxel look over the walkable (smooth) surface: colour in 0.5 m blocks and a
    // darker edge on every half-metre terrace, so the vale reads as stacked blocks
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vVoxW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvVoxW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vVoxW;
float voxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 cell = floor(vVoxW.xz * 2.0);
    diffuseColor.rgb *= 0.92 + 0.12 * voxHash(cell);
    float band = fract(vVoxW.y * 2.0);
    diffuseColor.rgb *= band < 0.12 ? 0.82 : 1.0;
  }`);
    };
    mat.customProgramCacheKey = () => 'lq-voxel-ground';
    this.material = mat;
    const chunksPerSide = Math.ceil((RES - 1) / CHUNK_QUADS);
    for (let cj = 0; cj < chunksPerSide; cj++) {
      for (let ci = 0; ci < chunksPerSide; ci++) {
        const i0 = ci * CHUNK_QUADS;
        const j0 = cj * CHUNK_QUADS;
        const i1 = Math.min(RES - 1, i0 + CHUNK_QUADS);
        const j1 = Math.min(RES - 1, j0 + CHUNK_QUADS);
        const w = i1 - i0 + 1;
        const hgt = j1 - j0 + 1;
        const pos = new Float32Array(w * hgt * 3);
        const nor = new Float32Array(w * hgt * 3);
        const col = new Float32Array(w * hgt * 3);
        const uv = new Float32Array(w * hgt * 2);
        const nrm = { x: 0, y: 1, z: 0 };
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const k = (j - j0) * w + (i - i0);
            const x = -WORLD_HALF + i * STEP;
            const z = -WORLD_HALF + j * STEP;
            pos[k * 3] = x;
            pos[k * 3 + 1] = this.heights[j * RES + i];
            pos[k * 3 + 2] = z;
            this.normal(x, z, nrm);
            nor[k * 3] = nrm.x;
            nor[k * 3 + 1] = nrm.y;
            nor[k * 3 + 2] = nrm.z;
            const c = (j * RES + i) * 3;
            col[k * 3] = this.colors[c];
            col[k * 3 + 1] = this.colors[c + 1];
            col[k * 3 + 2] = this.colors[c + 2];
            uv[k * 2] = x / 5;
            uv[k * 2 + 1] = z / 5;
          }
        }
        const idx: number[] = [];
        for (let j = 0; j < hgt - 1; j++) {
          for (let i = 0; i < w - 1; i++) {
            const a = j * w + i;
            const b = a + 1;
            const c = a + w;
            const d = c + 1;
            idx.push(a, c, b, b, c, d);
          }
        }
        const geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(pos, 3));
        geo.setAttribute('normal', new BufferAttribute(nor, 3));
        geo.setAttribute('color', new BufferAttribute(col, 3));
        geo.setAttribute('uv', new BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        const mesh = new Mesh(geo, mat);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.chunks.push(mesh);
        this.group.add(mesh);
      }
    }
    return this.group;
  }

  /** Water surface height at a point, or null when there is no water. */
  waterAt(x: number, z: number): number | null {
    return this.height(x, z) < WATER_LEVEL - 0.02 && !this.inCave(x, z) ? WATER_LEVEL : null;
  }

  dispose(): void {
    for (const c of this.chunks) c.geometry.dispose();
    this.material?.dispose();
  }
}

export const SURFACES: Surface[] = ['grass', 'path', 'sand', 'rock', 'stone', 'water', 'cave', 'snow', 'plaza'];
