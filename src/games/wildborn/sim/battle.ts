// Wildborn's turn-based battles: 1v1 with switching, three abilities per
// creature, affinity strength, biome and weather modifiers, and a wild AI
// that fights, uses status, heals, or flees when it is scared.

import { ABILITIES, AFFINITY, BIOMES, SPECIES_BY_ID, STRONG, type Ability, type Affinity } from '../data/species';
import { Game, statsOf, type Creature, type Stats, type Weather, findCreature } from './game';

export interface Effects {
  guard: number;
  confuse: number;
  weaken: number;
  focus: boolean;
}

export interface Fighter {
  creature: Creature;
  name: string;
  stats: Stats;
  hp: number;
  effects: Effects;
  wild: boolean;
}

export interface BattleEvent {
  text: string;
  kind: 'attack' | 'status' | 'heal' | 'flee' | 'switch' | 'end' | 'system';
  /** Who the event lands on, so the UI can animate the right fighter. */
  on?: 'player' | 'foe';
  /** Signed HP change, for floating numbers. */
  hp?: number;
  crit?: boolean;
}

const sideOf = (f: Fighter): 'player' | 'foe' => (f.wild ? 'foe' : 'player');

export interface Battle {
  player: Fighter;
  foe: Fighter;
  weather: Weather;
  biome: string;
  turn: number;
  over: null | 'win' | 'lose' | 'flee';
  events: BattleEvent[];
  rewardXp: number;
}

export type BattleAction =
  | { type: 'ability'; index: number }
  | { type: 'switch'; creatureId: string }
  | { type: 'item'; itemId: string }
  | { type: 'flee' };

function fighter(creature: Creature, wild: boolean): Fighter {
  return {
    creature,
    name: SPECIES_BY_ID[creature.speciesId].name,
    stats: statsOf(creature),
    hp: creature.hp,
    effects: { guard: 0, confuse: 0, weaken: 0, focus: false },
    wild,
  };
}

export function createBattle(game: Game, playerCreatureId: string): Battle | null {
  const wild = game.state.wild;
  const ally = findCreature(game.state, playerCreatureId);
  if (!wild || !ally) return null;
  return {
    player: fighter(ally, false),
    foe: fighter(wild, true),
    weather: game.state.weather,
    biome: game.state.region,
    turn: 1,
    over: null,
    events: [{ kind: 'system', text: `A wild ${SPECIES_BY_ID[wild.speciesId].name} steps forward. Battle begins.` }],
    rewardXp: 10 + wild.level * 11,
  };
}

export function weatherMult(affinity: Affinity, weather: Weather): number {
  if (weather === 'rain') return affinity === 'thermal' ? 0.8 : affinity === 'aquatic' || affinity === 'conductive' ? 1.12 : 1;
  if (weather === 'storm')
    return affinity === 'conductive' ? 1.3 : affinity === 'atmospheric' ? 1.12 : affinity === 'thermal' ? 0.85 : 1;
  if (weather === 'fog') return affinity === 'psionic' || affinity === 'void' ? 1.2 : affinity === 'radiant' ? 0.82 : 1;
  return affinity === 'thermal' || affinity === 'radiant' ? 1.15 : affinity === 'aquatic' ? 0.9 : 1;
}

export function affinityMult(ability: Affinity, defender: Creature): number {
  const def = SPECIES_BY_ID[defender.speciesId].affinities;
  const strong = STRONG[ability] ?? [];
  if (strong.some((a) => def.includes(a))) return 1.5;
  const weak = def.some((a) => (STRONG[a] ?? []).includes(ability));
  return weak ? 0.78 : 1;
}

/** Full damage multiplier for an ability in this battle's conditions. */
function conditionMult(ability: Ability, battle: Battle): number {
  const biomeBoost = battle.biome in BIOMES && ability.affinity === BIOMES[battle.biome as keyof typeof BIOMES].boost ? 1.25 : 1;
  return biomeBoost * weatherMult(ability.affinity, battle.weather);
}

function abilityPower(attacker: Fighter, defender: Fighter, ability: Ability, battle: Battle): number {
  const focus = attacker.effects.focus ? 1.5 : 1;
  const weaken = attacker.effects.weaken > 0 ? 0.72 : 1;
  const raw = ability.power * (0.42 + attacker.stats.power * 0.055) * (1 + attacker.creature.level * 0.02);
  return raw * focus * weaken * conditionMult(ability, battle) * affinityMult(ability.affinity, defender.creature);
}

