import type { IconKey } from '../art';
import { h } from '../../shared/dom';
import type { Renderer } from '../render/renderer';
import { CHALLENGE } from '../sim/challenges';
import type { City } from '../sim/city';
import {
  BUILDING, CAPACITY, LOW_CAP, MAX_LEVEL, MILESTONES, POLICIES, ROADS, Ter, Zone, ZONE_COLOR, ZONE_NAME,
} from '../sim/defs';
import { districtName, floodReach } from '../sim/events';
import { FLAG_ABANDONED, FLAG_FIRE, FLAG_FLOODED, FLAG_POWER, FLAG_SEWER, FLAG_WATER } from '../sim/state';
import { roadCapacity } from '../sim/traffic';
import { chart, gi, meter, pct } from './util';

export type PanelId = 'inspect' | 'report' | 'budget' | 'stats' | 'districts' | 'history' | 'news' | 'challenge';

export interface Host {
  city: City;
  renderer: Renderer;
  jump(i: number): void;
  select(i: number): void;
  /** Taxes or policies changed: refresh the HUD. */
  changed(): void;
  bulldozeBuilding(id: number): void;
}

export const PANELS: Record<PanelId, { title: string; icon: IconKey }> = {
  inspect: { title: 'Inspect', icon: 't-inspect' },
  report: { title: 'City health', icon: 'p-report' },
  budget: { title: 'Budget & policies', icon: 'p-budget' },
  stats: { title: 'Statistics', icon: 'p-stats' },
  districts: { title: 'Districts', icon: 'p-districts' },
  history: { title: 'History', icon: 'p-history' },
  news: { title: 'News', icon: 'p-news' },
  challenge: { title: 'Challenge', icon: 'p-challenge' },
};

const n = (v: number) => Math.round(v).toLocaleString('en-US');

function add(el: HTMLElement, ...kids: (Node | string | null | false | undefined)[]): void {
  for (const k of kids) if (k) el.append(k);
}

function row(label: string, value: string | Node, cls = ''): HTMLElement {
  return h('div', { class: `mc-row ${cls}` }, h('span', null, label), h('b', null, value));
}

function section(title: string, ...children: (Node | null | false)[]): HTMLElement {
  return h('section', { class: 'mc-sec' }, h('h4', null, title), ...children);
}

export function renderPanel(host: Host, id: PanelId, arg = -1): HTMLElement {
  switch (id) {
    case 'inspect': return inspect(host, arg);
    case 'report': return report(host);
    case 'budget': return budget(host);
    case 'stats': return stats(host);
    case 'districts': return districts(host);
    case 'history': return history(host);
    case 'news': return news(host);
    case 'challenge': return challenge(host);
  }
}

// --- Inspector -----------------------------------------------------------------------

function coverage(c: City, i: number): HTMLElement {
  return section('Services',
    meter('Police', c.cov.police[i], true, undefined, 's-police'),
    meter('Fire', c.cov.fire[i], true, undefined, 's-fire'),
    meter('Health', c.cov.health[i], true, undefined, 's-health'),
    meter('Education', c.edu[i] / 3, true, ['None', 'Elementary', 'High school', 'University'][Math.min(3, Math.floor(c.edu[i] + 0.25))], 's-edu'),
    meter('Transit', Math.max(c.cov.transit[i], c.cov.metro[i]), true, undefined, 's-transit'),
    meter('Parks', c.cov.park[i], true, undefined, 's-park'),
  );
}

function environment(c: City, i: number): HTMLElement {
  return section('Neighborhood',
    meter('Land value', c.land[i] / 100, true, undefined, 's-land'),
    meter('Air pollution', c.air[i] / 60, false, `${Math.round(c.air[i])}%`, 's-air'),
    meter('Noise', c.noise[i] / 60, false, `${Math.round(c.noise[i])}%`, 's-noise'),
    meter('Crime', c.crime[i] / 70, false, `${Math.round(c.crime[i])}%`, 's-crime'),
  );
}

