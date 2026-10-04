import atlasUrl from '../art/sprites.png?url';
import rects from '../art/sprites.json';

// Kenney "Hexagon Pack" sprites (CC0, https://kenney.nl), packed into one
// atlas by scripts/sprite-atlas.mjs: a single download and a single decode.
// The renderer falls back to flat colors until it arrives.

export interface Sprite {
  img: HTMLImageElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

const RECTS = rects as unknown as Record<string, [number, number, number, number]>;

class SpriteSheet {
  private atlas: HTMLImageElement | null = null;
  private cache = new Map<string, Sprite>();
  private promise: Promise<void> | null = null;
  loaded = false;

  load(): Promise<void> {
    if (this.promise) return this.promise;
    this.promise = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.atlas = img;
        this.loaded = true;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = atlasUrl;
    });
    return this.promise;
  }

  get(name: string): Sprite | undefined {
    if (!this.atlas) return undefined;
    let s = this.cache.get(name);
    if (!s) {
      const r = RECTS[name];
      if (!r) return undefined;
      s = { img: this.atlas, x: r[0], y: r[1], w: r[2], h: r[3] };
      this.cache.set(name, s);
    }
    return s;
  }
}

export const sprites = new SpriteSheet();
