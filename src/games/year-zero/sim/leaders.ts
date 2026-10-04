import { personName, word } from '../core/names';
import { GOV, LEADER_TRAITS, type LeaderTraitId } from '../data/society';
import type { Game } from './game';
import { logHistory } from './history';
import { traitW } from './identity';
import type { Civ, Leader } from './state';

// Leaders arise from circumstance: a nation at war tends to raise generals,
// a starving one raises pragmatists. They live, age, achieve and die.

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export type Circumstance = 'founding' | 'death' | 'election' | 'coup' | 'revolution' | 'crisis-elder' | 'crisis-general' | 'council';

export function currentLeader(g: Game, civ: Civ): Leader | undefined {
  return civ.leaderId >= 0 ? g.s.leaders[civ.leaderId] : undefined;
}

export function leaderHas(g: Game, civ: Civ, trait: LeaderTraitId): boolean {
  const l = currentLeader(g, civ);
  return !!l && l.traits.includes(trait);
}

function traitWeights(g: Game, civ: Civ, why: Circumstance): [LeaderTraitId, number][] {
  const atWar = Object.values(civ.relations).some((r) => r.war);
  const recentDisaster = civ.modifiers.some((m) => m.kind === 'drought' || m.kind === 'plague' || m.kind === 'famine');
  const w: Record<LeaderTraitId, number> = {
    builder: 2, aggressive: 1.5, diplomatic: 1.5, scholar: 1.5, pious: 1, mercantile: 1, navigator: 0.6,
    patient: 1.2, charismatic: 1.2, ruthless: 0.6, paranoid: 0.6, reformer: 0.6, visionary: 0.8, pragmatic: 1, cruel: 0.3,
  };
  if (atWar) {
    w.aggressive += 4;
    w.charismatic += 2;
    w.ruthless += 1.5;
    w.paranoid += 1;
  } else {
    w.builder += 1.5;
    w.diplomatic += 1;
  }
  if (recentDisaster) {
    w.pragmatic += 3;
    w.patient += 1.5;
  }
  w.pious += traitW(civ, 'religious') * 6;
  w.mercantile += traitW(civ, 'mercantile') * 6;
  w.navigator += traitW(civ, 'maritime') * 6;
  w.scholar += traitW(civ, 'scientific') * 5;
  w.visionary += traitW(civ, 'scientific') * 3 + traitW(civ, 'artistic') * 3;
  w.aggressive += traitW(civ, 'militaristic') * 5;
  w.paranoid += traitW(civ, 'defensive') * 4 + traitW(civ, 'isolationist') * 3;
  w.diplomatic += traitW(civ, 'mercantile') * 2;
  if (why === 'revolution') {
    w.reformer += 5;
    w.charismatic += 2;
  }
  if (why === 'coup') {
    w.ruthless += 4;
    w.cruel += 2;
    w.aggressive += 2;
  }
  if (why === 'crisis-elder') {
    w.patient += 5;
    w.builder += 3;
    w.aggressive = 0.2;
  }
  if (why === 'crisis-general') {
    w.aggressive += 5;
    w.charismatic += 3;
    w.patient = 0.2;
  }
  if (why === 'council') {
    w.diplomatic += 4;
    w.reformer += 3;
  }
  if (civ.government === 'democracy' || civ.government === 'republic') {
    w.cruel = 0.05;
    w.ruthless *= 0.5;
  }
  return Object.entries(w) as [LeaderTraitId, number][];
}

