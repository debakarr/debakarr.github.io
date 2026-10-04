import { BUILDING, MILESTONES, ROADS, Road, Ter, UNLOCK, Zone, type BuildingDef } from './defs';
import type { City } from './city';
import { FLAG_ABANDONED, FLAG_FIRE } from './state';

// Player actions. Each returns a result the UI can show; nothing is applied
// unless the whole action is valid and affordable.

export interface ActionResult {
  ok: boolean;
  cost: number;
  tiles: number[];
  reason?: string;
}

export function costMult(c: City): number {
  return c.s.policies.green ? 1.15 : 1;
}

export function unlocked(c: City, key: keyof typeof UNLOCK | string): boolean {
  if (key in UNLOCK) return c.s.milestone >= UNLOCK[key as keyof typeof UNLOCK];
  const def = BUILDING[key];
  return !!def && c.s.milestone >= def.unlock;
}

export function unlockName(key: string): string {
  const level = key in UNLOCK ? UNLOCK[key as keyof typeof UNLOCK] : BUILDING[key]?.unlock ?? 0;
  return MILESTONES[level].name;
}

function canBuildOn(c: City, i: number): boolean {
  const t = c.s.tiles;
  return t.ter[i] !== Ter.Water && t.ter[i] !== Ter.Rock && t.bld[i] < 0 && t.road[i] === Road.None;
}

/** Clear a zoned lot back to empty land (keeps the zone if asked). */
export function clearLot(c: City, i: number, keepZone = false): void {
  const t = c.s.tiles;
  t.level[i] = 0;
  t.occ[i] = 0;
  t.age[i] = 0;
  t.strain[i] = 0;
  t.flags[i] &= ~(FLAG_ABANDONED | FLAG_FIRE);
  if (!keepZone) {
    t.zone[i] = Zone.None;
    t.dense[i] = 0;
  }
}

/** An L-shaped path from a to b: along x first, then y (or the reverse if better). */
export function roadPath(c: City, a: number, b: number): number[] {
  const ax = c.x(a);
  const ay = c.y(a);
  const bx = c.x(b);
  const by = c.y(b);
  const build = (xFirst: boolean) => {
    const out: number[] = [];
    let x = ax;
    let y = ay;
    out.push(c.idx(x, y));
    const stepX = () => {
      while (x !== bx) {
        x += Math.sign(bx - x);
        out.push(c.idx(x, y));
      }
    };
    const stepY = () => {
      while (y !== by) {
        y += Math.sign(by - y);
        out.push(c.idx(x, y));
      }
    };
    if (xFirst) {
      stepX();
      stepY();
    } else {
      stepY();
      stepX();
    }
    return out;
  };
  const p1 = build(Math.abs(bx - ax) >= Math.abs(by - ay));
  const p2 = build(Math.abs(bx - ax) < Math.abs(by - ay));
  const bad = (p: number[]) => p.filter((i) => c.s.tiles.bld[i] >= 0 || c.s.tiles.ter[i] === Ter.Rock).length;
  return bad(p2) < bad(p1) ? p2 : p1;
}

export function planRoad(c: City, path: number[], type: Road): ActionResult {
  const t = c.s.tiles;
  const def = ROADS[type];
  let cost = 0;
  const tiles: number[] = [];
  for (const i of path) {
    if (i < 0) return { ok: false, cost: 0, tiles: [], reason: 'Off the map.' };
    if (t.bld[i] >= 0) return { ok: false, cost: 0, tiles: path, reason: 'A building is in the way.' };
    if (t.ter[i] === Ter.Rock) return { ok: false, cost: 0, tiles: path, reason: 'Rock is in the way.' };
    if (t.road[i] >= type) continue;
    const bridge = t.ter[i] === Ter.Water;
    cost += (def.cost - (t.road[i] ? ROADS[t.road[i]].cost : 0)) * (bridge ? 5 : 1);
    if (t.trees[i]) cost += 2;
    tiles.push(i);
  }
  cost = Math.round(cost * costMult(c));
  if (!tiles.length) return { ok: false, cost: 0, tiles: [], reason: 'Already built.' };
  if (cost > c.s.money) return { ok: false, cost, tiles, reason: 'Not enough money.' };
  return { ok: true, cost, tiles };
}

