import { CORNERS } from '../../core/hex';
import { randomSeedString } from '../../../shared/rng';
import { F, T, TERRAIN_COLOR } from '../../data/terrain';
import type { Game } from '../../sim/game';
import { DEFAULT_SETTINGS } from '../../sim/newgame';
import { deleteSave, deserialize, exportFileName, listSaves, loadFromStorage, saveToStorage, serialize, type SaveMeta } from '../../sim/save';
import type { MapSize, MapType, Pace, Settings, WorldMap } from '../../sim/state';
import { generateWorld, gridFor, parseWorldCode, worldCode } from '../../sim/worldgen';
import { iconCredits } from '../../art';
import { clear, download, h, pickFile, svg } from '../dom';
import { ICON } from '../icons';
import { closeModal, openModal } from '../modal';

export interface MenuHost {
  root: HTMLElement;
  game: () => Game | null;
  start: (settings: Settings) => void;
  load: (g: Game) => void;
  toTitle: () => void;
  settings: { sound: boolean; animations: boolean; tips: boolean };
  saveSettings: () => void;
  toast: (text: string, tone?: 'good' | 'bad' | 'info') => void;
}

/** Draw a whole world as tiny hexes — for previews and the title backdrop. */
export function renderWorldPreview(canvas: HTMLCanvasElement, map: WorldMap, cssWidth: number, cssHeight: number, maxDpr = 2): void {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext('2d')!;
  const grid = gridFor(map.w, map.h);
  const s = Math.max(canvas.width / grid.pixelWidth(1), canvas.height / grid.pixelHeight(1));
  const offX = (canvas.width - grid.pixelWidth(s)) / 2;
  const offY = (canvas.height - grid.pixelHeight(s)) / 2;
  ctx.fillStyle = '#1e3a54';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < map.w * map.h; i++) {
    const [cx, cy] = grid.center(i, s);
    const t = map.terrain[i];
    let [r, g, b] = TERRAIN_COLOR[t];
    if (map.relief[i] === 2) [r, g, b] = [118, 108, 96];
    else if (map.feature[i] === F.Forest) [r, g, b] = [r * 0.8, g * 0.86, b * 0.8];
    else if (map.feature[i] === F.Jungle) [r, g, b] = [r * 0.7, g * 0.82, b * 0.72];
    else if (map.feature[i] === F.Ice) [r, g, b] = [222, 232, 238];
    if (t <= T.Lake) {
      const k = 0.8 + (map.elevation[i] / 127) * 0.3;
      r *= k;
      g *= k;
      b *= k;
    }
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const x = offX + cx + CORNERS[k][0] * (s + 0.6);
      const y = offY + cy + CORNERS[k][1] * (s + 0.6);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.fill();
  }
  ctx.strokeStyle = '#3f86ad';
  ctx.lineWidth = Math.max(1, s * 0.25);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < map.w * map.h; i++) {
    if (!map.river[i] || map.riverTo[i] < 0) continue;
    const [ax, ay] = grid.center(i, s);
    const [bx, by] = grid.center(map.riverTo[i], s);
    ctx.moveTo(offX + ax, offY + ay);
    ctx.lineTo(offX + bx, offY + by);
  }
  ctx.stroke();
}

// --- Title ---------------------------------------------------------------------------

