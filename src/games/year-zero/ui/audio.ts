// Procedural sound: a few short synthesized cues, no audio files.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
}

export function isMuted(): boolean {
  return muted;
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slide = 0): void {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, gain: number, delay = 0, lowpass = 900): void {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  click: () => tone(660, 0.06, 'triangle', 0.05),
  select: () => tone(520, 0.08, 'sine', 0.06, 0, 120),
  move: () => tone(300, 0.07, 'triangle', 0.04, 0, -60),
  endTurn: () => {
    tone(392, 0.25, 'sine', 0.06);
    tone(523, 0.35, 'sine', 0.05, 0.08);
  },
  newYear: () => tone(784, 0.3, 'sine', 0.035, 0, -200),
  found: () => {
    tone(392, 0.2, 'triangle', 0.06);
    tone(494, 0.2, 'triangle', 0.06, 0.1);
    tone(587, 0.4, 'triangle', 0.06, 0.2);
  },
  combat: () => {
    noise(0.18, 0.25, 0, 1200);
    tone(140, 0.2, 'sawtooth', 0.04, 0, -60);
  },
  alert: () => {
    tone(440, 0.15, 'square', 0.03);
    tone(330, 0.25, 'square', 0.03, 0.14);
  },
  discovery: () => {
    tone(523, 0.18, 'sine', 0.05);
    tone(659, 0.18, 'sine', 0.05, 0.1);
    tone(784, 0.35, 'sine', 0.05, 0.2);
  },
  war: () => {
    noise(0.5, 0.3, 0, 300);
    tone(110, 0.6, 'sawtooth', 0.05);
  },
  history: () => tone(698, 0.4, 'sine', 0.03, 0, -100),
};
