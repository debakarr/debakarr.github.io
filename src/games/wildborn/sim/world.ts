// Wildborn's overworld: one continuous, seeded tile world with the six regions
// as organic zones around a central village, connected by paths and rivers.
// Terrain types, tall-grass encounter tiles, resource features, and a BFS
// pathfinder used by tap-to-move and the automatic trainer.

import { Noise2D } from '../../shared/noise';
import { Rng, hashString } from '../../shared/rng';
import { BIOMES, type BiomeId } from '../data/species';

export const T = {
  Grass: 0,
  Tall: 1, // tall grass: encounters
  Path: 2,
  Tree: 3,
  Water: 4,
  DeepWater: 5,
  Rock: 6,
  Mountain: 7,
  Ash: 8, // Ember Flats ground, encounters
  Lava: 9,
  Crystal: 10, // crystal formation: blocked, pretty
  CaveFloor: 11, // Crystal Hollow ground, encounters
  RuinFloor: 12, // Old Ruins ground, encounters
  Pillar: 13,
  Floor: 14, // village floor
  Wall: 15,
  Reed: 16, // wetlands ground, encounters
  Flower: 17,
  Sand: 18,
} as const;
export type TileId = (typeof T)[keyof typeof T];

/** Zone ids: the six biomes plus the village and the in-between wilds. */
export type ZoneId = BiomeId | 'village' | 'wilds';

export const ZONE_LABEL: Record<ZoneId, string> = {
  greenwood: BIOMES.greenwood.name,
  meadow: BIOMES.meadow.name,
  wetlands: BIOMES.wetlands.name,
  caves: BIOMES.caves.name,
  ember: BIOMES.ember.name,
  ruins: BIOMES.ruins.name,
  village: 'Village',
  wilds: 'The Wilds',
};

export interface Feature {
  x: number;
  y: number;
  /** Pickup item id, or a marker: 'home', 'researcher', 'lantern'. */
  kind: string;
  /** Day the feature was picked up; -1 = never. */
  takenDay: number;
}

export interface WorldMap {
  seed: string;
  w: number;
  h: number;
  tiles: Uint8Array;
  zones: string[]; // ZoneId per tile
  features: Feature[];
  /** By-tile feature lookup: index -> feature index. */
  featureAt: Int16Array;
  /** Zone centers in tiles, for spawn targets and the trainer. */
  centers: Record<ZoneId, { x: number; y: number }>;
  spawn: { x: number; y: number };
}

const BLOCKED = new Set<number>([T.Tree, T.Water, T.DeepWater, T.Mountain, T.Rock, T.Lava, T.Crystal, T.Pillar, T.Wall]);
/** Tiles where wild creatures step out: tall grass, ruins, cave floor, ash, reeds. */
const ENCOUNTER = new Set<number>([T.Tall, T.Ash, T.CaveFloor, T.RuinFloor, T.Reed]);

export function walkable(map: WorldMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  return !BLOCKED.has(map.tiles[y * map.w + x]);
}

export function isEncounterTile(map: WorldMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  return ENCOUNTER.has(map.tiles[y * map.w + x]);
}

export function zoneAt(map: WorldMap, x: number, y: number): ZoneId {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return 'wilds';
  return map.zones[y * map.w + x] as ZoneId;
}

export function featureOn(map: WorldMap, x: number, y: number): Feature | null {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return null;
  const idx = map.featureAt[y * map.w + x];
  return idx >= 0 ? map.features[idx] : null;
}

const CACHE = new Map<string, WorldMap>();

/** Build (or return the cached) overworld for a seed. Deterministic. */
export function buildWorld(seed: string): WorldMap {
  const cached = CACHE.get(seed);
  if (cached) return cached;
  const map = generate(seed);
  CACHE.set(seed, map);
  return map;
}

export const WORLD_W = 152;
export const WORLD_H = 112;

