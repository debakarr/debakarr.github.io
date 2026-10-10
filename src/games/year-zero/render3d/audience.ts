// The royal audience: another people's leader receives our envoy. The hall
// is built from the KayKit Dungeon and Furniture kits (CC0): arched windows
// pouring in light, carved pillars, banners and a throne in the leader's
// colours, torches and candles that flicker, gold by the dais. Modern peoples
// receive us in an office over their city instead. The leader (a dressed
// KayKit character) breathes, blinks, frowns or smiles, and gestures.

import {
  AdditiveBlending,
  BufferGeometry,
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
  Scene,
  Vector3,
} from 'three';
import { Rng } from '../../shared/rng';
import { box, cylinder, ellipsoid, faceted, gradient, merge, part, softBox, torus, xf } from './geo';
import { kitGeo } from './kit';
import { teamMaterial } from './live';
import { buildKitLeader, type Expression, type Gesture, type KitLeader, type LeaderLook } from './models/kitleader';
import type { StageScene } from './stage';

export type { Expression, LeaderLook };

export interface AudienceInfo {
  leader: LeaderLook;
  /** our own leader, seen from behind */
  envoy: LeaderLook;
  civColor: string;
  emblem: number;
}

/** A kit model with its team (white) parts painted in a colour. */
function painted(name: string, color: string | Color, s = 1): BufferGeometry {
  const g = kitGeo(name).clone();
  const c = new Color(color);
  const tm = g.attributes.team;
  const col = g.attributes.color;
  for (let i = 0; i < tm.count; i++) {
    const v = tm.getX(i);
    if (v > 0 && v <= 1.5) col.setXYZ(i, col.getX(i) * (1 - v + c.r * v), col.getY(i) * (1 - v + c.g * v), col.getZ(i) * (1 - v + c.b * v));
  }
  g.scale(s, s, s);
  return g;
}

/** An ornate throne: a carved back with an arched crest, cushions in the people's colour, gold finials. */
function throne(team: string): BufferGeometry {
  const gold = '#d9a43a';
  const wood = '#7a3a22';
  const parts: BufferGeometry[] = [
    part(softBox(1.7, 0.55, 1.2, 0.12), wood, { p: [0, 0, -0.05] }),
    part(softBox(1.5, 0.16, 1.05, 0.12), team, { p: [0, 0.55, 0.0] }),
    part(softBox(1.7, 0.08, 1.24, 0.12), gold, { p: [0, 0.52, -0.05] }),
    part(softBox(1.7, 2.6, 0.24, 0.12), wood, { p: [0, 0.55, -0.62] }),
    part(softBox(1.32, 2.15, 0.08, 0.12), team, { p: [0, 0.75, -0.48] }),
    part(xf(cylinder(0.85, 0.85, 0.24, 20, false), { r: [Math.PI / 2, 0, 0] }), wood, { p: [0, 3.15, -0.62] }),
    part(xf(cylinder(0.66, 0.66, 0.08, 20, false), { r: [Math.PI / 2, 0, 0] }), team, { p: [0, 3.12, -0.48] }),
    part(xf(torus(0.86, 0.06, 6, 24, Math.PI), {}), gold, { p: [0, 3.15, -0.5] }),
    part(faceted(ellipsoid(0.2, 0.26, 0.2, 8, 6)), gold, { p: [0, 4.15, -0.6] }),
    part(xf(faceted(cylinder(0.12, 0.12, 0.05, 6)), { r: [Math.PI / 2, 0, 0] }), '#e2384a', { p: [0, 3.2, -0.42] }),
  ];
  for (const s of [-1, 1]) {
    parts.push(part(softBox(0.22, 0.62, 1.1, 0.2), wood, { p: [s * 0.86, 0.55, -0.02] }));
    parts.push(part(softBox(0.26, 0.08, 1.16, 0.2), gold, { p: [s * 0.86, 1.17, -0.02] }));
    parts.push(part(faceted(ellipsoid(0.13, 0.13, 0.13, 8, 6)), gold, { p: [s * 0.86, 1.3, 0.5] }));
    parts.push(part(faceted(cylinder(0.08, 0.12, 0.5, 6)), gold, { p: [s * 0.86, 3.25, -0.62] }));
    parts.push(part(faceted(ellipsoid(0.12, 0.16, 0.12, 8, 6)), gold, { p: [s * 0.86, 3.6, -0.62] }));
  }
  return merge(parts);
}

