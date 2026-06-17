import { type Vec2, vec2, add, sub, scale, normalize, length, distance, angle, fromAngle } from './vector';
import { type Rect, randomPointInRect } from './collision';

/** Wandering pedestrian that flees from nearby threats (e.g. the player's car). */
export interface Pedestrian {
  pos: Vec2;
  heading: number;
  radius: number;
  state: 'wander' | 'flee';
  /** Current point the pedestrian is walking toward while wandering. */
  target: Vec2;
  /** Optional fixed destination for a special-case pedestrian returning home. */
  returningTo?: Vec2;
}

export interface PedestrianContext {
  /** Positions of dangers to flee from. */
  threats: readonly Vec2[];
  /** Map extent used when choosing a new wander target. */
  bounds: { width: number; height: number };
  /** Sidewalk strips a wandering pedestrian keeps to (omit for free roaming). */
  sidewalks?: readonly Rect[];
}

export const PED_WALK_SPEED = 32;
export const PED_FLEE_SPEED = 90;
/** A threat closer than this triggers fleeing. */
export const PANIC_RADIUS = 95;
/** Distance at which a wander target counts as reached. */
export const ARRIVE_RADIUS = 6;
/** A wandering pedestrian only hops to a sidewalk within this distance, so it
 * strolls along the pavement rather than beelining across town. */
export const SIDEWALK_HOP = 220;

/** Pick the next wander target: a nearby sidewalk point if sidewalks are given,
 * otherwise a free point anywhere in bounds. Pure (uses the injected RNG). */
export function wanderTarget(ctx: PedestrianContext, near: Vec2, rng: () => number): Vec2 {
  const walks = ctx.sidewalks;
  if (!walks || walks.length === 0) {
    return vec2(rng() * ctx.bounds.width, rng() * ctx.bounds.height);
  }
  const nearby = walks.filter((s) => distance(near, vec2(s.x + s.w / 2, s.y + s.h / 2)) <= SIDEWALK_HOP);
  const pool = nearby.length > 0 ? nearby : walks;
  const pick = pool[Math.floor(rng() * pool.length)] ?? pool[0];
  return randomPointInRect(pick, rng);
}

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
    target = wanderTarget(ctx, ped.pos, rng);
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
