// Procedural SVG creature art. Every creature is drawn from layers (body,
// head, ears/horns, tail, pattern, eyes, feature) coloured by its species hue
// plus individual variation. No sprites, no filters: plain shapes only.

import { hashString } from '../../shared/rng';
import { SPECIES_BY_ID, type FamilyId } from '../data/species';
import type { Genome, Variant } from '../sim/game';

const NS = 'http://www.w3.org/2000/svg';

export interface CreatureArt {
  speciesId: string;
  id?: string;
  variant?: Variant | null;
  genome?: Genome;
}

type Attrs = Record<string, string | number | undefined>;

function S(tag: string, attrs?: Attrs, ...children: (SVGElement | string | null | undefined)[]): SVGElement {
  const el = document.createElementNS(NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;
}

interface Palette {
  body: string;
  dark: string;
  light: string;
  accent: string;
  accentSoft: string;
  eye: string;
  scale: number;
  glow: number;
}

export function palette(art: CreatureArt): Palette {
  const sp = SPECIES_BY_ID[art.speciesId];
  const seed = hashString(art.id ?? sp.id);
  const jitter = ((seed % 17) - 8) as number;
  const hue = sp.look.hue + jitter;
  const accent = sp.look.accent + ((seed >> 4) % 13) - 6;
  const variant = art.variant ?? null;
  const genome = art.genome;
  const scale = 0.92 + (genome?.size ?? 0.5) * 0.18;
  const glow = 0.35 + (genome?.glow ?? 0.5) * 0.55;
  if (variant === 'golden') {
    return {
      body: hsl(46, 78, 58),
      dark: hsl(38, 72, 40),
      light: hsl(52, 88, 72),
      accent: hsl(28, 92, 52),
      accentSoft: hsl(48, 92, 68, 0.8),
      eye: hsl(28, 90, 30),
      scale,
      glow,
    };
  }
  if (variant === 'crystal') {
    return {
      body: hsl(hue, 46, 74),
      dark: hsl(hue, 50, 52),
      light: hsl(hue, 70, 90),
      accent: hsl(205, 82, 74),
      accentSoft: hsl(205, 82, 82, 0.85),
      eye: hsl(hue, 60, 26),
      scale,
      glow: glow + 0.15,
    };
  }
  if (variant === 'void') {
    return {
      body: hsl(hue, 38, 22),
      dark: hsl(hue, 42, 12),
      light: hsl(hue, 30, 38),
      accent: hsl(272, 76, 72),
      accentSoft: hsl(272, 76, 78, 0.75),
      eye: hsl(272, 90, 82),
      scale,
      glow: glow + 0.2,
    };
  }
  return {
    body: hsl(hue, 52, 62),
    dark: hsl(hue, 54, 44),
    light: hsl(hue, 60, 80),
    accent: hsl(accent, 62, 58),
    accentSoft: hsl(accent, 62, 66, 0.85),
    eye: hsl(hue, 48, 18),
    scale,
    glow,
  };
}

/** Draw a shape and its mirror image across the vertical centre line. */
function sym(parent: SVGElement, ...nodes: SVGElement[]): void {
  const mirror = S('g', { transform: 'translate(120,0) scale(-1,1)' });
  for (const n of nodes) {
    parent.appendChild(n);
    mirror.appendChild(n.cloneNode(true) as SVGElement);
  }
  parent.appendChild(mirror);
}

function eyes(p: Palette, cx: number, cy: number, r = 4): SVGElement {
  const g = S('g');
  sym(
    g,
    S('circle', { cx, cy, r, fill: p.eye }),
    S('circle', { cx: cx - r * 0.3, cy: cy - r * 0.35, r: r * 0.34, fill: '#fff', opacity: 0.9 }),
  );
  return g;
}

function feature(p: Palette, name: string): SVGElement {
  const g = S('g');
  switch (name) {
    case 'glow-ears':
      sym(g, S('circle', { cx: 41, cy: 18, r: 5, fill: p.accentSoft, opacity: p.glow }));
      break;
    case 'flame-tail':
      for (let i = 0; i < 3; i++) {
        const y = 66 + i * 12;
        g.appendChild(S('path', { d: `M92 ${y} q10 -8 4 -18 q10 6 6 18 q-4 6 -10 2 z`, fill: i === 0 ? '#ffb347' : '#ff7a45', opacity: 0.9 }));
      }
      break;
    case 'mist-tail':
      for (let i = 0; i < 4; i++)
        g.appendChild(S('circle', { cx: 92 + i * 6, cy: 78 - i * 4, r: 7 - i * 0.8, fill: '#cfe8f2', opacity: 0.5 }));
      break;
    case 'runes':
      for (let i = 0; i < 5; i++) {
        const x = 46 + (i % 3) * 12;
        const y = 70 + Math.floor(i / 3) * 12;
        sym(g, S('path', { d: `M${x} ${y} l4 -4 m-2 2 l4 4`, stroke: p.accent, 'stroke-width': 2, fill: 'none', opacity: 0.9 }));
      }
      break;
    case 'moss':
      for (let i = 0; i < 6; i++)
        g.appendChild(S('circle', { cx: 38 + i * 9, cy: 52 + (i % 2) * 6, r: 6, fill: '#4e9a5c', opacity: 0.9 }));
      break;
    case 'crystals':
      for (let i = 0; i < 4; i++) {
        const x = 40 + i * 12;
        sym(g, S('path', { d: `M${x} 52 l5 -14 l5 14 z`, fill: p.accent, opacity: 0.95 }));
      }
      break;
    case 'kelp':
      for (let i = 0; i < 3; i++) {
        const x = 44 + i * 12;
        g.appendChild(S('path', { d: `M${x} 52 q6 8 -2 14 q8 6 2 14`, stroke: '#3f8f6b', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }));
      }
      break;
    case 'thorns':
      for (let i = 0; i < 5; i++) {
        const x = 36 + i * 12;
        sym(g, S('path', { d: `M${x} 56 l3 -10 l3 10 z`, fill: p.dark }));
      }
      break;
    case 'crest':
      for (let i = 0; i < 3; i++) {
        const x = 50 + i * 8;
        g.appendChild(S('path', { d: `M${x} 26 q4 -12 8 -2 q-4 4 -8 2 z`, fill: p.accent }));
      }
      break;
    case 'lightning':
      sym(g, S('path', { d: 'M40 62 l8 -14 l-2 10 l10 -6 l-10 16 l2 -10 z', fill: '#ffe58a', opacity: 0.95 }));
      break;
    case 'flame-crest':
      for (let i = 0; i < 3; i++) {
        const x = 48 + i * 8;
        g.appendChild(S('path', { d: `M${x} 24 q6 -12 10 -2 q-4 4 -10 2 z`, fill: i % 2 ? '#ff7a45' : '#ffb347' }));
      }
      break;
    case 'night-eyes':
      sym(g, S('circle', { cx: 50, cy: 44, r: 8, fill: p.accentSoft, opacity: 0.65 }));
      break;
    case 'lava-cracks':
      for (let i = 0; i < 4; i++) {
        const y = 66 + i * 10;
        sym(g, S('path', { d: `M46 ${y} q8 -4 14 2`, stroke: '#ff8c42', 'stroke-width': 2.5, fill: 'none', opacity: 0.9 }));
      }
      break;
    case 'glass':
      g.appendChild(S('path', { d: 'M34 66 l14 -12 l10 10 l-12 12 z', fill: '#fff', opacity: 0.28 }));
      g.appendChild(S('path', { d: 'M70 60 l12 -8 l8 12 l-10 10 z', fill: '#fff', opacity: 0.22 }));
      break;
    case 'fins':
      sym(g, S('path', { d: 'M40 78 q-14 -6 -12 -18 q10 2 14 12 z', fill: p.accent, opacity: 0.9 }));
      break;
    case 'glow':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        g.appendChild(
          S('circle', {
            cx: 60 + Math.cos(a) * 38,
            cy: 72 + Math.sin(a) * 30,
            r: 3.2,
            fill: p.accent,
            opacity: 0.28 + p.glow * 0.4,
          }),
        );
      }
      break;
    case 'moon-wings':
      sym(g, S('path', { d: 'M30 56 a16 16 0 0 1 20 14 a13 13 0 0 0 -20 -14 z', fill: '#fff', opacity: 0.6 }));
      break;
    case 'spores':
      for (let i = 0; i < 9; i++)
        g.appendChild(S('circle', { cx: 30 + (i * 13) % 62, cy: 48 + (i * 7) % 44, r: 2.4, fill: p.accent, opacity: 0.85 }));
      break;
    case 'void-wings':
      for (let i = 0; i < 8; i++) {
        const x = 26 + (i * 17) % 74;
        const y = 44 + (i * 11) % 46;
        g.appendChild(S('circle', { cx: x, cy: y, r: 1.8, fill: '#fff', opacity: 0.85 }));
      }
      break;
    default:
      break;
  }
  return g;
}

