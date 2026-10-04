import { TECHS } from '../data/techs';
import { civPopulation } from './cities';
import type { Game } from './game';
import { logHistory } from './history';
import type { Civ } from './state';

// Legacies are ways to be remembered, not ways to end the game.

export interface LegacyDef {
  id: string;
  name: string;
  path: string;
  desc: string;
  progress: (g: Game, civ: Civ) => number;
}

function knownLiving(g: Game, civ: Civ): Civ[] {
  return g.aliveCivs().filter((c) => c.id !== civ.id && g.knows(civ.id, c.id));
}

export const LEGACIES: LegacyDef[] = [
  { id: 'scientific', name: 'Beyond the Sky', path: 'Scientific', desc: 'Launch a colony ship toward another star.',
    progress: (g, c) => ['colony_hull', 'colony_engine', 'colony_cryo'].filter((p) => c.projects[p] !== undefined).length / 3 },
  { id: 'cultural', name: 'Light of the World', path: 'Cultural', desc: 'Accumulate 30,000 culture and complete 4 wonders.',
    progress: (g, c) => Math.min(1, c.culture / 30000) * 0.6 + Math.min(1, c.stats.wondersBuilt / 4) * 0.4 },
  { id: 'economic', name: 'The Golden Thread', path: 'Economic', desc: 'Trade with every living people you know (at least 3) while holding 3,000 gold.',
    progress: (g, c) => {
      const known = knownLiving(g, c);
      const trading = known.filter((o) => c.relations[o.id]?.trade >= 0).length;
      return Math.min(1, trading / Math.max(3, known.length)) * 0.6 + Math.min(1, c.gold / 3000) * 0.4;
    } },
  { id: 'military', name: 'The Iron Crown', path: 'Military', desc: 'Hold the original capitals of three other peoples.',
    progress: (g, c) => {
      let held = 0;
      for (const o of g.s.civs) {
        if (o.id === c.id || o.originalCapitalTile < 0) continue;
        const city = g.cityAt(o.originalCapitalTile);
        if (city && city.civId === c.id) held++;
      }
      return Math.min(1, held / 3);
    } },
  { id: 'diplomatic', name: 'Concord of Nations', path: 'Diplomatic', desc: 'Be allied with or overlord of every living people you know (at least 3).',
    progress: (g, c) => {
      const known = knownLiving(g, c);
      const bound = known.filter((o) => c.relations[o.id]?.alliance >= 0 || o.vassalOf === c.id).length;
      return Math.min(1, bound / Math.max(3, known.length));
    } },
  { id: 'exploration', name: 'The Whole World', path: 'Exploration', desc: 'Explore 85% of the world before satellites map it.',
    progress: (g, c) => {
      if (c.projects.satellite !== undefined) return 0;
      let n = 0;
      for (let i = 0; i < c.explored.length; i++) n += c.explored[i];
      return Math.min(1, n / c.explored.length / 0.85);
    } },
  { id: 'survival', name: 'The Long Memory', path: 'Survival', desc: 'Endure until Year 500.',
    progress: (g, c) => (c.alive ? Math.min(1, g.turn / 500) : 0) },
  { id: 'population', name: 'The Multitude', path: 'Population', desc: 'Be home to half of all people in the world.',
    progress: (g, c) => {
      // Only meaningful once the world has filled up.
      if (g.turn < 150 || g.aliveCivs().length < 3) return 0;
      let total = 0;
      for (const o of g.aliveCivs()) total += civPopulation(g, o);
      return total ? Math.min(1, civPopulation(g, c) / total / 0.5) : 0;
    } },
  { id: 'technological', name: 'The Last Discovery', path: 'Technological', desc: 'Discover every technology.',
    progress: (g, c) => Object.keys(c.techs).length / TECHS.length },
  { id: 'historical', name: 'Keepers of History', path: 'Historical', desc: 'Live through 150 recorded events and 10 rulers.',
    progress: (g, c) => {
      const events = g.s.history.filter((h) => h.civs.includes(c.id)).length;
      const rulers = g.s.leaders.filter((l) => l.civId === c.id).length;
      return Math.min(1, events / 150) * 0.6 + Math.min(1, rulers / 10) * 0.4;
    } },
];

export function checkLegacies(g: Game, civ: Civ): string[] {
  const gained: string[] = [];
  for (const L of LEGACIES) {
    if (civ.legacies[L.id] !== undefined && L.id !== 'scientific') continue;
    if (L.id === 'scientific') {
      if (civ.legacies.scientific !== undefined && !g.s.firsts[`legacy-sci-${civ.id}`]) {
        g.s.firsts[`legacy-sci-${civ.id}`] = g.turn;
        gained.push(L.id);
      }
      continue;
    }
    if (L.progress(g, civ) >= 1) {
      civ.legacies[L.id] = g.turn;
      gained.push(L.id);
      const major = civ.isPlayer || L.id === 'cultural' || L.id === 'military' || L.id === 'technological';
      if (major) logHistory(g, 'legacy', civ.isPlayer ? 3 : 2, [civ.id], `The ${civ.name} earn a lasting legacy: ${L.name}.`);
    }
  }
  return gained;
}
