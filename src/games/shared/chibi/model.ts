// A chibi character instance: a bone hierarchy driven by the shared clip
// library, the costume baked into one skinned mesh per surface type, and a
// painted face whose texture swaps for expressions and blinks.

import { Bone, Group, MeshToonMaterial, SkinnedMesh, type Material, type Object3D } from 'three';
import { Animator, bakeSkin, restOffsets, skinMeshes, type SkinPart } from './anim';
import { faceTexture, type Expression } from './face';
import { buildHair } from './hair';
import { NO_INK, outlineMaterial, surface, toonRamp, type Surface } from './mats';
import { buildParts, headGeometry } from './parts';
import { BONES, chibiClips, PARENT, REST, type BoneName, type ClipName } from './rig';
import type { ChibiSpec } from './spec';
import type { VrmRig } from './vrm';
import type { Rot } from './anim';

let manifest: Promise<Record<string, string>> | null = null;

/** public/models/chibi/manifest.json: character key → .vrm URL (empty unless VRMs are shipped). */
export function vrmManifest(): Promise<Record<string, string>> {
  return (manifest ??= fetch('/models/chibi/manifest.json')
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : {}))
    .catch(() => ({})));
}

/** The VRM a character should wear, if any. */
export async function vrmFor(spec: ChibiSpec): Promise<string | null> {
  if (spec.vrm) return spec.vrm;
  const m = await vrmManifest();
  return m[spec.vrmKey ?? spec.id] ?? null;
}

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

/** All the meshes for a spec, ready to skin (cache per spec when spawning crowds). */
export function chibiParts(spec: ChibiSpec, faceMat: Material): SkinPart[] {
  const hidden = spec.outfit.some((p) => p.k === 'helmet') ? 'helmet' : spec.outfit.some((p) => p.k === 'hat' && p.style !== 'cap') ? 'hat' : spec.outfit.some((p) => p.k === 'hat') ? 'cap' : undefined;
  const parts: SkinPart[] = buildParts(spec).map((p) => ({ bone: p.bone, geo: p.geo, mat: p.mat, weights: p.drape ? drapeWeights : undefined }));
  for (const h of buildHair(spec.hair, { hidden })) parts.push({ bone: h.bone, geo: h.geo, mat: surface('hair') });
  parts.push({ bone: 'head', geo: headGeometry(), mat: faceMat });
  return parts;
}

export class ChibiModel {
  readonly root = new Group();
  readonly bones: Record<BoneName, Bone>;
  readonly animator: Animator;
  readonly spec: ChibiSpec;
  readonly meshes: SkinnedMesh[];
  /** Outline hulls (share the meshes' geometry; hide them with the body). */
  get inkMeshes(): SkinnedMesh[] {
    return this.outlines;
  }
  private faceMat: MeshToonMaterial;
  private outlines: SkinnedMesh[] = [];
  /** A VRM wearing this character's pose, once loaded. */
  vrm: VrmRig | null = null;
  /** Settles once any VRM has been swapped in (or found missing). */
  readonly ready: Promise<void>;
  private disposed = false;
  private mood: Expression;
  private blink = 2 + Math.random() * 3;
  private blinking = false;

  constructor(spec: ChibiSpec, opts: { shadows?: boolean; clip?: ClipName; outline?: boolean; vrm?: boolean } = {}) {
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
    this.faceMat = new MeshToonMaterial({ map: faceTexture(spec.face, this.mood), gradientMap: toonRamp(), emissive: 0x2a1008, emissiveIntensity: 0.35 });
    const batches = bakeSkin(chibiParts(spec, this.faceMat).map((p) => ({ ...p, cast: opts.shadows !== false })), BONES as unknown as string[], OFFSETS);
    this.meshes = skinMeshes(this.root, BONES.map((n) => bones[n]), OFFSETS, batches);
    for (const m of this.meshes) m.receiveShadow = true;
    // ink outlines: back-face hulls sharing each mesh's geometry and skeleton
    if (opts.outline !== false) {
      const ink = outlineMaterial(0.0048);
      for (const m of this.meshes) {
        const mat = m.material as MeshToonMaterial;
        if (!mat.isMeshToonMaterial || NO_INK.includes(mat.userData.surface as Surface)) continue;
        const o = new SkinnedMesh(m.geometry, ink);
        o.castShadow = false;
        o.bind(m.skeleton, m.bindMatrix);
        o.frustumCulled = false;
        this.root.add(o);
        this.outlines.push(o);
      }
    }
    const s = spec.body?.scale ?? 1;
    this.root.scale.setScalar(s);
    this.animator = new Animator(this.root, chibiClips());
    this.animator.play(opts.clip ?? 'idle', 0);
    this.ready = opts.vrm !== false ? this.attachVrm() : Promise.resolve();
  }

  /** Swaps in a VRM when the manifest (or the spec) names one; the chibi shows until then. */
  private async attachVrm(): Promise<void> {
    try {
      const url = await vrmFor(this.spec);
      if (!url || this.disposed) return;
      const { loadVrm, VrmRig } = await import('./vrm');
      const vrm = await loadVrm(url);
      if (this.disposed) return;
      this.vrm = new VrmRig(vrm, this.bones, 1.26);
      this.root.add(this.vrm.holder);
      for (const m of [...this.meshes, ...this.outlines]) m.visible = false;
      this.setLayer(this.layer);
      this.vrm.setExpression(this.mood);
      this.vrm.update(0);
    } catch (err) {
      console.warn('VRM not loaded; keeping the chibi', err);
    }
  }

  private layer = 0;

  /** Render layer for the body (1 = shadow pass only, for first person); outlines show only on layer 0. */
  setLayer(layer: number): void {
    this.layer = layer;
    for (const m of this.meshes) m.layers.set(layer);
    for (const m of this.outlines) m.layers.set(layer === 0 ? 0 : 2);
    this.vrm?.holder.traverse((o) => o.layers.set(layer));
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
    this.vrm?.setExpression(e);
  }

  /** Jump the animation to time `t` (for posed stills). */
  pose(clip: ClipName, t: number): void {
    this.animator.play(clip, 0);
    this.animator.mixer.setTime(t);
  }

  update(dt: number): void {
    this.animator.update(dt);
    this.vrm?.update(dt);
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
    this.disposed = true;
    this.vrm?.dispose();
    this.animator.dispose();
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.skeleton.dispose();
    }
    this.faceMat.dispose();
    this.root.removeFromParent();
  }
}
