import { adjectiveOf, faithName, makeLanguage, peopleName, word, type Language } from '../core/names';
import { BUILDING, PROJECT } from '../data/buildings';
import { GOV, GOVERNMENTS, type TraitId } from '../data/society';
import { RESOURCES } from '../data/terrain';
import { TECH, TECHS, techCost } from '../data/techs';
import { UNIT, isMilitary } from '../data/units';
import { pickResearch } from './ai';
import { civPopulation } from './cities';
import { invalidateResources, powerOf, tradeIncome } from './diplomacy';
import type { Game } from './game';
import { logHistory } from './history';
import { emptyTraits, shiftTrait, updateEra } from './identity';
import { addDeed, currentLeader, endReign, leaderHas } from './leaders';
import type { City, Civ, GameState } from './state';
import { removeUnit, unitUpkeep } from './units';

export const CIV_COLORS = [
  '#e8b93c', '#d1495b', '#3e8ed0', '#5fb36b', '#9b6bd6', '#e07a3f', '#2bb3a6', '#c86fb0',
  '#9aae3c', '#6f7bd9', '#d98b8b', '#47a3c4', '#b5835a', '#7ac77a', '#c4b24a', '#b05a5a',
];

export function createCiv(
  g: Game,
  opts: { isPlayer: boolean; name?: string; lang?: Language; color?: string; startTile: number; parentId?: number },
): Civ {
  const s: GameState = g.s;
  const lang = opts.lang ?? makeLanguage(g.rng.fork(`civ-${s.civs.length}`));
  const name = opts.name?.trim() || peopleName(lang, g.rng);
  const used = new Set(s.civs.map((c) => c.color));
  const color = opts.color ?? CIV_COLORS.find((c) => !used.has(c)) ?? CIV_COLORS[s.civs.length % CIV_COLORS.length];
  const n = s.map.w * s.map.h;
  const civ: Civ = {
    id: s.civs.length,
    name,
    adj: adjectiveOf(name),
    color,
    lang,
    isPlayer: opts.isPlayer,
    alive: true,
    founded: g.turn,
    collapsed: -1,
    parentId: opts.parentId ?? -1,
    capitalId: -1,
    originalCapitalTile: -1,
    gold: 10,
    research: null,
    researchGoal: null,
    sciStore: 0,
    techs: {},
    culture: 0,
    government: 'tribal',
    govSince: g.turn,
    anarchy: 0,
    traits: emptyTraits(),
    identity: [],
    eraTier: 0,
    eraPath: [{ tier: 0, name: 'Tribal Age', turn: g.turn }],
    leaderId: -1,
    dynasty: '',
    religionId: -1,
    relations: {},
    explored: new Uint8Array(n),
    visible: new Uint8Array(n),
    warWeariness: 0,
    discontent: 0,
    pollution: 0,
    cohesion: 70,
    purpose: null,
    modifiers: [],
    artifacts: [],
    projects: {},
    legacies: {},
    stats: {
      citiesFounded: 0, citiesLost: 0, citiesCaptured: 0, citiesRazed: 0, warsWon: 0, warsLost: 0, warsFought: 0,
      unitsLost: 0, unitsKilled: 0, casualties: 0, famines: 0, plagues: 0, disasters: 0, treaties: 0, betrayals: 0,
      wondersBuilt: 0, ruinsExplored: 0, peakPop: 0, peakCities: 0, revolutions: 0, firstContact: -1,
    },
    ai: { targets: {}, grudges: {}, settleTarget: -1, lastWarTurn: -99, mood: '' },
    usedNames: [],
    startTile: opts.startTile,
    homeRegion: opts.startTile >= 0 ? s.map.region[opts.startTile] : -1,
    vassalOf: -1,
  };
  s.civs.push(civ);
  if (opts.startTile >= 0 && opts.parentId === undefined) seedTraitsFromLand(g, civ, opts.startTile);
  return civ;
}

