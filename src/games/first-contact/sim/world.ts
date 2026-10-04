import { hashString, Rng } from '../../shared/rng';
import { makeGlyphs, type GlyphSet } from '../lang/glyphs';

// A generated first contact: who the aliens are, how their language looks,
// what really brought them here, and the evidence that will arrive day by day.

export type Truth = 'return' | 'flee' | 'dying' | 'warn' | 'claim';
export type FactionId = 'archivists' | 'wardens' | 'pilgrims';
export type Order = 'SVO' | 'SOV' | 'VSO' | 'OSV';

export interface Explanation {
  id: Truth;
  short: string;
  text: string;
  /** Explanations that are partly right if this is the truth. */
  near: Truth[];
}

export const EXPLANATIONS: Explanation[] = [
  { id: 'return', short: 'Coming home', text: 'They are returning home. Their ancestors lived here, or seeded life here, long ago.', near: ['claim'] },
  { id: 'flee', short: 'Refugees', text: 'They are fleeing something that destroyed their colonies.', near: ['warn', 'dying'] },
  { id: 'dying', short: 'A dying world', text: 'Their homeworld is dying and they are looking for a new home.', near: ['flee'] },
  { id: 'warn', short: 'A warning', text: 'They came to warn humanity about a danger they once met.', near: ['flee'] },
  { id: 'claim', short: 'Reclaiming', text: 'They consider Earth a lost colony and mean to reclaim it.', near: ['return'] },
];

export interface Faction {
  id: FactionId;
  name: string;
  blurb: string;
}

export const FACTIONS: Faction[] = [
  { id: 'archivists', name: 'Archivists', blurb: 'Scholars and historians. They talk the most and seem to want to be understood.' },
  { id: 'wardens', name: 'Wardens', blurb: 'The armed ships. Terse, formal and hard to read.' },
  { id: 'pilgrims', name: 'Pilgrims', blurb: 'A great slow vessel full of families. Their messages sound like songs.' },
];

export interface Character {
  id: string;
  name: string;
  faction: FactionId;
  role: string;
}

/** One piece of evidence: a transmission, an inscription or an observation. */
export interface Evidence {
  id: string;
  day: number;
  kind: 'transmission' | 'observation' | 'artifact' | 'signal' | 'reply';
  title: string;
  desc: string;
  tags: string[];
  /** Glyph tokens: concept ids, ";" separates sentences. */
  tokens: string[];
  from?: string;
  /** Archive: when it was made, in cycles before now. */
  date?: number;
  vertical?: boolean;
  /** This message is a lie (contradicted later). */
  lie?: boolean;
  /** Evidence that exposes a lie. */
  exposes?: string;
  /** The truth this supports. */
  key?: Truth;
}

export interface World {
  seed: string;
  species: string;
  homeworld: string;
  base: number;
  order: Order;
  glyphs: GlyphSet;
  truth: Truth;
  characters: Character[];
  evidence: Evidence[];
  /** The very first transmission, and what it really says. */
  first: { tokens: string[]; meaning: string };
  /** The lunar probe's age in cycles. */
  probeAge: number;
}

// --- Sentences ---------------------------------------------------------------------

/**
 * A tiny sentence language: "S:WE V:REMEMBER+PAST O:YOU ?" — roles S/V/O/X,
 * "+T" adds a tense marker after the word, "!" negates, "?" asks, ";" splits.
 */
export function sentence(src: string, order: Order): string[] {
  const out: string[] = [];
  for (const clause of src.split(';')) {
    const parts = clause.trim().split(/\s+/).filter(Boolean);
    const roles: Record<string, string[]> = { S: [], V: [], O: [], X: [] };
    let ask = false;
    for (const p of parts) {
      if (p === '?') {
        ask = true;
        continue;
      }
      const [role, word] = p.includes(':') ? p.split(':') : ['X', p];
      const toks: string[] = [];
      let w = word;
      if (w.startsWith('!')) {
        toks.push('NOT');
        w = w.slice(1);
      }
      const [c, tense] = w.split('+');
      toks.push(c);
      if (tense) toks.push(tense);
      roles[role].push(...toks);
    }
    for (const r of order.split('')) out.push(...roles[r]);
    out.push(...roles.X);
    if (ask) out.push('ASK');
    out.push(';');
  }
  out.pop();
  return out;
}

