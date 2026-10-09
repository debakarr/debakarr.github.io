// Title screen and the creation flow: choose a character, customize them,
// choose your first companion. Previews are live 3D models in the studio.

import {
  ACCESSORIES, EYE_COLORS, FACES, HAIR_COLORS, HAIRS, OUTFIT_COLORS, OUTFITS, PRESETS, SKIN_TONES, presetAppearance,
  type AccessoryId, type Appearance,
} from '../data/characters';
import { ABILITIES, ELEMENT_COLOR, ELEMENT_NAME, SPECIES_BY_ID, STARTERS, type SpeciesId } from '../data/species';
import { CharacterModel } from '../entities/character';
import { buildCreature } from '../entities/creatureModel';
import { button, choiceRow, el, h, html, swatches, tabs } from './kit';
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

export function charSelect(ui: UI): void {
  const g = ui.game;
  ui.clearScreen();
  g.studio.clear();
  ui.screen.className = 'lq-screen lq-create lq-charselect';
  let selected = g.draft.appearance.preset || 'aero';
  const models = PRESETS.map((p) => new CharacterModel(presetAppearance(p.id), false));
  const big = new CharacterModel(presetAppearance(selected), false);
  big.animator.play('wave', 0);
  const preview = el('div', 'lq-preview');
  preview.setAttribute('aria-label', 'Character preview: drag to rotate');
  preview.append(el('div', 'lq-preview-hint', 'Drag to rotate • scroll to zoom'));
  const info = el('div', 'lq-cs-info lq-panel');
  const cards = el('div', 'lq-cs-cards');
  cards.setAttribute('role', 'radiogroup');
  const render = () => {
    const p = PRESETS.find((x) => x.id === selected)!;
    big.setAppearance(presetAppearance(selected));
    info.innerHTML = `<div class="lq-cs-name">${p.name}</div><div class="lq-cs-pron">${p.pronoun === 'she' ? '♀' : p.pronoun === 'he' ? '♂' : '⚧'} ${p.pronoun === 'they' ? 'they/them' : p.pronoun === 'she' ? 'she/her' : 'he/him'}</div><p class="lq-cs-pers">${p.personality}</p><p class="lq-muted">A starting look, not a class: you can change everything on the next screen.</p>`;
    cards.querySelectorAll('.lq-cs-card').forEach((c) => {
      const on = (c as HTMLElement).dataset.id === selected;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  };
  PRESETS.forEach((p, i) => {
    const card = h('button', { class: 'lq-cs-card', type: 'button', role: 'radio', dataset: { id: p.id }, 'aria-label': `${p.name}: ${p.personality}` });
    const view = el('div', 'lq-cs-view');
    card.append(view, el('span', 'lq-cs-card-name', p.name));
    card.addEventListener('click', () => {
      selected = p.id;
      g.audio.click();
      render();
    });
    cards.append(card);
    g.studio.add({ el: view, object: models[i].root, dist: 3.4, target: 0.78, spin: false, pedestal: true, tick: (dt) => models[i].update(dt), yaw: 0.3 });
  });
  g.studio.add({ el: preview, object: big.root, dist: 3.9, target: 0.82, spin: false, pedestal: true, tick: (dt) => big.update(dt), yaw: 0.25 });
  const row = el('div', 'lq-cr-actions');
  const back = button('Back', () => ui.back(), { icon: 'close' });
  const next = button('Continue', () => {
    g.audio.click();
    teardown();
    g.toCustomize(selected);
  }, { cls: 'lq-btn-primary', icon: 'spark' });
  row.append(back, next);
  const teardown = () => {
    g.studio.clear();
    models.forEach((m) => m.dispose());
    big.dispose();
  };
  ui.backHandler = () => {
    teardown();
    g.showTitle();
  };
  ui.screen.append(header('Create Your Character', 'Begin your journey in the world of Lumeria'), el('div', 'lq-cs-main', preview, el('div', 'lq-cs-side', info, cards)), row);
  render();
  (cards.querySelector('.is-on') as HTMLElement)?.focus();
  ui.menuKeyHandler = arrowNav(ui.screen);
}

// ---------------------------------------------------------------------------

type CustomTab = 'appearance' | 'hair' | 'outfit' | 'accessories';

export function customize(ui: UI): void {
  const g = ui.game;
  ui.clearScreen();
  g.studio.clear();
  ui.screen.className = 'lq-screen lq-create lq-customize';
  const a: Appearance = structuredClone(g.draft.appearance);
  const model = new CharacterModel(a, false);
  model.animator.play('idle', 0);
  let tab: CustomTab = 'appearance';
  const preview = el('div', 'lq-preview');
  preview.append(el('div', 'lq-preview-hint', 'Drag to rotate • scroll to zoom'));
  const view = g.studio.add({ el: preview, object: model.root, dist: 4.2, target: 0.85, spin: false, pedestal: true, tick: (dt) => model.update(dt), yaw: 0.25 });
  const side = el('div', 'lq-panel lq-cust-panel');
  const tabsEl = el('div', 'lq-cust-tabs');
  const body = el('div', 'lq-cust-body');
  side.append(tabsEl, body);
  const apply = () => {
    model.setAppearance(a);
    g.draft.appearance = structuredClone(a);
  };
  const section = (label: string, content: HTMLElement) => el('div', 'lq-field', el('div', 'lq-field-label', label), content);
  const draw = () => {
    tabsEl.replaceChildren(tabs<CustomTab>([
      { id: 'appearance', label: 'Appearance', icon: 'spark' },
      { id: 'hair', label: 'Hair', icon: 'blossom' },
      { id: 'outfit', label: 'Outfit', icon: 'bag' },
      { id: 'accessories', label: 'Accessories', icon: 'star' },
    ], tab, (t) => {
      tab = t;
      g.audio.click();
      draw();
    }));
    body.replaceChildren();
    const pick = <K extends keyof Appearance>(k: K) => (v: Appearance[K]) => {
      a[k] = v;
      g.audio.hover();
      apply();
      draw();
    };
    if (tab === 'appearance') {
      const nameInput = h('input', { class: 'lq-input', type: 'text', maxlength: '16', value: a.name, 'aria-label': 'Character name', autocomplete: 'off', spellcheck: 'false' });
      nameInput.addEventListener('input', () => {
        a.name = nameInput.value.replace(/[<>]/g, '').slice(0, 16) || 'Ranger';
        g.draft.appearance.name = a.name;
      });
      body.append(
        section('Name', nameInput),
        section('Skin tone', swatches(SKIN_TONES, a.skin, pick('skin'), 'Skin tone')),
        section('Face', choiceRow(FACES, a.face, pick('face'))),
        section('Eye colour', swatches(EYE_COLORS, a.eye, pick('eye'), 'Eye colour')),
      );
    } else if (tab === 'hair') {
      body.append(section('Hairstyle', choiceRow(HAIRS, a.hair, pick('hair'))), section('Hair colour', swatches(HAIR_COLORS, a.hairColor, pick('hairColor'), 'Hair colour')));
      view.dist = 3.0;
      view.target = 1.05;
    } else if (tab === 'outfit') {
      body.append(
        section('Outfit', choiceRow(OUTFITS.map((o) => ({ id: o.id, name: o.name })), a.outfit, pick('outfit'))),
        el('p', 'lq-muted', OUTFITS.find((o) => o.id === a.outfit)!.blurb),
        section('Main colour', swatches(OUTFIT_COLORS, a.outfitMain, pick('outfitMain'), 'Main colour')),
        section('Accent colour', swatches(OUTFIT_COLORS, a.outfitAccent, pick('outfitAccent'), 'Accent colour')),
      );
    } else {
      body.append(section('Accessories (pick any)', choiceRow<AccessoryId>(ACCESSORIES, a.accessories, (id) => {
        a.accessories = a.accessories.includes(id) ? a.accessories.filter((x) => x !== id) : [...a.accessories, id];
        g.audio.hover();
        apply();
        draw();
      }, true)));
    }
    if (tab !== 'hair') {
      view.dist = 4.2;
      view.target = 0.85;
    }
  };
  const row = el('div', 'lq-cr-actions');
  const teardown = () => {
    g.studio.clear();
    model.dispose();
  };
  row.append(
    button('Back', () => ui.back(), { icon: 'close' }),
    button('Randomize', () => {
      const r = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
      a.skin = r(SKIN_TONES);
      a.face = r(FACES).id;
      a.eye = r(EYE_COLORS);
      a.hair = r(HAIRS).id;
      a.hairColor = r(HAIR_COLORS);
      a.outfit = r(OUTFITS).id;
      a.outfitMain = r(OUTFIT_COLORS);
      a.outfitAccent = r(OUTFIT_COLORS.filter((c) => c !== a.outfitMain));
      a.accessories = ACCESSORIES.filter(() => Math.random() < 0.4).map((x) => x.id);
      g.audio.click();
      apply();
      draw();
    }, { icon: 'spark' }),
    button('Confirm Appearance', () => {
      g.audio.click();
      g.draft.appearance = structuredClone(a);
      teardown();
      g.toStarter();
    }, { cls: 'lq-btn-primary', icon: 'check' }),
  );
  ui.backHandler = () => {
    teardown();
    g.newGame();
  };
  ui.screen.append(header('Customize', 'Make your ranger your own'), el('div', 'lq-cust-main', side, preview), row);
  draw();
  ui.menuKeyHandler = arrowNav(ui.screen);
}

// ---------------------------------------------------------------------------

export function starter(ui: UI): void {
  const g = ui.game;
  ui.clearScreen();
  g.studio.clear();
  ui.screen.className = 'lq-screen lq-create lq-starter';
  let selected: SpeciesId = g.draft.starter ?? 'flamkit';
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
    const ab = ABILITIES[def.ability];
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
        <dt>Ability</dt><dd><b>${ab.name}</b> — ${ab.summary}</dd>
        <dt>Favourite</dt><dd>${escapeHtml(def.likes === 'sunberry' ? 'Sunberries' : def.likes === 'kelp' ? 'River Kelp' : 'Crunchroot')}</dd>
      </dl>`);
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
    g.toCustomize(g.draft.appearance.preset, true);
  };
  ui.screen.append(header('Choose Your First Companion', 'Drag a creature to turn it. Others can be befriended in the wild later.'), cards, row);
  render();
  (cards.querySelector('.is-on') as HTMLElement)?.focus();
  ui.menuKeyHandler = arrowNav(ui.screen);
}
