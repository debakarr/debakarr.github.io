// Crowd versions of chibi characters for strategy maps: the same costume and
// skeleton, flattened into vertex-coloured skinned meshes (no textures), so a
// map can bake whole squads into instanced draws. The painted face becomes
// small geometric eyes, brows and cheeks. Two conventions let one costume
// serve every side:
//   - parts coloured in the TEAM marker palette get `team` = 1 (the map
//     shader multiplies them by that side's colour);
//   - skin is its own mesh with `team` = 2 (multiplied by the people's tone).

import { Bone, BufferAttribute, Group, MeshStandardMaterial, type BufferGeometry } from 'three';
import { bakeSkin, restOffsets, skinMeshes, type Rot, type SkinPart } from './anim';
import type { Faction } from './catalog';
import { ellipsoid, prep, xf } from './geo';
import { buildHair } from './hair';
import { surface } from './mats';
import { buildParts, headGeometry } from './parts';
import { BONES, HEAD_R, HEAD_Y, PARENT, REST, type BoneName } from './rig';
import type { ChibiSpec } from './spec';

/** Marker palette: a costume dressed in this faction is recoloured per side. */
export const TEAM: Faction = { main: '#fe02fe', dark: '#a202a2', light: '#fe60fe', trim: '#e2b04a', emblem: 'fleur', plume: '#fe02fe' };

const OFFSETS = restOffsets(REST as Record<string, Rot>, PARENT as Record<string, string | null>);
const bodyMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
const skinMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });

/** Brightness a marker colour stands for (main = 1, dark ≈ 0.68, light ≈ 1.15), or 0. */
function markerLevel(r: number, g: number, b: number): number {
  const m = Math.max(r, b);
  if (m < 0.2 || Math.abs(r - b) > 0.08 * m + 0.02) return 0;
  if (g > 0.35 * m) return 0;
  if (m > 0.9) return g > 0.06 ? 1.15 : 1;
  return 0.68;
}

function onHead(yaw: number, pitch: number, k = 1): [number, number, number] {
  const r = HEAD_R * k;
  return [Math.sin(yaw) * Math.cos(pitch) * r, HEAD_Y + Math.sin(pitch) * r * 0.95, Math.cos(yaw) * Math.cos(pitch) * r];
}

/** Eyes, highlights, brows, cheeks and mouth as geometry. */
function faceBits(spec: ChibiSpec): SkinPart[] {
  const bits: SkinPart[] = [];
  const add = (g: BufferGeometry, color: string) => bits.push({ bone: 'head', geo: prep(g, color), mat: bodyMat });
  for (const s of [-1, 1]) {
    add(xf(ellipsoid(0.04, 0.052, 0.016, 12, 8), { r: [0.17, s * 0.31, 0], p: onHead(s * 0.31, -0.17, 1.075) }), '#2a1610');
    add(xf(ellipsoid(0.012, 0.014, 0.006, 8, 6), { p: onHead(s * 0.27, -0.12, 1.11) }), '#ffffff');
    add(xf(ellipsoid(0.034, 0.009, 0.008, 10, 6), { r: [0, s * 0.31, s * -0.1], p: onHead(s * 0.31, 0.16, 1.035) }), spec.face.brows);
    add(xf(ellipsoid(0.03, 0.016, 0.006, 10, 6), { r: [0.38, s * 0.45, 0], p: onHead(s * 0.45, -0.38, 1.075) }), '#f0a090');
  }
  add(xf(ellipsoid(0.018, 0.007, 0.006, 10, 6), { r: [0.56, 0, 0], p: onHead(0, -0.56, 1.075) }), '#8a3a3a');
  return bits;
}

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
  const hidden = spec.outfit.some((p) => p.k === 'helmet') ? 'helmet' : spec.outfit.some((p) => p.k === 'hat' && p.style !== 'cap') ? 'hat' : spec.outfit.some((p) => p.k === 'hat') ? 'cap' : undefined;
  const skin = surface('skin');
  const parts: SkinPart[] = [];
  for (const p of buildParts(spec)) {
    if (!(p.mat as MeshStandardMaterial).vertexColors) continue; // textured decals: too small to matter
    parts.push({ bone: p.bone, geo: p.geo, mat: p.mat === skin ? skinMat : bodyMat });
  }
  for (const h of buildHair(spec.hair, { hidden })) parts.push({ bone: h.bone, geo: h.geo, mat: bodyMat });
  parts.push({ bone: 'head', geo: prep(headGeometry(), spec.face.skin), mat: skinMat });
  parts.push(...faceBits(spec));
  const batches = bakeSkin(parts, BONES as unknown as string[], OFFSETS);
  for (const b of batches) {
    const n = b.geo.attributes.position.count;
    const team = new Float32Array(n);
    if (b.mat === skinMat) team.fill(2);
    else {
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
