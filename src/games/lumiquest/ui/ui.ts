// The UI: overlay layers above the canvas, the in-world HUD, toasts and
// banners, and the panel stack. Screens (menus, creation), panels (map,
// collection, inventory, journal, shop, settings) and dialogs (dialogue,
// resonance, notes) live in their own modules and render into these layers.

import { ITEM_BY_ID } from '../data/items';
import { ABILITIES, ELEMENT_COLOR, ELEMENT_NAME, SPECIES_BY_ID, variantName } from '../data/species';
import { LOCATIONS } from '../data/world';
import type { Creature } from '../entities/creature';
import type { Game } from '../game';
import { keyLabel } from '../engine/input';
import { RESONATE_TRUST, bestFood, canResonate, preference } from '../systems/bonding';
import { QUEST_BY_ID } from '../systems/quests';
import { clockLabel, day, hourOfDay } from '../systems/state';
import type { Tree } from '../data/dialogue';
import { el, h, html, portrait } from './kit';
import { icon } from './icons';
import { MapView } from './map';
import * as screens from './screens';
import * as panels from './panels';
import * as dialogs from './dialogs';
import { TouchControls } from './touch';

export class UI {
  readonly layer: HTMLElement;
  readonly screen: HTMLElement;
  readonly hudEl: HTMLElement;
  readonly panels: HTMLElement;
  readonly toasts: HTMLElement;
  private loadingEl: HTMLElement | null = null;
  private stack: { name: string; el: HTMLElement; onClose?: () => void }[] = [];
  private hudParts: Record<string, HTMLElement> = {};
  map: MapView | null = null;
  private hudTick = 0;
  private touch: TouchControls | null = null;
  /** Screen-specific Escape handler (creation flow). */
  backHandler: (() => void) | null = null;
  menuKeyHandler: ((e: KeyboardEvent) => boolean | void) | null = null;
  private lastPrompt = '';
  private lastCreaturePanel = '';

  constructor(readonly game: Game, readonly root: HTMLElement) {
    root.classList.add('lq-root');
    this.layer = el('div', 'lq-layer');
    this.screen = el('div', 'lq-screen');
    this.hudEl = el('div', 'lq-hud');
    this.hudEl.hidden = true;
    this.panels = el('div', 'lq-panels');
    this.toasts = el('div', 'lq-toasts');
    this.toasts.setAttribute('aria-live', 'polite');
    this.layer.append(this.hudEl, this.screen, this.panels, this.toasts);
    root.append(this.layer);
  }

  // --- loading / error -------------------------------------------------------

