// Rivers and roads as ribbons laid over the terrain. Rivers flow (their
// texture scrolls downstream) and fade into the sea at their mouths; roads are
// packed dirt that turns into railways in the industrial age.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
} from 'three';
import type { WorldMap } from '../sim/state';
import { HEX_GLSL } from './hexgl';
import { hexPatch, type SharedUniforms } from './terrain';
import { LAND_Y, type Shape } from './shape';

interface Ribbon {
  pos: number[];
  uv: number[];
  tile: number[];
  idx: number[];
  col: number[];
}

function ribbon(out: Ribbon, shape: Shape, pts: [number, number][], width: (k: number) => number, lift: number, flat = false, color?: Color): void {
  const base = out.pos.length / 3;
  let v = 0;
  for (let k = 0; k < pts.length; k++) {
    const [x, z] = pts[k];
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(pts.length - 1, k + 1)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const w = width(k) / 2;
    if (k > 0) v += Math.hypot(x - pts[k - 1][0], z - pts[k - 1][1]);
    for (const side of [-1, 1]) {
      const px = x - tz * w * side;
      const pz = z + tx * w * side;
      const tile = shape.grid.pick(px, pz, 1);
      let y = shape.height(tile, px, pz);
      if (!flat) y = Math.max(y, shape.height(shape.grid.pick(x, z, 1), x, z));
      if (tile >= 0 && !shape.isWater(tile)) y = Math.max(y, LAND_Y - 0.01);
      out.pos.push(px, y + lift, pz);
      out.uv.push(side < 0 ? 0 : 1, v);
      out.tile.push(Math.max(0, shape.grid.pick(x, z, 1)));
      if (color) out.col.push(color.r, color.g, color.b);
    }
    if (k > 0) {
      const i = base + k * 2;
      out.idx.push(i - 2, i, i - 1, i - 1, i, i + 1);
    }
  }
}