function utilities(c: City, i: number): HTMLElement {
  const f = c.s.tiles.flags[i];
  const chip = (ok: boolean, label: string, icon: IconKey) => h('span', { class: `mc-chip ${ok ? 'ok' : 'bad'}` }, gi(icon), label);
  return h('div', { class: 'mc-chips' },
    chip(!!(f & FLAG_POWER), f & FLAG_POWER ? 'Power' : 'No power', 's-power'),
    chip(!!(f & FLAG_WATER), f & FLAG_WATER ? 'Water' : 'No water', 's-water'),
    chip(!!(f & FLAG_SEWER), f & FLAG_SEWER ? 'Sewers' : 'No sewers', 's-sewage'),
    c.access[i] < 0 ? chip(false, 'No road', 't-road') : null,
  );
}

function inspect(host: Host, i: number): HTMLElement {
  const c = host.city;
  if (i < 0) return h('div', { class: 'mc-empty' }, 'Tap a building, road or lot to see what is going on there.');
  const t = c.s.tiles;
  const where = h('p', { class: 'mc-sub' }, `${districtName(c, c.district(i))} · tile ${c.x(i)}, ${c.y(i)}`);
  const out = h('div', { class: 'mc-inspect' });
  if (t.bld[i] >= 0) {
    const b = c.s.buildings[t.bld[i]];
    const def = BUILDING[b.type];
    add(out, 
      h('h3', { class: 'mc-ititle' }, gi(def.icon as IconKey), def.name),
      where,
      h('p', null, def.desc),
      section('Building',
        row('Upkeep', `${c.currency(def.upkeep)} / month`),
        def.power ? row('Power', `${def.power} MW`) : null,
        def.water ? row('Water', `${n(def.water)} people`) : null,
        def.sewage ? row('Sewage', `${n(def.sewage)} people`) : null,
        def.garbage ? row('Garbage', `${n(def.garbage)} people`) : null,
        def.coverage ? row('Reach', `${def.coverage[0].radius} tiles${['police', 'fire', 'health', 'education', 'transit'].includes(def.coverage[0].kind) ? ' by road' : ''}`) : null,
        def.jobs ? row('Jobs', n(def.jobs)) : null,
        row('Built', c.dateLabel(b.built)),
      ),
      utilities(c, i),
      b.type !== 'cityhall' ? h('button', { class: 'mc-btn danger', onclick: () => host.bulldozeBuilding(b.id) }, gi('t-bulldoze'), `Demolish (${c.currency(Math.round(def.cost * 0.05))})`) : null,
    );
    if (b.type === 'cityhall') out.append(cityCard(host));
    return out;
  }
  if (t.road[i]) {
    const def = ROADS[t.road[i]];
    const cap = roadCapacity(c, i);
    const cong = c.congestion[i];
    add(out, 
      h('h3', { class: 'mc-ititle' }, gi('t-road'), t.ter[i] === Ter.Water ? `${def.name} bridge` : def.name),
      where,
      section('Traffic',
        meter('Congestion', Math.min(1, cong / 1.2), false, pct(cong)),
        row('Peak-hour flow', `${n(c.flow[i])} vehicles`),
        row('Capacity', `${n(cap)} vehicles`),
        row('Speed', cong < 0.7 ? 'Free flowing' : cong < 1 ? 'Busy' : cong < 1.4 ? 'Congested' : 'Gridlock'),
      ),
      h('p', { class: 'mc-hint' }, 'Drag a bigger road over this one to upgrade it.'),
    );
    if (t.flags[i] & FLAG_FLOODED) out.append(h('p', { class: 'mc-warn' }, 'Flooded: traffic crawls through the water.'));
    return out;
  }
  const z = t.zone[i];
  if (z) {
    const lv = t.level[i];
    const res = z === Zone.Res;
    const cap = lv ? CAPACITY[z][lv] : 0;
    const maxLv = t.dense[i] ? MAX_LEVEL[z] : Math.min(MAX_LEVEL[z], LOW_CAP);
    const f = t.flags[i];
    const status: string[] = [];
    if (f & FLAG_ABANDONED) status.push('Abandoned');
    if (f & FLAG_FIRE) status.push('On fire!');
    if (f & FLAG_FLOODED) status.push('Flooded');
    add(out, 
      h('h3', { class: 'mc-ititle' }, h('i', { class: 'mc-swatch', style: { background: ZONE_COLOR[z] } }), `${ZONE_NAME[z]}${t.dense[i] ? ' · dense' : ''}`),
      where,
      status.length ? h('p', { class: 'mc-warn' }, status.join(' · ')) : null,
      lv
        ? section(levelName(z, lv),
          h('div', { class: 'mc-stars' }, ...Array.from({ length: maxLv }, (_, k) => h('i', { class: k < lv ? 'on' : '' }))),
          row(res ? 'Residents' : 'Jobs', `${n(t.occ[i])} / ${n(cap)}`),
          res ? row('Happiness', `${Math.round(c.happy[i])}%`) : null,
          res ? row('Commute', `${Math.round(c.distCommute[c.district(i)])} min`) : null,
          lv < maxLv ? h('p', { class: 'mc-hint' }, growHint(c, i)) : h('p', { class: 'mc-hint' }, t.dense[i] ? 'Fully grown.' : 'Low-density zoning caps this lot. Rezone as dense to let it grow taller.'),
        )
        : h('p', { class: 'mc-hint' }, emptyHint(c, i)),
      utilities(c, i),
      environment(c, i),
      coverage(c, i),
    );
    return out;
  }
  const terName = ['Water', 'Beach', 'Meadow', 'Forest', 'Rock'][t.ter[i]];
  add(out, 
    h('h3', { class: 'mc-ititle' }, terName),
    where,
    t.ter[i] === Ter.Water ? h('p', null, 'Bridges cost five times as much as roads.') : environment(c, i),
    t.ter[i] !== Ter.Water ? row('Elevation', `${Math.round((t.elev[i] - 40) * 2)} m`) : null,
  );
  return out;
}