function bodyKit(p: Palette): SVGElement {
  const g = S('g');
  g.appendChild(S('path', { d: 'M86 84 q22 -4 22 -22 q-2 12 -14 14 q-8 2 -8 8 z', fill: p.dark }));
  g.appendChild(S('ellipse', { cx: 60, cy: 82, rx: 24, ry: 18, fill: p.body }));
  sym(g, S('path', { d: 'M46 30 L40 12 L58 22 Z', fill: p.body }), S('path', { d: 'M47 28 L43 17 L55 24 Z', fill: p.accentSoft }));
  g.appendChild(S('circle', { cx: 60, cy: 44, r: 19, fill: p.body }));
  g.appendChild(S('ellipse', { cx: 60, cy: 53, rx: 10, ry: 7, fill: p.light }));
  g.appendChild(S('ellipse', { cx: 60, cy: 50, rx: 3, ry: 2.2, fill: p.dark }));
  sym(g, S('ellipse', { cx: 48, cy: 84, rx: 6, ry: 9, fill: p.dark }));
  g.appendChild(eyes(p, 52, 42, 4));
  return g;
}

function bodyShell(p: Palette): SVGElement {
  const g = S('g');
  sym(g, S('rect', { x: 38, y: 82, width: 12, height: 16, rx: 5, fill: p.dark }));
  g.appendChild(S('ellipse', { cx: 60, cy: 78, rx: 32, ry: 22, fill: p.dark }));
  g.appendChild(S('ellipse', { cx: 60, cy: 72, rx: 28, ry: 18, fill: p.body }));
  for (let i = 0; i < 3; i++) {
    const x = 44 + i * 12;
    g.appendChild(S('path', { d: `M${x} 66 l6 -5 l6 5 l-6 5 z`, fill: p.light, opacity: 0.65 }));
  }
  g.appendChild(S('ellipse', { cx: 60, cy: 44, rx: 14, ry: 12, fill: p.body }));
  g.appendChild(S('ellipse', { cx: 60, cy: 50, rx: 8, ry: 5, fill: p.light }));
  g.appendChild(eyes(p, 53, 42, 3.4));
  return g;
}

