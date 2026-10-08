// Wildborn's app: title screen, the map/team/field/bag/world screens, wild
// encounters, battles, raising and breeding, plus automatic mode.

import { clear, download, h, pickFile } from '../../shared/dom';
import { randomSeedString } from '../../shared/rng';
import { SaveStore } from '../../shared/savefile';
import { icons, type IconKey } from '../art';
import { ABILITIES, AFFINITY, BIOMES, ITEMS, SPECIES, SPECIES_BY_ID, rarityOf, speciesRarity, type BiomeId } from '../data/species';
import {
  ACHIEVEMENTS,
  Game,
  WEATHER_LABEL,
  allCreatures,
  evaluateEvolution,
  findCreature,
  guideOf,
  statsOf,
  type Creature,
} from '../sim/game';
import { ZONE_LABEL, findPath } from '../sim/world';
import { createBattle, playerAct, type Battle, type BattleAction } from '../sim/battle';
import { autoStartBattle, autoStep } from '../sim/auto';
import { creatureSVG } from '../render/creature';
import { createWorldView, type WorldView } from '../render/view';
import type { World3D } from '../render/gl/world3d';
import { guideCounts, missingSpecies, renderMap } from '../render/map';
import {
  abilityList,
  affinityChips,
  bar,
  chip,
  creatureRow,
  exposureBlock,
  guideCard,
  historyList,
  itemRow,
  meter,
  personalityLine,
  questCard,
  statBlock,
  tabBar,
  timeLabel,
} from './screens';

type Screen = 'map' | 'team' | 'field' | 'bag' | 'world';
type CreatureTab = 'stats' | 'abilities' | 'history' | 'evolution' | 'lineage';

type Overlay =
  | null
  | { kind: 'wild' }
  | { kind: 'battle' }
  | { kind: 'creature'; id: string; tab: CreatureTab }
  | { kind: 'feed'; target: string }
  | { kind: 'menu' }
  | { kind: 'credits' }
  | { kind: 'breed' }
  | { kind: 'regions' }
  | { kind: 'evolve'; id: string; to: string }
  | { kind: 'notice'; text: string };

function gi(key: IconKey, cls = ''): HTMLElement {
  return h('span', { class: `wb-gi ${cls}`, html: icons.svg(key) });
}

const DIRS: Record<string, { dx: number; dy: number }> = {
  ArrowUp: { dx: 0, dy: -1 }, w: { dx: 0, dy: -1 }, W: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 }, s: { dx: 0, dy: 1 }, S: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 }, a: { dx: -1, dy: 0 }, A: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 }, d: { dx: 1, dy: 0 }, D: { dx: 1, dy: 0 },
};

function keyDir(key: string): { dx: number; dy: number } | null {
  return DIRS[key] ?? null;
}

