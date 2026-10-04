// Automatic mode: a director that sets the pace, points the camera at
// whatever is most interesting, and now and then plays god (mostly kindly).

import { alive, ERA_INDEX } from './civ';
import { Phase } from './stars';
import { PLANET_STRIDE } from './planets';
import { CELL, GRID, SPAN, type EndgameChoice, type Intervention, type Target, type Universe } from './universe';

export interface DirectorAction {
  /** Index into the UI's speed ladder. */
  speed?: number;
  focus?: { star: number; planet?: number; system: boolean };
  act?: { kind: Intervention; target: Target; why: string };
  /** The director's answer to the Great Filter, when the player has not given one. */
  choose?: Exclude<EndgameChoice, 'undecided'>;
}

export const SPEEDS = [0, 1e3, 1e5, 1e7, 1e8, 1e9];

export class Director {
  private actAt = 0;
  private focusAt = -1e9;
  private focusKey = '';
  private stuck = new Map<number, number>();

  think(u: Universe, now: number): DirectorAction {
    const s = u.s;
    const out: DirectorAction = {};
    const civs = u.aliveCivs().sort((a, b) => b.era - a.era);
    const young = civs.find((c) => c.era <= ERA_INDEX.spaceflight);
    const lifeWorlds = u.lifeWorlds();
    const topStage = lifeWorlds.reduce((m, pid) => Math.max(m, s.ps[pid].life!.stage), 0);

    if (young) out.speed = 1;
    else if (civs.length) out.speed = civs[0].era >= ERA_INDEX.dyson ? 1 : 2;
    else if (topStage >= 3) out.speed = 4;
    else if (s.t < 1500) out.speed = 4;
    else out.speed = lifeWorlds.length ? 4 : 5;

    // The director answers the Great Filter the way it has been playing.
    if (s.found['great-filter'] !== undefined && s.endgame === 'undecided') {
      const pr = s.prof;
      out.choose = pr.destroy > pr.create + pr.observe ? 'threat' : pr.create >= pr.observe ? 'intervene' : 'observe';
    }

    // Camera: hold a subject for a while, then move on.
    if (now - this.focusAt > 14000) {
      const pick = this.subject(u, civs.map((c) => c.planet), lifeWorlds, topStage);
      if (pick && `${pick.star}:${pick.planet}` !== this.focusKey) {
        this.focusKey = `${pick.star}:${pick.planet}`;
        this.focusAt = now;
        out.focus = pick;
      }
    }

    if (now - this.actAt > 22000) {
      const act = this.intervention(u, civs, lifeWorlds);
      if (act) {
        this.actAt = now;
        out.act = act;
      }
    }
    return out;
  }

  /** Something worth looking at: a civilization, the most advanced life, or a bright star. */
  private subject(u: Universe, civHomes: number[], lifeWorlds: number[], topStage: number): DirectorAction['focus'] {
    const s = u.s;
    if (civHomes.length) {
      const pid = civHomes[Math.floor(Math.random() * Math.min(2, civHomes.length))];
      return { star: Math.floor(pid / PLANET_STRIDE), planet: pid, system: true };
    }
    if (lifeWorlds.length) {
      const best = lifeWorlds.filter((pid) => s.ps[pid].life!.stage >= Math.max(1, topStage - 1));
      const pid = best[Math.floor(Math.random() * best.length)];
      return { star: Math.floor(pid / PLANET_STRIDE), planet: pid, system: Math.random() < 0.6 };
    }
    let bright = -1;
    let lum = 0;
    for (let i = 0; i < s.n; i++) {
      if (s.sphase[i] !== Phase.Main && s.sphase[i] !== Phase.Giant) continue;
      const l = u.starLum(i) * (0.5 + Math.random());
      if (l > lum) {
        lum = l;
        bright = i;
      }
    }
    return bright >= 0 ? { star: bright, system: false } : undefined;
  }

