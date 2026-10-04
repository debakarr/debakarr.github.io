import { faithName, mutateLanguage, peopleName, plagueName } from '../core/names';
import { BUILDING } from '../data/buildings';
import { GOV, type TraitId } from '../data/society';
import { F, Imp, Relief } from '../data/terrain';
import { TECH } from '../data/techs';
import { UNIT } from '../data/units';
import {
  bestUnitOfClass, causeText, destroyCity, findCity, isCoastal, realPopulation, transferCity,
} from './cities';
import { changeGovernment, createCiv, learnTech } from './civs';
import {
  addMemory, applyProposal, declareWar, describeProposal, joinWar, meet, type Proposal,
} from './diplomacy';
import type { Game } from './game';
import { logHistory } from './history';
import { shiftTrait, traitW } from './identity';
import { createLeader, currentLeader, endReign, leaderHas } from './leaders';
import type { City, Civ, Decision, Ruin } from './state';
import { createUnit } from './units';

// Events grow out of the world's actual state: droughts hit dry farmland,
// plagues ride trade routes, revolutions follow long discontent.

export interface EventOption {
  label: string;
  desc: string;
  disabled?: string;
  apply: () => void;
  /** AI preference weight. */
  ai: number;
}

export interface EventView {
  title: string;
  text: string;
  options: EventOption[];
  tone: 'disaster' | 'crisis' | 'discovery' | 'diplomacy' | 'war' | 'wonder';
}

type Builder = (g: Game, civ: Civ, p: Record<string, any>) => EventView | null;

function addMod(civ: Civ, kind: string, until: number, value: number, label: string, cityId?: number): void {
  civ.modifiers.push({ kind, until, value, label, cityId });
}

function cityOf(g: Game, id: unknown): City | undefined {
  return typeof id === 'number' ? g.city(id) : undefined;
}

function tradePartners(g: Game, civ: Civ): number[] {
  return Object.keys(civ.relations).map(Number).filter((k) => civ.relations[k].trade >= 0 && g.civ(k).alive);
}

// --- Decision builders ------------------------------------------------------------------

