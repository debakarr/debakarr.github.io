// Sky, sun, moon, fog and weather. One gradient sky shader with drifting
// noise clouds and stars; a directional sun (or moon) whose shadow camera
// follows the player; hemisphere fill so night stays blue and readable.

import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import type { WeatherKind } from '../systems/state';

interface Key {
  h: number;
  zenith: string;
  horizon: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  fog: string;
}

const KEYS: Key[] = [
  { h: 0, zenith: '#0d1a44', horizon: '#33467e', sun: '#a9bcff', sunI: 0.55, hemiSky: '#5a6cc0', hemiGround: '#2f4a3a', hemiI: 0.95, fog: '#2c3f72' },
  { h: 4.6, zenith: '#13245a', horizon: '#46548c', sun: '#a9bcff', sunI: 0.5, hemiSky: '#5a6cc0', hemiGround: '#2f4a3a', hemiI: 0.95, fog: '#34477c' },
  { h: 6, zenith: '#4870c0', horizon: '#ffbf98', sun: '#ffb27a', sunI: 1.3, hemiSky: '#b0b8e8', hemiGround: '#6f6a48', hemiI: 1.05, fog: '#efc2a8' },
  { h: 8, zenith: '#2f88ec', horizon: '#bfe6ff', sun: '#ffe9c8', sunI: 3.0, hemiSky: '#c8e4ff', hemiGround: '#6f9a46', hemiI: 1.1, fog: '#c6e4f8' },
  { h: 13, zenith: '#2a80ea', horizon: '#c2e8ff', sun: '#fff0d8', sunI: 3.4, hemiSky: '#cfe8ff', hemiGround: '#74a04a', hemiI: 1.12, fog: '#cae6fa' },
  { h: 17, zenith: '#3a7ed8', horizon: '#ffd8a6', sun: '#ffcf90', sunI: 2.9, hemiSky: '#e6dcf0', hemiGround: '#868a4a', hemiI: 1.05, fog: '#f2d8b8' },
  { h: 19, zenith: '#38488e', horizon: '#ff9f72', sun: '#ff8d58', sunI: 1.4, hemiSky: '#d0a8c8', hemiGround: '#6a5a48', hemiI: 1.0, fog: '#f2aa8c' },
  { h: 20.4, zenith: '#18265a', horizon: '#6c5c9e', sun: '#a9bcff', sunI: 0.5, hemiSky: '#6a74c8', hemiGround: '#34483e', hemiI: 0.95, fog: '#4a4c86' },
  { h: 24, zenith: '#0d1a44', horizon: '#33467e', sun: '#a9bcff', sunI: 0.55, hemiSky: '#5a6cc0', hemiGround: '#2f4a3a', hemiI: 0.95, fog: '#2c3f72' },
];

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // always at the far plane
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uTime;
uniform float uCloud;
uniform float uNight;
uniform float uRain;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float t = pow(clamp(y, 0.0, 1.0), 0.55);
  vec3 col = mix(uHorizon, uZenith, t);
  // below the horizon fade to a soft ground haze
  col = mix(col, uGround, smoothstep(0.0, -0.25, y));
  // sun glow and disc
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 64.0) * 0.6) * (1.0 - uRain * 0.8);
  col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 2.0 * (1.0 - uNight) * (1.0 - uRain);
  // moon
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9989, 0.9993, md) * uNight * 1.4;
  col += vec3(0.5, 0.6, 1.0) * pow(md, 48.0) * 0.25 * uNight;
  // stars
  if (uNight > 0.01 && y > 0.0) {
    vec2 sp = d.xz / (y + 0.3) * 140.0;
    float s = hash(floor(sp));
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
    float star = step(0.9965, s) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5)) * tw;
    col += vec3(star) * uNight * (1.0 - uCloud) * smoothstep(0.0, 0.25, y);
  }
  // clouds on a dome above the vale
  if (y > -0.02) {
    vec2 cp = d.xz / (y + 0.18) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
    float n = fbm(cp);
    float cover = mix(0.56, 0.36, uCloud);
    float c = smoothstep(cover, cover + 0.16, n) * smoothstep(-0.02, 0.16, y);
    float shade = fbm(cp * 1.7 + 3.0);
    vec3 lit = mix(vec3(1.0), uSunColor, 0.25) * (0.9 + 0.3 * smoothstep(0.3, 0.8, shade));
    vec3 cloudCol = mix(lit, uHorizon * 0.9, 0.35 + uRain * 0.4);
    cloudCol = mix(cloudCol, vec3(0.22, 0.27, 0.42), uNight * 0.75);
    col = mix(col, cloudCol, c * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const ca = new Color();
const cb = new Color();

function lerpKey(hour: number): { zenith: Color; horizon: Color; sun: Color; sunI: number; hemiSky: Color; hemiGround: Color; hemiI: number; fog: Color } {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (hour - a.h) / (b.h - a.h)));
  const lc = (x: string, y: string) => new Color(x).lerp(cb.set(y), t);
  ca.set(a.zenith);
  return {
    zenith: lc(a.zenith, b.zenith),
    horizon: lc(a.horizon, b.horizon),
    sun: lc(a.sun, b.sun),
    sunI: a.sunI + (b.sunI - a.sunI) * t,
    hemiSky: lc(a.hemiSky, b.hemiSky),
    hemiGround: lc(a.hemiGround, b.hemiGround),
    hemiI: a.hemiI + (b.hemiI - a.hemiI) * t,
    fog: lc(a.fog, b.fog),
  };
}

