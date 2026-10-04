import { GOV, GOVERNMENTS, LEADER_TRAITS, TRAIT, TRAITS } from '../../data/society';
import { civPopulation } from '../../sim/cities';
import { availableGovernments, changeGovernment, civTotals } from '../../sim/civs';
import type { Game } from '../../sim/game';
import { chooseEpithet, currentLeader, leaderHas } from '../../sim/leaders';
import { LEGACIES } from '../../sim/legacies';
import { fmt, h } from '../dom';
import { openModal } from '../modal';

export function openCiv(root: HTMLElement, g: Game, onChange: () => void, tab = 'Overview'): void {
  openModal(root, {
    title: `The ${g.player.name}`,
    icon: 'crown',
    tabs: ['Overview', 'Government', 'Identity', 'Legacies'],
    tab,
    render: (body, t, handle) => {
      if (t === 'Overview') overview(body, g);
      else if (t === 'Government') government(body, g, () => { onChange(); handle.rerender(); });
      else if (t === 'Identity') identity(body, g);
      else legacies(body, g);
    },
  });
}

function overview(body: HTMLElement, g: Game): void {
  const civ = g.player;
  const l = currentLeader(g, civ);
  const tot = civTotals(g, civ);
  const cities = g.citiesOf(civ.id);
  const era = civ.eraPath[civ.eraPath.length - 1];
  if (l) {
    body.append(h('div', { class: 'yz-card alive', style: { marginBottom: '14px' } },
      h('div', { class: 'yz-label' }, 'Leader'),
      h('div', { class: 'yz-h', style: { fontSize: '22px' } }, `${l.title} ${l.name} ${chooseEpithet(l, g.turn)}`),
      h('div', { class: 'yz-sub' }, `Born Year ${l.born} (age ${g.turn - l.born}) · ruling since Year ${l.rose}${civ.dynasty && GOV[civ.government].term === 0 ? ` · House ${civ.dynasty}` : ''}`),
      h('div', { class: 'yz-chips', style: { marginTop: '8px' } }, l.traits.map((t) => h('span', { class: 'yz-chip gold', title: LEADER_TRAITS[t].desc }, `${LEADER_TRAITS[t].name}: ${LEADER_TRAITS[t].desc}`)))));
  }
  const kv = h('dl', { class: 'yz-kv' });
  const add = (k: string, v: string) => kv.append(h('dt', null, k), h('dd', null, v));
  add('Era', era?.name ?? 'Tribal Age');
  add('Government', `${GOV[civ.government].name}${civ.anarchy ? ` (anarchy: ${civ.anarchy} yrs)` : ''}`);
  add('Faith', civ.religionId >= 0 ? cap(g.s.religions[civ.religionId].name) : 'None yet');
  add('Population', civPopulation(g, civ).toLocaleString('en-US'));
  add('Cities', String(cities.length));
  add('Treasury', `${Math.floor(civ.gold)} gold (${tot.net >= 0 ? '+' : ''}${tot.net}/yr)`);
  add('Income', `cities ${tot.gold}, trade ${tot.trade}${tot.tribute ? `, tribute ${tot.tribute}` : ''}, upkeep −${tot.upkeep}`);
  add('Science', `+${tot.sci}/yr`);
  add('Culture', `${fmt(civ.culture)} (+${tot.cult}/yr)`);
  add('War weariness', civ.warWeariness < 1 ? 'None' : civ.warWeariness < 15 ? 'Some' : 'Severe');
  if (civ.eraTier >= 7) add('Cohesion', `${Math.round(civ.cohesion)}/100`);
  if (civ.purpose) add('Purpose', { stars: 'Reach for the stars', arts: 'Beauty and meaning', earth: 'Heal the world', machines: 'Merge with the machines' }[civ.purpose] ?? civ.purpose);
  if (civ.pollution > 1) add('Pollution', `${Math.round(civ.pollution)} (world ${Math.round(g.s.globalPollution)})`);
  body.append(kv);
  if (civ.religionId >= 0) {
    const r = g.s.religions[civ.religionId];
    body.append(h('div', { class: 'yz-quote' }, `${cap(r.name)} teaches that ${r.tenet}.`));
  }
  const s = civ.stats;
  body.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '6px' } }, 'Record'),
    h('div', { class: 'yz-chips' },
      [
        `${s.citiesFounded} cities founded`, `${s.citiesCaptured} taken`, `${s.citiesLost} lost`, `${s.warsFought} wars`, `${s.warsWon} won`,
        `${s.famines} famines`, `${s.plagues} plagues`, `${s.disasters} disasters`, `${s.wondersBuilt} wonders`, `${s.ruinsExplored} ruins explored`,
        `${s.casualties.toLocaleString('en-US')} fallen in battle`,
      ].map((x) => h('span', { class: 'yz-chip' }, x)))));
}

