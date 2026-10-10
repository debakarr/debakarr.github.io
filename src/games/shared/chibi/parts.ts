// Costume pieces for chibi characters, authored in bone space on the shared
// skeleton. Each piece returns meshes bound to bones with a surface type;
// the model bakes them into one skinned mesh per surface.

import { BufferGeometry, CylinderGeometry, LatheGeometry, PlaneGeometry, SphereGeometry, Vector2, Vector3, type Material } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { capsule, cone, cylinder, ellipsoid, lathe, prep, teardrop, torus, xf } from './geo';
import { lock } from './hair';
import { emblemMaterial, surface, type Surface } from './mats';
import { HEAD_R, HEAD_Y, type BoneName } from './rig';
import type { BodySpec, ChibiSpec, Item, Piece } from './spec';

export interface Part {
  bone: BoneName;
  geo: BufferGeometry;
  mat: Material;
  /** Skirts and robe hems: blended between the hips and the thighs. */
  drape?: boolean;
}

type V3 = [number, number, number];
const SIDES = [1, -1] as const;
const LR = (s: number) => (s > 0 ? 'L' : 'R') as 'L' | 'R';

class Kit {
  parts: Part[] = [];
  constructor(readonly spec: ChibiSpec) {}
  add(bone: BoneName, geo: BufferGeometry, color: string, s: Surface = 'cloth', drape = false): void {
    this.parts.push({ bone, geo: prep(geo, color), mat: surface(s), drape });
  }
  addRaw(bone: BoneName, geo: BufferGeometry, s: Surface): void {
    this.parts.push({ bone, geo: prep(geo), mat: surface(s) });
  }
  decal(bone: BoneName, geo: BufferGeometry, mat: Material): void {
    this.parts.push({ bone, geo: prep(geo), mat });
  }
  has(k: Piece['k']): boolean {
    return this.spec.outfit.some((p) => p.k === k);
  }
  get<K extends Piece['k']>(k: K): Extract<Piece, { k: K }> | undefined {
    return this.spec.outfit.find((p) => p.k === k) as Extract<Piece, { k: K }> | undefined;
  }
}

function shade(hex: string, l: number): string {
  const c = Number.parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + l * 255)));
  const r = f((c >> 16) & 255);
  const g = f((c >> 8) & 255);
  const b = f(c & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Squashes a lathe into an oval (depth) and pushes the front forward a touch. */
function oval(g: BufferGeometry, depth: number, belly = 0): BufferGeometry {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    pos.setZ(i, z * depth + (z > 0 ? belly * z : 0));
  }
  g.computeVertexNormals();
  return g;
}

/** A buckle: a rounded frame with a prong. */
function buckle(w: number, h: number): BufferGeometry[] {
  const frame = new RoundedBoxGeometry(w, h, 0.012, 2, 0.006);
  return [frame];
}

// ---------------------------------------------------------------------------
// Body

/** Head with the painted face (the face material is supplied by the model). */
export function headGeometry(): BufferGeometry {
  const g = new SphereGeometry(HEAD_R, 56, 40);
  const pos = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const y = v.y / HEAD_R;
    // fuller cheeks below the eye line, a softly rounded chin, flatter back
    const cheek = y < 0.1 ? 1 + 0.07 * Math.sin(Math.min(1, (0.1 - y) / 0.8) * Math.PI) : 1;
    v.x *= cheek * 1.02;
    v.z *= v.z > 0 ? cheek : 0.94;
    if (y < -0.55 && v.z > 0) v.z += (-0.55 - y) * 0.05;
    v.y *= 0.95;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.translate(0, HEAD_Y, 0);
  return g;
}

function body(k: Kit, b: BodySpec): void {
  const skin = k.spec.face.skin;
  const st = b.stocky ?? 0;
  // neck
  k.add('neck', xf(cylinder(0.05 + st * 0.012, 0.056 + st * 0.012, 0.1, 12), { p: [0, 0.03, 0] }), skin, 'skin');
  // ears
  for (const s of SIDES) {
    k.add('head', xf(ellipsoid(0.034, 0.05, 0.026), { r: [0, s * 0.35, s * -0.1], p: [s * HEAD_R * 1.0, HEAD_Y - 0.03, -0.01] }), skin, 'skin');
    k.add('head', xf(ellipsoid(0.018, 0.03, 0.01), { r: [0, s * 0.35, 0], p: [s * HEAD_R * 1.02, HEAD_Y - 0.03, 0.002] }), shade(skin, -0.08), 'skin');
  }
  // hands (gloves replace them)
  if (!k.has('gloves')) for (const s of SIDES) hand(k, s, skin, 'skin', false);
}

/** A chunky mitten hand: palm, four finger knuckles, thumb. */
function hand(k: Kit, s: number, color: string, surf: Surface, fingerless: boolean, tips?: string): void {
  const bone = `hand${LR(s)}` as BoneName;
  k.add(bone, xf(ellipsoid(0.05, 0.055, 0.044, 16, 12), { p: [0, -0.03, 0.005] }), color, surf);
  for (let f = 0; f < 4; f++) {
    const x = (f - 1.5) * 0.022 * -s;
    k.add(bone, xf(capsule(0.0135, 0.03, 3, 8), { r: [0.35, 0, 0], p: [x, -0.072, 0.016] }), fingerless ? tips ?? color : color, fingerless ? 'skin' : surf);
  }
  k.add(bone, xf(capsule(0.016, 0.035, 3, 8), { r: [0.5, 0, s * -0.5], p: [s * -0.042, -0.04, 0.03] }), fingerless ? tips ?? color : color, fingerless ? 'skin' : surf);
}

// ---------------------------------------------------------------------------
// Garments

function torso(k: Kit, color: string, opts: { collar?: string; vneck?: string; trim?: string; slender?: boolean; stocky?: number } = {}): void {
  const w = opts.slender ? 0.92 : 1 + (opts.stocky ?? 0) * 0.18;
  const prof: [number, number][] = [[0.13, -0.07], [0.138, 0.0], [0.148, 0.08], [0.158, 0.15], [0.152, 0.21], [0.125, 0.255], [0.07, 0.28], [0.045, 0.285]];
  k.add('spine', oval(lathe(prof.map(([r, y]) => [r * w, y] as [number, number]), 28), 0.8, 0.06), color);
  if (opts.vneck) {
    // a V of the shirt beneath
    const v = new PlaneGeometry(0.08, 0.1);
    k.add('spine', xf(v, { r: [-0.25, 0, Math.PI / 4], p: [0, 0.22, 0.118] }), opts.vneck);
  }
  if (opts.collar) k.add('chest', xf(torus(0.072, 0.024, 8, 22), { r: [Math.PI / 2 + 0.2, 0, 0], p: [0, 0.155, 0.0] }), opts.collar);
}

function skirtGeo(top: number, bottom: number, rTop: number, rBot: number, waves = 0, seg = 32): BufferGeometry {
  const prof: [number, number][] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    prof.push([rTop + (rBot - rTop) * Math.pow(t, 0.8), top + (bottom - top) * t]);
  }
  const g = lathe(prof.reverse(), seg);
  if (waves) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const a = Math.atan2(z, x);
      const depth = Math.max(0, (top - y) / (top - bottom));
      const k = 1 + waves * Math.sin(a * 9) * depth;
      pos.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
  }
  return oval(g, 0.88);
}

function hemTrim(k: Kit, bone: BoneName, y: number, r: number, color: string, depth = 0.88, tube = 0.012, surf: Surface = 'gold', drape = true): void {
  k.add(bone, xf(torus(r, tube, 6, 36), { r: [Math.PI / 2, 0, 0], s: [1, depth, 1], p: [0, y, 0] }), color, surf, drape);
}

function tunic(k: Kit, p: Extract<Piece, { k: 'tunic' }>, b: BodySpec): void {
  torso(k, p.color, { collar: p.collar, vneck: p.vneck, slender: b.slender, stocky: b.stocky });
  const len = p.length ?? 0.15;
  k.add('hips', skirtGeo(0.06, -len, 0.14 * (1 + (b.stocky ?? 0) * 0.15), 0.175 + len * 0.15, 0.03), p.color, 'cloth', true);
  if (p.trim) hemTrim(k, 'hips', -len + 0.004, 0.175 + len * 0.15 - 0.002, p.trim, 0.88, 0.011, 'cloth', true);
}

