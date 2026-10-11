// The new look for Brightwater Vale (behind ?next while it is being built):
// photographic CC0 sky and image-based light, photo-textured terrain and
// architecture, and a dense GPU meadow. It dresses the existing world (same
// layout, colliders and interactables) and takes over the sun, fog and
// environment from the old atmosphere each frame.

import { Color, Group, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3, type Texture, type WebGLRenderer } from 'three';
import type { QualityProfile } from '../engine/renderer';
import type { World } from '../world/world';
import { GpuGrass, grassUniforms, type GrassQuality } from './grass';
import { mountainBackdrop } from './mountains';
import { PhotoSky } from './sky';
import { addSplat, terrainMaterial } from './terrain';
import { patchTriplanar } from './triplanar';
import skyUrl from '../assets/tex/sky_kloppenheim_06.webp?url';
import hdrUrl from '../assets/tex/sky_kloppenheim_06_1k.hdr?url';
import grassD from '../assets/tex/aerial_grass_rock_diff.webp?url';
import grassN from '../assets/tex/aerial_grass_rock_nor.webp?url';
import dirtD from '../assets/tex/park_dirt_diff.webp?url';
import dirtN from '../assets/tex/park_dirt_nor.webp?url';
import rockD from '../assets/tex/rocky_terrain_02_diff.webp?url';
import rockN from '../assets/tex/rocky_terrain_02_nor.webp?url';
import cobD from '../assets/tex/grassy_cobblestone_diff.webp?url';
import cobN from '../assets/tex/grassy_cobblestone_nor.webp?url';
import wallD from '../assets/tex/castle_wall_slates_diff.webp?url';
import wallN from '../assets/tex/castle_wall_slates_nor.webp?url';
import plasD from '../assets/tex/white_plaster_02_diff.webp?url';
import plasN from '../assets/tex/white_plaster_02_nor.webp?url';
import roofD from '../assets/tex/clay_roof_tiles_02_diff.webp?url';
import roofN from '../assets/tex/clay_roof_tiles_02_nor.webp?url';
import plankD from '../assets/tex/brown_planks_03_diff.webp?url';
import plankN from '../assets/tex/brown_planks_03_nor.webp?url';

