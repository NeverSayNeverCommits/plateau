/**
 * The big finish after the last level: jam pours down from the top of the
 * screen, drips stretch and drop into a jam pool, splats hit the screen,
 * fireworks go off, and a jam jar drops in saying "Congrats Jam!".
 * Tap anywhere to throw more jam.
 *
 * The jam is drawn on its own canvas. The jar card and its text are HTML
 * (see #finale in index.html and the "Finale" part of style.css).
 */

import { buzz, sound } from "./audio.ts";
import { Particles, Spring } from "./fx.ts";
import { SPRINKLES } from "./theme.ts";

const JAM = "#c8143f";
const JAM_DARK = "#86092a";
const SEED = "rgba(255, 214, 130, 0.9)";
const FIREWORK_COLORS = [...SPRINKLES, "#ff5277", "#ffb3c4"];
const TAU = Math.PI * 2;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);

/** A drip hanging from the jam at the top of the screen. */
interface Drip {
  x: number;
  half: number;
  len: number;
  maxLen: number;
  speed: number;
  delay: number;
  /** Whether this drip lets go of drops, or just hangs there. */
  drops: boolean;
}

/** A drop of jam falling down. */
interface Drop {
  x: number;
  y: number;
  vy: number;
  r: number;
}

/** A tiny bit of jam splashing up out of the pool. */
interface Splash {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface Ripple {
  x: number;
  born: number;
  amp: number;
}

interface Seed {
  x: number;
  y: number;
  rot: number;
}

/** A big splat of jam stuck to the screen. */
interface Splat {
  x: number;
  y: number;
  r: number;
  born: number;
  scale: Spring;
  squash: Spring;
  /** Phases for the bumpy outline. */
  wobble: [number, number, number];
  blobs: { a: number; d: number; r: number }[];
  seeds: Seed[];
  drip: number;
  dripMax: number;
  dripSpeed: number;
  dripX: number;
}

/** Things scheduled on the finale's own clock, so they pause and stop with it. */
interface Cue {
  at: number;
  run: () => void;
}

export class JamFinale {
  private readonly root: HTMLElement;
  private readonly jar: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly particles = new Particles();

  private width = 0;
  private height = 0;
  /** Size factor so the jam looks right on phones and big screens. */
  private unit = 1;

  private t = 0;
  private lastFrame = 0;
  private running = false;
  private nextFirework = 0;
  private nextTwinkle = 0;

  private curtain = 0;
  private pool = 0;
  private drips: Drip[] = [];
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private ripples: Ripple[] = [];
  private splats: Splat[] = [];
  private curtainSeeds: Seed[] = [];
  private poolSeeds: Seed[] = [];
  private cues: Cue[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.jar = root.querySelector<HTMLElement>(".jar")!;
    this.canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;

    // Put each letter of the title in its own span so they can plop in one by one.
    const title = root.querySelector<HTMLElement>("#finale-title");
    if (title) {
      const text = title.textContent ?? "";
      title.setAttribute("aria-label", text);
      title.textContent = "";
      [...text].forEach((ch, i) => {
        const span = document.createElement("span");
        span.className = "letter";
        span.setAttribute("aria-hidden", "true");
        span.style.setProperty("--i", String(i));
        span.textContent = ch === " " ? " " : ch;
        title.append(span);
      });
    }

    window.addEventListener("resize", () => {
      if (!this.open) return;
      this.resize();
      this.makeDrips();
      if (!this.running) this.draw();
    });

    // Tap anywhere (except on the buttons) to throw more jam.
    this.canvas.addEventListener("pointerdown", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.addSplat(e.clientX - rect.left, e.clientY - rect.top, this.unit * rand(30, 52));
      buzz(12);
      if (!this.running) this.draw();
    });
  }

  get open(): boolean {
    return !this.root.classList.contains("hidden");
  }

  show(): void {
    this.hide();
    this.root.classList.remove("hidden"); // this also restarts the CSS animations
    this.resize();
    this.setup();

    if (reducedMotion) {
      // No pouring or flying: just show how it ends up.
      this.cues = [];
      for (const spot of this.splatSpots(7)) this.addSplat(spot.x, spot.y, spot.r, true);
      for (let i = 0; i < 160; i++) this.update(1 / 40, true);
      sound.fanfare();
      this.particles.clear();
      this.draw();
      return;
    }

    sound.pour();
    buzz([30, 40, 30, 40, 60]);
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame((now) => this.frame(now));
  }