function sleeves(k: Kit, p: Extract<Piece, { k: 'sleeves' }>, b: BodySpec): void {
  const st = b.stocky ?? 0;
  const thick = b.slender ? 0.85 : 1 + st * 0.25;
  for (const s of SIDES) {
    const arm = `arm${LR(s)}` as BoneName;
    const fore = `fore${LR(s)}` as BoneName;
    const style = p.style ?? 'puff';
    if (style === 'bare') {
      k.add(arm, xf(capsule(0.04 * thick, 0.09, 4, 12), { p: [0, -0.07, 0] }), k.spec.face.skin, 'skin');
      k.add(fore, xf(capsule(0.036 * thick, 0.08, 4, 12), { p: [0, -0.06, 0] }), k.spec.face.skin, 'skin');
      continue;
    }
    // shoulder puff + upper sleeve
    k.add(arm, xf(ellipsoid(0.07 * thick, 0.065, 0.068), { p: [0, -0.012, 0] }), p.color);
    k.add(arm, xf(capsule(0.05 * thick, 0.085, 4, 14), { p: [0, -0.07, 0] }), p.color);
    if (style === 'short') {
      k.add(fore, xf(capsule(0.036 * thick, 0.08, 4, 12), { p: [0, -0.06, 0] }), k.spec.face.skin, 'skin');
      if (p.cuff) k.add(arm, xf(torus(0.05 * thick, 0.012, 6, 16), { r: [Math.PI / 2, 0, 0], p: [0, -0.12, 0] }), p.cuff);
      continue;
    }
    if (style === 'wide') {
      // a wide hanging sleeve (robes)
      k.add(fore, xf(cylinder(0.055, 0.105, 0.17, 20, true), { p: [0, -0.07, 0] }), p.color);
      k.add(fore, xf(cylinder(0.05, 0.1, 0.165, 20, true), { p: [0, -0.07, 0] }), shade(p.color, -0.15));
      if (p.trim) k.add(fore, xf(torus(0.102, 0.012, 6, 24), { r: [Math.PI / 2, 0, 0], p: [0, -0.155, 0] }), p.trim, 'gold');
      continue;
    }
    k.add(fore, xf(capsule(0.045 * thick, 0.08, 4, 14), { p: [0, -0.06, 0] }), p.color);
    if (p.cuff) k.add(fore, xf(cylinder(0.05 * thick, 0.054 * thick, 0.035, 16), { p: [0, -0.115, 0] }), p.cuff);
    if (p.trim) k.add(fore, xf(torus(0.052 * thick, 0.008, 6, 16), { r: [Math.PI / 2, 0, 0], p: [0, -0.13, 0] }), p.trim, 'gold');
  }
}

/** A partial lathe (front or back panel) shaped like the torso, oval in depth. */
function panel(profile: [number, number][], phiStart: number, phiLen: number, depth: number, seg = 18): BufferGeometry {
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(0.0001, r), y)), seg, phiStart, phiLen);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * depth);
  g.computeVertexNormals();
  return g;
}

function panelEdge(profile: [number, number][], phi: number, depth: number): Vector3[] {
  return profile.map(([r, y]) => new Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r * depth));
}

/** A smooth tube through a list of points (chained bezier locks). */
function piping(k: Kit, bone: BoneName, pts: Vector3[], r: number, color: string, s: Surface = 'gold'): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const d = pts[i + 1];
    k.addRaw(bone, lock(a, a.clone().lerp(d, 0.33), a.clone().lerp(d, 0.66), d, r, { flat: 1, swell: 0, tip: 1, seg: 3, ring: 6, root: color, end: color }), s);
  }
}

function tabard(k: Kit, p: Extract<Piece, { k: 'tabard' }>, b: BodySpec): void {
  const w = b.slender ? 0.92 : 1 + (b.stocky ?? 0) * 0.18;
  const len = p.length ?? 0.2;
  // follows the shirt from the shoulders, then flares over the skirt
  const prof: [number, number][] = [
    [0.222, -0.07 - len],
    [0.19, -0.04 - len * 0.6],
    [0.162, -0.02],
    [0.156, 0.05],
    [0.17, 0.13],
    [0.172, 0.19],
    [0.15, 0.245],
    [0.106, 0.278],
  ].map(([r, y]) => [r * w, y] as [number, number]);
  const half = 0.78;
  const depth = 0.9;
  for (const back of [false, true]) {
    const phi0 = (back ? Math.PI : 0) - half;
    k.add('spine', panel(prof, phi0, half * 2, depth), p.color, 'sheet');
    if (p.trim) {
      const t = prof.map(([r, y]) => [r + 0.004, y] as [number, number]);
      piping(k, 'spine', panelEdge(t, phi0, depth), 0.008, p.trim);
      piping(k, 'spine', panelEdge(t, phi0 + half * 2, depth), 0.008, p.trim);
      const hemR = t[0][0];
      const hem: Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = phi0 + (i / 8) * half * 2;
        hem.push(new Vector3(Math.sin(a) * hemR, t[0][1], Math.cos(a) * hemR * depth));
      }
      piping(k, 'spine', hem, 0.009, p.trim);
    }
  }
  if (p.emblem) {
    const e = emblemMaterial(p.emblem, p.emblemColor ?? '#e8b84a');
    k.decal('spine', xf(new PlaneGeometry(0.1, 0.1), { r: [-0.05, 0, 0], p: [0, 0.16, 0.172 * w * depth + 0.004] }), e);
    k.decal('spine', xf(new PlaneGeometry(0.12, 0.12), { r: [0, Math.PI, 0], p: [0, 0.1, -0.17 * w * depth - 0.004] }), e);
  }
}

function vest(k: Kit, p: Extract<Piece, { k: 'vest' }>, b: BodySpec): void {
  const w = b.slender ? 0.92 : 1 + (b.stocky ?? 0) * 0.18;
  const prof: [number, number][] = [[0.141, -0.04], [0.15, 0.05], [0.162, 0.15], [0.157, 0.2], [0.13, 0.25], [0.09, 0.27]];
  const g = oval(lathe(prof.map(([r, y]) => [r * w, y] as [number, number]), 28, ), 0.8, 0.06);
  if (p.open) {
    // cut a wedge out of the front
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (z > 0 && Math.abs(x) < 0.05) pos.setX(i, Math.sign(x || 1) * 0.05);
    }
  }
  k.add('spine', g, p.color);
  if (p.trim) for (const sx of SIDES) k.add('spine', xf(new RoundedBoxGeometry(0.012, 0.28, 0.02, 2, 0.005), { r: [0.15, 0, 0], p: [sx * 0.052, 0.11, 0.128 * w] }), p.trim, 'gold');
}

function robe(k: Kit, p: Extract<Piece, { k: 'robe' }>, b: BodySpec): void {
  torso(k, p.color, { slender: b.slender, stocky: b.stocky });
  const len = p.length ?? 0.42;
  const flare = p.flare ?? 0.24;
  k.add('hips', skirtGeo(0.06, -len, 0.142, flare, 0.04, 40), p.color, 'cloth', true);
  if (p.inner) {
    // the front panel / lining
    const g = new RoundedBoxGeometry(0.12, len + 0.2, 0.02, 2, 0.008);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + (len + 0.2) / 2) / (len + 0.2);
      pos.setX(i, pos.getX(i) * (1.6 - t * 0.7));
    }
    g.computeVertexNormals();
    k.add('hips', xf(g, { r: [-0.22, 0, 0], p: [0, -len / 2 + 0.04, 0.155] }), p.inner, 'cloth', true);
    k.add('spine', xf(new RoundedBoxGeometry(0.09, 0.27, 0.02, 2, 0.008), { p: [0, 0.12, 0.124] }), p.inner);
  }
  if (p.trim) {
    hemTrim(k, 'hips', -len + 0.006, flare - 0.004, p.trim, 0.88, 0.014);
    // lapels crossing at the chest
    for (const s of SIDES) k.add('spine', xf(new RoundedBoxGeometry(0.03, 0.3, 0.018, 2, 0.006), { r: [0.12, 0, s * 0.42], p: [s * 0.05, 0.12, 0.125] }), p.trim, 'gold');
  }
  if (p.pattern) {
    // a band of pattern near the hem
    hemTrim(k, 'hips', -len + 0.05, flare - 0.03, p.pattern, 0.88, 0.02, 'cloth');
  }
  if (p.sash) k.add('hips', xf(torus(0.15, 0.03, 8, 30), { r: [Math.PI / 2, 0, 0], s: [1, 0.85, 1], p: [0, 0.07, 0] }), p.sash, 'silk');
  if (p.wideSleeves !== false) sleeves(k, { k: 'sleeves', color: p.color, style: 'wide', trim: p.trim }, b);
}

function gown(k: Kit, p: Extract<Piece, { k: 'gown' }>, b: BodySpec): void {
  torso(k, p.bodice, { slender: true, stocky: b.stocky });
  // layered skirts, outermost (shortest/widest-cut) last
  p.layers.forEach((l, i) => {
    const g = skirtGeo(0.06 - i * 0.005, -l.length, 0.14 + i * 0.006, l.flare, 0.05 + i * 0.02, 44);
    if (l.open) {
      // open at the front (an overskirt): pull the front vertices back
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        const z = pos.getZ(v);
        const a = Math.atan2(x, z);
        if (Math.abs(a) < l.open) {
          const k2 = Math.abs(a) / l.open;
          pos.setZ(v, z * (0.55 + 0.45 * k2));
        }
      }
      g.computeVertexNormals();
    }
    k.add('hips', g, l.color, 'silk', true);
    if (l.trim) hemTrim(k, 'hips', -l.length + 0.006, l.flare - 0.004, l.trim, 0.88, 0.012);
  });
  if (p.pattern) {
    const top = p.layers[p.layers.length - 1];
    hemTrim(k, 'hips', -top.length + 0.045, top.flare - 0.03, p.pattern, 0.88, 0.016, 'cloth');
  }
  if (p.trim) k.add('spine', xf(torus(0.11, 0.013, 6, 28), { r: [Math.PI / 2 + 0.25, 0, 0], s: [1, 0.8, 1], p: [0, 0.22, 0.02] }), p.trim, 'gold');
}

function skirt(k: Kit, p: Extract<Piece, { k: 'skirt' }>): void {
  const len = p.length ?? 0.28;
  const flare = p.flare ?? 0.22;
  k.add('hips', skirtGeo(0.06, -len, 0.142, flare, 0.05, 40), p.color, 'cloth', true);
  if (p.trim) hemTrim(k, 'hips', -len + 0.006, flare - 0.004, p.trim, 0.88, 0.012, 'cloth');
  if (p.wrap) {
    const g = skirtGeo(0.065, -len * 0.75, 0.146, flare * 0.95, 0.06, 40);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) if (pos.getX(v) < -0.02 && pos.getZ(v) > 0) pos.setXYZ(v, pos.getX(v) * 0.7, pos.getY(v), pos.getZ(v) * 0.7);
    g.computeVertexNormals();
    k.add('hips', g, p.wrap, 'silk', true);
  }
}

