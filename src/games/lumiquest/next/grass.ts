// GPU grass: every blade is a few triangles of one shared strip, placed by
// per-blade data (root, height, width, facing, curve, a random key) and
// shaped entirely in the vertex shader: an arched, tapered blade that sways
// in travelling gusts of wind. The fragment shader colours it from a dark,
// occluded root to a sun-dried tip (patches of greener and more golden
// grass across the meadow) and lets light shine through it when you look
// toward the sun.
//
// The vale is covered in 12 m chunks streamed around the camera. Each
// chunk's blades are stored sorted by their random key, so a chunk draws only
// the leading share its distance needs; the shader thins the field smoothly
// with distance (keeping blades whose key is under the local density) and
// widens far blades into clumps, so the meadow stays full to the horizon at
// a bounded cost. Wildflowers (poppies, cornflowers, daisies, buttercups)
// ride the same system.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Sphere,
  Vector2,
  Vector3,
} from 'three';
import { Rng } from '../../shared/rng';
import { PLAY_HALF } from '../data/world';
import type { Terrain } from '../world/terrain';
import { clearings } from '../world/nature';

export interface GrassQuality {
  /** Blades per square metre close to the camera. */
  density: number;
  /** Metres to the edge of the field. */
  range: number;
  /** Full density out to this distance, then it falls off with the square of the distance. */
  near: number;
}

const CHUNK = 12;

/** One blade: a strip of `SEG` quads narrowing to a point (position.x = side, position.y = 0..1 along the blade). */
function bladeGeometry(SEG = 3): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k < SEG; k++) {
    const t = k / SEG;
    pos.push(-0.5, t, 0, 0.5, t, 0);
  }
  pos.push(0, 1, 0);
  for (let k = 0; k < SEG - 1; k++) {
    const a = k * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const top = (SEG - 1) * 2;
  idx.push(top, top + 1, SEG * 2);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

/** A wildflower: a thin stem (y 0..1) and a small cupped bloom on top (flagged by position.z = 1). */
function flowerGeometry(): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  // stem: one narrow quad pair
  pos.push(-0.5, 0, 0, 0.5, 0, 0, -0.5, 0.92, 0, 0.5, 0.92, 0);
  idx.push(0, 1, 3, 0, 3, 2);
  // bloom: a ring of 6 petals around a centre, slightly cupped
  const c = pos.length / 3;
  pos.push(0, 1, 2);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const r = 1;
    pos.push(Math.cos(a) * r, 1, 2 + Math.sin(a) * r);
  }
  for (let k = 0; k < 12; k++) idx.push(c, c + 1 + k, c + 1 + ((k + 1) % 12));
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

