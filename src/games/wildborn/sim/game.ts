// Wildborn's simulation: creatures with life histories, a world clock with
// weather, exploration, befriending, raising, life-driven evolution, breeding
// with genetics and lineage, research quests and saves. DOM-free and seeded.

import { Rng, hashString } from '../../shared/rng';
import {
  BIOMES,
  ITEMS,
  PERSONALITY,
  SPECIES,
  SPECIES_BY_ID,
  type BiomeId,
  type Exposure,
  type FamilyId,
  type PersonalityKey,
  type Species,
} from '../data/species';

export type Weather = 'sun' | 'rain' | 'storm' | 'fog';
export const WEATHERS: Weather[] = ['sun', 'rain', 'storm', 'fog'];
export const WEATHER_LABEL: Record<Weather, string> = { sun: 'Sun', rain: 'Rain', storm: 'Storm', fog: 'Fog' };

export type GuideState = 'unknown' | 'seen' | 'observed' | 'captured';
export type Variant = 'crystal' | 'golden' | 'void';
export type EvolutionBranch = NonNullable<Species['branches']>[number];

export interface LifeEvent {
  day: number;
  kind: 'born' | 'caught' | 'battle' | 'evolve' | 'breed' | 'explore' | 'bond' | 'milestone';
  text: string;
}

export interface Genome {
  vigor: number;
  power: number;
  guard: number;
  speed: number;
  size: number;
  glow: number;
}

export interface Creature {
  id: string;
  speciesId: string;
  /** The species it started as (lineage display). */
  bornSpeciesId: string;
  name: string;
  level: number;
  xp: number;
  hp: number;
  /** Days lived. */
  age: number;
  personality: Record<PersonalityKey, number>;
  bond: number;
  trust: number;
  stress: number;
  exposures: Record<Exposure, number>;
  abilities: string[];
  genome: Genome;
  generation: number;
  parents: string[];
  children: string[];
  origin: BiomeId | 'village';
  bornDay: number;
  history: LifeEvent[];
  variant: Variant | null;
}

export interface Stats {
  maxHp: number;
  power: number;
  guard: number;
  speed: number;
}

export interface Quest {
  id: string;
  text: string;
  kind: 'observe' | 'capture' | 'fragment' | 'win' | 'explore' | 'evolve';
  need: number;
  have: number;
  done: boolean;
  reward: string;
}

export interface Egg {
  id: string;
  family: FamilyId;
  speciesId: string;
  parentA: string;
  parentB: string;
  genome: Genome;
  personality: Record<PersonalityKey, number>;
  generation: number;
  variant: Variant | null;
  stepsLeft: number;
  laidDay: number;
}

export interface LogEntry {
  day: number;
  hour: number;
  kind: 'explore' | 'bond' | 'battle' | 'village' | 'system' | 'auto' | 'quest' | 'evolve' | 'breed';
  text: string;
}

export interface GameState {
  seed: string;
  day: number;
  hour: number;
  weather: Weather;
  region: BiomeId | 'village';
  team: Creature[];
  reserve: Creature[];
  items: Record<string, number>;
  guide: Record<string, GuideState>;
  quests: Quest[];
  achievements: Record<string, boolean>;
  /** Base species id -> evolved branches the player has discovered. */
  discovered: Record<string, string[]>;
  eggs: Egg[];
  log: LogEntry[];
  counts: Record<string, number>;
  /** Actions taken; eggs hatch after a few. */
  steps: number;
  /** The creature currently being observed in the wild, if any. */
  wild: Creature | null;
}

export interface ExploreOutcome {
  kind: 'encounter' | 'resource' | 'fragment' | 'event' | 'nothing';
  text: string;
  item?: string;
  count?: number;
  wild?: Creature;
}

const EXPOSURES: Exposure[] = ['thermal', 'aquatic', 'mineral', 'organic', 'night', 'storm', 'wins', 'losses', 'explore', 'play', 'ruins'];

export function emptyExposures(): Record<Exposure, number> {
  return Object.fromEntries(EXPOSURES.map((e) => [e, 0])) as Record<Exposure, number>;
}

function emptyPersonality(rng: Rng): Record<PersonalityKey, number> {
  return Object.fromEntries(PERSONALITY.map((p) => [p, rng.range(20, 80)])) as Record<PersonalityKey, number>;
}

export function makeGenome(rng: Rng): Genome {
  return {
    vigor: rng.float(0.35, 0.75),
    power: rng.float(0.35, 0.75),
    guard: rng.float(0.35, 0.75),
    speed: rng.float(0.35, 0.75),
    size: rng.float(0.3, 0.8),
    glow: rng.float(0.2, 0.9),
  };
}

