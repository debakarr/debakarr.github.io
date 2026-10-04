// Tiny Universe: the simulation. One galaxy, simulated statistically: a gas
// disc on a grid where stars form, stars that age and die (massive ones as
// supernovae that seed the gas with heavy elements), planets generated per
// star, life on the habitable ones, and the civilizations that life becomes.
// Time is in millions of years (Myr). DOM-free, so it runs in Node too.

import { Noise2D } from '../../shared/noise';
import { hashString, Rng } from '../../shared/rng';
import { advanceCiv, alive, artifactFor, civLog, ERA_INDEX, eraName, newCiv, updatePopulation, type Civ, type CivEvent } from './civ';
import { ACHIEVEMENTS, COSMIC_ERAS, DISCOVERY } from './discoveries';
import { createBiosphere, living, massExtinction, stepBiosphere, type Biosphere } from './life';
import { speciesName, starName } from './names';
import type { Params } from './params';
import { generatePlanets, habitability, kindOf, nameSystem, PLANET_STRIDE, temperature, type Planet } from './planets';
import { lifetime, luminosity, luminosityIn, Phase, phaseAt, remnantOf, sampleMass, tempIn } from './stars';

export const SAVE_VERSION = 1;
/** Galaxy disc radius, in galaxy units. */
export const RADIUS = 1000;
export const GRID = 96;
export const SPAN = 2400;
export const CELL = SPAN / GRID;
export const CAP = 2400;
const STEP = 2;
const SF_START = 120;
const GAS_TOTAL = [1500, 3000, 5000];
const SF_K = 4.5e-4;
const SF_THRESHOLD = 0.12;
const HASH = 60;

export interface Ruin {
  civ: string;
  era: number;
  eraName: string;
  t: number;
  artifact: string;
  studied: boolean;
}

export interface PlanetState {
  life?: Biosphere;
  civ?: number;
  shift?: number;
  gone?: boolean;
  ruins?: Ruin[];
  log?: [number, string][];
}

export interface HistEntry {
  t: number;
  text: string;
  kind: 'first' | 'civ' | 'star' | 'life' | 'you' | 'mystery';
  star?: number;
  planet?: number;
  civ?: number;
}

export interface Stats {
  starsFormed: number;
  supernovae: number;
  planets: number;
  lifeWorlds: number;
  civsBorn: number;
  civsFell: number;
  silent: number;
  darkAges: number;
  colonies: number;
  contacts: number;
  dysons: number;
}

export interface Profile {
  create: number;
  destroy: number;
  observe: number;
  interventions: number;
  lastAct: number;
  observedTo: number;
}

export interface UState {
  version: number;
  seed: string;
  preset: string;
  params: Params;
  goal: string | null;
  t: number;
  rng: number;
  gas: Float32Array;
  metal: Float32Array;
  n: number;
  sx: Float32Array;
  sy: Float32Array;
  sm: Float32Array;
  sz: Float32Array;
  sborn: Float32Array;
  slife: Float32Array;
  sdeath: Float32Array;
  sphase: Uint8Array;
  ps: Record<string, PlanetState>;
  civs: Civ[];
  history: HistEntry[];
  found: Record<string, number>;
  ach: Record<string, number>;
  stats: Stats;
  prof: Profile;
  clues: number;
  nextCiv: number;
  pairs: string[];
}

export type Fx = 'supernova' | 'grb' | 'matter' | 'impact' | 'seed' | 'spark' | 'shield';

export type UEvent =
  | { type: 'discovery'; id: string; star?: number; planet?: number; civ?: number }
  | { type: 'chronicle'; text: string; important: boolean; star?: number; planet?: number; civ?: number }
  | { type: 'civ'; civ: number; what: 'born' | 'fell' | 'silent' | 'era' }
  | { type: 'fx'; fx: Fx; x: number; y: number; angle?: number; star?: number };

export type Intervention = 'matter' | 'seed' | 'warm' | 'cool' | 'knowledge' | 'asteroid' | 'nova' | 'protect' | 'study';

export interface Target {
  x?: number;
  y?: number;
  star?: number;
  planet?: number;
  civ?: number;
}

const LORE = [
  'Their last records describe a sky full of lights that went out one by one.',
  'They had found ruins older than their own, and feared whatever made them.',
  'A warning, carved and broadcast and stored in every format they had: do not build around your star. Something is listening.',
  'The same warning, in a different alphabet, from a different species, millions of years apart.',
  'Star maps marking every civilization that ever wrapped its sun in light. Each mark is crossed out.',
];

export class Universe {
  s: UState;
  /** Planets per star slot (regenerated from the seed, never saved). */
  planets: Planet[][] = [];
  names: string[] = [];
  /** Habitability now, for planets that might hold life. */
  hab = new Map<number, number>();
  cands = new Set<number>();
  /** Recent star births per gas cell (for drawing star-forming regions). */
  sfr = new Float32Array(GRID * GRID);
  /** Per star: highest life stage on any of its planets (0 none). */
  lifeAt = new Uint8Array(CAP);
  /** Per star: civilization id + 1 living there (0 none). */
  civAt = new Int16Array(CAP);
  living = 0;
  /** Events that stop `advance` early so the UI can react. */
  stopOn: { civ: boolean; discovery: (id: string) => boolean } = { civ: false, discovery: () => false };
  halted = false;
  /** Bumped whenever something visible changes outside the regular step. */
  rev = 0;
  rng: Rng;
  private profile: Float32Array;
  private hash = new Map<number, number[]>();
  private listeners: ((e: UEvent) => void)[] = [];
  private recycleAt = 0;
  private tmp = new Float32Array(GRID * GRID);

  static create(seed: string, params: Params, preset = 'standard', goal: string | null = null): Universe {
    const profile = buildProfile(seed, params);
    let sum = 0;
    for (const v of profile) sum += v;
    const gas = new Float32Array(GRID * GRID);
    const total = GAS_TOTAL[params.matter];
    for (let i = 0; i < gas.length; i++) gas[i] = (profile[i] / sum) * total;
    const metal = new Float32Array(GRID * GRID);
    // Contact: the cluster is already rich in heavy elements, so its stars get rocky worlds first.
    const cl = clusterOf(seed, params);
    if (cl) {
      for (let i = 0; i < metal.length; i++) {
        const x = ((i % GRID) + 0.5) * CELL - SPAN / 2;
        const y = (Math.floor(i / GRID) + 0.5) * CELL - SPAN / 2;
        metal[i] = 0.9 * Math.exp(-(Math.pow(x - cl.x, 2) + Math.pow(y - cl.y, 2)) / (2 * 120 * 120));
      }
    }
    const f32 = () => new Float32Array(CAP);
    const s: UState = {
      version: SAVE_VERSION,
      seed,
      preset,
      params,
      goal,
      t: 0,
      rng: hashString(`${seed}:sim`),
      gas,
      metal,
      n: 0,
      sx: f32(),
      sy: f32(),
      sm: f32(),
      sz: f32(),
      sborn: f32(),
      slife: f32(),
      sdeath: f32(),
      sphase: new Uint8Array(CAP),
      ps: {},
      civs: [],
      history: [],
      found: {},
      ach: {},
      stats: { starsFormed: 0, supernovae: 0, planets: 0, lifeWorlds: 0, civsBorn: 0, civsFell: 0, silent: 0, darkAges: 0, colonies: 0, contacts: 0, dysons: 0 },
      prof: { create: 0, destroy: 0, observe: 0, interventions: 0, lastAct: -1, observedTo: 0 },
      clues: 0,
      nextCiv: 1,
      pairs: [],
    };
    const u = new Universe(s);
    u.history('The universe began.', 'mystery');
    return u;
  }

