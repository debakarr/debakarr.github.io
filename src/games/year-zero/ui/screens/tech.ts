import { ERA_TIER_NAMES, TECHS } from '../../data/techs';
import { researchTurns } from '../../sim/ai';
import { canResearch, civTotals, nextTowardGoal, setResearch, techCostFor } from '../../sim/civs';
import type { Game } from '../../sim/game';
import { h } from '../dom';
import { openModal } from '../modal';

export function openTech(root: HTMLElement, g: Game, onChange: () => void): void {
  openModal(root, {
    title: 'Knowledge',
    gicon: 'n-tech',
    render: (body, _t, handle) => {
      const civ = g.player;
      const sci = civTotals(g, civ).sci;
      const cur = civ.research;
      const head = h('div', { style: { marginBottom: '14px' } });
      if (cur) {
        const cost = techCostFor(g, civ, cur);
        const t = TECHS.find((x) => x.id === cur)!;
        head.append(
          h('div', { class: 'yz-label' }, 'Researching'),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' } },
            h('div', { class: 'yz-h', style: { fontSize: '18px' } }, t.name),
            h('div', { class: 'yz-num c-sci' }, `${Math.floor(civ.sciStore)}/${cost} · ${researchTurns(g, civ, sci, cur)} yrs`)),
          h('div', { class: 'yz-progress c-sci' }, h('i', { style: { width: `${Math.min(100, (civ.sciStore / cost) * 100)}%` } })),
        );
        if (civ.researchGoal) head.append(h('div', { class: 'yz-sub' }, `Working toward ${TECHS.find((x) => x.id === civ.researchGoal)?.name}`));
      } else {
        head.append(h('div', { class: 'yz-quote', style: { fontStyle: 'normal' } }, `Choose what your scholars should study. ${Math.floor(civ.sciStore)} science is waiting to be spent.`));
      }
      head.append(h('div', { class: 'yz-sub', style: { marginTop: '6px' } }, `+${sci} science per year · Click a highlighted discovery to study it, or a distant one to set a goal.`));
      body.append(head);
      const grid = h('div', { class: 'yz-tech' });
      const path = new Set<string>();
      if (civ.researchGoal) {
        // Highlight the remaining path to the goal.
        const walk = (id: string) => {
          if (civ.techs[id] !== undefined || path.has(id)) return;
          path.add(id);
          for (const r of TECHS.find((x) => x.id === id)!.req) walk(r);
        };
        walk(civ.researchGoal);
      }
      for (let tier = 0; tier < 10; tier++) {
        const col = h('div', { class: 'yz-tech-col' }, h('div', { class: 'yz-label' }, ERA_TIER_NAMES[tier]));
        for (const t of TECHS.filter((x) => x.tier === tier)) {
          const known = civ.techs[t.id] !== undefined;
          const avail = canResearch(civ, t.id);
          const cls = known ? 'known' : t.id === cur ? 'current' : path.has(t.id) ? 'goal' : avail ? 'avail' : 'locked';
          const missing = t.req.filter((r) => civ.techs[r] === undefined).map((r) => TECHS.find((x) => x.id === r)!.name);
          col.append(h('button', {
            class: `yz-technode ${cls}`,
            disabled: known,
            title: known ? `Learned in Year ${civ.techs[t.id]}` : avail ? `${techCostFor(g, civ, t.id)} science` : `Set as goal: ${missing.join(', ')} first`,
            onclick: () => {
              if (known) return;
              setResearch(civ, t.id);
              if (!avail) civ.research = nextTowardGoal(civ, t.id);
              onChange();
              handle.rerender();
            },
          },
          h('span', { class: 'n' }, h('span', null, t.name), !known ? h('span', { class: 'yz-num c-sci', style: { fontWeight: '500', fontSize: '11px' } }, avail ? `${researchTurns(g, civ, sci, t.id)}y` : '') : null),
          h('span', { class: 'b' }, t.blurb),
          !known && missing.length ? h('span', { class: 'r' }, `Needs ${missing.join(', ')}`) : null));
        }
        grid.append(col);
      }
      body.append(grid);
      // Scroll so the current frontier is visible.
      requestAnimationFrame(() => {
        const first = grid.children[0] as HTMLElement | undefined;
        const col = grid.children[Math.max(0, civ.eraTier - 1)] as HTMLElement | undefined;
        if (first && col) grid.scrollLeft = col.offsetLeft - first.offsetLeft;
      });
    },
  });
}
