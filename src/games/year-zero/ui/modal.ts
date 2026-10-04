import type { Game } from '../sim/game';
import { viewDecision, resolveDecision } from '../sim/events';
import type { Decision } from '../sim/state';
import { clear, h, svg } from './dom';
import { ICON, type IconName } from './icons';

export interface ModalHandle {
  close: () => void;
  rerender: () => void;
  setTab: (tab: string) => void;
  el: HTMLElement;
}

export interface ModalOptions {
  title: string;
  icon?: IconName;
  tabs?: string[];
  tab?: string;
  narrow?: boolean;
  dismissable?: boolean;
  render: (body: HTMLElement, tab: string, handle: ModalHandle) => void;
  foot?: (foot: HTMLElement, handle: ModalHandle) => void;
  onClose?: () => void;
}

let current: { root: HTMLElement; handle: ModalHandle; onClose?: () => void } | null = null;

export function modalOpen(): boolean {
  return !!current;
}

export function closeModal(): void {
  if (!current) return;
  const c = current;
  current = null;
  clear(c.root);
  c.onClose?.();
}

export function openModal(root: HTMLElement, opts: ModalOptions): ModalHandle {
  closeModal();
  let tab = opts.tab ?? opts.tabs?.[0] ?? '';
  const body = h('div', { class: 'yz-modal-body' });
  const foot = h('div', { class: 'yz-modal-foot' });
  const tabsEl = opts.tabs ? h('div', { class: 'yz-tabs', role: 'tablist' }) : null;
  const dismissable = opts.dismissable !== false;
  const modal = h('div', { class: `yz-modal${opts.narrow ? ' narrow' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
    h('div', { class: 'yz-modal-head' },
      opts.icon ? svg(ICON[opts.icon]) : null,
      h('h2', { class: 'yz-h' }, opts.title),
      dismissable ? h('button', { class: 'yz-iconbtn', 'aria-label': 'Close', onclick: () => closeModal() }, svg(ICON.close)) : null),
    tabsEl,
    body,
    foot);
  const backdrop = h('div', { class: 'yz-backdrop', onclick: (e: Event) => { if (e.target === backdrop && dismissable) closeModal(); } }, modal);
  const handle: ModalHandle = {
    el: modal,
    close: closeModal,
    rerender: () => {
      const scroll = body.scrollTop;
      clear(body);
      opts.render(body, tab, handle);
      clear(foot);
      opts.foot?.(foot, handle);
      foot.style.display = foot.childNodes.length ? '' : 'none';
      body.scrollTop = scroll;
      if (tabsEl) {
        for (const b of tabsEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
      }
    },
    setTab: (t: string) => {
      tab = t;
      body.scrollTop = 0;
      handle.rerender();
    },
  };
  if (tabsEl && opts.tabs) {
    for (const t of opts.tabs) {
      tabsEl.appendChild(h('button', { class: 'yz-tab', role: 'tab', dataset: { tab: t }, onclick: () => handle.setTab(t) }, t));
    }
  }
  clear(root);
  root.appendChild(backdrop);
  current = { root, handle, onClose: opts.onClose };
  handle.rerender();
  return handle;
}

const TONE_ICON: Record<string, IconName> = {
  disaster: 'fire',
  crisis: 'crown',
  discovery: 'ruin',
  diplomacy: 'handshake',
  war: 'sword',
  wonder: 'star',
};

/** Show a pending decision; resolves when the player chooses. */
export function showDecision(root: HTMLElement, g: Game, d: Decision, onDone: () => void): boolean {
  const view = viewDecision(g, d);
  if (!view) {
    g.s.decisions = g.s.decisions.filter((x) => x.id !== d.id);
    return false;
  }
  closeModal();
  const isRecord = d.event === 'ruin';
  const modal = h('div', { class: 'yz-modal yz-event', role: 'dialog', 'aria-modal': 'true', 'aria-label': view.title },
    h('div', { class: `yz-event-art ${view.tone}` }, svg(ICON[TONE_ICON[view.tone] ?? 'info'])),
    h('div', { class: 'yz-modal-body' },
      h('div', { class: 'yz-label', style: { marginBottom: '6px' } }, `Year ${g.s.turn}`),
      h('h2', { class: 'yz-h', style: { fontSize: '24px', marginBottom: '10px' } }, view.title),
      h('div', { class: `yz-event-text${isRecord ? ' record' : ''}` }, view.text),
      h('div', { class: 'yz-options' },
        view.options.map((o, i) =>
          h('button', {
            class: 'yz-option',
            disabled: !!o.disabled,
            onclick: () => {
              closeModal();
              resolveDecision(g, d.id, i);
              onDone();
            },
          },
          h('span', { class: 'n' }, o.label),
          o.disabled ? h('span', { class: 'd' }, o.disabled) : o.desc ? h('span', { class: 'd' }, o.desc) : null)))));
  const backdrop = h('div', { class: 'yz-backdrop' }, modal);
  clear(root);
  root.appendChild(backdrop);
  current = { root, handle: { el: modal, close: closeModal, rerender: () => undefined, setTab: () => undefined } };
  (modal.querySelector('.yz-option:not(:disabled)') as HTMLElement | null)?.focus();
  return true;
}
