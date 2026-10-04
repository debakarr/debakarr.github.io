import type { Grid } from '../core/hex';
import { Rng } from '../core/rng';
import { UNIT } from '../data/units';
import type { City, Civ, GameState, HistoryEvent, Notice, Unit } from './state';
import { gridFor } from './worldgen';

export type GameEvent =
  | { type: 'notice'; notice: Notice }
  | { type: 'history'; event: HistoryEvent }
  | { type: 'combat'; from: number; to: number; dmgAtk: number; dmgDef: number; killed: boolean; civs: number[] }
  | { type: 'move'; unitId: number; from: number; to: number }
  | { type: 'found'; tile: number; civId: number }
  | { type: 'capture'; tile: number; civId: number }
  | { type: 'decision' }
  | { type: 'reveal' };

/** Runtime wrapper around GameState: indices, RNG, and an event channel for the UI. */
export class Game {
  s: GameState;
  grid: Grid;
  rng: Rng;
  unitsAt = new Map<number, number[]>();
  private cityCache: Map<number, City[]> | null = null;
  private unitCache: Map<number, Unit[]> | null = null;
  private listeners: ((e: GameEvent) => void)[] = [];
  /** Set while the UI is fast-forwarding so effects can be skipped. */
  quiet = false;
  /** The AI is governing the player's civilization this turn. */
  autoplay = false;

  constructor(state: GameState) {
    this.s = state;
    this.grid = gridFor(state.map.w, state.map.h);
    this.rng = new Rng(state.rng);
    this.reindex();
  }

  reindex(): void {
    this.unitsAt.clear();
    for (const u of Object.values(this.s.units)) this.addUnitAt(u.tile, u.id);
    this.cityCache = null;
    this.unitCache = null;
  }

  on(fn: (e: GameEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  get turn(): number {
    return this.s.turn;
  }

  get player(): Civ {
    return this.s.civs[this.s.playerId];
  }

  civ(id: number): Civ {
    return this.s.civs[id];
  }

  city(id: number): City | undefined {
    return this.s.cities[id];
  }

  unit(id: number): Unit | undefined {
    return this.s.units[id];
  }

  nextId(): number {
    return this.s.nextId++;
  }

  syncRng(): void {
    this.s.rng = this.rng.s;
  }

  // --- Indexed lookups ------------------------------------------------------

  citiesOf(civId: number): City[] {
    if (!this.cityCache) {
      this.cityCache = new Map();
      for (const c of Object.values(this.s.cities)) {
        let list = this.cityCache.get(c.civId);
        if (!list) this.cityCache.set(c.civId, (list = []));
        list.push(c);
      }
      for (const list of this.cityCache.values()) list.sort((a, b) => a.id - b.id);
    }
    return this.cityCache.get(civId) ?? [];
  }

  unitsOf(civId: number): Unit[] {
    if (!this.unitCache) {
      this.unitCache = new Map();
      for (const u of Object.values(this.s.units)) {
        let list = this.unitCache.get(u.civId);
        if (!list) this.unitCache.set(u.civId, (list = []));
        list.push(u);
      }
      for (const list of this.unitCache.values()) list.sort((a, b) => a.id - b.id);
    }
    return this.unitCache.get(civId) ?? [];
  }

  citiesDirty(): void {
    this.cityCache = null;
  }

  unitsDirty(): void {
    this.unitCache = null;
  }

  aliveCivs(): Civ[] {
    return this.s.civs.filter((c) => c.alive);
  }

  cityAt(tile: number): City | undefined {
    const id = this.s.map.cityAt[tile];
    return id >= 0 ? this.s.cities[id] : undefined;
  }

  unitsOn(tile: number): Unit[] {
    const ids = this.unitsAt.get(tile);
    if (!ids) return [];
    const out: Unit[] = [];
    for (const id of ids) {
      const u = this.s.units[id];
      if (u) out.push(u);
    }
    return out;
  }

  addUnitAt(tile: number, id: number): void {
    let list = this.unitsAt.get(tile);
    if (!list) this.unitsAt.set(tile, (list = []));
    list.push(id);
  }

  removeUnitAt(tile: number, id: number): void {
    const list = this.unitsAt.get(tile);
    if (!list) return;
    const k = list.indexOf(id);
    if (k >= 0) list.splice(k, 1);
    if (!list.length) this.unitsAt.delete(tile);
  }

  /** Strongest military unit on a tile (the one that defends). */
  defenderOn(tile: number): Unit | undefined {
    let best: Unit | undefined;
    let bestStr = -1;
    for (const u of this.unitsOn(tile)) {
      const def = UNIT[u.type];
      const s = def.str * (u.hp / 100);
      if (s > bestStr) {
        bestStr = s;
        best = u;
      }
    }
    return best;
  }

  capital(civ: Civ): City | undefined {
    return civ.capitalId >= 0 ? this.s.cities[civ.capitalId] : undefined;
  }

  knows(a: number, b: number): boolean {
    if (a === b) return true;
    const rel = this.s.civs[a].relations[b];
    return !!rel && rel.met >= 0;
  }

  atWar(a: number, b: number): boolean {
    if (a === b) return false;
    const rel = this.s.civs[a].relations[b];
    return !!rel && rel.war;
  }

  enemiesOf(civId: number): number[] {
    const civ = this.s.civs[civId];
    const out: number[] = [];
    for (const k in civ.relations) if (civ.relations[k].war) out.push(Number(k));
    return out;
  }

  /** Notify the player, if the message concerns them or something they can see. */
  notify(text: string, tone: Notice['tone'] = 'info', tile = -1): void {
    const notice: Notice = { id: this.nextId(), turn: this.s.turn, text, tile, tone };
    this.s.notices.push(notice);
    if (this.s.notices.length > 160) this.s.notices.splice(0, this.s.notices.length - 160);
    this.emit({ type: 'notice', notice });
  }

  playerSees(tile: number): boolean {
    return tile >= 0 && this.player.visible[tile] > 0;
  }

  paceMult(): number {
    const p = this.s.settings.pace;
    return p === 'quick' ? 0.55 : p === 'epic' ? 1.5 : 1;
  }

  /** AI handicap/bonus multiplier on yields. */
  aiBonus(civ: Civ): number {
    if (civ.isPlayer) return 1;
    return [0.8, 1, 1.15, 1.3][this.s.settings.difficulty] ?? 1;
  }

  chance(p: number): boolean {
    return this.rng.next() < p;
  }
}

export function yearsAgo(now: number, then: number): string {
  const d = now - then;
  if (d <= 0) return 'this year';
  if (d === 1) return 'last year';
  return `${d} years ago`;
}
