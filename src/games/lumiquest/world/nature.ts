// Trees, rocks, bushes, ferns, mushrooms, logs, grass and flowers.
//
// Large props are scattered once (seeded). Each kind has two instanced
// meshes: a detailed one for everything near the camera (which casts
// shadows) and a low-poly one for the distance. Both are refilled from the
// placement list whenever the camera moves a few metres, so the whole vale
// costs two draw calls per kind, small props stop at a shorter range, and
// nothing past the draw distance is drawn. Grass and flowers are streamed in
// 24 m chunks around the player and disposed when left behind.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three';
import { Rng } from '../../shared/rng';
import { CAVE, HILL, INTERACTABLES, LOCATION_BY_ID, OUTPOST, PATHS, PLAY_HALF, RUINS, WATER_LEVEL, type V2 } from '../data/world';
import { capsule, cone, cylinder, ellipsoid, gradient, lumpy, merge, prep, rockGeo, teardrop, xf } from '../engine/geometry';
import type { CollisionWorld } from '../engine/physics';
import { groundDetail } from '../engine/textures';
import { polyDistance, smoothstep, type Terrain } from './terrain';
import { windPatch } from './wind';

export interface Clearing {
  x: number;
  z: number;
  r: number;
}

/** Areas props are kept out of (buildings, plazas, puzzle spots). */
export const clearings: Clearing[] = [];

type Kind = 'oak' | 'oak2' | 'pine' | 'birch' | 'blossom' | 'elder' | 'bush' | 'berry' | 'fern' | 'rock' | 'rock2' | 'boulder' | 'mushroom' | 'glowshroom' | 'log' | 'stump' | 'reed';

interface Kit {
  hi: BufferGeometry;
  lo: BufferGeometry;
  mat: Material;
  /** Collider radius at scale 1 (0 = walk-through). */
  collide: number;
  /** Collider height at scale 1. */
  height: number;
  shadow: boolean;
}

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpV = new Vector3();
const tmpS = new Vector3();
const up = new Vector3(0, 1, 0);

/**
 * A fluffy canopy: lumpy blobs whose normals point away from each blob's
 * centre (soft, cloud-like shading), dark and cool underneath, bright and
 * warm where the sun hits the top.
 */
function canopy(seed: number, blobs: [number, number, number, number][], bottom: string, top: string, detail: number): BufferGeometry {
  const v = new Vector3();
  const parts = blobs.map(([x, y, z, r], i) => {
    const g = lumpy(new IcosahedronGeometry(r, detail), r * 0.16, 1.1 / r, seed + i);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      // radial normals: shared by every face at a vertex, so the shading is smooth
      v.fromBufferAttribute(pos, k).normalize();
      const nx = nor.getX(k) * 0.05 + v.x * 0.95;
      const ny = nor.getY(k) * 0.05 + v.y * 0.95;
      const nz = nor.getZ(k) * 0.05 + v.z * 0.95;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.setXYZ(k, nx / l, ny / l, nz / l);
    }
    g.translate(x, y, z);
    return prep(g);
  });
  const g = merge(parts);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const col = g.attributes.color as BufferAttribute;
  const a = new Color(bottom);
  const b = new Color(top);
  const sun = new Color('#f2f78a');
  const c = new Color();
  const rng = new Rng(seed);
  const span = Math.max(0.01, bb.max.y - bb.min.y);
  for (let k = 0; k < pos.count; k++) {
    const t = (pos.getY(k) - bb.min.y) / span;
    const ny = nor.getY(k);
    c.copy(a).lerp(b, Math.min(1, t * 0.55 + (ny * 0.5 + 0.5) * 0.55));
    if (ny > 0.55) c.lerp(sun, (ny - 0.55) * 0.55);
    c.offsetHSL((rng.next() - 0.5) * 0.02, 0, (rng.next() - 0.5) * 0.05);
    col.setXYZ(k, c.r, c.g, c.b);
  }
  return g;
}

function trunk(h: number, r0: number, r1: number, color = '#7a5236', seg = 8): BufferGeometry {
  return gradient(xf(cylinder(r1, r0, h, seg), { p: [0, h / 2, 0] }), color, '#9a6a44');
}

