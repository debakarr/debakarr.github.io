// Diplomacy as a royal audience: the other people's leader, in 3D, in their
// own hall, with a dialogue panel. Every option calls the same diplomacy
// rules as before (proposals are judged by the AI, treaties are signed or
// torn up, wars declared) and the leader's face and words react to it.

import { GOV, TRAIT } from '../../data/society';
import { civPopulation } from '../../sim/cities';
import {
  STATUS_LABEL, grievance, opinionParts, powerOf, relationStatus, tradeIncome, warBetween, warScore,
} from '../../sim/diplomacy';
import type { Game } from '../../sim/game';
import { chooseEpithet, currentLeader } from '../../sim/leaders';
import type { Civ } from '../../sim/state';
import { AudienceScene } from '../../render3d/audience';
import type { Expression, LeaderLook } from '../../render3d/models/leader';
import type { Stage } from '../../render3d/stage';
import { SKINS } from '../battle';
import { clear, gi, h, svg } from '../dom';
import { ICON } from '../icons';
import { diplomacyActions, reasonsList, type DiploAction } from './diplomacy';

export interface AudienceHost {
  root: HTMLElement;
  stage: Stage;
  g: Game;
  onChange: () => void;
  onClose: () => void;
  sound: (k: 'click' | 'alert' | 'found' | 'war') => void;
}

const ACTION_ICON: Record<DiploAction['icon'], string> = {
  trade: 'y-gold', borders: 'y-moves', alliance: 'n-diplomacy', gift: 'w-bazaar', demand: 'y-strength', war: 'y-strength', peace: 'n-legacy', cancel: 'y-sad', join: 'y-defense',
};

function lookOf(g: Game, civ: Civ): LeaderLook {
  const l = currentLeader(g, civ);
  const age = l ? Math.max(0, Math.min(1, (g.turn - l.born - 20) / 50)) : 0.4;
  return {
    gender: l?.gender ?? (civ.id % 2 ? 'f' : 'm'),
    title: l?.title ?? 'Chief',
    tier: civ.eraTier,
    color: civ.color,
    skin: SKINS[civ.id % SKINS.length],
    seed: (l?.id ?? civ.id) * 7919 + 13,
    age,
  };
}

function moodOf(st: string, op: number): Expression {
  if (st === 'war' || st === 'rival') return 'angry';
  if (st === 'hostile') return op < -45 ? 'angry' : 'sad';
  if (st === 'allied' || st === 'friendly' || st === 'trading' || st === 'vassal') return 'happy';
  return 'neutral';
}

function greeting(g: Game, civ: Civ, st: string): string {
  const p = g.player;
  const l = currentLeader(g, civ);
  const grudge = grievance(g, civ.id, p.id);
  const traits = l?.traits ?? [];
  let text: string;
  switch (st) {
    case 'war': {
      const w = warBetween(g, p.id, civ.id);
      const score = w ? warScore(w, civ.id) : 0;
      text = score > 15 ? 'Come to beg for mercy? Our armies are winning this war — speak quickly.' : score < -15 ? 'Enough blood has been spilled. Perhaps we can talk… perhaps.' : 'You dare send envoys while our armies march? Say what you came to say.';
      break;
    }
    case 'rival':
    case 'hostile':
      text = grudge ? `We have not forgotten. ${grudge} What do you want?` : `The ${p.name} are not welcome here. State your business.`;
      break;
    case 'allied':
      text = 'Welcome, friend and ally! Our swords and our markets are yours. How may we help?';
      break;
    case 'trading':
      text = `Our merchants speak well of the ${p.name}. What brings you to our court today?`;
      break;
    case 'friendly':
      text = 'It is a pleasure to meet you. Our people have heard of your growing civilization. How may we work together?';
      break;
    case 'vassal':
      text = 'Our tribute arrives on time, as always. What else do you require of us?';
      break;
    case 'overlord':
      text = 'Ah, our loyal subjects. You may speak.';
      break;
    default:
      text = `Greetings, envoy of the ${p.name}. We know little of you yet. What brings you here?`;
  }
  if (traits.includes('mercantile') && st !== 'war') text += ' There is profit to be made between our peoples.';
  else if (traits.includes('paranoid') && st !== 'allied') text += ' Forgive us if we keep a hand near our swords.';
  else if (traits.includes('scholar') && st !== 'war') text += ' We would gladly hear what your scholars have learned.';
  return text;
}

