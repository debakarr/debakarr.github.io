// Gravity for Slingshot. Stars, planets and moons move on fixed circular
// orbits (so the system is perfectly predictable); only the probe is
// integrated. The aiming preview uses the exact same integrator, so what you
// see is what will happen.

export type BodyKind = 'star' | 'planet' | 'moon' | 'blackhole' | 'rock';

export interface Body {
  id: number;
  name: string;
  kind: BodyKind;
  mass: number;
  radius: number;
  color: string;
  /** Orbit around another body; bodies without one stay put. */
  orbit?: { parent: number; r: number; w: number; phase: number };
  x?: number;
  y?: number;
  /** Visual style seed. */
  look: number;
  rings?: boolean;
}

export interface Beacon {
  x: number;
  y: number;
}

export interface Level {
  index: number;
  seed: number;
  name: string;
  bodies: Body[];
  home: number;
  target: number;
  beacons: Beacon[];
  /** Max launch speed. */
  launchMax: number;
  /** Mid-course thrust budget (velocity change). */
  fuel: number;
  /** Bounds: the probe is lost beyond this radius. */
  bounds: number;
  /** Seconds before the probe is considered lost. */
  maxTime: number;
  /** Introduces a new idea to the player. */
  tip?: string;
  /** A known three-star launch, found when the level was generated. */
  solution?: { wait: number; angle: number; speed: number };
}

export const G = 1;
export const DT = 1 / 240;
const SOFT = 4;

/** Body positions at time t, written into xs/ys (by index). */
export function positions(level: Level, t: number, xs: Float64Array, ys: Float64Array): void {
  const b = level.bodies;
  for (let k = 0; k < b.length; k++) {
    const o = b[k].orbit;
    if (!o) {
      xs[k] = b[k].x ?? 0;
      ys[k] = b[k].y ?? 0;
    } else {
      // Parents always come before their satellites.
      const a = o.phase + o.w * t;
      xs[k] = xs[o.parent] + Math.cos(a) * o.r;
      ys[k] = ys[o.parent] + Math.sin(a) * o.r;
    }
  }
}

export function velocityOf(level: Level, k: number, t: number): [number, number] {
  const n = level.bodies.length;
  const x0 = new Float64Array(n);
  const y0 = new Float64Array(n);
  const x1 = new Float64Array(n);
  const y1 = new Float64Array(n);
  const h = 1e-3;
  positions(level, t - h, x0, y0);
  positions(level, t + h, x1, y1);
  return [(x1[k] - x0[k]) / (2 * h), (y1[k] - y0[k]) / (2 * h)];
}

/** Angular speed for a circular orbit of radius r around mass M. */
export function orbitW(M: number, r: number): number {
  return Math.sqrt((G * M) / (r * r * r));
}

export interface Probe {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  fuel: number;
}

export type Outcome =
  | { kind: 'flying' }
  | { kind: 'captured'; t: number }
  | { kind: 'landed'; t: number }
  | { kind: 'crashed'; body: number; t: number }
  | { kind: 'lost'; t: number };

/** Probe state just after launch from the home body. */
export function launch(level: Level, t: number, angle: number, speed: number): Probe {
  const n = level.bodies.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  positions(level, t, xs, ys);
  const home = level.bodies[level.home];
  const [hvx, hvy] = velocityOf(level, level.home, t);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  return {
    x: xs[level.home] + ca * (home.radius + 2),
    y: ys[level.home] + sa * (home.radius + 2),
    vx: hvx + ca * speed,
    vy: hvy + sa * speed,
    t,
    fuel: level.fuel,
  };
}

/** Capture: close to the target and slow enough relative to it to stay. */
export function captureRadius(level: Level): number {
  return level.bodies[level.target].radius * 3.2;
}

export class Sim {
  level: Level;
  xs: Float64Array;
  ys: Float64Array;
  private tvx = 0;
  private tvy = 0;

  constructor(level: Level) {
    this.level = level;
    this.xs = new Float64Array(level.bodies.length);
    this.ys = new Float64Array(level.bodies.length);
  }

