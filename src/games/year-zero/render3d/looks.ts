// What every unit type looks like on the map and in battle: squads of voxel
// characters from the shared kit, riders on voxel horses, crews beside their
// machines, and Kenney ships (CC0, voxelised). Each look is baked by rig.ts
// into one instanced, skeletally animated mesh.

import { BufferGeometry, Color, Matrix4 } from 'three';
import { Rng } from '../../shared/rng';
import { UNIT } from '../data/units';
import { cone, cylinder, ellipsoid, faceted, gradient, merge, part, prep, xf, box } from './geo';
import { voxelize } from '../../shared/chibi/voxel';
import { kitGeo } from './kit';
import { F } from './models/voxel';

const { aircraft, cannon, cart, catapult, fort, gatlingGun, rocketTruck, ship, tank } = F;
import type { AnimState, FigureSpec, LookSpec, RigidSpec } from './rig';
import { archer, BUILDER, cavalry as chibiCavalry, engineer, FARMER, gunner, scout as chibiScout, spearGuard, swordsman, warrior, withOutfit } from '../../shared/chibi/catalog';
import { TEAM } from '../../shared/chibi/crowd';
import type { ChibiSpec } from '../../shared/chibi/spec';

/** Skin tone multipliers (linear RGB), one per people. */
export const SKIN_TONES: [number, number, number][] = [[1, 1, 1], [0.93, 0.84, 0.76], [0.78, 0.62, 0.5], [0.58, 0.42, 0.32], [0.42, 0.29, 0.22], [1, 0.95, 0.92]];

/** A people's skin tone as a hex colour (sRGB) for materials that take a Color. */
export function skinHex(id: number): string {
  const [r, g, b] = SKIN_TONES[((id % SKIN_TONES.length) + SKIN_TONES.length) % SKIN_TONES.length];
  return `#${new Color(r, g, b).getHexString()}`;
}

/** A little gold crown with jewels (leaders, royal guards). */
export function crown(): BufferGeometry {
  const parts: BufferGeometry[] = [part(cylinder(0.42, 0.4, 0.22, 12, true), '#f2c14e', { p: [0, 0.98, 0] })];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    parts.push(part(faceted(cone(0.09, 0.22, 4)), '#f2c14e', { p: [Math.cos(a) * 0.4, 1.18, Math.sin(a) * 0.4] }));
    parts.push(part(faceted(ellipsoid(0.05, 0.05, 0.05, 6, 4)), k % 2 ? '#e2384a' : '#3a8ae2', { p: [Math.cos(a) * 0.43, 1.0, Math.sin(a) * 0.43] }));
  }
  return merge(parts);
}

/** Three figures in a loose wedge (two in front, one behind). */
const WEDGE: [number, number, number][] = [[-0.14, 0.08, 0.12], [0.15, 0.06, -0.1], [0.01, -0.13, 0.02]];
const PAIR: [number, number, number][] = [[-0.11, 0.04, 0.15], [0.12, -0.04, -0.12]];





