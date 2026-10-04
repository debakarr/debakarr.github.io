// Civilizations: observed, not controlled. Each has a personality, its own
// order of late technologies, and a risk of collapse at the end of every era
// (the Great Filter), shaped by that personality. Collapse means a dark age
// or extinction. Times inside a civilization are in years.

import type { Rng } from '../../shared/rng';
import { adjective, civTitle } from './names';

export interface CivTraits {
  science: number;
  military: number;
  trade: number;
  cooperation: number;
  religion: number;
  exploration: number;
  industry: number;
  ecology: number;
}

export const CIV_TRAITS: (keyof CivTraits)[] = ['science', 'military', 'trade', 'cooperation', 'religion', 'exploration', 'industry', 'ecology'];
export const CIV_TRAIT_LABEL: Record<keyof CivTraits, string> = {
  science: 'Science',
  military: 'Military',
  trade: 'Trade',
  cooperation: 'Cooperation',
  religion: 'Religion',
  exploration: 'Exploration',
  industry: 'Industry',
  ecology: 'Ecology',
};

export type CivStatus = 'rising' | 'golden' | 'dark' | 'expanding' | 'quiet' | 'extinct' | 'silent' | 'ascended' | 'merged';

export interface Civ {
  id: number;
  name: string;
  species: string;
  adj: string;
  hue: number;
  planet: number;
  star: number;
  lineage: number;
  born: number;
  /** Sim time (Myr) this civilization was last advanced to. */
  at: number;
  eras: string[];
  era: number;
  progress: number;
  peak: number;
  pop: number;
  traits: CivTraits;
  status: CivStatus;
  colonies: number[];
  stars: number[];
  watcher: number;
  watcherStage: number;
  protectedUntil: number;
  contacts: number[];
  ended: number;
  darkAges: number;
  /** Years spent in the current era. */
  eraYears: number;
  /** How far its ships reach (galaxy units). */
  reach: number;
  log: [number, string][];
}

const BASE_ERAS = ['Stone', 'Agriculture', 'Metallurgy', 'Industry', 'Computing', 'Nuclear', 'Spaceflight'];
const BRANCH = ['AI', 'Fusion', 'Biotech'];
const LATE = ['Interstellar', 'Dyson', 'Galactic'];

export const ERA_INDEX = {
  agriculture: 1,
  industry: 3,
  computing: 4,
  nuclear: 5,
  spaceflight: 6,
  interstellar: 10,
  dyson: 11,
  galactic: 12,
} as const;

const ERA_YEARS: Record<string, number> = {
  Stone: 9000,
  Agriculture: 4500,
  Metallurgy: 3000,
  Industry: 600,
  Computing: 250,
  Nuclear: 200,
  Spaceflight: 500,
  AI: 800,
  Fusion: 1500,
  Biotech: 1000,
  Interstellar: 60000,
  Dyson: 300000,
  Galactic: Infinity,
};

const ERA_ENTER: Record<string, string> = {
  Agriculture: 'learned to farm and settled the river valleys',
  Metallurgy: 'began working bronze, then iron',
  Industry: 'entered its Industrial Era after discovering efficient combustion',
  Computing: 'built its first thinking machines',
  Nuclear: 'split the atom',
  Spaceflight: 'reached orbit',
  AI: 'created artificial minds',
  Fusion: 'tamed fusion power',
  Biotech: 'learned to rewrite its own genome',
  Interstellar: 'launched its first starship',
  Dyson: 'began building a Dyson swarm around its star',
  Galactic: 'spread across the galaxy',
};

/** Base chance of collapse at the end of each era, and what it looks like. */
const RISK: Record<string, { p: number; war: number; causes: string[] }> = {
  Stone: { p: 0.03, war: 0, causes: ['a long ice age', 'famine', 'a supervolcano'] },
  Agriculture: { p: 0.06, war: 0.3, causes: ['famine', 'plague', 'a great drought'] },
  Metallurgy: { p: 0.08, war: 0.7, causes: ['endless wars', 'plague', 'the fall of its empires'] },
  Industry: { p: 0.14, war: 0.5, causes: ['resource exhaustion', 'a world war', 'revolution'] },
  Computing: { p: 0.05, war: 0.2, causes: ['an information collapse', 'runaway climate change'] },
  Nuclear: { p: 0.4, war: 0.9, causes: ['nuclear war', 'a nuclear winter'] },
  Spaceflight: { p: 0.12, war: 0.5, causes: ['wars over the planets', 'orbital debris and resource wars'] },
  AI: { p: 0.35, war: 0.2, causes: ['an AI catastrophe', 'its own machines'] },
  Fusion: { p: 0.07, war: 0.3, causes: ['a fusion accident', 'long stagnation'] },
  Biotech: { p: 0.3, war: 0.3, causes: ['an engineered plague', 'a gene war'] },
  Interstellar: { p: 0.15, war: 0.7, causes: ['a civil war between worlds', 'resource exhaustion'] },
  Dyson: { p: 0, war: 0, causes: ['the dimming of its star'] },
};

