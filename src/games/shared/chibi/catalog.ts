// The cast, as data, following the Year Zero art reference pack: the scout
// from the character guide, the four leaders, six military classes (player
// blue / rival red) and six civilians. Any game can spawn these by id.

import type { FaceSpec } from './face';
import type { ChibiSpec, Piece } from './spec';

// Palette from the sheets
export const SKIN = { fair: '#ffdcc4', light: '#f8cdb0', warm: '#eab48c', tan: '#d39a72', brown: '#b07a54', deep: '#8a5a3c' };
const BROWN_EYES = '#6b3c1e';
const GOLD = '#e2b04a';
const LEATHER = '#8a5430';
const LEATHER_DARK = '#5e3820';

export interface Faction {
  main: string;
  dark: string;
  light: string;
  trim: string;
  emblem: 'fleur' | 'swords';
  plume: string;
}

export const FACTIONS: Record<'blue' | 'red', Faction> = {
  blue: { main: '#2f58b8', dark: '#22407e', light: '#4f78d8', trim: GOLD, emblem: 'fleur', plume: '#3a64d0' },
  red: { main: '#b8382e', dark: '#7e2420', light: '#d85a48', trim: '#c89a4a', emblem: 'swords', plume: '#c83a2e' },
};

const face = (skin: string, extra: Partial<FaceSpec> = {}): FaceSpec => ({ skin, eyes: BROWN_EYES, brows: '#4a2a1a', blush: 0.6, eyeScale: 1.12, ...extra });

/** Sheet 05: the Scout (also the base for the military scout). */
export function scout(f: Faction = FACTIONS.blue): ChibiSpec {
  return {
    id: `scout-${f === FACTIONS.blue ? 'blue' : 'red'}`,
    name: 'Scout',
    face: face(SKIN.light, { brows: '#5a2e1a' }),
    hair: { style: 'tousled', color: '#7a3a22', seed: 11 },
    outfit: [
      { k: 'tunic', color: '#f1e8d6', length: 0.14, trim: '#e4d6bc' },
      { k: 'sleeves', color: '#f1e8d6', style: 'puff' },
      { k: 'tabard', color: f.main, trim: f.trim, emblem: f.emblem, emblemColor: f.trim, length: 0.12 },
      { k: 'pants', color: '#3e3434', baggy: true },
      { k: 'boots', color: '#8a5430', cuff: '#a0663a', buckle: GOLD },
      { k: 'gloves', color: '#4a3a3a', fingerless: true },
      { k: 'bracers', color: LEATHER, trim: GOLD },
      { k: 'belt', color: LEATHER_DARK, buckle: GOLD },
      { k: 'strap', color: LEATHER, side: 1, buckle: GOLD },
      { k: 'pouch', color: LEATHER, side: 1 },
      { k: 'pouch', color: LEATHER, side: -1 },
      { k: 'scarf', color: f.main, trim: f.trim },
      { k: 'cape', color: f.main, length: 0.26, inner: f.dark },
      { k: 'backpack', color: '#8a5430', roll: '#e8dcc0', buckle: GOLD },
    ],
  };
}

export const SCOUT = scout();

// --- Leaders (sheet 02) --------------------------------------------------------
// Each leader is a function of a few options so games can dress them in a
// people's colours; the defaults reproduce the reference sheet.

export interface LeaderOpts {
  id?: string;
  main?: string;
  dark?: string;
  skin?: string;
  hair?: string;
  /** Head regalia: the sheet's own, a crown, or none (chiefs, envoys, presidents). */
  regalia?: 'own' | 'crown' | 'none';
  cape?: boolean;
  age?: number;
  /** Plain envoy dress: a sash in the people's colour, no regalia. */
  envoy?: boolean;
}

const darker = (hex: string, k = 0.72) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * k);
  return `#${((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`;
};

const greyHair = (age: number, hair: string) => (age > 0.72 ? '#cfc8c2' : age > 0.55 ? '#8a7f78' : hair);

