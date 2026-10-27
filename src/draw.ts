/** Shared drawing helpers: colour mixing, piped lines and shadows. */

import type { Vec } from "./geometry.ts";
import { COLOR, type Flavor } from "./theme.ts";

// ---------- Colours ----------

const hexCache = new Map<string, [number, number, number]>();

/** Reads "#rrggbb" or "rgb(r,g,b)". */
function toRgb(color: string): [number, number, number] {
  if (color.startsWith("#")) {
    let rgb = hexCache.get(color);
    if (!rgb) {
      const n = parseInt(color.slice(1), 16);
      rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      hexCache.set(color, rgb);
    }
    return rgb;
  }
  const parts = color.match(/\d+/g) ?? ["0", "0", "0"];
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

/** Blend two colours. t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}

export function mixFlavor(a: Flavor, b: Flavor, t: number): Flavor {
  return {
    name: t < 0.5 ? a.name : b.name,
    shell: mix(a.shell, b.shell, t),
    edge: mix(a.edge, b.edge, t),
    filling: mix(a.filling, b.filling, t),
  };
}

// ---------- Lines ----------

/** A line of piped chocolate (or jam): a thick stroke with a shiny streak on top. */
export function drawPipedLine(
  ctx: CanvasRenderingContext2D,
  a: Vec,
  b: Vec,
  width: number,
  color: string,
  shine: string,
): void {
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  // Shine: a thin lighter line nudged up a little, like light on glossy icing.
  const lift = width * 0.18;
  ctx.strokeStyle = shine;
  ctx.lineWidth = Math.max(1, width * 0.28);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - lift);
  ctx.lineTo(b.x, b.y - lift);
  ctx.stroke();
}

// ---------- Shadows ----------

/**
 * Soft oval shadow on the table. `groundY` is where the pastry's bottom sits.
 * `lift` 0..1 makes it bigger and fainter (the pastry is in the air).
 */
export function drawShadow(ctx: CanvasRenderingContext2D, x: number, groundY: number, r: number, lift: number): void {
  ctx.fillStyle = COLOR.shadow;
  ctx.globalAlpha = 1 - lift * 0.45;
  ctx.beginPath();
  ctx.ellipse(x, groundY, r * (0.92 + lift * 0.25), r * (0.2 + lift * 0.05), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
