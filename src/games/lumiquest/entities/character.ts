// Modular chibi characters for the player and the villagers. A character is a
// Bone hierarchy (driven by AnimationMixer) with swappable parts attached to
// the bones: hair styles, outfits, accessories and a painted face. Changing
// an option rebuilds only the parts, so the customization preview updates
// instantly while the animation keeps playing.

import {
  Bone,
  CanvasTexture,
  Color,
  Group,
  MeshStandardMaterial,
  SkinnedMesh,
  SRGBColorSpace,
  SphereGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Appearance } from '../data/characters';
import { Animator, bakeSkin, cos, makeClip, restOffsets, sin, skinMeshes, type ClipSpec, type PoseFrame, type Rot } from '../engine/animation';
import { capsule, cone, cylinder, ellipsoid, gradient, lathe, prep, teardrop, torus, xf } from '../engine/geometry';
import { canvas } from '../engine/textures';

export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
] as const;
type BoneName = (typeof BONES)[number];

const REST: Record<BoneName, Rot> = {
  hips: [0, 0.56, 0],
  spine: [0, 0.06, 0],
  chest: [0, 0.15, 0],
  neck: [0, 0.17, 0],
  head: [0, 0.05, 0],
  armL: [0.165, 0.13, 0],
  foreL: [0, -0.17, 0],
  handL: [0, -0.15, 0],
  armR: [-0.165, 0.13, 0],
  foreR: [0, -0.17, 0],
  handR: [0, -0.15, 0],
  thighL: [0.085, -0.05, 0],
  shinL: [0, -0.22, 0],
  footL: [0, -0.21, 0],
  thighR: [-0.085, -0.05, 0],
  shinR: [0, -0.22, 0],
  footR: [0, -0.21, 0],
};
const PARENT: Record<BoneName, BoneName | null> = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  armL: 'chest', foreL: 'armL', handL: 'foreL', armR: 'chest', foreR: 'armR', handR: 'foreR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
};

/** Head sphere centre relative to the head bone. */
const HEAD_Y = 0.2;
const HEAD_R = 0.25;

// ---------------------------------------------------------------------------
// Clips (shared by every character: same proportions, identity rest rotations)

type Pose = Partial<Record<BoneName, Rot>>;
const P = (rot: Pose, hipsDy = 0, hipsDz = 0): PoseFrame => ({ rot, pos: { hips: [0, hipsDy, hipsDz] } });

function idle(p: number): PoseFrame {
  const b = sin(p);
  return P({
    spine: [0.02 * b, 0, 0],
    chest: [0.03 * b, 0, 0],
    head: [-0.03 * b, 0, 0.03 * sin(p, 1)],
    armL: [0.04 * b, 0, 0.1 + 0.03 * b],
    armR: [0.04 * b, 0, -0.1 - 0.03 * b],
    foreL: [-0.18, 0, 0],
    foreR: [-0.18, 0, 0],
  }, 0.006 * b);
}

function walk(p: number, run: number): PoseFrame {
  const s = sin(p);
  const c = cos(p);
  const amp = 0.55 + run * 0.35;
  const knee = (o: number) => Math.max(0, sin(p, o)) * (0.9 + run * 0.7);
  return P({
    hips: [0, 0.1 * s, 0],
    spine: [0.06 + run * 0.18, -0.12 * s, 0],
    chest: [0.02, -0.1 * s, 0],
    head: [-0.06 - run * 0.1, 0.12 * s, 0],
    thighL: [-amp * s - run * 0.1, 0, 0],
    thighR: [amp * s - run * 0.1, 0, 0],
    shinL: [knee(-Math.PI / 2) + 0.1, 0, 0],
    shinR: [knee(Math.PI / 2) + 0.1, 0, 0],
    footL: [-0.1 * s, 0, 0],
    footR: [0.1 * s, 0, 0],
    armL: [amp * 0.9 * s, 0, 0.12 + run * 0.1],
    armR: [-amp * 0.9 * s, 0, -0.12 - run * 0.1],
    foreL: [-0.3 - run * 0.9, 0, 0],
    foreR: [-0.3 - run * 0.9, 0, 0],
  }, -0.02 + 0.035 * Math.abs(c) * (1 + run), 0);
}

function crouch(p: number, moving: boolean): PoseFrame {
  const s = moving ? sin(p) : 0;
  return P({
    spine: [0.35, 0, 0],
    chest: [0.1, 0, 0],
    head: [-0.35, 0, 0],
    thighL: [-1.0 - 0.35 * s, 0, 0.08],
    thighR: [-1.0 + 0.35 * s, 0, -0.08],
    shinL: [1.5 + 0.2 * Math.max(0, s), 0, 0],
    shinR: [1.5 + 0.2 * Math.max(0, -s), 0, 0],
    footL: [-0.45, 0, 0],
    footR: [-0.45, 0, 0],
    armL: [-0.4 + 0.2 * s, 0, 0.25],
    armR: [-0.4 - 0.2 * s, 0, -0.25],
    foreL: [-0.9, 0, 0],
    foreR: [-0.9, 0, 0],
  }, -0.17 + 0.01 * Math.abs(s), -0.04);
}