function geometry(r: Ribbon): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(r.pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(r.uv), 2));
  g.setAttribute('aTile', new BufferAttribute(new Float32Array(r.tile), 1));
  if (r.col.length) g.setAttribute('color', new BufferAttribute(new Float32Array(r.col), 3));
  g.setIndex(r.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const RIVER_VERT = /* glsl */ `
${HEX_GLSL}
attribute float aTile;
varying vec2 vUv;
varying vec3 vWPos;
flat varying float vTileF;
void main() {
  vUv = uv;
  vTileF = aTile;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const RIVER_FRAG = /* glsl */ `
${HEX_GLSL}
varying vec2 vUv;
varying vec3 vWPos;
flat varying float vTileF;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  vec4 tile = texelFetch(uTiles, yzTileCoord(vTileF), 0);
  int flags = yzFlags(tile);
  if ((flags & 1) == 0) discard;
  float across = abs(vUv.x - 0.5) * 2.0;
  float flow = vUv.y * 2.2 - uTime * 0.9;
  float n = yzFbm(vec2(vUv.x * 3.0, flow));
  vec3 deep = lin(vec3(0.16, 0.56, 0.88));
  vec3 light = lin(vec3(0.45, 0.82, 0.95));
  vec3 col = mix(deep, light, smoothstep(0.35, 0.75, n) * 0.6 + across * 0.35);
  float streak = smoothstep(0.62, 0.8, yzNoise(vec2(vUv.x * 8.0, flow * 3.0))) * (1.0 - across);
  col += vec3(0.35) * streak;
  float bank = smoothstep(0.62, 0.95, across);
  col = mix(col, lin(vec3(0.84, 0.95, 0.98)), bank * 0.55);
  col = yzFog(col, (flags & 2) != 0 ? 1.0 : 0.0);
  float alpha = 1.0 - smoothstep(0.86, 1.0, across);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Rivers {
  readonly group = new Group();
  private riverMat: ShaderMaterial;
  private roadMat: MeshStandardMaterial;
  private roads: Mesh | null = null;
  private roadKey = '';

  constructor(private shape: Shape, uniforms: SharedUniforms) {
    this.riverMat = new ShaderMaterial({ vertexShader: RIVER_VERT, fragmentShader: RIVER_FRAG, transparent: true, depthWrite: false, side: DoubleSide });
    this.riverMat.uniforms = uniforms;
    this.roadMat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    hexPatch(this.roadMat, uniforms, {
      head: 'attribute float aTile;\nflat varying float vTileF;\nvarying vec2 vRUv;',
      begin: 'vTileF = aTile; vRUv = uv; if ((yzFlags(texelFetch(uTiles, yzTileCoord(aTile), 0)) & 1) == 0) transformed.y = -3.0;',
    }, {
      head: 'flat varying float vTileF;\nvarying vec2 vRUv;',
      color: `
        vec4 yzT = texelFetch(uTiles, yzTileCoord(vTileF), 0);
        float yzA = abs(vRUv.x - 0.5) * 2.0;
        diffuseColor.rgb *= mix(1.0, 0.72, smoothstep(0.55, 0.95, yzA));
        if (vColor.b < 0.2) {
          // railway: sleepers across, two steel rails
          float tie = step(0.55, fract(vRUv.y * 9.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.22, 0.14), tie * (1.0 - smoothstep(0.85, 0.95, yzA)));
          float rail = 1.0 - smoothstep(0.04, 0.09, abs(yzA - 0.5));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.76, 0.8), rail);
        } else {
          diffuseColor.rgb *= 0.92 + 0.16 * yzNoise(vec2(vRUv.x * 6.0, vRUv.y * 14.0));
        }`,
      out: 'gl_FragColor.rgb = yzFog(gl_FragColor.rgb, (yzFlags(yzT) & 2) != 0 ? 1.0 : 0.0);',
    });
    this.buildRivers();
  }

  private buildRivers(): void {
    const r: Ribbon = { pos: [], uv: [], tile: [], idx: [], col: [] };
    for (const path of this.shape.rivers) ribbon(r, this.shape, path.pts, (k) => path.width[k], 0.012);
    if (!r.pos.length) return;
    const mesh = new Mesh(geometry(r), this.riverMat);
    mesh.renderOrder = 1;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
  }

  /** Rebuilds road ribbons when the road network changes. */
  updateRoads(map: WorldMap): void {
    let key = '';
    for (let i = 0; i < map.road.length; i++) if (map.road[i]) key += `${i}:${map.road[i]},`;
    if (key === this.roadKey) return;
    this.roadKey = key;
    if (this.roads) {
      this.group.remove(this.roads);
      this.roads.geometry.dispose();
      this.roads = null;
    }
    const r: Ribbon = { pos: [], uv: [], tile: [], idx: [], col: [] };
    const shape = this.shape;
    const dirt = new Color('#c99f68');
    const rail = new Color('#8a8578').multiplyScalar(1);
    rail.b = 0.1;
    for (let i = 0; i < map.road.length; i++) {
      if (!map.road[i]) continue;
      for (const d of [0, 4, 5]) {
        const nb = shape.grid.neighbor(i, d);
        if (nb < 0 || !map.road[nb]) continue;
        const isRail = map.road[i] >= 2 && map.road[nb] >= 2;
        const ax = shape.cx(i), az = shape.cz(i), bx = shape.cx(nb), bz = shape.cz(nb);
        const pts: [number, number][] = [];
        for (let k = 0; k <= 8; k++) pts.push([ax + ((bx - ax) * k) / 8, az + ((bz - az) * k) / 8]);
        ribbon(r, shape, pts, () => (isRail ? 0.16 : 0.12), 0.022, true, isRail ? rail : dirt);
      }
    }
    if (!r.pos.length) return;
    this.roads = new Mesh(geometry(r), this.roadMat);
    this.roads.receiveShadow = true;
    this.roads.matrixAutoUpdate = false;
    this.group.add(this.roads);
  }

  dispose(): void {
    for (const m of this.group.children) (m as Mesh).geometry.dispose();
    this.riverMat.dispose();
    this.roadMat.dispose();
  }
}