  constructor(state: UState) {
    this.s = state;
    this.rng = new Rng(state.rng);
    this.profile = buildProfile(state.seed, state.params);
    for (let i = 0; i < state.n; i++) {
      if (state.sm[i] <= 0) continue;
      this.makeSystem(i);
      this.hashAdd(i);
    }
    for (let i = 0; i < state.n; i++) if (state.sm[i] > 0) this.refreshStar(i);
    for (const key of Object.keys(state.ps)) {
      const id = +key;
      if (state.ps[key].life || state.ps[key].civ) {
        this.cands.add(id);
        this.hab.set(id, this.habNow(id));
      }
    }
    this.markStars();
  }

  on(fn: (e: UEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  private emit(e: UEvent): void {
    if (e.type === 'civ' && e.what === 'born' && this.stopOn.civ) this.halted = true;
    if (e.type === 'discovery' && this.stopOn.discovery(e.id)) this.halted = true;
    for (const fn of this.listeners) fn(e);
  }

  // --- Time ---------------------------------------------------------------------------

  get t(): number {
    return this.s.t;
  }

  /** Run `dt` Myr in steps. Stops early (returning the time used) when halted. */
  advance(dt: number): number {
    this.halted = false;
    let used = 0;
    while (used < dt - 1e-12) {
      const h = Math.min(STEP, dt - used);
      this.step(h);
      used += h;
      if (this.halted) break;
    }
    this.s.rng = this.rng.s;
    return used;
  }

  private step(dt: number): void {
    const s = this.s;
    s.t += dt;
    this.gasStep(dt);
    if (s.t > SF_START) this.formStars(dt);
    this.starStep();
    this.lifeStep(dt);
    this.civStep();
    if (s.t - s.prof.observedTo >= 250) {
      if (s.prof.lastAct < s.prof.observedTo) s.prof.observe++;
      s.prof.observedTo = s.t;
    }
    this.markStars();
    this.checkAchievements();
  }

  // --- Gas ------------------------------------------------------------------------------

  private gasStep(dt: number): void {
    const s = this.s;
    const { gas, metal } = s;
    const p = s.params;
    const loss = Math.exp((-[0.03, 0.07, 0.15][p.expansion] * dt) / 1000);
    const infall = ((([0.45, 0.22, 0.08][p.expansion] * GAS_TOTAL[p.matter]) / 5000) * Math.exp(-s.t / 5000) * dt) / this.profileSum();
    for (let i = 0; i < gas.length; i++) gas[i] = gas[i] * loss + this.profile[i] * infall;
    blur(gas, this.tmp, Math.min(0.15, 0.004 * dt));
    blur(metal, this.tmp, Math.min(0.25, 0.012 * dt));
    const decay = Math.exp(-dt / 60);
    for (let i = 0; i < this.sfr.length; i++) this.sfr[i] *= decay;
  }

  private psum = 0;
  private profileSum(): number {
    if (!this.psum) for (const v of this.profile) this.psum += v;
    return this.psum;
  }

  private formStars(dt: number): void {
    const s = this.s;
    const { gas, metal } = s;
    const g = s.params.gravity;
    const k = SF_K * [0.65, 1, 1.45][g];
    const thr = SF_THRESHOLD * [1.3, 1, 0.75][g];
    for (let i = 0; i < gas.length; i++) {
      const v = gas[i];
      if (v <= thr) continue;
      const expected = k * Math.pow(v - thr, 1.4) * dt;
      let births = Math.floor(expected);
      if (this.rng.next() < expected - births) births++;
      for (let b = 0; b < births && gas[i] > thr; b++) {
        const cx = (i % GRID) * CELL - SPAN / 2 + this.rng.next() * CELL;
        const cy = Math.floor(i / GRID) * CELL - SPAN / 2 + this.rng.next() * CELL;
        if (this.birth(cx, cy, Math.max(0, metal[i] * this.rng.float(0.8, 1.2))) < 0) return;
        gas[i] = Math.max(0, gas[i] - 1);
        this.sfr[i] += 1;
      }
    }
  }

  private cellOf(x: number, y: number): number {
    const gx = Math.min(GRID - 1, Math.max(0, Math.floor((x + SPAN / 2) / CELL)));
    const gy = Math.min(GRID - 1, Math.max(0, Math.floor((y + SPAN / 2) / CELL)));
    return gy * GRID + gx;
  }

  /** Put gas (and its metals) back around a point. */
  private returnGas(x: number, y: number, amount: number, z: number): void {
    const { gas, metal } = this.s;
    const c = this.cellOf(x, y);
    const cx = c % GRID;
    const cy = Math.floor(c / GRID);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue;
        const i = gy * GRID + gx;
        const share = amount * (dx === 0 && dy === 0 ? 0.36 : 0.08);
        const total = gas[i] + share;
        metal[i] = total > 0 ? (metal[i] * gas[i] + z * share) / total : metal[i];
        gas[i] = total;
      }
    }
  }

  // --- Stars ----------------------------------------------------------------------------

  private birth(x: number, y: number, z: number): number {
    const s = this.s;
    const i = s.n < CAP ? s.n++ : this.recycleSlot();
    if (i < 0) return -1;
    const m = sampleMass(this.rng, s.params.chaos);
    s.sx[i] = x;
    s.sy[i] = y;
    s.sm[i] = m;
    s.sz[i] = z;
    s.sborn[i] = s.t;
    s.slife[i] = lifetime(m, s.params.gravity);
    s.sdeath[i] = -1;
    s.sphase[i] = Phase.Proto;
    s.stats.starsFormed++;
    this.makeSystem(i);
    this.hashAdd(i);
    return i;
  }

  /** Reuse the slot of a long-dead star nobody cares about. */
  private recycleSlot(): number {
    const s = this.s;
    for (let k = 0; k < 200; k++) {
      const i = (this.recycleAt = (this.recycleAt + 1) % CAP);
      const ph = s.sphase[i];
      if (ph < Phase.WhiteDwarf) continue;
      if (s.t - (s.sborn[i] + s.slife[i]) < 3000 || this.civAt[i]) continue;
      if (this.planets[i]?.some((p) => this.storied(p.id))) continue;
      this.hashRemove(i);
      for (const p of this.planets[i] ?? []) {
        this.cands.delete(p.id);
        this.hab.delete(p.id);
        delete s.ps[p.id];
      }
      return i;
    }
    return -1;
  }

  /** Has anything happened on this world worth remembering? */
  private storied(pid: number): boolean {
    const st = this.s.ps[pid];
    return !!st && !!(st.life || st.ruins || st.civ || st.log?.length);
  }

  private makeSystem(i: number): void {
    const s = this.s;
    const planets = generatePlanets(s.seed, i, s.sborn[i], s.sm[i], s.sz[i], luminosity(s.sm[i]), s.params.gravity);
    const name = starName(new Rng(hashString(`${s.seed}:name:${i}:${s.sborn[i].toFixed(3)}`)));
    nameSystem(planets, name);
    this.planets[i] = planets;
    this.names[i] = name;
  }

  phaseOf(i: number): Phase {
    const s = this.s;
    const age = s.t - s.sborn[i];
    if (s.sdeath[i] >= 0 && s.t >= s.sdeath[i]) return s.sm[i] < 8 ? Phase.Neutron : remnantOf(s.sm[i]);
    return phaseAt(s.sm[i], age, s.slife[i]);
  }

  starLum(i: number): number {
    return luminosityIn(this.s.sm[i], this.s.sphase[i] as Phase);
  }

  starTemp(i: number): number {
    return tempIn(this.s.sm[i], this.s.sphase[i] as Phase);
  }

  private starStep(): void {
    const s = this.s;
    let livingCount = 0;
    for (let i = 0; i < s.n; i++) {
      if (s.sm[i] <= 0) continue;
      const old = s.sphase[i] as Phase;
      if (old <= Phase.Giant) livingCount++;
      if (old >= Phase.WhiteDwarf) continue;
      const ph = this.phaseOf(i);
      if (ph === old) continue;
      s.sphase[i] = ph;
      this.transition(i, old, ph);
    }
    this.living = livingCount;
  }

