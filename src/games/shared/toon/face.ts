// The painted face. Faces are drawn on a canvas wrapped around the head
// sphere (equirectangular: the front of the face sits at u = 0.25), in the
// style of the reference sheets: big glossy eyes with two highlights, a
// heavy upper lash line, soft thick brows, a hint of a nose, rosy cheeks and
// a small expressive mouth. Each expression is its own texture, so mood
// changes and blinks are just texture swaps.

import { CanvasTexture, Color, SRGBColorSpace } from 'three';

export type Expression = 'neutral' | 'happy' | 'focused' | 'surprised' | 'concerned' | 'determined' | 'laugh' | 'blink' | 'wink';
export const EXPRESSIONS: Expression[] = ['neutral', 'happy', 'focused', 'surprised', 'concerned', 'determined', 'laugh', 'blink', 'wink'];

export interface FaceSpec {
  skin: string;
  eyes: string;
  brows: string;
  /** Long lashes with an outer flick and a lower lash hint. */
  lashes?: boolean;
  /** 0 – 1 */
  blush?: number;
  lips?: string;
  freckles?: boolean;
  /** Painted beard / stubble under the 3D beard (so the jaw reads as hair). */
  beard?: string;
  /** Narrower, slightly upturned eyes. */
  almond?: boolean;
  /** Eye size multiplier (1 = default). */
  eyeScale?: number;
  /** Older characters get a softer crease under the eyes. */
  age?: number;
}

export const FACE_W = 1024;
export const FACE_H = 512;
/** Front of the face on the texture. */
const FX = FACE_W * 0.25;
/** Eye line (just under the sphere's equator). */
const EY = FACE_H * 0.555;
const PX = FACE_W / (Math.PI * 2);

function shade(hex: string, l: number, s = 0): string {
  const c = new Color(hex);
  c.offsetHSL(0, s, l);
  return `#${c.getHexString()}`;
}

