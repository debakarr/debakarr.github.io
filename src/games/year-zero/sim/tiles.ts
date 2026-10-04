import { F, IMPROVEMENTS, Imp, R, RESOURCES, Relief, T, TERRAIN, type Yields } from '../data/terrain';
import type { Civ, NaturalWonder, WorldMap } from './state';

export function isWater(map: WorldMap, i: number): boolean {
  return map.terrain[i] <= T.Lake;
}

export function isLand(map: WorldMap, i: number): boolean {
  return map.terrain[i] > T.Lake;
}

export function isOcean(map: WorldMap, i: number): boolean {
  return map.terrain[i] === T.Ocean;
}

export function canSettle(map: WorldMap, i: number): boolean {
  return (
    isLand(map, i) &&
    map.relief[i] !== Relief.Mountain &&
    map.terrain[i] !== T.Snow &&
    map.feature[i] !== F.Ice &&
    map.cityAt[i] < 0 &&
    map.wonder[i] < 0
  );
}

/** Is a strategic resource visible to this civ? (food and luxury are always visible) */
export function resourceVisible(civ: Civ | null, res: number): boolean {
  if (res === R.None) return false;
  const def = RESOURCES[res];
  if (!def.reveal) return true;
  return !!civ && civ.techs[def.reveal] !== undefined;
}

export function baseYield(map: WorldMap, i: number): Yields {
  const t = map.terrain[i];
  const base = TERRAIN[t].y;
  let food = base.food;
  let prod = base.prod;
  let trade = base.trade;
  const relief = map.relief[i];
  if (relief === Relief.Hills) {
    food = Math.min(food, 1);
    prod = 2;
  } else if (relief === Relief.Mountain) {
    food = 0;
    prod = 1;
    trade = 0;
  }
  switch (map.feature[i]) {
    case F.Forest:
      food = Math.min(food, 1);
      prod += 1;
      break;
    case F.Jungle:
      food = 1;
      prod = 0;
      break;
    case F.Marsh:
      food = 1;
      prod = 0;
      trade = 0;
      break;
    case F.Oasis:
      food = 3;
      trade = 2;
      break;
    case F.Floodplain:
      food = 3;
      break;
    case F.Ash:
      food += 1;
      prod += 1;
      break;
    case F.Ice:
      food = 0;
      prod = 0;
      trade = 0;
      break;
  }
  if (map.river[i] > 0) trade += 1;
  return { food, prod, trade };
}

/** Which improvement suits a tile (ignoring tech). */
export function idealImprovement(map: WorldMap, i: number): Imp {
  const res = map.resource[i];
  const t = map.terrain[i];
  if (isWater(map, i)) return res === R.Fish || t === T.Lake ? Imp.Boats : Imp.None;
  if (res === R.Oil) return Imp.OilWell;
  if (res === R.Cattle || res === R.Horses) return Imp.Pasture;
  if (res === R.Spices || res === R.Silk) return Imp.Plantation;
  if (res === R.Iron || res === R.Coal || res === R.Gems || res === R.RareMinerals || res === R.Uranium) return Imp.Mine;
  const relief = map.relief[i];
  if (relief === Relief.Mountain) return Imp.None;
  if (relief === Relief.Hills) return map.feature[i] === F.Forest ? Imp.Lumber : Imp.Mine;
  const f = map.feature[i];
  if (f === F.Forest) return Imp.Lumber;
  if (f === F.Jungle || f === F.Marsh || f === F.Ice) return Imp.None;
  if (t === T.Snow) return Imp.None;
  if (t === T.Desert && f !== F.Floodplain && f !== F.Oasis && map.river[i] === 0) return Imp.None;
  return Imp.Farm;
}

export function wonderAt(wonders: NaturalWonder[], map: WorldMap, i: number): NaturalWonder | null {
  const w = map.wonder[i];
  return w >= 0 ? wonders[w] : null;
}