function apron(k: Kit, p: Extract<Piece, { k: 'apron' }>): void {
  const g = new RoundedBoxGeometry(0.2, 0.42, 0.016, 2, 0.008);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + 0.21) / 0.42;
    pos.setZ(i, pos.getZ(i) - Math.pow(pos.getX(i) / 0.12, 2) * 0.04 + (1 - t) * 0.04);
  }
  g.computeVertexNormals();
  k.add('spine', xf(g, { p: [0, 0.0, 0.135] }), p.color, 'sheet');
  if (p.trim) k.add('spine', xf(new RoundedBoxGeometry(0.2, 0.012, 0.02, 2, 0.005), { p: [0, -0.205, 0.16] }), p.trim);
  if (p.patch) k.add('spine', xf(new RoundedBoxGeometry(0.06, 0.05, 0.01, 2, 0.006), { r: [0, 0, 0.1], p: [0.04, -0.08, 0.147] }), p.patch);
  for (const s of SIDES) k.add('chest', xf(new RoundedBoxGeometry(0.02, 0.12, 0.012, 2, 0.005), { r: [0, 0, s * 0.15], p: [s * 0.08, 0.06, 0.12] }), p.color);
}

function pants(k: Kit, p: Extract<Piece, { k: 'pants' }>, b: BodySpec): void {
  const bag = p.baggy ? 1.15 : 1;
  const st = 1 + (b.stocky ?? 0) * 0.25;
  // seat
  k.add('hips', oval(lathe([[0.135 * st, 0.06], [0.145 * st, 0.0], [0.14 * st, -0.06], [0.11 * st, -0.08]], 24), 0.85), p.color);
  for (const s of SIDES) {
    const th = `thigh${LR(s)}` as BoneName;
    const sh = `shin${LR(s)}` as BoneName;
    k.add(th, xf(capsule(0.066 * bag * st, 0.12, 4, 14), { p: [0, -0.085, 0] }), p.color);
    if (!p.short) k.add(sh, xf(capsule(0.056 * bag * st, 0.1, 4, 14), { p: [0, -0.07, 0] }), p.color);
    else k.add(sh, xf(capsule(0.042, 0.1, 4, 12), { p: [0, -0.07, 0] }), k.spec.face.skin, 'skin');
  }
}

function boots(k: Kit, p: Extract<Piece, { k: 'boots' }>, b: BodySpec): void {
  const st = 1 + (b.stocky ?? 0) * 0.2;
  const sole = p.sole ?? shade(p.color, -0.22);
  for (const s of SIDES) {
    const sh = `shin${LR(s)}` as BoneName;
    const ft = `foot${LR(s)}` as BoneName;
    const h = p.tall ? 0.15 : 0.11;
    k.add(sh, xf(cylinder(0.066 * st, 0.068 * st, h, 18), { p: [0, -0.19 + h / 2 + 0.01, 0] }), p.color, 'leather');
    // folded cuff
    const cuff = p.cuff ?? shade(p.color, 0.06);
    k.add(sh, xf(cylinder(0.08 * st, 0.074 * st, 0.045, 20), { p: [0, -0.19 + h + 0.0, 0] }), cuff, 'leather');
    k.add(sh, xf(torus(0.077 * st, 0.01, 6, 20), { r: [Math.PI / 2, 0, 0], p: [0, -0.19 + h - 0.022, 0] }), shade(cuff, -0.1), 'leather');
    // the foot: a big round toe
    k.add(ft, xf(ellipsoid(0.072 * st, 0.058, 0.115 * st, 20, 14), { p: [0, -0.012, 0.04] }), p.color, 'leather');
    k.add(ft, xf(new RoundedBoxGeometry(0.15 * st, 0.03, 0.25 * st, 3, 0.014), { p: [0, -0.05, 0.035] }), sole, 'leather');
    if (p.buckle) {
      k.add(sh, xf(torus(0.07 * st, 0.008, 6, 20), { r: [Math.PI / 2, 0, 0], p: [0, -0.15, 0] }), shade(p.color, -0.15), 'leather');
      k.add(sh, xf(new RoundedBoxGeometry(0.026, 0.022, 0.012, 2, 0.004), { p: [s * 0.03, -0.15, 0.064 * st] }), p.buckle, 'gold');
    }
  }
}

function sandals(k: Kit, p: Extract<Piece, { k: 'sandals' }>): void {
  const skin = k.spec.face.skin;
  for (const s of SIDES) {
    const sh = `shin${LR(s)}` as BoneName;
    const ft = `foot${LR(s)}` as BoneName;
    if (!k.has('pants')) k.add(sh, xf(capsule(0.042, 0.13, 4, 12), { p: [0, -0.1, 0] }), skin, 'skin');
    k.add(ft, xf(ellipsoid(0.055, 0.042, 0.095, 16, 10), { p: [0, -0.02, 0.04] }), skin, 'skin');
    k.add(ft, xf(new RoundedBoxGeometry(0.12, 0.022, 0.22, 3, 0.01), { p: [0, -0.055, 0.035] }), shade(p.color, -0.1), 'leather');
    k.add(ft, xf(torus(0.05, 0.008, 5, 16), { r: [Math.PI / 2 - 0.3, 0, 0], p: [0, -0.02, 0.07] }), p.color, 'leather');
    if (p.wraps) for (let i = 0; i < 3; i++) k.add(sh, xf(torus(0.045, 0.007, 5, 16), { r: [Math.PI / 2 + (i % 2 ? 0.25 : -0.25), 0, 0], p: [0, -0.16 + i * 0.035, 0] }), p.color, 'leather');
  }
}

function shoes(k: Kit, p: Extract<Piece, { k: 'shoes' }>): void {
  for (const s of SIDES) {
    const ft = `foot${LR(s)}` as BoneName;
    const sh = `shin${LR(s)}` as BoneName;
    k.add(sh, xf(cylinder(0.06, 0.062, 0.05, 16), { p: [0, -0.165, 0] }), p.color, 'leather');
    k.add(ft, xf(ellipsoid(0.066, 0.05, 0.11, 18, 12), { p: [0, -0.015, 0.04] }), p.color, 'leather');
    k.add(ft, xf(new RoundedBoxGeometry(0.135, 0.022, 0.23, 3, 0.01), { p: [0, -0.05, 0.035] }), shade(p.color, -0.2), 'leather');
    if (p.trim) k.add(ft, xf(torus(0.062, 0.008, 6, 18), { r: [Math.PI / 2, 0, 0], p: [0, 0.02, 0.0] }), p.trim, 'gold');
  }
}

function gloves(k: Kit, p: Extract<Piece, { k: 'gloves' }>): void {
  for (const s of SIDES) {
    hand(k, s, p.color, 'leather', !!p.fingerless, k.spec.face.skin);
    const fore = `fore${LR(s)}` as BoneName;
    k.add(fore, xf(cylinder(0.05, 0.056, 0.05, 16), { p: [0, -0.118, 0] }), p.color, 'leather');
  }
}

function bracers(k: Kit, p: Extract<Piece, { k: 'bracers' }>): void {
  for (const s of SIDES) {
    const fore = `fore${LR(s)}` as BoneName;
    k.add(fore, xf(cylinder(0.054, 0.05, 0.075, 18), { p: [0, -0.075, 0] }), p.color, 'leather');
    if (p.trim) for (const y of [-0.04, -0.11]) k.add(fore, xf(torus(0.053, 0.006, 6, 18), { r: [Math.PI / 2, 0, 0], p: [0, y, 0] }), p.trim, 'gold');
  }
}

function belt(k: Kit, p: Extract<Piece, { k: 'belt' }>, b: BodySpec): void {
  const st = 1 + (b.stocky ?? 0) * 0.18;
  const y = p.y ?? 0.07;
  const w = p.wide ? 0.034 : 0.022;
  const r = (k.has('tabard') ? 0.178 : k.has('robe') || k.has('gown') ? 0.15 : 0.148) * st;
  const dz = 0.86;
  k.add('hips', xf(cylinder(r, r, w * 2, 32, true), { s: [1, 1, dz], p: [0, y, 0] }), p.color, 'leather');
  k.add('hips', xf(cylinder(r - 0.003, r - 0.003, w * 2, 32, true), { s: [1, 1, dz], p: [0, y, 0] }), shade(p.color, -0.2), 'leather');
  if (p.buckle) {
    k.add('hips', xf(new RoundedBoxGeometry(0.06, 0.05, 0.016, 2, 0.008), { p: [0, y, r * dz + 0.008] }), p.buckle, 'gold');
    k.add('hips', xf(new RoundedBoxGeometry(0.034, 0.026, 0.02, 2, 0.004), { p: [0, y, r * dz + 0.012] }), shade(p.color, -0.1), 'leather');
  }
}

