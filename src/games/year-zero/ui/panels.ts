import { BUILDING, WONDER } from '../data/buildings';
import { FEATURE_NAME, IMPROVEMENTS, RESOURCES, Relief, TERRAIN } from '../data/terrain';
import { CLASS_LABEL, UNIT, isMilitary } from '../data/units';
import { estimateTurns } from '../sim/ai';
import {
  buildOptions, buyCost, buyItem, growthNeeded, itemCost, itemName, itemProd, maxCityHp, realPopulation, setBuild, sizeCap,
} from '../sim/cities';
import { STATUS_LABEL, relationStatus } from '../sim/diplomacy';
import type { Game } from '../sim/game';
import { regionName, riverName } from '../sim/history';
import { governorPick } from '../sim/ai';
import { maxMoves } from '../sim/path';
import type { City, Focus, Unit } from '../sim/state';
import { resourceVisible, siteInfo, tileYield } from '../sim/tiles';
import { canFoundAt, canPillage, canUpgrade, isEmbarked, previewAttack, upgradeCost, upgradeTarget } from '../sim/units';
import { cap, fmt, gi, h, signed, svg } from './dom';
import { ICON, type IconName } from './icons';

export interface PanelHost {
  g: Game;
  refresh: () => void;
  selectUnit: (id: number) => void;
  selectCity: (id: number) => void;
  deselect: () => void;
  centerOn: (tile: number) => void;
  unitAction: (action: string) => void;
  click: () => void;
  /** A rendered picture of a tile or city (3D only). */
  portraitOf?: (tile: number, kind: 'tile' | 'city') => string | null;
  /** Opens the full city management screen. */
  manageCity?: (id: number) => void;
}

function portrait(host: PanelHost, tile: number, kind: 'tile' | 'city'): HTMLElement | null {
  const url = host.portraitOf?.(tile, kind);
  return url ? h('div', { class: `yz-portrait ${kind}` }, h('img', { src: url, alt: '', draggable: 'false' })) : null;
}

const FOCUS: { id: Focus; label: string; icon: string }[] = [
  { id: 'balanced', label: 'Balanced', icon: 'n-world' },
  { id: 'food', label: 'Food', icon: 'y-food' },
  { id: 'production', label: 'Industry', icon: 'y-prod' },
  { id: 'science', label: 'Science', icon: 'y-sci' },
  { id: 'wealth', label: 'Wealth', icon: 'y-gold' },
  { id: 'culture', label: 'Culture', icon: 'y-cult' },
];

function yieldBox(icon: string, cls: string, label: string, value: string, title?: string): HTMLElement {
  return h('div', { class: 'yz-yield', title }, h('span', { class: cls }, gi(icon)), h('span', { class: 'lbl' }, label), h('span', { class: 'val' }, value));
}

/** Icon key for a build item. */
function itemIcon(kind: string, id: string): string {
  return `${kind === 'unit' ? 'u' : kind === 'building' ? 'b' : kind === 'wonder' ? 'w' : 'p'}-${id}`;
}

function head(title: string, sub: string | Node, host: PanelHost, color?: string, icon?: string): HTMLElement {
  return h('div', { class: 'yz-side-head' },
    icon && color
      ? h('span', { class: 'yz-token', style: { background: color } }, gi(icon))
      : color ? h('span', { class: 'yz-emblem', style: { background: color, width: '22px', height: '22px', marginTop: '3px' } }) : null,
    h('div', null, h('h3', { class: 'yz-h' }, title), h('div', { class: 'yz-sub' }, sub)),
    h('button', { class: 'yz-iconbtn yz-side-close', 'aria-label': 'Close', onclick: () => host.deselect() }, svg(ICON.close)));
}

export function siteRating(g: Game, tile: number): { label: string; detail: string; score: number } {
  const info = siteInfo(g.s.map, (c, r) => g.grid.within(c, r), (i) => g.grid.neighborList(i), tile);
  if (info.score < 0) return { label: 'Unsuitable', detail: 'Cities cannot be built here.', score: -1 };
  const bits: string[] = [];
  if (info.river) bits.push('river');
  if (info.coast) bits.push('coast');
  if (info.lake) bits.push('lake');
  if (info.foodRes) bits.push(`${info.foodRes} food resource${info.foodRes > 1 ? 's' : ''}`);
  if (info.luxRes) bits.push(`${info.luxRes} luxur${info.luxRes > 1 ? 'ies' : 'y'}`);
  const s = info.score;
  const label = s >= 62 ? 'Excellent' : s >= 50 ? 'Good' : s >= 38 ? 'Fair' : 'Poor';
  return { label, detail: bits.length ? bits.join(', ') : 'no special features', score: s };
}

