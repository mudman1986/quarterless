import { describe, it, expect } from 'vitest';
import {
  createPistol,
  canFire,
  cool,
  fire,
  stepBullet,
  bulletHits,
} from './weapon';
import { vec2 } from './vector';

describe('createPistol', () => {
  it('starts loaded and ready to fire', () => {
    const w = createPistol();
    expect(w.ammo).toBeGreaterThan(0);
    expect(canFire(w)).toBe(true);
  });
});

describe('fire', () => {
  it('produces a bullet, consumes ammo, and goes on cooldown', () => {
    const { weapon, bullet } = fire(createPistol({ ammo: 5 }), vec2(0, 0), 0);
    expect(bullet).not.toBeNull();
    expect(weapon.ammo).toBe(4);
    expect(canFire(weapon)).toBe(false); // now hot
  });

  it('aims the bullet along the heading', () => {
    const { bullet } = fire(createPistol(), vec2(0, 0), Math.PI / 2);
    expect(bullet!.velocity.x).toBeCloseTo(0);
    expect(bullet!.velocity.y).toBeGreaterThan(0);
  });

  it('cannot fire while on cooldown', () => {
    const first = fire(createPistol(), vec2(0, 0), 0);
    const second = fire(first.weapon, vec2(0, 0), 0);
    expect(second.bullet).toBeNull();
    expect(second.weapon.ammo).toBe(first.weapon.ammo); // no ammo wasted
  });

  it('cannot fire with no ammo', () => {
    const { weapon, bullet } = fire(createPistol({ ammo: 0 }), vec2(0, 0), 0);
    expect(bullet).toBeNull();
    expect(weapon.ammo).toBe(0);
  });

  it('can fire again after cooling down', () => {
    const hot = fire(createPistol({ cooldown: 0.3 }), vec2(0, 0), 0).weapon;
    const ready = cool(hot, 0.3);
    expect(canFire(ready)).toBe(true);
  });
});

describe('stepBullet', () => {
  it('advances along its velocity', () => {
    const { bullet } = fire(createPistol({ bulletSpeed: 100 }), vec2(0, 0), 0);
    const moved = stepBullet(bullet!, 0.1);
    expect(moved!.pos.x).toBeCloseTo(10);
  });

  it('expires when its life runs out', () => {
    const { bullet } = fire(createPistol({ bulletLife: 0.05 }), vec2(0, 0), 0);
    expect(stepBullet(bullet!, 0.1)).toBeNull();
  });
});

describe('bulletHits', () => {
  it('detects a hit within the target radius', () => {
    const { bullet } = fire(createPistol(), vec2(0, 0), 0);
    expect(bulletHits(bullet!, vec2(5, 0), 10)).toBe(true);
  });

  it('misses outside the target radius', () => {
    const { bullet } = fire(createPistol(), vec2(0, 0), 0);
    expect(bulletHits(bullet!, vec2(50, 0), 10)).toBe(false);
  });
});
