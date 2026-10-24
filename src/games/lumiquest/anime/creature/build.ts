// Builds an anime creature from a design: sculpt (signed-distance shapes),
// mesh (surface nets), colour regions and soft bone weights from the same
// distances, MToon toon shading with an ink outline (the characters' own
// shader), big glossy eyes and a small mouth laid onto the head, and
// procedural, bouncy animation clips. Geometry is cached per species and
// colours per variant.

import {
  BackSide,
  Bone,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  Skeleton,
  SkinnedMesh,
  type Material,
  type Texture,
} from 'three';
import { MToonMaterial, MToonMaterialOutlineWidthMode } from '@pixiv/three-vrm';
import { Animator } from '../../../shared/chibi/anim';
import { creatureClips } from './clips';
import { eyeTexture, mouthTexture, surfacePatch } from './face';
import { expandPaints, expandParts, field, mirrorBone, shapeBounds, shapeDist, surfaceNets, type Paint, type Part, type RawMesh, type V3 } from './sdf';

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Rest position in model space. */
  at: V3;
  mirror?: boolean;
}

export type CreatureStyle = 'slime' | 'hopper';

export interface CreatureDesign {
  style: CreatureStyle;
  bones: BoneDef[];
  parts: Part[];
  paints: Paint[];
  face: {
    bone: string;
    /** Left eye centre, a point just in front of the surface; the right eye mirrors it. */
    eye: V3;
    eyeSize: [number, number];
    mouth: V3;
    mouthSize: [number, number];
    /** Which way the face looks (unit). */
    look: V3;
  };
  /** Grid cell for meshing (metres). */
  cell: number;
  /** Ink outline width (metres). */
  outline: number;
  /** Glossy highlight strength (slimes shine, fur doesn't). */
  gloss: number;
  /** Shade tint: how shadowed colours shift (multiplied with the region colour). */
  shade: string;
  /** Top of the head above the ground (metres). */
  height: number;
}

export interface CreaturePalette {
  body: string;
  belly: string;
  accent: string;
  glow: string;
  eye: string;
  [k: string]: string;
}

export interface AnimeCreatureModel {
  root: Group;
  body: Bone;
  head: Bone;
  animator: Animator;
  height: number;
  dispose(): void;
}

interface Baked {
  raw: RawMesh;
  parts: Part[];
  paints: Paint[];
  f: (x: number, y: number, z: number) => number;
  /** Per vertex: index of the nearest part. */
  nearest: Uint16Array;
  /** Per vertex: up to 4 bone indices and weights. */
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  bones: BoneDef[];
}

const bakes = new Map<string, Baked>();

function expandBones(bones: BoneDef[]): BoneDef[] {
  const out: BoneDef[] = [];
  for (const b of bones) {
    out.push(b);
    if (b.mirror) out.push({ name: mirrorBone(b.name), parent: b.parent ? mirrorBone(b.parent) : null, at: [-b.at[0], b.at[1], b.at[2]] });
  }
  return out;
}

function bake(key: string, d: CreatureDesign): Baked {
  let b = bakes.get(key);
  if (b) return b;
  const parts = expandParts(d.parts);
  const paints = expandPaints(d.paints);
  const bones = expandBones(d.bones);
  const f = field(parts);
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    if (p.carve) continue;
    const [a, c] = shapeBounds(p.shape);
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], a[i]);
      hi[i] = Math.max(hi[i], c[i]);
    }
  }
  const pad = 0.04;
  for (let i = 0; i < 3; i++) {
    lo[i] -= pad;
    hi[i] += pad;
  }
  const raw = surfaceNets(f, lo, hi, d.cell);
  const n = raw.positions.length / 3;
  const nearest = new Uint16Array(n);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const boneIx = new Map(bones.map((x, i) => [x.name, i]));
  const dist = new Float32Array(parts.length);
  const acc = new Float32Array(bones.length);
  const SIG = 0.03;
  for (let v = 0; v < n; v++) {
    const x = raw.positions[v * 3];
    const y = raw.positions[v * 3 + 1];
    const z = raw.positions[v * 3 + 2];
    let dmin = Infinity;
    let imin = 0;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].carve) {
        dist[i] = Infinity;
        continue;
      }
      const di = shapeDist(parts[i].shape, x, y, z);
      dist[i] = di;
      if (di < dmin) {
        dmin = di;
        imin = i;
      }
    }
    nearest[v] = imin;
    acc.fill(0);
    for (let i = 0; i < parts.length; i++) {
      if (!Number.isFinite(dist[i])) continue;
      const w = Math.exp(-(dist[i] - dmin) / SIG);
      if (w < 0.01) continue;
      acc[boneIx.get(parts[i].bone) ?? 0] += w;
    }
    const order = [...acc.keys()].sort((a, c) => acc[c] - acc[a]).slice(0, 4);
    let sum = 0;
    for (const o of order) sum += acc[o];
    order.forEach((o, k) => {
      skinIndex[v * 4 + k] = o;
      skinWeight[v * 4 + k] = sum > 0 ? acc[o] / sum : k === 0 ? 1 : 0;
    });
  }
  b = { raw, parts, paints, f, nearest, skinIndex, skinWeight, bones };
  bakes.set(key, b);
  return b;
}

