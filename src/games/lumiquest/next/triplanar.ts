// World-space triplanar mapping for architecture and rocks: photo textures
// projected along x, y and z and blended by the surface normal, so walls,
// roofs, planks and boulders get an even texel density without UVs and the
// statically batched (world-space) geometry needs no unwrapping.

import { Color, type MeshStandardMaterial, type Texture } from 'three';

export interface TriplanarOpts {
  map: Texture;
  normal: Texture;
  /** Metres per texture tile. */
  tile: number;
  tint?: Color;
  normalScale?: number;
}

let n = 0;

export function patchTriplanar(m: MeshStandardMaterial, o: TriplanarOpts): void {
  const id = ++n;
  m.map = null;
  m.needsUpdate = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tTriMap = { value: o.map };
    sh.uniforms.tTriNor = { value: o.normal };
    sh.uniforms.uTriTile = { value: 1 / o.tile };
    sh.uniforms.uTriTint = { value: o.tint ?? new Color('#ffffff') };
    sh.uniforms.uTriNs = { value: o.normalScale ?? 1 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriW;\nvarying vec3 vTriN;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vTriW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vTriN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vTriW = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTriN = normalize(mat3(modelMatrix) * objectNormal);
        #endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tTriMap; uniform sampler2D tTriNor; uniform float uTriTile; uniform vec3 uTriTint; uniform float uTriNs;
        varying vec3 vTriW; varying vec3 vTriN;
        vec3 triN;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec3 Nw = normalize(vTriN);
          vec3 b = pow(abs(Nw), vec3(4.0));
          b /= b.x + b.y + b.z;
          vec2 ux = vTriW.zy * uTriTile;
          vec2 uy = vTriW.xz * uTriTile;
          vec2 uz = vTriW.xy * uTriTile;
          vec3 c = texture2D(tTriMap, ux).rgb * b.x + texture2D(tTriMap, uy).rgb * b.y + texture2D(tTriMap, uz).rgb * b.z;
          diffuseColor.rgb *= c * uTriTint;
          // whiteout-blended triplanar normal, in world space
          vec3 tx = texture2D(tTriNor, ux).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(tTriNor, uy).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(tTriNor, uz).xyz * 2.0 - 1.0;
          tx.xy *= uTriNs; ty.xy *= uTriNs; tz.xy *= uTriNs;
          vec3 nx = vec3(0.0, tx.y, tx.x) * sign(Nw.x);
          vec3 ny = vec3(ty.x, 0.0, ty.y) * sign(Nw.y);
          vec3 nz = vec3(tz.x, tz.y, 0.0) * sign(Nw.z);
          triN = normalize(Nw + nx * b.x + ny * b.y + nz * b.z);
        }`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(triN, 0.0)).xyz) * (gl_FrontFacing ? 1.0 : -1.0);');
  };
  m.customProgramCacheKey = () => `lq-tri-${id}`;
}
