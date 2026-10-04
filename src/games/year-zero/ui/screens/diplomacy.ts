import { GOV, TRAIT } from '../../data/society';
import { civPopulation } from '../../sim/cities';
import {
  STATUS_LABEL, addMemory, applyProposal, cancelTreaty, declareWar, evaluateProposal, opinionParts, powerOf, relationStatus,
  tradeIncome, warBetween, warScore, type Proposal, type TreatyKind,
} from '../../sim/diplomacy';
import type { Game } from '../../sim/game';
import { chooseEpithet, currentLeader } from '../../sim/leaders';
import { h } from '../dom';
import { openModal } from '../modal';

let selected = -1;
let response: { civ: number; text: string; ok: boolean } | null = null;
let confirmWar = -1;
const asked = new Map<string, number>();

export function openDiplomacy(root: HTMLElement, g: Game, onChange: () => void, focusCiv = -1): void {
  const p = g.player;
  const known = g.s.civs.filter((c) => c.id !== p.id && g.knows(p.id, c.id));
  if (focusCiv >= 0) selected = focusCiv;
  if (!known.some((c) => c.id === selected)) selected = known.find((c) => c.alive)?.id ?? known[0]?.id ?? -1;
  response = null;
  confirmWar = -1;
  openModal(root, {
    title: 'Diplomacy',
    gicon: 'n-diplomacy',
    render: (body, _t, handle) => {
      if (!known.length) {
        body.append(h('p', { class: 'yz-quote' }, 'As far as the ' + p.name + ' know, they are alone in the world. Send explorers to find other peoples.'));
        return;
      }
      const list = h('div', { class: 'yz-civlist' });
      for (const c of [...known].sort((a, b) => Number(b.alive) - Number(a.alive))) {
        const st = c.alive ? relationStatus(g, p.id, c.id) : null;
        list.append(h('button', {
          class: `yz-civrow${c.id === selected ? ' on' : ''}`,
          onclick: () => { selected = c.id; response = null; confirmWar = -1; handle.rerender(); },
        }, h('span', { class: 'yz-dot', style: { background: c.color } }),
        h('div', null, h('div', { class: 'n' }, c.name + (c.alive ? '' : ' †')), h('div', { class: `s ${st === 'war' ? 'c-war' : ''}` }, st ? STATUS_LABEL[st] : `Fell in Year ${c.collapsed}`))));
      }
      const detail = h('div');
      const civ = g.civ(selected);
      if (civ) renderDetail(detail, g, civ.id, () => { onChange(); handle.rerender(); });
      body.append(h('div', { class: 'yz-diplo' }, list, detail));
    },
  });
}

