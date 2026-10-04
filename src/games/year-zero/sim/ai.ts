import { BUILDING } from '../data/buildings';
import { GOV, type TraitId } from '../data/society';
import { TECH } from '../data/techs';
import { UNIT, isMilitary } from '../data/units';
import { buildOptions, buyCost, buyItem, isCoastal, itemCost, sizeCap, type BuildOption } from './cities';
import { availableGovernments, availableTechs, changeGovernment, techCostFor } from './civs';
import {
  applyProposal, declareWar, evaluateProposal, powerOf, type Proposal, warBetween, warScore,
} from './diplomacy';
import { offerToPlayer } from './events';
import type { Game } from './game';
import { logHistory } from './history';
import { traitW } from './identity';
import { leaderHas } from './leaders';
import { findPath } from './path';
import type { BuildItem, City, Civ, Unit } from './state';
import { siteInfo } from './tiles';
import {
  advanceOrder, attack, canAttack, canFoundAt, previewAttack, removeUnit, settleHere, upgradeUnit, canUpgrade, walkToward,
} from './units';

// The AI is deliberately light: a handful of weighted choices per turn,
// colored by each civilization's emergent personality.

// --- Research -------------------------------------------------------------------------

export function pickResearch(g: Game, civ: Civ): string | null {
  const avail = availableTechs(civ);
  if (!avail.length) return null;
  const atWar = g.enemiesOf(civ.id).length > 0;
  const cities = g.citiesOf(civ.id);
  const coastal = cities.filter((c) => isCoastal(g, c)).length / Math.max(1, cities.length);
  const minTier = Math.min(...avail.map((id) => TECH[id].tier));
  const weights = avail.map((id) => {
    const t = TECH[id];
    let w = 1;
    for (const tag of t.tags) {
      switch (tag) {
        case 'military': w *= 1 + traitW(civ, 'militaristic') * 2 + (atWar ? 1.2 : 0); break;
        case 'science': w *= 1.2 + traitW(civ, 'scientific') * 2; break;
        case 'religion': w *= 0.9 + traitW(civ, 'religious') * 2.5; break;
        case 'maritime': w *= 0.6 + coastal * 1.6 + traitW(civ, 'maritime') * 2; break;
        case 'trade': w *= 1 + traitW(civ, 'mercantile') * 2; break;
        case 'food': w *= 1.25; break;
        case 'production': w *= 1.2; break;
        case 'culture': w *= 1 + traitW(civ, 'artistic') * 2; break;
        case 'expansion': w *= 1 + traitW(civ, 'expansionist') * 1.5; break;
        case 'ecology': w *= 0.8 + traitW(civ, 'ecological') * 2 + civ.pollution / 40; break;
        case 'government': w *= 1.15; break;
        case 'future': w *= 1.3; break;
      }
    }
    w *= Math.pow((minTier + 1) / (t.tier + 1), 2);
    return [id, w] as const;
  });
  return g.rng.weighted(weights) ?? avail[0];
}

// --- City governor --------------------------------------------------------------------------

