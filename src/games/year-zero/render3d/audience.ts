// The royal audience: another people's leader receives our envoy in their
// hall — a throne on a dais, pillars, tall windows with shafts of light,
// banners in their colours and candles that glow. A modern people receive
// us in a chamber of glass instead. The leader breathes, blinks, glances
// and gestures, and their face shows how they feel about us.

import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { Rng } from '../../shared/rng';
import { box, cone, cylinder, merge, part, sphere, torus, xf } from './geo';
import { buildLeader, type Expression, type LeaderLook, type LeaderRig } from './models/leader';
import type { StageScene } from './stage';

export interface AudienceInfo {
  leader: LeaderLook;
  /** our own leader, seen from behind */
  envoy: LeaderLook;
  civColor: string;
  emblem: number;
}

function floorTexture(modern: boolean): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const n = 4;
  const s = 512 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = modern ? ((x + y) % 2 ? '#d8dde4' : '#c4cbd4') : (x + y) % 2 ? '#e2d6c0' : '#b9a586';
      ctx.fillRect(x * s, y * s, s, s);
      // marble veins
      ctx.strokeStyle = modern ? 'rgba(255,255,255,0.35)' : 'rgba(255,240,210,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x * s + Math.random() * s, y * s);
      ctx.bezierCurveTo(x * s + Math.random() * s, y * s + s * 0.3, x * s + Math.random() * s, y * s + s * 0.7, x * s + Math.random() * s, y * s + s);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(60,40,20,0.35)';
  ctx.lineWidth = 3;
  for (let k = 0; k <= n; k++) {
    ctx.beginPath();
    ctx.moveTo(k * s, 0);
    ctx.lineTo(k * s, 512);
    ctx.moveTo(0, k * s);
    ctx.lineTo(512, k * s);
    ctx.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(5, 5);
  t.anisotropy = 8;
  return t;
}

