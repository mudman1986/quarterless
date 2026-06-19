import { type Vec2, sub, dot } from './vector';
import { type City } from './city';
import type { Car } from './vehicle';
import {
  type RoadVehicle,
  laneCentersForRoad,
  roadAt,
  seekChooser,
  wanderChooser,
  stepRoadVehicle,
} from './roadVehicle';

// Re-exported so existing callers keep importing the road-grid helpers from
// here; they now live in the shared roadVehicle module.
export { CARDINALS, tileCoord, roadAt, openDirections, laneCross } from './roadVehicle';

/** A simple NPC driver that keeps a car moving along the road grid. */
export interface TrafficAI {
  /** Unit cardinal direction the car is currently travelling. */
  dir: Vec2;
  /** Seconds the car has been blocked by an obstacle (drives a reroute). */
  blocked?: number;
  /** Cross-travel coordinate of the lane it is committing to during a lane
   * change, or undefined when it is simply keeping its current lane. */
  laneTarget?: number;
  /** Temporary road target while a panicked driver is trying to get away. */
  escapeTarget?: Vec2;
  /** Temporary road target while following a specific route, such as a taxi fare. */
  routeTarget?: Vec2;
}

/** Cruising speed (px/s) of NPC traffic. */
export const TRAFFIC_SPEED = 130;
/** Chance an NPC turns onto a crossing road when it reaches an intersection. */
export const TRAFFIC_TURN_CHANCE = 0.35;

/** Distance (px) ahead within which an NPC car brakes for an obstacle. */
export const YIELD_DISTANCE = 70;
/** Half-width (px) of the lane an NPC car watches for obstacles. */
export const YIELD_LANE_HALF = 26;

/** Whether a road tile is an intersection (a road row crossing a road column). */
export function isIntersection(city: City, tx: number, ty: number): boolean {
  const { block } = city.spec;
  const roadWidth = Math.max(1, Math.min(block, city.spec.roadWidth ?? 1));
  return roadAt(city, tx, ty) && tx % block < roadWidth && ty % block < roadWidth;
}

/**
 * Whether any obstacle lies in the car's path: ahead of it (along `dir`) within
 * `ahead` px and no more than `laneHalf` px to either side. NPC traffic brakes
 * for these so it slows for pedestrians or the player rather than driving
 * through them. `dir` is assumed to be a unit vector. Pure.
 */
export function obstacleAhead(
  carPos: Vec2,
  dir: Vec2,
  obstacles: readonly Vec2[],
  ahead = YIELD_DISTANCE,
  laneHalf = YIELD_LANE_HALF,
): boolean {
  return obstacles.some((o) => {
    const rel = sub(o, carPos);
    const forward = dot(rel, dir);
    if (forward <= 0 || forward > ahead) return false;
    const lateral = Math.abs(rel.x * dir.y - rel.y * dir.x); // |rel x dir|, dir is unit
    return lateral <= laneHalf;
  });
}

/** The nearest clear same-direction lane centre this car can hop to, if any. */
export function laneChangeTarget(
  city: City,
  carPos: Vec2,
  dir: Vec2,
  obstacles: readonly Vec2[],
  ahead = YIELD_DISTANCE,
  laneHalf = YIELD_LANE_HALF,
): Vec2 | null {
  const lanes = laneCentersForRoad(city, carPos, dir);
  const sameLane = lanes[0];
  const isSameLane = (candidate: Vec2): boolean =>
    dir.x !== 0 ? Math.abs(candidate.y - sameLane.y) < 0.5 : Math.abs(candidate.x - sameLane.x) < 0.5;
  for (const lane of lanes) {
    if (isSameLane(lane)) continue;
    if (!obstacleAhead(lane, dir, obstacles, ahead, laneHalf)) return lane;
  }
  return null;
}

/**
 * Advance an NPC-driven car one step along the road grid, cruising and turning
 * at intersections via the shared {@link stepRoadVehicle} model. Pure: returns a
 * new car and driver state.
 */
export function stepTraffic(
  car: Car,
  ai: TrafficAI,
  city: City,
  dt: number,
  speed = TRAFFIC_SPEED,
  rng: () => number = Math.random,
): { car: Car; ai: TrafficAI } {
  const v: RoadVehicle = { pos: car.pos, heading: car.heading, dir: ai.dir };
  const chooser = ai.escapeTarget
    ? seekChooser(ai.escapeTarget)
    : ai.routeTarget
      ? seekChooser(ai.routeTarget)
      : wanderChooser(rng, TRAFFIC_TURN_CHANCE);
  const next = stepRoadVehicle(v, city, dt, speed, chooser, ai.laneTarget);
  return {
    car: { ...car, pos: next.pos, heading: next.heading, speed },
    ai: { ...ai, dir: next.dir },
  };
}
