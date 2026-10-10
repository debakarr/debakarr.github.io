// Leaders for the royal audience, built on the KayKit Adventurers (CC0): the
// character, hair colour, regalia and pose follow the leader's title, gender,
// age and people, so two rulers never look alike. Faces move: brows and eyes
// are separate pieces of the KayKit head, which we bend for anger, sorrow,
// joy and surprise (and blinks), and a small mouth changes shape.

import { AnimationClip, BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial, Object3D, SkinnedMesh, Vector3 } from 'three';
import { Rng } from '../../../shared/rng';
import { box, cone, cylinder, ellipsoid, faceted, merge, part, torus, xf } from '../geo';
import { clip, hasClip, registerClip, type CharName } from '../kit';
import { liveFigure, play, tickFigure, type LiveFigure } from '../live';
import { crown } from '../looks';
import type { FigureSpec } from '../rig';

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

const HAIRS = ['#3a2418', '#1e1614', '#6b3f22', '#b8743a', '#e0b860', '#5a2a2a', '#c86a3a'];

type Regalia = 'crown' | 'bigcrown' | 'tiara' | 'feathers' | 'laurel' | 'kepi' | 'glasses' | 'tophat' | 'none';

interface Plan {
  char: CharName;
  show: string[];
  regalia: Regalia;
  scepter: 'none' | 'scepter' | 'staff' | 'book';
  seated: boolean;
  sash: boolean;
}

function plan(look: LeaderLook, rng: Rng): Plan {
  const f = look.gender === 'f';
  const t = look.title;
  const modern = look.tier >= 5;
  const pickF = (): CharName => (rng.chance(0.75) ? 'rogue' : 'hooded');
  if (/Chief/.test(t)) return f ? { char: 'rogue', show: ['Rogue_Cape'], regalia: 'feathers', scepter: 'staff', seated: true, sash: false } : { char: 'barbarian', show: ['Barbarian_Hat', 'Barbarian_Cape'], regalia: 'none', scepter: 'staff', seated: true, sash: false };
  if (/King|Queen/.test(t)) return { char: f ? 'rogue' : rng.chance(0.5) ? 'knight' : 'barbarian', show: [f ? 'Rogue_Cape' : 'Knight_Cape', 'Barbarian_Cape'], regalia: f ? 'tiara' : 'crown', scepter: 'scepter', seated: true, sash: false };
  if (/Priest/.test(t)) return f ? { char: 'hooded', show: ['Rogue_Cape'], regalia: 'none', scepter: 'book', seated: true, sash: false } : { char: 'mage', show: ['Mage_Hat', 'Mage_Cape'], regalia: 'none', scepter: 'staff', seated: true, sash: false };
  if (/Consul/.test(t)) return { char: f ? pickF() : 'mage', show: ['Mage_Cape', 'Rogue_Cape'], regalia: 'laurel', scepter: 'book', seated: true, sash: false };
  if (/Emperor|Empress/.test(t)) return { char: f ? 'rogue' : rng.chance(0.5) ? 'knight' : 'barbarian', show: ['Knight_Cape', 'Barbarian_Cape', 'Rogue_Cape'], regalia: 'bigcrown', scepter: 'scepter', seated: true, sash: false };
  if (/Supreme/.test(t)) return { char: f ? 'rogue' : 'knight', show: ['Knight_Cape', 'Rogue_Cape'], regalia: 'kepi', scepter: 'none', seated: !modern, sash: true };
  if (/Chancellor/.test(t)) return { char: f ? pickF() : 'mage', show: [], regalia: 'glasses', scepter: 'none', seated: !modern, sash: true };
  if (/Director/.test(t)) return { char: f ? 'hooded' : 'mage', show: [], regalia: 'glasses', scepter: 'none', seated: false, sash: false };
  if (/Steward/.test(t)) return { char: f ? 'rogue' : 'barbarian', show: [], regalia: 'tophat', scepter: 'none', seated: false, sash: true };
  return { char: f ? 'rogue' : 'mage', show: [], regalia: 'none', scepter: 'none', seated: !modern, sash: true };
}