/** A people is shaped by where it starts: coasts, rivers, hills and deserts leave a mark. */
function seedTraitsFromLand(g: Game, civ: Civ, tile: number): void {
  const map = g.s.map;
  const near = g.grid.within(tile, 3);
  const count = (pred: (t: number) => boolean) => near.filter(pred).length / near.length;
  const water = count((t) => map.terrain[t] <= 1);
  const forest = count((t) => map.feature[t] === 1 || map.feature[t] === 2);
  const hills = count((t) => map.relief[t] >= 1);
  const desert = count((t) => map.terrain[t] === 5);
  const open = count((t) => map.terrain[t] === 3 || map.terrain[t] === 4);
  civ.traits.maritime += water * 40;
  civ.traits.ecological += forest * 30;
  civ.traits.defensive += hills * 35;
  civ.traits.religious += desert * 40;
  civ.traits.expansionist += open * 20;
  if (map.river[tile] > 0) civ.traits.collectivist += 8;
  const wild = g.rng.pick(['militaristic', 'scientific', 'artistic', 'mercantile', 'religious', 'expansionist', 'individualist', 'collectivist'] as TraitId[]);
  civ.traits[wild] += 14;
}

// --- Research ------------------------------------------------------------------------

export function techCostFor(g: Game, civ: Civ, id: string): number {
  const known = Object.keys(civ.techs).length;
  let cost = techCost(id, g.paceMult(), known);
  // Ideas travel: knowledge held by peoples you know is cheaper to acquire.
  let holders = 0;
  for (const k in civ.relations) {
    const other = g.civ(Number(k));
    if (other.alive && other.techs[id] !== undefined) holders++;
  }
  cost *= 1 - Math.min(0.3, holders * 0.1);
  return Math.round(cost);
}

export function canResearch(civ: Civ, id: string): boolean {
  const t = TECH[id];
  if (!t || civ.techs[id] !== undefined) return false;
  return t.req.every((r) => civ.techs[r] !== undefined);
}

export function availableTechs(civ: Civ): string[] {
  return TECHS.filter((t) => canResearch(civ, t.id)).map((t) => t.id);
}

/** Next step toward a distant goal. */
export function nextTowardGoal(civ: Civ, goal: string): string | null {
  if (civ.techs[goal] !== undefined) return null;
  const visit = (id: string, seen: Set<string>): string | null => {
    if (civ.techs[id] !== undefined || seen.has(id)) return null;
    seen.add(id);
    if (canResearch(civ, id)) return id;
    for (const r of TECH[id].req) {
      const n = visit(r, seen);
      if (n) return n;
    }
    return null;
  };
  return visit(goal, new Set());
}

export function setResearch(civ: Civ, id: string): void {
  if (canResearch(civ, id)) {
    civ.research = id;
    civ.researchGoal = null;
  } else if (TECH[id] && civ.techs[id] === undefined) {
    civ.researchGoal = id;
    civ.research = nextTowardGoal(civ, id);
  }
}

