import type { FactionId, Truth } from './world';

// How the aliens read a human message. They see what the glyphs really mean,
// not what the player meant by them.

export interface Reading {
  warmth: number;
  threat: number;
  /** Humans offering to submit. */
  yields: number;
  /** Humans demanding the aliens submit. */
  demands: number;
  curiosity: number;
  dismiss: number;
  /** Asked why they came (a question about coming, going, returning or seeking). */
  asksWhy: boolean;
  asksMemory: boolean;
  intent: 'warm' | 'threat' | 'yield' | 'demand' | 'question' | 'dismiss' | 'confused';
}

const WARM: Record<string, number> = { PEACE: 2, GIVE: 1.5, TRUST: 1.5, KIN: 1, LIFE: 0.6, HOME: 0.5, CHILD: 0.5, REMEMBER: 0.5 };
const THREAT: Record<string, number> = { WEAPON: 2, HARM: 2.5, DEATH: 1.5, DANGER: 1 };

export function readMessage(tokens: string[]): Reading {
  const r: Reading = { warmth: 0, threat: 0, yields: 0, demands: 0, curiosity: 0, dismiss: 0, asksWhy: false, asksMemory: false, intent: 'confused' };
  let neg = false;
  const has = (c: string) => tokens.includes(c);
  const subjectYou = tokens.indexOf('YOU');
  const subjectWe = tokens.indexOf('WE');
  for (const t of tokens) {
    if (t === 'NOT') {
      neg = true;
      continue;
    }
    const s = neg ? -0.8 : 1;
    if (WARM[t]) r.warmth += WARM[t] * s;
    if (THREAT[t]) {
      if (neg) r.warmth += THREAT[t] * 0.6;
      else r.threat += THREAT[t];
    }
    if (t === 'SUBMIT' && !neg) {
      // Whoever is named first is the one submitting.
      if (subjectYou >= 0 && (subjectWe < 0 || subjectYou < subjectWe)) r.demands += 3;
      else r.yields += 3;
    }
    if (t === 'ASK') r.curiosity += 2;
    if (t === 'KNOW' || t === 'SEEK') r.curiosity += 0.8;
    if (t === 'GO' && !neg && has('YOU')) r.dismiss += 2;
    neg = false;
  }
  if (has('ASK') && (has('COME') || has('RETURN') || has('GO') || has('SEEK') || has('FLEE'))) r.asksWhy = true;
  if (has('ASK') && (has('REMEMBER') || has('KNOW') || has('ELDERS'))) r.asksMemory = true;
  const scores: [Reading['intent'], number][] = [
    ['demand', r.demands],
    ['yield', r.yields],
    ['threat', r.threat],
    ['dismiss', r.dismiss],
    ['question', r.curiosity + (r.asksWhy ? 1 : 0)],
    ['warm', r.warmth],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  r.intent = scores[0][1] >= 1 ? scores[0][0] : 'confused';
  return r;
}

export interface Reaction {
  deltas: Record<FactionId, { trust?: number; fear?: number; curiosity?: number; aggression?: number }>;
  /** Which faction answers, and what it says (sentence source). */
  speaker: FactionId;
  say: string;
  tags: string[];
}

/** The answers that reveal why they came, per truth. */
export const WHY: Record<Truth, string[]> = {
  return: ['S:WE V:RETURN O:HOME', 'S:ELDERS V:GO+PAST O:WORLD ; S:WE V:RETURN'],
  flee: ['S:WE V:FLEE O:DANGER', 'S:DANGER V:HARM+PAST O:CITY ; S:WE V:FLEE'],
  dying: ['S:WORLD V:DEATH ; S:WE V:SEEK O:HOME', 'S:ENERGY V:GO+NOW O:SKY'],
  warn: ['S:DANGER V:COME+FUTURE O:YOU', 'S:YOU V:!GIVE O:SIGNAL'],
  claim: ['S:WE V:RETURN+FUTURE O:WORLD', 'S:WORLD V:GIVE+FUTURE O:WE'],
};

export function react(r: Reading, truth: Truth, asked: number, wardenAggression: number): Reaction {
  const d: Reaction['deltas'] = { archivists: {}, wardens: {}, pilgrims: {} };
  switch (r.intent) {
    case 'warm':
      d.archivists = { trust: 6, curiosity: 2 };
      d.pilgrims = { trust: 8 };
      d.wardens = { trust: 2, fear: -3 };
      return { deltas: d, speaker: 'pilgrims', say: r.warmth > 3 ? 'S:WE V:TRUST O:YOU' : 'S:WE V:GIVE O:PEACE', tags: ['greeting', 'trade', 'family'] };
    case 'threat':
      d.archivists = { trust: -6 };
      d.pilgrims = { trust: -8, fear: 6 };
      d.wardens = { fear: 8, aggression: 10, trust: -4 };
      return { deltas: d, speaker: 'wardens', say: wardenAggression > 55 ? 'S:WE V:HARM+FUTURE O:YOU' : 'S:YOU V:!HARM O:WE', tags: ['war', 'danger'] };
    case 'yield':
      d.wardens = { aggression: 12, trust: 4 };
      d.archivists = { trust: -4, curiosity: -2 };
      d.pilgrims = { trust: -2 };
      return { deltas: d, speaker: 'wardens', say: 'S:YOU V:SUBMIT ; S:WE V:COME+FUTURE O:WORLD', tags: ['kneel', 'war', 'earth'] };
    case 'demand':
      d.wardens = { aggression: 15, fear: 5, trust: -6 };
      d.archivists = { trust: -8 };
      d.pilgrims = { trust: -8 };
      return { deltas: d, speaker: 'wardens', say: 'S:WE V:!SUBMIT', tags: ['war', 'kneel', 'danger'] };
    case 'dismiss':
      d.archivists = { curiosity: -8, trust: -5 };
      d.pilgrims = { trust: -10 };
      d.wardens = { trust: -3 };
      return { deltas: d, speaker: 'pilgrims', say: 'S:WE V:!GO', tags: ['departure', 'family', 'question'] };
    case 'question': {
      d.archivists = { curiosity: 6, trust: 2 };
      d.pilgrims = { curiosity: 3 };
      if (r.asksWhy) {
        const lines = WHY[truth];
        return { deltas: d, speaker: truth === 'claim' || truth === 'flee' ? 'wardens' : 'archivists', say: lines[asked % lines.length], tags: ['question', 'arrival', 'archive'] };
      }
      if (r.asksMemory) return { deltas: d, speaker: 'archivists', say: truth === 'return' || truth === 'claim' ? 'S:WE V:REMEMBER+PAST O:WORLD' : 'S:WE V:KNOW O:SKY', tags: ['archive', 'old', 'question'] };
      return { deltas: d, speaker: 'archivists', say: 'S:WE V:KNOW ; S:YOU V:KNOW ?', tags: ['question', 'archive'] };
    }
    default:
      d.archivists = { curiosity: 1 };
      return { deltas: d, speaker: 'archivists', say: 'S:WE V:!KNOW ?', tags: ['question'] };
  }
}
