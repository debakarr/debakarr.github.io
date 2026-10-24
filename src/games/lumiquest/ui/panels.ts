// In-game panels: world map, creature collection, rest, pause, settings and
// credits. Every number shown here is read from the live game state.

import { ELEMENT_COLOR, ELEMENT_NAME, SPECIES, SPECIES_BY_ID, variantName, type Element } from '../data/species';
import { LOCATIONS } from '../data/world';
import { keyLabel } from '../engine/input';
import { CATCH_RATE } from '../systems/catching';
import { ACTION_LABELS, DEFAULT_BINDINGS, DEFAULT_SETTINGS, type Action, type Quality, type Settings } from '../systems/save';
import { clockLabel, day } from '../systems/state';
import { bar, button, el, h, html, panel, portrait, tabs } from './kit';
import { icon } from './icons';
import { MapView } from './map';
import { escapeHtml, type UI } from './ui';

type KeyNode = HTMLElement & { lqKey?: (e: KeyboardEvent) => boolean | void };

export function open(ui: UI, name: string): void {
  switch (name) {
    case 'map':
      return mapPanel(ui);
    case 'collection':
      return collection(ui);
    case 'rest':
      return rest(ui);
    case 'pause':
      return pause(ui);
    case 'settings':
      return settings(ui);
    case 'credits':
      return credits(ui);
  }
}

const close = (ui: UI) => () => ui.closeTop();

// ---------------------------------------------------------------------------

function mapPanel(ui: UI): void {
  const g = ui.game;
  ui.map ??= new MapView(g);
  const map = ui.map;
  const { root, body } = panel('World Map', 'map', close(ui), 'lq-panel-wide lq-map-panel');
  const legend = el('div', 'lq-map-legend');
  const kinds: [string, string, string][] = [
    ['player', 'Current location', '#ffd75a'], ['quest', 'Quest', '#f2c35a'], ['town', 'Town', '#ffb45a'], ['landmark', 'Landmark', '#8ff0ff'],
    ['ruin', 'Ancient ruin', '#d8cfc0'], ['cave', 'Cave', '#b9a2ff'], ['nature', 'Wild area', '#7fd06a'], ['secret', 'Secret', '#ff8fc0'],
  ];
  for (const [ic, label] of kinds) legend.append(html('lq-legend-row', `${icon(ic)}<span>${label}</span>`));
  const found = g.state.discovered.length;
  legend.append(html('lq-legend-count', `${found} / ${LOCATIONS.length} places discovered`));
  const here = html('lq-map-here', `${icon('player')}<span>You are in <b>${escapeHtml(ui.locationName(g.player.pos.x, g.player.pos.z))}</b></span>`);
  legend.append(here);
  const info = el('div', 'lq-map-info');
  info.textContent = 'Hover or tap a discovered place to learn about it.';
  legend.append(info);
  const canvas = h('canvas', { class: 'lq-map-canvas', width: '720', height: '720', 'aria-label': 'World map' });
  let hover: string | null = null;
  const draw = () => map.drawFull(canvas, { hover });
  const pick = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const scale = canvas.width / 512;
    const mx = ((e.clientX - r.left) / r.width) * canvas.width;
    const my = ((e.clientY - r.top) / r.height) * canvas.height;
    const l = map.pick(mx, my, scale);
    hover = l?.id ?? null;
    info.innerHTML = l ? `<b>${l.name}</b><br>${l.blurb}` : 'Hover or tap a discovered place to learn about it.';
    draw();
  };
  canvas.addEventListener('pointermove', pick);
  canvas.addEventListener('pointerdown', pick);
  body.append(el('div', 'lq-map-wrap', legend, el('div', 'lq-map-frame', canvas)));
  ui.push('map', root);
  draw();
}

// ---------------------------------------------------------------------------

