import { h } from '../../shared/dom';
import type { IconKey } from '../art';
import { CONCEPT, FAMILIES, gloss, TAGS } from '../lang/concepts';
import { confidenceLabel, DECISIONS, type Game } from '../sim/game';
import { DAYS, EXPLANATIONS, FACTIONS, type Evidence, type FactionId, type Truth } from '../sim/world';
import type { App } from './app';
import { alienText, conceptGlyph, gi, numeral } from './glyph';
import { spaceView } from './space';

const KIND_ICON: Record<Evidence['kind'], IconKey> = {
  transmission: 'k-transmission', artifact: 'k-artifact', observation: 'k-observation', signal: 'k-signal', reply: 'k-reply',
};
const KIND_LABEL: Record<Evidence['kind'], string> = {
  transmission: 'Transmission', artifact: 'Artifact', observation: 'Observation', signal: 'Signal', reply: 'Reply',
};

function confBar(v: number): HTMLElement {
  const label = confidenceLabel(v);
  return h('span', { class: `fc-conf c-${label.toLowerCase()}`, title: `${label} (${v}%)` }, h('i', { style: { width: `${v}%` } }), h('em', null, label));
}

function source(game: Game, e: Evidence): string {
  const ch = game.character(e.from);
  if (!ch) return KIND_LABEL[e.kind];
  const f = FACTIONS.find((x) => x.id === ch.faction)!;
  return `${KIND_LABEL[e.kind]} · ${ch.name}, ${f.name} ${ch.role.toLowerCase()}`;
}

function tagChips(e: Evidence): HTMLElement | null {
  if (!e.tags.length) return null;
  return h('div', { class: 'fc-tags' }, h('span', null, 'Context:'), ...e.tags.map((t) => h('i', null, TAGS[t] ?? t)));
}

// --- Observatory ------------------------------------------------------------------------

export function observatory(app: App): HTMLElement {
  const g = app.game;
  const today = g.evidence.filter((e) => e.day === g.s.day);
  const dec = g.pendingDecision();
  const open = g.s.contradictions.filter((c) => c.open);
  const feed = [...g.s.feed].reverse().slice(0, 14);
  return h('div', { class: 'fc-screen fc-obs' },
    h('div', { class: 'fc-spacewrap' }, spaceView(g), h('div', { class: 'fc-dayflag' }, h('b', null, `Day ${g.s.day}`), h('span', null, `of ${DAYS}`))),
    dec ? decisionCard(app, dec.id) : null,
    g.s.war ? h('div', { class: 'fc-alert war' }, gi('u-warning'), h('span', null, 'The First Contact War has begun. Write your report while there is still time.')) : null,
    g.s.departed ? h('div', { class: 'fc-alert' }, gi('u-warning'), h('span', null, 'The visitors have left. Write your report.')) : null,
    h('section', { class: 'fc-card' },
      h('h3', null, gi('n-translate'), today.length ? `Arrived today (${today.length})` : 'Nothing new today'),
      ...today.filter((e) => e.tokens.length || e.kind === 'signal').map((e) => evidenceCard(app, e, true)),
      ...today.filter((e) => !e.tokens.length && e.kind !== 'signal').map((e) => h('p', { class: 'fc-obsnote' }, gi(KIND_ICON[e.kind]), h('span', null, h('b', null, e.title), ` ${e.desc}`))),
    ),
    open.length ? h('section', { class: 'fc-card warn' },
      h('h3', null, gi('u-warning'), 'Contradictions'),
      ...open.map((c) => {
        const e = g.evidenceById(c.evidence)!;
        return h('div', { class: 'fc-contra' },
          h('button', { class: 'fc-g big', 'aria-label': 'Revise this glyph', onclick: () => app.glyph(c.concept) }, conceptGlyph(g, c.concept)),
          h('span', null, `You read this as "${gloss(g.s.hyp[c.concept])}", but it turned up in "${e.title}" (${e.tags.map((t) => TAGS[t]).join(', ')}). Revise your reading?`),
        );
      }),
    ) : null,
    h('section', { class: 'fc-card' },
      h('h3', null, gi('u-telescope'), 'Observations'),
      ...feed.map((f) => h('p', { class: 'fc-feed' }, h('small', null, `Day ${f.day}`), f.text)),
    ),
  );
}

