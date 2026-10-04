import { BUILDING, type CoverageKind } from './defs';
import { COVERAGE_KINDS, type City } from './city';
import { frontage, footprint } from './build';

// Service coverage. Police, fire, health, schools and buses reach lots by
// driving along roads (a station across the river with no bridge covers
// nothing there). Parks, metro walk-sheds and flood defenses cover by distance.

const BY_ROAD: Partial<Record<CoverageKind, boolean>> = { police: true, fire: true, health: true, education: true, transit: true };

export function recomputeCoverage(c: City): void {
  for (const k of COVERAGE_KINDS) c.cov[k].fill(0);
  c.edu.fill(0);
  const t = c.s.tiles;
  const dist = new Int32Array(c.n);
  // Road-based services first reach road tiles, then every lot through its access road.
  const onRoad: Partial<Record<CoverageKind, Float32Array>> = {};
  const eduRoad = new Float32Array(c.n);
  for (const b of Object.values(c.s.buildings)) {
    const def = BUILDING[b.type];
    if (!def.coverage) continue;
    const tiles = footprint(c, def, b.x, b.y);
    for (const cv of def.coverage) {
      const layer = c.cov[cv.kind];
      for (const i of tiles) layer[i] = Math.max(layer[i], cv.strength);
      if (def.edu) for (const i of tiles) c.edu[i] = Math.max(c.edu[i], def.edu);
      if (BY_ROAD[cv.kind]) {
        const road = (onRoad[cv.kind] ??= new Float32Array(c.n));
        const start = frontage(c, tiles);
        dist.fill(-1);
        const queue = [...start];
        for (const s of start) dist[s] = 0;
        for (let q = 0; q < queue.length; q++) {
          const cur = queue[q];
          const d = dist[cur];
          const v = cv.strength * Math.pow(1 - d / (cv.radius + 1), 0.7);
          if (v > road[cur]) road[cur] = v;
          if (def.edu) {
            const e = def.edu * Math.min(1, v * 1.6);
            if (e > eduRoad[cur]) eduRoad[cur] = e;
          }
          if (d >= cv.radius) continue;
          for (let k = 0; k < 4; k++) {
            const nb = c.nb[cur * 4 + k];
            if (nb >= 0 && t.road[nb] && dist[nb] < 0) {
              dist[nb] = d + 1;
              queue.push(nb);
            }
          }
        }
      } else {
        const cx = b.x + def.w / 2 - 0.5;
        const cy = b.y + def.h / 2 - 0.5;
        const r = cv.radius;
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
          for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            const i = c.idx(x, y);
            if (i < 0) continue;
            const d = Math.hypot(x - cx, y - cy);
            if (d > r) continue;
            const v = cv.strength * (1 - d / (r + 1));
            if (v > layer[i]) layer[i] = v;
          }
        }
      }
    }
  }
  for (const [kind, road] of Object.entries(onRoad) as [CoverageKind, Float32Array][]) {
    const layer = c.cov[kind];
    for (let i = 0; i < c.n; i++) {
      const a = c.access[i];
      if (a >= 0 && road[a] > layer[i]) layer[i] = road[a];
    }
  }
  for (let i = 0; i < c.n; i++) {
    const a = c.access[i];
    if (a >= 0 && eduRoad[a] > c.edu[i]) c.edu[i] = eduRoad[a];
  }
  c.dirtyCov = false;
}
