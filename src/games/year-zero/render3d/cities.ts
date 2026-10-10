// Cities as little 3D towns that grow with their population, change style
// with their people's era, show the buildings they have built (windmills for
// granaries, domes for libraries, smokestacks for factories…) and fly their
// owner's colours. Each city is one merged mesh, rebuilt only when its size,
// era, buildings, wonders or owner change.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RGBADepthPacking,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Rng } from '../../shared/rng';
import type { Game } from '../sim/game';
import type { City, Civ } from '../sim/state';
import { Relief } from '../data/terrain';
import { merge, xf } from './geo';
import { CELL, kitGeo, kitPart } from './kit';
import { broadleaf } from './models/kitnature';
import { HEX_GLSL } from './hexgl';
import * as B from './models/buildings';
import { EDGE_N, hexDist, type Shape } from './shape';
import { depthKey, hexPatch, type SharedUniforms } from './terrain';

interface CityView {
  key: string;
  mesh: Mesh;
  sails: Object3D[];
  flags: [number, number, number][];
  smoke: [number, number, number, number][];
}

const S = 2.15;
/** KayKit building scale (a KayKit hex is 1.155 across the corners; a house ends up a quarter of a tile wide). */
const K = 0.34;
const WALL = 0.23;
const UP = new Vector3(0, 1, 0);
const ROOFS = ['#c8553d', '#b5653a', '#7a8fa6', '#e4d2a8', '#8f5a3c'];
const STRAW = new Color('#d9b45a');
/** Warmer, lighter stone than the kit's slate, closer to a storybook town. */
const STONE = { cells: { [CELL.rockMid]: '#9c958b', [CELL.rockDark]: '#7d766d', 4: '#6d6760' } };
const MODERN = ['c_building_A', 'c_building_B', 'c_building_C', 'c_building_D', 'c_building_E', 'c_building_F', 'c_building_G'];
const FUTURE = ['s_basemodule_A', 's_basemodule_B', 's_basemodule_C', 's_basemodule_D', 's_basemodule_E'];

/** Multiplies the team-marked vertices by a colour and clears the mark (cities bake their owner's colour). */
function paintTeam(g: BufferGeometry, c: Color): BufferGeometry {
  const team = g.attributes.team;
  const col = g.attributes.color;
  for (let i = 0; i < team.count; i++) {
    const t = team.getX(i);
    if (t <= 0 || t > 1.5) continue;
    col.setXYZ(i, col.getX(i) * (1 - t + c.r * t), col.getY(i) * (1 - t + c.g * t), col.getZ(i) * (1 - t + c.b * t));
    team.setX(i, 0);
  }
  return g;
}

export class Cities {
  readonly group = new Group();
  private views = new Map<number, CityView>();
  private mat: MeshStandardMaterial;
  private depth: MeshDepthMaterial;
  private flagMesh: InstancedMesh | null = null;
  private flagMat: MeshStandardMaterial;
  private smoke: Smoke;
  private flagsDirty = true;
  private g: Game | null = null;