const CLIPS = (): Record<string, ClipSpec> => {
  const bones = BONES as readonly string[];
  const rest = REST as Record<string, Rot>;
  const loop = (name: string, dur: number, fn: (p: number) => PoseFrame): ClipSpec => ({ clip: makeClip(name, dur, fn, bones, rest), loop: true });
  const once = (name: string, dur: number, fn: (p: number) => PoseFrame, n = 16): ClipSpec => ({ clip: makeClip(name, dur, fn, bones, rest, n, false), loop: false });
  return {
    idle: loop('idle', 3.2, idle),
    walk: loop('walk', 0.95, (p) => walk(p, 0)),
    run: loop('run', 0.62, (p) => walk(p, 1)),
    crouch: loop('crouch', 2, (p) => crouch(p, false)),
    sneak: loop('sneak', 1.2, (p) => crouch(p, true)),
    jump: loop('jump', 1, () => P({
      spine: [-0.1, 0, 0], thighL: [-0.9, 0, 0.05], shinL: [1.3, 0, 0], thighR: [-0.2, 0, -0.05], shinR: [0.5, 0, 0],
      armL: [-0.3, 0, 1.1], armR: [-0.3, 0, -1.1], foreL: [-0.4, 0, 0], foreR: [-0.4, 0, 0],
    }, 0.04)),
    fall: loop('fall', 0.8, (p) => P({
      spine: [0.05, 0, 0], thighL: [-0.5 + 0.1 * sin(p), 0, 0.1], shinL: [0.8, 0, 0], thighR: [-0.3 - 0.1 * sin(p), 0, -0.1], shinR: [0.6, 0, 0],
      armL: [-0.2, 0, 1.3 + 0.15 * sin(p)], armR: [-0.2, 0, -1.3 - 0.15 * sin(p)], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0], head: [0.15, 0, 0],
    })),
    land: once('land', 0.32, (p) => {
      const k = Math.sin(Math.PI * p);
      return P({
        spine: [0.4 * k, 0, 0], head: [-0.25 * k, 0, 0], thighL: [-1.0 * k, 0, 0.05], thighR: [-1.0 * k, 0, -0.05], shinL: [1.6 * k, 0, 0], shinR: [1.6 * k, 0, 0],
        footL: [-0.5 * k, 0, 0], footR: [-0.5 * k, 0, 0], armL: [-0.4 * k, 0, 0.5 * k], armR: [-0.4 * k, 0, -0.5 * k],
      }, -0.18 * k);
    }),
    swim: loop('swim', 1.3, (p) => P({
      hips: [1.25, 0, 0], spine: [-0.1, 0, 0], head: [-0.95, 0, 0],
      armL: [-2.2 + 0.9 * sin(p), 0, 0.6 + 0.6 * cos(p)], armR: [-2.2 + 0.9 * sin(p), 0, -0.6 - 0.6 * cos(p)],
      foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0],
      thighL: [0.35 * sin(p * 2), 0, 0.15], thighR: [-0.35 * sin(p * 2), 0, -0.15], shinL: [0.3, 0, 0], shinR: [0.3, 0, 0],
    }, -0.25)),
    tread: loop('tread', 1.6, (p) => P({
      spine: [0.1, 0, 0], armL: [-0.6, 0, 0.9 + 0.3 * sin(p)], armR: [-0.6, 0, -0.9 - 0.3 * sin(p)], foreL: [-0.4, 0, 0], foreR: [-0.4, 0, 0],
      thighL: [-0.4 + 0.3 * sin(p), 0, 0], thighR: [-0.4 - 0.3 * sin(p), 0, 0], shinL: [0.7, 0, 0], shinR: [0.7, 0, 0],
    }, -0.05)),
    glide: loop('glide', 1.2, (p) => P({
      hips: [0.9, 0, 0], head: [-0.75, 0, 0], armL: [0, 0, 1.45 + 0.05 * sin(p)], armR: [0, 0, -1.45 - 0.05 * sin(p)],
      thighL: [0.15, 0, 0.12], thighR: [0.15, 0, -0.12], shinL: [0.4, 0, 0], shinR: [0.4, 0, 0],
    })),
    wave: loop('wave', 1.6, (p) => {
      const base = idle(p);
      base.rot.armR = [-0.2, 0, -2.5];
      base.rot.foreR = [0, 0, -0.35 + 0.45 * sin(p * 2)];
      base.rot.head = [0, 0.1, 0.12];
      return base;
    }),
    talk: loop('talk', 2.4, (p) => {
      const base = idle(p);
      base.rot.armL = [-0.5 - 0.2 * sin(p * 2), 0, 0.3];
      base.rot.foreL = [-0.9, 0, 0];
      base.rot.head = [0.06 * sin(p * 2), 0.1 * sin(p), 0.05];
      return base;
    }),
    interact: once('interact', 0.7, (p) => {
      const k = Math.sin(Math.PI * p);
      return P({ spine: [0.2 * k, 0, 0], armR: [-1.4 * k, 0, -0.1], foreR: [-0.3 * k, 0, 0], armL: [0, 0, 0.12], head: [0.25 * k, 0, 0] });
    }),
    observe: once('observe', 1.2, (p) => {
      const k = Math.min(1, Math.sin(Math.PI * p) * 1.6);
      return P({ armR: [-2.6 * k, 0, -0.2], foreR: [-1.4 * k, 0, -0.4 * k], head: [-0.05, 0.25 * sin(p), 0], armL: [0, 0, 0.12] });
    }),
    resonate: once('resonate', 1.1, (p) => {
      const k = Math.sin(Math.PI * p);
      return P({ armL: [-1.5 * k, 0, 0.1], foreL: [-0.2 * k, 0, 0], armR: [-1.3 * k, 0, -0.1], foreR: [-0.4 * k, 0, 0], spine: [-0.1 * k, 0, 0] }, 0.02 * k);
    }),
    cheer: once('cheer', 1.0, (p) => {
      const k = Math.sin(Math.PI * p);
      return P({ armL: [0, 0, 2.6 * k], armR: [0, 0, -2.6 * k], spine: [-0.15 * k, 0, 0], head: [-0.2 * k, 0, 0], thighL: [-0.3 * k, 0, 0], shinL: [0.6 * k, 0, 0] }, 0.15 * k);
    }),
    sit: loop('sit', 3, (p) => P({
      thighL: [-1.5, 0, 0.1], thighR: [-1.5, 0, -0.1], shinL: [1.5, 0, 0], shinR: [1.5, 0, 0], spine: [0.05 + 0.02 * sin(p), 0, 0],
      armL: [-0.6, 0, 0.15], armR: [-0.6, 0, -0.15], foreL: [-0.6, 0, 0], foreR: [-0.6, 0, 0],
    }, -0.3)),
  };
};

