import { clamp } from './math';

/** A simple health pool. Pure and engine-agnostic. */
export interface Health {
  current: number;
  max: number;
}

export function createHealth(max: number): Health {
  return { current: max, max };
}

export function isDead(h: Health): boolean {
  return h.current <= 0;
}

/** Apply damage, clamped at zero. Pure. */
export function damage(h: Health, amount: number): Health {
  return { ...h, current: clamp(h.current - amount, 0, h.max) };
}

/** Heal, clamped at the maximum. Pure. */
export function heal(h: Health, amount: number): Health {
  return { ...h, current: clamp(h.current + amount, 0, h.max) };
}

/** Fraction of health remaining, in [0, 1]. */
export function fraction(h: Health): number {
  return h.max === 0 ? 0 : h.current / h.max;
}