// --- Tile ---------------------------------------------------------------------------

export function tilePanel(host: PanelHost, tile: number): HTMLElement {
  const g = host.g;
  const map = g.s.map;
  const player = g.player;
  const el = h('div');
  if (!player.explored[tile]) {
    el.append(head('Unexplored', 'Terra incognita. Send explorers to learn what lies here.', host));
    return el;
  }
  const t = TERRAIN[map.terrain[tile]];
  const parts = [t.name];
  if (map.relief[tile] === Relief.Hills) parts.push('Hills');
  if (map.relief[tile] === Relief.Mountain) parts.push('Mountains');
  const feat = FEATURE_NAME[map.feature[tile]];
  if (feat) parts.push(feat);
  const region = regionName(g, tile);
  el.append(h('div', { class: 'yz-panel-title' }, 'Tile Info'));
  el.append(head(parts.join(' · '), region || (t.water ? 'Open water' : 'Unnamed land'), host));
  const pic = portrait(host, tile, 'tile');
  if (pic) el.append(pic);
  const y = tileYield(map, g.s.wonders, player, tile);
  el.append(h('div', { class: 'yz-grid3' },
    yieldBox('y-food', 'c-food', 'Food', String(y.food)),
    yieldBox('y-prod', 'c-prod', 'Prod.', String(y.prod)),
    yieldBox('y-gold', 'c-gold', 'Trade', String(y.trade))));
  const kv = h('dl', { class: 'yz-kv', style: { marginTop: '10px' } });
  const add = (k: string, v: string | Node) => kv.append(h('dt', null, k), h('dd', null, v));
  const river = map.river[tile] > 0 ? riverName(g, tile) : null;
  if (river) add('River', `River ${river}`);
  const r = map.resource[tile];
  if (r && resourceVisible(player, r)) add('Resource', h('span', { style: { display: 'inline-flex', gap: '5px', alignItems: 'center', color: RESOURCES[r].color } }, gi(`r-${RESOURCES[r].key}`), h('span', { style: { color: 'var(--yz-ink)' } }, `${RESOURCES[r].name} (${RESOURCES[r].kind})`)));
  if (map.improvement[tile]) add('Improvement', IMPROVEMENTS[map.improvement[tile]].name);
  if (map.road[tile]) add('Road', map.road[tile] >= 2 ? 'Railroad' : 'Road');
  const owner = map.owner[tile];
  if (owner >= 0) {
    const civ = g.civ(owner);
    const city = map.cityOf[tile] >= 0 ? g.city(map.cityOf[tile]) : undefined;
    add('Territory', `${civ.name}${city ? ` · ${city.name}` : ''}`);
  }
  if (kv.childNodes.length) el.append(kv);
  const w = map.wonder[tile];
  if (w >= 0) {
    const wd = g.s.wonders[w];
    el.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label' }, 'Natural wonder'), h('div', { class: 'yz-h', style: { fontSize: '16px' } }, cap(wd.name)), h('div', { class: 'yz-quote' }, wd.desc)));
  }
  const ru = map.ruinAt[tile];
  if (ru >= 0 && map.cityAt[tile] < 0) {
    const ruin = g.s.ruins[ru];
    const known = ruin.exploredBy.includes(player.id);
    el.append(h('div', { class: 'yz-section' },
      h('div', { class: 'yz-label' }, 'Ruins'),
      known
        ? h('div', null, h('div', { class: 'yz-h', style: { fontSize: '16px' } }, `The city of ${ruin.name}`),
          h('div', { class: 'yz-sub' }, `${ruin.prehistoric ? 'Forgotten' : 'Built by the'} ${ruin.civName}${ruin.prehistoric ? '' : ''} · fell ${ruin.prehistoric ? `~${Math.round((g.turn - ruin.fell) / 50) * 50} years ago` : `in Year ${ruin.fell}`}`),
          h('div', { class: 'yz-quote' }, ruin.cause))
        : h('div', { class: 'yz-sub' }, 'Ancient ruins. Send a unit here to learn their story.')));
  }
  if (!t.water) {
    const site = siteRating(g, tile);
    if (site.score >= 0) {
      el.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label' }, 'City site'), h('div', null, h('b', null, site.label), h('span', { class: 'yz-muted' }, ` — ${site.detail}`))));
    }
  }
  const units = g.unitsOn(tile).filter((u) => player.visible[tile] || u.civId === player.id);
  if (units.length) {
    el.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label' }, 'Units here'),
      h('div', { class: 'yz-chips', style: { marginTop: '6px' } },
        units.map((u) => h('button', {
          class: 'yz-chip',
          style: { borderColor: g.civ(u.civId).color },
          onclick: () => u.civId === player.id && host.selectUnit(u.id),
        }, `${g.civ(u.civId).adj} ${UNIT[u.type].name}`)))));
  }
  return el;
}