function hit(
  game: Game,
  battle: Battle,
  attacker: Fighter,
  defender: Fighter,
  ability: Ability,
  events: BattleEvent[],
): void {
  const rng = game.rng;
  const power = abilityPower(attacker, defender, ability, battle);
  const guardMult = defender.effects.guard > 0 ? 1.6 : 1;
  const mitigation = 1 + defender.stats.guard * 0.045 * guardMult;
  const variance = rng.float(0.9, 1.1);
  const crit = rng.chance(0.06);
  const dmg = Math.max(1, Math.round((power / mitigation) * variance * (crit ? 1.6 : 1)));
  const mult = affinityMult(ability.affinity, defender.creature) * conditionMult(ability, battle);
  defender.hp = Math.max(0, defender.hp - dmg);
  const label = ability.power > 0 ? ability.name : 'a feint';
  const note = crit ? ' A critical hit!' : mult >= 1.5 ? ' It hits hard!' : mult < 0.8 ? ' Not very effective.' : '';
  events.push({ kind: 'attack', text: `${attacker.name} uses ${label}: ${dmg} damage.${note}`, on: sideOf(defender), hp: -dmg, crit });
  if (ability.effect === 'drain' && ability.power > 0) {
    const heal = Math.min(Math.round(dmg * 0.5), attacker.stats.maxHp - attacker.hp);
    attacker.hp = Math.min(attacker.stats.maxHp, attacker.hp + Math.round(dmg * 0.5));
    events.push({ kind: 'heal', text: `${attacker.name} drains ${Math.round(dmg * 0.5)} HP back.`, on: sideOf(attacker), hp: heal });
  }
  if (ability.effect === 'heal') {
    const heal = Math.min(Math.round(attacker.stats.maxHp * 0.32), attacker.stats.maxHp - attacker.hp);
    attacker.hp = Math.min(attacker.stats.maxHp, attacker.hp + Math.round(attacker.stats.maxHp * 0.32));
    events.push({ kind: 'heal', text: `${attacker.name} heals ${Math.round(attacker.stats.maxHp * 0.32)} HP.`, on: sideOf(attacker), hp: heal });
  }
  if (ability.effect === 'guard') {
    attacker.effects.guard = 2;
    events.push({ kind: 'status', text: `${attacker.name} guards.`, on: sideOf(attacker) });
  }
  if (ability.effect === 'confuse') {
    defender.effects.confuse = 2;
    events.push({ kind: 'status', text: `${defender.name} is confused.`, on: sideOf(defender) });
  }
  if (ability.effect === 'weaken') {
    defender.effects.weaken = 2;
    events.push({ kind: 'status', text: `${defender.name} is weakened.`, on: sideOf(defender) });
  }
  if (ability.effect === 'focus') {
    attacker.effects.focus = true;
    events.push({ kind: 'status', text: `${attacker.name} focuses.`, on: sideOf(attacker) });
  }
}

/** A basic, honest strike using the creature's first affinity. */
function basicAbility(creature: Creature): Ability {
  const sp = SPECIES_BY_ID[creature.speciesId];
  return {
    id: 'basic',
    name: 'Strike',
    affinity: sp.affinities[0],
    power: 26,
    desc: 'A basic attack.',
  };
}

function usableAbilities(f: Fighter): Ability[] {
  return f.creature.abilities.map((id) => ABILITIES[id]).filter(Boolean);
}

function actWith(game: Game, battle: Battle, side: Fighter, foe: Fighter, ability: Ability, events: BattleEvent[]): void {
  if (side.effects.confuse > 0 && game.rng.chance(0.3)) {
    events.push({ kind: 'status', text: `${side.name} is confused and misses its turn.`, on: sideOf(side) });
    return;
  }
  hit(game, battle, side, foe, ability, events);
  if (ability.power > 0) side.effects.focus = false;
}

/** The wild creature's behaviour: fight smart, or run when it is scared. */
export function wildChoose(game: Game, battle: Battle): BattleAction {
  const wild = battle.foe;
  const hpFrac = wild.hp / wild.stats.maxHp;
  const scared = wild.creature.personality.fear > 55 || wild.creature.trust < 15;
  if (hpFrac < 0.25 && scared && game.rng.chance(0.4)) return { type: 'flee' };
  const abilities = usableAbilities(wild);
  const heal = abilities.find((a) => a.effect === 'heal');
  if (heal && hpFrac < 0.35 && game.rng.chance(0.6)) return { type: 'ability', index: wild.creature.abilities.indexOf(heal.id) };
  const status = abilities.find((a) => a.effect === 'confuse' || a.effect === 'weaken');
  if (status && game.rng.chance(0.22) && battle.turn > 1) return { type: 'ability', index: wild.creature.abilities.indexOf(status.id) };
  let bestIdx = 0;
  let bestDmg = -1;
  wild.creature.abilities.forEach((id, i) => {
    const ab = ABILITIES[id];
    if (!ab || ab.power <= 0) return;
    const dmg = ab.power * affinityMult(ab.affinity, battle.player.creature) * weatherMult(ab.affinity, battle.weather);
    if (dmg > bestDmg) {
      bestDmg = dmg;
      bestIdx = i;
    }
  });
  return { type: 'ability', index: bestIdx };
}

