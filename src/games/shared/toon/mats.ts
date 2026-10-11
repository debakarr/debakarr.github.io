// Materials for painterly characters (LumiQuest). Colours live in vertex
// colours, so one material per surface type covers every costume. Each has
// its own response to light: fabric with a soft sheen, waxy leather, brushed
// metal, warm skin, glossy hair. Emblems are painted decals.

import { CanvasTexture, Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace, type Material } from 'three';

export type Surface = 'cloth' | 'silk' | 'leather' | 'metal' | 'gold' | 'skin' | 'hair' | 'fur' | 'gem' | 'wood' | 'straw' | 'glass' | 'sheet';

const cache = new Map<string, Material>();

/** One shared vertex-coloured material per surface type. */
export function surface(s: Surface): Material {
  let m = cache.get(s);
  if (m) return m;
  const std = (o: { roughness: number; metalness?: number; emissive?: string; ei?: number }) =>
    new MeshStandardMaterial({ vertexColors: true, roughness: o.roughness, metalness: o.metalness ?? 0, emissive: new Color(o.emissive ?? '#000000'), emissiveIntensity: o.ei ?? 1 });
  const cloth = (sheen: number, rough: number) =>
    new MeshPhysicalMaterial({ vertexColors: true, roughness: rough, sheen, sheenRoughness: 0.6, sheenColor: new Color('#fff4e6') });
  switch (s) {
    case 'cloth':
      m = cloth(0.5, 0.85);
      break;
    case 'silk':
      m = cloth(0.9, 0.5);
      break;
    case 'sheet':
      m = cloth(0.5, 0.85);
      (m as MeshPhysicalMaterial).side = DoubleSide;
      break;
    case 'leather':
      m = std({ roughness: 0.55 });
      break;
    case 'metal':
      m = std({ roughness: 0.32, metalness: 0.65, emissive: '#1a1c22', ei: 0.4 });
      break;
    case 'gold':
      m = std({ roughness: 0.3, metalness: 0.75, emissive: '#3a2a08', ei: 0.5 });
      break;
    case 'gem':
      m = std({ roughness: 0.15, emissive: '#ffffff', ei: 0.12 });
      break;
    case 'skin':
      m = std({ roughness: 0.6, emissive: '#3a1a10', ei: 0.18 });
      break;
    case 'hair':
      m = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, sheen: 0.4, sheenColor: new Color('#ffe8c8'), clearcoat: 0.25, clearcoatRoughness: 0.5 });
      break;
    case 'fur':
      m = cloth(1, 0.9);
      break;
    case 'glass':
      m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.1, transparent: true, opacity: 0.5 });
      break;
    default:
      m = std({ roughness: 0.8 });
  }
  m!.userData.surface = s;
  cache.set(s, m!);
  return m!;
}

// ---------------------------------------------------------------------------
// Emblems: painted decals for tabards, capes, shields and banners.

export type Emblem = 'fleur' | 'swords' | 'sun' | 'knot' | 'wave' | 'blossom' | 'mountain' | 'leaf';

