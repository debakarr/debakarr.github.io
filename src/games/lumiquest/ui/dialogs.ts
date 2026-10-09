// Dialogs: villager conversations with choices, notes, the Resonance
// minigame, the bond celebration and confirmations.

import type { Tree } from '../data/dialogue';
import { ELEMENT_COLOR, ELEMENT_NAME, SPECIES_BY_ID, paletteFor } from '../data/species';
import type { Creature } from '../entities/creature';
import { keyLabel } from '../engine/input';
import { resonanceWindow } from '../systems/bonding';
import { button, el, h, html, panel, portrait } from './kit';
import { icon } from './icons';
import { escapeHtml, type UI } from './ui';

type KeyNode = HTMLElement & { lqKey?: (e: KeyboardEvent) => boolean | void };

export function note(ui: UI, title: string, text: string): void {
  const { root, body } = panel(title, 'note', () => ui.closeTop(), 'lq-note');
  body.append(el('p', 'lq-note-text', text));
  const ok = button('Close', () => ui.closeTop(), { cls: 'lq-btn-primary', key: 'Esc' });
  body.append(el('div', 'lq-row lq-row-end', ok));
  ui.push('note', root);
  ok.focus();
}

export function confirm(ui: UI, title: string, text: string, yes: string, onYes: () => void): void {
  const { root, body } = panel(title, 'spark', () => ui.closeTop(), 'lq-confirm');
  body.append(el('p', '', text));
  const no = button('Cancel', () => ui.closeTop());
  const ok = button(yes, () => {
    ui.closeTop();
    onYes();
  }, { cls: 'lq-btn-danger' });
  body.append(el('div', 'lq-row lq-row-end', no, ok));
  ui.push('confirm', root);
  no.focus();
}

