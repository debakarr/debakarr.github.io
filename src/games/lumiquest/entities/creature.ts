// A creature living in the world: wild individuals with their own habitat,
// schedule and temperament, and bonded companions that follow the player.
//
// AI states: idle, look, wander, forage, drink, rest, sleep, investigate,
// react (watching the player), flee, defend, follow, return. Fear and trust
// are the two numbers everything hangs on: fear rises when you are loud,
// fast or too close for the creature's shyness; trust rises with patience,
// food it likes and conditions it prefers.

import { Sprite, SpriteMaterial, Vector3, type Object3D } from 'three';
import { SPECIES_BY_ID, type SpeciesDef, type SpeciesId } from '../data/species';
import type { Habitat } from '../data/species';
import { WATER_LEVEL } from '../data/world';
import type { CollisionWorld } from '../engine/physics';
import { heartSprite, symbolSprite } from '../engine/textures';
import type { Terrain } from '../world/terrain';
import { buildCreature, type CreatureModel } from './creatureModel';

export type AiState =
  | 'idle' | 'look' | 'wander' | 'forage' | 'drink' | 'rest' | 'sleep' | 'investigate' | 'react'
  | 'flee' | 'defend' | 'follow' | 'return' | 'perform';

export interface AiContext {
  dt: number;
  time: number;
  night: boolean;
  player: { pos: Vector3; vel: Vector3; noise: number; crouching: boolean; calmFor: number; swimming: boolean };
  terrain: Terrain;
  physics: CollisionWorld;
  isCave: (x: number, z: number) => boolean;
  /** Points of interest a curious creature may walk over to. */
  poi: Vector3[];
  /** Called when a defending creature bumps the player. */
  knock: (from: Vector3, strength: number) => void;
}

export type Mood = 'alarm' | 'curious' | 'heart' | 'sleep' | 'happy' | null;

const tmp = new Vector3();

export class Creature {
  readonly def: SpeciesDef;
  model: CreatureModel | null = null;
  readonly pos = new Vector3();
  yaw = 0;
  state: AiState = 'idle';
  private stateT = 0;
  readonly target = new Vector3();
  fear = 0;
  trust = 0;
  /** 0..1 how aware of the player it is right now. */
  alert = 0;
  companion = false;
  dismissed = false;
  bondUid: string | null = null;
  visible = false;
  private speed = 0;
  private stuckT = 0;
  private lastPos = new Vector3();
  private icon: Sprite;
  private iconT = 0;
  mood: Mood = null;
  /** Cooldowns (seconds) */
  feedCooldown = 0;
  resonateCooldown = 0;
  observed = false;
  /** Smoothed ground height (for hovering species). */
  private hover = 0;
  private fade = 1;
  inWater = false;
  private lastPlayerDist = 99;
  private defendHit = false;
  frameSkip = 0;

  constructor(
    readonly id: string,
    readonly species: SpeciesId,
    readonly variant: string | null,
    readonly home: [number, number],
    readonly roam: number,
    readonly habitat: Habitat,
    terrain: Terrain,
  ) {
    this.def = SPECIES_BY_ID[species];
    this.pos.set(home[0], 0, home[1]);
    this.pos.y = this.groundY(terrain);
    this.target.copy(this.pos);
    this.yaw = Math.random() * Math.PI * 2;
    this.icon = new Sprite(new SpriteMaterial({ map: symbolSprite('!', '#ffd75a'), depthTest: false, transparent: true }));
    this.icon.scale.setScalar(0.45);
    this.icon.visible = false;
    this.icon.renderOrder = 20;
  }

  get aquatic(): boolean {
    return this.def.gait === 'swim';
  }

  get flier(): boolean {
    return this.def.gait === 'float' || this.def.gait === 'flutter';
  }

  /** Lazily builds the model when the creature comes into range. */
  show(parent: Object3D): void {
    if (this.model) return;
    this.model = buildCreature(this.species, this.variant);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    this.model.root.add(this.icon);
    this.icon.position.set(0, this.model.height / this.model.root.scale.x + 0.35, 0);
    parent.add(this.model.root);
    this.visible = true;
  }

