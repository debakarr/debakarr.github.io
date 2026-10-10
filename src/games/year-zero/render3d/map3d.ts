// The 3D world map. It implements the same MapView contract as the old canvas
// renderer, so the app, input and minimap keep working unchanged: the camera
// is still {x, y, zoom} in map pixels, and screen <-> world conversions ray-
// cast onto the ground. Zooming moves through three views — a strategic
// overview with hex lines, a regional view, and a low close-up where cities
// and soldiers fill the screen.

import {
  AdditiveBlending,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Raycaster,
  RingGeometry,
  CircleGeometry,
  Scene,
  Vector2,
  Vector3,
} from 'three';
import type { Game } from '../sim/game';
import type { Camera, EffectKind, MapView, Overlay } from '../render/view';
import { Cities } from './cities';
import { Labels } from './labels';
import { Props } from './props';
import { Rivers } from './rivers';
import { LAND_Y, Shape } from './shape';
import type { Stage, StageScene } from './stage';
import { Terrain, TileState } from './terrain';
import { Units } from './units';
import { Water } from './water';

export const HEX = 32;
const FOV = 30;
const MAX_ZOOM = 6.5;
/** Zoom where the tilt reaches its usual low angle; beyond it the close-up tilts a little further. */
const TILT_ZOOM = 3.6;


interface Fx {
  obj: Object3D;
  start: number;
  dur: number;
  kind: EffectKind;
}

