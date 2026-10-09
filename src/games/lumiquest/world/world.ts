// Assembles Brightwater Vale: terrain, collision, architecture, nature,
// water, sky and ambient life, plus an image-based light refreshed from the
// sky as the day turns so PBR surfaces and water reflect the right colours.

import {
  Color,
  Mesh,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  BackSide,
  MeshBasicMaterial,
  type Texture,
  type Vector3,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { CAVE } from '../data/world';
import { CollisionWorld } from '../engine/physics';
import type { QualityProfile } from '../engine/renderer';
import type { WeatherKind } from '../systems/state';
import { Ambient } from './effects';
import { Nature } from './nature';
import { Props } from './props';
import { Atmosphere } from './sky';
import { Terrain } from './terrain';
import { Water } from './water';
import { wind } from './wind';

export class World {
  readonly scene = new Scene();
  readonly terrain: Terrain;
  readonly physics: CollisionWorld;
  readonly props: Props;
  readonly nature: Nature;
  readonly water: Water;
  readonly sky: Atmosphere;
  readonly ambient: Ambient;
  private pmrem: PMREMGenerator;
  private envTarget: WebGLRenderTarget | null = null;
  private envScene = new Scene();
  private envDome: Mesh;
  private envHour = -99;
  private envWeather = '';
  caveFactor = 0;

  constructor(renderer: WebGLRenderer, private profile: QualityProfile, onProgress?: (p: number, label: string) => void) {
    onProgress?.(0.1, 'Shaping the vale');
    this.terrain = new Terrain();
    this.scene.add(this.terrain.build());
    this.physics = new CollisionWorld(this.terrain);
    onProgress?.(0.3, 'Raising the outpost');
    this.props = new Props(this.terrain, this.physics);
    this.scene.add(this.props.group);
    onProgress?.(0.5, 'Growing the woods');
    this.nature = new Nature(this.terrain, this.physics);
    this.scene.add(this.nature.group);
    onProgress?.(0.65, 'Filling the river');
    this.water = new Water(this.terrain);
    this.scene.add(this.water.group);
    this.sky = new Atmosphere(this.scene, profile.shadowSize);
    this.ambient = new Ambient(this.terrain, profile.particles);
    this.scene.add(this.ambient.group);
    this.scene.environmentIntensity = 0.55;
    this.pmrem = new PMREMGenerator(renderer);
    this.envDome = new Mesh(new SphereGeometry(10, 24, 12), new MeshBasicMaterial({ side: BackSide, vertexColors: false }));
    this.envScene.add(this.envDome);
  }

  setProfile(p: QualityProfile): void {
    this.profile = p;
    this.sky.setShadowSize(p.shadowSize);
  }

  /** Rebuilds the environment map from the sky when the light changes enough. */
  private refreshEnv(hour: number, weather: WeatherKind): void {
    const dh = Math.min(Math.abs(hour - this.envHour), 24 - Math.abs(hour - this.envHour));
    if (dh < 0.75 && weather === this.envWeather) return;
    this.envHour = hour;
    this.envWeather = weather;
    // a cheap gradient copy of the sky: the sky shader itself, on a small dome
    this.envDome.material = this.sky.dome.material;
    this.envDome.scale.setScalar(1);
    const prev = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0.04, 0.1, 100);
    this.scene.environment = this.envTarget.texture as Texture;
    prev?.dispose();
  }

  update(dt: number, time: number, hour: number, weather: WeatherKind, focus: Vector3, cam: Vector3, inCaveRegion: boolean): void {
    wind.uTime.value = time;
    wind.uWind.value = weather === 'rain' ? 1.6 : weather === 'cloudy' ? 1.2 : 1;
    wind.uFadeFar.value = this.profile.grassRange;
    this.caveFactor += ((inCaveRegion ? 1 : 0) - this.caveFactor) * Math.min(1, dt * 1.5);
    this.sky.cave = this.caveFactor;
    this.sky.shadowRange = this.profile.shadowRange;
    this.sky.drawDistance = this.profile.drawDistance;
    this.sky.update(hour, weather, focus, cam, dt, time);
    this.refreshEnv(hour, weather);
    this.scene.environmentIntensity = 0.55 * (1 - this.caveFactor * 0.8) * (1 - this.sky.night * 0.4);
    this.nature.update(cam, this.profile.drawDistance, this.profile.shadowRange + 10, this.profile.grassRange, this.profile.grassDensity);
    this.water.update(time, dt);
    this.props.update(time, this.sky.night, this.caveFactor, this.sky.fogColor);
    this.ambient.update(cam, time, dt, this.sky.night, this.sky.rainAmount, this.sky.mistAmount, this.caveFactor);
  }

  isCave(x: number, z: number): boolean {
    return this.terrain.inCave(x, z) || Math.hypot(x - CAVE.hall[0], z - CAVE.hall[1]) < CAVE.hallRadius;
  }

  get background(): Color {
    return this.sky.fogColor;
  }

  dispose(): void {
    this.terrain.dispose();
    this.nature.dispose();
    this.water.dispose();
    this.envTarget?.dispose();
    this.pmrem.dispose();
  }
}