export function sunlandQueen(o: LeaderOpts = {}): ChibiSpec {
  const main = o.main ?? '#2f4fb8';
  const dark = o.dark ?? darker(main);
  const own = (o.regalia ?? 'own') === 'own';
  const outfit: Piece[] = [
    { k: 'gown', bodice: main, trim: GOLD, pattern: '#e8b84a', layers: [
      { color: '#f2e6cc', length: 0.42, flare: 0.25, trim: '#d8a84a' },
      { color: main, length: 0.39, flare: 0.29, trim: GOLD, open: 0.55 },
    ] },
    { k: 'sleeves', color: main, style: 'wide', trim: GOLD },
    { k: 'belt', color: '#c8952f', buckle: '#3a6ad8', wide: true },
    { k: 'necklace', color: GOLD, collar: true, pendant: '#2f6ad8' },
    { k: 'earrings', color: GOLD, style: 'drop', gem: '#2f6ad8' },
    { k: 'bangles', color: GOLD },
    { k: 'sandals', color: '#a8743a', wraps: true },
    { k: 'pouch', color: '#8a5430', side: -1 },
  ];
  if (o.cape !== false && !o.envoy) outfit.push({ k: 'cape', color: main, length: 0.62, emblem: 'sun', emblemColor: '#e8b84a', trim: GOLD, inner: dark });
  if (own && !o.envoy) outfit.push({ k: 'tiara', color: GOLD, gem: '#2f6ad8' });
  if (o.regalia === 'crown') outfit.push({ k: 'crown', color: GOLD, gem: '#c03a3a', style: 'band' });
  if (o.envoy) outfit.push({ k: 'sash', color: main, side: 1, trim: GOLD });
  return {
    id: o.id ?? 'sunland-queen',
    name: 'Sunland Queen',
    face: face(o.skin ?? SKIN.tan, { lashes: true, brows: '#2a1a14', lips: '#c0505a', eyes: '#5a2c16', blush: 0.5, age: o.age }),
    hair: { style: 'curlyBun', color: greyHair(o.age ?? 0, o.hair ?? '#4a302a'), seed: 3 },
    body: { slender: true },
    mood: 'happy',
    outfit,
  };
}

export function highlandKing(o: LeaderOpts = {}): ChibiSpec {
  const main = o.main ?? '#2f6a3e';
  const own = (o.regalia ?? 'own') === 'own';
  const outfit: Piece[] = [
    { k: 'tunic', color: main, length: 0.2, trim: '#e8dcc0', collar: '#e8dcc0' },
    { k: 'sleeves', color: '#e8dcc0', style: 'long', cuff: main },
    { k: 'pants', color: '#5a3e2a', baggy: true },
    { k: 'boots', color: '#6a4026', cuff: '#7a4c2c', tall: true, buckle: '#b88a3a' },
    { k: 'bracers', color: '#7a4a2a', trim: '#b88a3a' },
    { k: 'belt', color: '#5e3820', buckle: '#c89a3a', wide: true },
    { k: 'strap', color: '#7a4a2a', side: 1, buckle: '#c89a3a' },
    { k: 'strap', color: '#7a4a2a', side: -1 },
    { k: 'pouch', color: '#7a4a2a', side: 1, front: true },
    { k: 'gloves', color: '#6a4026' },
  ];
  if (!o.envoy) {
    if (o.cape !== false) outfit.push({ k: 'furCloak', color: main, fur: '#efe6d4', emblem: 'knot', emblemColor: '#efe6d4', trim: '#d8cba8' });
    if (own) outfit.push({ k: 'medallion', color: '#c89a3a', emblem: 'knot' });
    if (o.regalia === 'crown') outfit.push({ k: 'crown', color: GOLD, gem: '#2f8a4a', style: 'band' });
  } else outfit.push({ k: 'sash', color: main, side: 1, trim: GOLD });
  return {
    id: o.id ?? 'highland-king',
    name: 'Northern Highland King',
    face: face(o.skin ?? SKIN.fair, { brows: '#7a3a1e', eyes: '#5a3a24', blush: 0.55, age: o.age ?? 0.6 }),
    hair: { style: 'mane', color: greyHair(o.age ?? 0, o.hair ?? '#9a4a24'), beard: 'full', seed: 5 },
    body: { stocky: 0.6 },
    mood: 'happy',
    outfit,
  };
}

