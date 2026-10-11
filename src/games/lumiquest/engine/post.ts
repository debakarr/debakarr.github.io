// Post-processing for medium and high quality. The scene renders in linear
// HDR into a multisampled target, then:
//
//   bloom → sun shafts (screen-space god rays marched toward the
//   sun through the depth buffer, so light streams around leaves, roofs and
//   hills) → tone mapping (once, in OutputPass) → a display-space grade
//   (vibrance, warm light / cool shade split, vignette, fine film grain).
//
// Low quality renders straight to the canvas (tone mapping in the materials).

import {
  Color,
  DepthTexture,
  HalfFloatType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Sun shafts: radial march from each pixel toward the sun, counting open sky. */
const Shafts = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uSun: { value: new Vector2(0.5, 0.5) },
    uAmount: { value: 0 },
    uColor: { value: new Color('#ffd9a0') },
    uAspect: { value: 1 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    #define SAMPLES 28
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uSun;
    uniform float uAmount;
    uniform vec3 uColor;
    uniform float uAspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uAmount <= 0.001) { gl_FragColor = base; return; }
      vec2 toSun = uSun - vUv;
      vec2 stepv = toSun / float(SAMPLES) * 0.9;
      // a little jitter per pixel hides banding between the steps
      vec2 uv = vUv + stepv * hash(vUv * 731.0);
      float decay = 1.0;
      float acc = 0.0;
      for (int i = 0; i < SAMPLES; i++) {
        uv += stepv;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
        float sky = step(0.99999, texture2D(tDepth, uv).x);
        vec2 d = (uv - uSun) * vec2(uAspect, 1.0);
        acc += sky * decay * exp(-dot(d, d) * 6.0);
        decay *= 0.955;
      }
      acc /= float(SAMPLES);
      // shafts read where something stands in front of the sky, not on the open sky itself
      float open = step(0.99999, texture2D(tDepth, vUv).x);
      gl_FragColor = vec4(base.rgb + uColor * acc * uAmount * (1.0 - open * 0.6), base.a);
    }`,
};

/** Display-space grade, after tone mapping. */
const Grade = {
  uniforms: {
    tDiffuse: { value: null },
    uVibrance: { value: 0.22 },
    uWarm: { value: 0.02 },
    uVignette: { value: 0.16 },
    uNight: { value: 0 },
    uGrain: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVibrance;
    uniform float uWarm;
    uniform float uVignette;
    uniform float uNight;
    uniform float uGrain;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // vibrance: lift muted colours more than saturated ones
      float mx = max(col.r, max(col.g, col.b));
      float mn = min(col.r, min(col.g, col.b));
      float sat = (mx - mn) / max(mx, 1e-4);
      col = mix(vec3(l), col, 1.0 + uVibrance * (1.0 - sat));
      // split tone: honeyed light, cool blue shade (bluer at night)
      vec3 warm = vec3(1.0 + uWarm, 1.0 + uWarm * 0.35, 1.0 - uWarm * 0.7);
      vec3 cool = mix(vec3(0.95, 0.99, 1.06), vec3(0.88, 0.95, 1.14), uNight);
      col *= mix(cool, warm, smoothstep(0.08, 0.75, l));
      // vignette
      vec2 d = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep(0.2, 0.9, dot(d, d) * 2.4);
      // fine grain, strongest in the mid-tones
      float g = hash(vUv * 1024.0 + fract(uTime) * 61.0) - 0.5;
      col += g * uGrain * (1.0 - abs(l - 0.5) * 1.6);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export interface PostFrame {
  night: number;
  bloom: number;
  /** Direction toward the sun (world), its colour, and how strongly shafts show (0..1). */
  sunDir?: Vector3;
  sunColor?: Color;
  shafts?: number;
  time?: number;
}

export class Post {
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private shafts: ShaderPass | null = null;
  private grade: ShaderPass | null = null;
  enabled = false;
  private sunScreen = new Vector3();
  private fwd = new Vector3();

  constructor(private renderer: WebGLRenderer) {}

  /**
   * Builds the chain; `shafts` adds the sun shafts. (Screen-space AO was tried and dropped: it
   * renders the scene without alpha cut-outs, so leaf cards shadow as solid squares.)
   * Calling again with different options rebuilds it.
   */
  setEnabled(on: boolean, scene: Scene, camera: Camera, opts: { shafts?: boolean } = {}): void {
    const want = `${on}|${!!opts.shafts}`;
    if (this.composer && this.key === want) {
      this.enabled = on;
      return;
    }
    this.key = want;
    this.composer?.dispose();
    this.composer = null;
    this.shafts = null;
    this.enabled = on;
    if (!on) return;
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
    target.depthTexture = new DepthTexture(size.x, size.y);
    this.composer = new EffectComposer(this.renderer, target);
    // both ping-pong targets carry depth, so the shafts can read whichever the scene lands in
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) if (!t.depthTexture) t.depthTexture = new DepthTexture(size.x, size.y);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.4, 0.6, 0.9);
    this.composer.addPass(this.bloom);
    if (opts.shafts) {
      this.shafts = new ShaderPass(Shafts);
      this.composer.addPass(this.shafts);
    }
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(Grade);
    this.composer.addPass(this.grade);
  }

  private key = '';

  resize(w: number, h: number, pixelRatio: number): void {
    if (!this.composer) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(scene: Scene, camera: Camera, frame: PostFrame): void {
    if (!this.enabled || !this.composer || !this.renderPass) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (this.bloom) {
      this.bloom.strength = frame.bloom + frame.night * 0.25;
      // toon-lit daylight is bright everywhere: only true highlights (sun, lamps, glows) bloom
      this.bloom.threshold = 3.2 - frame.night * 2.4;
    }
    if (this.grade) {
      this.grade.uniforms.uNight.value = frame.night;
      this.grade.uniforms.uTime.value = frame.time ?? 0;
    }
    if (this.shafts) {
      const u = this.shafts.uniforms;
      let amount = 0;
      if (frame.sunDir && (frame.shafts ?? 0) > 0) {
        // the sun's place on screen, and how squarely the camera faces it
        const cam = camera as PerspectiveCamera;
        this.sunScreen.copy(cam.position).addScaledVector(frame.sunDir, 500).project(cam);
        camera.getWorldDirection(this.fwd);
        const facing = this.fwd.dot(frame.sunDir);
        amount = (frame.shafts ?? 0) * Math.max(0, Math.min(1, (facing - 0.1) / 0.5));
        (u.uSun.value as Vector2).set(this.sunScreen.x * 0.5 + 0.5, this.sunScreen.y * 0.5 + 0.5);
        if (frame.sunColor) (u.uColor.value as Color).copy(frame.sunColor);
      }
      u.uAmount.value = amount;
      u.uAspect.value = (camera as PerspectiveCamera).aspect ?? 1;
      // depth of the target the scene is about to be drawn into
      u.tDepth.value = this.composer.readBuffer.depthTexture;
    }
    this.composer.render();
  }

  dispose(): void {
    this.composer?.dispose();
  }
}
