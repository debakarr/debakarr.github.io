// Resonance Bonding: observe a creature to learn it, approach without
// frightening it, offer what it likes under conditions it prefers, and when
// trust is high, tune the Resonance Device to its heartbeat. No capture
// items: the bond is something the creature agrees to.

import { ITEM_BY_ID } from '../data/items';
import { SPECIES_BY_ID, variantName } from '../data/species';
import type { Creature } from '../entities/creature';
import type { GameState } from './state';

export const RESONATE_TRUST = 70;

export interface Conditions {
  night: boolean;
  inCave: boolean;
  playerCrouching: boolean;
  playerCalmFor: number;
  nearFlowers: boolean;
}

/** How much the creature's current situation helps or hurts trust. */
export function preference(c: Creature, cond: Conditions): { mult: number; note: string } {
  switch (c.species) {
    case 'aquoray':
      return c.inWater ? { mult: 1.5, note: 'Happy in the water' } : { mult: 0.6, note: 'Uneasy out of the water' };
    case 'lumelle':
      return cond.night || cond.inCave ? { mult: 1.5, note: 'Calm in the dark' } : { mult: 0.6, note: 'Dazzled by daylight' };
    case 'flamkit':
      return cond.night ? { mult: 0.7, note: 'A bit chilly at night' } : { mult: 1.2, note: 'Loves the warm sun' };
    case 'zephyra':
      return cond.playerCrouching ? { mult: 1.4, note: 'Trusts a quiet approach' } : { mult: 0.7, note: 'Wary of tall strangers' };
    case 'thornlade':
      return cond.playerCalmFor > 4 ? { mult: 1.25, note: 'Respects your calm' } : { mult: 0.6, note: 'Bristling at sudden moves' };
    case 'terrabun':
      return cond.nearFlowers ? { mult: 1.2, note: 'Content among flowers' } : { mult: 1, note: 'Steady and watchful' };
  }
}

export interface FeedResult {
  ok: boolean;
  message: string;
  gain: number;
  liked: boolean;
}

/** Best food to offer: the favourite if you have it, otherwise any food. */
export function bestFood(state: GameState, c: Creature): string | null {
  const fav = SPECIES_BY_ID[c.species].likes;
  if ((state.inventory[fav] ?? 0) > 0) return fav;
  const foods = Object.keys(state.inventory).filter((k) => ITEM_BY_ID[k]?.category === 'food' && state.inventory[k] > 0);
  return foods[0] ?? null;
}

export function feed(state: GameState, c: Creature, item: string, cond: Conditions): FeedResult {
  const def = SPECIES_BY_ID[c.species];
  if (c.feedCooldown > 0) return { ok: false, message: `${def.name} is still nibbling.`, gain: 0, liked: false };
  if (c.fear > 45) return { ok: false, message: `${def.name} is too nervous to eat. Back off and approach slowly.`, gain: 0, liked: false };
  const liked = item === def.likes;
  const pref = preference(c, cond);
  const base = liked ? 26 : 9;
  const gain = Math.round(base * pref.mult * def.warmth * (c.companion ? 0.5 : 1));
  c.trust = Math.min(100, c.trust + gain);
  c.fear = Math.max(0, c.fear - 20);
  c.feedCooldown = 3.5;
  const mem = state.wild[c.id];
  if (mem) {
    mem.trust = c.trust;
    mem.fedAt = state.clock;
  }
  const item0 = ITEM_BY_ID[item];
  const message = liked
    ? `${variantName(c.species, c.variant)} loves the ${item0.name}! (${pref.note.toLowerCase()})`
    : `${def.name} nibbles the ${item0.name}. It would prefer something else.`;
  return { ok: true, message, gain, liked };
}

/** Timing window for each resonance pulse, in fractions of the pulse. */
export function resonanceWindow(c: Creature): number {
  const def = SPECIES_BY_ID[c.species];
  return 0.11 + (c.trust - RESONATE_TRUST) / 300 + (1 - def.shyness) * 0.04;
}

export function canResonate(c: Creature): { ok: boolean; reason?: string } {
  if (c.companion) return { ok: false, reason: 'Already bonded' };
  if (c.resonateCooldown > 0) return { ok: false, reason: `Let it settle (${Math.ceil(c.resonateCooldown)}s)` };
  if (c.trust < RESONATE_TRUST) return { ok: false, reason: `Trust ${Math.floor(c.trust)}/${RESONATE_TRUST}` };
  if (c.fear > 40) return { ok: false, reason: 'Too frightened' };
  return { ok: true };
}

export function resonanceFailed(state: GameState, c: Creature): void {
  c.trust = Math.max(0, c.trust - 18);
  c.fear = Math.min(100, c.fear + 30);
  c.resonateCooldown = 8;
  const mem = state.wild[c.id];
  if (mem) mem.trust = c.trust;
}

/** Records a successful bond; returns the new companion's uid. */
export function bond(state: GameState, c: Creature, day: number): string {
  const uid = `b${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const def = SPECIES_BY_ID[c.species];
  state.bonded.push({ uid, species: c.species, variant: c.variant, name: def.name, origin: c.id, bondedDay: day, friendship: 50 });
  const mem = state.wild[c.id];
  if (mem) mem.bonded = true;
  const rec = state.species[c.species];
  rec.seen = true;
  rec.bonded += 1;
  return uid;
}
