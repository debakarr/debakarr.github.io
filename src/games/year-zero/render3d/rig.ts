// Baked animation for instanced crowds. A "look" (a squad of KayKit figures
// with their weapons, plus any rigid parts such as a horse or a cart) is
// flattened into one geometry whose vertices are bound to a handful of bone
// slots, and every animation state is sampled into a float texture of slot
// matrices (one row per frame). The map then draws every squad of a type in
// one instanced call and plays idle, walk, attack, hit and death clips in the
// vertex shader — real skeletal animation without a mixer per unit.

import {
  AnimationMixer,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  Euler,
  FloatType,
  LoopOnce,
  LoopRepeat,
  Matrix3,
  Matrix4,
  Mesh,
  NearestFilter,
  Object3D,
  Quaternion,
  RGBAFormat,
  SkinnedMesh,
  Vector3,
  type Bone,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { charInstance, clip, hasClip, type CharName } from './kit';

export type AnimState = 'idle' | 'walk' | 'attack' | 'hit' | 'death';
export const STATES: AnimState[] = ['idle', 'walk', 'attack', 'hit', 'death'];
export const FPS = 24;
const LOOPS: Record<AnimState, boolean> = { idle: true, walk: true, attack: false, hit: false, death: false };
const DEFAULT_CLIPS: Record<AnimState, string> = { idle: 'Idle', walk: 'Walking_A', attack: '1H_Melee_Attack_Chop', hit: 'Hit_A', death: 'Death_A' };

export interface Transform {
  p?: [number, number, number];
  r?: [number, number, number];
  s?: number;
}

/** A hand-made accessory (spear, bow, rifle…) carried on a bone. */
export interface Prop {
  geo: BufferGeometry;
  bone: string;
  t?: Transform;
}

export interface FigureSpec {
  char: CharName;
  /** Accessory meshes to keep (weapons, shields, hats, capes); the body is always shown. */
  show: string[];
  props?: Prop[];
  /** Clip per state; live scenes also read 'run', 'cheer' and 'aim'. */
  clips?: Partial<Record<AnimState | 'run' | 'cheer' | 'aim', string>>;
  /** Placement in the squad (look space, figure feet at y = 0). */
  t?: Transform;
  /** Seconds of offset so a squad does not breathe in lockstep. */
  phase?: number;
  /** Adjusts bones after the clip is applied (e.g. a rider's legs). */
  pose?: (bone: (name: string) => Bone | undefined, state: AnimState, t: number) => void;
  /** Rides on a rigid part: its motion carries the figure. */
  mount?: string;
}

export interface RigidSpec {
  name: string;
  /** Vertex-coloured geometry (with a `team` attribute) in look space. */
  geo: BufferGeometry;
  /** Animated transform of the part (look space); identity when absent. */
  motion?: (state: AnimState, t: number, out: Matrix4) => void;
}

export interface LookSpec {
  figures: FigureSpec[];
  rigid?: RigidSpec[];
  /** Seconds per state for rigid-only looks (no figures to take a clip length from). */
  durations?: Partial<Record<AnimState, number>>;
}

export interface ClipRange {
  row: number;
  frames: number;
  loop: boolean;
  /** Seconds. */
  duration: number;
}

export interface BakedLook {
  geometry: BufferGeometry;
  bones: DataTexture;
  slots: number;
  clips: Record<AnimState, ClipRange>;
}

interface Slot {
  /** Matrix (look space) of this slot at the current sample. */
  sample: () => Matrix4;
}

const tmpA = new Matrix4();
const tmpB = new Matrix4();
const tmpQ = new Quaternion();
const tmpV = new Vector3();
const tmpS = new Vector3();

/** GLTFLoader strips characters such as '.' from node names ('handslot.r' → 'handslotr'). */
export const boneName = (n: string): string => n.replace(/[[\]./:\s]/g, '');

export function compose(t: Transform | undefined, out = new Matrix4()): Matrix4 {
  const p = t?.p ?? [0, 0, 0];
  const r = t?.r ?? [0, 0, 0];
  tmpQ.setFromEuler(new Euler(r[0], r[1], r[2]));
  return out.compose(tmpV.set(p[0], p[1], p[2]), tmpQ, tmpS.setScalar(t?.s ?? 1));
}

/** Copies the attributes we keep from a source geometry, as floats. */
function grab(src: BufferGeometry, m: Matrix4): { pos: Float32Array; nor: Float32Array; col: Float32Array; team: Float32Array; n: number; index: ArrayLike<number> | null } {
  const n = src.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const team = new Float32Array(n);
  const nm = new Matrix3().getNormalMatrix(m);
  const v = new Vector3();
  const P = src.attributes.position;
  const N = src.attributes.normal;
  const C = src.attributes.color;
  const T = src.attributes._team ?? src.attributes.team;
  const scaleTeam = !!src.attributes._team;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(m);
    pos.set([v.x, v.y, v.z], i * 3);
    if (N) {
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor.set([v.x, v.y, v.z], i * 3);
    } else nor.set([0, 1, 0], i * 3);
    if (C) col.set([C.getX(i), C.getY(i), C.getZ(i)], i * 3);
    else col.set([1, 1, 1], i * 3);
    team[i] = T ? T.getX(i) / (scaleTeam ? 100 : 1) : 0;
  }
  return { pos, nor, col, team, n, index: src.index ? src.index.array : null };
}