const NOISE = /* glsl */ `
float lqHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lqNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lqHash(i), lqHash(i + vec2(1.0, 0.0)), u.x), mix(lqHash(i + vec2(0.0, 1.0)), lqHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

export const grassUniforms = {
  uTime: { value: 0 },
  uCam: { value: new Vector3() },
  uWindDir: { value: new Vector2(0.8, 0.6).normalize() },
  uWind: { value: 1 },
  uRange: { value: 60 },
  uNear: { value: 8 },
  uSunDir: { value: new Vector3(0, 1, 0) },
  uSunColor: { value: new Color('#ffe2b0') },
  uRootCol: { value: new Color('#2e3d14') },
  uMidCol: { value: new Color('#6b7a24') },
  uTipGreen: { value: new Color('#a9b440') },
  uTipGold: { value: new Color('#dcb44c') },
};

function grassMaterial(flowers: boolean): MeshStandardMaterial {
  // rough and matte: grass should not mirror the blue sky
  const m = new MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: DoubleSide, envMapIntensity: 0.35 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, grassUniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aRoot;
        attribute vec4 aShape;
        ${flowers ? 'attribute vec3 aBloom;' : ''}
        uniform float uTime; uniform vec3 uCam; uniform vec2 uWindDir; uniform float uWind; uniform float uRange; uniform float uNear;
        uniform vec3 uRootCol; uniform vec3 uMidCol; uniform vec3 uTipGreen; uniform vec3 uTipGold;
        varying vec3 vGrassCol;
        varying float vTip;
        varying vec3 vGrassN;
        ${NOISE}`,
      )
      .replace(
        '#include <begin_vertex>',
        `
        vec3 root = aRoot.xyz;
        float dist = distance(root.xz, uCam.xz);
        // density: full near the camera, then ~ (near / d)^2, so blades on screen stay about as dense
        float dens = dist < uNear ? 1.0 : (uNear * uNear) / (dist * dist);
        float keep = 1.0 - smoothstep(dens * 0.92, dens, aRoot.w);
        float edge = 1.0 - smoothstep(uRange * 0.82, uRange, dist);
        float widen = clamp(inversesqrt(max(dens, 0.02)), 1.0, 4.5);
        float h = aShape.x * keep * edge;
        float w = aShape.y * widen;
        float yaw = aShape.z;
        float t = position.y;
        ${flowers ? 'float bloom = step(0.5, position.z);' : 'float bloom = 0.0;'}
        // wind: slow swell plus gusts rolling across the meadow
        vec2 gp = root.xz * 0.045 - uWindDir * uTime * 0.9;
        float gust = lqNoise(gp) * 0.75 + lqNoise(gp * 2.7 + 13.0) * 0.25;
        float sway = (0.25 + 0.75 * gust) * uWind + 0.12 * sin(uTime * 2.3 + root.x * 1.7 + root.z * 1.3);
        vec2 face = vec2(sin(yaw), cos(yaw));
        vec2 bendDir = normalize(face * aShape.w + uWindDir * sway * 1.4 + 1e-4);
        float bend = clamp(aShape.w * 0.45 + sway * 0.55, 0.0, 1.1);
        float bt = t * t;
        vec3 p = root;
        p.y += h * t * (1.0 - 0.32 * bend * bt);
        p.xz += bendDir * bend * h * bt * 0.75;
        vec2 perp = vec2(face.y, -face.x);
        ${flowers
          ? `if (bloom > 0.5) {
            // a small cupped bloom, turned a little toward the sky
            vec2 q = (position.xz - vec2(0.0, 2.0));
            float pr = aShape.y * 6.5 * keep * edge;
            p.xz += (perp * q.x + face * q.y) * pr;
            p.y += length(q) * pr * 0.35;
          } else {
            p.xz += perp * position.x * 0.012 * widen;
          }`
          : `p.xz += perp * position.x * w * (1.0 - t * 0.88);`}
        vec3 transformed = p;
        // normal: soft and mostly up, rounded across the blade, leaning with its face
        vec3 bn = normalize(vec3(face.x, 0.0, face.y) * 0.45 + vec3(0.0, 1.0, 0.0) + vec3(perp.x, 0.0, perp.y) * position.x * 0.9);
        vGrassN = normalize(normalMatrix * bn);
        // colour: root shade to tip; meadow patches drift between fresh green and dry gold
        float patchN = lqNoise(root.xz * 0.035 + 7.0) * 0.7 + lqNoise(root.xz * 0.11) * 0.3;
        vec3 tip = mix(uTipGreen, uTipGold, smoothstep(0.3, 0.75, patchN));
        vec3 col = mix(uRootCol, uMidCol, smoothstep(0.0, 0.45, t));
        col = mix(col, tip, smoothstep(0.35, 1.0, t));
        col *= 0.88 + 0.24 * lqHash(root.xz * 3.1);
        ${flowers ? 'if (bloom > 0.5) col = aBloom; else col = uMidCol * 0.8;' : ''}
        vGrassCol = col;
        vTip = ${flowers ? 'bloom > 0.5 ? 1.0 : t' : 't'};
        `,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir; uniform vec3 uSunColor;
        varying vec3 vGrassCol; varying float vTip; varying vec3 vGrassN;`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vGrassCol;\n diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 0.35, vTip));')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vGrassN);')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // light through the blades when looking toward the sun
          vec3 lqL = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          vec3 lqV = normalize(vViewPosition);
          float lqT = pow(max(dot(-lqV, lqL), 0.0), 3.0);
          totalEmissiveRadiance += vGrassCol * uSunColor * lqT * (0.25 + 0.75 * vTip) * 0.9;
        }`,
      );
  };
  m.customProgramCacheKey = () => (flowers ? 'gpu-flowers' : 'gpu-grass');
  return m;
}

