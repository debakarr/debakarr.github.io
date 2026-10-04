import { placeName } from '../core/names';
import { BUILDING, BUILDINGS, PROJECT, PROJECTS, WONDER, WONDERS, type Effects } from '../data/buildings';
import { GOV } from '../data/society';
import { IMPROVEMENTS, Imp, T } from '../data/terrain';
import { UNIT, UNITS, type UnitDef } from '../data/units';
import { governorPick } from './ai';
import { addMemory, addWarScore, hasResource, invalidateResources, luxuries, warBetween, weariness } from './diplomacy';
import type { Game } from './game';
import { describePlace, logHistory } from './history';
import { shiftTrait } from './identity';
import { addDeed, currentLeader, leaderHas } from './leaders';
import { findPath } from './path';
import type { BuildItem, City, Civ, Focus, Unit } from './state';
import { idealImprovement, isWater, tileValue, tileYield } from './tiles';
import { createUnit } from './units';
import { collapseCiv, completeProject } from './civs';

export const FOCUS_SPLIT: Record<Focus, [number, number, number]> = {
  balanced: [0.5, 0.3, 0.2],
  food: [0.5, 0.3, 0.2],
  production: [0.5, 0.3, 0.2],
  science: [0.72, 0.18, 0.1],
  wealth: [0.2, 0.7, 0.1],
  culture: [0.25, 0.15, 0.6],
};

export function realPopulation(city: City, civ: Civ): number {
  const base = Math.pow(city.size, 2.65) * 1000 * (1 + 0.2 * civ.eraTier);
  const jitter = 0.92 + 0.16 * ((city.popSeed % 1000) / 1000);
  return Math.floor(base * jitter + (city.popSeed % 997));
}

export function civPopulation(g: Game, civ: Civ): number {
  let p = 0;
  for (const c of g.citiesOf(civ.id)) p += realPopulation(c, civ);
  return p;
}

export function sizeCap(city: City): number {
  let cap = 8;
  const b = city.buildings;
  if (b.includes('aqueduct')) cap += 8;
  if (b.includes('hospital')) cap += 8;
  if (b.includes('geneclinic')) cap += 8;
  if (b.includes('arcology')) cap += 10;
  if (b.includes('synthfoundry')) cap += 6;
  return cap;
}

export function growthNeeded(g: Game, size: number): number {
  return Math.round((13 + 6 * size + Math.pow(size, 1.7)) * g.paceMult());
}

function cityEffects(g: Game, city: City, civ: Civ): Effects {
  const total: Required<Effects> = {
    food: 0, prod: 0, sci: 0, gold: 0, cult: 0, happy: 0, foodPct: 0, prodPct: 0, sciPct: 0, goldPct: 0, cultPct: 0,
    defense: 0, hp: 0, foodKeep: 0, plagueResist: 0, pollution: 0, cleanup: 0, seaFood: 0, unitPct: 0,
  };
  const add = (fx: Effects) => {
    for (const k in fx) {
      const key = k as keyof Effects;
      total[key] += fx[key] ?? 0;
    }
  };
  for (const b of city.buildings) if (BUILDING[b]) add(BUILDING[b].fx);
  for (const w of city.wonders) if (WONDER[w]) add(WONDER[w].fx);
  for (const id in g.s.worldWonders) {
    const ww = g.s.worldWonders[id];
    if (ww.civId === civ.id && WONDER[id]?.global) add(WONDER[id].global!);
  }
  if (civ.projects.station !== undefined) total.sciPct += 10;
  return total;
}

/** Tiles this city may work. */
export function cityTiles(g: Game, city: City): number[] {
  const map = g.s.map;
  const out: number[] = [];
  for (const t of g.grid.within(city.tile, 3)) {
    if (t === city.tile) continue;
    if (map.cityOf[t] !== city.id) continue;
    out.push(t);
  }
  return out;
}

function focusScore(focus: Focus, f: number, p: number, t: number, hungry: boolean): number {
  const fw = hungry ? 3.2 : 2;
  switch (focus) {
    case 'food': return f * 4 + p * 1.2 + t;
    case 'production': return f * 1.6 + p * 4 + t * 0.8;
    case 'science':
    case 'wealth':
    case 'culture': return f * 1.7 + p * 1.3 + t * 3;
    default: return f * fw + p * 2.1 + t * 1.3;
  }
}

