import { Grid } from '../core/hex';
import { artifactName, makeLanguage, peopleName, placeName, type Language } from '../core/names';
import { Noise2D } from '../../shared/noise';
import { hashString, Rng } from '../../shared/rng';
import { F, R, Relief, T } from '../data/terrain';
import type { MapSize, MapType, NaturalWonder, Region, River, Ruin, Settings, WorldMap } from './state';
import { baseYield, canSettle, isLand, isWater, siteInfo } from './tiles';

export const MAP_DIMS: Record<MapSize, [number, number]> = {
  small: [54, 34],
  standard: [70, 44],
  large: [90, 56],
};

const LAND_FRACTION: Record<MapType, number> = {
  continents: 0.38,
  pangaea: 0.42,
  archipelago: 0.27,
  lakes: 0.5,
};

const gridCache = new Map<string, Grid>();
export function gridFor(w: number, h: number): Grid {
  const key = `${w}x${h}`;
  let g = gridCache.get(key);
  if (!g) {
    g = new Grid(w, h);
    gridCache.set(key, g);
  }
  return g;
}

export interface WorldGen {
  map: WorldMap;
  regions: Region[];
  rivers: River[];
  wonders: NaturalWonder[];
  ruins: Ruin[];
  starts: number[];
  worldLang: Language;
}

/** A shareable code that pins down the exact world: seed/size/type/rivals. */
export function worldCode(s: Pick<Settings, 'seed' | 'size' | 'mapType' | 'rivals'>): string {
  return `${s.seed.trim()}/${s.size}/${s.mapType}/${s.rivals}`;
}

export function parseWorldCode(code: string): Partial<Settings> | null {
  const parts = code.trim().split('/');
  if (parts.length !== 4) return null;
  const [seed, size, mapType, rivals] = parts;
  const n = Number(rivals);
  if (!seed || !(size in MAP_DIMS) || !(mapType in LAND_FRACTION) || !(n >= 2 && n <= 7)) return null;
  return { seed, size: size as MapSize, mapType: mapType as MapType, rivals: n };
}

export function worldSeed(s: Pick<Settings, 'seed' | 'size' | 'mapType' | 'rivals'>): number {
  return hashString(`${s.seed.trim().toLowerCase()}|${s.size}|${s.mapType}|${s.rivals}`);
}

export function emptyMap(w: number, h: number): WorldMap {
  const n = w * h;
  return {
    w,
    h,
    terrain: new Uint8Array(n),
    relief: new Uint8Array(n),
    feature: new Uint8Array(n),
    elevation: new Uint8Array(n),
    river: new Uint8Array(n),
    riverTo: new Int32Array(n).fill(-1),
    riverId: new Int16Array(n).fill(-1),
    resource: new Uint8Array(n),
    wonder: new Int8Array(n).fill(-1),
    region: new Int16Array(n).fill(-1),
    owner: new Int16Array(n).fill(-1),
    cityOf: new Int32Array(n).fill(-1),
    improvement: new Uint8Array(n),
    road: new Uint8Array(n),
    cityAt: new Int32Array(n).fill(-1),
    ruinAt: new Int32Array(n).fill(-1),
  };
}

