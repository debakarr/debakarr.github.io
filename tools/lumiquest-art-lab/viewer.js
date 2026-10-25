// Renders a GLB under a soft studio rig (warm key, cool rim, sky fill, soft
// contact shadow) with a gentle wrap-lit "subsurface" terminator, for
// before/after comparisons. window.__shot(url, opts) -> PNG data URL.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// soft wrap lighting with a warm terminator, for every physical/standard material
{
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const line = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
  if (new URLSearchParams(location.search).has('toon'))
    // LumiQuest's current look: hard cel bands (anime/toon.ts)
    THREE.ShaderChunk.lights_physical_pars_fragment = src.replace(
      line,
      'reflectedLight.directDiffuse += mix( smoothstep( -0.02, 0.16, dot( geometryNormal, directLight.direction ) ), saturate( dot( geometryNormal, directLight.direction ) ), 0.22 ) * directLight.color * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );',
    );
  else if (src.includes(line))
    THREE.ShaderChunk.lights_physical_pars_fragment = src.replace(
      line,
      `{
        float lqNL = dot( geometryNormal, directLight.direction );
        float lqWrap = max( ( lqNL + 0.35 ) / 1.35, 0.0 );
        float lqEdge = smoothstep( -0.2, 0.25, lqNL ) * ( 1.0 - smoothstep( 0.15, 0.65, lqNL ) );
        vec3 lqLight = directLight.color * ( lqWrap + vec3( 0.55, 0.18, 0.08 ) * lqEdge );
        reflectedLight.directDiffuse += lqLight * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
      }`,
    );
}

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

function stage(w, h, bg) {
  renderer.setSize(w, h, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.environment = env;
  scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight('#d6e9ff', '#f0dcc4', 0.9));
  const key = new THREE.DirectionalLight('#fff0dc', 2.6);
  key.position.set(1.6, 2.8, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.01;
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.1, far: 10 });
  const rim = new THREE.DirectionalLight('#d4e6ff', 2.2);
  rim.position.set(-1.8, 1.6, -2.4);
  scene.add(key, rim);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  return scene;
}

const loader = new GLTFLoader();
window.__shot = async (url, o = {}) => {
  const gltf = await loader.loadAsync(url);
  const scene = stage(o.w ?? 900, o.h ?? 700, o.bg ?? '#eef2f6');
  const model = gltf.scene;
  model.rotation.y = o.turn ?? 0;
  model.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    }
  });
  scene.add(model);
  const mixer = new THREE.AnimationMixer(model);
  let unbound = 0;
  const clip = gltf.animations.find((a) => a.name === (o.clip ?? 'Idle'));
  if (clip) {
    const act = mixer.clipAction(clip);
    act.play();
    for (const b of act._propertyBindings ?? []) if (!b.binding.node) unbound++;
    mixer.setTime(o.t ?? 0.5);
  }
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(o.fov ?? 26, (o.w ?? 900) / (o.h ?? 700), 0.01, 50);
  const dist = (Math.max(size.y, size.x * 0.8) * (o.zoom ?? 1.25)) / (2 * Math.tan((cam.fov * Math.PI) / 360));
  const yaw = o.yaw ?? 0.45;
  cam.position.set(c.x + Math.sin(yaw) * dist, c.y + dist * (o.lift ?? 0.18), c.z + Math.cos(yaw) * dist);
  cam.lookAt(c.x, c.y - size.y * 0.04, c.z);
  renderer.render(scene, cam);
  const info = { tris: renderer.info.render.triangles, calls: renderer.info.render.calls, unbound, clips: gltf.animations.map((a) => a.name).join(',') };
  return { png: renderer.domElement.toDataURL('image/png'), info };
};
window.__viewReady = true;