/**
 * Builds the geometry and bone texture for a look. Costs a few milliseconds
 * per look (clips are sampled on the CPU once), so looks are baked lazily.
 */
export function bakeLook(spec: LookSpec): BakedLook {
  const slots: Slot[] = [];
  const pieces: BufferGeometry[] = [];
  const addPiece = (g: ReturnType<typeof grab>, slotOf: (i: number) => [number[], number[]]) => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new BufferAttribute(g.nor, 3));
    geo.setAttribute('color', new BufferAttribute(g.col, 3));
    geo.setAttribute('team', new BufferAttribute(g.team, 1));
    const si = new Float32Array(g.n * 4);
    const sw = new Float32Array(g.n * 4);
    for (let i = 0; i < g.n; i++) {
      const [idx, w] = slotOf(i);
      si.set(idx, i * 4);
      sw.set(w, i * 4);
    }
    geo.setAttribute('skinIndex', new BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new BufferAttribute(sw, 4));
    // keep everything indexed (skinned vertices are expensive: no duplicates)
    const idx = g.index ? Array.from(g.index) : Array.from({ length: g.n }, (_, i) => i);
    geo.setIndex(idx);
    pieces.push(geo);
  };

  // --- rigid parts ---
  const rigidSlot = new Map<string, number>();
  const rigidMats = new Map<string, Matrix4>();
  for (const r of spec.rigid ?? []) {
    const m = new Matrix4();
    rigidMats.set(r.name, m);
    const k = slots.length;
    rigidSlot.set(r.name, k);
    slots.push({ sample: () => m });
    const g = grab(r.geo, new Matrix4());
    addPiece(g, () => [[k, 0, 0, 0], [1, 0, 0, 0]]);
  }

  // --- figures ---
  interface Fig {
    spec: FigureSpec;
    root: Object3D;
    mixer: AnimationMixer;
    place: Matrix4;
    bones: Map<string, Bone>;
  }
  const figs: Fig[] = [];
  for (const f of spec.figures) {
    const root = charInstance(f.char);
    const bones = new Map<string, Bone>();
    root.traverse((o) => {
      if ((o as Bone).isBone) bones.set(o.name, o as Bone);
    });
    // accessories: keep the requested ones, attach props
    const meshes: Mesh[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    for (const m of meshes) if (!(m as SkinnedMesh).isSkinnedMesh) m.visible = f.show.includes(m.name);
    const propObjs: { obj: Object3D; geo: BufferGeometry }[] = [];
    for (const p of f.props ?? []) {
      const host = bones.get(boneName(p.bone));
      if (!host) throw new Error(`no bone ${p.bone}`);
      const o = new Object3D();
      compose(p.t, o.matrix);
      o.matrix.decompose(o.position, o.quaternion, o.scale);
      host.add(o);
      propObjs.push({ obj: o, geo: p.geo });
    }
    root.updateMatrixWorld(true);
    const place = compose(f.t);
    const fig: Fig = { spec: f, root, mixer: new AnimationMixer(root), place, bones };
    figs.push(fig);
    const mount = f.mount ? rigidMats.get(f.mount) : undefined;
    /** look-space matrix of a slot whose figure-space matrix is `m` (m is consumed). */
    const carry = (m: Matrix4, out: Matrix4) => {
      if (mount) tmpB.multiplyMatrices(mount, place);
      else tmpB.copy(place);
      return out.multiplyMatrices(tmpB, m);
    };
    // skinned body parts: one slot per (bone, inverse) used with weight
    for (const m of meshes) {
      if (!m.visible) continue;
      if ((m as SkinnedMesh).isSkinnedMesh) {
        const sm = m as SkinnedMesh;
        const g = grab(sm.geometry, sm.bindMatrix);
        // three skins as matrixWorld * bindMatrixInverse * (bone * boneInverse) * bindMatrix * p
        const pre = new Matrix4().multiplyMatrices(sm.matrixWorld, sm.bindMatrixInverse);
        const SI = sm.geometry.attributes.skinIndex;
        const SW = sm.geometry.attributes.skinWeight;
        const local = new Map<number, number>();
        const slotFor = (j: number) => {
          let k = local.get(j);
          if (k === undefined) {
            const bone = sm.skeleton.bones[j];
            const inv = sm.skeleton.boneInverses[j].clone();
            const out = new Matrix4();
            k = slots.length;
            local.set(j, k);
            slots.push({ sample: () => carry(tmpA.multiplyMatrices(pre, bone.matrixWorld).multiply(inv), out) });
          }
          return k;
        };
        addPiece(g, (i) => {
          const idx: number[] = [];
          const w: number[] = [];
          for (let c = 0; c < 4; c++) {
            const wt = SW.getComponent(i, c);
            if (wt > 0.001) {
              idx.push(slotFor(SI.getComponent(i, c)));
              w.push(wt);
            }
          }
          while (idx.length < 4) {
            idx.push(idx[0] ?? 0);
            w.push(0);
          }
          const sum = w.reduce((a, b) => a + b, 0) || 1;
          return [idx, w.map((x) => x / sum)];
        });
      } else {
        rigidPiece(m, m.geometry);
      }
    }
    for (const p of propObjs) rigidPiece(p.obj, p.geo);

    function rigidPiece(obj: Object3D, geo: BufferGeometry) {
      const rest = obj.matrixWorld.clone();
      const inv = rest.clone().invert();
      const g = grab(geo, rest);
      const out = new Matrix4();
      const k = slots.length;
      slots.push({ sample: () => carry(tmpA.copy(obj.matrixWorld).multiply(inv), out) });
      addPiece(g, () => [[k, 0, 0, 0], [1, 0, 0, 0]]);
    }
  }

  // --- clips: frame counts come from the first figure (or the given durations) ---
  const clips = {} as Record<AnimState, ClipRange>;
  let row = 0;
  const clipName = (f: FigureSpec, s: AnimState) => {
    const name = f.clips?.[s] ?? DEFAULT_CLIPS[s];
    return hasClip(name) ? name : DEFAULT_CLIPS[s];
  };
  for (const s of STATES) {
    const dur = figs.length ? clip(clipName(figs[0].spec, s)).duration : spec.durations?.[s] ?? (LOOPS[s] ? 1.2 : 0.8);
    const frames = Math.max(2, Math.round(dur * FPS) + (LOOPS[s] ? 0 : 1));
    clips[s] = { row, frames, loop: LOOPS[s], duration: dur };
    row += frames;
  }
  const W = slots.length * 3;
  const data = new Float32Array(W * row * 4);
  for (const s of STATES) {
    const c = clips[s];
    // set up each figure's action for this state
    const actions = figs.map((f) => {
      f.mixer.stopAllAction();
      const a = f.mixer.clipAction(clip(clipName(f.spec, s)));
      a.setLoop(c.loop ? LoopRepeat : LoopOnce, Infinity);
      a.clampWhenFinished = true;
      a.reset().play();
      return a;
    });
    for (let fr = 0; fr < c.frames; fr++) {
      const u = c.loop ? fr / c.frames : fr / (c.frames - 1);
      figs.forEach((f, k) => {
        const a = actions[k];
        const d = a.getClip().duration;
        let t: number;
        if (c.loop) t = ((u + (f.spec.phase ?? 0) / d) % 1) * d;
        else t = Math.min(d, Math.max(0, u * c.duration - (f.spec.phase ?? 0) * 0.25));
        a.time = t;
        f.mixer.update(0);
        f.spec.pose?.((n) => f.bones.get(boneName(n)), s, u);
        f.root.updateMatrixWorld(true);
      });
      for (const r of spec.rigid ?? []) {
        const m = rigidMats.get(r.name)!;
        if (r.motion) r.motion(s, u * c.duration, m);
        else m.identity();
      }
      const base = (c.row + fr) * W * 4;
      slots.forEach((sl, k) => {
        const e = sl.sample().elements;
        // three rows of the affine matrix
        const o = base + k * 12;
        data[o] = e[0]; data[o + 1] = e[4]; data[o + 2] = e[8]; data[o + 3] = e[12];
        data[o + 4] = e[1]; data[o + 5] = e[5]; data[o + 6] = e[9]; data[o + 7] = e[13];
        data[o + 8] = e[2]; data[o + 9] = e[6]; data[o + 10] = e[10]; data[o + 11] = e[14];
      });
    }
  }
  for (const f of figs) f.mixer.stopAllAction();
  const tex = new DataTexture(data, W, row, RGBAFormat, FloatType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.needsUpdate = true;
  const geometry = mergeGeometries(pieces, false)!;
  pieces.forEach((p) => p.dispose());
  geometry.setAttribute('bob', new BufferAttribute(new Float32Array(geometry.attributes.position.count), 1));
  geometry.computeBoundingSphere();
  return { geometry, bones: tex, slots: slots.length, clips };
}

/** GLSL: skinning from a baked bone texture. Needs uniforms uBones, uTime and attributes skinIndex/skinWeight/aAnim. */
export const RIG_GLSL = /* glsl */ `
uniform highp sampler2D uBones;
uniform float uRigStatic;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec4 aAnim; // row, frames, start time (s), mode (0 loop, 1 once)
mat4 yzBone(float slot, int row) {
  int x = int(slot) * 3;
  vec4 a = texelFetch(uBones, ivec2(x, row), 0);
  vec4 b = texelFetch(uBones, ivec2(x + 1, row), 0);
  vec4 c = texelFetch(uBones, ivec2(x + 2, row), 0);
  return mat4(vec4(a.x, b.x, c.x, 0.0), vec4(a.y, b.y, c.y, 0.0), vec4(a.z, b.z, c.z, 0.0), vec4(a.w, b.w, c.w, 1.0));
}
mat4 yzSkin(int row) {
  mat4 m = yzBone(skinIndex.x, row) * skinWeight.x;
  if (skinWeight.y > 0.0) m += yzBone(skinIndex.y, row) * skinWeight.y;
  if (skinWeight.z > 0.0) m += yzBone(skinIndex.z, row) * skinWeight.z;
  if (skinWeight.w > 0.0) m += yzBone(skinIndex.w, row) * skinWeight.w;
  return m;
}
mat4 yzRig(float phase) {
  // far away (or on low quality) everyone holds the first frame of their clip
  if (uRigStatic > 0.5) return yzSkin(int(aAnim.x));
  float frames = aAnim.y;
  float f = max(0.0, uTime - aAnim.z) * ${FPS.toFixed(1)};
  float fa;
  float fb;
  float k;
  if (aAnim.w < 0.5) {
    f = mod(f + phase * frames, frames);
    fa = floor(f);
    fb = mod(fa + 1.0, frames);
    k = f - fa;
  } else {
    f = min(f, frames - 1.0);
    fa = floor(f);
    fb = min(fa + 1.0, frames - 1.0);
    k = f - fa;
  }
  int ra = int(aAnim.x + fa);
  int rb = int(aAnim.x + fb);
  mat4 ma = yzSkin(ra);
  if (k < 0.01) return ma;
  return ma * (1.0 - k) + yzSkin(rb) * k;
}
`;
