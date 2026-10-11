// Leaders in the audience hall, built from the shared chibi kit (the art
// pack's leader sheets): a people's leader in their colours, seated on the
// throne or standing, with painted expressions and gestures.

import { Object3D } from 'three';
import type { Expression as Face } from '../../../shared/chibi/face';
import { leaderSpec } from '../../../shared/chibi/leaders';
import { ChibiModel } from '../../../shared/chibi/model';
import type { ClipName } from '../../../shared/chibi/rig';

export type Expression = 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised';
export type Gesture = 'open' | 'welcome' | 'refuse' | 'point' | 'none';

export interface LeaderLook {
  gender: 'f' | 'm';
  title: string;
  tier: number;
  color: string;
  skin: string;
  seed: number;
  /** 0 young .. 1 old */
  age: number;
}

export interface ChibiLeader {
  root: Object3D;
  model: ChibiModel;
  seated: boolean;
  expression: Expression;
  setExpression(e: Expression): void;
  gesture(g: Gesture): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

/** Leaders stand about 2.4 units tall (feet at the origin, facing +z). */
export const LEADER_SCALE = 1.9;

const FACE: Record<Expression, Face> = {
  neutral: 'neutral',
  happy: 'happy',
  sad: 'concerned',
  angry: 'determined',
  surprised: 'surprised',
};

const GESTURE: Record<Gesture, ClipName | null> = {
  welcome: 'welcome',
  open: 'talk',
  refuse: 'defend',
  point: 'wave',
  none: null,
};

export function buildChibiLeader(look: LeaderLook, stand = false): ChibiLeader {
  const spec = leaderSpec(look);
  const seated = !stand && look.tier < 7 && !/Envoy/.test(look.title);
  const model = new ChibiModel(spec, { clip: seated ? 'sit' : 'idle' });
  model.root.scale.setScalar(LEADER_SCALE);
  const root = new Object3D();
  root.add(model.root);
  const base: ClipName = seated ? 'sit' : 'talk';
  let gestureUntil = -1;
  let now = 0;
  if (!seated) model.play('idle', 0);
  const leader: ChibiLeader = {
    root,
    model,
    seated,
    expression: 'neutral',
    setExpression(e) {
      this.expression = e;
      model.setExpression(FACE[e]);
    },
    gesture(g) {
      const clip = GESTURE[g];
      if (!clip) return;
      // seated leaders gesture from the throne: only the clip's upper body moves visibly
      if (seated) {
        model.play(clip === 'defend' ? 'sitPonder' : clip === 'welcome' ? 'sitWelcome' : 'sitTalk', 0.3);
        gestureUntil = now + 2.4;
        return;
      }
      model.play(clip, 0.3);
      gestureUntil = now + 2.6;
    },
    update(dt, t) {
      now = t;
      model.update(dt);
      if (gestureUntil > 0 && t > gestureUntil) {
        gestureUntil = -1;
        model.play(seated ? 'sit' : base === 'talk' ? 'idle' : base, 0.45);
      }
    },
    dispose() {
      model.dispose();
    },
  };
  leader.setExpression(spec.mood === 'happy' ? 'happy' : 'neutral');
  return leader;
}
