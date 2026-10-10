// Static batching: merges every non-animated mesh under a group into one
// mesh per (material, shadow flag, 60 m cell). Architecture is built from
// many small parts for clarity; batching turns ~1000 draw calls into a few
// dozen while keeping per-cell frustum culling.
//
// On the way, every part is redrawn as voxel art (0.16 m blocks, coarser for
// big pieces) in its material's colour, with its texture's average folded in,
// so buildings and props match the voxel characters. Thin pieces lying on the
// ground stay smooth (blocks would bury feet) with pixel-art texture filtering.

import { Color, Group, Matrix4, Mesh, MeshStandardMaterial, NearestFilter, Quaternion, Vector3, type BufferGeometry, type Material, type Object3D, type Texture } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prep } from '../engine/geometry';
import { voxelize } from '../../shared/chibi/voxel';

const VOXEL = 0.16;

/** A material's colour with its texture's average folded in (flat-colour voxels). */
const avgCache = new Map<Material, Color>();
function flatTint(m: MeshStandardMaterial): Color {
  let c = avgCache.get(m);
  if (c) return c;
  c = m.color.clone();
  const r = m.map ? reader(m.map) : null;
  if (r) {
    const acc = new Color(0, 0, 0);
    const t = new Color();
    let n = 0;
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        if (!r((i + 0.5) / 8, (j + 0.5) / 8, t)) continue;
        t.convertSRGBToLinear();
        acc.r += t.r;
        acc.g += t.g;
        acc.b += t.b;
        n++;
      }
    if (n) c.multiply(acc.multiplyScalar(1 / n));
  }
  avgCache.set(m, c);
  return c;
}

/** Pixel reader for a canvas (or image) texture, with repeat wrapping. */
const readers = new Map<Texture, ((u: number, v: number, out: Color) => boolean) | null>();
function reader(tex: Texture): ((u: number, v: number, out: Color) => boolean) | null {
  if (readers.has(tex)) return readers.get(tex)!;
  let fn: ((u: number, v: number, out: Color) => boolean) | null = null;
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  try {
    if (img && img.width && img.height) {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const W = c.width;
      const H = c.height;
      const rx = tex.repeat.x;
      const ry = tex.repeat.y;
      const ox = tex.offset.x;
      const oy = tex.offset.y;
      fn = (u, v, out) => {
        let x = (u * rx + ox) % 1;
        let y = (v * ry + oy) % 1;
        if (x < 0) x += 1;
        if (y < 0) y += 1;
        const i = (Math.floor((tex.flipY ? 1 - y : y) * (H - 1)) * W + Math.floor(x * (W - 1))) * 4;
        out.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
        return data[i + 3] > 127;
      };
    }
  } catch {
    fn = null;
  }
  readers.set(tex, fn);
  return fn;
}

/** The voxel twin of a material: colour moves into the blocks, everything else is kept. */
const voxMats = new Map<Material, Material>();
function voxelMaterial(m: Material): Material {
  let out = voxMats.get(m);
  if (out) return out;
  const src = m as MeshStandardMaterial;
  if (!src.isMeshStandardMaterial) return m;
  const v = new MeshStandardMaterial({
    vertexColors: true,
    roughness: src.roughness,
    metalness: src.metalness,
    emissive: src.emissive,
    emissiveIntensity: src.emissiveIntensity,
    side: src.side,
  });
  voxMats.set(m, (out = v));
  return out;
}

/** Whether a mesh should become voxels (glass, water and see-through things stay smooth). */
function voxelable(m: Mesh): boolean {
  const mat = m.material as MeshStandardMaterial;
  if (!mat.isMeshStandardMaterial) return false;
  // thin pieces lying on the ground (plazas, paths, rugs) stay as they are: blocks would bury feet
  const g = m.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox!.clone().applyMatrix4(m.matrixWorld);
  const h = bb.max.y - bb.min.y;
  const w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  if (h < 0.3 && w > 1.2) return false;
  if (mat.transparent && !mat.map) return false;
  if (mat.opacity < 1) return false;
  return !m.userData.smooth;
}

const CELL = 60;

const tmpP = new Vector3();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpM = new Matrix4();
const ONE = new Vector3(1, 1, 1);

export function batchStatic(root: Group): { before: number; after: number } {
  const voxCache = new Map<string, BufferGeometry>();
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: Material; cast: boolean; receive: boolean; geos: BufferGeometry[]; meshes: Mesh[] }>();
  let before = 0;
  const skip = (o: Object3D): boolean => {
    for (let p: Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return true;
    return false;
  };
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || (m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
    if (Array.isArray(m.material) || skip(m)) return;
    before++;
    const p = m.getWorldPosition(m.position.clone());
    const vox = voxelable(m);
    const mat = vox ? voxelMaterial(m.material) : m.material;
    const key = `${mat.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}|${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}|${m.renderOrder}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, receive: m.receiveShadow, geos: [], meshes: [] }));
    let g: BufferGeometry;
    if (vox) {
      // voxelise each (geometry, material, scale) once, in the part's own frame, then place copies
      m.matrixWorld.decompose(tmpP, tmpQ, tmpS);
      const key = `${m.geometry.uuid}|${m.material.uuid}|${tmpS.x.toFixed(3)},${tmpS.y.toFixed(3)},${tmpS.z.toFixed(3)}`;
      let v = voxCache.get(key);
      if (!v) {
        const sm = m.material as MeshStandardMaterial;
        const local = prep(m.geometry.clone());
        local.scale(tmpS.x, tmpS.y, tmpS.z);
        // big pieces (bridges, the backdrop) get coarser blocks
        local.computeBoundingBox();
        const bb = local.boundingBox!;
        const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
        v = prep(voxelize(local, (span > 14 ? span / 24 : Math.min(0.45, Math.max(VOXEL, span / 24))), { tint: flatTint(sm), levels: 10, ao: span < 4 }));
        local.dispose();
        voxCache.set(key, v);
      }
      g = v.clone();
      g.applyMatrix4(tmpM.compose(tmpP, tmpQ, ONE));
    } else {
      g = prep(m.geometry.clone());
      g.applyMatrix4(m.matrixWorld);
      // textures left on smooth pieces (plazas, paths) read as pixel art
      const sm = m.material as MeshStandardMaterial;
      if (sm.map) {
        sm.map.magFilter = NearestFilter;
        sm.map.needsUpdate = true;
      }
    }
    b.geos.push(g);
    b.meshes.push(m);
  });
  let after = 0;
  for (const b of buckets.values()) {
    if (b.meshes.length < 2 && b.mat === b.meshes[0].material) {
      after++;
      b.geos.forEach((g) => g.dispose());
      continue;
    }
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) {
      after += b.meshes.length;
      continue;
    }
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.matrixAutoUpdate = false;
    for (const m of b.meshes) m.removeFromParent();
    root.add(mesh);
    after++;
  }
  for (const v of voxCache.values()) v.dispose();
  // drop now-empty groups
  const empty: Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && (o as Group).isGroup && o.children.length === 0) empty.push(o);
  });
  empty.forEach((o) => o.removeFromParent());
  return { before, after };
}
