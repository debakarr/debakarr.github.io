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
import * as K from './models/kitnature';
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
  /** A lighter version drawn from further away. */
  lod?: () => BufferGeometry;
}

const SW = { sway: 0.6, shadow: true };
const KINDS: Record<string, KindDef> = {
  // KayKit conifers, singly and in whole-hex clumps, per biome
  pineA: { build: () => K.conifer('A', 'temperate'), lod: () => K.conifer('A', 'temperate', false, true), ...SW },
  pineB: { build: () => K.conifer('B', 'temperate'), lod: () => K.conifer('B', 'temperate', false, true), ...SW },
  pineA_p: { build: () => K.conifer('A', 'plains'), lod: () => K.conifer('A', 'plains', false, true), ...SW },
  pineB_p: { build: () => K.conifer('B', 'plains'), lod: () => K.conifer('B', 'plains', false, true), ...SW },
  pineA_t: { build: () => K.conifer('A', 'tundra'), lod: () => K.conifer('A', 'tundra', false, true), ...SW },
  pineB_t: { build: () => K.conifer('B', 'tundra'), lod: () => K.conifer('B', 'tundra', false, true), ...SW },
  pineA_s: { build: () => K.conifer('A', 'snow', true), lod: () => K.conifer('A', 'snow', true, true), ...SW },
  pineB_s: { build: () => K.conifer('B', 'snow', true), lod: () => K.conifer('B', 'snow', true, true), ...SW },
  clumpA_m: { build: () => K.forestClump('A', 'medium', 'temperate'), lod: () => K.forestClump('A', 'medium', 'temperate', false, true), sway: 0.3, shadow: true },
  clumpB_m: { build: () => K.forestClump('B', 'medium', 'temperate'), lod: () => K.forestClump('B', 'medium', 'temperate', false, true), sway: 0.3, shadow: true },
  clumpB_l: { build: () => K.forestClump('B', 'large', 'temperate'), lod: () => K.forestClump('B', 'large', 'temperate', false, true), sway: 0.3, shadow: true },
  clumpA_l: { build: () => K.forestClump('A', 'large', 'temperate'), lod: () => K.forestClump('A', 'large', 'temperate', false, true), sway: 0.3, shadow: true },
  clumpA_t: { build: () => K.forestClump('A', 'medium', 'tundra'), lod: () => K.forestClump('A', 'medium', 'tundra', false, true), sway: 0.3, shadow: true },
  clumpB_t: { build: () => K.forestClump('B', 'large', 'tundra'), lod: () => K.forestClump('B', 'large', 'tundra', false, true), sway: 0.3, shadow: true },
  clumpA_s: { build: () => K.forestClump('A', 'large', 'snow', true), lod: () => K.forestClump('A', 'large', 'snow', true, true), sway: 0.2, shadow: true },
  clumpB_s: { build: () => K.forestClump('B', 'medium', 'snow', true), lod: () => K.forestClump('B', 'medium', 'snow', true, true), sway: 0.2, shadow: true },
  clumpB_p: { build: () => K.forestClump('B', 'small', 'plains'), lod: () => K.forestClump('B', 'small', 'plains', false, true), sway: 0.3, shadow: true },
  // faceted broadleaf trees in the same style
  oak0: { build: () => K.broadleaf(11, 'green'), lod: () => K.broadleaf(11, 'green', false, true), ...SW },
  oak1: { build: () => K.broadleaf(12, 'fresh'), lod: () => K.broadleaf(12, 'fresh', false, true), ...SW },
  oak2: { build: () => K.broadleaf(13, 'deep'), lod: () => K.broadleaf(13, 'deep', false, true), ...SW },
  oak3: { build: () => K.broadleaf(14, 'green'), lod: () => K.broadleaf(14, 'green', false, true), ...SW },
  poplar: { build: () => K.broadleaf(15, 'fresh', true), lod: () => K.broadleaf(15, 'fresh', true, true), ...SW },
  olive0: { build: () => K.broadleaf(16, 'olive'), lod: () => K.broadleaf(16, 'olive', false, true), ...SW },
  autumn: { build: () => K.broadleaf(17, 'autumn'), lod: () => K.broadleaf(17, 'autumn', false, true), ...SW },
  gold: { build: () => K.broadleaf(18, 'gold'), lod: () => K.broadleaf(18, 'gold', false, true), ...SW },
  blossom: { build: () => K.broadleaf(19, 'blossom'), lod: () => K.broadleaf(19, 'blossom', false, true), ...SW },
  jungle0: { build: () => K.broadleaf(31, 'jungle'), lod: () => K.broadleaf(31, 'jungle', false, true), ...SW },
  jungle1: { build: () => K.broadleaf(32, 'jungle', true), lod: () => K.broadleaf(32, 'jungle', true, true), ...SW },
  jungle2: { build: () => M.jungleTree(33), sway: 0.5, shadow: true },
  palm0: { build: () => K.palmKit('long'), sway: 1, shadow: true },
  palm1: { build: () => K.palmKit('short'), sway: 1, shadow: true },
  palm2: { build: () => K.palmKit('detailed-long'), sway: 1, shadow: true },
  dead: { build: () => M.deadTree(41), shadow: true },
  bush: { build: () => K.shrub(51, 'green'), sway: 0.5, detail: true },
  bush1: { build: () => K.shrub(52, 'fresh', true), sway: 0.5, detail: true },
  bushJ: { build: () => K.shrub(53, 'jungle'), sway: 0.5, detail: true },
  flowers: { build: () => M.flowers(52), sway: 0.6, detail: true },
  tuft: { build: () => M.tuft(53), sway: 1.4, detail: true },
  // KayKit rocks, knolls and mountains
  rockA: { build: () => K.rockKit('A', 'temperate'), detail: true, shadow: true },
  rockC: { build: () => K.rockKit('C', 'temperate'), detail: true, shadow: true },
  rockE: { build: () => K.rockKit('E', 'temperate'), detail: true, shadow: true },
  rockDark: { build: () => K.rockKit('E', 'temperate', 0.8), detail: true },
  snowrock: { build: () => K.snowCap(K.rockKit('C', 'snow', 0.9), 0.3), detail: true },
  sandrock: { build: () => K.rockKit('E', 'desert', 0.9), detail: true },
  knollA: { build: () => K.hillKit('hill_single_A', 'temperate', 0.55), shadow: true },
  knollB: { build: () => K.hillKit('hill_single_C', 'temperate', 0.5), shadow: true },
  knollP: { build: () => K.hillKit('hill_single_B', 'plains', 0.5), shadow: true },
  knollD: { build: () => K.hillKit('hill_single_A', 'desert', 0.5), shadow: true },
  knollT: { build: () => K.hillKit('hill_single_C', 'tundra', 0.5), shadow: true },
  mtnA: { build: () => K.peak(71, 'temperate', 0.55), shadow: true },
  mtnB: { build: () => K.peak(72, 'temperate', 0.6), shadow: true },
  mtnC: { build: () => K.peak(73, 'temperate', null), shadow: true },
  mtnD: { build: () => K.peak(74, 'plains', 0.62), shadow: true },
  mtnCrag: { build: () => K.mountainKit('C', 'temperate', { grass: true, trees: true }), shadow: true, lod: () => K.mountainKit('C', 'temperate', { grass: true, trees: true, lod: true }) },
  mtnSnowA: { build: () => K.peak(75, 'snow', 0.25), shadow: true },
  mtnSnowB: { build: () => K.peak(76, 'tundra', 0.35), shadow: true },
  mtnDesertB: { build: () => K.mountainKit('B', 'desert'), shadow: true },
  mtnDesertC: { build: () => K.mountainKit('C', 'desert'), shadow: true },
  mtnDesertP: { build: () => K.peak(77, 'desert', null), shadow: true },
  volcano: { build: () => M.volcano(81), shadow: true },
  lava: { build: () => M.lava(), glow: true },
  cactus0: { build: () => M.cactus(91), shadow: true },
  cactus1: { build: () => M.cactus(92), shadow: true },
  reeds: { build: () => K.waterPlantKit('B'), sway: 1.2, detail: true },
  reeds1: { build: () => K.waterPlantKit('C'), sway: 1.2, detail: true },
  lily: { build: () => K.lilyKit('B'), detail: true },
  puddle: { build: () => M.puddle(102) },
  ice: { build: () => M.iceChunk(111) },
  wheat: { build: () => K.grainPatch(), lod: () => K.grainPatch(true) },
  hay: { build: () => M.hayBale(), detail: true },
  fence: { build: () => K.fenceKit(), lod: () => K.fenceKit(false, true) },
  sheep: { build: () => M.sheep(), detail: true },
  cow: { build: () => M.cow(), detail: true },
  horse: { build: () => M.horse(), detail: true },
  mine: { build: () => K.mineKit(), lod: () => K.mineKit(true), shadow: true },
  stone: { build: () => K.stoneKit(), shadow: true },
  logs: { build: () => K.lumberKit(), shadow: true },
  derrick: { build: () => M.oilDerrick(), shadow: true },
  boat: { build: () => K.boatKit() },
  plantation: { build: () => M.plantationRow(131), sway: 0.3 },
  ruins: { build: () => K.ruinsKit(), shadow: true },
  tent: { build: () => K.tentKit(), shadow: true },
  pile: { build: () => K.propPile(7), detail: true },
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
/** Below this zoom forests and towns switch to their lighter versions. */
export const LOD_ZOOM = 1.6;
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

  private geo(kind: string, lod = false): BufferGeometry {
    const key = lod ? `${kind}@lod` : kind;
    let g = this.geos.get(key);
    if (!g) {
      g = lod ? KINDS[kind].lod!() : KINDS[kind].build();
      g.computeBoundingSphere();
      this.geos.set(key, g);
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
            for (let d = 0; d < 6; d++) {
              const nb = g.grid.neighbor(i, d);
              if (nb >= 0 && map.cityAt[nb] >= 0) mix(7 + d);
            }
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
      if (def.lod) {
        // a lighter twin sharing the instances, shown from further away
        const lb = this.geo(kind, true);
        const lg = new InstancedBufferGeometry();
        for (const [name, attr] of Object.entries(lb.attributes)) lg.setAttribute(name, attr);
        lg.setIndex(lb.index);
        lg.setAttribute('aTile', geo.attributes.aTile);
        const twin = new InstancedMesh(lg, mat, list.length);
        twin.instanceMatrix = mesh.instanceMatrix;
        twin.instanceColor = mesh.instanceColor;
        twin.boundingSphere = mesh.boundingSphere;
        twin.castShadow = mesh.castShadow;
        twin.receiveShadow = mesh.receiveShadow;
        twin.customDepthMaterial = mesh.customDepthMaterial;
        twin.matrixAutoUpdate = false;
        mesh.userData.full = true;
        twin.userData.lod = true;
        mesh.visible = !this.mid;
        twin.visible = this.mid;
        meshes.push(twin);
        this.group.add(twin);
      }
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
    const leafTint = () => new Color().setHSL(0.25 + (rnd() - 0.5) * 0.08, 0.35, 0.9 + rnd() * 0.12);
    const grassTint = t === T.Plains ? '#d8c25a' : t === T.Tundra ? '#a9b48c' : t === T.Desert ? '#d9c070' : '#7dc443';
    const tuftTint = () => new Color(grassTint).offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.08);
    const flowerTint = () => new Color(['#ff8fb8', '#ffd84a', '#ffffff', '#c59bff', '#ff7a6a'][Math.floor(rnd() * 5)]);
    const pick = <K extends string>(arr: K[]): K => arr[Math.floor(rnd() * arr.length)];

    if (shape.isWater(i)) {
      if (shape.isIce(i)) scatter(['ice'], 2 + Math.floor(rnd() * 3), { max: 0.75, gap: 0.2, s: [0.8, 1.6], center: 0 });
      if (imp === Imp.Boats) add('boat', i, cx + 0.25, cz + 0.2, 1.1, rnd() * 6.28, WHITE, 0.005);
      if (t === T.Lake && rnd() < 0.7) for (let k = 0; k < 3; k++) {
        const a = rnd() * 6.28;
        const r = 0.45 + rnd() * 0.3;
        add('lily', i, cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.8 + rnd() * 0.6, rnd() * 6, WHITE, 0.004);
      }
      const w = map.wonder[i];
      if (w >= 0) {
        const kind = this.wonderKind(i);
        if (kind === 'reef') add('coral', i, cx, cz, 1.4, 0, WHITE, -0.015);
        if (kind === 'crater') for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          add('rockC', i, cx + Math.cos(a) * 0.75, cz + Math.sin(a) * 0.75, 1.6 + rnd(), rnd() * 6, WHITE, 0.02);
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
      add('ruins', i, cx + 0.05, cz + 0.05, 1, rnd() * 6);
      taken.push([cx, cz, 0.42]);
    }

    // Improvements claim part of the tile first.
    const at = (a: number, r: number): [number, number] => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
    if (imp === Imp.Farm) {
      const a = rnd() * 6.28;
      for (const [da, r] of [[0, 0.34], [2.1, 0.4], [4.2, 0.36]] as [number, number][]) {
        const [x, z] = at(a + da, r);
        add('wheat', i, x, z, 0.95 + rnd() * 0.15, a + da);
        taken.push([x, z, 0.26]);
      }
      const [hx, hz] = at(a + 1.05, 0.28);
      add('hay', i, hx, hz, 1.1, rnd() * 6);
      const [fx, fz] = at(a + 3.15, 0.5);
      add('fence', i, fx, fz, 1, a + 3.15 + Math.PI / 2);
    } else if (imp === Imp.Pasture) {
      const a = rnd() * 6.28;
      const [px, pz] = at(a, 0.32);
      for (let k = 0; k < 4; k++) {
        const fa = (k * Math.PI) / 2;
        add('fence', i, px + Math.cos(fa) * 0.19, pz + Math.sin(fa) * 0.19, 1, fa + Math.PI / 2);
      }
      for (let k = 0; k < 3; k++) add('sheep', i, px + (rnd() - 0.5) * 0.18, pz + (rnd() - 0.5) * 0.18, 1.1, rnd() * 6);
      taken.push([px, pz, 0.32]);
    } else if (imp === Imp.Mine) {
      const a = rnd() * 6.28;
      const [x, z] = at(a, 0.32);
      add('mine', i, x, z, 1, -a + Math.PI / 2);
      taken.push([x, z, 0.3]);
    } else if (imp === Imp.Plantation) {
      const a = rnd() * 6.28;
      const [x, z] = at(a, 0.34);
      add('plantation', i, x, z, 1.1, a);
      taken.push([x, z, 0.3]);
    } else if (imp === Imp.Lumber) {
      const a = rnd() * 6.28;
      const [x, z] = at(a, 0.32);
      add('logs', i, x, z, 1, rnd() * 6);
      taken.push([x, z, 0.25]);
    } else if (imp === Imp.OilWell) {
      const a = rnd() * 6.28;
      const [x, z] = at(a, 0.32);
      add('derrick', i, x, z, 1.2, rnd() * 6);
      taken.push([x, z, 0.25]);
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
        else if (key === 'iron' || key === 'coal') add('stone', i, p[0], p[1], 1, rnd() * 6);
        else if (key === 'grain') add('hay', i, p[0], p[1], 1.2, rnd() * 6);
      }
    }

    if (relief === Relief.Mountain) {
      const cold = t === T.Snow || t === T.Tundra;
      if (f === F.Volcano) {
        add('volcano', i, cx, cz, 1.05, rnd() * 6, WHITE, shape.height(i, cx, cz) - 0.02);
        add('lava', i, cx, cz, 1.05, 0, WHITE, shape.height(i, cx, cz) - 0.02);
      } else {
        const big = t === T.Desert ? pick(['mtnDesertB', 'mtnDesertC', 'mtnDesertP']) : cold ? pick(['mtnSnowA', 'mtnSnowB']) : map.elevation[i] > 185 ? pick(['mtnA', 'mtnB', 'mtnD']) : pick(['mtnA', 'mtnB', 'mtnC', 'mtnD', 'mtnCrag']);
        add(big, i, cx + (rnd() - 0.5) * 0.06, cz + (rnd() - 0.5) * 0.06, 0.92 + rnd() * 0.12, big.startsWith('mtnDesert') && big !== 'mtnDesertP' || big === 'mtnCrag' ? Math.floor(rnd() * 6) * (Math.PI / 3) : rnd() * 6.28, WHITE, LAND_BASE);
        if (!big.startsWith('mtnDesert') && t !== T.Snow) scatter(cold ? ['pineA_t', 'pineB_t'] : ['pineA', 'pineB'], 2, { min: 0.62, max: 0.84, center: 0.6, s: [0.8, 1.0] });
      }
      return;
    }

    // town suburbs spill into the tiles around a city: keep the near side clear
    let nearCity = false;
    for (let d = 0; d < 6; d++) {
      const nb = shape.grid.neighbor(i, d);
      if (nb >= 0 && map.cityAt[nb] >= 0) {
        taken.push([shape.cx(nb), shape.cz(nb), 1.3]);
        nearCity = true;
      }
    }
    const forest = f === F.Forest;
    const hills = relief === Relief.Hills;
    const clear = !map.road[i] && !shape.hasRiver(i) && !imp && map.ruinAt[i] < 0 && !wk && !nearCity;
    if (hills && !forest && rnd() < 0.75) {
      const p = spot(0.25, 0.55, 0.3, 0);
      if (p) add(t === T.Desert ? 'knollD' : t === T.Tundra || t === T.Snow ? 'knollT' : t === T.Plains ? 'knollP' : pick(['knollA', 'knollB']), i, p[0], p[1], 0.9 + rnd() * 0.3, rnd() * 6);
    }
    if (t === T.Snow) {
      if (forest) {
        if (clear) {
          add(pick(['clumpA_s', 'clumpB_s']), i, cx, cz, 0.95 + rnd() * 0.1, Math.floor(rnd() * 6) * 1.047);
          taken.push([cx, cz, 0.52]);
          scatter(['pineA_s', 'pineB_s'], 4, { min: 0.55, gap: 0.16, s: [0.85, 1.15], center: 0.5 });
        } else scatter(['pineA_s', 'pineB_s'], 9, { gap: 0.15, s: [0.85, 1.2], center: 0.2 });
      } else scatter(['snowrock'], 2 + Math.floor(rnd() * 2), { gap: 0.2 });
      if (!forest && rnd() < 0.15) scatter(['pineA_s'], 1);
      return;
    }
    if (f === F.Jungle) {
      scatter(['jungle0', 'jungle1', 'jungle2'], 7, { gap: 0.2, s: [1.1, 1.45] });
      scatter(['palm0', 'palm2'], 3, { gap: 0.16, s: [0.9, 1.15] });
      scatter(['bushJ'], 4, { gap: 0.1, tint: leafTint, center: 0.12 });
      return;
    }
    if (forest) {
      const tundra = t === T.Tundra;
      const plains = t === T.Plains;
      if (clear) {
        const clump = tundra ? pick(['clumpA_t', 'clumpB_t']) : plains ? pick(['clumpB_p', 'clumpA_m']) : pick(['clumpA_m', 'clumpB_m', 'clumpB_l', 'clumpA_l']);
        add(clump, i, cx + (rnd() - 0.5) * 0.08, cz + (rnd() - 0.5) * 0.08, 0.95 + rnd() * 0.12, Math.floor(rnd() * 6) * 1.047);
        taken.push([cx, cz, plains ? 0.42 : 0.5]);
      }
      const singles = tundra ? ['pineA_t', 'pineB_t'] : plains ? ['olive0', 'autumn', 'pineA_p', 'gold', 'poplar'] : ['oak0', 'oak1', 'oak2', 'oak3', 'poplar', 'pineB', 'pineA'];
      scatter(singles, clear ? (plains ? 6 : 5) : 10, { min: clear ? 0.5 : 0, gap: 0.15, s: [1.0, 1.35], center: clear ? 0.45 : 0.18 });
      scatter(['bush', 'bush1'], 2, { gap: 0.1, tint: leafTint, center: 0.12 });
      return;
    }
    if (f === F.Marsh) {
      scatter(['puddle'], 2 + Math.floor(rnd() * 2), { gap: 0.28, s: [0.8, 1.3] });
      scatter(['reeds', 'reeds1'], 6, { gap: 0.1, center: 0.1 });
      scatter(['tuft'], 3, { gap: 0.08, tint: tuftTint, center: 0.1 });
      return;
    }
    if (f === F.Oasis) {
      add('puddle', i, cx + 0.25, cz + 0.15, 1.6, rnd() * 6);
      taken.push([cx + 0.25, cz + 0.15, 0.3]);
      scatter(['palm0', 'palm1', 'palm2'], 4, { gap: 0.15, min: 0.3 });
      scatter(['bushJ'], 2, { gap: 0.1, tint: leafTint });
      return;
    }
    if (f === F.Ash || f === F.Volcano) {
      scatter(['dead'], 1 + Math.floor(rnd() * 2), { gap: 0.2 });
      scatter(['rockDark'], 3, { gap: 0.15 });
      return;
    }
    if (t === T.Desert) {
      scatter(['cactus0', 'cactus1'], Math.floor(rnd() * 2.4), { gap: 0.2, s: [1.1, 1.4] });
      scatter(['sandrock'], Math.floor(rnd() * 2.5), { gap: 0.2 });
      return;
    }
    if (t === T.Tundra) {
      scatter(['rockA', 'rockC'], 1 + Math.floor(rnd() * 2), { gap: 0.2 });
      scatter(['tuft'], 3, { gap: 0.1, tint: tuftTint });
      if (rnd() < 0.4) scatter(['pineA_t', 'pineB_t'], 1 + Math.floor(rnd() * 2));
      return;
    }
    // Grassland, plains, floodplains (and hills over them)
    if (hills) scatter(['rockA', 'rockE'], 1 + Math.floor(rnd() * 2), { gap: 0.2, min: 0.25 });
    else if (rnd() < 0.3) scatter(['rockA', 'rockC'], 1, { gap: 0.2, min: 0.3 });
    scatter(['tuft'], f === F.Floodplain ? 6 : 5, { gap: 0.09, tint: tuftTint, center: 0.12 });
    if (t === T.Grass || f === F.Floodplain) scatter(['flowers'], 1 + Math.floor(rnd() * 3), { gap: 0.1, tint: flowerTint, center: 0.12 });
    scatter(['bush', 'bush1'], Math.floor(rnd() * 3), { gap: 0.12, tint: leafTint });
    if (f === F.Floodplain) scatter(['reeds'], 2, { gap: 0.1 });
    const grove = rnd() < (t === T.Grass ? 0.55 : 0.4);
    if (grove) scatter(t === T.Plains ? ['olive0', 'pineA_p', 'autumn', 'gold'] : ['oak0', 'oak1', 'oak3', 'poplar', 'pineB', 'blossom'], 1 + Math.floor(rnd() * 3), { s: [0.95, 1.25] });
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

  /** Zoomed out enough for the lighter tree clumps and crowns. */
  private mid = false;

  /** Full detail regardless of zoom (portraits), or back to the zoom rule. */
  forceFull(on: boolean): void {
    this.forced = on;
    this.applyLod();
  }

  private forced = false;

  private applyLod(): void {
    const mid = this.mid && !this.forced;
    for (const list of this.regionMeshes.values()) {
      for (const m of list) {
        if (m.userData.full) m.visible = !mid;
        else if (m.userData.lod) m.visible = mid;
        else if (m.userData.detail) m.visible = !this.far || this.forced;
      }
    }
  }

  tick(_time: number, zoom = 1): void {
    const far = zoom < 0.8;
    const mid = zoom < LOD_ZOOM;
    if (far !== this.far || mid !== this.mid) {
      this.far = far;
      this.mid = mid;
      this.applyLod();
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
