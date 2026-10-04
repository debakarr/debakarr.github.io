import { F, Imp, Relief } from '../data/terrain';
import { UNIT, soldiersPerUnit, isMilitary, type UnitDef } from '../data/units';
import { bestUnitOfClass, causeText, cityStrength, destroyCity, foundCity, transferCity } from './cities';
import { addWarScore, warBetween } from './diplomacy';
import type { Game } from './game';
import { logHistory } from './history';
import { shiftTrait } from './identity';
import { leaderHas } from './leaders';
import { findPath, maxMoves, occupancy, terrainCost } from './path';
import type { City, Civ, Unit } from './state';
import { canSettle, isWater } from './tiles';
import { exploreRuin, revealAround } from './visibility';

export function createUnit(g: Game, civ: Civ, type: string, tile: number): Unit {
  const u: Unit = {
    id: g.nextId(),
    civId: civ.id,
    type,
    tile,
    hp: 100,
    moves: 0,
    order: null,
    fortified: 0,
    veteran: false,
    wins: 0,
    acted: false,
    born: g.turn,
  };
  u.moves = maxMoves(g, u);
  g.s.units[u.id] = u;
  g.addUnitAt(tile, u.id);
  g.unitsDirty();
  return u;
}

export function removeUnit(g: Game, u: Unit): void {
  g.removeUnitAt(u.tile, u.id);
  delete g.s.units[u.id];
  g.unitsDirty();
}

export function isEmbarked(g: Game, u: Unit): boolean {
  const def = UNIT[u.type];
  return def.cls !== 'naval' && def.cls !== 'air' && isWater(g.s.map, u.tile);
}

function placeUnit(g: Game, u: Unit, to: number): void {
  const from = u.tile;
  g.removeUnitAt(from, u.id);
  u.tile = to;
  g.addUnitAt(to, u.id);
  if (!g.quiet && (g.playerSees(from) || g.playerSees(to))) g.emit({ type: 'move', unitId: u.id, from, to });
}

/** Take one step into an adjacent tile. Returns false if the step is not allowed. */
export function stepUnit(g: Game, u: Unit, to: number): boolean {
  if (u.moves <= 0) return false;
  const civ = g.civ(u.civId);
  const def = UNIT[u.type];
  const cost = terrainCost(g, civ, def, u.tile, to);
  if (cost === Infinity) return false;
  if (occupancy(g, u, to) !== 'free') return false;
  // Lone enemy civilians on the tile are captured or scattered.
  const wasLand = !isWater(g.s.map, u.tile);
  u.moves = Math.max(0, u.moves - cost);
  u.fortified = 0;
  u.acted = true;
  placeUnit(g, u, to);
  if (u.order?.kind === 'fortify' || u.order?.kind === 'sleep') u.order = null;
  revealAround(g, civ, to, unitSight(g, u));
  onEnter(g, u, to, wasLand);
  return true;
}

export function unitSight(g: Game, u: Unit): number {
  const def = UNIT[u.type];
  let s = def.sight ?? 2;
  const relief = g.s.map.relief[u.tile];
  if (def.cls !== 'air' && def.cls !== 'naval' && relief === Relief.Hills) s += 1;
  return s;
}

function onEnter(g: Game, u: Unit, tile: number, fromLand: boolean): void {
  const map = g.s.map;
  const civ = g.civ(u.civId);
  if (map.ruinAt[tile] >= 0) exploreRuin(g, civ, g.s.ruins[map.ruinAt[tile]]);
  // First landing on a far shore.
  const def = UNIT[u.type];
  if (!fromLand && !isWater(map, tile) && def.cls !== 'naval' && def.cls !== 'air') {
    const region = map.region[tile];
    const reg = g.s.regions[region];
    if (civ.homeRegion >= 0 && region !== civ.homeRegion && reg && reg.size >= 6) {
      const key = `landing-${civ.id}-${region}`;
      if (!g.s.firsts[key]) {
        g.s.firsts[key] = g.turn;
        const firstEver = !g.s.firsts[`crossing-${civ.id}`];
        if (firstEver) {
          g.s.firsts[`crossing-${civ.id}`] = g.turn;
          const worldFirst = !g.s.firsts.crossing;
          if (worldFirst) g.s.firsts.crossing = g.turn;
          shiftTrait(civ, 'maritime', 4);
          logHistory(g, 'crossing', 3, [civ.id],
            `${worldFirst ? 'For the first time in history, ' : ''}${worldFirst ? 'a' : 'A'} band of ${civ.adj} travelers crosses the water and lands on the shores of ${reg.name || 'an unknown land'}.`, tile);
        }
      }
    }
  }
}

