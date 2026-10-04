import { ordinal } from '../core/names';
import { GOV } from '../data/society';
import { TRAIT } from '../data/society';
import { RESOURCES } from '../data/terrain';
import { UNIT, isMilitary } from '../data/units';
import { transferCity } from './cities';
import { type Game, yearsAgo } from './game';
import { logHistory, regionName, riverName } from './history';
import { shiftTrait, traitW } from './identity';
import { addDeed, currentLeader, leaderHas } from './leaders';
import type { Civ, Memory, Relation, War } from './state';

// Civilizations remember. Every treaty, insult, war and kindness becomes a
// memory with its own weight and its own pace of forgetting.

export function newRelation(turn: number): Relation {
  return {
    met: turn,
    war: false,
    warId: -1,
    trade: -1,
    openBorders: -1,
    alliance: -1,
    peaceUntil: -1,
    vassal: false,
    memories: [],
    opinion: 0,
    lastProposal: -99,
    lastWarCheck: -99,
    borderTension: 0,
    trespass: 0,
  };
}

export function relOf(g: Game, a: number, b: number): Relation | undefined {
  return g.civ(a).relations[b];
}

export function meet(g: Game, a: number, b: number): void {
  if (a === b) return;
  const A = g.civ(a);
  const B = g.civ(b);
  if (!A.alive || !B.alive) return;
  if (A.relations[b]?.met >= 0) return;
  A.relations[b] = newRelation(g.turn);
  B.relations[a] = newRelation(g.turn);
  const firstA = A.stats.firstContact < 0;
  const firstB = B.stats.firstContact < 0;
  if (firstA) A.stats.firstContact = g.turn;
  if (firstB) B.stats.firstContact = g.turn;
  const involvesPlayer = A.isPlayer || B.isPlayer;
  const text = firstA || firstB
    ? `The ${A.name} and the ${B.name} meet for the first time. ${firstA && firstB ? 'Neither people had known others existed.' : `It is the first foreign people the ${firstA ? A.name : B.name} have ever encountered.`}`
    : `The ${A.name} make contact with the ${B.name}.`;
  logHistory(g, 'contact', involvesPlayer ? 3 : 1, [a, b], text);
  if (involvesPlayer) {
    const other = A.isPlayer ? B : A;
    const cap = g.capital(other);
    if (cap) g.player.explored[cap.tile] = 1;
    g.emit({ type: 'reveal' });
  }
}

export function addMemory(
  g: Game,
  holder: number,
  about: number,
  kind: string,
  value: number,
  decay: number,
  floor: number,
  text: string,
  maxStack = 1,
): void {
  const rel = g.civ(holder).relations[about];
  if (!rel) return;
  const same = rel.memories.filter((m) => m.kind === kind);
  if (same.length >= maxStack) {
    const oldest = same[0];
    oldest.value = Math.sign(value) * Math.min(Math.abs(oldest.value) + Math.abs(value) * 0.5, Math.abs(value) * maxStack);
    oldest.turn = g.turn;
    return;
  }
  rel.memories.push({ kind, turn: g.turn, value, decay, floor, text });
}

export function tickMemories(civ: Civ): void {
  for (const k in civ.relations) {
    const rel = civ.relations[k];
    rel.memories = rel.memories.filter((m) => {
      if (m.value > m.floor) m.value = Math.max(m.floor, m.value - m.decay);
      else if (m.value < m.floor) m.value = Math.min(m.floor, m.value + m.decay);
      return Math.abs(m.value) >= 0.5 || m.floor !== 0;
    });
  }
}

export function memoryText(m: Memory, now: number): string {
  return m.text.replace('{ago}', yearsAgo(now, m.turn));
}

export interface OpinionPart {
  label: string;
  value: number;
}

