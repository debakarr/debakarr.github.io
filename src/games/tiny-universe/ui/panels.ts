// Side-panel content: inspect (star / planet / civilization), the
// Observatory, life and civilizations, cosmic history and your profile.

import { h } from '../../shared/dom';
import { icons, type IconKey } from '../art';
import { alive, CIV_TRAIT_LABEL, CIV_TRAITS, describePersonality, ERA_INDEX, eraName, type Civ } from '../sim/civ';
import { ACHIEVEMENTS, DISCOVERIES, type Category } from '../sim/discoveries';
import { living, STAGE_NAME, type Biosphere, type Lineage } from '../sim/life';
import { GOALS } from '../sim/params';
import { atmosphereLabel, kindOf, PLANET_STRIDE } from '../sim/planets';
import { describeStar, Phase, PHASE_NAME, spectralClass } from '../sim/stars';
import type { Intervention, Target } from '../sim/universe';
import { planetPortrait } from '../render/planet';
import type { App } from './app';
import { fmtAge, fmtAgo, fmtPop, fmtYears, pct } from './format';

export type PanelId = 'inspect' | 'observatory' | 'life' | 'history' | 'profile';

export const PANEL_TITLE: Record<PanelId, string> = {
  inspect: 'Inspect',
  observatory: 'Observatory',
  life: 'Life & civilizations',
  history: 'Cosmic history',
  profile: 'Your cosmic profile',
};

export function gi(key: IconKey, cls = 'tu-gi'): HTMLElement {
  return h('span', { class: cls, html: icons.svg(key) });
}

