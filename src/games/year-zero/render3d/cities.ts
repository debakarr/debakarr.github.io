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
} from 'three';
import { Rng } from '../../shared/rng';
import type { Game } from '../sim/game';
import type { City, Civ } from '../sim/state';
import { merge } from './geo';
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

export class Cities {
  readonly group = new Group();
  private views = new Map<number, CityView>();
  private mat: MeshStandardMaterial;
  private depth: MeshDepthMaterial;
  private sailGeo = B.windmillSails();
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
    const team = civ.color;
    const roofPick = () => (rng.chance(0.62) ? team : rng.pick(B.STYLE.roofs));
    const parts: BufferGeometry[] = [];
    const taken: [number, number, number][] = [];
    const sails: Object3D[] = [];
    const flags: [number, number, number][] = [];
    const smoke: [number, number, number, number][] = [];
    const ground = (lx: number, lz: number) => shape.height(tile, cx + lx, cz + lz);
    const put = (geo: BufferGeometry, lx: number, lz: number, rot: number, s = S, r = 0.08) => {
      parts.push(B.place(geo, cx + lx, ground(lx, lz) - 0.004, cz + lz, rot, s));
      taken.push([lx, lz, r]);
    };
    const free = (lx: number, lz: number, r: number) => taken.every(([x, z, rr]) => Math.hypot(x - lx, z - lz) > r + rr);
    const spot = (minR: number, maxR: number, r: number, tries = 24): [number, number] | null => {
      for (let k = 0; k < tries; k++) {
        const a = rng.next() * Math.PI * 2;
        const d = minR + rng.next() * (maxR - minR);
        const lx = Math.cos(a) * d;
        const lz = Math.sin(a) * d;
        if (hexDist(lx, lz) > 0.9) continue;
        if (shape.riverDistance(tile, cx + lx, cz + lz) < 0.16 + r) continue;
        if (free(lx, lz, r)) return [lx, lz];
      }
      return null;
    };
    const facing = (lx: number, lz: number) => Math.atan2(-lx, -lz) + rng.float(-0.25, 0.25);
    const buildings = new Set(city.buildings);
    const walls = buildings.has('walls') || buildings.has('castle') || tier <= 1;
    const wallR = 0.8;

    // Ground: a plaza and paths.
    parts.push(B.place(B.plaza(0.2, tier >= 2 ? '#d8cdb6' : '#c8a676'), cx, ground(0, 0) - 0.002, cz, 0, 1));
    taken.push([0, 0, 0.05]);

    // The heart of the city.
    if (capital) {
      if (tier <= 1) {
        put(B.longhouse(rng, B.STYLE.thatch, team), 0, -0.05, 0, S * 1.15, 0.17);
        put(B.campfire(), -0.12, 0.2, 0, S, 0.05);
        smoke.push([cx - 0.12, ground(-0.12, 0.2) + 0.06, cz + 0.2, tile]);
        flags.push([cx + 0.15, ground(0.15, 0.02) + 0.15, cz + 0.02]);
      } else if (tier <= 6) {
        put(B.keep(rng, team), 0, -0.05, 0, S, 0.2);
        flags.push([cx, ground(0, -0.06) + 0.13 * S + 0.3 * S + 0.02, cz - 0.06]);
      } else {
        put(B.skyscraper(rng, 0.42, team), 0, -0.04, 0, S, 0.09);
        put(B.skyscraper(rng, 0.3, team), 0.1, 0.06, 0, S, 0.07);
      }
    } else if (tier <= 1) {
      put(B.campfire(), 0, 0, 0, S, 0.05);
      smoke.push([cx, ground(0, 0) + 0.06, cz, tile]);
    } else if (tier <= 4) {
      put(B.chapel(team, rng), 0, -0.04, 0, S, 0.12);
    } else if (tier <= 6) {
      put(B.brickBlock(rng, team, 3), 0, -0.03, 0, S, 0.09);
    } else {
      put(B.skyscraper(rng, 0.32, team), 0, -0.03, 0, S, 0.08);
    }

