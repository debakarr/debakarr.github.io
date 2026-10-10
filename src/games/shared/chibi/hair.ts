// Hair as sculpted clumps. A style is a scalp cap plus many curved, tapered
// locks (tubes along bezier curves, flattened into ribbons), curls (tori and
// coiled tubes), buns and braids, coloured with a root-to-tip gradient so
// it reads like the painted locks on the reference sheets.

import { BufferAttribute, BufferGeometry, Color, SphereGeometry, Vector3 } from 'three';
import { Rng } from '../rng';
import { ellipsoid, prep, torus, xf } from './geo';
import { HEAD_R, HEAD_Y, type BoneName } from './rig';
import type { HairSpec } from './spec';

export interface HairPart {
  bone: BoneName;
  geo: BufferGeometry;
}

const tmp = new Color();
const WHITE = new Color('#ffffff');

function shade(hex: string, l: number): string {
  tmp.set(hex);
  tmp.offsetHSL(0, 0, l);
  return `#${tmp.getHexString()}`;
}

/**
 * A lock of hair: a tapered tube along a cubic bezier, flattened into a
 * ribbon. `flat` < 1 squashes the cross-section along `up`.
 */
export function lock(
  a: Vector3,
  b: Vector3,
  c: Vector3,
  d: Vector3,
  r0: number,
  opts: { flat?: number; up?: Vector3; seg?: number; ring?: number; tip?: number; root?: string; end?: string; swell?: number; shine?: number } = {},
): BufferGeometry {
  const seg = opts.seg ?? 12;
  const ring = opts.ring ?? 8;
  const flat = opts.flat ?? 0.55;
  const tipR = opts.tip ?? 0.02;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const root = new Color(opts.root ?? '#ffffff');
  const end = new Color(opts.end ?? opts.root ?? '#ffffff');
  const p = new Vector3();
  const t1 = new Vector3();
  const n = new Vector3();
  const bn = new Vector3();
  const up = (opts.up ?? new Vector3(0, 1, 0)).clone().normalize();
  const bez = (t: number, out: Vector3) => {
    const u = 1 - t;
    return out
      .copy(a).multiplyScalar(u * u * u)
      .addScaledVector(b, 3 * u * u * t)
      .addScaledVector(c, 3 * u * t * t)
      .addScaledVector(d, t * t * t);
  };
  const q = new Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    bez(t, p);
    bez(Math.min(1, t + 0.01), q);
    t1.copy(q).sub(bez(Math.max(0, t - 0.01), new Vector3())).normalize();
    // frame: n points along `up` projected off the tangent, bn across
    n.copy(up).addScaledVector(t1, -up.dot(t1));
    if (n.lengthSq() < 1e-6) n.set(1, 0, 0).addScaledVector(t1, -t1.x);
    n.normalize();
    bn.crossVectors(t1, n).normalize();
    // swell near the root, then taper to a soft point
    const swell = opts.swell ?? 0.35;
    const r = r0 * (1 + swell * Math.sin(Math.PI * Math.min(1, t * 2))) * Math.pow(1 - t, 0.62) + tipR * r0 * t;
    tmp.copy(root).lerp(end, t);
    // the anime "angel ring": a glossy band a third of the way down each lock
    if (opts.shine) tmp.lerp(WHITE, opts.shine * Math.max(0, 1 - Math.abs(t - 0.32) / 0.1));
    for (let j = 0; j < ring; j++) {
      const ang = (j / ring) * Math.PI * 2;
      const cx = Math.cos(ang) * r;
      const cy = Math.sin(ang) * r * flat;
      pos.push(p.x + bn.x * cx + n.x * cy, p.y + bn.y * cx + n.y * cy, p.z + bn.z * cx + n.z * cy);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < ring; j++) {
      const a0 = i * ring + j;
      const a1 = i * ring + ((j + 1) % ring);
      const b0 = a0 + ring;
      const b1 = a1 + ring;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  // cap the root
  const base = pos.length / 3;
  bez(0, p);
  pos.push(p.x, p.y, p.z);
  col.push(root.r, root.g, root.b);
  for (let j = 0; j < ring; j++) idx.push(base, (j + 1) % ring, j);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const V = (x: number, y: number, z: number) => new Vector3(x, y + HEAD_Y, z);

/** Point on the head sphere (scaled out by `k`) from yaw (0 = front) and pitch (0 = equator, + up). */
function onHead(yaw: number, pitch: number, k = 1): Vector3 {
  const r = HEAD_R * k;
  return V(Math.sin(yaw) * Math.cos(pitch) * r, Math.sin(pitch) * r * 0.97, Math.cos(yaw) * Math.cos(pitch) * r);
}

function outward(v: Vector3): Vector3 {
  return v.clone().sub(new Vector3(0, HEAD_Y, 0)).normalize();
}

/** The scalp: covers the crown and back, leaves the face (front below the hairline) clear. */
function scalp(color: string, hairline = 0.42, back = 0.86): BufferGeometry[] {
  const R = HEAD_R + 0.012;
  // top cap (whole crown)
  const top = new SphereGeometry(R, 36, 18, 0, Math.PI * 2, 0, Math.PI * hairline);
  // back of head down to the nape
  const rear = new SphereGeometry(R, 32, 18, Math.PI, Math.PI, 0, Math.PI * back);
  return [prep(xf(top, { p: [0, HEAD_Y, 0], s: [1, 0.97, 1] }), color), prep(xf(rear, { p: [0, HEAD_Y, 0], s: [1.01, 0.97, 1.02] }), color)];
}

/**
 * A lock that follows the head: from (yaw0, pitch0) to (yaw1, pitch1) over
 * the scalp at a height `lift`, bulging in the middle, then flicking its tip
 * out by `flick`. Broad and flat, like a sculpted clump.
 */
function surfaceLock(yaw0: number, pitch0: number, yaw1: number, pitch1: number, r: number, root: string, end: string, o: { lift?: number; flick?: number; flat?: number; bulge?: number; drop?: number } = {}): BufferGeometry {
  const lift = o.lift ?? 0.03;
  const bulge = o.bulge ?? 0.03;
  const at = (t: number, extra: number) => {
    const yaw = yaw0 + (yaw1 - yaw0) * t;
    const pitch = pitch0 + (pitch1 - pitch0) * t;
    const k = 1 + (lift + extra) / HEAD_R;
    return onHead(yaw, pitch, k);
  };
  const a = at(0, -0.01);
  const b = at(0.35, bulge);
  const c = at(0.7, bulge * 0.7);
  const d = at(1, 0).addScaledVector(outward(at(1, 0)), o.flick ?? 0.02);
  if (o.drop) d.y -= o.drop;
  const up = outward(at(0.5, 0));
  return lock(a, b, c, d, r, { flat: o.flat ?? 0.48, up, root, end, swell: 0.3, seg: 16, ring: 10, tip: 0.03, shine: 0.22 });
}

interface LockOpts {
  yaw: number;
  pitch: number;
  /** Direction the lock travels (bone space), usually down/out. */
  dir: Vector3;
  len: number;
  r: number;
  curl?: number;
  flat?: number;
  lift?: number;
}

function headLock(o: LockOpts, root: string, end: string): BufferGeometry {
  const a = onHead(o.yaw, o.pitch, 0.98);
  const out = outward(a);
  const dir = o.dir.clone().normalize();
  const lift = o.lift ?? 0.04;
  const b = a.clone().addScaledVector(out, lift + 0.02).addScaledVector(dir, o.len * 0.35);
  const curl = o.curl ?? 0.3;
  const side = new Vector3().crossVectors(dir, out).normalize();
  const c = a.clone().addScaledVector(out, lift).addScaledVector(dir, o.len * 0.75).addScaledVector(side, curl * o.len * 0.3);
  const d = a.clone().addScaledVector(out, lift * 0.4).addScaledVector(dir, o.len).addScaledVector(side, curl * o.len * 0.55).addScaledVector(out, -0.01);
  return lock(a, b, c, d, o.r, { flat: o.flat ?? 0.6, up: out, root, end });
}

/** A ringlet: a short stack of soft, slightly twisted lumps hanging along `dir`. */
function curl(at: Vector3, r: number, color: string, turns = 2.2, dir = new Vector3(0, -1, 0)): BufferGeometry {
  const geos: BufferGeometry[] = [];
  const d = dir.clone().normalize();
  const n = Math.max(2, Math.round(turns * 1.4));
  const side = new Vector3(1, 0, 0).addScaledVector(d, -d.x).normalize();
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const rr = r * (1.25 - t * 0.45);
    const p = at.clone().addScaledVector(d, t * r * 2.6 * turns * 0.5).addScaledVector(side, (i % 2 ? 1 : -1) * r * 0.3);
    const g = ellipsoid(rr, rr * 0.8, rr, 12, 9);
    g.rotateZ((i % 2 ? 1 : -1) * 0.5);
    g.translate(p.x, p.y, p.z);
    const c = new Color(color).offsetHSL(0, 0, (i % 2 ? 0.04 : -0.02));
    geos.push(prep(g, c));
  }
  return mergeAll(geos.map((g) => (g.attributes.uv ? stripUv(g) : g)));
}

function mergeAll(geos: BufferGeometry[]): BufferGeometry {
  // non-indexed merge of colour/position/normal
  let n = 0;
  const flat = geos.map((g) => {
    const f = g.index ? g.toNonIndexed() : g;
    n += f.attributes.position.count;
    return f;
  });
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const f of flat) {
    if (!f.attributes.normal) f.computeVertexNormals();
    pos.set(f.attributes.position.array as Float32Array, o * 3);
    nor.set(f.attributes.normal.array as Float32Array, o * 3);
    col.set(f.attributes.color.array as Float32Array, o * 3);
    o += f.attributes.position.count;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

const dirOf = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Builds the hair (and facial hair) for a spec. */
export function buildHair(h: HairSpec, opts: { hidden?: 'helmet' | 'hat' | 'cap' } = {}): HairPart[] {
  const rng = new Rng(h.seed ?? 7);
  const base = shade(h.color, -0.02);
  const tip = shade(h.color, 0.09);
  const deep = shade(h.color, -0.07);
  const out: BufferGeometry[] = [];
  const neck: BufferGeometry[] = [];
  const L = (o: LockOpts, r = base, e = tip) => out.push(headLock(o, r, e));
  const under = opts.hidden === 'helmet';
  const capped = opts.hidden === 'hat' || opts.hidden === 'cap';

  // bangs: locks from the hairline sweeping over the forehead
  const bangs = (n: number, spread: number, len: number, sweep: number, r = 0.055, pitch = 0.62) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      const yaw = t * spread + rng.float(-0.05, 0.05);
      L({ yaw, pitch: pitch + rng.float(-0.04, 0.04), dir: dirOf(Math.sin(yaw) * 0.5 + sweep, -1, 0.35), len: len * rng.float(0.85, 1.12), r: r * rng.float(0.85, 1.15), curl: sweep * 2 + rng.float(-0.2, 0.2), lift: 0.035 }, base, tip);
    }
  };

  // Under a helmet or hat only the fringe, the sides and the nape show.
  if ((under || capped) && h.style !== 'none') {
    const fringe = under ? 0 : h.style === 'topknot' || h.style === 'longWavy' || h.style === 'curlyBun' ? 4 : 6;
    for (let i = 0; i < fringe; i++) {
      const t = i / (fringe - 1) - 0.5;
      out.push(surfaceLock(t * 1.5 + 0.12, 0.62, t * 1.6 - 0.05, 0.26 + rng.float(-0.03, 0.03), 0.09, base, tip, { lift: 0.022, bulge: 0.025, flick: 0.03 }));
    }
    if (!under) for (const s of [-1, 1]) out.push(surfaceLock(s * 1.25, 0.45, s * 1.38, -0.2, 0.085, deep, tip, { lift: 0.02, bulge: 0.025, flick: 0.025 }));
    if (!under) for (let i = 0; i < 6; i++) {
      const yaw = Math.PI + (i / 5 - 0.5) * 2.6;
      out.push(surfaceLock(yaw, 0.35, yaw + rng.float(-0.2, 0.2), -0.35, 0.09, deep, base, { lift: 0.02, bulge: 0.025, flick: 0.03 }));
    }
    if (h.style === 'longWavy' || h.style === 'long' || h.style === 'braids' || h.style === 'twintails' || h.style === 'ponytail' || h.style === 'tiedBack') {
      const tie = h.accent ?? shade(h.color, -0.25);
      if (h.style === 'braids' || h.style === 'twintails') for (const s of [-1, 1]) neck.push(braid(onHead(s * 1.55, -0.1, 1.05), dirOf(s * 0.15, -1, 0.35), 0.4, 0.05, base, tip, tie));
      else neck.push(braid(onHead(Math.PI, 0.1, 1.05), dirOf(0, -1, -0.25), 0.35, 0.055, base, tip, tie));
    }
  } else switch (h.style) {
    case 'none':
      break;
    case 'tousled':
    case 'shaggy':
    case 'short':
    case 'spiky':
    case 'messy': {
      // soft clumps swirling from the crown; length and volume vary by style
      const L = h.style === 'shaggy' ? 1.25 : h.style === 'short' ? 0.8 : 1;
      // the scout: soft, voluminous chestnut clumps swirling from the crown,
      // bangs swept across the forehead, a few tufts flicking up
      out.push(...scalp(base, 0.3, 0.84));
      const crownP = 1.42;
      if (!under) {
        // upper layer: big clumps from the crown down to the sides and back
        const n = 13;
        for (let i = 0; i < n; i++) {
          const yaw = (i / n) * Math.PI * 2 + 0.25 + rng.float(-0.1, 0.1);
          const front = Math.cos(yaw) > 0.5;
          if (front && !capped) continue;
          const swirl = rng.float(0.25, 0.5);
          out.push(surfaceLock(yaw - swirl, crownP, yaw + swirl * 0.4, rng.float(0.3, 0.55) - (L - 1) * 0.5, rng.float(0.13, 0.15), deep, tip, { lift: 0.07, bulge: 0.07, flick: rng.float(0.03, 0.06) }));
        }
        // tufts flicking up off the crown
        for (let i = 0; i < (h.style === 'short' ? 2 : h.style === 'spiky' ? 7 : 4); i++) {
          const yaw = rng.float(-2.4, 2.4);
          out.push(surfaceLock(yaw + 0.8, 1.25, yaw, 1.5, 0.06, base, tip, { lift: 0.06, bulge: 0.04, flick: 0.09 }));
        }
      }
      // under layer at the back, falling to the nape
      for (let i = 0; i < 9; i++) {
        const yaw = Math.PI + (i / 8 - 0.5) * 3.2;
        out.push(surfaceLock(yaw, 0.95, yaw + rng.float(-0.25, 0.25), rng.float(-0.4, -0.25) - (L - 1) * 0.6, 0.12, deep, base, { lift: 0.03, bulge: 0.035, flick: 0.03 }));
      }
      // sides over the ears' tops
      for (const s of [-1, 1]) {
        out.push(surfaceLock(s * 0.95, 1.05, s * 1.38, 0.08, 0.1, deep, tip, { lift: 0.032, bulge: 0.035, flick: 0.03 }));
        out.push(surfaceLock(s * 1.35, 0.9, s * 1.66, -0.08, 0.1, deep, base, { lift: 0.032, bulge: 0.035, flick: 0.025 }));
      }
      // bangs: swept clumps from the crown front over the forehead
      if (!capped || opts.hidden === 'cap') {
        const bangs = [[-0.75, -0.62], [-0.38, -0.25], [-0.02, 0.18], [0.32, 0.5], [0.66, 0.85]];
        bangs.forEach(([y0, y1], i) => {
          out.push(surfaceLock(y0 + 0.3, 1.32, y1 - 0.1, rng.float(0.1, 0.22), rng.float(0.11, 0.13), base, tip, { lift: 0.045, bulge: 0.06, flick: 0.045, drop: i % 2 ? 0.01 : 0 }));
        });
      }
      break;
    }
    case 'curlyBun': {
      // the Sunland Queen: curls pulled up into a big bun, ringlets framing the face
      out.push(...scalp(base, 0.36, 0.86));
      for (let i = 0; i < 16; i++) {
        const yaw = (i / 16) * Math.PI * 2 + rng.float(-0.1, 0.1);
        const front = Math.cos(yaw) > 0.5;
        out.push(surfaceLock(yaw, front ? 0.62 : rng.float(0.05, 0.4), yaw * 0.85, 1.42, rng.float(0.1, 0.12), deep, base, { lift: 0.035, bulge: 0.04, flick: 0.01 }));
      }
      if (!under) {
        // the bun: a cluster of coiled curls
        const c = V(0, 0.31, -0.07);
        out.push(prep(xf(ellipsoid(0.15, 0.12, 0.14, 22, 16), { p: [c.x, c.y, c.z] }), base));
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const e = i % 2 ? 0.3 : -0.2;
          const at = c.clone().add(new Vector3(Math.cos(a) * 0.14, e * 0.13 + 0.03, Math.sin(a) * 0.13));
          out.push(curl(at, 0.045, i % 3 ? base : tip, 1.6, new Vector3(Math.cos(a) * 0.4, -0.6, Math.sin(a) * 0.4).normalize()));
        }
        for (let i = 0; i < 6; i++) out.push(curl(c.clone().add(new Vector3(rng.float(-0.06, 0.06), 0.1, rng.float(-0.06, 0.06))), 0.03, tip, 1.4, new Vector3(0, 1, 0)));
      }
      // ringlets in front of the ears, and a mass of curls at the nape
      for (const s of [-1, 1]) for (let k = 0; k < 2; k++) out.push(curl(onHead(s * (1.18 + k * 0.22), 0.2 - k * 0.1, 1.03), 0.04, k ? base : tip, 3, dirOf(s * 0.15, -1, 0.1)));
      for (let i = 0; i < 9; i++) {
        const yaw = Math.PI + (i / 8 - 0.5) * 2.4;
        out.push(curl(onHead(yaw, rng.float(-0.1, 0.25), 1.04), 0.045, i % 2 ? base : deep, 2.2, dirOf(Math.sin(yaw) * 0.2, -1, Math.cos(yaw) * 0.2)));
      }
      break;
    }
    case 'mane': {
      // the Highland King: thick waves swept back from the brow, full at the sides
      out.push(...scalp(base, 0.27, 0.88));
      for (let i = 0; i < 11; i++) {
        const yaw = (i / 10 - 0.5) * 2.3;
        out.push(surfaceLock(yaw, 0.92, yaw * 1.2 + (yaw > 0 ? 0.25 : -0.25), 2.3, rng.float(0.11, 0.13), base, tip, { lift: 0.035, bulge: 0.06, flick: 0.04 }));
      }
      for (let i = 0; i < 12; i++) {
        const yaw = Math.PI + (i / 11 - 0.5) * 3.8;
        out.push(surfaceLock(yaw, 0.9, yaw + rng.float(-0.3, 0.3), -0.45, 0.12, deep, tip, { lift: 0.04, bulge: 0.05, flick: 0.06 }));
      }
      for (const s of [-1, 1]) {
        out.push(surfaceLock(s * 1.2, 0.9, s * 1.9, 0.35, 0.11, base, tip, { lift: 0.035, bulge: 0.04, flick: 0.04 }));
        out.push(surfaceLock(s * 1.5, 0.75, s * 2.2, 0.0, 0.11, deep, tip, { lift: 0.035, bulge: 0.04, flick: 0.05 }));
      }
      break;
    }
    case 'longWavy': {
      // the Island Matriarch: long, wavy hair falling past the shoulders
      out.push(...scalp(base, 0.36, 0.9));
      for (let i = 0; i < 18; i++) {
        const yaw = Math.PI + (i / 17 - 0.5) * 4.3;
        const out1 = onHead(yaw, 1.15, 1.05);
        const r = HEAD_R * 1.12;
        const side = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const wave = rng.float(-0.04, 0.04);
        const b = onHead(yaw, 0.2, 1.22);
        const c = V(side.x * r * 1.0 + wave, -0.32, side.z * r * 0.95 - 0.04);
        const d = V(side.x * r * 0.92 - wave, -0.62 - rng.float(0, 0.08), side.z * r * 0.9 - 0.06);
        out.push(lock(out1, b, c, d, rng.float(0.1, 0.12), { flat: 0.45, up: side, root: base, end: tip, swell: 0.2, seg: 16, ring: 10, tip: 0.15 }));
      }
      // a crown layer and a soft parted fringe
      for (let i = 0; i < 12; i++) {
        const yaw = (i / 12) * Math.PI * 2;
        if (Math.cos(yaw) > 0.6) continue;
        out.push(surfaceLock(yaw, 1.45, yaw, 0.55, 0.12, deep, base, { lift: 0.05, bulge: 0.05, flick: 0.02 }));
      }
      for (const s of [-1, 1]) {
        out.push(surfaceLock(s * 0.12, 1.4, s * 0.7, 0.35, 0.12, base, tip, { lift: 0.04, bulge: 0.05, flick: 0.03 }));
        out.push(surfaceLock(s * 0.5, 1.25, s * 1.2, 0.15, 0.11, base, tip, { lift: 0.04, bulge: 0.05, flick: 0.03 }));
        // front locks falling over the shoulders
        const a = onHead(s * 1.2, 0.3, 1.02);
        out.push(lock(a, onHead(s * 1.3, -0.4, 1.15), V(s * 0.24, -0.4, 0.06), V(s * 0.2, -0.62, 0.1), 0.085, { flat: 0.5, up: new Vector3(s, 0, 0.3), root: base, end: tip, seg: 14, ring: 10, tip: 0.15 }));
      }
      break;
    }
    case 'topknot': {
      // the Eastern Scholar-Prince: hair combed up into a topknot, side-swept fringe
      out.push(...scalp(base, 0.38, 0.86));
      for (let i = 0; i < 14; i++) {
        const yaw = (i / 14) * Math.PI * 2;
        if (Math.cos(yaw) > 0.55) continue;
        out.push(surfaceLock(yaw, rng.float(0.05, 0.3), yaw * 0.6, 1.45, 0.12, deep, base, { lift: 0.03, bulge: 0.035, flick: 0.0 }));
      }
      out.push(prep(xf(ellipsoid(0.075, 0.08, 0.075, 18, 12), { p: [0, HEAD_Y + 0.3, -0.02] }), base));
      out.push(prep(xf(torus(0.06, 0.022, 8, 18), { r: [Math.PI / 2, 0, 0], p: [0, HEAD_Y + 0.255, -0.02] }), deep));
      // the fringe sweeping to one side, and long locks framing the face
      for (let i = 0; i < 5; i++) out.push(surfaceLock(0.55 - i * 0.12, 1.35, -0.25 - i * 0.18, 0.32 - i * 0.03, 0.11, base, tip, { lift: 0.04, bulge: 0.05, flick: 0.03 }));
      for (const s of [-1, 1]) {
        const a = onHead(s * 1.0, 0.6, 1.02);
        out.push(lock(a, onHead(s * 1.15, 0.0, 1.1), onHead(s * 1.2, -0.6, 1.1), V(s * 0.21, -0.2, 0.08), 0.06, { flat: 0.5, up: new Vector3(s, 0, 0.3), root: base, end: tip, seg: 12, ring: 8, tip: 0.15 }));
      }
      break;
    }
    case 'braids':
    case 'tiedBack':
    case 'ponytail':
    case 'long':
    case 'twintails':
    case 'bob': {
      out.push(...scalp(base, 0.46, h.style === 'bob' ? 0.72 : 0.86));
      if (!capped && !under) for (let i = 0; i < 10; i++) {
        const yaw = (i / 9 - 0.5) * 3;
        L({ yaw, pitch: rng.float(0.85, 1.05), dir: dirOf(Math.sin(yaw) * 0.7, -0.1, -0.7), len: 0.15, r: 0.065, curl: 0.2, lift: 0.06 }, base, tip);
      }
      for (let i = 0; i < 12; i++) {
        const yaw = Math.PI + (i / 11 - 0.5) * 3.8;
        L({ yaw, pitch: rng.float(0.05, 0.5), dir: dirOf(Math.sin(yaw) * 0.25, -1, Math.cos(yaw) * 0.25), len: h.style === 'bob' ? 0.14 : 0.16, r: 0.065, curl: rng.float(-0.4, 0.4), lift: 0.04 }, deep, base);
      }
      if (h.style === 'bob') for (const s of [-1, 1]) L({ yaw: s * 1.2, pitch: 0.3, dir: dirOf(s * 0.1, -1, 0.3), len: 0.2, r: 0.07, curl: -s * 0.3, lift: 0.04 });
      else for (const s of [-1, 1]) L({ yaw: s * 1.25, pitch: 0.35, dir: dirOf(s * 0.15, -1, 0.15), len: 0.18, r: 0.055, curl: s * 0.3, lift: 0.03 });
      bangs(6, 1.5, 0.15, 0.2, 0.055, 0.7);
      const tie = h.accent ?? shade(h.color, -0.25);
      if (h.style === 'braids' || h.style === 'twintails') {
        for (const s of [-1, 1]) {
          const start = onHead(s * 1.6, -0.05, 1.05);
          neck.push(braid(start, dirOf(s * 0.15, -1, 0.35), h.style === 'braids' ? 0.42 : 0.36, 0.05, base, tip, tie));
        }
      } else if (h.style === 'ponytail' || h.style === 'tiedBack' || h.style === 'long') {
        const start = onHead(Math.PI, h.style === 'ponytail' ? 0.75 : 0.25, 1.05);
        if (h.style === 'ponytail') {
          out.push(prep(xf(torus(0.04, 0.02, 6, 14), { r: [0.6, 0, 0], p: [start.x, start.y, start.z] }), tie));
          out.push(lock(start, start.clone().add(dirOf(0, 0.06, -0.12)), start.clone().add(dirOf(0, -0.1, -0.2)), start.clone().add(dirOf(0, -0.3, -0.16)), 0.075, { root: base, end: tip, flat: 0.8 }));
        } else neck.push(braid(start, dirOf(0, -1, -0.25), h.style === 'long' ? 0.45 : 0.3, 0.055, base, tip, tie));
      }
      break;
    }
  }

  if (h.beard) {
    const bc = shade(h.color, -0.03);
    const bt = shade(h.color, 0.07);
    if (h.beard !== 'moustache') {
      const full = h.beard === 'full';
      for (const s of [-1, 1]) {
        // sideburns, then the jaw line, then under the chin
        out.push(surfaceLock(s * 1.38, 0.2, s * 1.28, -0.4, 0.075, bc, bt, { lift: 0.022, bulge: 0.02, flick: 0.01 }));
        out.push(surfaceLock(s * 1.22, -0.42, s * 0.62, -1.08, 0.085, bc, bt, { lift: 0.028, bulge: 0.03, flick: 0.03, drop: full ? 0.02 : 0 }));
        out.push(surfaceLock(s * 0.55, -0.92, s * 0.22, -1.28, 0.085, bc, bt, { lift: 0.03, bulge: 0.035, flick: 0.04, drop: full ? 0.04 : 0 }));
      }
      out.push(surfaceLock(0, -0.95, 0, -1.32, 0.09, bc, bt, { lift: 0.032, bulge: 0.04, flick: 0.05, drop: full ? 0.05 : 0.01 }));
    }
    // moustache: two curled wings under the nose, clear of the mouth
    for (const s of [-1, 1]) {
      const a = onHead(s * 0.03, -0.5, 1.03);
      out.push(lock(a, onHead(s * 0.12, -0.5, 1.04), onHead(s * 0.22, -0.55, 1.035), onHead(s * 0.28, -0.63, 1.02), 0.016, { flat: 0.6, up: new Vector3(0, 0, 1), root: bc, end: bt, swell: 0.6 }));
    }
  }

  const parts: HairPart[] = [];
  if (out.length) parts.push({ bone: 'head', geo: mergeAll(out.map((g) => (g.attributes.uv ? stripUv(g) : g))) });
  if (neck.length) parts.push({ bone: 'head', geo: mergeAll(neck) });
  return parts;
}

