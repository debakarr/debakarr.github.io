import { icons, type IconKey } from '../art';
import { BUILDING, Zone, type BuildingDef } from '../sim/defs';
import type { Placed } from '../sim/state';
import { box, boxStyle, cylinder, hash, hipRoof, iso, mix, shade, tree, UNIT, windows } from './paint';

// Procedural buildings. Every zoned lot draws from its zone, level and a
// per-lot style byte, so streets look varied but stable between frames.

const WALLS = {
  generic: ['#f2e8d5', '#e9dcc5', '#f5f1ea', '#e3d3bd', '#d9c7b0', '#efe3cf'],
  india: ['#f6d55c', '#f2a0a0', '#8fd3c7', '#f7b267', '#c3a6e0', '#f4f1de', '#9ad1f5', '#f9c6d3'],
};
const ROOFS = ['#c0533f', '#a7493a', '#7d5a4a', '#5f6b7a', '#8a4f3d', '#6b4f3a'];
const AWNINGS = ['#e4572e', '#29b6f6', '#ffca3a', '#8ac926', '#ff6f91', '#6a4c93'];
const GLASS = ['#8fb8de', '#6f9fc8', '#a7c7e7', '#7fa9c9', '#9cc3d5'];
const CONCRETE = ['#d8d4cc', '#cfc9bf', '#e1ddd6', '#c8c3ba'];
const IND = ['#b8b2a7', '#a39e94', '#c2b8a3', '#9da3a8'];

export interface DrawOpts {
  detail: boolean;
  india: boolean;
  /** Overlay mode squashes buildings so the colors underneath show. */
  squash: number;
  /** Optional overlay color for building tops. */
  tint?: string;
}

const pick = <T>(arr: readonly T[], s: number) => arr[(s >>> 0) % arr.length];

