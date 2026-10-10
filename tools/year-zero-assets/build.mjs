// Packs the CC0 models Year Zero uses into a few optimised GLB bundles.
//
// Sources (clone them next to this repository, see README.md):
//   KayKit Medieval Hexagon Pack 1.0, KayKit Adventurers 1.0, KayKit Dungeon
//   Remastered 1.0, KayKit Furniture Bits 1.0, KayKit City Builder Bits 1.0,
//   KayKit Space Base Bits 1.0 (all CC0, Kay Lousberg) and Kenney pirate,
//   nature and vehicle models from pmndrs/market-assets (CC0, Kenney).
//
// Every KayKit model is textured with a palette of gradient swatches; the
// colour under each vertex's UV is baked into a vertex colour so the game can
// keep drawing everything with its own instanced, fog-aware shaders. Each
// vertex also gets a `_TEAM` value: 100 where the owner's colour shows (the
// baked colour is then grey), 200 on skin, 0 elsewhere. World models keep the
// palette cell of each vertex in `_CELL` so the game can recolour grass,
// leaves and rock per biome.
//
// Usage: node build.mjs [--src ../../../kaykit-game-assets]

import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, resample, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

const argSrc = process.argv.indexOf('--src');
const SRC = path.resolve(argSrc > 0 ? process.argv[argSrc + 1] : path.join(import.meta.dirname, '../../../kaykit-game-assets'));
const OUT = path.resolve(import.meta.dirname, '../../src/games/year-zero/assets/models');
fs.mkdirSync(OUT, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.encoder': MeshoptEncoder,
});
await MeshoptEncoder.ready;

const HEX = `${SRC}/kaykit-medieval-hexagon-pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf`;
const ADV = `${SRC}/adv/addons/kaykit_character_pack_adventures`;
const DUN = `${SRC}/KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf`;
const FUR = `${SRC}/KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf`;
const CITY = `${SRC}/KayKit-City-Builder-Bits-1.0/addons/kaykit_city_builder_bits/Assets/gltf`;
const SPACE = `${SRC}/KayKit-Space-Base-Bits-1.0/addons/kaykit_space_base_bits/Assets/gltf`;
const MARKET = `${SRC}/market/files/models`;