export function statsOf(c: Creature): Stats {
  const s = SPECIES_BY_ID[c.speciesId];
  const grow = 1 + (c.level - 1) * 0.11;
  const g = c.genome;
  const mut = c.variant;
  const vHp = mut === 'crystal' ? 1.12 : mut === 'void' ? 0.94 : mut === 'golden' ? 1.06 : 1;
  const vPow = mut === 'golden' ? 1.14 : mut === 'crystal' ? 0.92 : 1;
  const vGuard = mut === 'crystal' ? 1.18 : mut === 'golden' ? 0.94 : 1;
  const vSpeed = mut === 'void' ? 1.16 : mut === 'crystal' ? 0.9 : 1;
  return {
    maxHp: Math.round(s.base.hp * (0.82 + g.vigor * 0.36) * grow * vHp),
    power: Math.round(s.base.power * (0.82 + g.power * 0.36) * grow * vPow),
    guard: Math.round(s.base.guard * (0.82 + g.guard * 0.36) * grow * vGuard),
    speed: Math.round(s.base.speed * (0.82 + g.speed * 0.36) * grow * vSpeed),
  };
}

export function xpToNext(level: number): number {
  return Math.round(18 + level * 6 + level * level * 2.5);
}

export function personalityWords(c: Creature): string[] {
  const sorted = [...PERSONALITY].sort((a, b) => c.personality[b] - c.personality[a]);
  return sorted.slice(0, 3).map((p) => p[0].toUpperCase() + p.slice(1));
}

/** The three strongest affinities in a creature's life, for display. */
export function lifeTags(c: Creature): string[] {
  return [...EXPOSURES]
    .filter((e) => c.exposures[e] > 0)
    .sort((a, b) => c.exposures[b] - c.exposures[a])
    .slice(0, 3);
}

export function evolutionScore(c: Creature, branch: EvolutionBranch): number {
  let sum = 0;
  let weight = 0;
  for (const [key, w] of Object.entries(branch.drivers)) {
    const v =
      key in PERSONALITY
        ? (c.personality[key as PersonalityKey] ?? 0) / 100
        : Math.min(1.15, (c.exposures[key as Exposure] ?? 0) / 8);
    sum += (w as number) * v;
    weight += Math.abs(w as number);
  }
  return weight > 0 ? sum / weight : 0;
}

export interface EvolutionResult {
  eligible: boolean;
  reason: string;
  scores: { to: string; score: number; hint: string }[];
  best: string | null;
  threshold: number;
}

export const EVOLUTION_THRESHOLD = 0.42;
export const EVOLUTION_LEVEL = 8;

export function evaluateEvolution(c: Creature): EvolutionResult {
  const sp = SPECIES_BY_ID[c.speciesId];
  const scores = (sp.branches ?? []).map((b) => ({ to: b.to, score: evolutionScore(c, b), hint: b.hint }));
  if (!sp.branches) return { eligible: false, reason: 'Fully evolved.', scores, best: null, threshold: EVOLUTION_THRESHOLD };
  if (c.level < EVOLUTION_LEVEL)
    return { eligible: false, reason: `Needs more life experience (level ${EVOLUTION_LEVEL}).`, scores, best: null, threshold: EVOLUTION_THRESHOLD };
  const best = [...scores].sort((a, b) => b.score - a.score)[0];
  const ok = best && best.score >= EVOLUTION_THRESHOLD;
  return {
    eligible: true,
    reason: ok ? `${SPECIES_BY_ID[best.to].name} is taking shape.` : 'No path is strong enough yet. Its life decides.',
    scores,
    best: ok ? best.to : null,
    threshold: EVOLUTION_THRESHOLD,
  };
}

export function guideOf(state: GameState, speciesId: string): GuideState {
  return state.guide[speciesId] ?? 'unknown';
}

export function allCreatures(state: GameState): Creature[] {
  return [...state.team, ...state.reserve];
}

export function findCreature(state: GameState, id: string): Creature | null {
  return allCreatures(state).find((c) => c.id === id) ?? null;
}

function creatureSerial(state: GameState): string {
  const n = state.counts.serial = (state.counts.serial ?? 0) + 1;
  return `#${(hashString(state.seed) % 46656).toString(36).toUpperCase().padStart(3, '0')}${n.toString(36).toUpperCase().padStart(3, '0')}`;
}

export class Game {
  state: GameState;
  rng: Rng;

  constructor(state: GameState, rngState?: number) {
    this.state = state;
    this.rng = new Rng(rngState ?? hashString(state.seed));
  }