let clipCache: Record<string, ClipSpec> | null = null;
function clips(): Record<string, ClipSpec> {
  return (clipCache ??= CLIPS());
}

// ---------------------------------------------------------------------------
// Materials and the painted face

const matCache = new Map<string, MeshStandardMaterial>();
export function mat(color: string, opts: { rough?: number; emissive?: string; ei?: number; vc?: boolean; metal?: number } = {}): MeshStandardMaterial {
  const key = `${color}|${opts.rough ?? 0.72}|${opts.emissive ?? ''}|${opts.ei ?? 0}|${opts.vc ? 1 : 0}|${opts.metal ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color: new Color(color),
      roughness: opts.rough ?? 0.72,
      metalness: opts.metal ?? 0,
      vertexColors: opts.vc ?? false,
      emissive: new Color(opts.emissive ?? '#000000'),
      emissiveIntensity: opts.ei ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

function shade(hex: string, l: number): string {
  const c = new Color(hex);
  c.offsetHSL(0, 0, l);
  return `#${c.getHexString()}`;
}

/** Paints the face onto an equirect strip: +Z (the front) is at u = 0.25. */
function paintFace(a: Appearance, blink: boolean): CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = a.skin;
  ctx.fillRect(0, 0, W, H);
  const fx = W * 0.25;
  const ey = H * 0.56;
  const dx = 30;
  const lash = '#2a1c22';
  // blush
  ctx.fillStyle = 'rgba(255,120,130,0.28)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(fx + s * 44, ey + 20, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const eyeW = a.face === 'bold' ? 13 : 14;
  const eyeH = a.face === 'sleepy' ? 14 : a.face === 'bold' ? 18 : 20;
  for (const s of [-1, 1]) {
    const x = fx + s * dx;
    if (blink) {
      ctx.strokeStyle = lash;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - eyeW, ey + 2);
      ctx.quadraticCurveTo(x, ey + 9, x + eyeW, ey + 2);
      ctx.stroke();
      continue;
    }
    // white
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, ey, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();
    // iris
    const g = ctx.createLinearGradient(0, ey - eyeH, 0, ey + eyeH);
    g.addColorStop(0, shade(a.eye, -0.18));
    g.addColorStop(1, shade(a.eye, 0.12));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x + s * 1, ey + 2, eyeW * 0.82, eyeH * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1220';
    ctx.beginPath();
    ctx.ellipse(x + s * 1, ey + 3, eyeW * 0.4, eyeH * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x - 4, ey - eyeH * 0.4, 4.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 5, ey + eyeH * 0.45, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // upper lid line
    ctx.strokeStyle = lash;
    ctx.lineWidth = a.face === 'gentle' ? 3.5 : 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const lidY = a.face === 'sleepy' ? ey - eyeH * 0.55 : ey - eyeH * 0.92;
    ctx.moveTo(x - eyeW - 2, lidY + 4);
    ctx.quadraticCurveTo(x, lidY - 5, x + eyeW + 3, lidY + (s > 0 ? 2 : 6));
    ctx.stroke();
    if (a.face === 'sleepy') {
      ctx.fillStyle = a.skin;
      ctx.fillRect(x - eyeW - 3, ey - eyeH - 4, eyeW * 2 + 6, eyeH * 0.42);
      ctx.beginPath();
      ctx.moveTo(x - eyeW - 2, ey - eyeH * 0.55);
      ctx.quadraticCurveTo(x, ey - eyeH * 0.8, x + eyeW + 3, ey - eyeH * 0.5);
      ctx.stroke();
    }
    // brows
    ctx.strokeStyle = shade(a.hairColor, -0.15);
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    const by = ey - eyeH - 12;
    if (a.face === 'bold') {
      ctx.moveTo(x - s * 12, by - 2);
      ctx.lineTo(x + s * 12, by + 4);
    } else {
      ctx.moveTo(x - 11, by + 2);
      ctx.quadraticCurveTo(x, by - 3, x + 11, by + 2);
    }
    ctx.stroke();
  }
  // mouth
  ctx.strokeStyle = '#7a3a3a';
  ctx.fillStyle = '#c8505a';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const my = ey + 30;
  ctx.beginPath();
  if (a.face === 'bright') {
    ctx.moveTo(fx - 9, my - 2);
    ctx.quadraticCurveTo(fx, my + 10, fx + 9, my - 2);
    ctx.closePath();
    ctx.fill();
  } else if (a.face === 'bold') {
    ctx.moveTo(fx - 8, my);
    ctx.quadraticCurveTo(fx + 2, my + 5, fx + 9, my - 3);
    ctx.stroke();
  } else {
    ctx.moveTo(fx - 6, my);
    ctx.quadraticCurveTo(fx, my + 5, fx + 6, my);
    ctx.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------
// Parts

interface Part {
  bone: BoneName;
  geo: BufferGeometry;
  mat: Material;
  shadow?: boolean;
}

function hairParts(a: Appearance): Part[] {
  const hm = mat('#ffffff', { rough: 0.5, vc: true });
  const top = shade(a.hairColor, 0.08);
  const bottom = shade(a.hairColor, -0.12);
  const hair = (g: BufferGeometry) => gradient(g, bottom, top);
  const H = (g: BufferGeometry, p: [number, number, number], r: [number, number, number] = [0, 0, 0], s?: [number, number, number] | number): Part => ({
    bone: 'head',
    geo: hair(xf(g, { s, r, p: [p[0], p[1] + HEAD_Y, p[2]] })),
    mat: hm,
  });
  const R = HEAD_R + 0.018;
  const parts: Part[] = [];
  // A cap over the top and the back of the head (the face stays clear).
  const cap = () => {
    parts.push(H(new SphereGeometry(R, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), [0, 0, 0]));
    parts.push(H(new SphereGeometry(R, 24, 16, Math.PI, Math.PI, 0, Math.PI * 0.74), [0, 0, 0]));
    // side locks over the ears' tops
    for (const s of [-1, 1]) parts.push(H(ellipsoid(0.07, 0.13, 0.09), [s * 0.215, -0.03, -0.01], [0, 0, s * 0.15]));
  };
  const bangs = (n: number, spread: number, len: number, tilt = 0.5) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      const ang = t * spread;
      parts.push(H(teardrop(0.06, len, 8, 2.2), [Math.sin(ang) * 0.2, 0.18, Math.cos(ang) * 0.17], [Math.PI - tilt, ang, t * -0.4]));
    }
  };
  switch (a.hair) {
    case 'spiky': {
      cap();
      bangs(5, 1.5, 0.17, 0.7);
      const spikes: [number, number, number, number][] = [
        [0, 0.26, -0.05, -0.5], [0.12, 0.22, -0.1, -0.8], [-0.12, 0.22, -0.1, -0.8], [0.18, 0.12, -0.15, -1.2],
        [-0.18, 0.12, -0.15, -1.2], [0, 0.16, -0.22, -1.5], [0.08, 0.05, -0.25, -1.9], [-0.08, 0.05, -0.25, -1.9],
      ];
      for (const [x, y, z, rx] of spikes) parts.push(H(cone(0.075, 0.22, 8), [x, y, z], [rx, 0, -x * 2.2]));
      parts.push(H(torus(0.05, 0.012, 6, 12, Math.PI * 1.4), [0.02, 0.31, 0.04], [0, 0.4, 0]));
      break;
    }
    case 'twintails': {
      cap();
      bangs(7, 1.7, 0.15, 0.35);
      for (const s of [-1, 1]) {
        parts.push(H(teardrop(0.11, 0.62, 12, 1.1), [s * 0.27, 0.13, -0.07], [Math.PI + 0.2, 0, s * 0.3]));
        parts.push({ bone: 'head', geo: prep(xf(torus(0.04, 0.02, 6, 12), { r: [0, Math.PI / 2, 0], p: [s * 0.25, HEAD_Y + 0.12, -0.05] }), a.outfitAccent), mat: mat('#ffffff', { vc: true, rough: 0.6 }) });
        for (const k of [-1, 1]) parts.push({ bone: 'head', geo: prep(xf(ellipsoid(0.045, 0.03, 0.02), { p: [s * 0.27, HEAD_Y + 0.14 + k * 0.035, -0.07] }), a.outfitAccent), mat: mat('#ffffff', { vc: true, rough: 0.6 }) });
      }
      break;
    }
    case 'messy': {
      cap();
      bangs(6, 1.6, 0.16, 0.55);
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        if (Math.cos(ang) > 0.55) continue;
        parts.push(H(ellipsoid(0.08, 0.07, 0.11), [Math.sin(ang) * 0.22, 0.12 + 0.03 * Math.sin(i * 2.3), Math.cos(ang) * 0.22], [0.3, ang, 0]));
      }
      parts.push(H(cone(0.05, 0.16, 7), [0.03, 0.29, 0.02], [-0.3, 0, -0.5]));
      break;
    }
    case 'long': {
      cap();
      bangs(5, 1.2, 0.18, 0.4);
      for (const s of [-1, 1]) parts.push(H(teardrop(0.07, 0.42, 10, 1), [s * 0.2, 0.04, 0.08], [Math.PI, 0, s * -0.12]));
      parts.push(H(ellipsoid(0.24, 0.32, 0.12), [0, -0.12, -0.17], [0.2, 0, 0]));
      parts.push(H(teardrop(0.09, 0.5, 12, 1.3), [0, -0.3, -0.24], [Math.PI + 0.25, 0, 0]));
      parts.push({ bone: 'head', geo: prep(xf(torus(0.05, 0.018, 6, 14), { r: [Math.PI / 2 + 0.25, 0, 0], p: [0, HEAD_Y - 0.3, -0.24] }), a.outfitAccent), mat: mat('#ffffff', { vc: true }) });
      break;
    }
    case 'bob': {
        parts.push(H(new SphereGeometry(R + 0.012, 28, 18, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI * 0.68), [0, 0, 0], [0, 0, 0], [1.06, 1, 1.04]));
      parts.push(H(new SphereGeometry(R, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), [0, 0, 0]));
      bangs(8, 1.6, 0.13, 0.25);
      break;
    }
  }
  return parts;
}