  hide(): void {
    this.running = false;
    this.root.classList.add("hidden");
    this.particles.clear();
  }

  // ---------- Setup ----------

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.root.clientWidth;
    this.height = this.root.clientHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.unit = Math.max(0.55, Math.min(1.3, Math.min(this.width, this.height) / 700));
  }

  private setup(): void {
    this.t = 0;
    this.nextFirework = 2.6;
    this.nextTwinkle = 2;
    this.drops = [];
    this.splashes = [];
    this.ripples = [];
    this.splats = [];
    this.makeDrips();

    const { width: w, height: h, unit: u } = this;
    this.curtainSeeds = Array.from({ length: Math.round(w / 12) }, () => ({
      x: rand(0, w),
      y: rand(0, h * 0.07 + 20 * u),
      rot: rand(0, TAU),
    }));
    this.poolSeeds = Array.from({ length: Math.round(w / 12) }, () => ({
      x: rand(0, w),
      y: rand(4, h * 0.07),
      rot: rand(0, TAU),
    }));

    // Splats land around the jar, one after another.
    const spots = this.splatSpots(7);
    this.cues = spots.map((s, i) => ({ at: 0.9 + i * 0.16, run: () => this.addSplat(s.x, s.y, s.r) }));

    // The jar lands at about 1.9 s (see the CSS): fanfare and confetti.
    this.cues.push({
      at: 1.9,
      run: () => {
        sound.fanfare();
        buzz([40, 50, 80]);
        this.particles.cannons(this.width, this.height, FIREWORK_COLORS);
        this.particles.confetti(this.width, FIREWORK_COLORS);
      },
    });
    this.cues.push({ at: 2.2, run: () => this.particles.cannons(this.width, this.height, FIREWORK_COLORS) });
    this.cues.push({ at: 2.3, run: () => this.firework(this.width * 0.22, this.height * 0.3) });
    this.cues.push({ at: 2.6, run: () => this.firework(this.width * 0.78, this.height * 0.26) });
  }

  private makeDrips(): void {
    const u = this.unit;
    const count = Math.max(8, Math.round(this.width / (46 * u)));
    const step = this.width / count;
    this.drips = Array.from({ length: count }, (_, i) => {
      const long = Math.random() < 0.35;
      return {
        x: (i + 0.5) * step + rand(-step * 0.3, step * 0.3),
        half: rand(4, 8.5) * u,
        len: 0,
        maxLen: (long ? rand(80, 170) : rand(14, 55)) * u,
        speed: rand(35, 75) * u,
        delay: rand(0.25, 1.4),
        drops: long || Math.random() < 0.3,
      };
    });
  }

  /** Random places for splats, kept off the jar and away from each other. */
  private splatSpots(count: number): { x: number; y: number; r: number }[] {
    const box = this.jarBox();
    const spots: { x: number; y: number; r: number }[] = [];
    for (let tries = 0; spots.length < count && tries < 400; tries++) {
      const r = this.unit * rand(34, 62);
      const x = rand(0.06, 0.94) * this.width;
      const y = rand(0.18, 0.86) * this.height;
      const onJar = x > box.left - r * 0.4 && x < box.right + r * 0.4 && y > box.top - r * 0.4 && y < box.bottom + r * 0.4;
      const crowded = spots.some((s) => Math.hypot(s.x - x, s.y - y) < (s.r + r) * 1.4);
      if ((!onJar || tries > 300) && !crowded) spots.push({ x, y, r });
    }
    return spots;
  }

  private jarBox(): { left: number; right: number; top: number; bottom: number } {
    const jar = this.jar.getBoundingClientRect();
    const me = this.root.getBoundingClientRect();
    return { left: jar.left - me.left, right: jar.right - me.left, top: jar.top - me.top, bottom: jar.bottom - me.top };
  }

  // ---------- Effects ----------

  private addSplat(x: number, y: number, r: number, quiet = false): void {
    const scale = new Spring(0, 320, 12);
    scale.target = 1;
    scale.velocity = 9;
    const squash = new Spring(0, 240, 8);
    squash.velocity = 7; // starts wide and flat, then wobbles like jelly
    if (reducedMotion) {
      scale.value = 1;
      scale.velocity = 0;
      squash.velocity = 0;
    }
    const blobCount = Math.round(rand(5, 9));
    this.splats.push({
      x,
      y,
      r,
      born: this.t,
      scale,
      squash,
      wobble: [rand(0, TAU), rand(0, TAU), rand(0, TAU)],
      blobs: Array.from({ length: blobCount }, () => ({ a: rand(0, TAU), d: r * rand(1.15, 1.9), r: r * rand(0.07, 0.22) })),
      seeds: Array.from({ length: Math.round(rand(5, 9)) }, () => {
        const a = rand(0, TAU);
        const d = Math.sqrt(Math.random()) * r * 0.7;
        return { x: Math.cos(a) * d, y: Math.sin(a) * d, rot: rand(0, TAU) };
      }),
      drip: 0,
      dripMax: r * rand(0.4, 1.4),
      dripSpeed: rand(5, 12) * this.unit,
      dripX: rand(-0.4, 0.4) * r,
    });
    if (this.splats.length > 40) this.splats.shift();
    if (!quiet) sound.splat(r / (48 * this.unit));
  }

  private firework(x: number, y: number): void {
    this.particles.firework(x, y, FIREWORK_COLORS, this.unit);
    sound.pop(0.7);
  }

  // ---------- Animation ----------

  private frame(now: number): void {
    if (!this.running) return;
    const dt = Math.min(1 / 30, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  private update(dt: number, silent = false): void {
    this.t += dt;
    const { t, unit: u } = this;

    // Run anything that is due.
    const due = this.cues.filter((c) => c.at <= t);
    this.cues = this.cues.filter((c) => c.at > t);
    for (const c of due) c.run();

    // Keep celebrating: a firework now and then, and twinkles round the jar.
    if (!silent && t > this.nextFirework) {
      this.nextFirework = t + (t < 12 ? rand(0.9, 1.6) : rand(2.5, 4));
      this.firework(rand(0.12, 0.88) * this.width, rand(0.18, 0.5) * this.height);
    }
    if (!silent && t > this.nextTwinkle) {
      this.nextTwinkle = t + 0.18;
      const box = this.jarBox();
      const side = Math.random() < 0.5;
      this.particles.twinkle(
        side ? (Math.random() < 0.5 ? box.left : box.right) + rand(-14, 14) : rand(box.left, box.right),
        side ? rand(box.top, box.bottom) : (Math.random() < 0.5 ? box.top : box.bottom) + rand(-14, 14),
        rand(5, 9) * u,
      );
    }

    this.curtain = -30 * u + easeOut(t / 1.1) * (this.height * 0.07 + 30 * u);
    this.pool = easeOut((t - 0.5) / 2.2) * this.height * 0.07;

    for (const d of this.drips) {
      if (t < d.delay) continue;
      // Jam is thick: fast at first, then slower as the drip gets long.
      d.len += d.speed * dt * (0.25 + 0.75 * (1 - d.len / d.maxLen));
      if (d.len >= d.maxLen) {
        if (d.drops) {
          this.drops.push({ x: d.x, y: this.edge(d.x) + d.len, vy: 40 * u, r: d.half * 1.45 });
          d.len = Math.max(0, d.len - d.half * 4);
          d.maxLen = rand(80, 170) * u;
        } else {
          d.len = d.maxLen;
        }
      }
    }

    for (const drop of this.drops) {
      drop.vy += 1700 * u * dt;
      drop.y += drop.vy * dt;
    }
    this.drops = this.drops.filter((drop) => {
      const surface = this.surface(drop.x);
      if (drop.y + drop.r < surface) return true;
      if (this.pool > 2) {
        this.ripples.push({ x: drop.x, born: t, amp: drop.r * 0.9 });
        for (let i = 0; i < 5; i++) {
          this.splashes.push({ x: drop.x, y: surface, vx: rand(-110, 110) * u, vy: -rand(140, 300) * u, r: rand(1.5, 3.2) * u });
        }
        if (!silent) sound.plip();
      }
      return false;
    });

    for (const s of this.splashes) {
      s.vy += 1500 * u * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.splashes = this.splashes.filter((s) => s.vy < 0 || s.y < this.surface(s.x) + 2);
    this.ripples = this.ripples.filter((r) => t - r.born < 3);

    for (const s of this.splats) {
      s.scale.step(dt);
      s.squash.step(dt);
      if (t - s.born > 0.6) s.drip = Math.min(s.dripMax, s.drip + s.dripSpeed * dt * (1 - (s.drip / s.dripMax) * 0.8));
    }

    this.particles.update(dt);
  }

  /** Bottom edge of the jam curtain at x. */
  private edge(x: number): number {
    const u = this.unit;
    return this.curtain + Math.sin(x * 0.012 + this.t * 1.3) * 6 * u + Math.sin(x * 0.031 - this.t * 0.9) * 3 * u;
  }

  /** Top of the jam pool at x, including ripples from drops. */
  private surface(x: number): number {
    const u = this.unit;
    let y = this.height - this.pool + Math.sin(x * 0.02 + this.t * 1.6) * 3 * u + Math.sin(x * 0.007 - this.t) * 4 * u;
    for (const r of this.ripples) {
      const age = this.t - r.born;
      const k = (Math.abs(x - r.x) - age * 240 * u) / (22 * u);
      y += r.amp * Math.exp(-age * 1.8) * Math.exp(-k * k) * Math.cos(k * 2.2);
    }
    return y;
  }

  // ---------- Drawing ----------

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawPool();
    for (const s of this.splats) this.drawSplat(s);
    this.drawDrops();
    this.drawCurtain();
    this.particles.draw(ctx);
  }

  /** A drip: a thick column with a round blob at the end, joined smoothly to the jam above it. */
  private dripShape(x: number, top: number, len: number, half: number): void {
    const ctx = this.ctx;
    const fillet = half * 1.8;
    const tip = top + len;
    const columnTop = Math.min(top + fillet * 0.8, tip);
    ctx.beginPath();
    ctx.moveTo(x - half - fillet, top - 3);
    ctx.quadraticCurveTo(x - half, top - 1, x - half, columnTop);
    ctx.lineTo(x - half, tip);
    ctx.lineTo(x + half, tip);
    ctx.lineTo(x + half, columnTop);
    ctx.quadraticCurveTo(x + half, top - 1, x + half + fillet, top - 3);
    ctx.closePath();
    ctx.fill();
    const blob = half * 1.45 * clamp01(len / (half * 4));
    if (blob > 0.5) {
      ctx.beginPath();
      ctx.arc(x, tip, blob, 0, TAU);
      ctx.fill();
    }
  }

  private seed(s: Seed): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, 1.8 * this.unit, 1.1 * this.unit, s.rot, 0, TAU);
    ctx.fill();
  }

  /** A shiny band that slides along the jam, so it looks glossy and wet. */
  private shine(alpha: number): CanvasGradient {
    const g = this.ctx.createLinearGradient(0, 0, this.width, 0);
    const base = `rgba(255, 255, 255, ${alpha * 0.35})`;
    const c = ((this.t * 0.22) % 1.6) - 0.3;
    g.addColorStop(0, base);
    if (c > 0.1 && c < 0.9) {
      g.addColorStop(c - 0.1, base);
      g.addColorStop(c, `rgba(255, 255, 255, ${alpha})`);
      g.addColorStop(c + 0.1, base);
    }
    g.addColorStop(1, base);
    return g;
  }

  private drawCurtain(): void {
    const ctx = this.ctx;
    const u = this.unit;
    const step = 8;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-10, -10);
      for (let x = -10; x <= this.width + 10; x += step) ctx.lineTo(x, this.edge(x));
      ctx.lineTo(this.width + 10, -10);
      ctx.closePath();
    };
    const drips = () => {
      for (const d of this.drips) if (d.len > 0) this.dripShape(d.x, this.edge(d.x), d.len, d.half);
    };

    // A darker copy a little lower gives the jam some thickness.
    ctx.save();
    ctx.translate(0, 3 * u);
    ctx.fillStyle = JAM_DARK;
    path();
    ctx.fill();
    drips();
    ctx.restore();

    ctx.fillStyle = JAM;
    path();
    ctx.fill();
    drips();

    ctx.fillStyle = SEED;
    for (const s of this.curtainSeeds) if (s.y < this.edge(s.x) - 5 * u) this.seed(s);

    // Shine along the edge and down each drip.
    ctx.strokeStyle = this.shine(0.75);
    ctx.lineWidth = 3 * u;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let x = 0; x <= this.width; x += step) ctx.lineTo(x, this.edge(x) - 8 * u);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = Math.max(1.5, 2 * u);
    for (const d of this.drips) {
      const blob = d.half * 1.45 * clamp01(d.len / (d.half * 4));
      if (blob < 2) continue;
      const tip = this.edge(d.x) + d.len;
      if (d.len > d.half * 5) {
        ctx.beginPath();
        ctx.moveTo(d.x - d.half * 0.45, this.edge(d.x) + d.half * 2);
        ctx.lineTo(d.x - d.half * 0.45, tip - blob);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(d.x - blob * 0.38, tip - blob * 0.35, blob * 0.28, 0, TAU);
      ctx.fill();
    }
  }

  private drawPool(): void {
    if (this.pool <= 0.5) return;
    const ctx = this.ctx;
    const u = this.unit;
    const step = 6;
    const path = (lift: number) => {
      ctx.beginPath();
      ctx.moveTo(-10, this.height + 10);
      for (let x = -10; x <= this.width + 10; x += step) ctx.lineTo(x, this.surface(x) - lift);
      ctx.lineTo(this.width + 10, this.height + 10);
      ctx.closePath();
    };
    ctx.fillStyle = JAM_DARK;
    path(0);
    ctx.fill();
    ctx.fillStyle = JAM;
    path(-3 * u);
    ctx.fill();

    ctx.fillStyle = SEED;
    for (const s of this.poolSeeds) {
      const y = this.height - s.y;
      if (y > this.surface(s.x) + 6 * u) this.seed({ x: s.x, y, rot: s.rot });
    }

    ctx.strokeStyle = this.shine(0.6);
    ctx.lineWidth = 2.5 * u;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let x = 0; x <= this.width; x += step) ctx.lineTo(x, this.surface(x) + 7 * u);
    ctx.stroke();
  }

  private drawDrops(): void {
    const ctx = this.ctx;
    ctx.fillStyle = JAM;
    for (const d of this.drops) {
      // Falling drops stretch out a bit, like a teardrop.
      const stretch = 1 + Math.min(0.8, d.vy / (1400 * this.unit));
      const { x, y, r } = d;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 2 * stretch);
      ctx.bezierCurveTo(x + r * 0.2, y - r * 1.2 * stretch, x + r, y - r * 0.6, x + r, y);
      ctx.arc(x, y, r, 0, Math.PI);
      ctx.bezierCurveTo(x - r, y - r * 0.6, x - r * 0.2, y - r * 1.2 * stretch, x, y - r * 2 * stretch);
      ctx.fill();
    }
    for (const s of this.splashes) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    for (const d of this.drops) {
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.35, d.y - d.r * 0.3, d.r * 0.28, 0, TAU);
      ctx.fill();
    }
  }

  private drawSplat(s: Splat): void {
    const ctx = this.ctx;
    const u = this.unit;
    const sc = Math.max(0, s.scale.value);
    if (sc < 0.01) return;
    const sq = Math.max(-0.35, Math.min(0.35, s.squash.value * 0.06));
    const [w0, w1, w2] = s.wobble;
    const r = s.r;

    const body = (dy: number) => {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * TAU;
        const rr = r * (1 + 0.1 * Math.sin(3 * a + w0) + 0.06 * Math.sin(5 * a + w1) + 0.035 * Math.sin(8 * a + w2));
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + dy);
      }
      ctx.closePath();
      ctx.fill();
      for (const b of s.blobs) {
        ctx.beginPath();
        ctx.arc(Math.cos(b.a) * b.d, Math.sin(b.a) * b.d + dy, b.r, 0, TAU);
        ctx.fill();
      }
    };
    const drip = (dy: number) => {
      if (s.drip > 1) this.dripShape(s.dripX, r * 0.6 + dy, r * 0.25 + s.drip, r * 0.13);
    };

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(sc * (1 + sq), sc * (1 - sq));

    ctx.fillStyle = JAM_DARK;
    body(3 * u);
    drip(3 * u);
    ctx.fillStyle = JAM;
    body(0);
    drip(0);

    ctx.fillStyle = SEED;
    for (const seed of s.seeds) this.seed(seed);

    // Glossy highlights.
    ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.36, -r * 0.42, r * 0.3, r * 0.13, -0.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.beginPath();
    ctx.arc(-r * 0.02, -r * 0.62, r * 0.06, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