/** How civ `a` feels about civ `b`, with the reasons. */
export function opinionParts(g: Game, a: number, b: number): OpinionPart[] {
  const A = g.civ(a);
  const B = g.civ(b);
  const rel = A.relations[b];
  if (!rel) return [];
  const parts: OpinionPart[] = [];
  for (const m of rel.memories) {
    if (Math.abs(m.value) >= 1) parts.push({ label: memoryText(m, g.turn), value: Math.round(m.value) });
  }
  const govD = GOV[B.government].diplo;
  if (govD) parts.push({ label: govD > 0 ? `They admire your ${GOV[B.government].name}.` : `They distrust your ${GOV[B.government].name}.`, value: govD });
  if (A.religionId >= 0 && B.religionId >= 0) {
    if (A.religionId === B.religionId) parts.push({ label: 'You share their faith.', value: 8 });
    else {
      const theo = A.government === 'theocracy' || B.government === 'theocracy';
      parts.push({ label: 'You follow a different faith.', value: theo ? -12 : -4 });
    }
  }
  for (const t of A.identity) {
    if (B.identity.includes(t)) parts.push({ label: `Kindred spirits: both ${TRAIT[t].label.toLowerCase()}.`, value: 5 });
    const opp = TRAIT[t].opposite;
    if (opp && B.identity.includes(opp)) parts.push({ label: `They are ${TRAIT[t].label.toLowerCase()}; you are ${TRAIT[opp].label.toLowerCase()}.`, value: -6 });
  }
  if (rel.trade >= 0) parts.push({ label: 'Trade enriches you both.', value: A.identity.includes('mercantile') ? 14 : 8 });
  if (rel.openBorders >= 0) parts.push({ label: 'Your borders are open to each other.', value: 4 });
  if (rel.alliance >= 0) parts.push({ label: 'You are allies.', value: 15 });
  if (rel.borderTension > 4) parts.push({ label: 'Your borders press against theirs.', value: -Math.min(15, Math.round(rel.borderTension / 4)) });
  if (rel.war) parts.push({ label: 'You are at war.', value: -30 });
  if (A.vassalOf === b) parts.push({ label: 'They resent being your vassal.', value: -10 });
  if (B.vassalOf === a) parts.push({ label: 'You are their loyal vassal.', value: 10 });
  if (leaderHas(g, A, 'diplomatic')) parts.push({ label: 'Their ruler is diplomatic by nature.', value: 8 });
  if (leaderHas(g, A, 'paranoid')) parts.push({ label: 'Their ruler trusts no one.', value: -8 });
  if (leaderHas(g, B, 'diplomatic')) parts.push({ label: 'Your ruler is well liked.', value: 5 });
  const pa = powerOf(g, a);
  const pb = powerOf(g, b);
  if (A.identity.includes('militaristic') && pb < pa * 0.5) parts.push({ label: 'They see you as weak.', value: -6 });
  if (A.identity.includes('isolationist')) parts.push({ label: 'They prefer to keep to themselves.', value: -5 });
  return parts;
}

export function computeOpinion(g: Game, a: number, b: number): number {
  let sum = 0;
  for (const p of opinionParts(g, a, b)) sum += p.value;
  return Math.max(-100, Math.min(100, Math.round(sum)));
}

export type Status = 'unknown' | 'neutral' | 'friendly' | 'trading' | 'allied' | 'hostile' | 'war' | 'vassal' | 'overlord' | 'rival';

export const STATUS_LABEL: Record<Status, string> = {
  unknown: 'Unknown', neutral: 'Neutral', friendly: 'Friendly', trading: 'Trading partners', allied: 'Allied',
  hostile: 'Hostile', war: 'At war', vassal: 'Your vassal', overlord: 'Your overlord', rival: 'Rival',
};

/** Status of `b` as seen from `a`. */
export function relationStatus(g: Game, a: number, b: number): Status {
  const rel = g.civ(a).relations[b];
  if (!rel || rel.met < 0) return 'unknown';
  if (rel.war) return 'war';
  if (g.civ(b).vassalOf === a) return 'vassal';
  if (g.civ(a).vassalOf === b) return 'overlord';
  if (rel.alliance >= 0) return 'allied';
  const op = g.civ(b).relations[a]?.opinion ?? 0;
  const pastWars = g.s.wars.filter((w) => sides(w, a, b)).length;
  if (op <= -50 && pastWars >= 2) return 'rival';
  if (op <= -30) return 'hostile';
  if (rel.trade >= 0) return 'trading';
  if (op >= 30) return 'friendly';
  return 'neutral';
}

function sides(w: War, a: number, b: number): boolean {
  return (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a));
}

export function powerOf(g: Game, civId: number): number {
  let p = 0;
  for (const u of g.unitsOf(civId)) {
    const def = UNIT[u.type];
    if (!isMilitary(def)) continue;
    p += Math.max(def.str, def.rng) * (0.4 + 0.6 * (u.hp / 100));
  }
  for (const c of g.citiesOf(civId)) p += c.y.defense * 0.35;
  return Math.max(1, p);
}

// --- Treaties ------------------------------------------------------------------

export type TreatyKind = 'trade' | 'openBorders' | 'alliance';

export const TREATY_LABEL: Record<TreatyKind, string> = {
  trade: 'trade agreement',
  openBorders: 'open borders treaty',
  alliance: 'defensive alliance',
};

