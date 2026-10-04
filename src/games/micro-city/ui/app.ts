import { compact, download, h, pickFile } from '../../shared/dom';
import { SaveStore } from '../../shared/savefile';
import type { IconKey } from '../art';
import { HH, HW } from '../render/paint';
import { Renderer, type Overlay } from '../render/renderer';
import { footprint } from '../sim/build';
import { botTurn } from '../sim/bot';
import type { City, CityEvent } from '../sim/city';
import { BUILDING, MILESTONES, ZONE_COLOR } from '../sim/defs';
import { FLAG_FIRE } from '../sim/state';
import { loadCity, refreshQuick, saveCity, stepMonth, stepPhases } from '../sim/step';
import { showMenu, showTitle, toast } from './menu';
import { PANELS, renderPanel, type Host, type PanelId } from './panels';
import { GROUPS, planTool, TOOL, toolLockNote, toolUnlocked, type Plan, type Tool } from './tools';
import { gi } from './util';

/** Milliseconds per simulated month at each speed. */
const SPEED_MS = [0, 4000, 1800, 700];
export const store = new SaveStore('mc');

const OVERLAYS: { id: Overlay | null; label: string; icon: IconKey }[] = [
  { id: null, label: 'None', icon: 'u-close' },
  { id: 'land', label: 'Land value', icon: 's-land' },
  { id: 'happy', label: 'Happiness', icon: 's-happy' },
  { id: 'traffic', label: 'Traffic', icon: 's-traffic' },
  { id: 'air', label: 'Air pollution', icon: 's-air' },
  { id: 'noise', label: 'Noise', icon: 's-noise' },
  { id: 'crime', label: 'Crime', icon: 's-crime' },
  { id: 'power', label: 'Power', icon: 's-power' },
  { id: 'water', label: 'Water', icon: 's-water' },
  { id: 'police', label: 'Police', icon: 's-police' },
  { id: 'fire', label: 'Fire', icon: 's-fire' },
  { id: 'health', label: 'Health', icon: 's-health' },
  { id: 'education', label: 'Education', icon: 's-edu' },
  { id: 'transit', label: 'Transit', icon: 's-transit' },
  { id: 'park', label: 'Parks', icon: 's-park' },
  { id: 'flood', label: 'Flood risk', icon: 's-flood' },
];

interface PointerState {
  mode: 'none' | 'pan' | 'tool' | 'pinch';
  pts: Map<number, { x: number; y: number }>;
  start: number;
  last: number;
  down: { x: number; y: number };
  prev: { x: number; y: number };
  moved: boolean;
  touch: boolean;
  pinch: { d: number; mx: number; my: number } | null;
}

