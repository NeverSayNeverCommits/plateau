import { sound, buzz } from "./audio.ts";
import { drawPipedLine, drawShadow, mixFlavor, mix } from "./draw.ts";
import { Particles, Spring } from "./fx.ts";
import { distToSegment, segmentsIntersect, type Vec } from "./geometry.ts";
import type { Edge, Level } from "./levels.ts";
import { drawPastry, PASTRY_BOTTOM, type Mood, type PastryKind } from "./pastries.ts";
import { COLOR, PISTACHIO, SPRINKLES, type Flavor, type LevelTheme } from "./theme.ts";

/** Extra space at the top for the striped awning that hangs over the board. */
const AWNING = 20;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface Status {
  /** Number of problems left: lines crossing, or pastries sitting on a line / another macaron. */
  crossings: number;
  moves: number;
  /** How many pastries are green right now. */
  good: number;
  total: number;
  /** True when nothing crosses and the player is not holding a macaron. */
  solved: boolean;
}

export interface GameEvents {
  onStatus: (status: Status) => void;
  /** Called once when the player finishes a level. */
  onWin: (moves: number) => void;
}

interface Analysis {
  goodDot: boolean[];
  badEdge: boolean[];
  crossings: number;
  /** Where lines cross, for the little jam dots. */
  crossPoints: Vec[];
}

/** Animation state for one macaron. */
interface DotView {
  scale: Spring;
  /** Up/down offset in px, for hops. */
  hop: Spring;
  /** 0..1, how much the pastry is lifted off the table. */
  lift: Spring;
  tilt: Spring;
  /** 0 = tangled flavour, 1 = pistachio green. */
  green: number;
  good: boolean;
  appearAt: number;
  hopAt: number;
  phase: number;
  nextBlink: number;
  blinkUntil: number;
  lastBurst: number;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly events: GameEvents;
  private readonly particles = new Particles();

  private level: Level | null = null;
  private flavor: Flavor = PISTACHIO;
  private pastry: PastryKind = "macaron";
  /** Positions in 0..1 board space, so they survive window resizes. */
  private points: Vec[] = [];
  private screen: Vec[] = [];
  private edgesOfDot: number[][] = [];
  private neighbors: Set<number>[] = [];
  private views: DotView[] = [];
  private analysis: Analysis = { goodDot: [], badEdge: [], crossings: 0, crossPoints: [] };
  private dirty = true;
  private moves = 0;
  private won = false;
  /** 0..1, fades the lines green after a win. */
  private solvedGlow = 0;

  private width = 0;
  private height = 0;
  /** Pastry size (half its width), picked to fit the screen and level. */
  private radius = 16;
  private time = 0;
  private lastFrame = 0;
  private levelStart = 0;
  private shake = 0;

  private dragIndex = -1;
  private hoverIndex = -1;
  private dragOffset: Vec = { x: 0, y: 0 };
  private dragMoved = false;
  private pointerId = -1;
  private dragVelocity = 0;
  private lastPointer: { x: number; t: number } = { x: 0, t: 0 };

  constructor(canvas: HTMLCanvasElement, events: GameEvents) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not supported");
    this.ctx = ctx;
    this.events = events;

    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    canvas.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    canvas.addEventListener("pointerleave", () => (this.hoverIndex = -1));
    this.resize();

