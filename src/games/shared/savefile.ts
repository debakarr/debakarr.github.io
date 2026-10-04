// Save helpers shared by the games: JSON with typed arrays as base64, and
// gzip compression for browser storage when the browser supports it.

type TA = Uint8Array | Int8Array | Uint16Array | Int16Array | Int32Array | Uint32Array | Float32Array;
const TA_TYPES: Record<string, new (buf: ArrayBuffer) => TA> = {
  Uint8Array, Int8Array, Uint16Array, Int16Array, Int32Array, Uint32Array, Float32Array,
};

export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      const ta = v as TA;
      return { __ta: ta.constructor.name, b64: bytesToB64(new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength)) };
    }
    return v;
  });
}

export function fromJson<T>(json: string): T {
  return JSON.parse(json, (_k, v) => {
    if (v && typeof v === 'object' && typeof v.__ta === 'string' && typeof v.b64 === 'string') {
      const Ctor = TA_TYPES[v.__ta];
      if (!Ctor) throw new Error(`Unknown array type ${v.__ta}`);
      const bytes = b64ToBytes(v.b64);
      return new Ctor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    }
    return v;
  }) as T;
}

export async function gzipB64(text: string): Promise<string | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return bytesToB64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function gunzipB64(b64: string): Promise<string> {
  const stream = new Blob([b64ToBytes(b64) as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

export interface SlotMeta {
  key: string;
  label: string;
  title: string;
  subtitle: string;
  savedAt: number;
}

/** A tiny save-slot store in localStorage, namespaced per game. */
export class SaveStore {
  constructor(private ns: string) {}

  list(): SlotMeta[] {
    try {
      const raw = localStorage.getItem(`${this.ns}:index`);
      return (raw ? (JSON.parse(raw) as SlotMeta[]) : []).sort((a, b) => b.savedAt - a.savedAt);
    } catch {
      return [];
    }
  }

  private writeIndex(list: SlotMeta[]): void {
    localStorage.setItem(`${this.ns}:index`, JSON.stringify(list));
  }

  async save(meta: Omit<SlotMeta, 'savedAt'>, json: string): Promise<void> {
    const packed = await gzipB64(json);
    this.write(meta, packed ? `gz:${packed}` : `js:${json}`);
  }

  saveSync(meta: Omit<SlotMeta, 'savedAt'>, json: string): void {
    this.write(meta, `js:${json}`);
  }

  private write(meta: Omit<SlotMeta, 'savedAt'>, payload: string): void {
    const key = `${this.ns}:save:${meta.key}`;
    try {
      localStorage.setItem(key, payload);
    } catch {
      const oldest = this.list().filter((m) => m.key !== 'auto' && m.key !== meta.key).pop();
      if (oldest) this.remove(oldest.key);
      localStorage.setItem(key, payload);
    }
    this.writeIndex([{ ...meta, savedAt: Date.now() }, ...this.list().filter((m) => m.key !== meta.key)]);
  }

  async load(key: string): Promise<string> {
    const payload = localStorage.getItem(`${this.ns}:save:${key}`);
    if (!payload) throw new Error('That save no longer exists.');
    return payload.startsWith('gz:') ? gunzipB64(payload.slice(3)) : payload.slice(3);
  }

  remove(key: string): void {
    localStorage.removeItem(`${this.ns}:save:${key}`);
    this.writeIndex(this.list().filter((m) => m.key !== key));
  }
}