export function islandMatriarch(o: LeaderOpts = {}): ChibiSpec {
  const main = o.main ?? '#2fa8a0';
  const outfit: Piece[] = [
    { k: 'tunic', color: main, length: 0.02, trim: '#f2e6cc' },
    { k: 'sleeves', color: main, style: 'bare' },
    { k: 'skirt', color: '#f2e6cc', length: 0.4, flare: 0.25, trim: '#e8b84a', wrap: '#e8604a' },
    { k: 'skirt', color: main, length: 0.3, flare: 0.27, trim: '#f2e6cc' },
    { k: 'sash', color: '#e8604a', side: -1, trim: GOLD },
    { k: 'necklace', color: '#f2e6cc', beads: main, pendant: '#f4f0e8' },
    { k: 'earrings', color: '#f4efe2', style: 'shell' },
    { k: 'bangles', color: GOLD },
    { k: 'sandals', color: '#a8743a', wraps: true },
    { k: 'belt', color: '#e8604a', y: 0.06 },
  ];
  if ((o.regalia ?? 'own') === 'own' && !o.envoy) outfit.push({ k: 'flower', color: '#f04a5a', side: 1 });
  if (o.regalia === 'crown') outfit.push({ k: 'tiara', color: GOLD, gem: '#f4f0e8' });
  return {
    id: o.id ?? 'island-matriarch',
    name: 'Island-Trading Matriarch',
    face: face(o.skin ?? SKIN.brown, { lashes: true, brows: '#2a1a14', lips: '#c0505a', eyes: '#4a2614', blush: 0.55, age: o.age }),
    hair: { style: 'longWavy', color: greyHair(o.age ?? 0, o.hair ?? '#33231e'), seed: 9 },
    body: { slender: true },
    mood: 'happy',
    outfit,
  };
}

export function easternPrince(o: LeaderOpts = {}): ChibiSpec {
  const main = o.main ?? '#6a2e7a';
  const outfit: Piece[] = [
    { k: 'robe', color: main, trim: GOLD, inner: '#f2e8d4', length: 0.44, flare: 0.25, sash: '#8a2a3a', pattern: '#d8b86a' },
    { k: 'belt', color: '#8a2a3a', buckle: GOLD, wide: true },
    { k: 'shoes', color: '#2a2224', trim: GOLD },
    { k: 'medallion', color: GOLD, gem: '#2fa88a' },
  ];
  if (o.cape !== false && !o.envoy) outfit.push({ k: 'cape', color: main, length: 0.55, emblem: 'blossom', emblemColor: '#e8c060', trim: GOLD, inner: '#f2e8d4' });
  if ((o.regalia ?? 'own') === 'own' && !o.envoy) outfit.push({ k: 'hairpiece', color: GOLD, gem: '#c03a3a' });
  if (o.regalia === 'crown') outfit.push({ k: 'hairpiece', color: GOLD, gem: '#2f6ad8' });
  return {
    id: o.id ?? 'eastern-prince',
    name: 'Eastern Scholar-Prince',
    face: face(o.skin ?? SKIN.light, { brows: '#1e1a1e', eyes: '#3a2a24', almond: true, blush: 0.45, age: o.age }),
    hair: { style: 'topknot', color: greyHair(o.age ?? 0, o.hair ?? '#2a2328'), seed: 13 },
    mood: 'neutral',
    outfit,
  };
}

export const SUNLAND_QUEEN = sunlandQueen();
export const HIGHLAND_KING = highlandKing();
export const ISLAND_MATRIARCH = islandMatriarch();
export const EASTERN_PRINCE = easternPrince();

// --- Military (sheet 03) -----------------------------------------------------------

