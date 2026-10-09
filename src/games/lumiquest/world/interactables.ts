// Everything you can press E on: herbs and crystals, glowing tracks, signs,
// notes, chests, doors, the ability obstacles (thorns, braziers, cracked
// boulders, dry basins, hidden glyphs), the rest spot, star fragments and
// the beacon puzzle (sockets, altar, prisms and the light beam).
//
// Targeting is a short-range cone in front of the player and the camera, so
// it works the same in first and third person. Each interactable's state
// lives in GameState.done / flags / prisms, so a save restores the world.

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Rng } from '../../shared/rng';
import { ITEM_BY_ID } from '../data/items';
import { ABILITIES, type AbilityId } from '../data/species';
import { BEACON, INTERACTABLES, PRISMS, ALTAR, type InteractDef } from '../data/world';
import type { Audio } from '../engine/audio';
import { cone, cylinder, ellipsoid, gradient, lumpy, merge, prep, rockGeo, teardrop, torus, xf } from '../engine/geometry';
import type { CollisionWorld } from '../engine/physics';
import { canvas, plankTexture, rockTexture, runeTexture, stoneTexture } from '../engine/textures';
import type { GameState } from '../systems/state';
import type { Fx } from './fx';
import { clearings } from './nature';
import type { Terrain } from './terrain';

export interface InteractHost {
  state: GameState;
  audio: Audio;
  fx: Fx;
  give(item: string, n: number): void;
  take(item: string, n: number): boolean;
  addLumens(n: number): void;
  toast(msg: string, kind?: 'info' | 'good' | 'quest' | 'warn'): void;
  showNote(title: string, text: string): void;
  openRest(): void;
  /** Ability of the active companion if it is out, else null. */
  ability(): AbilityId | null;
  companionName(): string;
  companionPerform(at: Vector3): void;
  checkQuests(): void;
  beaconRestored(): void;
  startQuest(id: string): void;
  playerPos: Vector3;
  playerAnim(clip: string): void;
}

export interface Entry {
  def: InteractDef;
  group: Group;
  pos: Vector3;
  /** Point the cone targets (centre of the object). */
  focus: Vector3;
  range: number;
  visible: boolean;
  anim: number;
  extra: Record<string, unknown>;
}

const ABILITY_FOR: Partial<Record<InteractDef['kind'], AbilityId>> = { thorns: 'ember', brazier: 'ember', cracked: 'quake', basin: 'tide' };