const BUILDERS: Record<string, Builder> = {
  drought(g, civ, p) {
    const cities = (p.cityIds as number[]).map((id) => g.city(id)).filter((c): c is City => !!c && c.civId === civ.id);
    if (!cities.length) return null;
    const names = cities.map((c) => c.name).join(', ');
    const severity = civ.techs.irrigation !== undefined ? 0.3 : 0.45;
    const dur = p.duration as number;
    const hit = (sev: number) => {
      for (const c of cities) {
        const s = c.buildings.includes('granary') ? sev * 0.6 : sev;
        addMod(civ, 'drought', g.turn + dur, s, 'Drought', c.id);
        c.lastHit = { cause: 'drought', turn: g.turn };
      }
    };
    const partners = tradePartners(g, civ);
    const cost = 12 * cities.length + 4 * civ.eraTier;
    return {
      title: 'Drought',
      tone: 'disaster',
      text: `The rains have failed. The fields around ${names} are cracking under a merciless sun, and the granaries will not last.`,
      options: [
        { label: 'Ration the grain', desc: 'Halve the harm, but the people grow restless (-1 mood).', ai: 1 + traitW(civ, 'collectivist') * 3,
          apply: () => { hit(severity * 0.5); for (const c of cities) addMod(civ, 'mood', g.turn + dur, -1, 'Rationing', c.id); shiftTrait(civ, 'collectivist', 2); } },
        { label: `Buy grain abroad (${cost} gold)`, desc: 'Trade partners keep the cities fed.', ai: civ.gold >= cost ? 1 + traitW(civ, 'mercantile') * 4 : 0,
          disabled: !partners.length ? 'Requires a trade partner.' : civ.gold < cost ? 'Not enough gold.' : undefined,
          apply: () => { civ.gold -= cost; hit(severity * 0.15); shiftTrait(civ, 'mercantile', 2); } },
        { label: 'Pray for rain', desc: 'The faithful find comfort. The fields do not.', ai: 0.5 + traitW(civ, 'religious') * 3,
          apply: () => { hit(severity); shiftTrait(civ, 'religious', 3); civ.culture += 10; } },
        { label: 'Endure', desc: 'Accept the losses.', ai: 0.6, apply: () => hit(severity) },
      ],
    };
  },

  plague(g, civ, p) {
    const city = cityOf(g, p.cityId);
    if (!city || city.civId !== civ.id) return null;
    const name = p.name as string;
    const dur = p.duration as number;
    const start = () => {
      addMod(civ, 'plague', g.turn + dur, 1, `${name}`, city.id);
      city.lastHit = { cause: 'plague', turn: g.turn };
      civ.stats.plagues++;
    };
    return {
      title: 'Plague',
      tone: 'disaster',
      text: `${name.charAt(0).toUpperCase() + name.slice(1)} has appeared in ${city.name}. The sick fill the streets, and travelers carry it onward.`,
      options: [
        { label: 'Quarantine the city', desc: 'Stop the spread. Trade income halts for a time; the city suffers (-1 mood).', ai: 1 + traitW(civ, 'collectivist') * 2 + traitW(civ, 'scientific') * 2,
          apply: () => { start(); addMod(civ, 'quarantine', g.turn + dur, 1, 'Quarantine'); addMod(civ, 'mood', g.turn + dur, -1, 'Quarantine', city.id); } },
        { label: 'Pray for deliverance', desc: 'Faith deepens. The plague runs its course.', ai: 0.5 + traitW(civ, 'religious') * 4,
          apply: () => { start(); shiftTrait(civ, 'religious', 3); addMod(civ, 'mood', g.turn + dur, 1, 'Vigils', city.id); addMod(civ, 'spread', g.turn + dur, 1, 'Plague spreading'); } },
        { label: 'Carry on', desc: 'Life and trade continue. So may the plague.', ai: 0.6 + traitW(civ, 'mercantile') * 2,
          apply: () => { start(); addMod(civ, 'spread', g.turn + dur, 1, 'Plague spreading'); } },
      ],
    };
  },

  refugees(g, civ, p) {
    const from = g.civ(p.from as number);
    const city = findCity(g, civ.id, g.capital(from)?.tile ?? civ.startTile);
    if (!city) return null;
    return {
      title: 'Refugees',
      tone: 'diplomacy',
      text: `Thousands of ${from.adj} refugees, fleeing ${p.reason as string}, gather at the borders near ${city.name}, begging to be let in.`,
      options: [
        { label: 'Open the gates', desc: `+1 population in ${city.name}, briefly unsettled. The ${from.name} will remember.`, ai: 1 + traitW(civ, 'collectivist') + traitW(civ, 'religious'),
          apply: () => {
            city.size++;
            addMod(civ, 'mood', g.turn + 8, -1, 'Newcomers', city.id);
            addMemory(g, from.id, civ.id, 'refugees', 20, 0.15, 5, 'You sheltered our people {ago}.');
            logHistory(g, 'migration', civ.isPlayer ? 2 : 1, [civ.id, from.id], `The ${civ.name} take in ${from.adj} refugees at ${city.name}.`, city.tile);
          } },
        { label: 'Turn them away', desc: 'Our people first.', ai: 0.6 + traitW(civ, 'isolationist') * 3,
          apply: () => {
            addMemory(g, from.id, civ.id, 'refused_refugees', -10, 0.2, 0, 'You turned our people away {ago}.');
            shiftTrait(civ, 'isolationist', 2);
          } },
      ],
    };
  },

  revolution(g, civ) {
    const gov = GOV[civ.government];
    const liberal = ['democracy', 'federation', 'republic'].find((id) => civ.techs[GOV[id].tech!] !== undefined && civ.government !== id);
    const hasArmy = g.unitsOf(civ.id).filter((u) => UNIT[u.type].str >= 8 && UNIT[u.type].cls !== 'recon').length >= 2;
    const options: EventOption[] = [];
    if (liberal) {
      options.push({ label: `Concede: proclaim ${GOV[liberal].name}`, desc: 'The old order falls. A new one begins.', ai: 1 + traitW(civ, 'individualist') * 3,
        apply: () => { changeGovernment(g, civ, liberal, 'revolution'); civ.discontent = 0; addMod(civ, 'mood', g.turn + 10, 1, 'New hope'); } });
    }
    options.push({ label: 'Crush the uprising', desc: hasArmy ? 'Order by force: -2 mood for a decade, but the regime survives.' : 'We lack the soldiers.',
      disabled: hasArmy ? undefined : 'Requires an army.', ai: hasArmy ? 0.8 + traitW(civ, 'militaristic') * 3 : 0,
      apply: () => {
        addMod(civ, 'mood', g.turn + 10, -2, 'Martial law');
        civ.discontent = 0;
        shiftTrait(civ, 'militaristic', 3);
        shiftTrait(civ, 'collectivist', 2);
        logHistory(g, 'revolt', 3, [civ.id], `The ${civ.name} crush an uprising against the ${gov.name}. Blood stains the streets of ${g.capital(civ)?.name ?? 'the capital'}.`);
        if (civ.techs.nationalism !== undefined && civ.government !== 'dictatorship' && g.chance(0.4)) changeGovernment(g, civ, 'dictatorship', 'coup');
      } });
    options.push({ label: 'The ruler steps down', desc: 'A new leader may calm the streets.', ai: 1,
      apply: () => {
        endReign(g, civ, 'deposed', 'revolution');
        civ.discontent *= 0.3;
        addMod(civ, 'mood', g.turn + 8, 1, 'A fresh start');
      } });
    return {
      title: 'Revolution',
      tone: 'crisis',
      text: `Years of discontent have boiled over. Crowds fill the squares of ${g.capital(civ)?.name ?? 'the capital'}, demanding an end to the ${gov.name}.`,
      options,
    };
  },

  crash(g, civ) {
    const cap = g.capital(civ);
    return {
      title: 'Market Crash',
      tone: 'crisis',
      text: `Panic on the exchanges of ${cap?.name ?? 'the capital'}. Fortunes vanish overnight; workshops close; the unemployed fill the streets.`,
      options: [
        { label: 'Bail out the banks', desc: 'Spend a third of the treasury to soften the blow.', ai: 1 + traitW(civ, 'collectivist') * 3,
          apply: () => { civ.gold = Math.round(civ.gold * 0.67); addMod(civ, 'crash', g.turn + 6, 20, 'Recession'); shiftTrait(civ, 'collectivist', 3); } },
        { label: 'Let the market correct', desc: 'A deep, painful recession (-50% gold, -1 mood).', ai: 1 + traitW(civ, 'individualist') * 3,
          apply: () => { addMod(civ, 'crash', g.turn + 10, 50, 'Depression'); addMod(civ, 'mood', g.turn + 6, -1, 'Depression'); shiftTrait(civ, 'individualist', 3); } },
      ],
    };
  },

  movement(g, civ, p) {
    const movement = p.name as string;
    const old = civ.religionId >= 0 ? g.s.religions[civ.religionId]?.name : 'the old ways';
    const cities = g.citiesOf(civ.id);
    // Religious strife, whatever the outcome, wearies people of religion in politics.
    const strife = () => shiftTrait(civ, 'secular', 2.5);
    return {
      title: 'A New Faith',
      tone: 'crisis',
      text: `A preacher's words spread from city to city: ${movement} challenges ${old}. The faithful are divided.`,
      options: [
        { label: 'Embrace the new faith', desc: 'It becomes the faith of the nation. Old believers riot (-2 mood in two cities).', ai: 0.7 + traitW(civ, 'religious') * 2,
          apply: () => {
            strife();
            const rel = { id: g.s.religions.length, name: movement, founder: civ.id, founded: g.turn, tenet: 'the old gods were false' };
            g.s.religions.push(rel);
            civ.religionId = rel.id;
            civ.culture += 30;
            for (const c of g.rng.shuffle([...cities]).slice(0, 2)) addMod(civ, 'mood', g.turn + 8, -2, 'Religious riots', c.id);
            shiftTrait(civ, 'religious', 4);
            logHistory(g, 'faith', civ.isPlayer ? 3 : 2, [civ.id], `${movement.charAt(0).toUpperCase() + movement.slice(1)} sweeps through the ${civ.adj} lands and becomes the faith of the nation.`);
          } },
        { label: 'Tolerate it', desc: 'Let people believe as they will. (+culture)', ai: 1 + traitW(civ, 'secular') * 3 + traitW(civ, 'individualist'),
          apply: () => {
            strife();
            civ.culture += 15;
            shiftTrait(civ, 'secular', 3);
            logHistory(g, 'faith', 1, [civ.id], `The ${civ.name} tolerate a new faith, ${movement}.`);
          } },
        { label: 'Suppress it', desc: 'Persecution: -1 mood everywhere for 8 years.', ai: 0.5 + traitW(civ, 'religious') * 2 + traitW(civ, 'collectivist'),
          apply: () => {
            strife();
            addMod(civ, 'mood', g.turn + 8, -1, 'Persecution');
            shiftTrait(civ, 'collectivist', 2);
            logHistory(g, 'faith', civ.isPlayer ? 2 : 1, [civ.id], `The ${civ.name} persecute the followers of ${movement}.`);
          } },
      ],
    };
  },

  breakthrough(g, civ) {
    const tech = civ.research ? TECH[civ.research].name : 'the sciences';
    const known = Object.keys(civ.relations).map(Number).filter((k) => g.civ(k).alive);
    return {
      title: 'Breakthrough',
      tone: 'discovery',
      text: `Scholars in ${g.capital(civ)?.name ?? 'the capital'} report a breakthrough in ${tech}.`,
      options: [
        { label: 'Publish it to the world', desc: '+25% science for 5 years. Every people we know will be grateful.', ai: 1 + traitW(civ, 'individualist') * 2,
          apply: () => {
            addMod(civ, 'breakthrough', g.turn + 5, 25, 'Breakthrough');
            for (const k of known) addMemory(g, k, civ.id, 'shared_science', 15, 0.15, 0, 'You shared your discoveries with us {ago}.');
            shiftTrait(civ, 'scientific', 2);
          } },
        { label: 'Keep it secret', desc: '+50% science for 5 years.', ai: 1 + traitW(civ, 'isolationist') * 2,
          apply: () => { addMod(civ, 'breakthrough', g.turn + 5, 50, 'Secret research'); shiftTrait(civ, 'scientific', 2); } },
      ],
    };
  },

  crisis(g, civ) {
    const options: EventOption[] = [
      { label: 'Support the elder heir', desc: 'A patient, careful ruler.', ai: 1 + traitW(civ, 'defensive') * 2,
        apply: () => { createLeader(g, civ, 'crisis-elder'); civ.anarchy = Math.max(civ.anarchy, 1); } },
      { label: 'Support the general', desc: 'A soldier on the throne.', ai: 1 + traitW(civ, 'militaristic') * 3,
        apply: () => { createLeader(g, civ, 'crisis-general'); shiftTrait(civ, 'militaristic', 2); civ.anarchy = Math.max(civ.anarchy, 1); } },
    ];
    if (civ.techs.civilcode !== undefined) {
      options.push({ label: 'Summon a council of citizens', desc: 'End the monarchy: proclaim a Republic.', ai: 0.5 + traitW(civ, 'individualist') * 3,
        apply: () => { changeGovernment(g, civ, 'republic', 'revolution'); } });
    }
    return {
      title: 'Succession Crisis',
      tone: 'crisis',
      text: 'The ruler is dead, and no heir is clear. Two claimants gather supporters; the court is split.',
      options,
    };
  },

  ruin(g, civ, p) {
    const ruin = g.s.ruins[p.ruinId as number];
    if (!ruin) return null;
    const age = g.turn - ruin.fell;
    const knowledge = ruin.knowledge && civ.techs[ruin.knowledge] === undefined ? TECH[ruin.knowledge] : null;
    const gold = 25 + civ.eraTier * 15 + ((ruin.id * 7) % 20);
    const record = [
      `THE CITY OF ${ruin.name.toUpperCase()}`,
      `Civilization: ${ruin.prehistoric ? `the ${ruin.civName} (forgotten)` : `the ${ruin.civName}`}`,
      ruin.prehistoric ? `Estimated age: ${Math.round((g.turn - ruin.founded) / 50) * 50} years` : `Founded: Year ${ruin.founded}`,
      `Population at peak: ${ruin.peakPop.toLocaleString('en-US')}`,
      `Abandoned: ${ruin.prehistoric ? `about ${Math.round(age / 50) * 50} years ago` : `Year ${ruin.fell}`}`,
      `Cause of collapse: ${ruin.cause}`,
      ruin.legend,
    ].join('\n');
    return {
      title: 'Ruins Discovered',
      tone: 'discovery',
      text: record,
      options: [
        { label: knowledge ? `Study the inscriptions` : 'Study the ruins',
          desc: knowledge ? `Recover the lost knowledge of ${knowledge.name}.` : '+science and culture.',
          ai: 1 + traitW(civ, 'scientific') * 3,
          apply: () => {
            if (knowledge && knowledge.tier <= civ.eraTier + 1) learnTech(g, civ, knowledge.id, 'ruins');
            else civ.sciStore += 25 + civ.eraTier * 20;
            civ.culture += 10;
            shiftTrait(civ, 'scientific', 2);
          } },
        { label: 'Excavate the treasures', desc: `+${gold} gold and the artifacts (${ruin.artifacts.join(', ')}) for our collection.`,
          ai: 1 + traitW(civ, 'mercantile') * 2 + traitW(civ, 'artistic'),
          apply: () => {
            civ.gold += gold;
            civ.artifacts.push(...ruin.artifacts);
            shiftTrait(civ, 'artistic', 1);
            logHistory(g, 'artifact', 1, [civ.id], `The ${civ.name} unearth ${ruin.artifacts[0]}.`, ruin.tile);
          } },
        { label: 'Preserve them as a sacred site', desc: '+25 culture and +1 mood for a decade.',
          ai: 1 + traitW(civ, 'religious') * 2 + traitW(civ, 'ecological') * 2,
          apply: () => {
            civ.culture += 25;
            addMod(civ, 'mood', g.turn + 10, 1, `Pilgrims to ${ruin.name}`);
            shiftTrait(civ, 'religious', 1);
            shiftTrait(civ, 'ecological', 1);
          } },
      ],
    };
  },

  conquest(g, civ, p) {
    const city = cityOf(g, p.cityId);
    if (!city || city.civId !== civ.id) return null;
    const prev = g.civ(p.from as number);
    const founder = g.civ(city.founderId);
    const options: EventOption[] = [
      { label: 'Annex the city', desc: 'It becomes ours. It will resist for a while.', ai: 1, apply: () => undefined },
    ];
    const isOriginalCapital = g.s.civs.some((c) => c.originalCapitalTile === city.tile);
    options.push({ label: 'Raze it to the ground', desc: 'Leave only ruins. The world will remember.',
      disabled: isOriginalCapital ? 'An original capital cannot be razed.' : undefined, ai: 0.1,
      apply: () => {
        destroyCity(g, city, causeText('razed', civ.name), civ.id);
        civ.stats.citiesRazed++;
        addMemory(g, prev.id, civ.id, 'razed_city', -50, 0.15, -20, `You burned ${city.name} to the ground {ago}.`);
        for (const c of g.aliveCivs()) {
          if (c.id !== civ.id && c.id !== prev.id && g.knows(c.id, civ.id)) addMemory(g, c.id, civ.id, 'atrocity', -10, 0.1, 0, `You razed ${city.name} {ago}.`, 3);
        }
        shiftTrait(civ, 'militaristic', 3);
      } });
    if (founder.alive && founder.id !== prev.id && founder.id !== civ.id) {
      options.push({ label: `Liberate it: return it to the ${founder.name}`, desc: `The ${founder.name} will never forget this.`, ai: 0.3,
        apply: () => {
          transferCity(g, city, founder.id, 'liberated');
          addMemory(g, founder.id, civ.id, 'liberated', 60, 0.1, 25, `You liberated ${city.name} {ago}.`);
        } });
    }
    return {
      title: `${city.name} Has Fallen`,
      tone: 'war',
      text: `Our soldiers hold ${city.name}, once a city of the ${prev.name}${founder.id !== prev.id ? ` (founded by the ${founder.name})` : ''}. ${realPopulation(city, civ).toLocaleString('en-US')} people await our decision.`,
      options,
    };
  },

  ally_call(g, civ, p) {
    const ally = g.civ(p.ally as number);
    const enemy = g.civ(p.enemy as number);
    const war = g.s.wars.find((w) => w.id === p.war);
    if (!war || war.end >= 0 || !ally.alive || !enemy.alive) return null;
    return {
      title: 'An Ally Calls',
      tone: 'war',
      text: `The ${enemy.name} have attacked our allies, the ${ally.name}. Their envoys remind us of our oath.`,
      options: [
        { label: 'Honor the alliance: go to war', desc: `War with the ${enemy.name}.`, ai: 1, apply: () => joinWar(g, civ.id, war, war.attackers.includes(ally.id) ? 'attackers' : 'defenders') },
        { label: 'Stay out of it', desc: `The ${ally.name} will feel abandoned. The alliance ends.`, ai: 0.5,
          apply: () => {
            addMemory(g, ally.id, civ.id, 'abandoned_ally', -45, 0.15, -15, 'You abandoned us in our hour of need {ago}.');
            const r1 = civ.relations[ally.id];
            const r2 = ally.relations[civ.id];
            if (r1) r1.alliance = -1;
            if (r2) r2.alliance = -1;
            logHistory(g, 'treaty', 2, [civ.id, ally.id], `The ${civ.name} refuse to honor their alliance with the ${ally.name}.`);
          } },
      ],
    };
  },

  diplo_offer(g, civ, p) {
    const from = g.civ(p.from as number);
    const prop = p.proposal as Proposal;
    if (!from.alive) return null;
    const what = describeProposal(g, from.id, civ.id, prop);
    const leader = currentLeader(g, from);
    const who = leader ? `${leader.title} ${leader.name} of the ${from.name}` : `The ${from.name}`;
    const demand = prop.kind === 'demand';
    const text = demand
      ? `${who} demands ${what}. "Pay, and we part as friends. Refuse, and remember that we asked."`
      : prop.kind === 'peace'
        ? `${who} sues for ${what}.`
        : `${who} proposes ${what}.`;
    const canAfford = !demand || civ.gold >= prop.gold;
    return {
      title: demand ? 'A Demand' : prop.kind === 'peace' ? 'Peace Offer' : 'A Proposal',
      tone: 'diplomacy',
      text,
      options: [
        { label: demand ? `Pay ${prop.gold} gold` : 'Accept', desc: '', ai: 1, disabled: canAfford ? undefined : 'Not enough gold.',
          apply: () => applyProposal(g, from.id, civ.id, prop) },
        { label: demand ? 'Refuse' : 'Decline', desc: demand ? 'They will remember this.' : '', ai: 1,
          apply: () => {
            if (demand) {
              addMemory(g, from.id, civ.id, 'refused_demand', -15, 0.25, 0, 'You refused our demands {ago}.');
              from.ai.grudges[civ.id] = g.turn;
            } else addMemory(g, from.id, civ.id, 'rebuffed', -4, 0.3, 0, 'You rejected our offer {ago}.', 2);
          } },
      ],
    };
  },

  purpose(g, civ) {
    const set = (purpose: string, trait: TraitId, label: string) => () => {
      civ.purpose = purpose;
      shiftTrait(civ, trait, 6);
      logHistory(g, 'purpose', 3, [civ.id], `Freed from want, the ${civ.name} choose a new purpose: ${label}.`);
    };
    return {
      title: 'After Scarcity',
      tone: 'wonder',
      text: `For the first time in history, no one among the ${civ.name} goes hungry, and no one must work to live. The old struggle is over. What will the ${civ.name} become, now that survival is no longer the question?`,
      options: [
        { label: 'Reach for the stars', desc: '+15% science. Our future lies beyond this world.', ai: 1, apply: set('stars', 'scientific', 'to reach for the stars') },
        { label: 'Cultivate beauty and meaning', desc: '+25% culture.', ai: 1, apply: set('arts', 'artistic', 'to cultivate beauty and meaning') },
        { label: 'Heal the world', desc: 'Pollution falls away; disasters soften.', ai: 1, apply: set('earth', 'ecological', 'to heal the world they nearly broke') },
        { label: 'Merge with the machines', desc: '+15% production. The line between citizen and machine blurs.', ai: 1, apply: set('machines', 'collectivist', 'to merge with their machines') },
      ],
    };
  },

  ai_question(g, civ) {
    return {
      title: 'The Machines Can Govern',
      tone: 'crisis',
      text: `Our artificial minds now model the economy, the climate and the people better than any council ever could. Some say it is time to let them govern. Others say a people that hands away its choices is no longer a people.`,
      options: [
        { label: 'Grant them governance', desc: 'Adopt AI Governance. Cohesion will suffer.', ai: 0.5 + traitW(civ, 'scientific') * 2 + traitW(civ, 'collectivist'),
          apply: () => { changeGovernment(g, civ, 'aigov', 'reform'); civ.cohesion -= 10; } },
        { label: 'Keep human hands on the wheel', desc: 'The machines advise; people decide. (+cohesion)', ai: 1 + traitW(civ, 'individualist') * 2,
          apply: () => { civ.cohesion += 6; shiftTrait(civ, 'individualist', 2); } },
      ],
    };
  },

  synthetic_rights(g, civ) {
    return {
      title: 'Synthetic Citizens',
      tone: 'crisis',
      text: 'The synthetic beings our labs created now think, feel and ask for the same rights as the born. Their question divides every household.',
      options: [
        { label: 'Grant them full citizenship', desc: '+cohesion, +1 mood for a decade.', ai: 1 + traitW(civ, 'individualist') * 2,
          apply: () => { civ.cohesion += 8; addMod(civ, 'mood', g.turn + 10, 1, 'A wider family'); shiftTrait(civ, 'individualist', 3);
            logHistory(g, 'society', 3, [civ.id], `The ${civ.name} grant citizenship to synthetic people.`); } },
        { label: 'Deny them', desc: 'They remain property. Cohesion suffers.', ai: 0.7 + traitW(civ, 'collectivist') * 2,
          apply: () => { civ.cohesion -= 10; shiftTrait(civ, 'collectivist', 2);
            logHistory(g, 'society', 2, [civ.id], `The ${civ.name} refuse rights to synthetic people.`); } },
      ],
    };
  },

  inequality(g, civ) {
    return {
      title: 'The Divided City',
      tone: 'crisis',
      text: 'The abundance is real, but it is not shared. Towers of glass rise beside streets of the forgotten, and the forgotten have begun to march.',
      options: [
        { label: 'Redistribute', desc: 'Spend a quarter of the treasury. +cohesion.', ai: 1 + traitW(civ, 'collectivist') * 3,
          apply: () => { civ.gold = Math.round(civ.gold * 0.75); civ.cohesion += 7; shiftTrait(civ, 'collectivist', 3); } },
        { label: 'Hold firm', desc: 'Prosperity will trickle down. -cohesion, -1 mood for 8 years.', ai: 1 + traitW(civ, 'individualist') * 3,
          apply: () => { civ.cohesion -= 7; addMod(civ, 'mood', g.turn + 8, -1, 'Protests'); shiftTrait(civ, 'individualist', 2); } },
      ],
    };
  },

  identity_crisis(g, civ) {
    return {
      title: 'Who Are We Now?',
      tone: 'crisis',
      text: `The ${civ.name} have everything their ancestors dreamed of, and many no longer know what it is for. Old songs are forgotten; new ones have not yet been written.`,
      options: [
        { label: 'Return to tradition', desc: 'Revive the old faith and the old stories. +cohesion.', ai: 1 + traitW(civ, 'religious') * 2,
          apply: () => { civ.cohesion += 10; shiftTrait(civ, 'religious', 3); shiftTrait(civ, 'artistic', 2); } },
        { label: 'Embrace the new', desc: 'Let the future define us. +science for a decade.', ai: 1 + traitW(civ, 'scientific') * 2,
          apply: () => { civ.cohesion += 4; addMod(civ, 'breakthrough', g.turn + 10, 15, 'New thinking'); shiftTrait(civ, 'scientific', 3); } },
        { label: 'Let each find their own way', desc: 'Freedom, at the cost of unity.', ai: 1 + traitW(civ, 'individualist') * 2,
          apply: () => { civ.cohesion -= 4; shiftTrait(civ, 'individualist', 4); } },
      ],
    };
  },

  eco_crisis(g, civ) {
    const cities = g.citiesOf(civ.id);
    return {
      title: 'The Changing Climate',
      tone: 'disaster',
      text: 'Storms grow fiercer each year. Rivers flood, then run dry. The smoke of a thousand factories has come home.',
      options: [
        { label: 'A great green transition', desc: 'Spend a fifth of the treasury. Pollution falls by half.', ai: 1 + traitW(civ, 'ecological') * 3,
          apply: () => { civ.gold = Math.round(civ.gold * 0.8); civ.pollution *= 0.5; shiftTrait(civ, 'ecological', 6);
            logHistory(g, 'society', 2, [civ.id], `The ${civ.name} begin a great green transition.`); } },
        { label: 'Adapt and endure', desc: 'Droughts strike two cities.', ai: 1 + traitW(civ, 'individualist'),
          apply: () => { for (const c of g.rng.shuffle([...cities]).slice(0, 2)) addMod(civ, 'drought', g.turn + 8, 0.35, 'Climate drought', c.id); } },
      ],
    };
  },
};

