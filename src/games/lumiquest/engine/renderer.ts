// Renderer setup, quality presets and adaptive resolution.
//
// three r186 ships WebGPURenderer (three/webgpu), but it only runs node
// (TSL) materials: the wind, water and sky shaders here patch WebGL shader
// chunks, and its WebGL2 fallback is slower than WebGLRenderer on the
// low-end devices the low preset targets. WebGL2 through WebGLRenderer is
// the renderer; see the LumiQuest section of src/games/README.md.

import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { Quality } from '../systems/save';

export type Tier = 'low' | 'medium' | 'high';

export interface QualityProfile {
  tier: Tier;
  /** Max device pixel ratio used before the adaptive scale. */
  maxDpr: number;
  shadowSize: number;
  shadowRange: number;
  /** Vegetation radius (grass/flowers) in metres. */
  grassRange: number;
  grassDensity: number;
  /** Props (trees, rocks) are culled beyond this distance. */
  drawDistance: number;
  creatureRange: number;
  particles: number;
}

export const PROFILES: Record<Tier, QualityProfile> = {
  low: { tier: 'low', maxDpr: 1, shadowSize: 1024, shadowRange: 34, grassRange: 30, grassDensity: 0.45, drawDistance: 150, creatureRange: 70, particles: 0.4 },
  medium: { tier: 'medium', maxDpr: 1.5, shadowSize: 2048, shadowRange: 48, grassRange: 46, grassDensity: 0.8, drawDistance: 230, creatureRange: 95, particles: 0.75 },
  high: { tier: 'high', maxDpr: 2, shadowSize: 2048, shadowRange: 60, grassRange: 60, grassDensity: 1.1, drawDistance: 320, creatureRange: 120, particles: 1 },
};

export function detectTier(): Tier {
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return cores >= 8 ? 'medium' : 'low';
  return cores >= 6 ? 'high' : 'medium';
}

export function resolveTier(q: Quality): Tier {
  return q === 'auto' ? detectTier() : q;
}

export class RenderHost {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  profile: QualityProfile;
  /** 0.5..1, multiplied into the pixel ratio by the frame-time governor. */
  scale = 1;
  adaptive: boolean;
  private frameAvg = 16.7;
  /** Called after every size or pixel-ratio change. */
  onResize: ((w: number, h: number, pixelRatio: number) => void) | null = null;
  private settle = 0;

  constructor(container: HTMLElement, quality: Quality) {
    const canvas = document.createElement('canvas');
    canvas.className = 'lq-canvas';
    const tier = resolveTier(quality);
    this.profile = PROFILES[tier];
    this.adaptive = quality === 'auto';
    const renderer = new WebGLRenderer({
      canvas,
      antialias: tier !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL 2 is not available.');
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    container.appendChild(canvas);
    this.renderer = renderer;
    this.canvas = canvas;
    this.resize();
  }

  setQuality(q: Quality): void {
    this.profile = PROFILES[resolveTier(q)];
    this.adaptive = q === 'auto';
    this.scale = 1;
    this.settle = 0;
    this.resize();
  }

  resize(): void {
    const w = this.canvas.parentElement?.clientWidth || window.innerWidth;
    const h = this.canvas.parentElement?.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.profile.maxDpr) * this.scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.onResize?.(w, h, dpr);
  }

  get width(): number {
    return this.canvas.clientWidth || window.innerWidth;
  }

  get height(): number {
    return this.canvas.clientHeight || window.innerHeight;
  }

  /**
   * Frame-time governor: steps the render scale down when frames run long
   * and back up when there is headroom. Ignores the first seconds after a
   * scene change so shader compilation does not trigger a downgrade.
   */
  governor(dtMs: number): void {
    this.settle += dtMs;
    if (!this.adaptive || this.settle < 2500) return;
    this.frameAvg += (Math.min(dtMs, 100) - this.frameAvg) * 0.05;
    if (this.frameAvg > 24 && this.scale > 0.55) {
      this.scale = Math.max(0.55, this.scale - 0.1);
      this.frameAvg = 16.7;
      this.settle = 1500;
      this.resize();
    } else if (this.frameAvg < 13 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.1);
      this.frameAvg = 16.7;
      this.settle = 0;
      this.resize();
    }
  }

  get fpsEstimate(): number {
    return 1000 / this.frameAvg;
  }

  dispose(): void {
    this.renderer.dispose();
    this.canvas.remove();
  }
}
