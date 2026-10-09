// Keyboard, mouse (with pointer lock) and touch input, mapped to actions
// through rebindable bindings. Movement keys are ignored while a text field
// has focus, and gameplay reads input only when no menu is open.

import type { Action } from '../systems/save';

const ALIASES: Record<string, Action> = {
  ArrowUp: 'forward',
  ArrowDown: 'back',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ShiftRight: 'sprint',
  ControlRight: 'crouch',
  KeyC: 'crouch',
};

export class Input {
  private down = new Set<Action>();
  private pressedQ = new Set<Action>();
  private codeToAction = new Map<string, Action>();
  lookX = 0;
  lookY = 0;
  zoom = 0;
  /** Virtual stick from touch, -1..1. */
  stickX = 0;
  stickY = 0;
  locked = false;
  /** Set by the game: whether gameplay is reading input right now. */
  gameplay = false;
  /** Called when the browser drops pointer lock on its own (Esc). */
  onLockLost: (() => void) | null = null;
  private releasing = false;
  /** Raw key listeners for menus (Escape, Enter, arrows). */
  onKey: ((e: KeyboardEvent) => boolean | void) | null = null;
  private dragId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  readonly touch: boolean;
  private disposers: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement, bindings: Record<Action, string>) {
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.setBindings(bindings);
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', (e) => {
      if (this.typing()) return;
      if (this.onKey && this.onKey(e) === true) {
        e.preventDefault();
        return;
      }
      const a = this.codeToAction.get(e.code) ?? ALIASES[e.code];
      if (!a) return;
      if (this.gameplay || a === 'map' || a === 'collection' || a === 'journal' || a === 'inventory') e.preventDefault();
      if (e.code === 'Tab') e.preventDefault();
      if (!this.down.has(a) && !e.repeat) this.pressedQ.add(a);
      this.down.add(a);
    });
    on(window, 'keyup', (e) => {
      const a = this.codeToAction.get(e.code) ?? ALIASES[e.code];
      if (a) this.down.delete(a);
    });
    on(window, 'blur', () => this.down.clear());
    const lockChange = () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      // Esc exits pointer lock without a keydown reaching the page
      if (was && !this.locked && !this.releasing) this.onLockLost?.();
      this.releasing = false;
    };
    document.addEventListener('pointerlockchange', lockChange);
    this.disposers.push(() => document.removeEventListener('pointerlockchange', lockChange));
    on(window, 'mousemove', (e) => {
      if (this.locked) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });
    on(canvas, 'pointerdown', (e) => {
      if (!this.gameplay) return;
      if (e.pointerType === 'mouse') {
        if (!this.locked && e.button === 0) this.requestLock();
        // right-drag looks around without pointer lock
        if (e.button === 2 && this.dragId === null) {
          this.dragId = e.pointerId;
          this.lastX = e.clientX;
          this.lastY = e.clientY;
        }
        return;
      }
      if (this.dragId === null) {
        this.dragId = e.pointerId;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    on(window, 'pointermove', (e) => {
      if (e.pointerId !== this.dragId) return;
      this.lookX += (e.clientX - this.lastX) * 1.6;
      this.lookY += (e.clientY - this.lastY) * 1.6;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.dragId) this.dragId = null;
    };
    on(window, 'pointerup', end);
    on(window, 'pointercancel', end);
    on(canvas, 'wheel', (e) => {
      if (!this.gameplay) return;
      this.zoom += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
  }

  setBindings(b: Record<Action, string>): void {
    this.codeToAction.clear();
    for (const [a, code] of Object.entries(b) as [Action, string][]) this.codeToAction.set(code, a);
  }

  requestLock(): void {
    if (this.touch) return;
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => undefined);
    } catch {
      /* not allowed here */
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) {
      this.releasing = true;
      document.exitPointerLock();
    }
  }

  private typing(): boolean {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) && (el as HTMLInputElement).type !== 'range' && (el as HTMLInputElement).type !== 'checkbox';
  }

  isDown(a: Action): boolean {
    return this.down.has(a);
  }

  /** True once per key press (edge), consumed on read. */
  pressed(a: Action): boolean {
    if (this.pressedQ.has(a)) {
      this.pressedQ.delete(a);
      return true;
    }
    return false;
  }

  /** Touch buttons and other code paths drive actions through here. */
  virtual(a: Action, isDown: boolean): void {
    if (isDown) {
      if (!this.down.has(a)) this.pressedQ.add(a);
      this.down.add(a);
    } else this.down.delete(a);
  }

  tap(a: Action): void {
    this.pressedQ.add(a);
  }

  /** Movement vector in input space (x right, y forward), length ≤ 1. */
  move(): { x: number; y: number } {
    let x = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0) + this.stickX;
    let y = (this.down.has('forward') ? 1 : 0) - (this.down.has('back') ? 1 : 0) + this.stickY;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }

  consumeLook(): { x: number; y: number; zoom: number } {
    const r = { x: this.lookX, y: this.lookY, zoom: this.zoom };
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
    return r;
  }

  clearEdges(): void {
    this.pressedQ.clear();
  }

  reset(): void {
    this.down.clear();
    this.pressedQ.clear();
    this.stickX = 0;
    this.stickY = 0;
    this.lookX = this.lookY = this.zoom = 0;
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
  }
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', Tab: 'Tab',
    Escape: 'Esc', Enter: 'Enter', AltLeft: 'Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  return map[code] ?? code;
}