export class AudienceScene implements StageScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.1, 200);
  readonly bloom = 0.45;
  private leader: KitLeader;
  private envoy: KitLeader;
  private flames: Mesh[] = [];
  private lights: PointLight[] = [];
  private t = 0;
  private aspect = 1;
  private disposables: { dispose(): void }[] = [];
  private vc = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  readonly modern: boolean;

  constructor(info: AudienceInfo, shadows: boolean) {
    this.modern = info.leader.tier >= 7;
    const modern = this.modern;
    const bg = modern ? '#bcd6ee' : '#2e2420';
    this.scene.background = new Color(bg);
    this.scene.fog = new Fog(bg, 22, 46);
    this.scene.add(new HemisphereLight(modern ? '#e8f2ff' : '#ffe9cc', modern ? '#8a96a8' : '#5a4232', modern ? 1.15 : 0.95));
    const sun = new DirectionalLight(modern ? '#ffffff' : '#ffe6c0', modern ? 2.3 : 2.6);
    sun.position.set(-6, 10, 7);
    sun.castShadow = shadows;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -9;
    sc.right = 9;
    sc.top = 8;
    sc.bottom = -4;
    sc.far = 40;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.disposables.push(this.vc);
    if (modern) this.buildOffice(info);
    else this.buildHall(info);
    // the leader
    const lm = teamMaterial(info.leader.color, info.leader.skin);
    this.disposables.push(lm);
    this.leader = buildKitLeader(info.leader, lm);
    if (this.leader.seated && !modern) this.leader.root.position.set(0, 0.62, -1.45);
    else this.leader.root.position.set(0, modern ? 0 : 0.62, modern ? -0.6 : -0.9);
    this.scene.add(this.leader.root);
    // our envoy, from behind
    const em = teamMaterial(info.envoy.color, info.envoy.skin);
    this.disposables.push(em);
    // a plain diplomat in a sash of our colours, not a second monarch
    this.envoy = buildKitLeader({ ...info.envoy, title: 'Envoy' }, em, true);
    // standing before the dais, three-quarters from behind, facing the leader
    const lz = this.leader.root.position.z;
    this.envoy.root.position.set(-0.6, 0, lz + 1.95);
    this.envoy.root.rotation.y = Math.atan2(0.6, -1.95);
    this.scene.add(this.envoy.root);
  }

  private add(g: BufferGeometry, x = 0, y = 0, z = 0, ry = 0, shadow = true): Mesh {
    const m = new Mesh(g, this.vc);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.scene.add(m);
    this.disposables.push(g);
    return m;
  }

  private flame(x: number, y: number, z: number, light: boolean, s = 1): void {
    const f = new Mesh(new PlaneGeometry(0.14 * s, 0.26 * s), new MeshBasicMaterial({ color: '#ffc45a', transparent: true, blending: AdditiveBlending, depthWrite: false }));
    f.position.set(x, y, z);
    this.flames.push(f);
    this.scene.add(f);
    if (light) {
      const l = new PointLight('#ffb35c', 4, 8, 1.6);
      l.position.set(x, y + 0.2, z + 0.3);
      this.lights.push(l);
      this.scene.add(l);
    }
  }

  private buildHall(info: AudienceInfo): void {
    const team = info.civColor;
    const rng = new Rng(info.emblem * 31 + 7);
    const H = 1.35;
    // floor of large stone tiles
    for (let x = -12; x <= 12; x += 4) for (let z = -6; z <= 10; z += 4) this.add(kitGeo('d_floor_tile_large').clone(), x, 0, z, 0, false);
    // back wall: arched windows either side of a plain wall behind the throne
    const back = -6.2;
    for (const [x, name] of [[-10, 'd_wall_archedwindow_open'], [-6, 'd_wall_archedwindow_open'], [-2, 'd_wall_arched'], [2, 'd_wall_arched'], [6, 'd_wall_archedwindow_open'], [10, 'd_wall_archedwindow_open']] as [number, string][]) {
      const g = kitGeo(name).clone();
      g.scale(1, H, 1);
      this.add(g, x, 0, back);
    }
    // sunlit sky beyond the windows
    const glow = new Mesh(new PlaneGeometry(30, 9), new MeshBasicMaterial({ color: '#ffe3a8' }));
    glow.position.set(0, 3, back - 1.2);
    this.scene.add(glow);
    // side walls
    for (const s of [-1, 1]) for (let z = -4; z <= 8; z += 4) {
      const g = kitGeo(z === 0 ? 'd_wall_window_open' : 'd_wall').clone();
      g.scale(1, H, 1);
      this.add(g, s * 12.3, 0, z, Math.PI / 2);
    }
    // carved pillars with banners and torches
    for (const x of [-8, -4, 4, 8]) {
      const p = kitGeo('d_pillar_decorated').clone();
      p.scale(0.8, H, 0.8);
      this.add(p, x, 0, back + 1.1);
      this.add(painted(rng.pick(['d_banner_patternA_white', 'd_banner_patternB_white', 'd_banner_shield_white']), team, 0.85), x, 1.0, back + 1.35, 0, false);
      this.add(kitGeo('d_torch_mounted').clone(), x + (x < 0 ? 0.95 : -0.95), 3.6, back + 1.2, 0, false);
      this.flame(x + (x < 0 ? 0.95 : -0.95), 4.35, back + 1.5, true);
    }
    // the great banner behind the throne
    this.add(painted('d_banner_triple_white', team, 1.2), 0, 0.9, back + 0.55, 0, false);
    // dais with steps and a carpet down the hall
    const stone = '#a39a8e';
    this.add(merge([
      part(softBox(5.6, 0.32, 3.6, 0.05), stone, { p: [0, 0, -1.6] }),
      part(softBox(4.6, 0.3, 2.8, 0.05), '#b3aa9e', { p: [0, 0.32, -1.9] }),
      part(box(5.64, 0.03, 3.64), '#d9a43a', { p: [0, 0.27, -1.6] }),
    ]), 0, 0, 0, 0, true);
    this.add(merge([
      part(box(1.9, 0.03, 9), '#8a1e2e', { p: [0, 0.015, 3.9] }),
      part(box(1.6, 0.032, 9), '#b8283a', { p: [0, 0.018, 3.9] }),
      part(box(1.9, 0.03, 2.4), '#8a1e2e', { p: [0, 0.335, -1.4] }),
      part(box(1.6, 0.032, 2.4), '#b8283a', { p: [0, 0.338, -1.4] }),
    ]), 0, 0, 0, 0, false);
    // the throne
    this.add(throne(team), 0, 0.62, -1.75, 0);
    // gold, candles and the trappings of rule
    this.add(kitGeo('d_chest_gold').clone(), 2.3, 0.62, -2.4, -0.5);
    this.add(kitGeo('d_coin_stack_large').clone(), 2.9, 0.62, -1.2, 0.3);
    this.add(kitGeo('d_coin_stack_medium').clone(), -2.6, 0.62, -2.6, 0.8);
    this.add(kitGeo('d_sword_shield_gold').clone(), 0, 4.6, back + 0.62, 0, false);
    for (const [x, z] of [[-2.5, -2.4], [2.5, -2.4], [-4.8, 1.0], [4.8, 1.0]] as [number, number][]) {
      const y = Math.abs(x) < 3 ? 0.62 : 0;
      this.add(kitGeo('d_column').clone(), x, y, z);
      this.add(kitGeo('d_candle_triple').clone(), x, y + 1.4, z);
      this.flame(x + 0.08, y + 2.32, z + 0.02, Math.abs(x) > 3, 0.8);
    }
    // a feast table and a shelf of candles to the side
    this.add(kitGeo('d_table_long_tablecloth_decorated_A').clone(), -8.4, 0, 2.2, 0.06);
    this.add(kitGeo('d_shelf_small_candles').clone(), 8.6, 2.4, back + 0.55, 0, false);
    // light shafts from the windows
    for (const x of [-10, -6, 6, 10]) {
      const g = new PlaneGeometry(2.0, 12);
      g.translate(0, -6, 0);
      const shaft = new Mesh(g, new MeshBasicMaterial({ color: '#ffe0a0', transparent: true, opacity: 0.075, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
      shaft.position.set(x, 4.2, back + 0.5);
      shaft.rotation.x = -0.72;
      this.scene.add(shaft);
      this.disposables.push(g);
    }
  }

  private buildOffice(info: AudienceInfo): void {
    const team = info.civColor;
    const rng = new Rng(info.emblem + 3);
    const floor = new Mesh(new PlaneGeometry(40, 30), new MeshStandardMaterial({ color: '#d9d2c4', roughness: 0.3, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // the city skyline beyond a glass wall
    for (let k = 0; k < 18; k++) {
      const name = rng.pick(['c_building_A', 'c_building_B', 'c_building_C', 'c_building_D', 'c_building_E', 'c_building_F', 'c_building_G', 'c_building_H']);
      this.add(kitGeo(name).clone(), -18 + k * 2.2 + rng.float(-0.4, 0.4), -1.5, -12 - rng.float(0, 6), rng.float(0, 6), false).scale.setScalar(rng.float(1.4, 2.2));
    }
    const frame: BufferGeometry[] = [];
    for (let k = -4; k <= 4; k++) frame.push(part(box(0.12, 7, 0.12), '#eef2f6', { p: [k * 1.8, 3.5, -4.6] }));
    frame.push(part(box(17, 0.2, 0.3), '#eef2f6', { p: [0, 7, -4.6] }), part(box(17, 0.3, 0.3), '#c8ced6', { p: [0, 0.15, -4.6] }));
    this.add(merge(frame));
    const glass = new MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2 });
    this.disposables.push(glass);
    const gp = new PlaneGeometry(17, 7);
    gp.translate(0, 3.5, -4.65);
    const gm = new Mesh(gp, glass);
    this.scene.add(gm);
    // furniture: a desk, a rug, sofas, lamps, shelves and flags
    const rug = new Color(team).multiplyScalar(0.55);
    this.add(merge([part(box(5.2, 0.02, 3.4), `#${rug.getHexString()}`, { p: [0, 0.01, 0.4] }), part(box(5.5, 0.015, 3.7), '#d9c9a8', { p: [0, 0.008, 0.4] })]), 0, 0, 0, 0, false);
    const desk = merge([part(softBox(3.0, 0.12, 1.1, 0.1), '#6b4a32', { p: [0, 1.0, -1.7] }), part(softBox(2.8, 0.95, 0.12, 0.1), '#5a3e2a', { p: [0, 0.48, -1.22] }), part(box(0.5, 0.06, 0.35), '#f2efe8', { p: [0.7, 1.09, -1.8] }), part(softBox(1.1, 1.6, 0.9, 0.2), '#3a2a22', { p: [0, 0, -2.6] })]);
    this.add(desk);
    this.add(kitGeo('f_couch_pillows').clone(), -6, 0, 0.5, 0.4).scale.setScalar(1.4);
    this.add(kitGeo('f_lamp_standing').clone(), -3.6, 0, -2.8, 0).scale.setScalar(1.2);
    this.add(kitGeo('f_lamp_standing').clone(), 3.6, 0, -2.8, 0).scale.setScalar(1.2);
    this.add(kitGeo('f_shelf_B_large_decorated').clone(), 6.4, 1.2, -3.0, -0.3).scale.setScalar(1.4);
    this.add(kitGeo('f_cactus_medium_A').clone(), 5.4, 0, 1.4, 0).scale.setScalar(1.3);
    for (const s of [-1, 1]) {
      this.add(merge([part(cylinder(0.035, 0.035, 3.0, 8), '#e8eef4', { p: [s * 2.4, 1.5, -1.6] }), part(ellipsoid(0.07, 0.07, 0.07, 8, 6), '#f2c14e', { p: [s * 2.4, 3.04, -1.6] })]));
      const flag = new Mesh(new PlaneGeometry(0.9, 1.4, 8, 4), new MeshStandardMaterial({ color: team, side: DoubleSide, roughness: 0.7 }));
      flag.position.set(s * 2.4 + 0.47, 2.25, -1.6);
      flag.userData.wave = true;
      this.scene.add(flag);
    }
    void gradient;
  }

  resize(w: number, h: number): void {
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  /** The leader reacts: an expression and a gesture. */
  react(e: Expression, gesture: Gesture = 'open'): void {
    this.leader.setExpression(e);
    this.leader.gesture(gesture);
  }

  setMood(e: Expression): void {
    this.leader.setExpression(e);
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    // camera: a slow push-in; on narrow screens the leader is centred above the dialogue
    const narrow = this.aspect < 1;
    const seated = this.leader.seated && !this.modern;
    const headY = seated ? 2.35 : this.modern ? 1.95 : 2.3;
    const k = 1 - Math.exp(-t * 0.7);
    const dist = (narrow ? 9.2 : 7.6) - k * 0.5;
    this.camera.fov = narrow ? 44 : 30;
    this.camera.updateProjectionMatrix();
    // the leader sits left of centre so the dialogue panel has the right side
    const side = narrow ? 0 : 1.45;
    const z = this.leader.root.position.z;
    const look = new Vector3(side, narrow ? headY - 1.35 : headY - 0.75, z);
    this.camera.position.set(side - (narrow ? 0 : 0.6) + Math.sin(t * 0.3) * 0.06, headY + 0.35 + Math.sin(t * 0.4) * 0.02, z + dist);
    this.camera.lookAt(look);
    this.leader.update(dt, t);
    this.envoy.update(dt, t);
    for (const [i, f] of this.flames.entries()) {
      f.scale.set(1 + Math.sin(t * 13 + i) * 0.12, 1 + Math.sin(t * 17 + i * 2) * 0.18, 1);
      f.quaternion.copy(this.camera.quaternion);
    }
    for (const [i, l] of this.lights.entries()) l.intensity = 3.8 + Math.sin(t * 11 + i * 3) * 0.4;
    this.scene.traverse((o) => {
      if (!o.userData.wave) return;
      const pos = (o as Mesh).geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + 0.45;
        pos.setZ(i, Math.sin(t * 3 - x * 4) * 0.06 * x);
      }
      pos.needsUpdate = true;
    });
  }

  dispose(): void {
    this.leader.dispose();
    this.envoy.dispose();
    for (const d of this.disposables) d.dispose();
    this.scene.traverse((o) => {
      if (o instanceof Mesh && !o.userData.keep) {
        o.geometry.dispose();
        (o.material as MeshStandardMaterial).dispose?.();
      }
    });
  }
}