  loading(p: number, label: string): void {
    if (!this.loadingEl) {
      this.loadingEl = html('lq-loading', `
        <div class="lq-loading-inner">
          <div class="lq-logo"><span class="lq-logo-main">LumiQuest</span><span class="lq-logo-sub">Explore • Befriend • Discover</span></div>
          <div class="lq-progress"><div class="lq-progress-fill"></div></div>
          <p class="lq-loading-label"></p>
          <p class="lq-loading-tip">Tip: crouch and move slowly — shy creatures trust a quiet approach.</p>
        </div>`);
      this.root.append(this.loadingEl);
    }
    (this.loadingEl.querySelector('.lq-progress-fill') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    (this.loadingEl.querySelector('.lq-loading-label') as HTMLElement).textContent = label;
    if (p >= 1) {
      const l = this.loadingEl;
      this.loadingEl = null;
      l.classList.add('is-done');
      setTimeout(() => l.remove(), 700);
    }
  }

  error(message: string, detail: string): void {
    this.loadingEl?.remove();
    this.loadingEl = null;
    const e = html('lq-error', `
      <div class="lq-panel lq-error-card">
        <h2>Something went wrong</h2>
        <p>${message}</p>
        <p class="lq-muted">LumiQuest needs WebGL 2. Try another browser, update your graphics drivers, or enable hardware acceleration.</p>
        <pre class="lq-error-detail"></pre>
      </div>`);
    (e.querySelector('.lq-error-detail') as HTMLElement).textContent = detail;
    const card = e.querySelector('.lq-error-card') as HTMLElement;
    const row = el('div', 'lq-row');
    const retry = h('button', { class: 'lq-btn lq-btn-primary', type: 'button' }, 'Try again');
    retry.addEventListener('click', () => location.reload());
    const home = h('a', { class: 'lq-btn', href: '/games' }, 'Back to games');
    row.append(retry, home);
    card.append(row);
    this.root.append(e);
  }

  // --- screens ---------------------------------------------------------------

  title(canContinue: boolean, warning?: string): void {
    this.hudEl.hidden = true;
    this.touch?.hide();
    this.closeAll();
    screens.title(this, canContinue, warning);
  }

  charSelect(): void {
    screens.charSelect(this);
  }

  customize(): void {
    screens.customize(this);
  }

  starter(): void {
    screens.starter(this);
  }

  back(): void {
    this.backHandler?.();
  }

  menuKey(e: KeyboardEvent): boolean | void {
    if (this.stack.length) return this.panelKey(e);
    return this.menuKeyHandler?.(e);
  }

  clearScreen(): void {
    this.screen.replaceChildren();
    this.screen.className = 'lq-screen';
    this.backHandler = null;
    this.menuKeyHandler = null;
  }

  introCard(on: boolean): void {
    let card = this.layer.querySelector('.lq-intro') as HTMLElement | null;
    if (on) {
      if (!card) {
        card = html('lq-intro', `<div class="lq-intro-sub">Lumeria</div><div class="lq-intro-title">Brightwater Vale</div><div class="lq-intro-skip">Press Esc to skip</div>`);
        card.addEventListener('click', () => this.game.skipCinematic());
        this.layer.append(card);
      }
    } else card?.remove();
  }

  // --- play ------------------------------------------------------------------

  enterPlay(): void {
    this.clearScreen();
    this.closeAll();
    this.buildHud();
    this.hudEl.hidden = false;
    if (this.game.input.touch) {
      this.touch ??= new TouchControls(this.game, this.layer);
      this.touch.show();
    }
  }

  private buildHud(): void {
    const g = this.game;
    this.hudEl.replaceChildren();
    const quest = html('lq-hud-quest', `<div class="lq-hud-quest-head">${icon('quest')}<span class="lq-hud-quest-title"></span></div><div class="lq-hud-quest-obj"></div><div class="lq-hud-quest-dist"></div>`);
    quest.addEventListener('click', () => this.openPanel('journal'));
    const compass = html('lq-compass', '<div class="lq-compass-strip"></div><div class="lq-compass-mark"></div><div class="lq-compass-tick"></div>');
    const mini = html('lq-minimap', '<canvas width="168" height="168"></canvas><span class="lq-minimap-n">N</span>');
    mini.addEventListener('click', () => this.openPanel('map'));
    const clock = html('lq-hud-clock', '<span class="lq-clock-ico"></span><span class="lq-clock-time"></span><span class="lq-clock-day"></span><span class="lq-hud-lumens"></span>');
    const comp = html('lq-hud-comp', '');
    comp.addEventListener('click', () => this.openPanel('collection'));
    const prompt = html('lq-prompt', '');
    const creature = html('lq-creature-panel', '');
    const cross = html('lq-cross', '<div class="lq-cross-dot"></div><svg class="lq-observe-ring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" /></svg>');
    const hot = el('div', 'lq-hotkeys');
    const b = g.settings.bindings;
    const chips: [string, string, string, () => void][] = [
      ['map', 'Map', keyLabel(b.map), () => this.openPanel('map')],
      ['paw', 'Creatures', keyLabel(b.collection), () => this.openPanel('collection')],
      ['book', 'Journal', keyLabel(b.journal), () => this.openPanel('journal')],
      ['bag', 'Bag', keyLabel(b.inventory), () => this.openPanel('inventory')],
      ['camera', 'View', keyLabel(b.view), () => g.toggleView()],
      ['pause', 'Menu', 'Esc', () => g.pause()],
    ];
    for (const [ic, label, key, fn] of chips) {
      const c = h('button', { class: 'lq-chip', type: 'button', title: `${label} (${key})`, 'aria-label': label });
      c.innerHTML = `${icon(ic)}<span class="lq-chip-label">${label}</span><kbd class="lq-kbd">${key}</kbd>`;
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      hot.append(c);
    }
    const auto = h('button', { class: 'lq-chip lq-auto', type: 'button', title: 'Automatic mode: an auto-ranger plays the main quest. Move to take over.' });
    auto.innerHTML = `${icon('spark')}<span class="lq-chip-label">AUTO</span>`;
    auto.addEventListener('click', (e) => {
      e.stopPropagation();
      g.startAuto(!g.auto);
    });
    hot.append(auto);
    const banner = el('div', 'lq-banner');
    const water = el('div', 'lq-underwater');
    const fps = el('div', 'lq-fps');
    const save = html('lq-save-ind', icon('check'));
    const autoLabel = el('div', 'lq-auto-label');
    this.hudEl.append(water, compass, quest, mini, clock, comp, cross, prompt, creature, hot, banner, fps, save, autoLabel);
    this.hudParts = { quest, compass, mini, clock, comp, prompt, creature, cross, banner, water, fps, save, auto, autoLabel };
    this.lastPrompt = '';
    this.lastCreaturePanel = '';
  }

  /** Per-frame HUD refresh (cheap parts every frame, heavy parts throttled). */
  hud(dt: number): void {
    const g = this.game;
    const s = g.state;
    const P = this.hudParts;
    if (!P.quest) return;
    this.hudEl.classList.toggle('is-cinematic', g.phase === 'intro');
    this.hudEl.classList.toggle('is-first', g.rig.mode === 'first');
    P.water.classList.toggle('is-on', g.world.sky.underwater);
    this.hudEl.classList.toggle('is-cave', g.world.caveFactor > 0.5);
    // crosshair and observe ring
    const ring = P.cross.querySelector('circle') as SVGCircleElement;
    const prog = g.observeProgress;
    ring.style.strokeDashoffset = `${113 * (1 - prog)}`;
    P.cross.classList.toggle('is-observing', prog > 0);
    P.cross.classList.toggle('is-target', !!g.target);
    this.prompt();
    this.creaturePanel();
    this.hudTick -= dt;
    if (this.hudTick > 0) return;
    this.hudTick = 0.2;
    // quest tracker
    const tracked = s.quests[s.tracked]?.status === 'active' ? s.tracked : Object.keys(s.quests).find((k) => s.quests[k].status === 'active');
    if (tracked) {
      const q = QUEST_BY_ID[tracked];
      P.quest.hidden = false;
      (P.quest.querySelector('.lq-hud-quest-title') as HTMLElement).textContent = q.title;
      (P.quest.querySelector('.lq-hud-quest-obj') as HTMLElement).textContent = g.quests.objective(tracked);
      const t = g.quests.target(tracked);
      const dEl = P.quest.querySelector('.lq-hud-quest-dist') as HTMLElement;
      if (t) dEl.textContent = `${Math.round(Math.hypot(t[0] - g.player.pos.x, t[1] - g.player.pos.z))} m`;
      else dEl.textContent = '';
    } else P.quest.hidden = true;
    // compass
    const yaw = g.rig.yaw;
    const strip = P.compass.querySelector('.lq-compass-strip') as HTMLElement;
    const deg = ((-yaw * 180) / Math.PI + 360) % 360;
    strip.style.backgroundPositionX = `${-deg * 2 + 150}px`;
    const mark = P.compass.querySelector('.lq-compass-mark') as HTMLElement;
    const qt = tracked ? g.quests.target(tracked) : null;
    if (qt) {
      const ang = Math.atan2(qt[0] - g.player.pos.x, -(qt[1] - g.player.pos.z));
      let rel = ((ang * 180) / Math.PI - deg + 540) % 360 - 180;
      rel = Math.max(-80, Math.min(80, rel));
      mark.style.transform = `translateX(${rel * 2}px)`;
      mark.hidden = false;
      mark.innerHTML = icon('quest');
    } else mark.hidden = true;
    // clock & weather
    const hr = hourOfDay(s);
    const w = s.weather.kind;
    const wIcon = w === 'rain' ? 'rain' : w === 'mist' ? 'mist' : w === 'cloudy' ? 'cloud' : hr >= 6 && hr < 19.5 ? 'sun' : 'moon';
    (P.clock.querySelector('.lq-clock-ico') as HTMLElement).innerHTML = icon(wIcon);
    (P.clock.querySelector('.lq-clock-time') as HTMLElement).textContent = clockLabel(s.clock);
    (P.clock.querySelector('.lq-clock-day') as HTMLElement).textContent = `Day ${day(s)}`;
    (P.clock.querySelector('.lq-hud-lumens') as HTMLElement).innerHTML = `${icon('lumens')}${s.lumens}`;
    // companion card
    const b = s.bonded.find((x) => x.uid === s.active);
    const out = !!g.creatures.companion && !g.creatures.companion.dismissed;
    if (b) {
      const def = SPECIES_BY_ID[b.species];
      const ab = ABILITIES[def.ability];
      const key = `${b.uid}|${out}|${Math.round(b.friendship)}|${b.name}`;
      if (P.comp.dataset.key !== key) {
        P.comp.dataset.key = key;
        P.comp.innerHTML = `
          <img class="lq-comp-portrait" alt="" src="${portrait(g.host.renderer, b.species, b.variant, 96)}">
          <div class="lq-comp-info">
            <div class="lq-comp-name">${escapeHtml(b.name)} <span class="lq-elem" style="--c:${ELEMENT_COLOR[def.element]}">${icon(def.element)}${ELEMENT_NAME[def.element]}</span></div>
            <div class="lq-comp-ab">${ab.name} <kbd class="lq-kbd">${keyLabel(g.settings.bindings.ability)}</kbd></div>
            <div class="lq-comp-bar"><span style="width:${b.friendship}%"></span></div>
            <div class="lq-comp-state">${out ? 'Following you' : 'Resting'} • <kbd class="lq-kbd">${keyLabel(g.settings.bindings.companion)}</kbd> ${out ? 'dismiss' : 'call'}</div>
          </div>`;
      }
      P.comp.hidden = false;
    } else P.comp.hidden = true;
    // minimap
    this.map ??= new MapView(g);
    this.map.drawMini(P.mini.querySelector('canvas') as HTMLCanvasElement);
    P.fps.hidden = !g.settings.showFps;
    if (g.settings.showFps) P.fps.textContent = `${Math.round(g.fps)} fps • ${g.tierName} • ${Math.round(g.host.scale * 100)}%`;
    P.auto.classList.toggle('is-on', !!g.auto);
    P.autoLabel.hidden = !g.auto;
    if (g.auto) P.autoLabel.textContent = `Auto-ranger: ${g.auto.label || 'thinking'} — move to take over`;
  }

  private prompt(): void {
    const g = this.game;
    const P = this.hudParts;
    const t = g.target;
    const kb = g.settings.bindings;
    let markup = '';
    if (t?.kind === 'interact') {
      const p = g.interact.prompt(t.entry);
      markup = p.blocked
        ? `<span class="lq-prompt-label">${escapeHtml(p.label)}</span><span class="lq-prompt-blocked">${escapeHtml(p.blocked)}</span>`
        : `<kbd class="lq-kbd">${keyLabel(kb.interact)}</kbd><span class="lq-prompt-verb">${p.verb}</span><span class="lq-prompt-label">${escapeHtml(p.label)}</span>`;
    } else if (t?.kind === 'npc') {
      markup = `<kbd class="lq-kbd">${keyLabel(kb.interact)}</kbd><span class="lq-prompt-verb">Talk</span><span class="lq-prompt-label">${t.npc.def.name}</span>`;
    }
    if (markup !== this.lastPrompt) {
      this.lastPrompt = markup;
      P.prompt.innerHTML = markup;
      P.prompt.classList.toggle('is-on', !!markup);
    }
  }

  private creaturePanel(): void {
    const g = this.game;
    const P = this.hudParts;
    const t = g.target;
    if (t?.kind !== 'creature') {
      if (this.lastCreaturePanel) {
        this.lastCreaturePanel = '';
        P.creature.classList.remove('is-on');
      }
      return;
    }
    const c = t.creature;
    const def = c.def;
    const kb = g.settings.bindings;
    const known = g.state.species[c.species].observed > 0 || c.companion;
    const name = c.companion ? g.companionName() : known ? variantName(c.species, c.variant) : '???';
    const trust = Math.round(c.trust);
    const fear = Math.round(c.fear);
    const res = canResonate(c);
    const near = t.dist < 3.6;
    const food = bestFood(g.state, c);
    const pref = known && !c.companion ? preference(c, g.conditions(c)).note : '';
    let action = '';
    if (c.companion) action = food ? `<div class="lq-act"><kbd class="lq-kbd">${keyLabel(kb.interact)}</kbd> Share ${ITEM_BY_ID[food].name}</div>` : '';
    else if (res.ok && t.dist < 4.2) action = `<div class="lq-act is-glow"><kbd class="lq-kbd">${keyLabel(kb.interact)}</kbd> Resonate</div>`;
    else if (near) action = food ? `<div class="lq-act"><kbd class="lq-kbd">${keyLabel(kb.interact)}</kbd> Offer ${ITEM_BY_ID[food].name}</div>` : `<div class="lq-act is-dim">No food to offer</div>`;
    else action = `<div class="lq-act is-dim">Get closer to offer food</div>`;
    const key = `${c.id}|${trust}|${fear > 45}|${action}|${known}|${pref}|${c.observed}`;
    if (key === this.lastCreaturePanel) return;
    this.lastCreaturePanel = key;
    const color = ELEMENT_COLOR[def.element];
    P.creature.innerHTML = `
      <div class="lq-cp-head"><span class="lq-cp-name">${escapeHtml(name)}</span><span class="lq-elem" style="--c:${color}">${icon(def.element)}${ELEMENT_NAME[def.element]}</span></div>
      ${c.companion ? '<div class="lq-cp-note">Your companion</div>' : `
      <div class="lq-cp-trust"><span>Trust</span><div class="lq-cp-meter"><span style="width:${trust}%"></span><i style="left:${RESONATE_TRUST}%"></i></div><b>${trust}</b></div>
      ${fear > 45 ? '<div class="lq-cp-fear">Frightened — back off and crouch</div>' : pref ? `<div class="lq-cp-note">${pref}</div>` : ''}`}
      <div class="lq-cp-actions">
        <div class="lq-act"><kbd class="lq-kbd">${keyLabel(kb.observe)}</kbd> ${c.observed || c.companion ? 'Observe' : 'Observe (new)'}</div>
        ${action}
        <div class="lq-act"><kbd class="lq-kbd">${keyLabel(kb.collection)}</kbd> Info</div>
      </div>`;
    P.creature.classList.add('is-on');
  }

  // --- feedback --------------------------------------------------------------

  toast(msg: string, kind: 'info' | 'good' | 'quest' | 'warn' = 'info'): void {
    const t = el('div', `lq-toast is-${kind}`, msg);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.classList.add('is-out'), 3600);
    setTimeout(() => t.remove(), 4200);
  }

