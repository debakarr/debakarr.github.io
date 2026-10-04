// Terrain, features, resources and tile improvements.

export const enum T {
  Ocean = 0,
  Coast = 1,
  Lake = 2,
  Grass = 3,
  Plains = 4,
  Desert = 5,
  Tundra = 6,
  Snow = 7,
}

export const enum Relief {
  Flat = 0,
  Hills = 1,
  Mountain = 2,
}

export const enum F {
  None = 0,
  Forest = 1,
  Jungle = 2,
  Marsh = 3,
  Oasis = 4,
  Floodplain = 5,
  Ice = 6,
  Volcano = 7,
  Ash = 8,
}

export interface Yields {
  food: number;
  prod: number;
  trade: number;
}

export const TERRAIN: Record<number, { name: string; y: Yields; water: boolean }> = {
  [T.Ocean]: { name: 'Ocean', y: { food: 1, prod: 0, trade: 1 }, water: true },
  [T.Coast]: { name: 'Coast', y: { food: 1, prod: 0, trade: 2 }, water: true },
  [T.Lake]: { name: 'Lake', y: { food: 2, prod: 0, trade: 2 }, water: true },
  [T.Grass]: { name: 'Grassland', y: { food: 2, prod: 0, trade: 1 }, water: false },
  [T.Plains]: { name: 'Plains', y: { food: 1, prod: 1, trade: 1 }, water: false },
  [T.Desert]: { name: 'Desert', y: { food: 0, prod: 0, trade: 1 }, water: false },
  [T.Tundra]: { name: 'Tundra', y: { food: 1, prod: 0, trade: 0 }, water: false },
  [T.Snow]: { name: 'Snow', y: { food: 0, prod: 0, trade: 0 }, water: false },
};

export const FEATURE_NAME: Record<number, string> = {
  [F.None]: '',
  [F.Forest]: 'Forest',
  [F.Jungle]: 'Jungle',
  [F.Marsh]: 'Marsh',
  [F.Oasis]: 'Oasis',
  [F.Floodplain]: 'Floodplain',
  [F.Ice]: 'Ice',
  [F.Volcano]: 'Volcano',
  [F.Ash]: 'Volcanic soil',
};

export const enum R {
  None = 0,
  Grain,
  Fish,
  Cattle,
  Iron,
  Horses,
  Coal,
  Oil,
  Uranium,
  Spices,
  Gems,
  Silk,
  RareMinerals,
}

export type ResourceKind = 'food' | 'strategic' | 'luxury';

export interface ResourceDef {
  id: R;
  key: string;
  name: string;
  kind: ResourceKind;
  y: Yields;
  /** Tech that reveals it on the map. */
  reveal?: string;
  color: string;
}

export const RESOURCES: ResourceDef[] = [
  { id: R.None, key: 'none', name: '', kind: 'food', y: { food: 0, prod: 0, trade: 0 }, color: '#000' },
  { id: R.Grain, key: 'grain', name: 'Grain', kind: 'food', y: { food: 2, prod: 0, trade: 0 }, color: '#e8c25a' },
  { id: R.Fish, key: 'fish', name: 'Fish', kind: 'food', y: { food: 2, prod: 0, trade: 0 }, color: '#7fc8d8' },
  { id: R.Cattle, key: 'cattle', name: 'Cattle', kind: 'food', y: { food: 1, prod: 1, trade: 0 }, color: '#b98a5e' },
  { id: R.Iron, key: 'iron', name: 'Iron', kind: 'strategic', y: { food: 0, prod: 2, trade: 0 }, reveal: 'bronze', color: '#9aa4ad' },
  { id: R.Horses, key: 'horses', name: 'Horses', kind: 'strategic', y: { food: 0, prod: 1, trade: 1 }, reveal: 'husbandry', color: '#c9a27a' },
  { id: R.Coal, key: 'coal', name: 'Coal', kind: 'strategic', y: { food: 0, prod: 2, trade: 0 }, reveal: 'industrialization', color: '#55575c' },
  { id: R.Oil, key: 'oil', name: 'Oil', kind: 'strategic', y: { food: 0, prod: 3, trade: 0 }, reveal: 'combustion', color: '#2d2a33' },
  { id: R.Uranium, key: 'uranium', name: 'Uranium', kind: 'strategic', y: { food: 0, prod: 2, trade: 1 }, reveal: 'fission', color: '#9be36d' },
  { id: R.Spices, key: 'spices', name: 'Spices', kind: 'luxury', y: { food: 1, prod: 0, trade: 2 }, color: '#d9733b' },
  { id: R.Gems, key: 'gems', name: 'Gems', kind: 'luxury', y: { food: 0, prod: 0, trade: 3 }, color: '#5ad1c2' },
  { id: R.Silk, key: 'silk', name: 'Silk', kind: 'luxury', y: { food: 0, prod: 0, trade: 3 }, color: '#e7a6c8' },
  { id: R.RareMinerals, key: 'minerals', name: 'Rare Minerals', kind: 'luxury', y: { food: 0, prod: 1, trade: 2 }, color: '#b28be0' },
];

export const enum Imp {
  None = 0,
  Farm,
  Mine,
  Pasture,
  Plantation,
  Lumber,
  Boats,
  OilWell,
}

export interface ImprovementDef {
  id: Imp;
  name: string;
  tech: string;
  y: Yields;
}

export const IMPROVEMENTS: ImprovementDef[] = [
  { id: Imp.None, name: '', tech: '', y: { food: 0, prod: 0, trade: 0 } },
  { id: Imp.Farm, name: 'Farm', tech: 'agriculture', y: { food: 1, prod: 0, trade: 0 } },
  { id: Imp.Mine, name: 'Mine', tech: 'mining', y: { food: 0, prod: 1, trade: 0 } },
  { id: Imp.Pasture, name: 'Pasture', tech: 'husbandry', y: { food: 1, prod: 1, trade: 0 } },
  { id: Imp.Plantation, name: 'Plantation', tech: 'calendar', y: { food: 0, prod: 0, trade: 2 } },
  { id: Imp.Lumber, name: 'Lumber camp', tech: 'construction', y: { food: 0, prod: 1, trade: 0 } },
  { id: Imp.Boats, name: 'Fishing boats', tech: 'sailing', y: { food: 1, prod: 0, trade: 1 } },
  { id: Imp.OilWell, name: 'Oil well', tech: 'combustion', y: { food: 0, prod: 2, trade: 0 } },
];

// Map colors, matched to the average colors of the Kenney hex tiles so the
// zoomed-out view, the minimap and world previews agree with the sprites.
export const TERRAIN_COLOR: Record<number, [number, number, number]> = {
  [T.Ocean]: [36, 94, 158],
  [T.Coast]: [58, 138, 204],
  [T.Lake]: [72, 156, 212],
  [T.Grass]: [39, 174, 96],
  [T.Plains]: [187, 128, 68],
  [T.Desert]: [233, 217, 181],
  [T.Tundra]: [164, 175, 175],
  [T.Snow]: [232, 238, 242],
};
