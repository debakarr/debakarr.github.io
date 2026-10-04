import { CONCEPT } from '../lang/concepts';
import type { Game } from './game';
import { DECISIONS } from './game';
import { EXPLANATIONS, type Truth } from './world';

// The auto-linguist: plays First Contact the way a careful (but fallible)
// human would. It only uses what a player can see: contexts, confidence and
// the counting signal. Its own misreadings carry into its messages.

export interface AutoStep {
  /** Short notes for the UI ("Read ◇ as LIFE"). */
  notes: string[];
  /** What the step did. */
  action: 'studied' | 'decided' | 'sent' | 'advanced' | 'reported' | 'done';
}

/** Re-read every glyph and keep the best-supported meaning. */
function study(g: Game): string[] {
  const notes: string[] = [];
  for (const c of g.seenConcepts()) {
    const cur = g.s.hyp[c];
    const curConf = cur ? g.confidence(c, cur) : 0;
    let best = cur;
    let bestConf = curConf;
    for (const cand of g.candidates(c)) {
      const v = g.confidence(c, cand);
      // Only change its mind when the evidence clearly favors another reading.
      if (v > bestConf + (cur ? 6 : 0)) {
        best = cand;
        bestConf = v;
      }
    }
    if (best && best !== cur) {
      g.setHypothesis(c, best);
      notes.push(cur ? `Changed its reading of a glyph from ${CONCEPT[cur].label.toUpperCase()} to ${CONCEPT[best].label.toUpperCase()}.` : `Read a new glyph as ${CONCEPT[best].label.toUpperCase()}.`);
    }
  }
  // The counting signal: the first count written with two marks is the base.
  if (!g.s.baseGuess && g.evidence.some((e) => e.kind === 'signal')) {
    for (let n = 2; n <= 16; n++) {
      if (g.digits(n).length > 1) {
        g.setBase(n);
        notes.push(`Worked out that they count in base ${n}.`);
        break;
      }
    }
  }
  return notes;
}

/** Glyph the linguist believes means `concept`, if any. */
function wordFor(g: Game, concept: string): string | null {
  let best: string | null = null;
  let conf = -1;
  for (const [glyph, guess] of Object.entries(g.s.hyp)) {
    if (guess !== concept) continue;
    const v = g.confidence(glyph);
    if (v > conf) {
      conf = v;
      best = glyph;
    }
  }
  return best;
}

/** A message plan for the day, in the linguist's own vocabulary. */
function compose(g: Game): string[] | null {
  const plans: string[][] = [];
  const day = g.s.day;
  if (day >= 3) plans.push(['YOU', 'COME', 'ASK'], ['YOU', 'RETURN', 'ASK'], ['YOU', 'SEEK', 'ASK']);
  if (day % 2 === 0 || day < 3) plans.unshift(['WE', 'PEACE'], ['WE', 'GIVE', 'PEACE'], ['WE', 'TRUST', 'YOU']);
  if (day > 10 && day % 3 === 0) plans.unshift(['YOU', 'REMEMBER', 'WE', 'ASK'], ['WE', 'NOT', 'HARM']);
  for (const plan of plans) {
    const tokens = plan.map((c) => wordFor(g, c));
    if (tokens.every((t): t is string => !!t)) return tokens;
  }
  return null;
}

const SAFE: Record<string, string> = { orbit: 'welcome', probe: 'show', lie: 'ask', gift: 'accept', jet: 'home' };

/** Which explanation the linguist's own readings support best. */
export function believedTruth(g: Game): Truth {
  const KEY: Record<Truth, string[]> = {
    return: ['RETURN', 'HOME', 'ELDERS', 'REMEMBER', 'KIN', 'SEED'],
    flee: ['FLEE', 'DANGER', 'HARM', 'CITY', 'GO'],
    dying: ['DEATH', 'SEEK', 'HOME', 'CHILD', 'ENERGY', 'SKY'],
    warn: ['DANGER', 'SIGNAL', 'COME', 'HARM', 'NOT'],
    claim: ['SUBMIT', 'WORLD', 'RETURN', 'GIVE', 'ELDERS'],
  };
  const score: Record<Truth, number> = { return: 0, flee: 0, dying: 0, warn: 0, claim: 0 };
  // Words that point at only one explanation count for more.
  const shared: Record<string, number> = {};
  for (const list of Object.values(KEY)) for (const k of list) shared[k] = (shared[k] ?? 0) + 1;
  for (const e of g.evidence) {
    // The first transmission and the answers to its questions matter most.
    const weight = e.id === 'first' ? 3 : e.kind === 'reply' ? 2 : 1;
    const read = new Set(e.tokens.map((t) => g.s.hyp[t]).filter(Boolean));
    for (const t of Object.keys(score) as Truth[]) for (const k of KEY[t]) if (read.has(k)) score[t] += weight / shared[k];
  }
  return (Object.keys(score) as Truth[]).sort((a, b) => score[b] - score[a])[0];
}

function report(g: Game): void {
  const why = believedTruth(g);
  const mine = g.reading(g.world.first.tokens).toLowerCase();
  const words = mine.split(/\s+/).filter((w) => w.length > 2 && w !== '?');
  const firsts = g.firstOptions();
  const first = firsts
    .map((o) => ({ o, s: words.filter((w) => o.toLowerCase().includes(w.replace(/[()]/g, ''))).length + (o.startsWith('Your reading') ? 0.5 : 0) }))
    .sort((a, b) => b.s - a.s)[0].o;
  const probe = g.readNumber(g.world.probeAge) ?? g.probeOptions()[0];
  const opts = g.probeOptions();
  g.conclude(why, first, opts.includes(probe) ? probe : opts[0]);
}

/** One "beat" of automatic play. Call repeatedly; it advances a day at most once. */
export function autoStep(g: Game): AutoStep {
  if (g.s.ended) return { notes: [], action: 'done' };
  const notes = study(g);
  for (const e of g.unread()) g.markRead(e.id);
  const dec = g.pendingDecision();
  if (dec) {
    const pick = SAFE[dec.id] ?? dec.options[0].id;
    g.decide(dec.id, pick);
    const o = DECISIONS.find((d) => d.id === dec.id)!.options.find((x) => x.id === pick)!;
    return { notes: [...notes, `Advised the Council: ${o.label.toLowerCase()}.`], action: 'decided' };
  }
  if (g.mustReport || g.s.day >= 26) {
    report(g);
    const why = EXPLANATIONS.find((x) => x.id === g.s.ended!.why)!;
    return { notes: [...notes, `Delivered the report: ${why.short.toLowerCase()}.`], action: 'reported' };
  }
  if (!g.sentToday) {
    const msg = compose(g);
    if (msg) {
      g.send(msg);
      return { notes: [...notes, `Sent "${g.reading(msg)}".`], action: 'sent' };
    }
  }
  g.nextDay();
  return { notes, action: 'advanced' };
}
