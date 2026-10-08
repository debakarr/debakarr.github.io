// Everything that stands on the ground: trees, rocks, crystal formations,
// mountains, pillars, village houses, reeds and the pickups/markers.
//
// One InstancedMesh per kind, refilled when the player moves a tile, so a
// phone never has to draw the whole map. Geometry for each kind is merged once
// from primitives, with baked vertex colours, so there are no textures to load.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  MeshLambertMaterial,
  type MeshLambertMaterialParameters,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import { hashString } from '../../../shared/rng';
import { T, type WorldMap } from '../../sim/world';
import { heightOf } from './stage';

interface Part {
  geo: BufferGeometry;
  color: number;
  y?: number;
}

interface KindSpec {
  geometry: BufferGeometry;
  material: MeshLambertMaterial;
  /** Sway amount in radians at the top of the sway cycle. */
  sway: number;
  shadow: boolean;
}

/**
 * Merge primitives into one geometry with baked vertex colours. Our parts are
 * small and few, so doing it directly beats pulling in another helper.
 */
function merge(parts: Part[]): BufferGeometry {
  const sources = parts.map(({ geo, color, y = 0 }) => {
    const g = geo.clone();
    g.translate(0, y, 0);
    const pos = g.getAttribute('position');
    const c = new Color(color);
    const out = new Float32Array(pos.count * 3);
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y;
      out[i * 3 + 2] = v.z;
    }
    g.dispose();
    return { pos: out, c, n: pos.count };
  });
  let total = 0;
  for (const s of sources) total += s.n;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let k = 0;
  for (const s of sources) {
    pos.set(s.pos, k * 3);
    for (let i = 0; i < s.n; i++) {
      col[(k + i) * 3] = s.c.r;
      col[(k + i) * 3 + 1] = s.c.g;
      col[(k + i) * 3 + 2] = s.c.b;
    }
    k += s.n;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('color', new BufferAttribute(col, 3));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

/**
 * Foliage and props use Lambert, not PBR: with flat shading and baked vertex
 * colours the look is the same, and Lambert is markedly cheaper per fragment,
 * which matters when a forest is 30k triangles of instanced cones.
 */
const matte = (extra: Partial<MeshLambertMaterialParameters> = {}): MeshLambertMaterial =>
  new MeshLambertMaterial({ vertexColors: true, flatShading: true, ...extra });

/** Props that come from the terrain itself. Cones are open-ended: the bases are
 *  never seen, and skipping them roughly halves the triangle count. */
const SPECS: Record<string, KindSpec> = {
  tree: {
    geometry: merge([
      { geo: new CylinderGeometry(0.13, 0.19, 1.5, 5, 1, true), color: 0x5c4130, y: 0.75 },
      { geo: new ConeGeometry(1.0, 1.5, 6, 1, true), color: 0x2f6b41, y: 1.95 },
      { geo: new ConeGeometry(0.76, 1.25, 6, 1, true), color: 0x3b7f4e, y: 2.85 },
      { geo: new ConeGeometry(0.48, 0.95, 6, 1, true), color: 0x4a9c60, y: 3.6 },
    ]),
    material: matte(),
    sway: 0.045,
    shadow: true,
  },
  pine: {
    geometry: merge([
      { geo: new CylinderGeometry(0.11, 0.17, 1.2, 5, 1, true), color: 0x4a3324, y: 0.6 },
      { geo: new ConeGeometry(0.88, 1.6, 6, 1, true), color: 0x25553a, y: 1.7 },
      { geo: new ConeGeometry(0.64, 1.4, 6, 1, true), color: 0x2e6b47, y: 2.8 },
    ]),
    material: matte(),
    sway: 0.035,
    shadow: true,
  },
  bush: {
    geometry: merge([
      { geo: new IcosahedronGeometry(0.42, 0), color: 0x3f8c58, y: 0.3 },
      { geo: new IcosahedronGeometry(0.3, 0), color: 0x4fa368, y: 0.46 },
    ]),
    material: matte(),
    sway: 0.025,
    shadow: false,
  },
  reed: {
    geometry: merge([
      { geo: new CylinderGeometry(0.03, 0.05, 1.15, 4), color: 0x5d8a3c, y: 0.57 },
      { geo: new CylinderGeometry(0.03, 0.04, 0.9, 4), color: 0x6f9c46, y: 0.45 },
    ]),
    material: matte(),
    sway: 0.11,
    shadow: false,
  },
  rock: {
    geometry: merge([{ geo: new DodecahedronGeometry(0.44, 0), color: 0x8d8779, y: 0.3 }]),
    material: matte(),
    sway: 0,
    shadow: true,
  },
  crystal: {
    geometry: merge([
      { geo: new ConeGeometry(0.3, 1.5, 5), color: 0xc9a8ff, y: 0.75 },
      { geo: new ConeGeometry(0.22, 1.1, 5), color: 0x8f6bd0, y: 0.55 },
    ]),
    material: matte({ emissive: new Color(0x2a1a44) }),
    sway: 0,
    shadow: true,
  },
  pillar: {
    geometry: merge([
      { geo: new CylinderGeometry(0.28, 0.32, 2.2, 8), color: 0xb8ab90, y: 1.1 },
      { geo: new BoxGeometry(0.78, 0.18, 0.78), color: 0xc8bca2, y: 2.28 },
    ]),
    material: matte(),
    sway: 0,
    shadow: true,
  },
  mountain: {
    geometry: merge([
      { geo: new ConeGeometry(1.5, 2.6, 6, 1, true), color: 0x6f6f79, y: 1.3 },
      { geo: new ConeGeometry(0.62, 0.7, 6, 1, true), color: 0xd9dee6, y: 2.6 },
    ]),
    material: matte(),
    sway: 0,
    shadow: true,
  },
  house: {
    geometry: merge([
      { geo: new BoxGeometry(1.5, 1.1, 1.5), color: 0xb08f68, y: 0.55 },
      { geo: new ConeGeometry(1.42, 1.0, 4, 1, false), color: 0xa34a3c, y: 1.6 },
    ]),
    material: matte(),
    sway: 0,
    shadow: true,
  },
};

/** Pickups and village markers, keyed by feature kind. */
const FEATURE_SPECS: Record<string, KindSpec> = {
  berry: {
    geometry: merge([
      { geo: new SphereGeometry(0.22, 8, 6), color: 0xd9534f, y: 0.42 },
      { geo: new CylinderGeometry(0.04, 0.05, 0.4, 5), color: 0x3f7a4a, y: 0.2 },
    ]),
    material: matte(),
    sway: 0.05,
    shadow: false,
  },
  moonfruit: {
    geometry: merge([
      { geo: new SphereGeometry(0.24, 8, 6), color: 0xcfe3ff, y: 0.46 },
      { geo: new SphereGeometry(0.1, 6, 5), color: 0x9fc0ff, y: 0.62 },
    ]),
    material: matte({ emissive: new Color(0x1c2c4a) }),
    sway: 0.05,
    shadow: false,
  },
  seed: {
    geometry: merge([
      { geo: new SphereGeometry(0.14, 6, 5), color: 0xe0cf9a, y: 0.22 },
      { geo: new CylinderGeometry(0.03, 0.04, 0.3, 4), color: 0x7fa85a, y: 0.12 },
    ]),
    material: matte(),
    sway: 0.04,
    shadow: false,
  },
  reed: {
    geometry: merge([{ geo: new CylinderGeometry(0.09, 0.11, 0.8, 6), color: 0x7fab58, y: 0.4 }]),
    material: matte(),
    sway: 0.09,
    shadow: false,
  },
  pepper: {
    geometry: merge([
      { geo: new ConeGeometry(0.16, 0.42, 6), color: 0xff7a45, y: 0.46 },
      { geo: new CylinderGeometry(0.04, 0.05, 0.3, 5), color: 0x4f8a3c, y: 0.16 },
    ]),
    material: matte(),
    sway: 0.05,
    shadow: false,
  },
  crystal: {
    geometry: merge([{ geo: new ConeGeometry(0.18, 0.7, 5), color: 0xb48ae8, y: 0.35 }]),
    material: matte({ emissive: new Color(0x241640) }),
    sway: 0,
    shadow: false,
  },
  ore: {
    geometry: merge([{ geo: new DodecahedronGeometry(0.26, 0), color: 0x9aa0a6, y: 0.22 }]),
    material: matte({ emissive: new Color(0x1b2026) }),
    sway: 0,
    shadow: false,
  },
  fragment: {
    geometry: merge([{ geo: new BoxGeometry(0.42, 0.5, 0.2), color: 0xe8d8a8, y: 0.4 }]),
    material: matte({ emissive: new Color(0x3a3016) }),
    sway: 0.03,
    shadow: false,
  },
  lantern: {
    geometry: merge([
      { geo: new CylinderGeometry(0.05, 0.06, 1.7, 5), color: 0x3a2f26, y: 0.85 },
      { geo: new SphereGeometry(0.16, 8, 6), color: 0xffd28a, y: 1.8 },
    ]),
    material: matte({ emissive: new Color(0xffb45c) }),
    sway: 0,
    shadow: false,
  },
  home: {
    geometry: merge([
      { geo: new BoxGeometry(2.2, 1.4, 2.2), color: 0xb08f68, y: 0.7 },
      { geo: new ConeGeometry(1.95, 1.15, 4, 1, false), color: 0xa34a3c, y: 1.9 },
      { geo: new BoxGeometry(0.4, 0.7, 0.1), color: 0x5c4130, y: 0.35 },
    ]),
    material: matte(),
    sway: 0,
    shadow: true,
  },
  researcher: {
    geometry: merge([
      { geo: new CylinderGeometry(0.2, 0.24, 0.9, 6), color: 0x3f5f9f, y: 0.45 },
      { geo: new SphereGeometry(0.19, 8, 6), color: 0xf2d3b0, y: 1.05 },
      { geo: new SphereGeometry(0.2, 8, 5), color: 0xe8e2d0, y: 1.12 },
    ]),
    material: matte(),
    sway: 0,
    shadow: true,
  },
};

/** Feature kinds that are permanent markers rather than collectable items. */
export const MARKERS = new Set(['lantern', 'home', 'researcher']);

/** How far from the player props are drawn, in tiles. Aligned with the fog. */
const VIEW = 32;
/** Per-kind cap, so a dense forest cannot blow past a phone's limits. */
const MAX_PER_KIND = 420;

/** Prop view distances per quality level; the view picks one at runtime. */
export const PROP_VIEW = [16, 22, 28, 32];

export class Props {
  readonly group = new Group();
  private kinds = new Map<string, InstancedMesh>();
  private counts = new Map<string, number>();
  private lastX = -9999;
  private lastY = -9999;
  private dummy = new Object3D();
  private tint = new Color();
  /** How far out props are placed; lowered by the quality controller. */
  private view = VIEW;

  constructor(private map: WorldMap) {
    for (const [name, spec] of Object.entries({ ...SPECS, ...FEATURE_SPECS })) {
      const mesh = new InstancedMesh(spec.geometry, spec.material, MAX_PER_KIND);
      mesh.castShadow = spec.shadow;
      mesh.receiveShadow = false;
      mesh.count = 0;
      // The visible set is already bounded, so skip three's per-mesh culling.
      mesh.frustumCulled = false;
      this.kinds.set(name, mesh);
      this.group.add(mesh);
    }
  }

  /** Change how far props are drawn, forcing a refill on the next rebuild. */
  setView(tiles: number): void {
    if (tiles === this.view) return;
    this.view = tiles;
    this.lastX = -9999;
    this.lastY = -9999;
  }

  /**
   * Refill the instance buffers for what is near the player. Only runs once the
   * player has actually moved a tile, so walking is not re-scanning the map.
   */
  rebuild(px: number, py: number, picked: Record<string, number>, day: number): void {
    if (Math.abs(px - this.lastX) < 1 && Math.abs(py - this.lastY) < 1) return;
    this.lastX = px;
    this.lastY = py;
    const { w, h } = this.map;
    for (const mesh of this.kinds.values()) mesh.count = 0;
    for (const key of this.counts.keys()) this.counts.set(key, 0);

    const place = (kind: string, x: number, y: number, scale: number, yaw: number): void => {
      const mesh = this.kinds.get(kind);
      if (!mesh) return;
      const n = this.counts.get(kind) ?? 0;
      if (n >= MAX_PER_KIND) return;
      const d = this.dummy;
      d.position.set(x, heightOf(this.map.tiles[y * w + x]), y);
      d.rotation.set(0, yaw, 0);
      d.scale.setScalar(scale);
      d.updateMatrix();
      mesh.setMatrixAt(n, d.matrix);
      // A little per-instance brightness keeps a forest from cloning itself.
      const j = 1 + (((hashString(`${kind}:${x}:${y}`) % 13) - 6) / 90);
      this.tint.setRGB(j, j, j);
      mesh.setColorAt(n, this.tint);
      this.counts.set(kind, n + 1);
    };

    const x0 = Math.max(0, Math.floor(px - this.view));
    const x1 = Math.min(w - 1, Math.ceil(px + this.view));
    const y0 = Math.max(0, Math.floor(py - this.view));
    const y1 = Math.min(h - 1, Math.ceil(py + this.view));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = this.map.tiles[y * w + x];
        const r = hashString(`${x}:${y}`);
        const yaw = ((r % 628) / 100) % (Math.PI * 2);
        switch (t) {
          case T.Tree:
            place(r % 3 === 0 ? 'pine' : 'tree', x, y, 0.82 + (r % 40) / 100, yaw);
            break;
          case T.Rock:
            if (r % 4 !== 0) place('rock', x, y, 0.55 + (r % 50) / 70, yaw);
            break;
          case T.Mountain:
            place('mountain', x, y, 0.85 + (r % 40) / 90, yaw);
            break;
          case T.Crystal:
            place('crystal', x, y, 0.7 + (r % 45) / 90, yaw);
            break;
          case T.Pillar:
            place('pillar', x, y, 0.9 + (r % 25) / 100, yaw);
            break;
          case T.Wall:
            place('house', x, y, 0.9 + (r % 30) / 120, yaw + Math.PI / 4);
            break;
          case T.Tall:
            if (r % 8 === 0) place('bush', x, y, 0.65, yaw);
            break;
          case T.Reed:
            place('reed', x, y, 0.8 + (r % 40) / 90, yaw);
            break;
          case T.Flower:
            if (r % 2 === 0) place('bush', x, y, 0.42, yaw);
            break;
          default:
            break;
        }
      }
    }

    // Pickups, lanterns, the home and the researcher. A pickup collected today
    // stays hidden; markers never go away.
    for (const [idx, f] of this.map.features.entries()) {
      if (f.x < x0 - 2 || f.x > x1 + 2 || f.y < y0 - 2 || f.y > y1 + 2) continue;
      if (!(f.kind in FEATURE_SPECS)) continue;
      if (!MARKERS.has(f.kind)) {
        const day0 = picked[String(idx)];
        if (day0 !== undefined && day - day0 < 2) continue;
      }
      place(f.kind, f.x, f.y, 1, ((hashString(`${f.x}:${f.y}`) % 628) / 100) % (Math.PI * 2));
    }

    for (const [name, mesh] of this.kinds) {
      mesh.count = this.counts.get(name) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.kinds.values()) {
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
    this.kinds.clear();
  }
}