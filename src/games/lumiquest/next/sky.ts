// The sky from a CC0 photographic HDRI (Poly Haven, "Kloppenheim 06 (Pure
// Sky)", golden hour): the 1k HDR lights the scene (PMREM environment) and
// tells where the sun is; a 4k tonemapped copy of its upper half is the
// visible sky. Both use three's equirectangular mapping, so the background,
// the lighting and every reflection agree.

import {
  BackSide,
  Color,
  EquirectangularReflectionMapping,
  FloatType,
  Mesh,
  PMREMGenerator,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type DataTexture,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const FRAG = /* glsl */ `
uniform sampler2D tSky;
uniform vec3 uHorizon;
uniform float uExposure;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, clamp(el / 1.5707963, 0.002, 1.0));
  vec3 c = texture2D(tSky, uv).rgb;
  // below the horizon: the horizon haze, darkening a little
  c = mix(c, uHorizon * 0.9, smoothstep(0.0, -0.06, d.y));
  gl_FragColor = vec4(c * uExposure, 1.0);
  #include <colorspace_fragment>
}`;

export interface SkyInfo {
  sunDir: Vector3;
  sunColor: Color;
  horizon: Color;
}

export class PhotoSky {
  readonly dome: Mesh;
  private mat: ShaderMaterial;
  envTexture: Texture | null = null;
  info: SkyInfo = { sunDir: new Vector3(0.3, 0.2, -0.9).normalize(), sunColor: new Color('#ffd7a0'), horizon: new Color('#d9c7aa') };

  constructor() {
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { tSky: { value: null }, uHorizon: { value: new Color('#d9c7aa') }, uExposure: { value: 1 } },
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new Mesh(new SphereGeometry(1, 48, 24), this.mat);
    this.dome.scale.setScalar(900);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
  }

  /** Loads both images; resolves with the sun's direction and colour and the horizon colour. */
  async load(renderer: WebGLRenderer, skyUrl: string, hdrUrl: string): Promise<SkyInfo> {
    const [img, hdr] = await Promise.all([
      new TextureLoader().loadAsync(skyUrl),
      new HDRLoader().setDataType(FloatType).loadAsync(hdrUrl) as Promise<DataTexture>,
    ]);
    img.colorSpace = SRGBColorSpace;
    img.anisotropy = 8;
    this.mat.uniforms.tSky.value = img;
    // the sun: the brightest texels of the HDR
    const { data, width: W, height: H } = hdr.image as { data: Float32Array; width: number; height: number };
    let best = 0;
    let br = 0;
    let bc = 0;
    for (let r = 0; r < H / 2; r++)
      for (let c = 0; c < W; c++) {
        const i = (r * W + c) * 4;
        const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
        if (l > best) {
          best = l;
          br = r;
          bc = c;
        }
      }
    const el = (0.5 - (br + 0.5) / H) * Math.PI;
    const az = ((bc + 0.5) / W - 0.5) * Math.PI * 2;
    const sunDir = new Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    // the sun's colour: average around the brightest texel, normalised
    const sc = new Color(0, 0, 0);
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const r = Math.min(H - 1, Math.max(0, br + dr));
        const c = (bc + dc + W) % W;
        const i = (r * W + c) * 4;
        sc.r += data[i];
        sc.g += data[i + 1];
        sc.b += data[i + 2];
      }
    const m = Math.max(sc.r, sc.g, sc.b) || 1;
    sc.multiplyScalar(1 / m);
    // the horizon: a ring of texels just above it, averaged (linear)
    const hz = new Color(0, 0, 0);
    const hr = Math.floor(H / 2 - H * 0.02);
    for (let c = 0; c < W; c += 4) {
      const i = (hr * W + c) * 4;
      hz.r += data[i];
      hz.g += data[i + 1];
      hz.b += data[i + 2];
    }
    hz.multiplyScalar(4 / W);
    const hm = Math.max(hz.r, hz.g, hz.b) || 1;
    // fog wants a display-bright colour: normalise to a soft, bright haze
    const horizon = new Color(hz.r / hm, hz.g / hm, hz.b / hm).multiplyScalar(0.86);
    this.mat.uniforms.uHorizon.value.copy(horizon);
    // image-based lighting
    hdr.mapping = EquirectangularReflectionMapping;
    const pm = new PMREMGenerator(renderer);
    this.envTexture = pm.fromEquirectangular(hdr).texture;
    pm.dispose();
    hdr.dispose();
    this.info = { sunDir, sunColor: sc, horizon };
    return this.info;
  }
}