export function drawZoneBuilding(ctx: CanvasRenderingContext2D, x: number, y: number, zone: number, level: number, style: number, abandoned: boolean, o: DrawOpts): void {
  const s = style;
  const var1 = ((s >> 3) & 7) / 7;
  const d = o.detail;
  const k = o.squash;
  let wall: string;
  let inset: number;
  let hgt: number;
  let floors: number;
  if (zone === Zone.Res) {
    wall = level <= 2 ? pick(o.india ? WALLS.india : WALLS.generic, s) : level === 3 ? pick(o.india ? WALLS.india : CONCRETE, s) : pick(CONCRETE, s);
    inset = [0, 0.2, 0.13, 0.1, 0.12, 0.17][level];
    hgt = [0, 0.75, 1.25, 2.2, 3.9, 6.8][level] * (0.85 + var1 * 0.3);
    floors = [0, 1, 2, 4, 7, 13][level];
  } else if (zone === Zone.Com) {
    wall = level <= 3 ? pick(o.india ? WALLS.india : CONCRETE, s) : pick(GLASS, s);
    inset = [0, 0.14, 0.1, 0.08, 0.12, 0.15][level];
    hgt = [0, 0.8, 1.2, 2.0, 3.5, 6][level] * (0.85 + var1 * 0.3);
    floors = [0, 1, 2, 3, 6, 11][level];
  } else if (zone === Zone.Ind) {
    wall = pick(IND, s);
    inset = [0, 0.12, 0.08, 0.06, 0.05][level];
    hgt = [0, 0.8, 1.1, 1.4, 1.8][level] * (0.9 + var1 * 0.2);
    floors = 0;
  } else {
    wall = level <= 2 ? pick(['#f3f4f6', '#e6e9ee', '#dfe4ea'], s) : pick(GLASS, s);
    inset = [0, 0.12, 0.1, 0.1, 0.14, 0.18][level];
    hgt = [0, 1.0, 1.9, 3.2, 5.2, 8.6][level] * (0.85 + var1 * 0.3);
    floors = [0, 2, 4, 7, 11, 18][level];
  }
  if (abandoned) wall = mix(wall, '#7b7468', 0.6);
  const H = hgt * UNIT * k;
  const w = 1 - inset * 2;
  const bx = x + inset;
  const by = y + inset;
  const st = boxStyle(wall);
  if (o.tint) st.top = o.tint;

  // Shadow toward the lower right.
  if (d && k === 1) {
    const [sx, sy] = iso(bx + w, by + w * 0.5);
    ctx.fillStyle = 'rgba(40,50,40,0.16)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, w * 20 + H * 0.15, w * 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (zone === Zone.Res && level <= 2 && !o.india) {
    box(ctx, bx, by, w, w, H, st);
    if (d && k === 1) windows(ctx, bx, by, w, w, H, floors, abandoned ? '#4b4b4b' : '#6d8fb3');
    hipRoof(ctx, bx - 0.03, by - 0.03, w + 0.06, w + 0.06, H, (level === 1 ? 9 : 11) * k, abandoned ? '#5e5048' : pick(ROOFS, s >> 2));
    return;
  }
  if (zone === Zone.Ind) {
    box(ctx, bx, by, w, w, H, st);
    if (k < 1) return;
    // Sawtooth roof lights and chimneys.
    if (d) {
      const teeth = level + 1;
      ctx.fillStyle = shade(wall, -0.35);
      for (let t = 0; t < teeth; t++) {
        const tx = bx + (w * (t + 0.5)) / teeth;
        const [ax, ay] = iso(tx, by + 0.1);
        const [cx, cy] = iso(tx, by + w - 0.1);
        ctx.beginPath();
        ctx.moveTo(ax, ay - H);
        ctx.lineTo(cx, cy - H);
        ctx.lineTo(cx, cy - H - 5);
        ctx.lineTo(ax, ay - H - 5);
        ctx.fill();
      }
    }
    if (level >= 2) {
      const n = level >= 4 ? 2 : 1;
      const tall = H + (8 + level * 5) * k;
      for (let c = 0; c < n; c++) {
        box(ctx, bx + w * 0.74, by + 0.14 + c * 0.28, 0.09, 0.09, tall, boxStyle(abandoned ? '#6e625a' : '#a4614a'));
        if (!abandoned) box(ctx, bx + w * 0.74, by + 0.14 + c * 0.28, 0.09, 0.09, 2.5, boxStyle('#e9e4dc'), tall - 4);
      }
    }
    if (level >= 3 && d) {
      cylinder(ctx, bx + 0.22, by + w - 0.2, 6, 16, abandoned ? '#8d877d' : '#d7dbe0');
    }
    return;
  }

  // Generic block: res L3+, India houses, commercial and offices.
  let top = H;
  if (zone === Zone.Com && level <= 3) {
    box(ctx, bx, by, w, w, H, st);
    if (d && !abandoned) {
      // Awnings over the shop fronts.
      const aw = pick(AWNINGS, s >> 1);
      const band = Math.min(6, H * 0.3);
      ctx.fillStyle = aw;
      const [rx, ry] = iso(bx + w, by);
      const [bbx, bby] = iso(bx + w, by + w);
      const [lx, ly] = iso(bx, by + w);
      const zb = Math.min(UNIT * 0.55, H * 0.5);
      ctx.beginPath();
      ctx.moveTo(lx, ly - zb);
      ctx.lineTo(bbx, bby - zb);
      ctx.lineTo(bbx + 2, bby - zb + band);
      ctx.lineTo(lx + 2, ly - zb + band);
      ctx.fill();
      ctx.fillStyle = shade(aw, -0.2);
      ctx.beginPath();
      ctx.moveTo(bbx, bby - zb);
      ctx.lineTo(rx, ry - zb);
      ctx.lineTo(rx + 2, ry - zb + band);
      ctx.lineTo(bbx + 2, bby - zb + band);
      ctx.fill();
    }
    if (d && floors > 1 && k === 1) windows(ctx, bx, by, w, w, H, floors, abandoned ? '#4b4b4b' : '#5f86ad', 0);
  } else if ((zone === Zone.Com || zone === Zone.Off) && level >= 4) {
    // Towers: a podium and a slimmer shaft, sometimes a crown.
    const pod = UNIT * 0.9 * k;
    box(ctx, bx, by, w, w, pod, boxStyle(pick(CONCRETE, s)));
    const ins = 0.12;
    box(ctx, bx + ins, by + ins, w - 2 * ins, w - 2 * ins, H - pod, st, pod);
    if (d && k === 1) windows(ctx, bx + ins, by + ins, w - 2 * ins, w - 2 * ins, H - pod, floors, abandoned ? '#3a3a3a' : shade(wall, 0.45), pod);
    top = H;
    if (level === 5 && k === 1) {
      const c = 0.16;
      box(ctx, bx + ins + c, by + ins + c, w - 2 * (ins + c), w - 2 * (ins + c), UNIT * 0.6, boxStyle(shade(wall, -0.15)), H);
      if (zone === Zone.Off) {
        const [cx, cy] = iso(x + 0.5, y + 0.5);
        ctx.strokeStyle = '#9aa3ad';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy - H - UNIT * 0.6);
        ctx.lineTo(cx, cy - H - UNIT * 2);
        ctx.stroke();
      }
    }
    return;
  } else {
    box(ctx, bx, by, w, w, H, st);
    if (d && k === 1) windows(ctx, bx, by, w, w, H, floors, abandoned ? '#4b4b4b' : zone === Zone.Off ? shade(wall, 0.4) : '#6d8fb3');
  }
  if (!d || k < 1) return;
  // Roof furniture: India gets water tanks, others AC units and stair huts.
  if (o.india && zone === Zone.Res && level <= 3) {
    cylinder(ctx, bx + w * 0.7, by + w * 0.35, 4, 6, (s & 1) ? '#2f3e4e' : '#3b6ea5', top);
  } else if (level >= 3 || zone === Zone.Off) {
    box(ctx, bx + w * 0.55, by + w * 0.2, 0.18, 0.18, 5, boxStyle('#b9bec4'), top);
  }
}