  constructor(private shape: Shape, uniforms: SharedUniforms) {
    const head = 'attribute float aTile;\nflat varying float vTileF;';
    const hide = 'vTileF = aTile;\nif ((yzFlags(texelFetch(uTiles, yzTileCoord(aTile), 0)) & 1) == 0) transformed *= 0.0;';
    this.mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
    hexPatch(this.mat, uniforms, { head, begin: hide }, {
      head: 'flat varying float vTileF;',
      out: 'gl_FragColor.rgb = yzFog(gl_FragColor.rgb, (yzFlags(texelFetch(uTiles, yzTileCoord(vTileF), 0)) & 2) != 0 ? 1.0 : 0.0);',
    });
    this.depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    depthKey(this.depth, 'cities-depth');
    this.depth.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `${HEX_GLSL}\n${head}\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>\n${hide}`);
      shader.fragmentShader = `flat varying float vTileF;\n${shader.fragmentShader}`;
    };
    this.flagMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: DoubleSide });
    hexPatch(this.flagMat, uniforms, {
      head,
      team: true,
      begin: `${hide}
        {
          float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;
          float wave = sin(uTime * 5.0 + ph - position.x * 60.0) * 0.006 * (position.x * 16.0);
          transformed.z += wave;
          transformed.y += sin(uTime * 3.0 + ph) * 0.002 * position.x * 16.0;
        }`,
    }, {
      head: 'flat varying float vTileF;',
      out: 'gl_FragColor.rgb = yzFog(gl_FragColor.rgb, (yzFlags(texelFetch(uTiles, yzTileCoord(vTileF), 0)) & 2) != 0 ? 1.0 : 0.0);',
    });
    this.smoke = new Smoke(uniforms);
    this.group.add(this.smoke.mesh);
  }

  update(g: Game, _reveal: boolean): void {
    this.g = g;
    const seen = new Set<number>();
    for (const city of Object.values(g.s.cities)) {
      if (!city) continue;
      seen.add(city.id);
      const civ = g.civ(city.civId);
      const key = this.signature(city, civ);
      const v = this.views.get(city.id);
      if (v && v.key === key) continue;
      if (v) this.drop(v);
      this.views.set(city.id, this.build(city, civ, key));
      this.flagsDirty = true;
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.drop(v);
        this.views.delete(id);
        this.flagsDirty = true;
      }
    }
    if (this.flagsDirty) this.rebuildFlags();
  }

  private signature(city: City, civ: Civ): string {
    const tier = Math.min(9, civ.eraTier);
    // houses grow in steps so a city is not rebuilt every single growth
    return [city.tile, Math.min(30, city.size), tier, civ.color, civ.capitalId === city.id, [...city.buildings].sort().join(','), [...city.wonders].sort().join(',')].join('|');
  }

  private drop(v: CityView): void {
    this.group.remove(v.mesh);
    v.mesh.geometry.dispose();
  }

  private build(city: City, civ: Civ, key: string): CityView {
    const shape = this.shape;
    const tile = city.tile;
    const cx = shape.cx(tile);
    const cz = shape.cz(tile);
    const rng = new Rng(city.id * 7919 + tile * 31 + 17);
    const tier = Math.min(9, civ.eraTier);
    const capital = civ.capitalId === city.id;
    const team = new Color(civ.color);
    // most roofs wear the owner's colour; the rest come from a warm palette
    const roofs = ROOFS.map((c) => new Color(c));
    const roof = () => (rng.chance(0.6) ? team : rng.pick(roofs));
    const parts: BufferGeometry[] = [];
    const taken: [number, number, number][] = [];
    const sails: Object3D[] = [];
    const flags: [number, number, number][] = [];
    const smoke: [number, number, number, number][] = [];
    const ground = (lx: number, lz: number) => shape.height(tile, cx + lx, cz + lz);
    /** Places a kit model (feet on the ground) with its team parts painted. */
    const kitPut = (name: string, lx: number, lz: number, rot: number, s: number, r: number, paint: Color = team, dy = 0) => {
      const g = paintTeam(kitGeo(name, STONE, 'town').clone(), paint);
      parts.push(B.place(g, cx + lx, ground(lx, lz) - 0.006 + dy, cz + lz, rot, s));
      taken.push([lx, lz, r]);
    };
    const put = (geo: BufferGeometry, lx: number, lz: number, rot: number, s = S, r = 0.08) => {
      parts.push(B.place(geo, cx + lx, ground(lx, lz) - 0.004, cz + lz, rot, s));
      taken.push([lx, lz, r]);
    };
    const free = (lx: number, lz: number, r: number) => taken.every(([x, z, rr]) => Math.hypot(x - lx, z - lz) > r + rr);
    const spot = (minR: number, maxR: number, r: number, tries = 28): [number, number] | null => {
      for (let k = 0; k < tries; k++) {
        const a = rng.next() * Math.PI * 2;
        const d = minR + rng.next() * (maxR - minR);
        const lx = Math.cos(a) * d;
        const lz = Math.sin(a) * d;
        if (hexDist(lx, lz) > (d > 0.95 ? 1.5 : 0.95)) continue;
        if (d > 0.95 && !this.landAt(cx + lx, cz + lz)) continue;
        if (shape.riverDistance(tile, cx + lx, cz + lz) < 0.14 + r) continue;
        if (free(lx, lz, r)) return [lx, lz];
      }
      return null;
    };
    // KayKit doors face +z: turn each building toward the plaza
    const facing = (lx: number, lz: number) => Math.atan2(-lx, -lz) + rng.float(-0.3, 0.3);
    const buildings = new Set(city.buildings);
    const stone = buildings.has('walls') || buildings.has('castle');
    const walls = stone || tier <= 1;
    const wallR = 0.9;
    const modern = tier >= 5;

    // Ground: a plaza in the middle.
    parts.push(B.place(B.plaza(0.2, tier >= 2 ? '#d8cdb6' : '#c8a676'), cx, ground(0, 0) - 0.002, cz, 0, 1));
    taken.push([0, 0, 0.05]);

    // The heart of the city.
    if (capital) {
      if (tier <= 1) {
        kitPut('building_tavern', 0, -0.06, rng.float(-0.3, 0.3), K * 1.1, 0.2, team);
        put(B.campfire(), -0.16, 0.2, 0, S, 0.05);
        smoke.push([cx - 0.16, ground(-0.16, 0.2) + 0.06, cz + 0.2, tile]);
        flags.push([cx + 0.2, ground(0.2, 0.02) + 0.15, cz + 0.02]);
      } else {
        kitPut('building_castle', 0, -0.08, 0, K * 0.92, 0.27, team);
        flags.push([cx, ground(0, -0.08) + 1.08, cz - 0.08]);
      }
    } else if (tier <= 1) {
      put(B.campfire(), 0, 0, 0, S, 0.05);
      smoke.push([cx, ground(0, 0) + 0.06, cz, tile]);
    } else if (tier <= 6) {
      kitPut(rng.chance(0.5) ? 'building_tower_A' : 'building_tower_B', 0, -0.04, rng.float(0, 6), K * 0.85, 0.13, team);
    } else {
      kitPut('c_building_H', 0, -0.04, rng.float(0, 6), K * 0.62, 0.17, team);
    }

    // Walls: a palisade in the tribal ages, stone walls with towers once built.
    if (walls) {
      for (let k = 0; k < 6; k++) {
        const a0 = ((60 * k - 30) * Math.PI) / 180;
        const a1 = ((60 * (k + 1) - 30) * Math.PI) / 180;
        const x0 = Math.cos(a0) * wallR, z0 = Math.sin(a0) * wallR;
        const x1 = Math.cos(a1) * wallR, z1 = Math.sin(a1) * wallR;
        const rot = -Math.atan2(z1 - z0, x1 - x0);
        const gate = k === 1;
        if (!stone) {
          const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
          parts.push(B.place(B.palisade(Math.hypot(x1 - x0, z1 - z0) / S), cx + mx, ground(mx, mz) - 0.005, cz + mz, rot, S));
        } else {
          // two wall pieces per side; the side facing the viewer gets the gate
          for (let j = 0; j < 2; j++) {
            const t = (j + 0.5) / 2;
            const lx = x0 + (x1 - x0) * t;
            const lz = z0 + (z1 - z0) * t;
            const name = gate && j === 0 ? 'wall_straight_gate' : 'wall_straight';
            parts.push(B.place(kitGeo(name, STONE, 'town').clone(), cx + lx, ground(lx, lz) - 0.01, cz + lz, rot, WALL));
          }
          parts.push(B.place(paintTeam(kitGeo('building_tower_base', STONE, 'town').clone(), team), cx + x0, ground(x0, z0) - 0.01, cz + z0, rng.float(0, 6), WALL * 1.05));
        }
      }
      for (let k = 0; k < 6; k++) {
        const a = ((60 * k - 30) * Math.PI) / 180;
        taken.push([Math.cos(a) * wallR, Math.sin(a) * wallR, 0.1]);
        const a2 = (60 * k * Math.PI) / 180;
        taken.push([Math.cos(a2) * wallR * 0.87, Math.sin(a2) * wallR * 0.87, 0.08]);
      }
    }

    // Where the water is (for harbours and lighthouses).
    let coastDir = -1;
    for (let d = 0; d < 6; d++) {
      const nb = shape.grid.neighbor(tile, d);
      if (nb >= 0 && shape.isWater(nb) && !shape.isIce(nb)) {
        if (coastDir < 0 || d === 5 || d === 4) coastDir = d;
      }
    }

    // Landmarks for the buildings it has.
    const inner = walls ? wallR - 0.1 : 0.82;
    const landmark = (name: string, r: number, s = K, minR = 0.28, maxR = 0.62, paint: Color = team) => {
      const p = spot(minR, Math.min(maxR, inner - r * 0.6), r);
      if (!p) return null;
      kitPut(name, p[0], p[1], facing(p[0], p[1]), s, r, paint);
      return p;
    };
    const proc = (geo: BufferGeometry, r: number, minR = 0.3, maxR = 0.6) => {
      const p = spot(minR, Math.min(maxR, inner - r * 0.6), r);
      if (!p) return null;
      put(geo, p[0], p[1], facing(p[0], p[1]), S, r);
      return p;
    };
    const mill = (name: 'building_windmill' | 'building_watermill', part: string, p: [number, number] | null, rot: number, s: number) => {
      const pc = p && kitPart(name, part);
      if (!p || !pc) return;
      const sail = new Mesh(paintTeam(pc.geo.clone(), team), this.mat);
      const gy = ground(p[0], p[1]) - 0.006;
      const v = new Vector3(pc.pivot[0], pc.pivot[1], pc.pivot[2]).multiplyScalar(s).applyAxisAngle(UP, rot);
      sail.position.set(cx + p[0] + v.x, gy + v.y, cz + p[1] + v.z);
      sail.rotation.order = 'YXZ';
      sail.rotation.y = rot;
      sail.scale.setScalar(s);
      sail.userData.spin = (0.6 + rng.next() * 0.5) * (name === 'building_watermill' ? -1 : 1);
      sail.userData.axis = name === 'building_watermill' ? 'x' : 'z';
      this.tagTile(sail, tile);
      sails.push(sail);
    };
    const millAt = (name: 'building_windmill' | 'building_watermill', part: string, minR: number, maxR: number) => {
      const r = 0.12;
      const p = spot(minR, Math.min(maxR, inner - 0.06), r);
      if (!p) return;
      const rot = facing(p[0], p[1]);
      kitPut(name, p[0], p[1], rot, K, r);
      // kitPut painted and placed the body; the turning part follows
      mill(name, part, p, rot, K);
    };
    for (const b of city.buildings) {
      switch (b) {
        case 'granary': millAt('building_windmill', 'windmill_top_fan', 0.35, 0.65); break;
        case 'shrine': case 'monument': proc(B.obelisk(), 0.05); break;
        case 'temple': landmark('building_church', 0.13); break;
        case 'library': landmark('building_tower_A', 0.1, K * 0.85); break;
        case 'university': landmark('building_tower_B', 0.11, K * 0.85); break;
        case 'observatory': proc(B.domeHall('#eef2f6'), 0.1); break;
        case 'bank': case 'exchange': modern ? landmark('c_building_C', 0.13, K * 0.5) : proc(B.domeHall(B.STYLE.gold), 0.1); break;
        case 'market': landmark('building_market', 0.15); break;
        case 'amphitheater': proc(B.arena(), 0.11); break;
        case 'aqueduct': proc(B.aqueduct(0.24), 0.14, 0.45, 0.7); break;
        case 'barracks': {
          const p = landmark('building_barracks', 0.15);
          if (p) flags.push([cx + p[0] + 0.05, ground(p[0], p[1]) + 0.42, cz + p[1]]);
          break;
        }
        case 'workshop': {
          const p = landmark('building_blacksmith', 0.13);
          if (p) smoke.push([cx + p[0], ground(p[0], p[1]) + 0.28, cz + p[1], tile]);
          break;
        }
        case 'castle': if (!capital) landmark('building_castle', 0.22, K * 0.7); else landmark('building_tower_catapult', 0.1, K * 0.8); break;
        case 'press': case 'hospital': modern ? landmark(rng.pick(['c_building_A', 'c_building_B']), 0.13, K * 0.5) : landmark('building_tavern', 0.13); break;
        case 'factory': case 'powerplant': case 'recycling': {
          const p = proc(B.factory(b === 'recycling' ? '#4f8f5a' : '#5a5f66'), 0.13, 0.4, 0.66);
          if (p) smoke.push([cx + p[0] + 0.07 * S, ground(p[0], p[1]) + 0.21 * S, cz + p[1] - 0.03 * S, tile]);
          break;
        }
        case 'nuclear': proc(B.arena(), 0.1); break;
        case 'broadcast': landmark('c_watertower', 0.06, K * 0.6); break;
        case 'researchlab': case 'geneclinic': case 'fusionreactor': case 'nanoforge': case 'synthfoundry': landmark(rng.pick(['s_basemodule_A', 's_basemodule_C', 's_basemodule_E']), 0.14, K * 0.36); break;
        case 'arcology': landmark('s_structure_tall', 0.14, K * 0.4); break;
        case 'harbor': break;
      }
    }
    if (shape.hasRiver(tile) && tier >= 2 && rng.chance(0.8)) millAt('building_watermill', 'watermill_wheel', 0.25, 0.6);
    // Harbour and boats on the shore side.
    if ((buildings.has('harbor') || city.wonders.includes('beacon')) && coastDir >= 0) {
      const [nx, nz] = EDGE_N[coastDir];
      const hx = nx * 0.8;
      const hz = nz * 0.8;
      parts.push(B.place(B.harbor(), cx + hx, 0.0, cz + hz, -Math.atan2(nz, nx) + Math.PI / 2, S));
      parts.push(B.place(paintTeam(kitGeo(tier >= 4 ? 'k_ship-light' : 'k_boat-small').clone(), team), cx + nx * 1.12 + nz * 0.15, -0.01, cz + nz * 1.12 - nx * 0.15, rng.float(0, 6), tier >= 4 ? 0.07 : 0.28));
      for (let k = 0; k < 2; k++) parts.push(B.place(kitGeo(rng.pick(['barrel', 'crate_A_small', 'sack'])).clone(), cx + hx * 0.92 + nz * (k - 0.5) * 0.12, ground(hx * 0.9, hz * 0.9), cz + hz * 0.92 - nx * (k - 0.5) * 0.12, rng.float(0, 6), 0.32));
      if (city.wonders.includes('beacon')) parts.push(B.place(B.lighthouse(), cx + nx * 0.62 - nz * 0.22, ground(nx * 0.62 - nz * 0.22, nz * 0.62 + nx * 0.22), cz + nz * 0.62 + nx * 0.22, 0, S));
    }
    // World wonders stand out.
    for (const w of city.wonders) {
      let geo: BufferGeometry | null = null;
      let r = 0.12;
      switch (w) {
        case 'stonecircle': geo = B.stoneCircle(); r = 0.15; break;
        case 'terraces': case 'sunhouse': geo = B.stepPyramid(); r = 0.17; break;
        case 'archive': case 'lastlibrary': geo = B.domeHall(B.STYLE.gold, '#f6efe0'); break;
        case 'clock': geo = B.clockTower(civ.color); r = 0.06; break;
        case 'bazaar': landmark('building_market', 0.15, K * 1.1); break;
        case 'engine': geo = B.factory('#8a6a3a'); r = 0.14; break;
        case 'exposition': case 'network': landmark('c_building_H', 0.15, K * 0.62, 0.3, 0.68, new Color(B.STYLE.gold)); break;
        case 'elevator': geo = B.rocketPad(civ.color); r = 0.1; break;
        case 'rampart': landmark('building_tower_B', 0.12, K); break;
        default: break;
      }
      if (geo) proc(geo, r, 0.3, 0.68);
    }

    // Homes: more with every size, styled by era.
    const homes = Math.max(5, Math.min(34, Math.round(5 + city.size * 1.7)));
    for (let k = 0; k < homes; k++) {
      const outside = k > homes * (walls ? 0.62 : 0.7);
      const r = modern ? 0.13 : 0.1;
      const p = outside ? spot(walls ? wallR + 0.12 : 0.8, 1.28, r) : spot(0.2, inner, r);
      if (!p) continue;
      const rot = facing(p[0], p[1]);
      if (tier === 0) put(rng.chance(0.45) ? B.teepee(rng, civ.color) : B.tribalHut(rng, civ.color), p[0], p[1], rot, S, 0.08);
      else if (tier === 1) rng.chance(0.4) ? put(B.tribalHut(rng, civ.color), p[0], p[1], rot, S * 1.1, 0.09) : kitPut('building_home_A', p[0], p[1], rot, K * 0.92, r, STRAW);
      else if (tier <= 4 || (tier <= 6 && rng.chance(0.55))) kitPut(rng.chance(0.55) ? 'building_home_A' : 'building_home_B', p[0], p[1], rot, K * rng.float(0.88, 1.0), r, roof());
      else if (tier <= 8) kitPut(rng.pick(MODERN), p[0], p[1], rot, K * 0.42 * rng.float(0.9, 1.1), r, roof());
      else kitPut(rng.pick(FUTURE), p[0], p[1], rot, K * 0.3, r, team);
    }
    // Fields and pens just outside town.
    if (tier >= 1 && !modern) for (let k = 0; k < 1 + Math.floor(city.size / 5); k++) {
      const p = spot(1.0, 1.35, 0.16, 12);
      if (p) put(B.cropField(rng), p[0], p[1], rng.float(0, 6), S, 0.16);
    }
    // Street life: crates, barrels, carts, lamps and a few garden trees.
    for (let k = 0; k < 2 + Math.floor(city.size / 3); k++) {
      const p = spot(0.12, inner, 0.035, 10);
      if (!p) continue;
      if (modern && rng.chance(0.5)) kitPut(rng.pick(['c_streetlight', 'c_bench', 'c_bush']), p[0], p[1], rng.float(0, 6), 0.3, 0.03);
      else kitPut(rng.pick(['barrel', 'crate_A_small', 'crate_B_small', 'sack', 'wheelbarrow', 'bucket_water']), p[0], p[1], rng.float(0, 6), 0.34, 0.03);
    }
    for (let k = 0; k < 2 + Math.floor(city.size / 4); k++) {
      const p = spot(0.25, 0.9, 0.04, 10);
      if (p) put(xf(broadleaf(city.id * 13 + k, rng.pick(['green', 'fresh', 'blossom'] as const)), { s: 0.8 / S }), p[0], p[1], rng.float(0, 6), S, 0.04);
    }

    const geo = merge(parts);
    const n = geo.attributes.position.count;
    geo.setAttribute('aTile', new BufferAttribute(new Float32Array(n).fill(tile), 1));
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = this.depth;
    for (const s of sails) mesh.add(s);
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    return { key, mesh, sails, flags, smoke };
  }

  /** Dry, unmountainous land at a world point (suburbs and fields stay off water and peaks). */
  private landAt(x: number, z: number): boolean {
    const t = this.shape.grid.pick(x, z, 1);
    return t >= 0 && !this.shape.isWater(t) && this.shape.map.relief[t] !== Relief.Mountain;
  }

  private tagTile(m: Mesh, tile: number): void {
    // sails share the city material, so give them a per-vertex tile too
    const g = m.geometry.clone();
    g.setAttribute('aTile', new BufferAttribute(new Float32Array(g.attributes.position.count).fill(tile), 1));
    m.geometry = g;
    m.castShadow = true;
  }

  private rebuildFlags(): void {
    this.flagsDirty = false;
    if (this.flagMesh) {
      this.group.remove(this.flagMesh);
      this.flagMesh.dispose();
      this.flagMesh = null;
    }
    const g = this.g;
    if (!g) return;
    const list: { p: [number, number, number]; color: string; tile: number }[] = [];
    const smoke: [number, number, number, number][] = [];
    for (const [id, v] of this.views) {
      const city = g.city(id);
      if (!city) continue;
      const color = g.civ(city.civId).color;
      for (const p of v.flags) list.push({ p, color, tile: city.tile });
      smoke.push(...v.smoke);
    }
    this.smoke.set(smoke);
    if (!list.length) return;
    const pole = B.flagPole(0.1);
    const cloth = B.flagCloth();
    cloth.translate(0, 0.08, 0);
    const base = merge([pole, cloth]);
    const geo = new InstancedBufferGeometry();
    for (const [name, attr] of Object.entries(base.attributes)) geo.setAttribute(name, attr);
    geo.setAttribute('aTile', new InstancedBufferAttribute(new Float32Array(list.map((l) => l.tile)), 1));
    // the pole keeps its own colour; only the cloth (team = 1) takes the civ colour
    const mesh = new InstancedMesh(geo, this.flagMat, list.length);
    const m = new Matrix4();
    list.forEach((l, k) => {
      m.makeScale(S, S, S).setPosition(l.p[0], l.p[1] - 0.1 * S, l.p[2]);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, new Color(l.color));
    });
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    this.flagMesh = mesh;
    this.group.add(mesh);
  }

  tick(dt: number, _time: number): void {
    for (const v of this.views.values()) for (const s of v.sails) {
      if (s.userData.axis === 'x') s.rotation.x += dt * (s.userData.spin as number);
      else s.rotation.z += dt * (s.userData.spin as number);
    }
  }

  dispose(): void {
    for (const v of this.views.values()) this.drop(v);
    this.views.clear();
    this.flagMesh?.dispose();
    this.mat.dispose();
    this.flagMat.dispose();
    this.depth.dispose();
    this.smoke.dispose();
  }
}

