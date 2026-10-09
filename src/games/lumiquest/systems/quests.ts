// Quests as data plus a small engine. Each stage reads the real game state
// (never a separate checklist), so objectives cannot drift from what has
// actually happened, and a save restores progress exactly.

import { ITEM_BY_ID } from '../data/items';
import { SPECIES_BY_ID, type SpeciesId } from '../data/species';
import { INTERACTABLES, LOCATION_BY_ID, NPCS, PRISMS, SPAWNS, STAR_COUNT, type V2 } from '../data/world';
import type { GameState } from './state';

export type GameEvent =
  | { type: 'talk'; npc: string }
  | { type: 'examine'; id: string }
  | { type: 'observe'; species: SpeciesId; spawn: string }
  | { type: 'pickup'; item: string; id: string }
  | { type: 'bond'; species: SpeciesId; spawn: string }
  | { type: 'chest'; id: string }
  | { type: 'discover'; id: string }
  | { type: 'flag'; name: string }
  | { type: 'tick' };

export interface StageDef {
  text: (s: GameState) => string;
  /** Where the marker points (map, compass), if anywhere. */
  target?: (s: GameState) => V2 | null;
  done: (s: GameState) => boolean;
}

export interface QuestDef {
  id: string;
  title: string;
  giver: string;
  main?: boolean;
  summary: string;
  stages: StageDef[];
  reward: { lumens: number; items: Record<string, number>; note: string };
}

const at = (id: string): V2 => INTERACTABLES.find((i) => i.id === id)!.at;
const npcAt = (id: string): V2 => NPCS.find((n) => n.id === id)!.at;
const crystalsHeld = (s: GameState) => (s.inventory.crystal ?? 0) + (s.flags.crystalsPlaced ?? 0);
const observedOf = (s: GameState, species: SpeciesId) => SPAWNS.filter((x) => x.species === species && s.wild[x.id]?.observed).length;
export const starsFound = (s: GameState): number => INTERACTABLES.filter((i) => i.kind === 'star' && s.done[i.id] !== undefined).length;

export const QUESTS: QuestDef[] = [
  {
    id: 'beacon',
    title: 'The Lost Beacon',
    giver: 'Elen',
    main: true,
    summary: 'The ancient beacon on the hill has gone dark. Find out what happened and restore its light with your companion.',
    stages: [
      { text: () => 'Speak with Ranger Elen at Brightwater Outpost', target: () => npcAt('elen'), done: (s) => !!s.flags.elenBriefed },
      {
        text: (s) => `Follow the glowing tracks west (${['track-1', 'track-2', 'track-3'].filter((t) => s.done[t] !== undefined).length}/3)`,
        target: (s) => {
          const next = ['track-1', 'track-2', 'track-3'].find((t) => s.done[t] === undefined);
          return next ? at(next) : null;
        },
        done: (s) => ['track-1', 'track-2', 'track-3'].every((t) => s.done[t] !== undefined),
      },
      {
        text: () => 'Something bright hides in Mossy Clearing. Observe it (F)',
        target: () => LOCATION_BY_ID.clearing.at,
        done: (s) => !!s.wild['w-lume-quest']?.observed || (s.species.lumelle?.observed ?? 0) > 0,
      },
      {
        text: (s) => `Collect luminous crystals (${Math.min(3, crystalsHeld(s))}/3)`,
        target: (s) => {
          const left = ['crystal-clearing', 'crystal-cave', 'crystal-river', 'crystal-shrine', 'crystal-cove'].find((c) => s.done[c] === undefined);
          return left ? at(left) : null;
        },
        done: (s) => crystalsHeld(s) >= 3,
      },
      { text: () => 'Return the crystals to the beacon on Beacon Hill', target: () => at('socket'), done: (s) => (s.flags.crystalsPlaced ?? 0) >= 3 },
      { text: () => 'Use your companion’s ability on the resonance altar', target: () => at('altar'), done: (s) => !!s.flags.altarLit },
      {
        text: (s) => `Turn the light prisms to guide the beam (${PRISMS.filter((p, i) => s.prisms[i] === p.solved).length}/3)`,
        target: (s) => {
          const i = PRISMS.findIndex((p, k) => s.prisms[k] !== p.solved);
          return i >= 0 ? PRISMS[i].at : at('socket');
        },
        done: (s) => !!s.flags.beaconLit,
      },
      { text: () => 'Tell Elen the beacon is lit', target: () => npcAt('elen'), done: (s) => !!s.flags.beaconReported },
    ],
    reward: { lumens: 60, items: { badge: 1, sunberry: 3, glowcap: 2 }, note: 'Lumen Ranger Badge, 60 Lumens and a bundle of snacks' },
  },
  {
    id: 'friend',
    title: 'A Friend in the Forest',
    giver: 'Nia',
    summary: 'Nia wants to see Resonance Bonding with her own eyes. Befriend a wild creature.',
    stages: [{ text: () => 'Bond with a wild creature using your Resonance Device', done: (s) => s.bonded.length >= 2 }],
    reward: { lumens: 15, items: { honeyblossom: 2, cloudpuff: 1 }, note: '15 Lumens, 2 Honeyblossom, a Cloudpuff' },
  },
  {
    id: 'river',
    title: 'Creatures of the River',
    giver: 'Nia',
    summary: 'Nia is studying the Aquoray of Brightwater River. Observe two of them.',
    stages: [{ text: (s) => `Observe two Aquoray in the river (${Math.min(2, observedOf(s, 'aquoray'))}/2)`, target: () => [52, -46], done: (s) => observedOf(s, 'aquoray') >= 2 }],
    reward: { lumens: 10, items: { kelp: 3 }, note: '10 Lumens and 3 River Kelp' },
  },
  {
    id: 'cave',
    title: 'The Hidden Cave',
    giver: 'Old Bram',
    summary: 'Bram remembers glyphs deep in Glimmer Cave that only show in a creature’s light.',
    stages: [{ text: () => 'Reveal the glyphs deep in Glimmer Cave (bring a light companion)', target: () => at('glyph-cave'), done: (s) => s.done['glyph-cave'] !== undefined }],
    reward: { lumens: 20, items: { glowcap: 2 }, note: '20 Lumens and 2 Glowcaps' },
  },
  {
    id: 'sky',
    title: 'The Sky Isle',
    giver: 'Old Bram',
    summary: 'A chest sits on a stone pillar beyond the ruins. Only a glider could reach it.',
    stages: [{ text: () => 'Open the chest on the Sky Pillar (glide with an air companion)', target: () => at('chest-sky'), done: (s) => s.done['chest-sky'] !== undefined }],
    reward: { lumens: 15, items: { cloudpuff: 2 }, note: '15 Lumens and 2 Cloudpuffs' },
  },
  {
    id: 'rare',
    title: 'Rare Encounter',
    giver: 'Old Bram',
    summary: 'Something silver visits Moonwell Glade on clear nights.',
    stages: [{ text: () => 'Observe the visitor of Moonwell Glade (night only)', target: () => LOCATION_BY_ID.moonwell.at, done: (s) => !!s.wild['w-lume-moon']?.observed }],
    reward: { lumens: 25, items: { glowcap: 2 }, note: '25 Lumens and 2 Glowcaps' },
  },
  {
    id: 'stars',
    title: 'Fallen Stars',
    giver: 'Old Bram',
    summary: 'Bram collects star fragments. They glint in odd corners of the vale.',
    stages: [{ text: (s) => `Find star fragments (${starsFound(s)}/${STAR_COUNT})`, done: (s) => starsFound(s) >= STAR_COUNT }],
    reward: { lumens: 50, items: { amber: 2 }, note: '50 Lumens and 2 Amber Drops' },
  },
];