export function buildRoad(c: City, path: number[], type: Road): ActionResult {
  const plan = planRoad(c, path, type);
  if (!plan.ok) return plan;
  const t = c.s.tiles;
  for (const i of plan.tiles) {
    if (t.zone[i]) clearLot(c, i);
    t.road[i] = type;
    t.trees[i] = 0;
  }
  c.s.money -= plan.cost;
  c.dirtyNet = true;
  c.dirtyCov = true;
  firstOf(c, type === Road.Highway ? 'highway' : type === Road.Avenue ? 'avenue' : 'road', plan.tiles[0]);
  c.emit({ type: 'changed', tiles: plan.tiles });
  return plan;
}

export function rectTiles(c: City, a: number, b: number): number[] {
  const x0 = Math.min(c.x(a), c.x(b));
  const x1 = Math.max(c.x(a), c.x(b));
  const y0 = Math.min(c.y(a), c.y(b));
  const y1 = Math.max(c.y(a), c.y(b));
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(c.idx(x, y));
  return out;
}

export function planZone(c: City, tiles: number[], zone: Zone, dense: number): ActionResult {
  const t = c.s.tiles;
  const ok = tiles.filter((i) => canBuildOn(c, i) && (t.zone[i] !== zone || t.dense[i] !== dense || zone === Zone.None) && !(zone === Zone.None && !t.zone[i]));
  const cost = Math.round(ok.length * (zone === Zone.None ? 0 : 5) * costMult(c));
  if (!ok.length) return { ok: false, cost: 0, tiles: [], reason: zone === Zone.None ? 'Nothing to dezone.' : 'Nothing to zone here.' };
  if (cost > c.s.money) return { ok: false, cost, tiles: ok, reason: 'Not enough money.' };
  return { ok: true, cost, tiles: ok };
}

export function applyZone(c: City, tiles: number[], zone: Zone, dense: number): ActionResult {
  const plan = planZone(c, tiles, zone, dense);
  if (!plan.ok) return plan;
  const t = c.s.tiles;
  for (const i of plan.tiles) {
    if (t.zone[i] !== zone) clearLot(c, i);
    t.zone[i] = zone;
    t.dense[i] = zone === Zone.None ? 0 : dense;
  }
  c.s.money -= plan.cost;
  c.emit({ type: 'changed', tiles: plan.tiles });
  return plan;
}

export function footprint(c: City, def: BuildingDef, x: number, y: number): number[] {
  const out: number[] = [];
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) out.push(c.idx(x + dx, y + dy));
  return out;
}

/** Road tiles touching a footprint. */
export function frontage(c: City, tiles: number[]): number[] {
  const set = new Set(tiles);
  const out = new Set<number>();
  for (const i of tiles) {
    for (let d = 0; d < 4; d++) {
      const nb = c.nb[i * 4 + d];
      if (nb >= 0 && !set.has(nb) && c.s.tiles.road[nb]) out.add(nb);
    }
  }
  return [...out];
}

export function planBuilding(c: City, type: string, x: number, y: number): ActionResult {
  const def = BUILDING[type];
  if (!def) return { ok: false, cost: 0, tiles: [], reason: 'Unknown building.' };
  const tiles = footprint(c, def, x, y);
  if (tiles.some((i) => i < 0)) return { ok: false, cost: 0, tiles: [], reason: 'Off the map.' };
  const t = c.s.tiles;
  for (const i of tiles) {
    if (t.ter[i] === Ter.Water) return { ok: false, cost: 0, tiles, reason: 'Cannot build on water.' };
    if (t.ter[i] === Ter.Rock) return { ok: false, cost: 0, tiles, reason: 'Rock is in the way.' };
    if (t.bld[i] >= 0) return { ok: false, cost: 0, tiles, reason: 'Something is already here.' };
    if (t.road[i]) return { ok: false, cost: 0, tiles, reason: 'A road is in the way.' };
  }
  if (def.nearWater) {
    const touches = tiles.some((i) => [0, 1, 2, 3].some((d) => {
      const nb = c.nb[i * 4 + d];
      return nb >= 0 && t.ter[nb] === Ter.Water;
    }));
    if (!touches) return { ok: false, cost: 0, tiles, reason: 'Must touch water.' };
  }
  const needsRoad = def.cat !== 'park' && def.cat !== 'flood';
  if (needsRoad && !frontage(c, tiles).length) return { ok: false, cost: 0, tiles, reason: 'Needs a road alongside.' };
  if (type === 'cityhall' && Object.values(c.s.buildings).some((b) => b.type === 'cityhall')) {
    return { ok: false, cost: 0, tiles, reason: 'You already have a City Hall.' };
  }
  const developed = tiles.filter((i) => t.level[i] > 0).length;
  const cost = Math.round((def.cost + developed * 50) * costMult(c));
  if (cost > c.s.money) return { ok: false, cost, tiles, reason: 'Not enough money.' };
  return { ok: true, cost, tiles };
}