  hide(): void {
    if (!this.model) return;
    this.icon.removeFromParent();
    this.model.dispose();
    this.model = null;
    this.visible = false;
  }

  private groundY(terrain: Terrain): number {
    return terrain.height(this.pos.x, this.pos.z);
  }

  private setState(s: AiState, dur: number): void {
    this.state = s;
    this.stateT = dur;
  }

  setMood(m: Mood, dur = 1.6): void {
    this.mood = m;
    this.iconT = dur;
    const mat = this.icon.material as SpriteMaterial;
    if (m === 'heart') mat.map = heartSprite();
    else if (m === 'alarm') mat.map = symbolSprite('!', '#ffd75a');
    else if (m === 'curious') mat.map = symbolSprite('?', '#8fe8ff');
    else if (m === 'sleep') mat.map = symbolSprite('z', '#c9d4ff');
    else if (m === 'happy') mat.map = symbolSprite('♪', '#ffb0d8');
    mat.needsUpdate = true;
    this.icon.visible = m !== null;
  }

  /** Valid ground for this creature's habitat. */
  private validSpot(ctx: AiContext, x: number, z: number): boolean {
    const t = ctx.terrain;
    const water = t.waterAt(x, z) !== null && t.height(x, z) < WATER_LEVEL - 0.4;
    if (this.aquatic) return water;
    if (water) return false;
    if (this.habitat === 'cave') return ctx.isCave(x, z);
    if (ctx.isCave(x, z) && this.habitat !== 'forest') return false;
    const e = 1;
    const slope = Math.hypot(t.height(x + e, z) - t.height(x - e, z), t.height(x, z + e) - t.height(x, z - e)) / 2;
    return slope < 0.7;
  }

