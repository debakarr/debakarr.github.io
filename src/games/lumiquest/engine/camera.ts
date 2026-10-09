// One camera rig, two modes. Third person orbits over the shoulder and
// pulls in when terrain or a wall would block the view; first person sits
// at eye height. Both share yaw/pitch so switching never loses your aim.
// Cinematic shots (intro, beacon) and framing (dialogue, bonding) blend in
// over the same rig.

import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { CameraMode } from '../systems/state';
import type { CollisionWorld } from './physics';

const tmp = new Vector3();
const tmp2 = new Vector3();

export interface Shot {
  pos: Vector3;
  look: Vector3;
}

export class CameraRig {
  readonly camera: PerspectiveCamera;
  mode: CameraMode = 'third';
  yaw = Math.PI;
  pitch = -0.18;
  distance = 4.4;
  private boom = 4.4;
  private blend = 1;
  private fromPos = new Vector3();
  private fromLook = new Vector3();
  /** Optional shot that overrides the rig (0..1 weight eased in/out). */
  shot: Shot | null = null;
  private shotW = 0;
  readonly look = new Vector3();
  sensitivity = 1;
  invertY = false;
  private lastPos = new Vector3();
  private lastLook = new Vector3();

  constructor(aspect: number, fov = 62) {
    this.camera = new PerspectiveCamera(fov, aspect, 0.08, 1400);
    this.camera.layers.enable(0);
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.fromPos.copy(this.camera.position);
    this.fromLook.copy(this.lastLook);
    this.blend = 0;
    this.mode = mode;
    if (mode === 'first') this.pitch = MathUtils.clamp(this.pitch, -1.45, 1.45);
    else this.pitch = MathUtils.clamp(this.pitch, -1.15, 0.55);
  }

  applyLook(dx: number, dy: number, zoom: number): void {
    const s = 0.0026 * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (this.invertY ? -1 : 1);
    if (this.mode === 'first') this.pitch = MathUtils.clamp(this.pitch, -1.45, 1.45);
    else this.pitch = MathUtils.clamp(this.pitch, -1.15, 0.55);
    if (zoom) this.distance = MathUtils.clamp(this.distance + zoom * 0.45, 2.2, 8.5);
  }

  /** Forward direction on the ground plane. */
  forward(out = new Vector3()): Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Aim direction (with pitch). */
  aim(out = new Vector3()): Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  /**
   * Places the camera for a player whose feet are at `feet`. `eye` is the
   * eye height (lower when crouching or swimming).
   */
  update(dt: number, feet: Vector3, eye: number, physics: CollisionWorld): void {
    const pos = tmp;
    const look = tmp2;
    if (this.mode === 'first') {
      pos.set(feet.x, feet.y + eye, feet.z);
      this.aim(look).add(pos);
    } else {
      const head = new Vector3(feet.x, feet.y + Math.min(eye, 1.25) + 0.15, feet.z);
      const dir = this.aim(new Vector3()).negate();
      // shoulder offset to the right of the view
      const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const pivot = head.clone().addScaledVector(right, 0.42);
      const hit = physics.raycast(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, this.distance, 0.3);
      // pull in quickly, ease back out
      this.boom = hit < this.boom ? hit : this.boom + (hit - this.boom) * Math.min(1, dt * 3);
      pos.copy(pivot).addScaledVector(dir, this.boom);
      const g = physics.terrain.height(pos.x, pos.z) + 0.35;
      if (pos.y < g) pos.y = g;
      look.copy(pivot).addScaledVector(this.aim(new Vector3()), 6);
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt * 4);
      const k = this.blend * this.blend * (3 - 2 * this.blend);
      pos.lerpVectors(this.fromPos, pos.clone(), k);
      look.lerpVectors(this.fromLook, look.clone(), k);
    }
    const wantShot = this.shot ? 1 : 0;
    this.shotW += (wantShot - this.shotW) * Math.min(1, dt * 2.4);
    if (this.shot && this.shotW > 0.001) {
      pos.lerp(this.shot.pos, this.shotW);
      look.lerp(this.shot.look, this.shotW);
    } else if (!this.shot && this.shotW > 0.001 && this.lastShot) {
      pos.lerp(this.lastShot.pos, this.shotW);
      look.lerp(this.lastShot.look, this.shotW);
    }
    if (this.shot) this.lastShot = { pos: this.shot.pos.clone(), look: this.shot.look.clone() };
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    this.lastPos.copy(pos);
    this.lastLook.copy(look);
    this.look.copy(look);
  }

  private lastShot: Shot | null = null;

  /** Jumps straight to the current target (no blending), e.g. after loading. */
  snap(): void {
    this.blend = 1;
    this.shotW = this.shot ? 1 : 0;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
