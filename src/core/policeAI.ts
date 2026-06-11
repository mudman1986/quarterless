import { type Vec2, vec2, add, sub, scale, normalize, length, distance, dot, angle } from './vector';
import { type City, tileCenter } from './city';
import { tileCoord, roadAt, openDirections } from './trafficAI';
import { DEFAULT_CAR_TUNING } from './vehicle';

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

/** Pursuit speed scales with the wanted level, so higher heat means faster cops. */
export function policeSpeedForStars(starCount: number, base = POLICE_BASE_SPEED): number {
  return base + Math.max(0, starCount - 1) * POLICE_SPEED_PER_STAR;
}

/** Pursuit speed for a unit of the given kind at the current wanted level. A
 * patrol car is capped at the player car's max speed (see {@link POLICE_CAR_MAX_SPEED}). */
export function policeSpeedFor(kind: 'foot' | 'car', starCount: number): number {
  if (kind === 'car') {
    return Math.min(POLICE_CAR_MAX_SPEED, policeSpeedForStars(starCount, POLICE_CAR_BASE_SPEED));
  }
  return policeSpeedForStars(starCount, POLICE_BASE_SPEED);
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

/** The cardinal direction nearest to a heading (radians). */
function nearestCardinal(heading: number): Vec2 {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return Math.abs(c) >= Math.abs(s) ? vec2(Math.sign(c) || 1, 0) : vec2(0, Math.sign(s) || 1);
}

/**
 * Advance a patrol car one step, chasing `target` along the road grid. The car
 * drives forward in its current cardinal direction; on entering a new tile it
 * turns onto whichever open road heads most directly toward the target (and
 * reverses at a dead end), snapping to lane centres so it never cuts through a
 * building. Pure: returns a new unit.
 */
export function stepPoliceCar(
  police: Police,
  target: Vec2,
  city: City,
  dt: number,
  speed = POLICE_CAR_BASE_SPEED,
): Police {
  const spec = city.spec;
  let dir = nearestCardinal(police.heading);

  const before = tileCoord(spec, police.pos);
  let pos = add(police.pos, scale(dir, speed * dt));
  const after = tileCoord(spec, pos);

  if (after.tx !== before.tx || after.ty !== before.ty) {
    // Decide turns from the tile we are entering, or the current one if that is
    // off the road network.
    const tile = roadAt(city, after.tx, after.ty) ? after : before;
    const options = openDirections(city, tile.tx, tile.ty);
    const center = tileCenter(spec, tile.tx, tile.ty);
    const toTarget = sub(target, center);
    if (options.length > 0) {
      dir = options.reduce((best, d) => (dot(d, toTarget) > dot(best, toTarget) ? d : best), options[0]);
    } else {
      dir = vec2(-dir.x, -dir.y); // dead end: turn back
    }
    pos = center; // pivot cleanly on the lane centre
  }

  return { ...police, pos, heading: angle(dir) };
}
