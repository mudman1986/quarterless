import { type Vec2, add, scale, fromAngle, distance } from './vector';

/** A fired projectile travelling in a straight line. */
export interface Bullet {
  pos: Vec2;
  velocity: Vec2;
  /** Remaining lifetime in seconds. */
  life: number;
  damage: number;
}

/** A weapon with a fire rate, ammo, and projectile parameters. */
export interface Weapon {
  /** Seconds between shots. */
  cooldown: number;
  /** Time left until the weapon can fire again. */
  heat: number;
  ammo: number;
  damage: number;
  bulletSpeed: number;
  /** Projectile lifetime in seconds (defines range). */
  bulletLife: number;
}

export interface PistolOptions {
  ammo?: number;
  cooldown?: number;
  damage?: number;
  bulletSpeed?: number;
  bulletLife?: number;
}

export function createPistol(opts: PistolOptions = {}): Weapon {
  return {
    cooldown: opts.cooldown ?? 0.35,
    heat: 0,
    ammo: opts.ammo ?? 24,
    damage: opts.damage ?? 25,
    bulletSpeed: opts.bulletSpeed ?? 520,
    bulletLife: opts.bulletLife ?? 1.2,
  };
}

export function canFire(w: Weapon): boolean {
  return w.heat <= 0 && w.ammo > 0;
}

/** Reduce weapon cooldown over time. Pure. */
export function cool(w: Weapon, dt: number): Weapon {
  return w.heat <= 0 ? w : { ...w, heat: Math.max(0, w.heat - dt) };
}

export interface FireResult {
  weapon: Weapon;
  bullet: Bullet | null;
}

/**
 * Attempt to fire from `origin` toward `heading` (radians). Returns the updated
 * weapon and a bullet if a shot was produced (null when on cooldown or empty).
 * Pure.
 */
export function fire(w: Weapon, origin: Vec2, heading: number): FireResult {
  if (!canFire(w)) return { weapon: w, bullet: null };
  return {
    weapon: { ...w, heat: w.cooldown, ammo: w.ammo - 1 },
    bullet: {
      pos: origin,
      velocity: fromAngle(heading, w.bulletSpeed),
      life: w.bulletLife,
      damage: w.damage,
    },
  };
}

/** Advance a bullet; returns null once its life expires. Pure. */
export function stepBullet(b: Bullet, dt: number): Bullet | null {
  const life = b.life - dt;
  if (life <= 0) return null;
  return { ...b, pos: add(b.pos, scale(b.velocity, dt)), life };
}

/** Whether a bullet hits a circular target. */
export function bulletHits(b: Bullet, targetPos: Vec2, targetRadius: number): boolean {
  return distance(b.pos, targetPos) <= targetRadius;
}
