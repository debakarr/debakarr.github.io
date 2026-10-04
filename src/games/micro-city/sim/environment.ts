import { BUILDING, ROADS, Ter, Zone } from './defs';
import type { City } from './city';
import { footprint } from './build';
import { FLAG_ABANDONED, FLAG_POWER, FLAG_SEWER, FLAG_WATER } from './state';

// Pollution, noise, land value, crime and happiness. Happiness is kept as a
// sum of named factors so the city health report can explain itself.

function blur(src: Float32Array, w: number, h: number, passes: number, keep: number): void {
  const tmp = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            s += src[yy * w + xx];
            k++;
          }
        }
        tmp[y * w + x] = s / k;
      }
    }
    for (let i = 0; i < src.length; i++) src[i] = src[i] * keep + tmp[i] * (1 - keep);
  }
}

export function runEnvironment(c: City): void {
  const t = c.s.tiles;
  const w = c.w;
  const h = c.h;
  const air = new Float32Array(c.n);
  const noise = new Float32Array(c.n);
  const green = c.s.policies.green ? 0.7 : 1;
  const indBoost = c.s.policies.industry ? 1.3 : 1;
  for (let i = 0; i < c.n; i++) {
    if (t.zone[i] === Zone.Ind && t.level[i]) {
      air[i] += t.level[i] * 7 * indBoost * green;
      noise[i] += t.level[i] * 5;
    }
    if (t.road[i]) {
      air[i] += (c.flow[i] / 220) * green * (c.s.policies.autonomous ? 0.5 : 1);
      noise[i] += ROADS[t.road[i]].noise * 2 + c.flow[i] / 150;
    }
    if (t.zone[i] === Zone.Com && t.level[i]) noise[i] += t.level[i] * 1.5;
  }
  for (const b of Object.values(c.s.buildings)) {
    const def = BUILDING[b.type];
    if (!def.air && !def.noise) continue;
    const fp = footprint(c, def, b.x, b.y);
    for (const i of fp) {
      air[i] += ((def.air ?? 0) * 4 * green) / fp.length * 4;
      noise[i] += ((def.noise ?? 0) * 4) / fp.length * 4;
    }
  }
  blur(air, w, h, 4, 0.2);
  blur(noise, w, h, 2, 0.35);
  for (let i = 0; i < c.n; i++) {
    const absorb = t.trees[i] * 0.9 + (t.ter[i] === Ter.Water ? 0.6 : 0);
    c.air[i] = Math.max(0, Math.min(100, air[i] * 4 - absorb));
    c.noise[i] = Math.max(0, Math.min(100, noise[i] * 4 - t.trees[i] * 0.8));
  }

  // Landmarks and parks raise nearby land value.
  const bonus = new Float32Array(c.n);
  for (const b of Object.values(c.s.buildings)) {
    const def = BUILDING[b.type];
    if (!def.value) continue;
    const [r, amt] = def.value;
    const cx = b.x + def.w / 2 - 0.5;
    const cy = b.y + def.h / 2 - 0.5;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const i = c.idx(x, y);
        if (i < 0) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r) bonus[i] += amt * (1 - d / (r + 1));
      }
    }
  }
  const waterNear = new Uint8Array(c.n);
  for (let i = 0; i < c.n; i++) {
    if (t.ter[i] !== Ter.Water) continue;
    const x = c.x(i);
    const y = c.y(i);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const j = c.idx(x + dx, y + dy);
      if (j >= 0) waterNear[j] = 1;
    }
  }

  const L = c.s.last;
  const unemployment = L.workers > 0 ? Math.max(0, 1 - L.employed / L.workers) : 0;
  const stadium = Object.values(c.s.buildings).some((b) => b.type === 'stadium') ? 3 : 0;
  const heat = c.s.disasters.some((d) => d.kind === 'heat');
  const epidemic = c.s.disasters.some((d) => d.kind === 'epidemic');
  const highriseCap = c.s.policies.highrisecap ? 3 : 0;
  const taxPenalty = (c.s.taxes.res - 9) * 1.6;
  const sums: Record<string, number> = {};
  let resTotal = 0;
  let happyTotal = 0;
  let airTotal = 0;
  let airCount = 0;

  for (let i = 0; i < c.n; i++) {
    if (t.ter[i] === Ter.Water) {
      c.land[i] = 0;
      continue;
    }
    const d = c.district(i);
    const commute = c.distCommute[d] || 0;
    const access = c.access[i] >= 0 ? 10 : 0;
    let lv = 28 + access + (waterNear[i] ? 9 : 0) + Math.min(6, t.trees[i] * 2) + c.cov.park[i] * 22
      + c.edu[i] * 3 + c.cov.health[i] * 5 + c.cov.police[i] * 4 + c.cov.metro[i] * 10 + c.cov.transit[i] * 3
      + bonus[i] + highriseCap
      - c.air[i] * 0.45 - c.noise[i] * 0.3 - c.crime[i] * 0.25 - c.garbageShortage * 14
      - Math.max(0, commute - 16) * 0.4;
    if (t.flags[i] & FLAG_ABANDONED) lv -= 12;
    c.land[i] = Math.max(0, Math.min(100, lv));

    // Crime grows with density and joblessness; patrols push it down.
    if (t.zone[i] && t.level[i]) {
      const density = Math.min(40, t.occ[i] / 12);
      const cr = 8 + density + unemployment * 45 + (60 - c.land[i]) * 0.25 - c.cov.police[i] * 38;
      c.crime[i] = Math.max(0, Math.min(100, cr));
    } else c.crime[i] = Math.max(0, c.crime[i] * 0.5);

    if (t.zone[i] === Zone.Res && t.level[i] && t.occ[i]) {
      const f = t.flags[i];
      const occ = t.occ[i];
      const parts: [string, number][] = [
        ['health', c.cov.health[i] * 10 - 3],
        ['education', Math.min(3, c.edu[i]) * 3 - 2],
        ['safety', -c.crime[i] * 0.22 + 4],
        ['parks', c.cov.park[i] * 10],
        ['landvalue', (c.land[i] - 45) * 0.15],
        ['commute', -Math.max(0, commute - 16) * 0.6],
        ['air', -c.air[i] * 0.22],
        ['noise', -c.noise[i] * 0.14],
        ['power', f & FLAG_POWER ? 0 : -16],
        ['water', f & FLAG_WATER ? 0 : t.level[i] > 1 ? -14 : -4],
        ['sewage', f & FLAG_SEWER || t.level[i] < 2 ? 0 : -7],
        ['garbage', -c.garbageShortage * 14],
        ['taxes', -taxPenalty],
        ['jobs', -unemployment * 35],
        ['pride', stadium + (c.s.policies.green ? 3 : 0) + (c.s.policies.freetransit ? 2 : 0)],
        ['heat', heat ? -Math.max(0, 8 - t.trees[i] * 2 - c.cov.park[i] * 5) : 0],
        ['disease', epidemic ? -(1 - Math.min(1, c.cov.health[i])) * 12 : 0],
      ];
      let hp = 62;
      for (const [k, v] of parts) {
        hp += v;
        sums[k] = (sums[k] ?? 0) + v * occ;
      }
      c.happy[i] = Math.max(0, Math.min(100, hp));
      resTotal += occ;
      happyTotal += c.happy[i] * occ;
      airTotal += c.air[i] * occ;
      airCount += occ;
    } else c.happy[i] = 0;
  }
  L.happy = resTotal ? happyTotal / resTotal : 60;
  L.air = airCount ? airTotal / airCount : 0;
  const labels: Record<string, string> = {
    health: 'Health care', education: 'Education', safety: 'Safety', parks: 'Parks', landvalue: 'Neighborhood quality',
    commute: 'Commute', air: 'Air pollution', noise: 'Noise', power: 'Power', water: 'Water', sewage: 'Sewage',
    garbage: 'Garbage', taxes: 'Taxes', jobs: 'Jobs', pride: 'Civic pride', heat: 'Heat', disease: 'Disease',
  };
  c.factors = Object.entries(sums)
    .map(([key, v]) => ({ key, label: labels[key], value: resTotal ? v / resTotal : 0 }))
    .filter((f) => Math.abs(f.value) >= 0.5)
    .sort((a, b) => a.value - b.value);
}
