// A ChibiSpec drawn in voxels. Every character in the games (soldiers,
// leaders, civilians, LumiQuest's player and villagers) is one spec: the same
// body template, dressed piece by piece, with a pixel-art face.
//
// Layout (voxels, VOX each; feet at y=0, facing +Z, the character's left at +X):
//   head    10×10×10 on the head bone (y 18–28)
//   chest   8 wide, y 11–18 · hips 8 wide, y 7–11 (skirts hang below)
//   arms    3 wide, shoulders at y 17 · legs 3 wide, hips at y 9
// Each part is a grid in its bone's space.

import { Color } from 'three';
import type { Expression, FaceSpec } from './face';
import type { BoneName } from './rig';
import type { ChibiSpec, Emblem, HairSpec, Item, Piece } from './spec';
import { VoxelGrid } from './voxel';

export type Parts = Partial<Record<BoneName, VoxelGrid>>;

const tmp = new Color();
export function shade(hex: string | number, l: number, s = 0): string {
  tmp.set(hex as string);
  tmp.offsetHSL(0, s, l);
  return `#${tmp.getHexString()}`;
}

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

const GOLD = '#e2b04a';
const WOOD = '#8a5a32';
const LEATHER = '#7a4a2c';

// ---------------------------------------------------------------------------
// Emblems as 6×6 pixel art (rows top to bottom; '#' = emblem colour)

const EMBLEMS: Record<Emblem, string[]> = {
  fleur: ['..##..', '.####.', '#.##.#', '######', '..##..', '.####.'],
  swords: ['#....#', '.#..#.', '..##..', '..##..', '.#..#.', '#....#'],
  sun: ['#.##.#', '.####.', '######', '######', '.####.', '#.##.#'],
  knot: ['.####.', '#.##.#', '##..##', '##..##', '#.##.#', '.####.'],
  wave: ['......', '.##...', '#..#.#', '....#.', '.##...', '#..###'],
  blossom: ['..##..', '##..##', '#.##.#', '#.##.#', '##..##', '..##..'],
  mountain: ['......', '..#...', '.###..', '.####.', '######', '######'],
  leaf: ['....##', '...###', '..###.', '.###..', '###...', '#.....'],
};

/** Paints an emblem on a plane: put(col, row, colour) with col 0–5 left to right, row 0–5 top to bottom. */
function emblem(e: Emblem | undefined, color: string, put: (c: number, r: number, col: string) => void): void {
  if (!e) return;
  const rows = EMBLEMS[e];
  if (!rows) return;
  rows.forEach((line, r) => [...line].forEach((ch, c) => ch === '#' && put(c, r, color)));
}

// ---------------------------------------------------------------------------
// The body template

interface Build {
  spec: ChibiSpec;
  p: Parts;
  skin: string;
  /** Torso half width (4, or 5 when stocky). */
  hw: number;
  /** Legs hidden under a floor-length skirt. */
  noLegs: boolean;
  /** What covers the head (hair is trimmed under it). */
  cover: 'none' | 'helmet' | 'hat' | 'cap';
}

function grid(b: Build, bone: BoneName, offset: [number, number, number] = [0, 0, 0]): VoxelGrid {
  return (b.p[bone] ??= new VoxelGrid(offset));
}

const LIMB: [number, number, number] = [-0.5, 0, -0.5];

function base(b: Build): void {
  const s = b.skin;
  const hw = b.hw;
  grid(b, 'head').box(-5, 5, 0, 10, -5, 5, s);
  grid(b, 'chest').box(-hw, hw, -3, 4, -3, 3, '#e8dcc4');
  grid(b, 'hips').box(-hw, hw, -2, 2, -3, 3, '#4a3f3a');
  for (const side of ['L', 'R'] as const) {
    grid(b, `arm${side}`, LIMB).box(-1, 2, -4, 1, -1, 2, '#e8dcc4');
    grid(b, `fore${side}`, LIMB).box(-1, 2, -4, 0, -1, 2, s);
    grid(b, `hand${side}`, LIMB).box(-1, 2, -2, 0, -1, 2, s);
    grid(b, `thigh${side}`, LIMB).box(-1, 2, -4, 1, -1, 2, '#4a3f3a');
    grid(b, `shin${side}`, LIMB).box(-1, 2, -3, 0, -1, 2, '#4a3f3a');
    grid(b, `foot${side}`, LIMB).box(-1, 2, -1, 1, -1, 3, '#5a3a24');
  }
}

/** A skirt hanging from the hips: `len` voxels below the hips, widening by `flare`. */
function skirt(b: Build, color: string, len: number, flare: number, trim?: string, open = 0): void {
  const g = grid(b, 'hips');
  const hw = b.hw;
  const bottom = -2 - len;
  if (bottom <= -8) b.noLegs = true;
  for (let y = -2; y > bottom; y--) {
    const t = (-2 - y) / Math.max(1, len);
    const wx = hw + Math.round(flare * 6 * t);
    const wz = 3 + Math.round(flare * 5 * t);
    const yy = y - 1;
    for (let x = -wx; x < wx; x++)
      for (let z = -wz; z < wz; z++) {
        if (open && z >= wz - 1 && Math.abs(x + 0.5) < open * wx) continue;
        g.set(x, yy, z, trim && y === bottom + 1 ? trim : color);
      }
  }
  if (b.noLegs) {
    // fill to the floor so the hem stands on the ground
    const last = -2 - len;
    for (let y = last; y >= -9; y--) {
      const wx = hw + Math.round(flare * 6);
      const wz = 3 + Math.round(flare * 5);
      for (let x = -wx; x < wx; x++) for (let z = -wz; z < wz; z++) g.set(x, y - 1, z, trim && y === -9 ? trim : color);
    }
  }
}

