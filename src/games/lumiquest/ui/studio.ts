// A small photo studio for the creation screens: a grassy pedestal under
// soft light, rendered into scissored viewports that follow DOM elements.
// Each view holds a live, animated model you can drag to rotate and scroll
// to zoom, so the character cards and creature cards are real 3D previews.

import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { Rng } from '../../shared/rng';
import { cylinder, gradient, lumpy, prep, xf, ellipsoid } from '../engine/geometry';
import { canvas } from '../engine/textures';
import { SphereGeometry } from 'three';

export interface View {
  el: HTMLElement;
  object: Object3D;
  yaw: number;
  /** Camera distance and the height it looks at. */
  dist: number;
  target: number;
  spin: boolean;
  /** Called every frame (for animation mixers). */
  tick?: (dt: number) => void;
  pedestal: boolean;
  highlight?: boolean;
}

function backdrop(): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#2b4f8a');
  g.addColorStop(0.55, '#6a9ed8');
  g.addColorStop(1, '#f6d6a8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const rng = new Rng(5);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rng.float(0.05, 0.35)})`;
    ctx.beginPath();
    ctx.arc(rng.next() * 512, rng.next() * 300, rng.float(0.6, 2.2), 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class Studio {
  readonly scene = new Scene();
  private backdropScene = new Scene();
  readonly views: View[] = [];
  private camera = new PerspectiveCamera(30, 1, 0.05, 50);
  private stage = new Group();
  private pedestal: Group;
  private drag: { view: View; x: number; id: number } | null = null;
  private listeners: (() => void)[] = [];

  constructor() {
    this.scene.background = backdrop();
    this.backdropScene.background = this.scene.background;
    this.scene.add(new HemisphereLight('#dfefff', '#6a7a4a', 1.3));
    const key = new DirectionalLight('#fff2dc', 2.6);
    key.position.set(2.5, 4, 3.5);
    const rim = new DirectionalLight('#9fd0ff', 1.6);
    rim.position.set(-3, 2.5, -3);
    this.scene.add(key, rim, this.stage);
    // pedestal: a mossy disc with flowers
    this.pedestal = new Group();
    const disc = new Mesh(gradient(lumpy(cylinder(0.95, 1.05, 0.3, 40), 0.02, 4, 2), '#6a5a48', '#8a7660'), new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    disc.position.y = -0.15;
    const moss = new Mesh(prep(lumpy(new SphereGeometry(0.98, 40, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.03, 6, 3), '#6fbf4a'), new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    moss.scale.y = 0.08;
    this.pedestal.add(disc, moss);
    const rng = new Rng(8);
    const cols = ['#ffffff', '#ffd84a', '#ff8fc0', '#a88cff'];
    for (let i = 0; i < 16; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 0.7 + rng.next() * 0.22;
      const f = new Mesh(prep(xf(ellipsoid(0.05, 0.02, 0.05), {}), cols[i % 4]), new MeshStandardMaterial({ vertexColors: true, emissive: new Color(cols[i % 4]), emissiveIntensity: 0.15 }));
      f.position.set(Math.cos(a) * r, 0.07, Math.sin(a) * r);
      this.pedestal.add(f);
    }
  }

  clear(): void {
    for (const v of this.views) v.object.removeFromParent();
    this.views.length = 0;
    this.listeners.forEach((l) => l());
    this.listeners = [];
  }

  add(view: Omit<View, 'yaw'> & { yaw?: number }): View {
    const v: View = { yaw: 0.35, ...view };
    this.views.push(v);
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, input')) return;
      this.drag = { view: v, x: e.clientX, id: e.pointerId };
      v.spin = false;
    };
    const move = (e: PointerEvent) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      this.drag.view.yaw += (e.clientX - this.drag.x) * 0.012;
      this.drag.x = e.clientX;
    };
    const up = (e: PointerEvent) => {
      if (this.drag?.id === e.pointerId) this.drag = null;
    };
    const wheel = (e: WheelEvent) => {
      v.dist = Math.min(v.dist * 1.6, Math.max(v.dist * 0.5, v.dist + Math.sign(e.deltaY) * 0.25));
      e.preventDefault();
    };
    v.el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    v.el.addEventListener('wheel', wheel, { passive: false });
    this.listeners.push(() => {
      v.el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      v.el.removeEventListener('wheel', wheel);
    });
    return v;
  }

  /** Renders every view into its element's rectangle on the shared canvas. */
  render(renderer: WebGLRenderer, dt: number): void {
    const canvasEl = renderer.domElement;
    const cr = canvasEl.getBoundingClientRect();
    const H = cr.height;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, cr.width, cr.height);
    renderer.render(this.backdropScene, this.camera);
    renderer.setScissorTest(true);
    for (const v of this.views) {
      const r = v.el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < cr.top || r.top > cr.bottom) continue;
      if (v.spin) v.yaw += dt * 0.4;
      v.tick?.(dt);
      this.stage.add(v.object);
      v.object.rotation.y = v.yaw;
      if (v.pedestal) this.stage.add(this.pedestal);
      else this.pedestal.removeFromParent();
      this.camera.aspect = r.width / r.height;
      this.camera.fov = 30;
      this.camera.updateProjectionMatrix();
      const t = new Vector3(0, v.target, 0);
      this.camera.position.set(0, v.target + v.dist * 0.18, v.dist);
      this.camera.lookAt(t);
      const x = r.left - cr.left;
      const y = H - (r.bottom - cr.top);
      renderer.setViewport(x, y, r.width, r.height);
      renderer.setScissor(x, y, r.width, r.height);
      renderer.render(this.scene, this.camera);
      v.object.removeFromParent();
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, cr.width, cr.height);
  }
}