export function learnTech(g: Game, civ: Civ, id: string, source = 'research'): void {
  if (civ.techs[id] !== undefined) return;
  const t = TECH[id];
  civ.techs[id] = g.turn;
  const lead = currentLeader(g, civ);
  if (lead) lead.ach.techs++;
  const firstInWorld = !g.s.civs.some((c) => c !== civ && c.techs[id] !== undefined);
  addDeed(g, civ, `Discovered ${t.name}`);
  if (t.milestone) {
    const text = firstInWorld
      ? `The ${civ.name} are the first people to ${t.milestone}.`
      : `The ${civ.name} ${t.milestone}.`;
    logHistory(g, 'tech', firstInWorld || civ.isPlayer ? (firstInWorld && t.tier >= 4 ? 3 : 2) : 1, [civ.id], text);
  } else if (civ.isPlayer) {
    g.notify(`We have discovered ${t.name}${source === 'ruins' ? ' from the ruins' : ''}.`, 'good');
  }
  if (t.tags.includes('science')) shiftTrait(civ, 'scientific', 1);
  if (t.tags.includes('religion')) shiftTrait(civ, 'religious', 1);
  if (t.tags.includes('maritime')) shiftTrait(civ, 'maritime', 1);
  if (t.tags.includes('ecology')) shiftTrait(civ, 'ecological', 2);

  // Resource discovery in our lands.
  for (const r of RESOURCES) {
    if (r.reveal !== id) continue;
    const map = g.s.map;
    for (const c of g.citiesOf(civ.id)) {
      const found = g.grid.within(c.tile, 3).find((tile) => map.owner[tile] === civ.id && map.resource[tile] === r.id);
      if (found !== undefined) {
        logHistory(g, 'resource', civ.isPlayer ? 2 : 1, [civ.id], `${r.name} is discovered near ${c.name}.`, found);
        break;
      }
    }
    invalidateResources(g, civ.id);
  }
  // A people that learns Mysticism finds — or adopts — a faith.
  if (id === 'mysticism' && civ.religionId < 0) foundOrAdoptFaith(g, civ);
  for (const gv of GOVERNMENTS) {
    if (gv.tech === id && civ.isPlayer) g.notify(`New government available: ${gv.name}.`, 'good');
  }
  if (id === 'postscarcity') {
    if (civ.isPlayer) {
      g.s.decisions.push({ id: g.nextId(), civId: civ.id, event: 'purpose', turn: g.turn, params: {} });
      g.emit({ type: 'decision' });
    } else {
      const ranked = (['scientific', 'artistic', 'ecological', 'militaristic'] as TraitId[]).sort((a, b) => civ.traits[b] - civ.traits[a]);
      civ.purpose = { scientific: 'stars', artistic: 'arts', ecological: 'earth', militaristic: 'machines' }[ranked[0] as 'scientific'] ?? 'stars';
    }
  }
  updateEra(g, civ);
  if (civ.researchGoal) {
    civ.research = nextTowardGoal(civ, civ.researchGoal);
    if (!civ.research) civ.researchGoal = null;
  } else if (civ.research === id) civ.research = null;
}

function foundOrAdoptFaith(g: Game, civ: Civ): void {
  // Adopt the faith of a close, devout neighbor sometimes.
  for (const k in civ.relations) {
    const other = g.civ(Number(k));
    const rel = civ.relations[k];
    if (other.religionId >= 0 && rel.opinion > 30 && g.chance(0.5)) {
      civ.religionId = other.religionId;
      const rel2 = g.s.religions[other.religionId];
      logHistory(g, 'faith', civ.isPlayer ? 2 : 1, [civ.id, other.id], `The ${civ.name} embrace ${rel2.name}, the faith of the ${other.name}.`);
      return;
    }
  }
  const tenets: Record<string, string> = {
    militaristic: 'glory is won in battle', maritime: 'the sea is the mother of all things', mercantile: 'fortune is a gift to be shared',
    scientific: 'the stars are a book to be read', artistic: 'beauty is the highest prayer', defensive: 'the walls of home are holy',
    expansionist: 'the land was promised to the faithful', ecological: 'every river and tree has a soul', collectivist: 'no one is saved alone',
    individualist: 'each soul walks its own road', isolationist: 'the outside world is a temptation', religious: 'the gods watch every deed',
    secular: 'the gods are distant and silent',
  };
  const top = (Object.keys(civ.traits) as TraitId[]).sort((a, b) => civ.traits[b] - civ.traits[a])[0];
  const religion = {
    id: g.s.religions.length,
    name: faithName(civ.lang, g.rng),
    founder: civ.id,
    founded: g.turn,
    tenet: tenets[top] ?? 'the ancestors watch over the living',
  };
  g.s.religions.push(religion);
  civ.religionId = religion.id;
  shiftTrait(civ, 'religious', 3);
  logHistory(g, 'faith', civ.isPlayer ? 3 : 1, [civ.id], `Among the ${civ.name} a new faith is born: ${religion.name}, which teaches that ${religion.tenet}.`);
}