export function signTreaty(g: Game, a: number, b: number, kind: TreatyKind): void {
  const ra = g.civ(a).relations[b];
  const rb = g.civ(b).relations[a];
  if (!ra || !rb || ra.war) return;
  ra[kind] = g.turn;
  rb[kind] = g.turn;
  const A = g.civ(a);
  const B = g.civ(b);
  A.stats.treaties++;
  B.stats.treaties++;
  const la = currentLeader(g, A);
  const lb = currentLeader(g, B);
  if (la) la.ach.treaties++;
  if (lb) lb.ach.treaties++;
  if (kind === 'trade') {
    shiftTrait(A, 'mercantile', 1);
    shiftTrait(B, 'mercantile', 1);
  }
  const imp = kind === 'alliance' ? 2 : 1;
  const firstTrade = kind === 'trade' && A.stats.treaties <= 1;
  logHistory(g, 'treaty', A.isPlayer || B.isPlayer ? 2 : imp, [a, b],
    kind === 'alliance'
      ? `The ${A.name} and the ${B.name} enter a defensive alliance.`
      : kind === 'trade'
        ? `${firstTrade ? 'In their first such pact, the' : 'The'} ${A.name} and the ${B.name} agree to trade.`
        : `The ${A.name} and the ${B.name} open their borders to one another.`);
  if (kind === 'alliance') {
    addDeed(g, A, `Allied with the ${B.name}`);
    addDeed(g, B, `Allied with the ${A.name}`);
  }
}

export function cancelTreaty(g: Game, a: number, b: number, kind: TreatyKind, quiet = false): void {
  const ra = g.civ(a).relations[b];
  const rb = g.civ(b).relations[a];
  if (!ra || !rb || ra[kind] < 0) return;
  ra[kind] = -1;
  rb[kind] = -1;
  if (!quiet) {
    logHistory(g, 'treaty', 1, [a, b], `The ${TREATY_LABEL[kind]} between the ${g.civ(a).name} and the ${g.civ(b).name} ends.`);
  }
}

/** Gold per turn civ `a` earns from its trade agreement with `b`. */
export function tradeIncome(g: Game, a: number, b: number): number {
  const A = g.civ(a);
  const ca = g.citiesOf(a).length;
  const cb = g.citiesOf(b).length;
  let v = 2 + 0.7 * Math.min(ca, cb) + 0.12 * (A.eraTier + 1) * Math.min(ca, cb);
  v *= 1 + GOV[A.government].tradePct / 100;
  if (A.identity.includes('mercantile')) v *= 1.25;
  if (A.identity.includes('isolationist')) v *= 0.6;
  return Math.round(v);
}

/** Luxury resources a civilization can enjoy: its own plus its trade partners'. */
export function luxuries(g: Game, civId: number): Set<number> {
  const own = ownedResources(g, civId);
  const set = new Set<number>();
  for (const r of own) if (RESOURCES[r].kind === 'luxury') set.add(r);
  const civ = g.civ(civId);
  for (const k in civ.relations) {
    if (civ.relations[k].trade < 0) continue;
    for (const r of ownedResources(g, Number(k))) if (RESOURCES[r].kind === 'luxury') set.add(r);
  }
  return set;
}

// Cached per game instance so a loaded or parallel game never sees stale entries.
const resCaches = new WeakMap<Game, Map<number, { turn: number; set: Set<number> }>>();

function resCacheOf(g: Game): Map<number, { turn: number; set: Set<number> }> {
  let c = resCaches.get(g);
  if (!c) resCaches.set(g, (c = new Map()));
  return c;
}

export function ownedResources(g: Game, civId: number): Set<number> {
  const resCache = resCacheOf(g);
  const cached = resCache.get(civId);
  if (cached && cached.turn === g.turn) return cached.set;
  const set = new Set<number>();
  const map = g.s.map;
  const civ = g.civ(civId);
  for (const c of g.citiesOf(civId)) {
    for (const t of g.grid.within(c.tile, 3)) {
      if (map.owner[t] !== civId) continue;
      const r = map.resource[t];
      if (!r) continue;
      const def = RESOURCES[r];
      if (def.reveal && civ.techs[def.reveal] === undefined) continue;
      set.add(r);
    }
  }
  resCache.set(civId, { turn: g.turn, set });
  return set;
}

export function invalidateResources(g: Game, civId?: number): void {
  if (civId === undefined) resCacheOf(g).clear();
  else resCacheOf(g).delete(civId);
}

export function hasResource(g: Game, civId: number, key: string): boolean {
  const def = RESOURCES.find((r) => r.key === key);
  if (!def) return true;
  return ownedResources(g, civId).has(def.id);
}