function horseParts(coat: string, mane: string, barding: boolean): Record<string, BufferGeometry> {
  const body = merge([
    gradient(faceted(xf(ellipsoid(0.074, 0.066, 0.13, 12, 8), { p: [0, 0.155, 0] })), mane, coat, { jitter: 0.03, seed: 3 }),
    // saddle blanket in the owner's colour, saddle and girth
    part(faceted(xf(ellipsoid(0.077, 0.024, 0.07, 12, 4), { p: [0, 0.2, -0.008] })), '#ffffff', {}, 1),
    part(box(0.085, 0.024, 0.06), '#6b4a2e', { p: [0, 0.218, -0.01] }),
    part(box(0.15, 0.012, 0.016), '#4a2e1a', { p: [0, 0.16, -0.01] }),
    ...(barding ? [part(faceted(xf(ellipsoid(0.08, 0.05, 0.135, 12, 6), { p: [0, 0.14, 0] })), '#ffffff', {}, 1), part(faceted(xf(ellipsoid(0.081, 0.02, 0.137, 12, 4), { p: [0, 0.112, 0] })), '#f2c14e')] : []),
  ]);
  const head = merge([
    // neck, head, muzzle, ears, eyes and mane (pivot at the withers)
    gradient(faceted(xf(ellipsoid(0.038, 0.075, 0.042, 10, 6), { p: [0, 0.05, 0.03], r: [0.6, 0, 0] })), mane, coat, { seed: 5 }),
    gradient(faceted(xf(ellipsoid(0.036, 0.038, 0.06, 10, 6), { p: [0, 0.112, 0.085], r: [0.35, 0, 0] })), coat, coat, { seed: 6 }),
    part(faceted(xf(ellipsoid(0.03, 0.028, 0.03, 8, 5), { p: [0, 0.093, 0.128] })), '#f0d9c0'),
    part(faceted(cone(0.011, 0.034, 4)), coat, { p: [0.018, 0.155, 0.065] }),
    part(faceted(cone(0.011, 0.034, 4)), coat, { p: [-0.018, 0.155, 0.065] }),
    part(box(0.016, 0.1, 0.05), mane, { p: [0, 0.085, 0.0], r: [0.6, 0, 0] }),
    part(ellipsoid(0.008, 0.009, 0.006, 6, 4), '#141010', { p: [0.031, 0.122, 0.095] }),
    part(ellipsoid(0.008, 0.009, 0.006, 6, 4), '#141010', { p: [-0.031, 0.122, 0.095] }),
    part(box(0.075, 0.01, 0.01), '#5a3a22', { p: [0, 0.1, 0.11] }),
  ]);
  const leg = merge([
    gradient(faceted(cylinder(0.021, 0.016, 0.1, 7)), coat, coat, { seed: 7 }),
    part(cylinder(0.019, 0.021, 0.022, 7), '#2a1a12', { p: [0, -0.058, 0] }),
  ]);
  leg.translate(0, -0.05, 0);
  const tail = merge([part(faceted(xf(ellipsoid(0.02, 0.065, 0.022, 7, 5), { p: [0, -0.055, 0] })), mane)]);
  // drawn in voxels like everything else (about 16 voxels to the body's length)
  const v = (g: BufferGeometry) => {
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    return prep(voxelize(g, Math.max(0.3 / 22, span / 14)));
  };
  return { body: v(body), head: v(head), leg: v(leg), tail: v(tail) };
}

/** A galloping (or standing) horse as rigid parts with hand-made motion. */
function horse(coat: string, mane: string, barding: boolean, at: [number, number], yaw: number): RigidSpec[] {
  const p = horseParts(coat, mane, barding);
  const base = new Matrix4().makeRotationY(yaw).setPosition(at[0], 0, at[1]);
  const body = new Matrix4();
  const tmp = new Matrix4();
  const pose = (s: AnimState, t: number) => {
    // body bob and pitch
    const gallop = s === 'walk' ? 1 : 0;
    const w = Math.PI * 2 * (s === 'walk' ? t / 0.55 : t / 1.6);
    let bob = gallop ? Math.abs(Math.sin(w)) * 0.018 : Math.sin(w) * 0.002;
    let pitch = gallop ? Math.sin(w) * 0.06 : 0;
    let roll = 0;
    let drop = 0;
    if (s === 'attack') {
      const k = Math.sin(Math.min(1, t / 0.9) * Math.PI);
      pitch = -0.45 * k;
      bob = 0.03 * k;
    } else if (s === 'hit') {
      pitch = 0.12 * Math.sin(Math.min(1, t / 0.6) * Math.PI);
    } else if (s === 'death') {
      const k = Math.min(1, t / 0.7);
      roll = 1.3 * k * k;
      drop = -0.05 * k;
    }
    body.copy(base).multiply(tmp.makeTranslation(0, bob + drop, 0)).multiply(new Matrix4().makeRotationX(pitch)).multiply(new Matrix4().makeRotationZ(roll));
    return { w, gallop };
  };
  const legAt = (x: number, z: number, ph: number): RigidSpec['motion'] => (s, t, out) => {
    const { w, gallop } = pose(s, t);
    const swing = gallop ? Math.sin(w + ph) * 0.65 : s === 'attack' && z > 0 ? -0.9 * Math.sin(Math.min(1, t / 0.9) * Math.PI) : 0;
    out.copy(body).multiply(tmp.makeTranslation(x, 0.118, z)).multiply(new Matrix4().makeRotationX(swing));
  };
  return [
    { name: 'horse', geo: p.body, motion: (s, t, out) => { pose(s, t); out.copy(body); } },
    { name: 'horseHead', geo: p.head, motion: (s, t, out) => { const { w } = pose(s, t); out.copy(body).multiply(tmp.makeTranslation(0, 0.17, 0.1)).multiply(new Matrix4().makeRotationX(Math.sin(w * 2) * 0.08)); } },
    { name: 'legFL', geo: p.leg.clone(), motion: legAt(0.042, 0.082, 0) },
    { name: 'legFR', geo: p.leg.clone(), motion: legAt(-0.042, 0.082, Math.PI * 0.5) },
    { name: 'legBL', geo: p.leg.clone(), motion: legAt(0.042, -0.082, Math.PI) },
    { name: 'legBR', geo: p.leg.clone(), motion: legAt(-0.042, -0.082, Math.PI * 1.5) },
    { name: 'tail', geo: p.tail, motion: (s, t, out) => { const { w } = pose(s, t); out.copy(body).multiply(tmp.makeTranslation(0, 0.19, -0.125)).multiply(new Matrix4().makeRotationX(0.45 + Math.sin(w * 1.5) * 0.25)); } },
  ];
}

