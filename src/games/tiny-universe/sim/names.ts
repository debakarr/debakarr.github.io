// Names for stars, species and civilizations, built from syllables so every
// seed has its own vocabulary.

import { Rng } from '../../shared/rng';

const ONSETS = ['k', 'v', 't', 's', 'r', 'm', 'n', 'l', 'z', 'th', 'd', 'b', 'h', 'y', 'qu', 'sh', 'p', 'g', 'x', 'c', 'ar', 'el', 'or', 'is', 'au'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'ou', 'y', 'ei'];
const CODAS = ['', '', '', 'n', 'r', 's', 'l', 'th', 'x', 'm', 'k'];

export function starName(rng: Rng): string {
  const parts = 2 + (rng.chance(0.3) ? 1 : 0);
  let s = '';
  for (let k = 0; k < parts; k++) s += rng.pick(ONSETS) + rng.pick(VOWELS) + (k === parts - 1 ? rng.pick(CODAS) : '');
  s = s.slice(0, 9);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Kora" → "Korans", "Velis" → "Velisi". */
export function speciesName(star: string): string {
  const base = star.replace(/[aeiouy]+$/i, '');
  const last = star.slice(-1).toLowerCase();
  if ('aeiouy'.includes(last)) return `${star}ns`;
  if (base.length < 3) return `${star}ari`;
  return `${star}ites`;
}

/** "Korans" → "Koran". */
export function adjective(species: string): string {
  if (species.endsWith('ans')) return species.slice(0, -1);
  if (species.endsWith('ites')) return species.slice(0, -1);
  if (species.endsWith('ari')) return species;
  return species;
}

export function civTitle(adj: string, traits: { military: number; cooperation: number; religion: number; science: number; trade: number }): string {
  const { military, cooperation, religion, science, trade } = traits;
  const top = Math.max(military, cooperation, religion, science, trade);
  if (top === religion) return `${adj} Theocracy`;
  if (top === military) return `${adj} Dominion`;
  if (top === science) return `${adj} Collective`;
  if (top === trade) return `${adj} Republic`;
  return `${adj} Concord`;
}

export function planetName(star: string, k: number): string {
  return `${star}-${k + 1}`;
}