function renderDetail(el: HTMLElement, g: Game, id: number, refresh: () => void): void {
  const p = g.player;
  const civ = g.civ(id);
  const l = currentLeader(g, civ);
  el.append(h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
    h('span', { class: 'yz-emblem', style: { background: civ.color, width: '34px', height: '34px' } }),
    h('div', null,
      h('div', { class: 'yz-h', style: { fontSize: '22px' } }, `The ${civ.name}`),
      h('div', { class: 'yz-sub' }, civ.alive
        ? `${l ? `${l.title} ${l.name} ${chooseEpithet(l, g.turn)}` : ''} · ${GOV[civ.government].name} · ${civ.eraPath[civ.eraPath.length - 1]?.name}`
        : `Their civilization ended in Year ${civ.collapsed}.`))));
  if (!civ.alive) {
    el.append(h('p', { class: 'yz-quote' }, `The ${civ.name} live on only in ruins, records and memory. Their path: ${civ.eraPath.map((e) => e.name).join(' → ')}.`));
    return;
  }
  const chips = h('div', { class: 'yz-chips', style: { margin: '10px 0' } });
  for (const t of civ.identity) chips.append(h('span', { class: 'yz-chip gold', title: TRAIT[t].effect }, TRAIT[t].label));
  if (civ.religionId >= 0) chips.append(h('span', { class: 'yz-chip' }, cap(g.s.religions[civ.religionId].name)));
  chips.append(h('span', { class: 'yz-chip' }, `${g.citiesOf(civ.id).length} cities · ${civPopulation(g, civ).toLocaleString('en-US')} people`));
  const ratio = powerOf(g, civ.id) / powerOf(g, p.id);
  chips.append(h('span', { class: `yz-chip${ratio > 1.3 ? ' war' : ratio < 0.75 ? ' good' : ''}` }, ratio > 1.3 ? 'Militarily stronger' : ratio < 0.75 ? 'Militarily weaker' : 'Comparable strength'));
  el.append(chips);

  const theirRel = civ.relations[p.id];
  const ourRel = p.relations[civ.id];
  const st = relationStatus(g, p.id, civ.id);
  const op = theirRel?.opinion ?? 0;
  el.append(h('div', { class: 'yz-section' },
    h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', { class: 'yz-label' }, 'Their view of us'), h('b', { class: st === 'war' ? 'c-war' : '' }, STATUS_LABEL[st])),
    h('div', { class: 'yz-opinion' }, h('i', { style: { left: `${50 + op / 2}%` } })),
    reasonsList(opinionParts(g, civ.id, p.id))));

  const pacts = h('div', { class: 'yz-chips' });
  if (ourRel.trade >= 0) pacts.append(h('span', { class: 'yz-chip good' }, `Trading since Year ${ourRel.trade} (+${tradeIncome(g, p.id, civ.id)} gold/yr)`));
  if (ourRel.openBorders >= 0) pacts.append(h('span', { class: 'yz-chip good' }, 'Open borders'));
  if (ourRel.alliance >= 0) pacts.append(h('span', { class: 'yz-chip good' }, `Allied since Year ${ourRel.alliance}`));
  if (ourRel.peaceUntil > g.turn) pacts.append(h('span', { class: 'yz-chip' }, `Peace treaty until Year ${ourRel.peaceUntil}`));
  if (civ.vassalOf === p.id) pacts.append(h('span', { class: 'yz-chip gold' }, 'Our vassal'));
  if (p.vassalOf === civ.id) pacts.append(h('span', { class: 'yz-chip war' }, 'Our overlord'));
  const war = warBetween(g, p.id, civ.id);
  if (war) {
    const score = warScore(war, p.id);
    pacts.append(h('span', { class: 'yz-chip war' }, `${cap(war.name)} · since Year ${war.start} · ${score > 15 ? 'winning' : score < -15 ? 'losing' : 'stalemate'} (${score > 0 ? '+' : ''}${score})`));
  }
  if (pacts.childNodes.length) el.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '6px' } }, 'Agreements'), pacts));

  // Actions
  const actions = h('div', { class: 'yz-actions' });
  const propose = (key: string, label: string, prop: Proposal, title?: string) => {
    const last = asked.get(`${civ.id}:${key}`);
    const wait = last !== undefined && g.turn - last < 5;
    actions.append(h('button', {
      class: 'yz-btn small', disabled: wait, title: wait ? 'They will not hear the same request again so soon.' : title,
      onclick: () => {
        const v = evaluateProposal(g, civ.id, p.id, prop);
        if (v.accept) applyProposal(g, p.id, civ.id, prop);
        else asked.set(`${civ.id}:${key}`, g.turn);
        response = { civ: civ.id, text: v.reason, ok: v.accept };
        refresh();
      },
    }, label));
  };
  const cancel = (kind: TreatyKind, label: string) => actions.append(h('button', {
    class: 'yz-btn small',
    onclick: () => {
      cancelTreaty(g, p.id, civ.id, kind);
      addMemory(g, civ.id, p.id, 'cancelled', -8, 0.2, 0, 'You tore up our agreement {ago}.');
      response = { civ: civ.id, text: 'So be it.', ok: false };
      refresh();
    },
  }, label));

  if (war) {
    propose('peace', 'Offer peace', { kind: 'peace', terms: 'white' });
    const gold = Math.min(p.gold, 50 + p.eraTier * 30);
    if (gold >= 20) propose('peace-pay', `Peace for ${gold} gold`, { kind: 'peace', terms: 'wePay', gold });
    const theirCities = g.citiesOf(civ.id).filter((c) => c.id !== civ.capitalId).sort((a, b) => a.size - b.size);
    if (theirCities.length) propose('peace-city', `Demand ${theirCities[0].name}`, { kind: 'peace', terms: 'theyCede', cityId: theirCities[0].id });
    propose('peace-gold', `Demand ${Math.min(civ.gold, 60 + civ.eraTier * 25)} gold`, { kind: 'peace', terms: 'theyPay', gold: Math.min(civ.gold, 60 + civ.eraTier * 25) });
    if (warScore(war, p.id) > 40) propose('peace-vassal', 'Demand submission', { kind: 'peace', terms: 'theyVassal' });
  } else {
    if (ourRel.trade < 0) {
      if (p.techs.writing === undefined) actions.append(h('button', { class: 'yz-btn small', disabled: true, title: 'Requires Writing' }, 'Propose trade'));
      else propose('trade', 'Propose trade', { kind: 'trade' });
    }
    else cancel('trade', 'End trade');
    if (ourRel.openBorders < 0) propose('borders', 'Open borders', { kind: 'openBorders' });
    else cancel('openBorders', 'Close borders');
    if (ourRel.alliance < 0) propose('alliance', 'Propose alliance', { kind: 'alliance' });
    else cancel('alliance', 'End alliance');
    for (const amt of [25, 100]) {
      if (p.gold >= amt) {
        actions.append(h('button', {
          class: 'yz-btn small',
          onclick: () => {
            applyProposal(g, p.id, civ.id, { kind: 'gift', gold: amt });
            response = { civ: civ.id, text: 'A generous gift. We will remember it.', ok: true };
            refresh();
          },
        }, `Gift ${amt} gold`));
      }
    }
    if (civ.gold >= 30) propose('demand', `Demand ${Math.round(Math.min(civ.gold * 0.4, 50 + p.eraTier * 30))} gold`, { kind: 'demand', gold: Math.round(Math.min(civ.gold * 0.4, 50 + p.eraTier * 30)) });
    for (const e of g.enemiesOf(p.id)) {
      if (e !== civ.id && g.civ(e).alive && !g.atWar(civ.id, e) && g.knows(civ.id, e)) propose(`join-${e}`, `Ask to join war on the ${g.civ(e).name}`, { kind: 'joinWar', against: e });
    }
    const betrayal = ourRel.peaceUntil > g.turn || ourRel.alliance >= 0;
    actions.append(h('button', {
      class: 'yz-btn small danger',
      onclick: () => {
        if (confirmWar !== civ.id) {
          confirmWar = civ.id;
          refresh();
          return;
        }
        confirmWar = -1;
        declareWar(g, p.id, civ.id, 'ambition');
        response = { civ: civ.id, text: betrayal ? 'Traitors! We will never forget this.' : 'Then let it be war.', ok: false };
        refresh();
      },
    }, confirmWar === civ.id ? (betrayal ? 'Confirm — break our word and attack' : 'Confirm: declare war') : 'Declare war'));
  }
  el.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '8px' } }, war ? 'Negotiate' : 'Propose'), actions));
  if (response && response.civ === civ.id) {
    el.append(h('div', { class: 'yz-quote', style: { borderLeftColor: response.ok ? 'var(--yz-good)' : 'var(--yz-bad)' } }, `${l ? l.name : `The ${civ.name}`}: “${response.text}”`));
  }
}

function reasonsList(parts: { label: string; value: number }[]): HTMLElement {
  if (!parts.length) return h('p', { class: 'yz-muted', style: { margin: '6px 0 0' } }, 'They have no strong feelings about us — yet.');
  return h('ul', { class: 'yz-reasons' }, [...parts].sort((a, b) => a.value - b.value).map((r) =>
    h('li', null, h('span', null, r.label), h('span', { class: `yz-num ${r.value >= 0 ? 'c-good' : 'c-bad'}` }, r.value > 0 ? `+${r.value}` : String(r.value)))));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
