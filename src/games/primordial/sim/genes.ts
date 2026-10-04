import type { Rng } from '../../shared/rng';

// The genome: a dozen numbers between 0 and 1. Everything a creature is and
// does comes from these, and every child inherits them with small mutations.

export const enum G {
  Size = 0,
  Speed = 1,
  Sense = 2,
  Diet = 3,
  Aggression = 4,
  Social = 5,
  Fear = 6,
  Fertility = 7,
  Lifespan = 8,
  Heat = 9,
  Hue = 10,
  Mutation = 11,
}

export const GENES = 12;

export const GENE_NAMES = ['Size', 'Speed', 'Senses', 'Diet', 'Aggression', 'Sociality', 'Caution', 'Fertility', 'Lifespan', 'Heat preference', 'Color', 'Mutability'];

/** How much each gene counts when telling species apart. */
const WEIGHT = [1.2, 1, 0.8, 1.6, 0.6, 0.7, 0.5, 0.6, 0.5, 0.9, 0.35, 0.2];

export function distance(a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number): number {
  let s = 0;
  for (let k = 0; k < GENES; k++) {
    let d = a[ao + k] - b[bo + k];
    if (k === G.Hue) d = Math.min(Math.abs(d), 1 - Math.abs(d));
    s += WEIGHT[k] * d * d;
  }
  return Math.sqrt(s / 9);
}

/** A first, simple grazer: small, slow-ish, plant-eating. */
export function primitiveGenome(rng: Rng, out: Float32Array, o: number, hue = rng.next()): void {
  out[o + G.Size] = rng.float(0.15, 0.35);
  out[o + G.Speed] = rng.float(0.25, 0.45);
  out[o + G.Sense] = rng.float(0.2, 0.4);
  out[o + G.Diet] = rng.float(0, 0.12);
  out[o + G.Aggression] = rng.float(0, 0.2);
  out[o + G.Social] = rng.float(0.1, 0.5);
  out[o + G.Fear] = rng.float(0.3, 0.6);
  out[o + G.Fertility] = rng.float(0.3, 0.6);
  out[o + G.Lifespan] = rng.float(0.3, 0.6);
  out[o + G.Heat] = rng.float(0.35, 0.65);
  out[o + G.Hue] = hue;
  out[o + G.Mutation] = rng.float(0.3, 0.5);
}

/** Copy a genome with mutations. `boost` multiplies mutation strength (storms). */
export function mutate(rng: Rng, src: Float32Array, so: number, dst: Float32Array, dO: number, boost = 1): void {
  const sigma = (0.012 + src[so + G.Mutation] * 0.07) * boost;
  for (let k = 0; k < GENES; k++) {
    let v = src[so + k];
    if (rng.next() < 0.5) v += gauss(rng) * sigma;
    if (k === G.Hue) v = ((v % 1) + 1) % 1;
    else v = Math.max(0, Math.min(1, v));
    dst[dO + k] = v;
  }
}

function gauss(rng: Rng): number {
  const u = Math.max(1e-9, rng.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

// --- Names ----------------------------------------------------------------------------

const ONSET = ['th', 'v', 'pr', 'm', 'k', 'z', 'l', 'ph', 's', 'n', 'ch', 'gl', 'x', 'r', 'dr', 'b'];
const VOWEL = ['a', 'o', 'e', 'i', 'y', 'u', 'ae', 'io'];
const CODA = ['lor', 'nax', 'mys', 'thys', 'ron', 'vex', 'dor', 'lis', 'ptera', 'cyon', 'phora', 'mon', 'tes', 'gon'];

export function genusName(rng: Rng): string {
  const s = rng.pick(ONSET) + rng.pick(VOWEL) + (rng.chance(0.5) ? rng.pick(ONSET) + rng.pick(VOWEL) : '') + rng.pick(CODA);
  return s[0].toUpperCase() + s.slice(1);
}

/** A Latin-ish epithet from the most striking traits. */
export function epithet(genes: ArrayLike<number>, o: number, rng: Rng): string {
  const t = (k: number) => genes[o + k];
  const opts: [string, number][] = [
    ['gigas', t(G.Size) > 0.78 ? 3 : 0],
    ['magnus', t(G.Size) > 0.62 ? 2 : 0],
    ['minimus', t(G.Size) < 0.18 ? 2.5 : 0],
    ['velox', t(G.Speed) > 0.72 ? 2.5 : 0],
    ['tardus', t(G.Speed) < 0.2 ? 2 : 0],
    ['rapax', t(G.Diet) > 0.7 ? 3 : 0],
    ['omnivorus', t(G.Diet) > 0.38 && t(G.Diet) < 0.6 ? 2 : 0],
    ['ferox', t(G.Aggression) > 0.75 ? 2.5 : 0],
    ['oculatus', t(G.Sense) > 0.72 ? 2 : 0],
    ['gregarius', t(G.Social) > 0.72 ? 2.5 : 0],
    ['solitarius', t(G.Social) < 0.15 ? 1.5 : 0],
    ['timidus', t(G.Fear) > 0.8 ? 1.5 : 0],
    ['fecundus', t(G.Fertility) < 0.2 ? 2 : 0],
    ['longaevus', t(G.Lifespan) > 0.8 ? 1.5 : 0],
    ['thermophilus', t(G.Heat) > 0.78 ? 2.5 : 0],
    ['glacialis', t(G.Heat) < 0.22 ? 2.5 : 0],
    ['mutabilis', t(G.Mutation) > 0.8 ? 1.5 : 0],
    ['vulgaris', 0.6],
    ['communis', 0.5],
    ['primus', 0.3],
  ];
  return rng.weighted(opts) ?? 'vulgaris';
}

/** Plain-language summary of a genome, for the species card. */
export function describe(genes: ArrayLike<number>, o: number): string {
  const t = (k: number) => genes[o + k];
  const parts: string[] = [];
  parts.push(t(G.Size) > 0.66 ? 'large' : t(G.Size) < 0.25 ? 'tiny' : 'mid-sized');
  parts.push(t(G.Diet) > 0.62 ? 'predator' : t(G.Diet) > 0.36 ? 'omnivore' : 'grazer');
  if (t(G.Speed) > 0.68) parts.push('fast');
  if (t(G.Social) > 0.66) parts.push('lives in herds');
  if (t(G.Aggression) > 0.72) parts.push('aggressive');
  if (t(G.Sense) > 0.7) parts.push('keen senses');
  if (t(G.Heat) > 0.72) parts.push('loves the heat');
  else if (t(G.Heat) < 0.28) parts.push('cold-adapted');
  return parts.join(', ');
}
