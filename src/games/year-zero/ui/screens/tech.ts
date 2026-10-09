// The Technology Tree: one tab per era. Each era shows its discoveries next
// to the next era's, joined by lines from what a discovery needs to what it
// unlocks. Known discoveries carry a check, locked ones a padlock; clicking
// a reachable one studies it, a distant one sets it as a research goal.

import { BUILDINGS, WONDERS } from '../../data/buildings';
import { ERA_TIER_NAMES, TECHS, type TechDef, type TechTag } from '../../data/techs';
import { UNITS } from '../../data/units';
import { researchTurns } from '../../sim/ai';
import { canResearch, civTotals, nextTowardGoal, setResearch, techCostFor } from '../../sim/civs';
import type { Game } from '../../sim/game';
import { gi, h, svg } from '../dom';
import { hasIcon } from '../../art';
import { ICON } from '../icons';
import { openModal } from '../modal';

const TAG_ICON: Record<TechTag, string> = {
  food: 'y-food', production: 'y-prod', science: 'y-sci', culture: 'y-cult', religion: 'n-faith', military: 'y-strength',
  maritime: 'r-fish', trade: 'y-gold', expansion: 'n-world', ecology: 'e-climate', government: 'n-civ', future: 'p-station',
};

/** An icon for a discovery: the first thing it unlocks, or its theme. */
function techIcon(t: TechDef): string {
  const b = BUILDINGS.find((x) => x.tech === t.id);
  if (b && hasIcon(`b-${b.id}`)) return `b-${b.id}`;
  const u = UNITS.find((x) => x.tech === t.id);
  if (u && hasIcon(`u-${u.id}`)) return `u-${u.id}`;
  const w = WONDERS.find((x) => x.tech === t.id);
  if (w && hasIcon(`w-${w.id}`)) return `w-${w.id}`;
  return TAG_ICON[t.tags[0]] ?? 'n-tech';
}

let lastTab = -1;

export function openTech(root: HTMLElement, g: Game, onChange: () => void): void {
  const civ = g.player;
  const frontier = Math.min(9, ...TECHS.filter((t) => civ.techs[t.id] === undefined).map((t) => t.tier), 9);
  if (lastTab < 0 || lastTab > 9) lastTab = frontier;
  const tabs = ERA_TIER_NAMES.map((n) => `${n} Era`);
  openModal(root, {
    title: 'Technology Tree',
    gicon: 'n-tech',
    tabs,
    tab: tabs[frontier],
    render: (body, tab, handle) => {
      const tier = Math.max(0, tabs.indexOf(tab));
      lastTab = tier;
      const sci = civTotals(g, civ).sci;
      const cur = civ.research;
      const head = h('div', { class: 'yz-tt-head' });
      if (cur) {
        const cost = techCostFor(g, civ, cur);
        const t = TECHS.find((x) => x.id === cur)!;
        head.append(
          h('span', { class: 'yz-tt-icon on' }, gi(techIcon(t))),
          h('div', { class: 'grow' },
            h('div', { class: 'yz-label' }, 'Researching'),
            h('div', { class: 'yz-tt-cur' }, h('b', null, t.name), h('span', { class: 'yz-num c-sci' }, `${Math.floor(civ.sciStore)}/${cost} · ${researchTurns(g, civ, sci, cur)} yrs`)),
            h('div', { class: 'yz-progress c-sci' }, h('i', { style: { width: `${Math.min(100, (civ.sciStore / cost) * 100)}%` } }))));
      } else {
        head.append(h('div', { class: 'yz-quote', style: { fontStyle: 'normal', margin: 0 } }, `Choose what your scholars should study. ${Math.floor(civ.sciStore)} science is waiting to be spent.`));
      }
      body.append(head, h('div', { class: 'yz-sub', style: { margin: '6px 0 12px' } }, `+${sci} science per year${civ.researchGoal ? ` · goal: ${TECHS.find((x) => x.id === civ.researchGoal)?.name}` : ''} · click a glowing discovery to study it, or a locked one to set a goal.`));
      const path = new Set<string>();
      if (civ.researchGoal) {
        const walk = (id: string) => {
          if (civ.techs[id] !== undefined || path.has(id)) return;
          path.add(id);
          for (const r of TECHS.find((x) => x.id === id)!.req) walk(r);
        };
        walk(civ.researchGoal);
      }
      const node = (t: TechDef) => {
        const known = civ.techs[t.id] !== undefined;
        const avail = canResearch(civ, t.id);
        const cls = known ? 'known' : t.id === cur ? 'current' : path.has(t.id) ? 'goal' : avail ? 'avail' : 'locked';
        const missing = t.req.filter((r) => civ.techs[r] === undefined).map((r) => TECHS.find((x) => x.id === r)!.name);
        return h('button', {
          class: `yz-tt-node ${cls}`,
          dataset: { tech: t.id },
          disabled: known,
          title: known ? `Learned in Year ${civ.techs[t.id]}` : avail ? `${techCostFor(g, civ, t.id)} science` : `Set as goal: needs ${missing.join(', ')}`,
          onclick: () => {
            if (known) return;
            setResearch(civ, t.id);
            if (!avail) civ.research = nextTowardGoal(civ, t.id);
            onChange();
            handle.rerender();
          },
        },
        h('span', { class: 'yz-tt-icon' }, gi(techIcon(t))),
        h('span', { class: 'nm' }, h('b', null, t.name), h('span', { class: 'bl' }, t.blurb)),
        h('span', { class: 'st' }, known ? svg(ICON.check) : avail || t.id === cur ? h('span', { class: 'yz-num' }, `${researchTurns(g, civ, sci, t.id)}y`) : svg(ICON.lock)));
      };
      const colA = h('div', { class: 'yz-tt-col' }, h('div', { class: 'yz-tt-era' }, `${ERA_TIER_NAMES[tier]} Era`), ...TECHS.filter((t) => t.tier === tier).map(node));
      const next = tier + 1 <= 9 ? TECHS.filter((t) => t.tier === tier + 1) : [];
      const colB = next.length ? h('div', { class: 'yz-tt-col next' }, h('div', { class: 'yz-tt-era' }, `Then: ${ERA_TIER_NAMES[tier + 1]} Era`), ...next.map(node)) : null;
      const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      lines.setAttribute('class', 'yz-tt-lines');
      const board = h('div', { class: 'yz-tt-board' }, lines, colA, colB);
      body.append(board);
      // connectors between prerequisites and what they lead to
      requestAnimationFrame(() => {
        const br = board.getBoundingClientRect();
        lines.setAttribute('width', String(br.width));
        lines.setAttribute('height', String(board.scrollHeight));
        const pos = (id: string) => board.querySelector(`[data-tech="${id}"]`)?.getBoundingClientRect();
        let paths = '';
        for (const t of [...TECHS.filter((x) => x.tier === tier), ...next]) {
          for (const r of t.req) {
            const a = pos(r);
            const b = pos(t.id);
            if (!a || !b) continue;
            const known = civ.techs[r] !== undefined;
            const x1 = a.right - br.left;
            const y1 = a.top + a.height / 2 - br.top;
            const x2 = b.left - br.left;
            const y2 = b.top + b.height / 2 - br.top;
            if (x2 <= x1) continue;
            const mx = (x1 + x2) / 2;
            paths += `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" class="${known ? 'k' : ''}"/>`;
          }
        }
        lines.innerHTML = paths;
      });
    },
  });
}
