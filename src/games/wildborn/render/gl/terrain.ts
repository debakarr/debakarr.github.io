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
import { Rng } from '../../../shared/rng';
import { T, type WorldMap } from '../../sim/world';
import { HEIGHT } from './stage';
import { GROUND_TEX_TILES, makeGroundTexture } from './textures';

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

/** One tile's corner colour, taken from the smooth world-scale field. */
function cornerColor(base: number, i: number, field: { dl: Float32Array; dh: Float32Array; ds: Float32Array }): Color {
  return C(base).offsetHSL(field.dh[i] * 0.03, field.ds[i] * 0.11, field.dl[i] * 0.06);
}

/** Rock and cliff faces: a cooler, darker stone. */
const CLIFF = C(0x6f6a60);

/** Terrain is split into chunks this many tiles across, so three can cull. */
const CHUNK = 14;

/**
 * A smooth noise field sampled at every tile CORNER of the map. Tiles take the
 * four corner values for their vertices, so neighbouring tiles share values
 * and the ground reads as one continuous surface instead of a patchwork of
 * flat-coloured squares.
 */
function cornerField(w: number, h: number): { dl: Float32Array; dh: Float32Array; ds: Float32Array } {
  const cw = w + 1;
  const ch = h + 1;
  const cell = 11;
  const gw = Math.ceil(cw / cell) + 2;
  const gh = Math.ceil(ch / cell) + 2;
  const rng = new Rng(w * 2246822519 + h * 3266489917);
  const cells = (): Float32Array => {
    const v = new Float32Array(gw * gh);
    for (let i = 0; i < v.length; i++) v[i] = rng.float(-1, 1);
    return v;
  };
  const l = cells();
  const hue = cells();
  const sat = cells();
  const at = (arr: Float32Array, x: number, y: number): number => {
    const fx = x / cell;
    const fy = y / cell;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = arr[y0 * gw + x0] * (1 - sx) + arr[y0 * gw + x0 + 1] * sx;
    const b = arr[(y0 + 1) * gw + x0] * (1 - sx) + arr[(y0 + 1) * gw + x0 + 1] * sx;
    return a * (1 - sy) + b * sy;
  };
  return {
    dl: Float32Array.from({ length: cw * ch }, (_, i) => at(l, i % cw, (i / cw) | 0)),
    dh: Float32Array.from({ length: cw * ch }, (_, i) => at(hue, i % cw, (i / cw) | 0)),
    ds: Float32Array.from({ length: cw * ch }, (_, i) => at(sat, i % cw, (i / cw) | 0)),
  };
}

const heightOf = (tile: number): number => HEIGHT[tile] ?? 0;

/** A growable vertex soup for flat-shaded quads. */
class Quads {
  private pos: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];

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
    this.uv.push(0, 0, 0, 0, 0, 0);
    for (let k = 0; k < 3; k++) this.col.push(c.r, c.g, c.b);
  }

  /**
   * Flat quad in the XZ plane at height `h`, spanning from (x, y) in tiles.
   * UVs are world-space so the ground texture tiles continuously across the
   * map instead of repeating once per tile.
   */
  tile(x: number, y: number, h: number, c: Color, corners?: [Color, Color, Color, Color]): void {
    const s = 1 / GROUND_TEX_TILES;
    // Vertex order below, with its uv: 0,1,2 then 0,2,3.
    const p = [
      [x, h, y, x * s, y * s],
      [x, h, y + 1, x * s, (y + 1) * s],
      [x + 1, h, y + 1, (x + 1) * s, (y + 1) * s],
      [x + 1, h, y, (x + 1) * s, y * s],
    ] as const;
    const cols = corners ?? [c, c, c, c];
    const order = [0, 1, 2, 0, 2, 3] as const;
    for (const i of order) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.uv.push(p[i][3], p[i][4]);
      this.col.push(cols[i].r, cols[i].g, cols[i].b);
    }
  }

  get count(): number {
    return this.pos.length / 3;
  }

  build(): BufferGeometry {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
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
  /** Grass grain for the ground, shared by every chunk. */
  private texture = makeGroundTexture(7);

  constructor(map: WorldMap) {
    // Ground, split into chunks so three can frustum-cull most of the map.
    const w = map.w;
    const h = map.h;
    const cols = Math.ceil(w / CHUNK);
    const rows = Math.ceil(h / CHUNK);
    const tileAt = (x: number, y: number): number =>
      x < 0 || y < 0 || x >= w || y >= h ? T.Mountain : map.tiles[y * w + x];
    const field = cornerField(w, h);
    this.material = new MeshLambertMaterial({ vertexColors: true, map: this.texture });

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
                        // Smooth world-scale variation, so the ground has regions of tone
            // the way real ground does, instead of a per-tile checkerboard.
            // Corner colours sampled from a smooth world-scale field, so
            // neighbouring tiles share corner values and the ground reads as
            // one continuous surface instead of a grid of flat squares.
            // Corner indices run one wider per row than tiles, so the stride
            // is (w + 1), not w.
            const vi = y * (w + 1) + x;
            const base = COLOR[t] ?? 0x4f9c5e;
            // Corners in tile()'s own order: (x,y), (x,y+1), (x+1,y+1), (x+1,y).
            const cc: [Color, Color, Color, Color] = [
              cornerColor(base, vi, field),
              cornerColor(base, vi + w + 1, field),
              cornerColor(base, vi + w + 2, field),
              cornerColor(base, vi + 1, field),
            ];
            q.tile(x, y, th, C(base), cc);
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
      this.lava = new Mesh(lq.build(), this.lavaMat);
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
    this.texture.dispose();
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