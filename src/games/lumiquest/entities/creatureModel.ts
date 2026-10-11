// Original creature models. Each species is sculpted from rounded primitives
// onto its own bone rig (body, head, ears, tail chain, legs, wings or fins),
// merged per bone and material to keep draw calls low, and animated with
// gait-specific clips through AnimationMixer. Variants recolour the palette.

import {
  Bone,
  Color,
  Group,
  Vector3,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  DoubleSide,
  type BufferGeometry,
  type Material,
} from 'three';
import { paletteFor, SPECIES_BY_ID, type Palette, type SpeciesDef, type SpeciesId } from '../data/species';
import { Animator, bakeSkin, cos, makeClip, restOffsets, sin, skinMeshes, type ClipSpec, type PoseFrame, type Rot, type SkinnedBatch } from '../engine/animation';
import { capsule, cone, ellipsoid, lumpy, prep, teardrop, torus, xf, cylinder } from '../engine/geometry';
import { eyeTexture } from '../engine/textures';

type MatKey = 'base' | 'glow' | 'fin' | 'eye' | 'gloss';

interface Piece {
  bone: string;
  geo: BufferGeometry;
  mat: MatKey;
}

interface Rig {
  bones: Record<string, [number, number, number]>;
  parents: Record<string, string | null>;
  pieces: Piece[];
}

const shade = (hex: string, l: number, s = 0): string => {
  const c = new Color(hex);
  c.offsetHSL(0, s, l);
  return `#${c.getHexString()}`;
};

/** Adds the two big glossy eyes every creature shares. */
function eyes(r: Rig, x: number, y: number, z: number, size: number, yaw = 0.42): void {
  for (const s of [-1, 1]) {
    const g = new SphereGeometry(size, 20, 14);
    g.scale(1, 1.18, 0.62);
    g.rotateY(s * yaw);
    g.translate(s * x, y, z);
    r.pieces.push({ bone: 'head', geo: g, mat: 'eye' });
  }
}

const p = (bone: string, geo: BufferGeometry, color: string, mat: MatKey = 'base'): Piece => ({ bone, geo: mat === 'eye' ? geo : prep(geo, color), mat });

function legs(r: Rig, color: string, paw: string, spread: number, front: number, back: number, len: number, thick: number): void {
  const L: [string, number, number][] = [['legFL', spread, front], ['legFR', -spread, front], ['legBL', spread, back], ['legBR', -spread, back]];
  for (const [name, x, z] of L) {
    r.bones[name] = [x, -0.02, z];
    r.parents[name] = 'body';
    r.pieces.push(p(name, xf(capsule(thick, len, 4, 10), { p: [0, -len / 2 - thick * 0.4, 0] }), color));
    r.pieces.push(p(name, xf(ellipsoid(thick * 1.25, thick * 0.85, thick * 1.45), { p: [0, -len - thick * 0.75, thick * 0.35] }), paw));
  }
}

function tailChain(r: Rig, from: [number, number, number], seg: number, n: number, dir: [number, number] = [0.6, -1]): void {
  let parent = 'body';
  for (let i = 1; i <= n; i++) {
    const name = `tail${i}`;
    r.bones[name] = i === 1 ? from : [0, seg * dir[0], seg * dir[1]];
    r.parents[name] = parent;
    parent = name;
  }
}

// ---------------------------------------------------------------------------

