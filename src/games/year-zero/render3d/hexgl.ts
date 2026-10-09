// GLSL shared by the terrain, water, river and prop shaders: hex picking in
// world space, per-tile state from a data texture, and painterly noise.
//
// The tile texture (one texel per tile, RGBA8):
//   R  flags: 1 explored, 2 visible, 4 reach, 8 attack, 16 path, 32 hover, 64 selected, 128 pending
//   G  owner civ + 1 (0 = nobody)
//   B  territory border mask: bit d set when the neighbour in direction d has another owner
//   A  terrain class for water shading: 0 land, 1 ocean, 2 coast, 3 lake, 4 ice

export const HEX_GLSL = /* glsl */ `
uniform sampler2D uTiles;
uniform sampler2D uOwners;
uniform vec2 uMap;
uniform float uTime;
uniform float uGrid;
uniform float uFogDim;

const vec2 YZ_N0 = vec2(1.0, 0.0);
const vec2 YZ_N1 = vec2(0.5, -0.8660254);
const vec2 YZ_N2 = vec2(-0.5, -0.8660254);

ivec2 yzPick(vec2 p) {
  float px = p.x - 0.8660254;
  float py = p.y - 1.0;
  float fq = 0.57735027 * px - py / 3.0;
  float fr = (2.0 / 3.0) * py;
  float fs = -fq - fr;
  float rq = floor(fq + 0.5);
  float rr = floor(fr + 0.5);
  float rs = floor(fs + 0.5);
  float dq = abs(rq - fq);
  float dr = abs(rr - fr);
  float ds = abs(rs - fs);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  float odd = mod(rr, 2.0);
  return ivec2(int(rq + (rr - odd) * 0.5), int(rr));
}

vec2 yzCenter(ivec2 cr) {
  float odd = mod(float(cr.y), 2.0);
  return vec2(1.7320508 * (float(cr.x) + 0.5 * odd) + 0.8660254, 1.5 * float(cr.y) + 1.0);
}

bool yzInside(ivec2 cr) {
  return cr.x >= 0 && cr.y >= 0 && float(cr.x) < uMap.x && float(cr.y) < uMap.y;
}

vec4 yzTile(ivec2 cr) {
  if (!yzInside(cr)) return vec4(0.0);
  return texelFetch(uTiles, cr, 0);
}

ivec2 yzTileCoord(float id) {
  float row = floor((id + 0.5) / uMap.x);
  return ivec2(int(id - row * uMap.x + 0.5), int(row));
}

int yzFlags(vec4 t) { return int(t.r * 255.0 + 0.5); }

/** Neighbour of an offset (odd-r) coordinate in direction d (E, NE, NW, W, SW, SE). */
ivec2 yzNeighbor(ivec2 cr, int d) {
  int odd = cr.y - (cr.y / 2) * 2;
  if (d == 0) return cr + ivec2(1, 0);
  if (d == 3) return cr + ivec2(-1, 0);
  if (d == 1) return cr + ivec2(odd, -1);
  if (d == 2) return cr + ivec2(odd - 1, -1);
  if (d == 4) return cr + ivec2(odd - 1, 1);
  return cr + ivec2(odd, 1);
}

vec2 yzEdgeN(int d) {
  if (d == 0) return YZ_N0;
  if (d == 1) return YZ_N1;
  if (d == 2) return YZ_N2;
  if (d == 3) return -YZ_N0;
  if (d == 4) return -YZ_N1;
  return -YZ_N2;
}

/** 0 on the edge facing direction d, 1 at the centre (can exceed 1 beyond). */
float yzEdge(vec2 local, int d) {
  return 1.0 - dot(local, yzEdgeN(d)) / 0.8660254;
}

/** 0 at the centre, 1 on the hex rim. */
float yzHexDist(vec2 l) {
  return max(abs(dot(l, YZ_N0)), max(abs(dot(l, YZ_N1)), abs(dot(l, YZ_N2)))) / 0.8660254;
}

float yzHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float yzNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(yzHash(i), yzHash(i + vec2(1.0, 0.0)), u.x), mix(yzHash(i + vec2(0.0, 1.0)), yzHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float yzFbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) {
    s += a * yzNoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}

vec3 yzOwnerColor(float g) {
  return texelFetch(uOwners, ivec2(int(g * 255.0 + 0.5), 0), 0).rgb;
}

/** Desaturate and cool what is explored but not currently in sight. */
vec3 yzFog(vec3 c, float visible) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 grey = mix(vec3(l), c, 0.78) * vec3(0.84, 0.87, 0.95);
  return mix(mix(c, grey, uFogDim), c, visible);
}

/**
 * Overlay lines and tints for a tile: hex grid, territory borders, reach,
 * attack targets, hover and selection. Returns rgb + alpha to mix over.
 */
vec4 yzOverlay(ivec2 cr, vec4 tile, vec2 local) {
  int flags = yzFlags(tile);
  float hd = yzHexDist(local);
  vec3 col = vec3(0.0);
  float a = 0.0;
  // faint grid
  float grid = smoothstep(0.93, 0.99, hd) * uGrid;
  col = mix(col, vec3(1.0, 0.98, 0.9), grid);
  a = max(a, grid);
  // territory
  float owner = tile.g;
  if (owner > 0.0) {
    vec3 oc = yzOwnerColor(owner);
    int mask = int(tile.b * 255.0 + 0.5);
    float line = 0.0;
    for (int d = 0; d < 6; d++) {
      if ((mask & (1 << d)) == 0) continue;
      float e = yzEdge(local, d);
      line = max(line, 1.0 - smoothstep(0.035, 0.085, e));
      float glow = (1.0 - smoothstep(0.08, 0.32, e)) * 0.32;
      if (glow > a) { col = mix(col, oc, 1.0); a = max(a, glow); }
    }
    if (line > 0.0) {
      vec3 lc = mix(oc, vec3(1.0), 0.12);
      col = mix(col, lc, line);
      a = max(a, line * 0.95);
    }
  }
  float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
  if ((flags & 4) != 0) {
    float rim = smoothstep(0.8, 0.9, hd) * (1.0 - smoothstep(0.93, 0.98, hd));
    col = mix(col, vec3(1.0), max(rim, 0.0));
    a = max(a, max(rim * 0.85, 0.16));
  }
  if ((flags & 8) != 0) {
    float rim = smoothstep(0.76, 0.86, hd) * (1.0 - smoothstep(0.92, 0.98, hd));
    vec3 rc = vec3(1.0, 0.27, 0.2);
    col = mix(col, rc, 1.0);
    a = max(a, max(rim, 0.22 + 0.12 * pulse));
  }
  if ((flags & 32) != 0) {
    float rim = smoothstep(0.84, 0.92, hd) * (1.0 - smoothstep(0.95, 1.0, hd));
    col = mix(col, vec3(1.0), rim);
    a = max(a, rim * 0.9);
  }
  if ((flags & 64) != 0 || (flags & 128) != 0) {
    float rim = smoothstep(0.78, 0.88, hd) * (1.0 - smoothstep(0.94, 1.0, hd));
    vec3 sc = (flags & 128) != 0 ? vec3(1.0, 0.35, 0.25) : vec3(1.0, 0.86, 0.38);
    col = mix(col, sc, rim);
    a = max(a, rim * (0.8 + 0.2 * pulse));
  }
  return vec4(col, a);
}
`;