/** Follow the unit's goto/explore order as far as its moves allow. */
export function advanceOrder(g: Game, u: Unit): void {
  const order = u.order;
  if (!order) return;
  if (order.kind === 'fortify') {
    if (!u.acted) u.fortified = Math.min(3, u.fortified + 1);
    return;
  }
  if (order.kind === 'sleep') return;
  if (order.kind === 'explore') {
    const target = exploreTarget(g, u);
    if (target < 0) {
      u.order = null;
      if (g.civ(u.civId).isPlayer) g.notify(`${UNIT[u.type].name} have nothing left to explore nearby.`, 'info', u.tile);
      return;
    }
    walkToward(g, u, target);
    return;
  }
  const target = order.target;
  if (u.tile === target) {
    if (order.kind === 'settle') settleHere(g, u);
    else u.order = null;
    return;
  }
  const arrived = walkToward(g, u, target);
  if (arrived && order.kind === 'settle' && u.tile === target) settleHere(g, u);
  else if (arrived && u.tile === target) u.order = null;
}

/** Walk along a path; returns true if the path exists (even if not finished). */
export function walkToward(g: Game, u: Unit, target: number): boolean {
  let path = findPath(g, u, target, { maxNodes: 2500 });
  let retries = 1;
  while (u.moves > 0 && u.tile !== target) {
    if (!path || !path.length) {
      if (u.order?.kind === 'goto' || u.order?.kind === 'settle') u.order = null;
      return false;
    }
    const next = path.shift()!;
    if (!stepUnit(g, u, next)) {
      if (retries-- <= 0) return false;
      path = findPath(g, u, target, { maxNodes: 2500 });
    }
  }
  return true;
}

function exploreTarget(g: Game, u: Unit): number {
  const civ = g.civ(u.civId);
  const def = UNIT[u.type];
  const map = g.s.map;
  const seen = new Map<number, number>([[u.tile, 0]]);
  const queue = [u.tile];
  let best = -1;
  let bestScore = -Infinity;
  for (let q = 0; q < queue.length && q < 1400; q++) {
    const cur = queue[q];
    const d = seen.get(cur)!;
    let unexplored = 0;
    for (const n of g.grid.neighborList(cur)) {
      if (!civ.explored[n]) unexplored++;
    }
    if (unexplored && cur !== u.tile) {
      const score = unexplored * 1.5 - d + (map.ruinAt[cur] >= 0 ? 6 : 0) + g.rng.next();
      if (score > bestScore) {
        bestScore = score;
        best = cur;
      }
    }
    if (d > 22) continue;
    for (const n of g.grid.neighborList(cur)) {
      if (seen.has(n) || !civ.explored[n]) continue;
      if (terrainCost(g, civ, def, cur, n) === Infinity) continue;
      if (occupancy(g, u, n) !== 'free') continue;
      seen.set(n, d + 1);
      queue.push(n);
    }
  }
  return best;
}

// --- Settling ----------------------------------------------------------------------

export function canFoundAt(g: Game, civ: Civ, tile: number): boolean {
  const map = g.s.map;
  if (!canSettle(map, tile)) return false;
  if (map.owner[tile] >= 0 && map.owner[tile] !== civ.id) return false;
  for (const t of g.grid.within(tile, 2)) if (map.cityAt[t] >= 0) return false;
  return true;
}

export function settleHere(g: Game, u: Unit): City | null {
  const civ = g.civ(u.civId);
  if (u.type !== 'settler' || !canFoundAt(g, civ, u.tile)) {
    if (u.order?.kind === 'settle') u.order = null;
    return null;
  }
  const tile = u.tile;
  removeUnit(g, u);
  const city = foundCity(g, civ, tile);
  revealAround(g, civ, tile, 3);
  return city;
}

// --- Combat ------------------------------------------------------------------------

function hpFactor(u: Unit): number {
  return 0.5 + 0.5 * (u.hp / 100);
}

