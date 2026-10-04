// The dials a universe is created with, and the challenge universes built
// from them. Effects are deliberately only hinted at in the UI.

import { hashString } from '../../shared/rng';

/** 0 = low, 1 = normal, 2 = high. */
export type Dial = 0 | 1 | 2;

export interface Params {
  matter: Dial;
  gravity: Dial;
  expansion: Dial;
  chaos: Dial;
  /** Multiplier on the chance that life starts. */
  life: number;
  /** Multiplier on the climb from tool users to civilization. */
  intel: number;
  /** Multiplier on collapse risks (the Great Filter). */
  filter: number;
  /** Fast-forward this many million years at creation. */
  startAge: number;
  /** Seed several living worlds close together. */
  contact: boolean;
}

export const DEFAULT_PARAMS: Params = { matter: 1, gravity: 1, expansion: 1, chaos: 1, life: 1, intel: 1, filter: 1, startAge: 0, contact: false };

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  params: Params;
}

export const PRESETS: Preset[] = [
  { id: 'standard', name: 'Standard', blurb: 'A universe like ours, more or less.', params: DEFAULT_PARAMS },
  { id: 'empty', name: 'Empty', blurb: 'Very little matter. Every star counts.', params: { ...DEFAULT_PARAMS, matter: 0, expansion: 2 } },
  { id: 'chaos', name: 'Chaos', blurb: 'Clumpy gas, giant stars, constant supernovae.', params: { ...DEFAULT_PARAMS, chaos: 2, gravity: 2 } },
  { id: 'life', name: 'Life everywhere', blurb: 'Life starts wherever it possibly can.', params: { ...DEFAULT_PARAMS, life: 3 } },
  { id: 'minds', name: 'Intelligence', blurb: 'Minds and civilizations arise quickly.', params: { ...DEFAULT_PARAMS, life: 1.5, intel: 1.8 } },
  { id: 'filter', name: 'Great Filter', blurb: 'Civilizations tend to collapse.', params: { ...DEFAULT_PARAMS, life: 1.5, intel: 1.6, filter: 1.8 } },
  { id: 'ancient', name: 'Ancient', blurb: 'Begin ten billion years in.', params: { ...DEFAULT_PARAMS, startAge: 10000 } },
  { id: 'contact', name: 'Contact', blurb: 'A crowded, metal-rich cluster of close neighbours.', params: { ...DEFAULT_PARAMS, life: 1, intel: 1.2, contact: true } },
];

export const DIALS: { key: 'matter' | 'gravity' | 'expansion' | 'chaos'; label: string; options: [string, string, string]; hint: string }[] = [
  { key: 'matter', label: 'Matter', options: ['Sparse', 'Balanced', 'Dense'], hint: 'How much there is to work with.' },
  { key: 'gravity', label: 'Gravity', options: ['Weak', 'Normal', 'Strong'], hint: 'How hard things pull together.' },
  { key: 'expansion', label: 'Expansion', options: ['Slow', 'Normal', 'Fast'], hint: 'How quickly space stretches.' },
  { key: 'chaos', label: 'Distribution', options: ['Uniform', 'Natural', 'Chaotic'], hint: 'How evenly matter is spread.' },
];

/** Challenge goals; each is completed by a discovery. */
export const GOALS: { id: string; text: string }[] = [
  { id: 'goldilocks', text: 'Create a habitable planet' },
  { id: 'intelligence', text: 'Evolve intelligence' },
  { id: 'interstellar', text: 'Reach another star' },
  { id: 'survivor', text: 'Have life survive a nearby supernova' },
  { id: 'two-civs', text: 'Have two civilizations at once' },
  { id: 'dyson', text: 'See a Dyson swarm built' },
];

export function randomUniverseSeed(): string {
  const n = Math.floor(Math.random() * 900000) + 100000;
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `TU-${n}-${letter}`;
}

/** Everyone gets the same universe and goal on the same day. */
export function dailyUniverse(date = new Date()): { seed: string; preset: Preset; goal: (typeof GOALS)[number] } {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const h = hashString(`daily:${ymd}`);
  const goal = GOALS[h % GOALS.length];
  // Pick a preset that makes the goal reachable in a sitting.
  const presetId = goal.id === 'goldilocks' ? 'standard' : goal.id === 'survivor' ? 'chaos' : goal.id === 'two-civs' ? 'contact' : 'minds';
  return { seed: `TU-${ymd}-D`, preset: PRESETS.find((p) => p.id === presetId)!, goal };
}