function decisionCard(app: App, id: string): HTMLElement {
  const d = DECISIONS.find((x) => x.id === id)!;
  return h('section', { class: 'fc-card council' },
    h('h3', null, gi('u-council'), `The Council asks: ${d.title}`),
    h('p', null, d.text),
    h('div', { class: 'fc-choices' }, ...d.options.map((o) => h('button', { class: 'fc-btn', onclick: () => { app.game.decide(d.id, o.id); app.render(); } }, o.label))),
    h('p', { class: 'fc-hint' }, 'The next day will not come until you advise them.'),
  );
}

export function evidenceCard(app: App, e: Evidence, animate = false): HTMLElement {
  const g = app.game;
  const unread = g.s.read[e.id] === undefined;
  return h('button', { class: `fc-ev ${unread ? 'unread' : ''}`, onclick: () => app.openEvidence(e.id) },
    h('span', { class: 'fc-evhead' }, gi(KIND_ICON[e.kind]), h('b', null, e.title), h('small', null, `Day ${e.day}`)),
    e.kind === 'signal' ? h('span', { class: 'fc-evsub' }, 'Pulses and marks. Probably numbers.') : alienText(g, e.tokens, { size: 'md', animate: animate && unread, vertical: e.vertical }),
  );
}

// --- Translator ---------------------------------------------------------------------------

export function translate(app: App): HTMLElement {
  const g = app.game;
  const all = g.evidence.filter((e) => e.tokens.length || e.kind === 'signal').reverse();
  const sel = g.evidenceById(app.evidenceId ?? '') ?? all[0];
  if (sel) g.markRead(sel.id);
  const list = h('div', { class: 'fc-list' }, ...all.map((e) => h('button', {
    class: `fc-li ${e.id === sel?.id ? 'on' : ''} ${g.s.read[e.id] === undefined ? 'unread' : ''}`,
    onclick: () => app.openEvidence(e.id),
  }, gi(KIND_ICON[e.kind]), h('span', null, h('b', null, e.title), h('small', null, `Day ${e.day} · ${KIND_LABEL[e.kind]}`)))));
  return h('div', { class: 'fc-screen fc-split' }, list, sel ? h('div', { class: 'fc-detail' }, evidenceDetail(app, sel)) : h('p', null, 'Nothing yet.'));
}

export function evidenceDetail(app: App, e: Evidence): HTMLElement {
  const g = app.game;
  if (e.kind === 'signal') return countingSignal(app);
  const reading = g.reading(e.tokens);
  return h('div', { class: 'fc-evdetail' },
    h('p', { class: 'fc-src' }, gi(KIND_ICON[e.kind]), source(g, e)),
    h('h2', null, e.title),
    h('div', { class: 'fc-stage' }, alienText(g, e.tokens, { readings: true, onGlyph: (c) => app.glyph(c), size: 'xl', vertical: e.vertical, animate: true })),
    h('p', { class: 'fc-reading' }, h('span', null, 'Your reading'), h('b', null, `“${reading}”`)),
    h('p', null, e.desc),
    tagChips(e),
    e.date ? h('div', { class: 'fc-date' }, h('span', null, 'Inscribed date:'), numeral(g, e.date), h('em', null, g.readNumber(e.date) !== null ? `≈ ${g.readNumber(e.date)!.toLocaleString('en-US')} cycles ago (base ${g.s.baseGuess})` : 'Decode their numbers in the Archive to read this.')) : null,
    e.vertical ? h('p', { class: 'fc-hint' }, 'This one is written top to bottom. Older texts seem to be.') : null,
    h('p', { class: 'fc-hint' }, 'Tap a glyph to study it and choose what you think it means.'),
  );
}

