// The illustrated world map: a village hub with six regions around it,
// connected by trails. Day/night and weather are drawn into the sky.

import { BIOMES, SPECIES, SPECIES_BY_ID, type BiomeId } from '../data/species';
import type { GameState, Weather } from '../sim/game';

const NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, unknown>;

function S(tag: string, attrs?: Attrs, ...children: (SVGElement | string | null | undefined)[]): SVGElement {
  const el = document.createElementNS(NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

export interface RegionInfo {
  id: BiomeId | 'village';
  name: string;
  known: number;
  total: number;
  danger: string;
  resources: string[];
  weather: string;
  current: boolean;
}

const DANGER: Record<BiomeId, string> = {
  greenwood: 'Gentle',
  meadow: 'Gentle',
  wetlands: 'Medium',
  caves: 'Medium',
  ember: 'Risky',
  ruins: 'Risky',
};

const POS: Record<BiomeId | 'village', { x: number; y: number }> = {
  village: { x: 450, y: 300 },
  greenwood: { x: 165, y: 135 },
  meadow: { x: 450, y: 95 },
  wetlands: { x: 735, y: 165 },
  caves: { x: 165, y: 445 },
  ember: { x: 450, y: 485 },
  ruins: { x: 735, y: 435 },
};

const LINKS: (readonly [BiomeId | 'village', BiomeId | 'village'])[] = [
  ['village', 'greenwood'],
  ['village', 'meadow'],
  ['village', 'wetlands'],
  ['village', 'caves'],
  ['village', 'ember'],
  ['village', 'ruins'],
  ['greenwood', 'meadow'],
  ['meadow', 'wetlands'],
  ['wetlands', 'ruins'],
  ['ruins', 'ember'],
  ['ember', 'caves'],
  ['caves', 'greenwood'],
];

export function regionInfo(state: GameState, id: BiomeId | 'village'): RegionInfo {
  if (id === 'village') {
    return {
      id,
      name: 'Village',
      known: 0,
      total: 0,
      danger: 'Safe',
      resources: ['Rest', 'Train', 'Breed'],
      weather: state.weather,
      current: state.region === 'village',
    };
  }
  const b = BIOMES[id];
  const wildIds = Object.keys(b.wild);
  const known = wildIds.filter((sid) => state.guide[sid] && state.guide[sid] !== 'unknown').length;
  return {
    id,
    name: b.name,
    known,
    total: wildIds.length,
    danger: DANGER[id],
    resources: [...new Set(b.resources)].map((r) => r),
    weather: state.weather,
    current: state.region === id,
  };
}

function sky(state: GameState): SVGElement {
  const g = S('g', { class: 'wb-sky' });
  const night = state.hour >= 19 || state.hour <= 5;
  const dusk = !night && (state.hour >= 17 || state.hour <= 7);
  const top = night ? '#0b1530' : dusk ? '#2a2a52' : '#25506e';
  const bottom = night ? '#1b2a4a' : dusk ? '#7a5a86' : '#7fc4d8';
  g.appendChild(S('defs', {}, S('linearGradient', { id: 'wb-skygrad', x1: 0, y1: 0, x2: 0, y2: 1 },
    S('stop', { offset: '0%', 'stop-color': top }),
    S('stop', { offset: '100%', 'stop-color': bottom }))));
  g.appendChild(S('rect', { x: 0, y: 0, width: 900, height: 560, fill: 'url(#wb-skygrad)' }));
  if (night) {
    for (let i = 0; i < 34; i++) {
      g.appendChild(S('circle', { cx: (i * 137) % 900, cy: (i * 71) % 320, r: 1.4, fill: '#fff', opacity: 0.7 }));
    }
    g.appendChild(S('circle', { cx: 780, cy: 80, r: 26, fill: '#f4f1de', opacity: 0.95 }));
    g.appendChild(S('circle', { cx: 792, cy: 72, r: 22, fill: top }));
  } else {
    g.appendChild(S('circle', { cx: 780, cy: 80, r: 30, fill: '#ffe58a', opacity: 0.95 }));
    for (let i = 0; i < 8; i++) {
      const cx = 60 + (i * 113) % 780;
      const cy = 40 + (i * 53) % 200;
      g.appendChild(S('ellipse', { cx, cy, rx: 40, ry: 16, fill: '#fff', opacity: 0.22 }));
      g.appendChild(S('ellipse', { cx: cx + 24, cy: cy - 10, rx: 28, ry: 13, fill: '#fff', opacity: 0.22 }));
    }
  }
  if (state.weather === 'rain' || state.weather === 'storm') {
    for (let i = 0; i < 40; i++) {
      const x = (i * 89) % 900;
      const y = (i * 151) % 520;
      g.appendChild(S('path', { d: `M${x} ${y} l-6 16`, stroke: '#bfe3f2', 'stroke-width': 2, opacity: 0.5 }));
    }
  }
  if (state.weather === 'storm') {
    g.appendChild(S('path', { d: 'M520 60 l-24 52 h20 l-26 56', stroke: '#ffe58a', 'stroke-width': 5, fill: 'none', opacity: 0.9 }));
  }
  if (state.weather === 'fog') {
    for (let i = 0; i < 6; i++)
      g.appendChild(S('rect', { x: 0, y: 120 + i * 70, width: 900, height: 26, fill: '#e8f2f4', opacity: 0.18 }));
  }
  return g;
}

function node(state: GameState, id: BiomeId | 'village', onTravel: (r: BiomeId | 'village') => void): SVGElement {
  const info = regionInfo(state, id);
  const pos = POS[id];
  const color = id === 'village' ? '#e0b062' : BIOMES[id].color;
  const g = S('g', {
    class: `wb-mapnode${info.current ? ' wb-mapnode-current' : ''}`,
    'data-region': id,
    tabindex: '0',
    role: 'button',
    'aria-label': `Travel to ${info.name}`,
    style: 'cursor:pointer',
    onclick: () => onTravel(id),
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTravel(id);
      }
    },
  } as Attrs);
  const w = id === 'village' ? 190 : 172;
  const h = id === 'village' ? 104 : 92;
  g.appendChild(S('rect', { x: pos.x - w / 2, y: pos.y - h / 2, width: w, height: h, rx: 18, fill: '#0d1b26', opacity: 0.82 }));
  g.appendChild(S('rect', { x: pos.x - w / 2, y: pos.y - h / 2, width: w, height: h, rx: 18, fill: 'none', stroke: color, 'stroke-width': info.current ? 4 : 2 }));
  g.appendChild(S('circle', { cx: pos.x - w / 2 + 30, cy: pos.y - h / 2 + 30, r: 16, fill: color, opacity: 0.9 }));
  g.appendChild(S('text', { x: pos.x - w / 2 + 56, y: pos.y - h / 2 + 28, fill: '#eef6f8', 'font-size': 20, 'font-weight': 700 }, info.name));
  const sub = id === 'village' ? 'Home · rest, train, breed' : `${info.known}/${info.total} species known · ${info.danger}`;
  g.appendChild(S('text', { x: pos.x - w / 2 + 56, y: pos.y - h / 2 + 52, fill: '#9fc4cc', 'font-size': 14 }, sub));
  if (id !== 'village') {
    g.appendChild(
      S('text', { x: pos.x - w / 2 + 18, y: pos.y + h / 2 - 14, fill: '#7fa8b2', 'font-size': 13 },
        `Resources: ${info.resources.join(', ')}`),
    );
  }
  return g;
}

