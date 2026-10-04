// The alien language's concepts. Meanings are fixed by design; what changes
// per game is how they look (glyphs), the word order and the number base.
// Related concepts share a family, and family members share a glyph shape,
// so every discovery helps with the next.

export type FamilyId = 'being' | 'life' | 'place' | 'motion' | 'mind' | 'energy' | 'relation' | 'time';

export interface Family {
  id: FamilyId;
  label: string;
}

export const FAMILIES: Family[] = [
  { id: 'being', label: 'beings' },
  { id: 'life', label: 'life' },
  { id: 'place', label: 'places' },
  { id: 'motion', label: 'motion' },
  { id: 'mind', label: 'mind' },
  { id: 'energy', label: 'energy' },
  { id: 'relation', label: 'relations' },
  { id: 'time', label: 'time' },
];

/** Context tags: where a word was seen. Shown to the player as plain phrases. */
export const TAGS: Record<string, string> = {
  greeting: 'a greeting',
  arrival: 'ships arriving',
  departure: 'ships leaving',
  ship: 'a ship hull',
  earth: 'images of Earth',
  stars: 'star maps',
  light: 'beacons and lights',
  children: 'the young',
  family: 'family groups',
  nourish: 'food and water',
  grave: 'a grave or memorial',
  old: 'something very old',
  archive: 'records and archives',
  ritual: 'a ritual',
  war: 'weapons and battle',
  danger: 'warning patterns',
  ruin: 'ruins',
  city: 'cities',
  machine: 'machines',
  trade: 'an exchange of gifts',
  kneel: 'kneeling figures',
  question: 'a pause, as if awaiting an answer',
};

export interface Concept {
  id: string;
  label: string;
  family: FamilyId;
  tags: string[];
  /** Close meanings that count as "good enough". */
  near?: string[];
  /** Grammatical words: negation, questions, tense. */
  grammar?: boolean;
}

export const CONCEPTS: Concept[] = [
  { id: 'BEING', label: 'being', family: 'being', tags: ['city', 'family', 'ship'], near: ['WE'] },
  { id: 'WE', label: 'we', family: 'being', tags: ['greeting', 'ship', 'arrival'], near: ['BEING'] },
  { id: 'YOU', label: 'you', family: 'being', tags: ['earth', 'greeting', 'question'] },
  { id: 'ELDERS', label: 'ancestors', family: 'being', tags: ['grave', 'old', 'archive', 'ritual'], near: ['KIN'] },
  { id: 'CHILD', label: 'child', family: 'being', tags: ['children', 'family', 'nourish'], near: ['KIN'] },

  { id: 'LIFE', label: 'life', family: 'life', tags: ['children', 'nourish', 'earth'], near: ['GROW'] },
  { id: 'GROW', label: 'grow', family: 'life', tags: ['nourish', 'children', 'city'], near: ['LIFE'] },
  { id: 'DEATH', label: 'death', family: 'life', tags: ['grave', 'war', 'ruin'] },
  { id: 'KIN', label: 'kin', family: 'life', tags: ['family', 'children', 'grave'], near: ['ELDERS', 'CHILD'] },
  { id: 'SEED', label: 'seed', family: 'life', tags: ['nourish', 'earth', 'stars', 'old'], near: ['LIFE'] },

  { id: 'PLACE', label: 'place', family: 'place', tags: ['city', 'earth', 'stars'], near: ['HOME'] },
  { id: 'HOME', label: 'home', family: 'place', tags: ['family', 'city', 'arrival'], near: ['PLACE'] },
  { id: 'WORLD', label: 'world', family: 'place', tags: ['earth', 'stars', 'ruin'], near: ['PLACE'] },
  { id: 'SKY', label: 'sky', family: 'place', tags: ['stars', 'light', 'ship'] },
  { id: 'CITY', label: 'city', family: 'place', tags: ['city', 'ruin', 'archive'], near: ['PLACE'] },

  { id: 'GO', label: 'go', family: 'motion', tags: ['departure', 'ship', 'stars'] },
  { id: 'COME', label: 'come', family: 'motion', tags: ['arrival', 'greeting', 'ship'], near: ['RETURN'] },
  { id: 'RETURN', label: 'return', family: 'motion', tags: ['arrival', 'old', 'earth'], near: ['COME'] },
  { id: 'FLEE', label: 'flee', family: 'motion', tags: ['departure', 'danger', 'ruin'], near: ['GO'] },
  { id: 'SEEK', label: 'seek', family: 'motion', tags: ['stars', 'question', 'departure'] },

  { id: 'KNOW', label: 'know', family: 'mind', tags: ['archive', 'machine', 'question'] },
  { id: 'REMEMBER', label: 'remember', family: 'mind', tags: ['grave', 'archive', 'old', 'ritual'] },
  { id: 'FORGET', label: 'forget', family: 'mind', tags: ['ruin', 'archive', 'danger'] },
  { id: 'TRUST', label: 'trust', family: 'mind', tags: ['trade', 'greeting', 'family'], near: ['PEACE'] },
  { id: 'ASK', label: '(question)', family: 'mind', tags: ['question'], grammar: true },

  { id: 'ENERGY', label: 'energy', family: 'energy', tags: ['machine', 'light', 'ship'] },
  { id: 'WEAPON', label: 'weapon', family: 'energy', tags: ['war', 'ship', 'danger'] },
  { id: 'SIGNAL', label: 'signal', family: 'energy', tags: ['light', 'greeting', 'stars'] },
  { id: 'MACHINE', label: 'machine', family: 'energy', tags: ['machine', 'ship', 'city'] },

  { id: 'PEACE', label: 'peace', family: 'relation', tags: ['greeting', 'trade', 'family'], near: ['TRUST'] },
  { id: 'HARM', label: 'harm', family: 'relation', tags: ['war', 'danger', 'ruin'] },
  { id: 'GIVE', label: 'give', family: 'relation', tags: ['trade', 'greeting', 'nourish'] },
  { id: 'SUBMIT', label: 'submit', family: 'relation', tags: ['kneel', 'war', 'ritual'] },
  { id: 'DANGER', label: 'danger', family: 'relation', tags: ['danger', 'war', 'departure'], near: ['HARM'] },
  { id: 'NOT', label: 'not', family: 'relation', tags: ['danger', 'question', 'war'], grammar: true },

  { id: 'PAST', label: '(remembered)', family: 'time', tags: ['old', 'grave', 'archive'], grammar: true },
  { id: 'NOW', label: '(observed)', family: 'time', tags: ['arrival', 'light'], grammar: true },
  { id: 'FUTURE', label: '(anticipated)', family: 'time', tags: ['departure', 'question', 'danger'], grammar: true },
];

export const CONCEPT: Record<string, Concept> = Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));

/** How well a guess matches the truth: 1 exact, 0.6 close, 0 wrong. */
export function closeness(guess: string | undefined, truth: string): number {
  if (!guess) return 0;
  if (guess === truth) return 1;
  if (CONCEPT[truth].near?.includes(guess) || CONCEPT[guess]?.near?.includes(truth)) return 0.6;
  return 0;
}

/** Human-readable label, upper-cased for glosses. */
export function gloss(id: string | undefined): string {
  if (!id) return '?';
  const c = CONCEPT[id];
  return c.grammar ? c.label : c.label.toUpperCase();
}