const POP = [1e6, 2e7, 1.5e8, 1.2e9, 4e9, 6e9, 8e9, 9e9, 1e10, 1.1e10, 1.2e10, 1.5e10, 2e10];

export function newCiv(id: number, species: string, planet: number, star: number, lineage: number, t: number, coop: number, rng: Rng): Civ {
  const r = () => rng.float(0.1, 0.95);
  const traits: CivTraits = {
    science: r(),
    military: r(),
    trade: r(),
    cooperation: Math.min(1, Math.max(0.05, coop * 0.6 + rng.float(0, 0.45))),
    religion: r(),
    exploration: r(),
    industry: r(),
    ecology: r(),
  };
  // Personality picks the order of the late technologies.
  const weight: Record<string, number> = { AI: traits.science + rng.float(0, 0.6), Fusion: traits.industry + rng.float(0, 0.6), Biotech: traits.ecology + rng.float(0, 0.6) };
  const branch = [...BRANCH].sort((a, b) => weight[b] - weight[a]);
  const adj = adjective(species);
  return {
    id,
    name: civTitle(adj, traits),
    species,
    adj,
    hue: rng.int(360),
    planet,
    star,
    lineage,
    born: t,
    at: t,
    eras: [...BASE_ERAS, ...branch, ...LATE],
    era: 0,
    progress: 0,
    peak: 0,
    pop: POP[0] * rng.float(0.5, 2),
    traits,
    status: 'rising',
    colonies: [],
    stars: [star],
    watcher: 0,
    watcherStage: 0,
    protectedUntil: -1,
    contacts: [],
    ended: -1,
    darkAges: 0,
    eraYears: 0,
    reach: 0,
    log: [],
  };
}

export function alive(c: Civ): boolean {
  return c.ended < 0;
}

export function eraName(c: Civ): string {
  return c.eras[c.era];
}

export function describePersonality(t: CivTraits): string {
  const top = [...CIV_TRAITS].sort((a, b) => t[b] - t[a]).slice(0, 2);
  const words: Record<keyof CivTraits, string> = {
    science: 'curious',
    military: 'militaristic',
    trade: 'mercantile',
    cooperation: 'peaceful',
    religion: 'deeply religious',
    exploration: 'restless',
    industry: 'industrious',
    ecology: 'careful with their world',
  };
  return `${words[top[0]].charAt(0).toUpperCase()}${words[top[0]].slice(1)} and ${words[top[1]]}.`;
}

function eraDuration(c: Civ, era: string): number {
  return ERA_YEARS[era] * (1.35 - c.traits.science * 0.7);
}

function risk(c: Civ, era: string, filter: number): number {
  const r = RISK[era];
  if (!r) return 0;
  const t = c.traits;
  let p = r.p;
  p *= 1 + r.war * (t.military - 0.5) * 1.4;
  p *= 1 - (t.cooperation - 0.5) * 0.9;
  if (era === 'Industry' || era === 'Computing' || era === 'Interstellar') p *= 1 - (t.ecology - 0.5) * 0.8;
  return Math.min(0.85, Math.max(0.01, p * filter));
}

export type CivEvent =
  | { kind: 'era'; t: number; era: string; text: string }
  | { kind: 'golden'; t: number; text: string }
  | { kind: 'dark'; t: number; text: string }
  | { kind: 'renaissance'; t: number; text: string }
  | { kind: 'averted'; t: number; text: string }
  | { kind: 'quiet'; t: number; text: string }
  | { kind: 'extinct'; t: number; text: string };

/**
 * Advance a civilization by `years`, era by era. `t0` is the sim time (Myr)
 * at the start. Collapse is rolled at the end of each era.
 */
