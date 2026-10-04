// Low-level isometric painting: projection, color shading and the box, roof
// and tree primitives the city is built from.

export const HW = 32;
export const HH = 16;
/** World pixels per building height unit. */
export const UNIT = 18;

/** Top corner of tile (x, y) in world pixels. */
export function iso(x: number, y: number): [number, number] {
  return [(x - y) * HW, (x + y) * HH];
}

const shadeCache = new Map<string, string>();

/** Lighten (f > 0) or darken (f < 0) a hex or rgb() color. */
export function shade(hex: string, f: number): string {
  const key = `${hex}|${f}`;
  let out = shadeCache.get(key);
  if (out) return out;
  let r: number;
  let g: number;
  let b: number;
  if (hex.startsWith('rgb')) {
    [r, g, b] = (hex.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
  } else {
    const n = parseInt(hex.slice(1), 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  }
  if (f >= 0) {
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  } else {
    r *= 1 + f;
    g *= 1 + f;
    b *= 1 + f;
  }
  out = `rgb(${r | 0},${g | 0},${b | 0})`;
  shadeCache.set(key, out);
  return out;
}

export function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((na >> s) & 255) * (1 - t) + ((nb >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

export function diamond(p: Path2D | CanvasRenderingContext2D, x: number, y: number, w = 1, h = 1, inset = 0): void {
  const [tx, ty] = iso(x + inset, y + inset);
  const [rx, ry] = iso(x + w - inset, y + inset);
  const [bx, by] = iso(x + w - inset, y + h - inset);
  const [lx, ly] = iso(x + inset, y + h - inset);
  p.moveTo(tx, ty);
  p.lineTo(rx, ry);
  p.lineTo(bx, by);
  p.lineTo(lx, ly);
  p.closePath();
}

export interface BoxStyle {
  top: string;
  left: string;
  right: string;
}

export function boxStyle(color: string): BoxStyle {
  return { top: shade(color, 0.12), left: shade(color, -0.08), right: shade(color, -0.24) };
}

/** An axis-aligned block on the ground: footprint in tile units, height in world pixels. */
export function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, height: number, st: BoxStyle, lift = 0): void {
  const [tx, ty] = iso(x, y);
  const [rx, ry] = iso(x + w, y);
  const [bx, by] = iso(x + w, y + h);
  const [lx, ly] = iso(x, y + h);
  const z0 = lift;
  const z1 = lift + height;
  ctx.fillStyle = st.left;
  ctx.beginPath();
  ctx.moveTo(lx, ly - z0);
  ctx.lineTo(bx, by - z0);
  ctx.lineTo(bx, by - z1);
  ctx.lineTo(lx, ly - z1);
  ctx.fill();
  ctx.fillStyle = st.right;
  ctx.beginPath();
  ctx.moveTo(bx, by - z0);
  ctx.lineTo(rx, ry - z0);
  ctx.lineTo(rx, ry - z1);
  ctx.lineTo(bx, by - z1);
  ctx.fill();
  ctx.fillStyle = st.top;
  ctx.beginPath();
  ctx.moveTo(tx, ty - z1);
  ctx.lineTo(rx, ry - z1);
  ctx.lineTo(bx, by - z1);
  ctx.lineTo(lx, ly - z1);
  ctx.fill();
}

/** Rows of windows on the two visible faces, drawn as dashed lines. */
export function windows(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, height: number, floors: number, color: string, lift = 0): void {
  if (floors < 1) return;
  const [rx, ry] = iso(x + w, y);
  const [bx, by] = iso(x + w, y + h);
  const [lx, ly] = iso(x, y + h);
  const fh = height / floors;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, fh * 0.42);
  ctx.setLineDash([3.2, 2.4]);
  ctx.beginPath();
  for (let k = 0; k < floors; k++) {
    const z = lift + fh * (k + 0.55);
    // Inset from the corners so windows don't touch the edges.
    ctx.moveTo(lx + (bx - lx) * 0.1, ly + (by - ly) * 0.1 - z);
    ctx.lineTo(lx + (bx - lx) * 0.9, ly + (by - ly) * 0.9 - z);
    ctx.moveTo(bx + (rx - bx) * 0.1, by + (ry - by) * 0.1 - z);
    ctx.lineTo(bx + (rx - bx) * 0.9, by + (ry - by) * 0.9 - z);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/** A pyramid (hip) roof on top of a box. */
export function hipRoof(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: number, rise: number, color: string): void {
  const [tx, ty] = iso(x, y);
  const [rx, ry] = iso(x + w, y);
  const [bx, by] = iso(x + w, y + h);
  const [lx, ly] = iso(x, y + h);
  const [cx, cy] = iso(x + w / 2, y + h / 2);
  const apex = cy - base - rise;
  ctx.fillStyle = shade(color, 0.1);
  ctx.beginPath();
  ctx.moveTo(tx, ty - base);
  ctx.lineTo(rx, ry - base);
  ctx.lineTo(cx, apex);
  ctx.lineTo(lx, ly - base);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(lx, ly - base);
  ctx.lineTo(bx, by - base);
  ctx.lineTo(cx, apex);
  ctx.fill();
  ctx.fillStyle = shade(color, -0.22);
  ctx.beginPath();
  ctx.moveTo(bx, by - base);
  ctx.lineTo(rx, ry - base);
  ctx.lineTo(cx, apex);
  ctx.fill();
}

/** A vertical cylinder (tanks, towers): center in tile units, radius in world px. */
export function cylinder(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, height: number, color: string, lift = 0): void {
  const [cx, cy] = iso(x, y);
  const ry = r * 0.5;
  const grad = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  grad.addColorStop(0, shade(color, 0.05));
  grad.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy - lift, r, ry, 0, 0, Math.PI);
  ctx.lineTo(cx - r, cy - lift - height);
  ctx.ellipse(cx, cy - lift - height, r, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, 0.18);
  ctx.beginPath();
  ctx.ellipse(cx, cy - lift - height, r, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function tree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, detail: boolean): void {
  const [cx, cy] = iso(x, y);
  if (detail) {
    ctx.fillStyle = 'rgba(30,50,20,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx + size * 0.35, cy, size * 0.75, size * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(cx - 1, cy - size * 0.9, 2, size * 0.9);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy - size * 1.15, size * 0.72, 0, Math.PI * 2);
  ctx.fill();
  if (detail) {
    ctx.fillStyle = shade(color, 0.2);
    ctx.beginPath();
    ctx.arc(cx - size * 0.22, cy - size * 1.35, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Integer hash for stable per-tile variety. */
export function hash(a: number, b = 0): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}