function countingSignal(app: App): HTMLElement {
  const g = app.game;
  const rows: HTMLElement[] = [];
  for (let n = 1; n <= g.world.base + 4; n++) {
    rows.push(h('div', { class: 'fc-count' }, h('span', { class: 'fc-pulses' }, '•'.repeat(n)), numeral(g, n)));
  }
  return h('div', { class: 'fc-evdetail' },
    h('p', { class: 'fc-src' }, gi('k-signal'), 'Signal'),
    h('h2', null, 'Counting signal'),
    h('p', null, 'Each burst of pulses is followed by a mark. Count the pulses. When does a mark need two symbols?'),
    h('div', { class: 'fc-counts' }, ...rows),
    baseChooser(app),
  );
}

export function baseChooser(app: App): HTMLElement {
  const g = app.game;
  return h('div', { class: 'fc-base' },
    h('span', null, 'They count in base:'),
    ...[6, 8, 10, 12].map((b) => h('button', { class: `fc-chip ${g.s.baseGuess === b ? 'on' : ''}`, onclick: () => { g.setBase(b); app.render(); } }, String(b))),
  );
}

// --- Glyph sheet ---------------------------------------------------------------------------

export function glyphSheet(app: App, concept: string): HTMLElement {
  const g = app.game;
  const cur = g.s.hyp[concept];
  const conf = g.confidence(concept);
  const seen = g.sightings(concept);
  const shape = g.world.glyphs.base[CONCEPT[concept].family];
  const alike = g.seenConcepts().filter((c) => c !== concept && g.world.glyphs.base[CONCEPT[c].family] === shape);
  // What can be said about where the glyph sits.
  const notes: string[] = [];
  const pos = seen.flatMap((e) => {
    const out: string[] = [];
    let s: string[] = [];
    for (const t of [...e.tokens, ';']) {
      if (t === ';') {
        const k = s.indexOf(concept);
        if (k >= 0) out.push(k === s.length - 1 ? 'end' : k === 0 ? 'start' : 'mid');
        s = [];
      } else s.push(t);
    }
    return out;
  });
  if (pos.length >= 2 && pos.every((p) => p === 'end')) notes.push('Always comes at the end of a sentence.');
  if (pos.length >= 2 && pos.every((p) => p !== 'start')) notes.push('Never starts a sentence: it seems to attach to the word before it.');
  if (seen.filter((e) => e.date).length >= 2) notes.push('Common on dated artifacts.');
  return h('div', { class: 'fc-sheet' },
    h('div', { class: 'fc-sheethead' },
      h('div', { class: 'fc-biglyph' }, conceptGlyph(g, concept, { animate: true })),
      h('div', null,
        h('p', { class: 'fc-hint' }, 'Your reading'),
        h('h2', null, cur ? gloss(cur) : 'Unknown'),
        cur ? confBar(conf) : h('p', { class: 'fc-hint' }, 'Choose a meaning below.'),
      ),
    ),
    h('h4', null, 'What do you think it means?'),
    h('div', { class: 'fc-cands' }, ...g.candidates(concept).map((c) => h('button', {
      class: `fc-cand ${cur === c ? 'on' : ''}`,
      onclick: () => { g.setHypothesis(concept, c); app.refreshSheet(concept); },
    }, gloss(c)))),
    cur ? h('p', { class: 'fc-hint' }, 'Confidence comes from the evidence, not from the truth. Strong readings can still be wrong.') : null,
    notes.length ? h('div', { class: 'fc-notes' }, h('h4', null, 'Patterns'), ...notes.map((n) => h('p', null, n))) : null,
    alike.length ? h('div', null,
      h('h4', null, 'Glyphs with the same shape'),
      h('div', { class: 'fc-alike' }, ...alike.map((c) => h('button', { class: 'fc-g', onclick: () => app.glyph(c) }, conceptGlyph(g, c), h('small', null, g.s.hyp[c] ? gloss(g.s.hyp[c]) : '?')))),
      h('p', { class: 'fc-hint' }, `Shared shapes usually mean related ideas${alike.some((c) => g.s.hyp[c]) ? `: you have read these as ${[...new Set(alike.filter((c) => g.s.hyp[c]).map((c) => FAMILIES.find((f) => f.id === CONCEPT[g.s.hyp[c]].family)!.label))].join(', ')}` : ''}.`),
    ) : null,
    h('h4', null, `Seen ${seen.length} time${seen.length === 1 ? '' : 's'}`),
    ...seen.map((e) => h('button', { class: 'fc-seen', onclick: () => app.openEvidence(e.id) },
      h('span', { class: 'fc-evhead' }, gi(KIND_ICON[e.kind]), h('b', null, e.title), h('small', null, `Day ${e.day}`)),
      alienText(g, e.tokens, { size: 'sm', highlight: concept, readings: true, vertical: false }),
      e.tags.length ? h('small', { class: 'fc-ctx' }, e.tags.map((t) => TAGS[t]).join(' · ')) : null,
    )),
  );
}

