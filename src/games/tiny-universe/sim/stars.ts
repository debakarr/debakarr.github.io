// Stellar physics, simplified: masses from an initial mass function,
// main-sequence luminosity and lifetime from mass, and the phases a star
// passes through. Masses are in suns, luminosities in suns, times in
// millions of years (Myr).

import type { Rng } from '../../shared/rng';

export const Phase = { Proto: 0, Main: 1, Giant: 2, WhiteDwarf: 3, Neutron: 4, BlackHole: 5 } as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export const PHASE_NAME = ['Protostar', 'Main sequence', 'Giant', 'White dwarf', 'Neutron star', 'Black hole'];

/** Mass in suns. `chaos` (0..2) makes heavy stars more common. */
export function sampleMass(rng: Rng, chaos: number): number {
  const dwarfShare = 0.62 - chaos * 0.08;
  if (rng.next() < dwarfShare) return 0.1 + Math.pow(rng.next(), 1.4) * 0.4;
  // Salpeter-like tail from 0.5 to 60 suns.
  const a = 1.35 - chaos * 0.12;
  const lo = 0.5;
  const hi = 60;
  return lo * Math.pow(1 - rng.next() * (1 - Math.pow(hi / lo, -a)), -1 / a);
}

/** Main-sequence luminosity (suns). */
export function luminosity(m: number): number {
  if (m < 0.43) return 0.23 * Math.pow(m, 2.3);
  if (m < 2) return Math.pow(m, 4);
  if (m < 20) return 1.4 * Math.pow(m, 3.5);
  return 32000 * m;
}

/** Main-sequence lifetime (Myr). Stronger gravity burns stars faster. */
export function lifetime(m: number, gravity: number): number {
  const g = [0.8, 1, 1.3][gravity] ?? 1;
  return Math.max(3, (10000 * Math.pow(m, -2.5)) / g);
}

/** Surface temperature on the main sequence (K). */
export function mainTemp(m: number): number {
  return Math.min(45000, Math.max(2400, 5778 * Math.pow(m, m < 1 ? 0.55 : 0.6)));
}

export function phaseAt(m: number, age: number, life: number): Phase {
  if (age < Math.min(40, life * 0.02)) return Phase.Proto;
  if (age < life * 0.9) return Phase.Main;
  if (age < life) return Phase.Giant;
  return remnantOf(m);
}

export function remnantOf(m: number): Phase {
  if (m < 8) return Phase.WhiteDwarf;
  if (m < 22) return Phase.Neutron;
  return Phase.BlackHole;
}

/** Luminosity now, by phase (suns). */
export function luminosityIn(m: number, phase: Phase): number {
  const l = luminosity(m);
  switch (phase) {
    case Phase.Proto:
      return l * 0.4;
    case Phase.Main:
      return l;
    case Phase.Giant:
      return l * (m < 8 ? 600 : 8) + 200;
    case Phase.WhiteDwarf:
      return 0.002;
    default:
      return 0;
  }
}

export function tempIn(m: number, phase: Phase): number {
  switch (phase) {
    case Phase.Proto:
      return 2600;
    case Phase.Giant:
      return m < 8 ? 3600 : 3900;
    case Phase.WhiteDwarf:
      return 12000;
    case Phase.Neutron:
      return 600000;
    case Phase.BlackHole:
      return 0;
    default:
      return mainTemp(m);
  }
}

export function spectralClass(temp: number): string {
  if (temp < 3700) return 'M';
  if (temp < 5200) return 'K';
  if (temp < 6000) return 'G';
  if (temp < 7500) return 'F';
  if (temp < 10000) return 'A';
  if (temp < 30000) return 'B';
  return 'O';
}

export function describeStar(m: number, phase: Phase): string {
  if (phase === Phase.Proto) return 'Protostar';
  if (phase === Phase.Giant) return m < 8 ? 'Red giant' : 'Red supergiant';
  if (phase === Phase.WhiteDwarf) return 'White dwarf';
  if (phase === Phase.Neutron) return 'Neutron star';
  if (phase === Phase.BlackHole) return 'Black hole';
  const t = mainTemp(m);
  const c = spectralClass(t);
  if (c === 'M') return 'Red dwarf';
  if (c === 'K') return 'Orange dwarf';
  if (c === 'G') return 'Yellow dwarf';
  if (c === 'F') return 'Yellow-white star';
  if (c === 'A') return 'White star';
  return 'Blue giant';
}

const TEMP_STOPS: [number, [number, number, number]][] = [
  [2400, [255, 120, 70]],
  [3500, [255, 170, 100]],
  [5000, [255, 220, 170]],
  [5800, [255, 244, 230]],
  [7500, [236, 240, 255]],
  [10000, [200, 214, 255]],
  [20000, [160, 186, 255]],
  [45000, [138, 166, 255]],
];

/** Blackbody-ish color for a temperature. */
export function tempRgb(temp: number): [number, number, number] {
  if (temp <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  for (let k = 1; k < TEMP_STOPS.length; k++) {
    const [t1, c1] = TEMP_STOPS[k];
    if (temp <= t1) {
      const [t0, c0] = TEMP_STOPS[k - 1];
      const f = (temp - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}