function bodyWing(p: Palette): SVGElement {
  const g = S('g');
  sym(
    g,
    S('path', { d: 'M42 62 Q18 68 30 94 Q44 88 46 72 Z', fill: p.dark }),
    S('path', { d: 'M42 68 Q26 74 34 90 Q42 84 44 74 Z', fill: p.accentSoft, opacity: 0.8 }),
    S('path', { d: 'M52 28 q-4 -12 6 -14 q2 8 -2 13 z', fill: p.accent }),
  );
  g.appendChild(S('ellipse', { cx: 60, cy: 80, rx: 18, ry: 16, fill: p.body }));
  g.appendChild(S('circle', { cx: 60, cy: 50, r: 15, fill: p.body }));
  g.appendChild(S('path', { d: 'M60 56 L53 62 L67 62 Z', fill: p.accent }));
  g.appendChild(eyes(p, 53, 48, 3.8));
  return g;
}

function bodyScale(p: Palette): SVGElement {
  const g = S('g');
  g.appendChild(S('path', { d: 'M82 88 q22 2 26 -12 q-6 14 -24 10 z', fill: p.dark }));
  g.appendChild(S('ellipse', { cx: 58, cy: 80, rx: 24, ry: 16, fill: p.body }));
  sym(g, S('rect', { x: 38, y: 84, width: 10, height: 14, rx: 4, fill: p.dark }));
  g.appendChild(S('ellipse', { cx: 60, cy: 50, rx: 17, ry: 13, fill: p.body }));
  g.appendChild(S('ellipse', { cx: 60, cy: 56, rx: 10, ry: 6, fill: p.light }));
  for (let i = 0; i < 4; i++) {
    const x = 46 + i * 10;
    sym(g, S('path', { d: `M${x} 40 q-2 -8 4 -10 q2 6 -1 10 z`, fill: p.accentSoft }));
  }
  g.appendChild(eyes(p, 53, 48, 3.6));
  return g;
}

