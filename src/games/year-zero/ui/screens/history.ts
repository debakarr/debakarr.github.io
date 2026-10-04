import { GOV, LEADER_TRAITS } from '../../data/society';
import { TECH } from '../../data/techs';
import { chronicle } from '../../sim/chronicle';
import { realPopulation } from '../../sim/cities';
import type { Game } from '../../sim/game';
import { knownTo } from '../../sim/history';
import { chooseEpithet } from '../../sim/leaders';
import type { HistoryEvent } from '../../sim/state';
import { download, h } from '../dom';
import { openModal } from '../modal';

const TABS = ['Chronicle', 'Timeline', 'Leaders', 'Wars', 'Cities', 'Discoveries', 'Charts'];

export interface HistoryState {
  scope: 'ours' | 'known';
  major: boolean;
  chart: number;
}

const state: HistoryState = { scope: 'ours', major: false, chart: 0 };

export function openHistory(root: HTMLElement, g: Game, jump: (tile: number) => void, tab = 'Chronicle'): void {
  openModal(root, {
    title: 'History',
    gicon: 'n-history',
    tabs: TABS,
    tab,
    render: (body, t, handle) => {
      switch (t) {
        case 'Chronicle': return renderChronicle(body, g);
        case 'Timeline': return renderTimeline(body, g, jump, () => handle.rerender());
        case 'Leaders': return renderLeaders(body, g);
        case 'Wars': return renderWars(body, g);
        case 'Cities': return renderCities(body, g, jump);
        case 'Discoveries': return renderDiscoveries(body, g);
        case 'Charts': return renderCharts(body, g, () => handle.rerender());
      }
    },
    foot: (foot) => {
      foot.append(h('button', {
        class: 'yz-btn',
        onclick: () => {
          const p = g.player;
          const lines = [`THE CHRONICLE OF THE ${p.name.toUpperCase()}`, `Year Zero — Year ${g.turn}`, '', ...chronicle(g, p), '', 'TIMELINE', ''];
          for (const ev of g.s.history.filter((e) => e.civs.includes(p.id) && e.imp >= 2)) lines.push(`Year ${ev.turn}: ${ev.text}`);
          download(`chronicle-of-the-${p.name.toLowerCase()}.txt`, lines.join('\n'), 'text/plain');
        },
      }, 'Export chronicle (.txt)'));
    },
  });
}

function renderChronicle(body: HTMLElement, g: Game): void {
  const p = g.player;
  body.append(h('div', { class: 'yz-label', style: { marginBottom: '8px' } }, `The chronicle of the ${p.name} · Year ${g.turn}`));
  const box = h('div', { class: 'yz-chronicle' });
  for (const para of chronicle(g, p)) box.append(h('p', null, para));
  body.append(box);
  // Other peoples we know, briefly.
  const others = g.s.civs.filter((c) => c.id !== p.id && g.knows(p.id, c.id));
  if (others.length) {
    body.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '8px' } }, 'Other peoples'),
      h('div', { class: 'yz-cards' }, others.map((c) => h('div', { class: 'yz-card' },
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('span', { class: 'yz-dot', style: { background: c.color } }), h('div', { class: 'yz-h' }, c.name)),
        h('div', { class: 'yz-sub' }, c.alive ? `${c.eraPath[c.eraPath.length - 1]?.name} · ${GOV[c.government].name}` : `Fell in Year ${c.collapsed}`),
          h('div', { style: { fontSize: '12.5px', marginTop: '6px' } }, c.eraPath.map((e) => e.name).join(' → ')))))));
  }
}

function eventRow(ev: HistoryEvent, jump: (tile: number) => void): HTMLElement {
  return h('div', {
    class: `yz-tl-row imp${ev.imp}${ev.tile >= 0 ? ' link' : ''}`,
    title: ev.tile >= 0 ? 'Show on map' : undefined,
    onclick: () => ev.tile >= 0 && jump(ev.tile),
  }, h('div', { class: 'yz-tl-year' }, `Year ${ev.turn}`), h('div', { class: 't' }, ev.text));
}

