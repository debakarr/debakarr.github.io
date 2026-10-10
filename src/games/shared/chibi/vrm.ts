// VRM characters (e.g. made in VRoid Studio) as drop-in replacements for
// code-built chibis. A ChibiModel keeps animating its own skeleton with the
// shared clips; when a VRM is attached it hides its meshes and copies the
// skeleton's pose onto the VRM's humanoid bones every frame, and mirrors its
// expressions onto the VRM's expression presets. Games need no changes.
//
// Which characters use a VRM: public/models/chibi/manifest.json maps a
// character key (spec.vrmKey, e.g. "sunland-queen", "scout", "lq-aero") to a
// .vrm URL. A spec may also carry its own `vrm` URL. This module (and
// three-vrm) is loaded only when a character actually has a VRM.

import { Box3, Group, Quaternion, Vector3, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import type { Expression } from './face';
import { REST, type BoneName } from './rig';

const MAP: Partial<Record<BoneName, VRMHumanBoneName>> = {
  hips: 'hips',
  spine: 'spine',
  chest: 'chest',
  neck: 'neck',
  head: 'head',
  armL: 'leftUpperArm',
  foreL: 'leftLowerArm',
  handL: 'leftHand',
  armR: 'rightUpperArm',
  foreR: 'rightLowerArm',
  handR: 'rightHand',
  thighL: 'leftUpperLeg',
  shinL: 'leftLowerLeg',
  footL: 'leftFoot',
  thighR: 'rightUpperLeg',
  shinR: 'rightLowerLeg',
  footR: 'rightFoot',
};

/**
 * Chibi arms hang down at rest; VRM arms rest in a T-pose. B turns a VRM arm
 * down, so a chibi rotation R becomes R·B on the upper arm and B⁻¹·R·B below it.
 */
const Z = new Vector3(0, 0, 1);
const B_L = new Quaternion().setFromAxisAngle(Z, -Math.PI / 2);
const B_R = new Quaternion().setFromAxisAngle(Z, Math.PI / 2);
const B_L_INV = B_L.clone().invert();
const B_R_INV = B_R.clone().invert();

const FACE: Record<Expression, [string, number][]> = {
  neutral: [],
  happy: [['happy', 0.8]],
  laugh: [['happy', 1]],
  focused: [['relaxed', 0.3], ['angry', 0.25]],
  surprised: [['surprised', 1]],
  concerned: [['sad', 0.7]],
  determined: [['angry', 0.55]],
  blink: [['blink', 1]],
  wink: [['happy', 0.6], ['blinkRight', 1]],
};
const ALL_PRESETS = ['happy', 'relaxed', 'angry', 'surprised', 'sad', 'blink', 'blinkRight', 'blinkLeft'];

const cache = new Map<string, Promise<ArrayBuffer>>();
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

/** Loads a VRM (files are fetched once; every character gets its own instance). */
export async function loadVrm(url: string): Promise<VRM> {
  let buf = cache.get(url);
  if (!buf) {
    buf = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`VRM ${url}: ${r.status}`);
      return r.arrayBuffer();
    });
    cache.set(url, buf);
  }
  const gltf = await loader.parseAsync((await buf).slice(0), '');
  const vrm = gltf.userData.vrm as VRM;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((o) => {
    o.frustumCulled = false;
    (o as { castShadow?: boolean }).castShadow = true;
  });
  return vrm;
}

/** A VRM wearing a chibi's pose: build with a loaded VRM and the chibi's bones. */
export class VrmRig {
  readonly holder = new Group();
  private hipsRest = new Vector3();
  private hipsScale = 1;
  private q = new Quaternion();

  constructor(readonly vrm: VRM, private bones: Record<BoneName, Object3D>, height: number) {
    this.holder.add(vrm.scene);
    // fit the VRM to the chibi's height, feet on the ground
    vrm.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(vrm.scene);
    const h = Math.max(0.01, box.max.y - box.min.y);
    const s = height / h;
    this.holder.scale.setScalar(s);
    this.holder.position.y = -box.min.y * s;
    const hips = vrm.humanoid.getNormalizedBoneNode('hips');
    if (hips) {
      this.hipsRest.copy(hips.position);
      // the VRM's hip height in its own units against the chibi's
      if (hips.position.y > 0) this.hipsScale = hips.position.y / REST.hips[1];
    }
  }

  /** Copies the chibi skeleton's pose onto the VRM, then updates it (spring bones, expressions). */
  update(dt: number): void {
    const h = this.vrm.humanoid;
    for (const [ours, theirs] of Object.entries(MAP) as [BoneName, VRMHumanBoneName][]) {
      const n = h.getNormalizedBoneNode(theirs);
      if (!n) continue;
      const R = this.bones[ours].quaternion;
      const left = ours.endsWith('L') && /arm|fore|hand/.test(ours);
      const right = ours.endsWith('R') && /arm|fore|hand/.test(ours);
      if (ours === 'armL') this.q.copy(R).multiply(B_L);
      else if (ours === 'armR') this.q.copy(R).multiply(B_R);
      else if (left) this.q.copy(B_L_INV).multiply(R).multiply(B_L);
      else if (right) this.q.copy(B_R_INV).multiply(R).multiply(B_R);
      else this.q.copy(R);
      n.quaternion.copy(this.q);
    }
    const hips = h.getNormalizedBoneNode('hips');
    if (hips) {
      const p = this.bones.hips.position;
      hips.position.set(
        this.hipsRest.x + p.x * this.hipsScale,
        this.hipsRest.y + (p.y - REST.hips[1]) * this.hipsScale,
        this.hipsRest.z + p.z * this.hipsScale,
      );
    }
    this.vrm.update(dt);
  }

  setExpression(e: Expression): void {
    const em = this.vrm.expressionManager;
    if (!em) return;
    for (const p of ALL_PRESETS) if (em.getExpression(p)) em.setValue(p, 0);
    for (const [p, v] of FACE[e]) if (em.getExpression(p)) em.setValue(p, v);
  }

  dispose(): void {
    VRMUtils.deepDispose(this.vrm.scene);
    this.holder.removeFromParent();
  }
}