  static new(seed: string): Game {
    const rng = new Rng(hashString(seed));
    const state: GameState = {
      seed,
      day: 1,
      hour: 8,
      weather: 'sun',
      region: 'greenwood',
      team: [],
      reserve: [],
      items: { berry: 4, salve: 1, fragment: 0, seed: 2 },
      guide: Object.fromEntries(SPECIES.map((s) => [s.id, 'unknown' as GuideState])),
      quests: [],
      achievements: {},
      discovered: {},
      eggs: [],
      log: [],
      counts: {},
      steps: 0,
      wild: null,
    };
    const game = new Game(state, rng.s);
    game.state.quests = game.rollQuests();
    game.log('system', 'You arrive in Greenwood with an empty team and a researcher waiting at the village.');
    return game;
  }

  serialize(): string {
    return JSON.stringify({ v: 1, rngS: this.rng.s, state: this.state });
  }

  static deserialize(json: string): Game {
    const data = JSON.parse(json) as { v: number; rngS: number; state: GameState };
    return new Game(data.state, data.rngS);
  }

  log(kind: LogEntry['kind'], text: string): void {
    this.state.log.push({ day: this.state.day, hour: this.state.hour, kind, text });
    if (this.state.log.length > 240) this.state.log.splice(0, this.state.log.length - 240);
  }

  // --- time ---------------------------------------------------------------------------------

  /** Let time pass: hours, day rollover, weather, ageing, recovery, eggs. */
  advance(hours: number): void {
    const s = this.state;
    s.hour += hours;
    while (s.hour >= 24) {
      s.hour -= 24;
      s.day += 1;
      s.weather = this.rng.weighted<Weather>([
        ['sun', 0.42],
        ['rain', 0.26],
        ['storm', 0.14],
        ['fog', 0.18],
      ]) ?? 'sun';
      for (const c of allCreatures(s)) {
        c.age += 1;
        c.stress = Math.max(0, c.stress - 4);
        if (s.region === 'village') c.hp = Math.min(statsOf(c).maxHp, c.hp + Math.round(statsOf(c).maxHp * 0.25));
      }
      this.log('system', `Day ${s.day}: ${WEATHER_LABEL[s.weather].toLowerCase()} over the ${s.region === 'village' ? 'village' : BIOMES[s.region].name}.`);
    }
    this.hatchEggs(hours);
  }

  // --- exploration --------------------------------------------------------------------------

  travel(region: BiomeId | 'village'): void {
    const s = this.state;
    if (s.region === region) return;
    s.region = region;
    this.advance(1);
    if (region !== 'village') {
      s.counts[`visit:${region}`] = (s.counts[`visit:${region}`] ?? 0) + 1;
      for (const c of s.team) {
        const b = BIOMES[region];
        for (const [e, v] of Object.entries(b.exposure)) c.exposures[e as Exposure] += (v as number) * 0.5;
        if (s.hour >= 19 || s.hour <= 5) c.exposures.night += 0.5;
      }
      this.log('explore', `You travel to ${BIOMES[region].name}.`);
    } else {
      this.log('explore', 'You return to the village.');
    }
    this.checkAchievements();
  }

  /** One exploration action in the current region. */
  explore(): ExploreOutcome {
    const s = this.state;
    if (s.region === 'village') {
      return { kind: 'nothing', text: 'The village is home. Travel to a wild region to explore.' };
    }
    const biome = BIOMES[s.region];
    s.steps += 1;
    s.counts.explores = (s.counts.explores ?? 0) + 1;
    this.advance(this.rng.range(2, 3));
    const night = s.hour >= 19 || s.hour <= 5;

    for (const c of s.team) {
      for (const [e, v] of Object.entries(biome.exposure)) c.exposures[e as Exposure] += (v as number) * 1.2;
      c.exposures.explore += 1;
      if (night) c.exposures.night += 1;
      if (s.weather === 'storm') c.exposures.storm += 1;
      else if (s.weather === 'rain') c.exposures.storm += 0.4;
    }

    const roll = this.rng.next();
    if (roll < 0.55) {
      const wild = this.rollWild(biome, night);
      s.wild = wild;
      s.guide[wild.speciesId] = guideOf(s, wild.speciesId) === 'unknown' ? 'seen' : guideOf(s, wild.speciesId);
      this.progressQuests('observe', 0);
      this.log('explore', `Tracks in the ${biome.name} lead to a wild ${SPECIES_BY_ID[wild.speciesId].name}.`);
      return { kind: 'encounter', wild, text: `A wild ${SPECIES_BY_ID[wild.speciesId].name} watches you from the ${biome.name}.` };
    }
    if (roll < 0.77) {
      const item = this.rng.pick(biome.resources);
      const count = this.rng.range(1, 2);
      s.items[item] = (s.items[item] ?? 0) + count;
      this.log('explore', `You gather ${count} × ${ITEMS[item].name}.`);
      return { kind: 'resource', item, count, text: `You gather ${count} × ${ITEMS[item].name} (${ITEMS[item].desc}).` };
    }
    if (roll < 0.85) {
      s.items.fragment = (s.items.fragment ?? 0) + 1;
      s.counts.fragments = (s.counts.fragments ?? 0) + 1;
      this.progressQuests('fragment', 1);
      for (const c of s.team) c.exposures.ruins += 1;
      this.log('explore', 'You find a carved ruin fragment. The researcher will want it.');
      return { kind: 'fragment', text: 'A carved ruin fragment, warm with unreadable symbols.' };
    }
    if (roll < 0.95) {
      const events = [
        'A storm-washed hollow: the creatures here are bold today.',
        'You find old footprints — someone walked here long before you.',
        'A quiet pool reflects the sky. Your team rests a while.',
        'Strange light drifts between the trees and is gone.',
      ];
      const text = this.rng.pick(events);
      for (const c of s.team) c.stress = Math.max(0, c.stress - 4);
      this.log('explore', text);
      return { kind: 'event', text };
    }
    this.log('explore', 'Quiet exploration. Nothing finds you today.');
    return { kind: 'nothing', text: 'You range far and wide. Nothing today — but the land is noted.' };
  }

