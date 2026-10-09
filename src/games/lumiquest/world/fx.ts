// Short-lived effects from a fixed pool of sprites: fire, sparkles, rock
// debris, splashes, hearts and expanding rings. Abilities, bonding and
// pickups all use these so feedback is consistent and cheap.

import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  type Texture,
} from 'three';
import { heartSprite, softDot } from '../engine/textures';

interface Particle {
  sprite: Sprite;
  vel: Vector3;
  life: number;
  max: number;
  grow: number;
  gravity: number;
  fade: boolean;
}

interface Ring {
  mesh: Mesh;
  life: number;
  max: number;
  size: number;
}

export class Fx {
  readonly group = new Group();
  private pool: Particle[] = [];
  private rings: Ring[] = [];
  private next = 0;

  constructor(size = 260) {
    for (let i = 0; i < size; i++) {
      const s = new Sprite(new SpriteMaterial({ map: softDot(), transparent: true, depthWrite: false }));
      s.visible = false;
      this.group.add(s);
      this.pool.push({ sprite: s, vel: new Vector3(), life: 0, max: 1, grow: 0, gravity: 0, fade: true });
    }
    for (let i = 0; i < 6; i++) {
      const m = new Mesh(new TorusGeometry(1, 0.05, 6, 48), new MeshBasicMaterial({ color: '#bff4ff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
      m.rotation.x = Math.PI / 2;
      m.visible = false;
      this.group.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, size: 1 });
    }
  }

  private emit(p: Vector3, opts: { color: string; size: number; vel: Vector3; life: number; grow?: number; gravity?: number; additive?: boolean; map?: Texture }): void {
    const part = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    const mat = part.sprite.material as SpriteMaterial;
    mat.map = opts.map ?? softDot();
    mat.color = new Color(opts.color);
    mat.blending = opts.additive === false ? NormalBlending : AdditiveBlending;
    mat.opacity = 1;
    mat.needsUpdate = true;
    part.sprite.position.copy(p);
    part.sprite.scale.setScalar(opts.size);
    part.sprite.visible = true;
    part.vel.copy(opts.vel);
    part.life = opts.life;
    part.max = opts.life;
    part.grow = opts.grow ?? 0;
    part.gravity = opts.gravity ?? 0;
  }

  fire(at: Vector3, amount = 30, spread = 1): void {
    for (let i = 0; i < amount; i++) {
      const v = new Vector3((Math.random() - 0.5) * 1.5 * spread, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.5 * spread);
      const c = Math.random() < 0.3 ? '#ffe27a' : Math.random() < 0.6 ? '#ff8a2a' : '#ff4a1a';
      this.emit(at.clone().add(new Vector3((Math.random() - 0.5) * spread, Math.random() * 0.4, (Math.random() - 0.5) * spread)), { color: c, size: 0.5 + Math.random() * 0.6, vel: v, life: 0.6 + Math.random() * 0.6, grow: -0.4 });
    }
  }

  sparkle(at: Vector3, color = '#bff4ff', amount = 24, radius = 0.8): void {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new Vector3(Math.cos(a) * radius * 1.5, 0.5 + Math.random() * 2, Math.sin(a) * radius * 1.5);
      this.emit(at.clone(), { color, size: 0.18 + Math.random() * 0.22, vel: v, life: 0.8 + Math.random() * 0.8, gravity: -0.5 });
    }
  }

  debris(at: Vector3, amount = 26): void {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 4;
      this.emit(at.clone().add(new Vector3(0, 0.6, 0)), { color: Math.random() < 0.5 ? '#9a948a' : '#6f6a62', size: 0.25 + Math.random() * 0.35, vel: new Vector3(Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp), life: 1.2, gravity: 14, additive: false });
    }
    for (let i = 0; i < 14; i++) this.emit(at.clone(), { color: '#d8cfc0', size: 1.2, vel: new Vector3((Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2), life: 1.4, grow: 1.5, additive: false });
  }

  splash(at: Vector3, amount = 28): void {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.5;
      this.emit(at.clone(), { color: Math.random() < 0.5 ? '#bff0ff' : '#6fd0ff', size: 0.2 + Math.random() * 0.25, vel: new Vector3(Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp), life: 0.9, gravity: 12 });
    }
  }

  hearts(at: Vector3, n = 3): void {
    for (let i = 0; i < n; i++) {
      this.emit(at.clone().add(new Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), { color: '#ffffff', size: 0.35, vel: new Vector3((Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4), life: 1.4, additive: false, map: heartSprite() });
    }
  }

  ring(at: Vector3, color = '#bff4ff', size = 4, life = 0.9): void {
    const r = this.rings.find((x) => x.life <= 0) ?? this.rings[0];
    r.mesh.position.copy(at);
    (r.mesh.material as MeshBasicMaterial).color.set(color);
    r.life = life;
    r.max = life;
    r.size = size;
    r.mesh.visible = true;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      (p.sprite.material as SpriteMaterial).opacity = p.fade ? Math.min(1, k * 1.8) : 1;
      if (p.grow) p.sprite.scale.multiplyScalar(1 + p.grow * dt);
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.2 + k * r.size);
      (r.mesh.material as MeshBasicMaterial).opacity = (1 - k) * 0.9;
      if (r.life <= 0) r.mesh.visible = false;
    }
  }
}
