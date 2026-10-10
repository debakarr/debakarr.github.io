// The shared chibi skeleton and its animation library. Every character in
// Year Zero and LumiQuest uses these proportions (head ≈ a third of the
// height, short sturdy legs, big hands and boots) and these clips, so a
// costume or a clip made for one game works in the other.

import type { AnimationClip } from 'three';
import { cos, makeClip, sin, type ClipSpec, type PoseFrame, type Rot } from './anim';

export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head', 'cape',
  'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
] as const;
export type BoneName = (typeof BONES)[number];

/** Rest offsets from the parent bone (model units: the figure is ~1.36 tall). */
export const REST: Record<BoneName, Rot> = {
  hips: [0, 0.47, 0],
  spine: [0, 0.05, 0],
  chest: [0, 0.12, 0],
  neck: [0, 0.135, 0],
  head: [0, 0.035, 0],
  cape: [0, 0.11, -0.1],
  armL: [0.15, 0.1, 0],
  foreL: [0, -0.135, 0],
  handL: [0, -0.125, 0],
  armR: [-0.15, 0.1, 0],
  foreR: [0, -0.135, 0],
  handR: [0, -0.125, 0],
  thighL: [0.075, -0.04, 0],
  shinL: [0, -0.19, 0],
  footL: [0, -0.19, 0],
  thighR: [-0.075, -0.04, 0],
  shinR: [0, -0.19, 0],
  footR: [0, -0.19, 0],
};

export const PARENT: Record<BoneName, BoneName | null> = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', cape: 'chest',
  armL: 'chest', foreL: 'armL', handL: 'foreL', armR: 'chest', foreR: 'armR', handR: 'foreR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
};

/** Head sphere centre relative to the head bone, and its radius. */
export const HEAD_Y = 0.21;
export const HEAD_R = 0.255;

type Pose = Partial<Record<BoneName, Rot>>;
const P = (rot: Pose, hipsDy = 0, hipsDz = 0): PoseFrame => ({ rot, pos: { hips: [0, hipsDy, hipsDz] } });
const bump = (p: number, a: number, b: number) => (p < a || p > b ? 0 : Math.sin(((p - a) / (b - a)) * Math.PI));
const ease = (t: number) => t * t * (3 - 2 * t);
/** Piecewise ramp: 0 → 1 between a and b, 1 → 0 between c and d. */
const env = (p: number, a: number, b: number, c: number, d: number) => (p < a ? 0 : p < b ? ease((p - a) / (b - a)) : p < c ? 1 : p < d ? 1 - ease((p - c) / (d - c)) : 0);

// Arms hang slightly away from the body; hands are big, so elbows bend a touch.
const ARMS_REST: Pose = { armL: [0.05, 0, 0.16], armR: [0.05, 0, -0.16], foreL: [-0.22, 0, 0], foreR: [-0.22, 0, 0] };

export function idlePose(p: number): PoseFrame {
  const b = sin(p);
  return P({
    ...ARMS_REST,
    spine: [0.02 * b, 0, 0],
    chest: [0.025 * b, 0, 0],
    head: [-0.025 * b, 0.04 * sin(p, 1), 0.02 * sin(p, 2)],
    armL: [0.05 + 0.04 * b, 0, 0.16 + 0.03 * b],
    armR: [0.05 + 0.04 * b, 0, -0.16 - 0.03 * b],
    cape: [0.04 + 0.03 * b, 0, 0],
  }, 0.005 * b);
}

export function walkPose(p: number, run: number): PoseFrame {
  const s = sin(p);
  const c = cos(p);
  const amp = 0.55 + run * 0.4;
  const knee = (o: number) => Math.max(0, sin(p, o)) * (0.9 + run * 0.75);
  return P({
    hips: [0, 0.1 * s, 0],
    spine: [0.05 + run * 0.2, -0.12 * s, 0],
    chest: [0.02, -0.1 * s, 0],
    head: [-0.05 - run * 0.12, 0.12 * s, 0],
    cape: [0.25 + run * 0.55 + 0.08 * Math.abs(c), 0, 0.05 * s],
    thighL: [-amp * s - run * 0.12, 0, 0],
    thighR: [amp * s - run * 0.12, 0, 0],
    shinL: [knee(-Math.PI / 2) + 0.1, 0, 0],
    shinR: [knee(Math.PI / 2) + 0.1, 0, 0],
    footL: [-0.12 * s, 0, 0],
    footR: [0.12 * s, 0, 0],
    armL: [amp * 0.9 * s, 0, 0.16 + run * 0.15],
    armR: [-amp * 0.9 * s, 0, -0.16 - run * 0.15],
    foreL: [-0.35 - run * 0.95, 0, 0],
    foreR: [-0.35 - run * 0.95, 0, 0],
  }, -0.015 + 0.03 * Math.abs(c) * (1 + run), 0);
}