function levelName(z: number, lv: number): string {
  const names: Record<number, string[]> = {
    [Zone.Res]: ['', 'Cottage', 'Townhouses', 'Apartments', 'Mid-rise', 'Residential tower'],
    [Zone.Com]: ['', 'Corner shop', 'Shop row', 'Department store', 'Commercial tower', 'Skyscraper'],
    [Zone.Ind]: ['', 'Workshop', 'Warehouse', 'Factory', 'Heavy industry'],
    [Zone.Off]: ['', 'Small office', 'Office block', 'Office tower', 'Corporate tower', 'Headquarters'],
  };
  return `Level ${lv} · ${names[z][lv]}`;
}

function emptyHint(c: City, i: number): string {
  const t = c.s.tiles;
  if (c.access[i] < 0) return 'Nothing will grow here: it is too far from a road.';
  if (!(t.flags[i] & FLAG_POWER)) return 'Waiting for power. Connect a power plant to this road network.';
  const dem = c.s.last.demand[t.zone[i] - 1];
  if (dem <= 0.05) return 'Zoned, but there is no demand for this kind of building right now.';
  return 'Zoned and connected: a building should appear soon.';
}

function growHint(c: City, i: number): string {
  const t = c.s.tiles;
  const lv = t.level[i];
  if (!(t.flags[i] & FLAG_WATER)) return 'Needs water to grow.';
  if (lv >= 2 && !(t.flags[i] & FLAG_SEWER)) return 'Needs sewage treatment to grow taller.';
  if (t.zone[i] === Zone.Off && c.edu[i] < lv * 0.55) return 'Offices need educated workers: build schools nearby.';
  const req = [0, 0, 22, 36, 52, 66][lv + 1];
  if (c.land[i] < req) return `Land value is ${Math.round(c.land[i])}; level ${lv + 1} needs ${req}. Parks, services and transit help.`;
  if (c.s.last.demand[t.zone[i] - 1] <= 0.12) return 'Will grow when demand picks up.';
  return 'Growing.';
}

function cityCard(host: Host): HTMLElement {
  const c = host.city;
  const m = MILESTONES[c.s.milestone];
  const next = MILESTONES[c.s.milestone + 1];
  return section(`${c.s.settings.name} · ${m.name}`,
    next ? meter(`Next: ${next.name}`, c.s.last.pop / next.pop, true, `${n(c.s.last.pop)} / ${n(next.pop)}`) : h('p', null, 'The city has reached its final stage.'),
    next ? h('p', { class: 'mc-hint' }, `Unlocks: ${next.blurb}`) : null,
  );
}

// --- City health report -----------------------------------------------------------

const FACTOR_ICON: Record<string, IconKey> = {
  health: 's-health', education: 's-edu', safety: 's-police', parks: 's-park', landvalue: 's-land', commute: 's-traffic',
  air: 's-air', noise: 's-noise', power: 's-power', water: 's-water', sewage: 's-sewage', garbage: 's-garbage',
  taxes: 's-money', jobs: 's-jobs', pride: 'b-stadium', heat: 'd-heat', disease: 'd-virus',
};

