import { clamp } from './math';

/**
 * GTA-style wanted level driven by a continuous "heat" value. Committing crimes
 * adds heat; heat decays over time. Stars are derived from heat thresholds.
 * Pure and deterministic — fully unit testable.
 */
export const MAX_STARS = 6;
/** Heat required per additional star. */
export const HEAT_PER_STAR = 100;
/** Default heat lost per second when no crimes are committed. */
export const DEFAULT_DECAY_RATE = 8;

/** Heat awarded for specific crimes. Tuned so each maps to a meaningful star jump. */
export const CRIME_HEAT = {
  hitPedestrian: 120,
  hitPolice: 250,
} as const;

export interface WantedState {
  /** Continuous heat value, in [0, MAX_STARS * HEAT_PER_STAR]. */
  heat: number;
}

const MAX_HEAT = MAX_STARS * HEAT_PER_STAR;

export function createWanted(): WantedState {
  return { heat: 0 };
}

/** Current star rating derived from heat. */
export function stars(state: WantedState): number {
  return clamp(Math.floor(state.heat / HEAT_PER_STAR), 0, MAX_STARS);
}

export function isWanted(state: WantedState): boolean {
  return stars(state) > 0;
}

/** Add heat (e.g. after a crime), clamped to the maximum. Pure. */
export function addHeat(state: WantedState, amount: number): WantedState {
  return { heat: clamp(state.heat + amount, 0, MAX_HEAT) };
}

/** Reduce heat over time, never below zero. Pure. */
export function decay(state: WantedState, dt: number, rate = DEFAULT_DECAY_RATE): WantedState {
  return { heat: Math.max(0, state.heat - rate * dt) };
}
