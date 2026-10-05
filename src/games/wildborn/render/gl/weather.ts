// Weather in the 3D scene: rain as instanced streaks that follow the camera,
// mist as thickened fog, and a storm flash. Cheap by construction — one draw
// call for rain, and nothing at all when it is clear.

import {
  BoxGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  type Fog,
  Vector3,
} from 'three';

const COUNT = 260;
/** The box of sky the rain lives in, centred on the camera. */
const BOX = 34;
const HEIGHT = 26;

export class Weather {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();
  private drops: { x: number; y: number; z: number; speed: number }[] = [];
  private active = false;

  constructor() {
    const geo = new BoxGeometry(0.022, 0.42, 0.022);
    const mat = new MeshBasicMaterial({
      color: 0xbcd8f0,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, COUNT);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let k = 0; k < COUNT; k++) {
      this.drops.push({
        x: (Math.random() - 0.5) * BOX,
        y: Math.random() * HEIGHT,
        z: (Math.random() - 0.5) * BOX,
        speed: 12 + Math.random() * 10,
      });
    }
  }

  /** Show or hide rain for a weather state. */
  setWeather(weather: string): void {
    const raining = weather === 'rain' || weather === 'storm';
    if (raining === this.active) return;
    this.active = raining;
    this.mesh.visible = raining;
    this.mesh.count = raining ? COUNT : 0;
  }

  /** Advance the drops, keeping them around the camera. */
  update(dt: number, cameraPos: Vector3, heavy: boolean): void {
    if (!this.active) return;
    const d = this.dummy;
    const tilt = heavy ? 0.35 : 0.16;
    for (let k = 0; k < COUNT; k++) {
      const drop = this.drops[k];
      drop.y -= drop.speed * dt;
      if (drop.y < 0) {
        drop.y = HEIGHT;
        drop.x = (Math.random() - 0.5) * BOX;
        drop.z = (Math.random() - 0.5) * BOX;
      }
      d.position.set(
        cameraPos.x + drop.x + drop.y * tilt,
        cameraPos.y + drop.y - HEIGHT * 0.5,
        cameraPos.z + drop.z,
      );
      d.rotation.set(0, 0, tilt);
      d.scale.set(1, heavy ? 1.5 : 1, 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(k, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    const mat = this.mesh.material as MeshBasicMaterial;
    mat.opacity = heavy ? 0.62 : 0.45;
  }

  /** Fog density and colour for the weather. */
  applyFog(fog: Fog, weather: string): void {
    if (weather === 'fog') {
      fog.near = 3;
      fog.far = 34;
    } else if (weather === 'storm') {
      fog.near = 20;
      fog.far = 92;
    } else if (weather === 'rain') {
      fog.near = 28;
      fog.far = 116;
    }
  }

  /** A lightning flash, as a screen brightness value for the view to apply. */
  flash(now: number, weather: string): number {
    if (weather !== 'storm') return 0;
    const phase = Math.sin(now / 900);
    return phase > 0.995 ? 0.28 : 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}