interface DistrictStat {
  d: number;
  name: string;
  pop: number;
  jobs: number;
  land: number;
  happy: number;
  crime: number;
  air: number;
  health: number;
  traffic: number;
  tile: number;
}

export function districtStats(c: City): DistrictStat[] {
  const D = c.dw * c.dh;
  const acc = Array.from({ length: D }, (_, d) => ({ d, name: '', pop: 0, jobs: 0, land: 0, happy: 0, crime: 0, air: 0, health: 0, traffic: 0, tile: -1, lots: 0, roads: 0 }));
  const t = c.s.tiles;
  for (let i = 0; i < c.n; i++) {
    const a = acc[c.district(i)];
    if (t.road[i]) {
      a.traffic += c.congestion[i];
      a.roads++;
    }
    if (!t.zone[i] || !t.level[i]) continue;
    const occ = t.occ[i];
    if (t.zone[i] === Zone.Res) {
      a.pop += occ;
      a.happy += c.happy[i] * occ;
      a.health += Math.min(1, c.cov.health[i]) * occ;
    } else a.jobs += occ;
    a.land += c.land[i];
    a.crime += c.crime[i];
    a.air += c.air[i];
    a.lots++;
    if (a.tile < 0) a.tile = i;
  }
  return acc
    .filter((a) => a.pop + a.jobs > 0 && c.s.districtNames[a.d])
    .map((a) => ({
      d: a.d,
      name: c.s.districtNames[a.d],
      pop: a.pop,
      jobs: a.jobs,
      land: a.lots ? a.land / a.lots : 0,
      happy: a.pop ? a.happy / a.pop : 0,
      crime: a.lots ? a.crime / a.lots : 0,
      air: a.lots ? a.air / a.lots : 0,
      health: a.pop ? a.health / a.pop : 0,
      traffic: a.roads ? a.traffic / a.roads : 0,
      tile: c.idx((a.d % c.dw) * c.dsz + (c.dsz >> 1), Math.floor(a.d / c.dw) * c.dsz + (c.dsz >> 1)),
    }));
}

function recommendations(c: City): string[] {
  const L = c.s.last;
  const out: string[] = [];
  if (L.power[1] > L.power[0]) out.push(`The city needs ${L.power[1]} MW but makes ${L.power[0]} MW. Build a power plant on the same road network.`);
  if (L.water[1] > L.water[0]) out.push('Water demand exceeds supply. Build a water tower, or a pump on the shore.');
  if (L.pop > 2000 && L.sewage[1] > L.sewage[0]) out.push('Sewage is untreated, so homes cannot grow past level 2. Build a sewage treatment plant.');
  if (c.garbageShortage > 0.1) out.push('Garbage is piling up. Build a landfill, incinerator or recycling center.');
  const ds = districtStats(c).filter((d) => d.pop > 100);
  const worst = <K extends keyof DistrictStat>(k: K, hi = true) => [...ds].sort((a, b) => (hi ? (b[k] as number) - (a[k] as number) : (a[k] as number) - (b[k] as number)))[0];
  for (const f of c.factors.slice(0, 5)) {
    if (f.value > -1.5) break;
    if (f.key === 'commute') {
      const d = [...ds].sort((a, b) => c.distCommute[b.d] - c.distCommute[a.d])[0];
      out.push(`Commutes are long${d ? `, worst in ${d.name} (${Math.round(c.distCommute[d.d])} min)` : ''}. Add bus stops or a metro station there, or upgrade the busiest streets to avenues.`);
    } else if (f.key === 'jobs') out.push(`Unemployment is ${pct(L.workers ? 1 - L.employed / L.workers : 0)}. Zone more commercial, industrial or office land.`);
    else if (f.key === 'safety') {
      const d = worst('crime');
      out.push(`Crime is high${d ? ` in ${d.name}` : ''}. Build a police station there.`);
    } else if (f.key === 'health' || f.key === 'disease') {
      const d = worst('health', false);
      out.push(`Many homes have no clinic nearby${d ? `, especially in ${d.name}` : ''}. Build a clinic or hospital.`);
    } else if (f.key === 'education') out.push('Schools are missing. Educated workers also unlock offices.');
    else if (f.key === 'air') out.push('Smog is hurting residents. Keep industry downwind of homes, plant parks, or adopt the Green City policy.');
    else if (f.key === 'noise') out.push('Homes are noisy. Parks and quieter streets between homes and highways help.');
    else if (f.key === 'taxes') out.push('Residents feel over-taxed. Lower the residential rate if the budget allows.');
    else if (f.key === 'water' || f.key === 'power' || f.key === 'sewage' || f.key === 'garbage') continue;
    else if (f.key === 'heat') out.push('The heat wave hits treeless streets hardest. Parks cool neighborhoods.');
  }
  if (L.traffic > 1 && !out.some((s) => s.startsWith('Commutes'))) out.push('Main roads are over capacity. Upgrade them, add parallel routes, or invest in transit.');
  if (c.s.money < 0) out.push('The city is in debt. Raise taxes or demolish costly services.');
  const t = c.s.tiles;
  let risk = 0;
  for (const i of floodReach(c, 125)) if (t.level[i]) risk++;
  if (risk > 15) out.push(`${risk} buildings sit on low ground that floods in heavy rain. Build flood walls along the water or stormwater drains.`);
  if (!out.length) out.push('The city is in good shape. Keep growing!');
  return out.slice(0, 5);
}