export function generateWorld(settings: Settings): WorldGen {
  const rng = new Rng(worldSeed(settings));
  const [w, h] = MAP_DIMS[settings.size];
  const grid = gridFor(w, h);
  const map = emptyMap(w, h);
  const n = w * h;
  const pw = grid.pixelWidth(1);

  const nElev = new Noise2D(rng.fork('elev'));
  const nRidge = new Noise2D(rng.fork('ridge'));
  const nMoist = new Noise2D(rng.fork('moist'));
  const nTemp = new Noise2D(rng.fork('temp'));
  const nFeat = new Noise2D(rng.fork('feat'));

  // --- Elevation -----------------------------------------------------------
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [px, py] = grid.center(i, 1);
    nx[i] = px / pw;
    ny[i] = py / pw;
  }
  const hn = grid.pixelHeight(1) / pw;

  type Blob = { x: number; y: number; r: number; s: number };
  const blobs: Blob[] = [];
  const type = settings.mapType;
  if (type === 'continents') {
    const k = rng.range(2, 4);
    for (let b = 0; b < k; b++) {
      blobs.push({ x: rng.float(0.15, 0.85), y: rng.float(0.2, 0.8) * hn, r: rng.float(0.17, 0.27), s: 1 });
    }
  } else if (type === 'pangaea') {
    blobs.push({ x: rng.float(0.42, 0.58), y: hn * rng.float(0.45, 0.55), r: 0.42, s: 1 });
  } else if (type === 'archipelago') {
    const k = rng.range(10, 15);
    for (let b = 0; b < k; b++) {
      blobs.push({ x: rng.float(0.08, 0.92), y: rng.float(0.12, 0.88) * hn, r: rng.float(0.05, 0.11), s: 1 });
    }
  }

  const elev = new Float32Array(n);
  const freq = type === 'archipelago' ? 5.5 : type === 'lakes' ? 3.2 : 3;
  for (let i = 0; i < n; i++) {
    const x = nx[i];
    const y = ny[i];
    let e = nElev.fbm(x * freq, y * freq, 5);
    let mask = 0;
    for (const b of blobs) {
      const d = Math.hypot(x - b.x, (y - b.y) * 1.15) / b.r;
      mask = Math.max(mask, Math.max(0, 1 - d * d) * b.s);
    }
    if (type === 'continents') e = e * 0.55 + mask * 0.75;
    else if (type === 'pangaea') e = e * 0.5 + mask * 0.9;
    else if (type === 'archipelago') e = e * 0.6 + mask * 0.55;
    else e = e * 0.9 + 0.15;
    const edge = Math.min(x, 1 - x, y, hn - y);
    if (edge < 0.07) e -= (0.07 - edge) * 9;
    elev[i] = e;
  }

  const sorted = Array.from(elev).sort((a, b) => a - b);
  const seaLevel = sorted[Math.floor(n * (1 - LAND_FRACTION[type]))];
  const maxE = sorted[n - 1];
  const minE = sorted[0];

  // --- Relief (hills / mountains) -------------------------------------------
  const landIdx: number[] = [];
  for (let i = 0; i < n; i++) if (elev[i] > seaLevel) landIdx.push(i);
  const reliefScore = new Float32Array(n);
  for (const i of landIdx) {
    reliefScore[i] = ((elev[i] - seaLevel) / (maxE - seaLevel)) * 0.5 + nRidge.ridged(nx[i] * 6, ny[i] * 6) * 0.8;
  }
  const byRelief = [...landIdx].sort((a, b) => reliefScore[b] - reliefScore[a]);
  const mountainCount = Math.floor(byRelief.length * 0.07);
  const hillCount = Math.floor(byRelief.length * 0.15);
  for (let k = 0; k < byRelief.length; k++) {
    const i = byRelief[k];
    if (k < mountainCount) map.relief[i] = Relief.Mountain;
    else if (k < mountainCount + hillCount) map.relief[i] = Relief.Hills;
  }
  for (let i = 0; i < n; i++) {
    if (elev[i] > seaLevel) {
      const v = 128 + (127 * (elev[i] - seaLevel)) / (maxE - seaLevel);
      map.elevation[i] = Math.min(255, v + map.relief[i] * 20);
    } else {
      map.elevation[i] = Math.max(0, (127 * (elev[i] - minE)) / (seaLevel - minE));
    }
  }

  // --- Water distance, temperature, moisture --------------------------------
  const waterDist = new Int16Array(n).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (elev[i] <= seaLevel) {
      waterDist[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    grid.forNeighbors(i, (nb) => {
      if (waterDist[nb] < 0) {
        waterDist[nb] = waterDist[i] + 1;
        queue.push(nb);
      }
    });
  }

  const temp = new Float32Array(n);
  const moist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const row = grid.row(i);
    const lat = Math.abs(row / (h - 1) - 0.5) * 2;
    let t = 1 - Math.pow(lat, 1.25) + nTemp.fbm(nx[i] * 4, ny[i] * 4, 3) * 0.14;
    if (map.relief[i] === Relief.Mountain) t -= 0.18;
    else if (map.relief[i] === Relief.Hills) t -= 0.05;
    temp[i] = t;
    let m = nMoist.fbm(nx[i] * 3.5, ny[i] * 3.5, 4) * 0.55 + 0.5;
    m += 0.3 * Math.exp(-Math.max(0, waterDist[i]) / 3.5) - 0.12;
    m -= 0.28 * Math.exp(-Math.pow((lat - 0.36) / 0.13, 2));
    m += 0.12 * Math.exp(-Math.pow(lat / 0.15, 2));
    moist[i] = m;
  }

  // --- Base terrain -------------------------------------------------------------
  for (let i = 0; i < n; i++) {
    if (elev[i] <= seaLevel) {
      map.terrain[i] = T.Ocean;
      continue;
    }
    const t = temp[i];
    const m = moist[i];
    if (t < 0.1) map.terrain[i] = T.Snow;
    else if (t < 0.26) map.terrain[i] = T.Tundra;
    else if (m < 0.3 && t > 0.45) map.terrain[i] = T.Desert;
    else if (m < 0.5) map.terrain[i] = T.Plains;
    else map.terrain[i] = T.Grass;
  }

  // Water bodies: coast next to land, small enclosed bodies become lakes.
  const waterComp = new Int32Array(n).fill(-1);
  const waterSizes: number[] = [];
  const waterTouchesEdge: boolean[] = [];
  for (let i = 0; i < n; i++) {
    if (map.terrain[i] !== T.Ocean || waterComp[i] >= 0) continue;
    const id = waterSizes.length;
    let size = 0;
    let edge = false;
    const stack = [i];
    waterComp[i] = id;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const col = grid.col(c);
      const row = grid.row(c);
      if (col === 0 || row === 0 || col === w - 1 || row === h - 1) edge = true;
      grid.forNeighbors(c, (nb) => {
        if (map.terrain[nb] === T.Ocean && waterComp[nb] < 0) {
          waterComp[nb] = id;
          stack.push(nb);
        }
      });
    }
    waterSizes.push(size);
    waterTouchesEdge.push(edge);
  }
  for (let i = 0; i < n; i++) {
    if (map.terrain[i] !== T.Ocean) continue;
    const c = waterComp[i];
    if (waterSizes[c] <= 14 && !waterTouchesEdge[c]) {
      map.terrain[i] = T.Lake;
      continue;
    }
    let nearLand = false;
    grid.forNeighbors(i, (nb) => {
      if (isLand(map, nb)) nearLand = true;
    });
    if (nearLand) map.terrain[i] = T.Coast;
    const row = grid.row(i);
    if ((row <= 1 || row >= h - 2) && rng.chance(0.7)) map.feature[i] = F.Ice;
  }

  // --- Rivers -----------------------------------------------------------------
  const worldLang = makeLanguage(rng.fork('world-lang'));
  const usedNames = new Set<string>();
  const rivers: River[] = [];
  const landCount = landIdx.length;
  const riverTarget = Math.round(landCount / 38);
  const sources = landIdx.filter(
    (i) =>
      map.relief[i] !== Relief.Mountain &&
      map.terrain[i] !== T.Snow &&
      moist[i] > 0.38 &&
      waterDist[i] >= 3 &&
      (map.relief[i] === Relief.Hills || reliefScore[i] > 0.45 || grid.neighborList(i).some((nb) => map.relief[nb] === Relief.Mountain)),
  );
  rng.shuffle(sources);
  const riverElev = (i: number) => elev[i] + (map.relief[i] === Relief.Hills ? 0.04 : 0);
  let made = 0;
  for (const src of sources) {
    if (made >= riverTarget) break;
    if (map.river[src] > 0 || grid.neighborList(src).some((nb) => map.river[nb] > 0)) continue;
    const path = [src];
    const seen = new Set(path);
    let cur = src;
    let end: number = -1;
    while (path.length < 45) {
      let best = -1;
      let bestScore = Infinity;
      let water = -1;
      for (const nb of grid.neighborList(cur)) {
        if (seen.has(nb)) continue;
        if (isWater(map, nb)) {
          water = nb;
          break;
        }
        if (map.relief[nb] === Relief.Mountain) continue;
        let s = riverElev(nb) + rng.next() * 0.015;
        if (map.river[nb] > 0) s -= 0.03;
        if (s < bestScore) {
          bestScore = s;
          best = nb;
        }
      }
      if (water >= 0) {
        end = water;
        break;
      }
      if (best < 0) break;
      if (map.river[best] > 0) {
        end = best;
        break;
      }
      path.push(best);
      seen.add(best);
      cur = best;
    }
    if (end < 0 || path.length < 4) continue;
    const joined = map.river[end] > 0 ? map.riverId[end] : -1;
    let id = joined;
    if (id < 0 || path.length >= 7) {
      id = rivers.length;
      rivers.push({ id, name: placeName(worldLang, rng, usedNames), length: 0 });
    }
    for (let k = 0; k < path.length; k++) {
      const t = path[k];
      map.riverTo[t] = k + 1 < path.length ? path[k + 1] : end;
      map.riverId[t] = id;
      map.river[t] = 1;
    }
    rivers[id].length += path.length;
    made++;
  }
  // Flow volume: count upstream tiles.
  for (let i = 0; i < n; i++) {
    if (map.river[i] === 0) continue;
    let c = map.riverTo[i];
    let guard = 0;
    while (c >= 0 && map.river[c] > 0 && guard++ < 200) {
      if (map.river[c] < 250) map.river[c]++;
      c = map.riverTo[c];
    }
  }

  // --- Features ---------------------------------------------------------------
  for (const i of landIdx) {
    if (map.relief[i] === Relief.Mountain) continue;
    const t = map.terrain[i];
    const m = moist[i];
    const fn = nFeat.fbm(nx[i] * 7, ny[i] * 7, 3);
    if (t === T.Desert) {
      if (map.river[i] > 0) map.feature[i] = F.Floodplain;
      else if (rng.chance(0.03)) map.feature[i] = F.Oasis;
      continue;
    }
    if (t === T.Snow) continue;
    if (t === T.Grass && temp[i] > 0.72 && m > 0.68 && fn > -0.1) map.feature[i] = F.Jungle;
    else if ((t === T.Grass || t === T.Plains || t === T.Tundra) && m + fn * 0.35 > 0.6) map.feature[i] = F.Forest;
    else if (t === T.Grass && map.relief[i] === Relief.Flat && waterDist[i] <= 2 && m > 0.62 && rng.chance(0.18)) map.feature[i] = F.Marsh;
    else if (map.river[i] > 0 && map.relief[i] === Relief.Flat && (t === T.Plains || t === T.Grass) && rng.chance(0.2)) map.feature[i] = F.Floodplain;
  }

  // Volcanoes among the mountains.
  const mountains = landIdx.filter((i) => map.relief[i] === Relief.Mountain);
  rng.shuffle(mountains);
  const volcanoCount = Math.max(1, Math.round(mountains.length * 0.035));
  for (let k = 0; k < Math.min(volcanoCount, mountains.length); k++) map.feature[mountains[k]] = F.Volcano;

  // --- Regions (landmasses and seas) -------------------------------------------
  const regions: Region[] = [];
  for (let i = 0; i < n; i++) {
    if (map.region[i] >= 0) continue;
    const land = isLand(map, i);
    const id = regions.length;
    const stack = [i];
    map.region[i] = id;
    let size = 0;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      grid.forNeighbors(c, (nb) => {
        if (map.region[nb] < 0 && isLand(map, nb) === land) {
          map.region[nb] = id;
          stack.push(nb);
        }
      });
    }
    let name = '';
    if (land && size >= 6) name = placeName(worldLang, rng, usedNames);
    else if (!land && size >= 4) {
      const word = placeName(worldLang, rng, usedNames);
      const lake = map.terrain[i] === T.Lake;
      name = lake ? `Lake ${word}` : size > 260 ? `the ${word} Ocean` : `the ${word} Sea`;
    }
    regions.push({ id, kind: land ? 'land' : 'water', size, name });
  }

  // --- Resources ----------------------------------------------------------------
  const within = (c: number, r: number) => grid.within(c, r);
  const neighbors = (i: number) => grid.neighborList(i);
  for (let i = 0; i < n; i++) {
    if (map.feature[i] === F.Ice) continue;
    const t = map.terrain[i];
    const relief = map.relief[i];
    const f = map.feature[i];
    if (isWater(map, i)) {
      if ((t === T.Coast || t === T.Lake) && rng.chance(0.09)) map.resource[i] = R.Fish;
      else if (t === T.Ocean && rng.chance(0.012)) map.resource[i] = R.Oil;
      continue;
    }
    if (relief === Relief.Mountain || !rng.chance(0.15)) continue;
    const options: [R, number][] = [];
    const flat = relief === Relief.Flat;
    if (flat && (t === T.Grass || t === T.Plains) && f === F.None) options.push([R.Grain, 4], [R.Cattle, 3], [R.Horses, 2.5]);
    if (f === F.Floodplain) options.push([R.Grain, 5]);
    if (relief === Relief.Hills) options.push([R.Iron, 3], [R.Coal, 2.2], [R.Gems, 1.3], [R.Uranium, 0.5]);
    if (t === T.Tundra) options.push([R.Iron, 1.2], [R.Oil, 1.5], [R.RareMinerals, 1.5], [R.Cattle, 0.6]);
    if (t === T.Desert) options.push([R.Oil, 2.2], [R.Gems, 0.8], [R.RareMinerals, 1], [R.Uranium, 0.5]);
    if (f === F.Marsh) options.push([R.Oil, 2], [R.Spices, 1]);
    if (f === F.Forest) options.push([R.Silk, 1.8], [R.Coal, 0.9], [R.Spices, temp[i] > 0.6 ? 1.2 : 0]);
    if (f === F.Jungle) options.push([R.Spices, 2.5], [R.Gems, 1.6], [R.Silk, 0.6]);
    if (flat && t === T.Plains) options.push([R.Iron, 0.8], [R.RareMinerals, 0.4]);
    if (t === T.Snow) options.push([R.RareMinerals, 0.6], [R.Oil, 0.6]);
    const pick = rng.weighted(options);
    if (pick !== undefined) map.resource[i] = pick;
  }

  // --- Start positions -------------------------------------------------------------
  const civCount = settings.rivals + 1;
  const minRegion = type === 'archipelago' ? 9 : 24;
  const siteScores = new Float32Array(n).fill(-1);
  const candidates: number[] = [];
  for (const i of landIdx) {
    if (regions[map.region[i]].size < minRegion) continue;
    if (map.terrain[i] === T.Tundra || map.terrain[i] === T.Snow) continue;
    const row = grid.row(i);
    if (row < 4 || row > h - 5) continue;
    const s = siteInfo(map, within, neighbors, i).score;
    if (s <= 0) continue;
    siteScores[i] = s + rng.next() * 6;
    candidates.push(i);
  }
  candidates.sort((a, b) => siteScores[b] - siteScores[a]);
  const top = candidates.slice(0, Math.max(civCount * 30, Math.floor(candidates.length * 0.45)));
  let minDist = Math.max(6, Math.floor(Math.sqrt(landCount / civCount) * 0.95));
  let starts: number[] = [];
  while (minDist >= 3) {
    starts = [];
    for (const c of top) {
      if (starts.every((s) => grid.distance(s, c) >= minDist)) starts.push(c);
      if (starts.length === civCount) break;
    }
    if (starts.length === civCount) break;
    minDist--;
  }
  if (starts.length < civCount) {
    for (const c of candidates) {
      if (starts.length >= civCount) break;
      if (starts.every((s) => grid.distance(s, c) >= 3)) starts.push(c);
    }
  }
  // Fairness: every start gets food nearby.
  for (const s of starts) {
    const ring = grid.within(s, 2).filter((t) => t !== s);
    const food = ring.filter((t) => map.resource[t] === R.Grain || map.resource[t] === R.Cattle || map.resource[t] === R.Fish);
    if (food.length >= 2) continue;
    rng.shuffle(ring);
    let added = food.length;
    for (const t of ring) {
      if (added >= 2) break;
      if (map.resource[t] !== R.None) continue;
      if (isWater(map, t)) {
        if (map.terrain[t] !== T.Ocean) {
          map.resource[t] = R.Fish;
          added++;
        }
      } else if (map.relief[t] === Relief.Flat && (map.terrain[t] === T.Grass || map.terrain[t] === T.Plains)) {
        map.feature[t] = F.None;
        map.resource[t] = rng.chance(0.5) ? R.Grain : R.Cattle;
        added++;
      }
    }
  }
  for (const s of starts) {
    map.resource[s] = R.None;
    if (map.feature[s] === F.Jungle || map.feature[s] === F.Marsh) map.feature[s] = F.None;
  }

  // --- Natural wonders -------------------------------------------------------------
  const wonders: NaturalWonder[] = [];
  const wonderKinds: {
    kind: string;
    test: (i: number) => boolean;
    name: (wd: string) => string;
    desc: string;
    fx: NaturalWonder['fx'];
  }[] = [
    { kind: 'falls', test: (i) => map.river[i] > 0 && map.relief[i] === Relief.Hills, name: (wd) => `the Falls of ${wd}`,
      desc: 'A river thunders over a cliff of black stone.', fx: { food: 0, prod: 1, trade: 3, cult: 2, sci: 0, happy: 1 } },
    { kind: 'volcano', test: (i) => map.feature[i] === F.Volcano, name: (wd) => `Mount ${wd}`,
      desc: 'A smoking mountain the ancients called the Throat of the World.', fx: { food: 0, prod: 2, trade: 1, cult: 3, sci: 1, happy: 0 } },
    { kind: 'reef', test: (i) => map.terrain[i] === T.Coast, name: (wd) => `the ${wd} Reef`,
      desc: 'A living wall of coral, bright beneath the waves.', fx: { food: 3, prod: 0, trade: 2, cult: 0, sci: 2, happy: 1 } },
    { kind: 'oldwood', test: (i) => map.feature[i] === F.Forest || map.feature[i] === F.Jungle, name: (wd) => `the Old Wood of ${wd}`,
      desc: 'Trees older than any memory, whispered to be sacred.', fx: { food: 1, prod: 1, trade: 0, cult: 3, sci: 1, happy: 1 } },
    { kind: 'glass', test: (i) => map.terrain[i] === T.Desert && map.feature[i] === F.None, name: (wd) => `the Glass Sea of ${wd}`,
      desc: 'A plain of fused sand that glitters like water.', fx: { food: 0, prod: 0, trade: 3, cult: 1, sci: 3, happy: 0 } },
    { kind: 'crater', test: (i) => map.terrain[i] === T.Lake, name: (wd) => `the Eye of ${wd}`,
      desc: 'A perfectly round lake, deep and still as glass.', fx: { food: 2, prod: 0, trade: 2, cult: 2, sci: 1, happy: 2 } },
    { kind: 'pillars', test: (i) => map.relief[i] === Relief.Hills && grid.neighborList(i).some((nb) => map.relief[nb] === Relief.Mountain),
      name: (wd) => `the Pillars of ${wd}`, desc: 'Towers of wind-carved stone stand like giants frozen mid-stride.',
      fx: { food: 0, prod: 2, trade: 1, cult: 4, sci: 0, happy: 1 } },
  ];
  rng.shuffle(wonderKinds);
  const wonderCount = settings.size === 'small' ? 4 : settings.size === 'standard' ? 5 : 7;
  for (const wk of wonderKinds) {
    if (wonders.length >= wonderCount) break;
    const opts = [];
    for (let i = 0; i < n; i++) {
      if (!wk.test(i) || map.wonder[i] >= 0) continue;
      if (starts.some((s) => grid.distance(s, i) < 4)) continue;
      if (wonders.some((wd) => grid.distance(wd.tile, i) < 7)) continue;
      opts.push(i);
    }
    if (!opts.length) continue;
    const tile = rng.pick(opts);
    const id = wonders.length;
    const nm = placeName(worldLang, rng, usedNames);
    wonders.push({ id, name: wk.name(nm), kind: wk.kind, tile, desc: wk.desc, fx: wk.fx, discoveredBy: [] });
    map.wonder[tile] = id;
    map.resource[tile] = R.None;
  }

  // --- Ruins of forgotten peoples -------------------------------------------------------
  const ruins: Ruin[] = [];
  const ancientCount = rng.range(2, 3);
  const ancients: { name: string; lang: Language; age: number }[] = [];
  for (let k = 0; k < ancientCount; k++) {
    const lang = makeLanguage(rng.fork(`ancient-${k}`));
    ancients.push({ name: peopleName(lang, rng), lang, age: rng.range(700, 3200) });
  }
  const ruinCount = settings.size === 'small' ? 5 : settings.size === 'standard' ? 7 : 10;
  const ruinSites = landIdx.filter((i) => canSettle(map, i) && regions[map.region[i]].size >= 5);
  rng.shuffle(ruinSites);
  const legends = [
    'Legends say its rulers spoke with the river and the river answered.',
    'Its people were said to read the future in the stars.',
    'Carvings tell of towers taller than any built since.',
    'The tablets speak of a great library, now lost to the earth.',
    'Its priests claimed the gods once walked its streets.',
    'Songs remember it as a city of a thousand bells.',
    'It is said its smiths could make bronze that never dulled.',
    'Old stories call it the city that never slept.',
  ];
  const knowledgePool = ['writing', 'mathematics', 'astronomy', 'philosophy', 'bronze', 'sailing', 'calendar', 'masonry', 'irrigation', 'currency'];
  for (const tile of ruinSites) {
    if (ruins.length >= ruinCount) break;
    if (starts.some((s) => grid.distance(s, tile) < 5)) continue;
    if (ruins.some((r) => grid.distance(r.tile, tile) < 6)) continue;
    const anc = ancients[ruins.length % ancients.length];
    const name = placeName(anc.lang, rng, usedNames);
    const fell = -(anc.age + rng.range(-150, 150));
    const founded = fell - rng.range(120, 700);
    const cause = ruinCause(map, grid, wonders, tile, rng, ancients.filter((a) => a !== anc).map((a) => a.name));
    const artifacts = [artifactName(rng, name)];
    if (rng.chance(0.4)) artifacts.push(artifactName(rng, name));
    const id = ruins.length;
    ruins.push({
      id,
      tile,
      name,
      civName: anc.name,
      founded,
      fell,
      peakPop: Math.round(rng.range(2000, 60000) / 7) * 7 + rng.int(7),
      cause,
      legend: rng.pick(legends),
      artifacts,
      prehistoric: true,
      exploredBy: [],
      knowledge: rng.pick(knowledgePool),
    });
    map.ruinAt[tile] = id;
  }

  return { map, regions, rivers, wonders, ruins, starts, worldLang };
}