export class Map3D implements MapView, StageScene {
  readonly canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 600);
  readonly bloom = 0.22;
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  overlay: Overlay = {
    selectedTile: -1, selectedUnit: -1, hoverTile: -1, reach: null, attack: null, path: null, pathTurns: null, pathAttack: false,
  };
  animations = true;
  onCamera?: () => void;
  /** Shows the whole map regardless of fog (title backdrops, debugging). */
  reveal = false;
  /** Closest zoom (raised by tests to inspect models). */
  maxZoom = MAX_ZOOM;

  private g!: Game;
  private stage: Stage;
  private w = 1;
  private h = 1;
  private shape!: Shape;
  private tiles!: TileState;
  private terrain: Terrain | null = null;
  private water: Water | null = null;
  private rivers: Rivers | null = null;
  props: Props | null = null;
  cities: Cities | null = null;
  units: Units | null = null;
  readonly labels: Labels;
  private world = new Group();
  private sun = new DirectionalLight('#fff0d6', 2.4);
  private hemi = new HemisphereLight('#cfe6ff', '#6f6a48', 0.85);
  private ray = new Raycaster();
  private ground = new Plane(new Vector3(0, 1, 0), -LAND_Y);
  private stateDirty = true;
  private worldDirty = true;
  private unitsDirty = true;
  private fx: Fx[] = [];
  private camKey = '';
  private camTween: { from: [number, number]; to: [number, number]; start: number } | null = null;
  private pathObj: Object3D | null = null;
  private pathKey = '';

  constructor(stage: Stage, g: Game, labelRoot: HTMLElement) {
    this.stage = stage;
    this.canvas = stage.canvas;
    this.labels = new Labels(labelRoot);
    this.scene.background = new Color('#cfdcef');
    this.scene.fog = new Fog('#cfdcef', 200, 600);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.world);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.setGame(g);
  }

  // --- Game ---------------------------------------------------------------------------

  setGame(g: Game): void {
    const fresh = !this.g || this.g.s.map !== g.s.map;
    this.g = g;
    if (fresh) this.rebuildWorld();
    this.fx.forEach((f) => f.obj.parent?.remove(f.obj));
    this.fx = [];
    this.units?.reset();
    this.invalidate();
  }

  private rebuildWorld(): void {
    const g = this.g;
    const map = g.s.map;
    for (const part of [this.terrain, this.water, this.rivers, this.props, this.cities, this.units]) {
      if (!part) continue;
      part.dispose();
    }
    this.world.clear();
    this.shape = new Shape(map, g.grid);
    this.tiles = new TileState(map.w, map.h);
    const u = this.tiles.uniforms;
    this.terrain = new Terrain(this.shape, u);
    const [ww, wh] = [g.grid.pixelWidth(1), g.grid.pixelHeight(1)];
    this.water = new Water(u, ww, wh);
    this.rivers = new Rivers(this.shape, u);
    this.props = new Props(this.shape, u);
    this.cities = new Cities(this.shape, u);
    this.units = new Units(this.shape, u);
    this.world.add(this.water.mesh, this.terrain.group, this.rivers.group, this.props.group, this.cities.group, this.units.group);
    this.worldDirty = true;
  }

  /** The world changed (moves, turns, cities): refresh everything that depends on it. */
  invalidate(): void {
    this.worldDirty = true;
    this.unitsDirty = true;
    this.stateDirty = true;
  }

  /** The overlay or camera changed. */
  request(): void {
    this.stateDirty = true;
  }

  get game(): Game {
    return this.g;
  }

  get shapeOf(): Shape {
    return this.shape;
  }

  // --- Size & camera -----------------------------------------------------------------------

  resize(w?: number, h?: number): void {
    if (w === undefined || h === undefined) {
      this.stage.resize();
      w = this.stage.width;
      h = this.stage.height;
    }
    this.w = w;
    this.h = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.clampCamera();
    this.placeCamera();
    this.labels.resize(w, h);
  }

  get viewW(): number {
    return this.w;
  }

  get viewH(): number {
    return this.h;
  }

  worldSize(): [number, number] {
    return [this.g.grid.pixelWidth(HEX), this.g.grid.pixelHeight(HEX)];
  }

  private minZoom(): number {
    const [ww, wh] = this.worldSize();
    return Math.max(0.16, Math.min(this.w / ww, this.h / wh) * 0.95);
  }

  clampCamera(): void {
    const [ww, wh] = this.worldSize();
    this.cam.zoom = Math.max(this.minZoom(), Math.min(this.maxZoom, this.cam.zoom));
    this.cam.x = Math.max(0, Math.min(ww, this.cam.x));
    this.cam.y = Math.max(HEX * 0.5, Math.min(wh, this.cam.y));
  }

  /** Camera tilt (radians above the horizon) for a zoom level: steep overview, low close-up. */
  pitch(zoom = this.cam.zoom): number {
    const t = Math.max(0, Math.min(1, (Math.log(zoom) - Math.log(0.4)) / (Math.log(TILT_ZOOM) - Math.log(0.4))));
    const close = Math.max(0, Math.min(1, (Math.log(zoom) - Math.log(TILT_ZOOM)) / (Math.log(MAX_ZOOM) - Math.log(TILT_ZOOM))));
    return ((66 - 32 * Math.pow(t, 1.1) - 7 * close) * Math.PI) / 180;
  }

  /** Distance from the camera to its target. */
  private distance(): number {
    return this.h / (2 * Math.tan((FOV * Math.PI) / 360) * HEX * this.cam.zoom);
  }

  private placeCamera(): void {
    const p = this.pitch();
    const d = this.distance();
    const tx = this.cam.x / HEX;
    const tz = this.cam.y / HEX;
    this.camera.position.set(tx, LAND_Y + Math.sin(p) * d, tz + Math.cos(p) * d);
    this.camera.lookAt(tx, LAND_Y, tz);
    this.camera.near = Math.max(0.05, d * 0.05);
    this.camera.far = d * 4 + 60;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // the sun follows the view so shadows stay sharp where we look
    const half = Math.min(40, Math.max(5, d * 0.7));
    this.sun.position.set(tx - 6.5, 12, tz + 4.5);
    this.sun.target.position.set(tx, 0, tz);
    this.sun.target.updateMatrixWorld();
    const sc = this.sun.shadow.camera;
    sc.left = -half * 1.4;
    sc.right = half * 1.4;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 0.5;
    sc.far = 60;
    sc.updateProjectionMatrix();
    const q = this.stage.quality;
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as never;
    }
    this.sun.castShadow = q !== 'low' && d < 70;
    this.water?.material.uniforms.uSun.value.copy(this.sun.position).sub(this.sun.target.position).normalize();
    // strategic zoom shows the hex lattice; it fades as we come closer
    const z = this.cam.zoom;
    this.tiles.uniforms.uGrid.value = 0.1 + 0.3 * (1 - Math.min(1, Math.max(0, (z - 0.45) / 1.4)));
    if (this.scene.fog instanceof Fog) {
      this.scene.fog.near = d * 2.2;
      this.scene.fog.far = d * 5 + 40;
    }
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    this.placeCamera();
    const p = this.groundAt(sx, sy, LAND_Y);
    return [p.x * HEX, p.z * HEX];
  }

  private groundAt(sx: number, sy: number, y: number): Vector3 {
    const ndc = new Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    this.ground.constant = -y;
    const out = new Vector3();
    const dir = this.ray.ray.direction;
    if (dir.y > -0.02) {
      // above the horizon: clamp to a far point along the view
      dir.y = -0.02;
      dir.normalize();
    }
    this.ray.ray.intersectPlane(this.ground, out);
    return out;
  }

  worldToScreen(x: number, y: number): [number, number] {
    return this.project(x / HEX, LAND_Y, y / HEX);
  }

  /** Screen position of a 3D point. */
  project(x: number, y: number, z: number): [number, number] {
    const v = new Vector3(x, y, z).project(this.camera);
    return [((v.x + 1) / 2) * this.w, ((1 - v.y) / 2) * this.h];
  }

  tileAt(sx: number, sy: number): number {
    this.placeCamera();
    // units and cities stand above the ground: prefer what the pointer is on
    const hit = this.units?.pick(this, sx, sy) ?? -1;
    if (hit >= 0) return hit;
    let p = this.groundAt(sx, sy, LAND_Y);
    let t = this.g.grid.pick(p.x, p.z, 1);
    if (t >= 0) {
      // refine once with the real ground height (hills)
      const y = this.shape.height(t, p.x, p.z);
      p = this.groundAt(sx, sy, y);
      t = this.g.grid.pick(p.x, p.z, 1);
    }
    return t;
  }

  tileScreen(tile: number): [number, number] {
    const [x, y] = this.g.grid.center(tile, HEX);
    return this.worldToScreen(x, y);
  }

  pan(dx: number, dy: number): void {
    this.camTween = null;
    this.zoomGlide = null;
    // keep the ground under the pointer: vertical drags cover more ground when tilted
    const k = 1 / Math.max(0.55, Math.sin(this.pitch()));
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= (dy / this.cam.zoom) * k;
    this.clampCamera();
    this.request();
    this.onCamera?.();
  }

  zoomAt(factor: number, sx: number, sy: number, smooth = false): void {
    this.camTween = null;
    if (smooth && this.animations) {
      // glide toward the new zoom over a few frames, around the same point
      const base = this.zoomGlide ? this.zoomGlide.target : this.cam.zoom;
      const target = Math.max(this.minZoom(), Math.min(this.maxZoom, base * factor));
      this.zoomGlide = { target, sx, sy };
      return;
    }
    this.zoomGlide = null;
    this.applyZoom(factor, sx, sy);
  }

  private zoomGlide: { target: number; sx: number; sy: number } | null = null;

  private applyZoom(factor: number, sx: number, sy: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.cam.zoom *= factor;
    this.clampCamera();
    const [nx, ny] = this.screenToWorld(sx, sy);
    this.cam.x += wx - nx;
    this.cam.y += wy - ny;
    this.clampCamera();
    this.request();
    this.onCamera?.();
  }

  centerOn(tile: number, smooth = true, lift = 0, shift = 0): void {
    if (tile < 0) return;
    const [x0, y0] = this.g.grid.center(tile, HEX);
    const x = x0 + shift / this.cam.zoom;
    const y = y0 + lift / this.cam.zoom;
    if (!smooth || !this.animations) {
      this.camTween = null;
      this.cam.x = x;
      this.cam.y = y;
      this.clampCamera();
      this.request();
      this.onCamera?.();
      return;
    }
    this.camTween = { from: [this.cam.x, this.cam.y], to: [x, y], start: performance.now() };
  }

  isOnScreen(tile: number, margin = 60): boolean {
    const [sx, sy] = this.tileScreen(tile);
    return sx > margin && sy > margin && sx < this.w - margin && sy < this.h - margin;
  }

  viewPolygon(): [number, number][] {
    return [this.screenToWorld(0, 0), this.screenToWorld(this.w, 0), this.screenToWorld(this.w, this.h), this.screenToWorld(0, this.h)];
  }

  // --- Effects -------------------------------------------------------------------------------

  addEffect(kind: EffectKind, tile: number, color: string, text?: string, dur = 1100): void {
    if (tile < 0) return;
    if (kind === 'text') {
      this.labels.floatText(this, tile, text ?? '', color, dur + 300);
      return;
    }
    if (!this.animations) return;
    const x = this.shape.cx(tile);
    const z = this.shape.cz(tile);
    const y = this.shape.isWater(tile) ? 0.02 : LAND_Y + 0.03;
    let obj: Mesh;
    if (kind === 'ring') {
      obj = new Mesh(new RingGeometry(0.82, 0.98, 6, 1), new MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending }));
    } else {
      obj = new Mesh(new CircleGeometry(0.98, 6), new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, side: DoubleSide, blending: AdditiveBlending }));
    }
    obj.rotation.x = -Math.PI / 2;
    obj.rotation.z = Math.PI / 6;
    obj.position.set(x, y, z);
    obj.renderOrder = 5;
    this.scene.add(obj);
    this.fx.push({ obj, start: performance.now(), dur, kind });
  }

  animateMove(unitId: number, from: number, to: number): void {
    if (!this.animations) return;
    this.units?.animateMove(unitId, from, to);
  }

  /** Combat on the map: the attacker lunges, the defender flinches, the fallen topple. */
  combat(from: number, to: number, killed: boolean): void {
    if (!this.animations) return;
    this.units?.combat(from, to, killed);
  }

  // --- Frame ----------------------------------------------------------------------------------

  update(dt: number, time: number): void {
    const now = performance.now();
    if (this.camTween) {
      const t = Math.min(1, (now - this.camTween.start) / 380);
      const e = 1 - Math.pow(1 - t, 3);
      this.cam.x = this.camTween.from[0] + (this.camTween.to[0] - this.camTween.from[0]) * e;
      this.cam.y = this.camTween.from[1] + (this.camTween.to[1] - this.camTween.from[1]) * e;
      this.clampCamera();
      this.onCamera?.();
      if (t >= 1) this.camTween = null;
    }
    if (this.zoomGlide) {
      const z = this.zoomGlide;
      const k = 1 - Math.exp(-dt * 14);
      const next = this.cam.zoom * Math.pow(z.target / this.cam.zoom, k);
      if (Math.abs(Math.log(z.target / this.cam.zoom)) < 0.003) {
        this.applyZoom(z.target / this.cam.zoom, z.sx, z.sy);
        this.zoomGlide = null;
      } else this.applyZoom(next / this.cam.zoom, z.sx, z.sy);
    }
    const key = `${this.cam.x.toFixed(2)},${this.cam.y.toFixed(2)},${this.cam.zoom.toFixed(4)},${this.w},${this.h}`;
    const camMoved = key !== this.camKey;
    if (camMoved) {
      this.camKey = key;
      this.placeCamera();
    }
    const g = this.g;
    if (this.worldDirty) {
      this.worldDirty = false;
      this.terrain?.update(g.player.explored, this.reveal);
      this.rivers?.updateRoads(g.s.map);
      this.props?.update(g, this.reveal);
      this.cities?.update(g, this.reveal);
    }
    if (this.unitsDirty) {
      this.unitsDirty = false;
      this.units?.update(g, this.overlay, this.reveal);
    }
    if (this.stateDirty) {
      this.stateDirty = false;
      this.tiles.update(g, this.overlay, this.reveal);
      this.updatePath();
      this.units?.select(this.overlay);
    }
    this.tiles.uniforms.uTime.value = time;
    this.props?.tick(time, this.cam.zoom);
    this.cities?.tick(dt, time);
    this.units?.tick(dt, time, this.cam.zoom);
    for (const f of this.fx) {
      const t = (now - f.start) / f.dur;
      const m = (f.obj as Mesh).material as MeshBasicMaterial;
      if (f.kind === 'ring') {
        f.obj.scale.setScalar(0.6 + t * 1.6);
        m.opacity = Math.max(0, 1 - t);
      } else m.opacity = 0.6 * Math.max(0, 1 - t);
    }
    this.fx = this.fx.filter((f) => {
      if (now - f.start < f.dur) return true;
      f.obj.parent?.remove(f.obj);
      (f.obj as Mesh).geometry.dispose();
      ((f.obj as Mesh).material as MeshBasicMaterial).dispose();
      return false;
    });
    this.labels.update(this, g, camMoved);
  }

  /** The planned route: a bright dashed ribbon with turn markers. */
  private updatePath(): void {
    const o = this.overlay;
    const u = o.selectedUnit >= 0 ? this.g.unit(o.selectedUnit) : undefined;
    const key = u && o.path ? `${u.tile}:${o.path.join(',')}:${o.pathAttack}` : '';
    if (key === this.pathKey) return;
    this.pathKey = key;
    if (this.pathObj) {
      this.scene.remove(this.pathObj);
      this.pathObj.traverse((m) => {
        if (m instanceof Mesh) {
          m.geometry.dispose();
          (m.material as MeshBasicMaterial).dispose();
        }
      });
      this.pathObj = null;
    }
    this.labels.setPath(null);
    if (!u || !o.path || !o.path.length) return;
    const tiles = [u.tile, ...o.path];
    this.pathObj = this.units?.pathMesh(this.shape, tiles, o.pathAttack) ?? null;
    if (this.pathObj) this.scene.add(this.pathObj);
    const turns = o.pathTurns ?? [];
    const marks: { tile: number; text: string }[] = [];
    for (let k = 0; k < o.path.length; k++) {
      const end = k === o.path.length - 1 || turns[k + 1] !== turns[k];
      if (end) marks.push({ tile: o.path[k], text: String((turns[k] ?? 0) + 1) });
    }
    this.labels.setPath(marks, o.pathAttack);
  }

  idle(): boolean {
    return false;
  }

  /** A portrait of a tile or city for the side panels. */
  portrait(tile: number, w = 300, h = 170, close = 1): HTMLCanvasElement {
    const cam = new PerspectiveCamera(32, w / h, 0.05, 80);
    const x = this.shape.cx(tile);
    const z = this.shape.cz(tile);
    const y = this.shape.height(tile, x, z);
    const d = 2.6 / close;
    cam.position.set(x + d * 0.3, y + d * 0.5, z + d * 0.9);
    cam.lookAt(x, y + 0.1, z - 0.1);
    cam.updateMatrixWorld();
    this.labels.hidden = true;
    const badges = this.props?.badgeMesh;
    if (badges) badges.visible = false;
    const out = this.stage.snapshot(this.scene, cam, w, h);
    if (badges) badges.visible = true;
    this.labels.hidden = false;
    return out;
  }

  dispose(): void {
    for (const part of [this.terrain, this.water, this.rivers, this.props, this.cities, this.units]) part?.dispose();
    this.labels.clear();
  }
}
