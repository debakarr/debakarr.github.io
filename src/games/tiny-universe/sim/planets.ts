// Planetary systems, generated deterministically from a star when it forms:
// count and makeup from the metals the star was born with, temperatures from
// its light, and a habitability score from temperature, water, air, mass and
// a magnetic field. Nothing here changes over time except through `PlanetState`.

import { hashString, Rng } from '../../shared/rng';
import { planetName } from './names';

export type Body = 'rocky' | 'gas' | 'ice';

export interface Planet {
  id: number;
  star: number;
  k: number;
  name: string;
  body: Body;
  /** Orbit, astronomical units. */
  a: number;
  /** Earth masses / radii. */
  mass: number;
  radius: number;
  /** Fraction of the surface under water (rocky worlds). */
  water: number;
  /** 0 none … 1 thick. */
  air: number;
  magnetic: number;
  volcanism: number;
  rings: boolean;
  /** Visual seed. */
  look: number;
}

/** Up to 12 planets per star: planet id = star slot * 16 + k. */
export const PLANET_STRIDE = 16;

export function generatePlanets(seed: string, star: number, born: number, mass: number, metal: number, mainLum: number, gravity: number): Planet[] {
  const rng = new Rng(hashString(`${seed}:sys:${star}:${born.toFixed(3)}`));
  const out: Planet[] = [];
  // Heavy elements make planets: the first stars, made of hydrogen and
  // helium only, have few planets and no rocky ones.
  const metals = Math.min(2, metal);
  let count = Math.round(rng.float(0, 2.5) + metals * 2.6 + (mass > 0.4 ? 1 : 0));
  if (metal < 0.05) count = rng.int(3);
  count = Math.min(10, Math.max(0, count));
  const snow = 2.7 * Math.sqrt(Math.max(0.01, mainLum));
  let a = rng.float(0.04, 0.4) * Math.sqrt(Math.max(0.05, mainLum)) + 0.03;
  const gMass = [0.75, 1, 1.4][gravity] ?? 1;
  for (let k = 0; k < count; k++) {
    a *= k === 0 ? 1 : rng.float(1.4, 2.1);
    const inner = a < snow;
    let body: Body;
    if (metal < 0.05) body = 'gas';
    else if (inner) body = rng.chance(Math.min(0.92, 0.35 + metals * 0.4)) ? 'rocky' : 'gas';
    else body = rng.chance(0.55) ? 'gas' : rng.chance(0.55) ? 'ice' : 'rocky';
    let pm: number;
    let radius: number;
    if (body === 'gas') {
      pm = rng.float(8, 400) * gMass;
      radius = Math.min(12, 3.5 + Math.pow(pm, 0.25) * 1.6);
    } else {
      pm = Math.exp(rng.float(-2.3, 1.9)) * gMass;
      radius = Math.pow(pm, 0.28);
    }
    // Worlds near the snow line keep the most water.
    const nearSnow = Math.exp(-Math.pow(Math.log(a / (snow * 0.55)), 2) / 0.7);
    const water = body === 'rocky' ? Math.min(1, Math.max(0, rng.float(-0.15, 1.05) * (0.25 + nearSnow) * Math.min(1.3, 0.4 + metals))) : body === 'ice' ? 1 : 0;
    const air = body === 'gas' ? 1 : pm < 0.12 ? rng.float(0, 0.15) : Math.min(1, rng.float(0.15, 0.9) * Math.min(1.5, Math.sqrt(pm)));
    out.push({
      id: star * PLANET_STRIDE + k,
      star,
      k,
      name: '',
      body,
      a,
      mass: pm,
      radius,
      water,
      air,
      magnetic: body === 'rocky' ? Math.min(1, rng.float(0, 1.2) * Math.min(1, pm)) : 1,
      volcanism: body === 'rocky' ? rng.next() : 0,
      rings: body !== 'rocky' && rng.chance(0.35),
      look: rng.int(1e9),
    });
  }
  return out;
}

export function nameSystem(planets: Planet[], star: string): void {
  for (const p of planets) p.name = planetName(star, p.k);
}

/** Equilibrium temperature plus a greenhouse from the atmosphere (K). */
export function temperature(p: Planet, lum: number, shift: number): number {
  const eq = (278 * Math.pow(Math.max(0, lum), 0.25)) / Math.sqrt(p.a);
  const greenhouse = p.body === 'rocky' ? p.air * (12 + p.air * 26) : 0;
  return Math.max(3, eq + greenhouse + shift);
}

/** 0..1: could life as we know it start and last here? */
export function habitability(p: Planet, temp: number, starMass: number): number {
  // Gas giants never; icy worlds can thaw into oceans when their star swells.
  if (p.body === 'gas') return 0;
  if (temp < 230 || temp > 350) return 0;
  const tf = Math.exp(-Math.pow((temp - 288) / 32, 2));
  const wf = p.water < 0.03 ? 0.08 : p.water > 0.97 ? 0.7 : 0.6 + 0.4 * Math.min(1, p.water * 2.5);
  const af = p.air < 0.08 ? 0.05 : p.air < 0.25 ? 0.5 : 1;
  const mf = p.mass < 0.1 ? 0.15 : p.mass < 0.35 ? 0.55 : p.mass > 6 ? 0.45 : 1;
  const magf = 0.65 + 0.35 * p.magnetic;
  // Small red dwarfs flare and tidally lock their planets.
  const sf = starMass < 0.3 ? 0.55 : starMass < 0.45 ? 0.8 : 1;
  return Math.min(1, tf * wf * af * mf * magf * sf * 1.1);
}

export type Kind = 'lava' | 'desert' | 'ocean' | 'terran' | 'ice' | 'gas' | 'icegiant' | 'barren';

export function kindOf(p: Planet, temp: number): Kind {
  if (p.body === 'gas') return p.mass < 30 || temp < 90 ? 'icegiant' : 'gas';
  if (p.body === 'ice') return temp > 280 ? 'ocean' : 'ice';
  if (temp > 650) return 'lava';
  if (p.air < 0.08) return temp < 230 ? 'ice' : 'barren';
  if (temp < 235) return 'ice';
  if (temp > 350 || p.water < 0.03) return 'desert';
  if (p.water > 0.92) return 'ocean';
  return 'terran';
}

export const KIND_NAME: Record<Kind, string> = {
  lava: 'Lava world',
  desert: 'Desert world',
  ocean: 'Ocean world',
  terran: 'Temperate world',
  ice: 'Ice world',
  gas: 'Gas giant',
  icegiant: 'Ice giant',
  barren: 'Barren rock',
};

export function atmosphereLabel(p: Planet, temp: number, oxygen: number): string {
  if (p.body === 'gas') return 'H₂ 86%, He 13%';
  if (p.body === 'ice' && temp < 200) return 'Thin N₂, CH₄ haze';
  if (p.air < 0.08) return 'None';
  if (oxygen > 0.5) return `N₂ ${Math.round(78 - oxygen * 4)}%, O₂ ${Math.round(oxygen * 21)}%`;
  if (temp > 400) return p.air > 0.6 ? 'Thick CO₂, sulfuric clouds' : 'Thin CO₂';
  return p.air > 0.6 ? 'Dense N₂ and CO₂' : 'Thin N₂ and CO₂';
}