function buildKits(): Record<Kind, Kit> {
  const leaf = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, map: groundDetail() });
  const leafWind = windPatch(leaf.clone(), { bend: 0.06, key: 'tree' }) as MeshStandardMaterial;
  const solid = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const rockMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: groundDetail() });
  const plantWind = windPatch(new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), { bend: 0.45, key: 'plant' }) as MeshStandardMaterial;
  const glow = new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: new Color('#46e0d0'), emissiveIntensity: 0.7 });

  const oakBlobs: [number, number, number, number][] = [[0, 3.7, 0, 1.6], [1.2, 3.3, 0.3, 1.15], [-1.1, 3.4, -0.4, 1.2], [0.2, 4.6, -0.6, 1.1], [-0.3, 3.1, 1.1, 1.05], [0.6, 4.4, 0.8, 0.95], [-0.8, 4.3, 0.5, 0.9], [0.9, 3.0, -0.9, 0.9]];
  const oak = (detail: number) => merge([trunk(3, 0.36, 0.22), xf(trunk(1.1, 0.12, 0.06), { r: [0, 0, 0.9], p: [0.15, 2.0, 0] }), canopy(3, oakBlobs, '#23702e', '#9ee05a', detail)]);
  const oak2Blobs: [number, number, number, number][] = [[0, 3.0, 0, 1.4], [0.9, 2.7, -0.4, 1.0], [-0.8, 2.8, 0.5, 1.05], [0, 3.9, 0.2, 0.95]];
  const oak2 = (detail: number) => merge([trunk(2.5, 0.3, 0.2), canopy(8, oak2Blobs, '#2f8434', '#b6e866', detail)]);
  const pine = (detail: number) => {
    const tiers: BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const r = 1.9 - i * 0.42;
      tiers.push(lumpy(xf(cone(r, 1.9 - i * 0.2, detail ? 12 : 7), { p: [0, 1.8 + i * 1.15, 0] }), 0.1, 1.5, 20 + i));
    }
    return merge([trunk(2.2, 0.3, 0.2, '#6a4630'), gradient(merge(tiers), '#175c3c', '#62b862', { jitter: 0.05 })]);
  };
  const birchBlobs: [number, number, number, number][] = [[0, 4.4, 0, 1.0], [0.6, 3.9, 0.3, 0.8], [-0.5, 4.0, -0.3, 0.85], [0.1, 5.0, 0.1, 0.7]];
  const birch = (detail: number) => merge([gradient(xf(cylinder(0.12, 0.2, 4.2, 8), { p: [0, 2.1, 0] }), '#e8e4da', '#ffffff', { jitter: 0.25, seed: 4 }), canopy(5, birchBlobs, '#6cac38', '#e6f27a', detail)]);
  const blossom = (detail: number) => merge([trunk(2.6, 0.3, 0.2, '#6a4a3a'), canopy(11, oak2Blobs, '#e070a6', '#ffe0ee', detail)]);
  const elderBlobs: [number, number, number, number][] = [
    [0, 8, 0, 3.6], [2.8, 7, 1, 2.6], [-2.8, 7.2, -1, 2.8], [1, 9.8, -1.5, 2.4], [-1.5, 6.6, 2.6, 2.4], [2, 9, 2, 2.0], [-2.2, 9.6, 0.8, 2.0],
  ];
  const elder = (detail: number) => merge([
    trunk(6.5, 1.4, 0.75, '#6a4630', 12),
    ...[0, 1, 2, 3, 4].map((k) => xf(gradient(cone(0.5, 1.6, 6), '#6a4630', '#7a5236'), { r: [0, (k / 5) * Math.PI * 2, 1.9], p: [Math.cos((k / 5) * Math.PI * 2) * 1.2, 0.3, Math.sin((k / 5) * Math.PI * 2) * 1.2] })),
    canopy(33, elderBlobs, '#2a6a32', '#7fc458', detail),
  ]);
  const bush = (detail: number, berries: boolean) => {
    const parts = [
      lumpy(xf(new IcosahedronGeometry(0.7, detail), { p: [0, 0.45, 0] }), 0.12, 1.6, 1),
      lumpy(xf(new IcosahedronGeometry(0.55, detail), { p: [0.55, 0.35, 0.2] }), 0.1, 1.8, 2),
      lumpy(xf(new IcosahedronGeometry(0.5, detail), { p: [-0.5, 0.32, -0.15] }), 0.1, 1.8, 3),
    ];
    const g = gradient(merge(parts), '#2f7a34', '#7cc456', { jitter: 0.08 });
    if (!berries) return g;
    const rng = new Rng(7);
    const dots: BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const a = rng.next() * Math.PI * 2;
      const yy = rng.float(0.3, 0.95);
      dots.push(prep(xf(new SphereGeometry(0.07, 6, 4), { p: [Math.cos(a) * 0.62, yy, Math.sin(a) * 0.62] }), '#ff4a5a'));
    }
    return merge([g, ...dots]);
  };
  const fern = () => {
    const leaves: BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      leaves.push(xf(teardrop(0.12, 0.85, 6, 1.6), { s: [1, 1, 0.2], r: [1.0, a, 0], p: [0, 0.05, 0] }));
    }
    return gradient(merge(leaves), '#2f7a3a', '#8fd060');
  };
  const mush = (cap: string, dots: boolean) => {
    const parts: BufferGeometry[] = [
      prep(xf(cylinder(0.08, 0.11, 0.38, 8), { p: [0, 0.19, 0] }), '#f6efe2'),
      prep(xf(new SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), { s: [1, 0.75, 1], p: [0, 0.34, 0] }), cap),
    ];
    if (dots) for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push(prep(xf(ellipsoid(0.04, 0.02, 0.04), { p: [Math.cos(a) * 0.15, 0.47, Math.sin(a) * 0.15] }), '#ffffff'));
    }
    return merge(parts);
  };
  const log = () => merge([
    gradient(xf(cylinder(0.32, 0.36, 3.2, 10), { r: [0, 0, Math.PI / 2], p: [0, 0.3, 0] }), '#6a4630', '#8a5e3a'),
    prep(xf(ellipsoid(1.2, 0.12, 0.25), { p: [0.2, 0.62, 0] }), '#5aa84a'),
    prep(xf(cylinder(0.3, 0.3, 0.02, 10), { r: [0, 0, Math.PI / 2], p: [1.61, 0.3, 0] }), '#d8b88a'),
    prep(xf(cylinder(0.33, 0.33, 0.02, 10), { r: [0, 0, Math.PI / 2], p: [-1.61, 0.3, 0] }), '#d8b88a'),
  ]);
  const stump = () => merge([gradient(xf(cylinder(0.42, 0.55, 0.6, 10), { p: [0, 0.3, 0] }), '#6a4630', '#8a5e3a'), prep(xf(cylinder(0.41, 0.41, 0.02, 10), { p: [0, 0.61, 0] }), '#d8b88a')]);
  const rock = (seed: number, detail: number) => gradient(xf(rockGeo(seed, detail), { p: [0, 0.35, 0] }), '#8a857e', '#d6d0c4', { moss: '#6fae4a', mossAmount: 0.75, jitter: 0.05, seed });
  const reed = () => {
    const blades: BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      blades.push(xf(cone(0.03, 1.4 + (i % 3) * 0.3, 4), { r: [0.12, a, 0.12], p: [Math.cos(a) * 0.12, 0.7, Math.sin(a) * 0.12] }));
    }
    blades.push(xf(capsule(0.04, 0.22), { p: [0.05, 1.5, 0] }));
    return gradient(merge(blades), '#3f7a3a', '#a6c860');
  };

  return {
    oak: { hi: oak(2), lo: oak(1), mat: leafWind, collide: 0.36, height: 4, shadow: true },
    oak2: { hi: oak2(2), lo: oak2(1), mat: leafWind, collide: 0.3, height: 3.5, shadow: true },
    pine: { hi: pine(1), lo: pine(0), mat: leafWind, collide: 0.3, height: 5, shadow: true },
    birch: { hi: birch(2), lo: birch(1), mat: leafWind, collide: 0.2, height: 4, shadow: true },
    blossom: { hi: blossom(2), lo: blossom(1), mat: leafWind, collide: 0.3, height: 3.5, shadow: true },
    elder: { hi: elder(2), lo: elder(1), mat: leafWind, collide: 1.4, height: 9, shadow: true },
    bush: { hi: bush(1, false), lo: bush(0, false), mat: leaf, collide: 0, height: 1, shadow: true },
    berry: { hi: bush(1, true), lo: bush(0, true), mat: leaf, collide: 0, height: 1, shadow: true },
    fern: { hi: fern(), lo: fern(), mat: plantWind, collide: 0, height: 0.8, shadow: false },
    rock: { hi: rock(1, 2), lo: rock(1, 1), mat: rockMat, collide: 0.9, height: 0.8, shadow: true },
    rock2: { hi: rock(5, 2), lo: rock(5, 1), mat: rockMat, collide: 0.9, height: 0.8, shadow: true },
    boulder: { hi: rock(9, 2), lo: rock(9, 1), mat: rockMat, collide: 1.0, height: 0.9, shadow: true },
    mushroom: { hi: mush('#e8483a', true), lo: mush('#e8483a', false), mat: solid, collide: 0, height: 0.5, shadow: false },
    glowshroom: { hi: mush('#7fe8ff', true), lo: mush('#7fe8ff', false), mat: glow, collide: 0, height: 0.5, shadow: false },
    log: { hi: log(), lo: log(), mat: solid, collide: 0, height: 0.65, shadow: true },
    stump: { hi: stump(), lo: stump(), mat: solid, collide: 0.5, height: 0.6, shadow: true },
    reed: { hi: reed(), lo: reed(), mat: plantWind, collide: 0, height: 1.6, shadow: false },
  };
}