function flamkit(pal: Palette): Rig {
  const r: Rig = { bones: { body: [0, 0.34, 0], head: [0, 0.14, 0.17] }, parents: { body: null, head: 'body' }, pieces: [] };
  const B = pal.body;
  r.pieces.push(p('body', ellipsoid(0.16, 0.15, 0.22), B));
  r.pieces.push(p('body', xf(ellipsoid(0.11, 0.11, 0.15), { p: [0, -0.04, 0.06] }), pal.belly));
  r.pieces.push(p('body', xf(ellipsoid(0.12, 0.08, 0.06), { p: [0, 0.06, 0.15] }), pal.belly));
  // head
  r.pieces.push(p('head', xf(ellipsoid(0.2, 0.18, 0.18), { p: [0, 0.1, 0.02] }), B));
  r.pieces.push(p('head', xf(ellipsoid(0.09, 0.065, 0.1), { p: [0, 0.035, 0.15] }), pal.belly));
  r.pieces.push(p('head', xf(ellipsoid(0.025, 0.02, 0.018), { p: [0, 0.065, 0.245] }), '#2a1a18'));
  for (const s of [-1, 1]) {
    r.pieces.push(p('head', xf(teardrop(0.07, 0.15, 10), { r: [Math.PI / 2, 0, s * -1.25], p: [s * 0.15, 0.03, 0.04] }), pal.belly));
    // ears
    r.bones[s > 0 ? 'earL' : 'earR'] = [s * 0.11, 0.24, -0.01];
    r.parents[s > 0 ? 'earL' : 'earR'] = 'head';
    const ear = s > 0 ? 'earL' : 'earR';
    r.pieces.push(p(ear, xf(teardrop(0.09, 0.24, 12, 1.4), { s: [1, 1, 0.55], r: [0, 0, s * -0.35] }), B));
    r.pieces.push(p(ear, xf(teardrop(0.055, 0.17, 10, 1.4), { s: [1, 1, 0.4], r: [0, 0, s * -0.35], p: [s * 0.004, 0.02, 0.022] }), pal.belly));
    r.pieces.push(p(ear, xf(teardrop(0.04, 0.09, 8, 1.4), { s: [1, 1, 0.6], r: [0, 0, s * -0.35], p: [s * 0.05, 0.15, 0.0] }), pal.glow, 'glow'));
    // ember markings
    r.pieces.push(p('head', xf(ellipsoid(0.03, 0.012, 0.02), { r: [0, 0, s * 0.5], p: [s * 0.06, 0.2, 0.15] }), pal.glow, 'glow'));
    r.pieces.push(p('body', xf(ellipsoid(0.035, 0.012, 0.06), { r: [0, s * 0.4, 0], p: [s * 0.08, 0.12, -0.05] }), pal.glow, 'glow'));
  }
  eyes(r, 0.085, 0.11, 0.155, 0.052);
  legs(r, B, shade(B, -0.2), 0.08, 0.1, -0.12, 0.14, 0.042);
  tailChain(r, [0, 0.04, -0.2], 0.12, 3, [0.5, -0.85]);
  r.pieces.push(p('tail1', xf(teardrop(0.09, 0.2, 12, 1), { r: [-Math.PI / 2 - 0.5, 0, 0] }), B));
  r.pieces.push(p('tail2', xf(teardrop(0.12, 0.26, 12, 1), { r: [-Math.PI / 2 - 0.9, 0, 0] }), B));
  r.pieces.push(p('tail3', xf(teardrop(0.1, 0.24, 12, 1.4), { r: [-0.6, 0, 0], p: [0, 0.02, -0.02] }), pal.accent, 'glow'));
  r.pieces.push(p('tail3', xf(teardrop(0.06, 0.2, 10, 1.6), { r: [-0.45, 0, 0], p: [0, 0.08, -0.02] }), '#fff3c0', 'glow'));
  return r;
}

function aquoray(pal: Palette): Rig {
  const r: Rig = { bones: { body: [0, 0.3, 0], head: [0, 0.06, 0.16] }, parents: { body: null, head: 'body' }, pieces: [] };
  const B = pal.body;
  r.pieces.push(p('body', ellipsoid(0.17, 0.14, 0.24), B));
  r.pieces.push(p('body', xf(ellipsoid(0.13, 0.09, 0.2), { p: [0, -0.05, 0.02] }), pal.belly));
  r.pieces.push(p('head', xf(ellipsoid(0.21, 0.18, 0.19), { p: [0, 0.07, 0.04] }), B));
  r.pieces.push(p('head', xf(ellipsoid(0.13, 0.07, 0.1), { p: [0, -0.02, 0.13] }), pal.belly));
  // spots
  for (let i = 0; i < 5; i++) r.pieces.push(p('body', xf(ellipsoid(0.025, 0.012, 0.025), { p: [(i % 2 ? 1 : -1) * (0.05 + i * 0.012), 0.13, 0.08 - i * 0.07] }), pal.accent, 'glow'));
  for (const s of [-1, 1]) {
    // gill frills (axolotl-like, translucent)
    for (let k = 0; k < 3; k++) r.pieces.push(p('head', xf(teardrop(0.05, 0.18, 8, 1.2), { s: [1, 1, 0.35], r: [0, s * 0.3, s * (-1.0 - k * 0.45)], p: [s * 0.17, 0.12 - k * 0.05, -0.02] }), pal.accent, 'fin'));
    r.bones[s > 0 ? 'finL' : 'finR'] = [s * 0.14, 0.0, 0.02];
    r.parents[s > 0 ? 'finL' : 'finR'] = 'body';
    r.pieces.push(p(s > 0 ? 'finL' : 'finR', xf(teardrop(0.15, 0.34, 14, 1.2), { s: [1, 1, 0.22], r: [Math.PI / 2, 0, s * -1.35], p: [0, 0, -0.02] }), pal.accent, 'fin'));
  }
  // dorsal fin
  r.pieces.push(p('body', xf(teardrop(0.08, 0.2, 10, 1.4), { s: [0.3, 1, 1], r: [-0.9, 0, 0], p: [0, 0.12, -0.02] }), pal.accent, 'fin'));
  eyes(r, 0.1, 0.09, 0.17, 0.05, 0.5);
  // little front paws
  for (const s of [-1, 1]) r.pieces.push(p('body', xf(ellipsoid(0.04, 0.035, 0.05), { p: [s * 0.1, -0.12, 0.12] }), shade(B, -0.08)));
  tailChain(r, [0, 0.0, -0.22], 0.13, 3, [0.05, -1]);
  r.pieces.push(p('tail1', xf(teardrop(0.1, 0.2, 12, 1), { r: [-Math.PI / 2, 0, 0] }), B));
  r.pieces.push(p('tail2', xf(teardrop(0.07, 0.18, 12, 1), { r: [-Math.PI / 2, 0, 0] }), B));
  r.pieces.push(p('tail3', xf(teardrop(0.16, 0.26, 14, 1.2), { s: [0.22, 1, 1], r: [-Math.PI / 2, 0, 0], p: [0, 0, 0] }), pal.accent, 'fin'));
  return r;
}