function strap(k: Kit, p: Extract<Piece, { k: 'strap' }>, b: BodySpec): void {
  // a diagonal bandolier from shoulder to the opposite hip, front and back
  const st = 1 + (b.stocky ?? 0) * 0.18;
  const s = p.side;
  const over = k.has('tabard') ? 1.22 : 1;
  const pts = (zz: number) => { const z = zz * over; return [new Vector3(s * 0.11 * st, 0.27, z * 0.4), new Vector3(s * 0.06 * st, 0.2, z), new Vector3(-s * 0.06 * st, 0.06, z * 1.02), new Vector3(-s * 0.13 * st, -0.05, z * 0.86)]; };
  const _unused = (z: number) => [new Vector3(s * 0.11 * st, 0.27, z * 0.4), new Vector3(s * 0.06 * st, 0.2, z), new Vector3(-s * 0.06 * st, 0.06, z * 1.02), new Vector3(-s * 0.13 * st, -0.05, z * 0.86)];
  for (const z of [0.128 * st, -0.122 * st]) {
    const [a, bb, c, d] = pts(z);
    const g = lock(a, bb, c, d, 0.024, { flat: 0.3, up: new Vector3(0, 0, Math.sign(z)), swell: 0, tip: 1, seg: 10, ring: 6, root: p.color, end: p.color });
    k.addRaw('spine', g, 'leather');
  }
  void _unused;
  if (p.buckle) k.add('spine', xf(new RoundedBoxGeometry(0.036, 0.03, 0.012, 2, 0.006), { r: [0, 0, s * 0.8], p: [-s * 0.035, 0.1, 0.136 * st * over + 0.006] }), p.buckle, 'gold');
}

function pouch(k: Kit, p: Extract<Piece, { k: 'pouch' }>): void {
  const x = p.side * (p.front ? 0.08 : 0.14);
  const z = p.front ? 0.13 : 0.07;
  const rot: V3 = [0, p.side * (p.front ? 0.3 : 1.2), 0];
  k.add('hips', xf(new RoundedBoxGeometry(0.075, 0.075, 0.045, 3, 0.016), { r: rot, p: [x, 0.0, z] }), p.color, 'leather');
  k.add('hips', xf(new RoundedBoxGeometry(0.078, 0.032, 0.05, 3, 0.012), { r: rot, p: [x, 0.03, z + 0.003] }), p.flap ?? shade(p.color, -0.1), 'leather');
  k.add('hips', xf(ellipsoid(0.008, 0.008, 0.005), { r: rot, p: [x + Math.sin(rot[1]) * 0.026, 0.018, z + Math.cos(rot[1]) * 0.026] }), '#e8b84a', 'gold');
}

function scarf(k: Kit, p: Extract<Piece, { k: 'scarf' }>): void {
  // a thick wrapped cowl with a loose fold over the chest
  k.add('chest', xf(torus(0.088, 0.06, 14, 30), { r: [Math.PI / 2 + 0.15, 0, 0], s: [1.15, 1, 1.05], p: [0, 0.16, 0.0] }), p.color);
  k.add('chest', xf(torus(0.11, 0.05, 12, 30), { r: [Math.PI / 2 + 0.02, 0, 0], s: [1.2, 1, 1.05], p: [0, 0.115, -0.005] }), shade(p.color, -0.05));
  // a loose fold hanging over the chest
  const fold = new SphereGeometry(0.15, 24, 12, -1.0, 2.0, Math.PI * 0.42, Math.PI * 0.32);
  k.add('chest', xf(fold, { s: [1.05, 1.15, 1.1], p: [0, 0.16, 0.04] }), shade(p.color, 0.03));
  if (p.trim) k.add('chest', xf(torus(0.115, 0.007, 6, 30, Math.PI), { r: [Math.PI / 2 + 0.6, 0, Math.PI], p: [0, 0.1, 0.03] }), p.trim, 'gold');
  if (p.tails) for (const s of SIDES) k.add('chest', xf(teardrop(0.035, 0.16, 10, 1), { r: [Math.PI - 0.15, 0, s * 0.18], p: [s * 0.05, 0.14, -0.11] }), p.color);
}

/** A flat, slightly curved panel hanging from the cape bone (flutters with it). */
function capeGeo(w: number, len: number, curve = 0.06): BufferGeometry {
  const g = new PlaneGeometry(w, len, 10, 12);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = (len / 2 - y) / len; // 0 at the top, 1 at the hem
    const flare = 1 + t * 0.55;
    const nx = x * flare;
    // wrap around the back, plus soft folds
    const z = -Math.pow(nx / (w * 0.7), 2) * curve * 1.6 + Math.sin(nx * 38) * 0.008 * t;
    pos.setXYZ(i, nx, y - len / 2, -z);
  }
  g.computeVertexNormals();
  return g;
}

function cape(k: Kit, p: Extract<Piece, { k: 'cape' }>): void {
  const len = p.length ?? 0.38;
  const g = capeGeo(0.3, len);
  // two layers (outside colour / lining) for thickness
  k.add('cape', xf(g.clone(), { r: [0, Math.PI, 0], p: [0, 0.02, -0.012] }), p.color, 'sheet');
  k.add('cape', xf(g, { p: [0, 0.02, 0.0] }), p.inner ?? shade(p.color, -0.18), 'sheet');
  if (p.trim) {
    const hem = capeGeo(0.3, 0.025);
    k.add('cape', xf(hem, { r: [0, Math.PI, 0], p: [0, 0.02 - len + 0.012, -0.022] }), p.trim, 'gold');
  }
  // gathered at the shoulders
  k.add('chest', xf(new SphereGeometry(0.17, 26, 12, Math.PI * 0.85, Math.PI * 1.3, Math.PI * 0.28, Math.PI * 0.3), { s: [1, 1, 0.85], p: [0, 0.07, -0.0] }), p.color);
  if (p.collar) k.add('chest', xf(torus(0.1, 0.03, 8, 26, Math.PI), { r: [Math.PI / 2, 0, Math.PI], p: [0, 0.16, -0.02] }), p.collar);
  if (p.emblem) k.decal('cape', xf(new PlaneGeometry(0.14, 0.14), { r: [0, Math.PI, 0], p: [0, -len * 0.45, -0.035] }), emblemMaterial(p.emblem, p.emblemColor ?? '#e8b84a'));
}

function furCloak(k: Kit, p: Extract<Piece, { k: 'furCloak' }>): void {
  const len = 0.5;
  const g = capeGeo(0.36, len, 0.09);
  k.add('cape', xf(g.clone(), { r: [0, Math.PI, 0], p: [0, 0.03, -0.02] }), p.color, 'sheet');
  k.add('cape', xf(g, { p: [0, 0.03, -0.006] }), shade(p.color, -0.18), 'sheet');
  if (p.trim) {
    // a woven band along the hem
    const hem = capeGeo(0.36, 0.03, 0.09);
    k.add('cape', xf(hem, { r: [0, Math.PI, 0], p: [0, 0.03 - len + 0.04, -0.03] }), p.trim, 'cloth');
  }
  // a big, lumpy fur mantle around the shoulders
  const rng = (i: number) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 0.165 + rng(i) * 0.02;
    const front = Math.cos(a) > 0.3;
    if (front && Math.abs(Math.sin(a)) < 0.35) continue;
    k.add('chest', xf(ellipsoid(0.07 + rng(i + 3) * 0.02, 0.06, 0.06, 12, 8), { p: [Math.sin(a) * r, 0.12 + rng(i + 7) * 0.025, Math.cos(a) * r * 0.85] }), i % 3 ? p.fur : shade(p.fur, -0.06), 'fur');
  }
  for (let i = 0; i < 16; i++) {
    const a = Math.PI + (i / 15 - 0.5) * 2.6;
    k.add('chest', xf(ellipsoid(0.06, 0.05, 0.05, 12, 8), { p: [Math.sin(a) * 0.17, 0.05 - rng(i) * 0.03, Math.cos(a) * 0.15] }), shade(p.fur, -0.04), 'fur');
  }
  if (p.emblem) k.decal('cape', xf(new PlaneGeometry(0.16, 0.16), { r: [0, Math.PI, 0], p: [0, -0.24, -0.06] }), emblemMaterial(p.emblem, p.emblemColor ?? '#e8e2d0', false));
}

function backpack(k: Kit, p: Extract<Piece, { k: 'backpack' }>): void {
  const big = p.big ? 1.25 : 1;
  k.add('chest', xf(new RoundedBoxGeometry(0.22 * big, 0.24 * big, 0.12 * big, 4, 0.045), { p: [0, -0.01, -0.175] }), p.color, 'leather');
  // front pocket and flap
  k.add('chest', xf(new RoundedBoxGeometry(0.16 * big, 0.1 * big, 0.05, 3, 0.02), { p: [0, -0.06, -0.245 - (big - 1) * 0.05] }), shade(p.color, -0.06), 'leather');
  k.add('chest', xf(new RoundedBoxGeometry(0.23 * big, 0.08, 0.13 * big, 3, 0.03), { p: [0, 0.09 * big, -0.175] }), shade(p.color, -0.1), 'leather');
  for (const s of SIDES) {
    k.add('chest', xf(new RoundedBoxGeometry(0.06, 0.1, 0.07, 3, 0.02), { p: [s * 0.13 * big, -0.04, -0.17] }), shade(p.color, 0.04), 'leather');
    // shoulder straps
    k.add('chest', xf(torus(0.1, 0.012, 5, 16, Math.PI * 1.1), { r: [0, Math.PI / 2, 0.15], p: [s * 0.085, 0.06, -0.06] }), p.strap ?? shade(p.color, -0.2), 'leather');
  }
  if (p.buckle) for (const s of [-0.04, 0.04]) k.add('chest', xf(new RoundedBoxGeometry(0.022, 0.022, 0.01, 2, 0.004), { p: [s, -0.04, -0.272 - (big - 1) * 0.05] }), p.buckle, 'gold');
  if (p.roll) {
    // a rolled bedroll on top, with tie straps and a spiral end
    k.add('chest', xf(cylinder(0.05, 0.05, 0.28 * big, 20), { r: [0, 0, Math.PI / 2], p: [0, 0.16 * big, -0.18] }), p.roll, 'cloth');
    for (const s of SIDES) {
      k.add('chest', xf(torus(0.052, 0.009, 6, 18), { r: [0, Math.PI / 2, 0], p: [s * 0.08, 0.16 * big, -0.18] }), shade(p.color, -0.2), 'leather');
      k.add('chest', xf(torus(0.03, 0.006, 6, 18), { r: [0, Math.PI / 2, 0], p: [s * 0.14 * big, 0.16 * big, -0.18] }), shade(p.roll, -0.15), 'cloth');
    }
  }
}

