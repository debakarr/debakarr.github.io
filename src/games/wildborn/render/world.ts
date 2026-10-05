// Wildborn's overworld renderer: a lit 2.5D world. Tiles are slabs with
// bevelled edges, objects are extruded and cast shadows whose direction and
// length follow the time of day, everything is depth sorted, water ripples,
// lava and lanterns glow, and a warm-to-cool grade runs from dawn to night.

import { hashString } from '../../shared/rng';
import type { Game } from '../sim/game';
import { T, type WorldMap } from '../sim/world';
import type { WorldView } from './view';

const TILE = 30;
/** The camera looks down at an angle, so a tile is wider than it is deep. */
const SQUASH = 0.78;

const COLOR: Record<number, string> = {
  [T.Grass]: '#4f9c5e',
  [T.Tall]: '#468f52',
  [T.Path]: '#d8bf89',
  [T.Tree]: '#3a7c4c',
  [T.Water]: '#3d7cbd',
  [T.DeepWater]: '#2b5c93',
  [T.Rock]: '#8c867a',
  [T.Mountain]: '#6f6f79',
  [T.Ash]: '#6d5d53',
  [T.Lava]: '#c9422a',
  [T.Crystal]: '#b48ae8',
  [T.CaveFloor]: '#5d5673',
  [T.RuinFloor]: '#8b8579',
  [T.Pillar]: '#ab9d83',
  [T.Floor]: '#cdba95',
  [T.Wall]: '#7d5f42',
  [T.Reed]: '#7fab58',
  [T.Flower]: '#5ea46a',
  [T.Sand]: '#e2d19c',
};

const ITEM_COLOR: Record<string, string> = {
  berry: '#d9534f',
  moonfruit: '#cfe3ff',
  seed: '#e0cf9a',
  reed: '#7fab58',
  pepper: '#ff7a45',
  crystal: '#b48ae8',
  ore: '#9aa0a6',
  fragment: '#e8d8a8',
  salve: '#9be15d',
};

/** Tiles that sit below the surrounding ground, so they get a sunken inner rim. */
const SUNKEN: Record<number, number> = {
  [T.Water]: 0.16,
  [T.DeepWater]: 0.26,
  [T.Lava]: 0.3,
};

export class WorldRenderer implements WorldView {
  readonly kind = 'flat' as const;
  cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  /** Smoothed avatar position in tiles. */
  px = 0;
  py = 0;
  dir = 'down';
  private flash = 0;
  /** The camera leans the way you are walking, so you see what is coming. */
  private leadX = 0;
  private leadY = 0;
  /** Scratch list for depth sorting. */
  private items: { key: number; fn: () => void }[] = [];

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

  /** Camera in tiles, clamped so the view never leaves the map. */
  private camera(map: WorldMap): { x: number; y: number } {
    const halfW = this.w / (2 * TILE);
    const halfH = this.h / (2 * TILE * SQUASH);
    const cx = this.px + this.leadX;
    const cy = this.py + this.leadY;
    const x = Math.max(halfW, Math.min(Math.max(halfW, map.w - halfW), cx));
    const y = Math.max(halfH, Math.min(Math.max(halfH, map.h - halfH), cy));
    return { x, y };
  }

  /** Which tile a point on the canvas (CSS px) is over. */
  tileAt(px: number, py: number, map: WorldMap): { x: number; y: number } {
    const cam = this.camera(map);
    return {
      x: Math.floor(px / TILE + cam.x),
      y: Math.floor(py / (TILE * SQUASH) + cam.y),
    };
  }

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

  // --- light ---------------------------------------------------------------------------------

  /** Sun direction and shadow length from the hour (dawn long west, noon short, dusk long east). */
  private sun(hour: number): { dx: number; dy: number; len: number } {
    const t = ((hour - 6) / 12 + 1) % 1; // 0 at 6h, 0.5 at noon, 1 at 18h
    const len = 0.3 + 0.7 * Math.abs(Math.cos(t * Math.PI));
    return { dx: (t - 0.5) * 2, dy: 0.5, len };
  }