function roofIcon(ctx: CanvasRenderingContext2D, def: BuildingDef, x: number, y: number, z: number, size: number): void {
  if (!icons.has(def.icon)) return;
  const [cx, cy] = iso(x, y);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.ellipse(cx, cy - z, size * 0.75, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy - z);
  ctx.scale(1, 0.62);
  icons.draw(ctx, def.icon as IconKey, 0, 0, size * 0.95, shade(def.color, -0.45));
  ctx.restore();
}

/** Service and landmark buildings, drawn when the painter reaches their front tile. */
export function drawService(ctx: CanvasRenderingContext2D, b: Placed, o: DrawOpts): void {
  const def = BUILDING[b.type];
  const { x, y } = b;
  const w = def.w;
  const h = def.h;
  const k = o.squash;
  const d = o.detail;
  const H = def.height * UNIT * k;
  const st = boxStyle(def.color);
  if (o.tint) st.top = o.tint;
  switch (def.id) {
    case 'park':
    case 'bigpark': {
      if (k < 1) return;
      const n = def.id === 'park' ? 3 : 10;
      for (let t = 0; t < n; t++) {
        const hh = hash(b.id, t);
        tree(ctx, x + 0.15 + ((hh & 255) / 255) * (w - 0.3), y + 0.15 + (((hh >> 8) & 255) / 255) * (h - 0.3), 5 + (hh % 4), pick(['#3f8f3a', '#4ea845', '#2f7a3a'], hh >>> 16), d);
      }
      if (def.id === 'bigpark' && d) {
        const [cx, cy] = iso(x + 1.5, y + 1.5);
        ctx.fillStyle = '#5aa9e6';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    case 'plaza': {
      if (k < 1) return;
      cylinder(ctx, x + 1, y + 1, 9, 3, '#cfc6b0');
      cylinder(ctx, x + 1, y + 1, 6, 4, '#6fb6e8', 0);
      tree(ctx, x + 0.25, y + 0.25, 5, '#4ea845', d);
      tree(ctx, x + 1.75, y + 0.25, 5, '#3f8f3a', d);
      return;
    }
    case 'solar': {
      ctx.fillStyle = '#2d4f86';
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 3; c++) {
          const px = x + 0.15 + c * 0.95;
          const py = y + 0.2 + r * 0.7;
          const [ax, ay] = iso(px, py);
          const [bx2, by2] = iso(px + 0.75, py);
          const [cx2, cy2] = iso(px + 0.75, py + 0.35);
          const [dx2, dy2] = iso(px, py + 0.35);
          ctx.beginPath();
          ctx.moveTo(ax, ay - 4);
          ctx.lineTo(bx2, by2 - 4);
          ctx.lineTo(cx2, cy2);
          ctx.lineTo(dx2, dy2);
          ctx.fill();
        }
      }
      return;
    }
    case 'landfill': {
      ctx.fillStyle = '#9b8566';
      for (let t = 0; t < 4; t++) {
        const [cx, cy] = iso(x + 0.8 + (t % 2) * 1.3, y + 0.8 + (t >> 1) * 1.3);
        ctx.beginPath();
        ctx.ellipse(cx, cy - 4, 18, 9, 0, Math.PI, 0);
        ctx.fill();
      }
      return;
    }
    case 'wind': {
      // The rotor is animated in the live layer.
      const [cx, cy] = iso(x + 0.5, y + 0.5);
      ctx.strokeStyle = '#e9edf2';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - H);
      ctx.stroke();
      return;
    }
    case 'tower': {
      const [cx, cy] = iso(x + 0.5, y + 0.5);
      ctx.strokeStyle = '#7d8790';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy);
      ctx.lineTo(cx - 4, cy - H * 0.6);
      ctx.moveTo(cx + 8, cy);
      ctx.lineTo(cx + 4, cy - H * 0.6);
      ctx.moveTo(cx, cy + 3);
      ctx.lineTo(cx, cy - H * 0.6);
      ctx.stroke();
      cylinder(ctx, x + 0.5, y + 0.5, 11, H * 0.4, def.color, H * 0.6);
      return;
    }
    case 'tvtower': {
      const [cx, cy] = iso(x + 0.5, y + 0.5);
      box(ctx, x + 0.35, y + 0.35, 0.3, 0.3, H, boxStyle('#e6e9ee'));
      cylinder(ctx, x + 0.5, y + 0.5, 10, 8, '#c8d0da', H * 0.72);
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - H);
      ctx.lineTo(cx, cy - H - 20 * k);
      ctx.stroke();
      return;
    }
    case 'stadium': {
      const [cx, cy] = iso(x + 2, y + 2);
      ctx.fillStyle = shade(def.color, -0.2);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 62, 31, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.ellipse(cx, cy - H, 62, 31, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4caf50';
      ctx.beginPath();
      ctx.ellipse(cx, cy - H + 4, 40, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'airport': {
      // Runway, terminal and control tower.
      ctx.fillStyle = '#50555c';
      const run = new Path2D();
      const [ax, ay] = iso(x + 0.3, y + 4.2);
      const [bx2, by2] = iso(x + 5.8, y + 4.2);
      const [cx2, cy2] = iso(x + 5.8, y + 5.3);
      const [dx2, dy2] = iso(x + 0.3, y + 5.3);
      run.moveTo(ax, ay);
      run.lineTo(bx2, by2);
      run.lineTo(cx2, cy2);
      run.lineTo(dx2, dy2);
      ctx.fill(run);
      if (d) {
        ctx.strokeStyle = '#f5f5f5';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.5;
        const [m1x, m1y] = iso(x + 0.6, y + 4.75);
        const [m2x, m2y] = iso(x + 5.5, y + 4.75);
        ctx.beginPath();
        ctx.moveTo(m1x, m1y);
        ctx.lineTo(m2x, m2y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      box(ctx, x + 0.5, y + 0.6, 4, 1.6, H, st);
      if (d && k === 1) windows(ctx, x + 0.5, y + 0.6, 4, 1.6, H, 1, '#7fb3d5');
      box(ctx, x + 4.8, y + 0.6, 0.5, 0.5, UNIT * 2.6 * k, boxStyle('#e3e6ea'));
      box(ctx, x + 4.7, y + 0.5, 0.7, 0.7, UNIT * 0.5 * k, boxStyle('#7fb3d5'), UNIT * 2.6 * k);
      return;
    }
    case 'levee': {
      box(ctx, x, y + 0.3, 1, 0.4, H, st);
      return;
    }
    default:
      break;
  }

  const inset = def.w === 1 ? 0.18 : 0.1;
  box(ctx, x + inset, y + inset, w - 2 * inset, h - 2 * inset, H, st);
  if (k < 1) return;
  if (d && def.height >= 0.8 && def.id !== 'drain') windows(ctx, x + inset, y + inset, w - 2 * inset, h - 2 * inset, H, Math.max(1, Math.round(def.height * 1.5)), '#6d8fb3');
  // Signature details.
  if (def.id === 'coal' || def.id === 'gas' || def.id === 'incinerator') {
    const n = def.id === 'coal' ? 2 : 1;
    for (let c = 0; c < n; c++) {
      const cx = x + w - 0.75 - c * 0.6;
      box(ctx, cx, y + 0.35, 0.28, 0.28, UNIT * 3.4 * k, boxStyle('#c0392b'));
      box(ctx, cx, y + 0.35, 0.28, 0.28, UNIT * 0.5, boxStyle('#f1f1f1'), UNIT * 2.6 * k);
    }
  }
  if (def.id === 'nuclear' || def.id === 'fusion') {
    cylinder(ctx, x + 1.1, y + 1.1, 22, UNIT * 2.4 * k, def.id === 'fusion' ? '#bfe9ff' : '#cfd5dc', H);
  }
  if (def.id === 'cityhall' && d) {
    const [cx, cy] = iso(x + 1, y + 1);
    ctx.fillStyle = '#c8a24a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - H, 14, 7, 0, Math.PI, 0);
    ctx.arc(cx, cy - H, 12, Math.PI, 0);
    ctx.fill();
  }
  if (def.id === 'bus') {
    box(ctx, x + 0.2, y + 0.3, 0.6, 0.35, UNIT * 0.5 * k, boxStyle('#f2c94c'));
    return;
  }
  if (d && w >= 2) {
    roofIcon(ctx, def, x + w / 2, y + h / 2, H, Math.min(30, 9 + w * 4));
  }
}
