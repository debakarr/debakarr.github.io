// The player: a small low-poly figure assembled from primitives, with a walk
// cycle driven by how far it has actually moved, plus an idle sway so standing
// still is not frozen.

import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
} from 'three';

const SKIN = 0xf2d3b0;
const HAIR = 0x3b2b1f;
const SHIRT = 0x2f6bb0;
const SHIRT_LIT = 0x4b8ad4;
const PANTS = 0x243a5e;
const PACK = 0x8a5a34;

function mat(color: number): MeshLambertMaterial {
  return new MeshLambertMaterial({ color, flatShading: true });
}

export class Actor {
  readonly group = new Group();
  private legL: Mesh;
  private legR: Mesh;
  private armL: Mesh;
  private armR: Mesh;
  private torso: Mesh;
  private head: Group;
  private materials: MeshLambertMaterial[] = [];
  /** Smoothed facing, in radians around Y. */
  private yaw = 0;
  private phase = 0;
  private bob = 0;

  constructor() {
    const mk = (geo: BoxGeometry | CapsuleGeometry | ConeGeometry | CylinderGeometry | SphereGeometry, color: number): Mesh => {
      const m = new Mesh(geo, mat(color));
      m.castShadow = true;
      m.receiveShadow = false;
      this.materials.push(m.material as MeshLambertMaterial);
      return m;
    };

    this.legL = mk(new CapsuleGeometry(0.11, 0.42, 3, 6), PANTS);
    this.legR = mk(new CapsuleGeometry(0.11, 0.42, 3, 6), PANTS);
    this.legL.position.set(-0.13, 0.34, 0);
    this.legR.position.set(0.13, 0.34, 0);

    this.torso = mk(new BoxGeometry(0.42, 0.5, 0.26), SHIRT);
    this.torso.position.y = 0.86;
    // A lighter panel down one side reads as a lit face even in flat light.
    const panel = mk(new BoxGeometry(0.12, 0.46, 0.28), SHIRT_LIT);
    panel.position.set(-0.14, 0.86, 0.01);

    this.armL = mk(new CapsuleGeometry(0.075, 0.34, 3, 6), SHIRT);
    this.armR = mk(new CapsuleGeometry(0.075, 0.34, 3, 6), SHIRT);
    this.armL.position.set(-0.27, 0.86, 0);
    this.armR.position.set(0.27, 0.86, 0);

    const pack = mk(new BoxGeometry(0.26, 0.3, 0.14), PACK);
    pack.position.set(0, 0.88, -0.19);

    this.head = new Group();
    const skull = mk(new SphereGeometry(0.19, 12, 9), SKIN);
    const hair = mk(new SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), HAIR);
    hair.position.y = 0.015;
    // Eyes, so the figure has a facing direction.
    for (const sx of [-0.07, 0.07]) {
      const eye = mk(new SphereGeometry(0.028, 6, 5), 0x1a1a22);
      eye.position.set(sx, 0.01, 0.16);
      eye.castShadow = false;
      this.head.add(eye);
    }
    this.head.add(skull, hair);
    this.head.position.y = 1.24;

    this.group.add(this.legL, this.legR, this.torso, panel, this.armL, this.armR, pack, this.head);
  }

  /** Point the figure at a direction in tile space. */
  faceTowards(dx: number, dz: number, snap = false): void {
    if (dx === 0 && dz === 0) return;
    // Model faces +Z, so yaw is measured from +Z toward +X.
    const want = Math.atan2(dx, dz);
    if (snap) {
      this.yaw = want;
    } else {
      // Shortest way round.
      let diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.yaw += diff * 0.25;
    }
  }

  /** Turn to a compass direction name, for keyboard/D-pad walking. */
  faceDir(dir: string): void {
    const map: Record<string, [number, number]> = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };
    const d = map[dir];
    if (d) this.faceTowards(d[0], d[1]);
  }

  /**
   * Animate from the distance walked this frame. `moved` in world units; the
   * stride length is tuned so a normal walk cycles about once per tile.
   */
  update(dt: number, moved: number, groundY: number): void {
    this.phase += moved * 3.4;
    const swing = Math.min(1, moved * 26);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    this.legL.rotation.x = s * 0.85 * swing;
    this.legR.rotation.x = -s * 0.85 * swing;
    this.armL.rotation.x = -s * 0.6 * swing;
    this.armR.rotation.x = s * 0.6 * swing;
    // Idle: a slow breath and a slight sway so the figure is never rigid.
    const idle = 1 - swing;
    this.bob += dt * 2.4;
    const breathe = Math.sin(this.bob) * 0.012 * idle;
    this.group.position.y = groundY + Math.abs(c) * 0.035 * swing + breathe;
    this.torso.rotation.z = Math.sin(this.bob * 0.5) * 0.02 * idle;
    this.head.rotation.y = Math.sin(this.bob * 0.7) * 0.12 * idle;
    this.group.rotation.y = this.yaw;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}