  private shade(hex: string, dLight: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const num = parseInt(m[1], 16);
    const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    const r = ((num >> 16) & 255) + dLight * 255;
    const g = ((num >> 8) & 255) + dLight * 255;
    const b = (num & 255) + dLight * 235;
    return `#${to(r)}${to(g)}${to(b)}`;
  }

  draw(game: Game, now: number): void {
    const map = game.world;
    const s = game.state;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Ease the avatar toward its tile so walking looks smooth.
    this.px += (s.x - this.px) * 0.3;
    this.py += (s.y - this.py) * 0.3;
    // Lead the camera into the direction of travel.
    const tx = this.dir === 'left' ? -0.7 : this.dir === 'right' ? 0.7 : 0;
    const ty = this.dir === 'up' ? -0.7 : this.dir === 'down' ? 0.7 : 0;
    this.leadX += (tx - this.leadX) * 0.08;
    this.leadY += (ty - this.leadY) * 0.08;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.06);

    const hour = s.hour;
    const night = hour >= 19 || hour <= 5;
    const dusk = !night && (hour >= 16.5 || hour <= 7.5);
    const sun = this.sun(hour);
    const amb = night ? -0.22 : dusk ? -0.04 : 0.02;

    // Sky behind everything.
    const sky = ctx.createLinearGradient(0, 0, 0, this.h);
    if (night) {
      sky.addColorStop(0, '#0a1128');
      sky.addColorStop(1, '#101a33');
    } else if (dusk) {
      sky.addColorStop(0, '#2a2140');
      sky.addColorStop(0.6, '#5b3a44');
      sky.addColorStop(1, '#8a5a3c');
    } else {
      sky.addColorStop(0, '#1d4a63');
      sky.addColorStop(1, '#4b7f86');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.h);

    const cam = this.camera(map);
    const ox = this.w / 2 - cam.x * TILE;
    const oy = this.h / 2 - cam.y * TILE * SQUASH;
    const tw = TILE;
    const th = TILE * SQUASH;

    const x0 = Math.max(0, Math.floor(-ox / tw) - 2);
    const y0 = Math.max(0, Math.floor(-oy / th) - 2);
    const x1 = Math.min(map.w - 1, Math.ceil((this.w - ox) / tw) + 2);
    const y1 = Math.min(map.h - 1, Math.ceil((this.h - oy) / th) + 2);

    this.items.length = 0;