function generate(seed: string): WorldMap {
  const rng = new Rng(hashString(`${seed}:world`));
  const noise = new Noise2D(rng.fork('n1'));
  const w = WORLD_W;
  const h = WORLD_H;
  const tiles = new Uint8Array(w * h).fill(T.Grass);
  const zones = new Array<string>(w * h).fill('wilds');

  // Zone centers, as fractions of the map (village sits in the middle).
  const centers: Record<ZoneId, { x: number; y: number }> = {
    village: { x: Math.round(w * 0.5), y: Math.round(h * 0.5) },
    greenwood: { x: Math.round(w * 0.2), y: Math.round(h * 0.22) },
    meadow: { x: Math.round(w * 0.5), y: Math.round(h * 0.12) },
    wetlands: { x: Math.round(w * 0.82), y: Math.round(h * 0.26) },
    caves: { x: Math.round(w * 0.16), y: Math.round(h * 0.82) },
    ember: { x: Math.round(w * 0.52), y: Math.round(h * 0.86) },
    ruins: { x: Math.round(w * 0.84), y: Math.round(h * 0.78) },
    wilds: { x: 0, y: 0 },
  };
  const zoneRadius: Record<ZoneId, number> = {
    village: 9,
    greenwood: 26,
    meadow: 24,
    wetlands: 26,
    caves: 26,
    ember: 25,
    ruins: 26,
    wilds: 0,
  };
  const ZONE_ORDER: ZoneId[] = ['greenwood', 'meadow', 'wetlands', 'caves', 'ember', 'ruins'];

  // Zone masks: nearest wobbled center.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wob = noise.fbm(x * 0.05, y * 0.05, 3) * 8;
      let best: ZoneId = 'wilds';
      let bestD = Infinity;
      for (const zid of ZONE_ORDER) {
        const c = centers[zid];
        const d = Math.hypot(x - c.x, y - c.y) + wob;
        if (d < bestD) {
          bestD = d;
          best = zid;
        }
      }
      const i = y * w + x;
      zones[i] = bestD < zoneRadius[best] ? best : 'wilds';
    }
  }
  // The village is a hard circle in the middle.
  const vc = centers.village;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.hypot(x - vc.x, y - vc.y) < zoneRadius.village + noise.fbm(x * 0.1, y * 0.1, 2) * 2) zones[y * w + x] = 'village';
    }
  }

  const n1 = (x: number, y: number) => noise.fbm(x * 0.045, y * 0.045, 4);

  // Terrain per zone.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const zid = zones[i] as ZoneId;
      const n = n1(x, y);
      const n2 = noise.fbm(x * 0.11 + 37, y * 0.11 + 11, 3);
      if (zid === 'greenwood') {
        if (n > 0.18) tiles[i] = T.Tree;
        else if (n2 > 0.05) tiles[i] = T.Tall;
        else if (n2 < -0.28) tiles[i] = T.Flower;
        else tiles[i] = T.Grass;
      } else if (zid === 'meadow') {
        tiles[i] = n2 > -0.18 ? T.Tall : n > 0.3 ? T.Flower : T.Grass;
      } else if (zid === 'wetlands') {
        if (n > 0.26) tiles[i] = n2 > 0.3 ? T.DeepWater : T.Water;
        else if (n2 > 0.05) tiles[i] = T.Reed;
        else tiles[i] = T.Grass;
      } else if (zid === 'caves') {
        const dc = Math.hypot(x - centers.caves.x, y - centers.caves.y);
        if (dc > zoneRadius.caves - 7 && n > -0.05) tiles[i] = T.Mountain;
        else if (n2 > 0.24) tiles[i] = T.Crystal;
        else if (n2 < -0.3) tiles[i] = T.Rock;
        else tiles[i] = T.CaveFloor;
      } else if (zid === 'ember') {
        if (n > 0.32) tiles[i] = T.Lava;
        else if (n2 > 0.34) tiles[i] = T.Rock;
        else tiles[i] = T.Ash;
      } else if (zid === 'ruins') {
        if (n2 > 0.2) tiles[i] = T.Pillar;
        else if (n > 0.1) tiles[i] = T.RuinFloor;
        else tiles[i] = n2 < -0.4 ? T.Tree : T.Grass;
      } else if (zid === 'village') {
        tiles[i] = n2 > 0.3 ? T.Tree : T.Floor;
      } else {
        // The wilds between zones: gentle grass with scattered trees and grass.
        tiles[i] = n > 0.34 ? T.Tree : n2 > 0.42 ? T.Tall : T.Grass;
      }
    }
  }

  // Rivers wind out of the wetlands.
  const carveRiver = (x0: number, y0: number) => {
    let x = x0;
    let y = y0;
    let dir = rng.float(0, Math.PI * 2);
    for (let step = 0; step < 240; step++) {
      const i = y * w + x;
      if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) break;
      if (zones[i] !== 'village' && tiles[i] !== T.Mountain) tiles[i] = T.Water;
      dir += rng.float(-0.5, 0.5);
      const nx = Math.round(x + Math.cos(dir));
      const ny = Math.round(y + Math.sin(dir));
      if (nx < 2 || ny < 2 || nx >= w - 2 || ny >= h - 2) break;
      x = nx;
      y = ny;
    }
  };
  carveRiver(centers.wetlands.x - 6, centers.wetlands.y + 2);
  carveRiver(centers.wetlands.x - 10, centers.wetlands.y + 8);

  // Paths: village to each zone, and a ring between neighbours.
  const carve = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    // Dijkstra-lite path: greedy wobble toward the goal over the cost map.
    let x = from.x;
    let y = from.y;
    let guard = w * h;
    while ((x !== to.x || y !== to.y) && guard-- > 0) {
      tiles[y * w + x] = T.Path;
      const dx = Math.sign(to.x - x);
      const dy = Math.sign(to.y - y);
      const opts: [number, number][] = [];
      if (dx !== 0) opts.push([x + dx, y]);
      if (dy !== 0) opts.push([x, y + dy]);
      if (dx !== 0 && dy !== 0 && rng.chance(0.3)) opts.push([x + dx, y + dy]);
      const pick = opts.length ? opts[rng.int(opts.length)] : [x, y];
      x = Math.max(1, Math.min(w - 2, pick[0]));
      y = Math.max(1, Math.min(h - 2, pick[1]));
    }
    tiles[to.y * w + to.x] = T.Path; // the destination itself is always open
  };
  for (const zid of ZONE_ORDER) carve(centers.village, centers[zid]);
  carve(centers.greenwood, centers.meadow);
  carve(centers.meadow, centers.wetlands);
  carve(centers.wetlands, centers.ruins);
  carve(centers.ruins, centers.ember);
  carve(centers.ember, centers.caves);
  carve(centers.caves, centers.greenwood);

  // Widen paths a little so they read as paths.
  const tiles2 = tiles.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (tiles[y * w + x] !== T.Path) continue;
      if (rng.chance(0.6)) tiles2[y * w + x + 1] = tiles2[y * w + x + 1] === T.Grass || tiles2[y * w + x + 1] === T.Flower ? T.Path : tiles2[y * w + x + 1];
      if (rng.chance(0.6)) tiles2[y * w + x + w] = tiles2[y * w + x + w] === T.Grass || tiles2[y * w + x + w] === T.Flower ? T.Path : tiles2[y * w + x + w];
    }
  }
  tiles.set(tiles2);

  // Bridges: where a path meets water, cross it.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (tiles[i] !== T.Water) continue;
      const n = tiles[i - 1] === T.Path || tiles[i + 1] === T.Path || tiles[i - w] === T.Path || tiles[i + w] === T.Path;
      if (n) tiles[i] = T.Path;
    }
  }

  // The village: clear the paths' ground, put buildings and a home.
  const buildings: [number, number, number, number][] = [
    [vc.x - 5, vc.y - 4, 3, 2],
    [vc.x + 3, vc.y - 5, 3, 3],
    [vc.x - 3, vc.y + 3, 4, 2],
    [vc.x + 4, vc.y + 3, 3, 2],
  ];
  for (const [bx, by, bw, bh] of buildings) {
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) tiles[y * w + x] = T.Wall;
  }

  // Features: resource pickups per zone, fragments in the ruins, lanterns on paths.
  const features: Feature[] = [];
  const featureAt = new Int16Array(w * h).fill(-1);
  const put = (x: number, y: number, kind: string) => {
    const i = y * w + x;
    if (featureAt[i] >= 0 || !walkableRaw(tiles[i])) return;
    featureAt[i] = features.length;
    features.push({ x, y, kind, takenDay: -1 });
  };
  const walkableRaw = (t: number) => !BLOCKED.has(t);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const zid = zones[i] as ZoneId;
      if (!walkableRaw(tiles[i])) continue;
      if (zid === 'village' || zid === 'wilds') continue;
      const biome = BIOMES[zid];
      const r = rng.next();
      if (r < 0.006) put(x, y, rng.pick(biome.resources));
    }
  }
  // The ruins always carry fragments.
  let frags = 0;
  for (let tries = 0; tries < 900 && frags < 8; tries++) {
    const x = centers.ruins.x + rng.range(-12, 12);
    const y = centers.ruins.y + rng.range(-12, 12);
    if (zoneRaw(zones, x, y, w) === 'ruins') {
      put(x, y, 'fragment');
      frags++;
    }
  }
  // Village features: home, the researcher, lanterns at the gates.
  put(centers.village.x, centers.village.y + 1, 'home');
  put(centers.village.x - 4, centers.village.y - 3, 'researcher');
  for (const zid of ZONE_ORDER) {
    const c = centers[zid];
    const gx = Math.round(vc.x + (c.x - vc.x) * 0.55);
    const gy = Math.round(vc.y + (c.y - vc.y) * 0.55);
    put(gx, gy, 'lantern');
  }

  const spawn = { x: centers.village.x, y: centers.village.y + 3 };
  // Whatever the decoration did, the player always starts on open ground.
  tiles[spawn.y * w + spawn.x] = T.Path;

  return {
    seed,
    w,
    h,
    tiles,
    zones,
    features,
    featureAt,
    centers,
    spawn,
  };
}

