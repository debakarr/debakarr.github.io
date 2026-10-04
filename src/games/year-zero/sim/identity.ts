import { ERA_NAMES, TRAIT, TRAIT_IDS, type TraitId } from '../data/society';
import { TECHS } from '../data/techs';
import { BUILDING } from '../data/buildings';
import { UNIT, isMilitary } from '../data/units';
import type { Game } from './game';
import { logHistory } from './history';
import type { Civ } from './state';

// A civilization's character is not chosen. It accumulates from what happens
// to it, and in turn shapes what it does next.

export function emptyTraits(): Record<TraitId, number> {
  const t = {} as Record<TraitId, number>;
  for (const id of TRAIT_IDS) t[id] = 10;
  return t;
}

export function shiftTrait(civ: Civ, id: TraitId, amount: number): void {
  civ.traits[id] = Math.max(0, Math.min(100, civ.traits[id] + amount));
  const opp = TRAIT[id].opposite;
  if (opp && amount > 0) civ.traits[opp] = Math.max(0, civ.traits[opp] - amount * 0.5);
}

export function hasTrait(civ: Civ, id: TraitId): boolean {
  return civ.identity.includes(id);
}

/** 0..1 strength of a trait, for weighting AI choices. */
export function traitW(civ: Civ, id: TraitId): number {
  return civ.traits[id] / 100;
}

export function fill(template: string, civ: Civ): string {
  return template.replaceAll('{name}', civ.name).replaceAll('{adj}', civ.adj);
}

/** Periodic drift of traits from the actual state of the civilization. */
export function driftTraits(g: Game, civ: Civ): void {
  const cities = g.citiesOf(civ.id);
  if (!cities.length) return;
  const units = g.unitsOf(civ.id);
  const military = units.filter((u) => isMilitary(UNIT[u.type]));
  const naval = units.filter((u) => UNIT[u.type].cls === 'naval');
  const rels = Object.values(civ.relations).filter((r) => r.met >= 0);
  const trades = rels.filter((r) => r.trade >= 0).length;
  const atWar = rels.some((r) => r.war);

  let sci = 0;
  let gold = 0;
  let cult = 0;
  let coastal = 0;
  let walls = 0;
  let faithB = 0;
  for (const c of cities) {
    sci += c.y.sci;
    gold += c.y.gold;
    cult += c.y.cult;
    if (g.grid.neighborList(c.tile).some((t) => g.s.map.terrain[t] <= 1)) coastal++;
    for (const b of c.buildings) {
      if (b === 'walls' || b === 'castle') walls++;
      if (b === 'shrine' || b === 'temple') faithB++;
    }
  }
  const total = Math.max(1, sci + gold + cult);
  const gov = civ.government;

  // Natural fading: identity must be lived to persist.
  for (const id of TRAIT_IDS) civ.traits[id] = Math.max(0, civ.traits[id] - 0.7);

  if (military.length / cities.length > 1.8) shiftTrait(civ, 'militaristic', 1.5);
  if (atWar) shiftTrait(civ, 'militaristic', 0.8);
  if (walls / cities.length > 0.6) shiftTrait(civ, 'defensive', 0.8);
  if (trades) shiftTrait(civ, 'mercantile', Math.min(1.4, trades * 0.35));
  if (gold / total > 0.4) shiftTrait(civ, 'mercantile', 1);
  if (sci / total > 0.45) shiftTrait(civ, 'scientific', 1.4);
  if (cult / total > 0.3) shiftTrait(civ, 'artistic', 1.2);
  if (civ.religionId >= 0 && faithB / cities.length > 0.5) shiftTrait(civ, 'religious', 1);
  if (gov === 'theocracy') shiftTrait(civ, 'religious', 1.8);
  if (coastal / cities.length > 0.55) shiftTrait(civ, 'maritime', 1.3);
  if (naval.length >= 2) shiftTrait(civ, 'maritime', 0.6);
  if (rels.length === 0 && g.turn > 50) shiftTrait(civ, 'isolationist', 2.2);
  else if (trades === 0 && !rels.some((r) => r.openBorders >= 0)) shiftTrait(civ, 'isolationist', 0.5);
  else shiftTrait(civ, 'isolationist', -1);
  if (civ.techs.ecology !== undefined) shiftTrait(civ, 'ecological', 1);
  if (civ.pollution < 5 && civ.eraTier >= 5) shiftTrait(civ, 'ecological', 0.6);
  if (gov === 'dictatorship' || gov === 'tribal' || gov === 'aigov' || gov === 'empire') shiftTrait(civ, 'collectivist', 0.8);
  if (gov === 'democracy' || gov === 'republic' || gov === 'federation') shiftTrait(civ, 'individualist', 1);
  if (cities.length >= 6) shiftTrait(civ, 'expansionist', 0.6);
}

/** Recompute identity labels; emerging and fading labels become history. */
export function updateIdentity(g: Game, civ: Civ): void {
  const ranked = [...TRAIT_IDS].sort((a, b) => civ.traits[b] - civ.traits[a]);
  const next: TraitId[] = [];
  for (const id of ranked) {
    if (next.length >= 3) break;
    const held = civ.identity.includes(id);
    // Hysteresis: labels arrive at 40 and leave below 28.
    if (civ.traits[id] >= 40 || (held && civ.traits[id] >= 28)) next.push(id);
  }
  for (const id of next) {
    if (!civ.identity.includes(id)) {
      logHistory(g, 'identity', civ.isPlayer ? 3 : 2, [civ.id], fill(TRAIT[id].emerge, civ));
    }
  }
  for (const id of civ.identity) {
    if (!next.includes(id)) logHistory(g, 'identity', 1, [civ.id], fill(TRAIT[id].fade, civ));
  }
  civ.identity = next;
}

export function computeTier(civ: Civ): number {
  const counts = new Array(10).fill(0);
  for (const t of TECHS) if (civ.techs[t.id] !== undefined) counts[t.tier]++;
  let tier = 0;
  for (let t = 1; t < 10; t++) if (counts[t] >= 2) tier = t;
  return tier;
}

export function eraName(civ: Civ, tier: number): string {
  const entry = ERA_NAMES[tier];
  for (const id of civ.identity) {
    const n = entry.by[id];
    if (n) return n;
  }
  // Nomads: a people that never truly settled.
  if (tier === 1 && civ.stats.citiesFounded <= 1 && civ.stats.peakCities <= 1) return 'Nomadic Age';
  return entry.default;
}

export function updateEra(g: Game, civ: Civ): void {
  const tier = computeTier(civ);
  if (tier <= civ.eraTier) return;
  civ.eraTier = tier;
  const name = eraName(civ, tier);
  const prev = civ.eraPath[civ.eraPath.length - 1];
  if (prev && prev.name === name) return;
  civ.eraPath.push({ tier, name, turn: g.turn });
  const first = !g.aliveCivs().some((c) => c !== civ && c.eraTier >= tier);
  const text = first
    ? `The ${civ.name} are the first people to enter the ${name}.`
    : `The ${civ.name} enter the ${name}.`;
  logHistory(g, 'era', civ.isPlayer || first ? 3 : 2, [civ.id], text);
}

export function cityBuildingCount(g: Game, civ: Civ, id: string): number {
  if (!BUILDING[id]) return 0;
  return g.citiesOf(civ.id).filter((c) => c.buildings.includes(id)).length;
}