function soldierBase(f: Faction, id: string, name: string, hair: ChibiSpec['hair'], extra: Piece[]): ChibiSpec {
  return {
    id,
    name,
    face: face(SKIN.light, { brows: '#5a2e1a' }),
    hair,
    mood: 'determined',
    outfit: [
      { k: 'tunic', color: '#f1e8d6', length: 0.12 },
      { k: 'sleeves', color: '#f1e8d6', style: 'puff' },
      { k: 'pants', color: '#3e3434', baggy: true },
      { k: 'boots', color: '#8a5430', cuff: '#a0663a', buckle: GOLD },
      { k: 'gloves', color: '#5a3e30' },
      { k: 'belt', color: LEATHER_DARK, buckle: GOLD },
      ...extra,
    ],
  };
}

export function swordsman(f: Faction): ChibiSpec {
  return soldierBase(f, `swordsman-${tag(f)}`, 'Swordsman', { style: 'short', color: '#7a3a22', seed: 21 }, [
    { k: 'tabard', color: f.main, trim: f.trim, length: 0.14 },
    { k: 'breastplate', color: '#c8ccd4', trim: f.trim, emblem: f.emblem, emblemColor: f.trim },
    { k: 'pauldrons', color: '#c8ccd4', trim: f.trim },
    { k: 'helmet', color: '#c8ccd4', trim: f.trim, plume: f.plume },
    { k: 'scarf', color: f.main },
    { k: 'shield', style: 'heater', color: f.main, trim: f.trim, emblem: f.emblem, emblemColor: f.trim },
    { k: 'item', item: 'sword', hand: 'R' },
    { k: 'cape', color: f.main, length: 0.3, inner: f.dark },
  ]);
}

export function archer(f: Faction): ChibiSpec {
  return soldierBase(f, `archer-${tag(f)}`, 'Archer', { style: 'ponytail', color: '#8a4a26', seed: 23, accent: f.main }, [
    { k: 'tabard', color: f.main, trim: f.trim, length: 0.12, emblem: f.emblem, emblemColor: f.trim },
    { k: 'bracers', color: LEATHER, trim: f.trim },
    { k: 'scarf', color: f.main, tails: true },
    { k: 'strap', color: LEATHER, side: -1 },
    { k: 'item', item: 'bow', hand: 'L' },
    { k: 'item', item: 'quiver', hand: 'back', color: LEATHER },
    { k: 'pouch', color: LEATHER, side: 1 },
  ]);
}

export function spearGuard(f: Faction): ChibiSpec {
  return soldierBase(f, `spear-${tag(f)}`, 'Spear Guard', { style: 'short', color: '#6a3420', seed: 25 }, [
    { k: 'tabard', color: f.main, trim: f.trim, length: 0.14 },
    { k: 'breastplate', color: '#b8bcc4', trim: f.trim },
    { k: 'pauldrons', color: '#b8bcc4' },
    { k: 'helmet', color: '#b8bcc4', trim: f.trim, plume: f.plume },
    { k: 'shield', style: 'round', color: '#9a6a3a', trim: '#a8acb4', boss: GOLD },
    { k: 'item', item: 'spear', hand: 'R' },
    { k: 'cape', color: f.main, length: 0.34, inner: f.dark },
  ]);
}

export function cavalry(f: Faction): ChibiSpec {
  return soldierBase(f, `cavalry-${tag(f)}`, 'Cavalry', { style: 'short', color: '#7a3a22', seed: 27 }, [
    { k: 'tabard', color: f.main, trim: f.trim, length: 0.1 },
    { k: 'breastplate', color: '#c8ccd4', trim: f.trim, emblem: f.emblem, emblemColor: f.trim },
    { k: 'pauldrons', color: '#c8ccd4', trim: f.trim },
    { k: 'helmet', color: '#c8ccd4', trim: f.trim, plume: f.plume },
    { k: 'scarf', color: f.main },
    { k: 'item', item: 'sword', hand: 'R' },
    { k: 'cape', color: f.main, length: 0.32, inner: f.dark },
  ]);
}

