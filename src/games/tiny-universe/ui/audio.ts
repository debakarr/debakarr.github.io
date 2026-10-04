// Tiny Universe's sound (doc §58): meditative, synthesized, no assets.
//
// A deep ambient hum under everything; subtle pulses as stars live their
// lives; a soft rhythm when civilizations exist; a wide, quiet noise floor
// that grows with the galaxy; and a short signature sound for the moments
// worth hearing about. Everything is deliberately low volume.

type Scene = { hum: number; pulse: number; rhythm: number; space: number };

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private spaceGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private nextPulse = 0;
  private nextRhythm = 0;
  private scene: Scene = { hum: 0.4, pulse: 0, rhythm: 0, space: 0 };
  private target = 0;
  enabled = true;

  /** Call from a user gesture (browsers refuse to start audio otherwise). */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? 0.16 : 0;
      this.master.connect(ctx.destination);

      // The hum: two voices a hair apart, breathing through a low filter.
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 240;
      this.humGain = ctx.createGain();
      this.humGain.gain.value = 0;
      for (const [freq, gain] of [
        [48, 0.5],
        [72.5, 0.28],
        [96.4, 0.14],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = gain;
        osc.connect(g).connect(this.filter);
        osc.start();
      }
      // A slow breath on the filter, so the hum is never quite still.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.035;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 60;
      lfo.connect(lfoGain).connect(this.filter.frequency);
      lfo.start();
      this.filter.connect(this.humGain).connect(this.master);

      // The space: filtered noise, the sound of a very large, very quiet place.
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = buffer;
      noiseSrc.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 420;
      this.spaceGain = ctx.createGain();
      this.spaceGain.gain.value = 0;
      noiseSrc.connect(noiseFilter).connect(this.spaceGain).connect(this.master);
      noiseSrc.start();

      this.applyScene(0);
    } catch {
      this.ctx = null;
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.enabled) void this.ctx.resume();
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!this.ctx || !this.master) return;
    if (on) {
      void this.ctx.resume();
      this.master.gain.setTargetAtTime(0.16, this.ctx.currentTime, 0.6);
    } else {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    }
  }

  /** How loud the layers are, 0..1. Smoothed over a couple of seconds. */
  setScene(scene: Scene): void {
    this.scene = scene;
  }

  private applyScene(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.humGain || !this.spaceGain || !this.filter) return;
    const k = 1 - Math.exp(-dt / 1.6);
    this.target = this.target * (1 - k) + 1 * k;
    const t = ctx.currentTime;
    this.humGain.gain.setTargetAtTime(0.5 * this.scene.hum, t, 1.2);
    this.spaceGain.gain.setTargetAtTime(0.05 * this.scene.space, t, 1.8);
    this.filter.frequency.setTargetAtTime(200 + 320 * this.scene.space, t, 1.5);
  }

  /** Call every frame: schedules the slow pulses and rhythm. */
  tick(now: number, dt: number): void {
    this.applyScene(dt);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const { pulse, rhythm } = this.scene;
    if (pulse > 0.02 && now > this.nextPulse) {
      this.nextPulse = now + 5200 - 3400 * pulse + Math.random() * 2600;
      this.blip(120 + Math.random() * 320, 0.028 * pulse, 0.9, 'sine');
    }
    if (rhythm > 0.02 && now > this.nextRhythm) {
      this.nextRhythm = now + 2600 - 1400 * rhythm + Math.random() * 1200;
      this.blip(64 + Math.random() * 24, 0.05 * rhythm, 0.5, 'triangle');
    }
  }

  private blip(freq: number, gain: number, decay: number, type: OscillatorType): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + decay + 0.1);
  }

  /** The signature sound: a short, soft bell (doc §58 "important discoveries"). */
  ping(kind: 'discovery' | 'chronicle' | 'era'): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const notes =
      kind === 'discovery'
        ? ([329.63, 440, 523.25] as const)
        : kind === 'era'
          ? ([261.63, 329.63] as const)
          : ([220] as const);
    notes.forEach((freq, i) => {
      const at = ctx.currentTime + i * 0.16;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.085 : 0.055, at + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.7);
      osc.connect(g).connect(this.master!);
      osc.start(at);
      osc.stop(at + 1.9);
    });
  }
}
