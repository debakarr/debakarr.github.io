// One large plane for all water and for the clouds that hide the unexplored
// world. The fragment shader finds the hex under each pixel, so shallows,
// shore foam and the soft edge of the clouds follow the tiles exactly.

import { Mesh, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three';
import { HEX_GLSL } from './hexgl';
import type { SharedUniforms } from './terrain';

const VERT = /* glsl */ `
varying vec3 vWPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
${HEX_GLSL}
uniform vec3 uSun;
uniform float uCloudOnly;
varying vec3 vWPos;

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

vec3 waterClass(float a) {
  int k = int(a * 255.0 + 0.5);
  if (k == 1) return lin(vec3(0.13, 0.47, 0.80));
  if (k == 3) return lin(vec3(0.22, 0.66, 0.86));
  return lin(vec3(0.20, 0.62, 0.90));
}

vec3 cloudColor(vec2 p) {
  float n = yzFbm(p * 0.42 + vec2(uTime * 0.012, uTime * 0.006));
  float n2 = yzFbm(p * 1.3 - vec2(uTime * 0.02, 0.0));
  float billow = smoothstep(0.32, 0.72, n * 0.75 + n2 * 0.35);
  vec3 shade = lin(vec3(0.69, 0.75, 0.88));
  vec3 lit = lin(vec3(0.98, 0.98, 1.0));
  vec3 c = mix(shade, lit, billow);
  // a warm rim where billows catch the light
  c += lin(vec3(1.0, 0.92, 0.8)) * 0.08 * smoothstep(0.55, 0.7, n2);
  return c;
}

void main() {
  vec2 p = vWPos.xz;
  ivec2 cr = yzPick(p);
  vec4 tile = yzTile(cr);
  int flags = yzFlags(tile);
  bool explored = (flags & 1) != 0;
  vec2 local = p - yzCenter(cr);

  // --- clouds over the unknown ---
  float cloud = explored ? 0.0 : 1.0;
  float wob = yzNoise(p * 2.3 + uTime * 0.05) * 0.22 + yzNoise(p * 5.0) * 0.1;
  if (explored) {
    for (int d = 0; d < 6; d++) {
      ivec2 nb = yzNeighbor(cr, d);
      vec4 nt = yzTile(nb);
      if ((yzFlags(nt) & 1) == 0) cloud = max(cloud, 1.0 - smoothstep(0.0, 0.18 + wob, yzEdge(local, d)));
    }
  }
  if (cloud >= 0.999 || uCloudOnly > 0.5) {
    vec3 c = cloudColor(p);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }

  // --- water ---
  vec3 base = waterClass(tile.a);
  float shore = 0.0;
  for (int d = 0; d < 6; d++) {
    ivec2 nb = yzNeighbor(cr, d);
    vec4 nt = yzTile(nb);
    float e = yzEdge(local, d);
    int nk = int(nt.a * 255.0 + 0.5);
    if (!yzInside(nb)) continue;
    if (nk == 0) shore = max(shore, 1.0 - smoothstep(0.0, 0.55, e));
    else base = mix(base, waterClass(nt.a), 0.5 * (1.0 - smoothstep(0.0, 0.7, e)));
  }
  vec3 shallow = lin(vec3(0.42, 0.86, 0.9));
  base = mix(base, shallow, shore * shore * 0.85);

  // animated ripples
  vec2 q = p * 1.7;
  float t = uTime;
  float h1 = yzFbm(q + vec2(t * 0.11, t * 0.07));
  float h2 = yzFbm(q * 1.9 - vec2(t * 0.09, -t * 0.05));
  float e = 0.06;
  float hx = yzFbm(q + vec2(e, 0.0) + vec2(t * 0.11, t * 0.07)) - h1 + yzFbm((q + vec2(e, 0.0)) * 1.9 - vec2(t * 0.09, -t * 0.05)) - h2;
  float hz = yzFbm(q + vec2(0.0, e) + vec2(t * 0.11, t * 0.07)) - h1 + yzFbm((q + vec2(0.0, e)) * 1.9 - vec2(t * 0.09, -t * 0.05)) - h2;
  vec3 n = normalize(vec3(-hx * 2.2, 1.0, -hz * 2.2));
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 L = normalize(uSun);
  float diff = 0.82 + 0.18 * max(dot(n, L), 0.0);
  vec3 col = base * diff;
  // sky reflection
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  col = mix(col, lin(vec3(0.7, 0.88, 1.0)), fres * 0.45);
  // sun glints
  float spec = pow(max(dot(reflect(-L, n), V), 0.0), 90.0);
  col += vec3(1.0, 0.95, 0.85) * spec * 1.3;
  // little sparkles
  float far = smoothstep(0.04, 0.12, fwidth(p.x));
  float sp = smoothstep(0.93, 0.99, yzNoise(p * 7.0 + vec2(t * 0.4, -t * 0.3))) * smoothstep(0.62, 0.8, yzNoise(p * 2.0 - t * 0.2));
  col += vec3(0.8) * sp * 0.5 * (1.0 - far);
  // shore foam: a bright rim plus lapping lines
  float rim = smoothstep(0.82, 0.97, shore);
  float lines = smoothstep(0.7, 0.95, sin(shore * 12.0 - t * 1.6 + yzNoise(p * 2.0) * 4.0) * 0.5 + 0.5) * smoothstep(0.35, 0.75, shore);
  float foam = max(rim, lines * 0.6 * (1.0 - far)) * (0.8 + 0.2 * yzNoise(p * 6.0 + t));
  col = mix(col, vec3(0.97, 0.99, 1.0), foam * 0.85);

  float vis = (flags & 2) != 0 ? 1.0 : 0.0;
  vec4 ov = yzOverlay(cr, tile, local);
  col = mix(col, ov.rgb, ov.a * 0.9);
  col = yzFog(col, vis);
  if (cloud > 0.0) col = mix(col, cloudColor(p), cloud);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Water {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;

  constructor(uniforms: SharedUniforms, width: number, depth: number, margin = 60) {
    this.material = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.common, { uSun: { value: new Vector3(-0.5, 1, -0.6) }, uCloudOnly: { value: 0 } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    Object.assign(this.material.uniforms, uniforms);
    const geo = new PlaneGeometry(width + margin * 2, depth + margin * 2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(width / 2, 0, depth / 2);
    this.mesh = new Mesh(geo, this.material);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.receiveShadow = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
