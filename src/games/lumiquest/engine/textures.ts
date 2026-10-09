// Stylized textures painted at load time on canvases: tileable ground detail,
// bark, stone, roof tiles, cloth, water normals and soft sprites. Painting
// them here keeps the game free of third-party texture licences and lets the
// palette stay coherent across every surface.

import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  NoColorSpace,
  type Texture,
} from 'three';
import { Rng } from '../../shared/rng';

export function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: false })!];
}

function toTexture(c: HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean; aniso?: number } = {}): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? NoColorSpace : SRGBColorSpace;
  if (opts.repeat !== false) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  } else {
    t.wrapS = ClampToEdgeWrapping;
    t.wrapT = ClampToEdgeWrapping;
  }
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = opts.aniso ?? 4;
  t.needsUpdate = true;
  return t;
}

/** Periodic value noise in [0,1], tileable over `size`. */
export function tileNoise(size: number, cells: number, seed: number, octaves = 4): Float32Array {
  const out = new Float32Array(size * size);
  const rng = new Rng(seed);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const grid = new Float32Array(n * n);
    for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * n;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      const y1 = (y0 + 1) % n;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * n;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const x1 = (x0 + 1) % n;
        const a = grid[y0 * n + x0];
        const b = grid[y0 * n + x1];
        const c = grid[y1 * n + x0];
        const d = grid[y1 * n + x1];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Paints a noise field between two colours. */
function noiseFill(ctx: CanvasRenderingContext2D, size: number, n: Float32Array, lo: string, hi: string, contrast = 1): void {
  const img = ctx.createImageData(size, size);
  const a = hexRgb(lo);
  const b = hexRgb(hi);
  for (let i = 0; i < n.length; i++) {
    const t = Math.min(1, Math.max(0, (n[i] - 0.5) * contrast + 0.5));
    img.data[i * 4] = a[0] + (b[0] - a[0]) * t;
    img.data[i * 4 + 1] = a[1] + (b[1] - a[1]) * t;
    img.data[i * 4 + 2] = a[2] + (b[2] - a[2]) * t;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const cache = new Map<string, Texture>();
function cached(key: string, make: () => Texture): Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Neutral detail for the ground: grey-ish noise multiplied over vertex colour. */
export function groundDetail(): Texture {
  return cached('ground', () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    noiseFill(ctx, size, tileNoise(size, 8, 11, 5), '#c9c9c9', '#ffffff', 1.6);
    const rng = new Rng(4);
    // tiny blade strokes
    for (let i = 0; i < 1400; i++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      ctx.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.22)' : 'rgba(60,70,40,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rng.float(-1.5, 1.5), y - rng.float(2, 5));
      ctx.stroke();
    }
    return toTexture(c, { aniso: 8 });
  });
}

export function barkTexture(): Texture {
  return cached('bark', () => {
    const w = 128;
    const h = 256;
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = '#7a5236';
    ctx.fillRect(0, 0, w, h);
    const rng = new Rng(7);
    for (let i = 0; i < 60; i++) {
      const x = rng.next() * w;
      ctx.strokeStyle = rng.chance(0.5) ? 'rgba(40,24,14,0.45)' : 'rgba(170,120,80,0.35)';
      ctx.lineWidth = rng.float(1, 3);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= h; y += 16) ctx.lineTo(x + Math.sin(y * 0.05 + i) * 3, y);
      ctx.stroke();
    }
    return toTexture(c);
  });
}