function sash(k: Kit, p: Extract<Piece, { k: 'sash' }>): void {
  const s = p.side;
  const a = new Vector3(s * 0.12, 0.27, 0.05);
  const g = lock(a, new Vector3(s * 0.06, 0.2, 0.135), new Vector3(-s * 0.08, 0.04, 0.14), new Vector3(-s * 0.14, -0.06, 0.08), 0.05, { flat: 0.25, up: new Vector3(0, 0, 1), swell: 0, tip: 1, seg: 12, root: p.color, end: p.color });
  k.addRaw('spine', g, 'sheet');
  if (p.trim) k.add('spine', xf(ellipsoid(0.03, 0.03, 0.012), { p: [-s * 0.07, 0.03, 0.142] }), p.trim, 'gold');
}

function necklace(k: Kit, p: Extract<Piece, { k: 'necklace' }>): void {
  if (p.collar) {
    k.add('chest', xf(torus(0.09, 0.018, 8, 28), { r: [Math.PI / 2 + 0.35, 0, 0], s: [1.05, 1, 1], p: [0, 0.15, 0.025] }), p.color, 'gold');
  } else k.add('chest', xf(torus(0.1, 0.006, 5, 30), { r: [Math.PI / 2 + 0.55, 0, 0], p: [0, 0.13, 0.035] }), p.color, 'gold');
  if (p.beads) {
    for (let i = 0; i < 13; i++) {
      const a = (i / 12 - 0.5) * 2.4;
      k.add('chest', xf(ellipsoid(0.013, 0.013, 0.013, 8, 6), { p: [Math.sin(a) * 0.1, 0.1 + Math.cos(a) * 0.035 - 0.035, 0.07 + Math.cos(a) * 0.045] }), i % 2 ? p.beads : p.color, i % 2 ? 'gem' : 'gold');
    }
  }
  if (p.pendant) k.add('chest', xf(ellipsoid(0.022, 0.03, 0.012, 12, 10), { p: [0, 0.05, 0.13] }), p.pendant, 'gem');
}

function earrings(k: Kit, p: Extract<Piece, { k: 'earrings' }>): void {
  for (const s of SIDES) {
    const x = s * HEAD_R * 1.0;
    const y = HEAD_Y - 0.08;
    if (p.style === 'hoop') k.add('head', xf(torus(0.022, 0.005, 6, 18), { r: [0, Math.PI / 2, 0], p: [x, y - 0.02, 0.0] }), p.color, 'gold');
    else if (p.style === 'drop') {
      k.add('head', xf(ellipsoid(0.008, 0.008, 0.008), { p: [x, y, 0] }), p.color, 'gold');
      k.add('head', xf(teardrop(0.018, 0.05, 10, 1), { r: [Math.PI, 0, 0], p: [x, y - 0.012, 0] }), p.color, 'gold');
      if (p.gem) k.add('head', xf(ellipsoid(0.01, 0.012, 0.012, 10, 8), { p: [x + s * 0.008, y - 0.035, 0] }), p.gem, 'gem');
    } else {
      k.add('head', xf(teardrop(0.02, 0.055, 10, 1.4), { r: [Math.PI, 0, 0], p: [x, y, 0] }), p.color, 'gem');
    }
  }
}

function tiara(k: Kit, p: Extract<Piece, { k: 'tiara' }>): void {
  // a band across the hairline with a central peak and a cabochon
  k.add('head', xf(torus(HEAD_R * 0.98, 0.01, 6, 48, Math.PI * 0.9), { r: [Math.PI / 2 - 0.55, 0, Math.PI * 0.05 + Math.PI], p: [0, HEAD_Y + 0.07, 0.0] }), p.color, 'gold');
  const g = new CylinderGeometry(0.0, 0.055, 0.09, 4, 1);
  k.add('head', xf(g, { s: [1, 1, 0.3], r: [-0.45, Math.PI / 4, 0], p: [0, HEAD_Y + 0.2, 0.17] }), p.color, 'gold');
  for (const s of SIDES) k.add('head', xf(new CylinderGeometry(0, 0.03, 0.05, 4), { s: [1, 1, 0.3], r: [-0.45, Math.PI / 4, s * 0.25], p: [s * 0.08, HEAD_Y + 0.18, 0.165] }), p.color, 'gold');
  if (p.gem) k.add('head', xf(ellipsoid(0.026, 0.032, 0.014, 16, 12), { r: [-0.45, 0, 0], p: [0, HEAD_Y + 0.185, 0.19] }), p.gem, 'gem');
}

function crown(k: Kit, p: Extract<Piece, { k: 'crown' }>): void {
  const y = HEAD_Y + 0.25;
  k.add('head', xf(cylinder(0.165, 0.175, 0.06, 28, true), { r: [-0.15, 0, 0], p: [0, y, -0.02] }), p.color, 'gold');
  const n = p.style === 'tall' ? 8 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    k.add('head', xf(cone(0.026, p.style === 'tall' ? 0.09 : 0.06, 6), { r: [-0.15, 0, 0], p: [Math.sin(a) * 0.168, y + 0.055, Math.cos(a) * 0.168 - 0.02] }), p.color, 'gold');
  }
  if (p.gem) k.add('head', xf(ellipsoid(0.022, 0.026, 0.014), { r: [-0.15, 0, 0], p: [0, y, 0.165] }), p.gem, 'gem');
}

function hairpiece(k: Kit, p: Extract<Piece, { k: 'hairpiece' }>): void {
  // the Eastern prince's guan: a small gold crown over the topknot, with a pin
  const y = HEAD_Y + 0.3;
  k.add('head', xf(new RoundedBoxGeometry(0.1, 0.06, 0.08, 3, 0.015), { p: [0, y, -0.02] }), p.color, 'gold');
  k.add('head', xf(cylinder(0.006, 0.006, 0.2, 8), { r: [0, 0, Math.PI / 2], p: [0, y, -0.02] }), p.color, 'gold');
  if (p.gem) k.add('head', xf(ellipsoid(0.016, 0.016, 0.01), { p: [0, y, 0.022] }), p.gem, 'gem');
}

function flower(k: Kit, p: Extract<Piece, { k: 'flower' }>): void {
  const s = p.side ?? 1;
  const c = new Vector3(s * 0.19, HEAD_Y + 0.12, 0.08);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.add('head', xf(ellipsoid(0.04, 0.026, 0.012, 12, 8), { r: [0, s * 0.9, a], p: [c.x + Math.cos(a) * 0.01, c.y + Math.sin(a) * 0.03, c.z + Math.cos(a) * 0.025 * s] }), p.color, 'silk');
  }
  k.add('head', xf(ellipsoid(0.012, 0.012, 0.012), { p: [c.x + s * 0.01, c.y, c.z + 0.012] }), '#f6d25a', 'gem');
  for (const a of [2.2, 3.6]) k.add('head', xf(ellipsoid(0.03, 0.012, 0.01), { r: [0, 0, a], p: [c.x - s * 0.02, c.y + Math.sin(a) * 0.04, c.z - 0.02] }), '#3f8a4a', 'cloth');
}

function helmet(k: Kit, p: Extract<Piece, { k: 'helmet' }>): void {
  const R = HEAD_R + 0.03;
  k.add('head', xf(new SphereGeometry(R, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), { s: [1.02, 1, 1.02], p: [0, HEAD_Y + 0.02, 0] }), p.color, 'metal');
  // brim / browband and a reinforcing ridge
  k.add('head', xf(torus(R * 1.0, 0.018, 8, 40), { r: [Math.PI / 2, 0, 0], p: [0, HEAD_Y + 0.02, 0] }), p.trim ?? p.color, p.trim ? 'gold' : 'metal');
  k.add('head', xf(torus(R * 0.99, 0.013, 6, 40, Math.PI), { r: [0, Math.PI / 2, 0], p: [0, HEAD_Y + 0.02, 0] }), p.trim ?? p.color, p.trim ? 'gold' : 'metal');
  // cheek guards
  for (const s of SIDES) k.add('head', xf(new SphereGeometry(R, 12, 10, s > 0 ? Math.PI * 0.08 : Math.PI * 1.67, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.22), { p: [0, HEAD_Y + 0.02, 0] }), p.color, 'metal');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.add('head', xf(ellipsoid(0.008, 0.008, 0.008), { p: [Math.sin(a) * R * 1.01, HEAD_Y + 0.02, Math.cos(a) * R * 1.01] }), p.trim ?? '#d9d9d9', p.trim ? 'gold' : 'metal');
  }
  if (p.plume) {
    k.add('head', xf(cylinder(0.02, 0.025, 0.05, 10), { p: [0, HEAD_Y + R + 0.03, -0.02] }), p.trim ?? p.color, 'gold');
    const a = new Vector3(0, HEAD_Y + R + 0.05, -0.02);
    for (let i = 0; i < 5; i++) {
      const o = (i - 2) * 0.016;
      k.addRaw('head', lock(a.clone().add(new Vector3(o, 0, 0)), a.clone().add(new Vector3(o, 0.16, 0.05)), a.clone().add(new Vector3(o * 1.5, 0.22, -0.1)), a.clone().add(new Vector3(o * 2, 0.12, -0.28)), 0.06, { flat: 0.5, root: p.plume, end: shade(p.plume, 0.12), swell: 0.4 }), 'cloth');
    }
  }
}