export function advanceCiv(c: Civ, years: number, t0: number, filter: number, rng: Rng, out: CivEvent[]): void {
  let used = 0;
  while (used < years && alive(c)) {
    const era = eraName(c);
    const dur = eraDuration(c, era);
    if (!isFinite(dur)) {
      c.eraYears += years - used;
      return;
    }
    const need = (1 - c.progress) * dur;
    if (years - used < need) {
      c.progress += (years - used) / dur;
      c.eraYears += years - used;
      return;
    }
    used += need;
    c.eraYears += need;
    const t = t0 + used / 1e6;
    // A Dyson swarm only becomes galactic with an empire to match, and
    // quiet civilizations never build one at all.
    if ((era === 'Dyson' && c.colonies.length < 24) || (era === 'Interstellar' && c.status === 'quiet')) {
      c.progress = 1;
      c.eraYears += years - used;
      return;
    }
    c.progress = 0;
    if (rng.chance(risk(c, era, filter))) {
      collapse(c, era, t, filter, rng, out);
      continue;
    }
    c.era++;
    c.eraYears = 0;
    const next = eraName(c);
    if (c.status === 'dark' && c.era > c.peak) {
      c.status = 'rising';
      out.push({ kind: 'renaissance', t, text: `The ${c.adj} dark age ended: they surpassed everything their ancestors knew.` });
    }
    c.peak = Math.max(c.peak, c.era);
    if (c.era >= ERA_INDEX.interstellar && c.status !== 'dark') c.status = 'expanding';
    out.push({ kind: 'era', t, era: next, text: `The ${c.name} ${ERA_ENTER[next] ?? `entered the ${next} era`}.` });
    // Some decide that the stars are enough, and stop growing.
    if (next === 'Interstellar' && (c.traits.exploration < 0.42 || c.traits.ecology + c.traits.cooperation > 1.35)) {
      c.status = 'quiet';
      out.push({ kind: 'quiet', t, text: `The ${c.species} chose to stay small and quiet among a few nearby stars.` });
    }
    if (c.status === 'rising' && c.traits.trade + c.traits.cooperation > 1.25 && rng.chance(0.35)) {
      c.status = 'golden';
      out.push({ kind: 'golden', t, text: `A golden age began for the ${c.species}: trade, art and peace across their world.` });
    } else if (c.status === 'golden' && rng.chance(0.5)) c.status = 'rising';
  }
}

function collapse(c: Civ, era: string, t: number, filter: number, rng: Rng, out: CivEvent[]): void {
  const r = RISK[era];
  const warW = c.traits.military;
  const causes = r.causes;
  const cause = r.war > 0.5 && warW > 0.6 ? causes[0] : rng.pick(causes);
  if (c.protectedUntil >= t) {
    c.protectedUntil = -1;
    c.watcher += 0.3;
    out.push({ kind: 'averted', t, text: `The ${c.species} should have fallen to ${cause}. Something intervened.` });
    c.era++;
    c.peak = Math.max(c.peak, c.era);
    return;
  }
  const late = c.era >= ERA_INDEX.nuclear;
  let extinct = (late ? 0.7 : 0.2) * Math.min(1.4, filter) + c.darkAges * 0.1;
  if (c.colonies.length >= 3) extinct *= 0.15;
  if (rng.chance(extinct)) {
    c.ended = t;
    c.status = 'extinct';
    out.push({ kind: 'extinct', t, text: `The ${c.name} was destroyed by ${cause}.` });
    return;
  }
  const back = 1 + rng.int(Math.min(3, Math.max(1, c.era)));
  c.era = Math.max(0, c.era - back);
  c.status = 'dark';
  c.darkAges++;
  c.pop *= 0.25;
  c.eraYears = 0;
  out.push({ kind: 'dark', t, text: `${cause.charAt(0).toUpperCase()}${cause.slice(1)} plunged the ${c.species} into a dark age; they fell back to the ${eraName(c)} era.` });
}

/** Population drifts toward what the era and colonies support. */
export function updatePopulation(c: Civ, dtYears: number): void {
  const target = POP[Math.min(POP.length - 1, c.era)] * (1 + c.colonies.length * 0.45) * (c.status === 'dark' ? 0.4 : 1);
  const k = 1 - Math.exp(-dtYears / 2000);
  c.pop += (target - c.pop) * k;
}

export function civLog(c: Civ, t: number, text: string): void {
  c.log.push([t, text]);
  if (c.log.length > 60) c.log.splice(0, c.log.length - 60);
}

export function artifactFor(era: number): string {
  if (era <= 2) return 'Stone tablets';
  if (era <= 4) return 'A buried archive';
  if (era <= 6) return 'A dead satellite';
  if (era <= 9) return 'A dormant AI';
  return 'A broken megastructure';
}