function terrabun(pal: Palette): Rig {
  const r: Rig = { bones: { body: [0, 0.27, 0], head: [0, 0.16, 0.1] }, parents: { body: null, head: 'body' }, pieces: [] };
  const B = pal.body;
  r.pieces.push(p('body', xf(ellipsoid(0.2, 0.18, 0.22), { p: [0, 0, -0.02] }), B));
  r.pieces.push(p('body', xf(ellipsoid(0.14, 0.13, 0.12), { p: [0, -0.03, 0.1] }), pal.belly));
  r.pieces.push(p('head', xf(ellipsoid(0.19, 0.17, 0.17), { p: [0, 0.08, 0.03] }), B));
  r.pieces.push(p('head', xf(ellipsoid(0.12, 0.08, 0.08), { p: [0, 0.02, 0.13] }), pal.belly));
  r.pieces.push(p('head', xf(ellipsoid(0.022, 0.016, 0.014), { p: [0, 0.055, 0.21] }), '#e07a8a'));
  for (const s of [-1, 1]) {
    const ear = s > 0 ? 'earL' : 'earR';
    r.bones[ear] = [s * 0.08, 0.22, -0.02];
    r.parents[ear] = 'head';
    // leafy, mossy ears
    r.pieces.push(p(ear, xf(teardrop(0.075, 0.32, 14, 1.0), { s: [1, 1, 0.42], r: [-0.2, 0, s * -0.25] }), pal.accent));
    r.pieces.push(p(ear, xf(teardrop(0.045, 0.24, 10, 1.0), { s: [1, 1, 0.3], r: [-0.2, 0, s * -0.25], p: [s * 0.003, 0.03, 0.02] }), shade(pal.accent, 0.18)));
    r.pieces.push(p(ear, xf(cylinder(0.004, 0.004, 0.24, 4), { r: [-0.2, 0, s * -0.25], p: [s * 0.03, 0.14, 0.026] }), shade(pal.accent, -0.15)));
    // cheek blush
    r.pieces.push(p('head', xf(ellipsoid(0.03, 0.018, 0.01), { p: [s * 0.12, 0.03, 0.14], r: [0, s * 0.6, 0] }), '#ff9aa8'));
  }
  // moss patch + crystals on the back
  r.pieces.push(p('body', lumpy(xf(ellipsoid(0.15, 0.06, 0.16), { p: [0, 0.14, -0.05] }), 0.02, 18, 3), pal.accent));
  const crystals: [number, number, number, number, number][] = [[0, 0.2, -0.05, 0, 0.09], [0.06, 0.17, -0.1, 0.4, 0.065], [-0.06, 0.17, -0.1, -0.4, 0.07], [0.02, 0.16, 0.03, 0.2, 0.05]];
  for (const [x, y, z, rz, s] of crystals) r.pieces.push(p('body', xf(new OctahedronGeometry(1, 0), { s: [s * 0.45, s, s * 0.45], r: [0, 0.4, rz], p: [x, y, z] }), pal.glow, 'gloss'));
  eyes(r, 0.08, 0.1, 0.14, 0.048);
  legs(r, B, shade(pal.belly, -0.05), 0.1, 0.1, -0.1, 0.07, 0.05);
  tailChain(r, [0, 0.0, -0.22], 0.05, 1);
  r.pieces.push(p('tail1', lumpy(ellipsoid(0.07, 0.07, 0.06), 0.012, 30, 9), pal.belly));
  return r;
}

