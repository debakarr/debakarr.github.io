import { hashString, Rng } from '../../shared/rng';
import { solve } from './autopilot';
import { orbitW, type Body, type Level } from './physics';

// Procedural star systems that get harder as you go: more planets, moons,
// twin suns, asteroid belts and black holes. Each level is solved by the
// autopilot before you see it, and its beacons are placed along a real
// solution, so every level can be finished with three stars.

const PLANET_COLORS = ['#5aa9e6', '#e07a5f', '#81b29a', '#f2cc8f', '#9d8df1', '#e5989b', '#7fd1b9', '#c08552', '#70a1d7'];
const NAMES_A = ['Kepler', 'Halley', 'Vega', 'Lyra', 'Orion', 'Cygnus', 'Draco', 'Hydra', 'Corvus', 'Lumen', 'Tycho', 'Ceres', 'Juno', 'Rigel'];
const NAMES_B = ['Gate', 'Reach', 'Drift', 'Crossing', 'Waltz', 'Spiral', 'Narrows', 'Lantern', 'Cradle', 'Run', 'Loop', 'Well'];

export const TIPS: Record<number, string> = {
  1: 'Drag back from your planet and let go, like a slingshot. The dotted line shows exactly where the probe will fly.',
  2: 'Planets keep moving. Press Wait to let the system turn and find a better launch window.',
  3: 'Fly through beacons for extra stars. Hold anywhere during flight to fire the engine toward your finger.',
  5: 'Pass close behind a planet to steal some of its speed: a gravity slingshot.',
  8: 'Moons pull too. Use them, or avoid them.',
  10: 'Two suns circle each other. Their pull is never still.',
  13: 'A belt of rocks. Thread the gaps.',
  16: 'A black hole sits at the center. It does not forgive.',
};

interface Recipe {
  binary: boolean;
  blackhole: boolean;
  extra: number;
  moons: number;
  belt: boolean;
  targetMoon: boolean;
}

function recipe(i: number, rng: Rng): Recipe {
  return {
    binary: i >= 10 && rng.chance(i === 10 ? 1 : 0.3),
    blackhole: i >= 16 && rng.chance(i === 16 ? 1 : 0.3),
    extra: i <= 2 ? 0 : i <= 4 ? 1 : Math.min(4, 1 + Math.floor((i - 4) / 3)),
    moons: i >= 8 ? Math.min(3, 1 + Math.floor((i - 8) / 5)) : 0,
    belt: i >= 13 && rng.chance(i === 13 ? 1 : 0.35),
    targetMoon: i >= 11 && rng.chance(0.3),
  };
}

