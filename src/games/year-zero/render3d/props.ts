// Scatters the natural world and tile improvements over the map: forests,
// jungles, mountains, reeds, farms, pastures, mines, ruins, wonders and
// resource badges. Each prop kind is one instanced mesh per map region (so
// off-screen regions are culled). Fog is handled in the shaders from the
// tile texture, so moving the fog never rebuilds anything; only changes to
// features and improvements do.

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RGBADepthPacking,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  Mesh,
  InstancedBufferGeometry,
} from 'three';
import { drawIcon, hasIcon } from '../art';
import { F, Imp, RESOURCES, Relief, T } from '../data/terrain';
import type { Game } from '../sim/game';
import { resourceVisible } from '../sim/tiles';
import { HEX_GLSL } from './hexgl';
import * as M from './models/nature';
import { hexDist, tileHash, type Shape } from './shape';
import { depthKey, hexPatch, type SharedUniforms } from './terrain';

interface KindDef {
  build: () => BufferGeometry;
  /** Wind sway strength (0 = rigid). */
  sway?: number;
  glow?: boolean;
  shadow?: boolean;
  /** Small details hidden at strategic zoom. */
  detail?: boolean;
}

const KINDS: Record<string, KindDef> = {
  pine0: { build: () => M.pineTree(1), sway: 0.6, shadow: true },
  pine1: { build: () => M.pineTree(2), sway: 0.6, shadow: true },
  pine2: { build: () => M.pineTree(3), sway: 0.6, shadow: true },
  snowpine0: { build: () => M.pineTree(4, true), sway: 0.4, shadow: true },
  snowpine1: { build: () => M.pineTree(5, true), sway: 0.4, shadow: true },
  round0: { build: () => M.roundTree(11), sway: 0.8, shadow: true },
  round1: { build: () => M.roundTree(12), sway: 0.8, shadow: true },
  round2: { build: () => M.roundTree(13, ['#4f9a2a', '#c4dc52']), sway: 0.8, shadow: true },
  autumn: { build: () => M.roundTree(14, ['#c46a2a', '#f2b544']), sway: 0.8, shadow: true },
  poplar: { build: () => M.poplar(15), sway: 0.9, shadow: true },
  palm0: { build: () => M.palm(21), sway: 1, shadow: true },
  palm1: { build: () => M.palm(22), sway: 1, shadow: true },
  jungle0: { build: () => M.jungleTree(31), sway: 0.5, shadow: true },
  jungle1: { build: () => M.jungleTree(32), sway: 0.5, shadow: true },
  dead: { build: () => M.deadTree(41), shadow: true },
  bush: { build: () => M.bush(51), sway: 0.5, detail: true },
  flowers: { build: () => M.flowers(52), sway: 0.6, detail: true },
  tuft: { build: () => M.tuft(53), sway: 1.4, detail: true },
  rock0: { build: () => M.rock(61), detail: true, shadow: true },
  rock1: { build: () => M.rock(62), detail: true, shadow: true },
  rockDark: { build: () => M.rock(63, '#5d524c', '#6d5a50'), detail: true },
  snowrock: { build: () => M.rock(64, '#b9c2cc', '#f4f8fb'), detail: true },
  sandrock: { build: () => M.rock(65, '#e2c48e', '#f0d9a8'), detail: true },
  mtn0: { build: () => M.mountainRange(71, true), shadow: true },
  mtn1: { build: () => M.mountainRange(72, true), shadow: true },
  mtnBare0: { build: () => M.mountainRange(73, false), shadow: true },
  mtnBare1: { build: () => M.mountainRange(74, false), shadow: true },
  volcano: { build: () => M.volcano(81), shadow: true },
  lava: { build: () => M.lava(), glow: true },
  cactus0: { build: () => M.cactus(91), shadow: true },
  cactus1: { build: () => M.cactus(92), shadow: true },
  reeds: { build: () => M.reeds(101), sway: 1.2, detail: true },
  puddle: { build: () => M.puddle(102) },
  ice: { build: () => M.iceChunk(111) },
  wheat: { build: () => M.wheatField(121) },
  hay: { build: () => M.hayBale(), detail: true },
  fence: { build: () => M.fence(0.34) },
  sheep: { build: () => M.sheep(), detail: true },
  cow: { build: () => M.cow(), detail: true },
  horse: { build: () => M.horse(), detail: true },
  mine: { build: () => M.mineEntrance(), shadow: true },
  logs: { build: () => M.logPile(), shadow: true },
  derrick: { build: () => M.oilDerrick(), shadow: true },
  boat: { build: () => M.fishingBoat() },
  plantation: { build: () => M.plantationRow(131), sway: 0.3 },
  ruins: { build: () => M.ruins(141), shadow: true },
  pillars: { build: () => M.pillars(151), shadow: true },
  giant: { build: () => M.giantTree(), sway: 0.3, shadow: true },
  crystals: { build: () => M.crystals(161), glow: true },
  gems: { build: () => M.crystals(162, '#6ff0c8'), glow: true },
  uranium: { build: () => M.crystals(163, '#a6ff5a'), glow: true },
  coral: { build: () => M.coral(171) },
  falls: { build: () => M.waterfall(), shadow: true },
};