// --- colour helpers -------------------------------------------------------------------------

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const pngCache = new Map();
function decodePng(texture) {
  const img = texture.getImage();
  const key = texture.getURI() || texture.getName() || String(img.length);
  let p = pngCache.get(key);
  if (!p) {
    p = PNG.sync.read(Buffer.from(img));
    pngCache.set(key, p);
  }
  return p;
}
function sample(png, u, v) {
  u -= Math.floor(u);
  v -= Math.floor(v);
  const x = Math.min(png.width - 1, Math.max(0, Math.floor(u * png.width)));
  const y = Math.min(png.height - 1, Math.max(0, Math.floor(v * png.height)));
  const k = (y * png.width + x) * 4;
  return [png.data[k] / 255, png.data[k + 1] / 255, png.data[k + 2] / 255];
}
function hsv([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Per-vertex colour (sRGB, 0..1), palette cell and team/skin class for one primitive.
 * `classify(srgb, ctx)` returns 0 (plain), 1 (team) or 2 (skin).
 */
function bakePrimitive(prim, ctx) {
  const pos = prim.getAttribute('POSITION');
  const n = pos.getCount();
  const uv = prim.getAttribute('TEXCOORD_0');
  const mat = prim.getMaterial();
  const factor = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1];
  const tex = mat && mat.getBaseColorTexture();
  const png = tex && uv ? decodePng(tex) : null;
  const colors = new Float32Array(n * 3);
  const team = new Uint8Array(n);
  const cell = new Uint8Array(n).fill(255);
  const t = [0, 0];
  for (let i = 0; i < n; i++) {
    let srgb;
    if (png) {
      uv.getElement(i, t);
      srgb = sample(png, t[0], t[1]);
      if (ctx.cells) cell[i] = Math.min(ctx.cells[0] - 1, Math.floor((t[0] - Math.floor(t[0])) * ctx.cells[0])) + Math.min(ctx.cells[1] - 1, Math.floor((t[1] - Math.floor(t[1])) * ctx.cells[1])) * ctx.cells[0];
      srgb = srgb.map((c, k) => c * (k < 3 ? Math.pow(factor[k], 1 / 2.2) : 1));
    } else {
      // material colours are linear: back to sRGB for classification
      srgb = factor.slice(0, 3).map((c) => Math.pow(c, 1 / 2.2));
    }
    let cls = ctx.classify ? ctx.classify(srgb, { ...ctx, cell: cell[i], material: mat?.getName() ?? '' }) : 0;
    let lin = srgb.map(toLinear);
    if (cls === 1 || (cls > 0 && cls < 1)) {
      // the owner's colour multiplies a light grey that keeps the swatch's shading
      const g = Math.min(1, toLinear(Math.min(1, hsv(srgb)[2] * 1.08)));
      lin = [g, g, g];
    }
    colors.set(lin, i * 3);
    team[i] = cls === 2 ? 200 : Math.round(cls * 100);
  }
  return { colors, team, cell };
}

// --- static models: flatten each model into one mesh (+ movable parts) --------------------------

/**
 * Reads a source file and returns its geometry baked to world space: one
 * static bucket plus one bucket per movable part (name → pivot + geometry).
 */
async function bakeStatic(file, ctx = {}) {
  const doc = await io.read(file);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const buckets = new Map();
  const bucket = (key, pivot) => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { pivot, pos: [], nor: [], col: [], team: [], cell: [], idx: [] }));
    return b;
  };
  const movable = ctx.movable ?? [];
  const visit = (node, parentWorld, part, partInv) => {
    const world = mul(parentWorld, node.getMatrix());
    let p = part;
    let inv = partInv;
    if (movable.some((m) => node.getName().includes(m))) {
      p = movable.find((m) => node.getName().includes(m));
      inv = invert(world);
    }
    if (ctx.skip && ctx.skip.some((s) => node.getName().includes(s))) return;
    const mesh = node.getMesh();
    if (mesh) {
      const local = inv ? mul(inv, world) : world;
      const b = bucket(p ?? '', p ? [world[12], world[13], world[14]] : [0, 0, 0]);
      const nm = normalMatrix(local);
      for (const prim of mesh.listPrimitives()) {
        const base = b.pos.length / 3;
        const pos = prim.getAttribute('POSITION');
        const nor = prim.getAttribute('NORMAL');
        const baked = bakePrimitive(prim, ctx);
        const v = [0, 0, 0];
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, v);
          b.pos.push(...xform(local, v));
          if (nor) {
            nor.getElement(i, v);
            const q = xdir(nm, v);
            const l = Math.hypot(...q) || 1;
            b.nor.push(q[0] / l, q[1] / l, q[2] / l);
          } else b.nor.push(0, 1, 0);
          b.col.push(baked.colors[i * 3], baked.colors[i * 3 + 1], baked.colors[i * 3 + 2]);
          b.team.push(baked.team[i]);
          b.cell.push(baked.cell[i]);
        }
        const ind = prim.getIndices();
        if (ind) for (let i = 0; i < ind.getCount(); i++) b.idx.push(base + ind.getScalar(i));
        else for (let i = 0; i < pos.getCount(); i++) b.idx.push(base + i);
        if (det(local) < 0) for (let i = b.idx.length - (ind ? ind.getCount() : pos.getCount()); i < b.idx.length; i += 3) [b.idx[i + 1], b.idx[i + 2]] = [b.idx[i + 2], b.idx[i + 1]];
      }
    }
    for (const c of node.listChildren()) visit(c, world, p, inv);
  };
  for (const n of scene.listChildren()) visit(n, IDENT, null, null);
  return buckets;
}

