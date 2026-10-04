// Wildborn's static data: affinities, families, species, abilities, regions
// and items. Species stats are bases; individuals vary by genome.

export type Affinity = 'thermal' | 'aquatic' | 'organic' | 'conductive' | 'mineral' | 'atmospheric' | 'psionic' | 'void' | 'radiant';

export const AFFINITY: Record<Affinity, { label: string; color: string; icon: string }> = {
  thermal: { label: 'Thermal', color: '#ff7a45', icon: 'a-thermal' },
  aquatic: { label: 'Aquatic', color: '#3fa7f5', icon: 'a-aquatic' },
  organic: { label: 'Organic', color: '#5cc96b', icon: 'a-organic' },
  conductive: { label: 'Conductive', color: '#f5d33f', icon: 'a-conductive' },
  mineral: { label: 'Mineral', color: '#b48a62', icon: 'a-mineral' },
  atmospheric: { label: 'Atmospheric', color: '#9fd8e8', icon: 'a-atmospheric' },
  psionic: { label: 'Psionic', color: '#c77dff', icon: 'a-psionic' },
  void: { label: 'Void', color: '#6b5b95', icon: 'a-void' },
  radiant: { label: 'Radiant', color: '#ffe58a', icon: 'a-radiant' },
};

/** Attacker affinity -> defender affinities it is strong against. */
export const STRONG: Partial<Record<Affinity, Affinity[]>> = {
  thermal: ['organic', 'mineral'],
  aquatic: ['thermal', 'mineral'],
  organic: ['aquatic', 'conductive'],
  conductive: ['aquatic', 'atmospheric'],
  mineral: ['conductive', 'thermal'],
  atmospheric: ['organic', 'psionic'],
  psionic: ['void', 'mineral'],
  void: ['psionic', 'radiant'],
  radiant: ['void', 'atmospheric'],
};

export type Role = 'Striker' | 'Tank' | 'Support' | 'Controller' | 'Scout' | 'Healer';

export interface Ability {
  id: string;
  name: string;
  affinity: Affinity;
  power: number;
  effect?: 'heal' | 'guard' | 'confuse' | 'weaken' | 'focus' | 'drain';
  desc: string;
}

export const ABILITIES: Record<string, Ability> = {
  tackle: { id: 'tackle', name: 'Tackle', affinity: 'organic', power: 30, desc: 'A plain, honest hit.' },
  spark: { id: 'spark', name: 'Spark Bite', affinity: 'thermal', power: 42, desc: 'A bite that leaves embers.' },
  flare: { id: 'flare', name: 'Flare Lash', affinity: 'thermal', power: 62, desc: 'A whip of flame.' },
  mindecho: { id: 'mindecho', name: 'Mind Echo', affinity: 'psionic', power: 26, effect: 'confuse', desc: 'Confuses the foe.' },
  splash: { id: 'splash', name: 'Tide Splash', affinity: 'aquatic', power: 40, desc: 'A burst of cold water.' },
  mist: { id: 'mist', name: 'Mist Veil', affinity: 'aquatic', power: 0, effect: 'guard', desc: 'Raises defense.' },
  vine: { id: 'vine', name: 'Thorn Vine', affinity: 'organic', power: 44, desc: 'Lashing thorns.' },
  bloom: { id: 'bloom', name: 'Bloom', affinity: 'organic', power: 0, effect: 'heal', desc: 'Heals with sap and sunlight.' },
  shard: { id: 'shard', name: 'Crystal Shard', affinity: 'mineral', power: 46, desc: 'Flung crystal.' },
  shell: { id: 'shell', name: 'Shell Up', affinity: 'mineral', power: 0, effect: 'guard', desc: 'Hides in its shell.' },
  quake: { id: 'quake', name: 'Stone Quake', affinity: 'mineral', power: 64, desc: 'The ground heaves.' },
  gust: { id: 'gust', name: 'Gust', affinity: 'atmospheric', power: 38, desc: 'A sharp wind.' },
  bolt: { id: 'bolt', name: 'Storm Bolt', affinity: 'conductive', power: 60, desc: 'Lightning from above.' },
  static: { id: 'static', name: 'Static Ruffle', affinity: 'conductive', power: 34, effect: 'weaken', desc: 'Weakens the foe.' },
  hush: { id: 'hush', name: 'Hush', affinity: 'void', power: 36, effect: 'confuse', desc: 'A silence that disorients.' },
  shade: { id: 'shade', name: 'Night Shade', affinity: 'void', power: 58, desc: 'Strikes from shadow.' },
  glimmer: { id: 'glimmer', name: 'Glimmer', affinity: 'radiant', power: 40, desc: 'Dazzling light.' },
  dawn: { id: 'dawn', name: 'Dawnburst', affinity: 'radiant', power: 66, desc: 'A blinding burst of light.' },
  focus: { id: 'focus', name: 'Center', affinity: 'psionic', power: 0, effect: 'focus', desc: 'Sharpens its next move.' },
  drainspore: { id: 'drainspore', name: 'Drain Spores', affinity: 'organic', power: 34, effect: 'drain', desc: 'Steals strength.' },
  steam: { id: 'steam', name: 'Steam Burst', affinity: 'aquatic', power: 58, desc: 'Scalding vapor.' },
  psiwave: { id: 'psiwave', name: 'Psi Wave', affinity: 'psionic', power: 56, desc: 'A crushing thought.' },
};

