import { Noise2D } from '../../shared/noise';
import { hashString, Rng } from '../../shared/rng';
import { distance, epithet, G, GENES, genusName, mutate, primitiveGenome } from './genes';

// The primordial sea. Creatures live in typed arrays (structure of arrays) so
// a few thousand can steer, eat, hunt and breed every frame. Plants grow on a
// coarse grid. Species are clusters of genomes and split when a lineage
// drifts far enough from its ancestors.

export const W = 2400;
export const H = 1500;
export const CELL = 24;
export const GW = W / CELL;
export const GH = Math.ceil(H / CELL);
export const CAP = 2200;
/** Simulation seconds per displayed year. */
export const YEAR = 0.1;

export interface Species {
  id: number;
  name: string;
  genus: string;
  parent: number;
  born: number;
  died: number | null;
  hue: number;
  centroid: number[];
  count: number;
  peak: number;
  gen: number;
  kills: number;
  /** Founded by the player or the director rather than by evolution. */
  seeded: boolean;
}

export interface Chronicle {
  t: number;
  kind: 'speciation' | 'extinction' | 'milestone' | 'power' | 'disaster';
  text: string;
  x: number;
  y: number;
  important: boolean;
}

export interface Effect {
  kind: 'bloom' | 'ice' | 'heat' | 'storm' | 'meteor';
  x: number;
  y: number;
  r: number;
  t0: number;
  t1: number;
}

export interface Sample {
  t: number;
  pop: number;
  species: [number, number][];
  diet: number;
  size: number;
}

export interface WorldState {
  version: number;
  seed: string;
  t: number;
  rng: number;
  nextId: number;
  alive: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  energy: Float32Array;
  age: Float32Array;
  genes: Float32Array;
  species: Int32Array;
  gen: Int32Array;
  uid: Int32Array;
  kills: Uint16Array;
  plants: Float32Array;
  /** Carrion left by the dead, rotting away. */
  meat: Float32Array;
  fert: Float32Array;
  tempNoise: Float32Array;
  speciesList: Species[];
  chronicle: Chronicle[];
  samples: Sample[];
  effects: Effect[];
  milestones: Record<string, number>;
  births: number;
  deaths: number;
  maxGen: number;
}

export type WorldEvent = { type: 'chronicle'; entry: Chronicle } | { type: 'meteor'; x: number; y: number };

export const SAVE_VERSION = 1;

export function newWorldState(seed: string): WorldState {
  const rng = new Rng(hashString(`pr|${seed.trim().toLowerCase()}`));
  const n = GW * GH;
  const fert = new Float32Array(n);
  const tempNoise = new Float32Array(n);
  const nf = new Noise2D(rng.fork('fert'));
  const nt = new Noise2D(rng.fork('temp'));
  for (let i = 0; i < n; i++) {
    const cx = i % GW;
    const cy = (i / GW) | 0;
    const v = nf.fbm(cx * 0.06, cy * 0.06, 4);
    fert[i] = Math.max(0.05, Math.min(1, 0.45 + v * 0.9));
    tempNoise[i] = nt.fbm(cx * 0.05, cy * 0.05, 3) * 0.12;
  }
  const plants = new Float32Array(n);
  for (let i = 0; i < n; i++) plants[i] = fert[i] * 40;
  return {
    version: SAVE_VERSION, seed, t: 0, rng: rng.s, nextId: 1,
    alive: new Uint8Array(CAP), x: new Float32Array(CAP), y: new Float32Array(CAP), vx: new Float32Array(CAP), vy: new Float32Array(CAP),
    energy: new Float32Array(CAP), age: new Float32Array(CAP), genes: new Float32Array(CAP * GENES), species: new Int32Array(CAP).fill(-1),
    gen: new Int32Array(CAP), uid: new Int32Array(CAP), kills: new Uint16Array(CAP),
    plants, meat: new Float32Array(n), fert, tempNoise, speciesList: [], chronicle: [], samples: [], effects: [], milestones: {}, births: 0, deaths: 0, maxGen: 0,
  };
}