function report(host: Host): HTMLElement {
  const c = host.city;
  const L = c.s.last;
  const neg = c.factors.filter((f) => f.value < 0);
  const pos = c.factors.filter((f) => f.value > 0).reverse();
  const fRow = (f: { key: string; label: string; value: number }) =>
    h('div', { class: `mc-factor ${f.value < 0 ? 'neg' : 'pos'}` }, gi(FACTOR_ICON[f.key] ?? 'u-info'), h('span', null, f.label), h('b', null, `${f.value > 0 ? '+' : '−'}${Math.abs(f.value).toFixed(1)}`));
  const bal = (label: string, pair: [number, number], icon: IconKey, unit = '') =>
    meter(label, pair[0] ? pair[1] / pair[0] : pair[1] ? 1.5 : 0, false, `${n(pair[1])}${unit} / ${n(pair[0])}${unit}`, icon);
  return h('div', null,
    h('div', { class: 'mc-bigstat' }, gi('s-happy'), h('b', null, `${Math.round(L.happy)}%`), h('span', null, 'happiness')),
    L.pop ? null : h('p', { class: 'mc-hint' }, 'Nobody lives here yet. Build a road, zone some residential land and connect power.'),
    neg.length ? section('Main causes', ...neg.map(fRow)) : null,
    pos.length ? section('Positive', ...pos.map(fRow)) : null,
    section('Recommended', h('ul', { class: 'mc-recs' }, ...recommendations(c).map((r) => h('li', null, r)))),
    section('Utilities (use / supply)',
      bal('Power', L.power, 's-power', ' MW'),
      bal('Water', L.water, 's-water'),
      bal('Sewage', L.sewage, 's-sewage'),
      bal('Garbage', L.garbage, 's-garbage'),
    ),
    h('p', { class: 'mc-hint' }, 'The report explains; it never fixes anything for you.'),
  );
}

// --- Budget -------------------------------------------------------------------------

