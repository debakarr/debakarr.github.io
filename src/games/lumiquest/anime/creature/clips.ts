// Procedural motion for sculpted creatures: squash and stretch, hops that
// land with a squish, ears and tips that lag behind, blinks. Every clip
// writes every bone (rest values where it doesn't move them) so cross-fades
// never leave a bone stranded.

import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack, type Object3D } from 'three';
import type { ClipSpec } from '../../../shared/chibi/anim';
import type { BoneDef, CreatureStyle } from './build';

/** Each bone's rest position relative to its parent. */
function restOf(bones: BoneDef[]): Map<string, Vector3> {
  const m = new Map<string, Vector3>();
  for (const bd of bones) {
    const p = bd.parent ? bones.find((x) => x.name === bd.parent) : null;
    m.set(bd.name, new Vector3(bd.at[0] - (p?.at[0] ?? 0), bd.at[1] - (p?.at[1] ?? 0), bd.at[2] - (p?.at[2] ?? 0)));
  }
  return m;
}

type T3 = [number, number, number];
interface Key {
  /** Offset from the rest position. */
  p?: T3;
  /** Euler rotation (XYZ). */
  r?: T3;
  s?: T3;
}
type Pose = Record<string, Key>;

const TAU = Math.PI * 2;
const sin = (x: number) => Math.sin(x);
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Eye squeeze for blinks centred on phases `at` (0..1) of a loop lasting `dur` seconds. */
function blink(t: number, dur: number, at: number[]): number {
  let k = 1;
  for (const a of at) {
    const dt = Math.abs(t - a) * dur;
    if (dt < 0.09) k = Math.min(k, 0.1 + 0.9 * (dt / 0.09) ** 2);
  }
  return k;
}

function eyes(scaleY: number, scaleXY = 1): Pose {
  return { eyeL: { s: [scaleXY, scaleY * scaleXY, 1] }, eyeR: { s: [scaleXY, scaleY * scaleXY, 1] } };
}

function clip(name: string, dur: number, fn: (t: number) => Pose, rest: Map<string, Vector3>, fps = 30): AnimationClip {
  const frames = Math.max(2, Math.round(dur * fps) + 1);
  const times = new Float32Array(frames);
  for (let i = 0; i < frames; i++) times[i] = (i / (frames - 1)) * dur;
  const bones = [...rest.keys()];
  const pos = new Map(bones.map((b) => [b, new Float32Array(frames * 3)]));
  const rot = new Map(bones.map((b) => [b, new Float32Array(frames * 4)]));
  const scl = new Map([...bones, 'eyeL', 'eyeR'].map((b) => [b, new Float32Array(frames * 3)]));
  const e = new Euler();
  const q = new Quaternion();
  for (let i = 0; i < frames; i++) {
    const pose = fn(i / (frames - 1));
    for (const b of bones) {
      const k = pose[b] ?? {};
      const r = rest.get(b)!;
      pos.get(b)!.set([r.x + (k.p?.[0] ?? 0), r.y + (k.p?.[1] ?? 0), r.z + (k.p?.[2] ?? 0)], i * 3);
      q.setFromEuler(e.set(k.r?.[0] ?? 0, k.r?.[1] ?? 0, k.r?.[2] ?? 0));
      rot.get(b)!.set([q.x, q.y, q.z, q.w], i * 4);
    }
    for (const [b, arr] of scl) arr.set(pose[b]?.s ?? [1, 1, 1], i * 3);
  }
  const tracks = [];
  for (const b of bones) {
    tracks.push(new VectorKeyframeTrack(`${b}.position`, times, pos.get(b)!));
    tracks.push(new QuaternionKeyframeTrack(`${b}.quaternion`, times, rot.get(b)!));
  }
  for (const [b, arr] of scl) tracks.push(new VectorKeyframeTrack(`${b}.scale`, times, arr));
  return new AnimationClip(name, dur, tracks);
}

function merge(...poses: Pose[]): Pose {
  const out: Pose = {};
  for (const p of poses) for (const [k, v] of Object.entries(p)) out[k] = { ...out[k], ...v };
  return out;
}

/** A hop: 0 at take-off and landing, 1 at the top. */
function hop(t: number): { air: number; land: number } {
  const air = sin(Math.PI * t);
  const land = Math.max(0, 1 - air * 2.2) ** 2;
  return { air, land };
}