export class Atmosphere {
  readonly sun = new DirectionalLight('#ffffff', 3);
  readonly hemi = new HemisphereLight('#d8eeff', '#7a9a58', 1.2);
  readonly fog = new Fog('#cfe7f8', 40, 260);
  readonly dome: Mesh;
  private mat: ShaderMaterial;
  readonly sunDir = new Vector3(0.4, 0.8, 0.3);
  night = 0;
  /** 0 = clear .. 1 = overcast; eased toward the weather target. */
  private cloud = 0.2;
  private rain = 0;
  private mist = 0;
  /** Extra darkening inside the cave, 0..1. */
  cave = 0;
  underwater = false;
  shadowRange = 50;
  drawDistance = 220;
  fogColor = new Color();

  constructor(scene: Scene, shadowSize: number) {
    this.mat = new ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new Color() },
        uHorizon: { value: new Color() },
        uGround: { value: new Color('#9fbfd0') },
        uSunDir: { value: new Vector3() },
        uSunColor: { value: new Color() },
        uMoonDir: { value: new Vector3() },
        uTime: { value: 0 },
        uCloud: { value: 0.2 },
        uNight: { value: 0 },
        uRain: { value: 0 },
      },
    });
    this.dome = new Mesh(new SphereGeometry(1, 32, 20), this.mat);
    this.dome.scale.setScalar(800);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.sun.shadow.blurSamples = 10;
    // layer 1 holds the first-person body: hidden from view, still shadowed
    this.sun.shadow.camera.layers.enable(1);
    scene.add(this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
  }

  setShadowSize(size: number): void {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  update(hour: number, weather: WeatherKind, center: Vector3, camPos: Vector3, dt: number, time: number): void {
    const k = lerpKey(hour);
    const targetCloud = weather === 'clear' ? 0.15 : weather === 'cloudy' ? 0.7 : weather === 'rain' ? 0.95 : 0.55;
    this.cloud += (targetCloud - this.cloud) * Math.min(1, dt * 0.3);
    this.rain += ((weather === 'rain' ? 1 : 0) - this.rain) * Math.min(1, dt * 0.4);
    this.mist += ((weather === 'mist' ? 1 : weather === 'rain' ? 0.4 : 0) - this.mist) * Math.min(1, dt * 0.3);

    // Sun path: rises in the east (+x), sets in the west.
    const ang = ((hour - 6) / 12) * Math.PI;
    const sunDir = new Vector3(Math.cos(ang), Math.sin(ang), -0.35).normalize();
    const moonDir = new Vector3(-Math.cos(ang), -Math.sin(ang), 0.3).normalize();
    const day = Math.max(0, Math.min(1, (sunDir.y + 0.08) / 0.25));
    this.night = 1 - day;
    const lightDir = sunDir.y > -0.02 ? sunDir : moonDir;
    // keep the light from grazing the horizon so shadows stay sane
    const ld = lightDir.clone();
    ld.y = Math.max(ld.y, 0.28);
    ld.normalize();
    this.sunDir.copy(ld);

    const overcast = this.cloud * 0.55 + this.rain * 0.2;
    const dim = 1 - this.cave * 0.82;
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI * (1 - overcast) * dim;
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    this.hemi.intensity = k.hemiI * (1 + overcast * 0.25) * (1 - this.cave * 0.5);
    this.sun.position.copy(center).addScaledVector(ld, 80);
    this.sun.target.position.copy(center);
    const cam = this.sun.shadow.camera;
    const r = this.shadowRange;
    if (cam.right !== r) {
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      cam.near = 1;
      cam.far = 220;
      cam.updateProjectionMatrix();
    }
    // Snap the shadow frustum to texels so shadows do not shimmer as you walk.
    const texel = (2 * r) / this.sun.shadow.mapSize.x;
    this.sun.target.position.x = Math.round(center.x / texel) * texel;
    this.sun.target.position.z = Math.round(center.z / texel) * texel;
    this.sun.position.copy(this.sun.target.position).addScaledVector(ld, 80);

    const grey = new Color('#9aa6b4').lerp(k.fog, 0.4);
    const fogC = k.fog.clone().lerp(grey, overcast * 0.8);
    if (this.cave > 0) fogC.lerp(new Color('#141826'), this.cave * 0.9);
    let near = 55 - this.mist * 45;
    let far = (this.drawDistance * 1.35 + 60) * (1 - this.mist * 0.65) * (1 - this.rain * 0.25);
    if (this.cave > 0) {
      near = near * (1 - this.cave) + 6 * this.cave;
      far = far * (1 - this.cave) + 70 * this.cave;
    }
    if (this.underwater) {
      fogC.set('#1f6f9a');
      near = 0.5;
      far = 22;
    }
    this.fog.color.copy(fogC);
    this.fog.near = near;
    this.fog.far = far;
    this.fogColor.copy(fogC);

    const u = this.mat.uniforms;
    (u.uZenith.value as Color).copy(k.zenith).lerp(grey, overcast * 0.7);
    (u.uHorizon.value as Color).copy(k.horizon).lerp(grey, overcast * 0.6);
    (u.uGround.value as Color).copy(fogC);
    (u.uSunDir.value as Vector3).copy(sunDir);
    (u.uMoonDir.value as Vector3).copy(moonDir);
    (u.uSunColor.value as Color).copy(k.sun);
    u.uTime.value = time;
    u.uCloud.value = this.cloud;
    u.uNight.value = this.night;
    u.uRain.value = this.rain;
    this.dome.position.copy(camPos);
  }

  get rainAmount(): number {
    return this.rain;
  }

  get mistAmount(): number {
    return this.mist;
  }
}
