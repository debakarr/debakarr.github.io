// Lumi blossoms: clusters of glowing buds scattered through the meadows and
// woods. Walk through one to gather the orbs ripening inside; it regrows
// half a day later. They glow softly, so at night they mark the way.

import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import { Rng } from '../../shared/rng';
import { OUTPOST, PLAY_HALF, WATER_LEVEL } from '../data/world';
import type { Terrain } from './terrain';

export const BLOSSOM_REGROW_HOURS = 10;
const COUNT = 40;
const BUDS = 3;

export interface Blossom {
  id: string;
  pos: Vector3;
  /** Orbs it gives when gathered. */
  orbs: number;
}

export class Blossoms {
  readonly group = new Group();
  readonly list: Blossom[] = [];
  private buds: InstancedMesh;
  private stems: InstancedMesh;
  private leaves: InstancedMesh;
  private ready: boolean[] = [];
  private dummy = new Object3D();

  constructor(terrain: Terrain) {
    const rng = new Rng(4242);
    const spots: Vector3[] = [];
    for (let tries = 0; spots.length < COUNT && tries < 6000; tries++) {
      const x = (rng.next() * 2 - 1) * PLAY_HALF * 0.9;
      const z = (rng.next() * 2 - 1) * PLAY_HALF * 0.9;
      if (terrain.surfaceAt(x, z) !== 'grass') continue;
      const y = terrain.height(x, z);
      if (y < WATER_LEVEL + 0.4 || y > 26) continue;
      const slope = Math.abs(terrain.height(x + 1, z) - terrain.height(x - 1, z)) + Math.abs(terrain.height(x, z + 1) - terrain.height(x, z - 1));
      if (slope > 0.9) continue;
      if (Math.hypot(x - OUTPOST.at[0], z - OUTPOST.at[1]) < 14) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 13)) continue;
      spots.push(new Vector3(x, y, z));
    }
    spots.forEach((p, i) => this.list.push({ id: `blossom-${i}`, pos: p, orbs: 1 + (i % 3 === 0 ? 1 : 0) }));
    const n = this.list.length;
    const budMat = new MeshStandardMaterial({ color: '#dffaff', emissive: new Color('#5fe0ff'), emissiveIntensity: 1.6, roughness: 0.3 });
    const stemMat = new MeshStandardMaterial({ color: '#5aa84a', roughness: 0.8 });
    const leafMat = new MeshStandardMaterial({ color: '#4fae5a', roughness: 0.75 });
    this.buds = new InstancedMesh(new SphereGeometry(0.07, 12, 10).scale(1, 1.35, 1), budMat, n * BUDS);
    this.stems = new InstancedMesh(new CylinderGeometry(0.008, 0.012, 1, 5).translate(0, 0.5, 0), stemMat, n * BUDS);
    this.leaves = new InstancedMesh(new ConeGeometry(0.06, 0.28, 4).rotateX(Math.PI / 2).translate(0, 0, 0.14).scale(1, 0.25, 1), leafMat, n * 4);
    for (const m of [this.buds, this.stems, this.leaves]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = false;
      this.group.add(m);
    }
    this.ready = this.list.map(() => true);
    this.layout(0);
  }

  /** Updates which blossoms are in bloom from the save's record. */
  sync(done: Record<string, number>, clock: number): void {
    this.list.forEach((b, i) => {
      const at = done[b.id];
      this.ready[i] = at === undefined || clock - at >= BLOSSOM_REGROW_HOURS;
    });
  }

  /** The blossom within reach of `p`, if any is in bloom. */
  near(p: Vector3, reach = 1.4): number {
    for (let i = 0; i < this.list.length; i++) {
      if (!this.ready[i]) continue;
      const b = this.list[i].pos;
      if (Math.hypot(b.x - p.x, b.z - p.z) < reach && Math.abs(b.y - p.y) < 2.5) return i;
    }
    return -1;
  }

  isReady(i: number): boolean {
    return this.ready[i] ?? false;
  }

  gather(i: number): Blossom {
    this.ready[i] = false;
    return this.list[i];
  }

  update(time: number): void {
    this.layout(time);
  }

  private layout(time: number): void {
    const d = this.dummy;
    this.list.forEach((b, i) => {
      const on = this.ready[i];
      for (let k = 0; k < BUDS; k++) {
        const a = (k / BUDS) * Math.PI * 2 + i;
        const h = 0.38 + 0.12 * ((k + i) % 3);
        const ox = Math.cos(a) * 0.09;
        const oz = Math.sin(a) * 0.09;
        const sway = Math.sin(time * 1.6 + i + k) * 0.04;
        const tilt = Math.cos(a) * 0.18 + sway;
        d.position.set(b.pos.x + ox, b.pos.y, b.pos.z + oz);
        d.rotation.set(sway, 0, tilt);
        d.scale.set(1, on ? h : 0.0001, 1);
        d.updateMatrix();
        this.stems.setMatrixAt(i * BUDS + k, d.matrix);
        // the bud sits on the stem's tip (Euler XYZ applied to (0, h, 0))
        d.position.set(b.pos.x + ox - h * Math.sin(tilt), b.pos.y + h * Math.cos(tilt) * Math.cos(sway), b.pos.z + oz + h * Math.cos(tilt) * Math.sin(sway));
        d.rotation.set(0, 0, 0);
        const s = on ? 1 + 0.12 * Math.sin(time * 3 + i + k * 2) : 0.0001;
        d.scale.set(s, s, s);
        d.updateMatrix();
        this.buds.setMatrixAt(i * BUDS + k, d.matrix);
      }
      for (let k = 0; k < 4; k++) {
        d.position.set(b.pos.x, b.pos.y + 0.02, b.pos.z);
        d.rotation.set(0, (k / 4) * Math.PI * 2 + i, 0);
        d.scale.setScalar(1.1);
        d.updateMatrix();
        this.leaves.setMatrixAt(i * 4 + k, d.matrix);
      }
    });
    this.buds.instanceMatrix.needsUpdate = true;
    this.stems.instanceMatrix.needsUpdate = true;
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const m of [this.buds, this.stems, this.leaves]) {
      m.geometry.dispose();
      (m.material as MeshStandardMaterial).dispose();
    }
    this.group.removeFromParent();
  }
}
