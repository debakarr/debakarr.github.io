// Chibi soldiers, riders, war machines, ships and aircraft for every unit
// type. A soldier is built as a small rig (body, head, two arms, two legs)
// so the battle scenes can animate it; on the map the rig is posed and
// merged. Vertices with `team = 1` take the owner's colour (tunics, shields,
// sails, banners) and `team = 2` the people's skin tone.

import { BufferGeometry } from 'three';
import { Rng } from '../../../shared/rng';
import {
  box, capsule, cone, cylinder, ellipsoid, faceted, gradient, hemisphere, lathe, merge, part, prep, softBox, sphere, tagBob, torus, xf, type V3,
} from '../geo';

export type Helmet = 'none' | 'headband' | 'bronze' | 'iron' | 'kettle' | 'tricorn' | 'kepi' | 'steel' | 'visor' | 'hood' | 'brim' | 'pith' | 'straw' | 'greathelm' | 'cap' | 'crown';
export type Weapon = 'none' | 'club' | 'spear' | 'pike' | 'sword' | 'bow' | 'crossbow' | 'musket' | 'rifle' | 'smg' | 'plasma' | 'staff' | 'lance' | 'saber' | 'torch';
export type Shield = 'none' | 'wood' | 'round' | 'kite' | 'riot';
export type Torso = 'team' | 'leather' | 'mail' | 'plate' | 'coat' | 'olive' | 'armor' | 'robe';

export interface Look {
  helmet: Helmet;
  weapon: Weapon;
  shield?: Shield;
  torso: Torso;
  cape?: boolean;
  backpack?: boolean;
  banner?: boolean;
  hair?: string;
}

const SKIN = '#ffffff';
const BOOT = '#4a3022';
const PANTS: Record<Torso, string> = {
  team: '#5a4a3a', leather: '#5a4632', mail: '#4a4a52', plate: '#5a5a62', coat: '#e8e2d4', olive: '#4f5a3a', armor: '#3a3f48', robe: '#6a5a4a',
};
const METAL = '#b8c0c8';
const BRONZE = '#d19a3e';
const WOOD = '#8a5a34';
const HAIRS = ['#4a2e1c', '#2a1e18', '#7a4a26', '#c98a3a', '#1a1414'];

/** A soldier's parts, each relative to its own pivot. */
export interface Rig {
  body: BufferGeometry;
  head: BufferGeometry;
  armL: BufferGeometry;
  armR: BufferGeometry;
  legL: BufferGeometry;
  legR: BufferGeometry;
  pivots: { head: V3; armL: V3; armR: V3; legL: V3; legR: V3 };
}

const HIP = 0.045;
const SHOULDER = 0.098;
const NECK = 0.11;

function torsoColor(t: Torso): { c: string; team: number } {
  switch (t) {
    case 'team': return { c: '#ffffff', team: 1 };
    case 'coat': return { c: '#f2f2f2', team: 1 };
    case 'leather': return { c: '#9a6a40', team: 0 };
    case 'mail': return { c: '#9aa2aa', team: 0 };
    case 'plate': return { c: '#c4ccd4', team: 0 };
    case 'olive': return { c: '#6b7a4a', team: 0 };
    case 'armor': return { c: '#e4e8ee', team: 0 };
    case 'robe': return { c: '#ffffff', team: 1 };
  }
}

function weaponGeo(w: Weapon): BufferGeometry | null {
  switch (w) {
    case 'none': case 'bow': return null;
    case 'club': return merge([part(cylinder(0.009, 0.005, 0.07, 6), '#7a5232', { r: [0.3, 0, 0], p: [0, 0.02, 0.01] })]);
    case 'spear': return merge([part(cylinder(0.0035, 0.0035, 0.24, 5), WOOD, { p: [0, 0.07, 0] }), part(cone(0.008, 0.03, 5), BRONZE, { p: [0, 0.2, 0] })]);
    case 'pike': return merge([part(cylinder(0.0035, 0.0035, 0.32, 5), WOOD, { p: [0, 0.1, 0] }), part(cone(0.008, 0.035, 5), METAL, { p: [0, 0.27, 0] })]);
    case 'sword': return merge([
      part(box(0.009, 0.075, 0.003), '#e4e8ee', { p: [0, 0.05, 0] }),
      part(box(0.03, 0.005, 0.008), BRONZE, { p: [0, 0.012, 0] }),
      part(cylinder(0.004, 0.004, 0.018, 5), '#5a3a22', { p: [0, 0.0, 0] }),
    ]);
    case 'saber': return merge([
      part(box(0.007, 0.08, 0.003), '#e4e8ee', { r: [0, 0, 0.15], p: [-0.004, 0.05, 0] }),
      part(torus(0.01, 0.002, 4, 8, Math.PI), BRONZE, { p: [0, 0.01, 0] }),
    ]);
    case 'crossbow': return merge([
      part(box(0.01, 0.01, 0.07), WOOD, { p: [0, 0.005, 0.02] }),
      part(torus(0.03, 0.0025, 4, 10, Math.PI), '#5a3a22', { r: [Math.PI / 2, 0, 0], p: [0, 0.008, 0.05] }),
    ]);
    case 'musket': case 'rifle': return merge([
      part(box(0.01, 0.13, 0.012), WOOD, { p: [0, 0.04, 0] }),
      part(cylinder(0.003, 0.003, 0.08, 5), '#3a3a40', { p: [0, 0.12, 0.004] }),
      ...(w === 'musket' ? [part(cone(0.003, 0.03, 4), METAL, { p: [0, 0.17, 0.004] })] : []),
    ]);
    case 'smg': return merge([part(box(0.012, 0.022, 0.06), '#2a2c30', { p: [0, 0.01, 0.02] }), part(box(0.008, 0.02, 0.01), '#2a2c30', { p: [0, -0.005, 0.0] })]);
    case 'plasma': return merge([part(box(0.014, 0.024, 0.07), '#dfe6ee', { p: [0, 0.01, 0.02] }), part(box(0.006, 0.006, 0.05), '#5ff0ff', { p: [0, 0.018, 0.03] })]);
    case 'staff': return merge([part(cylinder(0.003, 0.004, 0.22, 5), '#8a6a44', { p: [0, 0.06, 0] })]);
    case 'lance': return merge([part(cone(0.008, 0.3, 6), '#e8e0d0', { r: [Math.PI / 2 - 0.25, 0, 0], p: [0, 0.03, 0.12] }), part(cylinder(0.014, 0.01, 0.012, 8), '#ffffff', { r: [Math.PI / 2 - 0.25, 0, 0], p: [0, 0.0, 0.0] }, 1)]);
    case 'torch': return merge([part(cylinder(0.004, 0.004, 0.06, 5), WOOD, { p: [0, 0.02, 0] }), part(cone(0.01, 0.03, 6), '#ffb02e', { p: [0, 0.06, 0] })]);
  }
}