// --- machines, ships, aircraft ------------------------------------------------------------------

/** Old procedural vehicle models are sized for a 2x scale. */
const OLD = 2.0;

function rigidGeo(geo: BufferGeometry, s = OLD, p: [number, number, number] = [0, 0, 0], yaw = 0): BufferGeometry {
  return xf(geo, { s, r: [0, yaw, 0], p });
}

function bobbing(amount: number, speed: number, tilt = 0.04): RigidSpec['motion'] {
  return (s, t, out) => {
    const w = (t * Math.PI * 2) / speed;
    let y = Math.sin(w) * amount;
    let r = Math.sin(w * 0.7) * tilt;
    if (s === 'death') {
      const k = Math.min(1, t / 0.8);
      y -= 0.12 * k;
      r += 0.8 * k;
    } else if (s === 'hit') r += Math.sin(t * 30) * 0.05 * Math.max(0, 1 - t / 0.5);
    out.makeRotationZ(r).setPosition(0, y, 0);
  };
}

function recoil(back = 0.03): RigidSpec['motion'] {
  return (s, t, out) => {
    out.identity();
    if (s === 'attack') {
      const k = t < 0.35 ? 0 : Math.exp(-(t - 0.35) * 8);
      out.setPosition(0, 0, -back * k);
    } else if (s === 'walk') out.setPosition(0, Math.abs(Math.sin(t * 9)) * 0.006, 0);
    else if (s === 'death') {
      const k = Math.min(1, t / 0.8);
      out.makeRotationZ(k * 0.6).setPosition(0, -0.02 * k, 0);
    }
  };
}

function chibiCrew(spec: ChibiSpec): FigureSpec[] {
  return [
    chibiFigure(spec, { p: [-0.15, 0, -0.1], r: [0, 0.5, 0], s: CHIBI }, 0.2, WORK),
    chibiFigure(spec, { p: [0.15, 0, -0.12], r: [0, -0.4, 0], s: CHIBI }, 0.6, WORK),
  ];
}

function kenneyShip(name: string, s: number): BufferGeometry {
  return xf(kitGeo(name).clone(), { s, r: [0, Math.PI, 0] });
}

// --- chibi squads (the shared art kit, dressed in the TEAM marker colours) --------------------------

/** World scale of a chibi figure (≈ the height of the old KayKit squads; chibis are 1.26 tall). */
export const CHIBI = 0.3;

type ChibiClips = FigureSpec['chibiClips'];

function chibiFigure(spec: ChibiSpec, t: FigureSpec['t'], phase: number, clips?: ChibiClips): FigureSpec {
  return { chibi: spec, chibiClips: clips, t, phase };
}

function chibiSquad(spots: [number, number, number][], make: (k: number) => ChibiSpec, clips?: ChibiClips): FigureSpec[] {
  return spots.map(([x, z, yaw], k) => chibiFigure(make(k), { p: [x, 0, z], r: [0, yaw, 0], s: CHIBI }, k * 0.37, clips));
}

const MELEE: ChibiClips = { attack: 'attack' };
const THRUST: ChibiClips = { attack: 'thrust' };
const SHOOT: ChibiClips = { attack: 'shoot' };
const FIRE: ChibiClips = { attack: 'fire' };
const WORK: ChibiClips = { idle: 'idle', attack: 'work' };

