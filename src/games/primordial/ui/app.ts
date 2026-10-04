import { compact, download, h, pickFile } from '../../shared/dom';
import { fromJson, SaveStore, toJson } from '../../shared/savefile';
import { randomSeedString } from '../../shared/rng';
import { icons, type IconKey } from '../art';
import { Renderer } from '../render/renderer';
import { Director } from '../sim/director';
import { SAVE_VERSION, World, type WorldState } from '../sim/world';
import { PANEL_TITLE, renderPanel, worldSummary, type PanelId } from './panels';

// Primordial: the app shell. The sea runs at a fixed time step; the speed
// buttons decide how many steps fit in each frame.

type Tool = 'watch' | 'grazer' | 'hunter' | 'bloom' | 'meteor' | 'ice' | 'heat' | 'storm';

const TOOLS: { id: Tool; label: string; icon: IconKey; note: string; global?: boolean }[] = [
  { id: 'watch', label: 'Watch', icon: 't-watch', note: 'Drag to look around. Tap a creature to follow it.' },
  { id: 'grazer', label: 'Grazers', icon: 't-grazer', note: 'Tap to release a new species of grazers.' },
  { id: 'hunter', label: 'Hunters', icon: 't-hunter', note: 'Tap to release a new species of hunters.' },
  { id: 'bloom', label: 'Bloom', icon: 't-bloom', note: 'Tap to make algae bloom.' },
  { id: 'meteor', label: 'Meteor', icon: 't-meteor', note: 'Tap to drop a meteor. Everything nearby dies.' },
  { id: 'ice', label: 'Ice age', icon: 't-ice', note: 'Cool the whole world for a while.', global: true },
  { id: 'heat', label: 'Heat', icon: 't-heat', note: 'Warm the whole world for a while.', global: true },
  { id: 'storm', label: 'Mutate', icon: 't-storm', note: 'A storm of cosmic rays: mutations run wild.', global: true },
];

const SPEEDS = [0, 1, 2, 4, 8];
const DT = 1 / 30;
const store = new SaveStore('pr');

const PANELS: { id: PanelId; icon: IconKey }[] = [
  { id: 'species', icon: 'p-species' },
  { id: 'tree', icon: 'p-tree' },
  { id: 'story', icon: 'p-story' },
  { id: 'stats', icon: 'p-stats' },
  { id: 'creature', icon: 'p-creature' },
];

function gi(key: IconKey): HTMLElement {
  return h('span', { class: 'pr-gi', html: icons.svg(key) });
}

export class App {
  root: HTMLElement;
  world!: World;
  renderer!: Renderer;
  director = new Director();
  speed = 2;
  auto = false;
  tool: Tool = 'watch';
  panel: PanelId | null = null;
  private canvas!: HTMLCanvasElement;
  private els: Record<string, HTMLElement> = {};
  private last = 0;
  private acc = 0;
  private hudAt = 0;
  private panelAt = 0;
  private saveAt = 0;
  private thinkAt = 0;
  private titleMode = true;
  private unsub: (() => void) | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private pinch: { d: number; mx: number; my: number } | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('pr');
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

  // --- DOM -------------------------------------------------------------------------------

