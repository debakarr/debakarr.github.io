// Cast lab: VRM characters lined up in a bright, simple scene, used to judge
// models, shading and motion outside the game. Not linked from the site.
// URL: /lumiquest/cast/?m=a.vrm,b.vrm&clip=idle&t=0.4&view=full|bust&tone=aces|neutral|agx

import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  BackSide,
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshToonMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Avatar } from './avatar';
import { buildCreature } from '../entities/creatureModel';
import type { SpeciesId } from '../data/species';

declare global {
  interface Window {
    __castReady?: boolean;
    __castError?: string;
    __castDump?: string;
    __castPng?: string;
  }
}

export async function startCastLab(el: HTMLElement): Promise<void> {
  const q = new URLSearchParams(location.search);
  const models = (q.get('m') ?? 'Vita.vrm').split(',').filter(Boolean).map((m) => (m.includes('/') ? m : `/_lab/vrm/${m}`));
  const critters = (q.get('c') ?? '').split(',').filter(Boolean).map((c) => c.split(':') as [SpeciesId, string?]);
  const cclip = q.get('cclip') ?? 'idle';
  const clip = q.get('clip') ?? 'idle';
  const t = Number(q.get('t') ?? 0.4);
  const view = q.get('view') ?? 'full';
  const tone = q.get('tone') ?? 'neutral';
  const turn = Number(q.get('turn') ?? 0);
  const hemiI = Number(q.get('hemi') ?? 1.4);
  const sunI = Number(q.get('sun') ?? 2.6);

  const portraitMode = q.has('portrait');
  const renderer = new WebGLRenderer({ antialias: true, alpha: portraitMode, preserveDrawingBuffer: portraitMode });
  if (portraitMode) renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = tone === 'aces' ? ACESFilmicToneMapping : tone === 'agx' ? AgXToneMapping : NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  el.appendChild(renderer.domElement);

  const scene = new Scene();
  const sky = new Mesh(
    new SphereGeometry(80, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: { top: { value: new Color('#3d8fe0') }, mid: { value: new Color('#9fd0f5') }, low: { value: new Color('#e8f4fb') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.8, h)) : mix(low, mid, smoothstep(-0.1, 0.15, h)); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  if (!portraitMode) scene.add(sky);
  const ground = new Mesh(new CircleGeometry(30, 48), new MeshToonMaterial({ color: '#7cc46a' }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  if (!portraitMode) scene.add(ground);
  const hemi = new HemisphereLight(q.get('sky') ? `#${q.get('sky')}` : '#cfe8ff', '#6f9a58', hemiI);
  scene.add(hemi);
  const sun = new DirectionalLight('#fff4e0', sunI);
  sun.position.set(3, 6, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -6;
  sun.shadow.camera.right = 6;
  sun.shadow.camera.top = 4;
  sun.shadow.camera.bottom = -1;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  try {
    const cast = await Promise.all(models.map((m) => Avatar.load(m)));
    const gap = view === 'bust' ? 0.62 : 0.85;
    cast.forEach((a, i) => {
      a.root.position.x = (i - (cast.length - 1) / 2) * gap;
      a.root.rotation.y = turn;
      scene.add(a.root);
      a.animator.play(clip, 0);
      // let the motion reach the requested frame and the hair settle
      a.update(0);
      const steps = Math.round((2 + t) * 60);
      for (let k = 0; k < steps; k++) a.update(1 / 60);
    });
    if (q.has('dump')) {
      const rows: string[] = [];
      cast.forEach((a, i) => {
        for (const m of (a.vrm.materials ?? []) as unknown as Record<string, unknown>[]) {
          const c = (k: string) => (m[k] && typeof (m[k] as { getHexString?: () => string }).getHexString === 'function' ? '#' + (m[k] as { getHexString: () => string }).getHexString() : m[k]);
          const n = String(m.name);
          if (n.includes('Outline')) continue;
          rows.push([models[i].split('/').pop(), n.replace(/^F0\d_\d+_/, '').slice(0, 26), c('color'), c('shadeColorFactor'), m.shadingShiftFactor, m.shadingToonyFactor, m.giEqualizationFactor, c('parametricRimColorFactor'), m.rimLightingMixFactor, m.outlineWidthFactor, c('outlineColorFactor')].map((x) => (typeof x === 'number' ? x.toFixed(2) : String(x))).join(' '));
        }
      });
      window.__castDump = rows.join('\n');
    }
    // creatures stand in front of the cast, spread across the middle
    const pets = critters.map(([sp, v]) => buildCreature(sp, v ?? null));
    pets.forEach((m, i) => {
      m.root.position.set((i - (pets.length - 1) / 2) * 0.75, 0, 0.7);
      m.root.rotation.y = turn + Number(q.get('cturn') ?? 0);
      scene.add(m.root);
      m.animator.play(cclip, 0);
      const steps = Math.round((1 + t) * 60);
      for (let k = 0; k < steps; k++) m.animator.update(1 / 60);
    });
    const tallest = Math.max(0.9, ...cast.map((a) => a.height));
    const width = Math.max(1, cast.length * gap, pets.length * 0.75);
    const cam = new PerspectiveCamera(view === 'bust' ? 24 : 28, el.clientWidth / el.clientHeight, 0.05, 200);
    if (view === 'bust') {
      const y = tallest - 0.22;
      const dist = (width * 0.62) / Math.tan((cam.fov * Math.PI) / 360) / cam.aspect + 0.4;
      cam.position.set(0, y + 0.02, Math.max(1.1, dist));
      cam.lookAt(new Vector3(0, y - 0.02, 0));
    } else {
      const fitH = (tallest * 1.18) / 2 / Math.tan((cam.fov * Math.PI) / 360);
      const fitW = (width * 0.62) / Math.tan((cam.fov * Math.PI) / 360) / cam.aspect;
      const dist = Math.max(fitH, fitW);
      cam.position.set(0, tallest * 0.55, dist);
      cam.lookAt(new Vector3(0, tallest * 0.5, 0));
    }
    if (portraitMode && cast[0]) {
      // head and shoulders, turned a little toward the light
      const head = cast[0].vrm.humanoid.getNormalizedBoneNode('head')!.getWorldPosition(new Vector3());
      cam.fov = 24;
      cam.position.set(head.x + 0.32, head.y + 0.04, head.z + 1.4);
      cam.lookAt(head.x, head.y - 0.05, head.z);
      cam.updateProjectionMatrix();
    }
    for (const a of cast) a.lookAt(cam);
    for (const a of cast) for (let k = 0; k < 10; k++) a.update(1 / 60);
    renderer.render(scene, cam);
    if (portraitMode) window.__castPng = renderer.domElement.toDataURL('image/png');
    window.__castReady = true;
  } catch (e) {
    window.__castError = String((e as Error)?.stack ?? e);
    throw e;
  }
}
