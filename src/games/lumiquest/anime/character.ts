// A drop-in for entities/character.ts's CharacterModel, backed by a VRM
// avatar. The model streams in after construction; animation requests made
// before then are remembered and applied when it arrives.

import { Group } from 'three';
import type { Expression } from '../../shared/toon/face';
import type { Appearance } from '../data/characters';
import { Avatar, type Mood } from './avatar';
import { castFor, castUrl } from './cast';

/** The parts of the shared Animator the game uses. */
export interface AnimLike {
  readonly current: string;
  readonly busy: boolean;
  has(name: string): boolean;
  play(name: string, fade?: number, timeScale?: number): void;
  once(name: string, fade?: number, timeScale?: number): number;
  setSpeed(timeScale: number): void;
  update(dt: number): void;
}

const MOODS: Partial<Record<Expression, Mood>> = { happy: 'happy', laugh: 'happy', neutral: 'neutral', focused: 'neutral', determined: 'neutral', surprised: 'surprised', concerned: 'sad' };

export class AnimeCharacter {
  readonly root = new Group();
  appearance: Appearance;
  readonly animator: AnimLike;
  /** Resolves when the current model is on screen. */
  ready: Promise<void> = Promise.resolve();
  private avatar: Avatar | null = null;
  private gen = 0;
  private base = { name: 'idle', fade: 0.2, speed: 1 };
  private bodyVisible = true;

  constructor(appearance: Appearance, private castShadow = true) {
    this.appearance = structuredClone(appearance);
    const self = this;
    this.animator = {
      get current() {
        return self.avatar?.animator.current ?? self.base.name;
      },
      get busy() {
        return self.avatar?.animator.busy ?? false;
      },
      has: (n) => self.avatar?.animator.has(n) ?? true,
      play: (n, fade = 0.22, ts = 1) => {
        self.base = { name: n, fade, speed: ts };
        self.avatar?.animator.play(n, fade, ts);
      },
      once: (n, fade = 0.12, ts = 1) => self.avatar?.animator.once(n, fade, ts) ?? 0,
      setSpeed: (ts) => {
        self.base.speed = ts;
        self.avatar?.animator.setSpeed(ts);
      },
      update: (dt) => self.avatar?.update(dt),
    };
    this.load();
  }

  private load(): void {
    const g = ++this.gen;
    const id = castFor(this.appearance).id;
    this.ready = Avatar.load(castUrl(castFor(this.appearance))).then((av) => {
      if (g !== this.gen || castFor(this.appearance).id !== id) {
        av.dispose();
        return;
      }
      this.avatar?.dispose();
      this.avatar = av;
      if (!this.castShadow) av.root.traverse((o) => (o.castShadow = false));
      this.root.add(av.root);
      av.animator.play(this.base.name, 0, this.base.speed);
      av.setLayer(this.bodyVisible ? 0 : 1);
      av.update(0);
      av.resetPhysics();
    });
    this.ready.catch((e) => console.error('character model failed to load', e));
  }

  /** The loaded avatar (null while it streams in). */
  get model(): Avatar | null {
    return this.avatar;
  }

  setAppearance(a: Appearance): void {
    const same = castFor(a).id === castFor(this.appearance).id;
    this.appearance = structuredClone(a);
    if (!same) this.load();
  }

  setExpression(e: Expression): void {
    this.avatar?.setMood(MOODS[e] ?? 'neutral');
  }

  setBodyVisible(visible: boolean): void {
    this.bodyVisible = visible;
    this.avatar?.setLayer(visible ? 0 : 1);
  }

  /** After a teleport. */
  resetPhysics(): void {
    this.avatar?.resetPhysics();
  }

  update(dt: number): void {
    this.avatar?.update(dt);
  }

  dispose(): void {
    this.gen++;
    this.avatar?.dispose();
    this.avatar = null;
    this.root.removeFromParent();
  }
}
