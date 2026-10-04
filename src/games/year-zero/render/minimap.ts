import { TERRAIN_COLOR } from '../data/terrain';
import type { Game } from '../sim/game';
import type { MapRenderer } from './renderer';

// A pixel-per-tile overview. The terrain image is rebuilt once per turn; the
// viewport rectangle redraws whenever the camera moves.

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: HTMLCanvasElement;
  private g: Game;
  private r: MapRenderer;
  private scale = 3;

  constructor(canvas: HTMLCanvasElement, g: Game, r: MapRenderer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.image = document.createElement('canvas');
    this.g = g;
    this.r = r;
    this.bind();
    this.setGame(g);
  }

  setGame(g: Game): void {
    this.g = g;
    const map = g.s.map;
    this.scale = Math.max(2, Math.floor(220 / map.w));
    this.canvas.width = map.w * this.scale + this.scale;
    this.canvas.height = map.h * this.scale;
    this.image.width = map.w * 2 + 1;
    this.image.height = map.h;
    this.rebuild();
  }

  rebuild(): void {
    const g = this.g;
    const map = g.s.map;
    const ictx = this.image.getContext('2d')!;
    const img = ictx.createImageData(this.image.width, this.image.height);
    const data = img.data;
    const player = g.player;
    const ownerRgb = g.s.civs.map((c) => {
      const n = parseInt(c.color.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    });
    for (let r = 0; r < map.h; r++) {
      for (let c = 0; c < map.w; c++) {
        const i = r * map.w + c;
        let rgb: number[];
        if (!player.explored[i]) rgb = [26, 36, 48];
        else {
          const o = map.owner[i];
          const base = TERRAIN_COLOR[map.terrain[i]];
          if (map.cityAt[i] >= 0) rgb = [245, 238, 220];
          else if (o >= 0) {
            const oc = ownerRgb[o];
            rgb = [base[0] * 0.45 + oc[0] * 0.55, base[1] * 0.45 + oc[1] * 0.55, base[2] * 0.45 + oc[2] * 0.55];
          } else if (map.relief[i] === 2) rgb = [120, 110, 98];
          else rgb = [base[0], base[1], base[2]];
          if (!player.visible[i]) rgb = rgb.map((v) => v * 0.62 + 18);
        }
        // Odd rows shift half a hex: two pixels per tile lets us offset by one.
        const x0 = c * 2 + (r & 1);
        for (const x of [x0, x0 + 1]) {
          const k = (r * this.image.width + x) * 4;
          data[k] = rgb[0];
          data[k + 1] = rgb[1];
          data[k + 2] = rgb[2];
          data[k + 3] = 255;
        }
      }
    }
    ictx.putImageData(img, 0, 0);
    this.draw();
  }

  draw(): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#18212c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
    // Viewport rectangle.
    const [ww, wh] = this.r.worldSize();
    const [x0, y0] = this.r.screenToWorld(0, 0);
    const [x1, y1] = this.r.screenToWorld(this.r.viewW, this.r.viewH);
    const sx = this.canvas.width / ww;
    const sy = this.canvas.height / wh;
    ctx.strokeStyle = '#fff6d8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(Math.max(0, x0 * sx), Math.max(0, y0 * sy), Math.min(this.canvas.width, (x1 - x0) * sx), Math.min(this.canvas.height, (y1 - y0) * sy));
  }

  private bind(): void {
    let dragging = false;
    const go = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      const [ww, wh] = this.r.worldSize();
      this.r.cam.x = fx * ww;
      this.r.cam.y = fy * wh;
      this.r.clampCamera();
      this.r.request();
      this.draw();
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      go(e);
    });
    this.canvas.addEventListener('pointermove', (e) => dragging && go(e));
    this.canvas.addEventListener('pointerup', () => (dragging = false));
    this.canvas.addEventListener('pointercancel', () => (dragging = false));
  }
}

