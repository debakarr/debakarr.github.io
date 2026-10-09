// Procedural textures for the 3D scene, generated in code so nothing has to be
// downloaded. The ground texture is seamless value noise: it is sampled with
// world-space UVs so the world shows continuous grain instead of the same
// texture stamped on every tile.

import { CanvasTexture, LinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { Rng } from '../../../shared/rng';

/** Periodic value noise: lattice values wrap, so the tile edges match. */
function periodicLattice(rng: Rng, size: number, cells: number): Float32Array {
  const v = new Float32Array(cells * cells);
  for (let i = 0; i < v.length; i++) v[i] = rng.next();
  const at = (x: number, y: number): number => ((y % cells) * cells) + (x % cells);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const y0 = Math.floor(fy);
    // Smoothstep the interpolation so there is no visible lattice grid.
    const sy = (fy - y0) * (fy - y0) * (3 - 2 * (fy - y0));
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const x0 = Math.floor(fx);
      const sx = (fx - x0) * (fx - x0) * (3 - 2 * (fx - x0));
      const a = v[at(x0, y0)] * (1 - sx) + v[at(x0 + 1, y0)] * sx;
      const b = v[at(x0, y0 + 1)] * (1 - sx) + v[at(x0 + 1, y0 + 1)] * sx;
      out[y * size + x] = a * (1 - sy) + b * sy;
    }
  }
  return out;
}

/** Fbm from wrapped octaves, still seamless because every octave is. */
function periodicFbm(rng: Rng, size: number, cells: number, octaves: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let sum = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = periodicLattice(rng, size, cells * (1 << o));
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    sum += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

/**
 * Ground grain. Only broad, soft features: with LinearFilter and no mipmaps
 * (which some software renderers cannot generate), any fine detail turns into
 * moire stripes at distance. Broad mottling is what survives minification, and
 * per-tile vertex colour plus scattered props carry the fine detail instead.
 */
export function makeGroundTexture(seed = 7, size = 128): Texture {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d')!;
  const rng = new Rng(seed);
  const broad = periodicFbm(rng, size, 4, 2);
  const soft = periodicFbm(rng, size, 9, 1);
  const img = g.createImageData(size, size);
  for (let i = 0; i < broad.length; i++) {
    // Deliberately low contrast: at distance this texture is minified with no
    // mipmaps, and a high-contrast pattern turns into visible moire bands. The
    // per-tile vertex colours carry the real variation; this only softens it.
    const v = 0.86 + broad[i] * 0.16 + (soft[i] - 0.5) * 0.06;
    const b = Math.max(0, Math.min(255, Math.round(v * 255)));
    img.data[i * 4] = b;
    img.data[i * 4 + 1] = b;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** How many tiles one ground texture spans, controlling grain size. */
export const GROUND_TEX_TILES = 4;

/** Soft radial blob, used for the shadow under a figure. */
export function makeBlobTexture(): Texture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
