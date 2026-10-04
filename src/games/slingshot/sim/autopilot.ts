import { launch, predict, type Level, type Trajectory } from './physics';

// The autopilot searches launch plans by simulating them: when to launch,
// in which direction and how hard. It powers automatic mode and also proves
// every generated level can be solved.

export interface Plan {
  wait: number;
  angle: number;
  speed: number;
  score: number;
  traj: Trajectory;
}

function score(level: Level, tr: Trajectory, wait: number): number {
  const ok = tr.outcome.kind === 'captured' || tr.outcome.kind === 'landed';
  if (!ok) return -tr.miss - (tr.outcome.kind === 'crashed' ? 40 : 0);
  const t = 't' in tr.outcome ? tr.outcome.t : 0;
  return 1000 + tr.beacons * 300 + (tr.outcome.kind === 'captured' ? 150 : 0) - (t - wait) * 3 - wait * 2;
}

export interface SolveOptions {
  /** Start of the planning window (current sim time). */
  t0?: number;
  /** Longest wait considered. */
  maxWait?: number;
  budgetMs?: number;
  /** Prefer plans that collect every beacon. */
  wantBeacons?: boolean;
  rng?: () => number;
}

/** Search for the best launch. Returns null if nothing reaches the target. */
export function solve(level: Level, opts: SolveOptions = {}): Plan | null {
  const t0 = opts.t0 ?? 0;
  const maxWait = opts.maxWait ?? 12;
  const budget = opts.budgetMs ?? 400;
  const rnd = opts.rng ?? Math.random;
  const start = performance.now();
  const steps = Math.ceil(level.maxTime / (1 / 240));
  let best: Plan | null = null;
  const consider = (wait: number, angle: number, speed: number, coarse: boolean) => {
    const p = launch(level, t0 + wait, angle, speed);
    p.fuel = 0;
    const tr = predict(level, p, coarse ? Math.min(steps, 4200) : steps, 8);
    const s = score(level, tr, wait);
    if (!best || s > best.score) best = { wait, angle, speed, score: s, traj: tr };
    return s;
  };
  // Coarse sweep over wait, angle and speed.
  const waits = [0, 1.5, 3, 4.5, 6, 8, 10, 12].filter((w) => w <= maxWait);
  const angles = 40;
  const speeds = [0.35, 0.5, 0.62, 0.74, 0.86, 0.97];
  outer: for (const w of waits) {
    for (let a = 0; a < angles; a++) {
      for (const sp of speeds) {
        consider(w, (a / angles) * Math.PI * 2 + rnd() * 0.05, sp * level.launchMax, true);
        if (performance.now() - start > budget * 0.65) break outer;
      }
    }
    const b = best as Plan | null;
    if (b && b.score > 1000 && (!opts.wantBeacons || b.traj.beacons === level.beacons.length)) break;
  }
  // Local refinement around the best plan.
  const b0 = best as Plan | null;
  if (!b0) return null;
  let cur: Plan = b0;
  let scaleA = 0.08;
  let scaleS = 0.06 * level.launchMax;
  let scaleW = 0.6;
  while (performance.now() - start < budget) {
    const w = Math.max(0, Math.min(maxWait, cur.wait + (rnd() - 0.5) * 2 * scaleW));
    const a = cur.angle + (rnd() - 0.5) * 2 * scaleA;
    const s = Math.max(5, Math.min(level.launchMax, cur.speed + (rnd() - 0.5) * 2 * scaleS));
    const sc = consider(w, a, s, false);
    if (sc > cur.score) cur = best as unknown as Plan;
    else {
      scaleA *= 0.995;
      scaleS *= 0.995;
      scaleW *= 0.995;
    }
    if (cur.score > 1000 + level.beacons.length * 300 && cur.traj.beacons === level.beacons.length && performance.now() - start > budget * 0.8) break;
  }
  const fin = best as Plan | null;
  return fin && fin.score > 1000 ? fin : null;
}
