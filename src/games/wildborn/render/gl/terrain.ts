// The overworld as static meshes: a flat-topped quad per tile at that tile's
// height, with cliff walls wherever a neighbour sits lower, plus translucent
// water and glowing lava surfaces on top. Built once per world, then reused.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  ShaderMaterial,
  UniformsUtils,
} from 'three';
import { hashString } from '../../../shared/rng';
import { T, type WorldMap } from '../../sim/world';
import { HEIGHT } from './stage';

const C = (hex: number) => new Color(hex);

/** Ground colour per tile. */
const COLOR: Record<number, number> = {
  [T.Grass]: 0x4f9c5e,
  [T.Tall]: 0x468f52,
  [T.Path]: 0xd8bf89,
  [T.Tree]: 0x3a7c4c,
  [T.Water]: 0x3d7cbd,
  [T.DeepWater]: 0x2b5c93,
  [T.Rock]: 0x8c867a,
  [T.Mountain]: 0x6f6f79,
  [T.Ash]: 0x6d5d53,
  [T.Lava]: 0xc9422a,
  [T.Crystal]: 0xb48ae8,
  [T.CaveFloor]: 0x5d5673,
  [T.RuinFloor]: 0x8b8579,
  [T.Pillar]: 0xab9d83,
  [T.Floor]: 0xcdba95,
  [T.Wall]: 0x7d5f42,
  [T.Reed]: 0x7fab58,
  [T.Flower]: 0x5ea46a,
  [T.Sand]: 0xe2d19c,
};

/** Ground and cliff faces: a cooler, darker stone. */
const CLIFF = C(0x6f6a60);

/** Terrain is split into chunks this many tiles across, so three can cull. */
const CHUNK = 14;

const heightOf = (tile: number): number => HEIGHT[tile] ?? 0;

/** A growable vertex soup for flat-shaded quads. */
class Quads {
  private pos: number[] = [];
  private col: number[] = [];

  /** One quad, wound counter-clockwise seen from the front. */
  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    c: Color,
  ): void {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, c);
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, c);
  }

  tri(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    c: Color,
  ): void {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let k = 0; k < 3; k++) this.col.push(c.r, c.g, c.b);
  }

  /** Flat quad in the XZ plane at height `h`, spanning from (x, y) in tiles. */
  tile(x: number, y: number, h: number, c: Color): void {
    this.quad(x, h, y, x, h, y + 1, x + 1, h, y + 1, x + 1, h, y, c);
  }

  get count(): number {
    return this.pos.length / 3;
  }

  build(colors = true): BufferGeometry {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    if (colors) geo.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
}

export class Terrain {
  readonly group = new Group();
  private chunks: Mesh[] = [];
  private material: MeshLambertMaterial;
  private water: Mesh | null = null;
  private waterMat: ShaderMaterial | null = null;
  private lava: Mesh | null = null;
  private lavaMat: MeshBasicMaterial | null = null;

