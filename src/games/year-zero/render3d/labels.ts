// Crisp HTML labels pinned to the 3D map: city banners, route turn markers,
// health bars of damaged units and floating combat numbers.

import { UNIT } from '../data/units';
import type { Game } from '../sim/game';
import type { Map3D } from './map3d';
import { LAND_Y } from './shape';

interface Banner {
  el: HTMLElement;
  key: string;
  tile: number;
}

interface Floater {
  el: HTMLElement;
  tile: number;
  start: number;
  dur: number;
}

export class Labels {
  readonly root: HTMLElement;
  private banners = new Map<number, Banner>();
  private bars = new Map<number, HTMLElement>();
  private floaters: Floater[] = [];
  private path: { el: HTMLElement; tile: number }[] = [];
  private w = 1;
  private h = 1;
  private _hidden = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.classList.add('yz-labels');
  }

  set hidden(v: boolean) {
    this._hidden = v;
    this.root.style.visibility = v ? 'hidden' : '';
  }

  get hidden(): boolean {
    return this._hidden;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  clear(): void {
    this.root.textContent = '';
    this.banners.clear();
    this.bars.clear();
    this.floaters = [];
    this.path = [];
  }

  private place(el: HTMLElement, x: number, y: number, margin = 80): boolean {
    const on = x > -margin && y > -margin && x < this.w + margin && y < this.h + margin;
    if (!on) {
      if (el.style.display !== 'none') el.style.display = 'none';
      return false;
    }
    if (el.style.display === 'none') el.style.display = '';
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    return true;
  }

  update(view: Map3D, g: Game, _camMoved: boolean): void {
    if (this._hidden) return;
    const p = g.player;
    const z = view.cam.zoom;
    const shape = view.shapeOf;
    // City banners
    const seen = new Set<number>();
    const small = z < 0.5;
    for (const city of Object.values(g.s.cities)) {
      if (!city || !p.explored[city.tile]) continue;
      seen.add(city.id);
      const civ = g.civ(city.civId);
      const capital = civ.capitalId === city.id;
      const own = civ.id === p.id;
      const key = `${city.name}|${city.size}|${civ.color}|${capital}|${own}|${p.visible[city.tile]}|${small}|${city.hp}`;
      let b = this.banners.get(city.id);
      if (!b) {
        const el = document.createElement('div');
        el.className = 'yz-banner';
        this.root.append(el);
        b = { el, key: '', tile: city.tile };
        this.banners.set(city.id, b);
      }
      if (b.key !== key) {
        b.key = key;
        b.tile = city.tile;
        b.el.classList.toggle('own', own);
        b.el.classList.toggle('dim', !p.visible[city.tile]);
        b.el.classList.toggle('small', small);
        b.el.style.setProperty('--civ', civ.color);
        const hurt = city.hp < 100 ? `<i class="hp"><b style="width:${Math.max(0, city.hp)}%"></b></i>` : '';
        b.el.innerHTML = `<span class="sz">${city.size}</span><span class="nm">${escape(city.name)}</span>${capital ? '<span class="cap" aria-label="capital">♛</span>' : ''}${hurt}`;
      }
      const x = shape.cx(city.tile);
      const zz = shape.cz(city.tile);
      const [sx, sy] = view.project(x, LAND_Y + 0.62, zz + 0.12);
      this.place(b.el, sx, sy);
    }
    for (const [id, b] of this.banners) {
      if (!seen.has(id)) {
        b.el.remove();
        this.banners.delete(id);
      }
    }
    // Unit health bars (damaged units in sight)
    const live = new Set<number>();
    if (z > 0.45) {
      for (const u of Object.values(g.s.units)) {
        if (u.hp >= 100 || !p.visible[u.tile]) continue;
        const pos = view.units?.anchor(u.id);
        if (!pos) continue;
        live.add(u.id);
        let el = this.bars.get(u.id);
        if (!el) {
          el = document.createElement('div');
          el.className = 'yz-hpbar';
          el.innerHTML = '<b></b>';
          this.root.append(el);
          this.bars.set(u.id, el);
        }
        const fill = el.firstElementChild as HTMLElement;
        const w = `${u.hp}%`;
        if (fill.style.width !== w) {
          fill.style.width = w;
          fill.className = u.hp > 60 ? 'ok' : u.hp > 30 ? 'mid' : 'low';
        }
        const [sx, sy] = view.project(pos[0], pos[1] + (UNIT[u.type].cls === 'air' ? 0.1 : 0.42), pos[2]);
        this.place(el, sx, sy);
      }
    }
    for (const [id, el] of this.bars) {
      if (!live.has(id)) {
        el.remove();
        this.bars.delete(id);
      }
    }
    // Route markers
    for (const m of this.path) {
      const [sx, sy] = view.project(shape.cx(m.tile), shape.height(m.tile, shape.cx(m.tile), shape.cz(m.tile)) + 0.08, shape.cz(m.tile));
      this.place(m.el, sx, sy);
    }
    // Floating numbers
    const now = performance.now();
    this.floaters = this.floaters.filter((f) => {
      const t = (now - f.start) / f.dur;
      if (t >= 1) {
        f.el.remove();
        return false;
      }
      const [sx, sy] = view.project(shape.cx(f.tile), LAND_Y + 0.5 + t * 0.5, shape.cz(f.tile));
      this.place(f.el, sx, sy);
      f.el.style.opacity = String(Math.min(1, (1 - t) * 2.5));
      return true;
    });
  }

  floatText(view: Map3D, tile: number, text: string, color: string, dur: number): void {
    const el = document.createElement('div');
    el.className = 'yz-float';
    el.textContent = text;
    el.style.color = color;
    this.root.append(el);
    this.floaters.push({ el, tile, start: performance.now(), dur });
    void view;
  }

  setPath(marks: { tile: number; text: string }[] | null, attack = false): void {
    for (const m of this.path) m.el.remove();
    this.path = [];
    if (!marks) return;
    marks.forEach((m, k) => {
      const el = document.createElement('div');
      const last = k === marks.length - 1;
      el.className = `yz-pathmark${attack && last ? ' attack' : ''}`;
      el.textContent = attack && last ? '⚔' : m.text;
      this.root.append(el);
      this.path.push({ el, tile: m.tile });
    });
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
