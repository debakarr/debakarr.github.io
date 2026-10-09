// Overview screens from the left navigation: all our cities (with their
// pictures), all our units, and a large world map with a legend.

import { CORNERS } from '../../core/hex';
import { F, RESOURCES, T, TERRAIN_COLOR } from '../../data/terrain';
import { CLASS_LABEL, UNIT } from '../../data/units';
import { estimateTurns } from '../../sim/ai';
import { itemCost, itemName, realPopulation } from '../../sim/cities';
import type { Game } from '../../sim/game';
import { regionName } from '../../sim/history';
import { maxMoves } from '../../sim/path';
import { resourceVisible } from '../../sim/tiles';
import { fmt, gi, h, svg } from '../dom';
import { ICON } from '../icons';
import { openModal } from '../modal';

export function openCityList(root: HTMLElement, g: Game, jump: (id: number) => void, portrait: (id: number) => string | null): void {
  const p = g.player;
  openModal(root, {
    title: 'Cities',
    gicon: 'n-city',
    render: (body) => {
      const cities = g.citiesOf(p.id).sort((a, b) => b.size - a.size);
      if (!cities.length) {
        body.append(h('p', { class: 'yz-quote' }, 'Your people have not founded a city yet. Select your Settlers and press Found city.'));
        return;
      }
      const grid = h('div', { class: 'yz-citycards' });
      for (const c of cities) {
        const url = portrait(c.id);
        const cost = c.build ? itemCost(g, c, c.build) : 0;
        const turns = c.build ? estimateTurns(g, c, c.build) : 0;
        grid.append(h('button', { class: 'yz-citycard', onclick: () => jump(c.id) },
          url ? h('img', { src: url, alt: '' }) : h('div', { class: 'ph' }, gi('n-city')),
          h('div', { class: 'info' },
            h('div', { class: 'nm' }, h('span', { class: 'sz' }, String(c.size)), c.name, p.capitalId === c.id ? h('span', { class: 'cap' }, '♛') : null),
            h('div', { class: 'yz-sub' }, `${realPopulation(c, p).toLocaleString('en-US')} people · ${regionName(g, c.tile) || 'unnamed land'}`),
            h('div', { class: 'ys' },
              h('span', { class: 'c-food' }, gi('y-food'), `${c.y.foodNet >= 0 ? '+' : ''}${fmt(c.y.foodNet, c.y.foodNet % 1 ? 1 : 0)}`),
              h('span', { class: 'c-prod' }, gi('y-prod'), fmt(c.y.prod, 1)),
              h('span', { class: 'c-sci' }, gi('y-sci'), fmt(c.y.sci, 1)),
              h('span', { class: 'c-gold' }, gi('y-gold'), fmt(c.y.gold, 1))),
            c.build ? h('div', { class: 'bd' }, h('span', null, itemName(c.build)), h('span', { class: 'yz-num' }, c.resistance > 0 ? 'halted' : `${turns} yr${turns === 1 ? '' : 's'}`),
              h('div', { class: 'yz-progress c-prod' }, h('i', { style: { width: `${cost ? Math.min(100, (c.prod / cost) * 100) : 0}%` } }))) : null)));
      }
      body.append(grid);
    },
  });
}

export function openUnitList(root: HTMLElement, g: Game, select: (id: number) => void): void {
  const p = g.player;
  openModal(root, {
    title: 'Units',
    gicon: 'u-swordsmen',
    render: (body) => {
      const units = g.unitsOf(p.id);
      if (!units.length) {
        body.append(h('p', { class: 'yz-quote' }, 'You have no units. Cities can train them.'));
        return;
      }
      const order = (o: (typeof units)[number]) => (o.moves > 0 && !o.order ? 0 : o.order ? 1 : 2);
      units.sort((a, b) => order(a) - order(b) || UNIT[b.type].str - UNIT[a.type].str);
      const list = h('div', { class: 'yz-unitlist' });
      for (const u of units) {
        const def = UNIT[u.type];
        const city = g.cityAt(u.tile);
        const where = city ? city.name : regionName(g, u.tile) || 'the wilds';
        const status = u.moves > 0 && !u.order ? 'Awaiting orders' : u.order ? ({ goto: 'Marching', explore: 'Exploring', fortify: 'Fortified', sleep: 'Sleeping', settle: 'Seeking a home' } as Record<string, string>)[u.order.kind] : 'Done this year';
        list.append(h('button', { class: `yz-unitrow${u.moves > 0 && !u.order ? ' idle' : ''}`, onclick: () => select(u.id) },
          h('span', { class: 'yz-crest', style: { '--civ': p.color } as never }, gi(`u-${u.type}`)),
          h('div', { class: 'nm' }, h('b', null, def.name, u.veteran ? ' ★' : ''), h('span', null, `${CLASS_LABEL[def.cls]} · ${where}`)),
          h('div', { class: 'st' }, status),
          h('div', { class: 'hp' }, h('div', { class: `yz-progress ${u.hp > 60 ? 'c-good' : u.hp > 30 ? 'c-gold' : 'c-bad'}` }, h('i', { style: { width: `${u.hp}%` } })), h('span', { class: 'yz-num' }, `${u.hp}`)),
          h('div', { class: 'mv yz-num' }, `${fmt(u.moves, u.moves % 1 ? 1 : 0)}/${maxMoves(g, u)}`)));
      }
      body.append(list);
    },
  });
}