// --- Public API ----------------------------------------------------------------------------

export function viewDecision(g: Game, d: Decision): EventView | null {
  const b = BUILDERS[d.event];
  if (!b) return null;
  return b(g, g.civ(d.civId), d.params as Record<string, any>);
}

export function resolveDecision(g: Game, id: number, option: number): void {
  const k = g.s.decisions.findIndex((d) => d.id === id);
  if (k < 0) return;
  const d = g.s.decisions[k];
  g.s.decisions.splice(k, 1);
  const view = viewDecision(g, d);
  if (!view) return;
  const opt = view.options[option] ?? view.options[0];
  if (opt.disabled) {
    const fallback = view.options.find((o) => !o.disabled);
    fallback?.apply();
  } else opt.apply();
}

/** Raise an event: the player decides; AI civilizations decide by character. */
export function raise(g: Game, civ: Civ, event: string, params: Record<string, unknown> = {}): void {
  if (civ.isPlayer) {
    g.s.decisions.push({ id: g.nextId(), civId: civ.id, event, turn: g.turn, params });
    g.emit({ type: 'decision' });
    return;
  }
  const view = BUILDERS[event]?.(g, civ, params as Record<string, any>);
  if (!view) return;
  const pick = g.rng.weighted(view.options.filter((o) => !o.disabled).map((o) => [o, o.ai] as const));
  pick?.apply();
}

