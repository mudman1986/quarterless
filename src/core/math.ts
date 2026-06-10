/** Scalar math helpers shared across the pure game core. */

/** Clamp a value to the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Move `value` toward zero by `amount`, without overshooting. */
export function approachZero(value: number, amount: number): number {
  if (value > 0) return Math.max(0, value - amount);
  if (value < 0) return Math.min(0, value + amount);
  return 0;
}

/**
 * Wrap `value` into the half-open range [0, max), as on a looping (toroidal)
 * map: leaving one edge brings you back on the opposite one.
 */
export function wrap(value: number, max: number): number {
  if (max <= 0) return 0;
  return ((value % max) + max) % max;
}