/** Adds light through thin surfaces (leaves) when they are between the eye and the sun. */
function backlit(m: MeshStandardMaterial): void {
  m.userData.lqBacklit = true;
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uSunDir = grassUniforms.uSunDir;
    sh.uniforms.uSunColor = grassUniforms.uSunColor;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uSunColor;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 lqL = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          vec3 lqV = normalize(vViewPosition);
          float lqT = pow(max(dot(-lqV, lqL), 0.0), 4.0);
          totalEmissiveRadiance += diffuseColor.rgb * uSunColor * lqT * 1.1;
          // canopies scatter light inside: a soft warm fill so shaded leaves never go black
          totalEmissiveRadiance += diffuseColor.rgb * uSunColor * 0.16;
        }`,
      );
  };
  m.customProgramCacheKey = () => `${prevKey.call(m)}-backlit`;
  m.needsUpdate = true;
}

export function nextLookEnabled(): boolean {
  try {
    return new URLSearchParams(location.search).has('next');
  } catch {
    return false;
  }
}

export function grassQuality(p: QualityProfile): GrassQuality {
  if (p.tier === 'low') return { density: 35, range: 28, near: 5 };
  if (p.tier === 'medium') return { density: 70, range: 45, near: 7 };
  return { density: 120, range: 60, near: 8 };
}

export class NextLook {
  ready = false;
  readonly sky = new PhotoSky();
  readonly grass: GpuGrass;
  private sunDir = new Vector3();
  private mountains: Group | null = null;

  constructor(private world: World, private renderer: WebGLRenderer, profile: QualityProfile) {
    this.grass = new GpuGrass(world.terrain, grassQuality(profile));
  }

  setProfile(p: QualityProfile): void {
    this.grass.setQuality(grassQuality(p));
  }

  async load(): Promise<void> {
    const tl = new TextureLoader();
    const tex = async (url: string, srgb: boolean): Promise<Texture> => {
      const t = await tl.loadAsync(url);
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
      t.anisotropy = 8;
      return t;
    };
    const pair = (d: string, n: string) => Promise.all([tex(d, true), tex(n, false)]) as Promise<[Texture, Texture]>;
    const [grass, dirt, rock, cobble, wall, plaster, roof, plank, info] = await Promise.all([
      pair(grassD, grassN),
      pair(dirtD, dirtN),
      pair(rockD, rockN),
      pair(cobD, cobN),
      pair(wallD, wallN),
      pair(plasD, plasN),
      pair(roofD, roofN),
      pair(plankD, plankN),
      this.sky.load(this.renderer, skyUrl, hdrUrl),
    ]);
    const w = this.world;
    // terrain
    addSplat(w.terrain, w.terrain.chunks);
    const tm = terrainMaterial({ grass, dirt, rock, cobble });
    for (const c of w.terrain.chunks) c.material = tm;
    // architecture and rocks: world-space triplanar photo textures
    const mats = w.props.mats as Record<string, MeshStandardMaterial>;
    const tri = (m: MeshStandardMaterial | undefined, t: [Texture, Texture], tile: number, tint?: string, ns = 1) => {
      if (!m || !m.isMeshStandardMaterial) return;
      // the photo carries the colour now (vertex-coloured materials keep their tints)
      if (!m.vertexColors) m.color.set('#ffffff');
      patchTriplanar(m, { map: t[0], normal: t[1], tile, tint: tint ? new Color(tint) : undefined, normalScale: ns });
    };
    tri(mats.stone, wall, 2.6, '#f4ece0');
    tri(mats.ruin, wall, 2.6, '#cfcabe');
    tri(mats.rock, rock, 3.5);
    tri(mats.plaster, plaster, 3, '#f3eadb', 0.6);
    tri(mats.wood, plank, 1.6, '#e2cfb8');
    tri(mats.darkWood, plank, 1.6, '#9a7c64');
    for (const [k, m] of Object.entries(mats)) if (k.startsWith('roof:')) tri(m, roof, 2.2, '#ffffff', 1.2);
    for (const k of Object.values(w.nature.kits)) if ((k.mat as MeshStandardMaterial).map && k.collide > 0.8) tri(k.mat as MeshStandardMaterial, rock, 3);
    // distant mountains: a matte-painted backdrop replaces the lit ring
    w.props.backdropMat.visible = false;
    if (w.props.farCastle) w.props.farCastle.visible = false;
    this.mountains = mountainBackdrop(info.horizon, info.sunDir);
    w.scene.add(this.mountains);
    // leaves let the low sun shine through them, like the grass
    for (const k of Object.values(w.nature.kits)) {
      const m = k.mat as MeshStandardMaterial;
      if (m.alphaTest > 0 && !m.userData.lqBacklit) {
        backlit(m);
        // soft, anti-aliased leaf edges (uses the multisampled render target)
        m.alphaToCoverage = true;
        m.alphaTest = 0.35;
      }
    }
    // the meadow
    w.nature.grassEnabled = false;
    w.scene.add(this.grass.group);
    // the sky
    w.sky.dome.visible = false;
    w.scene.add(this.sky.dome);
    w.scene.environment = this.sky.envTexture;
    this.sunDir.copy(info.sunDir);
    this.ready = true;
  }

  /** After the old atmosphere's update: the photo sky's sun, light, haze and environment win. */
  apply(cam: Vector3, time: number): void {
    if (!this.ready) return;
    const w = this.world;
    const sky = w.sky;
    const info = this.sky.info;
    // keep shadows readable: the light never grazes lower than ~16 degrees
    const ld = info.sunDir.clone();
    ld.y = Math.max(ld.y, 0.28);
    ld.normalize();
    sky.sun.position.copy(sky.sun.target.position).addScaledVector(ld, 80);
    sky.sun.color.copy(info.sunColor);
    sky.sun.intensity = 3.8 * (1 - w.caveFactor * 0.85);
    sky.hemi.intensity = 0.2;
    sky.fog.color.copy(info.horizon);
    sky.fogColor.copy(info.horizon);
    sky.sunVisual.copy(info.sunDir);
    sky.shaftAmount = 0.85;
    sky.night = 0;
    w.scene.environment = this.sky.envTexture;
    w.scene.environmentIntensity = 0.55 * (1 - w.caveFactor * 0.8);
    this.sky.dome.position.copy(cam);
    if (this.mountains) this.mountains.position.set(cam.x, 0, cam.z);
    grassUniforms.uSunDir.value.copy(info.sunDir);
    grassUniforms.uSunColor.value.copy(info.sunColor);
    this.grass.update(cam, time);
  }
}
