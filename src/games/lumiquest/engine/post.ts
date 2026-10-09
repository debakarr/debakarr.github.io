// Post-processing for medium and high quality: a gentle bloom so crystals,
// lanterns and the beacon glow, then a colour grade (vibrance, warm
// highlights, cool shadows, soft vignette) for the bright storybook look.
// Low quality renders straight to the canvas.

import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const Grade = {
  uniforms: {
    tDiffuse: { value: null },
    uVibrance: { value: 0.32 },
    uWarm: { value: 0.05 },
    uVignette: { value: 0.28 },
    uNight: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVibrance;
    uniform float uWarm;
    uniform float uVignette;
    uniform float uNight;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // vibrance: boost muted colours more than saturated ones
      float mx = max(col.r, max(col.g, col.b));
      float mn = min(col.r, min(col.g, col.b));
      float sat = (mx - mn) / max(mx, 1e-4);
      col = mix(vec3(l), col, 1.0 + uVibrance * (1.0 - sat));
      // split tone: warm light, cool shade (cooler and bluer at night)
      vec3 warm = vec3(1.0 + uWarm, 1.0 + uWarm * 0.4, 1.0 - uWarm * 0.6);
      vec3 cool = mix(vec3(0.97, 0.99, 1.04), vec3(0.9, 0.96, 1.12), uNight);
      col *= mix(cool, warm, smoothstep(0.05, 0.8, l));
      // soft vignette
      vec2 d = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(col, c.a);
    }`,
};

export class Post {
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  enabled = false;

  constructor(private renderer: WebGLRenderer) {}

  setEnabled(on: boolean, scene: Scene, camera: Camera): void {
    this.enabled = on;
    if (!on || this.composer) return;
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.32, 0.55, 0.88);
    this.grade = new ShaderPass(Grade);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  resize(w: number, h: number, pixelRatio: number): void {
    if (!this.composer) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(scene: Scene, camera: Camera, night = 0, bloom = 0.32): void {
    if (!this.enabled || !this.composer || !this.renderPass) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (this.bloom) this.bloom.strength = bloom + night * 0.25;
    if (this.grade) this.grade.uniforms.uNight.value = night;
    this.composer.render();
  }

  dispose(): void {
    this.composer?.dispose();
  }
}
