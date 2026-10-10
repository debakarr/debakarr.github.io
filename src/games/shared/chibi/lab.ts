// The character lab: lays out chibi characters like the reference sheets
// (turnaround, expressions, poses) on a warm studio set, to compare against
// the art pack. Query: ?ids=scout,queen&views=front,side,back,threeq&expr=1&clip=idle&t=0.8&anim=1

import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';
import { CAST } from './catalog';
import { appearanceSpec } from '../../lumiquest/entities/character';
import { NPC_LOOKS, PRESETS, presetAppearance } from '../../lumiquest/data/characters';

// LumiQuest's player presets and villagers, by id ('lq-aero', 'lq-elen', …)
for (const p of PRESETS) CAST[`lq-${p.id}`] = appearanceSpec(presetAppearance(p.id));
for (const [id, look] of Object.entries(NPC_LOOKS)) CAST[`lq-${id}`] = appearanceSpec({ name: id, preset: id, ...look });
import { EXPRESSIONS, type Expression } from './face';
import { ChibiModel } from './model';
import type { ClipName } from './rig';

const VIEW_YAW: Record<string, number> = { front: 0, threeq: -0.6, side: -Math.PI / 2, sideR: Math.PI / 2, back: Math.PI };

export function startLab(host: HTMLElement): void {
  const q = new URLSearchParams(location.search);
  if (q.get('scene')) {
    void import('./labscenes').then((m) => m.startScene(host, q));
    return;
  }
  const ids = (q.get('ids') ?? 'scout').split(',').filter((id) => CAST[id]);
  const views = (q.get('views') ?? 'front,threeq,side,back').split(',');
  const clip = (q.get('clip') ?? 'idle') as ClipName;
  const t = Number(q.get('t') ?? 0.4);
  const exprRow = q.get('expr') === '1';
  const mood = q.get('mood') as Expression | null;
  const anim = q.get('anim') === '1';
  const zoom = Number(q.get('zoom') ?? 1);
  const face = q.get('face') === '1';

  const W = host.clientWidth || window.innerWidth;
  const H = host.clientHeight || window.innerHeight;
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W, H);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color('#f4e8d6');
  scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  scene.add(new HemisphereLight('#fff4e4', '#c8a888', 1.1));
  scene.add(new AmbientLight('#fff0e0', 0.25));
  const key = new DirectionalLight('#fff1dc', 2.4);
  key.position.set(2.5, 4, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0005;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new DirectionalLight('#ffe2c0', 1.1);
  rim.position.set(-4, 3, -4);
  scene.add(rim);
  const fill = new DirectionalLight('#e8eeff', 0.5);
  fill.position.set(-5, 2, 4);
  scene.add(fill);

  const ground = new Mesh(new PlaneGeometry(60, 20), new ShadowMaterial({ opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const models: ChibiModel[] = [];
  const cells: { id: string; yaw: number; expr?: Expression }[] = [];
  for (const id of ids) {
    if (face) for (const e of EXPRESSIONS.slice(0, 6)) cells.push({ id, yaw: 0, expr: e });
    else {
      for (const v of views) cells.push({ id, yaw: VIEW_YAW[v] ?? 0, expr: mood ?? undefined });
      if (exprRow) for (const e of ['happy', 'surprised', 'determined'] as Expression[]) cells.push({ id, yaw: -0.25, expr: e });
    }
  }
  const gap = face ? 0.62 : 1.05;
  const width = cells.length * gap;
  cells.forEach((c, i) => {
    const m = new ChibiModel(CAST[c.id], { clip });
    m.root.position.x = (i - (cells.length - 1) / 2) * gap;
    m.root.rotation.y = c.yaw;
    if (c.expr) m.setExpression(c.expr);
    m.pose(clip, t + i * 0.37 * (anim ? 1 : 0));
    scene.add(m.root);
    models.push(m);
  });

  const aspect = W / H;
  const viewH = face ? 0.75 / zoom : Math.max(1.75, (width + 0.4) / aspect) / zoom;
  const cam = new OrthographicCamera((-viewH * aspect) / 2, (viewH * aspect) / 2, viewH / 2, -viewH / 2, 0.1, 50);
  const lookY = face ? 1.02 : 0.68;
  cam.position.set(0, lookY + 0.25, 10);
  cam.lookAt(0, lookY, 0);

  const render = () => renderer.render(scene, cam);
  for (const m of models) m.update(0);
  render();
  (window as unknown as { labReady: boolean }).labReady = true;
  if (anim) {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const m of models) m.update(dt);
      render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
