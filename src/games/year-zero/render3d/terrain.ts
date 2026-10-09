// Terrain: every land (and ice) tile is a softly bevelled hex with a
// subdivided top that carries hills, dunes and biome colour. Tiles are merged
// into chunk meshes; per-tile state (fog, territory, highlights) lives in a
// small data texture the shaders read, so overlays never rebuild geometry.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  type IUniform,
} from 'three';
import { T } from '../data/terrain';
import type { Game } from '../sim/game';
import type { Overlay } from '../render/view';
import { HEX_GLSL } from './hexgl';
import { BEVEL, BIOME, CORNER, ICE_Y, LAND_Y, TOP_R, type Shape } from './shape';

export interface SharedUniforms {
  uTiles: IUniform<DataTexture>;
  uOwners: IUniform<DataTexture>;
  uMap: IUniform<Vector2>;
  uTime: IUniform<number>;
  uGrid: IUniform<number>;
  uFogDim: IUniform<number>;
  [k: string]: IUniform;
}

export const FLAG = { explored: 1, visible: 2, reach: 4, attack: 8, path: 16, hover: 32, selected: 64, pending: 128 } as const;

/** Per-tile state texture shared by all map shaders. */
export class TileState {
  readonly tex: DataTexture;
  readonly owners: DataTexture;
  readonly data: Uint8Array;
  private ownerData = new Uint8Array(256 * 4);
  readonly uniforms: SharedUniforms;
  private w: number;
  private h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
    this.tex = new DataTexture(this.data, w, h, RGBAFormat, UnsignedByteType);
    this.tex.magFilter = NearestFilter;
    this.tex.minFilter = NearestFilter;
    this.tex.needsUpdate = true;
    this.owners = new DataTexture(this.ownerData, 256, 1, RGBAFormat, UnsignedByteType);
    this.owners.magFilter = NearestFilter;
    this.owners.minFilter = NearestFilter;
    this.owners.needsUpdate = true;
    this.uniforms = {
      uTiles: { value: this.tex },
      uOwners: { value: this.owners },
      uMap: { value: new Vector2(w, h) },
      uTime: { value: 0 },
      uGrid: { value: 0.3 },
      uFogDim: { value: 1 },
    };
  }

  /** Rewrites the whole texture (a few thousand texels: cheap). */
  update(g: Game, o: Overlay, reveal = false): void {
    const map = g.s.map;
    const grid = g.grid;
    const p = g.player;
    const d = this.data;
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      let f = 0;
      if (reveal || p.explored[i]) f |= FLAG.explored;
      if (reveal || p.visible[i]) f |= FLAG.visible;
      const own = map.owner[i];
      let mask = 0;
      if (own >= 0 && (f & FLAG.explored)) {
        for (let k = 0; k < 6; k++) {
          const nb = grid.neighbor(i, k);
          if (nb < 0 || map.owner[nb] !== own) mask |= 1 << k;
        }
      }
      const t = map.terrain[i];
      const cls = t === T.Ocean ? 1 : t === T.Coast ? 2 : t === T.Lake ? 3 : 0;
      d[i * 4] = f;
      d[i * 4 + 1] = own >= 0 && (f & FLAG.explored) ? own + 1 : 0;
      d[i * 4 + 2] = mask;
      d[i * 4 + 3] = cls;
    }
    const mark = (t: number, bit: number) => {
      if (t >= 0 && t < n) d[t * 4] |= bit;
    };
    if (o.reach) for (const t of o.reach.keys()) mark(t, FLAG.reach);
    if (o.attack) for (const t of o.attack) mark(t, FLAG.attack);
    if (o.path) for (const t of o.path) mark(t, FLAG.path);
    mark(o.hoverTile, FLAG.hover);
    mark(o.selectedTile, FLAG.selected);
    this.tex.needsUpdate = true;
    const c = new Color();
    for (const civ of g.s.civs) {
      if (civ.id + 1 >= 256) continue;
      c.set(civ.color);
      const k = (civ.id + 1) * 4;
      // stored linear, as the shaders work in linear light
      this.ownerData[k] = Math.round(c.r * 255);
      this.ownerData[k + 1] = Math.round(c.g * 255);
      this.ownerData[k + 2] = Math.round(c.b * 255);
      this.ownerData[k + 3] = 255;
    }
    this.owners.needsUpdate = true;
  }

  markPending(tile: number): void {
    if (tile < 0) return;
    this.data[tile * 4] |= FLAG.pending;
    this.tex.needsUpdate = true;
  }
}

