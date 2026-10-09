// The six original creatures of Lumeria. Everything the AI, the bonding
// system and the model builders need to know about a species lives here, so
// adding a seventh is a data change plus a model function.

export type Element = 'fire' | 'water' | 'earth' | 'air' | 'light' | 'plant';
export type SpeciesId = 'flamkit' | 'aquoray' | 'terrabun' | 'zephyra' | 'lumelle' | 'thornlade';
export type Habitat = 'meadow' | 'forest' | 'river' | 'ruins' | 'cave' | 'outpost';

/** What a companion of this element can do in the world. */
export type AbilityId = 'ember' | 'tide' | 'quake' | 'glide' | 'glow' | 'forage';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  element: Element;
  summary: string;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  ember: { id: 'ember', name: 'Ember Puff', element: 'fire', summary: 'Burns thorny tangles and lights ancient braziers.' },
  tide: { id: 'tide', name: 'Tide Call', element: 'water', summary: 'Wakes aquatic mechanisms and lets you dive deep underwater.' },
  quake: { id: 'quake', name: 'Moss Quake', element: 'earth', summary: 'Shatters cracked boulders and moves marked stones.' },
  glide: { id: 'glide', name: 'Breeze Wings', element: 'air', summary: 'Hold Jump in the air to glide across gaps.' },
  glow: { id: 'glow', name: 'Lumen Glow', element: 'light', summary: 'Lights up dark places and reveals hidden glyphs.' },
  forage: { id: 'forage', name: 'Green Sense', element: 'plant', summary: 'Sniffs out hidden herbs around you.' },
};

export interface Variant {
  id: string;
  name: string;
  /** Colours that replace the base palette entries of the same name. */
  palette: Partial<Palette>;
  /** One in N wild spawns, or 0 for encounter-only variants. */
  rarity: number;
  /** Encounter-only condition, if any. */
  condition?: 'night';
}

export interface Palette {
  body: string;
  belly: string;
  accent: string;
  glow: string;
  eye: string;
}

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  element: Element;
  ability: AbilityId;
  habitat: Habitat[];
  personality: string;
  blurb: string;
  /** Shown in the field guide once observed. */
  lore: string;
  likes: string;
  palette: Palette;
  variants: Variant[];
  /** Body scale in metres (roughly shoulder height). */
  size: number;
  speed: { walk: number; run: number };
  /** Distance at which it notices you. */
  awareness: number;
  /** 0 = brave, 1 = flees at the slightest thing. */
  shyness: number;
  /** How quickly trust rises, 0.5..1.5. */
  warmth: number;
  /** Reaction when threatened: run away, or stand ground and push back. */
  threat: 'flee' | 'defend';
  /** Locomotion style the animator uses. */
  gait: 'trot' | 'hop' | 'float' | 'swim' | 'flutter' | 'scuttle';
  active: 'day' | 'night' | 'any';
  /** Short tip shown after the first observation. */
  tip: string;
}

