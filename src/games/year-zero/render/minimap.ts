import { drawWorld } from '../ui/screens/lists';
import type { Game } from '../sim/game';
import type { MapView } from './view';

// The overview map in the corner: the explored world drawn as little hexes
// (the same picture as the World Map screen). It is rebuilt when the world
// changes; the view outline redraws whenever the camera moves.

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: HTMLCanvasElement;
  private g: Game;
  private r: MapView;

  constructor(canvas: HTMLCanvasElement, g: Game, r: MapView) {
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
    this.rebuild();
  }

  /** Redraws the world picture (once per turn or when the map changes). */
  rebuild(): void {
    drawWorld(this.image, this.g, 220, false);
    this.canvas.width = this.image.width;
    this.canvas.height = this.image.height;
    this.draw();
  }

  draw(): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#16223a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
    // The area in view: a trapezoid when the map is tilted in 3D.
    const [ww, wh] = this.r.worldSize();
    const sx = this.canvas.width / ww;
    const sy = this.canvas.height / wh;
    const poly = this.r.viewPolygon?.() ?? [
      this.r.screenToWorld(0, 0), this.r.screenToWorld(this.r.viewW, 0),
      this.r.screenToWorld(this.r.viewW, this.r.viewH), this.r.screenToWorld(0, this.r.viewH),
    ];
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.canvas.width, this.canvas.height);
    ctx.clip();
    ctx.beginPath();
    poly.forEach(([x, y], k) => (k ? ctx.lineTo(x * sx, y * sy) : ctx.moveTo(x * sx, y * sy)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 246, 216, 0.12)';
    ctx.fill();
    ctx.strokeStyle = '#fff6d8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
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

