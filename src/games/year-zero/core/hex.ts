// Pointy-top hexes in "odd-r" offset layout: odd rows are shifted half a hex right.
// Tiles are addressed by a flat index i = row * w + col.

export const SQRT3 = Math.sqrt(3);

// Direction order: E, NE, NW, W, SW, SE (axial deltas).
const AXIAL_DIRS: readonly [number, number][] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

// Corner pairs bounding the edge that faces each direction.
// Corner k sits at angle (60k - 30) degrees, screen y pointing down.
export const EDGE_CORNERS: readonly [number, number][] = [
  [0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2],
];

export const CORNERS: readonly [number, number][] = Array.from({ length: 6 }, (_, k) => {
  const a = ((60 * k - 30) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)] as [number, number];
});

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly size: number;
  /** neighbors[i * 6 + d] = tile index or -1 */
  readonly neighbors: Int32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.size = w * h;
    this.neighbors = new Int32Array(this.size * 6).fill(-1);
    for (let i = 0; i < this.size; i++) {
      const col = i % w;
      const row = (i / w) | 0;
      const q = col - ((row - (row & 1)) >> 1);
      for (let d = 0; d < 6; d++) {
        const nq = q + AXIAL_DIRS[d][0];
        const nr = row + AXIAL_DIRS[d][1];
        if (nr < 0 || nr >= h) continue;
        const ncol = nq + ((nr - (nr & 1)) >> 1);
        if (ncol < 0 || ncol >= w) continue;
        this.neighbors[i * 6 + d] = nr * w + ncol;
      }
    }
  }

  col(i: number): number {
    return i % this.w;
  }

  row(i: number): number {
    return (i / this.w) | 0;
  }

  index(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.w || row >= this.h) return -1;
    return row * this.w + col;
  }

  neighbor(i: number, d: number): number {
    return this.neighbors[i * 6 + d];
  }

  forNeighbors(i: number, fn: (n: number, d: number) => void): void {
    const base = i * 6;
    for (let d = 0; d < 6; d++) {
      const n = this.neighbors[base + d];
      if (n >= 0) fn(n, d);
    }
  }

  neighborList(i: number): number[] {
    const out: number[] = [];
    const base = i * 6;
    for (let d = 0; d < 6; d++) {
      const n = this.neighbors[base + d];
      if (n >= 0) out.push(n);
    }
    return out;
  }

  distance(a: number, b: number): number {
    const ar = (a / this.w) | 0;
    const br = (b / this.w) | 0;
    const aq = (a % this.w) - ((ar - (ar & 1)) >> 1);
    const bq = (b % this.w) - ((br - (br & 1)) >> 1);
    const dq = aq - bq;
    const dr = ar - br;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  /** All tiles within `radius` of `center` (including center). */
  within(center: number, radius: number): number[] {
    const out: number[] = [];
    const row = (center / this.w) | 0;
    const q0 = (center % this.w) - ((row - (row & 1)) >> 1);
    for (let dq = -radius; dq <= radius; dq++) {
      const lo = Math.max(-radius, -dq - radius);
      const hi = Math.min(radius, -dq + radius);
      for (let dr = lo; dr <= hi; dr++) {
        const r = row + dr;
        if (r < 0 || r >= this.h) continue;
        const c = q0 + dq + ((r - (r & 1)) >> 1);
        if (c < 0 || c >= this.w) continue;
        out.push(r * this.w + c);
      }
    }
    return out;
  }

  /** Tiles at exactly `radius` from center. */
  ring(center: number, radius: number): number[] {
    if (radius === 0) return [center];
    return this.within(center, radius).filter((t) => this.distance(center, t) === radius);
  }

  /** World-space center of a tile for hex size s (center-to-corner). */
  center(i: number, s: number): [number, number] {
    const row = (i / this.w) | 0;
    const col = i % this.w;
    return [SQRT3 * s * (col + 0.5 * (row & 1)) + (SQRT3 * s) / 2, 1.5 * s * row + s];
  }

  /** Inverse of center(); returns -1 when outside the map. */
  pick(x: number, y: number, s: number): number {
    const px = x - (SQRT3 * s) / 2;
    const py = y - s;
    const fq = ((SQRT3 / 3) * px - py / 3) / s;
    const fr = ((2 / 3) * py) / s;
    const fs = -fq - fr;
    let rq = Math.round(fq);
    let rr = Math.round(fr);
    const rs = Math.round(fs);
    const dq = Math.abs(rq - fq);
    const dr = Math.abs(rr - fr);
    const ds = Math.abs(rs - fs);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    const col = rq + ((rr - (rr & 1)) >> 1);
    return this.index(col, rr);
  }

  pixelWidth(s: number): number {
    return SQRT3 * s * (this.w + 0.5);
  }

  pixelHeight(s: number): number {
    return 1.5 * s * (this.h - 1) + 2 * s;
  }
}