export type FamilyId = 'kit' | 'shell' | 'wing' | 'scale' | 'moth';

/** Condition keys that steer evolution (counts from a creature's life). */
export type Exposure = 'thermal' | 'aquatic' | 'mineral' | 'organic' | 'night' | 'storm' | 'wins' | 'losses' | 'explore' | 'play' | 'ruins';

export interface Species {
  id: string;
  name: string;
  family: FamilyId;
  stage: 0 | 1;
  affinities: Affinity[];
  role: Role;
  base: { hp: number; power: number; guard: number; speed: number };
  abilities: string[];
  /** For base forms: the three ways it can grow, and what drives each. */
  branches?: { to: string; drivers: Partial<Record<Exposure | 'aggression' | 'curiosity' | 'playfulness' | 'fear' | 'loyalty', number>>; hint: string }[];
  diet: string;
  blurb: string;
  /** Preferred way to be befriended. */
  likes: 'food' | 'play' | 'battle' | 'patience';
  /** Body plan + palette for the art. */
  look: { body: FamilyId; hue: number; accent: number; feature: string };
  nocturnal?: boolean;
}

export const SPECIES: Species[] = [
  // Kit family (foxlike)
  { id: 'lumikit', name: 'Lumikit', family: 'kit', stage: 0, affinities: ['organic', 'psionic'], role: 'Scout', base: { hp: 44, power: 11, guard: 8, speed: 14 }, abilities: ['tackle', 'mindecho', 'spark'], diet: 'Fruit', likes: 'play', blurb: 'A curious little fox whose ears glow when it is happy.',
    look: { body: 'kit', hue: 195, accent: 160, feature: 'glow-ears' },
    branches: [
      { to: 'ashfang', drivers: { wins: 3, thermal: 2, aggression: 2 }, hint: 'Hardened by fire and fighting.' },
      { to: 'mistail', drivers: { aquatic: 3, storm: 1, playfulness: 1 }, hint: 'Raised by water and rain.' },
      { to: 'glimmerfox', drivers: { explore: 2, ruins: 3, curiosity: 2, night: 1 }, hint: 'A wanderer drawn to old places.' },
    ] },
  { id: 'ashfang', name: 'Ashfang', family: 'kit', stage: 1, affinities: ['thermal', 'mineral'], role: 'Striker', base: { hp: 62, power: 19, guard: 11, speed: 16 }, abilities: ['spark', 'flare', 'shard'], diet: 'Meat', likes: 'battle', blurb: 'Its fur smolders. It never backs down.', look: { body: 'kit', hue: 14, accent: 40, feature: 'flame-tail' } },
  { id: 'mistail', name: 'Mistail', family: 'kit', stage: 1, affinities: ['aquatic', 'atmospheric'], role: 'Controller', base: { hp: 58, power: 15, guard: 12, speed: 18 }, abilities: ['splash', 'mist', 'gust'], diet: 'Fish', likes: 'play', blurb: 'Leaves a trail of fog wherever it runs.', look: { body: 'kit', hue: 205, accent: 190, feature: 'mist-tail' } },
  { id: 'glimmerfox', name: 'Glimmerfox', family: 'kit', stage: 1, affinities: ['psionic', 'radiant'], role: 'Support', base: { hp: 56, power: 16, guard: 11, speed: 17 }, abilities: ['mindecho', 'glimmer', 'psiwave'], diet: 'Moonfruit', likes: 'patience', blurb: 'Its markings shine like old runes.', look: { body: 'kit', hue: 270, accent: 50, feature: 'runes' } },
  // Shell family (turtlelike)
  { id: 'mosslet', name: 'Mosslet', family: 'shell', stage: 0, affinities: ['organic'], role: 'Tank', base: { hp: 56, power: 9, guard: 14, speed: 6 }, abilities: ['tackle', 'shell', 'vine'], diet: 'Leaves', likes: 'food', blurb: 'A slow turtle with a garden on its back.',
    look: { body: 'shell', hue: 110, accent: 85, feature: 'moss' },
    branches: [
      { to: 'crysback', drivers: { mineral: 3, explore: 1, loyalty: 1 }, hint: 'Grown among crystals.' },
      { to: 'tideshell', drivers: { aquatic: 3, play: 1 }, hint: 'A life spent in the shallows.' },
      { to: 'thornshell', drivers: { wins: 2, organic: 2, aggression: 2 }, hint: 'Defends its patch fiercely.' },
    ] },
  { id: 'crysback', name: 'Crysback', family: 'shell', stage: 1, affinities: ['mineral', 'radiant'], role: 'Tank', base: { hp: 82, power: 14, guard: 22, speed: 6 }, abilities: ['shard', 'shell', 'quake'], diet: 'Minerals', likes: 'patience', blurb: 'Its shell is a slow-growing geode.', look: { body: 'shell', hue: 280, accent: 190, feature: 'crystals' } },
  { id: 'tideshell', name: 'Tideshell', family: 'shell', stage: 1, affinities: ['aquatic', 'organic'], role: 'Healer', base: { hp: 78, power: 12, guard: 18, speed: 9 }, abilities: ['splash', 'bloom', 'mist'], diet: 'Kelp', likes: 'food', blurb: 'Fishes nest in the weed on its shell.', look: { body: 'shell', hue: 190, accent: 140, feature: 'kelp' } },
  { id: 'thornshell', name: 'Thornshell', family: 'shell', stage: 1, affinities: ['organic', 'mineral'], role: 'Tank', base: { hp: 80, power: 17, guard: 19, speed: 7 }, abilities: ['vine', 'shell', 'drainspore'], diet: 'Leaves', likes: 'battle', blurb: 'Every plant on its back has thorns.', look: { body: 'shell', hue: 95, accent: 20, feature: 'thorns' } },
  // Wing family (birdlike)
  { id: 'pipwing', name: 'Pipwing', family: 'wing', stage: 0, affinities: ['atmospheric'], role: 'Scout', base: { hp: 38, power: 10, guard: 7, speed: 17 }, abilities: ['tackle', 'gust', 'static'], diet: 'Seeds', likes: 'food', blurb: 'A round little bird that rides the wind.',
    look: { body: 'wing', hue: 45, accent: 200, feature: 'crest' },
    branches: [
      { to: 'stormwing', drivers: { storm: 3, wins: 1, explore: 1 }, hint: 'Flies into the storm, not away from it.' },
      { to: 'emberhawk', drivers: { thermal: 3, aggression: 2, wins: 1 }, hint: 'Born of heat and hunting.' },
      { to: 'hushowl', drivers: { night: 3, curiosity: 1, fear: -1 }, hint: 'A creature of the night hours.' },
    ] },
  { id: 'stormwing', name: 'Stormwing', family: 'wing', stage: 1, affinities: ['atmospheric', 'conductive'], role: 'Striker', base: { hp: 56, power: 18, guard: 10, speed: 22 }, abilities: ['gust', 'bolt', 'static'], diet: 'Seeds', likes: 'battle', blurb: 'Its feathers crackle before a storm.', look: { body: 'wing', hue: 225, accent: 55, feature: 'lightning' } },
  { id: 'emberhawk', name: 'Emberhawk', family: 'wing', stage: 1, affinities: ['atmospheric', 'thermal'], role: 'Striker', base: { hp: 54, power: 20, guard: 9, speed: 20 }, abilities: ['gust', 'spark', 'flare'], diet: 'Meat', likes: 'battle', blurb: 'Dives like a falling coal.', look: { body: 'wing', hue: 10, accent: 45, feature: 'flame-crest' } },
  { id: 'hushowl', name: 'Hushowl', family: 'wing', stage: 1, affinities: ['void', 'psionic'], role: 'Controller', base: { hp: 58, power: 16, guard: 12, speed: 18 }, abilities: ['hush', 'mindecho', 'shade'], diet: 'Moths', likes: 'patience', blurb: 'You never hear it arrive.', look: { body: 'wing', hue: 255, accent: 300, feature: 'night-eyes' }, nocturnal: true },
  // Scale family (lizardlike)
  { id: 'scaleling', name: 'Scaleling', family: 'scale', stage: 0, affinities: ['thermal'], role: 'Striker', base: { hp: 42, power: 13, guard: 9, speed: 12 }, abilities: ['tackle', 'spark', 'shard'], diet: 'Insects', likes: 'battle', blurb: 'Basks on hot stones and bites first.',
    look: { body: 'scale', hue: 25, accent: 50, feature: 'frill' },
    branches: [
      { to: 'magmite', drivers: { thermal: 3, wins: 2 }, hint: 'Fed on heat and victory.' },
      { to: 'glasswyrm', drivers: { mineral: 3, ruins: 1, loyalty: 1 }, hint: 'Grew in the crystal dark.' },
      { to: 'marshdrake', drivers: { aquatic: 3, organic: 1 }, hint: 'Took to the marshes.' },
    ] },
  { id: 'magmite', name: 'Magmite', family: 'scale', stage: 1, affinities: ['thermal', 'mineral'], role: 'Striker', base: { hp: 64, power: 21, guard: 13, speed: 13 }, abilities: ['flare', 'quake', 'spark'], diet: 'Ash', likes: 'battle', blurb: 'Cracks in its hide glow orange.', look: { body: 'scale', hue: 5, accent: 30, feature: 'lava-cracks' } },
  { id: 'glasswyrm', name: 'Glasswyrm', family: 'scale', stage: 1, affinities: ['mineral', 'radiant'], role: 'Controller', base: { hp: 60, power: 17, guard: 16, speed: 14 }, abilities: ['shard', 'glimmer', 'focus'], diet: 'Minerals', likes: 'patience', blurb: 'Light bends through its glassy scales.', look: { body: 'scale', hue: 185, accent: 290, feature: 'glass' } },
  { id: 'marshdrake', name: 'Marshdrake', family: 'scale', stage: 1, affinities: ['aquatic', 'organic'], role: 'Tank', base: { hp: 72, power: 16, guard: 15, speed: 11 }, abilities: ['splash', 'vine', 'steam'], diet: 'Fish', likes: 'food', blurb: 'Lies in wait among the reeds.', look: { body: 'scale', hue: 140, accent: 200, feature: 'fins' } },
  // Moth family
  { id: 'glowmoth', name: 'Glowmoth', family: 'moth', stage: 0, affinities: ['radiant'], role: 'Support', base: { hp: 36, power: 10, guard: 8, speed: 15 }, abilities: ['tackle', 'glimmer', 'bloom'], diet: 'Nectar', likes: 'patience', blurb: 'Drifts toward any light, including yours.',
    look: { body: 'moth', hue: 50, accent: 30, feature: 'glow' }, nocturnal: true,
    branches: [
      { to: 'lunaria', drivers: { night: 3, play: 1, loyalty: 1 }, hint: 'Lives by moonlight.' },
      { to: 'sporemoth', drivers: { organic: 3, explore: 1 }, hint: 'Spends its days among flowers.' },
      { to: 'voidwing', drivers: { ruins: 3, losses: 1, fear: 1 }, hint: 'Something in the ruins changed it.' },
    ] },
  { id: 'lunaria', name: 'Lunaria', family: 'moth', stage: 1, affinities: ['radiant', 'psionic'], role: 'Healer', base: { hp: 54, power: 15, guard: 11, speed: 18 }, abilities: ['glimmer', 'bloom', 'dawn'], diet: 'Moonfruit', likes: 'play', blurb: 'Its wings hold the pattern of the moon.', look: { body: 'moth', hue: 220, accent: 55, feature: 'moon-wings' }, nocturnal: true },
  { id: 'sporemoth', name: 'Sporemoth', family: 'moth', stage: 1, affinities: ['organic', 'atmospheric'], role: 'Controller', base: { hp: 52, power: 15, guard: 12, speed: 17 }, abilities: ['drainspore', 'gust', 'bloom'], diet: 'Pollen', likes: 'food', blurb: 'Leaves a sparkle of spores behind.', look: { body: 'moth', hue: 95, accent: 330, feature: 'spores' } },
  { id: 'voidwing', name: 'Voidwing', family: 'moth', stage: 1, affinities: ['void', 'radiant'], role: 'Striker', base: { hp: 50, power: 19, guard: 10, speed: 19 }, abilities: ['shade', 'hush', 'dawn'], diet: 'Unknown', likes: 'patience', blurb: 'Its wings show a sky that is not ours.', look: { body: 'moth', hue: 275, accent: 190, feature: 'void-wings' }, nocturnal: true },
];

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export type BiomeId = 'greenwood' | 'meadow' | 'wetlands' | 'caves' | 'ember' | 'ruins';