  constructor(map: WorldMap) {
    // Ground, split into chunks so three can frustum-cull most of the map.
    const w = map.w;
    const h = map.h;
    const cols = Math.ceil(w / CHUNK);
    const rows = Math.ceil(h / CHUNK);
    const tileAt = (x: number, y: number): number =>
      x < 0 || y < 0 || x >= w || y >= h ? T.Mountain : map.tiles[y * w + x];
    this.material = new MeshLambertMaterial({ vertexColors: true });

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const q = new Quads();
        const x0 = cx * CHUNK;
        const y0 = cy * CHUNK;
        const x1 = Math.min(w, x0 + CHUNK);
        const y1 = Math.min(h, y0 + CHUNK);
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const t = map.tiles[y * w + x];
            const th = heightOf(t);
            // Steep ground takes the jitter harder, flat ground barely at all.
            const jitter = (((hashString(`${x}:${y}`) % 11) - 5) / 220) * (th > 0.1 ? 1.4 : 0.4);
            const top = C(COLOR[t] ?? 0x4f9c5e).offsetHSL(0, 0, jitter);
            q.tile(x, y, th, top);
            // Cliff walls toward any lower neighbour, wound to face outward.
            const wall = (nx: number, nz: number, ax: number, az: number, bx: number, bz: number): void => {
              const nh = heightOf(tileAt(x + nx, y + nz));
              if (nh >= th - 0.001) return;
              const depth = th - nh;
              const c = CLIFF.clone().offsetHSL(0, 0, -Math.min(0.13, depth * 0.07));
              q.quad(ax, th, az, bx, th, bz, bx, nh, bz, ax, nh, az, c);
            };
            wall(0, -1, x + 1, y, x, y); // north face
            wall(0, 1, x, y + 1, x + 1, y + 1); // south face
            wall(-1, 0, x, y, x, y + 1); // west face
            wall(1, 0, x + 1, y + 1, x + 1, y); // east face
          }
        }
        if (q.count === 0) continue;
        const mesh = new Mesh(q.build(), this.material);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.chunks.push(mesh);
        this.group.add(mesh);
      }
    }

    // Water: one quad per water tile, a little above the ground under it.
    const wq = new Quads();
    let waterTiles = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = map.tiles[y * w + x];
        if (t !== T.Water && t !== T.DeepWater) continue;
        const deep = t === T.DeepWater;
        wq.tile(x, y, heightOf(t) + 0.035, C(deep ? 0x14324f : 0x2a6ea8));
        waterTiles++;
      }
    }
    if (waterTiles > 0) {
      this.waterMat = makeWaterMaterial();
      this.water = new Mesh(wq.build(), this.waterMat);
      this.water.renderOrder = 1;
      this.group.add(this.water);
    }

    // Lava: emissive, so it glows on its own at night.
    const lq = new Quads();
    let lavaTiles = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (map.tiles[y * w + x] !== T.Lava) continue;
        lq.tile(x, y, heightOf(T.Lava) + 0.04, C(0xffffff));
        lavaTiles++;
      }
    }
    if (lavaTiles > 0) {
      this.lavaMat = new MeshBasicMaterial({ color: 0xff7a30, toneMapped: false });
      this.lava = new Mesh(lq.build(false), this.lavaMat);
      this.group.add(this.lava);
    }
  }

  /** Advance the water and lava animation. */
  update(now: number, night: boolean): void {
    if (this.waterMat) {
      this.waterMat.uniforms.time.value = now / 1000;
      this.waterMat.uniforms.night.value = night ? 1 : 0;
    }
    if (this.lavaMat) {
      const pulse = 0.72 + 0.28 * Math.sin(now / 700);
      this.lavaMat.color.setRGB(1 * pulse, 0.42 * pulse + 0.12, 0.14 * pulse);
    }
  }

  dispose(): void {
    for (const chunk of this.chunks) chunk.geometry.dispose();
    this.material.dispose();
    this.water?.geometry.dispose();
    this.waterMat?.dispose();
    this.lava?.geometry.dispose();
    this.lavaMat?.dispose();
  }
}

/**
 * Water: two crossing wave trains for the surface, a depth tint, a sun
 * glint and a fresnel rim, so rivers read as water rather than blue tiles.
 */
function makeWaterMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: UniformsUtils.merge([
      { time: { value: 0 } },
      { night: { value: 0 } },
    ]),
    vertexShader: `
      uniform float time;
      attribute vec3 color;
      varying vec2 vXZ;
      varying float vWave;
      varying vec3 vTint;
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.7 + time * 1.3) * 0.022 + sin(p.z * 0.9 - time * 0.9) * 0.018;
        p.y += w;
        vXZ = p.xz;
        vWave = w;
        vTint = color.rgb;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float night;
      varying vec2 vXZ;
      varying float vWave;
      varying vec3 vTint;
      void main() {
        // vTint carries the depth baked per tile: pale shallows, dark depths.
        float crest = sin(vXZ.x * 2.1 + time * 2.0) * sin(vXZ.y * 1.7 - time * 1.4);
        vec3 base = vTint;
        base += vec3(0.10, 0.14, 0.16) * max(0.0, crest) * 0.7;
        // A moving glint band, brighter by day.
        float glint = pow(max(0.0, sin(vXZ.x * 0.9 + time * 0.7) * sin(vXZ.y * 1.3 - time * 0.5)), 8.0);
        base += glint * mix(0.55, 0.12, night);
        float alpha = mix(0.76, 0.9, clamp(-vWave * 12.0, 0.0, 1.0));
        gl_FragColor = vec4(base, alpha);
      }
    `,
  });
}

/** Ground height at a world position, for the camera and the player. */
export function groundAt(map: WorldMap, x: number, z: number): number {
  const tx = Math.max(0, Math.min(map.w - 1, Math.floor(x)));
  const tz = Math.max(0, Math.min(map.h - 1, Math.floor(z)));
  return heightOf(map.tiles[tz * map.w + tx]);
}