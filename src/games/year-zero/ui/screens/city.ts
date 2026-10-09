// City management: a full screen for one of our cities with its picture,
// the numbers that matter, the production queue, buildings and garrison.
// Everything here edits the real city (focus, production, purchases).

import { BUILDING, BUILDINGS, WONDER } from '../../data/buildings';
import { UNIT } from '../../data/units';
import { estimateTurns, governorPick } from '../../sim/ai';
import {
  buildOptions, buyCost, buyItem, growthNeeded, itemCost, itemName, itemProd, maxCityHp, realPopulation, setBuild, sizeCap,
} from '../../sim/cities';
import type { Game } from '../../sim/game';
import { regionName } from '../../sim/history';
import type { City, Focus } from '../../sim/state';
import { clear, fmt, gi, h, signed, svg } from '../dom';
import { ICON } from '../icons';
import { openModal, type ModalHandle } from '../modal';

const FOCUS: { id: Focus; label: string; icon: string }[] = [
  { id: 'balanced', label: 'Balanced', icon: 'n-world' },
  { id: 'food', label: 'Food', icon: 'y-food' },
  { id: 'production', label: 'Industry', icon: 'y-prod' },
  { id: 'science', label: 'Science', icon: 'y-sci' },
  { id: 'wealth', label: 'Wealth', icon: 'y-gold' },
  { id: 'culture', label: 'Culture', icon: 'y-cult' },
];

function iconFor(kind: string, id: string): string {
  return `${kind === 'unit' ? 'u' : kind === 'building' ? 'b' : kind === 'wonder' ? 'w' : 'p'}-${id}`;
}

export interface CityHost {
  g: Game;
  portrait: (tile: number) => string | null;
  changed: () => void;
  click: () => void;
  select: (unitId: number) => void;
}

export function openCityManager(root: HTMLElement, host: CityHost, cityId: number): void {
  const g = host.g;
  openModal(root, {
    title: 'City Management',
    gicon: 'n-city',
    tabs: ['Overview', 'Production', 'Buildings', 'Garrison', 'Details'],
    render: (body, tab, handle) => {
      const city = g.city(cityId);
      if (!city) {
        body.append(h('p', { class: 'yz-quote' }, 'This city is no longer ours.'));
        return;
      }
      const civ = g.civ(city.civId);
      const capital = civ.capitalId === city.id;
      const url = host.portrait(city.tile);
      const head = h('div', { class: 'yz-cm-head' },
        h('span', { class: 'yz-crest big', style: { '--civ': civ.color } as never }, gi('n-city')),
        h('div', null,
          h('div', { class: 'yz-cm-name' }, city.name, capital ? h('span', { class: 'cap' }, ' ♛') : null),
          h('div', { class: 'yz-sub' }, `${realPopulation(city, civ).toLocaleString('en-US')} people · ${regionName(g, city.tile) || 'unnamed land'} · since Year ${city.founded}`)));
      const pic = url ? h('div', { class: 'yz-cm-pic' }, h('img', { src: url, alt: '' })) : null;
      switch (tab) {
        case 'Production': return production(body, host, city, handle, head);
        case 'Buildings': return buildings(body, city, head);
        case 'Garrison': return garrison(body, host, city, head);
        case 'Details': return details(body, g, city, head);
        default: return overview(body, host, city, head, pic, handle);
      }
    },
  });
}

function stat(icon: string, cls: string, label: string, value: string, title = ''): HTMLElement {
  return h('div', { class: 'yz-cm-stat', title }, h('span', { class: `ic ${cls}` }, gi(icon)), h('span', { class: 'lb' }, label), h('b', { class: 'yz-num' }, value));
}

