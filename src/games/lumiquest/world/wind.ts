// A shared wind field patched into standard materials. Sway is computed in
// world space (so a gust rolls across a whole meadow) and converted into each
// instance's local space; the grass also shrinks away near its draw radius so
// streaming chunks never pop.

import type { Material, MeshStandardMaterial } from 'three';

export const wind = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uFadeFar: { value: 50 },
};

export function windPatch(mat: MeshStandardMaterial, opts: { bend: number; fade?: boolean; key: string; petals?: boolean }): Material {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uTime;
    sh.uniforms.uWind = wind.uWind;
    sh.uniforms.uFadeFar = wind.uFadeFar;
    let vs = sh.vertexShader;
    if (opts.petals) {
      // instance colour tints only the petals (marked by the aPetal attribute)
      vs = 'attribute float aPetal;\n' + vs.replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          vColor.xyz = mix(color.xyz, color.xyz * instanceColor.xyz, aPetal);
        #endif`,
      );
    }
    sh.vertexShader =
      'uniform float uTime;\nuniform float uWind;\nuniform float uFadeFar;\n' +
      vs.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          mat4 lqInst = instanceMatrix;
        #else
          mat4 lqInst = mat4(1.0);
        #endif
        vec3 lqIp = (modelMatrix * lqInst * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float lqBend = max(position.y, 0.0) * ${opts.bend.toFixed(3)};
        float lqG = sin(uTime * 1.3 + lqIp.x * 0.11 + lqIp.z * 0.07);
        float lqW = (0.55 + 0.45 * lqG) * (0.7 + 0.3 * sin(uTime * 2.9 + lqIp.x * 0.9 - lqIp.z * 0.7));
        vec3 lqOff = vec3(0.8, 0.0, 0.45) * lqW * uWind * lqBend * lqBend;
        mat3 lqM3 = mat3(lqInst);
        float lqS2 = max(dot(lqM3[0], lqM3[0]), 1e-4);
        transformed += (transpose(lqM3) * lqOff) / lqS2;
        ${opts.fade ? 'float lqFd = distance(lqIp.xz, cameraPosition.xz); transformed *= 1.0 - smoothstep(uFadeFar * 0.7, uFadeFar, lqFd);' : ''}
        `,
      );
  };
  mat.customProgramCacheKey = () => `wind-${opts.key}`;
  return mat;
}