  private transition(i: number, from: Phase, to: Phase): void {
    const s = this.s;
    const m = s.sm[i];
    if (to === Phase.Main) {
      this.discover('first-star', { star: i });
      if (m < 0.45) this.discover('red-dwarf', { star: i });
      else if (m > 0.85 && m < 1.15) this.discover('sun-like', { star: i });
      else if (m >= 15) this.discover('blue-giant', { star: i });
    }
    if (from === Phase.Proto && to >= Phase.Main) this.systemFormed(i);
    if (to === Phase.Giant) {
      this.discover('red-giant', { star: i });
      this.engulf(i);
    }
    if (to >= Phase.WhiteDwarf) {
      const forced = s.sdeath[i] >= 0;
      if (to === Phase.WhiteDwarf && !forced) {
        this.returnGas(s.sx[i], s.sy[i], 0.35, 1.6);
        this.discover('white-dwarf', { star: i });
      } else this.supernova(i);
      if (to === Phase.Neutron) this.discover('neutron-star', { star: i });
      if (to === Phase.BlackHole) this.discover('black-hole', { star: i });
    }
    this.refreshStar(i);
    this.homeCheck(i);
  }

  private systemFormed(i: number): void {
    const s = this.s;
    const planets = this.planets[i];
    if (!planets.length) return;
    s.stats.planets += planets.length;
    this.discover('first-planets', { star: i });
    let good = 0;
    for (const p of planets) {
      const temp = this.planetTemp(p);
      const kind = kindOf(p, temp);
      if (p.body === 'gas') this.discover('gas-giant', { planet: p.id });
      if (p.body === 'rocky') this.discover('rocky-world', { planet: p.id });
      if (p.body === 'rocky' && p.mass > 3) this.discover('super-earth', { planet: p.id });
      if (kind === 'ocean') this.discover('ocean-world', { planet: p.id });
      if (kind === 'lava') this.discover('lava-world', { planet: p.id });
      if (kind === 'ice') this.discover('ice-world', { planet: p.id });
      const h = this.habNow(p.id);
      if (h > 0.6) this.discover('goldilocks', { planet: p.id });
      if (h > 0.45) good++;
    }
    if (good >= 2) this.discover('twin-earths', { star: i });
  }

  /** A swelling star swallows its innermost worlds. */
  private engulf(i: number): void {
    const reach = 0.6 * Math.pow(this.s.sm[i], 0.6);
    for (const p of this.planets[i]) {
      if (p.a >= reach) continue;
      const st = this.ps(p.id);
      st.gone = true;
      if (st.life && st.life.dead < 0) {
        st.life.dead = this.s.t;
        this.planetLog(p.id, 'Swallowed by its swelling star. All life on it ended.');
      }
    }
  }

  private supernova(i: number): void {
    const s = this.s;
    const x = s.sx[i];
    const y = s.sy[i];
    const m = s.sm[i];
    s.stats.supernovae++;
    this.discover('supernova', { star: i });
    this.returnGas(x, y, Math.min(4, 0.8 + m * 0.05), 8);
    this.emit({ type: 'fx', fx: 'supernova', x, y, star: i });
    // The star's own worlds are scorched clean.
    for (const p of this.planets[i]) {
      if (p.a >= 3 && !this.s.ps[p.id]) continue;
      const st = this.ps(p.id);
      if (p.a < 3) st.gone = true;
      if (st.life && st.life.dead < 0) {
        massExtinction(st.life, s.t, 1, this.rng);
        if (st.life.dead >= 0) this.planetLog(p.id, 'Its star exploded. Nothing survived.');
      }
      if (st.civ) this.civDisaster(st.civ, p.id, 1, 'the explosion of their star');
    }
    this.blast(x, y, 90, i, 'a nearby supernova');
    const rem = this.phaseOf(i);
    if (rem === Phase.BlackHole && m >= 30 && this.rng.chance(0.35)) {
      const angle = this.rng.float(0, Math.PI);
      this.emit({ type: 'fx', fx: 'grb', x, y, angle, star: i });
      this.discover('grb', { star: i });
      this.beam(x, y, angle);
    }
    this.history(`The ${this.names[i]} star exploded as a supernova.`, 'star', { star: i }, false);
  }

  /** Radiation from an explosion: mass extinctions nearby, weaker with distance. */
  private blast(x: number, y: number, radius: number, source: number, cause: string): void {
    const s = this.s;
    for (const pid of this.cands) {
      const j = Math.floor(pid / PLANET_STRIDE);
      if (j === source) continue;
      const d = Math.hypot(s.sx[j] - x, s.sy[j] - y);
      if (d >= radius) continue;
      const severity = 1 - d / radius;
      const st = s.ps[pid];
      if (st?.life && st.life.dead < 0) {
        const share = massExtinction(st.life, s.t, 0.15 + severity * 0.9, this.rng);
        if (st.life.dead >= 0) this.planetLog(pid, `Sterilized by ${cause}.`);
        else {
          this.planetLog(pid, `${cause.charAt(0).toUpperCase()}${cause.slice(1)} killed ${Math.round(share * 100)}% of species.`);
          if (severity > 0.25) this.discover('survivor', { planet: pid });
          if (share >= 0.5) this.discover('mass-extinction', { planet: pid });
        }
      }
      if (st?.civ) this.civDisaster(st.civ, pid, severity * 0.8, cause);
    }
  }

  /** A gamma-ray burst sterilizes a narrow line across the galaxy. */
  private beam(x: number, y: number, angle: number): void {
    const s = this.s;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    for (const pid of this.cands) {
      const j = Math.floor(pid / PLANET_STRIDE);
      const dx = s.sx[j] - x;
      const dy = s.sy[j] - y;
      const along = Math.abs(dx * ux + dy * uy);
      const across = Math.abs(dx * uy - dy * ux);
      if (along > 900 || across > 28) continue;
      const st = s.ps[pid];
      if (st?.life && st.life.dead < 0) {
        massExtinction(st.life, s.t, 1.2, this.rng);
        this.planetLog(pid, 'A gamma-ray burst swept across this world.');
      }
      if (st?.civ) this.civDisaster(st.civ, pid, 0.9, 'a gamma-ray burst');
    }
  }

  // --- Planets --------------------------------------------------------------------------

  planet(id: number): Planet | undefined {
    return this.planets[Math.floor(id / PLANET_STRIDE)]?.[id % PLANET_STRIDE];
  }

  ps(id: number): PlanetState {
    return (this.s.ps[id] ??= {});
  }

  planetTemp(p: Planet): number {
    return temperature(p, this.starLum(p.star), this.s.ps[p.id]?.shift ?? 0);
  }

  habNow(id: number): number {
    const p = this.planet(id);
    if (!p) return 0;
    if (this.s.ps[id]?.gone) return 0;
    const ph = this.s.sphase[p.star];
    if (ph === Phase.Proto || ph >= Phase.Neutron) return 0;
    return habitability(p, this.planetTemp(p), this.s.sm[p.star]);
  }

  /** Recompute habitability for a star's planets and update the candidate set. */
  refreshStar(i: number): void {
    const s = this.s;
    for (const p of this.planets[i] ?? []) {
      if (p.body === 'gas') continue;
      const h = this.habNow(p.id);
      const st = s.ps[p.id];
      if (h > 0.01 || (st?.life && st.life.dead < 0) || st?.civ) {
        this.cands.add(p.id);
        this.hab.set(p.id, h);
      } else {
        this.cands.delete(p.id);
        this.hab.delete(p.id);
      }
    }
  }

  planetLog(id: number, text: string): void {
    const st = this.ps(id);
    (st.log ??= []).push([this.s.t, text]);
    if (st.log.length > 30) st.log.splice(0, st.log.length - 30);
  }

  // --- Life -----------------------------------------------------------------------------

