import { distToSegment, segmentsIntersect, type Vec } from "./geometry.ts";

export type Edge = [number, number];

export interface Level {
  nodeCount: number;
  edges: Edge[];
  /** Starting positions, in 0..1 board space. */
  start: Vec[];
}

/**
 * Number of random lines used to build each level.
 * N lines give N*(N-1)/2 dots, so: 6, 10, 15, 21, 28, 36, 45 dots.
 */
const LINES_PER_LEVEL = [4, 5, 6, 7, 8, 9, 10];

export const LEVEL_COUNT = LINES_PER_LEVEL.length;

/** Small seeded random number generator, so each level is the same every time. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Line {
  p: Vec;
  d: Vec;
}

/**
 * Build a graph that is guaranteed to be untangle-able, the same way the
 * original Planarity game does it: draw some random lines, put a dot
 * wherever two lines cross, and join dots that are next to each other
 * along the same line.
 */
function buildGraph(lineCount: number, rng: () => number): { nodeCount: number; edges: Edge[] } {
  let lines: Line[] = [];

  // Pick lines with no two of them nearly parallel.
  for (let attempt = 0; ; attempt++) {
    lines = [];
    for (let i = 0; i < lineCount; i++) {
      const angle = rng() * Math.PI;
      lines.push({
        p: { x: rng(), y: rng() },
        d: { x: Math.cos(angle), y: Math.sin(angle) },
      });
    }
    let ok = true;
    for (let i = 0; i < lineCount && ok; i++) {
      for (let j = i + 1; j < lineCount && ok; j++) {
        const cross = lines[i].d.x * lines[j].d.y - lines[i].d.y * lines[j].d.x;
        if (Math.abs(cross) < 0.08) ok = false;
      }
    }
    if (ok || attempt > 1000) break;
  }

  // For every line, the dots on it and how far along the line they are.
  const onLine: { t: number; id: number }[][] = lines.map(() => []);
  let nodeCount = 0;

  for (let i = 0; i < lineCount; i++) {
    for (let j = i + 1; j < lineCount; j++) {
      const a = lines[i];
      const b = lines[j];
      const cross = a.d.x * b.d.y - a.d.y * b.d.x;
      const wx = b.p.x - a.p.x;
      const wy = b.p.y - a.p.y;
      const t = (wx * b.d.y - wy * b.d.x) / cross;
      const s = (wx * a.d.y - wy * a.d.x) / cross;
      const id = nodeCount++;
      onLine[i].push({ t, id });
      onLine[j].push({ t: s, id });
    }
  }

  const edges: Edge[] = [];
  for (const list of onLine) {
    list.sort((p, q) => p.t - q.t);
    for (let k = 0; k + 1 < list.length; k++) {
      edges.push([list[k].id, list[k + 1].id]);
    }
  }

  return { nodeCount, edges };
}

function countCrossings(points: Vec[], edges: Edge[]): number {
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const [c, d] = edges[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsIntersect(points[a], points[b], points[c], points[d])) count++;
    }
  }
  return count;
}

/** A dot closer than this to a line it isn't part of looks like it sits on that line (0..1 board units). */
const LINE_GAP = 0.025;

/** Shortest distance from p to any other point. */
function nearest(p: Vec, points: Vec[], skip: number): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    if (i !== skip) best = Math.min(best, Math.hypot(p.x - points[i].x, p.y - points[i].y));
  }
  return best;
}

const randomSpot = (rng: () => number): Vec => ({ x: 0.02 + rng() * 0.96, y: 0.02 + rng() * 0.96 });

/** Scatter dots at random, keeping every pair at least `gap` apart so none start hidden under another. */
function scatter(nodeCount: number, rng: () => number): Vec[] {
  let gap = Math.min(0.2, 0.62 / Math.sqrt(nodeCount));
  for (;;) {
    const points: Vec[] = [];
    for (let i = 0; i < nodeCount; i++) {
      for (let t = 0; t < 400; t++) {
        const p = randomSpot(rng);
        if (nearest(p, points, -1) >= gap) {
          points.push(p);
          break;
        }
      }
      if (points.length <= i) break;
    }
    if (points.length === nodeCount) return points;
    gap *= 0.9; // too crowded: relax and start again
  }
}