export class App implements Host {
  root: HTMLElement;
  city!: City;
  renderer!: Renderer;
  speed = 1;
  tool: Tool = TOOL.inspect;
  plan: Plan | null = null;
  /** A touch plan waiting for the Build button. */
  pending = false;
  private group: string | null = null;
  private panel: { id: PanelId; arg: number } | null = null;
  private els!: Record<string, HTMLElement>;
  private canvas!: HTMLCanvasElement;
  private mini!: HTMLCanvasElement;
  private acc = 0;
  private lastFrame = 0;
  private phases: Generator<void, void, void> | null = null;
  private raf = 0;
  private dirty = true;
  private paused = false;
  private zoomTimer = 0;
  private unsub: (() => void) | null = null;
  private ro: ResizeObserver | null = null;
  private p: PointerState = { mode: 'none', pts: new Map(), start: -1, last: -1, down: { x: 0, y: 0 }, prev: { x: 0, y: 0 }, moved: false, touch: false, pinch: null };
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private hideHandler = () => this.saveSync();
  overlay: Overlay | null = null;
  autoplay = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('pagehide', this.hideHandler);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveSync();
    });
    showTitle(this);
  }

  // --- Lifecycle --------------------------------------------------------------------

  start(city: City): void {
    this.stop();
    this.city = city;
    this.root.textContent = '';
    this.tool = TOOL.inspect;
    this.plan = null;
    this.pending = false;
    this.group = null;
    this.panel = null;
    this.overlay = null;
    this.speed = 1;
    this.buildDom();
    this.renderer = new Renderer(this.canvas, city);
    this.renderer.resize();
    const hall = Object.values(city.s.buildings).find((b) => b.type === 'cityhall');
    this.renderer.centerOn(hall ? city.idx(hall.x + 1, hall.y + 1) : city.idx(city.w >> 1, city.h >> 1), 0.9);
    this.unsub = city.on((e) => this.onCity(e));
    this.ro = new ResizeObserver(() => {
      this.renderer.resize();
      this.renderer.clamp();
      this.dirty = true;
    });
    this.ro.observe(this.canvas);
    this.refreshHud();
    this.renderTray();
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(loop);
    if (!city.s.tick && !store.list().length) this.help();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.unsub?.();
    this.unsub = null;
    this.ro?.disconnect();
    this.ro = null;
    this.phases = null;
  }

  quitToTitle(): void {
    this.saveSync();
    this.stop();
    showTitle(this);
  }

  // --- DOM ----------------------------------------------------------------------------

  private buildDom(): void {
    const c = this.city;
    this.canvas = h('canvas', { class: 'mc-canvas', 'aria-label': 'City map' });
    this.mini = h('canvas', { class: 'mc-mini', width: 320, height: 170, 'aria-label': 'Minimap' });
    const stat = (key: string, icon: IconKey, panel: PanelId, title: string) =>
      h('button', { class: 'mc-stat', title, onclick: () => this.openPanel(panel) }, gi(icon), h('b', { 'data-k': key }), h('small', { 'data-k': `${key}2` }));
    const speedBtn = (s: number, icon: IconKey, label: string) =>
      h('button', { class: 'mc-speedbtn', 'data-speed': String(s), title: label, 'aria-label': label, onclick: () => this.setSpeed(s) }, gi(icon), s > 1 ? h('i', null, `${s}×`) : null);
    const panelBtn = (id: PanelId) => h('button', { class: 'mc-iconbtn', title: PANELS[id].title, 'aria-label': PANELS[id].title, 'data-panelbtn': id, onclick: () => this.togglePanel(id) }, gi(PANELS[id].icon));
    const demand = h('div', { class: 'mc-demand', title: 'Demand: residential, commercial, industrial, office', onclick: () => this.openPanel('report') },
      ...['R', 'C', 'I', 'O'].map((k, z) => h('span', { class: 'mc-dbar' }, h('i', { 'data-d': String(z), style: { background: ZONE_COLOR[z + 1] } }), h('em', null, k))));
    const top = h('header', { class: 'mc-top' },
      h('div', { class: 'mc-brand' }, h('b', { 'data-k': 'name' }, c.s.settings.name), h('span', { 'data-k': 'date' })),
      h('div', { class: 'mc-stats' },
        stat('pop', 's-pop', 'stats', 'Population'),
        stat('money', 's-money', 'budget', 'Treasury'),
        stat('happy', 's-happy', 'report', 'Happiness'),
        demand,
      ),
      h('div', { class: 'mc-speed' }, speedBtn(0, 'u-pause', 'Pause'), speedBtn(1, 'u-play', 'Normal speed'), speedBtn(2, 'u-fast', 'Fast'), speedBtn(3, 'u-fast', 'Fastest')),
      h('nav', { class: 'mc-panelnav' },
        panelBtn('report'), panelBtn('budget'), panelBtn('stats'),
        h('span', { class: 'mc-more' }, panelBtn('districts'), panelBtn('history'), panelBtn('news'), c.s.settings.challenge ? panelBtn('challenge') : null),
        h('button', { class: 'mc-iconbtn', title: 'Menu', 'aria-label': 'Menu', onclick: () => showMenu(this) }, gi('u-menu')),
      ),
    );
    const tools = h('nav', { class: 'mc-tools', 'aria-label': 'Build tools' },
      ...GROUPS.map((g) => h('button', { class: 'mc-toolbtn', 'data-group': g.id, title: g.label, 'aria-label': g.label, onclick: () => this.openGroup(g.id) }, gi(g.icon), h('small', null, g.label.split(' ')[0]))),
      h('button', { class: 'mc-toolbtn', 'data-group': 'overlay', title: 'Overlays', 'aria-label': 'Overlays', onclick: () => this.openGroup('overlay') }, gi('u-overlay'), h('small', null, 'Overlays')),
    );
    const side = h('aside', { class: 'mc-side', 'aria-live': 'polite' },
      h('div', { class: 'mc-sidehead' }, h('span', { 'data-k': 'ptitle' }), h('button', { class: 'mc-iconbtn', 'aria-label': 'Close panel', onclick: () => this.closePanel() }, gi('u-close'))),
      h('div', { class: 'mc-sidebody' }),
    );
    const ticker = h('button', { class: 'mc-ticker', onclick: () => this.openPanel('news') }, gi('p-news'), h('span', { 'data-k': 'ticker' }, `Welcome to ${c.s.settings.name}.`));
    const chip = h('div', { class: 'mc-toolchip' },
      h('span', { 'data-k': 'tooltitle' }), h('small', { 'data-k': 'toolnote' }),
      h('button', { class: 'mc-iconbtn', 'aria-label': 'Stop building', onclick: () => this.setTool(TOOL.inspect) }, gi('u-close')),
    );
    // Build/Cancel act on pointerup: a tap right after a quick drag can lose its click
    // (the browser treats it as stopping a fling).
    const tapBtn = (cls: string, label: string, fn: () => void) => {
      const b = h('button', { class: cls }, label);
      b.addEventListener('pointerup', (e) => e.button === 0 && fn());
      b.addEventListener('click', (e) => e.detail === 0 && fn());
      return b;
    };
    const confirm = h('div', { class: 'mc-confirm' },
      h('span', { 'data-k': 'confirmtext' }),
      tapBtn('mc-btn primary', 'Build', () => this.confirm()),
      tapBtn('mc-btn', 'Cancel', () => this.cancelPlan()),
    );
    const game = h('div', { class: 'mc-game' }, this.canvas, top, tools, h('div', { class: 'mc-tray' }), side, ticker, this.mini, chip, confirm, h('div', { class: 'mc-toasts' }));
    this.root.append(game);
    this.els = { game, top, tools, side, ticker, chip, confirm, tray: game.querySelector('.mc-tray')! as HTMLElement, body: side.querySelector('.mc-sidebody')! as HTMLElement };
    for (const el of game.querySelectorAll<HTMLElement>('[data-k]')) this.els[`k:${el.dataset.k}`] = el;
    this.bindInput();
    this.mini.addEventListener('pointerdown', (e) => this.miniJump(e));
    this.mini.addEventListener('pointermove', (e) => {
      if (e.buttons) this.miniJump(e);
    });
  }

  private k(key: string): HTMLElement {
    return this.els[`k:${key}`];
  }

  refreshHud(): void {
    const c = this.city;
    const L = c.s.last;
    const ms = MILESTONES[c.s.milestone];
    this.k('date').textContent = `${c.dateLabel()} · ${ms.name}`;
    this.k('pop').textContent = compact(L.pop);
    const S = c.s.samples;
    const prev = S.length > 12 ? S[S.length - 13].pop : 0;
    this.k('pop2').textContent = prev ? `${L.pop >= prev ? '▲' : '▼'} ${Math.abs(Math.round(((L.pop - prev) / prev) * 100))}%` : 'people';
    this.k('money').textContent = c.currency(c.s.money);
    const net = L.income - L.expense;
    const m2 = this.k('money2');
    m2.textContent = `${net >= 0 ? '+' : '−'}${c.currency(Math.abs(net))}/mo`;
    m2.className = net >= 0 ? 'up' : 'down';
    this.k('money').classList.toggle('debt', c.s.money < 0);
    this.k('happy').textContent = L.pop ? `${Math.round(L.happy)}%` : '—';
    this.k('happy2').textContent = 'happy';
    for (const bar of this.els.top.querySelectorAll<HTMLElement>('[data-d]')) {
      const d = L.demand[+bar.dataset.d!];
      bar.style.height = `${Math.abs(d) * 50}%`;
      bar.style.bottom = d >= 0 ? '50%' : `${50 - Math.abs(d) * 50}%`;
      bar.style.opacity = d >= 0 ? '1' : '0.35';
    }
    for (const b of this.els.top.querySelectorAll<HTMLElement>('[data-speed]')) b.classList.toggle('on', +b.dataset.speed! === this.speed);
  }

  // --- Tools ----------------------------------------------------------------------------

  openGroup(id: string): void {
    const g = GROUPS.find((x) => x.id === id);
    if (g && g.tools.length === 1) {
      this.group = null;
      this.setTool(g.tools[0]);
      return;
    }
    this.group = this.group === id ? null : id;
    this.renderTray();
  }

  private renderTray(): void {
    const tray = this.els.tray;
    tray.textContent = '';
    for (const b of this.els.tools.querySelectorAll<HTMLElement>('[data-group]')) {
      const g = b.dataset.group!;
      b.classList.toggle('open', g === this.group);
      b.classList.toggle('on', g === 'overlay' ? !!this.overlay : GROUPS.find((x) => x.id === g)?.tools.some((t) => t.id === this.tool.id) ?? false);
    }
    this.els.game.classList.toggle('tray-open', !!this.group);
    if (!this.group) return;
    const c = this.city;
    if (this.group === 'overlay') {
      tray.append(h('h4', null, 'Overlays'), ...OVERLAYS.map((o) => h('button', {
        class: `mc-trayitem ${this.overlay === o.id ? 'on' : ''}`,
        onclick: () => this.setOverlay(o.id),
      }, gi(o.icon), h('span', null, h('b', null, o.label)))));
      return;
    }
    const g = GROUPS.find((x) => x.id === this.group)!;
    tray.append(h('h4', null, g.label), ...g.tools.map((t) => {
      const ok = toolUnlocked(c, t);
      const swatch = t.zone ? h('i', { class: 'mc-swatch', style: { background: ZONE_COLOR[t.zone], opacity: t.dense ? '1' : '0.6' } }) : null;
      return h('button', {
        class: `mc-trayitem ${this.tool.id === t.id ? 'on' : ''} ${ok ? '' : 'locked'}`,
        title: t.building ? BUILDING[t.building].desc : t.label,
        onclick: () => (ok ? this.setTool(t) : toast(this, 'info', t.label, toolLockNote(t))),
      }, swatch ?? gi(t.icon), h('span', null, h('b', null, t.label), h('small', null, ok ? t.note : toolLockNote(t))));
    }));
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.cancelPlan();
    if (t.kind !== 'inspect') this.renderer.selected = [];
    if (matchMedia('(max-width: 820px), (max-height: 520px)').matches) this.group = null;
    this.renderTray();
    this.els.game.classList.toggle('building', t.kind !== 'inspect');
    this.k('tooltitle').textContent = t.label;
    this.k('toolnote').textContent = t.kind === 'building' ? 'Tap to place' : t.kind === 'inspect' ? '' : 'Drag to build';
    this.dirty = true;
  }

  setOverlay(o: Overlay | null): void {
    this.overlay = o;
    this.renderer.setOverlay(o);
    this.renderTray();
    this.dirty = true;
  }

  private updatePlan(a: number, b: number): void {
    const plan = planTool(this.city, this.tool, a, b);
    this.plan = plan;
    const r = this.renderer;
    if (!plan) {
      r.preview = null;
      r.radius = null;
      return;
    }
    r.preview = { tiles: plan.tiles, ok: plan.result.ok, kind: this.tool.kind as 'road', zone: this.tool.zone, building: plan.building };
    const def = plan.building ? BUILDING[plan.building.type] : null;
    r.radius = def?.coverage ? { x: plan.building!.x + def.w / 2, y: plan.building!.y + def.h / 2, r: def.coverage[0].radius } : null;
    const res = plan.result;
    const cost = res.cost ? ` · ${this.city.currency(res.cost)}` : '';
    const what = this.tool.kind === 'road' || this.tool.kind === 'zone' || this.tool.kind === 'bulldoze' ? `${res.tiles.length} tiles` : this.tool.label;
    const note = res.ok ? `${what}${cost}` : res.reason ?? '';
    this.k('toolnote').textContent = note;
    this.k('toolnote').classList.toggle('bad', !res.ok);
    this.k('confirmtext').textContent = res.ok ? `${this.tool.label}: ${what}${cost}` : note;
    this.dirty = true;
  }

  private applyPlan(): void {
    const plan = this.plan;
    if (!plan) return;
    const r = plan.apply();
    if (!r.ok) {
      if (r.reason && r.reason !== 'Already built.') toast(this, 'info', 'Cannot build', r.reason);
    } else {
      refreshQuick(this.city);
      this.renderer.invalidate();
      this.refreshHud();
      if (this.panel && this.panel.id !== 'inspect') this.refreshPanel();
    }
    this.cancelPlan();
  }

  confirm(): void {
    if (this.pending) this.applyPlan();
  }

  cancelPlan(): void {
    this.plan = null;
    this.pending = false;
    if (this.renderer) {
      this.renderer.preview = null;
      this.renderer.radius = null;
    }
    this.els?.game.classList.remove('confirming');
    this.dirty = true;
  }

  bulldozeBuilding(id: number): void {
    const b = this.city.s.buildings[id];
    if (!b) return;
    const tiles = footprint(this.city, BUILDING[b.type], b.x, b.y);
    const plan = planTool(this.city, TOOL.bulldoze, tiles[0], tiles[tiles.length - 1]);
    if (!plan) return;
    this.plan = plan;
    this.applyPlan();
    this.closePanel();
  }

  // --- Panels ---------------------------------------------------------------------------

  openPanel(id: PanelId, arg = -1): void {
    this.panel = { id, arg };
    this.els.game.classList.add('side-open');
    this.k('ptitle').replaceChildren(gi(PANELS[id].icon), PANELS[id].title);
    this.refreshPanel(true);
    for (const b of this.els.top.querySelectorAll<HTMLElement>('[data-panelbtn]')) b.classList.toggle('on', b.dataset.panelbtn === id);
  }

  togglePanel(id: PanelId): void {
    if (this.panel?.id === id) this.closePanel();
    else this.openPanel(id);
  }

  closePanel(): void {
    this.panel = null;
    this.els.game.classList.remove('side-open');
    this.renderer.selected = [];
    for (const b of this.els.top.querySelectorAll<HTMLElement>('[data-panelbtn]')) b.classList.remove('on');
    this.dirty = true;
  }

  refreshPanel(reset = false): void {
    if (!this.panel) return;
    const body = this.els.body;
    const scroll = reset ? 0 : body.scrollTop;
    // Don't yank inputs out from under the player.
    if (!reset && body.contains(document.activeElement) && document.activeElement !== body && this.panel.id === 'budget') return;
    body.replaceChildren(renderPanel(this, this.panel.id, this.panel.arg));
    body.scrollTop = scroll;
  }

  select(i: number): void {
    const c = this.city;
    const t = c.s.tiles;
    if (i < 0) return;
    if (t.bld[i] >= 0) {
      const b = c.s.buildings[t.bld[i]];
      this.renderer.selected = b ? footprint(c, BUILDING[b.type], b.x, b.y) : [i];
    } else this.renderer.selected = [i];
    this.openPanel('inspect', i);
    this.dirty = true;
  }

  jump(i: number): void {
    this.renderer.centerOn(i, Math.max(this.renderer.z, 0.7));
    this.select(i);
    if (matchMedia('(max-width: 820px)').matches) this.closePanel();
    this.renderer.selected = [i];
  }

  changed(): void {
    this.refreshHud();
    this.dirty = true;
  }

  // --- Simulation loop -----------------------------------------------------------------

  setSpeed(s: number): void {
    this.speed = s;
    this.acc = 0;
    this.refreshHud();
  }

  pause(on: boolean): void {
    this.paused = on;
  }

  private tick(now: number): void {
    const dt = Math.min(250, now - this.lastFrame);
    this.lastFrame = now;
    const c = this.city;
    const running = this.speed > 0 && !this.paused;
    if (running || this.phases) {
      if (this.phases) {
        if (this.phases.next().done) {
          this.phases = null;
          this.onMonth();
        }
      } else {
        this.acc += dt;
        if (this.acc >= SPEED_MS[this.speed]) {
          this.acc = 0;
          if (this.autoplay > 0) {
            botTurn(c);
            this.autoplay--;
          }
          this.phases = stepPhases(c);
          this.phases.next();
        }
      }
    }
    this.renderer.running = running;
    if (running || this.dirty || this.renderer.zooming || this.hasFires()) {
      this.renderer.frame(now);
      this.drawMini();
      this.dirty = false;
    }
  }

  private fireCheck = 0;
  private fires = false;
  private hasFires(): boolean {
    if (++this.fireCheck % 30 === 0) this.fires = this.city.s.tiles.flags.some((f) => (f & FLAG_FIRE) !== 0);
    return this.fires;
  }

  private onMonth(): void {
    const c = this.city;
    this.renderer.invalidate();
    this.refreshHud();
    if (this.panel) this.refreshPanel();
    if (this.tool.kind !== 'inspect' && this.plan && !this.pending && this.p.mode === 'none' && this.renderer.hover >= 0 && this.tool.kind === 'building') {
      this.updatePlan(this.renderer.hover, this.renderer.hover);
    }
    if (c.s.tick % 12 === 0 && c.s.tick > 0) void this.save('auto');
    if (c.s.tick % 3 === 0) this.renderTray();
  }

  private onCity(e: CityEvent): void {
    if (e.type === 'changed') {
      this.renderer.invalidate();
      this.dirty = true;
    } else if (e.type === 'news') {
      const it = e.item;
      this.k('ticker').textContent = it.text;
      this.els.ticker.className = `mc-ticker ${it.kind}`;
      if (it.kind === 'disaster') toast(this, 'disaster', 'Disaster', it.text, it.tile);
      else if (it.kind === 'milestone') toast(this, 'milestone', 'Milestone', it.text, it.tile);
    } else if (e.type === 'milestone') {
      this.renderTray();
    }
  }

  // --- Input ---------------------------------------------------------------------------

  private bindInput(): void {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => this.onDown(e));
    cv.addEventListener('pointermove', (e) => this.onMove(e));
    cv.addEventListener('pointerup', (e) => this.onUp(e));
    cv.addEventListener('pointercancel', (e) => {
      this.p.pts.delete(e.pointerId);
      if (!this.p.pts.size) this.p.mode = 'none';
    });
    cv.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && this.p.mode === 'none') {
        this.renderer.hover = -1;
        if (this.tool.kind === 'building') this.cancelPlan();
        this.dirty = true;
      }
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.zoom(e.clientX - r.left, e.clientY - r.top, Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.004));
    }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pos(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  zoom(x: number, y: number, f: number): void {
    this.renderer.zoomAt(x, y, f);
    this.renderer.zooming = true;
    clearTimeout(this.zoomTimer);
    this.zoomTimer = window.setTimeout(() => {
      this.renderer.zooming = false;
      this.dirty = true;
    }, 160);
    this.dirty = true;
  }

  private onDown(e: PointerEvent): void {
    const p = this.p;
    const pt = this.pos(e);
    this.canvas.setPointerCapture(e.pointerId);
    p.pts.set(e.pointerId, pt);
    p.touch = e.pointerType !== 'mouse';
    if (p.pts.size === 2) {
      // Second finger: pinch and pan; abandon any tool drag in progress.
      if (p.mode === 'tool' && !this.pending) this.cancelPlan();
      p.mode = 'pinch';
      const [a, b] = [...p.pts.values()];
      p.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (p.pts.size > 2) return;
    p.down = pt;
    p.prev = pt;
    p.moved = false;
    const i = this.renderer.pick(pt.x, pt.y);
    if (e.button === 1 || e.button === 2 || this.tool.kind === 'inspect') {
      p.mode = 'pan';
      return;
    }
    p.mode = 'tool';
    p.start = i;
    p.last = i;
    this.pending = false;
    this.els.game.classList.remove('confirming');
    this.updatePlan(i, i);
  }

  private onMove(e: PointerEvent): void {
    const p = this.p;
    const pt = this.pos(e);
    if (p.pts.has(e.pointerId)) p.pts.set(e.pointerId, pt);
    if (p.mode === 'pinch' && p.pts.size >= 2 && p.pinch) {
      const [a, b] = [...p.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      this.renderer.pan(mx - p.pinch.mx, my - p.pinch.my);
      if (p.pinch.d > 10) this.zoom(mx, my, d / p.pinch.d);
      p.pinch = { d, mx, my };
      this.dirty = true;
      return;
    }
    if (p.mode === 'pan') {
      if (Math.hypot(pt.x - p.down.x, pt.y - p.down.y) > 5) p.moved = true;
      if (p.moved) {
        this.renderer.pan(pt.x - p.prev.x, pt.y - p.prev.y);
        this.dirty = true;
      }
      p.prev = pt;
      return;
    }
    const i = this.renderer.pick(pt.x, pt.y);
    if (p.mode === 'tool') {
      if (Math.hypot(pt.x - p.down.x, pt.y - p.down.y) > 5) p.moved = true;
      if (i !== p.last && i >= 0) {
        p.last = i;
        this.updatePlan(this.tool.kind === 'building' ? i : p.start, i);
      }
      return;
    }
    // Hovering with a mouse.
    if (e.pointerType === 'mouse' && i !== this.renderer.hover) {
      this.renderer.hover = i;
      if (this.tool.kind === 'building' && i >= 0) this.updatePlan(i, i);
      this.dirty = true;
    }
  }

  private onUp(e: PointerEvent): void {
    const p = this.p;
    p.pts.delete(e.pointerId);
    if (p.mode === 'pinch') {
      if (!p.pts.size) {
        p.mode = 'none';
        p.pinch = null;
      }
      return;
    }
    if (p.mode === 'pan') {
      p.mode = 'none';
      if (!p.moved && e.button === 0) {
        const i = this.renderer.pick(p.down.x, p.down.y);
        if (i >= 0) this.select(i);
      }
      return;
    }
    if (p.mode === 'tool') {
      p.mode = 'none';
      if (!this.plan) return;
      if (p.touch) {
        // On touch screens a drag only previews; the Build button commits.
        this.pending = true;
        this.els.game.classList.add('confirming');
        this.dirty = true;
      } else {
        this.applyPlan();
        if (this.tool.kind === 'building' && this.renderer.hover >= 0) this.updatePlan(this.renderer.hover, this.renderer.hover);
      }
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.renderer || !this.els?.game.isConnected) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.querySelector('.mc-modal')) return;
    const step = 60;
    switch (e.key) {
      case 'Escape':
        if (this.plan) this.cancelPlan();
        else if (this.tool.kind !== 'inspect') this.setTool(TOOL.inspect);
        else if (this.group) this.openGroup(this.group);
        else this.closePanel();
        break;
      case ' ':
        e.preventDefault();
        this.setSpeed(this.speed ? 0 : 1);
        break;
      case '1': case '2': case '3':
        this.setSpeed(+e.key);
        break;
      case '0':
        this.setSpeed(0);
        break;
      case 'ArrowLeft': case 'a': this.renderer.pan(step, 0); break;
      case 'ArrowRight': case 'd': this.renderer.pan(-step, 0); break;
      case 'ArrowUp': case 'w': this.renderer.pan(0, step); break;
      case 'ArrowDown': case 's': this.renderer.pan(0, -step); break;
      case '+': case '=': this.zoom(this.renderer.W / 2, this.renderer.H / 2, 1.25); break;
      case '-': case '_': this.zoom(this.renderer.W / 2, this.renderer.H / 2, 0.8); break;
      case 'b': this.setTool(TOOL.bulldoze); break;
      case 'r': this.setTool(TOOL['road-1']); break;
      case 'q': this.setTool(TOOL.inspect); break;
      default: return;
    }
    this.dirty = true;
  }

  // --- Minimap ----------------------------------------------------------------------------

  private drawMini(): void {
    const cv = this.mini;
    if (!cv.offsetParent) return;
    const ctx = cv.getContext('2d')!;
    const c = this.city;
    const W = cv.width;
    const H = cv.height;
    const s = Math.min(W / (2 * c.w), H / c.h);
    const ox = W / 2;
    const oy = (H - c.h * s) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(s, s / 2, -s, s / 2, ox, oy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.renderer.map, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const r = this.renderer;
    const [wx0, wy0] = r.toWorld(0, 0);
    const [wx1, wy1] = r.toWorld(r.W, r.H);
    const mx = (wx: number) => ox + (wx / HW) * s;
    const my = (wy: number) => oy + (wy / HH) * (s / 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx(wx0), my(wy0), mx(wx1) - mx(wx0), my(wy1) - my(wy0));
  }

  private miniJump(e: PointerEvent): void {
    const cv = this.mini;
    const rect = cv.getBoundingClientRect();
    const c = this.city;
    const W = cv.width;
    const H = cv.height;
    const s = Math.min(W / (2 * c.w), H / c.h);
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    this.renderer.cx = ((px - W / 2) / s) * HW;
    this.renderer.cy = ((py - (H - c.h * s) / 2) / (s / 2)) * HH;
    this.renderer.clamp();
    this.dirty = true;
  }

  // --- Saving ------------------------------------------------------------------------------

  private meta(key: string) {
    const c = this.city;
    return { key, label: key === 'auto' ? 'Autosave' : c.s.settings.name, title: c.s.settings.name, subtitle: `${compact(c.s.last.pop)} people · ${c.dateLabel()}` };
  }

  async save(key: string): Promise<void> {
    try {
      await store.save(this.meta(key), saveCity(this.city));
    } catch {
      toast(this, 'info', 'Could not save', 'Browser storage is full or unavailable. Try exporting the city to a file.');
    }
  }

  saveSync(): void {
    if (!this.city || !this.els?.game.isConnected) return;
    try {
      store.saveSync(this.meta('auto'), saveCity(this.city));
    } catch {
      /* storage unavailable */
    }
  }

  exportCity(): void {
    const c = this.city;
    const name = c.s.settings.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'city';
    download(`${name}-year-${c.year}.mcity.json`, saveCity(c));
  }

  async importCity(): Promise<void> {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const city = loadCity(await f.text());
      this.start(city);
      toast(this, 'info', 'City imported', `${city.s.settings.name} · ${city.dateLabel()}`);
    } catch (err) {
      toast(this, 'info', 'Import failed', err instanceof Error ? err.message : 'That file could not be read.');
    }
  }

  help(): void {
    showMenu(this, 'help');
  }

  /** Testing aid: let the bot mayor run the city for some months, quickly. */
  debugAutoplay(months: number, fast = true): void {
    if (fast) {
      for (let k = 0; k < months; k++) {
        botTurn(this.city);
        stepMonth(this.city);
      }
      this.onMonth();
    } else {
      this.autoplay = months;
      this.setSpeed(3);
    }
  }
}
