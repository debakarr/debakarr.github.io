// A small set of unit classes. Each class upgrades through the eras; a city
// always builds the best version its civilization can field.

export type UnitClass = 'civilian' | 'recon' | 'infantry' | 'cavalry' | 'ranged' | 'siege' | 'naval' | 'air';

export interface UnitDef {
  id: string;
  name: string;
  cls: UnitClass;
  tech: string | null;
  tech2?: string;
  str: number;
  /** Ranged strength; 0 for melee units. */
  rng: number;
  range: number;
  moves: number;
  cost: number;
  res?: string;
  sight?: number;
  /** Multiplier when attacking or defending against cavalry. */
  antiCav?: number;
  /** Multiplier when attacking cities. */
  vsCity?: number;
  /** Naval units restricted to coastal waters. */
  coastal?: boolean;
}

export const UNITS: UnitDef[] = [
  { id: 'settler', name: 'Settlers', cls: 'civilian', tech: null, str: 0, rng: 0, range: 0, moves: 2, cost: 50 },
  { id: 'scout', name: 'Scouts', cls: 'recon', tech: null, str: 4, rng: 0, range: 0, moves: 3, cost: 18, sight: 3 },
  { id: 'explorer', name: 'Explorers', cls: 'recon', tech: 'navigation', str: 10, rng: 0, range: 0, moves: 4, cost: 40, sight: 3 },

  { id: 'warband', name: 'Warband', cls: 'infantry', tech: null, str: 8, rng: 0, range: 0, moves: 1, cost: 22 },
  { id: 'spearmen', name: 'Spearmen', cls: 'infantry', tech: 'bronze', str: 12, rng: 0, range: 0, moves: 1, cost: 32, antiCav: 1.5 },
  { id: 'swordsmen', name: 'Swordsmen', cls: 'infantry', tech: 'iron', str: 16, rng: 0, range: 0, moves: 1, cost: 42, res: 'iron' },
  { id: 'pikemen', name: 'Pikemen', cls: 'infantry', tech: 'feudalism', str: 21, rng: 0, range: 0, moves: 1, cost: 55, antiCav: 1.5 },
  { id: 'musketeers', name: 'Musketeers', cls: 'infantry', tech: 'gunpowder', str: 30, rng: 0, range: 0, moves: 1, cost: 75 },
  { id: 'riflemen', name: 'Riflemen', cls: 'infantry', tech: 'rifling', str: 40, rng: 0, range: 0, moves: 1, cost: 100 },
  { id: 'infantry', name: 'Infantry', cls: 'infantry', tech: 'massprod', str: 55, rng: 0, range: 0, moves: 2, cost: 135 },
  { id: 'mechinf', name: 'Mechanized Infantry', cls: 'infantry', tech: 'robotics', str: 78, rng: 0, range: 0, moves: 3, cost: 180 },
  { id: 'exolegion', name: 'Exo-Legion', cls: 'infantry', tech: 'nanotech', str: 110, rng: 0, range: 0, moves: 3, cost: 240 },

  { id: 'horsemen', name: 'Horsemen', cls: 'cavalry', tech: 'riding', str: 13, rng: 0, range: 0, moves: 2, cost: 36, res: 'horses' },
  { id: 'knights', name: 'Knights', cls: 'cavalry', tech: 'feudalism', str: 23, rng: 0, range: 0, moves: 2, cost: 62, res: 'horses' },
  { id: 'cavalry', name: 'Cavalry', cls: 'cavalry', tech: 'rifling', str: 37, rng: 0, range: 0, moves: 3, cost: 95, res: 'horses' },
  { id: 'tanks', name: 'Tanks', cls: 'cavalry', tech: 'armor', str: 66, rng: 0, range: 0, moves: 3, cost: 160, res: 'oil' },
  { id: 'modarmor', name: 'Modern Armor', cls: 'cavalry', tech: 'robotics', str: 92, rng: 0, range: 0, moves: 3, cost: 210, res: 'oil' },
  { id: 'hovertank', name: 'Hover Tanks', cls: 'cavalry', tech: 'nanotech', str: 128, rng: 0, range: 0, moves: 4, cost: 270 },

  { id: 'archers', name: 'Archers', cls: 'ranged', tech: 'archery', str: 6, rng: 10, range: 2, moves: 1, cost: 28 },
  { id: 'crossbow', name: 'Crossbowmen', cls: 'ranged', tech: 'machinery', str: 12, rng: 19, range: 2, moves: 1, cost: 50 },
  { id: 'gatling', name: 'Gatling Guns', cls: 'ranged', tech: 'rifling', str: 26, rng: 38, range: 2, moves: 1, cost: 92 },
  { id: 'machinegun', name: 'Machine Guns', cls: 'ranged', tech: 'massprod', str: 36, rng: 56, range: 2, moves: 1, cost: 130 },

  { id: 'catapult', name: 'Catapults', cls: 'siege', tech: 'mathematics', str: 6, rng: 14, range: 2, moves: 1, cost: 44, vsCity: 2 },
  { id: 'trebuchet', name: 'Trebuchets', cls: 'siege', tech: 'engineering', str: 9, rng: 22, range: 2, moves: 1, cost: 60, vsCity: 2 },
  { id: 'cannon', name: 'Cannon', cls: 'siege', tech: 'gunpowder', str: 14, rng: 34, range: 2, moves: 1, cost: 82, vsCity: 2 },
  { id: 'artillery', name: 'Artillery', cls: 'siege', tech: 'massprod', str: 22, rng: 54, range: 3, moves: 1, cost: 130, vsCity: 2 },
  { id: 'rocketart', name: 'Rocket Artillery', cls: 'siege', tech: 'rocketry', str: 32, rng: 82, range: 3, moves: 2, cost: 185, vsCity: 2 },

  { id: 'galley', name: 'Galley', cls: 'naval', tech: 'sailing', str: 10, rng: 0, range: 0, moves: 3, cost: 36, coastal: true },
  { id: 'caravel', name: 'Caravel', cls: 'naval', tech: 'navigation', str: 18, rng: 0, range: 0, moves: 4, cost: 58, sight: 3 },
  { id: 'frigate', name: 'Frigate', cls: 'naval', tech: 'gunpowder', tech2: 'navigation', str: 22, rng: 30, range: 2, moves: 4, cost: 80 },
  { id: 'ironclad', name: 'Ironclad', cls: 'naval', tech: 'steam', str: 42, rng: 0, range: 0, moves: 4, cost: 110, res: 'coal' },
  { id: 'destroyer', name: 'Destroyer', cls: 'naval', tech: 'combustion', str: 58, rng: 0, range: 0, moves: 6, cost: 140, res: 'oil' },
  { id: 'battleship', name: 'Battleship', cls: 'naval', tech: 'massprod', tech2: 'combustion', str: 60, rng: 80, range: 3, moves: 5, cost: 175, res: 'oil' },
  { id: 'stealthcruiser', name: 'Stealth Cruiser', cls: 'naval', tech: 'robotics', str: 95, rng: 112, range: 3, moves: 6, cost: 230 },

  { id: 'biplane', name: 'Biplanes', cls: 'air', tech: 'flight', str: 22, rng: 50, range: 3, moves: 5, cost: 120, sight: 3 },
  { id: 'jet', name: 'Jet Fighters', cls: 'air', tech: 'rocketry', str: 42, rng: 86, range: 4, moves: 7, cost: 180, sight: 3, res: 'oil' },
  { id: 'drones', name: 'Drone Swarm', cls: 'air', tech: 'ai', str: 64, rng: 124, range: 4, moves: 8, cost: 240, sight: 4 },
];

export const UNIT: Record<string, UnitDef> = Object.fromEntries(UNITS.map((u) => [u.id, u]));

export const CLASS_LABEL: Record<UnitClass, string> = {
  civilian: 'Civilian',
  recon: 'Recon',
  infantry: 'Infantry',
  cavalry: 'Mounted',
  ranged: 'Ranged',
  siege: 'Siege',
  naval: 'Naval',
  air: 'Air',
};

export function isMilitary(def: UnitDef): boolean {
  return def.cls !== 'civilian' && def.cls !== 'recon';
}

export function soldiersPerUnit(def: UnitDef): number {
  return Math.round(def.cost * 28);
}