function government(body: HTMLElement, g: Game, changed: () => void): void {
  const civ = g.player;
  const avail = new Set(availableGovernments(civ));
  const reformer = leaderHas(g, civ, 'reformer');
  body.append(h('p', { class: 'yz-muted', style: { marginTop: 0 } },
    `Changing government brings a few years of anarchy${reformer ? ' — but our reforming leader can make it painless' : ''}. New rulers usually follow a new order.`));
  const cards = h('div', { class: 'yz-cards' });
  for (const gv of GOVERNMENTS) {
    const current = civ.government === gv.id;
    const ok = avail.has(gv.id);
    cards.append(h('div', { class: `yz-card${current ? ' alive' : ''}`, style: ok ? undefined : { opacity: '0.5' } },
      h('div', { class: 'yz-h' }, gv.name),
      h('div', { class: 'yz-sub' }, current ? `Since Year ${civ.govSince}` : ok ? `Anarchy: ${reformer ? 0 : gv.anarchy} yrs` : `Requires ${gv.tech}`),
      h('ul', null, gv.pros.map((p) => h('li', { class: 'c-good' }, p)), gv.cons.map((c) => h('li', { class: 'c-bad' }, c))),
      ok && !current ? h('button', {
        class: 'yz-btn small', style: { marginTop: '8px' }, disabled: civ.anarchy > 0,
        onclick: () => {
          changeGovernment(g, civ, gv.id, 'reform');
          changed();
        },
      }, `Adopt ${gv.name}`) : null));
  }
  body.append(cards);
}

function identity(body: HTMLElement, g: Game): void {
  const civ = g.player;
  body.append(h('p', { class: 'yz-muted', style: { marginTop: 0 } },
    `Who the ${civ.name} are is not chosen — it grows from what happens to them. Traits above 40 become part of their identity and shape their bonuses, their rulers, and how others see them.`));
  body.append(h('div', { class: 'yz-label', style: { margin: '8px 0' } }, 'Path through history'));
  const path = h('div', { class: 'yz-era-path' });
  civ.eraPath.forEach((e, i) => {
    if (i) path.append(h('span', { class: 'arrow' }, '→'));
    path.append(h('span', { class: `e${i === civ.eraPath.length - 1 ? ' now' : ''}`, title: `Year ${e.turn}` }, e.name));
  });
  body.append(path);
  if (civ.identity.length) {
    body.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '8px' } }, 'Identity'),
      h('div', { class: 'yz-cards' }, civ.identity.map((t) => h('div', { class: 'yz-card alive' }, h('div', { class: 'yz-h' }, TRAIT[t].label), h('div', { class: 'yz-sub' }, TRAIT[t].effect))))));
  }
  const bars = h('div', { class: 'yz-traits' });
  for (const t of [...TRAITS].sort((a, b) => civ.traits[b.id] - civ.traits[a.id])) {
    const v = Math.round(civ.traits[t.id]);
    bars.append(h('div', { class: `yz-trait${civ.identity.includes(t.id) ? ' held' : ''}`, title: t.effect },
      h('span', null, t.label), h('div', { class: 'yz-bar' }, h('i', { style: { width: `${v}%` } })), h('span', { class: 'yz-num yz-muted' }, String(v))));
  }
  body.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '8px' } }, 'Character'), bars));
}

function legacies(body: HTMLElement, g: Game): void {
  const civ = g.player;
  body.append(h('p', { class: 'yz-muted', style: { marginTop: 0 } }, 'Legacies are how a people is remembered. None of them ends the game — history simply goes on.'));
  const cards = h('div', { class: 'yz-cards' });
  for (const L of LEGACIES) {
    const got = civ.legacies[L.id];
    const p = got !== undefined ? 1 : L.progress(g, civ);
    cards.append(h('div', { class: `yz-card${got !== undefined ? ' alive' : ''}` },
      h('div', { class: 'yz-label' }, L.path),
      h('div', { class: 'yz-h' }, L.name),
      h('div', { class: 'yz-sub' }, L.desc),
      h('div', { class: 'yz-progress c-gold' }, h('i', { style: { width: `${Math.round(p * 100)}%` } })),
      h('div', { class: 'yz-sub' }, got !== undefined ? `Earned in Year ${got}` : `${Math.round(p * 100)}%`)));
  }
  body.append(cards);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