function terrainDefense(g: Game, tile: number): number {
  const map = g.s.map;
  let m = 1;
  if (map.relief[tile] === Relief.Hills) m += 0.25;
  const f = map.feature[tile];
  if (f === F.Forest || f === F.Jungle) m += 0.25;
  if (f === F.Marsh) m -= 0.1;
  return m;
}

export function attackStrength(g: Game, u: Unit, target: { unit?: Unit; city?: City }): number {
  const def = UNIT[u.type];
  const civ = g.civ(u.civId);
  let s = (def.rng > 0 ? def.rng : def.str) * hpFactor(u);
  if (u.veteran) s *= 1.15;
  if (leaderHas(g, civ, 'aggressive')) s *= 1.1;
  if (target.city && def.vsCity) s *= def.vsCity;
  if (target.unit) {
    const td = UNIT[target.unit.type];
    if (def.antiCav && td.cls === 'cavalry') s *= def.antiCav;
    if (def.cls === 'cavalry' && (td.cls === 'ranged' || td.cls === 'siege')) s *= 1.25;
    if (def.cls === 'air' && td.cls !== 'air') s *= 1.1;
  }
  if (isEmbarked(g, u)) s *= 0.5;
  return Math.max(0.5, s);
}

export function defenseStrength(g: Game, u: Unit, attacker?: Unit): number {
  const def = UNIT[u.type];
  const civ = g.civ(u.civId);
  let s = Math.max(1, def.str) * hpFactor(u);
  if (def.cls !== 'air' && def.cls !== 'naval') s *= terrainDefense(g, u.tile);
  s *= 1 + 0.1 * u.fortified;
  if (u.veteran) s *= 1.15;
  if (isEmbarked(g, u)) s *= 0.4;
  if (civ.identity.includes('defensive') && g.s.map.owner[u.tile] === civ.id) s *= 1.2;
  if (attacker) {
    const ad = UNIT[attacker.type];
    if (def.antiCav && ad.cls === 'cavalry') s *= def.antiCav;
  }
  if (def.cls === 'civilian') s = 0.5;
  return Math.max(0.5, s);
}

function damage(sa: number, sd: number, roll: number): number {
  return Math.min(100, Math.round(30 * Math.pow(sa / sd, 1.5) * roll));
}

export interface Odds {
  kind: 'unit' | 'city';
  name: string;
  dmgToDef: number;
  dmgToAtk: number;
  defHp: number;
  atkHp: number;
}

export function attackTarget(g: Game, u: Unit, tile: number): { unit?: Unit; city?: City } | null {
  const city = g.cityAt(tile);
  if (city && city.civId !== u.civId && g.atWar(u.civId, city.civId)) return { city };
  const defender = g.unitsOn(tile).filter((o) => o.civId !== u.civId && g.atWar(u.civId, o.civId));
  if (!defender.length) return null;
  let best = defender[0];
  for (const d of defender) if (defenseStrength(g, d, u) > defenseStrength(g, best, u)) best = d;
  return { unit: best };
}

export function canAttack(g: Game, u: Unit, tile: number): boolean {
  const def = UNIT[u.type];
  if (!isMilitary(def) || u.moves <= 0) return false;
  const dist = g.grid.distance(u.tile, tile);
  const range = def.rng > 0 ? def.range : 1;
  if (dist < 1 || dist > range) return false;
  const target = attackTarget(g, u, tile);
  if (!target) return false;
  if (def.rng === 0) {
    // Melee: must be able to physically step there.
    const civ = g.civ(u.civId);
    if (terrainCost(g, civ, def, u.tile, tile) === Infinity && !target.city) return false;
    if (def.cls === 'naval' && !isWater(g.s.map, tile) && !target.city) return false;
    if (def.cls === 'air' && target.city) return false;
    if (target.city && def.cls !== 'naval' && isWater(g.s.map, tile)) return false;
  }
  return true;
}