/**
 * Number of "dot sitting on a line" problems that involve dot v:
 * v on top of someone else's line, or someone else on top of v's lines.
 */
function lineConflicts(points: Vec[], edges: Edge[], edgesOf: number[][], v: number): number {
  let count = 0;
  for (const [a, b] of edges) {
    if (a !== v && b !== v && distToSegment(points[v], points[a], points[b]) < LINE_GAP) count++;
  }
  for (const e of edgesOf[v]) {
    const [a, b] = edges[e];
    for (let u = 0; u < points.length; u++) {
      if (u !== a && u !== b && distToSegment(points[u], points[a], points[b]) < LINE_GAP) count++;
    }
  }
  return count;
}

/** Number of crossings that involve one of dot v's lines. */
function crossingsOf(points: Vec[], edges: Edge[], edgesOf: number[][], v: number): number {
  let count = 0;
  for (const e of edgesOf[v]) {
    const [a, b] = edges[e];
    for (const [c, d] of edges) {
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsIntersect(points[a], points[b], points[c], points[d])) count++;
    }
  }
  return count;
}

/**
 * Move dots off lines they don't belong to (a dot on a line looks connected when it isn't).
 * Each move only ever lowers the number of problems, and the work is capped, so it is quick.
 * Among the spots that fix things, the one that keeps the most crossings is picked,
 * so tidying does not quietly make the level easier.
 * On the biggest levels a few may be left: the lines cover nearly the whole board there.
 */
function tidy(points: Vec[], edges: Edge[], rng: () => number): void {
  const n = points.length;
  const gap = Math.min(0.2, 0.62 / Math.sqrt(n)) * 0.8;
  const edgesOf: number[][] = Array.from({ length: n }, () => []);
  edges.forEach(([a, b], i) => {
    edgesOf[a].push(i);
    edgesOf[b].push(i);
  });

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let v = 0; v < n; v++) {
      let bestCount = lineConflicts(points, edges, edgesOf, v);
      if (bestCount === 0) continue;
      const original = points[v];
      let best = original;
      let bestCrossings = -1;
      for (let t = 0; t < 40; t++) {
        const p = randomSpot(rng);
        if (nearest(p, points, v) < gap) continue;
        points[v] = p;
        const count = lineConflicts(points, edges, edgesOf, v);
        if (count > bestCount) continue;
        const crossings = crossingsOf(points, edges, edgesOf, v);
        if (count < bestCount || crossings > bestCrossings) {
          best = p;
          bestCount = count;
          bestCrossings = crossings;
        }
      }
      points[v] = best;
      if (best !== original) changed = true;
    }
    if (!changed) break;
  }
}

/**
 * Starting layout: dots scattered at random over the board.
 * A few scatters are tried and the most tangled one is kept, so no level starts easy by luck.
 */
function tangledLayout(nodeCount: number, edges: Edge[], rng: () => number): Vec[] {
  const tries = Math.max(3, Math.ceil(60 / nodeCount));
  let best: Vec[] = [];
  let bestCrossings = -1;
  for (let i = 0; i < tries; i++) {
    const points = scatter(nodeCount, rng);
    const crossings = countCrossings(points, edges);
    if (crossings > bestCrossings) {
      best = points;
      bestCrossings = crossings;
    }
  }
  tidy(best, edges, rng);
  // Make sure the level does not start out already solved.
  if (countCrossings(best, edges) === 0) return tangledLayout(nodeCount, edges, rng);
  return best;
}

export function buildLevel(index: number): Level {
  const rng = mulberry32(1337 + index * 7919);
  const { nodeCount, edges } = buildGraph(LINES_PER_LEVEL[index], rng);
  const start = tangledLayout(nodeCount, edges, rng);
  return { nodeCount, edges, start };
}
