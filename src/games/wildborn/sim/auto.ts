// The automatic mode: an AI trainer that walks the overworld, observes,
// befriends or battles, captures new species, trains, feeds toward a chosen
// evolution branch and breeds. One visible action per tick.

import { ABILITIES, BIOMES, ITEMS, SPECIES_BY_ID, type BiomeId, type Exposure } from '../data/species';
import {
  Game,
  evaluateEvolution,
  guideOf,
  statsOf,
  type Creature,
  type GameState,
} from './game';
import { findPath, randomGrassIn, type WorldMap } from './world';
import { affinityMult, createBattle, playerAct, weatherMult, wildChoose, type Battle, type BattleAction } from './battle';

const ZONES: BiomeId[] = ['greenwood', 'meadow', 'wetlands', 'caves', 'ember', 'ruins'];

/** The walking plan for one universe, kept outside the save state. */
interface Plan {
  path: { x: number; y: number }[];
  goal: { x: number; y: number };
  /** Where the trainer is headed. */
  target: string | null;
}
const PLANS = new WeakMap<Game, Plan>();

export function autoStep(game: Game, battle: Battle | null): { text: string; startBattle?: boolean } {
  if (battle) return { text: battleStep(game, battle) };
  if (game.state.wild) return wildStep(game);
  return walkStep(game);
}

// --- the walk ---------------------------------------------------------------------------------

/** Walk toward a goal, up to `maxSteps` tiles. Stops on an encounter. */
function walkToward(game: Game, goal: { x: number; y: number }, maxSteps: number): { moved: number } {
  const s = game.state;
  const map = game.world;
  let plan = PLANS.get(game);
  if (!plan || plan.goal.x !== goal.x || plan.goal.y !== goal.y) {
    plan = { path: findPath(map, { x: s.x, y: s.y }, goal) ?? [], goal, target: plan?.target ?? null };
    PLANS.set(game, plan);
  }
  let moved = 0;
  for (let k = 0; k < maxSteps && plan.path.length; k++) {
    const next = plan.path[0];
    const res = game.move(Math.sign(next.x - s.x), Math.sign(next.y - s.y));
    if (!res.ok) {
      plan.path = [];
      break;
    }
    if (res.event === 'encounter') {
      plan.path = [];
      break;
    }
    plan.path.shift();
    moved++;
  }
  return { moved };
}

function planOf(game: Game): Plan {
  let plan = PLANS.get(game);
  if (!plan) {
    plan = { path: [], goal: { x: game.state.x, y: game.state.y }, target: null };
    PLANS.set(game, plan);
  }
  return plan;
}

/** An encounter tile in this zone, near where we stand, so the trainer wanders. */
function nearbyGrass(map: WorldMap, zone: string, from: { x: number; y: number }, rng: Game['rng']): { x: number; y: number } | null {
  for (let tries = 0; tries < 40; tries++) {
    const x = from.x + rng.range(-24, 24);
    const y = from.y + rng.range(-24, 24);
    if (x < 1 || y < 1 || x >= map.w - 1 || y >= map.h - 1) continue;
    const i = y * map.w + x;
    if ((map.zones[i] as string) !== zone) continue;
    const t = map.tiles[i];
    if (t === 1 /* tall grass */ || t === 8 /* ash */ || t === 11 /* cave floor */ || t === 12 /* ruin floor */ || t === 16 /* reeds */) {
      return { x, y };
    }
  }
  return null;
}

/** Where the trainer wants to go next: somewhere with species it has not met. */
function pickTargetZone(game: Game): BiomeId {
  const s = game.state;
  const unseen = ZONES.filter((z) => Object.keys(BIOMES[z].wild).some((sid) => guideOf(s, sid) === 'unknown'));
  const pool = unseen.length ? unseen : ZONES;
  s.counts.autoTravel = (s.counts.autoTravel ?? 0) + 1;
  return pool[(s.counts.autoTravel ?? 1) % pool.length];
}

function walkStep(game: Game): { text: string } {
  const plan = planOf(game);
  const zone = game.zoneNow();
  if (zone === 'village') {
    const care = villageCare(game);
    if (care) {
      plan.path = [];
      return { text: care };
    }
    const target = pickTargetZone(game);
    plan.target = target;
    const c = game.world.centers[target];
    const goal = { x: c.x + game.rng.range(-10, 10), y: c.y + game.rng.range(-10, 10) };
    const { moved } = walkToward(game, goal, 6);
    if (moved === 0) game.travel(target); // walled off: take the long road
    return { text: moved ? `Walking toward ${BIOMES[target].name}.` : `Taking the long road to ${BIOMES[target].name}.` };
  }
  // Heading somewhere?
  if (!plan.target || !ZONES.includes(plan.target as BiomeId)) {
    plan.target = pickTargetZone(game);
    plan.path = [];
  }
  const want = plan.target as BiomeId;
  if (zone !== want) {
    const c = game.world.centers[want];
    const { moved } = walkToward(game, { x: c.x, y: c.y }, 6);
    if (moved === 0) game.travel(want);
    return { text: `On the road to ${BIOMES[want].name}.` };
  }
  // In the target zone: prowl the grass, and search when there is none to reach.
  const grass = nearbyGrass(game.world, zone, { x: game.state.x, y: game.state.y }, game.rng);
  if (grass) {
    const { moved } = walkToward(game, grass, 6);
    if (moved) return { text: `Prowling the ${BIOMES[want].name} grass.` };
  }
  plan.path = [];
  return { text: game.explore().text };
}

