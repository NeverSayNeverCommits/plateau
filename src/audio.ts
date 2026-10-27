/**
 * Tiny sound effects made with WebAudio, so there are no sound files to load.
 * The audio system can only start after the player has touched the page,
 * so `unlock()` is called on the first pointer press.
 */

import { Music } from "./music.ts";

const MUTE_KEY = "plateau-muted";
const MUSIC_KEY = "plateau-music";

/** A major pentatonic scale over two octaves: always sounds pleasant. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPlayed = new Map<string, number>();
  private readonly music = new Music();
  muted = readFlag(MUTE_KEY, false);
  musicOn = readFlag(MUSIC_KEY, true);

  /** Start audio. Browsers only allow this after the player has clicked or tapped. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && !document.hidden) void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.music.attach(this.ctx);
      if (this.musicOn) this.music.start();

      // Go quiet while the tab is hidden.
      document.addEventListener("visibilitychange", () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else void this.ctx.resume();
      });
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeFlag(MUTE_KEY, muted);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    writeFlag(MUSIC_KEY, on);
    if (on) this.music.start();
    else this.music.stop();
  }

  /** Stops the same sound from being played many times in a burst. */
  private allowed(key: string, gapMs: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < gapMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private tone(opts: {
    freq: number;
    endFreq?: number;
    type?: OscillatorType;
    duration: number;
    volume: number;
    delay?: number;
    attack?: number;
  }): void {
    if (this.muted || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, t0 + opts.duration);
    const attack = opts.attack ?? 0.005;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(opts.volume, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + opts.duration + 0.05);
  }

  private note(step: number): number {
    const semis = SCALE[Math.max(0, Math.min(SCALE.length - 1, step))];
    return 523.25 * Math.pow(2, semis / 12); // starting at C5
  }

  pickUp(): void {
    this.tone({ freq: 520, endFreq: 760, duration: 0.07, volume: 0.12, type: "triangle" });
  }

  drop(): void {
    this.tone({ freq: 240, endFreq: 110, duration: 0.12, volume: 0.25 });
  }

  /** A bright "pop + ding". `progress` (0..1) is how much of the level is green: the note climbs with it. */
  untangled(progress: number, delay = 0): void {
    if (!this.allowed("green", 45)) return;
    const f = this.note(Math.round(progress * (SCALE.length - 1)));
    this.tone({ freq: 900, endFreq: 300, duration: 0.05, volume: 0.15, delay });
    this.tone({ freq: f, duration: 0.35, volume: 0.22, type: "triangle", delay });
    this.tone({ freq: f * 2, duration: 0.2, volume: 0.06, delay });
  }

  /** A soft, sad little "bloop" when a dot gets tangled again. */
  tangled(): void {
    if (!this.allowed("tangled", 120)) return;
    this.tone({ freq: 330, endFreq: 180, duration: 0.14, volume: 0.08, type: "sine" });
  }

  win(): void {
    this.music.duck(2);
    const notes = [0, 2, 4, 5, 7];
    notes.forEach((step, i) => {
      const f = this.note(step);
      this.tone({ freq: f, duration: 0.4, volume: 0.18, type: "triangle", delay: i * 0.09 });
      this.tone({ freq: f * 2, duration: 0.25, volume: 0.05, delay: i * 0.09 });
    });
    this.tone({ freq: this.note(7), duration: 0.9, volume: 0.12, type: "sine", delay: 0.5 });
    this.tone({ freq: this.note(9), duration: 0.9, volume: 0.1, type: "sine", delay: 0.5 });
  }

  click(): void {
    this.tone({ freq: 700, endFreq: 500, duration: 0.05, volume: 0.1, type: "triangle" });
  }
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Storage may be blocked. The setting just won't be remembered.
  }
}

export const sound = new Sound();

/** A short buzz on phones that support it (Android does). */
export function buzz(pattern: number | number[]): void {
  if (sound.muted) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported
  }
}