/** Recompute worked tiles and all yields for a city. Cheap enough to run every turn. */
export function computeCity(g: Game, city: City): void {
  const civ = g.civ(city.civId);
  const map = g.s.map;
  const wonders = g.s.wonders;
  const gov = GOV[civ.government];
  const fx = cityEffects(g, city, civ);
  const seaFood = fx.seaFood ?? 0;

  const center = tileYield(map, wonders, civ, city.tile);
  center.food = Math.max(2, center.food);
  center.prod = Math.max(1, center.prod);
  center.trade = Math.max(1, center.trade);

  const enemyOn = (t: number) => g.unitsOn(t).some((u) => g.atWar(u.civId, civ.id));
  const cands = cityTiles(g, city)
    .filter((t) => !enemyOn(t))
    .map((t) => {
      const y = tileYield(map, wonders, civ, t);
      if (isWater(map, t)) y.food += seaFood;
      return { t, y };
    });
  const hungry = city.size < 4;
  cands.sort((a, b) => focusScore(city.focus, b.y.food, b.y.prod, b.y.trade, hungry) - focusScore(city.focus, a.y.food, a.y.prod, a.y.trade, hungry));
  const n = Math.min(city.size, cands.length);
  const worked = cands.slice(0, n);
  // Never starve by choice: swap in food tiles if the selection can't feed the city.
  let food = center.food + worked.reduce((s, c) => s + c.y.food, 0) + (fx.food ?? 0);
  if (food < city.size * 2) {
    const spare = cands.slice(n).sort((a, b) => b.y.food - a.y.food);
    for (let k = worked.length - 1; k >= 0 && food < city.size * 2 && spare.length; k--) {
      const best = spare[0];
      if (best.y.food <= worked[k].y.food) break;
      food += best.y.food - worked[k].y.food;
      spare.shift();
      worked[k] = best;
    }
  }
  city.worked = worked.map((c) => c.t);
  const specialists = Math.max(0, city.size - worked.length);

  let f = center.food;
  let p = center.prod;
  let tr = center.trade;
  for (const c of worked) {
    f += c.y.food;
    p += c.y.prod;
    tr += c.y.trade;
  }
  f += fx.food ?? 0;
  p += fx.prod ?? 0;

  // Modifiers from traits, leaders and temporary events.
  const lead = currentLeader(g, civ);
  const lt = (id: string) => !!lead && lead.traits.includes(id as never);
  const has = (id: string) => civ.identity.includes(id as never);
  let foodMult = 1 + (fx.foodPct ?? 0) / 100;
  let prodPct = (fx.prodPct ?? 0) + gov.prodPct;
  let sciPct = (fx.sciPct ?? 0) + gov.sciPct;
  let goldPct = (fx.goldPct ?? 0) + gov.goldPct;
  let cultPct = (fx.cultPct ?? 0) + gov.cultPct;
  if (has('collectivist')) prodPct += 10;
  if (has('scientific')) sciPct += 10;
  if (has('secular')) sciPct += 10;
  if (has('mercantile')) goldPct += 15;
  if (has('artistic')) cultPct += 15;
  if (has('individualist')) {
    sciPct += 5;
    goldPct += 5;
  }
  if (has('religious')) cultPct += 10;
  if (lt('scholar')) sciPct += 10;
  if (lt('visionary')) {
    sciPct += 10;
    cultPct += 10;
  }
  if (lt('mercantile')) goldPct += 15;
  if (lt('pious')) cultPct += 15;
  if (lt('charismatic')) cultPct += 10;
  if (lt('pragmatic')) prodPct += 5;
  if (civ.purpose === 'stars') sciPct += 15;
  if (civ.purpose === 'arts') cultPct += 25;
  if (civ.purpose === 'machines') prodPct += 15;
  let happyMod = 0;
  for (const m of civ.modifiers) {
    if (m.cityId !== undefined && m.cityId !== city.id) continue;
    switch (m.kind) {
      case 'drought':
        foodMult *= 1 - m.value;
        break;
      case 'golden':
        prodPct += m.value;
        cultPct += m.value;
        goldPct += m.value;
        break;
      case 'crash':
        goldPct -= m.value;
        break;
      case 'mood':
        happyMod += m.value;
        break;
      case 'plague':
        foodMult *= 0.7;
        break;
      case 'breakthrough':
        sciPct += m.value;
        break;
      case 'quarantine':
        goldPct -= 30;
        break;
    }
  }
  if (civ.anarchy > 0) {
    sciPct -= 50;
    goldPct -= 50;
    prodPct -= 30;
    cultPct -= 50;
  }

  // Waste grows with distance from the capital.
  const cap = g.capital(civ);
  let waste = 0;
  if (!cap) waste = 0.25;
  else if (cap.id !== city.id) waste = Math.min(0.45, gov.corruption * g.grid.distance(cap.tile, city.tile));

  const [ss, gs, cs] = FOCUS_SPLIT[city.focus];
  const specYield = specialists * 2;
  let sci = tr * ss + (fx.sci ?? 0) + (city.focus === 'science' ? specYield : specialists);
  let gold = tr * gs + (fx.gold ?? 0) + (city.focus === 'wealth' ? specYield : 0);
  let cult = tr * cs + (fx.cult ?? 0) + 1 + (city.focus === 'culture' ? specYield : 0);
  if (city.id === civ.capitalId) {
    sci += 2;
    gold += 2;
    cult += 1;
  }
  if (has('maritime') && city.buildings.includes('harbor')) gold += 1;
  if (has('religious') && (city.buildings.includes('shrine') || city.buildings.includes('temple'))) cult += 1;
  if (civ.government === 'theocracy') cult += city.buildings.includes('temple') ? 2 : 0;
  const w = map.wonder[city.tile];
  if (w >= 0) {
    sci += g.s.wonders[w].fx.sci;
    cult += g.s.wonders[w].fx.cult;
  }
  for (const t of city.worked) {
    const wi = map.wonder[t];
    if (wi >= 0) {
      sci += g.s.wonders[wi].fx.sci;
      cult += g.s.wonders[wi].fx.cult;
    }
  }

  const bonus = g.aiBonus(civ);
  const prod = Math.max(0, p * (1 + prodPct / 100) * (1 - waste) * bonus);
  sci = Math.max(0, sci * (1 + sciPct / 100) * bonus);
  gold = Math.max(0, gold * (1 + goldPct / 100) * (1 - waste * 0.6));
  cult = Math.max(0, cult * (1 + cultPct / 100));
  f = f * foodMult * (civ.isPlayer ? 1 : Math.min(1.15, bonus));

  // Mood.
  const cities = g.citiesOf(civ.id).length;
  let happy = 4 + (civ.eraTier >= 5 ? 1 : 0) + (civ.eraTier >= 8 ? 1 : 0) + (civ.isPlayer && g.s.settings.difficulty === 0 ? 1 : 0);
  happy += fx.happy ?? 0;
  happy += Math.min(6, luxuries(g, civ.id).size);
  happy += gov.happyPerCity;
  if (lt('patient')) happy += 1;
  if (lt('pious') && (city.buildings.includes('shrine') || city.buildings.includes('temple'))) happy += 1;
  if (has('isolationist')) happy += 1;
  if (gov.garrisonHappy && g.unitsOn(city.tile).some((u) => UNIT[u.type].str > 0 && u.civId === civ.id)) happy += 1;
  if (map.wonder[city.tile] >= 0) happy += g.s.wonders[map.wonder[city.tile]].fx.happy;
  for (const t of city.worked) if (map.wonder[t] >= 0) happy += g.s.wonders[map.wonder[t]].fx.happy;
  happy += happyMod;
  let unhappy = Math.round(city.size * 0.8);
  unhappy += Math.floor(Math.max(0, cities - gov.freeCities) * 0.5);
  unhappy += weariness(g, civ);
  if (lt('cruel')) unhappy += 1;
  if (city.resistance > 0) unhappy += 2;
  if (civ.purpose === null && civ.techs.postscarcity !== undefined) unhappy += 1;
  if (civ.techs.postscarcity !== undefined) unhappy = Math.max(0, unhappy - Math.floor(city.size / 3));
  const mood = happy - unhappy;

  let foodNet = f - city.size * 2;
  if (civ.techs.postscarcity !== undefined) foodNet = Math.max(foodNet, 3);
  if (mood < 0 && foodNet > 0) foodNet = 0;
  const unrestMult = mood <= -3 ? 0.5 : mood < 0 ? 0.8 : 1;

  city.y = {
    food: Math.round(f * 10) / 10,
    foodNet: Math.round(foodNet * 10) / 10,
    prod: Math.round(prod * unrestMult * (city.resistance > 0 ? 0.3 : 1) * 10) / 10,
    sci: Math.round(sci * 10) / 10,
    gold: Math.round(gold * 10) / 10,
    cult: Math.round(cult * 10) / 10,
    happy,
    unhappy,
    mood,
    defense: 0,
  };
  city.y.defense = Math.round(cityStrength(g, city, fx.defense ?? 0));
}