/** Resolve leftovers (the player ended the turn without choosing). */
export function autoResolve(g: Game, smart = false): void {
  for (const d of [...g.s.decisions]) {
    const view = viewDecision(g, d);
    if (!view) {
      g.s.decisions = g.s.decisions.filter((x) => x.id !== d.id);
      continue;
    }
    let idx = Math.max(0, view.options.findIndex((o) => !o.disabled));
    if (smart) {
      const pick = g.rng.weighted(view.options.map((o, i) => [i, o.disabled ? 0 : o.ai] as const));
      if (pick !== undefined) idx = pick;
    } else if (d.event === 'diplo_offer') idx = 1;
    resolveDecision(g, d.id, idx);
  }
}

export function aiResolveRuin(g: Game, civ: Civ, ruin: Ruin): void {
  raise(g, civ, 'ruin', { ruinId: ruin.id });
}

/** AI-to-player diplomacy goes through here so the player can answer. */
export function offerToPlayer(g: Game, from: Civ, proposal: Proposal): void {
  const exists = g.s.decisions.some((d) => d.event === 'diplo_offer' && d.params.from === from.id);
  if (exists) return;
  g.s.decisions.push({ id: g.nextId(), civId: g.s.playerId, event: 'diplo_offer', turn: g.turn, params: { from: from.id, proposal } });
  g.emit({ type: 'decision' });
}