export function placeBuilding(c: City, type: string, x: number, y: number): ActionResult {
  const plan = planBuilding(c, type, x, y);
  if (!plan.ok) return plan;
  const t = c.s.tiles;
  const id = c.nextId();
  c.s.buildings[id] = { id, type, x, y, built: c.s.tick };
  for (const i of plan.tiles) {
    clearLot(c, i);
    t.bld[i] = id;
    t.trees[i] = BUILDING[type].cat === 'park' ? Math.max(t.trees[i], 2) : 0;
  }
  c.s.money -= plan.cost;
  c.dirtyNet = true;
  c.dirtyCov = true;
  firstOf(c, type, plan.tiles[0]);
  c.emit({ type: 'changed', tiles: plan.tiles });
  return plan;
}

export function planBulldoze(c: City, tiles: number[]): ActionResult {
  const t = c.s.tiles;
  const hit = new Set<number>();
  let cost = 0;
  const blds = new Set<number>();
  for (const i of tiles) {
    if (i < 0) continue;
    if (t.bld[i] >= 0) {
      const b = c.s.buildings[t.bld[i]];
      if (b && b.type !== 'cityhall') blds.add(b.id);
      continue;
    }
    if (t.road[i]) {
      hit.add(i);
      cost += 2;
    } else if (t.level[i] > 0 || t.zone[i]) {
      hit.add(i);
      cost += t.level[i] * 20;
    } else if (t.trees[i]) {
      hit.add(i);
      cost += 3;
    }
  }
  for (const id of blds) {
    const b = c.s.buildings[id];
    for (const i of footprint(c, BUILDING[b.type], b.x, b.y)) hit.add(i);
    cost += Math.round(BUILDING[b.type].cost * 0.05);
  }
  if (!hit.size) return { ok: false, cost: 0, tiles: [], reason: 'Nothing to clear.' };
  if (cost > c.s.money) return { ok: false, cost, tiles: [...hit], reason: 'Not enough money.' };
  return { ok: true, cost, tiles: [...hit] };
}

export function bulldoze(c: City, tiles: number[]): ActionResult {
  const plan = planBulldoze(c, tiles);
  if (!plan.ok) return plan;
  const t = c.s.tiles;
  for (const i of plan.tiles) {
    if (t.bld[i] >= 0) {
      const id = t.bld[i];
      if (c.s.buildings[id]) delete c.s.buildings[id];
      t.bld[i] = -1;
    }
    if (t.road[i]) t.road[i] = Road.None;
    else if (t.level[i] > 0 || t.zone[i]) clearLot(c, i);
    t.trees[i] = 0;
    if (t.ter[i] === Ter.Forest) t.ter[i] = Ter.Grass;
  }
  c.s.money -= plan.cost;
  c.dirtyNet = true;
  c.dirtyCov = true;
  c.emit({ type: 'changed', tiles: plan.tiles });
  return plan;
}

/** Record "firsts" for the timeline. */
function firstOf(c: City, key: string, tile: number): void {
  if (c.s.firsts[key] !== undefined) return;
  c.s.firsts[key] = c.s.tick;
  const def = BUILDING[key];
  const text: Record<string, string> = {
    road: '',
    avenue: 'The first avenue is laid.',
    highway: 'The first highway opens.',
    metro: 'The metro system opens.',
    bus: 'The first bus line begins service.',
    university: 'The university opens its doors.',
    hospital: 'The first hospital opens.',
    airport: 'The airport opens: the city is connected to the world.',
    stadium: 'The stadium hosts its first match.',
    nuclear: 'The nuclear plant goes online.',
    fusion: 'The fusion reactor ignites.',
    tvtower: 'The TV tower rises over the skyline.',
    drain: 'The first stormwater drains are dug.',
    levee: 'The first flood wall rises along the water.',
  };
  const line = text[key] ?? (def && def.cat !== 'park' && key !== 'cityhall' ? `The first ${def.name.toLowerCase()} is built.` : '');
  if (line) c.history('first', key === 'metro' || key === 'airport' || key === 'university' ? 3 : 2, line, tile);
}