function collection(ui: UI, focus?: string): void {
  const g = ui.game;
  const s = g.state;
  const { root, body } = panel('Creature Collection', 'paw', close(ui), 'lq-panel-wide');
  let filter: Element | 'all' = 'all';
  let selected = focus ?? (g.target?.kind === 'creature' ? g.target.creature.species : s.bonded.find((b) => b.uid === s.active)?.species ?? 'flamkit');
  const side = el('div', 'lq-col-filter');
  const grid = el('div', 'lq-col-grid');
  const detail = el('div', 'lq-col-detail');
  const draw = () => {
    side.replaceChildren();
    const elements: (Element | 'all')[] = ['all', 'fire', 'water', 'earth', 'air', 'light', 'plant'];
    for (const e of elements) {
      const b = h('button', { class: `lq-filter${filter === e ? ' is-on' : ''}`, type: 'button' });
      b.innerHTML = e === 'all' ? `${icon('paw')}<span>All</span>` : `${icon(e)}<span>${ELEMENT_NAME[e]}</span>`;
      b.addEventListener('click', () => {
        filter = e;
        draw();
      });
      side.append(b);
    }
    const caughtKinds = SPECIES.filter((x) => s.species[x.id].bonded > 0).length;
    side.append(html('lq-col-count', `<b>${caughtKinds}</b> / ${SPECIES.length} species caught<br><b>${s.bonded.length}</b> creatures in all<br><b>${SPECIES.filter((x) => s.species[x.id].seen).length}</b> seen`));
    grid.replaceChildren();
    for (const sp of SPECIES) {
      if (filter !== 'all' && sp.element !== filter) continue;
      const rec = s.species[sp.id];
      const known = rec.seen || rec.observed > 0;
      const card = h('button', { class: `lq-col-card${selected === sp.id ? ' is-on' : ''}${rec.bonded ? ' is-bonded' : ''}`, type: 'button', 'aria-label': known ? sp.name : 'Unknown creature' });
      if (known) card.innerHTML = `<img alt="" src="${portrait(g.host.renderer, sp.id, null, 112)}"><span>${sp.name}</span>${rec.bonded ? `<i class="lq-col-badge">${icon('heart')}</i>` : ''}`;
      else card.innerHTML = `<div class="lq-col-unknown">?</div><span>???</span>`;
      card.addEventListener('click', () => {
        selected = sp.id;
        draw();
      });
      grid.append(card);
    }
    // detail
    const sp = SPECIES_BY_ID[selected as keyof typeof SPECIES_BY_ID];
    const rec = s.species[sp.id];
    detail.replaceChildren();
    if (!rec.seen && !rec.observed) {
      detail.append(html('lq-col-empty', `<div class="lq-col-unknown big">?</div><p>You have not met this creature yet. Explore the vale to find it.</p>`));
      return;
    }
    const observed = rec.bonded > 0 || rec.observed > 0;
    const status = rec.bonded ? `Caught ×${rec.bonded}` : 'Seen';
    const odds = CATCH_RATE[sp.id];
    const ease = odds >= 0.55 ? 'Easy to catch' : odds >= 0.4 ? 'Takes some care' : 'Tricky to catch';
    detail.innerHTML = `
      <div class="lq-col-hero"><img alt="" src="${portrait(g.host.renderer, sp.id, null, 200)}">
        <div><h3>${sp.name}</h3><span class="lq-elem" style="--c:${ELEMENT_COLOR[sp.element]}">${icon(sp.element)}${ELEMENT_NAME[sp.element]}</span>
        <span class="lq-status">${status}</span>
        <p>${observed ? sp.blurb : 'Catch one to learn more about it.'}</p></div></div>
      ${observed ? `<dl class="lq-st-facts">
        <dt>Personality</dt><dd>${sp.personality}</dd>
        <dt>Habitat</dt><dd>${sp.habitat.join(', ')}${sp.active === 'night' ? ' • comes out at night' : sp.active === 'day' ? ' • sleeps at night' : ''}</dd>
        <dt>Catching</dt><dd><b>${ease}.</b> ${sp.tip}</dd>
      </dl><p class="lq-lore">${sp.lore}</p>
      <div class="lq-col-variants">Rare colours: ${sp.variants.map((v) => (s.bonded.some((b) => b.species === sp.id && b.variant === v.id) ? `<b>${v.name}</b>` : '???')).join(', ')}</div>` : `<p class="lq-muted">Seen in: ${sp.habitat.join(', ')}${sp.active === 'night' ? ', at night' : ''}.</p>`}`;
    const mine = s.bonded.filter((b) => b.species === sp.id);
    if (mine.length) {
      const list = el('div', 'lq-col-bonded');
      list.append(el('h4', '', 'Your creatures'));
      for (const b of mine) {
        const row = el('div', `lq-bond-row${b.uid === s.active ? ' is-active' : ''}`);
        row.innerHTML = `<img alt="" src="${portrait(g.host.renderer, b.species, b.variant, 72)}"><div class="lq-bond-meta"><b>${escapeHtml(b.name)}</b><span>${variantName(b.species, b.variant)} • caught day ${b.bondedDay}</span></div>`;
        const meta = row.querySelector('.lq-bond-meta')!;
        meta.append(bar(b.friendship, '#ff8fc0', 'Friendship'));
        const acts = el('div', 'lq-bond-acts');
        if (b.uid !== s.active) acts.append(button('Set active', () => {
          g.setActive(b.uid);
          draw();
        }, { cls: 'lq-btn-small lq-btn-primary' }));
        else acts.append(el('span', 'lq-active-tag', 'Active'));
        acts.append(button('Rename', () => {
          const input = h('input', { class: 'lq-input', maxlength: '16', value: b.name, 'aria-label': 'New name' });
          const ok = button('Save', () => {
            g.renameCompanion(b.uid, input.value.replace(/[<>]/g, ''));
            draw();
          }, { cls: 'lq-btn-small lq-btn-primary' });
          acts.replaceChildren(input, ok);
          input.focus();
          input.addEventListener('keydown', (e) => {
            if (e.code === 'Enter') ok.click();
          });
        }, { cls: 'lq-btn-small' }));
        row.append(acts);
        list.append(row);
      }
      detail.append(list);
    }
  };
  body.append(el('div', 'lq-col', side, grid, detail));
  ui.push('collection', root);
  draw();
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

function rest(ui: UI): void {
  const g = ui.game;
  const { root, body } = panel('Rest by the campfire', 'moon', close(ui));
  body.append(el('p', '', `It is ${clockLabel(g.state.clock)} on day ${day(g.state)}. Resting passes time (some creatures only come out at night), restocks your Lumi orbs and saves your progress.`));
  const row = el('div', 'lq-rest');
  for (const [label, hr, ic] of [['Until morning', 6, 'sun'], ['Until noon', 12, 'sun'], ['Until evening', 18, 'cloud'], ['Until night', 22, 'moon']] as [string, number, string][]) {
    row.append(button(label, () => {
      ui.closeTop();
      g.rest(hr);
    }, { icon: ic }));
  }
  body.append(row);
  ui.push('rest', root);
}

// ---------------------------------------------------------------------------

function pause(ui: UI): void {
  const g = ui.game;
  const { root, body } = panel('Paused', 'pause', () => g.resume(), 'lq-pause');
  const menu = el('div', 'lq-pause-menu');
  menu.append(
    button('Resume', () => g.resume(), { cls: 'lq-btn-primary', icon: 'spark' }),
    button('Save game', () => g.saveNow(false), { icon: 'check' }),
    button('Map', () => ui.openPanel('map'), { icon: 'map' }),
    button('Settings', () => ui.openPanel('settings'), { icon: 'gear' }),
    button('Stuck? Return to the outpost', () => {
      g.resetPlayerTo('outpost');
      g.resume();
    }, { icon: 'town' }),
    button('Save & quit to title', () => g.quitToTitle(), { icon: 'close' }),
  );
  body.append(menu, html('lq-muted lq-pause-foot', `${escapeHtml(g.state.appearance.name)} • Day ${day(g.state)} • ${Math.floor(g.state.playSeconds / 60)} min played`));
  ui.push('pause', root, () => {
    if (g.paused) g.paused = false;
  });
}

// ---------------------------------------------------------------------------

function settings(ui: UI): void {
  const g = ui.game;
  const s: Settings = structuredClone(g.settings);
  const { root, body } = panel('Settings', 'gear', close(ui), 'lq-panel-wide');
  let tab: 'graphics' | 'controls' | 'audio' | 'world' = 'graphics';
  let rebinding: Action | null = null;
  const commit = () => g.applySettings(structuredClone(s));
  const slider = (label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, onChange: (v: number) => void) => {
    const id = `lq-s-${Math.random().toString(36).slice(2)}`;
    const wrap = el('div', 'lq-field lq-slider');
    const lab = h('label', { for: id, class: 'lq-field-label' }, label);
    const out = el('output', 'lq-slider-out', fmt(value));
    const input = h('input', { id, type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = fmt(v);
      onChange(v);
      commit();
    });
    wrap.append(lab, input, out);
    return wrap;
  };
  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => {
    const b = h('button', { class: `lq-toggle${value ? ' is-on' : ''}`, type: 'button', role: 'switch', 'aria-checked': value ? 'true' : 'false' }, label);
    b.addEventListener('click', () => {
      value = !value;
      b.classList.toggle('is-on', value);
      b.setAttribute('aria-checked', value ? 'true' : 'false');
      onChange(value);
      commit();
    });
    return b;
  };
  const draw = () => {
    body.replaceChildren();
    body.append(tabs([{ id: 'graphics', label: 'Graphics' }, { id: 'controls', label: 'Controls' }, { id: 'audio', label: 'Audio' }, { id: 'world', label: 'World & data' }], tab, (t) => {
      tab = t as typeof tab;
      rebinding = null;
      draw();
    }));
    const pane = el('div', 'lq-settings');
    if (tab === 'graphics') {
      const q = el('div', 'lq-field');
      q.append(el('div', 'lq-field-label', 'Quality'));
      const row = el('div', 'lq-choices');
      for (const [id, label] of [['auto', 'Auto (adaptive)'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] as [Quality, string][]) {
        const b = h('button', { class: `lq-choice${s.quality === id ? ' is-on' : ''}`, type: 'button' }, label);
        b.addEventListener('click', () => {
          s.quality = id;
          commit();
          draw();
        });
        row.append(b);
      }
      q.append(row, el('p', 'lq-muted', 'Low shortens draw distance, thins grass and shrinks shadows for phones and older laptops. Auto also lowers the render resolution when frames run long.'));
      pane.append(q, toggle('Shadows', s.shadows, (v) => (s.shadows = v)), toggle('Show frame rate', s.showFps, (v) => (s.showFps = v)));
    } else if (tab === 'controls') {
      pane.append(
        slider('Look sensitivity', s.sensitivity, 0.2, 3, 0.1, (v) => `${v.toFixed(1)}×`, (v) => (s.sensitivity = v)),
        slider('Field of view', s.fov, 50, 90, 1, (v) => `${v}°`, (v) => (s.fov = v)),
        toggle('Invert look up/down', s.invertY, (v) => (s.invertY = v)),
      );
      const binds = el('div', 'lq-binds');
      binds.append(el('div', 'lq-field-label', 'Keys (click to rebind, Esc to cancel)'));
      for (const a of Object.keys(DEFAULT_BINDINGS) as Action[]) {
        const row = el('div', 'lq-bind-row');
        row.append(el('span', '', ACTION_LABELS[a]));
        const b = h('button', { class: `lq-bind${rebinding === a ? ' is-on' : ''}`, type: 'button' }, rebinding === a ? 'Press a key…' : keyLabel(s.bindings[a]));
        b.addEventListener('click', () => {
          rebinding = a;
          draw();
        });
        row.append(b);
        binds.append(row);
      }
      binds.append(button('Reset keys', () => {
        s.bindings = { ...DEFAULT_BINDINGS };
        commit();
        draw();
      }, { cls: 'lq-btn-small' }));
      binds.append(el('p', 'lq-muted', 'Arrow keys also move, C also crouches. On touch screens use the on-screen stick and buttons.'));
      pane.append(binds);
    } else if (tab === 'audio') {
      const pct = (v: number) => `${Math.round(v * 100)}%`;
      pane.append(
        slider('Master volume', s.master, 0, 1, 0.05, pct, (v) => (s.master = v)),
        slider('Music', s.music, 0, 1, 0.05, pct, (v) => (s.music = v)),
        slider('Sound effects', s.sfx, 0, 1, 0.05, pct, (v) => (s.sfx = v)),
        slider('Ambience', s.ambient, 0, 1, 0.05, pct, (v) => (s.ambient = v)),
      );
    } else {
      const dayRow = el('div', 'lq-field');
      dayRow.append(el('div', 'lq-field-label', 'Length of a day'));
      const row = el('div', 'lq-choices');
      for (const [m, label] of [[12, '12 min'], [24, '24 min'], [48, '48 min'], [0, 'Frozen']] as [number, string][]) {
        const b = h('button', { class: `lq-choice${s.dayMinutes === m ? ' is-on' : ''}`, type: 'button' }, label);
        b.addEventListener('click', () => {
          s.dayMinutes = m;
          commit();
          draw();
        });
        row.append(b);
      }
      dayRow.append(row);
      pane.append(dayRow);
      if (g.phase === 'play') {
        const wRow = el('div', 'lq-field');
        wRow.append(el('div', 'lq-field-label', 'Weather (until it changes on its own)'));
        const wc = el('div', 'lq-choices');
        for (const [k, label] of [['clear', 'Clear'], ['cloudy', 'Cloudy'], ['rain', 'Light rain'], ['mist', 'Mist']] as const) {
          const b = h('button', { class: `lq-choice${g.state.weather.kind === k ? ' is-on' : ''}`, type: 'button' }, label);
          b.addEventListener('click', () => {
            g.setWeather(k);
            draw();
          });
          wc.append(b);
        }
        wRow.append(wc);
        pane.append(wRow);
      }
      const data = el('div', 'lq-field');
      data.append(el('div', 'lq-field-label', 'Saved data'));
      data.append(el('p', 'lq-muted', 'Your game saves automatically in this browser (and when you rest). Resetting deletes it permanently.'));
      data.append(button('Reset save…', () => ui.confirm('Delete your save?', 'This permanently deletes your character, companions and progress in this browser.', 'Delete save', () => {
        g.resetSave();
        if (g.phase === 'play') g.quitToTitleWithoutSaving();
        else g.showTitle();
      }), { cls: 'lq-btn-danger' }));
      data.append(button('Restore default settings', () => {
        Object.assign(s, structuredClone(DEFAULT_SETTINGS));
        commit();
        draw();
      }, { cls: 'lq-btn-small' }));
      pane.append(data);
    }
    body.append(pane);
  };
  (root as KeyNode).lqKey = (e) => {
    if (!rebinding) return;
    if (e.code === 'Escape') {
      rebinding = null;
      draw();
      return true;
    }
    s.bindings[rebinding] = e.code;
    rebinding = null;
    commit();
    draw();
    return true;
  };
  ui.push('settings', root);
  draw();
}

function credits(ui: UI): void {
  const { root, body } = panel('Credits', 'star', close(ui));
  body.innerHTML = `
    <p><b>LumiQuest</b> — an original creature adventure by Debakar Roy.</p>
    <p>Every character, creature, building, plant, texture, sound and piece of music in the game is generated in code at load time. The creatures and the world of Lumeria are original designs.</p>
    <ul class="lq-credits">
      <li><a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> — 3D rendering (MIT)</li>
      <li><a href="https://fonts.google.com/specimen/Lilita+One" target="_blank" rel="noopener">Lilita One</a> by Juan Montoreano — title font (SIL Open Font License)</li>
      <li><a href="https://fonts.google.com/specimen/Nunito" target="_blank" rel="noopener">Nunito</a> by Vernon Adams et al. — interface font (SIL Open Font License)</li>
      <li>Built with <a href="https://astro.build" target="_blank" rel="noopener">Astro</a>, hosted on GitHub Pages.</li>
    </ul>`;
  ui.push('credits', root);
}
