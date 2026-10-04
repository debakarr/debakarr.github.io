import { advancePlayerOrders, aiTurn } from './ai';
import { processCity } from './cities';
import { processCivEconomy, sampleStats } from './civs';
import { tickRelations } from './diplomacy';
import { autoResolve, rollEvents, rollVolcanoes, tickPlagues, recordFamine, raise } from './events';
import type { Game } from './game';
import { driftTraits, updateEra, updateIdentity } from './identity';
import { checkLegacies } from './legacies';
import { tickLeader } from './leaders';
import { cityBombard, startTurnUnits } from './units';
import { recomputeVisibility } from './visibility';

// The world only moves when a turn ends: no per-frame simulation.

export type Yielder = () => Promise<void>;

export const yieldToMain: Yielder = () => new Promise((r) => setTimeout(r, 0));

export interface TurnOptions {
  /** The AI also governs the player's civilization (used for autoplay and tests). */
  autoPlayer?: boolean;
  yielder?: Yielder;
  onStage?: (label: string, fraction: number) => void;
}

export async function endTurn(g: Game, opts: TurnOptions = {}): Promise<{ legacies: string[] }> {
  const yielder = opts.yielder ?? yieldToMain;
  const s = g.s;
  const player = g.player;
  g.autoplay = !!opts.autoPlayer;
  autoResolve(g, g.autoplay);
  if (opts.autoPlayer && player.alive) aiTurn(g, player);

  const ais = s.civs.filter((c) => c.alive && !c.isPlayer);
  let k = 0;
  for (const civ of ais) {
    opts.onStage?.(`The ${civ.name} deliberate…`, 0.1 + (0.6 * k++) / Math.max(1, ais.length));
    aiTurn(g, civ);
    await yielder();
  }
  opts.onStage?.('The seasons turn…', 0.75);

  for (const city of Object.values(s.cities)) cityBombard(g, city);

  for (const civ of s.civs) {
    if (!civ.alive) continue;
    const before = new Map(g.citiesOf(civ.id).map((c) => [c.id, c.size]));
    for (const city of [...g.citiesOf(civ.id)]) if (s.cities[city.id]) processCity(g, city);
    if (!civ.alive) continue;
    processCivEconomy(g, civ);
    tickRelations(g, civ);
    tickPlagues(g, civ);
    // Famine: several cities starving in the same year.
    const shrunk = g.citiesOf(civ.id).filter((c) => (before.get(c.id) ?? 0) > c.size && c.lastHit?.turn === g.turn && (c.lastHit.cause === 'famine' || c.lastHit.cause === 'drought'));
    if (shrunk.length >= 2 || (shrunk.length === 1 && shrunk[0].lastHit?.cause === 'drought')) recordFamine(g, civ, shrunk);
    if (tickLeader(g, civ) === 'crisis') raise(g, civ, 'crisis');
    rollEvents(g, civ);
    if ((g.turn + civ.id) % 5 === 0) {
      driftTraits(g, civ);
      updateIdentity(g, civ);
    }
    updateEra(g, civ);
  }
  rollVolcanoes(g);

  let pollution = 0;
  for (const civ of s.civs) if (civ.alive) pollution += civ.pollution;
  s.globalPollution = pollution;

  const gained: string[] = [];
  for (const civ of s.civs) {
    if (!civ.alive) continue;
    const got = checkLegacies(g, civ);
    if (civ.isPlayer) gained.push(...got);
  }

  s.turn++;
  if (s.turn % 5 === 0) sampleStats(g);
  opts.onStage?.('A new year dawns…', 0.95);
  for (const civ of s.civs) {
    if (!civ.alive) continue;
    startTurnUnits(g, civ);
    recomputeVisibility(g, civ);
  }
  if (player.alive && !opts.autoPlayer) advancePlayerOrders(g, player);
  if (player.alive) recomputeVisibility(g, player);
  // Keep history from growing without bound in very long games: trim minor events.
  if (s.history.length > 6000) s.history = s.history.filter((h, i) => h.imp >= 2 || i > s.history.length - 1500);
  g.syncRng();
  return { legacies: gained };
}
