// Refines an assembled Chibi Tamer GLB into a smooth, skinned, softly shaded
// model while keeping its node names, hierarchy, clips and material names.
//  - closed "shape" parts (fur, limbs, tail rings...) are fused with a smooth
//    union of their signed distance fields and re-meshed (surface nets);
//  - the fused surface is skinned to the nodes that carried those parts, so
//    the original node animation drives it and joints bend smoothly;
//  - ambient occlusion from the same field is baked into vertex colours;
//  - open overlays (cheeks, belly, eyes, mouth, blush) and other parts stay
//    rigid on their nodes; materials gain sheen/clearcoat but keep names.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { MeshBVH } from 'three-mesh-bvh';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

const log = (...a) => (window.__log ??= []).push(a.join(' '));

function isClosed(geo) {
  const pos = geo.attributes.position;
  const key = new Map();
  const remap = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    if (!key.has(k)) key.set(k, key.size);
    remap[i] = key.get(k);
  }
  const idx = geo.index ? geo.index.array : [...Array(pos.count).keys()];
  const edges = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const v = [remap[idx[t]], remap[idx[t + 1]], remap[idx[t + 2]]];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      const k = a < b ? a * 1e6 + b : b * 1e6 + a;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  for (const c of edges.values()) if (c !== 2) return false;
  return true;
}

/** Splits a mesh into its connected shells (vertices welded by position). */
function shells(geo) {
  const pos = geo.attributes.position;
  const key = new Map();
  const remap = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    if (!key.has(k)) key.set(k, key.size);
    remap[i] = key.get(k);
  }
  const parent = Array.from({ length: key.size }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const idx = geo.index.array;
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(remap[idx[t]]), b = find(remap[idx[t + 1]]), c = find(remap[idx[t + 2]]);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const byRoot = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(remap[idx[t]]);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  return [...byRoot.values()].map((tris) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', pos);
    g.setIndex(tris);
    return g;
  });
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Signed distance to a closed triangle mesh (BVH closest point, sign from the face normal). */
function makeSdf(geo) {
  const bvh = new MeshBVH(geo);
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Vector3();
  return (x, y, z) => {
    q.set(x, y, z);
    bvh.closestPointToPoint(q, hit);
    const f = hit.faceIndex * 3;
    a.fromBufferAttribute(pos, idx[f]);
    b.fromBufferAttribute(pos, idx[f + 1]);
    c.fromBufferAttribute(pos, idx[f + 2]);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const s = (x - hit.point.x) * n.x + (y - hit.point.y) * n.y + (z - hit.point.z) * n.z;
    return s < 0 ? -hit.distance : hit.distance;
  };
}