function shieldGeo(s: Shield): BufferGeometry | null {
  switch (s) {
    case 'none': return null;
    case 'wood': return merge([part(cylinder(0.03, 0.03, 0.006, 10), '#9a6a3c', { r: [Math.PI / 2, 0, 0] }), part(sphere(0.007, 6, 4), METAL, { p: [0, 0, 0.004] })]);
    case 'round': return merge([
      part(cylinder(0.034, 0.034, 0.006, 14), '#ffffff', { r: [Math.PI / 2, 0, 0] }, 1),
      part(torus(0.033, 0.003, 4, 16), BRONZE, {}),
      part(sphere(0.008, 6, 4), BRONZE, { p: [0, 0, 0.004] }),
    ]);
    case 'kite': return merge([
      part(xf(ellipsoid(0.03, 0.045, 0.006, 10, 6), { p: [0, -0.008, 0] }), '#ffffff', {}, 1),
      part(box(0.006, 0.07, 0.008), '#f6f0e0', { p: [0, -0.008, 0.002] }),
      part(box(0.04, 0.006, 0.008), '#f6f0e0', { p: [0, 0.004, 0.002] }),
    ]);
    case 'riot': return merge([part(box(0.05, 0.08, 0.006), '#cfe6f4', {}), part(box(0.05, 0.012, 0.007), '#ffffff', { p: [0, 0.03, 0] }, 1)]);
  }
}

function helmetGeo(hm: Helmet, hair: string): BufferGeometry[] {
  const y = 0.038;
  const parts: BufferGeometry[] = [];
  const hairCap = () => parts.push(part(xf(hemisphere(0.046, 14, 7), { r: [-0.25, 0, 0] }), hair, { p: [0, y + 0.002, -0.004] }));
  switch (hm) {
    case 'none': hairCap(); break;
    case 'headband': hairCap(); parts.push(part(torus(0.044, 0.005, 5, 18), '#ffffff', { r: [Math.PI / 2, 0, 0], p: [0, y + 0.012, 0] }, 1)); break;
    case 'bronze':
      parts.push(part(hemisphere(0.049, 14, 7), BRONZE, { p: [0, y + 0.004, 0] }));
      parts.push(part(box(0.008, 0.03, 0.07), '#ffffff', { p: [0, y + 0.05, -0.004] }, 1));
      break;
    case 'iron':
      parts.push(part(hemisphere(0.049, 14, 7), METAL, { p: [0, y + 0.004, 0] }));
      parts.push(part(box(0.006, 0.026, 0.006), METAL, { p: [0, y - 0.002, 0.048] }));
      parts.push(part(cone(0.014, 0.05, 6), '#ffffff', { p: [0, y + 0.068, -0.006], r: [-0.3, 0, 0] }, 1));
      break;
    case 'kettle':
      parts.push(part(hemisphere(0.047, 14, 7), METAL, { p: [0, y + 0.006, 0] }));
      parts.push(part(cylinder(0.066, 0.066, 0.004, 16), METAL, { p: [0, y + 0.006, 0] }));
      break;
    case 'tricorn':
      hairCap();
      parts.push(part(cylinder(0.04, 0.045, 0.022, 3), '#2a2a33', { p: [0, y + 0.05, 0], r: [0, Math.PI / 6, 0] }));
      parts.push(part(cylinder(0.062, 0.062, 0.006, 3), '#2a2a33', { p: [0, y + 0.04, 0], r: [0, Math.PI / 6, 0] }));
      parts.push(part(sphere(0.008, 6, 4), '#ffffff', { p: [0.03, y + 0.06, 0.02] }, 1));
      break;
    case 'kepi':
      hairCap();
      parts.push(part(cylinder(0.04, 0.044, 0.032, 12), '#ffffff', { p: [0, y + 0.048, 0], r: [-0.12, 0, 0] }, 1));
      parts.push(part(box(0.05, 0.004, 0.024), '#1a1a20', { p: [0, y + 0.034, 0.044] }));
      break;
    case 'steel':
      parts.push(part(hemisphere(0.052, 14, 7), '#5f6b45', { p: [0, y + 0.004, 0] }));
      parts.push(part(torus(0.052, 0.004, 4, 18), '#56603e', { r: [Math.PI / 2, 0, 0], p: [0, y + 0.004, 0] }));
      parts.push(part(box(0.02, 0.008, 0.004), '#ffffff', { p: [0.04, y + 0.02, 0.02], r: [0, 1.0, 0] }, 1));
      break;
    case 'visor':
      parts.push(part(sphere(0.051, 14, 10), '#e8eef4', { p: [0, y + 0.002, 0] }));
      parts.push(part(ellipsoid(0.04, 0.014, 0.02, 12, 6), '#5ff0ff', { p: [0, y + 0.002, 0.036] }));
      parts.push(part(box(0.008, 0.02, 0.05), '#ffffff', { p: [0, y + 0.05, -0.01] }, 1));
      break;
    case 'hood':
      parts.push(part(xf(hemisphere(0.052, 14, 7), { r: [-0.35, 0, 0] }), '#d8d8d8', { p: [0, y + 0.002, -0.006] }, 1));
      parts.push(part(cone(0.03, 0.05, 8), '#d8d8d8', { r: [-2.2, 0, 0], p: [0, y + 0.02, -0.05] }, 1));
      break;
    case 'brim':
      hairCap();
      parts.push(part(cylinder(0.07, 0.07, 0.005, 16), '#8a6440', { p: [0, y + 0.03, 0] }));
      parts.push(part(cylinder(0.034, 0.038, 0.03, 12), '#7a5636', { p: [0, y + 0.048, 0] }));
      break;
    case 'pith':
      parts.push(part(hemisphere(0.05, 14, 7), '#e6dab8', { p: [0, y + 0.012, 0] }));
      parts.push(part(cylinder(0.068, 0.068, 0.004, 16), '#e6dab8', { p: [0, y + 0.012, 0] }));
      parts.push(part(torus(0.048, 0.004, 4, 16), '#ffffff', { r: [Math.PI / 2, 0, 0], p: [0, y + 0.018, 0] }, 1));
      break;
    case 'straw':
      hairCap();
      parts.push(part(cylinder(0.072, 0.072, 0.005, 16), '#e8c76a', { p: [0, y + 0.028, 0] }));
      parts.push(part(cylinder(0.034, 0.038, 0.026, 12), '#e0bd5e', { p: [0, y + 0.044, 0] }));
      parts.push(part(cylinder(0.039, 0.039, 0.007, 12), '#ffffff', { p: [0, y + 0.036, 0] }, 1));
      break;
    case 'greathelm':
      parts.push(part(cylinder(0.047, 0.049, 0.07, 14), METAL, { p: [0, y + 0.006, 0] }));
      parts.push(part(box(0.06, 0.006, 0.01), '#1a1a20', { p: [0, y + 0.006, 0.046] }));
      parts.push(part(ellipsoid(0.014, 0.03, 0.04, 8, 6), '#ffffff', { p: [0, y + 0.06, -0.01] }, 1));
      break;
    case 'cap':
      hairCap();
      parts.push(part(xf(hemisphere(0.047, 12, 6), { s: [1, 0.6, 1] }), '#ffffff', { p: [0, y + 0.018, 0] }, 1));
      parts.push(part(box(0.044, 0.004, 0.026), '#1a1a20', { p: [0, y + 0.018, 0.048] }));
      break;
    case 'crown':
      hairCap();
      parts.push(part(cylinder(0.034, 0.03, 0.022, 8, true), '#f2c14e', { p: [0, y + 0.05, 0] }));
      for (let k = 0; k < 5; k++) parts.push(part(sphere(0.005, 5, 4), '#ff4d6a', { p: [Math.cos(k * 1.256) * 0.032, y + 0.06, Math.sin(k * 1.256) * 0.032] }));
      break;
  }
  return parts;
}

