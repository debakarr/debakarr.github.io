// Touch controls: a floating stick on the left for movement, drag anywhere
// else to look, and action buttons on the right. Buttons drive the same
// actions as the keyboard, so every feature works on a phone.

import type { Game } from '../game';
import type { Action } from '../systems/save';
import { el, h } from './kit';
import { icon } from './icons';

export class TouchControls {
  readonly root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private sprint = false;
  private crouch = false;

  constructor(private g: Game, parent: HTMLElement) {
    this.root = el('div', 'lq-touch');
    const zone = el('div', 'lq-stick-zone');
    this.stick = el('div', 'lq-stick');
    this.knob = el('div', 'lq-stick-knob');
    this.stick.append(this.knob);
    zone.append(this.stick);
    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      this.origin = { x: e.clientX, y: e.clientY };
      this.stick.style.left = `${e.clientX - r.left}px`;
      this.stick.style.top = `${e.clientY - r.top}px`;
      this.stick.classList.add('is-on');
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      const dx = e.clientX - this.origin.x;
      const dy = e.clientY - this.origin.y;
      const max = 46;
      const d = Math.hypot(dx, dy);
      const k = d > max ? max / d : 1;
      this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this.g.input.stickX = (dx * k) / max;
      this.g.input.stickY = -(dy * k) / max;
      // push the stick all the way to run
      this.g.input.virtual('sprint', this.sprint || d > max * 1.6);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.knob.style.transform = '';
      this.stick.classList.remove('is-on');
      this.g.input.stickX = 0;
      this.g.input.stickY = 0;
      this.g.input.virtual('sprint', this.sprint);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const btns = el('div', 'lq-touch-btns');
    const make = (action: Action, ic: string, label: string, cls = '', hold = false) => {
      const b = h('button', { class: `lq-tbtn ${cls}`, type: 'button', 'aria-label': label });
      b.innerHTML = `${icon(ic)}<span>${label}</span>`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.g.audio.unlock();
        if (hold) this.g.input.virtual(action, true);
        else this.g.input.tap(action);
        b.classList.add('is-down');
      });
      const up = () => {
        if (hold) this.g.input.virtual(action, false);
        b.classList.remove('is-down');
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      return b;
    };
    const toggle = (action: 'sprint' | 'crouch', ic: string, label: string) => {
      const b = h('button', { class: 'lq-tbtn lq-tbtn-small', type: 'button', 'aria-label': label, 'aria-pressed': 'false' });
      b.innerHTML = `${icon(ic)}<span>${label}</span>`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (action === 'sprint') this.sprint = !this.sprint;
        else this.crouch = !this.crouch;
        const on = action === 'sprint' ? this.sprint : this.crouch;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        this.g.input.virtual(action, on);
      });
      return b;
    };
    btns.append(
      make('jump', 'jump', 'Jump', 'lq-tbtn-big', true),
      make('interact', 'hand', 'Use', 'lq-tbtn-big lq-tbtn-gold'),
      make('observe', 'eye', 'Observe'),
      make('ability', 'spark', 'Skill'),
      toggle('sprint', 'run', 'Run'),
      toggle('crouch', 'crouch', 'Sneak'),
      make('companion', 'paw', 'Call'),
      make('view', 'camera', 'View'),
    );
    this.root.append(zone, btns);
    parent.append(this.root);
    this.root.hidden = true;
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
