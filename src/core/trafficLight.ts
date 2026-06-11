import type { Vec2 } from './vector';

/**
 * A city-wide traffic-light controller. Every intersection runs the same cycle:
 * horizontal (east-west) traffic gets a green phase, then a brief all-red gap,
 * then vertical (north-south) traffic, then another gap. Modelled as a single
 * looping clock so it is deterministic and trivially unit testable. NPC traffic
 * obeys it; the player is free to run red lights, GTA-style.
 */

/** Which travel axis a green light is currently serving. */
export type LightAxis = 'horizontal' | 'vertical';

/** Seconds each axis holds a green light. */
export const LIGHT_GREEN = 4;
/** Seconds of all-red between green phases (clears the box). */
export const LIGHT_GAP = 1;
/** Full cycle length: H green, gap, V green, gap. */
export const LIGHT_PERIOD = LIGHT_GREEN * 2 + LIGHT_GAP * 2;

export interface TrafficLights {
  /** Position within the cycle, in [0, LIGHT_PERIOD). */
  time: number;
}

export function createTrafficLights(time = 0): TrafficLights {
  return { time: ((time % LIGHT_PERIOD) + LIGHT_PERIOD) % LIGHT_PERIOD };
}

/** Advance the shared clock, wrapping at the end of the cycle. Pure. */
export function tickLights(lights: TrafficLights, dt: number): TrafficLights {
  return createTrafficLights(lights.time + dt);
}

/**
 * The axis currently showing green, or null during an all-red gap. Horizontal
 * goes first, then vertical half a cycle later.
 */
export function greenAxis(lights: TrafficLights): LightAxis | null {
  const t = lights.time;
  if (t < LIGHT_GREEN) return 'horizontal';
  if (t >= LIGHT_PERIOD / 2 && t < LIGHT_PERIOD / 2 + LIGHT_GREEN) return 'vertical';
  return null; // transition: everyone stops
}

/** The travel axis of a unit cardinal direction. */
export function axisOf(dir: Vec2): LightAxis {
  return dir.x !== 0 ? 'horizontal' : 'vertical';
}

/** Whether a vehicle travelling in `dir` has a green light right now. */
export function hasGreen(lights: TrafficLights, dir: Vec2): boolean {
  return greenAxis(lights) === axisOf(dir);
}
