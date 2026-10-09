// Character presets and every customization option the model builder in
// entities/character.ts actually supports. Presets are starting points;
// any option can be combined with any preset.

export type HairStyle = 'spiky' | 'twintails' | 'messy' | 'long' | 'bob';
export type FaceId = 'bright' | 'gentle' | 'bold' | 'sleepy';
export type OutfitId = 'ranger' | 'explorer' | 'scout' | 'mystic';
export type AccessoryId = 'scarf' | 'backpack' | 'clip' | 'goggles' | 'satchel';

export interface Appearance {
  name: string;
  preset: string;
  skin: string;
  face: FaceId;
  eye: string;
  hair: HairStyle;
  hairColor: string;
  outfit: OutfitId;
  outfitMain: string;
  outfitAccent: string;
  accessories: AccessoryId[];
}

export interface Preset {
  id: string;
  name: string;
  pronoun: 'he' | 'she' | 'they';
  personality: string;
  look: Omit<Appearance, 'name' | 'preset'>;
}

export const SKIN_TONES = ['#ffe3cf', '#f6cfae', '#e8b48c', '#c98e66', '#a06a48', '#6e4630'];
export const HAIR_COLORS = ['#5a3a24', '#2a2230', '#f08bb4', '#d9dcef', '#f2c35a', '#c8452e', '#3f6fd8', '#59b98a'];
export const EYE_COLORS = ['#6a3d1e', '#2f6fd8', '#3aa05a', '#8a4fd0', '#d05a8a', '#3a3a48'];
export const OUTFIT_COLORS = ['#d8423a', '#2f6fb8', '#3c9a6a', '#7a4fc0', '#f0a83a', '#e6e2d8', '#2b3448', '#e86fa0'];

export const FACES: { id: FaceId; name: string }[] = [
  { id: 'bright', name: 'Bright' },
  { id: 'gentle', name: 'Gentle' },
  { id: 'bold', name: 'Bold' },
  { id: 'sleepy', name: 'Dreamy' },
];

export const HAIRS: { id: HairStyle; name: string }[] = [
  { id: 'spiky', name: 'Wind-swept' },
  { id: 'twintails', name: 'Twin tails' },
  { id: 'messy', name: 'Tousled' },
  { id: 'long', name: 'Long & tied' },
  { id: 'bob', name: 'Round bob' },
];

export const OUTFITS: { id: OutfitId; name: string; blurb: string }[] = [
  { id: 'ranger', name: 'Ranger Jacket', blurb: 'Hooded jacket, shorts and sturdy boots.' },
  { id: 'explorer', name: 'Explorer Dress', blurb: 'A pleated skirt with a short cape.' },
  { id: 'scout', name: 'Scout Hoodie', blurb: 'Comfy hoodie and trousers.' },
  { id: 'mystic', name: 'Mystic Coat', blurb: 'A long coat with a sash.' },
];

export const ACCESSORIES: { id: AccessoryId; name: string }[] = [
  { id: 'scarf', name: 'Scarf' },
  { id: 'backpack', name: 'Backpack' },
  { id: 'clip', name: 'Star clip' },
  { id: 'goggles', name: 'Goggles' },
  { id: 'satchel', name: 'Satchel' },
];

export const PRESETS: Preset[] = [
  {
    id: 'aero',
    name: 'Aero',
    pronoun: 'he',
    personality: 'Bold and restless. First over every hill.',
    look: {
      skin: SKIN_TONES[1], face: 'bold', eye: EYE_COLORS[0], hair: 'spiky', hairColor: HAIR_COLORS[0],
      outfit: 'ranger', outfitMain: OUTFIT_COLORS[0], outfitAccent: OUTFIT_COLORS[5], accessories: ['backpack', 'scarf'],
    },
  },
  {
    id: 'luna',
    name: 'Luna',
    pronoun: 'she',
    personality: 'Warm and patient. Creatures seem to find her.',
    look: {
      skin: SKIN_TONES[0], face: 'gentle', eye: EYE_COLORS[4], hair: 'twintails', hairColor: HAIR_COLORS[2],
      outfit: 'explorer', outfitMain: OUTFIT_COLORS[5], outfitAccent: OUTFIT_COLORS[1], accessories: ['clip', 'satchel'],
    },
  },
  {
    id: 'kai',
    name: 'Kai',
    pronoun: 'he',
    personality: 'Clever and calm. Reads every track and sign.',
    look: {
      skin: SKIN_TONES[3], face: 'bright', eye: EYE_COLORS[1], hair: 'messy', hairColor: HAIR_COLORS[1],
      outfit: 'scout', outfitMain: OUTFIT_COLORS[2], outfitAccent: OUTFIT_COLORS[6], accessories: ['goggles', 'backpack'],
    },
  },
  {
    id: 'mira',
    name: 'Mira',
    pronoun: 'she',
    personality: 'Dreamy and wise. Hears the old stones hum.',
    look: {
      skin: SKIN_TONES[0], face: 'sleepy', eye: EYE_COLORS[3], hair: 'long', hairColor: HAIR_COLORS[3],
      outfit: 'mystic', outfitMain: OUTFIT_COLORS[3], outfitAccent: OUTFIT_COLORS[5], accessories: ['scarf'],
    },
  },
];

export function presetAppearance(id: string): Appearance {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return { name: p.name, preset: p.id, ...structuredClone(p.look) };
}

/** NPC looks reuse the same builder so the village matches the player. */
export const NPC_LOOKS: Record<string, Omit<Appearance, 'name' | 'preset'>> = {
  elen: { skin: SKIN_TONES[2], face: 'gentle', eye: EYE_COLORS[2], hair: 'bob', hairColor: HAIR_COLORS[0], outfit: 'ranger', outfitMain: OUTFIT_COLORS[2], outfitAccent: OUTFIT_COLORS[5], accessories: ['satchel'] },
  pip: { skin: SKIN_TONES[1], face: 'bright', eye: EYE_COLORS[0], hair: 'messy', hairColor: HAIR_COLORS[4], outfit: 'scout', outfitMain: OUTFIT_COLORS[4], outfitAccent: OUTFIT_COLORS[0], accessories: ['scarf'] },
  bram: { skin: SKIN_TONES[4], face: 'sleepy', eye: EYE_COLORS[5], hair: 'long', hairColor: HAIR_COLORS[3], outfit: 'mystic', outfitMain: OUTFIT_COLORS[6], outfitAccent: OUTFIT_COLORS[4], accessories: ['goggles'] },
  nia: { skin: SKIN_TONES[3], face: 'bright', eye: EYE_COLORS[3], hair: 'twintails', hairColor: HAIR_COLORS[6], outfit: 'explorer', outfitMain: OUTFIT_COLORS[7], outfitAccent: OUTFIT_COLORS[5], accessories: ['backpack', 'clip'] },
};