/** Builds a soldier rig from a look. Height is about 0.2 tile units before scaling. */
export function soldierRig(look: Look, seed = 1): Rig {
  const rng = new Rng(seed);
  const hair = look.hair ?? rng.pick(HAIRS);
  const tc = torsoColor(look.torso);
  const pants = PANTS[look.torso];
  // body (world origin at the feet)
  const bodyParts: BufferGeometry[] = [
    part(lathe([[0.022, HIP - 0.006], [0.034, HIP - 0.004], [0.031, HIP + 0.02], [0.032, 0.08], [0.027, 0.1], [0.012, NECK + 0.004]], 14), tc.c, {}, tc.team),
    part(torus(0.03, 0.0045, 5, 16), '#5a3a22', { r: [Math.PI / 2, 0, 0], p: [0, HIP + 0.016, 0] }),
    part(box(0.008, 0.007, 0.004), BRONZE, { p: [0, HIP + 0.016, 0.031] }),
    part(cylinder(0.011, 0.012, 0.012, 8), SKIN, { p: [0, NECK, 0] }, 2),
  ];
  if (look.torso === 'mail' || look.torso === 'plate' || look.torso === 'armor') {
    // a team-coloured tabard over the armour
    bodyParts.push(part(box(0.034, 0.045, 0.004), '#ffffff', { p: [0, 0.072, 0.03] }, 1));
  }
  if (look.torso === 'olive') bodyParts.push(part(torus(0.011, 0.004, 4, 10), '#ffffff', { r: [0, Math.PI / 2, 0], p: [0.036, 0.085, 0] }, 1));
  if (look.cape) bodyParts.push(part(xf(box(0.062, 0.075, 0.005), { r: [0.14, 0, 0] }), '#d0d0d0', { p: [0, 0.064, -0.03] }, 1));
  if (look.backpack) {
    bodyParts.push(part(softBox(0.04, 0.045, 0.024), '#8a6440', { p: [0, 0.055, -0.035] }));
    bodyParts.push(part(cylinder(0.011, 0.011, 0.048, 8), '#c9b48a', { r: [0, 0, Math.PI / 2], p: [0, 0.104, -0.035] }));
  }
  if (look.banner) {
    bodyParts.push(part(cylinder(0.0025, 0.0025, 0.2, 4), WOOD, { p: [-0.02, 0.15, -0.035] }));
    bodyParts.push(part(box(0.05, 0.034, 0.003), '#ffffff', { p: [0.006, 0.225, -0.035] }, 1));
    bodyParts.push(part(sphere(0.005, 5, 4), BRONZE, { p: [-0.02, 0.252, -0.035] }));
  }
  // head (pivot at the neck)
  const headParts: BufferGeometry[] = [
    part(sphere(0.043, 16, 12), SKIN, { p: [0, 0.038, 0] }, 2),
    part(ellipsoid(0.0062, 0.0075, 0.004, 8, 6), '#1e1a22', { p: [-0.016, 0.034, 0.04] }),
    part(ellipsoid(0.0062, 0.0075, 0.004, 8, 6), '#1e1a22', { p: [0.016, 0.034, 0.04] }),
    part(sphere(0.0022, 5, 4), '#ffffff', { p: [-0.0145, 0.037, 0.0435] }),
    part(sphere(0.0022, 5, 4), '#ffffff', { p: [0.0175, 0.037, 0.0435] }),
    part(ellipsoid(0.007, 0.004, 0.002, 8, 4), '#ff9a9a', { p: [-0.027, 0.023, 0.035] }),
    part(ellipsoid(0.007, 0.004, 0.002, 8, 4), '#ff9a9a', { p: [0.027, 0.023, 0.035] }),
    part(ellipsoid(0.005, 0.0022, 0.002, 6, 4), '#7a3a2a', { p: [0, 0.018, 0.042] }),
    ...helmetGeo(look.helmet, hair),
  ];
  // arms (pivots at the shoulders), hanging slightly out
  const sleeve = look.torso === 'plate' || look.torso === 'mail' || look.torso === 'armor' ? { c: tc.c, team: 0 } : { c: '#e8e8e8', team: tc.team };
  const arm = (side: number) => [
    part(capsule(0.0095, 0.02, 3, 8), sleeve.c, { p: [0, -0.016, 0], r: [0, 0, side * 0.12] }, sleeve.team),
    part(sphere(0.0105, 8, 6), SKIN, { p: [side * 0.004, -0.034, 0.002] }, 2),
  ];
  const armR = arm(1);
  const w = weaponGeo(look.weapon);
  if (w) armR.push(xf(w, { p: [0.004, -0.036, 0.008] }));
  const armL = arm(-1);
  const sh = shieldGeo(look.shield ?? 'none');
  if (sh) armL.push(xf(sh, { p: [-0.012, -0.03, 0.02] }));
  if (look.weapon === 'bow') armL.push(part(torus(0.05, 0.003, 4, 14, Math.PI * 0.9), '#6a4424', { r: [0, Math.PI / 2, Math.PI / 2 + 0.15], p: [-0.006, -0.036, 0.012] }), part(cylinder(0.001, 0.001, 0.098, 3), '#f0f0f0', { p: [-0.006, -0.036, 0.004] }));
  if (look.weapon === 'bow') armR.push(part(cylinder(0.012, 0.01, 0.05, 6), '#7a5232', { p: [0.0, 0.0, -0.02], r: [0.3, 0, 0] }));
  const leg = () => [
    part(capsule(0.0115, 0.018, 3, 8), pants, { p: [0, -0.018, 0] }),
    part(ellipsoid(0.013, 0.009, 0.017, 8, 6), BOOT, { p: [0, -0.037, 0.004] }),
  ];
  return {
    body: merge(bodyParts),
    head: merge(headParts),
    armL: merge(armL),
    armR: merge(armR),
    legL: merge(leg()),
    legR: merge(leg()),
    pivots: { head: [0, NECK, 0], armL: [-0.034, SHOULDER, 0], armR: [0.034, SHOULDER, 0], legL: [-0.013, HIP, 0], legR: [0.013, HIP, 0] },
  };
}