// --- Unit ----------------------------------------------------------------------------

function unitStatus(g: Game, u: Unit): string {
  if (isEmbarked(g, u)) return 'Embarked';
  const o = u.order;
  if (!o) return u.moves > 0 ? 'Awaiting orders' : 'Done this turn';
  switch (o.kind) {
    case 'fortify': return u.fortified > 0 ? `Fortified (+${u.fortified * 10}%)` : 'Fortifying';
    case 'sleep': return 'Sleeping';
    case 'explore': return 'Exploring';
    case 'goto': return 'On the march';
    case 'settle': return 'Seeking a home';
  }
}

export function unitPanel(host: PanelHost, u: Unit, hoverTile: number): HTMLElement {
  const g = host.g;
  const def = UNIT[u.type];
  const civ = g.civ(u.civId);
  const own = civ.isPlayer;
  const el = h('div');
  el.append(head(def.name, `${own ? '' : `${civ.adj} · `}${CLASS_LABEL[def.cls]} · ${unitStatus(g, u)}`, host, civ.color, `u-${u.type}`));
  const stats = h('div', { class: 'yz-grid3' });
  if (def.str > 0 || def.rng > 0) stats.append(yieldBox('y-strength', 'c-bad', 'Str.', String(def.str)));
  if (def.rng > 0) stats.append(yieldBox('y-range', 'c-prod', `Rng ${def.range}`, String(def.rng)));
  stats.append(yieldBox('y-moves', 'c-sci', 'Moves', `${fmt(u.moves, u.moves % 1 ? 1 : 0)}/${maxMoves(g, u)}`));
  el.append(stats);
  el.append(h('div', { style: { marginTop: '8px' } },
    h('div', { class: 'yz-sub', style: { display: 'flex', justifyContent: 'space-between' } }, h('span', null, 'Health'), h('span', { class: 'yz-num' }, `${u.hp}/100`)),
    h('div', { class: `yz-progress ${u.hp > 60 ? 'c-good' : u.hp > 30 ? 'c-gold' : 'c-bad'}` }, h('i', { style: { width: `${u.hp}%` } }))));
  const chips = h('div', { class: 'yz-chips', style: { marginTop: '8px' } });
  if (u.veteran) chips.append(h('span', { class: 'yz-chip gold' }, 'Veteran +15%'));
  if (def.antiCav) chips.append(h('span', { class: 'yz-chip' }, '+50% vs mounted'));
  if (def.vsCity) chips.append(h('span', { class: 'yz-chip' }, '×2 vs cities'));
  if (def.res) chips.append(h('span', { class: 'yz-chip' }, `Needs ${def.res}`));
  if (chips.childNodes.length) el.append(chips);

  if (own && u.type === 'settler') {
    const site = siteRating(g, u.tile);
    const ok = canFoundAt(g, civ, u.tile);
    el.append(h('div', { class: 'yz-section' },
      h('div', { class: 'yz-label' }, 'This site'),
      ok
        ? h('div', null, h('b', null, site.label), h('span', { class: 'yz-muted' }, ` — ${site.detail}`))
        : h('div', { class: 'yz-muted' }, site.score < 0 ? 'Cities cannot be built here.' : 'Too close to another city, or inside foreign borders.'),
      h('div', { class: 'yz-sub', style: { marginTop: '6px' } }, 'Rivers and coasts make cities prosper. Hover the map to compare sites.')));
  }

  if (own && hoverTile >= 0 && hoverTile !== u.tile) {
    const odds = previewAttack(g, u, hoverTile);
    if (odds) {
      const win = odds.dmgToDef >= odds.defHp;
      const lose = odds.dmgToAtk >= odds.atkHp;
      el.append(h('div', { class: 'yz-section' },
        h('div', { class: 'yz-label' }, `Attack ${odds.name}`),
        h('dl', { class: 'yz-kv', style: { marginTop: '6px' } },
          h('dt', null, 'Damage dealt'), h('dd', { class: 'c-good' }, `${odds.dmgToDef} (of ${odds.defHp})`),
          h('dt', null, 'Damage taken'), h('dd', { class: 'c-bad' }, `${odds.dmgToAtk} (of ${odds.atkHp})`)),
        h('div', { class: 'yz-sub', style: { marginTop: '4px' } },
          lose ? 'Our unit would likely be destroyed.' : win ? (odds.kind === 'city' ? 'The city would fall.' : 'The enemy would likely be destroyed.') : 'An even exchange.')));
    }
  }

  const stack = g.unitsOn(u.tile).filter((o) => o.civId === u.civId);
  if (own && stack.length > 1) {
    el.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label' }, 'On this tile'),
      h('div', { class: 'yz-chips', style: { marginTop: '6px' } },
        stack.map((o) => h('button', { class: `yz-chip${o.id === u.id ? ' gold' : ''}`, onclick: () => host.selectUnit(o.id) },
          `${UNIT[o.type].name}${o.moves > 0 && !o.order ? ' •' : ''}`)))));
  }
  return el;
}

