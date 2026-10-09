// The title vista: a young founder in a blue cape and their fox companion
// stand on a rise at dawn, looking over a valley with a lake, a waterfall,
// forests and a castle town on the far hill. Everything is built from the
// same procedural pieces as the map, at a larger scale.

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
import * as B from './models/buildings';
import { LOOKS, soldierRig } from './models/figures';
import * as N from './models/nature';
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
  private heroParts: { head: Object3D; armL: Object3D; armR: Object3D } | null = null;
  private tail: Mesh;
  private foxRoot: Object3D;
  private birds: Object3D[] = [];
  private water: ShaderMaterial;
  private aspect = 1;
  private cape: Mesh;
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
    // the hero
    const rig = soldierRig({ ...LOOKS.explorer, helmet: 'none', torso: 'team', cape: false, backpack: false, weapon: 'staff', hair: '#4a2e1c' }, 7);
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    mat.customProgramCacheKey = () => 'yz-title-hero';
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute float team;\n${shader.vertexShader}`.replace('#include <color_vertex>', `
        vColor = vec4(1.0);
        vColor.xyz *= color.xyz;
        if (team > 1.5) vColor.xyz *= vec3(0.98, 0.84, 0.72);
        else vColor.xyz = mix(vColor.xyz, vColor.xyz * vec3(0.32, 0.5, 0.9), clamp(team, 0.0, 1.0));`);
    };
    this.hero = new Object3D();
    const body = new Mesh(rig.body, mat);
    body.castShadow = true;
    this.hero.add(body);
    const mk = (g: BufferGeometry, p: [number, number, number]) => {
      const o = new Object3D();
      o.position.set(...p);
      const m = new Mesh(g, mat);
      m.castShadow = true;
      o.add(m);
      this.hero.add(o);
      return o;
    };
    const pv = rig.pivots;
    this.heroParts = { head: mk(rig.head, pv.head), armL: mk(rig.armL, pv.armL), armR: mk(rig.armR, pv.armR) };
    mk(rig.legL, pv.legL);
    mk(rig.legR, pv.legR);
    // a flowing blue cape
    const capeGeo = new PlaneGeometry(0.08, 0.11, 6, 8);
    capeGeo.translate(0, -0.055, 0);
    {
      // narrower at the shoulders, flaring toward the hem
      const p = capeGeo.attributes.position;
      for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) * (0.55 + 0.45 * Math.min(1, -p.getY(k) / 0.11)));
    }
    this.cape = new Mesh(capeGeo, new MeshStandardMaterial({ color: '#2f5cc4', side: 2, roughness: 0.55 }));
    this.cape.position.set(0, 0.104, -0.032);
    this.cape.castShadow = true;
    this.hero.add(this.cape);
    this.hero.scale.setScalar(10);
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
    const base = this.heightAt(hx, hz);
    const S = 13;
    parts.push(B.place(B.keep(rng, HERO), hx, base - 0.2, hz, 0.4, S));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const x = hx + Math.cos(a) * 5.2;
      const z = hz + Math.sin(a) * 4;
      parts.push(B.place(B.wallTower(HERO), x, this.heightAt(x, z) - 0.3, z, 0, S * 0.9));
    }
    for (let k = 0; k < 26; k++) {
      const a = rng.next() * Math.PI * 2;
      const r = rng.float(3.5, 9);
      const x = hx + Math.cos(a) * r;
      const z = hz + Math.sin(a) * r * 0.7;
      parts.push(B.place(B.house(rng, rng.chance(0.65) ? HERO : rng.pick(B.STYLE.roofs), { floors: rng.chance(0.3) ? 2 : 1 }), x, this.heightAt(x, z) - 0.2, z, rng.next() * 6, S * 0.85));
    }
    parts.push(B.place(B.chapel(HERO, rng), hx - 4, this.heightAt(hx - 4, hz + 3) - 0.2, hz + 3, 0.6, S * 0.9));
    parts.push(B.place(B.windmillBody(), hx + 9, this.heightAt(hx + 9, hz + 4) - 0.2, hz + 4, -0.4, S * 0.9));
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
    for (let k = 0; k < 9; k++) put(N.mountain(500 + k, true, 1), -70 + k * 18 + rng.float(-5, 5), -95 + rng.float(-10, 6), rng.float(22, 36), false);
    // forests on the valley sides
    for (let k = 0; k < 140; k++) {
      const x = rng.float(-50, 50);
      const z = rng.float(-60, 2);
      if (Math.abs(x) < 14 && z > -22 && z < -2) continue;
      if (Math.hypot(x - 7, (z + 34) / 0.7) < 10) continue;
      const geo = rng.chance(0.5) ? N.roundTree(rng.int(50)) : N.pineTree(rng.int(50));
      put(geo, x, z, rng.float(9, 15), z > -30);
    }
    // the foreground: flowers, rocks and a few trees close by
    put(N.roundTree(3), -8.5, 5, 16);
    put(N.pineTree(5), 10.5, 4.5, 15);
    put(N.roundTree(9, ['#4f9a2a', '#c4dc52']), 12, 7, 13);
    put(N.rock(11), -0.6, 9.8, 6);
    put(N.rock(12), 6.4, 10.2, 5);
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
    const cx = (narrow ? 2.0 : -2.0) + Math.sin(t * 0.05) * 0.5;
    this.camera.position.set(cx, (narrow ? 4.8 : 5.0) + Math.sin(t * 0.07) * 0.12, narrow ? 17 : 18);
    this.camera.lookAt(narrow ? 4.2 : 5.2, narrow ? 2.0 : 2.0, -22);
    this.water.uniforms.uTime.value = t;
    if (this.fallTex) this.fallTex.offset.y = -t * 0.6;
    if (this.heroParts) {
      this.heroParts.head.rotation.y = Math.sin(t * 0.4) * 0.25 + 0.15;
      this.heroParts.head.rotation.x = 0.05 + Math.sin(t * 0.6) * 0.03;
      this.heroParts.armR.rotation.x = -0.3 + Math.sin(t * 1.2) * 0.03;
      this.heroParts.armL.rotation.x = -0.2;
      this.heroParts.armL.rotation.z = -0.2;
    }
    const pos = this.cape.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      const x = pos.getX(k);
      pos.setZ(k, -Math.max(0, -y) * 0.6 + Math.sin(t * 3 + y * 60 + x * 40) * 0.006 * -y * 10);
    }
    pos.needsUpdate = true;
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
        o.geometry.dispose();
        (o.material as MeshStandardMaterial).dispose();
      }
    });
  }
}
