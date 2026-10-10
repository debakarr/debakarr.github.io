// The title vista: a young founder in a blue cape and their fox companion
// stand on a rise at dawn, looking over a valley with a lake, a waterfall,
// forests and a castle town on the far hill, built from the same KayKit
// (CC0) models and faceted trees as the map, at a larger scale.

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { Noise2D } from '../../shared/noise';
import { Rng } from '../../shared/rng';
import { capsule, cone, ellipsoid, merge, part, sphere, xf } from './geo';
import { kitGeo, kitPart } from './kit';
import { liveFigure, teamMaterial, type LiveFigure } from './live';
import { B, K } from './models/voxel';
import { FACTIONS, scout, withOutfit } from '../../shared/chibi/catalog';

import { N } from './models/voxel';
import type { StageScene } from './stage';

const HERO = '#3f6fd8';

function foxGeo(): BufferGeometry {
  const o = '#f28a3a';
  const w = '#fff4e6';
  const d = '#3a2418';
  return merge([
    part(ellipsoid(0.11, 0.1, 0.16, 16, 12), o, { p: [0, 0.12, 0], r: [-0.5, 0, 0] }),
    part(ellipsoid(0.07, 0.07, 0.06, 12, 10), w, { p: [0, 0.14, 0.07] }),
    part(sphere(0.1, 18, 14), o, { p: [0, 0.27, 0.05] }),
    part(ellipsoid(0.045, 0.035, 0.06, 10, 8), w, { p: [0, 0.245, 0.13] }),
    part(sphere(0.014, 8, 6), d, { p: [0, 0.255, 0.19] }),
    part(ellipsoid(0.016, 0.02, 0.01, 8, 6), d, { p: [-0.04, 0.29, 0.135] }),
    part(ellipsoid(0.016, 0.02, 0.01, 8, 6), d, { p: [0.04, 0.29, 0.135] }),
    part(sphere(0.005, 5, 4), '#ffffff', { p: [-0.035, 0.297, 0.143] }),
    part(sphere(0.005, 5, 4), '#ffffff', { p: [0.045, 0.297, 0.143] }),
    part(cone(0.045, 0.1, 8), o, { p: [-0.06, 0.37, 0.03], r: [0, 0, 0.3] }),
    part(cone(0.045, 0.1, 8), o, { p: [0.06, 0.37, 0.03], r: [0, 0, -0.3] }),
    part(cone(0.025, 0.06, 8), d, { p: [-0.064, 0.4, 0.035], r: [0, 0, 0.3] }),
    part(cone(0.025, 0.06, 8), d, { p: [0.064, 0.4, 0.035], r: [0, 0, -0.3] }),
    part(capsule(0.025, 0.06, 4, 8), o, { p: [-0.05, 0.04, 0.08] }),
    part(capsule(0.025, 0.06, 4, 8), o, { p: [0.05, 0.04, 0.08] }),
    part(ellipsoid(0.03, 0.02, 0.035, 8, 6), w, { p: [-0.05, 0.01, 0.1] }),
    part(ellipsoid(0.03, 0.02, 0.035, 8, 6), w, { p: [0.05, 0.01, 0.1] }),
  ]);
}

function foxTail(): BufferGeometry {
  return merge([
    part(xf(ellipsoid(0.06, 0.16, 0.06, 12, 10), { r: [0.9, 0, 0] }), '#f28a3a', { p: [0, 0.1, -0.14] }),
    part(xf(ellipsoid(0.04, 0.06, 0.04, 10, 8), { r: [0.9, 0, 0] }), '#fff4e6', { p: [0, 0.2, -0.26] }),
  ]);
}

