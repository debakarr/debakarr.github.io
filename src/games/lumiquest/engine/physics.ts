// Lightweight collision for a walking game: the terrain heightfield plus
// vertical cylinders and yawed boxes with a height range, stored in a
// spatial hash. Tops are walkable (bridges, pillars, platforms), and the
// height range lets a wall stop a swimmer at the surface while a diver
// passes underneath it.

import type { Terrain } from '../world/terrain';

interface Base {
  /** Bottom and top heights (world y). */
  y0: number;
  y1: number;
  id?: string;
  /** Disabled colliders are ignored (broken rocks, open doors). */
  off?: boolean;
  /** Walkable top (default true). */
  walkable?: boolean;
  /** Only blocks the camera (tree canopies). */
  cam?: boolean;
}
export interface Cyl extends Base {
  kind: 'cyl';
  x: number;
  z: number;
  r: number;
}
export interface Box extends Base {
  kind: 'box';
  x: number;
  z: number;
  hx: number;
  hz: number;
  rot: number;
}
export type Collider = Cyl | Box;

const CELL = 8;

export class CollisionWorld {
  private grid = new Map<number, Collider[]>();
  readonly all: Collider[] = [];
  private stamp = 0;
  private seen = new WeakMap<Collider, number>();

  constructor(readonly terrain: Terrain) {}

  private key(i: number, j: number): number {
    return (i + 512) * 4096 + (j + 512);
  }

  add<T extends Collider>(c: T): T {
    this.all.push(c);
    const [x0, z0, x1, z1] = bounds(c);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = this.key(i, j);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(c);
      }
    }
    return c;
  }

  byId(id: string): Collider[] {
    return this.all.filter((c) => c.id === id);
  }

  setEnabled(id: string, enabled: boolean): void {
    for (const c of this.all) if (c.id === id) c.off = !enabled;
  }

  /** Colliders whose footprint may touch the circle (x, z, r). */
  query(x: number, z: number, r: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    this.stamp++;
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const list = this.grid.get(this.key(i, j));
        if (!list) continue;
        for (const c of list) {
          if (c.off || this.seen.get(c) === this.stamp) continue;
          this.seen.set(c, this.stamp);
          out.push(c);
        }
      }
    }
    return out;
  }

  /**
   * Highest walkable surface under (x, z) that is at most `step` above
   * `feetY`: terrain, or the top of a collider the feet stand on.
   */
  ground(x: number, z: number, feetY: number, step = 0.45, r = 0.25): number {
    let g = this.terrain.height(x, z);
    for (const c of this.query(x, z, r, tmpList)) {
      if (c.walkable === false || c.cam) continue;
      if (c.y1 > feetY + step) continue;
      if (c.y1 <= g) continue;
      if (inside(c, x, z, r * 0.6)) g = c.y1;
    }
    return g;
  }

  /**
   * Pushes a vertical capsule (feet at y, height h, radius r) out of the
   * colliders it overlaps. Returns true when anything was hit.
   */
  resolve(p: { x: number; y: number; z: number }, r: number, h: number, step = 0.45): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of this.query(p.x, p.z, r + 1, tmpList)) {
        if (c.cam) continue;
        // standing on top, or entirely above/below it
        if (p.y >= c.y1 - step && c.walkable !== false) continue;
        if (p.y + h <= c.y0 || p.y >= c.y1) continue;
        if (c.kind === 'cyl') {
          const dx = p.x - c.x;
          const dz = p.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + r;
          if (d < min) {
            const nx = d > 1e-4 ? dx / d : 1;
            const nz = d > 1e-4 ? dz / d : 0;
            p.x = c.x + nx * min;
            p.z = c.z + nz * min;
            moved = hit = true;
          }
        } else {
          const cs = Math.cos(c.rot);
          const sn = Math.sin(c.rot);
          const lx = (p.x - c.x) * cs - (p.z - c.z) * sn;
          const lz = (p.x - c.x) * sn + (p.z - c.z) * cs;
          const qx = Math.max(-c.hx, Math.min(c.hx, lx));
          const qz = Math.max(-c.hz, Math.min(c.hz, lz));
          let dx = lx - qx;
          let dz = lz - qz;
          let d = Math.hypot(dx, dz);
          if (d < r) {
            let nlx: number;
            let nlz: number;
            if (d < 1e-4) {
              // centre inside the box: leave along the shallowest axis
              const ox = c.hx - Math.abs(lx);
              const oz = c.hz - Math.abs(lz);
              if (ox < oz) {
                nlx = Math.sign(lx) || 1;
                nlz = 0;
                dx = 0;
                d = -ox;
              } else {
                nlx = 0;
                nlz = Math.sign(lz) || 1;
                dz = 0;
                d = -oz;
              }
            } else {
              nlx = dx / d;
              nlz = dz / d;
            }
            const push = r - d;
            const wx = nlx * cs + nlz * sn;
            const wz = -nlx * sn + nlz * cs;
            p.x += wx * push;
            p.z += wz * push;
            moved = hit = true;
          }
        }
      }
      if (!moved) break;
    }
    return hit;
  }

  /**
   * Distance along a ray until it enters terrain or a collider (for the
   * camera boom). Marches in small steps; good enough at camera ranges.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, pad = 0.25): number {
    const stepLen = 0.2;
    for (let t = 0.3; t <= max; t += stepLen) {
      const x = ox + dx * t;
      const y = oy + dy * t;
      const z = oz + dz * t;
      if (y < this.terrain.height(x, z) + pad) return Math.max(0.3, t - stepLen);
      for (const c of this.query(x, z, pad, tmpList)) {
        if (y < c.y0 - pad || y > c.y1 + pad) continue;
        if (inside(c, x, z, pad)) return Math.max(0.3, t - stepLen);
      }
    }
    return max;
  }
}

const tmpList: Collider[] = [];

function bounds(c: Collider): [number, number, number, number] {
  if (c.kind === 'cyl') return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
  const ex = Math.abs(c.hx * Math.cos(c.rot)) + Math.abs(c.hz * Math.sin(c.rot));
  const ez = Math.abs(c.hx * Math.sin(c.rot)) + Math.abs(c.hz * Math.cos(c.rot));
  return [c.x - ex, c.z - ez, c.x + ex, c.z + ez];
}

export function inside(c: Collider, x: number, z: number, pad = 0): boolean {
  if (c.kind === 'cyl') return Math.hypot(x - c.x, z - c.z) < c.r + pad;
  const cs = Math.cos(c.rot);
  const sn = Math.sin(c.rot);
  const lx = (x - c.x) * cs - (z - c.z) * sn;
  const lz = (x - c.x) * sn + (z - c.z) * cs;
  return Math.abs(lx) < c.hx + pad && Math.abs(lz) < c.hz + pad;
}
