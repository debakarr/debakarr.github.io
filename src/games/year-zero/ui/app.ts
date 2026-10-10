import { TECHS } from '../data/techs';
import { UNIT, isMilitary } from '../data/units';
import { bindMapInput, type TapInfo } from '../render/input';
import { Minimap } from '../render/minimap';
import { MapRenderer } from '../render/renderer';
import type { MapView } from '../render/view';
import { Map3D } from '../render3d/map3d';
import { Stage, webglAvailable, type QualitySetting } from '../render3d/stage';
import { kitReady, loadKit } from '../render3d/kit';
import { civPopulation } from '../sim/cities';
import { availableTechs, civTotals, techCostFor } from '../sim/civs';
import { chronicle } from '../sim/chronicle';
import type { Game, GameEvent } from '../sim/game';
import { LEGACIES } from '../sim/legacies';
import { newGame } from '../sim/newgame';
import { findPath, occupancy, pathTurns, reachable } from '../sim/path';
import { saveToStorage, saveToStorageSync } from '../sim/save';
import type { Notice, Settings, Unit } from '../sim/state';
import { endTurn } from '../sim/turn';
import {
  advanceOrder, attack, canAttack, canPillage, canUpgrade, disband, pillage, settleHere, upgradeUnit, walkToward,
} from '../sim/units';
import { setMuted, sfx } from './audio';
import { battleBefore, battleInfo, battlePreview, playBattle } from './battle';
import { clear, fmt, gi, h, persist, store, svg } from './dom';
import { ICON } from './icons';
import { closeModal, modalOpen, openModal, showDecision } from './modal';
import { cityPanel, tilePanel, unitBar, unitPanel, type PanelHost } from './panels';
import { openCiv } from './screens/civ';
import { openAudience } from './screens/audience';
import { openDiplomacyModal } from './screens/diplomacy';
import { openHistory } from './screens/history';
import { hideTitle, showHelp, showMenu, showNewGame, showSettings, showTitle, type MenuHost } from './screens/menu';
import { openCityList, openUnitList, openWorldMap } from './screens/lists';
import { openCityManager } from './screens/city';
import { openTech } from './screens/tech';

const TIPS: Record<string, string> = {
  start: 'Your people are wanderers. Select the <b>Settlers</b> (the tent) and press <b>Found city</b> — or move them first. Rivers and coasts make the best homes.',
  city: 'Your first city! It grows and builds on its own. Select it to set a <b>focus</b> or choose what to build. Then <b>End Turn</b>.',
  research: 'Choose what your scholars should study: click the <b>research</b> indicator in the top bar.',
  explore: 'Your <b>Scouts</b> can explore on their own: select them and press <b>Explore</b>. You may find ruins of forgotten peoples.',
  contact: 'You have met another people. Open <b>Diplomacy</b> to trade or make treaties. They will remember everything you do.',
  history: 'Every important moment is being written down. Open <b>History</b> to read the chronicle of your people.',
  war: 'War. Select a soldier and hover or tap an enemy to see the odds before you attack. Walls and hills help defenders.',
};

interface Selection {
  tile: number;
  unitId: number;
  cityId: number;
}

export class App implements PanelHost {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private top: HTMLElement;
  private side: HTMLElement;
  private toasts: HTMLElement;
  private miniCanvas: HTMLCanvasElement;
  private miniWrap: HTMLElement;
  private endBtn: HTMLButtonElement;
  private hint: HTMLElement;
  private unitbarEl: HTMLElement;
  private bottomnav: HTMLElement;
  private leftnav: HTMLElement;
  private turnpill: HTMLElement;
  private tipEl: HTMLElement;
  private modalRoot: HTMLElement;
  private titleRoot: HTMLElement;