const GRID = 80;
const GX = Math.ceil(W / GRID);
const GY = Math.ceil(H / GRID);

export class World {
  s: WorldState;
  rng: Rng;
  // Derived per-creature traits (recomputed, never saved).
  r = new Float32Array(CAP);
  vmax = new Float32Array(CAP);
  sense = new Float32Array(CAP);
  emax = new Float32Array(CAP);
  life = new Float32Array(CAP);
  metab = new Float32Array(CAP);
  heading = new Float32Array(CAP);
  /** Spatial hash: head per cell, next per creature. */
  private head = new Int32Array(GX * GY);
  private next = new Int32Array(CAP);
  private free: number[] = [];
  count = 0;
  /** Index of the species in speciesList by id. */
  private byId = new Map<number, Species>();
  private listeners: ((e: WorldEvent) => void)[] = [];
  private stepCount = 0;
  private popWindow: number[] = [];
  plantsDirty = true;

  constructor(state: WorldState) {
    this.s = state;
    this.rng = new Rng(state.rng);
    for (const sp of state.speciesList) this.byId.set(sp.id, sp);
    for (let i = CAP - 1; i >= 0; i--) {
      if (state.alive[i]) {
        this.derive(i);
        this.count++;
      } else this.free.push(i);
    }
  }

  static create(seed: string): World {
    const w = new World(newWorldState(seed));
    // Three founding lineages of simple grazers.
    for (let k = 0; k < 3; k++) w.seedLife(w.rng.float(300, W - 300), w.rng.float(250, H - 250), 'grazer', 36, false);
    w.chronicle('milestone', 'Life stirs in the primordial sea.', W / 2, H / 2, true);
    return w;
  }

