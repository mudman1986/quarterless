import { type Vec2, vec2, add, scale, normalize, length } from './vector';
import type { Controls } from './types';

/** A character moving around on foot. */
export interface OnFootActor {
  pos: Vec2;
  /** Facing direction in radians. */
  angle: number;
  /** Collision radius. */
  radius: number;
}

/** Default walking speed in pixels per second. Matches a foot officer's base
 * pursuit speed so the player can run alongside (and just outpace) the law. */
export const WALK_SPEED = 110;

/** Raw movement direction from directional controls (not normalized). */
export function controlDirection(c: Controls): Vec2 {
  const x = (c.right ? 1 : 0) - (c.left ? 1 : 0);
  const y = (c.down ? 1 : 0) - (c.up ? 1 : 0);
  return vec2(x, y);
}

/**
 * Advance an actor by walking according to controls. Pure: returns a new actor.
 * Diagonal movement is normalized so it is not faster than cardinal movement.
 * When no direction is pressed the actor keeps its position and facing.
 */
export function walk(
  actor: OnFootActor,
  c: Controls,
  dt: number,
  speed = WALK_SPEED,
): OnFootActor {
  const dir = controlDirection(c);
  if (length(dir) === 0) return actor;

  const velocity = scale(normalize(dir), speed);
  return {
    ...actor,
    pos: add(actor.pos, scale(velocity, dt)),
    angle: Math.atan2(velocity.y, velocity.x),
  };
}
