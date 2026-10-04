import { BUILDING, ROADS, Zone } from './defs';
import type { City } from './city';
import { FLAG_FLOODED } from './state';

// A coarse four-step travel model. The map is cut into districts; workers in
// each district are sent to jobs in others with a gravity model over road
// travel time, loaded onto the shortest paths, and the resulting congestion
// slows the roads next month. This is why everyone ends up on one road.

/** Binary min-heap over typed arrays (lazy deletion: items may repeat). */
class Heap {
  items: Int32Array;
  pri: Float32Array;
  size = 0;
  /** Priority of the item last popped, to skip stale entries. */
  lastPri = 0;
  constructor(cap: number) {
    this.items = new Int32Array(cap);
    this.pri = new Float32Array(cap);
  }
  push(item: number, p: number): void {
    if (this.size === this.items.length) {
      const items = new Int32Array(this.size * 2);
      const pri = new Float32Array(this.size * 2);
      items.set(this.items);
      pri.set(this.pri);
      this.items = items;
      this.pri = pri;
    }
    const { items, pri } = this;
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= p) break;
      items[i] = items[parent];
      pri[i] = pri[parent];
      i = parent;
    }
    items[i] = item;
    pri[i] = p;
  }
  pop(): number {
    const { items, pri } = this;
    const top = items[0];
    this.lastPri = pri[0];
    const n = --this.size;
    if (n > 0) {
      const item = items[n];
      const p = pri[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && pri[r] < pri[l] ? r : l;
        if (pri[m] >= p) break;
        items[i] = items[m];
        pri[i] = pri[m];
        i = m;
      }
      items[i] = item;
      pri[i] = p;
    }
    return top;
  }
}

export function roadCapacity(c: City, i: number): number {
  let cap = ROADS[c.s.tiles.road[i]].capacity;
  if (c.s.policies.smarttraffic) cap *= 1.15;
  if (c.s.policies.autonomous) cap *= 1.4;
  if (c.s.policies.cardfree) cap *= 0.9;
  return cap;
}