  on(fn: (e: WorldEvent) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  private emit(e: WorldEvent): void {
    for (const l of this.listeners) l(e);
  }

  get year(): number {
    return Math.floor(this.s.t / YEAR);
  }

  speciesOf(id: number): Species | undefined {
    return this.byId.get(id);
  }

  living(): Species[] {
    return this.s.speciesList.filter((sp) => sp.died === null && sp.count > 0);
  }

  chronicle(kind: Chronicle['kind'], text: string, x: number, y: number, important = false): void {
    const entry: Chronicle = { t: this.s.t, kind, text, x, y, important };
    this.s.chronicle.push(entry);
    if (this.s.chronicle.length > 400) this.s.chronicle.splice(0, this.s.chronicle.length - 400);
    this.emit({ type: 'chronicle', entry });
  }

  // --- Environment ---------------------------------------------------------------------

  cellAt(x: number, y: number): number {
    const cx = Math.max(0, Math.min(GW - 1, (x / CELL) | 0));
    const cy = Math.max(0, Math.min(GH - 1, (y / CELL) | 0));
    return cy * GW + cx;
  }

  globalTemp(): number {
    let d = 0;
    for (const e of this.s.effects) {
      if (e.kind !== 'ice' && e.kind !== 'heat') continue;
      const p = (this.s.t - e.t0) / (e.t1 - e.t0);
      const ramp = Math.min(1, p * 5, (1 - p) * 5);
      d += (e.kind === 'ice' ? -0.32 : 0.32) * ramp;
    }
    return d;
  }

  /** Temperature 0 (frozen north) to 1 (scorching south). */
  tempAt(x: number, y: number, g = this.globalTemp()): number {
    return Math.max(0, Math.min(1, 0.12 + (y / H) * 0.76 + this.s.tempNoise[this.cellAt(x, y)] + g));
  }

  mutationBoost(): number {
    return this.s.effects.some((e) => e.kind === 'storm') ? 4 : 1;
  }

  // --- Creatures ----------------------------------------------------------------------

  private derive(i: number): void {
    const g = this.s.genes;
    const o = i * GENES;
    const size = g[o + G.Size];
    const speed = g[o + G.Speed];
    const sense = g[o + G.Sense];
    this.r[i] = 3 + size * 11;
    this.vmax[i] = 18 + speed * 82;
    this.sense[i] = 30 + sense * 170;
    this.emax[i] = 40 + size * 240;
    this.life[i] = 18 + g[o + G.Lifespan] * 75;
    this.metab[i] = 0.6 + 3.2 * size ** 1.6 + 2.2 * speed * speed + 1.1 * sense + (g[o + G.Diet] > 0.5 ? 0.4 : 0);
    this.heading[i] = this.rng.next() * Math.PI * 2;
  }

  spawn(genes: Float32Array, go: number, x: number, y: number, species: number, gen: number, energy: number): number {
    const i = this.free.pop();
    if (i === undefined) return -1;
    const s = this.s;
    s.alive[i] = 1;
    s.x[i] = Math.max(2, Math.min(W - 2, x));
    s.y[i] = Math.max(2, Math.min(H - 2, y));
    s.vx[i] = 0;
    s.vy[i] = 0;
    s.energy[i] = energy;
    s.age[i] = 0;
    s.genes.set(genes.subarray(go, go + GENES), i * GENES);
    s.species[i] = species;
    s.gen[i] = gen;
    s.uid[i] = s.nextId++;
    s.kills[i] = 0;
    if (gen > s.maxGen) s.maxGen = gen;
    this.derive(i);
    this.count++;
    s.births++;
    const sp = this.byId.get(species);
    if (sp) sp.count++;
    return i;
  }

  kill(i: number, carrion = true): void {
    const s = this.s;
    if (!s.alive[i]) return;
    s.alive[i] = 0;
    if (carrion) {
      const c = this.cellAt(s.x[i], s.y[i]);
      s.meat[c] = Math.min(400, s.meat[c] + 25 + s.genes[i * GENES + G.Size] * 120 + Math.max(0, s.energy[i]) * 0.3);
    }
    const sp = this.byId.get(s.species[i]);
    if (sp) sp.count--;
    this.free.push(i);
    this.count--;
    s.deaths++;
  }

  private newSpecies(genes: Float32Array, go: number, parent: number, seeded: boolean, x: number, y: number): Species {
    const p = this.byId.get(parent);
    const genus = p && this.rng.chance(0.6) ? p.genus : genusName(this.rng);
    let name = `${genus} ${epithet(genes, go, this.rng)}`;
    const taken = new Set(this.s.speciesList.map((sp) => sp.name));
    for (let k = 2; taken.has(name); k++) name = `${genus} ${epithet(genes, go, this.rng)}${k > 4 ? ` ${['II', 'III', 'IV', 'V', 'VI', 'VII'][k % 6]}` : ''}`;
    const sp: Species = {
      id: this.s.nextId++, name, genus, parent, born: this.s.t, died: null, hue: genes[go + G.Hue],
      centroid: Array.from(genes.subarray(go, go + GENES)), count: 0, peak: 0, gen: 0, kills: 0, seeded,
    };
    this.s.speciesList.push(sp);
    this.byId.set(sp.id, sp);
    if (p && !seeded) {
      const living = this.living().length;
      this.chronicle('speciation', `${sp.name} splits from ${p.name}.`, x, y, living < 6 || this.s.speciesList.length % 5 === 0);
      if (this.s.milestones.firstSplit === undefined) {
        this.s.milestones.firstSplit = this.s.t;
        this.chronicle('milestone', `The first new species, ${sp.name}, evolves.`, x, y, true);
      }
    }
    return sp;
  }

  /** Release a small founding population: grazers or hunters. */
  seedLife(x: number, y: number, kind: 'grazer' | 'hunter', n = 24, announce = true): Species {
    const tmp = new Float32Array(GENES);
    primitiveGenome(this.rng, tmp, 0);
    if (kind === 'hunter') {
      tmp[G.Diet] = this.rng.float(0.72, 0.85);
      tmp[G.Size] = this.rng.float(0.5, 0.65);
      tmp[G.Speed] = this.rng.float(0.55, 0.7);
      tmp[G.Sense] = this.rng.float(0.5, 0.65);
      tmp[G.Aggression] = this.rng.float(0.5, 0.8);
      tmp[G.Social] = this.rng.float(0, 0.3);
    }
    tmp[G.Heat] = Math.max(0.05, Math.min(0.95, this.tempAt(x, y) + this.rng.float(-0.05, 0.05)));
    const sp = this.newSpecies(tmp, 0, -1, true, x, y);
    const child = new Float32Array(GENES);
    for (let k = 0; k < n; k++) {
      mutate(this.rng, tmp, 0, child, 0, 0.5);
      const a = this.rng.next() * Math.PI * 2;
      const d = this.rng.next() * 60;
      this.spawn(child, 0, x + Math.cos(a) * d, y + Math.sin(a) * d, sp.id, 0, 40 + child[G.Size] * 120);
    }
    if (announce) this.chronicle('power', `${n} ${kind === 'hunter' ? 'hunters' : 'grazers'} of a new kind, ${sp.name}, are released.`, x, y, true);
    return sp;
  }

  // --- Simulation ------------------------------------------------------------------------

  private buildGrid(): void {
    this.head.fill(-1);
    const s = this.s;
    for (let i = 0; i < CAP; i++) {
      if (!s.alive[i]) continue;
      const c = Math.min(GY - 1, (s.y[i] / GRID) | 0) * GX + Math.min(GX - 1, (s.x[i] / GRID) | 0);
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }

  /** Advance the world by dt seconds. */
  step(dt: number): void {
    const s = this.s;
    const rng = this.rng;
    this.buildGrid();
    const gT = this.globalTemp();
    const boost = this.mutationBoost();
    const genes = s.genes;
    const child = new Float32Array(GENES);
    for (let i = 0; i < CAP; i++) {
      if (!s.alive[i]) continue;
      const o = i * GENES;
      const x = s.x[i];
      const y = s.y[i];
      const sp = s.species[i];
      const size = genes[o + G.Size];
      const diet = genes[o + G.Diet];
      const aggr = genes[o + G.Aggression];
      const social = genes[o + G.Social];
      const fear = genes[o + G.Fear];
      const R = this.sense[i];
      const R2 = R * R;
      const hunger = 1 - s.energy[i] / this.emax[i];
      // Neighbors.
      let fx = 0;
      let fy = 0;
      let flockX = 0;
      let flockY = 0;
      let alignX = 0;
      let alignY = 0;
      let nFlock = 0;
      let sepX = 0;
      let sepY = 0;
      let prey = -1;
      let preyD = Infinity;
      const c0x = Math.max(0, ((x - R) / GRID) | 0);
      const c1x = Math.min(GX - 1, ((x + R) / GRID) | 0);
      const c0y = Math.max(0, ((y - R) / GRID) | 0);
      const c1y = Math.min(GY - 1, ((y + R) / GRID) | 0);
      // Even part-time meat eaters will take a small enough meal.
      const hunter = diet > 0.3;
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          for (let j = this.head[cy * GX + cx]; j >= 0; j = this.next[j]) {
            if (j === i) continue;
            const dx = s.x[j] - x;
            const dy = s.y[j] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 > R2 || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            const sj = s.species[j];
            const oj = j * GENES;
            const sizeJ = genes[oj + G.Size];
            if (sj === sp) {
              nFlock++;
              flockX += dx;
              flockY += dy;
              alignX += s.vx[j];
              alignY += s.vy[j];
              const touch = this.r[i] + this.r[j] + 2;
              if (d < touch) {
                sepX -= dx / d;
                sepY -= dy / d;
              }
              continue;
            }
            // A bigger hunter of another kind: run.
            if (genes[oj + G.Diet] > 0.35 && sizeJ > size * 0.9) {
              const w = (0.3 + fear) * (1 - d / R) * 3;
              fx -= (dx / d) * w;
              fy -= (dy / d) * w;
            }
            if (hunter && sizeJ < size * (0.7 + diet * 0.6) && d < preyD) {
              preyD = d;
              prey = j;
            }
          }
        }
      }
      let dirX = 0;
      let dirY = 0;
      let urgent = false;
      if (fx !== 0 || fy !== 0) {
        dirX += fx;
        dirY += fy;
        urgent = true;
      }
      // Hunting.
      if (prey >= 0 && hunger > 0.15) {
        const w = diet * (0.5 + aggr) * (0.3 + hunger) * 2.6;
        dirX += ((s.x[prey] - x) / preyD) * w;
        dirY += ((s.y[prey] - y) / preyD) * w;
        urgent = true;
      }
      // Grazing: look a little way ahead in several directions.
      if (diet < 0.75 && hunger > 0.05) {
        let best = s.plants[this.cellAt(x, y)];
        let bx = 0;
        let by = 0;
        const reach = R * 0.5;
        for (let k = 0; k < 6; k++) {
          const a = this.heading[i] + (k * Math.PI) / 3;
          const v = s.plants[this.cellAt(x + Math.cos(a) * reach, y + Math.sin(a) * reach)];
          if (v > best + 2) {
            best = v;
            bx = Math.cos(a);
            by = Math.sin(a);
          }
        }
        const w = (1 - diet) * (0.4 + hunger) * 1.4;
        dirX += bx * w;
        dirY += by * w;
      }
      // Scavenging: follow the smell of carrion.
      if (diet > 0.12 && hunger > 0.1) {
        let best = s.meat[this.cellAt(x, y)];
        let bx = 0;
        let by = 0;
        const reach = R * 0.6;
        for (let k = 0; k < 6; k++) {
          const a = this.heading[i] + (k * Math.PI) / 3 + 0.5;
          const v = s.meat[this.cellAt(x + Math.cos(a) * reach, y + Math.sin(a) * reach)];
          if (v > best + 3) {
            best = v;
            bx = Math.cos(a);
            by = Math.sin(a);
          }
        }
        const w = diet * (0.4 + hunger) * 2;
        dirX += bx * w;
        dirY += by * w;
      }
      // Herds.
      if (nFlock > 0 && social > 0.15) {
        dirX += (flockX / nFlock / R) * social * 1.2 + (alignX / nFlock / this.vmax[i]) * social * 0.8;
        dirY += (flockY / nFlock / R) * social * 1.2 + (alignY / nFlock / this.vmax[i]) * social * 0.8;
      }
      dirX += sepX * 0.8;
      dirY += sepY * 0.8;
      // Seek a comfortable temperature (warmer is south).
      const temp = Math.max(0, Math.min(1, 0.12 + (y / H) * 0.76 + s.tempNoise[this.cellAt(x, y)] + gT));
      const mismatch = temp - genes[o + G.Heat];
      if (Math.abs(mismatch) > 0.08) dirY -= Math.sign(mismatch) * Math.min(1, Math.abs(mismatch) * 4);
      // Wander.
      this.heading[i] += (rng.next() - 0.5) * 1.6 * dt * 4;
      dirX += Math.cos(this.heading[i]) * 0.35;
      dirY += Math.sin(this.heading[i]) * 0.35;
      const len = Math.hypot(dirX, dirY) || 1;
      const want = this.vmax[i] * (urgent ? 1 : 0.5);
      s.vx[i] += ((dirX / len) * want - s.vx[i]) * Math.min(1, dt * 3.5);
      s.vy[i] += ((dirY / len) * want - s.vy[i]) * Math.min(1, dt * 3.5);
      let nx = x + s.vx[i] * dt;
      let ny = y + s.vy[i] * dt;
      if (nx < 2 || nx > W - 2) {
        s.vx[i] = -s.vx[i];
        nx = Math.max(2, Math.min(W - 2, nx));
      }
      if (ny < 2 || ny > H - 2) {
        s.vy[i] = -s.vy[i];
        ny = Math.max(2, Math.min(H - 2, ny));
      }
      s.x[i] = nx;
      s.y[i] = ny;
      if (Math.abs(s.vx[i]) + Math.abs(s.vy[i]) > 1) this.heading[i] = Math.atan2(s.vy[i], s.vx[i]);
      // Eat plants.
      if (diet < 0.85) {
        const cell = this.cellAt(nx, ny);
        const bite = Math.min(s.plants[cell], (8 + size * 30) * dt);
        if (bite > 0 && s.energy[i] < this.emax[i]) {
          s.plants[cell] -= bite;
          s.energy[i] = Math.min(this.emax[i], s.energy[i] + bite * (1 - diet) ** 0.9 * 1.6);
        }
      }
      // Eat carrion.
      if (diet > 0.08) {
        const cell = this.cellAt(nx, ny);
        const bite = Math.min(s.meat[cell], (6 + size * 30) * dt);
        if (bite > 0 && s.energy[i] < this.emax[i]) {
          s.meat[cell] -= bite;
          s.energy[i] = Math.min(this.emax[i], s.energy[i] + bite * diet * 1.8);
        }
      }
      // Attack.
      if (prey >= 0 && preyD < this.r[i] + this.r[prey] + 3 && s.alive[prey]) {
        const sizeJ = genes[prey * GENES + G.Size];
        if (rng.next() < dt * 3 * (size / (size + sizeJ + 0.05)) * (0.6 + aggr)) {
          const gain = (s.energy[prey] * 0.6 + 40 + sizeJ * 170) * diet;
          s.energy[i] = Math.min(this.emax[i] * 1.1, s.energy[i] + gain);
          s.kills[i]++;
          const spi = this.byId.get(sp);
          if (spi) spi.kills++;
          this.kill(prey, false);
        }
      }
      // Living costs.
      const speedFrac = Math.hypot(s.vx[i], s.vy[i]) / this.vmax[i];
      s.energy[i] -= (this.metab[i] * (0.6 + speedFrac * 0.6) + Math.max(0, Math.abs(mismatch) - 0.1) * 6) * dt;
      s.age[i] += dt;
      if (s.energy[i] <= 0 || s.age[i] > this.life[i]) {
        this.kill(i);
        continue;
      }
      // Reproduce.
      const fert = genes[o + G.Fertility];
      if (s.age[i] > 4 + size * 8 && s.energy[i] > this.emax[i] * (0.5 + fert * 0.4) && this.count < CAP - 1) {
        const share = s.energy[i] * (0.3 + fert * 0.25);
        s.energy[i] -= share * 1.12;
        mutate(rng, genes, o, child, 0, boost);
        let csp = sp;
        const spec = this.byId.get(sp);
        // A new species needs a lineage that has drifted, not one odd mutant.
        if (spec && distance(child, 0, spec.centroid, 0) > 0.2 && distance(genes, o, spec.centroid, 0) > 0.17 && spec.count > 8) csp = this.newSpecies(child, 0, sp, false, nx, ny).id;
        const k = this.spawn(child, 0, nx + (rng.next() - 0.5) * 8, ny + (rng.next() - 0.5) * 8, csp, s.gen[i] + 1, share);
        if (k >= 0) {
          const cs = this.byId.get(csp)!;
          // Species drift: the centroid follows its members.
          for (let g2 = 0; g2 < GENES; g2++) cs.centroid[g2] += (child[g2] - cs.centroid[g2]) * 0.02;
          if (s.gen[k] > cs.gen) cs.gen = s.gen[k];
        }
      }
    }
    this.stepCount++;
    if (this.stepCount % 3 === 0) this.growPlants(dt * 3);
    s.t += dt;
    if (this.stepCount % 15 === 0) this.bookkeeping();
    this.s.rng = this.rng.s;
  }

