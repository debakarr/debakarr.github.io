// Soft cel lighting for every standard (PBR) surface in the vale: direct
// light reaches a surface in a narrow band around the terminator instead of
// the smooth Lambert falloff, so terrain, buildings, trees and grass read as
// lit or shaded in clean shapes, like the anime characters standing on them.
// Ambient, sky and reflected light are untouched. (The characters' MToon
// shader has its own toon model and is not affected.)

import { ShaderChunk } from 'three';

let installed = false;

export function installToonLighting(): void {
  if (installed) return;
  installed = true;
  const src = ShaderChunk.lights_physical_pars_fragment;
  const diffuse = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
  const fn = 'void RE_Direct_Physical(';
  if (!src.includes(diffuse) || !src.includes(fn)) {
    console.warn('toon lighting: three.js lighting chunk changed; keeping smooth light');
    return;
  }
  ShaderChunk.lights_physical_pars_fragment = src
    .replace(
      fn,
      `float lqToonRamp( float x ) {
	// lit or shaded with a narrow, soft terminator; a little of the smooth falloff keeps form
	return mix( smoothstep( -0.02, 0.16, x ), saturate( x ), 0.22 );
}
${fn}`,
    )
    // only the diffuse term is banded: specular keeps its physical falloff, or grazing light
    // would light up hot specks on every leaf and stone
    .replace(diffuse, 'reflectedLight.directDiffuse += lqToonRamp( dot( geometryNormal, directLight.direction ) ) * directLight.color * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );');
}
