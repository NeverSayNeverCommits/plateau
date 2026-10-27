/**
 * Background music: a little original French café waltz (a "valse musette"),
 * played live with WebAudio. No sound files needed.
 *
 * - Accordion melody: three slightly out-of-tune reeds, which gives the
 *   wobbly "musette" sound.
 * - Waltz backing: bass note on beat 1, short chords on beats 2 and 3.
 * - A very soft shaker to keep time.
 */

type Note = [midi: number, beats: number];

const BEAT = 0.4; // seconds per beat (150 bpm)
const BAR = BEAT * 3; // 3/4 time

/** Melody, one list of notes per bar. MIDI note numbers (81 = A5). */
const A1: Note[][] = [
  [[76, 1], [81, 1], [83, 1]],
  [[84, 2], [83, 1]],
  [[86, 2], [84, 1]],
  [[81, 2], [82, 0.5], [81, 0.5]],
  [[80, 1], [81, 1], [83, 1]],
  [[86, 2], [83, 1]],
  [[84, 1], [83, 1], [81, 1]],
  [[81, 2], [76, 1]],
];

const A2: Note[][] = [
  [[81, 1], [83, 1], [84, 1]],
  [[88, 2], [84, 1]],
  [[89, 2], [86, 1]],
  [[81, 2], [83, 0.5], [81, 0.5]],
  [[83, 1], [86, 1], [89, 1]],
  [[88, 2], [84, 1]],
  [[83, 1], [80, 1], [83, 1]],
  [[81, 3]],
];

const B: Note[][] = [
  [[84, 1], [81, 1], [77, 1]],
  [[81, 2], [79, 1]],
  [[79, 0.5], [81, 0.5], [79, 1], [76, 1]],
  [[76, 1], [77, 0.5], [78, 0.5], [79, 1]],
  [[77, 1], [79, 1], [83, 1]],
  [[86, 2], [83, 1]],
  [[84, 1], [88, 1], [91, 1]],
  [[83, 2], [80, 1]],
];

const MELODY = [...A1, ...A2, ...B, ...A2];

const CHORDS_A1 = ["Am", "Am", "Dm", "Dm", "E7", "E7", "Am", "Am"];
const CHORDS_A2 = ["Am", "Am", "Dm", "Dm", "G7", "C", "E7", "Am"];
const CHORDS_B = ["F", "F", "C", "C", "G7", "G7", "C", "E7"];
const CHORDS = [...CHORDS_A1, ...CHORDS_A2, ...CHORDS_B, ...CHORDS_A2];

/** For each chord: two bass notes (alternated bar by bar) and the chord notes. */
const CHORD_NOTES: Record<string, { bass: [number, number]; notes: number[] }> = {
  Am: { bass: [45, 40], notes: [57, 60, 64] },
  Dm: { bass: [50, 45], notes: [57, 62, 65] },
  E7: { bass: [40, 47], notes: [56, 59, 62] },
  G7: { bass: [43, 38], notes: [55, 59, 65] },
  C: { bass: [48, 43], notes: [55, 60, 64] },
  F: { bass: [41, 48], notes: [57, 60, 65] },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const jitter = (amount: number) => (Math.random() - 0.5) * 2 * amount;

export class Music {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private bar = 0;
  private nextBarTime = 0;
  private playing = false;
  private readonly volume = 0.8;

  attach(ctx: AudioContext): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(ctx.destination);

    // A short burst of white noise for the shaker.
    const length = Math.floor(ctx.sampleRate * 0.06);
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  start(): void {
    if (!this.ctx || !this.bus || this.playing) return;
    this.playing = true;
    const now = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(this.volume, now + 1.5);
    this.nextBarTime = now + 0.1;
    this.timer = window.setInterval(() => this.tick(), 50);
    this.tick();
  }

  stop(): void {
    if (!this.ctx || !this.bus || !this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const now = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(0, now + 0.4);
  }

  /** Turn the music down for a moment (used when the win jingle plays). */
  duck(seconds: number): void {
    if (!this.ctx || !this.bus || !this.playing) return;
    const now = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(this.volume * 0.25, now + 0.15);
    this.bus.gain.setValueAtTime(this.volume * 0.25, now + seconds);
    this.bus.gain.linearRampToValueAtTime(this.volume, now + seconds + 1.2);
  }

  /** Schedule notes a little ahead of time so playback stays smooth. */
  private tick(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // After the tab was hidden we may be behind: skip ahead instead of rushing.
    if (this.nextBarTime < now - 0.05) this.nextBarTime = now + 0.05;
    while (this.nextBarTime < now + 0.3) {
      this.scheduleBar(this.bar, this.nextBarTime);
      this.nextBarTime += BAR;
      this.bar = (this.bar + 1) % MELODY.length;
    }
  }

  private scheduleBar(index: number, t0: number): void {
    // Melody
    let beat = 0;
    for (const [midi, beats] of MELODY[index]) {
      const accent = beat === 0 ? 1 : 0.85;
      this.accordion(midi, t0 + beat * BEAT + jitter(0.008), beats * BEAT - 0.04, 0.05 * accent * (1 + jitter(0.1)));
      beat += beats;
    }

    // Oom-pah-pah
    const chord = CHORD_NOTES[CHORDS[index]];
    this.bass(chord.bass[index % 2], t0);
    for (const b of [1, 2]) {
      for (const n of chord.notes) this.chordStab(n, t0 + b * BEAT + jitter(0.005));
    }
    for (const b of [0, 1, 2]) this.shaker(t0 + b * BEAT, b === 0 ? 0.012 : 0.02);
  }

  private accordion(midi: number, t: number, dur: number, vel: number): void {
    const ctx = this.ctx!;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.03);
    env.gain.linearRampToValueAtTime(vel * 0.8, t + 0.15);
    env.gain.setValueAtTime(vel * 0.8, t + dur);
    env.gain.linearRampToValueAtTime(0, t + dur + 0.07);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2600;
    filter.Q.value = 0.7;
    env.connect(filter).connect(this.bus!);

    // Three reeds: in tune, a bit sharp, a bit flat. The beating between them is the musette sound.
    const f = mtof(midi);
    for (const [type, detune, level, mult] of [
      ["sawtooth", 0, 0.5, 1],
      ["sawtooth", 13, 0.5, 1],
      ["sawtooth", -13, 0.5, 1],
      ["square", 0, 0.25, 0.5],
    ] as [OscillatorType, number, number, number][]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f * mult;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(env);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
  }

  private bass(midi: number, t: number): void {
    const ctx = this.ctx!;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.2, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    env.connect(this.bus!);
    for (const type of ["triangle", "sine"] as OscillatorType[]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = mtof(midi);
      osc.connect(env);
      osc.start(t);
      osc.stop(t + 0.42);
    }
  }

  private chordStab(midi: number, t: number): void {
    const ctx = this.ctx!;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.022, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1500;
    env.connect(filter).connect(this.bus!);
    for (const detune of [-8, 8]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = mtof(midi);
      osc.detune.value = detune;
      osc.connect(env);
      osc.start(t);
      osc.stop(t + 0.24);
    }
  }

  private shaker(t: number, vel: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(vel, t);
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
    src.connect(filter).connect(env).connect(this.bus!);
    src.start(t);
  }
}
