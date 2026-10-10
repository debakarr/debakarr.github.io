// Crowd versions of characters for strategy maps: the same voxel figure and
// skeleton as skinned meshes a map can bake into instanced squads. Two
// conventions let one costume serve every side:
//   - voxels in the TEAM marker palette get `team` = 1 (the map shader
//     multiplies them by that side's colour); they are meshed without shading
//     so the marker colours stay exact;
//   - skin is its own mesh with `team` = 2 (multiplied by the people's tone).

import { Bone, BufferAttribute, Group, MeshStandardMaterial } from 'three';
import { bakeSkin, restOffsets, skinMeshes, type Rot, type SkinPart } from './anim';
import type { Faction } from './catalog';
import { BONES, PARENT, REST, type BoneName } from './rig';
import type { ChibiSpec } from './spec';
import { buildBody, facePixels } from './vbody';
import { decalGeometry, meshGrid, packColor } from './voxel';

/** Marker palette: a costume dressed in this faction is recoloured per side. */
export const TEAM: Faction = { main: '#fe02fe', dark: '#a202a2', light: '#fe60fe', trim: '#e2b04a', emblem: 'fleur', plume: '#fe02fe' };

const OFFSETS = restOffsets(REST as Record<string, Rot>, PARENT as Record<string, string | null>);
const bodyMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
const skinMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });

/** Brightness a marker colour stands for (main = 1, dark ≈ 0.68, light ≈ 1.15), or 0. */
function markerLevel(r: number, g: number, b: number): number {
  const m = Math.max(r, b);
  if (m < 0.2 || Math.abs(r - b) > 0.08 * m + 0.02) return 0;
  if (g > 0.35 * m) return 0;
  if (m > 0.9) return g > 0.06 ? 1.15 : 1;
  return 0.68;
}

const MARKERS = new Set([TEAM.main, TEAM.dark, TEAM.light, TEAM.plume].map((c) => packColor(c)));

/**
 * A crowd figure: a Group holding the shared bone hierarchy and two skinned
 * meshes (costume, skin) whose geometry carries position, normal, color and team.
 */
export function crowdInstance(spec: ChibiSpec): Group {
  const root = new Group();
  root.name = `chibi-${spec.id}`;
  const bones = {} as Record<BoneName, Bone>;
  for (const name of BONES) {
    const b = new Bone();
    b.name = name;
    b.position.set(...REST[name]);
    bones[name] = b;
  }
  for (const n of BONES) {
    const p = PARENT[n];
    if (p) bones[p].add(bones[n]);
    else root.add(bones[n]);
  }
  const skin = packColor(spec.face.skin);
  const parts: SkinPart[] = [];
  const { parts: grids } = buildBody(spec);
  for (const [bone, g] of Object.entries(grids)) {
    if (!g || !g.size) continue;
    const { main, split } = meshGrid(g, { plain: (c) => MARKERS.has(c), split: (c) => c === skin, jitter: 0.05 });
    parts.push({ bone, geo: main, mat: bodyMat });
    if (split) parts.push({ bone, geo: split, mat: skinMat });
  }
  parts.push({ bone: 'head', geo: decalGeometry(facePixels(spec, spec.mood ?? 'neutral')), mat: bodyMat });
  const batches = bakeSkin(parts, BONES as unknown as string[], OFFSETS);
  for (const b of batches) {
    const n = b.geo.attributes.position.count;
    const team = new Float32Array(n);
    if (b.mat === skinMat) {
      team.fill(2);
    } else {
      const col = b.geo.attributes.color as BufferAttribute;
      for (let i = 0; i < n; i++) {
        const lvl = markerLevel(col.getX(i), col.getY(i), col.getZ(i));
        if (lvl > 0) {
          col.setXYZ(i, Math.min(1, lvl), Math.min(1, lvl), Math.min(1, lvl));
          team[i] = 1;
        }
      }
    }
    b.geo.setAttribute('team', new BufferAttribute(team, 1));
  }
  skinMeshes(root, BONES.map((n) => bones[n]), OFFSETS, batches);
  return root;
}