// --- War -------------------------------------------------------------------------

function setWar(g: Game, a: number, b: number, warId: number): void {
  const ra = g.civ(a).relations[b];
  const rb = g.civ(b).relations[a];
  if (!ra || !rb) return;
  for (const kind of ['trade', 'openBorders', 'alliance'] as TreatyKind[]) cancelTreaty(g, a, b, kind, true);
  ra.war = rb.war = true;
  ra.warId = rb.warId = warId;
  ra.peaceUntil = rb.peaceUntil = -1;
}

function nameWar(g: Game, a: number, b: number, cause: string, front: number): string {
  const taken = new Set(g.s.wars.map((w) => w.name));
  const base = baseWarName(g, a, b, cause, front, taken);
  if (!taken.has(base)) return base;
  for (let k = 2; k < 30; k++) {
    const alt = base.replace(/^the (First |Second |Third )?/, `the ${ordinal(k)} `);
    if (!taken.has(alt)) return alt;
  }
  return `${base} (${g.turn})`;
}

function baseWarName(g: Game, a: number, b: number, cause: string, front: number, taken: Set<string>): string {
  const A = g.civ(a);
  const B = g.civ(b);
  const prior = g.s.wars.filter((w) => sides(w, a, b)).length;
  const ord = ordinal(prior + 1);
  if (cause === 'betrayal') return 'the War of Broken Oaths';
  if (cause === 'civil') return `the ${A.adj} Civil War`;
  if (cause === 'independence') return `the ${A.adj} War of Independence`;
  if (cause.startsWith('resource:')) return `the ${cause.slice(9)} War`;
  if (cause === 'faith') return 'the War of the Two Faiths';
  const opts: string[] = [`the ${ord} ${A.adj}–${B.adj} War`];
  if (front >= 0) {
    const river = riverName(g, front);
    if (river) opts.push(prior === 0 ? `the ${river} War` : `the ${ord} ${river} War`);
    const region = regionName(g, front);
    if (region && prior === 0) opts.push(`the War of ${region}`);
  }
  const free = opts.filter((o) => !taken.has(o));
  return g.rng.pick(free.length ? free : opts);
}

function frontBetween(g: Game, a: number, b: number): number {
  const ca = g.citiesOf(a);
  const cb = g.citiesOf(b);
  let best = -1;
  let bestD = Infinity;
  for (const x of ca) {
    for (const y of cb) {
      const d = g.grid.distance(x.tile, y.tile);
      if (d < bestD) {
        bestD = d;
        best = y.tile;
      }
    }
  }
  return best;
}

export function warBetween(g: Game, a: number, b: number): War | undefined {
  const rel = g.civ(a).relations[b];
  if (!rel?.war) return undefined;
  return g.s.wars.find((w) => w.id === rel.warId);
}