export function cityStrength(g: Game, city: City, defensePct?: number): number {
  const civ = g.civ(city.civId);
  let pct = defensePct;
  if (pct === undefined) pct = cityEffects(g, city, civ).defense ?? 0;
  if (civ.identity.includes('defensive')) pct += 20;
  if (leaderHas(g, civ, 'paranoid')) pct += 25;
  let garrison = 0;
  for (const u of g.unitsOn(city.tile)) {
    if (u.civId !== city.civId) continue;
    garrison = Math.max(garrison, UNIT[u.type].str * (u.hp / 100));
  }
  const base = 8 + city.size * 1.6 + civ.eraTier * 7 + garrison * 0.5;
  return base * (1 + pct / 100);
}

export function maxCityHp(city: City): number {
  let hp = 200;
  for (const b of city.buildings) hp += BUILDING[b]?.fx.hp ?? 0;
  return hp;
}

// --- Production -------------------------------------------------------------------

export function bestUnitOfClass(g: Game, civ: Civ, cls: UnitDef['cls'], coastal: boolean): UnitDef | null {
  let best: UnitDef | null = null;
  for (const def of UNITS) {
    if (def.cls !== cls) continue;
    if (def.tech && civ.techs[def.tech] === undefined) continue;
    if (def.tech2 && civ.techs[def.tech2] === undefined) continue;
    if (def.res && !hasResource(g, civ.id, def.res)) continue;
    if (cls === 'naval' && !coastal) continue;
    if (!best || def.str + def.rng > best.str + best.rng) best = def;
  }
  return best;
}

export function isCoastal(g: Game, city: City): boolean {
  return g.grid.neighborList(city.tile).some((t) => {
    const ter = g.s.map.terrain[t];
    return ter === T.Coast || ter === T.Ocean;
  });
}

