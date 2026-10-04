// Canvas renderer: the galaxy (gas as a soft glow, stars by temperature and
// brightness, life and civilizations as overlays) and a star-system view
// with planets on their orbits. Purely visual; it never changes the sim.

import { alive, ERA_INDEX } from '../sim/civ';
import { kindOf, PLANET_STRIDE, type Kind } from '../sim/planets';
import { Phase, tempRgb } from '../sim/stars';
import { GRID, RADIUS, SPAN, type Fx, type Universe } from '../sim/universe';

export type View = 'galaxy' | 'system';

interface Effect {
  fx: Fx;
  x: number;
  y: number;
  angle: number;
  born: number;
  star: number;
}

export const KIND_COLOR: Record<Kind, [number, number, number]> = {
  lava: [214, 96, 52],
  desert: [205, 168, 112],
  ocean: [52, 112, 204],
  terran: [74, 150, 120],
  ice: [214, 230, 240],
  gas: [214, 170, 120],
  icegiant: [126, 190, 220],
  barren: [140, 132, 124],
};

const TAU = Math.PI * 2;

export class Renderer {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  u: Universe;
  w = 1;
  h = 1;
  dpr = 1;
  view: View = 'galaxy';
  cx = 0;
  cy = 0;
  z = 0.4;
  /** Smooth camera flight target. */
  private fly: { cx: number; cy: number; z: number } | null = null;
  sysStar = -1;
  selStar = -1;
  selPlanet = -1;
  /** Room taken by UI on the right / bottom, so system views centre in the free space. */
  inset = { right: 0, bottom: 0, top: 0, left: 0 };
  private fx: Effect[] = [];
  private gasCv = document.createElement('canvas');
  private gasCtx: CanvasRenderingContext2D;
  /** Gas with the half-cell softening already baked in (one composite per frame). */
  private gasSoftCv = document.createElement('canvas');
  private gasSoftCtx: CanvasRenderingContext2D;
  /** Background + gas composed in screen space; re-composited only when the camera or gas changes. */
  private skyCv = document.createElement('canvas');
  private skyCtx: CanvasRenderingContext2D;
  private skyKey = '';
  private lastCx = 0;
  private lastCy = 0;
  private lastZ = -1;
  private gasImg: ImageData;
  private gasAt = 0;
  private bg = document.createElement('canvas');
  private glow = new Map<string, HTMLCanvasElement>();
  private colorOf: string[] = [];
  private colorPhase = new Int8Array(4096).fill(-1);
  private sysPos: { id: number; x: number; y: number; r: number }[] = [];
  createdAt = performance.now();

  constructor(cv: HTMLCanvasElement, u: Universe) {
    this.cv = cv;
    this.ctx = cv.getContext('2d')!;
    this.u = u;
    this.gasCv.width = GRID;
    this.gasCv.height = GRID;
    this.gasCtx = this.gasCv.getContext('2d')!;
    this.gasSoftCv.width = GRID;
    this.gasSoftCv.height = GRID;
    this.gasSoftCtx = this.gasSoftCv.getContext('2d')!;
    this.skyCtx = this.skyCv.getContext('2d')!;
    this.gasImg = this.gasCtx.createImageData(GRID, GRID);
  }

  setUniverse(u: Universe): void {
    this.u = u;
    this.fx = [];
    this.colorPhase.fill(-1);
    this.view = 'galaxy';
    this.sysStar = -1;
    this.selStar = -1;
    this.selPlanet = -1;
    this.createdAt = performance.now();
    this.gasAt = 0;
  }

  resize(): void {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    this.makeBackground();
  }

  fit(): void {
    this.fly = null;
    const avail = Math.max(this.h * 0.4, this.h - this.inset.top - this.inset.bottom);
    this.z = Math.max(0.02, Math.min(this.w, avail) / (RADIUS * 2.15));
    this.cx = 0;
    this.cy = (this.inset.bottom - this.inset.top) / 2 / this.z;
    this.clamp();
  }

