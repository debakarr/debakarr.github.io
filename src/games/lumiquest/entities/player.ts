// The player: a character model driven by a kinematic controller. Walking,
// sprinting, sneaking, jumping with coyote time, landing, swimming at the
// surface, diving (with a water companion) and gliding (with an air
// companion). Movement is in camera space; collision is the shared
// CollisionWorld; animations follow the movement state.

import { Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3, type PerspectiveCamera } from 'three';
import type { Appearance } from '../data/characters';
import type { CameraRig } from '../engine/camera';
import { capsule, cylinder, ellipsoid, prep, torus, xf } from '../engine/geometry';
import type { CollisionWorld } from '../engine/physics';
import type { Terrain } from '../world/terrain';
import { CharacterModel } from './character';

export interface MoveInput {
  x: number;
  y: number;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  jumpHeld: boolean;
}

export interface Abilities {
  canDive: boolean;
  canGlide: boolean;
}

export type MoveState = 'idle' | 'walk' | 'run' | 'sneak' | 'crouch' | 'air' | 'swim' | 'dive' | 'glide';

const RADIUS = 0.3;
const HEIGHT = 1.45;
const GRAVITY = 19;

export class Player {
  readonly model: CharacterModel;
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  yaw = Math.PI;
  grounded = true;
  crouching = false;
  sprinting = false;
  swimming = false;
  diving = false;
  gliding = false;
  underwater = false;
  state: MoveState = 'idle';
  /** 0..1: how loud the player is right now (creatures listen to this). */
  noise = 0.2;
  private coyote = 0;
  private airTime = 0;
  private landTimer = 0;
  private stepTimer = 0;
  private lastSafe = new Vector3();
  private safeTimer = 0;
  /** Time since the last sprint or jump, for skittish creatures. */
  calmFor = 0;
  /** Disables control (dialogue, cutscenes, menus). */
  frozen = false;
  onStep: ((surface: string) => void) | null = null;
  onJump: (() => void) | null = null;
  onLand: (() => void) | null = null;
  onSplash: (() => void) | null = null;
  /** First-person hand with the resonance device. */
  readonly hand = new Group();
  private handPulse = 0;
  private deviceGlow: MeshStandardMaterial;

  constructor(appearance: Appearance, private terrain: Terrain, private physics: CollisionWorld) {
    this.model = new CharacterModel(appearance);
    this.deviceGlow = new MeshStandardMaterial({ color: '#bff4ff', emissive: '#4fd8ff', emissiveIntensity: 1.2, roughness: 0.2 });
    this.buildHand(appearance);
  }

  private buildHand(a: Appearance): void {
    this.hand.clear();
    const skin = new MeshStandardMaterial({ color: a.skin, roughness: 0.6 });
    const sleeve = new MeshStandardMaterial({ color: a.outfit === 'explorer' ? a.skin : a.outfitMain, roughness: 0.8 });
    const metal = new MeshStandardMaterial({ color: '#f2c35a', metalness: 0.6, roughness: 0.35 });
    const arm = new Mesh(xf(capsule(0.05, 0.32, 4, 10), { r: [Math.PI / 2, 0, 0], p: [0, 0, 0.2] }), sleeve);
    const fist = new Mesh(ellipsoid(0.065, 0.06, 0.07), skin);
    fist.position.set(0, 0, -0.02);
    const band = new Mesh(prep(xf(torus(0.062, 0.02, 8, 20), { r: [0, 0, 0] }), '#f2c35a'), metal);
    band.position.set(0, 0, 0.08);
    const gem = new Mesh(new SphereGeometry(0.03, 12, 8), this.deviceGlow);
    gem.position.set(0, 0.06, 0.08);
    const ring = new Mesh(xf(cylinder(0.012, 0.012, 0.06, 6), { r: [0, 0, Math.PI / 2] }), metal);
    ring.position.set(0, 0.04, 0.08);
    this.hand.add(arm, fist, band, gem, ring);
    this.hand.traverse((o) => {
      o.renderOrder = 10;
      const m = o as Mesh;
      if (m.material) (m.material as MeshStandardMaterial).depthTest = true;
    });
    this.hand.visible = false;
  }

