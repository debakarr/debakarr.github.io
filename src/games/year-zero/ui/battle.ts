// The battle flow around the map: a preview card with both sides, their
// strength, the expected damage and what helps or hurts them — then, if the
// player starts the battle, the real attack is resolved and (when 3D and
// battle scenes are on) staged as a short film with a skippable HUD.

import { Vector3 } from 'three';
import { FEATURE_NAME, Relief, TERRAIN } from '../data/terrain';
import { UNIT } from '../data/units';
import type { Game } from '../sim/game';
import { regionName } from '../sim/history';
import type { Unit } from '../sim/state';
import { attackTarget, battleFactors, previewAttack } from '../sim/units';
import { BattleScene, type BattleInfo } from '../render3d/battle';
import type { Stage } from '../render3d/stage';
import { clear, gi, h, svg } from './dom';
import { ICON } from './icons';

export const SKINS = ['#f6d3b3', '#efc39c', '#d9a57a', '#b97f55', '#8e5c3c', '#f3d0b0'];

export function placeName(g: Game, tile: number): string {
  const map = g.s.map;
  const city = g.cityAt(tile);
  if (city) return `Siege of ${city.name}`;
  const t = TERRAIN[map.terrain[tile]].name;
  const feat = FEATURE_NAME[map.feature[tile]];
  const relief = map.relief[tile] === Relief.Hills ? 'Hills' : map.relief[tile] === Relief.Mountain ? 'Heights' : '';
  const region = regionName(g, tile);
  const land = [feat || relief || t].join(' ');
  return region ? `${land} of ${region}` : `The ${land}`;
}

function shieldBadge(color: string, icon: string): HTMLElement {
  return h('span', { class: 'yz-crest', style: { '--civ': color } as never }, gi(icon));
}

function hpBar(before: number, loss: number, tone: 'good' | 'bad'): HTMLElement {
  const after = Math.max(0, before - loss);
  return h('div', { class: `yz-hp ${tone}` },
    h('i', { class: 'now', style: { width: `${after}%` } }),
    h('i', { class: 'loss', style: { left: `${after}%`, width: `${Math.min(before, loss)}%` } }));
}

// --- Preview -------------------------------------------------------------------------------

export interface PreviewHandlers {
  start: () => void;
  cancel: () => void;
  watch: boolean;
  setWatch: (on: boolean) => void;
  canWatch: boolean;
}

export function battlePreview(g: Game, u: Unit, tile: number, on: PreviewHandlers): HTMLElement | null {
  const odds = previewAttack(g, u, tile);
  const target = attackTarget(g, u, tile);
  const f = battleFactors(g, u, tile);
  if (!odds || !target || !f) return null;
  const civ = g.civ(u.civId);
  const def = UNIT[u.type];
  const enemyCiv = g.civ(target.city ? target.city.civId : target.unit!.civId);
  const win = odds.dmgToDef >= odds.defHp;
  const lose = odds.dmgToAtk >= odds.atkHp;
  const verdict = lose ? { t: 'Likely defeat', c: 'bad' } : win ? { t: target.city ? 'The city should fall' : 'Likely victory', c: 'good' } : odds.dmgToDef > odds.dmgToAtk * 1.4 ? { t: 'Favourable', c: 'good' } : odds.dmgToAtk > odds.dmgToDef * 1.4 ? { t: 'Costly', c: 'bad' } : { t: 'An even fight', c: 'even' };
  const row = (label: string, color: string, icon: string, name: string, sub: string, strength: number, hp: number, loss: number, tone: 'good' | 'bad') =>
    h('div', { class: 'yz-bp-row' },
      h('div', { class: 'yz-bp-label' }, label),
      h('div', { class: 'yz-bp-unit' }, shieldBadge(color, icon),
        h('div', { class: 'yz-bp-name' }, h('b', null, name), h('span', null, sub)),
        h('div', { class: 'yz-bp-str', title: 'Combat strength' }, gi('y-strength'), h('span', null, strength.toFixed(strength < 10 ? 1 : 0)))),
      h('div', { class: 'yz-bp-hp' }, hpBar(hp, loss, tone), h('span', { class: 'yz-num' }, `${hp} → ${Math.max(0, hp - loss)}`)));
  const card = h('div', { class: 'yz-battle-preview', role: 'dialog', 'aria-label': 'Battle preview' },
    h('div', { class: 'yz-bp-head' }, svg(ICON.sword), h('span', null, placeName(g, tile))),
    row('Attacker', civ.color, `u-${u.type}`, def.name, `${civ.adj}${u.veteran ? ' · veteran' : ''}`, f.attack, u.hp, odds.dmgToAtk, 'good'),
    h('div', { class: 'yz-bp-vs' }, 'VS'),
    target.city
      ? row('Defender', enemyCiv.color, 'n-city', target.city.name, `${enemyCiv.name} · size ${target.city.size}`, f.defense, odds.defHp, odds.dmgToDef, 'bad')
      : row('Defender', enemyCiv.color, `u-${target.unit!.type}`, UNIT[target.unit!.type].name, enemyCiv.adj, f.defense, odds.defHp, odds.dmgToDef, 'bad'),
    f.mods.length ? h('div', { class: 'yz-chips yz-bp-mods' }, f.mods.map((m) => h('span', { class: `yz-chip ${m.good ? 'good' : 'war'}` }, m.label))) : null,
    h('div', { class: `yz-bp-verdict ${verdict.c}` }, verdict.t, h('span', null, ` · we deal ~${odds.dmgToDef}, take ~${odds.dmgToAtk}`)),
    h('div', { class: 'yz-bp-actions' },
      h('button', { class: 'yz-btn', onclick: on.cancel }, 'Cancel'),
      h('button', { class: 'yz-btn gold big', onclick: on.start, 'data-start': '1' }, svg(ICON.sword), 'Start Battle')),
    on.canWatch ? h('label', { class: 'yz-bp-watch' },
      h('input', { type: 'checkbox', checked: on.watch, onchange: (e: Event) => on.setWatch((e.target as HTMLInputElement).checked) }), 'Watch the battle') : null);
  return card;
}