function pawTexture(): CanvasTexture {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(64, 78, 26, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [x, y] of [[34, 44], [52, 30], [76, 30], [94, 44]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 11, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function signTexture(): CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  const t = new CanvasTexture(c);
  ctx.fillStyle = '#c99a62';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = 'rgba(80,50,25,0.5)';
  for (let y = 10; y < 128; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + 4);
    ctx.stroke();
  }
  ctx.fillStyle = '#4a2e18';
  ctx.font = '700 36px Nunito, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('→  ↑  ←', 128, 78);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class Interactables {
  readonly group = new Group();
  readonly entries: Entry[] = [];
  private byId = new Map<string, Entry>();
  private mats: Record<string, Material> = {};
  private beam: Mesh[] = [];
  private beamMat: MeshBasicMaterial;
  private time = 0;
  /** Beacon restoration animation 0..1. */
  beaconGlow = 0;
  private beaconParts: { crystal: Mesh; beam: Mesh; light: PointLight; ring: Mesh; top: Vector3 } | null = null;

  constructor(private terrain: Terrain, private physics: CollisionWorld, private host: InteractHost) {
    this.beamMat = new MeshBasicMaterial({ color: '#bff4ff', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false });
    this.mats = {
      stone: new MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9, color: '#e0dccf' }),
      wood: new MeshStandardMaterial({ map: plankTexture(), roughness: 0.8 }),
      vc: new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
      gold: new MeshStandardMaterial({ color: '#f2c35a', metalness: 0.7, roughness: 0.3 }),
      rock: new MeshStandardMaterial({ map: rockTexture(), vertexColors: true, roughness: 0.95 }),
    };
    for (let i = 0; i < 4; i++) {
      const m = new Mesh(new CylinderGeometry(0.09, 0.09, 1, 8, 1, true), this.beamMat);
      m.visible = false;
      this.group.add(m);
      this.beam.push(m);
    }
    for (const def of INTERACTABLES) this.build(def);
  }

  attachBeacon(parts: { crystal: Mesh; beam: Mesh; light: PointLight; ring: Mesh; top: Vector3 }): void {
    this.beaconParts = parts;
  }

  get(id: string): Entry | undefined {
    return this.byId.get(id);
  }

  private done(id: string): boolean {
    return this.host.state.done[id] !== undefined;
  }

  private add(g: Group, geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0, cast = true): Mesh {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }

  private glowMat(color: string, intensity = 1): MeshStandardMaterial {
    return new MeshStandardMaterial({ color, emissive: new Color(color), emissiveIntensity: intensity, roughness: 0.3 });
  }

  private build(def: InteractDef): void {
    const g = new Group();
    const [x, z] = def.at;
    const y = this.terrain.height(x, z) + (def.y ?? 0);
    g.position.set(x, y, z);
    g.rotation.y = def.rot ?? 0;
    const e: Entry = { def, group: g, pos: new Vector3(x, y, z), focus: new Vector3(x, y + 0.5, z), range: 2.6, visible: true, anim: 0, extra: {} };
    const add = (geo: BufferGeometry, mat: Material, px = 0, py = 0, pz = 0, cast = true) => this.add(g, geo, mat, px, py, pz, cast);
    switch (def.kind) {
      case 'pickup': {
        const item = def.item!;
        if (item === 'crystal') {
          const c = add(new OctahedronGeometry(0.28, 0), this.glowMat('#8ff0ff', 1.6), 0, 0.9, 0, false);
          c.scale.set(0.8, 1.4, 0.8);
          add(prep(lumpy(new SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.05, 4, 3), '#7a7a8a'), this.mats.vc, 0, 0, 0);
          e.extra.spin = c;
          e.focus.y += 0.4;
        } else if (item === 'sunberry') {
          add(gradient(lumpy(new SphereGeometry(0.42, 10, 8), 0.07, 3, 2), '#2f7a34', '#6fbf4a'), this.mats.vc, 0, 0.35, 0);
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2;
            add(new SphereGeometry(0.07, 8, 6), this.glowMat('#ff5a3a', 0.35), Math.cos(a) * 0.36, 0.45 + (k % 2) * 0.12, Math.sin(a) * 0.36, false);
          }
        } else if (item === 'kelp') {
          for (let k = 0; k < 5; k++) add(prep(xf(teardrop(0.06, 0.7, 6, 1.2), { s: [1, 1, 0.3], r: [0.2 * (k - 2), (k / 5) * 3, 0] }), '#3fa86a'), this.mats.vc, (k - 2) * 0.06, 0, 0);
        } else if (item === 'crunchroot') {
          add(prep(xf(cone(0.08, 0.3, 8), { r: [Math.PI, 0, 0] }), '#ff8a2a'), this.mats.vc, 0, 0.12, 0);
          for (let k = 0; k < 4; k++) add(prep(xf(teardrop(0.04, 0.35, 6, 1.4), { s: [1, 1, 0.4], r: [0.3, (k / 4) * Math.PI * 2, 0] }), '#4fa83a'), this.mats.vc, 0, 0.25, 0);
        } else if (item === 'cloudpuff') {
          add(cylinder(0.012, 0.015, 0.5, 5), this.mats.vc, 0, 0.25, 0, false);
          add(prep(lumpy(new SphereGeometry(0.18, 12, 10), 0.03, 10, 3), '#ffffff'), new MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: new Color('#ffffff'), emissiveIntensity: 0.15 }), 0, 0.55, 0);
        } else if (item === 'glowcap') {
          add(prep(xf(cylinder(0.05, 0.07, 0.25, 8), { p: [0, 0.12, 0] }), '#f6efe2'), this.mats.vc);
          add(new SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.glowMat('#7fe8ff', 1.1), 0, 0.24, 0, false);
        } else if (item === 'honeyblossom') {
          add(cylinder(0.015, 0.02, 0.45, 5), this.mats.vc, 0, 0.22, 0, false);
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            add(prep(xf(ellipsoid(0.12, 0.03, 0.07), { r: [0, -a, 0.3] }), '#ff8fc0'), this.mats.vc, Math.cos(a) * 0.1, 0.48, Math.sin(a) * 0.1, false);
          }
          add(new SphereGeometry(0.05, 8, 6), this.glowMat('#ffd75a', 0.5), 0, 0.5, 0, false);
        }
        e.range = 2.4;
        if (def.hidden) e.extra.hidden = true;
        break;
      }
      case 'star': {
        const s = add(new OctahedronGeometry(0.18, 0), this.glowMat('#ffd75a', 2), 0, 0.8, 0, false);
        e.extra.spin = s;
        e.focus.y += 0.3;
        break;
      }
      case 'track': {
        const mat = new MeshBasicMaterial({ map: pawTexture(), color: '#9ff4ff', transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending });
        for (let k = 0; k < 5; k++) {
          const p = add(new PlaneGeometry(0.32, 0.32), mat, (k % 2 ? 0.2 : -0.2), 0.04 + k * 0.004, -k * 0.65, false);
          p.rotation.x = -Math.PI / 2;
          p.position.y = this.terrain.height(x + Math.sin(def.rot ?? 0) * -k * 0.65, z + Math.cos(def.rot ?? 0) * -k * 0.65) - y + 0.05;
        }
        e.extra.mat = mat;
        e.focus.y = y + 0.2;
        e.range = 3;
        break;
      }
      case 'sign': {
        add(cylinder(0.08, 0.1, 2.0, 8), this.mats.wood, 0, 1.0, 0);
        const board = add(new RoundedBoxGeometry(1.4, 0.55, 0.08, 2, 0.04), new MeshStandardMaterial({ map: signTexture(), roughness: 0.8 }), 0, 1.6, 0.06);
        void board;
        this.physics.add({ kind: 'cyl', x, z, r: 0.18, y0: y - 1, y1: y + 2, walkable: false });
        e.focus.y = y + 1.4;
        e.range = 3;
        break;
      }
      case 'note': {
        if (def.id === 'note-grotto') {
          add(prep(xf(cylinder(0.08, 0.1, 0.32, 10), { r: [0, 0, Math.PI / 2] }), '#7fd0b0'), new MeshStandardMaterial({ vertexColors: true, roughness: 0.1, transparent: true, opacity: 0.75 }), 0, 0.1, 0);
        } else if (def.id === 'note-ruins') {
          add(new RoundedBoxGeometry(0.9, 1.2, 0.2, 2, 0.06), this.mats.stone, 0, 0.6, 0);
          const r = add(new PlaneGeometry(0.7, 0.9), new MeshBasicMaterial({ map: runeTexture(), color: '#8fe8ff', transparent: true, blending: AdditiveBlending, depthWrite: false }), 0, 0.65, 0.11, false);
          void r;
          this.physics.add({ kind: 'cyl', x, z, r: 0.5, y0: y - 1, y1: y + 1.2, walkable: false });
        } else {
          add(new BoxGeometry(0.32, 0.03, 0.42), new MeshStandardMaterial({ color: '#f4ead2', roughness: 0.9 }), 0, 0.02, 0, false);
        }
        e.range = 2.4;
        break;
      }
      case 'chest': {
        const base = add(new RoundedBoxGeometry(0.9, 0.5, 0.6, 2, 0.06), this.mats.wood, 0, 0.25, 0);
        void base;
        add(new BoxGeometry(0.94, 0.07, 0.64), this.mats.gold, 0, 0.42, 0, false);
        const lid = new Group();
        lid.position.set(0, 0.5, -0.3);
        const lidMesh = new Mesh(new CylinderGeometry(0.3, 0.3, 0.9, 12, 1, false, 0, Math.PI), this.mats.wood);
        lidMesh.rotation.z = Math.PI / 2;
        lidMesh.rotation.x = Math.PI / 2;
        lidMesh.position.set(0, 0, 0.3);
        lidMesh.scale.set(1, 1, 0.55);
        lidMesh.castShadow = true;
        lid.add(lidMesh);
        g.add(lid);
        add(new BoxGeometry(0.12, 0.16, 0.05), this.mats.gold, 0, 0.45, 0.31, false);
        e.extra.lid = lid;
        this.physics.add({ kind: 'box', x, z, hx: 0.48, hz: 0.33, rot: def.rot ?? 0, y0: y - 1, y1: y + 0.62, id: def.id });
        break;
      }
      case 'thorns': {
        const rng = new Rng(x * 13 + z);
        const parts: BufferGeometry[] = [];
        for (let k = 0; k < 9; k++) {
          const a = rng.next() * Math.PI * 2;
          parts.push(xf(torus(0.7 + rng.next() * 0.5, 0.09, 6, 16, Math.PI * 1.3), { r: [rng.float(-1, 1), a, rng.float(-0.6, 0.6)], p: [Math.cos(a) * 0.4, 0.6 + rng.next() * 0.6, Math.sin(a) * 0.4] }));
          for (let t = 0; t < 4; t++) parts.push(xf(cone(0.05, 0.22, 4), { r: [rng.next() * 3, rng.next() * 3, rng.next() * 3], p: [rng.float(-1, 1), rng.float(0.3, 1.5), rng.float(-1, 1)] }));
        }
        const mesh = add(gradient(merge(parts), '#3a2a3a', '#6a5a3a'), this.mats.vc, 0, 0, 0);
        mesh.scale.set(1.5, 1.2, 1.5);
        e.extra.mesh = mesh;
        this.physics.add({ kind: 'cyl', x, z, r: 1.7, y0: y - 1, y1: y + 2, walkable: false, id: def.id });
        e.range = 3.6;
        e.focus.y = y + 0.9;
        clearings.push({ x, z, r: 2.5 });
        break;
      }
      case 'brazier': {
        add(cylinder(0.3, 0.4, 1.1, 10), this.mats.stone, 0, 0.55, 0);
        add(new SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this.mats.stone, 0, 1.45, 0).rotation.x = Math.PI;
        const flame = add(prep(xf(teardrop(0.3, 0.9, 10, 1.6), {}), '#ffb04a'), new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }), 0, 1.3, 0, false);
        flame.visible = false;
        const light = new PointLight('#ff9a4a', 0, 10, 1.8);
        light.position.set(0, 1.9, 0);
        g.add(light);
        e.extra.flame = flame;
        e.extra.light = light;
        this.physics.add({ kind: 'cyl', x, z, r: 0.55, y0: y - 1, y1: y + 1.5, walkable: false });
        e.focus.y = y + 1.3;
        e.range = 3;
        clearings.push({ x, z, r: 1.5 });
        break;
      }
      case 'cracked': {
        const geo = gradient(xf(rockGeo(Math.round(x * 7 + z), 2), { s: [1.5, 1.35, 1.5] }), '#7a756e', '#c8c0b2', { moss: '#6fae4a', mossAmount: 0.5 });
        const rock = add(geo, this.mats.rock, 0, 0.9, 0);
        // glowing cracks: earth creatures can feel them
        const crack = add(new PlaneGeometry(1.2, 1.4), new MeshBasicMaterial({ map: runeTexture(), color: '#ffb05a', transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }), 0, 1.0, 1.25, false);
        e.extra.mesh = rock;
        e.extra.crack = crack;
        this.physics.add({ kind: 'cyl', x, z, r: 1.6, y0: y - 1, y1: y + 2.2, walkable: false, id: def.id });
        e.range = 3.6;
        e.focus.y = y + 1;
        clearings.push({ x, z, r: 2.4 });
        break;
      }
      case 'basin': {
        add(cylinder(1.1, 1.0, 0.7, 18), this.mats.stone, 0, 0.35, 0);
        const water = add(new CylinderGeometry(0.92, 0.92, 0.06, 18), new MeshStandardMaterial({ color: '#4fb8e8', roughness: 0.05, transparent: true, opacity: 0.85, emissive: new Color('#1f7fb8'), emissiveIntensity: 0.3 }), 0, 0.12, 0, false);
        water.visible = false;
        add(new SphereGeometry(0.22, 10, 8), this.glowMat('#5fd0ff', 0.4), 0, 0.85, 0, false);
        e.extra.water = water;
        this.physics.add({ kind: 'cyl', x, z, r: 1.1, y0: y - 1, y1: y + 0.72 });
        e.range = 3;
        e.focus.y = y + 0.7;
        clearings.push({ x, z, r: 2 });
        break;
      }
      case 'glyph': {
        const mat = new MeshBasicMaterial({ map: runeTexture(), color: '#ffe98a', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
        const p = add(new PlaneGeometry(2.4, 2.4), mat, 0, 0, 0, false);
        p.rotation.y = 0.3;
        e.extra.mat = mat;
        e.focus.y = y;
        e.range = 4;
        break;
      }
      case 'door': {
        const slab = def.id === 'door-lodge'
          ? add(new RoundedBoxGeometry(1.4, 2.2, 0.12, 2, 0.04), this.mats.wood, 0.7, 1.1, 0)
          : add(new RoundedBoxGeometry(def.id === 'door-water' ? 2.4 : 2.3, 3.0, 0.4, 2, 0.08), this.mats.stone, 0, 1.5, 0);
        if (def.id !== 'door-lodge') add(new PlaneGeometry(1.6, 2.0), new MeshBasicMaterial({ map: runeTexture(), color: '#8fe8ff', transparent: true, blending: AdditiveBlending, depthWrite: false }), 0, 1.55, 0.21, false);
        if (def.id === 'door-lodge') {
          // hinge on the left edge
          const hinge = new Group();
          g.add(hinge);
          hinge.position.set(-0.7, 0, 0);
          slab.position.set(0.7, 1.1, 0);
          hinge.add(slab);
          e.extra.hinge = hinge;
        }
        e.extra.slab = slab;
        const rot = def.rot ?? 0;
        this.physics.add({ kind: 'box', x, z, hx: def.id === 'door-lodge' ? 0.75 : 1.2, hz: 0.25, rot, y0: y - 1, y1: y + 3, walkable: false, id: def.id });
        e.range = 3;
        e.focus.y = y + 1.2;
        break;
      }
      case 'socket': {
        const crystals: Mesh[] = [];
        e.extra.crystals = crystals;
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          add(cylinder(0.22, 0.28, 0.9, 10), this.mats.stone, Math.cos(a) * 0.8, 0.45, Math.sin(a) * 0.8);
          const c = add(new OctahedronGeometry(0.22, 0), this.glowMat('#8ff0ff', 1.6), Math.cos(a) * 0.8, 1.15, Math.sin(a) * 0.8, false);
          c.scale.set(0.8, 1.4, 0.8);
          c.visible = false;
          crystals.push(c);
        }
        e.range = 3;
        e.focus.y = y + 0.9;
        this.physics.add({ kind: 'cyl', x, z, r: 1.2, y0: y - 1, y1: y + 0.95 });
        break;
      }
      case 'altar': {
        add(cylinder(0.9, 1.1, 0.5, 16), this.mats.stone, 0, 0.25, 0);
        add(cylinder(0.45, 0.6, 1.0, 12), this.mats.stone, 0, 0.9, 0);
        const ringMat = new MeshStandardMaterial({ color: '#5fd0ff', emissive: new Color('#3fb8ff'), emissiveIntensity: 0.15 });
        const ring = add(torus(0.42, 0.05, 6, 24), ringMat, 0, 1.45, 0, false);
        ring.rotation.x = Math.PI / 2;
        const orb = add(new SphereGeometry(0.22, 16, 12), new MeshStandardMaterial({ color: '#9fb0c8', emissive: new Color('#bff4ff'), emissiveIntensity: 0.05, roughness: 0.2 }), 0, 1.65, 0, false);
        e.extra.ringMat = ringMat;
        e.extra.orb = orb;
        this.physics.add({ kind: 'cyl', x, z, r: 1.0, y0: y - 1, y1: y + 1.4, walkable: false });
        e.range = 3;
        e.focus.y = y + 1.4;
        break;
      }
      case 'prism': {
        add(cylinder(0.55, 0.7, 0.8, 12), this.mats.stone, 0, 0.4, 0);
        const head = new Group();
        head.position.set(0, 1.35, 0);
        g.add(head);
        const crystal = new Mesh(new OctahedronGeometry(0.45, 0), new MeshStandardMaterial({ color: '#cfefff', emissive: new Color('#7fd8ff'), emissiveIntensity: 0.4, roughness: 0.1, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.9 }));
        crystal.scale.set(0.7, 1.1, 0.7);
        head.add(crystal);
        // arrow showing the facing
        const arrow = new Mesh(cone(0.14, 0.45, 4), this.mats.gold);
        arrow.rotation.x = -Math.PI / 2;
        arrow.position.set(0, -0.35, -0.55);
        head.add(arrow);
        const frame = new Mesh(torus(0.6, 0.04, 6, 24), this.mats.gold);
        head.add(frame);
        e.extra.head = head;
        e.extra.crystal = crystal;
        this.physics.add({ kind: 'cyl', x, z, r: 0.7, y0: y - 1, y1: y + 1.8, walkable: false });
        e.range = 3;
        e.focus.y = y + 1.3;
        break;
      }
      case 'rest': {
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          add(prep(xf(cylinder(0.08, 0.1, 0.9, 6), { r: [0, a, 1.2] }), '#6a4630'), this.mats.vc, Math.cos(a) * 0.25, 0.25, Math.sin(a) * 0.25);
        }
        const rng = new Rng(3);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          add(gradient(xf(rockGeo(k + 3, 0), { s: 0.18 }), '#6f6a66', '#a8a29a'), this.mats.vc, Math.cos(a) * 0.75, 0.05, Math.sin(a) * 0.75 + rng.next() * 0.02);
        }
        const flame = add(prep(xf(teardrop(0.28, 0.8, 10, 1.6), {}), '#ffb04a'), new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }), 0, 0.25, 0, false);
        const light = new PointLight('#ff9a4a', 4, 12, 1.8);
        light.position.set(0, 1.2, 0);
        g.add(light);
        e.extra.flame = flame;
        e.extra.light = light;
        this.physics.add({ kind: 'cyl', x, z, r: 0.85, y0: y - 1, y1: y + 0.4, walkable: false });
        e.range = 3.2;
        e.focus.y = y + 0.4;
        break;
      }
    }
    this.mergeStatic(g, e);
    this.group.add(g);
    this.entries.push(e);
    this.byId.set(def.id, e);
  }

  /** Merges an entry's static parts by material (animated parts stay separate). */
  private mergeStatic(g: Group, e: Entry): void {
    const keep = new Set<unknown>(Object.values(e.extra));
    const groups = new Map<Material, Mesh[]>();
    for (const child of [...g.children]) {
      const m = child as Mesh;
      if (!m.isMesh || keep.has(m) || Array.isArray(m.material)) continue;
      const list = groups.get(m.material as Material) ?? [];
      list.push(m);
      groups.set(m.material as Material, list);
    }
    for (const [mat, list] of groups) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        return prep(m.geometry.clone()).applyMatrix4(m.matrix);
      });
      const merged = merge(geos);
      const mesh = new Mesh(merged, mat);
      mesh.castShadow = list.some((m) => m.castShadow);
      mesh.receiveShadow = true;
      for (const m of list) m.removeFromParent();
      g.add(mesh);
    }
  }

  /** Applies saved state to visuals and colliders (after load or new game). */
  sync(): void {
    const s = this.host.state;
    for (const e of this.entries) {
      const d = e.def;
      const done = this.done(d.id);
      switch (d.kind) {
        case 'pickup':
        case 'star':
        case 'note':
          e.visible = !done || d.kind === 'note';
          if (d.kind === 'note') e.visible = true;
          e.group.visible = d.kind === 'note' ? !done || d.id === 'note-ruins' : !done;
          break;
        case 'track':
          (e.extra.mat as MeshBasicMaterial).opacity = done ? 0.25 : 0.9;
          break;
        case 'chest':
          (e.extra.lid as Group).rotation.x = done ? -1.9 : 0;
          break;
        case 'thorns':
        case 'cracked':
          e.group.visible = !done;
          this.physics.setEnabled(d.id, !done);
          break;
        case 'brazier':
          (e.extra.flame as Mesh).visible = done;
          (e.extra.light as PointLight).intensity = done ? 6 : 0;
          break;
        case 'basin':
          (e.extra.water as Mesh).visible = done;
          if (done) (e.extra.water as Mesh).position.y = 0.6;
          break;
        case 'door': {
          const open = done;
          if (e.extra.hinge) (e.extra.hinge as Group).rotation.y = open ? -1.6 : 0;
          else (e.extra.slab as Mesh).position.y = open ? -1.6 : 1.5;
          this.physics.setEnabled(d.id, !open);
          break;
        }
        case 'socket':
          (e.extra.crystals as Mesh[]).forEach((c, i) => (c.visible = (s.flags.crystalsPlaced ?? 0) > i));
          break;
        case 'altar':
          (e.extra.ringMat as MeshStandardMaterial).emissiveIntensity = s.flags.altarLit ? 1.6 : 0.15;
          ((e.extra.orb as Mesh).material as MeshStandardMaterial).emissiveIntensity = s.flags.altarLit ? 1.6 : 0.05;
          break;
        case 'prism': {
          const i = PRISMS.findIndex((p) => p.id === d.id);
          (e.extra.head as Group).rotation.y = -s.prisms[i] * (Math.PI / 4);
          break;
        }
        case 'glyph':
          (e.extra.mat as MeshBasicMaterial).opacity = done ? 0.9 : 0;
          break;
      }
    }
    this.beaconGlow = s.flags.beaconLit ? 1 : 0;
    this.updateBeam();
  }

  /** Whether an entry's model should be drawn at all (picked-up herbs are not). */
  private shouldShow(e: Entry): boolean {
    const d = e.def;
    const s = this.host.state;
    switch (d.kind) {
      case 'pickup':
        if (this.done(d.id)) return false;
        return !e.extra.hidden || !!s.flags[`seen:${d.id}`];
      case 'star':
        return !this.done(d.id);
      case 'note':
        return !this.done(d.id) || d.id === 'note-ruins';
      case 'thorns':
      case 'cracked':
        return !this.done(d.id);
      default:
        return true;
    }
  }

  /** Is this interactable available to target right now? */
  available(e: Entry): boolean {
    const d = e.def;
    const s = this.host.state;
    if (d.blockedBy && !this.done(d.blockedBy)) return false;
    switch (d.kind) {
      case 'pickup':
      case 'star':
        if (this.done(d.id)) return false;
        if (e.extra.hidden && !s.flags[`seen:${d.id}`]) return false;
        return true;
      case 'note':
        return !this.done(d.id) || d.id === 'note-ruins';
      case 'chest':
        return !this.done(d.id);
      case 'thorns':
      case 'cracked':
        return !this.done(d.id);
      case 'brazier':
      case 'basin':
        return !this.done(d.id);
      case 'glyph':
        return (e.extra.mat as MeshBasicMaterial).opacity > 0.3;
      case 'door':
        // mechanism doors open from their mechanism, not by hand
        return d.id === 'door-lodge';
      case 'socket':
        return (s.flags.crystalsPlaced ?? 0) < 3;
      case 'altar':
        return !s.flags.altarLit;
      case 'prism':
        return !s.flags.beaconLit;
      default:
        return true;
    }
  }

  /** The best interactable in front of the player, if any. */
  target(player: Vector3, aim: Vector3, firstPerson: boolean): Entry | null {
    let best: Entry | null = null;
    let bestScore = Infinity;
    for (const e of this.entries) {
      if (!e.group.visible && e.def.kind !== 'glyph') continue;
      const dx = e.focus.x - player.x;
      const dz = e.focus.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > e.range + 0.5) continue;
      if (Math.abs(e.focus.y - (player.y + 1)) > 3) continue;
      if (!this.available(e)) continue;
      const dot = d > 0.01 ? (dx * aim.x + dz * aim.z) / (d * Math.hypot(aim.x, aim.z)) : 1;
      if (dot < (firstPerson ? 0.75 : 0.2) && d > 1.2) continue;
      const score = d * (2 - dot);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  /** The prompt shown for a targeted interactable. */
  prompt(e: Entry): { verb: string; label: string; blocked?: string } {
    const d = e.def;
    const s = this.host.state;
    const ab = this.host.ability();
    const name = this.host.companionName();
    const need = ABILITY_FOR[d.kind];
    if (need) {
      const ability = ABILITIES[need];
      const verbs: Record<AbilityId, string> = { ember: d.kind === 'brazier' ? 'light the brazier' : 'burn the thorns', quake: 'shatter the boulder', tide: 'fill the basin', glide: '', glow: '', forage: '' };
      if (ab === need) return { verb: 'Ask', label: `${name} to ${verbs[need]}` };
      return { verb: '', label: d.title ?? '', blocked: `Needs a ${ability.element} companion (${ability.name})` };
    }
    switch (d.kind) {
      case 'pickup':
      case 'star':
        return { verb: 'Pick up', label: ITEM_BY_ID[d.kind === 'star' ? 'starshard' : d.item!].name };
      case 'track':
        return { verb: 'Examine', label: d.title ?? 'tracks' };
      case 'sign':
        return { verb: 'Read', label: d.title ?? 'sign' };
      case 'note':
        return { verb: 'Read', label: d.title ?? 'note' };
      case 'chest':
        return { verb: 'Open', label: 'chest' };
      case 'door':
        return { verb: this.done(d.id) ? 'Close' : 'Open', label: d.title ?? 'door' };
      case 'glyph':
        return { verb: 'Read', label: 'the glowing glyphs' };
      case 'socket': {
        const have = s.inventory.crystal ?? 0;
        if (have < 3 - (s.flags.crystalsPlaced ?? 0)) return { verb: '', label: 'Beacon heart sockets', blocked: `Needs 3 luminous crystals (you have ${have})` };
        return { verb: 'Place', label: 'the luminous crystals' };
      }
      case 'altar': {
        if ((s.flags.crystalsPlaced ?? 0) < 3) return { verb: '', label: 'Resonance altar', blocked: 'The altar is cold. The beacon needs its crystals first.' };
        if (!ab) return { verb: '', label: 'Resonance altar', blocked: 'Call your companion (R) to channel its power' };
        return { verb: 'Ask', label: `${name} to awaken the altar` };
      }
      case 'prism':
        return { verb: 'Turn', label: 'the light prism' };
      case 'rest':
        return { verb: 'Rest', label: 'by the campfire' };
      default:
        return { verb: 'Use', label: d.title ?? '' };
    }
  }

  /** Performs the interaction. */
  interact(e: Entry): void {
    const d = e.def;
    const h = this.host;
    const s = h.state;
    const mark = () => {
      s.done[d.id] = s.clock;
    };
    const need = ABILITY_FOR[d.kind];
    if (need) {
      if (h.ability() !== need) {
        h.audio.fail();
        h.toast(this.prompt(e).blocked ?? 'Nothing happens.', 'warn');
        return;
      }
      h.companionPerform(e.focus);
      mark();
      e.anim = 0.001;
      if (need === 'ember') {
        h.audio.fire();
        h.fx.fire(e.focus.clone(), 50, d.kind === 'thorns' ? 1.6 : 0.6);
        if (d.kind === 'brazier') {
          (e.extra.flame as Mesh).visible = true;
          (e.extra.light as PointLight).intensity = 6;
          h.toast('The brazier roars to life.', 'good');
          this.checkMechanism(d);
        } else h.toast(`${h.companionName()} burned away the thorns!`, 'good');
      } else if (need === 'quake') {
        h.audio.quake();
        h.fx.debris(e.pos.clone());
        h.fx.ring(e.pos.clone().add(new Vector3(0, 0.2, 0)), '#ffcf8a', 5);
        h.toast(`${h.companionName()} shattered the boulder!`, 'good');
      } else if (need === 'tide') {
        h.audio.water();
        h.fx.splash(e.focus.clone().add(new Vector3(0, 0.4, 0)), 40);
        (e.extra.water as Mesh).visible = true;
        h.toast(`${h.companionName()} filled the basin with water.`, 'good');
        this.checkMechanism(d);
      }
      h.checkQuests();
      return;
    }
    switch (d.kind) {
      case 'pickup': {
        mark();
        h.give(d.item!, d.count ?? 1);
        h.audio.pickup();
        h.fx.sparkle(e.focus.clone(), d.item === 'crystal' ? '#8ff0ff' : '#fff6c8', 18);
        e.group.visible = false;
        h.playerAnim('interact');
        h.checkQuests();
        break;
      }
      case 'star': {
        mark();
        h.give('starshard', 1);
        h.audio.coin();
        h.fx.sparkle(e.focus.clone(), '#ffd75a', 30);
        e.group.visible = false;
        h.startQuest('stars');
        h.checkQuests();
        break;
      }
      case 'track':
        if (!this.done(d.id)) {
          mark();
          (e.extra.mat as MeshBasicMaterial).opacity = 0.25;
          h.fx.sparkle(e.focus.clone(), '#9ff4ff', 14);
        }
        h.audio.page();
        h.playerAnim('observe');
        h.showNote(d.title ?? 'Tracks', d.text ?? '');
        h.checkQuests();
        break;
      case 'sign':
        h.audio.page();
        h.showNote(d.title ?? 'Sign', d.text ?? '');
        break;
      case 'note': {
        const item = ITEM_BY_ID[d.item!];
        if (!this.done(d.id)) {
          mark();
          h.give(d.item!, 1);
          if (d.id !== 'note-ruins') e.group.visible = false;
        }
        h.audio.page();
        h.showNote(item.name, item.description);
        break;
      }
      case 'chest': {
        mark();
        h.audio.chest();
        e.anim = 0.001;
        if (d.item) h.give(d.item, d.count ?? 1);
        if (d.lumens) h.addLumens(d.lumens);
        h.fx.sparkle(e.pos.clone().add(new Vector3(0, 0.8, 0)), '#ffd75a', 26);
        this.physics.setEnabled(d.id, true);
        h.playerAnim('interact');
        h.checkQuests();
        break;
      }
      case 'door': {
        if (this.done(d.id)) delete s.done[d.id];
        else mark();
        h.audio.door();
        e.anim = 0.001;
        this.physics.setEnabled(d.id, !this.done(d.id));
        h.playerAnim('interact');
        break;
      }
      case 'glyph': {
        if (!this.done(d.id)) {
          mark();
          h.give(d.item!, 1);
          h.audio.glow();
          h.fx.sparkle(e.focus.clone(), '#ffe98a', 30, 1.4);
        }
        const item = ITEM_BY_ID[d.item!];
        h.showNote(item.name, item.description);
        h.checkQuests();
        break;
      }
      case 'socket': {
        const need3 = 3 - (s.flags.crystalsPlaced ?? 0);
        if (!h.take('crystal', need3)) {
          h.audio.fail();
          h.toast(`You need ${need3} luminous crystals.`, 'warn');
          return;
        }
        s.flags.crystalsPlaced = 3;
        (e.extra.crystals as Mesh[]).forEach((c) => (c.visible = true));
        h.audio.glow();
        h.fx.sparkle(e.focus.clone().add(new Vector3(0, 0.4, 0)), '#8ff0ff', 40, 1.2);
        h.toast('The crystals hum in their sockets. The altar below the hill stirs.', 'good');
        h.playerAnim('interact');
        h.checkQuests();
        break;
      }
      case 'altar': {
        if ((s.flags.crystalsPlaced ?? 0) < 3 || !h.ability()) {
          h.audio.fail();
          h.toast(this.prompt(e).blocked ?? '', 'warn');
          return;
        }
        s.flags.altarLit = 1;
        h.companionPerform(e.focus);
        h.audio.glow();
        h.fx.ring(e.focus.clone(), '#bff4ff', 4);
        h.fx.sparkle(e.focus.clone(), '#bff4ff', 40, 1.2);
        (e.extra.ringMat as MeshStandardMaterial).emissiveIntensity = 1.6;
        ((e.extra.orb as Mesh).material as MeshStandardMaterial).emissiveIntensity = 1.6;
        h.toast('A beam of light leaps from the altar. Turn the prisms to guide it.', 'good');
        this.updateBeam();
        h.checkQuests();
        break;
      }
      case 'prism': {
        const i = PRISMS.findIndex((p) => p.id === d.id);
        s.prisms[i] = (s.prisms[i] + 1) % 8;
        e.anim = 0.001;
        e.extra.from = (e.extra.head as Group).rotation.y;
        h.audio.click();
        h.playerAnim('interact');
        const solved = this.updateBeam();
        if (solved && s.flags.altarLit && !s.flags.beaconLit) {
          s.flags.beaconLit = 1;
          h.beaconRestored();
        }
        h.checkQuests();
        break;
      }
      case 'rest':
        h.openRest();
        break;
    }
  }

  private checkMechanism(d: InteractDef): void {
    if (!d.opens) return;
    const parts = this.entries.filter((x) => x.def.opens === d.opens);
    if (parts.every((x) => this.done(x.def.id))) {
      const door = this.byId.get(d.opens);
      if (door && !this.done(door.def.id)) {
        this.host.state.done[door.def.id] = this.host.state.clock;
        door.anim = 0.001;
        this.physics.setEnabled(door.def.id, false);
        this.host.audio.door();
        this.host.toast(`The ${door.def.title?.toLowerCase() ?? 'door'} grinds open!`, 'good');
      }
    } else if (parts.length > 1) {
      const left = parts.filter((x) => !this.done(x.def.id)).length;
      this.host.toast(`${left} more to go…`, 'info');
    }
  }

  /** Traces the light beam from the altar; returns true when it reaches the beacon. */
  updateBeam(): boolean {
    const s = this.host.state;
    for (const b of this.beam) b.visible = false;
    if (!s.flags.altarLit) return false;
    const pts: Vector3[] = [];
    const yAt = (p: readonly [number, number]) => this.terrain.height(p[0], p[1]) + 1.55;
    let pos = new Vector3(ALTAR.at[0], yAt(ALTAR.at), ALTAR.at[1]);
    pts.push(pos.clone());
    let dirIdx = 0;
    const visited = new Set<number>();
    let solved = false;
    for (let hop = 0; hop < 4; hop++) {
      const dir = new Vector3(Math.sin(dirIdx * (Math.PI / 4)), 0, -Math.cos(dirIdx * (Math.PI / 4)));
      let hit: { kind: 'prism' | 'beacon'; i: number; p: Vector3; d: number } | null = null;
      const consider = (kind: 'prism' | 'beacon', i: number, at: readonly [number, number], y: number) => {
        const v = new Vector3(at[0] - pos.x, 0, at[1] - pos.z);
        const d = v.length();
        if (d < 0.5 || d > 40) return;
        if (v.normalize().dot(dir) < 0.998) return;
        if (!hit || d < hit.d) hit = { kind, i, p: new Vector3(at[0], y, at[1]), d };
      };
      PRISMS.forEach((p, i) => {
        if (!visited.has(i)) consider('prism', i, p.at, yAt(p.at) - 0.2);
      });
      consider('beacon', -1, BEACON.at, this.terrain.height(BEACON.at[0], BEACON.at[1]) + 2.2);
      const h = hit as { kind: 'prism' | 'beacon'; i: number; p: Vector3; d: number } | null;
      if (!h) {
        pts.push(pos.clone().addScaledVector(dir, 10));
        break;
      }
      pts.push(h.p.clone());
      if (h.kind === 'beacon') {
        solved = true;
        break;
      }
      visited.add(h.i);
      pos = h.p.clone();
      dirIdx = s.prisms[h.i];
    }
    for (let i = 0; i < pts.length - 1 && i < this.beam.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const m = this.beam[i];
      const len = a.distanceTo(b);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.set(1, len, 1);
      m.lookAt(b);
      m.rotateX(Math.PI / 2);
      m.visible = true;
    }
    return solved;
  }

  update(dt: number, player: Vector3, glowCompanion: Vector3 | null, forageCompanion: boolean, night: number): void {
    this.time += dt;
    const s = this.host.state;
    for (const e of this.entries) {
      const d = e.def;
      // respawning herbs
      if (d.kind === 'pickup' && d.respawn && this.done(d.id) && s.clock - s.done[d.id] >= d.respawn) {
        delete s.done[d.id];
        e.group.visible = true;
      }
      const dist = Math.hypot(player.x - e.pos.x, player.z - e.pos.z);
      // small things are not drawn far away
      const far = dist > (d.kind === 'pickup' || d.kind === 'track' || d.kind === 'star' || d.kind === 'note' ? 60 : 120);
      e.group.userData.far = far;
      if (far && e.anim === 0) {
        if (e.group.visible && !e.group.userData.hiddenFar) {
          e.group.userData.hiddenFar = true;
          e.group.visible = false;
        }
        continue;
      }
      if (e.group.userData.hiddenFar) {
        e.group.userData.hiddenFar = false;
        e.group.visible = this.shouldShow(e);
      }
      if (e.extra.spin) {
        const m = e.extra.spin as Mesh;
        m.rotation.y += dt * 1.2;
        m.position.y = 0.9 + Math.sin(this.time * 2 + e.pos.x) * 0.08;
      }
      if (e.extra.hidden) {
        // a foraging companion sniffs out hidden herbs
        const seen = !!s.flags[`seen:${d.id}`];
        if (!seen && forageCompanion && dist < 16) {
          s.flags[`seen:${d.id}`] = 1;
          this.host.fx.sparkle(e.focus.clone(), '#9fff9a', 20);
          this.host.toast('Your companion sniffed out a hidden herb!', 'good');
        }
        e.group.visible = (seen || !!s.flags[`seen:${d.id}`]) && !this.done(d.id);
      }
      if (d.kind === 'track' && !this.done(d.id)) (e.extra.mat as MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(this.time * 3);
      if (d.kind === 'glyph') {
        const m = e.extra.mat as MeshBasicMaterial;
        const lit = this.done(d.id) || (!!glowCompanion && glowCompanion.distanceTo(e.pos) < 9);
        m.opacity += ((lit ? 0.9 : 0) - m.opacity) * Math.min(1, dt * 2);
      }
      if ((d.kind === 'brazier' || d.kind === 'rest') && e.extra.flame) {
        const f = e.extra.flame as Mesh;
        const lit = d.kind === 'rest' || this.done(d.id);
        f.visible = lit;
        if (lit) {
          f.scale.set(1 + Math.sin(this.time * 13 + e.pos.x) * 0.1, 1 + Math.sin(this.time * 9) * 0.15, 1);
          (e.extra.light as PointLight).intensity = (d.kind === 'rest' ? 2 + night * 6 : 6) * (0.85 + Math.sin(this.time * 17) * 0.15);
        }
      }
      if (e.anim > 0) {
        e.anim += dt;
        const k = Math.min(1, e.anim / 1.2);
        const ease = k * k * (3 - 2 * k);
        switch (d.kind) {
          case 'chest':
            (e.extra.lid as Group).rotation.x = -1.9 * ease;
            break;
          case 'thorns':
            (e.extra.mesh as Mesh).scale.setScalar(1.5 * (1 - ease) + 0.01);
            if (k >= 1) {
              e.group.visible = false;
              this.physics.setEnabled(d.id, false);
            }
            break;
          case 'cracked':
            (e.extra.mesh as Mesh).scale.setScalar(Math.max(0.01, 1 - ease * 1.2));
            (e.extra.mesh as Mesh).position.y = 0.9 - ease * 0.8;
            if (k >= 0.3) this.physics.setEnabled(d.id, false);
            if (k >= 1) e.group.visible = false;
            break;
          case 'basin':
            (e.extra.water as Mesh).position.y = 0.12 + 0.48 * ease;
            break;
          case 'door': {
            const open = this.done(d.id);
            if (e.extra.hinge) (e.extra.hinge as Group).rotation.y = open ? -1.6 * ease : -1.6 * (1 - ease);
            else (e.extra.slab as Mesh).position.y = 1.5 - 3.1 * ease;
            break;
          }
          case 'prism': {
            const i = PRISMS.findIndex((p) => p.id === d.id);
            const to = -s.prisms[i] * (Math.PI / 4);
            const from = e.extra.from as number;
            let delta = to - from;
            while (delta > 0) delta -= Math.PI * 2;
            while (delta < -Math.PI * 2 + 0.01) delta += Math.PI * 2;
            if (delta < -Math.PI) delta += Math.PI * 2;
            (e.extra.head as Group).rotation.y = from + delta * Math.min(1, e.anim / 0.35);
            if (e.anim > 0.35) e.anim = 0;
            break;
          }
        }
        if (k >= 1 && d.kind !== 'prism') e.anim = 0;
      }
    }
    // beacon light
    const bp = this.beaconParts;
    if (bp) {
      const target = s.flags.beaconLit ? 1 : 0;
      this.beaconGlow += (target - this.beaconGlow) * Math.min(1, dt * 0.6);
      const g = this.beaconGlow;
      (bp.crystal.material as MeshStandardMaterial).emissiveIntensity = g * (2.2 + Math.sin(this.time * 2) * 0.3);
      (bp.crystal.material as MeshStandardMaterial).color.setRGB(0.5 + 0.5 * g, 0.55 + 0.45 * g, 0.66 + 0.34 * g);
      bp.crystal.rotation.y += dt * (0.2 + g);
      (bp.beam.material as MeshBasicMaterial).opacity = g * (0.16 + 0.12 * night);
      (bp.ring.material as MeshBasicMaterial).opacity = g * 0.6;
      bp.ring.rotation.z += dt * 0.5;
      bp.light.intensity = g * (30 + night * 60);
    }
    // beam shimmer
    this.beamMat.opacity = 0.65 + Math.sin(this.time * 6) * 0.2;
  }
}
