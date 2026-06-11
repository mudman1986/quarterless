import { type Vec2, vec2, add, sub, scale, fromAngle, normalize, length, dot } from './vector';
import { clamp, approachZero } from './math';
import { type Rect, resolveCircleRects } from './collision';
import type { Controls } from './types';

/** A drivable car using a simple top-down arcade handling model. */
export interface Car {
  pos: Vec2;
  /** Direction the car points, in radians. */
  heading: number;
  /** Signed speed along `heading` in px/s. Negative means reversing. */
  speed: number;
  /** Collision radius. */
  radius: number;
  /** Optional hit points used for shootable/exploding cars. */
  hp?: number;
  /** Seconds of explosion/wreck state remaining. */
  wreckTimer?: number;
  /** Whether the car is meant to stay parked until someone takes it. */
  parked?: boolean;
  /** Cosmetic subtype used by the renderer. */
  kind?: 'civilian' | 'ambulance';
}

export interface CarTuning {
  /** Forward acceleration (px/s^2). */
  enginePower: number;
  /** Deceleration when braking while moving forward (px/s^2). */
  brakePower: number;
  /** Acceleration into reverse from a stop (px/s^2). */
  reversePower: number;
  /** Passive deceleration when coasting (px/s^2). */
  drag: number;
  maxSpeed: number;
  maxReverseSpeed: number;
  /** Turn rate (rad/s) at full grip. */
  turnRate: number;
  /** Speed at which steering becomes fully effective (px/s). */
  gripSpeed: number;
}

export const DEFAULT_CAR_TUNING: CarTuning = {
  enginePower: 220,
  brakePower: 320,
  reversePower: 160,
  drag: 120,
  maxSpeed: 320,
  maxReverseSpeed: 120,
  turnRate: 2.6,
  gripSpeed: 80,
};

/**
 * Advance a car by one step. Pure: returns a new car.
 * Throttle accelerates; brake slows then reverses; coasting applies drag.
 * Steering effectiveness scales with speed and inverts when reversing, so the
 * car handles intuitively in both directions.
 */
export function stepCar(
  car: Car,
  c: Controls,
  dt: number,
  tuning: CarTuning = DEFAULT_CAR_TUNING,
): Car {
  let speed = car.speed;

  if (c.up && !c.down) {
    speed += tuning.enginePower * dt;
  } else if (c.down && !c.up) {
    speed -= (speed > 0 ? tuning.brakePower : tuning.reversePower) * dt;
  } else {
    speed = approachZero(speed, tuning.drag * dt);
  }
  speed = clamp(speed, -tuning.maxReverseSpeed, tuning.maxSpeed);

  const steer = (c.right ? 1 : 0) - (c.left ? 1 : 0);
  const grip = clamp(Math.abs(speed) / tuning.gripSpeed, 0, 1);
  const direction = Math.sign(speed) || 1;
  const heading = car.heading + steer * tuning.turnRate * grip * direction * dt;

  return {
    ...car,
    heading,
    speed,
    pos: add(car.pos, scale(fromAngle(heading, speed), dt)),
  };
}

/** Treat a wall contact closer to head-on than this (by |cos|) as a full stop. */
const HEAD_ON_THRESHOLD = 1e-6;

/**
 * Fraction of speed a car keeps after striking a wall, given its travel
 * direction and the wall's outward normal. A head-on impact (travel directly
 * opposite the normal) keeps nothing; a glancing impact keeps almost all of its
 * speed, letting the car slide along the wall. Pure.
 */
export function carWallRetention(travelDir: Vec2, outwardNormal: Vec2): number {
  // `into` is 1 for a head-on hit and 0 for a parallel graze.
  const into = clamp(-dot(travelDir, outwardNormal), 0, 1);
  return 1 - into * into;
}

/**
 * Resolve a car against walls. Pushes it out of any overlap and scales its speed
 * by {@link carWallRetention}, so driving straight into a wall stops the car
 * while clipping one at an angle bleeds off only some speed. Pure: returns a new
 * car.
 */
export function collideCarWithWalls(car: Car, walls: readonly Rect[]): Car {
  const resolved = resolveCircleRects(car.pos, car.radius, walls);
  const pushOut = sub(resolved, car.pos);
  if (length(pushOut) <= HEAD_ON_THRESHOLD) return car; // no contact
  if (car.speed === 0) return { ...car, pos: resolved };

  const normal = normalize(pushOut);
  const travelDir = scale(fromAngle(car.heading), Math.sign(car.speed));
  return { ...car, pos: resolved, speed: car.speed * carWallRetention(travelDir, normal) };
}

/**
 * Resolve a collision between two cars. If their circles overlap, pushes them
 * apart equally and bleeds off the speed each carries into the other (a head-on
 * shunt stops; a glancing touch barely slows), so cars block one another
 * instead of driving straight through. Pure: returns the updated pair.
 */
export function collideCars(a: Car, b: Car): [Car, Car] {
  const delta = sub(a.pos, b.pos);
  const dist = length(delta);
  const overlap = a.radius + b.radius - dist;
  if (overlap <= 0) return [a, b];

  const normalA = dist === 0 ? vec2(1, 0) : normalize(delta); // points from b toward a
  const push = scale(normalA, overlap / 2);
  const travel = (car: Car): Vec2 => scale(fromAngle(car.heading), Math.sign(car.speed) || 1);

  return [
    { ...a, pos: add(a.pos, push), speed: a.speed * carWallRetention(travel(a), normalA) },
    { ...b, pos: sub(b.pos, push), speed: b.speed * carWallRetention(travel(b), scale(normalA, -1)) },
  ];
}