export function showTitle(host: MenuHost, container: HTMLElement): void {
  clear(container);
  const bg = h('canvas', { class: 'yz-title-bg' });
  const saves = listSaves();
  const auto = saves.find((s) => s.key === 'auto');
  const card = h('div', { class: 'yz-title-card yz-panel' },
    h('h1', { class: 'yz-logo' }, 'YEAR ZERO'),
    h('p', { class: 'yz-tagline' }, 'Every civilization begins somewhere. Yours begins now.'),
    h('div', { class: 'yz-title-actions' },
      auto ? h('button', {
        class: 'yz-btn primary',
        onclick: async () => {
          try {
            host.load(await loadFromStorage('auto'));
          } catch (e) {
            host.toast(`Could not continue: ${(e as Error).message}`, 'bad');
          }
        },
      }, svg(ICON.play), h('span', null, 'Continue ', h('span', { class: 'yz-continue-meta' }, `· the ${auto.civ}, Year ${auto.year}`))) : null,
      h('button', { class: `yz-btn${auto ? '' : ' primary'}`, onclick: () => showNewGame(host) }, svg(ICON.globe), 'New civilization'),
      saves.length ? h('button', { class: 'yz-btn', onclick: () => showLoad(host) }, svg(ICON.save), 'Load a saved game') : null,
      h('button', { class: 'yz-btn', onclick: () => importSave(host) }, svg(ICON.upload), 'Import a save file'),
      h('button', { class: 'yz-btn', onclick: () => showHelp(host.root) }, svg(ICON.info), 'How to play')),
    h('p', { class: 'yz-muted', style: { fontSize: '12px', margin: '18px 0 0' } },
      h('a', { href: '/games', style: { color: 'inherit' } }, '← Back to games'), ' · ',
      h('button', { class: 'yz-linkbtn', onclick: () => showCredits(host.root) }, 'Credits')),
    h('p', { class: 'yz-muted', style: { fontSize: '11px', margin: '6px 0 0' } },
      'Map art by Kenney (CC0) · Icons from game-icons.net (CC BY 3.0)'));
  const screen = h('div', { class: 'yz-title' }, bg, card);
  container.append(screen);
  requestAnimationFrame(() => {
    const rect = screen.getBoundingClientRect();
    const w = generateWorld({ ...DEFAULT_SETTINGS, seed: randomSeedString(), size: 'small', mapType: 'continents' });
    // The backdrop is dimmed and softened: 1x resolution is plenty and saves memory.
    renderWorldPreview(bg, w.map, rect.width, rect.height, 1);
  });
}

export function hideTitle(container: HTMLElement): void {
  clear(container);
}

// --- New game --------------------------------------------------------------------------