export interface UnitAction {
  id: string;
  label: string;
  icon: IconName;
  key?: string;
  disabled?: boolean;
  title?: string;
  primary?: boolean;
}

export function unitActions(g: Game, u: Unit): UnitAction[] {
  const def = UNIT[u.type];
  const civ = g.civ(u.civId);
  const out: UnitAction[] = [];
  if (u.type === 'settler') {
    const ok = canFoundAt(g, civ, u.tile);
    out.push({ id: 'found', label: 'Found city', icon: 'tent', key: 'B', disabled: !ok || u.moves <= 0, primary: ok, title: ok ? 'Found a city on this tile' : 'Cannot found a city here' });
  }
  if (def.cls !== 'civilian' || u.type === 'settler') {
    out.push({ id: 'explore', label: 'Explore', icon: 'eye', key: 'E', disabled: u.order?.kind === 'explore' });
  }
  if (isMilitary(def)) out.push({ id: 'fortify', label: 'Fortify', icon: 'shield', key: 'F', disabled: u.order?.kind === 'fortify' });
  else out.push({ id: 'sleep', label: 'Sleep', icon: 'moon', key: 'S', disabled: u.order?.kind === 'sleep' });
  out.push({ id: 'skip', label: 'Skip', icon: 'skip', key: 'Space', disabled: u.moves <= 0 });
  const up = upgradeTarget(g, u);
  if (up) out.push({ id: 'upgrade', label: `Upgrade ${upgradeCost(g, u)}g`, icon: 'up', key: 'U', disabled: !canUpgrade(g, u), title: `Upgrade to ${up.name} (must be inside your borders)` });
  if (canPillage(g, u)) out.push({ id: 'pillage', label: 'Pillage', icon: 'fire', key: 'P' });
  if (u.order) out.push({ id: 'cancel', label: 'Wake', icon: 'next', key: 'W' });
  out.push({ id: 'disband', label: 'Disband', icon: 'trash' });
  out.push({ id: 'next', label: 'Next', icon: 'next', key: 'N' });
  return out;
}

export function unitBar(host: PanelHost, u: Unit, compact: boolean): HTMLElement[] {
  const g = host.g;
  const items: HTMLElement[] = [];
  if (compact) {
    const def = UNIT[u.type];
    items.push(h('div', { style: { minWidth: '92px', paddingRight: '6px', fontSize: '12px', lineHeight: '1.25' } },
      h('div', { style: { fontWeight: '600' } }, def.name),
      h('div', { class: 'yz-muted yz-num' }, `HP ${u.hp} · ${fmt(u.moves, u.moves % 1 ? 1 : 0)}/${maxMoves(g, u)} mv`)));
  }
  for (const a of unitActions(g, u)) {
    if (compact && a.id === 'disband') continue;
    items.push(h('button', {
      class: `yz-unitbtn${a.primary ? ' primary' : ''}`,
      disabled: !!a.disabled,
      title: a.title ?? (a.key ? `${a.label} (${a.key})` : a.label),
      onclick: () => host.unitAction(a.id),
    }, svg(ICON[a.icon]), h('span', null, a.label), a.key && !compact ? h('kbd', null, a.key) : null));
  }
  return items;
}

// --- City ----------------------------------------------------------------------------

