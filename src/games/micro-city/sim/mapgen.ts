import { Noise2D } from '../../shared/noise';
import { hashString, Rng } from '../../shared/rng';
import { BUILDING, Road, Ter } from './defs';
import type { CityState, MapKind, Settings, Tiles } from './state';

export const SAVE_VERSION = 1;

export function emptyTiles(n: number): Tiles {
  return {
    ter: new Uint8Array(n),
    elev: new Uint8Array(n),
    trees: new Uint8Array(n),
    road: new Uint8Array(n),
    zone: new Uint8Array(n),
    dense: new Uint8Array(n),
    level: new Uint8Array(n),
    occ: new Uint16Array(n),
    style: new Uint8Array(n),
    age: new Uint16Array(n),
    bld: new Int32Array(n).fill(-1),
    flags: new Uint8Array(n),
    strain: new Uint8Array(n),
  };
}

export function mapSeed(s: Pick<Settings, 'seed' | 'size' | 'map'>): number {
  return hashString(`${s.seed.trim().toLowerCase()}|${s.size}|${s.map}`);
}

/** Procedural terrain: water by map kind, then hills, forests and rock. */
export function generateTerrain(settings: Settings): { tiles: Tiles; start: number } {
  const size = settings.size;
  const n = size * size;
  const rng = new Rng(mapSeed(settings));
  const tiles = emptyTiles(n);
  const nE = new Noise2D(rng.fork('elev'));
  const nF = new Noise2D(rng.fork('forest'));
  const nW = new Noise2D(rng.fork('water'));
  const kind: MapKind = settings.map;
  const water = new Uint8Array(n);
  const elev = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    elev[i] = 0.55 + nE.fbm(x * 0.035, y * 0.035, 4) * 0.35;
  }

  const carveRiver = (horizontal: boolean, width: number) => {
    let pos = size * rng.float(0.35, 0.65);
    for (let t = 0; t < size; t++) {
      pos += nW.get(t * 0.06, 3.7) * 1.4;
      pos = Math.max(size * 0.15, Math.min(size * 0.85, pos));
      const wdt = width + (nW.get(t * 0.1, 9.1) + 1) * 0.9;
      for (let o = -Math.ceil(wdt + 8); o <= Math.ceil(wdt + 8); o++) {
        const p = Math.round(pos + o);
        if (p < 0 || p >= size) continue;
        const i = horizontal ? p * size + t : t * size + p;
        const d = Math.abs(pos - p);
        if (d <= wdt / 2) water[i] = 1;
        // A floodplain: land near the river sits low.
        else elev[i] = Math.min(elev[i], 0.22 + (d - wdt / 2) * 0.045);
      }
    }
  };

  if (kind === 'river' || kind === 'valley') carveRiver(rng.chance(0.5), kind === 'valley' ? 2.5 : 3.2);
  if (kind === 'coast') {
    const east = rng.chance(0.5);
    for (let i = 0; i < n; i++) {
      const x = i % size;
      const y = (i / size) | 0;
      const edge = size * 0.74 + nW.fbm(y * 0.05, 1.3, 3) * size * 0.08;
      const xx = east ? x : size - 1 - x;
      if (xx > edge) water[i] = 1;
      else elev[i] = Math.min(elev[i], 0.2 + (edge - xx) * 0.03);
    }
    // A small river joins the sea.
    carveRiver(true, 1.6);
  }
  if (kind === 'lakes') {
    const k = rng.range(3, 5);
    for (let l = 0; l < k; l++) {
      const cx = rng.float(0.15, 0.85) * size;
      const cy = rng.float(0.15, 0.85) * size;
      const r = rng.float(4, 9);
      for (let i = 0; i < n; i++) {
        const x = i % size;
        const y = (i / size) | 0;
        const d = Math.hypot(x - cx, y - cy) + nW.get(x * 0.2, y * 0.2) * 2;
        if (d < r) water[i] = 1;
        else if (d < r + 6) elev[i] = Math.min(elev[i], 0.25 + (d - r) * 0.04);
      }
    }
  }
  if (kind === 'island') {
    for (let i = 0; i < n; i++) {
      const x = i % size;
      const y = (i / size) | 0;
      const d = Math.hypot(x - size / 2, y - size / 2) / (size / 2) + nW.fbm(x * 0.06, y * 0.06, 3) * 0.18;
      if (d > 0.78) water[i] = 1;
      else elev[i] = Math.min(elev[i], 0.2 + (0.78 - d) * 1.2);
    }
  }
  if (kind === 'valley') {
    for (let i = 0; i < n; i++) {
      const y = (i / size) | 0;
      const x = i % size;
      const band = Math.min(y, size - 1 - y, x, size - 1 - x) / size;
      if (band < 0.14) elev[i] += (0.14 - band) * 4;
    }
  }

  for (let i = 0; i < n; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    if (water[i]) {
      tiles.ter[i] = Ter.Water;
      tiles.elev[i] = 20;
      continue;
    }
    const e = Math.max(0, Math.min(1, elev[i]));
    tiles.elev[i] = Math.round(40 + e * 215);
    let nearWater = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < size && yy < size && water[yy * size + xx]) nearWater = true;
    }
    const f = nF.fbm(x * 0.07, y * 0.07, 3);
    if (e > 0.86) tiles.ter[i] = Ter.Rock;
    else if (nearWater && (kind === 'coast' || kind === 'island') && e < 0.45) tiles.ter[i] = Ter.Sand;
    else if (f > 0.22) {
      tiles.ter[i] = Ter.Forest;
      tiles.trees[i] = f > 0.38 ? 3 : 2;
    } else {
      tiles.ter[i] = Ter.Grass;
      if (f > 0.08 && rng.chance(0.35)) tiles.trees[i] = 1;
    }
    tiles.style[i] = rng.int(256);
  }

  // Start near the middle on dry, open ground, a little away from the water.
  const buildable = (i: number) => tiles.ter[i] === Ter.Grass || tiles.ter[i] === Ter.Forest || tiles.ter[i] === Ter.Sand;
  let start = (size >> 1) * size + (size >> 1);
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    if (x < 6 || y < 6 || x > size - 8 || y > size - 8) continue;
    let ok = true;
    for (let dy = -2; dy <= 3 && ok; dy++) for (let dx = -2; dx <= 3 && ok; dx++) if (!buildable((y + dy) * size + x + dx) || tiles.ter[(y + dy) * size + x + dx] === Ter.Sand) ok = false;
    if (!ok) continue;
    let waterNear = 99;
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < size && yy < size && water[yy * size + xx]) waterNear = Math.min(waterNear, Math.abs(dx) + Math.abs(dy));
      }
    }
    const center = -Math.hypot(x - size / 2, y - size / 2) * 0.6;
    const score = center + (waterNear < 99 ? -Math.abs(waterNear - 7) : -8) + rng.next();
    if (score > best) {
      best = score;
      start = i;
    }
  }
  return { tiles, start };
}

