export interface Vec {
  x: number;
  y: number;
}

/** Which side of line a->b the point c is on (>0 left, <0 right, 0 on the line). */
function orient(a: Vec, b: Vec, c: Vec): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** True if p (already known to be on the line a-b) lies inside the segment's box. */
function withinBox(a: Vec, b: Vec, p: Vec): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  );
}

/** True if segment a-b and segment c-d touch or cross. */
export function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  if (o1 * o2 < 0 && o3 * o4 < 0) return true;

  // Rare cases where points are exactly on the other line.
  if (o1 === 0 && withinBox(a, b, c)) return true;
  if (o2 === 0 && withinBox(a, b, d)) return true;
  if (o3 === 0 && withinBox(c, d, a)) return true;
  if (o4 === 0 && withinBox(c, d, b)) return true;
  return false;
}

/** Shortest distance from point p to segment a-b. */
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
