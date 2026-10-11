// The anime look's world pieces that sit on top of the vale: the dense GPU
// meadow (replacing the old grass tufts) and the painted mountain backdrop.
// The sky, sun and fog come from world/sky.ts; surfaces are toon-lit by
// anime/toon.ts.

import { Color, type Group, type Vector3 } from 'three';
import type { QualityProfile } from '../engine/renderer';
import type { World } from '../world/world';
import { GpuGrass, grassUniforms, type GrassQuality } from './grass';
import { mountainBackdrop, mountainUniforms } from './mountains';

export function grassQuality(p: QualityProfile): GrassQuality {
  if (p.tier === 'low') return { density: 26, range: 26, near: 5 };
  if (p.tier === 'medium') return { density: 52, range: 42, near: 7 };
  return { density: 85, range: 58, near: 8 };
}

const NIGHT_TINT = new Color('#3a4a86');

export class AnimeLook {
  readonly grass: GpuGrass;
  private mountains: Group;

  constructor(private world: World, profile: QualityProfile) {
    this.grass = new GpuGrass(world.terrain, grassQuality(profile));
    world.nature.grassEnabled = false;
    world.scene.add(this.grass.group);
    // the painted ranges replace the old backdrop (lit ring, far castle, ribbon falls)
    world.props.backdropGroup.visible = false;
    this.mountains = mountainBackdrop();
    world.scene.add(this.mountains);
  }

  setProfile(p: QualityProfile): void {
    this.grass.setQuality(grassQuality(p));
  }

  update(cam: Vector3, time: number): void {
    const sky = this.world.sky;
    mountainUniforms.uHorizon.value.copy(sky.fogColor);
    mountainUniforms.uTint.value.setRGB(1, 1, 1).lerp(NIGHT_TINT, sky.night * 0.85);
    this.mountains.position.set(cam.x, 0, cam.z);
    grassUniforms.uSunDir.value.copy(sky.sunDir);
    grassUniforms.uSunColor.value.copy(sky.sun.color).multiplyScalar(1 - sky.night * 0.8);
    this.grass.update(cam, time);
  }

  dispose(): void {
    this.grass.dispose();
  }
}
