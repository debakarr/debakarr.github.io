// Wildborn's overworld renderer: a tile world drawn on canvas with a camera
// that follows the player, day/night light, weather, features and a simple
// avatar. Purely visual; it never changes the sim.

import { hashString } from '../../shared/rng';
import type { Game } from '../sim/game';
import { T, type WorldMap } from '../sim/world';

const TILE = 26;

const COLOR: Record<number, string> = {
  [T.Grass]: '#4e9a5c',
  [T.Tall]: '#468e52',
  [T.Path]: '#d9c08a',
  [T.Tree]: '#2f6b43',
  [T.Water]: '#3f7fbf',
  [T.DeepWater]: '#2c5f96',
  [T.Rock]: '#8a8478',
  [T.Mountain]: '#6b6b74',
  [T.Ash]: '#6b5b52',
  [T.Lava]: '#c8442a',
  [T.Crystal]: '#b48ae8',
  [T.CaveFloor]: '#5b5470',
  [T.RuinFloor]: '#8a8478',
  [T.Pillar]: '#a89a80',
  [T.Floor]: '#cbb894',
  [T.Wall]: '#8a6a4a',
  [T.Reed]: '#7fa85a',
  [T.Flower]: '#5ea06a',
  [T.Sand]: '#e0cf9a',
};

const ITEM_ICON: Record<string, string> = {
  berry: '#d9534f',
  moonfruit: '#cfe3ff',
  seed: '#e0cf9a',
  reed: '#7fa85a',
  pepper: '#ff7a45',
  crystal: '#b48ae8',
  ore: '#9aa0a6',
  fragment: '#e8d8a8',
  salve: '#9be15d',
};

export class WorldRenderer {
  cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  /** Smoothed avatar position in tiles. */
  px = 0;
  py = 0;
  dir = 'down';
  /** Flash when an encounter starts. */
  private flash = 0;

  constructor(cv: HTMLCanvasElement) {
    this.cv = cv;
    this.ctx = cv.getContext('2d')!;
  }

  resize(): void {
    const rect = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
  }

  /** Which tile a point on the canvas (CSS px) is over. */
  tileAt(px: number, py: number, map: WorldMap): { x: number; y: number } {
    const halfW = this.w / (2 * TILE);
    const halfH = this.h / (2 * TILE);
    const camX = Math.max(halfW, Math.min(Math.max(halfW, map.w - halfW), this.px));
    const camY = Math.max(halfH, Math.min(Math.max(halfH, map.h - halfH), this.py));
    return { x: Math.floor((px - this.w / 2) / TILE + camX), y: Math.floor((py - this.h / 2) / TILE + camY) };
  }

  /** Note which way the player is heading (for the avatar sprite). */
  face(dir: string): void {
    this.dir = dir;
  }

  encounterFlash(): void {
    this.flash = 1;
  }

  /** Snap the smoothed position (used on load). */
  reset(game: Game): void {
    this.px = game.state.x;
    this.py = game.state.y;
  }

  private shade(x: number, y: number, base: string, amount = 0.12): string {
    const h = hashString(`${x}:${y}`);
    const d = ((h % 21) - 10) / 100;
    const v = amount * (h % 2 === 0 ? 1 : -1);
    return shift(base, d * v * 2, v * 0.5);
  }

  draw(game: Game, now: number): void {
    const map = game.world;
    const s = game.state;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0c1512';
    ctx.fillRect(0, 0, this.w, this.h);

    // Ease the avatar toward its tile so walking looks smooth.
    this.px += (s.x - this.px) * 0.3;
    this.py += (s.y - this.py) * 0.3;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.06);

    // Camera: follow the player, clamped to the map.
    const halfW = this.w / (2 * TILE);
    const halfH = this.h / (2 * TILE);
    let camX = this.px;
    let camY = this.py;
    camX = Math.max(halfW, Math.min(map.w - halfW, camX));
    camY = Math.max(halfH, Math.min(map.h - halfH, camY));
    const ox = this.w / 2 - camX * TILE;
    const oy = this.h / 2 - camY * TILE;

