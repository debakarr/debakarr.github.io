import { hashString, Rng } from '../../shared/rng';
import { closeness, CONCEPT, CONCEPTS, gloss } from '../lang/concepts';
import { fromDigits, toDigits } from '../lang/glyphs';
import { react, readMessage } from './reply';
import { DAYS, EXPLANATIONS, FACTIONS, generateWorld, sentence, type Evidence, type FactionId, type Truth, type World } from './world';

export interface FactionState {
  trust: number;
  fear: number;
  curiosity: number;
  aggression: number;
}

export interface JournalEntry {
  day: number;
  kind: 'contact' | 'hyp' | 'sent' | 'reply' | 'decision' | 'discovery' | 'contradiction' | 'event';
  text: string;
  /** Glyph tokens to show with the entry. */
  tokens?: string[];
}

export interface Contradiction {
  concept: string;
  evidence: string;
  day: number;
  open: boolean;
}

export interface SentMessage {
  day: number;
  tokens: string[];
  intended: string;
  real: string;
}

export interface Final {
  day: number;
  why: Truth;
  whyScore: number;
  first: string;
  firstRight: boolean;
  probe: number;
  probeRight: boolean;
  mastery: number;
  history: number;
  trust: number;
  casualties: number;
  relation: 'Alliance' | 'Peace' | 'Cold war' | 'War' | 'Isolation';
  verdict: string;
}

export interface State {
  version: number;
  seed: string;
  day: number;
  hyp: Record<string, string>;
  hypLog: { day: number; concept: string; guess: string }[];
  baseGuess: number | null;
  read: Record<string, number>;
  replies: Evidence[];
  sent: SentMessage[];
  factions: Record<FactionId, FactionState>;
  feed: { day: number; text: string; faction?: FactionId }[];
  journal: JournalEntry[];
  decisions: Record<string, string>;
  contradictions: Contradiction[];
  casualties: number;
  departed: boolean;
  war: boolean;
  ended: Final | null;
}

export const SAVE_VERSION = 1;

export type Confidence = 'Unknown' | 'Guess' | 'Likely' | 'Strong' | 'Confirmed';

export function confidenceLabel(v: number): Confidence {
  return v <= 0 ? 'Unknown' : v < 30 ? 'Guess' : v < 55 ? 'Likely' : v < 80 ? 'Strong' : 'Confirmed';
}

// --- Council decisions --------------------------------------------------------------

export interface DecisionOption {
  id: string;
  label: string;
  effects: Partial<Record<FactionId, Partial<FactionState>>>;
  log: string;
  casualties?: number;
}

export interface Decision {
  id: string;
  day: number;
  title: string;
  text: string;
  options: DecisionOption[];
}

