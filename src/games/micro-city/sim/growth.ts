import { BUILDING, CAPACITY, LOW_CAP, MAX_LEVEL, MILESTONES, POLICIES, ROADS, Zone } from './defs';
import type { City } from './city';
import { FLAG_ABANDONED, FLAG_FIRE, FLAG_FLOODED, FLAG_POWER, FLAG_SEWER, FLAG_WATER } from './state';

/** Land value needed to reach each level. */
const LV_REQ = [0, 0, 22, 36, 52, 66];

// --- Demand ---------------------------------------------------------------------

export function computeDemand(c: City): void {
  const t = c.s.tiles;
  let pop = 0;
  let resCap = 0;
  const cap = [0, 0, 0, 0, 0];
  let eduWorkers = 0;
  for (let i = 0; i < c.n; i++) {
    const z = t.zone[i];
    if (!z || !t.level[i] || t.flags[i] & FLAG_ABANDONED) continue;
    cap[z] += CAPACITY[z][t.level[i]];
    if (z === Zone.Res) {
      pop += t.occ[i];
      resCap += CAPACITY[z][t.level[i]];
      eduWorkers += t.occ[i] * 0.5 * Math.min(1, c.edu[i] / 2);
    }
  }
  let serviceJobs = 0;
  let airport = false;
  for (const b of Object.values(c.s.buildings)) {
    serviceJobs += BUILDING[b.type].jobs ?? 0;
    if (b.type === 'airport') airport = true;
  }
  const workers = pop * 0.5;
  const jobCap = cap[Zone.Com] + cap[Zone.Ind] + cap[Zone.Off] + serviceJobs;
  const vacancy = resCap > 0 ? 1 - pop / resCap : 0;
  const tx = c.s.taxes;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  // Attraction decides how full homes are; vacancy only holds back new building.
  const jobsTerm = clamp((jobCap - workers * 0.92) / Math.max(300, workers));
  let attract = 0.4 + jobsTerm + (c.s.last.happy - 60) / 60 - (tx.res - 9) * 0.04 + (c.s.policies.affordable ? 0.12 : 0);
  if (pop < 300) attract = Math.max(attract, 0.6);
  c.attract = clamp(attract);
  const r = c.attract - Math.max(0, vacancy - 0.08) * 2;
  const shopsWanted = pop * (0.18 + (airport ? 0.03 : 0));
  let cd = (shopsWanted - cap[Zone.Com]) / Math.max(40, shopsWanted) - (tx.com - 9) * 0.05 + (c.s.policies.cardfree ? 0.06 : 0);
  if (pop < 100) cd = Math.min(cd, 0.25);
  const offWanted = eduWorkers * 0.36 * (airport ? 1.3 : 1);
  const indWanted = Math.max(0, workers - eduWorkers * 0.6) * 0.55 * (pop > 150000 ? 0.7 : 1);
  const id = (indWanted - cap[Zone.Ind]) / Math.max(60, indWanted) + 0.1 - (tx.ind - 9) * 0.05 + (c.s.policies.industry ? 0.2 : 0);
  let od = (offWanted - cap[Zone.Off]) / Math.max(40, offWanted) - (tx.off - 9) * 0.05;
  if (c.s.milestone < 2) od = Math.min(od, 0);
  c.s.last.demand = [clamp(r), clamp(cd), clamp(id), clamp(od)];
  c.s.last.pop = Math.round(pop);
}

// --- Growth ------------------------------------------------------------------------