// --- village -------------------------------------------------------------------------------------

/** One useful thing to do at the village, or null when there is nothing left. */
function villageCare(game: Game): string | null {
  const s = game.state;
  s.counts.autoVillage = (s.counts.autoVillage ?? 0) + 1;
  if (s.counts.autoVillage > 4) {
    s.counts.autoVillage = 0;
    return null; // enough tending: back out into the world
  }
  const all = [...s.team, ...s.reserve];
  const hurt = all.find((c) => c.hp < statsOf(c).maxHp * 0.5);
  if (hurt && hurt.hp > 0) return game.rest(hurt.id);
  if (s.eggs.length === 0) {
    for (const a of all) {
      const partner = all.find(
        (b) => b.id !== a.id && SPECIES_BY_ID[a.speciesId].family === SPECIES_BY_ID[b.speciesId].family && game.canBreed(a.id, b.id).ok,
      );
      if (partner) return game.breed(a.id, partner.id);
    }
  }
  const learner = all.find((c) => c.level >= 6 && SPECIES_BY_ID[c.speciesId].branches);
  if (learner) {
    const result = evaluateEvolution(learner);
    const target = [...result.scores].sort((a, b) => b.score - a.score)[0];
    const item = missingExposureItem(learner, target ? SPECIES_BY_ID[target.to] : undefined);
    if (item && (s.items[item] ?? 0) > 0) return game.feed(learner.id, item);
  }
  const playmate = all.filter((c) => c.bond < 55).sort((a, b) => a.bond - b.bond)[0];
  if (playmate && game.rng.chance(0.5)) return game.play(playmate.id);
  const trainee = [...s.team].sort((a, b) => a.level - b.level)[0];
  if (trainee) return game.train(trainee.id);
  return null;
}

function missingExposureItem(c: Creature, target?: { id: string }): string | null {
  const wanted: Exposure[] = [];
  const branches = SPECIES_BY_ID[c.speciesId].branches ?? [];
  const branch = target ? branches.find((b) => b.to === target.id) : branches[0];
  for (const key of Object.keys(branch?.drivers ?? {})) {
    if (!(key in c.personality)) wanted.push(key as Exposure);
  }
  const map: Partial<Record<Exposure, string>> = {
    thermal: 'pepper',
    aquatic: 'reed',
    mineral: 'crystal',
    organic: 'berry',
    night: 'moonfruit',
  };
  for (const e of wanted) {
    const item = map[e];
    if (item) return item;
  }
  return 'berry';
}

// --- battles ----------------------------------------------------------------------------------

/** How well a creature's abilities match up against a defender, best case. */
function matchupEdge(a: Creature, d: Creature, weather: GameState['weather']): number {
  let best = 1;
  for (const id of a.abilities) {
    const ab = ABILITIES[id];
    if (!ab || ab.power <= 0) continue;
    best = Math.max(best, affinityMult(ab.affinity, d) * weatherMult(ab.affinity, weather));
  }
  return best;
}

