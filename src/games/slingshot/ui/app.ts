import { h, persist, store } from '../../shared/dom';
import { icons, type IconKey } from '../art';
import { Renderer, type Particle, type Scene } from '../render/renderer';
import { solve, type Plan } from '../sim/autopilot';
import { levelForAsync } from '../sim/levels';
import { DT, launch, predict, Sim, type Level, type Outcome, type Probe, type Trajectory } from '../sim/physics';

// Slingshot: aim by dragging back from your planet, watch the predicted path,
// let go. During flight, hold to fire the engine toward your finger.

type Mode = 'title' | 'loading' | 'aim' | 'fly' | 'result';

interface Progress {
  unlocked: number;
  stars: Record<number, number>;
}

const SPEEDS = [1, 2, 4];
const THRUST = 70;

function gi(key: IconKey): HTMLElement {
  return h('span', { class: 'sl-gi', html: icons.svg(key) });
}

export class App {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  renderer: Renderer | null = null;
  level: Level | null = null;
  mode: Mode = 'title';
  /** Sim time while aiming (time is frozen until Wait or launch). */
  t = 0;
  probe: Probe | null = null;
  sim: Sim | null = null;
  trail: number[] = [];
  preview: Trajectory | null = null;
  aim: { angle: number; power: number } | null = null;
  collected: boolean[] = [];
  particles: Particle[] = [];
  thrust: [number, number] | null = null;
  outcome: Outcome | null = null;
  speed = 1;
  auto = false;
  progress: Progress = store<Progress>('slingshot:progress', { unlocked: 1, stars: {} });
  private els: Record<string, HTMLElement> = {};
  private last = 0;
  private waitAnim: { from: number; to: number; t0: number; ms: number } | null = null;
  private pointer: { id: number; x: number; y: number } | null = null;
  private dragFrom: { x: number; y: number } | null = null;
  private previewDirty = false;
  private autoTimer = 0;
  private autoAnim: { plan: Plan; t0: number; phase: 'wait' | 'aim' } | null = null;
  private resultTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('sl');
    this.canvas = h('canvas', { class: 'sl-canvas', 'aria-label': 'Star system' });
    this.buildDom();
    window.addEventListener('keydown', (e) => this.onKey(e));
    new ResizeObserver(() => this.renderer?.resize()).observe(this.canvas);
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      this.tick(now);
    };
    requestAnimationFrame(loop);
    void this.title();
  }

  // --- DOM ------------------------------------------------------------------------------

  private buildDom(): void {
    const iconBtn = (key: IconKey, label: string, fn: () => void, k?: string) => h('button', { class: 'sl-iconbtn', title: label, 'aria-label': label, 'data-k': k, onclick: fn }, gi(key));
    const top = h('header', { class: 'sl-top' },
      h('button', { class: 'sl-brand', onclick: () => void this.title() }, h('b', null, 'SLINGSHOT'), h('span', { 'data-k': 'lvl' })),
      h('div', { class: 'sl-stars', title: 'Stars collected' }, gi('u-star'), h('b', { 'data-k': 'stars' })),
      h('div', { class: 'sl-fuel', title: 'Engine fuel' }, gi('u-fuel'), h('span', { class: 'sl-fuelbar' }, h('i', { 'data-k': 'fuel' }))),
      h('button', { class: 'sl-autobtn', 'data-k': 'auto', 'aria-pressed': 'false', title: 'Automatic mode: the autopilot flies', onclick: () => this.setAuto(!this.auto) }, 'AUTO'),
      iconBtn('u-levels', 'Levels', () => this.levelSelect()),
      iconBtn('u-menu', 'Menu', () => this.menu()),
    );
    const controls = h('div', { class: 'sl-controls' },
      h('button', { class: 'sl-ctl', 'data-k': 'wait', onclick: () => this.wait() }, gi('u-wait'), h('span', null, 'Wait')),
      h('button', { class: 'sl-ctl', onclick: () => this.restart() }, gi('u-restart'), h('span', null, 'Restart')),
      h('button', { class: 'sl-ctl', 'data-k': 'speed', onclick: () => this.cycleSpeed() }, gi('u-fast'), h('span', { 'data-k': 'speedlbl' }, '1×')),
    );
    const game = h('div', { class: 'sl-game' },
      this.canvas, top,
      h('div', { class: 'sl-readout', 'data-k': 'readout' }),
      h('div', { class: 'sl-tip', 'data-k': 'tip' }),
      controls,
      h('div', { class: 'sl-overlay', 'data-k': 'overlay' }),
    );
    this.root.append(game);
    this.els.game = game;
    for (const el of game.querySelectorAll<HTMLElement>('[data-k]')) this.els[el.dataset.k!] = el;
    this.bindInput();
  }

  private hud(): void {
    const L = this.level;
    const total = Object.values(this.progress.stars).reduce((a, b) => a + b, 0);
    this.els.stars.textContent = String(total);
    this.els.lvl.textContent = L && this.mode !== 'title' ? `Level ${L.index} · ${L.name}` : '';
    const fuel = this.probe ? this.probe.fuel : L ? L.fuel : 0;
    this.els.fuel.style.width = L ? `${(fuel / L.fuel) * 100}%` : '0%';
    const a = this.els.auto;
    a.classList.toggle('on', this.auto);
    a.setAttribute('aria-pressed', String(this.auto));
    this.els.speedlbl.textContent = `${SPEEDS[this.speed]}×`;
    (this.els.wait as HTMLButtonElement).disabled = this.mode !== 'aim' || this.auto;
    this.els.game.classList.toggle('titling', this.mode === 'title');
    this.els.game.classList.toggle('flying', this.mode === 'fly');
  }

  // --- Levels ----------------------------------------------------------------------------

  async play(index: number): Promise<void> {
    clearTimeout(this.resultTimer);
    this.mode = 'loading';
    this.els.overlay.replaceChildren(h('div', { class: 'sl-card small' }, h('p', null, `Charting level ${index}…`)));
    this.els.game.classList.add('overlay-on');
    const level = await levelForAsync(index);
    this.level = level;
    if (!this.renderer) {
      this.renderer = new Renderer(this.canvas, level);
      this.renderer.resize();
    } else this.renderer.setLevel(level);
    this.closeOverlay();
    this.resetLevel();
    persist('slingshot:last', index);
    // Chart the next system while this one is being played.
    setTimeout(() => void levelForAsync(index + 1), 1500);
  }

  private resetLevel(): void {
    const L = this.level!;
    this.mode = 'aim';
    this.t = 0;
    this.probe = null;
    this.sim = null;
    this.trail = [];
    this.preview = null;
    this.aim = null;
    this.thrust = null;
    this.outcome = null;
    this.collected = L.beacons.map(() => false);
    this.particles = [];
    this.waitAnim = null;
    this.els.tip.textContent = L.tip ?? (L.beacons.length ? `Reach the target. ${L.beacons.length} beacon${L.beacons.length > 1 ? 's' : ''} to collect.` : 'Reach the target.');
    this.els.readout.textContent = '';
    this.hud();
    if (this.auto) this.scheduleAuto(700);
  }

  restart(): void {
    if (!this.level || this.mode === 'loading' || this.mode === 'title') return;
    this.closeOverlay();
    this.resetLevel();
  }

  wait(): void {
    if (this.mode !== 'aim' || this.waitAnim) return;
    this.waitAnim = { from: this.t, to: this.t + 1.5, t0: performance.now(), ms: 450 };
  }

  cycleSpeed(): void {
    this.speed = (this.speed + 1) % SPEEDS.length;
    this.hud();
  }

  private doLaunch(angle: number, power: number): void {
    const L = this.level!;
    if (power < 0.06) return;
    this.probe = launch(L, this.t, angle, power * L.launchMax);
    this.sim = new Sim(L);
    this.trail = [this.probe.x, this.probe.y];
    this.mode = 'fly';
    this.aim = null;
    this.preview = null;
    this.els.readout.textContent = '';
    this.els.tip.textContent = this.auto ? 'Autopilot engaged.' : 'Hold anywhere to fire the engine toward your finger.';
    this.hud();
  }

  private finish(o: Outcome): void {
    const L = this.level!;
    this.outcome = o;
    this.mode = 'result';
    const p = this.probe!;
    const ok = o.kind === 'captured' || o.kind === 'landed';
    const burst = (n: number, color: string, speed: number) => {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random());
        this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
      }
    };
    if (ok) burst(40, '#7dffb3', 50);
    else if (o.kind === 'crashed') burst(60, '#ffb35e', 70);
    let stars = 0;
    const beacons = this.collected.filter(Boolean).length;
    const fuelUsed = 1 - p.fuel / L.fuel;
    if (ok) {
      stars = 1 + (beacons === L.beacons.length ? 1 : 0) + (fuelUsed <= 0.5 ? 1 : 0);
      this.progress.stars[L.index] = Math.max(this.progress.stars[L.index] ?? 0, stars);
      this.progress.unlocked = Math.max(this.progress.unlocked, L.index + 1);
      persist('slingshot:progress', this.progress);
    }
    this.hud();
    this.resultTimer = window.setTimeout(() => this.showResult(o, stars, beacons, fuelUsed), 900);
  }

  private showResult(o: Outcome, stars: number, beacons: number, fuelUsed: number): void {
    const L = this.level!;
    const ok = o.kind === 'captured' || o.kind === 'landed';
    const title = o.kind === 'captured' ? 'Orbit achieved!' : o.kind === 'landed' ? 'Touchdown!' : o.kind === 'crashed' ? `Crashed into ${L.bodies[o.body].name === 'Rock' ? 'a rock' : L.bodies[o.body].name}` : 'Lost in space';
    const btns: HTMLElement[] = [];
    if (ok) btns.push(h('button', { class: 'sl-btn primary', onclick: () => void this.play(L.index + 1) }, gi('u-next'), 'Next level'));
    btns.push(h('button', { class: `sl-btn ${ok ? '' : 'primary'}`, onclick: () => this.restart() }, gi('u-restart'), 'Retry'));
    if (!ok) btns.push(h('button', { class: 'sl-btn', onclick: () => { this.restart(); this.showMe(); } }, gi('u-auto'), 'Show me'));
    this.els.overlay.replaceChildren(h('div', { class: `sl-card ${ok ? 'win' : 'lose'}` },
      h('h2', null, title),
      ok ? h('div', { class: 'sl-starrow' }, ...[0, 1, 2].map((k) => h('span', { class: k < stars ? 'on' : '' }, gi('u-star')))) : null,
      h('p', null, ok
        ? `Beacons ${beacons}/${L.beacons.length} · fuel used ${Math.round(fuelUsed * 100)}%`
        : o.kind === 'lost' ? 'The probe drifted beyond reach. Try a different angle, or Wait for a better window.' : 'Watch the dotted line: it shows exactly where the probe will go.'),
      ok ? h('p', { class: 'sl-hint' }, '★ reach the target · ★ every beacon · ★ use under half the fuel') : null,
      h('div', { class: 'sl-actions' }, ...btns),
    ));
    this.els.game.classList.add('overlay-on');
    if (this.auto) this.resultTimer = window.setTimeout(() => (ok ? void this.play(L.index + 1) : this.restart()), 2200);
  }

  private closeOverlay(): void {
    this.els.overlay.replaceChildren();
    this.els.game.classList.remove('overlay-on');
  }

  // --- Autopilot -------------------------------------------------------------------------

  setAuto(on: boolean): void {
    this.auto = on;
    clearTimeout(this.autoTimer);
    this.autoAnim = null;
    this.hud();
    if (on) {
      if (this.mode === 'title') void this.play(Math.max(1, store<number>('slingshot:last', 1)));
      else if (this.mode === 'aim') this.scheduleAuto(300);
      else if (this.mode === 'result') this.restart();
    }
  }

  private scheduleAuto(ms: number): void {
    clearTimeout(this.autoTimer);
    this.autoTimer = window.setTimeout(() => this.autoplan(), ms);
  }

  /** Let the autopilot solve the current level from the current moment. */
  showMe(): void {
    this.scheduleAuto(200);
    this.showMeOnce = true;
  }

  private showMeOnce = false;

  private autoplan(): void {
    if ((!this.auto && !this.showMeOnce) || this.mode !== 'aim' || !this.level) return;
    this.showMeOnce = false;
    const L = this.level;
    this.els.tip.textContent = 'Autopilot computing…';
    // Yield a frame so the message shows, then search.
    setTimeout(() => {
      if (this.mode !== 'aim') return;
      let plan = solve(L, { t0: this.t, budgetMs: 450, wantBeacons: true });
      const known = L.solution && this.t === 0 ? L.solution : null;
      if (known && (!plan || plan.traj.beacons < L.beacons.length)) {
        const tr = predict(L, launch(L, known.wait, known.angle, known.speed), Math.ceil(L.maxTime * 240), 8);
        plan = { ...known, score: 0, traj: tr };
      }
      if (!plan) {
        this.els.tip.textContent = 'The autopilot found no route from here. Restarting.';
        this.restart();
        return;
      }
      this.els.tip.textContent = plan.wait > 0.05 ? `Autopilot: waiting ${plan.wait.toFixed(1)} s for the launch window.` : 'Autopilot: aiming.';
      this.autoAnim = { plan, t0: performance.now(), phase: plan.wait > 0.05 ? 'wait' : 'aim' };
      if (plan.wait > 0.05) this.waitAnim = { from: this.t, to: this.t + plan.wait, t0: performance.now(), ms: Math.min(1600, 300 + plan.wait * 120) };
    }, 40);
  }

  // --- Loop ------------------------------------------------------------------------------

  private tick(now: number): void {
    const r = this.renderer;
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    if (!r || !this.level) return;
    if (this.mode === 'title') this.t += dt * 0.6;
    if (this.waitAnim) {
      const w = this.waitAnim;
      const k = Math.min(1, (now - w.t0) / w.ms);
      this.t = w.from + (w.to - w.from) * (1 - (1 - k) * (1 - k));
      this.previewDirty = true;
      if (k >= 1) {
        this.waitAnim = null;
        if (this.autoAnim?.phase === 'wait') {
          this.autoAnim.phase = 'aim';
          this.autoAnim.t0 = now;
        }
      }
    }
    // Autopilot aiming animation, then launch.
    if (this.autoAnim && this.autoAnim.phase === 'aim' && !this.waitAnim && this.mode === 'aim') {
      const p = this.autoAnim.plan;
      const k = Math.min(1, (now - this.autoAnim.t0) / 900);
      this.aim = { angle: p.angle, power: (p.speed / this.level.launchMax) * k };
      this.previewDirty = true;
      if (k >= 1) {
        this.autoAnim = null;
        this.updatePreview();
        this.doLaunch(p.angle, p.speed / this.level.launchMax);
      }
    }
    if (this.mode === 'fly' && this.probe && this.sim) this.fly(dt);
    if (this.previewDirty && this.mode === 'aim') this.updatePreview();
    for (const q of this.particles) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.life -= dt * 0.8;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    const scene: Scene = {
      t: this.mode === 'fly' || this.mode === 'result' ? (this.probe?.t ?? this.t) : this.t,
      probe: this.probe,
      trail: this.trail,
      preview: this.mode === 'aim' ? this.preview : null,
      aim: this.mode === 'aim' ? this.aim : null,
      pull: this.mode === 'aim' && this.dragFrom && this.pointer ? r.toWorld(this.pointer.x, this.pointer.y) : null,
      collected: this.collected,
      thrust: this.thrust,
      particles: this.particles,
      done: this.outcome ? (this.outcome.kind === 'flying' ? null : this.outcome.kind) : null,
    };
    r.frame(scene, now);
    if (this.mode === 'fly') this.hudFuel();
  }

  private hudFuel(): void {
    if (this.probe && this.level) this.els.fuel.style.width = `${(this.probe.fuel / this.level.fuel) * 100}%`;
  }

  private fly(dt: number): void {
    const p = this.probe!;
    const sim = this.sim!;
    const steps = Math.min(64, Math.round((dt * SPEEDS[this.speed]) / DT));
    // Engine: toward the finger, if held (not under autopilot).
    this.thrust = null;
    if (this.pointer && !this.auto && p.fuel > 0) {
      const [px, py] = this.renderer!.toScreen(p.x, p.y);
      const dx = this.pointer.x - px;
      const dy = this.pointer.y - py;
      const d = Math.hypot(dx, dy);
      if (d > 8) this.thrust = [(dx / d) * THRUST, (dy / d) * THRUST];
    }
    for (let k = 0; k < steps; k++) {
      const o = sim.step(p, this.thrust, this.collected);
      if (k % 3 === 0) {
        this.trail.push(p.x, p.y);
        if (this.trail.length > 8000) this.trail.splice(0, 2);
      }
      if (o.kind !== 'flying') {
        this.thrust = null;
        this.finish(o);
        return;
      }
    }
  }

  private updatePreview(): void {
    this.previewDirty = false;
    if (!this.aim || !this.level || this.aim.power < 0.06) {
      this.preview = null;
      return;
    }
    const L = this.level;
    const p = launch(L, this.t, this.aim.angle, this.aim.power * L.launchMax);
    p.fuel = 0;
    this.preview = predict(L, p, Math.ceil(L.maxTime * 240), 6);
    const deg = Math.round((((this.aim.angle * 180) / Math.PI) % 360 + 360) % 360);
    const kind = this.preview.outcome.kind;
    const verdict = kind === 'captured' ? 'reaches orbit' : kind === 'landed' ? 'lands on the target' : kind === 'crashed' ? 'crashes' : 'misses';
    this.els.readout.textContent = `Angle ${deg}° · power ${Math.round(this.aim.power * 100)}% · ${verdict}${this.preview.beacons ? ` · ${this.preview.beacons} beacon${this.preview.beacons > 1 ? 's' : ''}` : ''}`;
    this.els.readout.className = `sl-readout ${kind === 'captured' || kind === 'landed' ? 'good' : ''}`;
  }

  // --- Input ------------------------------------------------------------------------------

  private pos(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private bindInput(): void {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const p = this.pos(e);
      this.pointer = { id: e.pointerId, ...p };
      if (this.mode === 'aim' && !this.auto && !this.autoAnim) {
        this.dragFrom = p;
        this.aimAt(p.x, p.y);
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.pointer || this.pointer.id !== e.pointerId) return;
      const p = this.pos(e);
      this.pointer = { id: e.pointerId, ...p };
      if (this.mode === 'aim' && this.dragFrom) this.aimAt(p.x, p.y);
    });
    const up = (e: PointerEvent) => {
      if (!this.pointer || this.pointer.id !== e.pointerId) return;
      this.pointer = null;
      if (this.mode === 'aim' && this.dragFrom && this.aim) {
        const moved = Math.hypot(this.pos(e).x - this.dragFrom.x, this.pos(e).y - this.dragFrom.y) > 12;
        if (moved) this.doLaunch(this.aim.angle, this.aim.power);
      }
      this.dragFrom = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => {
      if (this.pointer?.id === e.pointerId) this.pointer = null;
      this.dragFrom = null;
    });
  }

  /** Slingshot aiming: pull back from the home planet; the probe flies the other way. */
  private aimAt(sx: number, sy: number): void {
    const r = this.renderer!;
    const L = this.level!;
    const [hx, hy] = r.bodyAt(L.home, this.t);
    const [px, py] = r.toScreen(hx, hy);
    const dx = px - sx;
    const dy = py - sy;
    const d = Math.hypot(dx, dy);
    const full = Math.min(r.W, r.H) * 0.32;
    this.aim = { angle: Math.atan2(dy, dx), power: Math.min(1, d / full) };
    this.previewDirty = true;
  }

  private onKey(e: KeyboardEvent): void {
    if (document.querySelector('.sl-modal')) {
      if (e.key === 'Escape') document.querySelector('.sl-modal')?.remove();
      return;
    }
    if (this.mode === 'aim' && !this.auto) {
      const step = e.shiftKey ? 0.002 : 0.02;
      const a = this.aim ?? { angle: 0, power: 0.5 };
      if (e.key === 'ArrowLeft') this.aim = { ...a, angle: a.angle - step * 3 };
      else if (e.key === 'ArrowRight') this.aim = { ...a, angle: a.angle + step * 3 };
      else if (e.key === 'ArrowUp') this.aim = { ...a, power: Math.min(1, a.power + step) };
      else if (e.key === 'ArrowDown') this.aim = { ...a, power: Math.max(0, a.power - step) };
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (this.aim) this.doLaunch(this.aim.angle, this.aim.power);
        return;
      } else if (e.key === 'w') this.wait();
      else return;
      this.previewDirty = true;
    } else if (e.key === 'r') this.restart();
  }

  // --- Screens -------------------------------------------------------------------------------

  async title(): Promise<void> {
    clearTimeout(this.resultTimer);
    this.setAuto(false);
    this.mode = 'title';
    const level = await levelForAsync(1);
    this.level = level;
    if (!this.renderer) {
      this.renderer = new Renderer(this.canvas, level);
      this.renderer.resize();
    } else this.renderer.setLevel(level);
    this.probe = null;
    this.trail = [];
    this.preview = null;
    this.aim = null;
    this.outcome = null;
    this.collected = level.beacons.map(() => false);
    const last = Math.min(this.progress.unlocked, Math.max(1, store<number>('slingshot:last', 1)));
    const total = Object.values(this.progress.stars).reduce((a, b) => a + b, 0);
    this.els.overlay.replaceChildren(h('div', { class: 'sl-card title' },
      h('h1', null, 'SLINGSHOT'),
      h('p', { class: 'sl-tag' }, 'Fling probes through living star systems. Bend your path around planets, twin suns and black holes to reach the target.'),
      h('div', { class: 'sl-actions col' },
        h('button', { class: 'sl-btn primary', onclick: () => void this.play(last) }, gi('u-rocket'), last > 1 ? `Continue: level ${last}` : 'Play'),
        h('button', { class: 'sl-btn', onclick: () => this.levelSelect() }, gi('u-levels'), `Levels${total ? ` · ${total} ★` : ''}`),
        h('button', { class: 'sl-btn', onclick: () => this.setAuto(true) }, gi('u-auto'), 'Watch the autopilot'),
        h('button', { class: 'sl-btn', onclick: () => this.help() }, 'How to play'),
      ),
      h('footer', null,
        h('a', { href: '/games', 'data-astro-reload': true }, '← All games'),
        h('span', null, 'Icons: ', h('a', { href: 'https://game-icons.net', target: '_blank', rel: 'noopener' }, 'game-icons.net'), ' (CC BY 3.0)'),
        h('button', { class: 'sl-linkbtn', onclick: () => this.credits() }, 'Credits'),
      ),
    ));
    this.els.game.classList.add('overlay-on');
    this.hud();
  }

  private modal(title: string, body: HTMLElement): () => void {
    const close = () => el.remove();
    const el = h('div', { class: 'sl-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: (e: Event) => e.target === el && close() },
      h('div', { class: 'sl-card dialog' }, h('div', { class: 'sl-cardhead' }, h('h2', null, title), h('button', { class: 'sl-iconbtn', 'aria-label': 'Close', onclick: close }, gi('u-close'))), body));
    this.root.append(el);
    return close;
  }

  levelSelect(): void {
    const max = Math.max(this.progress.unlocked, 1);
    const shown = Math.max(30, max + 2);
    const close = this.modal('Levels', h('div', { class: 'sl-levels' },
      ...Array.from({ length: shown }, (_, k) => {
        const i = k + 1;
        const locked = i > max;
        const st = this.progress.stars[i] ?? 0;
        return h('button', { class: `sl-level ${locked ? 'locked' : ''}`, disabled: locked, onclick: () => { close(); this.setAuto(false); void this.play(i); } },
          h('b', null, String(i)),
          h('span', null, locked ? '—' : '★'.repeat(st) + '☆'.repeat(3 - st)));
      }),
    ));
  }

  private menu(): void {
    const item = (label: string, fn: () => void) => h('button', { class: 'sl-btn', onclick: () => { close(); fn(); } }, label);
    const close = this.modal('Menu', h('div', { class: 'sl-actions col' },
      item('Levels', () => this.levelSelect()),
      item('How to play', () => this.help()),
      item('Credits', () => this.credits()),
      item('Title screen', () => void this.title()),
    ));
  }

  help(): void {
    this.modal('How to play', h('div', { class: 'sl-help' },
      h('p', null, 'Get the probe from your home planet into orbit around the target.'),
      h('ul', null,
        h('li', null, h('b', null, 'Aim: '), 'press anywhere and pull back from your planet, like a slingshot. The further you pull, the faster the launch. The dotted line shows exactly where the probe will go.'),
        h('li', null, h('b', null, 'Wait: '), 'everything orbits. Waiting changes the alignment and opens new launch windows.'),
        h('li', null, h('b', null, 'Fly: '), 'hold anywhere during flight to fire the engine toward your finger. Fuel is limited.'),
        h('li', null, h('b', null, 'Win: '), 'arrive inside the green ring slowly enough to be captured, or touch down on the target.'),
        h('li', null, h('b', null, 'Stars: '), 'one for arriving, one for collecting every beacon, one for using less than half the fuel.'),
        h('li', null, h('b', null, 'Gravity assists: '), 'passing behind a planet steals some of its speed; in front of it, you lose some.'),
        h('li', null, h('b', null, 'AUTO: '), 'the autopilot simulates hundreds of launches and flies the best one. "Show me" asks it once.'),
        h('li', null, h('b', null, 'Keys: '), 'arrows aim, Shift for fine control, Space or Enter launch, W wait, R restart.'),
      ),
    ));
  }

  credits(): void {
    this.modal('Credits', h('div', { class: 'sl-help' },
      h('p', null, 'Slingshot, a gravity puzzle for this site. Every star system is generated, and solved by the autopilot, in your browser.'),
      h('h4', null, 'Icons'),
      h('p', null, 'From ', h('a', { href: 'https://game-icons.net', target: '_blank', rel: 'noopener' }, 'game-icons.net'), ', licensed ', h('a', { href: 'https://creativecommons.org/licenses/by/3.0/', target: '_blank', rel: 'noopener' }, 'CC BY 3.0'), ':'),
      ...icons.credits().map((c) => h('p', { class: 'sl-credit' }, c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.author) : c.author, ': ', ...c.icons.flatMap((ic, k) => [k ? ', ' : '', h('a', { href: ic.href, target: '_blank', rel: 'noopener' }, ic.name)]))),
      h('h4', null, 'Typefaces'),
      h('p', null, 'Inter and JetBrains Mono, SIL Open Font License.'),
    ));
  }
}