export interface BuildOption {
  item: BuildItem;
  name: string;
  cost: number;
  desc: string;
  group: 'Units' | 'Buildings' | 'Wonders' | 'Projects';
}

export function itemCost(g: Game, city: City, item: BuildItem): number {
  const civ = g.civ(city.civId);
  const pace = g.paceMult();
  switch (item.kind) {
    case 'unit': {
      let c = UNIT[item.id].cost * pace;
      if (item.id === 'settler') {
        if (civ.identity.includes('expansionist')) c *= 0.8;
        if (civ.government === 'tribal') c *= 0.85;
      }
      return Math.round(c);
    }
    case 'building':
      return Math.round(BUILDING[item.id].cost * pace);
    case 'wonder':
      return Math.round(WONDER[item.id].cost * pace);
    case 'project': {
      let c = PROJECT[item.id].cost * pace;
      if (g.s.worldWonders.elevator?.civId === civ.id) c *= 0.75;
      return Math.round(c);
    }
  }
}

export function itemName(item: BuildItem): string {
  switch (item.kind) {
    case 'unit': return UNIT[item.id].name;
    case 'building': return BUILDING[item.id].name;
    case 'wonder': return WONDER[item.id].name;
    case 'project': return PROJECT[item.id].name;
  }
}

/** Production per turn applied to a given item (units and buildings get different bonuses). */
export function itemProd(g: Game, city: City, item: BuildItem | null): number {
  const civ = g.civ(city.civId);
  let p = city.y.prod;
  if (!item) return p;
  if (item.kind === 'unit') {
    let pct = GOV[civ.government].unitPct;
    for (const b of city.buildings) pct += BUILDING[b]?.fx.unitPct ?? 0;
    if (civ.identity.includes('militaristic')) pct += 15;
    if (leaderHas(g, civ, 'ruthless')) pct += 15;
    if (leaderHas(g, civ, 'cruel')) pct += 20;
    p *= 1 + pct / 100;
  } else if (leaderHas(g, civ, 'builder')) {
    p *= 1.2;
  }
  return Math.max(0, p);
}

export function buildOptions(g: Game, city: City): BuildOption[] {
  const civ = g.civ(city.civId);
  const coastal = isCoastal(g, city);
  const out: BuildOption[] = [];
  const settler = UNIT.settler;
  out.push({ item: { kind: 'unit', id: 'settler' }, name: settler.name, cost: itemCost(g, city, { kind: 'unit', id: 'settler' }), desc: 'Found a new city. Costs 1 population.', group: 'Units' });
  const recon = civ.techs.navigation !== undefined ? UNIT.explorer : UNIT.scout;
  out.push({ item: { kind: 'unit', id: recon.id }, name: recon.name, cost: itemCost(g, city, { kind: 'unit', id: recon.id }), desc: 'Explores. Weak in battle.', group: 'Units' });
  for (const cls of ['infantry', 'cavalry', 'ranged', 'siege', 'naval', 'air'] as const) {
    const def = bestUnitOfClass(g, civ, cls, coastal);
    if (!def) continue;
    const item: BuildItem = { kind: 'unit', id: def.id };
    const s = def.rng ? `Strength ${def.str}, ranged ${def.rng}` : `Strength ${def.str}`;
    out.push({ item, name: def.name, cost: itemCost(g, city, item), desc: `${s}, moves ${def.moves}.`, group: 'Units' });
  }
  for (const b of BUILDINGS) {
    if (city.buildings.includes(b.id)) continue;
    if (b.tech && civ.techs[b.tech] === undefined) continue;
    if (b.coastal && !coastal) continue;
    const item: BuildItem = { kind: 'building', id: b.id };
    out.push({ item, name: b.name, cost: itemCost(g, city, item), desc: b.desc, group: 'Buildings' });
  }
  for (const w of WONDERS) {
    if (g.s.worldWonders[w.id]) continue;
    if (civ.techs[w.tech] === undefined) continue;
    const item: BuildItem = { kind: 'wonder', id: w.id };
    out.push({ item, name: w.name, cost: itemCost(g, city, item), desc: w.desc, group: 'Wonders' });
  }
  for (const p of PROJECTS) {
    if (p.tech && civ.techs[p.tech] === undefined) continue;
    if (p.convert) {
      const item: BuildItem = { kind: 'project', id: p.id };
      out.push({ item, name: p.name, cost: 0, desc: p.desc, group: 'Projects' });
      continue;
    }
    if (civ.projects[p.id] !== undefined) continue;
    const elsewhere = g.citiesOf(civ.id).some((c) => c.id !== city.id && c.build?.kind === 'project' && c.build.id === p.id);
    if (elsewhere) continue;
    const item: BuildItem = { kind: 'project', id: p.id };
    out.push({ item, name: p.name, cost: itemCost(g, city, item), desc: p.desc, group: 'Projects' });
  }
  return out;
}

export function canStillBuild(g: Game, city: City, item: BuildItem): boolean {
  if (item.kind === 'wonder') return !g.s.worldWonders[item.id];
  if (item.kind === 'building') return !city.buildings.includes(item.id);
  if (item.kind === 'project') return g.civ(city.civId).projects[item.id] === undefined;
  return true;
}