    requestAnimationFrame((t) => this.frame(t));
  }

  load(level: Level, theme: LevelTheme): void {
    this.level = level;
    this.flavor = theme.flavor;
    this.pastry = theme.pastry;
    this.edgesOfDot = Array.from({ length: level.nodeCount }, () => []);
    this.neighbors = Array.from({ length: level.nodeCount }, () => new Set());
    level.edges.forEach(([a, b], i) => {
      this.edgesOfDot[a].push(i);
      this.edgesOfDot[b].push(i);
      this.neighbors[a].add(b);
      this.neighbors[b].add(a);
    });
    this.updateRadius();
    this.reset();
  }

  reset(): void {
    if (!this.level) return;
    this.points = this.level.start.map((p) => ({ ...p }));
    this.moves = 0;
    this.won = false;
    this.solvedGlow = 0;
    this.dragIndex = -1;
    this.particles.clear();
    this.levelStart = this.time;

    // Pastrys pop in one after another, going round the circle.
    this.views = this.points.map((p) => {
      const angle = Math.atan2(p.y - 0.5, p.x - 0.5);
      const order = (angle + Math.PI * 2.5) % (Math.PI * 2);
      return {
        scale: new Spring(0, 320, 16),
        hop: new Spring(0, 260, 13),
        lift: new Spring(0, 300, 22),
        tilt: new Spring(0, 200, 14),
        green: 0,
        good: false,
        appearAt: this.time + 0.1 + (order / (Math.PI * 2)) * 0.5,
        hopAt: -1,
        phase: Math.random() * Math.PI * 2,
        nextBlink: this.time + 1 + Math.random() * 4,
        blinkUntil: 0,
        lastBurst: -1,
      };
    });

    // Work out the starting state quietly, with no effects.
    this.refresh(true);
    this.views.forEach((v, i) => {
      v.good = this.analysis.goodDot[i];
      v.green = v.good ? 1 : 0;
    });
  }

  // ---------- Layout ----------

  private get padding(): number {
    return this.radius * 1.5 + 10;
  }

  private updateRadius(): void {
    const n = this.level?.nodeCount ?? 10;
    const fit = Math.min(this.width, this.height) / (Math.sqrt(n) * 5.2);
    this.radius = Math.max(10, Math.min(26, fit));
  }

  private toScreen(p: Vec): Vec {
    const pad = this.padding;
    const top = pad + AWNING;
    return {
      x: pad + p.x * Math.max(1, this.width - 2 * pad),
      y: top + p.y * Math.max(1, this.height - top - pad),
    };
  }

  private fromScreen(p: Vec): Vec {
    const pad = this.padding;
    const top = pad + AWNING;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    return {
      x: clamp((p.x - pad) / Math.max(1, this.width - 2 * pad)),
      y: clamp((p.y - top) / Math.max(1, this.height - top - pad)),
    };
  }

  private pointerPos(e: PointerEvent): Vec {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.updateRadius();
    this.dirty = true;
  }

  // ---------- Rules ----------

  /** Work out which lines cross and which pastries are untangled. Done in screen pixels. */
  private analyse(screen: Vec[], edges: Edge[]): Analysis {
    const n = screen.length;
    const r = this.radius;
    const badDot = new Array<boolean>(n).fill(false);
    const badEdge = new Array<boolean>(edges.length).fill(false);
    const crossPoints: Vec[] = [];
    let crossings = 0;

    // 1. Lines crossing other lines (lines that share a pastry may meet there).
    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i];
      for (let j = i + 1; j < edges.length; j++) {
        const [c, d] = edges[j];
        if (a === c || a === d || b === c || b === d) continue;
        if (segmentsIntersect(screen[a], screen[b], screen[c], screen[d])) {
          badEdge[i] = badEdge[j] = true;
          crossings++;
          crossPoints.push(crossingPoint(screen[a], screen[b], screen[c], screen[d]));
        }
      }
    }

    // 2. A pastry sitting on a line it does not belong to.
    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i];
      for (let v = 0; v < n; v++) {
        if (v === a || v === b) continue;
        if (distToSegment(screen[v], screen[a], screen[b]) < r * 0.85) {
          badEdge[i] = true;
          badDot[v] = true;
          crossings++;
        }
      }
    }

    // 3. Two pastries on top of each other.
    for (let u = 0; u < n; u++) {
      for (let v = u + 1; v < n; v++) {
        if (Math.hypot(screen[u].x - screen[v].x, screen[u].y - screen[v].y) < r * 1.7) {
          badDot[u] = badDot[v] = true;
          crossings++;
        }
      }
    }

    const goodDot = badDot.map((bad, v) => !bad && this.edgesOfDot[v].every((e) => !badEdge[e]));
    return { goodDot, badEdge, crossings, crossPoints };
  }

  /** Re-check the rules after something moved, and fire effects for pastries that changed. */
  private refresh(silent = false): void {
    if (!this.level || this.width === 0) return;
    this.dirty = false;
    this.screen = this.points.map((p) => this.toScreen(p));
    this.analysis = this.analyse(this.screen, this.level.edges);

    const total = this.level.nodeCount;
    const goodCount = this.analysis.goodDot.filter(Boolean).length;
    const intro = this.time - this.levelStart < 0.8;

    if (!silent) {
      let newlyGood = 0;
      this.views.forEach((view, i) => {
        const good = this.analysis.goodDot[i];
        if (good === view.good) return;
        view.good = good;
        if (intro) return;
        const p = this.screen[i];
        const fresh = this.time - view.lastBurst > 0.25;
        if (good) {
          view.scale.velocity += 9;
          view.hop.velocity -= 160;
          if (fresh) {
            view.lastBurst = this.time;
            this.particles.untangleBurst(p.x, p.y, this.radius, SPRINKLES, PISTACHIO.shell);
          }
          sound.untangled(goodCount / total, Math.min(newlyGood, 5) * 0.06);
          newlyGood++;
        } else {
          view.scale.velocity -= 5;
          if (fresh) {
            view.lastBurst = this.time;
            this.particles.crumbs(p.x, p.y, this.flavor.edge);
          }
          sound.tangled();
        }
      });
      if (newlyGood > 0) buzz(12);
    }

    const solved = this.analysis.crossings === 0 && this.dragIndex === -1;
    if (solved && !this.won && this.moves > 0 && !silent) this.celebrate();
    if (!solved) this.won = false;

    this.events.onStatus({
      crossings: this.analysis.crossings,
      moves: this.moves,
      good: goodCount,
      total,
      solved,
    });
  }

  private celebrate(): void {
    this.won = true;
    // A wave of hops from left to right.
    this.views.forEach((v, i) => {
      v.hopAt = this.time + 0.05 + (this.screen[i].x / Math.max(1, this.width)) * 0.45;
    });
    this.particles.confetti(this.width, SPRINKLES);
    this.particles.cannons(this.width, this.height, SPRINKLES);
    if (!reducedMotion) this.shake = 7;
    sound.win();
    buzz([20, 60, 30]);
    this.events.onWin(this.moves);
  }

  // ---------- Animation loop ----------

  private frame(now: number): void {
    const dt = Math.min(1 / 30, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    this.time += dt;

    if (this.dirty) this.refresh();
    this.animate(dt);
    this.draw();

    requestAnimationFrame((t) => this.frame(t));
  }

  private animate(dt: number): void {
    const solved = this.won;
    this.solvedGlow += ((solved ? 1 : 0) - this.solvedGlow) * Math.min(1, dt * 4);
    this.shake *= Math.exp(-dt * 9);
    this.dragVelocity *= Math.exp(-dt * 8);

    this.views.forEach((v, i) => {
      // Pop in at the start of the level.
      if (this.time < v.appearAt) {
        v.scale.value = 0;
        v.scale.velocity = 0;
      }

      let target = 1;
      if (i === this.dragIndex) target = 1.22;
      else if (this.dragIndex !== -1 && this.neighbors[this.dragIndex]?.has(i)) target = 1.08;
      else if (i === this.hoverIndex) target = 1.12;
      if (this.time >= v.appearAt) v.scale.target = target;

      v.lift.target = i === this.dragIndex ? 1 : 0;
      v.tilt.target = i === this.dragIndex ? Math.max(-0.35, Math.min(0.35, this.dragVelocity * 0.0012)) : 0;

      if (v.hopAt > 0 && this.time >= v.hopAt) {
        v.hopAt = -1;
        v.hop.velocity -= 380;
        v.scale.velocity += 4;
      }

      if (this.time > v.nextBlink) {
        v.blinkUntil = this.time + 0.12;
        v.nextBlink = this.time + 2 + Math.random() * 4;
      }

      v.green += ((v.good ? 1 : 0) - v.green) * Math.min(1, dt * 10);
      v.scale.step(dt);
      v.hop.step(dt);
      v.lift.step(dt);
      v.tilt.step(dt);
    });

    this.particles.update(dt);
  }

  // ---------- Drawing ----------

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.level) return;

    ctx.save();
    if (this.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    const r = this.radius;
    const edges = this.level.edges;
    const lineAlpha = Math.max(0, Math.min(1, (this.time - this.levelStart - 0.25) / 0.5));
    const lineWidth = Math.max(3.5, Math.min(7, r * 0.34));

    // Lines: chocolate normally, raspberry when crossing, green once solved.
    ctx.globalAlpha = lineAlpha;
    const solvedColor = mix(COLOR.chocolate, COLOR.solvedLine, this.solvedGlow);
    edges.forEach(([a, b], i) => {
      const active = this.dragIndex === a || this.dragIndex === b;
      const pa = this.screen[a];
      const pb = this.screen[b];
      if (!pa || !pb) return;
      if (this.analysis.badEdge[i]) {
        drawPipedLine(ctx, pa, pb, lineWidth, COLOR.raspberry, COLOR.raspberryShine);
      } else if (this.solvedGlow > 0.01) {
        drawPipedLine(ctx, pa, pb, lineWidth, solvedColor, COLOR.solvedShine);
      } else {
        drawPipedLine(ctx, pa, pb, active ? lineWidth * 1.25 : lineWidth, active ? COLOR.chocolateActive : COLOR.chocolate, COLOR.chocolateShine);
      }
    });

    // Jam dots where lines cross, gently pulsing.
    const pulse = 1 + Math.sin(this.time * 6) * 0.18;
    ctx.fillStyle = COLOR.jam;
    for (const p of this.analysis.crossPoints) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, lineWidth * 0.62 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pastrys: shadows first, then the pastries, the held one last so it is on top.
    const order = this.views.map((_, i) => i).filter((i) => i !== this.dragIndex);
    if (this.dragIndex !== -1) order.push(this.dragIndex);

    for (const i of order) {
      const v = this.views[i];
      const p = this.screen[i];
      if (!p || v.scale.value <= 0.01) continue;
      // The shadow stays on the table and spreads out as the pastry goes up.
      const height = Math.min(1, v.lift.value + Math.max(0, -v.hop.value) / (r * 3));
      const ground = p.y + PASTRY_BOTTOM[this.pastry] * r * 0.95;
      drawShadow(ctx, p.x, ground, r * Math.max(0, v.scale.value), height);
    }

    for (const i of order) {
      const v = this.views[i];
      const p = this.screen[i];
      const s = Math.max(0, v.scale.value);
      if (!p || s <= 0.01) continue;

      const bob = reducedMotion || i === this.dragIndex ? 0 : Math.sin(this.time * 2.2 + v.phase) * r * 0.05;
      const breathe = reducedMotion ? 0 : Math.sin(this.time * 2.2 + v.phase + 1) * 0.02;

      let mood: Mood = v.good ? "happy" : "worried";
      if (i === this.dragIndex) mood = "held";

      ctx.save();
      ctx.translate(p.x, p.y + v.hop.value + bob - v.lift.value * r * 0.45);
      ctx.rotate(v.tilt.value);
      // A little squash and stretch while hopping.
      const squash = Math.max(-0.15, Math.min(0.15, v.hop.velocity * -0.0004));
      ctx.scale(s * (1 + breathe - squash * 0.5), s * (1 - breathe + squash));
      drawPastry(ctx, this.pastry, r, {
        glaze: mixFlavor(this.flavor, PISTACHIO, v.green),
        mood,
        blinking: this.time < v.blinkUntil,
        glow: v.green * (0.5 + this.solvedGlow * 0.5),
        glowColor: PISTACHIO.shell,
      });
      ctx.restore();
    }

    this.particles.draw(ctx);
    ctx.restore();
  }

  // ---------- Input ----------

  private dotAt(pos: Vec): number {
    let best = -1;
    let bestDist = Math.max(24, this.radius * 1.6);
    this.screen.forEach((s, i) => {
      const d = Math.hypot(s.x - pos.x, s.y - pos.y);
      if (d <= bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }

  private onPointerDown(e: PointerEvent): void {
    sound.unlock();
    if (this.dragIndex !== -1) return; // already dragging with another finger
    const pos = this.pointerPos(e);
    const hit = this.dotAt(pos);
    if (hit === -1) return;

    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.pointerId = e.pointerId;
    this.dragIndex = hit;
    this.dragMoved = false;
    this.dragVelocity = 0;
    this.lastPointer = { x: pos.x, t: performance.now() };
    const s = this.screen[hit];
    this.dragOffset = { x: s.x - pos.x, y: s.y - pos.y };
    this.views[hit].scale.velocity += 4;
    this.canvas.style.cursor = "grabbing";
    sound.pickUp();
    this.dirty = true;
  }

  private onPointerMove(e: PointerEvent): void {
    const pos = this.pointerPos(e);

    if (this.dragIndex === -1 || e.pointerId !== this.pointerId) {
      if (e.pointerType === "mouse") {
        this.hoverIndex = this.dotAt(pos);
        this.canvas.style.cursor = this.hoverIndex === -1 ? "default" : "grab";
      }
      return;
    }

    // Track sideways speed so the pastry tilts as you swing it around.
    const now = performance.now();
    const dt = Math.max(1, now - this.lastPointer.t) / 1000;
    const vx = (pos.x - this.lastPointer.x) / dt;
    this.dragVelocity += (vx - this.dragVelocity) * 0.3;
    this.lastPointer = { x: pos.x, t: now };

    this.points[this.dragIndex] = this.fromScreen({
      x: pos.x + this.dragOffset.x,
      y: pos.y + this.dragOffset.y,
    });
    this.dragMoved = true;
    this.dirty = true;
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.dragIndex === -1 || e.pointerId !== this.pointerId) return;
    const i = this.dragIndex;
    if (this.dragMoved) this.moves++;
    this.dragIndex = -1;
    this.pointerId = -1;

    // Plop it down: squash, flour puff, soft thud.
    const v = this.views[i];
    v.scale.velocity -= 5;
    const p = this.screen[i];
    if (p) this.particles.flourPuff(p.x, p.y, this.radius);
    sound.drop();

    this.canvas.style.cursor = e.pointerType === "mouse" ? "grab" : "default";
    this.dirty = true;
  }
}

/** The point where segments a-b and c-d cross (assumes they do). */
function crossingPoint(a: Vec, b: Vec, c: Vec, d: Vec): Vec {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (denom === 0) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  return { x: a.x + t * rx, y: a.y + t * ry };
}