function budget(host: Host): HTMLElement {
  const c = host.city;
  const wrap = h('div');
  const draw = () => {
    wrap.textContent = '';
    const tx = c.s.taxes;
    const taxRow = (key: keyof typeof tx, label: string, color: string) =>
      h('div', { class: 'mc-tax' },
        h('i', { class: 'mc-swatch', style: { background: color } }),
        h('span', null, label),
        h('button', { class: 'mc-step', 'aria-label': `Lower ${label} tax`, onclick: () => { tx[key] = Math.max(0, tx[key] - 1); host.changed(); draw(); } }, '−'),
        h('b', null, `${tx[key]}%`),
        h('button', { class: 'mc-step', 'aria-label': `Raise ${label} tax`, onclick: () => { tx[key] = Math.min(20, tx[key] + 1); host.changed(); draw(); } }, '+'),
      );
    const b = c.s.budget;
    const table = (title: string, rows: Record<string, number>) => {
      const entries = Object.entries(rows).filter(([, v]) => Math.abs(v) >= 0.5).sort((a, b2) => b2[1] - a[1]);
      const total = entries.reduce((a, [, v]) => a + v, 0);
      return section(title, ...entries.map(([k, v]) => row(k, c.currency(v))), row('Total', c.currency(total), 'total'));
    };
    const net = c.s.last.income - c.s.last.expense;
    wrap.append(
      h('div', { class: 'mc-bigstat' }, gi('s-money'), h('b', null, c.currency(c.s.money)), h('span', { class: net >= 0 ? 'up' : 'down' }, `${net >= 0 ? '+' : '−'}${c.currency(Math.abs(net))} / month`)),
      section('Taxes',
        taxRow('res', 'Residential', ZONE_COLOR[1]),
        taxRow('com', 'Commercial', ZONE_COLOR[2]),
        taxRow('ind', 'Industrial', ZONE_COLOR[3]),
        taxRow('off', 'Office', ZONE_COLOR[4]),
        h('p', { class: 'mc-hint' }, 'Higher taxes raise money but slow demand and lower happiness. 9% is neutral.'),
      ),
      table('Income', b.income),
      table('Expenses', b.expense),
      section('Policies', ...POLICIES.map((p) => {
        const locked = c.s.milestone < p.unlock;
        const on = !!c.s.policies[p.id];
        const cost = (p.cost * c.s.last.pop) / 1000;
        return h('label', { class: `mc-policy ${locked ? 'locked' : ''}` },
          h('input', {
            type: 'checkbox', checked: on, disabled: locked,
            onchange: (e: Event) => {
              c.s.policies[p.id] = (e.target as HTMLInputElement).checked;
              if (c.s.policies[p.id]) c.history('policy', 1, `${c.s.settings.name} adopts the ${p.name} policy.`);
              c.dirtyCov = true;
              host.changed();
              draw();
            },
          }),
          h('span', null, h('b', null, p.name), h('small', null, locked ? `Unlocks at ${MILESTONES[p.unlock].name}` : `${p.desc}${p.cost ? ` · ${c.currency(cost)}/mo` : ''}`)),
        );
      })),
    );
  };
  draw();
  return wrap;
}

// --- Statistics --------------------------------------------------------------------

function stats(host: Host): HTMLElement {
  const c = host.city;
  const S = c.s.samples;
  const L = c.s.last;
  const yearAgo = S.length > 12 ? S[S.length - 13] : S[0];
  const growth = yearAgo && yearAgo.pop ? L.pop / yearAgo.pop - 1 : 0;
  let land = 0;
  let lots = 0;
  let health = 0;
  let edu = 0;
  let res = 0;
  const t = c.s.tiles;
  for (let i = 0; i < c.n; i++) {
    if (!t.level[i]) continue;
    land += c.land[i];
    lots++;
    if (t.zone[i] === Zone.Res) {
      health += Math.min(1, c.cov.health[i]) * t.occ[i];
      edu += Math.min(1, c.edu[i] / 2) * t.occ[i];
      res += t.occ[i];
    }
  }
  const unemp = L.workers ? 1 - L.employed / L.workers : 0;
  const graph = (title: string, key: keyof (typeof S)[number], color: string, fmt?: (v: number) => string, zero = false) =>
    section(title, chart(S.map((s) => s[key] as number), color, { fmt, zero }));
  return h('div', null,
    section('City overview',
      row('Population', n(L.pop)),
      row('Growth (12 months)', `${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(1)}%`),
      row('Jobs', n(L.jobs)),
      row('Unemployment', pct(unemp)),
      row('Average commute', `${Math.round(L.commute)} min`),
      row('Public transit share', pct(L.transitShare)),
      row('Road congestion', pct(L.traffic)),
      row('Air pollution', `${Math.round(L.air)}%`),
      row('Average land value', lots ? String(Math.round(land / lots)) : '—'),
      row('Homes near health care', res ? pct(health / res) : '—'),
      row('Educated residents', res ? pct(edu / res) : '—'),
    ),
    graph('Population', 'pop', '#3d7be0', (v) => n(v)),
    graph('Treasury', 'money', '#2e9d5b', (v) => c.currency(v), true),
    graph('Happiness', 'happy', '#e0a21b', (v) => `${Math.round(v)}%`),
    graph('Commute (minutes)', 'commute', '#d0503c', (v) => v.toFixed(0)),
    graph('Air pollution', 'air', '#7d6bb0', (v) => `${v.toFixed(0)}%`),
    graph('Unemployment', 'unemployment', '#8a5a3c', (v) => pct(v)),
  );
}