// --- Names --------------------------------------------------------------------------

const SYL = ['ve', 'ra', 'xe', 'tho', 'il', 'ka', 'sen', 'mu', 'ori', 'zan', 'el', 'qua', 'dri', 'sol', 'vy', 'ae', 'th', 'lu', 'ny', 'ess'];

function name(rng: Rng, n = 2): string {
  let s = '';
  for (let k = 0; k < n; k++) s += rng.pick(SYL);
  return s[0].toUpperCase() + s.slice(1);
}

// --- Content ------------------------------------------------------------------------

interface Item {
  day: number;
  kind: Evidence['kind'];
  title: string;
  desc: string;
  tags: string[];
  say?: string;
  from?: string;
  date?: number;
  vertical?: boolean;
  lie?: boolean;
  exposes?: string;
  key?: Truth;
  id?: string;
}

const FIRST: Record<Truth, { say: string; meaning: string; tags: string[] }> = {
  return: { say: 'S:WE V:REMEMBER+PAST O:YOU', meaning: 'We remember you.', tags: ['arrival', 'old', 'earth'] },
  flee: { say: 'S:WE V:FLEE+NOW O:DANGER', meaning: 'We are fleeing a danger.', tags: ['arrival', 'danger', 'departure'] },
  dying: { say: 'S:WORLD V:DEATH+NOW ; S:WE V:SEEK O:HOME', meaning: 'Our world is dying. We are looking for a home.', tags: ['arrival', 'ruin', 'question'] },
  warn: { say: 'S:DANGER V:COME+FUTURE O:YOU', meaning: 'A danger is coming to you.', tags: ['arrival', 'danger', 'earth'] },
  claim: { say: 'S:WE V:RETURN+FUTURE O:WORLD', meaning: 'We will take back this world.', tags: ['arrival', 'earth', 'war'] },
};

