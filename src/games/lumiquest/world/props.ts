// Static architecture and set dressing: the outpost (an enterable lodge,
// houses, market stalls, well, windmill, fences, lanterns), the bridge and
// stepping stones, the beacon tower, the ruins, the cave shell, the cove
// wall, the sky pillar and the distant backdrop. Everything registers its
// colliders and keeps vegetation out with clearings.

import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  Color,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Rng } from '../../shared/rng';
import { Noise2D } from '../../shared/noise';
import {
  OUTPOST,
  ALTAR, BEACON, BRIDGE, CAVE, COVE_WALL, HILL, LOCATION_BY_ID, PRISMS, RUINS, SKY_PILLAR, STEPPING_STONES, WATER_LEVEL,
} from '../data/world';
import { cone, cylinder, ellipsoid, gradient, lumpy, prep, rockGeo, torus, xf } from '../engine/geometry';
import type { CollisionWorld } from '../engine/physics';
import { cobbleTexture, plankTexture, plasterTexture, rockTexture, roofTexture, stoneTexture, stripeTexture, softDot, windowTexture } from '../engine/textures';
import { batchStatic } from './batch';
import { clearings } from './nature';
import type { Terrain } from './terrain';

const OUTPOST_AT = OUTPOST.at;

export interface NightLight {
  mat: MeshStandardMaterial;
  day: number;
  night: number;
}

export class Props {
  readonly group = new Group();
  /** Emissive materials that brighten at night (windows, lanterns). */
  readonly nightGlow: NightLight[] = [];
  /** Point lights that switch on at night (budgeted). */
  readonly lamps: PointLight[] = [];
  readonly spinners: { obj: Object3D; speed: number; axis: 'x' | 'z' }[] = [];
  readonly flags: { obj: Mesh; phase: number }[] = [];
  /** Beacon pieces animated when it is restored. */
  beacon!: { crystal: Mesh; beam: Mesh; light: PointLight; ring: Mesh; top: Vector3 };
  caveLights: PointLight[] = [];
  private mats: Record<string, Material> = {};
  /** Far mountains skip scene fog and get a lighter aerial haze instead. */
  backdropMat!: MeshStandardMaterial;

  constructor(private terrain: Terrain, private physics: CollisionWorld) {
    this.materials();
    this.outpost();
    this.bridge();
    this.beaconHill();
    this.ruins();
    this.cave();
    this.falls();
    this.windmill();
    this.backdrop();
    const stats = batchStatic(this.group);
    this.drawCallsSaved = stats.before - stats.after;
  }

  drawCallsSaved = 0;

