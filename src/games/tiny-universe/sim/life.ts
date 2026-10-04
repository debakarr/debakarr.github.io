// Life on one world, as populations rather than organisms: a tree of
// lineages that branch, go extinct and occasionally climb a stage
// (microbial → complex → land → tool users → intelligent). Photosynthesis
// fills the air with oxygen, which complex life needs. Rates are per
// million years.

import type { Rng } from '../../shared/rng';

/** mobility, intelligence, reproduction, adaptation, cooperation */
export type Traits = [number, number, number, number, number];
export const TRAIT_NAMES = ['Mobility', 'Intelligence', 'Reproduction', 'Adaptation', 'Cooperation'];

export interface Lineage {
  id: number;
  parent: number;
  name: string;
  stage: number;
  born: number;
  died: number;
  photo: boolean;
  traits: Traits;
}

export interface Biosphere {
  origin: number;
  seeded: boolean;
  oxygen: number;
  lineages: Lineage[];
  /** Highest living stage. */
  stage: number;
  /** Highest stage ever reached. */
  peak: number;
  massExtinctions: number;
  /** Time all life died, or -1. */
  dead: number;
  /** When conditions turned hostile, or -1. */
  hostileSince: number;
  next: number;
}

export const STAGE_NAME = ['Lifeless', 'Microbial life', 'Complex life', 'Life on land', 'Tool users', 'Intelligent life'];

export type LifeEvent =
  | { kind: 'oxygen' }
  | { kind: 'stage'; stage: number; lineage: Lineage }
  | { kind: 'extinct' }
  | { kind: 'extremophiles' };

const MAX_LIVING = 12;
const MAX_NODES = 44;

export function createBiosphere(t: number, seeded: boolean, rng: Rng): Biosphere {
  const b: Biosphere = { origin: t, seeded, oxygen: 0, lineages: [], stage: 1, peak: 1, massExtinctions: 0, dead: -1, hostileSince: -1, next: 1 };
  b.lineages.push({ id: 0, parent: -1, name: 'Primitive cells', stage: 1, born: t, died: -1, photo: false, traits: [rng.float(0.05, 0.2), 0.02, rng.float(0.6, 0.9), rng.float(0.3, 0.7), rng.float(0.05, 0.3)] });
  return b;
}