interface Inst {
  x: number;
  y: number;
  z: number;
  rot: number;
  s: number;
  tile: number;
  tint: Color;
}

const REGION = 16;
const WHITE = new Color(1, 1, 1);

export class Props {
  readonly group = new Group();
  private geos = new Map<string, BufferGeometry>();
  private mats: { plain: MeshStandardMaterial; sway: MeshStandardMaterial; glow: MeshStandardMaterial; depth: MeshDepthMaterial; swayDepth: MeshDepthMaterial };
  private badges: Badges;

  constructor(private shape: Shape, uniforms: SharedUniforms) {
    const head = 'attribute float aTile;\nflat varying float vTileF;';
    const hide = `
      vTileF = aTile;
      if ((yzFlags(texelFetch(uTiles, yzTileCoord(aTile), 0)) & 1) == 0) transformed *= 0.0;`;
    const sway = `
      {
        vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        float sw = sin(uTime * 1.7 + ip.x * 1.3 + ip.y * 0.7) * 0.6 + sin(uTime * 3.1 + ip.y * 2.3) * 0.3;
        float hgt = max(0.0, position.y);
        transformed.x += sw * 0.09 * hgt * hgt * 4.0;
        transformed.z += sw * 0.05 * hgt * hgt * 4.0;
      }`;
    const fog = 'gl_FragColor.rgb = yzFog(gl_FragColor.rgb, (yzFlags(texelFetch(uTiles, yzTileCoord(vTileF), 0)) & 2) != 0 ? 1.0 : 0.0);';
    const make = (opts: { sway?: boolean; glow?: boolean }) => {
      const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
      if (opts.glow) {
        m.emissive = new Color('#ffffff');
        m.emissiveIntensity = 0.0;
      }
      hexPatch(m, uniforms, { head, begin: hide + (opts.sway ? sway : '') }, {
        head: 'flat varying float vTileF;',
        out: (opts.glow ? 'gl_FragColor.rgb += diffuseColor.rgb * 1.2;\n' : '') + fog,
      });
      return m;
    };
    const depth = (withSway: boolean) => {
      const d = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
      depthKey(d, `props-depth-${withSway}`);
      d.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = `${HEX_GLSL}\n${head}\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>\n${hide}${withSway ? sway : ''}`);
        shader.fragmentShader = `flat varying float vTileF;\n${shader.fragmentShader}`;
      };
      return d;
    };
    this.mats = { plain: make({}), sway: make({ sway: true }), glow: make({ glow: true }), depth: depth(false), swayDepth: depth(true) };
    this.badges = new Badges(shape, uniforms);
    this.group.add(this.badges.mesh);
  }

  private geo(kind: string): BufferGeometry {
    let g = this.geos.get(kind);
    if (!g) {
      g = KINDS[kind].build();
      g.computeBoundingSphere();
      this.geos.set(kind, g);
    }
    return g;
  }

  /**
   * Places props for explored land only. The map is split into regions;
   * a region is rebuilt when its exploration, features, improvements,
   * roads or cities change (or newly revealed resources).
   */
  update(g: Game, reveal: boolean): void {
    const map = g.s.map;
    this.wonders = g.s.wonders.map((w) => w.kind);
    const p = g.player;
    let res = 0;
    for (let r = 1; r < RESOURCES.length; r++) res = res * 2 + (reveal || resourceVisible(p, r) ? 1 : 0);
    const rw = Math.ceil(map.w / REGION);
    const rh = Math.ceil(map.h / REGION);
    let changed = false;
    for (let ry = 0; ry < rh; ry++) {
      for (let rx = 0; rx < rw; rx++) {
        let h = 2166136261 ^ res;
        const mix = (v: number) => {
          h = Math.imul(h ^ v, 16777619);
        };
        for (let r = ry * REGION; r < Math.min(map.h, (ry + 1) * REGION); r++) {
          for (let c = rx * REGION; c < Math.min(map.w, (rx + 1) * REGION); c++) {
            const i = r * map.w + c;
            const seen = reveal || p.explored[i] ? 1 : 0;
            mix(seen);
            if (!seen) continue;
            mix(map.feature[i]);
            mix(map.improvement[i]);
            mix(map.cityAt[i] >= 0 ? 1 : 0);
            mix(map.road[i]);
          }
        }
        const id = `${rx},${ry}`;
        const key = String(h >>> 0);
        if (this.regionKeys.get(id) === key) continue;
        this.regionKeys.set(id, key);
        this.rebuildRegion(g, rx, ry, reveal);
        changed = true;
      }
    }
    if (changed) this.badges.rebuild(g, reveal);
  }

  private regionKeys = new Map<string, string>();
  private regionMeshes = new Map<string, InstancedMesh[]>();

  private rebuildRegion(g: Game, rx: number, ry: number, reveal: boolean): void {
    const id = `${rx},${ry}`;
    for (const m of this.regionMeshes.get(id) ?? []) {
      this.group.remove(m);
      m.dispose();
    }
    const meshes: InstancedMesh[] = [];
    this.regionMeshes.set(id, meshes);
    const shape = this.shape;
    const map = shape.map;
    const p = g.player;
    const lists = new Map<string, Inst[]>();
    const add = (kind: string, tile: number, x: number, z: number, s = 1, rot = 0, tint: Color = WHITE, y?: number) => {
      let list = lists.get(kind);
      if (!list) lists.set(kind, (list = []));
      list.push({ x, y: y ?? shape.height(tile, x, z) - 0.004, z, rot, s, tile, tint });
    };
    for (let r = ry * REGION; r < Math.min(map.h, (ry + 1) * REGION); r++) {
      for (let c = rx * REGION; c < Math.min(map.w, (rx + 1) * REGION); c++) {
        const i = r * map.w + c;
        if (reveal || p.explored[i]) this.placeTile(i, add);
      }
    }
    const mat4 = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const pos = new Vector3();
    const scl = new Vector3();
    for (const [kind, list] of lists) {
      const def = KINDS[kind];
      const base = this.geo(kind);
      const geo = new InstancedBufferGeometry();
      for (const [name, attr] of Object.entries(base.attributes)) geo.setAttribute(name, attr);
      geo.setIndex(base.index);
      const tiles = new Float32Array(list.length);
      list.forEach((it, k) => (tiles[k] = it.tile));
      geo.setAttribute('aTile', new InstancedBufferAttribute(tiles, 1));
      const mat = def.glow ? this.mats.glow : def.sway ? this.mats.sway : this.mats.plain;
      const mesh = new InstancedMesh(geo, mat, list.length);
      list.forEach((it, k) => {
        q.setFromAxisAngle(up, it.rot);
        pos.set(it.x, it.y, it.z);
        scl.setScalar(it.s);
        mat4.compose(pos, q, scl);
        mesh.setMatrixAt(k, mat4);
        mesh.setColorAt(k, it.tint);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = !!def.shadow;
      mesh.receiveShadow = !def.glow;
      mesh.customDepthMaterial = def.sway ? this.mats.swayDepth : this.mats.depth;
      mesh.userData.detail = !!def.detail;
      mesh.visible = !(def.detail && this.far);
      mesh.matrixAutoUpdate = false;
      meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  private far = false;

  /** The floating resource badges (hidden in portraits). */
  get badgeMesh(): Mesh {
    return this.badges.mesh;
  }

  /** Decides what grows and stands on one tile. */
  private placeTile(i: number, add: (kind: string, tile: number, x: number, z: number, s?: number, rot?: number, tint?: Color, y?: number) => void): void {
    const shape = this.shape;
    const map = shape.map;
    const t = map.terrain[i];
    const f = map.feature[i];
    const relief = map.relief[i];
    const imp = map.improvement[i];
    const cx = shape.cx(i);
    const cz = shape.cz(i);
    let seed = 0;
    const rnd = () => tileHash(i, 1000 + seed++);
    const taken: [number, number, number][] = [];
    /** A free spot inside the hex, away from rivers, roads and other props. */
    const spot = (minR: number, maxR: number, gap: number, center = 0.24): [number, number] | null => {
      for (let tries = 0; tries < 14; tries++) {
        const a = rnd() * Math.PI * 2;
        const r = minR + Math.sqrt(rnd()) * (maxR - minR);
        const lx = Math.cos(a) * r;
        const lz = Math.sin(a) * r;
        if (hexDist(lx, lz) > 0.86) continue;
        if (Math.hypot(lx, lz) < center) continue;
        const x = cx + lx;
        const z = cz + lz;
        if (shape.riverDistance(i, x, z) < 0.2) continue;
        if (map.road[i] && this.nearRoad(i, lx, lz)) continue;
        if (taken.some(([tx, tz, tg]) => Math.hypot(tx - x, tz - z) < Math.max(gap, tg))) continue;
        taken.push([x, z, gap]);
        return [x, z];
      }
      return null;
    };
    const scatter = (kinds: string[], n: number, opts: { min?: number; max?: number; gap?: number; s?: [number, number]; tint?: () => Color; center?: number } = {}) => {
      for (let k = 0; k < n; k++) {
        const p = spot(opts.min ?? 0, opts.max ?? 0.78, opts.gap ?? 0.16, opts.center);
        if (!p) continue;
        const kind = kinds[Math.floor(rnd() * kinds.length)];
        const [s0, s1] = opts.s ?? [0.85, 1.15];
        add(kind, i, p[0], p[1], s0 + rnd() * (s1 - s0), rnd() * 6.28, opts.tint?.() ?? WHITE);
      }
    };
    const leafTint = () => new Color().setHSL(0.27 + (rnd() - 0.5) * 0.05, 0.55 + rnd() * 0.2, 0.42 + rnd() * 0.12).multiplyScalar(2.1);
    const grassTint = t === T.Plains ? '#d8c25a' : t === T.Tundra ? '#a9b48c' : t === T.Desert ? '#d9c070' : '#7dc443';
    const tuftTint = () => new Color(grassTint).offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.08);
    const flowerTint = () => new Color(['#ff8fb8', '#ffd84a', '#ffffff', '#c59bff', '#ff7a6a'][Math.floor(rnd() * 5)]);

    if (shape.isWater(i)) {
      if (shape.isIce(i)) scatter(['ice'], 2 + Math.floor(rnd() * 3), { max: 0.75, gap: 0.2, s: [0.8, 1.6], center: 0 });
      if (imp === Imp.Boats) add('boat', i, cx + 0.25, cz + 0.2, 1.4, rnd() * 6.28, WHITE, 0.0);
      const w = map.wonder[i];
      if (w >= 0) {
        const kind = this.wonderKind(i);
        if (kind === 'reef') add('coral', i, cx, cz, 1.4, 0, WHITE, -0.015);
        if (kind === 'crater') for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          add('rock0', i, cx + Math.cos(a) * 0.75, cz + Math.sin(a) * 0.75, 1.6 + rnd(), rnd() * 6, WHITE, 0.02);
        }
      }
      return;
    }
    if (map.cityAt[i] >= 0) return;

    // Natural wonders sit at the heart of their tile.
    const wk = map.wonder[i] >= 0 ? this.wonderKind(i) : '';
    if (wk === 'pillars') add('pillars', i, cx, cz, 1.2, rnd() * 6);
    else if (wk === 'oldwood') add('giant', i, cx, cz, 1.2, rnd() * 6);
    else if (wk === 'glass') add('crystals', i, cx, cz, 1.5, rnd() * 6);
    else if (wk === 'falls') add('falls', i, cx, cz - 0.1, 1.5, 0);
    if (wk && wk !== 'volcano') taken.push([cx, cz, 0.45]);

    if (map.ruinAt[i] >= 0) {
      add('ruins', i, cx + 0.05, cz + 0.05, 1.3, rnd() * 6);
      taken.push([cx, cz, 0.42]);
    }

    // Improvements claim part of the tile first.
    if (imp === Imp.Farm) {
      const a = rnd() * 6.28;
      add('wheat', i, cx + Math.cos(a) * 0.32, cz + Math.sin(a) * 0.32, 1.1, a);
      add('wheat', i, cx + Math.cos(a + 2.2) * 0.38, cz + Math.sin(a + 2.2) * 0.38, 1, a + 2.2);
      add('hay', i, cx + Math.cos(a + 1.1) * 0.3, cz + Math.sin(a + 1.1) * 0.3, 1.1, rnd() * 6);
      taken.push([cx + Math.cos(a) * 0.32, cz + Math.sin(a) * 0.32, 0.3], [cx + Math.cos(a + 2.2) * 0.38, cz + Math.sin(a + 2.2) * 0.38, 0.3]);
    } else if (imp === Imp.Pasture) {
      const a = rnd() * 6.28;
      const px = cx + Math.cos(a) * 0.32;
      const pz = cz + Math.sin(a) * 0.32;
      for (let k = 0; k < 4; k++) {
        const fa = (k * Math.PI) / 2;
        add('fence', i, px + Math.cos(fa) * 0.17, pz + Math.sin(fa) * 0.17, 1, fa + Math.PI / 2);
      }
      for (let k = 0; k < 3; k++) add('sheep', i, px + (rnd() - 0.5) * 0.18, pz + (rnd() - 0.5) * 0.18, 1.1, rnd() * 6);
      taken.push([px, pz, 0.3]);
    } else if (imp === Imp.Mine) {
      const a = rnd() * 6.28;
      add('mine', i, cx + Math.cos(a) * 0.35, cz + Math.sin(a) * 0.35, 1.3, -a + Math.PI / 2);
      taken.push([cx + Math.cos(a) * 0.35, cz + Math.sin(a) * 0.35, 0.25]);
    } else if (imp === Imp.Plantation) {
      const a = rnd() * 6.28;
      add('plantation', i, cx + Math.cos(a) * 0.34, cz + Math.sin(a) * 0.34, 1.1, a);
      taken.push([cx + Math.cos(a) * 0.34, cz + Math.sin(a) * 0.34, 0.3]);
    } else if (imp === Imp.Lumber) {
      const a = rnd() * 6.28;
      add('logs', i, cx + Math.cos(a) * 0.32, cz + Math.sin(a) * 0.32, 1.2, rnd() * 6);
      taken.push([cx + Math.cos(a) * 0.32, cz + Math.sin(a) * 0.32, 0.25]);
    } else if (imp === Imp.OilWell) {
      const a = rnd() * 6.28;
      add('derrick', i, cx + Math.cos(a) * 0.32, cz + Math.sin(a) * 0.32, 1.2, rnd() * 6);
      taken.push([cx + Math.cos(a) * 0.32, cz + Math.sin(a) * 0.32, 0.25]);
    }

    // Small 3D hints of the resource next to its badge.
    const res = map.resource[i];
    if (res) {
      const key = RESOURCES[res].key;
      const p = spot(0.3, 0.6, 0.2);
      if (p) {
        if (key === 'cattle') add('cow', i, p[0], p[1], 1.2, rnd() * 6);
        else if (key === 'horses') add('horse', i, p[0], p[1], 1.2, rnd() * 6);
        else if (key === 'gems' || key === 'minerals') add('gems', i, p[0], p[1], 0.6, rnd() * 6);
        else if (key === 'uranium') add('uranium', i, p[0], p[1], 0.55, rnd() * 6);
        else if (key === 'iron' || key === 'coal') add('rockDark', i, p[0], p[1], 1.4, rnd() * 6);
        else if (key === 'grain') add('hay', i, p[0], p[1], 1.2, rnd() * 6);
      }
    }

    if (relief === Relief.Mountain) {
      const snow = t === T.Snow || t === T.Tundra || map.elevation[i] > 190 || tileHash(i, 9) < 0.7;
      if (f === F.Volcano) {
        add('volcano', i, cx, cz, 1.05, rnd() * 6, WHITE, shape.height(i, cx, cz) - 0.02);
        add('lava', i, cx, cz, 1.05, 0, WHITE, shape.height(i, cx, cz) - 0.02);
      } else {
        const big = snow ? (rnd() < 0.5 ? 'mtn0' : 'mtn1') : rnd() < 0.5 ? 'mtnBare0' : 'mtnBare1';
        add(big, i, cx + (rnd() - 0.5) * 0.1, cz + (rnd() - 0.5) * 0.08, 0.82 + rnd() * 0.16, rnd() * 6.28, WHITE, LAND_BASE);
      }
      scatter(['rock0', 'rock1'], 2, { min: 0.55, max: 0.8, center: 0.5 });
      if (t !== T.Snow && t !== T.Desert) scatter(['pine0', 'pine1'], 2, { min: 0.55, max: 0.8, center: 0.5, s: [0.7, 0.9] });
      return;
    }

    const forest = f === F.Forest;
    if (t === T.Snow) {
      if (forest) scatter(['snowpine0', 'snowpine1'], 9, { gap: 0.16, s: [1.1, 1.45], center: 0.2 });
      else scatter(['snowrock'], 2 + Math.floor(rnd() * 2), { gap: 0.2 });
      if (!forest && rnd() < 0.15) scatter(['snowpine0'], 1);
      return;
    }
    if (f === F.Jungle) {
      scatter(['jungle0', 'jungle1'], 5, { gap: 0.24, s: [1.1, 1.4] });
      scatter(['palm0', 'palm1'], 3, { gap: 0.18, s: [1.1, 1.3] });
      scatter(['bush'], 3, { gap: 0.1, tint: leafTint, center: 0.15 });
      return;
    }
    if (forest) {
      const kinds = t === T.Tundra ? ['pine0', 'pine1', 'pine2', 'snowpine0'] : t === T.Plains ? ['pine0', 'pine1', 'round2', 'poplar', 'autumn'] : ['round0', 'round1', 'pine0', 'round2', 'poplar'];
      scatter(kinds, relief === Relief.Hills ? 8 : 10, { gap: 0.16, s: [1.15, 1.5], center: 0.2 });
      scatter(['bush'], 2, { gap: 0.1, tint: leafTint, center: 0.12 });
      return;
    }
    if (f === F.Marsh) {
      scatter(['puddle'], 2 + Math.floor(rnd() * 2), { gap: 0.28, s: [0.8, 1.3] });
      scatter(['reeds'], 5, { gap: 0.1, center: 0.1 });
      scatter(['tuft'], 3, { gap: 0.08, tint: tuftTint, center: 0.1 });
      return;
    }
    if (f === F.Oasis) {
      add('puddle', i, cx + 0.25, cz + 0.15, 1.6, rnd() * 6);
      taken.push([cx + 0.25, cz + 0.15, 0.3]);
      scatter(['palm0', 'palm1'], 3, { gap: 0.15, min: 0.3 });
      scatter(['bush'], 2, { gap: 0.1, tint: leafTint });
      return;
    }
    if (f === F.Ash || f === F.Volcano) {
      scatter(['dead'], 1 + Math.floor(rnd() * 2), { gap: 0.2 });
      scatter(['rockDark'], 3, { gap: 0.15 });
      return;
    }
    if (t === T.Desert) {
      scatter(['cactus0', 'cactus1'], Math.floor(rnd() * 2.4), { gap: 0.2, s: [1.1, 1.4] });
      scatter(['sandrock'], Math.floor(rnd() * 2), { gap: 0.2 });
      return;
    }
    if (t === T.Tundra) {
      scatter(['rock0', 'rock1'], 1 + Math.floor(rnd() * 2), { gap: 0.2 });
      scatter(['tuft'], 3, { gap: 0.1, tint: tuftTint });
      if (rnd() < 0.3) scatter(['pine1', 'snowpine1'], 1 + Math.floor(rnd() * 2));
      return;
    }
    // Grassland, plains, floodplains (and hills over them)
    if (relief === Relief.Hills) scatter(['rock0', 'rock1'], 1 + Math.floor(rnd() * 2), { gap: 0.2, min: 0.25 });
    scatter(['tuft'], f === F.Floodplain ? 6 : 4, { gap: 0.09, tint: tuftTint, center: 0.12 });
    if (t === T.Grass || f === F.Floodplain) scatter(['flowers'], 1 + Math.floor(rnd() * 3), { gap: 0.1, tint: flowerTint, center: 0.12 });
    scatter(['bush'], Math.floor(rnd() * 3), { gap: 0.12, tint: leafTint });
    if (f === F.Floodplain) scatter(['reeds'], 2, { gap: 0.1 });
    if (rnd() < (t === T.Grass ? 0.35 : 0.22)) scatter(t === T.Plains ? ['pine0', 'poplar', 'autumn'] : ['round0', 'round1', 'poplar'], 1 + Math.floor(rnd() * 2), { s: [1.0, 1.3] });
  }

  private nearRoad(i: number, lx: number, lz: number): boolean {
    const shape = this.shape;
    for (let d = 0; d < 6; d++) {
      const nb = shape.grid.neighbor(i, d);
      if (nb < 0 || !shape.map.road[nb]) continue;
      const vx = shape.cx(nb) - shape.cx(i);
      const vz = shape.cz(nb) - shape.cz(i);
      const l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, (lx * vx + lz * vz) / l2));
      if (Math.hypot(lx - vx * t, lz - vz * t) < 0.13) return true;
    }
    return Math.hypot(lx, lz) < 0.15;
  }

  private wonderKind(i: number): string {
    return this.wonders?.[this.shape.map.wonder[i]] ?? '';
  }

  /** Natural wonder kinds by id (set from the game state). */
  wonders: string[] | null = null;

  tick(_time: number, zoom = 1): void {
    const far = zoom < 0.55;
    if (far !== this.far) {
      this.far = far;
      for (const list of this.regionMeshes.values()) for (const m of list) if (m.userData.detail) m.visible = !far;
    }
    this.badges.setZoom(zoom);
  }

  dispose(): void {
    for (const list of this.regionMeshes.values()) for (const m of list) m.dispose();
    for (const g of this.geos.values()) g.dispose();
    Object.values(this.mats).forEach((m) => m.dispose());
    this.badges.dispose();
  }
}

