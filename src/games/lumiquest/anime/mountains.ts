// Distant mountains as a painted backdrop: three rings of ridge silhouettes
// around the vale in clean anime colours (teal-green near ranges, soft blue
// far ones, white snow on the highest), unlit, melting into the live horizon
// colour at their feet and dimming with the night.

import { BufferAttribute, Color, CylinderGeometry, Group, Mesh, ShaderMaterial } from 'three';
import { Noise2D } from '../../shared/noise';
import { Rng } from '../../shared/rng';

interface Layer {
  radius: number;
  base: number;
  height: number;
  /** 0 = nearest (deepest colour) .. 1 = farthest (palest, bluest). */
  depth: number;
  snow: boolean;
  seed: number;
}

const LAYERS: Layer[] = [
  { radius: 860, base: -8, height: 240, depth: 1, snow: true, seed: 11 },
  { radius: 700, base: -8, height: 150, depth: 0.6, snow: true, seed: 23 },
  { radius: 560, base: -6, height: 90, depth: 0.25, snow: false, seed: 37 },
];

export const mountainUniforms = {
  uHorizon: { value: new Color('#c4e4f6') },
  uTint: { value: new Color('#ffffff') },
};

const VERT = /* glsl */ `
attribute float aHaze;
varying vec3 vCol;
varying float vHaze;
void main() {
  vCol = color;
  vHaze = aHaze;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uTint;
varying vec3 vCol;
varying float vHaze;
void main() {
  vec3 c = mix(vCol * uTint, uHorizon, vHaze);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function mountainBackdrop(): Group {
  const g = new Group();
  const near = new Color('#4f9488');
  const far = new Color('#86a9dc');
  const snowC = new Color('#ffffff');
  const mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: mountainUniforms, vertexColors: true, depthWrite: false, fog: false });
  for (const L of LAYERS) {
    const noise = new Noise2D(new Rng(L.seed));
    const geo = new CylinderGeometry(1, 1, 1, 360, 12, true);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const haze = new Float32Array(pos.count);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const t = pos.getY(i) + 0.5; // 0 foot .. 1 crest
      const ca = Math.cos(a) * 2.2;
      const sa = Math.sin(a) * 2.2;
      const ridge = 0.35 + 0.65 * (0.6 * noise.ridged(ca + 4, sa - 3, 5) + 0.4 * noise.fbm(ca * 3 + 1, sa * 3, 3) * 0.5 + 0.2);
      const crest = L.height * ridge;
      const y = L.base + t * crest;
      pos.setXYZ(i, Math.cos(a) * L.radius, y, Math.sin(a) * L.radius);
      c.copy(near).lerp(far, L.depth);
      // painted light: crests a little brighter than the shaded feet
      c.multiplyScalar(0.86 + 0.22 * t);
      if (L.snow && y > L.base + L.height * 0.6) c.lerp(snowC, Math.min(1, (y - (L.base + L.height * 0.6)) / (L.height * 0.08)) * 0.92);
      col.set([c.r, c.g, c.b], i * 3);
      haze[i] = Math.min(1, (1 - t) * (0.45 + L.depth * 0.3) + L.depth * 0.22);
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.setAttribute('aHaze', new BufferAttribute(haze, 1));
    const m = new Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = -9;
    g.add(m);
  }
  return g;
}
