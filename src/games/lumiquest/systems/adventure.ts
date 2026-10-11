// The adventure layer over exploring and bonding:
//
// - Star Notes: 24 glowing notes on the vale's peaks and beside its landmarks,
//   each marked by a faint beam you can see from afar. Each one plays the next
//   note of the vale's song; finding them all plays it whole.
// - Gloom wisps drift in at night, in the cave and around the ruins. They
//   circle, flare red (the tell) and lunge. Roll away (dodge) as they lunge for
//   a slow-motion perfect dodge; push them back with a Light pulse, hardest
//   right after a lunge or a perfect dodge. Your companion strikes them too.
// - Light is your health: wisps take it, quiet time restores it; run out and
//   you wake at the outpost a few lumens lighter.
// - Ranger levels: notes and purified wisps give experience; each level adds
//   Light and widens the pulse.
//
// Everything persistent lives in GameState.flags, so older saves load as is.

import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three';
import { meshGrid, VoxelGrid } from '../../shared/chibi/voxel';
import { CAVE, LOCATIONS, OUTPOST, PLAY_HALF, PLAYER_START, RUINS, WATER_LEVEL, type V2 } from '../data/world';
import type { Audio } from '../engine/audio';
import type { CollisionWorld } from '../engine/physics';
import type { Player } from '../entities/player';
import type { Fx } from '../world/fx';
import type { Terrain } from '../world/terrain';
import type { GameState } from './state';

export interface AdventureHost {
  scene: Scene;
  terrain: Terrain;
  physics: CollisionWorld;
  fx: Fx;
  audio: Audio;
  player: Player;
  state: () => GameState;
  hud: HTMLElement;
  toast: (msg: string, kind?: 'info' | 'good' | 'quest' | 'warn') => void;
  /** Companion position when it is out, and its accent colour. */
  companion: () => { pos: Vector3; color: string } | null;
  isCave: (x: number, z: number) => boolean;
}

const NOTE_COUNT = 24;
const LEVELS = [0, 60, 150, 280, 450, 680, 960, 1300, 1700, 2200];

interface Note {
  i: number;
  at: Vector3;
  root: Group;
  beam: Mesh;
}

type WispState = 'drift' | 'windup' | 'lunge' | 'recover' | 'stunned' | 'fade';

interface Wisp {
  root: Group;
  body: Mesh;
  pos: Vector3;
  vel: Vector3;
  hp: number;
  state: WispState;
  t: number;
  orbit: number;
  lungeDir: Vector3;
  /** Set when the player dodged this lunge in time. */
  dodged: boolean;
  hitThisLunge: boolean;
}

const tmp = new Vector3();