/** One-handed swing with the right hand: wind-up, strike, recover. */
function attackPose(p: number): PoseFrame {
  const wind = env(p, 0, 0.35, 0.35, 0.5);
  const hit = env(p, 0.35, 0.5, 0.62, 1);
  return P({
    ...ARMS_REST,
    spine: [0.1 * hit, 0.5 * wind - 0.55 * hit, 0],
    chest: [0, 0.25 * wind - 0.3 * hit, 0],
    head: [0, -0.25 * wind + 0.2 * hit, 0],
    armR: [-2.4 * wind - 0.6 * hit, 0, -0.5 * wind - 0.2],
    foreR: [-0.9 * wind - 0.2 * hit, 0, 0],
    handR: [0.3 * wind - 0.6 * hit, 0, 0],
    armL: [-0.8 * hit + 0.2 * wind, 0, 0.3],
    foreL: [-0.9, 0, 0],
    thighL: [-0.55 * hit, 0, 0.08],
    shinL: [0.45 * hit, 0, 0],
    thighR: [0.3 * hit, 0, -0.08],
    shinR: [0.2 * hit, 0, 0],
    cape: [0.15 + 0.4 * hit, 0, 0],
  }, -0.04 * hit, 0.03 * hit);
}

/** Spear thrust (two hands forward). */
function thrustPose(p: number): PoseFrame {
  const pull = env(p, 0, 0.3, 0.3, 0.45);
  const go = env(p, 0.3, 0.45, 0.6, 1);
  return P({
    spine: [0.15 * go, 0.3 * pull - 0.2 * go, 0],
    armR: [-0.9 - 0.7 * go + 0.3 * pull, 0, -0.25],
    foreR: [-1.1 + 0.9 * go - 0.3 * pull, 0, 0],
    armL: [-1.1 - 0.4 * go, 0, 0.25],
    foreL: [-0.8 + 0.5 * go, 0, 0],
    thighL: [-0.7 * go, 0, 0.06],
    shinL: [0.5 * go, 0, 0],
    thighR: [0.35 * go, 0, -0.06],
    cape: [0.2 + 0.4 * go, 0, 0],
  }, -0.05 * go, 0.04 * go);
}

/** Bow: raise, draw, loose. Left arm holds the bow out, right draws to the cheek. */
function shootPose(p: number): PoseFrame {
  const up = env(p, 0, 0.25, 0.85, 1);
  const draw = env(p, 0.2, 0.6, 0.62, 0.7);
  return P({
    spine: [0, -0.5 * up, 0],
    chest: [0, -0.3 * up, 0],
    head: [0, 0.75 * up, 0],
    armL: [-1.45 * up, 0, 0.25 - 0.1 * up],
    foreL: [-0.15 * up, 0, 0],
    armR: [-1.4 * up, 0, -0.3 - 0.35 * draw],
    foreR: [-0.35 * up - 1.6 * draw, 0, 0],
    thighL: [-0.25 * up, 0, 0.12],
    thighR: [0.2 * up, 0, -0.12],
  }, -0.02 * up);
}

/** Long gun: shoulder, fire (kick), lower. */
function firePose(p: number): PoseFrame {
  const up = env(p, 0, 0.25, 0.8, 1);
  const kick = bump(p, 0.45, 0.6);
  return P({
    spine: [-0.08 * kick, -0.25 * up, 0],
    head: [0.1 * up, 0.3 * up, 0],
    armR: [-1.15 * up, 0, -0.35],
    foreR: [-1.0 * up + 0.3 * kick, 0, 0],
    armL: [-1.45 * up, 0.3 * up, 0.25],
    foreL: [-0.35 * up, 0, 0],
    thighL: [-0.25 * up, 0, 0.1],
    thighR: [0.15 * up, 0, -0.1],
  }, -0.02 * up, -0.02 * kick);
}

