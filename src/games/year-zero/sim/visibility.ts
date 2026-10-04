import { UNIT } from '../data/units';
import { meet } from './diplomacy';
import type { Game } from './game';
import { logHistory } from './history';
import { shiftTrait } from './identity';
import type { Civ, Ruin } from './state';
import { aiResolveRuin } from './events';

// Fog of war: `explored` is permanent knowledge, `visible` is this moment.

function markTile(g: Game, civ: Civ, t: number, fresh: number[]): void {
  if (!civ.visible[t]) {
    civ.visible[t] = 1;
    fresh.push(t);
  }
  civ.explored[t] = 1;
}

export function revealAround(g: Game, civ: Civ, tile: number, radius: number): void {
  const fresh: number[] = [];
  for (const t of g.grid.within(tile, radius)) markTile(g, civ, t, fresh);
  discover(g, civ, fresh);
  if (civ.isPlayer && fresh.length) g.emit({ type: 'reveal' });
}

export function recomputeVisibility(g: Game, civ: Civ): void {
  civ.visible.fill(0);
  if (!civ.alive) return;
  const fresh: number[] = [];
  const map = g.s.map;
  for (const c of g.citiesOf(civ.id)) {
    for (const t of g.grid.within(c.tile, c.size >= 8 ? 3 : 2)) markTile(g, civ, t, fresh);
  }
  for (const u of g.unitsOf(civ.id)) {
    const def = UNIT[u.type];
    let s = def.sight ?? 2;
    if (def.cls !== 'air' && def.cls !== 'naval' && map.relief[u.tile] === 1) s++;
    for (const t of g.grid.within(u.tile, s)) markTile(g, civ, t, fresh);
  }
  const owner = map.owner;
  for (let i = 0; i < owner.length; i++) if (owner[i] === civ.id) markTile(g, civ, i, fresh);
  // Allies share sight.
  for (const k in civ.relations) {
    const rel = civ.relations[k];
    if (rel.alliance < 0) continue;
    for (const c of g.citiesOf(Number(k))) markTile(g, civ, c.tile, fresh);
  }
  discover(g, civ, fresh);
}

/** Check freshly visible tiles for wonders and other peoples. */
function discover(g: Game, civ: Civ, tiles: number[]): void {
  const map = g.s.map;
  for (const t of tiles) {
    const w = map.wonder[t];
    if (w >= 0) {
      const wonder = g.s.wonders[w];
      if (!wonder.discoveredBy.includes(civ.id)) {
        const first = wonder.discoveredBy.length === 0;
        wonder.discoveredBy.push(civ.id);
        if (first) {
          civ.culture += 20;
          logHistory(g, 'wonder-found', civ.isPlayer ? 3 : 2, [civ.id],
            `${civ.adj} explorers are the first to behold ${wonder.name}. ${wonder.desc}`, t);
        } else if (civ.isPlayer) {
          g.notify(`We have found ${wonder.name}. ${wonder.desc}`, 'good', t);
        }
      }
    }
    const owner = map.owner[t];
    if (owner >= 0 && owner !== civ.id && !civ.relations[owner]) meet(g, civ.id, owner);
    const ids = g.unitsAt.get(t);
    if (ids) {
      for (const id of ids) {
        const u = g.s.units[id];
        if (u && u.civId !== civ.id && !civ.relations[u.civId]) meet(g, civ.id, u.civId);
      }
    }
  }
}

export function exploreRuin(g: Game, civ: Civ, ruin: Ruin): void {
  if (!ruin || ruin.exploredBy.includes(civ.id)) return;
  ruin.exploredBy.push(civ.id);
  civ.stats.ruinsExplored++;
  const age = g.turn - ruin.fell;
  if (civ.isPlayer) {
    logHistory(g, 'ruins', 2, [civ.id],
      ruin.prehistoric
        ? `${civ.adj} explorers uncover the ruins of ${ruin.name}, a city of the forgotten ${ruin.civName}, abandoned some ${Math.round(age / 50) * 50} years ago.`
        : `${civ.adj} explorers find the ruins of ${ruin.name}, once a city of the ${ruin.civName}.`, ruin.tile);
    g.s.decisions.push({ id: g.nextId(), civId: civ.id, event: 'ruin', turn: g.turn, params: { ruinId: ruin.id } });
    g.emit({ type: 'decision' });
  } else {
    shiftTrait(civ, 'scientific', 0.5);
    aiResolveRuin(g, civ, ruin);
  }
}
