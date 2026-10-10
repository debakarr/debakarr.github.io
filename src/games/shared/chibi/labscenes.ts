// Lab views of real game scenes using the chibi cast (for screenshots and
// comparison against the art pack). ?scene=audience&g=f&title=Queen&tier=2&color=%232f58b8&mood=happy
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import { AudienceScene } from '../../year-zero/render3d/audience';
import { BattleScene } from '../../year-zero/render3d/battle';
import type { Expression } from '../../year-zero/render3d/models/kitleader';
import { loadKit } from '../../year-zero/render3d/kit';

export async function startScene(host: HTMLElement, q: URLSearchParams): Promise<void> {
  const W = host.clientWidth || window.innerWidth;
  const H = host.clientHeight || window.innerHeight;
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  await loadKit();
  // sculpted models load asynchronously: ?wait=ms gives them time before the still
  const settle = () => new Promise((r) => setTimeout(r, Number(q.get('wait') ?? 0)));
  if (q.get('scene') === 'battle') {
    const side = (type: string, color: string, skin: string, civ: string) => ({ civName: civ, adj: civ, color, skin, type, label: type, hpBefore: 100, hpAfter: 60, max: 100, lost: false, tier: 2 });
    const b = new BattleScene({
      title: 'Battle',
      attacker: side(q.get('a') ?? 'swordsmen', q.get('ac') ?? '#2f58b8', '#ffffff', 'Lumenia'),
      defender: side(q.get('d') ?? 'spearmen', q.get('dc') ?? '#b8382e', '#c69c7e', 'Drakos'),
      city: null,
      captured: false,
      ranged: false,
      terrain: Number(q.get('terrain') ?? 1),
      feature: 0,
      relief: 0,
      river: false,
      water: false,
      seed: 7,
    }, true);
    b.resize(W, H);
    await settle();
    const steps = Number(q.get('steps') ?? 30);
    for (let i = 0; i < steps; i++) b.update(0.05, i * 0.05);
    renderer.render(b.scene, b.camera);
    (window as unknown as { labReady: boolean }).labReady = true;
    return;
  }
  const scene = new AudienceScene({
    leader: {
      gender: (q.get('g') ?? 'f') as 'f' | 'm',
      title: q.get('title') ?? 'Queen',
      tier: Number(q.get('tier') ?? 2),
      color: q.get('color') ?? '#2f58b8',
      skin: q.get('skin') ?? '#d39a72',
      seed: Number(q.get('seed') ?? 1),
      age: Number(q.get('age') ?? 0.3),
    },
    envoy: { gender: 'm', title: 'Envoy', tier: 2, color: q.get('envoy') ?? '#b8382e', skin: '#f8cdb0', seed: 99, age: 0.3 },
    civColor: q.get('color') ?? '#2f58b8',
    emblem: 1,
  }, true);
  scene.resize(W, H);
  const mood = (q.get('mood') ?? 'happy') as Expression;
  scene.setMood(mood);
  await settle();
  for (let i = 0; i < 40; i++) scene.update(0.05);
  renderer.render(scene.scene, scene.camera);
  (window as unknown as { labReady: boolean }).labReady = true;
}