function slimeClips(rest: Map<string, Vector3>): Record<string, ClipSpec> {
  const fins = (a: number): Pose => ({ finL: { r: [0, 0, a] }, finR: { r: [0, 0, -a] } });
  const mk = (name: string, dur: number, loop: boolean, fn: (t: number) => Pose): [string, ClipSpec] => [name, { clip: clip(name, dur, fn, rest), loop }];
  const hopper = (h: number, sq: number) => (t: number): Pose => {
    const { air, land } = hop(t);
    return merge(
      { body: { p: [0, h * air, 0], s: [1 + sq * land - 0.05 * air, 1 - sq * 1.3 * land + 0.1 * air, 1 + sq * land - 0.05 * air], r: [0.1 * air, 0, 0] } },
      { tip: { r: [-0.35 * air + 0.2 * land, 0, 0] } },
      fins(0.2 + 0.5 * air),
    );
  };
  return Object.fromEntries([
    mk('idle', 2.4, true, (t) => {
      const s = sin(TAU * t);
      return merge(
        { body: { s: [1 + 0.035 * s, 1 - 0.045 * s, 1 + 0.035 * s] } },
        { head: { r: [0, 0, 0.05 * sin(TAU * t + 1)] } },
        { tip: { r: [0.15 * sin(TAU * t + 0.5), 0, 0.12 * sin(TAU * t)] } },
        fins(0.12 + 0.12 * sin(TAU * 2 * t)),
        eyes(blink(t, 2.4, [0.32, 0.82])),
      );
    }),
    mk('walk', 0.6, true, hopper(0.07, 0.12)),
    mk('run', 0.42, true, hopper(0.13, 0.18)),
    mk('look', 2.0, true, (t) =>
      merge({ body: { s: [0.97, 1.05, 0.97] } }, { head: { r: [0, 0.3 * sin(TAU * t), 0.1 * sin(TAU * t)] } }, { tip: { r: [0.1, 0, 0.15 * sin(TAU * t)] } }, fins(0.2), eyes(blink(t, 2, [0.6]))),
    ),
    mk('alert', 1.2, true, (t) =>
      merge({ body: { s: [0.92, 1.13, 0.92], p: [0.008 * sin(TAU * 9 * t), 0, 0] } }, { tip: { r: [-0.2, 0, 0.1 * sin(TAU * 6 * t)] } }, fins(0.6), eyes(1, 1.13)),
    ),
    mk('eat', 1.2, true, (t) => {
      const n = Math.abs(sin(TAU * t));
      return merge({ body: { s: [1 + 0.06 * n, 1 - 0.1 * n, 1 + 0.06 * n] } }, { head: { r: [0.15 * n, 0, 0] } }, fins(0.1), eyes(blink(t, 1.2, [0.5])));
    }),
    mk('sleep', 3.2, true, (t) => {
      const s = sin(TAU * t);
      return merge({ body: { s: [1.08 + 0.03 * s, 0.84 - 0.03 * s, 1.08 + 0.03 * s] } }, { tip: { r: [0.6, 0, 0] } }, fins(-0.2), eyes(0.08));
    }),
    mk('swim', 1.6, true, (t) =>
      merge({ body: { p: [0, 0.03 * sin(TAU * t), 0], r: [0, 0, 0.06 * sin(TAU * t)] } }, { tip: { r: [-0.2 * sin(TAU * t), 0, 0] } }, { finL: { r: [0.6 * sin(TAU * 2 * t), 0, 0.3] }, finR: { r: [0.6 * sin(TAU * 2 * t), 0, -0.3] } }),
    ),
    mk('happy', 1.1, false, (t) => {
      const { air, land } = hop(t);
      return merge(
        { body: { p: [0, 0.3 * air, 0], r: [0, TAU * smooth(t * 1.15 - 0.05), 0], s: [1 + 0.2 * land, 1 - 0.25 * land + 0.12 * air, 1 + 0.2 * land] } },
        fins(0.2 + 0.9 * air),
        eyes(0.35),
      );
    }),
    mk('defend', 0.8, false, (t) => {
      const k = sin(Math.PI * t);
      return merge({ body: { s: [1 + 0.18 * k, 1 + 0.12 * k, 1 + 0.18 * k], p: [0, 0, 0.18 * k] } }, fins(0.8 * k), eyes(1, 1 + 0.1 * k));
    }),
  ]);
}