function stripUv(g: BufferGeometry): BufferGeometry {
  g.deleteAttribute('uv');
  return g;
}

/** A plaited braid: alternating lobes down a curve, tied at the end. */
function braid(start: Vector3, dir: Vector3, len: number, r: number, a: string, b: string, tie: string): BufferGeometry {
  const geos: BufferGeometry[] = [];
  const d = dir.clone().normalize();
  const side = new Vector3(1, 0, 0).addScaledVector(d, -d.x).normalize();
  const n = Math.round(len / (r * 1.1));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const p = start.clone().addScaledVector(d, t * len).addScaledVector(side, (i % 2 ? 1 : -1) * r * 0.25);
    const rr = r * (1 - t * 0.35);
    geos.push(prep(xf(ellipsoid(rr, rr * 0.75, rr * 0.9, 12, 8), { r: [0, 0, (i % 2 ? 1 : -1) * 0.5], p: [p.x, p.y, p.z] }), i % 2 ? a : b));
  }
  const end = start.clone().addScaledVector(d, len);
  geos.push(prep(xf(torus(r * 0.55, r * 0.25, 6, 12), { r: [Math.PI / 2, 0, 0], p: [end.x, end.y, end.z] }), tie));
  const tuft = end.clone().addScaledVector(d, 0.02);
  geos.push(lock(tuft, tuft.clone().addScaledVector(d, 0.03), tuft.clone().addScaledVector(d, 0.06), tuft.clone().addScaledVector(d, 0.09), r * 0.6, { root: a, end: b }));
  return mergeAll(geos.map((g) => (g.attributes.uv ? stripUv(g) : g)));
}