// --- Random events (rolled each turn per civilization) ----------------------------------------

export function rollEvents(g: Game, civ: Civ): void {
  if (!civ.alive || g.turn < 8) return;
  const cities = g.citiesOf(civ.id);
  if (!cities.length) return;
  const rng = g.rng;
  const gp = g.s.globalPollution;
  const eco = civ.identity.includes('ecological') || civ.purpose === 'earth' ? 0.6 : 1;
  const pragmatic = leaderHas(g, civ, 'pragmatic') ? 0.7 : 1;
  const map = g.s.map;
  // Natural disasters need a breather between them.
  const calm = g.turn - (g.s.firsts[`disaster-${civ.id}`] ?? -99) >= 7;
  const struck = () => (g.s.firsts[`disaster-${civ.id}`] = g.turn);

  // Drought: dry farmland suffers most.
  if (calm && !civ.modifiers.some((m) => m.kind === 'drought')) {
    let dry = 0;
    let worked = 0;
    for (const c of cities) {
      for (const t of c.worked) {
        worked++;
        const ter = map.terrain[t];
        if ((ter === 4 || ter === 5) && map.river[t] === 0) dry++;
      }
    }
    const share = worked ? dry / worked : 0;
    const p = (0.002 + 0.012 * share) * (1 + gp / 80) * eco * pragmatic;
    if (rng.next() < p) {
      const center = rng.pick(cities);
      const hit = cities.filter((c) => g.grid.distance(c.tile, center.tile) <= 6).map((c) => c.id);
      const duration = rng.range(5, 9);
      struck();
      logHistory(g, 'drought', civ.isPlayer ? 2 : 1, [civ.id], `A severe drought grips the lands around ${center.name}.`, center.tile);
      civ.stats.disasters++;
      const l = currentLeader(g, civ);
      if (l) l.ach.disasters++;
      shiftTrait(civ, 'collectivist', 1.5);
      raise(g, civ, 'drought', { cityIds: hit, duration });
      return;
    }
  }

  // Plague: crowded cities, trade routes, and no clean water.
  if (calm && !civ.modifiers.some((m) => m.kind === 'plague')) {
    const partners = tradePartners(g, civ);
    const partnerSick = partners.some((k) => g.civ(k).modifiers.some((m) => m.kind === 'plague'));
    for (const c of cities) {
      let resist = 0;
      for (const b of c.buildings) resist += BUILDING[b]?.fx.plagueResist ?? 0;
      resist = Math.min(0.95, resist);
      let p = 0.00035 * c.size * (1 + partners.length * 0.25) * (1 - resist);
      if (civ.techs.medicine !== undefined) p *= 0.5;
      if (partnerSick) p += 0.006 * (1 - resist);
      if (rng.next() < p) {
        struck();
        const name = plagueName(rng);
        logHistory(g, 'plague', civ.isPlayer ? 3 : 2, [civ.id],
          `${name.charAt(0).toUpperCase() + name.slice(1)} breaks out in ${c.name}${partnerSick ? ', carried by merchants from abroad' : ''}.`, c.tile);
        civ.stats.disasters++;
        shiftTrait(civ, 'collectivist', 1);
        raise(g, civ, 'plague', { cityId: c.id, name, duration: rng.range(6, 10) });
        return;
      }
    }
  }

  // Floods on rivers.
  const riverCities = cities.filter((c) => map.river[c.tile] > 0);
  if (calm && riverCities.length && rng.next() < Math.min(0.012, 0.0011 * riverCities.length) * (1 + gp / 100) * eco) {
    const c = rng.pick(riverCities);
    struck();
    const river = g.s.rivers[map.riverId[c.tile]]?.name;
    civ.stats.disasters++;
    const l = currentLeader(g, civ);
    if (l) l.ach.disasters++;
    c.lastHit = { cause: 'flood', turn: g.turn };
    const great = c.size <= 2 && c.id !== civ.capitalId && rng.next() < 0.06;
    if (great) {
      logHistory(g, 'flood', 3, [civ.id], `The Great Flood: ${river ? `the River ${river}` : 'the river'} bursts its banks and changes course.`, c.tile);
      destroyCity(g, c, causeText('flood'));
      return;
    }
    if (c.size > 1) c.size--;
    for (const t of g.grid.within(c.tile, 1)) if (map.river[t] > 0 && t !== c.tile) map.improvement[t] = Imp.None;
    if (civ.techs.engineering === undefined && rng.next() < 0.3) {
      const victims = c.buildings.filter((b) => b !== 'walls');
      if (victims.length) c.buildings.splice(c.buildings.indexOf(rng.pick(victims)), 1);
    }
    logHistory(g, 'flood', civ.isPlayer ? 2 : 1, [civ.id], `${river ? `The River ${river}` : 'The river'} floods, drowning the fields of ${c.name}.`, c.tile);
    markDisplaced(civ, g, 'the floods');
    return;
  }

  // Earthquakes near mountains.
  const quakeCities = cities.filter((c) => g.grid.within(c.tile, 2).some((t) => map.relief[t] === Relief.Mountain));
  if (calm && quakeCities.length && rng.next() < Math.min(0.008, 0.0012 * quakeCities.length) * pragmatic) {
    const c = rng.pick(quakeCities);
    struck();
    civ.stats.disasters++;
    if (c.size > 1) c.size--;
    const victims = c.buildings.filter((b) => BUILDING[b]);
    let lost = '';
    if (victims.length && rng.next() < 0.6) {
      const b = rng.pick(victims);
      c.buildings.splice(c.buildings.indexOf(b), 1);
      const nm = BUILDING[b].name.toLowerCase();
      lost = ` The ${nm} ${nm.endsWith('s') ? 'collapse' : 'collapses'}.`;
    }
    c.lastHit = { cause: 'earthquake', turn: g.turn };
    logHistory(g, 'earthquake', civ.isPlayer ? 2 : 1, [civ.id], `An earthquake shakes ${c.name}.${lost}`, c.tile);
    return;
  }

  // Internal migration: crowded, unhappy cities send out settlers.
  if (civ.eraTier <= 4) {
    const crowded = cities.find((c) => c.size >= 7 && c.y.mood < 0);
    if (crowded && rng.next() < 0.015) {
      crowded.size--;
      createUnit(g, civ, 'settler', crowded.tile);
      logHistory(g, 'migration', civ.isPlayer ? 2 : 1, [civ.id], `A band of settlers leaves crowded ${crowded.name} in search of new lands.`, crowded.tile);
      return;
    }
  }

  // Refugees from neighbors in distress.
  for (const k in civ.relations) {
    const other = g.civ(Number(k));
    const rel = civ.relations[k];
    if (!other.alive || rel.war || other.id === civ.id) continue;
    const displaced = other.modifiers.find((m) => m.kind === 'displaced');
    if (displaced && rng.next() < 0.12) {
      raise(g, civ, 'refugees', { from: other.id, reason: displaced.label });
      other.modifiers = other.modifiers.filter((m) => m !== displaced);
      return;
    }
  }

  // Revolution after long discontent.
  const gov = GOV[civ.government];
  if (g.turn > 40 && civ.discontent > 2.2 && civ.anarchy === 0 && rng.next() < 0.04 * (civ.discontent - 2) * gov.revolt) {
    raise(g, civ, 'revolution');
    return;
  }

  // Secession: cities in long unrest break away.
  const restless = cities.filter((c) => c.unrest >= 8 && c.id !== civ.capitalId);
  if (restless.length && cities.length >= 3 && civ.discontent > 1 && rng.next() < 0.025 * restless.length) {
    secede(g, civ, restless);
    return;
  }

  // Assassination.
  const lead = currentLeader(g, civ);
  if (lead && g.turn > 30) {
    let p = 0.0009 * gov.revolt;
    if (civ.discontent > 1) p *= 2;
    if (lead.traits.includes('ruthless') || lead.traits.includes('cruel')) p *= 2;
    if (rng.next() < p) {
      civ.stats.revolutions++;
      endReign(g, civ, 'assassinated', 'death');
      return;
    }
  }

  // Market crash.
  if (civ.eraTier >= 5) {
    const exchanges = cities.filter((c) => c.buildings.includes('exchange') || c.buildings.includes('bank')).length;
    if (exchanges >= 2 && !civ.modifiers.some((m) => m.kind === 'crash') && rng.next() < 0.0012 * exchanges) {
      logHistory(g, 'crash', civ.isPlayer ? 3 : 2, [civ.id], `The ${civ.adj} economy crashes. Panic spreads from ${g.capital(civ)?.name ?? 'the capital'}.`);
      raise(g, civ, 'crash');
      return;
    }
  }

  // Religious movement.
  if (civ.religionId >= 0 && civ.eraTier >= 2 && !civ.identity.includes('secular')) {
    const p = 0.002 + 0.003 * traitW(civ, 'religious') + (civ.discontent > 1 ? 0.003 : 0);
    if (rng.next() < p) {
      raise(g, civ, 'movement', { name: faithName(civ.lang, rng) });
      return;
    }
  }

  // Scientific breakthrough.
  const scholars = cities.filter((c) => c.buildings.includes('library') || c.buildings.includes('university')).length;
  if (civ.research && rng.next() < 0.0015 + 0.004 * traitW(civ, 'scientific') + 0.0004 * scholars) {
    if (Object.keys(civ.relations).length) raise(g, civ, 'breakthrough');
    else addMod(civ, 'breakthrough', g.turn + 5, 40, 'Breakthrough');
    return;
  }

  // Golden age.
  const avgMood = cities.reduce((s, c) => s + c.y.mood, 0) / cities.length;
  const lastGolden = g.s.firsts[`golden-${civ.id}`] ?? -999;
  if (avgMood >= 3 && cities.length >= 3 && g.turn - lastGolden > 70 && rng.next() < 0.03) {
    g.s.firsts[`golden-${civ.id}`] = g.turn;
    addMod(civ, 'golden', g.turn + 10, 20, 'Golden Age');
    logHistory(g, 'golden', civ.isPlayer ? 3 : 2, [civ.id], `A golden age begins for the ${civ.name}.`);
    shiftTrait(civ, 'artistic', 3);
    return;
  }

  // Late-game: the problems of plenty.
  if (civ.eraTier >= 7) {
    if (civ.techs.synthbio !== undefined && !g.s.firsts[`synth-${civ.id}`] && rng.next() < 0.05) {
      g.s.firsts[`synth-${civ.id}`] = g.turn;
      raise(g, civ, 'synthetic_rights');
      return;
    }
    if (civ.techs.ai !== undefined && !g.s.firsts[`aiq-${civ.id}`] && civ.government !== 'aigov' && rng.next() < 0.06) {
      g.s.firsts[`aiq-${civ.id}`] = g.turn;
      raise(g, civ, 'ai_question');
      return;
    }
    if ((civ.identity.includes('mercantile') || civ.identity.includes('individualist')) && rng.next() < 0.004) {
      raise(g, civ, 'inequality');
      return;
    }
    if (civ.cohesion < 40 && rng.next() < 0.02) {
      raise(g, civ, 'identity_crisis');
      return;
    }
  }
  if (civ.eraTier >= 5 && gp > 60 && rng.next() < 0.004 * (gp / 60)) {
    raise(g, civ, 'eco_crisis');
  }
}