export function engineer(f: Faction): ChibiSpec {
  return {
    id: `engineer-${tag(f)}`,
    name: 'Engineer',
    face: face(SKIN.light, { brows: '#8a5a2a', freckles: true }),
    hair: { style: 'shaggy', color: '#c8843a', seed: 29 },
    mood: 'happy',
    outfit: [
      { k: 'tunic', color: '#f1e8d6', length: 0.1 },
      { k: 'sleeves', color: '#f1e8d6', style: 'long', cuff: '#e4d6bc' },
      { k: 'vest', color: f.main, trim: f.trim },
      { k: 'pants', color: '#5a4636', baggy: true },
      { k: 'boots', color: '#8a5430', cuff: '#a0663a' },
      { k: 'gloves', color: '#8a5430' },
      { k: 'belt', color: LEATHER_DARK, buckle: GOLD, wide: true },
      { k: 'pouch', color: LEATHER, side: 1, front: true },
      { k: 'pouch', color: LEATHER, side: -1, front: true },
      { k: 'pouch', color: LEATHER, side: 1 },
      { k: 'strap', color: LEATHER, side: 1 },
      { k: 'hat', style: 'cap', color: f.main, band: LEATHER, goggles: true },
      { k: 'item', item: 'hammer', hand: 'R' },
    ],
  };
}

export function warrior(f: Faction): ChibiSpec {
  return {
    id: `warrior-${tag(f)}`,
    name: 'Warrior',
    face: face(SKIN.light, { brows: '#5a2e1a' }),
    hair: { style: 'shaggy', color: '#6a3420', seed: 43 },
    mood: 'determined',
    outfit: [
      { k: 'tunic', color: f.main, length: 0.16, trim: '#e8dcc0' },
      { k: 'sleeves', color: '#e8dcc0', style: 'short' },
      { k: 'pants', color: '#5a4636', baggy: true },
      { k: 'boots', color: '#6a4026', cuff: '#7a4c2c' },
      { k: 'bracers', color: LEATHER },
      { k: 'belt', color: LEATHER_DARK, buckle: GOLD },
      { k: 'strap', color: LEATHER, side: 1 },
      { k: 'furCloak', color: f.dark, fur: '#c8b89a' },
      { k: 'shield', style: 'round', color: '#9a6a3a', trim: '#7a7a7a', boss: '#a8acb4' },
      { k: 'item', item: 'axe', hand: 'R' },
    ],
  };
}

export function gunner(f: Faction, era: 'musket' | 'rifle' | 'modern'): ChibiSpec {
  const coat = era === 'modern' ? '#5f6b45' : f.main;
  return {
    id: `gunner-${era}-${tag(f)}`,
    name: era === 'musket' ? 'Musketeer' : era === 'rifle' ? 'Rifleman' : 'Infantry',
    face: face(SKIN.light, { brows: '#4a2a1a' }),
    hair: { style: 'short', color: '#5a3420', seed: 45 },
    mood: 'focused',
    outfit: [
      { k: 'tunic', color: coat, length: 0.16, trim: era === 'modern' ? undefined : '#e8dcc0', collar: era === 'musket' ? '#f1e8d6' : undefined },
      { k: 'sleeves', color: coat, style: 'long', cuff: era === 'modern' ? '#4a5536' : f.dark },
      { k: 'pants', color: era === 'modern' ? '#4a5536' : '#e8e0d0', baggy: era !== 'musket' },
      { k: 'boots', color: '#3a2a22', tall: era === 'musket' },
      { k: 'belt', color: era === 'modern' ? '#3a3a2a' : '#f1e8d6', buckle: '#c8ccd4' },
      { k: 'strap', color: era === 'modern' ? '#3a3a2a' : '#f1e8d6', side: 1 },
      { k: 'pouch', color: LEATHER_DARK, side: 1, front: true },
      { k: 'hat', style: era === 'musket' ? 'tricorn' : era === 'rifle' ? 'kepi' : 'steel', color: era === 'musket' ? '#2a3448' : era === 'rifle' ? f.dark : '#5f6b45', band: era === 'musket' ? GOLD : era === 'rifle' ? GOLD : undefined },
      { k: 'item', item: era === 'musket' ? 'musket' : 'rifle', hand: 'R' },
    ],
  };
}

function tag(f: Faction): string {
  return f === FACTIONS.blue ? 'blue' : f === FACTIONS.red ? 'red' : f.main.slice(1);
}

