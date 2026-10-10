// Live (mixer-driven) versions of the unit looks, for scenes with only a
// handful of actors: battles, the title screen and audiences. They use the
// same specs as the baked map squads (looks.ts) so a unit looks the same
// everywhere, but play real clips with cross-fades.

import {
  AnimationAction,
  AnimationMixer,
  Color,
  Group,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  type Bone,
} from 'three';
import { charInstance, clip, hasClip } from './kit';
import { boneName, compose, type AnimState, type FigureSpec, type LookSpec, type RigidSpec } from './rig';

export type LiveState = AnimState | 'run' | 'cheer' | 'aim';

const DEFAULTS: Record<LiveState, string> = {
  idle: 'Idle',
  walk: 'Walking_A',
  run: 'Running_A',
  attack: '1H_Melee_Attack_Chop',
  hit: 'Hit_A',
  death: 'Death_A',
  cheer: 'Cheer',
  aim: '2H_Ranged_Aiming',
};
const ONCE: Partial<Record<LiveState, boolean>> = { attack: true, hit: true, death: true };

export interface LiveFigure {
  root: Object3D;
  mixer: AnimationMixer;
  spec: FigureSpec;
  bones: Map<string, Bone>;
  actions: Map<string, AnimationAction>;
  current: AnimationAction | null;
  state: LiveState;
}

/** A material that paints `team` vertices in a side's colour and `team = 2` in skin, with a hit flash. */
export function teamMaterial(color: string, skin: string): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
  const uniforms = { uTeam: { value: new Color(color) }, uSkin: { value: new Color(skin) }, uFlash: { value: 0 } };
  m.userData.uniforms = uniforms;
  m.customProgramCacheKey = () => 'yz-battle-team';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute float team;\nuniform vec3 uTeam;\nuniform vec3 uSkin;\n${shader.vertexShader}`.replace('#include <color_vertex>', `
      vColor = vec4(1.0);
      vColor.xyz *= color.xyz;
      if (team > 1.5) vColor.xyz *= uSkin;
      else vColor.xyz = mix(vColor.xyz, vColor.xyz * uTeam, clamp(team, 0.0, 1.0));`);
    shader.fragmentShader = `uniform float uFlash;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.92, 0.85), uFlash);');
  };
  return m;
}

