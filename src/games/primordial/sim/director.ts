import { G, GENES } from './genes';
import { CAP, GH, GW, CELL, H, W, type World } from './world';

// The director plays god in automatic mode. It reads the state of the sea
// and nudges it toward drama: new life when the sea is empty, a meteor when
// one species takes over, hunters when nothing hunts, climate swings to keep
// evolution moving. It also picks interesting creatures for the camera.

export interface DirectorAction {
  power: 'grazer' | 'hunter' | 'bloom' | 'meteor' | 'ice' | 'heat' | 'storm';
  x: number;
  y: number;
  why: string;
}

export class Director {
  private lastAct = -999;
  private lastSeedHunters = -999;
  private lastCamera = 0;

  /** Decide whether to intervene now (called every sim second or so). */
  think(w: World): DirectorAction | null {
    const s = w.s;
    const t = s.t;
    if (t - this.lastAct < 25) return null;
    const living = w.living();
    const pop = w.count;
    const rng = w.rng;
    const act = (a: DirectorAction) => {
      this.lastAct = t;
      return a;
    };
    if (pop < 40) {
      const [x, y] = this.fertileSpot(w);
      return act({ power: 'grazer', x, y, why: 'The sea is almost empty. New life is seeded.' });
    }
    const hunters = living.filter((sp) => sp.centroid[G.Diet] > 0.45 && sp.count > 8);
    if (!hunters.length && t > 150 && t - this.lastSeedHunters > 200 && rng.chance(0.5)) {
      this.lastSeedHunters = t;
      const [x, y] = this.densest(w);
      return act({ power: 'hunter', x, y, why: 'Nothing hunts. Predators are released among the herds.' });
    }
    const top = living.sort((a, b) => b.count - a.count)[0];
    if (top && pop > 500 && top.count > pop * 0.7 && t - (s.milestones.lastExtinction ?? -999) > 200 && rng.chance(0.35)) {
      const [x, y] = this.densest(w, top.id);
      return act({ power: 'meteor', x, y, why: `${top.name} dominates the sea. A meteor falls among them.` });
    }
    if (pop > 1700 && rng.chance(0.3)) {
      return act({ power: rng.chance(0.5) ? 'ice' : 'meteor', x: rng.float(400, W - 400), y: rng.float(300, H - 300), why: 'The sea is crowded. Something has to give.' });
    }
    // Every so often, a nudge to keep things moving.
    if (t - this.lastAct > 80 && rng.chance(0.25)) {
      const pick = rng.weighted<DirectorAction['power']>([['bloom', 3], ['storm', 2], ['ice', 1.2], ['heat', 1.2], ['meteor', 0.8]])!;
      const [x, y] = pick === 'bloom' ? this.barren(w) : [rng.float(300, W - 300), rng.float(250, H - 250)];
      const why: Record<string, string> = {
        bloom: 'A bloom feeds a hungry corner of the sea.',
        storm: 'Cosmic rays rain down. Mutations run wild.',
        ice: 'The world cools into an ice age.',
        heat: 'The world warms.',
        meteor: 'A meteor falls from a clear sky.',
      };
      return act({ power: pick, x, y, why: why[pick] });
    }
    return null;
  }

  /** A creature worth watching: the newest species, a big hunter, or the eldest. */
  pickSubject(w: World, nowMs: number, current: number): number {
    if (current >= 0 && w.s.alive[current] && nowMs - this.lastCamera < 18000) return current;
    this.lastCamera = nowMs;
    const s = w.s;
    const newest = w.living().filter((sp) => sp.count >= 3).sort((a, b) => b.born - a.born)[0];
    const options: [number, number][] = [];
    let bigHunter = -1;
    let bigSize = 0;
    let eldest = -1;
    let eldestAge = 0;
    for (let i = 0; i < CAP; i++) {
      if (!s.alive[i]) continue;
      const o = i * GENES;
      if (s.genes[o + G.Diet] > 0.45 && s.genes[o + G.Size] > bigSize) {
        bigSize = s.genes[o + G.Size];
        bigHunter = i;
      }
      if (s.age[i] > eldestAge) {
        eldestAge = s.age[i];
        eldest = i;
      }
      if (newest && s.species[i] === newest.id && w.rng.chance(0.3)) options.push([i, 3]);
    }
    if (bigHunter >= 0) options.push([bigHunter, 2]);
    if (eldest >= 0) options.push([eldest, 1]);
    return w.rng.weighted(options) ?? -1;
  }

  private fertileSpot(w: World): [number, number] {
    let best = 0;
    let bi = 0;
    for (let i = 0; i < GW * GH; i++) if (w.s.plants[i] > best) {
      best = w.s.plants[i];
      bi = i;
    }
    return [(bi % GW) * CELL + CELL / 2, ((bi / GW) | 0) * CELL + CELL / 2];
  }

  private barren(w: World): [number, number] {
    let worst = Infinity;
    let wi = 0;
    for (let k = 0; k < 200; k++) {
      const i = w.rng.int(GW * GH);
      const v = w.s.plants[i] - w.s.fert[i] * 20;
      if (v < worst) {
        worst = v;
        wi = i;
      }
    }
    return [(wi % GW) * CELL + CELL / 2, ((wi / GW) | 0) * CELL + CELL / 2];
  }

  /** The most crowded spot, optionally for one species. */
  private densest(w: World, species = -1): [number, number] {
    const bins = new Float32Array(12 * 8);
    const s = w.s;
    for (let i = 0; i < CAP; i++) {
      if (!s.alive[i] || (species >= 0 && s.species[i] !== species)) continue;
      bins[Math.min(7, ((s.y[i] / H) * 8) | 0) * 12 + Math.min(11, ((s.x[i] / W) * 12) | 0)]++;
    }
    let bi = 0;
    for (let k = 1; k < bins.length; k++) if (bins[k] > bins[bi]) bi = k;
    return [((bi % 12) + 0.5) * (W / 12), (((bi / 12) | 0) + 0.5) * (H / 8)];
  }
}