export class Adventure {
  private notes: Note[] = [];
  private wisps: Wisp[] = [];
  private noteGeo: BufferGeometry;
  private wispGeo: BufferGeometry;
  private noteMat = new MeshStandardMaterial({ vertexColors: true, emissive: new Color('#ffd66a'), emissiveIntensity: 0.9, roughness: 0.4 });
  private beamMat = new MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false });
  private wispMat = new MeshStandardMaterial({ vertexColors: true, emissive: new Color('#7a3cff'), emissiveIntensity: 0.6, roughness: 0.6 });
  private group = new Group();
  private spawnIn = 4;
  private pulseCd = 0;
  private compCd = 2;
  private quiet = 0;
  /** Seconds of slow motion left after a perfect dodge. */
  private slow = 0;
  /** Seconds the next pulse is empowered after a perfect dodge. */
  private empowered = 0;
  light = 5;
  private hud: HTMLElement;
  private time = 0;

  constructor(private h: AdventureHost) {
    h.scene.add(this.group);
    this.noteGeo = noteGeometry();
    this.wispGeo = wispGeometry();
    this.hud = document.createElement('div');
    this.hud.className = 'lq-adv';
    h.hud.append(this.hud);
    this.placeNotes();
    this.light = this.maxLight;
    this.renderHud();
  }

  // --- progression ------------------------------------------------------------------------------

  private get flags(): Record<string, number> {
    return this.h.state().flags;
  }

  get xp(): number {
    return this.flags.rangerXp ?? 0;
  }

  get level(): number {
    let l = 1;
    for (let k = 1; k < LEVELS.length; k++) if (this.xp >= LEVELS[k]) l = k + 1;
    return l;
  }

  get maxLight(): number {
    return Math.min(9, 4 + this.level);
  }

  private get pulseRadius(): number {
    return 4 + this.level * 0.25;
  }

  private gainXp(n: number): void {
    const before = this.level;
    this.flags.rangerXp = this.xp + n;
    if (this.level > before) {
      this.light = this.maxLight;
      this.h.audio.levelUp();
      this.h.fx.sparkle(this.h.player.pos.clone().setY(this.h.player.pos.y + 1), '#ffe08a', 40, 1.4);
      this.h.toast(`Ranger level ${this.level}! Your Light grows and your pulse reaches further.`, 'good');
    }
  }

  get notesFound(): number {
    let n = 0;
    for (let i = 0; i < NOTE_COUNT; i++) if (this.flags[`note:${i}`]) n++;
    return n;
  }

  /** Time scale for the whole simulation (slow motion after a perfect dodge). */
  get timeScale(): number {
    return this.slow > 0 ? 0.35 : 1;
  }

  // --- Star Notes -------------------------------------------------------------------------------

  /** Peaks and landmark high points, spread out, inside the vale and out of the water. */
  private placeNotes(): void {
    const T = this.h.terrain;
    // away from the boundary ridges, and no higher than a walker can reach
    const lim = PLAY_HALF - 24;
    const spots: V2[] = [];
    const ok = (x: number, z: number) =>
      Math.abs(x) < lim && Math.abs(z) < lim && T.height(x, z) > WATER_LEVEL + 0.6 && T.height(x, z) < 18 && !this.h.isCave(x, z) && Math.hypot(x - OUTPOST.at[0], z - OUTPOST.at[1]) > 14;
    const far = (x: number, z: number, d: number) => spots.every(([a, b]) => Math.hypot(a - x, b - z) > d);
    const highest = (cx: number, cz: number, r: number): V2 => {
      let best: V2 = [cx, cz];
      let bh = -Infinity;
      for (let a = 0; a < 16; a++)
        for (const k of [0.4, 0.75, 1]) {
          const x = cx + Math.cos((a / 16) * Math.PI * 2) * r * k;
          const z = cz + Math.sin((a / 16) * Math.PI * 2) * r * k;
          if (!ok(x, z)) continue;
          const y = T.height(x, z);
          if (y > bh) {
            bh = y;
            best = [x, z];
          }
        }
      return best;
    };
    // one by each landmark (its highest ground)
    for (const l of LOCATIONS) {
      if (l.kind === 'cave') continue;
      const [x, z] = highest(l.at[0], l.at[1], l.radius + 6);
      if (ok(x, z) && far(x, z, 18)) spots.push([x, z]);
    }
    // then the most prominent hilltops
    const cands: { x: number; z: number; p: number }[] = [];
    for (let x = -lim; x <= lim; x += 9)
      for (let z = -lim; z <= lim; z += 9) {
        if (!ok(x, z)) continue;
        const y = T.height(x, z);
        let ring = 0;
        for (let a = 0; a < 8; a++) ring += T.height(x + Math.cos(a * 0.785) * 12, z + Math.sin(a * 0.785) * 12);
        cands.push({ x, z, p: y - ring / 8 + y * 0.15 });
      }
    cands.sort((a, b) => b.p - a.p);
    for (const c of cands) {
      if (spots.length >= NOTE_COUNT) break;
      if (far(c.x, c.z, 26)) spots.push([c.x, c.z]);
    }
    for (const c of cands) {
      if (spots.length >= NOTE_COUNT) break;
      if (far(c.x, c.z, 14)) spots.push([c.x, c.z]);
    }
    spots.slice(0, NOTE_COUNT).forEach(([x, z], i) => {
      const at = new Vector3(x, this.h.physics.ground(x, z, 999) + 1.5, z);
      const root = new Group();
      root.position.copy(at);
      const star = new Mesh(this.noteGeo, this.noteMat);
      root.add(star);
      const beam = new Mesh(new CylinderGeometry(0.25, 0.25, 40, 8, 1, true), this.beamMat);
      beam.position.y = 20;
      root.add(beam);
      this.group.add(root);
      this.notes.push({ i, at, root, beam });
    });
    this.syncNotes();
  }

  private syncNotes(): void {
    for (const n of this.notes) n.root.visible = !this.flags[`note:${n.i}`];
  }

  private updateNotes(dt: number): void {
    const p = this.h.player.pos;
    for (const n of this.notes) {
      if (!n.root.visible) continue;
      n.root.children[0].rotation.y += dt * 1.6;
      n.root.children[0].position.y = Math.sin(this.time * 2 + n.i) * 0.15;
      const d = Math.hypot(n.at.x - p.x, n.at.z - p.z);
      // beams fade in the distance and vanish up close
      n.beam.visible = d > 6 && d < 140;
      if (Math.abs(n.at.y - (p.y + 0.9)) < 1.8 && d < 1.4) this.collect(n);
    }
  }

  private collect(n: Note): void {
    this.flags[`note:${n.i}`] = 1;
    n.root.visible = false;
    const found = this.notesFound;
    this.h.audio.starNote(found - 1);
    this.h.fx.sparkle(n.at, '#ffe08a', 36, 1.2);
    this.h.fx.ring(n.at, '#ffe08a', 3, 0.8);
    const st = this.h.state();
    st.lumens += 5;
    this.gainXp(25);
    if (found >= NOTE_COUNT) {
      st.lumens += 200;
      this.flags.songComplete = 1;
      setTimeout(() => this.h.audio.song(), 900);
      this.h.toast('Every Star Note found. The vale sings its whole song for you! +200 lumens', 'quest');
    } else this.h.toast(`Star Note ${found} of ${NOTE_COUNT}. The vale's song grows.`, 'good');
    this.renderHud();
  }

  /** Uncollected notes (for the map). */
  get openNotes(): Vector3[] {
    return this.notes.filter((n) => n.root.visible).map((n) => n.at);
  }

  // --- gloom wisps ------------------------------------------------------------------------------

  private gloomy(hour: number): boolean {
    const p = this.h.player.pos;
    const night = hour >= 20 || hour < 5;
    const ruins = Math.hypot(p.x - RUINS.at[0], p.z - RUINS.at[1]) < RUINS.foot + 6;
    const cave = this.h.isCave(p.x, p.z) || Math.hypot(p.x - CAVE.hall[0], p.z - CAVE.hall[1]) < 30;
    const safe = Math.hypot(p.x - OUTPOST.at[0], p.z - OUTPOST.at[1]) < OUTPOST.radius + 8;
    return !safe && (night || ruins || cave);
  }

  private spawn(): void {
    const p = this.h.player.pos;
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = 13 + Math.random() * 6;
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      if (Math.abs(x) > PLAY_HALF - 4 || Math.abs(z) > PLAY_HALF - 4) continue;
      const y = this.h.physics.ground(x, z, p.y + 6) + 1.3;
      const root = new Group();
      const body = new Mesh(this.wispGeo, this.wispMat.clone());
      body.castShadow = false;
      root.add(body);
      root.position.set(x, y, z);
      root.scale.setScalar(0.01);
      this.group.add(root);
      this.wisps.push({ root, body, pos: root.position, vel: new Vector3(), hp: 3, state: 'drift', t: 0, orbit: Math.random() < 0.5 ? 1 : -1, lungeDir: new Vector3(), dodged: false, hitThisLunge: false });
      this.h.fx.sparkle(root.position, '#9a6cff', 18, 0.8);
      return;
    }
  }

  private updateWisps(dt: number, hour: number): void {
    const P = this.h.player;
    const p = P.pos;
    const gloom = this.gloomy(hour);
    const cap = Math.min(4, 2 + Math.floor(this.level / 3));
    this.spawnIn -= dt;
    const live = this.wisps.filter((w) => w.state !== 'fade');
    if (gloom && this.spawnIn <= 0 && live.length < cap) {
      this.spawn();
      this.spawnIn = 7 + Math.random() * 6;
    }
    let near = false;
    for (const w of this.wisps) {
      w.t += dt;
      const s = Math.min(1, w.root.scale.x + dt * 2);
      if (w.state !== 'fade') w.root.scale.setScalar(s);
      const to = tmp.set(p.x - w.pos.x, p.y + 1.1 - w.pos.y, p.z - w.pos.z);
      const d = to.length();
      if (d < 15) near = true;
      const mat = w.body.material as MeshStandardMaterial;
      mat.emissive.set(w.state === 'windup' ? '#ff4a5a' : w.state === 'recover' || w.state === 'stunned' ? '#3a2a6a' : '#7a3cff');
      mat.emissiveIntensity = w.state === 'windup' ? 0.6 + 0.6 * Math.abs(Math.sin(w.t * 18)) : 0.6;
      if (!gloom && w.state !== 'fade' && w.state !== 'lunge') {
        w.state = 'fade';
        w.t = 0;
      }
      switch (w.state) {
        case 'drift': {
          // circle the player at about 4.5 m, then wind up
          const want = 4.5;
          const dir = to.clone().setY(0).normalize();
          const side = new Vector3(-dir.z, 0, dir.x).multiplyScalar(w.orbit);
          const pull = (d - want) * 0.9;
          w.vel.lerp(dir.multiplyScalar(pull).add(side.multiplyScalar(2.2)), Math.min(1, dt * 2));
          w.pos.addScaledVector(w.vel, dt);
          w.pos.y += ((this.h.physics.ground(w.pos.x, w.pos.z, w.pos.y + 3) + 1.3 + Math.sin(this.time * 3 + w.orbit) * 0.2) - w.pos.y) * Math.min(1, dt * 3);
          if (w.t > 2.2 + Math.random() * 0.02 && d < 7) {
            w.state = 'windup';
            w.t = 0;
            this.h.audio.gloomWindup();
          }
          if (d > 50) {
            w.state = 'fade';
            w.t = 0;
          }
          break;
        }
        case 'windup':
          w.root.position.x += (Math.random() - 0.5) * 0.04;
          if (w.t > 0.75) {
            w.state = 'lunge';
            w.t = 0;
            w.lungeDir.copy(to).normalize();
            w.dodged = false;
            w.hitThisLunge = false;
          }
          break;
        case 'lunge': {
          w.pos.addScaledVector(w.lungeDir, dt * 15);
          const hd = Math.hypot(p.x - w.pos.x, p.y + 1 - w.pos.y, p.z - w.pos.z);
          if (hd < 1.1 && !w.hitThisLunge) {
            if (P.invuln > 0 || P.dashTime > 0) {
              if (!w.dodged) {
                w.dodged = true;
                this.perfectDodge();
              }
            } else {
              w.hitThisLunge = true;
              this.hurt(w.pos);
            }
          }
          if (w.t > 0.45) {
            w.state = 'recover';
            w.t = 0;
            w.vel.set(0, 0, 0);
          }
          break;
        }
        case 'recover':
        case 'stunned':
          w.pos.addScaledVector(w.vel, dt);
          w.vel.multiplyScalar(1 - Math.min(1, dt * 3));
          if (w.t > (w.state === 'recover' ? 1.1 : 0.7)) {
            w.state = 'drift';
            w.t = 0;
          }
          break;
        case 'fade':
          w.root.scale.multiplyScalar(1 - Math.min(1, dt * 3));
          break;
      }
      w.body.rotation.y += dt * 2;
    }
    // remove faded ones
    for (const w of [...this.wisps]) {
      if (w.state === 'fade' && w.root.scale.x < 0.05) {
        this.group.remove(w.root);
        (w.body.material as MeshStandardMaterial).dispose();
        this.wisps.splice(this.wisps.indexOf(w), 1);
      }
    }
    // the companion joins in
    this.compCd -= dt;
    const comp = this.h.companion();
    if (comp && this.compCd <= 0) {
      const target = this.wisps.find((w) => w.state !== 'fade' && w.pos.distanceTo(comp.pos) < 9);
      if (target) {
        this.compCd = 2.6;
        this.h.fx.ring(target.pos, comp.color, 2.2, 0.5);
        this.h.fx.sparkle(target.pos, comp.color, 14, 0.6);
        this.damage(target, 1, comp.pos);
      }
    }
    // Light comes back while things are calm
    this.quiet = near ? 0 : this.quiet + dt;
    if (this.quiet > 5 && this.light < this.maxLight) {
      this.light++;
      this.quiet = 2;
      this.renderHud();
    }
  }

  private damage(w: Wisp, n: number, from: Vector3): void {
    if (w.state === 'fade') return;
    w.hp -= n;
    w.state = 'stunned';
    w.t = 0;
    w.vel.copy(w.pos).sub(from).setY(0).normalize().multiplyScalar(7);
    this.h.audio.gloomHit();
    if (w.hp <= 0) {
      w.state = 'fade';
      w.t = 0;
      this.h.audio.gloomGone();
      this.h.fx.sparkle(w.pos, '#c8b0ff', 30, 1);
      this.h.fx.sparkle(w.pos, '#ffe08a', 12, 0.6);
      const st = this.h.state();
      const gain = 3 + Math.floor(Math.random() * 4);
      st.lumens += gain;
      this.flags.wispsPurified = (this.flags.wispsPurified ?? 0) + 1;
      this.gainXp(12);
      this.renderHud();
    }
  }

  private perfectDodge(): void {
    this.slow = 1.1;
    this.empowered = 2.2;
    this.h.audio.dodge(true);
    this.h.fx.ring(this.h.player.pos.clone().setY(this.h.player.pos.y + 0.8), '#bff4ff', 3, 0.6);
    if (!this.flags.tipPerfect) {
      this.flags.tipPerfect = 1;
      this.h.toast('Perfect dodge! Time slows: pulse now for a stronger push.', 'good');
    }
  }

  private hurt(from: Vector3): void {
    const P = this.h.player;
    this.light--;
    P.invuln = 1.0;
    const d = P.pos.clone().sub(from).setY(0).normalize();
    P.vel.x += d.x * 7;
    P.vel.z += d.z * 7;
    P.vel.y = 3.5;
    P.grounded = false;
    this.h.audio.hurt();
    if (!this.flags.tipGloom) {
      this.flags.tipGloom = 1;
      this.h.toast('Gloom! When a wisp flares red, roll away (Z) and push it back with a Light pulse (X).', 'warn');
    }
    if (this.light <= 0) this.faint();
    this.renderHud();
  }

  private faint(): void {
    const st = this.h.state();
    const lost = Math.floor(st.lumens * 0.15);
    st.lumens -= lost;
    for (const w of this.wisps) {
      w.state = 'fade';
      w.t = 0;
    }
    const [x, z] = PLAYER_START.at;
    this.h.player.place(x, this.h.terrain.height(x, z) + 0.5, z, PLAYER_START.facing);
    this.light = this.maxLight;
    this.h.toast(`The gloom overwhelmed you. You wake at the outpost${lost ? `, ${lost} lumens lighter` : ''}.`, 'warn');
  }

  // --- the player's moves -----------------------------------------------------------------------

  /** Dodge roll along the movement direction (or facing). */
  dodge(dir: Vector3): void {
    if (this.h.player.dodge(dir)) this.h.audio.dodge(false);
  }

  /** A burst of Light that pushes back every wisp in reach. */
  pulse(): void {
    if (this.pulseCd > 0) return;
    this.pulseCd = 0.55;
    const P = this.h.player;
    const at = P.pos.clone().setY(P.pos.y + 0.9);
    const R = this.pulseRadius * (this.empowered > 0 ? 1.4 : 1);
    this.h.audio.lightPulse();
    this.h.fx.ring(at, this.empowered > 0 ? '#fff2a8' : '#bff4ff', R * 1.6, 0.5);
    P.pulse();
    for (const w of this.wisps) {
      if (w.state === 'fade' || w.pos.distanceTo(at) > R + 0.5) continue;
      const power = this.empowered > 0 ? 3 : w.state === 'recover' ? 2 : 1;
      this.damage(w, power, at);
    }
    this.empowered = 0;
  }

  // --- frame ------------------------------------------------------------------------------------

  /** `dt` is real time (slow motion is applied by the caller through timeScale). */
  update(dt: number, hour: number, active: boolean): void {
    this.time += dt;
    if (!this.hud.isConnected) this.renderHud();
    if (this.slow > 0) this.slow -= dt / 0.35;
    if (this.empowered > 0) this.empowered -= dt;
    if (this.pulseCd > 0) this.pulseCd -= dt;
    if (!active) return;
    const sim = dt * this.timeScale;
    if (!this.flags.tipNotes && this.time > 25) {
      this.flags.tipNotes = 1;
      this.h.toast('Golden beams on the hills mark Star Notes. Find all 24 to hear the vale\'s song (they are on your map too).', 'info');
    }
    this.updateNotes(sim);
    this.updateWisps(sim, hour);
  }

  private renderHud(): void {
    // the HUD is rebuilt now and then: stay attached
    if (!this.hud.isConnected) this.h.hud.append(this.hud);
    const l = this.level;
    const lo = LEVELS[l - 1] ?? 0;
    const hi = LEVELS[l] ?? lo + 500;
    const pct = Math.round(((this.xp - lo) / Math.max(1, hi - lo)) * 100);
    const pips = Array.from({ length: this.maxLight }, (_, k) => `<i class="${k < this.light ? 'on' : ''}"></i>`).join('');
    this.hud.innerHTML = `<div class="lq-adv-light" title="Light">${pips}</div>`
      + `<div class="lq-adv-row"><span class="lq-adv-notes" title="Star Notes">♪ ${this.notesFound}/${NOTE_COUNT}</span>`
      + `<span class="lq-adv-lvl" title="Ranger level">Lv ${l}<b style="width:${Math.min(100, pct)}%"></b></span></div>`;
  }

  dispose(): void {
    this.h.scene.remove(this.group);
    this.hud.remove();
  }
}