/** Chibi riders astride KayKit-era horses. */
function chibiRiders(spec: ChibiSpec, coats: [string, string][], barding: boolean, clips: ChibiClips = MELEE): LookSpec {
  const rigid: RigidSpec[] = [];
  const figures: FigureSpec[] = [];
  PAIR.forEach(([x, z, yaw], k) => {
    const [coat, mane] = coats[k % coats.length];
    const parts = horse(coat, mane, barding, [x * 1.45, z * 1.3], yaw * 0.4);
    for (const r of parts) r.name += k;
    rigid.push(...parts);
    const f = chibiFigure(spec, { p: [0, 0.1, -0.03], s: CHIBI * 0.82 }, k * 0.3, { idle: 'ride', walk: 'ride', run: 'ride', attack: clips?.attack ?? 'attack', hit: 'ride', death: 'ride', cheer: 'ride', aim: 'ride' });
    f.mount = `horse${k}`;
    figures.push(f);
  });
  return { figures, rigid };
}

const T = TEAM;

// --- the catalogue -------------------------------------------------------------------------------

const looks = new Map<string, LookSpec>();

/** The look of a unit type (or 'embark' / 'fort'). */
export function lookSpec(type: string): LookSpec {
  let l = looks.get(type);
  if (!l) {
    l = makeLook(type);
    looks.set(type, l);
  }
  return l;
}