function rgba(hex: string, a: number): string {
  const c = new Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

interface Brow {
  /** Vertical lift of the brow (px, up is negative). */
  lift: number;
  /** Inner end raised (+) or lowered (-). */
  inner: number;
  arch: number;
}

interface Mood {
  brow: Brow;
  /** Eye openness 0 (shut) – 1. */
  open: number;
  /** Lower lid raised (smiling / squinting eyes). */
  squint: number;
  /** Iris scale. */
  iris: number;
  mouth: 'smile' | 'grin' | 'open' | 'o' | 'flat' | 'frown' | 'firm' | 'laugh';
  /** Closed eyes drawn as happy arcs (^ ^). */
  arcs?: boolean;
  wink?: boolean;
  /** Extra blush. */
  flush?: number;
}

const MOODS: Record<Expression, Mood> = {
  neutral: { brow: { lift: 0, inner: 0, arch: 6 }, open: 1, squint: 0.08, iris: 1, mouth: 'smile' },
  happy: { brow: { lift: -4, inner: 2, arch: 8 }, open: 0.92, squint: 0.3, iris: 1, mouth: 'grin', flush: 0.15 },
  focused: { brow: { lift: 5, inner: -7, arch: 2 }, open: 0.78, squint: 0.2, iris: 0.92, mouth: 'flat' },
  surprised: { brow: { lift: -14, inner: 3, arch: 10 }, open: 1.12, squint: 0, iris: 0.78, mouth: 'o' },
  concerned: { brow: { lift: -5, inner: 9, arch: 2 }, open: 0.95, squint: 0.05, iris: 0.95, mouth: 'frown' },
  determined: { brow: { lift: 6, inner: -10, arch: 0 }, open: 0.82, squint: 0.25, iris: 0.95, mouth: 'firm' },
  laugh: { brow: { lift: -6, inner: 3, arch: 9 }, open: 0, squint: 0, iris: 1, mouth: 'laugh', arcs: true, flush: 0.25 },
  blink: { brow: { lift: 0, inner: 0, arch: 6 }, open: 0, squint: 0, iris: 1, mouth: 'smile' },
  wink: { brow: { lift: -4, inner: 2, arch: 8 }, open: 0.95, squint: 0.3, iris: 1, mouth: 'grin', wink: true, flush: 0.1 },
};

/** Paints a face; returns the canvas (callers make textures). */
export function paintFaceCanvas(f: FaceSpec, expr: Expression): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FACE_W;
  c.height = FACE_H;
  const ctx = c.getContext('2d')!;
  const m = MOODS[expr];
  const skin = f.skin;
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, FACE_W, FACE_H);

  // Beard shadow (the 3D beard sits on top of this).
  if (f.beard) {
    ctx.fillStyle = shade(f.beard, -0.05);
    ctx.beginPath();
    ctx.moveTo(FX - 150, EY + 10);
    ctx.quadraticCurveTo(FX - 120, EY + 170, FX, EY + 190);
    ctx.quadraticCurveTo(FX + 120, EY + 170, FX + 150, EY + 10);
    ctx.lineTo(FX + 110, EY + 50);
    ctx.quadraticCurveTo(FX, EY + 75, FX - 110, EY + 50);
    ctx.closePath();
    ctx.fill();
  }

  // Cheeks: a soft warm wash, and a little shading under the brow and down the nose.
  const blush = (f.blush ?? 0.55) + (m.flush ?? 0);
  for (const s of [-1, 1]) {
    const g = ctx.createRadialGradient(FX + s * 78, EY + 50, 2, FX + s * 78, EY + 50, 40);
    g.addColorStop(0, `rgba(226,120,110,${0.22 * blush})`);
    g.addColorStop(1, 'rgba(226,120,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(FX + s * 78, EY + 50, 44, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    const sock = ctx.createRadialGradient(FX + s * 56, EY - 18, 4, FX + s * 56, EY - 18, 46);
    sock.addColorStop(0, rgba(shade(skin, -0.12, 0.05), 0.35));
    sock.addColorStop(1, rgba(shade(skin, -0.12, 0.05), 0));
    ctx.fillStyle = sock;
    ctx.beginPath();
    ctx.ellipse(FX + s * 56, EY - 14, 50, 34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (f.freckles) {
    ctx.fillStyle = rgba(shade(skin, -0.25, 0.1), 0.55);
    const dots = [[-92, 38], [-80, 46], [-70, 36], [-100, 52], [-62, 50], [92, 38], [80, 46], [70, 36], [100, 52], [62, 50]];
    for (const [x, y] of dots) {
      ctx.beginPath();
      ctx.arc(FX + x, EY + y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Nose: a soft shadowed tip and nostril hint.
  const nose = ctx.createRadialGradient(FX + 4, EY + 30, 1, FX + 4, EY + 30, 16);
  nose.addColorStop(0, rgba(shade(skin, -0.2, 0.08), 0.6));
  nose.addColorStop(1, rgba(shade(skin, -0.2, 0.08), 0));
  ctx.fillStyle = nose;
  ctx.beginPath();
  ctx.ellipse(FX + 4, EY + 30, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(shade(skin, -0.3, 0.1), 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(FX - 7, EY + 36);
  ctx.quadraticCurveTo(FX + 1, EY + 40, FX + 9, EY + 36);
  ctx.stroke();

  const es = f.eyeScale ?? 1;
  for (const s of [-1, 1] as const) {
    const x = FX + s * 56;
    const winked = !!m.wink && s === 1;
    eye(ctx, f, m, x, EY, s, es, winked);
    brow(ctx, f, m, x, EY, s, es);
  }
  mouth(ctx, f, m, FX, EY + 66);

  return c;
}

function eye(ctx: CanvasRenderingContext2D, f: FaceSpec, m: Mood, x: number, y: number, side: -1 | 1, es: number, winked: boolean): void {
  // storybook eyes: almond shapes, mostly iris, one catch-light, a fine lid line
  const w = (f.almond ? 24 : 25) * es;
  const h = (f.almond ? 15 : 18) * es;
  const lid = '#3a2a24';
  const open = winked ? 0 : m.open;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (open <= 0.01) {
    ctx.strokeStyle = lid;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    if (m.arcs || winked) {
      ctx.moveTo(x - w, y + 3);
      ctx.quadraticCurveTo(x, y - 12, x + w, y + 3);
    } else {
      ctx.moveTo(x - w, y);
      ctx.quadraticCurveTo(x, y + 7, x + w, y);
    }
    ctx.stroke();
    return;
  }
  const hh = h * open;
  const top = y - hh;
  const bottom = y + h * 0.75 * (1 - m.squint * 0.5);
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.bezierCurveTo(x - w * 0.55, top - 2, x + w * 0.55, top - 2, x + w, y - 2);
    ctx.bezierCurveTo(x + w * 0.5, bottom + 1, x - w * 0.5, bottom + 1, x - w, y);
    ctx.closePath();
  };
  ctx.save();
  shape();
  ctx.fillStyle = '#f6f1ea';
  ctx.fill();
  ctx.clip();
  // the lid's soft shadow on the eyeball
  ctx.fillStyle = 'rgba(120,90,80,0.28)';
  ctx.fillRect(x - w - 2, top - 4, w * 2 + 4, hh * 0.6);
  // iris and pupil
  const ir = w * 0.56 * m.iris;
  const ix = x + side * 1.5;
  const iy = y - hh * 0.05;
  const ig = ctx.createRadialGradient(ix, iy + ir * 0.3, ir * 0.2, ix, iy, ir);
  ig.addColorStop(0, shade(f.eyes, 0.14, 0.05));
  ig.addColorStop(0.7, f.eyes);
  ig.addColorStop(1, shade(f.eyes, -0.25));
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.arc(ix, iy, ir, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#140d0a';
  ctx.beginPath();
  ctx.arc(ix, iy, ir * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(ix - side * ir * 0.35 - ir * 0.1, iy - ir * 0.38, ir * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // upper lid line and a hint of lashes at the outer corner
  ctx.strokeStyle = lid;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - w - 1, y + 0.5);
  ctx.bezierCurveTo(x - w * 0.55, top - 2.5, x + w * 0.55, top - 2.5, x + w + 1, y - 2);
  ctx.stroke();
  if (f.lashes) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + side * (w + 1), y - 2);
    ctx.lineTo(x + side * (w + 6), y - 6);
    ctx.stroke();
  }
  // the crease above, very soft
  ctx.strokeStyle = 'rgba(150,90,80,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.7, top - 6);
  ctx.quadraticCurveTo(x, top - 11, x + w * 0.75, top - 5);
  ctx.stroke();
}

function brow(ctx: CanvasRenderingContext2D, f: FaceSpec, m: Mood, x: number, y: number, side: -1 | 1, es: number): void {
  const b = m.brow;
  const by = y - 40 * es + b.lift * 0.7;
  const inner = x - side * 22;
  const outer = x + side * 28;
  ctx.strokeStyle = f.brows;
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(inner, by - b.inner * 0.7 + 3);
  ctx.quadraticCurveTo(x + side * 4, by - b.arch * 0.6 - 4, outer, by + 4);
  ctx.stroke();
}

function mouth(ctx: CanvasRenderingContext2D, f: FaceSpec, m: Mood, x: number, y: number): void {
  const line = shade(f.lips ?? '#b4505a', -0.25);
  const inside = '#7a2a34';
  const lips = f.lips ?? '#d9707a';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = line;
  ctx.lineWidth = 3.4;
  switch (m.mouth) {
    case 'smile':
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.quadraticCurveTo(x, y + 6, x + 10, y);
      ctx.stroke();
      void lips;
      break;
    case 'grin':
    case 'laugh': {
      const big = m.mouth === 'laugh';
      const wdt = big ? 24 : 19;
      const dep = big ? 26 : 16;
      ctx.fillStyle = inside;
      ctx.beginPath();
      ctx.moveTo(x - wdt, y - 4);
      ctx.quadraticCurveTo(x, y + 2, x + wdt, y - 4);
      ctx.quadraticCurveTo(x + wdt * 0.6, y + dep, x, y + dep);
      ctx.quadraticCurveTo(x - wdt * 0.6, y + dep, x - wdt, y - 4);
      ctx.closePath();
      ctx.fill();
      // teeth and tongue
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#fbf6f2';
      ctx.fillRect(x - wdt, y - 6, wdt * 2, 6);
      ctx.fillStyle = '#e07a82';
      ctx.beginPath();
      ctx.ellipse(x, y + dep, wdt * 0.6, dep * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.stroke();
      break;
    }
    case 'open':
    case 'o':
      ctx.fillStyle = inside;
      ctx.beginPath();
      ctx.ellipse(x, y + 6, 9, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e07a82';
      ctx.beginPath();
      ctx.ellipse(x, y + 12, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'flat':
      ctx.beginPath();
      ctx.moveTo(x - 11, y + 2);
      ctx.quadraticCurveTo(x, y + 4, x + 11, y + 1);
      ctx.stroke();
      break;
    case 'frown':
      ctx.beginPath();
      ctx.moveTo(x - 12, y + 6);
      ctx.quadraticCurveTo(x, y - 1, x + 12, y + 6);
      ctx.stroke();
      break;
    case 'firm':
      ctx.beginPath();
      ctx.moveTo(x - 13, y + 1);
      ctx.quadraticCurveTo(x - 2, y + 4, x + 13, y - 2);
      ctx.stroke();
      break;
  }
}

const texCache = new Map<string, CanvasTexture>();

/** A cached texture for a face spec and expression. */
export function faceTexture(f: FaceSpec, expr: Expression): CanvasTexture {
  const key = `${JSON.stringify(f)}|${expr}`;
  let t = texCache.get(key);
  if (!t) {
    t = new CanvasTexture(paintFaceCanvas(f, expr));
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    texCache.set(key, t);
  }
  return t;
}

/** Pixels per radian on the face texture (for placing 3D parts in line with paint). */
export const FACE_PX_PER_RAD = PX;