  itemToast(item: string, n: number): void {
    const name = item === 'lumens' ? 'Lumens' : ITEM_BY_ID[item]?.name ?? item;
    const ic = item === 'lumens' ? 'lumens' : ITEM_BY_ID[item]?.icon ?? 'spark';
    const t = html('lq-toast lq-toast-item', `${icon(ic)}<span>+${n} ${escapeHtml(name)}</span>`);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.classList.add('is-out'), 2400);
    setTimeout(() => t.remove(), 3000);
  }

  banner(title: string, sub: string): void {
    const b = this.hudParts.banner;
    if (!b) return;
    b.innerHTML = `<div class="lq-banner-title">${escapeHtml(title)}</div><div class="lq-banner-sub">${escapeHtml(sub)}</div>`;
    b.classList.remove('is-on');
    void b.offsetWidth;
    b.classList.add('is-on');
  }

  flash(text: string): void {
    this.toast(text, 'info');
  }

  saveIndicator(ok: boolean): void {
    const s = this.hudParts.save;
    if (!s) return;
    s.classList.toggle('is-bad', !ok);
    s.classList.remove('is-on');
    void s.offsetWidth;
    s.classList.add('is-on');
  }

  showControlsHint(): void {
    const g = this.game;
    const b = g.settings.bindings;
    const hint = g.input.touch
      ? 'Left stick to move • drag to look • buttons to jump, interact and observe'
      : `${keyLabel(b.forward)}${keyLabel(b.left)}${keyLabel(b.back)}${keyLabel(b.right)} move • Mouse look (click to lock) • ${keyLabel(b.sprint)} sprint • ${keyLabel(b.crouch)}/C sneak • ${keyLabel(b.jump)} jump • ${keyLabel(b.interact)} interact • ${keyLabel(b.observe)} observe • ${keyLabel(b.view)} camera`;
    const e = html('lq-controls-hint', escapeHtml(hint));
    this.hudEl.append(e);
    setTimeout(() => e.classList.add('is-out'), 9000);
    setTimeout(() => e.remove(), 10000);
  }

  observed(c: Creature, first: boolean, text: string): void {
    const g = this.game;
    const card = html('lq-observed', `
      <img alt="" src="${portrait(g.host.renderer, c.species, c.variant, 96)}">
      <div><div class="lq-observed-title">${first ? 'New Field Guide entry!' : 'Observed'}</div><div class="lq-observed-text">${escapeHtml(text)}</div></div>`);
    this.hudEl.append(card);
    setTimeout(() => card.classList.add('is-out'), 5200);
    setTimeout(() => card.remove(), 6000);
  }

  fade(mid: () => void): void {
    const f = el('div', 'lq-fade');
    this.root.append(f);
    requestAnimationFrame(() => f.classList.add('is-on'));
    setTimeout(() => {
      mid();
      f.classList.remove('is-on');
      setTimeout(() => f.remove(), 700);
    }, 800);
  }

  note(title: string, text: string): void {
    dialogs.note(this, title, text);
  }

  dialogue(name: string, role: string, tree: Tree, onClose: () => void): void {
    dialogs.dialogue(this, name, role, tree, onClose);
  }

  resonance(c: Creature, done: (ok: boolean) => void): void {
    dialogs.resonance(this, c, done);
  }

  bonded(uid: string, name: string): void {
    dialogs.bonded(this, uid, name);
  }

  // --- panel stack -------------------------------------------------------------

  /** Pushes a panel element; game input pauses while panels are open. */
  push(name: string, node: HTMLElement, onClose?: () => void): void {
    const wrap = el('div', 'lq-modal');
    wrap.append(node);
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === wrap && name !== 'resonance' && name !== 'bonded') this.closeTop();
    });
    this.panels.append(wrap);
    this.stack.push({ name, el: wrap, onClose });
    this.game.modal = name;
    this.game.input.releaseLock();
    this.game.input.reset();
    const focusable = node.querySelector<HTMLElement>('[autofocus], button:not([disabled]), input');
    focusable?.focus({ preventScroll: true });
  }

  replaceTop(name: string, node: HTMLElement, onClose?: () => void): void {
    const top = this.stack.pop();
    top?.el.remove();
    this.push(name, node, onClose);
  }

  closeTop(): boolean {
    const top = this.stack.pop();
    if (!top) return false;
    top.el.remove();
    top.onClose?.();
    this.game.audio.close();
    this.afterClose();
    return true;
  }

  closeAll(): void {
    while (this.stack.length) {
      const top = this.stack.pop()!;
      top.el.remove();
      top.onClose?.();
    }
    this.afterClose();
  }

  private afterClose(): void {
    const g = this.game;
    const top = this.stack[this.stack.length - 1];
    g.modal = top?.name ?? null;
    if (!top) {
      if (g.paused) g.paused = false;
      if (g.phase === 'play' && !g.input.touch && g.modal === null) g.input.requestLock();
    }
  }

  get topName(): string | null {
    return this.stack[this.stack.length - 1]?.name ?? null;
  }

  openPanel(name: string): void {
    const g = this.game;
    if (g.phase !== 'play' && name !== 'settings' && name !== 'credits' && name !== 'confirm') return;
    if (this.topName === name) return;
    g.audio.open();
    const already = this.stack.findIndex((s) => s.name === name);
    if (already >= 0) return;
    // panels replace each other rather than stacking (except over pause)
    if (this.stack.length && this.topName !== 'pause' && ['map', 'collection', 'journal', 'inventory', 'shop', 'rest'].includes(name)) {
      const top = this.stack.pop()!;
      top.el.remove();
    }
    panels.open(this, name);
  }

  panelKey(e: KeyboardEvent): boolean | void {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    const handler = (top.el.firstElementChild as HTMLElement & { lqKey?: (e: KeyboardEvent) => boolean | void })?.lqKey;
    return handler?.(e);
  }

  confirm(title: string, text: string, yes: string, onYes: () => void): void {
    dialogs.confirm(this, title, text, yes, onYes);
  }

  locationName(x: number, z: number): string {
    let best = 'Brightwater Vale';
    let bd = Infinity;
    for (const l of LOCATIONS) {
      const d = Math.hypot(x - l.at[0], z - l.at[1]);
      if (d < l.radius * 1.2 && d < bd) {
        bd = d;
        best = l.name;
      }
    }
    return best;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