function resolve(c: string, pal: CreaturePalette): Color {
  return new Color(c.startsWith('#') ? c : (pal[c] ?? '#ff00ff'));
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Vertex colours: crisp blocks per part, then paints (bellies, tips, insides). */
function colours(b: Baked, pal: CreaturePalette): Float32Array {
  const { raw, parts, paints, nearest } = b;
  const n = raw.positions.length / 3;
  const out = new Float32Array(n * 3);
  const partCol = parts.map((p) => resolve(p.color, pal));
  const paintCol = paints.map((p) => resolve(p.color, pal));
  const c = new Color();
  const tmp = new Color();
  for (let v = 0; v < n; v++) {
    const x = raw.positions[v * 3];
    const y = raw.positions[v * 3 + 1];
    const z = raw.positions[v * 3 + 2];
    // blend part colours over a few millimetres so blocks meet cleanly
    let wsum = 0;
    let r = 0;
    let g = 0;
    let bl = 0;
    let dmin = Infinity;
    for (let i = 0; i < parts.length; i++) if (!parts[i].carve) dmin = Math.min(dmin, shapeDist(parts[i].shape, x, y, z));
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].carve) continue;
      const w = Math.exp(-(shapeDist(parts[i].shape, x, y, z) - dmin) / 0.004);
      if (w < 0.02) continue;
      wsum += w;
      r += partCol[i].r * w;
      g += partCol[i].g * w;
      bl += partCol[i].b * w;
    }
    c.setRGB(r / wsum, g / wsum, bl / wsum);
    const bone = parts[nearest[v]].bone;
    paints.forEach((p, k) => {
      if (p.bones && !p.bones.includes(bone)) return;
      const d = shapeDist(p.shape, x, y, z);
      const s = p.soft ?? 0;
      const t = s > 0 ? 1 - smooth(-s, s, d) : d < 0 ? 1 : 0;
      if (t > 0) c.lerp(tmp.copy(paintCol[k]), t);
    });
    out[v * 3] = c.r;
    out[v * 3 + 1] = c.g;
    out[v * 3 + 2] = c.b;
  }
  return out;
}

let glossTex: Texture | null = null;
/** A matcap with one soft highlight, for the jelly shine. */
function gloss(): Texture {
  if (glossTex) return glossTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 128, 128);
  const gr = g.createRadialGradient(44, 40, 2, 44, 40, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(44, 40, 30, 22, -0.6, 0, Math.PI * 2);
  g.fill();
  glossTex = new CanvasTexture(c);
  glossTex.colorSpace = SRGBColorSpace;
  return glossTex;
}