function regaliaGeo(r: Regalia, team: string): BufferGeometry | null {
  switch (r) {
    case 'crown': return crown();
    case 'bigcrown': {
      const g = crown();
      g.scale(1.15, 1.35, 1.15);
      g.translate(0, -0.35, 0);
      return merge([g, part(faceted(ellipsoid(0.12, 0.12, 0.12, 6, 4)), '#e2384a', { p: [0, 1.32, 0.36] })]);
    }
    case 'tiara': {
      // a slim gold band with a peaked, jewelled front
      const parts = [part(cylinder(0.55, 0.57, 0.07, 18, true), '#f2c14e', { p: [0, 0.84, 0] })];
      for (let k = -3; k <= 3; k++) {
        const a = k * 0.3;
        const h = [0.26, 0.15, 0.1, 0.07][Math.abs(k)];
        parts.push(part(faceted(cone(0.05, h, 4)), '#f2c14e', { p: [Math.sin(a) * 0.56, 0.87 + h / 2, Math.cos(a) * 0.56] }));
        if (k % 2 === 0) parts.push(part(faceted(ellipsoid(0.045, 0.045, 0.045, 6, 4)), k ? '#e2384a' : '#3ad0e2', { p: [Math.sin(a) * 0.585, 0.85, Math.cos(a) * 0.585] }));
      }
      return merge(parts);
    }
    case 'feathers': {
      // a beaded band with a fan of feathers standing at the back
      const parts = [part(cylinder(0.55, 0.57, 0.12, 16, true), team, { p: [0, 0.82, 0] })];
      for (let k = 0; k < 7; k++) parts.push(part(faceted(ellipsoid(0.04, 0.04, 0.04, 5, 4)), k % 2 ? '#f2c14e' : '#e2384a', { p: [Math.cos((k / 7) * Math.PI) * 0.56, 0.82, Math.sin((k / 7) * Math.PI) * 0.56] }));
      for (let k = 0; k < 7; k++) {
        const a = (k - 3) * 0.34;
        const g = faceted(ellipsoid(0.075, 0.36, 0.025, 6, 4));
        g.translate(0, 0.34, 0);
        g.rotateX(0.12);
        g.rotateZ(-a);
        parts.push(part(g, k % 2 ? '#f4ecd8' : '#e8a040', { p: [Math.sin(a) * 0.18, 0.95, -0.28] }));
        const tip = faceted(ellipsoid(0.06, 0.1, 0.028, 6, 4));
        tip.translate(0, 0.66, 0);
        tip.rotateX(0.12);
        tip.rotateZ(-a);
        parts.push(part(tip, team, { p: [Math.sin(a) * 0.18, 0.95, -0.28] }));
      }
      return merge(parts);
    }
    case 'laurel': {
      const parts: BufferGeometry[] = [];
      for (let k = 0; k < 14; k++) {
        const a = Math.PI * (0.05 + (k / 13) * 0.9);
        for (const s of [-1, 1]) parts.push(part(faceted(xf(ellipsoid(0.09, 0.035, 0.05, 6, 4), { r: [0, s * a, 0.5] })), k % 2 ? '#5aa83a' : '#7cc24a', { p: [s * Math.cos(a) * 0.48, 1.0, -Math.sin(a) * 0.44 + 0.12] }));
      }
      return merge(parts);
    }
    case 'kepi':
      return merge([part(cylinder(0.52, 0.58, 0.4, 14), '#2f3e3e', { p: [0, 1.0, -0.02] }), part(box(0.95, 0.06, 0.4), '#1e2626', { p: [0, 0.82, 0.42] }), part(cylinder(0.59, 0.59, 0.09, 14), team, { p: [0, 0.86, -0.02] }), part(faceted(ellipsoid(0.1, 0.1, 0.04, 6, 4)), '#f2c14e', { p: [0, 1.0, 0.56] })]);
    case 'tophat':
      return merge([part(cylinder(0.4, 0.42, 0.62, 14), '#24262c', { p: [0, 1.15, 0] }), part(cylinder(0.72, 0.72, 0.05, 16), '#24262c', { p: [0, 0.86, 0] }), part(cylinder(0.43, 0.43, 0.1, 14), team, { p: [0, 0.94, 0] })]);
    case 'glasses': {
      const parts: BufferGeometry[] = [];
      for (const s of [-1, 1]) parts.push(part(torus(0.11, 0.018, 5, 14), '#2a2a30', { p: [s * 0.21, 0.37, 0.53] }));
      parts.push(part(box(0.12, 0.025, 0.02), '#2a2a30', { p: [0, 0.39, 0.54] }));
      return merge(parts);
    }
    case 'none': return null;
  }
}