/** Writes baked models into one output document. */
function writeModels(models, file) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene('kit');
  const mat = doc.createMaterial('kit').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0);
  const prim = (b) => {
    const p = doc.createPrimitive().setMaterial(mat);
    const acc = (arr, type, Ctor) => doc.createAccessor().setType(type).setArray(new Ctor(arr)).setBuffer(buf);
    p.setAttribute('POSITION', acc(b.pos, 'VEC3', Float32Array));
    p.setAttribute('NORMAL', acc(b.nor, 'VEC3', Float32Array));
    p.setAttribute('COLOR_0', acc(b.col, 'VEC3', Float32Array));
    if (b.team.some((v) => v)) p.setAttribute('_TEAM', acc(b.team, 'SCALAR', Uint8Array));
    if (b.cell.some((v) => v !== 255)) p.setAttribute('_CELL', acc(b.cell, 'SCALAR', Uint8Array));
    p.setIndices(acc(b.idx, 'SCALAR', b.pos.length / 3 > 65535 ? Uint32Array : Uint16Array));
    return p;
  };
  let tris = 0;
  for (const [name, buckets] of models) {
    const root = doc.createNode(name);
    const main = buckets.get('');
    if (main) {
      root.setMesh(doc.createMesh(name).addPrimitive(prim(main)));
      tris += main.idx.length / 3;
    }
    scene.addChild(root);
    // moving parts are separate top-level nodes (quantisation owns node transforms); the pivot rides in extras
    for (const [key, b] of buckets) {
      if (!key) continue;
      const part = doc.createNode(`${name}~${key}`).setExtras({ pivot: b.pivot }).setMesh(doc.createMesh(`${name}~${key}`).addPrimitive(prim(b)));
      tris += b.idx.length / 3;
      scene.addChild(part);
    }
  }
  return { doc, tris, file };
}

async function finish({ doc, file, tris }, opts = {}) {
  await doc.transform(
    weld(),
    dedup(),
    prune({ keepAttributes: true }),
    ...(opts.resample ? [resample()] : []),
    reorder({ encoder: MeshoptEncoder }),
    quantize({ pattern: /^(POSITION|NORMAL|COLOR_0|JOINTS_0|WEIGHTS_0)$/, quantizeColor: 8, quantizeNormal: 8, quantizePosition: 14 }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const out = path.join(OUT, file);
  await io.write(out, doc);
  console.log(`${file}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB${tris ? `, ${Math.round(tris)} triangles` : ''}`);
}

// --- tiny matrix helpers (column-major 4x4) ---------------------------------------------------

const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function xform(m, [x, y, z]) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
function xdir(m3, [x, y, z]) {
  return [m3[0] * x + m3[3] * y + m3[6] * z, m3[1] * x + m3[4] * y + m3[7] * z, m3[2] * x + m3[5] * y + m3[8] * z];
}
function det(m) {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}
function normalMatrix(m) {
  // inverse transpose of the upper 3x3
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const d = a[0] * (a[4] * a[8] - a[7] * a[5]) - a[3] * (a[1] * a[8] - a[7] * a[2]) + a[6] * (a[1] * a[5] - a[4] * a[2]);
  const inv = [
    (a[4] * a[8] - a[5] * a[7]) / d, (a[2] * a[7] - a[1] * a[8]) / d, (a[1] * a[5] - a[2] * a[4]) / d,
    (a[5] * a[6] - a[3] * a[8]) / d, (a[0] * a[8] - a[2] * a[6]) / d, (a[2] * a[3] - a[0] * a[5]) / d,
    (a[3] * a[7] - a[4] * a[6]) / d, (a[1] * a[6] - a[0] * a[7]) / d, (a[0] * a[4] - a[1] * a[3]) / d,
  ];
  // transpose (inv is column-major)
  return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]];
}
function invert(m) {
  const inv = new Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const d = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  return inv.map((v) => v / d);
}

// --- classification rules -----------------------------------------------------------------------

/** KayKit hexagon atlas: the blue team swatch is cell (0, 3); flags use it too. */
const hexTeam = (_srgb, ctx) => (ctx.cell === 24 ? 1 : 0);

/** Kenney sails take a light wash of the owner's colour. */
const kenney = (_srgb, ctx) => (/textile|sail|flag/i.test(ctx.material) ? 0.45 : 0);