/** Evidence that points at each truth. */
const KEYS: Record<Truth, Omit<Item, 'key'>[]> = {
  return: [
    { day: 6, kind: 'transmission', title: 'Pilgrim song', desc: 'Sung over and over as the Pilgrim ship passed Mars.', tags: ['family', 'arrival', 'ritual'], say: 'S:KIN V:RETURN+NOW O:HOME', from: 'p1' },
    { day: 11, kind: 'artifact', title: 'Seed vault mural', desc: 'From an archive image: a vault of seeds beside a small blue world.', tags: ['nourish', 'earth', 'old'], say: 'S:ELDERS V:GIVE+PAST O:SEED', date: 5200 },
    { day: 17, kind: 'artifact', title: 'Departure star map', desc: 'A star map tracing a voyage that begins at a blue world.', tags: ['stars', 'earth', 'departure', 'old'], say: 'S:ELDERS V:GO+PAST O:WORLD', date: 4100, vertical: true },
    { day: 22, kind: 'transmission', title: 'Pilgrim elder', desc: 'Sent slowly, with long pauses, as if to a child.', tags: ['family', 'earth', 'arrival'], say: 'S:YOU V:KIN ; S:WE V:RETURN O:HOME', from: 'p0' },
  ],
  flee: [
    { day: 6, kind: 'transmission', title: 'Warden alert', desc: 'Broadcast on every frequency while the Warden ships turned to face outward, away from Earth.', tags: ['danger', 'ship', 'departure'], say: 'S:DANGER V:COME+FUTURE', from: 'w0' },
    { day: 11, kind: 'artifact', title: 'Burned colony record', desc: 'An image of a scorched world, its cities dark.', tags: ['ruin', 'war', 'danger'], say: 'S:DANGER V:HARM+PAST O:CITY', date: 210 },
    { day: 17, kind: 'artifact', title: 'Evacuation order', desc: 'A plaque from a ship, showing crowds boarding.', tags: ['departure', 'danger', 'family'], say: 'S:WE V:FLEE+PAST O:WORLD', date: 90, vertical: true },
    { day: 22, kind: 'transmission', title: 'Pilgrim plea', desc: 'Repeated as the Pilgrim ship hid behind the Moon.', tags: ['danger', 'family', 'question'], say: 'S:WE V:FLEE ; S:YOU V:GIVE O:HOME ?', from: 'p2' },
  ],
  dying: [
    { day: 6, kind: 'artifact', title: 'Dimming sun', desc: 'An archive image of their sun, smaller and redder in each panel.', tags: ['light', 'stars', 'danger'], say: 'S:ENERGY V:GO+NOW O:SKY', date: 40 },
    { day: 11, kind: 'transmission', title: 'Pilgrim plea', desc: 'Accompanied by images of empty fields.', tags: ['nourish', 'children', 'danger'], say: 'S:CHILD V:!GROW', from: 'p1' },
    { day: 17, kind: 'artifact', title: 'Frozen city', desc: 'A city under ice, its towers half buried.', tags: ['ruin', 'city', 'danger'], say: 'S:CITY V:DEATH+NOW', date: 12, vertical: true },
    { day: 22, kind: 'transmission', title: 'Archivist question', desc: 'Sent with pictures of Earth\'s oceans and forests.', tags: ['earth', 'question', 'nourish'], say: 'S:WE V:SEEK O:HOME ; S:YOU V:GIVE O:PLACE ?', from: 'a0' },
  ],
  warn: [
    { day: 6, kind: 'transmission', title: 'Archivist warning', desc: 'Sent the moment Earth\'s radio telescopes swept toward them.', tags: ['light', 'danger', 'question'], say: 'S:YOU V:!GIVE O:SIGNAL', from: 'a0' },
    { day: 11, kind: 'artifact', title: 'The Silence', desc: 'A monument: a great dish, broken, surrounded by graves.', tags: ['grave', 'light', 'ruin'], say: 'S:SIGNAL V:COME+PAST O:DANGER', date: 3100 },
    { day: 17, kind: 'artifact', title: 'Fallen ancestors', desc: 'A memorial wall listing countless names.', tags: ['grave', 'war', 'old'], say: 'S:DANGER V:HARM+PAST O:ELDERS', date: 3050, vertical: true },
    { day: 22, kind: 'transmission', title: 'Archivist plea', desc: 'Repeated urgently, with a diagram of Earth\'s radio emissions.', tags: ['danger', 'earth', 'light'], say: 'S:DANGER V:COME+FUTURE O:YOU ; S:YOU V:!GIVE O:SIGNAL', from: 'a1' },
  ],
  claim: [
    { day: 6, kind: 'transmission', title: 'Warden decree', desc: 'Formal and repeated, sent from the largest Warden ship.', tags: ['war', 'earth', 'kneel'], say: 'S:WORLD V:GIVE+FUTURE O:WE', from: 'w0' },
    { day: 11, kind: 'artifact', title: 'Colony charter', desc: 'An ancient plaque showing a blue world inside their star chart.', tags: ['earth', 'old', 'stars'], say: 'S:ELDERS V:COME+PAST O:WORLD', date: 5200 },
    { day: 17, kind: 'artifact', title: 'Kneeling colonists', desc: 'A relief of figures bowing before a ship.', tags: ['kneel', 'ritual', 'war'], say: 'S:BEING V:SUBMIT+PAST O:ELDERS', date: 4800, vertical: true },
    { day: 22, kind: 'transmission', title: 'Warden demand', desc: 'Sent while the Warden ships moved into high orbit.', tags: ['war', 'kneel', 'earth'], say: 'S:YOU V:SUBMIT+FUTURE ; S:WE V:RETURN O:WORLD', from: 'w1' },
  ],
};

