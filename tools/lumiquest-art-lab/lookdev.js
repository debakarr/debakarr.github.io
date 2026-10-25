// Look test: a small meadow seen from a high 3/4 game camera (Whiteout
// Survival framing), roster models toon-shaded with soft bands and cool,
// light shadows, an instanced toon forest and coloured haze (tinyvibe).
// window.__look({ outline, w, h, pitch, dist, yaw }) -> PNG data URL.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------- deterministic noise ----------
let seed = 1234567;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => vnoise(x, z) * 0.6 + vnoise(x * 2.1, z * 2.1) * 0.28 + vnoise(x * 4.3, z * 4.3) * 0.12;

// ---------- toon shading ----------
// two broad bands with a soft edge, plus a faint mid step: lit / half / shade
function ramp(edge = 0.06) {
  const n = 256, d = new Uint8Array(n * 4);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1); // dot(N,L)*0.5+0.5
    const v = 0.0 + 0.55 * ss(0.5 - edge, 0.5 + edge, x) + 0.45 * ss(0.68 - edge, 0.68 + edge, x);
    d.set([v * 255, v * 255, v * 255, 255], i * 4);
  }
  const t = new THREE.DataTexture(d, n, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
const RAMP = ramp(0.05);

// fresnel rim on characters, so they pop off the grass
function addRim(m, strength) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimStrength = { value: strength };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float rimStrength;')
      .replace(
        '#include <opaque_fragment>',
        'float lqRim = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) * -1.0 ) ), 3.0 );\noutgoingLight += vec3( 1.0, 0.97, 0.9 ) * lqRim * rimStrength;\n#include <opaque_fragment>',
      );
  };
  m.customProgramCacheKey = () => `rim${strength}`;
}

function toonFrom(std, rim) {
  if (!std.isMeshStandardMaterial) return std;
  const m = new THREE.MeshToonMaterial({ color: std.color.clone(), gradientMap: RAMP, side: std.side, name: std.name, map: std.map ?? null, vertexColors: std.vertexColors, transparent: std.transparent, opacity: std.opacity });
  if (std.emissive) { m.emissive.copy(std.emissive); m.emissiveIntensity = std.emissiveIntensity; }
  if (rim) addRim(m, rim);
  return m;
}

// the roster's inverted-hull outline (Toon + outline mode), width in metres
function outlineMat(width, color) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.outlineWidth = { value: width };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineWidth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize( normal ) * outlineWidth;');
  };
  m.customProgramCacheKey = () => `ol${width}`;
  return m;
}

// ---------- world ----------
const SKY = new THREE.Color('#bfe0f4');
const HAZE = new THREE.Color('#cfe3ee');
const CLEAR = 4.2; // clearing radius around the player

function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const hills = (fbm(x * 0.035 + 7, z * 0.035 - 3) - 0.45) * 7 + Math.max(0, r - 30) * 0.12;
  const flat = Math.min(1, Math.max(0, (r - CLEAR) / 10));
  return hills * flat * flat;
}

function buildGround() {
  const g = new THREE.PlaneGeometry(220, 220, 330, 330).rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const grassA = new THREE.Color('#86cf5a'), grassB = new THREE.Color('#62b44c'), grassC = new THREE.Color('#a9da66');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, groundHeight(x, z));
    const n = fbm(x * 0.08, z * 0.08);
    const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    c.copy(grassB).lerp(grassA, 0.35 + 0.65 * ss(0.42, 0.5, n)).lerp(grassC, 0.7 * ss(0.6, 0.66, vnoise(x * 0.22 + 4, z * 0.22)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: RAMP }));
  m.receiveShadow = true;
  return m;
}

