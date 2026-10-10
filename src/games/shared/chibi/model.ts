// A character instance: the shared skeleton driven by the clip library, the
// voxel body baked into one skinned mesh, and a pixel-art face (a decal on
// the head bone) that swaps for expressions and blinks.

import { Bone, Group, Mesh, MeshStandardMaterial, type BufferGeometry, type Object3D, type SkinnedMesh } from 'three';
import { Animator, bakeSkin, restOffsets, skinMeshes, type Rot, type SkinPart } from './anim';
import type { Expression } from './face';
import { BONES, chibiClips, PARENT, REST, type BoneName, type ClipName } from './rig';
import type { ChibiSpec } from './spec';
import { buildBody, facePixels } from './vbody';
import { decalGeometry, meshGrid } from './voxel';

const OFFSETS = restOffsets(REST as Record<string, Rot>, PARENT as Record<string, string | null>);

/** One material for every voxel figure: colour lives in the vertices. */
export const voxelMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
const faceMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

/** Every part of a spec as skinnable voxel meshes (geometry is cached per spec). */
const partCache = new Map<string, SkinPart[]>();
export function voxelParts(spec: ChibiSpec): SkinPart[] {
  const key = JSON.stringify(spec);
  let parts = partCache.get(key);
  if (!parts) {
    const { parts: grids } = buildBody(spec);
    parts = [];
    for (const [bone, g] of Object.entries(grids)) {
      if (!g || !g.size) continue;
      parts.push({ bone, geo: meshGrid(g).main, mat: voxelMaterial });
    }
    if (partCache.size > 400) partCache.clear();
    partCache.set(key, parts);
  }
  return parts.map((p) => ({ ...p, geo: p.geo.clone() }));
}

const faceCache = new Map<string, BufferGeometry>();
function faceGeometry(spec: ChibiSpec, e: Expression): BufferGeometry {
  const key = `${JSON.stringify(spec.face)}|${spec.hair.beard ?? ''}|${e}`;
  let g = faceCache.get(key);
  if (!g) {
    g = decalGeometry(facePixels(spec, e));
    faceCache.set(key, g);
  }
  return g;
}

export class ChibiModel {
  readonly root = new Group();
  readonly bones: Record<BoneName, Bone>;
  readonly animator: Animator;
  readonly spec: ChibiSpec;
  readonly meshes: SkinnedMesh[];
  /** Settles once the figure is ready to show (it is built synchronously). */
  readonly ready: Promise<void> = Promise.resolve();
  private face: Mesh;
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
    const batches = bakeSkin(voxelParts(spec).map((p) => ({ ...p, cast: opts.shadows !== false })), BONES as unknown as string[], OFFSETS);
    this.meshes = skinMeshes(this.root, BONES.map((n) => bones[n]), OFFSETS, batches);
    for (const m of this.meshes) {
      m.receiveShadow = true;
      m.frustumCulled = false;
    }
    this.face = new Mesh(faceGeometry(spec, this.mood), faceMaterial);
    bones.head.add(this.face);
    this.root.scale.setScalar(spec.body?.scale ?? 1);
    this.animator = new Animator(this.root, chibiClips());
    this.animator.play(opts.clip ?? 'idle', 0);
  }

  /** Render layer for the body (1 = shadow pass only, for first person). */
  setLayer(layer: number): void {
    this.layer = layer;
    for (const m of this.meshes) m.layers.set(layer);
    this.face.layers.set(layer === 0 ? 0 : 2);
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
    this.face.geometry = faceGeometry(this.spec, e);
  }

  /** Jump the animation to time `t` (for posed stills). */
  pose(clip: ClipName, t: number): void {
    this.animator.play(clip, 0);
    this.animator.mixer.setTime(t);
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
    this.root.removeFromParent();
  }
}
