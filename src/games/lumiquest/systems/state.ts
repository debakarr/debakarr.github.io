// The whole persistent game state as plain JSON-friendly data. Everything the
// save file holds is here; runtime-only things (meshes, AI timers) are not.

import type { Appearance } from '../data/characters';
import type { SpeciesId } from '../data/species';
import { SPECIES } from '../data/species';
import { PLAYER_START } from '../data/world';

export const SAVE_VERSION = 1;

export type CameraMode = 'third' | 'first';
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'mist';
export type QuestStatus = 'locked' | 'active' | 'done';

export interface BondedCreature {
  uid: string;
  species: SpeciesId;
  variant: string | null;
  name: string;
  /** Wild spawn it came from, or 'starter'. */
  origin: string;
  bondedDay: number;
  /** 0..100 friendship; grows by feeding and adventuring together. */
  friendship: number;
}

export interface WildMemory {
  trust: number;
  observed: boolean;
  bonded: boolean;
  /** Rolled once, the first time the creature is met. */
  variant: string | null;
  /** Clock hour of the last time it was fed (for cooldowns). */
  fedAt: number;
}

export interface SpeciesRecord {
  seen: boolean;
  observed: number;
  bonded: number;
}

export interface QuestState {
  status: QuestStatus;
  stage: number;
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
  lumens: number;
  inventory: Record<string, number>;
  bonded: BondedCreature[];
  active: string | null;
  companionOut: boolean;
  wild: Record<string, WildMemory>;
  species: Record<SpeciesId, SpeciesRecord>;
  quests: Record<string, QuestState>;
  tracked: string;
  /** Interactable id → clock hour it was used/collected/opened. */
  done: Record<string, number>;
  /** Prism facings, 0..7. */
  prisms: number[];
  discovered: string[];
  flags: Record<string, number>;
}

export function newState(appearance: Appearance, starter: SpeciesId, starterName: string): GameState {
  const species = Object.fromEntries(SPECIES.map((s) => [s.id, { seen: false, observed: 0, bonded: 0 }])) as Record<SpeciesId, SpeciesRecord>;
  species[starter] = { seen: true, observed: 1, bonded: 1 };
  const starterDef = SPECIES.find((s) => s.id === starter)!;
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
    lumens: 20,
    inventory: { device: 1, [starterDef.likes]: 3, sunberry: starter === 'flamkit' ? 5 : 2 },
    bonded: [{ uid: 'starter', species: starter, variant: null, name: starterName || starterDef.name, origin: 'starter', bondedDay: 1, friendship: 40 }],
    active: 'starter',
    companionOut: true,
    wild: {},
    species,
    quests: { beacon: { status: 'active', stage: 0 } },
    tracked: 'beacon',
    done: {},
    prisms: [0, 6, 1],
    discovered: ['outpost'],
    flags: {},
  };
}

export function count(state: GameState, item: string): number {
  return state.inventory[item] ?? 0;
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