// --- Civilians (sheet 04) -----------------------------------------------------------

export const FARMER: ChibiSpec = {
  id: 'farmer',
  name: 'Farmer',
  face: face(SKIN.light, { lashes: true, brows: '#4a2a1a', freckles: true }),
  hair: { style: 'braids', color: '#5a3420', accent: '#3f8a4a', seed: 31 },
  mood: 'happy',
  outfit: [
    { k: 'tunic', color: '#f1e8d6', length: 0.12 },
    { k: 'sleeves', color: '#f1e8d6', style: 'puff', cuff: '#e4d6bc' },
    { k: 'apron', color: '#4f8a4a', trim: '#3a6a36', patch: '#8a6a3a' },
    { k: 'pants', color: '#e8dcc4', baggy: true },
    { k: 'boots', color: '#7a4a2a' },
    { k: 'hat', style: 'straw', color: '#e0b468', band: '#3f8a4a' },
    { k: 'item', item: 'basket', hand: 'L' },
    { k: 'pouch', color: LEATHER, side: 1 },
  ],
};

export const BUILDER: ChibiSpec = {
  id: 'builder',
  name: 'Builder',
  face: face(SKIN.light, { brows: '#4a2a1a' }),
  hair: { style: 'tousled', color: '#6a3a22', seed: 33 },
  mood: 'happy',
  outfit: [
    { k: 'tunic', color: '#f1e8d6', length: 0.1, collar: '#e4d6bc' },
    { k: 'sleeves', color: '#f1e8d6', style: 'puff' },
    { k: 'vest', color: '#2f4f8a', trim: GOLD },
    { k: 'pants', color: '#2f4f8a', baggy: true },
    { k: 'boots', color: '#7a4a2a', cuff: '#8a5430' },
    { k: 'gloves', color: '#6a4026' },
    { k: 'belt', color: LEATHER, buckle: GOLD, wide: true },
    { k: 'pouch', color: LEATHER, side: 1, front: true },
    { k: 'pouch', color: LEATHER, side: -1, front: true },
    { k: 'goggles', color: '#8a6a3a' },
    { k: 'item', item: 'hammer', hand: 'R' },
  ],
};

export const MERCHANT: ChibiSpec = {
  id: 'merchant',
  name: 'Merchant',
  face: face(SKIN.warm, { lashes: true, brows: '#2a1a14', lips: '#c0505a' }),
  hair: { style: 'long', color: '#241a1a', seed: 35 },
  mood: 'happy',
  outfit: [
    { k: 'tunic', color: '#f1e8d6', length: 0.06 },
    { k: 'sleeves', color: '#f1e8d6', style: 'puff', cuff: '#c83a3a' },
    { k: 'vest', color: '#7a4a2a', trim: GOLD },
    { k: 'skirt', color: '#c83a3a', length: 0.26, flare: 0.22, trim: '#e8b84a', wrap: '#f1e8d6' },
    { k: 'boots', color: '#7a4a2a' },
    { k: 'belt', color: '#e8b84a', buckle: '#c83a3a' },
    { k: 'hat', style: 'bandana', color: '#c83a3a', band: '#e8b84a' },
    { k: 'earrings', color: GOLD, style: 'hoop' },
    { k: 'necklace', color: GOLD, beads: '#c83a3a' },
    { k: 'backpack', color: '#a86a3a', big: true, roll: '#c83a3a', buckle: GOLD },
    { k: 'pouch', color: LEATHER, side: 1, front: true },
  ],
};

export const SCHOLAR: ChibiSpec = {
  id: 'scholar',
  name: 'Scholar',
  face: face(SKIN.fair, { brows: '#1e2440', eyes: '#3a2a4a' }),
  hair: { style: 'shaggy', color: '#2a2e5a', seed: 37 },
  mood: 'happy',
  outfit: [
    { k: 'robe', color: '#2a3a7a', trim: GOLD, inner: '#efe4cc', length: 0.36, flare: 0.22 },
    { k: 'belt', color: LEATHER, buckle: GOLD },
    { k: 'boots', color: '#6a4026' },
    { k: 'glasses', color: '#5a3a24' },
    { k: 'item', item: 'book', hand: 'L', color: '#7a3a2a' },
    { k: 'item', item: 'scroll', hand: 'back' },
    { k: 'item', item: 'satchel', hand: 'hip' },
  ],
};

