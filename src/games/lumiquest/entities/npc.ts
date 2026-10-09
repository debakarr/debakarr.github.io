// Villagers: the same modular character as the player, standing at their
// posts, idling, turning to face you when you come close and gesturing while
// you talk. Each has a floating name tag and a collider.

import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, type Object3D } from 'three';
import { NPC_LOOKS } from '../data/characters';
import { NPCS, type NpcDef } from '../data/world';
import type { CollisionWorld } from '../engine/physics';
import { canvas } from '../engine/textures';
import type { Terrain } from '../world/terrain';
import { CharacterModel } from './character';

function nameTag(name: string, role: string): Sprite {
  const [c, ctx] = canvas(512, 128);
  ctx.fillStyle = 'rgba(14,22,40,0.78)';
  const w = 380;
  const x = (512 - w) / 2;
  ctx.beginPath();
  ctx.roundRect(x, 18, w, 92, 30);
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,195,90,0.8)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9b0';
  ctx.font = '700 44px Nunito, system-ui, sans-serif';
  ctx.fillText(name, 256, 64);
  ctx.fillStyle = '#bcd0f0';
  ctx.font = '600 26px Nunito, system-ui, sans-serif';
  ctx.fillText(role, 256, 96);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}

export class Npc {
  readonly model: CharacterModel;
  readonly pos = new Vector3();
  private baseYaw: number;
  private tag: Sprite;
  talking = false;

  constructor(readonly def: NpcDef, terrain: Terrain, physics: CollisionWorld, parent: Object3D) {
    const look = NPC_LOOKS[def.id];
    this.model = new CharacterModel({ name: def.name, preset: def.id, ...structuredClone(look) });
    this.pos.set(def.at[0], terrain.height(def.at[0], def.at[1]), def.at[1]);
    this.baseYaw = def.facing;
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = def.facing;
    this.tag = nameTag(def.name, def.role);
    this.tag.position.set(0, 1.85, 0);
    this.model.root.add(this.tag);
    parent.add(this.model.root);
    physics.add({ kind: 'cyl', x: this.pos.x, z: this.pos.z, r: 0.38, y0: this.pos.y - 1, y1: this.pos.y + 1.5, walkable: false, id: `npc-${def.id}` });
    // stagger idle cycles so the village does not move in lockstep
    this.model.update(Math.random() * 3);
  }

  update(dt: number, player: Vector3): void {
    const d = Math.hypot(player.x - this.pos.x, player.z - this.pos.z);
    const want = d < 6 || this.talking ? Math.atan2(player.x - this.pos.x, player.z - this.pos.z) : this.baseYaw;
    let delta = want - this.model.root.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.model.root.rotation.y += delta * Math.min(1, dt * 4);
    this.model.animator.play(this.talking ? 'talk' : d < 4 && this.def.id === 'nia' ? 'wave' : 'idle', 0.3);
    this.tag.visible = d < 14;
    this.model.update(dt);
  }

  dispose(): void {
    this.model.dispose();
  }
}

export function buildNpcs(terrain: Terrain, physics: CollisionWorld, parent: Object3D): Npc[] {
  return NPCS.map((d) => new Npc(d, terrain, physics, parent));
}
