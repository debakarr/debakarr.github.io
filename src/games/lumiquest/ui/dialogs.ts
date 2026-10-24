// Dialogs: notes, confirmations and the catch celebration.

import { ELEMENT_COLOR, ELEMENT_NAME, SPECIES_BY_ID } from '../data/species';
import { button, el, h, html, panel, portrait } from './kit';
import { icon } from './icons';
import { escapeHtml, type UI } from './ui';

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

/**
 * A catch. The first of a species gets a celebration card (nickname, take it
 * along); repeats get a quick card that doesn't interrupt the roaming.
 */
export function caught(ui: UI, uid: string, speciesName: string, first: boolean): void {
  const g = ui.game;
  const b = g.state.bonded.find((x) => x.uid === uid);
  if (!b) return;
  const def = SPECIES_BY_ID[b.species];
  const total = g.state.species[b.species].bonded;
  if (!first) {
    const card = html('lq-observed lq-caught', `
      <img alt="" src="${portrait(g.host.renderer, b.species, b.variant, 96)}">
      <div><div class="lq-observed-title">Caught ${escapeHtml(speciesName)}!</div><div class="lq-observed-text">Added to your collection (${total} caught).</div></div>`);
    ui.hudEl.append(card);
    setTimeout(() => card.classList.add('is-out'), 4200);
    setTimeout(() => card.remove(), 5000);
    return;
  }
  const { root, body } = panel('New creature caught!', 'heart', () => ui.closeTop(), 'lq-bonded');
  body.innerHTML = `
    <div class="lq-bonded-hero"><img alt="" src="${portrait(g.host.renderer, b.species, b.variant, 180)}"></div>
    <p class="lq-bonded-title">You caught ${escapeHtml(speciesName)}!</p>
    <p class="lq-muted"><span class="lq-elem" style="--c:${ELEMENT_COLOR[def.element]}">${icon(def.element)}${ELEMENT_NAME[def.element]}</span> ${escapeHtml(def.blurb)}</p>`;
  const input = h('input', { class: 'lq-input', maxlength: '16', value: b.name, 'aria-label': 'Nickname' });
  const row = el('div', 'lq-row lq-row-end');
  const keep = button('Keep exploring', () => {
    g.renameCompanion(uid, input.value.replace(/[<>]/g, ''));
    ui.closeTop();
  });
  const use = button('Take it along', () => {
    g.renameCompanion(uid, input.value.replace(/[<>]/g, ''));
    ui.closeTop();
    g.setActive(uid);
  }, { cls: 'lq-btn-primary', icon: 'heart' });
  body.append(el('div', 'lq-field', el('div', 'lq-field-label', 'Nickname'), input), row);
  row.append(keep, use);
  ui.push('bonded', root);
  use.focus();
}
