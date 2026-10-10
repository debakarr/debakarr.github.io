// Units on the map: each unit is a little squad (soldiers, riders, a war
// machine with its crew, a ship or an aircraft) in its owner's colours. All
// squads of one type are a single instanced mesh. Idle breathing and the
// walking hop run in the vertex shader; marches, lunges, flinches and falls
// are animated here from the game's move and combat events.

import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RGBADepthPacking,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { UNIT } from '../data/units';
import type { Overlay } from '../render/view';
import type { Game } from '../sim/game';
import { HEX_GLSL } from './hexgl';
import type { Map3D } from './map3d';
import { lookSpec, SKIN_TONES } from './looks';
import { bakeLook, RIG_GLSL, type AnimState, type BakedLook } from './rig';
import { LAND_Y, tileHash, type Shape } from './shape';
import { depthKey, hexPatch, type SharedUniforms } from './terrain';

const BASE_SCALE = 2.0;
const SKINS = SKIN_TONES.map(([r, g, b]) => new Color(r, g, b));
const HEX = 32;

interface Slot {
  unitId: number;
  type: string;
  civId: number;
  tile: number;
  /** resting position */
  x: number;
  y: number;
  z: number;
  rot: number;
  color: Color;
  skin: Color;
  count: number;
  embarked: boolean;
  fortified: boolean;
  mesh: string;
  index: number;
}

interface March {
  steps: number[];
  start: number;
}

interface Action {
  kind: 'lunge' | 'hit';
  unitId: number;
  dx: number;
  dz: number;
  start: number;
  dur: number;
}

interface Ghost {
  mesh: InstancedMesh;
  look: string;
  start: number;
  x: number;
  y: number;
  z: number;
  rot: number;
  dir: number;
  scale: number;
}

export class Units {
  readonly group = new Group();
  private g: Game | null = null;
  private baked = new Map<string, BakedLook>();
  private mats = new Map<string, { mat: MeshStandardMaterial; depth: MeshDepthMaterial }>();
  private meshes = new Map<string, InstancedMesh>();
  private time = 0;
  private uniforms: SharedUniforms;
  /** Shared by every look: 1 freezes the clips (strategic zoom, low quality). */
  private rigStatic = { value: 0 };
  /** Set from the stage quality. */
  lowQuality = false;
  /** Clip each unit is playing (one-shots return to idle when done). */
  private playing = new Map<number, { state: AnimState; until: number }>();
  private slots: Slot[] = [];
  private byUnit = new Map<number, Slot>();
  private byTile = new Map<number, Slot>();
  private marches = new Map<number, March>();
  private actions: Action[] = [];
  private ghosts: Ghost[] = [];
  private facing = new Map<number, number>();
  private ring: Mesh;
  private arrow: Mesh;
  private selected = -1;
  private scale = BASE_SCALE;
  private matrix = new Matrix4();
  private q = new Quaternion();
  private v = new Vector3();
  private s = new Vector3();
  private up = new Vector3(0, 1, 0);
  private zoomKey = 0;

