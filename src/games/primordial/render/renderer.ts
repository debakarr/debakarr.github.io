import { G, GENES } from '../sim/genes';
import { CAP, CELL, GH, GW, H, W, type World } from '../sim/world';

// Draws the primordial sea: a soft plant field, temperature tint, effects,
// and every creature as a little organism whose look follows its genes.

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  world: World;
  W = 1;
  H = 1;
  dpr = 1;
  cx = W / 2;
  cy = H / 2;
  z = 0.5;
  follow = -1;
  /** Followed creature's uid, to notice when it dies. */
  followUid = -1;
  selectedSpecies = -1;
  private field = document.createElement('canvas');
  private fieldImg: ImageData;
  private shake = 0;
  private flash: { x: number; y: number; t: number } | null = null;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.world = world;
    this.field.width = GW;
    this.field.height = GH;
    this.fieldImg = this.field.getContext('2d')!.createImageData(GW, GH);
  }

  setWorld(w: World): void {
    this.world = w;
    this.follow = -1;
    this.selectedSpecies = -1;
    w.plantsDirty = true;
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.clamp();
  }

  get minZoom(): number {
    return Math.min(this.W / W, this.H / H) * 0.95;
  }

  clamp(): void {
    this.z = Math.max(this.minZoom, Math.min(4, this.z));
    const hw = this.W / 2 / this.z;
    const hh = this.H / 2 / this.z;
    this.cx = hw * 2 >= W ? W / 2 : Math.max(hw, Math.min(W - hw, this.cx));
    this.cy = hh * 2 >= H ? H / 2 : Math.max(hh, Math.min(H - hh, this.cy));
  }

  pan(dx: number, dy: number): void {
    this.cx -= dx / this.z;
    this.cy -= dy / this.z;
    this.follow = -1;
    this.clamp();
  }

  zoomAt(sx: number, sy: number, f: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.z *= f;
    this.clamp();
    this.cx = wx - (sx - this.W / 2) / this.z;
    this.cy = wy - (sy - this.H / 2) / this.z;
    this.clamp();
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.W / 2) / this.z + this.cx, (sy - this.H / 2) / this.z + this.cy];
  }

  fit(): void {
    // Landscape screens see the whole sea; tall screens fill their height instead.
    this.z = this.W >= this.H ? this.minZoom : Math.min(this.H / H, this.W / W * 2.2) * 0.85;
    this.cx = W / 2;
    this.cy = H / 2;
    this.clamp();
  }

  meteorFlash(x: number, y: number): void {
    this.flash = { x, y, t: performance.now() };
    this.shake = 1;
  }

  private paintField(): void {
    const w = this.world;
    const d = this.fieldImg.data;
    const s = w.s;
    const gT = w.globalTemp();
    for (let i = 0; i < GW * GH; i++) {
      const p = Math.min(1, s.plants[i] / 70);
      const m = Math.min(1, s.meat[i] / 160);
      const cy = (i / GW) | 0;
      const temp = Math.max(0, Math.min(1, 0.12 + ((cy * CELL) / H) * 0.76 + s.tempNoise[i] + gT));
      // Cold water is deep blue, warm water teal; plants glow green, carrion rust.
      let r = 8 + temp * 18;
      let g = 30 + temp * 30;
      let b = 62 - temp * 22;
      if (temp < 0.12) {
        const ice = (0.12 - temp) / 0.12;
        r += ice * 60;
        g += ice * 70;
        b += ice * 80;
      }
      r += p * 30 + m * 60;
      g += p * 150 + m * 20;
      b += p * 40;
      // A little grain so open water never reads as one flat colour.
      const grain = (((i * 2654435761) >>> 9) % 13) - 6;
      d[i * 4] = r + grain * 0.5;
      d[i * 4 + 1] = g + grain * 0.6;
      d[i * 4 + 2] = b + grain * 0.4;
      d[i * 4 + 3] = 255;
    }
    this.field.getContext('2d')!.putImageData(this.fieldImg, 0, 0);
    w.plantsDirty = false;
  }

  frame(now: number): void {
    const { ctx, dpr, z } = this;
    const w = this.world;
    const s = w.s;
    if (this.follow >= 0) {
      if (s.alive[this.follow] && s.uid[this.follow] === this.followUid) {
        this.cx += (s.x[this.follow] - this.cx) * 0.12;
        this.cy += (s.y[this.follow] - this.cy) * 0.12;
        this.clamp();
      } else this.follow = -1;
    }
    if (w.plantsDirty) this.paintField();
    let sx = 0;
    let sy = 0;
    if (this.shake > 0.01) {
      sx = (Math.random() - 0.5) * 18 * this.shake;
      sy = (Math.random() - 0.5) * 18 * this.shake;
      this.shake *= 0.9;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#020a14';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.W / 2 - this.cx * z + sx), dpr * (this.H / 2 - this.cy * z + sy));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.field, 0, 0, W, H);
    // Depth: the water darkens away from the light.
    const deep = ctx.createLinearGradient(0, 0, 0, H);
    deep.addColorStop(0, 'rgba(4,16,34,0)');
    deep.addColorStop(0.55, 'rgba(4,14,30,0.12)');
    deep.addColorStop(1, 'rgba(2,8,22,0.42)');
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, W, H);
    // Caustic shimmer.
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#bfefff';
    ctx.lineWidth = 3 / z;
    const ph = now / 4000;
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const y0 = (k / 9) * H + Math.sin(ph + k) * 20;
      ctx.moveTo(0, y0);
      for (let x = 0; x <= W; x += 120) ctx.lineTo(x, y0 + Math.sin(x / 180 + ph * 2 + k) * 18);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Effects.
    for (const e of s.effects) {
      if (e.kind === 'bloom') {
        const a = Math.max(0, 1 - (s.t - e.t0) / (e.t1 - e.t0));
        ctx.strokeStyle = `rgba(140,255,170,${0.4 * a})`;
        ctx.lineWidth = 3 / z;
        ctx.setLineDash([12 / z, 10 / z]);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (e.kind === 'meteor') {
        const a = Math.max(0, 1 - (s.t - e.t0) / (e.t1 - e.t0));
        const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
        grad.addColorStop(0, `rgba(255,140,60,${0.55 * a})`);
        grad.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Creatures.
    const g = s.genes;
    const [vx0, vy0] = this.toWorld(0, 0);
    const [vx1, vy1] = this.toWorld(this.W, this.H);
    const detail = z > 0.9;
    const selSp = this.selectedSpecies;
    for (let i = 0; i < CAP; i++) {
      if (!s.alive[i]) continue;
      const x = s.x[i];
      const y = s.y[i];
      const r = w.r[i];
      if (x < vx0 - r || x > vx1 + r || y < vy0 - r || y > vy1 + r) continue;
      const o = i * GENES;
      const hue = Math.round(g[o + G.Hue] * 360);
      const diet = g[o + G.Diet];
      const light = 55 + (1 - diet) * 10;
      const dim = selSp >= 0 && s.species[i] !== selSp;
      ctx.globalAlpha = dim ? 0.25 : 1;
      const a = w.heading[i];
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Tail / flagellum, wiggling with speed.
      if (detail) {
        const wig = Math.sin(now / 90 + i) * 0.5;
        ctx.strokeStyle = `hsla(${hue},55%,${light - 15}%,0.8)`;
        ctx.lineWidth = Math.max(0.8, r * 0.25);
        ctx.beginPath();
        ctx.moveTo(x - ca * r, y - sa * r);
        ctx.quadraticCurveTo(x - ca * r * 1.8 - sa * r * wig, y - sa * r * 1.8 + ca * r * wig, x - ca * r * 2.4, y - sa * r * 2.4);
        ctx.stroke();
      }
      ctx.fillStyle = `hsl(${hue},${60 + diet * 20}%,${light}%)`;
      ctx.beginPath();
      if (diet > 0.45) {
        // Hunters are pointed, with a notch for a mouth.
        ctx.moveTo(x + ca * r * 1.4, y + sa * r * 1.4);
        ctx.lineTo(x - sa * r - ca * r * 0.6, y + ca * r - sa * r * 0.6);
        ctx.lineTo(x - ca * r * 0.3, y - sa * r * 0.3);
        ctx.lineTo(x + sa * r - ca * r * 0.6, y - ca * r - sa * r * 0.6);
        ctx.closePath();
      } else {
        ctx.ellipse(x, y, r * 1.15, r * 0.85, a, 0, Math.PI * 2);
      }
      ctx.fill();
      if (detail) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(x + ca * r * 0.55, y + sa * r * 0.55, Math.max(0.6, r * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // The followed creature.
    if (this.follow >= 0 && s.alive[this.follow]) {
      const i = this.follow;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / z;
      ctx.beginPath();
      ctx.arc(s.x[i], s.y[i], w.r[i] * 2 + 6 / z, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.setLineDash([6 / z, 6 / z]);
      ctx.beginPath();
      ctx.arc(s.x[i], s.y[i], w.sense[i], 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // World edge.
    ctx.strokeStyle = 'rgba(160,220,255,0.25)';
    ctx.lineWidth = 2 / z;
    ctx.strokeRect(0, 0, W, H);
    // Meteor flash.
    if (this.flash) {
      const age = (now - this.flash.t) / 700;
      if (age > 1) this.flash = null;
      else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = `rgba(255,230,200,${0.6 * (1 - age)})`;
        ctx.fillRect(0, 0, this.W, this.H);
      }
    }
    if (this.flash) return;
    // Light through the water, and a soft vignette: the sea feels deep.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const sway = Math.sin(now / 5200 + k * 2.1) * 0.16;
      const cx = this.W * (0.22 + k * 0.28) + sway * this.W;
      const spread = this.W * 0.16;
      const shaft = ctx.createLinearGradient(cx - spread, 0, cx + spread, 0);
      shaft.addColorStop(0, 'rgba(150,220,255,0)');
      shaft.addColorStop(0.5, 'rgba(150,220,255,0.035)');
      shaft.addColorStop(1, 'rgba(150,220,255,0)');
      ctx.fillStyle = shaft;
      ctx.beginPath();
      ctx.moveTo(cx - spread * 0.35, 0);
      ctx.lineTo(cx + spread * 0.35, 0);
      ctx.lineTo(cx + spread * 1.5, this.H);
      ctx.lineTo(cx + spread * 0.9, this.H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const vig = ctx.createRadialGradient(
      this.W / 2,
      this.H / 2,
      Math.min(this.W, this.H) * 0.42,
      this.W / 2,
      this.H / 2,
      Math.max(this.W, this.H) * 0.78,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(2,6,16,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.W, this.H);
  }
}
