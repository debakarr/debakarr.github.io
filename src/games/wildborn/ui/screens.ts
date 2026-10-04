// Small view builders shared by Wildborn's screens: bars, chips, creature
// rows and cards. All vanilla DOM via the shared h() helper.

import { h } from '../../shared/dom';
import { ABILITIES, AFFINITY, ITEMS, SPECIES_BY_ID, type Exposure } from '../data/species';
import { personalityWords, statsOf, type Creature, type GameState, type GuideState, type Quest } from '../sim/game';

export function bar(value: number, max: number, cls = ''): HTMLElement {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return h('span', { class: `wb-bar ${cls}` }, h('i', { style: { width: `${pct}%` } }));
}

export function meter(label: string, value: number, max: number, cls = ''): HTMLElement {
  return h('div', { class: 'wb-meter' },
    h('span', { class: 'wb-meter-label' }, label),
    bar(value, max, cls),
    h('span', { class: 'wb-meter-value' }, `${Math.round(value)}/${Math.round(max)}`),
  );
}

export function chip(text: string, cls = '', title?: string): HTMLElement {
  return h('span', { class: `wb-chip ${cls}`, title }, text);
}

export function affinityChips(c: Creature): HTMLElement {
  const sp = SPECIES_BY_ID[c.speciesId];
  return h('div', { class: 'wb-chips' },
    ...sp.affinities.map((a) => chip(AFFINITY[a].label, `wb-aff-${a}`, AFFINITY[a].label)),
  );
}

export function hpLine(c: Creature): HTMLElement {
  const stats = statsOf(c);
  return h('div', { class: 'wb-hpline' }, bar(c.hp, stats.maxHp, c.hp / stats.maxHp < 0.33 ? 'wb-bar-low' : ''));
}

export function creatureRow(c: Creature, onClick: () => void, right?: HTMLElement): HTMLElement {
  const sp = SPECIES_BY_ID[c.speciesId];
  return h('button', { class: 'wb-row', onclick: onClick },
    h('span', { class: 'wb-row-badge', 'data-species': c.id }),
    h('span', { class: 'wb-row-main' },
      h('b', null, c.name, c.variant ? chip(c.variant, `wb-variant-${c.variant}`) : null),
      h('small', null, `${sp.name} · Lv ${c.level} · ${sp.role}`),
      hpLine(c),
    ),
    right ?? h('span', { class: 'wb-row-right' }, `Bond ${Math.round(c.bond)}`),
  );
}

export function statBlock(c: Creature): HTMLElement {
  const stats = statsOf(c);
  return h('div', { class: 'wb-stats' },
    meter('HP', c.hp, stats.maxHp, 'wb-bar-hp'),
    meter('Power', stats.power, 60),
    meter('Guard', stats.guard, 60),
    meter('Speed', stats.speed, 60),
    meter('Bond', c.bond, 100, 'wb-bar-bond'),
    meter('Trust', c.trust, 100, 'wb-bar-trust'),
    meter('Stress', c.stress, 100, 'wb-bar-stress'),
  );
}

const EXPOSURE_LABEL: Record<Exposure, string> = {
  thermal: 'Thermal',
  aquatic: 'Aquatic',
  mineral: 'Mineral',
  organic: 'Organic',
  night: 'Night',
  storm: 'Storm',
  wins: 'Victories',
  losses: 'Defeats',
  explore: 'Exploration',
  play: 'Play',
  ruins: 'Ruins',
};

export function exposureBlock(c: Creature): HTMLElement {
  const entries = Object.entries(c.exposures).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) as [Exposure, number][];
  return h('div', { class: 'wb-stats' },
    entries.length
      ? entries.map(([e, v]) => meter(EXPOSURE_LABEL[e], v, Math.max(8, v), 'wb-bar-exp'))
      : h('p', { class: 'wb-dim' }, 'No notable experiences yet.'),
  );
}

export function abilityList(c: Creature): HTMLElement {
  return h('div', { class: 'wb-abilities' },
    ...c.abilities.map((id) => {
      const ab = ABILITIES[id];
      if (!ab) return null;
      return h('div', { class: 'wb-ability' },
        h('b', null, ab.name),
        chip(AFFINITY[ab.affinity].label, `wb-aff-${ab.affinity}`),
        ab.effect ? chip(ab.effect, 'wb-chip-soft') : null,
        h('p', null, ab.desc),
      );
    }),
  );
}

export function historyList(c: Creature): HTMLElement {
  return h('div', { class: 'wb-history' },
    h('p', { class: 'wb-dim' }, `Born day ${c.bornDay}, ${c.origin === 'village' ? 'at the village' : `in the ${c.origin}`} · generation ${c.generation}`),
    ...c.history.slice(-12).reverse().map((e) => h('div', { class: 'wb-hist-row' }, h('b', null, `Day ${e.day}`), ' ', e.text)),
  );
}

export function guideCard(speciesId: string, state: GuideState, onClick?: () => void): HTMLElement {
  const sp = SPECIES_BY_ID[speciesId];
  const known = state !== 'unknown';
  return h('button', { class: `wb-guidecard wb-guide-${state}`, onclick: onClick },
    h('span', { class: 'wb-guide-art', 'data-species': known ? speciesId : '' }),
    h('b', null, known ? sp.name : '???'),
    h('small', null, known ? `${sp.role} · ${state}` : 'Unknown'),
  );
}

export function itemRow(itemId: string, count: number, onUse: (id: string) => void): HTMLElement {
  const item = ITEMS[itemId];
  return h('div', { class: 'wb-row wb-item' },
    h('span', { class: 'wb-row-main' },
      h('b', null, item.name, chip(`×${count}`, 'wb-chip-soft')),
      h('small', null, item.desc),
    ),
    count > 0 ? h('button', { class: 'wb-btn wb-btn-small', onclick: () => onUse(itemId) }, 'Use') : null,
  );
}

export function questCard(q: Quest): HTMLElement {
  return h('div', { class: `wb-quest${q.done ? ' wb-quest-done' : ''}` },
    h('div', { class: 'wb-quest-head' }, h('b', null, q.text), q.done ? chip('Done', 'wb-chip-ok') : null),
    bar(q.have, q.need, 'wb-bar-bond'),
    h('small', null, `Reward: ${q.reward}`),
  );
}

export function tabBar<T extends string>(tabs: { id: T; label: string }[], active: T, onPick: (id: T) => void): HTMLElement {
  return h('div', { class: 'wb-tabs', role: 'tablist' },
    ...tabs.map((t) =>
      h('button', {
        class: `wb-tab${t.id === active ? ' wb-tab-active' : ''}`,
        role: 'tab',
        'aria-selected': t.id === active ? 'true' : 'false',
        onclick: () => onPick(t.id),
      }, t.label),
    ),
  );
}

export function timeLabel(state: GameState): string {
  const hh = String(Math.floor(state.hour)).padStart(2, '0');
  return `Day ${state.day} · ${hh}:00`;
}

export function personalityLine(c: Creature): HTMLElement {
  return h('div', { class: 'wb-chips' }, ...personalityWords(c).map((w) => chip(w, 'wb-chip-soft')));
}