function bar(v: number, color?: string): HTMLElement {
  return h('span', { class: 'tu-bar' }, h('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`, background: color } }));
}

function row(label: string, value: string | Node): HTMLElement {
  return h('div', { class: 'tu-row' }, h('span', null, label), h('b', null, value));
}

function link(text: string, fn: () => void): HTMLElement {
  return h('button', { class: 'tu-link', onclick: fn }, text);
}

export function renderPanel(app: App, id: PanelId): HTMLElement {
  switch (id) {
    case 'inspect':
      return inspect(app);
    case 'observatory':
      return observatory(app);
    case 'life':
      return lifePanel(app);
    case 'history':
      return history(app);
    case 'profile':
      return profile(app);
  }
}

// --- Inspect -------------------------------------------------------------------------------------

function inspect(app: App): HTMLElement {
  const { sel } = app;
  if (sel.planet >= 0) return planetPage(app, sel.planet);
  if (sel.civ >= 0) {
    const c = app.u.civ(sel.civ);
    if (c) return civPage(app, c, true);
  }
  if (sel.star >= 0) return starPage(app, sel.star);
  return h('div', null, h('p', { class: 'tu-hint' }, 'Tap a star to inspect it. Tap it again, or use View system, to see its planets.'));
}

function actions(app: App, list: [Intervention, string, IconKey, Target, boolean?][]): HTMLElement {
  return h('div', { class: 'tu-acts' }, ...list.map(([kind, label, icon, target, danger]) => {
    const why = app.u.canIntervene(kind, target);
    return h('button', {
      class: `tu-act${danger ? ' danger' : ''}`,
      disabled: !!why,
      title: why ?? label,
      'data-act': kind,
      onclick: () => app.act(kind, target, danger ? label : undefined),
    }, gi(icon), h('span', null, label));
  }));
}

function starPage(app: App, i: number): HTMLElement {
  const u = app.u;
  const s = u.s;
  const ph = s.sphase[i] as Phase;
  const m = s.sm[i];
  const age = s.t - s.sborn[i];
  const temp = u.starTemp(i);
  const planets = u.planets[i] ?? [];
  const left = s.slife[i] - age;
  return h('div', null,
    h('div', { class: 'tu-head' }, gi('u-star', 'tu-gi big'), h('div', null, h('h3', null, u.names[i]), h('p', null, describeStar(m, ph)))),
    h('div', { class: 'tu-grid' },
      row('Mass', `${m.toFixed(2)} suns`),
      row('Age', fmtYears(age * 1e6)),
      row('Phase', PHASE_NAME[ph]),
      row('Temperature', ph === Phase.BlackHole ? '—' : `${Math.round(temp).toLocaleString('en-US')} K${ph <= Phase.Giant ? ` (${spectralClass(temp)})` : ''}`),
      row('Luminosity', `${u.starLum(i) < 0.01 ? u.starLum(i).toFixed(4) : u.starLum(i) < 10 ? u.starLum(i).toFixed(2) : Math.round(u.starLum(i)).toLocaleString('en-US')} suns`),
      row('Heavy elements', `${Math.round(s.sz[i] * 100)}% of the Sun`),
      ph <= Phase.Giant ? row('Time left', left > 0 ? fmtYears(left * 1e6) : 'Dying') : null,
      row('Planets', String(planets.length)),
    ),
    s.sz[i] < 0.05 && planets.length ? h('p', { class: 'tu-hint' }, 'Born before many stars had died, it lacks the heavy elements that rocky planets are made of.') : null,
    planets.length ? h('button', { class: 'tu-btn primary wide', onclick: () => app.enterSystem(i) }, gi('u-system'), 'View system') : null,
    planets.length ? h('h4', null, 'Planets') : null,
    ...planets.map((p) => {
      const st = s.ps[p.id];
      const lifeTag = st?.life && st.life.dead < 0 ? h('em', { class: 'tag life' }, STAGE_NAME[st.life.stage]) : null;
      const civTag = st?.civ ? h('em', { class: 'tag civ' }, u.civ(st.civ)?.adj ?? 'Civilization') : null;
      return h('button', { class: 'tu-item', onclick: () => app.selectPlanet(p.id) },
        h('span', { class: 'tu-dot', style: { background: dotColor(app, p.id) } }),
        h('span', { class: 'grow' }, h('b', null, p.name), h('small', null, `${u.kindName(p.id)} · ${Math.round(u.planetTemp(p) - 273)}°C`)),
        lifeTag, civTag);
    }),
    h('h4', null, 'Intervene'),
    actions(app, [['nova', 'Make it explode', 't-nova', { star: i }, true]]),
  );
}

function dotColor(app: App, pid: number): string {
  const p = app.u.planet(pid)!;
  if (app.u.s.ps[pid]?.gone) return '#5a4a40';
  const k = kindOf(p, app.u.planetTemp(p));
  return { lava: '#d6603a', desert: '#cda870', ocean: '#3470cc', terran: '#4a9678', ice: '#d6e6f0', gas: '#d6aa78', icegiant: '#7ebedc', barren: '#8c847c' }[k];
}

function planetPage(app: App, pid: number): HTMLElement {
  const u = app.u;
  const s = u.s;
  const p = u.planet(pid);
  if (!p) return h('p', { class: 'tu-hint' }, 'That world is gone.');
  const st = s.ps[pid];
  const temp = u.planetTemp(p);
  const hab = u.habNow(pid);
  const b = st?.life;
  const civ = st?.civ ? u.civ(st.civ) : undefined;
  const portrait = planetPortrait({ planet: p, kind: kindOf(p, temp), temp, life: b && b.dead < 0 ? b.stage : 0, civEra: civ ? civ.era : -1, oxygen: b?.oxygen ?? 0, gone: !!st?.gone }, 132);
  const pc = h('canvas', { class: 'tu-portrait', width: '132', height: '132' });
  pc.getContext('2d')!.drawImage(portrait, 0, 0);
  const water = p.body === 'gas' ? '—' : pct(kindOf(p, temp) === 'desert' || temp > 373 ? 0 : p.water);
  return h('div', null,
    h('div', { class: 'tu-planethead' }, pc, h('div', null,
      h('h3', null, p.name),
      h('p', null, u.kindName(pid)),
      link(`Orbits ${u.names[p.star]}`, () => app.selectStar(p.star)),
      h('div', { class: 'tu-habit' }, h('span', null, 'Habitability'), bar(hab, hab > 0.6 ? '#6fe39a' : hab > 0.25 ? '#d7c86a' : '#c46a5a'), h('b', null, pct(hab))),
    )),
    h('div', { class: 'tu-grid' },
      row('Mass', `${p.mass < 10 ? p.mass.toFixed(2) : Math.round(p.mass)} Earths`),
      row('Orbit', `${p.a < 1 ? p.a.toFixed(2) : p.a.toFixed(1)} AU`),
      row('Temperature', `${Math.round(temp - 273)}°C`),
      row('Water', water),
      row('Air', atmosphereLabel(p, temp, b?.oxygen ?? 0)),
      row('Magnetic field', p.body === 'gas' ? 'Strong' : p.magnetic > 0.6 ? 'Strong' : p.magnetic > 0.25 ? 'Weak' : 'None'),
    ),
    b ? lifeSection(app, pid, b) : null,
    civ ? civPage(app, civ, false) : null,
    st?.ruins?.length ? h('div', null, h('h4', null, 'Ruins'), ...st.ruins.map((r) => h('div', { class: 'tu-ruin' }, gi('u-ruins'), h('span', { class: 'grow' }, h('b', null, `${r.civ}`), h('small', null, `${r.eraName} era · ${fmtAgo(r.t, s.t)}${r.studied ? ` · ${r.artifact}, studied` : ''}`))))) : null,
    h('h4', null, 'Intervene'),
    actions(app, [
      ['seed', 'Seed life', 't-seed', { planet: pid }],
      ['warm', 'Warm', 't-warm', { planet: pid }],
      ['cool', 'Cool', 't-cool', { planet: pid }],
      ['study', 'Study ruins', 't-investigate', { planet: pid }],
      ['asteroid', 'Asteroid', 't-asteroid', { planet: pid }, true],
    ]),
    st?.log?.length ? h('div', null, h('h4', null, 'History'), h('ol', { class: 'tu-log' }, ...[...st.log].reverse().slice(0, 14).map(([t, text]) => h('li', null, h('small', null, fmtAgo(t, s.t)), text)))) : null,
  );
}

function lifeSection(app: App, pid: number, b: Biosphere): HTMLElement {
  const s = app.u.s;
  const alive = living(b);
  return h('div', null,
    h('h4', null, 'Life'),
    b.dead >= 0
      ? h('p', { class: 'tu-hint' }, `Life here died out ${fmtAgo(b.dead, s.t).toLowerCase()}.`)
      : h('div', { class: 'tu-grid' },
          row('Stage', STAGE_NAME[b.stage]),
          row('Species groups', String(alive.length)),
          row('Oxygen', pct(b.oxygen)),
          row('Since', fmtAgo(b.origin, s.t)),
          b.massExtinctions ? row('Mass extinctions', String(b.massExtinctions)) : null,
          b.seeded ? row('Origin', 'Seeded by you') : null,
        ),
    h('details', { class: 'tu-tree', open: app.treeOpen.has(pid), ontoggle: (e: Event) => ((e.target as HTMLDetailsElement).open ? app.treeOpen.add(pid) : app.treeOpen.delete(pid)) },
      h('summary', null, 'Tree of life'),
      tree(b, s.t)),
  );
}

function tree(b: Biosphere, now: number): HTMLElement {
  const kids = new Map<number, Lineage[]>();
  for (const l of b.lineages) {
    const arr = kids.get(l.parent) ?? [];
    arr.push(l);
    kids.set(l.parent, arr);
  }
  const ids = new Set(b.lineages.map((l) => l.id));
  const roots = b.lineages.filter((l) => l.parent < 0 || !ids.has(l.parent));
  const out: HTMLElement[] = [];
  const walk = (l: Lineage, depth: number) => {
    out.push(h('div', { class: `tu-node${l.died >= 0 ? ' dead' : ''} s${l.stage}`, style: { paddingLeft: `${Math.min(depth, 9) * 12}px` } },
      h('span', null, `${depth ? '└ ' : ''}${l.name}`),
      h('small', null, l.died >= 0 ? `† ${fmtAgo(l.died, now).toLowerCase()}` : `${fmtAgo(l.born, now).replace(' ago', '')} old`)));
    for (const k of kids.get(l.id) ?? []) walk(k, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return h('div', { class: 'tu-treebody' }, ...out);
}

function civStatus(c: Civ): string {
  return { rising: 'Rising', golden: 'Golden age', dark: 'Dark age', expanding: 'Expanding', quiet: 'Quiet', extinct: 'Extinct', silent: 'Gone silent', ascended: 'Galactic', merged: 'Merged' }[c.status];
}

function civPage(app: App, c: Civ, full: boolean): HTMLElement {
  const u = app.u;
  const s = u.s;
  const lived = ((alive(c) ? s.t : c.ended) - c.born) * 1e6;
  const home = u.planet(c.planet);
  const watcher = ['', 'They worship you as The Watcher.', 'Their scientists suspect you exist.', 'They are trying to talk to you.'][c.watcherStage];
  return h('div', { class: 'tu-civ', style: { '--hue': String(c.hue) } },
    h('h4', null, 'Civilization'),
    h('div', { class: 'tu-civhead' }, gi('u-civ', 'tu-gi big'), h('div', null, h('h3', null, c.name), h('p', null, `${c.species} · ${describePersonality(c.traits)}`))),
    h('div', { class: 'tu-grid' },
      row('Era', `${eraName(c)}${alive(c) && c.eras[c.era + 1] ? ` (${pct(c.progress)})` : ''}`),
      row('Status', civStatus(c)),
      row(alive(c) ? 'Age' : 'Lasted', fmtYears(lived)),
      row('Population', alive(c) ? fmtPop(c.pop) : '—'),
      row('Worlds', String(alive(c) ? 1 + c.colonies.length : 0)),
      c.darkAges ? row('Dark ages', String(c.darkAges)) : null,
      c.protectedUntil >= s.t ? row('Protected', c.protectedUntil > 1e9 ? 'Forever' : `${fmtYears((c.protectedUntil - s.t) * 1e6)} more`) : null,
    ),
    watcher ? h('p', { class: 'tu-watcher' }, gi('u-eye'), watcher) : null,
    h('div', { class: 'tu-traits' }, ...CIV_TRAITS.map((k) => h('div', { class: 'tu-trait' }, h('span', null, CIV_TRAIT_LABEL[k]), bar(c.traits[k], `hsl(${c.hue},70%,62%)`)))),
    h('p', { class: 'tu-hint' }, `Their path: ${c.eras.slice(0, Math.max(c.peak + 2, 8)).join(' → ')}${c.peak + 2 < c.eras.length ? ' → …' : ''}`),
    alive(c) ? h('div', null, h('h4', null, s.endgame === 'threat' ? 'The threat' : 'Influence'), actions(app, [
      ['knowledge', 'Share knowledge', 't-knowledge', { civ: c.id }],
      ['protect', 'Protect', 't-protect', { civ: c.id }],
      ...(s.endgame === 'threat' ? [['erase', 'Erase', 't-erase', { civ: c.id }, true] as [Intervention, string, IconKey, Target, boolean?]] : []),
    ])) : null,
    full && home ? h('button', { class: 'tu-btn wide', onclick: () => app.selectPlanet(home.id) }, gi('u-planet'), `Homeworld: ${home.name}`) : null,
    h('h4', null, 'Chronicle'),
    h('ol', { class: 'tu-log' }, ...[...c.log].reverse().slice(0, full ? 40 : 12).map(([t, text]) => h('li', null, h('small', null, fmtAgo(t, s.t)), text))),
  );
}

// --- Observatory ------------------------------------------------------------------------------------

function observatory(app: App): HTMLElement {
  const u = app.u;
  const s = u.s;
  const st = s.stats;
  const lifeNow = u.lifeWorlds().length;
  const found = Object.keys(s.found).filter((k) => DISCOVERIES.some((d) => d.id === k)).length;
  const goal = s.goal ? GOALS.find((g) => g.id === s.goal) : null;
  const cats: Category[] = ['Stars', 'Planets', 'Life', 'Civilizations', 'Mysteries'];
  const firstRef = (name: string) => s.history.find((e) => e.kind === 'first' && e.text === name);
  return h('div', null,
    goal ? h('div', { class: `tu-goal${s.found[goal.id] !== undefined ? ' done' : ''}` }, gi('u-trophy'), h('span', null, h('small', null, 'Daily goal'), h('b', null, goal.text)), h('em', null, s.found[goal.id] !== undefined ? 'Done' : 'Not yet')) : null,
    h('div', { class: 'tu-stats' },
      stat('Stars shining', u.living.toLocaleString('en-US')),
      stat('Stars formed', st.starsFormed.toLocaleString('en-US')),
      stat('Supernovae', String(st.supernovae)),
      stat('Planets', st.planets.toLocaleString('en-US')),
      stat('Living worlds', `${lifeNow} / ${st.lifeWorlds}`),
      stat('Civilizations', String(st.civsBorn)),
      stat('Fallen', String(st.civsFell)),
      stat('Gone silent', String(st.silent)),
      stat('Reached space', String(s.civs.filter((c) => c.peak >= ERA_INDEX.spaceflight).length)),
      stat('Megastructures', String(st.dysons)),
    ),
    h('p', { class: 'tu-hint' }, `${found} of ${DISCOVERIES.length} discoveries. Rarer ones have more stars.`),
    ...cats.map((cat) => h('div', null,
      h('h4', null, cat),
      h('div', { class: 'tu-dex' }, ...DISCOVERIES.filter((d) => d.cat === cat).map((d) => {
        const t = s.found[d.id];
        const ref = t !== undefined ? firstRef(d.name) : undefined;
        const canLook = !!ref && (ref.planet !== undefined || ref.star !== undefined || ref.civ !== undefined);
        return h('button', {
          class: `tu-dexitem${t === undefined ? ' unknown' : ''}`,
          disabled: t === undefined,
          title: t === undefined ? d.hint : d.text,
          onclick: () => (canLook ? app.focusRef(ref!) : app.showDiscovery(d.id, false)),
        },
          gi(d.icon),
          h('span', { class: 'grow' }, h('b', null, t === undefined ? '???' : d.name), h('small', null, t === undefined ? d.hint : `${fmtAge(t)}`)),
          h('i', { class: 'tu-stars' }, '★'.repeat(d.rarity)));
      })))),
  );
}

function stat(label: string, value: string): HTMLElement {
  return h('div', { class: 'tu-stat' }, h('b', null, value), h('span', null, label));
}

// --- Life & civilizations ---------------------------------------------------------------------------

function lifePanel(app: App): HTMLElement {
  const u = app.u;
  const s = u.s;
  const civs = u.aliveCivs();
  const fallen = s.civs.filter((c) => !alive(c)).slice(-30).reverse();
  const worlds = u.lifeWorlds().sort((a, b) => s.ps[b].life!.stage - s.ps[a].life!.stage || (u.hab.get(b) ?? 0) - (u.hab.get(a) ?? 0)).slice(0, 30);
  const funnel = u.funnel();
  const top = Math.max(1, funnel[0].n);
  return h('div', null,
    h('h4', null, `Civilizations now (${civs.length})`),
    civs.length ? null : h('p', { class: 'tu-hint' }, s.found.intelligence !== undefined ? 'None alive right now.' : 'None yet. Intelligence takes billions of years.'),
    ...civs.map((c) => h('button', { class: 'tu-item', style: { '--hue': String(c.hue) }, onclick: () => app.selectCiv(c.id) },
      h('span', { class: 'tu-dot civ' }),
      h('span', { class: 'grow' }, h('b', null, c.name), h('small', null, `${eraName(c)} · ${civStatus(c)} · ${fmtPop(c.pop)} · ${1 + c.colonies.length} world${c.colonies.length ? 's' : ''}`))),
    ),
    h('h4', null, 'The Great Filter'),
    h('div', { class: 'tu-funnel' }, ...funnel.map((f) => h('div', null, h('span', null, f.label), bar(f.n / top, '#9aa8ff'), h('b', null, String(f.n))))),
    h('p', { class: 'tu-hint' }, filterLine(app)),
    fallen.length ? h('h4', null, 'Fallen') : null,
    ...fallen.map((c) => h('button', { class: 'tu-item dim', onclick: () => app.selectCiv(c.id) },
      gi(c.status === 'silent' ? 'u-eye' : c.status === 'merged' ? 'u-ufo' : 'u-ruins'),
      h('span', { class: 'grow' }, h('b', null, c.name), h('small', null, `${civStatus(c)} · reached ${c.eras[c.peak]} · lasted ${fmtYears((c.ended - c.born) * 1e6)}`)))),
    h('h4', null, `Living worlds (${u.lifeWorlds().length})`),
    worlds.length ? null : h('p', { class: 'tu-hint' }, 'No life yet. It needs a rocky world, water, warmth and time.'),
    ...worlds.map((pid) => {
      const b = s.ps[pid].life!;
      return h('button', { class: 'tu-item', onclick: () => app.selectPlanet(pid) },
        h('span', { class: 'tu-dot', style: { background: dotColor(app, pid) } }),
        h('span', { class: 'grow' }, h('b', null, u.planet(pid)!.name), h('small', null, `${STAGE_NAME[b.stage]} · ${living(b).length} groups · ${pct(u.hab.get(pid) ?? 0)} habitable`)));
    }),
  );
}

// --- History -------------------------------------------------------------------------------------------

/** The state of the sky: what the player has decided to do about the Great Filter. */
function filterLine(app: App): string {
  const s = app.u.s;
  if (s.found['great-filter'] === undefined) return 'Something keeps civilizations from reaching the stars. You do not know what yet.';
  if (s.endgame === 'undecided') return 'You know what the Great Filter is. What will you do about it?';
  if (s.endgame === 'threat') return `You became the threat. Civilizations erased: ${s.erased}. The Silence no longer acts.`;
  if (s.endgame === 'observe') return 'You chose to stay out and watch. The Silence continues its work; you write it all down.';
  return s.filterBroken
    ? 'The Filter is broken. The sky is open, and civilizations may grow past their star.'
    : `You chose to intervene. Silences turned back: ${s.turned} of 3 needed to break the Filter.`;
}

function history(app: App): HTMLElement {
  const u = app.u;
  const s = u.s;
  const born = s.civs.length;
  const space = s.civs.filter((c) => c.peak >= ERA_INDEX.interstellar).length;
  const galactic = s.civs.filter((c) => c.peak >= ERA_INDEX.galactic).length;
  const lines: string[] = [];
  if (born) {
    lines.push(`${born} civilization${born === 1 ? '' : 's'} arose in this universe.`);
    lines.push(space ? `Only ${space} reached the stars.` : 'None reached the stars.');
    lines.push(galactic ? `${galactic} made it through the Great Filter.` : 'None survived the Great Filter.');
    if (s.found['great-filter'] !== undefined) lines.push(filterLine(app));
  } else if (s.found['first-life'] !== undefined) lines.push('Life has begun, but nothing has looked up at the sky yet.');
  else lines.push('No life yet. Only stars, gas and time.');
  const all = app.historyAll;
  const entries = s.history.filter((e) => all || e.kind !== 'star');
  return h('div', null,
    h('div', { class: 'tu-summary' }, ...lines.map((l) => h('p', null, l))),
    h('div', { class: 'tu-seg' },
      h('button', { class: all ? '' : 'on', onclick: () => app.setHistoryAll(false) }, 'Milestones'),
      h('button', { class: all ? 'on' : '', onclick: () => app.setHistoryAll(true) }, 'Everything')),
    h('ol', { class: 'tu-timeline' },
      ...entries.slice(-150).map((e) => {
        const ref = e.planet !== undefined || e.star !== undefined || e.civ !== undefined;
        return h('li', { class: `k-${e.kind}` },
          h('small', null, fmtAgo(e.t, s.t)),
          ref ? h('button', { class: 'tu-link', onclick: () => app.focusRef(e) }, e.kind === 'first' ? `Discovered: ${e.text}` : e.text) : h('span', null, e.kind === 'first' ? `Discovered: ${e.text}` : e.text));
      }),
      h('li', { class: 'k-now' }, h('small', null, 'Today'), h('span', null, `You are here, ${fmtAge(s.t)} after the beginning.`)),
    ),
  );
}

// --- Profile ------------------------------------------------------------------------------------------

export function profileTitle(app: App): string {
  const p = app.u.s.prof;
  const scores: [string, number][] = [['Creator', p.create], ['Destroyer', p.destroy * 1.2], ['Observer', p.observe]];
  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] === 0) return 'Observer';
  return scores[0][0];
}

function profile(app: App): HTMLElement {
  const u = app.u;
  const s = u.s;
  const p = s.prof;
  const total = Math.max(1, p.create + p.destroy + p.observe);
  const found = Object.keys(s.found).length / DISCOVERIES.length;
  const title = profileTitle(app);
  return h('div', null,
    h('div', { class: 'tu-title-badge' }, gi('p-profile', 'tu-gi big'), h('div', null, h('small', null, 'So far, you are'), h('b', null, `${/^[AEIOU]/.test(title) ? 'an' : 'a'} ${title}`))),
    h('div', { class: 'tu-traits' },
      h('div', { class: 'tu-trait' }, h('span', null, 'Creation'), bar(p.create / total, '#7fe0a8')),
      h('div', { class: 'tu-trait' }, h('span', null, 'Observation'), bar(p.observe / total, '#9ab8ff')),
      h('div', { class: 'tu-trait' }, h('span', null, 'Destruction'), bar(p.destroy / total, '#ff8a6a')),
      h('div', { class: 'tu-trait' }, h('span', null, 'Intervention'), bar(Math.min(1, p.interventions / 50), '#e7c56a')),
      h('div', { class: 'tu-trait' }, h('span', null, 'Exploration'), bar(found, '#c49aff')),
      h('div', { class: 'tu-trait' }, h('span', null, 'Life'), bar(Math.min(1, s.stats.lifeWorlds / 150), '#6fe39a')),
      h('div', { class: 'tu-trait' }, h('span', null, 'Civilization'), bar(Math.min(1, s.stats.civsBorn / 25), '#ffd27a')),
    ),
    h('p', { class: 'tu-hint' }, `${p.interventions} intervention${p.interventions === 1 ? '' : 's'}. Long stretches without touching anything count as observing.`),
    h('h4', null, 'Achievements'),
    h('div', { class: 'tu-achs' }, ...ACHIEVEMENTS.map((a) => h('div', { class: `tu-ach${s.ach[a.id] !== undefined ? ' on' : ''}` }, gi('u-trophy'), h('span', null, h('b', null, a.name), h('small', null, a.text))))),
    h('h4', null, 'This universe'),
    h('div', { class: 'tu-seed' }, h('code', null, s.seed), h('button', { class: 'tu-btn', onclick: () => app.copySeed() }, 'Copy seed')),
    h('p', { class: 'tu-hint' }, 'Anyone who starts a universe with this seed and these settings gets the same beginning. What happens after depends on them.'),
  );
}

export function starOfPlanet(pid: number): number {
  return Math.floor(pid / PLANET_STRIDE);
}
