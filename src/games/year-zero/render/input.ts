import type { MapView } from './view';

// Pointer handling for the map: drag to pan, wheel or pinch to zoom, and taps
// that are distinguished from drags.

export interface TapInfo {
  tile: number;
  touch: boolean;
  secondary: boolean;
  x: number;
  y: number;
}

export interface InputHandlers {
  onTap: (t: TapInfo) => void;
  onHover: (tile: number, x: number, y: number) => void;
  onLongPress?: (t: TapInfo) => void;
}

export function bindMapInput(canvas: HTMLCanvasElement, r: MapView, h: InputHandlers): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let startX = 0;
  let startY = 0;
  let moved = false;
  let pinchDist = 0;
  let downTime = 0;
  let longTimer = 0;
  let lastHover = -1;

  const local = (e: PointerEvent | WheelEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const down = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    pointers.set(e.pointerId, { x, y });
    if (pointers.size === 1) {
      startX = x;
      startY = y;
      moved = false;
      downTime = performance.now();
      if (e.pointerType === 'touch' && h.onLongPress) {
        clearTimeout(longTimer);
        longTimer = window.setTimeout(() => {
          if (!moved && pointers.size === 1) {
            moved = true;
            h.onLongPress?.({ tile: r.tileAt(x, y), touch: true, secondary: true, x, y });
          }
        }, 520);
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      moved = true;
      clearTimeout(longTimer);
    }
  };

  const move = (e: PointerEvent) => {
    const [x, y] = local(e);
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') {
        const t = r.tileAt(x, y);
        if (t !== lastHover) {
          lastHover = t;
          h.onHover(t, x, y);
        }
      }
      return;
    }
    if (pointers.size === 1) {
      const dx = x - prev.x;
      const dy = y - prev.y;
      if (!moved && Math.hypot(x - startX, y - startY) > (e.pointerType === 'touch' ? 9 : 5)) {
        moved = true;
        clearTimeout(longTimer);
      }
      if (moved) r.pan(dx, dy);
    } else if (pointers.size === 2) {
      pointers.set(e.pointerId, { x, y });
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && d > 0) r.zoomAt(d / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchDist = d;
      return;
    }
    pointers.set(e.pointerId, { x, y });
  };

  const up = (e: PointerEvent) => {
    const [x, y] = local(e);
    const had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    clearTimeout(longTimer);
    if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      startX = p.x;
      startY = p.y;
      pinchDist = 0;
      return;
    }
    if (!had || moved) return;
    if (performance.now() - downTime > 900) return;
    h.onTap({ tile: r.tileAt(x, y), touch: e.pointerType !== 'mouse', secondary: e.button === 2, x, y });
  };

  const cancel = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    clearTimeout(longTimer);
  };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const [x, y] = local(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    r.zoomAt(Math.exp(-delta * 0.0015), x, y);
  };

  const leave = (e: PointerEvent) => {
    // Touch pointers "leave" after every tap; only a mouse really leaves.
    if (e.pointerType !== 'mouse') return;
    lastHover = -1;
    h.onHover(-1, 0, 0);
  };

  const context = (e: Event) => e.preventDefault();

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', context);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('pointerleave', leave);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('contextmenu', context);
  };
}
