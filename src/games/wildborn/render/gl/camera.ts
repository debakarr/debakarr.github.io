// The camera rig. Two modes over one camera object:
//
// - third person: orbits behind the player, pulled in when something would clip
//   through the ground, looking slightly down;
// - first person: at eye height, looking where you look.
//
// Both share yaw/pitch, damping and the same input handling, so switching modes
// keeps your heading. Movement is expressed in tile space; the rig converts.

import { PerspectiveCamera, Vector3 } from 'three';
import { groundAt } from './terrain';
import { EYE_HEIGHT } from './stage';
import type { WorldMap } from '../../sim/world';

export type CameraMode = 'third' | 'first';

const PITCH_MIN = -0.5;
const PITCH_MAX = 1.15;

export class CameraRig {
  mode: CameraMode = 'third';
  /** Distance behind the player in third person. */
  distance = 6.4;
  private targetYaw = Math.PI;
  private targetPitch = 0.34;
  private smoothYaw = Math.PI;
  private smoothPitch = 0.34;
  private pos = new Vector3();
  private aim = new Vector3();
  private player = new Vector3();

  constructor(readonly camera: PerspectiveCamera) {}

  /** Where the camera is actually pointing, for tests and the debug overlay. */
  get yaw(): number {
    return this.smoothYaw;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  toggle(): CameraMode {
    this.mode = this.mode === 'third' ? 'first' : 'third';
    return this.mode;
  }

  /** Drag to look. dx/dy in pixels. */
  look(dx: number, dy: number, sensitivity = 0.0045): void {
    this.targetYaw -= dx * sensitivity;
    this.targetPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.targetPitch + dy * sensitivity));
  }

  /** Pinch or wheel to zoom, in third person. */
  zoom(delta: number): void {
    this.distance = Math.max(2.2, Math.min(14, this.distance + delta));
  }

  /**
   * Place the camera for a player at tile (x, y).
   * `dt` damps the motion so the view never snaps.
   */
  update(dt: number, map: WorldMap, x: number, y: number): void {
    // Keep the shortest angular distance when the target crosses the seam.
    let diff = ((this.targetYaw - this.smoothYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.smoothYaw += diff * Math.min(1, dt * 11);
    this.smoothPitch += (this.targetPitch - this.smoothPitch) * Math.min(1, dt * 11);

    const gy = groundAt(map, x, y);
    this.player.set(x + 0.5, gy, y + 0.5);

    if (this.mode === 'first') {
      // At the eyes, looking along yaw/pitch. Nudge forward so the near plane
      // does not clip into the player's own chest.
      const cp = Math.cos(this.smoothPitch);
      this.pos.set(
        this.player.x + Math.sin(this.smoothYaw) * cp * 0.16,
        this.player.y + EYE_HEIGHT,
        this.player.z + Math.cos(this.smoothYaw) * cp * 0.16,
      );
      this.aim.set(
        this.pos.x + Math.sin(this.smoothYaw) * cp,
        this.pos.y - Math.sin(this.smoothPitch),
        this.pos.z + Math.cos(this.smoothYaw) * cp,
      );
    } else {
      const cp = Math.cos(this.smoothPitch);
      const back = this.distance;
      // The orbit point, then clamped so the camera never enters the ground.
      const ox = this.player.x + Math.sin(this.smoothYaw) * cp * back;
      const oz = this.player.z + Math.cos(this.smoothYaw) * cp * back;
      const oy = this.player.y + 1.5 + Math.sin(this.smoothPitch) * back;
      const floor = groundAt(map, ox, oz) + 0.85;
      this.pos.set(ox, Math.max(oy, floor), oz);
      // Look a little ahead of the player so the figure sits low in frame.
      this.aim.set(this.player.x, this.player.y + 1.15, this.player.z);
    }

    this.camera.position.lerp(this.pos, Math.min(1, dt * 14));
    this.camera.lookAt(this.aim);
  }

  /** Snap straight to the target, e.g. when a save is loaded. */
  snap(map: WorldMap, x: number, y: number): void {
    this.smoothYaw = this.targetYaw;
    this.smoothPitch = this.targetPitch;
    this.update(1, map, x, y);
    this.camera.position.copy(this.pos);
  }

  /** Unit vector the camera is looking along, on the ground plane. */
  forward(): { x: number; z: number } {
    return { x: Math.sin(this.smoothYaw), z: Math.cos(this.smoothYaw) };
  }
}