/** Volcanoes are world events: they hit whoever lives nearby. */
export function rollVolcanoes(g: Game): void {
  const map = g.s.map;
  for (let t = 0; t < map.feature.length; t++) {
    if (map.feature[t] !== F.Volcano) continue;
    const near = g.grid.within(t, 3).map((x) => g.cityAt(x)).filter((c): c is City => !!c);
    if (!near.length || g.rng.next() > 0.0025) continue;
    const name = map.wonder[t] >= 0 ? g.s.wonders[map.wonder[t]].name : 'the volcano';
    for (const x of g.grid.within(t, 2)) {
      if (map.improvement[x] !== Imp.None && g.rng.next() < 0.6) map.improvement[x] = Imp.None;
      if (x !== t && map.relief[x] !== Relief.Mountain && map.terrain[x] > 2 && map.feature[x] === F.None && g.rng.next() < 0.5) map.feature[x] = F.Ash;
    }
    const civs = new Set<number>();
    for (const c of near) {
      civs.add(c.civId);
      const civ = g.civ(c.civId);
      civ.stats.disasters++;
      c.lastHit = { cause: 'volcano', turn: g.turn };
      const d = g.grid.distance(t, c.tile);
      const loss = d <= 1 ? 3 : d === 2 ? 2 : 1;
      if (c.size <= loss && d <= 1 && c.id !== civ.capitalId) {
        destroyCity(g, c, causeText('volcano', name));
        continue;
      }
      c.size = Math.max(1, c.size - loss);
      markDisplaced(civ, g, `the eruption of ${name}`);
    }
    const names = near.map((c) => c.name).join(' and ');
    logHistory(g, 'volcano', 3, [...civs], `${name.charAt(0).toUpperCase() + name.slice(1)} erupts, raining fire and ash on ${names}. The ash will make the soil rich.`, t);
  }
}