/** A woven border a little above the hem: a band and a row of diamonds. */
function border(g: VoxelGrid, color: string): void {
  let bottom = 0;
  g.recolor((_x, y) => {
    bottom = Math.min(bottom, y);
    return null;
  });
  if (bottom > -5) return;
  g.recolor((x, y, z) => {
    const d = y - bottom;
    if (d === 2) return color;
    if (d === 4 && (x + z) % 3 === 0) return color;
    return null;
  });
}

const lenVox = (m: number | undefined, d: number) => Math.round((m ?? d) / 0.035);

function piece(b: Build, pc: Piece): void {
  const hw = b.hw;
  const chest = grid(b, 'chest');
  const hips = grid(b, 'hips');
  const arms = (fn: (g: VoxelGrid, side: 'L' | 'R') => void) => (['L', 'R'] as const).forEach((s) => fn(grid(b, `arm${s}`, LIMB), s));
  const fores = (fn: (g: VoxelGrid, side: 'L' | 'R') => void) => (['L', 'R'] as const).forEach((s) => fn(grid(b, `fore${s}`, LIMB), s));
  const hands = (fn: (g: VoxelGrid, side: 'L' | 'R') => void) => (['L', 'R'] as const).forEach((s) => fn(grid(b, `hand${s}`, LIMB), s));
  const legs = (bone: 'thigh' | 'shin' | 'foot', fn: (g: VoxelGrid) => void) => (['L', 'R'] as const).forEach((s) => fn(grid(b, `${bone}${s}`, LIMB)));
  const head = grid(b, 'head');
  switch (pc.k) {
    case 'tunic': {
      chest.paint(-hw, hw, -3, 4, -3, 3, pc.color);
      hips.paint(-hw, hw, -2, 2, -3, 3, pc.color);
      const len = lenVox(pc.length, 0.1);
      if (len > 0) skirt(b, pc.color, len, 0.15, pc.trim);
      if (pc.collar) chest.box(-3, 3, 3, 4, -3, 3, pc.collar);
      if (pc.vneck) chest.paint(-1, 1, 2, 4, 2, 3, pc.vneck);
      if (pc.trim) chest.paint(-hw, hw, -3, -2, -3, 3, pc.trim);
      break;
    }
    case 'sleeves': {
      const st = pc.style ?? 'long';
      arms((g) => {
        if (st === 'puff') g.box(-2, 3, -3, 1, -2, 3, pc.color);
        else g.paint(-1, 2, -4, 1, -1, 2, st === 'bare' ? b.skin : pc.color);
      });
      fores((g) => {
        if (st === 'long' || st === 'wide') g.paint(-1, 2, -4, 0, -1, 2, pc.color);
        if (st === 'wide') g.box(-2, 3, -4, -1, -2, 3, pc.color);
        if (st === 'bare' || st === 'short' || st === 'puff') g.paint(-1, 2, -4, 0, -1, 2, b.skin);
        if (pc.cuff) g.paint(-2, 3, -4, -3, -2, 3, pc.cuff);
        if (pc.trim) g.paint(-2, 3, -4, -3, -2, 3, pc.trim);
      });
      if (st === 'puff' && pc.cuff) arms((g) => g.paint(-2, 3, -3, -2, -2, 3, pc.cuff!));
      break;
    }
    case 'tabard': {
      const len = lenVox(pc.length, 0.12);
      for (const z of [3, -4]) {
        chest.box(-3, 3, -3, 4, z, z + 1, pc.color);
        hips.box(-3, 3, -2 - len, 2, z, z + 1, pc.color);
        if (pc.trim) {
          hips.box(-3, 3, -2 - len, -1 - len, z, z + 1, pc.trim);
          chest.box(-3, -2, -3, 4, z, z + 1, pc.trim);
          chest.box(2, 3, -3, 4, z, z + 1, pc.trim);
        }
      }
      emblem(pc.emblem, pc.emblemColor ?? GOLD, (c, r, col) => chest.set(c - 3, 2 - r, 3, col));
      break;
    }
    case 'vest': {
      chest.recolor((x, _y, z) => (z === 2 && Math.abs(x + 0.5) < (pc.open ? 2 : 1) ? null : pc.color));
      if (pc.trim) chest.paint(-hw, hw, 3, 4, -3, 3, pc.trim);
      break;
    }
    case 'robe': {
      chest.paint(-hw, hw, -3, 4, -3, 3, pc.color);
      hips.paint(-hw, hw, -2, 2, -3, 3, pc.color);
      skirt(b, pc.color, lenVox(pc.length, 0.36), pc.flare ?? 0.25, pc.trim);
      if (pc.inner) chest.paint(-1, 1, -3, 4, 2, 3, pc.inner);
      if (pc.trim) {
        chest.paint(-1, 1, -3, 4, 2, 3, pc.trim);
        hips.recolor((x, y, z) => (Math.abs(x + 0.5) < 1 && z >= 2 && y < 2 ? pc.trim : null));
      }
      if (pc.pattern) border(hips, pc.pattern);
      if (pc.sash) chest.paint(-hw, hw, -3, -2, -3, 3, pc.sash);
      fores((g) => {
        g.paint(-1, 2, -4, 0, -1, 2, pc.color);
        if (pc.wideSleeves) g.box(-2, 3, -4, -1, -2, 3, pc.color);
        if (pc.trim) g.paint(-2, 3, -4, -3, -2, 3, pc.trim);
      });
      arms((g) => g.paint(-1, 2, -4, 1, -1, 2, pc.color));
      break;
    }
    case 'gown': {
      chest.paint(-hw, hw, -3, 4, -3, 3, pc.bodice);
      hips.paint(-hw, hw, -2, 2, -3, 3, pc.bodice);
      arms((g) => g.paint(-1, 2, -4, 1, -1, 2, pc.bodice));
      // layers from the longest (inner) out
      const layers = [...pc.layers].sort((a, c) => c.length - a.length);
      for (const l of layers) skirt(b, l.color, lenVox(l.length, 0.3), l.flare, l.trim ?? pc.trim, l.open ?? 0);
      if (pc.trim) chest.paint(-hw, hw, 3, 4, -3, 3, pc.trim);
      if (pc.pattern) border(hips, pc.pattern);
      break;
    }
    case 'skirt': {
      hips.paint(-hw, hw, -2, 2, -3, 3, pc.color);
      skirt(b, pc.color, lenVox(pc.length, 0.2), pc.flare ?? 0.2, pc.trim);
      if (pc.wrap) hips.recolor((x, y, z) => (z >= 2 && x - y === 0 ? pc.wrap : null));
      break;
    }
    case 'apron': {
      hips.box(-3, 3, -7, 1, 3, 4, pc.color);
      chest.box(-3, 3, -3, 2, 3, 4, pc.color);
      if (pc.trim) hips.box(-3, 3, -7, -6, 3, 4, pc.trim);
      if (pc.patch) hips.box(-1, 1, -4, -2, 4, 5, pc.patch);
      break;
    }
    case 'pants': {
      legs('thigh', (g) => g.paint(-1, 2, -4, 1, -1, 2, pc.color));
      legs('shin', (g) => g.paint(-1, 2, -3, 0, -1, 2, pc.short ? b.skin : pc.color));
      hips.paint(-hw, hw, -2, 2, -3, 3, pc.color);
      if (pc.baggy) legs('thigh', (g) => g.box(-2, 3, -3, 0, -2, 3, pc.color));
      break;
    }
    case 'boots': {
      legs('foot', (g) => {
        g.paint(-1, 2, -1, 1, -1, 3, pc.color);
        g.paint(-1, 2, -1, 0, -1, 3, pc.sole ?? shade(pc.color, -0.15));
      });
      legs('shin', (g) => {
        g.paint(-1, 2, pc.tall ? -3 : -3, pc.tall ? 0 : -1, -1, 2, pc.color);
        if (pc.cuff) g.box(-2, 3, pc.tall ? -1 : -2, pc.tall ? 0 : -1, -2, 3, pc.cuff);
        if (pc.buckle) g.set(0, -2, 2, pc.buckle);
      });
      break;
    }
    case 'sandals':
      legs('foot', (g) => {
        g.paint(-1, 2, 0, 1, -1, 3, b.skin);
        g.paint(-1, 2, -1, 0, -1, 3, pc.color);
      });
      if (pc.wraps) legs('shin', (g) => g.recolor((_x, y) => (y % 2 === 0 ? pc.color : null)));
      break;
    case 'shoes':
      legs('foot', (g) => g.paint(-1, 2, -1, 1, -1, 3, pc.color));
      if (pc.trim) legs('foot', (g) => g.paint(-1, 2, 0, 1, 2, 3, pc.trim!));
      break;
    case 'gloves':
      hands((g) => g.paint(-1, 2, -2, 0, -1, 2, pc.color));
      if (pc.fingerless) hands((g) => g.paint(-1, 2, -2, -1, -1, 2, b.skin));
      break;
    case 'bracers':
      fores((g) => g.box(-2, 3, -4, -1, -2, 3, pc.color));
      if (pc.trim) fores((g) => g.paint(-2, 3, -2, -1, -2, 3, pc.trim!));
      break;
    case 'bangles':
      fores((g) => g.box(-2, 3, -4, -3, -2, 3, pc.color));
      break;
    case 'belt': {
      const y = pc.y !== undefined ? Math.round(pc.y / 0.035) : 1;
      const yy = Math.max(-2, Math.min(1, y));
      hips.box(-hw, hw, yy, yy + (pc.wide ? 2 : 1), -3, 3, pc.color);
      hips.box(-1, 1, yy, yy + 1, 3, 4, pc.buckle ?? GOLD);
      break;
    }
    case 'strap':
      for (let y = -3; y < 4; y++) {
        const x = Math.round(pc.side * (y * 0.75));
        chest.paint(x - 1, x + 1, y, y + 1, 2, 3, pc.color);
        chest.paint(-x - 1, -x + 1, y, y + 1, -3, -2, pc.color);
      }
      if (pc.buckle) chest.paint(0, 1, 0, 1, 2, 3, pc.buckle);
      break;
    case 'pouch': {
      const sx = pc.side > 0 ? hw : -hw - 2;
      if (pc.front) hips.box(pc.side > 0 ? 1 : -3, pc.side > 0 ? 3 : -1, -2, 1, 3, 4, pc.color);
      else hips.box(sx, sx + 2, -2, 1, -1, 2, pc.color);
      if (pc.flap) hips.paint(sx, sx + 2, 0, 1, -1, 2, pc.flap);
      break;
    }
    case 'scarf': {
      for (let x = -hw - 1; x < hw + 1; x++) for (let z = -4; z < 4; z++) if (x === -hw - 1 || x === hw || z === -4 || z === 3) chest.set(x, 3, z, pc.color);
      chest.box(-4, 4, 3, 4, -3, 3, pc.color);
      head.box(-4, 4, -1, 0, -4, 4, pc.color);
      if (pc.tails) chest.box(1, 3, -2, 3, 3, 4, pc.color);
      if (pc.trim) chest.paint(-hw - 1, hw + 1, 3, 4, -4, 4, pc.trim);
      break;
    }
    case 'cape':
    case 'furCloak': {
      const g = grid(b, 'cape');
      const len = pc.k === 'cape' ? lenVox(pc.length, 0.3) + 3 : 11;
      const color = pc.color;
      const inner = pc.k === 'cape' ? pc.inner ?? shade(color, -0.12) : shade(color, -0.12);
      for (let y = 0; y > -len; y--) {
        const w = 4 + Math.round((-y / len) * 1.5);
        for (let x = -w; x < w; x++) {
          g.set(x, y, -1, color);
          g.set(x, y, 0, inner);
        }
      }
      if (pc.trim) {
        for (let x = -6; x < 6; x++) g.paint(x, x + 1, -len + 1, -len + 2, -1, 1, pc.trim);
      }
      emblem(pc.emblem, pc.emblemColor ?? GOLD, (c, r, col) => g.set(2 - c, -3 - r, -2, col));
      if (pc.k === 'furCloak') {
        for (let x = -hw - 1; x < hw + 1; x++) for (let z = -4; z < 4; z++) for (const y of [2, 3]) chest.set(x, y, z, pc.fur);
        chest.box(-3, 3, 4, 5, -3, 3, pc.fur);
      } else if (pc.collar) chest.box(-hw, hw, 3, 5, -4, -2, pc.collar);
      break;
    }
    case 'backpack': {
      const d = pc.big ? 4 : 3;
      chest.box(-3, 3, -3, 3, -3 - d, -3, pc.color);
      if (pc.roll) chest.box(-4, 4, 3, 5, -3 - d, -3, pc.roll);
      if (pc.strap ?? LEATHER) chest.paint(-3, -2, -3, 4, 2, 3, pc.strap ?? LEATHER).paint(1, 2, -3, 4, 2, 3, pc.strap ?? LEATHER);
      if (pc.buckle) chest.set(0, 0, -4 - d, pc.buckle);
      break;
    }
    case 'sash':
      for (let y = -3; y < 4; y++) {
        const x = Math.round(pc.side * (y * 0.85));
        for (const z of [2, -3]) chest.paint(x - 1, x + 1, y, y + 1, z, z + 1, pc.color);
      }
      hips.box(pc.side > 0 ? 2 : -4, pc.side > 0 ? 4 : -2, -3, 1, 3, 4, pc.color);
      if (pc.trim) hips.paint(pc.side > 0 ? 2 : -4, pc.side > 0 ? 4 : -2, -3, -2, 3, 4, pc.trim);
      break;
    case 'necklace':
      chest.box(-3, 3, 3, 4, 3, 4, pc.beads ?? pc.color);
      if (pc.collar) chest.box(-4, 4, 3, 4, -3, 4, pc.color);
      if (pc.pendant) chest.box(-1, 1, 1, 3, 3, 4, pc.pendant);
      break;
    case 'earrings':
      for (const x of [-6, 5]) {
        head.set(x, 2, 0, pc.color);
        if (pc.style !== 'hoop') head.set(x, 1, 0, pc.gem ?? pc.color);
        if (pc.style === 'hoop') head.set(x, 1, 1, pc.color);
      }
      break;
    case 'tiara':
      head.box(-4, 4, 9, 10, 5, 6, pc.color);
      head.box(-1, 1, 10, 11, 5, 6, pc.color);
      if (pc.gem) head.set(-1, 9, 6, pc.gem);
      break;
    case 'crown': {
      const top = pc.style === 'tall' ? 14 : 12;
      for (let x = -6; x < 6; x++)
        for (let z = -6; z < 6; z++) {
          if (!(x === -6 || x === 5 || z === -6 || z === 5)) continue;
          for (let y = 10; y < top; y++) head.set(x, y, z, pc.color);
          const corner = (x + 6) % 3 === 0 && (z + 6) % 3 === 0;
          if (corner || ((x === -1 || x === 0) && z === 5)) head.box(x, x + 1, top, top + 2, z, z + 1, pc.color);
        }
      if (pc.gem) head.box(-1, 1, 10, 12, 6, 7, pc.gem);
      break;
    }
    case 'hairpiece':
      head.box(3, 5, 9, 11, 3, 6, pc.color);
      if (pc.gem) head.set(4, 10, 6, pc.gem);
      break;
    case 'flower': {
      const x = (pc.side ?? 1) > 0 ? 5 : -7;
      head.box(x, x + 2, 8, 10, 1, 3, pc.color);
      head.set(x + ((pc.side ?? 1) > 0 ? 1 : 0), 9, 3, '#ffe066');
      break;
    }
    case 'helmet': {
      b.cover = 'helmet';
      for (let x = -6; x < 6; x++)
        for (let z = -6; z < 6; z++)
          for (let y = 6; y < 12; y++) {
            const front = z >= 4 && x >= -5 && x < 5 && y < 8;
            if (front) continue;
            const r = Math.hypot(x + 0.5, z + 0.5);
            if (y >= 11 && r > 4.6) continue;
            head.set(x, y, z, pc.color);
          }
      head.box(-6, 6, 2, 6, -6, -4, pc.color);
      head.box(-6, -5, 2, 7, -4, 2, pc.color);
      head.box(5, 6, 2, 7, -4, 2, pc.color);
      if (pc.trim) {
        for (let x = -6; x < 6; x++) for (let z = -6; z < 6; z++) if (x === -6 || x === 5 || z === -6 || z === 5) head.set(x, 7, z, pc.trim);
        head.box(-1, 1, 11, 12, -5, 5, pc.trim);
      }
      head.box(-1, 1, 4, 7, 5, 6, pc.color);
      if (pc.plume) {
        head.box(-1, 1, 12, 16, -3, 3, pc.plume);
        head.box(-1, 1, 13, 17, -6, -3, pc.plume);
        head.box(-1, 1, 8, 13, -8, -6, pc.plume);
      }
      if (pc.visor) for (let x = -5; x < 5; x++) for (const y of [3, 6]) head.set(x, y, 5, pc.color);
      break;
    }
    case 'hat':
      hat(b, pc);
      break;
    case 'glasses': {
      const c = pc.color ?? '#3a2a20';
      for (const [x0, x1] of [[-4, -1], [0, 3]]) {
        head.box(x0, x1 + 1, 6, 7, 5, 6, c);
        head.box(x0, x0 + 1, 3, 6, 5, 6, c);
        head.box(x1, x1 + 1, 3, 6, 5, 6, c);
      }
      break;
    }
    case 'goggles':
      for (let x = -6; x < 6; x++) for (let z = -6; z < 6; z++) if (x === -6 || x === 5 || z === -6 || z === 5) head.set(x, 8, z, pc.color ?? '#5a4030');
      head.box(-4, -1, 7, 10, 5, 7, pc.color ?? '#5a4030');
      head.box(0, 3, 7, 10, 5, 7, pc.color ?? '#5a4030');
      head.box(-3, -2, 8, 9, 6, 7, pc.lens ?? '#8fe0ff');
      head.box(1, 2, 8, 9, 6, 7, pc.lens ?? '#8fe0ff');
      break;
    case 'pauldrons':
      arms((g) => {
        g.box(-2, 3, -1, 2, -2, 3, pc.color);
        if (pc.trim) g.paint(-2, 3, -1, 0, -2, 3, pc.trim);
      });
      break;
    case 'breastplate':
      chest.recolor((x, y, z) => (z === 2 || z === -3 || x === -hw || x === hw - 1 ? (y === -3 && pc.trim ? pc.trim : pc.color) : null));
      chest.box(-hw + 1, hw - 1, -2, 3, 3, 4, pc.color);
      emblem(pc.emblem, pc.emblemColor ?? GOLD, (c, r, col) => chest.set(c - 3, 2 - r, 4, col));
      break;
    case 'medallion':
      chest.box(-1, 1, 0, 2, 3, 4, pc.color);
      if (pc.gem) chest.set(-1, 1, 4, pc.gem);
      break;
    case 'shield':
      shield(b, pc);
      break;
    case 'item':
      item(b, pc.item, pc.hand, pc.color, pc.accent);
      break;
  }
}