  private rollWild(biome: (typeof BIOMES)[BiomeId], night: boolean): Creature {
    const entries: [string, number][] = Object.entries(biome.wild).map(([id, w]) => {
      const sp = SPECIES_BY_ID[id];
      let weight = w;
      if (sp.nocturnal && !night) weight *= 0.25;
      if (!sp.nocturnal && night) weight *= 0.7;
      const weather = this.state.weather;
      if (weather === 'rain' && sp.affinities.includes('aquatic')) weight *= 1.6;
      if (weather === 'storm' && sp.affinities.includes('conductive')) weight *= 1.8;
      if (weather === 'fog' && (sp.affinities.includes('psionic') || sp.affinities.includes('void'))) weight *= 1.6;
      if (weather === 'sun' && sp.affinities.includes('thermal')) weight *= 1.4;
      return [id, weight];
    });
    const id = this.rng.weighted(entries) ?? Object.keys(biome.wild)[0];
    return this.makeCreature(id, biome.id);
  }

  private makeCreature(speciesId: string, origin: BiomeId | 'village'): Creature {
    const s = this.state;
    const sp = SPECIES_BY_ID[speciesId];
    const level = Math.max(1, 2 + Math.floor(s.day / 6) + this.rng.range(0, 3));
    const genome = makeGenome(this.rng);
    const c: Creature = {
      id: creatureSerial(s),
      speciesId,
      bornSpeciesId: speciesId,
      name: sp.name,
      level,
      xp: 0,
      hp: 0,
      age: this.rng.range(20, 200),
      personality: emptyPersonality(this.rng),
      bond: 0,
      trust: this.rng.range(4, 16),
      stress: this.rng.range(15, 45),
      exposures: emptyExposures(),
      abilities: sp.abilities.slice(0, 3),
      genome,
      generation: 0,
      parents: [],
      children: [],
      origin,
      bornDay: s.day,
      history: [],
      variant: null,
    };
    if (origin !== 'village') {
      for (const [e, v] of Object.entries(BIOMES[origin].exposure)) c.exposures[e as Exposure] += (v as number) * 2.5;
      if (s.hour >= 19 || s.hour <= 5) c.exposures.night += 1.5;
      c.history.push({ day: s.day, kind: 'born', text: `Born in the ${BIOMES[origin].name}` });
    }
    c.hp = statsOf(c).maxHp;
    return c;
  }

  // --- the wild encounter -------------------------------------------------------------------

  observeWild(): string {
    const s = this.state;
    const w = s.wild;
    if (!w) return 'There is nothing here to observe.';
    const before = guideOf(s, w.speciesId);
    s.guide[w.speciesId] = before === 'unknown' || before === 'seen' ? 'observed' : before;
    w.trust = Math.min(100, w.trust + 5);
    w.stress = Math.max(0, w.stress - 4);
    this.progressQuests('observe', 1);
    this.advance(1);
    const sp = SPECIES_BY_ID[w.speciesId];
    const words = personalityWords(w).join(', ');
    this.log('bond', `You observe the wild ${sp.name}: ${sp.role}, drawn to ${sp.likes}. Temperament: ${words.toLowerCase()}.`);
    return `You observe the wild ${sp.name}. ${sp.blurb} It seems to prefer ${sp.likes === 'patience' ? 'quiet company' : sp.likes}. Temperament: ${words.toLowerCase()}.`;
  }

