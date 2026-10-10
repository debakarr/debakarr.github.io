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

const cache = new Map<string, BufferGeometry>();

function wrap(name: string, fn: Builder, n: number): Builder {
  return ((...args: unknown[]) => {
    const plain = args.every((a) => a === undefined || ['number', 'string', 'boolean'].includes(typeof a));
    const key = plain ? `${name}|${JSON.stringify(args)}` : '';
    const hit = key && cache.get(key);
    if (hit) return hit.clone();
    const g = (fn as (...a: unknown[]) => BufferGeometry)(...args);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    const v = prep(voxelize(g, Math.max(span / n, 1e-4)));
    g.dispose();
    if (key) {
      if (cache.size > 600) cache.clear();
      cache.set(key, v);
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
export const N = wrapAll(RawN, 'N', ['setCanopyDetail', 'lava', 'puddle', 'waterfall'], 20, { tuft: 7, flowers: 9, reeds: 9, mountain: 26, volcano: 26, giantTree: 28 });
/** Buildings and town pieces. */
export const B = wrapAll(RawB, 'B', ['place', 'flagCloth'], 22, { cropField: 12, plaza: 16, palisade: 18, aqueduct: 26 });
/** Siege engines, ships, vehicles and aircraft. */
export const F = wrapAll(RawF, 'F', [], 24);
/** Kit-based nature: only the code-built pieces need voxelising (kit models already are). */
export const K = wrapAll(RawK, 'K', [], 18, { peak: 30 }, ['broadleaf', 'shrub', 'peak']);