/** A chunky gold voxel star (points along x and y, a little depth). */
function noteGeometry(): BufferGeometry {
  const g = new VoxelGrid([-0.5, -0.5, -0.5]);
  const gold = '#ffd23f';
  const light = '#fff1a8';
  for (let k = -4; k <= 4; k++) {
    const w = 4 - Math.abs(k);
    for (let j = -w; j <= w; j++) {
      g.set(k, j, 0, Math.abs(k) + Math.abs(j) < 2 ? light : gold);
      g.set(j, k, 0, Math.abs(k) + Math.abs(j) < 2 ? light : gold);
    }
  }
  g.box(-1, 2, -1, 2, -1, 2, light);
  const { main } = meshGrid(g, { jitter: 0.04, scale: 2.4 });
  return main;
}

/** A dark voxel orb with two glowing eyes and a ragged hem. */
function wispGeometry(): BufferGeometry {
  const g = new VoxelGrid();
  g.ellipsoid(0, 0, 0, 5.2, 5.6, 5.2, '#2a1a44');
  g.recolor((x, y, z) => ((x * 7 + y * 3 + z * 5) % 5 === 0 ? '#3c2860' : null));
  for (let x = -5; x <= 4; x += 2) g.box(x, x + 1, -8, -4, -1, 1, '#2a1a44');
  for (const x of [-3, 1]) g.box(x, x + 2, 0, 2, 4, 6, '#ff6ad5');
  const { main } = meshGrid(g, { jitter: 0.05, scale: 2 });
  return main;
}