interface Placement {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  rot: number;
  s: number;
}


export class Nature {
  readonly group = new Group();
  private kits = buildKits();
  private layers: { kind: Kind; list: Placement[]; matrices: Float32Array; hi: InstancedMesh; lo: InstancedMesh; far: number }[] = [];
  private lastRefill = new Vector3(1e9, 0, 1e9);
  private lastDraw = 0;
  readonly placements: Placement[] = [];
  private grass: GrassField;

  constructor(private terrain: Terrain, private physics: CollisionWorld) {
    this.scatter();
    this.buildCells();
    this.grass = new GrassField(terrain);
    this.group.add(this.grass.group);
  }

  private blocked(x: number, z: number, r: number, opts: { water?: boolean; path?: number; slope?: number } = {}): boolean {
    const t = this.terrain;
    const h = t.height(x, z);
    if (h < WATER_LEVEL + (opts.water ? 0.1 : 0.7)) return true;
    if (t.inCave(x, z)) return true;
    for (const c of clearings) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
    const pw = opts.path ?? 0.7;
    for (const p of PATHS) if (polyDistance(p.points, x, z).d < p.width * pw + r) return true;
    const e = 1.2;
    const slope = Math.hypot(t.height(x + e, z) - t.height(x - e, z), t.height(x, z + e) - t.height(x, z - e)) / (2 * e);
    if (slope > (opts.slope ?? 0.7)) return true;
    return false;
  }