export function previewAttack(g: Game, u: Unit, tile: number): Odds | null {
  const target = attackTarget(g, u, tile);
  if (!target) return null;
  const def = UNIT[u.type];
  const sa = attackStrength(g, u, target);
  if (target.city) {
    const sd = target.city.y.defense || cityStrength(g, target.city);
    return {
      kind: 'city',
      name: target.city.name,
      dmgToDef: damage(sa, sd, 1),
      dmgToAtk: def.rng > 0 ? 0 : Math.round(damage(sd, sa, 1) * 0.8),
      defHp: target.city.hp,
      atkHp: u.hp,
    };
  }
  const d = target.unit!;
  const sd = defenseStrength(g, d, u);
  return {
    kind: 'unit',
    name: UNIT[d.type].name,
    dmgToDef: damage(sa, sd, 1),
    dmgToAtk: def.rng > 0 ? 0 : damage(sd, sa, 1),
    defHp: d.hp,
    atkHp: u.hp,
  };
}

function casualties(g: Game, civId: number, enemy: number, def: UnitDef, hpLost: number): void {
  const n = Math.round((soldiersPerUnit(def) * hpLost) / 100);
  const civ = g.civ(civId);
  civ.stats.casualties += n;
  civ.warWeariness += hpLost / 60;
  const war = warBetween(g, civId, enemy);
  if (war) war.casualties[civId] = (war.casualties[civId] ?? 0) + n;
}

export interface AttackResult {
  killed: boolean;
  died: boolean;
  captured: boolean;
}

export function attack(g: Game, u: Unit, tile: number): AttackResult | null {
  if (!canAttack(g, u, tile)) return null;
  const target = attackTarget(g, u, tile)!;
  const def = UNIT[u.type];
  const civ = g.civ(u.civId);
  const ranged = def.rng > 0;
  const roll = () => 0.85 + g.rng.next() * 0.3;
  const sa = attackStrength(g, u, target);
  const result: AttackResult = { killed: false, died: false, captured: false };
  u.moves = 0;
  u.acted = true;
  u.fortified = 0;
  if (u.order?.kind !== 'goto') u.order = null;

  if (target.city) {
    const city = target.city;
    const enemyId = city.civId;
    const war = warBetween(g, u.civId, enemyId);
    if (war) war.battles++;
    const sd = cityStrength(g, city);
    const dd = damage(sa, sd, roll());
    const da = ranged ? 0 : Math.round(damage(sd, sa, roll()) * 0.8);
    city.hp = Math.max(ranged ? 1 : 0, city.hp - dd);
    u.hp -= da;
    casualties(g, u.civId, enemyId, def, da);
    if (!g.quiet) g.emit({ type: 'combat', from: u.tile, to: tile, dmgAtk: da, dmgDef: dd, killed: false, civs: [u.civId, enemyId] });
    if (u.hp <= 0) {
      result.died = true;
      civ.stats.unitsLost++;
      g.civ(enemyId).stats.unitsKilled++;
      addWarScore(g, war, enemyId, def.cost / 8);
      removeUnit(g, u);
      if (civ.isPlayer) g.notify(`Our ${def.name} fell attacking ${city.name}.`, 'bad', tile);
      return result;
    }
    if (city.hp <= 0 && !ranged && def.cls !== 'air' && def.cls !== 'naval') {
      for (const o of g.unitsOn(tile)) {
        if (o.civId === enemyId) {
          g.civ(enemyId).stats.unitsLost++;
          removeUnit(g, o);
        }
      }
      result.captured = true;
      const enemyCiv = g.civ(enemyId);
      const isPlayerCapture = civ.isPlayer;
      // Capture: the city changes hands; the player may later choose to raze or liberate.
      transferCity(g, city, u.civId, 'captured');
      placeUnit(g, u, tile);
      if (isPlayerCapture) {
        g.s.decisions.push({ id: g.nextId(), civId: civ.id, event: 'conquest', turn: g.turn, params: { cityId: city.id, from: enemyCiv.id } });
        g.emit({ type: 'decision' });
      } else if (!civ.isPlayer && shouldAiRaze(g, civ, city)) {
        destroyCity(g, city, causeText('razed', civ.name), civ.id);
        civ.stats.citiesRazed++;
      }
    }
    return result;
  }

  const d = target.unit!;
  const dDef = UNIT[d.type];
  const enemyId = d.civId;
  const war = warBetween(g, u.civId, enemyId);
  if (war) war.battles++;
  const sd = defenseStrength(g, d, u);
  const dd = damage(sa, sd, roll());
  const da = ranged ? 0 : damage(sd, sa, roll());
  d.hp -= dd;
  u.hp -= da;
  casualties(g, enemyId, u.civId, dDef, Math.min(dd, d.hp + dd));
  casualties(g, u.civId, enemyId, def, da);
  const killed = d.hp <= 0;
  if (!g.quiet) g.emit({ type: 'combat', from: u.tile, to: tile, dmgAtk: da, dmgDef: dd, killed, civs: [u.civId, enemyId] });
  if (killed) {
    result.killed = true;
    g.civ(enemyId).stats.unitsLost++;
    civ.stats.unitsKilled++;
    addWarScore(g, war, u.civId, dDef.cost / 8);
    u.wins++;
    if (u.wins >= 2) u.veteran = true;
    removeUnit(g, d);
    const enemyCiv = g.civ(enemyId);
    if (enemyCiv.isPlayer) g.notify(`Our ${dDef.name} were destroyed by the ${civ.name}.`, 'bad', tile);
    else if (civ.isPlayer) g.notify(`Our ${def.name} destroyed ${enemyCiv.adj} ${dDef.name}.`, 'good', tile);
    // Advance into the emptied tile.
    if (!ranged && u.hp > 0 && occupancy(g, u, tile) === 'free' && terrainCost(g, civ, def, u.tile, tile) !== Infinity) {
      captureCivilians(g, u, tile);
      if (occupancy(g, u, tile) === 'free') placeUnit(g, u, tile);
    }
  } else if (g.civ(enemyId).isPlayer && dd > 0) {
    g.notify(`Our ${dDef.name} were attacked by ${civ.adj} ${def.name} (-${dd} HP).`, 'war', tile);
  }
  if (u.hp <= 0) {
    result.died = true;
    civ.stats.unitsLost++;
    g.civ(enemyId).stats.unitsKilled++;
    addWarScore(g, war, enemyId, def.cost / 8);
    removeUnit(g, u);
    if (civ.isPlayer) g.notify(`Our ${def.name} were destroyed in the attack.`, 'bad', tile);
  }
  return result;
}