export type Pose = 'stand' | 'ready' | 'ride';

/** A rig merged into one geometry in a pose. */
export function poseRig(rig: Rig, pose: Pose = 'stand'): BufferGeometry {
  const pv = rig.pivots;
  const at = (g: BufferGeometry, p: V3, r: V3 = [0, 0, 0]) => xf(g.clone(), { r, p });
  const parts = [rig.body.clone(), at(rig.head, pv.head, [0.05, 0, 0])];
  if (pose === 'ride') {
    parts.push(at(rig.legL, pv.legL, [-1.3, 0, -0.35]), at(rig.legR, pv.legR, [-1.3, 0, 0.35]));
    parts.push(at(rig.armL, pv.armL, [-0.7, 0, -0.1]), at(rig.armR, pv.armR, [-0.9, 0, 0.1]));
  } else if (pose === 'ready') {
    parts.push(at(rig.legL, pv.legL, [0.12, 0, 0]), at(rig.legR, pv.legR, [-0.12, 0, 0]));
    parts.push(at(rig.armL, pv.armL, [-0.6, 0, -0.1]), at(rig.armR, pv.armR, [-0.35, 0, 0.1]));
  } else {
    parts.push(at(rig.legL, pv.legL), at(rig.legR, pv.legR));
    parts.push(at(rig.armL, pv.armL, [-0.25, 0, -0.05]), at(rig.armR, pv.armR, [-0.2, 0, 0.05]));
  }
  return merge(parts);
}

// --- Looks for each unit type ----------------------------------------------------------------

export const LOOKS: Record<string, Look> = {
  settler: { helmet: 'straw', weapon: 'none', torso: 'team', backpack: true },
  scout: { helmet: 'brim', weapon: 'staff', torso: 'leather', backpack: true },
  explorer: { helmet: 'pith', weapon: 'staff', torso: 'coat', backpack: true },
  warband: { helmet: 'headband', weapon: 'club', shield: 'wood', torso: 'leather' },
  spearmen: { helmet: 'bronze', weapon: 'spear', shield: 'round', torso: 'team' },
  swordsmen: { helmet: 'iron', weapon: 'sword', shield: 'round', torso: 'mail', cape: true },
  pikemen: { helmet: 'kettle', weapon: 'pike', shield: 'kite', torso: 'plate' },
  musketeers: { helmet: 'tricorn', weapon: 'musket', torso: 'coat' },
  riflemen: { helmet: 'kepi', weapon: 'rifle', torso: 'coat' },
  infantry: { helmet: 'steel', weapon: 'rifle', torso: 'olive' },
  mechinf: { helmet: 'visor', weapon: 'smg', shield: 'riot', torso: 'armor' },
  exolegion: { helmet: 'visor', weapon: 'plasma', torso: 'armor', cape: true },
  archers: { helmet: 'hood', weapon: 'bow', torso: 'leather' },
  crossbow: { helmet: 'kettle', weapon: 'crossbow', torso: 'mail' },
  gatling: { helmet: 'kepi', weapon: 'none', torso: 'coat' },
  machinegun: { helmet: 'steel', weapon: 'none', torso: 'olive' },
  horsemen: { helmet: 'headband', weapon: 'spear', torso: 'leather' },
  knights: { helmet: 'greathelm', weapon: 'lance', shield: 'kite', torso: 'plate', cape: true },
  cavalry: { helmet: 'kepi', weapon: 'saber', torso: 'coat' },
  crew: { helmet: 'cap', weapon: 'none', torso: 'team' },
  pilot: { helmet: 'cap', weapon: 'none', torso: 'olive' },
};

// --- Mounts, machines, ships and aircraft ----------------------------------------------------------

