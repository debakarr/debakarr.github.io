// Packs a folder of RGBA PNG sprites into one atlas PNG plus a JSON map of
// rectangles. Dependency-free: uses Node's built-in zlib for PNG decode/encode.
//
// Usage:
//   node scripts/sprite-atlas.mjs src/games/year-zero/art/kenney src/games/year-zero/art/sprites.png src/games/year-zero/art/sprites.json

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import zlib from 'node:zlib';

const [, , dir, outPng, outJson, widthArg] = process.argv;
if (!dir || !outPng || !outJson) {
  console.error('usage: node scripts/sprite-atlas.mjs <dir> <out.png> <out.json> [width]');
  process.exit(1);
}
const ATLAS_W = Number(widthArg ?? 1024);
const PAD = 2;

function decodePng(buf) {
  const sig = buf.subarray(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') throw new Error('not a PNG');
  let pos = 8;
  let w = 0;
  let h = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      const depth = data[8];
      const color = data[9];
      const interlace = data[12];
      if (depth !== 8 || color !== 6 || interlace !== 0) throw new Error('only 8-bit RGBA non-interlaced PNGs are supported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = new Uint8Array(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[p++];
      const a = x >= 4 ? out[row + x - 4] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = y > 0 && x >= 4 ? out[prev + x - 4] : 0;
      let r;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
      out[row + x] = r & 255;
    }
  }
  return { w, h, data: out };
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, data) {
  const stride = w * 4;
  // "Up" filter: cheap and compresses tiled sprite art well.
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 2;
    for (let x = 0; x < stride; x++) {
      const v = data[y * stride + x];
      const up = y > 0 ? data[(y - 1) * stride + x] : 0;
      raw[y * (stride + 1) + 1 + x] = (v - up) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sprites = readdirSync(dir)
  .filter((f) => f.endsWith('.png'))
  .map((f) => ({ name: basename(f, '.png'), ...decodePng(readFileSync(join(dir, f))) }))
  .sort((a, b) => b.h - a.h || b.w - a.w);

// Shelf packing.
let x = 0;
let y = 0;
let shelf = 0;
const rects = {};
for (const s of sprites) {
  if (x + s.w + PAD > ATLAS_W) {
    x = 0;
    y += shelf + PAD;
    shelf = 0;
  }
  rects[s.name] = [x, y, s.w, s.h];
  x += s.w + PAD;
  shelf = Math.max(shelf, s.h);
}
const H = y + shelf;
const atlas = new Uint8Array(ATLAS_W * H * 4);
for (const s of sprites) {
  const [ax, ay] = rects[s.name];
  for (let row = 0; row < s.h; row++) {
    atlas.set(s.data.subarray(row * s.w * 4, (row + 1) * s.w * 4), ((ay + row) * ATLAS_W + ax) * 4);
  }
}
const png = encodePng(ATLAS_W, H, atlas);
writeFileSync(outPng, png);
const sorted = Object.fromEntries(Object.keys(rects).sort().map((k) => [k, rects[k]]));
writeFileSync(outJson, `${JSON.stringify(sorted, null, 0).replace(/\],"/g, '],\n"').replace(/^\{/, '{\n').replace(/\}$/, '\n}')}\n`);
console.log(`${sprites.length} sprites -> ${ATLAS_W}x${H} atlas, ${(png.length / 1024).toFixed(0)} KB`);