const LAND_BASE = 0.115;

// --- Resource and wonder badges ---------------------------------------------------------------

const BADGE_VERT = /* glsl */ `
${HEX_GLSL}
attribute vec3 aPos;
attribute float aIcon;
attribute float aTile;
uniform float uScale;
uniform float uCols;
varying vec2 vUv;
flat varying float vTileF;
void main() {
  vTileF = aTile;
  float col = mod(aIcon, uCols);
  float row = floor(aIcon / uCols);
  vUv = (uv + vec2(col, row)) / uCols;
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float bob = sin(uTime * 2.0 + aPos.x * 3.0 + aPos.z) * 0.012;
  mv.xy += position.xy * uScale + vec2(0.0, bob);
  if ((yzFlags(texelFetch(uTiles, yzTileCoord(aTile), 0)) & 1) == 0) mv.xyz = vec3(0.0, 0.0, 10.0);
  gl_Position = projectionMatrix * mv;
}`;

const BADGE_FRAG = /* glsl */ `
${HEX_GLSL}
uniform sampler2D uAtlas;
varying vec2 vUv;
flat varying float vTileF;
void main() {
  vec4 c = texture2D(uAtlas, vUv);
  if (c.a < 0.04) discard;
  int f = yzFlags(texelFetch(uTiles, yzTileCoord(vTileF), 0));
  vec3 col = (f & 2) != 0 ? c.rgb : c.rgb * 0.82;
  gl_FragColor = vec4(col, c.a);
  #include <colorspace_fragment>
}`;