// --- Government ------------------------------------------------------------------------

export function availableGovernments(civ: Civ): string[] {
  return GOVERNMENTS.filter((gv) => !gv.tech || civ.techs[gv.tech] !== undefined).map((gv) => gv.id);
}

export function changeGovernment(g: Game, civ: Civ, gov: string, reason: 'reform' | 'revolution' | 'coup' = 'reform'): void {
  if (civ.government === gov) return;
  const old = GOV[civ.government];
  const next = GOV[gov];
  const reformer = leaderHas(g, civ, 'reformer');
  civ.government = gov;
  civ.govSince = g.turn;
  civ.anarchy = reformer && reason === 'reform' ? 0 : next.anarchy;
  if (reason !== 'reform') civ.stats.revolutions++;
  const lead = currentLeader(g, civ);
  if (lead && reason === 'reform') {
    lead.ach.reforms++;
    addDeed(g, civ, `Proclaimed ${next.name}`);
  }
  const text =
    reason === 'revolution'
      ? `Revolution! The people of the ${civ.name} overthrow the ${old.name}. ${next.name} is proclaimed.`
      : reason === 'coup'
        ? `A coup ends the ${old.name} of the ${civ.name}. ${next.name} is imposed.`
        : `The ${civ.name} abandon their ${old.name} and adopt ${next.name}.`;
  logHistory(g, 'government', civ.isPlayer || reason !== 'reform' ? 3 : 2, [civ.id], text);
  if (gov === 'democracy' || gov === 'republic' || gov === 'federation') shiftTrait(civ, 'individualist', 4);
  if (gov === 'dictatorship' || gov === 'empire') shiftTrait(civ, 'collectivist', 3);
  if (gov === 'theocracy') shiftTrait(civ, 'religious', 5);
  if (gov === 'technocracy') shiftTrait(civ, 'scientific', 4);
  // A new order brings new rulers — unless the reformer stays to lead it.
  const keep = reason === 'reform' && reformer;
  if (!keep) {
    const successor = reason === 'revolution' ? 'revolution' : reason === 'coup' ? 'coup' : next.term > 0 ? 'election' : 'death';
    endReign(g, civ, reason === 'reform' ? 'term' : 'deposed', successor);
  } else if (lead) {
    lead.title = next.title[lead.gender === 'f' ? 1 : 0];
  }
}

// --- Per-turn economy ------------------------------------------------------------------------

export interface CivTotals {
  sci: number;
  gold: number;
  cult: number;
  upkeep: number;
  trade: number;
  tribute: number;
  net: number;
}

export function civTotals(g: Game, civ: Civ): CivTotals {
  let sci = 0;
  let gold = 0;
  let cult = 0;
  let upkeep = 0;
  for (const c of g.citiesOf(civ.id)) {
    sci += c.y.sci;
    gold += c.y.gold;
    cult += c.y.cult;
    for (const b of c.buildings) upkeep += BUILDING[b]?.upkeep ?? 0;
  }
  if (civ.techs.postscarcity !== undefined) upkeep = 0;
  upkeep += unitUpkeep(g, civ);
  let trade = 0;
  for (const k in civ.relations) {
    const rel = civ.relations[k];
    if (rel.trade >= 0 && g.civ(Number(k)).alive) {
      const quarantined = civ.modifiers.some((m) => m.kind === 'quarantine');
      trade += quarantined ? 0 : tradeIncome(g, civ.id, Number(k));
    }
  }
  cult += civ.artifacts.length;
  let tribute = 0;
  if (civ.vassalOf >= 0) tribute = -Math.round((gold + trade) * 0.15);
  for (const other of g.s.civs) {
    if (other.alive && other.vassalOf === civ.id) {
      let og = 0;
      for (const c of g.citiesOf(other.id)) og += c.y.gold;
      tribute += Math.round(og * 0.15);
    }
  }
  const net = Math.round(gold + trade + tribute - upkeep);
  return { sci: Math.round(sci), gold: Math.round(gold), cult: Math.round(cult), upkeep, trade, tribute, net };
}