  setAppearance(a: Appearance): void {
    this.model.setAppearance(a);
    this.buildHand(a);
  }

  place(x: number, y: number, z: number, yaw: number): void {
    this.pos.set(x, y, z);
    const g = this.physics.ground(x, z, y + 0.5);
    if (this.pos.y < g || this.pos.y - g > 3) this.pos.y = g;
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.lastSafe.copy(this.pos);
    this.syncModel(0);
  }

  get eyeHeight(): number {
    if (this.swimming) return this.diving ? 0.5 : 1.25;
    return this.crouching ? 0.92 : 1.32;
  }

  get height(): number {
    return this.swimming ? 0.8 : this.crouching ? 1.0 : HEIGHT;
  }

  /** Pulse the device glow (first person) when resonating or using a skill. */
  pulse(): void {
    this.handPulse = 1;
  }

  update(dt: number, input: MoveInput, rig: CameraRig, abil: Abilities): void {
    const ctrl = this.frozen ? { x: 0, y: 0, sprint: false, crouch: false, jump: false, jumpHeld: false } : input;
    const fwd = rig.forward(new Vector3());
    const right = new Vector3(-fwd.z, 0, fwd.x);
    const wish = new Vector3().addScaledVector(fwd, ctrl.y).addScaledVector(right, ctrl.x);
    const moving = wish.lengthSq() > 0.01;
    if (moving) wish.normalize().multiplyScalar(Math.min(1, Math.hypot(ctrl.x, ctrl.y)));

    // water
    const level = this.terrain.waterAt(this.pos.x, this.pos.z);
    const ground = this.physics.ground(this.pos.x, this.pos.z, this.pos.y);
    const depth = level === null ? 0 : level - ground;
    const inWater = level !== null && depth > 1.0 && this.pos.y < level - 0.85;
    if (inWater && !this.swimming) {
      this.swimming = true;
      this.vel.y = 0;
      this.onSplash?.();
    }
    if (this.swimming && (level === null || depth < 0.95)) {
      this.swimming = false;
      this.diving = false;
    }

    this.crouching = !this.swimming && ctrl.crouch && this.grounded;
    this.sprinting = ctrl.sprint && moving && !this.crouching;

    if (this.swimming && level !== null) {
      this.gliding = false;
      const speed = this.sprinting ? 3.8 : 2.6;
      const target = wish.clone().multiplyScalar(speed);
      this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * 4);
      this.vel.z += (target.z - this.vel.z) * Math.min(1, dt * 4);
      const surfaceY = level - 1.1;
      if (abil.canDive && ctrl.crouch) {
        this.diving = true;
        this.vel.y += (-2.4 - this.vel.y) * Math.min(1, dt * 3);
      } else if (this.diving && (ctrl.jumpHeld || this.pos.y >= surfaceY - 0.05)) {
        this.vel.y += (2.6 - this.vel.y) * Math.min(1, dt * 3);
        if (this.pos.y >= surfaceY - 0.02) this.diving = false;
      } else if (this.diving) {
        this.vel.y *= 1 - Math.min(1, dt * 2);
      } else {
        this.vel.y = (surfaceY - this.pos.y) * 4;
      }
      if (!abil.canDive) this.diving = false;
      const nx = this.pos.x + this.vel.x * dt;
      const nz = this.pos.z + this.vel.z * dt;
      let ny = this.pos.y + this.vel.y * dt;
      ny = Math.min(ny, surfaceY);
      const floor = this.physics.ground(nx, nz, ny) + 0.05;
      if (ny < floor) ny = floor;
      const p = { x: nx, y: ny, z: nz };
      this.physics.resolve(p, RADIUS, this.height);
      this.pos.set(p.x, p.y, p.z);
      // climbing out onto a bank
      if (ctrl.jump && !this.diving) {
        const g2 = this.physics.ground(this.pos.x + wish.x * 0.8, this.pos.z + wish.z * 0.8, this.pos.y + 1.6);
        if (g2 > level - 0.9 && g2 < level + 1.3) {
          this.swimming = false;
          this.vel.y = 6;
          this.pos.y = Math.max(this.pos.y, level - 0.6);
          this.grounded = false;
        }
      }
      this.grounded = false;
      this.underwater = this.pos.y + this.eyeHeight < level - 0.05;
      this.state = this.diving ? 'dive' : 'swim';
      this.noise = 0.3;
      this.calmFor += dt;
    } else {
      this.diving = false;
      this.underwater = false;
      const speed = this.crouching ? 1.8 : this.sprinting ? 6.8 : 3.8;
      const accel = this.grounded ? 16 : this.gliding ? 2.5 : 4;
      const target = wish.clone().multiplyScalar(speed);
      if (this.gliding) {
        const f = moving ? wish : new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        target.copy(f).normalize().multiplyScalar(7.5);
      }
      this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * accel);
      this.vel.z += (target.z - this.vel.z) * Math.min(1, dt * accel);