  private add(kind: Kind, x: number, z: number, rng: Rng, sMin = 0.85, sMax = 1.2): void {
    this.placements.push({ kind, x, y: this.terrain.height(x, z), z, rot: rng.next() * Math.PI * 2, s: rng.float(sMin, sMax) });
  }

  private scatter(): void {
    const rng = new Rng(4242);
    // keep the title-screen vantage point open
    clearings.push({ x: -46, z: 56, r: 12 });
    const t = this.terrain;
    const interact = INTERACTABLES.map((i) => i.at);
    const nearInteract = (x: number, z: number, r: number) => interact.some(([ix, iz]) => Math.hypot(x - ix, z - iz) < r);
    const at = (p: V2) => ({ x: p[0], z: p[1] });
    const outpost = at(OUTPOST.at);
    const hill = at(HILL.at);
    const ruins = at(RUINS.at);

    // Forest: dense, varied, with clearings around the trail.
    for (let i = 0; i < 3200; i++) {
      const x = rng.float(-150, 30);
      const z = rng.float(-150, 150);
      const forest = smoothstep(-28, -58, x) * smoothstep(40, 8, z);
      const mountainFoot = smoothstep(116, 140, Math.max(Math.abs(x), Math.abs(z)));
      const meadow = 0.05;
      const dens = Math.max(forest * 0.85, mountainFoot * 0.5, meadow);
      if (rng.next() > dens) continue;
      if (Math.hypot(x, z) > 175) continue;
      const r = forest > 0.3 ? 1.6 : 2.4;
      if (this.blocked(x, z, r, { slope: mountainFoot > 0.3 ? 1.1 : 0.7 })) continue;
      if (nearInteract(x, z, 4)) continue;
      if (Math.hypot(x - outpost.x, z - outpost.z) < 34) continue;
      if (Math.hypot(x - hill.x, z - hill.z) < 26) continue;
      if (Math.hypot(x - ruins.x, z - ruins.z) < 26) continue;
      if (this.placements.some((p) => (p.kind === 'oak' || p.kind === 'pine' || p.kind === 'birch' || p.kind === 'oak2') && Math.hypot(p.x - x, p.z - z) < r * 1.8)) continue;
      const roll = rng.next();
      const kind: Kind = mountainFoot > 0.4 || t.height(x, z) > 14 ? 'pine' : forest > 0.4 ? (roll < 0.45 ? 'oak' : roll < 0.75 ? 'pine' : roll < 0.9 ? 'birch' : 'oak2') : roll < 0.5 ? 'oak2' : roll < 0.8 ? 'oak' : 'blossom';
      this.add(kind, x, z, rng, 0.8, 1.35);
    }
    // Meadow and valley groves
    const groves: [number, number, Kind, number][] = [
      [-30, 70, 'blossom', 5], [-58, 50, 'oak2', 4], [28, 32, 'oak', 3], [-6, 92, 'blossom', 4], [64, 74, 'birch', 5], [24, -22, 'oak2', 4],
      [86, -4, 'birch', 4], [118, -24, 'pine', 6], [120, -60, 'pine', 5], [76, -70, 'pine', 5], [12, -40, 'pine', 4], [-14, -50, 'oak', 5],
      [34, -60, 'birch', 4], [-36, 92, 'oak2', 3], [70, 100, 'blossom', 3], [92, 40, 'oak2', 4], [-90, 70, 'oak', 5], [100, 110, 'pine', 6],
    ];
    for (const [gx, gz, kind, n] of groves) {
      for (let k = 0; k < n * 3 && k < 40; k++) {
        const x = gx + rng.float(-9, 9);
        const z = gz + rng.float(-9, 9);
        if (this.blocked(x, z, 2)) continue;
        if (nearInteract(x, z, 4)) continue;
        if (this.placements.some((p) => Math.hypot(p.x - x, p.z - z) < 3.2)) continue;
        this.add(kind, x, z, rng, 0.85, 1.25);
      }
    }
    // Outpost and hill decoration trees
    const deco: [number, number, Kind][] = [[-12, 44, 'blossom'], [34, 52, 'blossom'], [30, 76, 'oak2'], [-16, 72, 'oak2'], [-34, 8, 'blossom'], [-4, 28, 'oak2'], [-36, 28, 'oak']];
    for (const [x, z, kind] of deco) if (!this.blocked(x, z, 1.5, { path: 0.5 })) this.add(kind, x, z, rng, 1, 1.2);
    // The Elder Oak
    const oak = LOCATION_BY_ID.oak.at;
    this.placements.push({ kind: 'elder', x: oak[0], y: t.height(oak[0], oak[1]), z: oak[1], rot: 0.4, s: 1 });

    // Undergrowth and rocks
    for (let i = 0; i < 5200; i++) {
      const x = rng.float(-PLAY_HALF - 20, PLAY_HALF + 20);
      const z = rng.float(-PLAY_HALF - 20, PLAY_HALF + 20);
      const forest = smoothstep(-28, -58, x) * smoothstep(40, 8, z);
      const roll = rng.next();
      let kind: Kind | null = null;
      const h = t.height(x, z);
      const rv = h < 2.4 && h > WATER_LEVEL + 0.15;
      if (rv && roll < 0.45) kind = 'reed';
      else if (forest > 0.4) kind = roll < 0.25 ? 'fern' : roll < 0.35 ? 'bush' : roll < 0.42 ? 'mushroom' : roll < 0.47 ? 'log' : roll < 0.52 ? 'stump' : roll < 0.6 ? 'rock' : null;
      else if (roll < 0.05) kind = 'bush';
      else if (roll < 0.065) kind = 'berry';
      else if (roll < 0.09) kind = rng.chance(0.5) ? 'rock' : 'rock2';
      else if (roll < 0.1 && h > 8) kind = 'boulder';
      if (!kind) continue;
      const big = kind === 'log' || kind === 'boulder';
      if (this.blocked(x, z, big ? 2 : 0.8, { water: kind === 'reed', path: kind === 'reed' ? 0.5 : 0.75, slope: kind === 'rock' || kind === 'boulder' ? 1.4 : 0.8 })) continue;
      if (nearInteract(x, z, 3)) continue;
      if (Math.hypot(x - outpost.x, z - outpost.z) < 24) continue;
      if ((kind === 'rock' || kind === 'boulder' || kind === 'log') && this.placements.some((p) => Math.hypot(p.x - x, p.z - z) < 2.5)) continue;
      const scale = kind === 'boulder' ? [1.8, 3.2] : kind === 'rock' || kind === 'rock2' ? [0.5, 1.5] : [0.7, 1.3];
      this.add(kind, x, z, rng, scale[0], scale[1]);
    }
    // Cave dressing: glowing mushrooms and rocks on the cave floor
    for (let i = 0; i < 70; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = rng.float(2, CAVE.hallRadius - 1);
      const x = CAVE.hall[0] + Math.cos(a) * r;
      const z = CAVE.hall[1] + Math.sin(a) * r;
      if (nearInteract(x, z, 2)) continue;
      this.add('glowshroom', x, z, rng, 0.5, 1.4);
    }
    // Pebbles and boulders around the falls pool and river bends
    for (let i = 0; i < 40; i++) {
      const a = rng.next() * Math.PI * 2;
      const x = 60 + Math.cos(a) * rng.float(12, 17);
      const z = -92 + Math.sin(a) * rng.float(12, 17);
      if (z < -100) continue;
      if (t.height(x, z) < WATER_LEVEL + 0.2) continue;
      this.add(rng.chance(0.3) ? 'boulder' : 'rock', x, z, rng, 0.8, 1.8);
    }
  }

