import { GOV, TRAIT } from '../data/society';
import { civPopulation } from './cities';
import type { Game } from './game';
import { chooseEpithet } from './leaders';
import { LEGACIES } from './legacies';
import type { Civ, War } from './state';

// Turns the record into prose: the story of a people, told from what
// actually happened to them.

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

export function chronicle(g: Game, civ: Civ): string[] {
  const out: string[] = [];
  const events = g.s.history.filter((h) => h.civs.includes(civ.id));
  const origin = events.find((h) => h.kind === 'origin');
  const founding = events.find((h) => h.kind === 'founding');
  const now = civ.alive ? g.turn : civ.collapsed;
  const span = now - civ.founded;

  let p = origin ? origin.text : `The ${civ.name} emerged in Year ${civ.founded}.`;
  if (founding) p += ` In Year ${founding.turn}, ${lowerThe(founding.text)}`;
  out.push(p);

  const cities = g.citiesOf(civ.id);
  const pop = civPopulation(g, civ);
  if (civ.alive) {
    out.push(
      `In ${plural(span, 'year')} they founded ${plural(civ.stats.citiesFounded, 'city', 'cities')}` +
        (civ.stats.citiesCaptured ? `, took ${plural(civ.stats.citiesCaptured, 'more', 'more')} by conquest or treaty,` : '') +
        ` and today number ${pop.toLocaleString('en-US')} people in ${plural(cities.length, 'city', 'cities')}.` +
        (cities.length ? ` Their greatest city is ${[...cities].sort((a, b) => b.size - a.size)[0].name}.` : ''),
    );
  } else {
    out.push(`At their height they held ${plural(civ.stats.peakCities, 'city', 'cities')} and ${civ.stats.peakPop.toLocaleString('en-US')} people.`);
  }

  if (civ.eraPath.length > 1) out.push(`Their path through history: ${civ.eraPath.map((e) => e.name).join(' → ')}.`);

  const leaders = g.s.leaders.filter((l) => l.civId === civ.id);
  if (leaders.length) {
    const scored = leaders
      .map((l) => {
        const a = l.ach;
        const weight = a.conquered * 3 + a.citiesFounded * 2 + a.wonders * 3 + a.warsWon * 2 + a.treaties + a.reforms * 2 + a.techs * 0.4 + ((l.ended >= 0 ? l.ended : g.turn) - l.rose) / 10;
        return { l, weight };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 2)
      .sort((a, b) => a.l.rose - b.l.rose)
      .map(({ l }) => `${l.title} ${l.name} ${l.epithet || chooseEpithet(l, g.turn)} (Year ${l.rose}–${l.ended >= 0 ? `Year ${l.ended}` : 'today'})`);
    out.push(`${plural(leaders.length, 'ruler')} led them. History remembers ${list(scored)}.`);
  }

  const wars = g.s.wars.filter((w) => w.attackers.includes(civ.id) || w.defenders.includes(civ.id));
  if (wars.length) {
    const longest = [...wars].sort((a, b) => dur(g, b) - dur(g, a))[0];
    const enemy = (w: War) => {
      const side = w.attackers.includes(civ.id) ? w.defenders : w.attackers;
      return side.map((c) => `the ${g.civ(c).name}`);
    };
    out.push(
      `They fought ${plural(wars.length, 'war')}, winning ${civ.stats.warsWon} and losing ${civ.stats.warsLost}. ` +
        `The longest, ${longest.name}, set them against ${list(enemy(longest))} for ${plural(dur(g, longest), 'year')}. ` +
        (civ.stats.casualties ? `${civ.stats.casualties.toLocaleString('en-US')} of their people died in battle.` : ''),
    );
    const betrayals = civ.stats.betrayals;
    if (betrayals) out.push(`They broke their word ${plural(betrayals, 'time')}; others have not forgotten.`);
  } else {
    out.push('They have never known war.');
  }

  const hard: string[] = [];
  if (civ.stats.famines) hard.push(plural(civ.stats.famines, 'famine'));
  if (civ.stats.plagues) hard.push(plural(civ.stats.plagues, 'plague'));
  if (civ.stats.disasters) hard.push(plural(civ.stats.disasters, 'natural disaster'));
  if (civ.stats.revolutions) hard.push(plural(civ.stats.revolutions, 'revolution'));
  if (hard.length) out.push(`They survived ${list(hard)}.`);

  const firsts = events.filter((h) => /first/i.test(h.text) && ['tech', 'crossing', 'space', 'era'].includes(h.kind) && h.imp >= 2);
  if (firsts.length) {
    out.push(`Among their achievements: ${firsts.slice(0, 5).map((h) => `in Year ${h.turn}, ${lowerThe(h.text).replace(/\.$/, '')}`).join('; ')}.`);
  }

  if (civ.stats.ruinsExplored) {
    const ruin = g.s.ruins.find((r) => r.exploredBy.includes(civ.id) && r.civName !== civ.name);
    out.push(`They walked among the ruins of ${plural(civ.stats.ruinsExplored, 'vanished city', 'vanished cities')}${ruin ? `, among them ${ruin.name}, built by the ${ruin.civName}` : ''}.`);
  }

  if (civ.alive) {
    const ident = civ.identity.map((t) => TRAIT[t].label.toLowerCase());
    const faith = civ.religionId >= 0 ? `, and most follow ${g.s.religions[civ.religionId].name}` : '';
    out.push(`Today the ${civ.name} live under ${GOV[civ.government].name}${ident.length ? `. They are ${list(ident)}` : ''}${faith}.`);
  } else {
    const end = events.filter((h) => h.kind === 'collapse').pop();
    out.push(end ? end.text : `Their story ended in Year ${civ.collapsed}.`);
  }

  const legacies = LEGACIES.filter((L) => civ.legacies[L.id] !== undefined).map((L) => L.name);
  if (legacies.length) out.push(`They will be remembered for ${list(legacies)}.`);
  return out;
}

function lowerThe(text: string): string {
  return text.replace(/^(The|For|A|An|From|In|After|Among)\b/, (w) => w.toLowerCase());
}

function dur(g: Game, w: War): number {
  return Math.max(1, (w.end >= 0 ? w.end : g.turn) - w.start);
}