function bannerTexture(color: string, emblem: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 320;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  const base = new Color(color);
  g.addColorStop(0, `#${base.clone().offsetHSL(0, 0, -0.12).getHexString()}`);
  g.addColorStop(0.5, `#${base.getHexString()}`);
  g.addColorStop(1, `#${base.clone().offsetHSL(0, 0, -0.12).getHexString()}`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(128, 0);
  ctx.lineTo(128, 280);
  ctx.lineTo(64, 320);
  ctx.lineTo(0, 280);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#f2c14e';
  ctx.lineWidth = 6;
  ctx.stroke();
  // an emblem: a star, sun, tree or tower depending on the people
  ctx.fillStyle = '#f6e7b0';
  ctx.strokeStyle = '#f6e7b0';
  const cx = 64;
  const cy = 130;
  ctx.beginPath();
  switch (emblem % 4) {
    case 0:
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 16 : 38;
        const a = (k * Math.PI) / 5 - Math.PI / 2;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.fill();
      break;
    case 1:
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.moveTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28);
        ctx.lineTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42);
      }
      ctx.stroke();
      break;
    case 2:
      ctx.moveTo(cx, cy - 44);
      ctx.lineTo(cx + 34, cy + 10);
      ctx.lineTo(cx - 34, cy + 10);
      ctx.fill();
      ctx.fillRect(cx - 6, cy + 10, 12, 30);
      break;
    default:
      ctx.fillRect(cx - 26, cy - 20, 52, 54);
      for (let k = 0; k < 3; k++) ctx.fillRect(cx - 26 + k * 20, cy - 34, 12, 14);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class AudienceScene implements StageScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.1, 200);
  readonly bloom = 0.5;
  private leader: LeaderRig;
  private envoy: LeaderRig;
  private flames: Mesh[] = [];
  private lights: PointLight[] = [];
  private t = 0;
  private nextBlink = 2;
  private gesture = { kind: 'none' as 'none' | 'open' | 'welcome' | 'refuse' | 'point', start: -10 };
  private aspect = 1;
  private disposables: { dispose(): void }[] = [];
  readonly modern: boolean;

  constructor(info: AudienceInfo, shadows: boolean) {
    this.modern = info.leader.tier >= 7;
    const modern = this.modern;
    this.scene.background = new Color(modern ? '#bcd6ee' : '#3a2c26');
    this.scene.fog = new Fog(modern ? '#bcd6ee' : '#3a2c26', 18, 40);
    this.scene.add(new HemisphereLight(modern ? '#e8f2ff' : '#eef0ff', modern ? '#8a96a8' : '#6b5440', modern ? 1.1 : 1.0));
    const sun = new DirectionalLight(modern ? '#ffffff' : '#fff1dc', modern ? 2.2 : 2.3);
    sun.position.set(-5, 8, 6);
    sun.castShadow = shadows;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -6;
    sc.right = 6;
    sc.top = 6;
    sc.bottom = -3;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.buildHall(info, modern);
    this.leader = buildLeader(info.leader);
    this.leader.root.position.set(0, 0.36, -0.2);
    this.scene.add(this.leader.root);
    this.envoy = buildLeader(info.envoy);
    this.envoy.root.position.set(-1.05, -0.15, 1.9);
    this.envoy.root.rotation.y = Math.PI * 0.9;
    this.envoy.root.scale.setScalar(1.05);
    this.scene.add(this.envoy.root);
  }

  private add(g: BufferGeometry, m: MeshStandardMaterial | MeshBasicMaterial, shadow = true): Mesh {
    const x = new Mesh(g, m);
    x.castShadow = shadow;
    x.receiveShadow = true;
    this.scene.add(x);
    this.disposables.push(g);
    return x;
  }

  private buildHall(info: AudienceInfo, modern: boolean): void {
    const team = info.civColor;
    const vc = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    this.disposables.push(vc);
    const floorTex = floorTexture(modern);
    const floor = new MeshStandardMaterial({ map: floorTex, roughness: modern ? 0.25 : 0.55, metalness: modern ? 0.1 : 0 });
    this.disposables.push(floorTex, floor);
    const f = new PlaneGeometry(40, 30);
    f.rotateX(-Math.PI / 2);
    this.add(f, floor, false);
    if (modern) {
      // glass wall with a city beyond
      const wall: BufferGeometry[] = [];
      for (let k = -4; k <= 4; k++) wall.push(part(box(0.12, 7, 0.12), '#dfe6ee', { p: [k * 1.6, 3.5, -4.2] }));
      wall.push(part(box(16, 0.2, 0.3), '#dfe6ee', { p: [0, 7, -4.2] }));
      const rng = new Rng(info.emblem + 3);
      for (let k = 0; k < 22; k++) {
        const h = rng.float(2, 9);
        wall.push(part(box(rng.float(0.8, 1.6), h, 0.8), rng.pick(['#9fb6cc', '#b8c8d8', '#8aa2ba']), { p: [-14 + k * 1.3, h / 2 - 0.5, -12 - rng.float(0, 6)] }));
      }
      this.add(merge(wall), vc);
      const glass = new MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.2 });
      this.disposables.push(glass);
      const gp = new PlaneGeometry(16, 7);
      gp.translate(0, 3.5, -4.25);
      this.add(gp, glass, false);
      // a sleek desk and flags
      this.add(merge([part(box(2.6, 0.08, 0.9), '#f4f6f8', { p: [0, 0.82, 1.1] }), part(box(2.4, 0.8, 0.12), '#dfe4ea', { p: [0, 0.4, 1.45] })]), vc);
      for (const s of [-1, 1]) {
        this.add(merge([part(cylinder(0.03, 0.03, 2.6, 8), '#e8eef4', { p: [s * 2.3, 1.3, -1.2] }), part(sphere(0.06, 8, 6), '#f2c14e', { p: [s * 2.3, 2.62, -1.2] })]), vc);
        const banner = bannerTexture(team, info.emblem);
        const bm = new MeshStandardMaterial({ map: banner, side: DoubleSide, roughness: 0.7, transparent: true });
        this.disposables.push(banner, bm);
        const bg = new PlaneGeometry(0.7, 1.75, 8, 4);
        bg.translate(s * 2.3 + 0.38, 1.6, -1.2);
        this.add(bg, bm, false);
      }
      return;
    }
    // back wall with arched windows
    const wall: BufferGeometry[] = [part(box(18, 9, 0.6), '#cbb79a', { p: [0, 4.5, -4.6] }), part(box(18, 0.5, 0.7), '#a88f70', { p: [0, 0.25, -4.55] })];
    for (const x of [-5.4, -3, 3, 5.4]) {
      wall.push(part(box(1.3, 3.6, 0.1), '#ffe9b8', { p: [x, 3.6, -4.28] }));
      wall.push(part(xf(cylinder(0.65, 0.65, 0.1, 16, false), { r: [Math.PI / 2, 0, 0] }), '#ffe9b8', { p: [x, 5.4, -4.28] }));
      wall.push(part(box(0.12, 3.8, 0.14), '#5a4030', { p: [x, 3.7, -4.2] }));
      wall.push(part(box(1.36, 0.12, 0.14), '#5a4030', { p: [x, 4.3, -4.2] }));
    }
    // pillars
    for (const x of [-6.6, -4.2, 4.2, 6.6]) {
      for (const z of [-3.4, 0.8]) {
        wall.push(part(cylinder(0.32, 0.36, 7.5, 16), '#efe6d6', { p: [x, 3.75, z] }));
        wall.push(part(box(0.9, 0.3, 0.9), '#c9b48e', { p: [x, 0.15, z] }));
        wall.push(part(box(0.9, 0.3, 0.9), '#c9b48e', { p: [x, 7.4, z] }));
      }
    }
    // dais, steps, throne and carpet
    wall.push(part(box(4.6, 0.18, 2.6), '#b89a70', { p: [0, 0.09, -1.0] }));
    wall.push(part(box(3.8, 0.18, 2.2), '#c9ad84', { p: [0, 0.27, -1.2] }));
    wall.push(part(box(1.6, 0.012, 6), '#a8283a', { p: [0, 0.006, 1.6] }));
    wall.push(part(box(1.3, 0.014, 6), '#c8384a', { p: [0, 0.008, 1.6] }));
    const throne: BufferGeometry[] = [
      part(box(1.5, 0.5, 1.0), '#b8862e', { p: [0, 0.61, -1.5] }),
      part(box(1.3, 0.12, 0.9), team, { p: [0, 0.9, -1.45] }),
      part(box(1.5, 2.5, 0.2), '#b8862e', { p: [0, 1.6, -1.95] }),
      part(box(1.2, 2.1, 0.06), team, { p: [0, 1.6, -1.83] }),
      part(xf(cylinder(0.75, 0.75, 0.2, 20, false, ), { r: [Math.PI / 2, 0, 0] }), '#b8862e', { p: [0, 2.9, -1.95] }),
      part(sphere(0.16, 12, 10), '#f2c14e', { p: [0, 3.55, -1.9] }),
    ];
    for (const s of [-1, 1]) {
      throne.push(part(box(0.16, 0.6, 0.9), '#a8762a', { p: [s * 0.78, 1.05, -1.45] }));
      throne.push(part(sphere(0.11, 10, 8), '#f2c14e', { p: [s * 0.78, 1.42, -1.05] }));
      throne.push(part(cone(0.12, 0.3, 8), '#f2c14e', { p: [s * 0.7, 3.0, -1.95] }));
    }
    this.add(merge(wall), vc);
    this.add(merge(throne), new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.35 }));
    // banners on the wall
    for (const x of [-1.8, 1.8, -7.6, 7.6]) {
      const tex = bannerTexture(team, info.emblem);
      const m = new MeshStandardMaterial({ map: tex, side: DoubleSide, roughness: 0.8, transparent: true });
      this.disposables.push(tex, m);
      const g = new PlaneGeometry(1.1, 2.75, 6, 6);
      g.translate(x, 4.4, -4.25);
      this.add(g, m, false);
      this.add(merge([part(cylinder(0.04, 0.04, 1.4, 8), '#f2c14e', { r: [0, 0, Math.PI / 2], p: [x, 5.8, -4.22] })]), vc);
    }
    // light shafts from the windows
    for (const x of [-5.4, -3, 3, 5.4]) {
      const g = new PlaneGeometry(1.4, 9);
      g.translate(0, -4.5, 0);
      const shaft = new Mesh(g, new MeshBasicMaterial({ color: '#ffe6b0', transparent: true, opacity: 0.09, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
      shaft.position.set(x, 5.2, -4.1);
      shaft.rotation.x = -0.75;
      this.scene.add(shaft);
      this.disposables.push(g);
    }
    // candelabras
    for (const [x, z] of [[-2.6, -0.4], [2.6, -0.4], [-3.4, 2.4], [3.4, 2.4]] as [number, number][]) {
      const stand = merge([
        part(cylinder(0.05, 0.08, 1.6, 10), '#c99a3e', { p: [0, 0.8, 0] }),
        part(cylinder(0.25, 0.3, 0.06, 12), '#c99a3e', { p: [0, 0.03, 0] }),
        part(torus(0.22, 0.03, 6, 16, Math.PI), '#c99a3e', { r: [0, 0, Math.PI], p: [0, 1.62, 0] }),
      ]);
      const sm = this.add(stand, new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6 }));
      sm.position.set(x, 0, z);
      for (const dx of [-0.22, 0, 0.22]) {
        this.add(merge([part(cylinder(0.035, 0.035, 0.22, 8), '#fff6e0', { p: [x + dx, 1.73, z] })]), vc);
        const flame = new Mesh(new PlaneGeometry(0.09, 0.16), new MeshBasicMaterial({ color: '#ffcc66', transparent: true, blending: AdditiveBlending, depthWrite: false }));
        flame.position.set(x + dx, 1.92, z);
        this.flames.push(flame);
        this.scene.add(flame);
      }
      const light = new PointLight('#ffb866', 3.5, 6, 1.6);
      light.position.set(x, 2.1, z);
      this.lights.push(light);
      this.scene.add(light);
    }
  }

  resize(w: number, h: number): void {
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  /** The leader reacts: an expression and a gesture. */
  react(e: Expression, gesture: 'open' | 'welcome' | 'refuse' | 'point' | 'none' = 'open'): void {
    this.leader.setExpression(e);
    this.gesture = { kind: gesture, start: this.t };
  }

  setMood(e: Expression): void {
    this.leader.setExpression(e);
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    // camera: a slow push-in; on narrow screens the leader is centred
    const narrow = this.aspect < 1;
    const sideShift = narrow ? 0 : 0.9;
    const k = 1 - Math.exp(-t * 0.8);
    const dist = (narrow ? 6.2 : 4.1) - k * 0.3;
    this.camera.fov = narrow ? 42 : 32;
    this.camera.updateProjectionMatrix();
    // on phones the dialogue covers the lower half: frame the leader above it
    const look = new Vector3(sideShift * 0.5, narrow ? 0.55 : 1.62, -0.2);
    this.camera.position.set(look.x - (narrow ? 0 : 0.35) + Math.sin(t * 0.3) * 0.05, (narrow ? 2.0 : 1.82) + Math.sin(t * 0.4) * 0.02, look.z + dist);
    this.camera.lookAt(look);
    // the leader breathes, glances and gestures
    const L = this.leader;
    L.torso.scale.y = 1 + Math.sin(t * 2) * 0.006;
    L.head.rotation.y = Math.sin(t * 0.5) * 0.12 + 0.12;
    L.head.rotation.z = Math.sin(t * 0.37) * 0.04;
    L.head.rotation.x = Math.sin(t * 0.8) * 0.03;
    L.torso.rotation.y = Math.sin(t * 0.3) * 0.04 + 0.08;
    let ar = { x: -0.2, z: -0.18 };
    let al = { x: -0.2, z: 0.18 };
    const g = this.gesture;
    const gk = Math.max(0, 1 - Math.abs((t - g.start - 0.9) / 0.9));
    const ease = gk * gk * (3 - 2 * gk);
    if (g.kind === 'open' || g.kind === 'welcome') {
      ar = { x: -0.2 - ease * 1.15, z: -0.18 - ease * 0.35 };
      if (g.kind === 'welcome') al = { x: -0.2 - ease * 1.0, z: 0.18 + ease * 0.4 };
    } else if (g.kind === 'refuse') {
      ar = { x: -0.2 - ease * 0.9, z: -0.18 + ease * 0.5 };
      L.head.rotation.y += Math.sin(t * 9) * 0.12 * ease;
    } else if (g.kind === 'point') {
      ar = { x: -0.2 - ease * 1.5, z: -0.18 + ease * 0.1 };
    } else {
      // idle: one hand rests near the heart now and then
      const idle = Math.max(0, Math.sin(t * 0.35)) ** 3;
      al = { x: -0.2 - idle * 0.8, z: 0.18 - idle * 0.6 };
    }
    L.armR.rotation.x = ar.x;
    L.armR.rotation.z = ar.z;
    L.armL.rotation.x = al.x;
    L.armL.rotation.z = al.z;
    if (t > this.nextBlink) {
      L.setBlink(true);
      if (t > this.nextBlink + 0.13) {
        L.setBlink(false);
        this.nextBlink = t + 2.2 + Math.random() * 3;
      }
    }
    // our envoy shifts their weight
    this.envoy.torso.rotation.z = Math.sin(t * 0.6) * 0.02;
    this.envoy.head.rotation.y = -0.1 + Math.sin(t * 0.4) * 0.05;
    for (const [i, f] of this.flames.entries()) {
      f.scale.set(1 + Math.sin(t * 13 + i) * 0.12, 1 + Math.sin(t * 17 + i * 2) * 0.18, 1);
      f.quaternion.copy(this.camera.quaternion);
    }
    for (const [i, l] of this.lights.entries()) l.intensity = 3.3 + Math.sin(t * 11 + i * 3) * 0.35;
  }

  dispose(): void {
    this.leader.dispose();
    this.envoy.dispose();
    for (const d of this.disposables) d.dispose();
    this.scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as MeshStandardMaterial).dispose?.();
      }
    });
  }
}