export function buildAnimeCreature(key: string, d: CreatureDesign, pal: CreaturePalette, castShadow = true): AnimeCreatureModel {
  const b = bake(key, d);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(b.raw.positions, 3));
  geo.setAttribute('normal', new BufferAttribute(b.raw.normals, 3));
  geo.setAttribute('color', new BufferAttribute(colours(b, pal), 3));
  geo.setAttribute('skinIndex', new BufferAttribute(b.skinIndex, 4));
  geo.setAttribute('skinWeight', new BufferAttribute(b.skinWeight, 4));
  geo.setIndex(new BufferAttribute(b.raw.indices, 1));
  geo.computeBoundingSphere();
  const count = b.raw.indices.length;
  geo.addGroup(0, count, 0);
  geo.addGroup(0, count, 1);

  const body = new Color(pal.body);
  const ink = body.clone().multiplyScalar(0.32).lerp(new Color('#2a1d38'), 0.45);
  const surface = new MToonMaterial({
    vertexColors: true,
    // MToon ignores vertex colours unless told otherwise; ours carry the colour blocks
    ignoreVertexColor: false,
    color: new Color('#ffffff'),
    shadeColorFactor: new Color(d.shade),
    shadingShiftFactor: -0.08,
    shadingToonyFactor: 0.9,
    giEqualizationFactor: 0.9,
    parametricRimColorFactor: new Color('#ffffff').multiplyScalar(0.35),
    parametricRimFresnelPowerFactor: 4,
    parametricRimLiftFactor: 0.04,
    rimLightingMixFactor: 1,
    matcapFactor: new Color('#ffffff').multiplyScalar(d.gloss),
    ...(d.gloss > 0 ? { matcapTexture: gloss() } : {}),
    outlineWidthMode: MToonMaterialOutlineWidthMode.WorldCoordinates,
    outlineWidthFactor: d.outline,
    outlineColorFactor: ink,
    outlineLightingMixFactor: 0.6,
    fog: true,
  });
  const outline = surface.clone() as MToonMaterial;
  outline.isOutline = true;
  outline.side = BackSide;
  // three r186 always declares vColor as a vec4; MToon multiplies vec3s by it
  for (const m of [surface, outline]) {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      sh.fragmentShader = sh.fragmentShader.replaceAll('*= vColor;', '*= vColor.rgb;');
    };
  }

  // skeleton
  const bones = new Map<string, Bone>();
  for (const bd of b.bones) {
    const bone = new Bone();
    bone.name = bd.name;
    bones.set(bd.name, bone);
  }
  let rootBone: Bone | null = null;
  for (const bd of b.bones) {
    const bone = bones.get(bd.name)!;
    const parent = bd.parent ? b.bones.find((x) => x.name === bd.parent) : null;
    bone.position.set(bd.at[0] - (parent?.at[0] ?? 0), bd.at[1] - (parent?.at[1] ?? 0), bd.at[2] - (parent?.at[2] ?? 0));
    if (parent) bones.get(parent.name)!.add(bone);
    else rootBone = bone;
  }
  const list = b.bones.map((bd) => bones.get(bd.name)!);
  const skeleton = new Skeleton(list);
  const mesh = new SkinnedMesh(geo, [surface, outline]);
  mesh.add(rootBone!);
  mesh.bind(skeleton);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  // face: eyes and mouth ride the head bone
  const headDef = b.bones.find((x) => x.name === d.face.bone)!;
  const head = bones.get(d.face.bone)!;
  const inward: V3 = [-d.face.look[0], -d.face.look[1], -d.face.look[2]];
  const decals: Material[] = [];
  const decal = (tex: Texture, name: string, at: V3, w: number, h: number, order: number) => {
    const patch = surfacePatch(b.f, at, inward, [0, 1, 0], w, h, 6);
    if (!patch) return;
    const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
    decals.push(mat);
    const m = new Mesh(patch.geometry, mat);
    m.name = name;
    m.position.set(patch.anchor.x - headDef.at[0], patch.anchor.y - headDef.at[1], patch.anchor.z - headDef.at[2]);
    m.quaternion.copy(patch.quaternion);
    m.renderOrder = order;
    head.add(m);
  };
  const [ew, eh] = d.face.eyeSize;
  decal(eyeTexture(pal.eye), 'eyeL', d.face.eye, ew, eh, 2);
  decal(eyeTexture(pal.eye), 'eyeR', [-d.face.eye[0], d.face.eye[1], d.face.eye[2]], ew, eh, 2);
  decal(mouthTexture(false, pal.cheek ?? '#ff8aa8'), 'mouth', d.face.mouth, d.face.mouthSize[0], d.face.mouthSize[1], 1);

  const root = new Group();
  root.add(mesh);
  const clips = creatureClips(d.style, root, b.bones);
  const animator = new Animator(root, clips);
  animator.play('idle', 0);
  return {
    root,
    body: bones.get('body') ?? rootBone!,
    head,
    animator,
    height: d.height,
    dispose() {
      animator.dispose();
      root.removeFromParent();
      geo.dispose();
      surface.dispose();
      outline.dispose();
      for (const m of decals) m.dispose();
    },
  };
}