export function cityPanel(host: PanelHost, city: City, opts: { showBuild: boolean; toggleBuild: () => void }): HTMLElement {
  const g = host.g;
  const civ = g.civ(city.civId);
  const own = civ.isPlayer;
  const el = h('div');
  const pop = realPopulation(city, civ);
  const capital = civ.capitalId === city.id;
  el.append(head(`${capital ? '♛ ' : ''}${city.name}`, `${own ? '' : `${civ.name} · `}Size ${city.size} · ${pop.toLocaleString('en-US')} people`, host, civ.color));
  const pic = portrait(host, city.tile, 'city');
  if (pic) el.append(pic);
  if (own && host.manageCity) el.append(h('button', { class: 'yz-btn gold yz-manage', onclick: () => host.manageCity!(city.id) }, gi('n-city'), 'City Management'));

  const status = h('div', { class: 'yz-chips', style: { marginBottom: '8px' } });
  const y = city.y;
  if (y.mood < 0) status.append(h('span', { class: 'yz-chip war' }, 'Unrest'));
  if (city.resistance > 0) status.append(h('span', { class: 'yz-chip war' }, `Resisting (${city.resistance})`));
  for (const m of civ.modifiers) {
    if (m.cityId === city.id && (m.kind === 'plague' || m.kind === 'drought')) status.append(h('span', { class: 'yz-chip war' }, cap(m.label)));
  }
  if (city.founderId !== city.civId) status.append(h('span', { class: 'yz-chip' }, `Founded by the ${g.civ(city.founderId).name}`));
  status.append(h('span', { class: 'yz-chip' }, `Since Year ${city.founded}`));
  el.append(status);

  if (!own) {
    const st = relationStatus(g, g.player.id, civ.id);
    el.append(h('div', { class: 'yz-grid2' },
      yieldBox('y-defense', 'c-bad', 'Defense', String(y.defense)),
      yieldBox('b-walls', 'c-prod', 'Walls HP', `${city.hp}/${maxCityHp(city)}`)));
    el.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label' }, 'Relations'), h('div', null, STATUS_LABEL[st])));
    if (city.wonders.length) el.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-chips' }, city.wonders.map((w) => h('span', { class: 'yz-chip gold' }, WONDER[w].name)))));
    return el;
  }

  const need = growthNeeded(g, city.size);
  const growTurns = y.foodNet > 0 ? Math.ceil((need - city.food) / y.foodNet) : Infinity;
  el.append(h('div', { class: 'yz-grid3' },
    yieldBox('y-food', 'c-food', 'Food', signed(y.foodNet, y.foodNet % 1 ? 1 : 0), `${fmt(y.food, 1)} produced, ${city.size * 2} eaten`),
    yieldBox('y-prod', 'c-prod', 'Prod.', fmt(y.prod, 1)),
    yieldBox('y-sci', 'c-sci', 'Sci.', fmt(y.sci, 1)),
    yieldBox('y-gold', 'c-gold', 'Gold', fmt(y.gold, 1)),
    yieldBox('y-cult', 'c-cult', 'Cult.', fmt(y.cult, 1)),
    yieldBox(y.mood >= 0 ? 'y-happy' : 'y-sad', y.mood >= 0 ? 'c-mood' : 'c-bad', 'Mood', signed(y.mood), `${y.happy} content vs ${y.unhappy} discontent`)));

  el.append(h('div', { style: { marginTop: '10px' } },
    h('div', { class: 'yz-sub', style: { display: 'flex', justifyContent: 'space-between' } },
      h('span', null, city.size >= sizeCap(city) ? `Size limit ${sizeCap(city)} — build aqueducts and hospitals` : 'Growth'),
      h('span', { class: 'yz-num' }, isFinite(growTurns) ? `${growTurns} yrs` : y.foodNet < 0 ? 'starving' : 'stagnant')),
    h('div', { class: 'yz-progress c-food' }, h('i', { style: { width: `${Math.min(100, (city.food / need) * 100)}%` } }))));

  el.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '6px' } }, 'City focus'),
    h('div', { class: 'yz-seg' }, FOCUS.map((f) => h('button', {
      class: city.focus === f.id ? 'on' : '',
      onclick: () => {
        city.focus = f.id;
        host.click();
        host.refresh();
      },
    }, gi(f.icon), f.label)))));

  // Production
  const prodSec = h('div', { class: 'yz-section' });
  prodSec.append(h('div', { class: 'yz-label' }, 'Production'));
  const convert = city.build?.kind === 'project' && city.build.id.startsWith('conv_');
  if (city.build && convert) {
    prodSec.append(h('div', { style: { marginTop: '4px' } }, h('b', null, itemName(city.build))),
      h('div', { class: 'yz-sub' }, `Turning ${fmt(city.y.prod * 0.5, 1)} production into ${city.build.id === 'conv_gold' ? 'gold' : city.build.id === 'conv_sci' ? 'science' : 'culture'} each year · ${city.manual ? 'chosen by you' : 'chosen by the governor'}`));
  } else if (city.build) {
    const cost = itemCost(g, city, city.build);
    const turns = estimateTurns(g, city, city.build);
    prodSec.append(
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '4px' } },
        h('b', { class: 'yz-withicon' }, gi(itemIcon(city.build.kind, city.build.id)), itemName(city.build)),
        h('span', { class: 'yz-num c-prod' }, city.resistance > 0 ? 'halted' : `${turns} yr${turns === 1 ? '' : 's'}`)),
      h('div', { class: 'yz-progress c-prod' }, h('i', { style: { width: `${Math.min(100, (city.prod / cost) * 100)}%` } })),
      h('div', { class: 'yz-sub' }, city.manual ? 'Chosen by you' : 'Chosen by the city governor'));
  } else prodSec.append(h('div', { class: 'yz-muted' }, 'Nothing.'));
  const bc = buyCost(g, city);
  prodSec.append(h('div', { class: 'yz-actions', style: { marginTop: '8px' } },
    h('button', { class: `yz-btn small${opts.showBuild ? ' active' : ''}`, onclick: opts.toggleBuild }, opts.showBuild ? 'Hide options' : 'Change'),
    bc !== null ? h('button', {
      class: 'yz-btn small', disabled: civ.gold < bc,
      title: civ.gold < bc ? 'Not enough gold' : 'Complete it next turn',
      onclick: () => {
        if (buyItem(g, city)) {
          host.click();
          host.refresh();
        }
      },
    }, svg(ICON.gold), `Buy · ${bc}`) : null,
    city.manual ? h('button', {
      class: 'yz-btn small',
      onclick: () => {
        setBuild(city, governorPick(g, city), false);
        host.refresh();
      },
    }, 'Let governor choose') : null));
  if (opts.showBuild) {
    const options = buildOptions(g, city);
    const groups = ['Units', 'Buildings', 'Wonders', 'Projects'] as const;
    for (const grp of groups) {
      const list = options.filter((o) => o.group === grp);
      if (!list.length) continue;
      prodSec.append(h('div', { class: 'yz-buildgroup' }, h('div', { class: 'yz-label' }, grp),
        h('div', { class: 'yz-buildlist' }, list.map((o) => {
          const on = city.build?.kind === o.item.kind && city.build.id === o.item.id;
          const p = Math.max(0.5, itemProd(g, city, o.item));
          const turns = o.cost === 0 ? 0 : Math.max(1, Math.ceil(((on ? o.cost - city.prod : o.cost)) / p));
          return h('button', {
            class: `yz-builditem${on ? ' on' : ''}`,
            onclick: () => {
              setBuild(city, o.item, true);
              host.click();
              opts.toggleBuild();
            },
          }, h('span', { class: 'n' }, gi(itemIcon(o.item.kind, o.item.id)), o.name), h('span', { class: 't' }, turns ? `${turns} yr${turns === 1 ? '' : 's'}` : 'ongoing'), h('span', { class: 'd' }, o.desc));
        }))));
    }
  }
  el.append(prodSec);

  const blds = h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '6px' } }, 'Buildings'));
  const chips = h('div', { class: 'yz-chips' });
  for (const w of city.wonders) chips.append(h('span', { class: 'yz-chip gold', title: WONDER[w].desc }, gi(`w-${w}`), WONDER[w].name));
  for (const b of city.buildings) chips.append(h('span', { class: 'yz-chip', title: BUILDING[b]?.desc }, gi(`b-${b}`), BUILDING[b]?.name ?? b));
  if (!chips.childNodes.length) chips.append(h('span', { class: 'yz-muted' }, 'None yet.'));
  blds.append(chips);
  el.append(blds);

  el.append(h('div', { class: 'yz-section' }, h('dl', { class: 'yz-kv' },
    h('dt', null, 'Worked tiles'), h('dd', null, `${city.worked.length} (+ city center)`),
    h('dt', null, 'Defense'), h('dd', null, `${y.defense} · ${city.hp}/${maxCityHp(city)} HP`),
    h('dt', null, 'Founded'), h('dd', null, `Year ${city.founded}`),
    h('dt', null, 'Peak size'), h('dd', null, String(city.peakSize)))));
  return el;
}