  constructor(private shape: Shape, uniforms: SharedUniforms) {
    this.uniforms = uniforms;
    // selection: a glowing golden ring and a bobbing marker
    this.ring = new Mesh(new TorusGeometry(0.3, 0.016, 8, 40), new MeshBasicMaterial({ color: '#ffd66b', transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 6;
    this.ring.visible = false;
    const cone = new ConeGeometry(0.05, 0.09, 4);
    cone.rotateX(Math.PI);
    this.arrow = new Mesh(cone, new MeshBasicMaterial({ color: '#ffe08a' }));
    this.arrow.visible = false;
    this.group.add(this.ring, this.arrow);
    // soft contact shadows for when the squads do not cast real ones
    const disc = new CircleGeometry(0.3, 20);
    disc.rotateX(-Math.PI / 2);
    const bg = new InstancedBufferGeometry();
    bg.setAttribute('position', disc.attributes.position);
    bg.setAttribute('uv', disc.attributes.uv);
    bg.setIndex(disc.index);
    bg.setAttribute('aTile', new InstancedBufferAttribute(new Float32Array(512), 1));
    const blobMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms,
      vertexShader: `${HEX_GLSL}
        attribute float aTile;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          if ((yzFlags(texelFetch(uTiles, yzTileCoord(aTile), 0)) & 2) == 0) p *= 0.0;
          gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.35, 1.0, d)) * 0.3;
          gl_FragColor = vec4(0.05, 0.08, 0.02, a);
        }`,
    });
    this.blobs = new InstancedMesh(bg, blobMat, 512);
    this.blobs.count = 0;
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.group.add(this.blobs);
  }

  private blobs: InstancedMesh;
  private realShadows = true;

  /** Places one blob per squad (skipping aircraft, whose shadow is far below). */
  private writeBlobs(): void {
    let k = 0;
    const tiles = this.blobs.geometry.attributes.aTile as InstancedBufferAttribute;
    for (const s of this.slots) {
      if (k >= 512) break;
      if (UNIT[s.type]?.cls === 'air') continue;
      const a = this.anchor(s.unitId) ?? [s.x, s.y, s.z];
      const naval = UNIT[s.type]?.cls === 'naval' || s.embarked;
      this.q.identity();
      this.v.set(a[0], (naval ? 0.005 : a[1]) + 0.012, a[2]);
      this.s.setScalar((this.scale / BASE_SCALE) * (naval ? 1.3 : 1));
      this.matrix.compose(this.v, this.q, this.s);
      this.blobs.setMatrixAt(k, this.matrix);
      tiles.setX(k, s.tile);
      k++;
    }
    this.blobs.count = this.realShadows ? 0 : k;
    this.blobs.instanceMatrix.needsUpdate = true;
    tiles.needsUpdate = true;
  }

  /** The baked look of a type (geometry + bone texture), made on first use. */
  private look(key: string): BakedLook {
    let b = this.baked.get(key);
    if (!b) {
      const t0 = performance.now();
      b = bakeLook(lookSpec(key));
      if (import.meta.env.DEV) console.debug(`[yz] baked ${key} in ${(performance.now() - t0).toFixed(0)} ms (${b.slots} slots, ${b.geometry.attributes.position.count} verts)`);
      this.baked.set(key, b);
    }
    return b;
  }

  /** One material pair per look (they share a program; only the bone texture differs). */
  private materials(key: string): { mat: MeshStandardMaterial; depth: MeshDepthMaterial } {
    let m = this.mats.get(key);
    if (m) return m;
    const b = this.look(key);
    const uniforms = { ...this.uniforms, uBones: { value: b.bones }, uRigStatic: this.rigStatic };
    const head = `attribute float aTile;\nattribute float aPhase;\nflat varying float vTileF;\n${RIG_GLSL}`;
    const hide = `
      vTileF = aTile;
      if ((yzFlags(texelFetch(uTiles, yzTileCoord(aTile), 0)) & 2) == 0) transformed *= 0.0;`;
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
    hexPatch(mat, uniforms, {
      head,
      normal: 'mat4 yzR = yzRig(aPhase);\nobjectNormal = normalize(mat3(yzR) * objectNormal);',
      begin: `transformed = (yzR * vec4(transformed, 1.0)).xyz;${hide}`,
      team: 'skin',
    }, {});
    const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    depthKey(depth, 'units-rig-depth');
    depth.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `${HEX_GLSL}\n${head}\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed = (yzRig(aPhase) * vec4(transformed, 1.0)).xyz;${hide}`);
      shader.fragmentShader = `flat varying float vTileF;\n${shader.fragmentShader}`;
    };
    m = { mat, depth };
    this.mats.set(key, m);
    return m;
  }

  private instanced(key: string, count: number): InstancedMesh | null {
    let m = this.meshes.get(key);
    if (m && m.instanceMatrix.count < count) {
      this.group.remove(m);
      m.dispose();
      this.meshes.delete(key);
      m = undefined;
    }
    if (!m) {
      if (count === 0) return null;
      const m2 = this.newMesh(key, Math.max(8, Math.ceil(count * 1.5)));
      this.meshes.set(key, m2);
      this.group.add(m2);
      m = m2;
    }
    m.count = count;
    return m;
  }

  private newMesh(key: string, cap: number): InstancedMesh {
    const base = this.look(key).geometry;
    const geo = new InstancedBufferGeometry();
    for (const [name, attr] of Object.entries(base.attributes)) geo.setAttribute(name, attr);
    geo.setIndex(base.index);
    geo.setAttribute('aTile', new InstancedBufferAttribute(new Float32Array(cap), 1));
    geo.setAttribute('aPhase', new InstancedBufferAttribute(new Float32Array(cap), 1));
    geo.setAttribute('aAnim', new InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    geo.setAttribute('aSkin', new InstancedBufferAttribute(new Float32Array(cap * 3), 3));
    const { mat, depth } = this.materials(key);
    const m = new InstancedMesh(geo, mat, cap);
    m.setColorAt(0, new Color());
    m.castShadow = this.realShadows;
    m.receiveShadow = true;
    m.customDepthMaterial = depth;
    m.frustumCulled = false;
    return m;
  }

  /** Writes the clip a unit plays into its instance. */
  private setAnim(m: InstancedMesh, k: number, look: string, state: AnimState, start: number): void {
    const c = this.look(look).clips[state];
    (m.geometry.attributes.aAnim as InstancedBufferAttribute).setXYZW(k, c.row, c.frames, start, c.loop ? 0 : 1);
  }

  /** What a squad is doing right now. */
  private stateOf(s: Slot, moving: boolean): [AnimState, number] {
    const p = this.playing.get(s.unitId);
    if (p && p.until > this.time) return [p.state, p.until - this.look(s.mesh).clips[p.state].duration];
    if (p) this.playing.delete(s.unitId);
    return moving ? ['walk', 0] : ['idle', 0];
  }

  reset(): void {
    this.marches.clear();
    this.actions = [];
    this.playing.clear();
    for (const gh of this.ghosts) {
      this.group.remove(gh.mesh);
      gh.mesh.dispose();
    }
    this.ghosts = [];
  }

  /** Rebuilds the squads from the game state. */
  update(g: Game, _o: Overlay | null, reveal: boolean): void {
    this.g = g;
    const map = g.s.map;
    this.slots = [];
    this.byUnit.clear();
    this.byTile.clear();
    const counts = new Map<string, number>();
    const sel = this.selected;
    for (const [tile, ids] of g.unitsAt) {
      if (!ids.length) continue;
      // squads we cannot see are not drawn at all (the shader would hide them anyway)
      if (!reveal && !g.player.visible[tile]) continue;
      const units = ids.map((id) => g.s.units[id]).filter(Boolean);
      if (!units.length) continue;
      const top = units.find((u) => u.id === sel) ?? units.reduce((a, b) => (UNIT[b.type].str > UNIT[a.type].str ? b : a));
      const def = UNIT[top.type];
      const water = this.shape.isWater(tile);
      const embarked = water && def.cls !== 'naval' && def.cls !== 'air';
      let x = this.shape.cx(tile);
      let z = this.shape.cz(tile);
      if (map.cityAt[tile] >= 0) {
        x += 0.46;
        z += 0.34;
      }
      const y = water ? 0.01 : this.shape.height(tile, x, z);
      const rot = this.facing.get(top.id) ?? (tileHash(top.id, 3) - 0.5) * 0.7;
      const civ = g.civ(top.civId);
      const slot: Slot = {
        unitId: top.id, type: top.type, civId: top.civId, tile, x, y: y + (embarked ? 0.03 : 0), z, rot,
        color: new Color(civ.color), skin: SKINS[civ.id % SKINS.length], count: units.length, embarked,
        fortified: top.order?.kind === 'fortify' && top.fortified > 0 && !water, mesh: top.type, index: 0,
      };
      slot.index = counts.get(top.type) ?? 0;
      counts.set(top.type, slot.index + 1);
      this.slots.push(slot);
      this.byTile.set(tile, slot);
      for (const u of units) this.byUnit.set(u.id, slot);
    }
    const embark = this.slots.filter((s) => s.embarked);
    const forts = this.slots.filter((s) => s.fortified);
    for (const [key, m] of this.meshes) if (!counts.has(key) && key !== 'embark' && key !== 'fort') m.count = 0;
    for (const [key, n] of counts) this.instanced(key, n);
    this.instanced('embark', embark.length);
    this.instanced('fort', forts.length);
    this.writeAll();
  }

  /** Writes every instance (positions, colours, attributes). */
  private writeAll(): void {
    const now = performance.now();
    for (const s of this.slots) this.write(s, now);
    let e = 0;
    let f = 0;
    const em = this.meshes.get('embark');
    const fm = this.meshes.get('fort');
    for (const s of this.slots) {
      if (s.embarked && em) this.writeExtra(em, e++, s, -0.03);
      if (s.fortified && fm) this.writeExtra(fm, f++, s, 0);
    }
    for (const m of this.meshes.values()) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      for (const a of ['aTile', 'aPhase', 'aAnim', 'aSkin']) (m.geometry.attributes[a] as InstancedBufferAttribute).needsUpdate = true;
    }
    this.writeBlobs();
  }

  private writeExtra(m: InstancedMesh, k: number, s: Slot, dy: number): void {
    this.q.setFromAxisAngle(this.up, s.rot);
    this.v.set(s.x, s.y + dy, s.z);
    this.s.setScalar(this.scale / BASE_SCALE);
    this.matrix.compose(this.v, this.q, this.s);
    m.setMatrixAt(k, this.matrix);
    m.setColorAt(k, s.color);
    const geo = m.geometry;
    (geo.attributes.aTile as InstancedBufferAttribute).setX(k, s.tile);
    (geo.attributes.aPhase as InstancedBufferAttribute).setX(k, tileHash(s.unitId, 5));
    (geo.attributes.aSkin as InstancedBufferAttribute).setXYZ(k, s.skin.r, s.skin.g, s.skin.b);
    this.setAnim(m, k, m === this.meshes.get('fort') ? 'fort' : 'embark', 'idle', 0);
  }

  /** Writes one squad at its animated position. Returns true while it is animating. */
  private write(s: Slot, now: number): boolean {
    const m = this.meshes.get(s.mesh);
    if (!m) return false;
    let x = s.x;
    let y = s.y;
    let z = s.z;
    let rot = s.rot;
    let moving = 0;
    let animating = false;
    let tilt = 0;
    const march = this.marches.get(s.unitId);
    if (march) {
      const seg = 0.34 / Math.max(1, (march.steps.length - 1) / 3);
      const t = (now - march.start) / 1000 / seg;
      const k = Math.floor(t);
      if (k >= march.steps.length - 1) {
        this.marches.delete(s.unitId);
      } else {
        const a = march.steps[k];
        const b = march.steps[k + 1];
        const f = t - k;
        const ax = this.shape.cx(a), az = this.shape.cz(a);
        const bx = this.shape.cx(b), bz = this.shape.cz(b);
        x = ax + (bx - ax) * f;
        z = az + (bz - az) * f;
        const ay = this.shape.isWater(a) ? 0.01 : this.shape.height(a, ax, az);
        const by = this.shape.isWater(b) ? 0.01 : this.shape.height(b, bx, bz);
        y = ay + (by - ay) * f + Math.sin(f * Math.PI) * 0.04;
        rot = Math.atan2(bx - ax, bz - az);
        this.facing.set(s.unitId, rot);
        s.rot = rot;
        moving = 1;
        animating = true;
      }
    }
    for (const act of this.actions) {
      if (act.unitId !== s.unitId) continue;
      const t = (now - act.start) / act.dur;
      if (t < 0 || t > 1) continue;
      animating = true;
      if (act.kind === 'lunge') {
        const k = Math.sin(t * Math.PI) * (t < 0.5 ? 1 : 1);
        x += act.dx * 0.38 * k;
        z += act.dz * 0.38 * k;
        rot = Math.atan2(act.dx, act.dz);
        moving = 1;
      } else {
        const k = (1 - t) * Math.sin(t * 40);
        x += k * 0.035;
        tilt = k * 0.15;
      }
    }
    this.q.setFromAxisAngle(this.up, rot);
    if (tilt) this.q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), tilt));
    this.v.set(x, y, z);
    this.s.setScalar(this.scale / BASE_SCALE);
    this.matrix.compose(this.v, this.q, this.s);
    m.setMatrixAt(s.index, this.matrix);
    m.setColorAt(s.index, s.color);
    const geo = m.geometry;
    (geo.attributes.aTile as InstancedBufferAttribute).setX(s.index, s.tile);
    (geo.attributes.aPhase as InstancedBufferAttribute).setX(s.index, tileHash(s.unitId, 5));
    (geo.attributes.aSkin as InstancedBufferAttribute).setXYZ(s.index, s.skin.r, s.skin.g, s.skin.b);
    const [state, start] = this.stateOf(s, moving > 0);
    this.setAnim(m, s.index, s.mesh, state, start);
    return animating || state !== 'idle';
  }

  select(o: Overlay): void {
    if (o.selectedUnit !== this.selected) {
      this.selected = o.selectedUnit;
      // the selected unit is drawn on top of its stack
      if (this.g) this.update(this.g, o, false);
    }
  }

  tick(dt: number, time: number, zoom: number): void {
    void dt;
    this.time = time;
    // squads grow a little when zoomed out so they stay readable
    const sc = BASE_SCALE * Math.min(2.3, Math.max(1, 1.55 * Math.pow(zoom, -0.5)));
    const zk = Math.round(sc * 100);
    const still = this.lowQuality || zoom < 0.62 ? 1 : 0;
    this.rigStatic.value = still;
    // real shadows only up close; elsewhere a soft blob grounds each squad
    const real = !still && zoom >= 1.6;
    if (real !== this.realShadows) {
      this.realShadows = real;
      for (const m of this.meshes.values()) m.castShadow = real;
      this.writeBlobs();
    }
    const now = performance.now();
    if (zk !== this.zoomKey) {
      this.zoomKey = zk;
      this.scale = sc;
      this.writeAll();
    } else if (this.marches.size || this.actions.length || this.playing.size) {
      const touched = new Set<string>();
      for (const s of this.slots) {
        const busy = this.marches.has(s.unitId) || this.actions.some((a) => a.unitId === s.unitId && now - a.start < a.dur + 50) || this.playing.has(s.unitId);
        if (!busy) continue;
        this.write(s, now);
        touched.add(s.mesh);
      }
      for (const key of touched) {
        const m = this.meshes.get(key)!;
        m.instanceMatrix.needsUpdate = true;
        (m.geometry.attributes.aAnim as InstancedBufferAttribute).needsUpdate = true;
      }
      if (touched.size && !this.realShadows) this.writeBlobs();
      this.actions = this.actions.filter((a) => now - a.start < a.dur + 60);
    }
    // selection marker
    const sel = this.selected >= 0 ? this.byUnit.get(this.selected) : undefined;
    if (sel && this.g && this.g.player.visible[sel.tile]) {
      const anchor = this.anchor(this.selected)!;
      this.ring.visible = true;
      this.arrow.visible = true;
      this.ring.position.set(anchor[0], anchor[1] + 0.012, anchor[2]);
      this.ring.scale.setScalar((this.scale / BASE_SCALE) * (1 + Math.sin(time * 4) * 0.04));
      const air = UNIT[sel.type]?.cls === 'air';
      this.arrow.position.set(anchor[0], anchor[1] + (air ? 1.15 : 0.56) * (this.scale / BASE_SCALE) + Math.sin(time * 3) * 0.03, anchor[2]);
      this.arrow.rotation.y = time * 1.5;
    } else {
      this.ring.visible = false;
      this.arrow.visible = false;
    }
    // fallen squads play their death and sink away
    this.ghosts = this.ghosts.filter((gh) => {
      const t = (now - gh.start) / 1600;
      if (t >= 1) {
        this.group.remove(gh.mesh);
        gh.mesh.geometry.dispose();
        return false;
      }
      if (t < 0) return true;
      this.q.setFromAxisAngle(this.up, gh.rot);
      this.v.set(gh.x, gh.y - Math.max(0, t - 0.6) * 0.4, gh.z);
      this.s.setScalar(gh.scale / BASE_SCALE);
      this.matrix.compose(this.v, this.q, this.s);
      gh.mesh.setMatrixAt(0, this.matrix);
      gh.mesh.instanceMatrix.needsUpdate = true;
      return true;
    });
  }

  animateMove(id: number, from: number, to: number): void {
    const m = this.marches.get(id);
    if (m) {
      if (m.steps[m.steps.length - 1] !== from) m.steps.push(from);
      m.steps.push(to);
      if (m.steps.length > 10) {
        m.steps = m.steps.slice(-6);
        m.start = performance.now();
      }
    } else this.marches.set(id, { steps: [from, to], start: performance.now() });
  }

  combat(from: number, to: number, killed: boolean): void {
    const now = performance.now();
    const att = this.byTile.get(from);
    const def = this.byTile.get(to);
    const dx = this.shape.cx(to) - this.shape.cx(from);
    const dz = this.shape.cz(to) - this.shape.cz(from);
    const l = Math.hypot(dx, dz) || 1;
    if (att) {
      this.actions.push({ kind: 'lunge', unitId: att.unitId, dx: dx / l, dz: dz / l, start: now, dur: 450 });
      att.rot = Math.atan2(dx, dz);
      this.facing.set(att.unitId, att.rot);
      this.play(att, 'attack', 0);
    }
    if (def) {
      if (killed) this.spawnGhost(def, dx / l);
      else this.play(def, 'hit', 0.25);
    }
  }

  /** Starts a one-shot clip on a squad (after `delay` seconds). */
  private play(s: Slot, state: AnimState, delay: number): void {
    const c = this.look(s.mesh).clips[state];
    this.playing.set(s.unitId, { state, until: this.time + delay + c.duration });
    this.write(s, performance.now());
    const m = this.meshes.get(s.mesh);
    if (m) {
      m.instanceMatrix.needsUpdate = true;
      (m.geometry.attributes.aAnim as InstancedBufferAttribute).needsUpdate = true;
    }
  }

  private spawnGhost(s: Slot, dir: number): void {
    void dir;
    const mesh = this.newMesh(s.mesh, 1);
    mesh.count = 1;
    mesh.setColorAt(0, s.color);
    const geo = mesh.geometry;
    (geo.attributes.aTile as InstancedBufferAttribute).setX(0, s.tile);
    (geo.attributes.aSkin as InstancedBufferAttribute).setXYZ(0, s.skin.r, s.skin.g, s.skin.b);
    this.setAnim(mesh, 0, s.mesh, 'death', this.time + 0.2);
    this.q.setFromAxisAngle(this.up, s.rot);
    this.matrix.compose(this.v.set(s.x, s.y, s.z), this.q, this.s.setScalar(this.scale / BASE_SCALE));
    mesh.setMatrixAt(0, this.matrix);
    this.group.add(mesh);
    this.ghosts.push({ mesh, look: s.mesh, start: performance.now(), x: s.x, y: s.y, z: s.z, rot: s.rot, dir: 1, scale: this.scale });
  }

  /** The world position of a unit's squad (animated). */
  anchor(id: number): [number, number, number] | null {
    const s = this.byUnit.get(id);
    if (!s) return null;
    const m = this.meshes.get(s.mesh);
    if (!m) return [s.x, s.y, s.z];
    m.getMatrixAt(s.index, this.matrix);
    return [this.matrix.elements[12], this.matrix.elements[13], this.matrix.elements[14]];
  }

  /** Stack sizes above one (for the count badges). */
  stacks(): { tile: number; count: number; unitId: number }[] {
    return this.slots.filter((s) => s.count > 1).map((s) => ({ tile: s.tile, count: s.count, unitId: s.unitId }));
  }

  /** The tile of the squad under a screen point, if any. */
  pick(view: Map3D, sx: number, sy: number): number {
    const g = this.g;
    if (!g) return -1;
    let best = -1;
    let bestD = Infinity;
    const r = Math.max(16, 0.2 * this.scale * HEX * view.cam.zoom);
    for (const s of this.slots) {
      if (!g.player.visible[s.tile]) continue;
      const a = this.anchor(s.unitId) ?? [s.x, s.y, s.z];
      const air = UNIT[s.type]?.cls === 'air';
      const [px, py] = view.project(a[0], a[1] + (air ? 0.7 : 0.16) * (this.scale / BASE_SCALE), a[2]);
      const d = Math.hypot(px - sx, (py - sy) * 0.8);
      if (d < r && d < bestD) {
        bestD = d;
        best = s.tile;
      }
    }
    return best;
  }

  /** Footprints along a planned route, ending in an arrow (red for an attack). */
  pathMesh(shape: Shape, tiles: number[], attack: boolean): Object3D | null {
    if (tiles.length < 2) return null;
    const group = new Group();
    const pts: [number, number][] = tiles.map((t) => [shape.cx(t), shape.cz(t)]);
    const color = attack ? '#ff5a48' : '#fff6dc';
    const dotGeo = new CylinderGeometry(0.045, 0.045, 0.012, 10);
    const dots: [number, number][] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k];
      const [bx, bz] = pts[k + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 0.2));
      for (let j = k === 0 ? 1 : 0; j < n; j++) dots.push([ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n]);
    }
    const inst = new InstancedMesh(dotGeo, new MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false }), dots.length);
    const m = new Matrix4();
    dots.forEach(([x, z], k) => {
      const t = shape.grid.pick(x, z, 1);
      const y = (t >= 0 && !shape.isWater(t) ? shape.height(t, x, z) : LAND_Y - 0.1) + 0.03;
      m.makeTranslation(x, Math.max(y, 0.03), z);
      inst.setMatrixAt(k, m);
    });
    inst.renderOrder = 7;
    group.add(inst);
    const [ex, ez] = pts[pts.length - 1];
    const [px, pz] = pts[pts.length - 2];
    const head = new Mesh(new ConeGeometry(0.11, 0.2, 4), new MeshBasicMaterial({ color, depthWrite: false, transparent: true, opacity: 0.95 }));
    const end = tiles[tiles.length - 1];
    const ey = (shape.isWater(end) ? 0 : shape.height(end, ex, ez)) + 0.06;
    head.position.set(ex - (ex - px) * 0.18, ey, ez - (ez - pz) * 0.18);
    head.rotation.order = 'YXZ';
    head.rotation.y = Math.atan2(ex - px, ez - pz);
    head.rotation.x = Math.PI / 2;
    head.renderOrder = 7;
    group.add(head);
    return group;
  }

  dispose(): void {
    this.reset();
    for (const m of this.meshes.values()) m.dispose();
    for (const b of this.baked.values()) {
      b.geometry.dispose();
      b.bones.dispose();
    }
    for (const { mat, depth } of this.mats.values()) {
      mat.dispose();
      depth.dispose();
    }
  }
}
