// A compact, branching technology web across ten tiers. Civilizations rarely
// research everything: costs climb steeply and personalities pull research
// toward different branches.

export type TechTag =
  | 'food' | 'production' | 'science' | 'culture' | 'religion' | 'military'
  | 'maritime' | 'trade' | 'expansion' | 'ecology' | 'government' | 'future';

export interface TechDef {
  id: string;
  name: string;
  tier: number;
  req: string[];
  tags: TechTag[];
  blurb: string;
  /** Recorded in history as a breakthrough. */
  milestone?: string;
}

export const TECHS: TechDef[] = [
  // Tier 0 — the tribal toolkit
  { id: 'agriculture', name: 'Agriculture', tier: 0, req: [], tags: ['food'], blurb: 'Farms and granaries.', milestone: 'learn to sow and reap the fields' },
  { id: 'husbandry', name: 'Animal Husbandry', tier: 0, req: [], tags: ['expansion', 'food'], blurb: 'Pastures. Reveals horses.' },
  { id: 'mining', name: 'Mining', tier: 0, req: [], tags: ['production'], blurb: 'Mines on hills and ore.' },
  { id: 'mysticism', name: 'Mysticism', tier: 0, req: [], tags: ['religion', 'culture'], blurb: 'Shrines. A people may found a faith.' },
  { id: 'archery', name: 'Archery', tier: 0, req: [], tags: ['military'], blurb: 'Archers.' },
  { id: 'sailing', name: 'Sailing', tier: 0, req: [], tags: ['maritime'], blurb: 'Fishing boats, galleys; units may travel along coasts.' },
  // Tier 1
  { id: 'masonry', name: 'Masonry', tier: 1, req: ['mining'], tags: ['production', 'military'], blurb: 'City walls.' },
  { id: 'bronze', name: 'Bronze Working', tier: 1, req: ['mining'], tags: ['military', 'production'], blurb: 'Spearmen, barracks. Reveals iron.' },
  { id: 'writing', name: 'Writing', tier: 1, req: ['agriculture'], tags: ['science', 'trade'], blurb: 'Libraries. Enables trade agreements.', milestone: 'invent writing' },
  { id: 'wheel', name: 'The Wheel', tier: 1, req: ['husbandry'], tags: ['trade', 'expansion'], blurb: 'Roads begin linking your cities.' },
  { id: 'irrigation', name: 'Irrigation', tier: 1, req: ['agriculture'], tags: ['food'], blurb: '+1 food on river and lake farms. Softens droughts.' },
  { id: 'riding', name: 'Horseback Riding', tier: 1, req: ['husbandry'], tags: ['military', 'expansion'], blurb: 'Horsemen.' },
  { id: 'calendar', name: 'Calendar', tier: 1, req: ['mysticism', 'agriculture'], tags: ['culture', 'food'], blurb: 'Monuments and plantations.' },
  // Tier 2
  { id: 'iron', name: 'Iron Working', tier: 2, req: ['bronze'], tags: ['military'], blurb: 'Swordsmen (need iron).' },
  { id: 'mathematics', name: 'Mathematics', tier: 2, req: ['writing'], tags: ['science', 'military'], blurb: 'Catapults.' },
  { id: 'currency', name: 'Currency', tier: 2, req: ['writing', 'bronze'], tags: ['trade'], blurb: 'Markets.' },
  { id: 'philosophy', name: 'Philosophy', tier: 2, req: ['writing', 'mysticism'], tags: ['science', 'culture'], blurb: 'Amphitheaters.', milestone: 'give birth to philosophy' },
  { id: 'monarchy', name: 'Monarchy', tier: 2, req: ['calendar', 'bronze'], tags: ['government'], blurb: 'Government: Monarchy.' },
  { id: 'seafaring', name: 'Seafaring', tier: 2, req: ['sailing', 'wheel'], tags: ['maritime', 'trade'], blurb: 'Harbors.' },
  { id: 'construction', name: 'Construction', tier: 2, req: ['masonry', 'wheel'], tags: ['production'], blurb: 'Workshops and lumber camps.' },
  // Tier 3
  { id: 'engineering', name: 'Engineering', tier: 3, req: ['construction', 'mathematics'], tags: ['production', 'military'], blurb: 'Aqueducts and trebuchets.' },
  { id: 'theology', name: 'Theology', tier: 3, req: ['philosophy', 'monarchy'], tags: ['religion', 'government'], blurb: 'Temples. Government: Theocracy.' },
  { id: 'feudalism', name: 'Feudalism', tier: 3, req: ['monarchy', 'iron'], tags: ['military'], blurb: 'Pikemen, knights, castles.' },
  { id: 'civilcode', name: 'Civil Code', tier: 3, req: ['currency', 'philosophy'], tags: ['government', 'trade'], blurb: 'Government: Republic.' },
  { id: 'astronomy', name: 'Astronomy', tier: 3, req: ['mathematics', 'calendar'], tags: ['science', 'maritime'], blurb: 'Observatories.' },
  { id: 'machinery', name: 'Machinery', tier: 3, req: ['iron', 'mathematics'], tags: ['military', 'production'], blurb: 'Crossbowmen.' },
  // Tier 4
  { id: 'navigation', name: 'Navigation', tier: 4, req: ['seafaring', 'astronomy'], tags: ['maritime', 'expansion'], blurb: 'Ocean crossings, caravels, explorers.', milestone: 'learn to cross the open ocean' },
  { id: 'education', name: 'Education', tier: 4, req: ['theology', 'astronomy'], tags: ['science'], blurb: 'Universities.' },
  { id: 'gunpowder', name: 'Gunpowder', tier: 4, req: ['machinery', 'feudalism'], tags: ['military'], blurb: 'Musketeers and cannon.' },
  { id: 'banking', name: 'Banking', tier: 4, req: ['civilcode'], tags: ['trade'], blurb: 'Banks.' },
  { id: 'printing', name: 'Printing Press', tier: 4, req: ['civilcode', 'theology'], tags: ['culture', 'science'], blurb: 'Ideas spread faster: +culture.', milestone: 'build the first printing press' },
  { id: 'imperialism', name: 'Imperial Administration', tier: 4, req: ['civilcode', 'feudalism'], tags: ['government', 'expansion'], blurb: 'Government: Empire.' },
  // Tier 5
  { id: 'industrialization', name: 'Industrialization', tier: 5, req: ['banking', 'engineering'], tags: ['production'], blurb: 'Factories. Reveals coal. Pollution begins.', milestone: 'light the first furnaces of industry' },
  { id: 'steam', name: 'Steam Power', tier: 5, req: ['industrialization', 'navigation'], tags: ['production', 'maritime'], blurb: 'Ironclads. Railroads.' },
  { id: 'rifling', name: 'Rifling', tier: 5, req: ['gunpowder'], tags: ['military'], blurb: 'Riflemen and cavalry.' },
  { id: 'enlightenment', name: 'Enlightenment', tier: 5, req: ['education', 'printing'], tags: ['government', 'science'], blurb: 'Government: Democracy.' },
  { id: 'medicine', name: 'Medicine', tier: 5, req: ['education'], tags: ['food', 'science'], blurb: 'Hospitals. Plagues weaken.' },
  { id: 'economics', name: 'Economics', tier: 5, req: ['banking', 'printing'], tags: ['trade'], blurb: 'Stock exchanges.' },
  { id: 'nationalism', name: 'Nationalism', tier: 5, req: ['printing', 'imperialism'], tags: ['government', 'military'], blurb: 'Government: Dictatorship.' },
  // Tier 6
  { id: 'electricity', name: 'Electricity', tier: 6, req: ['industrialization', 'enlightenment'], tags: ['science', 'production'], blurb: 'Power plants.', milestone: 'harness electricity' },
  { id: 'combustion', name: 'Combustion', tier: 6, req: ['steam'], tags: ['production', 'military'], blurb: 'Destroyers, oil wells. Reveals oil.' },
  { id: 'refrigeration', name: 'Refrigeration', tier: 6, req: ['electricity', 'medicine'], tags: ['food'], blurb: '+1 food on farms.' },
  { id: 'flight', name: 'Flight', tier: 6, req: ['combustion', 'electricity'], tags: ['military', 'expansion'], blurb: 'Biplanes.', milestone: 'take to the skies' },
  { id: 'radio', name: 'Radio', tier: 6, req: ['electricity'], tags: ['culture'], blurb: 'Broadcast towers.' },
  { id: 'massprod', name: 'Mass Production', tier: 6, req: ['combustion', 'rifling'], tags: ['military', 'production'], blurb: 'Infantry, artillery, machine guns.' },
  // Tier 7
  { id: 'computers', name: 'Computers', tier: 7, req: ['radio', 'electricity'], tags: ['science', 'government'], blurb: 'Research labs. Government: Technocracy.', milestone: 'build the first thinking machines' },
  { id: 'armor', name: 'Armored Warfare', tier: 7, req: ['massprod'], tags: ['military'], blurb: 'Tanks (need oil).' },
  { id: 'rocketry', name: 'Rocketry', tier: 7, req: ['flight', 'computers'], tags: ['military', 'future'], blurb: 'Jets and rocket artillery.' },
  { id: 'fission', name: 'Nuclear Fission', tier: 7, req: ['electricity', 'massprod'], tags: ['production', 'future'], blurb: 'Reveals uranium. Nuclear plants.' },
  { id: 'ecology', name: 'Ecology', tier: 7, req: ['refrigeration'], tags: ['ecology'], blurb: 'Recycling centers. Pollution falls.' },
  { id: 'globalization', name: 'Globalization', tier: 7, req: ['computers', 'economics'], tags: ['trade', 'government'], blurb: 'Government: Federation.' },
  // Tier 8
  { id: 'satellites', name: 'Satellites', tier: 8, req: ['rocketry'], tags: ['science', 'future'], blurb: 'Project: Satellite Launch (maps the world).' },
  { id: 'robotics', name: 'Robotics', tier: 8, req: ['computers', 'armor'], tags: ['production', 'military'], blurb: 'Modern armor, stealth cruisers.' },
  { id: 'genetics', name: 'Genetic Engineering', tier: 8, req: ['ecology', 'computers'], tags: ['food', 'science'], blurb: 'Gene clinics: plagues nearly vanish.' },
  { id: 'fusion', name: 'Fusion Power', tier: 8, req: ['fission', 'computers'], tags: ['production', 'ecology', 'future'], blurb: 'Fusion reactors: clean, vast power.' },
  { id: 'spaceflight', name: 'Spaceflight', tier: 8, req: ['satellites'], tags: ['future', 'science'], blurb: 'Project: Orbital Station.', milestone: 'send the first people into orbit' },
  { id: 'orbital', name: 'Orbital Habitats', tier: 8, req: ['spaceflight', 'fusion'], tags: ['future', 'expansion'], blurb: 'Arcologies.' },
  // Tier 9
  { id: 'ai', name: 'Artificial Intelligence', tier: 9, req: ['robotics', 'computers'], tags: ['future', 'government'], blurb: 'Drone swarms. Government: AI Governance.', milestone: 'awaken a true artificial mind' },
  { id: 'nanotech', name: 'Nanotechnology', tier: 9, req: ['fusion', 'robotics'], tags: ['future', 'production'], blurb: 'Hover tanks. Nanoforges.' },
  { id: 'synthbio', name: 'Synthetic Biology', tier: 9, req: ['genetics', 'ai'], tags: ['future', 'food'], blurb: 'Synthetic citizens.' },
  { id: 'postscarcity', name: 'Post-Scarcity Economics', tier: 9, req: ['nanotech', 'globalization'], tags: ['future', 'trade'], blurb: 'The end of want. What comes next?', milestone: 'end material scarcity' },
  { id: 'interstellar', name: 'Interstellar Colonization', tier: 9, req: ['orbital', 'ai'], tags: ['future', 'expansion'], blurb: 'Project: Colony Ship (3 parts).' },
];

export const TECH: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/** Base research cost per tier (Standard pace). */
export const TIER_COST = [24, 55, 115, 215, 400, 760, 1300, 2100, 3100, 4300];

export const ERA_TIER_NAMES = [
  'Tribal', 'Settlement', 'Bronze', 'Kingdom', 'Exploration',
  'Industrial', 'Electric', 'Information', 'Space', 'Synthetic',
];

export function techCost(id: string, pace: number, known: number): number {
  const t = TECH[id];
  // A gentle surcharge per known tech rewards focus over breadth.
  return Math.round(TIER_COST[t.tier] * pace * (1 + known * 0.02));
}