  /**
   * Advance the probe one step. `thrust` is an optional acceleration from
   * the engine. Returns the outcome after the step; collected beacons are
   * reported through `onBeacon`.
   */
  step(p: Probe, thrust: [number, number] | null, collected?: boolean[]): Outcome {
    const L = this.level;
    const b = L.bodies;
    const xs = this.xs;
    const ys = this.ys;
    positions(L, p.t, xs, ys);
    let ax = 0;
    let ay = 0;
    for (let k = 0; k < b.length; k++) {
      const dx = xs[k] - p.x;
      const dy = ys[k] - p.y;
      const d2 = dx * dx + dy * dy + SOFT;
      const d = Math.sqrt(d2);
      const r = b[k].radius;
      if (d < r) {
        if (k === L.target) return { kind: 'landed', t: p.t };
        return { kind: 'crashed', body: k, t: p.t };
      }
      const f = (G * b[k].mass) / (d2 * d);
      ax += dx * f;
      ay += dy * f;
    }
    if (thrust && p.fuel > 0) {
      const tm = Math.hypot(thrust[0], thrust[1]);
      const use = tm * DT;
      if (use > 0) {
        const k = Math.min(1, p.fuel / use);
        ax += thrust[0] * k;
        ay += thrust[1] * k;
        p.fuel = Math.max(0, p.fuel - use);
      }
    }
    p.vx += ax * DT;
    p.vy += ay * DT;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    p.t += DT;
    if (collected) {
      for (let k = 0; k < L.beacons.length; k++) {
        if (!collected[k] && Math.hypot(L.beacons[k].x - p.x, L.beacons[k].y - p.y) < 20) collected[k] = true;
      }
    }
    // Capture check against the target.
    const tx = xs[L.target];
    const ty = ys[L.target];
    const d = Math.hypot(p.x - tx, p.y - ty);
    const cr = captureRadius(L);
    if (d < cr) {
      // Target velocity by finite difference (cheap: reuse last positions).
      this.targetVelocity(p.t);
      const rv = Math.hypot(p.vx - this.tvx, p.vy - this.tvy);
      const vcap = Math.sqrt((2 * G * b[L.target].mass) / Math.max(d, b[L.target].radius)) * 1.15;
      if (rv < vcap) return { kind: 'captured', t: p.t };
    }
    if (Math.hypot(p.x, p.y) > L.bounds || p.t > L.maxTime) return { kind: 'lost', t: p.t };
    return { kind: 'flying' };
  }

  private targetVelocity(t: number): void {
    const [vx, vy] = velocityOf(this.level, this.level.target, t);
    this.tvx = vx;
    this.tvy = vy;
  }
}

export interface Trajectory {
  points: Float32Array;
  count: number;
  outcome: Outcome;
  beacons: number;
  /** Closest approach to the target's capture zone (0 when captured). */
  miss: number;
}

/** Fly a launch to the end (or `maxSteps`) and report what happens. */
export function predict(level: Level, start: Probe, maxSteps = 6000, sampleEvery = 6): Trajectory {
  const sim = new Sim(level);
  const p = { ...start };
  const collected = level.beacons.map(() => false);
  const pts = new Float32Array(Math.ceil(maxSteps / sampleEvery) * 2 + 4);
  let n = 0;
  let outcome: Outcome = { kind: 'flying' };
  let miss = Infinity;
  const cr = captureRadius(level);
  for (let k = 0; k < maxSteps; k++) {
    outcome = sim.step(p, null, collected);
    if (k % sampleEvery === 0 || outcome.kind !== 'flying') {
      pts[n * 2] = p.x;
      pts[n * 2 + 1] = p.y;
      n++;
    }
    const d = Math.hypot(p.x - sim.xs[level.target], p.y - sim.ys[level.target]) - cr;
    if (d < miss) miss = d;
    if (outcome.kind !== 'flying') break;
  }
  return { points: pts, count: n, outcome, beacons: collected.filter(Boolean).length, miss: outcome.kind === 'captured' || outcome.kind === 'landed' ? 0 : Math.max(0, miss) };
}
