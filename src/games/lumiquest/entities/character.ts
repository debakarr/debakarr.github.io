// The player and villagers, built from the shared chibi kit (the same
// characters, proportions, materials and clips as Year Zero's art pack).
// A LumiQuest `Appearance` (saved with the game) maps onto a chibi spec:
// the hair styles, outfits and accessories keep their ids, so old saves and
// the character creator keep working.

import { Color, Group, type Object3D } from 'three';
import type { Animator } from '../../shared/chibi/anim';
import type { Expression } from '../../shared/chibi/face';
import { ChibiModel } from '../../shared/chibi/model';
import type { BoneName } from '../../shared/chibi/rig';
import type { ChibiSpec, HairStyle, Piece } from '../../shared/chibi/spec';
import type { AccessoryId, Appearance, FaceId } from '../data/characters';

/** LumiQuest's world was built for characters about 1.44 tall; chibis are 1.26. */
const SCALE = 1.14;

function shade(hex: string, l: number): string {
  const c = new Color(hex);
  c.offsetHSL(0, 0, l);
  return `#${c.getHexString()}`;
}

const HAIR: Record<Appearance['hair'], HairStyle> = {
  spiky: 'tousled',
  twintails: 'twintails',
  messy: 'shaggy',
  long: 'long',
  bob: 'bob',
};

const MOOD: Record<FaceId, Expression> = { bright: 'happy', gentle: 'neutral', bold: 'determined', sleepy: 'neutral' };

function outfit(a: Appearance): Piece[] {
  const main = a.outfitMain;
  const acc = a.outfitAccent;
  switch (a.outfit) {
    case 'ranger':
      return [
        { k: 'tunic', color: main, length: 0.1, collar: acc, trim: acc },
        { k: 'sleeves', color: main, style: 'long', cuff: acc },
        { k: 'pants', color: '#5b4636', short: true },
        { k: 'boots', color: '#7a4a2e', cuff: '#8a5430', buckle: '#e2b04a' },
        { k: 'belt', color: '#3a2a20', buckle: '#e2b04a' },
        { k: 'gloves', color: shade(main, -0.25), fingerless: true },
      ];
    case 'explorer':
      return [
        { k: 'tunic', color: acc, length: 0.02 },
        { k: 'sleeves', color: acc, style: 'puff' },
        { k: 'skirt', color: main, length: 0.24, flare: 0.24, trim: shade(main, -0.2) },
        { k: 'cape', color: main, length: 0.2, inner: shade(main, -0.15) },
        { k: 'boots', color: shade(acc, -0.1), cuff: shade(acc, 0.05) },
        { k: 'belt', color: shade(main, -0.3), y: 0.07 },
      ];
    case 'scout':
      return [
        { k: 'tunic', color: main, length: 0.08, collar: shade(main, -0.12) },
        { k: 'sleeves', color: main, style: 'long', cuff: shade(main, -0.18) },
        { k: 'pants', color: acc, baggy: true },
        { k: 'shoes', color: '#3a3a44' },
        { k: 'pouch', color: shade(main, -0.18), side: 1, front: true },
      ];
    case 'mystic':
      return [
        { k: 'robe', color: main, trim: acc, inner: shade(main, 0.15), length: 0.36, flare: 0.25, sash: acc },
        { k: 'boots', color: shade(main, -0.25) },
        { k: 'medallion', color: '#e2b04a', gem: acc },
      ];
  }
}

function accessory(id: AccessoryId, a: Appearance): Piece {
  switch (id) {
    case 'scarf':
      return { k: 'scarf', color: a.outfit === 'ranger' ? '#f2c35a' : a.outfitAccent === '#e6e2d8' ? '#d8423a' : a.outfitAccent, tails: true };
    case 'backpack':
      return { k: 'backpack', color: '#b5763c', roll: '#4f8a5a', buckle: '#e2b04a' };
    case 'clip':
      return { k: 'flower', color: '#ffd75a', side: 1 };
    case 'goggles':
      return { k: 'goggles', color: '#7a5a3a', lens: '#8fe0ff' };
    case 'satchel':
      return { k: 'item', item: 'satchel', hand: 'hip', color: '#c08850' };
  }
}

/** A saved LumiQuest appearance as a chibi character. */
export function appearanceSpec(a: Appearance): ChibiSpec {
  const girl = a.hair === 'twintails' || a.hair === 'bob' || a.outfit === 'explorer';
  return {
    id: `lq-${a.preset}-${a.hair}-${a.outfit}-${a.outfitMain}-${a.outfitAccent}-${a.skin}-${a.hairColor}-${a.eye}-${a.face}-${a.accessories.join('.')}`,
    name: a.name,
    vrmKey: `lq-${a.preset}`,
    face: {
      skin: a.skin,
      eyes: a.eye,
      brows: shade(a.hairColor, -0.18),
      lashes: girl || a.face === 'gentle',
      blush: 0.6,
      eyeScale: a.face === 'sleepy' ? 1.02 : 1.12,
      almond: a.face === 'sleepy',
    },
    hair: { style: HAIR[a.hair], color: a.hairColor, accent: a.outfitAccent, seed: a.hair.length * 7 + 3 },
    body: { scale: SCALE, slender: girl },
    mood: MOOD[a.face],
    outfit: [...outfit(a), ...a.accessories.map((id) => accessory(id, a))],
  };
}

export class CharacterModel {
  /** A stable root: rebuilding the character swaps what is inside it. */
  readonly root = new Group();
  appearance: Appearance;
  private model: ChibiModel;
  private bodyVisible = true;
  private castShadow: boolean;

  constructor(appearance: Appearance, castShadow = true) {
    this.appearance = appearance;
    this.castShadow = castShadow;
    this.model = this.build();
  }

  private build(): ChibiModel {
    const m = new ChibiModel(appearanceSpec(this.appearance), { shadows: this.castShadow });
    this.root.add(m.root);
    return m;
  }

  /** The current character's animator (replaced when the appearance changes). */
  get animator(): Animator {
    return this.model.animator;
  }

  setAppearance(a: Appearance): void {
    this.appearance = structuredClone(a);
    const clip = this.model.animator.current || 'idle';
    this.model.dispose();
    this.model = this.build();
    this.model.animator.play(clip, 0);
    this.applyVisibility();
  }

  setExpression(e: Expression): void {
    this.model.setExpression(e);
  }

  /** First-person hides the body from the camera but keeps its shadow. */
  setBodyVisible(visible: boolean): void {
    this.bodyVisible = visible;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    // Layer 1 is rendered only by the shadow pass (first person).
    this.model.setLayer(this.bodyVisible ? 0 : 1);
  }

  update(dt: number): void {
    this.model.update(dt);
  }

  /** A bone, for attaching effects. */
  bone(name: BoneName): Object3D {
    return this.model.bone(name);
  }

  dispose(): void {
    this.model.dispose();
    this.root.removeFromParent();
  }
}