export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q])) as Record<string, QuestDef>;

export interface QuestHooks {
  onStage: (q: QuestDef, stage: number) => void;
  onComplete: (q: QuestDef) => void;
  onStart: (q: QuestDef) => void;
}

export class Quests {
  constructor(private state: GameState, private hooks: QuestHooks) {}

  start(id: string): boolean {
    const q = QUEST_BY_ID[id];
    if (!q) return false;
    const cur = this.state.quests[id];
    if (cur && cur.status !== 'locked') return false;
    this.state.quests[id] = { status: 'active', stage: 0 };
    this.hooks.onStart(q);
    if (!QUEST_BY_ID[this.state.tracked] || this.state.quests[this.state.tracked]?.status !== 'active') this.state.tracked = id;
    this.check();
    return true;
  }

  status(id: string): 'locked' | 'active' | 'done' {
    return this.state.quests[id]?.status ?? 'locked';
  }

  stage(id: string): number {
    return this.state.quests[id]?.stage ?? 0;
  }

  /** Re-evaluates every active quest; stages advance as far as state allows. */
  check(): void {
    for (const q of QUESTS) {
      const st = this.state.quests[q.id];
      if (!st || st.status !== 'active') continue;
      let guard = 0;
      while (st.stage < q.stages.length && q.stages[st.stage].done(this.state) && guard++ < 20) {
        st.stage++;
        if (st.stage < q.stages.length) this.hooks.onStage(q, st.stage);
      }
      if (st.stage >= q.stages.length) {
        st.status = 'done';
        this.state.lumens += q.reward.lumens;
        for (const [k, n] of Object.entries(q.reward.items)) if (ITEM_BY_ID[k]) this.state.inventory[k] = (this.state.inventory[k] ?? 0) + n;
        this.hooks.onComplete(q);
        if (this.state.tracked === q.id) {
          const next = QUESTS.find((x) => this.state.quests[x.id]?.status === 'active');
          this.state.tracked = next?.id ?? q.id;
        }
      }
    }
  }

  objective(id: string): string {
    const q = QUEST_BY_ID[id];
    const st = this.state.quests[id];
    if (!q || !st) return '';
    if (st.status === 'done') return 'Completed';
    return q.stages[Math.min(st.stage, q.stages.length - 1)].text(this.state);
  }

  target(id: string): V2 | null {
    const q = QUEST_BY_ID[id];
    const st = this.state.quests[id];
    if (!q || !st || st.status !== 'active') return null;
    return q.stages[st.stage]?.target?.(this.state) ?? null;
  }

  speciesName(id: SpeciesId): string {
    return SPECIES_BY_ID[id].name;
  }
}