export function horseGeo(color = '#8a5a34', mane = '#3a2618', barding = false): BufferGeometry {
  const parts = [
    part(capsule(0.03, 0.075, 4, 10), color, { r: [Math.PI / 2, 0, 0], p: [0, 0.08, 0] }),
    part(capsule(0.017, 0.045, 3, 8), color, { r: [0.7, 0, 0], p: [0, 0.112, 0.056] }),
    part(capsule(0.016, 0.034, 3, 8), color, { r: [1.9, 0, 0], p: [0, 0.135, 0.086] }),
    part(sphere(0.005, 5, 4), '#141010', { p: [0.014, 0.142, 0.092] }),
    part(sphere(0.005, 5, 4), '#141010', { p: [-0.014, 0.142, 0.092] }),
    part(box(0.008, 0.05, 0.02), mane, { r: [0.7, 0, 0], p: [0, 0.128, 0.05] }),
    part(capsule(0.009, 0.04, 2, 6), mane, { r: [-0.9, 0, 0], p: [0, 0.075, -0.07] }),
    part(cone(0.006, 0.016, 4), color, { p: [0.01, 0.16, 0.078] }),
    part(cone(0.006, 0.016, 4), color, { p: [-0.01, 0.16, 0.078] }),
  ];
  for (const [x, z] of [[0.017, 0.04], [-0.017, 0.04], [0.017, -0.04], [-0.017, -0.04]]) {
    parts.push(part(cylinder(0.008, 0.007, 0.06, 6), color, { p: [x, 0.03, z] }), part(cylinder(0.009, 0.009, 0.008, 6), '#2a1a12', { p: [x, 0.004, z] }));
  }
  // saddle blanket in the owner's colour
  parts.push(part(box(0.064, 0.008, 0.06), '#ffffff', { p: [0, 0.11, 0] }, 1));
  if (barding) parts.push(part(xf(ellipsoid(0.036, 0.03, 0.06, 10, 6), { p: [0, 0.075, 0] }), '#e8e8e8', {}, 1));
  return merge(parts);
}

function wheel(r: number, w = 0.01, c = '#6b4a2e'): BufferGeometry {
  return merge([part(cylinder(r, r, w, 12), c, { r: [0, 0, Math.PI / 2] }), part(cylinder(r * 0.3, r * 0.3, w * 1.4, 8), '#3a2a1e', { r: [0, 0, Math.PI / 2] })]);
}

export function catapult(treb = false): BufferGeometry {
  const parts: BufferGeometry[] = [part(box(0.06, 0.012, 0.13), WOOD, { p: [0, 0.03, 0] })];
  for (const x of [-0.035, 0.035]) for (const z of [-0.045, 0.045]) parts.push(xf(wheel(0.022), { p: [x, 0.022, z] }));
  if (treb) {
    parts.push(part(box(0.01, 0.2, 0.01), WOOD, { p: [-0.028, 0.13, 0], r: [0, 0, 0.12] }), part(box(0.01, 0.2, 0.01), WOOD, { p: [0.028, 0.13, 0], r: [0, 0, -0.12] }));
    parts.push(part(box(0.008, 0.26, 0.008), '#7a5232', { p: [0, 0.2, 0.02], r: [0.9, 0, 0] }));
    parts.push(part(box(0.04, 0.04, 0.04), '#6b6f75', { p: [0, 0.16, -0.08] }));
    parts.push(part(box(0.034, 0.012, 0.02), '#ffffff', { p: [0, 0.23, 0.0] }, 1));
  } else {
    parts.push(part(box(0.05, 0.05, 0.01), WOOD, { p: [0, 0.06, -0.02] }));
    parts.push(part(box(0.008, 0.12, 0.008), '#7a5232', { p: [0, 0.08, 0.02], r: [-0.8, 0, 0] }));
    parts.push(part(hemisphere(0.016, 8, 4), '#5a3a22', { p: [0, 0.12, -0.03], r: [Math.PI, 0, 0] }));
    parts.push(part(sphere(0.012, 6, 5), '#8a8a8a', { p: [0, 0.12, -0.03] }));
    parts.push(part(box(0.064, 0.016, 0.01), '#ffffff', { p: [0, 0.042, 0.066] }, 1));
  }
  return merge(parts);
}

export function cannon(modern = false): BufferGeometry {
  const parts: BufferGeometry[] = [
    part(box(0.03, 0.02, 0.08), modern ? '#5f6b45' : WOOD, { p: [0, 0.03, -0.02] }),
    xf(wheel(0.032, 0.01, modern ? '#2a2c30' : '#6b4a2e'), { p: [0.03, 0.032, 0] }),
    xf(wheel(0.032, 0.01, modern ? '#2a2c30' : '#6b4a2e'), { p: [-0.03, 0.032, 0] }),
    part(cylinder(0.011, 0.016, 0.11, 10), modern ? '#4a5238' : '#2e2c30', { r: [Math.PI / 2 - 0.35, 0, 0], p: [0, 0.055, 0.03] }),
  ];
  if (modern) parts.push(part(box(0.07, 0.05, 0.006), '#5f6b45', { p: [0, 0.06, 0.012] }), part(box(0.03, 0.01, 0.006), '#ffffff', { p: [0, 0.07, 0.016] }, 1));
  else parts.push(part(box(0.026, 0.012, 0.006), '#ffffff', { p: [0, 0.042, -0.06] }, 1));
  return merge(parts);
}

export function rocketTruck(): BufferGeometry {
  const parts: BufferGeometry[] = [
    part(softBox(0.07, 0.03, 0.16), '#5f6b45', { p: [0, 0.03, 0] }),
    part(softBox(0.066, 0.04, 0.04), '#ffffff', { p: [0, 0.06, 0.06] }, 1),
    part(box(0.05, 0.008, 0.02), '#9ad0ee', { p: [0, 0.07, 0.081] }),
    part(xf(box(0.06, 0.04, 0.08), { r: [-0.4, 0, 0] }), '#4a5238', { p: [0, 0.08, -0.03] }),
  ];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) parts.push(part(cylinder(0.007, 0.007, 0.004, 8), '#1a1a1a', { r: [Math.PI / 2 - 0.4, 0, 0], p: [-0.018 + x * 0.018, 0.075 + y * 0.016 + 0.02, 0.006 + y * 0.008] }));
  for (const z of [-0.05, 0, 0.05]) for (const x of [-0.04, 0.04]) parts.push(xf(wheel(0.018, 0.012, '#2a2c30'), { p: [x, 0.018, z] }));
  return merge(parts);
}