export function showNewGame(host: MenuHost): void {
  const s: Settings = { ...DEFAULT_SETTINGS, seed: randomSeedString() };
  const preview = h('canvas', { class: 'yz-preview' });
  let timer = 0;
  const redraw = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const w = generateWorld(s);
      const width = preview.clientWidth || 480;
      renderWorldPreview(preview, w.map, width, Math.round(width * 0.6));
    }, 120);
  };
  const selects: Partial<Record<keyof Settings, HTMLSelectElement>> = {};
  const select = <K extends keyof Settings>(key: K, options: [Settings[K], string][]) => {
    const el = h('select', { class: 'yz-select', onchange: () => {
      const raw = el.value;
      (s as unknown as Record<string, unknown>)[key] = typeof s[key] === 'number' ? Number(raw) : raw;
      redraw();
    } }, options.map(([v, label]) => h('option', { value: String(v), selected: s[key] === v }, label)));
    selects[key] = el;
    return el;
  };
  const nameInput = h('input', { type: 'text', maxlength: 14, placeholder: 'Leave empty to let history decide', value: s.playerName, oninput: () => (s.playerName = nameInput.value.replace(/[^\p{L}\s'-]/gu, '')) });
  const seedInput = h('input', { type: 'text', maxlength: 60, value: s.seed, oninput: () => {
    // A pasted world code (seed/size/type/rivals) sets everything at once.
    const code = parseWorldCode(seedInput.value);
    if (code) {
      Object.assign(s, code);
      for (const k of ['size', 'mapType', 'rivals'] as const) if (selects[k]) selects[k]!.value = String(s[k]);
    } else s.seed = seedInput.value || 'year-zero';
    redraw();
  } });
  openModal(host.root, {
    title: 'A New Civilization',
    icon: 'globe',
    render: (body) => {
      body.append(h('div', { class: 'yz-form' },
        h('div', { class: 'yz-field full' }, h('label', { class: 'yz-label' }, 'Name of your people'), h('div', { class: 'yz-input' }, nameInput)),
        h('div', { class: 'yz-field full' }, h('label', { class: 'yz-label' }, 'World seed — or paste a world code to recreate a shared world'),
          h('div', { class: 'yz-input' }, seedInput,
            h('button', { class: 'yz-btn', title: 'Random seed', onclick: () => { s.seed = randomSeedString(); seedInput.value = s.seed; redraw(); } }, svg(ICON.dice)),
            h('button', { class: 'yz-btn', title: 'Copy world code', onclick: () => { void navigator.clipboard?.writeText(worldCode(s)); host.toast(`World code copied: ${worldCode(s)}`); } }, svg(ICON.copy)))),
        h('div', { class: 'yz-field' }, h('label', { class: 'yz-label' }, 'World'), select('mapType', [['continents', 'Continents'], ['pangaea', 'Pangaea'], ['archipelago', 'Archipelago'], ['lakes', 'Inland seas']] as [MapType, string][])),
        h('div', { class: 'yz-field' }, h('label', { class: 'yz-label' }, 'Size'), select('size', [['small', 'Small'], ['standard', 'Standard'], ['large', 'Large']] as [MapSize, string][])),
        h('div', { class: 'yz-field' }, h('label', { class: 'yz-label' }, 'Other peoples'), select('rivals', [2, 3, 4, 5, 6, 7].map((n) => [n, String(n)] as [number, string]))),
        h('div', { class: 'yz-field' }, h('label', { class: 'yz-label' }, 'Difficulty'), select('difficulty', [[0, 'Gentle'], [1, 'Standard'], [2, 'Hard'], [3, 'Brutal']] as [number, string][])),
        h('div', { class: 'yz-field full' }, h('label', { class: 'yz-label' }, 'Pace of history'), select('pace', [['quick', 'Quick — about 250 years to the stars'], ['standard', 'Standard — about 400 years'], ['epic', 'Epic — a long saga']] as [Pace, string][])),
        h('div', { class: 'yz-field full' }, h('label', { class: 'yz-label' }, 'Preview'), preview)));
      redraw();
    },
    foot: (foot) => {
      foot.append(h('button', { class: 'yz-btn', onclick: () => closeModal() }, 'Cancel'),
        h('button', { class: 'yz-btn primary', onclick: () => { closeModal(); host.start({ ...s, seed: s.seed.trim() || randomSeedString() }); } }, svg(ICON.play), 'Begin in Year Zero'));
    },
  });
}

// --- Load & import -------------------------------------------------------------------------

function saveRow(host: MenuHost, m: SaveMeta, refresh: () => void): HTMLElement {
  return h('div', { class: 'yz-save' },
    h('span', { class: 'yz-dot', style: { background: m.color } }),
    h('div', { class: 'grow' },
      h('div', { style: { fontWeight: '600' } }, `${m.label} — the ${m.civ}`),
      h('div', { class: 'yz-sub' }, `Year ${m.year} · ${m.era} · seed ${m.seed} · ${new Date(m.savedAt).toLocaleString()}`)),
    h('button', {
      class: 'yz-btn small',
      onclick: async () => {
        try {
          closeModal();
          host.load(await loadFromStorage(m.key));
        } catch (e) {
          host.toast(`Could not load: ${(e as Error).message}`, 'bad');
        }
      },
    }, 'Load'),
    h('button', { class: 'yz-btn small danger', title: 'Delete', onclick: () => { deleteSave(m.key); refresh(); } }, svg(ICON.trash)));
}

export function showLoad(host: MenuHost): void {
  openModal(host.root, {
    title: 'Saved Games',
    icon: 'save',
    narrow: true,
    render: (body, _t, handle) => {
      const saves = listSaves();
      if (!saves.length) body.append(h('p', { class: 'yz-muted' }, 'No saved games in this browser yet.'));
      body.append(h('div', { class: 'yz-saves' }, saves.map((m) => saveRow(host, m, () => handle.rerender()))));
    },
    foot: (foot) => foot.append(h('button', { class: 'yz-btn', onclick: () => importSave(host) }, svg(ICON.upload), 'Import file')),
  });
}

export async function importSave(host: MenuHost): Promise<void> {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  try {
    const text = await file.text();
    const g = deserialize(text);
    closeModal();
    host.load(g);
    host.toast(`Imported the ${g.player.name}, Year ${g.turn}.`, 'good');
  } catch (e) {
    host.toast(`That file is not a valid Year Zero save: ${(e as Error).message}`, 'bad');
  }
}

// --- In-game menu ---------------------------------------------------------------------------

export function showMenu(host: MenuHost): void {
  const g = host.game();
  openModal(host.root, {
    title: 'Menu',
    icon: 'menu',
    narrow: true,
    render: (body, _t, handle) => {
      if (g) {
        const nameInput = h('input', { type: 'text', maxlength: 30, value: `Year ${g.turn}` });
        body.append(h('div', { class: 'yz-label', style: { marginBottom: '6px' } }, 'Save this game'),
          h('div', { class: 'yz-input' }, nameInput, h('button', {
            class: 'yz-btn primary',
            onclick: async () => {
              const label = nameInput.value.trim() || `Year ${g.turn}`;
              try {
                await saveToStorage(g, `slot-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, label);
                host.toast('Game saved.', 'good');
                handle.rerender();
              } catch {
                host.toast('Saving failed: browser storage may be full. Try exporting instead.', 'bad');
              }
            },
          }, svg(ICON.save), 'Save')),
          h('div', { class: 'yz-actions', style: { marginTop: '8px' } },
            h('button', { class: 'yz-btn', onclick: () => { download(exportFileName(g), serialize(g)); host.toast('Save exported.', 'good'); } }, svg(ICON.download), 'Export save file'),
            h('button', { class: 'yz-btn', onclick: () => importSave(host) }, svg(ICON.upload), 'Import save file'),
            h('button', { class: 'yz-btn', onclick: () => { const code = worldCode(g.s.settings); void navigator.clipboard?.writeText(code); host.toast(`World code copied: ${code}. Paste it as the seed of a new game to play this world.`); } }, svg(ICON.copy), 'Copy world code')));
      }
      const saves = listSaves();
      if (saves.length) {
        body.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '6px' } }, 'Saved games'),
          h('div', { class: 'yz-saves' }, saves.map((m) => saveRow(host, m, () => handle.rerender())))));
      }
      const toggle = (key: 'sound' | 'animations' | 'tips', label: string) =>
        h('button', { class: `yz-btn small${host.settings[key] ? ' active' : ''}`, onclick: () => { host.settings[key] = !host.settings[key]; host.saveSettings(); handle.rerender(); } }, `${label}: ${host.settings[key] ? 'on' : 'off'}`);
      body.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '6px' } }, 'Settings'),
        h('div', { class: 'yz-actions' }, toggle('sound', 'Sound'), toggle('animations', 'Animations'), toggle('tips', 'Tips'))));
      body.append(h('div', { class: 'yz-section' }, h('div', { class: 'yz-actions' },
        h('button', { class: 'yz-btn', onclick: () => showHelp(host.root) }, svg(ICON.info), 'How to play'),
        h('button', { class: 'yz-btn', onclick: () => showCredits(host.root) }, svg(ICON.star), 'Credits'),
        h('button', { class: 'yz-btn', onclick: () => showNewGame(host) }, svg(ICON.globe), 'New game'),
        h('button', { class: 'yz-btn', onclick: () => { closeModal(); host.toTitle(); } }, 'Title screen'),
        h('a', { class: 'yz-btn', href: '/games' }, svg(ICON.back), 'Leave to games'))));
    },
  });
}

export function showCredits(root: HTMLElement): void {
  openModal(root, {
    title: 'Credits',
    icon: 'star',
    narrow: true,
    render: (body) => {
      const link = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'yz-link' }, text);
      const section = (title: string, ...children: (Node | string)[]) =>
        h('div', { class: 'yz-section', style: { marginTop: '0', paddingTop: '0', borderTop: 'none', marginBottom: '16px' } },
          h('div', { class: 'yz-label', style: { marginBottom: '6px' } }, title), ...children);
      body.append(
        section('Game', h('p', { style: { margin: 0 } }, 'Year Zero — designed and built by Debakar Roy. Worlds, names, histories and sounds are generated procedurally in your browser.')),
        section('Map art',
          h('p', { style: { margin: '0 0 6px' } }, 'Terrain tiles, cities, trees, rocks and improvements from ', link('https://kenney.nl/assets/hexagon-pack', 'Hexagon Pack'), ' by ', link('https://kenney.nl', 'Kenney'), '.'),
          h('p', { class: 'yz-sub', style: { margin: 0 } }, 'License: ', link('https://creativecommons.org/publicdomain/zero/1.0/', 'Creative Commons Zero (CC0)'), '. Thank you, Kenney!')),
        section('Icons',
          h('p', { style: { margin: '0 0 6px' } }, 'Unit, resource, building and event icons from ', link('https://game-icons.net', 'game-icons.net'), ', licensed ', link('https://creativecommons.org/licenses/by/3.0/', 'CC BY 3.0'), '. Icons made by:'),
          ...iconCredits().map((c) => h('details', { class: 'yz-credit' },
            h('summary', null, h('b', null, c.author), h('span', { class: 'yz-muted' }, ` — ${c.icons.length} icon${c.icons.length > 1 ? 's' : ''}`), c.url ? h('span', null, ' · ', link(c.url, 'website')) : null),
            h('p', { class: 'yz-sub', style: { margin: '4px 0 0' } }, ...c.icons.flatMap((ic, i) => [i ? ', ' : '', link(ic.href, ic.name)]))))),
        section('Typefaces', h('p', { style: { margin: 0 } }, link('https://rsms.me/inter/', 'Inter'), ' and ', link('https://www.jetbrains.com/lp/mono/', 'JetBrains Mono'), ', SIL Open Font License, via Fontsource.')),
      );
    },
  });
}

export function showHelp(root: HTMLElement): void {
  openModal(root, {
    title: 'How to Play',
    icon: 'info',
    narrow: true,
    render: (body) => {
      const p = (text: string) => h('p', { style: { margin: '0 0 10px' } }, text);
      const k = (key: string, what: string) => h('div', { style: { display: 'flex', gap: '10px', fontSize: '13px' } }, h('kbd', { style: { minWidth: '68px', fontFamily: 'var(--yz-mono)', color: 'var(--yz-accent-2)' } }, key), h('span', null, what));
      body.append(
        p('You guide a people from a single camp in Year Zero toward the stars. Every turn is one year. There is no score to chase — the game remembers what happens and writes your history.'),
        p('1. Select your Settlers and found a city. Rivers and coasts are the best sites; the panel rates any tile you select.'),
        p('2. Cities grow and build on their own. Set a focus (food, industry, science, wealth, culture) or choose production yourself.'),
        p('3. Choose what to research. Explore with Scouts: you will find ruins of forgotten peoples, natural wonders and other civilizations.'),
        p('4. Other peoples remember everything you do. Trade, ally, threaten or betray — they will not forget.'),
        p('5. Your people’s identity, rulers, faith and even the names of their eras emerge from what happens. Open History at any time to read the story so far.'),
        h('div', { class: 'yz-section' }, h('div', { class: 'yz-label', style: { marginBottom: '6px' } }, 'Controls'),
          k('Drag / pinch', 'Move and zoom the map'),
          k('Click', 'Select a unit, city or tile; with a unit selected, click a tile to move or attack (tap twice on touch screens)'),
          k('Right-click', 'Move or attack with the selected unit'),
          k('Enter', 'End turn'), k('N / Space', 'Next unit / skip'), k('B', 'Found city'), k('F / S', 'Fortify / sleep'),
          k('E', 'Explore automatically'), k('T C D H', 'Knowledge, Civilization, Diplomacy, History'), k('Esc', 'Close / deselect')),
        h('p', { class: 'yz-sub', style: { marginTop: '14px' } }, 'Map art by Kenney (CC0); icons from game-icons.net (CC BY 3.0). ',
          h('button', { class: 'yz-linkbtn', onclick: () => showCredits(root) }, 'See all credits'), '.'));
    },
  });
}