  private buildDom(): void {
    this.canvas = h('canvas', { class: 'pr-canvas', 'aria-label': 'The primordial sea' });
    const speedBtn = (k: number, icon: IconKey, label: string) => h('button', { class: 'pr-speed', 'data-speed': String(k), 'aria-label': label, title: label, onclick: () => this.setSpeed(k) }, gi(icon), k > 1 ? h('i', null, `${SPEEDS[k]}×`) : null);
    const top = h('header', { class: 'pr-top' },
      h('div', { class: 'pr-brand' }, h('b', null, 'PRIMORDIAL'), h('span', { 'data-k': 'year' })),
      h('div', { class: 'pr-stats' },
        h('span', null, h('b', { 'data-k': 'pop' }), h('small', null, 'alive')),
        h('span', null, h('b', { 'data-k': 'species' }), h('small', null, 'species')),
        h('span', { class: 'hide-sm' }, h('b', { 'data-k': 'gen' }), h('small', null, 'generations')),
      ),
      h('div', { class: 'pr-speeds' }, speedBtn(0, 'u-pause', 'Pause'), speedBtn(1, 'u-play', 'Normal'), speedBtn(2, 'u-fast', 'Fast'), speedBtn(3, 'u-fast', 'Faster'), speedBtn(4, 'u-fast', 'Fastest')),
      h('button', { class: 'pr-autobtn', 'data-k': 'auto', 'aria-pressed': 'false', title: 'Automatic mode: the director plays god', onclick: () => this.setAuto(!this.auto) }, 'AUTO'),
      h('nav', { class: 'pr-panelnav' }, ...PANELS.map((p) => h('button', { class: 'pr-iconbtn', 'data-panel': p.id, title: PANEL_TITLE[p.id], 'aria-label': PANEL_TITLE[p.id], onclick: () => this.togglePanel(p.id) }, gi(p.icon)))),
      h('button', { class: 'pr-iconbtn pr-menubtn', title: 'Menu', 'aria-label': 'Menu', onclick: () => this.menu() }, gi('u-menu')),
    );
    const tools = h('nav', { class: 'pr-tools', 'aria-label': 'Powers' }, ...TOOLS.map((t) => h('button', { class: 'pr-tool', 'data-tool': t.id, title: `${t.label}: ${t.note}`, 'aria-label': t.label, onclick: () => this.pickTool(t.id) }, gi(t.icon), h('small', null, t.label))));
    const side = h('aside', { class: 'pr-side' }, h('div', { class: 'pr-sidehead' }, h('span', { 'data-k': 'ptitle' }), h('button', { class: 'pr-iconbtn', 'aria-label': 'Close', onclick: () => this.closePanel() }, gi('u-close'))), h('div', { class: 'pr-sidebody', 'data-k': 'pbody' }));
    const hint = h('div', { class: 'pr-hint-bar', 'data-k': 'hint' });
    const game = h('div', { class: 'pr-game' }, this.canvas, top, tools, side, hint, h('div', { class: 'pr-toasts', 'data-k': 'toasts' }), h('div', { class: 'pr-titlewrap', 'data-k': 'title' }));
    this.root.append(game);
    this.els.game = game;
    for (const el of game.querySelectorAll<HTMLElement>('[data-k]')) this.els[el.dataset.k!] = el;
    this.bindInput();
    new ResizeObserver(() => this.renderer?.resize()).observe(this.canvas);
  }

  // --- Title ------------------------------------------------------------------------------

  title(): void {
    this.titleMode = true;
    this.setAuto(false, true);
    this.attach(World.create(randomSeedString()), true);
    this.speed = 3;
    this.els.game.classList.add('titling');
    const auto = store.list().find((m) => m.key === 'auto');
    const t = this.els.title;
    t.replaceChildren(h('div', { class: 'pr-titlecard' },
      h('h1', null, 'PRIMORDIAL'),
      h('p', { class: 'pr-tag' }, 'Seed a sea with simple life and watch evolution do the rest: herds, hunters, giants, extinctions. Play god, or just watch.'),
      h('div', { class: 'pr-titlebtns' },
        auto ? h('button', { class: 'pr-btn primary', onclick: () => void this.continue() }, `Continue: ${auto.subtitle}`) : null,
        h('button', { class: `pr-btn ${auto ? '' : 'primary'}`, onclick: () => this.newWorld() }, 'New world'),
        h('button', { class: 'pr-btn', onclick: () => { this.newWorld(); this.setAuto(true); } }, 'Watch it evolve (auto)'),
        h('button', { class: 'pr-btn', onclick: () => this.help() }, 'How to play'),
      ),
      h('footer', null,
        h('a', { href: '/games', 'data-astro-reload': true }, '← All games'),
        h('span', null, 'Icons: ', h('a', { href: 'https://game-icons.net', target: '_blank', rel: 'noopener' }, 'game-icons.net'), ' (CC BY 3.0)'),
        h('button', { class: 'pr-linkbtn', onclick: () => this.credits() }, 'Credits'),
      ),
    ));
    // The title screen runs a real sea in the background, with the director at work.
    this.auto = true;
  }

  private async continue(): Promise<void> {
    try {
      const st = fromJson<WorldState>(await store.load('auto'));
      if (!st?.alive || st.version > SAVE_VERSION) throw new Error('bad save');
      this.play(new World(st));
    } catch {
      this.toast('That save could not be loaded.');
    }
  }

  private newWorld(seed = randomSeedString()): void {
    this.play(World.create(seed));
  }