export class TitleScene implements StageScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(36, 1, 0.1, 400);
  readonly bloom = 0.45;
  private t = 0;
  private noise = new Noise2D(new Rng(2024));
  private hero: Object3D;
  private heroFig: LiveFigure;
  private tail: Mesh;
  private foxRoot: Object3D;
  private birds: Object3D[] = [];
  private fan: Mesh | null = null;
  private water: ShaderMaterial;
  private aspect = 1;
  private fallTex: CanvasTexture | null = null;

  constructor(shadows: boolean) {
    const sky = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: { uSun: { value: new Vector3(0.45, 0.22, -1).normalize() } },
      vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uSun; varying vec3 vP;
        void main() {
          float h = clamp(vP.y, -0.1, 1.0);
          vec3 top = vec3(0.32, 0.56, 0.9);
          vec3 mid = vec3(0.62, 0.78, 0.98);
          vec3 hor = vec3(1.0, 0.86, 0.66);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, h));
          c = mix(c, top, smoothstep(0.25, 0.9, h));
          float s = max(dot(normalize(vP), uSun), 0.0);
          c += vec3(1.0, 0.85, 0.55) * (pow(s, 32.0) * 0.9 + pow(s, 6.0) * 0.25);
          float n = sin(vP.x * 7.0 + sin(vP.z * 5.0) * 2.0) * sin(vP.z * 4.0 + vP.y * 10.0);
          c = mix(c, vec3(1.0, 0.97, 0.94), smoothstep(0.6, 0.95, n) * smoothstep(0.08, 0.4, h) * 0.55);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.scene.add(new Mesh(new SphereGeometry(200, 32, 20), sky));
    this.scene.fog = new Fog('#f3dcc0', 40, 140);
    this.scene.add(new HemisphereLight('#dcecff', '#7a7a4a', 1.0));
    const sun = new DirectionalLight('#ffe6c0', 2.6);
    sun.position.set(30, 22, -50);
    sun.castShadow = shadows;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -20;
    sc.right = 20;
    sc.top = 20;
    sc.bottom = -20;
    sc.near = 1;
    sc.far = 140;
    sun.shadow.bias = -0.0006;
    sun.target.position.set(0, 0, -8);
    this.scene.add(sun, sun.target);
    const rim = new DirectionalLight('#9ac8ff', 0.6);
    rim.position.set(-10, 6, 12);
    this.scene.add(rim);

    this.buildLand();
    this.water = this.buildWater();
    this.buildTown();
    this.buildNature();
    // the hero: a young founder in a blue cape
    const heroMat = teamMaterial(HERO, '#ffffff');
    const founder = withOutfit(scout(FACTIONS.blue), [{ k: 'cape', color: '#2f58b8', length: 0.36, inner: '#22407e', emblem: 'fleur', emblemColor: '#e2b04a' }], 'founder');
    this.heroFig = liveFigure({ char: 'knight', show: [], chibi: founder }, heroMat);
    this.hero = new Object3D();
    this.hero.add(this.heroFig.root);
    this.hero.scale.setScalar(1.25);
    this.hero.position.set(2.4, this.heightAt(2.4, 8.2), 8.2);
    this.hero.rotation.y = 3.03;
    this.scene.add(this.hero);
    // the fox
    this.foxRoot = new Object3D();
    const vc = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    const fox = new Mesh(foxGeo(), vc);
    fox.castShadow = true;
    this.tail = new Mesh(foxTail(), vc);
    this.tail.castShadow = true;
    this.foxRoot.add(fox, this.tail);
    this.foxRoot.scale.setScalar(2.9);
    this.foxRoot.position.set(3.95, this.heightAt(3.95, 8.7), 8.7);
    this.foxRoot.rotation.y = 2.5;
    this.scene.add(this.foxRoot);
    // birds
    for (let k = 0; k < 6; k++) {
      const bird = new Mesh(merge([part(xf(cone(0.08, 0.5, 3), { r: [0, 0, Math.PI / 2], s: [1, 1, 0.2] }), '#3a3a44', { p: [0.22, 0, 0] }), part(xf(cone(0.08, 0.5, 3), { r: [0, 0, -Math.PI / 2], s: [1, 1, 0.2] }), '#3a3a44', { p: [-0.22, 0, 0] })]), vc);
      bird.position.set(-6 + k * 1.3, 9 + Math.sin(k) * 0.8, -18 - k * 0.6);
      this.birds.push(bird);
      this.scene.add(bird);
    }
  }

  private heightAt(x: number, z: number): number {
    // a rise in the foreground, a valley with a lake, the town's hill beyond
    const n = this.noise.fbm(x * 0.05, z * 0.05, 4) * 2.2;
    const fore = 2.4 * Math.exp(-((z - 8.5) ** 2) / 26) * Math.exp(-((x - 2.5) ** 2) / 70);
    const valley = -2.2 * Math.exp(-((z + 10) ** 2) / 60) * Math.exp(-(x * x) / 300);
    const hill = 6 * Math.exp(-((x - 7) ** 2 + (z + 34) ** 2) / 90);
    const far = Math.max(0, -z - 40) * 0.25;
    return n + fore + valley + hill + far;
  }

  private buildLand(): void {
    const geo = new PlaneGeometry(260, 200, 180, 140);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -40);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new Color();
    const g1 = new Color('#7cc843');
    const g2 = new Color('#a9d94e');
    const rock = new Color('#9a8a78');
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      const y = this.heightAt(x, z);
      pos.setY(k, y);
      const n = this.noise.fbm(x * 0.2, z * 0.2, 3);
      c.copy(g1).lerp(g2, 0.5 + n);
      if (y > 9) c.lerp(rock, Math.min(1, (y - 9) / 6));
      col.set([c.r, c.g, c.b], k * 3);
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    m.receiveShadow = true;
    this.scene.add(m);
  }

  private buildWater(): ShaderMaterial {
    const mat = new ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; varying vec3 vW;
        void main() {
          vec2 p = vW.xz;
          float w = sin(p.x * 0.9 + uTime * 0.8) * sin(p.y * 1.3 - uTime * 0.6) + sin(p.x * 2.1 - p.y * 1.7 + uTime * 1.3) * 0.4;
          vec3 deep = vec3(0.12, 0.45, 0.8);
          vec3 light = vec3(0.45, 0.8, 0.95);
          vec3 c = mix(deep, light, 0.45 + 0.25 * w);
          c += vec3(1.0, 0.9, 0.7) * smoothstep(1.0, 1.35, w) * 0.5;
          gl_FragColor = vec4(c, 0.95);
          #include <colorspace_fragment>
        }`,
    });
    const g = new PlaneGeometry(60, 26);
    g.rotateX(-Math.PI / 2);
    const m = new Mesh(g, mat);
    m.position.set(0, -1.2, -12);
    this.scene.add(m);
    // a waterfall off the town's hill
    const fallTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 256;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(200,236,255,0)');
      g.addColorStop(0.2, 'rgba(220,244,255,0.9)');
      g.addColorStop(0.8, 'rgba(220,244,255,0.9)');
      g.addColorStop(1, 'rgba(200,236,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 256);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      for (let k = 0; k < 14; k++) {
        ctx.lineWidth = 1 + Math.random() * 2;
        const x = 8 + Math.random() * 48;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + Math.random() * 4 - 2, 256);
        ctx.stroke();
      }
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      t.wrapT = RepeatWrapping;
      return t;
    })();
    this.fallTex = fallTex;
    const fall = new Mesh(new PlaneGeometry(1.4, 6.5), new MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false }));
    fall.position.set(-3, 2.0, -24);
    this.scene.add(fall);
    const mist = new Mesh(new SphereGeometry(1.4, 12, 10), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }));
    mist.position.set(-3, -1.0, -23.2);
    mist.scale.set(1.8, 0.6, 1);
    this.scene.add(mist);
    return mat;
  }

  private buildTown(): void {
    const rng = new Rng(42);
    const parts: BufferGeometry[] = [];
    const hx = 7;
    const hz = -34;
    const S = 2.3;
    const blue = new Color(HERO);
    const put = (name: string, x: number, z: number, rot: number, s = S, paint: Color = blue) => {
      const g = kitGeo(name).clone();
      const tm = g.attributes.team;
      const col = g.attributes.color;
      for (let i = 0; i < tm.count; i++) {
        const v = tm.getX(i);
        if (v > 0 && v <= 1.5) col.setXYZ(i, col.getX(i) * (1 - v + paint.r * v), col.getY(i) * (1 - v + paint.g * v), col.getZ(i) * (1 - v + paint.b * v));
      }
      parts.push(B.place(g, x, this.heightAt(x, z) - 0.15, z, rot, s));
    };
    put('building_castle', hx, hz, 0.3, S * 1.25);
    // a ring of walls with towers
    const R = 6.2;
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2;
      const a1 = ((k + 1) / 8) * Math.PI * 2;
      const x0 = hx + Math.cos(a0) * R, z0 = hz + Math.sin(a0) * R * 0.75;
      const x1 = hx + Math.cos(a1) * R, z1 = hz + Math.sin(a1) * R * 0.75;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const g = kitGeo(k === 2 ? 'wall_straight_gate' : 'wall_straight').clone();
      g.scale(len / 2, 1, 1);
      parts.push(B.place(g, (x0 + x1) / 2, this.heightAt((x0 + x1) / 2, (z0 + z1) / 2) - 0.2, (z0 + z1) / 2, -Math.atan2(z1 - z0, x1 - x0), S * 0.8));
      put(k % 2 ? 'building_tower_A' : 'building_tower_B', x0, z0, rng.next() * 6, S * 0.85);
    }
    const homes = ['building_home_A', 'building_home_B', 'building_home_A', 'building_tavern', 'building_market', 'building_blacksmith'];
    const roofs = ['#c8553d', '#b5653a', '#7a8fa6'].map((c) => new Color(c));
    for (let k = 0; k < 30; k++) {
      const a = rng.next() * Math.PI * 2;
      const r = k < 14 ? rng.float(2.8, 5.2) : rng.float(7, 11);
      const x = hx + Math.cos(a) * r;
      const z = hz + Math.sin(a) * r * 0.72;
      put(rng.pick(homes), x, z, Math.atan2(hx - x, hz - z) + rng.float(-0.4, 0.4), S * rng.float(0.85, 1.0), rng.chance(0.65) ? blue : rng.pick(roofs));
    }
    put('building_church', hx - 4.5, hz + 3.2, 0.6, S);
    put('building_windmill', hx + 11, hz + 4, -0.4, S);
    const fan = kitPart('building_windmill', 'windmill_top_fan');
    if (fan) {
      const m = new Mesh(fan.geo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
      const x = hx + 11;
      const z = hz + 4;
      const v = new Vector3(...fan.pivot).multiplyScalar(S).applyAxisAngle(new Vector3(0, 1, 0), -0.4);
      m.position.set(x + v.x, this.heightAt(x, z) - 0.15 + v.y, z + v.z);
      m.rotation.order = 'YXZ';
      m.rotation.y = -0.4;
      m.scale.setScalar(S);
      this.fan = m;
      this.scene.add(m);
    }
    for (let k = 0; k < 4; k++) put(rng.pick(['barrel', 'crate_A_big', 'sack', 'wheelbarrow']), hx + rng.float(-3, 3), hz + 5 + rng.float(0, 2), rng.next() * 6, S * 0.9);
    const m = new Mesh(merge(parts), new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
  }

  private buildNature(): void {
    const rng = new Rng(7);
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const put = (g: BufferGeometry, x: number, z: number, s: number, shadow = true) => {
      const m = new Mesh(g, mat);
      m.position.set(x, this.heightAt(x, z) - 0.05, z);
      m.scale.setScalar(s);
      m.rotation.y = rng.next() * 6.28;
      m.castShadow = shadow;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    // mountains on the horizon
    for (let k = 0; k < 9; k++) put(K.peak(500 + k, 'temperate', 0.5), -70 + k * 18 + rng.float(-5, 5), -95 + rng.float(-10, 6), rng.float(34, 52), false);
    // forests on the valley sides
    for (let k = 0; k < 140; k++) {
      const x = rng.float(-50, 50);
      const z = rng.float(-60, 2);
      if (Math.abs(x) < 14 && z > -22 && z < -2) continue;
      if (Math.hypot(x - 7, (z + 34) / 0.7) < 10) continue;
      const geo = rng.chance(0.55) ? K.broadleaf(rng.int(50), rng.pick(['green', 'fresh', 'deep'] as const)) : K.conifer(rng.chance(0.5) ? 'A' : 'B', 'temperate');
      put(geo, x, z, rng.float(12, 18), z > -30);
    }
    // the foreground: flowers, rocks and a few trees close by
    put(K.broadleaf(3, 'green'), -8.5, 5, 19);
    put(K.conifer('B', 'temperate'), 10.5, 4.5, 17);
    put(K.broadleaf(9, 'blossom'), 12, 7, 15);
    put(K.forestClump('B', 'large', 'temperate'), -18, -6, 14);
    put(K.forestClump('A', 'medium', 'temperate'), 22, -10, 14);
    put(K.rockKit('E', 'temperate'), -2.6, 10.6, 4.2);
    put(K.rockKit('C', 'temperate'), 6.4, 10.2, 6);
    put(K.shrub(4, 'fresh', true), -3.5, 9, 9);
    put(K.shrub(6, 'green'), 9, 8.6, 9);
    const fl = N.flowers(3);
    const tuft = N.tuft(4);
    for (let k = 0; k < 220; k++) {
      const x = rng.float(-10, 14);
      const z = rng.float(4, 13);
      const m = new Mesh(k % 3 === 0 ? fl : tuft, new MeshStandardMaterial({ color: k % 3 === 0 ? rng.pick(['#ff8fb8', '#ffd84a', '#ffffff', '#c59bff', '#ff7a6a']) : rng.pick(['#7dc443', '#9fd84c']), roughness: 0.8 }));
      m.position.set(x, this.heightAt(x, z) - 0.02, z);
      m.scale.setScalar(rng.float(3.2, 5));
      m.rotation.y = rng.next() * 6.28;
      this.scene.add(m);
    }
  }

  resize(w: number, h: number): void {
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.fov = this.aspect < 1 ? 58 : 36;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    const narrow = this.aspect < 1;
    // a slow drift over the hero's shoulder toward the town
    const cx = (narrow ? -0.6 : -2.0) + Math.sin(t * 0.05) * 0.5;
    this.camera.position.set(cx, (narrow ? 4.8 : 5.0) + Math.sin(t * 0.07) * 0.12, narrow ? 17 : 18);
    this.camera.lookAt(narrow ? 5.6 : 5.2, narrow ? 2.6 : 2.0, -22);
    this.water.uniforms.uTime.value = t;
    if (this.fallTex) this.fallTex.offset.y = -t * 0.6;
    this.heroFig.mixer.update(dt);
    const head = this.heroFig.bones.get('head');
    if (head) head.rotation.y = Math.sin(t * 0.4) * 0.3 + 0.1;
    if (this.fan) this.fan.rotation.z += dt * 0.6;
    this.tail.rotation.y = Math.sin(t * 3) * 0.35;
    this.foxRoot.rotation.z = Math.sin(t * 1.5) * 0.02;
    for (const [i, b] of this.birds.entries()) {
      b.position.x += dt * 0.9;
      if (b.position.x > 30) b.position.x = -30;
      b.position.y = 9 + Math.sin(t * 0.8 + i) * 0.6;
      b.scale.y = 1 + Math.sin(t * 8 + i) * 0.6;
    }
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof Mesh) {
        if (!o.userData.keep) o.geometry.dispose();
        (o.material as MeshStandardMaterial).dispose();
      }
    });
  }
}
