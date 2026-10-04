import { h } from '../../shared/dom';
import { icons, type IconKey } from '../art';
import { gloss } from '../lang/concepts';
import { digitParts, type GlyphPart } from '../lang/glyphs';
import type { Game } from '../sim/game';

const NS = 'http://www.w3.org/2000/svg';

export function gi(key: IconKey, cls = 'fc-gi'): HTMLElement {
  return h('span', { class: cls, html: icons.svg(key) });
}

/** One glyph as an SVG; `animate` draws its strokes in. */
export function glyphSvg(parts: GlyphPart[], opts: { animate?: boolean; delay?: number; cls?: string } = {}): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-8 -8 116 116');
  svg.setAttribute('class', `fc-glyph ${opts.animate ? 'draw' : ''} ${opts.cls ?? ''}`);
  svg.setAttribute('aria-hidden', 'true');
  // A wide faint stroke under each line gives the glow without an SVG filter.
  for (const halo of [true, false]) {
    parts.forEach((p, k) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', p.d);
      path.setAttribute('pathLength', '1');
      if (halo) path.setAttribute('class', 'halo');
      if (p.s) path.setAttribute('transform', `translate(50 50) scale(${p.s}) translate(-50 -50)`);
      if (opts.animate) path.style.animationDelay = `${(opts.delay ?? 0) + k * 0.12}s`;
      svg.appendChild(path);
    });
  }
  return svg;
}

export function conceptGlyph(game: Game, concept: string, opts: { animate?: boolean; delay?: number; cls?: string } = {}): SVGSVGElement {
  return glyphSvg(game.world.glyphs.paths[concept], opts);
}

export function numeral(game: Game, n: number, cls = 'fc-num'): HTMLElement {
  return h('span', { class: cls, title: 'An alien numeral' }, ...game.digits(n).map((d) => glyphSvg(digitParts(d))));
}

export interface TextOpts {
  readings?: boolean;
  onGlyph?: (concept: string) => void;
  highlight?: string;
  vertical?: boolean;
  animate?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/** A line of alien text. Each glyph can show the player's current reading. */
export function alienText(game: Game, tokens: string[], o: TextOpts = {}): HTMLElement {
  const wrap = h('div', { class: `fc-text ${o.vertical ? 'vertical' : ''} ${o.size ?? 'md'}` });
  let k = 0;
  for (const t of tokens) {
    if (t === ';') {
      wrap.append(h('span', { class: 'fc-sep', 'aria-hidden': 'true' }));
      continue;
    }
    const label = game.s.hyp[t];
    const g = h(o.onGlyph ? 'button' : 'span', {
      class: `fc-g ${o.highlight === t ? 'hl' : ''} ${label ? 'known' : ''}`,
      'aria-label': label ? `Glyph read as ${gloss(label)}` : 'Unread glyph',
      onclick: o.onGlyph ? (e: Event) => { e.stopPropagation(); o.onGlyph!(t); } : undefined,
    }, conceptGlyph(game, t, { animate: o.animate, delay: k * 0.35 }));
    if (o.readings) g.append(h('small', null, label ? gloss(label) : '?'));
    wrap.append(g);
    k++;
  }
  return wrap;
}
