import { icons, type IconKey } from '../art';
import { h } from '../../shared/dom';

export function gi(key: IconKey, cls = 'mc-gi'): HTMLElement {
  return h('span', { class: cls, html: icons.svg(key) });
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** A labelled 0..1 bar, green when `good` is high. */
export function meter(label: string, v: number, good = true, text?: string, icon?: IconKey): HTMLElement {
  const t = Math.max(0, Math.min(1, v));
  const q = good ? t : 1 - t;
  const color = q > 0.66 ? 'var(--mc-good)' : q > 0.33 ? 'var(--mc-warn)' : 'var(--mc-bad)';
  return h('div', { class: 'mc-meter' },
    h('span', { class: 'mc-meter-label' }, icon ? gi(icon) : null, label),
    h('span', { class: 'mc-meter-bar' }, h('i', { style: { width: `${t * 100}%`, background: color } })),
    h('span', { class: 'mc-meter-val' }, text ?? pct(t)),
  );
}

export { chart } from '../../shared/chart';
