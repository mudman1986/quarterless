/**
 * Pure 2D vector math. No engine dependencies — fully unit testable.
 * Vectors are plain immutable-style records; every operation returns a new value.
 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

export function distance(a: Vec2, b: Vec2): number {
  return length(sub(a, b));
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** Build a vector from an angle (radians) and a magnitude. */
export function fromAngle(radians: number, magnitude = 1): Vec2 {
  return { x: Math.cos(radians) * magnitude, y: Math.sin(radians) * magnitude };
}

/** Angle of the vector in radians, measured from the positive x-axis. */
export function angle(a: Vec2): number {
  return Math.atan2(a.y, a.x);
}

/** Limit a vector's magnitude to `max`, preserving direction. */
export function clampLength(a: Vec2, max: number): Vec2 {
  const len = length(a);
  return len <= max ? a : scale(normalize(a), max);
}

/** Linear interpolation between two vectors. `t` is clamped to [0, 1]. */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  const clamped = Math.max(0, Math.min(1, t));
  return { x: a.x + (b.x - a.x) * clamped, y: a.y + (b.y - a.y) * clamped };
}
