// Terrain shading from photo-scanned CC0 textures (Poly Haven): meadow,
// dirt path, rock and cobbles, blended per vertex from the heightfield's
// surface classes and slope. Textures are mapped in world space (no seams
// between chunks), rock is mapped triplanar on steep ground, a second, larger
// scale breaks up tiling, and the blend is height-aware (the brighter, raised
// parts of a texture win at a transition) so paths and cliffs meet the grass
// with natural, ragged edges.

import { BufferAttribute, Color, MeshStandardMaterial, type Mesh, type Texture } from 'three';
import type { Terrain } from '../world/terrain';

export interface TerrainTextures {
  grass: [Texture, Texture];
  dirt: [Texture, Texture];
  rock: [Texture, Texture];
  cobble: [Texture, Texture];
}

/** Per-vertex blend weights (grass, dirt, rock, cobble) from the heightfield's surfaces and slope. */
function splatFor(terrain: Terrain, x: number, z: number, out: number[]): void {
  const s = terrain.surfaceAt(x, z);
  const dx = terrain.height(x + 1, z) - terrain.height(x - 1, z);
  const dz = terrain.height(x, z + 1) - terrain.height(x, z - 1);
  const slope = Math.hypot(dx, dz) / 2;
  let g = 0;
  let d = 0;
  let r = 0;
  let c = 0;
  switch (s) {
    case 'grass': g = 1; break;
    case 'path': case 'sand': d = 1; break;
    case 'rock': case 'cave': case 'snow': r = 1; break;
    case 'stone': case 'plaza': c = 1; break;
    case 'water': d = 0.6; r = 0.4; break;
  }
  // steep ground shows rock whatever it is classed as
  const steep = Math.min(1, Math.max(0, (slope - 0.55) / 0.5));
  g *= 1 - steep;
  d *= 1 - steep * 0.7;
  r = Math.max(r, steep);
  const sum = g + d + r + c || 1;
  out[0] = g / sum;
  out[1] = d / sum;
  out[2] = r / sum;
  out[3] = c / sum;
}

/** Adds the blend weights to every terrain chunk mesh. */
export function addSplat(terrain: Terrain, meshes: Mesh[]): void {
  const w = [0, 0, 0, 0];
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    const a = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      splatFor(terrain, pos.getX(i), pos.getZ(i), w);
      a.set(w, i * 4);
    }
    m.geometry.setAttribute('aSplat', new BufferAttribute(a, 4));
  }
}

export const terrainUniforms = {
  uGrassTint: { value: new Color('#b8b06a') },
};

export function terrainMaterial(t: TerrainTextures): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tGrass = { value: t.grass[0] };
    sh.uniforms.nGrass = { value: t.grass[1] };
    sh.uniforms.tDirt = { value: t.dirt[0] };
    sh.uniforms.nDirt = { value: t.dirt[1] };
    sh.uniforms.tRock = { value: t.rock[0] };
    sh.uniforms.nRock = { value: t.rock[1] };
    sh.uniforms.tCobble = { value: t.cobble[0] };
    sh.uniforms.nCobble = { value: t.cobble[1] };
    sh.uniforms.uGrassTint = terrainUniforms.uGrassTint;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSplat;\nvarying vec4 vSplat;\nvarying vec3 vTerrW;\nvarying vec3 vTerrN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = aSplat;\nvTerrW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTerrN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tGrass; uniform sampler2D nGrass;
        uniform sampler2D tDirt; uniform sampler2D nDirt;
        uniform sampler2D tRock; uniform sampler2D nRock;
        uniform sampler2D tCobble; uniform sampler2D nCobble;
        uniform vec3 uGrassTint;
        varying vec4 vSplat; varying vec3 vTerrW; varying vec3 vTerrN;
        float tLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
        float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        // two scales of one texture, mixed by a slow noise, so repeats do not line up
        vec3 tSample(sampler2D s, vec2 uv, float m) {
          return mix(texture2D(s, uv).rgb, texture2D(s, uv * 0.31 + vec2(0.37, 0.71)).rgb, m);
        }
        vec3 tri(sampler2D s, vec3 p, vec3 n, float sc) {
          vec3 b = pow(abs(n), vec3(4.0));
          b /= b.x + b.y + b.z;
          return texture2D(s, p.zy * sc).rgb * b.x + texture2D(s, p.xz * sc).rgb * b.y + texture2D(s, p.xy * sc).rgb * b.z;
        }
        vec3 tSplatAlbedo;
        vec3 tSplatNormal;`,
      )
      .replace(
        '#include <map_fragment>',
        `
        {
          vec3 P = vTerrW;
          vec3 Ng = normalize(vTerrN);
          float mixN = smoothstep(0.35, 0.65, tNoise(P.xz * 0.04));
          vec3 cg = tSample(tGrass, P.xz / 4.0, mixN) * uGrassTint * 1.9;
          vec3 cd = tSample(tDirt, P.xz / 3.0, mixN);
          vec3 cr = tri(tRock, P, Ng, 1.0 / 6.0);
          vec3 cc = texture2D(tCobble, P.xz / 3.2).rgb;
          // height-aware blend: raised (brighter) texels win at the borders
          vec4 w = vSplat;
          vec4 hgt = vec4(tLum(cg), tLum(cd), tLum(cr), tLum(cc)) * 0.6 + tNoise(P.xz * 0.9) * 0.25;
          vec4 bw = w + hgt * step(0.001, w);
          float mx = max(max(bw.x, bw.y), max(bw.z, bw.w));
          bw = max(bw - (mx - 0.22), 0.0) * step(0.001, w);
          bw /= max(bw.x + bw.y + bw.z + bw.w, 1e-4);
          tSplatAlbedo = cg * bw.x + cd * bw.y + cr * bw.z + cc * bw.w;
          // large-scale variation: sun-dried and lush patches
          tSplatAlbedo *= 0.85 + 0.3 * tNoise(P.xz * 0.012 + 3.0);
          vec3 ng = texture2D(nGrass, P.xz / 4.0).xyz * 2.0 - 1.0;
          vec3 nd = texture2D(nDirt, P.xz / 3.0).xyz * 2.0 - 1.0;
          vec3 nr = texture2D(nRock, P.xz / 6.0).xyz * 2.0 - 1.0;
          vec3 nc = texture2D(nCobble, P.xz / 3.2).xyz * 2.0 - 1.0;
          vec3 tn = ng * bw.x + nd * bw.y + nr * bw.z + nc * bw.w;
          // whiteout blend onto the surface normal (tangent space ~ world XZ on gentle ground)
          tSplatNormal = normalize(Ng + vec3(tn.x, 0.0, -tn.y) * 0.9);
          diffuseColor.rgb *= tSplatAlbedo;
        }`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(tSplatNormal, 0.0)).xyz);');
  };
  m.customProgramCacheKey = () => 'lq-next-terrain';
  return m;
}