function hat(k: Kit, p: Extract<Piece, { k: 'hat' }>): void {
  const y = HEAD_Y + 0.1;
  switch (p.style) {
    case 'straw':
      k.add('head', xf(cylinder(0.42, 0.44, 0.02, 40), { r: [-0.12, 0, 0], p: [0, y + 0.05, -0.01] }), p.color, 'straw');
      k.add('head', xf(new SphereGeometry(HEAD_R + 0.02, 30, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), { s: [1, 0.75, 1], r: [-0.12, 0, 0], p: [0, y + 0.05, -0.01] }), p.color, 'straw');
      for (let i = 0; i < 3; i++) k.add('head', xf(torus(0.33 + i * 0.03, 0.004, 4, 40), { r: [Math.PI / 2 - 0.12, 0, 0], p: [0, y + 0.065 - i * 0.003, -0.01] }), shade(p.color, -0.12), 'straw');
      if (p.band) k.add('head', xf(cylinder(HEAD_R + 0.025, HEAD_R + 0.025, 0.04, 30, true), { r: [-0.12, 0, 0], p: [0, y + 0.08, -0.01] }), p.band);
      break;
    case 'fisher':
      k.add('head', xf(cylinder(0.33, 0.35, 0.02, 34), { r: [-0.18, 0, 0], p: [0, y + 0.06, 0] }), p.color, 'straw');
      k.add('head', xf(cylinder(0.2, HEAD_R + 0.02, 0.13, 26), { r: [-0.18, 0, 0], p: [0, y + 0.12, -0.01] }), p.color, 'straw');
      if (p.band) k.add('head', xf(cylinder(HEAD_R + 0.025, HEAD_R + 0.03, 0.03, 26, true), { r: [-0.18, 0, 0], p: [0, y + 0.08, -0.01] }), p.band);
      break;
    case 'cap':
      k.add('head', xf(new SphereGeometry(HEAD_R + 0.03, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.45), { s: [1.05, 0.9, 1.05], p: [0, HEAD_Y + 0.04, -0.01] }), p.color);
      k.add('head', xf(cylinder(0.15, 0.15, 0.015, 24, false), { s: [1, 1, 0.65], r: [0.25, 0, 0], p: [0, HEAD_Y + 0.13, 0.2] }), shade(p.color, -0.15));
      if (p.band) k.add('head', xf(torus(HEAD_R + 0.025, 0.012, 6, 36), { r: [Math.PI / 2, 0, 0], p: [0, HEAD_Y + 0.07, -0.01] }), p.band, 'leather');
      if (p.goggles) for (const s of SIDES) {
        k.add('head', xf(torus(0.045, 0.016, 8, 18), { r: [-0.6, 0, 0], p: [s * 0.065, HEAD_Y + 0.21, 0.15] }), '#8a6a3a', 'gold');
        k.add('head', xf(ellipsoid(0.04, 0.04, 0.014), { r: [-0.6, 0, 0], p: [s * 0.065, HEAD_Y + 0.21, 0.155] }), '#6fc6e8', 'glass');
      }
      break;
    case 'kerchief':
    case 'bandana': {
      k.add('head', xf(new SphereGeometry(HEAD_R + 0.025, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), { s: [1.04, 0.95, 1.06], r: [-0.25, 0, 0], p: [0, HEAD_Y + 0.02, -0.01] }), p.color);
      if (p.band) k.add('head', xf(torus(HEAD_R + 0.02, 0.016, 6, 36), { r: [Math.PI / 2 - 0.25, 0, 0], p: [0, HEAD_Y + 0.06, 0.0] }), p.band);
      k.add('head', xf(teardrop(0.05, 0.12, 8, 1), { r: [Math.PI - 0.4, 0, 0.3], p: [0.04, HEAD_Y + 0.02, -0.25] }), p.color);
      break;
    }
    case 'scholar':
      k.add('head', xf(new RoundedBoxGeometry(0.3, 0.06, 0.3, 3, 0.02), { r: [-0.1, Math.PI / 4, 0], p: [0, HEAD_Y + 0.25, 0] }), p.color);
      break;
    case 'tricorn': {
      const brim = new CylinderGeometry(0.36, 0.36, 0.05, 3);
      brim.rotateY(Math.PI);
      k.add('head', xf(brim, { r: [-0.1, 0, 0], p: [0, HEAD_Y + 0.16, -0.01] }), p.color);
      k.add('head', xf(new SphereGeometry(HEAD_R + 0.02, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), { s: [1, 0.8, 1], p: [0, HEAD_Y + 0.07, -0.01] }), p.color);
      if (p.band) k.add('head', xf(torus(0.2, 0.01, 6, 3), { r: [Math.PI / 2 - 0.1, Math.PI, 0], p: [0, HEAD_Y + 0.185, -0.01] }), p.band, 'gold');
      break;
    }
    case 'kepi':
      k.add('head', xf(cylinder(HEAD_R * 0.86, HEAD_R + 0.025, 0.2, 26), { r: [-0.15, 0, 0], p: [0, HEAD_Y + 0.17, -0.02] }), p.color);
      k.add('head', xf(cylinder(0.14, 0.14, 0.014, 20), { s: [1, 1, 0.6], r: [0.25, 0, 0], p: [0, HEAD_Y + 0.09, 0.22] }), shade(p.color, -0.25), 'leather');
      if (p.band) k.add('head', xf(torus(HEAD_R + 0.025, 0.012, 6, 30), { r: [Math.PI / 2 - 0.15, 0, 0], p: [0, HEAD_Y + 0.09, -0.005] }), p.band, 'gold');
      break;
    case 'steel':
      k.add('head', xf(new SphereGeometry(HEAD_R + 0.04, 30, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), { s: [1.04, 0.85, 1.06], p: [0, HEAD_Y + 0.04, 0] }), p.color, 'metal');
      k.add('head', xf(cylinder(HEAD_R + 0.08, HEAD_R + 0.08, 0.015, 30), { p: [0, HEAD_Y + 0.04, 0] }), shade(p.color, -0.08), 'metal');
      break;
    case 'fur':
      k.add('head', xf(new SphereGeometry(HEAD_R + 0.035, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.48), { s: [1.06, 0.95, 1.06], p: [0, HEAD_Y + 0.03, -0.01] }), p.color, 'fur');
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        k.add('head', xf(ellipsoid(0.05, 0.04, 0.05, 10, 8), { p: [Math.sin(a) * (HEAD_R + 0.03), HEAD_Y + 0.05, Math.cos(a) * (HEAD_R + 0.03)] }), shade(p.color, 0.05), 'fur');
      }
      break;
  }
}

function glasses(k: Kit, p: Extract<Piece, { k: 'glasses' }>): void {
  const c = p.color ?? '#5a3a24';
  for (const s of SIDES) k.add('head', xf(torus(0.052, 0.006, 6, 24), { p: [s * 0.075, HEAD_Y - 0.035, HEAD_R * 0.97] }), c, 'gold');
  k.add('head', xf(cylinder(0.004, 0.004, 0.04, 6), { r: [0, 0, Math.PI / 2], p: [0, HEAD_Y - 0.03, HEAD_R * 0.99] }), c, 'gold');
  for (const s of SIDES) k.add('head', xf(cylinder(0.004, 0.004, 0.2, 6), { r: [Math.PI / 2, 0, 0], p: [s * 0.125, HEAD_Y - 0.03, 0.12] }), c, 'gold');
}

function goggles(k: Kit, p: Extract<Piece, { k: 'goggles' }>): void {
  const c = p.color ?? '#8a6a3a';
  for (const s of SIDES) {
    k.add('head', xf(cylinder(0.05, 0.05, 0.04, 18), { r: [Math.PI / 2 - 0.6, 0, 0], p: [s * 0.07, HEAD_Y + 0.17, 0.17] }), c, 'gold');
    k.add('head', xf(ellipsoid(0.042, 0.042, 0.012), { r: [-0.6, 0, 0], p: [s * 0.07, HEAD_Y + 0.185, 0.19] }), p.lens ?? '#6fc6e8', 'glass');
  }
  k.add('head', xf(torus(HEAD_R + 0.02, 0.014, 6, 36), { r: [Math.PI / 2 - 0.6, 0, 0], p: [0, HEAD_Y + 0.1, -0.02] }), '#4a3424', 'leather');
}

function pauldrons(k: Kit, p: Extract<Piece, { k: 'pauldrons' }>): void {
  for (const s of SIDES) {
    const arm = `arm${LR(s)}` as BoneName;
    for (let i = 0; i < 3; i++) k.add(arm, xf(new SphereGeometry(0.085 - i * 0.008, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), { s: [1, 0.8, 1], r: [0, 0, s * -0.3], p: [s * 0.0, 0.01 - i * 0.03, 0] }), i === 0 ? p.color : shade(p.color, -0.05), 'metal');
    if (p.trim) k.add(arm, xf(torus(0.078, 0.008, 6, 24), { r: [Math.PI / 2, 0, s * -0.3], p: [s * 0.01, -0.055, 0] }), p.trim, 'gold');
  }
}

