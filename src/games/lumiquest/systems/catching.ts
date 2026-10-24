// Catching. Throw a Lumi orb at a creature: if it hits, the creature is
// drawn inside, the orb drops and wobbles three times, and each wobble rolls
// against the cube root of the catch chance, so the overall odds are exactly
// the chance shown on the HUD. Odds are best against a creature that is
// asleep or hasn't noticed you (especially from behind), worse against one
// that is watching, standing its ground or running away; distance and
// rarity count too. A creature that breaks free is startled.

import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Object3D,
} from 'three';
import type { SpeciesId } from '../data/species';
import type { Creature } from '../entities/creature';
import type { Terrain } from '../world/terrain';
import type { Fx } from '../world/fx';
import type { Audio } from '../engine/audio';

/** Base odds per species before circumstances (commoner creatures are easier). */
export const CATCH_RATE: Record<SpeciesId, number> = {
  terrabun: 0.6,
  aquoray: 0.55,
  flamkit: 0.45,
  thornlade: 0.4,
  zephyra: 0.32,
  lumelle: 0.3,
};

export type ChanceTone = 'easy' | 'fair' | 'hard';

export interface Chance {
  chance: number;
  note: string;
  tone: ChanceTone;
}

export function catchChance(c: Creature, player: { pos: Vector3; crouching: boolean }): Chance {
  let p = CATCH_RATE[c.species];
  const dx = player.pos.x - c.pos.x;
  const dz = player.pos.z - c.pos.z;
  const d = Math.hypot(dx, dz);
  // which way is the player from the creature's point of view
  const facing = (Math.sin(c.yaw) * dx + Math.cos(c.yaw) * dz) / Math.max(d, 1e-3);
  const behind = facing < -0.35;
  let note: string;
  if (c.state === 'sleep' || c.state === 'rest') {
    p *= 1.9;
    note = 'Asleep: an easy catch';
  } else if (c.state === 'flee') {
    p *= 0.55;
    note = 'Running away';
  } else if (c.state === 'defend') {
    p *= 0.7;
    note = 'Standing its ground';
  } else if (c.alert < 0.25) {
    p *= behind ? 1.6 : 1.35;
    note = behind ? 'Unaware, facing away' : 'Hasn’t noticed you';
  } else {
    p *= behind ? 0.95 : 0.8;
    note = 'Watching you';
  }
  if (player.crouching && c.alert < 0.5) p *= 1.1;
  if (d < 6) p *= 1.1;
  else if (d > 14) p *= 0.85;
  if (c.variant) p *= 0.75;
  p = Math.min(0.95, Math.max(0.05, p));
  return { chance: p, note, tone: p >= 0.6 ? 'easy' : p >= 0.35 ? 'fair' : 'hard' };
}

export interface CatchHost {
  parent: Object3D;
  terrain: Terrain;
  fx: Fx;
  audio: Audio;
  /** Wild creatures an orb can hit. */
  targets(): Iterable<Creature>;
  chance(c: Creature): Chance;
  onCaught(c: Creature): void;
  onEscaped(c: Creature): void;
  onMiss(at: Vector3): void;
}

const GRAVITY = 9.8;
const ORB_R = 0.09;

let orbGeo: SphereGeometry | null = null;
let bandGeo: TorusGeometry | null = null;
let shell: MeshStandardMaterial | null = null;
let band: MeshStandardMaterial | null = null;

/** A Lumi orb: a glassy cyan sphere with a gold band and a glowing heart. */
function orbMesh(): Group {
  orbGeo ??= new SphereGeometry(ORB_R, 20, 14);
  bandGeo ??= new TorusGeometry(ORB_R * 1.02, ORB_R * 0.16, 8, 28);
  shell ??= new MeshStandardMaterial({ color: '#bff4ff', emissive: new Color('#5fd8ff'), emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1 });
  band ??= new MeshStandardMaterial({ color: '#ffd76a', emissive: new Color('#ffb020'), emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.6 });
  const g = new Group();
  const s = new Mesh(orbGeo, shell);
  const b = new Mesh(bandGeo, band);
  b.rotation.x = Math.PI / 2;
  s.castShadow = true;
  g.add(s, b);
  return g;
}

interface Flight {
  mesh: Group;
  pos: Vector3;
  vel: Vector3;
  t: number;
}

interface Hold {
  c: Creature;
  mesh: Group;
  pos: Vector3;
  t: number;
  /** Wobbles survived so far. */
  shakes: number;
  perShake: number;
  ground: number;
  done: boolean;
}

/** Odds per wobble so three wobbles multiply to the overall chance. */
export function perShake(chance: number): number {
  return Math.cbrt(Math.min(1, Math.max(0, chance)));
}

export class Catcher {
  private flights: Flight[] = [];
  private holds: Hold[] = [];
  private tmp = new Vector3();

  constructor(private host: CatchHost) {}

  /** Creatures currently inside an orb. */
  get busy(): number {
    return this.holds.length;
  }