  offerFood(itemId: string): string {
    const s = this.state;
    const w = s.wild;
    if (!w) return 'There is nobody here to feed.';
    if ((s.items[itemId] ?? 0) <= 0) return `You have no ${ITEMS[itemId].name}.`;
    s.items[itemId] -= 1;
    const item = ITEMS[itemId];
    const sp = SPECIES_BY_ID[w.speciesId];
    const likes = sp.likes === 'food' ? 2 : 1;
    w.trust = Math.min(100, w.trust + 8 * likes);
    w.stress = Math.max(0, w.stress - 6);
    if (item.heal) w.hp = Math.min(statsOf(w).maxHp, w.hp + item.heal);
    for (const [e, v] of Object.entries(item.feeds ?? {})) w.exposures[e as Exposure] += (v as number) * 0.5;
    this.advance(1);
    this.log('bond', `You offer ${item.name.toLowerCase()} to the wild ${sp.name}. Its trust rises.`);
    return `The ${sp.name} ${likes > 1 ? 'delights in' : 'accepts'} the ${item.name.toLowerCase()}. Trust rises.`;
  }

  playWithWild(): string {
    const s = this.state;
    const w = s.wild;
    if (!w) return 'There is nobody here to play with.';
    const sp = SPECIES_BY_ID[w.speciesId];
    const likes = sp.likes === 'play' ? 2 : 1;
    w.trust = Math.min(100, w.trust + 7 * likes);
    w.stress = Math.max(0, w.stress - 8);
    w.personality.playfulness = Math.min(100, w.personality.playfulness + 3);
    w.exposures.play += 0.5;
    this.advance(1);
    this.log('bond', `You play with the wild ${sp.name}. It is starting to like you.`);
    return `You play with the ${sp.name}. It circles back for more.`;
  }

  /** Companion Link: no items, just a bond. Chance from trust, HP, fear and personality. */
  linkChance(w: Creature): number {
    const s = this.state;
    const sp = SPECIES_BY_ID[w.speciesId];
    const stats = statsOf(w);
    const hpFrac = w.hp / stats.maxHp;
    const homeBonus = w.origin === s.region ? 0.05 : 0;
    const likeBonus = sp.likes === 'patience' && w.trust > 35 ? 0.08 : 0;
    const p =
      0.1 +
      0.28 * (w.trust / 100) +
      0.16 * (1 - hpFrac) * 0.9 +
      0.12 * (1 - w.stress / 100) +
      0.08 * (w.personality.loyalty / 100) +
      homeBonus +
      likeBonus -
      0.12 * (w.personality.fear / 100);
    return Math.max(0.04, Math.min(0.92, p));
  }

  attemptLink(): { ok: boolean; chance: number; text: string } {
    const s = this.state;
    const w = s.wild;
    if (!w) return { ok: false, chance: 0, text: 'There is nobody here to befriend.' };
    const chance = this.linkChance(w);
    const sp = SPECIES_BY_ID[w.speciesId];
    this.advance(1);
    s.steps += 1;
    if (this.rng.chance(chance)) {
      w.bond = Math.round(30 + w.trust * 0.4);
      w.trust = Math.min(100, w.trust + 15);
      w.stress = Math.max(0, w.stress - 10);
      w.history.push({ day: s.day, kind: 'caught', text: `Companion Link formed in the ${s.region === 'village' ? 'village' : BIOMES[s.region].name}` });
      s.guide[w.speciesId] = 'captured';
      s.counts.captures = (s.counts.captures ?? 0) + 1;
      if (s.team.length < 6) s.team.push(w);
      else s.reserve.push(w);
      s.wild = null;
      this.progressQuests('capture', 1);
      this.log('bond', `Companion Link! The wild ${sp.name} joins your ${s.team.includes(w) ? 'team' : 'collection'}.`);
      this.checkAchievements();
      this.maybeEvolve(w);
      return { ok: true, chance, text: `The ${sp.name} reaches out. The Companion Link holds — it is yours.` };
    }
    w.trust = Math.max(0, w.trust - 3);
    w.stress = Math.min(100, w.stress + 6);
    w.personality.fear = Math.min(100, w.personality.fear + 4);
    const fled = this.rng.chance(0.22);
    if (fled) s.wild = null;
    this.log('bond', `The Companion Link fails (${Math.round(chance * 100)}%). The wild ${sp.name} is not ready.`);
    return {
      ok: false,
      chance,
      text: fled
        ? `The link slips away. The ${sp.name} vanishes into the ${s.region === 'village' ? 'wilds' : BIOMES[s.region].name}.`
        : `The link slips away (${Math.round(chance * 100)}%). It needs more trust.`,
    };
  }

  leaveWild(): void {
    const w = this.state.wild;
    if (w) this.log('explore', `You leave the wild ${SPECIES_BY_ID[w.speciesId].name} be.`);
    this.state.wild = null;
    this.advance(1);
  }

  // --- raising ------------------------------------------------------------------------------

