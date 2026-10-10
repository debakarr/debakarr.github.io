// The model kit: CC0 KayKit and Kenney models (packed by tools/year-zero-assets)
// loaded once and handed out as geometry in the same vertex-coloured format
// the procedural art uses (position, normal, colour, `team`), so trees,
// buildings and soldiers all go through the same instanced, fog-aware shaders.
//
// World models keep the palette cell of every vertex, which lets one model
// serve several biomes: grass, leaves and rock are recoloured on extraction.

import {
  AnimationClip,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Object3D,
  SkinnedMesh,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import worldUrl from '../assets/models/world.glb?url';
import hallUrl from '../assets/models/hall.glb?url';
import knightUrl from '../assets/models/char_knight.glb?url';
import barbarianUrl from '../assets/models/char_barbarian.glb?url';
import mageUrl from '../assets/models/char_mage.glb?url';
import rogueUrl from '../assets/models/char_rogue.glb?url';
import hoodedUrl from '../assets/models/char_hooded.glb?url';
import { prep } from './geo';

export type CharName = 'knight' | 'barbarian' | 'mage' | 'rogue' | 'hooded';
const CHAR_URLS: Record<CharName, string> = { knight: knightUrl, barbarian: barbarianUrl, mage: mageUrl, rogue: rogueUrl, hooded: hoodedUrl };

/** KayKit hexagon palette cells (column + row * 8) worth recolouring. */
export const CELL = {
  grass: 16,
  leaves: 17,
  rockLight: 2,
  rockMid: 3,
  rockDark: 18,
  dirt: 10,
  sand: 13,
  water: 9,
  team: 24,
} as const;

interface Kit {
  world: Map<string, Object3D>;
  hall: Map<string, Object3D>;
  chars: Record<CharName, GLTF>;
  clips: Map<string, AnimationClip>;
}

let kit: Kit | null = null;
let loading: Promise<Kit> | null = null;

/** Starts (or joins) loading every bundle. `progress` gets 0..1. */
export function loadKit(progress?: (f: number) => void): Promise<Kit> {
  if (kit) return Promise.resolve(kit);
  if (loading) return loading;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const urls = [worldUrl, hallUrl, ...Object.values(CHAR_URLS)];
  const done = new Array(urls.length).fill(0);
  const tick = (k: number, f: number) => {
    done[k] = f;
    progress?.(done.reduce((a, b) => a + b, 0) / urls.length);
  };
  loading = Promise.all(urls.map((u, k) => loader.loadAsync(u, (e) => e.total && tick(k, e.loaded / e.total)).then((g) => (tick(k, 1), g)))).then(([world, hall, ...chars]) => {
    const names = Object.keys(CHAR_URLS) as CharName[];
    const k: Kit = {
      world: index(world.scene),
      hall: index(hall.scene),
      chars: Object.fromEntries(names.map((n, i) => [n, chars[i]])) as Record<CharName, GLTF>,
      clips: new Map(chars[0].animations.map((c) => [c.name, c])),
    };
    kit = k;
    return k;
  });
  loading.catch(() => (loading = null));
  return loading;
}

export function kitReady(): boolean {
  return kit !== null;
}

function need(): Kit {
  if (!kit) throw new Error('model kit not loaded');
  return kit;
}

function index(root: Object3D): Map<string, Object3D> {
  const m = new Map<string, Object3D>();
  for (const c of root.children) m.set(c.name, c);
  return m;
}

export function hasModel(name: string): boolean {
  return !!kit && (kit.world.has(name) || kit.hall.has(name));
}

export interface Recolor {
  /** Palette cell → target colour; the swatch's shading is kept. */
  cells?: Partial<Record<number, string | Color>>;
  /** Multiplies every colour (e.g. to warm a whole model). */
  tint?: string | Color;
}

const geoCache = new Map<string, BufferGeometry>();
const tmp = new Color();

/**
 * One model's static mesh (moving parts excluded) as a prepped, non-indexed
 * geometry with colour and team attributes. Cached; callers must clone it
 * before transforming.
 */
export function kitGeo(name: string, recolor?: Recolor, key = ''): BufferGeometry {
  const ck = `${name}|${key}`;
  let g = geoCache.get(ck);
  if (!g) {
    const k = need();
    const root = k.world.get(name) ?? k.hall.get(name);
    if (!root) throw new Error(`no model ${name}`);
    g = extract(root as Mesh, recolor);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    geoCache.set(ck, g);
  }
  return g;
}

/** A moving part of a model ("windmill_top_fan", "door_left"...) and its pivot in model space. */
export function kitPart(name: string, part: string, recolor?: Recolor): { geo: BufferGeometry; pivot: [number, number, number] } | null {
  const node = need().world.get(`${name}~${part}`) as Mesh | undefined;
  if (!node) return null;
  const ck = `${name}~${part}`;
  let g = geoCache.get(ck);
  if (!g) {
    g = extract(node, recolor);
    geoCache.set(ck, g);
  }
  const p = (node.userData.pivot as [number, number, number] | undefined) ?? [0, 0, 0];
  return { geo: g, pivot: [p[0], p[1], p[2]] };
}

/** The model's bounding box (static part). */
export function kitBox(name: string): { min: [number, number, number]; max: [number, number, number] } {
  const g = kitGeo(name);
  const b = g.boundingBox!;
  return { min: b.min.toArray(), max: b.max.toArray() };
}

/** Float copy of an attribute (dequantising normalised and interleaved data). */
function floatAttr(a: BufferAttribute | import('three').InterleavedBufferAttribute, size = a.itemSize): BufferAttribute {
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) {
    out[i * size] = a.getX(i);
    if (size > 1) out[i * size + 1] = a.getY(i);
    if (size > 2) out[i * size + 2] = a.getZ(i);
  }
  return new BufferAttribute(out, size);
}