function build(index: number, sub: number): Level {
  const rng = new Rng(hashString(`slingshot|${index}|${sub}`));
  const r = recipe(index, rng);
  const bodies: Body[] = [];
  const add = (b: Omit<Body, 'id'>) => {
    bodies.push({ ...b, id: bodies.length });
    return bodies.length - 1;
  };
  // The center: one star, two stars, or a black hole.
  let M = 2.6e6;
  let center: number;
  if (r.blackhole) {
    center = add({ name: 'The Maw', kind: 'blackhole', mass: 4.2e6, radius: 16, color: '#111', x: 0, y: 0, look: rng.next() });
    M = 4.2e6;
  } else if (r.binary) {
    const bary = add({ name: 'Barycenter', kind: 'rock', mass: 0, radius: 0.001, color: '#000', x: 0, y: 0, look: 0 });
    const m = 1.4e6;
    const sep = 70;
    const w = Math.sqrt((2 * m) / (sep * sep * sep)) * 0.95;
    add({ name: 'Castor', kind: 'star', mass: m, radius: 20, color: '#ffd27a', orbit: { parent: bary, r: sep / 2, w, phase: 0 }, look: rng.next() });
    add({ name: 'Pollux', kind: 'star', mass: m, radius: 18, color: '#ffb07a', orbit: { parent: bary, r: sep / 2, w, phase: Math.PI }, look: rng.next() });
    center = bary;
    M = 2 * m;
  } else {
    center = add({ name: 'Sol', kind: 'star', mass: M, radius: 26, color: '#ffd27a', x: 0, y: 0, look: rng.next() });
  }
  // Orbits: home, target and extras, spaced apart.
  const used: number[] = [];
  const pickR = (lo: number, hi: number) => {
    for (let k = 0; k < 40; k++) {
      const v = rng.float(lo, hi);
      if (used.every((u) => Math.abs(u - v) > 75)) {
        used.push(v);
        return v;
      }
    }
    const v = hi + used.length * 20;
    used.push(v);
    return v;
  };
  const planet = (name: string, rOrbit: number, mass: number, radius: number) =>
    add({
      name, kind: 'planet', mass, radius, color: rng.pick(PLANET_COLORS),
      orbit: { parent: center, r: rOrbit, w: orbitW(M, rOrbit) * (rng.chance(0.15) && index > 6 ? -1 : 1), phase: rng.next() * Math.PI * 2 },
      look: rng.next(), rings: rng.chance(0.2),
    });
  const near = index <= 3;
  const rHome = pickR(near ? 200 : 170, near ? 260 : 340);
  const home = planet('Home', rHome, 5e4, 13);
  const outward = rng.chance(0.65) || rHome < 220;
  const rTarget = pickR(outward ? rHome + (near ? 110 : 160) : 140, outward ? rHome + (near ? 180 : 360) : rHome - 90);
  let target = planet(rng.pick(['Aurora', 'Ember', 'Verdant', 'Tidewell', 'Cinder', 'Halcyon', 'Mirth', 'Solace']), rTarget, 4e4, 12);
  for (let k = 0; k < r.extra; k++) {
    const rr = pickR(150, Math.max(rHome, rTarget) + 220);
    planet(rng.pick(['Atlas', 'Brine', 'Thule', 'Gale', 'Ostra', 'Pell', 'Rook', 'Vesper']), rr, rng.float(3e4, 9e4), rng.float(11, 18));
  }
  // Moons around some planets (never the home world).
  const planets = bodies.filter((b) => b.kind === 'planet' && b.id !== home);
  for (let k = 0; k < r.moons && k < planets.length; k++) {
    const p = rng.pick(planets);
    if (bodies.some((b) => b.kind === 'moon' && b.orbit?.parent === p.id)) continue;
    add({ name: `${p.name} I`, kind: 'moon', mass: 4e3, radius: 6, color: '#c9c9c9', orbit: { parent: p.id, r: rng.float(38, 55), w: orbitW(p.mass, 46) * 1.2, phase: rng.next() * 7 }, look: rng.next() });
  }
  if (r.targetMoon) {
    const host = bodies[target];
    target = add({ name: `${host.name} Minor`, kind: 'moon', mass: 1.2e4, radius: 8, color: '#d7c4a3', orbit: { parent: host.id, r: 52, w: orbitW(host.mass, 52) * 1.1, phase: rng.next() * 7 }, look: rng.next() });
  }
  if (r.belt) {
    const rb = (rHome + rTarget) / 2 + rng.float(-20, 20);
    const n = 22;
    const w = orbitW(M, rb);
    for (let k = 0; k < n; k++) {
      if (rng.chance(0.28)) continue;
      add({ name: 'Rock', kind: 'rock', mass: 0, radius: rng.float(5, 9), color: '#8d8478', orbit: { parent: center, r: rb + rng.float(-8, 8), w, phase: (k / n) * Math.PI * 2 + rng.float(-0.05, 0.05) }, look: rng.next() });
    }
  }
  const outer = Math.max(...bodies.map((b) => (b.orbit && b.orbit.parent === center ? b.orbit.r : 0)));
  return {
    index,
    seed: sub,
    name: `${rng.pick(NAMES_A)} ${rng.pick(NAMES_B)}`,
    bodies,
    home,
    target,
    beacons: [],
    launchMax: index <= 3 ? 150 : index <= 10 ? 140 : 130,
    fuel: index <= 4 ? 70 : index <= 12 ? 50 : 36,
    bounds: outer + 420,
    maxTime: 45,
    tip: TIPS[index],
  };
}

const cache = new Map<number, Level>();

function attempt(index: number, sub: number): Level | null {
  const cand = build(index, sub);
  const rng = new Rng(hashString(`solve|${index}|${sub}`));
  const plan = solve(cand, { budgetMs: 260, rng: () => rng.next() });
  if (!plan) return null;
  // Beacons along the solution path, so every one can be collected.
  const want = Math.min(3, Math.floor(index / 2));
  const tr = plan.traj;
  for (let k = 1; k <= want; k++) {
    const at = Math.floor((tr.count * k) / (want + 1));
    cand.beacons.push({ x: tr.points[at * 2] + rng.float(-6, 6), y: tr.points[at * 2 + 1] + rng.float(-6, 6) });
  }
  cand.solution = { wait: plan.wait, angle: plan.angle, speed: plan.speed };
  return cand;
}

function fallback(index: number): Level {
  const level = attempt(Math.max(1, Math.min(index, 3)), 99) ?? build(1, 0);
  level.index = index;
  return level;
}

/** The level for an index (1-based), solvable by construction. */
export function levelFor(index: number): Level {
  const hit = cache.get(index);
  if (hit) return hit;
  let level: Level | null = null;
  for (let sub = 0; sub < 8 && !level; sub++) level = attempt(index, sub);
  level ??= fallback(index);
  cache.set(index, level);
  return level;
}

/** The same, yielding to the browser between attempts. */
export async function levelForAsync(index: number): Promise<Level> {
  const hit = cache.get(index);
  if (hit) return hit;
  let level: Level | null = null;
  for (let sub = 0; sub < 8 && !level; sub++) {
    await new Promise((r) => setTimeout(r, 0));
    if (cache.has(index)) return cache.get(index)!;
    level = attempt(index, sub);
  }
  level ??= fallback(index);
  cache.set(index, level);
  return level;
}
