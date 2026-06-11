import { type Vec2, vec2, add, sub, scale, dot, angle } from './vector';
import { type City, type CitySpec, tileCenter } from './city';
import type { Car } from './vehicle';

/** A simple NPC driver that keeps a car moving along the road grid. */
export interface TrafficAI {
  /** Unit cardinal direction the car is currently travelling. */
  dir: Vec2;
  /** Seconds spent waiting behind an obstacle. */
  wait?: number;
  /** Cosmetic/behavioural flavour. */
  style?: 'civilian' | 'ambulance';
}

/** Cruising speed (px/s) of NPC traffic. */
export const TRAFFIC_SPEED = 130;
/** Chance an NPC turns onto a crossing road when it reaches an intersection. */
export const TRAFFIC_TURN_CHANCE = 0.35;

/** Distance (px) ahead within which an NPC car brakes for an obstacle. */
export const YIELD_DISTANCE = 70;
/** Half-width (px) of the lane an NPC car watches for obstacles. */
export const YIELD_LANE_HALF = 26;

/** The four cardinal travel directions. */
export const CARDINALS: readonly Vec2[] = [
  vec2(1, 0),
  vec2(-1, 0),
  vec2(0, 1),
  vec2(0, -1),
];

/** Tile coordinate containing a pixel position. */
export function tileCoord(spec: CitySpec, pos: Vec2): { tx: number; ty: number } {
  return { tx: Math.floor(pos.x / spec.tile), ty: Math.floor(pos.y / spec.tile) };
}

function inBounds(spec: CitySpec, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < spec.cols && ty < spec.rows;
}

/** Whether a tile exists on the map and is a road lane. */
export function roadAt(city: City, tx: number, ty: number): boolean {
  return inBounds(city.spec, tx, ty) && city.isRoad(tx, ty);
}

function isOpposite(a: Vec2, b: Vec2): boolean {
  return a.x === -b.x && a.y === -b.y;
}

function isSame(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Cardinal directions from a tile that lead onto another road tile. */
export function openDirections(city: City, tx: number, ty: number): Vec2[] {
  return CARDINALS.filter((d) => roadAt(city, tx + d.x, ty + d.y));
}

/** Pick a perpendicular route for a waiting driver trying to go around a blocker. */
export function chooseDetour(city: City, tx: number, ty: number, dir: Vec2, rng: () => number): Vec2 {
  const options = openDirections(city, tx, ty).filter((d) => !isSame(d, dir) && !isOpposite(d, dir));
  if (options.length > 0) return options[Math.floor(rng() * options.length)] ?? options[0];
  return vec2(-dir.x, -dir.y);
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
    const lateral = Math.abs(rel.x * dir.y - rel.y * dir.x);
    return lateral <= laneHalf;
  });
}

/**
 * Advance an NPC-driven car one step along the road grid. The car drives
 * forward at `speed`; when it crosses into a new tile it may turn onto a
 * crossing road (and must turn if the road ahead ends), snapping to the tile
 * centre so it stays in its lane and never drives into a building. Pure:
 * returns a new car and driver state.
 */
export function stepTraffic(
  car: Car,
  ai: TrafficAI,
  city: City,
  dt: number,
  speed = TRAFFIC_SPEED,
  rng: () => number = Math.random,
): { car: Car; ai: TrafficAI } {
  const spec = city.spec;
  let dir = ai.dir;

  const before = tileCoord(spec, car.pos);
  let pos = add(car.pos, scale(dir, speed * dt));
  const after = tileCoord(spec, pos);

  if (after.tx !== before.tx || after.ty !== before.ty) {
    if (!roadAt(city, after.tx, after.ty)) {
      const perpendicular = openDirections(city, before.tx, before.ty).filter(
        (d) => !isSame(d, dir) && !isOpposite(d, dir),
      );
      dir = perpendicular.length > 0 ? (perpendicular[Math.floor(rng() * perpendicular.length)] ?? dir) : vec2(-dir.x, -dir.y);
      pos = tileCenter(spec, before.tx, before.ty);
    } else {
      const turns = openDirections(city, after.tx, after.ty).filter(
        (d) => !isSame(d, dir) && !isOpposite(d, dir),
      );
      if (turns.length > 0 && rng() < TRAFFIC_TURN_CHANCE) {
        dir = turns[Math.floor(rng() * turns.length)] ?? dir;
        pos = tileCenter(spec, after.tx, after.ty);
      }
    }
  }

  return { car: { ...car, pos, heading: angle(dir), speed }, ai: { ...ai, dir } };
}