  private growPlants(dt: number): void {
    const s = this.s;
    const n = GW * GH;
    const blooms = s.effects.filter((e) => e.kind === 'bloom' || e.kind === 'meteor');
    const gT = this.globalTemp();
    for (let i = 0; i < n; i++) {
      let f = s.fert[i];
      // Cold slows growth; extreme heat too.
      const cy = (i / GW) | 0;
      const temp = 0.12 + ((cy * CELL) / H) * 0.76 + s.tempNoise[i] + gT;
      f *= temp < 0.1 ? 0.25 : temp > 0.95 ? 0.6 : 1;
      if (blooms.length) {
        const x = (i % GW) * CELL + CELL / 2;
        const y = cy * CELL + CELL / 2;
        for (const b of blooms) {
          const d = Math.hypot(x - b.x, y - b.y);
          if (d < b.r) f = b.kind === 'bloom' ? f * 2.5 + 0.3 : f * 0.05;
        }
      }
      if (s.meat[i] > 0) s.meat[i] = Math.max(0, s.meat[i] - dt * (0.5 + s.meat[i] * 0.04));
      const cap = 60 * Math.min(1.6, f);
      const p = s.plants[i];
      // Logistic regrowth: patches recover from a little seed stock.
      s.plants[i] = Math.min(cap, p + dt * (0.03 + f * 0.16) * (1 - p / Math.max(1, cap)) * (2 + p * 0.25));
    }
    this.plantsDirty = true;
  }

