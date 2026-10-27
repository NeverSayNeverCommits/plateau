/**
 * The seven pastries, one per level. Each one is drawn around (0, 0) in "units":
 * 1 unit = the pastry's radius, so a pastry is about 2 units wide.
 *
 * Every pastry has a coloured part (glaze, icing, shell or cream). That part
 * uses the level's flavour while tangled and turns pistachio green once the
 * pastry is untangled. Every pastry also has a face.
 */

import { mix } from "./draw.ts";
import { COLOR, type Flavor } from "./theme.ts";

export type PastryKind =
  | "macaron"
  | "eclair"
  | "croissant"
  | "millefeuille"
  | "parisbrest"
  | "sainthonore"
  | "croquembouche";

export type Mood = "worried" | "happy" | "held";

export interface PastryStyle {
  /** The coloured part: shell = main colour, edge = outline, filling = cream. */
  glaze: Flavor;
  mood: Mood;
  blinking: boolean;
  /** 0..1, how strongly to glow (used once green). */
  glow: number;
  glowColor: string;
}

/** Baked dough colours, shared by the choux and puff pastries. */
const BAKED = {
  body: "#eab76a",
  light: "#f8dba2",
  shade: "#d0954a",
  edge: "#9b6128",
};
const CREAM = "#fff6e2";
const CREAM_EDGE = "rgba(150, 100, 60, 0.35)";

/** How far below the centre each pastry's bottom is, in units (for the shadow). */
export const PASTRY_BOTTOM: Record<PastryKind, number> = {
  macaron: 0.58,
  eclair: 0.46,
  croissant: 0.56,
  millefeuille: 0.66,
  parisbrest: 0.64,
  sainthonore: 0.56,
  croquembouche: 0.74,
};

type Ctx = CanvasRenderingContext2D;

