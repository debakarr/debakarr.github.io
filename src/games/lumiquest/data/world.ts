// The layout of Brightwater Vale, the starting region. Metres; x runs east,
// z runs south, y is up. Terrain shaping (world/terrain.ts), props, quests
// and the map all read these numbers, so moving a landmark is one edit.

import type { SpeciesId, Habitat } from './species';

export type V2 = readonly [number, number];

export const WORLD_HALF = 180;
export const PLAY_HALF = 132;
export const WATER_LEVEL = 1.0;

export interface LocationDef {
  id: string;
  name: string;
  kind: 'town' | 'landmark' | 'ruin' | 'cave' | 'nature' | 'secret';
  at: V2;
  radius: number;
  blurb: string;
}

export const LOCATIONS: LocationDef[] = [
  { id: 'outpost', name: 'Brightwater Outpost', kind: 'town', at: [10, 56], radius: 26, blurb: 'The ranger outpost: lodge, market and a warm campfire.' },
  { id: 'beacon', name: 'Beacon Hill', kind: 'landmark', at: [-20, 10], radius: 22, blurb: 'The ancient beacon that once lit the whole vale.' },
  { id: 'meadow', name: 'Sunlit Meadow', kind: 'nature', at: [-42, 46], radius: 28, blurb: 'Wildflowers, tall grass and grazing creatures.' },
  { id: 'clearing', name: 'Mossy Clearing', kind: 'nature', at: [-68, -8], radius: 10, blurb: 'A soft clearing at the edge of the wood.' },
  { id: 'forest', name: 'Whispering Wood', kind: 'nature', at: [-84, -36], radius: 34, blurb: 'Old trees, mushrooms and hidden trails.' },
  { id: 'oak', name: 'The Elder Oak', kind: 'landmark', at: [-96, -64], radius: 10, blurb: 'The oldest tree in the vale.' },
  { id: 'moonwell', name: 'Moonwell Glade', kind: 'secret', at: [-60, -66], radius: 9, blurb: 'A still pool that mirrors the moon. Something visits at night.' },
  { id: 'shrine', name: 'Thorn Shrine', kind: 'secret', at: [-108, -34], radius: 8, blurb: 'A shrine swallowed by thorns.' },
  { id: 'cave', name: 'Glimmer Cave', kind: 'cave', at: [-38, -114], radius: 14, blurb: 'Crystals glow in the dark here.' },
  { id: 'river', name: 'Brightwater Crossing', kind: 'nature', at: [50, -5], radius: 14, blurb: 'The old bridge over Brightwater River.' },
  { id: 'falls', name: 'Silverveil Falls', kind: 'landmark', at: [60, -92], radius: 16, blurb: 'A waterfall over a deep blue pool.' },
  { id: 'cove', name: 'Hidden Cove', kind: 'secret', at: [60, -115], radius: 7, blurb: 'A quiet beach behind the falls.' },
  { id: 'ruins', name: 'Old Lumen Ruins', kind: 'ruin', at: [100, -42], radius: 26, blurb: 'Mossy stonework from the beacon builders.' },
  { id: 'skyisle', name: 'Sky Pillar', kind: 'secret', at: [100, -84], radius: 5, blurb: 'A stone pillar only gliders can reach.' },
  { id: 'windmill', name: 'Windmill Rise', kind: 'landmark', at: [42, 94], radius: 12, blurb: 'The outpost windmill turns over the south fields.' },
];

export const LOCATION_BY_ID = Object.fromEntries(LOCATIONS.map((l) => [l.id, l])) as Record<string, LocationDef>;

/** River centreline from the falls pool downstream. */
export const RIVER: V2[] = [
  [60, -92], [58, -72], [52, -50], [47, -27], [50, -5], [55, 18], [62, 40], [70, 62], [76, 90], [80, 130], [82, 175],
];
export const RIVER_HALF_WIDTH = 5.5;
export const POOL = { at: [60, -92] as V2, radius: 11, floor: -4 };
export const COVE = { at: [60, -116] as V2, radius: 7 };
/** The channel under the falls that joins the pool to the cove. */
export const CHANNEL = { x0: 55, x1: 65, z0: -112, z1: -101, floor: -3.6 };
/** A rock curtain across the channel. Its bottom edge is the only way through. */
export const COVE_WALL = { x: 60, z: -104.5, halfW: 7.5, bottom: -1.3, top: 18 };