export function tank(kind: 'tank' | 'modern' | 'hover'): BufferGeometry {
  const hull = kind === 'modern' ? '#9a8a6a' : kind === 'hover' ? '#d8dee6' : '#5f6b45';
  const parts: BufferGeometry[] = [
    part(softBox(0.1, 0.035, 0.17, 0.12), hull, { p: [0, kind === 'hover' ? 0.04 : 0.028, 0] }),
    part(box(0.08, 0.006, 0.12), '#ffffff', { p: [0, (kind === 'hover' ? 0.04 : 0.028) + 0.036, -0.01] }, 1),
  ];
  const ty = kind === 'hover' ? 0.085 : 0.075;
  parts.push(part(kind === 'tank' ? cylinder(0.036, 0.04, 0.03, 10) : softBox(0.07, 0.028, 0.08, 0.2), hull, { p: [0, ty, -0.01] }));
  parts.push(part(cylinder(0.006, 0.008, 0.12, 8), '#3a3e30', { r: [Math.PI / 2, 0, 0], p: [0, ty + 0.004, 0.08] }));
  parts.push(part(sphere(0.012, 6, 5), '#ffffff', { p: [0.018, ty + 0.018, -0.03] }, 1));
  if (kind === 'hover') {
    for (const z of [-0.05, 0.05]) for (const x of [-0.04, 0.04]) parts.push(part(cylinder(0.018, 0.022, 0.012, 10), '#5ff0ff', { p: [x, 0.016, z] }));
  } else {
    for (const x of [-0.055, 0.055]) {
      parts.push(part(softBox(0.026, 0.034, 0.18, 0.3), '#2a2c30', { p: [x, 0.017, 0] }));
      for (let k = 0; k < 4; k++) parts.push(xf(wheel(0.012, 0.028, '#4a4e52'), { p: [x, 0.016, -0.06 + k * 0.04] }));
    }
  }
  return merge(parts);
}

export function gatlingGun(modern = false): BufferGeometry {
  if (modern) {
    return merge([
      part(box(0.014, 0.018, 0.08), '#2a2c30', { p: [0, 0.04, 0.02] }),
      part(cylinder(0.002, 0.002, 0.07, 4), '#2a2c30', { p: [0.02, 0.018, 0], r: [0, 0, 0.5] }),
      part(cylinder(0.002, 0.002, 0.07, 4), '#2a2c30', { p: [-0.02, 0.018, 0], r: [0, 0, -0.5] }),
      part(cylinder(0.002, 0.002, 0.07, 4), '#2a2c30', { p: [0, 0.018, -0.02], r: [0.5, 0, 0] }),
      part(box(0.05, 0.03, 0.04), '#c8b88a', { p: [0, 0.015, -0.05] }),
    ]);
  }
  return merge([
    part(cylinder(0.014, 0.014, 0.09, 8), '#a88a4a', { r: [Math.PI / 2, 0, 0], p: [0, 0.05, 0.02] }),
    xf(wheel(0.028), { p: [0.03, 0.028, 0] }),
    xf(wheel(0.028), { p: [-0.03, 0.028, 0] }),
    part(box(0.02, 0.012, 0.06), WOOD, { p: [0, 0.025, -0.04] }),
  ]);
}

export function cart(): BufferGeometry {
  return merge([
    part(box(0.07, 0.025, 0.09), WOOD, { p: [0, 0.04, 0] }),
    xf(wheel(0.026), { p: [0.042, 0.026, 0] }),
    xf(wheel(0.026), { p: [-0.042, 0.026, 0] }),
    part(xf(ellipsoid(0.04, 0.03, 0.05, 10, 6), { p: [0, 0.065, 0] }), '#f2ead6', {}),
    part(box(0.084, 0.006, 0.006), '#ffffff', { p: [0, 0.07, 0.0] }, 1),
    part(box(0.006, 0.006, 0.08), WOOD, { p: [0.015, 0.03, 0.08] }),
    part(box(0.006, 0.006, 0.08), WOOD, { p: [-0.015, 0.03, 0.08] }),
  ]);
}

function hull(len: number, beam: number, depth: number, color: string): BufferGeometry {
  const g = lathe([[0.001, -depth], [beam * 0.7, -depth * 0.8], [beam, -depth * 0.2], [beam * 1.04, 0.0]], 14);
  g.scale(1, 1, len / beam / 2);
  return gradient(g, '#4a2e1a', color);
}

function sail(w: number, h: number, team = true, color = '#ffffff'): BufferGeometry {
  const g = box(w, h, 0.004);
  return prep(g, color, team ? 1 : 0);
}