const PETALS = ['#d8341e', '#2f55c8', '#f4efe2', '#f0c02a', '#d8341e', '#2f55c8'].map((c) => new Color(c));

interface Chunk {
  key: string;
  cx: number;
  cz: number;
  grass: Mesh | null;
  flowers: Mesh | null;
  n: number;
  nf: number;
}

export class GpuGrass {
  readonly group = new Group();
  private chunks = new Map<string, Chunk>();
  private blade = bladeGeometry();
  private bloom = flowerGeometry();
  private grassMat = grassMaterial(false);
  private flowerMat = grassMaterial(true);
  private q: GrassQuality;

  constructor(private terrain: Terrain, q: GrassQuality) {
    this.q = q;
  }

  setQuality(q: GrassQuality): void {
    if (q.density === this.q.density && q.range === this.q.range && q.near === this.q.near) return;
    this.q = q;
    for (const c of this.chunks.values()) this.drop(c);
    this.chunks.clear();
  }

  private density(d: number): number {
    const n = this.q.near;
    return d < n ? 1 : (n * n) / (d * d);
  }

  update(cam: Vector3, time: number): void {
    const u = grassUniforms;
    u.uTime.value = time;
    u.uCam.value.copy(cam);
    u.uRange.value = this.q.range;
    u.uNear.value = this.q.near;
    const R = this.q.range;
    const ci = Math.floor(cam.x / CHUNK);
    const cj = Math.floor(cam.z / CHUNK);
    const n = Math.ceil(R / CHUNK) + 1;
    const want = new Set<string>();
    let built = 0;
    const order: [number, number, number][] = [];
    for (let j = cj - n; j <= cj + n; j++)
      for (let i = ci - n; i <= ci + n; i++) {
        const x0 = i * CHUNK;
        const z0 = j * CHUNK;
        const nx = Math.max(x0, Math.min(cam.x, x0 + CHUNK));
        const nz = Math.max(z0, Math.min(cam.z, z0 + CHUNK));
        const d = Math.hypot(nx - cam.x, nz - cam.z);
        if (d > R) continue;
        const key = `${i},${j}`;
        want.add(key);
        order.push([d, i, j]);
      }
    order.sort((a, b) => a[0] - b[0]);
    for (const [d, i, j] of order) {
      const key = `${i},${j}`;
      let c = this.chunks.get(key);
      if (!c) {
        if (built >= 2) continue;
        c = this.build(i, j, key);
        this.chunks.set(key, c);
        built++;
      }
      // draw only the leading share of blades this chunk's nearest point needs
      const share = Math.min(1, this.density(d) * 1.06 + 0.002);
      if (c.grass) (c.grass.geometry as InstancedBufferGeometry).instanceCount = Math.ceil(c.n * share);
      if (c.flowers) (c.flowers.geometry as InstancedBufferGeometry).instanceCount = Math.ceil(c.nf * Math.min(1, share * 1.5));
    }
    for (const [key, c] of this.chunks) {
      if (want.has(key)) continue;
      const d = Math.hypot(c.cx - cam.x, c.cz - cam.z) - CHUNK * 0.71;
      if (d > R + 12) {
        this.drop(c);
        this.chunks.delete(key);
      }
    }
  }