export function declareWar(g: Game, a: number, b: number, cause = 'ambition'): War {
  const A = g.civ(a);
  const B = g.civ(b);
  if (!A.relations[b]) meet(g, a, b);
  const existing = warBetween(g, a, b);
  if (existing) return existing;
  const ra = A.relations[b];
  const betrayal = ra.peaceUntil > g.turn || ra.alliance >= 0;
  const front = frontBetween(g, a, b);
  const war: War = {
    id: g.nextId(),
    name: nameWar(g, a, b, betrayal ? 'betrayal' : cause, front),
    attackers: [a],
    defenders: [b],
    aggressor: a,
    cause: betrayal ? 'betrayal' : cause,
    start: g.turn,
    end: -1,
    battles: 0,
    casualties: {},
    score: {},
    captures: [],
    outcome: '',
    frontTile: front,
  };
  g.s.wars.push(war);
  setWar(g, a, b, war.id);
  A.stats.warsFought++;
  B.stats.warsFought++;
  A.ai.lastWarTurn = g.turn;
  addMemory(g, b, a, 'declared_war', -35, 0.25, -8, 'You declared war on us {ago}.');
  if (betrayal) {
    A.stats.betrayals++;
    addMemory(g, b, a, 'betrayal', -60, 0.12, -25, 'You betrayed us {ago}.');
    for (const c of g.aliveCivs()) {
      if (c.id === a || c.id === b || !g.knows(c.id, a)) continue;
      addMemory(g, c.id, a, 'oathbreaker', -12, 0.1, 0, `You broke your word to the ${B.name} {ago}.`);
    }
  }
  shiftTrait(A, 'militaristic', 3);
  shiftTrait(B, 'defensive', 1.5);
  const capName = war.name.charAt(0).toUpperCase() + war.name.slice(1);
  const text = betrayal
    ? `${capName} begins: the ${A.name} betray the ${B.name} and attack.`
    : `${capName} begins: the ${A.name} declare war on the ${B.name}.`;
  logHistory(g, 'war', A.isPlayer || B.isPlayer ? 3 : 2, [a, b], text, front);
  if (B.isPlayer) g.notify(`The ${A.name} have declared war on us!`, 'war', front);

  // Allies of the defender are called.
  for (const c of g.aliveCivs()) {
    if (c.id === a || c.id === b) continue;
    const rc = c.relations[b];
    const vassalOfB = c.vassalOf === b;
    if (!(rc && rc.alliance >= 0) && !vassalOfB) continue;
    if (g.atWar(c.id, a)) continue;
    if (c.isPlayer) {
      g.s.decisions.push({ id: g.nextId(), civId: c.id, event: 'ally_call', turn: g.turn, params: { ally: b, enemy: a, war: war.id } });
      g.emit({ type: 'decision' });
      continue;
    }
    const opinionOfA = c.relations[a]?.opinion ?? 0;
    const honor = vassalOfB || g.rng.next() < 0.85 - Math.max(0, opinionOfA) / 120 - (leaderHas(g, c, 'diplomatic') ? 0 : 0);
    if (honor) joinWar(g, c.id, war, 'defenders');
    else {
      addMemory(g, b, c.id, 'abandoned_ally', -45, 0.15, -15, 'You abandoned us in our hour of need {ago}.');
      cancelTreaty(g, c.id, b, 'alliance', true);
      logHistory(g, 'treaty', 1, [c.id, b], `The ${c.name} refuse to honor their alliance with the ${B.name}.`);
    }
  }
  return war;
}

export function joinWar(g: Game, civId: number, war: War, side: 'attackers' | 'defenders'): void {
  const enemies = side === 'defenders' ? war.attackers : war.defenders;
  const friends = side === 'defenders' ? war.defenders : war.attackers;
  if (war[side].includes(civId)) return;
  war[side].push(civId);
  const C = g.civ(civId);
  for (const e of enemies) {
    if (!C.relations[e]) meet(g, civId, e);
    setWar(g, civId, e, war.id);
    addMemory(g, e, civId, 'declared_war', -25, 0.25, -5, 'You joined a war against us {ago}.');
  }
  for (const f of friends) {
    if (f === civId) continue;
    addMemory(g, f, civId, 'ally_help', 25, 0.15, 5, `You stood with us in ${war.name} {ago}.`);
  }
  const lead = g.civ(friends[0]);
  logHistory(g, 'war', C.isPlayer ? 3 : 2, [civId, ...enemies],
    `The ${C.name} join ${war.name} on the side of the ${lead.name}.`);
}

/** -100..100: how well the war is going for `civId`. */
export function warScore(war: War, civId: number): number {
  const mine = war.attackers.includes(civId) ? war.attackers : war.defenders;
  const theirs = mine === war.attackers ? war.defenders : war.attackers;
  let m = 0;
  let t = 0;
  for (const c of mine) m += war.score[c] ?? 0;
  for (const c of theirs) t += war.score[c] ?? 0;
  return Math.round(((m - t) / Math.max(12, m + t)) * 100);
}

export function addWarScore(g: Game, war: War | undefined, civId: number, amount: number): void {
  if (!war) return;
  war.score[civId] = (war.score[civId] ?? 0) + amount;
}

export interface PeaceTerms {
  kind: 'white' | 'cede' | 'tribute' | 'vassal';
  winner?: number;
  loser?: number;
  cityId?: number;
  gold?: number;
}

