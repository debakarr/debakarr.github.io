// A chibi character as plain data: face, hair, body and a list of costume
// pieces. Every leader, soldier and villager in the games is one of these.

import type { Expression, FaceSpec } from './face';


/** Heraldic emblems painted as pixel art on tabards, shields and capes. */
export type Emblem = 'fleur' | 'swords' | 'sun' | 'knot' | 'wave' | 'blossom' | 'mountain' | 'leaf';

export type HairStyle =
  | 'tousled' | 'curlyBun' | 'mane' | 'longWavy' | 'topknot' | 'braids' | 'shaggy' | 'tiedBack' | 'ponytail'
  | 'short' | 'bob' | 'twintails' | 'spiky' | 'messy' | 'long' | 'none';

export interface HairSpec {
  style: HairStyle;
  color: string;
  /** Ribbons, beads, ties. */
  accent?: string;
  /** Facial hair: a full beard and moustache in the hair colour. */
  beard?: 'full' | 'short' | 'moustache';
  /** Seed for lock variation. */
  seed?: number;
}

export interface BodySpec {
  /** Broader shoulders, thicker limbs (the Highland King). */
  stocky?: number;
  /** Slimmer waist and limbs, softer shoulders. */
  slender?: boolean;
  /** Overall scale (1 = standard). */
  scale?: number;
}

export type Hand = 'L' | 'R';

export type Piece =
  | { k: 'tunic'; color: string; trim?: string; length?: number; collar?: string; vneck?: string }
  | { k: 'sleeves'; color: string; style?: 'puff' | 'long' | 'wide' | 'short' | 'bare'; cuff?: string; trim?: string }
  | { k: 'tabard'; color: string; trim?: string; emblem?: Emblem; emblemColor?: string; length?: number }
  | { k: 'vest'; color: string; trim?: string; open?: boolean }
  | { k: 'robe'; color: string; trim?: string; inner?: string; length?: number; flare?: number; pattern?: string; sash?: string; wideSleeves?: boolean }
  | { k: 'gown'; layers: { color: string; length: number; flare: number; trim?: string; open?: number }[]; bodice: string; trim?: string; pattern?: string }
  | { k: 'skirt'; color: string; length?: number; trim?: string; flare?: number; wrap?: string }
  | { k: 'apron'; color: string; trim?: string; patch?: string }
  | { k: 'pants'; color: string; baggy?: boolean; short?: boolean }
  | { k: 'boots'; color: string; cuff?: string; buckle?: string; sole?: string; tall?: boolean }
  | { k: 'sandals'; color: string; wraps?: boolean }
  | { k: 'shoes'; color: string; trim?: string }
  | { k: 'gloves'; color: string; fingerless?: boolean }
  | { k: 'bracers'; color: string; trim?: string }
  | { k: 'bangles'; color: string }
  | { k: 'belt'; color: string; buckle?: string; y?: number; wide?: boolean }
  | { k: 'strap'; color: string; side: 1 | -1; buckle?: string }
  | { k: 'pouch'; color: string; side: 1 | -1; flap?: string; front?: boolean }
  | { k: 'scarf'; color: string; trim?: string; tails?: boolean }
  | { k: 'cape'; color: string; length?: number; emblem?: Emblem; emblemColor?: string; trim?: string; inner?: string; collar?: string }
  | { k: 'furCloak'; color: string; fur: string; emblem?: Emblem; emblemColor?: string; trim?: string }
  | { k: 'backpack'; color: string; roll?: string; strap?: string; buckle?: string; big?: boolean }
  | { k: 'sash'; color: string; side: 1 | -1; trim?: string }
  | { k: 'necklace'; color: string; beads?: string; pendant?: string; collar?: boolean }
  | { k: 'earrings'; color: string; style: 'hoop' | 'drop' | 'shell'; gem?: string }
  | { k: 'tiara'; color: string; gem?: string }
  | { k: 'crown'; color: string; gem?: string; style?: 'band' | 'tall' }
  | { k: 'hairpiece'; color: string; gem?: string }
  | { k: 'flower'; color: string; side?: 1 | -1 }
  | { k: 'helmet'; color: string; trim?: string; plume?: string; visor?: boolean }
  | { k: 'hat'; style: 'straw' | 'cap' | 'kerchief' | 'fisher' | 'bandana' | 'scholar' | 'tricorn' | 'kepi' | 'steel' | 'fur'; color: string; band?: string; goggles?: boolean }
  | { k: 'glasses'; color?: string }
  | { k: 'goggles'; color?: string; lens?: string }
  | { k: 'pauldrons'; color: string; trim?: string }
  | { k: 'breastplate'; color: string; trim?: string; emblem?: Emblem; emblemColor?: string }
  | { k: 'medallion'; color: string; gem?: string; emblem?: Emblem }
  | { k: 'shield'; style: 'heater' | 'round'; color: string; trim?: string; emblem?: Emblem; emblemColor?: string; boss?: string }
  | { k: 'item'; item: Item; hand: Hand | 'back' | 'hip'; color?: string; accent?: string };

export type Item =
  | 'sword' | 'spear' | 'bow' | 'quiver' | 'hammer' | 'spyglass' | 'staff' | 'book' | 'basket' | 'net'
  | 'scroll' | 'herbs' | 'rod' | 'scepter' | 'fan' | 'bucket' | 'satchel' | 'map' | 'sack' | 'oar' | 'axe' | 'musket' | 'rifle';

export interface ChibiSpec {
  id: string;
  name: string;
  face: FaceSpec;
  hair: HairSpec;
  body?: BodySpec;
  outfit: Piece[];
  /** Default expression. */
  mood?: Expression;
}