// --- Districts -----------------------------------------------------------------------

function districts(host: Host): HTMLElement {
  const c = host.city;
  const ds = districtStats(c).sort((a, b) => b.pop + b.jobs - a.pop - a.jobs);
  if (!ds.length) return h('div', { class: 'mc-empty' }, 'Districts are named as neighborhoods fill up.');
  const money = (v: number) => '₹₹₹₹₹'.slice(0, Math.max(1, Math.min(5, Math.round(v / 20)))).replace(/₹/g, c.s.settings.region === 'india' ? '₹' : '$');
  return h('div', { class: 'mc-districts' },
    h('p', { class: 'mc-hint' }, 'Neighborhoods name themselves as they grow. Tap one to fly there.'),
    ...ds.map((d) => h('button', { class: 'mc-district', onclick: () => host.jump(d.tile) },
      h('b', null, d.name),
      h('span', null, `${n(d.pop)} people · ${n(d.jobs)} jobs`),
      h('span', null, `Land ${money(d.land)} · Happy ${d.pop ? `${Math.round(d.happy)}%` : '—'} · Traffic ${pct(d.traffic)} · Air ${Math.round(d.air)}%`),
    )),
  );
}

// --- History and news ----------------------------------------------------------------

const KIND_ICON: Record<string, IconKey> = {
  founding: 'b-cityhall', milestone: 'p-challenge', disaster: 'd-rain', first: 'u-info', population: 's-pop', economy: 's-money',
  skyline: 'z-off', policy: 'p-policy', challenge: 'p-challenge',
};

function history(host: Host): HTMLElement {
  const c = host.city;
  const byYear = new Map<number, typeof c.s.history>();
  for (const e of c.s.history) {
    const y = Math.floor(e.tick / 12);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(e);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  return h('div', { class: 'mc-history' },
    h('p', { class: 'mc-hint' }, `The story of ${c.s.settings.name}, written as it happens.`),
    ...years.map((y) => h('div', { class: 'mc-year' },
      h('h4', null, `Year ${y}`),
      ...byYear.get(y)!.map((e) => h('div', { class: `mc-event imp${e.imp}`, onclick: e.tile >= 0 ? () => host.jump(e.tile) : undefined },
        gi(KIND_ICON[e.kind] ?? 'p-history'), h('span', null, e.text))),
    )),
  );
}

const NEWS_ICON: Record<string, IconKey> = { news: 'p-news', story: 's-pop', warning: 'u-info', disaster: 'd-rain', milestone: 'p-challenge' };

function news(host: Host): HTMLElement {
  const c = host.city;
  const items = [...c.s.news].reverse();
  if (!items.length) return h('div', { class: 'mc-empty' }, 'No news yet. Give it a few months.');
  return h('div', { class: 'mc-news-list' },
    ...items.map((it) => h('div', { class: `mc-newsitem ${it.kind}`, onclick: it.tile >= 0 ? () => host.jump(it.tile) : undefined },
      gi(NEWS_ICON[it.kind] ?? 'p-news'),
      h('span', null, h('small', null, c.dateLabel(it.tick)), it.text),
    )),
  );
}

function challenge(host: Host): HTMLElement {
  const c = host.city;
  const id = c.s.settings.challenge;
  const ch = id ? CHALLENGE[id] : null;
  if (!ch) return h('div', { class: 'mc-empty' }, 'This city is a sandbox. Start a challenge from the main menu.');
  const p = ch.progress(c);
  const done = c.s.challengeDone;
  return h('div', null,
    h('h3', { class: 'mc-ititle' }, gi('p-challenge'), ch.name),
    h('p', null, ch.brief),
    section('Goal', h('p', null, ch.goal), meter('Progress', p.value, true), h('p', { class: 'mc-hint' }, p.text)),
    done >= 0 ? h('p', { class: 'mc-good' }, `Completed in ${c.dateLabel(done)}. You can keep building.`) : done === -2 ? h('p', { class: 'mc-warn' }, 'Challenge failed. The city lives on as a sandbox.') : null,
  );
}