export function ship(kind: string): BufferGeometry {
  const parts: BufferGeometry[] = [];
  switch (kind) {
    case 'galley': {
      parts.push(xf(hull(0.32, 0.055, 0.04, '#9a6a3c'), { p: [0, 0.03, 0] }));
      for (let k = 0; k < 5; k++) for (const s of [-1, 1]) parts.push(part(box(0.09, 0.004, 0.006), '#c9a06a', { r: [0, 0, s * 0.45], p: [s * 0.075, 0.02, -0.1 + k * 0.05] }));
      parts.push(part(cylinder(0.004, 0.005, 0.2, 5), '#6b4a2e', { p: [0, 0.13, 0] }));
      const s = sail(0.12, 0.09);
      parts.push(xf(s, { p: [0, 0.16, 0.004] }));
      parts.push(part(box(0.12, 0.012, 0.005), '#f4ecdc', { p: [0, 0.16, 0.007] }));
      parts.push(part(cone(0.012, 0.04, 5), '#c9a06a', { r: [Math.PI / 2, 0, 0], p: [0, 0.04, 0.18] }));
      break;
    }
    case 'caravel': case 'frigate': {
      const big = kind === 'frigate';
      const len = big ? 0.42 : 0.34;
      parts.push(xf(hull(len, big ? 0.075 : 0.065, 0.05, big ? '#6a4a2e' : '#9a6a3c'), { p: [0, 0.035, 0] }));
      parts.push(part(box(0.11, 0.04, 0.08), big ? '#5a3e26' : '#8a5a34', { p: [0, 0.055, -len * 0.38] }));
      const masts = big ? [-0.11, 0, 0.11] : [-0.06, 0.07];
      masts.forEach((z, k) => {
        const h = big ? (k === 1 ? 0.3 : 0.25) : 0.24;
        parts.push(part(cylinder(0.004, 0.005, h, 5), '#5a3a22', { p: [0, 0.04 + h / 2, z] }));
        parts.push(xf(sail(0.12, 0.08, false, '#fbf6ea'), { p: [0, 0.04 + h * 0.55, z + 0.006] }));
        parts.push(xf(sail(0.09, 0.06, false, '#fbf6ea'), { p: [0, 0.04 + h * 0.85, z + 0.006] }));
        parts.push(part(box(0.03, 0.08, 0.006), '#ffffff', { p: [0, 0.04 + h * 0.55, z + 0.01] }, 1));
        parts.push(part(box(0.1, 0.012, 0.006), '#ffffff', { p: [0, 0.04 + h * 0.55, z + 0.011] }, 1));
      });
      if (big) for (let k = 0; k < 4; k++) for (const s of [-1, 1]) parts.push(part(cylinder(0.005, 0.005, 0.02, 6), '#222', { r: [0, 0, Math.PI / 2], p: [s * 0.075, 0.03, -0.1 + k * 0.06] }));
      parts.push(part(box(0.04, 0.025, 0.003), '#ffffff', { p: [0.02, 0.04 + (big ? 0.33 : 0.27), masts[0]] }, 1));
      break;
    }
    case 'ironclad': {
      parts.push(xf(hull(0.36, 0.07, 0.04, '#3a3a40'), { p: [0, 0.03, 0] }));
      parts.push(part(softBox(0.1, 0.035, 0.16, 0.25), '#4a4a52', { p: [0, 0.03, 0] }));
      parts.push(part(cylinder(0.014, 0.016, 0.08, 10), '#2a2a2e', { p: [0, 0.09, 0.0] }));
      parts.push(part(box(0.1, 0.008, 0.02), '#ffffff', { p: [0, 0.066, -0.06] }, 1));
      break;
    }
    case 'destroyer': case 'battleship': case 'stealthcruiser': {
      const bb = kind === 'battleship';
      const st = kind === 'stealthcruiser';
      const len = bb ? 0.5 : 0.42;
      const col = st ? '#4a4e56' : '#8a96a2';
      parts.push(xf(hull(len, bb ? 0.08 : 0.065, 0.04, col), { p: [0, 0.03, 0] }));
      parts.push(part(box(bb ? 0.13 : 0.11, 0.012, len * 0.85), col, { p: [0, 0.035, 0] }));
      if (st) {
        parts.push(part(faceted(xf(cone(0.06, 0.09, 4), { r: [0, Math.PI / 4, 0], s: [1, 1, 1.8] })), '#3a3e46', { p: [0, 0.085, -0.03] }));
      } else {
        parts.push(part(softBox(0.06, bb ? 0.08 : 0.06, 0.08), '#dfe4ea', { p: [0, 0.04 + (bb ? 0.04 : 0.03), -0.02] }));
        parts.push(part(cylinder(0.004, 0.004, 0.08, 4), '#dfe4ea', { p: [0, 0.16, -0.02] }));
        const turrets = bb ? [0.14, 0.07, -0.13] : [0.11, -0.12];
        for (const z of turrets) {
          parts.push(part(cylinder(0.022, 0.024, 0.018, 10), col, { p: [0, 0.05, z] }));
          parts.push(part(cylinder(0.004, 0.004, 0.06, 5), '#3a3e44', { r: [Math.PI / 2, 0, 0], p: [0.008, 0.054, z + Math.sign(z) * 0.04] }));
          parts.push(part(cylinder(0.004, 0.004, 0.06, 5), '#3a3e44', { r: [Math.PI / 2, 0, 0], p: [-0.008, 0.054, z + Math.sign(z) * 0.04] }));
        }
      }
      parts.push(part(box(0.03, 0.02, 0.003), '#ffffff', { p: [0.016, st ? 0.15 : 0.19, -0.02] }, 1));
      parts.push(part(box(bb ? 0.13 : 0.11, 0.006, 0.03), '#ffffff', { p: [0, 0.042, len * 0.38] }, 1));
      break;
    }
  }
  return merge(parts);
}

export function aircraft(kind: string): BufferGeometry {
  const parts: BufferGeometry[] = [];
  if (kind === 'biplane') {
    parts.push(part(capsule(0.018, 0.1, 4, 10), '#ffffff', { r: [Math.PI / 2, 0, 0] }, 1));
    parts.push(part(box(0.24, 0.006, 0.05), '#f2e6c8', { p: [0, 0.022, 0.02] }), part(box(0.24, 0.006, 0.05), '#f2e6c8', { p: [0, -0.012, 0.02] }));
    for (const x of [-0.08, 0.08]) parts.push(part(cylinder(0.002, 0.002, 0.034, 3), WOOD, { p: [x, 0.005, 0.02] }));
    parts.push(part(box(0.08, 0.004, 0.03), '#f2e6c8', { p: [0, 0.0, -0.075] }), part(box(0.004, 0.04, 0.03), '#ffffff', { p: [0, 0.02, -0.075] }, 1));
    parts.push(part(box(0.08, 0.006, 0.004), '#3a3a3a', { p: [0, 0, 0.08] }));
  } else if (kind === 'jet') {
    parts.push(part(capsule(0.016, 0.14, 4, 10), '#c8d0d8', { r: [Math.PI / 2, 0, 0] }));
    parts.push(part(cone(0.016, 0.05, 10), '#c8d0d8', { r: [Math.PI / 2, 0, 0], p: [0, 0, 0.1] }));
    const wing = cone(0.1, 0.12, 3);
    wing.scale(1, 1, 0.06);
    wing.rotateX(Math.PI / 2);
    wing.rotateY(Math.PI);
    parts.push(part(wing, '#ffffff', { p: [0, 0, -0.01] }, 1));
    parts.push(part(box(0.004, 0.05, 0.04), '#c8d0d8', { p: [0, 0.03, -0.07] }));
    parts.push(part(ellipsoid(0.012, 0.01, 0.03, 8, 6), '#5fd0ff', { p: [0, 0.014, 0.05] }));
  } else {
    for (const [x, z] of [[0, 0.05], [-0.06, -0.03], [0.06, -0.03]]) {
      parts.push(part(softBox(0.03, 0.012, 0.03), '#2a2c30', { p: [x, 0, z] }));
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(part(cylinder(0.012, 0.012, 0.002, 10), '#5ff0ff', { p: [x + dx * 0.02, 0.006, z + dz * 0.02] }));
      parts.push(part(sphere(0.006, 6, 4), '#ffffff', { p: [x, 0.008, z] }, 1));
    }
  }
  return merge(parts);
}