const POND = { x: -3.6, z: -1.6, sx: 1.25, sz: 0.85, r: 1.95 };
const inPond = (x, z) => Math.hypot((x - POND.x) / POND.sx, (z - POND.z) / POND.sz) < POND.r + 0.1;
const pathZ = (x) => Math.sin(x * 0.12) * 2.2 + 2.4;
function buildPath() {
  const pts = [], uvs = [], idx = [];
  const n = 160;
  for (let i = 0; i <= n; i++) {
    const x = -40 + (80 * i) / n, z = pathZ(x);
    const dz = Math.cos(x * 0.12) * 0.264, len = Math.hypot(1, dz);
    const nx = -dz / len, nz = 1 / len, hw = 0.75 + vnoise(x * 0.4, 5) * 0.3;
    for (const sgn of [-1, 1]) {
      const px = x + nx * hw * sgn, pz = z + nz * hw * sgn;
      pts.push(px, groundHeight(px, pz) + 0.02, pz);
    }
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ color: '#efd9a6', gradientMap: RAMP, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.receiveShadow = true;
  return m;
}

function blob(radius, detail, wobble, sx = 1, sy = 1, sz = 1) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(radius, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + (vnoise(v.x * 3 + 11, v.z * 3 + v.y * 2) - 0.5) * wobble;
    p.setXYZ(i, v.x * k * sx, v.y * k * sy, v.z * k * sz);
  }
  g.computeVertexNormals();
  return g;
}