export class App {
  root: HTMLElement;
  game: Game | null = null;
  mode: 'title' | 'play' = 'title';
  screen: Screen = 'map';
  overlay: Overlay = null;
  auto = false;
  battle: Battle | null = null;
  saves = new SaveStore('wildborn');
  private titleEl!: HTMLElement;
  private shellEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private mainEl!: HTMLElement;
  private navEl!: HTMLElement;
  private overlayEl!: HTMLElement;
  private logEl!: HTMLElement;
  private autoTimer: ReturnType<typeof setInterval> | null = null;
  private battleSeen = 0;
  private breedA = '';
  private breedB = '';
  // --- overworld ------------------------------------------------------------------------------
  private worldCv!: HTMLCanvasElement;
  private worldRenderer: WorldView | null = null;
  private worldWrap!: HTMLElement;
  private worldSide!: HTMLElement;
  private worldPick!: HTMLElement;
  private camBtn!: HTMLButtonElement;
  private heldDir: { dx: number; dy: number } | null = null;
  private walkPath: { x: number; y: number }[] | null = null;
  private pointer: { id: number; startX: number; startY: number; lastX: number; lastY: number; moved: number; at: number } | null = null;
  private walkAcc = 0;
  private lastFrame = 0;
  private lastStepAt = 0;
  private saveAcc = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('wb');
    root.textContent = '';
    this.buildDom();
    this.buildWorld();
    window.addEventListener('keydown', (e) => {
      const dir = keyDir(e.key);
      if (dir && this.canWalk()) {
        this.pulse(dir);
        e.preventDefault();
        return;
      }
      if (e.key === ' ' && this.canWalk()) {
        this.doSearch();
        e.preventDefault();
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        this.toggleCamera();
        return;
      }
      if (e.key === 'Escape') {
        if (this.overlay && this.overlay.kind !== 'battle') this.closeOverlay();
      }
    });
    window.addEventListener('keyup', (e) => {
      const dir = keyDir(e.key);
      if (dir && this.heldDir && this.heldDir.dx === dir.dx && this.heldDir.dy === dir.dy) this.heldDir = null;
    });
    window.addEventListener('blur', () => {
      this.heldDir = null;
    });
    window.addEventListener('resize', () => this.worldRenderer?.resize());
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      this.frame(now);
    };
    requestAnimationFrame(loop);
    void this.title();
  }

  /** The walkable overworld: canvas, HUD, D-pad and the side panel. */
  private buildWorld(): void {
    this.worldCv = h('canvas', { class: 'wb-world', 'aria-label': 'The overworld' }) as HTMLCanvasElement;
    this.worldSide = h('div', { class: 'wb-worldside' });
    this.worldPick = h('div', { class: 'wb-worldpick' });
    const dpadBtn = (label: string, dir: { dx: number; dy: number }, cls: string) => {
      const b = h('button', {
        class: `wb-dpadbtn ${cls}`,
        'aria-label': label,
        onpointerdown: (e: PointerEvent) => {
          e.preventDefault();
          if (!this.canWalk()) return;
          this.pulse(dir);
          b.setPointerCapture(e.pointerId);
        },
        onpointerup: () => {
          if (this.heldDir === dir) this.heldDir = null;
        },
        onpointercancel: () => {
          if (this.heldDir === dir) this.heldDir = null;
        },
      }, label);
      return b;
    };
    const dpad = h('div', { class: 'wb-dpad' },
      dpadBtn('▲', { dx: 0, dy: -1 }, 'wb-dpad-up'),
      dpadBtn('◀', { dx: -1, dy: 0 }, 'wb-dpad-left'),
      h('span', { class: 'wb-dpad-mid' }),
      dpadBtn('▶', { dx: 1, dy: 0 }, 'wb-dpad-right'),
      dpadBtn('▼', { dx: 0, dy: 1 }, 'wb-dpad-down'),
    );
    const hud = h('div', { class: 'wb-worldhud' },
      h('b', { 'data-k': 'zone' }),
      h('span', { 'data-k': 'weather' }),
    );
    const bar = h('div', { class: 'wb-worldbar' },
      h('button', { class: 'wb-btn wb-btn-small', onclick: () => this.doSearch() }, gi('u-observe'), 'Search here'),
      h('button', { class: 'wb-btn wb-btn-small', onclick: () => this.openRegions() }, gi('u-map'), 'Regions'),
    );
    // Third person / first person toggle.
    this.camBtn = h('button', {
      class: 'wb-btn wb-btn-small wb-cambtn',
      title: 'Switch camera (V)',
      onclick: () => this.toggleCamera(),
    }, 'View: 3rd') as HTMLButtonElement;
    bar.appendChild(this.camBtn);
    this.worldCv.addEventListener('pointerdown', (e) => {
      if (!this.canWalk()) return;
      // A drag looks around; a tap (barely moved, quick) walks there.
      this.pointer = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: 0,
        at: performance.now(),
      };
      this.worldCv.setPointerCapture(e.pointerId);
    });
    this.worldCv.addEventListener('pointermove', (e) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      const dx = e.clientX - p.lastX;
      const dy = e.clientY - p.lastY;
      p.lastX = e.clientX;
      p.lastY = e.clientY;
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (p.moved > 8) this.lookAround(dx, dy);
    });
    const endPointer = (e: PointerEvent): void => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      this.pointer = null;
      if (p.moved > 8 || performance.now() - p.at > 400) return; // it was a look
      const rect = this.worldCv.getBoundingClientRect();
      const { x: tx, y: ty } = this.worldRenderer!.tileAt(p.startX - rect.left, p.startY - rect.top, this.game!.world);
      const g = this.game!;
      const path = findPath(g.world, { x: g.state.x, y: g.state.y }, { x: tx, y: ty });
      if (!path || !path.length) {
        this.pickText('You cannot walk there.');
        return;
      }
      this.heldDir = null;
      this.walkPath = path;
    };
    this.worldCv.addEventListener('pointerup', endPointer);
    this.worldCv.addEventListener('pointercancel', endPointer);
    this.worldCv.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        if (!this.canWalk()) return;
        e.preventDefault();
        this.zoomCamera(e.deltaY * 0.004);
      },
      { passive: false },
    );
    this.worldWrap = h('div', { class: 'wb-worldwrap' },
      h('div', { class: 'wb-worldbox' }, this.worldCv, hud, bar, dpad, this.worldPick),
      this.worldSide,
    );
    this.worldRenderer = createWorldView(this.worldCv);
  }

  /** Walking is blocked while a wild creature or a battle is on screen. */
  private canWalk(): boolean {
    return this.mode === 'play' && !!this.game && !this.game.state.wild && !this.battle && !this.overlay;
  }

  private faceDir(dir: { dx: number; dy: number }): void {
    this.worldRenderer?.face(dir.dy < 0 ? 'up' : dir.dy > 0 ? 'down' : dir.dx < 0 ? 'left' : 'right');
  }

  /** The 3D view can orbit; the flat one has nothing to do here. */
  private lookAround(dx: number, dy: number): void {
    const view = this.world3d();
    view?.look(dx, dy);
  }

  private zoomCamera(delta: number): void {
    this.world3d()?.zoom(delta);
  }

  /** The 3D view, or null when we are on the flat fallback. */
  private world3d(): World3D | null {
    const v = this.worldRenderer;
    return v && v.kind === 'gl' ? (v as World3D) : null;
  }

  /** Switch between third and first person. */
  toggleCamera(): void {
    const view = this.world3d();
    if (!view) {
      this.pickText('The 3D view is not available here.');
      return;
    }
    const mode = view.toggleCamera();
    this.camBtn.textContent = mode === 'third' ? 'View: 3rd' : 'View: 1st';
    this.pickText(mode === 'third' ? 'Third person: over your shoulder.' : 'First person: in their eyes.');
  }

  /** Start walking in a direction. A quick tap always moves one tile. */
  private pulse(dir: { dx: number; dy: number }): void {
    this.heldDir = dir;
    this.walkPath = null;
    this.faceDir(dir);
    if (performance.now() - this.lastStepAt > 70) this.step();
  }

  private pickText(text: string): void {
    this.worldPick.textContent = text;
    this.worldPick.classList.remove('go');
    void this.worldPick.offsetWidth;
    this.worldPick.classList.add('go');
  }

  /** The animation frame: walking, the world render and a paced autosave. */
  private frame(now: number): void {
    const dt = Math.min(0.1, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    if (this.mode !== 'play' || !this.game) return;
    // Walking: held direction or a tap-to-move path, both on a step cadence.
    if (this.canWalk() && (this.heldDir || this.walkPath?.length)) {
      this.walkAcc += dt;
      const step = this.walkPath ? 0.05 : 0.12;
      let budget = 4;
      while (this.walkAcc >= step && budget-- > 0) {
        this.walkAcc -= step;
        if (!this.step()) break;
      }
    } else this.walkAcc = 0;
    if (this.screen === 'map' && this.worldRenderer) this.worldRenderer.draw(this.game, now);
    this.saveAcc += dt;
    if (this.saveAcc > 20 && this.canWalk()) {
      this.saveAcc = 0;
      this.autosave();
    }
  }

  /** One step of walking. Returns false when blocked (or an encounter interrupts). */
  private step(): boolean {
    const g = this.game!;
    this.lastStepAt = performance.now();
    let dx = 0;
    let dy = 0;
    if (this.walkPath?.length) {
      const next = this.walkPath[0];
      dx = Math.sign(next.x - g.state.x);
      dy = Math.sign(next.y - g.state.y);
      if (!dx && !dy) {
        this.walkPath = null;
        return false;
      }
      this.faceDir({ dx, dy });
    } else if (this.heldDir) {
      // In the 3D view, "up" means away from the camera, not north.
      const d = this.world3d()?.rotateInput(this.heldDir.dx, this.heldDir.dy) ?? this.heldDir;
      dx = d.dx;
      dy = d.dy;
      if (!dx && !dy) return false;
      this.faceDir({ dx, dy });
    } else return false;
    const res = g.move(dx, dy);
    if (this.walkPath) {
      if (res.ok) this.walkPath.shift();
      else this.walkPath = null; // blocked: stop the path walk
    }
    if (!res.ok) {
      this.heldDir = null;
      return false;
    }
    if (res.event === 'encounter') {
      this.heldDir = null;
      this.walkPath = null;
      this.worldRenderer?.encounterFlash();
      this.overlay = { kind: 'wild' };
      this.render();
      return false;
    }
    if (res.text) this.pickText(res.text);
    this.refreshWorldSide();
    return true;
  }

  private doSearch(): void {
    this.act(() => {
      const outcome = this.game!.explore();
      if (outcome.kind === 'encounter') this.overlay = { kind: 'wild' };
      else if (outcome.kind === 'resource' || outcome.kind === 'fragment') this.pickText(outcome.text);
      this.refreshWorldSide();
    });
  }

  private openRegions(): void {
    this.overlay = { kind: 'regions' };
    this.render();
  }

  /** The regions overview: the old node map, now a fast-walk menu. */
  private regionsOverlay(): HTMLElement {
    const g = this.game!;
    const s = g.state;
    const here = g.zoneNow();
    const box = h('div', { class: 'wb-mapbox' });
    box.appendChild(renderMap(s, (region) => this.act(() => { g.travel(region); this.overlay = null; })));
    const rows: HTMLElement[] = [];
    const row = (id: BiomeId | 'village', name: string, blurb: string, known: string) => {
      const selected = here === id;
      rows.push(
        h('button', {
          class: `wb-row${selected ? ' wb-row-selected' : ''}`,
          onclick: () => this.act(() => { g.travel(id); this.overlay = null; }),
        },
          h('span', { class: 'wb-row-main' },
            h('b', null, name, selected ? chip('Here', 'wb-chip-ok') : chip('Walk here', 'wb-chip-soft')),
            h('small', null, blurb),
            h('small', null, known),
          ),
        ),
      );
    };
    for (const id of ['greenwood', 'meadow', 'wetlands', 'caves', 'ember', 'ruins'] as BiomeId[]) {
      const b = BIOMES[id];
      const ids = Object.keys(b.wild);
      const known = ids.filter((sid) => guideOf(s, sid) !== 'unknown').length;
      row(id, b.name, b.blurb, `Species known here: ${known}/${ids.length}`);
    }
    row('village', 'Village', 'Rest, train, breed and read the researcher’s notes.', `${guideCounts(s).captured} species linked · ${s.items.fragment ?? 0} fragments`);
    return h('div', { class: 'wb-sheet wb-sheet-regions' },
      h('div', { class: 'wb-sheet-head' },
        h('h2', null, 'The overworld'),
        h('button', { class: 'wb-iconbtn', title: 'Close', onclick: () => this.closeOverlay() }, gi('u-close')),
      ),
      h('p', { class: 'wb-dim' }, 'Walk anywhere with the D-pad, the arrow keys or by tapping the map. Fast-walking costs the hours it would take.'),
      box,
      ...rows,
    );
  }

  // --- DOM skeleton --------------------------------------------------------------------------

  private buildDom(): void {
    this.titleEl = h('div', { class: 'wb-title' });
    this.headerEl = h('header', { class: 'wb-header' });
    this.mainEl = h('main', { class: 'wb-main' });
    this.navEl = h('nav', { class: 'wb-nav' });
    this.logEl = h('div', { class: 'wb-logstrip', hidden: true });
    this.overlayEl = h('div', { class: 'wb-overlay', hidden: true });
    this.shellEl = h('div', { class: 'wb-shell', hidden: true }, this.headerEl, this.mainEl, this.logEl, this.navEl);
    this.root.append(this.titleEl, this.shellEl, this.overlayEl);
  }

  // --- title ---------------------------------------------------------------------------------

  async title(): Promise<void> {
    this.mode = 'title';
    this.setAuto(false);
    this.shellEl.hidden = true;
    this.overlay = null;
    this.overlayEl.hidden = true;
    clear(this.overlayEl);
    this.titleEl.hidden = false;
    clear(this.titleEl);
    const slots = this.saves.list();
    const auto = slots.find((s) => s.key === 'auto');
    const seedInput = h('input', { class: 'wb-input', type: 'text', value: randomSeedString(), spellcheck: 'false', 'aria-label': 'World seed' });
    const art = h('div', { class: 'wb-title-art', 'data-sil': '1' });
    art.appendChild(creatureSVG({ speciesId: 'lumikit' }, 150));
    const kids: (Node | string)[] = [
      art,
      h('h1', null, 'WILDBORN'),
      h('p', { class: 'wb-tagline' }, 'Every creature has a history.'),
      h('p', { class: 'wb-dim wb-title-blurb' },
        'Explore an unknown world, befriend its creatures, and watch their evolution shaped by the life they live — where you go, what they eat, who they fight, and what they love.'),
    ];
    if (auto) kids.push(h('button', { class: 'wb-btn wb-btn-primary', onclick: () => void this.loadSlot('auto') }, `Continue — ${auto.subtitle}`));
    kids.push(h('div', { class: 'wb-title-new' },
      seedInput,
      h('button', { class: 'wb-btn wb-btn-primary', onclick: () => this.newGame(seedInput.value.trim() || randomSeedString()) }, 'New world'),
    ));
    const saved = slots.filter((s) => s.key !== 'auto');
    if (saved.length) {
      kids.push(h('div', { class: 'wb-slots' },
        ...saved.map((s) =>
          h('div', { class: 'wb-row wb-slot' },
            h('span', { class: 'wb-row-main' }, h('b', null, s.title), h('small', null, s.subtitle)),
            h('button', { class: 'wb-btn wb-btn-small', onclick: () => void this.loadSlot(s.key) }, 'Load'),
            h('button', { class: 'wb-btn wb-btn-small wb-btn-ghost', onclick: () => { this.saves.remove(s.key); void this.title(); } }, 'Delete'),
          ),
        ),
      ));
    }
    kids.push(h('div', { class: 'wb-title-links' },
      h('button', { class: 'wb-linkbtn', onclick: () => void this.importSave() }, 'Import save'),
      h('button', { class: 'wb-linkbtn', onclick: () => this.showCredits() }, 'Credits'),
      h('a', { class: 'wb-linkbtn', href: '/games', 'data-astro-reload': true }, 'All games'),
    ));
    this.titleEl.append(...kids);
  }

  newGame(seed: string): void {
    this.game = Game.new(seed);
    this.mode = 'play';
    this.screen = 'map';
    this.overlay = null;
    this.battle = null;
    this.titleEl.hidden = true;
    this.shellEl.hidden = false;
    this.autosave();
    this.render();
    this.notice('Day 1. The researcher at the village wants ruin fragments; Greenwood is full of tracks. Explore, observe, and form your first Companion Link.');
  }

  async loadSlot(key: string): Promise<void> {
    try {
      const json = await this.saves.load(key);
      this.game = Game.deserialize(json);
      this.mode = 'play';
      this.screen = 'map';
      this.overlay = null;
      this.battle = null;
      this.titleEl.hidden = true;
      this.shellEl.hidden = false;
      this.render();
    } catch (err) {
      this.notice(err instanceof Error ? err.message : 'Could not load that save.');
    }
  }

  async importSave(): Promise<void> {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    try {
      this.game = Game.deserialize(await file.text());
      this.mode = 'play';
      this.titleEl.hidden = true;
      this.shellEl.hidden = false;
      this.render();
    } catch {
      this.notice('That file is not a Wildborn save.');
    }
  }

  autosave(): void {
    if (!this.game) return;
    const s = this.game.state;
    this.saves.saveSync(
      { key: 'auto', label: 'Autosave', title: `Day ${s.day}`, subtitle: `${s.team.length} companions · ${guideCounts(s).captured} species` },
      this.game.serialize(),
    );
  }

  // --- rendering -------------------------------------------------------------------------------

  render(): void {
    if (this.mode !== 'play' || !this.game) return;
    this.renderHeader();
    this.renderNav();
    clear(this.mainEl);
    this.mainEl.append(this.screenEl());
    this.paintBadges(this.mainEl);
    this.renderLog();
    this.renderOverlay();
  }

  private renderHeader(): void {
    const s = this.game!.state;
    clear(this.headerEl);
    const night = s.hour >= 19 || s.hour <= 5;
    this.headerEl.append(
      h('button', { class: 'wb-brand', onclick: () => this.openMenu() }, gi('u-menu'), h('b', null, 'WILDBORN')),
      h('div', { class: 'wb-header-info' },
        h('span', null, timeLabel(s)),
        h('span', { class: 'wb-weather', title: WEATHER_LABEL[s.weather] }, h('i', { html: icons.svg(night ? 'w-night' : s.weather === 'sun' ? 'w-sun' : s.weather === 'rain' ? 'w-rain' : s.weather === 'storm' ? 'w-storm' : 'w-fog') }), WEATHER_LABEL[s.weather]),
        h('span', { class: 'wb-region' }, s.region === 'village' ? 'Village' : BIOMES[s.region].name),
      ),
      h('button', {
        class: `wb-autobtn${this.auto ? ' wb-autobtn-on' : ''}`,
        'aria-pressed': this.auto ? 'true' : 'false',
        title: 'Automatic mode: an AI trainer plays while you watch, take over any time',
        onclick: () => this.setAuto(!this.auto),
      }, gi('u-auto'), 'AUTO'),
    );
  }

  private renderNav(): void {
    clear(this.navEl);
    const items: { id: Screen; label: string; icon: IconKey }[] = [
      { id: 'map', label: 'Map', icon: 'u-map' },
      { id: 'team', label: 'Team', icon: 'u-team' },
      { id: 'field', label: 'Field', icon: 'u-guide' },
      { id: 'bag', label: 'Bag', icon: 'u-bag' },
      { id: 'world', label: 'World', icon: 'u-world' },
    ];
    this.navEl.append(
      ...items.map((it) =>
        h('button', {
          class: `wb-navbtn${this.screen === it.id ? ' wb-navbtn-active' : ''}`,
          'aria-current': this.screen === it.id ? 'page' : 'false',
          onclick: () => {
            this.screen = it.id;
            this.closeOverlay();
            this.render();
          },
        }, gi(it.icon), h('small', null, it.label)),
      ),
    );
  }

  private renderLog(): void {
    const s = this.game!.state;
    const entries = s.log.slice(-3);
    this.logEl.hidden = !this.auto;
    clear(this.logEl);
    if (this.auto) {
      this.logEl.append(gi('u-auto', 'wb-gi-small'), h('div', { class: 'wb-logstrip-lines' }, ...entries.map((e) => h('div', null, e.text))));
    }
  }

  private screenEl(): HTMLElement {
    switch (this.screen) {
      case 'map':
        return this.mapScreen();
      case 'team':
        return this.teamScreen();
      case 'field':
        return this.fieldScreen();
      case 'bag':
        return this.bagScreen();
      case 'world':
        return this.worldScreen();
    }
  }

  // --- the overworld screen ----------------------------------------------------------------------

  private mapScreen(): HTMLElement {
    this.refreshWorldSide();
    // The canvas keeps its DOM across renders so the renderer keeps its state.
    requestAnimationFrame(() => this.worldRenderer?.resize());
    return this.worldWrap;
  }

  /** Rebuild only the side panel (cheap, called on every step). */
  private refreshWorldSide(): void {
    if (!this.game) return;
    const zone = this.game.zoneNow();
    clear(this.worldSide);
    this.worldSide.append(zone === 'village' ? this.villagePanel() : zone === 'wilds' ? this.wildsPanel() : this.regionPanel(zone as BiomeId));
    this.worldSide.append(this.feedPanel());
    const hud = this.worldWrap.querySelector<HTMLElement>('.wb-worldhud');
    if (hud) {
      const s = this.game.state;
      hud.querySelector('[data-k="zone"]')!.textContent = ZONE_LABEL[zone];
      hud.querySelector('[data-k="weather"]')!.textContent = `${WEATHER_LABEL[s.weather]} · ${String(Math.floor(s.hour)).padStart(2, '0')}:00`;
    }
  }

  private wildsPanel(): HTMLElement {
    const s = this.game!.state;
    return h('section', { class: 'wb-panel' },
      h('h2', null, 'The Wilds'),
      h('p', { class: 'wb-dim' }, 'Grass between the regions. Creatures drift through, and walking is its own reward.'),
      h('div', { class: 'wb-chips' },
        chip(`Weather: ${WEATHER_LABEL[s.weather]}`, 'wb-chip-soft'),
        chip(`Time: ${String(Math.floor(s.hour)).padStart(2, '0')}:00`, 'wb-chip-soft'),
        chip(`Regions known: ${['greenwood', 'meadow', 'wetlands', 'caves', 'ember', 'ruins'].filter((r) => s.counts[`visit:${r}`]).length}/6`, 'wb-chip-soft'),
      ),
      h('p', { class: 'wb-dim' }, 'Walk into tall grass to find creatures. Tap the map to walk there; hold the D-pad or the arrow keys to stride.'),
    );
  }

  private regionPanel(biome: BiomeId): HTMLElement {
    const s = this.game!.state;
    const b = BIOMES[biome];
    const missing = missingSpecies(s, biome);
    return h('section', { class: 'wb-panel' },
      h('h2', null, b.name, chip(b.boost ? AFFINITY[b.boost].label : '', `wb-aff-${b.boost}`)),
      h('p', { class: 'wb-dim' }, b.blurb),
      h('div', { class: 'wb-chips' },
        chip(`Weather: ${WEATHER_LABEL[s.weather]}`, 'wb-chip-soft'),
        chip(`Time: ${String(Math.floor(s.hour)).padStart(2, '0')}:00`, 'wb-chip-soft'),
        chip(`Resources: ${[...new Set(b.resources)].join(', ')}`, 'wb-chip-soft'),
      ),
      missing.length
        ? h('p', { class: 'wb-dim' }, `Unseen here: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}`)
        : h('p', { class: 'wb-dim' }, 'You know every species that lives here.'),
      h('p', { class: 'wb-dim' }, 'Walk the tall grass to meet what lives here. Searching here takes a couple of hours.'),
    );
  }

  private villagePanel(): HTMLElement {
    const s = this.game!.state;
    const g = this.game!;
    return h('section', { class: 'wb-panel' },
      h('h2', null, 'Village', chip('Home', 'wb-chip-soft')),
      h('p', { class: 'wb-dim' }, 'Rest, train and raise your companions. The researcher keeps quests; the breeding ground mixes lineages.'),
      s.eggs.length
        ? h('div', { class: 'wb-eggs' },
            h('h3', null, 'Eggs'),
            ...s.eggs.map((e) =>
              h('div', { class: 'wb-egg' }, gi('u-egg'), h('div', null,
                h('b', null, `${SPECIES_BY_ID[e.speciesId].name} egg`, e.variant ? chip(e.variant, `wb-variant-${e.variant}`) : null),
                h('small', null, `Generation ${e.generation} · hatches soon (${Math.max(1, Math.ceil(e.stepsLeft))} steps)`),
              )),
            ),
          )
        : null,
      h('h3', null, 'Care'),
      ...s.team.map((c) =>
        h('div', { class: 'wb-care' },
          creatureRow(c, () => this.openCreature(c.id)),
          h('div', { class: 'wb-actions' },
            h('button', { class: 'wb-btn wb-btn-small', onclick: () => this.act(() => this.notice(g.train(c.id))) }, gi('u-train'), 'Train'),
            h('button', { class: 'wb-btn wb-btn-small', onclick: () => this.act(() => this.notice(g.play(c.id))) }, gi('u-heart'), 'Play'),
            h('button', { class: 'wb-btn wb-btn-small', onclick: () => this.act(() => this.notice(g.rest(c.id))) }, gi('u-rest'), 'Rest'),
            h('button', { class: 'wb-btn wb-btn-small', onclick: () => { this.overlay = { kind: 'feed', target: c.id }; this.render(); } }, gi('u-food'), 'Feed'),
          ),
        ),
      ),
      h('div', { class: 'wb-actions' },
        h('button', { class: 'wb-btn', onclick: () => { this.breedA = ''; this.breedB = ''; this.overlay = { kind: 'breed' }; this.render(); } }, gi('u-lineage'), 'Breeding ground'),
      ),
      this.feedPanel(),
    );
  }

  /** The activity feed (recent history) shown under every region panel. */
  private feedPanel(): HTMLElement {
    const s = this.game!.state;
    return h('section', { class: 'wb-panel wb-feed' },
      h('h3', null, 'Field notes'),
      ...s.log.slice(-7).reverse().map((e) =>
        h('div', { class: 'wb-feed-row' }, chip(`Day ${e.day}`, 'wb-chip-soft'), h('span', null, e.text)),
      ),
    );
  }

  // --- team screen ------------------------------------------------------------------------------

  private teamScreen(): HTMLElement {
    const s = this.game!.state;
    return h('div', { class: 'wb-screen' },
      h('section', { class: 'wb-panel' },
        h('h2', null, 'Your team'),
        ...(s.team.length
          ? s.team.map((c) => creatureRow(c, () => this.openCreature(c.id)))
          : [h('p', { class: 'wb-dim' }, 'No companions yet. Explore Greenwood and befriend your first creature.')]),
      ),
      s.reserve.length
        ? h('section', { class: 'wb-panel' },
            h('h2', null, 'Collection'),
            ...s.reserve.map((c) => creatureRow(c, () => this.openCreature(c.id))),
          )
        : null,
    );
  }

  // --- field guide ------------------------------------------------------------------------------

  private fieldScreen(): HTMLElement {
    const s = this.game!.state;
    const counts = guideCounts(s);
    return h('div', { class: 'wb-screen' },
      h('section', { class: 'wb-panel' },
        h('h2', null, 'Research'),
        h('p', { class: 'wb-dim' }, `The village researcher studies the old ruins. ${counts.observed} of ${counts.total} species observed, ${counts.captured} linked. Ruin fragments collected: ${s.items.fragment ?? 0}.`),
        ...s.quests.map((q) => questCard(q)),
      ),
      h('section', { class: 'wb-panel' },
        h('h2', null, 'Field guide'),
        h('div', { class: 'wb-guidegrid' },
          ...SPECIES.map((sp) => guideCard(sp.id, guideOf(s, sp.id), () => this.openGuideSpecies(sp.id))),
        ),
      ),
    );
  }

  private openGuideSpecies(speciesId: string): void {
    const state = guideOf(this.game!.state, speciesId);
    if (state === 'unknown') {
      this.notice('You have not encountered this species yet.');
      return;
    }
    const sp = SPECIES_BY_ID[speciesId];
    const discovered = this.game!.state.discovered[sp.stage === 0 ? speciesId : sp.id] ?? [];
    this.overlay = {
      kind: 'notice',
      text:
        `${sp.name} — ${sp.role} · ${speciesRarity(speciesId)}. ${sp.blurb} Affinities: ${sp.affinities.map((a) => AFFINITY[a].label).join(', ')}. ` +
        (sp.branches
          ? `Evolution branches: ${sp.branches.map((b) => (discovered.includes(b.to) || state === 'captured' ? SPECIES_BY_ID[b.to].name : '???')).join(', ')}.`
          : 'Fully evolved.'),
    };
    this.render();
  }

  // --- bag ---------------------------------------------------------------------------------

  private bagScreen(): HTMLElement {
    const s = this.game!.state;
    const items = Object.entries(s.items).filter(([, n]) => n > 0);
    return h('div', { class: 'wb-screen' },
      h('section', { class: 'wb-panel' },
        h('h2', null, 'Bag'),
        items.length
          ? items.map(([id, n]) => itemRow(id, n, (useId) => {
              if (!allCreatures(s).length) {
                this.notice('You have no creature to use it on.');
                return;
              }
              this.overlay = { kind: 'feed', target: `bag:${useId}` };
              this.render();
            }))
          : h('p', { class: 'wb-dim' }, 'Your bag is empty. Exploring finds resources.'),
      ),
    );
  }

  // --- world screen ------------------------------------------------------------------------------

  private worldScreen(): HTMLElement {
    const s = this.game!.state;
    const c = s.counts;
    return h('div', { class: 'wb-screen' },
      h('section', { class: 'wb-panel' },
        h('h2', null, 'Achievements'),
        h('div', { class: 'wb-achgrid' },
          ...ACHIEVEMENTS.map((a) =>
            h('div', { class: `wb-ach${s.achievements[a.id] ? ' wb-ach-on' : ''}` }, gi('u-trophy'), h('div', null, h('b', null, a.name), h('small', null, a.desc))),
          ),
        ),
      ),
      h('section', { class: 'wb-panel' },
        h('h2', null, 'Chronicle'),
        h('div', { class: 'wb-chips' },
          chip(`Explorations: ${c.explores ?? 0}`, 'wb-chip-soft'),
          chip(`Links: ${c.captures ?? 0}`, 'wb-chip-soft'),
          chip(`Battles won: ${c.wins ?? 0}`, 'wb-chip-soft'),
          chip(`Lost: ${c.losses ?? 0}`, 'wb-chip-soft'),
          chip(`Evolutions: ${c.evolves ?? 0}`, 'wb-chip-soft'),
          chip(`Eggs hatched: ${c.hatches ?? 0}`, 'wb-chip-soft'),
          chip(`Ruin fragments: ${c.fragments ?? 0}`, 'wb-chip-soft'),
        ),
        h('p', { class: 'wb-dim' }, `World seed: ${s.seed} (share it for the same world and species).`),
      ),
      h('section', { class: 'wb-panel' },
        h('h2', null, 'Saves'),
        h('div', { class: 'wb-actions' },
          h('button', { class: 'wb-btn', onclick: () => this.openMenu() }, gi('u-save'), 'Save / load'),
          h('button', { class: 'wb-btn', onclick: () => download('wildborn-save.json', this.game!.serialize()) }, 'Export save'),
          h('button', { class: 'wb-btn', onclick: () => void this.importSave() }, 'Import save'),
          h('button', { class: 'wb-btn', onclick: () => this.showCredits() }, 'Credits'),
        ),
      ),
    );
  }

  // --- actions -------------------------------------------------------------------------------

  /** Run a player action: it turns automatic mode off, settles the world and re-renders. */
  private act(fn: () => void): void {
    if (this.auto) this.setAuto(false);
    fn();
    this.game?.settle();
    this.autosave();
    this.render();
  }

  private openCreature(id: string, tab: CreatureTab = 'stats'): void {
    this.overlay = { kind: 'creature', id, tab };
    this.render();
  }

  closeOverlay(): void {
    this.overlay = null;
    // A wild creature on the map reopens its encounter until it is left behind.
    if (this.mode === 'play' && this.game && this.game.state.wild && !this.battle) this.overlay = { kind: 'wild' };
    this.render();
  }

  private notice(text: string): void {
    this.overlay = { kind: 'notice', text };
    this.render();
  }

  private showCredits(): void {
    this.overlay = { kind: 'credits' };
    this.render();
  }

  private openMenu(): void {
    this.overlay = { kind: 'menu' };
    this.render();
  }

  // --- wild encounter overlay -----------------------------------------------------------------------

  private wildOverlay(): HTMLElement {
    const g = this.game!;
    const s = g.state;
    const w = s.wild!;
    const sp = SPECIES_BY_ID[w.speciesId];
    const known = guideOf(s, w.speciesId) !== 'unknown';
    const chance = Math.round(g.linkChance(w) * 100);
    const hpFrac = w.hp / statsOf(w).maxHp;
    return h('div', { class: 'wb-sheet wb-sheet-wild' },
      h('div', { class: 'wb-sheet-head' },
        h('h2', null, known ? sp.name : 'Unknown creature'),
        known ? chip(rarityOf(w.speciesId, w.variant), `wb-rarity-${rarityOf(w.speciesId, w.variant)}`) : null,
        chip(known ? `${sp.role} · Lv ${w.level}` : `Lv ${w.level}`, 'wb-chip-soft'),
        h('button', { class: 'wb-iconbtn', title: 'Leave', onclick: () => this.act(() => { this.game!.leaveWild(); this.overlay = null; }) }, gi('u-close')),
      ),
      h('div', { class: 'wb-wild-art' }, creatureSVG(w, 160)),
      h('div', { class: 'wb-wild-stats' },
        meter('HP', w.hp, statsOf(w).maxHp, hpFrac < 0.35 ? 'wb-bar-low' : 'wb-bar-hp'),
        meter('Trust', w.trust, 100, 'wb-bar-trust'),
        meter('Fear', w.personality.fear, 100, 'wb-bar-stress'),
      ),
      known ? affinityChips(w) : h('p', { class: 'wb-dim' }, 'Observe it to learn what it is.'),
      h('div', { class: 'wb-actions wb-actions-wrap' },
        h('button', { class: 'wb-btn', onclick: () => this.act(() => this.notice(g.observeWild())) }, gi('u-observe'), 'Observe'),
        h('button', { class: 'wb-btn', onclick: () => { this.overlay = { kind: 'feed', target: 'wild' }; this.render(); } }, gi('u-food'), 'Offer food'),
        h('button', { class: 'wb-btn', onclick: () => this.act(() => this.notice(g.playWithWild())) }, gi('u-heart'), 'Play'),
        h('button', {
          class: 'wb-btn',
          disabled: s.team.filter((c) => c.hp > 0).length === 0,
          title: s.team.length ? 'Battle it to earn its respect' : 'You need a creature first',
          onclick: () => this.act(() => this.startBattle()),
        }, gi('u-battle'), 'Battle'),
        h('button', { class: 'wb-btn wb-btn-primary', onclick: () => this.act(() => this.notice(g.attemptLink().text)) }, gi('u-link'), `Companion Link · ${chance}%`),
        h('button', { class: 'wb-btn wb-btn-ghost', onclick: () => this.act(() => { g.leaveWild(); this.closeOverlay(); }) }, 'Leave'),
      ),
    );
  }

  private startBattle(): void {
    const g = this.game!;
    const lead = g.state.team.filter((c) => c.hp > 0).sort((a, b) => b.hp - a.hp)[0];
    if (!lead) {
      this.notice('No creature is able to battle.');
      return;
    }
    this.battle = createBattle(g, lead.id);
    this.battleSeen = 0;
    this.overlay = { kind: 'battle' };
    this.render();
  }

  // --- battle overlay ---------------------------------------------------------------------------

  private battleOverlay(): HTMLElement {
    const b = this.battle!;
    const g = this.game!;
    const s = g.state;
    const foe = b.foe;
    const me = b.player;
    const canSwitch = s.team.some((c) => c.id !== me.creature.id && c.hp > 0);
    return h('div', { class: 'wb-sheet wb-sheet-battle' },
      h('div', { class: 'wb-sheet-head' },
        h('h2', null, `Wild ${foe.name}`, chip(`Lv ${foe.creature.level}`, 'wb-chip-soft')),
        chip(`${s.region === 'village' ? 'Village' : BIOMES[s.region as BiomeId].name} · ${WEATHER_LABEL[s.weather]}`, 'wb-chip-soft'),
        h('button', { class: 'wb-iconbtn', title: 'Close', onclick: () => this.endBattle() }, gi('u-close')),
      ),
      h('div', { class: 'wb-battlefield' },
        h('div', { class: 'wb-fighter wb-fighter-foe', 'data-side': 'foe' },
          h('div', { class: 'wb-wild-art' }, creatureSVG(foe.creature, 110)),
          h('b', null, foe.name),
          meter('HP', foe.hp, foe.stats.maxHp, foe.hp / foe.stats.maxHp < 0.35 ? 'wb-bar-low' : 'wb-bar-hp'),
          this.effectsLine(foe),
        ),
        h('div', { class: 'wb-fighter', 'data-side': 'player' },
          h('div', { class: 'wb-wild-art' }, creatureSVG(me.creature, 110)),
          h('b', null, `${me.creature.name} · Lv ${me.creature.level}`),
          meter('HP', me.hp, me.stats.maxHp, me.hp / me.stats.maxHp < 0.35 ? 'wb-bar-low' : 'wb-bar-hp'),
          this.effectsLine(me),
        ),
      ),
      h('div', { class: 'wb-battlelog' },
        ...b.events.slice(-5).map((e) => h('div', { class: `wb-blog wb-blog-${e.kind}` }, e.text)),
      ),
      b.over
        ? h('div', { class: 'wb-actions' },
            h('button', { class: 'wb-btn wb-btn-primary', onclick: () => this.endBattle() }, 'Continue'),
          )
        : h('div', { class: 'wb-actions wb-actions-wrap' },
            h('button', { class: 'wb-btn wb-btn-primary', onclick: () => this.battleAct({ type: 'ability', index: -1 }) }, 'Attack'),
            ...me.creature.abilities.map((id, i) => {
              const ab = ABILITIES[id];
              return ab
                ? h('button', { class: 'wb-btn', title: ab.desc, onclick: () => this.battleAct({ type: 'ability', index: i }) }, ab.name)
                : null;
            }),
            h('button', { class: 'wb-btn', disabled: !canSwitch, onclick: () => this.switchMenu() }, 'Switch'),
            h('button', { class: 'wb-btn', disabled: (s.items.salve ?? 0) + (s.items.berry ?? 0) === 0, onclick: () => this.battleItem() }, 'Item'),
            h('button', { class: 'wb-btn wb-btn-ghost', onclick: () => this.battleAct({ type: 'flee' }) }, 'Flee'),
          ),
    );
  }

  private effectsLine(f: { effects: { guard: number; confuse: number; weaken: number; focus: boolean } }): HTMLElement {
    const tags: string[] = [];
    if (f.effects.guard > 0) tags.push('guarding');
    if (f.effects.confuse > 0) tags.push('confused');
    if (f.effects.weaken > 0) tags.push('weakened');
    if (f.effects.focus) tags.push('focused');
    return h('div', { class: 'wb-chips' }, tags.map((t) => chip(t, 'wb-chip-soft')));
  }

  private battleAct(action: BattleAction): void {
    if (!this.battle || this.battle.over) return;
    this.act(() => {
      playerAct(this.game!, this.battle!, action);
    });
  }

  private switchMenu(): void {
    this.overlay = { kind: 'feed', target: 'switch' };
    this.render();
  }

  private battleItem(): void {
    const s = this.game!.state;
    const item = (s.items.salve ?? 0) > 0 ? 'salve' : 'berry';
    this.battleAct({ type: 'item', itemId: item });
  }

  private endBattle(): void {
    this.battle = null;
    this.battleSeen = 0;
    this.overlay = this.game!.state.wild ? { kind: 'wild' } : null;
    this.render();
  }

  /** Battle feedback: floating numbers and hit/heal pulses from fresh events. */
  private animateBattle(scope: Element): void {
    const b = this.battle;
    if (!b) return;
    const fresh = b.events.slice(this.battleSeen);
    this.battleSeen = b.events.length;
    for (const e of fresh) {
      if (!e.on) continue;
      const card = scope.querySelector(`[data-side="${e.on}"]`);
      if (!card) continue;
      if (e.kind === 'attack') card.classList.add(e.crit ? 'wb-hit wb-crit' : 'wb-hit');
      else if (e.kind === 'heal') card.classList.add('wb-heal');
      else if (e.kind === 'status') card.classList.add('wb-status');
      if (e.hp) {
        const fl = h('span', { class: `wb-float ${e.hp > 0 ? 'heal' : 'dmg'}` }, e.hp > 0 ? `+${Math.round(e.hp)}` : `−${Math.round(-e.hp)}`);
        card.appendChild(fl);
        setTimeout(() => fl.remove(), 1300);
      }
    }
  }

  // --- feed / switch picker ------------------------------------------------------------------------

  private feedOverlay(target: string): HTMLElement {
    const s = this.game!.state;
    const g = this.game!;
    const isSwitch = target === 'switch';
    const isWild = target === 'wild';
    const bagItem = target.startsWith('bag:') ? target.slice(4) : null;
    const title = isSwitch
      ? 'Send out'
      : isWild
        ? 'Offer food'
        : bagItem
          ? `Use ${ITEMS[bagItem].name} on`
          : `Feed ${findCreature(s, target)?.name ?? ''}`;
    const itemIds = Object.keys(ITEMS).filter((id) => ITEMS[id].feeds && (s.items[id] ?? 0) > 0);
    return h('div', { class: 'wb-sheet' },
      h('div', { class: 'wb-sheet-head' },
        h('h2', null, title),
        h('button', { class: 'wb-iconbtn', title: 'Close', onclick: () => this.closeOverlay() }, gi('u-close')),
      ),
      isSwitch
        ? s.team.filter((c) => c.hp > 0 && c.id !== this.battle?.player.creature.id).map((c) =>
            h('button', { class: 'wb-row', onclick: () => this.act(() => { playerAct(g, this.battle!, { type: 'switch', creatureId: c.id }); this.overlay = { kind: 'battle' }; }) },
              h('span', { class: 'wb-row-badge', 'data-species': c.id }),
              h('span', { class: 'wb-row-main' }, h('b', null, c.name), h('small', null, `Lv ${c.level} · HP ${c.hp}/${statsOf(c).maxHp}`)),
            ),
          )
        : bagItem
          ? allCreatures(s).map((c) =>
              h('button', { class: 'wb-row', onclick: () => this.act(() => {
                this.overlay = { kind: 'notice', text: g.feed(c.id, bagItem) };
              }) },
                h('span', { class: 'wb-row-badge', 'data-species': c.id }),
                h('span', { class: 'wb-row-main' }, h('b', null, c.name), h('small', null, `${SPECIES_BY_ID[c.speciesId].name} · HP ${c.hp}/${statsOf(c).maxHp}`)),
              ),
            )
          : itemIds.length
            ? itemIds.map((id) =>
                h('button', { class: 'wb-row', onclick: () => this.act(() => {
                  const text = isWild ? g.offerFood(id) : g.feed(target, id);
                  this.overlay = { kind: 'notice', text };
                }) },
                  h('span', { class: 'wb-row-main' }, h('b', null, ITEMS[id].name, chip(`×${s.items[id]}`, 'wb-chip-soft')), h('small', null, ITEMS[id].desc)),
                ),
              )
            : h('p', { class: 'wb-dim' }, 'No suitable items.'),
    );
  }

  // --- creature detail overlay -----------------------------------------------------------------------

  private creatureOverlay(id: string, tab: CreatureTab): HTMLElement {
    const g = this.game!;
    const c = findCreature(g.state, id);
    if (!c) return h('div', { class: 'wb-sheet' }, h('p', null, 'Creature not found.'));
    const sp = SPECIES_BY_ID[c.speciesId];
    const evo = evaluateEvolution(c);
    const discovered = g.state.discovered[c.bornSpeciesId] ?? [];
    return h('div', { class: 'wb-sheet wb-sheet-creature' },
      h('div', { class: 'wb-sheet-head' },
        h('h2', null, c.name, chip(rarityOf(c.speciesId, c.variant), `wb-rarity-${rarityOf(c.speciesId, c.variant)}`), c.variant ? chip(c.variant, `wb-variant-${c.variant}`) : null),
        chip(`Lv ${c.level}`, 'wb-chip-soft'),
        h('button', { class: 'wb-iconbtn', title: 'Close', onclick: () => this.closeOverlay() }, gi('u-close')),
      ),
      h('div', { class: 'wb-creature-head' },
        creatureSVG(c, 140),
        h('div', null,
          h('b', null, sp.name),
          h('p', { class: 'wb-dim' }, sp.blurb),
          affinityChips(c),
          personalityLine(c),
        ),
      ),
      tabBar(
        [
          { id: 'stats' as CreatureTab, label: 'Stats' },
          { id: 'abilities', label: 'Abilities' },
          { id: 'history', label: 'History' },
          { id: 'evolution', label: 'Evolution' },
          { id: 'lineage', label: 'Lineage' },
        ],
        tab,
        (t) => this.openCreature(id, t),
      ),
      tab === 'stats'
        ? h('div', null, statBlock(c), h('h3', null, 'Life exposures'), exposureBlock(c))
        : tab === 'abilities'
          ? abilityList(c)
          : tab === 'history'
            ? historyList(c)
            : tab === 'evolution'
              ? h('div', { class: 'wb-stats' },
                  h('p', { class: 'wb-dim' }, evo.reason),
                  ...evo.scores.map((sc) =>
                    h('div', { class: 'wb-meter' },
                      h('span', { class: 'wb-meter-label' }, discovered.includes(sc.to) ? SPECIES_BY_ID[sc.to].name : '???'),
                      bar(sc.score, 1, sc.to === evo.best ? 'wb-bar-bond' : ''),
                      h('span', { class: 'wb-meter-value' }, `${Math.round(sc.score * 100)}%`),
                    ),
                  ),
                  h('p', { class: 'wb-dim' }, `Life experiences decide evolution. Its strongest traits right now: ${sp.branches ? sp.branches.map((b) => (discovered.includes(b.to) ? SPECIES_BY_ID[b.to].name : b.hint)).join(' · ') : 'none'}.`),
                )
              : this.lineageBlock(c),
      h('div', { class: 'wb-actions wb-actions-wrap' },
        h('button', { class: 'wb-btn wb-btn-small', onclick: () => this.act(() => this.notice(g.train(c.id))) }, gi('u-train'), 'Train'),
        h('button', { class: 'wb-btn wb-btn-small', onclick: () => this.act(() => this.notice(g.play(c.id))) }, gi('u-heart'), 'Play'),
        h('button', { class: 'wb-btn wb-btn-small', onclick: () => this.act(() => this.notice(g.rest(c.id))) }, gi('u-rest'), 'Rest'),
        h('button', { class: 'wb-btn wb-btn-small', onclick: () => { this.overlay = { kind: 'feed', target: c.id }; this.render(); } }, gi('u-food'), 'Feed'),
        h('button', { class: 'wb-btn wb-btn-small', onclick: () => { this.breedA = c.id; this.breedB = ''; this.overlay = { kind: 'breed' }; this.render(); } }, gi('u-lineage'), 'Breed'),
      ),
    );
  }

  private lineageBlock(c: Creature): HTMLElement {
    const g = this.game!;
    const ancestors = g.ancestors(c);
    const descendants = g.descendants(c);
    return h('div', { class: 'wb-lineage' },
      h('p', { class: 'wb-dim' }, `Generation ${c.generation}. ${c.generation > 1 ? `This creature carries a trait from an ancestor ${c.generation} generations ago.` : 'The first of its line.'}`),
      h('h3', null, 'Ancestors'),
      ancestors.length
        ? ancestors.map((a) => h('div', { class: 'wb-hist-row' }, h('b', null, a.name), ' ', `${SPECIES_BY_ID[a.speciesId].name} · gen ${a.generation}`))
        : h('p', { class: 'wb-dim' }, 'None recorded.'),
      h('h3', null, 'Descendants'),
      descendants.length
        ? descendants.map((d) => h('div', { class: 'wb-hist-row' }, h('b', null, d.name), ' ', `${SPECIES_BY_ID[d.speciesId].name} · gen ${d.generation}`))
        : h('p', { class: 'wb-dim' }, 'None yet.'),
    );
  }

  // --- breeding ---------------------------------------------------------------------------

  private breedOverlay(): HTMLElement {
    const g = this.game!;
    const s = g.state;
    const all = allCreatures(s);
    const pick = (who: 'a' | 'b') =>
      all.map((c) =>
        h('button', {
          class: `wb-row${(who === 'a' ? this.breedA : this.breedB) === c.id ? ' wb-row-selected' : ''}`,
          onclick: () => {
            if (who === 'a') this.breedA = c.id;
            else this.breedB = c.id;
            this.render();
          },
        },
          h('span', { class: 'wb-row-badge', 'data-species': c.id }),
          h('span', { class: 'wb-row-main' }, h('b', null, c.name), h('small', null, `${SPECIES_BY_ID[c.speciesId].name} · bond ${Math.round(c.bond)} · gen ${c.generation}`)),
        ),
      );
    const check = this.breedA && this.breedB ? g.canBreed(this.breedA, this.breedB) : { ok: false, reason: 'Pick two creatures of one family with high bond.' };
    return h('div', { class: 'wb-sheet' },
      h('div', { class: 'wb-sheet-head' },
        h('h2', null, 'Breeding ground'),
        h('button', { class: 'wb-iconbtn', title: 'Close', onclick: () => this.closeOverlay() }, gi('u-close')),
      ),
      h('p', { class: 'wb-dim' }, 'Two creatures of one family with a strong bond can lay an egg. The child mixes their genes — and sometimes something rare appears.'),
      h('h3', null, 'Parent A'), ...pick('a'),
      h('h3', null, 'Parent B'), ...pick('b'),
      h('p', { class: check.ok ? 'wb-dim' : 'wb-warn' }, check.ok ? 'Ready to breed.' : check.reason),
      h('div', { class: 'wb-actions' },
        h('button', {
          class: 'wb-btn wb-btn-primary',
          disabled: !check.ok,
          onclick: () => {
            const text = g.breed(this.breedA, this.breedB);
            this.screen = 'map';
            this.act(() => {
              this.overlay = { kind: 'notice', text };
            });
          },
        }, gi('u-egg'), 'Breed'),
      ),
    );
  }

  // --- menu, credits, notices --------------------------------------------------------------------------

  private menuOverlay(): HTMLElement {
    const s = this.game!.state;
    return h('div', { class: 'wb-sheet' },
      h('div', { class: 'wb-sheet-head' },
        h('h2', null, 'Menu'),
        h('button', { class: 'wb-iconbtn', title: 'Close', onclick: () => this.closeOverlay() }, gi('u-close')),
      ),
      h('div', { class: 'wb-actions wb-actions-wrap' },
        h('button', { class: 'wb-btn', onclick: () => { this.autosave(); this.notice('Game saved.'); } }, gi('u-save'), 'Save now'),
        h('button', { class: 'wb-btn', onclick: () => download('wildborn-save.json', this.game!.serialize()) }, 'Export save'),
        h('button', { class: 'wb-btn', onclick: () => void this.importSave() }, 'Import save'),
        h('button', { class: 'wb-btn', onclick: () => this.showCredits() }, 'Credits'),
        h('button', {
          class: 'wb-btn wb-btn-ghost',
          onclick: () => {
            if (confirm('Start a new world? Your autosave will be replaced.')) {
              this.newGame(randomSeedString());
            }
          },
        }, 'New world'),
      ),
      h('p', { class: 'wb-dim' }, `Seed: ${s.seed} · Day ${s.day} · ${guideCounts(s).captured} species linked`),
    );
  }

  private creditsOverlay(): HTMLElement {
    return h('div', { class: 'wb-sheet' },
      h('div', { class: 'wb-sheet-head' },
        h('h2', null, 'Credits'),
        h('button', { class: 'wb-iconbtn', title: 'Close', onclick: () => this.closeOverlay() }, gi('u-close')),
      ),
      h('p', null, 'Wildborn is an original game. All creature art is procedural SVG drawn from layered shapes, coloured per species and per individual.'),
      h('p', null, 'UI icons: game-icons.net (CC BY 3.0).'),
      ...icons.credits().map((c) =>
        h('p', { class: 'wb-credit' },
          c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.author) : c.author, ': ',
          ...c.icons.flatMap((ic, k) => [k ? ', ' : '', h('a', { href: ic.href, target: '_blank', rel: 'noopener' }, ic.name)]),
        ),
      ),
    );
  }

  private noticeOverlay(text: string): HTMLElement {
    return h('div', { class: 'wb-sheet wb-sheet-notice' },
      h('div', { class: 'wb-sheet-head' },
        h('h2', null, 'Wildborn'),
        h('button', { class: 'wb-iconbtn', title: 'Close', onclick: () => this.closeOverlay() }, gi('u-close')),
      ),
      h('p', null, text),
      h('div', { class: 'wb-actions' },
        h('button', { class: 'wb-btn wb-btn-primary', onclick: () => this.closeOverlay() }, 'Continue'),
      ),
    );
  }

  private renderOverlay(): void {
    const o = this.overlay;
    if (!o && !this.battle) {
      this.overlayEl.hidden = true;
      clear(this.overlayEl);
      return;
    }
    this.overlayEl.hidden = false;
    clear(this.overlayEl);
    const inner =
      o?.kind === 'wild'
        ? this.wildOverlay()
        : o?.kind === 'battle' || (!o && this.battle)
          ? this.battleOverlay()
          : o?.kind === 'creature'
            ? this.creatureOverlay(o.id, o.tab)
            : o?.kind === 'feed'
              ? this.feedOverlay(o.target)
              : o?.kind === 'menu'
                ? this.menuOverlay()
                : o?.kind === 'regions'
                  ? this.regionsOverlay()
                  : o?.kind === 'credits'
                  ? this.creditsOverlay()
                  : o?.kind === 'breed'
                    ? this.breedOverlay()
                    : o?.kind === 'evolve'
                      ? this.noticeOverlay(`${findCreature(this.game!.state, o.id)?.name ?? 'Your creature'} evolved into ${SPECIES_BY_ID[o.to].name}, shaped by the life it has lived!`)
                      : this.noticeOverlay(o?.kind === 'notice' ? o.text : '');
    this.overlayEl.append(h('div', { class: 'wb-overlay-scrim', onclick: () => { if (this.overlay?.kind !== 'battle') this.closeOverlay(); } }), inner);
    // The wild encounter stays "out in the field": light scrim and a bottom
    // sheet, so the 3D creature is visible on the canvas above it.
    if (o?.kind === 'wild') this.overlayEl.classList.add('wb-overlay-encounter');
    else this.overlayEl.classList.remove('wb-overlay-encounter');
    this.paintBadges(inner);
    this.animateBattle(inner);
  }

  /** Fill [data-species] placeholders with creature art (creature id or species id). */
  private paintBadges(scope: Element): void {
    for (const el of scope.querySelectorAll('[data-species]')) {
      const ref = el.getAttribute('data-species') ?? '';
      if (!ref) {
        el.classList.add('wb-badge-unknown');
        continue;
      }
      const c = this.game ? findCreature(this.game.state, ref) : null;
      const px = el.classList.contains('wb-guide-art') ? 72 : 40;
      el.appendChild(c ? creatureSVG(c, px) : creatureSVG({ speciesId: ref }, px));
    }
  }

  // --- automatic mode ----------------------------------------------------------------------------

  setAuto(on: boolean): void {
    if (this.auto === on) return;
    this.auto = on;
    if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
    }
    if (on && this.game) {
      this.autoTimer = setInterval(() => this.autoTick(), 1000);
    }
    this.render();
  }

  private autoTick(): void {
    const g = this.game;
    if (!g) return;
    const result = autoStep(g, this.battle);
    if (result.startBattle && !this.battle) {
      this.battle = autoStartBattle(g);
      this.battleSeen = 0;
    }
    if (this.battle?.over) {
      this.battle = null;
      this.battleSeen = 0;
    }
    if (this.battle && this.overlay?.kind !== 'battle') this.overlay = { kind: 'battle' };
    if (!this.battle && this.overlay?.kind === 'battle') this.overlay = g.state.wild ? { kind: 'wild' } : null;
    g.settle();
    this.autosave();
    this.render();
  }

  /** Testing aid: run many automatic steps at once. */
  debugAutoplay(steps: number): string {
    for (let i = 0; i < steps; i++) {
      const result = autoStep(this.game!, this.battle);
      if (result.startBattle && !this.battle) this.battle = autoStartBattle(this.game!);
      if (this.battle?.over) this.battle = null;
    }
    this.game!.settle();
    this.render();
    return `ran ${steps} auto steps`;
  }
}