function zephyra(pal: Palette): Rig {
  const r: Rig = { bones: { body: [0, 0.42, 0], head: [0, 0.14, 0.15] }, parents: { body: null, head: 'body' }, pieces: [] };
  const B = pal.body;
  r.pieces.push(p('body', ellipsoid(0.14, 0.13, 0.19), B));
  r.pieces.push(p('body', lumpy(xf(ellipsoid(0.12, 0.1, 0.08), { p: [0, 0.04, 0.12] }), 0.015, 25, 2), pal.belly));
  r.pieces.push(p('head', xf(ellipsoid(0.18, 0.165, 0.16), { p: [0, 0.09, 0.02] }), B));
  r.pieces.push(p('head', xf(ellipsoid(0.08, 0.055, 0.08), { p: [0, 0.03, 0.13] }), pal.belly));
  r.pieces.push(p('head', xf(ellipsoid(0.02, 0.016, 0.014), { p: [0, 0.055, 0.215] }), '#3a3044'));
  // head tuft
  for (let k = 0; k < 3; k++) r.pieces.push(p('head', xf(teardrop(0.035, 0.14, 8, 1.4), { r: [-0.6 - k * 0.25, 0, (k - 1) * 0.35], p: [(k - 1) * 0.02, 0.24, 0.0] }), pal.accent));
  for (const s of [-1, 1]) {
    const ear = s > 0 ? 'earL' : 'earR';
    r.bones[ear] = [s * 0.1, 0.2, -0.02];
    r.parents[ear] = 'head';
    r.pieces.push(p(ear, xf(teardrop(0.07, 0.22, 12, 1.5), { s: [1, 1, 0.5], r: [-0.25, 0, s * -0.55] }), B));
    r.pieces.push(p(ear, xf(teardrop(0.035, 0.09, 8, 1.5), { s: [1, 1, 0.6], r: [-0.25, 0, s * -0.55], p: [s * 0.075, 0.12, -0.03] }), pal.accent));
    const wing = s > 0 ? 'wingL' : 'wingR';
    r.bones[wing] = [s * 0.11, 0.08, 0.0];
    r.parents[wing] = 'body';
    for (let k = 0; k < 5; k++) {
      const len = 0.34 - k * 0.04;
      const col = k < 2 ? pal.accent : B;
      r.pieces.push(p(wing, xf(teardrop(0.055, len, 10, 1.3), { s: [1, 1, 0.25], r: [0.1 + k * 0.32, 0, s * -1.25], p: [0, 0, 0] }), col));
    }
    r.pieces.push(p('head', xf(ellipsoid(0.026, 0.015, 0.01), { p: [s * 0.11, 0.03, 0.135], r: [0, s * 0.6, 0] }), '#ff9ab0'));
  }
  eyes(r, 0.075, 0.1, 0.14, 0.046);
  legs(r, B, pal.accent, 0.06, 0.06, -0.08, 0.1, 0.03);
  tailChain(r, [0, 0.04, -0.17], 0.1, 3, [0.3, -1]);
  r.pieces.push(p('tail1', xf(teardrop(0.07, 0.18, 10, 1), { r: [-Math.PI / 2 - 0.3, 0, 0] }), B));
  r.pieces.push(p('tail2', xf(teardrop(0.09, 0.2, 10, 1), { r: [-Math.PI / 2 - 0.3, 0, 0] }), B));
  r.pieces.push(p('tail3', xf(teardrop(0.08, 0.2, 10, 1.3), { r: [-Math.PI / 2 - 0.1, 0, 0] }), pal.accent));
  return r;
}