  /**
   * Launches an orb from `from`. With a target point it arcs to arrive there
   * (aim assist); otherwise it flies along `dir`.
   */
  throw(from: Vector3, dir: Vector3, target: Vector3 | null): void {
    const vel = new Vector3();
    if (target) {
      const d = from.distanceTo(target);
      const T = Math.min(0.95, Math.max(0.3, d / 16));
      vel.subVectors(target, from).divideScalar(T);
      vel.y += 0.5 * GRAVITY * T;
    } else vel.copy(dir).normalize().multiplyScalar(15).add(new Vector3(0, 3.2, 0));
    const mesh = orbMesh();
    mesh.position.copy(from);
    this.host.parent.add(mesh);
    this.flights.push({ mesh, pos: from.clone(), vel, t: 0 });
    this.host.audio.wind();
  }

  update(dt: number, time: number): void {
    const h = this.host;
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t += dt;
      f.vel.y -= GRAVITY * dt;
      f.pos.addScaledVector(f.vel, dt);
      f.mesh.position.copy(f.pos);
      f.mesh.rotation.x += dt * 14;
      if (Math.random() < dt * 30) h.fx.sparkle(f.pos.clone(), '#bff4ff', 2, 0.4);
      // hit a creature?
      let hit: Creature | null = null;
      for (const c of h.targets()) {
        if (c.held || !c.model) continue;
        const s = c.model.root.scale.x;
        const r = 0.32 * s + ORB_R;
        this.tmp.copy(c.pos);
        this.tmp.y += c.model.height * 0.45 * s;
        if (this.tmp.distanceTo(f.pos) < r + 0.12) {
          hit = c;
          break;
        }
      }
      if (hit) {
        this.flights.splice(i, 1);
        this.capture(hit, f);
        continue;
      }
      const g = h.terrain.height(f.pos.x, f.pos.z);
      if (f.pos.y < g + ORB_R || f.t > 3) {
        this.flights.splice(i, 1);
        f.mesh.removeFromParent();
        h.fx.sparkle(f.pos.clone().setY(Math.max(f.pos.y, g + 0.1)), '#bff4ff', 14, 0.8);
        h.onMiss(f.pos.clone());
      }
    }
    for (let i = this.holds.length - 1; i >= 0; i--) {
      const k = this.holds[i];
      k.t += dt;
      // drop to the ground with a small bounce
      const fallT = 0.5;
      if (k.t < fallT) {
        const u = k.t / fallT;
        const y0 = k.pos.y;
        const bounce = Math.abs(Math.sin(u * Math.PI * 2)) * (1 - u) * 0.25;
        k.mesh.position.set(k.pos.x, k.ground + ORB_R + (y0 - k.ground) * (1 - u) * (1 - u) + bounce, k.pos.z);
        continue;
      }
      k.mesh.position.set(k.pos.x, k.ground + ORB_R, k.pos.z);
      // three wobbles, 0.95 s apart; each one rolls
      const st = k.t - fallT;
      const n = Math.floor(st / 0.95);
      const ph = st - n * 0.95;
      k.mesh.rotation.z = ph < 0.6 ? Math.sin((ph / 0.6) * Math.PI * 2) * 0.45 * (1 - ph / 0.6) : 0;
      (k.mesh.children[0] as Mesh).scale.setScalar(1 + 0.08 * Math.max(0, Math.sin(time * 9)));
      if (n > k.shakes && !k.done) {
        // a wobble just finished
        if (Math.random() < k.perShake) {
          k.shakes++;
          h.audio.click();
          if (k.shakes >= 3) {
            k.done = true;
            this.holds.splice(i, 1);
            k.mesh.removeFromParent();
            const at = k.mesh.position.clone();
            h.fx.sparkle(at.clone().add(new Vector3(0, 0.2, 0)), '#ffe98a', 46, 1.4);
            h.fx.ring(at.clone().add(new Vector3(0, 0.05, 0)), '#ffe98a', 2.2);
            h.onCaught(k.c);
          }
        } else {
          k.done = true;
          this.holds.splice(i, 1);
          k.mesh.removeFromParent();
          this.release(k.c, k.mesh.position);
          h.onEscaped(k.c);
        }
      }
    }
  }

  private capture(c: Creature, f: Flight): void {
    const h = this.host;
    const chance = h.chance(c).chance;
    c.held = true;
    if (c.model) c.model.root.visible = false;
    h.fx.sparkle(f.pos.clone(), '#bff4ff', 26, 1);
    h.audio.glow();
    this.holds.push({ c, mesh: f.mesh, pos: f.pos.clone(), t: 0, shakes: 0, perShake: perShake(chance), ground: h.terrain.height(f.pos.x, f.pos.z), done: false });
  }

  /** Lets a creature out of an orb, startled. */
  private release(c: Creature, at: Vector3): void {
    c.held = false;
    c.pos.x = at.x;
    c.pos.z = at.z;
    if (c.model) c.model.root.visible = true;
    c.startle();
    this.host.fx.sparkle(at.clone().add(new Vector3(0, 0.3, 0)), '#ffffff', 22, 1.1);
  }

  dispose(): void {
    for (const f of this.flights) f.mesh.removeFromParent();
    for (const k of this.holds) {
      k.mesh.removeFromParent();
      k.c.held = false;
      if (k.c.model) k.c.model.root.visible = true;
    }
    this.flights = [];
    this.holds = [];
  }
}
