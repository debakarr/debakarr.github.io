import { download, h, persist, pickFile, store as stored } from '../../shared/dom';
import { fromJson, SaveStore, toJson } from '../../shared/savefile';
import { icons, type IconKey } from '../art';
import { Renderer } from '../render/renderer';
import { alive } from '../sim/civ';
import { COSMIC_ERAS, DISCOVERY } from '../sim/discoveries';
import { Director, SPEEDS } from '../sim/director';
import { dailyUniverse, DEFAULT_PARAMS, DIALS, GOALS, PRESETS, randomUniverseSeed, type Dial, type Params } from '../sim/params';
import { PLANET_STRIDE } from '../sim/planets';
import { Phase } from '../sim/stars';
import { SAVE_VERSION, Universe, type Intervention, type Target, type UEvent, type UState } from '../sim/universe';
import { AudioEngine } from './audio';
import { fmtAge, SPEED_LABEL } from './format';
import { gi, PANEL_TITLE, profileTitle, renderPanel, type PanelId } from './panels';

// Tiny Universe: the app shell. The universe advances by real time × the
// chosen speed (years per second); first-time discoveries and new
// civilizations can interrupt it so the player gets to look.

type Tool = 'select' | 'matter' | 'seed' | 'asteroid' | 'nova' | 'erase';

const TOOLS: { id: Tool; label: string; icon: IconKey; note: string; hidden?: boolean }[] = [
  { id: 'select', label: 'Look', icon: 't-select', note: 'Tap a star to inspect it, tap again to see its planets. Drag to pan, pinch or scroll to zoom.' },
  { id: 'matter', label: 'Matter', icon: 't-matter', note: 'Tap space to pour in fresh gas. New stars will form there.' },
  { id: 'seed', label: 'Life', icon: 't-seed', note: 'Tap a star (or a planet) to seed its most promising world with microbes.' },
  { id: 'asteroid', label: 'Asteroid', icon: 't-asteroid', note: 'Tap a star with life (or a planet) to strike it with an asteroid.' },
  { id: 'nova', label: 'Nova', icon: 't-nova', note: 'Tap a star to make it explode.' },
  { id: 'erase', label: 'Erase', icon: 't-erase', note: 'Tap a star (or a planet) to erase the advanced civilization there. You have become the threat.', hidden: true },
];

const PANELS: { id: PanelId; icon: IconKey }[] = [
  { id: 'observatory', icon: 'p-observatory' },
  { id: 'life', icon: 'p-life' },
  { id: 'history', icon: 'p-history' },
  { id: 'profile', icon: 'p-profile' },
];

/** Discoveries big enough for a card; the rest are toasts. */
function isCard(id: string): boolean {
  const d = DISCOVERY[id];
  return !!d && ((d.rarity >= 3 && d.cat !== 'Stars') || ['first-star', 'supernova', 'grb', 'rocky-world', 'first-life'].includes(id));
}

const store = new SaveStore('tu');