function lumelle(pal: Palette): Rig {
  const r: Rig = { bones: { body: [0, 0.48, 0], head: [0, 0.13, 0.1] }, parents: { body: null, head: 'body' }, pieces: [] };
  const B = pal.body;
  r.pieces.push(p('body', lumpy(ellipsoid(0.15, 0.17, 0.15), 0.02, 14, 5), B));
  r.pieces.push(p('body', lumpy(xf(ellipsoid(0.17, 0.08, 0.15), { p: [0, 0.1, 0.02] }), 0.03, 18, 6), pal.belly));
  r.pieces.push(p('head', xf(lumpy(ellipsoid(0.17, 0.155, 0.15), 0.012, 20, 7), { p: [0, 0.08, 0.03] }), B));
  for (const s of [-1, 1]) {
    // antennae with glowing bulbs
    const ant = s > 0 ? 'earL' : 'earR';
    r.bones[ant] = [s * 0.06, 0.2, 0.05];
    r.parents[ant] = 'head';
    r.pieces.push(p(ant, xf(torus(0.1, 0.008, 4, 12, Math.PI * 0.55), { r: [0, Math.PI / 2, 0], p: [s * 0.0, 0.0, -0.1] }), shade(B, -0.3)));
    r.pieces.push(p(ant, xf(ellipsoid(0.03, 0.03, 0.03), { p: [0, 0.1, 0.0] }), pal.glow, 'glow'));
    // four soft wings
    const wing = s > 0 ? 'wingL' : 'wingR';
    r.bones[wing] = [s * 0.08, 0.08, -0.08];
    r.parents[wing] = 'body';
    r.pieces.push(p(wing, xf(teardrop(0.17, 0.36, 16, 0.7), { s: [1, 1, 0.12], r: [-0.35, 0.3 * s, s * -1.15] }), pal.accent, 'fin'));
    r.pieces.push(p(wing, xf(teardrop(0.12, 0.25, 14, 0.7), { s: [1, 1, 0.12], r: [-1.2, 0.2 * s, s * -1.6], p: [0, -0.04, 0] }), pal.accent, 'fin'));
    r.pieces.push(p(wing, xf(ellipsoid(0.035, 0.035, 0.01), { r: [0, 0, 0], p: [s * 0.24, 0.14, -0.02] }), pal.glow, 'glow'));
    r.pieces.push(p('head', xf(ellipsoid(0.025, 0.014, 0.01), { p: [s * 0.11, 0.03, 0.14], r: [0, s * 0.6, 0] }), '#ffaac0'));
  }
  eyes(r, 0.075, 0.09, 0.14, 0.05);
  legs(r, shade(B, -0.1), shade(B, -0.1), 0.05, 0.05, -0.04, 0.06, 0.022);
  tailChain(r, [0, -0.08, -0.12], 0.08, 1);
  r.pieces.push(p('tail1', lumpy(xf(ellipsoid(0.1, 0.12, 0.1), { p: [0, -0.04, -0.02] }), 0.012, 20, 4), shade(B, 0.04)));
  return r;
}

function thornlade(pal: Palette): Rig {
  const r: Rig = { bones: { body: [0, 0.33, 0], head: [0, 0.12, 0.18] }, parents: { body: null, head: 'body' }, pieces: [] };
  const B = pal.body;
  r.pieces.push(p('body', ellipsoid(0.17, 0.15, 0.22), B));
  r.pieces.push(p('body', xf(ellipsoid(0.12, 0.1, 0.15), { p: [0, -0.05, 0.05] }), pal.belly));
  // leaf blades along the back
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const side = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : -1;
    r.pieces.push(p('body', xf(teardrop(0.06, 0.24 - t * 0.06, 10, 1.6), { s: [1, 1, 0.3], r: [-1.0 - t * 0.6, side * 0.4, side * -0.5], p: [side * 0.07, 0.11, 0.1 - t * 0.28] }), i % 2 ? pal.accent : shade(B, 0.06)));
  }
  r.pieces.push(p('head', xf(ellipsoid(0.17, 0.155, 0.16), { p: [0, 0.08, 0.02] }), B));
  r.pieces.push(p('head', xf(ellipsoid(0.08, 0.06, 0.08), { p: [0, 0.02, 0.13] }), pal.belly));
  r.pieces.push(p('head', xf(ellipsoid(0.02, 0.016, 0.014), { p: [0, 0.045, 0.21] }), '#2f2420'));
  // blossom crown
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    r.pieces.push(p('head', xf(ellipsoid(0.04, 0.012, 0.025), { r: [0, a, 0], p: [Math.cos(a) * 0.035, 0.235, 0.05 + Math.sin(a) * 0.035] }), pal.glow, 'glow'));
  }
  r.pieces.push(p('head', xf(ellipsoid(0.02, 0.015, 0.02), { p: [0, 0.245, 0.05] }), '#ffe46a'));
  for (const s of [-1, 1]) {
    const ear = s > 0 ? 'earL' : 'earR';
    r.bones[ear] = [s * 0.11, 0.18, -0.02];
    r.parents[ear] = 'head';
    r.pieces.push(p(ear, xf(teardrop(0.065, 0.2, 12, 1.4), { s: [1, 1, 0.35], r: [-0.3, 0, s * -0.85] }), pal.accent));
    // little twig antlers
    r.pieces.push(p('head', xf(cone(0.015, 0.1, 6), { r: [-0.3, 0, s * -0.4], p: [s * 0.06, 0.22, -0.03] }), '#8a5a36'));
  }
  eyes(r, 0.075, 0.1, 0.14, 0.046);
  legs(r, shade(B, -0.08), '#6a4a30', 0.08, 0.11, -0.12, 0.14, 0.036);
  tailChain(r, [0, 0.03, -0.2], 0.1, 2, [0.4, -1]);
  r.pieces.push(p('tail1', xf(teardrop(0.06, 0.18, 10, 1.4), { s: [1, 1, 0.35], r: [-Math.PI / 2 - 0.5, 0, 0] }), pal.accent));
  r.pieces.push(p('tail2', xf(teardrop(0.07, 0.2, 10, 1.4), { s: [1, 1, 0.35], r: [-Math.PI / 2 - 0.4, 0, 0] }), B));
  return r;
}