  g!: Game;
  private hasGame = false;
  private r: MapView | null = null;
  /** The WebGL stage (null when the browser cannot run 3D: the canvas map is used instead). */
  stage: Stage | null = null;
  /** Resolves true once the 3D model kit is loaded (false if it failed: the classic map takes over). */
  private kitLoad: Promise<boolean> | null = null;
  private kitProgress = 0;
  private labelsEl: HTMLElement;
  private mini: Minimap | null = null;
  private sel: Selection = { tile: -1, unitId: -1, cityId: -1 };
  private hoverTile = -1;
  private pending = -1;
  private showBuild = false;
  private busy = false;
  /** Automatic mode: the AI governs the player and ends turns by itself. */
  auto = false;
  private autoTimer = 0;
  private queued: Notice[] = [];
  private unread = 0;
  private unsub: (() => void) | null = null;
  private lastSound = 0;
  private gameOverShown = false;
  private confirmDisband = -1;
  private sheetCollapsed = false;
  private mobile = window.matchMedia('(max-width: 820px)');
  private landscape = window.matchMedia('(max-height: 520px) and (orientation: landscape)');
  settings: { sound: boolean; animations: boolean; tips: boolean; quality: QualitySetting; battles: boolean } = {
    sound: true, animations: true, tips: true, quality: 'auto', battles: true,
    ...store<Partial<App['settings']>>('yearzero:settings', {}),
  };
  private tipsSeen: string[] = store('yearzero:tips', []);
  private redrawQueued = false;

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('yz');
    this.canvas = h('canvas', { class: 'yz-map', 'aria-label': 'World map' });
    this.labelsEl = h('div');
    this.top = h('header', { class: 'yz-top yz-panel' });
    this.side = h('aside', { class: 'yz-side yz-panel', 'aria-live': 'polite' });
    this.toasts = h('div', { class: 'yz-toasts', 'aria-live': 'polite' });
    this.miniCanvas = h('canvas', { class: 'yz-minimap', 'aria-label': 'Minimap' });
    this.miniWrap = h('div', { class: 'yz-minimap-wrap yz-panel' }, this.miniCanvas);
    this.endBtn = h('button', { class: 'yz-endturn', onclick: () => void this.endTurn() });
    this.hint = h('div', { class: 'yz-hint' });
    this.unitbarEl = h('div', { class: 'yz-unitbar yz-panel' });
    this.bottomnav = h('nav', { class: 'yz-bottomnav', 'aria-label': 'Game' });
    this.leftnav = h('nav', { class: 'yz-leftnav', 'aria-label': 'Empire' });
    this.turnpill = h('div', { class: 'yz-turnpill yz-panel', role: 'status' });
    this.tipEl = h('div', { class: 'yz-tip yz-panel' });
    this.modalRoot = h('div', { class: 'yz-modal-root' });
    this.titleRoot = h('div');
    if (webglAvailable()) {
      try {
        this.stage = new Stage(this.canvas, this.settings.quality);
      } catch (err) {
        console.warn('3D unavailable, using the classic map', err);
        this.stage = null;
      }
    }
    if (this.stage) {
      this.kitLoad = loadKit((f) => (this.kitProgress = f)).then(
        () => true,
        (err) => {
          console.warn('3D models failed to load, using the classic map', err);
          return false;
        },
      );
    }
    root.classList.toggle('yz-3d', !!this.stage);
    root.append(
      this.canvas, this.labelsEl, this.top, this.leftnav, this.side, this.toasts, this.miniWrap,
      h('div', { class: 'yz-endturn-wrap' }, this.hint, this.endBtn),
      this.unitbarEl, this.bottomnav, this.turnpill, this.tipEl, this.modalRoot, this.titleRoot,
    );
    setMuted(!this.settings.sound);
    window.addEventListener('keydown', (e) => this.onKey(e));
    new ResizeObserver(() => {
      if (this.r) this.r.resize();
      else this.stage?.resize();
      this.mini?.draw();
    }).observe(this.canvas);
    this.mobile.addEventListener('change', () => this.hasGame && this.refresh());
    this.landscape.addEventListener('change', () => this.hasGame && this.refresh());
    // Keep moves made since the last turn: save when the page is hidden or closed.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.hasGame && !this.busy) void this.autosave();
    });
    window.addEventListener('pagehide', () => {
      if (!this.hasGame || this.busy) return;
      try {
        saveToStorageSync(this.g, 'auto', 'Autosave');
      } catch {
        /* storage full: the last per-turn autosave remains */
      }
    });
    this.toTitle();
  }

  // --- Lifecycle ---------------------------------------------------------------------

  private menuHost(): MenuHost {
    return {
      root: this.modalRoot,
      game: () => (this.hasGame ? this.g : null),
      start: (s) => this.start(s),
      load: (g) => this.attach(g),
      toTitle: () => this.toTitle(),
      settings: this.settings,
      quality: () => (this.stage ? this.stage.quality : null),
      stage: () => this.stage,
      saveSettings: () => {
        persist('yearzero:settings', this.settings);
        setMuted(!this.settings.sound);
        if (this.r) this.r.animations = this.settings.animations;
        this.stage?.setQuality(this.settings.quality);
        if (!this.settings.tips) clear(this.tipEl);
        this.renderTop();
      },
      toast: (text, tone = 'info') => this.toast({ id: 0, turn: 0, text, tile: -1, tone: tone === 'bad' ? 'bad' : tone === 'good' ? 'good' : 'info' }),
    };
  }

  /** Falls back to the classic 2D map on a fresh canvas (a WebGL canvas cannot give a 2D context). */
  private drop3D(): void {
    if (!this.stage) return;
    this.stage.dispose();
    this.stage = null;
    const fresh = h('canvas', { class: 'yz-map', 'aria-label': 'World map' });
    this.canvas.replaceWith(fresh);
    this.canvas = fresh;
    new ResizeObserver(() => {
      this.r?.resize();
      this.mini?.draw();
    }).observe(fresh);
    this.root.classList.remove('yz-3d');
  }

  toTitle(): void {
    this.setAuto(false);
    this.root.classList.remove('yz-ingame');
    closeModal();
    showTitle(this.menuHost(), this.titleRoot);
  }

  start(settings: Settings): void {
    const g = newGame(settings);
    this.attach(g);
  }

  attach(g: Game): void {
    if (this.stage && !kitReady() && this.kitLoad) {
      // the world's models are still on their way: wait behind a small loading card
      const card = h('div', { class: 'yz-loading yz-panel', role: 'status' }, h('b', {}, 'Preparing the world'), h('span', {}, '…'));
      const bar = h('i');
      card.append(h('div', { class: 'yz-loading-bar' }, bar));
      this.modalRoot.append(card);
      const timer = window.setInterval(() => (bar.style.width = `${Math.round(this.kitProgress * 100)}%`), 100);
      const load = this.kitLoad;
      this.kitLoad = null;
      void load.then((ok) => {
        window.clearInterval(timer);
        card.remove();
        if (!ok) this.drop3D();
        this.attach(g);
      });
      return;
    }
    this.setAuto(false);
    this.unsub?.();
    this.g = g;
    this.hasGame = true;
    this.root.classList.add('yz-ingame');
    this.gameOverShown = false;
    this.unread = 0;
    hideTitle(this.titleRoot);
    closeModal();
    clear(this.toasts);
    if (!this.r) {
      this.r = this.stage ? new Map3D(this.stage, g, this.labelsEl) : new MapRenderer(this.canvas, g);
      if (this.r instanceof Map3D) this.stage!.show(this.r);
      this.r.animations = this.settings.animations;
      this.r.onCamera = () => this.mini?.draw();
      this.mini = new Minimap(this.miniCanvas, g, this.r);
      bindMapInput(this.canvas, this.r, {
        onTap: (t) => this.onTap(t),
        onHover: (tile) => this.onHover(tile),
        onLongPress: (t) => this.onTap(t),
      });
    } else {
      this.r.setGame(g);
      this.mini!.setGame(g);
      if (this.r instanceof Map3D) this.stage!.show(this.r);
    }
    this.r.resize();
    const p = g.player;
    const cap = g.capital(p);
    const focus = cap?.tile ?? g.unitsOf(p.id)[0]?.tile ?? p.startTile;
    this.r.cam.zoom = this.compact() ? 0.95 : 1.15;
    this.r.centerOn(focus, false);
    this.unsub = g.on((e) => this.onGameEvent(e));
    this.sel = { tile: -1, unitId: -1, cityId: -1 };
    this.selectNextUnit(false);
    this.refresh();
    if (g.turn === 0) this.tip('start');
    this.nextDecision();
  }

  private async autosave(): Promise<void> {
    if (!this.hasGame) return;
    try {
      await saveToStorage(this.g, 'auto', 'Autosave');
    } catch {
      /* storage full or unavailable: export remains available */
    }
  }

  // --- Game events ---------------------------------------------------------------------

  private onGameEvent(e: GameEvent): void {
    const g = this.g;
    const r = this.r!;
    switch (e.type) {
      case 'notice':
        this.unread++;
        if (this.busy) this.queued.push(e.notice);
        else this.toast(e.notice);
        break;
      case 'combat':
        if (g.playerSees(e.to) || g.playerSees(e.from)) {
          if (e.dmgDef) r.addEffect('text', e.to, '#ff9b8a', `−${e.dmgDef}`);
          if (e.dmgAtk) r.addEffect('text', e.from, '#ffc58a', `−${e.dmgAtk}`, 1000);
          if (e.killed) r.addEffect('flash', e.to, '#ff5a40', undefined, 600);
          if (r instanceof Map3D) r.combat(e.from, e.to, e.killed);
          if (e.civs.includes(g.player.id)) this.sound('combat');
        }
        break;
      case 'move':
        r.animateMove(e.unitId, e.from, e.to);
        break;
      case 'found':
        if (g.player.explored[e.tile]) r.addEffect('ring', e.tile, g.civ(e.civId).color, undefined, 1400);
        break;
      case 'capture':
        if (g.player.explored[e.tile]) r.addEffect('flash', e.tile, g.civ(e.civId).color, undefined, 900);
        break;
      case 'decision':
        if (!this.busy) queueMicrotask(() => this.nextDecision());
        break;
      case 'reveal':
        this.queueRedraw();
        break;
      case 'history':
        if (e.event.civs.includes(g.player.id) && e.event.kind === 'contact') this.tip('contact');
        if (e.event.civs.includes(g.player.id) && e.event.kind === 'war') {
          this.tip('war');
          this.sound('war');
        }
        break;
    }
  }

  private queueRedraw(): void {
    if (this.redrawQueued) return;
    this.redrawQueued = true;
    requestAnimationFrame(() => {
      this.redrawQueued = false;
      this.r?.invalidate();
      this.mini?.rebuild();
    });
  }

  private sound(kind: keyof typeof sfx): void {
    const now = performance.now();
    if (now - this.lastSound < 120) return;
    this.lastSound = now;
    sfx[kind]();
  }

  // --- Toasts & tips -----------------------------------------------------------------------

  toast(n: Notice): void {
    const el = h('div', {
      class: `yz-toast ${n.tone}`,
      role: 'status',
      onclick: () => {
        if (n.tile >= 0 && this.hasGame) this.centerOn(n.tile);
        el.remove();
      },
    }, h('span', { class: 'txt' }, n.text));
    this.toasts.prepend(el);
    while (this.toasts.childElementCount > 4) this.toasts.lastElementChild?.remove();
    const life = n.tone === 'history' ? 9000 : 6500;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, life);
  }

  private tip(key: string): void {
    if (!this.settings.tips || this.tipsSeen.includes(key) || !TIPS[key]) return;
    clear(this.tipEl);
    const done = () => {
      this.tipsSeen.push(key);
      persist('yearzero:tips', this.tipsSeen);
      clear(this.tipEl);
    };
    this.tipEl.append(svg(ICON.info), h('div', { class: 'txt', html: TIPS[key] }),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        h('button', { class: 'yz-btn small', onclick: done }, 'Got it'),
        h('button', { class: 'yz-btn small', style: { fontSize: '11px' }, onclick: () => { done(); this.settings.tips = false; persist('yearzero:settings', this.settings); } }, 'No tips')));
  }

  // --- Selection & map input --------------------------------------------------------------

  private selectedUnit(): Unit | undefined {
    if (this.sel.unitId < 0) return undefined;
    const u = this.g.unit(this.sel.unitId);
    if (!u) this.sel.unitId = -1;
    return u;
  }

  selectUnit(id: number): void {
    const u = this.g.unit(id);
    if (!u) return;
    this.sel = { tile: u.tile, unitId: id, cityId: -1 };
    this.pending = -1;
    this.confirmDisband = -1;
    this.sheetCollapsed = false;
    this.refresh();
  }

  selectCity(id: number): void {
    const c = this.g.city(id);
    if (!c) return;
    this.sel = { tile: c.tile, unitId: -1, cityId: id };
    this.pending = -1;
    this.showBuild = false;
    this.sheetCollapsed = false;
    this.refresh();
    this.keepAboveSheet(c.tile);
  }

  /** Phones and small screens: panels cover part of the map. */
  private compact(): boolean {
    return this.mobile.matches || this.landscape.matches;
  }

  /** Keep the selection visible beside the bottom sheet (portrait) or the drawer (landscape). */
  private keepAboveSheet(tile: number): void {
    if (!this.r) return;
    const [sx, sy] = this.r.tileScreen(tile);
    if (this.landscape.matches) {
      const drawer = Math.min(340, this.r.viewW * 0.46);
      if (sx > this.r.viewW - drawer - 40) this.r.centerOn(tile, true, 0, drawer / 2);
    } else if (this.mobile.matches && sy > this.r.viewH * 0.4) {
      this.r.centerOn(tile, true, this.r.viewH * 0.22);
    }
  }

  deselect(): void {
    this.closeBattlePreview();
    this.sel = { tile: -1, unitId: -1, cityId: -1 };
    this.pending = -1;
    this.refresh();
  }

  centerOn(tile: number): void {
    this.r?.centerOn(tile);
  }

  click(): void {
    sfx.click();
  }

  private onTap(t: TapInfo): void {
    if (!this.hasGame || this.busy || t.tile < 0) return;
    if (this.previewEl) {
      // a tap elsewhere puts the battle off
      this.closeBattlePreview();
      this.pending = -1;
      this.r!.overlay.path = null;
      this.refresh();
      return;
    }
    const g = this.g;
    const player = g.player;
    const u = this.selectedUnit();
    const city = g.cityAt(t.tile);
    const ownHere = g.unitsOn(t.tile).some((o) => o.civId === player.id) || (!!city && city.civId === player.id);
    if (u && u.civId === player.id && t.tile !== u.tile && (t.secondary || !ownHere)) {
      this.orderUnit(u, t.tile, t.touch && !t.secondary);
      return;
    }
    this.selectTile(t.tile);
  }

  private selectTile(tile: number): void {
    const g = this.g;
    const player = g.player;
    const own = g.unitsOn(tile).filter((o) => o.civId === player.id);
    const city = g.cityAt(tile);
    if (own.length) {
      const cur = own.findIndex((o) => o.id === this.sel.unitId);
      if (cur >= 0) {
        if (cur === own.length - 1 && city && city.civId === player.id) {
          this.selectCity(city.id);
          return;
        }
        this.selectUnit(own[(cur + 1) % own.length].id);
        return;
      }
      if (city && city.civId === player.id && this.sel.cityId !== city.id && own.every((o) => o.order || o.moves <= 0)) {
        this.selectCity(city.id);
        return;
      }
      const idle = own.find((o) => o.moves > 0 && !o.order) ?? own[0];
      sfx.select();
      this.selectUnit(idle.id);
      return;
    }
    if (city && player.explored[tile]) {
      this.selectCity(city.id);
      return;
    }
    this.sel = { tile, unitId: -1, cityId: -1 };
    this.pending = -1;
    this.refresh();
  }

  private onHover(tile: number): void {
    if (!this.hasGame || this.busy || this.previewEl) return;
    const prev = this.hoverTile;
    this.hoverTile = tile;
    const r = this.r!;
    r.overlay.hoverTile = tile;
    const u = this.selectedUnit();
    if (u && u.civId === this.g.player.id && tile >= 0 && tile !== u.tile) {
      this.previewPath(u, tile);
      const wasAttack = prev >= 0 && canAttack(this.g, u, prev);
      if (canAttack(this.g, u, tile) || wasAttack) this.renderSide();
    } else if (this.pending < 0) {
      r.overlay.path = null;
    }
    r.request();
  }

  private previewPath(u: Unit, tile: number): void {
    const r = this.r!;
    const g = this.g;
    if (canAttack(g, u, tile)) {
      r.overlay.path = [tile];
      r.overlay.pathTurns = [0];
      r.overlay.pathAttack = true;
      return;
    }
    const path = findPath(g, u, tile, { attackTarget: true, maxNodes: 2000 });
    r.overlay.path = path && path.length ? path : null;
    r.overlay.pathTurns = path ? pathTurns(g, u, path) : null;
    r.overlay.pathAttack = !!path && occupancy(g, u, tile) === 'enemy';
  }

  private orderUnit(u: Unit, tile: number, confirm: boolean): void {
    const g = this.g;
    if (canAttack(g, u, tile)) {
      this.openBattlePreview(u, tile);
      return;
    }
    const path = findPath(g, u, tile, { attackTarget: true, maxNodes: 4000 });
    if (!path || !path.length) {
      this.toast({ id: 0, turn: g.turn, text: `Our ${UNIT[u.type].name} cannot find a way there.`, tile: -1, tone: 'info' });
      return;
    }
    if (confirm && this.pending !== tile) {
      this.pending = tile;
      this.previewPath(u, tile);
      this.r!.overlay.hoverTile = tile;
      this.r!.request();
      return;
    }
    this.pending = -1;
    const attackEnd = occupancy(g, u, tile) === 'enemy';
    if (attackEnd) {
      u.order = null;
      const stop = path[path.length - 2];
      if (stop !== undefined) walkToward(g, u, stop);
      if (canAttack(g, u, tile)) {
        this.r!.invalidate();
        this.openBattlePreview(u, tile);
        return;
      }
    } else {
      u.order = { kind: 'goto', target: tile };
      if (u.moves > 0) walkToward(g, u, tile);
      if (u.tile === tile) u.order = null;
    }
    this.sound('move');
    this.afterUnitAct(u);
  }

  // --- Battles ------------------------------------------------------------------------------

  private previewEl: HTMLElement | null = null;
  private previewStart: (() => void) | null = null;

  private openBattlePreview(u: Unit, tile: number): void {
    this.closeBattlePreview();
    this.pending = tile;
    this.hoverTile = tile;
    this.previewPath(u, tile);
    this.r!.overlay.hoverTile = tile;
    this.r!.request();
    this.renderSide();
    const start = () => {
      this.closeBattlePreview();
      void this.startBattle(u, tile);
    };
    const el = battlePreview(this.g, u, tile, {
      start,
      cancel: () => {
        this.closeBattlePreview();
        this.pending = -1;
        this.r!.overlay.path = null;
        this.refresh();
      },
      watch: this.settings.battles,
      setWatch: (on) => {
        this.settings.battles = on;
        persist('yearzero:settings', this.settings);
      },
      canWatch: !!this.stage,
    });
    if (!el) return;
    sfx.alert();
    this.previewEl = el;
    this.previewStart = start;
    this.root.append(el);
    (el.querySelector('[data-start]') as HTMLButtonElement | null)?.focus();
  }

  private closeBattlePreview(): void {
    this.previewEl?.remove();
    this.previewEl = null;
    this.previewStart = null;
  }

  /** Resolves the attack for real, then (if enabled) plays it as a battle scene. */
  private async startBattle(u: Unit, tile: number): Promise<void> {
    const g = this.g;
    this.pending = -1;
    if (!canAttack(g, u, tile)) return;
    const film = this.settings.battles && this.settings.animations && this.stage && this.r instanceof Map3D && g.playerSees(tile);
    if (!film) {
      this.doAttack(u, tile);
      return;
    }
    const before = battleBefore(g, u, tile);
    let ev: Extract<GameEvent, { type: 'combat' }> | null = null;
    const off = g.on((e) => {
      if (e.type === 'combat' && !ev) ev = e;
    });
    this.busy = true;
    this.queued = [];
    let res: ReturnType<typeof attack> = null;
    try {
      res = attack(g, u, tile);
    } finally {
      off();
    }
    const combat = ev as Extract<GameEvent, { type: 'combat' }> | null;
    if (res && combat && before) {
      const info = battleInfo(g, before, { dmgAtk: combat.dmgAtk, dmgDef: combat.dmgDef, killed: res.killed, died: res.died, captured: res.captured });
      try {
        await playBattle({ root: this.root, stage: this.stage!, sound: (k) => this.sound(k) }, info);
      } catch (err) {
        console.error(err);
        this.stage!.show(this.r as Map3D);
      }
    }
    this.busy = false;
    this.flushQueued();
    this.afterUnitAct(u);
    this.nextDecision();
  }

  private doAttack(u: Unit, tile: number): void {
    const res = attack(this.g, u, tile);
    if (!res) return;
    this.sound('combat');
    this.afterUnitAct(u);
  }

  private afterUnitAct(u: Unit): void {
    const alive = !!this.g.unit(u.id);
    this.r!.invalidate();
    this.mini?.rebuild();
    if (alive && u.moves > 0) {
      this.sel.tile = u.tile;
      this.refresh();
      return;
    }
    if (!this.selectNextUnit(true)) {
      if (alive) this.sel.tile = u.tile;
      else this.sel = { tile: -1, unitId: -1, cityId: -1 };
      this.refresh();
    }
  }

  private idleUnits(): Unit[] {
    return this.g.unitsOf(this.g.player.id).filter((u) => u.moves > 0 && !u.order);
  }

  selectNextUnit(center: boolean): boolean {
    const idle = this.idleUnits();
    if (!idle.length) return false;
    const cur = idle.findIndex((u) => u.id === this.sel.unitId);
    const next = idle[(cur + 1) % idle.length];
    if (next.id === this.sel.unitId && cur >= 0 && idle.length === 1) {
      this.selectUnit(next.id);
      return true;
    }
    this.selectUnit(next.id);
    if (center && this.r && !this.r.isOnScreen(next.tile, 90)) this.r.centerOn(next.tile);
    return true;
  }

  unitAction(action: string): void {
    const u = this.selectedUnit();
    const g = this.g;
    if (!u || u.civId !== g.player.id || this.busy) return;
    sfx.click();
    switch (action) {
      case 'found': {
        const city = settleHere(g, u);
        if (city) {
          this.sound('found');
          this.r!.invalidate();
          this.mini?.rebuild();
          this.selectCity(city.id);
          this.tip(g.citiesOf(g.player.id).length === 1 ? 'city' : 'history');
          if (!g.player.research) setTimeout(() => this.tip('research'), 4000);
        }
        return;
      }
      case 'explore':
        u.order = { kind: 'explore' };
        advanceOrder(g, u);
        this.afterUnitAct(u);
        return;
      case 'fortify':
        u.order = { kind: 'fortify' };
        this.afterUnitAct({ ...u, moves: 0 });
        return;
      case 'sleep':
        u.order = { kind: 'sleep' };
        this.afterUnitAct({ ...u, moves: 0 });
        return;
      case 'skip':
        u.moves = 0;
        this.afterUnitAct(u);
        return;
      case 'upgrade':
        if (canUpgrade(g, u)) upgradeUnit(g, u);
        break;
      case 'pillage':
        if (canPillage(g, u)) {
          const gold = pillage(g, u);
          this.toast({ id: 0, turn: g.turn, text: `Pillaged for ${gold} gold.`, tile: u.tile, tone: 'war' });
          this.r!.invalidate();
        }
        break;
      case 'cancel':
        u.order = null;
        break;
      case 'disband':
        if (this.confirmDisband !== u.id) {
          this.confirmDisband = u.id;
          this.toast({ id: 0, turn: g.turn, text: `Press Disband again to dismiss the ${UNIT[u.type].name}.`, tile: -1, tone: 'info' });
          return;
        }
        disband(g, u);
        this.confirmDisband = -1;
        this.afterUnitAct({ ...u, moves: 0 });
        return;
      case 'next':
        if (!this.selectNextUnit(true)) this.toast({ id: 0, turn: g.turn, text: 'All units have their orders.', tile: -1, tone: 'info' });
        return;
    }
    this.refresh();
  }

  // --- Turn ------------------------------------------------------------------------------

  async endTurn(auto = false): Promise<void> {
    if (!this.hasGame || this.busy) return;
    const g = this.g;
    closeModal();
    clear(this.tipEl);
    this.busy = true;
    this.queued = [];
    this.pending = -1;
    const researching = g.player.research;
    this.sound('endTurn');
    this.turnpill.classList.add('on');
    this.turnpill.textContent = 'The world turns…';
    this.renderEndTurn();
    const r = this.r!;
    r.overlay.path = null;
    r.overlay.reach = null;
    r.overlay.attack = null;
    try {
      const res = await endTurn(g, { autoPlayer: auto, onStage: (label) => (this.turnpill.textContent = label) });
      this.busy = false;
      this.turnpill.classList.remove('on');
      this.flushQueued();
      r.invalidate();
      this.mini?.rebuild();
      void this.autosave();
      for (const id of res.legacies) {
        if (auto) this.toast({ id: 0, turn: g.turn, text: `A legacy: ${LEGACIES.find((l) => l.id === id)?.name ?? id}.`, tile: -1, tone: 'history' });
        else this.showLegacy(id);
      }
    } catch (err) {
      console.error(err);
      this.busy = false;
      this.turnpill.classList.remove('on');
      this.toast({ id: 0, turn: g.turn, text: `Something went wrong this turn: ${(err as Error).message}`, tile: -1, tone: 'bad' });
    }
    if (g.turn === 6) this.tip('explore');
    if (g.turn === 25) this.tip('history');
    if (!g.player.alive && !this.gameOverShown) {
      this.gameOverShown = true;
      this.setAuto(false);
      this.showGameOver();
    } else if (auto) {
      if (this.sel.unitId >= 0 && !g.unit(this.sel.unitId)) this.sel.unitId = -1;
      this.refresh();
    } else {
      if (this.sel.unitId >= 0 && !g.unit(this.sel.unitId)) this.sel.unitId = -1;
      if (!this.selectNextUnit(true)) this.refresh();
      this.nextDecision();
      // A discovery was made: ask what to study next (after any decisions).
      if (researching && !g.player.research && availableTechs(g.player).length && !modalOpen()) this.open('tech');
    }
  }

  /** Turn automatic mode on or off. While on, the AI plays a year every couple of seconds. */
  setAuto(on: boolean): void {
    if (this.auto === on) return;
    this.auto = on;
    clearTimeout(this.autoTimer);
    this.root.classList.toggle('yz-auto-on', on);
    if (this.hasGame) this.renderTop();
    if (on) {
      this.toast({ id: 0, turn: this.g.turn, text: 'Automatic mode: the AI now governs your people. Tap AUTO again to take over.', tile: -1, tone: 'info' });
      this.autoStep();
    }
  }

  private autoStep(): void {
    clearTimeout(this.autoTimer);
    if (!this.auto || !this.hasGame) return;
    // Wait while a turn runs or the player is reading something.
    if (this.busy || modalOpen()) {
      this.autoTimer = window.setTimeout(() => this.autoStep(), 500);
      return;
    }
    void this.endTurn(true).then(() => {
      if (this.auto) this.autoTimer = window.setTimeout(() => this.autoStep(), 1600);
    });
  }

  /** Testing aid (exposed with ?debug): let the AI govern the player for n years. */
  async debugAutoplay(n: number): Promise<void> {
    for (let k = 0; k < n && this.g.player.alive; k++) {
      await endTurn(this.g, { autoPlayer: true, yielder: async () => undefined });
    }
    this.r?.invalidate();
    this.mini?.rebuild();
    this.refresh();
  }

  private flushQueued(): void {
    const rank = (n: Notice) => (n.tone === 'war' ? 4 : n.tone === 'history' ? 3 : n.tone === 'bad' ? 2 : n.tone === 'good' ? 1 : 0);
    const best = [...this.queued].sort((a, b) => rank(b) - rank(a)).slice(0, 4).reverse();
    for (const n of best) this.toast(n);
    if (this.queued.length > 4) {
      this.toast({ id: 0, turn: this.g.turn, text: `${this.queued.length - 4} more reports this year — open the log.`, tile: -1, tone: 'info' });
    }
    this.queued = [];
  }

  nextDecision(): void {
    if (!this.hasGame || this.busy || modalOpen()) return;
    const d = this.g.s.decisions.find((x) => x.civId === this.g.player.id);
    if (!d) return;
    this.sound('alert');
    const shown = showDecision(this.modalRoot, this.g, d, () => {
      this.r?.invalidate();
      this.mini?.rebuild();
      this.refresh();
      setTimeout(() => this.nextDecision(), 60);
    });
    if (!shown) this.nextDecision();
  }

  private showLegacy(id: string): void {
    const L = LEGACIES.find((l) => l.id === id);
    if (!L) return;
    this.sound('discovery');
    openModal(this.modalRoot, {
      title: `A Legacy: ${L.name}`,
      gicon: 'n-legacy',
      narrow: true,
      render: (body) => body.append(h('p', { class: 'yz-event-text' }, `${L.desc} The ${this.g.player.name} will be remembered for this. History does not end here — it simply goes on.`)),
      foot: (foot) => foot.append(
        h('button', { class: 'yz-btn', onclick: () => openHistory(this.modalRoot, this.g, (t) => { closeModal(); this.centerOn(t); }) }, 'Read our history'),
        h('button', { class: 'yz-btn primary', onclick: () => closeModal() }, 'Continue the story')),
    });
  }

  private showGameOver(): void {
    const p = this.g.player;
    openModal(this.modalRoot, {
      title: `The ${p.name} Are No More`,
      gicon: 'e-fallen',
      narrow: true,
      render: (body) => {
        for (const para of chronicle(this.g, p).slice(0, 6)) body.append(h('p', { class: 'yz-event-text', style: { fontSize: '15px', margin: '0 0 10px' } }, para));
      },
      foot: (foot) => foot.append(
        h('button', { class: 'yz-btn', onclick: () => openHistory(this.modalRoot, this.g, (t) => { closeModal(); this.centerOn(t); }) }, 'Read the full history'),
        h('button', { class: 'yz-btn', onclick: () => closeModal() }, 'Watch the world go on'),
        h('button', { class: 'yz-btn primary', onclick: () => showNewGame(this.menuHost()) }, 'Begin a new people')),
    });
  }

  // --- Rendering of HUD & panels ---------------------------------------------------------------

  refresh(): void {
    if (!this.hasGame) return;
    this.renderTop();
    this.renderSide();
    this.renderUnitbar();
    this.renderEndTurn();
    this.renderBottomNav();
    this.updateOverlay();
  }

  private updateOverlay(): void {
    const r = this.r!;
    const g = this.g;
    const u = this.selectedUnit();
    r.overlay.selectedUnit = u ? u.id : -1;
    r.overlay.selectedTile = u ? u.tile : this.sel.tile;
    if (u && u.civId === g.player.id && u.moves > 0) {
      r.overlay.reach = reachable(g, u);
      const def = UNIT[u.type];
      const range = def.rng > 0 ? def.range : 1;
      const atk = new Set<number>();
      if (isMilitary(def)) for (const t of g.grid.within(u.tile, range)) if (canAttack(g, u, t)) atk.add(t);
      r.overlay.attack = atk;
    } else {
      r.overlay.reach = null;
      r.overlay.attack = null;
    }
    if (!u) r.overlay.path = null;
    r.request();
  }

  private renderTop(): void {
    const g = this.g;
    const p = g.player;
    const tot = civTotals(g, p);
    const cities = g.citiesOf(p.id);
    const mood = cities.length ? cities.reduce((s, c) => s + c.y.mood, 0) / cities.length : 0;
    const food = cities.reduce((s, c) => s + c.y.foodNet, 0);
    const prod = cities.reduce((s, c) => s + c.y.prod, 0);
    const era = p.eraPath[p.eraPath.length - 1]?.name ?? 'Tribal Age';
    clear(this.top);
    const research = p.research ? TECHS.find((t) => t.id === p.research)! : null;
    const needResearch = !research && availableTechs(p).length > 0 && cities.length > 0;
    const sign = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n, Math.abs(n) < 10 && n % 1 ? 1 : 0)}`;
    const chip = (icon: string, cls: string, value: string, delta: string, title: string, fn: () => void, extra = '') =>
      h('button', { class: `yz-res ${extra}`, title, onclick: fn },
        h('span', { class: `ic ${cls}` }, gi(icon)), h('b', { class: 'yz-num' }, value), delta ? h('span', { class: `d${delta.startsWith('-') ? ' neg' : ''}` }, delta) : null);
    const resEl = h('button', {
      class: `yz-res research${needResearch ? ' need' : ''}`,
      title: research ? `Researching ${research.name}` : 'Choose research',
      onclick: () => this.open('tech'),
    }, h('span', { class: 'ic c-sci' }, gi('y-sci')),
    h('span', { class: 'rs' }, h('b', null, research ? research.name : 'Choose research'),
      research ? h('span', { class: 'yz-bar c-sci' }, h('i', { style: { width: `${Math.min(100, (p.sciStore / techCostFor(g, p, research.id)) * 100)}%` } })) : null),
    h('span', { class: 'd' }, `+${tot.sci}`));
    this.top.append(
      h('a', { class: 'yz-iconbtn yz-back', href: '/games', title: 'Back to games', 'aria-label': 'Back to games' }, svg(ICON.back)),
      h('button', { class: 'yz-civ', onclick: () => this.open('civ'), title: 'Your civilization' },
        h('span', { class: 'yz-crest small', style: { '--civ': p.color } as never }, gi('n-civ')),
        h('div', { class: 'yz-civ-text' }, h('div', { class: 'yz-civ-name' }, p.alive ? p.name : `${p.name} †`), h('div', { class: 'yz-era' }, `${era}${p.anarchy ? ' · Anarchy' : ''}`))),
      h('div', { class: 'yz-resbar' },
        chip('y-gold', 'c-gold', fmt(Math.floor(p.gold)), sign(tot.net), 'Treasury and income per year', () => this.open('civ')),
        chip('y-food', 'c-food', fmt(civPopulation(g, p)), sign(Math.round(food)), 'Population and food surplus per year', () => this.open('history', 'Cities'), 'hide-sm'),
        chip('y-prod', 'c-prod', fmt(Math.round(prod)), '', 'Production per year', () => this.openCities(), 'hide-md'),
        resEl,
        chip('y-cult', 'c-cult', fmt(p.culture), `+${tot.cult}`, 'Culture', () => this.open('civ', 'Identity'), 'hide-sm'),
        chip(mood >= 0 ? 'y-happy' : 'y-sad', mood >= 0 ? 'c-mood' : 'c-bad', mood >= 0 ? `+${mood.toFixed(0)}` : mood.toFixed(0), '', 'Average mood of your cities', () => this.open('civ'), 'hide-md')),
      h('div', { class: 'yz-turnchip', title: 'Each turn is one year' },
        h('span', { class: 'sun' }, gi('w-sunhouse')),
        h('div', null, h('b', null, `Year ${g.turn}`), h('span', null, era))),
      h('div', { class: 'yz-topbtns' },
        h('button', { class: 'yz-sqbtn hide-sm', title: 'History (H)', onclick: () => this.open('history') }, svg(ICON.book)),
        h('button', { class: 'yz-sqbtn hide-sm', title: 'Legacies', onclick: () => this.open('civ', 'Legacies') }, svg(ICON.trophy)),
        h('button', { class: 'yz-sqbtn', title: 'Reports', onclick: () => this.openLog() }, svg(ICON.bell), this.unread ? h('span', { class: 'yz-badge' }, String(Math.min(99, this.unread))) : null),
        h('button', { class: 'yz-sqbtn hide-sm', title: this.settings.sound ? 'Mute' : 'Unmute', onclick: () => { this.settings.sound = !this.settings.sound; this.menuHost().saveSettings(); } }, svg(this.settings.sound ? ICON.sound : ICON.mute)),
        h('button', { class: 'yz-sqbtn', title: 'Settings', onclick: () => showSettings(this.menuHost()) }, svg(ICON.gear)),
        h('button', { class: 'yz-sqbtn', title: 'Menu', onclick: () => showMenu(this.menuHost()) }, svg(ICON.menu)),
        h('button', {
          class: `yz-autobtn${this.auto ? ' on' : ''}`,
          title: this.auto ? 'Automatic mode is on: tap to take over' : 'Automatic mode: let the AI play',
          'aria-pressed': String(this.auto),
          onclick: () => this.setAuto(!this.auto),
        }, 'AUTO')),
    );
    this.renderLeftNav();
  }

  private renderLeftNav(): void {
    clear(this.leftnav);
    const item = (icon: Node, label: string, fn: () => void, key: string, badge = '') =>
      h('button', { class: 'yz-lnav', title: `${label} (${key})`, onclick: fn }, h('span', { class: 'ic' }, icon), h('span', { class: 'lb' }, label), badge ? h('span', { class: 'yz-badge' }, badge) : null);
    const p = this.g.player;
    const idle = this.idleUnits().length;
    const known = this.g.s.civs.filter((c) => c.id !== p.id && c.alive && this.g.knows(p.id, c.id)).length;
    this.leftnav.append(
      item(gi('n-city'), 'Cities', () => this.openCities(), 'Y'),
      item(gi('u-swordsmen'), 'Units', () => this.openUnits(), 'U', idle ? String(idle) : ''),
      item(gi('n-tech'), 'Research', () => this.open('tech'), 'T', !p.research && availableTechs(p).length && this.g.citiesOf(p.id).length ? '!' : ''),
      item(gi('n-diplomacy'), 'Diplomacy', () => this.open('diplomacy'), 'D', known ? String(known) : ''),
      item(gi('n-civ'), 'Civics', () => this.open('civ'), 'C'),
      item(gi('n-history'), 'History', () => this.open('history'), 'H'),
      item(svg(ICON.map), 'World Map', () => this.openWorldMap(), 'M'),
    );
  }

  private renderSide(): void {
    clear(this.side);
    const g = this.g;
    const mobile = this.compact();
    const u = this.selectedUnit();
    let content: HTMLElement | null = null;
    if (u) {
      if (!mobile || u.civId !== g.player.id) content = unitPanel(this, u, this.pending >= 0 ? this.pending : this.hoverTile);
      else if (this.pending >= 0 && canAttack(g, u, this.pending)) content = unitPanel(this, u, this.pending);
    } else if (this.sel.cityId >= 0) {
      const c = g.city(this.sel.cityId);
      if (c) content = cityPanel(this, c, { showBuild: this.showBuild, toggleBuild: () => { this.showBuild = !this.showBuild; this.renderSide(); this.renderTop(); } });
    } else if (this.sel.tile >= 0) {
      content = tilePanel(this, this.sel.tile);
    }
    if (content) {
      if (this.mobile.matches && !this.landscape.matches) this.side.append(h('button', { class: 'yz-sheet-handle', 'aria-label': 'Expand or collapse', onclick: () => { this.sheetCollapsed = !this.sheetCollapsed; this.side.classList.toggle('collapsed', this.sheetCollapsed); } }));
      this.side.append(content);
    }
    this.side.classList.toggle('collapsed', this.mobile.matches && !this.landscape.matches && this.sheetCollapsed);
    this.root.classList.toggle('has-sheet', !!content);
  }

  private renderUnitbar(): void {
    clear(this.unitbarEl);
    const u = this.selectedUnit();
    const show = !!u && u.civId === this.g.player.id;
    if (show) for (const b of unitBar(this, u!, this.compact())) this.unitbarEl.append(b);
    this.root.classList.toggle('has-unitbar', show);
  }

  private renderEndTurn(): void {
    clear(this.endBtn);
    clear(this.hint);
    if (!this.hasGame) return;
    const g = this.g;
    this.endBtn.disabled = this.busy;
    if (this.busy) {
      this.endBtn.append(svg(ICON.hourglass), h('span', null, 'The world turns…'));
      return;
    }
    this.endBtn.append(h('span', null, 'End Turn', h('span', { class: 'sub' }, `Year ${g.turn} → ${g.turn + 1}`)));
    const idle = this.idleUnits().length;
    const p = g.player;
    if (g.s.decisions.some((d) => d.civId === p.id)) this.hint.append(h('button', { class: 'yz-btn small active', onclick: () => this.nextDecision() }, 'A decision awaits'));
    if (!p.research && availableTechs(p).length && g.citiesOf(p.id).length) this.hint.append(h('button', { class: 'yz-btn small', onclick: () => this.open('tech') }, svg(ICON.sci), 'Choose research'));
    if (idle) this.hint.append(h('button', { class: 'yz-btn small', onclick: () => this.selectNextUnit(true) }, `${idle} unit${idle > 1 ? 's' : ''} await orders`));
  }

  private renderBottomNav(): void {
    clear(this.bottomnav);
    const btn = (icon: Node, label: string, fn: () => void, cls = '') => h('button', { class: cls, onclick: fn, 'aria-label': label }, icon, h('span', null, label));
    this.bottomnav.append(
      btn(gi('n-tech'), 'Research', () => this.open('tech')),
      btn(gi('n-civ'), 'Civ', () => this.open('civ')),
      btn(gi('n-diplomacy'), 'Diplomacy', () => this.open('diplomacy')),
      btn(gi('n-history'), 'History', () => this.open('history')),
      btn(svg(ICON.menu), 'Menu', () => showMenu(this.menuHost())),
      btn(svg(ICON[this.busy ? 'hourglass' : 'next']), this.busy ? 'Wait…' : `End ${this.g.turn}`, () => void this.endTurn(), 'endturn'),
    );
  }

  open(what: 'tech' | 'civ' | 'diplomacy' | 'history', tab?: string): void {
    if (!this.hasGame || this.busy) return;
    sfx.click();
    const jump = (t: number) => {
      closeModal();
      this.centerOn(t);
      this.sel = { tile: t, unitId: -1, cityId: -1 };
      const c = this.g.cityAt(t);
      if (c && this.g.player.explored[t]) this.sel.cityId = c.id;
      this.refresh();
    };
    switch (what) {
      case 'tech': return openTech(this.modalRoot, this.g, () => this.refresh());
      case 'civ': return openCiv(this.modalRoot, this.g, () => this.refresh(), tab);
      case 'diplomacy': {
        const p = this.g.player;
        const anyone = this.g.s.civs.some((c) => c.id !== p.id && c.alive && this.g.knows(p.id, c.id));
        if (this.stage && this.r instanceof Map3D && anyone && this.settings.animations) {
          closeModal();
          openAudience({
            root: this.root, stage: this.stage, g: this.g,
            onChange: () => { this.r?.invalidate(); this.mini?.rebuild(); },
            onClose: () => this.refresh(),
            sound: (k) => this.sound(k),
          }, typeof tab === 'string' ? Number(tab) : -1);
          return;
        }
        return openDiplomacyModal(this.modalRoot, this.g, () => { this.refresh(); this.r?.invalidate(); });
      }
      case 'history': return openHistory(this.modalRoot, this.g, jump, tab);
    }
  }

  manageCity(id: number): void {
    if (!this.hasGame || this.busy) return;
    sfx.click();
    openCityManager(this.modalRoot, {
      g: this.g,
      portrait: (tile) => this.portraitOf(tile, 'city'),
      changed: () => this.refresh(),
      click: () => sfx.click(),
      select: (uid) => { closeModal(); this.selectUnit(uid); },
    }, id);
  }

  openCities(): void {
    if (!this.hasGame || this.busy) return;
    sfx.click();
    openCityList(this.modalRoot, this.g, (id) => { closeModal(); const c = this.g.city(id); if (c) { this.centerOn(c.tile); this.selectCity(id); } }, (id) => this.portraitOf(this.g.city(id)?.tile ?? -1, 'city'));
  }

  openUnits(): void {
    if (!this.hasGame || this.busy) return;
    sfx.click();
    openUnitList(this.modalRoot, this.g, (id) => { closeModal(); const u = this.g.unit(id); if (u) { this.centerOn(u.tile); this.selectUnit(id); } });
  }

  openWorldMap(): void {
    if (!this.hasGame || this.busy) return;
    sfx.click();
    openWorldMap(this.modalRoot, this.g, (t) => { closeModal(); this.centerOn(t); });
  }

  private portraits = new Map<string, string>();

  /** A small 3D picture of a tile or city for the panels (cached per year). */
  portraitOf(tile: number, kind: 'tile' | 'city'): string | null {
    if (tile < 0 || !(this.r instanceof Map3D) || !this.stage) return null;
    const key = `${tile}|${kind}|${this.g.turn}|${this.g.s.map.cityAt[tile]}|${this.g.s.map.improvement[tile]}`;
    let url = this.portraits.get(key);
    if (!url) {
      if (this.portraits.size > 60) this.portraits.clear();
      try {
        url = this.r.portrait(tile, 360, 200, kind === 'city' ? 1.05 : 1.25).toDataURL('image/jpeg', 0.85);
      } catch {
        return null;
      }
      this.portraits.set(key, url);
    }
    return url;
  }

  private openLog(): void {
    this.unread = 0;
    this.renderTop();
    const g = this.g;
    openModal(this.modalRoot, {
      title: 'Reports',
      icon: 'bell',
      narrow: true,
      render: (body) => {
        const list = h('div', { class: 'yz-timeline' });
        for (const n of [...g.s.notices].reverse()) {
          list.append(h('div', {
            class: `yz-tl-row${n.tile >= 0 ? ' link' : ''}`,
            onclick: () => { if (n.tile >= 0) { closeModal(); this.centerOn(n.tile); } },
          }, h('div', { class: 'yz-tl-year' }, `Year ${n.turn}`), h('div', { class: 't', style: { fontFamily: n.tone === 'history' ? '' : 'var(--yz-sans)', fontSize: '13.5px' } }, n.text)));
        }
        if (!g.s.notices.length) list.append(h('p', { class: 'yz-muted' }, 'Nothing to report yet.'));
        body.append(list);
      },
    });
  }

  // --- Keyboard ------------------------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    if (!this.hasGame || e.metaKey || e.ctrlKey || e.altKey) return;
    // battle films and audiences handle their own keys
    if (this.root.classList.contains('yz-cinema')) return;
    if (modalOpen()) {
      if (e.key === 'Escape' && !this.g.s.decisions.some((d) => d.civId === this.g.player.id)) closeModal();
      return;
    }
    if (this.busy) return;
    if (this.previewEl) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.previewStart?.();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        (this.previewEl.querySelector('.yz-btn') as HTMLButtonElement | null)?.click();
      }
      return;
    }
    const r = this.r!;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let handled = true;
    switch (k) {
      case 'Enter': void this.endTurn(); break;
      case 'n': this.unitAction('next'); if (!this.selectedUnit()) this.selectNextUnit(true); break;
      case ' ': this.unitAction('skip'); break;
      case 'b': this.unitAction('found'); break;
      case 'f': this.unitAction('fortify'); break;
      case 's': this.unitAction('sleep'); break;
      case 'e': this.unitAction('explore'); break;
      case 'u': if (this.selectedUnit()) this.unitAction('upgrade'); else this.openUnits(); break;
      case 'p': this.unitAction('pillage'); break;
      case 'w': this.unitAction('cancel'); break;
      case 't': this.open('tech'); break;
      case 'c': this.open('civ'); break;
      case 'd': this.open('diplomacy'); break;
      case 'h': this.open('history'); break;
      case 'm': this.openWorldMap(); break;
      case 'y': this.openCities(); break;
      case 'o': showSettings(this.menuHost()); break;
      case '?': showHelp(this.modalRoot); break;
      case 'Escape': this.deselect(); break;
      case 'ArrowLeft': r.pan(120, 0); break;
      case 'ArrowRight': r.pan(-120, 0); break;
      case 'ArrowUp': r.pan(0, 120); break;
      case 'ArrowDown': r.pan(0, -120); break;
      case '+': case '=': r.zoomAt(1.2, r.viewW / 2, r.viewH / 2); break;
      case '-': case '_': r.zoomAt(1 / 1.2, r.viewW / 2, r.viewH / 2); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  }
}
