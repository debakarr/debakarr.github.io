import { Game } from './game';
import { SAVE_VERSION } from './newgame';
import type { GameState } from './state';

// Saves are the full state as JSON. Typed arrays are stored as base64. In
// browser storage the JSON is gzip-compressed when the browser supports it.

type TA = Uint8Array | Int8Array | Int16Array | Int32Array | Uint32Array;
const TA_TYPES: Record<string, new (buf: ArrayBuffer) => TA> = {
  Uint8Array, Int8Array, Int16Array, Int32Array, Uint32Array,
};

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function serialize(g: Game): string {
  g.syncRng();
  return JSON.stringify(g.s, (_k, v) => {
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      const ta = v as TA;
      return { __ta: ta.constructor.name, b64: bytesToB64(new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength)) };
    }
    return v;
  });
}

export function deserialize(json: string): Game {
  const state = JSON.parse(json, (_k, v) => {
    if (v && typeof v === 'object' && typeof v.__ta === 'string' && typeof v.b64 === 'string') {
      const Ctor = TA_TYPES[v.__ta];
      if (!Ctor) throw new Error(`Unknown array type ${v.__ta}`);
      const bytes = b64ToBytes(v.b64);
      return new Ctor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    }
    return v;
  }) as GameState;
  validate(state);
  return new Game(state);
}

function validate(s: GameState): void {
  if (!s || typeof s !== 'object') throw new Error('Not a Year Zero save.');
  if (s.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${s.version}.`);
  if (!s.map || !(s.map.terrain instanceof Uint8Array)) throw new Error('Save is missing the world map.');
  if (!Array.isArray(s.civs) || !s.civs.length) throw new Error('Save has no civilizations.');
  const n = s.map.w * s.map.h;
  if (s.map.terrain.length !== n) throw new Error('Save map is corrupted.');
  for (const c of s.civs) {
    if (!(c.explored instanceof Uint8Array) || c.explored.length !== n) throw new Error('Save civilization data is corrupted.');
  }
}

// --- Compression for browser storage ------------------------------------------------------

async function gzip(text: string): Promise<string | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return bytesToB64(buf);
}

async function gunzip(b64: string): Promise<string> {
  const bytes = b64ToBytes(b64);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

export interface SaveMeta {
  key: string;
  label: string;
  civ: string;
  color: string;
  year: number;
  era: string;
  savedAt: number;
  seed: string;
}

const INDEX_KEY = 'yearzero:index';

export function listSaves(): SaveMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as SaveMeta[]) : [];
    return list.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

function writeIndex(list: SaveMeta[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

export async function saveToStorage(g: Game, key: string, label: string): Promise<void> {
  const json = serialize(g);
  const packed = await gzip(json);
  writeSave(g, key, label, packed ? `gz:${packed}` : `js:${json}`);
}

/** Synchronous variant for page unload, when async compression can't finish. */
export function saveToStorageSync(g: Game, key: string, label: string): void {
  writeSave(g, key, label, `js:${serialize(g)}`);
}

function writeSave(g: Game, key: string, label: string, payload: string): void {
  const storageKey = `yearzero:save:${key}`;
  try {
    localStorage.setItem(storageKey, payload);
  } catch {
    // Storage full: drop the oldest manual saves and retry once.
    const list = listSaves().filter((m) => m.key !== 'auto' && m.key !== key);
    const oldest = list[list.length - 1];
    if (oldest) {
      localStorage.removeItem(`yearzero:save:${oldest.key}`);
      writeIndex(listSaves().filter((m) => m.key !== oldest.key));
    }
    localStorage.setItem(storageKey, payload);
  }
  const p = g.player;
  const meta: SaveMeta = {
    key,
    label,
    civ: p.name,
    color: p.color,
    year: g.s.turn,
    era: p.eraPath[p.eraPath.length - 1]?.name ?? 'Tribal Age',
    savedAt: Date.now(),
    seed: g.s.settings.seed,
  };
  writeIndex([meta, ...listSaves().filter((m) => m.key !== key)]);
}

export async function loadFromStorage(key: string): Promise<Game> {
  const payload = localStorage.getItem(`yearzero:save:${key}`);
  if (!payload) throw new Error('That save no longer exists.');
  const json = payload.startsWith('gz:') ? await gunzip(payload.slice(3)) : payload.slice(3);
  return deserialize(json);
}

export function deleteSave(key: string): void {
  localStorage.removeItem(`yearzero:save:${key}`);
  writeIndex(listSaves().filter((m) => m.key !== key));
}

export function exportFileName(g: Game): string {
  const name = g.player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `year-zero-${name}-year-${g.s.turn}.json`;
}