export function stoneTexture(): Texture {
  return cached('stone', () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    noiseFill(ctx, size, tileNoise(size, 6, 21, 5), '#9a958c', '#e4ded2', 1.3);
    // block joints
    ctx.strokeStyle = 'rgba(60,55,50,0.45)';
    ctx.lineWidth = 3;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y = (r * size) / rows;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      const off = r % 2 ? size / 4 : 0;
      for (let k = 0; k < 2; k++) {
        const x = off + (k * size) / 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + size / rows);
        ctx.stroke();
      }
    }
    // moss speckles
    const rng = new Rng(3);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${90 + rng.int(40)},${140 + rng.int(50)},${60 + rng.int(30)},${rng.float(0.15, 0.4)})`;
      ctx.beginPath();
      ctx.arc(rng.next() * size, rng.next() * size, rng.float(1, 5), 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(c);
  });
}

export function rockTexture(): Texture {
  return cached('rock', () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    noiseFill(ctx, size, tileNoise(size, 5, 31, 6), '#a7a39b', '#f1ece2', 1.5);
    const rng = new Rng(13);
    ctx.strokeStyle = 'rgba(70,64,58,0.1)';
    for (let i = 0; i < 14; i++) {
      ctx.lineWidth = rng.float(0.5, 1.2);
      ctx.beginPath();
      let x = rng.next() * size;
      let y = rng.next() * size;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += rng.float(-14, 14);
        y += rng.float(-14, 14);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return toTexture(c);
  });
}

export function plankTexture(): Texture {
  return cached('plank', () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    const rng = new Rng(5);
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y = (r * size) / rows;
      const shade = rng.float(-14, 14);
      ctx.fillStyle = `rgb(${176 + shade},${126 + shade},${82 + shade})`;
      ctx.fillRect(0, y, size, size / rows);
      ctx.strokeStyle = 'rgba(90,60,35,0.35)';
      for (let k = 0; k < 6; k++) {
        ctx.lineWidth = 1;
        ctx.beginPath();
        const yy = y + rng.next() * (size / rows);
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(size * 0.3, yy + rng.float(-3, 3), size * 0.6, yy + rng.float(-3, 3), size, yy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(60,38,20,0.6)';
      ctx.fillRect(0, y, size, 2);
    }
    return toTexture(c);
  });
}

export function plasterTexture(): Texture {
  return cached('plaster', () => {
    const size = 128;
    const [c, ctx] = canvas(size);
    noiseFill(ctx, size, tileNoise(size, 4, 41, 4), '#e9dcc6', '#fff8ea', 1.2);
    return toTexture(c);
  });
}

export function roofTexture(): Texture {
  return cached('roof', () => {
    const size = 256;
    const [c, ctx] = canvas(size);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    const rows = 8;
    const cols = 8;
    const rng = new Rng(9);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols + 1; k++) {
        const x = ((k + (r % 2) * 0.5) * size) / cols;
        const y = (r * size) / rows;
        const g = 215 + rng.int(40);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.beginPath();
        const w = size / cols - 2;
        const hh = size / rows + 6;
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x + w / 2, y);
        ctx.lineTo(x + w / 2, y + hh * 0.7);
        ctx.quadraticCurveTo(x, y + hh * 1.05, x - w / 2, y + hh * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    return toTexture(c);
  });
}

export function cobbleTexture(): Texture {
  return cached('cobble', () => {
    const size = 512;
    const [c, ctx] = canvas(size);
    ctx.clearRect(0, 0, size, size);
    const rng = new Rng(19);
    const cx = size / 2;
    // concentric rings of rounded cobbles, fading out at the rim
    for (let ring = 0; ring < 14; ring++) {
      const r = 14 + ring * 17;
      const n = Math.max(6, Math.floor((Math.PI * 2 * r) / 22));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.37;
        const x = cx + Math.cos(a) * r;
        const y = cx + Math.sin(a) * r;
        const g = 170 + rng.int(50);
        const alpha = Math.min(1, (1 - ring / 14) * 1.6);
        ctx.fillStyle = `rgba(${g + 10},${g - 4},${g - 30},${alpha})`;
        ctx.strokeStyle = `rgba(90,74,54,${alpha * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, 9 + rng.next() * 2, 7 + rng.next() * 2, a, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    const t = toTexture(c, { repeat: false });
    return t;
  });
}

export function windowTexture(): Texture {
  return cached('window', () => {
    const [c, ctx] = canvas(64);
    const g = ctx.createLinearGradient(0, 0, 64, 64);
    g.addColorStop(0, '#bfe4ff');
    g.addColorStop(0.5, '#6f9ad0');
    g.addColorStop(1, '#4a6aa8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(22, 8);
    ctx.lineTo(8, 22);
    ctx.fill();
    ctx.fillStyle = '#6a4630';
    ctx.fillRect(0, 0, 64, 5);
    ctx.fillRect(0, 59, 64, 5);
    ctx.fillRect(0, 0, 5, 64);
    ctx.fillRect(59, 0, 5, 64);
    ctx.fillRect(29, 0, 6, 64);
    ctx.fillRect(0, 29, 64, 6);
    return toTexture(c, { repeat: false });
  });
}

export function stripeTexture(a: string, b: string): Texture {
  return cached(`stripe:${a}:${b}`, () => {
    const [c, ctx] = canvas(128, 16);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? a : b;
      ctx.fillRect(i * 16, 0, 16, 16);
    }
    return toTexture(c);
  });
}

