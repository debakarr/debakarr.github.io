// Title screen and the creation flow: choose a character from the cast (and
// the name to go by), then your first creature. The cast cards are portrait
// stills; only the selected character is loaded live into the 3D preview.

import { CAST, CAST_BY_ID, castAppearance } from '../anime/cast';
import { AnimeCharacter } from '../anime/character';
import { ELEMENT_COLOR, ELEMENT_NAME, SPECIES_BY_ID, STARTERS, type SpeciesId } from '../data/species';
import { buildCreature } from '../entities/creatureModel';
import { CATCH_RATE } from '../systems/catching';
import { button, el, h, html } from './kit';
import { icon } from './icons';
import { escapeHtml, type UI } from './ui';

/** Arrow-key focus movement between buttons on a screen. */
function arrowNav(root: HTMLElement): (e: KeyboardEvent) => boolean | void {
  return (e) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
    const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([type=hidden])')].filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const dir = e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 1;
    const next = items[(i + dir + items.length) % items.length] ?? items[0];
    next.focus();
    return true;
  };
}

export function title(ui: UI, canContinue: boolean, warning?: string): void {
  const g = ui.game;
  ui.clearScreen();
  ui.screen.className = 'lq-screen lq-title-screen';
  const logo = html('lq-logo lq-logo-big', `<span class="lq-logo-main">Lumi<span>Quest</span></span><span class="lq-logo-sub">Explore • Befriend • Discover</span>`);
  const menu = el('nav', 'lq-title-menu');
  const newBtn = button('New Game', () => {
    if (canContinue) ui.confirm('Start a new game?', 'Your current save will be replaced when the new adventure begins.', 'Start fresh', () => g.newGame());
    else g.newGame();
  }, { cls: 'lq-btn-primary lq-title-btn', icon: 'spark' });
  const contBtn = button('Continue', () => {
    g.audio.click();
    g.continueGame();
  }, { cls: 'lq-title-btn', icon: 'book', disabled: !canContinue, title: canContinue ? 'Continue your saved adventure' : 'No saved game yet' });
  const setBtn = button('Settings', () => ui.openPanel('settings'), { cls: 'lq-title-btn', icon: 'gear' });
  const credBtn = button('Credits', () => ui.openPanel('credits'), { cls: 'lq-title-btn', icon: 'star' });
  menu.append(newBtn, contBtn, setBtn, credBtn);
  const side = el('div', 'lq-title-side', logo, menu);
  if (warning) side.append(el('p', 'lq-title-warning', warning));
  const foot = html('lq-title-foot', `<a href="/games" data-astro-reload>← All games</a><span>An original creature adventure • progress saves in this browser</span>`);
  ui.screen.append(side, foot);
  (canContinue ? contBtn : newBtn).focus();
  ui.menuKeyHandler = arrowNav(ui.screen);
}

// ---------------------------------------------------------------------------

function header(t: string, sub: string): HTMLElement {
  return html('lq-cr-header', `<h1>${t}</h1><p>${sub}</p>`);
}