export const DECISIONS: Decision[] = [
  {
    id: 'orbit', day: 4, title: 'A ship in lunar orbit',
    text: 'An armed escort has entered orbit around the Moon. The Council asks for your recommendation.',
    options: [
      { id: 'welcome', label: 'Broadcast a welcome', effects: { archivists: { trust: 5 }, pilgrims: { trust: 5 }, wardens: { fear: -4 } }, log: 'Earth broadcast a welcome to the ship in lunar orbit.' },
      { id: 'distance', label: 'Keep our distance', effects: {}, log: 'Earth kept its distance from the ship in lunar orbit.' },
      { id: 'defend', label: 'Scramble defenses', effects: { wardens: { fear: 10, aggression: 8 }, archivists: { trust: -5 } }, log: 'Earth scrambled its defenses against the ship in lunar orbit.' },
    ],
  },
  {
    id: 'probe', day: 9, title: 'The lunar probe',
    text: 'The military wants to take the ancient probe apart. The scientists want to show it to the visitors.',
    options: [
      { id: 'show', label: 'Show it to them', effects: { archivists: { trust: 5, curiosity: 10 }, pilgrims: { trust: 6 } }, log: 'Humanity showed the visitors the probe from the Moon.' },
      { id: 'study', label: 'Study it in secret', effects: { archivists: { curiosity: -2 } }, log: 'Humanity studied the lunar probe in secret.' },
      { id: 'dismantle', label: 'Take it apart', effects: { pilgrims: { trust: -10 }, archivists: { trust: -5 } }, log: 'The military took the lunar probe apart.' },
    ],
  },
  {
    id: 'lie', day: 14, title: 'Weapon ports',
    text: 'The Wardens told us they carry no weapons. Telescopes now see weapon ports on their ships, each marked with the same glyph. Did they lie, or did we misread them?',
    options: [
      { id: 'accuse', label: 'Accuse them publicly', effects: { wardens: { trust: -5, fear: 5, aggression: 6 }, archivists: { trust: 6 } }, log: 'Humanity accused the Wardens of lying about their weapons.' },
      { id: 'quiet', label: 'Say nothing', effects: { wardens: { trust: 2 } }, log: 'Humanity said nothing about the Warden weapons.' },
      { id: 'ask', label: 'Ask the Archivists', effects: { archivists: { curiosity: 5, trust: 2 }, wardens: { fear: 2 } }, log: 'Humanity quietly asked the Archivists about the Warden weapons.' },
    ],
  },
  {
    id: 'gift', day: 18, title: 'A capsule in the Pacific',
    text: 'The Archivists dropped a capsule into the ocean. Inside is a softly glowing machine.',
    options: [
      { id: 'accept', label: 'Accept and study it openly', effects: { archivists: { trust: 8, curiosity: 5 }, pilgrims: { trust: 3 } }, log: 'Humanity accepted the Archivists\' gift.' },
      { id: 'return', label: 'Send it back unopened', effects: { archivists: { trust: -6 }, wardens: { trust: 2 } }, log: 'Humanity sent the Archivists\' gift back unopened.' },
      { id: 'military', label: 'Hand it to the military', effects: { archivists: { trust: -4 }, wardens: { fear: 6, aggression: 4 } }, log: 'The Archivists\' gift was handed to the military.' },
    ],
  },
  {
    id: 'jet', day: 24, title: 'A jet near a landing craft',
    text: 'A fighter jet has strayed close to a Warden landing craft. The pilot asks for orders.',
    options: [
      { id: 'home', label: 'Order the jet home', effects: { wardens: { trust: 4, fear: -4 } }, log: 'A fighter jet was ordered away from a Warden landing craft.' },
      { id: 'hold', label: 'Hold position', effects: { wardens: { aggression: 6, fear: 4 } }, log: 'A fighter jet held position beside a Warden landing craft.' },
      { id: 'shot', label: 'Fire a warning shot', effects: { wardens: { aggression: 20, fear: 10, trust: -10 }, archivists: { trust: -6 }, pilgrims: { trust: -6 } }, log: 'A fighter jet fired a warning shot at a Warden landing craft. The craft fired back.', casualties: 2 },
    ],
  },
];

const BASELINE: Record<FactionId, FactionState> = {
  archivists: { trust: 50, fear: 20, curiosity: 70, aggression: 5 },
  wardens: { trust: 30, fear: 45, curiosity: 25, aggression: 35 },
  pilgrims: { trust: 55, fear: 30, curiosity: 50, aggression: 5 },
};

// --- The game -----------------------------------------------------------------------

export class Game {
  world: World;
  s: State;
  private listeners: (() => void)[] = [];

  constructor(state: State) {
    this.s = state;
    this.world = generateWorld(state.seed);
  }