export interface Biome {
  id: BiomeId;
  name: string;
  color: string;
  /** Exposure gained per exploration. */
  exposure: Partial<Record<Exposure, number>>;
  /** Wild species weights (base forms are common, evolved forms rare). */
  wild: Record<string, number>;
  resources: string[];
  /** Affinity boosted in battles here. */
  boost: Affinity;
  blurb: string;
}

export const BIOMES: Record<BiomeId, Biome> = {
  greenwood: { id: 'greenwood', name: 'Greenwood', color: '#4e9a5c', exposure: { organic: 1 }, wild: { lumikit: 4, mosslet: 4, pipwing: 3, glowmoth: 2, sporemoth: 0.4, thornshell: 0.3 }, resources: ['berry', 'berry', 'moonfruit'], boost: 'organic', blurb: 'Old trees and soft light. Gentle creatures.' },
  meadow: { id: 'meadow', name: 'Windmeadow', color: '#a8c95a', exposure: { organic: 1, storm: 0.5 }, wild: { pipwing: 4, lumikit: 3, glowmoth: 3, scaleling: 1, stormwing: 0.4, sporemoth: 0.4 }, resources: ['berry', 'seed', 'berry'], boost: 'atmospheric', blurb: 'Open grass, big skies, sudden storms.' },
  wetlands: { id: 'wetlands', name: 'Mistfen', color: '#4c9bb0', exposure: { aquatic: 1 }, wild: { mosslet: 3, scaleling: 2, lumikit: 2, tideshell: 0.5, mistail: 0.4, marshdrake: 0.4 }, resources: ['reed', 'berry', 'reed'], boost: 'aquatic', blurb: 'Reeds, fog and shallow water.' },
  caves: { id: 'caves', name: 'Crystal Hollow', color: '#7d6aa8', exposure: { mineral: 1, night: 0.5 }, wild: { scaleling: 3, mosslet: 2, glowmoth: 2, crysback: 0.5, glasswyrm: 0.4, hushowl: 0.3 }, resources: ['crystal', 'crystal', 'ore'], boost: 'mineral', blurb: 'Glittering tunnels that never see the sun.' },
  ember: { id: 'ember', name: 'Ember Flats', color: '#d0773c', exposure: { thermal: 1 }, wild: { scaleling: 4, pipwing: 2, magmite: 0.5, emberhawk: 0.5, ashfang: 0.3 }, resources: ['pepper', 'ore', 'pepper'], boost: 'thermal', blurb: 'Cracked earth and heat shimmer.' },
  ruins: { id: 'ruins', name: 'The Old Ruins', color: '#8a8478', exposure: { ruins: 1, night: 0.3 }, wild: { glowmoth: 3, lumikit: 2, hushowl: 0.5, voidwing: 0.5, glimmerfox: 0.4, lunaria: 0.3 }, resources: ['fragment', 'crystal', 'moonfruit'], boost: 'void', blurb: 'Stones carved by someone long gone.' },
};

