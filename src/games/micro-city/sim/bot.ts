import { BUILDING, Road, Ter, Zone } from './defs';
import type { City } from './city';
import { applyZone, buildRoad, placeBuilding, planBuilding, roadPath, unlocked } from './build';

// A simple automatic mayor, used by tests and the debug autoplay: lays out a
// street grid around City Hall, zones blocks by current demand and keeps
// utilities and services ahead of the population. It is deliberately naive.

const BLOCK = 6;

function hall(c: City) {
  return Object.values(c.s.buildings).find((b) => b.type === 'cityhall')!;
}

function count(c: City, type: string): number {
  let n = 0;
  for (const b of Object.values(c.s.buildings)) if (b.type === type) n++;
  return n;
}

function findSpot(c: City, type: string, nx: number, ny: number, maxR = 40): [number, number] | null {
  const def = BUILDING[type];
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = nx + dx - (def.w >> 1);
        const y = ny + dy - (def.h >> 1);
        if (planBuilding(c, type, x, y).ok) return [x, y];
      }
    }
  }
  return null;
}

function tryPlace(c: City, type: string, nx: number, ny: number, reserve = 2000): boolean {
  if (!unlocked(c, type) || c.s.money < BUILDING[type].cost + reserve) return false;
  const spot = findSpot(c, type, nx, ny);
  if (!spot) return false;
  return placeBuilding(c, type, spot[0], spot[1]).ok;
}

/** Build a road line in runs, skipping buildings and rock in the way. */
function line(c: City, path: number[], type: Road): void {
  const t = c.s.tiles;
  let run: number[] = [];
  const flush = () => {
    if (run.length > 1) buildRoad(c, run, type);
    run = [];
  };
  for (const i of path) {
    if (t.bld[i] >= 0 || t.ter[i] === Ter.Rock) flush();
    else run.push(i);
  }
  flush();
}

const clampX = (c: City, x: number) => Math.max(0, Math.min(c.w - 1, x));
const clampY = (c: City, y: number) => Math.max(0, Math.min(c.h - 1, y));

function origin(c: City): [number, number] {
  const h = hall(c);
  return [h.x - 2, h.y + 2];
}

/** Add one more ring of streets around the grid. */
function expand(c: City): void {
  const ring = c.s.streaks.botRing ?? 0;
  if (ring >= 9 || c.s.money < 6000) return;
  const next = ring + 1;
  const [gx, gy] = origin(c);
  const ox = gx - BLOCK * next;
  const oy = gy - BLOCK * next;
  const size = BLOCK * next * 2;
  const avenue = unlocked(c, 'avenue');
  for (let k = 0; k <= next * 2; k++) {
    const type = avenue && k === next ? Road.Avenue : Road.Street;
    const y = oy + k * BLOCK;
    line(c, roadPath(c, c.idx(clampX(c, ox), clampY(c, y)), c.idx(clampX(c, ox + size), clampY(c, y))), type);
    const x = ox + k * BLOCK;
    line(c, roadPath(c, c.idx(clampX(c, x), clampY(c, oy)), c.idx(clampX(c, x), clampY(c, oy + size))), type);
  }
  c.s.streaks.botRing = next;
}

/** Zone the nearest empty block suitable for a zone type. */
function zoneBlock(c: City, zone: Zone): boolean {
  const ring = c.s.streaks.botRing ?? 0;
  const [gx, gy] = origin(c);
  const t = c.s.tiles;
  const blocks: [number, number, number][] = [];
  for (let by = -ring; by < ring; by++) for (let bx = -ring; bx < ring; bx++) blocks.push([bx, by, Math.max(Math.abs(bx + 0.5), Math.abs(by + 0.5))]);
  // Industry goes to the edge, shops and offices to the middle.
  blocks.sort((a, b) => (zone === Zone.Ind ? b[2] - a[2] : a[2] - b[2]));
  for (const [bx, by, dist] of blocks) {
    if (zone === Zone.Res && dist < 1 && ring > 2) continue;
    const tiles: number[] = [];
    let used = false;
    for (let y = gy + by * BLOCK + 1; y < gy + (by + 1) * BLOCK; y++) {
      for (let x = gx + bx * BLOCK + 1; x < gx + (bx + 1) * BLOCK; x++) {
        const i = c.idx(x, y);
        if (i < 0) continue;
        if (t.zone[i]) used = true;
        else if (t.bld[i] < 0 && t.ter[i] !== Ter.Water && t.ter[i] !== Ter.Rock && !t.road[i]) tiles.push(i);
      }
    }
    if (used || tiles.length < 8) continue;
    const dense = (zone === Zone.Res && unlocked(c, 'res-high') && dist < 4) || (zone === Zone.Com && unlocked(c, 'com-high'))
      || (zone === Zone.Off && unlocked(c, 'off-high')) || (zone === Zone.Ind && unlocked(c, 'ind-high')) ? 1 : 0;
    return applyZone(c, tiles, zone, dense).ok;
  }
  return false;
}

/** Upgrade old low-density zones once dense zoning unlocks. */
function densify(c: City): void {
  if (!unlocked(c, 'res-high') || c.s.streaks.botDense === c.s.milestone) return;
  c.s.streaks.botDense = c.s.milestone;
  const t = c.s.tiles;
  for (let i = 0; i < c.n; i++) if (t.zone[i] && !t.dense[i] && t.zone[i] !== Zone.Ind) t.dense[i] = 1;
}