export function makePeace(g: Game, war: War, terms: PeaceTerms): void {
  if (war.end >= 0) return;
  war.end = g.turn;
  for (const a of war.attackers) {
    for (const d of war.defenders) {
      const ra = g.civ(a).relations[d];
      const rd = g.civ(d).relations[a];
      if (!ra || !rd) continue;
      ra.war = rd.war = false;
      ra.warId = rd.warId = -1;
      ra.peaceUntil = rd.peaceUntil = g.turn + Math.round(20 * g.paceMult());
      addMemory(g, a, d, 'peace', 10, 0.08, 0, 'We made peace {ago}.');
      addMemory(g, d, a, 'peace', 10, 0.08, 0, 'We made peace {ago}.');
    }
  }
  // The treaty takes its name from a city near the front.
  const all = [...war.attackers, ...war.defenders].flatMap((c) => g.citiesOf(c));
  let treatyCity = all[0];
  if (war.frontTile >= 0) {
    let best = Infinity;
    for (const c of all) {
      const d = g.grid.distance(c.tile, war.frontTile);
      if (d < best) {
        best = d;
        treatyCity = c;
      }
    }
  }
  const treaty = treatyCity ? `the Treaty of ${treatyCity.name}` : 'a treaty';
  let detail = '';
  const winner = terms.winner !== undefined ? g.civ(terms.winner) : undefined;
  const loser = terms.loser !== undefined ? g.civ(terms.loser) : undefined;
  if (terms.kind === 'cede' && winner && loser && terms.cityId !== undefined) {
    const city = g.city(terms.cityId);
    if (city && city.civId === loser.id) {
      detail = ` The ${loser.name} cede ${city.name} to the ${winner.name}.`;
      transferCity(g, city, winner.id, 'ceded');
    }
  } else if (terms.kind === 'tribute' && winner && loser) {
    const gold = Math.min(loser.gold, terms.gold ?? 0);
    loser.gold -= gold;
    winner.gold += gold;
    detail = ` The ${loser.name} pay ${gold} gold in reparations.`;
  } else if (terms.kind === 'vassal' && winner && loser) {
    loser.vassalOf = winner.id;
    loser.relations[winner.id].vassal = true;
    detail = ` The ${loser.name} become vassals of the ${winner.name}.`;
    shiftTrait(loser, 'defensive', 5);
  } else {
    detail = ' Neither side gains anything.';
  }
  if (winner && loser) {
    const winSide = war.attackers.includes(winner.id) ? war.attackers : war.defenders;
    const loseSide = winSide === war.attackers ? war.defenders : war.attackers;
    for (const c of winSide) {
      const civ = g.civ(c);
      civ.stats.warsWon++;
      const l = currentLeader(g, civ);
      if (l) l.ach.warsWon++;
      addDeed(g, civ, `Won ${war.name}`);
      shiftTrait(civ, 'militaristic', 2);
    }
    for (const c of loseSide) {
      const civ = g.civ(c);
      civ.stats.warsLost++;
      const l = currentLeader(g, civ);
      if (l) l.ach.warsLost++;
      addDeed(g, civ, `Lost ${war.name}`);
      shiftTrait(civ, 'defensive', 4);
    }
    war.outcome = `Victory for the ${winner.name}.${detail}`;
  } else {
    war.outcome = `A white peace.${detail}`;
  }
  const capTreaty = treaty.charAt(0).toUpperCase() + treaty.slice(1);
  const involvesPlayer = [...war.attackers, ...war.defenders].includes(g.s.playerId);
  logHistory(g, 'peace', involvesPlayer ? 3 : 2, [...war.attackers, ...war.defenders],
    `${capTreaty} ends ${war.name} after ${Math.max(1, war.end - war.start)} years.${detail}`, treatyCity?.tile ?? -1);
  for (const c of [...war.attackers, ...war.defenders]) {
    addDeed(g, g.civ(c), `Signed ${treaty}`);
    g.civ(c).warWeariness *= 0.5;
  }
}

// --- Proposals ---------------------------------------------------------------------

export type Proposal =
  | { kind: 'trade' }
  | { kind: 'openBorders' }
  | { kind: 'alliance' }
  | { kind: 'peace'; terms: 'white' | 'theyCede' | 'weCede' | 'wePay' | 'theyPay' | 'theyVassal'; cityId?: number; gold?: number }
  | { kind: 'gift'; gold: number }
  | { kind: 'demand'; gold: number }
  | { kind: 'joinWar'; against: number };

export function describeProposal(g: Game, from: number, to: number, p: Proposal): string {
  const F = g.civ(from);
  const T = g.civ(to);
  switch (p.kind) {
    case 'trade':
      return `a trade agreement between the ${F.name} and the ${T.name}`;
    case 'openBorders':
      return 'open borders';
    case 'alliance':
      return 'a defensive alliance';
    case 'gift':
      return `a gift of ${p.gold} gold`;
    case 'demand':
      return `tribute of ${p.gold} gold`;
    case 'joinWar':
      return `joining the war against the ${g.civ(p.against).name}`;
    case 'peace': {
      const city = p.cityId !== undefined ? g.city(p.cityId)?.name : '';
      switch (p.terms) {
        case 'white': return 'peace, with no conditions';
        case 'theyCede': return `peace, if the ${T.name} cede ${city}`;
        case 'weCede': return `peace, and the ${F.name} cede ${city}`;
        case 'wePay': return `peace, and the ${F.name} pay ${p.gold} gold`;
        case 'theyPay': return `peace, if the ${T.name} pay ${p.gold} gold`;
        case 'theyVassal': return `peace, if the ${T.name} become vassals of the ${F.name}`;
      }
    }
  }
  return '';
}