function outfitParts(a: Appearance): Part[] {
  const main = mat('#ffffff', { vc: true, rough: 0.78 });
  const solidPart = (bone: BoneName, g: BufferGeometry, color: string, m: Material = main): Part => ({ bone, geo: prep(g, color), mat: m });
  const parts: Part[] = [];
  const skin = a.skin;
  const mainC = a.outfitMain;
  const acc = a.outfitAccent;
  const dark = shade(mainC, -0.18);
  const boot = a.outfit === 'explorer' ? shade(acc, -0.05) : '#7a4a2e';

  // torso
  const torsoTop = a.outfit === 'explorer' ? acc : mainC;
  parts.push(solidPart('spine', xf(lathe([[0.125, -0.05], [0.14, 0.05], [0.15, 0.14], [0.14, 0.22], [0.1, 0.29], [0.04, 0.31]], 18), { s: [1, 1, 0.82] }), torsoTop));
  // neck + head + ears
  parts.push(solidPart('neck', xf(cylinder(0.045, 0.05, 0.1, 10), { p: [0, 0.02, 0] }), skin));
  // arms (sleeves) and hands
  for (const s of ['L', 'R'] as const) {
    const sx = s === 'L' ? 1 : -1;
    const sleeve = a.outfit === 'explorer' ? skin : mainC;
    parts.push(solidPart(`arm${s}`, xf(capsule(0.048, 0.11, 4, 10), { p: [0, -0.08, 0] }), sleeve));
    parts.push(solidPart(`arm${s}`, xf(ellipsoid(0.07, 0.06, 0.07), { p: [0, -0.005, 0] }), a.outfit === 'explorer' ? acc : mainC));
    const fore = a.outfit === 'mystic' ? xf(cylinder(0.055, 0.075, 0.13, 12), { p: [0, -0.08, 0] }) : xf(capsule(0.042, 0.1, 4, 10), { p: [0, -0.07, 0] });
    parts.push(solidPart(`fore${s}`, fore, a.outfit === 'explorer' ? skin : a.outfit === 'ranger' ? mainC : a.outfit === 'scout' ? mainC : mainC));
    parts.push(solidPart(`fore${s}`, xf(cylinder(0.05, 0.05, 0.035, 10), { p: [0, -0.13, 0] }), acc));
    parts.push(solidPart(`hand${s}`, xf(ellipsoid(0.045, 0.05, 0.04), { p: [0, -0.02, 0] }), skin));
    parts.push(solidPart(`hand${s}`, xf(ellipsoid(0.016, 0.03, 0.016), { p: [sx * -0.025, -0.01, 0.03], r: [0, 0, sx * 0.6] }), skin));
    // legs
    const legColor = a.outfit === 'scout' ? acc : a.outfit === 'mystic' ? dark : skin;
    parts.push(solidPart(`thigh${s}`, xf(capsule(0.058, 0.13, 4, 10), { p: [0, -0.1, 0] }), legColor));
    parts.push(solidPart(`shin${s}`, xf(capsule(0.05, 0.12, 4, 10), { p: [0, -0.09, 0] }), a.outfit === 'explorer' ? '#f4f0ea' : legColor));
    // boots
    parts.push(solidPart(`shin${s}`, xf(cylinder(0.062, 0.058, 0.1, 12), { p: [0, -0.17, 0] }), boot));
    parts.push(solidPart(`foot${s}`, xf(ellipsoid(0.065, 0.05, 0.1), { p: [0, -0.02, 0.03] }), boot));
    parts.push(solidPart(`foot${s}`, xf(ellipsoid(0.066, 0.018, 0.102), { p: [0, -0.055, 0.03] }), '#3a2a22'));
  }

  switch (a.outfit) {
    case 'ranger': {
      parts.push(solidPart('hips', xf(lathe([[0.14, -0.12], [0.15, -0.06], [0.14, 0.04], [0.13, 0.08]], 16), { s: [1, 1, 0.85] }), '#5b4636'));
      parts.push(solidPart('hips', xf(torus(0.14, 0.022, 6, 18), { r: [Math.PI / 2, 0, 0], p: [0, 0.06, 0], s: [1, 0.85, 1] }), '#3a2a20'));
      // white chest panel + collar
      parts.push(solidPart('spine', xf(ellipsoid(0.045, 0.12, 0.02), { p: [0, 0.13, 0.118] }), acc));
      for (const s of [-1, 1]) parts.push(solidPart('spine', xf(ellipsoid(0.012, 0.012, 0.01), { p: [s * 0.075, 0.15, 0.12] }), '#f2c35a'));
      parts.push(solidPart('chest', xf(torus(0.09, 0.03, 8, 16), { r: [Math.PI / 2 + 0.25, 0, 0], p: [0, 0.14, -0.01] }), acc));
      // hood bunched at the back
      parts.push(solidPart('chest', xf(ellipsoid(0.12, 0.07, 0.07), { p: [0, 0.13, -0.11] }), dark));
      break;
    }
    case 'explorer': {
      // pleated skirt
      const pleats: [number, number][] = [];
      for (let i = 0; i <= 6; i++) pleats.push([0.13 + i * 0.022, 0.06 - i * 0.035]);
      const skirt = lathe(pleats.reverse(), 24);
      const pos = skirt.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const ang = Math.atan2(pos.getZ(i), pos.getX(i));
        const k = 1 + 0.06 * Math.sin(ang * 12) * Math.max(0, 0.06 - pos.getY(i)) * 6;
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i), pos.getZ(i) * k * 0.9);
      }
      skirt.computeVertexNormals();
      parts.push(solidPart('hips', skirt, mainC));
      parts.push(solidPart('hips', xf(torus(0.135, 0.02, 6, 18), { r: [Math.PI / 2, 0, 0], p: [0, 0.06, 0], s: [1, 0.85, 1] }), shade(mainC, -0.3)));
      // short cape over the shoulders
      const cape = new SphereGeometry(0.21, 20, 10, Math.PI * 0.95, Math.PI * 1.1, Math.PI * 0.3, Math.PI * 0.32);
      parts.push(solidPart('chest', xf(cape, { p: [0, 0.07, -0.01], s: [1, 1.1, 0.9] }), mainC));
      parts.push(solidPart('chest', xf(ellipsoid(0.035, 0.035, 0.02), { p: [0, 0.12, 0.125] }), '#f2c35a'));
      break;
    }
    case 'scout': {
      parts.push(solidPart('hips', xf(lathe([[0.14, -0.08], [0.15, -0.03], [0.14, 0.05], [0.13, 0.08]], 16), { s: [1, 1, 0.85] }), acc));
      // hoodie hem + pocket + hood
      parts.push(solidPart('spine', xf(torus(0.135, 0.025, 6, 18), { r: [Math.PI / 2, 0, 0], p: [0, -0.04, 0], s: [1, 0.82, 1] }), dark));
      parts.push(solidPart('spine', xf(ellipsoid(0.08, 0.045, 0.03), { p: [0, 0.03, 0.115] }), dark));
      parts.push(solidPart('chest', xf(ellipsoid(0.14, 0.1, 0.09), { p: [0, 0.12, -0.11] }), mainC));
      for (const s of [-1, 1]) parts.push(solidPart('chest', xf(cylinder(0.006, 0.006, 0.1, 5), { p: [s * 0.035, 0.07, 0.125] }), '#f4f0ea'));
      break;
    }
    case 'mystic': {
      parts.push(solidPart('hips', xf(lathe([[0.135, 0.06], [0.17, -0.06], [0.21, -0.2], [0.24, -0.33], [0.23, -0.35]], 22), { s: [1, 1, 0.9] }), mainC));
      parts.push(solidPart('hips', xf(torus(0.14, 0.03, 8, 18), { r: [Math.PI / 2, 0, 0], p: [0, 0.06, 0], s: [1, 0.86, 1] }), acc));
      parts.push(solidPart('hips', xf(teardrop(0.04, 0.22, 8), { r: [Math.PI, 0, -0.2], p: [0.08, 0.04, 0.11] }), acc));
      parts.push(solidPart('chest', xf(torus(0.095, 0.03, 8, 16), { r: [Math.PI / 2 + 0.2, 0, 0], p: [0, 0.14, -0.005] }), shade(mainC, -0.15)));
      parts.push(solidPart('spine', xf(cylinder(0.012, 0.012, 0.22, 5), { p: [0, 0.1, 0.122] }), '#f2c35a'));
      break;
    }
  }
  return parts;
}

