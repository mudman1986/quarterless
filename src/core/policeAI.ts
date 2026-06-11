import { type Vec2, add, sub, scale, normalize, length, distance, angle } from './vector';
import { type City } from './city';
import {
  type RoadVehicle,
  nearestCardinal,
  seekChooser,
  stepRoadVehicle,
} from './roadVehicle';
import { DEFAULT_CAR_TUNING } from './vehicle';
import { WALK_SPEED } from './entity';

/** A police unit that pursues a target position. */
export interface Police {
  pos: Vec2;
  heading: number;
  radius: number;
  /** Whether this unit is an officer on foot or a patrol car. */
  kind: 'foot' | 'car';
  /** Seconds until this unit can fire again (officers shoot at high heat). */
  fireCooldown?: number;
  /** Whether a patrol car has already dropped an officer to make an arrest. */
  deployed?: boolean;
}

/** Base pursuit speed (px/s) of an officer on foot at one wanted star. */
export const POLICE_BASE_SPEED = 110;
/** Base pursuit speed (px/s) of a patrol car at one wanted star. */
export const POLICE_CAR_BASE_SPEED = 230;
/** Extra pursuit speed per additional wanted star. */
export const POLICE_SPEED_PER_STAR = 18;
/** Patrol cars top out at the player car's maximum speed, so a clean getaway is
 * possible but a slow or cornered driver gets run down. */
export const POLICE_CAR_MAX_SPEED = DEFAULT_CAR_TUNING.maxSpeed;
/** Officers on foot never run faster than the player can, so a fleeing player is
 * never simply outpaced on foot (they can be cornered, but not outrun). */
export const POLICE_FOOT_MAX_SPEED = WALK_SPEED;

/** Pursuit speed scales with the wanted level, so higher heat means faster cops. */
export function policeSpeedForStars(starCount: number, base = POLICE_BASE_SPEED): number {
  return base + Math.max(0, starCount - 1) * POLICE_SPEED_PER_STAR;
}

/** Pursuit speed for a unit of the given kind at the current wanted level. A
 * patrol car is capped at the player car's max speed; an officer on foot is
 * capped at the player's own walking speed (see the MAX_SPEED constants). */
export function policeSpeedFor(kind: 'foot' | 'car', starCount: number): number {
  if (kind === 'car') {
    return Math.min(POLICE_CAR_MAX_SPEED, policeSpeedForStars(starCount, POLICE_CAR_BASE_SPEED));
  }
  return Math.min(POLICE_FOOT_MAX_SPEED, policeSpeedForStars(starCount, POLICE_BASE_SPEED));
}

/**
 * Advance a police unit one step, seeking the target. Pure: returns a new unit.
 * Stays put (only facing the target) once within its own radius of the target.
 */
export function stepPolice(
  police: Police,
  target: Vec2,
  dt: number,
  speed = POLICE_BASE_SPEED,
): Police {
  const toTarget = sub(target, police.pos);
  const dist = length(toTarget);
  if (dist === 0) return police;

  const dir = normalize(toTarget);
  const heading = angle(dir);
  if (dist <= police.radius) {
    return { ...police, heading };
  }

  const stepDist = Math.min(speed * dt, dist);
  return { ...police, pos: add(police.pos, scale(dir, stepDist)), heading };
}

/** Whether the police unit has reached (caught) the target. */
export function hasCaught(police: Police, target: Vec2): boolean {
  return distance(police.pos, target) <= police.radius;
}

/**
 * Advance a patrol car one step, chasing `target` along the road grid via the
 * shared {@link stepRoadVehicle} model (it follows lanes toward the target and
 * never cuts through buildings). Pure: returns a new unit.
 */
export function stepPoliceCar(
  police: Police,
  target: Vec2,
  city: City,
  dt: number,
  speed = POLICE_CAR_BASE_SPEED,
): Police {
  const v: RoadVehicle = {
    pos: police.pos,
    heading: police.heading,
    dir: nearestCardinal(police.heading),
  };
  const next = stepRoadVehicle(v, city, dt, speed, seekChooser(target));
  return { ...police, pos: next.pos, heading: next.heading };
}