  private lifeStep(dt: number): void {
    const s = this.s;
    for (const pid of this.cands) {
      const p = this.planet(pid)!;
      const hab = this.hab.get(pid) ?? 0;
      const st = s.ps[pid];
      const b = st?.life;
      if (!b || b.dead >= 0) {
        if (hab < 0.03 || st?.gone) continue;
        if (s.t - s.sborn[p.star] < 350) continue;
        const chem = Math.min(1, s.sz[p.star] * 3 + 0.1);
        const rate = (1 / 650) * hab * hab * s.params.life * chem;
        if (this.rng.chance(1 - Math.exp(-rate * dt))) this.startLife(pid, false);
        continue;
      }
      const events = stepBiosphere(b, {
        t: s.t,
        dt,
        hab,
        water: p.water,
        intel: s.params.intel,
        rng: this.rng,
        speciesName: () => speciesName(this.names[p.star]),
      });
      // Occasional impacts reshuffle a biosphere.
      if (b.dead < 0 && this.rng.chance(1 - Math.exp(-dt / 700))) {
        const share = massExtinction(b, s.t, this.rng.float(0.2, 0.75), this.rng);
        if (share >= 0.5) {
          this.planetLog(pid, `An asteroid impact wiped out ${Math.round(share * 100)}% of species.`);
          this.discover('mass-extinction', { planet: pid });
        }
        if (b.dead >= 0) events.push({ kind: 'extinct' });
      }
      for (const e of events) this.lifeEvent(pid, b, e);
    }
  }

  private startLife(pid: number, seeded: boolean): void {
    const s = this.s;
    const st = this.ps(pid);
    const again = !!st.life;
    st.life = createBiosphere(s.t, seeded, this.rng);
    s.stats.lifeWorlds++;
    this.cands.add(pid);
    this.hab.set(pid, this.habNow(pid));
    this.planetLog(pid, seeded ? 'You seeded it with microbes.' : again ? 'Life began again, from nothing.' : 'First life: self-copying molecules in a warm sea.');
    this.discover('first-life', { planet: pid });
    if (again) this.discover('second-genesis', { planet: pid });
  }

  private lifeEvent(pid: number, b: Biosphere, e: ReturnType<typeof stepBiosphere>[number]): void {
    const p = this.planet(pid)!;
    switch (e.kind) {
      case 'oxygen':
        this.planetLog(pid, 'The Great Oxygenation: its air filled with oxygen.');
        this.discover('oxygen', { planet: pid });
        break;
      case 'extremophiles':
        this.discover('extremophiles', { planet: pid });
        break;
      case 'extinct': {
        this.planetLog(pid, 'The last living thing died. The world is barren again.');
        const st = this.s.ps[pid];
        if (st?.civ) {
          const c = this.civ(st.civ);
          if (c && c.planet === pid) this.endCiv(c, `The ${c.species} died with the rest of life on ${p.name}.`);
        }
        break;
      }
      case 'stage': {
        const names = ['', '', 'Complex life appeared', 'Life crawled onto land', 'Tool users appeared', ''];
        if (e.stage < 5) this.planetLog(pid, `${names[e.stage]}: ${e.lineage.name.toLowerCase()}.`);
        if (e.stage === 2) this.discover('complex-life', { planet: pid });
        if (e.stage === 3) this.discover('land-life', { planet: pid });
        if (e.stage === 4) this.discover('tool-users', { planet: pid });
        if (e.stage === 5) this.birthCiv(pid, b, e.lineage.id, e.lineage.name, e.lineage.traits[4]);
        break;
      }
    }
  }

  // --- Civilizations ------------------------------------------------------------------------

  civ(id: number): Civ | undefined {
    return this.s.civs.find((c) => c.id === id);
  }

  aliveCivs(): Civ[] {
    return this.s.civs.filter(alive);
  }

  private birthCiv(pid: number, _b: Biosphere, lineage: number, species: string, coop: number): void {
    const s = this.s;
    const st = this.ps(pid);
    if (st.civ) return;
    const p = this.planet(pid)!;
    const c = newCiv(s.nextCiv++, species, pid, p.star, lineage, s.t, coop, this.rng);
    s.civs.push(c);
    st.civ = c.id;
    s.stats.civsBorn++;
    this.planetLog(pid, `Intelligence: the ${species}.`);
    civLog(c, s.t, `The ${species} became self-aware on ${p.name}.`);
    this.discover('intelligence', { planet: pid, civ: c.id });
    this.history(`Intelligent life on ${p.name}: the ${species}.`, 'civ', { planet: pid, civ: c.id }, false);
    if (this.aliveCivs().length >= 2) this.discover('two-civs', { civ: c.id });
    this.emit({ type: 'civ', civ: c.id, what: 'born' });
    this.rev++;
  }

  private civStep(): void {
    const s = this.s;
    const civs = this.aliveCivs();
    for (const c of civs) {
      // Advance in chunks so colonies, contact and the Silence keep up with
      // eras even when a whole civilization fits inside one step.
      while (alive(c) && c.at < s.t - 1e-9) {
        const t0 = c.at;
        const t1 = Math.min(s.t, t0 + 0.02);
        const years = (t1 - t0) * 1e6;
        c.at = t1;
        const era0 = c.era;
        const ev: CivEvent[] = [];
        advanceCiv(c, years, t0, s.params.filter, this.rng, ev);
        for (const e of ev) this.civEvent(c, e);
        if (!alive(c)) break;
        this.silenceCheck(c, era0 === c.era ? years : Math.min(years, c.eraYears), t1);
        if (!alive(c)) break;
        if (c.status === 'quiet') this.quietCheck(c, years, t1);
        if (!alive(c)) break;
        this.colonize(c, years);
        updatePopulation(c, years);
        if (t1 - c.born >= 1) this.discover('ancient-civ', { civ: c.id });
        if (civs.length >= 2 && c.era >= ERA_INDEX.computing) this.contacts(civs);
      }
    }
  }

  /** Quiet civilizations last a long time, but not forever. */
  private quietCheck(c: Civ, years: number, t: number): void {
    if (!this.rng.chance(1 - Math.exp(-years / 2.5e8))) return;
    this.endCiv(c, `The ${c.name} faded away after ${((t - c.born) / 1).toFixed(0)} million quiet years.`);
  }

  private civEvent(c: Civ, e: CivEvent): void {
    const s = this.s;
    civLog(c, e.t, e.text);
    const ref = { civ: c.id, planet: c.planet };
    switch (e.kind) {
      case 'era': {
        const i = c.eras.indexOf(e.era);
        if (i === ERA_INDEX.agriculture) this.discover('civilization', ref);
        if (i === ERA_INDEX.industry) this.discover('industry', ref);
        if (i === ERA_INDEX.spaceflight) {
          this.discover('spaceflight', ref);
          this.history(`The ${c.species} reached space.`, 'civ', ref, true);
        }
        if (i === ERA_INDEX.interstellar) {
          c.reach = Math.max(c.reach, 70);
          this.discover('interstellar', ref);
          this.history(`The ${c.name} launched its first starship.`, 'civ', ref, true);
        }
        if (i === ERA_INDEX.dyson) {
          s.stats.dysons++;
          this.discover('dyson', ref);
          this.history(`The ${c.name} began a Dyson swarm around ${this.names[c.star]}.`, 'civ', ref, true);
        }
        if (i === ERA_INDEX.galactic) {
          c.status = 'ascended';
          this.discover('galactic', ref);
          this.history(`The ${c.name} became a galactic civilization.`, 'civ', ref, true);
        }
        this.emit({ type: 'civ', civ: c.id, what: 'era' });
        break;
      }
      case 'dark':
        s.stats.darkAges++;
        this.discover('collapse', ref);
        this.history(e.text, 'civ', ref, false);
        break;
      case 'renaissance':
        this.discover('renaissance', ref);
        break;
      case 'averted':
        this.emit({ type: 'chronicle', text: e.text, important: true, ...ref });
        this.notice(c, 0);
        break;
      case 'extinct':
        this.endCiv(c, e.text, true);
        break;
      case 'quiet':
        this.history(e.text, 'civ', ref, false);
        break;
      case 'golden':
        break;
    }
  }

