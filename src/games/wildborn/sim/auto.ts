// The automatic mode: an AI trainer that explores, befriends or battles,
// captures new species, trains, feeds toward a chosen evolution branch,
// breeds, and leaves a visible log. The player can take over at any time.

import { ABILITIES, BIOMES, ITEMS, SPECIES_BY_ID, type Exposure } from '../data/species';
import {
  Game,
  evaluateEvolution,
  guideOf,
  statsOf,
  type Creature,
  type GameState,
} from './game';
import { affinityMult, createBattle, playerAct, weatherMult, wildChoose, type Battle, type BattleAction } from './battle';

const REGION_CYCLE: (keyof typeof BIOMES)[] = ['greenwood', 'meadow', 'wetlands', 'caves', 'ember', 'ruins'];

export function autoStep(game: Game, battle: Battle | null): { text: string; startBattle?: boolean } {
  const s = game.state;
  if (battle) return { text: battleStep(game, battle) };
  if (s.wild) return wildStep(game);
  if (s.region === 'village') return { text: villageStep(game) };
  return { text: exploreStep(game) };
}

// --- battles ------------------------------------------------------------------------------

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
      (state.items.salve ?? 0) > 0 && hpFrac < 0.28 ? 'salve' : (state.items.berry ?? 0) > 0 ? 'berry' : (state.items.salve ?? 0) > 0 ? 'salve' : null;
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

// --- wild encounters ------------------------------------------------------------------------

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

// --- the village -----------------------------------------------------------------------------

function villageStep(game: Game): string {
  const s = game.state;
  const all = [...s.team, ...s.reserve];
  s.counts.villageSteps = (s.counts.villageSteps ?? 0) + 1;

  // A short stop: a few actions of care, then back out into the world.
  if (s.counts.villageSteps > 3) {
    s.counts.villageSteps = 0;
    const region = REGION_CYCLE[(s.counts.autoTravel ?? 0) % REGION_CYCLE.length];
    s.counts.autoTravel = (s.counts.autoTravel ?? 0) + 1;
    game.travel(region);
    return `Setting out for ${BIOMES[region].name}.`;
  }

  const hurt = all.find((c) => c.hp < statsOf(c).maxHp * 0.5);
  if (hurt && hurt.hp > 0) return game.rest(hurt.id);

  // Breed when two same-family creatures are close and no egg is on the way.
  if (s.eggs.length === 0) {
    for (const a of all) {
      const partner = all.find((b) => b.id !== a.id && SPECIES_BY_ID[a.speciesId].family === SPECIES_BY_ID[b.speciesId].family && game.canBreed(a.id, b.id).ok);
      if (partner) return game.breed(a.id, partner.id);
    }
  }

  // Feed toward a creature's most likely evolution branch.
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
  if (all[0]) return game.rest(all[0].id);
  return 'The village is quiet while the trainer plans the next expedition.';
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

// --- exploration -------------------------------------------------------------------------------

function exploreStep(game: Game): string {
  const s = game.state;
  s.counts.sinceVillage = (s.counts.sinceVillage ?? 0) + 1;
  const hurt = [...s.team, ...s.reserve].find((c) => c.hp < statsOf(c).maxHp * 0.4);
  if (hurt || (s.counts.sinceVillage ?? 0) > 12) {
    s.counts.sinceVillage = 0;
    s.counts.villageSteps = 0;
    game.travel('village');
    return 'Heading back to the village to rest, train and breed.';
  }
  const outcome = game.explore();
  if (outcome.kind === 'encounter' && outcome.wild) {
    s.counts.autoTries = 0;
    s.counts.autoFought = 0;
    return outcome.text;
  }
  return outcome.text;
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
