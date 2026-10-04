import { h } from '../../shared/dom';
import { chart } from '../../shared/chart';
import { describe, G, GENE_NAMES, GENES } from '../sim/genes';
import { YEAR, type Species, type World } from '../sim/world';
import type { App } from './app';

// Side panels: living species, the tree of life, the chronicle, statistics
// and the creature being followed.

export type PanelId = 'species' | 'tree' | 'story' | 'stats' | 'creature';

export const PANEL_TITLE: Record<PanelId, string> = {
  species: 'Living species',
  tree: 'Tree of life',
  story: 'Chronicle',
  stats: 'Statistics',
  creature: 'Creature',
};

const n = (v: number) => Math.round(v).toLocaleString('en-US');
const years = (t: number) => n(t / YEAR);

export function hueColor(hue: number, light = 58): string {
  return `hsl(${Math.round(hue * 360)},65%,${light}%)`;
}

function traitBar(label: string, v: number): HTMLElement {
  return h('div', { class: 'pr-trait' }, h('span', null, label), h('span', { class: 'pr-bar' }, h('i', { style: { width: `${Math.round(v * 100)}%` } })));
}

export function renderPanel(app: App, id: PanelId): HTMLElement {
  switch (id) {
    case 'species': return species(app);
    case 'tree': return tree(app);
    case 'story': return story(app);
    case 'stats': return stats(app);
    case 'creature': return creature(app);
  }
}

function species(app: App): HTMLElement {
  const w = app.world;
  const list = w.living().filter((sp) => sp.count >= 3).sort((a, b) => b.count - a.count);
  if (!list.length) return h('p', { class: 'pr-empty' }, 'Nothing lives here. Use the grazer or hunter tool to seed life.');
  return h('div', { class: 'pr-species' },
    h('p', { class: 'pr-hint' }, `${list.length} species with three or more members. Tap one to highlight it on the map.`),
    ...list.map((sp) => {
      const c = sp.centroid;
      const sel = app.renderer.selectedSpecies === sp.id;
      return h('div', { class: `pr-sp ${sel ? 'on' : ''}` },
        h('button', { class: 'pr-sphead', onclick: () => app.highlight(sel ? -1 : sp.id) },
          h('i', { class: 'pr-swatch', style: { background: hueColor(sp.hue) } }),
          h('span', null, h('b', null, sp.name), h('small', null, describe(c, 0))),
          h('em', null, n(sp.count)),
        ),
        sel ? h('div', { class: 'pr-spbody' },
          traitBar('Size', c[G.Size]),
          traitBar('Speed', c[G.Speed]),
          traitBar('Meat in diet', c[G.Diet]),
          traitBar('Sociality', c[G.Social]),
          traitBar('Heat preference', c[G.Heat]),
          h('p', { class: 'pr-hint' }, `Arose in year ${years(sp.born)}${sp.parent >= 0 ? ` from ${w.speciesOf(sp.parent)?.name ?? 'an ancestor'}` : sp.seeded ? ' (seeded)' : ''}. Peak ${n(sp.peak)}. ${sp.kills ? `${n(sp.kills)} kills.` : ''}`),
          h('button', { class: 'pr-btn', onclick: () => app.followSpecies(sp.id) }, 'Follow one'),
        ) : null,
      );
    }),
  );
}

/** The tree of life: species as lines through time, branching from their parents. */
function tree(app: App): HTMLElement {
  const w = app.world;
  const all = w.s.speciesList.filter((sp) => sp.peak >= 8 || (sp.died === null && sp.count > 0));
  if (!all.length) return h('p', { class: 'pr-empty' }, 'No species yet.');
  const kids = new Map<number, Species[]>();
  const roots: Species[] = [];
  const ids = new Set(all.map((sp) => sp.id));
  for (const sp of all) {
    // Attach to the nearest ancestor that is drawn.
    let p = sp.parent;
    while (p >= 0 && !ids.has(p)) p = w.speciesOf(p)?.parent ?? -1;
    if (p < 0) roots.push(sp);
    else {
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p)!.push(sp);
    }
  }
  const order: Species[] = [];
  const walk = (sp: Species) => {
    order.push(sp);
    for (const k of (kids.get(sp.id) ?? []).sort((a, b) => a.born - b.born)) walk(k);
  };
  for (const r of roots.sort((a, b) => a.born - b.born)) walk(r);
  const row = 18;
  const Wc = 320;
  const Hc = Math.max(120, order.length * row + 30);
  const cv = h('canvas', { class: 'pr-tree', width: Wc * 2, height: Hc * 2, style: { height: `${Hc}px` } });
  const ctx = cv.getContext('2d')!;
  ctx.scale(2, 2);
  const tMax = Math.max(1, w.s.t);
  const left = 8;
  const right = 150;
  const px = (t: number) => left + (t / tMax) * (Wc - left - right);
  const yOf = new Map<number, number>();
  order.forEach((sp, k) => yOf.set(sp.id, 18 + k * row));
  ctx.font = '11px Inter Variable, system-ui, sans-serif';
  for (const sp of order) {
    const y = yOf.get(sp.id)!;
    const x0 = px(sp.born);
    const x1 = px(sp.died ?? tMax);
    const alive = sp.died === null && sp.count > 0;
    ctx.strokeStyle = hueColor(sp.hue, alive ? 60 : 40);
    ctx.lineWidth = Math.max(1.5, Math.min(6, Math.sqrt(sp.peak) / 3));
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    let p = sp.parent;
    while (p >= 0 && !yOf.has(p)) p = w.speciesOf(p)?.parent ?? -1;
    if (p >= 0) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(160,210,230,0.45)';
      ctx.beginPath();
      ctx.moveTo(x0, yOf.get(p)!);
      ctx.lineTo(x0, y);
      ctx.stroke();
    }
    ctx.fillStyle = alive ? '#e6f6ff' : 'rgba(160,190,210,0.6)';
    ctx.fillText(`${sp.name}${alive ? '' : ' †'}`, Math.min(x1 + 6, Wc - right + 6), y + 4);
  }
  ctx.fillStyle = 'rgba(160,190,210,0.7)';
  ctx.fillText(`Year 0`, left, 10);
  ctx.textAlign = 'right';
  ctx.fillText(`Year ${years(tMax)}`, Wc - right, 10);
  return h('div', null, h('p', { class: 'pr-hint' }, 'Each line is a species, from its birth to its extinction (†) or today. Branches show who evolved from whom.'), cv);
}