/** Gold needed to finish the current item now (null if it can't be bought). */
export function buyCost(g: Game, city: City): number | null {
  const item = city.build;
  if (!item || item.kind === 'wonder' || city.resistance > 0) return null;
  if (item.kind === 'project' && PROJECT[item.id]?.convert) return null;
  const remaining = itemCost(g, city, item) - city.prod;
  if (remaining <= 0) return null;
  const mult = item.kind === 'unit' ? 2.2 : item.kind === 'project' ? 3 : 2;
  return Math.round(remaining * mult + 8);
}

export function buyItem(g: Game, city: City): boolean {
  const cost = buyCost(g, city);
  const civ = g.civ(city.civId);
  if (cost === null || civ.gold < cost || !city.build) return false;
  civ.gold -= cost;
  city.prod = itemCost(g, city, city.build);
  city.manual = true;
  return true;
}

export function setBuild(city: City, item: BuildItem | null, manual: boolean): void {
  const same = city.build && item && city.build.kind === item.kind && city.build.id === item.id;
  if (!same && city.build && item && city.build.kind !== item.kind) city.prod = Math.floor(city.prod * 0.5);
  city.build = item;
  city.manual = manual;
}

// --- Founding ----------------------------------------------------------------------

export function foundCity(g: Game, civ: Civ, tile: number): City {
  const map = g.s.map;
  const used = new Set(civ.usedNames);
  const name = placeName(civ.lang, g.rng, used);
  civ.usedNames.push(name);
  const city: City = {
    id: g.nextId(),
    name,
    civId: civ.id,
    founderId: civ.id,
    tile,
    founded: g.turn,
    size: 1,
    food: 0,
    prod: 0,
    focus: 'balanced',
    buildings: [],
    wonders: [],
    build: null,
    manual: false,
    culture: 0,
    hp: 200,
    peakSize: 1,
    unrest: 0,
    resistance: 0,
    improveStore: 0,
    worked: [],
    y: { food: 0, foodNet: 0, prod: 0, sci: 0, gold: 0, cult: 0, happy: 0, unhappy: 0, mood: 0, defense: 0 },
    lastHit: null,
    starving: 0,
    capturedTurn: -1,
    popSeed: g.rng.int(1_000_000),
  };
  g.s.cities[city.id] = city;
  map.cityAt[tile] = city.id;
  map.improvement[tile] = Imp.None;
  if (civ.techs.wheel !== undefined) map.road[tile] = Math.max(map.road[tile], 1);
  g.citiesDirty();
  const first = civ.stats.citiesFounded === 0;
  if (civ.capitalId < 0 || !g.s.cities[civ.capitalId]) {
    civ.capitalId = city.id;
    if (civ.originalCapitalTile < 0) civ.originalCapitalTile = tile;
  }
  civ.stats.citiesFounded++;
  for (const t of g.grid.within(tile, 1)) claimTile(g, city, t);
  invalidateResources(g, civ.id);
  const lead = currentLeader(g, civ);
  if (lead) lead.ach.citiesFounded++;
  addDeed(g, civ, `Founded ${name}`);
  const place = describePlace(g, tile);
  if (first) {
    logHistory(g, 'founding', 3, [civ.id], `The ${civ.name} people establish their first settlement, ${name}, ${place}.`, tile);
  } else {
    const otherLand = civ.homeRegion >= 0 && map.region[tile] !== civ.homeRegion;
    const imp = civ.isPlayer ? 2 : 1;
    if (otherLand && !g.s.firsts[`overseas-${civ.id}`]) {
      g.s.firsts[`overseas-${civ.id}`] = g.turn;
      logHistory(g, 'founding', 3, [civ.id], `The ${civ.name} found ${name} ${place} — their first colony across the water.`, tile);
    } else logHistory(g, 'founding', imp, [civ.id], `The ${civ.name} found the city of ${name} ${place}.`, tile);
  }
  computeCity(g, city);
  city.build = governorPick(g, city);
  g.emit({ type: 'found', tile, civId: civ.id });
  return city;
}

export function claimTile(g: Game, city: City, tile: number): boolean {
  const map = g.s.map;
  const cid = map.cityAt[tile];
  if (cid >= 0 && cid !== city.id) return false;
  const owner = map.owner[tile];
  if (owner >= 0 && owner !== city.civId) return false;
  const sibling = map.cityOf[tile];
  if (owner === city.civId && sibling >= 0 && sibling !== city.id) {
    const other = g.s.cities[sibling];
    if (other && g.grid.distance(other.tile, tile) <= g.grid.distance(city.tile, tile)) return false;
  }
  map.owner[tile] = city.civId;
  map.cityOf[tile] = city.id;
  return true;
}

function borderThreshold(g: Game, city: City, civ: Civ): number {
  const owned = cityTiles(g, city).length;
  let t = (8 + 5 * Math.pow(owned, 1.2)) * g.paceMult();
  if (civ.identity.includes('expansionist')) t *= 0.8;
  return t;
}