/** A developed lot with weak coverage of a kind. */
function gap(c: City, kind: 'police' | 'fire' | 'health' | 'education' | 'transit' | 'park'): number {
  const t = c.s.tiles;
  let best = -1;
  let worst = Infinity;
  for (let i = 0; i < c.n; i += 3) {
    if (!t.level[i] || t.ter[i] === Ter.Water) continue;
    const v = c.cov[kind][i];
    if (v < worst && v < 0.2) {
      worst = v;
      best = i;
    }
  }
  return best;
}

function pump(c: City): boolean {
  const t = c.s.tiles;
  const h = hall(c);
  let shore = -1;
  let bd = Infinity;
  for (let i = 0; i < c.n; i++) {
    if (t.ter[i] === Ter.Water || t.ter[i] === Ter.Rock || t.bld[i] >= 0) continue;
    let wet = false;
    for (let k = 0; k < 4; k++) if (c.nb[i * 4 + k] >= 0 && t.ter[c.nb[i * 4 + k]] === Ter.Water) wet = true;
    if (!wet) continue;
    const d = Math.hypot(c.x(i) - h.x, c.y(i) - h.y);
    if (d < bd) {
      bd = d;
      shore = i;
    }
  }
  if (shore < 0 || c.s.money < 12000) return false;
  if (tryPlace(c, 'pump', c.x(shore), c.y(shore))) return true;
  line(c, roadPath(c, c.idx(h.x, h.y + 2), shore), Road.Street);
  return tryPlace(c, 'pump', c.x(shore), c.y(shore));
}

export function botTurn(c: City): void {
  const L = c.s.last;
  const h = hall(c);
  const hx = h.x;
  const hy = h.y;
  const t = c.s.tiles;
  const unbuilt = [0, 0, 0, 0, 0];
  for (let i = 0; i < c.n; i++) if (t.zone[i] && !t.level[i]) unbuilt[t.zone[i]]++;
  const keys = ['', 'res-low', 'com-low', 'ind-low', 'off-low'];
  for (const z of [Zone.Res, Zone.Com, Zone.Ind, Zone.Off]) {
    const dem = L.demand[z - 1];
    if (dem > 0.1 && unbuilt[z] < 25 && unlocked(c, keys[z]) && !zoneBlock(c, z)) {
      expand(c);
      break;
    }
  }
  densify(c);

  // Utilities come first.
  const ring = (c.s.streaks.botRing ?? 1) * BLOCK;
  if (L.power[0] < L.power[1] * 1.25 + 20) {
    const choice = ['nuclear', 'solar', 'gas', 'coal'].find((k) => unlocked(c, k) && c.s.money > BUILDING[k].cost + 3000);
    if (choice) tryPlace(c, choice, hx - ring - 4, hy + ring);
  }
  if (L.water[0] < L.water[1] * 1.2 + 100 && !(unlocked(c, 'pump') && pump(c))) tryPlace(c, 'tower', hx + 3, hy - 3);
  if (L.pop > 2000 && L.sewage[0] < L.sewage[1] * 1.15) tryPlace(c, 'treatment', hx + ring + 3, hy + ring);
  if (L.pop > 300 && c.garbageShortage > 0) tryPlace(c, unlocked(c, 'recycling') ? 'recycling' : 'landfill', hx + ring + 4, hy - ring);

  // Services where coverage is thin, one a month while the budget allows.
  const surplus = L.income - L.expense;
  for (const [kind, type, minPop] of [
    ['fire', 'fire', 800], ['police', 'police', 600], ['health', 'clinic', 600], ['education', 'school', 500], ['transit', 'bus', 6000], ['park', 'park', 200],
  ] as const) {
    if (L.pop < minPop || (surplus < BUILDING[type].upkeep && c.s.money < 30000)) continue;
    if (type === 'park' && count(c, 'park') > L.pop / 250) continue;
    const g = gap(c, kind);
    if (g >= 0 && tryPlace(c, type, c.x(g), c.y(g), 8000)) break;
  }
  if (L.pop > 8000 && !count(c, 'highschool')) tryPlace(c, 'highschool', hx + 8, hy + 8);
  if (L.pop > 30000 && !count(c, 'university')) tryPlace(c, 'university', hx - 10, hy - 10);
  if (L.pop > 30000 && count(c, 'hospital') < L.pop / 50000) tryPlace(c, 'hospital', hx + 10, hy - 10);
  if (L.pop > 30000 && count(c, 'metro') < Math.min(12, L.pop / 15000) && c.s.money > 80000) {
    const g = gap(c, 'transit');
    tryPlace(c, 'metro', g >= 0 ? c.x(g) : hx, g >= 0 ? c.y(g) : hy, 40000);
  }

  // Taxes: keep a modest surplus.
  const tx = c.s.taxes;
  const step = (d: number) => {
    tx.res += d;
    tx.com += d;
    tx.ind += d;
    tx.off += d;
  };
  if (c.s.money < 2000 && tx.res < 13) step(1);
  else if (c.s.money > 60000 && tx.res > 8) step(-1);
}
