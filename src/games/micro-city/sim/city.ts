import { Rng } from '../../shared/rng';
import type { CoverageKind } from './defs';
import type { CityState, NewsItem } from './state';

export interface Factor {
  key: string;
  label: string;
  value: number;
}

export type CityEvent =
  | { type: 'news'; item: NewsItem }
  | { type: 'changed'; tiles?: number[] }
  | { type: 'milestone'; index: number }
  | { type: 'disaster'; kind: string; tile: number };

export const COVERAGE_KINDS: CoverageKind[] = ['police', 'fire', 'health', 'education', 'transit', 'metro', 'park', 'flood', 'drain'];

/** Runtime wrapper: saved state plus derived simulation layers. */
export class City {
  s: CityState;
  readonly w: number;
  readonly h: number;
  readonly n: number;
  rng: Rng;
  /** 4-neighbours (E, S, W, N), -1 at edges. */
  readonly nb: Int32Array;

  // Derived layers (recomputed, never saved).
  roadComp: Int32Array;
  /** Nearest road tile within three steps, or -1. */
  access: Int32Array;
  garbageShortage = 0;
  incinerators = 0;
  grewThisMonth = 0;
  /** How much people want to live here (-1..1). */
  attract = 0.5;
  /** Average happiness contributions per resident, worst first. */
  factors: Factor[] = [];
  cov: Record<CoverageKind, Float32Array>;
  edu: Float32Array;
  air: Float32Array;
  noise: Float32Array;
  land: Float32Array;
  crime: Float32Array;
  happy: Float32Array;
  flow: Float32Array;
  congestion: Float32Array;
  roadTime: Float32Array;
  /** Per-district average commute (minutes) and transit share. */
  distCommute: Float32Array;
  distTransit: Float32Array;
  readonly dsz = 12;
  readonly dw: number;
  readonly dh: number;
  dirtyNet = true;
  dirtyCov = true;
  private listeners: ((e: CityEvent) => void)[] = [];

  constructor(state: CityState) {
    this.s = state;
    this.w = state.settings.size;
    this.h = state.settings.size;
    this.n = this.w * this.h;
    this.rng = new Rng(state.rng);
    this.nb = new Int32Array(this.n * 4).fill(-1);
    for (let i = 0; i < this.n; i++) {
      const x = i % this.w;
      const y = (i / this.w) | 0;
      if (x + 1 < this.w) this.nb[i * 4] = i + 1;
      if (y + 1 < this.h) this.nb[i * 4 + 1] = i + this.w;
      if (x > 0) this.nb[i * 4 + 2] = i - 1;
      if (y > 0) this.nb[i * 4 + 3] = i - this.w;
    }
    const f = () => new Float32Array(this.n);
    this.roadComp = new Int32Array(this.n).fill(-1);
    this.access = new Int32Array(this.n).fill(-1);
    this.cov = Object.fromEntries(COVERAGE_KINDS.map((k) => [k, f()])) as Record<CoverageKind, Float32Array>;
    this.edu = f();
    this.air = f();
    this.noise = f();
    this.land = f();
    this.crime = f();
    this.happy = f();
    this.flow = f();
    this.congestion = f();
    this.roadTime = f();
    this.dw = Math.ceil(this.w / this.dsz);
    this.dh = Math.ceil(this.h / this.dsz);
    this.distCommute = new Float32Array(this.dw * this.dh);
    this.distTransit = new Float32Array(this.dw * this.dh);
  }

  on(fn: (e: CityEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  emit(e: CityEvent): void {
    for (const l of this.listeners) l(e);
  }

  idx(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  }

  x(i: number): number {
    return i % this.w;
  }

  y(i: number): number {
    return (i / this.w) | 0;
  }

  district(i: number): number {
    return ((this.y(i) / this.dsz) | 0) * this.dw + ((this.x(i) / this.dsz) | 0);
  }

  nextId(): number {
    return this.s.nextId++;
  }

  syncRng(): void {
    this.s.rng = this.rng.s;
  }

  /** Months since founding -> "Mar, Year 4". */
  dateLabel(tick = this.s.tick): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[tick % 12]}, Year ${Math.floor(tick / 12)}`;
  }

  get year(): number {
    return Math.floor(this.s.tick / 12);
  }

  get month(): number {
    return this.s.tick % 12;
  }

  currency(n: number): string {
    const sym = this.s.settings.region === 'india' ? '₹' : '$';
    const a = Math.abs(n);
    const sign = n < 0 ? '−' : '';
    if (a >= 1e9) return `${sign}${sym}${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${sign}${sym}${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e4) return `${sign}${sym}${(a / 1e3).toFixed(1)}k`;
    return `${sign}${sym}${Math.round(a).toLocaleString('en-US')}`;
  }

  news(kind: NewsItem['kind'], text: string, tile = -1): void {
    const item: NewsItem = { id: this.nextId(), tick: this.s.tick, kind, text, tile };
    this.s.news.push(item);
    if (this.s.news.length > 120) this.s.news.splice(0, this.s.news.length - 120);
    this.emit({ type: 'news', item });
  }

  history(kind: string, imp: number, text: string, tile = -1): void {
    this.s.history.push({ tick: this.s.tick, kind, imp, text, tile });
  }
}