function buildForest() {
  // canopy: a few soft lumps merged into one rounded crown
  // crown: a cluster of soft lumps, so the light breaks into clumps
  const lumps = [[0, 2.75, 0, 0.95], [0.75, 2.35, 0.25, 0.72], [-0.7, 2.3, -0.2, 0.7], [0.15, 2.3, -0.75, 0.66], [-0.2, 2.35, 0.75, 0.66], [0.45, 3.35, 0.1, 0.62], [-0.4, 3.25, 0.2, 0.58], [0.05, 1.95, 0.05, 0.7]];
  const crown = mergeGeometries(lumps.map(([x, y, z, r], i) => blob(r, 2, 0.22 + 0.04 * (i % 3)).translate(x, y, z)));
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.2, 8).translate(0, 1.1, 0);
  const pine = mergeGeometries([
    new THREE.ConeGeometry(1.15, 1.9, 9).translate(0, 2.0, 0),
    new THREE.ConeGeometry(0.92, 1.6, 9).translate(0, 2.9, 0),
    new THREE.ConeGeometry(0.62, 1.3, 9).translate(0, 3.7, 0),
  ]);
  const bush = blob(0.7, 2, 0.35, 1, 0.7, 1).translate(0, 0.35, 0);
  const rock = blob(0.6, 1, 0.5, 1, 0.65, 0.85).translate(0, 0.15, 0);

  const spots = [];
  for (let k = 0; k < 9000 && spots.length < 900; k++) {
    const x = (rnd() * 2 - 1) * 95, z = (rnd() * 2 - 1) * 95;
    const r = Math.hypot(x, z);
    if (r < CLEAR + 1.5) continue;
    // keep the path open
    if (Math.abs(z - pathZ(x)) < 2.2) continue;
    // clumps: denser where noise is high
    if (fbm(x * 0.05 + 3, z * 0.05) < 0.36 && r < 20 && r > 7) continue;
    if (spots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < 4.4)) continue;
    spots.push({ x, z });
  }
  const leafCols = ['#6cc24a', '#58b043', '#8bd456', '#4ea33f', '#a6dc5a', '#f0b24a', '#f39ab8'].map((c) => new THREE.Color(c));
  const pineCols = ['#2f8a55', '#3a9a5c', '#2a7a52'].map((c) => new THREE.Color(c));
  const pines = spots.filter((_, i) => i % 3 === 0), leafy = spots.filter((_, i) => i % 3 !== 0);
  const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = m.receiveShadow = true; return m; };
  const leafMat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: RAMP });
  const barkMat = new THREE.MeshToonMaterial({ color: '#8a5a3a', gradientMap: RAMP });
  const crowns = mk(crown, leafMat, leafy.length);
  const trunks = mk(trunk, barkMat, leafy.length + pines.length);
  const pineM = mk(pine, leafMat, pines.length);
  const d = new THREE.Object3D();
  let ti = 0;
  leafy.forEach((s, i) => {
    const sc = 0.85 + rnd() * 0.55;
    d.position.set(s.x, groundHeight(s.x, s.z) - 0.1, s.z);
    d.rotation.set(0, rnd() * 6.28, 0);
    d.scale.setScalar(sc);
    d.updateMatrix();
    crowns.setMatrixAt(i, d.matrix);
    trunks.setMatrixAt(ti++, d.matrix);
    const w = rnd();
    crowns.setColorAt(i, leafCols[w < 0.86 ? Math.floor(rnd() * 5) : w < 0.94 ? 5 : 6]);
  });
  pines.forEach((s, i) => {
    const sc = 0.9 + rnd() * 0.6;
    d.position.set(s.x, groundHeight(s.x, s.z) - 0.1, s.z);
    d.rotation.set(0, rnd() * 6.28, 0);
    d.scale.set(sc, sc * (1 + rnd() * 0.3), sc);
    d.updateMatrix();
    pineM.setMatrixAt(i, d.matrix);
    d.scale.set(sc * 0.8, sc * 0.55, sc * 0.8);
    d.updateMatrix();
    trunks.setMatrixAt(ti++, d.matrix);
    pineM.setColorAt(i, pineCols[i % 3]);
  });
  // bushes and rocks around the clearing edge
  const bushM = mk(bush, leafMat, 70), rockM = mk(rock, new THREE.MeshToonMaterial({ color: '#b9bec8', gradientMap: RAMP }), 26);
  for (let i = 0; i < 70; i++) {
    const a = rnd() * 6.28, r = CLEAR + 0.5 + rnd() * 9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    d.position.set(x, groundHeight(x, z), z);
    d.rotation.set(0, rnd() * 6.28, 0);
    d.scale.setScalar(0.4 + rnd() * 0.45);
    d.updateMatrix();
    bushM.setMatrixAt(i, d.matrix);
    bushM.setColorAt(i, leafCols[Math.floor(rnd() * 5)]);
  }
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 6.28, r = CLEAR - 1 + rnd() * 12;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    d.position.set(x, groundHeight(x, z), z);
    d.rotation.set(0, rnd() * 6.28, 0);
    d.scale.setScalar(0.3 + rnd() * 0.5);
    d.updateMatrix();
    rockM.setMatrixAt(i, d.matrix);
  }
  // flowers: tiny bright dots scattered through the grass
  const fl = mk(new THREE.IcosahedronGeometry(0.035, 1).translate(0, 0.09, 0), new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: RAMP }), 400);
  fl.castShadow = false;
  const flCols = ['#ffffff', '#ffe066', '#ff8fb0', '#b9a2ff'].map((c) => new THREE.Color(c));
  for (let i = 0; i < 400; i++) {
    const a = rnd() * 6.28, r = 1.5 + Math.sqrt(rnd()) * 16;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    d.position.set(x, groundHeight(x, z), z);
    d.rotation.set(0, 0, 0);
    d.scale.setScalar(inPond(x, z) ? 0 : 0.7 + rnd() * 0.6);
    d.updateMatrix();
    fl.setMatrixAt(i, d.matrix);
    fl.setColorAt(i, flCols[i % 4]);
  }
  // grass tufts: three short blades, lighter at the tips via instance colour
  const blade = (a) => new THREE.ConeGeometry(0.022, 0.15, 3).translate(0, 0.075, 0).rotateZ(0.25).rotateY(a).translate(Math.cos(a) * 0.025, 0, Math.sin(a) * 0.025);
  const tuft = mergeGeometries([blade(0), blade(2.1), blade(4.2)]);
  const tufts = mk(tuft, new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: RAMP }), 5200);
  tufts.castShadow = false;
  const tc = ['#7cc950', '#69b947', '#9ad65c', '#5aa843'].map((c) => new THREE.Color(c));
  for (let i = 0; i < 5200; i++) {
    const a = rnd() * 6.28, r = 0.8 + Math.sqrt(rnd()) * 24;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const off = Math.abs(z - pathZ(x)) < 1.0 || inPond(x, z);
    d.position.set(x, groundHeight(x, z), z);
    d.rotation.set(0, rnd() * 6.28, 0);
    d.scale.setScalar(off ? 0 : 0.8 + rnd() * 0.9);
    d.updateMatrix();
    tufts.setMatrixAt(i, d.matrix);
    tufts.setColorAt(i, tc[i % 4]);
  }
  return [crowns, trunks, pineM, bushM, rockM, fl, tufts];
}