function hat(b: Build, pc: Extract<Piece, { k: 'hat' }>): void {
  const head = grid(b, 'head');
  const c = pc.color;
  const band = pc.band;
  b.cover = pc.style === 'cap' || pc.style === 'bandana' || pc.style === 'kerchief' ? 'cap' : 'hat';
  const disc = (y: number, r: number, color: string) => head.cylinder(0, 0, r, y, y + 1, color);
  switch (pc.style) {
    case 'straw':
      disc(9, 8, c);
      head.cylinder(0, 0, 5, 9, 13, c);
      if (band) head.cylinder(0, 0, 5.2, 10, 11, band);
      break;
    case 'cap':
      head.cylinder(0, 0, 5.6, 8, 11, c);
      head.cylinder(0, 0, 4.5, 11, 12, c);
      head.box(-4, 4, 8, 9, 5, 9, band ?? shade(c, -0.12));
      break;
    case 'kerchief':
      head.cylinder(0, 0, 5.8, 8, 11, c);
      head.box(-4, 4, 4, 9, -7, -5, c);
      head.box(-1, 1, 2, 5, -7, -6, c);
      break;
    case 'fisher':
      head.cylinder(0, 0, 5.5, 8, 13, c);
      disc(8, 7, c);
      if (band) head.cylinder(0, 0, 5.7, 9, 10, band);
      break;
    case 'bandana':
      head.cylinder(0, 0, 5.8, 7, 9, c);
      head.box(-1, 1, 4, 8, -8, -6, c);
      break;
    case 'scholar':
      head.cylinder(0, 0, 5.4, 8, 11, c);
      head.box(-7, 7, 11, 12, -7, 7, c);
      head.box(5, 6, 6, 11, 6, 7, band ?? GOLD);
      break;
    case 'tricorn':
      head.cylinder(0, 0, 5, 9, 13, c);
      for (let x = -8; x < 8; x++)
        for (let z = -8; z < 8; z++) {
          const a = Math.atan2(z + 0.5, x + 0.5);
          const r = Math.hypot(x + 0.5, z + 0.5);
          const lobe = 6 + 2 * Math.cos(3 * (a - Math.PI / 2));
          if (r < lobe) head.set(x, 9, z, c);
          if (r < lobe && r > lobe - 1.2) head.set(x, 10, z, c);
        }
      if (band) head.cylinder(0, 0, 5.2, 10, 11, band);
      break;
    case 'kepi':
      head.cylinder(0, 0, 5.4, 8, 14, c);
      head.box(-4, 4, 8, 9, 5, 9, '#2a2420');
      if (band) head.cylinder(0, 0, 5.6, 9, 10, band);
      break;
    case 'steel':
      head.cylinder(0, 0, 6.4, 8, 9, c);
      head.ellipsoid(0, 9, 0, 5.8, 4, 5.8, c);
      break;
    case 'fur':
      head.cylinder(0, 0, 5.8, 8, 15, c);
      head.recolor((x, y, z, col) => (y >= 8 && col === new Color(c).getHex() && (x * 7 + y * 3 + z * 5) % 4 === 0 ? shade(c, -0.08) : null));
      break;
  }
  if (pc.goggles) {
    head.box(-4, -1, 9, 11, 5, 7, '#5a4030');
    head.box(0, 3, 9, 11, 5, 7, '#5a4030');
    head.box(-3, -2, 9, 10, 6, 7, '#8fe0ff');
    head.box(1, 2, 9, 10, 6, 7, '#8fe0ff');
  }
}