export const CAVE = {
  mouth: [-38, -99] as V2,
  hall: [-38, -118] as V2,
  hallRadius: 12,
  floor: 4.2,
  corridor: { x: -38, z0: -110, z1: -96, half: 3.4 },
  deep: [-46, -126] as V2,
};

export const HILL = { at: [-20, 10] as V2, plateau: 20, foot: 40, height: 10 };
export const OUTPOST = { at: [10, 56] as V2, radius: 30, height: 3.6 };
export const RUINS = { at: [100, -42] as V2, plateau: 22, foot: 34, height: 6.5 };
export const SKY_PILLAR = { at: [100, -84] as V2, radius: 3.6, top: 7.6 };

export const BEACON = { at: [-20, 10] as V2 };
/** The altar and the three prisms of the light puzzle sit on a 24 m square. */
export const ALTAR = { at: [-32, 22] as V2 };
export const PRISMS: { id: string; at: V2; solved: number }[] = [
  // facing index: 0 = north (−z), going clockwise in 45° steps
  { id: 'prism-1', at: [-32, -2], solved: 2 }, // east toward prism 2
  { id: 'prism-2', at: [-8, -2], solved: 4 }, // south toward prism 3
  { id: 'prism-3', at: [-8, 22], solved: 7 }, // north-west toward the beacon
];

export interface PathDef {
  points: V2[];
  width: number;
}

export const PATHS: PathDef[] = [
  { points: [[10, 56], [22, 34], [36, 4], [44, -4], [58, -6], [74, -18], [86, -32]], width: 3.2 },
  { points: [[6, 46], [-4, 32], [-14, 24]], width: 3 },
  { points: [[-2, 56], [-26, 46], [-46, 30], [-60, 10], [-68, -8], [-74, -36], [-64, -62]], width: 2.6 },
  { points: [[-64, -62], [-50, -84], [-38, -97]], width: 2.4 },
  { points: [[52, -48], [57, -72], [56, -80]], width: 2.2 },
  { points: [[18, 66], [30, 82], [42, 94]], width: 2.4 },
  { points: [[-84, -24], [-98, -30]], width: 1.6 },
];

export const BRIDGE = { from: [39.5, -4.5] as V2, to: [61, -5.5] as V2, deck: 4.1, width: 3.4 };
export const STEPPING_STONES: V2[] = [[56.5, 39], [59, 40.5], [61.5, 41.5], [64, 42.6], [66.5, 43.4]];

// ---------------------------------------------------------------------------
// Interactables. Each one has a stable id, so saves record what changed.

export type InteractKind =
  | 'pickup' | 'track' | 'sign' | 'note' | 'chest' | 'thorns' | 'brazier' | 'cracked'
  | 'basin' | 'glyph' | 'door' | 'socket' | 'altar' | 'prism' | 'rest' | 'star';

export interface InteractDef {
  id: string;
  kind: InteractKind;
  at: V2;
  /** Height offset from the ground, when not on the ground. */
  y?: number;
  rot?: number;
  item?: string;
  count?: number;
  /** Hidden until revealed (forage herbs, light glyphs). */
  hidden?: 'forage' | 'glow';
  /** Interactables gated behind this one (a chest under thorns). */
  blockedBy?: string;
  text?: string;
  title?: string;
  /** Door ids opened by this mechanism when done. */
  opens?: string;
  /** Lumens granted (chests). */
  lumens?: number;
  /** Respawns after this many in-game hours (herbs). */
  respawn?: number;
}

const herb = (id: string, item: string, at: V2, hidden?: 'forage'): InteractDef => ({ id, kind: 'pickup', at, item, count: 1, respawn: 20, hidden });