function buildingValue(g: Game, city: City, civ: Civ, id: string, threatened: boolean): number {
  const b = BUILDING[id];
  const fx = b.fx;
  const y = city.y;
  const focus = city.focus;
  let v = 0;
  const growthRoom = city.size < sizeCap(city) ? 1 : 0.3;
  v += ((fx.food ?? 0) * 1.5 + (fx.seaFood ?? 0) * city.worked.filter((t) => g.s.map.terrain[t] <= 2).length * 1.3) * growthRoom * (focus === 'food' ? 1.5 : 1);
  v += ((fx.prod ?? 0) + ((fx.prodPct ?? 0) * y.prod) / 100) * 1.6 * (focus === 'production' ? 1.5 : 1);
  v += ((fx.sci ?? 0) + ((fx.sciPct ?? 0) * y.sci) / 100) * 1.3 * (focus === 'science' ? 1.6 : 1) * (1 + traitW(civ, 'scientific'));
  v += ((fx.gold ?? 0) + ((fx.goldPct ?? 0) * y.gold) / 100) * 1.1 * (focus === 'wealth' ? 1.6 : 1) * (1 + traitW(civ, 'mercantile')) * (civ.gold < 20 ? 1.6 : 1);
  v += (fx.cult ?? 0) * 0.9 * (focus === 'culture' ? 1.6 : 1) * (1 + traitW(civ, 'artistic') + traitW(civ, 'religious') * 0.5);
  v += (fx.happy ?? 0) * (y.mood <= 0 ? 3 : y.mood <= 2 ? 1.4 : 0.5);
  v += ((fx.defense ?? 0) / 25) * (threatened ? 2.5 : 0.25) * (1 + traitW(civ, 'defensive'));
  v += (fx.plagueResist ?? 0) * 2 * (city.size >= 6 ? 1.5 : 0.5);
  v += ((fx.unitPct ?? 0) / 10) * (traitW(civ, 'militaristic') * 2 + (threatened ? 1 : 0.2));
  v -= (fx.pollution ?? 0) * 0.4 * (civ.identity.includes('ecological') ? 2.5 : 1);
  v += (fx.cleanup ?? 0) * (civ.pollution / 20);
  if ((id === 'aqueduct' || id === 'hospital' || id === 'geneclinic' || id === 'arcology') && city.size >= sizeCap(city) - 1) v += 5;
  return v;
}

export function governorPick(g: Game, city: City): BuildItem | null {
  const civ = g.civ(city.civId);
  const options = buildOptions(g, city);
  if (!options.length) return null;
  const player = civ.isPlayer && !g.autoplay;
  const enemies = g.enemiesOf(civ.id);
  const atWar = enemies.length > 0;
  const units = g.unitsOf(civ.id);
  const military = units.filter((u) => isMilitary(UNIT[u.type]) && UNIT[u.type].cls !== 'naval' && UNIT[u.type].cls !== 'air');
  const cities = g.citiesOf(civ.id);
  const garrison = g.unitsOn(city.tile).filter((u) => u.civId === civ.id && isMilitary(UNIT[u.type])).length;
  let threat = 0;
  for (const t of g.grid.within(city.tile, 4)) {
    for (const u of g.unitsOn(t)) if (g.atWar(u.civId, civ.id) && isMilitary(UNIT[u.type])) threat++;
  }
  const nearEnemy = enemies.some((e) => g.citiesOf(e).some((c) => g.grid.distance(c.tile, city.tile) <= 9));
  const threatened = threat > 0 || nearEnemy;
  const settlers = units.filter((u) => u.type === 'settler').length + cities.filter((c) => c.id !== city.id && c.build?.id === 'settler').length;
  const recon = units.filter((u) => UNIT[u.type].cls === 'recon').length;
  const wonderElsewhere = cities.some((c) => c.id !== city.id && c.build?.kind === 'wonder');
  const topProd = Math.max(...cities.map((c) => c.y.prod));
  const armed = units.filter((u) => isMilitary(UNIT[u.type])).length;
  const cap = cities.length * (atWar ? 3 : 2) + 3;

  let best: BuildOption | null = null;
  let bestScore = -Infinity;
  for (const opt of options) {
    const item = opt.item;
    let score = 0;
    if (item.kind === 'unit') {
      const def = UNIT[item.id];
      if (item.id === 'settler') {
        if (player) continue;
        const target = 3 + Math.round(traitW(civ, 'expansionist') * 6) + Math.floor(g.turn / 45);
        const room = civ.ai.settleTarget !== -2;
        if (cities.length + settlers < target && city.size >= (g.turn < 60 ? 2 : 3) && room && !(atWar && threatened)) {
          score = 9 + (g.turn < 90 ? 4 : 0) - settlers * 4;
        } else continue;
      } else if (def.cls === 'recon') {
        if (player || recon > 0 || g.turn > 80) continue;
        score = 3.5;
      } else {
        const desired = atWar ? Math.max(3, cities.length * 2.4) : cities.length * (0.9 + traitW(civ, 'militaristic') * 1.4) + (g.turn > 120 ? 1 : 0);
        let need = 0;
        if (garrison === 0 && (g.turn > 15 || threatened)) need += 7;
        if (threat > 0) need += 6 + threat;
        if (military.length < desired) need += (atWar ? 6 : 2.5) * (1 - military.length / desired);
        if (player) {
          // The player's governor only keeps the city defended.
          if (garrison > 0 && threat === 0) continue;
          need = garrison === 0 ? 6 + threat * 2 : threat * 2;
        }
        if (need <= 0) continue;
        if (armed >= cap && !(garrison === 0 && threat > 0)) continue;
        let cls = 1;
        switch (def.cls) {
          case 'infantry': cls = garrison === 0 ? 1.3 : 1; break;
          case 'cavalry': cls = 0.9 + traitW(civ, 'militaristic') * 0.6 + (atWar ? 0.3 : 0); break;
          case 'ranged': cls = garrison === 0 ? 1.1 : 0.85; break;
          case 'siege': cls = atWar && !threat ? 1.05 : 0.2; break;
          case 'naval': cls = (traitW(civ, 'maritime') + (atWar ? 0.3 : 0.05)) * (units.filter((u) => UNIT[u.type].cls === 'naval').length < 2 ? 1 : 0.2); break;
          case 'air': cls = atWar ? 1.1 : 0.4; break;
        }
        score = need * cls;
      }
    } else if (item.kind === 'building') {
      const v = buildingValue(g, city, civ, item.id, threatened);
      score = (v * 30) / Math.pow(opt.cost, 0.72);
    } else if (item.kind === 'wonder') {
      if (wonderElsewhere) continue;
      const builder = leaderHas(g, civ, 'builder') ? 2 : 0;
      score = (2 + traitW(civ, 'artistic') * 5 + builder) * (city.y.prod >= topProd * 0.8 ? 1.1 : 0.35);
      score *= Math.min(1.2, (city.y.prod * 25) / opt.cost);
      if (player) score *= 0.6;
    } else if (item.kind === 'project') {
      if (opt.cost === 0) continue;
      score = 9 + traitW(civ, 'scientific') * 4;
    }
    if (!player) score *= 0.85 + g.rng.next() * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }
  if (best) return best.item;
  // Nothing worth building: convert production into what the city is focused on.
  const id = city.focus === 'science' && civ.techs.writing !== undefined ? 'conv_sci'
    : city.focus === 'culture' && civ.techs.mysticism !== undefined ? 'conv_cult' : 'conv_gold';
  return { kind: 'project', id };
}

