// Water surfaces: one mesh fitted to every place the terrain dips below the
// water level (river, falls pool, channel, cove), with per-vertex depth
// colour and shoreline foam; a scrolling normal map for ripples; the
// waterfall; and the still Moonwell pond.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Vector2,
  type Texture,
} from 'three';
import { Rng } from '../../shared/rng';
import { COVE_WALL, LOCATION_BY_ID, WATER_LEVEL, WORLD_HALF } from '../data/world';
import { fallTexture, softDot, waterNormals } from '../engine/textures';
import { RES, STEP, type Terrain } from './terrain';

export class Water {
  readonly group = new Group();
  private normal: Texture;
  private fallA: Texture;
  private fallB: Texture;
  readonly surfaceMat: MeshStandardMaterial;
  private spray: Points;
  private sprayBase: Float32Array;
  private pond: Mesh;

  constructor(private terrain: Terrain) {
    this.normal = waterNormals().clone();
    this.normal.needsUpdate = true;
    this.normal.repeat.set(1, 1);
    this.surfaceMat = new MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      roughness: 0.06,
      metalness: 0.15,
      normalMap: this.normal,
      normalScale: new Vector2(0.35, 0.35),
      side: DoubleSide,
      depthWrite: false,
      envMapIntensity: 1.4,
    });
    const surface = new Mesh(this.buildSurface(), this.surfaceMat);
    surface.renderOrder = 2;
    surface.receiveShadow = true;
    this.group.add(surface);

    // Silverveil Falls: two scrolling layers over the cove wall's face
    this.fallA = fallTexture().clone();
    this.fallA.needsUpdate = true;
    this.fallB = fallTexture().clone();
    this.fallB.needsUpdate = true;
    this.fallB.repeat.set(1.6, 1.3);
    const top = 17.5;
    const h = top - WATER_LEVEL + 0.4;
    const fallGeo = new PlaneGeometry(9, h, 1, 8);
    // bulge the curtain outward toward the bottom
    const fp = fallGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const t = 1 - (fp.getY(i) + h / 2) / h;
      fp.setZ(i, t * t * 2.2);
    }
    fallGeo.computeVertexNormals();
    for (const [tex, z, op] of [[this.fallA, 0.2, 0.85], [this.fallB, 0.45, 0.55]] as const) {
      const m = new Mesh(fallGeo, new MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, color: '#e8f8ff' }));
      m.position.set(COVE_WALL.x, WATER_LEVEL - 0.2 + h / 2, COVE_WALL.z + 1.6 + z);
      m.renderOrder = 3;
      this.group.add(m);
    }
    // foam pool at the bottom
    const foam = new Mesh(new CircleGeometry(5.5, 32), new MeshBasicMaterial({ map: softDot(), color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(COVE_WALL.x, WATER_LEVEL + 0.04, COVE_WALL.z + 4.2);
    foam.scale.set(1.3, 0.8, 1);
    foam.renderOrder = 3;
    this.group.add(foam);
    // spray particles
    const rng = new Rng(3);
    const n = 160;
    this.sprayBase = new Float32Array(n * 4);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.sprayBase[i * 4] = COVE_WALL.x + rng.float(-5, 5);
      this.sprayBase[i * 4 + 1] = COVE_WALL.z + rng.float(3, 6);
      this.sprayBase[i * 4 + 2] = rng.next();
      this.sprayBase[i * 4 + 3] = rng.float(0.6, 1.4);
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(pos, 3));
    this.spray = new Points(sg, new PointsMaterial({ map: softDot(), size: 1.6, transparent: true, opacity: 0.45, depthWrite: false, color: '#ffffff', blending: AdditiveBlending }));
    this.spray.frustumCulled = false;
    this.group.add(this.spray);

    // Moonwell: a still, mirror-like pond
    const mw = LOCATION_BY_ID.moonwell.at;
    const level = terrain.height(mw[0] + 5, mw[1]) - 0.25;
    this.pond = new Mesh(new CircleGeometry(4.6, 40), new MeshStandardMaterial({ color: '#2a4f8a', roughness: 0.02, metalness: 0.3, transparent: true, opacity: 0.88, envMapIntensity: 2 }));
    this.pond.rotation.x = -Math.PI / 2;
    this.pond.position.set(mw[0], level, mw[1]);
    this.pond.receiveShadow = true;
    this.group.add(this.pond);
  }

  private buildSurface(): BufferGeometry {
    const t = this.terrain;
    const H = t.heights;
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    const shallow = new Color('#5fe0d8');
    const mid = new Color('#2fa6d6');
    const deep = new Color('#1d5fa8');
    const foam = new Color('#f2fbff');
    const c = new Color();
    const vert = (i: number, j: number) => {
      const x = -WORLD_HALF + i * STEP;
      const z = -WORLD_HALF + j * STEP;
      const depth = WATER_LEVEL - H[j * RES + i];
      pos.push(x, WATER_LEVEL, z);
      uv.push(x / 9, z / 9);
      if (depth < 0.25) c.copy(foam).lerp(shallow, Math.max(0, depth) / 0.25);
      else if (depth < 1.4) c.copy(shallow).lerp(mid, (depth - 0.25) / 1.15);
      else c.copy(mid).lerp(deep, Math.min(1, (depth - 1.4) / 2.5));
      const a = depth < 0 ? 0.0 : Math.min(0.94, 0.5 + depth * 0.18);
      col.push(c.r, c.g, c.b, depth < 0.25 ? Math.max(a, 0.75 * Math.max(0, 1 - Math.abs(depth) * 3)) : a);
    };
    for (let j = 0; j < RES - 1; j++) {
      for (let i = 0; i < RES - 1; i++) {
        const h00 = H[j * RES + i];
        const h10 = H[j * RES + i + 1];
        const h01 = H[(j + 1) * RES + i];
        const h11 = H[(j + 1) * RES + i + 1];
        if (Math.min(h00, h10, h01, h11) > WATER_LEVEL + 0.05) continue;
        if (t.inCave(-WORLD_HALF + i * STEP, -WORLD_HALF + j * STEP)) continue;
        vert(i, j);
        vert(i, j + 1);
        vert(i + 1, j);
        vert(i + 1, j);
        vert(i, j + 1);
        vert(i + 1, j + 1);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(col), 4));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    const n = new Float32Array(pos.length);
    for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('normal', new BufferAttribute(n, 3));
    g.computeBoundingSphere();
    return g;
  }

  update(time: number, dt: number): void {
    this.normal.offset.set(time * 0.012, time * 0.02);
    this.fallA.offset.y = (time * 0.9) % 1;
    this.fallB.offset.y = (time * 1.4) % 1;
    const pos = this.spray.geometry.attributes.position as BufferAttribute;
    const b = this.sprayBase;
    for (let i = 0; i < pos.count; i++) {
      const ph = (b[i * 4 + 2] + time * 0.35 * b[i * 4 + 3]) % 1;
      pos.setXYZ(i, b[i * 4] + Math.sin(i + time) * 0.3 * ph, WATER_LEVEL + 0.2 + Math.sin(ph * Math.PI) * 2.6, b[i * 4 + 1] + ph * 2.5);
    }
    pos.needsUpdate = true;
    void dt;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
    });
    this.surfaceMat.dispose();
  }
}