function shouldAiRaze(g: Game, civ: Civ, city: City): boolean {
  if (city.size > 3 || city.wonders.length) return false;
  const cap = g.capital(civ);
  const far = cap ? g.grid.distance(cap.tile, city.tile) > 14 : false;
  let p = 0.05;
  if (civ.identity.includes('militaristic')) p += 0.1;
  if (leaderHas(g, civ, 'ruthless') || leaderHas(g, civ, 'cruel')) p += 0.2;
  if (far) p += 0.1;
  return g.rng.next() < p;
}

/** Capturing a tile with lone enemy civilians on it. */
function captureCivilians(g: Game, u: Unit, tile: number): void {
  for (const o of g.unitsOn(tile)) {
    if (o.civId === u.civId || !g.atWar(o.civId, u.civId)) continue;
    const def = UNIT[o.type];
    if (def.cls === 'civilian') {
      g.removeUnitAt(o.tile, o.id);
      o.civId = u.civId;
      o.order = null;
      g.addUnitAt(o.tile, o.id);
      g.unitsDirty();
    }
  }
}

/** Cities with walls fire on one adjacent enemy each turn. */
export function cityBombard(g: Game, city: City): void {
  if (!city.buildings.includes('walls') && !city.buildings.includes('castle')) return;
  let target: Unit | undefined;
  for (const t of g.grid.within(city.tile, 2)) {
    for (const u of g.unitsOn(t)) {
      if (u.civId !== city.civId && g.atWar(u.civId, city.civId)) {
        if (!target || u.hp < target.hp) target = u;
      }
    }
  }
  if (!target) return;
  const sa = cityStrength(g, city) * 0.65;
  const sd = defenseStrength(g, target);
  const dd = damage(sa, sd, 0.85 + g.rng.next() * 0.3);
  target.hp -= dd;
  const def = UNIT[target.type];
  casualties(g, target.civId, city.civId, def, Math.min(dd, target.hp + dd));
  if (!g.quiet) g.emit({ type: 'combat', from: city.tile, to: target.tile, dmgAtk: 0, dmgDef: dd, killed: target.hp <= 0, civs: [city.civId, target.civId] });
  if (target.hp <= 0) {
    const war = warBetween(g, city.civId, target.civId);
    addWarScore(g, war, city.civId, def.cost / 8);
    g.civ(target.civId).stats.unitsLost++;
    if (g.civ(target.civId).isPlayer) g.notify(`Our ${def.name} were destroyed by the walls of ${city.name}.`, 'bad', target.tile);
    removeUnit(g, target);
  }
}