    const x0 = Math.max(0, Math.floor(-ox / TILE) - 1);
    const y0 = Math.max(0, Math.floor(-oy / TILE) - 1);
    const x1 = Math.min(map.w - 1, Math.ceil((this.w - ox) / TILE) + 1);
    const y1 = Math.min(map.h - 1, Math.ceil((this.h - oy) / TILE) + 1);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * map.w + x;
        const tile = map.tiles[i];
        const px = ox + x * TILE;
        const py = oy + y * TILE;
        ctx.fillStyle = this.shade(x, y, COLOR[tile] ?? '#4e9a5c');
        ctx.fillRect(px, py, TILE, TILE);
        this.decor(ctx, map, tile, x, y, px, py, now, i);
      }
    }

    // Features: pickups, the village home, the researcher, lanterns.
    for (const f of map.features) {
      const idx = map.features.indexOf(f);
      const taken = s.picked[String(idx)] ?? -1;
      if (f.kind in ITEM_ICON && taken >= 0 && s.day - taken < 2) continue;
      const px = ox + (f.x + 0.5) * TILE;
      const py = oy + (f.y + 0.5) * TILE;
      if (px < -TILE || py < -TILE || px > this.w + TILE || py > this.h + TILE) continue;
      this.feature(ctx, f.kind, px, py, now, idx);
    }

    // The player.
    const ax = ox + (this.px + 0.5) * TILE;
    const ay = oy + (this.py + 0.5) * TILE;
    this.avatar(ctx, ax, ay, now);

    this.light(ctx, game, ox, oy, now, map);
    this.weather(ctx, game, now);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  private decor(ctx: CanvasRenderingContext2D, map: WorldMap, tile: number, x: number, y: number, px: number, py: number, now: number, i: number): void {
    const h = hashString(`${x}:${y}:d`);
    const jitter = (n: number) => ((h >> n) % 7) - 3;
    switch (tile) {
      case T.Tree: {
        ctx.fillStyle = '#3d2b1d';
        ctx.fillRect(px + TILE * 0.42, py + TILE * 0.55, TILE * 0.16, TILE * 0.45);
        ctx.fillStyle = this.shade(x, y, '#357a4b', 0.2);
        ctx.beginPath();
        ctx.arc(px + TILE * 0.5, py + TILE * 0.42, TILE * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.arc(px + TILE * 0.42, py + TILE * 0.34, TILE * 0.16, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case T.Tall: {
        ctx.strokeStyle = 'rgba(30,70,40,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const bx = px + 5 + k * 7 + jitter(k);
          ctx.moveTo(bx, py + TILE);
          ctx.quadraticCurveTo(bx + 2, py + TILE * 0.6, bx + 3, py + TILE * 0.45);
        }
        ctx.stroke();
        break;
      }
      case T.Reed: {
        ctx.strokeStyle = 'rgba(90,120,60,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const bx = px + 6 + k * 7;
          ctx.moveTo(bx, py + TILE);
          ctx.quadraticCurveTo(bx + 3, py + TILE * 0.5, bx + 1, py + TILE * 0.3);
        }
        ctx.stroke();
        break;
      }
      case T.Water:
      case T.DeepWater: {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.5;
        const off = ((now / 900 + x * 0.7 + y * 1.3) % 3) - 1.5;
        ctx.beginPath();
        ctx.moveTo(px + 3, py + TILE / 2 + off * 3);
        ctx.quadraticCurveTo(px + TILE / 2, py + TILE / 2 + off * 3 - 3, px + TILE - 3, py + TILE / 2 + off * 3);
        ctx.stroke();
        break;
      }
      case T.Lava: {
        const glow = 0.6 + 0.4 * Math.sin(now / 400 + (x + y));
        ctx.fillStyle = `rgba(255,150,60,${0.5 + glow * 0.4})`;
        ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
        break;
      }
      case T.Rock: {
        ctx.fillStyle = '#6f6a60';
        ctx.beginPath();
        ctx.ellipse(px + TILE / 2, py + TILE * 0.62, TILE * 0.3, TILE * 0.22, 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case T.Mountain: {
        ctx.fillStyle = '#7a7a84';
        ctx.beginPath();
        ctx.moveTo(px, py + TILE);
        ctx.lineTo(px + TILE * 0.5, py + 2);
        ctx.lineTo(px + TILE, py + TILE);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(px + TILE * 0.5, py + 2);
        ctx.lineTo(px + TILE * 0.62, py + TILE * 0.34);
        ctx.lineTo(px + TILE * 0.38, py + TILE * 0.34);
        ctx.fill();
        break;
      }
      case T.Crystal: {
        ctx.fillStyle = '#c9a8ff';
        ctx.beginPath();
        ctx.moveTo(px + TILE * 0.5, py + 2);
        ctx.lineTo(px + TILE * 0.72, py + TILE * 0.7);
        ctx.lineTo(px + TILE * 0.28, py + TILE * 0.7);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(px + TILE * 0.5, py + 2);
        ctx.lineTo(px + TILE * 0.56, py + TILE * 0.66);
        ctx.lineTo(px + TILE * 0.44, py + TILE * 0.66);
        ctx.fill();
        break;
      }
      case T.Pillar: {
        ctx.fillStyle = '#b8aa90';
        ctx.fillRect(px + TILE * 0.3, py + 4, TILE * 0.4, TILE - 8);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(px + TILE * 0.55, py + 4, TILE * 0.15, TILE - 8);
        break;
      }
      case T.Wall: {
        ctx.fillStyle = '#7a5c40';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#a34a3c';
        ctx.beginPath();
        ctx.moveTo(px - 2, py + 2);
        ctx.lineTo(px + TILE / 2, py - 6);
        ctx.lineTo(px + TILE + 2, py + 2);
        ctx.fill();
        break;
      }
      case T.Flower: {
        for (let k = 0; k < 2; k++) {
          ctx.fillStyle = k % 2 ? '#e8a0c8' : '#f0e08a';
          ctx.beginPath();
          ctx.arc(px + 8 + k * 11 + jitter(k), py + 10 + ((h >> k) % 8), 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case T.RuinFloor:
      case T.CaveFloor:
      case T.Floor: {
        // Subtle paving lines.
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        break;
      }
      default:
        if (h % 5 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(px + 6, py + 8, 3, 3);
        }
        break;
    }
    void map;
    void i;
  }

  private feature(ctx: CanvasRenderingContext2D, kind: string, px: number, py: number, now: number, idx: number): void {
    const bob = Math.sin(now / 700 + idx) * 1.5;
    if (kind === 'lantern') {
      const glow = 0.6 + 0.4 * Math.sin(now / 900 + idx);
      const g = ctx.createRadialGradient(px, py, 1, px, py, 26);
      g.addColorStop(0, `rgba(255,220,150,${0.5 * glow})`);
      g.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd28a';
      ctx.fillRect(px - 2, py - 12, 4, 8);
      return;
    }
    if (kind === 'home') {
      ctx.fillStyle = '#cbb894';
      ctx.fillRect(px - 12, py - 6, 24, 20);
      ctx.fillStyle = '#a34a3c';
      ctx.beginPath();
      ctx.moveTo(px - 15, py - 6);
      ctx.lineTo(px, py - 18);
      ctx.lineTo(px + 15, py - 6);
      ctx.fill();
      ctx.fillStyle = '#7a5c40';
      ctx.fillRect(px - 4, py + 2, 8, 12);
      return;
    }
    if (kind === 'researcher') {
      ctx.fillStyle = '#6b8fd6';
      ctx.beginPath();
      ctx.arc(px, py - 8 + bob * 0.3, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f5f9f';
      ctx.fillRect(px - 5, py - 3 + bob * 0.3, 10, 12);
      return;
    }
    const color = ITEM_ICON[kind] ?? '#fff';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py - 2 + bob, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(px - 1.5, py - 3.5 + bob, 1.5, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'fragment') {
      const g = ctx.createRadialGradient(px, py, 1, px, py, 18);
      g.addColorStop(0, 'rgba(240,220,170,0.5)');
      g.addColorStop(1, 'rgba(240,220,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private avatar(ctx: CanvasRenderingContext2D, px: number, py: number, now: number): void {
    const step = Math.sin(now / 220) * 1.2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(px, py + 10, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f6bb0';
    ctx.fillRect(px - 5, py - 2 + step * 0.2, 10, 11);
    ctx.fillStyle = '#f2d3b0';
    ctx.beginPath();
    ctx.arc(px, py - 7 + step * 0.2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b2b1f';
    ctx.beginPath();
    ctx.arc(px, py - 10 + step * 0.2, 6, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a22';
    const eyeDx = this.dir === 'left' ? -2 : this.dir === 'right' ? 2 : 0;
    ctx.beginPath();
    ctx.arc(px - 2 + eyeDx, py - 6 + step * 0.2, 1, 0, Math.PI * 2);
    ctx.arc(px + 2 + eyeDx, py - 6 + step * 0.2, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  private light(ctx: CanvasRenderingContext2D, game: Game, ox: number, oy: number, now: number, map: WorldMap): void {
    const hour = game.state.hour;
    const night = hour >= 19 || hour <= 5;
    const dusk = !night && (hour >= 17 || hour <= 7);
    if (night || dusk) {
      ctx.fillStyle = night ? 'rgba(12,18,44,0.55)' : 'rgba(120,70,40,0.16)';
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (night) {
      // A lantern's reach around the player, and every lantern on the map.
      ctx.globalCompositeOperation = 'lighter';
      const lamp = (x: number, y: number, r: number, a: number) => {
        const px = ox + (x + 0.5) * TILE;
        const py = oy + (y + 0.5) * TILE;
        if (px < -r || py < -r || px > this.w + r || py > this.h + r) return;
        const g = ctx.createRadialGradient(px, py, 1, px, py, r);
        g.addColorStop(0, `rgba(255,214,150,${a})`);
        g.addColorStop(1, 'rgba(255,214,150,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      };
      lamp(game.state.x, game.state.y, 90, 0.3);
      for (const f of map.features) if (f.kind === 'lantern') lamp(f.x, f.y, 70, 0.35);
      if (game.state.region === 'village') lamp(map.centers.village.x, map.centers.village.y, 120, 0.22);
      ctx.globalCompositeOperation = 'source-over';
    }
    void now;
  }

  private weather(ctx: CanvasRenderingContext2D, game: Game, now: number): void {
    const w = game.state.weather;
    if (w === 'rain' || w === 'storm') {
      ctx.strokeStyle = w === 'storm' ? 'rgba(200,220,255,0.5)' : 'rgba(180,215,240,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const drops = w === 'storm' ? 90 : 55;
      for (let k = 0; k < drops; k++) {
        const sx = ((k * 137 + now * 0.35) % (this.w + 40)) - 20;
        const sy = ((k * 91 + now * 0.6) % (this.h + 40)) - 20;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - 4, sy + 12);
      }
      ctx.stroke();
    }
    if (w === 'fog') {
      ctx.fillStyle = 'rgba(200,220,225,0.12)';
      for (let k = 0; k < 4; k++) {
        const y = ((k * 0.27 + now / 26000) % 1) * this.h;
        ctx.fillRect(0, y, this.w, 18);
      }
    }
    if (w === 'storm' && Math.sin(now / 900) > 0.995) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }
}

/** Lighten/darken a hex colour. */
function shift(hex: string, dLight: number, dSat: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  const l = dLight * 255;
  r = Math.max(0, Math.min(255, Math.round(r + l)));
  g = Math.max(0, Math.min(255, Math.round(g + l)));
  b = Math.max(0, Math.min(255, Math.round(b + l * 0.8)));
  const s = Math.round(dSat * 40);
  g = Math.max(0, Math.min(255, g + s));
  b = Math.max(0, Math.min(255, b - s));
  const to = (v: number) => v.toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}