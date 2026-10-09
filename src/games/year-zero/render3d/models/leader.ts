// Leaders as characters for the royal audience: a big-headed storybook
// figure with a painted face that changes expression, a hairstyle and
// regalia chosen from their title and era (feathers for a chief, a crown
// for a monarch, a laurel for a consul, a suit for a president), robes in
// their people's colour, and arms that gesture as they speak.

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  SphereGeometry,
} from 'three';
import { Rng } from '../../../shared/rng';
import { box, capsule, cone, cylinder, ellipsoid, hemisphere, lathe, merge, part, sphere, torus, xf } from '../geo';

export type Expression = 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised';

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

const HAIRS = ['#3a2418', '#1e1614', '#6b3f22', '#b8743a', '#e0b860', '#8a8a92', '#5a2a2a'];
const EYES = ['#5a3a22', '#2f6fb8', '#3f8a4a', '#8a5a2a', '#6a4aa8'];
const GOLD = '#f2c14e';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function shade(hex: string, l: number): string {
  const c = new Color(hex);
  c.offsetHSL(0, 0, l);
  return `#${c.getHexString()}`;
}

interface FaceStyle {
  skin: string;
  eye: string;
  brow: string;
  male: boolean;
  age: number;
}

/** Paints a face onto an equirect strip of the head sphere: the front (+z) is at u = 0.25. */
function paintFace(f: FaceStyle, e: Expression, blink: boolean): CanvasTexture {
  const W = 1024;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = f.skin;
  ctx.fillRect(0, 0, W, H);
  const fx = W * 0.25;
  const ey = H * 0.55;
  const dx = 58;
  const lash = '#24161c';
  const happy = e === 'happy';
  // blush
  ctx.fillStyle = `rgba(255,110,120,${happy ? 0.38 : 0.22})`;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(fx + s * 88, ey + 44, 30, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const eyeW = f.male ? 25 : 28;
  let eyeH = f.male ? 32 : 40;
  if (e === 'angry') eyeH *= 0.78;
  if (e === 'surprised') eyeH *= 1.12;
  for (const s of [-1, 1]) {
    const x = fx + s * dx;
    if (blink) {
      ctx.strokeStyle = lash;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - eyeW, ey + 4);
      ctx.quadraticCurveTo(x, ey + 16, x + eyeW, ey + 4);
      ctx.stroke();
    } else if (happy) {
      // smiling eyes: closed upward arcs with a hint of iris below
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, ey + 6, eyeW, eyeH * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createLinearGradient(0, ey - eyeH, 0, ey + eyeH);
      g.addColorStop(0, shade(f.eye, -0.2));
      g.addColorStop(1, shade(f.eye, 0.15));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x + s * 2, ey + 9, eyeW * 0.8, eyeH * 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1220';
      ctx.beginPath();
      ctx.ellipse(x + s * 2, ey + 11, eyeW * 0.38, eyeH * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x - 8, ey - 2, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = f.skin;
      ctx.beginPath();
      ctx.ellipse(x, ey - eyeH * 0.55, eyeW * 1.3, eyeH * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = lash;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - eyeW - 3, ey + 2);
      ctx.quadraticCurveTo(x, ey - 18, x + eyeW + 4, ey + 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, ey, eyeW, eyeH, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createLinearGradient(0, ey - eyeH, 0, ey + eyeH);
      g.addColorStop(0, shade(f.eye, -0.2));
      g.addColorStop(1, shade(f.eye, 0.15));
      ctx.fillStyle = g;
      const look = e === 'sad' ? 6 : 2;
      ctx.beginPath();
      ctx.ellipse(x + s * 2, ey + look, eyeW * 0.8, eyeH * 0.84, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1220';
      ctx.beginPath();
      ctx.ellipse(x + s * 2, ey + look + 2, eyeW * (e === 'surprised' ? 0.3 : 0.4), eyeH * (e === 'surprised' ? 0.34 : 0.46), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x - 9, ey - eyeH * 0.42, 9, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 9, ey + eyeH * 0.45, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // lids
      ctx.strokeStyle = lash;
      ctx.lineWidth = f.male ? 7 : 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const lid = ey - eyeH * 0.92;
      if (e === 'angry') {
        ctx.fillStyle = f.skin;
        ctx.beginPath();
        ctx.moveTo(x - s * (eyeW + 6), ey - eyeH - 6);
        ctx.lineTo(x + s * (eyeW + 6), ey - eyeH - 6);
        ctx.lineTo(x + s * (eyeW + 6), ey - eyeH * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - s * (eyeW + 4), ey - eyeH * 0.9);
        ctx.lineTo(x + s * (eyeW + 4), ey - eyeH * 0.15);
        ctx.stroke();
      } else if (e === 'sad') {
        ctx.moveTo(x - eyeW - 3, lid + (s < 0 ? 2 : 12));
        ctx.quadraticCurveTo(x, lid - 4, x + eyeW + 3, lid + (s < 0 ? 12 : 2));
        ctx.stroke();
      } else {
        ctx.moveTo(x - eyeW - 4, lid + 8);
        ctx.quadraticCurveTo(x, lid - 9, x + eyeW + 5, lid + (s > 0 ? 4 : 10));
        ctx.stroke();
        if (!f.male) {
          // lashes
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x + s * (eyeW + 2), lid + 6);
          ctx.lineTo(x + s * (eyeW + 11), lid - 2);
          ctx.stroke();
        }
      }
    }
    // brows
    ctx.strokeStyle = f.brow;
    ctx.lineWidth = f.male ? 9 : 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const by = ey - (f.male ? 32 : 40) - 24;
    if (e === 'angry') {
      ctx.moveTo(x - s * 24, by - 8);
      ctx.lineTo(x + s * 20, by + 12);
    } else if (e === 'sad') {
      ctx.moveTo(x - s * 22, by + 8);
      ctx.lineTo(x + s * 20, by - 6);
    } else if (e === 'surprised') {
      ctx.moveTo(x - 22, by - 2);
      ctx.quadraticCurveTo(x, by - 18, x + 22, by - 2);
    } else {
      ctx.moveTo(x - 22, by + 4);
      ctx.quadraticCurveTo(x, by - 7, x + 22, by + 4);
    }
    ctx.stroke();
  }
  // age lines
  if (f.age > 0.6) {
    ctx.strokeStyle = 'rgba(120,70,50,0.25)';
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(fx + s * 96, ey + 6);
      ctx.lineTo(fx + s * 104, ey + 16);
      ctx.stroke();
    }
  }
  // nose
  ctx.fillStyle = 'rgba(160,80,60,0.22)';
  ctx.beginPath();
  ctx.ellipse(fx + 2, ey + 40, 7, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // mouth
  const my = ey + 68;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7a3036';
  ctx.fillStyle = '#b8424e';
  ctx.lineWidth = 6;
  ctx.beginPath();
  if (e === 'happy') {
    ctx.moveTo(fx - 22, my - 6);
    ctx.quadraticCurveTo(fx, my + 26, fx + 22, my - 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff8a95';
    ctx.beginPath();
    ctx.ellipse(fx, my + 8, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (e === 'angry') {
    ctx.moveTo(fx - 18, my + 6);
    ctx.quadraticCurveTo(fx, my - 8, fx + 18, my + 6);
    ctx.stroke();
  } else if (e === 'sad') {
    ctx.moveTo(fx - 13, my + 5);
    ctx.quadraticCurveTo(fx, my - 4, fx + 13, my + 5);
    ctx.stroke();
  } else if (e === 'surprised') {
    ctx.ellipse(fx, my + 2, 9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(fx - 15, my);
    ctx.quadraticCurveTo(fx, my + 12, fx + 15, my);
    ctx.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export interface LeaderRig {
  root: Object3D;
  torso: Object3D;
  head: Object3D;
  armL: Object3D;
  armR: Object3D;
  setExpression(e: Expression): void;
  setBlink(on: boolean): void;
  expression: Expression;
  dispose(): void;
}

type Hair = 'long' | 'bun' | 'short' | 'braids' | 'curly' | 'bald' | 'wavy';

/** Builds a leader. About 2 units tall; faces +z; feet at the origin. */
export function buildLeader(look: LeaderLook): LeaderRig {
  const rng = new Rng(look.seed);
  const male = look.gender === 'm';
  const hairColor = look.age > 0.75 ? '#c9c4c0' : rng.pick(HAIRS);
  const hairStyles: Hair[] = male ? ['short', 'curly', 'wavy', 'long', 'bald'] : ['long', 'bun', 'braids', 'wavy', 'curly'];
  const hair = rng.pick(hairStyles);
  const beard = male && rng.chance(look.age > 0.4 ? 0.7 : 0.3);
  const modern = look.tier >= 5 && /President|Chancellor|Director|Supreme|Steward|Consul/.test(look.title);
  const team = new Color(look.color);
  const teamDark = team.clone().offsetHSL(0, 0, -0.14);
  const teamHex = `#${team.getHexString()}`;
  const teamDarkHex = `#${teamDark.getHexString()}`;
  const mats: MeshStandardMaterial[] = [];
  const vc = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const silk = new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.08 });
  mats.push(vc, silk);
  const root = new Object3D();
  const mesh = (g: BufferGeometry, m: MeshStandardMaterial = vc) => {
    const x = new Mesh(g, m);
    x.castShadow = true;
    x.receiveShadow = true;
    return x;
  };

  // --- body ---------------------------------------------------------------------------
  const torso = new Object3D();
  torso.position.y = 0.62;
  root.add(torso);
  const body: BufferGeometry[] = [];
  if (modern) {
    // a tailored suit (or a gown with a sash)
    const suit = male ? '#2b3240' : teamDarkHex;
    body.push(part(lathe([[0.22, -0.62], [0.24, -0.3], [0.2, -0.02], [0.001, -0.02]], 18), male ? '#262b36' : teamHex, {}));
    body.push(part(lathe([[0.2, 0], [0.25, 0.18], [0.24, 0.42], [0.12, 0.55], [0.001, 0.56]], 18), suit, {}));
    body.push(part(box(0.1, 0.26, 0.02), '#f4f2ee', { p: [0, 0.34, 0.2] }));
    body.push(part(box(0.045, 0.24, 0.025), teamHex, { p: [0, 0.32, 0.215] }));
    body.push(part(xf(box(0.5, 0.06, 0.03), { r: [0, 0, -0.6] }), GOLD, { p: [0, 0.3, 0.21] }));
    for (const s of [-1, 1]) body.push(part(sphere(0.07, 10, 8), suit, { p: [s * 0.25, 0.47, 0], s: [1.1, 0.7, 1] }));
  } else {
    // a robe or gown in the people's colour, trimmed with gold
    const light = shade(teamHex, 0.12);
    if (male) {
      body.push(part(lathe([[0.34, -0.62], [0.31, -0.35], [0.26, -0.05], [0.001, -0.05]], 24), teamHex, {}));
      body.push(part(box(0.1, 0.56, 0.02), GOLD, { p: [0, -0.34, 0.27], r: [-0.12, 0, 0] }));
    } else {
      // a full gown with a lighter underskirt showing at the front
      body.push(part(lathe([[0.5, -0.62], [0.46, -0.48], [0.36, -0.28], [0.25, -0.06], [0.001, -0.06]], 28), teamHex, {}));
      const under = lathe([[0.36, -0.6], [0.3, -0.35], [0.2, -0.08]], 16, );
      under.scale(0.6, 1, 0.5);
      under.translate(0, 0, 0.3);
      body.push(part(under, light, {}));
      body.push(part(torus(0.38, 0.012, 5, 30), GOLD, { r: [Math.PI / 2, 0, 0], p: [0, -0.4, 0] }));
    }
    body.push(part(torus(male ? 0.34 : 0.5, 0.026, 6, 30), GOLD, { r: [Math.PI / 2, 0, 0], p: [0, -0.6, 0] }));
    // bodice with a gold-trimmed neckline
    body.push(part(lathe([[0.25, -0.06], [0.27, 0.1], [0.26, 0.3], [0.2, 0.44], [0.1, 0.5], [0.001, 0.5]], 22), teamDarkHex, {}));
    body.push(part(torus(0.25, 0.024, 6, 26), GOLD, { r: [Math.PI / 2, 0, 0], p: [0, -0.02, 0] }));
    body.push(part(xf(torus(0.17, 0.022, 6, 22, Math.PI), { r: [Math.PI / 2 + 0.5, 0, Math.PI] }), GOLD, { p: [0, 0.4, 0.06] }));
    body.push(part(sphere(0.045, 12, 10), '#5fd0ff', { p: [0, 0.3, 0.25] }));
    body.push(part(torus(0.05, 0.012, 5, 14), GOLD, { p: [0, 0.3, 0.245] }));
    // puffed shoulders
    for (const s of [-1, 1]) {
      body.push(part(sphere(0.13, 16, 12), light, { p: [s * 0.27, 0.4, 0], s: [1, 0.85, 1] }));
    }
    // a cape that falls behind
    const cape = lathe([[0.46, -0.62], [0.38, -0.2], [0.3, 0.25], [0.22, 0.46]], 18);
    const pos = cape.attributes.position;
    for (let k = 0; k < pos.count; k++) if (pos.getZ(k) > 0.02) pos.setZ(k, pos.getZ(k) * 0.12 - 0.06);
    cape.computeVertexNormals();
    body.push(part(cape, shade(teamHex, -0.22), { p: [0, 0, -0.06] }));
    body.push(part(torus(0.2, 0.03, 6, 22), GOLD, { r: [Math.PI / 2 - 0.2, 0, 0], p: [0, 0.47, -0.02] }));
  }
  body.push(part(cylinder(0.07, 0.08, 0.1, 12), look.skin, { p: [0, 0.52, 0] }));
  const bodyMesh = mesh(merge(body), silk);
  (bodyMesh.material as MeshStandardMaterial).side = DoubleSide;
  torso.add(bodyMesh);

  // --- arms ---------------------------------------------------------------------------
  const arm = (s: number) => {
    const o = new Object3D();
    o.position.set(s * 0.29, 0.4, 0);
    const sleeve = modern ? (male ? '#2b3240' : teamDarkHex) : teamDarkHex;
    const g = merge([
      part(capsule(0.072, 0.22, 4, 12), sleeve, { p: [0, -0.15, 0] }),
      part(cylinder(0.095, 0.08, 0.1, 14), modern ? '#f4f2ee' : shade(teamHex, 0.15), { p: [0, -0.3, 0] }),
      part(torus(0.09, 0.012, 5, 16), modern ? '#d9dde4' : GOLD, { r: [Math.PI / 2, 0, 0], p: [0, -0.35, 0] }),
      part(sphere(0.068, 14, 12), look.skin, { p: [0, -0.4, 0.01] }),
    ]);
    o.add(mesh(g));
    torso.add(o);
    return o;
  };
  const armL = arm(-1);
  const armR = arm(1);

  // --- head ---------------------------------------------------------------------------
  const head = new Object3D();
  head.position.set(0, 0.5, 0.01);
  torso.add(head);
  const face: FaceStyle = { skin: look.skin, eye: rng.pick(EYES), brow: shade(hairColor, -0.2), male, age: look.age };
  const faces = new Map<string, CanvasTexture>();
  const faceTex = (e: Expression, blink: boolean) => {
    const k = `${e}|${blink}`;
    let t = faces.get(k);
    if (!t) faces.set(k, (t = paintFace(face, e, blink)));
    return t;
  };
  const faceMat = new MeshStandardMaterial({ map: faceTex('neutral', false), roughness: 0.55 });
  mats.push(faceMat);
  const R = 0.34;
  const headMesh = new Mesh(new SphereGeometry(R, 48, 32), faceMat);
  headMesh.position.y = R * 0.92;
  headMesh.scale.set(1.02, 0.96, 0.96);
  headMesh.castShadow = true;
  head.add(headMesh);
  const hy = R * 0.92;
  const hairParts: BufferGeometry[] = [];
  const cap = (s = 1.05) => hairParts.push(part(xf(hemisphere(R * s, 28, 14), { r: [-0.42, 0, 0] }), hairColor, { p: [0, hy + 0.02, -0.03] }));
  const bangs = () => {
    for (let k = -2; k <= 2; k++) {
      const g = ellipsoid(0.085, 0.13, 0.06, 10, 8);
      g.rotateZ(k * 0.22);
      g.rotateX(-0.5);
      g.translate(k * 0.085, hy + 0.2 - Math.abs(k) * 0.02, R * 0.78);
      hairParts.push(part(g, hairColor, {}));
    }
  };
  if (hair !== 'bald') cap(hair === 'curly' ? 1.14 : 1.1);
  if (hair !== 'bald' && hair !== 'short') {
    // volume at the sides and back of the head
    for (const s of [-1, 1]) hairParts.push(part(ellipsoid(0.14, 0.22, 0.2, 14, 12), hairColor, { p: [s * 0.27, hy + 0.02, -0.06] }));
    hairParts.push(part(ellipsoid(0.32, 0.3, 0.2, 18, 12), hairColor, { p: [0, hy + 0.02, -0.17] }));
  }
  if (hair === 'long' || hair === 'wavy') {
    const back = lathe([[0.001, -0.62], [0.26, -0.5], [0.34, -0.2], [0.36, 0.05], [0.34, 0.18]], 18);
    const pos = back.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      if (pos.getZ(k) > 0.1) pos.setZ(k, 0.1 + (pos.getZ(k) - 0.1) * 0.25);
      if (hair === 'wavy') pos.setX(k, pos.getX(k) * (1 + Math.sin(pos.getY(k) * 18) * 0.05));
    }
    back.computeVertexNormals();
    hairParts.push(part(back, hairColor, { p: [0, hy - 0.05, -0.08] }));
    bangs();
    for (const s of [-1, 1]) hairParts.push(part(ellipsoid(0.08, 0.3, 0.08, 10, 10), hairColor, { p: [s * 0.3, hy - 0.22, 0.1] }));
  } else if (hair === 'bun') {
    bangs();
    hairParts.push(part(sphere(0.16, 16, 12), hairColor, { p: [0, hy + 0.3, -0.18] }));
    hairParts.push(part(torus(0.12, 0.025, 6, 18), GOLD, { r: [0.9, 0, 0], p: [0, hy + 0.26, -0.14] }));
  } else if (hair === 'braids') {
    bangs();
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) hairParts.push(part(sphere(0.065 - k * 0.005, 10, 8), hairColor, { p: [s * 0.29, hy - 0.12 - k * 0.1, 0.06] }));
  } else if (hair === 'curly') {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      hairParts.push(part(sphere(0.1, 10, 8), hairColor, { p: [Math.cos(a) * 0.3, hy + 0.12 + Math.sin(k * 1.7) * 0.06, Math.sin(a) * 0.26 - 0.05] }));
    }
  } else if (hair === 'short') {
    for (let k = -1; k <= 1; k++) hairParts.push(part(xf(ellipsoid(0.1, 0.09, 0.06, 10, 8), { r: [-0.6, 0, k * 0.2] }), hairColor, { p: [k * 0.1, hy + 0.24, R * 0.72] }));
  }
  if (beard) {
    hairParts.push(part(ellipsoid(0.24, 0.17, 0.16, 18, 12), hairColor, { p: [0, hy - 0.2, 0.16] }));
    hairParts.push(part(ellipsoid(0.12, 0.035, 0.05, 10, 6), hairColor, { p: [0, hy - 0.06, R * 0.86] }));
  }
  // regalia
  const t = look.title;
  if (/King|Queen|Emperor|Empress/.test(t)) {
    const big = /Emperor|Empress/.test(t);
    const r = big ? 0.24 : 0.2;
    hairParts.push(part(cylinder(r, r * 0.95, big ? 0.14 : 0.1, 20, true), GOLD, { p: [0, hy + R * 0.86, -0.02] }));
    for (let k = 0; k < (big ? 8 : 5); k++) {
      const a = (k / (big ? 8 : 5)) * Math.PI * 2;
      hairParts.push(part(cone(0.035, 0.1, 6), GOLD, { p: [Math.cos(a) * r, hy + R * 0.86 + 0.1, Math.sin(a) * r - 0.02] }));
      hairParts.push(part(sphere(0.022, 8, 6), k % 2 ? '#ff4d6a' : '#4dd2ff', { p: [Math.cos(a) * r * 1.02, hy + R * 0.86 + 0.02, Math.sin(a) * r * 1.02 - 0.02] }));
    }
  } else if (/Chief/.test(t)) {
    hairParts.push(part(torus(0.33, 0.03, 6, 26), teamHex, { r: [Math.PI / 2 - 0.15, 0, 0], p: [0, hy + 0.14, 0] }));
    for (let k = 0; k < 7; k++) {
      const a = -0.9 + (k / 6) * 1.8;
      hairParts.push(part(xf(ellipsoid(0.045, 0.2, 0.012, 8, 6), { r: [-0.2, 0, a] }), k % 2 ? '#ffffff' : teamHex, { p: [Math.sin(a) * 0.22, hy + 0.36 + Math.cos(a) * 0.1, -0.12] }));
    }
  } else if (/Priest/.test(t)) {
    hairParts.push(part(xf(cone(0.2, 0.42, 16), { s: [1, 1, 0.7] }), '#f6efe0', { p: [0, hy + R + 0.12, -0.02] }));
    hairParts.push(part(box(0.06, 0.4, 0.02), GOLD, { p: [0, hy + R + 0.1, 0.12] }));
  } else if (/Consul/.test(t) && !modern) {
    for (let k = 0; k < 12; k++) {
      const a = Math.PI * 0.15 + (k / 11) * Math.PI * 0.7;
      for (const s of [-1, 1]) hairParts.push(part(ellipsoid(0.05, 0.016, 0.025, 6, 4), '#4f9a3a', { p: [Math.cos(a) * 0.33 * s, hy + 0.16, -Math.sin(a) * 0.3 + 0.12], r: [0, s * a, 0.4] }));
    }
  } else if (/Steward/.test(t)) {
    hairParts.push(part(torus(0.31, 0.02, 6, 26), GOLD, { r: [Math.PI / 2 - 0.2, 0, 0], p: [0, hy + 0.16, 0] }));
  }
  if (hairParts.length) head.add(mesh(merge(hairParts), silk));

  let expression: Expression = 'neutral';
  let blinking = false;
  const apply = () => {
    faceMat.map = faceTex(expression, blinking);
    faceMat.needsUpdate = true;
  };
  return {
    root,
    torso,
    head,
    armL,
    armR,
    get expression() {
      return expression;
    },
    set expression(e: Expression) {
      expression = e;
    },
    setExpression(e: Expression) {
      expression = e;
      apply();
    },
    setBlink(on: boolean) {
      if (blinking === on) return;
      blinking = on;
      apply();
    },
    dispose() {
      for (const t of faces.values()) t.dispose();
      root.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      mats.forEach((m) => m.dispose());
    },
  };
}