/** Evidence every game shares (with seeded variation in dates). */
const COMMON: Item[] = [
  { day: 1, kind: 'observation', title: 'Something is slowing down', desc: 'Telescopes track three objects decelerating past Neptune. One is enormous.', tags: [] },
  { day: 2, kind: 'signal', title: 'Counting signal', desc: 'Pulses of light, each followed by a mark. It repeats for hours.', tags: [] },
  { day: 2, kind: 'transmission', title: 'Archivist greeting', desc: 'Sent as the smallest ship turned its lights toward Earth.', tags: ['arrival', 'greeting', 'ship'], say: 'S:WE V:COME+NOW', from: 'a0' },
  { day: 3, kind: 'transmission', title: 'Beacon pulses', desc: 'The Archivist ship flashed its hull lights in time with this message.', tags: ['light', 'greeting', 'trade'], say: 'S:WE V:GIVE O:SIGNAL', from: 'a1' },
  { day: 3, kind: 'observation', title: 'Three factions', desc: 'The ships keep apart. Each signs its messages with a different mark: a scholarly small ship, armed escorts, and a vast slow ark.', tags: [] },
  { day: 4, kind: 'transmission', title: 'Warden message', desc: 'Short and flat, sent from an escort ship.', tags: ['greeting', 'ship'], say: 'S:WE O:!WEAPON', from: 'w2', lie: true, id: 'lie' },
  { day: 5, kind: 'transmission', title: 'Archivist question', desc: 'Followed by a long silence, as if waiting for an answer.', tags: ['question', 'earth'], say: 'S:YOU V:KNOW O:WE ?', from: 'a0' },
  { day: 5, kind: 'artifact', title: 'Child\'s drawing', desc: 'Part of a picture archive they beamed to us: small figures around a pool of water.', tags: ['children', 'family', 'nourish'], say: 'S:CHILD V:GROW', date: 3 },
  { day: 7, kind: 'transmission', title: 'Warden offer', desc: 'Sent with an image of their ships beside ours. Hard to read.', tags: ['greeting', 'trade'], say: 'S:YOU V:SUBMIT ; S:WE V:GIVE O:PEACE', from: 'w1', id: 'trap' },
  { day: 8, kind: 'artifact', title: 'Lunar probe', desc: 'Astronauts find an ancient probe buried in lunar dust. It is engraved, and dated.', tags: ['old', 'earth', 'light'], say: 'S:WE V:SEEK+PAST O:WORLD', id: 'probe' },
  { day: 9, kind: 'artifact', title: 'Grave marker', desc: 'From the picture archive: a stone with a figure lying beneath it.', tags: ['grave', 'old', 'ritual'], say: 'S:WE V:REMEMBER O:ELDERS', date: 600 },
  { day: 10, kind: 'transmission', title: 'Child\'s voice', desc: 'A high, fast message from the Pilgrim ship, quickly cut off.', tags: ['children', 'family', 'question'], say: 'S:YOU V:CHILD ?', from: 'p3' },
  { day: 12, kind: 'artifact', title: 'Ruined city', desc: 'An archive image: fallen towers, overgrown.', tags: ['ruin', 'city', 'old'], say: 'S:WE V:FORGET+PAST O:CITY', date: 2400, vertical: true },
  { day: 13, kind: 'observation', title: 'Warden hull markings', desc: 'Close-range telescope images of an escort ship: weapon ports, and one mark painted beside each.', tags: ['war', 'ship', 'danger'], say: 'WEAPON', exposes: 'lie' },
  { day: 14, kind: 'artifact', title: 'Machine plate', desc: 'A plate from a device that glows when powered.', tags: ['machine', 'light'], say: 'S:MACHINE V:GIVE O:ENERGY', date: 150 },
  { day: 15, kind: 'artifact', title: 'War memorial', desc: 'A monument of broken ships and graves.', tags: ['war', 'grave', 'ruin'], say: 'S:WEAPON V:GIVE+PAST O:DEATH', date: 1800 },
  { day: 16, kind: 'artifact', title: 'Kneeling figures', desc: 'A carved relief: one people bowing low before another.', tags: ['kneel', 'ritual', 'war'], say: 'S:BEING V:SUBMIT+PAST', date: 1750 },
  { day: 18, kind: 'transmission', title: 'Archivist lesson', desc: 'Sent with pictures of their sky and a single star.', tags: ['stars', 'light', 'archive'], say: 'S:WE V:KNOW O:SKY', from: 'a2' },
  { day: 19, kind: 'artifact', title: 'First city founding', desc: 'A very old tablet, weathered smooth.', tags: ['city', 'old', 'archive'], say: 'S:ELDERS V:GROW+PAST O:CITY', date: 6400 },
  { day: 20, kind: 'transmission', title: 'Pilgrim blessing', desc: 'Sung while their ship circled the Moon.', tags: ['family', 'ritual', 'greeting'], say: 'S:LIFE V:GIVE O:PEACE', from: 'p0' },
  { day: 23, kind: 'transmission', title: 'Warden warning', desc: 'Sent after an Earth fighter jet flew near a landing craft.', tags: ['war', 'danger'], say: 'S:YOU V:!HARM O:WE', from: 'w0' },
  { day: 25, kind: 'transmission', title: 'Archivist farewell?', desc: 'Repeated at dawn and dusk, gently.', tags: ['departure', 'question', 'light'], say: 'S:WE V:GO+FUTURE ?', from: 'a0' },
];

