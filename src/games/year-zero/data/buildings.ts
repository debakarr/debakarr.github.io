// Buildings, world wonders and late-game projects.

export interface Effects {
  food?: number;
  prod?: number;
  sci?: number;
  gold?: number;
  cult?: number;
  happy?: number;
  foodPct?: number;
  prodPct?: number;
  sciPct?: number;
  goldPct?: number;
  cultPct?: number;
  /** Bonus to city combat strength (%). */
  defense?: number;
  /** Extra city hit points. */
  hp?: number;
  /** Fraction of food kept after growth. */
  foodKeep?: number;
  /** 0..1 reduction of plague chance and damage. */
  plagueResist?: number;
  /** Pollution produced per turn. */
  pollution?: number;
  /** Pollution removed per turn. */
  cleanup?: number;
  /** Extra food per worked water tile. */
  seaFood?: number;
  /** Unit production bonus (%). */
  unitPct?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  tech: string | null;
  cost: number;
  upkeep: number;
  fx: Effects;
  coastal?: boolean;
  desc: string;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'granary', name: 'Granary', tech: 'agriculture', cost: 40, upkeep: 1, fx: { food: 2, foodKeep: 0.25 }, desc: '+2 food. Keeps food after growth; softens droughts.' },
  { id: 'shrine', name: 'Shrine', tech: 'mysticism', cost: 30, upkeep: 0, fx: { cult: 1, happy: 1 }, desc: '+1 culture, +1 mood.' },
  { id: 'monument', name: 'Monument', tech: 'calendar', cost: 34, upkeep: 0, fx: { cult: 2 }, desc: '+2 culture.' },
  { id: 'walls', name: 'Walls', tech: 'masonry', cost: 50, upkeep: 0, fx: { defense: 50, hp: 100 }, desc: '+50% city defense, +100 HP. The city fires on attackers.' },
  { id: 'barracks', name: 'Barracks', tech: 'bronze', cost: 44, upkeep: 1, fx: { unitPct: 15 }, desc: 'New units start as veterans. +15% unit production.' },
  { id: 'library', name: 'Library', tech: 'writing', cost: 60, upkeep: 1, fx: { sci: 2, sciPct: 20 }, desc: '+2 science, +20% science.' },
  { id: 'market', name: 'Market', tech: 'currency', cost: 70, upkeep: 0, fx: { gold: 2, goldPct: 25 }, desc: '+2 gold, +25% gold.' },
  { id: 'amphitheater', name: 'Amphitheater', tech: 'philosophy', cost: 75, upkeep: 1, fx: { happy: 3, cult: 1 }, desc: '+3 mood, +1 culture.' },
  { id: 'harbor', name: 'Harbor', tech: 'seafaring', cost: 70, upkeep: 1, fx: { seaFood: 1, gold: 1 }, coastal: true, desc: '+1 food on worked water tiles, +1 gold.' },
  { id: 'workshop', name: 'Workshop', tech: 'construction', cost: 70, upkeep: 1, fx: { prod: 2, prodPct: 10 }, desc: '+2 production, +10% production.' },
  { id: 'aqueduct', name: 'Aqueduct', tech: 'engineering', cost: 90, upkeep: 1, fx: { food: 1, plagueResist: 0.4, happy: 1 }, desc: 'Clean water: +1 food, +1 mood, far fewer plagues.' },
  { id: 'temple', name: 'Temple', tech: 'theology', cost: 85, upkeep: 1, fx: { cult: 3, happy: 2 }, desc: '+3 culture, +2 mood.' },
  { id: 'castle', name: 'Castle', tech: 'feudalism', cost: 95, upkeep: 1, fx: { defense: 50, hp: 100 }, desc: '+50% city defense, +100 HP.' },
  { id: 'observatory', name: 'Observatory', tech: 'astronomy', cost: 110, upkeep: 1, fx: { sci: 2, sciPct: 25 }, desc: '+2 science, +25% science.' },
  { id: 'university', name: 'University', tech: 'education', cost: 150, upkeep: 2, fx: { sci: 3, sciPct: 35 }, desc: '+3 science, +35% science.' },
  { id: 'bank', name: 'Bank', tech: 'banking', cost: 145, upkeep: 0, fx: { gold: 3, goldPct: 30 }, desc: '+3 gold, +30% gold.' },
  { id: 'press', name: 'Printing House', tech: 'printing', cost: 120, upkeep: 1, fx: { cult: 3, sci: 1 }, desc: '+3 culture, +1 science.' },
  { id: 'factory', name: 'Factory', tech: 'industrialization', cost: 210, upkeep: 2, fx: { prod: 3, prodPct: 40, pollution: 2 }, desc: '+3 production, +40% production. Pollutes.' },
  { id: 'hospital', name: 'Hospital', tech: 'medicine', cost: 180, upkeep: 2, fx: { food: 2, happy: 1, plagueResist: 0.5 }, desc: '+2 food, +1 mood, strong plague resistance.' },
  { id: 'exchange', name: 'Stock Exchange', tech: 'economics', cost: 230, upkeep: 1, fx: { gold: 4, goldPct: 35 }, desc: '+4 gold, +35% gold. Exposes the city to market crashes.' },
  { id: 'powerplant', name: 'Power Plant', tech: 'electricity', cost: 250, upkeep: 2, fx: { prodPct: 30, pollution: 3 }, desc: '+30% production. Pollutes heavily.' },
  { id: 'broadcast', name: 'Broadcast Tower', tech: 'radio', cost: 240, upkeep: 2, fx: { cult: 5, happy: 2 }, desc: '+5 culture, +2 mood.' },
  { id: 'researchlab', name: 'Research Lab', tech: 'computers', cost: 310, upkeep: 3, fx: { sci: 5, sciPct: 50 }, desc: '+5 science, +50% science.' },
  { id: 'nuclear', name: 'Nuclear Plant', tech: 'fission', cost: 330, upkeep: 3, fx: { prodPct: 40, pollution: 1 }, desc: '+40% production. Little pollution — but risk.' },
  { id: 'recycling', name: 'Recycling Center', tech: 'ecology', cost: 260, upkeep: 2, fx: { prod: 2, cleanup: 3 }, desc: '+2 production. Cleans 3 pollution per turn.' },
  { id: 'geneclinic', name: 'Gene Clinic', tech: 'genetics', cost: 320, upkeep: 2, fx: { food: 4, plagueResist: 0.9, happy: 1 }, desc: '+4 food, +1 mood, plagues nearly vanish.' },
  { id: 'fusionreactor', name: 'Fusion Reactor', tech: 'fusion', cost: 420, upkeep: 3, fx: { prod: 6, prodPct: 50, cleanup: 2 }, desc: '+6 production, +50% production. Clean.' },
  { id: 'arcology', name: 'Arcology', tech: 'orbital', cost: 480, upkeep: 3, fx: { happy: 4, food: 3, cult: 3 }, desc: '+4 mood, +3 food, +3 culture.' },
  { id: 'nanoforge', name: 'Nanoforge', tech: 'nanotech', cost: 520, upkeep: 3, fx: { prod: 8, prodPct: 40 }, desc: '+8 production, +40% production.' },
  { id: 'synthfoundry', name: 'Synthetic Foundry', tech: 'synthbio', cost: 520, upkeep: 3, fx: { food: 6, sci: 4 }, desc: '+6 food, +4 science. Synthetic citizens join the city.' },
];