class Badges {
  readonly mesh: Mesh;
  private geo: InstancedBufferGeometry;
  private mat: ShaderMaterial;
  private icons: string[] = [];
  private cols = 4;

  constructor(private shape: Shape, uniforms: SharedUniforms) {
    const keys = RESOURCES.slice(1).map((r) => `r-${r.key}`);
    keys.push('n-wonder');
    this.icons = keys;
    const tex = this.atlas(keys);
    this.geo = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1);
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    this.geo.setIndex(quad.index);
    this.geo.instanceCount = 0;
    this.mat = new ShaderMaterial({
      vertexShader: BADGE_VERT,
      fragmentShader: BADGE_FRAG,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: { uAtlas: { value: tex }, uScale: { value: 0.3 }, uCols: { value: this.cols } },
    });
    Object.assign(this.mat.uniforms, uniforms);
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  private atlas(keys: string[]): CanvasTexture {
    const size = 128;
    const cols = this.cols;
    const rows = Math.ceil(keys.length / cols);
    const cv = document.createElement('canvas');
    cv.width = size * cols;
    cv.height = size * cols;
    const ctx = cv.getContext('2d')!;
    keys.forEach((key, k) => {
      const col = k % cols;
      const row = Math.floor(k / cols);
      // canvas rows go down, texture rows go up
      const x = col * size + size / 2;
      const y = (cols - 1 - row) * size + size / 2;
      const res = RESOURCES.find((r) => `r-${r.key}` === key);
      const color = res?.color ?? '#ffd34d';
      const r = size * 0.4;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const grad = ctx.createLinearGradient(x, y - r, x, y + r);
      grad.addColorStop(0, '#2a3557');
      grad.addColorStop(1, '#141a30');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = size * 0.07;
      const rim = ctx.createLinearGradient(x, y - r, x, y + r);
      rim.addColorStop(0, '#ffe8a0');
      rim.addColorStop(1, '#b8852c');
      ctx.strokeStyle = rim;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (hasIcon(key)) drawIcon(ctx, key as never, x, y, size * 0.5, key === 'n-wonder' ? '#ffd34d' : lighten(color));
    });
    void rows;
    const tex = new CanvasTexture(cv);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  rebuild(g: Game, reveal: boolean): void {
    const map = this.shape.map;
    const p = g.player;
    const pos: number[] = [];
    const icon: number[] = [];
    const tile: number[] = [];
    for (let i = 0; i < map.w * map.h; i++) {
      const r = map.resource[i];
      const isWonder = map.wonder[i] >= 0;
      if (!isWonder && (!r || !(reveal || resourceVisible(p, r)) || map.cityAt[i] >= 0)) continue;
      const x = this.shape.cx(i) - 0.42;
      const z = this.shape.cz(i) - 0.38;
      const y = (this.shape.isWater(i) ? 0.05 : this.shape.height(i, x, z)) + 0.22;
      pos.push(x, y, z);
      icon.push(isWonder ? this.icons.length - 1 : r - 1);
      tile.push(i);
    }
    this.geo.setAttribute('aPos', new InstancedBufferAttribute(new Float32Array(pos), 3));
    this.geo.setAttribute('aIcon', new InstancedBufferAttribute(new Float32Array(icon), 1));
    this.geo.setAttribute('aTile', new InstancedBufferAttribute(new Float32Array(tile), 1));
    this.geo.instanceCount = icon.length;
  }

  setZoom(zoom: number): void {
    // roughly constant on screen, a touch larger up close
    this.mat.uniforms.uScale.value = Math.min(0.42, Math.max(0.2, 0.3 / Math.pow(zoom, 0.55)));
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    (this.mat.uniforms.uAtlas.value as CanvasTexture).dispose();
  }
}

function lighten(hex: string): string {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s + 0.1), Math.max(0.62, hsl.l));
  return `#${c.getHexString()}`;
}