/** Opens the audience with a civilization (or the first one met). */
export function openAudience(host: AudienceHost, focus = -1): void {
  const g = host.g;
  const p = g.player;
  const known = g.s.civs.filter((c) => c.id !== p.id && g.knows(p.id, c.id) && c.alive);
  if (!known.length) return;
  let civ = known.find((c) => c.id === focus) ?? known[0];
  let scene: AudienceScene | null = null;
  let confirmWar = false;
  let said = '';
  let saidTone: 'ok' | 'no' | 'none' = 'none';
  let details = false;
  const prev = host.stage.showing;
  const el = h('div', { class: 'yz-audience', role: 'dialog', 'aria-label': 'Diplomacy' });
  host.root.append(el);
  host.root.classList.add('yz-cinema');

  const setScene = () => {
    scene?.dispose();
    scene = new AudienceScene({ leader: lookOf(g, civ), envoy: lookOf(g, p), civColor: civ.color, emblem: civ.id * 3 + 1 }, host.stage.quality !== 'low');
    host.stage.show(scene);
    const st = relationStatus(g, p.id, civ.id);
    scene.setMood(moodOf(st, civ.relations[p.id]?.opinion ?? 0));
    scene.react(moodOf(st, civ.relations[p.id]?.opinion ?? 0), st === 'war' || st === 'hostile' ? 'point' : 'welcome');
  };

  const close = () => {
    window.removeEventListener('keydown', key, true);
    el.remove();
    host.root.classList.remove('yz-cinema');
    host.stage.show(prev);
    scene?.dispose();
    scene = null;
    host.onClose();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  window.addEventListener('keydown', key, true);

  const render = () => {
    clear(el);
    const st = relationStatus(g, p.id, civ.id);
    const l = currentLeader(g, civ);
    const op = civ.relations[p.id]?.opinion ?? 0;
    // top bar: leave + the peoples we know
    el.append(h('div', { class: 'yz-au-top' },
      h('button', { class: 'yz-btn yz-au-leave', onclick: close }, svg(ICON.back), 'Leave'),
      h('div', { class: 'yz-au-tabs' }, known.map((c) => {
        const s = relationStatus(g, p.id, c.id);
        return h('button', {
          class: `yz-au-tab${c.id === civ.id ? ' on' : ''}`,
          onclick: () => {
            if (c.id === civ.id) return;
            civ = c;
            confirmWar = false;
            said = '';
            saidTone = 'none';
            setScene();
            render();
            host.sound('click');
          },
        }, h('span', { class: 'yz-dot', style: { background: c.color } }), h('span', null, c.name), h('i', { class: `st ${s}` }));
      }))));
    const lead = l ? `${l.title} ${l.name}` : `The ${civ.name}`;
    const epithet = l ? chooseEpithet(l, g.turn) : '';
    const words = said || greeting(g, civ, st);
    const attitude = Math.max(0, Math.min(100, 50 + op / 2));
    const toneCls = st === 'war' || st === 'hostile' || st === 'rival' ? 'bad' : st === 'neutral' || st === 'unknown' ? 'even' : 'good';
    const actions = diplomacyActions(g, civ.id, confirmWar);
    const panel = h('div', { class: 'yz-au-panel' },
      h('div', { class: 'yz-au-head' },
        h('span', { class: 'yz-crest big', style: { '--civ': civ.color } as never }, gi('n-civ')),
        h('div', null, h('div', { class: 'yz-au-name' }, lead), h('div', { class: 'yz-au-sub' }, `${epithet ? `${epithet} · ` : ''}${GOV[civ.government].name} of the ${civ.name}`))),
      h('div', { class: `yz-au-mood ${toneCls}` },
        h('span', { class: 'lbl' }, STATUS_LABEL[st]),
        h('span', { class: 'face' }, toneCls === 'good' ? '☺' : toneCls === 'bad' ? '☹' : '•'),
        h('div', { class: 'bar' }, h('i', { style: { width: `${attitude}%` } }))),
      h('div', { class: `yz-au-say ${saidTone}` }, h('p', null, words)),
      h('div', { class: 'yz-au-options' }, actions.map((a) => h('button', {
        class: `yz-au-opt${a.danger ? ' danger' : ''}${a.danger && confirmWar ? ' armed' : ''}`,
        disabled: !!a.disabled,
        title: a.title ?? '',
        onclick: () => {
          const r = a.run();
          if (r.confirm) {
            confirmWar = true;
            host.sound('alert');
            render();
            return;
          }
          confirmWar = false;
          said = r.text;
          saidTone = r.ok ? 'ok' : 'no';
          const now = relationStatus(g, p.id, civ.id);
          if (a.key === 'war') {
            scene?.react('angry', 'point');
            host.sound('war');
          } else if (r.ok) {
            scene?.react('happy', 'welcome');
            host.sound('found');
          } else {
            scene?.react(now === 'hostile' || now === 'war' ? 'angry' : 'sad', 'refuse');
            host.sound('click');
          }
          host.onChange();
          render();
        },
      }, gi(ACTION_ICON[a.icon]), h('span', null, a.label)))),
      h('button', { class: 'yz-linkbtn yz-au-more', onclick: () => { details = !details; render(); } }, details ? 'Hide details' : 'Their view of us & agreements'),
      details ? detailsBox(g, civ) : null);
    el.append(panel);
  };
  setScene();
  render();
}

function detailsBox(g: Game, civ: Civ): HTMLElement {
  const p = g.player;
  const ourRel = p.relations[civ.id];
  const box = h('div', { class: 'yz-au-details' });
  const chips = h('div', { class: 'yz-chips' });
  for (const t of civ.identity) chips.append(h('span', { class: 'yz-chip gold', title: TRAIT[t].effect }, TRAIT[t].label));
  chips.append(h('span', { class: 'yz-chip' }, `${g.citiesOf(civ.id).length} cities · ${civPopulation(g, civ).toLocaleString('en-US')} people`));
  const ratio = powerOf(g, civ.id) / powerOf(g, p.id);
  chips.append(h('span', { class: `yz-chip${ratio > 1.3 ? ' war' : ratio < 0.75 ? ' good' : ''}` }, ratio > 1.3 ? 'Militarily stronger' : ratio < 0.75 ? 'Militarily weaker' : 'Comparable strength'));
  if (ourRel.trade >= 0) chips.append(h('span', { class: 'yz-chip good' }, `Trading (+${tradeIncome(g, p.id, civ.id)} gold/yr)`));
  if (ourRel.openBorders >= 0) chips.append(h('span', { class: 'yz-chip good' }, 'Open borders'));
  if (ourRel.alliance >= 0) chips.append(h('span', { class: 'yz-chip good' }, `Allied since Year ${ourRel.alliance}`));
  if (ourRel.peaceUntil > g.turn) chips.append(h('span', { class: 'yz-chip' }, `Peace until Year ${ourRel.peaceUntil}`));
  box.append(chips, reasonsList(opinionParts(g, civ.id, p.id)));
  return box;
}