export function createLeader(g: Game, civ: Civ, why: Circumstance): Leader {
  const rng = g.rng;
  const gov = GOV[civ.government];
  const hereditary = gov.term === 0 && civ.government !== 'dictatorship' && civ.government !== 'aigov';
  if (!hereditary || why === 'revolution' || why === 'coup' || why === 'founding' || !civ.dynasty) {
    civ.dynasty = word(civ.lang, rng, 2, 2);
  }
  const traits: LeaderTraitId[] = [];
  const count = rng.chance(0.3) ? 3 : 2;
  const weights = traitWeights(g, civ, why);
  for (let k = 0; k < count; k++) {
    const pick = rng.weighted(weights.filter(([t]) => !traits.includes(t)));
    if (pick) traits.push(pick);
  }
  const gender: 'f' | 'm' = rng.chance(0.5) ? 'f' : 'm';
  const elected = gov.term > 0;
  const age = elected ? rng.range(40, 62) : why === 'founding' ? rng.range(28, 45) : rng.range(18, 50);
  let name: string;
  if (civ.government === 'aigov') name = `${word(civ.lang, rng, 1, 1).toUpperCase()}-${rng.range(2, 99)}`;
  else {
    name = personName(civ.lang, rng);
    // Reused names take regnal numbers: Qio II.
    const same = g.s.leaders.filter((l) => l.civId === civ.id && (l.name === name || l.name.startsWith(`${name} `))).length;
    if (same) name = `${name} ${ROMAN[Math.min(same + 1, ROMAN.length - 1)]}`;
  }
  const leader: Leader = {
    id: g.s.leaders.length,
    civId: civ.id,
    name,
    epithet: '',
    title: gov.title[gender === 'f' ? 1 : 0],
    gender,
    born: g.turn - age,
    rose: g.turn,
    ended: -1,
    endCause: '',
    traits,
    deathAge: civ.government === 'aigov' ? 9999 : rng.range(50, 88),
    gov: civ.government,
    ach: { citiesFounded: 0, wonders: 0, techs: 0, warsWon: 0, warsLost: 0, conquered: 0, citiesLost: 0, treaties: 0, disasters: 0, reforms: 0 },
    deeds: [],
    reelected: -1,
  };
  g.s.leaders.push(leader);
  civ.leaderId = leader.id;
  const traitNames = traits.map((t) => LEADER_TRAITS[t].name.toLowerCase()).join(' and ');
  let text: string;
  switch (why) {
    case 'founding':
      text = `${leader.title} ${name}, ${traitNames}, leads the ${civ.name}.`;
      break;
    case 'election':
      text = `The ${civ.name} elect ${name} as ${leader.title}.`;
      break;
    case 'coup':
      text = `${name} seizes power over the ${civ.name} in a coup.`;
      break;
    case 'revolution':
      text = `${name} rises to lead the ${civ.name} in the wake of revolution.`;
      break;
    default:
      text = `${leader.title} ${name}${hereditary && why === 'death' ? ` of House ${civ.dynasty}` : ''} comes to power among the ${civ.name}.`;
  }
  logHistory(g, 'leader', civ.isPlayer ? 2 : 1, [civ.id], text);
  return leader;
}

export function addDeed(g: Game, civ: Civ, deed: string): void {
  const l = currentLeader(g, civ);
  if (!l) return;
  l.deeds.push(deed);
  if (l.deeds.length > 14) l.deeds.splice(0, l.deeds.length - 14);
}

export function chooseEpithet(l: Leader, now: number): string {
  const a = l.ach;
  const end = l.ended >= 0 ? l.ended : now;
  const reign = end - l.rose;
  const options: [string, number][] = [];
  if (a.conquered >= 2) options.push(['the Conqueror', a.conquered * 3]);
  if (a.citiesFounded >= 3) options.push(['the Founder', a.citiesFounded * 2]);
  if (a.wonders >= 2 || (a.wonders >= 1 && l.traits.includes('builder'))) options.push(['the Builder', a.wonders * 3.5]);
  if (a.techs >= 7) options.push(['the Wise', a.techs * 0.8]);
  if (a.treaties >= 3 && a.warsWon === 0) options.push(['the Peacemaker', a.treaties * 2]);
  if (a.warsWon >= 2) options.push(['the Victorious', a.warsWon * 3]);
  if (a.citiesLost >= 2 || a.warsLost >= 2) options.push(['the Unlucky', a.citiesLost * 3 + a.warsLost * 2]);
  if (a.disasters >= 3) options.push(['the Steadfast', a.disasters * 1.6]);
  if (a.reforms >= 1) options.push(['the Reformer', a.reforms * 4]);
  if (reign >= 40) options.push(['the Old', reign / 8]);
  if (l.endCause === 'assassinated') options.push(['the Martyr', 5]);
  if (l.ended >= 0 && reign <= 2) options.push(['the Brief', 20]);
  if (options.length) {
    options.sort((x, y) => y[1] - x[1]);
    return options[0][0];
  }
  const byTrait: Partial<Record<LeaderTraitId, string>> = {
    aggressive: 'the Bold', pious: 'the Pious', scholar: 'the Learned', patient: 'the Patient', cruel: 'the Cruel',
    diplomatic: 'the Gentle', mercantile: 'the Rich', navigator: 'the Navigator', builder: 'the Mason',
    charismatic: 'the Beloved', ruthless: 'the Iron-Handed', paranoid: 'the Watchful', visionary: 'the Dreamer',
    pragmatic: 'the Practical', reformer: 'the Reformer',
  };
  return byTrait[l.traits[0]] ?? 'the Quiet';
}