function hopperClips(rest: Map<string, Vector3>): Record<string, ClipSpec> {
  const ears = (x: number, z = 0): Pose => ({ earL: { r: [x, 0, z] }, earR: { r: [x, 0, -z] } });
  const mk = (name: string, dur: number, loop: boolean, fn: (t: number) => Pose): [string, ClipSpec] => [name, { clip: clip(name, dur, fn, rest), loop }];
  const bound = (h: number, sq: number, ear: number) => (t: number): Pose => {
    const { air, land } = hop(t);
    return merge(
      { body: { p: [0, h * air, 0], s: [1 + sq * land, 1 - sq * 1.4 * land + 0.06 * air, 1 + sq * land], r: [-0.12 * air + 0.08 * land, 0, 0] } },
      { head: { r: [0.1 * land, 0, 0] } },
      ears(-ear * air - 0.1, 0.05),
      { footL: { r: [-0.5 * air, 0, 0] }, footR: { r: [-0.5 * air, 0, 0] } },
      { hindL: { r: [0.7 * air, 0, 0] }, hindR: { r: [0.7 * air, 0, 0] } },
      { tail: { r: [0.3 * air, 0, 0] } },
    );
  };
  const twitch = (t: number, at: number) => Math.max(0, 1 - Math.abs(t - at) * 14);
  return Object.fromEntries([
    mk('idle', 2.6, true, (t) => {
      const s = sin(TAU * t);
      return merge(
        { body: { s: [1 + 0.025 * s, 1 - 0.03 * s, 1 + 0.025 * s] } },
        { head: { r: [0.03 * sin(TAU * t + 2), 0, 0.06 * sin(TAU * t)] } },
        { earL: { r: [0.05 * s, 0, 0.08 + 0.35 * twitch(t, 0.3)] }, earR: { r: [-0.05 * s, 0, -0.08 - 0.35 * twitch(t, 0.72)] } },
        { tail: { r: [0, 0.5 * twitch(t, 0.5) * sin(TAU * 8 * t), 0] } },
        eyes(blink(t, 2.6, [0.16, 0.62])),
      );
    }),
    mk('walk', 0.5, true, bound(0.06, 0.08, 0.35)),
    mk('run', 0.36, true, bound(0.12, 0.12, 0.7)),
    mk('look', 2.2, true, (t) =>
      merge({ head: { r: [-0.05, 0.4 * sin(TAU * t), 0.08 * sin(TAU * t)] } }, ears(0.08, 0.12), eyes(blink(t, 2.2, [0.55]))),
    ),
    mk('alert', 1.2, true, (t) =>
      merge({ body: { s: [0.97, 1.06, 0.97], p: [0.006 * sin(TAU * 10 * t), 0, 0] } }, { head: { r: [-0.12, 0, 0] } }, ears(0.12, 0), eyes(1, 1.1)),
    ),
    mk('eat', 1.0, true, (t) =>
      merge({ head: { r: [0.38 + 0.07 * sin(TAU * 4 * t), 0, 0] } }, ears(-0.25, 0.15), eyes(blink(t, 1, [0.4]))),
    ),
    mk('sleep', 3.4, true, (t) => {
      const s = sin(TAU * t);
      return merge({ body: { s: [1.05 + 0.02 * s, 0.9 - 0.03 * s, 1.05 + 0.02 * s] } }, { head: { r: [0.32, 0, 0.1] } }, ears(-1.05, 0.2), eyes(0.08));
    }),
    mk('swim', 1.2, true, (t) =>
      merge(
        { body: { p: [0, 0.025 * sin(TAU * t), 0] } },
        { footL: { r: [0.8 * sin(TAU * 2 * t), 0, 0] }, footR: { r: [-0.8 * sin(TAU * 2 * t), 0, 0] } },
        { hindL: { r: [-0.8 * sin(TAU * 2 * t), 0, 0] }, hindR: { r: [0.8 * sin(TAU * 2 * t), 0, 0] } },
        ears(-0.5, 0.2),
      ),
    ),
    mk('happy', 1.0, false, (t) => {
      const { air, land } = hop(t);
      return merge(
        { body: { p: [0, 0.32 * air, 0], r: [0, 1.1 * sin(Math.PI * t), 0.25 * sin(TAU * t)], s: [1 + 0.15 * land, 1 - 0.2 * land, 1 + 0.15 * land] } },
        ears(-0.4 * air, 0.4 * air),
        { hindL: { r: [0.9 * air, 0, 0] }, hindR: { r: [0.9 * air, 0, 0] } },
        eyes(0.35),
      );
    }),
    mk('defend', 0.7, false, (t) => {
      const k = sin(Math.PI * t);
      return merge({ body: { s: [1 + 0.1 * k, 1 + 0.08 * k, 1 + 0.1 * k], r: [0.15 * k, 0, 0] } }, { hindL: { r: [-0.9 * k, 0, 0] }, hindR: { r: [-0.9 * k, 0, 0] } }, ears(0.15, 0), eyes(1, 1.08));
    }),
  ]);
}

export function creatureClips(style: CreatureStyle, _root: Object3D, bones: BoneDef[]): Record<string, ClipSpec> {
  const rest = restOf(bones);
  return style === 'slime' ? slimeClips(rest) : hopperClips(rest);
}