// --- Upkeep ------------------------------------------------------------------------

export function startTurnUnits(g: Game, civ: Civ): void {
  const map = g.s.map;
  for (const u of g.unitsOf(civ.id)) {
    if (!u.acted && u.hp < 100) {
      let heal = 10;
      const owner = map.owner[u.tile];
      if (map.cityAt[u.tile] >= 0 && owner === civ.id) heal = 25;
      else if (owner === civ.id) heal = 15;
      else if (owner >= 0 && g.atWar(owner, civ.id)) heal = 5;
      if (isEmbarked(g, u)) heal = 0;
      u.hp = Math.min(100, u.hp + heal);
    }
    if (u.order?.kind === 'fortify' && !u.acted) u.fortified = Math.min(3, u.fortified + 1);
    u.acted = false;
    u.moves = maxMoves(g, u);
  }
}

export function upgradeTarget(g: Game, u: Unit): UnitDef | null {
  const def = UNIT[u.type];
  if (def.cls === 'civilian') return null;
  const civ = g.civ(u.civId);
  if (def.cls === 'recon') return civ.techs.navigation !== undefined && def.id === 'scout' ? UNIT.explorer : null;
  const best = bestUnitOfClass(g, civ, def.cls, true);
  if (!best || best.id === def.id || best.str + best.rng <= def.str + def.rng) return null;
  return best;
}

export function upgradeCost(g: Game, u: Unit): number {
  const t = upgradeTarget(g, u);
  if (!t) return 0;
  return Math.max(10, Math.round((t.cost - UNIT[u.type].cost) * 1.6 * g.paceMult()));
}

export function canUpgrade(g: Game, u: Unit): boolean {
  const t = upgradeTarget(g, u);
  if (!t) return false;
  const civ = g.civ(u.civId);
  return g.s.map.owner[u.tile] === civ.id && civ.gold >= upgradeCost(g, u) && u.moves > 0;
}

export function upgradeUnit(g: Game, u: Unit): boolean {
  if (!canUpgrade(g, u)) return false;
  const t = upgradeTarget(g, u)!;
  const civ = g.civ(u.civId);
  civ.gold -= upgradeCost(g, u);
  u.type = t.id;
  u.moves = 0;
  u.acted = true;
  return true;
}

export function canPillage(g: Game, u: Unit): boolean {
  const map = g.s.map;
  const owner = map.owner[u.tile];
  return (
    isMilitary(UNIT[u.type]) &&
    u.moves > 0 &&
    owner >= 0 &&
    owner !== u.civId &&
    g.atWar(owner, u.civId) &&
    (map.improvement[u.tile] !== Imp.None || map.road[u.tile] > 0) &&
    map.cityAt[u.tile] < 0
  );
}

export function pillage(g: Game, u: Unit): number {
  if (!canPillage(g, u)) return 0;
  const map = g.s.map;
  const civ = g.civ(u.civId);
  const owner = map.owner[u.tile];
  if (map.improvement[u.tile] !== Imp.None) map.improvement[u.tile] = Imp.None;
  else map.road[u.tile] = 0;
  const gold = 8 + civ.eraTier * 6;
  civ.gold += gold;
  addWarScore(g, warBetween(g, u.civId, owner), u.civId, 1.5);
  u.moves = 0;
  u.acted = true;
  if (g.civ(owner).isPlayer) g.notify(`${civ.adj} raiders pillage our lands.`, 'war', u.tile);
  return gold;
}

export function disband(g: Game, u: Unit): void {
  removeUnit(g, u);
}

export function unitUpkeep(g: Game, civ: Civ): number {
  const units = g.unitsOf(civ.id);
  const cities = g.citiesOf(civ.id).length;
  const free = civ.government === 'tribal' ? 4 + cities : 2 + cities;
  let cost = 0;
  let count = 0;
  for (const u of units) {
    if (UNIT[u.type].cls === 'civilian') continue;
    count++;
  }
  if (count > free) cost = (count - free) * (1 + Math.floor(civ.eraTier / 2));
  return cost;
}
