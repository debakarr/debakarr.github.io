import { BUILDING, CAPACITY, Zone } from './defs';
import type { City } from './city';
import { frontage, footprint } from './build';
import { FLAG_POWER, FLAG_SEWER, FLAG_WATER } from './state';

// Utilities travel along the road network: every road-connected component is
// one grid for power, water and sewage. Lots connect to the nearest road
// within two tiles.

export interface Grid {
  power: number;
  powerUse: number;
  water: number;
  waterUse: number;
  sewage: number;
  sewageUse: number;
}

export function recomputeNetworks(c: City): void {
  const t = c.s.tiles;
  const comp = c.roadComp;
  comp.fill(-1);
  let next = 0;
  const stack: number[] = [];
  for (let i = 0; i < c.n; i++) {
    if (!t.road[i] || comp[i] >= 0) continue;
    comp[i] = next;
    stack.push(i);
    while (stack.length) {
      const cur = stack.pop()!;
      for (let d = 0; d < 4; d++) {
        const nb = c.nb[cur * 4 + d];
        if (nb >= 0 && t.road[nb] && comp[nb] < 0) {
          comp[nb] = next;
          stack.push(nb);
        }
      }
    }
    next++;
  }
  // Lot access: nearest road within 3 steps.
  const access = c.access;
  access.fill(-1);
  const dist = new Uint8Array(c.n).fill(255);
  const queue: number[] = [];
  for (let i = 0; i < c.n; i++) {
    if (t.road[i]) {
      access[i] = i;
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q];
    if (dist[cur] >= 3) continue;
    for (let d = 0; d < 4; d++) {
      const nb = c.nb[cur * 4 + d];
      if (nb < 0 || dist[nb] !== 255 || t.road[nb]) continue;
      dist[nb] = dist[cur] + 1;
      access[nb] = access[cur];
      queue.push(nb);
    }
  }
  c.dirtyNet = false;
}

/** The road component a building plugs into. */
export function buildingComp(c: City, id: number): number {
  const b = c.s.buildings[id];
  if (!b) return -1;
  const tiles = footprint(c, BUILDING[b.type], b.x, b.y);
  const front = frontage(c, tiles);
  if (front.length) return c.roadComp[front[0]];
  for (const i of tiles) if (c.access[i] >= 0) return c.roadComp[c.access[i]];
  return -1;
}

/** Monthly utility balance: decides which lots have power, water and sewers. */
export function runUtilities(c: City): void {
  const t = c.s.tiles;
  const grids = new Map<number, Grid>();
  const grid = (k: number) => {
    let gr = grids.get(k);
    if (!gr) grids.set(k, (gr = { power: 0, powerUse: 0, water: 0, waterUse: 0, sewage: 0, sewageUse: 0 }));
    return gr;
  };
  let garbageCap = 0;
  let incinerator = 0;
  for (const b of Object.values(c.s.buildings)) {
    const def = BUILDING[b.type];
    const k = buildingComp(c, b.id);
    garbageCap += def.garbage ?? 0;
    if (def.id === 'incinerator') incinerator++;
    if (k < 0) continue;
    const gr = grid(k);
    gr.power += def.power ?? 0;
    gr.water += def.water ?? 0;
    gr.sewage += def.sewage ?? 0;
    gr.powerUse += (def.jobs ?? 0) * 0.006;
  }
  // Demand from lots.
  let garbageUse = 0;
  for (let i = 0; i < c.n; i++) {
    const z = t.zone[i];
    if (!z || !t.level[i]) continue;
    const a = c.access[i];
    if (a < 0) continue;
    const gr = grid(c.roadComp[a]);
    const occ = t.occ[i] || CAPACITY[z][t.level[i]] * 0.3;
    const res = z === Zone.Res;
    gr.powerUse += occ * (res ? 0.004 : z === Zone.Ind ? 0.012 : 0.007);
    gr.waterUse += occ * (res ? 1 : z === Zone.Ind ? 0.9 : 0.5);
    gr.sewageUse += occ * (res ? 1 : 0.6);
    garbageUse += occ * (res ? 1 : 0.6);
  }
  if (c.s.policies.recycle) garbageUse *= 0.75;
  if (c.s.disasters.some((d) => d.kind === 'heat')) for (const gr of grids.values()) gr.powerUse *= 1.15;
  let pS = 0, pU = 0, wS = 0, wU = 0, sS = 0, sU = 0;
  for (const gr of grids.values()) {
    pS += gr.power;
    pU += gr.powerUse;
    wS += gr.water;
    wU += gr.waterUse;
    sS += gr.sewage;
    sU += gr.sewageUse;
  }
  // A drought halves water pumped from rivers and lakes.
  const drought = c.s.disasters.some((d) => d.kind === 'drought');
  for (let i = 0; i < c.n; i++) {
    t.flags[i] &= ~(FLAG_POWER | FLAG_WATER | FLAG_SEWER);
    const isLot = t.zone[i] > 0 || t.bld[i] >= 0;
    if (!isLot) continue;
    const a = c.access[i];
    let k = a >= 0 ? c.roadComp[a] : -1;
    if (k < 0 && t.bld[i] >= 0) k = buildingComp(c, t.bld[i]);
    const gr = k >= 0 ? grids.get(k) : undefined;
    if (!gr) continue;
    const pick = (t.style[i] + 0.5) / 256;
    const water = drought ? gr.water * 0.55 : gr.water;
    if (gr.power > 0 && pick <= gr.power / Math.max(1, gr.powerUse)) t.flags[i] |= FLAG_POWER;
    if (water > 0 && pick <= water / Math.max(1, gr.waterUse)) t.flags[i] |= FLAG_WATER;
    if (gr.sewage > 0 && pick <= gr.sewage / Math.max(1, gr.sewageUse)) t.flags[i] |= FLAG_SEWER;
  }
  const L = c.s.last;
  L.power = [Math.round(pS), Math.round(pU)];
  L.water = [Math.round(drought ? wS * 0.55 : wS), Math.round(wU)];
  L.sewage = [Math.round(sS), Math.round(sU)];
  L.garbage = [Math.round(garbageCap), Math.round(garbageUse)];
  // Small towns can live with a few bins; garbage only bites past a few hundred people.
  c.garbageShortage = garbageUse > 400 ? Math.max(0, 1 - garbageCap / garbageUse) * Math.min(1, (garbageUse - 400) / 1500) : 0;
  c.incinerators = incinerator;
}