function markDisplaced(civ: Civ, g: Game, reason: string): void {
  civ.modifiers.push({ kind: 'displaced', until: g.turn + 3, value: 1, label: reason });
}

/** Per-turn effects of active plagues. */
export function tickPlagues(g: Game, civ: Civ): void {
  const plagues = civ.modifiers.filter((m) => m.kind === 'plague');
  if (!plagues.length) return;
  const quarantine = civ.modifiers.some((m) => m.kind === 'quarantine');
  for (const m of plagues) {
    const city = m.cityId !== undefined ? g.city(m.cityId) : undefined;
    if (!city || city.civId !== civ.id) continue;
    if (city.size > 1 && g.rng.next() < 0.3) city.size--;
    else if (city.size === 1 && g.rng.next() < 0.03 && city.id !== civ.capitalId && g.citiesOf(civ.id).length > 1) {
      destroyCity(g, city, causeText('plague', m.label));
      continue;
    }
    if (!quarantine && g.rng.next() < 0.12) {
      const next = g.citiesOf(civ.id).find((c) => c.id !== city.id && g.grid.distance(c.tile, city.tile) <= 6 && !civ.modifiers.some((x) => x.kind === 'plague' && x.cityId === c.id));
      if (next) {
        civ.modifiers.push({ kind: 'plague', until: g.turn + g.rng.range(5, 8), value: 1, label: m.label, cityId: next.id });
        if (civ.isPlayer) g.notify(`${m.label.charAt(0).toUpperCase() + m.label.slice(1)} has spread to ${next.name}.`, 'bad', next.tile);
      }
    }
    if (g.rng.next() < 0.004) {
      const l = currentLeader(g, civ);
      if (l) endReign(g, civ, 'plague');
    }
  }
  // Famine: several cities starving at once becomes history.
  const starving = g.citiesOf(civ.id).filter((c) => c.starving >= 1 && c.lastHit?.turn === g.turn);
  if (starving.length >= 2) recordFamine(g, civ, starving);
}

