// Micro City state. Everything here is saved; the derived simulation layers
// (coverage, pollution, traffic, land value) live on the City object and are
// recomputed after loading.

export type MapKind = 'river' | 'coast' | 'lakes' | 'island' | 'valley';
export type Region = 'generic' | 'india';

export interface Settings {
  seed: string;
  size: number;
  map: MapKind;
  region: Region;
  name: string;
  challenge: string | null;
}

export interface Tiles {
  ter: Uint8Array;
  elev: Uint8Array;
  trees: Uint8Array;
  road: Uint8Array;
  zone: Uint8Array;
  /** 0 low density, 1 high density */
  dense: Uint8Array;
  level: Uint8Array;
  occ: Uint16Array;
  style: Uint8Array;
  age: Uint16Array;
  bld: Int32Array;
  flags: Uint8Array;
  /** Months a building has been struggling (no power, unhappy...). */
  strain: Uint8Array;
}

export const FLAG_POWER = 1;
export const FLAG_WATER = 2;
export const FLAG_ABANDONED = 4;
export const FLAG_FIRE = 8;
export const FLAG_FLOODED = 16;
export const FLAG_SEWER = 32;

export interface Placed {
  id: number;
  type: string;
  x: number;
  y: number;
  built: number;
}

export interface HistoryEntry {
  tick: number;
  kind: string;
  imp: number;
  text: string;
  tile: number;
}

export interface NewsItem {
  id: number;
  tick: number;
  kind: 'news' | 'story' | 'warning' | 'disaster' | 'milestone';
  text: string;
  tile: number;
}

export interface Sample {
  tick: number;
  pop: number;
  jobs: number;
  money: number;
  happy: number;
  commute: number;
  air: number;
  traffic: number;
  unemployment: number;
}

export interface Budget {
  income: Record<string, number>;
  expense: Record<string, number>;
}

export interface CityState {
  version: number;
  settings: Settings;
  tick: number;
  rng: number;
  nextId: number;
  tiles: Tiles;
  buildings: Record<number, Placed>;
  money: number;
  taxes: { res: number; com: number; ind: number; off: number };
  policies: Record<string, boolean>;
  milestone: number;
  history: HistoryEntry[];
  news: NewsItem[];
  samples: Sample[];
  districtNames: Record<number, string>;
  firsts: Record<string, number>;
  budget: Budget;
  /** Months of continuous state, for events like housing crises. */
  streaks: Record<string, number>;
  disasters: { kind: string; tick: number; until: number; label: string }[];
  /** Totals from the last month, for the UI. */
  last: {
    pop: number;
    workers: number;
    jobs: number;
    employed: number;
    happy: number;
    commute: number;
    transitShare: number;
    air: number;
    traffic: number;
    power: [number, number];
    water: [number, number];
    sewage: [number, number];
    garbage: [number, number];
    demand: [number, number, number, number];
    income: number;
    expense: number;
  };
  challengeDone: number;
}
