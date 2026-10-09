// Synthesized sound: UI and gameplay effects, an ambient bed (wind, birds by
// day, crickets by night, the river, the cave hum) and a gentle generative
// score in a pentatonic key. No audio files, so nothing to license or load.

type Bus = 'sfx' | 'music' | 'ambient';

const PENTA = [0, 2, 4, 7, 9];

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses = {} as Record<Bus, GainNode>;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private riverGain!: GainNode;
  private caveGain!: GainNode;
  private rainGain!: GainNode;
  private musicTimer = 0;
  private birdTimer = 0;
  private cricketTimer = 0;
  private chord = 0;
  volumes = { master: 0.8, music: 0.5, sfx: 0.8, ambient: 0.7 };
  private started = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    this.master.connect(comp).connect(ctx.destination);
    for (const b of ['sfx', 'music', 'ambient'] as Bus[]) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
    }
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.2965;
      d[i] = (b0 + b1 + w * 0.18) * 0.35;
    }
    const loop = (freq: number, q: number, type: BiquadFilterType) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.buses.ambient);
      src.start();
      return g;
    };
    this.windGain = loop(420, 0.4, 'lowpass');
    this.riverGain = loop(900, 0.6, 'bandpass');
    this.rainGain = loop(2600, 0.3, 'highpass');
    // cave: a low drone
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 55;
    this.caveGain = ctx.createGain();
    this.caveGain.gain.value = 0;
    o.connect(this.caveGain).connect(this.buses.ambient);
    o.start();
    this.applyVolumes();
    this.started = true;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.buses.music.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.05);
    this.buses.ambient.gain.setTargetAtTime(this.volumes.ambient, t, 0.05);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; bus?: Bus; slide?: number; attack?: number } = {}): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.buses[opts.bus ?? 'sfx']);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, freq: number, opts: { gain?: number; q?: number; type?: BiquadFilterType; sweep?: number; delay?: number } = {}): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * opts.sweep), t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.buses.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private note(i: number, octave = 0): number {
    const base = 261.63; // C4
    const step = PENTA[((i % 5) + 5) % 5] + 12 * (Math.floor(i / 5) + octave);
    return base * Math.pow(2, step / 12);
  }

  // --- effects --------------------------------------------------------------

  click(): void {
    this.tone(880, 0.06, { type: 'triangle', gain: 0.08 });
  }
  hover(): void {
    this.tone(1320, 0.04, { type: 'sine', gain: 0.03 });
  }
  open(): void {
    this.tone(523, 0.12, { type: 'triangle', gain: 0.08 });
    this.tone(784, 0.16, { type: 'triangle', gain: 0.07, delay: 0.05 });
  }
  close(): void {
    this.tone(784, 0.1, { type: 'triangle', gain: 0.07 });
    this.tone(523, 0.14, { type: 'triangle', gain: 0.06, delay: 0.05 });
  }
  pickup(): void {
    [0, 2, 4].forEach((n, k) => this.tone(this.note(n, 1), 0.25, { type: 'triangle', gain: 0.11, delay: k * 0.06 }));
  }
  coin(): void {
    this.tone(1568, 0.08, { type: 'square', gain: 0.04 });
    this.tone(2093, 0.2, { type: 'square', gain: 0.04, delay: 0.07 });
  }
  trust(level: number): void {
    this.tone(this.note(Math.round(level * 6), 1), 0.4, { type: 'sine', gain: 0.12 });
    this.tone(this.note(Math.round(level * 6) + 2, 1), 0.5, { type: 'sine', gain: 0.08, delay: 0.08 });
  }
  alarm(): void {
    this.tone(660, 0.12, { type: 'square', gain: 0.05 });
    this.tone(500, 0.16, { type: 'square', gain: 0.05, delay: 0.1 });
  }
  fail(): void {
    this.tone(392, 0.25, { type: 'triangle', gain: 0.1, slide: 0.7 });
    this.tone(311, 0.4, { type: 'triangle', gain: 0.08, delay: 0.18, slide: 0.7 });
  }
  pulse(good: boolean): void {
    this.tone(good ? 988 : 220, good ? 0.18 : 0.25, { type: good ? 'sine' : 'sawtooth', gain: good ? 0.12 : 0.05 });
  }
  heartbeat(): void {
    this.tone(70, 0.12, { type: 'sine', gain: 0.25 });
    this.tone(60, 0.14, { type: 'sine', gain: 0.18, delay: 0.16 });
  }
  bond(): void {
    [0, 2, 4, 5, 7, 9].forEach((n, k) => this.tone(this.note(n, 1), 0.7, { type: 'triangle', gain: 0.1, delay: k * 0.09 }));
    this.tone(this.note(0, 0), 1.6, { type: 'sine', gain: 0.12, delay: 0.5 });
  }
  quest(): void {
    [0, 4, 7, 12].forEach((s, k) => this.tone(392 * Math.pow(2, s / 12), 0.6, { type: 'triangle', gain: 0.1, delay: k * 0.11 }));
  }
  step(surface: string): void {
    const f = surface === 'path' || surface === 'plaza' ? 900 : surface === 'stone' || surface === 'rock' || surface === 'cave' ? 1600 : surface === 'sand' ? 600 : surface === 'water' ? 400 : 1200;
    this.burst(0.07, f * (0.85 + Math.random() * 0.3), { gain: surface === 'water' ? 0.12 : 0.06, q: 1.2 });
  }
  jump(): void {
    this.tone(330, 0.14, { type: 'sine', gain: 0.06, slide: 1.6 });
  }
  land(): void {
    this.burst(0.12, 300, { gain: 0.12, q: 0.8, type: 'lowpass' });
  }
  splash(): void {
    this.burst(0.5, 1400, { gain: 0.22, q: 0.5, sweep: 0.3 });
  }
  fire(): void {
    this.burst(0.7, 400, { gain: 0.3, q: 0.6, type: 'lowpass', sweep: 4 });
    this.burst(0.5, 2600, { gain: 0.1, q: 0.8, delay: 0.1 });
  }
  quake(): void {
    this.tone(60, 0.7, { type: 'sine', gain: 0.4, slide: 0.6 });
    this.burst(0.6, 220, { gain: 0.35, q: 0.6, type: 'lowpass' });
    this.burst(0.3, 1800, { gain: 0.12, q: 1, delay: 0.25 });
  }
  water(): void {
    for (let k = 0; k < 6; k++) this.tone(500 + Math.random() * 600, 0.12, { type: 'sine', gain: 0.07, delay: k * 0.07, slide: 1.8 });
    this.burst(0.8, 1200, { gain: 0.15, q: 0.5 });
  }
  glow(): void {
    [7, 9, 12, 14].forEach((n, k) => this.tone(this.note(n, 1), 0.6, { type: 'sine', gain: 0.07, delay: k * 0.07 }));
  }
  wind(): void {
    this.burst(0.9, 800, { gain: 0.18, q: 0.4, sweep: 2.5 });
  }
  door(): void {
    this.tone(80, 1.1, { type: 'sawtooth', gain: 0.05, slide: 0.8 });
    this.burst(1.0, 200, { gain: 0.2, q: 0.6, type: 'lowpass' });
  }
  chest(): void {
    this.burst(0.25, 500, { gain: 0.12, q: 2 });
    [4, 7, 9].forEach((n, k) => this.tone(this.note(n, 1), 0.4, { type: 'triangle', gain: 0.09, delay: 0.2 + k * 0.07 }));
  }
  beacon(): void {
    [0, 4, 7, 11, 14].forEach((s, k) => this.tone(196 * Math.pow(2, s / 12), 3.5, { type: 'sine', gain: 0.12, delay: k * 0.18, attack: 0.4 }));
    this.tone(98, 4, { type: 'triangle', gain: 0.12, attack: 0.6 });
  }
  page(): void {
    this.burst(0.18, 3000, { gain: 0.06, q: 0.7 });
  }

  // --- ambience & music -----------------------------------------------------

  /**
   * Called every frame with the environment so the bed follows you: wind
   * everywhere, river near water, rain in rain, the cave drone in the cave.
   */
  ambience(dt: number, env: { night: number; river: number; cave: number; rain: number; underwater: boolean; height: number; paused: boolean }): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    const quiet = env.paused ? 0.35 : 1;
    this.windGain.gain.setTargetAtTime((0.05 + Math.min(0.12, env.height / 300)) * (1 - env.cave * 0.8) * quiet, t, 0.5);
    this.riverGain.gain.setTargetAtTime(env.river * 0.25 * quiet * (env.underwater ? 0.4 : 1), t, 0.3);
    this.rainGain.gain.setTargetAtTime(env.rain * 0.16 * (1 - env.cave) * quiet, t, 0.5);
    this.caveGain.gain.setTargetAtTime(env.cave * 0.07 * quiet, t, 0.8);
    if (env.paused) return;
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.5 + Math.random() * 4;
      if (env.night < 0.4 && env.cave < 0.3 && env.rain < 0.5) {
        const f = 2200 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) this.tone(f * (1 + (k % 2) * 0.12), 0.08, { type: 'sine', gain: 0.025, delay: k * 0.1, slide: 1.25, bus: 'ambient' });
      }
    }
    this.cricketTimer -= dt;
    if (this.cricketTimer <= 0) {
      this.cricketTimer = 0.6 + Math.random() * 1.2;
      if (env.night > 0.5 && env.cave < 0.3) for (let k = 0; k < 3; k++) this.tone(4200, 0.03, { type: 'square', gain: 0.008, delay: k * 0.05, bus: 'ambient' });
    }
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 2.4;
      this.chord = (this.chord + 1 + Math.floor(Math.random() * 2)) % 5;
      const roots = env.cave > 0.5 ? [0, 3, 1, 4, 2] : env.night > 0.5 ? [0, 2, 4, 1, 3] : [0, 3, 4, 1, 2];
      const r = roots[this.chord];
      // soft pad
      for (const s of [0, 2, 4]) this.tone(this.note(r + s, -1), 2.6, { type: 'sine', gain: 0.035, attack: 0.6, bus: 'music' });
      // a few plucked notes
      const count = env.night > 0.5 ? 2 : 3 + Math.floor(Math.random() * 2);
      for (let k = 0; k < count; k++) {
        if (Math.random() < 0.3) continue;
        this.tone(this.note(r + Math.floor(Math.random() * 7), env.night > 0.5 ? 0 : 1), 0.7, { type: 'triangle', gain: 0.03, delay: k * 0.55 + Math.random() * 0.1, bus: 'music' });
      }
    }
  }
}