// --- The film ---------------------------------------------------------------------------------

export interface BattleHost {
  root: HTMLElement;
  stage: Stage;
  sound: (kind: 'combat' | 'war' | 'found' | 'alert' | 'click') => void;
}

/** Builds the scene description from the state before and after the (already resolved) attack. */
export function battleInfo(g: Game, before: BattleBefore, after: { dmgAtk: number; dmgDef: number; killed: boolean; died: boolean; captured: boolean }): BattleInfo {
  const map = g.s.map;
  const tile = before.tile;
  return {
    title: placeName(g, tile),
    attacker: { ...before.attacker, hpAfter: Math.max(0, before.attacker.hpBefore - after.dmgAtk), lost: after.died },
    defender: { ...before.defender, hpAfter: Math.max(0, before.defender.hpBefore - after.dmgDef), lost: after.killed || after.captured },
    city: before.city,
    captured: after.captured,
    ranged: before.ranged,
    terrain: map.terrain[tile],
    feature: map.feature[tile],
    relief: map.relief[tile],
    river: map.river[tile] > 0,
    water: map.terrain[tile] <= 2,
    seed: tile * 31 + g.turn,
  };
}

export interface BattleBefore {
  tile: number;
  ranged: boolean;
  attacker: Omit<BattleInfo['attacker'], 'hpAfter' | 'lost'>;
  defender: Omit<BattleInfo['defender'], 'hpAfter' | 'lost'>;
  city: BattleInfo['city'];
}

export function battleBefore(g: Game, u: Unit, tile: number): BattleBefore | null {
  const target = attackTarget(g, u, tile);
  if (!target) return null;
  const civ = g.civ(u.civId);
  const def = UNIT[u.type];
  if (target.city) {
    const c = target.city;
    const ec = g.civ(c.civId);
    const garrison = g.unitsOn(c.tile).filter((o) => o.civId === c.civId && UNIT[o.type].cls !== 'civilian').sort((a, b) => UNIT[b.type].str - UNIT[a.type].str)[0];
    return {
      tile,
      ranged: def.rng > 0,
      attacker: { civName: civ.name, adj: civ.adj, color: civ.color, skin: SKINS[civ.id % SKINS.length], type: u.type, label: def.name, hpBefore: u.hp, tier: civ.eraTier },
      defender: { civName: ec.name, adj: ec.adj, color: ec.color, skin: SKINS[ec.id % SKINS.length], type: garrison?.type ?? null, label: c.name, hpBefore: c.hp, tier: ec.eraTier },
      city: { name: c.name, size: c.size, walls: c.buildings.includes('walls') || c.buildings.includes('castle') },
    };
  }
  const d = target.unit!;
  const ec = g.civ(d.civId);
  return {
    tile,
    ranged: def.rng > 0,
    attacker: { civName: civ.name, adj: civ.adj, color: civ.color, skin: SKINS[civ.id % SKINS.length], type: u.type, label: def.name, hpBefore: u.hp, tier: civ.eraTier },
    defender: { civName: ec.name, adj: ec.adj, color: ec.color, skin: SKINS[ec.id % SKINS.length], type: d.type, label: UNIT[d.type].name, hpBefore: d.hp, tier: ec.eraTier },
    city: null,
  };
}