/** Shield up, braced. */
function defendPose(p: number): PoseFrame {
  const k = env(p, 0, 0.25, 0.75, 1);
  return P({
    ...ARMS_REST,
    spine: [0.18 * k, 0, 0],
    head: [-0.1 * k, 0, 0],
    armL: [-1.2 * k, 0.4 * k, 0.25],
    foreL: [-1.0 * k, 0, 0],
    armR: [-0.5 * k, 0, -0.3],
    foreR: [-0.9 * k, 0, 0],
    thighL: [-0.4 * k, 0, 0.1],
    shinL: [0.5 * k, 0, 0],
    thighR: [0.25 * k, 0, -0.1],
    shinR: [0.3 * k, 0, 0],
  }, -0.06 * k);
}

function hitPose(p: number): PoseFrame {
  const k = bump(p, 0, 1);
  return P({
    ...ARMS_REST,
    spine: [-0.35 * k, 0.15 * k, 0],
    head: [-0.3 * k, -0.2 * k, 0.1 * k],
    armL: [0.4 * k, 0, 0.7 * k + 0.16],
    armR: [0.4 * k, 0, -0.7 * k - 0.16],
    foreL: [-0.6 * k, 0, 0],
    foreR: [-0.6 * k, 0, 0],
    thighL: [-0.3 * k, 0, 0],
    shinL: [0.6 * k, 0, 0],
    cape: [0.5 * k, 0, 0],
  }, -0.03 * k, -0.05 * k);
}

function deathPose(p: number): PoseFrame {
  const k = ease(Math.min(1, p * 1.4));
  return P({
    hips: [-1.35 * k, 0, 0.1 * k],
    spine: [-0.15 * k, 0, 0],
    head: [-0.3 * k, 0.3 * k, 0],
    armL: [-0.2 * k, 0, 1.3 * k],
    armR: [-0.2 * k, 0, -1.3 * k],
    thighL: [0.7 * k, 0, 0.15],
    shinL: [0.4 * k, 0, 0],
    thighR: [0.5 * k, 0, -0.15],
    shinR: [0.6 * k, 0, 0],
    cape: [0.6 * k, 0, 0],
  }, -0.36 * k, -0.18 * k);
}

/** Leaders speaking: one open hand presents, the head nods. */
function talkPose(p: number): PoseFrame {
  const base = idlePose(p);
  const g = 0.5 + 0.5 * sin(p * 2);
  base.rot.armR = [-0.75 - 0.25 * g, 0.3, -0.45];
  base.rot.foreR = [-0.85 - 0.3 * g, 0, 0];
  base.rot.handR = [0.3, 0, -0.5 + 0.2 * g];
  base.rot.head = [0.06 * sin(p * 2), 0.12 * sin(p), 0.05];
  return base;
}

/** A welcoming sweep of the arm (Sunland Queen's sheet pose). */
function welcomePose(p: number): PoseFrame {
  const base = idlePose(p);
  const k = 0.5 + 0.5 * sin(p);
  base.rot.armR = [-0.6, 0.2, -1.0 - 0.15 * k];
  base.rot.foreR = [-0.35, 0, 0];
  base.rot.handR = [0.4, 0, -0.4];
  base.rot.head = [0.04, -0.12, 0.08];
  base.rot.spine = [0, -0.08, 0.03];
  return base;
}

/** Thoughtful: hand to chin. */
function ponderPose(p: number): PoseFrame {
  const base = idlePose(p);
  base.rot.armR = [-0.9, 0, -0.35];
  base.rot.foreR = [-2.15, 0, 0];
  base.rot.armL = [-0.5, 0, 0.35];
  base.rot.foreL = [-1.4, 0, 0];
  base.rot.head = [0.12, 0.1 * sin(p), 0.1];
  return base;
}

function wavePose(p: number): PoseFrame {
  const base = idlePose(p);
  base.rot.armR = [-0.2, 0, -2.5];
  base.rot.foreR = [0, 0, -0.35 + 0.45 * sin(p * 2)];
  base.rot.head = [0, 0.1, 0.12];
  return base;
}