const BUILDERS: Record<SpeciesId, (pal: Palette) => Rig> = { flamkit, aquoray, terrabun, zephyra, lumelle, thornlade };

// ---------------------------------------------------------------------------
// Clips per gait

type BP = Record<string, Rot>;

function gaitClips(def: SpeciesDef, rig: Rig): Record<string, ClipSpec> {
  const bones = Object.keys(rig.bones);
  const rest = rig.bones as Record<string, Rot>;
  const has = (b: string) => bones.includes(b);
  const flap = (ph: number, amp: number, base = 0): BP => (has('wingL') ? { wingL: [0, 0, base + amp * ph], wingR: [0, 0, -base - amp * ph] } : {});
  const fins = (ph: number, amp: number): BP => (has('finL') ? { finL: [0, 0, amp * ph], finR: [0, 0, -amp * ph] } : {});
  const ears = (x: number, z = 0): BP => (has('earL') ? { earL: [x, 0, z], earR: [x, 0, -z] } : {});
  const tail = (yaw: number, pitch = 0): BP => {
    const o: BP = {};
    for (let i = 1; i <= 3; i++) if (has(`tail${i}`)) o[`tail${i}`] = [pitch, yaw * (0.6 + i * 0.3), 0];
    return o;
  };
  const legPose = (ph: number, amp: number, lift = 0): BP =>
    has('legFL')
      ? {
          legFL: [-amp * sin(ph) - lift, 0, 0],
          legBR: [-amp * sin(ph) + lift, 0, 0],
          legFR: [amp * sin(ph) - lift, 0, 0],
          legBL: [amp * sin(ph) + lift, 0, 0],
        }
      : {};
  const F = (rot: BP, dy = 0, dz = 0): PoseFrame => ({ rot, pos: { body: [0, dy, dz] } });
  const hover = def.gait === 'float' || def.gait === 'flutter';
  const loop = (name: string, dur: number, fn: (q: number) => PoseFrame): ClipSpec => ({ clip: makeClip(name, dur, fn, bones, rest), loop: true });
  const once = (name: string, dur: number, fn: (q: number) => PoseFrame): ClipSpec => ({ clip: makeClip(name, dur, fn, bones, rest, 18, false), loop: false });

  const moveCycle = (q: number, run: boolean): PoseFrame => {
    const k = run ? 1.6 : 1;
    switch (def.gait) {
      case 'hop': {
        const h = Math.max(0, sin(q));
        return F({ body: [-0.25 * cos(q), 0, 0], head: [0.15 * cos(q), 0, 0], ...ears(0.4 * h - 0.1), ...legPose(0.25, 0, -0.9 * h), ...tail(0.2 * sin(q)) }, 0.13 * h * k);
      }
      case 'float':
        return F({ body: [0.15 * k, 0, 0.05 * sin(q)], head: [-0.1, 0.1 * sin(q), 0], ...flap(sin(q * 2), 0.55, 0.1), ...ears(0.1 * sin(q * 2)), ...tail(0.2 * sin(q)) }, 0.07 * sin(q * 2));
      case 'flutter':
        return F({ body: [0.25 * k, 0, 0], head: [-0.2, 0, 0], ...flap(sin(q * 3), 0.9, 0.2), ...ears(-0.3), ...legPose(0, 0, 0.6), ...tail(0.3 * sin(q), 0.2) }, 0.25 + 0.06 * sin(q * 3));
      case 'swim':
        return F({ body: [0, 0.18 * sin(q), 0.05 * sin(q)], head: [0, -0.12 * sin(q), 0], ...fins(sin(q * 2), 0.5), ...tail(0.55 * sin(q, -0.8)) }, 0.03 * Math.abs(sin(q)));
      default: {
        const a = (run ? 0.9 : 0.55) * (def.gait === 'scuttle' ? 0.8 : 1);
        return F({ body: [0.04 * sin(q * 2), 0.05 * sin(q), 0], head: [-0.05 * sin(q * 2), -0.05 * sin(q), 0], ...legPose(q, a), ...ears(-0.15 * k), ...tail(0.4 * sin(q), run ? 0.25 : 0) }, 0.025 * Math.abs(cos(q)) * k);
      }
    }
  };

  return {
    idle: loop('idle', 3, (q) => F({
      body: [0.02 * sin(q), 0, 0], head: [0.04 * sin(q, 1), 0.25 * sin(q * 0.5 + 0.25), 0.05 * sin(q)],
      ...ears(0.08 * Math.max(0, sin(q * 3)) - 0.02, 0.05 * sin(q)), ...tail(0.35 * sin(q)), ...flap(sin(q * 2), hover ? 0.4 : 0.05, hover ? 0.1 : -0.1), ...fins(sin(q * 2), 0.2),
    }, (hover ? 0.05 : 0.008) * sin(q))),
    walk: loop('walk', def.gait === 'hop' ? 0.55 : 0.7, (q) => moveCycle(q, false)),
    run: loop('run', def.gait === 'hop' ? 0.42 : 0.4, (q) => moveCycle(q, true)),
    eat: loop('eat', 1.4, (q) => F({ body: [0.25, 0, 0], head: [0.55 + 0.15 * Math.max(0, sin(q * 2)), 0, 0], ...ears(-0.2), ...tail(0.3 * sin(q)), ...legPose(0, 0, hover ? 0 : 0.2) }, hover ? -0.2 : -0.04)),
    look: loop('look', 2.6, (q) => F({ head: [-0.25, 0.6 * sin(q), 0.08], ...ears(0.35), ...tail(0.15 * sin(q * 2)), ...flap(sin(q * 2), hover ? 0.4 : 0, 0.1) }, hover ? 0.04 * sin(q) : 0)),
    alert: loop('alert', 1.2, (q) => F({ body: [-0.12, 0, 0], head: [-0.3, 0, 0.02 * sin(q * 4)], ...ears(0.5), ...tail(0, 0.3), ...flap(sin(q * 3), hover ? 0.5 : 0, 0.2) }, 0.01)),
    sleep: loop('sleep', 4, (q) => F({
      body: [0.06, 0, 0], head: [0.5 + 0.03 * sin(q), 0.4, 0.15], ...ears(-0.5, 0.2), ...tail(1.1, -0.2), ...flap(0, 0, -0.4),
      ...(has('legFL') ? { legFL: [-1.2, 0, 0], legFR: [-1.2, 0, 0], legBL: [1.2, 0, 0], legBR: [1.2, 0, 0] } : {}),
    }, -rig.bones.body[1] * (hover ? 0.75 : 0.45) + 0.01 * sin(q))),
    swim: loop('swim', 0.9, (q) => F({ body: [0, 0.2 * sin(q), 0], head: [-0.2, -0.15 * sin(q), 0], ...fins(sin(q * 2), 0.6), ...tail(0.6 * sin(q, -0.8)), ...legPose(q * 2, 0.5) }, -0.08)),
    happy: once('happy', 0.9, (q) => {
      const k = Math.sin(Math.PI * q);
      return F({ body: [-0.3 * k, TAU_SAFE(q), 0], head: [-0.3 * k, 0, 0], ...ears(0.5 * k), ...tail(0.8 * sin(q * 3)), ...flap(sin(q * 4), 0.8, 0.2), ...fins(sin(q * 4), 0.6) }, 0.25 * k);
    }),
    defend: once('defend', 0.8, (q) => {
      const k = Math.sin(Math.PI * q);
      return F({ body: [0.25 * k, 0, 0], head: [0.2 * k, 0, 0], ...ears(-0.6 * k), ...tail(0, 0.6 * k), ...legPose(0.25, 0.3 * k) }, -0.04 * k, 0.12 * k);
    }),
    ability: once('ability', 1.0, (q) => {
      const k = Math.sin(Math.PI * q);
      return F({ body: [-0.45 * k, 0, 0], head: [-0.25 * k, 0, 0], ...ears(0.6 * k), ...tail(0, 0.6 * k), ...flap(sin(q * 4), 0.9 * k, 0.3), ...fins(sin(q * 4), 0.7 * k) }, 0.1 * k);
    }),
  };
}