export function runGrowth(c: City): void {
  const t = c.s.tiles;
  const rng = c.rng;
  const [dr, dc, di, dof] = c.s.last.demand;
  const demand = [0, dr, dc, di, dof];
  // Job buildings fill only as far as workers allow.
  let jobCap = 0;
  for (let i = 0; i < c.n; i++) if (t.zone[i] > 1 && t.level[i] && !(t.flags[i] & FLAG_ABANDONED)) jobCap += CAPACITY[t.zone[i]][t.level[i]];
  const workers = c.s.last.pop * 0.5;
  const jobFill = jobCap > 0 ? Math.min(1, (workers / jobCap) * 1.08) : 1;
  const attract = c.attract;
  const cap3 = c.s.policies.highrisecap;
  const epidemic = c.s.disasters.some((d) => d.kind === 'epidemic');
  let grew = 0;

  for (let i = 0; i < c.n; i++) {
    const z = t.zone[i];
    if (!z) continue;
    const f = t.flags[i];
    if (f & FLAG_FIRE) continue;
    const level = t.level[i];
    const hasRoad = c.access[i] >= 0;
    const powered = (f & FLAG_POWER) !== 0;
    const watered = (f & FLAG_WATER) !== 0;
    const dem = demand[z];
    let maxLevel = t.dense[i] ? MAX_LEVEL[z] : Math.min(MAX_LEVEL[z], LOW_CAP);
    if (cap3) maxLevel = Math.min(maxLevel, 3);

    if (f & FLAG_ABANDONED) {
      t.occ[i] = Math.floor(t.occ[i] * 0.5);
      if (powered && hasRoad && c.land[i] > 25 && dem > 0.2 && rng.next() < 0.05) {
        t.flags[i] &= ~FLAG_ABANDONED;
        t.strain[i] = 0;
      }
      continue;
    }
    if (!level) {
      if (hasRoad && powered && dem > 0.05 && rng.next() < 0.04 + dem * 0.15) {
        t.level[i] = 1;
        t.age[i] = 0;
        t.style[i] = rng.int(256);
        t.occ[i] = Math.max(1, Math.round(CAPACITY[z][1] * 0.3));
        grew++;
      }
      continue;
    }
    t.age[i] = Math.min(65000, t.age[i] + 1);
    const struggling = !powered || (level >= 2 && !watered) || c.land[i] < 12 || c.crime[i] > 75 || (z === Zone.Res && c.happy[i] < 22) || !hasRoad;
    t.strain[i] = struggling ? Math.min(255, t.strain[i] + 1) : Math.max(0, t.strain[i] - 1);
    if (t.strain[i] > 8 && rng.next() < 0.25) {
      t.flags[i] |= FLAG_ABANDONED;
      continue;
    }
    const cap = CAPACITY[z][level];
    const occ = t.occ[i];
    if (level < maxLevel && dem > 0.12 && t.age[i] > 10 && occ >= cap * 0.82 && c.land[i] >= LV_REQ[level + 1]
      && watered && (level < 3 || f & FLAG_SEWER) && (z !== Zone.Off || c.edu[i] >= level * 0.55)
      && rng.next() < 0.025 + dem * 0.05) {
      t.level[i] = level + 1;
      t.age[i] = 0;
      onUpgrade(c, i, z, level + 1);
    } else if (dem < -0.55 && level > 1 && rng.next() < 0.015) {
      t.level[i] = level - 1;
    }
    // Occupancy drifts toward a target set by demand and conditions.
    const lv = t.level[i];
    const capNow = CAPACITY[z][lv];
    let target: number;
    if (z === Zone.Res) {
      const fill = Math.max(0.1, Math.min(1, 0.6 + attract + (c.happy[i] - 55) / 100));
      target = capNow * fill;
      if (epidemic) target *= 1 - 0.25 * (1 - Math.min(1, c.cov.health[i]));
    } else target = capNow * Math.max(0.2, jobFill) * (dem < -0.4 ? 0.8 : 1);
    if (f & FLAG_FLOODED) target *= 0.4;
    const diff = target - occ;
    if (Math.abs(diff) >= 0.5) t.occ[i] = Math.max(1, Math.min(capNow, occ + Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff) * 0.3))));
  }
  c.grewThisMonth = grew;
}

function onUpgrade(c: City, i: number, z: number, level: number): void {
  const dName = c.s.districtNames[c.district(i)] ?? 'the city';
  if (z === Zone.Ind && level === 4 && c.rng.next() < 0.35) {
    c.news('news', `Factory announces ${(1000 + c.rng.int(4) * 1000).toLocaleString('en-US')} new jobs in ${dName}.`, i);
  }
  if (z === Zone.Off && level === 5 && !c.s.firsts.hq) {
    c.s.firsts.hq = c.s.tick;
    c.news('news', `A tech company moves its headquarters to ${dName}.`, i);
    c.history('economy', 2, `A tech company moves its headquarters to ${dName}.`, i);
  }
  if (z === Zone.Res && level === 5 && !c.s.firsts.highrise) {
    c.s.firsts.highrise = c.s.tick;
    c.history('skyline', 3, `The first residential high-rise towers over ${dName}.`, i);
  }
  if (z === Zone.Com && level >= 4 && c.rng.next() < 0.15) {
    const shops = ['restaurant', 'bookshop', 'café', 'tailor', 'electronics store', 'sweet shop', 'pharmacy', 'bakery'];
    const nth = ['second', 'third', 'fourth'];
    c.news('story', `A local ${c.rng.pick(shops)} opens its ${c.rng.pick(nth)} location in ${dName}.`, i);
  }
}

