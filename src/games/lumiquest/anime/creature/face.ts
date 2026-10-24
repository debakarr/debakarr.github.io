// Anime faces for creatures: big glossy eyes (dark iris melting into the
// eye colour, two highlights, a soft upper rim), closed "happy" and "sleepy"
// eyes, a small mouth and blush, all painted on canvases and laid onto the
// sculpted head as small patches that follow its curve.

import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Matrix4, Quaternion, SRGBColorSpace, Vector3, type Texture } from 'three';
import { gradient, march, type V3 } from './sdf';

const cache = new Map<string, Texture>();

function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Texture {
  let t = cache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** An open eye: a tall glossy oval, dark at the top melting to the eye colour, with highlights. */
export function eyeTexture(color: string): Texture {
  return canvasTexture(`eye:${color}`, 128, 160, (g) => {
    const cx = 64;
    const cy = 82;
    const rx = 50;
    const ry = 66;
    const col = new Color(color);
    const deep = col.clone().multiplyScalar(0.28);
    const mid = col.clone().multiplyScalar(0.75);
    const lite = col.clone().lerp(new Color('#ffffff'), 0.35);
    // dark rim
    g.fillStyle = `#${deep.clone().multiplyScalar(0.6).getHexString()}`;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    // iris: deep at the top, bright toward the bottom
    const grad = g.createLinearGradient(0, cy - ry, 0, cy + ry);
    grad.addColorStop(0, `#${deep.getHexString()}`);
    grad.addColorStop(0.45, `#${mid.getHexString()}`);
    grad.addColorStop(1, `#${lite.getHexString()}`);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(cx, cy + 3, rx - 6, ry - 7, 0, 0, Math.PI * 2);
    g.fill();
    // pupil
    g.fillStyle = `#${deep.clone().multiplyScalar(0.5).getHexString()}`;
    g.beginPath();
    g.ellipse(cx, cy + 4, rx * 0.42, ry * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    // a lighter crescent low in the iris
    g.globalAlpha = 0.55;
    g.fillStyle = `#${lite.clone().lerp(new Color('#ffffff'), 0.3).getHexString()}`;
    g.beginPath();
    g.ellipse(cx, cy + ry * 0.62, rx * 0.55, ry * 0.18, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    // highlights
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(cx - 17, cy - 26, 15, 19, -0.35, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(cx + 18, cy + 26, 7, 8, 0, 0, Math.PI * 2);
    g.fill();
    // soft upper lid shadow
    g.globalAlpha = 0.35;
    g.fillStyle = '#000000';
    g.beginPath();
    g.ellipse(cx, cy - ry + 10, rx - 4, 16, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  });
}

/** A closed eye: a happy arc (^) or a sleepy line (‿). */
export function closedEyeTexture(kind: 'happy' | 'sleep'): Texture {
  return canvasTexture(`closed:${kind}`, 128, 160, (g) => {
    g.strokeStyle = '#2a1f2e';
    g.lineCap = 'round';
    g.lineWidth = 13;
    g.beginPath();
    if (kind === 'happy') g.arc(64, 98, 40, Math.PI * 1.12, Math.PI * 1.88);
    else g.arc(64, 62, 40, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  });
}

/** Mouth and blush, centred on the face below the eyes. */
export function mouthTexture(open: boolean, blush: string): Texture {
  return canvasTexture(`mouth:${open}:${blush}`, 256, 128, (g) => {
    // blush
    const b = new Color(blush);
    for (const x of [40, 216]) {
      const gr = g.createRadialGradient(x, 52, 2, x, 52, 34);
      gr.addColorStop(0, `rgba(${Math.round(b.r * 255)},${Math.round(b.g * 255)},${Math.round(b.b * 255)},0.75)`);
      gr.addColorStop(1, `rgba(${Math.round(b.r * 255)},${Math.round(b.g * 255)},${Math.round(b.b * 255)},0)`);
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, 52, 36, 22, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#3a2228';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 7;
    if (open) {
      // a small open smile
      g.fillStyle = '#c24a5a';
      g.beginPath();
      g.moveTo(108, 50);
      g.quadraticCurveTo(128, 92, 148, 50);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#ff9aa8';
      g.beginPath();
      g.ellipse(128, 70, 10, 6, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      // a cat-like ω
      g.beginPath();
      g.moveTo(104, 50);
      g.quadraticCurveTo(116, 66, 128, 52);
      g.quadraticCurveTo(140, 66, 152, 50);
      g.stroke();
    }
  });
}

export interface Patch {
  geometry: BufferGeometry;
  /** Where the patch sits on the surface (model space). */
  anchor: Vector3;
  /** Rotation of the patch frame (x = right, y = up, z = out of the surface). */
  quaternion: Quaternion;
}

/**
 * A curved patch lying on the surface: `toward` is a point just off the
 * surface where the patch should centre, `up` orients it. Vertices are
 * stored relative to the anchor in the patch frame, so scaling the mesh in
 * y squeezes it vertically (blinks).
 */
export function surfacePatch(f: (x: number, y: number, z: number) => number, toward: V3, inward: V3, up: V3, w: number, h: number, seg = 6, lift = 0.0015): Patch | null {
  const hit = march(f, toward, inward, 1);
  if (!hit) return null;
  const n = new Vector3(...gradient(f, hit));
  const u = new Vector3(...up);
  const right = new Vector3().crossVectors(u, n).normalize();
  const upT = new Vector3().crossVectors(n, right).normalize();
  const anchor = new Vector3(...hit);
  const basis = new Matrix4().makeBasis(right, upT, n);
  const q = new Quaternion().setFromRotationMatrix(basis);
  const inv = q.clone().invert();
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const tmp = new Vector3();
  for (let j = 0; j <= seg; j++)
    for (let i = 0; i <= seg; i++) {
      const s = (i / seg - 0.5) * w;
      const t = (j / seg - 0.5) * h;
      const start: V3 = [anchor.x + right.x * s + upT.x * t + n.x * 0.08, anchor.y + right.y * s + upT.y * t + n.y * 0.08, anchor.z + right.z * s + upT.z * t + n.z * 0.08];
      const p = march(f, start, [-n.x, -n.y, -n.z], 0.3) ?? [anchor.x + right.x * s + upT.x * t, anchor.y + right.y * s + upT.y * t, anchor.z + right.z * s + upT.z * t];
      const pn = gradient(f, p);
      tmp.set(p[0] + pn[0] * lift - anchor.x, p[1] + pn[1] * lift - anchor.y, p[2] + pn[2] * lift - anchor.z).applyQuaternion(inv);
      pos.push(tmp.x, tmp.y, tmp.z);
      uv.push(i / seg, j / seg);
    }
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      idx.push(a, a + 1, a + seg + 2, a, a + seg + 2, a + seg + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, anchor, quaternion: q };
}