/** A single spin turn for the happy hop. */
function TAU_SAFE(q: number): number {
  return q * Math.PI * 2;
}

const clipCache = new Map<string, Record<string, ClipSpec>>();

// ---------------------------------------------------------------------------

const matCache = new Map<string, Material>();
function material(key: MatKey, pal: Palette, glowColor: string): Material {
  const id = `${key}|${key === 'fin' ? pal.accent : key === 'glow' || key === 'gloss' ? glowColor : key === 'eye' ? pal.eye : ''}`;
  let m = matCache.get(id);
  if (m) return m;
  switch (key) {
    case 'base':
      // a soft sheen reads as fur in the light
      m = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, sheen: 0.7, sheenRoughness: 0.45, sheenColor: new Color('#ffffff') });
      break;
    case 'glow':
      m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: new Color(glowColor), emissiveIntensity: 0.9 });
      break;
    case 'gloss':
      m = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.05, clearcoat: 1, emissive: new Color(glowColor), emissiveIntensity: 0.45, flatShading: true });
      break;
    case 'fin':
      m = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, transparent: true, opacity: 0.62, side: DoubleSide, emissive: new Color(pal.accent), emissiveIntensity: 0.25, depthWrite: false });
      break;
    case 'eye':
      m = new MeshStandardMaterial({ map: eyeTexture(pal.eye), roughness: 0.12, metalness: 0 });
      break;
  }
  matCache.set(id, m!);
  return m!;
}