function shield(b: Build, pc: Extract<Piece, { k: 'shield' }>): void {
  const g = grid(b, 'foreL', LIMB);
  const face = pc.color;
  const trim = pc.trim ?? GOLD;
  if (pc.style === 'round') {
    for (let y = -8; y < 3; y++)
      for (let z = -5; z < 6; z++) {
        const r = Math.hypot(y + 2.5, z + 0);
        if (r > 5.3) continue;
        g.set(3, y, z, r > 4.4 ? trim : face);
      }
    g.box(4, 5, -4, -2, -1, 1, pc.boss ?? trim);
  } else {
    for (let y = -9; y < 3; y++) {
      const t = Math.max(0, (-4 - y) / 5);
      const half = Math.round(4 - t * 3.6);
      for (let z = -half; z < half; z++) {
        const edge = z === -half || z === half - 1 || y === 2 || y === -9 + Math.round(t * 0);
        g.set(3, y, z, edge ? trim : face);
      }
    }
    g.set(3, -9, -1, trim);
    g.set(3, -9, 0, trim);
  }
  emblem(pc.emblem, pc.emblemColor ?? trim, (c, r, col) => g.set(4, 1 - r - 1, c - 3, col));
}

function item(b: Build, it: Item, hand: 'L' | 'R' | 'back' | 'hip', color?: string, accent?: string): void {
  const side = hand === 'L' ? 'L' : 'R';
  const h = grid(b, `hand${side}`, LIMB);
  const chest = grid(b, 'chest');
  const hips = grid(b, 'hips');
  const metal = '#dfe5ec';
  switch (it) {
    case 'sword':
      if (hand === 'back' || hand === 'hip') {
        hips.box(-5, -4, -6, 1, 0, 1, color ?? LEATHER);
        hips.box(-6, -3, 1, 2, 0, 1, GOLD);
        break;
      }
      h.box(0, 1, -1, 0, 2, 12, color ?? metal);
      h.box(-1, 2, -1, 0, 2, 3, GOLD);
      h.box(0, 1, -1, 0, -2, -1, GOLD);
      h.set(0, -1, 12, shade(color ?? metal, 0.08));
      break;
    case 'spear':
      h.box(0, 1, -8, 16, 0, 1, color ?? WOOD);
      h.box(0, 1, 16, 20, 0, 1, metal);
      h.box(-1, 2, 16, 17, 0, 1, metal);
      if (accent) h.box(0, 1, 14, 15, 0, 1, accent);
      break;
    case 'bow':
      for (let y = -8; y <= 7; y++) h.set(0, y, 1 + Math.round(2.5 * Math.cos((y / 8) * (Math.PI / 2))), color ?? WOOD);
      h.box(0, 1, -7, 7, 0, 1, '#f0e6d0');
      break;
    case 'quiver':
      chest.box(1, 3, -2, 5, -5, -3, color ?? LEATHER);
      chest.set(1, 5, -4, '#f0e6d0');
      chest.set(2, 6, -4, '#d8423a');
      chest.set(1, 6, -5, '#f0e6d0');
      break;
    case 'hammer':
      h.box(0, 1, -1, 8, 0, 1, WOOD);
      h.box(-1, 2, 7, 9, -1, 3, color ?? '#9aa2ac');
      break;
    case 'axe':
      h.box(0, 1, -1, 9, 0, 1, WOOD);
      h.box(0, 1, 6, 9, 1, 4, color ?? '#9aa2ac');
      break;
    case 'spyglass':
      h.box(-1, 1, -1, 1, 1, 7, color ?? GOLD);
      h.box(-1, 1, -1, 1, 7, 8, '#2a3440');
      break;
    case 'staff':
      h.box(0, 1, -8, 14, 0, 1, color ?? WOOD);
      h.box(-1, 2, 14, 16, -1, 2, accent ?? '#7fd0ff');
      break;
    case 'scepter':
      h.box(0, 1, -1, 7, 0, 1, color ?? GOLD);
      h.box(-1, 2, 7, 9, -1, 2, accent ?? '#3fa0e8');
      break;
    case 'book':
      h.box(-1, 2, -4, 0, 1, 3, color ?? '#7a2e2a');
      h.box(-1, 2, -4, 0, 2, 3, '#f0e6d0');
      break;
    case 'basket':
      h.box(-2, 3, -5, -2, -2, 3, color ?? '#c8a060');
      h.box(-2, 3, -2, -1, -2, 3, accent ?? '#6aa84a');
      h.box(0, 1, -1, 1, -2, 3, color ?? '#c8a060');
      break;
    case 'net':
      h.box(0, 1, -1, 10, 0, 1, WOOD);
      for (let y = 6; y < 11; y++) for (let z = 1; z < 5; z++) if ((y + z) % 2 === 0) h.set(0, y, z, color ?? '#d8c8a0');
      break;
    case 'scroll':
      h.box(-2, 3, -2, -1, 1, 2, color ?? '#f0e6d0');
      h.set(-2, -2, 1, '#a0602a');
      h.set(2, -2, 1, '#a0602a');
      break;
    case 'herbs':
      h.box(-1, 2, -1, 3, 1, 2, color ?? '#5aa04a');
      h.set(0, 3, 1, '#e8d050');
      break;
    case 'rod':
      h.line([0, -1, 0], [0, 12, 10], color ?? WOOD);
      h.line([0, 11, 10], [0, 4, 11], '#f0f0f0');
      break;
    case 'fan':
      for (let y = 0; y < 4; y++) for (let z = 1 - y; z < 2 + y; z++) h.set(0, y, z + 1, color ?? '#e05a6a');
      break;
    case 'bucket':
      h.box(-2, 3, -5, -2, -2, 3, color ?? '#9a7a52');
      h.box(-2, 3, -3, -2, -2, 3, '#5a5a62');
      break;
    case 'satchel': {
      const x = hand === 'L' ? b.hw : -b.hw - 3;
      hips.box(x, x + 3, -3, 1, -1, 2, color ?? LEATHER);
      chest.paint(-3, -2, -3, 4, 2, 3, color ?? LEATHER);
      break;
    }
    case 'map':
      h.box(-2, 3, -2, 1, 2, 3, color ?? '#f0e0b8');
      h.set(0, -1, 3, '#c04a3a');
      break;
    case 'sack':
      chest.box(-3, 3, -3, 3, -7, -3, color ?? '#c8b08a');
      chest.box(-1, 1, 3, 4, -6, -4, LEATHER);
      break;
    case 'oar':
      h.box(0, 1, -10, 10, 0, 1, color ?? WOOD);
      h.box(0, 1, -14, -10, -1, 2, color ?? WOOD);
      break;
    case 'musket':
    case 'rifle':
      h.box(0, 1, -2, 0, -4, 2, color ?? WOOD);
      h.box(0, 1, -1, 0, 2, it === 'rifle' ? 13 : 12, '#5a5f66');
      if (it === 'rifle') h.box(0, 1, -2, -1, 9, 10, '#5a5f66');
      if (accent) h.set(0, -2, -1, accent);
      break;
  }
}