// --- Settling -------------------------------------------------------------------------------

function findSettleSite(g: Game, civ: Civ, settler: Unit): number {
  const map = g.s.map;
  const cities = g.citiesOf(civ.id);
  const origins = cities.length ? cities.map((c) => c.tile) : [settler.tile];
  const seen = new Set<number>();
  let best = -1;
  let bestScore = 0;
  const radius = cities.length ? 8 : 4;
  const within = (c: number, r: number) => g.grid.within(c, r);
  const nbrs = (i: number) => g.grid.neighborList(i);
  const canSail = civ.techs.navigation !== undefined;
  for (const o of origins) {
    for (const t of g.grid.within(o, radius)) {
      if (seen.has(t)) continue;
      seen.add(t);
      if (!civ.explored[t] || !canFoundAt(g, civ, t)) continue;
      const otherLand = map.region[t] !== map.region[settler.tile];
      if (otherLand && !canSail) continue;
      let s = siteInfo(map, within, nbrs, t).score;
      if (s <= 0) continue;
      const d = g.grid.distance(settler.tile, t);
      s -= d * 1.2;
      if (otherLand) s -= 6;
      // Prefer a compact empire; avoid crowding foreign borders.
      for (const n of g.grid.within(t, 3)) {
        const own = map.owner[n];
        if (own >= 0 && own !== civ.id) s -= 2.5;
      }
      if (s > bestScore) {
        bestScore = s;
        best = t;
      }
    }
  }
  if (best >= 0 && !findPath(g, settler, best, { maxNodes: 2500 })) return -1;
  return best;
}

