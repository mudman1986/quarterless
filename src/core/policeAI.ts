import { type Vec2, add, sub, scale, normalize, length, distance, angle } from './vector';

/** A police unit that pursues a target position. */
export interface Police {
  pos: Vec2;
  heading: number;
  radius: number;
  /** Whether this unit is an officer on foot or a patrol car. */
  kind: 'foot' | 'car';
}

/** Base pursuit speed (px/s) of an officer on foot at one wanted star. */
export const POLICE_BASE_SPEED = 110;
/** Base pursuit speed (px/s) of a patrol car at one wanted star. */
export const POLICE_CAR_BASE_SPEED = 200;
/** Extra pursuit speed per additional wanted star. */
export const POLICE_SPEED_PER_STAR = 18;

/** Pursuit speed scales with the wanted level, so higher heat means faster cops. */
export function policeSpeedForStars(starCount: number, base = POLICE_BASE_SPEED): number {
  return base + Math.max(0, starCount - 1) * POLICE_SPEED_PER_STAR;
}

/** Pursuit speed for a unit of the given kind at the current wanted level. */
export function policeSpeedFor(kind: 'foot' | 'car', starCount: number): number {
  const base = kind === 'car' ? POLICE_CAR_BASE_SPEED : POLICE_BASE_SPEED;
  return policeSpeedForStars(starCount, base);
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