  private buildCells(): void {
    const byKind = new Map<Kind, Placement[]>();
    for (const p of this.placements) {
      let list = byKind.get(p.kind);
      if (!list) byKind.set(p.kind, (list = []));
      list.push(p);
      // colliders: trunks and rocks
      const kit = this.kits[p.kind];
      if (kit.collide > 0) {
        const isRock = p.kind === 'rock' || p.kind === 'rock2' || p.kind === 'boulder';
        const r = kit.collide * p.s * (isRock ? 1.05 : 1);
        this.physics.add({ kind: 'cyl', x: p.x, z: p.z, r, y0: p.y - 1, y1: p.y + kit.height * p.s * (isRock ? 0.75 : 1), walkable: isRock });
      }
      if (p.kind === 'log') {
        this.physics.add({ kind: 'box', x: p.x, z: p.z, hx: 1.6 * p.s, hz: 0.35 * p.s, rot: p.rot, y0: p.y - 0.5, y1: p.y + 0.62 * p.s });
      }
      // canopies stop the camera boom (not the player)
      const canopy: Partial<Record<Kind, [number, number, number]>> = { oak: [2.2, 2.2, 5.2], oak2: [1.9, 1.9, 4.6], blossom: [1.9, 1.9, 4.6], birch: [1.4, 3.2, 5.5], pine: [1.5, 1.6, 5.8], elder: [4.5, 5.5, 11] };
      const cp = canopy[p.kind];
      if (cp) this.physics.add({ kind: 'cyl', x: p.x, z: p.z, r: cp[0] * p.s, y0: p.y + cp[1] * p.s, y1: p.y + cp[2] * p.s, cam: true });
    }
    const small: Kind[] = ['fern', 'mushroom', 'glowshroom', 'reed', 'bush', 'berry', 'stump', 'log', 'rock', 'rock2'];
    for (const [kind, list] of byKind) {
      const kit = this.kits[kind];
      const matrices = new Float32Array(list.length * 16);
      list.forEach((p, i) => {
        tmpQ.setFromAxisAngle(up, p.rot);
        tmpS.setScalar(p.s);
        tmpV.set(p.x, p.y - 0.05, p.z);
        tmpM.compose(tmpV, tmpQ, tmpS).toArray(matrices, i * 16);
      });
      const make = (geo: BufferGeometry, shadow: boolean) => {
        const m = new InstancedMesh(geo, kit.mat, list.length);
        m.instanceMatrix.setUsage(DynamicDrawUsage);
        m.count = 0;
        // instances are spread over the whole vale: cull per instance by distance instead
        m.frustumCulled = false;
        m.castShadow = shadow;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        this.group.add(m);
        return m;
      };
      this.layers.push({ kind, list, matrices, hi: make(kit.hi, kit.shadow), lo: make(kit.lo, false), far: small.includes(kind) ? 0.45 : kind === 'boulder' ? 0.8 : 1 });
    }
  }

