import { fromJson, toJson } from '../../shared/savefile';
import { City } from './city';
import { checkChallenge } from './challenges';
import { recomputeCoverage } from './coverage';
import { runEnvironment } from './environment';
import { runEvents } from './events';
import { checkMilestones, computeDemand, runBudget, runGrowth } from './growth';
import { newCityState, SAVE_VERSION } from './mapgen';
import { recomputeNetworks, runUtilities } from './networks';
import type { CityState, Settings } from './state';
import { runTraffic } from './traffic';

/** One month of simulation. */
export function stepMonth(c: City): void {
  const phases = stepPhases(c);
  while (!phases.next().done) {
    /* run every phase now */
  }
}

/**
 * The month as a generator, so the UI can spread the heavy phases over
 * several animation frames. Player edits between phases are safe: every
 * phase reads the current state.
 */
export function* stepPhases(c: City): Generator<void, void, void> {
  if (c.dirtyNet) recomputeNetworks(c);
  if (c.dirtyCov) recomputeCoverage(c);
  runUtilities(c);
  yield;
  runTraffic(c);
  yield;
  runEnvironment(c);
  yield;
  if (c.dirtyNet) recomputeNetworks(c);
  computeDemand(c);
  runGrowth(c);
  computeDemand(c);
  runEvents(c);
  runBudget(c);
  checkMilestones(c);
  checkChallenge(c);
  sample(c);
  c.s.tick++;
  c.syncRng();
  c.emit({ type: 'changed' });
}

/** Recompute every derived layer without advancing time (after load or edits while paused). */
export function refresh(c: City, warmTraffic = false): void {
  recomputeNetworks(c);
  recomputeCoverage(c);
  runUtilities(c);
  const passes = warmTraffic ? 3 : 1;
  for (let k = 0; k < passes; k++) runTraffic(c);
  runEnvironment(c);
  computeDemand(c);
}

/** Cheap refresh for paused edits: utilities and coverage only. */
export function refreshQuick(c: City): void {
  if (c.dirtyNet) recomputeNetworks(c);
  if (c.dirtyCov) recomputeCoverage(c);
  runUtilities(c);
}

function sample(c: City): void {
  const L = c.s.last;
  c.s.samples.push({
    tick: c.s.tick,
    pop: L.pop,
    jobs: L.jobs,
    money: Math.round(c.s.money),
    happy: Math.round(L.happy),
    commute: Math.round(L.commute * 10) / 10,
    air: Math.round(L.air * 10) / 10,
    traffic: Math.round(L.traffic * 100) / 100,
    unemployment: L.workers ? Math.round((1 - L.employed / L.workers) * 1000) / 1000 : 0,
  });
  // Keep the history bounded: thin out older samples.
  if (c.s.samples.length > 720) c.s.samples = c.s.samples.filter((_, i) => i % 2 === 0 || i > 360);
}

export function newCity(settings: Settings): City {
  const c = new City(newCityState(settings));
  c.history('founding', 3, `${settings.name} is founded.`, c.idx(c.s.buildings[1].x, c.s.buildings[1].y));
  refresh(c);
  return c;
}

export function saveCity(c: City): string {
  c.syncRng();
  return toJson(c.s);
}

export function loadCity(json: string): City {
  const state = fromJson<CityState>(json);
  if (!state || typeof state !== 'object' || !state.tiles || !state.settings) throw new Error('This is not a Micro City save.');
  if (state.version > SAVE_VERSION) throw new Error('This save is from a newer version of Micro City.');
  const c = new City(state);
  refresh(c, true);
  return c;
}