function cheerPose(p: number): PoseFrame {
  const k = bump(p, 0, 1);
  return P({ armL: [0, 0, 2.6 * k + 0.16], armR: [0, 0, -2.6 * k - 0.16], spine: [-0.15 * k, 0, 0], head: [-0.2 * k, 0, 0], thighL: [-0.3 * k, 0, 0], shinL: [0.6 * k, 0, 0] }, 0.12 * k);
}

/** Two-handed hammer work over a bench (builder, engineer). */
function workPose(p: number): PoseFrame {
  const up = env(p, 0, 0.45, 0.45, 0.6);
  const down = env(p, 0.45, 0.6, 0.7, 1);
  return P({
    spine: [0.25 + 0.2 * down, 0, 0],
    head: [0.15, 0, 0],
    armR: [-0.6 - 1.7 * up + 0.2 * down, 0, -0.25],
    foreR: [-0.9 - 0.5 * up, 0, 0],
    armL: [-0.7, 0, 0.3],
    foreL: [-1.0, 0, 0],
    thighL: [-0.3, 0, 0.1],
    shinL: [0.35, 0, 0],
    thighR: [0.15, 0, -0.1],
  }, -0.04);
}

/** Looking through a spyglass (scout). */
function observePose(p: number): PoseFrame {
  const k = env(p, 0, 0.2, 0.8, 1);
  return P({
    ...ARMS_REST,
    head: [-0.05, 0.25 * sin(p) * k, 0],
    armR: [-1.85 * k, 0, -0.35 * k - 0.16],
    foreR: [-1.55 * k, 0, 0.2 * k],
    armL: [-1.6 * k, 0, 0.45 * k + 0.16],
    foreL: [-1.45 * k, 0, -0.2 * k],
  });
}

/** Seated on a mount (cavalry) or a throne. */
function sitPose(p: number): PoseFrame {
  return P({
    thighL: [-1.45, 0, 0.25], thighR: [-1.45, 0, -0.25], shinL: [1.35, 0, 0], shinR: [1.35, 0, 0],
    spine: [0.04 + 0.015 * sin(p), 0, 0], head: [-0.02 * sin(p), 0, 0],
    armL: [-0.55, 0, 0.2], armR: [-0.55, 0, -0.2], foreL: [-0.7, 0, 0], foreR: [-0.7, 0, 0],
  }, -0.27);
}

function ridePose(p: number): PoseFrame {
  const b = sin(p * 2);
  return P({
    thighL: [-1.2, 0, 0.55], thighR: [-1.2, 0, -0.55], shinL: [1.3, 0, 0], shinR: [1.3, 0, 0],
    spine: [0.15 + 0.06 * b, 0, 0], head: [-0.1 - 0.05 * b, 0, 0],
    armL: [-0.75, 0, 0.2], armR: [-0.75, 0, -0.2], foreL: [-0.9, 0, 0], foreR: [-0.9, 0, 0],
    cape: [0.5 + 0.15 * b, 0, 0],
  }, -0.25 + 0.02 * b);
}

/** Quick stop-and-turn (sheet 05's "Stop / Turn"). */
function turnPose(p: number): PoseFrame {
  const k = bump(p, 0, 1);
  return P({
    ...ARMS_REST,
    spine: [0.1 * k, 0.7 * k, 0],
    head: [0, 0.5 * k, 0],
    thighL: [-0.4 * k, 0, 0.2 * k],
    shinL: [0.5 * k, 0, 0],
    thighR: [0.3 * k, 0, -0.15 * k],
    armL: [-0.4 * k, 0, 0.6 * k],
    armR: [0.3 * k, 0, -0.5 * k],
    cape: [0.3 * k, 0, 0.3 * k],
  }, -0.05 * k);
}

// --- Exploration clips (LumiQuest): crouch, sneak, jumps, swimming, gliding, interacting ---