  /** A civilization ends; its worlds keep ruins. */
  endCiv(c: Civ, text: string, already = false): void {
    const s = this.s;
    if (!already) {
      if (!alive(c)) return;
      c.ended = s.t;
      c.status = 'extinct';
      civLog(c, s.t, text);
    }
    s.stats.civsFell++;
    for (const pid of [c.planet, ...c.colonies]) {
      const st = this.ps(pid);
      if (st.civ === c.id) st.civ = undefined;
      (st.ruins ??= []).push({ civ: c.name, era: c.peak, eraName: c.eras[c.peak], t: s.t, artifact: artifactFor(c.peak), studied: false });
      this.planetLog(pid, `Ruins of the ${c.name}.`);
    }
    this.loseSpecies(c);
    this.discover('collapse', { civ: c.id, planet: c.planet });
    this.history(text, 'civ', { civ: c.id, planet: c.planet }, true);
    this.emit({ type: 'civ', civ: c.id, what: 'fell' });
    this.rev++;
  }

  /** The species and its tool-using cousins die with their civilization. */
  private loseSpecies(c: Civ): void {
    const b = this.s.ps[c.planet]?.life;
    if (!b) return;
    for (const l of b.lineages) if (l.died < 0 && l.stage >= 4) l.died = this.s.t;
    const now = living(b);
    if (now.length) b.stage = Math.max(...now.map((l) => l.stage));
  }

  /** Disasters that hit a world: impacts, supernovae, gamma-ray bursts. */
  private civDisaster(id: number, pid: number, severity: number, cause: string): void {
    const c = this.civ(id);
    if (!c || !alive(c)) return;
    if (c.planet !== pid) {
      // A colony is lost.
      if (this.rng.chance(severity)) {
        c.colonies = c.colonies.filter((x) => x !== pid);
        this.ps(pid).civ = undefined;
        this.syncStars(c);
        civLog(c, this.s.t, `Lost the colony on ${this.planet(pid)?.name} to ${cause}.`);
      }
      return;
    }
    if (!this.rng.chance(severity)) return;
    if (c.protectedUntil >= this.s.t) {
      c.protectedUntil = -1;
      civLog(c, this.s.t, `${cause.charAt(0).toUpperCase()}${cause.slice(1)} should have ended the ${c.species}. Something shielded them.`);
      this.notice(c, 0.3);
      return;
    }
    if (c.colonies.length) this.relocate(c, `${cause.charAt(0).toUpperCase()}${cause.slice(1)} destroyed the ${c.species} homeworld; the survivors carried on from their colonies.`);
    else this.endCiv(c, `The ${c.name} was destroyed by ${cause}.`);
  }

  /** Move the capital to the best colony. */
  private relocate(c: Civ, text: string): void {
    const best = [...c.colonies].sort((a, b) => this.habNow(b) - this.habNow(a))[0];
    this.ps(c.planet).civ = undefined;
    (this.ps(c.planet).ruins ??= []).push({ civ: c.name, era: c.peak, eraName: c.eras[c.peak], t: this.s.t, artifact: artifactFor(c.peak), studied: false });
    c.colonies = c.colonies.filter((x) => x !== best);
    c.planet = best;
    c.star = this.planet(best)!.star;
    this.syncStars(c);
    civLog(c, this.s.t, text);
    this.history(text, 'civ', { civ: c.id, planet: best }, false);
  }

  /** A home star turning giant or dying forces a move, or ends a civilization. */
  private homeCheck(i: number): void {
    for (const c of this.aliveCivs()) {
      if (c.star !== i) continue;
      if (this.habNow(c.planet) > 0.01 && !this.s.ps[c.planet]?.gone) continue;
      const elsewhere = c.colonies.filter((pid) => this.planet(pid)!.star !== i);
      if (elsewhere.length) {
        for (const pid of c.colonies) if (this.planet(pid)!.star === i) this.ps(pid).civ = undefined;
        c.colonies = elsewhere;
        this.relocate(c, `The ${c.species} abandoned their dying sun for the colonies.`);
      } else this.endCiv(c, `The ${c.name} was consumed by its dying star.`);
    }
  }

  private silenceCheck(c: Civ, years: number, t: number): void {
    const s = this.s;
    let rate = 0;
    if (c.status === 'quiet') return;
    if (c.era === ERA_INDEX.dyson) rate = 1 / 60000;
    else if (c.era >= ERA_INDEX.interstellar && c.era < ERA_INDEX.galactic && c.colonies.length >= 16) rate = 1 / 400000;
    if (!rate || !this.rng.chance(1 - Math.exp(-rate * years * s.params.filter))) return;
    if (c.protectedUntil >= t && s.found['great-filter'] !== undefined) {
      // Once turned back, the Silence leaves them alone for good.
      c.protectedUntil = 1e12;
      const text = `The Silence reached for the ${c.name}. Your shield held, and it withdrew.`;
      civLog(c, s.t, text);
      this.history(text, 'mystery', { civ: c.id }, true);
      this.emit({ type: 'chronicle', text, important: true, civ: c.id });
      return;
    }
    c.ended = t;
    c.status = 'silent';
    s.stats.silent++;
    for (const pid of [c.planet, ...c.colonies]) {
      const st = this.ps(pid);
      if (st.civ === c.id) st.civ = undefined;
    }
    this.loseSpecies(c);
    const text = `The ${c.name} went silent. Every world, every ship, every signal: gone, with no trace of war.`;
    civLog(c, s.t, text);
    this.discover('silence', { civ: c.id });
    this.history(text, 'mystery', { civ: c.id, planet: c.planet }, true);
    this.emit({ type: 'civ', civ: c.id, what: 'silent' });
    this.checkFilter();
    this.rev++;
  }

  private colonize(c: Civ, years: number): void {
    const cap = c.status === 'quiet' ? 10 : 120;
    if (c.era < ERA_INDEX.spaceflight || c.colonies.length >= cap) return;
    const rng = this.rng;
    const s = this.s;
    const explore = c.traits.exploration;
    // Outposts within the home system.
    const local = (years / 400) * (0.4 + explore);
    let tries = Math.min(4, Math.floor(local) + (rng.next() < local % 1 ? 1 : 0));
    while (tries-- > 0) {
      const options = this.planets[c.star].filter((p) => p.id !== c.planet && !s.ps[p.id]?.gone && !s.ps[p.id]?.civ && p.body !== 'gas');
      if (!options.length) break;
      this.addColony(c, rng.pick(options).id);
    }
    if (c.era < ERA_INDEX.interstellar) return;
    const quiet = c.status === 'quiet';
    c.reach = Math.min(quiet ? 240 : 480, c.reach + (years / 260) * (0.5 + explore));
    const expected = years / (2600 * (1.6 - explore) * (quiet ? 20 : 1));
    let n = Math.min(6, Math.floor(expected) + (rng.next() < expected % 1 ? 1 : 0));
    while (n-- > 0 && c.colonies.length < cap) {
      const from = rng.pick(c.stars);
      const target = this.findColony(c, s.sx[from], s.sy[from], Math.min(c.reach, 160));
      if (target < 0) break;
      this.addColony(c, target);
    }
  }

