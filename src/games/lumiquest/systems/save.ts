// Versioned local saves. The save is validated field by field on load: a
// missing or malformed field falls back to a safe default instead of
// breaking the game, and an unreadable save is kept aside as a backup so a
// bad write never silently destroys progress.

import { ACCESSORIES, FACES, HAIRS, OUTFITS, PRESETS, presetAppearance, type Appearance } from '../data/characters';
import { ITEM_BY_ID } from '../data/items';
import { LOCATION_BY_ID, PRISMS, PLAYER_START } from '../data/world';
import { SPECIES, SPECIES_BY_ID, type SpeciesId } from '../data/species';
import { SAVE_VERSION, newState, type GameState } from './state';

const KEY = 'lumiquest.save.v1';
const BACKUP = 'lumiquest.save.corrupt';

export interface LoadResult {
  state: GameState | null;
  /** Human-readable note when the save needed repairs or could not load. */
  warning?: string;
}

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__lq_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return loadGame().state !== null;
}

export function saveGame(state: GameState): boolean {
  const s = storage();
  if (!s) return false;
  state.savedAt = Date.now();
  state.version = SAVE_VERSION;
  try {
    s.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave(): void {
  const s = storage();
  s?.removeItem(KEY);
}

export function loadGame(): LoadResult {
  const s = storage();
  if (!s) return { state: null };
  const raw = s.getItem(KEY);
  if (!raw) return { state: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    s.setItem(BACKUP, raw);
    s.removeItem(KEY);
    return { state: null, warning: 'Your save could not be read, so it was set aside. Start a new game to continue.' };
  }
  return validate(parsed, (bad) => {
    s.setItem(BACKUP, raw);
    if (bad) s.removeItem(KEY);
  });
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const str = (v: unknown, d: string, max = 40): string => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : d);
const color = (v: unknown, d: string): string => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

function validAppearance(v: unknown): Appearance {
  const base = presetAppearance(isObj(v) && typeof v.preset === 'string' ? v.preset : PRESETS[0].id);
  if (!isObj(v)) return base;
  return {
    name: str(v.name, base.name, 16),
    preset: base.preset,
    skin: color(v.skin, base.skin),
    face: FACES.some((f) => f.id === v.face) ? (v.face as Appearance['face']) : base.face,
    eye: color(v.eye, base.eye),
    hair: HAIRS.some((f) => f.id === v.hair) ? (v.hair as Appearance['hair']) : base.hair,
    hairColor: color(v.hairColor, base.hairColor),
    outfit: OUTFITS.some((f) => f.id === v.outfit) ? (v.outfit as Appearance['outfit']) : base.outfit,
    outfitMain: color(v.outfitMain, base.outfitMain),
    outfitAccent: color(v.outfitAccent, base.outfitAccent),
    accessories: Array.isArray(v.accessories)
      ? (v.accessories.filter((a) => ACCESSORIES.some((x) => x.id === a)) as Appearance['accessories'])
      : base.accessories,
  };
}

/**
 * Builds a valid state from untrusted JSON. Repairs what it can; returns
 * null with a warning when the save belongs to an incompatible version or
 * lacks the essentials (who you are and which companion you chose).
 */
export function validate(raw: unknown, onBad?: (fatal: boolean) => void): LoadResult {
  if (!isObj(raw)) {
    onBad?.(true);
    return { state: null, warning: 'Your save was damaged and has been set aside.' };
  }
  const version = num(raw.version, 0);
  if (version > SAVE_VERSION || version < 1) {
    onBad?.(true);
    return { state: null, warning: `This save comes from an incompatible version (${version}). It was set aside.` };
  }
  const starter = raw.starter as SpeciesId;
  if (!SPECIES_BY_ID[starter]) {
    onBad?.(true);
    return { state: null, warning: 'Your save is missing its starter companion and was set aside.' };
  }
  const appearance = validAppearance(raw.appearance);
  const st = newState(appearance, starter, appearance.name);
  let repaired = false;

  st.createdAt = num(raw.createdAt, Date.now());
  st.savedAt = num(raw.savedAt, Date.now());
  st.playSeconds = num(raw.playSeconds, 0, 0);
  if (isObj(raw.player)) {
    const p = raw.player;
    st.player = {
      x: num(p.x, PLAYER_START.at[0], -170, 170),
      y: num(p.y, 4, -10, 80),
      z: num(p.z, PLAYER_START.at[1], -170, 170),
      yaw: num(p.yaw, 0),
      camera: p.camera === 'first' ? 'first' : 'third',
      pitch: num(p.pitch, -0.18, -1.4, 1.4),
    };
  } else repaired = true;
  st.clock = num(raw.clock, 9, 0);
  if (isObj(raw.weather) && ['clear', 'cloudy', 'rain', 'mist'].includes(raw.weather.kind as string)) {
    st.weather = { kind: raw.weather.kind as GameState['weather']['kind'], until: num(raw.weather.until, st.clock + 4) };
  }
  st.lumens = Math.floor(num(raw.lumens, 20, 0, 999999));
  if (isObj(raw.inventory)) {
    st.inventory = {};
    for (const [k, v] of Object.entries(raw.inventory)) {
      if (!ITEM_BY_ID[k]) {
        repaired = true;
        continue;
      }
      const n = Math.floor(num(v, 0, 0, 9999));
      if (n > 0) st.inventory[k] = n;
    }
    st.inventory.device = 1;
  }
  if (Array.isArray(raw.bonded)) {
    const list = raw.bonded
      .filter(isObj)
      .filter((b) => SPECIES_BY_ID[b.species as SpeciesId] && typeof b.uid === 'string')
      .map((b) => {
        const sp = SPECIES_BY_ID[b.species as SpeciesId];
        const variant = typeof b.variant === 'string' && sp.variants.some((v) => v.id === b.variant) ? b.variant : null;
        return {
          uid: str(b.uid, 'x', 32),
          species: sp.id,
          variant,
          name: str(b.name, sp.name, 16),
          origin: str(b.origin, 'wild', 32),
          bondedDay: num(b.bondedDay, 1, 1),
          friendship: num(b.friendship, 40, 0, 100),
        };
      });
    if (!list.some((b) => b.uid === 'starter')) repaired = true;
    if (list.length > 0) st.bonded = list;
  }
  st.active = typeof raw.active === 'string' && st.bonded.some((b) => b.uid === raw.active) ? raw.active : st.bonded[0]?.uid ?? null;
  st.companionOut = raw.companionOut !== false;
  if (isObj(raw.wild)) {
    for (const [k, v] of Object.entries(raw.wild)) {
      if (!isObj(v)) continue;
      st.wild[k] = {
        trust: num(v.trust, 0, 0, 100),
        observed: v.observed === true,
        bonded: v.bonded === true,
        variant: typeof v.variant === 'string' ? v.variant : null,
        fedAt: num(v.fedAt, -999),
      };
    }
  }
  if (isObj(raw.species)) {
    for (const s of SPECIES) {
      const r = raw.species[s.id];
      if (!isObj(r)) continue;
      st.species[s.id] = { seen: r.seen === true, observed: Math.floor(num(r.observed, 0, 0)), bonded: Math.floor(num(r.bonded, 0, 0)) };
    }
  }
  if (isObj(raw.quests)) {
    for (const [k, v] of Object.entries(raw.quests)) {
      if (!isObj(v)) continue;
      const status = v.status === 'done' || v.status === 'locked' ? v.status : 'active';
      st.quests[k] = { status, stage: Math.floor(num(v.stage, 0, 0, 50)) };
    }
  }
  st.tracked = str(raw.tracked, 'beacon', 24);
  if (isObj(raw.done)) {
    st.done = {};
    for (const [k, v] of Object.entries(raw.done)) if (typeof v === 'number' && Number.isFinite(v)) st.done[k] = v;
  }
  if (Array.isArray(raw.prisms) && raw.prisms.length === PRISMS.length) {
    st.prisms = raw.prisms.map((p) => Math.floor(num(p, 0, 0, 7)));
  }
  if (Array.isArray(raw.discovered)) {
    st.discovered = raw.discovered.filter((d): d is string => typeof d === 'string' && !!LOCATION_BY_ID[d]);
    if (!st.discovered.includes('outpost')) st.discovered.push('outpost');
  }
  if (isObj(raw.flags)) {
    st.flags = {};
    for (const [k, v] of Object.entries(raw.flags)) if (typeof v === 'number' && Number.isFinite(v)) st.flags[k] = v;
  }
  if (repaired) onBad?.(false);
  return { state: st, warning: repaired ? 'Some parts of your save were damaged and have been repaired.' : undefined };
}

// ---------------------------------------------------------------------------
// Settings live apart from the save so they survive New Game and Reset.

export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'jump' | 'crouch' | 'interact' | 'observe'
  | 'view' | 'companion' | 'ability' | 'map' | 'collection' | 'journal' | 'inventory';

export const DEFAULT_BINDINGS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', jump: 'Space',
  crouch: 'ControlLeft', interact: 'KeyE', observe: 'KeyF', view: 'KeyV', companion: 'KeyR', ability: 'KeyQ',
  map: 'KeyM', collection: 'Tab', journal: 'KeyJ', inventory: 'KeyI',
};

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Move forward', back: 'Move back', left: 'Move left', right: 'Move right', sprint: 'Sprint', jump: 'Jump / glide',
  crouch: 'Crouch / sneak / dive', interact: 'Interact', observe: 'Observe', view: 'Switch camera', companion: 'Call / dismiss companion',
  ability: 'Companion ability', map: 'World map', collection: 'Creature collection', journal: 'Quest journal', inventory: 'Inventory',
};