function expandBorders(g: Game, city: City, civ: Civ): void {
  const map = g.s.map;
  if (city.culture < borderThreshold(g, city, civ)) return;
  let best = -1;
  let bestV = -Infinity;
  for (const t of g.grid.within(city.tile, 3)) {
    if (map.owner[t] >= 0) continue;
    if (!g.grid.neighborList(t).some((n) => map.cityOf[n] === city.id)) continue;
    const y = tileYield(map, g.s.wonders, civ, t);
    let v = tileValue(y, map.resource[t]) - g.grid.distance(city.tile, t) * 0.8;
    if (map.wonder[t] >= 0) v += 6;
    if (v > bestV) {
      bestV = v;
      best = t;
    }
  }
  if (best < 0) return;
  city.culture -= borderThreshold(g, city, civ);
  claimTile(g, city, best);
  invalidateResources(g, civ.id);
}

function autoImprove(g: Game, city: City, civ: Civ): void {
  const map = g.s.map;
  city.improveStore += 1 + city.y.prod * 0.12;
  const cost = 10 * g.paceMult();
  if (city.improveStore < cost) return;
  city.improveStore -= cost;
  // Alternate between improving land and laying roads once the wheel is known.
  const wantRoad = civ.techs.wheel !== undefined && g.rng.chance(0.35);
  if (wantRoad && layRoad(g, city, civ)) return;
  const order = [...city.worked, ...cityTiles(g, city)];
  for (const t of order) {
    if (map.improvement[t] !== Imp.None) continue;
    const imp = idealImprovement(map, t);
    if (imp === Imp.None) continue;
    if (civ.techs[IMPROVEMENTS[imp].tech] === undefined) continue;
    if (g.unitsOn(t).some((u) => g.atWar(u.civId, civ.id))) continue;
    map.improvement[t] = imp;
    return;
  }
  if (civ.techs.wheel !== undefined) layRoad(g, city, civ);
}

function layRoad(g: Game, city: City, civ: Civ): boolean {
  const map = g.s.map;
  const others = g.citiesOf(civ.id).filter((c) => c.id !== city.id);
  if (!others.length) return false;
  let target = others[0];
  let bd = Infinity;
  for (const c of others) {
    const d = g.grid.distance(c.tile, city.tile);
    if (d < bd) {
      bd = d;
      target = c;
    }
  }
  if (bd > 10) return false;
  const rail = civ.techs.steam !== undefined ? 2 : 1;
  const probe: Unit = { id: -1, civId: civ.id, type: 'warband', tile: city.tile, hp: 100, moves: 1, order: null, fortified: 0, veteran: false, wins: 0, acted: false, born: 0 };
  const path = findPath(g, probe, target.tile, { maxNodes: 600, ignoreUnits: true });
  if (!path) return false;
  map.road[city.tile] = Math.max(map.road[city.tile], rail);
  for (const t of path) {
    if (isWater(map, t)) return false;
    if (map.road[t] >= rail) continue;
    if (map.owner[t] >= 0 && map.owner[t] !== civ.id) return false;
    map.road[t] = rail;
    return true;
  }
  return false;
}

/** One turn of life for a city. */
export function processCity(g: Game, city: City): void {
  const civ = g.civ(city.civId);
  computeCity(g, city);

  // Growth and starvation.
  city.food += city.y.foodNet;
  const need = growthNeeded(g, city.size);
  if (city.food >= need) {
    if (city.size < sizeCap(city)) {
      city.size++;
      const keep = Math.min(0.5, (cityEffects(g, city, civ).foodKeep ?? 0));
      city.food = Math.floor(need * keep);
      if (city.size > city.peakSize) city.peakSize = city.size;
      city.starving = 0;
    } else city.food = need;
  } else if (city.food < 0) {
    if (city.size > 1) {
      city.size--;
      city.food = Math.floor(growthNeeded(g, city.size) * 0.4);
      city.starving++;
      city.lastHit = { cause: city.lastHit?.cause === 'drought' ? 'drought' : 'famine', turn: g.turn };
      if (civ.isPlayer) g.notify(`${city.name} is starving and loses population.`, 'bad', city.tile);
    } else {
      city.food = 0;
      city.starving++;
    }
  } else if (city.y.foodNet >= 0) city.starving = Math.max(0, city.starving - 1);

  // Production.
  if (city.build && !canStillBuild(g, city, city.build)) {
    if (city.build.kind === 'wonder' && civ.isPlayer) {
      const owner = g.s.worldWonders[city.build.id];
      g.notify(`${WONDER[city.build.id].name} was completed by the ${g.civ(owner.civId).name}. ${city.name} must choose another project.`, 'bad', city.tile);
    }
    city.build = null;
    city.manual = false;
  }
  if (!city.build) city.build = governorPick(g, city);
  const conv = city.build?.kind === 'project' ? PROJECT[city.build.id]?.convert : undefined;
  if (conv && city.resistance <= 0) {
    // Ongoing conversion: nothing accumulates, half the production becomes another yield.
    const amount = city.y.prod * 0.5;
    if (conv === 'gold') civ.gold += amount;
    else if (conv === 'sci') civ.sciStore += amount;
    else {
      civ.culture += amount;
      city.culture += amount * 0.5;
    }
    // Let the governor switch back when something real becomes available.
    if (!city.manual && g.turn % 5 === city.id % 5) {
      const next = governorPick(g, city);
      if (next && !(next.kind === 'project' && PROJECT[next.id]?.convert)) city.build = next;
    }
  } else if (city.build && city.resistance <= 0) {
    city.prod += itemProd(g, city, city.build);
    const cost = itemCost(g, city, city.build);
    if (city.prod >= cost) {
      const done = completeItem(g, city, city.build);
      if (done) {
        city.prod = Math.min(city.prod - cost, cost * 0.5);
        city.build = null;
        city.manual = false;
        city.build = governorPick(g, city);
      }
    }
  }

  // Culture spreads borders.
  city.culture += city.y.cult;
  civ.culture += city.y.cult;
  expandBorders(g, city, civ);
  autoImprove(g, city, civ);

  // Recovery.
  city.hp = Math.min(maxCityHp(city), city.hp + 20);
  if (city.resistance > 0) city.resistance--;
  if (city.y.mood < 0) city.unrest++;
  else city.unrest = Math.max(0, city.unrest - 1);
}