/** Adventurers: each character's signature cloth carries the owner's colour; peach tones are skin. */
function charRule(name) {
  return (srgb, ctx) => {
    const [h, s, v] = hsv(srgb);
    if (ctx.weapon) return 0;
    // skin: warm, light, moderately saturated
    if (h >= 19 && h <= 27 && s > 0.3 && s < 0.48 && v > 0.93) return 2;
    if (name === 'knight') return (h < 12 || h > 340) && s > 0.45 && v > 0.3 ? 1 : 0;
    if (name === 'barbarian') return h > 195 && h < 225 && s > 0.25 && v > 0.25 ? 1 : 0;
    if (name === 'mage') return h > 235 && h < 290 && s > 0.25 && v > 0.15 ? 1 : 0;
    if (name === 'rogue') return h > 140 && h < 175 && s > 0.45 && v > 0.25 ? 1 : 0;
    return 0;
  };
}

// --- bundles --------------------------------------------------------------------------------------

const list = (dir, re = /\.gltf$/) => fs.readdirSync(dir).filter((f) => re.test(f)).sort();

async function buildWorld() {
  const models = new Map();
  const hex = async (sub, files, ctx = {}) => {
    for (const f of files) {
      const name = f.replace(/\.gltf$/, '').replace(/_blue$/, '');
      models.set(name, await bakeStatic(`${HEX}/${sub}/${f}`, { cells: [8, 4], classify: hexTeam, ...ctx }));
    }
  };
  await hex('decoration/nature', list(`${HEX}/decoration/nature`));
  await hex('decoration/props', list(`${HEX}/decoration/props`).filter((f) => !/flag_(red|green|yellow)/.test(f)));
  await hex('buildings/blue', list(`${HEX}/buildings/blue`), { movable: ['windmill_top_fan', 'watermill_wheel', 'lumbermill_saw', 'catapult_arm'] });
  await hex('buildings/neutral', list(`${HEX}/buildings/neutral`), { movable: ['door_left', 'door_right'] });
  await hex('tiles/base', ['hex_grass.gltf', 'hex_water.gltf']);
  for (const m of ['ship-light', 'ship-dark', 'boat-large', 'boat-small', 'cannon', 'cannon-mobile', 'cannon-large', 'palm-long', 'palm-short', 'palm-detailed-long', 'palm-detailed-short', 'tower', 'chest']) {
    models.set(`k_${m}`, await bakeStatic(`${MARKET}/${m}/model.gltf`, { classify: kenney }));
  }
  for (const f of list(CITY).filter((f) => !/^road|^base|^building_[A-H]\.gltf/.test(f))) {
    models.set(`c_${f.replace(/\.gltf$/, '').replace('_withoutBase', '')}`, await bakeStatic(`${CITY}/${f}`));
  }
  for (const f of list(SPACE).filter((f) => !/tunnel|terrain/.test(f))) {
    models.set(`s_${f.replace(/\.gltf$/, '')}`, await bakeStatic(`${SPACE}/${f}`));
  }
  for (const f of ['arrow', 'arrow_bundle', 'quiver', 'shield_badge_color', 'shield_round_color', 'shield_square_color', 'shield_spikes_color', 'sword_2handed_color', 'spellbook_open', 'staff', 'axe_1handed', 'dagger', 'mug_full']) {
    models.set(`w_${f}`, await bakeStatic(`${ADV}/Assets/gltf/${f}.gltf`, { classify: (srgb) => { const [h, s] = hsv(srgb); return (h < 12 || h > 340) && s > 0.45 ? 1 : 0; } }));
  }
  await finish(writeModels(models, 'world.glb'));
}

