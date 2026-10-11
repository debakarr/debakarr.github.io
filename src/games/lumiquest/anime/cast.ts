// The playable cast: VRoid sample characters that pixiv Inc. released under
// CC0 (see each model's pixiv help-centre page and the licence field inside
// every file). Only the chosen character's file is downloaded.

import type { Appearance } from '../data/characters';

const FILES = import.meta.glob('../assets/vrm/*.vrm', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export interface CastMember {
  id: string;
  name: string;
  pronoun: 'he' | 'she' | 'they';
  /** File name in assets/vrm, without extension. */
  file: string;
  blurb: string;
  credit: string;
}

export const CAST: CastMember[] = [
  { id: 'vita', name: 'Vita', pronoun: 'she', file: 'Vita', blurb: 'Silver hair, odd eyes, and ears that catch every rustle.', credit: 'β Ver AvatarSample_3' },
  { id: 'fumiriya', name: 'Fumiriya', pronoun: 'he', file: 'Sakurada_Fumiriya', blurb: 'Gentle, patient and good with his hands.', credit: 'Sakurada Fumiriya' },
  { id: 'vivi', name: 'Vivi', pronoun: 'she', file: 'Vivi', blurb: 'Bakes for every creature she meets.', credit: 'β Ver AvatarSample_2' },
  { id: 'kuro', name: 'Kuro', pronoun: 'he', file: 'HairSample_Male', blurb: 'Quiet, quick, and always in a hoodie.', credit: 'HairSample_Male' },
  { id: 'rubi', name: 'Rubi', pronoun: 'she', file: 'Victoria_Rubin', blurb: 'Loves cute things; creatures love her back.', credit: 'β Ver AvatarSample_4' },
  { id: 'shibu', name: 'Shibu', pronoun: 'she', file: 'Sendagaya_Shibu', blurb: 'First over every hill, last to give up.', credit: 'β Ver AvatarSample_1 (Sendagaya Shibu)' },
  { id: 'shino', name: 'Shino', pronoun: 'she', file: 'Sendagaya_Shino', blurb: 'Calm, kind, and impossible to surprise.', credit: 'Sendagaya Shino' },
  { id: 'mii', name: 'Mii', pronoun: 'she', file: 'HairSample_Female', blurb: 'Cat ears, light feet, very curious.', credit: 'HairSample_Female' },
  { id: 'noir', name: 'Noir', pronoun: 'she', file: 'Darkness_Shibu', blurb: 'Prefers the vale after dark.', credit: 'β Ver AvatarSample_1, Darkness version' },
];

export const CAST_BY_ID: Record<string, CastMember> = Object.fromEntries(CAST.map((c) => [c.id, c]));

/** Old saves name one of the four code-built presets. */
const LEGACY: Record<string, string> = { aero: 'fumiriya', luna: 'rubi', kai: 'kuro', mira: 'vita' };

export function castFor(a: Pick<Appearance, 'preset'>): CastMember {
  return CAST_BY_ID[a.preset] ?? CAST_BY_ID[LEGACY[a.preset] ?? ''] ?? CAST[0];
}

export function castUrl(m: CastMember): string {
  const url = FILES[`../assets/vrm/${m.file}.vrm`];
  if (!url) throw new Error(`missing model ${m.file}`);
  return url;
}