export class App {
  root: HTMLElement;
  u!: Universe;
  renderer!: Renderer;
  director = new Director();
  speed = 4;
  auto = false;
  tool: Tool = 'select';
  panel: PanelId | null = null;
  sel = { star: -1, planet: -1, civ: -1 };
  treeOpen = new Set<number>();
  historyAll = false;
  settings = (() => {
    const s = stored('tu:settings', { pauseOnDiscovery: true, slowForCivs: true, sound: true });
    if (s.sound === undefined) s.sound = true;
    return s;
  })();
  audio = new AudioEngine();
  private canvas!: HTMLCanvasElement;
  private els: Record<string, HTMLElement> = {};
  private last = 0;
  private acc = 0;
  private hudAt = 0;
  private panelAt = 0;
  private saveAt = 0;
  private pendingChoice = false;
  private thinkAt = 0;
  private titleMode = true;
  private quiet = false;
  private busy = false;
  private cards: { id: string; ref: Target }[] = [];
  private cardOpen = false;
  private cardTimer = 0;
  private speedBeforeCiv = -1;
  private confirmKey = '';
  private confirmAt = 0;
  private unsub: (() => void) | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private pinch: { d: number; mx: number; my: number; f: number } | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('tu');
    window.addEventListener('pagehide', () => this.saveNow());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this.saveNow());
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.buildDom();
    this.title();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      this.tick(now);
    };
    requestAnimationFrame(loop);
  }

  // --- DOM -----------------------------------------------------------------------------------

  private buildDom(): void {
    this.canvas = h('canvas', { class: 'tu-canvas', 'aria-label': 'The universe' });
    const top = h('header', { class: 'tu-top' },
      h('div', { class: 'tu-brand' }, h('b', null, 'TINY UNIVERSE'), h('span', { 'data-k': 'age' })),
      h('span', { class: 'tu-era', 'data-k': 'era' }),
      h('div', { class: 'tu-hstats' },
        h('span', { title: 'Stars shining' }, gi('u-star'), h('b', { 'data-k': 'stars' })),
        h('span', { title: 'Worlds with life' }, gi('u-life'), h('b', { 'data-k': 'life' })),
        h('span', { title: 'Civilizations alive' }, gi('u-civ'), h('b', { 'data-k': 'civs' })),
      ),
      h('i', { class: 'tu-break', 'aria-hidden': 'true' }),
      h('div', { class: 'tu-time' },
        h('button', { class: 'tu-tbtn', 'data-k': 'play', 'aria-label': 'Pause', onclick: () => this.togglePause() }, gi('u-pause')),
        h('button', { class: 'tu-tbtn', 'aria-label': 'Slower', title: 'Slower (−)', onclick: () => this.nudgeSpeed(-1) }, '−'),
        h('span', { class: 'tu-speed', 'data-k': 'speed' }),
        h('button', { class: 'tu-tbtn', 'aria-label': 'Faster', title: 'Faster (+)', onclick: () => this.nudgeSpeed(1) }, '+'),
      ),
      h('button', { class: 'tu-autobtn', 'data-k': 'auto', 'aria-pressed': 'false', title: 'Automatic mode: a director runs the universe', onclick: () => this.setAuto(!this.auto) }, 'AUTO'),
      h('nav', { class: 'tu-panelnav' }, ...PANELS.map((p) => h('button', { class: 'tu-iconbtn', 'data-panel': p.id, title: PANEL_TITLE[p.id], 'aria-label': PANEL_TITLE[p.id], onclick: () => this.togglePanel(p.id) }, gi(p.icon)))),
      h('button', { class: 'tu-iconbtn tu-menubtn', title: 'Menu', 'aria-label': 'Menu', onclick: () => this.menu() }, gi('u-menu')),
    );
    const tools = h('nav', { class: 'tu-tools', 'aria-label': 'Powers' }, ...TOOLS.map((t) => h('button', { class: 'tu-tool', 'data-tool': t.id, hidden: t.hidden ?? false, title: `${t.label}: ${t.note}`, 'aria-label': t.label, onclick: () => this.pickTool(t.id) }, gi(t.icon), h('small', null, t.label))));
    const chip = h('div', { class: 'tu-viewchip', 'data-k': 'chip', hidden: true },
      h('button', { class: 'tu-btn', onclick: () => this.exitSystem() }, gi('u-galaxy'), 'Galaxy'),
      h('span', { 'data-k': 'chiptext' }));
    const side = h('aside', { class: 'tu-side' },
      h('div', { class: 'tu-sidehead' }, h('span', { 'data-k': 'ptitle' }), h('button', { class: 'tu-iconbtn', 'aria-label': 'Close', onclick: () => this.closePanel() }, gi('u-close'))),
      h('div', { class: 'tu-sidebody', 'data-k': 'pbody' }));
    const game = h('div', { class: 'tu-game' }, this.canvas, top, tools, chip, side,
      h('div', { class: 'tu-hint-bar', 'data-k': 'hint' }),
      h('div', { class: 'tu-toasts', 'data-k': 'toasts' }),
      h('div', { class: 'tu-cardwrap', 'data-k': 'card' }),
      h('div', { class: 'tu-titlewrap', 'data-k': 'title' }));
    this.root.append(game);
    this.els.game = game;
    for (const el of game.querySelectorAll<HTMLElement>('[data-k]')) this.els[el.dataset.k!] = el;
    this.bindInput();
    new ResizeObserver(() => {
      this.renderer?.resize();
      this.layout();
    }).observe(this.canvas);
  }

  /** Tell the renderer where UI covers the canvas, so system views centre in what is left. */
  private layout(): void {
    if (!this.renderer) return;
    const r = this.canvas.getBoundingClientRect();
    const side = this.els.game.querySelector<HTMLElement>('.tu-side')!;
    const top = this.els.game.querySelector<HTMLElement>('.tu-top')!.getBoundingClientRect();
    const tools = this.els.game.querySelector<HTMLElement>('.tu-tools')!.getBoundingClientRect();
    const inset = { right: 0, bottom: 0, top: Math.max(0, top.bottom - r.top), left: 0 };
    const portrait = r.width <= 820;
    if (portrait) inset.bottom = Math.max(0, r.bottom - tools.top);
    else if (tools.width < 120) inset.left = Math.max(0, tools.right - r.left);
    if (this.panel && !this.titleMode) {
      const sr = side.getBoundingClientRect();
      if (sr.width && sr.width < r.width * 0.7) inset.right = Math.max(0, r.right - sr.left);
      else if (sr.height) inset.bottom = Math.max(inset.bottom, r.bottom - sr.top);
    }
    this.renderer.inset = inset;
  }

  // --- Title and creation ---------------------------------------------------------------------------

  title(): void {
    this.titleMode = true;
    this.setAuto(false, true);
    this.cards = [];
    this.closeCard();
    this.attach(Universe.create(randomUniverseSeed(), DEFAULT_PARAMS), true);
    this.speed = 5;
    this.auto = true;
    this.els.game.classList.add('titling');
    this.closePanel();
    const save = store.list().find((m) => m.key === 'auto');
    const daily = dailyUniverse();
    this.els.title.replaceChildren(h('div', { class: 'tu-titlecard' },
      h('h1', null, 'TINY UNIVERSE'),
      h('p', { class: 'tu-tag' }, 'Start with nothing. Create a universe, and decide what it becomes: stars, worlds, life, minds, and whatever waits for them.'),
      h('div', { class: 'tu-titlebtns' },
        save ? h('button', { class: 'tu-btn primary', onclick: () => void this.continue() }, `Continue: ${save.subtitle}`) : null,
        h('button', { class: `tu-btn ${save ? '' : 'primary'}`, onclick: () => this.creation() }, gi('u-egg'), 'Create a universe'),
        h('button', { class: 'tu-btn', onclick: () => this.begin(daily.seed, daily.preset.params, daily.preset.id, daily.goal.id) }, gi('u-trophy'), `Daily universe: ${daily.goal.text.toLowerCase()}`),
        h('button', { class: 'tu-btn', onclick: () => this.begin(randomUniverseSeed(), DEFAULT_PARAMS, 'standard', null, true) }, gi('u-follow'), 'Watch a universe (auto)'),
        h('button', { class: 'tu-btn', onclick: () => this.help() }, 'How to play'),
      ),
      h('footer', null,
        h('a', { href: '/games', 'data-astro-reload': true }, '← All games'),
        h('span', null, 'Icons: ', h('a', { href: 'https://game-icons.net', target: '_blank', rel: 'noopener' }, 'game-icons.net'), ' (CC BY 3.0)'),
        h('button', { class: 'tu-linkbtn', onclick: () => this.credits() }, 'Credits'),
      ),
    ));
  }

  private creation(): void {
    let params: Params = { ...DEFAULT_PARAMS };
    let preset = 'standard';
    const seedInput = h('input', { class: 'tu-input', value: randomUniverseSeed(), 'aria-label': 'Seed', spellcheck: 'false', autocomplete: 'off' });
    const dials = h('div', { class: 'tu-dials' });
    const presets = h('div', { class: 'tu-presets' });
    const blurb = h('p', { class: 'tu-hint' });
    const draw = () => {
      presets.replaceChildren(...PRESETS.map((p) => h('button', { class: `tu-chip${p.id === preset ? ' on' : ''}`, onclick: () => { preset = p.id; params = { ...p.params }; draw(); } }, p.name)));
      blurb.textContent = PRESETS.find((p) => p.id === preset)?.blurb ?? 'Your own recipe.';
      dials.replaceChildren(...DIALS.map((d) => h('div', { class: 'tu-dial' },
        h('span', { title: d.hint }, d.label),
        h('div', { class: 'tu-seg' }, ...d.options.map((o, k) => h('button', { class: params[d.key] === k ? 'on' : '', onclick: () => { params = { ...params, [d.key]: k as Dial }; if (preset === 'standard') preset = 'custom'; draw(); } }, o))))));
    };
    draw();
    this.els.title.replaceChildren(h('div', { class: 'tu-titlecard create' },
      h('h2', null, 'Before the beginning'),
      h('p', { class: 'tu-tag' }, 'Choose the universe\'s nature. What each dial really does is for you to find out.'),
      h('h4', null, 'Challenge universes'),
      presets,
      blurb,
      dials,
      h('div', { class: 'tu-seedrow' }, h('span', null, 'Seed'), seedInput, h('button', { class: 'tu-btn', 'aria-label': 'Random seed', onclick: () => { seedInput.value = randomUniverseSeed(); } }, '🎲')),
      h('div', { class: 'tu-titlebtns' },
        h('button', { class: 'tu-btn primary big', onclick: () => this.begin(seedInput.value.trim() || randomUniverseSeed(), params, preset) }, 'BIG BANG'),
        h('button', { class: 'tu-btn', onclick: () => this.title() }, 'Back'),
      ),
    ));
  }

  private begin(seed: string, params: Params, preset: string, goal: string | null = null, auto = false): void {
    const u = Universe.create(seed, params, preset, goal);
    if (params.startAge > 0) {
      this.fastForward(u, params.startAge, () => this.play(u, auto));
      return;
    }
    this.play(u, auto);
  }

  /** Run a universe forward in chunks with a progress card (the Ancient challenge). */
  private fastForward(u: Universe, to: number, done: () => void): void {
    this.busy = true;
    const label = h('p', { class: 'tu-tag' });
    const barEl = h('i');
    this.els.title.replaceChildren(h('div', { class: 'tu-titlecard' }, h('h2', null, 'Fast-forwarding'), label, h('span', { class: 'tu-bar big' }, barEl)));
    const stepOnce = () => {
      const t0 = performance.now();
      while (u.t < to && performance.now() - t0 < 40) u.advance(Math.min(100, to - u.t));
      label.textContent = `${fmtAge(u.t)} of ${fmtAge(to)}…`;
      barEl.style.width = `${Math.round((u.t / to) * 100)}%`;
      if (u.t < to - 1e-6) requestAnimationFrame(stepOnce);
      else {
        this.busy = false;
        done();
      }
    };
    requestAnimationFrame(stepOnce);
  }

  private async continue(): Promise<void> {
    try {
      const st = fromJson<UState>(await store.load('auto'));
      if (!st?.sx || st.version > SAVE_VERSION) throw new Error('bad save');
      this.play(new Universe(st), false);
    } catch {
      this.toast('That save could not be loaded.');
    }
  }

  private play(u: Universe, auto: boolean): void {
    this.titleMode = false;
    this.els.title.replaceChildren();
    this.els.game.classList.remove('titling');
    this.audio.start();
    this.audio.setEnabled(this.settings.sound);
    this.auto = false;
    this.cards = [];
    this.closeCard();
    this.attach(u, false);
    this.speed = 4;
    this.speedBeforeCiv = -1;
    this.sel = { star: -1, planet: -1, civ: -1 };
    this.renderer.fit();
    this.pickTool('select');
    this.setAuto(auto, true);
    this.hud();
    if (u.s.goal) {
      const g = GOALS.find((x) => x.id === u.s.goal);
      if (g) this.toast(`Daily goal: ${g.text}.`);
    }
    this.syncTools();
    // A save from before the answer was given: ask again.
    if (u.s.found['great-filter'] !== undefined && u.s.endgame === 'undecided') {
      this.pendingChoice = false;
      setTimeout(() => this.endgameChoice(), 500);
    }
    if (u.t < 1) this.toast('In the beginning there was only heat and light. Watch it cool.');
    if (!store.list().length && !auto) this.help();
  }

  private attach(u: Universe, quiet: boolean): void {
    this.unsub?.();
    this.u = u;
    this.quiet = quiet;
    if (!this.renderer) this.renderer = new Renderer(this.canvas, u);
    else this.renderer.setUniverse(u);
    this.renderer.resize();
    this.renderer.fit();
    this.director = new Director();
    this.closePanel();
    this.acc = 0;
    // Event interrupts: let the player see first-time wonders and new minds.
    const app = this;
    u.stopOn = {
      get civ() {
        return app.settings.slowForCivs && !app.auto && !app.titleMode;
      },
      discovery: (id) => this.settings.pauseOnDiscovery && !this.auto && !this.titleMode && isCard(id),
    };
    this.unsub = u.on((e) => this.onEvent(e));
  }

  private onEvent(e: UEvent): void {
    if (e.type === 'fx') {
      this.renderer.addFx(e.fx, e.x, e.y, e.angle ?? 0, e.star ?? -1);
      return;
    }
    if (this.quiet || this.titleMode) return;
    if (e.type === 'discovery') {
      if (e.id === this.u.s.goal) this.toast('Daily goal complete!');
      if (e.id === 'great-filter') this.pendingChoice = true;
      const ref = { star: e.star, planet: e.planet, civ: e.civ };
      if (isCard(e.id)) {
        this.audio.ping('discovery');
        this.cards.push({ id: e.id, ref });
        if (!this.cardOpen) this.nextCard();
      } else this.toast(`Discovered: ${DISCOVERY[e.id]?.name ?? e.id}`, ref);
    } else if (e.type === 'chronicle') {
      if (e.important) {
        this.audio.ping('chronicle');
        this.toast(e.text, e);
      }
    } else if (e.type === 'civ') {
      if (e.what === 'born') {
        this.audio.ping('era');
        this.onCivBorn(e.civ);
      } else if ((e.what === 'fell' || e.what === 'silent') && !this.u.aliveCivs().length && this.speedBeforeCiv >= 0) {
        if (this.speed === 1) this.setSpeed(this.speedBeforeCiv);
        this.speedBeforeCiv = -1;
      }
    }
  }

  private onCivBorn(id: number): void {
    const c = this.u.civ(id);
    if (!c) return;
    const p = this.u.planet(c.planet)!;
    if (this.auto) {
      this.toast(`Intelligent life on ${p.name}: the ${c.species}.`, { planet: c.planet });
      return;
    }
    if (this.settings.slowForCivs && this.speed > 1) {
      if (this.speedBeforeCiv < 0) this.speedBeforeCiv = this.speed;
      this.setSpeed(1);
      this.toast(`Intelligent life on ${p.name}: the ${c.species}. Time slowed to a thousand years a second so you can watch them.`, { planet: c.planet });
    } else this.toast(`Intelligent life on ${p.name}: the ${c.species}.`, { planet: c.planet });
    if (this.u.s.found.intelligence !== undefined && this.cards.every((x) => x.id !== 'intelligence')) this.focusRef({ planet: c.planet });
  }

  // --- Loop -------------------------------------------------------------------------------------

  private tick(now: number): void {
    if (!this.u || !this.renderer) return;
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    this.audio.tick(now, dt);
    const blocked = this.busy || this.root.querySelector('.tu-modal') || (this.cardOpen && !this.auto && this.settings.pauseOnDiscovery);
    if (this.speed > 0 && !blocked) {
      this.acc += (dt * SPEEDS[this.speed]) / 1e6;
      const t0 = performance.now();
      while (this.acc > 1e-9 && performance.now() - t0 < 12) {
        const used = this.u.advance(Math.min(this.acc, 4));
        this.acc -= used;
        if (this.u.halted) {
          this.acc = 0;
          break;
        }
      }
      // Fall behind gracefully instead of trying to catch up forever.
      const cap = (0.3 * SPEEDS[this.speed]) / 1e6;
      if (this.acc > cap) this.acc = cap;
    }
    if (this.auto && now - this.thinkAt > 1500 && !this.busy) {
      this.thinkAt = now;
      this.direct(now);
    }
    if (this.cardOpen && this.auto && now > this.cardTimer) this.closeCard();
    this.renderer.frame(now);
    if (now - this.hudAt > 250) {
      this.hudAt = now;
      this.hud();
    }
    if (this.panel && now - this.panelAt > (this.panel === 'inspect' ? 700 : 1500)) {
      this.panelAt = now;
      this.refreshPanel();
    }
    if (!this.titleMode && now - this.saveAt > 60000) {
      this.saveAt = now;
      void this.save();
    }
  }

  private direct(now: number): void {
    const a = this.director.think(this.u, now);
    if (a.choose && this.u.s.endgame === 'undecided') {
      const res = this.u.chooseEndgame(a.choose);
      if (res.ok) this.toast(`Director: ${a.choose === 'threat' ? 'becoming the threat' : a.choose === 'intervene' ? 'intervening' : 'watching'}.`);
      this.syncTools();
      this.refreshPanel();
    }
    if (a.speed !== undefined && a.speed !== this.speed) this.setSpeed(a.speed);
    if (a.focus) {
      if (a.focus.system && !this.titleMode) {
        this.renderer.enterSystem(a.focus.star);
        this.renderer.selPlanet = a.focus.planet ?? -1;
        this.sel = { star: a.focus.star, planet: a.focus.planet ?? -1, civ: -1 };
      } else {
        this.renderer.exitSystem();
        const [x, y] = this.renderer.starWorld(a.focus.star);
        this.renderer.selStar = a.focus.star;
        this.renderer.centerOn(x, y, this.titleMode ? 0.9 : 1.6);
      }
      if (this.panel === 'inspect') this.refreshPanel(true);
    }
    if (a.act) {
      const res = this.u.intervene(a.act.kind, a.act.target);
      if (res.ok && !this.titleMode) this.toast(`Director: ${a.act.why}.`);
    }
  }

  private hud(): void {
    const u = this.u;
    if (!u || this.titleMode) return;
    const s = u.s;
    this.els.age.textContent = fmtAge(s.t, this.speed > 0 && this.speed <= 2 && s.t > 1, window.innerWidth <= 400);
    const era = u.cosmicEra();
    this.els.era.textContent = `ERA ${era} · ${COSMIC_ERAS[era].name}`;
    this.els.stars.textContent = u.living.toLocaleString('en-US');
    this.els.life.textContent = String(u.lifeWorlds().length);
    this.els.civs.textContent = String(u.aliveCivs().length);
    // The soundscape follows the cosmos: hum from the start, pulses with the
    // stars, rhythm with civilizations, and space with the galaxy itself.
    const civs = u.aliveCivs().length;
    this.audio.setScene({
      hum: 0.5 + 0.4 * Math.min(1, s.t / 12000),
      pulse: Math.min(1, u.living / 1400),
      rhythm: Math.min(1, civs / 3),
      space: Math.min(1, era / 6),
    });
    this.els.speed.textContent = SPEED_LABEL[this.speed];
    this.els.play.replaceChildren(gi(this.speed ? 'u-pause' : 'u-play'));
    this.els.play.setAttribute('aria-label', this.speed ? 'Pause' : 'Play');
    const a = this.els.auto;
    a.classList.toggle('on', this.auto);
    a.setAttribute('aria-pressed', String(this.auto));
    a.title = this.auto ? 'Automatic mode is on: tap to take over' : 'Automatic mode: a director runs the universe';
    const sys = this.renderer.view === 'system';
    this.els.chip.hidden = !sys;
    if (sys) this.els.chiptext.textContent = `${u.names[this.renderer.sysStar]} system`;
  }

  setSpeed(k: number): void {
    this.speed = Math.max(0, Math.min(SPEEDS.length - 1, k));
    this.acc = 0;
    this.hud();
  }

  private lastSpeed = 4;
  togglePause(): void {
    if (this.speed) {
      this.lastSpeed = this.speed;
      this.setSpeed(0);
    } else this.setSpeed(this.lastSpeed || 4);
  }

  nudgeSpeed(d: number): void {
    this.speedBeforeCiv = -1;
    this.setSpeed(Math.max(1, (this.speed || this.lastSpeed) + d));
  }

  setAuto(on: boolean, silent = false): void {
    this.auto = on;
    this.thinkAt = 0;
    if (on && this.speed === 0) this.speed = 4;
    if (on) this.pickTool('select');
    this.hud();
    if (on && !silent && !this.titleMode) this.toast('Automatic mode: a director sets the pace, follows the action and sometimes plays god. Tap AUTO to take over.');
  }

  // --- Selection and views -------------------------------------------------------------------------

  selectStar(i: number): void {
    this.sel = { star: i, planet: -1, civ: -1 };
    if (this.renderer.view === 'system' && this.renderer.sysStar !== i) this.exitSystem();
    this.renderer.selStar = i;
    this.renderer.selPlanet = -1;
    this.openPanel('inspect');
    // Keep the star clear of the panel so it can be tapped again.
    const [x, y] = this.renderer.starWorld(i);
    if (this.renderer.view === 'galaxy' && !this.renderer.visible(x, y)) this.renderer.centerOn(x, y);
  }

  selectPlanet(pid: number): void {
    const star = Math.floor(pid / PLANET_STRIDE);
    this.sel = { star, planet: pid, civ: this.u.s.ps[pid]?.civ ?? -1 };
    this.renderer.enterSystem(star);
    this.renderer.selPlanet = pid;
    this.openPanel('inspect');
    this.hud();
  }

  selectCiv(id: number): void {
    const c = this.u.civ(id);
    if (!c) return;
    this.sel = { star: c.star, planet: -1, civ: id };
    this.renderer.exitSystem();
    this.renderer.selStar = c.star;
    this.renderer.selPlanet = -1;
    this.openPanel('inspect');
    const [x, y] = this.renderer.starWorld(c.star);
    this.renderer.centerOn(x, y, Math.max(this.renderer.z, 1.4));
  }

  enterSystem(i: number): void {
    this.renderer.enterSystem(i);
    this.renderer.selPlanet = -1;
    this.sel = { star: i, planet: -1, civ: -1 };
    this.refreshPanel(true);
    this.hud();
  }

  exitSystem(): void {
    this.renderer.exitSystem();
    if (this.sel.planet >= 0) this.sel = { star: this.sel.star, planet: -1, civ: -1 };
    this.refreshPanel(true);
    this.hud();
  }

  focusRef(ref: Target): void {
    const u = this.u;
    if (ref.planet !== undefined && u.planet(ref.planet)) this.selectPlanet(ref.planet);
    else if (ref.civ !== undefined && u.civ(ref.civ)) this.selectCiv(ref.civ);
    else if (ref.star !== undefined && u.s.sm[ref.star] > 0) {
      this.selectStar(ref.star);
      const [x, y] = this.renderer.starWorld(ref.star);
      this.renderer.centerOn(x, y, Math.max(this.renderer.z, 1.4));
    }
  }

  setHistoryAll(on: boolean): void {
    this.historyAll = on;
    this.refreshPanel(true);
  }

  copySeed(): void {
    const text = this.u.s.seed;
    void navigator.clipboard?.writeText(text).then(() => this.toast(`Copied “${text}”.`), () => this.toast(text));
  }

  // --- Tools and interventions ------------------------------------------------------------------------

  pickTool(id: Tool): void {
    this.tool = id;
    if (id === 'matter' && this.renderer?.view === 'system') this.exitSystem();
    for (const b of this.els.game.querySelectorAll<HTMLElement>('[data-tool]')) b.classList.toggle('on', b.dataset.tool === id);
    this.els.hint.textContent = TOOLS.find((t) => t.id === id)!.note;
    this.els.game.classList.toggle('placing', id !== 'select');
  }

  /** The Erase power exists only for the one who becomes the threat. */
  private syncTools(): void {
    const on = this.u?.s.endgame === 'threat';
    const btn = this.els.game.querySelector<HTMLElement>('[data-tool="erase"]');
    if (btn) btn.hidden = !on;
    if (!on && this.tool === 'erase') this.pickTool('select');
  }

  /** Run an intervention; destructive ones need a second tap to confirm. */
  act(kind: Intervention, target: Target, confirm?: string): void {
    const key = `${kind}:${JSON.stringify(target)}`;
    if (confirm && (this.confirmKey !== key || performance.now() - this.confirmAt > 4000)) {
      this.confirmKey = key;
      this.confirmAt = performance.now();
      this.toast(`Tap again to confirm: ${confirm.toLowerCase()}.`);
      return;
    }
    this.confirmKey = '';
    if (kind === 'nova' && this.renderer.view === 'system') this.exitSystem();
    const res = this.u.intervene(kind, target);
    this.toast(res.text);
    this.refreshPanel();
    this.hud();
  }

  // --- Panels -------------------------------------------------------------------------------------

  togglePanel(id: PanelId): void {
    if (this.panel === id) this.closePanel();
    else this.openPanel(id);
  }

  openPanel(id: PanelId): void {
    const was = this.panel;
    this.panel = id;
    this.els.game.classList.add('side-open');
    this.els.ptitle.textContent = PANEL_TITLE[id];
    for (const b of this.els.game.querySelectorAll<HTMLElement>('[data-panel]')) b.classList.toggle('on', b.dataset.panel === id);
    this.refreshPanel(true);
    if (!was) this.layout();
  }

  closePanel(): void {
    this.panel = null;
    this.els.game?.classList.remove('side-open');
    for (const b of this.els.game?.querySelectorAll<HTMLElement>('[data-panel]') ?? []) b.classList.remove('on');
    this.layout();
  }

  refreshPanel(reset = false): void {
    if (!this.panel || !this.u) return;
    const body = this.els.pbody;
    if (!reset && body.contains(document.activeElement) && document.activeElement?.tagName === 'SUMMARY') return;
    const top = reset ? 0 : body.scrollTop;
    body.replaceChildren(renderPanel(this, this.panel));
    body.scrollTop = top;
  }

  // --- Discovery cards -------------------------------------------------------------------------------

  private nextCard(): void {
    const next = this.cards.shift();
    if (!next) return;
    this.showDiscovery(next.id, true, next.ref);
  }

  showDiscovery(id: string, live: boolean, ref: Target = {}): void {
    const d = DISCOVERY[id];
    if (!d) return;
    this.cardOpen = true;
    this.cardTimer = performance.now() + 3600;
    const u = this.u;
    let sub = '';
    if (ref.planet !== undefined && u.planet(ref.planet)) sub = `${u.planet(ref.planet)!.name} · ${u.kindName(ref.planet)} · habitability ${Math.round(u.habNow(ref.planet) * 100)}%`;
    else if (ref.civ !== undefined && u.civ(ref.civ)) sub = u.civ(ref.civ)!.name;
    else if (ref.star !== undefined && u.s.sm[ref.star] > 0) sub = `${u.names[ref.star]}`;
    const look = ref.planet !== undefined || ref.civ !== undefined || ref.star !== undefined;
    this.els.card.replaceChildren(h('div', { class: `tu-dcard r${d.rarity}`, role: 'dialog', 'aria-label': d.name },
      h('div', { class: 'tu-dglyph' }, gi(d.icon)),
      h('small', null, live ? '✦ New discovery' : 'Observatory'),
      h('h2', null, d.name),
      h('div', { class: 'tu-stars' }, '★'.repeat(d.rarity)),
      h('p', null, d.text),
      sub ? h('p', { class: 'tu-dsub' }, sub) : null,
      h('div', { class: 'tu-dbtns' },
        look ? h('button', { class: 'tu-btn', onclick: () => { this.closeCard(); this.focusRef(ref); } }, 'Look') : null,
        h('button', { class: 'tu-btn primary', onclick: () => this.closeCard() }, this.cards.length ? `Next (${this.cards.length})` : 'Continue'),
      )));
    this.els.card.classList.add('on');
  }

  private closeCard(): void {
    this.cardOpen = false;
    this.els.card?.classList.remove('on');
    this.els.card?.replaceChildren();
    if (this.cards.length) setTimeout(() => this.nextCard(), 120);
    else if (this.pendingChoice && !this.auto && !this.titleMode) {
      this.pendingChoice = false;
      this.endgameChoice();
    }
  }

  /** The Great Filter reveal (doc §37): intervene, stay out, or become the threat. */
  private endgameChoice(): void {
    const u = this.u;
    if (!u || u.s.endgame !== 'undecided' || u.s.found['great-filter'] === undefined) return;
    if (this.root.querySelector('.tu-modal')) return;
    const pick = (kind: 'intervene' | 'observe' | 'threat', label: string) =>
      h('button', {
        class: `tu-btn wide${kind === 'threat' ? ' danger' : ' primary'}`,
        onclick: () => {
          close();
          const res = u.chooseEndgame(kind);
          this.toast(res.text);
          this.syncTools();
          this.refreshPanel();
          this.hud();
        },
      }, label);
    const close = this.modal('The Great Filter', h('div', { class: 'tu-help' },
      h('p', null, 'The ruins agree. Every civilization that wraps its star in light is erased by something older, patient and quiet. The universe is not naturally empty — it is kept that way.'),
      h('p', null, 'Now that you know, what will you do about it?'),
      h('div', { class: 'tu-acts' },
        pick('intervene', 'Intervene — protect civilizations'),
        pick('observe', 'Stay out — observe'),
        pick('threat', 'Become the threat'),
      ),
    ));
  }

  // --- Input --------------------------------------------------------------------------------------------

  private pos(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private bindInput(): void {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const p = this.pos(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, f: 1 };
        this.drag = null;
      } else this.drag = { x: p.x, y: p.y, moved: false };
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const p = this.pos(e);
      const prev = this.pointers.get(e.pointerId)!;
      this.pointers.set(e.pointerId, p);
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const f = this.pinch.d > 10 ? d / this.pinch.d : 1;
        this.pinch.f *= f;
        if (this.renderer.view === 'system') {
          if (this.pinch.f < 0.7) {
            this.exitSystem();
            this.pinch.f = 1;
          }
        } else {
          this.renderer.pan(mx - this.pinch.mx, my - this.pinch.my);
          this.renderer.zoomAt(mx, my, f);
        }
        this.pinch.d = d;
        this.pinch.mx = mx;
        this.pinch.my = my;
        return;
      }
      if (this.drag) {
        if (Math.hypot(p.x - this.drag.x, p.y - this.drag.y) > 6) this.drag.moved = true;
        if (this.drag.moved) this.renderer.pan(p.x - prev.x, p.y - prev.y);
      }
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pinch) {
        if (this.pointers.size < 2) this.pinch = null;
        return;
      }
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved || this.titleMode) return;
      this.tap(d.x, d.y);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
      this.pinch = null;
      this.drag = null;
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.renderer.view === 'system') {
        if (e.deltaY > 30) this.exitSystem();
        return;
      }
      const r = cv.getBoundingClientRect();
      this.renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.004));
    }, { passive: false });
  }

  private tap(px: number, py: number): void {
    const u = this.u;
    const r = this.renderer;
    if (this.auto) this.setAuto(false);
    if (r.view === 'system') {
      const hit = r.pickSystem(px, py);
      if (hit === -1) return;
      const star = r.sysStar;
      if (this.tool === 'nova') {
        this.act('nova', { star });
        this.pickTool('select');
      } else if (hit === -2) this.selectStar(star);
      else if (this.tool === 'seed' || this.tool === 'asteroid') {
        this.act(this.tool, { planet: hit });
        this.pickTool('select');
      } else if (this.tool === 'erase') {
        const cid = u.s.ps[hit]?.civ ?? u.aliveCivs().find((x) => x.star === star)?.id;
        const c = cid !== undefined ? u.civ(cid) : undefined;
        if (!c || !alive(c)) this.toast('No civilization on that world.');
        else this.act('erase', { civ: c.id }, `erase the ${c.name}`);
        this.pickTool('select');
      } else this.selectPlanet(hit);
      return;
    }
    if (this.tool === 'matter') {
      const [x, y] = r.toWorld(px, py);
      this.act('matter', { x, y });
      return;
    }
    const star = r.pickStar(px, py);
    if (this.tool === 'select') {
      if (star < 0) {
        this.sel = { star: -1, planet: -1, civ: -1 };
        r.selStar = -1;
        if (this.panel === 'inspect') this.refreshPanel(true);
        return;
      }
      if (star === this.sel.star && this.sel.planet < 0 && u.planets[star]?.length) this.enterSystem(star);
      else this.selectStar(star);
      return;
    }
    if (star < 0) {
      this.toast('Tap a star.');
      return;
    }
    if (this.tool === 'nova') this.act('nova', { star });
    else if (this.tool === 'erase') {
      const c = u.aliveCivs().find((x) => x.star === star);
      if (!c) this.toast('No civilization lives around that star.');
      else this.act('erase', { civ: c.id }, `erase the ${c.name}`);
    } else if (this.tool === 'seed') {
      const best = this.bestWorld(star, false);
      if (best < 0) this.toast('Nothing around that star could hold life.');
      else this.act('seed', { planet: best });
    } else if (this.tool === 'asteroid') {
      const best = this.bestWorld(star, true);
      if (best < 0) this.toast('That star has no solid worlds.');
      else this.act('asteroid', { planet: best });
    }
    this.pickTool('select');
  }

  /** The most promising lifeless world of a star, or (for impacts) its most alive one. */
  private bestWorld(star: number, alive: boolean): number {
    const u = this.u;
    let best = -1;
    let score = alive ? -1 : 0.05;
    for (const p of u.planets[star] ?? []) {
      if (p.body === 'gas' || u.s.ps[p.id]?.gone) continue;
      const b = u.s.ps[p.id]?.life;
      const living = b && b.dead < 0;
      const v = alive ? (living ? b!.stage + 1 : 0) + u.habNow(p.id) : living ? -1 : u.habNow(p.id);
      if (v > score) {
        score = v;
        best = p.id;
      }
    }
    return best;
  }

  private onKey(e: KeyboardEvent): void {
    if (this.titleMode || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (this.root.querySelector('.tu-modal')) return;
    if (e.key === 'Escape') {
      if (this.cardOpen) this.closeCard();
      else if (this.tool !== 'select') this.pickTool('select');
      else if (this.renderer.view === 'system') this.exitSystem();
      else this.closePanel();
      return;
    }
    if (this.cardOpen && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.closeCard();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      this.togglePause();
    } else if (e.key >= '1' && e.key <= '5') this.setSpeed(+e.key);
    else if (e.key === '-' || e.key === '_') this.nudgeSpeed(-1);
    else if (e.key === '+' || e.key === '=') this.nudgeSpeed(1);
  }

  // --- Toasts, dialogs, saving ------------------------------------------------------------------------------

  toast(text: string, ref?: Target): void {
    const host = this.els.toasts;
    for (const t of host.children) if (t.textContent === text) return;
    const clickable = ref && (ref.planet !== undefined || ref.star !== undefined || ref.civ !== undefined);
    const el = h(clickable ? 'button' : 'div', { class: `tu-toast${clickable ? ' link' : ''}`, role: 'status', onclick: clickable ? () => this.focusRef(ref!) : undefined }, text);
    host.append(el);
    while (host.children.length > 3) host.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 5200);
    setTimeout(() => el.remove(), 5700);
  }

  private modal(title: string, body: HTMLElement): () => void {
    const close = () => el.remove();
    const el = h('div', { class: 'tu-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: (e: Event) => e.target === el && close() },
      h('div', { class: 'tu-card' }, h('div', { class: 'tu-cardhead' }, h('h2', null, title), h('button', { class: 'tu-iconbtn', 'aria-label': 'Close', onclick: close }, gi('u-close'))), body));
    this.root.append(el);
    return close;
  }

  private menu(): void {
    const u = this.u;
    const item = (label: string, fn: () => void) => h('button', { class: 'tu-btn', onclick: () => { close(); fn(); } }, label);
    const toggle = (label: string, key: 'pauseOnDiscovery' | 'slowForCivs' | 'sound') => h('label', { class: 'tu-toggle' },
      h('input', { type: 'checkbox', checked: this.settings[key], onchange: (e: Event) => { this.settings[key] = (e.target as HTMLInputElement).checked; persist('tu:settings', this.settings); if (key === 'sound') this.audio.setEnabled(this.settings.sound); } }),
      h('span', null, label));
    const close = this.modal('Menu', h('div', { class: 'tu-menu' },
      h('p', { class: 'tu-hint' }, `${fmtAge(u.t)} · seed “${u.s.seed}” · ${profileTitle(this)}`),
      item('Save', () => void this.save().then(() => this.toast('Saved.'))),
      item('Export to a file', () => download(`tiny-universe-${u.s.seed}.json`, toJson(u.s))),
      item('Import a file', () => void this.importFile()),
      item('Cosmic history', () => this.openPanel('history')),
      item('Your cosmic profile', () => this.openPanel('profile')),
      item('New universe', () => { this.saveNow(); this.title(); this.creation(); }),
      toggle('Pause for big discoveries', 'pauseOnDiscovery'),
      toggle('Slow down when intelligence appears', 'slowForCivs'),
      toggle('Ambient sound', 'sound'),
      item('How to play', () => this.help()),
      item('Credits', () => this.credits()),
      item('Title screen', () => { this.saveNow(); this.title(); }),
    ));
  }

  private async importFile(): Promise<void> {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const st = fromJson<UState>(await f.text());
      if (!st?.sx || !st.params || st.version > SAVE_VERSION) throw new Error('bad');
      this.play(new Universe(st), false);
    } catch {
      this.toast('That file is not a Tiny Universe save.');
    }
  }

  help(): void {
    this.modal('How to play', h('div', { class: 'tu-help' },
      h('p', null, 'You start with a hot, empty universe. Gas cools into a galaxy, stars ignite, and the biggest ones explode, scattering the heavy elements that rocky planets, and life, are made of. Around the right stars, on the right worlds, life begins and slowly climbs: microbes, complex life, life on land, tool users, minds. Minds build civilizations, and civilizations have to survive themselves.'),
      h('h4', null, 'Watching'),
      h('ul', null,
        h('li', null, 'Drag to pan, scroll or pinch to zoom. Tap a star to inspect it; tap it again to open its system and see its planets.'),
        h('li', null, 'Green rings mark stars with life. Coloured rings and lines are civilizations and their colonies.'),
        h('li', null, 'Time runs from a thousand to a billion years per second. Big discoveries pause the universe so you can look; new civilizations slow time down. Both can be turned off in the menu.'),
        h('li', null, 'AUTO hands the universe to a director that sets the pace and follows the action.'),
        h('li', null, 'Keys: Space pause, 1–5 speed, − and + slower and faster, Esc back.'),
      ),
      h('h4', null, 'Intervening'),
      h('ul', null,
        h('li', null, h('b', null, 'Matter'), ' pours in gas where you tap; ', h('b', null, 'Life'), ' seeds a world with microbes; ', h('b', null, 'Asteroid'), ' and ', h('b', null, 'Nova'), ' destroy.'),
        h('li', null, 'From a planet or civilization you can also warm or cool a world, share knowledge, protect a civilization through its next catastrophe, and study the ruins of fallen ones.'),
        h('li', null, 'Civilizations nearby may notice what you do. Your choices shape your cosmic profile: creator, observer or destroyer.'),
      ),
      h('h4', null, 'The mystery'),
      h('p', null, 'Most civilizations fall. The ones that get furthest tend to disappear in a way nobody can explain. Study ruins and watch the advanced ones closely to find out why.'),
    ));
  }

  private credits(): void {
    this.modal('Credits', h('div', { class: 'tu-help' },
      h('p', null, 'Tiny Universe, a universe you can play with, made for this site. Stars, worlds, species and civilizations are generated in your browser from the seed.'),
      h('h4', null, 'Icons'),
      h('p', null, 'From ', h('a', { href: 'https://game-icons.net', target: '_blank', rel: 'noopener' }, 'game-icons.net'), ', licensed ', h('a', { href: 'https://creativecommons.org/licenses/by/3.0/', target: '_blank', rel: 'noopener' }, 'CC BY 3.0'), ':'),
      ...icons.credits().map((c) => h('p', { class: 'tu-credit' }, c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.author) : c.author, ': ', ...c.icons.flatMap((ic, k) => [k ? ', ' : '', h('a', { href: ic.href, target: '_blank', rel: 'noopener' }, ic.name)]))),
      h('h4', null, 'Typefaces'),
      h('p', null, 'Inter and JetBrains Mono, SIL Open Font License.'),
    ));
  }

  private meta() {
    const u = this.u;
    return { key: 'auto', label: 'Autosave', title: 'Tiny Universe', subtitle: `${fmtAge(u.t)}, ${u.s.stats.civsBorn} civilization${u.s.stats.civsBorn === 1 ? '' : 's'}` };
  }

  private async save(): Promise<void> {
    if (this.titleMode || !this.u || this.busy) return;
    try {
      await store.save(this.meta(), toJson(this.u.s));
    } catch {
      /* storage unavailable or full */
    }
  }

  saveNow(): void {
    if (this.titleMode || !this.u || this.busy) return;
    try {
      store.saveSync(this.meta(), toJson(this.u.s));
    } catch {
      /* storage unavailable or full */
    }
  }

  /** Testing aid: run the universe forward quickly. */
  debugRun(myr: number): void {
    this.u.advance(myr);
  }

  /** Testing aid: is a star alive? */
  debugLiving(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.u.s.n; i++) if (this.u.s.sphase[i] === Phase.Main) out.push(i);
    return out;
  }

  /** Testing aid: civilizations alive. */
  debugCivs(): number {
    return this.u.s.civs.filter(alive).length;
  }
}
