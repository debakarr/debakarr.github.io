import type { Game } from '../sim/game';

// The map view contract shared by the 3D renderer and the canvas fallback.
// Camera coordinates are in "map pixels": tile centres from Grid.center(i, HEX).

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Overlay {
  selectedTile: number;
  selectedUnit: number;
  hoverTile: number;
  reach: Map<number, number> | null;
  attack: Set<number> | null;
  path: number[] | null;
  pathTurns: number[] | null;
  pathAttack: boolean;
}

export type EffectKind = 'text' | 'ring' | 'flash';

export interface MapView {
  readonly canvas: HTMLCanvasElement;
  cam: Camera;
  overlay: Overlay;
  animations: boolean;
  onCamera?: () => void;
  setGame(g: Game): void;
  invalidate(): void;
  request(): void;
  resize(): void;
  readonly viewW: number;
  readonly viewH: number;
  worldSize(): [number, number];
  clampCamera(): void;
  screenToWorld(sx: number, sy: number): [number, number];
  worldToScreen(x: number, y: number): [number, number];
  tileAt(sx: number, sy: number): number;
  tileScreen(tile: number): [number, number];
  pan(dx: number, dy: number): void;
  zoomAt(factor: number, sx: number, sy: number): void;
  centerOn(tile: number, smooth?: boolean, lift?: number, shift?: number): void;
  isOnScreen(tile: number, margin?: number): boolean;
  addEffect(kind: EffectKind, tile: number, color: string, text?: string, dur?: number): void;
  animateMove(unitId: number, from: number, to: number): void;
  /** The ground area in view as a polygon of map-pixel points (perspective views are trapezoids). */
  viewPolygon?(): [number, number][];
}