/** The sharpest grievance civ `a` holds against `b`, in their own words. */
export function grievance(g: Game, a: number, b: number): string | null {
  const rel = g.civ(a).relations[b];
  if (!rel) return null;
  const worst = [...rel.memories].filter((m) => m.value <= -10).sort((x, y) => x.value - y.value)[0];
  return worst ? memoryText(worst, g.turn) : null;
}

export interface Verdict {
  accept: boolean;
  reason: string;
}

/** Would AI civ `ai` accept proposal `p` from civ `from`? */
export function evaluateProposal(g: Game, ai: number, from: number, p: Proposal): Verdict {
  const A = g.civ(ai);
  const rel = A.relations[from];
  if (!rel) return { accept: false, reason: 'We do not know you.' };
  const op = rel.opinion;
  const grudge = grievance(g, ai, from);
  const no = (fallback: string): Verdict => ({ accept: false, reason: grudge && op < 10 ? `${grudge} No.` : fallback });
  const yes = (r: string): Verdict => ({ accept: true, reason: r });
  switch (p.kind) {
    case 'trade': {
      if (rel.war) return no('We are at war.');
      if (A.techs.writing === undefined) return no('We have no scribes to keep such accounts.');
      if (g.civ(from).techs.writing === undefined) return no('You cannot even write down a contract. (Requires Writing)');
      if (A.identity.includes('isolationist') && op < 30) return no('We have no need of foreign goods.');
      return op >= -15 ? yes('Let our merchants meet.') : no('We do not trust you enough to trade.');
    }
    case 'openBorders':
      if (rel.war) return no('We are at war.');
      if (leaderHas(g, A, 'paranoid') && op < 50) return no('Our ruler will not have foreigners wandering our lands.');
      return op >= 10 ? yes('Travel freely, friends.') : no('Our borders stay closed to you.');
    case 'alliance': {
      if (rel.war) return no('We are at war.');
      const commonEnemy = g.enemiesOf(ai).some((e) => g.atWar(from, e));
      const need = commonEnemy ? 25 : 45;
      return op >= need ? yes('Together we are stronger.') : no('We are not that close.');
    }
    case 'gift':
      return yes('A generous gift. We will remember it.');
    case 'demand': {
      const ratio = powerOf(g, from) / powerOf(g, ai);
      if (A.gold < p.gold) return no('We do not have that much gold.');
      if (ratio > 1.8 && !A.identity.includes('militaristic')) return yes('We will pay. For now.');
      return no('We will not be bullied.');
    }
    case 'joinWar': {
      if (g.atWar(ai, p.against)) return yes('We are already at war with them.');
      const opEnemy = A.relations[p.against]?.opinion ?? 0;
      return op >= 35 && opEnemy < 0 ? yes('Their crimes will not go unanswered.') : no('This is not our fight.');
    }
    case 'peace': {
      const war = warBetween(g, ai, from);
      if (!war) return yes('We are not at war.');
      const score = warScore(war, ai);
      const years = g.turn - war.start;
      let will = -score * 0.7 + A.warWeariness * 0.6 + years * 0.5;
      if (leaderHas(g, A, 'diplomatic')) will += 10;
      if (leaderHas(g, A, 'aggressive')) will -= 10;
      will -= traitW(A, 'militaristic') * 20;
      if (rel.memories.some((m) => m.kind === 'betrayal')) will -= 12;
      if (years < 4) will -= 15;
      switch (p.terms) {
        case 'white':
          return will > 8 ? yes('Enough blood has been spilled.') : no('We are not finished with you.');
        case 'weCede':
          return will > -25 ? yes('We accept your surrender.') : no('We want more than that.');
        case 'wePay':
          return will + (p.gold ?? 0) / 8 > 8 ? yes('Gold heals some wounds.') : no('Your gold cannot buy peace.');
        case 'theyCede': {
          const city = p.cityId !== undefined ? g.city(p.cityId) : undefined;
          if (!city || city.civId !== ai) return no('That city is not ours to give.');
          if (city.id === A.capitalId) return no('Never. Not our capital.');
          return score < -30 && will > 25 ? yes('It is a bitter price, but we will pay it.') : no('We will not give up our people.');
        }
        case 'theyPay':
          return score < -15 && will > 18 && A.gold >= (p.gold ?? 0) ? yes('Take it, and go.') : no('We will not pay.');
        case 'theyVassal': {
          const ratio = powerOf(g, from) / powerOf(g, ai);
          return score < -45 && ratio > 2.5 && will > 30 ? yes('We have no choice. We submit.') : no('We would rather die free.');
        }
      }
    }
  }
  return { accept: false, reason: 'No.' };
}