function paintEmblem(ctx: CanvasRenderingContext2D, e: Emblem, color: string, S: number): void {
  const c = S / 2;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (e) {
    case 'fleur': {
      // centre petal
      ctx.beginPath();
      ctx.moveTo(c, S * 0.08);
      ctx.bezierCurveTo(c + S * 0.14, S * 0.22, c + S * 0.1, S * 0.42, c, S * 0.58);
      ctx.bezierCurveTo(c - S * 0.1, S * 0.42, c - S * 0.14, S * 0.22, c, S * 0.08);
      ctx.fill();
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(c + s * S * 0.04, S * 0.52);
        ctx.bezierCurveTo(c + s * S * 0.18, S * 0.22, c + s * S * 0.44, S * 0.28, c + s * S * 0.36, S * 0.44);
        ctx.bezierCurveTo(c + s * S * 0.3, S * 0.36, c + s * S * 0.22, S * 0.42, c + s * S * 0.2, S * 0.56);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(c, S * 0.66);
        ctx.bezierCurveTo(c + s * S * 0.08, S * 0.74, c + s * S * 0.2, S * 0.88, c + s * S * 0.08, S * 0.92);
        ctx.lineTo(c, S * 0.8);
        ctx.fill();
      }
      ctx.fillRect(c - S * 0.2, S * 0.58, S * 0.4, S * 0.07);
      break;
    }
    case 'swords':
      ctx.lineWidth = S * 0.07;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(c - s * S * 0.32, S * 0.18);
        ctx.lineTo(c + s * S * 0.26, S * 0.76);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(c + s * S * 0.12, S * 0.72);
        ctx.lineTo(c + s * S * 0.36, S * 0.6);
        ctx.stroke();
      }
      break;
    case 'sun':
      ctx.beginPath();
      ctx.arc(c, c, S * 0.18, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const r1 = S * 0.24;
        const r2 = S * (k % 2 ? 0.36 : 0.44);
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a - 0.12) * r1, c + Math.sin(a - 0.12) * r1);
        ctx.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2);
        ctx.lineTo(c + Math.cos(a + 0.12) * r1, c + Math.sin(a + 0.12) * r1);
        ctx.fill();
      }
      ctx.lineWidth = S * 0.03;
      ctx.beginPath();
      ctx.arc(c, c, S * 0.47, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'knot':
      // a Celtic-ish interlaced diamond
      ctx.lineWidth = S * 0.06;
      for (const r of [0.38, 0.22]) {
        ctx.beginPath();
        ctx.moveTo(c, c - S * r);
        ctx.lineTo(c + S * r, c);
        ctx.lineTo(c, c + S * r);
        ctx.lineTo(c - S * r, c);
        ctx.closePath();
        ctx.stroke();
      }
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        ctx.beginPath();
        ctx.arc(c + dx * S * 0.3, c + dy * S * 0.3, S * 0.08, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'wave':
      ctx.lineWidth = S * 0.075;
      for (const o of [-0.16, 0.02, 0.2]) {
        ctx.beginPath();
        ctx.moveTo(S * 0.12, c + S * o + S * 0.05);
        ctx.bezierCurveTo(S * 0.3, c + S * o - S * 0.18, S * 0.45, c + S * o + S * 0.14, S * 0.6, c + S * o - S * 0.04);
        ctx.bezierCurveTo(S * 0.7, c + S * o - S * 0.14, S * 0.84, c + S * o - S * 0.06, S * 0.9, c + S * o + S * 0.02);
        ctx.stroke();
      }
      break;
    case 'blossom':
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.ellipse(c + Math.cos(a) * S * 0.2, c + Math.sin(a) * S * 0.2, S * 0.17, S * 0.12, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(c, c, S * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * S * 0.07, c + Math.sin(a) * S * 0.07, S * 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'mountain':
      ctx.beginPath();
      ctx.moveTo(S * 0.08, S * 0.8);
      ctx.lineTo(S * 0.38, S * 0.25);
      ctx.lineTo(S * 0.52, S * 0.48);
      ctx.lineTo(S * 0.64, S * 0.32);
      ctx.lineTo(S * 0.92, S * 0.8);
      ctx.closePath();
      ctx.fill();
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(c, S * 0.1);
      ctx.bezierCurveTo(c + S * 0.35, S * 0.3, c + S * 0.3, S * 0.7, c, S * 0.9);
      ctx.bezierCurveTo(c - S * 0.3, S * 0.7, c - S * 0.35, S * 0.3, c, S * 0.1);
      ctx.fill();
      break;
  }
}

const emblemCache = new Map<string, Material>();

/** A decal material for an emblem (alpha-tested, double-sided, lit). */
export function emblemMaterial(e: Emblem, color: string, metallic = true): Material {
  const key = `${e}|${color}|${metallic}`;
  let m = emblemCache.get(key);
  if (m) return m;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  // a soft dark outline under the emblem reads as embroidery / engraving
  ctx.save();
  ctx.shadowColor = 'rgba(40,24,10,0.6)';
  ctx.shadowBlur = 6;
  paintEmblem(ctx, e, color, S);
  ctx.restore();
  paintEmblem(ctx, e, color, S);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  m = new MeshStandardMaterial({ map: t, alphaTest: 0.35, side: DoubleSide, roughness: metallic ? 0.35 : 0.8, metalness: metallic ? 0.6 : 0, polygonOffset: true, polygonOffsetFactor: -2 });
  emblemCache.set(key, m);
  return m;
}