export const BUILDING: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

export interface WonderDef {
  id: string;
  name: string;
  tech: string;
  cost: number;
  /** Effects in the host city. */
  fx: Effects;
  /** Effects in every city of the owner. */
  global?: Effects;
  desc: string;
}

export const WONDERS: WonderDef[] = [
  { id: 'stonecircle', name: 'The Stone Circle', tech: 'mysticism', cost: 110, fx: { cult: 4, happy: 2 }, global: { happy: 1 }, desc: '+4 culture here; +1 mood in every city.' },
  { id: 'terraces', name: 'The Hanging Terraces', tech: 'irrigation', cost: 160, fx: { food: 4 }, global: { food: 1 }, desc: '+1 food in every city.' },
  { id: 'archive', name: 'The Great Archive', tech: 'writing', cost: 170, fx: { sci: 6 }, global: { sciPct: 5 }, desc: '+6 science here; +5% science everywhere.' },
  { id: 'rampart', name: 'The Long Rampart', tech: 'construction', cost: 210, fx: { defense: 50 }, global: { defense: 25 }, desc: '+25% defense in every city.' },
  { id: 'beacon', name: 'The Beacon of the Straits', tech: 'seafaring', cost: 190, fx: { gold: 4 }, global: { seaFood: 1 }, desc: '+1 food on every worked water tile.' },
  { id: 'sunhouse', name: 'The House of the Sun', tech: 'theology', cost: 300, fx: { cult: 8, happy: 2 }, global: { happy: 1, cultPct: 10 }, desc: '+1 mood and +10% culture everywhere.' },
  { id: 'clock', name: 'The Celestial Clock', tech: 'astronomy', cost: 320, fx: { sci: 8 }, global: { sciPct: 10 }, desc: '+10% science everywhere.' },
  { id: 'bazaar', name: 'The Grand Bazaar', tech: 'banking', cost: 420, fx: { gold: 10 }, global: { goldPct: 15 }, desc: '+15% gold everywhere.' },
  { id: 'engine', name: 'The Great Engine', tech: 'industrialization', cost: 600, fx: { prod: 12 }, global: { prodPct: 10 }, desc: '+10% production everywhere.' },
  { id: 'exposition', name: 'The World Exposition', tech: 'electricity', cost: 700, fx: { cult: 15 }, global: { cultPct: 20, happy: 1 }, desc: '+20% culture and +1 mood everywhere.' },
  { id: 'network', name: 'The Open Network', tech: 'computers', cost: 900, fx: { sci: 20 }, global: { sciPct: 15 }, desc: '+15% science everywhere.' },
  { id: 'elevator', name: 'The Orbital Elevator', tech: 'orbital', cost: 1300, fx: { prod: 25 }, global: { prodPct: 15 }, desc: '+15% production everywhere; space projects are cheaper.' },
  { id: 'lastlibrary', name: 'The Last Library', tech: 'ai', cost: 1500, fx: { cult: 40, sci: 20 }, global: { happy: 2 }, desc: 'A record of everything your people have been. +2 mood everywhere.' },
];

