// Governments, emergent civilization traits, leader traits and era naming.

export interface GovDef {
  id: string;
  name: string;
  tech: string | null;
  pros: string[];
  cons: string[];
  sciPct: number;
  goldPct: number;
  prodPct: number;
  cultPct: number;
  unitPct: number;
  happyPerCity: number;
  /** Cities before empire size breeds discontent. */
  freeCities: number;
  /** War weariness multiplier. */
  weariness: number;
  /** Waste per tile of distance from the capital (fraction). */
  corruption: number;
  garrisonHappy: boolean;
  /** Extra gold % per active trade agreement. */
  tradePct: number;
  /** Leader term in years; 0 = rules for life. */
  term: number;
  anarchy: number;
  /** Multiplier on revolt and assassination risk. */
  revolt: number;
  /** Opinion others hold toward this government. */
  diplo: number;
  /** Multiplier on how long conquered cities resist. */
  assimilation: number;
  title: [string, string];
}

const base = {
  sciPct: 0, goldPct: 0, prodPct: 0, cultPct: 0, unitPct: 0, happyPerCity: 0, freeCities: 4,
  weariness: 1, corruption: 0.02, garrisonHappy: false, tradePct: 0, term: 0, anarchy: 2,
  revolt: 1, diplo: 0, assimilation: 1,
};

export const GOVERNMENTS: GovDef[] = [
  { ...base, id: 'tribal', name: 'Tribal Council', tech: null, freeCities: 2, corruption: 0.04, anarchy: 0,
    pros: ['Cheap settlers', 'No upkeep for the first units'], cons: ['Cannot hold many cities together', 'High waste far from the capital'],
    title: ['Chief', 'Chief'] },
  { ...base, id: 'monarchy', name: 'Monarchy', tech: 'monarchy', freeCities: 5, prodPct: 5, garrisonHappy: true,
    pros: ['+1 mood in garrisoned cities', '+5% production'], cons: ['Succession crises when rulers die'],
    title: ['King', 'Queen'] },
  { ...base, id: 'theocracy', name: 'Theocracy', tech: 'theology', freeCities: 6, cultPct: 25, sciPct: -15, happyPerCity: 1, diplo: -5,
    pros: ['+25% culture', '+1 mood per city', 'Temples inspire fervor'], cons: ['-15% science', 'Distrusted by other faiths'],
    title: ['High Priest', 'High Priestess'] },
  { ...base, id: 'republic', name: 'Republic', tech: 'civilcode', freeCities: 6, goldPct: 10, sciPct: 5, tradePct: 8, term: 16, weariness: 1.4,
    pros: ['+10% gold, +5% science', '+8% gold per trade agreement', 'Leaders change with elections'], cons: ['War weariness grows faster'],
    title: ['Consul', 'Consul'] },
  { ...base, id: 'empire', name: 'Empire', tech: 'imperialism', freeCities: 10, unitPct: 15, cultPct: -10, corruption: 0.015, assimilation: 0.5,
    pros: ['Holds many cities together', '+15% unit production', 'Conquered cities settle quickly'], cons: ['-10% culture'],
    title: ['Emperor', 'Empress'] },
  { ...base, id: 'democracy', name: 'Democracy', tech: 'enlightenment', freeCities: 8, happyPerCity: 2, goldPct: 10, sciPct: 10, unitPct: -15, tradePct: 6,
    weariness: 2, term: 8, corruption: 0.01, revolt: 0.4, diplo: 8,
    pros: ['+2 mood per city', '+10% gold and science', 'Admired abroad'], cons: ['-15% unit production (slow mobilization)', 'War weariness doubles'],
    title: ['President', 'President'] },
  { ...base, id: 'dictatorship', name: 'Dictatorship', tech: 'nationalism', freeCities: 9, unitPct: 30, prodPct: 10, happyPerCity: -1, weariness: 0.3, garrisonHappy: true,
    sciPct: -10, revolt: 2, diplo: -8, anarchy: 1,
    pros: ['+30% unit production', '+10% production', 'Almost no war weariness'], cons: ['-1 mood per city', '-10% science', 'Revolts and assassinations more likely'],
    title: ['Supreme Leader', 'Supreme Leader'] },
  { ...base, id: 'federation', name: 'Federation', tech: 'globalization', freeCities: 16, tradePct: 12, corruption: 0.004, goldPct: 10, weariness: 1.5, term: 10, diplo: 6,
    pros: ['Empire size barely matters', '+12% gold per trade agreement'], cons: ['War weariness grows faster'],
    title: ['Chancellor', 'Chancellor'] },
  { ...base, id: 'technocracy', name: 'Technocracy', tech: 'computers', freeCities: 10, sciPct: 30, cultPct: -15, happyPerCity: -1, term: 12, corruption: 0.008,
    pros: ['+30% science'], cons: ['-15% culture', '-1 mood per city'],
    title: ['Director', 'Director'] },
  { ...base, id: 'aigov', name: 'AI Governance', tech: 'ai', freeCities: 20, sciPct: 20, prodPct: 20, goldPct: 20, cultPct: -10, corruption: 0, anarchy: 1, diplo: -4,
    pros: ['+20% science, production and gold', 'No waste'], cons: ['Cohesion erodes: people question who governs'],
    title: ['Steward', 'Steward'] },
];