export interface CreatureModel {
  root: Group;
  /** The body bone; the root stays on the ground while the body moves. */
  body: Bone;
  head: Bone;
  animator: Animator;
  height: number;
  dispose(): void;
}

const geoCache = new Map<string, { rig: Rig; order: string[]; offsets: Record<string, Vector3>; batches: SkinnedBatch[] }>();

export function buildCreature(species: SpeciesId, variant: string | null = null, castShadow = true): CreatureModel {
  const def = SPECIES_BY_ID[species];
  const pal = paletteFor(species, variant);
  const key = `${species}|${variant ?? ''}`;
  let built = geoCache.get(key);
  if (!built) {
    const rig = BUILDERS[species](pal);
    const order = Object.keys(rig.bones);
    const offsets = restOffsets(rig.bones, rig.parents);
    const batches = bakeSkin(
      rig.pieces.map((p) => ({ bone: p.bone, geo: p.geo, mat: material(p.mat, pal, pal.glow), cast: p.mat !== 'fin' })),
      order,
      offsets,
    );
    built = { rig, order, offsets, batches };
    geoCache.set(key, built);
  }
  const { rig, order, offsets, batches } = built;
  const root = new Group();
  const bones: Record<string, Bone> = {};
  for (const [name, pos] of Object.entries(rig.bones)) {
    const b = new Bone();
    b.name = name;
    b.position.set(pos[0], pos[1], pos[2]);
    bones[name] = b;
  }
  for (const [name, parent] of Object.entries(rig.parents)) {
    if (parent) bones[parent].add(bones[name]);
    else root.add(bones[name]);
  }
  const meshes = skinMeshes(root, order.map((n) => bones[n]), offsets, batches);
  for (const m of meshes) m.castShadow = castShadow && m.castShadow;
  // Creatures are modelled at a common scale; the species size sets the rest.
  const scale = def.size / 0.55;
  root.scale.setScalar(scale);
  let clips = clipCache.get(species);
  if (!clips) {
    clips = gaitClips(def, rig);
    clipCache.set(species, clips);
  }
  const animator = new Animator(root, clips);
  animator.play('idle', 0);
  return {
    root,
    body: bones.body,
    head: bones.head,
    animator,
    height: (rig.bones.body[1] + 0.35) * scale,
    dispose() {
      animator.dispose();
      root.removeFromParent();
    },
  };
}