export async function refine(url, opts = {}) {
  const t0 = performance.now();
  const H = opts.cell ?? 0.006;
  const K = opts.blend ?? 0.018;
  const SHAPE = new Set(opts.shapeMaterials ?? ['fur', 'furDark', 'limb']);
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  // 1. shape parts
  const parts = [];
  scene.traverse((o) => {
    if (!o.isMesh || !SHAPE.has(o.material.name)) return;
    const g = o.geometry.index ? o.geometry.clone() : o.geometry.clone().toNonIndexed();
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    if (!isClosed(g)) {
      log('open, left rigid:', o.name);
      return;
    }
    g.applyMatrix4(o.matrixWorld);
    g.computeBoundingBox();
    const kOver = (opts.blendFor ?? []).find((b) => o.name.includes(b.match));
    // overlapping shells merged into one mesh each get their own field (a plain union inside the part)
    const fields = shells(g).map(makeSdf);
    const sdf = fields.length === 1 ? fields[0] : (x, y, z) => {
      let d = Infinity;
      for (const f of fields) d = Math.min(d, f(x, y, z));
      return d;
    };
    if (fields.length > 1) log(o.name, 'shells', fields.length);
    parts.push({ mesh: o, joint: o.parent, geo: g, sdf, box: g.boundingBox.clone(), k: kOver ? kOver.k : K });
  });
  log('shape parts', parts.length, parts.map((p) => p.mesh.name).join(' '));

  // 2. fused field on a grid
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of parts) {
    lo.min(p.box.min);
    hi.max(p.box.max);
  }
  const KM = Math.max(K, ...(opts.blendFor ?? []).map((b) => b.k));
  lo.addScalar(-3 * H - KM);
  hi.addScalar(3 * H + KM);
  const nx = Math.ceil((hi.x - lo.x) / H) + 1, ny = Math.ceil((hi.y - lo.y) / H) + 1, nz = Math.ceil((hi.z - lo.z) / H) + 1;
  const F = new Float32Array(nx * ny * nz).fill(1e9);
  const at = (i, j, k) => i + nx * (j + ny * k);
  for (const p of parts) {
    const m = p.k + 3 * H;
    const i0 = Math.max(0, Math.floor((p.box.min.x - m - lo.x) / H)), i1 = Math.min(nx - 1, Math.ceil((p.box.max.x + m - lo.x) / H));
    const j0 = Math.max(0, Math.floor((p.box.min.y - m - lo.y) / H)), j1 = Math.min(ny - 1, Math.ceil((p.box.max.y + m - lo.y) / H));
    const k0 = Math.max(0, Math.floor((p.box.min.z - m - lo.z) / H)), k1 = Math.min(nz - 1, Math.ceil((p.box.max.z + m - lo.z) / H));
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const d = p.sdf(lo.x + i * H, lo.y + j * H, lo.z + k * H);
          const w = at(i, j, k);
          F[w] = F[w] > 1e8 ? d : smin(F[w], d, p.k);
        }
  }
  for (let i = 0; i < F.length; i++) if (F[i] > 1e8) F[i] = 4 * H;
  log('grid', nx, ny, nz, 'field ms', Math.round(performance.now() - t0));

  const sample = (x, y, z) => {
    const fx = Math.min(nx - 1.001, Math.max(0, (x - lo.x) / H)), fy = Math.min(ny - 1.001, Math.max(0, (y - lo.y) / H)), fz = Math.min(nz - 1.001, Math.max(0, (z - lo.z) / H));
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
    const u = fx - i, v = fy - j, w = fz - k;
    const c = (a, b, t) => a + (b - a) * t;
    return c(
      c(c(F[at(i, j, k)], F[at(i + 1, j, k)], u), c(F[at(i, j + 1, k)], F[at(i + 1, j + 1, k)], u), v),
      c(c(F[at(i, j, k + 1)], F[at(i + 1, j, k + 1)], u), c(F[at(i, j + 1, k + 1)], F[at(i + 1, j + 1, k + 1)], u), v),
      w,
    );
  };
  const grad = (x, y, z, e = H * 0.5) => {
    const g = new THREE.Vector3(sample(x + e, y, z) - sample(x - e, y, z), sample(x, y + e, z) - sample(x, y - e, z), sample(x, y, z + e) - sample(x, y, z - e));
    return g.lengthSq() > 0 ? g.normalize() : g.set(0, 1, 0);
  };

  // 3. surface nets
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cat = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const P = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          cv[c] = F[at(i + corner[c][0], j + corner[c][1], k + corner[c][2])];
          if (cv[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of edges) {
          if (cv[a] < 0 === cv[b] < 0) continue;
          const t = cv[a] / (cv[a] - cv[b]);
          sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
          sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
          sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
          n++;
        }
        cellVert[cat(i, j, k)] = P.length / 3;
        P.push(lo.x + (i + sx / n) * H, lo.y + (j + sy / n) * H, lo.z + (k + sz / n) * H);
      }
  const I = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) I.push(a, c, b, a, d, c);
    else I.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = F[at(i, j, k)] < 0;
        if (i < nx - 2 && v0 !== F[at(i + 1, j, k)] < 0) quad(cellVert[cat(i, j - 1, k - 1)], cellVert[cat(i, j, k - 1)], cellVert[cat(i, j, k)], cellVert[cat(i, j - 1, k)], !v0);
        if (j < ny - 2 && v0 !== F[at(i, j + 1, k)] < 0) quad(cellVert[cat(i - 1, j, k - 1)], cellVert[cat(i - 1, j, k)], cellVert[cat(i, j, k)], cellVert[cat(i, j, k - 1)], !v0);
        if (k < nz - 2 && v0 !== F[at(i, j, k + 1)] < 0) quad(cellVert[cat(i - 1, j - 1, k)], cellVert[cat(i, j - 1, k)], cellVert[cat(i, j, k)], cellVert[cat(i - 1, j, k)], !v0);
      }
  const nv = P.length / 3;
  const pos = new Float32Array(P);
  const nor = new Float32Array(P.length);
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let g = grad(x, y, z);
    for (let it = 0; it < 2; it++) {
      const d = sample(x, y, z);
      x -= g.x * d;
      y -= g.y * d;
      z -= g.z * d;
      g = grad(x, y, z);
    }
    pos.set([x, y, z], v * 3);
    nor.set([g.x, g.y, g.z], v * 3);
  }
  // volume-preserving smoothing (Taubin), then normals from the faces
  {
    const nbr = Array.from({ length: nv }, () => new Set());
    for (let t = 0; t < I.length; t += 3)
      for (let e = 0; e < 3; e++) {
        nbr[I[t + e]].add(I[t + ((e + 1) % 3)]);
        nbr[I[t + ((e + 1) % 3)]].add(I[t + e]);
      }
    const tmp = new Float32Array(pos.length);
    const step = (lam) => {
      for (let v = 0; v < nv; v++) {
        let x = 0, y = 0, z = 0;
        const ns = nbr[v];
        if (!ns.size) {
          tmp.set([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], v * 3);
          continue;
        }
        for (const u of ns) {
          x += pos[u * 3];
          y += pos[u * 3 + 1];
          z += pos[u * 3 + 2];
        }
        x /= ns.size;
        y /= ns.size;
        z /= ns.size;
        tmp[v * 3] = pos[v * 3] + lam * (x - pos[v * 3]);
        tmp[v * 3 + 1] = pos[v * 3 + 1] + lam * (y - pos[v * 3 + 1]);
        tmp[v * 3 + 2] = pos[v * 3 + 2] + lam * (z - pos[v * 3 + 2]);
      }
      pos.set(tmp);
    };
    for (let it = 0; it < (opts.smooth ?? 3); it++) {
      step(0.5);
      step(-0.53);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    nor.set(g.attributes.normal.array);
  }
  log('surface verts', nv, 'tris', I.length / 3);

  // 4. regions, skin weights, ambient occlusion
  const joints = [...new Set(parts.map((p) => p.joint))];
  const jointIx = new Map(joints.map((j, i) => [j, i]));
  const skinIndex = new Uint16Array(nv * 4);
  const skinWeight = new Float32Array(nv * 4);
  const vMat = new Array(nv);
  const color = new Float32Array(nv * 3);
  const dist = new Float32Array(parts.length);
  const acc = new Float32Array(joints.length);
  const SIG = opts.skinSoftness ?? 0.014;
  const matNames = [...new Set(parts.map((p) => p.mesh.material.name))];
  const M = matNames.length;
  const partMat = parts.map((p) => matNames.indexOf(p.mesh.material.name));
  const dm = new Float32Array(nv * M).fill(Infinity);
  const AO_STEP = opts.aoStep ?? 0.012;
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let dmin = Infinity, imin = 0;
    for (let p = 0; p < parts.length; p++) {
      const b = parts[p].box;
      const far = Math.max(b.min.x - x, x - b.max.x, b.min.y - y, y - b.max.y, b.min.z - z, z - b.max.z);
      dist[p] = far > 0.06 ? Infinity : parts[p].sdf(x, y, z);
      if (dist[p] < dmin) {
        dmin = dist[p];
        imin = p;
      }
    }
    vMat[v] = partMat[imin];
    for (let p = 0; p < parts.length; p++) if (dist[p] < dm[v * M + partMat[p]]) dm[v * M + partMat[p]] = dist[p];
    acc.fill(0);
    for (let p = 0; p < parts.length; p++) if (Number.isFinite(dist[p])) acc[jointIx.get(parts[p].joint)] += Math.exp(-(dist[p] - dmin) / SIG);
    const order = [...acc.keys()].sort((a, b) => acc[b] - acc[a]).slice(0, 4);
    let sum = 0;
    for (const o of order) sum += acc[o];
    order.forEach((o, k) => {
      skinIndex[v * 4 + k] = o;
      skinWeight[v * 4 + k] = acc[o] / sum;
    });
    // soft ambient occlusion from the field
    const nx_ = nor[v * 3], ny_ = nor[v * 3 + 1], nz_ = nor[v * 3 + 2];
    let occ = 0, wgt = 1;
    for (let s = 1; s <= 5; s++) {
      const h = s * AO_STEP;
      occ += (h - Math.min(h, sample(x + nx_ * h, y + ny_ * h, z + nz_ * h))) * wgt;
      wgt *= 0.7;
    }
    const ao = Math.min(1, Math.max(0, 1 - occ * (opts.aoStrength ?? 5)));
    const shade = 0.5 + 0.5 * ao;
    color.set([shade, shade, shade], v * 3);
  }

  // triangles grouped by colour region; triangles that straddle two regions are cut exactly
  // where the two regions' distances are equal, so boundaries are clean curves
  const VP = Array.from(pos), VN = Array.from(nor), VC = Array.from(color);
  const VI = Array.from(skinIndex), VW = Array.from(skinWeight), VD = Array.from(dm);
  const cut = new Map();
  const mid = (a, b, A, B) => {
    const key = a < b ? `${a}|${b}|${A}|${B}` : `${b}|${a}|${A}|${B}`;
    if (cut.has(key)) return cut.get(key);
    const sa = VD[a * M + A] - VD[a * M + B], sb = VD[b * M + A] - VD[b * M + B];
    const t = Math.min(1, Math.max(0, sa / (sa - sb || 1e-9)));
    const n = VP.length / 3;
    for (let c = 0; c < 3; c++) {
      VP.push(VP[a * 3 + c] + (VP[b * 3 + c] - VP[a * 3 + c]) * t);
      VN.push(VN[a * 3 + c] + (VN[b * 3 + c] - VN[a * 3 + c]) * t);
      VC.push(VC[a * 3 + c] + (VC[b * 3 + c] - VC[a * 3 + c]) * t);
    }
    for (let m = 0; m < M; m++) VD.push(VD[a * M + m] + (VD[b * M + m] - VD[a * M + m]) * t);
    const wmap = new Map();
    for (let k = 0; k < 4; k++) {
      wmap.set(VI[a * 4 + k], (wmap.get(VI[a * 4 + k]) ?? 0) + VW[a * 4 + k] * (1 - t));
      wmap.set(VI[b * 4 + k], (wmap.get(VI[b * 4 + k]) ?? 0) + VW[b * 4 + k] * t);
    }
    const top = [...wmap.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const sum = top.reduce((s2, x) => s2 + x[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      VI.push(top[k]?.[0] ?? 0);
      VW.push(top[k] ? top[k][1] / sum : 0);
    }
    cut.set(key, n);
    return n;
  };
  const groups = new Map();
  const emit = (m, a, b, c) => {
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(a, b, c);
  };
  for (let t = 0; t < I.length; t += 3) {
    let [a, b, c] = [I[t], I[t + 1], I[t + 2]];
    const ma = vMat[a], mb = vMat[b], mc = vMat[c];
    if (ma === mb && mb === mc) {
      emit(ma, a, b, c);
      continue;
    }
    const set = [...new Set([ma, mb, mc])];
    if (set.length > 2) {
      emit(mb === mc ? mb : ma, a, b, c);
      continue;
    }
    // rotate so the odd-one-out corner comes first (winding kept)
    if (mb !== ma && mb !== mc) [a, b, c] = [b, c, a];
    else if (mc !== ma && mc !== mb) [a, b, c] = [c, a, b];
    const A = vMat[a], B = vMat[b];
    const e1 = mid(a, b, A, B), e2 = mid(a, c, A, B);
    emit(A, a, e1, e2);
    emit(B, e1, b, c);
    emit(B, e1, c, e2);
  }
  // simplify each colour region to the triangle budget, borders locked so seams stay clean
  if (opts.ratio && opts.ratio < 1) {
    await MeshoptSimplifier.ready;
    const vp = new Float32Array(VP);
    let before = 0, after = 0;
    for (const [m, tris] of groups) {
      const idx = new Uint32Array(tris);
      const [out] = MeshoptSimplifier.simplify(idx, vp, 3, Math.max(3, Math.floor((idx.length * opts.ratio) / 3) * 3), opts.simplifyError ?? 0.004, ['LockBorder']);
      before += idx.length / 3;
      after += out.length / 3;
      groups.set(m, Array.from(out));
    }
    log('simplified', before, '->', after, 'tris');
  }
  // keep only the vertices still used
  {
    const used = new Map();
    const remapI = (v) => {
      if (!used.has(v)) used.set(v, used.size);
      return used.get(v);
    };
    for (const [m, tris] of groups) groups.set(m, tris.map(remapI));
    const pick = (src, n) => {
      const out = new Array(used.size * n);
      for (const [o, nw] of used) for (let c = 0; c < n; c++) out[nw * n + c] = src[o * n + c];
      return out;
    };
    const [p2, n2, c2, i2, w2] = [pick(VP, 3), pick(VN, 3), pick(VC, 3), pick(VI, 4), pick(VW, 4)];
    VP.length = 0; VP.push(...p2);
    VN.length = 0; VN.push(...n2);
    VC.length = 0; VC.push(...c2);
    VI.length = 0; VI.push(...i2);
    VW.length = 0; VW.push(...w2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(VP, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(VN, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(VC, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(VI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(VW, 4));
  const all = [];
  const mats = [];
  for (const [mi, tris] of groups) {
    geo.addGroup(all.length, tris.length, mats.length);
    for (const t of tris) all.push(t);
    mats.push(parts[partMat.indexOf(mi)].mesh.material);
  }
  geo.setIndex(all);

  // 5. skeleton from the original nodes; drop the fused rigid parts
  const skinned = new THREE.SkinnedMesh(geo, mats);
  skinned.name = opts.skinName ?? 'body_skin';
  const top = scene.children[0];
  top.add(skinned);
  scene.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(joints);
  skinned.bind(skeleton, skinned.matrixWorld);
  for (const p of parts) p.mesh.removeFromParent();

  // 6. materials: soft, velvety fur; glossy eyes and nose (names unchanged)
  const upgraded = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map((m) => {
      const key = `${m.uuid}|${o.isSkinnedMesh}`;
      if (upgraded.has(key)) return upgraded.get(key);
      const name = m.name;
      let n = m;
      if (!m.isMeshBasicMaterial && !/flame|white/.test(name)) {
        const glossy = /^(dark|iris|eyeDark|eyeIris|eyeIrisDark|sclera|nose|tongue|mouth)/.test(name);
        const c = m.color.clone();
        n = new THREE.MeshPhysicalMaterial({
          name,
          color: c,
          roughness: glossy ? 0.28 : 0.72,
          metalness: 0,
          clearcoat: glossy ? 1 : 0,
          clearcoatRoughness: 0.08,
          sheen: glossy ? 0 : 0.7,
          sheenRoughness: 0.6,
          // a soft, velvety rim in a lighter tint of the colour (gentler on dark colours)
          sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.15 + 0.3 * c.getHSL({ h: 0, s: 0, l: 0 }).l),
          vertexColors: o.isSkinnedMesh,
          emissive: m.emissive?.clone() ?? new THREE.Color(0),
          emissiveIntensity: m.emissiveIntensity ?? 1,
          side: m.side,
        });
      }
      upgraded.set(key, n);
      return n;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });

  // 7. export with the original clips
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: gltf.animations });
  log('refined in', Math.round(performance.now() - t0), 'ms; glb bytes', glb.byteLength);
  return glb;
}