export const GOV: Record<string, GovDef> = Object.fromEntries(GOVERNMENTS.map((g) => [g.id, g]));

// --- Emergent identity ------------------------------------------------------

export type TraitId =
  | 'expansionist' | 'militaristic' | 'defensive' | 'mercantile' | 'scientific' | 'religious'
  | 'secular' | 'artistic' | 'maritime' | 'isolationist' | 'ecological' | 'collectivist' | 'individualist';

export interface TraitDef {
  id: TraitId;
  label: string;
  effect: string;
  emerge: string;
  fade: string;
  /** Opposing trait: gaining one erodes the other. */
  opposite?: TraitId;
}

export const TRAITS: TraitDef[] = [
  { id: 'expansionist', label: 'Expansionist', effect: 'Settlers 20% cheaper; borders grow faster.',
    emerge: 'The {adj} people now believe their destiny lies beyond the next horizon.',
    fade: 'The {adj} hunger for new land has cooled.' },
  { id: 'militaristic', label: 'Militaristic', effect: '+15% unit production; less war weariness.',
    emerge: 'War has shaped the {name}: soldiers are honored above all others.',
    fade: 'The {adj} warrior ethos has faded into memory.', opposite: 'artistic' },
  { id: 'defensive', label: 'Defensive culture', effect: '+20% defense inside own borders.',
    emerge: 'Generations of invasion have hardened the {name} into a wary, defensive people.',
    fade: 'The {name} no longer live in fear of the next invasion.' },
  { id: 'mercantile', label: 'Mercantile', effect: '+15% gold; others value trade with you.',
    emerge: 'Trade has become the lifeblood of the {name}; merchants rival nobles in influence.',
    fade: 'The great {adj} merchant houses have declined.', opposite: 'isolationist' },
  { id: 'scientific', label: 'Scientific', effect: '+10% science; breakthroughs more likely.',
    emerge: 'Curiosity defines the {name}: their scholars question everything.',
    fade: 'The {adj} schools have grown quiet.', opposite: 'religious' },
  { id: 'religious', label: 'Devout', effect: '+1 mood from shrines and temples; +culture.',
    emerge: 'Faith is woven into every part of {adj} life.',
    fade: 'The temples of the {name} stand emptier than before.', opposite: 'secular' },
  { id: 'secular', label: 'Secular', effect: '+10% science; immune to religious unrest.',
    emerge: 'Weary of holy quarrels, the {name} have set faith apart from the state.',
    fade: 'The {name} are turning back toward the old faiths.', opposite: 'religious' },
  { id: 'artistic', label: 'Artistic', effect: '+15% culture.',
    emerge: 'The {name} have become a people of poets, painters and builders of beauty.',
    fade: 'The {adj} golden age of art has passed.', opposite: 'militaristic' },
  { id: 'maritime', label: 'Seafaring', effect: '+1 move at sea; +1 gold from harbors.',
    emerge: 'The {name} have become a people of the sea.',
    fade: 'The {name} have turned their backs on the sea.' },
  { id: 'isolationist', label: 'Isolationist', effect: '+1 mood per city; less trade income.',
    emerge: 'Cut off from the world, the {name} have learned to need no one.',
    fade: 'The {name} are opening themselves to the wider world.', opposite: 'mercantile' },
  { id: 'ecological', label: 'Ecological', effect: 'Pollution halved; disasters strike softer.',
    emerge: 'The {name} have learned to live in balance with the land.',
    fade: 'The {name} have forgotten their old reverence for the land.' },
  { id: 'collectivist', label: 'Collectivist', effect: '+10% production.',
    emerge: 'Hard times have taught the {name} that none survive alone.',
    fade: 'The {adj} sense of common purpose has frayed.', opposite: 'individualist' },
  { id: 'individualist', label: 'Individualist', effect: '+5% science and gold.',
    emerge: 'The {name} prize the freedom of each person above the will of the many.',
    fade: 'The {adj} cult of the individual has waned.', opposite: 'collectivist' },
];