export const DAYS = 30;

export function generateWorld(seed: string): World {
  const rng = new Rng(hashString(`fc|${seed.trim().toLowerCase()}`));
  const glyphs = makeGlyphs(rng.fork('glyphs'));
  const base = rng.pick([6, 8, 12]);
  const order = rng.pick<Order>(['SVO', 'SOV', 'VSO', 'OSV']);
  const truth = rng.pick<Truth>(['return', 'flee', 'dying', 'warn', 'claim']);
  const species = name(rng);
  const homeworld = name(rng, 3);
  const roles: [FactionId, string][] = [
    ['archivists', 'Speaker'], ['archivists', 'Historian'], ['archivists', 'Engineer'],
    ['wardens', 'Commander'], ['wardens', 'Pilot'], ['wardens', 'Envoy'],
    ['pilgrims', 'Elder'], ['pilgrims', 'Navigator'], ['pilgrims', 'Singer'], ['pilgrims', 'Child'],
  ];
  const prefix: Record<FactionId, string> = { archivists: 'a', wardens: 'w', pilgrims: 'p' };
  const counts: Record<string, number> = {};
  const characters: Character[] = roles.map(([f, role]) => {
    const k = counts[f] ?? 0;
    counts[f] = k + 1;
    return { id: `${prefix[f]}${k}`, name: name(rng, rng.chance(0.5) ? 2 : 3), faction: f, role };
  });
  const jitter = (d: number) => Math.max(1, Math.round(d * rng.float(0.85, 1.15)));
  const probeAge = truth === 'return' || truth === 'claim' ? jitter(5000) : truth === 'warn' ? jitter(3300) : jitter(1200);
  const items: Item[] = [
    { day: 1, kind: 'transmission', title: 'The first transmission', desc: 'Received as the objects crossed the orbit of Neptune. It repeats every nine minutes.', tags: FIRST[truth].tags, say: FIRST[truth].say, id: 'first', key: truth },
    ...COMMON.map((c) => ({ ...c, date: c.date ? jitter(c.date) : c.id === 'probe' ? probeAge : undefined })),
    ...KEYS[truth].map((k) => ({ ...k, key: truth, date: k.date ? jitter(k.date) : undefined })),
  ];
  // One red herring from another explanation keeps the mystery honest.
  const other = rng.pick(EXPLANATIONS.filter((e) => e.id !== truth && !EXPLANATIONS.find((x) => x.id === truth)!.near.includes(e.id)));
  const herring = KEYS[other.id][2];
  items.push({ ...herring, day: 24, key: other.id, title: `${herring.title} (fragment)`, desc: `${herring.desc} The image is damaged and very old.`, date: herring.date ? jitter(herring.date * 3) : undefined });

  const evidence: Evidence[] = items.map((it, k) => ({
    id: it.id ?? `e${k}`,
    day: it.day,
    kind: it.kind,
    title: it.title,
    desc: it.desc,
    tags: it.tags,
    tokens: it.say ? sentence(it.say, order) : [],
    from: it.from,
    date: it.date,
    vertical: it.vertical,
    lie: it.lie,
    exposes: it.exposes,
    key: it.key,
  }));
  evidence.sort((a, b) => a.day - b.day);
  const first = evidence.find((e) => e.id === 'first')!;
  return { seed, species, homeworld, base, order, glyphs, truth, characters, evidence, first: { tokens: first.tokens, meaning: FIRST[truth].meaning }, probeAge };
}

export function randomSeed(): string {
  const a = ['quiet', 'distant', 'pale', 'silver', 'hollow', 'violet', 'patient', 'cold', 'bright', 'last'];
  const b = ['signal', 'harbor', 'choir', 'orbit', 'lantern', 'echo', 'tide', 'garden', 'vigil', 'witness'];
  return `${a[Math.floor(Math.random() * a.length)]}-${b[Math.floor(Math.random() * b.length)]}-${Math.floor(Math.random() * 900 + 100)}`;
}