export interface Item {
  id: string;
  name: string;
  desc: string;
  /** Feeding this adds exposure. */
  feeds?: Partial<Record<Exposure, number>>;
  heal?: number;
}

export const ITEMS: Record<string, Item> = {
  berry: { id: 'berry', name: 'Wild berry', desc: 'Most creatures love them. Heals a little; good for befriending.', heal: 15, feeds: { organic: 0.5 } },
  seed: { id: 'seed', name: 'Sky seed', desc: 'Light seeds from the meadow. Wing creatures adore them.', feeds: { storm: 0.5 } },
  reed: { id: 'reed', name: 'River reed', desc: 'Watery and crisp. Feeding it builds aquatic adaptation.', feeds: { aquatic: 1 } },
  pepper: { id: 'pepper', name: 'Ember pepper', desc: 'Fiercely hot. Feeding it builds thermal adaptation.', feeds: { thermal: 1 } },
  crystal: { id: 'crystal', name: 'Crystal shard', desc: 'Some creatures eat these. Builds mineral adaptation.', feeds: { mineral: 1 } },
  ore: { id: 'ore', name: 'Raw ore', desc: 'Trade it at the village.' },
  moonfruit: { id: 'moonfruit', name: 'Moonfruit', desc: 'Ripens at night. Builds an affinity for the dark.', feeds: { night: 1 }, heal: 25 },
  fragment: { id: 'fragment', name: 'Ruin fragment', desc: 'Carved with symbols nobody can read. The researcher wants these.', feeds: { ruins: 0.5 } },
  salve: { id: 'salve', name: 'Herbal salve', desc: 'Heals a creature fully.', heal: 999 },
};

