import { segmentsIntersect, type Vec } from "./geometry.ts";

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

/** Put the dots on a circle in a shuffled order, which tangles them up nicely. */
function scrambledCircle(nodeCount: number, edges: Edge[], rng: () => number): Vec[] {
  for (let attempt = 0; ; attempt++) {
    const order = Array.from({ length: nodeCount }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const points: Vec[] = new Array(nodeCount);
    order.forEach((node, slot) => {
      const angle = (slot / nodeCount) * Math.PI * 2 - Math.PI / 2;
      points[node] = { x: 0.5 + 0.45 * Math.cos(angle), y: 0.5 + 0.45 * Math.sin(angle) };
    });

    // Make sure the level does not start out already solved.
    if (countCrossings(points, edges) > 0 || attempt > 100) return points;
  }
}

export function buildLevel(index: number): Level {
  const rng = mulberry32(1337 + index * 7919);
  const { nodeCount, edges } = buildGraph(LINES_PER_LEVEL[index], rng);
  const start = scrambledCircle(nodeCount, edges, rng);
  return { nodeCount, edges, start };
}