// --- Dictionary -------------------------------------------------------------------------------

export function dictionary(app: App): HTMLElement {
  const g = app.game;
  const seen = g.seenConcepts();
  const read = seen.filter((c) => g.s.hyp[c]).length;
  // Group by shape: the player can see shapes, not families.
  const groups = new Map<string, string[]>();
  for (const c of seen) {
    const shape = g.world.glyphs.base[CONCEPT[c].family];
    if (!groups.has(shape)) groups.set(shape, []);
    groups.get(shape)!.push(c);
  }
  return h('div', { class: 'fc-screen' },
    h('div', { class: 'fc-pagehead' }, h('h2', null, 'Dictionary'), h('p', null, `${seen.length} glyphs seen · ${read} with a reading. Grouped by shape.`)),
    ...[...groups.values()].map((list) => h('section', { class: 'fc-dictgroup' },
      ...list.map((c) => {
        const v = g.confidence(c);
        return h('button', { class: `fc-dict ${g.s.hyp[c] ? '' : 'unknown'}`, onclick: () => app.glyph(c) },
          conceptGlyph(g, c),
          h('b', null, g.s.hyp[c] ? gloss(g.s.hyp[c]) : '?'),
          g.s.hyp[c] ? confBar(v) : h('small', null, `seen ${g.sightings(c).length}×`),
        );
      }),
    )),
  );
}

// --- Civilization ------------------------------------------------------------------------------