function accessoryParts(a: Appearance): Part[] {
  const m = mat('#ffffff', { vc: true, rough: 0.7 });
  const parts: Part[] = [];
  const P2 = (bone: BoneName, g: BufferGeometry, c: string): Part => ({ bone, geo: prep(g, c), mat: m });
  for (const acc of a.accessories) {
    switch (acc) {
      case 'scarf': {
        const c = a.outfit === 'ranger' ? '#f2c35a' : a.outfitAccent === '#e6e2d8' ? '#d8423a' : a.outfitAccent;
        parts.push(P2('chest', xf(torus(0.1, 0.04, 8, 18), { r: [Math.PI / 2 + 0.15, 0, 0], p: [0, 0.18, 0] }), c));
        parts.push(P2('chest', xf(teardrop(0.045, 0.24, 8, 1), { r: [Math.PI - 0.35, 0, 0.15], p: [0.06, 0.16, -0.1] }), c));
        parts.push(P2('chest', xf(teardrop(0.04, 0.2, 8, 1), { r: [Math.PI - 0.45, 0, -0.1], p: [0.02, 0.16, -0.11] }), shade(c, -0.08)));
        break;
      }
      case 'backpack': {
        const bag = new RoundedBoxGeometry(0.24, 0.26, 0.13, 3, 0.05);
        parts.push(P2('chest', xf(bag, { p: [0, 0.02, -0.17] }), '#b5763c'));
        parts.push(P2('chest', xf(new RoundedBoxGeometry(0.17, 0.1, 0.05, 2, 0.02), { p: [0, -0.04, -0.245] }), '#8f5a2a'));
        parts.push(P2('chest', xf(cylinder(0.055, 0.055, 0.28, 12), { r: [0, 0, Math.PI / 2], p: [0, 0.17, -0.17] }), '#4f8a5a'));
        for (const s of [-1, 1]) parts.push(P2('chest', xf(torus(0.09, 0.012, 5, 14, Math.PI), { r: [0, Math.PI / 2, 0], p: [s * 0.09, 0.08, -0.03] }), '#5a3a22'));
        break;
      }
      case 'clip': {
        const star = new SphereGeometry(0.035, 8, 6);
        const pos = star.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const ang = Math.atan2(pos.getY(i), pos.getX(i));
          const k = 0.75 + 0.45 * Math.max(0, Math.cos(ang * 5));
          pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * 0.5);
        }
        star.computeVertexNormals();
        parts.push({ bone: 'head', geo: prep(xf(star, { r: [0, 0.9, 0], p: [0.2, HEAD_Y + 0.14, 0.1] }), '#ffd75a'), mat: mat('#ffffff', { vc: true, emissive: '#ffb020', ei: 0.25 }) });
        break;
      }
      case 'goggles': {
        for (const s of [-1, 1]) {
          parts.push(P2('head', xf(torus(0.05, 0.016, 8, 16), { r: [-0.35, 0, 0], p: [s * 0.065, HEAD_Y + 0.17, 0.2] }), '#7a5a3a'));
          parts.push({ bone: 'head', geo: prep(xf(ellipsoid(0.045, 0.045, 0.015), { r: [-0.35, 0, 0], p: [s * 0.065, HEAD_Y + 0.17, 0.205] }), '#8fe0ff'), mat: mat('#ffffff', { vc: true, rough: 0.15, metal: 0.2 }) });
        }
        parts.push(P2('head', xf(torus(HEAD_R + 0.02, 0.012, 5, 30), { r: [Math.PI / 2 - 0.35, 0, 0], p: [0, HEAD_Y + 0.1, -0.02] }), '#4a3424'));
        break;
      }
      case 'satchel': {
        parts.push(P2('chest', xf(torus(0.17, 0.012, 5, 24), { r: [0, Math.PI / 2, 0.65], p: [0, -0.03, 0], s: [1, 1.15, 0.8] }), '#6a4428'));
        parts.push(P2('hips', xf(new RoundedBoxGeometry(0.15, 0.12, 0.06, 2, 0.025), { r: [0, -0.4, 0], p: [-0.16, 0.02, 0.04] }), '#c08850'));
        parts.push(P2('hips', xf(new RoundedBoxGeometry(0.15, 0.06, 0.065, 2, 0.02), { r: [0, -0.4, 0], p: [-0.16, 0.06, 0.04] }), '#9a6838'));
        break;
      }
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------

const OFFSETS = restOffsets(REST as Record<string, Rot>, PARENT as Record<string, string | null>);

export class CharacterModel {
  readonly root = new Group();
  readonly bones: Record<BoneName, Bone>;
  readonly animator: Animator;
  appearance: Appearance;
  private parts: SkinnedMesh[] = [];
  private faceOpen: CanvasTexture | null = null;
  private faceBlink: CanvasTexture | null = null;
  private blinkTimer = 2 + Math.random() * 3;
  private faceMat = new MeshStandardMaterial({ roughness: 0.62 });
  /** When false the body is hidden (first-person) but still casts shadows. */
  private bodyVisible = true;
  private castShadow: boolean;

  constructor(appearance: Appearance, castShadow = true) {
    this.appearance = appearance;
    this.castShadow = castShadow;
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
    this.build();
    this.animator = new Animator(this.root, clips());
    this.animator.play('idle', 0);
  }

  private build(): void {
    for (const m of this.parts) {
      m.removeFromParent();
      m.geometry.dispose();
      m.skeleton.dispose();
    }
    this.parts = [];
    const a = this.appearance;
    this.faceOpen?.dispose();
    this.faceBlink?.dispose();
    this.faceOpen = paintFace(a, false);
    this.faceBlink = paintFace(a, true);
    this.faceMat.map = this.faceOpen;
    this.faceMat.needsUpdate = true;
    const all = [...outfitParts(a), ...hairParts(a), ...accessoryParts(a)];
    // head (painted face) and ears
    const head = new SphereGeometry(HEAD_R, 40, 28);
    head.scale(1, 0.94, 0.96);
    head.translate(0, HEAD_Y, 0);
    all.push({ bone: 'head', geo: head, mat: this.faceMat });
    for (const s of [-1, 1]) all.push({ bone: 'head', geo: prep(xf(ellipsoid(0.04, 0.055, 0.03), { p: [s * 0.245, HEAD_Y - 0.01, 0.0] }), a.skin), mat: mat('#ffffff', { vc: true }) });
    const batches = bakeSkin(all.map((p) => ({ bone: p.bone, geo: p.geo, mat: p.mat, cast: this.castShadow })), BONES as unknown as string[], OFFSETS);
    this.parts = skinMeshes(this.root, BONES.map((n) => this.bones[n]), OFFSETS, batches);
    this.applyVisibility();
  }

  setAppearance(a: Appearance): void {
    this.appearance = structuredClone(a);
    this.build();
  }

  /** First-person hides the body from the camera but keeps its shadow. */
  setBodyVisible(visible: boolean): void {
    this.bodyVisible = visible;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    // Layer 1 is rendered only by the shadow pass (first person).
    for (const m of this.parts) {
      if (this.bodyVisible) m.layers.set(0);
      else m.layers.set(1);
    }
  }

  update(dt: number): void {
    this.animator.update(dt);
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      if (this.faceMat.map === this.faceOpen) {
        this.faceMat.map = this.faceBlink;
        this.blinkTimer = 0.12;
      } else {
        this.faceMat.map = this.faceOpen;
        this.blinkTimer = 2.2 + Math.random() * 3.5;
      }
    }
  }

  /** A bone, for attaching effects. */
  bone(name: BoneName): Object3D {
    return this.bones[name];
  }

  dispose(): void {
    this.animator.dispose();
    for (const m of this.parts) {
      m.geometry.dispose();
      m.skeleton.dispose();
    }
    this.faceOpen?.dispose();
    this.faceBlink?.dispose();
    this.faceMat.dispose();
    this.root.removeFromParent();
  }
}