  private findColony(c: Civ, x: number, y: number, r: number): number {
    const s = this.s;
    let best = -1;
    let bestScore = 0;
    for (const j of this.near(x, y, r)) {
      if (s.sphase[j] === Phase.Proto || s.sphase[j] >= Phase.Neutron || this.civAt[j]) continue;
      for (const p of this.planets[j]) {
        if (p.body === 'gas' || s.ps[p.id]?.gone || s.ps[p.id]?.civ) continue;
        const temp = this.planetTemp(p);
        const hab = this.habNow(p.id);
        if (hab < 0.04 && (c.era < ERA_INDEX.dyson || temp < 150 || temp > 450)) continue;
        const score = hab + 0.08 + this.rng.next() * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = p.id;
        }
      }
    }
    return best;
  }

  private addColony(c: Civ, pid: number): void {
    const st = this.ps(pid);
    st.civ = c.id;
    c.colonies.push(pid);
    this.s.stats.colonies++;
    this.cands.add(pid);
    this.hab.set(pid, this.habNow(pid));
    const p = this.planet(pid)!;
    if (!c.stars.includes(p.star)) c.stars.push(p.star);
    this.planetLog(pid, `Colonized by the ${c.species}.`);
  }

  private syncStars(c: Civ): void {
    const set = new Set<number>([c.star]);
    for (const pid of c.colonies) set.add(this.planet(pid)!.star);
    c.stars = [...set];
  }

  private contacts(civs: Civ[]): void {
    const s = this.s;
    for (let a = 0; a < civs.length; a++) {
      for (let b = a + 1; b < civs.length; b++) {
        const A = civs[a];
        const B = civs[b];
        if (!alive(A) || !alive(B) || A.era < ERA_INDEX.computing || B.era < ERA_INDEX.computing) continue;
        const key = `${Math.min(A.id, B.id)}:${Math.max(A.id, B.id)}`;
        if (s.pairs.includes(key)) continue;
        const range = 170 + Math.max(A.reach, B.reach);
        if (this.civDistance(A, B) > range) continue;
        s.pairs.push(key);
        this.meet(A, B);
      }
    }
  }

  private civDistance(A: Civ, B: Civ): number {
    const s = this.s;
    let d = Infinity;
    for (const i of A.stars) for (const j of B.stars) d = Math.min(d, Math.hypot(s.sx[i] - s.sx[j], s.sy[i] - s.sy[j]));
    return d;
  }

  private meet(A: Civ, B: Civ): void {
    const s = this.s;
    const rng = this.rng;
    s.stats.contacts++;
    A.contacts.push(B.id);
    B.contacts.push(A.id);
    this.discover('first-contact', { civ: A.id });
    const coop = (A.traits.cooperation + B.traits.cooperation) / 2;
    const mil = (A.traits.military + B.traits.military) / 2;
    const ships = A.era >= ERA_INDEX.interstellar && B.era >= ERA_INDEX.interstellar;
    let text: string;
    if (ships && A.traits.cooperation > 0.62 && B.traits.cooperation > 0.62 && rng.chance(0.45)) {
      const [big, small] = A.colonies.length >= B.colonies.length ? [A, B] : [B, A];
      for (const pid of [small.planet, ...small.colonies]) {
        this.ps(pid).civ = big.id;
        big.colonies.push(pid);
      }
      this.syncStars(big);
      small.ended = s.t;
      small.status = 'merged';
      big.name = `${big.adj}–${small.adj} Union`;
      text = `The ${big.species} and the ${small.species} met, and chose to become one civilization: the ${big.name}.`;
      civLog(small, s.t, text);
      this.discover('union', { civ: big.id });
    } else if (mil + rng.next() * 0.35 > 0.85 - (coop - 0.5) * 0.4) {
      this.discover('contact-war', { civ: A.id });
      if (ships) {
        const score = (c: Civ) => c.era + c.colonies.length * 0.08 + c.traits.military * 2 + rng.next() * 2;
        const [win, lose] = score(A) >= score(B) ? [A, B] : [B, A];
        const taken = lose.colonies.splice(0, Math.ceil(lose.colonies.length / 2));
        for (const pid of taken) {
          this.ps(pid).civ = win.id;
          win.colonies.push(pid);
        }
        this.syncStars(win);
        this.syncStars(lose);
        text = `First contact between the ${A.species} and the ${B.species} became a war. The ${win.species} won, taking ${taken.length} worlds.`;
        if (rng.chance(0.25)) this.endCiv(lose, `The ${lose.name} was annihilated in the First Contact War.`);
      } else {
        A.traits.military = Math.min(1, A.traits.military + 0.1);
        B.traits.military = Math.min(1, B.traits.military + 0.1);
        text = `The ${A.species} and the ${B.species} heard each other's signals, and began to arm.`;
      }
    } else {
      A.traits.science = Math.min(1, A.traits.science + 0.05);
      B.traits.science = Math.min(1, B.traits.science + 0.05);
      const behind = A.era < B.era ? A : B;
      behind.progress = Math.min(0.99, behind.progress + 0.3);
      text = `The ${A.species} and the ${B.species} made contact and began to exchange knowledge across the dark.`;
    }
    civLog(A, s.t, text);
    civLog(B, s.t, text);
    this.history(text, 'civ', { civ: A.id }, true);
    this.emit({ type: 'chronicle', text, important: true, civ: A.id });
  }

  /** Civilizations near an intervention may notice it. */
  private noticeAt(x: number, y: number, amount: number): void {
    const s = this.s;
    for (const c of this.aliveCivs()) {
      let d = Infinity;
      for (const i of c.stars) d = Math.min(d, Math.hypot(s.sx[i] - x, s.sy[i] - y));
      if (d < 220) this.notice(c, amount * (1 - d / 300));
    }
  }

  private notice(c: Civ, amount: number): void {
    c.watcher += amount;
    const s = this.s;
    const ref = { civ: c.id, planet: c.planet };
    if (c.watcherStage === 0 && c.watcher >= 0.25 && c.era >= ERA_INDEX.agriculture) {
      c.watcherStage = 1;
      c.traits.religion = Math.min(1, c.traits.religion + 0.2);
      const text = `The ${c.species} began to worship The Watcher, a god who moves the stars.`;
      civLog(c, s.t, text);
      this.discover('watcher', ref);
      this.history(text, 'you', ref, false);
    }
    if (c.watcherStage === 1 && c.watcher >= 0.6 && c.era >= ERA_INDEX.computing) {
      c.watcherStage = 2;
      const text = `${c.adj} scientists proposed the Observer Hypothesis: someone is manipulating their universe.`;
      civLog(c, s.t, text);
      this.discover('observer', ref);
      this.history(text, 'you', ref, false);
    }
    if (c.watcherStage === 2 && c.watcher >= 1 && c.era >= ERA_INDEX.spaceflight) {
      c.watcherStage = 3;
      const text = `The ${c.species} aimed a message at the sky, addressed to The Watcher: “We see you.”`;
      civLog(c, s.t, text);
      this.history(text, 'you', ref, true);
      this.emit({ type: 'chronicle', text, important: true, civ: c.id });
    }
  }

  private checkFilter(): void {
    const s = this.s;
    // The answer is in the ruins, but only makes sense once you have seen a silence.
    if (s.found['great-filter'] === undefined && s.clues >= 3 && s.stats.silent >= 1) {
      this.discover('great-filter');
      this.history('You discovered the Great Filter.', 'mystery', {}, true);
    }
  }

  // --- Interventions -----------------------------------------------------------------------

  /** Can this intervention be used on this target right now? Returns a reason when not. */
  canIntervene(kind: Intervention, tg: Target): string | null {
    const s = this.s;
    const st = tg.planet !== undefined ? s.ps[tg.planet] : undefined;
    const c = tg.civ !== undefined ? this.civ(tg.civ) : undefined;
    switch (kind) {
      case 'matter':
        if (tg.x === undefined || tg.y === undefined || !Number.isFinite(tg.x + tg.y)) return 'Tap empty space.';
        return Math.hypot(tg.x, tg.y) > RADIUS * 1.15 ? 'Too far from the galaxy.' : null;
      case 'seed': {
        if (tg.planet === undefined) return 'Pick a planet.';
        if (st?.life && st.life.dead < 0) return 'It already has life.';
        return this.habNow(tg.planet) < 0.05 ? 'Nothing could live there.' : null;
      }
      case 'warm':
      case 'cool': {
        if (tg.planet === undefined) return 'Pick a planet.';
        const p = this.planet(tg.planet)!;
        if (p.body === 'gas') return 'Gas giants have no surface to change.';
        return st?.gone ? 'That world is gone.' : null;
      }
      case 'asteroid':
        if (tg.planet === undefined) return 'Pick a planet.';
        return st?.gone ? 'That world is gone.' : null;
      case 'nova': {
        if (tg.star === undefined) return 'Pick a star.';
        return s.sphase[tg.star] >= Phase.WhiteDwarf ? 'That star is already dead.' : null;
      }
      case 'knowledge':
        return !c || !alive(c) ? 'Pick a living civilization.' : c.era >= ERA_INDEX.galactic ? 'They know more than you could tell them.' : null;
      case 'protect':
        return !c || !alive(c) ? 'Pick a living civilization.' : c.protectedUntil >= s.t ? 'Already protected.' : null;
      case 'study':
        return !st?.ruins?.some((r) => !r.studied) ? 'No unstudied ruins here.' : null;
    }
  }

  intervene(kind: Intervention, tg: Target): { ok: boolean; text: string } {
    const why = this.canIntervene(kind, tg);
    if (why) return { ok: false, text: why };
    const s = this.s;
    const rng = this.rng;
    const pr = s.prof;
    const act = (create: number, destroy: number) => {
      pr.create += create;
      pr.destroy += destroy;
      pr.interventions++;
      pr.lastAct = s.t;
    };
    const p = tg.planet !== undefined ? this.planet(tg.planet) : undefined;
    const sx = (i: number) => s.sx[i];
    const sy = (i: number) => s.sy[i];
    let text = '';
    switch (kind) {
      case 'matter': {
        const x = tg.x!;
        const y = tg.y!;
        const c = this.cellOf(x, y);
        this.returnGas(x, y, 9, s.metal[c]);
        act(1, 0);
        this.emit({ type: 'fx', fx: 'matter', x, y });
        this.noticeAt(x, y, 0.08);
        text = 'You poured new gas into space. Stars will form there.';
        break;
      }
      case 'seed': {
        this.startLife(tg.planet!, true);
        act(2, 0);
        this.emit({ type: 'fx', fx: 'seed', x: sx(p!.star), y: sy(p!.star), star: p!.star });
        this.history(`You seeded ${p!.name} with life.`, 'you', { planet: p!.id }, false);
        text = `You seeded ${p!.name} with microbes.`;
        break;
      }
      case 'warm':
      case 'cool': {
        const before = this.habNow(p!.id);
        const st = this.ps(p!.id);
        st.shift = (st.shift ?? 0) + (kind === 'warm' ? 25 : -25);
        this.refreshStar(p!.star);
        const after = this.habNow(p!.id);
        act(after > before ? 1 : 0, after < before - 0.05 ? 1 : 0);
        this.planetLog(p!.id, kind === 'warm' ? 'Its climate warmed suddenly.' : 'Its climate cooled suddenly.');
        if (st.life && st.life.dead < 0 && after < before - 0.15) massExtinction(st.life, s.t, 0.35, rng);
        this.noticeAt(sx(p!.star), sy(p!.star), 0.25);
        text = `${p!.name} is now ${Math.round(this.planetTemp(p!) - 273)}°C. Habitability ${Math.round(before * 100)}% → ${Math.round(after * 100)}%.`;
        if (after > 0.6) this.discover('goldilocks', { planet: p!.id });
        break;
      }
      case 'asteroid': {
        const st = this.ps(p!.id);
        act(0, 2);
        this.emit({ type: 'fx', fx: 'impact', x: sx(p!.star), y: sy(p!.star), star: p!.star });
        let share = 0;
        if (st.life && st.life.dead < 0) {
          share = massExtinction(st.life, s.t, rng.float(0.6, 0.95), rng);
          if (share >= 0.5) this.discover('mass-extinction', { planet: p!.id });
          if (st.life.dead >= 0) this.lifeEvent(p!.id, st.life, { kind: 'extinct' });
        }
        this.planetLog(p!.id, `You struck it with an asteroid${share ? `, killing ${Math.round(share * 100)}% of species` : ''}.`);
        if (st.civ) {
          const c = this.civ(st.civ);
          if (c && c.era < ERA_INDEX.spaceflight) this.civDisaster(c.id, p!.id, 0.6, 'an asteroid impact');
          else if (c) civLog(c, s.t, 'They deflected an asteroid aimed at their world. It was not an accident.');
        }
        this.noticeAt(sx(p!.star), sy(p!.star), 0.35);
        this.history(`You struck ${p!.name} with an asteroid.`, 'you', { planet: p!.id }, false);
        text = share ? `Impact on ${p!.name}: ${Math.round(share * 100)}% of species died.` : `Impact on ${p!.name}.`;
        break;
      }
      case 'nova': {
        const i = tg.star!;
        act(0, 3);
        s.sdeath[i] = s.t;
        const old = s.sphase[i] as Phase;
        const ph = this.phaseOf(i);
        s.sphase[i] = ph;
        this.noticeAt(sx(i), sy(i), 0.6);
        this.transition(i, old, ph);
        this.history(`You made ${this.names[i]} explode.`, 'you', { star: i }, true);
        text = `${this.names[i]} exploded.`;
        break;
      }
      case 'knowledge': {
        const c = this.civ(tg.civ!)!;
        act(1, 0);
        c.progress = Math.min(0.999, c.progress + 0.7);
        civLog(c, s.t, 'A sudden leap of insight that no one could explain.');
        this.notice(c, 0.25);
        this.emit({ type: 'fx', fx: 'spark', x: sx(c.star), y: sy(c.star), star: c.star });
        text = `You nudged the ${c.species} toward the ${c.eras[Math.min(c.eras.length - 1, c.era + 1)]} era.`;
        break;
      }
      case 'protect': {
        const c = this.civ(tg.civ!)!;
        act(1, 0);
        c.protectedUntil = s.t + 3;
        this.emit({ type: 'fx', fx: 'shield', x: sx(c.star), y: sy(c.star), star: c.star });
        text = `The ${c.species} are protected from the next catastrophe (for up to 3 million years).`;
        break;
      }
      case 'study': {
        const st = this.ps(tg.planet!);
        const r = st.ruins!.find((x) => !x.studied)!;
        r.studied = true;
        pr.observe += 2;
        s.clues += r.era >= ERA_INDEX.interstellar ? 2 : 1;
        this.discover('ruins', { planet: tg.planet });
        const lore = LORE[Math.min(LORE.length - 1, Math.max(0, s.clues - 1))];
        text = `${r.artifact} left by the ${r.civ}. ${lore}`;
        this.planetLog(tg.planet!, `You studied the ruins of the ${r.civ}.`);
        this.checkFilter();
        break;
      }
    }
    this.rev++;
    this.checkAchievements();
    return { ok: true, text };
  }

  // --- Discoveries and history ------------------------------------------------------------------

  discover(id: string, ref: { star?: number; planet?: number; civ?: number } = {}): void {
    const s = this.s;
    if (s.found[id] !== undefined) return;
    s.found[id] = s.t;
    const d = DISCOVERY[id];
    if (d) this.history(d.name, 'first', ref, true);
    this.emit({ type: 'discovery', id, ...ref });
  }

  history(text: string, kind: HistEntry['kind'], ref: { star?: number; planet?: number; civ?: number } = {}, important = false): void {
    const h = this.s.history;
    h.push({ t: this.s.t, text, kind, ...ref });
    if (h.length > 320) {
      const k = h.findIndex((e) => e.kind !== 'first');
      h.splice(k >= 0 ? k : 0, 1);
    }
    if (kind !== 'first') this.emit({ type: 'chronicle', text, important, ...ref });
  }

  private checkAchievements(): void {
    const s = this.s;
    const f = s.found;
    const give = (id: string, ok: boolean) => {
      if (ok && s.ach[id] === undefined) {
        s.ach[id] = s.t;
        this.emit({ type: 'chronicle', text: `Achievement unlocked: ${ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id}`, important: true });
      }
    };
    give('first-star', f['first-star'] !== undefined);
    give('genesis', f['first-life'] !== undefined);
    give('thinking', f.intelligence !== undefined);
    give('civilization', f.industry !== undefined);
    give('contact', f['first-contact'] !== undefined);
    give('great-filter', f['great-filter'] !== undefined);
    give('god-complex', s.prof.interventions >= 50);
    give('observer', s.t >= 13800 && s.prof.interventions === 0 && f['first-life'] !== undefined);
    give('creator', f['ancient-civ'] !== undefined);
    if (s.ach.empire === undefined) {
      let worlds = 0;
      for (const c of s.civs) if (alive(c)) worlds += 1 + c.colonies.length;
      give('empire', worlds >= 60);
    }
  }

  // --- Queries -----------------------------------------------------------------------------------

  cosmicEra(): number {
    let era = this.s.t < 60 ? 0 : 1;
    COSMIC_ERAS.forEach((e, k) => {
      if (e.by && this.s.found[e.by] !== undefined) era = Math.max(era, k);
    });
    return era;
  }

  lifeWorlds(): number[] {
    const out: number[] = [];
    for (const [k, st] of Object.entries(this.s.ps)) if (st.life && st.life.dead < 0) out.push(+k);
    return out;
  }

  funnel(): { label: string; n: number }[] {
    const civs = this.s.civs;
    const reached = (era: number) => civs.filter((c) => c.peak >= era).length;
    return [
      { label: 'Intelligent species', n: civs.length },
      { label: 'Farming', n: reached(ERA_INDEX.agriculture) },
      { label: 'Industrial', n: reached(ERA_INDEX.industry) },
      { label: 'Spacefaring', n: reached(ERA_INDEX.spaceflight) },
      { label: 'Interstellar', n: reached(ERA_INDEX.interstellar) },
      { label: 'Galactic', n: reached(ERA_INDEX.galactic) },
    ];
  }

  /** Mark per-star life stage and civilization for the renderer. */
  private markStars(): void {
    this.lifeAt.fill(0);
    this.civAt.fill(0);
    for (const pid of this.cands) {
      const b = this.s.ps[pid]?.life;
      if (!b || b.dead >= 0) continue;
      const j = Math.floor(pid / PLANET_STRIDE);
      this.lifeAt[j] = Math.max(this.lifeAt[j], b.stage);
    }
    for (const c of this.s.civs) if (alive(c)) for (const i of c.stars) this.civAt[i] = c.id + 1;
  }

  nearestStar(x: number, y: number, r: number): number {
    let best = -1;
    let bd = r;
    for (const j of this.near(x, y, r)) {
      const d = Math.hypot(this.s.sx[j] - x, this.s.sy[j] - y);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    return best;
  }

  near(x: number, y: number, r: number): number[] {
    const out: number[] = [];
    const g0x = Math.floor((x - r) / HASH);
    const g1x = Math.floor((x + r) / HASH);
    const g0y = Math.floor((y - r) / HASH);
    const g1y = Math.floor((y + r) / HASH);
    for (let gy = g0y; gy <= g1y; gy++) {
      for (let gx = g0x; gx <= g1x; gx++) {
        const cell = this.hash.get(hkey(gx, gy));
        if (!cell) continue;
        for (const j of cell) if (Math.hypot(this.s.sx[j] - x, this.s.sy[j] - y) <= r) out.push(j);
      }
    }
    return out;
  }

  private hashAdd(i: number): void {
    const k = hkey(Math.floor(this.s.sx[i] / HASH), Math.floor(this.s.sy[i] / HASH));
    let cell = this.hash.get(k);
    if (!cell) this.hash.set(k, (cell = []));
    cell.push(i);
  }

  private hashRemove(i: number): void {
    const k = hkey(Math.floor(this.s.sx[i] / HASH), Math.floor(this.s.sy[i] / HASH));
    const cell = this.hash.get(k);
    if (!cell) return;
    const at = cell.indexOf(i);
    if (at >= 0) cell.splice(at, 1);
  }

  /** Everything in one living-world summary line, for lists. */
  describeWorld(pid: number): string {
    const p = this.planet(pid);
    if (!p) return '';
    const st = this.s.ps[pid];
    const parts = [this.kindName(pid)];
    if (st?.life && st.life.dead < 0) parts.push(['', 'microbes', 'complex life', 'life on land', 'tool users', 'intelligent'][st.life.stage]);
    if (st?.civ) {
      const c = this.civ(st.civ);
      if (c) parts.push(c.planet === pid ? `${c.species} (${eraName(c)})` : `${c.adj} colony`);
    }
    return parts.join(' · ');
  }

  kindName(pid: number): string {
    const p = this.planet(pid);
    if (!p) return '';
    if (this.s.ps[pid]?.gone) return 'Destroyed world';
    const k = kindOf(p, this.planetTemp(p));
    return { lava: 'Lava world', desert: 'Desert world', ocean: 'Ocean world', terran: 'Temperate world', ice: 'Ice world', gas: 'Gas giant', icegiant: 'Ice giant', barren: 'Barren rock' }[k];
  }

  livingLineages(pid: number): number {
    const b = this.s.ps[pid]?.life;
    return b && b.dead < 0 ? living(b).length : 0;
  }
}

