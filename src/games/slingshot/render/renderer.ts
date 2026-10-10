import { Noise2D } from '../../shared/noise';
import { Rng } from '../../shared/rng';
import { captureRadius, positions, type Level, type Probe, type Trajectory } from '../sim/physics';
import { PIXEL_DPR, pixelate } from '../../shared/pixel';

// Draws a star system: starfield, orbits, shaded planets, the probe and its
// trail, the aiming band and the predicted path.

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface Scene {
  t: number;
  probe: Probe | null;
  trail: number[];
  preview: Trajectory | null;
  aim: { angle: number; power: number } | null;
  /** Where the finger is pulling the band, in world units. */
  pull: [number, number] | null;
  collected: boolean[];
  thrust: [number, number] | null;
  particles: Particle[];
  done: 'captured' | 'landed' | 'crashed' | 'lost' | null;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  level: Level;
  W = 1;
  H = 1;
  dpr = 1;
  cx = 0;
  cy = 0;
  z = 1;
  private xs: Float64Array;
  private ys: Float64Array;
  private textures = new Map<number, HTMLCanvasElement>();
  /** Parallax layers: [x, y, size, alpha, hue, saturation, depth]. */
  private stars: [number, number, number, number, number, number, number][] = [];
  /** A nebula drawn once and reused, so the sky is not a flat black field. */
  private nebula: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement, level: Level) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.level = level;
    this.xs = new Float64Array(level.bodies.length);
    this.ys = new Float64Array(level.bodies.length);
    this.seedStars(level.seed);
    this.buildNebula(level.seed);
  }

  /** A seeded sky: 720 stars in three depth layers, some tinted. */
  private seedStars(seed: number): void {
    const rng = new Rng((seed * 2654435761) >>> 0 || 7);
    this.stars = [];
    const layers = [
      { n: 380, size: [0.6, 1.1], alpha: [0.25, 0.55], depth: 0.04 },
      { n: 260, size: [0.9, 1.7], alpha: [0.4, 0.8], depth: 0.09 },
      { n: 80, size: [1.4, 2.6], alpha: [0.6, 1], depth: 0.16 },
    ];
    for (const layer of layers) {
      for (let k = 0; k < layer.n; k++) {
        const tint = rng.next();
        // Mostly white-blue, some warm giants, a few red dwarfs.
        const hue = tint > 0.93 ? 20 : tint > 0.78 ? 200 : tint > 0.6 ? 45 : 220;
        const sat = hue === 220 ? 14 : 48;
        this.stars.push([
          rng.next(),
          rng.next(),
          rng.float(layer.size[0], layer.size[1]),
          rng.float(layer.alpha[0], layer.alpha[1]),
          hue,
          sat,
          layer.depth,
        ]);
      }
    }
  }

  /** Soft coloured clouds, painted once into a screen-sized canvas. */
  private buildNebula(seed: number): void {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 512;
    const g = cv.getContext('2d')!;
    const rng = new Rng((seed * 40503 + 12345) >>> 0 || 11);
    const noise = new Noise2D(rng);
    g.fillStyle = '#05060f';
    g.fillRect(0, 0, 512, 512);
    // A broad band of gas across the frame, with a few brighter knots.
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 34; k++) {
      const x = rng.float(-40, 552);
      const y = 150 + noise.fbm(x * 0.006, 7, 3) * 210 + rng.float(-40, 40);
      const r = rng.float(60, 170);
      const hue = rng.next() > 0.55 ? 265 : rng.next() > 0.5 ? 200 : 320;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `hsla(${hue},60%,42%,${rng.float(0.05, 0.11).toFixed(3)})`);
      grd.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    for (let k = 0; k < 5; k++) {
      const x = rng.float(0, 512);
      const y = rng.float(0, 512);
      const r = rng.float(10, 26);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,235,190,0.22)');
      grd.addColorStop(1, 'rgba(255,235,190,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    this.nebula = cv;
  }

  setLevel(level: Level): void {
    this.level = level;
    this.xs = new Float64Array(level.bodies.length);
    this.ys = new Float64Array(level.bodies.length);
    this.textures.clear();
    this.seedStars(level.seed);
    this.buildNebula(level.seed);
    this.fit();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.dpr = PIXEL_DPR;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    pixelate(this.canvas);
    this.fit();
  }

  /** Fit the whole system (the outermost orbit) on screen. */
  fit(): void {
    let R = 120;
    positions(this.level, 0, this.xs, this.ys);
    for (let k = 0; k < this.level.bodies.length; k++) R = Math.max(R, Math.hypot(this.xs[k], this.ys[k]) + this.level.bodies[k].radius + 30);
    for (const b of this.level.beacons) R = Math.max(R, Math.hypot(b.x, b.y) + 30);
    this.z = Math.min(this.W, this.H) / (2 * R) * 0.94;
    this.cx = 0;
    this.cy = 0;
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.W / 2) / this.z + this.cx, (sy - this.H / 2) / this.z + this.cy];
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.cx) * this.z + this.W / 2, (wy - this.cy) * this.z + this.H / 2];
  }

  bodyAt(k: number, t: number): [number, number] {
    positions(this.level, t, this.xs, this.ys);
    return [this.xs[k], this.ys[k]];
  }

  /** A little planet texture: bands, spots and craters from the body's look. */
  private texture(k: number): HTMLCanvasElement {
    let tex = this.textures.get(k);
    if (tex) return tex;
    const b = this.level.bodies[k];
    const S = 128;
    tex = document.createElement('canvas');
    tex.width = S;
    tex.height = S;
    const c = tex.getContext('2d')!;
    c.fillStyle = b.color;
    c.fillRect(0, 0, S, S);
    let seed = Math.floor(b.look * 1e6) + 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const gassy = b.radius > 14 || b.look > 0.6;
    if (gassy) {
      for (let y = 0; y < S; y += 4) {
        c.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${0.05 + rnd() * 0.12})`;
        c.fillRect(0, y + Math.sin(y * 0.2) * 2, S, 3 + rnd() * 6);
      }
    } else {
      for (let n = 0; n < 14; n++) {
        c.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
        c.beginPath();
        c.arc(rnd() * S, rnd() * S, 4 + rnd() * 14, 0, Math.PI * 2);
        c.fill();
      }
      if (b.kind === 'planet' && rnd() > 0.4) {
        c.fillStyle = 'rgba(255,255,255,0.18)';
        for (let n = 0; n < 6; n++) {
          c.beginPath();
          c.ellipse(rnd() * S, rnd() * S, 10 + rnd() * 20, 5 + rnd() * 8, rnd() * 3, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    this.textures.set(k, tex);
    return tex;
  }

  frame(scene: Scene, now: number): void {
    const { ctx, dpr, z } = this;
    const L = this.level;
    const t = scene.t;
    positions(L, t, this.xs, this.ys);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(this.W / 2, this.H / 2, 0, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.7);
    bg.addColorStop(0, '#0d1433');
    bg.addColorStop(0.55, '#080c22');
    bg.addColorStop(1, '#04060f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.W, this.H);
    // The nebula drifts a little with the camera, so the sky has depth.
    if (this.nebula) {
      const px = -((this.cx * z * 0.06) % 512) - 512;
      const py = -((this.cy * z * 0.06) % 512) - 512;
      for (let gx = px; gx < this.W; gx += 512) {
        for (let gy = py; gy < this.H; gy += 512) {
          ctx.drawImage(this.nebula, gx, gy, 512, 512);
        }
      }
    }
    // Stars in three parallax layers, twinkling a little.
    for (const [x, y, size, alpha, hue, sat, depth] of this.stars) {
      const sx = ((x * this.W - this.cx * z * depth) % (this.W + 40) + this.W + 40) % (this.W + 40) - 20;
      const sy = ((y * this.H - this.cy * z * depth) % (this.H + 40) + this.H + 40) % (this.H + 40) - 20;
      const tw = 0.82 + 0.18 * Math.sin(now / 640 + x * 57 + y * 23);
      ctx.fillStyle = `hsla(${hue},${sat}%,88%,${(alpha * tw).toFixed(3)})`;
      ctx.fillRect(sx, sy, size, size);
      if (size > 1.8) {
        ctx.fillStyle = `hsla(${hue},${sat + 10}%,92%,${(alpha * 0.22 * tw).toFixed(3)})`;
        ctx.fillRect(sx - 1.6, sy - 1.6, size + 3.2, size + 3.2);
      }
    }
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.W / 2 - this.cx * z), dpr * (this.H / 2 - this.cy * z));
    // Orbits.
    ctx.lineWidth = 1 / z;
    for (let k = 0; k < L.bodies.length; k++) {
      const o = L.bodies[k].orbit;
      if (!o || L.bodies[k].kind === 'rock') continue;
      ctx.strokeStyle = k === L.target ? 'rgba(120,255,190,0.35)' : k === L.home ? 'rgba(120,190,255,0.35)' : 'rgba(150,170,220,0.14)';
      ctx.beginPath();
      ctx.arc(this.xs[o.parent], this.ys[o.parent], o.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Capture zone.
    const cr = captureRadius(L);
    const pulse = 1 + Math.sin(now / 300) * 0.04;
    ctx.strokeStyle = 'rgba(120,255,190,0.8)';
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([6 / z, 5 / z]);
    ctx.beginPath();
    ctx.arc(this.xs[L.target], this.ys[L.target], cr * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Beacons.
    L.beacons.forEach((b, k) => {
      const got = scene.collected[k];
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(now / 900);
      const s = 7 / Math.max(0.6, z);
      ctx.fillStyle = got ? 'rgba(255,220,120,0.18)' : '#ffd166';
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = got ? 0 : 10;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
    // Bodies.
    const sun = L.bodies.findIndex((b) => b.kind === 'star' || b.kind === 'blackhole');
    for (let k = 0; k < L.bodies.length; k++) {
      const b = L.bodies[k];
      const x = this.xs[k];
      const y = this.ys[k];
      if (b.kind === 'star') {
        const glow = ctx.createRadialGradient(x, y, b.radius * 0.5, x, y, b.radius * 4);
        glow.addColorStop(0, 'rgba(255,220,140,0.55)');
        glow.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, b.radius * 4, 0, Math.PI * 2);
        ctx.fill();
        const body = ctx.createRadialGradient(x - b.radius * 0.3, y - b.radius * 0.3, 2, x, y, b.radius);
        body.addColorStop(0, '#fff7d6');
        body.addColorStop(1, b.color);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(x, y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'blackhole') {
        const disk = ctx.createRadialGradient(x, y, b.radius, x, y, b.radius * 4);
        disk.addColorStop(0, 'rgba(255,150,60,0.9)');
        disk.addColorStop(0.4, 'rgba(255,90,40,0.35)');
        disk.addColorStop(1, 'rgba(120,40,160,0)');
        ctx.fillStyle = disk;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(now / 4000);
        ctx.scale(1, 0.45);
        ctx.beginPath();
        ctx.arc(0, 0, b.radius * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x, y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,140,0.8)';
        ctx.lineWidth = 2 / z;
        ctx.stroke();
      } else if (b.kind === 'rock') {
        if (b.radius < 1) continue;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        for (let v = 0; v < 7; v++) {
          const a = (v / 7) * Math.PI * 2;
          const rr = b.radius * (0.75 + ((Math.sin(b.look * 50 + v * 3) + 1) / 2) * 0.35);
          if (v) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        if (b.rings) {
          ctx.strokeStyle = 'rgba(230,220,200,0.45)';
          ctx.lineWidth = 3 / z;
          ctx.beginPath();
          ctx.ellipse(x, y, b.radius * 1.9, b.radius * 0.6, -0.4, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, b.radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(this.texture(k), x - b.radius, y - b.radius, b.radius * 2, b.radius * 2);
        // Night side, away from the sun.
        const sx = sun >= 0 ? this.xs[sun] : 0;
        const sy = sun >= 0 ? this.ys[sun] : 0;
        const a = Math.atan2(y - sy, x - sx);
        const shade = ctx.createLinearGradient(x - Math.cos(a) * b.radius, y - Math.sin(a) * b.radius, x + Math.cos(a) * b.radius, y + Math.sin(a) * b.radius);
        shade.addColorStop(0, 'rgba(0,0,0,0)');
        shade.addColorStop(0.55, 'rgba(0,0,0,0.25)');
        shade.addColorStop(1, 'rgba(0,0,10,0.8)');
        ctx.fillStyle = shade;
        ctx.fillRect(x - b.radius, y - b.radius, b.radius * 2, b.radius * 2);
        ctx.restore();
      }
      if (k === L.home || k === L.target) {
        ctx.fillStyle = k === L.home ? 'rgba(150,200,255,0.9)' : 'rgba(140,255,200,0.95)';
        ctx.font = `${11 / z}px "JetBrains Mono Variable", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(k === L.home ? 'HOME' : 'TARGET', x, y - (k === L.target ? cr : b.radius) - 8 / z);
      }
    }
    // Prediction.
    const pv = scene.preview;
    if (pv && pv.count > 1) {
      ctx.lineWidth = 2 / z;
      for (let k = 1; k < pv.count; k++) {
        if (k % 2) continue;
        const a = 1 - k / pv.count;
        ctx.strokeStyle = `rgba(160,220,255,${0.15 + a * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(pv.points[(k - 1) * 2], pv.points[(k - 1) * 2 + 1]);
        ctx.lineTo(pv.points[k * 2], pv.points[k * 2 + 1]);
        ctx.stroke();
      }
      const ex = pv.points[(pv.count - 1) * 2];
      const ey = pv.points[(pv.count - 1) * 2 + 1];
      const kind = pv.outcome.kind;
      ctx.lineWidth = 2.5 / z;
      if (kind === 'captured' || kind === 'landed') {
        ctx.strokeStyle = '#7dffb3';
        ctx.beginPath();
        ctx.arc(ex, ey, 9 / z, 0, Math.PI * 2);
        ctx.stroke();
      } else if (kind === 'crashed') {
        ctx.strokeStyle = '#ff6b5e';
        const s = 7 / z;
        ctx.beginPath();
        ctx.moveTo(ex - s, ey - s);
        ctx.lineTo(ex + s, ey + s);
        ctx.moveTo(ex + s, ey - s);
        ctx.lineTo(ex - s, ey + s);
        ctx.stroke();
      }
    }
    // Aiming band: stretched from the planet to the finger, arrow the other way.
    if (scene.aim) {
      const hx = this.xs[L.home];
      const hy = this.ys[L.home];
      const ax = Math.cos(scene.aim.angle);
      const ay = Math.sin(scene.aim.angle);
      const hr = L.bodies[L.home].radius;
      const pull = scene.pull ?? [hx - ax * (30 + scene.aim.power * 90) / z, hy - ay * (30 + scene.aim.power * 90) / z];
      const warm = `rgba(255,${Math.round(220 - scene.aim.power * 120)},110,0.9)`;
      ctx.strokeStyle = warm;
      ctx.lineWidth = 2.5 / z;
      ctx.beginPath();
      ctx.moveTo(hx - ay * hr, hy + ax * hr);
      ctx.lineTo(pull[0], pull[1]);
      ctx.lineTo(hx + ay * hr, hy - ax * hr);
      ctx.stroke();
      ctx.fillStyle = warm;
      ctx.beginPath();
      ctx.arc(pull[0], pull[1], 5 / z, 0, Math.PI * 2);
      ctx.fill();
      const tipD = hr + (18 + scene.aim.power * 30) / z;
      const tipX = hx + ax * tipD;
      const tipY = hy + ay * tipD;
      const s = 8 / z;
      ctx.beginPath();
      ctx.moveTo(tipX + ax * s, tipY + ay * s);
      ctx.lineTo(tipX - ay * s * 0.7, tipY + ax * s * 0.7);
      ctx.lineTo(tipX + ay * s * 0.7, tipY - ax * s * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    // Trail.
    const tr = scene.trail;
    if (tr.length > 3) {
      ctx.strokeStyle = 'rgba(255,190,110,0.55)';
      ctx.lineWidth = 1.6 / z;
      ctx.beginPath();
      ctx.moveTo(tr[0], tr[1]);
      for (let k = 2; k < tr.length; k += 2) ctx.lineTo(tr[k], tr[k + 1]);
      ctx.stroke();
    }
    // Probe.
    const p = scene.probe;
    if (p && scene.done !== 'crashed') {
      const a = Math.atan2(p.vy, p.vx);
      const s = 6 / Math.max(0.5, z);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (scene.thrust) {
        const ta = Math.atan2(scene.thrust[1], scene.thrust[0]);
        ctx.save();
        ctx.rotate(ta);
        ctx.fillStyle = `rgba(120,200,255,${0.6 + Math.random() * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(-s * 0.6, -s * 0.35);
        ctx.lineTo(-s * (1.6 + Math.random()), 0);
        ctx.lineTo(-s * 0.6, s * 0.35);
        ctx.fill();
        ctx.restore();
      }
      ctx.rotate(a);
      ctx.fillStyle = '#f2f5ff';
      ctx.shadowColor = '#9cd2ff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(-s * 0.7, -s * 0.55);
      ctx.lineTo(-s * 0.4, 0);
      ctx.lineTo(-s * 0.7, s * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Particles.
    for (const q of scene.particles) {
      ctx.globalAlpha = Math.max(0, q.life);
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 2.2 / z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
