import { type Vec2, vec2, add, sub, scale, normalize, length, distance, angle, fromAngle } from './vector';

/** Wandering pedestrian that flees from nearby threats (e.g. the player's car). */
export interface Pedestrian {
  pos: Vec2;
  heading: number;
  radius: number;
  state: 'wander' | 'flee';
  /** Current point the pedestrian is walking toward while wandering. */
  target: Vec2;
}

export interface PedestrianContext {
  /** Positions of dangers to flee from. */
  threats: readonly Vec2[];
  /** Map extent used when choosing a new wander target. */
  bounds: { width: number; height: number };
}

export const PED_WALK_SPEED = 32;
export const PED_FLEE_SPEED = 90;
/** A threat closer than this triggers fleeing. */
export const PANIC_RADIUS = 95;
/** Distance at which a wander target counts as reached. */
export const ARRIVE_RADIUS = 6;

function nearestThreat(p: Vec2, threats: readonly Vec2[]): Vec2 | null {
  let best: Vec2 | null = null;
  let bestDist = Infinity;
  for (const t of threats) {
    const d = distance(p, t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

/**
 * Advance a pedestrian by one step. Pure: returns a new pedestrian.
 * Flees directly away from the nearest threat inside PANIC_RADIUS; otherwise
 * wanders toward its target, picking a fresh random target on arrival. The RNG
 * is injectable so tests stay deterministic.
 */
export function stepPedestrian(
  ped: Pedestrian,
  ctx: PedestrianContext,
  dt: number,
  rng: () => number = Math.random,
): Pedestrian {
  const threat = nearestThreat(ped.pos, ctx.threats);
  if (threat && distance(ped.pos, threat) < PANIC_RADIUS) {
    let dir = sub(ped.pos, threat);
    if (length(dir) === 0) dir = fromAngle(ped.heading);
    dir = normalize(dir);
    return {
      ...ped,
      state: 'flee',
      pos: add(ped.pos, scale(dir, PED_FLEE_SPEED * dt)),
      heading: angle(dir),
    };
  }

  let target = ped.target;
  if (distance(ped.pos, target) <= ARRIVE_RADIUS) {
    target = vec2(rng() * ctx.bounds.width, rng() * ctx.bounds.height);
  }

  const toTarget = sub(target, ped.pos);
  if (length(toTarget) === 0) {
    return { ...ped, state: 'wander', target };
  }
  const dir = normalize(toTarget);
  return {
    ...ped,
    state: 'wander',
    target,
    pos: add(ped.pos, scale(dir, PED_WALK_SPEED * dt)),
    heading: angle(dir),
  };
}