  /** Refills the near (detailed) and far (simple) instance buffers around the camera. */
  private refill(cam: Vector3, drawDistance: number): void {
    const lodDist = Math.min(70, drawDistance * 0.4);
    for (const L of this.layers) {
      const far = drawDistance * L.far;
      let nh = 0;
      let nl = 0;
      const hiArr = L.hi.instanceMatrix.array as Float32Array;
      const loArr = L.lo.instanceMatrix.array as Float32Array;
      for (let i = 0; i < L.list.length; i++) {
        const p = L.list[i];
        const d = Math.hypot(p.x - cam.x, p.z - cam.z);
        if (d > far) continue;
        if (d < lodDist || p.kind === 'elder') {
          hiArr.set(L.matrices.subarray(i * 16, i * 16 + 16), nh * 16);
          nh++;
        } else {
          loArr.set(L.matrices.subarray(i * 16, i * 16 + 16), nl * 16);
          nl++;
        }
      }
      L.hi.count = nh;
      L.lo.count = nl;
      L.hi.instanceMatrix.needsUpdate = true;
      L.lo.instanceMatrix.needsUpdate = true;
      L.hi.visible = nh > 0;
      L.lo.visible = nl > 0;
    }
  }

  update(cam: Vector3, drawDistance: number, shadowRange: number, grassRange: number, grassDensity: number): void {
    void shadowRange;
    if (Math.hypot(cam.x - this.lastRefill.x, cam.z - this.lastRefill.z) > 4 || drawDistance !== this.lastDraw) {
      this.lastRefill.copy(cam);
      this.lastDraw = drawDistance;
      this.refill(cam, drawDistance);
    }
    this.grass.update(cam, grassRange, grassDensity);
  }

  dispose(): void {
    for (const L of this.layers) {
      L.hi.dispose();
      L.lo.dispose();
    }
    for (const k of Object.values(this.kits)) {
      k.hi.dispose();
      k.lo.dispose();
    }
    this.grass.dispose();
  }
}

// ---------------------------------------------------------------------------
// Grass and flowers

