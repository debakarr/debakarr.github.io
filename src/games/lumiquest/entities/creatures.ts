// The creature population. Every wild individual is persistent (keyed by
// its spawn id); its model is only built when the player comes within the
// quality profile's creature range and is disposed when the player leaves.
// Distant creatures think less often. The active companion is a creature
// like any other, with the follow brain switched on.

import { Group, Vector3 } from 'three';
import { hashString, Rng } from '../../shared/rng';
import { SPECIES_BY_ID, type SpeciesId } from '../data/species';
import { OUTPOST, SPAWNS, type SpawnDef } from '../data/world';
import type { GameState, WildMemory } from '../systems/state';
import type { Terrain } from '../world/terrain';
import { Creature, type AiContext } from './creature';

export class Creatures {
  readonly group = new Group();
  readonly wild: Creature[] = [];
  companion: Creature | null = null;
  private frame = 0;

  constructor(private terrain: Terrain, private state: GameState) {
    for (const s of SPAWNS) {
      const mem = this.memory(s);
      if (mem.bonded) continue;
      const c = new Creature(s.id, s.species, mem.variant, [s.at[0], s.at[1]], s.roam, s.habitat, terrain);
      c.trust = mem.trust;
      c.observed = mem.observed;
      this.wild.push(c);
    }
  }

  /** Memory for a spawn, rolling its variant the first time it is met. */
  memory(s: SpawnDef): WildMemory {
    let m = this.state.wild[s.id];
    if (!m) {
      const def = SPECIES_BY_ID[s.species];
      let variant: string | null = s.variant ?? null;
      if (!variant) {
        const rng = new Rng(hashString(`${s.id}:variant:${this.state.createdAt}`));
        const v = def.variants.find((x) => x.rarity > 0 && rng.next() < 1 / x.rarity);
        variant = v?.id ?? null;
      }
      m = { trust: 0, observed: false, bonded: false, variant, fedAt: -999 };
      this.state.wild[s.id] = m;
    }
    return m;
  }

  spawnDef(id: string): SpawnDef | undefined {
    return SPAWNS.find((s) => s.id === id);
  }

  /** Is this wild creature around right now (night-only spawns etc.)? */
  present(c: Creature, night: boolean): boolean {
    const s = this.spawnDef(c.id);
    if (!s) return true;
    if (s.nightOnly && !night) return false;
    return true;
  }

  setCompanion(uid: string | null, out: boolean, near: Vector3): void {
    const cur = this.companion;
    if (cur && cur.bondUid === uid) {
      // same friend: walking away when dismissed, coming back when called
      if (out && cur.dismissed) cur.setMood('happy', 1.2);
      cur.dismissed = !out;
      return;
    }
    if (cur) {
      cur.dispose();
      this.companion = null;
    }
    const b = uid ? this.state.bonded.find((x) => x.uid === uid) : undefined;
    if (!b || !out) return;
    const c = new Creature(`companion:${b.uid}`, b.species, b.variant, [OUTPOST.at[0], OUTPOST.at[1]], 6, 'outpost', this.terrain);
    c.companion = true;
    c.bondUid = b.uid;
    c.trust = 100;
    c.pos.set(near.x + 1.5, this.terrain.height(near.x + 1.5, near.z + 1), near.z + 1);
    c.followTarget.copy(c.pos);
    c.show(this.group);
    c.setMood('happy', 1.2);
    this.companion = c;
  }

  /** Removes a wild creature that has just bonded with the player. */
  removeWild(c: Creature): void {
    const i = this.wild.indexOf(c);
    if (i >= 0) this.wild.splice(i, 1);
    c.dispose();
  }

  update(ctx: AiContext, range: number, playerYaw: number): void {
    this.frame++;
    const p = ctx.player.pos;
    for (const c of this.wild) {
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      const here = this.present(c, ctx.night);
      if (!here || d > range + 15) {
        if (c.visible) c.hide();
        if (!here) continue;
        // far away: a slow tick keeps routines going without a model
        if (this.frame % 30 === 0) c.update({ ...ctx, dt: ctx.dt * 30 });
        continue;
      }
      if (!c.visible && d < range) c.show(this.group);
      // think less often when far
      const skip = d < 45 ? 1 : d < 80 ? 3 : 6;
      if (this.frame % skip === 0) c.update({ ...ctx, dt: ctx.dt * skip });
      else if (c.model) c.model.animator.update(ctx.dt);
      // keep memory in sync for saving
      const mem = this.state.wild[c.id];
      if (mem) mem.trust = Math.round(c.trust * 10) / 10;
    }
    const comp = this.companion;
    if (comp) {
      // behind and to the right of the player
      const back = 1.7;
      const side = 1.1;
      comp.followTarget.set(p.x - Math.sin(playerYaw) * back + Math.cos(playerYaw) * side, 0, p.z - Math.cos(playerYaw) * back - Math.sin(playerYaw) * side);
      comp.update(ctx);
      if (comp.dismissed && comp.faded) {
        comp.dispose();
        this.companion = null;
      }
    }
  }

  /** Visible creatures (wild + companion) for targeting. */
  *visible(): Generator<Creature> {
    for (const c of this.wild) if (c.visible) yield c;
    if (this.companion && !this.companion.dismissed) yield this.companion;
  }

  bySpecies(species: SpeciesId): Creature[] {
    return this.wild.filter((c) => c.species === species);
  }

  dispose(): void {
    for (const c of this.wild) c.dispose();
    this.companion?.dispose();
  }
}