async function buildHall() {
  const models = new Map();
  const dungeon = ['wall', 'wall_arched', 'wall_archedwindow_open', 'wall_window_open', 'wall_pillar', 'wall_corner', 'wall_half', 'pillar', 'pillar_decorated', 'column', 'floor_tile_large', 'floor_tile_small_decorated', 'floor_wood_large', 'stairs_wide', 'stairs', 'banner_patternA_white', 'banner_patternB_white', 'banner_shield_white', 'banner_triple_white', 'banner_thin_white', 'banner_white', 'candle_triple', 'candle_lit', 'candle_thin_lit', 'torch_mounted', 'torch_lit', 'chest_gold', 'chest', 'coin_stack_large', 'coin_stack_medium', 'table_long_tablecloth_decorated_A', 'table_medium_tablecloth', 'chair', 'shelf_small_candles', 'shelves', 'keg_decorated', 'sword_shield_gold', 'barrel_large_decorated', 'trunk_large_A', 'box_stacked', 'plate_food_A', 'bottle_A_labeled_green'];
  for (const m of dungeon) {
    const file = fs.existsSync(`${DUN}/${m}.gltf.glb`) ? `${DUN}/${m}.gltf.glb` : `${DUN}/${m}.glb`;
    // white banners carry the owner's colour
    models.set(`d_${m}`, await bakeStatic(file, { classify: m.startsWith('banner') ? (srgb) => (hsv(srgb)[1] < 0.12 && hsv(srgb)[2] > 0.75 ? 1 : 0) : undefined }));
  }
  for (const m of ['armchair', 'armchair_pillows', 'rug_oval_A', 'rug_rectangle_A', 'rug_rectangle_stripes_A', 'pictureframe_large_A', 'pictureframe_large_B', 'lamp_standing', 'table_medium', 'shelf_B_large_decorated', 'cabinet_medium_decorated', 'couch_pillows', 'book_set', 'cactus_medium_A']) {
    models.set(`f_${m}`, await bakeStatic(`${FUR}/${m}.gltf`));
  }
  await finish(writeModels(models, 'hall.glb'));
}

const KEEP_CLIPS = [
  'Idle', 'Unarmed_Idle', '2H_Melee_Idle', 'Walking_A', 'Walking_B', 'Running_A', 'Running_B',
  '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Stab',
  '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Stab', '2H_Melee_Attack_Spin',
  '1H_Ranged_Shoot', '2H_Ranged_Shoot', '2H_Ranged_Aiming', '1H_Ranged_Aiming', 'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcasting', 'Spellcast_Long',
  'Block', 'Blocking', 'Block_Hit', 'Hit_A', 'Hit_B', 'Death_A', 'Death_A_Pose', 'Death_B', 'Death_B_Pose', 'Cheer', 'Interact', 'Use_Item', 'PickUp', 'Throw',
  'Sit_Chair_Idle', 'Sit_Chair_Pose', 'Sit_Floor_Pose', 'Dodge_Backward', 'Jump_Idle', 'Unarmed_Pose',
];

async function buildChar(file, name, ruleName, withAnims) {
  const doc = await io.read(`${ADV}/Characters/gltf/${file}`);
  const root = doc.getRoot();
  const mat = doc.createMaterial('char').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.75).setMetallicFactor(0);
  const rule = charRule(ruleName);
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const weapon = !node.getSkin() && !/Helmet|Hat|Cape|Head|Shield/.test(node.getName());
    for (const prim of mesh.listPrimitives()) {
      const baked = bakePrimitive(prim, { classify: rule, weapon });
      const buf = root.listBuffers()[0];
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(baked.colors).setBuffer(buf));
      if (baked.team.some((v) => v)) prim.setAttribute('_TEAM', doc.createAccessor().setType('SCALAR').setArray(baked.team).setBuffer(buf));
      prim.setAttribute('TEXCOORD_0', null);
      prim.setMaterial(mat);
    }
  }
  for (const a of root.listAnimations()) {
    if (withAnims && KEEP_CLIPS.includes(a.getName())) continue;
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
  }
  for (const m of root.listMaterials()) if (m !== mat) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  await finish({ doc, file: `char_${name}.glb` }, { resample: true });
}

await buildWorld();
await buildHall();
await buildChar('Knight.glb', 'knight', 'knight', true);
await buildChar('Barbarian.glb', 'barbarian', 'barbarian', false);
await buildChar('Mage.glb', 'mage', 'mage', false);
await buildChar('Rogue.glb', 'rogue', 'rogue', false);
await buildChar('Rogue_Hooded.glb', 'hooded', 'rogue', false);