/** A ring of sandbags and stakes around a fortified squad. */
export function fort(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 11; k++) {
    const a = Math.PI * 0.62 + (k / 10) * Math.PI * 1.76;
    const g = ellipsoid(0.03, 0.016, 0.018, 8, 5);
    g.rotateY(-a);
    g.translate(Math.cos(a) * 0.17, 0.014, Math.sin(a) * 0.17);
    parts.push(prep(g, k % 2 ? '#c9b07a' : '#bba06a'));
    if (k % 3 === 0) parts.push(part(cone(0.007, 0.05, 5), '#8a6440', { p: [Math.cos(a) * 0.2, 0.025, Math.sin(a) * 0.2], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] }));
  }
  return merge(parts);
}

export function shadowBlob(): BufferGeometry {
  return prep(xf(cylinder(0.09, 0.09, 0.002, 16), { p: [0, 0.002, 0] }), '#000000');
}

// --- Squads on the map ----------------------------------------------------------------------

const SCALE = 1.0;

function figure(look: Look, seed: number, x: number, z: number, rot: number, bob: number, pose: 'stand' | 'ready' = 'stand'): BufferGeometry {
  const g = poseRig(soldierRig(look, seed), pose);
  g.rotateY(rot);
  g.translate(x, 0, z);
  return tagBob(g, bob);
}

/**
 * The map model for a unit type: a small squad (three soldiers), a rider
 * pair, a war machine with its crew, a ship or aircraft. Faces +z.
 */
export function squadGeo(type: string, cls: string): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const look = LOOKS[type];
  if (cls === 'naval') return xf(ship(type), { s: 1.25 });
  if (cls === 'air') {
    const air = aircraft(type === 'biplane' ? 'biplane' : type === 'jet' ? 'jet' : 'drones');
    return tagBob(xf(air, { s: 1.4, p: [0, 0.42, 0] }), 1);
  }
  if (type === 'settler') {
    parts.push(figure(look, 3, -0.06, 0.04, 0.3, 1));
    parts.push(figure({ ...look, backpack: false, helmet: 'none' }, 7, 0.07, 0.02, -0.2, 2));
    parts.push(xf(cart(), { r: [0, -0.4, 0], p: [0.0, 0, -0.11], s: 1.3 }));
    return xf(merge(parts), { s: SCALE * 1.1 });
  }
  if (cls === 'recon') {
    parts.push(figure({ ...look, banner: true }, 5, -0.05, 0.03, 0.15, 1));
    parts.push(figure(look, 9, 0.07, -0.04, -0.2, 2));
    return xf(merge(parts), { s: SCALE * 1.1 });
  }
  if (cls === 'cavalry') {
    if (type === 'tanks' || type === 'modarmor' || type === 'hovertank') {
      const k = type === 'tanks' ? 'tank' : type === 'modarmor' ? 'modern' : 'hover';
      parts.push(tagBob(xf(tank(k), { s: 1.35, p: [0.02, 0, 0.03] }), 1));
      return merge(parts);
    }
    const riders: [number, number, number][] = [[-0.07, 0.04, 1], [0.08, -0.05, 2]];
    for (const [x, z, b] of riders) {
      const horse = horseGeo(b === 1 ? '#8a5a34' : '#5a3a26', '#2a1a12', type === 'knights');
      const rider = poseRig(soldierRig({ ...look, banner: b === 1 }, 11 + b), 'ride');
      rider.translate(0, 0.075, 0.0);
      parts.push(tagBob(xf(merge([horse, rider]), { s: 1.05, p: [x, 0, z] }), b));
    }
    return merge(parts);
  }
  if (cls === 'siege') {
    let machine: BufferGeometry;
    if (type === 'catapult') machine = catapult(false);
    else if (type === 'trebuchet') machine = catapult(true);
    else if (type === 'cannon') machine = cannon(false);
    else if (type === 'artillery') machine = cannon(true);
    else machine = rocketTruck();
    parts.push(xf(machine, { s: 1.5, p: [0.02, 0, 0.03] }));
    const crewLook = type === 'artillery' || type === 'rocketart' ? { ...LOOKS.crew, helmet: 'steel' as Helmet, torso: 'olive' as Torso } : type === 'cannon' ? { ...LOOKS.crew, helmet: 'tricorn' as Helmet, torso: 'coat' as Torso } : { ...LOOKS.crew, helmet: 'iron' as Helmet };
    parts.push(figure({ ...crewLook, banner: true }, 13, -0.11, -0.06, 0.4, 1));
    return merge(parts);
  }
  if (type === 'gatling' || type === 'machinegun') {
    parts.push(xf(gatlingGun(type === 'machinegun'), { s: 1.5, p: [0.02, 0, 0.05] }));
    parts.push(figure({ ...look, banner: true }, 17, -0.08, -0.05, 0.3, 1));
    parts.push(figure(look, 19, 0.1, -0.06, -0.3, 2));
    return merge(parts);
  }
  // Foot soldiers: three in a wedge, the leader with the standard.
  const lead = { ...look, banner: true };
  parts.push(figure(lead, 21, 0, 0.07, 0, 1, 'ready'));
  parts.push(figure(look, 23, -0.1, -0.05, 0.1, 2, 'ready'));
  parts.push(figure(look, 25, 0.1, -0.05, -0.1, 3, 'ready'));
  return xf(merge(parts), { s: SCALE });
}