export const WONDER: Record<string, WonderDef> = Object.fromEntries(WONDERS.map((w) => [w.id, w]));

export interface ProjectDef {
  id: string;
  name: string;
  tech: string | null;
  cost: number;
  /** Can be built once per civilization. */
  once: boolean;
  desc: string;
  /** Ongoing projects that turn production into another yield and never finish. */
  convert?: 'gold' | 'sci' | 'cult';
}

export const PROJECTS: ProjectDef[] = [
  { id: 'conv_gold', name: 'Trade Goods', tech: null, cost: 0, once: false, convert: 'gold', desc: 'Ongoing: half of production becomes gold.' },
  { id: 'conv_sci', name: 'Research Grants', tech: 'writing', cost: 0, once: false, convert: 'sci', desc: 'Ongoing: half of production becomes science.' },
  { id: 'conv_cult', name: 'Festivals', tech: 'mysticism', cost: 0, once: false, convert: 'cult', desc: 'Ongoing: half of production becomes culture.' },
  { id: 'satellite', name: 'Satellite Launch', tech: 'satellites', cost: 900, once: true, desc: 'Put an eye in the sky: reveals the entire world.' },
  { id: 'station', name: 'Orbital Station', tech: 'spaceflight', cost: 1200, once: true, desc: 'A permanent home in orbit. +10% science everywhere.' },
  { id: 'colony_hull', name: 'Colony Ship: Hull', tech: 'interstellar', cost: 1500, once: true, desc: 'One of three parts of the colony ship.' },
  { id: 'colony_engine', name: 'Colony Ship: Engines', tech: 'interstellar', cost: 1500, once: true, desc: 'One of three parts of the colony ship.' },
  { id: 'colony_cryo', name: 'Colony Ship: Cryo Vaults', tech: 'interstellar', cost: 1500, once: true, desc: 'One of three parts of the colony ship.' },
];

export const PROJECT: Record<string, ProjectDef> = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));