export function processCivEconomy(g: Game, civ: Civ): void {
  const tot = civTotals(g, civ);
  civ.gold += tot.net;
  civ.culture += civ.artifacts.length;
  if (civ.gold < 0) {
    // Bankruptcy: disband the costliest unit.
    const units = g.unitsOf(civ.id).filter((u) => isMilitary(UNIT[u.type]));
    if (units.length) {
      const victim = units.sort((a, b) => UNIT[b.type].cost - UNIT[a.type].cost)[0];
      removeUnit(g, victim);
      if (civ.isPlayer) g.notify(`The treasury is empty. Unpaid ${UNIT[victim.type].name} desert.`, 'bad', victim.tile);
    }
    civ.gold = 0;
  }
  // Research.
  if (!civ.research && !civ.isPlayer) civ.research = pickResearch(g, civ);
  civ.sciStore += tot.sci;
  let guard = 0;
  while (civ.research && guard++ < 4) {
    const cost = techCostFor(g, civ, civ.research);
    if (civ.sciStore < cost) break;
    civ.sciStore -= cost;
    const id = civ.research;
    learnTech(g, civ, id);
    if (!civ.research && !civ.isPlayer) civ.research = pickResearch(g, civ);
  }
  if (civ.anarchy > 0) {
    civ.anarchy--;
    if (civ.anarchy === 0 && civ.isPlayer) g.notify('Order is restored. The new government takes hold.', 'good');
  }
  // Pollution and cleanup.
  let pol = 0;
  let clean = 0;
  for (const c of g.citiesOf(civ.id)) {
    for (const b of c.buildings) {
      pol += BUILDING[b]?.fx.pollution ?? 0;
      clean += BUILDING[b]?.fx.cleanup ?? 0;
    }
  }
  if (civ.identity.includes('ecological')) pol *= 0.5;
  if (civ.purpose === 'earth') pol *= 0.3;
  civ.pollution = Math.max(0, civ.pollution * 0.97 + pol * 0.3 - clean * 0.3);
  // War weariness.
  const atWar = g.enemiesOf(civ.id).length > 0;
  civ.warWeariness = atWar ? civ.warWeariness + 0.35 : civ.warWeariness * 0.9;
  // Discontent: share of cities in unrest.
  const cities = g.citiesOf(civ.id);
  const unrest = cities.filter((c) => c.y.mood < 0).length;
  civ.discontent = cities.length ? civ.discontent * 0.8 + (unrest / cities.length) * 5 : 0;
  civ.modifiers = civ.modifiers.filter((m) => m.until > g.turn);
  // Cohesion matters once survival is no longer the problem.
  if (civ.eraTier >= 7) {
    let d = 0;
    const avgMood = cities.reduce((s, c) => s + c.y.mood, 0) / Math.max(1, cities.length);
    d += avgMood > 2 ? 0.4 : avgMood < 0 ? -0.6 : 0;
    if (civ.government === 'aigov') d -= 0.5;
    if (civ.identity.includes('individualist') && civ.identity.includes('mercantile')) d -= 0.3;
    if (civ.identity.includes('artistic')) d += 0.3;
    if (civ.purpose) d += 0.25;
    d -= civ.pollution / 60;
    civ.cohesion = Math.max(0, Math.min(100, civ.cohesion + d));
  }
  const pop = civPopulation(g, civ);
  if (pop > civ.stats.peakPop) civ.stats.peakPop = pop;
  if (cities.length > civ.stats.peakCities) civ.stats.peakCities = cities.length;
}

// --- Collapse ------------------------------------------------------------------------------