export const HEALER: ChibiSpec = {
  id: 'healer',
  name: 'Healer',
  face: face(SKIN.light, { lashes: true, brows: '#5a3420' }),
  hair: { style: 'braids', color: '#7a4a2a', accent: '#c83a3a', seed: 39 },
  mood: 'happy',
  outfit: [
    { k: 'tunic', color: '#f1e8d6', length: 0.04 },
    { k: 'sleeves', color: '#f1e8d6', style: 'puff', cuff: '#c83a3a' },
    { k: 'vest', color: '#c83a3a', trim: GOLD },
    { k: 'skirt', color: '#f1e8d6', length: 0.3, flare: 0.22, trim: '#c83a3a' },
    { k: 'apron', color: '#f6efe0', trim: '#c83a3a' },
    { k: 'boots', color: '#7a4a2a' },
    { k: 'hat', style: 'kerchief', color: '#f1e8d6', band: '#c83a3a' },
    { k: 'item', item: 'herbs', hand: 'R' },
    { k: 'item', item: 'satchel', hand: 'hip', color: '#8a5430' },
  ],
};

export const FISHERMAN: ChibiSpec = {
  id: 'fisherman',
  name: 'Fisherman',
  face: face(SKIN.warm, { brows: '#2a1a14' }),
  hair: { style: 'short', color: '#2a1c18', seed: 41 },
  mood: 'happy',
  outfit: [
    { k: 'tunic', color: '#f1e8d6', length: 0.1, collar: '#e4d6bc' },
    { k: 'sleeves', color: '#f1e8d6', style: 'puff' },
    { k: 'vest', color: '#2f5a8a', trim: '#e4d6bc' },
    { k: 'pants', color: '#4a4440', baggy: true },
    { k: 'boots', color: '#7a4a2a', tall: true },
    { k: 'belt', color: LEATHER, buckle: GOLD },
    { k: 'scarf', color: '#f1e8d6' },
    { k: 'hat', style: 'fisher', color: '#d8b070', band: '#2f5a8a' },
    { k: 'item', item: 'net', hand: 'R' },
    { k: 'item', item: 'bucket', hand: 'L' },
  ],
};

export const CAST: Record<string, ChibiSpec> = {
  scout: SCOUT,
  'scout-red': scout(FACTIONS.red),
  queen: SUNLAND_QUEEN,
  king: HIGHLAND_KING,
  matriarch: ISLAND_MATRIARCH,
  prince: EASTERN_PRINCE,
  swordsman: swordsman(FACTIONS.blue),
  'swordsman-red': swordsman(FACTIONS.red),
  archer: archer(FACTIONS.blue),
  'archer-red': archer(FACTIONS.red),
  spear: spearGuard(FACTIONS.blue),
  'spear-red': spearGuard(FACTIONS.red),
  cavalry: cavalry(FACTIONS.blue),
  'cavalry-red': cavalry(FACTIONS.red),
  engineer: engineer(FACTIONS.blue),
  'engineer-red': engineer(FACTIONS.red),
  warrior: warrior(FACTIONS.blue),
  musketeer: gunner(FACTIONS.blue, 'musket'),
  rifleman: gunner(FACTIONS.blue, 'rifle'),
  infantry: gunner(FACTIONS.red, 'modern'),
  farmer: FARMER,
  builder: BUILDER,
  merchant: MERCHANT,
  scholar: SCHOLAR,
  healer: HEALER,
  fisherman: FISHERMAN,
};

export function withOutfit(spec: ChibiSpec, add: Piece[], id = spec.id): ChibiSpec {
  return { ...spec, id, outfit: [...spec.outfit, ...add] };
}

// VRM manifest keys are the cast names (scout, queen, swordsman-red…).
for (const [key, spec] of Object.entries(CAST)) spec.vrmKey ??= key;