export function applyProposal(g: Game, from: number, to: number, p: Proposal): void {
  const F = g.civ(from);
  const T = g.civ(to);
  switch (p.kind) {
    case 'trade':
    case 'openBorders':
    case 'alliance':
      signTreaty(g, from, to, p.kind);
      break;
    case 'gift': {
      const gold = Math.min(F.gold, p.gold);
      F.gold -= gold;
      T.gold += gold;
      addMemory(g, to, from, 'gift', Math.min(30, gold / 6), 0.4, 0, 'You sent us gifts {ago}.', 2);
      break;
    }
    case 'demand': {
      const gold = Math.min(T.gold, p.gold);
      T.gold -= gold;
      F.gold += gold;
      addMemory(g, from, to, 'paid_tribute', 10, 0.3, 0, 'You paid us tribute {ago}.');
      addMemory(g, to, from, 'extorted', -15, 0.2, -3, 'You extorted tribute from us {ago}.');
      logHistory(g, 'tribute', 1, [from, to], `The ${T.name} pay tribute of ${gold} gold to the ${F.name}.`);
      break;
    }
    case 'joinWar': {
      const war = warBetween(g, from, p.against);
      if (war) {
        const side = war.attackers.includes(from) ? 'attackers' : 'defenders';
        joinWar(g, to, war, side);
      } else declareWar(g, to, p.against, 'alliance');
      addMemory(g, from, to, 'shared_enemy', 15, 0.15, 3, 'You fought beside us {ago}.');
      break;
    }
    case 'peace': {
      const war = warBetween(g, from, to);
      if (!war) break;
      switch (p.terms) {
        case 'white':
          makePeace(g, war, { kind: 'white' });
          break;
        case 'theyCede':
          makePeace(g, war, { kind: 'cede', winner: from, loser: to, cityId: p.cityId });
          break;
        case 'weCede':
          makePeace(g, war, { kind: 'cede', winner: to, loser: from, cityId: p.cityId });
          break;
        case 'wePay':
          makePeace(g, war, { kind: 'tribute', winner: to, loser: from, gold: p.gold });
          break;
        case 'theyPay':
          makePeace(g, war, { kind: 'tribute', winner: from, loser: to, gold: p.gold });
          break;
        case 'theyVassal':
          makePeace(g, war, { kind: 'vassal', winner: from, loser: to });
          break;
      }
      break;
    }
  }
}

/** Per-turn upkeep of all relations for one civ. */
export function tickRelations(g: Game, civ: Civ): void {
  tickMemories(civ);
  const map = g.s.map;
  for (const k in civ.relations) {
    const other = Number(k);
    const rel = civ.relations[k];
    if (!g.civ(other).alive) continue;
    // Border friction: count our tiles adjacent to theirs (sampled cheaply via cities).
    let touching = 0;
    for (const c of g.citiesOf(civ.id)) {
      for (const t of g.grid.ring(c.tile, 3)) if (map.owner[t] === other) touching++;
    }
    rel.borderTension = touching > 0 ? Math.min(80, rel.borderTension + touching * 0.15) : Math.max(0, rel.borderTension - 1);
    // Trespass by their soldiers.
    if (rel.openBorders < 0 && !rel.war) {
      let trespassers = 0;
      for (const u of g.unitsOf(other)) {
        if (map.owner[u.tile] === civ.id && isMilitary(UNIT[u.type])) trespassers++;
      }
      if (trespassers > 0) {
        rel.trespass++;
        if (rel.trespass % 3 === 0) addMemory(g, civ.id, other, 'trespass', -6, 0.5, 0, 'Your soldiers trespass on our land.', 4);
      } else rel.trespass = 0;
    }
    rel.opinion = computeOpinion(g, civ.id, other);
  }
}

export function weariness(g: Game, civ: Civ): number {
  let w = civ.warWeariness * GOV[civ.government].weariness;
  if (leaderHas(g, civ, 'charismatic')) w *= 0.5;
  if (civ.identity.includes('militaristic')) w *= 0.6;
  return Math.floor(w / 14);
}

export function leaderOf(g: Game, civ: Civ): string {
  const l = currentLeader(g, civ);
  return l ? `${l.title} ${l.name}` : 'their council';
}