/** Adds the shared hex GLSL and uniforms to a built-in material. */
export function hexPatch(mat: MeshStandardMaterial, uniforms: SharedUniforms, vertex: { head?: string; begin?: string; team?: boolean | 'skin' }, fragment: { head?: string; color?: string; out?: string }): void {
  // three caches programs by onBeforeCompile's source, which is the same for every patch: key each one by its content
  const key = patchKey(JSON.stringify([vertex, fragment]));
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `${HEX_GLSL}\n${vertex.head ?? ''}\n${shader.vertexShader}`;
    if (vertex.begin) shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertex.begin}`);
    // Owner colour: the per-instance colour only tints vertices marked `team`.
    if (vertex.team) {
      const skin = vertex.team === 'skin';
      shader.vertexShader = `attribute float team;\n${skin ? 'attribute vec3 aSkin;\n' : ''}${shader.vertexShader}`.replace('#include <color_vertex>', `
        vColor = vec4(1.0);
        vColor.xyz *= color.xyz;
        #ifdef USE_INSTANCING_COLOR
          ${skin ? 'if (team > 1.5) vColor.xyz *= aSkin; else' : ''}
          vColor.xyz = mix(vColor.xyz, vColor.xyz * instanceColor.xyz, clamp(team, 0.0, 1.0));
        #endif`);
    }
    shader.fragmentShader = `${HEX_GLSL}\n${fragment.head ?? ''}\n${shader.fragmentShader}`;
    if (fragment.color) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${fragment.color}`);
    if (fragment.out) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${fragment.out}`);
  };
}

const SKIRT_Y = -0.4;
const CHUNK = 12;