export const INTERACTABLES: InteractDef[] = [
  // Quest trail
  { id: 'track-1', kind: 'track', at: [-24, 45], rot: 2.1, title: 'Glowing prints', text: 'Small paw prints, still faintly glowing. Whatever made them was in a hurry, heading west.' },
  { id: 'track-2', kind: 'track', at: [-47, 29], rot: 2.4, title: 'Scattered sparkles', text: 'A trail of tiny sparks in the grass. The prints turn north-west toward the wood.' },
  { id: 'track-3', kind: 'track', at: [-61, 6], rot: 2.7, title: 'A shard’s glow', text: 'A broken bit of glass-bright stone. It hums like the beacon used to. The prints end in the clearing ahead.' },

  // Luminous crystals (any three restore the beacon)
  { id: 'crystal-clearing', kind: 'pickup', at: [-71, -11], item: 'crystal', count: 1 },
  { id: 'crystal-cave', kind: 'pickup', at: [-30, -124], item: 'crystal', count: 1 },
  { id: 'crystal-shrine', kind: 'pickup', at: [-109, -36], item: 'crystal', count: 1, blockedBy: 'thorns-shrine' },
  { id: 'crystal-river', kind: 'pickup', at: [41.5, -30], item: 'crystal', count: 1, blockedBy: 'cracked-river' },
  { id: 'crystal-cove', kind: 'pickup', at: [58, -118], item: 'crystal', count: 1 },

  // Ability obstacles
  { id: 'thorns-shrine', kind: 'thorns', at: [-99, -31], rot: 0.35, title: 'Thorny tangle' },
  { id: 'cracked-river', kind: 'cracked', at: [41.5, -30], title: 'Cracked boulder' },
  { id: 'cracked-ravine', kind: 'cracked', at: [-48, -88], title: 'Cracked boulder' },
  { id: 'brazier-west', kind: 'brazier', at: [106, -47.5], title: 'Ancient brazier', opens: 'door-vault' },
  { id: 'brazier-east', kind: 'brazier', at: [114, -47.5], title: 'Ancient brazier', opens: 'door-vault' },
  { id: 'door-vault', kind: 'door', at: [110, -49], title: 'Rune door' },
  { id: 'basin-ruins', kind: 'basin', at: [86, -54], title: 'Dry water basin', opens: 'door-water' },
  { id: 'door-water', kind: 'door', at: [92, -60], rot: Math.PI / 2, title: 'Water gate' },
  { id: 'door-lodge', kind: 'door', at: [0, 45.5], title: 'Lodge door' },
  { id: 'glyph-cave', kind: 'glyph', at: [-47, -128], y: 1.6, hidden: 'glow', title: 'Faded glyphs', item: 'note-cave' },

  // Outpost training yard: one for each starter
  { id: 'thorns-yard', kind: 'thorns', at: [-6, 76], title: 'Thorny bramble' },
  { id: 'cracked-yard', kind: 'cracked', at: [2, 79], title: 'Cracked rock' },
  { id: 'basin-yard', kind: 'basin', at: [10, 79], title: 'Dry fountain' },
  { id: 'chest-yard-thorns', kind: 'chest', at: [-6, 76], blockedBy: 'thorns-yard', item: 'sunberry', count: 2, lumens: 6 },
  { id: 'chest-yard-rock', kind: 'chest', at: [2, 79], blockedBy: 'cracked-yard', item: 'crunchroot', count: 2, lumens: 6 },

  // Chests
  { id: 'chest-vault', kind: 'chest', at: [110, -54], item: 'amber', count: 2, lumens: 25 },
  { id: 'chest-water', kind: 'chest', at: [96, -61], item: 'kelp', count: 3, lumens: 15 },
  { id: 'chest-sky', kind: 'chest', at: [100, -84], y: 0, item: 'feather', count: 2, lumens: 30 },
  { id: 'chest-cove', kind: 'chest', at: [62.5, -118.5], item: 'pearl', count: 1, lumens: 20 },
  { id: 'chest-cave', kind: 'chest', at: [-48, -125], blockedBy: 'glyph-cave', item: 'glowcap', count: 3, lumens: 20 },
  { id: 'chest-oak', kind: 'chest', at: [-92, -67], item: 'honeyblossom', count: 2, lumens: 10 },
  { id: 'chest-ravine', kind: 'chest', at: [-50, -92], blockedBy: 'cracked-ravine', item: 'amber', count: 1, lumens: 12 },

  // Beacon and its puzzle
  { id: 'socket', kind: 'socket', at: [-17.2, 13.6], title: 'Beacon heart sockets' },
  { id: 'altar', kind: 'altar', at: [-32, 22], title: 'Resonance altar' },
  { id: 'prism-1', kind: 'prism', at: [-32, -2], title: 'Light prism' },
  { id: 'prism-2', kind: 'prism', at: [-8, -2], title: 'Light prism' },
  { id: 'prism-3', kind: 'prism', at: [-8, 22], title: 'Light prism' },

  // Signs and notes
  { id: 'sign-outpost', kind: 'sign', at: [16, 31], rot: 0.4, title: 'Signpost', text: '↑ Brightwater Crossing & Old Lumen Ruins  ← Beacon Hill  ↖ Sunlit Meadow & Whispering Wood' },
  { id: 'sign-bridge', kind: 'sign', at: [36, 0], rot: -0.4, title: 'Signpost', text: 'East: Old Lumen Ruins. North along the river: Silverveil Falls.' },
  { id: 'sign-wood', kind: 'sign', at: [-58, 14], rot: 0.6, title: 'Signpost', text: 'Whispering Wood. Walk softly — the Thornlade are watching.' },
  { id: 'sign-cave', kind: 'sign', at: [-44, -94], rot: 0.2, title: 'Warning sign', text: 'Glimmer Cave. Bring light, or a friend who glows.' },
  { id: 'sign-falls', kind: 'sign', at: [52, -80], rot: -0.3, title: 'Weathered sign', text: 'The pool is deep. Swimmers say the falls hide something — if only one could dive.' },
  { id: 'note-lodge', kind: 'note', at: [-2, 40.6], y: 0.95, item: 'note-ranger', title: 'Ranger’s Log' },
  { id: 'note-ruins', kind: 'note', at: [104, -36], y: 0.6, item: 'note-ruins', title: 'Inscribed tablet' },
  { id: 'note-grotto', kind: 'note', at: [56.5, -119], y: 0.4, item: 'note-grotto', title: 'Bottle with a note' },

  // Rest spot
  { id: 'campfire', kind: 'rest', at: [-5, 60], title: 'Campfire' },

  // Herbs (foods). Some are only found by a foraging companion.
  herb('herb-sun-1', 'sunberry', [-30, 52]), herb('herb-sun-2', 'sunberry', [-52, 40]), herb('herb-sun-3', 'sunberry', [24, 20]),
  herb('herb-sun-4', 'sunberry', [84, -26]),
  herb('herb-root-1', 'crunchroot', [-40, 60]), herb('herb-root-2', 'crunchroot', [-14, 34]), herb('herb-root-3', 'crunchroot', [-62, 24]),
  herb('herb-kelp-1', 'kelp', [46.5, -20]), herb('herb-kelp-2', 'kelp', [57, 26]), herb('herb-kelp-3', 'kelp', [52, -80]),
  herb('herb-puff-1', 'cloudpuff', [92, -30]), herb('herb-puff-2', 'cloudpuff', [36, 86]), herb('herb-puff-3', 'cloudpuff', [-2, 4]),
  herb('herb-cap-1', 'glowcap', [-80, -48]), herb('herb-cap-2', 'glowcap', [-34, -110]), herb('herb-cap-3', 'glowcap', [-58, -70]),
  herb('herb-blos-1', 'honeyblossom', [-90, -18]), herb('herb-blos-2', 'honeyblossom', [-76, -56]), herb('herb-blos-3', 'honeyblossom', [-104, -50]),
  herb('herb-hidden-1', 'honeyblossom', [-70, -30], 'forage'), herb('herb-hidden-2', 'glowcap', [-86, -72], 'forage'),
  herb('herb-hidden-3', 'cloudpuff', [-36, 64], 'forage'), herb('herb-hidden-4', 'sunberry', [28, 44], 'forage'),
  herb('herb-hidden-5', 'kelp', [64, 52], 'forage'),

  // Star fragments: hidden collectibles
  { id: 'star-1', kind: 'star', at: [46, -6], y: 0.5 },
  { id: 'star-2', kind: 'star', at: [44, 100] },
  { id: 'star-3', kind: 'star', at: [-104, -38] },
  { id: 'star-4', kind: 'star', at: [-62, -68] },
  { id: 'star-5', kind: 'star', at: [61, -114] },
  { id: 'star-6', kind: 'star', at: [102, -82.5] },
  { id: 'star-7', kind: 'star', at: [-27, -128] },
  { id: 'star-8', kind: 'star', at: [-98, -60] },
];