    // 1. Ground: slabs first, so objects and creatures can stand on them.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * map.w + x;
        const tile = map.tiles[i];
        const px = ox + x * tw;
        const py = oy + y * th;
        this.ground(ctx, map, tile, x, y, px, py, tw, th, now, amb, night);
        // Things that stand up are drawn later, sorted by depth.
        if (tile === T.Tree) this.push(x, y, () => this.tree(ctx, x, y, px, py, tw, th, sun));
        else if (tile === T.Rock) this.push(x, y, () => this.rock(ctx, px, py, tw, th, sun, i));
        else if (tile === T.Mountain) this.push(x, y, () => this.mountain(ctx, px, py, tw, th, sun));
        else if (tile === T.Crystal) this.push(x, y, () => this.crystal(ctx, px, py, tw, th, i, now));
        else if (tile === T.Pillar) this.push(x, y, () => this.pillar(ctx, px, py, tw, th, sun));
        else if (tile === T.Wall) this.push(x, y, () => this.building(ctx, px, py, tw, th, sun, night, now));
      }
    }

    // 2. Features: pickups, lanterns, the home, the researcher.
    for (const [idx, f] of map.features.entries()) {
      if (f.x < x0 - 1 || f.x > x1 + 1 || f.y < y0 - 1 || f.y > y1 + 1) continue;
      const taken = s.picked[String(idx)] ?? -1;
      if (f.kind in ITEM_COLOR && taken >= 0 && s.day - taken < 2) continue;
      const px = ox + f.x * tw;
      const py = oy + f.y * th;
      this.push(f.x, f.y, () => this.feature(ctx, f.kind, px, py + th, idx, now, night, sun));
    }

    // 3. The player.
    {
      const px = ox + this.px * tw;
      const py = oy + this.py * th;
      this.push(this.px, this.py, () => this.avatar(ctx, px, py, tw, th, now, sun));
    }

    // Painter's algorithm: far to near.
    this.items.sort((a, b) => a.key - b.key);
    for (const it of this.items) it.fn();
    this.items.length = 0;

    this.atmosphere(ctx, now, night, dusk, ox, oy, tw, th, map, s);
  }

  private push(x: number, y: number, fn: () => void): void {
    this.items.push({ key: y * 1000 + x, fn });
  }

  // --- ground --------------------------------------------------------------------------------

  private ground(
    ctx: CanvasRenderingContext2D,
    map: WorldMap,
    tile: number,
    x: number,
    y: number,
    px: number,
    py: number,
    tw: number,
    th: number,
    now: number,
    amb: number,
    night: boolean,
  ): void {
    const base = this.shade(COLOR[tile] ?? '#4f9c5e', amb + (((hashString(`${x}:${y}`) % 13) - 6) / 900));
    const r = 4;
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.roundRect(px + 0.5, py + 0.5, tw - 1, th - 1, r);
    ctx.fill();
    // Bevel: light from the top left, shade bottom right, so slabs read as 3D.
    ctx.strokeStyle = this.shade(base, 0.09);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px + r, py + 1);
    ctx.lineTo(px + tw - r, py + 1);
    ctx.moveTo(px + 1, py + r);
    ctx.lineTo(px + 1, py + th - r);
    ctx.stroke();
    ctx.strokeStyle = this.shade(base, -0.1);
    ctx.beginPath();
    ctx.moveTo(px + r, py + th - 1);
    ctx.lineTo(px + tw - r, py + th - 1);
    ctx.moveTo(px + tw - 1, py + r);
    ctx.lineTo(px + tw - 1, py + th - r);
    ctx.stroke();

    const i = y * map.w + x;
    // Water and lava sit below the ground plane: shade their inner rim so the
    // edge casts into itself rather than reading as a painted square.
    const sunk = SUNKEN[tile];
    if (sunk) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(px + 0.5, py + 0.5, tw - 1, th - 1, 4);
      ctx.clip();
      ctx.strokeStyle = `rgba(2,10,20,${(0.1 + sunk * 1.5).toFixed(3)})`;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
    }
    switch (tile) {
      case T.Water:
      case T.DeepWater: {
        // Depth shading plus two crossing ripples and a glint.
        const deep = tile === T.DeepWater ? 0.1 : 0;
        ctx.fillStyle = `rgba(4,18,40,${0.28 + deep})`;
        ctx.fillRect(px + 1, py + 1, tw - 2, th - 2);
        ctx.strokeStyle = `rgba(210,240,255,${night ? 0.1 : 0.22})`;
        ctx.lineWidth = 1.2;
        const ph = now / 700 + x * 0.7 + y * 1.3;
        ctx.beginPath();
        for (let k = 0; k < 2; k++) {
          const yy = py + th * (0.34 + k * 0.34) + Math.sin(ph + k * 2) * 1.6;
          ctx.moveTo(px + 3, yy);
          ctx.quadraticCurveTo(px + tw / 2, yy - 3, px + tw - 3, yy);
        }
        ctx.stroke();
        if (!night && hashString(`g${i}`) % 3 === 0) {
          const gx = px + tw * (0.3 + 0.4 * ((hashString(`x${i}`) % 10) / 10));
          const gy = py + th * 0.4 + Math.sin(ph) * 2;
          ctx.fillStyle = 'rgba(255,255,240,0.5)';
          ctx.beginPath();
          ctx.ellipse(gx, gy, 2.6, 1.1, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Foam where water meets land.
        const land = (dx: number, dy: number) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) return;
          const nt = map.tiles[ny * map.w + nx];
          if (nt === T.Water || nt === T.DeepWater) return;
          ctx.strokeStyle = 'rgba(235,245,255,0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + tw / 2 + dx * tw * 0.42, py + th / 2 + dy * th * 0.42);
          ctx.lineTo(px + tw / 2 + dx * tw * 0.05, py + th / 2 + dy * th * 0.05);
          ctx.stroke();
        };
        land(0, -1);
        land(0, 1);
        land(-1, 0);
        land(1, 0);
        break;
      }
      case T.Lava: {
        const pulse = 0.55 + 0.45 * Math.sin(now / 420 + x * 0.9 + y * 1.7);
        const g = ctx.createRadialGradient(px + tw / 2, py + th / 2, 2, px + tw / 2, py + th / 2, tw * 0.7);
        g.addColorStop(0, `rgba(255,220,140,${(0.55 + pulse * 0.35).toFixed(2)})`);
        g.addColorStop(0.5, 'rgba(255,120,50,0.75)');
        g.addColorStop(1, 'rgba(180,40,30,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - tw * 0.2, py - th * 0.2, tw * 1.4, th * 1.4);
        break;
      }
      case T.Tall:
      case T.Reed: {
        ctx.strokeStyle = tile === T.Reed ? 'rgba(70,100,48,0.9)' : 'rgba(28,66,36,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const sway = Math.sin(now / 1400 + x * 0.9 + y * 0.6) * 1.4;
        for (let k = 0; k < 4; k++) {
          const bx = px + 4 + k * ((tw - 8) / 3);
          ctx.moveTo(bx, py + th - 2);
          ctx.quadraticCurveTo(bx + sway, py + th * 0.5, bx + sway * 1.6, py + th * 0.28);
        }
        ctx.stroke();
        break;
      }
      case T.Flower: {
        for (let k = 0; k < 2; k++) {
          const fx = px + 8 + k * (tw * 0.45);
          const fy = py + th * 0.45 + ((hashString(`f${x}${y}${k}`) % 8) - 4);
          ctx.fillStyle = k % 2 ? '#e8a0c8' : '#f2e08a';
          ctx.beginPath();
          ctx.arc(fx, fy, 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.arc(fx - 0.8, fy - 0.9, 1, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case T.RuinFloor:
      case T.CaveFloor:
      case T.Floor:
      case T.Path:
      case T.Sand: {
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + tw * 0.5, py + 2);
        ctx.lineTo(px + tw * 0.5, py + th - 2);
        ctx.stroke();
        if (tile === T.RuinFloor && hashString(`cr${i}`) % 5 === 0) {
          ctx.strokeStyle = 'rgba(0,0,0,0.16)';
          ctx.beginPath();
          ctx.moveTo(px + 6, py + th * 0.7);
          ctx.lineTo(px + tw * 0.45, py + th * 0.35);
          ctx.lineTo(px + tw - 5, py + th * 0.6);
          ctx.stroke();
        }
        break;
      }
      default:
        break;
    }
  }

  // --- standing things -------------------------------------------------------------------------

  /** A soft cast shadow on the ground, offset by the sun. */
  private shadow(ctx: CanvasRenderingContext2D, px: number, py: number, w: number, sun: { dx: number; dy: number; len: number }, height: number): void {
    const off = height * sun.len * 9;
    ctx.fillStyle = 'rgba(4,10,16,0.28)';
    ctx.beginPath();
    ctx.ellipse(px + sun.dx * off * 0.35, py + sun.dy * off * 0.35, w, w * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private tree(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    px: number,
    py: number,
    tw: number,
    th: number,
    sun: { dx: number; dy: number; len: number },
  ): void {
    const h = 0.75 + ((hashString(`${x}:${y}:t`) % 9) / 20);
    const cx = px + tw / 2;
    const baseY = py + th;
    this.shadow(ctx, cx, baseY - 2, tw * 0.34, sun, h);
    // Trunk.
    const trunkH = th * h * 0.55;
    ctx.fillStyle = '#4a3324';
    ctx.fillRect(cx - tw * 0.06, baseY - trunkH, tw * 0.12, trunkH);
    ctx.fillStyle = '#5c4130';
    ctx.fillRect(cx - tw * 0.06, baseY - trunkH, tw * 0.05, trunkH);
    // Canopy: three blobs, lit from the top left, shaded underneath.
    const greens = ['#2f6b41', '#357a4b', '#3f8c58'];
    const lit = ['#59b06c', '#4fa362', '#469358'];
    const layers = [
      { r: tw * 0.42, dy: -trunkH * 0.15 },
      { r: tw * 0.34, dy: -trunkH * 0.62 },
      { r: tw * 0.24, dy: -trunkH * 1.05 },
    ];
    layers.forEach((l, k) => {
      const ly = baseY + l.dy;
      ctx.fillStyle = greens[k];
      ctx.beginPath();
      ctx.arc(cx, ly, l.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lit[k];
      ctx.beginPath();
      ctx.arc(cx - l.r * 0.28, ly - l.r * 0.3, l.r * 0.62, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private rock(ctx: CanvasRenderingContext2D, px: number, py: number, tw: number, th: number, sun: { dx: number; dy: number; len: number }, i: number): void {
    const cx = px + tw / 2;
    const baseY = py + th - 2;
    const s = 0.7 + (hashString(`r${i}`) % 5) / 12;
    this.shadow(ctx, cx, baseY, tw * 0.24 * s, sun, 0.4 * s);
    // Top face and shaded side, so it reads as a solid.
    ctx.fillStyle = '#6b665d';
    ctx.beginPath();
    ctx.ellipse(cx + 2, baseY, tw * 0.26 * s, th * 0.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d8779';
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 3 * s, tw * 0.24 * s, th * 0.17 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx - tw * 0.06 * s, baseY - 5 * s, tw * 0.1 * s, th * 0.07 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private mountain(ctx: CanvasRenderingContext2D, px: number, py: number, tw: number, th: number, sun: { dx: number; dy: number; len: number }): void {
    const cx = px + tw / 2;
    const baseY = py + th;
    this.shadow(ctx, cx + tw * 0.1, baseY, tw * 0.3, sun, 1);
    ctx.fillStyle = '#5f5f6b';
    ctx.beginPath();
    ctx.moveTo(px - 1, baseY);
    ctx.lineTo(cx, py - th * 0.55);
    ctx.lineTo(px + tw + 1, baseY);
    ctx.closePath();
    ctx.fill();
    // Lit face and a snow cap.
    ctx.fillStyle = '#7b7b88';
    ctx.beginPath();
    ctx.moveTo(cx, py - th * 0.55);
    ctx.lineTo(cx - tw * 0.34, baseY);
    ctx.lineTo(cx + tw * 0.1, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d9dee6';
    ctx.beginPath();
    ctx.moveTo(cx, py - th * 0.55);
    ctx.lineTo(cx - tw * 0.14, py - th * 0.12);
    ctx.lineTo(cx + tw * 0.14, py - th * 0.12);
    ctx.closePath();
    ctx.fill();
  }

  private crystal(ctx: CanvasRenderingContext2D, px: number, py: number, tw: number, th: number, i: number, now: number): void {
    const cx = px + tw / 2;
    const baseY = py + th - 2;
    const pulse = 0.75 + 0.25 * Math.sin(now / 900 + i);
    const g = ctx.createRadialGradient(cx, baseY - 6, 1, cx, baseY - 6, tw * 0.55);
    g.addColorStop(0, `rgba(200,160,255,${0.28 * pulse})`);
    g.addColorStop(1, 'rgba(180,138,232,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - tw * 0.1, py - th * 0.2, tw * 1.2, th * 1.2);
    // Two facets: a lit face and a shaded one.
    ctx.fillStyle = '#c9a8ff';
    ctx.beginPath();
    ctx.moveTo(cx, baseY - tw * 0.62);
    ctx.lineTo(cx + tw * 0.16, baseY);
    ctx.lineTo(cx - tw * 0.02, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8f6bd0';
    ctx.beginPath();
    ctx.moveTo(cx, baseY - tw * 0.62);
    ctx.lineTo(cx + tw * 0.16, baseY);
    ctx.lineTo(cx + tw * 0.3, baseY);
    ctx.closePath();
    ctx.fill();
  }

  private pillar(ctx: CanvasRenderingContext2D, px: number, py: number, tw: number, th: number, sun: { dx: number; dy: number; len: number }): void {
    const cx = px + tw / 2;
    const baseY = py + th - 2;
    const h = th * 0.95;
    this.shadow(ctx, cx, baseY, tw * 0.2, sun, 0.8);
    ctx.fillStyle = '#8b7f6a';
    ctx.fillRect(cx - tw * 0.14, baseY - h, tw * 0.28, h);
    ctx.fillStyle = '#b8ab90';
    ctx.fillRect(cx - tw * 0.14, baseY - h, tw * 0.1, h);
    ctx.fillStyle = '#c8bca2';
    ctx.fillRect(cx - tw * 0.18, baseY - h - th * 0.06, tw * 0.36, th * 0.07);
  }

  /** Village houses: a block with a lit wall, a roof and a window that glows at night. */
  private building(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tw: number,
    th: number,
    sun: { dx: number; dy: number; len: number },
    night: boolean,
    now: number,
  ): void {
    const cx = px + tw / 2;
    const baseY = py + th;
    const wallH = th * 0.9;
    this.shadow(ctx, cx + sun.dx * 6, baseY - 2, tw * 0.42, sun, 1.1);
    // Walls.
    ctx.fillStyle = '#9a7a58';
    ctx.fillRect(px + tw * 0.12, baseY - wallH, tw * 0.76, wallH);
    ctx.fillStyle = '#b08f68';
    ctx.fillRect(px + tw * 0.12, baseY - wallH, tw * 0.3, wallH);
    // Roof.
    ctx.fillStyle = '#a34a3c';
    ctx.beginPath();
    ctx.moveTo(px + tw * 0.04, baseY - wallH);
    ctx.lineTo(cx, baseY - wallH - th * 0.5);
    ctx.lineTo(px + tw * 0.96, baseY - wallH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c25a49';
    ctx.beginPath();
    ctx.moveTo(px + tw * 0.04, baseY - wallH);
    ctx.lineTo(cx, baseY - wallH - th * 0.5);
    ctx.lineTo(cx - tw * 0.1, baseY - wallH);
    ctx.closePath();
    ctx.fill();
    // Door and a window that lights up after dark.
    ctx.fillStyle = '#5c4130';
    ctx.fillRect(cx - tw * 0.09, baseY - wallH * 0.45, tw * 0.18, wallH * 0.45);
    const wx = px + tw * 0.58;
    const wy = baseY - wallH * 0.72;
    ctx.fillStyle = night ? `rgba(255,214,140,${0.85 + 0.15 * Math.sin(now / 700 + px)})` : '#6d5a44';
    ctx.fillRect(wx, wy, tw * 0.16, th * 0.2);
    if (night) {
      const g = ctx.createRadialGradient(wx + tw * 0.08, wy + th * 0.1, 1, wx + tw * 0.08, wy + th * 0.1, tw * 0.6);
      g.addColorStop(0, 'rgba(255,200,120,0.3)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(wx - tw * 0.5, wy - th * 0.5, tw * 1.2, th * 1.2);
    }
  }

  private feature(
    ctx: CanvasRenderingContext2D,
    kind: string,
    px: number,
    py: number,
    idx: number,
    now: number,
    night: boolean,
    sun: { dx: number; dy: number; len: number },
  ): void {
    const cx = px;
    const baseY = py;
    if (kind === 'lantern') {
      // A post with a lamp; the light pool is added in the atmosphere pass.
      ctx.fillStyle = '#3a2f26';
      ctx.fillRect(cx - 1.5, baseY - 18, 3, 18);
      ctx.fillStyle = '#ffd28a';
      ctx.beginPath();
      ctx.arc(cx, baseY - 20, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(cx - 1, baseY - 21, 1.3, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (kind === 'home') {
      const wallH = 16;
      this.shadow(ctx, cx + sun.dx * 5, baseY, 14, sun, 0.9);
      ctx.fillStyle = '#b08f68';
      ctx.fillRect(cx - 15, baseY - wallH, 30, wallH);
      ctx.fillStyle = '#a34a3c';
      ctx.beginPath();
      ctx.moveTo(cx - 18, baseY - wallH);
      ctx.lineTo(cx, baseY - wallH - 13);
      ctx.lineTo(cx + 18, baseY - wallH);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5c4130';
      ctx.fillRect(cx - 4, baseY - 9, 8, 9);
      if (night) {
        const g = ctx.createRadialGradient(cx + 9, baseY - 12, 1, cx + 9, baseY - 12, 22);
        g.addColorStop(0, 'rgba(255,200,120,0.5)');
        g.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 14, baseY - 34, 46, 46);
      }
      return;
    }
    if (kind === 'researcher') {
      const bob = Math.sin(now / 800 + idx) * 1;
      this.shadow(ctx, cx, baseY, 6, sun, 0.3);
      ctx.fillStyle = '#3f5f9f';
      ctx.fillRect(cx - 5, baseY - 13 + bob, 10, 13);
      ctx.fillStyle = '#6b8fd6';
      ctx.fillRect(cx - 5, baseY - 13 + bob, 4, 13);
      ctx.fillStyle = '#f2d3b0';
      ctx.beginPath();
      ctx.arc(cx, baseY - 18 + bob, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8e2d0';
      ctx.beginPath();
      ctx.arc(cx, baseY - 20 + bob, 5, Math.PI, Math.PI * 2);
      ctx.fill();
      return;
    }
    // A pickup: a small plant or shard with a glint and a shadow.
    const color = ITEM_COLOR[kind] ?? '#ffffff';
    const bob = Math.sin(now / 700 + idx) * 1.4;
    this.shadow(ctx, cx, baseY - 1, 4.5, sun, 0.2);
    ctx.fillStyle = '#3f7a4a';
    ctx.fillRect(cx - 1, baseY - 7 + bob, 2, 7);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, baseY - 9 + bob, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(cx - 1.4, baseY - 10.4 + bob, 1.5, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'fragment') {
      const g = ctx.createRadialGradient(cx, baseY - 8 + bob, 1, cx, baseY - 8 + bob, 20);
      g.addColorStop(0, 'rgba(240,220,170,0.45)');
      g.addColorStop(1, 'rgba(240,220,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, baseY - 8 + bob, 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private avatar(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tw: number,
    th: number,
    now: number,
    sun: { dx: number; dy: number; len: number },
  ): void {
    const cx = px + tw / 2;
    const baseY = py + th;
    const step = Math.sin(now / 200) * 1.1;
    this.shadow(ctx, cx, baseY - 1, 8, sun, 0.5);
    // Legs and body.
    ctx.fillStyle = '#243a5e';
    ctx.fillRect(cx - 5, baseY - 9 + step * 0.3, 4, 9);
    ctx.fillRect(cx + 1, baseY - 9 - step * 0.3, 4, 9);
    ctx.fillStyle = '#2f6bb0';
    ctx.beginPath();
    ctx.roundRect(cx - 7, baseY - 20, 14, 12, 4);
    ctx.fill();
    ctx.fillStyle = '#4b8ad4';
    ctx.beginPath();
    ctx.roundRect(cx - 7, baseY - 20, 5, 12, 3);
    ctx.fill();
    // Backpack.
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(cx + (this.dir === 'left' ? 4 : -9), baseY - 19, 5, 8);
    // Head, hair and eyes that look where you walk.
    const hy = baseY - 26 + step * 0.2;
    ctx.fillStyle = '#f2d3b0';
    ctx.beginPath();
    ctx.arc(cx, hy, 6.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b2b1f';
    ctx.beginPath();
    ctx.arc(cx, hy - 1.5, 6.4, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    const dx = this.dir === 'left' ? -2 : this.dir === 'right' ? 2 : 0;
    const dy = this.dir === 'up' ? -1.4 : 0.6;
    ctx.fillStyle = '#1a1a22';
    ctx.beginPath();
    ctx.arc(cx - 2 + dx, hy + dy, 1, 0, Math.PI * 2);
    ctx.arc(cx + 2 + dx, hy + dy, 1, 0, Math.PI * 2);
    ctx.fill();
    // Rim light from the sun side.
    ctx.strokeStyle = 'rgba(255,240,200,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, hy, 6.2, Math.PI * (sun.dx > 0 ? 1.1 : 0.1), Math.PI * (sun.dx > 0 ? 1.9 : 0.9));
    ctx.stroke();
  }

  // --- atmosphere ------------------------------------------------------------------------------

  private atmosphere(
    ctx: CanvasRenderingContext2D,
    now: number,
    night: boolean,
    dusk: boolean,
    ox: number,
    oy: number,
    tw: number,
    th: number,
    map: WorldMap,
    s: { x: number; y: number; region: string },
  ): void {
    // Warm or cool grade for the hour. Night keeps enough contrast that shapes
    // still read; the moonlight is blue, the lantern light is not.
    if (night) {
      ctx.fillStyle = 'rgba(14,24,64,0.36)';
      ctx.fillRect(0, 0, this.w, this.h);
    } else if (dusk) {
      ctx.fillStyle = 'rgba(255,150,70,0.16)';
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // Lantern light pools, added rather than painted over.
    if (night) {
      ctx.globalCompositeOperation = 'lighter';
      const lamp = (wx: number, wy: number, r: number, a: number) => {
        const px = ox + (wx + 0.5) * tw;
        const py = oy + (wy + 0.5) * th;
        if (px < -r || py < -r || px > this.w + r || py > this.h + r) return;
        const g = ctx.createRadialGradient(px, py, 1, px, py, r);
        g.addColorStop(0, `rgba(255,206,140,${a})`);
        g.addColorStop(0.45, `rgba(255,186,110,${(a * 0.42).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,206,140,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      lamp(s.x, s.y, 92, 0.3);
      for (const f of map.features) if (f.kind === 'lantern' || f.kind === 'home') lamp(f.x, f.y, 70, 0.36);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Weather over the world.
    const weather = (s as unknown as { weather?: string }).weather;
    if (weather === 'rain' || weather === 'storm') {
      ctx.strokeStyle = weather === 'storm' ? 'rgba(205,225,255,0.45)' : 'rgba(180,215,240,0.3)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const drops = weather === 'storm' ? 110 : 70;
      for (let k = 0; k < drops; k++) {
        const sx = ((k * 137 + now * 0.35) % (this.w + 40)) - 20;
        const sy = ((k * 91 + now * 0.62) % (this.h + 40)) - 20;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - 4, sy + 13);
      }
      ctx.stroke();
    }
    if (weather === 'fog') {
      for (let k = 0; k < 5; k++) {
        const y = ((k * 0.21 + now / 24000) % 1) * this.h;
        const g = ctx.createLinearGradient(0, y - 20, 0, y + 26);
        g.addColorStop(0, 'rgba(220,235,240,0)');
        g.addColorStop(0.5, 'rgba(220,235,240,0.18)');
        g.addColorStop(1, 'rgba(220,235,240,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, y - 20, this.w, 46);
      }
    }
    if (weather === 'storm' && Math.sin(now / 800) > 0.996) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // A soft vignette closes the frame.
    const vig = ctx.createRadialGradient(
      this.w / 2,
      this.h / 2,
      Math.min(this.w, this.h) * 0.45,
      this.w / 2,
      this.h / 2,
      Math.max(this.w, this.h) * 0.75,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(4,10,18,${night ? 0.5 : 0.32})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.w, this.h);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.3})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  /** Nothing to release: this renderer only holds a 2D context. */
  dispose(): void {
    // Intentionally empty.
  }
}