function makeLook(type: string): LookSpec {
  const rng = new Rng(type.length * 31 + type.charCodeAt(0));
  switch (type) {
    case 'settler':
      return {
        figures: [chibiFigure(FARMER, { p: [-0.13, 0, 0.05], r: [0, 0.2, 0], s: CHIBI }, 0), chibiFigure(BUILDER, { p: [0.12, 0, 0.04], r: [0, -0.2, 0], s: CHIBI }, 0.5, WORK)],
        rigid: [{ name: 'cart', geo: rigidGeo(cart(), 1.9, [0.0, 0, -0.16], 0.3), motion: recoil(0) }],
      };
    case 'scout':
      return { figures: chibiSquad(PAIR, (k) => (k ? chibiScout(T) : withOutfit(chibiScout(T), [{ k: 'item', item: 'spyglass', hand: 'R' }], 'scout-glass'))) };
    case 'explorer':
      return { figures: chibiSquad(PAIR, (k) => withOutfit(chibiScout(T), [{ k: 'hat', style: 'fisher', color: '#e8dcb8', band: T.main }], `explorer-${k}`)) };
    case 'warband':
      return { figures: chibiSquad(WEDGE, () => warrior(T), MELEE) };
    case 'spearmen':
    case 'pikemen':
      return { figures: chibiSquad(WEDGE, () => spearGuard(T), THRUST) };
    case 'swordsmen':
      return { figures: chibiSquad(WEDGE, () => swordsman(T), MELEE) };
    case 'musketeers':
      return { figures: chibiSquad(WEDGE, () => gunner(T, 'musket'), FIRE) };
    case 'riflemen':
      return { figures: chibiSquad(WEDGE, () => gunner(T, 'rifle'), FIRE) };
    case 'infantry':
      return { figures: chibiSquad(WEDGE, () => gunner(T, 'modern'), FIRE) };
    case 'mechinf':
      return { figures: chibiSquad(PAIR, () => gunner(T, 'modern'), FIRE), rigid: [{ name: 'apc', geo: rigidGeo(tank('modern'), 1.5, [0, 0, -0.2]), motion: recoil(0.01) }] };
    case 'exolegion':
      return { figures: chibiSquad(WEDGE, () => withOutfit(gunner(T, 'modern'), [{ k: 'helmet', color: '#d8dde6', trim: T.main, visor: true }, { k: 'pauldrons', color: '#d8dde6', trim: T.main }, { k: 'cape', color: T.main, length: 0.3, inner: T.dark }], 'exo'), FIRE) };
    case 'archers':
    case 'crossbow':
      return { figures: chibiSquad(WEDGE, () => archer(T), SHOOT) };
    case 'gatling': case 'machinegun':
      return { figures: chibiCrew(withOutfit(gunner(T, type === 'gatling' ? 'rifle' : 'modern'), [], `gunner-${type}`)), rigid: [{ name: 'gun', geo: rigidGeo(gatlingGun(type === 'machinegun'), 1.9, [0.02, 0, 0.08]), motion: recoil(0.015) }] };
    case 'horsemen':
      return chibiRiders(withOutfit(warrior(T), [], 'horseman'), [['#8a5a34', '#3a2618'], ['#c9a06a', '#6b4a2e']], false);
    case 'knights':
      return chibiRiders(chibiCavalry(T), [['#e8e2d6', '#9a8f80'], ['#5a3a26', '#2a1a12']], true);
    case 'cavalry':
      return chibiRiders(withOutfit(gunner(T, 'rifle'), [{ k: 'cape', color: T.main, length: 0.3, inner: T.dark }], 'dragoon'), [['#5a3a26', '#1e140e'], ['#8a5a34', '#3a2618']], false);
    case 'tanks': case 'modarmor': case 'hovertank': {
      const k = type === 'tanks' ? 'tank' : type === 'modarmor' ? 'modern' : 'hover';
      const hover = k === 'hover';
      return { figures: [], rigid: [{ name: 'tank', geo: rigidGeo(tank(k), 2.6, [0.02, 0, 0.02]), motion: hover ? bobbing(0.012, 1.6, 0.02) : recoil(0.03) }], durations: { attack: 0.9 } };
    }
    case 'catapult': case 'trebuchet':
      return { figures: chibiCrew(engineer(T)), rigid: [{ name: 'engine', geo: rigidGeo(catapult(type === 'trebuchet'), 2.6, [0.02, 0, 0.06]), motion: recoil(0.02) }] };
    case 'cannon':
      return { figures: chibiCrew(gunner(T, 'musket')), rigid: [{ name: 'engine', geo: rigidGeo(kitGeo('k_cannon-mobile').clone(), 0.32, [0.02, 0, 0.08]), motion: recoil(0.04) }] };
    case 'artillery':
      return { figures: chibiCrew(gunner(T, 'modern')), rigid: [{ name: 'engine', geo: rigidGeo(cannon(true), 2.8, [0.02, 0, 0.06]), motion: recoil(0.04) }] };
    case 'rocketart':
      return { figures: [], rigid: [{ name: 'engine', geo: rigidGeo(rocketTruck(), 2.6, [0.02, 0, 0.04]), motion: recoil(0.02) }], durations: { attack: 1.0 } };
    case 'galley':
      return { figures: [], rigid: [{ name: 'ship', geo: kenneyShip('k_ship-dark', 0.075), motion: bobbing(0.008, 2.6) }] };
    case 'caravel':
      return { figures: [], rigid: [{ name: 'ship', geo: kenneyShip('k_ship-light', 0.085), motion: bobbing(0.008, 2.8) }] };
    case 'frigate':
      return { figures: [], rigid: [{ name: 'ship', geo: kenneyShip('k_ship-dark', 0.1), motion: bobbing(0.007, 3.0) }] };
    case 'ironclad': case 'destroyer': case 'battleship': case 'stealthcruiser':
      return { figures: [], rigid: [{ name: 'ship', geo: rigidGeo(ship(type), 2.6), motion: bobbing(0.006, 3.2, 0.025) }] };
    case 'biplane': case 'jet': case 'drones': {
      const air = aircraft(type === 'biplane' ? 'biplane' : type === 'jet' ? 'jet' : 'drones');
      return { figures: [], rigid: [{ name: 'plane', geo: rigidGeo(air, 2.8, [0, 0.85, 0]), motion: bobbing(0.03, 2.2, 0.12) }] };
    }
    case 'embark':
      return { figures: [], rigid: [{ name: 'boat', geo: xf(kitGeo('k_boat-large').clone(), { s: 0.2, r: [0, Math.PI, 0] }), motion: bobbing(0.008, 2.4) }] };
    case 'fort':
      return { figures: [], rigid: [{ name: 'fort', geo: rigidGeo(fort(), 2.0) }] };
    default: {
      void rng;
      const cls = UNIT[type]?.cls;
      if (cls === 'naval') return makeLook('caravel');
      if (cls === 'air') return makeLook('biplane');
      return makeLook('warband');
    }
  }
}
