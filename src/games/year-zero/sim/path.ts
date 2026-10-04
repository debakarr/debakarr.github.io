import { F, Relief, T } from '../data/terrain';
import { UNIT, type UnitDef } from '../data/units';
import type { Game } from './game';
import type { Civ, Unit } from './state';
import { isWater } from './tiles';

// Movement rules plus a bounded A*. Pathfinding only runs on demand (an order
// is issued or an AI unit decides), never per frame.

export function maxMoves(g: Game, u: Unit): number {
  const def = UNIT[u.type];
  let m = def.moves;
  const civ = g.civ(u.civId);
  if (def.cls === 'naval') {
    if (civ.identity.includes('maritime')) m += 1;
    const leader = civ.leaderId >= 0 ? g.s.leaders[civ.leaderId] : undefined;
    if (leader?.traits.includes('navigator')) m += 1;
    if (g.s.worldWonders.beacon?.civId === civ.id) m += 1;
  }
  return m;
}

function embarkAllowed(civ: Civ, terrain: number): boolean {
  if (terrain === T.Ocean) return civ.techs.navigation !== undefined;
  return civ.techs.sailing !== undefined;
}

/**
 * Cost to step from `from` into `to`, ignoring other units.
 * Returns Infinity when the terrain itself forbids it.
 */
export function terrainCost(g: Game, civ: Civ, def: UnitDef, from: number, to: number): number {
  const map = g.s.map;
  if (map.feature[to] === F.Ice) return Infinity;
  if (def.cls === 'air') return 1;
  const water = isWater(map, to);
  const cityId = map.cityAt[to];
  if (def.cls === 'naval') {
    if (!water) {
      if (cityId >= 0 && g.s.cities[cityId].civId === civ.id) return 1;
      return Infinity;
    }
    if (def.coastal && map.terrain[to] === T.Ocean) return Infinity;
    return 1;
  }
  if (water) return embarkAllowed(civ, map.terrain[to]) ? 1 : Infinity;
  if (map.relief[to] === Relief.Mountain) return Infinity;
  if (map.road[from] && map.road[to] && !isWater(map, from)) {
    return map.road[from] >= 2 && map.road[to] >= 2 ? 0.125 : 0.34;
  }
  const f = map.feature[to];
  if (map.relief[to] === Relief.Hills || f === F.Forest || f === F.Jungle || f === F.Marsh) return 2;
  return 1;
}

export type Block = 'free' | 'blocked' | 'enemy';

/** Can this unit end up on `tile`, given other units and cities? */
export function occupancy(g: Game, u: Unit, tile: number): Block {
  const cityId = g.s.map.cityAt[tile];
  if (cityId >= 0) {
    const c = g.s.cities[cityId];
    if (c.civId !== u.civId) return g.atWar(u.civId, c.civId) ? 'enemy' : 'blocked';
  }
  const ids = g.unitsAt.get(tile);
  if (ids) {
    for (const id of ids) {
      const o = g.s.units[id];
      if (!o || o.civId === u.civId) continue;
      return g.atWar(u.civId, o.civId) ? 'enemy' : 'blocked';
    }
  }
  return 'free';
}