  /** Put a point in the middle of the part of the screen the UI leaves free. */
  centerOn(x: number, y: number, z = this.z): void {
    const zz = Math.min(12, Math.max(this.minZ, z));
    this.flyTo(x - (this.inset.left - this.inset.right) / (2 * zz), y - (this.inset.top - this.inset.bottom) / (2 * zz), zz);
  }

  /** Is a world point inside the free part of the screen? */
  visible(x: number, y: number, margin = 30): boolean {
    const [sx, sy] = this.toScreen(x, y);
    return sx > this.inset.left + margin && sx < this.w - this.inset.right - margin && sy > this.inset.top + margin && sy < this.h - this.inset.bottom - margin;
  }

  get minZ(): number {
    return Math.min(this.w, this.h) / (RADIUS * 3);
  }

  clamp(): void {
    if (!Number.isFinite(this.z) || this.z <= 0) this.z = this.minZ * 2;
    if (!Number.isFinite(this.cx)) this.cx = 0;
    if (!Number.isFinite(this.cy)) this.cy = 0;
    this.z = Math.min(12, Math.max(this.minZ, this.z));
    const lim = RADIUS * 1.2;
    this.cx = Math.min(lim, Math.max(-lim, this.cx));
    this.cy = Math.min(lim, Math.max(-lim, this.cy));
  }

  pan(dx: number, dy: number): void {
    if (this.view !== 'galaxy') return;
    this.fly = null;
    this.cx -= dx / this.z;
    this.cy -= dy / this.z;
    this.clamp();
  }

  zoomAt(px: number, py: number, f: number): void {
    if (this.view !== 'galaxy') return;
    this.fly = null;
    const [wx, wy] = this.toWorld(px, py);
    this.z *= f;
    this.clamp();
    this.cx = wx - (px - this.w / 2) / this.z;
    this.cy = wy - (py - this.h / 2) / this.z;
    this.clamp();
  }

  flyTo(x: number, y: number, z: number): void {
    this.fly = { cx: x, cy: y, z: Math.min(12, Math.max(this.minZ, z)) };
  }

  toWorld(px: number, py: number): [number, number] {
    return [this.cx + (px - this.w / 2) / this.z, this.cy + (py - this.h / 2) / this.z];
  }

  toScreen(x: number, y: number): [number, number] {
    return [(x - this.cx) * this.z + this.w / 2, (y - this.cy) * this.z + this.h / 2];
  }

  enterSystem(i: number): void {
    this.view = 'system';
    this.sysStar = i;
    this.selStar = i;
  }

  exitSystem(): void {
    if (this.view !== 'system') return;
    const s = this.u.s;
    this.view = 'galaxy';
    if (this.sysStar >= 0) {
      this.cx = s.sx[this.sysStar];
      this.cy = s.sy[this.sysStar];
      this.z = Math.max(this.z, 1.2);
      this.clamp();
    }
    this.sysStar = -1;
  }

  addFx(fx: Fx, x: number, y: number, angle = 0, star = -1): void {
    // At high speed supernovae come in floods; a few rings at once is plenty.
    if (fx === 'supernova' && this.fx.filter((e) => e.fx === 'supernova').length >= 4) return;
    this.fx.push({ fx, x, y, angle, star, born: performance.now() });
    if (this.fx.length > 40) this.fx.shift();
  }

  // --- Picking -------------------------------------------------------------------------------

  pickStar(px: number, py: number): number {
    const [wx, wy] = this.toWorld(px, py);
    return this.u.nearestStar(wx, wy, Math.max(12, 18 / this.z));
  }

  /** In the system view: a planet id, -2 for the star, or -1. */
  pickSystem(px: number, py: number): number {
    let best = -1;
    let bd = Infinity;
    for (const p of this.sysPos) {
      const d = Math.hypot(px - p.x, py - p.y) - p.r;
      if (d < 16 && d < bd) {
        bd = d;
        best = p.id;
      }
    }
    return best;
  }

  // --- Frame ---------------------------------------------------------------------------------

