// Deterministic PRNG. Every random choice in world generation and the
// simulation flows through one of these so a seed reproduces a world exactly.

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += h << 13;
  h ^= h >>> 7;
  h += h << 3;
  h ^= h >>> 17;
  h += h << 5;
  return h >>> 0;
}

export class Rng {
  s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** mulberry32 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** inclusive range */
  range(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  float(a: number, b: number): number {
    return a + this.next() * (b - a);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  weighted<T>(items: readonly (readonly [T, number])[]): T | undefined {
    let total = 0;
    for (const [, w] of items) if (w > 0) total += w;
    if (total <= 0) return undefined;
    let roll = this.next() * total;
    for (const [item, w] of items) {
      if (w <= 0) continue;
      roll -= w;
      if (roll <= 0) return item;
    }
    return items[items.length - 1][0];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  fork(salt: string | number): Rng {
    return new Rng(hashString(`${this.s}:${salt}`));
  }
}

export function randomSeedString(): string {
  const words = [
    'amber', 'ash', 'basalt', 'cedar', 'cinder', 'delta', 'dune', 'ember', 'fjord', 'flint',
    'glacier', 'harbor', 'iron', 'jade', 'kelp', 'lotus', 'marsh', 'mesa', 'north', 'obsidian',
    'onyx', 'reed', 'saffron', 'salt', 'shale', 'tide', 'tundra', 'umber', 'vale', 'willow',
  ];
  const a = words[Math.floor(Math.random() * words.length)];
  const b = words[Math.floor(Math.random() * words.length)];
  return `${a}-${b}-${Math.floor(Math.random() * 9000 + 1000)}`;
}