function renderTimeline(body: HTMLElement, g: Game, jump: (tile: number) => void, rerender: () => void): void {
  const p = g.player;
  body.append(h('div', { class: 'yz-filter' },
    h('button', { class: `yz-btn small${state.scope === 'ours' ? ' active' : ''}`, onclick: () => { state.scope = 'ours'; rerender(); } }, `The ${p.name}`),
    h('button', { class: `yz-btn small${state.scope === 'known' ? ' active' : ''}`, onclick: () => { state.scope = 'known'; rerender(); } }, 'The known world'),
    h('button', { class: `yz-btn small${state.major ? ' active' : ''}`, onclick: () => { state.major = !state.major; rerender(); } }, 'Major events only')));
  const events = g.s.history.filter((ev) => {
    if (state.major && ev.imp < 3) return false;
    if (state.scope === 'ours') return ev.civs.includes(p.id) && ev.imp >= 2;
    return knownTo(g, ev, p.id) && ev.imp >= 1;
  });
  if (!events.length) {
    body.append(h('p', { class: 'yz-muted' }, 'History has not yet been written.'));
    return;
  }
  const list = h('div', { class: 'yz-timeline' });
  // Newest first reads best during play; cap DOM size for very long games.
  const shown = events.slice(-600).reverse();
  for (const ev of shown) list.append(eventRow(ev, jump));
  body.append(list);
  if (events.length > shown.length) body.append(h('p', { class: 'yz-muted' }, `…and ${events.length - shown.length} earlier entries (see the exported chronicle).`));
}

function renderLeaders(body: HTMLElement, g: Game): void {
  const p = g.player;
  const leaders = g.s.leaders.filter((l) => l.civId === p.id).reverse();
  const cards = h('div', { class: 'yz-cards' });
  for (const l of leaders) {
    const alive = l.ended < 0;
    const epithet = l.epithet || chooseEpithet(l, g.turn);
    const a = l.ach;
    const ach: string[] = [];
    if (a.citiesFounded) ach.push(`Founded ${a.citiesFounded} cit${a.citiesFounded > 1 ? 'ies' : 'y'}`);
    if (a.conquered) ach.push(`Conquered ${a.conquered} cit${a.conquered > 1 ? 'ies' : 'y'}`);
    if (a.wonders) ach.push(`Built ${a.wonders} wonder${a.wonders > 1 ? 's' : ''}`);
    if (a.warsWon) ach.push(`Won ${a.warsWon} war${a.warsWon > 1 ? 's' : ''}`);
    if (a.warsLost) ach.push(`Lost ${a.warsLost} war${a.warsLost > 1 ? 's' : ''}`);
    if (a.treaties) ach.push(`Signed ${a.treaties} treat${a.treaties > 1 ? 'ies' : 'y'}`);
    if (a.techs) ach.push(`${a.techs} discover${a.techs === 1 ? 'y' : 'ies'}`);
    if (a.disasters) ach.push(`Endured ${a.disasters} disaster${a.disasters > 1 ? 's' : ''}`);
    const deeds = l.deeds.filter((d) => !d.startsWith('Founded') && !d.startsWith('Signed')).slice(-5);
    cards.append(h('div', { class: `yz-card${alive ? ' alive' : ''}` },
      h('div', { class: 'yz-label' }, alive ? 'Ruling now' : l.endCause === 'assassinated' ? 'Assassinated' : l.endCause === 'deposed' ? 'Deposed' : ''),
      h('div', { class: 'yz-h' }, `${l.name} ${epithet}`),
      h('div', { class: 'yz-sub' }, `${l.title} · ${GOV[l.gov]?.name ?? ''}`),
      h('dl', { class: 'yz-kv', style: { marginTop: '6px' } },
        h('dt', null, 'Born'), h('dd', null, `Year ${l.born}`),
        h('dt', null, 'Reigned'), h('dd', null, `Year ${l.rose} – ${alive ? 'now' : `Year ${l.ended}`}`),
        !alive && l.endCause === 'died' ? [h('dt', null, 'Died'), h('dd', null, `Year ${l.ended}, aged ${l.ended - l.born}`)] : null),
      h('div', { class: 'yz-chips', style: { marginTop: '6px' } }, l.traits.map((t) => h('span', { class: 'yz-chip', title: LEADER_TRAITS[t].desc }, LEADER_TRAITS[t].name))),
      ach.length || deeds.length ? h('ul', null, [...ach, ...deeds].map((x) => h('li', null, x))) : null));
  }
  body.append(cards);
}