export function living(b: Biosphere): Lineage[] {
  return b.lineages.filter((l) => l.died < 0);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function nameFor(stage: number, photo: boolean, tr: Traits, rng: Rng): string {
  const [mob, , rep, adapt, coop] = tr;
  if (stage === 1) return photo ? rng.pick(['Photosynthetic mats', 'Light-eating cells']) : adapt > 0.7 ? 'Extremophiles' : rng.pick(['Chemotrophs', 'Spore formers', 'Colonial cells', 'Primitive cells']);
  if (stage === 2) {
    if (photo) return rng.pick(['Kelp forests', 'Floating algae', 'Reef builders']);
    if (mob > 0.6) return rng.pick(['Jawed hunters', 'Soft-bodied swimmers', 'Squid-like hunters']);
    return rng.pick(['Filter feeders', 'Shelled grazers', 'Drifting colonies', 'Burrowing worms']);
  }
  if (stage === 3) {
    if (photo) return rng.pick(['Land plants', 'Towering forests', 'Fungal mats']);
    if (mob > 0.65 && coop > 0.5) return 'Pack hunters';
    if (mob > 0.7) return rng.pick(['Flyers', 'Gliders']);
    if (rep > 0.65) return 'Herd grazers';
    return rng.pick(['Crawlers', 'Burrowers', 'Climbers', 'Giant herbivores', 'Armored beasts', 'Ambush predators']);
  }
  return 'Tool users';
}

function spawn(b: Biosphere, parent: Lineage, stage: number, t: number, rng: Rng, name?: string): Lineage {
  const tr = parent.traits.map((v) => clamp01(v + rng.float(-0.09, 0.09))) as Traits;
  let photo = parent.photo;
  if (stage > parent.stage) {
    // Climbing a stage favours brains and legs.
    tr[0] = clamp01(tr[0] + 0.12);
    tr[1] = clamp01(tr[1] + (stage >= 3 ? 0.18 : 0.06));
    if (stage >= 4) photo = false;
  } else if (stage === 1 && !b.lineages.some((l) => l.photo && l.died < 0) && rng.chance(0.55)) photo = true;
  if (stage >= 4) tr[1] = Math.max(tr[1], stage === 5 ? 0.85 : 0.6);
  const l: Lineage = { id: b.next++, parent: parent.id, name: name ?? nameFor(stage, photo, tr, rng), stage, born: t, died: -1, photo, traits: tr };
  b.lineages.push(l);
  prune(b);
  return l;
}

/** Keep the tree small: drop the oldest extinct leaves. */
function prune(b: Biosphere): void {
  while (b.lineages.length > MAX_NODES) {
    const parents = new Set(b.lineages.map((l) => l.parent));
    let victim = -1;
    for (let k = 0; k < b.lineages.length; k++) {
      const l = b.lineages[k];
      if (l.died >= 0 && !parents.has(l.id) && (victim < 0 || l.died < b.lineages[victim].died)) victim = k;
    }
    if (victim < 0) return;
    b.lineages.splice(victim, 1);
  }
}

export interface LifeContext {
  t: number;
  dt: number;
  hab: number;
  /** Surface water fraction: pure ocean worlds struggle to get onto land. */
  water: number;
  intel: number;
  rng: Rng;
  speciesName: () => string;
}

/** Advance a living biosphere. Returns what happened, for the chronicle. */
export function stepBiosphere(b: Biosphere, c: LifeContext): LifeEvent[] {
  const out: LifeEvent[] = [];
  if (b.dead >= 0) return out;
  const { t, dt, hab, rng } = c;
  const alive = living(b);
  const hostile = hab < 0.02;

  // Oxygen from photosynthesis.
  const photo = alive.some((l) => l.photo);
  const was = b.oxygen;
  b.oxygen = clamp01(b.oxygen + (photo ? dt / 1300 : -dt / 3000));
  if (was < 0.5 && b.oxygen >= 0.5) out.push({ kind: 'oxygen' });

  if (hostile && b.hostileSince < 0) b.hostileSince = t;
  if (!hostile) b.hostileSince = -1;

  // Extinctions.
  for (const l of alive) {
    // An intelligent species shares its civilization's fate instead.
    if (l.stage === 5 && !hostile) continue;
    let rate = l.stage >= 3 ? 1 / 900 : 1 / 1000;
    if (alive.length <= 2) rate *= 0.25;
    if (hostile) rate = (1 / 25) * (1 - l.traits[3] * 0.85) + (l.stage >= 3 ? 1 / 10 : 0);
    if (rng.chance(1 - Math.exp(-rate * dt))) l.died = t;
  }
  let now = living(b);
  if (!now.length) {
    b.dead = t;
    b.stage = 0;
    out.push({ kind: 'extinct' });
    return out;
  }
  if (hostile && b.hostileSince >= 0 && t - b.hostileSince > 60) out.push({ kind: 'extremophiles' });
  if (hostile) {
    b.stage = Math.max(...now.map((l) => l.stage));
    return out;
  }

  // Branching within a stage.
  if (now.length < MAX_LIVING) {
    for (const l of now) {
      const rate = (1 / 320) * (0.6 + l.traits[3]) * (0.5 + hab);
      if (rng.chance(1 - Math.exp(-rate * dt))) spawn(b, l, l.stage, t, rng);
    }
  }

  // Climbing to the next stage.
  now = living(b);
  const top = Math.max(...now.map((l) => l.stage));
  const climbers = now.filter((l) => l.stage === top && (top < 3 || !l.photo));
  let rate = 0;
  if (top === 1 && b.oxygen >= 0.35) rate = (1 / 1100) * hab;
  else if (top === 2) rate = c.water < 0.95 ? (1 / 450) * hab : 0;
  else if (top === 3) rate = (1 / 650) * Math.sqrt(hab) * c.intel;
  else if (top === 4) rate = (1 / 180) * c.intel;
  // Ocean worlds can still raise clever swimmers, slowly.
  let target = top + 1;
  if (top === 2 && c.water >= 0.95) {
    rate = (1 / 2600) * hab * c.intel;
    target = 4;
  }
  if (rate > 0 && climbers.length && top < 5 && rng.chance(1 - Math.exp(-rate * dt))) {
    const parent = rng.pick(climbers);
    const l = spawn(b, parent, target, t, rng, target === 5 ? c.speciesName() : undefined);
    out.push({ kind: 'stage', stage: target, lineage: l });
  }

  now = living(b);
  b.stage = Math.max(...now.map((l) => l.stage));
  b.peak = Math.max(b.peak, b.stage);
  return out;
}

/** Kill a share of living lineages; the most complex suffer most. Returns the share killed. */
export function massExtinction(b: Biosphere, t: number, severity: number, rng: Rng): number {
  if (b.dead >= 0) return 0;
  const alive = living(b);
  let killed = 0;
  for (const l of alive) {
    const p = Math.min(1, severity * (0.55 + l.stage * 0.12) * (1 - l.traits[3] * 0.3));
    if (rng.chance(p)) {
      l.died = t;
      killed++;
    }
  }
  b.massExtinctions++;
  const now = living(b);
  if (!now.length) {
    b.dead = t;
    b.stage = 0;
  } else b.stage = Math.max(...now.map((l) => l.stage));
  return alive.length ? killed / alive.length : 0;
}
