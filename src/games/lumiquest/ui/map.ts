// The world map and minimap, painted from the real terrain colours and
// heights (with hill shading). Undiscovered areas sit under drifting cloud;
// markers show discovered places, the tracked quest, villagers, your
// companion and you.

import { Color } from 'three';
import { LOCATIONS, NPCS, PLAY_HALF, WATER_LEVEL, type LocationDef } from '../data/world';
import type { Game } from '../game';
import { RES, STEP } from '../world/terrain';
import { WORLD_HALF } from '../data/world';

const SIZE = 512;
const SPAN = PLAY_HALF + 26; // half-width of the area the map shows

const KIND_COLOR: Record<LocationDef['kind'], string> = {
  town: '#ffb45a',
  landmark: '#8ff0ff',
  ruin: '#d8cfc0',
  cave: '#b9a2ff',
  nature: '#7fd06a',
  secret: '#ff8fc0',
};

export class MapView {
  readonly base: HTMLCanvasElement;
  private fog: HTMLCanvasElement;
  private fogKey = '';

  constructor(private g: Game) {
    this.base = document.createElement('canvas');
    this.base.width = SIZE;
    this.base.height = SIZE;
    this.fog = document.createElement('canvas');
    this.fog.width = SIZE;
    this.fog.height = SIZE;
    this.paint();
  }

  /** World → map pixel. */
  px(x: number, z: number): [number, number] {
    return [((x + SPAN) / (SPAN * 2)) * SIZE, ((z + SPAN) / (SPAN * 2)) * SIZE];
  }

  /** Map pixel → world. */
  world(px: number, py: number): [number, number] {
    return [(px / SIZE) * SPAN * 2 - SPAN, (py / SIZE) * SPAN * 2 - SPAN];
  }