function crouchPose(p: number, moving: boolean): PoseFrame {
  const s = moving ? sin(p) : 0;
  return P({
    spine: [0.35, 0, 0], chest: [0.1, 0, 0], head: [-0.35, 0, 0],
    thighL: [-1.0 - 0.35 * s, 0, 0.08], thighR: [-1.0 + 0.35 * s, 0, -0.08],
    shinL: [1.5 + 0.2 * Math.max(0, s), 0, 0], shinR: [1.5 + 0.2 * Math.max(0, -s), 0, 0],
    footL: [-0.45, 0, 0], footR: [-0.45, 0, 0],
    armL: [-0.4 + 0.2 * s, 0, 0.25], armR: [-0.4 - 0.2 * s, 0, -0.25], foreL: [-0.9, 0, 0], foreR: [-0.9, 0, 0],
    cape: [0.3, 0, 0],
  }, -0.15 + 0.01 * Math.abs(s), -0.04);
}

const jumpPose = (): PoseFrame => P({
  spine: [-0.1, 0, 0], thighL: [-0.9, 0, 0.05], shinL: [1.3, 0, 0], thighR: [-0.2, 0, -0.05], shinR: [0.5, 0, 0],
  armL: [-0.3, 0, 1.1], armR: [-0.3, 0, -1.1], foreL: [-0.4, 0, 0], foreR: [-0.4, 0, 0], cape: [0.6, 0, 0],
}, 0.04);

const fallPose = (p: number): PoseFrame => P({
  spine: [0.05, 0, 0], thighL: [-0.5 + 0.1 * sin(p), 0, 0.1], shinL: [0.8, 0, 0], thighR: [-0.3 - 0.1 * sin(p), 0, -0.1], shinR: [0.6, 0, 0],
  armL: [-0.2, 0, 1.3 + 0.15 * sin(p)], armR: [-0.2, 0, -1.3 - 0.15 * sin(p)], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0], head: [0.15, 0, 0], cape: [0.9, 0, 0],
});

function landPose(p: number): PoseFrame {
  const k = Math.sin(Math.PI * p);
  return P({
    spine: [0.4 * k, 0, 0], head: [-0.25 * k, 0, 0], thighL: [-1.0 * k, 0, 0.05], thighR: [-1.0 * k, 0, -0.05], shinL: [1.6 * k, 0, 0], shinR: [1.6 * k, 0, 0],
    footL: [-0.5 * k, 0, 0], footR: [-0.5 * k, 0, 0], armL: [-0.4 * k, 0, 0.5 * k + 0.16], armR: [-0.4 * k, 0, -0.5 * k - 0.16],
  }, -0.16 * k);
}

const swimPose = (p: number): PoseFrame => P({
  hips: [1.25, 0, 0], spine: [-0.1, 0, 0], head: [-0.95, 0, 0],
  armL: [-2.2 + 0.9 * sin(p), 0, 0.6 + 0.6 * cos(p)], armR: [-2.2 + 0.9 * sin(p), 0, -0.6 - 0.6 * cos(p)],
  foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0],
  thighL: [0.35 * sin(p * 2), 0, 0.15], thighR: [-0.35 * sin(p * 2), 0, -0.15], shinL: [0.3, 0, 0], shinR: [0.3, 0, 0], cape: [0.2, 0, 0],
}, -0.22);

const treadPose = (p: number): PoseFrame => P({
  spine: [0.1, 0, 0], armL: [-0.6, 0, 0.9 + 0.3 * sin(p)], armR: [-0.6, 0, -0.9 - 0.3 * sin(p)], foreL: [-0.4, 0, 0], foreR: [-0.4, 0, 0],
  thighL: [-0.4 + 0.3 * sin(p), 0, 0], thighR: [-0.4 - 0.3 * sin(p), 0, 0], shinL: [0.7, 0, 0], shinR: [0.7, 0, 0],
}, -0.05);

const glidePose = (p: number): PoseFrame => P({
  hips: [0.9, 0, 0], head: [-0.75, 0, 0], armL: [0, 0, 1.45 + 0.05 * sin(p)], armR: [0, 0, -1.45 - 0.05 * sin(p)],
  thighL: [0.15, 0, 0.12], thighR: [0.15, 0, -0.12], shinL: [0.4, 0, 0], shinR: [0.4, 0, 0], cape: [1.1 + 0.1 * sin(p * 2), 0, 0],
});

function interactPose(p: number): PoseFrame {
  const k = Math.sin(Math.PI * p);
  return P({ ...ARMS_REST, spine: [0.2 * k, 0, 0], armR: [-1.4 * k, 0, -0.16], foreR: [-0.3 * k - 0.2, 0, 0], head: [0.25 * k, 0, 0] });
}

