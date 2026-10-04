import { Relief, T } from '../data/terrain';
import type { Game } from './game';
import type { HistoryEvent } from './state';

/**
 * Record a moment in history. The text is written now, with the names of the
 * moment, so later renamings or conquests never rewrite the past.
 */
export function logHistory(g: Game, kind: string, imp: number, civs: number[], text: string, tile = -1): HistoryEvent {
  const ev: HistoryEvent = { turn: g.s.turn, kind, imp, civs, text, tile };
  g.s.history.push(ev);
  g.emit({ type: 'history', event: ev });
  const pid = g.s.playerId;
  if (civs.includes(pid)) g.notify(text, 'history', tile);
  else if (imp >= 3 && (civs.length === 0 || civs.some((c) => g.knows(pid, c)))) g.notify(text, 'history', tile);
  return ev;
}

export function knownTo(g: Game, ev: HistoryEvent, civId: number): boolean {
  if (ev.civs.length === 0) return true;
  return ev.civs.some((c) => g.knows(civId, c));
}

export function riverName(g: Game, tile: number): string | null {
  const map = g.s.map;
  const check = (t: number) => {
    const id = map.riverId[t];
    return id >= 0 && g.s.rivers[id] ? g.s.rivers[id].name : null;
  };
  const own = check(tile);
  if (own) return own;
  for (const n of g.grid.neighborList(tile)) {
    const r = check(n);
    if (r) return r;
  }
  return null;
}

export function regionName(g: Game, tile: number): string {
  const r = g.s.regions[g.s.map.region[tile]];
  return r?.name ?? '';
}

/** A short geographic phrase: "beside the River Nara", "on the shores of Lake Ul". */
export function describePlace(g: Game, tile: number): string {
  const map = g.s.map;
  const river = riverName(g, tile);
  if (river) return `beside the River ${river}`;
  for (const n of g.grid.neighborList(tile)) {
    const t = map.terrain[n];
    if (t === T.Lake) {
      const name = regionName(g, n);
      return name ? `on the shores of ${name}` : 'on the shore of a quiet lake';
    }
  }
  for (const n of g.grid.neighborList(tile)) {
    const t = map.terrain[n];
    if (t === T.Coast || t === T.Ocean) {
      const name = regionName(g, n);
      return name ? `on the coast of ${name}` : 'by the sea';
    }
  }
  const land = regionName(g, tile);
  const where = land ? ` of ${land}` : '';
  if (map.relief[tile] === Relief.Hills) return `in the hills${where}`;
  const terr = map.terrain[tile];
  if (terr === T.Desert) return `in the deserts${where}`;
  if (terr === T.Tundra) return `on the cold steppes${where}`;
  if (map.feature[tile] === 1) return `in the forests${where}`;
  return `on the plains${where}`;
}
