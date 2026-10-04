import type { Rng } from '../../shared/rng';
import { CONCEPTS, FAMILIES, type FamilyId } from './concepts';

// Procedural glyphs: every family gets a base shape and each concept adds
// marks to it, so words with related meanings look related. All glyphs are
// SVG stroke paths in a 100x100 box.

const BASES: Record<string, string> = {
  circle: 'M80 50A30 30 0 1 1 20 50A30 30 0 1 1 80 50',
  triangle: 'M50 18L82 76L18 76Z',
  square: 'M24 24H76V76H24Z',
  diamond: 'M50 15L85 50L50 85L15 50Z',
  arc: 'M20 30A30 30 0 0 0 80 30',
  chevron: 'M20 26L50 74L80 26',
  bowtie: 'M24 22L76 22L24 78L76 78Z',
  gate: 'M24 82V46A26 26 0 0 1 76 46V82',
};

const dot = (x: number, y: number) => `M${x} ${y - 3}a3 3 0 1 0 0.01 0`;

/** A stroke path, optionally scaled about the center (for the "inner" mark). */
export interface GlyphPart {
  d: string;
  s?: number;
}

const MARKS: Record<string, (base: string) => GlyphPart> = {
  dot: () => ({ d: dot(50, 50) }),
  topdot: () => ({ d: dot(50, 6) }),
  underbar: () => ({ d: 'M30 94H70' }),
  overbar: () => ({ d: 'M30 6H70' }),
  tickL: () => ({ d: 'M4 38L14 50' }),
  tickR: () => ({ d: 'M96 38L86 50' }),
  inner: (b) => ({ d: b, s: 0.42 }),
  slash: () => ({ d: 'M32 68L68 32' }),
  tail: () => ({ d: 'M50 86V98' }),
  twin: () => ({ d: `${dot(38, 50)}${dot(62, 50)}` }),
};

const COMBOS: string[][] = [
  ['dot'], ['underbar'], ['inner'], ['topdot'], ['tickR'], ['slash'], ['tail'], ['twin'], ['overbar'], ['tickL'],
  ['dot', 'underbar'], ['inner', 'tail'], ['topdot', 'tickL'], ['twin', 'overbar'], ['slash', 'tickR'],
];

export interface GlyphSet {
  /** Concept id -> stroke parts. */
  paths: Record<string, GlyphPart[]>;
  /** Family -> base shape name. */
  base: Record<FamilyId, string>;
}

export function makeGlyphs(rng: Rng): GlyphSet {
  const shapes = rng.shuffle(Object.keys(BASES));
  const base = {} as Record<FamilyId, string>;
  FAMILIES.forEach((f, k) => (base[f.id] = shapes[k % shapes.length]));
  const paths: Record<string, GlyphPart[]> = {};
  for (const f of FAMILIES) {
    const members = CONCEPTS.filter((c) => c.family === f.id);
    const combos = rng.shuffle(COMBOS.slice());
    const b = BASES[base[f.id]];
    members.forEach((c, k) => {
      // The first member of a family is the bare root shape.
      paths[c.id] = [{ d: b }, ...(k === 0 ? [] : combos[k - 1].map((m) => MARKS[m](b)))];
    });
  }
  return { paths, base };
}

/** Numerals: dots count one, bars count four, an empty ring is zero. */
export function digitParts(v: number): GlyphPart[] {
  return [{ d: digitPath(v) }];
}

function digitPath(v: number): string {
  if (v === 0) return 'M64 50A14 14 0 1 1 36 50A14 14 0 1 1 64 50';
  const bars = Math.floor(v / 4);
  const dots = v % 4;
  let p = '';
  for (let k = 0; k < bars; k++) {
    const y = 80 - k * 16;
    p += `M22 ${y}H78`;
  }
  const top = 80 - bars * 16 - (bars ? 4 : -4);
  for (let k = 0; k < dots; k++) {
    const x = 50 + (k - (dots - 1) / 2) * 18;
    p += dot(x, top - 10);
  }
  return p;
}

/** Digits of n in a base, most significant first. */
export function toDigits(n: number, base: number): number[] {
  if (n === 0) return [0];
  const out: number[] = [];
  while (n > 0) {
    out.unshift(n % base);
    n = Math.floor(n / base);
  }
  return out;
}

export function fromDigits(d: number[], base: number): number {
  return d.reduce((a, v) => a * base + v, 0);
}