  private play(w: World): void {
    this.titleMode = false;
    this.els.title.replaceChildren();
    this.els.game.classList.remove('titling');
    this.auto = false;
    this.attach(w, false);
    this.speed = 2;
    this.renderer.fit();
    this.pickTool('watch');
    this.hud();
    if (!store.list().length) this.help();
  }

  private attach(w: World, quiet: boolean): void {
    this.unsub?.();
    this.world = w;
    if (!this.renderer) this.renderer = new Renderer(this.canvas, w);
    else this.renderer.setWorld(w);
    this.renderer.resize();
    this.renderer.fit();
    this.director = new Director();
    this.closePanel();
    this.unsub = w.on((e) => {
      if (e.type === 'meteor') this.renderer.meteorFlash(e.x, e.y);
      if (e.type === 'chronicle' && e.entry.important && !quiet && !this.titleMode) this.toast(e.entry.text);
    });
  }

  // --- Loop ---------------------------------------------------------------------------------

  private tick(now: number): void {
    if (!this.world || !this.renderer) return;
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    const w = this.world;
    const speed = SPEEDS[this.speed];
    if (speed > 0 && !this.root.querySelector('.pr-modal')) {
      this.acc += dt * speed;
      const t0 = performance.now();
      // Run whole steps until caught up or out of frame budget.
      while (this.acc >= DT && performance.now() - t0 < 12) {
        w.step(DT);
        this.acc -= DT;
      }
      if (this.acc > DT * 4) this.acc = DT * 4;
      if (this.auto && w.s.t - this.thinkAt >= 1) {
        this.thinkAt = w.s.t;
        const a = this.director.think(w);
        if (a) {
          w.power(a.power, a.x, a.y);
          if (!this.titleMode) this.toast(`Director: ${a.why}`);
          if (a.power === 'meteor' || a.power === 'grazer' || a.power === 'hunter') this.lookAt(a.x, a.y);
        }
      }
    }
    if (this.auto) {
      // The director keeps the camera on someone interesting.
      const pick = this.director.pickSubject(w, now, this.renderer.follow);
      if (pick >= 0 && pick !== this.renderer.follow) this.followCreature(pick, this.titleMode ? 0.9 : Math.max(this.renderer.z, 1.1));
    }
    this.renderer.frame(now);
    if (now - this.hudAt > 250) {
      this.hudAt = now;
      this.hud();
    }
    if (this.panel && now - this.panelAt > (this.panel === 'creature' ? 400 : 1500)) {
      this.panelAt = now;
      this.refreshPanel();
    }
    if (!this.titleMode && now - this.saveAt > 60000) {
      this.saveAt = now;
      void this.save();
    }
  }

  private hud(): void {
    const w = this.world;
    if (!w || this.titleMode) return;
    this.els.year.textContent = `Year ${compact(w.year)}`;
    this.els.pop.textContent = compact(w.count);
    this.els.species.textContent = String(w.living().filter((sp) => sp.count >= 3).length);
    this.els.gen.textContent = compact(w.s.maxGen);
    for (const b of this.els.game.querySelectorAll<HTMLElement>('[data-speed]')) b.classList.toggle('on', +b.dataset.speed! === this.speed);
    const a = this.els.auto;
    a.classList.toggle('on', this.auto);
    a.setAttribute('aria-pressed', String(this.auto));
    a.title = this.auto ? 'Automatic mode is on: tap to take over' : 'Automatic mode: the director plays god';
  }

  setSpeed(k: number): void {
    this.speed = k;
    this.hud();
  }

  setAuto(on: boolean, silent = false): void {
    this.auto = on;
    this.thinkAt = this.world?.s.t ?? 0;
    if (on && this.speed === 0) this.speed = 2;
    if (!on && this.renderer) this.renderer.follow = -1;
    this.hud();
    if (on && !silent && !this.titleMode) this.toast('Automatic mode: the director plays god and the camera follows the action. Tap AUTO to take over.');
  }

  // --- Tools and panels ---------------------------------------------------------------------------

  pickTool(id: Tool): void {
    const t = TOOLS.find((x) => x.id === id)!;
    if (t.global && id !== 'watch') {
      const name = this.world.power(id, this.renderer.cx, this.renderer.cy);
      if (!name) this.toast('The climate is already changing. Wait for it to settle.');
      this.tool = 'watch';
    } else this.tool = id;
    for (const b of this.els.game.querySelectorAll<HTMLElement>('[data-tool]')) b.classList.toggle('on', b.dataset.tool === this.tool);
    this.els.hint.textContent = TOOLS.find((x) => x.id === this.tool)!.note;
    this.els.game.classList.toggle('placing', this.tool !== 'watch');
  }