function battleStep(game: Game, battle: Battle): string {
  const me = battle.player;
  const foe = battle.foe;
  const hpFrac = me.hp / me.stats.maxHp;
  const state = game.state;
  // Live to fight another day: a hopeless battle is one to leave.
  if (battle.turn > 3 && hpFrac < 0.22 && foe.hp / foe.stats.maxHp > 0.55) {
    playerAct(game, battle, { type: 'flee' });
    return `${me.name} withdraws from a battle it cannot win.`;
  }
  // Heal early rather than late.
  if (hpFrac < 0.45) {
    const item =
      (state.items.salve ?? 0) > 0 && hpFrac < 0.28
        ? 'salve'
        : (state.items.berry ?? 0) > 0
          ? 'berry'
          : (state.items.salve ?? 0) > 0
            ? 'salve'
            : null;
    if (item) {
      playerAct(game, battle, { type: 'item', itemId: item });
      return `${me.name} uses a ${ITEMS[item].name.toLowerCase()} mid-battle.`;
    }
  }
  // A bad match-up is worth switching out of.
  const edge = matchupEdge(me.creature, foe.creature, state.weather);
  if (hpFrac < 0.6 && edge < 1.05) {
    const swap = state.team.find(
      (c) => c.id !== me.creature.id && c.hp > statsOf(c).maxHp * 0.6 && matchupEdge(c, foe.creature, state.weather) >= 1.3,
    );
    if (swap) {
      playerAct(game, battle, { type: 'switch', creatureId: swap.id });
      return `Switching out: ${swap.name} has the better match-up.`;
    }
  }
  // Heal when hurt; otherwise the ability with the best expected damage.
  let bestIdx = -1;
  let bestScore = -Infinity;
  me.creature.abilities.forEach((id, i) => {
    const ab = ABILITIES[id];
    if (!ab) return;
    if (ab.effect === 'heal' && hpFrac < 0.5) {
      if (1e6 > bestScore) {
        bestScore = 1e6;
        bestIdx = i;
      }
      return;
    }
    const boost = battle.biome in BIOMES && ab.affinity === BIOMES[battle.biome as keyof typeof BIOMES].boost ? 1.25 : 1;
    const dmg = ab.power * affinityMult(ab.affinity, foe.creature) * weatherMult(ab.affinity, battle.weather) * boost;
    // A fresh status move is worth about one hit's damage.
    const status = ab.power === 0 && ab.effect && foe.effects.confuse === 0 && foe.effects.weaken === 0 ? 38 : 0;
    const score = dmg + status;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  playerAct(game, battle, { type: 'ability', index: bestIdx });
  return `${me.name} ${bestIdx < 0 ? 'strikes' : `uses ${ABILITIES[me.creature.abilities[bestIdx]].name}`}.`;
}

// --- wild encounters -----------------------------------------------------------------------------

function wildStep(game: Game): { text: string; startBattle?: boolean } {
  const s = game.state;
  const w = s.wild!;
  const sp = SPECIES_BY_ID[w.speciesId];
  s.counts.autoTries = (s.counts.autoTries ?? 0) + 1;
  const tries = s.counts.autoTries;
  const known = guideOf(s, w.speciesId) === 'observed' || guideOf(s, w.speciesId) === 'captured';

  if (!known && tries === 1) {
    return { text: game.observeWild() };
  }
  const fighter = s.team.filter((c) => c.hp > statsOf(c).maxHp * 0.5).sort((a, b) => b.level - a.level)[0];
  // Proud creatures are battled once to earn their respect — but only with a
  // real fighter in a fair match-up (a Support at parity will just lose).
  const fair =
    !!fighter &&
    fighter.level >= w.level &&
    (['Striker', 'Tank'].includes(SPECIES_BY_ID[fighter.speciesId].role) || fighter.level >= w.level + 2) &&
    statsOf(fighter).power * matchupEdge(fighter, w, s.weather) >= statsOf(w).power * 0.9;
  if (sp.likes === 'battle' && fair && !(s.counts.autoFought ?? 0)) {
    s.counts.autoFought = 1;
    return { text: `${sp.name} respects a fight — one is starting.`, startBattle: true };
  }
  const chance = game.linkChance(w);
  if (w.trust < 30 && tries <= 3) {
    const food = (['berry', 'moonfruit', 'seed'] as const).find((f) => (s.items[f] ?? 0) > 0);
    if (food && sp.likes === 'food') return { text: game.offerFood(food) };
    return { text: game.playWithWild() };
  }
  if (chance >= 0.42 || tries >= 4) {
    const result = game.attemptLink();
    if (result.ok) s.counts.autoTries = 0;
    s.counts.autoFought = 0;
    return { text: result.text };
  }
  game.leaveWild();
  s.counts.autoTries = 0;
  return { text: `Leaving the ${sp.name} be for now.` };
}

/** Whether the auto trainer wants to start a battle with the current wild creature. */
export function autoWantsBattle(game: Game): boolean {
  const s = game.state;
  const w = s.wild;
  if (!w || s.team.length === 0) return false;
  return SPECIES_BY_ID[w.speciesId].likes === 'battle' && (s.counts.autoTries ?? 0) >= 2;
}

/** Start the battle the auto trainer decided on, with its best match-up. */
export function autoStartBattle(game: Game): Battle | null {
  const s = game.state;
  const w = s.wild;
  if (!w) return null;
  const lead = s.team
    .filter((c) => c.hp > statsOf(c).maxHp * 0.35)
    .sort(
      (a, b) =>
        (b.level >= w.level - 1 ? 1 : 0) * 10 +
        matchupEdge(b, w, s.weather) +
        b.hp / statsOf(b).maxHp +
        b.level / 30 -
        ((a.level >= w.level - 1 ? 1 : 0) * 10 + matchupEdge(a, w, s.weather) + a.hp / statsOf(a).maxHp + a.level / 30),
    )[0];
  if (!lead) return null;
  const battle = createBattle(game, lead.id);
  if (battle) game.log('auto', `The trainer sends ${lead.name} against the wild ${SPECIES_BY_ID[w.speciesId].name}.`);
  return battle;
}

export function autoBattleAction(game: Game, battle: Battle): void {
  const choice = wildChoose(game, battle);
  const action: BattleAction = choice.type === 'ability' ? { type: 'ability', index: choice.index } : { type: 'flee' };
  playerAct(game, battle, action);
}

export function autoDescribe(s: GameState): string {
  return `Day ${s.day}, ${s.hour}:00 · ${s.region === 'village' ? 'village' : BIOMES[s.region].name} · ${s.team.length} companions`;
}

export { randomGrassIn };