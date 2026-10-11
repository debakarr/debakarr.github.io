// Atmospheric fog for every lit surface in the vale, replacing three's linear
// fog chunks (this page only). It integrates exponential height fog along the
// view ray (thick over the river and in the hollows, thin on the hilltops),
// keeps a clear zone around the camera, cools toward blue with distance
// (aerial perspective) and glows with the sun's colour when you look into the
// light.
//
// The scene's Fog object still drives it: `near` is the clear radius and `far`
// sets the visibility (density ≈ 2.4 / far at the valley floor). The sun is
// read from the first directional light, so unlit materials simply get the
// plain haze.

import { ShaderChunk } from 'three';

let installed = false;

/** How quickly the haze thins with height (per metre). */
const FALLOFF = 0.045;

export function installAtmosphericFog(): void {
  if (installed) return;
  installed = true;

  ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;

  ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // world position from the view-space one: w = R^T (v - t)
  vFogWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;

  ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;

  ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  {
    vec3 lqRay = vFogWorld - cameraPosition;
    float lqLen = length(lqRay);
    vec3 lqDir = lqRay / max(lqLen, 1e-4);
    #ifdef FOG_EXP2
      float lqClear = 0.0;
      float lqA = fogDensity;
    #else
      float lqClear = fogNear;
      float lqA = 2.4 / max(fogFar, 1.0);
    #endif
    // exponential height fog integrated from the end of the clear zone to the surface
    float lqD = max(lqLen - lqClear, 0.0);
    float lqY0 = cameraPosition.y + lqDir.y * min(lqClear, lqLen);
    float lqK = ${FALLOFF.toFixed(4)} * lqDir.y;
    float lqAmt = lqA * exp(-${FALLOFF.toFixed(4)} * max(lqY0, -20.0)) * (abs(lqK) > 1e-4 ? (1.0 - exp(-lqK * lqD)) / lqK : lqD);
    float fogFactor = clamp(1.0 - exp(-lqAmt), 0.0, 1.0);
    // aerial perspective: the deep distance cools toward blue
    vec3 lqCol = mix(fogColor, fogColor * vec3(0.8, 0.9, 1.1), fogFactor * 0.65);
    #if defined( STANDARD ) || defined( PHONG ) || defined( LAMBERT ) || defined( TOON )
    #if NUM_DIR_LIGHTS > 0
      // looking into the light, the haze takes the sun's colour
      vec3 lqSun = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
      vec3 lqSunCol = directionalLights[0].color / max(max(directionalLights[0].color.r, directionalLights[0].color.g), 1e-3);
      float lqS = pow(max(dot(lqDir, lqSun), 0.0), 6.0);
      lqCol = mix(lqCol, lqSunCol * max(max(fogColor.r, fogColor.g), fogColor.b) * 1.08, lqS * 0.6);
    #endif
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, lqCol, fogFactor);
  }
#endif`;
}