    // Walls (a palisade in the tribal ages), with a gate toward the viewer.
    if (walls) {
      for (let k = 0; k < 6; k++) {
        const a0 = ((60 * k - 30) * Math.PI) / 180;
        const a1 = ((60 * (k + 1) - 30) * Math.PI) / 180;
        const x0 = Math.cos(a0) * wallR, z0 = Math.sin(a0) * wallR;
        const x1 = Math.cos(a1) * wallR, z1 = Math.sin(a1) * wallR;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const len = Math.hypot(x1 - x0, z1 - z0) / S;
        const rot = -Math.atan2(z1 - z0, x1 - x0);
        const gate = k === 1;
        if (tier <= 1) {
          parts.push(B.place(B.palisade(len), cx + mx, ground(mx, mz) - 0.005, cz + mz, rot, S));
        } else if (gate) {
          const seg = B.wallSegment(len * 0.32);
          parts.push(B.place(seg.clone(), cx + x0 * 0.82 + x1 * 0.18, ground(mx, mz) - 0.005, cz + z0 * 0.82 + z1 * 0.18, rot, S));
          parts.push(B.place(seg, cx + x0 * 0.18 + x1 * 0.82, ground(mx, mz) - 0.005, cz + z0 * 0.18 + z1 * 0.82, rot, S));
          parts.push(B.place(B.gatehouse(team), cx + mx, ground(mx, mz) - 0.005, cz + mz, rot, S));
        } else {
          parts.push(B.place(B.wallSegment(len), cx + mx, ground(mx, mz) - 0.005, cz + mz, rot, S));
        }
        if (tier > 1) parts.push(B.place(B.wallTower(team), cx + x0, ground(x0, z0) - 0.005, cz + z0, 0, S));
      }
      for (let k = 0; k < 6; k++) {
        const a = ((60 * k - 30) * Math.PI) / 180;
        taken.push([Math.cos(a) * wallR, Math.sin(a) * wallR, 0.06]);
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
    const landmark = (geo: BufferGeometry, r: number, minR = 0.3, maxR = 0.6) => {
      const p = spot(minR, walls ? Math.min(maxR, wallR - r - 0.04) : maxR, r);
      if (!p) return null;
      put(geo, p[0], p[1], facing(p[0], p[1]), S, r);
      return p;
    };
    for (const b of city.buildings) {
      switch (b) {
        case 'granary': {
          const p = landmark(B.windmillBody(), 0.06, 0.35, 0.62);
          if (p) {
            const sail = new Mesh(this.sailGeo, this.mat);
            const gy = ground(p[0], p[1]);
            sail.position.set(cx + p[0], gy + 0.13 * S, cz + p[1] + 0.046 * S);
            sail.scale.setScalar(S);
            sail.userData.spin = 0.6 + rng.next() * 0.5;
            this.tagTile(sail, tile);
            sails.push(sail);
          }
          break;
        }
        case 'shrine': landmark(B.obelisk(), 0.04); break;
        case 'monument': landmark(B.obelisk(), 0.04); break;
        case 'temple': landmark(tier >= 3 ? B.chapel(roofPick(), rng) : B.temple(team), 0.1); break;
        case 'library': landmark(B.domeHall('#5fb8a0'), 0.1); break;
        case 'university': landmark(B.domeHall('#c9623a', '#e9dcc4'), 0.1); break;
        case 'observatory': landmark(B.domeHall('#eef2f6'), 0.1); break;
        case 'bank': case 'exchange': landmark(B.domeHall(B.STYLE.gold), 0.1); break;
        case 'market': landmark(B.marketStalls(rng), 0.1); break;
        case 'amphitheater': landmark(B.arena(), 0.1); break;
        case 'aqueduct': landmark(B.aqueduct(0.24), 0.14, 0.45, 0.7); break;
        case 'barracks': {
          const p = landmark(B.house(rng, team, { w: 0.12, d: 0.08 }), 0.09);
          if (p) flags.push([cx + p[0] + 0.05, ground(p[0], p[1]) + 0.15, cz + p[1]]);
          break;
        }
        case 'workshop': landmark(B.house(rng, '#6b5a4a', { chimney: true, w: 0.11 }), 0.08); break;
        case 'press': case 'hospital': landmark(B.brickBlock(rng, roofPick(), 2), 0.08); break;
        case 'factory': case 'powerplant': case 'recycling': {
          const p = landmark(B.factory(b === 'recycling' ? '#4f8f5a' : '#5a5f66'), 0.13, 0.4, 0.66);
          if (p) smoke.push([cx + p[0] + 0.07 * S, ground(p[0], p[1]) + 0.21 * S, cz + p[1] - 0.03 * S, tile]);
          break;
        }
        case 'nuclear': landmark(B.arena(), 0.1); break;
        case 'broadcast': landmark(B.skyscraper(rng, 0.36, team), 0.06); break;
        case 'researchlab': case 'geneclinic': case 'fusionreactor': case 'nanoforge': case 'synthfoundry': landmark(B.futureDome(team), 0.1); break;
        case 'arcology': landmark(B.skyscraper(rng, 0.5, team), 0.07); break;
        case 'castle': break;
        case 'harbor': break;
      }
    }
    // Harbour and boats on the shore side.
    if ((buildings.has('harbor') || city.wonders.includes('beacon')) && coastDir >= 0) {
      const [nx, nz] = EDGE_N[coastDir];
      const hx = nx * 0.8;
      const hz = nz * 0.8;
      parts.push(B.place(B.harbor(), cx + hx, 0.0, cz + hz, -Math.atan2(nz, nx) + Math.PI / 2, S));
      parts.push(B.place(B.boatHull('#fff6e6'), cx + nx * 1.08 + nz * 0.15, 0.0, cz + nz * 1.08 - nx * 0.15, rng.float(0, 6), S));
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
        case 'clock': geo = B.clockTower(team); r = 0.06; break;
        case 'bazaar': geo = B.marketStalls(rng); break;
        case 'engine': geo = B.factory('#8a6a3a'); r = 0.14; break;
        case 'exposition': case 'network': geo = B.skyscraper(rng, 0.45, B.STYLE.gold); r = 0.07; break;
        case 'elevator': geo = B.rocketPad(team); r = 0.1; break;
        case 'rampart': geo = B.wallSegment(0.3, 0.08); r = 0.16; break;
        default: break;
      }
      if (geo) landmark(geo, r, 0.3, 0.68);
    }

    // Homes: more with every size, styled by era.
    const homes = Math.max(6, Math.min(40, Math.round(5 + city.size * 2.2)));
    const inner = walls ? wallR - 0.08 : 0.8;
    for (let k = 0; k < homes; k++) {
      const outside = walls && k > homes * 0.75;
      const p = outside ? spot(wallR + 0.06, 0.95, 0.06) : spot(0.22, inner, 0.062);
      if (!p) continue;
      const rot = facing(p[0], p[1]);
      let geo: BufferGeometry;
      if (tier === 0) geo = rng.chance(0.3) ? B.tent(rng.chance(0.5) ? team : '#e8dcc0') : B.hut(rng);
      else if (tier === 1) geo = rng.chance(0.55) ? B.hut(rng) : B.house(rng, B.STYLE.thatch, { wall: B.STYLE.mud });
      else if (tier <= 4) geo = B.house(rng, roofPick(), { floors: city.size > 8 && rng.chance(0.35) ? 2 : 1 });
      else if (tier <= 6) geo = rng.chance(0.55) ? B.brickBlock(rng, roofPick(), rng.chance(0.5) ? 2 : 3) : B.house(rng, roofPick(), { floors: 2 });
      else if (tier <= 8) geo = rng.chance(0.5) ? B.skyscraper(rng, rng.float(0.12, 0.28 + city.size * 0.006), rng.chance(0.5) ? team : '#e8eef4') : B.brickBlock(rng, roofPick(), 3);
      else geo = rng.chance(0.4) ? B.futureDome(team) : B.skyscraper(rng, rng.float(0.15, 0.35), team);
      put(geo, p[0], p[1], rot, S * (tier >= 7 ? 1 : rng.float(0.92, 1.08)), 0.055);
      if (tier >= 2 && tier <= 4 && rng.chance(0.08)) smoke.push([cx + p[0], ground(p[0], p[1]) + 0.14, cz + p[1], tile]);
    }
    // A few garden trees.
    for (let k = 0; k < 2 + Math.floor(city.size / 4); k++) {
      const p = spot(0.25, 0.85, 0.035, 10);
      if (p) put(B.gardenTree(rng), p[0], p[1], 0, S, 0.035);
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
    for (const v of this.views.values()) for (const s of v.sails) s.rotation.z += dt * (s.userData.spin as number);
  }

  dispose(): void {
    for (const v of this.views.values()) this.drop(v);
    this.views.clear();
    this.flagMesh?.dispose();
    this.mat.dispose();
    this.flagMat.dispose();
    this.depth.dispose();
    this.sailGeo.dispose();
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