class Heap {
  items: number[] = [];
  pri: number[] = [];
  push(item: number, p: number) {
    const items = this.items;
    const pri = this.pri;
    items.push(item);
    pri.push(p);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= pri[i]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      [pri[parent], pri[i]] = [pri[i], pri[parent]];
      i = parent;
    }
  }
  pop(): number {
    const items = this.items;
    const pri = this.pri;
    const top = items[0];
    const lastI = items.pop()!;
    const lastP = pri.pop()!;
    if (items.length) {
      items[0] = lastI;
      pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && pri[l] < pri[m]) m = l;
        if (r < items.length && pri[r] < pri[m]) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        [pri[m], pri[i]] = [pri[i], pri[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

let scratchSize = 0;
let gScore: Float32Array = new Float32Array(0);
let cameFrom: Int32Array = new Int32Array(0);
let stamp: Uint32Array = new Uint32Array(0);
let stampGen = 1;

function ensureScratch(n: number) {
  if (scratchSize === n) return;
  scratchSize = n;
  gScore = new Float32Array(n);
  cameFrom = new Int32Array(n);
  stamp = new Uint32Array(n);
  stampGen = 1;
}

export interface PathOptions {
  maxNodes?: number;
  /** Allow the final tile to hold an enemy (to path up to an attack). */
  attackTarget?: boolean;
  /** Treat foreign units as passable (for planning only). */
  ignoreUnits?: boolean;
}

/**
 * A* from the unit's tile to `target`. Returns the tiles to walk (excluding
 * the start), or null. When attacking, the last tile is the enemy's tile.
 */
export function findPath(g: Game, u: Unit, target: number, opts: PathOptions = {}): number[] | null {
  const start = u.tile;
  if (start === target) return [];
  const map = g.s.map;
  const n = map.w * map.h;
  ensureScratch(n);
  const gen = ++stampGen;
  if (gen > 0xfffffff0) {
    stamp.fill(0);
    stampGen = 1;
  }
  const civ = g.civ(u.civId);
  const def = UNIT[u.type];
  const grid = g.grid;
  const hMult = def.cls === 'air' || def.cls === 'naval' ? 1 : civ.techs.steam !== undefined ? 0.125 : civ.techs.wheel !== undefined ? 0.34 : 1;
  const maxNodes = opts.maxNodes ?? 3000;
  const landUnit = def.cls !== 'naval' && def.cls !== 'air';
  const heap = new Heap();
  stamp[start] = gen;
  gScore[start] = 0;
  cameFrom[start] = -1;
  heap.push(start, grid.distance(start, target) * hMult);
  let expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (cur === target) break;
    if (++expanded > maxNodes) return null;
    const base = cur * 6;
    for (let d = 0; d < 6; d++) {
      const nb = grid.neighbors[base + d];
      if (nb < 0) continue;
      let cost = terrainCost(g, civ, def, cur, nb);
      if (cost === Infinity) continue;
      if (!opts.ignoreUnits || nb === target) {
        const occ = occupancy(g, u, nb);
        if (occ === 'blocked' && !opts.ignoreUnits) continue;
        if (occ === 'enemy' && !(opts.attackTarget && nb === target)) continue;
      }
      if (landUnit && isWater(map, nb)) cost += 1.2;
      const tentative = gScore[cur] + cost;
      if (stamp[nb] !== gen || tentative < gScore[nb]) {
        stamp[nb] = gen;
        gScore[nb] = tentative;
        cameFrom[nb] = cur;
        heap.push(nb, tentative + grid.distance(nb, target) * hMult);
      }
    }
  }
  if (stamp[target] !== gen) return null;
  const path: number[] = [];
  let c = target;
  let guard = 0;
  while (c !== start && guard++ < 5000) {
    path.push(c);
    c = cameFrom[c];
    if (c < 0) return null;
  }
  path.reverse();
  return path;
}

/** Tiles this unit can still reach this turn (tile -> moves left on arrival). */
export function reachable(g: Game, u: Unit): Map<number, number> {
  const out = new Map<number, number>();
  if (u.moves <= 0) return out;
  const civ = g.civ(u.civId);
  const def = UNIT[u.type];
  const best = new Map<number, number>([[u.tile, u.moves]]);
  const frontier = [u.tile];
  while (frontier.length) {
    const cur = frontier.shift()!;
    const left = best.get(cur)!;
    if (left <= 0) continue;
    for (const nb of g.grid.neighborList(cur)) {
      const cost = terrainCost(g, civ, def, cur, nb);
      if (cost === Infinity) continue;
      const occ = occupancy(g, u, nb);
      if (occ !== 'free') continue;
      const rem = Math.max(0, left - cost);
      if ((best.get(nb) ?? -1) < rem) {
        best.set(nb, rem);
        out.set(nb, rem);
        frontier.push(nb);
      }
    }
  }
  return out;
}

/** For path previews: which turn the unit reaches each step (0 = this turn). */
export function pathTurns(g: Game, u: Unit, path: number[]): number[] {
  const civ = g.civ(u.civId);
  const def = UNIT[u.type];
  const full = maxMoves(g, u);
  let left = u.moves;
  let turn = 0;
  let prev = u.tile;
  const out: number[] = [];
  for (const t of path) {
    if (left <= 0) {
      turn++;
      left = full;
    }
    const c = terrainCost(g, civ, def, prev, t);
    left -= c === Infinity ? full : c;
    out.push(turn);
    prev = t;
  }
  return out;
}
