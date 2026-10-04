import type { IconKey } from '../art';
import type { City } from '../sim/city';
import {
  applyZone, buildRoad, bulldoze, footprint, placeBuilding, planBuilding, planBulldoze, planRoad, planZone,
  rectTiles, roadPath, unlocked, unlockName, type ActionResult,
} from '../sim/build';
import { BUILDING, BUILDINGS, ROADS, Road, Zone, ZONE_NAME, type BuildingCat } from '../sim/defs';

export type ToolKind = 'inspect' | 'bulldoze' | 'road' | 'zone' | 'building';

export interface Tool {
  id: string;
  kind: ToolKind;
  label: string;
  icon: IconKey;
  /** Shown under the label: cost per tile, per building... */
  note: string;
  unlock: string;
  road?: Road;
  zone?: Zone;
  dense?: number;
  building?: string;
}

export interface ToolGroup {
  id: string;
  label: string;
  icon: IconKey;
  tools: Tool[];
}

const ZONE_ICON: IconKey[] = ['z-dezone', 'z-res', 'z-com', 'z-ind', 'z-off'];
const ZKEY = ['', 'res', 'com', 'ind', 'off'];

function zoneTools(): Tool[] {
  const out: Tool[] = [];
  for (const z of [Zone.Res, Zone.Com, Zone.Ind, Zone.Off]) {
    for (const dense of [0, 1]) {
      out.push({
        id: `zone-${ZKEY[z]}-${dense ? 'high' : 'low'}`,
        kind: 'zone',
        label: `${ZONE_NAME[z]}${dense ? ' (dense)' : ''}`,
        icon: ZONE_ICON[z],
        note: dense ? 'High density · 5/tile' : 'Low density · 5/tile',
        unlock: `${ZKEY[z]}-${dense ? 'high' : 'low'}`,
        zone: z,
        dense,
      });
    }
  }
  out.push({ id: 'dezone', kind: 'zone', label: 'Dezone', icon: 'z-dezone', note: 'Free', unlock: 'street', zone: Zone.None, dense: 0 });
  return out;
}

function buildingTools(cats: BuildingCat[]): Tool[] {
  return BUILDINGS.filter((b) => cats.includes(b.cat) && b.id !== 'cityhall').map((b) => ({
    id: `b-${b.id}`,
    kind: 'building' as const,
    label: b.name,
    icon: b.icon as IconKey,
    note: b.cost ? `${b.cost.toLocaleString('en-US')} · ${b.upkeep}/mo` : 'Free',
    unlock: b.id,
    building: b.id,
  }));
}

export const GROUPS: ToolGroup[] = [
  { id: 'inspect', label: 'Inspect', icon: 't-inspect', tools: [{ id: 'inspect', kind: 'inspect', label: 'Inspect', icon: 't-inspect', note: 'Tap anything for details', unlock: 'street' }] },
  { id: 'bulldoze', label: 'Bulldoze', icon: 't-bulldoze', tools: [{ id: 'bulldoze', kind: 'bulldoze', label: 'Bulldoze', icon: 't-bulldoze', note: 'Drag to clear', unlock: 'street' }] },
  {
    id: 'roads', label: 'Roads', icon: 't-road',
    tools: [Road.Street, Road.Avenue, Road.Highway].map((r) => ({
      id: `road-${r}`,
      kind: 'road' as const,
      label: ROADS[r].name,
      icon: 't-road' as IconKey,
      note: `${ROADS[r].cost}/tile · bridges ×5`,
      unlock: ['', 'street', 'avenue', 'highway'][r],
      road: r,
    })),
  },
  { id: 'zones', label: 'Zones', icon: 't-zone', tools: zoneTools() },
  { id: 'power', label: 'Power', icon: 't-power', tools: buildingTools(['power']) },
  { id: 'water', label: 'Water & waste', icon: 't-water', tools: buildingTools(['water', 'sewage', 'garbage']) },
  { id: 'services', label: 'Services', icon: 't-services', tools: buildingTools(['police', 'fire', 'health', 'education']) },
  { id: 'parks', label: 'Parks & landmarks', icon: 't-parks', tools: buildingTools(['park', 'landmark']) },
  { id: 'transit', label: 'Transit', icon: 't-transit', tools: buildingTools(['transit']) },
  { id: 'flood', label: 'Flood defense', icon: 't-flood', tools: buildingTools(['flood']) },
];

export const TOOL: Record<string, Tool> = Object.fromEntries(GROUPS.flatMap((g) => g.tools.map((t) => [t.id, t])));

export function toolUnlocked(c: City, t: Tool): boolean {
  return unlocked(c, t.unlock);
}

export function toolLockNote(t: Tool): string {
  return `Unlocks at ${unlockName(t.unlock)}`;
}

export interface Plan {
  result: ActionResult;
  /** Tiles to highlight. */
  tiles: number[];
  apply: () => ActionResult;
  building?: { type: string; x: number; y: number };
}

/** Work out what a tool would do between a drag start and end tile. */
export function planTool(c: City, tool: Tool, a: number, b: number): Plan | null {
  if (a < 0 || b < 0) return null;
  switch (tool.kind) {
    case 'road': {
      const path = roadPath(c, a, b);
      const r = planRoad(c, path, tool.road!);
      return { result: r, tiles: path, apply: () => buildRoad(c, path, tool.road!) };
    }
    case 'zone': {
      const tiles = rectTiles(c, a, b);
      const r = planZone(c, tiles, tool.zone!, tool.dense!);
      return { result: r, tiles: r.tiles.length ? r.tiles : tiles, apply: () => applyZone(c, tiles, tool.zone!, tool.dense!) };
    }
    case 'bulldoze': {
      const tiles = rectTiles(c, a, b);
      const r = planBulldoze(c, tiles);
      return { result: r, tiles: r.tiles.length ? r.tiles : tiles, apply: () => bulldoze(c, tiles) };
    }
    case 'building': {
      const def = BUILDING[tool.building!];
      const x = c.x(b) - ((def.w - 1) >> 1);
      const y = c.y(b) - ((def.h - 1) >> 1);
      const r = planBuilding(c, def.id, x, y);
      return {
        result: r,
        tiles: footprint(c, def, x, y).filter((i) => i >= 0),
        apply: () => placeBuilding(c, def.id, x, y),
        building: { type: def.id, x, y },
      };
    }
    default:
      return null;
  }
}
