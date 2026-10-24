// Everything you can press E on: orb buds (herbs and crystals that ripen
// into Lumi orbs), creature tracks, signs, notes, rangers' caches and the
// campfire. (The quest puzzles that used to stand in the vale are gone, and
// the paths they blocked are open.)
//
// Targeting is a short-range cone in front of the player and the camera, so
// it works the same in first and third person. Each interactable's state
// lives in GameState.done / flags, so a save restores the world.

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
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
import { INTERACTABLES, type InteractDef } from '../data/world';
import type { Audio } from '../engine/audio';
import { cone, cylinder, ellipsoid, gradient, lumpy, merge, prep, rockGeo, teardrop, xf } from '../engine/geometry';
import type { CollisionWorld } from '../engine/physics';
import { canvas, plankTexture, rockTexture, runeTexture, stoneTexture } from '../engine/textures';
import type { GameState } from '../systems/state';
import type { Fx } from './fx';
import type { Terrain } from './terrain';

export interface InteractHost {
  state: GameState;
  audio: Audio;
  fx: Fx;
  /** Adds Lumi orbs (from chests and orb buds), with a little pop of light at `at`. */
  giveOrbs(n: number, at: Vector3): void;
  toast(msg: string, kind?: 'info' | 'good' | 'quest' | 'warn'): void;
  showNote(title: string, text: string): void;
  openRest(): void;
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

/** Kinds that still exist in the vale (the puzzle pieces left with the quests). */
const KEPT = new Set<InteractDef['kind']>(['pickup', 'track', 'sign', 'note', 'chest', 'rest']);

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
  private time = 0;

  constructor(private terrain: Terrain, private physics: CollisionWorld, private host: InteractHost) {
    this.mats = {
      stone: new MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9, color: '#e0dccf' }),
      wood: new MeshStandardMaterial({ map: plankTexture(), roughness: 0.8 }),
      vc: new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
      gold: new MeshStandardMaterial({ color: '#f2c35a', metalness: 0.7, roughness: 0.3 }),
      rock: new MeshStandardMaterial({ map: rockTexture(), vertexColors: true, roughness: 0.95 }),
    };
    for (const def of INTERACTABLES) if (KEPT.has(def.kind)) this.build(def);
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
    for (const e of this.entries) {
      const d = e.def;
      const done = this.done(d.id);
      switch (d.kind) {
        case 'pickup':
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
      }
    }
  }

  /** Whether an entry's model should be drawn at all (picked-up herbs are not). */
  private shouldShow(e: Entry): boolean {
    const d = e.def;
    const s = this.host.state;
    switch (d.kind) {
      case 'pickup':
        if (this.done(d.id)) return false;
        return !e.extra.hidden || !!s.flags[`seen:${d.id}`];
      case 'note':
        return !this.done(d.id) || d.id === 'note-ruins';
      default:
        return true;
    }
  }

  /** Is this interactable available to target right now? */
  available(e: Entry): boolean {
    const d = e.def;
    const s = this.host.state;
    switch (d.kind) {
      case 'pickup':
        if (this.done(d.id)) return false;
        if (e.extra.hidden && !s.flags[`seen:${d.id}`]) return false;
        return true;
      case 'note':
        return !this.done(d.id) || d.id === 'note-ruins';
      case 'chest':
        return !this.done(d.id);
      default:
        return true;
    }
  }

  /** The best interactable in front of the player, if any. */
  target(player: Vector3, aim: Vector3, firstPerson: boolean): Entry | null {
    let best: Entry | null = null;
    let bestScore = Infinity;
    for (const e of this.entries) {
      if (!e.group.visible) continue;
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
    switch (d.kind) {
      case 'pickup':
        return { verb: 'Gather', label: `orb buds (${ITEM_BY_ID[d.item!].name})` };
      case 'track':
        return { verb: 'Examine', label: d.title ?? 'tracks' };
      case 'sign':
        return { verb: 'Read', label: d.title ?? 'sign' };
      case 'note':
        return { verb: 'Read', label: d.title ?? 'note' };
      case 'chest':
        return { verb: 'Open', label: 'chest' };
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
    switch (d.kind) {
      case 'pickup': {
        mark();
        h.giveOrbs(Math.max(1, Math.min(3, d.count ?? 1)), e.focus.clone());
        h.audio.pickup();
        e.group.visible = false;
        h.playerAnim('pickup');
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
        break;
      case 'sign':
        h.audio.page();
        h.showNote(d.title ?? 'Sign', d.text ?? '');
        break;
      case 'note': {
        const item = ITEM_BY_ID[d.item!];
        if (!this.done(d.id)) {
          mark();
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
        // a ranger's cache: a handful of Lumi orbs
        h.giveOrbs(4 + Math.min(4, Math.round((d.lumens ?? 0) / 20)), e.pos.clone().add(new Vector3(0, 0.8, 0)));
        h.fx.sparkle(e.pos.clone().add(new Vector3(0, 0.8, 0)), '#ffd75a', 26);
        this.physics.setEnabled(d.id, true);
        h.playerAnim('interact');
        break;
      }
      case 'rest':
        h.openRest();
        break;
    }
  }

  update(dt: number, player: Vector3, forageCompanion: boolean, night: number): void {
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
      const far = dist > (d.kind === 'pickup' || d.kind === 'track' || d.kind === 'note' ? 60 : 120);
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
      if (d.kind === 'rest' && e.extra.flame) {
        const f = e.extra.flame as Mesh;
        f.visible = true;
        f.scale.set(1 + Math.sin(this.time * 13 + e.pos.x) * 0.1, 1 + Math.sin(this.time * 9) * 0.15, 1);
        (e.extra.light as PointLight).intensity = (2 + night * 6) * (0.85 + Math.sin(this.time * 17) * 0.15);
      }
      if (e.anim > 0) {
        e.anim += dt;
        const k = Math.min(1, e.anim / 1.2);
        const ease = k * k * (3 - 2 * k);
        switch (d.kind) {
          case 'chest':
            (e.extra.lid as Group).rotation.x = -1.9 * ease;
            break;
        }
        if (k >= 1) e.anim = 0;
      }
    }
  }
}