class Buf {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  tile: number[] = [];
  loc: number[] = [];
  kind: number[] = [];
  idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  v(x: number, y: number, z: number, n: [number, number, number], c: Color, tile: number, lx: number, lz: number, kind: number): number {
    this.pos.push(x, y, z);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c.r, c.g, c.b);
    this.tile.push(tile);
    this.loc.push(lx, lz);
    this.kind.push(kind);
    return this.count - 1;
  }

  /** Triangle, wound so its face normal agrees with (dx, dy, dz). */
  tri(a: number, b: number, c: number, dx: number, dy: number, dz: number): void {
    const p = this.pos;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * dx + ny * dy + nz * dz >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aTile', new BufferAttribute(new Float32Array(this.tile), 1));
    g.setAttribute('aLocal', new BufferAttribute(new Float32Array(this.loc), 2));
    g.setAttribute('aKind', new BufferAttribute(new Float32Array(this.kind), 1));
    g.setIndex(new BufferAttribute(new Uint32Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export class Terrain {
  readonly group = new Group();
  readonly material: MeshStandardMaterial;

  constructor(private shape: Shape, uniforms: SharedUniforms) {
    this.material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    hexPatch(this.material, uniforms, {
      head: 'attribute float aTile;\nattribute vec2 aLocal;\nattribute float aKind;\nflat varying float vTileF;\nvarying vec2 vLocal;\nvarying float vKind;\nvarying vec3 vWPos;',
      begin: `
        vTileF = aTile; vLocal = aLocal; vKind = aKind;
        vec4 yzT0 = texelFetch(uTiles, yzTileCoord(aTile), 0);
        if ((yzFlags(yzT0) & 1) == 0) transformed.y = -2.0;
        vWPos = transformed;`,
    }, {
      head: 'flat varying float vTileF;\nvarying vec2 vLocal;\nvarying float vKind;\nvarying vec3 vWPos;',
      color: `
        vec4 yzT = texelFetch(uTiles, yzTileCoord(vTileF), 0);
        int yzF = yzFlags(yzT);
        float yzVis = (yzF & 2) != 0 ? 1.0 : 0.0;
        float yzDn = yzFbm(vWPos.xz * 3.3);
        float yzFine = yzNoise(vWPos.xz * 21.0);
        diffuseColor.rgb *= 0.9 + 0.16 * yzDn + 0.06 * (yzFine - 0.5);
        if (vKind > 1.5) diffuseColor.rgb *= 0.92 + 0.12 * yzNoise(vec2(vWPos.x + vWPos.z, vWPos.y * 9.0) * 6.0);
        if (yzT.g > 0.0 && vKind < 1.5) diffuseColor.rgb = mix(diffuseColor.rgb, yzOwnerColor(yzT.g), 0.08);`,
      out: `
        if (vKind < 1.5) {
          vec4 yzO = yzOverlay(yzTileCoord(vTileF), yzT, vLocal);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, yzO.rgb, yzO.a);
        }
        gl_FragColor.rgb = yzFog(gl_FragColor.rgb, yzVis);`,
    });
  }

  private chunks = new Map<string, { mesh: Mesh | null; key: string }>();

  /** Builds (or rebuilds) the chunks whose explored land has changed. Unexplored land has no geometry at all. */
  update(explored: Uint8Array, reveal: boolean): void {
    const shape = this.shape;
    const map = shape.map;
    const cw = Math.ceil(map.w / CHUNK);
    const ch = Math.ceil(map.h / CHUNK);
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        let h = 2166136261;
        for (let r = cy * CHUNK; r < Math.min(map.h, (cy + 1) * CHUNK); r++) {
          for (let c = cx * CHUNK; c < Math.min(map.w, (cx + 1) * CHUNK); c++) h = Math.imul(h ^ (reveal || explored[r * map.w + c] ? 1 : 0), 16777619);
        }
        const id = `${cx},${cy}`;
        const key = String(h >>> 0);
        const old = this.chunks.get(id);
        if (old && old.key === key) continue;
        if (old?.mesh) {
          this.group.remove(old.mesh);
          old.mesh.geometry.dispose();
        }
        const b = new Buf();
        for (let r = cy * CHUNK; r < Math.min(map.h, (cy + 1) * CHUNK); r++) {
          for (let c = cx * CHUNK; c < Math.min(map.w, (cx + 1) * CHUNK); c++) {
            const i = r * map.w + c;
            if (!reveal && !explored[i]) continue;
            if (shape.isWater(i) && !shape.isIce(i)) continue;
            this.tile(b, i);
          }
        }
        let mesh: Mesh | null = null;
        if (b.count) {
          mesh = new Mesh(b.geometry(), this.material);
          mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          this.group.add(mesh);
        }
        this.chunks.set(id, { mesh, key });
      }
    }
  }

  private tile(b: Buf, i: number): void {
    const shape = this.shape;
    const map = shape.map;
    const ice = shape.isIce(i);
    const hilly = map.relief[i] > 0;
    const N = ice ? 2 : hilly ? 5 : 3;
    const cx = shape.cx(i);
    const cz = shape.cz(i);
    const col = new Color();
    const ring: number[][] = [];
    const top = (lx: number, lz: number): number => {
      const x = cx + lx;
      const z = cz + lz;
      const y = shape.height(i, x, z);
      shape.groundColor(i, x, z, col);
      return b.v(x, y, z, ice ? [0, 1, 0] : shape.normal(i, x, z), col, i, lx, lz, 0);
    };
    ring.push([top(0, 0)]);
    for (let k = 1; k <= N; k++) {
      const rr: number[] = [];
      for (let s = 0; s < 6; s++) {
        const [ax, az] = CORNER[s];
        const [bx, bz] = CORNER[(s + 1) % 6];
        for (let j = 0; j < k; j++) {
          const t = j / k;
          const f = (k / N) * TOP_R;
          rr.push(top((ax + (bx - ax) * t) * f, (az + (bz - az) * t) * f));
        }
      }
      ring.push(rr);
    }
    for (let k = 1; k <= N; k++) {
      const outer = ring[k];
      const inner = ring[k - 1];
      const no = outer.length;
      const ni = inner.length;
      for (let s = 0; s < 6; s++) {
        const o = (j: number) => outer[(s * k + j) % no];
        const n = (j: number) => (k === 1 ? inner[0] : inner[(s * (k - 1) + j) % ni]);
        for (let j = 0; j < k; j++) b.tri(o(j), o(j + 1), n(j), 0, 1, 0);
        for (let j = 0; j < k - 1; j++) b.tri(n(j), o(j + 1), n(j + 1), 0, 1, 0);
      }
    }
    // Bevel: from the top rim down to the tile edge.
    const rim = ring[N];
    const edgeY = (ice ? ICE_Y : LAND_Y) - BEVEL;
    const edge: number[] = [];
    for (let j = 0; j < rim.length; j++) {
      const p = rim[j] * 3;
      const lx = (b.pos[p] - cx) / TOP_R;
      const lz = (b.pos[p + 2] - cz) / TOP_R;
      const l = Math.hypot(lx, lz) || 1;
      shape.groundColor(i, cx + lx * TOP_R, cz + lz * TOP_R, col).multiplyScalar(0.9);
      edge.push(b.v(cx + lx, edgeY, cz + lz, [(lx / l) * 0.55, 0.83, (lz / l) * 0.55], col, i, lx, lz, 1));
    }
    for (let j = 0; j < rim.length; j++) {
      const j2 = (j + 1) % rim.length;
      const p = rim[j] * 3;
      const ox = b.pos[p] - cx;
      const oz = b.pos[p + 2] - cz;
      b.tri(rim[j], rim[j2], edge[j2], ox, 0.6, oz);
      b.tri(rim[j], edge[j2], edge[j], ox, 0.6, oz);
    }
    // Skirt: an earthy cliff down below the water line.
    const lip = new Color();
    const earth = ice ? new Color('#bcd7e8') : map.terrain[i] === T.Snow ? new Color('#c9d3dc') : map.terrain[i] === T.Desert ? new Color('#d4b27a') : BIOME.cliff;
    const deep = ice ? new Color('#7fa9c8') : BIOME.cliffDark;
    for (let s = 0; s < 6; s++) {
      const [ax, az] = CORNER[s];
      const [bx, bz] = CORNER[(s + 1) % 6];
      const nx = (ax + bx) / 2;
      const nz = (az + bz) / 2;
      const nl = Math.hypot(nx, nz);
      const n: [number, number, number] = [nx / nl, 0, nz / nl];
      shape.groundColor(i, cx + ax * 0.9, cz + az * 0.9, lip);
      const topC = earth.clone().lerp(lip, 0.25);
      const a0 = b.v(cx + ax, edgeY, cz + az, n, topC, i, ax, az, 2);
      const b0 = b.v(cx + bx, edgeY, cz + bz, n, topC, i, bx, bz, 2);
      const a1 = b.v(cx + ax, SKIRT_Y, cz + az, n, deep, i, ax, az, 2);
      const b1 = b.v(cx + bx, SKIRT_Y, cz + bz, n, deep, i, bx, bz, 2);
      b.tri(a0, b0, b1, n[0], 0, n[2]);
      b.tri(a0, b1, a1, n[0], 0, n[2]);
    }
  }

  dispose(): void {
    for (const m of this.group.children) (m as Mesh).geometry.dispose();
    this.material.dispose();
  }
}

function patchKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `yz-${(h >>> 0).toString(36)}`;
}

/** Same for depth materials patched by hand. */
export function depthKey(mat: { customProgramCacheKey: () => string }, src: string): void {
  const key = patchKey(src);
  mat.customProgramCacheKey = () => key;
}