  private intervention(u: Universe, civs: ReturnType<Universe['aliveCivs']>, lifeWorlds: number[]): DirectorAction['act'] {
    const s = u.s;
    // As the threat, the director does the culling itself.
    if (s.endgame === 'threat') {
      const mark = civs.find((c) => c.era >= ERA_INDEX.dyson) ?? civs.find((c) => c.era >= ERA_INDEX.interstellar);
      if (mark && u.canIntervene('erase', { civ: mark.id }) === null) {
        return { kind: 'erase', target: { civ: mark.id }, why: `erasing the ${mark.species} before they can light their star` };
      }
    }
    for (const c of civs) {
      const filterKnown = s.found['great-filter'] !== undefined;
      const shieldEarly = s.endgame === 'intervene' && c.era >= ERA_INDEX.spaceflight;
      if (c.protectedUntil < s.t && ((filterKnown && (c.era >= ERA_INDEX.interstellar || shieldEarly)) || ([ERA_INDEX.nuclear, 7, 9].includes(c.era) && Math.random() < 0.5))) {
        return { kind: 'protect', target: { civ: c.id }, why: `shielding the ${c.species} through a dangerous era` };
      }
      if (c.status === 'dark' && Math.random() < 0.6) return { kind: 'knowledge', target: { civ: c.id }, why: `lighting a candle in the ${c.adj} dark age` };
    }
    for (const [key, st] of Object.entries(s.ps)) {
      if (st.ruins?.some((r) => !r.studied)) return { kind: 'study', target: { planet: +key }, why: 'studying the ruins of a fallen civilization' };
    }
    // A promising lifeless world gets a nudge.
    if (s.t > 2500 && lifeWorlds.length < 3) {
      let best = -1;
      let bh = 0.35;
      for (const pid of u.cands) {
        const st = s.ps[pid];
        if (st?.life && st.life.dead < 0) continue;
        const h = u.hab.get(pid) ?? 0;
        if (h > bh) {
          bh = h;
          best = pid;
        }
      }
      if (best >= 0) return { kind: 'seed', target: { planet: best }, why: `seeding ${u.planet(best)!.name}, a promising world` };
    }
    // Life stuck on land for ages gets a shake-up, dinosaur-style.
    for (const pid of lifeWorlds) {
      const b = s.ps[pid].life!;
      if (b.stage !== 3) {
        this.stuck.delete(pid);
        continue;
      }
      const since = this.stuck.get(pid) ?? s.t;
      this.stuck.set(pid, since);
      if (s.t - since > 1800 && Math.random() < 0.3) {
        this.stuck.delete(pid);
        return { kind: 'asteroid', target: { planet: pid }, why: `clearing the way on ${u.planet(pid)!.name}, as an asteroid once did for mammals` };
      }
    }
    // Star formation fading: pour in fresh gas.
    if (s.t > 3000 && u.living < 500 && Math.random() < 0.5) {
      let best = 0;
      let bv = -1;
      for (let i = 0; i < s.gas.length; i++) {
        const x = (i % GRID) * CELL - SPAN / 2;
        const y = Math.floor(i / GRID) * CELL - SPAN / 2;
        if (Math.hypot(x, y) > 700) continue;
        const v = s.gas[i] + Math.random() * 0.2;
        if (v > bv) {
          bv = v;
          best = i;
        }
      }
      const x = (best % GRID) * CELL - SPAN / 2 + CELL / 2;
      const y = Math.floor(best / GRID) * CELL - SPAN / 2 + CELL / 2;
      return { kind: 'matter', target: { x, y }, why: 'feeding a quiet region with fresh gas' };
    }
    if (civs.some((c) => alive(c) && c.era < ERA_INDEX.industry) && Math.random() < 0.25) {
      const c = civs[civs.length - 1];
      return { kind: 'knowledge', target: { civ: c.id }, why: `whispering an idea to the ${c.species}` };
    }
    return undefined;
  }
}