export function runTraffic(c: City): void {
  const t = c.s.tiles;
  const D = c.dw * c.dh;
  const workers = new Float64Array(D);
  const jobs = new Float64Array(D);
  const shops = new Float64Array(D);
  const pop = new Float64Array(D);
  const wx = new Float64Array(D);
  const wy = new Float64Array(D);
  const wsum = new Float64Array(D);
  const busO = new Float64Array(D);
  const metroO = new Float64Array(D);
  const resCount = new Float64Array(D);
  const busD = new Float64Array(D);
  const metroD = new Float64Array(D);
  const jobCount = new Float64Array(D);

  for (let i = 0; i < c.n; i++) {
    const z = t.zone[i];
    const occ = t.occ[i];
    if (!z || !occ) continue;
    const d = c.district(i);
    const weight = occ;
    wx[d] += c.x(i) * weight;
    wy[d] += c.y(i) * weight;
    wsum[d] += weight;
    if (z === Zone.Res) {
      workers[d] += occ * 0.5;
      pop[d] += occ;
      busO[d] += c.cov.transit[i] * occ;
      metroO[d] += c.cov.metro[i] * occ;
      resCount[d] += occ;
    } else {
      jobs[d] += occ;
      if (z === Zone.Com) shops[d] += occ;
      busD[d] += c.cov.transit[i] * occ;
      metroD[d] += c.cov.metro[i] * occ;
      jobCount[d] += occ;
    }
  }
  for (const b of Object.values(c.s.buildings)) {
    const def = BUILDING[b.type];
    if (!def.jobs) continue;
    const i = c.idx(b.x, b.y);
    const d = c.district(i);
    jobs[d] += def.jobs;
    jobCount[d] += def.jobs;
    wx[d] += b.x * def.jobs;
    wy[d] += b.y * def.jobs;
    wsum[d] += def.jobs;
  }
  for (let d = 0; d < D; d++) {
    if (resCount[d]) {
      busO[d] /= resCount[d];
      metroO[d] /= resCount[d];
    }
    if (jobCount[d]) {
      busD[d] /= jobCount[d];
      metroD[d] /= jobCount[d];
    }
  }

  // Each district's "front door" on the road network.
  const centroid = new Int32Array(D).fill(-1);
  for (let d = 0; d < D; d++) {
    if (!wsum[d]) continue;
    const cx = wx[d] / wsum[d];
    const cy = wy[d] / wsum[d];
    let best = -1;
    let bd = Infinity;
    const x0 = (d % c.dw) * c.dsz - 2;
    const y0 = ((d / c.dw) | 0) * c.dsz - 2;
    for (let y = y0; y < y0 + c.dsz + 4; y++) {
      for (let x = x0; x < x0 + c.dsz + 4; x++) {
        const i = c.idx(x, y);
        if (i < 0 || !t.road[i]) continue;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist < bd) {
          bd = dist;
          best = i;
        }
      }
    }
    centroid[d] = best;
  }

  // Road travel times from last month's congestion.
  for (let i = 0; i < c.n; i++) {
    if (!t.road[i]) {
      c.roadTime[i] = 0;
      continue;
    }
    const base = ROADS[t.road[i]].time;
    const vc = c.flow[i] / roadCapacity(c, i);
    c.roadTime[i] = base * Math.min(8, 1 + 0.15 * Math.pow(vc, 4)) * (t.flags[i] & FLAG_FLOODED ? 5 : 1);
  }

  let totalWorkers = 0;
  let totalJobs = 0;
  for (let d = 0; d < D; d++) {
    totalWorkers += workers[d];
    totalJobs += jobs[d];
  }
  const employRate = totalWorkers > 0 ? Math.min(1, totalJobs / totalWorkers) : 0;
  const newFlow = new Float32Array(c.n);
  const time = new Float32Array(c.n);
  const prev = new Int32Array(c.n);
  const stamp = new Int32Array(c.n);
  let gen = 0;
  const heap = new Heap(4096);
  let commuteTotal = 0;
  let tripsTotal = 0;
  let transitTotal = 0;
  const free = c.s.policies.freetransit ? 0.1 : 0;
  const carfree = c.s.policies.cardfree ? 0.1 : 0;

  for (let o = 0; o < D; o++) {
    c.distCommute[o] = 0;
    c.distTransit[o] = 0;
    if (workers[o] < 1 && pop[o] < 1) continue;
    const src = centroid[o];
    if (src < 0) continue;
    gen++;
    heap.size = 0;
    stamp[src] = gen;
    time[src] = 0;
    prev[src] = -1;
    heap.push(src, 0);
    while (heap.size) {
      const cur = heap.pop();
      const tc = time[cur];
      if (heap.lastPri > tc) continue;
      for (let k = 0; k < 4; k++) {
        const nb = c.nb[cur * 4 + k];
        if (nb < 0 || !t.road[nb]) continue;
        const nt = tc + c.roadTime[nb];
        if (stamp[nb] !== gen || nt < time[nb]) {
          stamp[nb] = gen;
          time[nb] = nt;
          prev[nb] = cur;
          heap.push(nb, nt);
        }
      }
    }
    const route = (dest: number, vehicles: number) => {
      let cur = dest;
      let guard = 0;
      while (cur >= 0 && cur !== src && guard++ < 4000) {
        newFlow[cur] += vehicles;
        cur = prev[cur];
      }
      if (cur === src) newFlow[src] += vehicles;
    };
    // Commuting.
    let wSum = 0;
    const weights: [number, number][] = [];
    for (let d = 0; d < D; d++) {
      if (!jobs[d] || centroid[d] < 0) continue;
      const dest = centroid[d];
      if (stamp[dest] !== gen) continue;
      const tt = d === o ? 2 : time[dest];
      const wgt = jobs[d] * Math.exp(-0.065 * tt);
      weights.push([d, wgt]);
      wSum += wgt;
    }
    let cSum = 0;
    let tSum = 0;
    let trSum = 0;
    if (wSum > 0 && workers[o] > 0) {
      for (const [d, wgt] of weights) {
        const trips = workers[o] * employRate * (wgt / wSum);
        const dest = centroid[d];
        const carTime = (d === o ? 3 : time[dest]) + 6;
        const dist = Math.hypot(c.x(dest) - c.x(src), c.y(dest) - c.y(src));
        const bus = busO[o] * busD[d] * 0.5;
        const metro = metroO[o] * metroD[d] * 0.8;
        let share = Math.max(bus, metro) + (bus || metro ? free : 0) + carfree * Math.min(1, pop[o] / 4000);
        share = Math.min(0.85, share);
        const transitTime = 9 + dist * (metro > bus ? 0.05 : 0.12) * (1 + Math.min(1, c.congestion[dest] * 0.5));
        if (d !== o) route(dest, trips * (1 - share) * 0.55);
        cSum += trips * ((1 - share) * carTime + share * transitTime);
        tSum += trips;
        trSum += trips * share;
      }
    }
    // Shopping and errands load the roads too.
    let sSum = 0;
    for (let d = 0; d < D; d++) if (shops[d] && centroid[d] >= 0 && stamp[centroid[d]] === gen) sSum += shops[d] * Math.exp(-0.08 * time[centroid[d]]);
    if (sSum > 0) {
      for (let d = 0; d < D; d++) {
        if (!shops[d] || d === o || centroid[d] < 0 || stamp[centroid[d]] !== gen) continue;
        const trips = pop[o] * 0.12 * (shops[d] * Math.exp(-0.08 * time[centroid[d]]) / sSum);
        route(centroid[d], trips * 0.5);
      }
    }
    if (tSum > 0) {
      c.distCommute[o] = cSum / tSum;
      c.distTransit[o] = trSum / tSum;
      commuteTotal += cSum;
      tripsTotal += tSum;
      transitTotal += trSum;
    }
  }

  let weighted = 0;
  let flowSum = 0;
  for (let i = 0; i < c.n; i++) {
    if (!t.road[i]) {
      c.flow[i] = 0;
      c.congestion[i] = 0;
      continue;
    }
    c.flow[i] = c.flow[i] * 0.35 + newFlow[i] * 0.65;
    c.congestion[i] = c.flow[i] / roadCapacity(c, i);
    weighted += c.congestion[i] * c.flow[i];
    flowSum += c.flow[i];
  }
  c.s.last.commute = tripsTotal ? commuteTotal / tripsTotal : 0;
  c.s.last.transitShare = tripsTotal ? transitTotal / tripsTotal : 0;
  c.s.last.traffic = flowSum ? Math.min(1.5, weighted / flowSum) : 0;
  c.s.last.workers = Math.round(totalWorkers);
  c.s.last.jobs = Math.round(totalJobs);
  c.s.last.employed = Math.round(Math.min(totalWorkers, totalJobs));
}