export const TRAIT: Record<TraitId, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t])) as Record<TraitId, TraitDef>;

export const TRAIT_IDS = TRAITS.map((t) => t.id);

// --- Leader traits ----------------------------------------------------------

export type LeaderTraitId =
  | 'builder' | 'aggressive' | 'diplomatic' | 'scholar' | 'pious' | 'mercantile' | 'navigator'
  | 'patient' | 'charismatic' | 'ruthless' | 'paranoid' | 'reformer' | 'visionary' | 'pragmatic' | 'cruel';

export const LEADER_TRAITS: Record<LeaderTraitId, { name: string; desc: string }> = {
  builder: { name: 'Builder', desc: '+20% production toward buildings and wonders.' },
  aggressive: { name: 'Aggressive', desc: '+10% combat strength; quick to take offense.' },
  diplomatic: { name: 'Diplomatic', desc: 'Others warm to you faster; treaties come easier.' },
  scholar: { name: 'Scholar', desc: '+10% science.' },
  pious: { name: 'Pious', desc: '+15% culture; +1 mood in cities with shrines or temples.' },
  mercantile: { name: 'Mercantile', desc: '+15% gold.' },
  navigator: { name: 'Navigator', desc: '+1 movement at sea; ocean crossings sooner.' },
  patient: { name: 'Patient', desc: '+1 mood in every city.' },
  charismatic: { name: 'Charismatic', desc: 'War weariness halved; +10% culture.' },
  ruthless: { name: 'Ruthless', desc: '+15% unit production; may break treaties.' },
  paranoid: { name: 'Paranoid', desc: '+25% city defense; distrusts foreigners.' },
  reformer: { name: 'Reformer', desc: 'Changes government without anarchy.' },
  visionary: { name: 'Visionary', desc: '+10% science and culture.' },
  pragmatic: { name: 'Pragmatic', desc: 'Disasters do less damage; +5% production.' },
  cruel: { name: 'Cruel', desc: '+20% unit production; -1 mood in every city.' },
};

// --- Era naming -------------------------------------------------------------
// The era tier is set by technology; its name depends on who the civilization
// has become. A seafaring people's Bronze Age is a Maritime Age.

export const ERA_NAMES: { default: string; by: Partial<Record<TraitId, string>> }[] = [
  { default: 'Tribal Age', by: {} },
  { default: 'Settlement Age', by: { expansionist: 'Age of Wandering', maritime: 'Age of Shores' } },
  { default: 'Bronze Age', by: { maritime: 'Maritime Age', religious: 'Age of Oracles', militaristic: 'Warring Age', mercantile: 'Merchant Age' } },
  { default: 'Kingdom Age', by: { religious: 'Theocratic Age', mercantile: 'Merchant Age', militaristic: 'Imperial Age', scientific: 'Classical Age', isolationist: 'Isolationist Age', artistic: 'Classical Age' } },
  { default: 'Exploration Age', by: { isolationist: 'Age of Seclusion', scientific: 'Age of Reason', artistic: 'Renaissance', maritime: 'Age of Sail', religious: 'Age of Faith', militaristic: 'Age of Conquest' } },
  { default: 'Industrial Age', by: { militaristic: 'Age of Iron', mercantile: 'Age of Capital', ecological: 'Age of Balance', collectivist: 'Age of the Masses' } },
  { default: 'Electric Age', by: { artistic: 'Age of Light', scientific: 'Electric Age', militaristic: 'Age of Total War', isolationist: 'Age of Walls' } },
  { default: 'Information Age', by: { isolationist: 'Technological Age', mercantile: 'Networked Age', individualist: 'Age of Voices', collectivist: 'Planned Age' } },
  { default: 'Space Age', by: { militaristic: 'Age of Orbits', ecological: 'Age of Stewardship' } },
  { default: 'Synthetic Age', by: { ecological: 'Age of Gaia', artistic: 'Age of Dreams', religious: 'Age of Transcendence' } },
];
