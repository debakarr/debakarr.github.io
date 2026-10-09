// Auto-ranger: an automatic mode that plays the main quest. It walks toward
// the current objective (turning the camera to face where it goes), talks,
// examines, observes, feeds and resonates, and hands control back the moment
// the player touches the movement keys.

import { Vector3 } from 'three';
import { INTERACTABLES, PRISMS, type V2 } from '../data/world';
import type { Game } from '../game';
import { canResonate } from './bonding';

interface Goal {
  at: V2;
  /** Distance at which to act. */
  reach: number;
  act: () => void;
  label: string;
}

export class Autopilot {
  readonly input = { x: 0, y: 0, sprint: false, crouch: false, jump: false, jumpHeld: false };
  private cooldown = 0;
  private stuckT = 0;
  private lastPos = new Vector3();
  private strafe = 0;
  private strafeDir = 1;
  label = '';

  constructor(private g: Game) {
    this.lastPos.copy(g.player.pos);
  }

  private entryAt(id: string): V2 {
    return INTERACTABLES.find((i) => i.id === id)!.at;
  }

  private act(id: string): void {
    const e = this.g.interact.get(id);
    if (e && this.g.interact.available(e)) this.g.interact.interact(e);
  }

  private goal(): Goal | null {
    const g = this.g;
    const s = g.state;
    const q = s.quests.beacon;
    if (!q || q.status !== 'active') return null;
    const npc = (id: string) => g.npcs.find((n) => n.def.id === id)!;
    switch (q.stage) {
      case 0:
      case 7:
        return { at: [npc('elen').pos.x, npc('elen').pos.z], reach: 2.4, act: () => g.talk(npc('elen')), label: 'Talking to Elen' };
      case 1: {
        const t = ['track-1', 'track-2', 'track-3'].find((id) => s.done[id] === undefined)!;
        return { at: this.entryAt(t), reach: 2.2, act: () => this.act(t), label: 'Following the tracks' };
      }
      case 2: {
        const c = g.creatures.wild.find((x) => x.id === 'w-lume-quest') ?? g.creatures.wild.find((x) => x.species === 'lumelle');
        if (!c) return null;
        return {
          at: [c.pos.x, c.pos.z],
          reach: 9,
          act: () => {
            if (g.target?.kind === 'creature') g.doObserve();
          },
          label: 'Observing the glowing creature',
        };
      }
      case 3: {
        const ab = g.ability();
        const order = ['crystal-clearing', 'crystal-cave', 'crystal-river', 'crystal-shrine', 'crystal-cove'];
        for (const id of order) {
          if (s.done[id] !== undefined) continue;
          const def = INTERACTABLES.find((i) => i.id === id)!;
          if (def.blockedBy && s.done[def.blockedBy] === undefined) {
            const need = def.blockedBy.startsWith('thorns') ? 'ember' : def.blockedBy.startsWith('cracked') ? 'quake' : null;
            if (need && need === ab) return { at: this.entryAt(def.blockedBy), reach: 3, act: () => this.act(def.blockedBy!), label: 'Clearing the way' };
            continue;
          }
          if (id === 'crystal-cove' && ab !== 'tide') continue;
          return { at: def.at, reach: 2, act: () => this.act(id), label: 'Collecting a crystal' };
        }
        return null;
      }
      case 4:
        return { at: this.entryAt('socket'), reach: 2.4, act: () => this.act('socket'), label: 'Returning the crystals' };
      case 5:
        return { at: this.entryAt('altar'), reach: 2.4, act: () => this.act('altar'), label: 'Waking the altar' };
      case 6: {
        const i = PRISMS.findIndex((p, k) => s.prisms[k] !== p.solved);
        if (i < 0) return null;
        return { at: PRISMS[i].at, reach: 2.4, act: () => this.act(PRISMS[i].id), label: 'Aligning the prisms' };
      }
    }
    return null;
  }

  update(dt: number): void {
    const g = this.g;
    const mv = g.input.move();
    if (mv.x !== 0 || mv.y !== 0) {
      g.startAuto(false);
      return;
    }
    const inp = this.input;
    inp.x = 0;
    inp.y = 0;
    inp.jump = false;
    inp.sprint = false;
    inp.crouch = false;
    this.cooldown -= dt;
    const goal = this.goal();
    if (!goal) {
      this.label = 'Exploring';
      return;
    }
    this.label = goal.label;
    const p = g.player.pos;
    const dx = goal.at[0] - p.x;
    const dz = goal.at[1] - p.z;
    const d = Math.hypot(dx, dz);
    // creatures: resonate if a nearby one is ready
    const t = g.target;
    if (t?.kind === 'creature' && !t.creature.companion && canResonate(t.creature).ok && t.dist < 4 && this.cooldown <= 0) {
      this.cooldown = 3;
      g.doInteract();
      return;
    }
    if (d <= goal.reach) {
      // face the goal and act
      g.rig.yaw = Math.atan2(-dx, -dz);
      if (this.cooldown <= 0) {
        this.cooldown = 1.6;
        goal.act();
      }
      return;
    }
    // walk toward it, turning the camera to match
    const want = Math.atan2(-dx, -dz);
    let delta = want - g.rig.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    g.rig.yaw += delta * Math.min(1, dt * 4);
    inp.y = 1;
    inp.sprint = d > 12;
    // unstick: sidestep and hop when blocked
    this.stuckT += dt;
    if (this.strafe > 0) {
      this.strafe -= dt;
      inp.x = this.strafeDir;
      inp.y = 0.4;
    }
    if (this.stuckT > 1.2) {
      if (this.lastPos.distanceTo(p) < 0.6) {
        this.strafe = 1.1;
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        inp.jump = true;
      }
      this.lastPos.copy(p);
      this.stuckT = 0;
    }
  }
}