const GCHUNK = 24;

function tuftGeometry(): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const base = new Color('#2a7a28');
  const tip = new Color('#dcf47e');
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI + (b % 2) * 0.3;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const ox = Math.cos(a * 2.3) * 0.12;
    const oz = Math.sin(a * 1.7) * 0.12;
    const h = 0.45 + (b % 3) * 0.12;
    const lean = 0.12 + (b % 2) * 0.08;
    const w = 0.06;
    const seg = 3;
    const pts: [number, number, number, number][] = [];
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      const ww = w * (1 - t * 0.92);
      const cx = ox + -dz * lean * t * t;
      const cz = oz + dx * lean * t * t;
      pts.push([cx, t * h, cz, ww]);
    }
    for (let s = 0; s < seg; s++) {
      const [x0, y0, z0, w0] = pts[s];
      const [x1, y1, z1, w1] = pts[s + 1];
      const v = [
        [x0 - dx * w0, y0, z0 - dz * w0], [x0 + dx * w0, y0, z0 + dz * w0], [x1 + dx * w1, y1, z1 + dz * w1],
        [x0 - dx * w0, y0, z0 - dz * w0], [x1 + dx * w1, y1, z1 + dz * w1], [x1 - dx * w1, y1, z1 - dz * w1],
      ];
      for (const p of v) {
        pos.push(p[0], p[1], p[2]);
        nor.push(0, 1, 0);
        const c = base.clone().lerp(tip, Math.min(1, p[1] / h));
        col.push(c.r, c.g, c.b);
      }
    }
  }
  return fill(new BufferGeometry(), pos, nor, col);
}

function fill(g: BufferGeometry, pos: number[], nor: number[], col: number[]): BufferGeometry {
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
}

/** One flower; petals are white and marked with aPetal so instances tint them. */
function flowerGeometry(): BufferGeometry {
  const h = 0.4;
  const parts: BufferGeometry[] = [prep(xf(cylinder(0.012, 0.016, h, 4), { p: [0, h / 2, 0] }), '#4f9a3a')];
  const petals: BufferGeometry[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    petals.push(prep(xf(ellipsoid(0.085, 0.016, 0.048, 6, 4), { r: [0, -a, 0.25], p: [Math.cos(a) * 0.075, h, Math.sin(a) * 0.075] }), '#ffffff'));
  }
  parts.push(prep(xf(ellipsoid(0.045, 0.03, 0.045, 6, 4), { p: [0, h + 0.015, 0] }), '#ffd23a'));
  parts.push(prep(xf(ellipsoid(0.07, 0.008, 0.025, 5, 3), { r: [0, 0.6, -0.5], p: [0.04, h * 0.35, 0] }), '#5aa84a'));
  const stemCount = merge(parts.map((p) => p.clone())).attributes.position.count;
  const g = merge([...parts, ...petals]);
  const mask = new Float32Array(g.attributes.position.count);
  for (let i = stemCount; i < mask.length; i++) mask[i] = 1;
  g.setAttribute('aPetal', new BufferAttribute(mask, 1));
  // soften lighting like the grass
  const nn = g.attributes.normal;
  for (let i = 0; i < nn.count; i++) nn.setXYZ(i, nn.getX(i) * 0.3, 0.95, nn.getZ(i) * 0.3);
  return g;
}

const PETALS = ['#ffffff', '#ffd84a', '#ff8fc0', '#a88cff', '#6fb8ff', '#ff6a5a'].map((c) => new Color(c));

interface GChunk {
  key: string;
  meshes: InstancedMesh[];
}