  togglePanel(id: PanelId): void {
    if (this.panel === id) this.closePanel();
    else this.openPanel(id);
  }

  openPanel(id: PanelId): void {
    this.panel = id;
    this.els.game.classList.add('side-open');
    this.els.ptitle.textContent = PANEL_TITLE[id];
    for (const b of this.els.game.querySelectorAll<HTMLElement>('[data-panel]')) b.classList.toggle('on', b.dataset.panel === id);
    this.refreshPanel(true);
  }

  closePanel(): void {
    this.panel = null;
    this.els.game?.classList.remove('side-open');
    for (const b of this.els.game?.querySelectorAll<HTMLElement>('[data-panel]') ?? []) b.classList.remove('on');
  }

  refreshPanel(reset = false): void {
    if (!this.panel) return;
    const body = this.els.pbody;
    const top = reset ? 0 : body.scrollTop;
    body.replaceChildren(renderPanel(this, this.panel));
    body.scrollTop = top;
  }

  highlight(species: number): void {
    this.renderer.selectedSpecies = species;
    this.refreshPanel();
  }

  followSpecies(species: number): void {
    const s = this.world.s;
    for (let i = 0; i < s.alive.length; i++) if (s.alive[i] && s.species[i] === species) {
      this.followCreature(i, Math.max(this.renderer.z, 1.2));
      this.openPanel('creature');
      return;
    }
  }

  followCreature(i: number, zoom?: number): void {
    const r = this.renderer;
    r.follow = i;
    r.followUid = this.world.s.uid[i];
    if (zoom) r.z = zoom;
    r.clamp();
  }

  unfollow(): void {
    this.renderer.follow = -1;
    this.refreshPanel();
  }

  lookAt(x: number, y: number): void {
    const r = this.renderer;
    r.follow = -1;
    r.cx = x;
    r.cy = y;
    r.z = Math.max(r.z, 0.9);
    r.clamp();
  }