/** The full world map as an SVG element. */
export function renderMap(state: GameState, onTravel: (r: BiomeId | 'village') => void): SVGSVGElement {
  const svg = S('svg', { viewBox: '0 0 900 560', class: 'wb-map', role: 'group', 'aria-label': 'World map' }) as SVGSVGElement;
  svg.appendChild(sky(state));
  const trails = S('g', { class: 'wb-trails' });
  for (const [a, b] of LINKS) {
    const pa = POS[a];
    const pb = POS[b];
    const midX = (pa.x + pb.x) / 2 + (pb.y - pa.y) * 0.12;
    const midY = (pa.y + pb.y) / 2 - (pb.x - pa.x) * 0.12;
    trails.appendChild(S('path', { d: `M${pa.x} ${pa.y} Q${midX} ${midY} ${pb.x} ${pb.y}`, stroke: '#f4e2b8', 'stroke-width': 3, 'stroke-dasharray': '10 12', fill: 'none', opacity: 0.5 }));
  }
  svg.appendChild(trails);
  for (const id of ['greenwood', 'meadow', 'wetlands', 'caves', 'ember', 'ruins'] as BiomeId[]) {
    svg.appendChild(node(state, id, onTravel));
  }
  svg.appendChild(node(state, 'village', onTravel));
  return svg;
}

/** A tiny weather glyph for the HUD. */
export function weatherGlyph(weather: Weather): string {
  return { sun: '☀', rain: '🌧', storm: '⛈', fog: '🌫' }[weather];
}

/** Species of a region that are still undiscovered (for the map panel). */
export function missingSpecies(state: GameState, id: BiomeId): string[] {
  return Object.keys(BIOMES[id].wild)
    .filter((sid) => !state.guide[sid] || state.guide[sid] === 'unknown')
    .map((sid) => SPECIES_BY_ID[sid].name);
}

export function guideCounts(state: GameState): { seen: number; observed: number; captured: number; total: number } {
  const states = SPECIES.map((s) => state.guide[s.id] ?? 'unknown');
  return {
    seen: states.filter((g) => g !== 'unknown').length,
    observed: states.filter((g) => g === 'observed' || g === 'captured').length,
    captured: states.filter((g) => g === 'captured').length,
    total: SPECIES.length,
  };
}
