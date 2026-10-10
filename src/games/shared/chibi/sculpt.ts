// Sculpted characters: GLB models made in Blender from concept art (see
// tools/chibi-sculpt/), rigged with the chibi bone names. Like a VRM, a sculpt
// wears the pose of a ChibiModel's skeleton: every frame each bone takes the
// chibi bone's rotation, re-expressed in the sculpt bone's own rest frame.
// The sculpted pose counts as the idle pose (arms holding a sword and shield
// stay where they were sculpted); clips move the body relative to it.

import { Box3, Color, Euler, Group, Quaternion, Vector3, type Bone, type Material, type MeshStandardMaterial, type Object3D, type SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ARMS_REST, BONES, REST, type BoneName } from './rig';

export interface SculptEntry {
  url: string;
  /** Height in chibi units (the code-built chibis are 1.26 tall). */
  height?: number;
  /** Recolour the blue faction cloth to another hue (e.g. "#c8322a" for the rivals). */
  tint?: string;
}

const loader = new GLTFLoader();
const files = new Map<string, Promise<Object3D>>();

/** Loads a sculpt once; every character gets its own skinned clone. */
export async function loadSculpt(url: string): Promise<Object3D> {
  let p = files.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((g) => g.scene);
    files.set(url, p);
  }
  return cloneSkinned(await p);
}

const tinted = new Map<string, Material>();

/**
 * The faction colour lives in the texture as saturated blue; a tinted copy of
 * the material rotates that hue (and only that hue) to the side's colour.
 */
function tintMaterial(m: MeshStandardMaterial, tint: string): Material {
  const key = `${m.uuid}|${tint}`;
  let t = tinted.get(key);
  if (t) return t;
  const c = m.clone();
  const target = new Color(tint);
  const hsl = { h: 0, s: 0, l: 0 };
  target.getHSL(hsl);
  c.onBeforeCompile = (shader) => {
    shader.uniforms.tintHue = { value: hsl.h };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `uniform float tintHue;
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * clamp(p - 1.0, 0.0, 1.0);
}
void main() {`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec3 hsv = rgb2hsv(diffuseColor.rgb);
    float blue = smoothstep(0.04, 0.0, abs(hsv.x - 0.62) - 0.06) * smoothstep(0.38, 0.52, hsv.y);
    vec3 swapped = hsv2rgb(vec3(tintHue, hsv.y, hsv.z * 0.92));
    diffuseColor.rgb = mix(diffuseColor.rgb, swapped, blue);
  }`);
  };
  c.customProgramCacheKey = () => `sculpt-tint-${tint}`;
  tinted.set(key, c);
  return c;
}

/** Chibi rotation that counts as "rest" for each bone (the idle arms). */
const REF = new Map<BoneName, Quaternion>();
for (const [name, r] of Object.entries(ARMS_REST) as [BoneName, [number, number, number]][]) {
  REF.set(name, new Quaternion().setFromEuler(new Euler(r[0], r[1], r[2], 'YXZ')).invert());
}

interface Link {
  ours: BoneName;
  bone: Bone;
  /** Parent's rest world rotation, inverted. */
  parentInv: Quaternion;
  /** The bone's own rest world rotation. */
  rest: Quaternion;
}

export class SculptRig {
  readonly holder = new Group();
  private links: Link[] = [];
  private hips: { bone: Bone; rest: Vector3; parentInv: Quaternion; scale: number } | null = null;
  private q = new Quaternion();
  private v = new Vector3();

  constructor(readonly scene: Object3D, private bones: Record<BoneName, Object3D>, entry: SculptEntry) {
    scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(scene);
    const h = Math.max(0.01, box.max.y - box.min.y);
    const s = (entry.height ?? 1.26) / h;
    this.holder.add(scene);
    this.holder.scale.setScalar(s);
    this.holder.position.y = -box.min.y * s;
    const byName = new Map<string, Bone>();
    scene.traverse((o) => {
      if ((o as Bone).isBone) byName.set(o.name, o as Bone);
      const m = o as SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        if (entry.tint) m.material = tintMaterial(m.material as MeshStandardMaterial, entry.tint);
      }
    });
    const rootInv = scene.getWorldQuaternion(new Quaternion()).invert();
    for (const ours of BONES) {
      const bone = byName.get(ours);
      if (!bone) continue;
      const rest = rootInv.clone().multiply(bone.getWorldQuaternion(new Quaternion()));
      const parentInv = rootInv.clone().multiply(bone.parent!.getWorldQuaternion(new Quaternion())).invert();
      this.links.push({ ours, bone, parentInv, rest });
      if (ours === 'hips') {
        const hipY = bone.getWorldPosition(new Vector3()).y - box.min.y;
        this.hips = { bone, rest: bone.position.clone(), parentInv: parentInv.clone(), scale: hipY / REST.hips[1] };
      }
    }
  }

  /** Copies the chibi skeleton's pose onto the sculpt. */
  update(): void {
    for (const l of this.links) {
      const R = this.bones[l.ours].quaternion;
      this.q.copy(R);
      const ref = REF.get(l.ours);
      if (ref) this.q.multiply(ref);
      // local = parentRest⁻¹ · delta · rest  (delta in the chibi's world-aligned frame)
      l.bone.quaternion.copy(l.parentInv).multiply(this.q).multiply(l.rest);
    }
    if (this.hips) {
      const p = this.bones.hips.position;
      this.v.set(p.x - REST.hips[0], p.y - REST.hips[1], p.z - REST.hips[2]).multiplyScalar(this.hips.scale);
      this.v.applyQuaternion(this.hips.parentInv);
      this.hips.bone.position.copy(this.hips.rest).add(this.v);
    }
  }

  dispose(): void {
    this.holder.removeFromParent();
  }
}