export function collapseCiv(g: Game, civ: Civ, cause: string): void {
  if (!civ.alive) return;
  civ.alive = false;
  civ.collapsed = g.turn;
  for (const u of [...g.unitsOf(civ.id)]) removeUnit(g, u);
  for (const w of g.s.wars) {
    if (w.end >= 0) continue;
    const side = w.attackers.includes(civ.id) ? 'attackers' : w.defenders.includes(civ.id) ? 'defenders' : null;
    if (!side) continue;
    // Participants stay on record; the war ends when a whole side is gone.
    if (w[side].every((c) => c === civ.id || !g.civ(c).alive)) {
      w.end = g.turn;
      const winners = side === 'attackers' ? w.defenders : w.attackers;
      w.outcome = `The ${civ.name} were destroyed.`;
      for (const c of winners) g.civ(c).stats.warsWon++;
    }
  }
  for (const other of g.s.civs) {
    const r = other.relations[civ.id];
    if (r) {
      r.war = false;
      r.trade = r.openBorders = r.alliance = -1;
    }
    if (other.vassalOf === civ.id) other.vassalOf = -1;
  }
  const lead = currentLeader(g, civ);
  if (lead && lead.ended < 0) {
    lead.ended = g.turn;
    lead.endCause = 'fell';
  }
  const years = g.turn - civ.founded;
  logHistory(g, 'collapse', 3, [civ.id],
    `The ${civ.name} civilization comes to an end, ${cause}. Their story lasted ${years} years.`);
}

// --- Projects ------------------------------------------------------------------------------

export function completeProject(g: Game, civ: Civ, city: City, id: string): void {
  civ.projects[id] = g.turn;
  const p = PROJECT[id];
  const first = !g.s.civs.some((c) => c !== civ && c.projects[id] !== undefined);
  switch (id) {
    case 'satellite':
      civ.explored.fill(1);
      logHistory(g, 'space', 3, [civ.id], first
        ? `From ${city.name}, the ${civ.name} launch the first satellite. For the first time, a people sees the whole world from above.`
        : `The ${civ.name} launch a satellite from ${city.name}.`, city.tile);
      g.emit({ type: 'reveal' });
      break;
    case 'station':
      logHistory(g, 'space', 3, [civ.id], first
        ? `The ${civ.name} open the first orbital station. People now live beyond the sky.`
        : `The ${civ.name} open an orbital station.`, city.tile);
      break;
    default: {
      logHistory(g, 'space', 2, [civ.id], `${city.name} completes ${p.name}.`, city.tile);
      const parts = ['colony_hull', 'colony_engine', 'colony_cryo'];
      if (parts.every((pt) => civ.projects[pt] !== undefined)) {
        const ship = word(civ.lang, g.rng, 2, 3);
        logHistory(g, 'space', 3, [civ.id],
          `The colony ship ${ship} leaves orbit, carrying ${civ.adj} settlers toward another star. Whatever happens here, the ${civ.name} will endure.`, city.tile);
        civ.legacies.scientific = civ.legacies.scientific ?? g.turn;
      }
    }
  }
  addDeed(g, civ, `Completed ${p.name}`);
}

// --- Stats -----------------------------------------------------------------------------------

export function sampleStats(g: Game): void {
  const territory = new Map<number, number>();
  const owner = g.s.map.owner;
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] >= 0) territory.set(owner[i], (territory.get(owner[i]) ?? 0) + 1);
  }
  const civs: Record<number, [number, number, number, number, number, number]> = {};
  for (const c of g.s.civs) {
    if (!c.alive) continue;
    civs[c.id] = [
      civPopulation(g, c),
      territory.get(c.id) ?? 0,
      g.citiesOf(c.id).length,
      Object.keys(c.techs).length,
      Math.round(c.culture),
      Math.round(powerOf(g, c.id)),
    ];
  }
  g.s.samples.push({ turn: g.turn, civs });
}
