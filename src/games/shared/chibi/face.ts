// Character faces: the expression set and what a face is made of. Faces are
// drawn as pixel art on the voxel head (see facePixels in vbody.ts).

export type Expression = 'neutral' | 'happy' | 'focused' | 'surprised' | 'concerned' | 'determined' | 'laugh' | 'blink' | 'wink';
export const EXPRESSIONS: Expression[] = ['neutral', 'happy', 'focused', 'surprised', 'concerned', 'determined', 'laugh', 'blink', 'wink'];

export interface FaceSpec {
  skin: string;
  eyes: string;
  brows: string;
  /** Long lashes with an outer flick and a lower lash hint. */
  lashes?: boolean;
  /** 0 – 1 */
  blush?: number;
  lips?: string;
  freckles?: boolean;
  /** Painted beard / stubble under the 3D beard (so the jaw reads as hair). */
  beard?: string;
  /** Narrower, slightly upturned eyes. */
  almond?: boolean;
  /** Eye size multiplier (1 = default). */
  eyeScale?: number;
  /** Older characters get a softer crease under the eyes. */
  age?: number;
}