function overview(body: HTMLElement, host: CityHost, city: City, head: HTMLElement, pic: HTMLElement | null, handle: ModalHandle): void {
  const g = host.g;
  const y = city.y;
  const cap = sizeCap(city);
  const need = growthNeeded(g, city.size);
  const happy = Math.max(0, Math.min(100, Math.round(50 + y.mood * 10)));
  const left = h('div', { class: 'yz-cm-stats' },
    stat('y-pop', 'c-food', 'Population', `${city.size} / ${cap}`),
    stat(y.mood >= 0 ? 'y-happy' : 'y-sad', y.mood >= 0 ? 'c-mood' : 'c-bad', 'Happiness', `${happy}%`, `${y.happy} content vs ${y.unhappy} discontent`),
    stat('y-food', 'c-food', 'Food', signed(y.foodNet, y.foodNet % 1 ? 1 : 0)),
    stat('y-prod', 'c-prod', 'Production', `+${fmt(y.prod, 1)}`),
    stat('y-gold', 'c-gold', 'Gold', `+${fmt(y.gold, 1)}`),
    stat('y-sci', 'c-sci', 'Research', `+${fmt(y.sci, 1)}`),
    stat('y-cult', 'c-cult', 'Culture', `+${fmt(y.cult, 1)}`));
  const grow = y.foodNet > 0 ? Math.ceil((need - city.food) / y.foodNet) : Infinity;
  const right = h('div', { class: 'yz-cm-right' }, pic,
    h('div', { class: 'yz-sub', style: { display: 'flex', justifyContent: 'space-between', marginTop: '8px' } },
      h('span', null, city.size >= cap ? `Size limit ${cap}` : 'Growth'),
      h('span', { class: 'yz-num' }, isFinite(grow) ? `${grow} yrs` : y.foodNet < 0 ? 'starving' : 'stagnant')),
    h('div', { class: 'yz-progress c-food' }, h('i', { style: { width: `${Math.min(100, (city.food / need) * 100)}%` } })),
    queueCard(host, city, handle));
  body.append(head, h('div', { class: 'yz-cm-grid' }, left, right),
    h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '6px' } }, 'City focus'),
      h('div', { class: 'yz-seg' }, FOCUS.map((f) => h('button', {
        class: city.focus === f.id ? 'on' : '',
        onclick: () => {
          city.focus = f.id;
          host.click();
          host.changed();
          handle.rerender();
        },
      }, gi(f.icon), f.label)))));
}

function queueCard(host: CityHost, city: City, handle: ModalHandle): HTMLElement {
  const g = host.g;
  const civ = g.civ(city.civId);
  const card = h('div', { class: 'yz-cm-queue' }, h('div', { class: 'yz-label' }, 'Production queue'));
  if (city.build) {
    const cost = itemCost(g, city, city.build);
    const turns = estimateTurns(g, city, city.build);
    card.append(h('div', { class: 'row' },
      h('span', { class: 'yz-crest', style: { '--civ': civ.color } as never }, gi(iconFor(city.build.kind, city.build.id))),
      h('div', { class: 'nm' }, h('b', null, itemName(city.build)), h('span', null, city.resistance > 0 ? 'halted by unrest' : `${turns} year${turns === 1 ? '' : 's'} · ${city.manual ? 'your choice' : 'governor'}`)),
      h('div', { class: 'yz-progress c-prod' }, h('i', { style: { width: `${cost ? Math.min(100, (city.prod / cost) * 100) : 0}%` } }))));
  } else card.append(h('p', { class: 'yz-muted' }, 'Nothing is being built.'));
  const bc = buyCost(g, city);
  card.append(h('div', { class: 'yz-actions' },
    bc !== null ? h('button', {
      class: 'yz-btn gold', disabled: civ.gold < bc, title: civ.gold < bc ? 'Not enough gold' : 'Complete it next turn',
      onclick: () => { if (buyItem(g, city)) { host.click(); host.changed(); handle.rerender(); } },
    }, svg(ICON.gold), `Buy · ${bc}`) : null,
    h('button', { class: 'yz-btn', onclick: () => handle.setTab('Production') }, 'Change')));
  return card;
}