  private bookkeeping(): void {
    const s = this.s;
    // Recount species from scratch (cheap, keeps counts honest).
    for (const sp of s.speciesList) sp.count = 0;
    for (let i = 0; i < CAP; i++) if (s.alive[i]) {
      const sp = this.byId.get(s.species[i]);
      if (sp) sp.count++;
    }
    for (const sp of s.speciesList) {
      if (sp.count > sp.peak) sp.peak = sp.count;
      if (sp.died === null && sp.count === 0 && s.t - sp.born > 1) {
        sp.died = s.t;
        if (sp.peak >= 25) this.chronicle('extinction', `${sp.name} goes extinct after ${Math.round((s.t - sp.born) / YEAR).toLocaleString('en-US')} years.`, W / 2, H / 2, sp.peak >= 80);
      }
    }
    s.effects = s.effects.filter((e) => e.t1 > s.t);
    this.milestones();
    if (s.samples.length === 0 || s.t - s.samples[s.samples.length - 1].t >= 2) {
      const top = this.living().sort((a, b) => b.count - a.count).slice(0, 8);
      let diet = 0;
      let size = 0;
      for (let i = 0; i < CAP; i++) if (s.alive[i]) {
        diet += s.genes[i * GENES + G.Diet];
        size += s.genes[i * GENES + G.Size];
      }
      s.samples.push({ t: s.t, pop: this.count, species: top.map((sp) => [sp.id, sp.count]), diet: this.count ? diet / this.count : 0, size: this.count ? size / this.count : 0 });
      if (s.samples.length > 600) s.samples = s.samples.filter((_, k) => k % 2 === 0 || k > 300);
    }
  }