export const SPECIES: SpeciesDef[] = [
  {
    id: 'flamkit',
    name: 'Flamkit',
    element: 'fire',
    ability: 'ember',
    habitat: ['meadow', 'ruins'],
    personality: 'Energetic and curious. Loves warm places.',
    blurb: 'A playful fire fox whose ember markings glow brighter when it is happy.',
    lore: 'Flamkit sleep curled around warm stones and follow travellers who smell of campfire. The ember tip of the tail never burns what it loves.',
    likes: 'sunberry',
    palette: { body: '#ff8a3d', belly: '#fff1dc', accent: '#ffcf5a', glow: '#ff5a1f', eye: '#5a2a12' },
    variants: [{ id: 'azure', name: 'Azure Flamkit', palette: { body: '#5b8cff', accent: '#9fe4ff', glow: '#3cc8ff', belly: '#eef6ff' }, rarity: 14 }],
    size: 0.62,
    speed: { walk: 1.6, run: 6.2 },
    awareness: 13,
    shyness: 0.35,
    warmth: 1.15,
    threat: 'flee',
    gait: 'trot',
    active: 'day',
    tip: 'Playful: it warms up quickly, and loves Sunberries. It dislikes the cold of night.',
  },
  {
    id: 'aquoray',
    name: 'Aquoray',
    element: 'water',
    ability: 'tide',
    habitat: ['river'],
    personality: 'Calm and friendly. Swims anywhere.',
    blurb: 'A cheerful river dweller with translucent fins that ripple like light on water.',
    lore: 'Aquoray hum to one another underwater. Rangers say a river with Aquoray in it never floods the same field twice.',
    likes: 'kelp',
    palette: { body: '#3fa8ff', belly: '#d8f6ff', accent: '#8fe8ff', glow: '#6ff0ff', eye: '#103a6a' },
    variants: [{ id: 'coral', name: 'Coral Aquoray', palette: { body: '#ff7fa8', accent: '#ffd0e0', glow: '#ffb0d0', belly: '#fff0f5' }, rarity: 14 }],
    size: 0.55,
    speed: { walk: 1.4, run: 5.0 },
    awareness: 12,
    shyness: 0.25,
    warmth: 1.0,
    threat: 'flee',
    gait: 'swim',
    active: 'any',
    tip: 'Trusts you more when it is in or near water. Offer River Kelp.',
  },
  {
    id: 'terrabun',
    name: 'Terrabun',
    element: 'earth',
    ability: 'quake',
    habitat: ['meadow', 'forest'],
    personality: 'Steady and loyal. Great for exploring.',
    blurb: 'A sturdy bun with mossy ears and little crystals growing along its back.',
    lore: 'The crystals on a Terrabun grow one facet each year. Elders with full crowns are said to remember the beacon being built.',
    likes: 'crunchroot',
    palette: { body: '#8ccf5a', belly: '#fff6dc', accent: '#4e9a3a', glow: '#9ff2ff', eye: '#2e2414' },
    variants: [{ id: 'elder', name: 'Elder Terrabun', palette: { body: '#c9b48a', accent: '#7a9a52', glow: '#e2a8ff' }, rarity: 14 }],
    size: 0.6,
    speed: { walk: 1.3, run: 5.4 },
    awareness: 10,
    shyness: 0.2,
    warmth: 0.85,
    threat: 'flee',
    gait: 'hop',
    active: 'day',
    tip: 'Slow to trust but never forgets a kindness. Crunchroot is its favourite.',
  },
  {
    id: 'zephyra',
    name: 'Zephyra',
    element: 'air',
    ability: 'glide',
    habitat: ['ruins', 'meadow'],
    personality: 'Shy and free. Rides every breeze.',
    blurb: 'A feathered sky fox that hovers on soft wings and startles at sudden moves.',
    lore: 'Zephyra nest on the highest stones of the old ruins. They glide down at dawn to drink, and vanish if anyone runs at them.',
    likes: 'cloudpuff',
    palette: { body: '#f4fbff', belly: '#ffffff', accent: '#6fd6c8', glow: '#bff7ff', eye: '#1b3a4a' },
    variants: [{ id: 'starlit', name: 'Starlit Zephyra', palette: { body: '#3b3f8f', accent: '#ffd76a', glow: '#fff1a8', belly: '#cfd5ff' }, rarity: 12 }],
    size: 0.55,
    speed: { walk: 1.8, run: 7.5 },
    awareness: 18,
    shyness: 0.85,
    warmth: 1.0,
    threat: 'flee',
    gait: 'flutter',
    active: 'day',
    tip: 'Very shy: never sprint near it. Crouch and approach slowly with a Cloudpuff.',
  },
  {
    id: 'lumelle',
    name: 'Lumelle',
    element: 'light',
    ability: 'glow',
    habitat: ['cave', 'forest'],
    personality: 'Gentle and dreamy. Glows in the dark.',
    blurb: 'A fluffy moth-like creature whose wings hold soft starlight.',
    lore: 'Lumelle are drawn to the beacon’s light. When it went dark they drifted into caves to keep each other bright.',
    likes: 'glowcap',
    palette: { body: '#fff3c8', belly: '#ffffff', accent: '#b9a2ff', glow: '#ffe98a', eye: '#3a2a6a' },
    variants: [{ id: 'moonlit', name: 'Moonlit Lumelle', palette: { body: '#d9e4ff', accent: '#7f9cff', glow: '#bfe0ff', belly: '#f2f6ff' }, rarity: 0, condition: 'night' }],
    size: 0.5,
    speed: { walk: 1.2, run: 5.0 },
    awareness: 11,
    shyness: 0.5,
    warmth: 1.1,
    threat: 'flee',
    gait: 'float',
    active: 'night',
    tip: 'Comfortable in darkness: bond at night or inside the cave. Glowcaps calm it.',
  },
  {
    id: 'thornlade',
    name: 'Thornlade',
    element: 'plant',
    ability: 'forage',
    habitat: ['forest'],
    personality: 'Proud and protective. Guards the woods.',
    blurb: 'A leafy forest guardian with blade-like fronds and a blossom on its brow.',
    lore: 'A Thornlade will raise its fronds at anyone who crashes through the undergrowth, but it shares its blossoms with patient friends.',
    likes: 'honeyblossom',
    palette: { body: '#5fbf6a', belly: '#e9ffd8', accent: '#2f8a4a', glow: '#ff9ad5', eye: '#1f3a1a' },
    variants: [{ id: 'autumn', name: 'Autumn Thornlade', palette: { body: '#e08a3a', accent: '#a8452a', glow: '#ffd36a' }, rarity: 14 }],
    size: 0.58,
    speed: { walk: 1.4, run: 5.6 },
    awareness: 12,
    shyness: 0.3,
    warmth: 0.95,
    threat: 'defend',
    gait: 'scuttle',
    active: 'any',
    tip: 'Defends itself if you run or jump close. Move calmly and offer Honeyblossom.',
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s])) as Record<SpeciesId, SpeciesDef>;

export const STARTERS: SpeciesId[] = ['flamkit', 'aquoray', 'terrabun'];

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#ff7a3d',
  water: '#3fa8ff',
  earth: '#8ccf5a',
  air: '#7fe3d6',
  light: '#ffd75a',
  plant: '#5fbf6a',
};

export const ELEMENT_NAME: Record<Element, string> = {
  fire: 'Fire',
  water: 'Water',
  earth: 'Earth',
  air: 'Air',
  light: 'Light',
  plant: 'Plant',
};

export function paletteFor(species: SpeciesId, variant?: string | null): Palette {
  const def = SPECIES_BY_ID[species];
  const v = variant ? def.variants.find((x) => x.id === variant) : undefined;
  return { ...def.palette, ...(v?.palette ?? {}) };
}

export function variantName(species: SpeciesId, variant?: string | null): string {
  const def = SPECIES_BY_ID[species];
  return (variant && def.variants.find((x) => x.id === variant)?.name) || def.name;
}