  frame(now: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!Number.isFinite(this.z + this.cx + this.cy) || this.z <= 0) {
      this.fly = null;
      this.clamp();
    }
    if (this.fly) {
      const k = 0.12;
      this.cx += (this.fly.cx - this.cx) * k;
      this.cy += (this.fly.cy - this.cy) * k;
      this.z *= Math.pow(this.fly.z / this.z, k);
      if (Math.abs(this.fly.cx - this.cx) * this.z < 0.5 && Math.abs(this.fly.cy - this.cy) * this.z < 0.5 && Math.abs(this.fly.z / this.z - 1) < 0.01) this.fly = null;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.view === 'system' && this.sysStar >= 0) {
      // The background canvas is opaque and covers the whole frame.
      ctx.drawImage(this.bg, 0, 0, this.w, this.h);
      this.drawSystem(now);
    } else this.drawGalaxy(now);
    if (this.fx.length) this.fx = this.fx.filter((e) => now - e.born < 3200);
  }

  private drawGalaxy(now: number): void {
    const ctx = this.ctx;
    const u = this.u;
    const s = u.s;
    const t = s.t;
    // Background + gas: when the camera is still they live in one cached
    // screen-space layer (one composite a frame); while it moves, draw them
    // directly so the cache is never rebuilt every frame.
    const alpha = Math.min(1, Math.max(0, (t - 20) / 280));
    const moving =
      Math.abs((this.cx - this.lastCx) * this.z) > 0.25 ||
      Math.abs((this.cy - this.lastCy) * this.z) > 0.25 ||
      Math.abs(this.z - this.lastZ) > this.z * 0.002;
    if (moving) {
      ctx.drawImage(this.bg, 0, 0, this.w, this.h);
      this.drawGasDirect(alpha);
    } else {
      this.ensureSky(now, alpha);
      ctx.drawImage(this.skyCv, 0, 0, this.w, this.h);
    }
    this.lastCx = this.cx;
    this.lastCy = this.cy;
    this.lastZ = this.z;
    // The Big Bang: a cooling glow that becomes the gas disc.
    if (t < 600) {
      const f = t / 600;
      const [x, y] = this.toScreen(0, 0);
      const r = Math.max(4, (40 + f * RADIUS * 1.4) * this.z);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = 1 - f;
      g.addColorStop(0, `rgba(255,250,235,${0.95 * a})`);
      g.addColorStop(0.3, `rgba(255,190,120,${0.55 * a})`);
      g.addColorStop(1, 'rgba(120,60,140,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.globalCompositeOperation = 'source-over';
    this.drawCivs(now);
    this.drawStars(now);
    this.drawOverlays(now);
    this.drawFx(now);
  }

  /** Compose background + gas in screen space, only when something changed. */
  private ensureSky(now: number, alpha: number): void {
    const s = this.u.s;
    if (now - this.gasAt > 220) {
      this.gasAt = now;
      const d = this.gasImg.data;
      const sfr = this.u.sfr;
      for (let i = 0; i < s.gas.length; i++) {
        const g = s.gas[i];
        const m = Math.min(1, s.metal[i] / 1.5);
        const f = Math.min(1, sfr[i] / 2);
        const a = Math.min(1, g / 1.6);
        const o = i * 4;
        d[o] = 70 + m * 120 + f * 160;
        d[o + 1] = 80 + m * 70 + f * 20;
        d[o + 2] = 170 - m * 60 + f * 40;
        d[o + 3] = Math.min(255, a * 200 + f * 50);
      }
      this.gasCtx.putImageData(this.gasImg, 0, 0);
      // Bake the softening (once a grid the second, offset pass) into the small
      // canvas, so it never needs a second composite.
      const sc = this.gasSoftCtx;
      sc.clearRect(0, 0, GRID, GRID);
      sc.globalCompositeOperation = 'lighter';
      sc.globalAlpha = 0.62;
      sc.drawImage(this.gasCv, 0, 0);
      sc.globalAlpha = 0.38;
      sc.drawImage(this.gasCv, 0.5, 0.5);
      sc.globalAlpha = 1;
      this.skyKey = '';
    }
    const key = `${this.w}|${this.h}|${this.dpr}|${this.cx.toFixed(1)}|${this.cy.toFixed(1)}|${this.z.toFixed(3)}|${alpha.toFixed(2)}`;
    if (key === this.skyKey) return;
    this.skyKey = key;
    const dpr = this.dpr;
    const W = Math.round(this.w * dpr);
    const H = Math.round(this.h * dpr);
    if (this.skyCv.width !== W || this.skyCv.height !== H) {
      this.skyCv.width = W;
      this.skyCv.height = H;
    }
    const sky = this.skyCtx;
    sky.setTransform(dpr, 0, 0, dpr, 0, 0);
    sky.globalCompositeOperation = 'source-over';
    sky.globalAlpha = 1;
    sky.imageSmoothingEnabled = true;
    sky.drawImage(this.bg, 0, 0, this.w, this.h);
    if (alpha > 0) {
      sky.globalCompositeOperation = 'lighter';
      sky.globalAlpha = 0.9 * alpha;
      const [x0, y0] = this.toScreen(-SPAN / 2, -SPAN / 2);
      sky.drawImage(this.gasSoftCv, x0, y0, SPAN * this.z, SPAN * this.z);
    }
    sky.globalAlpha = 1;
    sky.globalCompositeOperation = 'source-over';
  }

  /** The gas at its world position, for frames where the camera is moving. */
  private drawGasDirect(alpha: number): void {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    const [x0, y0] = this.toScreen(-SPAN / 2, -SPAN / 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.9 * alpha;
    ctx.drawImage(this.gasSoftCv, x0, y0, SPAN * this.z, SPAN * this.z);
    ctx.restore();
  }

  private starColor(i: number): string {
    const ph = this.u.s.sphase[i];
    if (this.colorPhase[i] !== ph) {
      this.colorPhase[i] = ph;
      const [r, g, b] = tempRgb(this.u.starTemp(i));
      this.colorOf[i] = `rgb(${r | 0},${g | 0},${b | 0})`;
    }
    return this.colorOf[i];
  }

  private glowSprite(color: string): HTMLCanvasElement {
    let c = this.glow.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.18, color.replace('rgb', 'rgba').replace(')', ',0.7)'));
    grad.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ',0)'));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    if (this.glow.size > 200) this.glow.clear();
    this.glow.set(color, c);
    return c;
  }

  private drawStars(now: number): void {
    const ctx = this.ctx;
    const u = this.u;
    const s = u.s;
    const zf = Math.min(3, Math.max(0.6, Math.sqrt(this.z / 0.45)));
    const margin = 30;
    // Inline projection: this loop runs thousands of times a frame and tuples
    // for every star add up.
    const z = this.z;
    const ox = this.w / 2 - this.cx * z;
    const oy = this.h / 2 - this.cy * z;
    let lastColor = '';
    let glows = 0;
    for (let i = 0; i < s.n; i++) {
      if (s.sm[i] <= 0) continue;
      const x = s.sx[i] * z + ox;
      const y = s.sy[i] * z + oy;
      if (x < -margin || y < -margin || x > this.w + margin || y > this.h + margin) continue;
      const ph = s.sphase[i];
      if (ph === Phase.BlackHole) {
        if (this.z > 0.7) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = 'rgba(255,170,90,0.8)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(x, y, 3.2 * zf, 1.3 * zf, 0.4, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = '#000';
          lastColor = '#000';
          ctx.beginPath();
          ctx.arc(x, y, 1.5 * zf, 0, TAU);
          ctx.fill();
        } else {
          if (lastColor !== 'rgba(170,120,220,0.7)') {
            ctx.fillStyle = 'rgba(170,120,220,0.7)';
            lastColor = 'rgba(170,120,220,0.7)';
          }
          ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
        }
        continue;
      }
      const lum = u.starLum(i);
      const color = ph === Phase.Neutron ? 'rgb(170,230,255)' : this.starColor(i);
      let r = Math.min(3.2, 0.45 + 0.42 * Math.log10(1 + lum)) * zf;
      let a = 1;
      if (ph === Phase.Proto) {
        r *= 0.7;
        a = 0.55;
      } else if (ph === Phase.Giant) r *= 1.5;
      else if (ph === Phase.WhiteDwarf) {
        r = 0.55 * zf;
        a = 0.8;
      } else if (ph === Phase.Neutron) {
        r = 0.6 * zf;
        a = 0.6 + 0.4 * Math.abs(Math.sin(now / 120 + i));
      }
      // Only the brightest stars get a glow sprite, and only so many per frame.
      if ((lum > 40 || ph === Phase.Giant) && r > 0.6 && glows < 110) {
        glows++;
        const gr = r * (ph === Phase.Giant ? 5 : 6);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6 * a;
        ctx.drawImage(this.glowSprite(color), x - gr, y - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a;
      if (color !== lastColor) {
        ctx.fillStyle = color;
        lastColor = color;
      }
      if (r < 1.1) ctx.fillRect(x - r, y - r, r * 2, r * 2);
      else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawCivs(now: number): void {
    const ctx = this.ctx;
    const s = this.u.s;
    const z = this.z;
    const ox = this.w / 2 - this.cx * z;
    const oy = this.h / 2 - this.cy * z;
    for (const c of s.civs) {
      if (!alive(c)) continue;
      const hx = s.sx[c.star] * z + ox;
      const hy = s.sy[c.star] * z + oy;
      ctx.strokeStyle = `hsla(${c.hue},85%,65%,0.45)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const j of c.stars) {
        if (j === c.star) continue;
        ctx.moveTo(hx, hy);
        ctx.lineTo(s.sx[j] * z + ox, s.sy[j] * z + oy);
      }
      ctx.stroke();
      ctx.fillStyle = `hsla(${c.hue},85%,65%,0.16)`;
      for (const j of c.stars) {
        ctx.beginPath();
        ctx.arc(s.sx[j] * z + ox, s.sy[j] * z + oy, Math.max(4, 12 * Math.sqrt(this.z)), 0, TAU);
        ctx.fill();
      }
      // Home: a pulsing ring, and a swarm once they build one.
      const pr = Math.max(6, 9 * Math.sqrt(this.z)) + Math.sin(now / 400) * 1.5;
      ctx.strokeStyle = `hsla(${c.hue},90%,70%,0.9)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy, pr, 0, TAU);
      ctx.stroke();
      if (c.era >= ERA_INDEX.dyson) {
        ctx.fillStyle = 'rgba(255,220,140,0.9)';
        for (let k = 0; k < 14; k++) {
          const a = now / 900 + (k * TAU) / 14;
          ctx.fillRect(hx + Math.cos(a) * pr * 0.6 - 0.6, hy + Math.sin(a) * pr * 0.6 - 0.6, 1.2, 1.2);
        }
      }
    }
  }

  private drawOverlays(now: number): void {
    const ctx = this.ctx;
    const u = this.u;
    const s = u.s;
    const showRings = this.z > 0.22;
    const z = this.z;
    const ox = this.w / 2 - this.cx * z;
    const oy = this.h / 2 - this.cy * z;
    ctx.lineWidth = 1;
    if (showRings) {
      for (let i = 0; i < s.n; i++) {
        const st = u.lifeAt[i];
        if (!st) continue;
        const x = s.sx[i] * z + ox;
        const y = s.sy[i] * z + oy;
        if (x < -20 || y < -20 || x > this.w + 20 || y > this.h + 20) continue;
        ctx.strokeStyle = st >= 4 ? 'rgba(120,255,220,0.85)' : st >= 2 ? 'rgba(120,230,120,0.7)' : 'rgba(120,200,120,0.45)';
        ctx.beginPath();
        ctx.arc(x, y, 3 + st * 0.9, 0, TAU);
        ctx.stroke();
      }
    }
    // Labels for interesting stars when zoomed in, and the selection.
    ctx.font = '600 11px Inter Variable, system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (this.z > 0.9) {
      for (let i = 0; i < s.n; i++) {
        if (!(u.lifeAt[i] >= 3 || u.civAt[i]) || i === this.selStar) continue;
        const x = s.sx[i] * z + ox;
        const y = s.sy[i] * z + oy;
        if (x < 0 || y < 0 || x > this.w || y > this.h) continue;
        ctx.fillStyle = 'rgba(210,225,255,0.75)';
        ctx.fillText(u.names[i], x, y - 10);
      }
    }
    if (this.selStar >= 0 && s.sm[this.selStar] > 0) {
      const x = s.sx[this.selStar] * z + ox;
      const y = s.sy[this.selStar] * z + oy;
      const r = 10 + Math.sin(now / 300) * 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(u.names[this.selStar], x, y - r - 6);
    }
  }

  private drawFx(now: number): void {
    const ctx = this.ctx;
    for (const e of this.fx) {
      const age = (now - e.born) / 1000;
      const [x, y] = this.toScreen(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      if (e.fx === 'supernova') {
        const f = Math.min(1, age / 2.6);
        const r = Math.max(6, f * 90 * this.z);
        ctx.strokeStyle = `rgba(255,200,140,${(1 - f) * 0.9})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
        if (age < 0.5) {
          const fl = ctx.createRadialGradient(x, y, 0, x, y, 30);
          fl.addColorStop(0, `rgba(255,255,255,${1 - age * 2})`);
          fl.addColorStop(1, 'rgba(255,200,150,0)');
          ctx.fillStyle = fl;
          ctx.fillRect(x - 30, y - 30, 60, 60);
        }
      } else if (e.fx === 'grb') {
        const f = Math.min(1, age / 2);
        ctx.strokeStyle = `rgba(190,170,255,${(1 - f) * 0.9})`;
        ctx.lineWidth = 2.5;
        const L = 900 * this.z;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(e.angle) * L, y - Math.sin(e.angle) * L);
        ctx.lineTo(x + Math.cos(e.angle) * L, y + Math.sin(e.angle) * L);
        ctx.stroke();
      } else if (e.fx === 'matter') {
        const f = Math.min(1, age / 2.4);
        const r = 20 + f * 60 * this.z;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(170,190,255,${(1 - f) * 0.7})`);
        g.addColorStop(1, 'rgba(120,140,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      } else {
        const color = e.fx === 'impact' ? '255,140,80' : e.fx === 'seed' ? '130,255,150' : e.fx === 'shield' ? '120,190,255' : '255,230,140';
        const f = Math.min(1, age / 1.6);
        ctx.strokeStyle = `rgba(${color},${1 - f})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 4 + f * 26, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // --- System view ------------------------------------------------------------------------------

  private drawSystem(now: number): void {
    const ctx = this.ctx;
    const u = this.u;
    const s = u.s;
    const i = this.sysStar;
    const planets = u.planets[i] ?? [];
    const ph = s.sphase[i];
    const lum = u.starLum(i);
    const cx = this.inset.left + (this.w - this.inset.left - this.inset.right) / 2;
    const cy = this.inset.top + (this.h - this.inset.top - this.inset.bottom) / 2;
    const availW = (this.w - this.inset.left - this.inset.right) / 2 - 24;
    const availH = ((this.h - this.inset.top - this.inset.bottom) / 2 - 24) / 0.5;
    const R = Math.max(60, Math.min(availW, availH));
    const sr = ph === Phase.Giant ? Math.min(R * 0.22, 46) : ph === Phase.WhiteDwarf || ph === Phase.Neutron ? 4 : ph === Phase.BlackHole ? 9 : Math.min(26, 8 + Math.log10(1 + lum) * 5);
    const amax = Math.max(3, ...planets.map((p) => p.a * 1.25));
    const amin = 0.03;
    const r0 = sr + 16;
    const rOf = (a: number) => r0 + (R - r0) * (Math.log(Math.max(amin, a) / amin) / Math.log(amax / amin));
    this.sysPos = [];

    // Habitable zone.
    if (ph === Phase.Main || ph === Phase.Giant) {
      const aIn = Math.pow((278 * Math.pow(lum, 0.25)) / 340, 2);
      const aOut = Math.pow((278 * Math.pow(lum, 0.25)) / 235, 2);
      const r1 = rOf(aIn);
      const r2 = rOf(aOut);
      if (r2 > r0 && r1 < R * 1.3) {
        ctx.fillStyle = 'rgba(80,200,120,0.07)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, r2, r2 * 0.5, 0, 0, TAU);
        ctx.ellipse(cx, cy, Math.max(r0, r1), Math.max(r0, r1) * 0.5, 0, 0, TAU, true);
        ctx.fill('evenodd');
      }
    }

    // Orbits.
    ctx.lineWidth = 1;
    for (const p of planets) {
      const r = rOf(p.a);
      ctx.strokeStyle = s.ps[p.id]?.gone ? 'rgba(255,140,100,0.18)' : 'rgba(150,170,230,0.18)';
      ctx.setLineDash(s.ps[p.id]?.gone ? [2, 5] : []);
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Planets behind the star first, then the star, then planets in front.
    const pos = planets.map((p) => {
      const r = rOf(p.a);
      const ang = ((p.look % 1000) / 1000) * TAU + now / 1000 / Math.pow(p.a + 0.3, 0.75) / 3;
      return { p, x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * 0.5, behind: Math.sin(ang) < 0 };
    });
    for (const q of pos) if (q.behind) this.drawPlanetDot(q.p.id, q.x, q.y, now);
    this.drawSun(cx, cy, sr, now);
    for (const q of pos) if (!q.behind) this.drawPlanetDot(q.p.id, q.x, q.y, now);
    this.sysPos.push({ id: -2, x: cx, y: cy, r: sr });

    // A Dyson swarm around a civilization's star.
    const civ = s.civs.find((c) => alive(c) && c.star === i && c.era >= ERA_INDEX.dyson);
    if (civ) {
      ctx.fillStyle = 'rgba(255,220,150,0.85)';
      for (let k = 0; k < 90; k++) {
        const rr = sr + 8 + (k % 5) * 3;
        const a = now / (1400 + (k % 5) * 300) + k * 2.399;
        ctx.fillRect(cx + Math.cos(a) * rr - 0.7, cy + Math.sin(a) * rr * 0.5 - 0.7, 1.4, 1.4);
      }
    }
    // Effects aimed at this star play around it.
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.fx) {
      if (e.star !== i) continue;
      const f = Math.min(1, (now - e.born) / 1600);
      const color = e.fx === 'impact' ? '255,140,80' : e.fx === 'seed' ? '130,255,150' : e.fx === 'shield' ? '120,190,255' : e.fx === 'supernova' ? '255,220,170' : '255,230,140';
      ctx.strokeStyle = `rgba(${color},${1 - f})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, sr + 10 + f * R * 0.5, (sr + 10 + f * R * 0.5) * 0.5, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawSun(x: number, y: number, r: number, now: number): void {
    const ctx = this.ctx;
    const i = this.sysStar;
    const ph = this.u.s.sphase[i];
    if (ph === Phase.BlackHole) {
      ctx.strokeStyle = 'rgba(255,170,90,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 2.6, r * 0.9, 0.2, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      return;
    }
    const color = ph === Phase.Neutron ? 'rgb(170,230,255)' : this.starColor(i);
    const gr = r * (ph === Phase.WhiteDwarf || ph === Phase.Neutron ? 6 : 3.2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.glowSprite(color), x - gr, y - gr, gr * 2, gr * 2);
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.5, color);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + Math.sin(now / 700) * 0.01), 0, TAU);
    ctx.fill();
    if (this.selPlanet === -1 && this.selStar === i) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, TAU);
      ctx.stroke();
    }
  }

  private drawPlanetDot(pid: number, x: number, y: number, now: number): void {
    const ctx = this.ctx;
    const u = this.u;
    const s = u.s;
    const p = u.planet(pid)!;
    const st = s.ps[pid];
    if (st?.gone) return;
    const temp = u.planetTemp(p);
    const kind = kindOf(p, temp);
    const [cr, cg, cb] = KIND_COLOR[kind];
    const size = p.body === 'gas' ? Math.min(13, 6 + p.radius * 0.6) : Math.min(8, 3 + p.radius * 1.8);
    const life = st?.life && st.life.dead < 0 ? st.life.stage : 0;
    if (life) {
      const g = ctx.createRadialGradient(x, y, size, x, y, size + 7);
      g.addColorStop(0, `rgba(110,255,150,${0.25 + life * 0.08})`);
      g.addColorStop(1, 'rgba(110,255,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, size + 7, 0, TAU);
      ctx.fill();
    }
    if (p.rings) {
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.55)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, size * 1.9, size * 0.6, -0.35, 0, TAU);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(x - size * 0.35, y - size * 0.35, size * 0.1, x, y, size);
    g.addColorStop(0, `rgb(${Math.min(255, cr + 60)},${Math.min(255, cg + 60)},${Math.min(255, cb + 60)})`);
    g.addColorStop(1, `rgb(${cr * 0.45},${cg * 0.45},${cb * 0.45})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, TAU);
    ctx.fill();
    // Civilization: city lights, and stations once they reach orbit.
    if (st?.civ) {
      const c = u.civ(st.civ);
      if (c) {
        ctx.fillStyle = `hsl(${c.hue},95%,72%)`;
        ctx.strokeStyle = `hsla(${c.hue},90%,70%,0.9)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, size + 3, 0, TAU);
        ctx.stroke();
        if (c.era >= ERA_INDEX.spaceflight && c.planet === pid) {
          for (let k = 0; k < 3; k++) {
            const a = now / 600 + (k * TAU) / 3;
            ctx.fillRect(x + Math.cos(a) * (size + 7) - 1, y + Math.sin(a) * (size + 7) * 0.6 - 1, 2, 2);
          }
        }
      }
    }
    if (st?.ruins?.length) {
      ctx.strokeStyle = 'rgba(220,200,160,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + size + 3, y - size - 1);
      ctx.lineTo(x + size + 7, y - size - 7);
      ctx.lineTo(x + size + 11, y - size - 1);
      ctx.closePath();
      ctx.stroke();
    }
    if (pid === this.selPlanet) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, size + 6 + Math.sin(now / 300), 0, TAU);
      ctx.stroke();
    }
    ctx.font = '600 10.5px Inter Variable, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = pid === this.selPlanet ? '#fff' : 'rgba(200,215,245,0.65)';
    ctx.fillText(p.name, x, y + size + 14);
    this.sysPos.push({ id: pid, x, y, r: size });
  }

  // --- Background -------------------------------------------------------------------------------

  private makeBackground(): void {
    const c = this.bg;
    c.width = Math.round(this.w * this.dpr);
    c.height = Math.round(this.h * this.dpr);
    const g = c.getContext('2d')!;
    g.fillStyle = '#02030a';
    g.fillRect(0, 0, c.width, c.height);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const n = Math.round((c.width * c.height) / 2600);
    for (let k = 0; k < n; k++) {
      const a = 0.15 + rnd() * 0.45;
      g.fillStyle = `rgba(${200 + rnd() * 55},${205 + rnd() * 50},255,${a})`;
      const r = rnd() < 0.05 ? 1.4 : 0.8;
      g.fillRect(rnd() * c.width, rnd() * c.height, r * this.dpr, r * this.dpr);
    }
  }

  /** Where a planet's star sits on screen in the galaxy view (for the camera). */
  starWorld(i: number): [number, number] {
    return [this.u.s.sx[i], this.u.s.sy[i]];
  }

  planetStar(pid: number): number {
    return Math.floor(pid / PLANET_STRIDE);
  }
}