  private milestones(): void {
    const s = this.s;
    const m = s.milestones;
    const hit = (key: string, text: string, important = true) => {
      if (m[key] !== undefined) return;
      m[key] = s.t;
      this.chronicle('milestone', text, W / 2, H / 2, important);
    };
    const living = this.living();
    for (const sp of living) {
      if (sp.seeded || sp.count < 12) continue;
      if (sp.centroid[G.Diet] > 0.6) hit('predator', `The first predators evolve: ${sp.name} hunts other life.`);
      if (sp.centroid[G.Diet] > 0.62 && sp.centroid[G.Size] > 0.68) hit('apex', `An apex predator, ${sp.name}, rules the sea.`);
      if (sp.centroid[G.Social] > 0.7 && sp.count > 60) hit('herd', `${sp.name} gathers in great herds.`);
      if (sp.centroid[G.Size] > 0.8) hit('giant', `Giants appear: ${sp.name}.`);
      if (sp.centroid[G.Heat] < 0.15) hit('cold', `Life conquers the frozen north: ${sp.name}.`, false);
      if (sp.centroid[G.Heat] > 0.85) hit('hot', `Life thrives in the scorching south: ${sp.name}.`, false);
    }
    if (living.length >= 10) hit('ten', 'Ten species share the sea.');
    if (living.length >= 25) hit('twentyfive', 'Twenty-five species: an explosion of life.');
    if (this.count >= 1000) hit('thousand', 'A thousand living creatures.', false);
    if (s.maxGen >= 100) hit('gen100', 'One hundred generations have lived and died.', false);
    if (s.maxGen >= 500) hit('gen500', 'Five hundred generations.', false);
    // Mass extinction: most of life gone within a short time.
    this.popWindow.push(this.count);
    if (this.popWindow.length > 40) this.popWindow.shift();
    const peak = Math.max(...this.popWindow);
    if (peak > 200 && this.count < peak * 0.4 && (m.lastExtinction === undefined || s.t - m.lastExtinction > 60)) {
      m.lastExtinction = s.t;
      m.extinctions = (m.extinctions ?? 0) + 1;
      this.chronicle('disaster', `A mass extinction: ${Math.round((1 - this.count / peak) * 100)}% of all life is lost.`, W / 2, H / 2, true);
    }
    if (this.count === 0 && m.lifeless === undefined) {
      m.lifeless = s.t;
      this.chronicle('disaster', 'The sea falls silent. All life has ended.', W / 2, H / 2, true);
    }
  }