  train(creatureId: string): string {
    const c = findCreature(this.state, creatureId);
    if (!c) return 'No such creature.';
    const s = this.state;
    s.steps += 1;
    this.advance(2);
    const gain = 14 + c.level * 5;
    const msg = `${c.name} trains hard. +${gain} XP.`;
    c.stress = Math.min(100, c.stress + 5);
    c.personality.aggression = Math.min(100, c.personality.aggression + 2);
    this.gainXp(c, gain);
    this.log('village', msg);
    return msg;
  }

  feed(creatureId: string, itemId: string): string {
    const c = findCreature(this.state, creatureId);
    const s = this.state;
    if (!c) return 'No such creature.';
    if ((s.items[itemId] ?? 0) <= 0) return `You have no ${ITEMS[itemId].name}.`;
    s.items[itemId] -= 1;
    const item = ITEMS[itemId];
    s.steps += 1;
    this.advance(1);
    if (item.heal) c.hp = Math.min(statsOf(c).maxHp, c.hp + item.heal);
    for (const [e, v] of Object.entries(item.feeds ?? {})) {
      c.exposures[e as Exposure] += (v as number) * 1.5;
    }
    c.bond = Math.min(100, c.bond + 3);
    c.stress = Math.max(0, c.stress - 2);
    const msg = `${c.name} eats the ${item.name.toLowerCase()}.`;
    this.log('village', msg);
    this.maybeEvolve(c);
    return msg;
  }

  play(creatureId: string): string {
    const c = findCreature(this.state, creatureId);
    if (!c) return 'No such creature.';
    const s = this.state;
    s.steps += 1;
    this.advance(1);
    c.bond = Math.min(100, c.bond + 6);
    c.trust = Math.min(100, c.trust + 4);
    c.stress = Math.max(0, c.stress - 8);
    c.personality.playfulness = Math.min(100, c.personality.playfulness + 3);
    c.exposures.play += 1;
    const msg = `You spend an hour playing with ${c.name}. Bond and trust grow.`;
    this.log('village', msg);
    this.maybeEvolve(c);
    return msg;
  }

  rest(creatureId: string): string {
    const c = findCreature(this.state, creatureId);
    if (!c) return 'No such creature.';
    const s = this.state;
    s.steps += 1;
    this.advance(4);
    c.hp = statsOf(c).maxHp;
    c.stress = Math.max(0, c.stress - 25);
    const msg = `${c.name} rests at the village and is fully recovered.`;
    this.log('village', msg);
    return msg;
  }

  gainXp(c: Creature, amount: number): boolean {
    c.xp += amount;
    let leveled = false;
    while (c.xp >= xpToNext(c.level)) {
      c.xp -= xpToNext(c.level);
      c.level += 1;
      leveled = true;
      c.history.push({ day: this.state.day, kind: 'milestone', text: `Reached level ${c.level}` });
    }
    if (leveled) {
      this.log('village', `${c.name} reaches level ${c.level}.`);
      this.maybeEvolve(c);
    }
    return leveled;
  }

  // --- evolution ----------------------------------------------------------------------------

  maybeEvolve(c: Creature): boolean {
    const result = evaluateEvolution(c);
    if (!result.best) return false;
    const from = SPECIES_BY_ID[c.speciesId];
    const to = SPECIES_BY_ID[result.best];
    c.speciesId = to.id;
    c.hp = Math.min(statsOf(c).maxHp, c.hp + 8);
    c.history.push({ day: this.state.day, kind: 'evolve', text: `Evolved: ${from.name} → ${to.name}` });
    const disc = this.state.discovered[c.bornSpeciesId] ?? [];
    if (!disc.includes(to.id)) disc.push(to.id);
    this.state.discovered[c.bornSpeciesId] = disc;
    this.state.counts.evolves = (this.state.counts.evolves ?? 0) + 1;
    this.progressQuests('evolve', 1);
    this.log('evolve', `${c.name} evolves into ${to.name} — shaped by ${lifeTags(c).join(', ') || 'its life'}!`);
    this.checkAchievements();
    return true;
  }

  // --- breeding -----------------------------------------------------------------------------

  canBreed(aId: string, bId: string): { ok: boolean; reason: string } {
    const a = findCreature(this.state, aId);
    const b = findCreature(this.state, bId);
    if (!a || !b) return { ok: false, reason: 'Pick two creatures.' };
    if (a.id === b.id) return { ok: false, reason: 'Pick two different creatures.' };
    if (SPECIES_BY_ID[a.speciesId].family !== SPECIES_BY_ID[b.speciesId].family)
      return { ok: false, reason: 'Only creatures of the same family can breed.' };
    if (a.bond < 55 || b.bond < 55) return { ok: false, reason: 'Both creatures need a bond of at least 55. Play and feed them.' };
    return { ok: true, reason: '' };
  }