  static create(seed: string): Game {
    const world = generateWorld(seed);
    const factions = JSON.parse(JSON.stringify(BASELINE)) as Record<FactionId, FactionState>;
    if (world.truth === 'claim') factions.wardens.aggression = 50;
    if (world.truth === 'flee') factions.wardens.fear = 65;
    if (world.truth === 'return') factions.pilgrims.trust = 65;
    if (world.truth === 'warn') factions.archivists.trust = 58;
    const g = new Game({
      version: SAVE_VERSION, seed, day: 1, hyp: {}, hypLog: [], baseGuess: null, read: {}, replies: [], sent: [],
      factions, feed: [], journal: [], decisions: {}, contradictions: [], casualties: 0, departed: false, war: false, ended: null,
    });
    g.s.journal.push({ day: 1, kind: 'contact', text: 'The first transmission arrives.', tokens: world.first.tokens });
    g.s.feed.push({ day: 1, text: 'Three objects are decelerating toward Earth. A repeating transmission is coming from the largest.' });
    return g;
  }

  on(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  changed(): void {
    for (const l of this.listeners) l();
  }

  // --- Evidence -------------------------------------------------------------------

  get evidence(): Evidence[] {
    return [...this.world.evidence.filter((e) => e.day <= this.s.day), ...this.s.replies.filter((r) => r.day <= this.s.day)].sort((a, b) => a.day - b.day);
  }

  evidenceById(id: string): Evidence | undefined {
    return this.world.evidence.find((e) => e.id === id) ?? this.s.replies.find((e) => e.id === id);
  }

  /** Glyphs the player has seen, in order of first sighting. */
  seenConcepts(): string[] {
    const seen: string[] = [];
    for (const e of this.evidence) for (const t of e.tokens) if (t !== ';' && !seen.includes(t)) seen.push(t);
    return seen;
  }

  sightings(concept: string): Evidence[] {
    return this.evidence.filter((e) => e.tokens.includes(concept));
  }

  unread(): Evidence[] {
    return this.evidence.filter((e) => this.s.read[e.id] === undefined);
  }

  markRead(id: string): void {
    if (this.s.read[id] === undefined) this.s.read[id] = this.s.day;
  }

  character(id?: string) {
    return id ? this.world.characters.find((c) => c.id === id) : undefined;
  }

  // --- Hypotheses -----------------------------------------------------------------

  /** Meanings offered for a glyph: the truth among plausible alternatives. */
  candidates(concept: string): string[] {
    const c = CONCEPT[concept];
    const rng = new Rng(hashString(`${this.s.seed}|cand|${concept}`));
    const pool = CONCEPTS.filter((x) => x.id !== concept && !!x.grammar === !!c.grammar);
    const same = rng.shuffle(pool.filter((x) => x.family === c.family)).slice(0, 2);
    const overlap = (x: typeof c) => x.tags.filter((t) => c.tags.includes(t)).length + rng.next() * 0.5;
    const similar = pool.filter((x) => x.family !== c.family && !same.includes(x)).sort((a, b) => overlap(b) - overlap(a)).slice(0, c.grammar ? 3 : 3);
    // The trap: the word for "submit" is easily read as friendship.
    const extra = concept === 'SUBMIT' ? [CONCEPT.PEACE, CONCEPT.TRUST] : [];
    const ids = [...new Set([concept, ...same.map((x) => x.id), ...similar.map((x) => x.id), ...extra.map((x) => x.id)])].slice(0, 6);
    return rng.shuffle(ids);
  }

  /** How strongly the evidence supports reading `concept`'s glyph as `guess` (0-100). */
  confidence(concept: string, guess = this.s.hyp[concept]): number {
    if (!guess) return 0;
    const g = CONCEPT[guess];
    const items = this.sightings(concept);
    const n = items.length;
    if (!n) return 0;
    let support = 0;
    for (const e of items) {
      // Grammar words must also sit where such words go in a sentence.
      if (g.grammar && !this.structural(concept, guess, e)) {
        support -= 0.7;
        continue;
      }
      if (!e.tags.length) continue;
      const hit = g.tags.filter((t) => e.tags.includes(t)).length;
      support += hit >= 2 ? 1.2 : hit === 1 ? 0.8 : e.tags.length >= 2 ? -0.7 : 0;
    }
    // Family resemblance: glyphs that share a shape should share a theme.
    let family = 0;
    const shape = this.world.glyphs.base[CONCEPT[concept].family];
    for (const [other, og] of Object.entries(this.s.hyp)) {
      if (other === concept || this.world.glyphs.base[CONCEPT[other].family] !== shape) continue;
      family += CONCEPT[og].family === g.family ? 10 : -8;
    }
    family = Math.max(-20, Math.min(24, family));
    const v = 12 + (62 * Math.max(0, support)) / (n + 1.2) + family + Math.min(10, n * 2);
    return Math.round(Math.max(1, Math.min(99, v)));
  }

  private structural(concept: string, guess: string, e: Evidence): boolean {
    const sentences: string[][] = [[]];
    for (const t of e.tokens) (t === ';' ? sentences.push([]) : sentences[sentences.length - 1].push(t));
    for (const s of sentences) {
      const k = s.indexOf(concept);
      if (k < 0) continue;
      if (guess === 'ASK') return k === s.length - 1;
      if (guess === 'NOT') return k < s.length - 1;
      // Tense markers follow another word.
      return k > 0;
    }
    return false;
  }

  setHypothesis(concept: string, guess: string): void {
    if (this.s.hyp[concept] === guess) return;
    const first = !Object.keys(this.s.hyp).length;
    this.s.hyp[concept] = guess;
    this.s.hypLog.push({ day: this.s.day, concept, guess });
    for (const c of this.s.contradictions) if (c.concept === concept) c.open = false;
    if (first) this.s.journal.push({ day: this.s.day, kind: 'hyp', text: `Your first reading: this glyph means "${gloss(guess)}".`, tokens: [concept] });
    this.changed();
  }

  /** The player's reading of a token list. */
  reading(tokens: string[], hyp = this.s.hyp): string {
    const words: string[] = [];
    for (const t of tokens) words.push(t === ';' ? '/' : gloss(hyp[t]));
    return words.join(' ');
  }

  /** The true meaning, word by word. */
  truthGloss(tokens: string[]): string {
    return tokens.map((t) => (t === ';' ? '/' : gloss(t))).join(' ');
  }

  // --- Numbers ----------------------------------------------------------------------

  digits(n: number): number[] {
    return toDigits(n, this.world.base);
  }

  /** What a numeral means if the player's base guess is right. */
  readNumber(n: number, base = this.s.baseGuess): number | null {
    if (!base) return null;
    const d = this.digits(n);
    if (d.some((v) => v >= base)) return null;
    return fromDigits(d, base);
  }

  setBase(b: number): void {
    if (this.s.baseGuess === b) return;
    this.s.baseGuess = b;
    this.s.journal.push({ day: this.s.day, kind: 'discovery', text: `You concluded they count in base ${b}.` });
    this.changed();
  }

  // --- Messages ---------------------------------------------------------------------

  get sentToday(): boolean {
    return this.s.sent.some((m) => m.day === this.s.day);
  }

  send(tokens: string[]): void {
    if (this.sentToday || !tokens.length || this.s.ended) return;
    const intended = this.reading(tokens);
    const real = this.truthGloss(tokens);
    this.s.sent.push({ day: this.s.day, tokens, intended, real });
    this.s.journal.push({ day: this.s.day, kind: 'sent', text: `You sent: "${intended}".`, tokens });
    const r = readMessage(tokens);
    const asked = this.s.sent.filter((m) => readMessage(m.tokens).asksWhy).length - 1;
    const re = react(r, this.world.truth, Math.max(0, asked), this.s.factions.wardens.aggression);
    this.apply(re.deltas);
    const speaker = this.world.characters.find((c) => c.faction === re.speaker)!;
    this.s.replies.push({
      id: `r${this.s.sent.length}`,
      day: this.s.day + 1,
      kind: 'reply',
      title: `Reply from the ${FACTIONS.find((f) => f.id === re.speaker)!.name}`,
      desc: `Their answer to your message "${intended}".`,
      tags: re.tags,
      tokens: sentence(re.say, this.world.order),
      from: speaker.id,
    });
    this.changed();
  }

  private apply(deltas: Partial<Record<FactionId, Partial<FactionState>>>): void {
    for (const [f, d] of Object.entries(deltas) as [FactionId, Partial<FactionState>][]) {
      const st = this.s.factions[f];
      for (const [k, v] of Object.entries(d) as [keyof FactionState, number][]) st[k] = Math.max(0, Math.min(100, st[k] + v));
    }
  }

  // --- Decisions ----------------------------------------------------------------------

  pendingDecision(): Decision | null {
    if (this.s.ended) return null;
    return DECISIONS.find((d) => d.day <= this.s.day && !this.s.decisions[d.id]) ?? null;
  }

  decide(id: string, option: string): void {
    const d = DECISIONS.find((x) => x.id === id);
    const o = d?.options.find((x) => x.id === option);
    if (!d || !o || this.s.decisions[id]) return;
    this.s.decisions[id] = option;
    this.apply(o.effects);
    this.s.casualties += o.casualties ?? 0;
    this.s.journal.push({ day: this.s.day, kind: 'decision', text: o.log });
    if (id === 'lie' && option === 'ask') {
      this.s.replies.push({
        id: 'r-lie', day: this.s.day + 1, kind: 'reply', title: 'Archivist answer', desc: 'Sent privately, on a narrow beam, after you asked about the Warden weapons.',
        tags: ['war', 'ship'], tokens: sentence('S:WE O:WEAPON ; S:WE V:!TRUST O:WEAPON', this.world.order), from: 'a0',
      });
    }
    this.changed();
  }

  // --- Days -------------------------------------------------------------------------

  get canReport(): boolean {
    return this.s.day >= 12 || this.s.war || this.s.departed;
  }

  get mustReport(): boolean {
    return this.s.day > DAYS || this.s.war || this.s.departed;
  }

  nextDay(): void {
    if (this.s.ended || this.mustReport || this.pendingDecision()) return;
    const before = JSON.parse(JSON.stringify(this.s.factions)) as Record<FactionId, FactionState>;
    this.s.day++;
    const F = this.s.factions;
    // Drift: fear fades, distrust breeds aggression among the Wardens.
    for (const f of FACTIONS) {
      const st = F[f.id];
      st.fear = Math.max(0, st.fear - 1);
      st.trust += (BASELINE[f.id].trust - st.trust) * 0.03;
    }
    if (F.wardens.trust < 30) F.wardens.aggression = Math.min(100, F.wardens.aggression + 1.5);
    else F.wardens.aggression = Math.max(0, F.wardens.aggression - 0.5);
    this.describe(before);
    // New evidence that challenges current readings.
    for (const e of this.evidence.filter((x) => x.day === this.s.day)) {
      if (e.exposes) {
        this.s.journal.push({ day: this.s.day, kind: 'contradiction', text: 'Telescopes saw weapon ports on the Warden ships, after the Wardens told us something about weapons.', tokens: e.tokens });
      }
      if (e.tags.length < 2) continue;
      for (const t of new Set(e.tokens)) {
        const g = this.s.hyp[t];
        if (!g || t === ';' || CONCEPT[g].grammar) continue;
        const hit = CONCEPT[g].tags.filter((x) => e.tags.includes(x)).length;
        if (hit === 0 && !this.s.contradictions.some((c) => c.concept === t && c.open)) {
          this.s.contradictions.push({ concept: t, evidence: e.id, day: this.s.day, open: true });
          this.s.journal.push({ day: this.s.day, kind: 'contradiction', text: `A glyph you read as "${gloss(g)}" turned up in "${e.title}".`, tokens: [t] });
        }
      }
    }
    // War and isolation.
    const avgTrust = (F.archivists.trust + F.wardens.trust + F.pilgrims.trust) / 3;
    const avgCur = (F.archivists.curiosity + F.wardens.curiosity + F.pilgrims.curiosity) / 3;
    if (!this.s.war && F.wardens.aggression >= 90 && avgTrust < 40) {
      this.s.war = true;
      this.s.casualties += 1200 + Math.round(F.wardens.aggression * 40);
      this.s.feed.push({ day: this.s.day, text: 'Warden ships open fire on orbital defenses. The First Contact War has begun.', faction: 'wardens' });
      this.s.journal.push({ day: this.s.day, kind: 'event', text: 'The First Contact War began.' });
    } else if (!this.s.departed && avgTrust < 15 && avgCur < 30) {
      this.s.departed = true;
      this.s.feed.push({ day: this.s.day, text: 'All three ships turn away from Earth and fall silent.' });
      this.s.journal.push({ day: this.s.day, kind: 'event', text: 'The visitors decided humanity could not be trusted, and left.' });
    }
    const d = this.pendingDecision();
    if (d) this.s.feed.push({ day: this.s.day, text: `The Council needs your advice: ${d.title.toLowerCase()}.` });
    this.changed();
  }

  /** Behavior, not numbers: what the telescopes see. */
  private describe(before: Record<FactionId, FactionState>): void {
    const F = this.s.factions;
    const delta = (f: FactionId, k: keyof FactionState) => F[f][k] - before[f][k];
    const say = (text: string, faction: FactionId) => this.s.feed.push({ day: this.s.day, text, faction });
    const lastMood = this.s.feed.length;
    const changes: [number, () => void][] = [
      [delta('wardens', 'aggression'), () => say(F.wardens.aggression > 70 ? 'Warden ships have taken up firing positions around the Moon.' : 'The Warden escorts tighten their formation.', 'wardens')],
      [-delta('wardens', 'aggression'), () => say('The Warden escorts drift apart and power down their running lights.', 'wardens')],
      [delta('archivists', 'trust'), () => say('The Archivist ship dims its lights to a steady, gentle glow.', 'archivists')],
      [-delta('archivists', 'trust'), () => say('The Archivist ship has moved further out and sends less.', 'archivists')],
      [delta('pilgrims', 'trust'), () => say('The Pilgrim ark has come closer. Its hull ripples with color.', 'pilgrims')],
      [-delta('pilgrims', 'trust'), () => say('The Pilgrim ark retreats behind the Moon.', 'pilgrims')],
    ];
    for (const [v, fn] of changes) if (v >= 2) fn();
    if (this.s.feed.length === lastMood && this.s.day % 3 === 0) {
      const quiet = ['The ships hold their positions. Transmissions continue.', 'A quiet day. The Archivist ship keeps sweeping our radio bands.', 'The Pilgrim ark completes another slow orbit.'];
      this.s.feed.push({ day: this.s.day, text: quiet[this.s.day % quiet.length] });
    }
  }

  mood(f: FactionId): { word: string; text: string } {
    const st = this.s.factions[f];
    if (this.s.departed) return { word: 'Gone', text: 'They have left.' };
    if (st.aggression > 70) return { word: 'Hostile', text: 'Weapons are powered. Their messages are short and cold.' };
    if (st.fear > 60) return { word: 'Afraid', text: 'They keep their distance and watch every launch we make.' };
    if (st.trust > 68) return { word: 'Warm', text: 'They come close and talk often.' };
    if (st.trust < 28) return { word: 'Suspicious', text: 'They answer slowly, if at all.' };
    if (st.curiosity > 65) return { word: 'Curious', text: 'They send questions and long archives.' };
    return { word: 'Watchful', text: 'They are polite and careful.' };
  }

  // --- The end ----------------------------------------------------------------------

  firstOptions(): string[] {
    const truth = this.world.first.meaning;
    const mine = `"${this.reading(this.world.first.tokens)}"`;
    const others = ['We come in peace.', 'We are watching you.', 'This world is ours now.', 'We are returning home.', 'We need your help.'].filter((x) => x !== truth);
    const rng = new Rng(hashString(`${this.s.seed}|first`));
    const opts = [truth, ...rng.shuffle(others).slice(0, 2)];
    if (!opts.includes(mine) && !mine.includes('?')) opts.push(`Your reading: ${mine}`);
    return rng.shuffle(opts);
  }

  /** Ages the probe might be, depending on how you read their numerals. */
  probeOptions(): number[] {
    const d = this.digits(this.world.probeAge);
    const opts = new Set([6, 8, 10, 12, 16].map((b) => (d.every((v) => v < b) ? fromDigits(d, b) : -1)).filter((v) => v > 0));
    // Reading the digits backwards is a classic mistake.
    const rev = [...d].reverse();
    for (const b of [10, this.world.base]) if (opts.size < 4 && rev.every((v) => v < b) && rev[0] !== 0) opts.add(fromDigits(rev, b));
    let k = 2;
    while (opts.size < 3) opts.add(Math.round(this.world.probeAge * (k++ % 2 ? 0.5 : 2)));
    return [...opts].sort((a, b) => a - b).slice(0, 5);
  }

  mastery(): number {
    let sum = 0;
    let w = 0;
    for (const c of this.seenConcepts()) {
      const weight = CONCEPT[c].grammar ? 0.5 : 1;
      sum += closeness(this.s.hyp[c], c) * weight;
      w += weight;
    }
    return w ? Math.round((sum / w) * 100) : 0;
  }

  conclude(why: Truth, first: string, probe: number): Final {
    const truth = this.world.truth;
    const whyScore = why === truth ? 1 : EXPLANATIONS.find((e) => e.id === truth)!.near.includes(why) ? 0.5 : 0;
    const firstRight = first === this.world.first.meaning;
    const probeRight = probe === this.world.probeAge;
    const F = this.s.factions;
    const trust = Math.round((F.archivists.trust + F.wardens.trust + F.pilgrims.trust) / 3);
    let relation: Final['relation'];
    if (this.s.war) relation = 'War';
    else if (this.s.departed) relation = 'Isolation';
    else if (F.wardens.aggression > 70 || trust < 32) relation = 'Cold war';
    else if (trust >= 62 && whyScore === 1) relation = 'Alliance';
    else if (trust >= 45) relation = 'Peace';
    else relation = 'Cold war';
    const mastery = this.mastery();
    const history = Math.round(whyScore * 50 + (probeRight ? 25 : 0) + (firstRight ? 25 : 0));
    const firstRead = this.s.journal.find((j) => j.kind === 'hyp');
    let verdict = firstRight ? 'You understood the first message.' : 'You misunderstood the first message.';
    verdict += whyScore === 1 ? ' And you understood why they came.' : whyScore > 0 ? ' You came close to understanding why they came.' : ' Why they came remained a mystery to humanity.';
    if (relation === 'War') verdict += ' The misunderstanding cost lives.';
    if (!firstRead) verdict += ' You never committed to a reading of their language.';
    const f: Final = { day: this.s.day, why, whyScore, first, firstRight, probe, probeRight, mastery, history, trust, casualties: this.s.casualties, relation, verdict };
    this.s.ended = f;
    this.s.journal.push({ day: this.s.day, kind: 'event', text: `You delivered your report: "${EXPLANATIONS.find((e) => e.id === why)!.text}"` });
    this.changed();
    return f;
  }

  /** Days on which the player first read each glyph correctly. */
  discoveries(): { day: number; concept: string }[] {
    const out: { day: number; concept: string }[] = [];
    for (const c of this.seenConcepts()) {
      const right = this.s.hypLog.find((h) => h.concept === c && h.guess === c);
      if (right && this.s.hyp[c] === c && !CONCEPT[c].grammar) out.push({ day: right.day, concept: c });
    }
    return out.sort((a, b) => a.day - b.day);
  }
}