function buildPond() {
  const g = new THREE.CircleGeometry(1.7, 48).rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(g, new THREE.MeshToonMaterial({ color: '#4fb8e6', gradientMap: RAMP }));
  water.position.set(-3.6, 0.03, -1.6);
  water.scale.set(1.25, 1, 0.85);
  water.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.95, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: '#d9f2fb', gradientMap: RAMP }));
  rim.position.copy(water.position).setY(0.02);
  rim.scale.copy(water.scale);
  return [water, rim];
}

// ---------- characters ----------
const loader = new GLTFLoader();
async function place(url, { x, z, rotY = 0, clip = 'Idle', t = 0.5, scale = 1 }, look) {
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  root.position.set(x, groundHeight(x, z), z);
  root.rotation.y = rotY;
  root.scale.setScalar(scale);
  const outlines = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.material = toonFrom(o.material, look.rim);
    if (look.outline && !/flame/i.test(o.material.name)) {
      const ol = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, look.olMat) : new THREE.Mesh(o.geometry, look.olMat);
      if (o.isSkinnedMesh) ol.bind(o.skeleton, o.bindMatrix);
      ol.castShadow = false;
      outlines.push([o, ol]);
    }
  });
  for (const [o, ol] of outlines) o.add(ol);
  const mixer = new THREE.AnimationMixer(root);
  const c = gltf.animations.find((a) => a.name === clip);
  if (c) { mixer.clipAction(c).play(); mixer.setTime(t); }
  return root;
}

window.__look = async (o = {}) => {
  seed = 1234567;
  const w = o.w ?? 1280, h = o.h ?? 800;
  renderer.setSize(w, h, false);
  const scene = new THREE.Scene();
  scene.background = SKY;
  scene.fog = new THREE.Fog(HAZE, o.fogNear ?? 22, o.fogFar ?? 75);

  // bright sky fill keeps shadows light and cool; a warm sun draws the shapes
  scene.add(new THREE.HemisphereLight('#b4d2ff', '#b0c98f', o.hemi ?? 1.5));
  const sun = new THREE.DirectionalLight('#fff1d6', o.sun ?? 2.4);
  sun.position.set(-12, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
  scene.add(sun, sun.target);

  scene.add(buildGround(), buildPath(), ...buildForest(), ...buildPond());

  const look = { outline: !!o.outline, rim: o.rim ?? 0.22, olMat: outlineMat(o.olWidth ?? 0.0055, o.olColor ?? '#241c22') };
  const cast = o.cast ?? [
    ['/models/trainer_girl.glb', { x: 0.2, z: 0.6, rotY: 0.35, clip: 'Wave', t: 0.55 }],
    ['/models/flicket.glb', { x: 1.5, z: 1.2, rotY: -0.5, clip: 'Happy', t: 0.45 }],
    ['/models/mossbara.glb', { x: -1.5, z: 1.5, rotY: 0.6, clip: 'Idle', t: 0.9 }],
    ['/models/narwee.glb', { x: -3.1, z: -1.0, rotY: 0.9, clip: 'Idle', t: 0.4 }],
    ['/models/props/crate.glb', { x: 2.6, z: -0.6, rotY: 0.4, scale: 1.6 }],
  ];
  for (const [url, at] of cast) scene.add(await place(url, at, look));

  // high 3/4 game camera looking at the player
  const cam = new THREE.PerspectiveCamera(o.fov ?? 30, w / h, 0.1, 300);
  const pitch = ((o.pitch ?? 42) * Math.PI) / 180, yaw = ((o.yaw ?? 0) * Math.PI) / 180, dist = o.dist ?? 8;
  const tgt = new THREE.Vector3(o.tx ?? -0.4, o.ty ?? 0.5, o.tz ?? 0.4);
  cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  cam.lookAt(tgt);
  scene.updateMatrixWorld(true);
  renderer.render(scene, cam);
  const info = { tris: renderer.info.render.triangles, calls: renderer.info.render.calls };
  return { png: renderer.domElement.toDataURL('image/png'), info };
};
window.__lookReady = true;