const PORTRAITS = import.meta.glob('../assets/cast/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

const PRONOUNS: Record<string, string> = { she: 'she/her', he: 'he/him', they: 'they/them' };

export function charSelect(ui: UI): void {
  const g = ui.game;
  ui.clearScreen();
  g.studio.clear();
  ui.screen.className = 'lq-screen lq-create lq-charselect';
  let selected = CAST_BY_ID[g.draft.appearance.preset] ? g.draft.appearance.preset : CAST[0].id;
  const big = new AnimeCharacter(castAppearance(selected), false);
  big.animator.play('idle', 0);
  const preview = el('div', 'lq-preview');
  preview.setAttribute('aria-label', 'Character preview: drag to rotate');
  preview.append(el('div', 'lq-preview-hint', 'Drag to rotate • scroll to zoom'));
  const info = el('div', 'lq-cs-info lq-panel');
  const cards = el('div', 'lq-cs-cards lq-cs-cast');
  cards.setAttribute('role', 'radiogroup');
  const nameInput = h('input', { class: 'lq-input', type: 'text', maxlength: '16', 'aria-label': 'Your name', autocomplete: 'off', spellcheck: 'false' });
  let nameTouched = !!g.draft.appearance.name && g.draft.appearance.name !== CAST_BY_ID[selected]?.name;
  nameInput.value = g.draft.appearance.name || CAST_BY_ID[selected].name;
  nameInput.addEventListener('input', () => (nameTouched = true));
  const render = () => {
    const m = CAST_BY_ID[selected];
    big.setAppearance(castAppearance(selected));
    big.animator.once('wave', 0.15, 1);
    if (!nameTouched) nameInput.value = m.name;
    info.innerHTML = `<div class="lq-cs-name">${m.name}</div><div class="lq-cs-pron">${PRONOUNS[m.pronoun]}</div><p class="lq-cs-pers">${escapeHtml(m.blurb)}</p>`;
    info.append(el('div', 'lq-field', el('div', 'lq-field-label', 'Go by the name'), nameInput));
    cards.querySelectorAll('.lq-cs-card').forEach((c) => {
      const on = (c as HTMLElement).dataset.id === selected;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  };
  for (const m of CAST) {
    const card = h('button', { class: 'lq-cs-card', type: 'button', role: 'radio', dataset: { id: m.id }, 'aria-label': `${m.name}: ${m.blurb}` });
    card.innerHTML = `<img class="lq-cs-portrait" alt="" src="${PORTRAITS[`../assets/cast/${m.id}.webp`] ?? ''}"><span class="lq-cs-card-name">${m.name}</span>`;
    card.addEventListener('click', () => {
      if (selected === m.id) return;
      selected = m.id;
      g.audio.click();
      render();
    });
    cards.append(card);
  }
  g.studio.add({ el: preview, object: big.root, dist: 3.6, target: 0.8, spin: false, pedestal: true, tick: (dt) => big.update(dt), yaw: 0.25 });
  const row = el('div', 'lq-cr-actions');
  const back = button('Back', () => ui.back(), { icon: 'close' });
  const next = button('Continue', () => {
    g.audio.click();
    teardown();
    g.chooseCast(selected, nameInput.value);
  }, { cls: 'lq-btn-primary', icon: 'spark' });
  row.append(back, next);
  const teardown = () => {
    g.studio.clear();
    big.dispose();
  };
  ui.backHandler = () => {
    teardown();
    g.showTitle();
  };
  ui.screen.append(
    header('Choose Your Ranger', 'Characters: VRoid sample models by pixiv Inc. (CC0)'),
    el('div', 'lq-cs-main', preview, el('div', 'lq-cs-side', info, cards)),
    row,
  );
  render();
  (cards.querySelector('.is-on') as HTMLElement)?.focus();
  ui.menuKeyHandler = arrowNav(ui.screen);
}

// ---------------------------------------------------------------------------

export function starter(ui: UI): void {
  const g = ui.game;
  ui.clearScreen();
  g.studio.clear();
  ui.screen.className = 'lq-screen lq-create lq-starter';
  let selected: SpeciesId = g.draft.starter ?? 'terrabun';
  const cards = el('div', 'lq-st-cards');
  cards.setAttribute('role', 'radiogroup');
  const models = STARTERS.map((id) => buildCreature(id, null, false));
  const nameInput = h('input', { class: 'lq-input', type: 'text', maxlength: '16', placeholder: 'Nickname (optional)', 'aria-label': 'Companion nickname', autocomplete: 'off', spellcheck: 'false' });
  const render = () => {
    cards.querySelectorAll('.lq-st-card').forEach((c) => {
      const on = (c as HTMLElement).dataset.id === selected;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    nameInput.placeholder = `Nickname (default: ${SPECIES_BY_ID[selected].name})`;
  };
  STARTERS.forEach((id, i) => {
    const def = SPECIES_BY_ID[id];
    const odds = CATCH_RATE[id];
    const card = h('div', { class: 'lq-st-card', role: 'radio', tabindex: '0', dataset: { id }, 'aria-label': `${def.name}, ${ELEMENT_NAME[def.element]} type` });
    const view = el('div', 'lq-st-view');
    const infoBox = el('div', 'lq-st-info');
    card.append(view, infoBox);
    infoBox.insertAdjacentHTML('beforeend', `
      <div class="lq-st-name">${def.name}</div>
      <div class="lq-elem" style="--c:${ELEMENT_COLOR[def.element]}">${icon(def.element)}${ELEMENT_NAME[def.element]}</div>
      <p class="lq-st-pers">${def.personality}</p>
      <dl class="lq-st-facts">
        <dt>Habitat</dt><dd>${def.habitat.map((x) => x[0].toUpperCase() + x.slice(1)).join(', ')}</dd>
        <dt>In the wild</dt><dd>${odds >= 0.55 ? 'Common and easy to catch' : 'A little tricky to catch'}${def.active === 'night' ? ', out at night' : ''}</dd>
      </dl>
      <p class="lq-muted">${escapeHtml(def.blurb)}</p>`);
    const choose = () => {
      selected = id;
      g.audio.click();
      render();
    };
    card.addEventListener('click', choose);
    card.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        choose();
      }
    });
    cards.append(card);
    g.studio.add({ el: view, object: models[i].root, dist: 2.2, target: 0.32, spin: true, pedestal: true, tick: (dt) => models[i].animator.update(dt), yaw: 0.4 });
  });
  const teardown = () => {
    g.studio.clear();
    models.forEach((m) => m.dispose());
  };
  const row = el('div', 'lq-cr-actions');
  row.append(
    button('Back', () => ui.back(), { icon: 'close' }),
    nameInput,
    button('Confirm', () => {
      g.audio.click();
      const name = nameInput.value.replace(/[<>]/g, '');
      teardown();
      ui.clearScreen();
      g.beginAdventure(selected, name);
    }, { cls: 'lq-btn-primary', icon: 'check' }),
  );
  ui.backHandler = () => {
    teardown();
    ui.charSelect();
  };
  ui.screen.append(header('Choose Your First Creature', 'It travels with you. Every other creature in the vale is yours to catch.'), cards, row);
  render();
  (cards.querySelector('.is-on') as HTMLElement)?.focus();
  ui.menuKeyHandler = arrowNav(ui.screen);
}