function breastplate(k: Kit, p: Extract<Piece, { k: 'breastplate' }>, b: BodySpec): void {
  const w = 1 + (b.stocky ?? 0) * 0.18;
  const prof: [number, number][] = [[0.148, 0.0], [0.162, 0.08], [0.168, 0.15], [0.158, 0.21], [0.12, 0.255]];
  const g = oval(lathe(prof.map(([r, y]) => [r * w, y] as [number, number]), 30), 0.82, 0.12);
  k.add('spine', g, p.color, 'metal');
  if (p.trim) {
    k.add('spine', xf(torus(0.15 * w, 0.01, 6, 36), { r: [Math.PI / 2, 0, 0], s: [1, 0.82, 1], p: [0, 0.0, 0] }), p.trim, 'gold');
    k.add('spine', xf(new RoundedBoxGeometry(0.012, 0.22, 0.012, 2, 0.004), { p: [0, 0.12, 0.155 * w] }), p.trim, 'gold');
  }
  if (p.emblem) k.decal('spine', xf(new PlaneGeometry(0.09, 0.09), { p: [0, 0.14, 0.16 * w] }), emblemMaterial(p.emblem, p.emblemColor ?? '#e8b84a'));
}

function medallion(k: Kit, p: Extract<Piece, { k: 'medallion' }>): void {
  // the Highland King's round brooch on the chest / cloak clasp
  k.add('chest', xf(cylinder(0.045, 0.045, 0.014, 24), { r: [Math.PI / 2, 0, 0], p: [0.07, 0.1, 0.13] }), p.color, 'gold');
  k.add('chest', xf(torus(0.042, 0.006, 6, 24), { p: [0.07, 0.1, 0.138] }), shade(p.color, -0.1), 'gold');
  if (p.gem) k.add('chest', xf(ellipsoid(0.014, 0.014, 0.008), { p: [0.07, 0.1, 0.14] }), p.gem, 'gem');
  if (p.emblem) k.decal('chest', xf(new PlaneGeometry(0.06, 0.06), { p: [0.07, 0.1, 0.139] }), emblemMaterial(p.emblem, shade(p.color, -0.25)));
}

// ---------------------------------------------------------------------------
// Shields, weapons and tools

function shield(k: Kit, p: Extract<Piece, { k: 'shield' }>): void {
  const bone: BoneName = 'foreL';
  if (p.style === 'round') {
    k.add(bone, xf(cylinder(0.17, 0.17, 0.03, 32), { r: [0, 0, Math.PI / 2], p: [0.085, -0.08, 0.02] }), p.color, 'wood');
    for (let i = -2; i <= 2; i++) k.add(bone, xf(new RoundedBoxGeometry(0.003, 0.33, 0.015 + (2 - Math.abs(i)) * 0.0, 1, 0.001), { r: [0, Math.PI / 2, 0], p: [0.102, -0.08, 0.02 + i * 0.065] }), shade(p.color, -0.2), 'wood');
    if (p.trim) k.add(bone, xf(torus(0.17, 0.012, 6, 36), { r: [0, Math.PI / 2, 0], p: [0.1, -0.08, 0.02] }), p.trim, 'metal');
    k.add(bone, xf(ellipsoid(0.045, 0.045, 0.03), { r: [0, 0, Math.PI / 2], p: [0.105, -0.08, 0.02] }), p.boss ?? '#d4b04a', 'gold');
    return;
  }
  // heater shield: rounded top, pointed bottom, gently curved
  const g = new RoundedBoxGeometry(0.22, 0.28, 0.025, 3, 0.012);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = (0.14 - y) / 0.28;
    const w = t < 0.45 ? 1 : 1 - Math.pow((t - 0.45) / 0.55, 1.4);
    pos.setX(i, x * Math.max(0.05, w));
    pos.setZ(i, pos.getZ(i) - Math.pow(x / 0.11, 2) * 0.03);
  }
  g.computeVertexNormals();
  k.add(bone, xf(g, { r: [0, Math.PI / 2 - 1.05, 0], p: [0.09, -0.07, 0.07] }), p.color, 'cloth');
  if (p.trim) {
    const t = g.clone();
    t.scale(1.08, 1.06, 0.8);
    k.add(bone, xf(t, { r: [0, Math.PI / 2 - 1.05, 0], p: [0.078, -0.07, 0.05] }), p.trim, 'gold');
  }
  if (p.emblem) k.decal(bone, xf(new PlaneGeometry(0.14, 0.14), { r: [0, Math.PI / 2 - 1.05, 0], p: [0.104, -0.06, 0.082] }), emblemMaterial(p.emblem, p.emblemColor ?? '#e8b84a'));
}