function zoneRaw(zones: string[], x: number, y: number, w: number): ZoneId {
  if (x < 0 || y < 0 || x >= w || y >= zones.length / w) return 'wilds';
  return zones[y * w + x] as ZoneId;
}

/** Breadth-first path between two tiles; null if unreachable. */
export function findPath(map: WorldMap, from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] | null {
  if (!walkable(map, to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const prev = new Int32Array(map.w * map.h).fill(-2);
  prev[from.y * map.w + from.x] = -1;
  const queue = new Int32Array(map.w * map.h);
  let head = 0;
  let tail = 0;
  queue[tail++] = from.y * map.w + from.x;
  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % map.w;
    const cy = (cur / map.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const ni = ny * map.w + nx;
      if (prev[ni] !== -2 || !walkable(map, nx, ny)) continue;
      prev[ni] = cur;
      if (nx === to.x && ny === to.y) {
        const path: { x: number; y: number }[] = [];
        let p = ni;
        while (p >= 0) {
          path.unshift({ x: p % map.w, y: (p / map.w) | 0 });
          p = prev[p];
        }
        return path.slice(1);
      }
      queue[tail++] = ni;
    }
  }
  return null;
}

/** A random walkable tile in a zone (for the trainer's wandering). */
export function randomTileIn(map: WorldMap, zone: ZoneId, rng: Rng): { x: number; y: number } | null {
  for (let tries = 0; tries < 400; tries++) {
    const x = rng.int(map.w);
    const y = rng.int(map.h);
    if (zones0(map, x, y) === zone && walkable(map, x, y)) return { x, y };
  }
  return null;
}

function zones0(map: WorldMap, x: number, y: number): ZoneId {
  return map.zones[y * map.w + x] as ZoneId;
}

/** A random encounter tile in a zone (for the trainer's grass runs). */
export function randomGrassIn(map: WorldMap, zone: ZoneId, rng: Rng): { x: number; y: number } | null {
  for (let tries = 0; tries < 600; tries++) {
    const x = rng.int(map.w);
    const y = rng.int(map.h);
    if (zones0(map, x, y) === zone && isEncounterTile(map, x, y)) return { x, y };
  }
  return null;
}
