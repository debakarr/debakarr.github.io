// What the app needs from an overworld view. Two implementations satisfy it:
// the lit 2.5D canvas renderer (`./world`) and the 3D scene (`./gl/world3d`),
// which is used whenever WebGL is available.

import type { Game } from '../sim/game';
import type { WorldMap } from '../sim/world';
import { World3D } from './gl/world3d';
import { WorldRenderer } from './world';

export interface WorldView {
  /** Which renderer this is, for the debug overlay and the fallback path. */
  readonly kind: 'gl' | 'flat';
  /** Match the drawing buffer to the element's size. */
  resize(): void;
  /** Which tile a point on the canvas (CSS px, canvas-relative) is over. */
  tileAt(px: number, py: number, map: WorldMap): { x: number; y: number };
  /** Note which way the player is heading, for the avatar. */
  face(dir: string): void;
  /** Flash the screen when an encounter starts. */
  encounterFlash(): void;
  /** Snap any smoothing to the player's current position (used on load). */
  reset(game: Game): void;
  /** Advance the world by one animation frame. */
  draw(game: Game, now: number): void;
  /** Release GPU resources. */
  dispose(): void;
}

/** True when this browser can give us a WebGL context. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Build the best available view: the 3D scene when WebGL works, otherwise the
 * 2.5D canvas renderer, which stays as the fallback so the game always runs.
 */
export function createWorldView(canvas: HTMLCanvasElement): WorldView {
  if (webglAvailable()) {
    try {
      return new World3D(canvas);
    } catch (err) {
      // A driver can refuse a context mid-construction; the flat view is fine.
      console.warn('Wildborn: 3D unavailable, using the 2.5D view.', err);
    }
  }
  return new WorldRenderer(canvas);
}