// ---------------------------------------------------------------------------
// Hair

function hair(b: Build, h: HairSpec): void {
  const head = grid(b, 'head');
  const c = h.color;
  const hi = shade(c, 0.07);
  const r = rng(h.seed ?? 7);
  const cover = b.cover;
  const capTop = cover === 'none' ? 11 : 8;
  const put = (x: number, y: number, z: number, col = c) => {
    if (cover !== 'none' && y >= 7 && !(z >= 5 && y < 9)) return;
    head.set(x, y, z, col);
  };
  const cap = (back: number) => {
    for (let x = -6; x < 6; x++)
      for (let z = -6; z < 6; z++)
        for (let y = 7; y < capTop; y++) {
          const front = z >= 5;
          if (front && y < 8) continue;
          const rim = x === -6 || x === 5 || z === -6 || z === 5;
          if (y === capTop - 1 && rim) continue;
          put(x, y, z, y === capTop - 1 ? hi : c);
        }
    for (let x = -6; x < 6; x++) for (let y = back; y < 8; y++) for (const z of [-6, -5]) put(x, y, z);
    for (const x of [-6, 5]) for (let y = Math.max(back, 4); y < 8; y++) for (let z = -6; z < 2; z++) put(x, y, z);
    // fringe: jagged bottom edge across the forehead
    for (let x = -5; x < 5; x++) {
      put(x, 8, 5);
      put(x, 8, 4);
      if (r() < 0.45 || x === -5 || x === 4) put(x, 7, 5);
    }
  };
  switch (h.style) {
    case 'none':
      break;
    case 'short':
      cap(4);
      break;
    case 'tousled':
    case 'messy':
    case 'shaggy':
    case 'spiky': {
      cap(h.style === 'shaggy' ? 2 : 3);
      const tall = h.style === 'spiky' ? 3 : 1;
      for (let i = 0; i < 14; i++) {
        const x = Math.floor(r() * 10) - 5;
        const z = Math.floor(r() * 10) - 6;
        const hh = 1 + Math.floor(r() * tall);
        for (let y = capTop; y < capTop + hh; y++) put(x, y, z, hi);
      }
      if (h.style === 'shaggy') for (const x of [-6, 5]) for (let y = 1; y < 4; y++) for (let z = -6; z < 1; z++) put(x, y, z);
      break;
    }
    case 'bob':
      cap(1);
      for (const x of [-6, 5]) for (let y = 1; y < 8; y++) for (let z = -6; z < 3; z++) put(x, y, z);
      break;
    case 'long':
    case 'longWavy':
    case 'mane': {
      cap(1);
      const w = h.style === 'mane' ? 7 : 6;
      for (const x of [-w, w - 1]) for (let y = -2; y < 8; y++) for (let z = -6; z < 3; z++) put(x, y, z);
      for (let x = -w; x < w; x++)
        for (let y = -7; y < 3; y++)
          for (const z of [-7, -6]) {
            if (h.style === 'longWavy' && y < -3 && (x + y) % 3 === 0) continue;
            put(x, y, z, y < -4 && h.style !== 'mane' ? shade(c, -0.04) : c);
          }
      if (h.style === 'mane') for (let x = -7; x < 7; x++) for (let z = -7; z < 6; z++) put(x, 11, z, hi);
      break;
    }
    case 'ponytail':
    case 'tiedBack':
      cap(3);
      head.box(-1, 1, 6, 8, -7, -6, h.accent ?? shade(c, -0.15));
      for (let y = -2; y < 7; y++) put(-1, y, -7 - (y < 2 ? 1 : 0)), put(0, y, -7 - (y < 2 ? 1 : 0));
      break;
    case 'twintails':
      cap(3);
      for (const x of [-8, 6]) {
        head.box(x, x + 2, 6, 8, -2, 0, h.accent ?? '#e8506a');
        for (let y = -3; y < 6; y++) for (let xx = x; xx < x + 2; xx++) put(xx, y, -1);
      }
      break;
    case 'topknot':
      cap(3);
      head.box(-1, 1, capTop, capTop + 3, -3, 0, c);
      head.box(-1, 1, capTop, capTop + 1, -3, 0, h.accent ?? shade(c, -0.2));
      break;
    case 'curlyBun':
      cap(1);
      for (const x of [-6, 5]) for (let y = 1; y < 8; y++) for (let z = -6; z < 2; z++) if ((y + z) % 2 === 0 || y > 3) put(x, y, z);
      head.ellipsoid(0, 10, -6, 3.2, 3, 3, c);
      if (h.accent) head.box(-3, 3, 9, 10, -4, -3, h.accent);
      break;
    case 'braids':
      cap(2);
      for (const x of [-7, 6])
        for (let y = -6; y < 6; y++) {
          put(x, y, 1, y % 2 === 0 ? c : hi);
          put(x, y, 2, y % 2 === 0 ? hi : c);
        }
      if (h.accent) for (const x of [-7, 6]) head.box(x, x + 1, -6, -5, 1, 3, h.accent);
      break;
  }
  // facial hair
  if (h.beard === 'full') {
    head.box(-5, 5, -2, 3, 5, 6, c);
    head.box(-5, 5, -2, 1, 2, 5, c);
    head.box(-6, -5, 0, 5, 0, 5, c);
    head.box(5, 6, 0, 5, 0, 5, c);
  } else if (h.beard === 'short') {
    head.box(-4, 4, 0, 2, 5, 6, c);
  } else if (h.beard === 'moustache') {
    head.box(-3, 3, 2, 3, 5, 6, c);
  }
}