// --- Chimney smoke --------------------------------------------------------------------------

const SMOKE_VERT = /* glsl */ `
${HEX_GLSL}
attribute vec4 aSrc;
attribute float aPhase;
varying vec2 vUv;
varying float vLife;
flat varying float vTileF;
void main() {
  vUv = uv;
  vTileF = aSrc.w;
  float life = fract(uTime * 0.22 + aPhase);
  vLife = life;
  vec3 p = aSrc.xyz + vec3(sin(aPhase * 40.0 + life * 3.0) * 0.03 + life * 0.08, life * 0.32, 0.0);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float s = 0.035 + life * 0.08;
  mv.xy += position.xy * s;
  if ((yzFlags(texelFetch(uTiles, yzTileCoord(aSrc.w), 0)) & 2) == 0) mv.xyz = vec3(0.0, 0.0, 10.0);
  gl_Position = projectionMatrix * mv;
}`;

const SMOKE_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vLife;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.4, 1.0, d)) * (1.0 - vLife) * smoothstep(0.0, 0.12, vLife) * 0.55;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.92, 0.92, 0.94), a);
}`;

class Smoke {
  readonly mesh: Mesh;
  private geo = new InstancedBufferGeometry();
  private mat: ShaderMaterial;

  constructor(uniforms: SharedUniforms) {
    const quad = new PlaneGeometry(1, 1);
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    this.geo.setIndex(quad.index);
    this.geo.instanceCount = 0;
    this.mat = new ShaderMaterial({ vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false });
    this.mat.uniforms = uniforms;
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  set(sources: [number, number, number, number][]): void {
    const src: number[] = [];
    const phase: number[] = [];
    for (const s of sources) {
      for (let k = 0; k < 4; k++) {
        src.push(s[0], s[1], s[2], s[3]);
        phase.push(k / 4 + (s[0] * 0.37 % 0.25));
      }
    }
    this.geo.setAttribute('aSrc', new InstancedBufferAttribute(new Float32Array(src), 4));
    this.geo.setAttribute('aPhase', new InstancedBufferAttribute(new Float32Array(phase), 1));
    this.geo.instanceCount = phase.length;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