export interface Settings {
  quality: Quality;
  shadows: boolean;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  master: number;
  music: number;
  sfx: number;
  ambient: number;
  /** Real minutes per in-game day; 0 freezes time. */
  dayMinutes: number;
  showFps: boolean;
  bindings: Record<Action, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  shadows: true,
  sensitivity: 1,
  invertY: false,
  fov: 62,
  master: 0.8,
  music: 0.5,
  sfx: 0.8,
  ambient: 0.7,
  dayMinutes: 24,
  showFps: false,
  bindings: { ...DEFAULT_BINDINGS },
};

const SETTINGS_KEY = 'lumiquest.settings.v1';

export function loadSettings(): Settings {
  const s = storage();
  const out: Settings = structuredClone(DEFAULT_SETTINGS);
  if (!s) return out;
  try {
    const raw = JSON.parse(s.getItem(SETTINGS_KEY) ?? 'null') as unknown;
    if (!isObj(raw)) return out;
    if (['auto', 'low', 'medium', 'high'].includes(raw.quality as string)) out.quality = raw.quality as Quality;
    out.shadows = raw.shadows !== false;
    out.sensitivity = num(raw.sensitivity, 1, 0.2, 3);
    out.invertY = raw.invertY === true;
    out.fov = num(raw.fov, 62, 50, 90);
    out.master = num(raw.master, 0.8, 0, 1);
    out.music = num(raw.music, 0.5, 0, 1);
    out.sfx = num(raw.sfx, 0.8, 0, 1);
    out.ambient = num(raw.ambient, 0.7, 0, 1);
    out.dayMinutes = num(raw.dayMinutes, 24, 0, 120);
    out.showFps = raw.showFps === true;
    if (isObj(raw.bindings)) {
      for (const k of Object.keys(DEFAULT_BINDINGS) as Action[]) {
        const v = raw.bindings[k];
        if (typeof v === 'string' && v.length < 24) out.bindings[k] = v;
      }
    }
  } catch {
    /* defaults */
  }
  return out;
}

export function saveSettings(settings: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage full or blocked */
  }
}

export function speciesExists(id: string): id is SpeciesId {
  return !!SPECIES_BY_ID[id as SpeciesId];
}