export function dialogue(ui: UI, name: string, role: string, tree: Tree, onClose: () => void): void {
  const g = ui.game;
  const root = el('section', 'lq-dialogue') as KeyNode;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', `Talking to ${name}`);
  const box = el('div', 'lq-dlg-box');
  const nameEl = html('lq-dlg-name', `<span>${escapeHtml(name)}</span><small>${escapeHtml(role)}</small>`);
  const textEl = el('p', 'lq-dlg-text');
  box.append(nameEl, textEl);
  const choices = el('div', 'lq-dlg-choices');
  root.append(box, choices);
  let typing = 0;
  let full = '';
  const visited = new Set<string>();
  const show = (id: string) => {
    const node = tree[id];
    if (!node) {
      ui.closeTop();
      return;
    }
    visited.add(id);
    full = node.text;
    textEl.textContent = '';
    let i = 0;
    clearInterval(typing);
    typing = window.setInterval(() => {
      i += 2;
      textEl.textContent = full.slice(0, i);
      if (i >= full.length) clearInterval(typing);
    }, 16);
    choices.replaceChildren();
    node.choices.forEach((c, idx) => {
      const b = h('button', { class: 'lq-dlg-choice', type: 'button' });
      b.innerHTML = `<kbd class="lq-kbd">${idx + 1}</kbd><span>${escapeHtml(c.label)}</span>`;
      b.addEventListener('click', () => {
        g.audio.click();
        clearInterval(typing);
        c.run?.();
        if (c.close || !c.next) {
          ui.closeTop();
          return;
        }
        show(c.next);
      });
      choices.append(b);
    });
    (choices.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
    // the auto-ranger answers for you
    if (g.auto) {
      setTimeout(() => {
        if (!root.isConnected) return;
        const list = node.choices;
        const pick = list.findIndex((c) => c.run && !c.close) >= 0 ? list.findIndex((c) => c.run && !c.close) : list.findIndex((c) => c.run) >= 0 ? list.findIndex((c) => c.run) : list.findIndex((c) => c.next && !visited.has(c.next));
        const btn = choices.children[pick >= 0 ? pick : list.length - 1] as HTMLElement | undefined;
        btn?.click();
      }, 1400);
    }
  };
  root.lqKey = (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 9) {
      (choices.children[n - 1] as HTMLElement | undefined)?.click();
      return true;
    }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      const items = [...choices.children] as HTMLElement[];
      const i = items.indexOf(document.activeElement as HTMLElement);
      items[(i + (e.code === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      return true;
    }
    if (e.code === 'Space' && textEl.textContent !== full) {
      clearInterval(typing);
      textEl.textContent = full;
      return true;
    }
  };
  ui.push('dialogue', root, () => {
    clearInterval(typing);
    onClose();
  });
  show('start');
}

/**
 * Resonance: a pulse ring shrinks toward the creature's heartbeat ring.
 * Press when they meet. Three good beats bond; two misses break it.
 */
export function resonance(ui: UI, c: Creature, done: (ok: boolean) => void): void {
  const g = ui.game;
  const def = SPECIES_BY_ID[c.species];
  const pal = paletteFor(c.species, c.variant);
  const win = resonanceWindow(c);
  const root = el('section', 'lq-resonance') as KeyNode;
  root.style.setProperty('--c', ELEMENT_COLOR[def.element]);
  root.style.setProperty('--g', pal.glow);
  const key = keyLabel(g.settings.bindings.interact);
  root.innerHTML = `
    <div class="lq-res-head"><img alt="" src="${portrait(g.host.renderer, c.species, c.variant, 96)}"><div><div class="lq-res-title">Resonance</div><div class="lq-res-sub">${def.name} • <span class="lq-elem" style="--c:${ELEMENT_COLOR[def.element]}">${icon(def.element)}${ELEMENT_NAME[def.element]}</span></div></div></div>
    <div class="lq-res-stage" tabindex="0" aria-label="Press when the rings meet">
      <svg viewBox="0 0 200 200" class="lq-res-svg">
        <circle class="lq-res-target" cx="100" cy="100" r="50" />
        <circle class="lq-res-band" cx="100" cy="100" r="50" />
        <circle class="lq-res-pulse" cx="100" cy="100" r="90" />
        <circle class="lq-res-core" cx="100" cy="100" r="16" />
      </svg>
    </div>
    <div class="lq-res-beats"><i></i><i></i><i></i></div>
    <p class="lq-res-help">Press <kbd class="lq-kbd">${key}</kbd>, <kbd class="lq-kbd">Space</kbd> or tap when the rings meet.</p>`;
  const pulse = root.querySelector('.lq-res-pulse') as SVGCircleElement;
  const band = root.querySelector('.lq-res-band') as SVGCircleElement;
  band.setAttribute('stroke-width', String(Math.max(6, win * 100 * 1.6)));
  const beats = [...root.querySelectorAll('.lq-res-beats i')] as HTMLElement[];
  let hits = 0;
  let misses = 0;
  let t = 0;
  const period = 1.5 - Math.min(0.4, (1 - def.shyness) * 0.3);
  let raf = 0;
  let last = performance.now();
  let finished = false;
  let flash = 0;
  const finish = (ok: boolean) => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    root.classList.add(ok ? 'is-win' : 'is-lose');
    setTimeout(() => {
      ui.closeTop();
      done(ok);
    }, ok ? 900 : 700);
  };
  const scale = () => 1.8 - (t / period) * 1.35; // 1.8 → 0.45, target at 1.0
  const press = () => {
    if (finished) return;
    const d = Math.abs(scale() - 1);
    if (d <= win * 1.25) {
      beats[hits]?.classList.add('is-hit');
      hits++;
      g.audio.pulse(true);
      g.audio.heartbeat();
      g.player.pulse();
      flash = 1;
      t = 0;
      if (hits >= 3) finish(true);
    } else {
      misses++;
      g.audio.pulse(false);
      root.classList.remove('is-miss');
      void root.offsetWidth;
      root.classList.add('is-miss');
      t = 0;
      if (misses >= 2) finish(false);
    }
  };
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (t > period) {
      // a missed beat counts as a miss
      t = 0;
      misses++;
      g.audio.pulse(false);
      if (misses >= 2) {
        finish(false);
        return;
      }
    }
    flash = Math.max(0, flash - dt * 3);
    pulse.setAttribute('r', String(50 * scale()));
    pulse.style.opacity = String(Math.min(1, t * 3));
    (root.querySelector('.lq-res-core') as SVGCircleElement).style.transform = `scale(${1 + flash * 0.6})`;
    raf = requestAnimationFrame(loop);
  };
  root.lqKey = (e) => {
    if (e.code === 'Space' || e.code === g.settings.bindings.interact || e.code === 'Enter') {
      if (!e.repeat) press();
      return true;
    }
  };
  root.querySelector('.lq-res-stage')!.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    press();
  });
  ui.push('resonance', root, () => {
    cancelAnimationFrame(raf);
    if (!finished) {
      finished = true;
      done(false);
    }
  });
  raf = requestAnimationFrame(loop);
  // auto-ranger presses at the right moment
  if (g.auto) {
    const tick = () => {
      if (finished || !root.isConnected) return;
      if (Math.abs(scale() - 1) < win * 0.6) press();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

export function bonded(ui: UI, uid: string, speciesName: string): void {
  const g = ui.game;
  const b = g.state.bonded.find((x) => x.uid === uid)!;
  const def = SPECIES_BY_ID[b.species];
  const { root, body } = panel('A new bond!', 'heart', () => ui.closeTop(), 'lq-bonded');
  body.innerHTML = `
    <div class="lq-bonded-hero"><img alt="" src="${portrait(g.host.renderer, b.species, b.variant, 180)}"></div>
    <p class="lq-bonded-title">${speciesName} agreed to travel with you!</p>
    <p class="lq-muted">Added to your Creature Collection. Its ability: <b>${def.ability === 'ember' ? 'Ember Puff' : def.ability === 'tide' ? 'Tide Call' : def.ability === 'quake' ? 'Moss Quake' : def.ability === 'glide' ? 'Breeze Wings' : def.ability === 'glow' ? 'Lumen Glow' : 'Green Sense'}</b>.</p>`;
  const input = h('input', { class: 'lq-input', maxlength: '16', value: b.name, 'aria-label': 'Nickname' });
  const row = el('div', 'lq-row lq-row-end');
  const keep = button('Keep current companion', () => {
    g.renameCompanion(uid, input.value.replace(/[<>]/g, ''));
    ui.closeTop();
  });
  const use = button('Travel together now', () => {
    g.renameCompanion(uid, input.value.replace(/[<>]/g, ''));
    ui.closeTop();
    g.setActive(uid);
  }, { cls: 'lq-btn-primary', icon: 'heart' });
  body.append(el('div', 'lq-field', el('div', 'lq-field-label', 'Nickname'), input), row);
  row.append(keep, use);
  ui.push('bonded', root);
  use.focus();
  if (g.auto) setTimeout(() => root.isConnected && use.click(), 1500);
}