export const PERSONALITY = ['curiosity', 'aggression', 'loyalty', 'playfulness', 'fear', 'intelligence'] as const;
export type PersonalityKey = (typeof PERSONALITY)[number];

/** The doc's rarity scale. Rarity is not power: a common creature with a rare
 * mutation can be exceptional, so variant creatures read as Unique. */
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Ancient' | 'Mythic' | 'Unique';

export const RARITY_ORDER: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Ancient', 'Mythic', 'Unique'];

const WILD_WEIGHTS: Record<string, number> = (() => {
  const max: Record<string, number> = {};
  for (const b of Object.values(BIOMES)) {
    for (const [id, w] of Object.entries(b.wild)) max[id] = Math.max(max[id] ?? 0, w);
  }
  return max;
})();

/** How often a species shows up in the wild, mapped to the doc's tiers. */
export function speciesRarity(speciesId: string): Rarity {
  const w = WILD_WEIGHTS[speciesId] ?? 0;
  if (w >= 3) return 'Common';
  if (w >= 2) return 'Uncommon';
  if (w >= 0.45) return 'Rare';
  if (w >= 0.35) return 'Ancient';
  return 'Mythic';
}

/** A rare mutation makes any creature exceptional. */
export function rarityOf(speciesId: string, variant?: string | null): Rarity {
  return variant ? 'Unique' : speciesRarity(speciesId);
}
