import { h } from './dom';

// Small canvas charts for stats panels.

/** A tiny line chart. */
export function chart(values: number[], color: string, opts: { height?: number; zero?: boolean; fmt?: (v: number) => string; ink?: string; cls?: string } = {}): HTMLCanvasElement {
  const W = 300;
  const H = opts.height ?? 90;
  const cv = h('canvas', { class: opts.cls ?? 'chart', width: W * 2, height: H * 2 });
  const ctx = cv.getContext('2d')!;
  ctx.scale(2, 2);
  if (values.length < 2) {
    ctx.fillStyle = opts.ink ?? '#8a93a0';
    ctx.font = '12px Inter Variable, system-ui, sans-serif';
    ctx.fillText('Not enough history yet', 8, H / 2);
    return cv;
  }
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (opts.zero) lo = Math.min(0, lo);
  if (hi - lo < 1e-6) hi = lo + 1;
  const px = (k: number) => 4 + (k / (values.length - 1)) * (W - 8);
  const py = (v: number) => H - 14 - ((v - lo) / (hi - lo)) * (H - 26);
  ctx.strokeStyle = 'rgba(120,130,145,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, py(lo));
  ctx.lineTo(W - 4, py(lo));
  if (lo < 0 && hi > 0) {
    ctx.moveTo(4, py(0));
    ctx.lineTo(W - 4, py(0));
  }
  ctx.stroke();
  ctx.fillStyle = `${color}22`;
  ctx.beginPath();
  ctx.moveTo(px(0), py(lo));
  values.forEach((v, k) => ctx.lineTo(px(k), py(v)));
  ctx.lineTo(px(values.length - 1), py(lo));
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, k) => (k ? ctx.lineTo(px(k), py(v)) : ctx.moveTo(px(k), py(v))));
  ctx.stroke();
  const fmt = opts.fmt ?? ((v: number) => String(Math.round(v)));
  ctx.fillStyle = opts.ink ?? '#6b7685';
  ctx.font = '10px Inter Variable, system-ui, sans-serif';
  ctx.fillText(fmt(hi), 6, 10);
  ctx.fillText(fmt(lo), 6, H - 3);
  return cv;
}
