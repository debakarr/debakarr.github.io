import { hashString } from '../../shared/rng';
import { CIV_COLORS, createCiv } from './civs';
import { Game } from './game';
import { describePlace, logHistory } from './history';
import { createLeader } from './leaders';
import type { GameState, Settings } from './state';
import { createUnit } from './units';
import { recomputeVisibility } from './visibility';
import { generateWorld, worldSeed } from './worldgen';

export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  seed: '',
  size: 'standard',
  mapType: 'continents',
  rivals: 5,
  difficulty: 1,
  pace: 'standard',
  playerName: '',
};

export function newGame(settings: Settings): Game {
  const wg = generateWorld(settings);
  const state: GameState = {
    version: SAVE_VERSION,
    settings: { ...settings },
    turn: 0,
    map: wg.map,
    regions: wg.regions,
    rivers: wg.rivers,
    wonders: wg.wonders,
    ruins: wg.ruins,
    civs: [],
    cities: {},
    units: {},
    leaders: [],
    wars: [],
    religions: [],
    worldWonders: {},
    history: [],
    decisions: [],
    notices: [],
    samples: [],
    nextId: 1,
    rng: hashString(`${worldSeed(settings)}:sim`),
    playerId: 0,
    globalPollution: 0,
    firsts: {},
    ended: false,
  };
  const g = new Game(state);
  const starts = g.rng.shuffle([...wg.starts]);
  starts.forEach((tile, i) => {
    const civ = createCiv(g, {
      isPlayer: i === 0,
      name: i === 0 ? settings.playerName : undefined,
      color: i === 0 ? CIV_COLORS[0] : undefined,
      startTile: tile,
    });
    createLeader(g, civ, 'founding');
    createUnit(g, civ, 'settler', tile);
    createUnit(g, civ, 'warband', tile);
    const scoutTile = g.grid.neighborList(tile).find((t) => g.s.map.terrain[t] > 2 && g.s.map.relief[t] !== 2) ?? tile;
    createUnit(g, civ, 'scout', scoutTile);
    for (const t of g.grid.within(tile, 2)) civ.explored[t] = 1;
  });
  const player = g.player;
  logHistory(g, 'origin', 3, [player.id],
    `The story of the ${player.name} begins. A small band of wanderers makes camp ${describePlace(g, player.startTile)}, with nothing but each other and the land.`,
    player.startTile);
  for (const civ of g.s.civs) recomputeVisibility(g, civ);
  g.s.notices = [];
  g.syncRng();
  return g;
}