export function newCityState(settings: Settings): CityState {
  const { tiles, start } = generateTerrain(settings);
  const size = settings.size;
  const state: CityState = {
    version: SAVE_VERSION,
    settings: { ...settings },
    tick: 0,
    rng: mapSeed(settings) ^ 0x5bd1e995,
    nextId: 1,
    tiles,
    buildings: {},
    money: 60000,
    taxes: { res: 9, com: 9, ind: 9, off: 9 },
    policies: {},
    milestone: 0,
    history: [],
    news: [],
    samples: [],
    districtNames: {},
    firsts: {},
    budget: { income: {}, expense: {} },
    streaks: {},
    disasters: [],
    last: {
      pop: 0, workers: 0, jobs: 0, employed: 0, happy: 60, commute: 0, transitShare: 0, air: 0, traffic: 0,
      power: [0, 0], water: [0, 0], sewage: [0, 0], garbage: [0, 0], demand: [0.8, 0.4, 0.3, 0], income: 0, expense: 0,
    },
    challengeDone: -1,
  };
  // City hall with a first street running past it.
  const sx = start % size;
  const sy = (start / size) | 0;
  const id = state.nextId++;
  state.buildings[id] = { id, type: 'cityhall', x: sx, y: sy, built: 0 };
  const def = BUILDING.cityhall;
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const i = (sy + dy) * size + sx + dx;
      tiles.bld[i] = id;
      tiles.trees[i] = 0;
      if (tiles.ter[i] === 3) tiles.ter[i] = 2;
    }
  }
  const roadY = sy + def.h;
  for (let x = sx - 6; x <= sx + 7; x++) {
    const i = roadY * size + x;
    if (x < 0 || x >= size || tiles.ter[i] === 0 || tiles.ter[i] === 4 || tiles.bld[i] >= 0) continue;
    tiles.road[i] = Road.Street;
    tiles.trees[i] = 0;
  }
  return state;
}