function story(app: App): HTMLElement {
  const w = app.world;
  const items = [...w.s.chronicle].reverse().slice(0, 150);
  return h('div', { class: 'pr-story' },
    ...items.map((c) => h('button', { class: `pr-entry ${c.kind} ${c.important ? 'imp' : ''}`, onclick: () => app.lookAt(c.x, c.y) },
      h('small', null, `Year ${years(c.t)}`), h('span', null, c.text))),
  );
}

function stats(app: App): HTMLElement {
  const w = app.world;
  const S = w.s.samples;
  const opt = { ink: '#8fb3c4' };
  return h('div', null,
    h('div', { class: 'pr-statgrid' },
      h('div', null, h('b', null, n(w.count)), h('span', null, 'alive')),
      h('div', null, h('b', null, n(w.living().filter((sp) => sp.count >= 3).length)), h('span', null, 'species')),
      h('div', null, h('b', null, n(w.s.speciesList.length)), h('span', null, 'species ever')),
      h('div', null, h('b', null, n(w.s.maxGen)), h('span', null, 'generations')),
      h('div', null, h('b', null, n(w.s.births)), h('span', null, 'births')),
      h('div', null, h('b', null, n(w.s.milestones.extinctions ?? 0)), h('span', null, 'mass extinctions')),
    ),
    h('h4', null, 'Population'),
    chart(S.map((s) => s.pop), '#5fe0c8', { ...opt, fmt: (v) => n(v), zero: true }),
    h('h4', null, 'Meat in the average diet'),
    chart(S.map((s) => s.diet), '#ff8a65', { ...opt, fmt: (v) => `${Math.round(v * 100)}%`, zero: true }),
    h('h4', null, 'Average body size'),
    chart(S.map((s) => s.size), '#9fa8ff', { ...opt, fmt: (v) => `${Math.round(v * 100)}%`, zero: true }),
  );
}

function creature(app: App): HTMLElement {
  const w = app.world;
  const i = app.renderer.follow;
  const s = w.s;
  if (i < 0 || !s.alive[i]) return h('p', { class: 'pr-empty' }, 'Tap a creature with the watch tool to follow it.');
  const sp = w.speciesOf(s.species[i]);
  const o = i * GENES;
  return h('div', { class: 'pr-creature' },
    h('div', { class: 'pr-sphead static' }, h('i', { class: 'pr-swatch', style: { background: hueColor(s.genes[o + G.Hue]) } }), h('span', null, h('b', null, sp?.name ?? 'Unknown'), h('small', null, describe(s.genes, o)))),
    h('div', { class: 'pr-statgrid' },
      h('div', null, h('b', null, n(s.gen[i])), h('span', null, 'generation')),
      h('div', null, h('b', null, years(s.age[i])), h('span', null, `of ~${years(w.life[i])} years`)),
      h('div', null, h('b', null, n(s.kills[i])), h('span', null, 'kills')),
    ),
    traitBar('Energy', Math.max(0, s.energy[i] / w.emax[i])),
    h('h4', null, 'Genome'),
    ...GENE_NAMES.map((name, k) => (k === G.Hue ? null : traitBar(name, s.genes[o + k]))),
    h('button', { class: 'pr-btn', onclick: () => app.unfollow() }, 'Stop following'),
  );
}

export function worldSummary(w: World): string {
  const living = w.living().filter((sp) => sp.count >= 3).length;
  return `${n(w.count)} creatures · ${living} species · year ${n(w.year)}`;
}