function production(body: HTMLElement, host: CityHost, city: City, handle: ModalHandle, head: HTMLElement): void {
  const g = host.g;
  body.append(head, queueCard(host, city, handle));
  if (city.manual) body.append(h('button', { class: 'yz-btn small', style: { marginTop: '8px' }, onclick: () => { setBuild(city, governorPick(g, city), false); host.changed(); handle.rerender(); } }, 'Let the governor choose'));
  const options = buildOptions(g, city);
  for (const grp of ['Units', 'Buildings', 'Wonders', 'Projects'] as const) {
    const list = options.filter((o) => o.group === grp);
    if (!list.length) continue;
    body.append(h('div', { class: 'yz-buildgroup' }, h('div', { class: 'yz-label' }, grp),
      h('div', { class: 'yz-buildgrid' }, list.map((o) => {
        const on = city.build?.kind === o.item.kind && city.build.id === o.item.id;
        const p = Math.max(0.5, itemProd(g, city, o.item));
        const turns = o.cost === 0 ? 0 : Math.max(1, Math.ceil((on ? o.cost - city.prod : o.cost) / p));
        return h('button', {
          class: `yz-buildcard${on ? ' on' : ''}`,
          onclick: () => {
            setBuild(city, o.item, true);
            host.click();
            host.changed();
            handle.setTab('Overview');
          },
        }, h('span', { class: 'ic' }, gi(iconFor(o.item.kind, o.item.id))), h('b', null, o.name), h('span', { class: 't yz-num' }, turns ? `${turns} yr${turns === 1 ? '' : 's'}` : 'ongoing'), h('span', { class: 'd' }, o.desc));
      }))));
  }
}

function buildings(body: HTMLElement, city: City, head: HTMLElement): void {
  body.append(head);
  const grid = h('div', { class: 'yz-buildgrid' });
  for (const w of city.wonders) grid.append(h('div', { class: 'yz-buildcard wonder' }, h('span', { class: 'ic' }, gi(`w-${w}`)), h('b', null, WONDER[w].name), h('span', { class: 'd' }, WONDER[w].desc)));
  for (const b of city.buildings) grid.append(h('div', { class: 'yz-buildcard' }, h('span', { class: 'ic' }, gi(`b-${b}`)), h('b', null, BUILDING[b]?.name ?? b), h('span', { class: 'd' }, BUILDING[b]?.desc ?? '')));
  if (!grid.childNodes.length) grid.append(h('p', { class: 'yz-muted' }, 'No buildings yet.'));
  body.append(h('div', { class: 'yz-label', style: { margin: '12px 0 8px' } }, `${city.buildings.length} of ${BUILDINGS.length} buildings`), grid);
}

function garrison(body: HTMLElement, host: CityHost, city: City, head: HTMLElement): void {
  const g = host.g;
  body.append(head);
  const units = g.unitsOn(city.tile).filter((u) => u.civId === city.civId);
  if (!units.length) {
    body.append(h('p', { class: 'yz-quote' }, 'No soldiers stand guard here. A garrison helps defend the walls and keeps the people calm.'));
    return;
  }
  const list = h('div', { class: 'yz-unitlist' });
  for (const u of units) {
    list.append(h('button', { class: 'yz-unitrow', onclick: () => host.select(u.id) },
      h('span', { class: 'yz-crest', style: { '--civ': g.civ(u.civId).color } as never }, gi(`u-${u.type}`)),
      h('div', { class: 'nm' }, h('b', null, UNIT[u.type].name), h('span', null, `Strength ${UNIT[u.type].str}`)),
      h('div', { class: 'hp' }, h('div', { class: 'yz-progress c-good' }, h('i', { style: { width: `${u.hp}%` } })), h('span', { class: 'yz-num' }, String(u.hp)))));
  }
  body.append(list);
}

function details(body: HTMLElement, g: Game, city: City, head: HTMLElement): void {
  const y = city.y;
  body.append(head, h('dl', { class: 'yz-kv', style: { marginTop: '12px' } },
    h('dt', null, 'Founded'), h('dd', null, `Year ${city.founded}${city.founderId !== city.civId ? ` by the ${g.civ(city.founderId).name}` : ''}`),
    h('dt', null, 'Peak size'), h('dd', null, String(city.peakSize)),
    h('dt', null, 'Worked tiles'), h('dd', null, `${city.worked.length} (+ city center)`),
    h('dt', null, 'Defense'), h('dd', null, `${y.defense} · walls ${city.hp}/${maxCityHp(city)}`),
    h('dt', null, 'Culture'), h('dd', null, fmt(city.culture)),
    h('dt', null, 'Unrest'), h('dd', null, city.unrest ? String(city.unrest) : 'none')));
  void clear;
}