function resonatePose(p: number): PoseFrame {
  const k = Math.sin(Math.PI * p);
  return P({ ...ARMS_REST, armL: [-1.5 * k, 0, 0.16], foreL: [-0.2 * k, 0, 0], armR: [-1.3 * k, 0, -0.16], foreR: [-0.4 * k, 0, 0], spine: [-0.1 * k, 0, 0] }, 0.02 * k);
}

/** Upper body of one pose on the seated lower body. */
function seated(upper: (p: number) => PoseFrame): (p: number) => PoseFrame {
  const UP: BoneName[] = ['chest', 'neck', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR'];
  return (p) => {
    const a = sitPose(p);
    const b = upper(p);
    for (const k of UP) if (b.rot[k]) a.rot[k] = b.rot[k];
    return a;
  };
}

export type ClipName =
  | 'idle' | 'walk' | 'run' | 'turn' | 'attack' | 'thrust' | 'shoot' | 'defend' | 'hit' | 'death'
  | 'talk' | 'welcome' | 'ponder' | 'wave' | 'cheer' | 'work' | 'observe' | 'sit' | 'ride'
  | 'sitTalk' | 'sitWelcome' | 'sitPonder' | 'fire'
  | 'crouch' | 'sneak' | 'jump' | 'fall' | 'land' | 'swim' | 'tread' | 'glide' | 'interact' | 'resonate';

export const POSES: Record<ClipName, (p: number) => PoseFrame> = {
  idle: idlePose,
  walk: (p) => walkPose(p, 0),
  run: (p) => walkPose(p, 1),
  turn: turnPose,
  attack: attackPose,
  thrust: thrustPose,
  shoot: shootPose,
  defend: defendPose,
  hit: hitPose,
  death: deathPose,
  talk: talkPose,
  welcome: welcomePose,
  ponder: ponderPose,
  wave: wavePose,
  cheer: cheerPose,
  work: workPose,
  observe: observePose,
  sit: sitPose,
  ride: ridePose,
  sitTalk: seated(talkPose),
  sitWelcome: seated(welcomePose),
  sitPonder: seated(ponderPose),
  fire: firePose,
  crouch: (p) => crouchPose(p, false),
  sneak: (p) => crouchPose(p, true),
  jump: jumpPose,
  fall: fallPose,
  land: landPose,
  swim: swimPose,
  tread: treadPose,
  glide: glidePose,
  interact: interactPose,
  resonate: resonatePose,
};

const LOOPING: Record<ClipName, [boolean, number]> = {
  idle: [true, 3.2], walk: [true, 0.95], run: [true, 0.6], turn: [false, 0.5],
  attack: [false, 0.85], thrust: [false, 0.8], shoot: [false, 1.4], defend: [false, 1.2],
  hit: [false, 0.45], death: [false, 1.1], talk: [true, 2.6], welcome: [true, 3.4], ponder: [true, 3.6],
  wave: [true, 1.6], cheer: [false, 1.0], work: [true, 1.1], observe: [false, 2.4], sit: [true, 3], ride: [true, 0.7],
  sitTalk: [true, 2.6], sitWelcome: [true, 3.4], sitPonder: [true, 3.6], fire: [false, 1.1],
  crouch: [true, 2], sneak: [true, 1.2], jump: [true, 1], fall: [true, 0.8], land: [false, 0.32], swim: [true, 1.3], tread: [true, 1.6],
  glide: [true, 1.2], interact: [false, 0.7], resonate: [false, 1.1],
};

let cache: Record<ClipName, ClipSpec> | null = null;

/** Every clip as a three AnimationClip, built once and shared by all characters. */
export function chibiClips(): Record<ClipName, ClipSpec> {
  if (cache) return cache;
  const bones = BONES as readonly string[];
  const rest = REST as Record<string, Rot>;
  const out = {} as Record<ClipName, ClipSpec>;
  for (const name of Object.keys(POSES) as ClipName[]) {
    const [loop, dur] = LOOPING[name];
    const clip: AnimationClip = makeClip(name, dur, POSES[name], bones, rest, loop ? 24 : 20, loop);
    out[name] = { clip, loop };
  }
  return (cache = out);
}