function item(k: Kit, p: Extract<Piece, { k: 'item' }>): void {
  const hand = p.hand === 'L' || p.hand === 'R' ? (`hand${p.hand}` as BoneName) : null;
  const H = hand ?? 'chest';
  const metal = p.color ?? '#d9dde2';
  const wood = p.accent ?? '#8a5a32';
  // Held items are authored pointing forward (+z); tilt them up the way a fist holds them.
  const tilt = hand ? ({ sword: -0.6, spear: -1.25, staff: -1.25, hammer: -0.9, axe: -0.9, rod: -0.2, net: -0.6, scepter: -1.0, oar: -1.2, musket: -1.1, rifle: -1.1 } as Partial<Record<Item, number>>)[p.item] ?? 0 : 0;
  const grip = (geo: BufferGeometry, color: string, s: Surface, t: { p?: V3; r?: V3 } = {}) => {
    const g = xf(geo, { r: t.r, p: t.p });
    if (tilt) {
      g.translate(0, 0.06, 0);
      g.rotateX(tilt);
      g.translate(0, -0.06, 0);
    }
    k.add(H, g, color, s);
  };
  switch (p.item as Item) {
    case 'sword':
      grip(cylinder(0.014, 0.014, 0.07, 10), '#6a3a22', 'leather', { p: [0, -0.06, 0.02], r: [Math.PI / 2, 0, 0] });
      grip(new RoundedBoxGeometry(0.11, 0.018, 0.026, 2, 0.006), '#d4b04a', 'gold', { p: [0, -0.06, 0.06] });
      grip(xf(cone(0.028, 0.06, 4), { s: [1, 1, 0.25] }), metal, 'metal', { p: [0, -0.06, 0.33], r: [Math.PI / 2, 0, 0] });
      grip(new RoundedBoxGeometry(0.052, 0.012, 0.24, 2, 0.004), metal, 'metal', { p: [0, -0.06, 0.18] });
      grip(ellipsoid(0.018, 0.018, 0.018), '#d4b04a', 'gold', { p: [0, -0.06, -0.02] });
      break;
    case 'spear':
      grip(cylinder(0.014, 0.014, 0.9, 10), wood, 'wood', { p: [0, -0.06, 0.12], r: [Math.PI / 2, 0, 0] });
      grip(xf(cone(0.04, 0.13, 4), { s: [1, 1, 0.35] }), metal, 'metal', { p: [0, -0.06, 0.63], r: [Math.PI / 2, 0, 0] });
      grip(torus(0.02, 0.008, 6, 12), '#d4b04a', 'gold', { p: [0, -0.06, 0.56] });
      break;
    case 'bow': {
      const g = torus(0.24, 0.011, 6, 28, Math.PI * 0.9);
      grip(g, wood, 'wood', { r: [0, Math.PI / 2, -Math.PI * 0.45 + Math.PI], p: [0, -0.04, -0.2] });
      grip(cylinder(0.002, 0.002, 0.47, 4), '#f0e8d8', 'cloth', { p: [0, -0.04, -0.2 + 0.07] });
      grip(cylinder(0.016, 0.016, 0.06, 8), '#6a3a22', 'leather', { p: [0, -0.04, 0.035] });
      break;
    }
    case 'quiver':
      k.add('chest', xf(cylinder(0.05, 0.04, 0.3, 14), { r: [0.35, 0, -0.4], p: [-0.08, 0.02, -0.15] }), p.color ?? '#7a4a2a', 'leather');
      for (let i = 0; i < 4; i++) {
        k.add('chest', xf(cylinder(0.004, 0.004, 0.16, 4), { r: [0.35, 0, -0.4], p: [-0.12 + i * 0.012, 0.2, -0.2] }), '#c89a5a', 'wood');
        k.add('chest', xf(cone(0.016, 0.04, 3), { r: [0.35, 0, -0.4], p: [-0.155 + i * 0.012, 0.28, -0.23] }), i % 2 ? '#d84a3a' : '#f0e8d8', 'cloth');
      }
      break;
    case 'hammer':
      grip(cylinder(0.016, 0.016, 0.3, 10), wood, 'wood', { p: [0, -0.06, 0.08], r: [Math.PI / 2, 0, 0] });
      grip(new RoundedBoxGeometry(0.15, 0.08, 0.08, 3, 0.015), metal, 'metal', { p: [0, -0.06, 0.24] });
      break;
    case 'spyglass':
      grip(cylinder(0.026, 0.03, 0.16, 16), '#3a3036', 'metal', { p: [0, -0.04, 0.05], r: [Math.PI / 2, 0, 0] });
      grip(torus(0.03, 0.007, 6, 16), '#d4b04a', 'gold', { p: [0, -0.04, 0.13] });
      grip(torus(0.027, 0.006, 6, 16), '#d4b04a', 'gold', { p: [0, -0.04, -0.02] });
      break;
    case 'staff':
      grip(cylinder(0.016, 0.018, 1.0, 10), wood, 'wood', { p: [0, -0.06, 0.1], r: [Math.PI / 2, 0, 0] });
      break;
    case 'book':
      grip(new RoundedBoxGeometry(0.16, 0.2, 0.04, 2, 0.008), p.color ?? '#7a3a2a', 'leather', { p: [0, -0.06, 0.05], r: [-0.4, 0, 0] });
      grip(new RoundedBoxGeometry(0.15, 0.19, 0.03, 2, 0.004), '#f4ead6', 'cloth', { p: [0.006, -0.06, 0.05], r: [-0.4, 0, 0] });
      break;
    case 'scroll':
      grip(cylinder(0.025, 0.025, 0.16, 12), '#f4e6c6', 'cloth', { p: [0, -0.05, 0.04], r: [0, 0, Math.PI / 2] });
      grip(torus(0.026, 0.005, 5, 12), '#c03a3a', 'cloth', { p: [0, -0.05, 0.04], r: [0, Math.PI / 2, 0] });
      break;
    case 'basket':
      grip(lathe([[0.08, -0.06], [0.11, 0.0], [0.12, 0.05]], 18), '#c8945a', 'straw', { p: [0, -0.06, 0.1] });
      grip(torus(0.1, 0.01, 5, 18, Math.PI), '#a8743a', 'straw', { p: [0, -0.0, 0.1] });
      for (let i = 0; i < 4; i++) grip(ellipsoid(0.03, 0.03, 0.03), ['#e8823a', '#d84a3a', '#7ac04a', '#f0e8d8'][i], 'cloth', { p: [Math.cos(i * 1.6) * 0.05, -0.0, 0.1 + Math.sin(i * 1.6) * 0.05] });
      break;
    case 'net':
      grip(cylinder(0.012, 0.012, 0.5, 8), wood, 'wood', { p: [0, -0.06, 0.15], r: [Math.PI / 2 - 0.3, 0, 0] });
      grip(torus(0.15, 0.008, 6, 24), wood, 'wood', { p: [0, 0.03, 0.42], r: [0.3, 0, 0] });
      break;
    case 'herbs':
      for (let i = 0; i < 5; i++) grip(teardrop(0.02, 0.1, 6, 1), i % 2 ? '#5aa05a' : '#7ac06a', 'cloth', { p: [Math.sin(i) * 0.02, -0.05, 0.05], r: [-1.2 + i * 0.15, 0, i * 0.4 - 0.8] });
      grip(ellipsoid(0.018, 0.018, 0.018), '#f4a8c8', 'cloth', { p: [0.02, -0.02, 0.14] });
      break;
    case 'rod':
      grip(cylinder(0.01, 0.014, 0.7, 8), wood, 'wood', { p: [0, -0.05, 0.25], r: [Math.PI / 2 - 0.6, 0, 0] });
      break;
    case 'scepter':
      grip(cylinder(0.014, 0.014, 0.32, 10), '#d4b04a', 'gold', { p: [0, -0.06, 0.08], r: [Math.PI / 2, 0, 0] });
      grip(ellipsoid(0.04, 0.04, 0.04), p.color ?? '#3a6ad8', 'gem', { p: [0, -0.06, 0.26] });
      break;
    case 'fan':
      grip(xf(cylinder(0.12, 0.12, 0.006, 20, false), { s: [1, 1, 1] }), p.color ?? '#f4ead6', 'silk', { p: [0, 0.02, 0.08], r: [0.2, 0, 0] });
      break;
    case 'bucket':
      grip(cylinder(0.07, 0.06, 0.1, 16), '#7a5a3a', 'wood', { p: [0, -0.12, 0.02] });
      grip(torus(0.07, 0.006, 5, 16), '#8a8a8a', 'metal', { p: [0, -0.07, 0.02], r: [Math.PI / 2, 0, 0] });
      break;
    case 'satchel':
      k.add('hips', xf(new RoundedBoxGeometry(0.14, 0.12, 0.06, 3, 0.02), { r: [0, -0.5, 0], p: [-0.15, 0.0, 0.06] }), p.color ?? '#9a6838', 'leather');
      break;
    case 'map':
      grip(new RoundedBoxGeometry(0.18, 0.13, 0.006, 1, 0.002), '#efe0bc', 'cloth', { p: [0, -0.05, 0.08], r: [-0.6, 0, 0] });
      break;
    case 'sack':
      k.add('chest', xf(ellipsoid(0.12, 0.14, 0.1), { p: [0, 0.0, -0.18] }), '#c8a878', 'cloth');
      break;
    case 'oar':
      grip(cylinder(0.012, 0.012, 0.8, 8), wood, 'wood', { p: [0, -0.05, 0.2], r: [Math.PI / 2, 0, 0] });
      break;
    case 'axe':
      grip(cylinder(0.016, 0.018, 0.34, 10), wood, 'wood', { p: [0, -0.06, 0.1], r: [Math.PI / 2, 0, 0] });
      grip(xf(new RoundedBoxGeometry(0.02, 0.13, 0.09, 2, 0.008), {}), metal, 'metal', { p: [0, -0.02, 0.24] });
      break;
    case 'musket':
    case 'rifle': {
      const long = p.item === 'musket' ? 0.46 : 0.38;
      grip(new RoundedBoxGeometry(0.04, 0.06, 0.2, 2, 0.012), wood, 'wood', { p: [0, -0.06, -0.06] });
      grip(cylinder(0.012, 0.014, long, 8), '#3a3e44', 'metal', { p: [0, -0.04, 0.04 + long / 2], r: [Math.PI / 2, 0, 0] });
      grip(new RoundedBoxGeometry(0.035, 0.04, 0.12, 2, 0.01), wood, 'wood', { p: [0, -0.05, 0.1] });
      if (p.item === 'rifle') grip(cone(0.009, 0.08, 4), metal, 'metal', { p: [0, -0.04, 0.08 + long], r: [Math.PI / 2, 0, 0] });
      break;
    }
  }
}

// ---------------------------------------------------------------------------

/** Every part of a character except the painted head sphere and the hair. */
export function buildParts(spec: ChibiSpec): Part[] {
  const k = new Kit(spec);
  const b = spec.body ?? {};
  body(k, b);
  for (const p of spec.outfit) {
    switch (p.k) {
      case 'tunic': tunic(k, p, b); break;
      case 'sleeves': sleeves(k, p, b); break;
      case 'tabard': tabard(k, p, b); break;
      case 'vest': vest(k, p, b); break;
      case 'robe': robe(k, p, b); break;
      case 'gown': gown(k, p, b); break;
      case 'skirt': skirt(k, p); break;
      case 'apron': apron(k, p); break;
      case 'pants': pants(k, p, b); break;
      case 'boots': boots(k, p, b); break;
      case 'sandals': sandals(k, p); break;
      case 'shoes': shoes(k, p); break;
      case 'gloves': gloves(k, p); break;
      case 'bracers': bracers(k, p); break;
      case 'bangles':
        for (const s of SIDES) for (let i = 0; i < 3; i++) k.add(`fore${LR(s)}` as BoneName, xf(torus(0.036, 0.006, 6, 16), { r: [Math.PI / 2, 0, 0], p: [0, -0.1 + i * 0.014, 0] }), p.color, 'gold');
        break;
      case 'belt': belt(k, p, b); break;
      case 'strap': strap(k, p, b); break;
      case 'pouch': pouch(k, p); break;
      case 'scarf': scarf(k, p); break;
      case 'cape': cape(k, p); break;
      case 'furCloak': furCloak(k, p); break;
      case 'backpack': backpack(k, p); break;
      case 'sash': sash(k, p); break;
      case 'necklace': necklace(k, p); break;
      case 'earrings': earrings(k, p); break;
      case 'tiara': tiara(k, p); break;
      case 'crown': crown(k, p); break;
      case 'hairpiece': hairpiece(k, p); break;
      case 'flower': flower(k, p); break;
      case 'helmet': helmet(k, p); break;
      case 'hat': hat(k, p); break;
      case 'glasses': glasses(k, p); break;
      case 'goggles': goggles(k, p); break;
      case 'pauldrons': pauldrons(k, p); break;
      case 'breastplate': breastplate(k, p, b); break;
      case 'medallion': medallion(k, p); break;
      case 'shield': shield(k, p); break;
      case 'item': item(k, p); break;
    }
  }
  // Minimal fallbacks so every character has a torso, legs and feet.
  if (!k.has('tunic') && !k.has('robe') && !k.has('gown') && !k.has('vest') && !k.has('breastplate')) torso(k, '#e8e0d0');
  if (!k.has('pants') && !k.has('robe') && !k.has('gown') && !k.has('skirt')) pants(k, { k: 'pants', color: '#5a4a3e' }, b);
  if (!k.has('sleeves') && !k.has('robe')) sleeves(k, { k: 'sleeves', color: k.get('tunic')?.color ?? '#e8e0d0' }, b);
  if (!k.has('boots') && !k.has('sandals') && !k.has('shoes')) shoes(k, { k: 'shoes', color: '#6a4a32' });
  if ((k.has('skirt') || k.has('gown') || k.has('robe')) && !k.has('pants')) {
    // legs under skirts
    for (const s of SIDES) {
      k.add(`thigh${LR(s)}` as BoneName, xf(capsule(0.055, 0.12, 4, 12), { p: [0, -0.085, 0] }), k.spec.face.skin, 'skin');
      if (!k.has('boots')) k.add(`shin${LR(s)}` as BoneName, xf(capsule(0.045, 0.12, 4, 12), { p: [0, -0.08, 0] }), k.spec.face.skin, 'skin');
    }
  }
  return k.parts;
}

export { buckle };