function aiSettler(g: Game, civ: Civ, u: Unit): void {
  if (u.order?.kind === 'settle' && canFoundAt(g, civ, u.order.target)) {
    advanceOrder(g, u);
    return;
  }
  const target = findSettleSite(g, civ, u);
  if (target < 0) {
    civ.ai.settleTarget = -2;
    // Nowhere to go: join the nearest city instead.
    const home = g.citiesOf(civ.id)[0];
    if (home && home.tile === u.tile) {
      home.size++;
      removeUnit(g, u);
    } else if (home) {
      u.order = { kind: 'goto', target: home.tile };
      advanceOrder(g, u);
    } else if (canFoundAt(g, civ, u.tile)) settleHere(g, u);
    return;
  }
  civ.ai.settleTarget = target;
  if (target === u.tile) {
    settleHere(g, u);
    return;
  }
  u.order = { kind: 'settle', target };
  advanceOrder(g, u);
}

// --- Military ----------------------------------------------------------------------------------

function bestAttack(g: Game, u: Unit): { tile: number; score: number } | null {
  const def = UNIT[u.type];
  const range = def.rng > 0 ? def.range : 1;
  let best: { tile: number; score: number } | null = null;
  for (const t of g.grid.within(u.tile, range)) {
    if (t === u.tile || !canAttack(g, u, t)) continue;
    const odds = previewAttack(g, u, t);
    if (!odds) continue;
    let score: number;
    if (odds.kind === 'city') {
      const city = g.cityAt(t)!;
      const canTake = def.rng === 0 && odds.dmgToDef >= city.hp;
      if (def.rng > 0) score = 4 + odds.dmgToDef / 10;
      else if (canTake && odds.dmgToAtk < u.hp) score = 30;
      else if (city.hp < maxHp(city) * 0.5 && odds.dmgToAtk < u.hp * 0.6) score = 3 + odds.dmgToDef / 15;
      else continue;
    } else {
      const kills = odds.dmgToDef >= odds.defHp;
      if (def.rng > 0) score = (kills ? 12 : 3) + odds.dmgToDef / 10;
      else if (odds.dmgToAtk >= u.hp) continue;
      else if (kills) score = 14 - odds.dmgToAtk / 10;
      else if (odds.dmgToDef >= odds.dmgToAtk * 1.1 && odds.dmgToAtk < u.hp * 0.55) score = 2 + (odds.dmgToDef - odds.dmgToAtk) / 10;
      else continue;
    }
    if (!best || score > best.score) best = { tile: t, score };
  }
  return best;
}

function maxHp(city: City): number {
  return 200 + (city.buildings.includes('walls') ? 100 : 0) + (city.buildings.includes('castle') ? 100 : 0);
}