/** Full tile yield for a civilization, including improvements and tech. */
export function tileYield(map: WorldMap, wonders: NaturalWonder[], civ: Civ | null, i: number): Yields {
  const y = baseYield(map, i);
  const res = map.resource[i];
  if (res !== R.None && resourceVisible(civ, res)) {
    const ry = RESOURCES[res].y;
    y.food += ry.food;
    y.prod += ry.prod;
    y.trade += ry.trade;
  }
  const w = map.wonder[i];
  if (w >= 0) {
    const fx = wonders[w].fx;
    y.food += fx.food;
    y.prod += fx.prod;
    y.trade += fx.trade;
  }
  const imp = map.improvement[i];
  if (imp !== Imp.None) {
    const iy = IMPROVEMENTS[imp].y;
    y.food += iy.food;
    y.prod += iy.prod;
    y.trade += iy.trade;
    if (civ) {
      const techs = civ.techs;
      if (imp === Imp.Farm) {
        if (techs.irrigation !== undefined && (map.river[i] > 0 || nearFreshWater(map, i))) y.food += 1;
        if (techs.refrigeration !== undefined) y.food += 1;
      }
      if (imp === Imp.Mine && techs.industrialization !== undefined) y.prod += 1;
      if (imp === Imp.Lumber && techs.ecology !== undefined) y.prod += 1;
      if (imp === Imp.Boats && techs.refrigeration !== undefined) y.food += 1;
    }
  }
  if (civ && civ.techs.computers !== undefined && y.trade > 0) y.trade += 1;
  if (map.road[i] >= 2 && y.prod > 0) y.prod += 1;
  return y;
}

export function nearFreshWater(map: WorldMap, i: number): boolean {
  const w = map.w;
  const row = (i / w) | 0;
  const col = i % w;
  const odd = row & 1;
  const deltas = odd
    ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
    : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  for (const [dc, dr] of deltas) {
    const c = col + dc;
    const r = row + dr;
    if (c < 0 || r < 0 || c >= w || r >= map.h) continue;
    const n = r * w + c;
    if (map.terrain[n] === T.Lake || map.river[n] > 0) return true;
  }
  return false;
}

export function tileValue(y: Yields, res: number): number {
  let v = y.food * 1.7 + y.prod * 1.15 + y.trade * 0.7;
  if (res !== R.None) v += RESOURCES[res].kind === 'luxury' ? 2.2 : 1.4;
  return v;
}

export interface SiteInfo {
  score: number;
  river: boolean;
  coast: boolean;
  lake: boolean;
  foodRes: number;
  luxRes: number;
}

/** How good a city site is. Used for start placement, AI settling and the player's tile tooltip. */
export function siteInfo(
  map: WorldMap,
  within: (c: number, r: number) => number[],
  neighbors: (i: number) => number[],
  center: number,
): SiteInfo {
  const info: SiteInfo = { score: -1, river: false, coast: false, lake: false, foodRes: 0, luxRes: 0 };
  if (!canSettle(map, center)) return info;
  let score = 0;
  for (const t of within(center, 2)) {
    const y = baseYield(map, t);
    const res = map.resource[t];
    const dist = t === center ? 0 : 1;
    let v = tileValue(y, res);
    if (dist && map.cityAt[t] >= 0) v -= 6;
    if (map.terrain[t] === T.Ocean) v *= 0.6;
    score += v;
    if (res !== R.None) {
      const kind = RESOURCES[res].kind;
      if (kind === 'food') info.foodRes++;
      if (kind === 'luxury') info.luxRes++;
    }
  }
  for (const n of neighbors(center)) {
    if (map.terrain[n] === T.Coast || map.terrain[n] === T.Ocean) info.coast = true;
    if (map.terrain[n] === T.Lake) info.lake = true;
  }
  info.river = map.river[center] > 0;
  if (info.river) score += 6;
  if (info.coast) score += 3;
  if (info.lake) score += 3;
  if (map.relief[center] === Relief.Hills) score += 2;
  const t = map.terrain[center];
  if (t === T.Tundra) score -= 6;
  if (t === T.Desert && !info.river) score -= 5;
  info.score = score;
  return info;
}
