import type { Language } from '../core/names';
import type { LeaderTraitId, TraitId } from '../data/society';

// Everything in GameState is plain data (typed arrays aside) so a save file
// can rebuild the exact world, civilizations and their history.

export type MapSize = 'small' | 'standard' | 'large';
export type MapType = 'continents' | 'pangaea' | 'archipelago' | 'lakes';
export type Pace = 'quick' | 'standard' | 'epic';

export interface Settings {
  seed: string;
  size: MapSize;
  mapType: MapType;
  rivals: number;
  /** 0 gentle .. 3 brutal */
  difficulty: number;
  pace: Pace;
  playerName: string;
}

export interface WorldMap {
  w: number;
  h: number;
  terrain: Uint8Array;
  relief: Uint8Array;
  feature: Uint8Array;
  elevation: Uint8Array;
  river: Uint8Array;
  riverTo: Int32Array;
  riverId: Int16Array;
  resource: Uint8Array;
  wonder: Int8Array;
  region: Int16Array;
  owner: Int16Array;
  cityOf: Int32Array;
  improvement: Uint8Array;
  road: Uint8Array;
  cityAt: Int32Array;
  ruinAt: Int32Array;
}

export interface Region {
  id: number;
  kind: 'land' | 'water';
  size: number;
  name: string;
}

export interface River {
  id: number;
  name: string;
  length: number;
}

export interface NaturalWonder {
  id: number;
  name: string;
  kind: string;
  tile: number;
  desc: string;
  fx: { food: number; prod: number; trade: number; cult: number; sci: number; happy: number };
  discoveredBy: number[];
}

export interface Ruin {
  id: number;
  tile: number;
  name: string;
  civName: string;
  founded: number;
  fell: number;
  peakPop: number;
  cause: string;
  legend: string;
  artifacts: string[];
  prehistoric: boolean;
  exploredBy: number[];
  /** Tech that studying the ruins advances. */
  knowledge: string | null;
}

export interface Memory {
  kind: string;
  turn: number;
  value: number;
  /** Points recovered per turn toward `floor`. */
  decay: number;
  floor: number;
  text: string;
}

export interface Relation {
  met: number;
  war: boolean;
  warId: number;
  trade: number;
  openBorders: number;
  alliance: number;
  peaceUntil: number;
  /** -1 or the id of the overlord when this civ is a vassal of the other. */
  vassal: boolean;
  memories: Memory[];
  opinion: number;
  lastProposal: number;
  lastWarCheck: number;
  /** turns of contact along a shared border */
  borderTension: number;
  trespass: number;
}

export interface Modifier {
  kind: string;
  until: number;
  value: number;
  cityId?: number;
  label: string;
}

export interface Civ {
  id: number;
  name: string;
  adj: string;
  color: string;
  lang: Language;
  isPlayer: boolean;
  alive: boolean;
  founded: number;
  collapsed: number;
  parentId: number;
  capitalId: number;
  originalCapitalTile: number;
  gold: number;
  research: string | null;
  researchGoal: string | null;
  sciStore: number;
  techs: Record<string, number>;
  culture: number;
  government: string;
  govSince: number;
  anarchy: number;
  traits: Record<TraitId, number>;
  identity: TraitId[];
  eraTier: number;
  eraPath: { tier: number; name: string; turn: number }[];
  leaderId: number;
  dynasty: string;
  religionId: number;
  relations: Record<number, Relation>;
  explored: Uint8Array;
  visible: Uint8Array;
  warWeariness: number;
  discontent: number;
  pollution: number;
  cohesion: number;
  purpose: string | null;
  modifiers: Modifier[];
  artifacts: string[];
  projects: Record<string, number>;
  legacies: Record<string, number>;
  stats: CivStats;
  /** AI bookkeeping */
  ai: { targets: Record<number, number>; grudges: Record<number, number>; settleTarget: number; lastWarTurn: number; mood: string };
  usedNames: string[];
  startTile: number;
  homeRegion: number;
  vassalOf: number;
}