/** A KayKit figure dressed as in its spec (accessories, props), with its own mixer. */
export function liveFigure(spec: FigureSpec, material?: MeshStandardMaterial): LiveFigure {
  const root = charInstance(spec.char);
  const bones = new Map<string, Bone>();
  root.traverse((o) => {
    if ((o as Bone).isBone) bones.set(o.name, o as Bone);
    const m = o as Mesh;
    if (m.isMesh) {
      // geometry is shared with the kit: scenes must not dispose it
      m.userData.keep = true;
      if (!(m as SkinnedMesh).isSkinnedMesh) m.visible = spec.show.includes(m.name);
      m.castShadow = true;
      m.receiveShadow = true;
      if (material) m.material = material;
    }
  });
  for (const p of spec.props ?? []) {
    const host = bones.get(boneName(p.bone));
    if (!host) continue;
    const m = new Mesh(p.geo, material ?? new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    m.userData.keep = true;
    compose(p.t, m.matrix);
    m.matrix.decompose(m.position, m.quaternion, m.scale);
    m.castShadow = true;
    host.add(m);
  }
  const mixer = new AnimationMixer(root);
  const f: LiveFigure = { root, mixer, spec, bones, actions: new Map(), current: null, state: 'idle' };
  play(f, 'idle', 0);
  return f;
}

function clipName(f: LiveFigure, s: LiveState): string {
  const fromSpec = f.spec.clips?.[s];
  const name = fromSpec ?? DEFAULTS[s];
  return hasClip(name) ? name : DEFAULTS[s === 'run' ? 'walk' : 'idle'];
}

/** Cross-fades a figure into a state (one-shots restart; loops keep running). */
export function play(f: LiveFigure, s: LiveState, fade = 0.18, clipOverride?: string): void {
  const name = clipOverride ?? clipName(f, s);
  let a = f.actions.get(name);
  if (!a) {
    a = f.mixer.clipAction(clip(name));
    f.actions.set(name, a);
  }
  const once = ONCE[s] ?? false;
  a.setLoop(once ? LoopOnce : LoopRepeat, Infinity);
  a.clampWhenFinished = once;
  if (f.current === a && !once) return;
  a.reset();
  a.enabled = true;
  a.setEffectiveWeight(1);
  if (f.current && fade > 0) a.crossFadeFrom(f.current, fade, false);
  else if (f.current) f.current.stop();
  a.play();
  f.current = a;
  f.state = s;
}

/** Advances a figure's clip and re-applies its pose tweaks. */
export function tickFigure(f: LiveFigure, dt: number, t: number): void {
  f.mixer.update(dt);
  const s: AnimState = f.state === 'run' ? 'walk' : f.state === 'cheer' || f.state === 'aim' ? 'idle' : f.state;
  if (f.spec.pose) {
    f.root.updateMatrixWorld(true);
    f.spec.pose((n) => f.bones.get(boneName(n)), s, t);
  }
}

// --- whole looks -------------------------------------------------------------------------------------

export interface LiveLook {
  root: Group;
  figures: LiveFigure[];
  rigid: { spec: RigidSpec; mesh: Mesh }[];
  state: LiveState;
  since: number;
}

/**
 * A look built live: rigid parts as meshes moved by their motion functions,
 * figures placed (and mounted) as in the spec.
 */
export function liveLook(spec: LookSpec, material: MeshStandardMaterial): LiveLook {
  const root = new Group();
  const rigid = (spec.rigid ?? []).map((r) => {
    const mesh = new Mesh(r.geo, material);
    mesh.userData.keep = true;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return { spec: r, mesh };
  });
  const figures = spec.figures.map((fs) => {
    const f = liveFigure(fs, material);
    const holder = new Object3D();
    holder.matrixAutoUpdate = false;
    compose(fs.t, holder.matrix);
    holder.userData.place = holder.matrix.clone();
    holder.add(f.root);
    root.add(holder);
    f.root.userData.holder = holder;
    return f;
  });
  const look: LiveLook = { root, figures, rigid, state: 'idle', since: 0 };
  tickLook(look, 0, 0);
  return look;
}

export function playLook(l: LiveLook, s: LiveState, now: number, fade = 0.18): void {
  for (const f of l.figures) play(f, s, fade);
  if (l.state !== s || ONCE[s]) l.since = now;
  l.state = s;
}

const tmp = new Matrix4();

/** Advances every figure and moves rigid parts (and riders on them). */
export function tickLook(l: LiveLook, dt: number, now: number): void {
  const st: AnimState = l.state === 'run' ? 'walk' : l.state === 'cheer' || l.state === 'aim' ? 'idle' : l.state;
  const t = now - l.since;
  const byName = new Map<string, Matrix4>();
  for (const r of l.rigid) {
    if (r.spec.motion) r.spec.motion(st, t, r.mesh.matrix);
    else r.mesh.matrix.identity();
    r.mesh.matrixWorldNeedsUpdate = true;
    byName.set(r.spec.name, r.mesh.matrix);
  }
  for (const f of l.figures) {
    const holder = f.root.userData.holder as Object3D;
    const place = holder.userData.place as Matrix4;
    const mount = f.spec.mount ? byName.get(f.spec.mount) : undefined;
    if (mount) holder.matrix.multiplyMatrices(mount, place);
    holder.matrixWorldNeedsUpdate = true;
    tickFigure(f, dt, t);
  }
  void tmp;
}

/** Splits a squad into single actors: each rider with its horse, each soldier alone, machines whole. */
export function splitLook(spec: LookSpec): LookSpec[] {
  const mounted = spec.figures.filter((f) => f.mount);
  if (mounted.length) {
    return mounted.map((f) => {
      const k = f.mount!.replace(/^\D+/, '');
      return { figures: [f], rigid: (spec.rigid ?? []).filter((r) => r.name.endsWith(k)) };
    });
  }
  if (spec.rigid?.length || !spec.figures.length) return [spec];
  return spec.figures.map((f) => ({ figures: [{ ...f, t: { s: f.t?.s, r: [0, 0, 0] } }] }));
}
