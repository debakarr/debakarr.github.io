// The battle cinematic. When the player attacks, the fight is resolved by
// the game first; this scene then stages that exact result on a small
// battlefield built from the defender's tile — its biome, forests, hills,
// river or city walls — with both sides' soldiers in their colours. The
// choreography (who advances, who shoots, how many fall, who flees or
// cheers) follows the real damage, so the film never contradicts the rules.

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type IUniform,
} from 'three';
import { Noise2D } from '../../shared/noise';
import { Rng } from '../../shared/rng';
import { F, Relief, T } from '../data/terrain';
import { UNIT } from '../data/units';
import { cone, cylinder, merge, part, xf } from './geo';
import * as B from './models/buildings';
import { LOOKS, aircraft, cannon, catapult, gatlingGun, horseGeo, poseRig, rocketTruck, ship, soldierRig, tank, type Look, type Rig } from './models/figures';
import * as N from './models/nature';
import type { StageScene } from './stage';

export interface Side {
  civName: string;
  adj: string;
  color: string;
  skin: string;
  /** unit type, or null for a city's own defences */
  type: string | null;
  label: string;
  hpBefore: number;
  hpAfter: number;
  /** full health (100 for units, more for walled cities) */
  max: number;
  /** destroyed (unit) or taken (city) */
  lost: boolean;
  /** era tier, for city styles */
  tier: number;
}

export interface BattleInfo {
  title: string;
  attacker: Side;
  defender: Side;
  city: { name: string; size: number; walls: boolean } | null;
  captured: boolean;
  ranged: boolean;
  terrain: number;
  feature: number;
  relief: number;
  river: boolean;
  water: boolean;
  seed: number;
}

const SCALE = 5.2;
const SKY_TOP = new Color('#7fbdf5');
const SKY_HORIZON = new Color('#fff1d2');

interface Actor {
  root: Object3D;
  rig: { head: Object3D; armL: Object3D; armR: Object3D; legL: Object3D; legR: Object3D } | null;
  side: -1 | 1;
  home: Vector3;
  pos: Vector3;
  kind: 'foot' | 'rider' | 'machine' | 'ship' | 'air';
  ranged: boolean;
  mats: { uniforms: Record<string, IUniform> }[];
  fallAt: number;
  cheerAt: number;
  strikeAt: number[];
  shootAt: number[];
  hitAt: number[];
  phase: number;
  facing: number;
}

interface Projectile {
  mesh: Object3D;
  from: Vector3;
  to: Vector3;
  start: number;
  dur: number;
  arc: number;
  kind: 'arrow' | 'ball' | 'bullet';
}

interface Puff {
  mesh: Mesh;
  start: number;
  dur: number;
  grow: number;
}

/** A material that paints `team` vertices in a side's colour and `team = 2` in skin, with a hit flash. */
function teamMaterial(color: string, skin: string): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
  const uniforms = { uTeam: { value: new Color(color) }, uSkin: { value: new Color(skin) }, uFlash: { value: 0 } };
  m.userData.uniforms = uniforms;
  m.customProgramCacheKey = () => 'yz-battle-team';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute float team;\nuniform vec3 uTeam;\nuniform vec3 uSkin;\n${shader.vertexShader}`.replace('#include <color_vertex>', `
      vColor = vec4(1.0);
      vColor.xyz *= color.xyz;
      if (team > 1.5) vColor.xyz *= uSkin;
      else vColor.xyz = mix(vColor.xyz, vColor.xyz * uTeam, clamp(team, 0.0, 1.0));`);
    shader.fragmentShader = `uniform float uFlash;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.35, 0.28), uFlash);');
  };
  return m;
}

function sky(): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { uTop: { value: SKY_TOP }, uHorizon: { value: SKY_HORIZON } },
    vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; varying vec3 vP;
      void main() {
        float h = clamp(vP.y * 1.6, 0.0, 1.0);
        vec3 c = mix(uHorizon, uTop, pow(h, 0.7));
        // soft painted clouds
        float n = sin(vP.x * 9.0 + sin(vP.z * 7.0) * 2.0) * sin(vP.z * 6.0 + vP.y * 12.0);
        c = mix(c, vec3(1.0), smoothstep(0.55, 0.9, n) * smoothstep(0.05, 0.35, h) * 0.45);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new Mesh(new SphereGeometry(80, 24, 16), mat);
  m.renderOrder = -1;
  return m;
}