/** Tileable normal map for water, from two noise layers. */
export function waterNormals(): Texture {
  return cached('waternormal', () => {
    const size = 256;
    const n = tileNoise(size, 8, 51, 4);
    const [c, ctx] = canvas(size);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const dx = n[y * size + ((x + 1) % size)] - n[y * size + ((x - 1 + size) % size)];
        const dy = n[((y + 1) % size) * size + x] - n[((y - 1 + size) % size) * size + x];
        const nx = -dx * 6;
        const ny = -dy * 6;
        const l = Math.hypot(nx, ny, 1);
        img.data[i * 4] = ((nx / l) * 0.5 + 0.5) * 255;
        img.data[i * 4 + 1] = ((ny / l) * 0.5 + 0.5) * 255;
        img.data[i * 4 + 2] = ((1 / l) * 0.5 + 0.5) * 255;
        img.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { srgb: false });
  });
}

/** Vertical streaks for falling water. */
export function fallTexture(): Texture {
  return cached('fall', () => {
    const w = 128;
    const h = 256;
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = 'rgba(190,235,255,0.55)';
    ctx.fillRect(0, 0, w, h);
    const rng = new Rng(61);
    for (let i = 0; i < 140; i++) {
      const x = rng.next() * w;
      const len = rng.float(20, 120);
      const y = rng.next() * h;
      const g = ctx.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${rng.float(0.4, 0.95)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, rng.float(1, 3), len);
      if (y + len > h) ctx.fillRect(x, y - h, rng.float(1, 3), len);
    }
    return toTexture(c);
  });
}

/** Soft round sprite for particles and glows. */
export function softDot(): Texture {
  return cached('dot', () => {
    const [c, ctx] = canvas(64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return toTexture(c, { repeat: false });
  });
}

export function heartSprite(): Texture {
  return cached('heart', () => {
    const [c, ctx] = canvas(64);
    ctx.fillStyle = '#ff6f9a';
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(32, 54);
    ctx.bezierCurveTo(4, 34, 8, 8, 32, 20);
    ctx.bezierCurveTo(56, 8, 60, 34, 32, 54);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(22, 24, 5, 3, -0.6, 0, Math.PI * 2);
    ctx.fill();
    return toTexture(c, { repeat: false });
  });
}

export function symbolSprite(symbol: string, color: string): Texture {
  return cached(`sym:${symbol}:${color}`, () => {
    const [c, ctx] = canvas(64);
    ctx.fillStyle = 'rgba(20,28,48,0.75)';
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = 'bold 38px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 32, 34);
    return toTexture(c, { repeat: false });
  });
}

export function runeTexture(): Texture {
  return cached('rune', () => {
    const [c, ctx] = canvas(256);
    ctx.clearRect(0, 0, 256, 256);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    const rng = new Rng(77);
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 3; k++) {
        const cx = 48 + k * 80;
        const cy = 48 + r * 80;
        ctx.beginPath();
        ctx.arc(cx, cy, 22, rng.next() * 6, rng.next() * 6 + 3);
        ctx.moveTo(cx - 18, cy + rng.float(-10, 10));
        ctx.lineTo(cx + 18, cy + rng.float(-10, 10));
        if (rng.chance(0.6)) {
          ctx.moveTo(cx, cy - 22);
          ctx.lineTo(cx + rng.float(-8, 8), cy + 22);
        }
        ctx.stroke();
      }
    }
    return toTexture(c, { repeat: false });
  });
}

/** Cartoon eye painted on an equirectangular strip so it faces +Z on a sphere. */
export function eyeTexture(iris: string): Texture {
  return cached(`eye:${iris}`, () => {
    const [c, ctx] = canvas(256, 128);
    ctx.fillStyle = '#141420';
    ctx.fillRect(0, 0, 256, 128);
    const cx = 64;
    const cy = 64;
    const g = ctx.createRadialGradient(cx, cy + 6, 2, cx, cy, 34);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, iris);
    g.addColorStop(0.8, iris);
    g.addColorStop(1, '#141420');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 22, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0c0c16';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 2, 11, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx - 8, cy - 16, 7, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 8, cy + 14, 3.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    return toTexture(c, { repeat: false });
  });
}

export function cloudTexture(): Texture {
  return cached('cloud', () => {
    const size = 256;
    const n = tileNoise(size, 4, 91, 6);
    const [c, ctx] = canvas(size);
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < n.length; i++) {
      const v = Math.max(0, Math.min(1, (n[i] - 0.48) * 3.2));
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = v * 255;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { srgb: false });
  });
}

export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