function completeItem(g: Game, city: City, item: BuildItem): boolean {
  const civ = g.civ(city.civId);
  switch (item.kind) {
    case 'unit': {
      if (item.id === 'settler') {
        if (city.size < 2) return false;
        city.size--;
      }
      const u = createUnit(g, civ, item.id, city.tile);
      if (city.buildings.includes('barracks') && UNIT[item.id].str > 0) u.veteran = true;
      if (civ.isPlayer) g.notify(`${city.name} has trained ${UNIT[item.id].name}.`, 'info', city.tile);
      return true;
    }
    case 'building':
      city.buildings.push(item.id);
      if (item.id === 'walls' || item.id === 'castle') city.hp += 100;
      if (civ.isPlayer) g.notify(`${city.name} has built a ${BUILDING[item.id].name}.`, 'good', city.tile);
      return true;
    case 'wonder': {
      if (g.s.worldWonders[item.id]) return false;
      g.s.worldWonders[item.id] = { civId: civ.id, cityId: city.id, turn: g.turn };
      city.wonders.push(item.id);
      civ.stats.wondersBuilt++;
      const lead = currentLeader(g, civ);
      if (lead) lead.ach.wonders++;
      addDeed(g, civ, `Completed ${WONDER[item.id].name}`);
      shiftTrait(civ, 'artistic', 4);
      logHistory(g, 'wonder', 3, [civ.id], `The ${civ.name} complete ${WONDER[item.id].name} in ${city.name}.`, city.tile);
      return true;
    }
    case 'project':
      completeProject(g, civ, city, item.id);
      return true;
  }
}

// --- Conquest and loss --------------------------------------------------------------

export function transferCity(g: Game, city: City, toId: number, how: 'captured' | 'ceded' | 'revolt' | 'liberated'): void {
  const map = g.s.map;
  const from = g.civ(city.civId);
  const to = g.civ(toId);
  const wasCapital = from.capitalId === city.id;
  const war = warBetween(g, from.id, toId);
  city.civId = toId;
  city.capturedTurn = g.turn;
  city.manual = false;
  city.build = null;
  city.prod = 0;
  if (how === 'captured') {
    city.size = Math.max(1, Math.floor(city.size * 0.75));
    city.buildings = city.buildings.filter((b) => b !== 'walls' && b !== 'castle' && !g.chance(0.25));
    city.resistance = Math.round(Math.min(12, 2 + city.size) * GOV[to.government].assimilation);
    city.hp = 60;
  }
  for (const t of g.grid.within(city.tile, 3)) {
    if (map.cityOf[t] === city.id) map.owner[t] = toId;
  }
  // Units of the old owner can't stay inside.
  for (const u of g.unitsOn(city.tile)) if (u.civId !== toId) removeUnitQuiet(g, u);
  g.citiesDirty();
  invalidateResources(g, from.id);
  invalidateResources(g, toId);

  const lf = currentLeader(g, from);
  const lt = currentLeader(g, to);
  if (how === 'captured' || how === 'ceded') {
    from.stats.citiesLost++;
    to.stats.citiesCaptured++;
    if (lf) lf.ach.citiesLost++;
    if (lt) lt.ach.conquered++;
    addDeed(g, to, `${how === 'captured' ? 'Conquered' : 'Received'} ${city.name}`);
    addDeed(g, from, `Lost ${city.name}`);
    shiftTrait(to, 'expansionist', 2);
    shiftTrait(to, 'militaristic', 2);
    shiftTrait(from, 'defensive', 6);
    addMemory(g, from.id, toId, 'captured_city', -30, 0.2, -10, `You took ${city.name} from us {ago}.`, 3);
    from.modifiers.push({ kind: 'displaced', until: g.turn + 3, value: 1, label: 'the war' });
    if (war) {
      war.captures.push({ city: city.name, from: from.id, to: toId, turn: g.turn });
      addWarScore(g, war, toId, 10 + city.size * 2);
    }
  }
  const reclaimed = city.founderId === toId && how !== 'liberated';
  let text: string;
  if (how === 'liberated') text = `${city.name} is liberated and returns to the ${to.name}.`;
  else if (how === 'revolt') text = `${city.name} breaks away from the ${from.name} and joins the ${to.name}.`;
  else if (how === 'ceded') text = `${city.name} passes from the ${from.name} to the ${to.name}.`;
  else if (wasCapital) text = `The ${to.name} capture the ${from.adj} capital, ${city.name}.`;
  else if (reclaimed) text = `The ${to.name} reclaim ${city.name} from the ${from.name}.`;
  else text = `The ${to.name} capture ${city.name} from the ${from.name}.`;
  logHistory(g, 'capture', wasCapital || to.isPlayer || from.isPlayer ? 3 : 2, [from.id, toId], text, city.tile);
  g.emit({ type: 'capture', tile: city.tile, civId: toId });

  if (wasCapital) relocateCapital(g, from);
  if (to.capitalId < 0) to.capitalId = city.id;
  computeCity(g, city);
  if (!g.citiesOf(from.id).length) collapseCiv(g, from, how === 'captured' ? `conquered by the ${to.name}` : `absorbed by the ${to.name}`);
}