export const STAR_COUNT = INTERACTABLES.filter((i) => i.kind === 'star').length;

// ---------------------------------------------------------------------------
// Wild creatures. Each individual is persistent: its id keys its trust.

export interface SpawnDef {
  id: string;
  species: SpeciesId;
  at: V2;
  roam: number;
  habitat: Habitat;
  /** Only present during the night (20:00–05:00). */
  nightOnly?: boolean;
  /** Fixed variant for scripted encounters. */
  variant?: string;
  /** Present only during this quest stage or later. */
  quest?: boolean;
}

export const SPAWNS: SpawnDef[] = [
  { id: 'w-flam-1', species: 'flamkit', at: [-36, 40], roam: 14, habitat: 'meadow' },
  { id: 'w-flam-2', species: 'flamkit', at: [28, 18], roam: 12, habitat: 'meadow' },
  { id: 'w-flam-3', species: 'flamkit', at: [88, -30], roam: 12, habitat: 'ruins' },
  { id: 'w-flam-4', species: 'flamkit', at: [-16, 84], roam: 10, habitat: 'meadow' },
  { id: 'w-aqua-1', species: 'aquoray', at: [52, -46], roam: 8, habitat: 'river' },
  { id: 'w-aqua-2', species: 'aquoray', at: [53, 12], roam: 8, habitat: 'river' },
  { id: 'w-aqua-3', species: 'aquoray', at: [64, 46], roam: 8, habitat: 'river' },
  { id: 'w-aqua-4', species: 'aquoray', at: [58, -88], roam: 7, habitat: 'river' },
  { id: 'w-terra-1', species: 'terrabun', at: [-52, 56], roam: 12, habitat: 'meadow' },
  { id: 'w-terra-2', species: 'terrabun', at: [-30, 26], roam: 10, habitat: 'meadow' },
  { id: 'w-terra-3', species: 'terrabun', at: [18, 6], roam: 10, habitat: 'meadow' },
  { id: 'w-terra-4', species: 'terrabun', at: [-60, 8], roam: 10, habitat: 'forest' },
  { id: 'w-zeph-1', species: 'zephyra', at: [98, -52], roam: 12, habitat: 'ruins' },
  { id: 'w-zeph-2', species: 'zephyra', at: [92, -28], roam: 10, habitat: 'ruins' },
  { id: 'w-zeph-3', species: 'zephyra', at: [38, 86], roam: 10, habitat: 'meadow' },
  { id: 'w-lume-quest', species: 'lumelle', at: [-68, -6], roam: 4, habitat: 'forest', quest: true },
  { id: 'w-lume-1', species: 'lumelle', at: [-38, -118], roam: 7, habitat: 'cave' },
  { id: 'w-lume-2', species: 'lumelle', at: [-32, -112], roam: 6, habitat: 'cave' },
  { id: 'w-lume-3', species: 'lumelle', at: [-80, -40], roam: 12, habitat: 'forest', nightOnly: true },
  { id: 'w-lume-moon', species: 'lumelle', at: [-60, -66], roam: 4, habitat: 'forest', nightOnly: true, variant: 'moonlit' },
  { id: 'w-thorn-1', species: 'thornlade', at: [-82, -22], roam: 10, habitat: 'forest' },
  { id: 'w-thorn-2', species: 'thornlade', at: [-96, -50], roam: 10, habitat: 'forest' },
  { id: 'w-thorn-3', species: 'thornlade', at: [-62, -46], roam: 10, habitat: 'forest' },
  { id: 'w-thorn-4', species: 'thornlade', at: [-110, -14], roam: 10, habitat: 'forest' },
];

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  at: V2;
  facing: number;
}

export const NPCS: NpcDef[] = [
  { id: 'elen', name: 'Elen', role: 'Head Ranger', at: [4, 49], facing: Math.PI * 0.15 },
  { id: 'pip', name: 'Pip', role: 'Merchant', at: [21, 61.5], facing: -Math.PI * 0.6 },
  { id: 'bram', name: 'Old Bram', role: 'Lorekeeper', at: [-8.5, 62.5], facing: Math.PI * 0.75 },
  { id: 'nia', name: 'Nia', role: 'Ranger in training', at: [5, 72], facing: Math.PI * 0.9 },
];

export const PLAYER_START = { at: [8, 60] as V2, facing: Math.PI };