function nearestOwnCity(g: Game, civ: Civ, tile: number): City | undefined {
  let best: City | undefined;
  let bd = Infinity;
  for (const c of g.citiesOf(civ.id)) {
    const d = g.grid.distance(c.tile, tile);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function chooseTarget(g: Game, civ: Civ, enemy: number): City | undefined {
  const mine = g.citiesOf(civ.id);
  let best: City | undefined;
  let bestScore = Infinity;
  for (const c of g.citiesOf(enemy)) {
    let d = Infinity;
    for (const m of mine) d = Math.min(d, g.grid.distance(m.tile, c.tile));
    if (d > 22) continue;
    const score = d * 2 + c.y.defense * 0.15 + c.hp / 40 - (c.id === g.civ(enemy).capitalId ? 0 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

interface WarPlan {
  target?: City;
  enemy: number;
}

function planWars(g: Game, civ: Civ): WarPlan[] {
  const plans: WarPlan[] = [];
  for (const e of g.enemiesOf(civ.id)) {
    const cur = civ.ai.targets[e];
    let target = cur !== undefined ? g.city(cur) : undefined;
    if (!target || target.civId !== e) target = chooseTarget(g, civ, e);
    if (target) civ.ai.targets[e] = target.id;
    plans.push({ enemy: e, target });
  }
  return plans;
}

function aiUnits(g: Game, civ: Civ): void {
  const cities = g.citiesOf(civ.id);
  const plans = planWars(g, civ);
  const atWar = plans.length > 0;
  const units = [...g.unitsOf(civ.id)];

  // Garrison needs.
  const need = new Map<number, number>();
  for (const c of cities) {
    let n = g.turn > 12 ? 1 : 0;
    if (atWar && plans.some((p) => g.citiesOf(p.enemy).some((e) => g.grid.distance(e.tile, c.tile) <= 9))) n++;
    for (const t of g.grid.within(c.tile, 3)) {
      if (g.unitsOn(t).some((u) => g.atWar(u.civId, civ.id) && isMilitary(UNIT[u.type]))) {
        n++;
        break;
      }
    }
    need.set(c.id, n);
  }
  const free: Unit[] = [];
  for (const u of units) {
    if (!g.s.units[u.id]) continue;
    const def = UNIT[u.type];
    if (def.cls === 'civilian') {
      aiSettler(g, civ, u);
      continue;
    }
    if (def.cls === 'recon') {
      if (!u.order) u.order = { kind: 'explore' };
      advanceOrder(g, u);
      if (!u.order && g.turn > 90) removeUnit(g, u);
      continue;
    }
    if (canUpgrade(g, u) && civ.gold > 120) upgradeUnit(g, u);
    // Opportunistic strikes come first.
    const strike = u.moves > 0 ? bestAttack(g, u) : null;
    if (strike && strike.score >= 3) {
      attack(g, u, strike.tile);
      continue;
    }
    const city = g.cityAt(u.tile);
    if (city && city.civId === civ.id && def.cls !== 'naval' && def.cls !== 'air' && (need.get(city.id) ?? 0) > 0) {
      need.set(city.id, need.get(city.id)! - 1);
      u.order = { kind: 'fortify' };
      continue;
    }
    free.push(u);
  }

  for (const u of free) {
    if (!g.s.units[u.id] || u.moves <= 0) continue;
    const def = UNIT[u.type];
    // Wounded units fall back.
    if (u.hp < 45 && def.cls !== 'air') {
      const home = nearestOwnCity(g, civ, u.tile);
      if (home && home.tile !== u.tile) {
        walkToward(g, u, home.tile);
        continue;
      }
      if (home) {
        u.order = { kind: 'fortify' };
        continue;
      }
    }
    // Fill empty garrisons.
    if (def.cls !== 'naval' && def.cls !== 'air') {
      let target: City | undefined;
      let bd = Infinity;
      for (const c of cities) {
        if ((need.get(c.id) ?? 0) <= 0) continue;
        const d = g.grid.distance(c.tile, u.tile);
        if (d < bd) {
          bd = d;
          target = c;
        }
      }
      if (target && bd <= 12) {
        need.set(target.id, need.get(target.id)! - 1);
        if (!walkToward(g, u, target.tile)) need.set(target.id, need.get(target.id)! + 1);
        else if (u.tile === target.tile) u.order = { kind: 'fortify' };
        continue;
      }
    }
    if (atWar) {
      warMove(g, civ, u, plans);
      continue;
    }
    if (def.cls === 'naval' || def.cls === 'air') {
      u.order = { kind: 'sleep' };
      continue;
    }
    // Peace: rest in a border city.
    if (!g.cityAt(u.tile)) {
      const home = nearestOwnCity(g, civ, u.tile);
      if (home) walkToward(g, u, home.tile);
    } else u.order = { kind: 'fortify' };
  }
}

function warMove(g: Game, civ: Civ, u: Unit, plans: WarPlan[]): void {
  const def = UNIT[u.type];
  // Nearest active objective.
  let plan: WarPlan | undefined;
  let bd = Infinity;
  for (const p of plans) {
    if (!p.target) continue;
    const d = g.grid.distance(p.target.tile, u.tile);
    if (d < bd) {
      bd = d;
      plan = p;
    }
  }
  if (!plan || !plan.target) {
    // Hunt intruders in our territory.
    const map = g.s.map;
    for (const t of g.grid.within(u.tile, 6)) {
      if (map.owner[t] !== civ.id) continue;
      if (g.unitsOn(t).some((o) => g.atWar(o.civId, civ.id))) {
        walkToward(g, u, t);
        return;
      }
    }
    u.order = { kind: 'fortify' };
    return;
  }
  const target = plan.target;
  if (def.cls === 'naval') {
    if (bd > 3) walkToward(g, u, target.tile);
    return;
  }
  const range = def.rng > 0 ? def.range : 1;
  if (bd <= range) {
    // In position but no good attack this turn: hold.
    u.order = null;
    return;
  }
  // Wait for friends before closing in on a strong city.
  if (bd <= 3 && target.hp > maxHp(target) * 0.5) {
    let friends = 0;
    for (const t of g.grid.within(target.tile, 3)) friends += g.unitsOn(t).filter((o) => o.civId === civ.id && isMilitary(UNIT[o.type])).length;
    if (friends < 3 && def.rng === 0) {
      u.order = null;
      return;
    }
  }
  const path = findPath(g, u, target.tile, { maxNodes: 3000, attackTarget: true });
  if (!path || !path.length) return;
  // Stop short of the city; the final attack is decided next turn.
  const stopAt = Math.max(0, path.length - range);
  const dest = path[Math.max(0, stopAt - 1)];
  if (dest !== undefined && dest !== u.tile) walkToward(g, u, dest);
  const strike = u.moves > 0 ? bestAttack(g, u) : null;
  if (strike && strike.score >= 3) attack(g, u, strike.tile);
}

// --- Government and focus -----------------------------------------------------------------------

function govScore(g: Game, civ: Civ, id: string): number {
  const t = (k: TraitId) => traitW(civ, k) * 10;
  const atWar = g.enemiesOf(civ.id).length > 0 ? 1 : 0;
  const n = g.citiesOf(civ.id).length;
  switch (id) {
    case 'tribal': return n <= 2 ? 3 : 0;
    case 'monarchy': return 4 + t('defensive') * 0.4 + t('militaristic') * 0.3;
    case 'theocracy': return 2 + t('religious') * 0.9;
    case 'republic': return 4 + t('mercantile') * 0.5 + t('individualist') * 0.5;
    case 'empire': return 2 + t('expansionist') * 0.5 + t('militaristic') * 0.4 + (n >= 8 ? 4 : 0);
    case 'democracy': return 5 + t('individualist') * 0.7 + t('mercantile') * 0.3 - t('militaristic') * 0.4 - atWar * 2;
    case 'dictatorship': return 1 + t('militaristic') * 0.6 + t('collectivist') * 0.5 + atWar * 3 - t('individualist') * 0.5;
    case 'federation': return (n >= 10 ? 7 : 3) + t('mercantile') * 0.3;
    case 'technocracy': return 3 + t('scientific') * 0.9;
    case 'aigov': return 1 + t('scientific') * 0.3 + t('collectivist') * 0.4;
  }
  return 0;
}

function aiGovernment(g: Game, civ: Civ): void {
  if (civ.anarchy > 0 || g.turn - civ.govSince < 25) return;
  const options = availableGovernments(civ);
  const cur = govScore(g, civ, civ.government) + ((civ.id * 31 + civ.government.length * 17 + civ.government.charCodeAt(0) * 7) % 9) * 0.55;
  let best = civ.government;
  let bs = cur;
  for (const id of options) {
    // Each people has its own political temperament.
    const temperament = ((civ.id * 31 + id.length * 17 + id.charCodeAt(0) * 7) % 9) * 0.55;
    const s = govScore(g, civ, id) + temperament;
    if (s > bs) {
      bs = s;
      best = id;
    }
  }
  if (best !== civ.government && bs > cur + 2.5 && best !== 'aigov') changeGovernment(g, civ, best, 'reform');
}

function aiFocus(g: Game, civ: Civ): void {
  const ranked = (['scientific', 'mercantile', 'artistic'] as TraitId[]).sort((a, b) => civ.traits[b] - civ.traits[a]);
  const lead = ranked[0];
  for (const c of g.citiesOf(civ.id)) {
    if (c.size < 3) c.focus = 'food';
    else if (civ.traits[lead] >= 30) c.focus = lead === 'scientific' ? 'science' : lead === 'mercantile' ? 'wealth' : 'culture';
    else c.focus = 'balanced';
  }
}

// --- Diplomacy --------------------------------------------------------------------------------------

function propose(g: Game, civ: Civ, other: Civ, p: Proposal): void {
  const rel = civ.relations[other.id];
  rel.lastProposal = g.turn;
  if (other.isPlayer) {
    offerToPlayer(g, civ, p);
    return;
  }
  const v = evaluateProposal(g, other.id, civ.id, p);
  if (v.accept) applyProposal(g, civ.id, other.id, p);
}

function warDesire(g: Game, civ: Civ, other: Civ): number {
  const rel = civ.relations[other.id];
  if (!rel || rel.war || rel.alliance >= 0) return -100;
  if (civ.vassalOf === other.id || other.vassalOf === civ.id) return -100;
  const ours = g.citiesOf(civ.id);
  const theirs = g.citiesOf(other.id);
  if (!ours.length || !theirs.length) return -100;
  let close = Infinity;
  for (const a of ours) for (const b of theirs) close = Math.min(close, g.grid.distance(a.tile, b.tile));
  if (close > 13) return -100;
  const ratio = powerOf(g, civ.id) / powerOf(g, other.id);
  let d = -12;
  d += traitW(civ, 'militaristic') * 35 + traitW(civ, 'expansionist') * 20;
  d += Math.max(0, -rel.opinion) * 0.45;
  // Pressure: no land left to settle, a tempting weak neighbor, grinding borders.
  if (civ.ai.settleTarget === -2) d += 8 + traitW(civ, 'expansionist') * 15;
  if (ratio >= 1.6) d += 12;
  d += Math.min(12, rel.borderTension / 5);
  d += (ratio - 1) * 26;
  d -= (close - 6) * 1.5;
  if (leaderHas(g, civ, 'aggressive')) d += 10;
  if (leaderHas(g, civ, 'ruthless')) d += 6;
  if (leaderHas(g, civ, 'diplomatic')) d -= 15;
  if (civ.identity.includes('artistic')) d -= 6;
  if (GOV[civ.government].weariness >= 2) d -= 12;
  if (rel.peaceUntil > g.turn) d -= leaderHas(g, civ, 'ruthless') ? 15 : 60;
  if (rel.trade >= 0) d -= 5 + traitW(civ, 'mercantile') * 12;
  const lastPact = Math.max(rel.trade, rel.openBorders);
  if (lastPact >= 0 && g.turn - lastPact < 12) d -= 40;
  if (civ.ai.grudges[other.id] !== undefined && g.turn - civ.ai.grudges[other.id] < 30) d += 12;
  if (g.enemiesOf(civ.id).length) d -= 40;
  // Peoples long at war grow tired of it.
  d -= Math.min(25, civ.stats.warsFought * 2.5);
  if (g.turn - civ.ai.lastWarTurn < 20) d -= 30;
  if (g.turn < 40) d -= 25;
  if (ratio < 0.95) d -= 30;
  return d;
}

function aiDiplomacy(g: Game, civ: Civ): void {
  for (const k in civ.relations) {
    const other = g.civ(Number(k));
    if (!other.alive) continue;
    const rel = civ.relations[k];
    if (rel.war) {
      const war = warBetween(g, civ.id, other.id);
      if (!war || war.end >= 0) continue;
      if (g.turn - rel.lastProposal < 4 || g.turn - war.start < 5) continue;
      const score = warScore(war, civ.id);
      let p: Proposal | null = null;
      const theirCities = g.citiesOf(other.id).filter((c) => c.id !== other.capitalId);
      const ourCities = g.citiesOf(civ.id).filter((c) => c.id !== civ.capitalId);
      if (score > 45 && theirCities.length) {
        const nearest = theirCities.sort((a, b) => a.size - b.size)[0];
        p = { kind: 'peace', terms: 'theyCede', cityId: nearest.id };
      } else if (score > 25) p = { kind: 'peace', terms: 'theyPay', gold: Math.min(other.gold, 40 + civ.eraTier * 25) };
      else if (score < -50 && ourCities.length && civ.warWeariness > 10) {
        p = { kind: 'peace', terms: 'weCede', cityId: ourCities.sort((a, b) => a.size - b.size)[0].id };
      } else if (score < 10 || civ.warWeariness > 12) p = { kind: 'peace', terms: 'white' };
      if (!p) continue;
      // Only offer if we ourselves would take it.
      const selfCheck = evaluateProposal(g, civ.id, other.id, { kind: 'peace', terms: 'white' });
      if (p.terms === 'white' && !selfCheck.accept) continue;
      propose(g, civ, other, p);
      continue;
    }
    if (g.turn - rel.lastProposal < 8) continue;
    const op = other.relations[civ.id]?.opinion ?? 0;
    // Vassals may throw off the yoke.
    if (civ.vassalOf === other.id && powerOf(g, civ.id) > powerOf(g, other.id) * 0.8) {
      civ.vassalOf = -1;
      rel.vassal = false;
      logHistory(g, 'vassal', 2, [civ.id, other.id], `The ${civ.name} throw off the rule of the ${other.name}.`);
      continue;
    }
    if (g.turn - rel.lastWarCheck >= 6) {
      rel.lastWarCheck = g.turn;
      const desire = warDesire(g, civ, other);
      if (desire > 0 && g.rng.next() < desire / 120) {
        const res = ['iron', 'horses', 'oil', 'coal'].find((r) => !hasRes(g, civ, r) && hasRes(g, other, r));
        declareWar(g, civ.id, other.id, res && g.rng.next() < 0.4 ? `resource:${res.charAt(0).toUpperCase() + res.slice(1)}` : 'ambition');
        continue;
      }
      // Bullying a weaker neighbor.
      if (desire > -20 && traitW(civ, 'militaristic') > 0.35 && other.gold > 60 && g.rng.next() < 0.25) {
        propose(g, civ, other, { kind: 'demand', gold: Math.round(Math.min(other.gold * 0.4, 50 + civ.eraTier * 30)) });
        continue;
      }
    }
    if (rel.trade < 0 && civ.techs.writing !== undefined && other.techs.writing !== undefined && rel.opinion >= -10 && op >= -20 && !civ.identity.includes('isolationist')) {
      if (g.rng.next() < 0.35 + traitW(civ, 'mercantile')) propose(g, civ, other, { kind: 'trade' });
      continue;
    }
    if (rel.openBorders < 0 && rel.opinion >= 20 && g.rng.next() < 0.25) {
      propose(g, civ, other, { kind: 'openBorders' });
      continue;
    }
    if (rel.alliance < 0 && rel.opinion >= 45 && g.rng.next() < 0.2) {
      propose(g, civ, other, { kind: 'alliance' });
      continue;
    }
  }
}

function hasRes(g: Game, civ: Civ, key: string): boolean {
  const map = g.s.map;
  const res = { iron: 4, horses: 5, coal: 6, oil: 7 }[key as 'iron'];
  for (const c of g.citiesOf(civ.id)) {
    for (const t of g.grid.within(c.tile, 3)) if (map.owner[t] === civ.id && map.resource[t] === res) return true;
  }
  return false;
}

// --- Entry point -------------------------------------------------------------------------------------

export function aiTurn(g: Game, civ: Civ): void {
  if (!civ.alive) return;
  if (!civ.research) civ.research = pickResearch(g, civ);
  if (g.turn % 10 === civ.id % 10) {
    aiGovernment(g, civ);
    aiFocus(g, civ);
  }
  aiDiplomacy(g, civ);
  aiUnits(g, civ);
  // Fill idle production, and spend a rich treasury.
  let bought = 0;
  for (const c of g.citiesOf(civ.id)) {
    if (!c.build) c.build = governorPick(g, c);
    const cost = buyCost(g, c);
    if (cost !== null && bought < 2 && civ.gold > 220 + 60 * civ.eraTier && cost < civ.gold * 0.35) {
      if (buyItem(g, c)) bought++;
    }
  }
}

/** Player units with standing orders (goto, explore) advance at end of turn. */
export function advancePlayerOrders(g: Game, civ: Civ): void {
  for (const u of [...g.unitsOf(civ.id)]) {
    if (!g.s.units[u.id]) continue;
    if (u.order && u.moves > 0) advanceOrder(g, u);
  }
}

export function estimateTurns(g: Game, city: City, item: BuildItem): number {
  const cost = itemCost(g, city, item);
  const prod = Math.max(0.5, city.y.prod);
  return Math.max(1, Math.ceil((cost - city.prod) / prod));
}

export function researchTurns(g: Game, civ: Civ, sci: number, id: string): number {
  const cost = techCostFor(g, civ, id);
  return Math.max(1, Math.ceil((cost - civ.sciStore) / Math.max(1, sci)));
}