function hkey(gx: number, gy: number): number {
  return (gx + 500) * 1000 + (gy + 500);
}

/** One pass of a 5-point blur, in place. */
function blur(a: Float32Array, tmp: Float32Array, k: number): void {
  if (k <= 0) return;
  tmp.set(a);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      const c = tmp[i];
      const l = x > 0 ? tmp[i - 1] : c;
      const r = x < GRID - 1 ? tmp[i + 1] : c;
      const u = y > 0 ? tmp[i - GRID] : c;
      const d = y < GRID - 1 ? tmp[i + GRID] : c;
      a[i] = c + k * (l + r + u + d - 4 * c);
    }
  }
}

function clusterOf(seed: string, p: Params): { x: number; y: number } | null {
  if (!p.contact) return null;
  const rng = new Rng(hashString(`${seed}:cluster`));
  return { x: rng.float(-350, 350), y: rng.float(-350, 350) };
}

/** The galaxy's starting gas: an exponential disc with spiral arms, a bulge and noise. */
function buildProfile(seed: string, p: Params): Float32Array {
  const rng = new Rng(hashString(`${seed}:gas`));
  const noise = new Noise2D(rng);
  const arms = 2 + rng.int(3);
  const twist = rng.float(3.6, 5.2);
  const phase = rng.float(0, Math.PI * 2);
  const amp = [0.18, 0.45, 0.95][p.chaos];
  const sharp = [1.2, 2.2, 3.2][p.chaos];
  const out = new Float32Array(GRID * GRID);
  const cluster = clusterOf(seed, p);
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const x = (gx + 0.5) * CELL - SPAN / 2;
      const y = (gy + 0.5) * CELL - SPAN / 2;
      const r = Math.hypot(x, y) / RADIUS;
      if (r > 1.1) continue;
      const disc = Math.exp(-r / 0.4);
      const bulge = 1.6 * Math.exp(-Math.pow(r / 0.12, 2));
      const th = Math.atan2(y, x);
      const arm = 0.5 + 0.5 * Math.cos(arms * (th - twist * Math.log(r + 0.08)) + phase);
      const armMod = 0.3 + 1.4 * Math.pow(arm, sharp);
      const n = Math.max(0, 1 + amp * noise.fbm(x / 170, y / 170, 4));
      const edge = r < 0.9 ? 1 : Math.max(0, (1.1 - r) / 0.2);
      let v = (disc * armMod + bulge) * n * edge;
      if (cluster) v += 3.5 * Math.exp(-(Math.pow(x - cluster.x, 2) + Math.pow(y - cluster.y, 2)) / (2 * 110 * 110));
      out[gy * GRID + gx] = v;
    }
  }
  return out;
}