export function leaderFullName(l: Leader, now: number): string {
  return `${l.name} ${l.epithet || chooseEpithet(l, now)}`;
}

/** End the current reign and pick a successor. */
export function endReign(g: Game, civ: Civ, cause: string, successor: Circumstance = 'death'): void {
  const l = currentLeader(g, civ);
  if (l && l.ended < 0) {
    l.ended = g.turn;
    l.endCause = cause;
    l.epithet = chooseEpithet(l, g.turn);
    const years = g.turn - l.rose;
    const age = g.turn - l.born;
    let text: string;
    switch (cause) {
      case 'died':
        text = `${l.title} ${l.name} ${l.epithet} dies at the age of ${age}, after ${years} years of rule.`;
        break;
      case 'assassinated':
        text = `${l.title} ${l.name} ${l.epithet} is assassinated.`;
        break;
      case 'term':
        text = `${l.title} ${l.name} ${l.epithet} leaves office after ${years} years.`;
        break;
      case 'deposed':
        text = `${l.title} ${l.name} ${l.epithet} is overthrown.`;
        break;
      case 'plague':
        text = `${l.title} ${l.name} ${l.epithet} is taken by the plague.`;
        break;
      default:
        text = `${l.title} ${l.name} ${l.epithet}'s reign ends.`;
    }
    logHistory(g, 'leader-end', civ.isPlayer ? 2 : 1, [civ.id], text);
  }
  if (civ.alive) createLeader(g, civ, successor);
}

/** Aging, death and elections. Returns true if a succession crisis should be raised. */
export function tickLeader(g: Game, civ: Civ): 'crisis' | null {
  const l = currentLeader(g, civ);
  if (!l) {
    createLeader(g, civ, 'death');
    return null;
  }
  const gov = GOV[civ.government];
  const age = g.turn - l.born;
  if (age >= l.deathAge || (age > 60 && g.chance(0.004 * (age - 60)))) {
    const hereditary = gov.term === 0 && (civ.government === 'monarchy' || civ.government === 'empire');
    if (hereditary && g.chance(0.25)) {
      l.ended = g.turn;
      l.endCause = 'died';
      l.epithet = chooseEpithet(l, g.turn);
      logHistory(g, 'leader-end', civ.isPlayer ? 2 : 1, [civ.id],
        `${l.title} ${l.name} ${l.epithet} dies without a clear heir.`);
      return 'crisis';
    }
    endReign(g, civ, 'died');
    return null;
  }
  if (gov.term > 0) {
    const termStart = l.reelected >= 0 ? l.reelected : l.rose;
    if (g.turn - termStart >= gov.term) {
      if (l.reelected < 0 && civ.discontent < 2 && g.chance(0.5)) {
        l.reelected = g.turn;
        l.deeds.push('Re-elected');
        l.deathAge = Math.max(l.deathAge, age + gov.term + 1);
        logHistory(g, 'leader', 1, [civ.id], `${l.title} ${l.name} wins a second term.`);
        return null;
      }
      endReign(g, civ, 'term', 'election');
    }
  }
  return null;
}
