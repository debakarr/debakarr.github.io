// Ambient life and weather: drifting pollen by day, fireflies at night,
// butterflies over the meadow, rain streaks and ground mist. Everything is
// a small pool of points/instances that follows the camera, so the cost is
// fixed no matter how far you walk.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  NormalBlending,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Group,
  type Vector3,
} from 'three';
import { Rng } from '../../shared/rng';
import { LOCATION_BY_ID } from '../data/world';
import { softDot } from '../engine/textures';
import type { Terrain } from './terrain';

const BOX = 46;

export class Ambient {
  readonly group = new Group();
  private pollen: Points;
  private fireflies: Points;
  private rain: LineSegments;
  private mist: Mesh[] = [];
  private butterflies: InstancedMesh;
  private bfState: { x: number; z: number; y: number; vx: number; vz: number; phase: number; home: [number, number] }[] = [];
  private seeds: Float32Array;
  private fseeds: Float32Array;
  private rainSeeds: Float32Array;
  private obj = new Object3D();
  private wings: Float32Array;

  constructor(private terrain: Terrain, density: number) {
    const rng = new Rng(77);
    const make = (n: number, color: string, size: number, additive: boolean) => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage));
      const p = new Points(g, new PointsMaterial({ map: softDot(), color, size, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending, opacity: 0.9, sizeAttenuation: true }));
      p.frustumCulled = false;
      this.group.add(p);
      return p;
    };
    const np = Math.floor(260 * density);
    this.pollen = make(np, '#fff6c8', 0.18, false);
    this.seeds = new Float32Array(np * 4).map(() => rng.next());
    const nf = Math.floor(140 * density);
    this.fireflies = make(nf, '#d8ff7a', 0.5, true);
    this.fseeds = new Float32Array(nf * 4).map(() => rng.next());
    // rain as short streaks
    const nr = Math.floor(900 * density);
    const rg = new BufferGeometry();
    rg.setAttribute('position', new BufferAttribute(new Float32Array(nr * 6), 3).setUsage(DynamicDrawUsage));
    this.rain = new LineSegments(rg, new LineBasicMaterial({ color: '#cfe4ff', transparent: true, opacity: 0.45, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.group.add(this.rain);
    this.rainSeeds = new Float32Array(nr * 3).map(() => rng.next());
    // low mist sheets
    const mistMat = new MeshBasicMaterial({ map: softDot(), color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
    for (let i = 0; i < 10; i++) {
      const m = new Mesh(new PlaneGeometry(30, 8), mistMat);
      m.userData.seed = rng.next();
      this.mist.push(m);
      this.group.add(m);
    }
    // butterflies: two quads per instance, flapping by scaling
    const wing = new PlaneGeometry(0.22, 0.16);
    wing.translate(0.11, 0, 0);
    const wing2 = wing.clone();
    wing2.rotateY(Math.PI);
    const pos = [...(wing.attributes.position.array as Float32Array), ...(wing2.attributes.position.array as Float32Array)];
    const idx = [...(wing.index!.array as Uint16Array), ...Array.from(wing2.index!.array as Uint16Array).map((v) => v + 4)];
    const bg = new BufferGeometry();
    bg.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    bg.setIndex(idx);
    bg.computeVertexNormals();
    const nb = Math.floor(24 * density) + 4;
    this.butterflies = new InstancedMesh(bg, new MeshBasicMaterial({ side: DoubleSide, color: '#ffffff' }), nb);
    this.butterflies.instanceMatrix.setUsage(DynamicDrawUsage);
    const palette = ['#ffd84a', '#ff8fc0', '#8fd8ff', '#ffffff', '#ffa84a', '#c8a0ff'];
    const homes: [number, number][] = [LOCATION_BY_ID.meadow.at as [number, number], [-20, 30], [10, 80], [-60, 60], [30, 20], [-70, -8]];
    for (let i = 0; i < nb; i++) {
      const home = homes[i % homes.length];
      this.bfState.push({ x: home[0] + rng.float(-10, 10), z: home[1] + rng.float(-10, 10), y: 1, vx: 0, vz: 0, phase: rng.next() * 10, home });
      this.butterflies.setColorAt(i, new Color(palette[i % palette.length]));
    }
    this.wings = new Float32Array(nb);
    this.butterflies.frustumCulled = false;
    this.group.add(this.butterflies);
  }

  update(cam: Vector3, time: number, dt: number, night: number, rain: number, mist: number, cave: number): void {
    // pollen: slow drift in a box around the camera
    const day = 1 - night;
    const pp = this.pollen.geometry.attributes.position as BufferAttribute;
    const s = this.seeds;
    for (let i = 0; i < pp.count; i++) {
      const x = wrap(s[i * 4] * BOX + time * 0.4 * (0.5 + s[i * 4 + 3]), cam.x);
      const z = wrap(s[i * 4 + 1] * BOX + time * 0.25, cam.z);
      const g = this.terrain.height(x, z);
      pp.setXYZ(i, x, g + 0.4 + s[i * 4 + 2] * 5 + Math.sin(time * 0.7 + i) * 0.3, z);
    }
    pp.needsUpdate = true;
    (this.pollen.material as PointsMaterial).opacity = 0.7 * day * (1 - rain) * (1 - cave);
    // fireflies: blinking at night, low to the ground
    const fp = this.fireflies.geometry.attributes.position as BufferAttribute;
    const f = this.fseeds;
    for (let i = 0; i < fp.count; i++) {
      const x = wrap(f[i * 4] * BOX + Math.sin(time * 0.3 + i) * 2, cam.x);
      const z = wrap(f[i * 4 + 1] * BOX + Math.cos(time * 0.27 + i * 1.3) * 2, cam.z);
      const g = this.terrain.height(x, z);
      fp.setXYZ(i, x, g + 0.5 + f[i * 4 + 2] * 2.2 + Math.sin(time * 1.1 + i) * 0.25, z);
    }
    fp.needsUpdate = true;
    const fm = this.fireflies.material as PointsMaterial;
    fm.opacity = Math.max(night, cave * 0.6) * (1 - rain * 0.7) * (0.7 + 0.3 * Math.sin(time * 3));
    this.fireflies.visible = fm.opacity > 0.02;
    // rain
    this.rain.visible = rain > 0.05 && cave < 0.5;
    if (this.rain.visible) {
      const rp = this.rain.geometry.attributes.position as BufferAttribute;
      const r = this.rainSeeds;
      for (let i = 0; i < rp.count / 2; i++) {
        const x = cam.x + (r[i * 3] - 0.5) * 50;
        const z = cam.z + (r[i * 3 + 1] - 0.5) * 50;
        const y = cam.y + 18 - ((r[i * 3 + 2] * 30 + time * 22) % 30);
        rp.setXYZ(i * 2, x, y, z);
        rp.setXYZ(i * 2 + 1, x + 0.05, y - 0.7, z + 0.02);
      }
      rp.needsUpdate = true;
      (this.rain.material as LineBasicMaterial).opacity = 0.45 * rain;
    }
    // mist sheets drift at knee height
    for (const m of this.mist) {
      const sd = m.userData.seed as number;
      const x = wrap(sd * 90 + time * 0.6, cam.x, 90);
      const z = wrap(((sd * 7.3) % 1) * 90, cam.z, 90);
      m.position.set(x, this.terrain.height(x, z) + 1.4, z);
      m.lookAt(cam.x, m.position.y, cam.z);
      (m.material as MeshBasicMaterial).opacity = Math.min(0.5, mist * 0.45 + night * 0.06);
    }
    // butterflies: wander near their homes by day, rest at night
    const visible = day > 0.3 && rain < 0.5;
    this.butterflies.visible = visible;
    if (visible) {
      this.bfState.forEach((b, i) => {
        b.phase += dt;
        const tx = b.home[0] + Math.sin(b.phase * 0.3 + i) * 9;
        const tz = b.home[1] + Math.cos(b.phase * 0.23 + i * 2) * 9;
        b.vx += ((tx - b.x) * 0.2 - b.vx) * dt + Math.sin(b.phase * 3 + i) * dt * 2;
        b.vz += ((tz - b.z) * 0.2 - b.vz) * dt + Math.cos(b.phase * 2.7 + i) * dt * 2;
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.y = this.terrain.height(b.x, b.z) + 0.8 + Math.sin(b.phase * 2 + i) * 0.4;
        this.wings[i] = Math.abs(Math.sin(b.phase * 18 + i));
        this.obj.position.set(b.x, b.y, b.z);
        this.obj.rotation.set(0, Math.atan2(b.vx, b.vz), 0);
        this.obj.scale.set(0.3 + 0.7 * this.wings[i], 1, 1);
        this.obj.updateMatrix();
        this.butterflies.setMatrixAt(i, this.obj.matrix);
      });
      this.butterflies.instanceMatrix.needsUpdate = true;
    }
  }
}

function wrap(v: number, center: number, box = BOX): number {
  const half = box / 2;
  let d = ((v - center + half) % box + box) % box;
  d -= half;
  return center + d;
}
