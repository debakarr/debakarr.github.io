// The code-built models (nature, buildings, war machines) drawn as voxel art,
// to match the voxel characters. Each builder's mesh is resampled into voxels
// sized to the model (about `n` voxels across its largest side), so a pine on
// the strategy map and the same pine on a battlefield read alike. Builders
// called with plain arguments are cached.

import type { BufferGeometry } from 'three';
import { voxelize } from '../../../shared/chibi/voxel';
import { prep } from '../geo';
import * as RawB from './buildings';
import * as RawF from './figures';
import * as RawK from './kitnature';
import * as RawN from './nature';

type Builder = (...args: never[]) => BufferGeometry;

const cache = new Map<string, { geo: BufferGeometry; rngAfter: number[] }>();

type RngLike = { s: number; next: () => number };
const isRng = (a: unknown): a is RngLike => !!a && typeof a === 'object' && typeof (a as RngLike).s === 'number' && typeof (a as RngLike).next === 'function';

/** A cache key for builder arguments: primitives, plain option objects and Rng states (null: uncacheable). */
function keyOf(args: unknown[]): string | null {
  const parts: string[] = [];
  for (const a of args) {
    if (isRng(a)) parts.push(`rng:${a.s}`);
    else if (a === undefined || ['number', 'string', 'boolean'].includes(typeof a)) parts.push(JSON.stringify(a ?? null));
    else if (a && typeof a === 'object' && Object.values(a).every((v) => v === undefined || ['number', 'string', 'boolean'].includes(typeof v))) parts.push(JSON.stringify(a));
    else if (a && typeof a === 'object' && (a as { isColor?: boolean }).isColor) parts.push(`c:${(a as { getHex: () => number }).getHex()}`);
    else return null;
  }
  return parts.join('|');
}

function wrap(name: string, fn: Builder, n: number): Builder {
  return ((...args: unknown[]) => {
    const k = keyOf(args);
    const key = k === null ? '' : `${name}|${k}`;
    const hit = key ? cache.get(key) : undefined;
    const rngs = args.filter(isRng);
    if (hit) {
      // the real builder would have advanced the generators: keep later draws identical
      rngs.forEach((r, i) => (r.s = hit.rngAfter[i]));
      return hit.geo.clone();
    }
    const g = (fn as (...a: unknown[]) => BufferGeometry)(...args);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    const v = prep(voxelize(g, Math.max(span / n, 1e-4), { levels: 12, noBottom: true }));
    v.name = name;
    g.dispose();
    if (key) {
      if (cache.size > 1500) cache.clear();
      cache.set(key, { geo: v, rngAfter: rngs.map((r) => r.s) });
      return v.clone();
    }
    return v;
  }) as Builder;
}

function wrapAll<T extends object>(mod: T, prefix: string, skip: string[], n: number, per: Record<string, number> = {}, only?: string[]): T {
  const out = { ...mod } as Record<string, unknown>;
  for (const [k, v] of Object.entries(mod)) {
    if (typeof v !== 'function' || skip.includes(k) || (only && !only.includes(k))) continue;
    out[k] = wrap(`${prefix}.${k}`, v as Builder, per[k] ?? n);
  }
  return out as T;
}

/** Nature: trees, bushes, rocks, mountains, animals… (water surfaces stay smooth). */
export const N = wrapAll(RawN, 'N', ['setCanopyDetail', 'lava', 'puddle', 'waterfall'], 16, { tuft: 4, flowers: 6, reeds: 6, rock: 8, bush: 8, mountain: 20, volcano: 20, giantTree: 22 });
/** Buildings and town pieces. */
export const B = wrapAll(RawB, 'B', ['place', 'flagCloth'], 18, { cropField: 10, plaza: 14, palisade: 16, aqueduct: 22 });
/** Siege engines, ships, vehicles and aircraft. */
export const F = wrapAll(RawF, 'F', [], 20);
/** Kit-based nature: only the code-built pieces need voxelising (kit models already are). */
export const K = wrapAll(RawK, 'K', [], 12, { peak: 20, shrub: 7 }, ['broadleaf', 'shrub', 'peak']);