function bodyMoth(p: Palette): SVGElement {
  const g = S('g');
  sym(
    g,
    S('path', { d: 'M54 58 Q18 44 20 76 Q26 100 54 88 Z', fill: p.accentSoft }),
    S('path', { d: 'M54 62 Q30 54 32 76 Q38 92 54 84 Z', fill: p.light, opacity: 0.55 }),
    S('path', { d: 'M56 34 q-10 -12 -20 -10 q4 8 14 12 z', stroke: p.dark, 'stroke-width': 2, fill: 'none' }),
    S('circle', { cx: 34, cy: 23, r: 3, fill: p.accent }),
  );
  g.appendChild(S('ellipse', { cx: 60, cy: 74, rx: 11, ry: 20, fill: p.body }));
  g.appendChild(S('circle', { cx: 60, cy: 46, r: 12, fill: p.body }));
  g.appendChild(eyes(p, 54, 45, 3.4));
  return g;
}

const BODIES: Record<FamilyId, (p: Palette) => SVGElement> = {
  kit: bodyKit,
  shell: bodyShell,
  wing: bodyWing,
  scale: bodyScale,
  moth: bodyMoth,
};

/** Filters are per-instance so several portraits can share a page. */
let filterSeq = 0;

/**
 * A full creature drawing as an inline SVG element. Portraits (anything from
 * list-badge size up) get a lit volume: a warm highlight from the upper left, a
 * cool shadow to the lower right and a soft contact shadow, so the flat shapes
 * read as a small solid figure standing on a surface.
 */
export function creatureSVG(art: CreatureArt, px = 120): SVGSVGElement {
  const sp = SPECIES_BY_ID[art.speciesId];
  const p = palette(art);
  const svg = S('svg', {
    viewBox: '0 0 120 120',
    width: px,
    height: px,
    class: `wb-creature wb-creature-${sp.look.body}${art.variant ? ` wb-variant-${art.variant}` : ''}`,
    role: 'img',
    'aria-label': sp.name,
  }) as SVGSVGElement;
  const lit = px >= 72;
  const id = `wb-vol-${(filterSeq = (filterSeq + 1) % 100000)}`;
  if (lit) {
    const defs = S('defs');
    // One warm highlight from the upper left, one cool shade to the lower
    // right: the cheapest convincing way to round a flat silhouette.
    defs.appendChild(S('filter', { id: `${id}-lit`, x: '-30%', y: '-30%', width: '160%', height: '160%' },
      S('feDropShadow', { dx: -2.2, dy: -3, stdDeviation: 2.6, 'flood-color': '#fff8e0', 'flood-opacity': 0.34 }),
      S('feDropShadow', { dx: 3, dy: 5.5, stdDeviation: 4.2, 'flood-color': '#0a1420', 'flood-opacity': 0.42 }),
    ));
    const shade = S('radialGradient', { id: `${id}-ground`, cx: '50%', cy: '50%', r: '50%' },
      S('stop', { offset: '0', 'stop-color': '#03080f', 'stop-opacity': 0.5 }),
      S('stop', { offset: '0.6', 'stop-color': '#03080f', 'stop-opacity': 0.22 }),
      S('stop', { offset: '1', 'stop-color': '#03080f', 'stop-opacity': 0 }),
    );
    defs.appendChild(shade);
    svg.appendChild(defs);
  }
  if (lit) {
    svg.appendChild(S('ellipse', { cx: 60, cy: 106, rx: 30 * p.scale, ry: 8, fill: `url(#${id}-ground)` }));
  } else {
    svg.appendChild(S('ellipse', { cx: 60, cy: 106, rx: 26 * p.scale, ry: 6, fill: '#000', opacity: 0.18 }));
  }
  const art2 = S('g', { transform: `translate(60,66) scale(${p.scale}) translate(-60,-66)` });
  if (lit) art2.setAttribute('filter', `url(#${id}-lit)`);
  art2.appendChild(BODIES[sp.look.body](p));
  art2.appendChild(feature(p, sp.look.feature));
  svg.appendChild(art2);
  return svg;
}

/** Small round badge used in lists. */
export function creatureBadge(art: CreatureArt, px = 44): SVGSVGElement {
  const svg = creatureSVG(art, px);
  svg.setAttribute('class', `${svg.getAttribute('class') ?? ''} wb-badge`);
  return svg;
}