export function drawPastry(ctx: Ctx, kind: PastryKind, r: number, style: PastryStyle): void {
  ctx.save();
  ctx.scale(r, r);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const px = 1 / r; // one screen pixel, in units
  const lw = Math.max(0.075, px * 1.2);

  // Glow: a blurred shape behind the pastry (hidden by the pastry itself).
  if (style.glow > 0.02) {
    ctx.shadowColor = style.glowColor;
    ctx.shadowBlur = r * 1.8 * style.glow;
    ctx.fillStyle = style.glaze.shell;
    ctx.beginPath();
    // Small enough to stay hidden behind every pastry: only the blur shows.
    ctx.ellipse(0, 0.15, 0.6, 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  switch (kind) {
    case "macaron":
      macaron(ctx, style, lw, px);
      break;
    case "eclair":
      eclair(ctx, style, lw, px);
      break;
    case "croissant":
      croissant(ctx, style, lw, px);
      break;
    case "millefeuille":
      millefeuille(ctx, style, lw, px);
      break;
    case "parisbrest":
      parisBrest(ctx, style, lw, px);
      break;
    case "sainthonore":
      saintHonore(ctx, style, lw, px);
      break;
    case "croquembouche":
      croquembouche(ctx, style, lw, px);
      break;
  }
  ctx.restore();
}

// ---------- Macaron ----------

function macaron(ctx: Ctx, s: PastryStyle, lw: number, px: number): void {
  const g = s.glaze;
  ctx.lineWidth = lw;

  // Bottom shell
  ctx.fillStyle = g.shell;
  ctx.strokeStyle = g.edge;
  ctx.beginPath();
  ctx.moveTo(-0.9, 0.3);
  ctx.bezierCurveTo(-0.9, 0.66, 0.9, 0.66, 0.9, 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ruffledFoot(ctx, -0.92, 0.19, 1.84, 0.13, g);

  // Filling
  ctx.fillStyle = g.filling;
  ctx.strokeStyle = CREAM_EDGE;
  ctx.lineWidth = Math.max(0.04, px);
  ctx.beginPath();
  ctx.roundRect(-0.84, -0.03, 1.68, 0.24, 0.12);
  ctx.fill();
  ctx.stroke();

  ruffledFoot(ctx, -0.96, -0.16, 1.92, 0.14, g);

  // Top shell: a smooth, round dome
  ctx.lineWidth = lw;
  ctx.fillStyle = g.shell;
  ctx.strokeStyle = g.edge;
  ctx.beginPath();
  ctx.moveTo(-0.95, -0.13);
  ctx.bezierCurveTo(-0.98, -0.88, 0.98, -0.88, 0.95, -0.13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  gloss(ctx, -0.4, -0.55, 0.26, 0.08, -0.35);
  drawFace(ctx, 0, -0.4, 0.95, s, px);
}

/** The frilly "feet" at the bottom of a macaron shell: the thing that makes it a macaron. */
function ruffledFoot(ctx: Ctx, x: number, y: number, w: number, h: number, g: Flavor): void {
  const bumps = 12;
  const step = w / bumps;
  ctx.fillStyle = g.shell;
  ctx.fillRect(x + step * 0.3, y, w - step * 0.6, h);
  for (let i = 0; i < bumps; i++) {
    ctx.beginPath();
    ctx.arc(x + step * (i + 0.5), y + h / 2, step * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = g.edge;
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < bumps; i++) {
    ctx.beginPath();
    ctx.arc(x + step * (i + 0.5), y + h * 0.6, step * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------- Éclair ----------

function eclair(ctx: Ctx, s: PastryStyle, lw: number, px: number): void {
  const g = s.glaze;
  const x = -1.12;
  const y = -0.32;
  const w = 2.24;
  const h = 0.78;

  const body = new Path2D();
  body.roundRect(x, y, w, h, h / 2);

  ctx.fillStyle = BAKED.body;
  ctx.fill(body);

  ctx.save();
  ctx.clip(body);
  // Darker baked underside
  ctx.fillStyle = BAKED.shade;
  ctx.fillRect(x, 0.2, w, 0.4);
  // Icing on top, with a wavy, drippy edge
  ctx.fillStyle = g.shell;
  ctx.beginPath();
  ctx.moveTo(x - 0.1, y - 0.1);
  ctx.lineTo(x + w + 0.1, y - 0.1);
  ctx.lineTo(x + w + 0.1, 0.06);
  const waves = 7;
  for (let i = waves; i > 0; i--) {
    const x1 = x + (w * (i - 0.5)) / waves;
    const x0 = x + (w * (i - 1)) / waves;
    const drip = i % 3 === 0 ? 0.2 : 0.12;
    ctx.quadraticCurveTo(x1, drip, x0, 0.06);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = g.edge;
  ctx.lineWidth = lw * 0.8;
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = BAKED.edge;
  ctx.lineWidth = lw;
  ctx.stroke(body);

  gloss(ctx, -0.25, -0.2, 0.6, 0.05, 0);
  drawFace(ctx, 0, -0.12, 0.8, s, px);
}

// ---------- Croissant ----------

function croissant(ctx: Ctx, s: PastryStyle, lw: number, px: number): void {
  const g = s.glaze;
  // Lobes from the tips inwards, so the middle one is on top.
  const lobes: [number, number, number, number, number][] = [
    [-0.9, 0.3, 0.2, 0.26, 0.9],
    [0.9, 0.3, 0.2, 0.26, -0.9],
    [-0.56, 0.08, 0.3, 0.38, 0.55],
    [0.56, 0.08, 0.3, 0.38, -0.55],
    [0, -0.06, 0.42, 0.5, 0],
  ];
  for (const [cx, cy, rx, ry, rot] of lobes) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const lobe = new Path2D();
    lobe.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    // Two-tone dough: coloured lobes with golden laminated stripes.
    ctx.fillStyle = g.shell;
    ctx.fill(lobe);
    ctx.save();
    ctx.clip(lobe);
    ctx.fillStyle = BAKED.body;
    for (const sx of [-0.55, 0.55]) {
      ctx.beginPath();
      ctx.ellipse(sx * rx, 0, rx * 0.13, ry * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = g.edge;
    ctx.lineWidth = lw;
    ctx.stroke(lobe);
    ctx.restore();
  }
  gloss(ctx, -0.16, -0.38, 0.14, 0.07, -0.5);
  drawFace(ctx, 0, -0.06, 0.85, s, px);
}

// ---------- Mille-feuille ----------

function millefeuille(ctx: Ctx, s: PastryStyle, lw: number, px: number): void {
  const g = s.glaze;
  const left = -0.95;
  const width = 1.9;
  const tintedCream = mix(CREAM, g.shell, 0.35);

  // Top face of the slice, seen slightly from above, with the classic feathered icing.
  ctx.fillStyle = mix(g.shell, "#ffffff", 0.35);
  ctx.strokeStyle = g.edge;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(left, -0.6);
  ctx.lineTo(left + width, -0.6);
  ctx.lineTo(left + width - 0.14, -0.78);
  ctx.lineTo(left + 0.14, -0.78);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = COLOR.chocolate;
  ctx.lineWidth = Math.max(0.035, px);
  for (const f of [0.3, 0.5, 0.7]) {
    const y = -0.78 + 0.18 * f;
    const inset = 0.14 * (1 - f);
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const xx = left + inset + 0.05 + ((width - inset * 2 - 0.1) * i) / 8;
      const yy = y + (i % 2 === 0 ? -0.02 : 0.02);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }

  // Front: icing, then pastry / cream / pastry / cream / pastry
  const layer = (y0: number, y1: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(left, y0, width, y1 - y0);
  };
  layer(-0.6, -0.2, g.shell);
  layer(-0.2, -0.05, BAKED.body);
  creamLayer(ctx, left, -0.05, width, 0.24, tintedCream);
  layer(0.19, 0.32, BAKED.body);
  creamLayer(ctx, left, 0.32, width, 0.2, tintedCream);
  layer(0.52, 0.66, BAKED.shade);

  // Flaky lines in the pastry layers
  ctx.strokeStyle = BAKED.edge;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(0.025, px * 0.8);
  for (const y of [-0.13, 0.255, 0.59]) {
    ctx.beginPath();
    for (let x = left + 0.08; x < left + width - 0.1; x += 0.3) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.18, y + 0.01);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = g.edge;
  ctx.lineWidth = lw;
  ctx.strokeRect(left, -0.6, width, 1.26);
  ctx.beginPath();
  ctx.moveTo(left, -0.2);
  ctx.lineTo(left + width, -0.2);
  ctx.stroke();

  gloss(ctx, -0.5, -0.5, 0.25, 0.04, 0);
  drawFace(ctx, 0, -0.42, 0.85, s, px);
}

/** A cream layer with piped bumps along its front. */
function creamLayer(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  const bumps = 7;
  const step = w / bumps;
  for (let i = 0; i < bumps; i++) {
    ctx.beginPath();
    ctx.arc(x + step * (i + 0.5), y + h / 2, Math.min(step, h) * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  for (let i = 0; i < bumps; i++) {
    ctx.beginPath();
    ctx.arc(x + step * (i + 0.4), y + h * 0.35, Math.min(step, h) * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- Paris-Brest ----------

/** Fixed spots for almond flakes on the top ring: [angle, size]. */
const ALMONDS: [number, number][] = [
  [-2.6, 1],
  [-2.0, 0.9],
  [-1.3, 1.1],
  [-0.6, 0.9],
  [-0.1, 1],
  [3.0, 0.9],
];

function parisBrest(ctx: Ctx, s: PastryStyle, lw: number, px: number): void {
  const g = s.glaze;

  // Bottom half of the choux ring
  ctx.fillStyle = BAKED.shade;
  ctx.strokeStyle = BAKED.edge;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(0, 0.22, 1, 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Piped cream rosettes all the way round, back ones first
  const rosettes: [number, number][] = [];
  const count = 14;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    rosettes.push([Math.cos(a) * 0.9, 0.06 + Math.sin(a) * 0.38]);
  }
  rosettes.sort((p, q) => p[1] - q[1]);
  for (const [x, y] of rosettes) {
    ctx.fillStyle = g.shell;
    ctx.strokeStyle = g.edge;
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath();
    ctx.arc(x, y, 0.21, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.beginPath();
    ctx.arc(x - 0.05, y - 0.06, 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  // Top half of the ring, with the cream showing through the hole
  ctx.fillStyle = BAKED.body;
  ctx.strokeStyle = BAKED.edge;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(0, -0.14, 0.88, 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = g.shell;
  ctx.strokeStyle = g.edge;
  ctx.beginPath();
  ctx.ellipse(0, -0.2, 0.32, 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Flaked almonds and a dusting of icing sugar
  for (const [a, size] of ALMONDS) {
    const x = Math.cos(a) * 0.62;
    const y = -0.16 + Math.sin(a) * 0.27;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = "#f6e2bd";
    ctx.strokeStyle = "#c89a5c";
    ctx.lineWidth = Math.max(0.025, px * 0.8);
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.1 * size, 0.055 * size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39;
    const d = 0.45 + (i % 4) * 0.1;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, -0.16 + Math.sin(a) * d * 0.42, 0.025, 0, Math.PI * 2);
    ctx.fill();
  }

  drawFace(ctx, 0, 0.1, 0.62, s, px);
}

// ---------- Saint-Honoré ----------

function saintHonore(ctx: Ctx, s: PastryStyle, lw: number, px: number): void {
  const g = s.glaze;
  // Chantilly is pale: only a hint of the flavour colour.
  const cream = mix(CREAM, g.shell, 0.3);

  // A choux puff at the back, peeking over the cream
  puff(ctx, 0, -0.36, 0.25, g, lw);

  // Piped cream drops in the classic Saint-Honoré zigzag, back row first
  const drops: [number, number, number][] = [
    [-0.36, -0.06, 0.4],
    [0, -0.12, -0.4],
    [0.36, -0.06, 0.4],
    [-0.18, 0.08, -0.4],
    [0.18, 0.08, 0.4],
  ];
  for (const [x, y, tilt] of drops) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.fillStyle = cream;
    ctx.strokeStyle = CREAM_EDGE;
    ctx.lineWidth = lw * 0.7;
    ctx.beginPath();
    ctx.moveTo(0, -0.3);
    ctx.bezierCurveTo(0.27, -0.14, 0.26, 0.18, 0, 0.19);
    ctx.bezierCurveTo(-0.26, 0.18, -0.27, -0.14, 0, -0.3);
    ctx.fill();
    ctx.stroke();
    // The groove from the notched nozzle
    ctx.strokeStyle = CREAM_EDGE;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -0.2);
    ctx.lineTo(0, 0.1);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Puff pastry base
  ctx.fillStyle = BAKED.body;
  ctx.strokeStyle = BAKED.edge;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(-1, 0.2, 2, 0.36, 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = BAKED.shade;
  ctx.fillRect(-0.96, 0.44, 1.92, 0.08);

  // Glazed choux puffs on the rim
  for (const x of [-0.7, 0.7]) puff(ctx, x, 0.02, 0.3, g, lw);

  drawFace(ctx, 0, 0.33, 0.6, s, px);
}

// ---------- Croquembouche ----------

function croquembouche(ctx: Ctx, s: PastryStyle, lw: number, px: number): void {
  const g = s.glaze;
  const rows: [number, number][] = [
    [4, 0.46],
    [3, 0.1],
    [2, -0.26],
    [1, -0.6],
  ];
  const pr = 0.27;
  for (const [count, y] of rows) {
    for (let i = 0; i < count; i++) {
      puff(ctx, (i - (count - 1) / 2) * 0.5, y, pr, g, lw * 0.9);
    }
  }

  // Spun caramel threads around the tower
  ctx.strokeStyle = "rgba(226, 160, 50, 0.85)";
  ctx.lineWidth = Math.max(0.03, px);
  ctx.beginPath();
  ctx.moveTo(-0.95, 0.55);
  ctx.bezierCurveTo(-0.3, 0.2, 0.4, 0.5, 0.9, 0.2);
  ctx.moveTo(-0.7, 0.05);
  ctx.bezierCurveTo(-0.2, -0.25, 0.3, 0.1, 0.65, -0.2);
  ctx.moveTo(-0.4, -0.4);
  ctx.bezierCurveTo(-0.1, -0.7, 0.2, -0.35, 0.35, -0.6);
  ctx.stroke();

  drawFace(ctx, 0, 0.12, 0.55, s, px);
}

/** A round choux puff with a coloured glaze cap. */
function puff(ctx: Ctx, x: number, y: number, r: number, g: Flavor, lw: number): void {
  const ball = new Path2D();
  ball.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = BAKED.body;
  ctx.fill(ball);
  ctx.save();
  ctx.clip(ball);
  ctx.fillStyle = BAKED.shade;
  ctx.fillRect(x - r, y + r * 0.45, r * 2, r);
  ctx.fillStyle = g.shell;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.45, r * 1.1, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = BAKED.edge;
  ctx.lineWidth = lw;
  ctx.stroke(ball);
  gloss(ctx, x - r * 0.35, y - r * 0.5, r * 0.28, r * 0.13, -0.5);
}

// ---------- Shared bits ----------

function gloss(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number): void {
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

/** A little face. `size` 1 is the full-size face; `px` is one screen pixel in units. */
function drawFace(ctx: Ctx, cx: number, cy: number, size: number, style: PastryStyle, px: number): void {
  const eyeX = 0.3 * size;
  const eyeR = Math.max(0.075 * size, px * 1.1);
  const line = Math.max(0.07 * size, px * 1.1);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = line;
  ctx.fillStyle = COLOR.face;
  ctx.strokeStyle = COLOR.face;

  // Rosy cheeks when happy or held
  if (style.mood !== "worried") {
    ctx.fillStyle = COLOR.blush;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 0.52 * size + cx, cy + 0.12 * size, 0.12 * size, 0.065 * size, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = COLOR.face;
  }

  for (const side of [-1, 1]) {
    const x = cx + side * eyeX;
    if (style.mood === "happy") {
      // Closed, smiling eyes: ^ ^
      ctx.beginPath();
      ctx.arc(x, cy + eyeR * 0.8, eyeR * 1.4, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (style.blinking) {
      ctx.beginPath();
      ctx.moveTo(x - eyeR, cy);
      ctx.lineTo(x + eyeR, cy);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, cy, style.mood === "held" ? eyeR * 1.25 : eyeR, 0, Math.PI * 2);
      ctx.fill();
      if (style.mood === "worried") {
        // Worried eyebrows, raised in the middle
        ctx.beginPath();
        ctx.moveTo(x - side * 0.1 * size, cy - 0.21 * size);
        ctx.lineTo(x + side * 0.07 * size, cy - 0.15 * size);
        ctx.stroke();
      }
    }
  }

  const my = cy + 0.16 * size;
  ctx.beginPath();
  if (style.mood === "happy") {
    ctx.arc(cx, my - 0.04 * size, 0.11 * size, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (style.mood === "held") {
    ctx.ellipse(cx, my + 0.02 * size, 0.06 * size, 0.075 * size, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A small wobbly worried mouth
    ctx.moveTo(cx - 0.1 * size, my + 0.03 * size);
    ctx.quadraticCurveTo(cx - 0.05 * size, my - 0.03 * size, cx, my + 0.02 * size);
    ctx.quadraticCurveTo(cx + 0.05 * size, my + 0.07 * size, cx + 0.1 * size, my);
    ctx.stroke();
  }
  ctx.restore();
}