function renderWars(body: HTMLElement, g: Game): void {
  const p = g.player;
  const wars = g.s.wars.filter((w) => [...w.attackers, ...w.defenders].some((c) => g.knows(p.id, c))).reverse();
  if (!wars.length) {
    body.append(h('p', { class: 'yz-muted' }, 'No wars are recorded. Long may it last.'));
    return;
  }
  const cards = h('div', { class: 'yz-cards' });
  for (const w of wars) {
    const ours = [...w.attackers, ...w.defenders].includes(p.id);
    const names = (ids: number[]) => ids.map((c) => g.civ(c).name).join(', ');
    let dead = 0;
    for (const k in w.casualties) dead += w.casualties[k];
    cards.append(h('div', { class: `yz-card${w.end < 0 ? ' alive' : ''}`, style: ours ? { borderColor: 'rgba(224,83,63,.5)' } : undefined },
      h('div', { class: 'yz-label' }, w.end < 0 ? 'Ongoing' : `Year ${w.start} – ${w.end}`),
      h('div', { class: 'yz-h' }, w.name.charAt(0).toUpperCase() + w.name.slice(1)),
      h('div', { class: 'yz-sub' }, `${names(w.attackers)} vs ${names(w.defenders)}`),
      h('dl', { class: 'yz-kv', style: { marginTop: '6px' } },
        h('dt', null, 'Began'), h('dd', null, `Year ${w.start}`),
        h('dt', null, 'Battles'), h('dd', null, String(w.battles)),
        h('dt', null, 'Casualties'), h('dd', null, dead.toLocaleString('en-US')),
        h('dt', null, 'Cities taken'), h('dd', null, String(w.captures.length))),
      w.captures.length ? h('ul', null, w.captures.slice(0, 6).map((c) => h('li', null, `Year ${c.turn}: ${c.city} taken by the ${g.civ(c.to).name}`))) : null,
      w.outcome ? h('div', { class: 'yz-quote' }, w.outcome) : null));
  }
  body.append(cards);
}

function renderCities(body: HTMLElement, g: Game, jump: (tile: number) => void): void {
  const p = g.player;
  const mine = g.citiesOf(p.id).sort((a, b) => b.size - a.size);
  const cards = h('div', { class: 'yz-cards' });
  for (const c of mine) {
    cards.append(h('div', { class: 'yz-card alive', style: { cursor: 'pointer' }, onclick: () => jump(c.tile) },
      h('div', { class: 'yz-h' }, `${p.capitalId === c.id ? '★ ' : ''}${c.name}`),
      h('div', { class: 'yz-sub' }, `${realPopulation(c, p).toLocaleString('en-US')} people · size ${c.size}`),
      h('dl', { class: 'yz-kv', style: { marginTop: '6px' } },
        h('dt', null, 'Founded'), h('dd', null, `Year ${c.founded}${c.founderId !== p.id ? ` by the ${g.civ(c.founderId).name}` : ''}`),
        h('dt', null, 'Peak size'), h('dd', null, String(c.peakSize)),
        h('dt', null, 'Buildings'), h('dd', null, String(c.buildings.length + c.wonders.length)))));
  }
  body.append(h('div', { class: 'yz-label', style: { marginBottom: '8px' } }, 'Our cities'), cards);
  const ruins = g.s.ruins.filter((r) => r.exploredBy.includes(p.id));
  if (ruins.length) {
    const rc = h('div', { class: 'yz-cards' });
    for (const r of ruins) {
      rc.append(h('div', { class: 'yz-card', style: { cursor: 'pointer', background: 'linear-gradient(180deg, rgba(42,36,24,.6), rgba(34,29,20,.4))' }, onclick: () => jump(r.tile) },
        h('div', { class: 'yz-label' }, r.prehistoric ? 'Forgotten city' : 'Lost city'),
        h('div', { class: 'yz-h' }, `The city of ${r.name}`),
        h('dl', { class: 'yz-kv', style: { marginTop: '6px' } },
          h('dt', null, 'Civilization'), h('dd', null, r.prehistoric ? `${r.civName} (forgotten)` : r.civName),
          h('dt', null, r.prehistoric ? 'Estimated age' : 'Founded'), h('dd', null, r.prehistoric ? `${Math.round((g.turn - r.founded) / 50) * 50} years` : `Year ${r.founded}`),
          h('dt', null, 'Peak population'), h('dd', null, r.peakPop.toLocaleString('en-US')),
          h('dt', null, 'Status'), h('dd', null, 'Abandoned')),
        h('div', { class: 'yz-quote' }, r.cause)));
    }
    body.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '8px' } }, 'Ruins we have found'), rc));
  }
}

