// The whole persistent game state as plain JSON-friendly data. Everything the
// save file holds is here; runtime-only things (meshes, AI timers) are not.

import type { Appearance } from '../data/characters';
import type { SpeciesId } from '../data/species';
import { SPECIES, speciesName } from '../data/species';

/** Orbs a new ranger starts with, and what resting at the campfire tops you up to. */
export const STARTING_ORBS = 12;
import { PLAYER_START } from '../data/world';

/** 2: catching replaces bonding; quests, lumens, items and prisms are gone. */
export const SAVE_VERSION = 2;

export type CameraMode = 'third' | 'first';
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'mist';

/** A creature in your collection (saved as "bonded" for compatibility with older saves). */
export interface BondedCreature {
  uid: string;
  species: SpeciesId;
  variant: string | null;
  name: string;
  /** Wild spawn it came from, or 'starter'. */
  origin: string;
  /** Day it was caught. */
  bondedDay: number;
  /** 0..100 friendship; grows while it travels with you. */
  friendship: number;
}

export interface WildMemory {
  trust: number;
  observed: boolean;
  /** Old saves: bonded wild creatures never came back. Kept false now. */
  bonded: boolean;
  /** Rolled when the creature appears (again after each catch). */
  variant: string | null;
  fedAt: number;
  /** Clock hour it was caught; the spawn stays empty for a day. */
  caughtAt: number | null;
  /** How many times this spawn has been caught (re-rolls the variant). */
  gen: number;
}

export interface SpeciesRecord {
  seen: boolean;
  observed: number;
  /** How many you have caught. */
  bonded: number;
}

export interface GameState {
  version: number;
  createdAt: number;
  savedAt: number;
  playSeconds: number;
  appearance: Appearance;
  starter: SpeciesId;
  player: { x: number; y: number; z: number; yaw: number; camera: CameraMode; pitch: number };
  /** Hours since the start of day 1 (so 33.5 is day 2, 09:30). */
  clock: number;
  weather: { kind: WeatherKind; until: number };
  /** Lumi orbs to throw. */
  orbs: number;
  bonded: BondedCreature[];
  active: string | null;
  companionOut: boolean;
  wild: Record<string, WildMemory>;
  species: Record<SpeciesId, SpeciesRecord>;
  /** Interactable or blossom id → clock hour it was used/collected/opened. */
  done: Record<string, number>;
  discovered: string[];
  flags: Record<string, number>;
}

export function newState(appearance: Appearance, starter: SpeciesId, starterName: string): GameState {
  const species = Object.fromEntries(SPECIES.map((s) => [s.id, { seen: false, observed: 0, bonded: 0 }])) as Record<SpeciesId, SpeciesRecord>;
  species[starter] = { seen: true, observed: 1, bonded: 1 };
  const starterDef = SPECIES.find((s) => s.id === starter)!;
  void starterDef;
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    createdAt: now,
    savedAt: now,
    playSeconds: 0,
    appearance,
    starter,
    player: { x: PLAYER_START.at[0], y: 4, z: PLAYER_START.at[1], yaw: PLAYER_START.facing, camera: 'third', pitch: -0.18 },
    clock: 9,
    weather: { kind: 'clear', until: 14 },
    orbs: STARTING_ORBS,
    bonded: [{ uid: 'starter', species: starter, variant: null, name: starterName || speciesName(starter), origin: 'starter', bondedDay: 1, friendship: 40 }],
    active: 'starter',
    companionOut: true,
    wild: {},
    species,
    done: {},
    discovered: ['outpost'],
    flags: {},
  };
}

export function day(state: GameState): number {
  return Math.floor(state.clock / 24) + 1;
}

export function hourOfDay(state: GameState): number {
  return ((state.clock % 24) + 24) % 24;
}

export function isNight(hour: number): boolean {
  return hour >= 20 || hour < 5;
}

export function clockLabel(clock: number): string {
  const h = ((clock % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
