// Shared UI building blocks: panels, buttons, tabs, swatches, bars and
// rendered creature portraits.

import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderTarget,
  SRGBColorSpace,
  type WebGLRenderer,
} from 'three';
import { h } from '../../shared/dom';
import { paletteFor, type SpeciesId } from '../data/species';
import { buildCreature } from '../entities/creatureModel';
import { icon } from './icons';

export { h };

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  return h(tag, { class: cls }, ...children);
}

export function html(cls: string, markup: string, tag: keyof HTMLElementTagNameMap = 'div'): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = markup;
  return e;
}

export function button(label: string, onClick: () => void, opts: { cls?: string; icon?: string; key?: string; disabled?: boolean; title?: string } = {}): HTMLButtonElement {
  const b = h('button', { class: `lq-btn ${opts.cls ?? ''}`, type: 'button', title: opts.title });
  if (opts.icon) b.insertAdjacentHTML('beforeend', icon(opts.icon));
  b.append(h('span', { class: 'lq-btn-label' }, label));
  if (opts.key) b.append(h('kbd', { class: 'lq-kbd' }, opts.key));
  b.disabled = !!opts.disabled;
  // act on click (keyboard Enter/Space included); pointerup is not needed here
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) onClick();
  });
  return b;
}

export function panel(title: string, iconName: string, onClose?: () => void, cls = ''): { root: HTMLElement; body: HTMLElement; head: HTMLElement } {
  const head = el('div', 'lq-panel-head');
  head.insertAdjacentHTML('beforeend', icon(iconName, 'lq-panel-ico'));
  head.append(el('h2', 'lq-panel-title', title));
  if (onClose) {
    const x = h('button', { class: 'lq-x', type: 'button', 'aria-label': 'Close' });
    x.innerHTML = icon('close');
    x.addEventListener('click', onClose);
    head.append(x);
  }
  const body = el('div', 'lq-panel-body');
  const root = h('section', { class: `lq-panel ${cls}`, role: 'dialog', 'aria-label': title }, head, body);
  return { root, body, head };
}

export function tabs<T extends string>(items: { id: T; label: string; icon?: string }[], active: T, onPick: (id: T) => void): HTMLElement {
  const row = el('div', 'lq-tabs');
  row.setAttribute('role', 'tablist');
  for (const it of items) {
    const b = h('button', { class: `lq-tab${it.id === active ? ' is-on' : ''}`, type: 'button', role: 'tab', 'aria-selected': it.id === active ? 'true' : 'false' });
    if (it.icon) b.insertAdjacentHTML('beforeend', icon(it.icon));
    b.append(h('span', null, it.label));
    b.addEventListener('click', () => onPick(it.id));
    row.append(b);
  }
  return row;
}

export function swatches(colors: string[], active: string, onPick: (c: string) => void, label: string): HTMLElement {
  const row = el('div', 'lq-swatches');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', label);
  for (const c of colors) {
    const b = h('button', { class: `lq-swatch${c === active ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': c === active ? 'true' : 'false', 'aria-label': `${label} ${c}`, style: { background: c } });
    b.addEventListener('click', () => onPick(c));
    row.append(b);
  }
  return row;
}

export function choiceRow<T extends string>(items: { id: T; name: string }[], active: T | T[], onPick: (id: T) => void, multi = false): HTMLElement {
  const row = el('div', 'lq-choices');
  for (const it of items) {
    const on = Array.isArray(active) ? active.includes(it.id) : active === it.id;
    const b = h('button', { class: `lq-choice${on ? ' is-on' : ''}`, type: 'button', 'aria-pressed': on ? 'true' : 'false' }, it.name);
    if (multi) b.insertAdjacentHTML('afterbegin', on ? icon('check') : '');
    b.addEventListener('click', () => onPick(it.id));
    row.append(b);
  }
  return row;
}

export function bar(value: number, color: string, label?: string): HTMLElement {
  const wrap = el('div', 'lq-bar');
  if (label) wrap.append(el('span', 'lq-bar-label', label));
  const track = el('div', 'lq-bar-track');
  const fill = el('div', 'lq-bar-fill');
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  fill.style.background = color;
  track.append(fill);
  wrap.append(track);
  return wrap;
}

// ---------------------------------------------------------------------------
// Creature portraits rendered once and cached as images

const portraitCache = new Map<string, string>();
let pScene: Scene | null = null;
let pCam: PerspectiveCamera | null = null;
let pTarget: WebGLRenderTarget | null = null;

export function portrait(renderer: WebGLRenderer, species: SpeciesId, variant: string | null, size = 160): string {
  const key = `${species}|${variant ?? ''}|${size}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  if (!pScene) {
    pScene = new Scene();
    pScene.add(new HemisphereLight('#ffffff', '#8a9a7a', 1.6));
    const d = new DirectionalLight('#fff2dc', 2.4);
    d.position.set(1.5, 2.5, 3);
    pScene.add(d);
    pCam = new PerspectiveCamera(28, 1, 0.05, 20);
    pTarget = new WebGLRenderTarget(size, size, { samples: 4 });
    pTarget.texture.colorSpace = SRGBColorSpace;
  }
  if (pTarget!.width !== size) pTarget!.setSize(size, size);
  const model = buildCreature(species, variant, false);
  model.animator.update(0.3);
  model.root.rotation.y = 0.5;
  pScene.add(model.root);
  const hgt = model.height;
  pCam!.position.set(0, hgt * 0.62, hgt * 3.1);
  pCam!.lookAt(0, hgt * 0.5, 0);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = new Color();
  renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  const pal = paletteFor(species, variant);
  pScene.background = new Color(pal.belly).lerp(new Color('#1c2b48'), 0.75);
  renderer.setRenderTarget(pTarget);
  renderer.render(pScene, pCam!);
  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(pTarget!, 0, 0, size, size, buf);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  model.dispose();
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  // flip vertically while copying
  for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL('image/png');
  portraitCache.set(key, url);
  return url;
}
