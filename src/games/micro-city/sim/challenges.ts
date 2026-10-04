import type { City } from './city';
import type { MapKind } from './state';

export interface Challenge {
  id: string;
  name: string;
  brief: string;
  goal: string;
  map?: MapKind;
  money?: number;
  /** Progress 0..1 and a short status line. */
  progress(c: City): { value: number; text: string };
  /** Returns a reason if the challenge is lost. */
  failed?(c: City): string | null;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const n = (v: number) => Math.round(v).toLocaleString('en-US');

export const CHALLENGES: Challenge[] = [
  {
    id: 'floodplain',
    name: 'Floodplain',
    brief: 'A fertile river valley with a bad habit of flooding.',
    goal: 'Reach 25,000 people with fewer than 40 buildings ever damaged by floods.',
    map: 'river',
    progress: (c) => ({ value: Math.min(1, c.s.last.pop / 25000), text: `${n(c.s.last.pop)} / 25,000 people · ${c.s.streaks.floodDamage ?? 0} / 40 flood-damaged` }),
    failed: (c) => ((c.s.streaks.floodDamage ?? 0) >= 40 ? 'Floods have damaged 40 buildings.' : null),
  },
  {
    id: 'traffic',
    name: 'Traffic Hell',
    brief: 'Everyone drives. Everyone is late.',
    goal: 'Reach 50,000 people with an average commute under 25 minutes.',
    progress: (c) => {
      const ok = c.s.last.commute < 25;
      return { value: Math.min(1, c.s.last.pop / 50000) * (ok ? 1 : 0.9), text: `${n(c.s.last.pop)} / 50,000 people · commute ${Math.round(c.s.last.commute)} min ${ok ? '✓' : '(needs < 25)'}` };
    },
  },
  {
    id: 'nocars',
    name: 'No Cars',
    brief: 'Build a city that moves by bus and metro.',
    goal: 'Reach 25,000 people with at least half of all commutes on public transit.',
    progress: (c) => {
      const ok = c.s.last.transitShare >= 0.5;
      return { value: Math.min(1, c.s.last.pop / 25000) * (ok ? 1 : 0.9), text: `${n(c.s.last.pop)} / 25,000 people · transit ${pct(c.s.last.transitShare)} ${ok ? '✓' : '(needs 50%)'}` };
    },
  },
  {
    id: 'green',
    name: 'Green City',
    brief: 'Grow without the smog.',
    goal: 'Reach 25,000 people with average air pollution below 10%.',
    progress: (c) => {
      const ok = c.s.last.air < 10;
      return { value: Math.min(1, c.s.last.pop / 25000) * (ok ? 1 : 0.9), text: `${n(c.s.last.pop)} / 25,000 people · air ${Math.round(c.s.last.air)}% ${ok ? '✓' : '(needs < 10%)'}` };
    },
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    brief: 'Run the city like a business.',
    goal: 'Build a treasury of 5 million before Year 25.',
    progress: (c) => ({ value: Math.max(0, Math.min(1, c.s.money / 5_000_000)), text: `${c.currency(c.s.money)} / ${c.currency(5_000_000)} · Year ${c.year} of 25` }),
    failed: (c) => (c.year >= 25 && c.s.money < 5_000_000 ? 'Year 25 arrived before the treasury reached 5 million.' : null),
  },
  {
    id: 'island',
    name: 'Island',
    brief: 'A small island and a big sea.',
    goal: 'Reach 25,000 people on the island.',
    map: 'island',
    progress: (c) => ({ value: Math.min(1, c.s.last.pop / 25000), text: `${n(c.s.last.pop)} / 25,000 people` }),
  },
  {
    id: 'mountain',
    name: 'Mountain City',
    brief: 'A narrow valley between steep ridges.',
    goal: 'Reach 25,000 people in the valley.',
    map: 'valley',
    progress: (c) => ({ value: Math.min(1, c.s.last.pop / 25000), text: `${n(c.s.last.pop)} / 25,000 people` }),
  },
];

export const CHALLENGE: Record<string, Challenge> = Object.fromEntries(CHALLENGES.map((ch) => [ch.id, ch]));

/** Checks the active challenge once a month: 1 won, -2 lost, else unchanged. */
export function checkChallenge(c: City): void {
  const id = c.s.settings.challenge;
  if (!id || c.s.challengeDone !== -1) return;
  const ch = CHALLENGE[id];
  if (!ch) return;
  const why = ch.failed?.(c);
  if (why) {
    c.s.challengeDone = -2;
    c.news('milestone', `Challenge failed: ${why} You can keep building in sandbox mode.`);
    c.history('challenge', 3, `The ${ch.name} challenge is lost: ${why}`);
    c.emit({ type: 'milestone', index: -2 });
    return;
  }
  if (ch.progress(c).value >= 1) {
    c.s.challengeDone = c.s.tick;
    c.news('milestone', `Challenge complete: ${ch.name}! ${ch.goal}`);
    c.history('challenge', 3, `The ${ch.name} challenge is won.`);
    c.emit({ type: 'milestone', index: -1 });
  }
}
