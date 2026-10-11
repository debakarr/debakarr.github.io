// A smooth, painterly character instance (LumiQuest): a bone hierarchy
// driven by the clip library, the costume baked into one skinned mesh per
// surface type, and a painted face whose texture swaps for expressions and
// blinks. Year Zero draws the same specs in voxels (shared/chibi).

import { Bone, Group, MeshStandardMaterial, type Material, type Object3D, type SkinnedMesh } from 'three';
import { Animator, bakeSkin, restOffsets, skinMeshes, type Rot, type SkinPart } from '../chibi/anim';
import { faceTexture, type Expression } from './face';
import { buildHair } from './hair';
import { surface } from './mats';
import { buildParts, headGeometry } from './parts';
import { BONES, chibiClips, PARENT, REST, type BoneName, type ClipName } from './rig';
import type { ChibiSpec } from './spec';

const OFFSETS = restOffsets(REST as Record<string, Rot>, PARENT as Record<string, string | null>);

/**
 * Skirt vertices (hips space) blend toward the thigh on their side: more so
 * toward the hem and the front, so a seated or striding figure's skirt
 * follows the legs instead of cutting through them.
 */
function drapeWeights(x: number, y: number, z: number): [string, number, string, number] {
  const t = Math.min(1, Math.max(0, (0.03 - y) / 0.3));
  const front = Math.min(1, Math.max(0, z / 0.16 + 0.35));
  const side = Math.min(1, Math.abs(x) / 0.06);
  const w = t * front * 0.85;
  const near = x >= 0 ? 'thighL' : 'thighR';
  const far = x >= 0 ? 'thighR' : 'thighL';
  const share = 0.5 + 0.5 * side;
  return [near, w * share, far, w * (1 - share)];
}

/** All the meshes for a spec, ready to skin. */
export function toonParts(spec: ChibiSpec, faceMat: Material): SkinPart[] {
  const hidden = spec.outfit.some((p) => p.k === 'helmet') ? 'helmet' : spec.outfit.some((p) => p.k === 'hat' && p.style !== 'cap') ? 'hat' : spec.outfit.some((p) => p.k === 'hat') ? 'cap' : undefined;
  const parts: SkinPart[] = buildParts(spec).map((p) => ({ bone: p.bone, geo: p.geo, mat: p.mat, weights: p.drape ? drapeWeights : undefined }));
  for (const h of buildHair(spec.hair, { hidden })) parts.push({ bone: h.bone, geo: h.geo, mat: surface('hair') });
  parts.push({ bone: 'head', geo: headGeometry(), mat: faceMat });
  return parts;
}

export class ToonModel {
  readonly root = new Group();
  readonly bones: Record<BoneName, Bone>;
  readonly animator: Animator;
  readonly spec: ChibiSpec;
  readonly meshes: SkinnedMesh[];
  private faceMat: MeshStandardMaterial;
  private mood: Expression;
  private blink = 2 + Math.random() * 3;
  private blinking = false;
  private layer = 0;

  constructor(spec: ChibiSpec, opts: { shadows?: boolean; clip?: ClipName } = {}) {
    this.spec = spec;
    this.mood = spec.mood ?? 'neutral';
    const bones = {} as Record<BoneName, Bone>;
    for (const name of BONES) {
      const b = new Bone();
      b.name = name;
      b.position.set(...REST[name]);
      bones[name] = b;
    }
    for (const name of BONES) {
      const parent = PARENT[name];
      if (parent) bones[parent].add(bones[name]);
      else this.root.add(bones[name]);
    }
    this.bones = bones;
    // skin: soft, a little warm light scattered back out
    this.faceMat = new MeshStandardMaterial({ map: faceTexture(spec.face, this.mood), roughness: 0.62, emissive: 0x3a1a10, emissiveIntensity: 0.18 });
    const batches = bakeSkin(toonParts(spec, this.faceMat).map((p) => ({ ...p, cast: opts.shadows !== false })), BONES as unknown as string[], OFFSETS);
    this.meshes = skinMeshes(this.root, BONES.map((n) => bones[n]), OFFSETS, batches);
    for (const m of this.meshes) m.receiveShadow = true;
    this.root.scale.setScalar(spec.body?.scale ?? 1);
    this.animator = new Animator(this.root, chibiClips());
    this.animator.play(opts.clip ?? 'idle', 0);
  }

  /** Render layer for the body (1 = shadow pass only, for first person). */
  setLayer(layer: number): void {
    this.layer = layer;
    for (const m of this.meshes) m.layers.set(layer);
  }

  get currentLayer(): number {
    return this.layer;
  }

  play(clip: ClipName, fade = 0.22, speed = 1): void {
    this.animator.play(clip, fade, speed);
  }

  once(clip: ClipName, fade = 0.12): number {
    return this.animator.once(clip, fade);
  }

  setExpression(e: Expression): void {
    this.mood = e;
    if (!this.blinking) this.applyFace(e);
  }

  get expression(): Expression {
    return this.mood;
  }

  private applyFace(e: Expression): void {
    this.faceMat.map = faceTexture(this.spec.face, e);
    this.faceMat.needsUpdate = true;
  }

  update(dt: number): void {
    this.animator.update(dt);
    this.blink -= dt;
    if (this.blink <= 0) {
      if (!this.blinking && this.mood !== 'laugh' && this.mood !== 'blink') {
        this.blinking = true;
        this.applyFace('blink');
        this.blink = 0.12;
      } else {
        this.blinking = false;
        this.applyFace(this.mood);
        this.blink = 2.2 + Math.random() * 3.5;
      }
    }
  }

  bone(name: BoneName): Object3D {
    return this.bones[name];
  }

  dispose(): void {
    this.animator.dispose();
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.skeleton.dispose();
    }
    this.faceMat.dispose();
    this.root.removeFromParent();
  }
}