// ---------------------------------------------------------------------------
// The face: pixels on the front of the head (decals), one set per expression

type Px = [number, number, number, string];

export function facePixels(spec: ChibiSpec, e: Expression): Px[] {
  const f: FaceSpec = spec.face;
  const beard = spec.hair.beard;
  const out: Px[] = [];
  const Z = 5;
  const dark = '#1e1612';
  const put = (x: number, y: number, col: string, z = Z) => out.push([x, y, z, col]);
  const eyes = f.eyes;
  const tall = f.almond ? 2 : 3;
  const eye = (x0: number, mode: 'open' | 'closed' | 'happy' | 'wide') => {
    if (mode === 'closed') {
      put(x0, 3, dark);
      put(x0 + 1, 3, dark);
      return;
    }
    if (mode === 'happy') {
      put(x0, 4, dark);
      put(x0 + 1, 4, dark);
      put(x0 - 1 + (x0 < 0 ? 0 : 3), 3, dark);
      return;
    }
    const h = mode === 'wide' ? 4 : tall;
    for (let y = 3; y < 3 + h; y++)
      for (let x = x0; x < x0 + 2; x++) put(x, y, y === 3 && h >= 3 ? eyes : dark);
    put(x0, 3 + h - 1, '#ffffff');
    if (f.lashes) put(x0 < 0 ? x0 - 1 : x0 + 2, 3 + h - 1, dark);
  };
  const L = -3;
  const R = 1;
  const brows = (dy: [number, number], inner: number) => {
    // dy for outer/inner brow pixel; inner raises (+) or lowers (−) the inner end
    put(L, 7 + dy[0], f.brows);
    put(L + 1, 7 + dy[1] + inner, f.brows);
    put(R, 7 + dy[1] + inner, f.brows);
    put(R + 1, 7 + dy[0], f.brows);
  };
  const lip = f.lips ?? '#9a3a32';
  const mz = beard === 'full' || beard === 'short' ? 6 : Z;
  switch (e) {
    case 'neutral':
      eye(L, 'open'); eye(R, 'open'); brows([0, 0], 0);
      put(-1, 1, lip, mz); put(0, 1, lip, mz);
      break;
    case 'happy':
      eye(L, 'open'); eye(R, 'open'); brows([0, 0], 0);
      put(-2, 2, lip, mz); put(-1, 1, lip, mz); put(0, 1, lip, mz); put(1, 2, lip, mz);
      break;
    case 'laugh':
      eye(L, 'happy'); eye(R, 'happy'); brows([1, 1], 0);
      put(-2, 2, lip, mz); put(1, 2, lip, mz);
      for (const x of [-1, 0]) {
        put(x, 2, '#5a1a1a', mz);
        put(x, 1, '#e86a6a', mz);
      }
      break;
    case 'surprised':
      eye(L, 'wide'); eye(R, 'wide'); brows([1, 1], 0);
      put(-1, 1, '#5a1a1a', mz); put(0, 1, '#5a1a1a', mz);
      break;
    case 'concerned':
      eye(L, 'open'); eye(R, 'open'); brows([0, 0], 1);
      put(-1, 1, lip, mz); put(0, 1, lip, mz); put(-2, 0, lip, mz); put(1, 0, lip, mz);
      break;
    case 'determined':
    case 'focused':
      eye(L, 'open'); eye(R, 'open'); brows([0, 0], -1);
      put(-2, 1, lip, mz); put(-1, 1, lip, mz); put(0, 1, lip, mz); put(1, 1, lip, mz);
      break;
    case 'blink':
      eye(L, 'closed'); eye(R, 'closed'); brows([0, 0], 0);
      put(-1, 1, lip, mz); put(0, 1, lip, mz);
      break;
    case 'wink':
      eye(L, 'open'); eye(R, 'closed'); brows([0, 0], 0);
      put(-2, 2, lip, mz); put(-1, 1, lip, mz); put(0, 1, lip, mz); put(1, 2, lip, mz);
      break;
  }
  const blush = (f.blush ?? 0.5) > 0.3;
  if (blush && beard !== 'full') {
    put(-5 + 1, 2, '#f09088');
    put(3, 2, '#f09088');
  }
  if (f.freckles) {
    put(-4, 3, shade(f.skin, -0.18));
    put(3, 3, shade(f.skin, -0.18));
    put(-3, 2, shade(f.skin, -0.18));
  }
  return out;
}

// ---------------------------------------------------------------------------

/** Every part of a character as voxel grids, in bone space. */
export function buildBody(spec: ChibiSpec): { parts: Parts; noLegs: boolean } {
  const stocky = (spec.body?.stocky ?? 0) > 0.3;
  const b: Build = { spec, p: {}, skin: spec.face.skin, hw: stocky ? 5 : 4, noLegs: false, cover: 'none' };
  base(b);
  // hats and helmets first decide how much hair shows; hair goes under the rest
  const heads = spec.outfit.filter((pc) => pc.k === 'helmet' || pc.k === 'hat');
  for (const pc of heads) b.cover = pc.k === 'helmet' ? 'helmet' : pc.style === 'cap' || pc.style === 'bandana' || pc.style === 'kerchief' ? 'cap' : 'hat';
  hair(b, spec.hair);
  for (const pc of spec.outfit) piece(b, pc);
  if (b.noLegs) for (const s of ['L', 'R'] as const) for (const bone of ['thigh', 'shin', 'foot'] as const) delete b.p[`${bone}${s}`];
  return { parts: b.p, noLegs: b.noLegs };
}
