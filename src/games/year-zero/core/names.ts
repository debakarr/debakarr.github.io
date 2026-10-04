import { Rng } from '../../shared/rng';

// Each people gets its own tiny phonology, so its cities, leaders and rivers
// sound related. Languages are plain data so they survive save/load.

export interface Language {
  onsets: string[];
  vowels: string[];
  codas: string[];
  /** Probability that a syllable gets a coda. */
  codaRate: number;
  /** Signature endings for place names. */
  placeEnds: string[];
  /** Signature endings for personal names. */
  personEnds: string[];
}

const ONSETS = [
  'b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'z',
  'th', 'sh', 'kh', 'br', 'dr', 'gr', 'kr', 'tr', 'st', 'ch', 'y', 'q', 'ph', 'sk', 'vr', 'zh',
];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'o', 'ae', 'ai', 'ei', 'ou', 'ia', 'y', 'aa', 'io', 'ua'];
const CODAS = ['n', 'r', 's', 'l', 'm', 'k', 'th', 'sh', 'x', 'nd', 'rn', 'st', 't', 'd', 'rk', 'ss', 'lm'];

function pickMany<T>(rng: Rng, pool: readonly T[], n: number): T[] {
  const copy = [...pool];
  rng.shuffle(copy);
  return copy.slice(0, n);
}

export function makeLanguage(rng: Rng): Language {
  const lang: Language = {
    onsets: pickMany(rng, ONSETS, rng.range(6, 10)),
    vowels: pickMany(rng, VOWELS, rng.range(3, 5)),
    codas: pickMany(rng, CODAS, rng.range(3, 6)),
    codaRate: rng.float(0.15, 0.5),
    placeEnds: [],
    personEnds: [],
  };
  for (let i = 0; i < 3; i++) lang.placeEnds.push(syllable(lang, rng, true));
  for (let i = 0; i < 2; i++) lang.personEnds.push(syllable(lang, rng, false));
  return lang;
}

/** A dialect of a parent language — used for breakaway nations. */
export function mutateLanguage(parent: Language, rng: Rng): Language {
  const lang: Language = JSON.parse(JSON.stringify(parent));
  lang.onsets[rng.int(lang.onsets.length)] = rng.pick(ONSETS);
  lang.vowels[rng.int(lang.vowels.length)] = rng.pick(VOWELS);
  lang.placeEnds = [syllable(lang, rng, true), ...lang.placeEnds.slice(0, 2)];
  return lang;
}

function syllable(lang: Language, rng: Rng, allowCoda: boolean): string {
  const onset = rng.chance(0.85) ? rng.pick(lang.onsets) : '';
  const vowel = rng.pick(lang.vowels);
  const coda = allowCoda && rng.chance(lang.codaRate) ? rng.pick(lang.codas) : '';
  return onset + vowel + coda;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tidy(word: string): string {
  // Collapse awkward triple letters and very long words.
  let w = word.replace(/(.)\1\1+/g, '$1$1').replace(/([aeiouy]{3,})/g, (m) => m.slice(0, 2));
  if (w.length > 11) w = w.slice(0, 9);
  return w;
}

export function word(lang: Language, rng: Rng, minSyl = 2, maxSyl = 3): string {
  const n = rng.range(minSyl, maxSyl);
  let w = '';
  for (let i = 0; i < n; i++) w += syllable(lang, rng, i === n - 1 || rng.chance(0.25));
  return cap(tidy(w));
}

export function placeName(lang: Language, rng: Rng, used?: Set<string>): string {
  for (let attempt = 0; attempt < 12; attempt++) {
    let w = word(lang, rng, 1, 2);
    if (rng.chance(0.45)) w = cap(tidy(w.toLowerCase() + rng.pick(lang.placeEnds)));
    if (w.length < 3) continue;
    if (!used || !used.has(w)) {
      used?.add(w);
      return w;
    }
  }
  const fallback = word(lang, rng, 2, 3) + rng.int(9);
  used?.add(fallback);
  return fallback;
}

export function personName(lang: Language, rng: Rng): string {
  let w = word(lang, rng, 1, 2);
  if (rng.chance(0.5)) w = cap(tidy(w.toLowerCase() + rng.pick(lang.personEnds)));
  return w;
}

export function peopleName(lang: Language, rng: Rng): string {
  let w = word(lang, rng, 2, 2);
  if (w.length > 8) w = w.slice(0, 7);
  return w;
}

export function adjectiveOf(name: string): string {
  const last = name.charAt(name.length - 1).toLowerCase();
  if (last === 'a' || last === 'o') return name + 'n';
  if (last === 'e' || last === 'i' || last === 'y') return name + 'an';
  if (last === 'u') return name + 'vian';
  const endings = ['ian', 'ese', 'ic', 'i'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return name + endings[h % endings.length];
}

const PLAGUE_ADJ = ['Grey', 'Sweating', 'Black', 'Red', 'Weeping', 'Pale', 'Burning', 'Silent', 'Coughing', 'Yellow'];
const PLAGUE_NOUN = ['Fever', 'Sickness', 'Pox', 'Rot', 'Plague', 'Blight', 'Flux', 'Death'];

export function plagueName(rng: Rng): string {
  return `the ${rng.pick(PLAGUE_ADJ)} ${rng.pick(PLAGUE_NOUN)}`;
}

const FAITH_FORMS = [
  (w: string) => `the Way of ${w}`,
  (w: string) => `the Cult of ${w}`,
  (w: string) => `the ${w} Covenant`,
  (w: string) => `the Path of ${w}`,
  (w: string) => `the Faith of the ${w} Flame`,
  (w: string) => `the ${w} Mysteries`,
  (w: string) => `the Children of ${w}`,
];

export function faithName(lang: Language, rng: Rng): string {
  return rng.pick(FAITH_FORMS)(word(lang, rng, 1, 2));
}

const ARTIFACT_ITEMS = [
  'Bronze Mask', 'Obsidian Crown', 'Jade Tablet', 'Clay Codex', 'Star Chart', 'Bone Flute',
  'Gold Diadem', 'Iron Seal', 'Carved Throne', 'Painted Urn', 'Glass Eye', 'Silver Mirror',
  'Stone Calendar', 'Feathered Cloak', 'Copper Astrolabe', 'Ivory Idol',
];

export function artifactName(rng: Rng, cityName: string): string {
  return `the ${rng.pick(ARTIFACT_ITEMS)} of ${cityName}`;
}

export function ordinal(n: number): string {
  const words = ['Zeroth', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  if (n < words.length) return words[n];
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
