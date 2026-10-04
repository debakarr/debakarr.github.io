// A planet portrait for the inspect panel: a lit sphere with continents,
// oceans, ice caps, forests, gas bands and city lights, drawn pixel by
// pixel from the planet's seed. Cached by what it looks like.

import { Noise2D } from '../../shared/noise';
import { Rng } from '../../shared/rng';
import type { Kind, Planet } from '../sim/planets';
import { KIND_COLOR } from './renderer';

export interface PlanetLook {
  planet: Planet;
  kind: Kind;
  temp: number;
  life: number;
  /** Civilization era index, or -1. */
  civEra: number;
  oxygen: number;
  gone: boolean;
}

const cache = new Map<string, HTMLCanvasElement>();

export function planetPortrait(look: PlanetLook, size: number): HTMLCanvasElement {
  const key = `${look.planet.id}:${look.planet.look}:${look.kind}:${look.life}:${Math.min(3, Math.max(-1, Math.floor(look.civEra / 3)))}:${look.oxygen > 0.5 ? 1 : 0}:${look.gone ? 1 : 0}:${Math.round(look.temp / 25)}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c, look, size);
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  cache.set(key, c);
  return c;
}

function draw(c: HTMLCanvasElement, L: PlanetLook, size: number): void {
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const rng = new Rng(L.planet.look);
  const noise = new Noise2D(rng);
  const off = rng.float(0, 100);
  const R = L.planet.rings ? size / 3.2 : size / 2 - 3;
  const [br, bg, bb] = KIND_COLOR[L.kind];
  const gas = L.planet.body === 'gas';
  const water = L.kind === 'ocean' ? 0.97 : L.kind === 'desert' || L.kind === 'barren' || L.kind === 'lava' ? 0 : L.planet.water;
  const sea = water <= 0 ? -2 : -0.55 + water * 1.05;
  const cold = L.temp < 250;
  const lightsOn = L.civEra >= 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = (px - size / 2 + 0.5) / R;
      const dy = (py - size / 2 + 0.5) / R;
      const rr = dx * dx + dy * dy;
      const o = (py * size + px) * 4;
      if (rr > 1) {
        // Atmosphere rim.
        const rim = Math.max(0, 1 - (Math.sqrt(rr) - 1) * 14);
        if (rim > 0 && L.planet.air > 0.1 && !L.gone) {
          const oxy = L.oxygen > 0.5;
          d[o] = oxy ? 120 : 230;
          d[o + 1] = oxy ? 180 : 170;
          d[o + 2] = oxy ? 255 : 120;
          d[o + 3] = rim * 140 * L.planet.air;
        }
        continue;
      }
      const nz = Math.sqrt(1 - rr);
      // Light from the upper left.
      const lit = Math.max(0, -dx * 0.55 - dy * 0.45 + nz * 0.7);
      const shade = 0.15 + lit * 0.95;
      let r: number;
      let g: number;
      let b: number;
      if (L.gone) {
        const n = noise.fbm(dx * 3 + off, dy * 3, 3);
        r = 90 + n * 40;
        g = 70 + n * 30;
        b = 60 + n * 25;
      } else if (gas) {
        const band = Math.sin(dy * 9 + noise.fbm(dx * 2 + off, dy * 6, 3) * 2.4);
        r = br + band * 28;
        g = bg + band * 22;
        b = bb + band * 18;
      } else {
        const e = noise.fbm(dx * 1.7 + off, dy * 1.7 + off * 0.5, 5);
        const lat = Math.abs(dy);
        if (e < sea) {
          const depth = Math.min(1, (sea - e) * 2);
          r = 30 - depth * 15;
          g = 90 - depth * 40;
          b = 180 - depth * 40;
          if (cold || lat > 0.86 - (L.temp - 250) / 300) {
            r = g = 225;
            b = 240;
          }
        } else {
          const h = Math.min(1, (e - sea) * 2.2);
          if (L.kind === 'lava') {
            const crack = Math.abs(noise.get(dx * 6 + off, dy * 6)) < 0.08;
            r = crack ? 255 : 60 + h * 30;
            g = crack ? 120 : 40 + h * 20;
            b = crack ? 40 : 34;
          } else if (L.life >= 3 && L.temp < 320) {
            r = 60 + h * 70;
            g = 120 + h * 40 - (lat > 0.6 ? 0 : 10);
            b = 60 + h * 30;
          } else {
            r = br * 0.8 + h * 50;
            g = bg * 0.75 + h * 40;
            b = bb * 0.7 + h * 30;
            if (L.life >= 1 && L.life < 3) g += 12;
          }
          if (cold || lat > 0.9 - (L.temp - 250) / 260) {
            r = 230;
            g = 238;
            b = 245;
          }
        }
        // Clouds.
        if (L.planet.air > 0.2) {
          const cl = noise.fbm(dx * 2.6 + off * 2, dy * 4.2, 4);
          if (cl > 0.25) {
            const a = Math.min(0.75, (cl - 0.25) * 2.4) * Math.min(1, L.planet.air * 1.2);
            r += (240 - r) * a;
            g += (240 - g) * a;
            b += (245 - b) * a;
          }
        }
      }
      let R2 = r * shade;
      let G2 = g * shade;
      let B2 = b * shade;
      // City lights on the night side.
      if (lightsOn && lit < 0.18 && !gas && !L.gone) {
        const e = noise.fbm(dx * 1.7 + off, dy * 1.7 + off * 0.5, 5);
        if (e > sea + 0.03 && noise.get(dx * 22 + off, dy * 22) > 0.45) {
          R2 = 255;
          G2 = 210;
          B2 = 120;
        }
      }
      d[o] = R2;
      d[o + 1] = G2;
      d[o + 2] = B2;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (L.planet.rings) {
    ctx.strokeStyle = `rgba(${br},${bg},${bb},0.6)`;
    ctx.lineWidth = Math.max(2, size / 40);
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2, R * 1.55, R * 0.42, -0.35, Math.PI * 0.02, Math.PI * 0.98);
    ctx.stroke();
  }
}