function endCheck(game: Game, battle: Battle, events: BattleEvent[]): void {
  if (battle.over) return;
  const state = game.state;
  if (battle.foe.hp <= 0) {
    battle.over = 'win';
    events.push({ kind: 'end', text: `The wild ${battle.foe.name} collapses. You win.` });
    for (const c of state.team) c.exposures.wins += 1;
    battle.foe.creature.hp = 1;
    battle.foe.creature.stress = Math.min(100, battle.foe.creature.stress + 15);
    battle.foe.creature.trust = Math.min(100, battle.foe.creature.trust + 6);
    game.gainXp(battle.player.creature, battle.rewardXp);
    battle.player.creature.history.push({ day: state.day, kind: 'battle', text: `Won a battle against a wild ${battle.foe.name}` });
    game.progressQuests('win', 1);
    state.counts.wins = (state.counts.wins ?? 0) + 1;
  } else if (battle.player.hp <= 0) {
    battle.over = 'lose';
    events.push({ kind: 'end', text: `${battle.player.name} is exhausted and can no longer fight. You lose.` });
    for (const c of state.team) c.exposures.losses += 1;
    battle.player.creature.hp = 1;
    battle.player.creature.stress = Math.min(100, battle.player.creature.stress + 18);
    battle.player.creature.history.push({ day: state.day, kind: 'battle', text: `Lost a battle against a wild ${battle.foe.name}` });
    game.gainXp(battle.player.creature, Math.round(battle.rewardXp * 0.35));
    state.counts.losses = (state.counts.losses ?? 0) + 1;
    if (state.wild) state.wild = null;
  }
  if (battle.over) {
    battle.player.creature.hp = battle.player.hp;
    game.log('battle', events[events.length - 1].text);
  }
}

function tickEffects(f: Fighter): void {
  if (f.effects.guard > 0) f.effects.guard -= 1;
  if (f.effects.confuse > 0) f.effects.confuse -= 1;
  if (f.effects.weaken > 0) f.effects.weaken -= 1;
}

/** Resolve one full turn from the player's action. */
export function playerAct(game: Game, battle: Battle, action: BattleAction): void {
  if (battle.over) return;
  const events = battle.events;
  const before = events.length;
  const wildFirst = battle.foe.stats.speed > battle.player.stats.speed;

  const doFlee = () => {
    battle.over = 'flee';
    events.push({ kind: 'flee', text: 'You withdraw from the battle.' });
    if (game.state.wild) game.state.wild = null;
  };

  const playerMove = (): boolean => {
    if (action.type === 'flee') {
      doFlee();
      return false;
    }
    if (action.type === 'switch') {
      const next = findCreature(game.state, action.creatureId);
      if (!next || next.hp <= 0 || next.id === battle.player.creature.id) return true;
      battle.player.creature.hp = battle.player.hp;
      battle.player = fighter(next, false);
      events.push({ kind: 'switch', text: `You send out ${battle.player.name}.` });
      return true;
    }
    if (action.type === 'item') {
      const item = action.itemId;
      const heal = item === 'salve' ? 999 : item === 'moonfruit' ? 25 : item === 'berry' ? 15 : 0;
      if (!heal || (game.state.items[item] ?? 0) <= 0) return true;
      game.state.items[item] -= 1;
      const healed = Math.min(heal, battle.player.stats.maxHp - battle.player.hp);
      battle.player.hp = Math.min(battle.player.stats.maxHp, battle.player.hp + heal);
      events.push({ kind: 'heal', text: `${battle.player.name} recovers ${healed} HP.`, on: 'player', hp: healed });
      return true;
    }
    const ability =
      action.index < 0
        ? basicAbility(battle.player.creature)
        : ABILITIES[battle.player.creature.abilities[action.index]] ?? basicAbility(battle.player.creature);
    actWith(game, battle, battle.player, battle.foe, ability, events);
    return true;
  };

  const foeMove = () => {
    if (battle.over || battle.foe.hp <= 0) return;
    const choice = wildChoose(game, battle);
    if (choice.type === 'flee') {
      battle.over = 'flee';
      events.push({ kind: 'flee', text: `The wild ${battle.foe.name} flees into the ${battle.biome in BIOMES ? BIOMES[battle.biome as keyof typeof BIOMES].name : 'wilds'}.` });
      game.state.wild = null;
      return;
    }
    const ability =
      choice.type === 'ability'
        ? ABILITIES[battle.foe.creature.abilities[choice.index]] ?? basicAbility(battle.foe.creature)
        : basicAbility(battle.foe.creature);
    actWith(game, battle, battle.foe, battle.player, ability, events);
  };

  if (wildFirst) {
    foeMove();
    if (!battle.over) playerMove();
  } else {
    playerMove();
    foeMove();
  }

  tickEffects(battle.player);
  tickEffects(battle.foe);
  battle.turn += 1;
  endCheck(game, battle, events);
  for (const e of events.slice(before)) if (e.kind === 'end' || e.kind === 'flee') break;
}

export function battleLabel(weather: Weather, biome: string): string {
  const b = biome in BIOMES ? BIOMES[biome as keyof typeof BIOMES] : null;
  return `${b ? b.name : 'Open field'} · ${weather}`;
}

export const AFFINITY_INFO = AFFINITY;
