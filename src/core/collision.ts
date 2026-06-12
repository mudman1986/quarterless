import { type Vec2, vec2, sub, add, scale, length, normalize } from './vector';
import { clamp } from './math';

/** Axis-aligned rectangle (top-left origin). Used for buildings/walls. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

/** The point on (or inside) a rect closest to `p`. */
export function closestPointOnRect(p: Vec2, r: Rect): Vec2 {
  return vec2(clamp(p.x, r.x, r.x + r.w), clamp(p.y, r.y, r.y + r.h));
}

/** Whether a circle overlaps a rect. */
export function circleIntersectsRect(pos: Vec2, radius: number, r: Rect): boolean {
  return length(sub(pos, closestPointOnRect(pos, r))) < radius;
}

/** Whether a point lies on or inside a rect (edges count as inside). */
export function pointInRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * Whether the segment from `a` to `b` touches a rect (a point inside counts).
 * Liang–Barsky clipping against the rect's slabs. Used for line-of-sight checks
 * (e.g. whether a building blocks an officer's straight run at the player). Pure.
 */
export function segmentIntersectsRect(a: Vec2, b: Vec2, r: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  // Clip the parametric segment a + t*(b-a) against one slab: keeps p*t <= q.
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0; // parallel to this slab: inside iff q >= 0
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  const accepted =
    clip(-dx, a.x - r.x) &&
    clip(dx, r.x + r.w - a.x) &&
    clip(-dy, a.y - r.y) &&
    clip(dy, r.y + r.h - a.y);
  return accepted && t0 <= t1;
}


/** A uniformly random point inside a rect, using the injected RNG. Pure. */
export function randomPointInRect(r: Rect, rng: () => number): Vec2 {
  return vec2(r.x + rng() * r.w, r.y + rng() * r.h);
}

/**
 * Push a circle out of a rect along the shortest axis if they overlap.
 * Returns the corrected centre position (unchanged when there is no overlap).
 */
export function resolveCircleRect(pos: Vec2, radius: number, r: Rect): Vec2 {
  const closest = closestPointOnRect(pos, r);
  const delta = sub(pos, closest);
  const dist = length(delta);

  if (dist >= radius) return pos;

  // Centre is inside the rect: eject through the nearest edge.
  if (dist === 0) {
    const left = pos.x - r.x;
    const right = r.x + r.w - pos.x;
    const top = pos.y - r.y;
    const bottom = r.y + r.h - pos.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) return vec2(r.x - radius, pos.y);
    if (min === right) return vec2(r.x + r.w + radius, pos.y);
    if (min === top) return vec2(pos.x, r.y - radius);
    return vec2(pos.x, r.y + r.h + radius);
  }

  return add(pos, scale(normalize(delta), radius - dist));
}

/** Resolve a circle against many rects in sequence. */
export function resolveCircleRects(pos: Vec2, radius: number, rects: readonly Rect[]): Vec2 {
  return rects.reduce((p, r) => resolveCircleRect(p, radius, r), pos);
}

/** A circular obstacle (e.g. a car) used for circle-vs-circle resolution. */
export interface Circle {
  readonly pos: Vec2;
  readonly radius: number;
}

/**
 * Push a moving circle out of a static circle obstacle if they overlap. The
 * moving circle is ejected along the line joining the centres until the two
 * just touch. When the centres coincide it is pushed along +x by an arbitrary
 * but stable direction. Pure: returns the corrected centre position (unchanged
 * when there is no overlap).
 */
export function resolveCircleCircle(pos: Vec2, radius: number, obstacle: Circle): Vec2 {
  const delta = sub(pos, obstacle.pos);
  const dist = length(delta);
  const minDist = radius + obstacle.radius;
  if (dist >= minDist) return pos;
  if (dist === 0) return vec2(obstacle.pos.x + minDist, obstacle.pos.y);
  return add(pos, scale(normalize(delta), minDist - dist));
}

/** Resolve a moving circle against many circle obstacles in sequence. */
export function resolveCircleCircles(
  pos: Vec2,
  radius: number,
  obstacles: readonly Circle[],
): Vec2 {
  return obstacles.reduce((p, o) => resolveCircleCircle(p, radius, o), pos);
}
