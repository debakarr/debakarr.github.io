// The 3D stage: renderer, scene, sky, sun, fog and the day/night cycle.
//
// Shared heights and colours live in `./terrain`, because both the mesh and the
// camera (which must not sink into the ground) need to agree on them.

import {
  AmbientLight,
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';

/** Ground height in world units for each tile (1 tile = 1 unit wide). */
export const HEIGHT: Record<number, number> = {
  0: 0, // Grass
  1: 0.04, // Tall grass
  2: 0.05, // Path
  3: 0, // Tree (the tree itself is a prop)
  4: -0.34, // Water
  5: -0.72, // Deep water
  6: 0.42, // Rock
  7: 1.85, // Mountain
  8: 0.06, // Ash
  9: -0.22, // Lava
  10: 0.34, // Crystal formation
  11: 0.08, // Cave floor
  12: 0.07, // Ruin floor
  13: 0.16, // Pillar base
  14: 0.09, // Village floor
  15: 0, // Wall (the house itself is a prop)
  16: -0.06, // Reeds
  17: 0.04, // Flowers
  18: 0.08, // Sand
};

/** How tall the player is, and where their eyes are. */
export const PLAYER_HEIGHT = 1.72;
export const EYE_HEIGHT = 1.58;

/** Ground height for a tile id, in world units. */
export const heightOf = (tile: number): number => HEIGHT[tile] ?? 0;

/** The light of a given hour: direction, colour and strength. */
export interface SunState {
  /** Unit vector the light travels along (from the sun toward the world). */
  dir: Vector3;
  color: Color;
  intensity: number;
  /** Sky dome colours, top to bottom. */
  skyTop: Color;
  skyBottom: Color;
  fog: Color;
  fogNear: number;
  fogFar: number;
  ambient: number;
  night: boolean;
  dusk: boolean;
}

const C = (hex: number) => new Color(hex);

function mix(a: Color, b: Color, t: number): Color {
  return a.clone().lerp(b, t);
}

/**
 * Light for an hour of the day. The sun swings east to west, shadows stretch at
 * the ends of the day, dusk is warm, night is a cool moon.
 */
export function sunAt(hour: number): SunState {
  const night = hour >= 19 || hour <= 5;
  const dusk = !night && (hour >= 16.5 || hour <= 7.5);
  const day = night ? 0 : dusk ? Math.min(1, Math.abs(hour - 12) / 5.5) : 0;
  // 0 at 6h (east), 0.5 at noon (overhead), 1 at 18h (west).
  const t = ((hour - 6) / 12 + 1) % 1;
  const elevation = Math.max(0.08, Math.sin(t * Math.PI));
  const azimuth = (t - 0.5) * 2;
  const dir = new Vector3(azimuth * 0.85, -(0.35 + elevation * 0.9), 0.55).normalize();

  const warm = C(0xffb46a);
  const noon = C(0xfff6e4);
  const moonlight = C(0x9fc0ff);
  const color = night ? moonlight : dusk ? mix(noon, warm, day) : noon;
  const intensity = night ? 0.5 : dusk ? 1.15 : 1.85;

  const skyTop = night ? C(0x070d24) : dusk ? mix(C(0x2b2f5e), C(0x12183a), day) : C(0x2f7fb8);
  const skyBottom = night ? C(0x121c38) : dusk ? mix(C(0xd88a52), C(0x3a2f52), day) : C(0xbfe4ef);
  const fog = night ? C(0x101a33) : dusk ? mix(C(0xb4784f), C(0x8fa8b8), day) : C(0xc3e0e8);

  return {
    dir,
    color,
    intensity,
    skyTop,
    skyBottom,
    fog,
    fogNear: night ? 22 : 36,
    fogFar: night ? 92 : 132,
    ambient: night ? 0.5 : dusk ? 0.75 : 0.95,
    night,
    dusk,
  };
}

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly sun: DirectionalLight;
  private hemi: HemisphereLight;
  private ambient: AmbientLight;
  private sky: Mesh;
  private skyMat: ShaderMaterial;
  private w = 1;
  private h = 1;
  private dpr = 1;
  /** How much to cap the pixel ratio; phones get a cheaper buffer. */
  maxDpr = 1.75;
  /** The direction the light travels, remembered so shadows can follow. */
  private sunDir = new Vector3(0, -1, 0);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new Scene();
    this.scene.fog = new Fog(0xc3e0e8, 36, 132);

    // The far plane sits just past the fog, so chunks the fog has already
    // swallowed are culled instead of drawn and thrown away.
    this.camera = new PerspectiveCamera(58, 1, 0.1, 175);
    this.camera.position.set(0, 6, 10);

    // The sky is a gradient dome rather than a flat clear colour, so the world
    // sits under something.
    this.skyMat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new Color(0x2f7fb8) },
        bottom: { value: new Color(0xbfe4ef) },
      },
      vertexShader: `
        varying float vH;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vH = normalize(position).y * 0.5 + 0.5;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 bottom;
        varying float vH;
        void main() {
          float t = clamp(pow(vH, 0.85), 0.0, 1.0);
          vec3 c = mix(bottom, top, t);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.sky = new Mesh(new SphereGeometry(150, 20, 14), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    this.sun = new DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    // A tight shadow volume around the player keeps the texels dense.
    const cam = this.sun.shadow.camera;
    cam.near = 1;
    cam.far = 130;
    cam.left = -26;
    cam.right = 26;
    cam.top = 26;
    cam.bottom = -26;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new HemisphereLight(0xbfe4ef, 0x3a4a34, 1.1);
    this.ambient = new AmbientLight(0xffffff, 0.35);
    this.scene.add(this.hemi, this.ambient);

    this.resize();
  }

  /** Apply a light state to the scene, sky and fog. */
  applyLight(sun: SunState): void {
    this.sun.color.copy(sun.color);
    this.sun.intensity = sun.intensity;
    this.hemi.intensity = sun.ambient;
    this.hemi.color.copy(sun.skyTop).lerp(new Color(0xffffff), 0.35);
    this.ambient.intensity = sun.night ? 0.22 : 0.3;
    this.skyMat.uniforms.top.value.copy(sun.skyTop);
    this.skyMat.uniforms.bottom.value.copy(sun.skyBottom);
    // Never show raw clear color at the frame edges, even if the sky misses.
    this.renderer.setClearColor(sun.skyBottom, 1);
    const fog = this.scene.fog as Fog;
    fog.color.copy(sun.fog);
    fog.near = sun.fogNear;
    fog.far = sun.fogFar;
    this.renderer.toneMappingExposure = sun.night ? 1.25 : 1.05;
    this.sunDir.copy(sun.dir);
  }

  /** Keep the shadow volume centred on the player. */
  followShadow(x: number, z: number): void {
    // The light sits on a long arm opposite its direction, aiming at the player.
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x - this.sunDir.x * 70, -this.sunDir.y * 70, z - this.sunDir.z * 70);
    this.sun.target.updateMatrixWorld();
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  get width(): number {
    return this.w;
  }

  /** The scene fog, for weather to retune. */
  get fog(): Fog {
    return this.scene.fog as Fog;
  }

  get height(): number {
    return this.h;
  }

  render(): void {
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.skyMat.dispose();
    this.sky.geometry.dispose();
    this.renderer.dispose();
  }
}