function ruinCause(map: WorldMap, grid: Grid, wonders: NaturalWonder[], tile: number, rng: Rng, others: string[]): string {
  const near = grid.within(tile, 4);
  const volcano = near.find((t) => map.feature[t] === F.Volcano);
  if (volcano !== undefined && rng.chance(0.8)) {
    const wd = map.wonder[volcano] >= 0 ? wonders[map.wonder[volcano]].name : 'the mountain';
    return `It was buried in ash when ${wd} awoke.`;
  }
  if (map.river[tile] > 0) {
    return rng.pick([
      'The river changed course during a great flood, and its fields turned to mud.',
      'Floods, year after year, drove its people to higher ground.',
    ]);
  }
  const coastal = grid.neighborList(tile).some((t) => map.terrain[t] === T.Coast);
  if (coastal && rng.chance(0.7)) {
    return rng.pick(['The sea rose and swallowed its harbors.', 'Raiders from the sea burned it to the waterline.']);
  }
  const t = map.terrain[tile];
  if (t === T.Desert || (t === T.Plains && baseYield(map, tile).food <= 1)) {
    return 'The wells ran dry during a drought that lasted a generation.';
  }
  if (map.feature[tile] === F.Forest || map.feature[tile] === F.Jungle) {
    return 'The forest reclaimed it after a plague emptied its streets.';
  }
  const opts = ['A plague emptied its streets.', 'Its people simply left. No record says why.', 'The soil grew barren and its people scattered.'];
  if (others.length) opts.push(`It fell in a long war against the ${rng.pick(others)}.`);
  return rng.pick(opts);
}
