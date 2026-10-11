// An anime character: a VRM model (MToon toon shading, outlines, spring-bone
// hair and cloth, facial expressions) driven by motion-captured clips baked
// onto the VRM humanoid skeleton (assets/anim/moves.json, from Quaternius'
// CC0 Universal Animation Library; see tools in the README).
//
// The model faces +Z inside `root`; the game turns `root`.

import { AnimationClip, Group, Mesh, Object3D, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { Animator, type ClipSpec } from '../../shared/chibi/anim';
import movesUrl from '../assets/anim/moves.json?url';

interface ClipData {
  duration: number;
  loop: boolean;
  frames: number;
  /** Per bone: one quaternion (still) or one per frame. */
  q: Record<string, number[]>;
  /** One quaternion per finger bone. */
  fingers: Record<string, number[]>;
  /** Hips offset from the T-pose, per frame (metres of the source rig). */
  hips: number[];
}

interface MoveData {
  fps: number;
  hipsHeight: number;
  clips: Record<string, ClipData>;
}

let moves: Promise<MoveData> | null = null;
function loadMoves(): Promise<MoveData> {
  moves ??= fetch(movesUrl).then((r) => {
    if (!r.ok) throw new Error(`moves.json: ${r.status}`);
    return r.json() as Promise<MoveData>;
  });
  return moves;
}

/** Turns baked humanoid data into clips for one VRM's normalized bones. */
function buildClips(vrm: VRM, data: MoveData): Record<string, AnimationClip> {
  const v0 = vrm.meta.metaVersion === '0';
  const hum = vrm.humanoid;
  const hipsNode = hum.getNormalizedBoneNode('hips');
  if (!hipsNode) throw new Error('VRM without hips');
  const rest = hipsNode.position.clone();
  const scale = rest.y / data.hipsHeight;
  // the motion faces +Z; VRM 0.x normalized bones face -Z
  const flipQ = (a: number[]): number[] => (v0 ? a.map((x, i) => (i % 4 === 0 || i % 4 === 2 ? -x : x)) : a);
  const out: Record<string, AnimationClip> = {};
  for (const [name, c] of Object.entries(data.clips)) {
    const times = new Float32Array(c.frames);
    for (let i = 0; i < c.frames; i++) times[i] = Math.min(c.duration, i / data.fps);
    const ends = new Float32Array([0, c.duration]);
    const tracks = [];
    for (const [bone, q] of Object.entries(c.q)) {
      const node = hum.getNormalizedBoneNode(bone as VRMHumanBoneName);
      if (!node) continue;
      const still = q.length === 4;
      tracks.push(new QuaternionKeyframeTrack(`${node.name}.quaternion`, still ? ends : times, flipQ(still ? [...q, ...q] : q)));
    }
    for (const [bone, q] of Object.entries(c.fingers)) {
      const node = hum.getNormalizedBoneNode(bone as VRMHumanBoneName);
      if (node) tracks.push(new QuaternionKeyframeTrack(`${node.name}.quaternion`, ends, flipQ([...q, ...q])));
    }
    const hp = new Float32Array(c.frames * 3);
    for (let i = 0; i < c.frames; i++) {
      const dx = c.hips[i * 3] * scale;
      const dy = c.hips[i * 3 + 1] * scale;
      const dz = c.hips[i * 3 + 2] * scale;
      hp[i * 3] = rest.x + (v0 ? -dx : dx);
      hp[i * 3 + 1] = rest.y + dy;
      hp[i * 3 + 2] = rest.z + (v0 ? -dz : dz);
    }
    tracks.push(new VectorKeyframeTrack(`${hipsNode.name}.position`, times, hp));
    out[name] = new AnimationClip(name, c.duration, tracks);
  }
  return out;
}

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

export type Mood = 'neutral' | 'happy' | 'surprised' | 'sad' | 'angry' | 'relaxed';

/** Game clip names -> baked clips. Several game states share a motion. */
const GAME_CLIPS: Record<string, string> = {
  idle: 'idle',
  walk: 'walk',
  run: 'jog',
  sprint: 'sprint',
  sneak: 'crouchWalk',
  crouch: 'crouchIdle',
  jump: 'jumpStart',
  fall: 'jumpLoop',
  glide: 'jumpLoop',
  land: 'jumpLand',
  swim: 'swim',
  tread: 'swimIdle',
  interact: 'interact',
  observe: 'yes',
  wave: 'yes',
  resonate: 'cast',
  talk: 'talk',
  happy: 'dance',
  dance: 'dance',
  throw: 'throw',
  pickup: 'pickUp',
  roll: 'roll',
  hit: 'hit',
  sit: 'sit',
  harvest: 'harvest',
  foldArms: 'foldArms',
  lantern: 'lantern',
};

export class Avatar {
  readonly root = new Group();
  readonly animator: Animator;
  /** Height of the model's head top above its feet, in metres. */
  readonly height: number;
  private blinkT = 2;
  private blinkK = 0;
  private mood: Mood = 'neutral';
  private moodW = 0;

  private constructor(readonly vrm: VRM, data: MoveData) {
    VRMUtils.rotateVRM0(vrm);
    this.root.add(vrm.scene);
    vrm.scene.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    const baked = buildClips(vrm, data);
    const specs: Record<string, ClipSpec> = {};
    for (const [game, name] of Object.entries(GAME_CLIPS)) {
      const clip = baked[name];
      if (clip) specs[game] = { clip, loop: data.clips[name].loop };
    }
    this.animator = new Animator(vrm.scene, specs);
    const head = vrm.humanoid.getNormalizedBoneNode('head');
    vrm.scene.updateMatrixWorld(true);
    this.height = head ? head.getWorldPosition(new Vector3()).y + 0.16 : 1.5;
    this.animator.play('idle', 0);
  }

  static async load(url: string): Promise<Avatar> {
    const [gltf, data] = await Promise.all([loader.loadAsync(url), loadMoves()]);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error(`not a VRM: ${url}`);
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    return new Avatar(vrm, data);
  }

  setMood(m: Mood, w = 1): void {
    this.mood = m;
    this.moodW = w;
  }

  lookAt(target: Object3D | null): void {
    if (this.vrm.lookAt) this.vrm.lookAt.target = target ?? undefined;
  }

  /** After a teleport: let hair and cloth start from rest instead of whipping. */
  resetPhysics(): void {
    this.vrm.springBoneManager?.reset();
  }

  update(dt: number): void {
    this.animator.update(dt);
    // blinking, and a face that eases into the current mood
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkK = 1;
      this.blinkT = 1.8 + Math.random() * 3.5;
    }
    this.blinkK = Math.max(0, this.blinkK - dt * 7);
    const em = this.vrm.expressionManager;
    if (em) {
      const b = Math.sin(Math.min(1, this.blinkK) * Math.PI);
      for (const m of ['happy', 'surprised', 'sad', 'angry', 'relaxed'] as const) {
        const target = this.mood === m ? this.moodW : 0;
        const cur = em.getValue(m) ?? 0;
        em.setValue(m, cur + (target - cur) * Math.min(1, dt * 8));
      }
      // a happy face closes the eyes already; don't double-blink it
      em.setValue('blink', this.mood === 'happy' ? 0 : b);
    }
    this.vrm.update(dt);
  }

  /** Hides the model from the camera but keeps its shadow (layer 1 renders only in the shadow pass). */
  setLayer(layer: number): void {
    this.vrm.scene.traverse((o) => o.layers.set(layer));
  }

  dispose(): void {
    this.animator.dispose();
    this.root.removeFromParent();
    VRMUtils.deepDispose(this.vrm.scene);
  }
}