export interface CivStats {
  citiesFounded: number;
  citiesLost: number;
  citiesCaptured: number;
  citiesRazed: number;
  warsWon: number;
  warsLost: number;
  warsFought: number;
  unitsLost: number;
  unitsKilled: number;
  casualties: number;
  famines: number;
  plagues: number;
  disasters: number;
  treaties: number;
  betrayals: number;
  wondersBuilt: number;
  ruinsExplored: number;
  peakPop: number;
  peakCities: number;
  revolutions: number;
  firstContact: number;
}

export type Focus = 'balanced' | 'food' | 'production' | 'science' | 'wealth' | 'culture';

export interface BuildItem {
  kind: 'unit' | 'building' | 'wonder' | 'project';
  id: string;
}

export interface CityYields {
  food: number;
  foodNet: number;
  prod: number;
  sci: number;
  gold: number;
  cult: number;
  happy: number;
  unhappy: number;
  mood: number;
  defense: number;
}

export interface City {
  id: number;
  name: string;
  civId: number;
  founderId: number;
  tile: number;
  founded: number;
  size: number;
  food: number;
  prod: number;
  focus: Focus;
  buildings: string[];
  wonders: string[];
  build: BuildItem | null;
  manual: boolean;
  culture: number;
  hp: number;
  peakSize: number;
  unrest: number;
  resistance: number;
  improveStore: number;
  worked: number[];
  y: CityYields;
  lastHit: { cause: string; turn: number } | null;
  starving: number;
  capturedTurn: number;
  popSeed: number;
}

export type Order =
  | { kind: 'goto'; target: number }
  | { kind: 'explore' }
  | { kind: 'fortify' }
  | { kind: 'sleep' }
  | { kind: 'settle'; target: number };

export interface Unit {
  id: number;
  civId: number;
  type: string;
  tile: number;
  hp: number;
  moves: number;
  order: Order | null;
  fortified: number;
  veteran: boolean;
  wins: number;
  acted: boolean;
  born: number;
}

export interface Leader {
  id: number;
  civId: number;
  name: string;
  epithet: string;
  title: string;
  gender: 'f' | 'm';
  born: number;
  rose: number;
  ended: number;
  endCause: string;
  traits: LeaderTraitId[];
  deathAge: number;
  gov: string;
  ach: {
    citiesFounded: number;
    wonders: number;
    techs: number;
    warsWon: number;
    warsLost: number;
    conquered: number;
    citiesLost: number;
    treaties: number;
    disasters: number;
    reforms: number;
  };
  /** Short phrases: "Founded Tal", "Discovered Irrigation". */
  deeds: string[];
  reelected: number;
}

export interface War {
  id: number;
  name: string;
  attackers: number[];
  defenders: number[];
  aggressor: number;
  cause: string;
  start: number;
  end: number;
  battles: number;
  casualties: Record<number, number>;
  score: Record<number, number>;
  captures: { city: string; from: number; to: number; turn: number }[];
  outcome: string;
  frontTile: number;
}

export interface Religion {
  id: number;
  name: string;
  founder: number;
  founded: number;
  tenet: string;
}

export interface HistoryEvent {
  turn: number;
  kind: string;
  /** 1 minor, 2 notable, 3 major */
  imp: number;
  civs: number[];
  text: string;
  tile: number;
}

export interface Decision {
  id: number;
  civId: number;
  event: string;
  turn: number;
  params: Record<string, unknown>;
}

export interface Notice {
  id: number;
  turn: number;
  text: string;
  tile: number;
  tone: 'info' | 'good' | 'bad' | 'war' | 'history';
}

export interface StatSample {
  turn: number;
  /** per civ id: [population, territory, cities, techs, culture, power] */
  civs: Record<number, [number, number, number, number, number, number]>;
}

export interface GameState {
  version: number;
  settings: Settings;
  turn: number;
  map: WorldMap;
  regions: Region[];
  rivers: River[];
  wonders: NaturalWonder[];
  ruins: Ruin[];
  civs: Civ[];
  cities: Record<number, City>;
  units: Record<number, Unit>;
  leaders: Leader[];
  wars: War[];
  religions: Religion[];
  worldWonders: Record<string, { civId: number; cityId: number; turn: number }>;
  history: HistoryEvent[];
  decisions: Decision[];
  notices: Notice[];
  samples: StatSample[];
  nextId: number;
  rng: number;
  playerId: number;
  globalPollution: number;
  firsts: Record<string, number>;
  ended: boolean;
}