  private build(i: number, j: number, key: string): Chunk {
    const t = this.terrain;
    const rng = new Rng(i * 92821 + j * 68917 + 7);
    const x0 = i * CHUNK;
    const z0 = j * CHUNK;
    const target = Math.round(CHUNK * CHUNK * this.q.density);
    const blades: number[][] = [];
    const flowers: number[][] = [];
    const lim = PLAY_HALF + 30;
    for (let k = 0; k < target; k++) {
      const x = x0 + rng.next() * CHUNK;
      const z = z0 + rng.next() * CHUNK;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      if (t.surfaceAt(x, z) !== 'grass') continue;
      const y = t.height(x, z);
      if (y > 30) continue;
      let blocked = false;
      for (const c of clearings) if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r * 0.7) blocked = true;
      if (blocked) continue;
      const key2 = rng.next();
      // taller in the open meadow, shorter on slopes (normal from the heightfield)
      const slope = Math.abs(t.height(x + 0.8, z) - t.height(x - 0.8, z)) + Math.abs(t.height(x, z + 0.8) - t.height(x, z - 0.8));
      const tall = Math.max(0.35, 1 - slope * 0.45);
      const h = (0.42 + rng.next() * 0.5) * tall;
      blades.push([x, y - 0.02, z, key2, h, 0.018 + rng.next() * 0.016, rng.next() * Math.PI * 2, 0.2 + rng.next() * 0.7]);
      // wildflowers gather in drifts across the meadow
      const drift = Math.max(0, Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.cos(z * 0.09 - x * 0.03));
      if (rng.next() < 0.004 + drift * drift * 0.05) {
        const pc = PETALS[Math.floor(rng.next() * PETALS.length)];
        flowers.push([x + 0.03, y - 0.02, z, rng.next(), h * 1.1 + 0.12, 0.0032 + rng.next() * 0.0016, rng.next() * Math.PI * 2, 0.15, pc.r, pc.g, pc.b]);
      }
    }
    const c: Chunk = { key, cx: x0 + CHUNK / 2, cz: z0 + CHUNK / 2, grass: null, flowers: null, n: 0, nf: 0 };
    if (blades.length) {
      blades.sort((a, b) => a[3] - b[3]);
      c.grass = this.mesh(this.blade, this.grassMat, blades, false, x0, z0);
      c.n = blades.length;
    }
    if (flowers.length) {
      flowers.sort((a, b) => a[3] - b[3]);
      c.flowers = this.mesh(this.bloom, this.flowerMat, flowers, true, x0, z0);
      c.nf = flowers.length;
    }
    return c;
  }

  private mesh(base: BufferGeometry, mat: MeshStandardMaterial, list: number[][], bloom: boolean, x0: number, z0: number): Mesh {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', base.attributes.position);
    g.setIndex(base.index);
    const root = new Float32Array(list.length * 4);
    const shape = new Float32Array(list.length * 4);
    const col = bloom ? new Float32Array(list.length * 3) : null;
    let ymin = Infinity;
    let ymax = -Infinity;
    list.forEach((b, k) => {
      root.set([b[0], b[1], b[2], b[3]], k * 4);
      shape.set([b[4], b[5], b[6], b[7]], k * 4);
      if (col) col.set([b[8], b[9], b[10]], k * 3);
      ymin = Math.min(ymin, b[1]);
      ymax = Math.max(ymax, b[1] + b[4]);
    });
    g.setAttribute('aRoot', new InstancedBufferAttribute(root, 4));
    g.setAttribute('aShape', new InstancedBufferAttribute(shape, 4));
    if (col) g.setAttribute('aBloom', new InstancedBufferAttribute(col, 3));
    g.instanceCount = list.length;
    g.boundingSphere = new Sphere(new Vector3(x0 + CHUNK / 2, (ymin + ymax) / 2, z0 + CHUNK / 2), Math.hypot(CHUNK * 0.71 + 2, (ymax - ymin) / 2 + 1));
    const m = new Mesh(g, mat);
    m.receiveShadow = true;
    m.castShadow = false;
    m.matrixAutoUpdate = false;
    this.group.add(m);
    return m;
  }

  private drop(c: Chunk): void {
    for (const m of [c.grass, c.flowers]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
  }

  dispose(): void {
    for (const c of this.chunks.values()) this.drop(c);
    this.chunks.clear();
    this.grassMat.dispose();
    this.flowerMat.dispose();
  }
}