  breed(aId: string, bId: string): string {
    const check = this.canBreed(aId, bId);
    if (!check.ok) return check.reason;
    const s = this.state;
    const a = findCreature(s, aId)!;
    const b = findCreature(s, bId)!;
    const family = SPECIES_BY_ID[a.speciesId].family;
    const base = SPECIES.find((sp) => sp.family === family && sp.stage === 0)!;
    const mix = (x: number, y: number) => Math.max(0.05, Math.min(1, (x + y) / 2 + this.rng.float(-0.08, 0.08)));
    const genome: Genome = {
      vigor: mix(a.genome.vigor, b.genome.vigor),
      power: mix(a.genome.power, b.genome.power),
      guard: mix(a.genome.guard, b.genome.guard),
      speed: mix(a.genome.speed, b.genome.speed),
      size: mix(a.genome.size, b.genome.size),
      glow: mix(a.genome.glow, b.genome.glow),
    };
    const variant: Variant | null = this.rng.chance(0.12)
      ? this.rng.weighted<Variant>([
          ['crystal', 0.4],
          ['golden', 0.4],
          ['void', 0.2],
        ]) ?? null
      : null;
    const personality = Object.fromEntries(
      PERSONALITY.map((p) => [p, Math.max(5, Math.min(95, (a.personality[p] + b.personality[p]) / 2 + this.rng.range(-12, 12)))]),
    ) as Record<PersonalityKey, number>;
    const egg: Egg = {
      id: `egg-${s.steps}-${this.rng.int(1e6).toString(36)}`,
      family,
      speciesId: base.id,
      parentA: a.id,
      parentB: b.id,
      genome,
      personality,
      generation: Math.max(a.generation, b.generation) + 1,
      variant,
      stepsLeft: 6,
      laidDay: s.day,
    };
    s.eggs.push(egg);
    a.children.push(egg.id);
    b.children.push(egg.id);
    a.stress = Math.min(100, a.stress + 8);
    b.stress = Math.min(100, b.stress + 8);
    s.counts.breeds = (s.counts.breeds ?? 0) + 1;
    this.advance(2);
    this.log('breed', `${a.name} and ${b.name} lay an egg. It will hatch after a little time.`);
    return 'An egg! Keep exploring — it will hatch soon.';
  }

  private hatchEggs(hours: number): void {
    const s = this.state;
    for (const egg of [...s.eggs]) {
      egg.stepsLeft -= hours / 6;
      if (egg.stepsLeft > 0) continue;
      s.eggs.splice(s.eggs.indexOf(egg), 1);
      const parents = [findCreature(s, egg.parentA), findCreature(s, egg.parentB)].filter(Boolean) as Creature[];
      const child = this.makeCreature(egg.speciesId, 'village');
      child.id = creatureSerial(s);
      child.genome = egg.genome;
      child.personality = egg.personality;
      child.variant = egg.variant;
      child.generation = egg.generation;
      child.parents = parents.map((p) => p.id);
      child.age = 0;
      child.level = 1;
      child.xp = 0;
      child.bond = 45;
      child.trust = 80;
      child.stress = 10;
      child.exposures = emptyExposures();
      for (const p of parents) for (const e of EXPOSURES) child.exposures[e] += p.exposures[e] * 0.3;
      child.hp = statsOf(child).maxHp;
      child.history.push({
        day: s.day,
        kind: 'born',
        text: `Born at the village, generation ${egg.generation}. Parents: ${parents.map((p) => p.name).join(' & ') || 'unknown'}`,
      });
      for (const p of parents) p.children.push(child.id);
      if (s.team.length < 6) s.team.push(child);
      else s.reserve.push(child);
      s.counts.hatches = (s.counts.hatches ?? 0) + 1;
      this.log('breed', `The egg hatches: ${SPECIES_BY_ID[child.speciesId].name}, generation ${child.generation}, carrying a trait from an ancestor ${child.generation} generations back.`);
      this.checkAchievements();
    }
  }

  /** Ancestors of a creature, following parent links. */
  ancestors(c: Creature): Creature[] {
    const out: Creature[] = [];
    const seen = new Set<string>();
    const walk = (id: string, depth: number) => {
      if (depth > 8 || seen.has(id)) return;
      seen.add(id);
      for (const pid of findCreature(this.state, id)?.parents ?? []) {
        const p = findCreature(this.state, pid);
        if (p) {
          out.push(p);
          walk(pid, depth + 1);
        }
      }
    };
    walk(c.id, 0);
    return out;
  }