function removeUnitQuiet(g: Game, u: Unit): void {
  g.removeUnitAt(u.tile, u.id);
  delete g.s.units[u.id];
  g.unitsDirty();
}

export function relocateCapital(g: Game, civ: Civ): void {
  const cities = g.citiesOf(civ.id);
  if (!cities.length) {
    civ.capitalId = -1;
    return;
  }
  const next = [...cities].sort((a, b) => b.size - a.size)[0];
  civ.capitalId = next.id;
  logHistory(g, 'capital', civ.isPlayer ? 2 : 1, [civ.id], `The ${civ.name} move their capital to ${next.name}.`, next.tile);
}

/** A city ceases to exist and leaves ruins with its story. */
export function destroyCity(g: Game, city: City, cause: string, byCiv = -1): void {
  const map = g.s.map;
  const civ = g.civ(city.civId);
  const founder = g.civ(city.founderId);
  const legendBits: string[] = [];
  for (const w of city.wonders) legendBits.push(`Its ${WONDER[w].name.replace(/^The /, '')} was famed across the world.`);
  if (city.founderId !== city.civId) legendBits.push(`It was founded by the ${founder.name} and later held by the ${civ.name}.`);
  if (!legendBits.length) legendBits.push(`It was a city of the ${founder.name}.`);
  const artifacts = city.wonders.length
    ? city.wonders.map((w) => `relics of ${WONDER[w].name}`)
    : [`the ${g.rng.pick(['Bronze Seal', 'Painted Urn', 'Iron Crown', 'Clay Tablet', 'Silver Mirror'])} of ${city.name}`];
  const ruinId = g.s.ruins.length;
  g.s.ruins.push({
    id: ruinId,
    tile: city.tile,
    name: city.name,
    civName: founder.name,
    founded: city.founded,
    fell: g.turn,
    peakPop: realPopulation({ ...city, size: city.peakSize }, civ),
    cause,
    legend: legendBits.join(' '),
    artifacts,
    prehistoric: false,
    exploredBy: [city.civId],
    knowledge: null,
  });
  for (const t of g.grid.within(city.tile, 3)) {
    if (map.cityOf[t] === city.id) {
      map.cityOf[t] = -1;
      map.owner[t] = -1;
    }
  }
  map.cityAt[city.tile] = -1;
  map.ruinAt[city.tile] = ruinId;
  map.improvement[city.tile] = Imp.None;
  for (const u of g.unitsOn(city.tile)) if (u.civId === city.civId) removeUnitQuiet(g, u);
  delete g.s.cities[city.id];
  g.citiesDirty();
  invalidateResources(g, civ.id);
  const wasCapital = civ.capitalId === city.id;
  logHistory(g, 'ruin', 3, byCiv >= 0 ? [civ.id, byCiv] : [civ.id], `${city.name} is no more. ${cause}`, city.tile);
  if (wasCapital) relocateCapital(g, civ);
  if (!g.citiesOf(civ.id).length) collapseCiv(g, civ, cause);
}

export function causeText(kind: string, extra = ''): string {
  switch (kind) {
    case 'famine': return 'Its people starved during the great famine and the survivors scattered.';
    case 'drought': return 'The wells ran dry during a long drought, and its people left.';
    case 'plague': return `A plague${extra ? `, ${extra},` : ''} emptied its streets.`;
    case 'flood': return 'The river changed course during the Great Flood.';
    case 'volcano': return `It was buried in ash${extra ? ` when ${extra} erupted` : ''}.`;
    case 'razed': return `It was burned to the ground${extra ? ` by the ${extra}` : ''}.`;
    default: return 'Its people abandoned it.';
  }
}

export function findCity(g: Game, civId: number, near: number): City | undefined {
  let best: City | undefined;
  let bd = Infinity;
  for (const c of g.citiesOf(civId)) {
    const d = g.grid.distance(c.tile, near);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
