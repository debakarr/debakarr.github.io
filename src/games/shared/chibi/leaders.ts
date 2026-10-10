// Leaders for strategy games: maps a generic leader description (gender,
// title, era, colour, skin, age, seed) onto the four leader archetypes of
// the reference sheet, dressed in that people's colours.

import { easternPrince, highlandKing, islandMatriarch, sunlandQueen, type LeaderOpts } from './catalog';
import type { ChibiSpec } from './spec';

export interface LeaderDescription {
  gender: 'f' | 'm';
  title: string;
  /** Era tier: 0 ancient … 7+ modern. */
  tier: number;
  color: string;
  skin: string;
  seed: number;
  /** 0 young … 1 old */
  age: number;
}

const HAIRS = ['#3a2418', '#2a1e1a', '#6b3f22', '#9a4a24', '#c8843a', '#4a302a', '#2a2328'];

export function leaderSpec(d: LeaderDescription): ChibiSpec {
  const h = Math.abs(Math.imul(d.seed | 0, 2654435761)) >>> 0;
  const envoy = /Envoy/.test(d.title);
  const regal = /King|Queen|Emperor|Empress|Pharaoh|Sultan|Tsar|Shah/.test(d.title);
  const chief = /Chief|Elder/.test(d.title);
  const opts: LeaderOpts = {
    id: `leader-${d.seed}-${d.title}`,
    main: d.color,
    skin: d.skin,
    hair: HAIRS[h % HAIRS.length],
    age: d.age,
    envoy,
    regalia: envoy ? 'none' : regal ? 'crown' : chief ? 'own' : d.tier >= 6 ? 'none' : 'own',
    cape: !envoy && d.tier < 7,
  };
  const pick = (h >> 4) % 2;
  if (d.gender === 'f') {
    if (pick) return islandMatriarch(opts);
    const queen = sunlandQueen(opts);
    // crowned queens wear the sculpted queen (when shipped), in their people's colour
    return opts.regalia === 'crown' ? { ...queen, vrmKey: 'queen', tint: d.color } : queen;
  }
  return pick ? easternPrince(opts) : highlandKing(opts);
}