  private paint(): void {
    const t = this.g.world.terrain;
    const ctx = this.base.getContext('2d')!;
    const img = ctx.createImageData(SIZE, SIZE);
    const c = new Color();
    const water = new Color('#3f9fd8');
    const deep = new Color('#2a6ab0');
    for (let j = 0; j < SIZE; j++) {
      for (let i = 0; i < SIZE; i++) {
        const [x, z] = this.world(i + 0.5, j + 0.5);
        const fi = Math.max(0, Math.min(RES - 1, Math.round((x + WORLD_HALF) / STEP)));
        const fj = Math.max(0, Math.min(RES - 1, Math.round((z + WORLD_HALF) / STEP)));
        const k = fj * RES + fi;
        const hgt = t.heights[k];
        c.setRGB(t.colors[k * 3], t.colors[k * 3 + 1], t.colors[k * 3 + 2]);
        if (hgt < WATER_LEVEL - 0.05 && !t.inCave(x, z)) c.copy(water).lerp(deep, Math.min(1, (WATER_LEVEL - hgt) / 4));
        // hill shading from the north-west
        const e = 1.5;
        const shade = (t.height(x - e, z - e) - t.height(x + e, z + e)) * 0.08;
        c.offsetHSL(0, 0.05, Math.max(-0.18, Math.min(0.18, shade)));
        const o = (j * SIZE + i) * 4;
        img.data[o] = Math.min(255, c.r * 255 * 1.1);
        img.data[o + 1] = Math.min(255, c.g * 255 * 1.1);
        img.data[o + 2] = Math.min(255, c.b * 255 * 1.1);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // the outpost buildings and paths read better with a soft outline
    ctx.strokeStyle = 'rgba(40,30,20,0.25)';
    ctx.lineWidth = 1;
  }

  /** Cloud cover over places you have not discovered yet. */
  private paintFog(): void {
    const key = this.g.state.discovered.join(',');
    if (key === this.fogKey) return;
    this.fogKey = key;
    const ctx = this.fog.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, SIZE, SIZE);
    const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    g.addColorStop(0, 'rgba(214,226,244,0.92)');
    g.addColorStop(1, 'rgba(184,198,226,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
    // puffy texture
    for (let i = 0; i < 160; i++) {
      const x = (i * 97.3) % SIZE;
      const y = (i * 53.7 + i * i * 0.37) % SIZE;
      ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 5) * 0.02})`;
      ctx.beginPath();
      ctx.arc(x, y, 18 + (i % 7) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'destination-out';
    for (const id of this.g.state.discovered) {
      const l = LOCATIONS.find((x) => x.id === id);
      if (!l) continue;
      const [cx, cy] = this.px(l.at[0], l.at[1]);
      const r = ((l.radius * 1.9 + 14) / (SPAN * 2)) * SIZE;
      const rg = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
      rg.addColorStop(0, 'rgba(0,0,0,1)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawFull(canvas: HTMLCanvasElement, opts: { hover?: string | null } = {}): void {
    const g = this.g;
    this.paintFog();
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const k = W / SIZE;
    ctx.clearRect(0, 0, W, W);
    ctx.drawImage(this.base, 0, 0, W, W);
    const p = g.player.pos;
    ctx.drawImage(this.fog, 0, 0, W, W);
    // quest target
    const tracked = g.state.tracked;
    const qt = g.quests.target(tracked);
    // locations
    for (const l of LOCATIONS) {
      if (!g.state.discovered.includes(l.id)) continue;
      const [x, y] = this.px(l.at[0], l.at[1]);
      ctx.fillStyle = 'rgba(14,22,40,0.75)';
      ctx.beginPath();
      ctx.arc(x * k, y * k, 9 * k + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = KIND_COLOR[l.kind];
      ctx.beginPath();
      ctx.arc(x * k, y * k, 5.5 * k + 1, 0, Math.PI * 2);
      ctx.fill();
      if (opts.hover === l.id || W > 600) {
        ctx.font = `700 ${Math.round(11 * k + 3)}px Nunito, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(14,22,40,0.85)';
        ctx.strokeText(l.name, x * k, y * k - 12 * k - 4);
        ctx.fillStyle = '#fff4dc';
        ctx.fillText(l.name, x * k, y * k - 12 * k - 4);
      }
    }
    // villagers
    for (const n of NPCS) {
      const [x, y] = this.px(n.at[0], n.at[1]);
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath();
      ctx.arc(x * k, y * k, 2.5 * k + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (qt) {
      const [x, y] = this.px(qt[0], qt[1]);
      star(ctx, x * k, y * k, 9 * k + 3, '#f2c35a');
    }
    // companion
    const c = g.creatures.companion;
    if (c && !c.dismissed) {
      const [x, y] = this.px(c.pos.x, c.pos.z);
      ctx.fillStyle = '#ff9ab0';
      ctx.beginPath();
      ctx.arc(x * k, y * k, 3.5 * k + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    // you
    const [px, py] = this.px(p.x, p.z);
    arrow(ctx, px * k, py * k, Math.PI - g.player.yaw, 9 * k + 4);
  }

  drawMini(canvas: HTMLCanvasElement): void {
    const g = this.g;
    this.paintFog();
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const p = g.player.pos;
    const [px, py] = this.px(p.x, p.z);
    const zoom = 2.6;
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(g.rig.yaw);
    ctx.scale(zoom, zoom);
    ctx.translate(-px, -py);
    ctx.drawImage(this.base, 0, 0);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.fog, 0, 0);
    ctx.globalAlpha = 1;
    for (const l of LOCATIONS) {
      if (!g.state.discovered.includes(l.id)) continue;
      const [x, y] = this.px(l.at[0], l.at[1]);
      ctx.fillStyle = KIND_COLOR[l.kind];
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const n of NPCS) {
      const [x, y] = this.px(n.at[0], n.at[1]);
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const cr of g.creatures.visible()) {
      if (cr.companion) continue;
      const [x, y] = this.px(cr.pos.x, cr.pos.z);
      ctx.fillStyle = g.state.species[cr.species].observed ? '#ffffff' : 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // quest marker on the rim when it is off the minimap
    const qt = g.quests.target(g.state.tracked);
    if (qt) {
      const [qx, qy] = this.px(qt[0], qt[1]);
      let dx = (qx - px) * zoom;
      let dy = (qy - py) * zoom;
      const cs = Math.cos(g.rig.yaw);
      const sn = Math.sin(g.rig.yaw);
      const rx = dx * cs - dy * sn;
      const ry = dx * sn + dy * cs;
      dx = rx;
      dy = ry;
      const d = Math.hypot(dx, dy);
      const r = W / 2 - 12;
      if (d > r) {
        dx = (dx / d) * r;
        dy = (dy / d) * r;
      }
      star(ctx, W / 2 + dx, W / 2 + dy, 8, '#f2c35a');
    }
    // you (always pointing up relative to view)
    arrow(ctx, W / 2, W / 2, Math.PI - g.player.yaw + g.rig.yaw, 9);
    ctx.strokeStyle = 'rgba(242,195,90,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Location under a map pixel, if discovered. */
  pick(mx: number, my: number, scale: number): LocationDef | null {
    let best: LocationDef | null = null;
    let bd = 14;
    for (const l of LOCATIONS) {
      if (!this.g.state.discovered.includes(l.id)) continue;
      const [x, y] = this.px(l.at[0], l.at[1]);
      const d = Math.hypot(x * scale - mx, y * scale - my);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  }
}

/** Draws the player arrow; `rot` is the canvas rotation (0 points up). */
function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#ffd75a';
  ctx.strokeStyle = '#4a2a0a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.7, size * 0.8);
  ctx.lineTo(0, size * 0.35);
  ctx.lineTo(-size * 0.7, size * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#4a2a0a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