function renderDiscoveries(body: HTMLElement, g: Game): void {
  const p = g.player;
  const techs = Object.entries(p.techs).sort((a, b) => a[1] - b[1]);
  body.append(h('div', { class: 'yz-label', style: { marginBottom: '8px' } }, `${techs.length} discoveries`));
  const list = h('div', { class: 'yz-timeline' });
  for (const [id, turn] of techs) {
    const firstWorld = !g.s.civs.some((c) => c !== p && c.techs[id] !== undefined && c.techs[id] < turn);
    list.append(h('div', { class: 'yz-tl-row' }, h('div', { class: 'yz-tl-year' }, `Year ${turn}`),
      h('div', { class: 't' }, `${nameOf(id)}${firstWorld ? ' — first in the world' : ''}`)));
  }
  body.append(list);
  const govs = g.s.history.filter((e) => e.civs.includes(p.id) && e.kind === 'government');
  body.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '8px' } }, 'Governments'),
    h('div', { class: 'yz-timeline' },
      h('div', { class: 'yz-tl-row' }, h('div', { class: 'yz-tl-year' }, 'Year 0'), h('div', { class: 't' }, 'Tribal Council')),
      govs.map((e) => h('div', { class: 'yz-tl-row' }, h('div', { class: 'yz-tl-year' }, `Year ${e.turn}`), h('div', { class: 't' }, e.text))))));
  const wonders = g.s.wonders.filter((w) => w.discoveredBy.includes(p.id));
  if (wonders.length) {
    body.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '8px' } }, 'Natural wonders seen'),
      h('div', { class: 'yz-chips' }, wonders.map((w) => h('span', { class: 'yz-chip gold', title: w.desc }, w.name.charAt(0).toUpperCase() + w.name.slice(1))))));
  }
  if (p.artifacts.length) {
    body.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '8px' } }, 'Our collection of artifacts'),
      h('div', { class: 'yz-chips' }, p.artifacts.map((a) => h('span', { class: 'yz-chip' }, a.charAt(0).toUpperCase() + a.slice(1))))));
  }
}

function nameOf(id: string): string {
  return TECH[id]?.name ?? id;
}

const METRICS = ['Population', 'Territory', 'Cities', 'Discoveries', 'Culture', 'Military'];

function renderCharts(body: HTMLElement, g: Game, rerender: () => void): void {
  body.append(h('div', { class: 'yz-filter' }, METRICS.map((m, i) =>
    h('button', { class: `yz-btn small${state.chart === i ? ' active' : ''}`, onclick: () => { state.chart = i; rerender(); } }, m))));
  const p = g.player;
  const samples = g.s.samples;
  if (samples.length < 2) {
    body.append(h('p', { class: 'yz-muted' }, 'Charts appear after a few years have passed.'));
    return;
  }
  const civs = g.s.civs.filter((c) => c.id === p.id || g.knows(p.id, c.id));
  const series = civs.map((c) => ({
    civ: c,
    pts: samples.filter((s) => s.civs[c.id]).map((s) => [s.turn, s.civs[c.id][state.chart]] as [number, number]),
  })).filter((s) => s.pts.length);
  body.append(lineChart(series.map((s) => ({ color: s.civ.color, pts: s.pts, bold: s.civ.id === p.id })), g.turn));
  body.append(h('div', { class: 'yz-legend' }, series.map((s) => h('span', null, h('i', { style: { background: s.civ.color } }), s.civ.name + (s.civ.alive ? '' : ' †')))));
}

function lineChart(series: { color: string; pts: [number, number][]; bold: boolean }[], maxTurn: number): SVGSVGElement {
  const W = 900;
  const H = 230;
  const pad = { l: 52, r: 12, t: 10, b: 24 };
  let maxV = 1;
  for (const s of series) for (const [, v] of s.pts) maxV = Math.max(maxV, v);
  const x = (t: number) => pad.l + (t / Math.max(1, maxTurn)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / maxV) * (H - pad.t - pad.b);
  const ns = 'http://www.w3.org/2000/svg';
  const svgEl = document.createElementNS(ns, 'svg');
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('class', 'yz-chart');
  svgEl.setAttribute('preserveAspectRatio', 'none');
  const add = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text) el.textContent = text;
    svgEl.appendChild(el);
    return el;
  };
  for (let k = 0; k <= 4; k++) {
    const v = (maxV * k) / 4;
    add('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), stroke: 'rgba(214,178,108,0.12)' });
    add('text', { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end', fill: '#8f887a', 'font-size': 11 }, compact(v));
  }
  add('text', { x: pad.l, y: H - 6, fill: '#8f887a', 'font-size': 11 }, 'Year 0');
  add('text', { x: W - pad.r, y: H - 6, 'text-anchor': 'end', fill: '#8f887a', 'font-size': 11 }, `Year ${maxTurn}`);
  for (const s of [...series].sort((a, b) => Number(a.bold) - Number(b.bold))) {
    const d = s.pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
    add('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.bold ? 3 : 1.6, 'stroke-linejoin': 'round', opacity: s.bold ? 1 : 0.8, 'vector-effect': 'non-scaling-stroke' });
  }
  return svgEl;
}

function compact(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return v.toFixed(0);
}
