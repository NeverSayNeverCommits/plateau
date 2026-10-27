/** Small animation helpers: a bouncy spring and a particle system. */

/** A damped spring. Push `velocity` to make it wobble; set `target` to move it. */
export class Spring {
  value: number;
  target: number;
  velocity = 0;
  private readonly stiffness: number;
  private readonly damping: number;

  constructor(value: number, stiffness = 280, damping = 14) {
    this.value = value;
    this.target = value;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  step(dt: number): void {
    const accel = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
  }
}

export type ParticleKind = "sprinkle" | "dot" | "star" | "ring" | "flour";

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  /** How quickly the particle slows down (0 = never). */
  drag: number;
  life: number;
  maxLife: number;
  size: number;
  /** End radius, used by rings. */
  grow: number;
  color: string;
  rot: number;
  spin: number;
}

const MAX_PARTICLES = 700;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export class Particles {
  private list: Particle[] = [];

  get count(): number {
    return this.list.length;
  }

  clear(): void {
    this.list = [];
  }

  add(p: Partial<Particle> & Pick<Particle, "kind" | "x" | "y">): void {
    if (this.list.length >= MAX_PARTICLES) this.list.shift();
    const maxLife = p.maxLife ?? 0.8;
    this.list.push({
      vx: 0,
      vy: 0,
      gravity: 0,
      drag: 0,
      size: 3,
      grow: 0,
      color: "#fff",
      rot: Math.random() * Math.PI * 2,
      spin: 0,
      ...p,
      life: maxLife,
      maxLife,
    });
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      const slow = Math.exp(-p.drag * dt);
      p.vx *= slow;
      p.vy *= slow;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const t = 1 - p.life / p.maxLife; // 0 at birth, 1 at death
      ctx.save();
      ctx.translate(p.x, p.y);
      switch (p.kind) {
        case "sprinkle": {
          ctx.globalAlpha = Math.min(1, p.life / 0.25);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          const w = p.size * 2.4;
          const h = p.size * 0.9;
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
          ctx.fill();
          break;
        }
        case "dot": {
          ctx.globalAlpha = Math.min(1, p.life / 0.25);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "star": {
          // Grows in, then shrinks away while spinning.
          const s = p.size * Math.sin(Math.PI * t);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          drawSparkle(ctx, s);
          break;
        }
        case "ring": {
          const ease = 1 - Math.pow(1 - t, 3);
          ctx.globalAlpha = (1 - t) * 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 4 * (1 - t) + 0.5;
          ctx.beginPath();
          ctx.arc(0, 0, p.size + (p.grow - p.size) * ease, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "flour": {
          ctx.globalAlpha = (1 - t) * 0.8;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (0.6 + t), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
      ctx.restore();
    }
  }

  // ---------- Ready-made effects ----------

  /** The big one: a macaron just turned green. */
  untangleBurst(x: number, y: number, radius: number, colors: string[], ringColor: string): void {
    this.add({ kind: "ring", x, y, size: radius * 0.9, grow: radius * 3.2, color: ringColor, maxLife: 0.5 });
    this.add({ kind: "ring", x, y, size: radius * 0.6, grow: radius * 2.2, color: "#ffffff", maxLife: 0.35 });
    const count = 14;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
      const speed = rand(110, 260);
      this.add({
        kind: Math.random() < 0.75 ? "sprinkle" : "dot",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        gravity: 520,
        drag: 2.5,
        size: rand(1.8, 2.8),
        color: pick(colors),
        spin: rand(-12, 12),
        maxLife: rand(0.55, 0.9),
      });
    }
    for (let i = 0; i < 3; i++) {
      this.add({
        kind: "star",
        x: x + rand(-radius * 1.6, radius * 1.6),
        y: y + rand(-radius * 1.6, radius * 0.6),
        size: rand(5, 8),
        color: "#fff7c2",
        spin: rand(-3, 3),
        maxLife: rand(0.4, 0.7),
      });
    }
  }

  /** A macaron got tangled again: a few sad crumbs. */
  crumbs(x: number, y: number, color: string): void {
    for (let i = 0; i < 5; i++) {
      this.add({
        kind: "dot",
        x: x + rand(-6, 6),
        y: y + rand(0, 6),
        vx: rand(-50, 50),
        vy: rand(-80, -20),
        gravity: 600,
        size: rand(1.2, 2),
        color,
        maxLife: rand(0.35, 0.55),
      });
    }
  }

  /** A puff of flour when you put a macaron down. */
  flourPuff(x: number, y: number, radius: number): void {
    for (let i = 0; i < 9; i++) {
      const angle = rand(Math.PI * 0.05, Math.PI * 0.95);
      const speed = rand(30, 90);
      this.add({
        kind: "flour",
        x: x + Math.cos(angle) * radius * 0.8,
        y: y + radius * 0.7,
        vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? -1 : 1),
        vy: -Math.sin(angle) * speed * 0.4,
        drag: 4,
        size: rand(2.5, 5),
        color: "rgba(255, 255, 255, 0.9)",
        maxLife: rand(0.35, 0.6),
      });
    }
  }

  /** Sprinkle confetti raining down over the whole board. */
  confetti(width: number, colors: string[]): void {
    for (let i = 0; i < 140; i++) {
      this.add({
        kind: Math.random() < 0.85 ? "sprinkle" : "star",
        x: rand(0, width),
        y: rand(-120, -10),
        vx: rand(-40, 40),
        vy: rand(80, 260),
        gravity: 220,
        drag: 0.6,
        size: rand(2.2, 3.6),
        color: pick(colors),
        spin: rand(-8, 8),
        maxLife: rand(1.8, 3),
      });
    }
  }

  /** Confetti cannons from the bottom corners. */
  cannons(width: number, height: number, colors: string[]): void {
    for (const side of [0, 1]) {
      for (let i = 0; i < 50; i++) {
        const angle = side === 0 ? rand(-1.35, -0.75) : rand(-2.4, -1.8);
        const speed = rand(380, 720);
        this.add({
          kind: "sprinkle",
          x: side === 0 ? 0 : width,
          y: height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: 520,
          drag: 1.2,
          size: rand(2.2, 3.6),
          color: pick(colors),
          spin: rand(-10, 10),
          maxLife: rand(1.6, 2.4),
        });
      }
    }
  }
}

/** A four-pointed twinkle star. */
function drawSparkle(ctx: CanvasRenderingContext2D, size: number): void {
  if (size <= 0) return;
  const inner = size * 0.28;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? size : inner;
    const a = (i / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}