function scepterGeo(kind: Plan['scepter']): BufferGeometry | null {
  if (kind === 'scepter') return merge([part(cylinder(0.04, 0.05, 1.5, 8), '#f2c14e', { p: [0, 0.55, 0] }), part(faceted(ellipsoid(0.14, 0.14, 0.14, 8, 6)), '#e2384a', { p: [0, 1.34, 0] }), part(torus(0.12, 0.03, 5, 12), '#f2c14e', { p: [0, 1.22, 0], r: [Math.PI / 2, 0, 0] })]);
  return null;
}

/** Sitting lower body under a talking upper body (seated leaders gesture from the throne). */
function seatedClip(upper: string): string {
  const name = `Seat_${upper}`;
  if (hasClip(name)) return name;
  const up = clip(upper);
  const low = clip('Sit_Chair_Idle');
  const UPPER = /^(spine|chest|upperarm|lowerarm|wrist|hand|handslot|head|elbowIK|handIK)/;
  registerClip(new AnimationClip(name, up.duration, [...up.tracks.filter((t) => UPPER.test(t.name)), ...low.tracks.filter((t) => !UPPER.test(t.name))]));
  return name;
}

interface FacePart {
  idx: number[];
  base: Float32Array;
  cx: number;
  cy: number;
}

export interface KitLeader {
  root: Object3D;
  figure: LiveFigure;
  seated: boolean;
  expression: Expression;
  setExpression(e: Expression): void;
  gesture(g: Gesture): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

/** A leader about 2.4 units tall (feet at the origin, facing +z); `stand` keeps them on their feet. */
export function buildKitLeader(look: LeaderLook, material: MeshStandardMaterial, stand = false): KitLeader {
  const rng = new Rng(look.seed);
  const p = plan(look, rng);
  if (stand) p.seated = false;
  const hair = new Color(look.age > 0.72 ? '#c9c4c0' : rng.pick(HAIRS));
  const props: FigureSpec['props'] = [];
  const reg = regaliaGeo(p.regalia, look.color);
  if (reg) props.push({ geo: reg, bone: 'head', t: {} });
  const sc = scepterGeo(p.scepter);
  if (sc) props.push({ geo: sc, bone: 'handslot.r', t: { p: [0, 0.03, 0], r: [0, Math.PI, 0] } });
  // a sash of office across the chest, with a gold medal
  if (p.sash) props.push({ geo: merge([part(box(0.16, 1.0, 0.05), look.color, { p: [0.02, 0.1, 0.4], r: [0.12, 0, 0.75] }), part(faceted(ellipsoid(0.09, 0.09, 0.03, 6, 4)), '#f2c14e', { p: [-0.18, -0.08, 0.45] })]), bone: 'chest', t: {} });
  const show = [...p.show];
  if (p.scepter === 'staff' && p.char === 'mage') show.push('2H_Staff');
  if (p.scepter === 'book') show.push('Spellbook');
  const spec: FigureSpec = {
    char: p.char,
    show,
    props,
    clips: p.seated ? { idle: 'Sit_Chair_Idle' } : { idle: 'Idle' },
  };
  if (p.scepter === 'staff' && p.char !== 'mage') spec.props!.push({ geo: merge([part(cylinder(0.05, 0.06, 2.2, 7), '#8a5a34', { p: [0, 0.4, 0] }), part(faceted(ellipsoid(0.16, 0.2, 0.16, 6, 5)), look.color, { p: [0, 1.55, 0] })]), bone: 'handslot.r', t: { p: [0, 0.03, 0], r: [0, Math.PI, 0] } });
  const figure = liveFigure(spec, material);
  const root = new Object3D();
  root.add(figure.root);

  // --- the face: our own copy of the head geometry, hair recoloured ----------------------------
  let head: SkinnedMesh | null = null;
  figure.root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh && /Head/.test(o.name)) head = o as SkinnedMesh;
  });
  const brows: FacePart[] = [];
  const eyes: FacePart[] = [];
  let pos: BufferAttribute | null = null;
  let mouthAt = new Vector3(0, 0.12, 0.46);
  if (head) {
    const h = head as SkinnedMesh;
    const g = h.geometry.clone();
    const P = g.attributes.position;
    pos = new BufferAttribute(new Float32Array(P.count * 3), 3);
    for (let i = 0; i < P.count; i++) pos.setXYZ(i, P.getX(i), P.getY(i), P.getZ(i));
    g.setAttribute('position', pos);
    const C = g.attributes.color;
    const col = new BufferAttribute(new Float32Array(C.count * 3), 3);
    const team = g.attributes.team;
    const c = new Color();
    // components by welded position
    const n = P.count;
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const join = (a: number, b: number) => {
      a = find(a);
      b = find(b);
      if (a !== b) parent[a] = b;
    };
    const key = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(P.getX(i) * 4000)},${Math.round(P.getY(i) * 4000)},${Math.round(P.getZ(i) * 4000)}`;
      const o = key.get(k);
      if (o === undefined) key.set(k, i);
      else join(i, o);
    }
    const ix = g.index!;
    for (let t = 0; t < ix.count; t += 3) {
      join(ix.getX(t), ix.getX(t + 1));
      join(ix.getX(t), ix.getX(t + 2));
    }
    const comps = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let l = comps.get(r);
      if (!l) comps.set(r, (l = []));
      l.push(i);
    }
    const sorted = [...comps.values()].sort((a, b) => b.length - a.length);
    const main = new Set(sorted[0]);
    const info = sorted.map((vs) => {
      let x = 0, y = 0, z = 0, l = 0;
      for (const i of vs) {
        x += P.getX(i);
        y += P.getY(i);
        z += P.getZ(i);
        c.setRGB(C.getX(i), C.getY(i), C.getZ(i));
        l += c.r * 0.3 + c.g * 0.6 + c.b * 0.1;
      }
      return { vs, x: x / vs.length, y: y / vs.length, z: z / vs.length, lum: l / vs.length };
    });
    // eyes: the two darkest small parts; brows: the pair just above them
    const small = info.slice(1).filter((p2) => Math.abs(p2.x) > 0.0001);
    const eyeParts = [...small].sort((a, b) => a.lum - b.lum).slice(0, 2);
    const eyeY = eyeParts.reduce((a, b) => a + b.y, 0) / Math.max(1, eyeParts.length);
    const browParts = small.filter((q) => !eyeParts.includes(q) && q.y > eyeY && Math.abs(q.z - eyeParts[0].z) < Math.abs(eyeParts[0].z) * 0.5).sort((a, b) => a.y - b.y).slice(0, 2);
    const mk = (q: (typeof info)[number]): FacePart => ({ idx: q.vs, base: Float32Array.from(q.vs.flatMap((i) => [P.getX(i), P.getY(i), P.getZ(i)])), cx: q.x, cy: q.y });
    for (const q of eyeParts) eyes.push(mk(q));
    for (const q of browParts) brows.push(mk(q));
    // hair: the main part's non-skin vertices (and beards) take the leader's hair colour
    for (let i = 0; i < n; i++) {
      c.setRGB(C.getX(i), C.getY(i), C.getZ(i));
      const isSkin = (team?.getX(i) ?? 0) > 1.5;
      if ((main.has(i) || browParts.some((b) => b.vs.includes(i))) && !isSkin && h.name !== 'Knight_Head') {
        const l = Math.max(0.15, c.r * 0.3 + c.g * 0.6 + c.b * 0.1);
        c.copy(hair).multiplyScalar(Math.min(1.6, l * 2.2));
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    g.setAttribute('color', col);
    h.geometry = g;
    h.userData.keep = false;
    // the mouth sits under the nose: find the nose (the frontmost centred part)
    const nose = info.slice(1).filter((q) => Math.abs(q.x) < 0.02).sort((a, b) => b.z - a.z)[0];
    figure.root.updateMatrixWorld(true);
    const bone = figure.bones.get('head');
    if (nose && bone) {
      const v = new Vector3();
      let lowest = Infinity;
      let front = -Infinity;
      for (const i of nose.vs) {
        h.getVertexPosition(i, v);
        h.localToWorld(v);
        lowest = Math.min(lowest, v.y);
        front = Math.max(front, v.z);
      }
      const at = new Vector3(0, lowest - 0.075, front - 0.04);
      bone.worldToLocal(at);
      mouthAt = at;
    }
  }
  // mouths: one mesh per shape, only one shown
  const mouthMat = new MeshStandardMaterial({ color: '#7a2e2e', roughness: 0.6 });
  const smile = torus(0.075, 0.016, 5, 12, Math.PI);
  smile.rotateZ(Math.PI);
  const frown = torus(0.065, 0.016, 5, 12, Math.PI);
  const flat = box(0.12, 0.022, 0.02);
  const open = xf(faceted(ellipsoid(0.05, 0.06, 0.02, 10, 6)), {});
  const mouths: Record<Expression, Mesh> = {
    neutral: new Mesh(flat, mouthMat),
    happy: new Mesh(smile, mouthMat),
    sad: new Mesh(frown, mouthMat),
    angry: new Mesh(flat.clone().scale(1.15, 0.8, 1), mouthMat),
    surprised: new Mesh(open, mouthMat),
  };
  const hb = figure.bones.get('head');
  for (const [k, m] of Object.entries(mouths)) {
    m.position.copy(mouthAt);
    if (k === 'happy') m.position.y += 0.03;
    if (k === 'sad') m.position.y -= 0.02;
    m.visible = k === 'neutral';
    m.userData.keep = false;
    hb?.add(m);
  }

  // --- expression state ------------------------------------------------------------------------
  const target = { brow: 0, lift: 0, eye: 1 };
  const cur = { brow: 0, lift: 0, eye: 1 };
  let blinkUntil = -1;
  let nextBlink = 1.5 + rng.next() * 2;
  let gest: Gesture = 'none';
  let gestStart = -10;
  let lastT = 0;
  const leader: KitLeader = {
    root,
    figure,
    seated: p.seated,
    expression: 'neutral',
    setExpression(e) {
      this.expression = e;
      for (const [k, m] of Object.entries(mouths)) m.visible = k === e;
      target.brow = e === 'angry' ? 0.42 : e === 'sad' ? -0.36 : e === 'happy' ? -0.08 : 0;
      target.lift = e === 'surprised' ? 0.06 : e === 'happy' ? 0.025 : e === 'angry' ? -0.025 : e === 'sad' ? 0.01 : 0;
      target.eye = e === 'happy' ? 0.55 : e === 'surprised' ? 1.25 : e === 'angry' ? 0.8 : 1;
    },
    gesture(g) {
      gest = g;
      gestStart = lastT;
      const upper = g === 'welcome' ? 'Cheer' : g === 'open' ? 'Interact' : g === 'refuse' ? 'Block' : g === 'point' ? '1H_Ranged_Shoot' : null;
      if (!upper) return;
      const name = p.seated ? seatedClip(upper) : upper;
      play(figure, 'attack', 0.3, name);
    },
    update(dt, t) {
      lastT = t;
      tickFigure(figure, dt, t);
      // back to the resting clip once a gesture is done
      if (gest !== 'none' && t - gestStart > (figure.current?.getClip().duration ?? 1.5)) {
        gest = 'none';
        play(figure, 'idle', 0.45);
      }
      const k = 1 - Math.exp(-dt * 10);
      cur.brow += (target.brow - cur.brow) * k;
      cur.lift += (target.lift - cur.lift) * k;
      cur.eye += (target.eye - cur.eye) * k;
      if (t > nextBlink) {
        blinkUntil = t + 0.12;
        nextBlink = t + 2.2 + rng.next() * 3;
      }
      const blink = t < blinkUntil ? 0.08 : 1;
      if (!pos) return;
      for (const b of brows) {
        const s = Math.sign(b.cx) * cur.brow;
        const cs = Math.cos(s);
        const sn = Math.sin(s);
        b.idx.forEach((i, j) => {
          const dx = b.base[j * 3] - b.cx;
          const dy = b.base[j * 3 + 1] - b.cy;
          pos!.setXYZ(i, b.cx + dx * cs - dy * sn, b.cy + dx * sn + dy * cs + cur.lift, b.base[j * 3 + 2]);
        });
      }
      for (const e of eyes) {
        const sy = cur.eye * blink;
        e.idx.forEach((i, j) => {
          const dy = e.base[j * 3 + 1] - e.cy;
          pos!.setXYZ(i, e.base[j * 3], e.cy + dy * sy + (cur.eye < 0.7 ? 0.01 : 0), e.base[j * 3 + 2]);
        });
      }
      pos.needsUpdate = true;
    },
    dispose() {
      if (head) (head as SkinnedMesh).geometry.dispose();
      mouthMat.dispose();
      for (const m of Object.values(mouths)) m.geometry.dispose();
    },
  };
  return leader;
}