/** Bakes a mesh (with its node transform, i.e. dequantisation) into our geometry format. */
function extract(mesh: Mesh, recolor?: Recolor): BufferGeometry {
  const src = mesh.geometry;
  const g = new BufferGeometry();
  g.setAttribute('position', floatAttr(src.attributes.position as BufferAttribute, 3));
  g.setAttribute('normal', floatAttr(src.attributes.normal as BufferAttribute, 3));
  const n = src.attributes.position.count;
  const col = src.attributes.color ? floatAttr(src.attributes.color as BufferAttribute, 3) : new BufferAttribute(new Float32Array(n * 3).fill(1), 3);
  const team = new Float32Array(n);
  const st = src.attributes._team;
  if (st) for (let i = 0; i < n; i++) team[i] = st.getX(i) / 100;
  const cell = src.attributes._cell;
  if (recolor && (recolor.cells || recolor.tint)) {
    const tint = recolor.tint ? new Color(recolor.tint) : null;
    const targets = new Map<number, Color>();
    for (const [c, v] of Object.entries(recolor.cells ?? {})) if (v !== undefined) targets.set(Number(c), new Color(v));
    // mean colour per recoloured cell, so gradients keep their relative shading
    const mean = new Map<number, [number, number]>();
    if (cell) for (let i = 0; i < n; i++) {
      const c = cell.getX(i);
      if (!targets.has(c)) continue;
      const m = mean.get(c) ?? [0, 0];
      tmp.setRGB(col.getX(i), col.getY(i), col.getZ(i));
      m[0] += lumOf(tmp);
      m[1]++;
      mean.set(c, m);
    }
    for (let i = 0; i < n; i++) {
      tmp.setRGB(col.getX(i), col.getY(i), col.getZ(i));
      const c = cell ? cell.getX(i) : -1;
      const target = targets.get(c);
      if (target) {
        const m = mean.get(c)!;
        const k = Math.max(0.55, Math.min(1.45, lumOf(tmp) / Math.max(1e-4, m[0] / m[1])));
        tmp.copy(target).multiplyScalar(k);
      }
      if (tint) tmp.multiply(tint);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
  }
  g.setAttribute('color', col);
  g.setAttribute('team', new BufferAttribute(team, 1));
  if (src.index) g.setIndex(src.index.clone());
  // the node transform is the quantisation offset and scale
  mesh.updateMatrix();
  g.applyMatrix4(mesh.matrix);
  return prep(g);
}

function lumOf(c: Color): number {
  return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
}

// --- characters ---------------------------------------------------------------------------------

/** A fresh, independently animatable copy of a character (all accessories visible). */
export function charInstance(name: CharName): Group {
  const src = need().chars[name].scene;
  const g = cloneSkinned(src) as Group;
  g.name = name;
  return g;
}

/** The source scene of a character (for baking; do not mutate). */
export function charSource(name: CharName): Object3D {
  return need().chars[name].scene;
}

export function clip(name: string): AnimationClip {
  const c = need().clips.get(name);
  if (!c) throw new Error(`no clip ${name}`);
  return c;
}

/** Adds a derived clip (e.g. an attack over a sitting lower body). */
export function registerClip(c: AnimationClip): void {
  need().clips.set(c.name, c);
}

export function hasClip(name: string): boolean {
  return !!kit?.clips.has(name);
}

/** Every skinned and rigid mesh of a character, for visibility toggles. */
export function charMeshes(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh || (o as SkinnedMesh).isSkinnedMesh) out.push(o as Mesh);
  });
  return out;
}

/** Accessories (weapons, shields, hats, capes) that can be shown or hidden. */
export const ACCESSORIES: Record<CharName, string[]> = {
  knight: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword', 'Knight_Helmet', 'Knight_Cape'],
  barbarian: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug', 'Barbarian_Hat', 'Barbarian_Cape'],
  mage: ['Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff', 'Mage_Hat', 'Mage_Cape'],
  rogue: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', 'Rogue_Cape'],
  hooded: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', 'Rogue_Cape'],
};