class GrassField {
  readonly group = new Group();
  private chunks = new Map<string, GChunk>();
  private tuft = tuftGeometry();
  private flower = flowerGeometry();
  private grassMat = windPatch(new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: 2 }), { bend: 1.4, fade: true, key: 'grass' }) as MeshStandardMaterial;
  private flowerMat = windPatch(new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), { bend: 0.9, fade: true, key: 'flower', petals: true }) as MeshStandardMaterial;
  private density = 1;
  private obj = new Object3D();
  private col = new Color();

  constructor(private terrain: Terrain) {}

  update(cam: Vector3, range: number, density: number): void {
    if (Math.abs(density - this.density) > 0.01) {
      this.density = density;
      for (const c of this.chunks.values()) this.drop(c);
      this.chunks.clear();
    }
    const ci = Math.floor(cam.x / GCHUNK);
    const cj = Math.floor(cam.z / GCHUNK);
    const n = Math.ceil(range / GCHUNK) + 1;
    let built = 0;
    const want = new Set<string>();
    const order: [number, number, number][] = [];
    for (let j = cj - n; j <= cj + n; j++) {
      for (let i = ci - n; i <= ci + n; i++) {
        const d = Math.hypot((i + 0.5) * GCHUNK - cam.x, (j + 0.5) * GCHUNK - cam.z) - GCHUNK * 0.71;
        if (d > range) continue;
        want.add(`${i},${j}`);
        order.push([d, i, j]);
      }
    }
    order.sort((a, b) => a[0] - b[0]);
    for (const [, i, j] of order) {
      const key = `${i},${j}`;
      if (this.chunks.has(key)) continue;
      if (built >= 2) break;
      this.chunks.set(key, this.build(i, j, key));
      built++;
    }
    for (const [key, c] of this.chunks) {
      if (!want.has(key)) {
        const [i, j] = key.split(',').map(Number);
        const d = Math.hypot((i + 0.5) * GCHUNK - cam.x, (j + 0.5) * GCHUNK - cam.z) - GCHUNK * 0.71;
        if (d > range + 14) {
          this.drop(c);
          this.chunks.delete(key);
        }
      }
    }
  }

  private build(i: number, j: number, key: string): GChunk {
    const rng = new Rng(i * 7349 + j * 9157 + 13);
    const t = this.terrain;
    const x0 = i * GCHUNK;
    const z0 = j * GCHUNK;
    const area = GCHUNK * GCHUNK;
    const grass: [number, number, number, number, number][] = [];
    const flowers: [number, number, number, number, number, number][] = [];
    const meadowAt = LOCATION_BY_ID.meadow.at;
    const tries = Math.floor(area * 3.2 * this.density);
    for (let k = 0; k < tries; k++) {
      const x = x0 + rng.next() * GCHUNK;
      const z = z0 + rng.next() * GCHUNK;
      const surf = t.surfaceAt(x, z);
      if (surf !== 'grass') continue;
      if (Math.abs(x) > 168 || Math.abs(z) > 168) continue;
      const h = t.height(x, z);
      if (h > 26) continue;
      let blockedC = false;
      for (const c of clearings) if (Math.hypot(x - c.x, z - c.z) < c.r * 0.85) blockedC = true;
      if (blockedC) continue;
      const meadow = 1 - smoothstep(14, 44, Math.hypot(x - meadowAt[0], z - meadowAt[1]));
      const forest = smoothstep(-28, -58, x) * smoothstep(40, 8, z);
      const tall = 0.75 + meadow * 0.7 + forest * 0.15;
      if (rng.next() < 0.1 + meadow * 0.12 - forest * 0.06 && rng.next() < 0.5) {
        const fi = meadow > 0.3 ? rng.int(PETALS.length) : rng.int(4);
        flowers.push([x, h, z, rng.next() * Math.PI * 2, rng.float(0.8, 1.3), fi]);
        continue;
      }
      grass.push([x, h, z, rng.next() * Math.PI * 2, rng.float(0.65, 1.25) * tall]);
    }
    const meshes: InstancedMesh[] = [];
    if (grass.length) {
      const m = new InstancedMesh(this.tuft, this.grassMat, grass.length);
      grass.forEach(([x, y, z, r, s], idx) => {
        this.obj.position.set(x, y - 0.03, z);
        this.obj.rotation.set(0, r, 0);
        this.obj.scale.set(s, s * (0.85 + 0.3 * ((idx * 7) % 5) / 5), s);
        this.obj.updateMatrix();
        m.setMatrixAt(idx, this.obj.matrix);
        t.colorAt(x, z, this.col).multiplyScalar(1.3).offsetHSL(0, 0.08, 0);
        m.setColorAt(idx, this.col);
      });
      meshes.push(m);
    }
    if (flowers.length) {
      const m = new InstancedMesh(this.flower, this.flowerMat, flowers.length);
      flowers.forEach(([x, y, z, r, s, fi], idx) => {
        this.obj.position.set(x, y - 0.02, z);
        this.obj.rotation.set(0, r, 0);
        this.obj.scale.set(s, s * (fi >= 4 ? 1.5 : 1), s);
        this.obj.updateMatrix();
        m.setMatrixAt(idx, this.obj.matrix);
        m.setColorAt(idx, PETALS[fi]);
      });
      meshes.push(m);
    }
    for (const m of meshes) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.computeBoundingSphere();
      m.receiveShadow = true;
      m.castShadow = false;
      m.matrixAutoUpdate = false;
      this.group.add(m);
    }
    return { key, meshes };
  }

  private drop(c: GChunk): void {
    for (const m of c.meshes) {
      m.removeFromParent();
      m.dispose();
    }
  }

  dispose(): void {
    for (const c of this.chunks.values()) this.drop(c);
    this.chunks.clear();
    this.tuft.dispose();
    this.flower.dispose();
  }
}