      // jump & gravity
      this.coyote = this.grounded ? 0.12 : this.coyote - dt;
      if (ctrl.jump && (this.grounded || this.coyote > 0) && !this.crouching) {
        this.vel.y = 6.4;
        this.grounded = false;
        this.coyote = 0;
        this.onJump?.();
        this.calmFor = 0;
      }
      this.gliding = !this.grounded && abil.canGlide && ctrl.jumpHeld && this.vel.y < 0 && this.airTime > 0.25;
      this.vel.y -= GRAVITY * dt;
      if (this.gliding) this.vel.y = Math.max(this.vel.y, -1.4);
      if (this.vel.y < -40) this.vel.y = -40;

      // horizontal move with slope limit and wall sliding
      const ox = this.pos.x;
      const oz = this.pos.z;
      const tryMove = (dx: number, dz: number): boolean => {
        const nx = ox + dx;
        const nz = oz + dz;
        const gNew = this.physics.ground(nx, nz, this.pos.y);
        const gOld = this.physics.ground(ox, oz, this.pos.y);
        const rise = gNew - Math.max(gOld, this.pos.y - 0.05);
        const run = Math.hypot(dx, dz);
        // terrain steeper than ~50° stops you unless you are above it
        if (this.grounded && rise > 0.05 && rise > run * 1.25 + 0.03 && gNew - this.pos.y > 0.12) return false;
        if (!this.grounded && gNew > this.pos.y + 0.6) return false;
        this.pos.x = nx;
        this.pos.z = nz;
        return true;
      };
      const dx = this.vel.x * dt;
      const dz = this.vel.z * dt;
      if (!tryMove(dx, dz)) {
        if (!tryMove(dx, 0) && !tryMove(0, dz)) {
          this.vel.x *= 0.3;
          this.vel.z *= 0.3;
        }
      }
      this.pos.y += this.vel.y * dt;
      const p = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
      this.physics.resolve(p, RADIUS, this.height);
      this.pos.x = p.x;
      this.pos.z = p.z;
      // ground snap
      const g = this.physics.ground(this.pos.x, this.pos.z, this.pos.y);
      const wasGrounded = this.grounded;
      if (this.pos.y <= g + 0.02 || (wasGrounded && this.vel.y <= 0 && this.pos.y - g < 0.35)) {
        if (!wasGrounded && this.airTime > 0.35) {
          this.landTimer = 0.25;
          this.model.animator.once('land', 0.08, 1.2);
          this.onLand?.();
        }
        this.pos.y = g;
        this.vel.y = 0;
        this.grounded = true;
        this.airTime = 0;
      } else {
        this.grounded = false;
        this.airTime += dt;
      }
      // a ceiling (cave roof, bridge from below) stops upward motion
      if (this.vel.y > 0 && this.physics.raycast(this.pos.x, this.pos.y + this.height, this.pos.z, 0, 1, 0, 0.3, 0.05) < 0.3) this.vel.y = 0;

