// The 3D overworld: the WorldView the app drives, built out of the stage,
// terrain, props, actor, camera rig and weather. Tap-to-walk picks a tile by
// casting the camera ray onto the ground, and the avatar eases between tiles so
// walking looks continuous.

import { type Group, Raycaster, Vector2 } from 'three';
import type { Game } from '../../sim/game';
import { findPath, type WorldMap } from '../../sim/world';
import type { WorldView } from '../view';
import { Actor } from './actor';
import { CameraRig, type CameraMode } from './camera';
import { PROP_VIEW, Props } from './props';
import { buildCreature } from './creature3d';
import { Stage, sunAt } from './stage';
import { Terrain, groundAt } from './terrain';
import { Weather } from './weather';

export class World3D implements WorldView {
  readonly kind = 'gl' as const;
  readonly stage: Stage;
  readonly rig: CameraRig;
  private terrain: Terrain | null = null;
  private props: Props | null = null;
  private actor = new Actor();
  private weather = new Weather();
  /** The 3D model of the wild creature in state, when there is one. */
  private creature: Group | null = null;
  private creatureFor: string | null = null;
  private map: WorldMap | null = null;
  private builtFor: WorldMap | null = null;
  /** Smoothed avatar position in tile units. */
  private ax = 0;
  private ay = 0;
  private lastX = 0;
  private lastY = 0;
  private flash = 0;
  private raycaster = new Raycaster();
  private ndc = new Vector2();
  private hit = new Vector2();
  private prev = 0;
  // --- adaptive quality: phones and slow machines get a cheaper scene -------
  /** 3 is full quality, 0 is the cheapest. */
  private quality = 3;
  /** Rolling average of frame time in ms, and how long we have been over/under. */
  private frameAvg = 16;
  private overSince = 0;
  private underSince = 0;
  /** Seconds of tuning to ignore, while a freshly built world settles. */
  private settleUntil = 2;
  // --- encounter framing: push in and level out until the encounter ends ----
  /** True while a wild creature is in state (sets apart from clearing it). */
  private wasWild = false;
  private distBeforeWild = 6.4;
  private pitchBeforeWild = 0.34;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new Stage(canvas);
    this.rig = new CameraRig(this.stage.camera);
    this.stage.scene.add(this.actor.group, this.weather.mesh);
    // Start at full quality; the controller steps down if frames are slow.
    this.setQuality(3);
  }

  /** Build (or rebuild) the static world for a map. */
  private ensureWorld(map: WorldMap): void {
    if (this.builtFor === map) return;
    this.builtFor = map;
    this.map = map;
    // Drop the old world before making the new one, so starting a new game does
    // not keep the previous world's meshes alive.
    if (this.terrain) {
      this.stage.scene.remove(this.terrain.group);
      this.terrain.dispose();
    }
    if (this.props) {
      this.stage.scene.remove(this.props.group);
      this.props.dispose();
    }
    this.terrain = new Terrain(map);
    this.props = new Props(map);
    this.stage.scene.add(this.terrain.group, this.props.group);
    this.ax = map.spawn.x;
    this.ay = map.spawn.y;
    // Building the meshes costs a frame or two; ignore that while tuning.
    this.settleUntil = 2;
    // A world change means any wild creature in play is a new one.
    this.clearCreature();
  }

  /** Remove the wild creature model from the scene. */
  private clearCreature(): void {
    if (this.creature) {
      this.stage.scene.remove(this.creature);
      this.creature.traverse((o) => {
        const m = o as { geometry?: { dispose: () => void } };
        m.geometry?.dispose();
      });
      this.creature = null;
    }
    this.creatureFor = null;
  }

  /**
   * Keep a 3D model of the wild creature in state. It stands a couple of tiles
   * in front of you in the direction the camera is looking, facing you, so
   * meeting something in the grass actually looks like meeting something.
   */
  private syncCreature(game: Game, now: number): void {
    const wild = game.state.wild;
    if (!wild) {
      this.clearCreature();
      return;
    }
    if (this.creatureFor !== wild.id) {
      this.clearCreature();
      this.creature = buildCreature({ speciesId: wild.speciesId, id: wild.id, variant: wild.variant, genome: wild.genome });
      this.creatureFor = wild.id;
      const forward = this.rig.forward();
      const px = this.ax + 0.5;
      const pz = this.ay + 0.5;
      // In front of you, but off to one side so you do not stand in it.
      const ahead = 2.7;
      const over = 0.85;
      const cx = px + forward.x * ahead + forward.z * over;
      const cz = pz + forward.z * ahead - forward.x * over;
      const groundY = groundAt(this.map!, cx, cz);
      this.creature.position.set(cx, groundY, cz);
      this.creature.rotation.y = Math.atan2(px - cx, pz - cz);
      this.stage.scene.add(this.creature);
    } else if (this.creature) {
      // Bob and breathe so it is a meeting, not a taxidermy mount.
      const phase = (this.creature.userData.phase as number) ?? 0;
      this.creature.position.y = groundAt(this.map!, this.creature.position.x, this.creature.position.z) + Math.sin(now / 520 + phase) * 0.045;
      this.creature.rotation.z = Math.sin(now / 700 + phase) * 0.03;
    }
  }

  resize(): void {
    this.stage.resize();
  }

  /** Switch the camera between third and first person. */
  setCameraMode(mode: CameraMode): void {
    this.rig.setMode(mode);
    // In first person the figure would fill the screen.
    this.actor.setVisible(mode === 'third');
  }

  /** Flip between the two modes and report the new one. */
  toggleCamera(): CameraMode {
    const mode = this.rig.toggle();
    this.actor.setVisible(mode === 'third');
    return mode;
  }

  get cameraMode(): CameraMode {
    return this.rig.mode;
  }

  /** Look around, from a drag in pixels. */
  look(dx: number, dy: number): void {
    this.rig.look(dx, dy);
  }

  zoom(delta: number): void {
    this.rig.zoom(delta);
  }

  /** Which tile a point on the canvas is over, by casting onto the ground. */
  tileAt(px: number, py: number, map: WorldMap): { x: number; y: number } {
    this.stage.resize();
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    const origin = this.raycaster.ray.origin;
    const dir = this.raycaster.ray.direction;
    // Intersect the horizontal plane through the player's feet.
    const feet = groundAt(map, this.ax, this.ay);
    if (Math.abs(dir.y) < 0.0005) return { x: Math.round(this.ax), y: Math.round(this.ay) };
    const t = (feet + 0.05 - origin.y) / dir.y;
    if (t <= 0) return { x: Math.round(this.ax), y: Math.round(this.ay) };
    this.hit.set(origin.x + dir.x * t, origin.z + dir.z * t);
    const x = Math.floor(this.hit.x);
    const y = Math.floor(this.hit.y);
    // A tap far off in the distance is almost certainly a mis-tap, so cap how
    // far the player will be asked to walk.
    const dx = x - this.ax;
    const dy = y - this.ay;
    const dist = Math.hypot(dx, dy);
    if (dist > 34) return { x: Math.round(this.ax), y: Math.round(this.ay) };
    return { x, y };
  }

  /** A walkable path to a tile, or null. Shared with the app for tap-to-move. */
  pathTo(map: WorldMap, x: number, y: number): { x: number; y: number }[] | null {
    return findPath(map, { x: this.ax, y: this.ay }, { x, y });
  }

  face(dir: string): void {
    this.actor.faceDir(dir);
  }

  encounterFlash(): void {
    this.flash = 1;
  }

  reset(game: Game): void {
    this.ax = game.state.x;
    this.ay = game.state.y;
    this.actor.group.position.set(this.ax, 0, this.ay);
    this.rig.snap(this.map ?? game.world, this.ax, this.ay);
  }

  draw(game: Game, now: number): void {
    const map = game.world;
    this.ensureWorld(map);
    const s = game.state;
    const dt = this.prev ? Math.min(0.1, (now - this.prev) / 1000) : 0.016;
    this.prev = now;

    // Ease the avatar toward its tile, so walking reads as motion.
    const speed = 0.34;
    this.ax += (s.x - this.ax) * speed;
    this.ay += (s.y - this.ay) * speed;
    const moved = Math.hypot(this.ax - this.lastX, this.ay - this.lastY);
    if (moved > 0.0005) this.actor.faceTowards(this.ax - this.lastX, this.ay - this.lastY);
    this.lastX = this.ax;
    this.lastY = this.ay;

    const groundY = groundAt(map, this.ax, this.ay);
    this.actor.update(dt, moved, groundY);
    this.actor.group.position.x = this.ax + 0.5;
    this.actor.group.position.z = this.ay + 0.5;

    // A wild creature you meet stands up in front of you.
    this.syncCreature(game, now);

    // Light and weather for the hour.
    const sun = sunAt(s.hour);
    this.stage.applyLight(sun);
    this.stage.followShadow(this.ax + 0.5, this.ay + 0.5);
    this.props?.rebuild(this.ax, this.ay, s.picked, s.day);
    this.terrain?.update(now, sun.night);
    this.weather.setWeather(s.weather);
    this.weather.applyFog(this.stage.fog, s.weather);
    this.weather.update(dt, this.stage.camera.position, s.weather === 'storm');

    // During a wild encounter the bottom sheet frames the scene: tilt the aim
    // down to push the player and creature into the visible strip above it.
    this.rig.aimDrop = game.state.wild ? 1.15 : 0;
    // Push in on the player and meet the creature more face-on. The values are
    // restored when state.wild clears.
    if (game.state.wild && !this.wasWild) {
      this.distBeforeWild = this.rig.distance;
      this.pitchBeforeWild = this.rig.targetPitch;
    }
    if (!game.state.wild && this.wasWild) {
      this.rig.distance = this.distBeforeWild;
      this.rig.targetPitch = this.pitchBeforeWild;
    }
    if (game.state.wild) {
      this.rig.distance += (4.4 - this.rig.distance) * 0.06;
      this.rig.targetPitch += (0.55 - this.rig.targetPitch) * 0.06;
    }
    this.wasWild = !!game.state.wild;
    this.rig.update(dt, map, this.ax, this.ay);

    // A white wash on an encounter, and a lightning flash on a storm.
    let wash = 0;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 1.6);
      wash = this.flash * 0.35;
    }
    wash = Math.max(wash, this.weather.flash(now, s.weather));
    if (wash > 0) {
      // The cheapest way to flash the whole frame: lean the exposure up.
      this.stage.renderer.toneMappingExposure = (sun.night ? 1.25 : 1.05) + wash;
    }
    this.stage.render();
    this.tuneQuality(dt);
  }

  /** Current quality level, for the debug overlay and the smoke tests. */
  get qualityLevel(): number {
    return this.quality;
  }

  /**
   * Turn a screen-space input direction into a tile direction, so "forward"
   * means away from the camera rather than north. Without this, walking in a 3D
   * view feels broken the moment the camera is not facing north.
   */
  rotateInput(dx: number, dy: number): { dx: number; dy: number } {
    const f = this.rig.forward();
    // Forward is (-dy) in screen terms; screen-right is the perpendicular
    // (-f.z, f.x). The camera-relative test verifies both directions.
    let wx = f.x * -dy + -f.z * dx;
    let wz = f.z * -dy + f.x * dx;
    const len = Math.hypot(wx, wz);
    if (len < 0.0001) return { dx: 0, dy: 0 };
    wx /= len;
    wz /= len;
    // The sim walks on a tile grid, so snap to the dominant axis.
    return Math.abs(wx) >= Math.abs(wz) ? { dx: Math.sign(wx), dy: 0 } : { dx: 0, dy: Math.sign(wz) };
  }

  /**
   * Watch the frame time and step the scene down when it is too slow, back up
   * when there is headroom. Phones that cannot hold 60fps get shadows and prop
   * distance trimmed rather than a slideshow.
   */
  private tuneQuality(dt: number): void {
    const ms = dt * 1000;
    this.frameAvg += (ms - this.frameAvg) * 0.08;
    // Building a world (meshes, textures) stalls a frame; do not react to it.
    if (this.settleUntil > 0) {
      this.settleUntil -= dt;
      this.frameAvg = 16;
      return;
    }
    // A 30fps cap still looks smooth, so do not degrade until well past it.
    if (this.frameAvg > 30 && this.quality > 0) {
      this.underSince = 0;
      this.overSince += dt;
      if (this.overSince > 2.5) {
        this.setQuality(this.quality - 1);
        this.overSince = 0;
        this.frameAvg = 16;
      }
      return;
    }
    if (this.frameAvg < 13 && this.quality < 3) {
      this.overSince = 0;
      this.underSince += dt;
      // Step back up slowly, and only after a sustained comfortable stretch.
      if (this.underSince > 6) {
        this.setQuality(this.quality + 1);
        this.underSince = 0;
        this.frameAvg = 16;
      }
      return;
    }
    this.overSince = 0;
    this.underSince = 0;
  }

  /**
   * Shadows stay on at every level: they are the main cue that separates an
   * object from the ground, and a scene without them reads as cardboard
   * cut-outs no matter how good the rest of it is. What a slow machine loses is
   * resolution and distance instead.
   */
  private setQuality(level: number): void {
    this.quality = Math.max(0, Math.min(3, level));
    // The shadow volume is tight (+-26 units), so 1024 is already ~20 texels
    // per unit; bigger maps cost memory and, on software renderers, can kill
    // the context entirely. Quality differences come from resolution and draw
    // distance instead.
    this.stage.renderer.shadowMap.enabled = true;
    this.stage.maxDpr = [0.7, 0.9, 1.2, 1.75][this.quality];
    this.stage.resize();
    this.props?.setView(PROP_VIEW[this.quality]);
    // No material recompile: shadows are always on now, and touching every
    // material in a scene this size costs seconds and can drop the context.
  }

  dispose(): void {
    this.terrain?.dispose();
    this.props?.dispose();
    this.actor.dispose();
    this.weather.dispose();
    this.clearCreature();
    this.stage.dispose();
  }
}