  private materials(): void {
    const stone = new MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9, color: '#f2ece0' });
    const ruin = new MeshStandardMaterial({ map: stoneTexture(), roughness: 0.92, color: '#d6d2c4' });
    const rock = new MeshStandardMaterial({ map: rockTexture(), roughness: 0.95, vertexColors: true });
    const plaster = new MeshStandardMaterial({ map: plasterTexture(), roughness: 0.9 });
    const wood = new MeshStandardMaterial({ map: plankTexture(), roughness: 0.8, color: '#ffffff' });
    const darkWood = new MeshStandardMaterial({ map: plankTexture(), roughness: 0.8, color: '#9a7a62' });
    const vc = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.mats = { stone, ruin, rock, plaster, wood, darkWood, vc };
  }

  private y(x: number, z: number): number {
    return this.terrain.height(x, z);
  }

  private mesh(geo: BufferGeometry, mat: Material, x: number, y: number, z: number, ry = 0, cast = true): Mesh {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  private roofMat(color: string): MeshStandardMaterial {
    const key = `roof:${color}`;
    if (!this.mats[key]) {
      const t = roofTexture().clone();
      t.needsUpdate = true;
      t.repeat.set(3, 2);
      this.mats[key] = new MeshStandardMaterial({ map: t, color, roughness: 0.75 });
    }
    return this.mats[key] as MeshStandardMaterial;
  }

  private windowMat(): MeshStandardMaterial {
    const tex = windowTexture();
    const m = new MeshStandardMaterial({ map: tex, emissiveMap: tex, color: '#ffffff', emissive: new Color('#ffc86a'), emissiveIntensity: 0.15, roughness: 0.25 });
    this.nightGlow.push({ mat: m, day: 0.12, night: 1.6 });
    return m;
  }

  /** A gabled roof as a prism with overhang; ridge along local x. */
  private roof(w: number, d: number, h: number, color: string): BufferGeometry {
    const g = new BoxGeometry(1, 1, 1, 1, 1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 0.5; // 0..1
      const z = pos.getZ(i);
      pos.setXYZ(i, pos.getX(i) * w, y * h, z * d * (1 - y * 0.985));
    }
    g.computeVertexNormals();
    void color;
    return g;
  }

  /** A closed cottage: stone base, plaster walls, timber frame, roof, windows. */
  private house(x: number, z: number, rot: number, w: number, d: number, roofColor: string, opts: { chimney?: boolean; tall?: boolean } = {}): void {
    const base = this.y(x, z) - 0.3;
    const g = new Group();
    g.position.set(x, base, z);
    g.rotation.y = rot;
    const wallH = opts.tall ? 3.6 : 2.8;
    const add = (geo: BufferGeometry, mat: Material, px: number, py: number, pz: number, cast = true) => {
      const m = new Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = cast;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    add(new RoundedBoxGeometry(w + 0.3, 0.9, d + 0.3, 2, 0.12), this.mats.stone, 0, 0.45, 0);
    add(new BoxGeometry(w, wallH, d), this.mats.plaster, 0, 0.9 + wallH / 2, 0);
    // timber frame
    const beam = (bw: number, bh: number, bd: number, px: number, py: number, pz: number) => add(new BoxGeometry(bw, bh, bd), this.mats.darkWood, px, py, pz, false);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(0.22, wallH, 0.22, (sx * w) / 2, 0.9 + wallH / 2, (sz * d) / 2);
    beam(w + 0.1, 0.18, 0.12, 0, 0.9 + wallH * 0.55, d / 2 + 0.02);
    beam(w + 0.1, 0.18, 0.12, 0, 0.9 + wallH * 0.55, -d / 2 - 0.02);
    beam(w + 0.2, 0.2, 0.2, 0, 0.9 + wallH, d / 2);
    beam(w + 0.2, 0.2, 0.2, 0, 0.9 + wallH, -d / 2);
    // roof
    const roofH = Math.min(w, d) * 0.62;
    add(this.roof(w + 0.9, d + 1.2, roofH, roofColor), this.roofMat(roofColor), 0, 0.9 + wallH, 0);
    // gable triangles
    // door and windows on the front (+z)
    add(new RoundedBoxGeometry(1.1, 1.9, 0.12, 2, 0.05), this.mats.wood, 0, 1.85, d / 2 + 0.06);
    add(new BoxGeometry(0.1, 0.1, 0.1), new MeshStandardMaterial({ color: '#d9b35a', metalness: 0.6, roughness: 0.3 }), 0.35, 1.8, d / 2 + 0.14, false);
    const win = this.windowMat();
    for (const sx of [-1, 1]) {
      add(new BoxGeometry(0.8, 0.8, 0.06), win, sx * w * 0.3, 2.0, d / 2 + 0.04, false);
      add(new BoxGeometry(0.95, 0.1, 0.16), this.mats.darkWood, sx * w * 0.3, 1.55, d / 2 + 0.08, false);
      add(new BoxGeometry(0.8, 0.8, 0.06), win, sx * w * 0.3, 2.0, -d / 2 - 0.04, false);
      // flower box
      add(prep(xf(ellipsoid(0.42, 0.12, 0.12, 8, 6), { p: [0, 0, 0] }), '#e85a8a'), this.mats.vc, sx * w * 0.3, 1.66, d / 2 + 0.16, false);
    }
    add(new BoxGeometry(0.06, 0.8, 0.8), win, w / 2 + 0.04, 2.0, 0, false);
    add(new BoxGeometry(0.06, 0.8, 0.8), win, -w / 2 - 0.04, 2.0, 0, false);
    if (opts.chimney) add(new RoundedBoxGeometry(0.6, 1.6, 0.6, 2, 0.08), this.mats.stone, w * 0.28, 0.9 + wallH + roofH * 0.6, -d * 0.15);
    this.group.add(g);
    this.physics.add({ kind: 'box', x, z, hx: w / 2 + 0.15, hz: d / 2 + 0.15, rot, y0: base - 1, y1: base + 0.9 + wallH + roofH, walkable: false });
    clearings.push({ x, z, r: Math.max(w, d) * 0.75 + 1 });
  }

  /** The ranger lodge: a hollow building you can walk into. */
  private lodge(): void {
    const cx = 0;
    const cz = 42;
    const w = 10;
    const d = 7;
    const floor = this.y(cx, cz) + 0.12;
    const wallH = 3.2;
    const t = 0.3;
    const g = new Group();
    g.position.set(cx, 0, cz);
    this.group.add(g);
    const add = (geo: BufferGeometry, mat: Material, px: number, py: number, pz: number, cast = true) => {
      const m = new Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = cast;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    add(new RoundedBoxGeometry(w + 0.6, 0.5, d + 0.6, 2, 0.1), this.mats.stone, 0, floor - 0.25, 0);
    add(new BoxGeometry(w - 0.2, 0.06, d - 0.2), this.mats.wood, 0, floor + 0.02, 0, false);
    // walls with a door gap on the south side (+z)
    const wall = (ww: number, px: number, pz: number, rotY: number) => {
      const m = add(new BoxGeometry(ww, wallH, t), this.mats.plaster, px, floor + wallH / 2, pz);
      m.rotation.y = rotY;
    };
    wall(w, 0, -d / 2, 0);
    wall(d, -w / 2, 0, Math.PI / 2);
    wall(d, w / 2, 0, Math.PI / 2);
    const gap = 1.5;
    const side = (w - gap) / 2;
    wall(side, -(gap / 2 + side / 2), d / 2, 0);
    wall(side, gap / 2 + side / 2, d / 2, 0);
    add(new BoxGeometry(gap + 0.2, 0.9, t), this.mats.plaster, 0, floor + wallH - 0.45, d / 2);
    // frame beams
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new BoxGeometry(0.26, wallH + 0.2, 0.26), this.mats.darkWood, (sx * w) / 2, floor + wallH / 2, (sz * d) / 2);
    add(new BoxGeometry(w + 0.3, 0.22, 0.24), this.mats.darkWood, 0, floor + wallH, d / 2);
    add(new BoxGeometry(w + 0.3, 0.22, 0.24), this.mats.darkWood, 0, floor + wallH, -d / 2);
    // roof (two layers so it reads from inside too)
    const roofH = 3.4;
    add(this.roof(w + 1.2, d + 1.6, roofH, '#2f6fb8'), this.roofMat('#3f7fd0'), 0, floor + wallH, 0);
    const inner = add(this.roof(w - 0.1, d - 0.1, roofH * 0.95, '#000'), this.mats.wood, 0, floor + wallH + 0.02, 0, false);
    (inner.material as MeshStandardMaterial).side = DoubleSide;
    add(new BoxGeometry(w - 0.2, 0.08, 0.2), this.mats.darkWood, 0, floor + wallH + 0.05, 0, false);
    // windows
    const win = this.windowMat();
    for (const sx of [-1, 1]) {
      add(new BoxGeometry(1.1, 0.9, 0.34), win, sx * 3.2, floor + 1.8, d / 2, false);
      add(new BoxGeometry(1.1, 0.9, 0.34), win, sx * 2.6, floor + 1.8, -d / 2, false);
      add(prep(xf(ellipsoid(0.55, 0.13, 0.13, 8, 6), {}), '#ffb347'), this.mats.vc, sx * 3.2, floor + 1.32, d / 2 + 0.25, false);
    }
    // sign board over the door
    add(new RoundedBoxGeometry(2.6, 0.6, 0.12, 2, 0.05), this.mats.wood, 0, floor + wallH + 0.55, d / 2 + 0.2);
    add(new BoxGeometry(2.2, 0.08, 0.05), new MeshStandardMaterial({ color: '#f2c35a', emissive: new Color('#f2a03a'), emissiveIntensity: 0.3 }), 0, floor + wallH + 0.55, d / 2 + 0.28, false);
    // furniture: bed, table with the log, shelf, rug, lamp
    add(new RoundedBoxGeometry(2.0, 0.5, 1.1, 2, 0.08), this.mats.wood, 3.3, floor + 0.25, -2.6);
    add(new RoundedBoxGeometry(1.9, 0.18, 1.0, 2, 0.08), new MeshStandardMaterial({ color: '#e85a5a', roughness: 0.9 }), 3.3, floor + 0.56, -2.6);
    add(new RoundedBoxGeometry(0.6, 0.16, 0.9, 2, 0.06), new MeshStandardMaterial({ color: '#fff4e0', roughness: 0.9 }), 4.0, floor + 0.7, -2.6);
    add(new RoundedBoxGeometry(1.6, 0.1, 1.0, 2, 0.04), this.mats.wood, -2, floor + 0.85, -1.4);
    for (const [px, pz] of [[-2.7, -1.8], [-1.3, -1.8], [-2.7, -1.0], [-1.3, -1.0]]) add(cylinder(0.05, 0.05, 0.8, 6), this.mats.darkWood, px, floor + 0.4, pz, false);
    add(new RoundedBoxGeometry(2.6, 2.2, 0.5, 2, 0.06), this.mats.darkWood, -3.0, floor + 1.1, -3.1);
    for (let k = 0; k < 8; k++) add(new BoxGeometry(0.16, 0.36, 0.28), new MeshStandardMaterial({ color: ['#d8423a', '#2f6fb8', '#3c9a6a', '#f0a83a'][k % 4] }), -4 + k * 0.28, floor + 1.5, -2.95, false);
    add(new CylinderGeometry(1.4, 1.4, 0.02, 24), new MeshStandardMaterial({ map: stripeTexture('#e0a040', '#c05a3a'), roughness: 1 }), 0.4, floor + 0.06, 0.2, false);
    const lampMat = new MeshStandardMaterial({ color: '#fff0c0', emissive: new Color('#ffb84a'), emissiveIntensity: 1.2 });
    add(new SphereGeometry(0.16, 12, 8), lampMat, -2.2, floor + 1.05, -1.6, false);
    const lamp = new PointLight('#ffc070', 4, 9, 1.6);
    lamp.position.set(cx - 0.5, floor + 2.3, cz - 0.5);
    this.group.add(lamp);
    this.lamps.push(lamp);
    // colliders: walls, bed, table, shelf
    const wallC = (px: number, pz: number, hx: number, hz: number) => this.physics.add({ kind: 'box', x: cx + px, z: cz + pz, hx, hz, rot: 0, y0: floor - 2, y1: floor + wallH + roofH, walkable: false });
    wallC(0, -d / 2, w / 2, t / 2 + 0.05);
    wallC(-w / 2, 0, t / 2 + 0.05, d / 2);
    wallC(w / 2, 0, t / 2 + 0.05, d / 2);
    wallC(-(gap / 2 + side / 2), d / 2, side / 2, t / 2 + 0.05);
    wallC(gap / 2 + side / 2, d / 2, side / 2, t / 2 + 0.05);
    this.physics.add({ kind: 'box', x: cx + 3.3, z: cz - 2.6, hx: 1.0, hz: 0.55, rot: 0, y0: floor - 1, y1: floor + 0.62 });
    this.physics.add({ kind: 'box', x: cx - 2, z: cz - 1.4, hx: 0.8, hz: 0.5, rot: 0, y0: floor - 1, y1: floor + 0.9, walkable: false });
    this.physics.add({ kind: 'box', x: cx - 3, z: cz - 3.1, hx: 1.3, hz: 0.25, rot: 0, y0: floor - 1, y1: floor + 2.2, walkable: false });
    // a step up in front of the door
    this.physics.add({ kind: 'box', x: cx, z: cz, hx: w / 2, hz: d / 2, rot: 0, y0: floor - 3, y1: floor + 0.04 });
    clearings.push({ x: cx, z: cz, r: 7 });
  }

  private lantern(x: number, z: number, light: boolean): void {
    const y = this.y(x, z);
    this.mesh(cylinder(0.06, 0.08, 2.4, 6), this.mats.darkWood, x, y + 1.2, z);
    this.mesh(new BoxGeometry(0.5, 0.06, 0.06), this.mats.darkWood, x + 0.2, y + 2.35, z, 0, false);
    const glow = new MeshStandardMaterial({ color: '#fff2c8', emissive: new Color('#ffb24a'), emissiveIntensity: 0.2 });
    this.nightGlow.push({ mat: glow, day: 0.2, night: 2.2 });
    this.mesh(new RoundedBoxGeometry(0.26, 0.34, 0.26, 2, 0.05), glow, x + 0.42, y + 2.1, z, 0, false);
    this.mesh(cone(0.22, 0.16, 4), this.mats.darkWood, x + 0.42, y + 2.35, z, Math.PI / 4, false);
    if (light) {
      const l = new PointLight('#ffb860', 0, 11, 1.8);
      l.position.set(x + 0.42, y + 2.0, z);
      this.group.add(l);
      this.lamps.push(l);
    }
    this.physics.add({ kind: 'cyl', x, z, r: 0.15, y0: y - 1, y1: y + 2.4, walkable: false });
  }

  private fence(points: [number, number][], color = '#b98a5a'): void {
    const mat = new MeshStandardMaterial({ color, roughness: 0.85, map: plankTexture() });
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 2.2));
      const rot = Math.atan2(bz - az, bx - ax);
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        this.mesh(new RoundedBoxGeometry(0.16, 1.0, 0.16, 1, 0.04), mat, x, this.y(x, z) + 0.45, z);
      }
      for (const hy of [0.45, 0.8]) {
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const rail = this.mesh(new BoxGeometry(len, 0.08, 0.06), mat, mx, (this.y(ax, az) + this.y(bx, bz)) / 2 + hy, mz, -rot, false);
        rail.rotation.z = Math.atan2(this.y(bx, bz) - this.y(ax, az), len);
      }
      this.physics.add({ kind: 'box', x: (ax + bx) / 2, z: (az + bz) / 2, hx: len / 2, hz: 0.12, rot: -rot, y0: -10, y1: Math.max(this.y(ax, az), this.y(bx, bz)) + 0.95, walkable: false });
    }
  }

  private stall(x: number, z: number, rot: number, cloth: [string, string], goods: string[]): void {
    const y = this.y(x, z);
    const g = new Group();
    g.position.set(x, y, z);
    g.rotation.y = rot;
    this.group.add(g);
    const add = (geo: BufferGeometry, mat: Material, px: number, py: number, pz: number, cast = true) => {
      const m = new Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = cast;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    add(new RoundedBoxGeometry(2.6, 0.95, 1.0, 2, 0.06), this.mats.wood, 0, 0.48, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(cylinder(0.06, 0.06, 2.5, 6), this.mats.darkWood, sx * 1.3, 1.25, sz * 0.55 + 0.3);
    const canopyMat = new MeshStandardMaterial({ map: stripeTexture(cloth[0], cloth[1]), roughness: 0.9, side: DoubleSide });
    const top = add(new PlaneGeometry(3.0, 1.9, 6, 1), canopyMat, 0, 2.45, 0.3);
    top.rotation.x = -Math.PI / 2 + 0.28;
    const pos = top.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 3 + 0.5) * Math.PI * 6) * 0.04);
    top.geometry.computeVertexNormals();
    goods.forEach((c, i) => {
      add(new RoundedBoxGeometry(0.55, 0.22, 0.45, 1, 0.04), this.mats.darkWood, -0.9 + i * 0.6, 1.06, -0.1);
      for (let k = 0; k < 5; k++) add(new SphereGeometry(0.09, 8, 6), new MeshStandardMaterial({ color: c, roughness: 0.5 }), -1.05 + i * 0.6 + (k % 3) * 0.13, 1.22 + Math.floor(k / 3) * 0.08, -0.15 + (k % 2) * 0.1, false);
    });
    this.physics.add({ kind: 'box', x, z, hx: 1.35, hz: 0.55, rot, y0: y - 1, y1: y + 1.0, walkable: false });
    clearings.push({ x, z, r: 2.4 });
  }

  private outpost(): void {
    this.lodge();
    this.house(29, 46, -0.5, 6, 5, '#d8584a', { chimney: true });
    this.house(-19, 66, 0.6, 5.5, 4.5, '#3c9a8a');
    this.house(31, 70, -0.9, 6.5, 5, '#e09a3a', { chimney: true, tall: true });
    this.house(-10, 84, 0.2, 5, 4.5, '#8a5ac8');
    this.stall(21, 59.5, Math.PI, ['#e85a5a', '#fff4e0'], ['#ff6a5a', '#ffb34a', '#7fd06a', '#a07aff']);
    this.stall(13, 66.5, Math.PI * 0.85, ['#3f7fd0', '#fff4e0'], ['#5fe0d8', '#ffd75a', '#ff8fc0']);
    // cobbled plaza with a planted ring around the well
    const plaza = new Mesh(new CircleGeometry(10.5, 48), new MeshStandardMaterial({ map: cobbleTexture(), roughness: 0.95, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(OUTPOST_AT[0], this.y(OUTPOST_AT[0], OUTPOST_AT[1]) + 0.04, OUTPOST_AT[1]);
    plaza.receiveShadow = true;
    plaza.renderOrder = 1;
    this.group.add(plaza);
    const bedMat = this.mats.vc;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const bx = 12 + Math.cos(a) * 3.4;
      const bz = 51 + Math.sin(a) * 3.4;
      const by = this.y(bx, bz);
      this.mesh(gradient(xf(cylinder(0.75, 0.85, 0.35, 12), {}), '#9a8a74', '#c8b89a'), bedMat, bx, by + 0.17, bz);
      for (let f = 0; f < 5; f++) {
        const fa = (f / 5) * Math.PI * 2;
        this.mesh(prep(xf(ellipsoid(0.12, 0.08, 0.12), {}), ['#ff8fc0', '#ffd84a', '#ffffff', '#a88cff', '#ff6a5a'][(k + f) % 5]), bedMat, bx + Math.cos(fa) * 0.4, by + 0.45, bz + Math.sin(fa) * 0.4, 0, false);
      }
      this.mesh(prep(lumpy(new SphereGeometry(0.45, 10, 6), 0.06, 4, k), '#4f9a3a'), bedMat, bx, by + 0.38, bz, 0, false);
    }
    // benches
    for (const [bx, bz, r] of [[2, 54, 0.4], [20, 50, -0.6], [6, 64, 2.9]] as [number, number, number][]) {
      const by = this.y(bx, bz);
      this.mesh(new RoundedBoxGeometry(1.8, 0.1, 0.5, 1, 0.03), this.mats.wood, bx, by + 0.48, bz, r);
      for (const s of [-0.7, 0.7]) this.mesh(new BoxGeometry(0.12, 0.46, 0.45), this.mats.darkWood, bx + Math.cos(r) * s, by + 0.23, bz - Math.sin(r) * s, r);
      this.physics.add({ kind: 'box', x: bx, z: bz, hx: 0.9, hz: 0.28, rot: r, y0: by - 1, y1: by + 0.53 });
    }
    // well
    const wx = 12;
    const wz = 51;
    const wy = this.y(wx, wz);
    this.mesh(cylinder(1.0, 1.1, 0.9, 16), this.mats.stone, wx, wy + 0.45, wz);
    this.mesh(new CylinderGeometry(0.85, 0.85, 0.05, 16), new MeshStandardMaterial({ color: '#2a5f9a', roughness: 0.1 }), wx, wy + 0.75, wz, 0, false);
    for (const s of [-1, 1]) this.mesh(cylinder(0.07, 0.07, 1.8, 6), this.mats.darkWood, wx + s * 0.9, wy + 1.4, wz);
    this.mesh(this.roof(2.4, 1.6, 0.7, '#d8584a'), this.roofMat('#d8584a'), wx, wy + 2.25, wz, Math.PI / 2);
    this.physics.add({ kind: 'cyl', x: wx, z: wz, r: 1.15, y0: wy - 1, y1: wy + 0.9, walkable: false });
    clearings.push({ x: wx, z: wz, r: 2 });
    // campfire seating
    const cx = -5;
    const cz = 60;
    const cy = this.y(cx, cz);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      const log = this.mesh(gradient(xf(cylinder(0.28, 0.3, 2.0, 10), { r: [0, 0, Math.PI / 2] }), '#6a4630', '#8a5e3a'), this.mats.vc, cx + Math.cos(a) * 2.4, cy + 0.28, cz + Math.sin(a) * 2.4, -a + Math.PI / 2);
      void log;
      this.physics.add({ kind: 'box', x: cx + Math.cos(a) * 2.4, z: cz + Math.sin(a) * 2.4, hx: 1.0, hz: 0.3, rot: -a + Math.PI / 2, y0: cy - 1, y1: cy + 0.5 });
    }
    clearings.push({ x: cx, z: cz, r: 3.6 });
    // training yard fence
    this.fence([[-10, 72.5], [-10, 83], [16, 83], [16, 72.5]]);
    clearings.push({ x: 3, z: 78, r: 8 });
    // lanterns along the plaza
    const lamps: [number, number, boolean][] = [[6, 47, true], [18, 52, false], [16, 64, true], [-2, 66, false], [22, 40, false], [-6, 50, true], [36, 2, false], [-8, 26, false]];
    for (const [x, z, l] of lamps) this.lantern(x, z, l);
    // fences by the path out of town
    this.fence([[26, 30], [31, 21]]);
    this.fence([[18, 27], [22, 19]]);
    // crates and barrels
    const crate = new RoundedBoxGeometry(0.8, 0.8, 0.8, 2, 0.06);
    for (const [x, z, r] of [[25, 61, 0.3], [25.6, 62.2, 0.9], [8, 44.5, 0.1], [-6.5, 43, 0.6]] as [number, number, number][]) {
      this.mesh(crate, this.mats.wood, x, this.y(x, z) + 0.4, z, r);
      this.physics.add({ kind: 'box', x, z, hx: 0.42, hz: 0.42, rot: r, y0: this.y(x, z) - 1, y1: this.y(x, z) + 0.8 });
    }
    const barrel = gradient(lumpy(cylinder(0.38, 0.38, 0.95, 14), 0.01, 3, 1), '#8a5a36', '#a87a4a');
    for (const [x, z] of [[24.2, 63.6], [-7.4, 44.6], [35, 48]] as [number, number][]) {
      this.mesh(barrel, this.mats.vc, x, this.y(x, z) + 0.48, z);
      this.physics.add({ kind: 'cyl', x, z, r: 0.42, y0: this.y(x, z) - 1, y1: this.y(x, z) + 0.95 });
    }
    // banner poles with waving flags
    for (const [x, z, c] of [[20, 40, '#f2c35a'], [-2, 52, '#5fd0ff'], [14, 72, '#e85a8a']] as [number, number, string][]) {
      const y = this.y(x, z);
      this.mesh(cylinder(0.06, 0.07, 4.5, 6), this.mats.darkWood, x, y + 2.25, z);
      const flag = this.mesh(new PlaneGeometry(1.2, 0.7, 8, 2), new MeshStandardMaterial({ color: c, side: DoubleSide, roughness: 0.9 }), x + 0.62, y + 4.0, z, 0, true);
      flag.userData.dynamic = true;
      this.flags.push({ obj: flag, phase: x * 0.3 });
      this.physics.add({ kind: 'cyl', x, z, r: 0.12, y0: y - 1, y1: y + 4.5, walkable: false });
    }
  }

  private bridge(): void {
    const [ax, az] = BRIDGE.from;
    const [bx, bz] = BRIDGE.to;
    const len = Math.hypot(bx - ax, bz - az);
    const rot = -Math.atan2(bz - az, bx - ax);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const yA = this.y(ax, az) + 0.12;
    const yB = this.y(bx, bz) + 0.12;
    const peak = Math.max(BRIDGE.deck + 0.4, Math.max(yA, yB) + 0.6);
    // deck height along the span: bank to bank with an arch in the middle
    const deckY = (t: number) => {
      const base = yA + (yB - yA) * t;
      const mid = (yA + yB) / 2;
      return base + (peak - mid) * Math.sin(t * Math.PI);
    };
    const slope = (t: number) => (deckY(Math.min(1, t + 0.01)) - deckY(Math.max(0, t - 0.01))) / (0.02 * len);
    const g = new Group();
    g.position.set(mx, 0, mz);
    g.rotation.y = rot;
    this.group.add(g);
    const plank = this.mats.wood;
    const n = 26;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const m = new Mesh(new RoundedBoxGeometry(len / n + 0.05, 0.14, BRIDGE.width, 1, 0.03), plank);
      m.position.set((t - 0.5) * len, deckY(t) - 0.07, 0);
      m.rotation.z = Math.atan(slope(t));
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    for (const s of [-1, 1]) {
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const post = new Mesh(new RoundedBoxGeometry(0.18, 1.1, 0.18, 1, 0.04), this.mats.darkWood);
        post.position.set((t - 0.5) * len, deckY(t) + 0.5, (s * BRIDGE.width) / 2);
        post.castShadow = true;
        g.add(post);
        if (k < 10) {
          const t2 = (k + 0.5) / 10;
          const rail = new Mesh(new BoxGeometry(len / 10 + 0.12, 0.1, 0.1), this.mats.darkWood);
          rail.position.set((t2 - 0.5) * len, deckY(t2) + 0.95, (s * BRIDGE.width) / 2);
          rail.rotation.z = Math.atan(slope(t2));
          g.add(rail);
        }
      }
      for (const t of [0.3, 0.7]) {
        const top = deckY(t) - 0.15;
        const pier = new Mesh(cylinder(0.5, 0.65, top + 2, 10), this.mats.stone);
        pier.position.set((t - 0.5) * len, (top - 2) / 2, s * (BRIDGE.width / 2 - 0.4));
        pier.castShadow = true;
        g.add(pier);
      }
    }
    // colliders: walkable deck segments following the curve, plus rails
    const segs = 18;
    for (let k = 0; k < segs; k++) {
      const t = (k + 0.5) / segs;
      const lx = (t - 0.5) * len;
      const top = deckY(t) - 0.02;
      const wx = mx + lx * Math.cos(rot);
      const wz = mz - lx * Math.sin(rot);
      this.physics.add({ kind: 'box', x: wx, z: wz, hx: len / segs / 2 + 0.05, hz: BRIDGE.width / 2, rot, y0: top - 0.45, y1: top });
    }
    for (const s of [-1, 1]) {
      const ox = Math.sin(rot) * s * (BRIDGE.width / 2 + 0.05);
      const oz = Math.cos(rot) * s * (BRIDGE.width / 2 + 0.05);
      this.physics.add({ kind: 'box', x: mx + ox, z: mz + oz, hx: len / 2 - 0.6, hz: 0.1, rot, y0: Math.min(yA, yB) - 0.2, y1: peak + 1.4, walkable: false });
    }
    clearings.push({ x: ax, z: az, r: 2.5 }, { x: bx, z: bz, r: 2.5 });
    // stepping stones downstream
    STEPPING_STONES.forEach(([x, z], i) => {
      const top = WATER_LEVEL + 0.35 + (i % 2) * 0.06;
      const geo = gradient(xf(rockGeo(40 + i, 1), { s: [0.8, 0.6, 0.75] }), '#7f7a72', '#cfc8ba', { moss: '#6fae4a' });
      this.mesh(geo, this.mats.vc, x, top - 0.35, z, i);
      this.physics.add({ kind: 'cyl', x, z, r: 0.75, y0: top - 3, y1: top });
    });
  }

  private beaconHill(): void {
    const [bx, bz] = BEACON.at;
    const by = this.y(bx, bz);
    const g = new Group();
    g.position.set(bx, by, bz);
    this.group.add(g);
    const add = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number, cast = true) => {
      const m = new Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // stepped plinth and a tapering round tower
    add(new CylinderGeometry(4.4, 4.8, 0.6, 24), this.mats.stone, 0, 0.3, 0);
    add(new CylinderGeometry(3.6, 3.9, 0.6, 24), this.mats.stone, 0, 0.9, 0);
    const towerH = 8;
    add(new CylinderGeometry(2.1, 2.7, towerH, 20), this.mats.stone, 0, 1.2 + towerH / 2, 0);
    for (let k = 0; k < 3; k++) add(torus(2.25 - k * 0.15, 0.12, 6, 28), this.mats.darkWood, 0, 3 + k * 2.4, 0, false).rotation.x = Math.PI / 2;
    // balcony and lantern cage
    const topY = 1.2 + towerH;
    add(new CylinderGeometry(2.9, 2.4, 0.5, 24), this.mats.stone, 0, topY + 0.25, 0);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      add(cylinder(0.14, 0.16, 2.6, 8), this.mats.stone, Math.cos(a) * 2.3, topY + 1.8, Math.sin(a) * 2.3);
    }
    add(cone(3.2, 2.2, 6), this.roofMat('#3f7fd0'), 0, topY + 4.2, 0).rotation.y = Math.PI / 6;
    add(new OctahedronGeometry(0.4), new MeshStandardMaterial({ color: '#ffd75a', emissive: new Color('#ffb020'), emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3 }), 0, topY + 5.6, 0);
    const crystalMat = new MeshStandardMaterial({ color: '#7f8ca8', emissive: new Color('#9fe8ff'), emissiveIntensity: 0, roughness: 0.15, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.92 });
    const crystal = add(new OctahedronGeometry(1.0, 0), crystalMat, 0, topY + 1.9, 0);
    crystal.scale.set(0.9, 1.4, 0.9);
    const beamMat = new MeshBasicMaterial({ color: '#bff4ff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false });
    const beam = add(new CylinderGeometry(0.9, 2.4, 140, 20, 1, true), beamMat, 0, topY + 72, 0, false);
    const ring = add(torus(3.2, 0.06, 6, 48), new MeshBasicMaterial({ color: '#bff4ff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }), 0, topY + 0.6, 0, false);
    ring.rotation.x = Math.PI / 2;
    const light = new PointLight('#aef0ff', 0, 60, 1.4);
    light.position.set(bx, by + topY + 2, bz);
    this.group.add(light);
    // door
    add(new RoundedBoxGeometry(1.2, 2.0, 0.3, 2, 0.08), this.mats.wood, 0, 2.2, 2.55);
    crystal.userData.dynamic = true;
    beam.userData.dynamic = true;
    ring.userData.dynamic = true;
    this.beacon = { crystal, beam, light, ring, top: new Vector3(bx, by + topY + 1.9, bz) };
    this.physics.add({ kind: 'cyl', x: bx, z: bz, r: 4.6, y0: by - 2, y1: by + 0.6 });
    this.physics.add({ kind: 'cyl', x: bx, z: bz, r: 3.8, y0: by - 2, y1: by + 1.2 });
    this.physics.add({ kind: 'cyl', x: bx, z: bz, r: 2.8, y0: by - 2, y1: by + topY + 5, walkable: false });
    clearings.push({ x: bx, z: bz, r: 7 });
    // the puzzle square: altar and prisms keep their spots clear
    clearings.push({ x: ALTAR.at[0], z: ALTAR.at[1], r: 3 });
    for (const p of PRISMS) clearings.push({ x: p.at[0], z: p.at[1], r: 3 });
    // low wall ring around the hilltop with gaps
    for (let k = 0; k < 18; k++) {
      if (k % 6 === 4) continue;
      const a = (k / 18) * Math.PI * 2;
      const r = HILL.plateau + 1;
      const x = bx + Math.cos(a) * r;
      const z = bz + Math.sin(a) * r;
      const y = this.y(x, z);
      const stone = this.mesh(new RoundedBoxGeometry(2.6, 0.7, 0.7, 2, 0.15), this.mats.ruin, x, y + 0.2, z, -a + Math.PI / 2);
      stone.rotation.z = (k % 3) * 0.04;
      this.physics.add({ kind: 'box', x, z, hx: 1.3, hz: 0.35, rot: -a + Math.PI / 2, y0: y - 1, y1: y + 0.55 });
    }
  }

  private ruins(): void {
    const [rx, rz] = RUINS.at;
    const ry = this.y(rx, rz);
    const noise = new Noise2D(new Rng(17));
    // central mosaic floor
    const floor = this.mesh(new CylinderGeometry(7, 7.2, 0.3, 32), this.mats.ruin, rx, ry + 0.05, rz, 0, false);
    floor.receiveShadow = true;
    this.mesh(torus(5.2, 0.12, 6, 40), new MeshStandardMaterial({ color: '#5fd0ff', emissive: new Color('#3fb8ff'), emissiveIntensity: 0.35 }), rx, ry + 0.22, rz, 0, false).rotation.x = Math.PI / 2;
    // broken pillars around the floor
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.2;
      const x = rx + Math.cos(a) * 9;
      const z = rz + Math.sin(a) * 9;
      const y = this.y(x, z);
      const h = 2.2 + ((k * 37) % 5) * 0.9;
      const pillar = cylinder(0.55, 0.65, h, 12);
      const pos = pillar.attributes.position;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > h / 2 - 0.01) pos.setY(i, pos.getY(i) - Math.max(0, noise.get(pos.getX(i) * 3 + k, pos.getZ(i) * 3)) * 0.8);
      pillar.computeVertexNormals();
      this.mesh(pillar, this.mats.ruin, x, y + h / 2, z, a);
      this.mesh(new RoundedBoxGeometry(1.5, 0.4, 1.5, 2, 0.08), this.mats.ruin, x, y + 0.2, z, a);
      this.physics.add({ kind: 'cyl', x, z, r: 0.75, y0: y - 1, y1: y + h });
    }
    // arches
    const arch = (x: number, z: number, rot: number, w = 5, h = 5) => {
      const y = this.y(x, z);
      const g = new Group();
      g.position.set(x, y, z);
      g.rotation.y = rot;
      this.group.add(g);
      for (const s of [-1, 1]) {
        const col = new Mesh(new RoundedBoxGeometry(1.0, h, 1.0, 2, 0.1), this.mats.ruin);
        col.position.set((s * w) / 2, h / 2, 0);
        col.castShadow = true;
        g.add(col);
        this.physics.add({ kind: 'box', x: x + Math.cos(rot) * (s * w) / 2, z: z - Math.sin(rot) * (s * w) / 2, hx: 0.55, hz: 0.55, rot, y0: y - 1, y1: y + h, walkable: false });
      }
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = (k / (n - 1)) * Math.PI;
        const stone = new Mesh(new RoundedBoxGeometry(0.9, 0.7, 1.0, 1, 0.08), this.mats.ruin);
        stone.position.set(Math.cos(a) * (w / 2), h + Math.sin(a) * (w / 2) * 0.7, 0);
        stone.rotation.z = a - Math.PI / 2;
        stone.castShadow = true;
        g.add(stone);
      }
      // ivy
      for (let k = 0; k < 6; k++) {
        const leaf = new Mesh(prep(lumpy(new SphereGeometry(0.35, 8, 6), 0.06, 4, k), '#4f9a3a'), this.mats.vc);
        leaf.position.set((k % 2 ? 1 : -1) * w * 0.5 + (k % 3) * 0.1, 1 + k * 0.6, 0.5);
        g.add(leaf);
      }
    };
    arch(rx - 15, rz + 7, 1.2);
    arch(rx + 9, rz + 15, -0.3, 4.4, 4.2);
    // broken wall runs
    const wallRun = (x0: number, z0: number, x1: number, z1: number, h: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.ceil(len / 1.2);
      const rot = -Math.atan2(z1 - z0, x1 - x0);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        const y = this.y(x, z);
        const hh = h * (0.4 + 0.6 * Math.abs(noise.get(x * 0.3, z * 0.3)));
        this.mesh(new RoundedBoxGeometry(1.2, hh, 0.8, 1, 0.1), this.mats.ruin, x, y + hh / 2 - 0.1, z, rot);
        this.physics.add({ kind: 'box', x, z, hx: 0.6, hz: 0.42, rot, y0: y - 1, y1: y + hh - 0.1 });
      }
    };
    wallRun(rx + 14, rz - 4, rx + 18, rz + 8, 2.4);
    wallRun(rx - 6, rz - 16, rx - 14, rz - 10, 2.0);

    // the vault temple: its door faces the plaza (+z) at z = −49
    const vx = 110;
    const vz = -52.5;
    const vy = this.y(vx, vz);
    const vw = 8;
    const vd = 7;
    const vh = 4.2;
    const vg = new Group();
    vg.position.set(vx, vy, vz);
    this.group.add(vg);
    const vAdd = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number) => {
      const m = new Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      vg.add(m);
      return m;
    };
    vAdd(new BoxGeometry(vw + 1, 0.4, vd + 1), this.mats.ruin, 0, 0.1, 0);
    const doorGap = 2.2;
    const sideW = (vw - doorGap) / 2;
    vAdd(new BoxGeometry(vw, vh, 0.7), this.mats.ruin, 0, vh / 2, -vd / 2);
    vAdd(new BoxGeometry(0.7, vh, vd), this.mats.ruin, -vw / 2, vh / 2, 0);
    vAdd(new BoxGeometry(0.7, vh, vd), this.mats.ruin, vw / 2, vh / 2, 0);
    vAdd(new BoxGeometry(sideW, vh, 0.7), this.mats.ruin, -(doorGap / 2 + sideW / 2), vh / 2, vd / 2);
    vAdd(new BoxGeometry(sideW, vh, 0.7), this.mats.ruin, doorGap / 2 + sideW / 2, vh / 2, vd / 2);
    vAdd(new BoxGeometry(doorGap + 0.2, 1.0, 0.7), this.mats.ruin, 0, vh - 0.5, vd / 2);
    vAdd(new RoundedBoxGeometry(vw + 1.4, 0.6, vd + 1.4, 2, 0.15), this.mats.ruin, 0, vh + 0.3, 0);
    vAdd(cone(4.4, 2.4, 4), this.roofMat('#4f8a7a'), 0, vh + 1.8, 0).rotation.y = Math.PI / 4;
    const wallC = (x: number, z: number, hx: number, hz: number) => this.physics.add({ kind: 'box', x: vx + x, z: vz + z, hx, hz, rot: 0, y0: vy - 1, y1: vy + vh + 3, walkable: false });
    wallC(0, -vd / 2, vw / 2, 0.38);
    wallC(-vw / 2, 0, 0.38, vd / 2);
    wallC(vw / 2, 0, 0.38, vd / 2);
    wallC(-(doorGap / 2 + sideW / 2), vd / 2, sideW / 2, 0.38);
    wallC(doorGap / 2 + sideW / 2, vd / 2, sideW / 2, 0.38);
    this.physics.add({ kind: 'box', x: vx, z: vz, hx: vw / 2 + 0.5, hz: vd / 2 + 0.5, rot: 0, y0: vy - 2, y1: vy + 0.3 });
    clearings.push({ x: vx, z: vz, r: 6.5 });

    // the water garden: walls with a gate on the west side (x = 92)
    const gx = 96.5;
    const gz = -60;
    const gy = this.y(gx, gz);
    const gw = 9;
    const gd = 7;
    const gh = 2.6;
    const seg = (x: number, z: number, w: number, d: number) => {
      const y = this.y(x, z);
      this.mesh(new BoxGeometry(w, gh, d), this.mats.ruin, x, y + gh / 2 - 0.2, z);
      this.physics.add({ kind: 'box', x, z, hx: w / 2, hz: d / 2, rot: 0, y0: y - 1, y1: y + gh, walkable: false });
    };
    seg(gx, gz - gd / 2, gw, 0.6);
    seg(gx, gz + gd / 2, gw, 0.6);
    seg(gx + gw / 2, gz, 0.6, gd);
    seg(gx - gw / 2, gz - gd / 2 + 1.2, 0.6, 2.4);
    seg(gx - gw / 2, gz + gd / 2 - 1.2, 0.6, 2.4);
    this.mesh(new CylinderGeometry(1.2, 1.3, 0.6, 16), this.mats.ruin, gx + 1.5, gy + 0.3, gz);
    clearings.push({ x: gx, z: gz, r: 5.5 });
    // channel from the basin to the gate
    const ch = this.mesh(new BoxGeometry(6.2, 0.15, 0.8), this.mats.ruin, 89, this.y(89, -57) + 0.05, -57, 0.75, false);
    void ch;

    // launch ledge toward the sky pillar
    const lx = 100;
    const lz = -63;
    const ly = this.y(lx, lz);
    this.mesh(new RoundedBoxGeometry(4, 0.6, 5, 2, 0.12), this.mats.ruin, lx, ly + 0.1, lz - 1);
    this.physics.add({ kind: 'box', x: lx, z: lz - 1, hx: 2, hz: 2.5, rot: 0, y0: ly - 3, y1: ly + 0.4 });
    // the sky pillar
    const [px, pz] = SKY_PILLAR.at;
    const py = this.y(px, pz);
    const ph = SKY_PILLAR.top - py;
    const pillarGeo = gradient(lumpy(cylinder(SKY_PILLAR.radius, SKY_PILLAR.radius * 1.25, ph + 1, 14), 0.25, 0.8, 5), '#8f8a80', '#c8c2b4', { moss: '#6fae4a', mossAmount: 0.9 });
    this.mesh(pillarGeo, this.mats.vc, px, py + ph / 2 - 0.5, pz);
    this.mesh(prep(lumpy(new SphereGeometry(SKY_PILLAR.radius * 0.95, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.08, 3, 2), '#6fae4a'), this.mats.vc, px, SKY_PILLAR.top - 0.35, pz).scale.y = 0.2;
    this.physics.add({ kind: 'cyl', x: px, z: pz, r: SKY_PILLAR.radius, y0: py - 2, y1: SKY_PILLAR.top });
    // stairs on the west slope
    for (let k = 0; k < 8; k++) {
      const x = 78 + k * 1.1;
      const z = -21 - k * 1.3;
      this.mesh(new RoundedBoxGeometry(3.4, 0.3, 1.2, 1, 0.06), this.mats.ruin, x, this.y(x, z) + 0.05, z, -0.7, false);
    }
  }

  private cave(): void {
    const rockMat = new MeshStandardMaterial({ map: rockTexture(), color: '#8a8698', roughness: 0.95, side: BackSide });
    const floor = CAVE.floor;
    // hall dome
    const dome = lumpy(new SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), 0.08, 3, 4);
    const hall = this.mesh(dome, rockMat, CAVE.hall[0], floor - 0.6, CAVE.hall[1], 0, true);
    hall.scale.set(CAVE.hallRadius + 2, 9, CAVE.hallRadius + 2);
    const deep = this.mesh(dome.clone(), rockMat, CAVE.deep[0], floor - 0.6, CAVE.deep[1], 0, true);
    deep.scale.set(8, 6.5, 8);
    // corridor tube
    const c = CAVE.corridor;
    const len = 10;
    const tube = lumpy(new CylinderGeometry(1, 1, 1, 24, 10, true, -Math.PI / 2, Math.PI), 0.06, 2, 8);
    tube.rotateX(Math.PI / 2);
    const t = this.mesh(tube, rockMat, c.x, floor - 0.4, -102, 0, true);
    t.scale.set(c.half + 1.2, 5, len);
    // mouth: rocks framing the entrance
    const rockVc = new MeshStandardMaterial({ map: rockTexture(), vertexColors: true, roughness: 0.95 });
    const mouthZ = c.z1 - 3.5;
    const mouth: [number, number, number, number][] = [[-4.4, 0.4, 0, 1.7], [4.4, 0.4, 0.3, 1.6], [-3.4, 3.6, 0, 1.4], [3.3, 3.7, 0.2, 1.4], [-1.3, 5.2, 0.1, 1.3], [1.4, 5.3, 0, 1.3], [-5.2, 2.2, -1, 1.5], [5.2, 2.4, -1, 1.5]];
    mouth.forEach(([x, y, z, s], i) => {
      const g = gradient(xf(rockGeo(60 + i, 1), { s }), '#6f6a66', '#a8a29a', { moss: '#5f9a46', mossAmount: 0.7 });
      this.mesh(g, rockVc, c.x + x, floor + y - 0.6, mouthZ + z);
      if (y < 3) this.physics.add({ kind: 'cyl', x: c.x + x, z: mouthZ + z, r: s * 0.85, y0: floor - 2, y1: floor + 3, walkable: false });
    });
    // crystal clusters with a light budget of three
    const crystalMats = ['#7fe8ff', '#c39bff', '#ffe08a'].map((col) => new MeshStandardMaterial({ color: col, emissive: new Color(col), emissiveIntensity: 0.9, roughness: 0.2, flatShading: true, transparent: true, opacity: 0.9 }));
    const rng = new Rng(9);
    const clusters: [number, number][] = [[-44, -112], [-30, -116], [-36, -126], [-48, -130], [-42, -121], [-31, -109]];
    clusters.forEach(([x, z], i) => {
      const y = this.y(x, z);
      const mat = crystalMats[i % 3];
      for (let k = 0; k < 6; k++) {
        const s = rng.float(0.25, 0.7);
        const m = this.mesh(new OctahedronGeometry(1, 0), mat, x + rng.float(-0.8, 0.8), y + s * 1.2, z + rng.float(-0.8, 0.8), rng.next() * 3, false);
        m.scale.set(s * 0.45, s * 1.8, s * 0.45);
        m.rotation.z = rng.float(-0.5, 0.5);
      }
      this.physics.add({ kind: 'cyl', x, z, r: 1.1, y0: y - 1, y1: y + 1.4, walkable: false });
    });
    const lightSpots: [number, number, string][] = [[-36, -116, '#7fe8ff'], [-46, -127, '#c39bff'], [-34, -106, '#9fd8ff']];
    for (const [x, z, col] of lightSpots) {
      const l = new PointLight(col, 9, 22, 1.4);
      l.position.set(x, this.y(x, z) + 2.5, z);
      this.group.add(l);
      this.caveLights.push(l);
    }
  }

  private falls(): void {
    const w = COVE_WALL;
    const geo = lumpy(new BoxGeometry(w.halfW * 2 + 2, w.top - w.bottom, 3.2, 14, 18, 3), 0.45, 0.35, 12);
    const g = gradient(geo, '#6f6a66', '#a8a29a', { moss: '#5f9a46', mossAmount: 0.8, jitter: 0.04 });
    const m = this.mesh(g, new MeshStandardMaterial({ map: rockTexture(), vertexColors: true, roughness: 0.95 }), w.x, (w.top + w.bottom) / 2, w.z);
    m.receiveShadow = true;
    this.physics.add({ kind: 'box', x: w.x, z: w.z, hx: w.halfW + 1, hz: 1.6, rot: 0, y0: w.bottom, y1: w.top, walkable: false });
    // side boulders so the channel edges read as rock
    for (const s of [-1, 1]) {
      const rg = gradient(xf(rockGeo(80 + s, 1), { s: [3, 5, 3] }), '#6f6a66', '#a8a29a', { moss: '#5f9a46' });
      this.mesh(rg, new MeshStandardMaterial({ map: rockTexture(), vertexColors: true, roughness: 0.95 }), w.x + s * (w.halfW + 2.5), WATER_LEVEL + 2, w.z + 2);
      this.physics.add({ kind: 'cyl', x: w.x + s * (w.halfW + 2.5), z: w.z + 2, r: 3.2, y0: -6, y1: WATER_LEVEL + 6, walkable: false });
    }
  }

  private windmill(): void {
    const [x, z] = LOCATION_BY_ID.windmill.at;
    const y = this.y(x, z);
    this.mesh(new CylinderGeometry(2.0, 2.8, 7, 12), this.mats.plaster, x, y + 3.5, z);
    this.mesh(cone(2.8, 2.6, 12), this.roofMat('#d8584a'), x, y + 8.3, z);
    this.mesh(new RoundedBoxGeometry(1.1, 1.9, 0.3, 2, 0.06), this.mats.wood, x, y + 1, z + 2.55, 0);
    const win = this.windowMat();
    this.mesh(new BoxGeometry(0.7, 0.7, 0.1), win, x, y + 4.5, z + 2.3, 0, false);
    const hub = new Group();
    hub.userData.dynamic = true;
    hub.position.set(x, y + 6.4, z + 2.7);
    this.group.add(hub);
    const sail = new MeshStandardMaterial({ map: stripeTexture('#fff4e0', '#e6d6b8'), roughness: 0.9, side: DoubleSide });
    for (let k = 0; k < 4; k++) {
      const arm = new Group();
      arm.rotation.z = (k / 4) * Math.PI * 2;
      const pole = new Mesh(new BoxGeometry(0.16, 5.2, 0.12), this.mats.darkWood);
      pole.position.y = 2.6;
      pole.castShadow = true;
      const cloth = new Mesh(new PlaneGeometry(1.4, 4.0), sail);
      cloth.position.set(0.8, 3.0, 0.05);
      cloth.castShadow = true;
      arm.add(pole, cloth);
      hub.add(arm);
    }
    hub.add(new Mesh(new SphereGeometry(0.35, 10, 8), this.mats.darkWood));
    this.spinners.push({ obj: hub, speed: 0.5, axis: 'z' });
    this.physics.add({ kind: 'cyl', x, z, r: 2.7, y0: y - 1, y1: y + 9, walkable: false });
    clearings.push({ x, z, r: 4 });
  }

  /** Distant mountains, a castle on a far peak and ribbon waterfalls. */
  private backdrop(): void {
    const noise = new Noise2D(new Rng(99));
    const ringGeo = new CylinderGeometry(1, 1, 1, 160, 10, true);
    const pos = ringGeo.attributes.position;
    const colors: number[] = [];
    const base = new Color('#5f8a8a');
    const mid = new Color('#8a9ab8');
    const snow = new Color('#f4f8ff');
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const t = pos.getY(i) + 0.5; // 0 bottom .. 1 top
      const r = 560 - t * 160;
      const peak = 0.5 + 0.5 * noise.ridged(Math.cos(a) * 3 + 5, Math.sin(a) * 3 - 2, 4);
      const hgt = t * (90 + 150 * peak) * (0.85 + 0.15 * noise.get(a * 8, t * 3));
      pos.setXYZ(i, Math.cos(a) * r, hgt - 10, Math.sin(a) * r);
      c.copy(base).lerp(mid, t);
      if (hgt > 150) c.lerp(snow, Math.min(1, (hgt - 150) / 50));
      colors.push(c.r, c.g, c.b);
    }
    ringGeo.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
    ringGeo.computeVertexNormals();
    this.backdropMat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: DoubleSide, fog: false });
    const ring = new Mesh(ringGeo, this.backdropMat);
    ring.frustumCulled = false;
    this.group.add(ring);
    // castle on a far ridge
    const castle = new Group();
    const cm = new MeshStandardMaterial({ color: '#e8e6f2', roughness: 0.9, fog: false });
    const roofM = new MeshStandardMaterial({ color: '#4f7fd8', roughness: 0.7, fog: false });
    this.hazed.push(cm, roofM);
    const towers: [number, number, number, number][] = [[0, 0, 4, 34], [10, 4, 3, 26], [-9, 5, 3, 24], [4, -8, 2.6, 30], [-3, 9, 2.4, 20]];
    for (const [x, z, r, h] of towers) {
      const tw = new Mesh(new CylinderGeometry(r, r * 1.1, h, 12), cm);
      tw.position.set(x, h / 2, z);
      const rf = new Mesh(new CylinderGeometry(0, r * 1.35, r * 2.8, 12), roofM);
      rf.position.set(x, h + r * 1.4, z);
      castle.add(tw, rf);
    }
    const keep = new Mesh(new BoxGeometry(18, 16, 14), cm);
    keep.position.set(0, 8, 2);
    castle.add(keep);
    castle.position.set(250, 95, -330);
    castle.scale.setScalar(1.3);
    this.group.add(castle);
    // a rock for it to stand on
    const crag = new Mesh(gradient(xf(rockGeo(5, 2), { s: [60, 110, 50] }), '#6f7f8a', '#9aa8b8'), this.backdropMat);
    crag.position.set(250, 0, -330);
    this.group.add(crag);
    // ribbon waterfalls on the mountains
    const fallMat = new MeshBasicMaterial({ color: '#dff4ff', transparent: true, opacity: 0.55, depthWrite: false });
    for (const [a, h] of [[-1.2, 120], [-1.9, 90], [2.6, 110], [0.4, 80]] as [number, number][]) {
      const r = 470;
      const f = new Mesh(new PlaneGeometry(6, h), fallMat);
      f.position.set(Math.cos(a) * r, h / 2 + 10, Math.sin(a) * r);
      f.lookAt(0, h / 2, 0);
      this.group.add(f);
    }
    // soft glow sprite behind the castle for depth
    const glow = new Mesh(new PlaneGeometry(240, 140), new MeshBasicMaterial({ map: softDot(), color: '#ffffff', transparent: true, opacity: 0.25, depthWrite: false }));
    glow.position.set(230, 120, -360);
    glow.lookAt(0, 60, 0);
    this.group.add(glow);
  }

  private hazed: MeshStandardMaterial[] = [];

  /** Night factor 0..1 drives windows, lanterns and lamps. */
  update(time: number, night: number, cave: number, haze?: Color): void {
    if (haze) {
      for (const m of [this.backdropMat, ...this.hazed]) {
        m.emissive.copy(haze).multiplyScalar(0.42);
        m.color.setScalar(0.62);
      }
    }
    for (const n of this.nightGlow) n.mat.emissiveIntensity = n.day + (n.night - n.day) * night;
    for (const l of this.lamps) l.intensity = 0.2 + night * 7;
    for (const l of this.caveLights) l.visible = cave > 0.05 || night > 0.99;
    for (const s of this.spinners) s.obj.rotation[s.axis] += s.speed * 0.016;
    for (const f of this.flags) {
      const pos = f.obj.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + 0.6;
        pos.setZ(i, Math.sin(time * 4 + f.phase + x * 4) * 0.12 * x);
      }
      pos.needsUpdate = true;
    }
  }
}