  private pickWander(ctx: AiContext, radius = this.roam): boolean {
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const x = this.home[0] + Math.cos(a) * r;
      const z = this.home[1] + Math.sin(a) * r;
      if (this.validSpot(ctx, x, z)) {
        this.target.set(x, 0, z);
        return true;
      }
    }
    this.target.set(this.home[0], 0, this.home[1]);
    return false;
  }

  /** Main AI step. Returns true when it moved. */
  update(ctx: AiContext): void {
    const dt = ctx.dt;
    this.feedCooldown = Math.max(0, this.feedCooldown - dt);
    this.resonateCooldown = Math.max(0, this.resonateCooldown - dt);
    this.stateT -= dt;
    if (this.iconT > 0) {
      this.iconT -= dt;
      if (this.iconT <= 0) {
        this.icon.visible = false;
        this.mood = null;
      }
    }
    if (this.companion) this.companionAi(ctx);
    else this.wildAi(ctx);
    this.locomote(ctx);
    this.animate(ctx);
  }

  private wildAi(ctx: AiContext): void {
    const p = ctx.player;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    const approaching = this.lastPlayerDist - d;
    this.lastPlayerDist = d;
    const def = this.def;
    const nightActive = def.active === 'night' || this.habitat === 'cave';
    const shouldSleep = (def.active === 'day' && ctx.night) || (def.active === 'night' && !ctx.night && this.habitat !== 'cave' && this.id !== 'w-lume-quest');

    // perception
    const hearing = def.awareness * (0.3 + p.noise * 0.95) * (this.state === 'sleep' ? 0.35 : 1);
    const noticed = d < hearing;
    this.alert += ((noticed ? 1 : 0) - this.alert) * Math.min(1, ctx.dt * (noticed ? 3 : 0.6));

    // fear: too close, too fast, too loud — tempered by trust
    const comfort = 2.2 + def.shyness * 6;
    const trustDamp = 1 - Math.min(0.9, this.trust / 110);
    let gain = 0;
    if (noticed && d < comfort + 3) {
      if (p.noise >= 0.8) gain += 55 * def.shyness + 12;
      if (approaching > 0.06 && p.noise > 0.3) gain += approaching / ctx.dt * 6 * def.shyness;
      if (d < comfort * 0.6 && !p.crouching) gain += 10 * def.shyness;
    }
    if (def.id === 'lumelle' && !ctx.night && !ctx.isCave(this.pos.x, this.pos.z) && d < 6) gain += 4;
    this.fear = Math.max(0, Math.min(100, this.fear + gain * trustDamp * ctx.dt - (p.crouching ? 14 : 8) * ctx.dt));

    // calm presence slowly builds trust (patience is rewarded)
    if (d < 7 && p.crouching && this.fear < 25 && this.trust < 35 && this.state !== 'sleep') {
      this.trust = Math.min(35, this.trust + 0.9 * def.warmth * ctx.dt);
    }

    if (this.state === 'flee' || this.state === 'defend') {
      if (this.stateT <= 0) this.setState('look', 1.5);
      return;
    }
    if (this.fear > 62) {
      if (def.threat === 'defend' && d < 4.5) {
        this.setState('defend', 0.9);
        this.defendHit = false;
        this.setMood('alarm');
        this.model?.animator.once('defend', 0.1, 1);
      } else {
        const away = tmp.set(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z).normalize();
        let tx = this.pos.x + away.x * 14;
        let tz = this.pos.z + away.z * 14;
        if (!this.validSpot(ctx, tx, tz)) {
          tx = this.home[0] + away.x * this.roam;
          tz = this.home[1] + away.z * this.roam;
        }
        this.target.set(tx, 0, tz);
        this.setState('flee', 3 + def.shyness * 2);
        this.setMood('alarm');
      }
      return;
    }

    if (shouldSleep && this.state !== 'sleep' && this.fear < 20) {
      this.target.set(this.home[0], 0, this.home[1]);
      if (Math.hypot(this.pos.x - this.home[0], this.pos.z - this.home[1]) < 2) this.setState('sleep', 30);
      else this.setState('wander', 8);
      return;
    }
    if (this.state === 'sleep') {
      if (!shouldSleep || (noticed && p.noise > 0.7 && d < 5)) {
        this.setState('react', 2);
        this.setMood('alarm');
      } else if (Math.random() < ctx.dt * 0.3) this.setMood('sleep', 1.4);
      return;
    }

    // react: stop and watch an approaching player
    if (noticed && d < def.awareness && this.state !== 'react' && this.state !== 'investigate' && this.alert > 0.6 && Math.random() < ctx.dt * 2) {
      this.setState('react', 2 + Math.random() * 2);
      if (this.fear > 25) this.setMood('alarm', 1);
      else if (def.shyness < 0.5) this.setMood('curious', 1.2);
    }

    if (this.stateT > 0) return;
    // pick the next everyday activity
    const r = Math.random();
    const curious = (1 - def.shyness) * (this.trust > 20 ? 1.5 : 1);
    if (noticed && p.crouching && d < 12 && d > 2.5 && r < 0.35 * curious) {
      this.target.set(p.pos.x + (this.pos.x - p.pos.x) * (2.2 / d), 0, p.pos.z + (this.pos.z - p.pos.z) * (2.2 / d));
      this.setState('investigate', 5);
      this.setMood('curious');
      return;
    }
    const poi = ctx.poi.find((q) => Math.hypot(q.x - this.pos.x, q.z - this.pos.z) < 12);
    if (poi && r < 0.15) {
      this.target.set(poi.x, 0, poi.z);
      this.setState('investigate', 6);
      return;
    }
    if (r < 0.38) {
      this.pickWander(ctx);
      this.setState('wander', 10);
    } else if (r < 0.58) this.setState('forage', 3 + Math.random() * 3);
    else if (r < 0.72) this.setState('look', 2 + Math.random() * 2);
    else if (r < 0.82 && !this.aquatic) {
      // drink: find water nearby
      const a = Math.random() * Math.PI * 2;
      const x = this.pos.x + Math.cos(a) * 8;
      const z = this.pos.z + Math.sin(a) * 8;
      if (ctx.terrain.waterAt(x, z) !== null) {
        this.target.set(this.pos.x + Math.cos(a) * 6, 0, this.pos.z + Math.sin(a) * 6);
        this.setState('drink', 7);
      } else this.setState('idle', 2);
    } else if (r < 0.9 && !nightActive) this.setState('rest', 5 + Math.random() * 4);
    else this.setState('idle', 2 + Math.random() * 2);
  }

  /** Where a following companion wants to be. */
  followTarget = new Vector3();

  private companionAi(ctx: AiContext): void {
    const p = ctx.player;
    if (this.dismissed) {
      if (this.state !== 'return') {
        this.setState('return', 4);
        this.target.set(this.pos.x + (this.pos.x - p.pos.x) * 3, 0, this.pos.z + (this.pos.z - p.pos.z) * 3);
      }
      return;
    }
    if (this.state === 'perform' && this.stateT > 0) return;
    const d = this.pos.distanceTo(this.followTarget);
    if (d > 32) {
      // too far behind: catch up instantly with a sparkle
      this.pos.copy(this.followTarget);
      this.pos.y = this.groundY(ctx.terrain);
      this.setMood('happy', 1);
    }
    if (d > 1.4) {
      this.target.copy(this.followTarget);
      this.state = 'follow';
    } else if (this.state === 'follow') {
      this.setState('look', 3);
    } else if (this.stateT <= 0) {
      const r = Math.random();
      if (p.calmFor > 8 && r < 0.25) {
        this.model?.animator.once('happy', 0.1, 1);
        this.setMood('happy');
        this.setState('look', 3);
      } else if (r < 0.5) this.setState('forage', 3);
      else this.setState('look', 3);
    }
  }

  private locomote(ctx: AiContext): void {
    const dt = ctx.dt;
    const moving = this.state === 'wander' || this.state === 'flee' || this.state === 'investigate' || this.state === 'follow' || this.state === 'return' || this.state === 'drink' || (this.state === 'defend' && this.stateT > 0.5);
    const def = this.def;
    let want = 0;
    if (moving) {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const arrive = this.state === 'follow' ? 1.0 : 0.6;
      if (this.state === 'defend') {
        want = def.speed.run;
        const px = ctx.player.pos.x - this.pos.x;
        const pz = ctx.player.pos.z - this.pos.z;
        this.turnToward(Math.atan2(px, pz), dt, 10);
        if (!this.defendHit && Math.hypot(px, pz) < 1.3) {
          this.defendHit = true;
          ctx.knock(this.pos, 5);
          this.fear = Math.max(0, this.fear - 40);
        }
      } else if (dist > arrive) {
        const pFollow = this.state === 'follow' ? Math.hypot(ctx.player.vel.x, ctx.player.vel.z) : 0;
        want = this.state === 'flee' ? def.speed.run : this.state === 'follow' ? Math.min(def.speed.run * 1.3, Math.max(def.speed.walk, pFollow + (dist > 4 ? 1.5 : 0))) : this.state === 'return' ? def.speed.walk * 1.5 : def.speed.walk;
        this.turnToward(Math.atan2(dx, dz), dt, this.state === 'flee' ? 8 : 5);
      } else if (this.state === 'drink') {
        this.setState('forage', 3);
      } else if (this.state === 'investigate') {
        this.setState('look', 2.5);
        const pd = Math.hypot(ctx.player.pos.x - this.pos.x, ctx.player.pos.z - this.pos.z);
        if (pd < 4) this.turnToward(Math.atan2(ctx.player.pos.x - this.pos.x, ctx.player.pos.z - this.pos.z), dt, 6);
      } else if (this.state !== 'follow' && this.state !== 'return') this.setState('idle', 1 + Math.random() * 2);
    } else if (this.state === 'react' || this.state === 'look') {
      const px = ctx.player.pos.x - this.pos.x;
      const pz = ctx.player.pos.z - this.pos.z;
      if (Math.hypot(px, pz) < 16) this.turnToward(Math.atan2(px, pz), dt, 3);
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 6);
    if (this.speed > 0.02) {
      const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt;
      const nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
      if (this.companion || this.validSpot(ctx, nx, nz) || this.state === 'flee') {
        const pp = { x: nx, y: this.pos.y, z: nz };
        ctx.physics.resolve(pp, 0.28 * (def.size / 0.55), 0.7);
        if (!this.companion && !this.validSpot(ctx, pp.x, pp.z)) {
          this.speed = 0;
          if (this.state !== 'flee') this.setState('idle', 1);
        } else {
          this.pos.x = pp.x;
          this.pos.z = pp.z;
        }
      } else {
        this.speed = 0;
        this.setState('idle', 0.5);
      }
    }
    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      if (moving && this.lastPos.distanceTo(this.pos) < 0.15 && this.state !== 'follow') this.setState('idle', 1);
      this.lastPos.copy(this.pos);
      this.stuckT = 0;
    }
    // height: walk on ground, swim at the surface, hover over the ground
    const g = ctx.terrain.height(this.pos.x, this.pos.z);
    const level = ctx.terrain.waterAt(this.pos.x, this.pos.z);
    this.inWater = level !== null && g < WATER_LEVEL - 0.35;
    let y = g;
    if (this.inWater) y = WATER_LEVEL - (this.aquatic ? 0.32 : 0.22) * (def.size / 0.55);
    if (this.flier) {
      this.hover += ((this.state === 'sleep' || this.state === 'rest' ? 0.0 : def.gait === 'flutter' ? 0.55 : 0.4) - this.hover) * Math.min(1, dt * 2);
      y = Math.max(y, g + this.hover);
    }
    this.pos.y += (y - this.pos.y) * Math.min(1, dt * 10);
    // dismissed companions fade away
    if (this.companion && this.dismissed) this.fade = Math.max(0, this.fade - dt * 0.35);
    else this.fade = Math.min(1, this.fade + dt * 2);
    if (this.model) {
      this.model.root.position.copy(this.pos);
      this.model.root.rotation.y = this.yaw;
      const s = (this.def.size / 0.55) * (0.2 + 0.8 * this.fade);
      this.model.root.scale.setScalar(s);
    }
  }

  get faded(): boolean {
    return this.fade <= 0.01;
  }

  private turnToward(want: number, dt: number, rate: number): void {
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
  }

  private animate(ctx: AiContext): void {
    const m = this.model;
    if (!m) return;
    const a = m.animator;
    let clip = 'idle';
    let ts = 1;
    if (this.speed > 0.15) {
      clip = this.inWater ? 'swim' : this.speed > this.def.speed.walk * 1.4 ? 'run' : 'walk';
      ts = this.inWater ? 1 : Math.max(0.6, this.speed / (clip === 'run' ? this.def.speed.run : this.def.speed.walk));
    } else if (this.inWater) clip = 'swim';
    else if (this.state === 'forage' || this.state === 'drink') clip = 'eat';
    else if (this.state === 'sleep' || this.state === 'rest') clip = 'sleep';
    else if (this.state === 'react') clip = this.fear > 25 ? 'alert' : 'look';
    else if (this.state === 'look') clip = 'look';
    a.play(clip, 0.25, ts);
    m.animator.update(ctx.dt);
  }

  /** Plays a one-shot (happy, ability, defend). */
  perform(clip: string, hold = 1.2): void {
    this.model?.animator.once(clip, 0.1, 1);
    if (this.companion) {
      this.state = 'perform';
      this.stateT = hold;
    }
  }

  /** Points the creature at something (used when you feed or observe it). */
  face(p: Vector3): void {
    this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    if (!this.companion) {
      this.state = 'look';
      this.stateT = 3;
    }
  }

  dispose(): void {
    this.hide();
    (this.icon.material as SpriteMaterial).dispose();
  }
}