// --- Budget -------------------------------------------------------------------------

export function runBudget(c: City): void {
  const t = c.s.tiles;
  let com = 0;
  let ind = 0;
  let off = 0;
  let roads = 0;
  for (let i = 0; i < c.n; i++) {
    if (t.road[i]) roads += ROADS[t.road[i]].upkeep * (c.s.tiles.ter[i] === 0 ? 3 : 1);
    const z = t.zone[i];
    if (!z || !t.level[i]) continue;
    if (z === Zone.Com) com += t.occ[i];
    else if (z === Zone.Ind) ind += t.occ[i];
    else if (z === Zone.Off) off += t.occ[i];
  }
  const tx = c.s.taxes;
  const pop = c.s.last.pop;
  const income: Record<string, number> = {
    Residential: pop * 0.6 * (tx.res / 9) * (c.s.policies.affordable ? 0.85 : 1),
    Commercial: com * 0.6 * (tx.com / 9),
    Industrial: ind * 0.5 * (tx.ind / 9),
    Office: off * 0.8 * (tx.off / 9),
  };
  // Bigger cities cost more per head to run.
  const expense: Record<string, number> = { Roads: roads, Administration: pop * (0.16 + pop * 5e-7) };
  const cats: Record<string, string> = {
    civic: 'Civic', power: 'Utilities', water: 'Utilities', sewage: 'Utilities', garbage: 'Utilities',
    police: 'Police', fire: 'Fire', health: 'Health', education: 'Education', park: 'Parks',
    transit: 'Transit', flood: 'Flood defense', landmark: 'Landmarks',
  };
  // Utilities cost more to run the harder they work (fuel, chemicals).
  const L = c.s.last;
  const load = (pair: [number, number]) => (pair[0] > 0 ? 0.3 + 0.7 * Math.min(1, pair[1] / pair[0]) : 1);
  const loadBy: Record<string, number> = { power: load(L.power), water: load(L.water), sewage: load(L.sewage), garbage: load(L.garbage) };
  for (const b of Object.values(c.s.buildings)) {
    const def = BUILDING[b.type];
    const k = cats[def.cat];
    expense[k] = (expense[k] ?? 0) + def.upkeep * (loadBy[def.cat] ?? 1);
  }
  let pol = 0;
  for (const p of POLICIES) if (c.s.policies[p.id]) pol += (p.cost * pop) / 1000;
  if (pol) expense.Policies = pol;
  const inc = Object.values(income).reduce((a, b) => a + b, 0);
  const exp = Object.values(expense).reduce((a, b) => a + b, 0);
  c.s.money += inc - exp;
  c.s.budget = { income, expense };
  c.s.last.income = inc;
  c.s.last.expense = exp;
}

export function checkMilestones(c: City): void {
  const pop = c.s.last.pop;
  while (c.s.milestone + 1 < MILESTONES.length && pop >= MILESTONES[c.s.milestone + 1].pop) {
    c.s.milestone++;
    const m = MILESTONES[c.s.milestone];
    const name = c.s.settings.name;
    c.history('milestone', 3, `${name} becomes a ${m.name.toLowerCase()}.`);
    c.news('milestone', `${name} is now a ${m.name}! ${m.blurb}`);
    c.emit({ type: 'milestone', index: c.s.milestone });
  }
  for (const n of [1000, 10000, 50000, 100000, 250000, 500000, 1000000, 2000000]) {
    const key = `pop${n}`;
    if (pop >= n && c.s.firsts[key] === undefined) {
      c.s.firsts[key] = c.s.tick;
      c.history('population', n >= 100000 ? 3 : 2, `The population reaches ${n.toLocaleString('en-US')}.`);
    }
  }
}