/** Plays the battle film. Resolves when the player continues. */
export function playBattle(host: BattleHost, info: BattleInfo): Promise<void> {
  return new Promise((resolve) => {
    const stage = host.stage;
    const prev = stage.showing;
    const scene = new BattleScene(info, stage.quality !== 'low');
    stage.show(scene);
    host.root.classList.add('yz-cinema');
    const a = info.attacker;
    const d = info.defender;
    const side = (label: string, s: typeof a, tone: 'good' | 'bad') => {
      const bar = h('i', { class: 'now', style: { width: `${s.hpBefore}%` } });
      const num = h('b', { class: 'yz-num' }, String(s.hpBefore));
      const el = h('div', { class: 'yz-bh-side' },
        h('div', { class: 'yz-bp-label' }, label),
        h('div', { class: 'yz-bh-unit' }, shieldBadge(s.color, s.type ? `u-${s.type}` : 'n-city'),
          h('div', { class: 'yz-bp-name' }, h('b', null, s.label), h('span', null, s.adj)), num),
        h('div', { class: `yz-hp ${tone}` }, bar));
      return { el, set: (hp: number) => { bar.style.width = `${Math.max(0, hp)}%`; num.textContent = String(Math.max(0, Math.round(hp))); } };
    };
    const A = side('Attacker', a, 'good');
    const D = side('Defender', d, 'bad');
    const floats = h('div', { class: 'yz-bh-floats' });
    const result = h('div', { class: 'yz-bh-result' });
    const skipBtn = h('button', { class: 'yz-btn yz-bh-skip', onclick: () => skip() }, 'Skip', svg(ICON.next));
    const overlay = h('div', { class: 'yz-battle-hud' },
      h('div', { class: 'yz-letterbox top' }), h('div', { class: 'yz-letterbox bottom' }),
      h('div', { class: 'yz-bh-panel' }, h('div', { class: 'yz-bp-head' }, svg(ICON.sword), h('span', null, info.title)), A.el, D.el),
      floats, result, skipBtn);
    host.root.append(overlay);
    host.sound('war');
    let finished = false;
    const pop = (text: string, world: Vector3, cls: string) => {
      const v = world.clone().project(scene.camera);
      const r = host.root.getBoundingClientRect();
      const el = h('div', { class: `yz-bh-float ${cls}`, style: { left: `${((v.x + 1) / 2) * r.width}px`, top: `${((1 - v.y) / 2) * r.height}px` } }, text);
      floats.append(el);
      setTimeout(() => el.remove(), 1600);
    };
    const showResult = () => {
      if (finished) return;
      finished = true;
      skipBtn.remove();
      A.set(info.attacker.hpAfter);
      D.set(info.defender.hpAfter);
      let title: string;
      let tone: string;
      let text: string;
      if (info.captured) {
        title = `${info.city?.name} has fallen!`;
        tone = 'win';
        text = `The ${a.adj} ${a.label} take the city.`;
      } else if (d.lost) {
        title = 'Victory!';
        tone = 'win';
        text = `The ${d.adj} ${d.label} were destroyed.`;
      } else if (a.lost) {
        title = 'Defeat';
        tone = 'lose';
        text = `Our ${a.label} fell in the attack.`;
      } else {
        title = info.city ? 'The walls hold' : 'They hold the line';
        tone = 'even';
        text = `We dealt ${a.hpBefore === a.hpAfter && d.hpBefore === d.hpAfter ? 'no' : d.hpBefore - d.hpAfter} damage and took ${a.hpBefore - a.hpAfter}.`;
      }
      clear(result);
      result.append(h('div', { class: `yz-bh-card ${tone}` },
        h('div', { class: 'yz-bh-title' }, title),
        h('div', { class: 'yz-bh-text' }, text),
        h('div', { class: 'yz-bh-stats' },
          h('span', null, `${a.label}: `, h('b', null, `${a.hpBefore} → ${info.attacker.hpAfter}`)),
          h('span', null, `${d.label}: `, h('b', null, `${d.hpBefore} → ${info.defender.hpAfter}`))),
        h('button', { class: 'yz-btn gold big', onclick: () => close() }, 'Continue')));
      host.sound(tone === 'win' ? 'found' : 'alert');
      (result.querySelector('button') as HTMLButtonElement | null)?.focus();
    };
    scene.onBeat = (kind, world) => {
      if (kind === 'hitDef') {
        const dmg = d.hpBefore - info.defender.hpAfter;
        D.set(info.defender.hpAfter);
        pop(dmg > 0 ? `−${dmg}` : 'Blocked!', world, 'def');
        host.sound('combat');
      } else if (kind === 'hitAtk') {
        const dmg = a.hpBefore - info.attacker.hpAfter;
        if (dmg > 0) {
          A.set(info.attacker.hpAfter);
          pop(`−${dmg}`, world, 'atk');
          host.sound('combat');
        }
      } else showResult();
    };
    const skip = () => {
      scene.skip();
      showResult();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        if (finished) close();
        else skip();
      }
    };
    window.addEventListener('keydown', key, true);
    const close = () => {
      window.removeEventListener('keydown', key, true);
      overlay.remove();
      host.root.classList.remove('yz-cinema');
      stage.show(prev);
      scene.dispose();
      resolve();
    };
  });
}