      const hspeed = Math.hypot(this.vel.x, this.vel.z);
      if (!this.grounded) this.state = this.gliding ? 'glide' : 'air';
      else if (this.crouching) this.state = hspeed > 0.3 ? 'sneak' : 'crouch';
      else if (hspeed > 5) this.state = 'run';
      else if (hspeed > 0.4) this.state = 'walk';
      else this.state = 'idle';
      this.noise = this.state === 'run' ? 1 : this.state === 'walk' ? 0.45 : this.state === 'sneak' ? 0.12 : this.state === 'crouch' ? 0.05 : this.state === 'air' ? 0.8 : 0.15;
      if (this.state === 'run' || this.state === 'air') this.calmFor = 0;
      else this.calmFor += dt;

      // footsteps
      if (this.grounded && hspeed > 0.4) {
        this.stepTimer -= dt * (hspeed / 3.8);
        if (this.stepTimer <= 0) {
          this.stepTimer = this.crouching ? 0.7 : 0.42;
          this.onStep?.(this.terrain.surfaceAt(this.pos.x, this.pos.z));
        }
      }
    }

    // facing: first person follows the camera, third person turns toward motion
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (rig.mode === 'first') this.yaw = rig.yaw + Math.PI;
    else if (hv > 0.3) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * (this.swimming ? 5 : 12));
    }

    // safety net: remember safe ground, recover if we fall out of the world
    this.safeTimer -= dt;
    if (this.grounded && this.safeTimer <= 0) {
      this.lastSafe.copy(this.pos);
      this.safeTimer = 1;
    }
    if (this.pos.y < -12) this.place(this.lastSafe.x, this.lastSafe.y + 0.5, this.lastSafe.z, this.yaw);

    this.syncModel(dt);
  }

  private syncModel(dt: number): void {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    const a = m.animator;
    const hv = Math.hypot(this.vel.x, this.vel.z);
    switch (this.state) {
      case 'swim':
      case 'dive':
        a.play(hv > 0.4 || this.diving ? 'swim' : 'tread', 0.3);
        break;
      case 'glide':
        a.play('glide', 0.2);
        break;
      case 'air':
        a.play(this.vel.y > 0.5 ? 'jump' : 'fall', 0.18);
        break;
      case 'crouch':
        a.play('crouch', 0.2);
        break;
      case 'sneak':
        a.play('sneak', 0.2, Math.max(0.6, hv / 1.8));
        break;
      case 'run':
        a.play('run', 0.2, Math.max(0.8, hv / 6.8));
        break;
      case 'walk':
        a.play('walk', 0.2, Math.max(0.6, hv / 3.6));
        break;
      default:
        a.play('idle', 0.25);
    }
    if (this.landTimer > 0) this.landTimer -= dt;
    m.update(dt);
  }

  /** Positions the first-person hand in front of the camera. */
  updateHand(camera: PerspectiveCamera, dt: number, firstPerson: boolean, moving: number): void {
    this.hand.visible = firstPerson && !this.frozen;
    if (!this.hand.visible) return;
    this.handPulse = Math.max(0, this.handPulse - dt * 1.5);
    const t = performance.now() / 1000;
    const bob = Math.sin(t * 9) * 0.012 * moving;
    this.hand.position.set(0.3, -0.3 + bob + this.handPulse * 0.05, -0.62 - this.handPulse * 0.08);
    this.hand.rotation.set(-0.25 + this.handPulse * 0.4, 0.35, 0.15);
    this.hand.scale.setScalar(0.7);
    this.deviceGlow.emissiveIntensity = 1 + this.handPulse * 3 + Math.sin(t * 3) * 0.2;
    if (this.hand.parent !== camera) camera.add(this.hand);
  }

  dispose(): void {
    this.model.dispose();
    this.hand.removeFromParent();
  }
}