  descendants(c: Creature): Creature[] {
    const out: Creature[] = [];
    const seen = new Set<string>();
    const walk = (id: string, depth: number) => {
      if (depth > 8 || seen.has(id)) return;
      seen.add(id);
      for (const cid of findCreature(this.state, id)?.children ?? []) {
        const ch = findCreature(this.state, cid);
        if (ch) {
          out.push(ch);
          walk(cid, depth + 1);
        }
      }
    };
    walk(c.id, 0);
    return out;
  }

  // --- quests and achievements --------------------------------------------------------------

  private rollQuests(): Quest[] {
    const kinds: { kind: Quest['kind']; text: (n: number) => string; need: [number, number]; reward: string }[] = [
      { kind: 'observe', text: (n) => `Observe ${n} wild creatures for the researcher`, need: [3, 4], reward: '2 × Wild berry' },
      { kind: 'capture', text: (n) => `Form a Companion Link with ${n} creatures`, need: [2, 3], reward: 'Herbal salve' },
      { kind: 'fragment', text: (n) => `Bring back ${n} ruin fragments`, need: [2, 3], reward: '2 × Moonfruit' },
      { kind: 'win', text: (n) => `Win ${n} battles`, need: [4, 6], reward: '2 × Ember pepper' },
      { kind: 'explore', text: (n) => `Explore ${n} times`, need: [10, 14], reward: '2 × Crystal shard' },
    ];
    return this.rng.shuffle([...kinds]).slice(0, 3).map((k, i) => {
      const need = this.rng.range(k.need[0], k.need[1]);
      return { id: `q${this.state.day}-${i}`, text: k.text(need), kind: k.kind, need, have: 0, done: false, reward: k.reward };
    });
  }

  progressQuests(kind: Quest['kind'], amount: number): void {
    const s = this.state;
    for (const q of s.quests) {
      if (q.done || q.kind !== kind) continue;
      q.have += amount;
      if (q.have >= q.need) {
        q.done = true;
        this.grantReward(q.reward);
        this.log('quest', `Research complete: ${q.text}. Reward: ${q.reward}.`);
        if (s.quests.every((x) => x.done)) {
          s.quests = this.rollQuests();
          this.log('quest', 'The researcher has new questions.');
        }
      }
    }
  }

  private grantReward(reward: string): void {
    const map: Record<string, [string, number]> = {
      '2 × Wild berry': ['berry', 2],
      'Herbal salve': ['salve', 1],
      '2 × Moonfruit': ['moonfruit', 2],
      '2 × Ember pepper': ['pepper', 2],
      '2 × Crystal shard': ['crystal', 2],
    };
    const give = map[reward];
    if (give) this.state.items[give[0]] = (this.state.items[give[0]] ?? 0) + give[1];
  }

  checkAchievements(): void {
    const s = this.state;
    const award = (id: string, name: string, ok: boolean) => {
      if (ok && !s.achievements[id]) {
        s.achievements[id] = true;
        this.log('system', `Achievement: ${name}.`);
      }
    };
    award('first-friend', 'First Friend', (s.counts.captures ?? 0) >= 1);
    award('naturalist', 'Naturalist', Object.values(s.guide).filter((g) => g === 'observed' || g === 'captured').length >= 10);
    award('divergence', 'Evolutionary Divergence', (s.counts.evolves ?? 0) >= 1);
    award('ancestor', 'Ancestor', (s.counts.hatches ?? 0) >= 1);
    award('explorer', 'Explorer', (s.counts.explores ?? 0) >= 25);
    const visited = BIOMES && Object.keys(BIOMES).filter((b) => (s.counts[`visit:${b}`] ?? 0) > 0).length;
    award('wanderer', 'Wanderer', visited >= 6);
    if (s.team.length + s.reserve.length === 0) award('empty', 'Almost Nothing', false);
  }

  /** Called after every player action so quests and evolution stay in sync. */
  settle(): void {
    this.progressQuests('win', 0);
    this.checkAchievements();
    for (const c of allCreatures(this.state)) this.maybeEvolve(c);
  }
}

export const ACHIEVEMENTS: { id: string; name: string; desc: string }[] = [
  { id: 'first-friend', name: 'First Friend', desc: 'Form your first Companion Link.' },
  { id: 'naturalist', name: 'Naturalist', desc: 'Observe ten different species.' },
  { id: 'divergence', name: 'Evolutionary Divergence', desc: 'Raise a creature into its evolution.' },
  { id: 'ancestor', name: 'Ancestor', desc: 'Hatch an egg.' },
  { id: 'explorer', name: 'Explorer', desc: 'Explore twenty-five times.' },
  { id: 'wanderer', name: 'Wanderer', desc: 'Visit every region.' },
];

export const REGION_ORDER: (BiomeId | 'village')[] = ['village', 'greenwood', 'meadow', 'wetlands', 'caves', 'ember', 'ruins'];
