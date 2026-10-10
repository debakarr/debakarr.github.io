// The WebGL stage: one renderer on the map canvas that draws whichever 3D
// scene is showing — the world map, the title vista, a battle or a royal
// audience — with shared quality settings and post-processing.

import {
  NeutralToneMapping,
  HalfFloatType,
  PCFShadowMap,
  SRGBColorSpace,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  type Camera,
  type Scene,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type Quality = 'low' | 'medium' | 'high';
export type QualitySetting = Quality | 'auto';

export interface StageScene {
  readonly scene: Scene;
  readonly camera: Camera;
  update(dt: number, time: number): void;
  resize?(w: number, h: number): void;
  /** Bloom strength for this scene (0 = none). */
  bloom?: number;
  /** Skip rendering this frame (nothing changed). */
  idle?(): boolean;
}

const Grade = {
  uniforms: {
    tDiffuse: { value: null },
    uVibrance: { value: 0.3 },
    uWarm: { value: 0.05 },
    uVignette: { value: 0.32 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVibrance;
    uniform float uWarm;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float mx = max(col.r, max(col.g, col.b));
      float mn = min(col.r, min(col.g, col.b));
      float sat = (mx - mn) / max(mx, 1e-4);
      col = mix(vec3(l), col, 1.0 + uVibrance * (1.0 - sat));
      vec3 warm = vec3(1.0 + uWarm, 1.0 + uWarm * 0.4, 1.0 - uWarm * 0.6);
      vec3 cool = vec3(0.97, 0.99, 1.04);
      col *= mix(cool, warm, smoothstep(0.05, 0.8, l));
      vec2 d = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep(0.3, 0.9, dot(d, d) * 2.2);
      gl_FragColor = vec4(col, c.a);
    }`,
};

/** True when this browser can run the 3D renderer (WebGL 2). */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

export function detectQuality(renderer: WebGLRenderer): Quality {
  const gl = renderer.getContext();
  let name = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    /* ignore */
  }
  if (/swiftshader|llvmpipe|software/i.test(name)) return 'low';
  const touch = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (touch || cores <= 4) return 'medium';
  return 'high';
}

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  quality: Quality = 'high';
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private current: StageScene | null = null;
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 1;
  private h = 1;
  private frameGap = 0;
  private sinceDraw = 0;
  /** Called after each rendered frame (e.g. to place DOM labels). */
  afterFrame: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, quality: QualitySetting = 'auto') {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.setQuality(quality);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.last = performance.now();
    });
  }

  setQuality(q: QualitySetting): void {
    this.quality = q === 'auto' ? detectQuality(this.renderer) : q;
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.needsUpdate = true;
    this.frameGap = this.quality === 'low' ? 1000 / 30 : 0;
    if (this.quality === 'high' && !this.composer) this.makeComposer();
    this.resize();
  }

  private makeComposer(): void {
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    const target = new WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(null as unknown as Scene, null as unknown as Camera);
    this.bloomPass = new UnrealBloomPass(new Vector2(size.x, size.y), 0.25, 0.5, 0.9);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new ShaderPass(Grade));
    this.composer.addPass(new OutputPass());
  }

  get pixelRatio(): number {
    const dpr = window.devicePixelRatio || 1;
    const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    // keep the total pixel count sane on very large screens
    const budget = this.quality === 'high' ? 4.2e6 : 2.6e6;
    return Math.max(0.75, Math.min(dpr, cap, Math.sqrt(budget / (this.w * this.h))));
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    const pr = this.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h, false);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(this.w, this.h);
    }
    this.current?.resize?.(this.w, this.h);
  }

  get width(): number {
    return this.w;
  }

  get height(): number {
    return this.h;
  }

  show(s: StageScene | null): void {
    this.current = s;
    if (s) {
      s.resize?.(this.w, this.h);
      this.start();
    }
  }

  get showing(): StageScene | null {
    return this.current;
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      if (document.visibilityState !== 'visible' || !this.current) return;
      const gap = now - this.last;
      if (this.frameGap && gap < this.frameGap - 2) return;
      const dt = Math.min(0.1, gap / 1000);
      this.last = now;
      this.time += dt;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose(): void {
    this.stop();
    this.current = null;
    this.composer?.dispose();
    this.renderer.dispose();
  }

  /** Renders one frame right away (used by tests and snapshots). */
  frame(dt = 0): void {
    const s = this.current;
    if (!s) return;
    s.update(dt, this.time);
    this.sinceDraw += dt;
    if (s.idle?.() && this.sinceDraw < 0.25) return;
    this.sinceDraw = 0;
    this.draw(s.scene, s.camera, s.bloom ?? 0.25);
    this.afterFrame?.();
  }

  private draw(scene: Scene, camera: Camera, bloom: number): void {
    if (this.quality === 'high' && this.composer && this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      if (this.bloomPass) {
        this.bloomPass.enabled = bloom > 0;
        this.bloomPass.strength = bloom;
      }
      this.composer.render();
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
    }
  }

  /**
   * Renders a scene into a small canvas (city and tile portraits). It draws in
   * a corner of the main canvas — so tone mapping and colour match the map —
   * copies the pixels out, then redraws the current frame over it.
   */
  snapshot(scene: Scene, camera: Camera, w: number, h: number): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const r = this.renderer;
    const pr = r.getPixelRatio();
    const cw = Math.min(w, Math.floor(this.w * pr * 0.95));
    const ch = Math.min(h, Math.floor(this.h * pr * 0.95));
    r.setRenderTarget(null);
    r.setScissorTest(true);
    r.setScissor(0, 0, cw / pr, ch / pr);
    r.setViewport(0, 0, cw / pr, ch / pr);
    r.render(scene, camera);
    out.getContext('2d')!.drawImage(this.canvas, 0, this.canvas.height - ch, cw, ch, 0, 0, w, h);
    r.setScissorTest(false);
    r.setViewport(0, 0, this.w, this.h);
    const s = this.current;
    if (s) this.draw(s.scene, s.camera, s.bloom ?? 0.25);
    return out;
  }
}
