// Sculpted anime designs for the vale's creatures (species ids unchanged, so
// saves keep resolving). Coordinates in metres; the creature faces +Z with
// its feet at the origin.

import type { SpeciesId } from '../../data/species';
import type { CreatureDesign, CreaturePalette } from './build';

export interface AnimeSpecies {
  name: string;
  design: CreatureDesign;
  palette: CreaturePalette;
  variants: Record<string, Partial<CreaturePalette>>;
}

/** Puddlit: a glossy droplet of river water with fin-flaps and a curled tip. */
const puddlit: CreatureDesign = {
  style: 'slime',
  bones: [
    { name: 'root', parent: null, at: [0, 0, 0] },
    { name: 'body', parent: 'root', at: [0, 0, 0] },
    { name: 'head', parent: 'body', at: [0, 0.27, 0.02] },
    { name: 'tip', parent: 'head', at: [0, 0.44, -0.02] },
    { name: 'finL', parent: 'body', at: [0.2, 0.24, 0], mirror: true },
  ],
  parts: [
    { shape: { k: 'ellipsoid', c: [0, 0.2, 0], r: [0.26, 0.2, 0.24] }, bone: 'body', color: 'body' },
    { shape: { k: 'sphere', c: [0, 0.28, 0], r: 0.205 }, bone: 'head', color: 'body', blend: 0.12 },
    { shape: { k: 'sphere', c: [0, -0.9, 0], r: 0.92 }, bone: 'body', color: 'body', blend: 0.05, carve: true },
    { shape: { k: 'cone', a: [0, 0.4, -0.01], b: [0, 0.57, -0.05], ra: 0.09, rb: 0.026 }, bone: 'tip', color: 'body', blend: 0.08 },
    { shape: { k: 'cone', a: [0, 0.57, -0.05], b: [0, 0.6, -0.12], ra: 0.026, rb: 0.016 }, bone: 'tip', color: 'body', blend: 0.02 },
    { shape: { k: 'cone', a: [0.2, 0.24, 0], b: [0.31, 0.31, -0.02], ra: 0.05, rb: 0.028 }, bone: 'finL', color: 'accent', blend: 0.05, mirror: true },
  ],
  paints: [
    { shape: { k: 'ellipsoid', c: [0, 0.13, 0.18], r: [0.19, 0.12, 0.12] }, color: 'belly', soft: 0.008 },
    { shape: { k: 'sphere', c: [0, 0.6, -0.11], r: 0.075 }, color: 'accent', soft: 0.01 },
  ],
  face: { bone: 'head', eye: [0.085, 0.29, 0.5], eyeSize: [0.085, 0.105], mouth: [0, 0.2, 0.5], mouthSize: [0.24, 0.12], look: [0, 0, 1] },
  cell: 0.012,
  outline: 0.005,
  gloss: 0.5,
  shade: '#aec4f2',
  height: 0.62,
};

/** Mossbun: a round mochi bunny with moss-tipped ears and a leaf sprout. */
const mossbun: CreatureDesign = {
  style: 'hopper',
  bones: [
    { name: 'root', parent: null, at: [0, 0, 0] },
    { name: 'body', parent: 'root', at: [0, 0, 0] },
    { name: 'head', parent: 'body', at: [0, 0.34, 0.06] },
    { name: 'earL', parent: 'head', at: [0.065, 0.5, 0.03], mirror: true },
    { name: 'footL', parent: 'body', at: [0.085, 0.03, 0.12], mirror: true },
    { name: 'hindL', parent: 'body', at: [0.12, 0.06, -0.07], mirror: true },
    { name: 'tail', parent: 'body', at: [0, 0.17, -0.22] },
  ],
  parts: [
    { shape: { k: 'ellipsoid', c: [0, 0.19, -0.02], r: [0.2, 0.18, 0.21] }, bone: 'body', color: 'body' },
    { shape: { k: 'sphere', c: [0, 0.37, 0.07], r: 0.165 }, bone: 'head', color: 'body', blend: 0.09 },
    { shape: { k: 'ellipsoid', c: [0.08, 0.32, 0.15], r: [0.08, 0.06, 0.07] }, bone: 'head', color: 'body', blend: 0.05, mirror: true },
    { shape: { k: 'cone', a: [0.06, 0.48, 0.04], b: [0.1, 0.74, 0], ra: 0.04, rb: 0.052 }, bone: 'earL', color: 'body', blend: 0.04, mirror: true },
    { shape: { k: 'ellipsoid', c: [0.085, 0.035, 0.13], r: [0.05, 0.035, 0.07] }, bone: 'footL', color: 'body', blend: 0.03, mirror: true },
    { shape: { k: 'ellipsoid', c: [0.12, 0.045, -0.06], r: [0.065, 0.045, 0.11] }, bone: 'hindL', color: 'body', blend: 0.04, mirror: true },
    { shape: { k: 'sphere', c: [0, 0.16, -0.23], r: 0.06 }, bone: 'tail', color: 'belly', blend: 0.03 },
    { shape: { k: 'cone', a: [0, 0.52, 0.06], b: [0.05, 0.6, 0.08], ra: 0.012, rb: 0.028 }, bone: 'head', color: 'accent', blend: 0.015, mirror: true },
  ],
  paints: [
    { shape: { k: 'ellipsoid', c: [0, 0.14, 0.15], r: [0.13, 0.12, 0.1] }, color: 'belly', soft: 0.01 },
    { shape: { k: 'ellipsoid', c: [0, 0.31, 0.21], r: [0.07, 0.05, 0.045] }, color: 'belly', soft: 0.008 },
    { shape: { k: 'ellipsoid', c: [0.085, 0.63, 0.045], r: [0.03, 0.11, 0.03] }, color: 'inner', soft: 0.006, mirror: true, bones: ['earL'] },
    { shape: { k: 'sphere', c: [0.1, 0.765, -0.005], r: 0.055 }, color: 'accent', soft: 0.008, mirror: true },
  ],
  face: { bone: 'head', eye: [0.068, 0.4, 0.5], eyeSize: [0.072, 0.092], mouth: [0, 0.315, 0.5], mouthSize: [0.22, 0.11], look: [0, 0, 1] },
  cell: 0.011,
  outline: 0.005,
  gloss: 0,
  shade: '#dcc4dc',
  height: 0.8,
};

export const ANIME_SPECIES: Partial<Record<SpeciesId, AnimeSpecies>> = {
  aquoray: {
    name: 'Puddlit',
    design: puddlit,
    palette: { body: '#62c0ff', belly: '#dff6ff', accent: '#4a8cff', glow: '#9ff0ff', eye: '#14407a', cheek: '#ff9cc0' },
    variants: { coral: { body: '#ff8fb4', belly: '#fff0f5', accent: '#ff6a96', eye: '#7a1a40' } },
  },
  terrabun: {
    name: 'Mossbun',
    design: mossbun,
    palette: { body: '#f6efdf', belly: '#ffffff', accent: '#6fc04a', glow: '#9ff2ff', eye: '#5a3a22', inner: '#ffbccb', cheek: '#ff9cb0' },
    variants: { elder: { body: '#d9c39a', accent: '#8aa05a', eye: '#3a2a1a' } },
  },
};

export function animePalette(s: AnimeSpecies, variant: string | null): CreaturePalette {
  return { ...s.palette, ...(variant ? s.variants[variant] : {}) } as CreaturePalette;
}