  // --- Powers ------------------------------------------------------------------------------

  power(kind: 'grazer' | 'hunter' | 'bloom' | 'meteor' | 'ice' | 'heat' | 'storm', x: number, y: number): string {
    const s = this.s;
    switch (kind) {
      case 'grazer':
      case 'hunter':
        return this.seedLife(x, y, kind).name;
      case 'bloom':
        s.effects.push({ kind: 'bloom', x, y, r: 260, t0: s.t, t1: s.t + 30 });
        this.chronicle('power', 'A great bloom of algae spreads through the water.', x, y);
        return 'Bloom';
      case 'meteor': {
        let dead = 0;
        for (let i = 0; i < CAP; i++) {
          if (s.alive[i] && Math.hypot(s.x[i] - x, s.y[i] - y) < 230) {
            this.kill(i);
            dead++;
          }
        }
        const r = 230;
        for (let i = 0; i < GW * GH; i++) {
          const cx = (i % GW) * CELL + CELL / 2;
          const cy = ((i / GW) | 0) * CELL + CELL / 2;
          const d = Math.hypot(cx - x, cy - y);
          if (d < r) {
            s.plants[i] = 0;
            // The crater is rich in minerals once it settles.
            s.fert[i] = Math.min(1, s.fert[i] + 0.25 * (1 - d / r));
          }
        }
        s.effects.push({ kind: 'meteor', x, y, r: 230, t0: s.t, t1: s.t + 12 });
        this.chronicle('disaster', `A meteor strikes the sea, killing ${dead.toLocaleString('en-US')} creatures.`, x, y, true);
        this.emit({ type: 'meteor', x, y });
        return 'Meteor';
      }
      case 'ice':
      case 'heat':
        if (s.effects.some((e) => e.kind === 'ice' || e.kind === 'heat')) return '';
        s.effects.push({ kind, x: W / 2, y: H / 2, r: 0, t0: s.t, t1: s.t + 70 });
        this.chronicle('disaster', kind === 'ice' ? 'An ice age begins. The north freezes over.' : 'The world warms. The south becomes a furnace.', x, y, true);
        return kind === 'ice' ? 'Ice age' : 'Heat wave';
      case 'storm':
        if (s.effects.some((e) => e.kind === 'storm')) return '';
        s.effects.push({ kind: 'storm', x: W / 2, y: H / 2, r: 0, t0: s.t, t1: s.t + 40 });
        this.chronicle('power', 'A storm of cosmic rays: mutations run wild.', x, y, true);
        return 'Mutation storm';
    }
  }

  /** The creature nearest to a point. */
  nearest(x: number, y: number, maxD = 40): number {
    let best = -1;
    let bd = maxD;
    for (let i = 0; i < CAP; i++) {
      if (!this.s.alive[i]) continue;
      const d = Math.hypot(this.s.x[i] - x, this.s.y[i] - y) - this.r[i];
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
}
