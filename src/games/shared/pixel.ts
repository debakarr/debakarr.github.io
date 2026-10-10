// The 2D games share the voxel games' blocky look as pixel art: their canvases
// render at a fraction of the screen resolution (PIXEL_DPR canvas pixels per
// CSS pixel) and the browser scales them up without smoothing.

/** Canvas pixels per CSS pixel (0.5: every game pixel is 2×2 CSS pixels). */
export const PIXEL_DPR = 0.5;

/** Makes a canvas scale up crisply; call after every resize (it resets the context). */
export function pixelate(canvas: HTMLCanvasElement): void {
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
}
