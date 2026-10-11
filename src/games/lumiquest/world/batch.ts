// Static batching: merges every non-animated mesh under a group into one
// mesh per (material, shadow flag, 60 m cell). Architecture is built from
// many small parts for clarity; batching turns ~1000 draw calls into a few
// dozen while keeping per-cell frustum culling.

import { Group, Mesh, type BufferGeometry, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prep } from '../engine/geometry';

const CELL = 60;

export function batchStatic(root: Group): { before: number; after: number } {
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
    const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}|${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}|${m.renderOrder}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, geos: [], meshes: [] }));
    const g = prep(m.geometry.clone());
    g.applyMatrix4(m.matrixWorld);
    b.geos.push(g);
    b.meshes.push(m);
  });
  let after = 0;
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) {
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
  // drop now-empty groups
  const empty: Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && (o as Group).isGroup && o.children.length === 0) empty.push(o);
  });
  empty.forEach((o) => o.removeFromParent());
  return { before, after };
}