  // --- Input ----------------------------------------------------------------------------------------

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
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
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
        this.renderer.pan(mx - this.pinch.mx, my - this.pinch.my);
        if (this.pinch.d > 10) this.renderer.zoomAt(mx, my, d / this.pinch.d);
        this.pinch = { d, mx, my };
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
      const [x, y] = this.renderer.toWorld(d.x, d.y);
      this.tap(x, y);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
      this.pinch = null;
      this.drag = null;
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.004));
    }, { passive: false });
  }

  private tap(x: number, y: number): void {
    const w = this.world;
    if (this.tool === 'watch') {
      const i = w.nearest(x, y, 40 / this.renderer.z);
      if (i >= 0) {
        this.followCreature(i);
        this.openPanel('creature');
      }
      return;
    }
    const tool = this.tool;
    const name = w.power(tool, x, y);
    if (this.tool === 'grazer' || this.tool === 'hunter') this.toast(`Released: ${name}.`);
    if (this.tool === 'meteor') this.pickTool('watch');
  }

  private onKey(e: KeyboardEvent): void {
    if (this.titleMode || (e.target as HTMLElement)?.tagName === 'INPUT' || this.root.querySelector('.pr-modal')) return;
    if (e.key === ' ') {
      e.preventDefault();
      this.setSpeed(this.speed ? 0 : 2);
    } else if (e.key >= '1' && e.key <= '4') this.setSpeed(+e.key);
    else if (e.key === 'Escape') {
      this.pickTool('watch');
      this.closePanel();
    }
  }

  // --- Dialogs, toasts, saving ---------------------------------------------------------------------------

  toast(text: string): void {
    const host = this.els.toasts;
    for (const t of host.children) if (t.textContent === text) return;
    const el = h('div', { class: 'pr-toast', role: 'status' }, text);
    host.append(el);
    while (host.children.length > 3) host.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 4500);
    setTimeout(() => el.remove(), 5000);
  }

  private modal(title: string, body: HTMLElement): () => void {
    const close = () => el.remove();
    const el = h('div', { class: 'pr-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: (e: Event) => e.target === el && close() },
      h('div', { class: 'pr-card' }, h('div', { class: 'pr-cardhead' }, h('h2', null, title), h('button', { class: 'pr-iconbtn', 'aria-label': 'Close', onclick: close }, gi('u-close'))), body));
    this.root.append(el);
    return close;
  }

  private menu(): void {
    const w = this.world;
    const item = (label: string, fn: () => void) => h('button', { class: 'pr-btn', onclick: () => { close(); fn(); } }, label);
    const close = this.modal('Menu', h('div', { class: 'pr-menu' },
      h('p', { class: 'pr-hint' }, `${worldSummary(w)} · seed “${w.s.seed}”`),
      item('Save', () => void this.save().then(() => this.toast('Saved.'))),
      item('Export to a file', () => download(`primordial-year-${w.year}.json`, toJson(w.s))),
      item('Import a file', () => void this.importFile()),
      item('New world', () => this.newWorld()),
      item('How to play', () => this.help()),
      item('Credits', () => this.credits()),
      item('Title screen', () => { this.saveNow(); this.title(); }),
    ));
  }

  private async importFile(): Promise<void> {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const st = fromJson<WorldState>(await f.text());
      if (!st?.alive || !st.speciesList) throw new Error('bad');
      this.play(new World(st));
    } catch {
      this.toast('That file is not a Primordial save.');
    }
  }

  help(): void {
    this.modal('How to play', h('div', { class: 'pr-help' },
      h('p', null, 'Every creature carries a genome: size, speed, senses, diet, aggression, sociality, caution, fertility, lifespan, heat preference, color and how fast it mutates. Creatures eat, flee, hunt and breed. Children inherit their parent\'s genome with small mutations, and nature does the selecting.'),
      h('p', null, 'When a lineage drifts far enough from its ancestors it becomes a new species, with its own name and a branch in the tree of life.'),
      h('h4', null, 'Your powers'),
      h('ul', null, ...TOOLS.map((t) => h('li', null, h('b', null, t.label), ` — ${t.note}`))),
      h('h4', null, 'Watching'),
      h('ul', null,
        h('li', null, 'Drag to pan, scroll or pinch to zoom. Tap a creature to follow it and read its genome.'),
        h('li', null, 'The north is cold and the south is hot. Plants glow green; carrion shows rust-red.'),
        h('li', null, 'AUTO hands the powers to a director who plays god and keeps the camera on the action.'),
        h('li', null, 'Keys: Space pause, 1–4 speed, Esc stop using a power.'),
      ),
    ));
  }

  private credits(): void {
    this.modal('Credits', h('div', { class: 'pr-help' },
      h('p', null, 'Primordial, an evolution sandbox for this site. The sea, its creatures and their names are generated in your browser.'),
      h('h4', null, 'Icons'),
      h('p', null, 'From ', h('a', { href: 'https://game-icons.net', target: '_blank', rel: 'noopener' }, 'game-icons.net'), ', licensed ', h('a', { href: 'https://creativecommons.org/licenses/by/3.0/', target: '_blank', rel: 'noopener' }, 'CC BY 3.0'), ':'),
      ...icons.credits().map((c) => h('p', { class: 'pr-credit' }, c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.author) : c.author, ': ', ...c.icons.flatMap((ic, k) => [k ? ', ' : '', h('a', { href: ic.href, target: '_blank', rel: 'noopener' }, ic.name)]))),
      h('h4', null, 'Typefaces'),
      h('p', null, 'Inter and JetBrains Mono, SIL Open Font License.'),
    ));
  }

  private async save(): Promise<void> {
    if (this.titleMode || !this.world) return;
    try {
      await store.save({ key: 'auto', label: 'Autosave', title: 'Primordial', subtitle: `year ${compact(this.world.year)}, ${this.world.living().filter((sp) => sp.count >= 3).length} species` }, toJson(this.world.s));
    } catch {
      /* storage unavailable */
    }
  }

  saveNow(): void {
    if (this.titleMode || !this.world) return;
    try {
      store.saveSync({ key: 'auto', label: 'Autosave', title: 'Primordial', subtitle: `year ${compact(this.world.year)}, ${this.world.living().filter((sp) => sp.count >= 3).length} species` }, toJson(this.world.s));
    } catch {
      /* storage unavailable */
    }
  }

  /** Testing aid: run the world forward quickly. */
  debugRun(seconds: number): void {
    for (let k = 0; k < seconds / DT; k++) this.world.step(DT);
  }
}