/**
 * Draws the explored world as little hexes (the World Map screen and the
 * minimap). With `fit`, the picture is cropped to what has been explored.
 * Returns a picker from canvas pixels to tiles.
 */
export function drawWorld(canvas: HTMLCanvasElement, g: Game, width: number, fit = true, maxHeight = Infinity): (x: number, y: number) => number {
  const map = g.s.map;
  const p = g.player;
  const grid = g.grid;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let x0 = 0;
  let y0 = 0;
  let x1 = grid.pixelWidth(1);
  let y1 = grid.pixelHeight(1);
  if (fit) {
    x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity;
    for (let i = 0; i < map.w * map.h; i++) {
      if (!p.explored[i]) continue;
      const [cx, cy] = grid.center(i, 1);
      x0 = Math.min(x0, cx - 2); y0 = Math.min(y0, cy - 2); x1 = Math.max(x1, cx + 2); y1 = Math.max(y1, cy + 2);
    }
    if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = grid.pixelWidth(1); y1 = grid.pixelHeight(1); }
  }
  let s = width / (x1 - x0);
  if ((y1 - y0) * s > maxHeight) s = maxHeight / (y1 - y0);
  const w = (x1 - x0) * s;
  const height = (y1 - y0) * s;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(-x0 * s, -y0 * s);
  ctx.fillStyle = '#16223a';
  ctx.fillRect(x0 * s, y0 * s, w, height);
  const hex = (cx: number, cy: number, r: number) => {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) ctx[k ? 'lineTo' : 'moveTo'](cx + CORNERS[k][0] * r, cy + CORNERS[k][1] * r);
    ctx.closePath();
  };
  const civRgb = new Map(g.s.civs.map((c) => [c.id, c.color]));
  for (let i = 0; i < map.w * map.h; i++) {
    if (!p.explored[i]) continue;
    const [cx, cy] = grid.center(i, s);
    let [r, gg, b] = TERRAIN_COLOR[map.terrain[i]];
    if (map.terrain[i] === T.Grass) [r, gg, b] = [124, 203, 67];
    if (map.terrain[i] === T.Plains) [r, gg, b] = [195, 204, 85];
    if (map.terrain[i] <= T.Lake) [r, gg, b] = map.terrain[i] === T.Ocean ? [40, 110, 196] : [58, 160, 226];
    if (map.relief[i] === 2) [r, gg, b] = [150, 138, 126];
    if (map.feature[i] === F.Forest || map.feature[i] === F.Jungle) [r, gg, b] = [r * 0.72, gg * 0.85, b * 0.7];
    if (map.feature[i] === F.Ice) [r, gg, b] = [226, 238, 246];
    ctx.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    hex(cx, cy, s + 0.5);
    ctx.fill();
    const o = map.owner[i];
    if (o >= 0) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = civRgb.get(o) ?? '#fff';
      hex(cx, cy, s + 0.5);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (!p.visible[i]) {
      ctx.fillStyle = 'rgba(16, 24, 40, 0.25)';
      hex(cx, cy, s + 0.5);
      ctx.fill();
    }
  }
  // borders
  ctx.lineWidth = Math.max(1.2, s * 0.22);
  for (let i = 0; i < map.w * map.h; i++) {
    const o = map.owner[i];
    if (o < 0 || !p.explored[i]) continue;
    const [cx, cy] = grid.center(i, s);
    for (let d = 0; d < 6; d++) {
      const nb = grid.neighbor(i, d);
      if (nb >= 0 && map.owner[nb] === o) continue;
      const a = [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]][d];
      ctx.strokeStyle = civRgb.get(o) ?? '#fff';
      ctx.beginPath();
      ctx.moveTo(cx + CORNERS[a[0]][0] * s, cy + CORNERS[a[0]][1] * s);
      ctx.lineTo(cx + CORNERS[a[1]][0] * s, cy + CORNERS[a[1]][1] * s);
      ctx.stroke();
    }
  }
  // rivers
  ctx.strokeStyle = 'rgba(80, 170, 240, 0.9)';
  ctx.lineWidth = Math.max(1, s * 0.25);
  ctx.beginPath();
  for (let i = 0; i < map.w * map.h; i++) {
    if (!p.explored[i] || !map.river[i] || map.riverTo[i] < 0) continue;
    const [ax, ay] = grid.center(i, s);
    const [bx, by] = grid.center(map.riverTo[i], s);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
  const pin = (cx: number, cy: number, r: number, fill: string, stroke = '#1a1a24') => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.3);
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };
  // resources and wonders
  for (let i = 0; i < map.w * map.h; i++) {
    if (!p.explored[i]) continue;
    const [cx, cy] = grid.center(i, s);
    if (map.wonder[i] >= 0) {
      ctx.fillStyle = '#ffd34d';
      ctx.font = `${Math.max(9, s * 1.4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', cx, cy);
    } else if (map.resource[i] && resourceVisible(p, map.resource[i]) && map.cityAt[i] < 0) {
      pin(cx, cy, Math.max(1.6, s * 0.3), RESOURCES[map.resource[i]].color, '#fff7d6');
    }
  }
  // units and cities
  for (const u of Object.values(g.s.units)) {
    if (!p.visible[u.tile] || !p.explored[u.tile]) continue;
    const [cx, cy] = grid.center(u.tile, s);
    pin(cx + s * 0.35, cy + s * 0.3, Math.max(1.8, s * 0.33), g.civ(u.civId).color, '#ffffff');
  }
  for (const c of Object.values(g.s.cities)) {
    if (!p.explored[c.tile]) continue;
    const [cx, cy] = grid.center(c.tile, s);
    const civ = g.civ(c.civId);
    pin(cx, cy, Math.max(3.2, s * 0.62), '#fff7e0', civ.color);
    if (civ.capitalId === c.id) pin(cx, cy, Math.max(1.4, s * 0.25), civ.color, civ.color);
  }
  return (x: number, y: number) => g.grid.pick(x / s + x0, y / s + y0, 1);
}

export function openWorldMap(root: HTMLElement, g: Game, jump: (tile: number) => void): void {
  const p = g.player;
  let zoom = 1;
  openModal(root, {
    title: 'World Map',
    icon: 'map',
    render: (body, _t, handle) => {
      const canvas = h('canvas', { class: 'yz-worldcanvas' });
      const wrap = h('div', { class: 'yz-worldwrap' }, canvas);
      const others = g.s.civs.filter((c) => c.id !== p.id && c.alive && g.knows(p.id, c.id));
      const legend = h('div', { class: 'yz-legend2' },
        h('div', null, h('i', { class: 'sw', style: { background: p.color } }), 'Your territory'),
        ...others.map((c) => h('div', null, h('i', { class: 'sw', style: { background: c.color } }), c.name)),
        h('div', null, h('i', { class: 'sw', style: { background: '#c3cc55' } }), 'Neutral land'),
        h('div', null, h('i', { class: 'dot city' }), 'City'),
        h('div', null, h('i', { class: 'dot unit' }), 'Unit'),
        h('div', null, h('i', { class: 'dot res' }), 'Resource'),
        h('div', null, h('span', { class: 'star' }, '★'), 'Wonder'),
        h('div', { class: 'yz-wm-zoom' },
          h('button', { class: 'yz-sqbtn', title: 'Zoom in', onclick: () => { zoom = Math.min(3, zoom * 1.4); handle.rerender(); } }, svg(ICON.plus)),
          h('button', { class: 'yz-sqbtn', title: 'Zoom out', onclick: () => { zoom = Math.max(1, zoom / 1.4); handle.rerender(); } }, svg(ICON.minus))),
        h('p', { class: 'yz-sub' }, 'Click anywhere to go there.'));
      body.append(h('div', { class: 'yz-worldmap' }, legend, wrap));
      requestAnimationFrame(() => {
        const width = Math.max(320, wrap.clientWidth - 4) * zoom;
        const pick = drawWorld(canvas, g, width, true, zoom === 1 ? Math.max(240, wrap.clientHeight - 4) : Infinity);
        canvas.onclick = (e) => {
          const r = canvas.getBoundingClientRect();
          const t = pick(e.clientX - r.left, e.clientY - r.top);
          if (t >= 0) jump(t);
        };
      });
    },
  });
}