export function civilization(app: App): HTMLElement {
  const g = app.game;
  const heard = new Set(g.evidence.map((e) => e.from).filter(Boolean));
  const vocab = (f: FactionId) => {
    const count = new Map<string, number>();
    for (const e of g.evidence) {
      if (g.character(e.from)?.faction !== f) continue;
      for (const t of e.tokens) if (t !== ';' && !CONCEPT[t].grammar) count.set(t, (count.get(t) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
  };
  return h('div', { class: 'fc-screen' },
    h('div', { class: 'fc-pagehead' },
      h('h2', null, `The ${g.world.species}`),
      h('p', null, `Humanity's name for them, after the first sound in their signal. They are not one people: three factions travel together, and each speaks differently.`),
    ),
    ...FACTIONS.map((f) => {
      const m = g.mood(f.id);
      const people = g.world.characters.filter((c) => c.faction === f.id && heard.has(c.id));
      const words = vocab(f.id);
      return h('section', { class: `fc-card fc-faction f-${f.id}` },
        h('h3', null, gi(`f-${f.id}` as IconKey), f.name, h('span', { class: `fc-mood m-${m.word.toLowerCase()}` }, m.word)),
        h('p', null, f.blurb),
        h('p', { class: 'fc-hint' }, m.text),
        people.length ? h('div', { class: 'fc-people' }, h('h4', null, 'Voices'), ...people.map((p) => h('span', { class: 'fc-person' }, h('b', null, p.name), h('small', null, p.role)))) : null,
        words.length ? h('div', null, h('h4', null, 'Words they use most'), h('div', { class: 'fc-alike' }, ...words.map((c) => h('button', { class: 'fc-g', onclick: () => app.glyph(c) }, conceptGlyph(g, c), h('small', null, g.s.hyp[c] ? gloss(g.s.hyp[c]) : '?'))))) : null,
      );
    }),
  );
}

// --- Archive -------------------------------------------------------------------------------------

export function archive(app: App): HTMLElement {
  const g = app.game;
  const arts = g.evidence.filter((e) => e.kind === 'artifact');
  const signal = g.evidence.some((e) => e.kind === 'signal');
  const dated = arts.filter((e) => e.date).map((e) => ({ e, v: g.readNumber(e.date!) }));
  const sorted = [...dated].sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  return h('div', { class: 'fc-screen' },
    h('div', { class: 'fc-pagehead' }, h('h2', null, 'Archive'), h('p', null, 'Artifacts from the picture archive they beamed to Earth, and one we found on the Moon. Reconstruct their history.')),
    signal ? h('section', { class: 'fc-card' },
      h('h3', null, gi('k-signal'), 'Numbers'),
      h('p', null, 'The counting signal pairs bursts of pulses with marks. Their dates use the same marks.'),
      h('div', { class: 'fc-counts inline' }, ...Array.from({ length: g.world.base + 2 }, (_, k) => h('div', { class: 'fc-count' }, h('span', { class: 'fc-pulses' }, '•'.repeat(k + 1)), numeral(g, k + 1)))),
      baseChooser(app),
    ) : null,
    h('section', { class: 'fc-card' },
      h('h3', null, gi('n-archive'), g.s.baseGuess ? 'Timeline (oldest first, by your reading of their numbers)' : 'Artifacts'),
      ...(g.s.baseGuess ? sorted : dated).map(({ e, v }) => h('button', { class: 'fc-artrow', onclick: () => app.openEvidence(e.id) },
        h('span', { class: 'fc-artdate' }, numeral(g, e.date!), h('small', null, v !== null ? `${v.toLocaleString('en-US')} cycles ago` : '?')),
        h('span', { class: 'fc-arttext' }, h('b', null, e.title), alienText(g, e.tokens, { size: 'sm', readings: true, vertical: false })),
      )),
      ...arts.filter((e) => !e.date).map((e) => h('button', { class: 'fc-artrow', onclick: () => app.openEvidence(e.id) }, h('span', { class: 'fc-artdate' }, h('small', null, 'undated')), h('span', { class: 'fc-arttext' }, h('b', null, e.title), alienText(g, e.tokens, { size: 'sm', readings: true })))),
      arts.length ? null : h('p', { class: 'fc-hint' }, 'No artifacts yet.'),
    ),
  );
}

// --- Message ---------------------------------------------------------------------------------------

export function message(app: App): HTMLElement {
  const g = app.game;
  const seen = g.seenConcepts();
  const draft = app.draft;
  const sent = [...g.s.sent].reverse();
  const replyOf = (k: number) => g.s.replies.find((r) => r.id === `r${k}`);
  return h('div', { class: 'fc-screen' },
    h('div', { class: 'fc-pagehead' }, h('h2', null, 'Message'), h('p', null, 'Build a reply from glyphs you have seen. They will read what the glyphs really mean, not what you meant. One message a day.')),
    h('section', { class: 'fc-card fc-compose' },
      h('div', { class: 'fc-draft' }, draft.length
        ? alienText(g, draft, { readings: true, size: 'lg', onGlyph: (c) => { app.draft.splice(app.draft.lastIndexOf(c), 1); app.render(); } })
        : h('p', { class: 'fc-hint' }, 'Tap glyphs below to compose. Tap a glyph here to remove it.')),
      h('p', { class: 'fc-reading' }, h('span', null, 'You mean'), h('b', null, draft.length ? `“${g.reading(draft)}”` : '…')),
      h('div', { class: 'fc-actions' },
        h('button', { class: 'fc-btn', disabled: !draft.length, onclick: () => { app.draft = []; app.render(); } }, 'Clear'),
        h('button', { class: 'fc-btn primary', disabled: !draft.length || g.sentToday || !!g.s.ended, onclick: () => app.send() }, gi('n-message'), g.sentToday ? 'Sent today' : 'Transmit'),
      ),
      h('div', { class: 'fc-tiles' }, ...seen.map((c) => h('button', {
        class: `fc-tile ${g.s.hyp[c] ? '' : 'unknown'}`,
        disabled: draft.length >= 7,
        onclick: () => { app.draft.push(c); app.render(); },
      }, conceptGlyph(g, c), h('small', null, g.s.hyp[c] ? gloss(g.s.hyp[c]) : '?')))),
    ),
    sent.length ? h('section', { class: 'fc-card' },
      h('h3', null, gi('k-reply'), 'Conversation'),
      ...sent.map((m) => {
        const k = g.s.sent.indexOf(m) + 1;
        const r = replyOf(k);
        return h('div', { class: 'fc-convo' },
          h('div', { class: 'fc-you' }, h('small', null, `Day ${m.day} · You`), alienText(g, m.tokens, { size: 'sm' }), h('em', null, `“${m.intended}”`)),
          r && r.day <= g.s.day
            ? h('button', { class: 'fc-them', onclick: () => app.openEvidence(r.id) }, h('small', null, `Day ${r.day} · ${g.character(r.from)?.name ?? 'Reply'}`), alienText(g, r.tokens, { size: 'sm', readings: true }))
            : h('p', { class: 'fc-hint' }, 'Awaiting a reply…'),
        );
      }),
    ) : null,
  );
}

// --- Journal -------------------------------------------------------------------------------------------

export function journal(app: App): HTMLElement {
  const g = app.game;
  const byDay = new Map<number, typeof g.s.journal>();
  for (const j of g.s.journal) {
    if (!byDay.has(j.day)) byDay.set(j.day, []);
    byDay.get(j.day)!.push(j);
  }
  return h('div', { class: 'fc-screen' },
    h('div', { class: 'fc-pagehead' }, h('h2', null, 'Journal'), h('p', null, 'The record of your first contact, as it happened.')),
    ...[...byDay.entries()].sort((a, b) => b[0] - a[0]).map(([day, list]) => h('section', { class: 'fc-jday' },
      h('h4', null, `Contact day ${day}`),
      ...list.map((j) => h('div', { class: `fc-jentry ${j.kind}` }, j.tokens ? alienText(g, j.tokens, { size: 'sm' }) : null, h('p', null, j.text))),
    )),
  );
}

// --- Report and the end -------------------------------------------------------------------------------

export function reportForm(app: App, onDone: () => void): HTMLElement {
  const g = app.game;
  let why: Truth | null = null;
  let first: string | null = null;
  let probe: number | null = null;
  const firstOpts = g.firstOptions();
  const probeOpts = g.probeOptions();
  const submit = h('button', { class: 'fc-btn primary', disabled: true, onclick: () => { g.conclude(why!, first!, probe!); onDone(); } }, gi('u-report'), 'Deliver the report');
  const check = () => (submit.disabled = !(why && first && probe !== null));
  const group = <T>(opts: T[], label: (o: T) => string, set: (o: T) => void) => {
    const wrap = h('div', { class: 'fc-choices col' });
    const draw = (sel?: T) => wrap.replaceChildren(...opts.map((o) => h('button', { class: `fc-btn ${sel === o ? 'on' : ''}`, onclick: () => { set(o); draw(o); check(); } }, label(o))));
    draw();
    return wrap;
  };
  return h('div', { class: 'fc-report' },
    h('p', null, 'The Council wants your conclusions. You can keep studying until day 30, but the report is final.'),
    h('h4', null, '1. Why did they come to Earth?'),
    group(EXPLANATIONS, (e) => e.text, (e) => (why = e.id)),
    h('h4', null, '2. What did the first transmission mean?'),
    alienText(g, g.world.first.tokens, { size: 'md', readings: true }),
    group(firstOpts, (o) => o, (o) => (first = o)),
    h('h4', null, '3. How long ago did their probe reach the Moon?'),
    numeral(g, g.world.probeAge, 'fc-num big'),
    group(probeOpts, (o) => `${o.toLocaleString('en-US')} cycles`, (o) => (probe = o)),
    h('div', { class: 'fc-actions' }, submit),
  );
}

export function finale(app: App): HTMLElement {
  const g = app.game;
  const f = g.s.ended!;
  const w = g.world;
  const truth = EXPLANATIONS.find((e) => e.id === w.truth)!;
  const stat = (label: string, value: string, cls = '') => h('div', { class: `fc-stat ${cls}` }, h('span', null, label), h('b', null, value));
  const misreads = g.s.sent.filter((m) => m.intended !== m.real);
  const discoveries = g.discoveries();
  const timeline: { day: number; node: HTMLElement }[] = [];
  timeline.push({ day: 1, node: h('div', null, h('p', null, 'First alien words:'), alienText(g, w.first.tokens, { size: 'md' })) });
  const firstHyp = g.s.journal.find((j) => j.kind === 'hyp');
  if (firstHyp) timeline.push({ day: firstHyp.day, node: h('p', null, firstHyp.text) });
  for (const m of g.s.sent) timeline.push({ day: m.day, node: h('p', null, `You sent “${m.intended}”.`, m.intended !== m.real ? h('em', { class: 'bad' }, ` They read: “${m.real}”.`) : h('em', { class: 'good' }, ' They understood.')) });
  for (const d of discoveries.slice(0, 8)) timeline.push({ day: d.day, node: h('p', null, 'You discovered: ', h('b', null, gloss(d.concept)), ' ', conceptGlyph(g, d.concept, { cls: 'inline' })) });
  for (const j of g.s.journal.filter((x) => x.kind === 'decision' || x.kind === 'contradiction' || x.kind === 'event')) timeline.push({ day: j.day, node: h('p', null, j.text) });
  timeline.sort((a, b) => a.day - b.day);
  const dict = g.seenConcepts().filter((c) => !CONCEPT[c].grammar);
  return h('div', { class: 'fc-screen fc-finale' },
    h('h1', null, 'Your first contact'),
    h('div', { class: 'fc-timeline' }, ...timeline.map((t) => h('div', { class: 'fc-tl' }, h('h4', null, `Contact day ${t.day}`), t.node))),
    h('section', { class: 'fc-card reveal' },
      h('h3', null, 'Their first message'),
      alienText(g, w.first.tokens, { size: 'lg', animate: true }),
      h('p', { class: 'fc-big' }, `“${w.first.meaning}”`),
      h('p', null, `You concluded: “${f.first}”`),
      h('p', null, h('b', null, 'Why they came: '), truth.text),
    ),
    h('section', { class: 'fc-card' },
      h('h3', null, 'Final assessment'),
      stat('Language mastery', `${f.mastery}%`),
      stat('Historical accuracy', `${f.history}%`),
      stat('Alien trust', `${f.trust}%`),
      stat('Human casualties', f.casualties.toLocaleString('en-US'), f.casualties ? 'bad' : ''),
      stat('Diplomatic relations', f.relation.toUpperCase(), f.relation === 'War' || f.relation === 'Isolation' ? 'bad' : f.relation === 'Alliance' || f.relation === 'Peace' ? 'good' : ''),
      stat('Number system', `base ${w.base}${g.s.baseGuess === w.base ? ' ✓' : g.s.baseGuess ? ` (you thought ${g.s.baseGuess})` : ' (never decoded)'}`),
      h('p', { class: 'fc-verdict' }, f.verdict),
    ),
    misreads.length ? h('section', { class: 'fc-card' }, h('h3', null, 'Lost in translation'),
      ...misreads.map((m) => h('p', null, h('small', null, `Day ${m.day}: `), `you meant “${m.intended}”; they read “${m.real}”.`))) : null,
    h('section', { class: 'fc-card' },
      h('h3', null, 'Your dictionary, revealed'),
      h('div', { class: 'fc-revealgrid' }, ...dict.map((c) => {
        const mine = g.s.hyp[c];
        const ok = mine === c;
        const near = !ok && mine && (CONCEPT[c].near?.includes(mine) || CONCEPT[mine]?.near?.includes(c));
        return h('div', { class: `fc-rv ${ok ? 'good' : near ? 'near' : 'bad'}` }, conceptGlyph(g, c), h('b', null, gloss(c)), h('small', null, mine ? `you: ${gloss(mine)}` : 'unread'));
      })),
    ),
    h('div', { class: 'fc-actions center' },
      h('button', { class: 'fc-btn primary', onclick: () => app.newContact() }, 'New first contact'),
      h('button', { class: 'fc-btn', onclick: () => app.title() }, 'Title screen'),
    ),
  );
}