export class BattleScene implements StageScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(38, 1, 0.1, 300);
  readonly bloom = 0.35;
  readonly info: BattleInfo;
  /** 0..1 as the fight unfolds; the HUD reads it. */
  time = 0;
  readonly length: number;
  /** Moments the HUD reacts to (damage numbers, bars, result). */
  readonly beats: { at: number; kind: 'hitDef' | 'hitAtk' | 'result'; done?: boolean }[] = [];
  onBeat: ((kind: 'hitDef' | 'hitAtk' | 'result', world: Vector3) => void) | null = null;
  private actors: Actor[] = [];
  private projectiles: Projectile[] = [];
  private puffs: Puff[] = [];
  private noise: Noise2D;
  private rng: Rng;
  private sun = new DirectionalLight('#fff0d6', 2.6);
  private waterMat: ShaderMaterial | null = null;
  private flagCloth: Mesh | null = null;
  private shotStart = new Vector3();
  private aspect = 1;

  constructor(info: BattleInfo, shadows: boolean) {
    this.info = info;
    this.rng = new Rng(info.seed);
    this.noise = new Noise2D(new Rng(info.seed + 7));
    this.scene.add(sky());
    this.scene.fog = new Fog(SKY_HORIZON.clone().lerp(new Color('#cfe6ff'), 0.4), 28, 70);
    this.scene.add(new HemisphereLight('#d8ecff', '#7a7050', 0.9));
    this.sun.position.set(-8, 14, 9);
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 10;
    sc.bottom = -10;
    sc.near = 1;
    sc.far = 50;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.buildGround();
    N.setCanopyDetail(2);
    this.buildScenery();
    N.setCanopyDetail(1);
    if (info.city) this.buildCity();
    this.buildArmies();
    this.length = info.ranged ? 6.6 : 7.2;
    this.schedule();
  }

  // --- The battlefield ----------------------------------------------------------------------------

  private groundColor(x: number, z: number, out: Color): Color {
    const i = this.info;
    const n = this.noise.fbm(x * 0.12, z * 0.12, 3);
    const n2 = this.noise.fbm(x * 0.6 + 9, z * 0.6, 2);
    let a = '#7ccb43';
    let b = '#a6d84c';
    if (i.terrain === T.Plains) [a, b] = ['#bccd52', '#dcc85e'];
    else if (i.terrain === T.Desert) [a, b] = ['#f0d595', '#e3bc7c'];
    else if (i.terrain === T.Tundra) [a, b] = ['#a5b796', '#b9c4a8'];
    else if (i.terrain === T.Snow) [a, b] = ['#eef3f8', '#ffffff'];
    if (i.feature === F.Forest) [a, b] = ['#5fa63a', '#7cbf45'];
    if (i.feature === F.Jungle) [a, b] = ['#3f9a3e', '#5fb84a'];
    if (i.feature === F.Marsh) [a, b] = ['#78a85a', '#5f9a6a'];
    if (i.feature === F.Ash || i.feature === F.Volcano) [a, b] = ['#6d5a50', '#8a7060'];
    out.set(a).lerp(new Color(b), 0.5 + n * 0.9);
    out.offsetHSL(0, 0, n2 * 0.03);
    // a trampled path across the field
    const path = Math.exp(-((z - Math.sin(x * 0.3) * 0.4) ** 2) * 1.4);
    if (i.terrain !== T.Snow && !i.water) out.lerp(new Color('#c9a874'), path * 0.35);
    return out;
  }

  private heightAt(x: number, z: number): number {
    const i = this.info;
    let y = this.noise.fbm(x * 0.15, z * 0.15, 3) * 0.25;
    // hills rise behind the field
    const back = Math.max(0, -z - 4) * 0.25;
    y += back * (1 + this.noise.fbm(x * 0.08, 3, 2));
    if (i.relief === Relief.Hills) y += Math.max(0, 1 - Math.abs(z) / 6) * this.noise.fbm(x * 0.2, z * 0.2, 2) * 0.6;
    // keep the fighting lane flat
    const lane = Math.exp(-(z * z) / 6) * Math.exp(-(x * x) / 60);
    return y * (1 - lane * 0.85);
  }

  private buildGround(): void {
    const geo = new PlaneGeometry(90, 60, 120, 80);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      pos.setY(k, this.info.water ? -1.2 + this.heightAt(x, z) * 0.3 : this.heightAt(x, z));
      this.groundColor(x, z, c);
      col.set([c.r, c.g, c.b], k * 3);
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    m.receiveShadow = true;
    this.scene.add(m);
    if (this.info.water || this.info.river) this.buildWater();
  }

  private buildWater(): void {
    const mat = new ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; varying vec3 vW;
        void main() {
          vec2 p = vW.xz;
          float w = sin(p.x * 1.3 + uTime * 1.2) * sin(p.y * 1.1 - uTime) + sin(p.x * 3.1 - p.y * 2.3 + uTime * 2.0) * 0.4;
          vec3 deep = vec3(0.07, 0.36, 0.72);
          vec3 light = vec3(0.32, 0.72, 0.9);
          vec3 c = mix(deep, light, 0.5 + 0.3 * w);
          c += vec3(1.0) * smoothstep(0.9, 1.3, w) * 0.4;
          gl_FragColor = vec4(c, 0.92);
          #include <colorspace_fragment>
        }`,
    });
    this.waterMat = mat;
    const geo = this.info.water ? new PlaneGeometry(120, 80) : new PlaneGeometry(90, 2.6);
    geo.rotateX(-Math.PI / 2);
    const m = new Mesh(geo, mat);
    if (this.info.water) m.position.y = -0.05;
    else {
      m.position.set(0, 0.06, -3.6);
      // banks
      for (const dz of [-1.35, 1.35]) {
        const bank = new Mesh(new CylinderGeometry(0.12, 0.12, 90, 6), new MeshStandardMaterial({ color: '#d9c48a', roughness: 1 }));
        bank.rotation.z = Math.PI / 2;
        bank.position.set(0, 0.0, -3.6 + dz);
        this.scene.add(bank);
      }
    }
    this.scene.add(m);
  }

  private prop(geo: BufferGeometry, x: number, z: number, s: number, rot = this.rng.next() * 6.28, shadow = true): void {
    const m = new Mesh(geo, this.propMat);
    m.position.set(x, this.info.water ? -1 : this.heightAt(x, z) - 0.02, z);
    m.scale.setScalar(s);
    m.rotation.y = rot;
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.scene.add(m);
  }

  private propMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

  private buildScenery(): void {
    const i = this.info;
    const rng = this.rng;
    if (i.water) {
      // a distant coast
      for (let k = 0; k < 7; k++) this.prop(N.mountain(200 + k, k % 2 === 0, 1), -30 + k * 10 + rng.float(-3, 3), -38 + rng.float(-4, 4), rng.float(6, 10), undefined, false);
      return;
    }
    const kinds: (() => BufferGeometry)[] = [];
    const lone: (() => BufferGeometry)[] = [];
    const t = i.terrain;
    if (t === T.Snow) kinds.push(() => N.pineTree(rng.int(99), true));
    else if (i.feature === F.Jungle) kinds.push(() => N.jungleTree(rng.int(99)), () => N.palm(rng.int(99)));
    else if (t === T.Desert) lone.push(() => N.cactus(rng.int(99)), () => N.rock(rng.int(99), '#e2c48e', '#f0d9a8'));
    else if (t === T.Tundra) kinds.push(() => N.pineTree(rng.int(99), rng.chance(0.4)));
    else kinds.push(() => N.roundTree(rng.int(99)), () => N.pineTree(rng.int(99)), () => N.roundTree(rng.int(99), ['#4f9a2a', '#c4dc52']));
    const dense = i.feature === F.Forest || i.feature === F.Jungle ? 70 : t === T.Desert ? 0 : 30;
    // trees frame the field without blocking the fighting lane
    for (let k = 0; k < dense; k++) {
      const x = rng.float(-22, 22);
      const z = rng.chance(0.6) ? rng.float(-16, -3.2) : rng.float(4.5, 9);
      if (Math.abs(z) < 3 || (z > 0 && Math.abs(x) < 9 && z < 6)) continue;
      if (kinds.length) this.prop(rng.pick(kinds)(), x, z, rng.float(5, 7.5));
    }
    for (let k = 0; k < (t === T.Desert ? 26 : 18); k++) {
      const x = rng.float(-16, 16);
      const z = rng.float(-10, 7);
      if (Math.abs(z) < 2.2 && Math.abs(x) < 6) continue;
      if (lone.length) this.prop(rng.pick(lone)(), x, z, rng.float(4, 6));
      else this.prop(N.rock(rng.int(99)), x, z, rng.float(3, 6));
    }
    // grass tufts and flowers everywhere but the snow and sand
    if (t !== T.Snow && t !== T.Desert) {
      const tuft = N.tuft(5);
      const fl = N.flowers(6);
      const tuftCol = new Color(t === T.Plains ? '#d8c25a' : '#7dc443');
      const tm = new MeshStandardMaterial({ color: tuftCol, roughness: 0.9 });
      for (let k = 0; k < 160; k++) {
        const x = rng.float(-14, 14);
        const z = rng.float(-6, 6);
        const m = new Mesh(k % 5 === 0 ? fl : tuft, k % 5 === 0 ? new MeshStandardMaterial({ color: rng.pick(['#ff8fb8', '#ffd84a', '#ffffff', '#c59bff']), roughness: 0.8 }) : tm);
        m.position.set(x, this.heightAt(x, z) - 0.02, z);
        m.scale.setScalar(rng.float(4, 6));
        m.rotation.y = rng.next() * 6.28;
        this.scene.add(m);
      }
    }
    // mountains on the horizon for rugged land
    const peaks = i.relief === Relief.Mountain || t === T.Snow || t === T.Tundra ? 6 : i.relief === Relief.Hills ? 3 : 2;
    for (let k = 0; k < peaks; k++) this.prop(N.mountain(300 + k, true, 1), -34 + k * (68 / Math.max(1, peaks - 1)) + rng.float(-4, 4), -34 + rng.float(-5, 3), rng.float(8, 13), undefined, false);
    // a few fence posts along the path, like the reference battle meadow
    if (t === T.Grass || t === T.Plains) for (let k = 0; k < 8; k++) this.prop(N.fence(0.34), -12 + k * 1.8, -2.9 + Math.sin(k) * 0.2, 5, 0.05, true);
  }

  private buildCity(): void {
    const i = this.info;
    const d = i.defender;
    const rng = this.rng;
    const parts: BufferGeometry[] = [];
    const walls = i.city!.walls || d.tier >= 2;
    const tier = d.tier;
    const roof = d.color;
    const wx = 3.4;
    if (walls) {
      for (let k = -3; k <= 3; k++) {
        if (k === 0) continue;
        const seg = tier <= 1 ? B.palisade(0.3) : B.wallSegment(0.3, 0.08);
        parts.push(B.place(seg, wx, 0, k * 0.3 * SCALE * 0.62, Math.PI / 2, SCALE * 0.62));
      }
      if (tier > 1) for (const k of [-3.5, -1, 1, 3.5]) parts.push(B.place(B.wallTower(roof), wx, 0, k * 0.3 * SCALE * 0.62, 0, SCALE * 0.62));
      parts.push(B.place(B.gatehouse(roof), wx, 0, 0, Math.PI / 2, SCALE * 0.62));
    }
    for (let k = 0; k < 14; k++) {
      const x = wx + rng.float(1.2, 6);
      const z = rng.float(-6, 6);
      const geo = tier <= 1 ? B.hut(rng) : tier <= 4 ? B.house(rng, rng.chance(0.6) ? roof : rng.pick(B.STYLE.roofs)) : tier <= 6 ? B.brickBlock(rng, roof, 2) : B.skyscraper(rng, rng.float(0.15, 0.3), roof);
      parts.push(B.place(geo, x, this.heightAt(x, z), z, -Math.PI / 2 + rng.float(-0.3, 0.3), SCALE * 0.8));
    }
    if (tier >= 2 && tier <= 6) parts.push(B.place(B.keep(rng, roof), wx + 4.2, this.heightAt(wx + 4.2, 0), 0, -Math.PI / 2, SCALE * 0.75));
    const m = new Mesh(merge(parts), this.propMat);
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    // the city's banner over the gate; it changes colour if the city falls
    const pole = new Mesh(merge([part(cylinder(0.02, 0.02, 2.2, 6), '#e8e0d0', { p: [0, 1.1, 0] })]), this.propMat);
    pole.position.set(wx + 0.2, walls ? 0.6 : 0, 0);
    const cloth = new Mesh(new PlaneGeometry(0.9, 0.55, 8, 2), new MeshStandardMaterial({ color: d.color, side: 2, roughness: 0.7 }));
    cloth.position.set(0.45, 1.9, 0);
    pole.add(cloth);
    this.flagCloth = cloth;
    this.scene.add(pole);
  }

  // --- The armies --------------------------------------------------------------------------------

  private rigObject(rig: Rig, mat: MeshStandardMaterial): { root: Object3D; parts: Actor['rig'] } {
    const root = new Object3D();
    const body = new Mesh(rig.body, mat);
    body.castShadow = true;
    root.add(body);
    const mk = (g: BufferGeometry, p: [number, number, number]) => {
      const o = new Object3D();
      o.position.set(p[0], p[1], p[2]);
      const m = new Mesh(g, mat);
      m.castShadow = true;
      o.add(m);
      root.add(o);
      return o;
    };
    const pv = rig.pivots;
    return {
      root,
      parts: { head: mk(rig.head, pv.head), armL: mk(rig.armL, pv.armL), armR: mk(rig.armR, pv.armR), legL: mk(rig.legL, pv.legL), legR: mk(rig.legR, pv.legR) },
    };
  }

  private armySpec(side: Side): { kind: Actor['kind']; build: (mat: MeshStandardMaterial, k: number) => { root: Object3D; parts: Actor['rig'] }; count: number; ranged: boolean } {
    const type = side.type;
    const def = type ? UNIT[type] : null;
    const cls = def?.cls ?? 'infantry';
    const look: Look = type && LOOKS[type] ? LOOKS[type] : side.tier >= 5 ? LOOKS.riflemen : side.tier >= 3 ? LOOKS.crossbow : LOOKS.archers;
    const ranged = !!def && def.rng > 0;
    const rigid = (g: BufferGeometry) => (mat: MeshStandardMaterial) => {
      const root = new Object3D();
      const m = new Mesh(g, mat);
      m.castShadow = true;
      root.add(m);
      return { root, parts: null };
    };
    if (cls === 'naval' && type) return { kind: 'ship', build: rigid(ship(type)), count: 2, ranged };
    if (cls === 'air' && type) return { kind: 'air', build: rigid(aircraft(type === 'biplane' ? 'biplane' : type === 'jet' ? 'jet' : 'drones')), count: 2, ranged: true };
    if (type === 'tanks' || type === 'modarmor' || type === 'hovertank') return { kind: 'machine', build: rigid(tank(type === 'tanks' ? 'tank' : type === 'modarmor' ? 'modern' : 'hover')), count: 2, ranged: false };
    if (cls === 'cavalry' && type) {
      return {
        kind: 'rider',
        count: 3,
        ranged: false,
        build: (mat, k) => {
          const rider = poseRig(soldierRig({ ...look, banner: k === 0 }, 40 + k), 'ride');
          rider.translate(0, 0.075, 0);
          return rigid(merge([horseGeo(k % 2 ? '#5a3a26' : '#8a5a34', '#2a1a12', type === 'knights'), rider]))(mat);
        },
      };
    }
    if (cls === 'siege' && type) {
      const machine = type === 'catapult' ? catapult(false) : type === 'trebuchet' ? catapult(true) : type === 'cannon' ? cannon(false) : type === 'artillery' ? cannon(true) : rocketTruck();
      return { kind: 'machine', build: rigid(xf(machine, { s: 1.4 })), count: 1, ranged: true };
    }
    if (type === 'gatling' || type === 'machinegun') return { kind: 'machine', build: rigid(xf(gatlingGun(type === 'machinegun'), { s: 1.4 })), count: 1, ranged: true };
    const count = def?.cls === 'civilian' || def?.cls === 'recon' ? 2 : 5;
    return {
      kind: 'foot',
      count,
      ranged: ranged || (!type && side.tier >= 1),
      build: (mat, k) => this.rigObject(soldierRig({ ...look, banner: k === 0 && count > 2 }, 60 + k * 7 + (side === this.info.attacker ? 0 : 3)), mat),
    };
  }

  private buildArmies(): void {
    const i = this.info;
    const place = (side: Side, s: -1 | 1) => {
      const spec = this.armySpec(side);
      const n = spec.count;
      const extraCrew = spec.kind === 'machine' && side.type && UNIT[side.type].cls === 'siege';
      for (let k = 0; k < n; k++) {
        const mat = teamMaterial(side.color, side.skin);
        const { root, parts } = spec.build(mat, k);
        const row = spec.kind === 'foot' ? (k < 3 ? 0 : 1) : 0;
        const col = spec.kind === 'foot' ? (k < 3 ? k - 1 : k - 3.5) : k - (n - 1) / 2;
        const spacing = spec.kind === 'foot' ? 1.15 : spec.kind === 'ship' ? 4 : 2.2;
        let x = s * (3.4 + row * 1.2) + (this.rng.next() - 0.5) * 0.3;
        let z = col * spacing + (this.rng.next() - 0.5) * 0.3;
        if (spec.kind === 'ship') x = s * 5;
        if (s === 1 && i.city) x = Math.min(x, 2.6);
        const y = spec.kind === 'air' ? 3.2 + k * 0.5 : spec.kind === 'ship' ? -0.05 : this.heightAt(x, z);
        root.position.set(x, y, z);
        const facing = s === -1 ? Math.PI / 2 : -Math.PI / 2;
        root.rotation.y = facing;
        root.scale.setScalar(SCALE * (spec.kind === 'ship' ? 1.6 : spec.kind === 'air' ? 1.4 : spec.kind === 'machine' ? 1.1 : 1));
        this.scene.add(root);
        this.actors.push({
          root, rig: parts, side: s, home: root.position.clone(), pos: root.position.clone(), kind: spec.kind, ranged: spec.ranged,
          mats: [mat.userData as { uniforms: Record<string, IUniform> }], fallAt: -1, cheerAt: -1, strikeAt: [], shootAt: [], hitAt: [],
          phase: this.rng.next() * 6.28, facing,
        });
      }
      if (extraCrew) {
        for (let k = 0; k < 2; k++) {
          const mat = teamMaterial(side.color, side.skin);
          const { root, parts } = this.rigObject(soldierRig({ ...LOOKS.crew, helmet: side.tier >= 5 ? 'steel' : 'iron' }, 90 + k), mat);
          const x = s * 4.6;
          const z = k ? 1.2 : -1.2;
          root.position.set(x, this.heightAt(x, z), z);
          root.rotation.y = s === -1 ? Math.PI / 2 : -Math.PI / 2;
          root.scale.setScalar(SCALE);
          this.scene.add(root);
          this.actors.push({ root, rig: parts, side: s, home: root.position.clone(), pos: root.position.clone(), kind: 'foot', ranged: false, mats: [mat.userData as { uniforms: Record<string, IUniform> }], fallAt: -1, cheerAt: -1, strikeAt: [], shootAt: [], hitAt: [], phase: k * 2, facing: root.rotation.y });
        }
      }
    };
    place(i.attacker, -1);
    place(i.defender, 1);
  }

  // --- Choreography ----------------------------------------------------------------------------------

  private schedule(): void {
    const i = this.info;
    const att = this.actors.filter((a) => a.side === -1);
    const def = this.actors.filter((a) => a.side === 1);
    const lossDef = i.defender.lost ? 1 : (i.defender.hpBefore - i.defender.hpAfter) / Math.max(1, i.defender.hpBefore);
    const lossAtt = i.attacker.lost ? 1 : (i.attacker.hpBefore - i.attacker.hpAfter) / Math.max(1, i.attacker.hpBefore);
    const fallers = (list: Actor[], loss: number, all: boolean) => {
      const foot = list.filter((a) => a.kind === 'foot' || a.kind === 'rider');
      if (all) return list;
      const n = Math.min(foot.length - 1, Math.round(foot.length * Math.min(0.7, loss * 1.1)));
      return this.rng.shuffle([...foot]).slice(0, Math.max(0, n));
    };
    const defFall = i.city && !i.defender.lost ? fallers(def, lossDef, false) : fallers(def, lossDef, i.defender.lost);
    const attFall = fallers(att, lossAtt, i.attacker.lost);
    if (i.ranged) {
      // volleys from where they stand; the defenders cannot answer
      for (const a of att) a.shootAt = [1.7, 2.5, 3.3].map((t) => t + this.rng.next() * 0.25);
      for (const d of def) d.hitAt = [2.35, 3.15, 3.95].filter(() => this.rng.chance(0.6)).map((t) => t + this.rng.next() * 0.2);
      for (const d of defFall) d.fallAt = 3.6 + this.rng.next() * 0.6;
      this.beats.push({ at: 2.4, kind: 'hitDef' }, { at: 5.0, kind: 'result' });
      if (i.attacker.hpAfter < i.attacker.hpBefore) this.beats.push({ at: 3.4, kind: 'hitAtk' });
      for (const a of att) if (i.defender.lost) a.cheerAt = 4.4 + this.rng.next() * 0.3;
    } else {
      // the charge, the clash, the reckoning
      for (const a of att) a.strikeAt = [2.75, 3.35, 3.95].map((t) => t + this.rng.next() * 0.2);
      for (const d of def) {
        d.strikeAt = d.ranged ? [] : [3.05, 3.65].map((t) => t + this.rng.next() * 0.2);
        if (d.ranged) d.shootAt = [1.7, 2.3];
        d.hitAt = [2.9, 3.5].map((t) => t + this.rng.next() * 0.15);
      }
      for (const a of att) a.hitAt = lossAtt > 0 ? [3.2 + this.rng.next() * 0.3] : [];
      for (const d of defFall) d.fallAt = 3.5 + this.rng.next() * 0.7;
      for (const a of attFall) a.fallAt = 3.7 + this.rng.next() * 0.6;
      this.beats.push({ at: 3.0, kind: 'hitDef' }, { at: 3.4, kind: 'hitAtk' }, { at: 5.6, kind: 'result' });
      const winners = i.defender.lost ? att : i.attacker.lost ? def : [];
      for (const w of winners) w.cheerAt = 4.6 + this.rng.next() * 0.3;
    }
  }

  private shoot(a: Actor, t: number): void {
    const targets = this.actors.filter((x) => x.side !== a.side);
    if (!targets.length) return;
    const tgt = this.rng.pick(targets);
    const from = a.pos.clone().add(new Vector3(0, a.kind === 'air' ? 0 : 0.8, 0));
    const to = tgt.pos.clone().add(new Vector3((this.rng.next() - 0.5) * 0.6, 0.6, (this.rng.next() - 0.5) * 0.6));
    const type = this.info.attacker.type ?? '';
    const cls = UNIT[type]?.cls;
    let kind: Projectile['kind'] = 'arrow';
    if (cls === 'siege' || type === 'frigate' || type === 'battleship') kind = 'ball';
    else if (a.side === 1 ? this.info.defender.tier >= 4 : ['musketeers', 'riflemen', 'infantry', 'mechinf', 'exolegion', 'gatling', 'machinegun', 'biplane', 'jet', 'drones', 'cavalry', 'tanks', 'modarmor', 'hovertank'].includes(type)) kind = 'bullet';
    let mesh: Object3D;
    if (kind === 'arrow') {
      mesh = new Mesh(merge([part(cylinder(0.02, 0.02, 0.7, 4), '#8a5a34', { r: [Math.PI / 2, 0, 0] }), part(cone(0.05, 0.14, 4), '#cfd6dd', { r: [Math.PI / 2, 0, 0], p: [0, 0, 0.4] })]), this.propMat);
    } else if (kind === 'ball') {
      mesh = new Mesh(new SphereGeometry(0.22, 10, 8), new MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.5 }));
    } else {
      mesh = new Mesh(new SphereGeometry(0.07, 6, 5), new MeshBasicMaterial({ color: '#fff2a0' }));
      this.puff(from.clone().add(new Vector3(a.side * -0.1, 0, 0)), 0.18, '#fff0c0', 0.25, true);
      this.puff(from.clone(), 0.35, '#e8e8e8', 0.9, false);
    }
    this.scene.add(mesh);
    const dist = from.distanceTo(to);
    this.projectiles.push({ mesh, from, to, start: t, dur: kind === 'bullet' ? 0.18 : 0.15 + dist * 0.08, arc: kind === 'bullet' ? 0 : dist * 0.18, kind });
  }

  private puff(at: Vector3, size: number, color: string, dur: number, glow: boolean): void {
    const m = new Mesh(new SphereGeometry(1, 10, 8), new MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: glow ? AdditiveBlending : NormalBlending }));
    m.position.copy(at);
    m.scale.setScalar(size);
    this.scene.add(m);
    this.puffs.push({ mesh: m, start: this.time, dur, grow: glow ? 1.5 : 2.4 });
  }

  // --- Frame --------------------------------------------------------------------------------------

  resize(w: number, h: number): void {
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.fov = this.aspect < 1 ? 55 : 38;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, _time: number): void {
    const prev = this.time;
    this.time += dt;
    const t = this.time;
    if (this.waterMat) this.waterMat.uniforms.uTime.value = t;
    this.updateCamera(t);
    for (const a of this.actors) this.animate(a, t, prev);
    // projectiles
    this.projectiles = this.projectiles.filter((p) => {
      const k = (t - p.start) / p.dur;
      if (k >= 1) {
        this.scene.remove(p.mesh);
        this.puff(p.to, p.kind === 'ball' ? 0.5 : 0.25, p.kind === 'bullet' ? '#ffe9a8' : '#d8c8a8', 0.5, p.kind === 'bullet');
        return false;
      }
      const pos = p.from.clone().lerp(p.to, k);
      pos.y += Math.sin(k * Math.PI) * p.arc;
      p.mesh.position.copy(pos);
      const next = p.from.clone().lerp(p.to, Math.min(1, k + 0.02));
      next.y += Math.sin(Math.min(1, k + 0.02) * Math.PI) * p.arc;
      p.mesh.lookAt(next);
      return true;
    });
    this.puffs = this.puffs.filter((p) => {
      const k = (t - p.start) / p.dur;
      if (k >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        return false;
      }
      p.mesh.scale.setScalar((0.3 + k * p.grow) * (p.mesh.userData.base ?? (p.mesh.userData.base = p.mesh.scale.x)));
      (p.mesh.material as MeshBasicMaterial).opacity = 0.8 * (1 - k);
      return true;
    });
    for (const b of this.beats) {
      if (!b.done && t >= b.at) {
        b.done = true;
        const side = b.kind === 'hitAtk' ? -1 : 1;
        const group = this.actors.filter((a) => a.side === side);
        const c = new Vector3();
        group.forEach((a) => c.add(a.pos));
        if (group.length) c.divideScalar(group.length);
        c.y += 2.2;
        if (b.kind === 'result' && this.info.captured && this.flagCloth) (this.flagCloth.material as MeshStandardMaterial).color.set(this.info.attacker.color);
        this.onBeat?.(b.kind, c);
      }
    }
    if (this.flagCloth) {
      const pos = this.flagCloth.geometry.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k) + 0.45;
        pos.setZ(k, Math.sin(t * 6 - x * 6) * 0.08 * x);
      }
      pos.needsUpdate = true;
    }
  }

  private animate(a: Actor, t: number, prev: number): void {
    const i = this.info;
    const melee = !i.ranged;
    let x = a.home.x;
    const z = a.home.z;
    let y = a.home.y;
    let walk = 0;
    // the charge
    if (melee && a.side === -1 && a.kind !== 'air') {
      const k = smooth(clamp01((t - 1.3) / 1.4));
      // close the gap to the defenders' front line, keeping formation
      const reach = (i.city ? 4.4 : 4.6) - (a.kind === 'rider' || a.kind === 'machine' ? 0.6 : 0);
      x = a.home.x + k * reach * (a.kind === 'ship' ? 0.55 : 1);
      walk = t > 1.3 && t < 2.7 ? 1 : 0;
      if (t > 4.8 && !i.defender.lost && a.fallAt < 0) {
        const back = smooth(clamp01((t - 4.8) / 1.2));
        x += -back * 1.2;
        walk = t < 6 ? 1 : 0;
      }
    }
    if (melee && a.side === 1 && !i.city && a.kind === 'foot' && !a.ranged) {
      const k = smooth(clamp01((t - 2.1) / 0.6));
      x = a.home.x - k * 0.9;
      walk = t > 2.1 && t < 2.7 ? 1 : 0;
    }
    // a beaten defender who survives falls back
    if (a.side === 1 && !i.defender.lost && t > 4.6 && a.fallAt < 0 && a.kind === 'foot' && melee) x += smooth(clamp01((t - 4.6) / 1.2)) * 0.8;
    if (a.kind === 'air') {
      x = a.home.x + Math.sin(t * 0.8 + a.phase) * 0.6 + (a.side === -1 ? smooth(clamp01((t - 1) / 3)) * 4 : 0);
      y = a.home.y + Math.sin(t * 1.6 + a.phase) * 0.25;
    }
    if (a.kind === 'ship') y = -0.05 + Math.sin(t * 1.4 + a.phase) * 0.06;
    if (a.kind === 'rider' && walk) y += Math.abs(Math.sin(t * 9 + a.phase)) * 0.18;
    if (a.kind !== 'air' && a.kind !== 'ship') y = this.heightAt(x, z) + (y - a.home.y > 0 ? y - this.heightAt(x, z) : 0);
    // shots and blows
    for (const s of a.shootAt) if (prev < s && t >= s && (a.fallAt < 0 || t < a.fallAt)) this.shoot(a, t);
    let swing = 0;
    for (const s of a.strikeAt) {
      const k = (t - s) / 0.35;
      if (k >= 0 && k <= 1) swing = Math.sin(k * Math.PI);
      if (prev < s + 0.17 && t >= s + 0.17 && (a.fallAt < 0 || t < a.fallAt)) {
        const tip = a.pos.clone().add(new Vector3(-a.side * 0.9, 0.9, 0));
        this.puff(tip, 0.16, '#fff3b0', 0.25, true);
      }
    }
    let flash = 0;
    let recoil = 0;
    for (const h of a.hitAt) {
      const k = (t - h) / 0.4;
      if (k >= 0 && k <= 1) {
        flash = Math.max(flash, 1 - k);
        recoil = Math.max(recoil, Math.sin(k * Math.PI));
      }
    }
    x += a.side * recoil * 0.25;
    a.pos.set(x, y, z);
    a.root.position.copy(a.pos);
    for (const m of a.mats) m.uniforms.uFlash.value = flash * flash * 0.5;
    // falling
    let fall = 0;
    if (a.fallAt >= 0 && t > a.fallAt) fall = smooth(clamp01((t - a.fallAt) / 0.55));
    // cheering
    let cheer = 0;
    if (a.cheerAt >= 0 && t > a.cheerAt && a.fallAt < 0) cheer = 1;
    const ph = t * 10 + a.phase;
    if (a.kind === 'foot' || a.kind === 'rider') {
      a.root.rotation.set(0, a.facing, 0);
      if (fall > 0) {
        a.root.rotation.z = a.side * fall * 1.45;
        a.root.position.y -= fall * 0.15;
      }
      if (cheer) a.root.position.y += Math.abs(Math.sin((t - a.cheerAt) * 7 + a.phase)) * 0.4;
    } else if (a.kind === 'machine') {
      a.root.rotation.set(0, a.facing, 0);
      const firing = a.shootAt.some((s) => t >= s && t < s + 0.25);
      if (firing) a.root.position.x += a.side * 0.12;
      if (fall > 0) {
        a.root.rotation.z = a.side * fall * 0.35;
        if (fall > 0.2 && (a.root.userData.smoke ?? 0) < t - 0.2) {
          a.root.userData.smoke = t;
          this.puff(a.pos.clone().add(new Vector3(0, 0.8, 0)), 0.4, '#555555', 1.2, false);
        }
      }
    } else if (a.kind === 'ship' && fall > 0) {
      a.root.rotation.z = a.side * fall * 0.4;
      a.root.position.y -= fall * 0.8;
    } else if (a.kind === 'air' && fall > 0) {
      a.root.position.y -= fall * 3.3;
      a.root.rotation.z = fall * 1.2;
    }
    const r = a.rig;
    if (!r) return;
    const breathe = Math.sin(t * 2.4 + a.phase);
    r.head.rotation.x = 0.05 + breathe * 0.03;
    if (walk) {
      r.legL.rotation.x = Math.sin(ph) * 0.7;
      r.legR.rotation.x = -Math.sin(ph) * 0.7;
      r.armL.rotation.x = -Math.sin(ph) * 0.5 - 0.3;
      r.armR.rotation.x = Math.sin(ph) * 0.5 - 0.6;
    } else {
      r.legL.rotation.x = 0.1;
      r.legR.rotation.x = -0.1;
      r.armL.rotation.x = -0.65 + breathe * 0.04;
      r.armR.rotation.x = -0.45 + breathe * 0.04;
    }
    if (a.ranged && a.shootAt.length && t > 1.2 && t < 4.4) {
      // aim
      r.armR.rotation.x = -1.35;
      r.armL.rotation.x = -1.45;
    }
    if (swing) r.armR.rotation.x = -2.6 + swing * 2.9;
    if (cheer) {
      r.armR.rotation.x = -2.8 + Math.sin(t * 9) * 0.2;
      r.armL.rotation.x = -2.6;
    }
    if (fall > 0) {
      r.armL.rotation.x = -1.6 * fall;
      r.armR.rotation.x = -1.4 * fall;
    }
  }

  private updateCamera(t: number): void {
    const cam = this.camera;
    const i = this.info;
    const big = this.actors.some((a) => a.side === -1 && (a.kind === 'rider' || a.kind === 'machine'));
    const far = i.water ? 1.6 : big ? 1.35 : 1;
    const wide = this.aspect < 1 ? 1.5 : 1;
    // four shots: behind the attackers, a dolly along the line, the clash, the aftermath
    const shots: { at: number; pos: [number, number, number]; look: [number, number, number] }[] = [
      { at: 0, pos: [-9.5, 3.6, 6.5], look: [1.5, 0.9, 0] },
      { at: 1.6, pos: [-5.5, 2.4, 6.2], look: [0.5, 1.0, 0] },
      { at: 2.8, pos: [-1.2, 1.7, 5.4], look: [0.6, 1.1, 0] },
      { at: 4.2, pos: [1.6, 1.9, 6.0], look: [0.2, 1.0, 0] },
      { at: 5.4, pos: [0, 3.4, 9.5], look: [0, 0.8, 0] },
      { at: 9, pos: [0, 3.8, 10.5], look: [0, 0.8, 0] },
    ];
    let k = 0;
    while (k < shots.length - 2 && t > shots[k + 1].at) k++;
    const a = shots[k];
    const b = shots[k + 1];
    const f = smooth(clamp01((t - a.at) / (b.at - a.at)));
    const p = new Vector3(...a.pos).lerp(new Vector3(...b.pos), f);
    const l = new Vector3(...a.look).lerp(new Vector3(...b.look), f);
    p.sub(l).multiplyScalar(far * wide).add(l);
    // a little handheld drift
    p.x += Math.sin(t * 0.7) * 0.08;
    p.y += Math.sin(t * 0.9) * 0.05;
    cam.position.copy(p);
    cam.lookAt(l);
    this.shotStart.copy(p);
  }

  /** Jumps to the end: the outcome is already decided. */
  skip(): void {
    const end = this.length;
    while (this.time < end) this.update(0.05, 0);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        const m = o.material as MeshStandardMaterial | MeshStandardMaterial[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}