export function recordFamine(g: Game, civ: Civ, cities: City[]): void {
  const last = g.s.firsts[`famine-${civ.id}`] ?? -999;
  if (g.turn - last < 25) return;
  g.s.firsts[`famine-${civ.id}`] = g.turn;
  civ.stats.famines++;
  const great = civ.stats.famines === 1 ? 'the Great Famine' : `the ${['Second', 'Third', 'Fourth', 'Fifth'][civ.stats.famines - 2] ?? 'Next'} Famine`;
  logHistory(g, 'famine', 3, [civ.id], `Hunger stalks ${cities.map((c) => c.name).join(', ')}: ${great} has begun.`, cities[0].tile);
  shiftTrait(civ, 'collectivist', 3);
  markDisplaced(civ, g, 'famine');
  const l = currentLeader(g, civ);
  if (l) l.ach.disasters++;
}

/** Cities in long unrest break away — joining a neighbor or forming a new nation. */
export function secede(g: Game, civ: Civ, restless: City[]): void {
  const group = restless.slice(0, 3);
  // A strong neighbor with high culture may absorb a lone city.
  if (group.length === 1) {
    const city = group[0];
    let best: Civ | undefined;
    let bestScore = 0;
    for (const other of g.aliveCivs()) {
      if (other.id === civ.id) continue;
      const near = g.citiesOf(other.id).some((c) => g.grid.distance(c.tile, city.tile) <= 7);
      if (!near) continue;
      const score = other.culture / Math.max(1, civ.culture);
      if (score > 1.3 && score > bestScore) {
        bestScore = score;
        best = other;
      }
    }
    if (best) {
      transferCity(g, city, best.id, 'revolt');
      city.unrest = 0;
      return;
    }
  }
  const capital = g.capital(civ);
  if (!capital) return;
  const lang = mutateLanguage(civ.lang, g.rng);
  const rebel = createCiv(g, { isPlayer: false, lang, name: peopleName(lang, g.rng), startTile: group[0].tile, parentId: civ.id });
  rebel.techs = { ...civ.techs };
  rebel.eraTier = civ.eraTier;
  rebel.eraPath = [{ tier: civ.eraTier, name: civ.eraPath[civ.eraPath.length - 1]?.name ?? 'Tribal Age', turn: g.turn }];
  rebel.religionId = civ.religionId;
  rebel.traits = { ...civ.traits };
  shiftTrait(rebel, 'individualist', 8);
  shiftTrait(rebel, 'defensive', 6);
  rebel.government = GOV.republic && civ.techs.civilcode !== undefined ? 'republic' : civ.government;
  rebel.explored.set(civ.explored);
  rebel.gold = 30;
  for (const c of group) {
    transferCity(g, c, rebel.id, 'revolt');
    c.unrest = 0;
    c.resistance = 0;
  }
  rebel.capitalId = group[0].id;
  rebel.originalCapitalTile = group[0].tile;
  createLeader(g, rebel, 'revolution');
  for (const c of group) {
    const def = bestUnitOfClass(g, rebel, 'infantry', isCoastal(g, c)) ?? UNIT.warband;
    createUnit(g, rebel, def.id, c.tile);
  }
  for (const k in civ.relations) {
    const other = Number(k);
    if (g.civ(other).alive && other !== rebel.id) meet(g, rebel.id, other);
  }
  meet(g, rebel.id, civ.id);
  const names = group.map((c) => c.name).join(' and ');
  logHistory(g, 'civil-war', 3, [civ.id, rebel.id],
    `Civil war! ${names} rise against the ${civ.name} and proclaim a free nation: the ${rebel.name}.`, group[0].tile);
  declareWar(g, rebel.id, civ.id, 'independence');
}
