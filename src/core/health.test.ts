import { describe, it, expect } from 'vitest';
import { createHealth, isDead, damage, heal, fraction } from './health';

describe('createHealth', () => {
  it('starts full', () => {
    const h = createHealth(100);
    expect(h.current).toBe(100);
    expect(h.max).toBe(100);
    expect(isDead(h)).toBe(false);
  });
});

describe('damage', () => {
  it('reduces current health', () => {
    expect(damage(createHealth(100), 30).current).toBe(70);
  });

  it('never drops below zero and marks death', () => {
    const h = damage(createHealth(100), 150);
    expect(h.current).toBe(0);
    expect(isDead(h)).toBe(true);
  });

  it('is pure (does not mutate)', () => {
    const h = createHealth(100);
    damage(h, 10);
    expect(h.current).toBe(100);
  });
});

describe('heal', () => {
  it('restores health up to the maximum', () => {
    const hurt = damage(createHealth(100), 50);
    expect(heal(hurt, 20).current).toBe(70);
    expect(heal(hurt, 999).current).toBe(100);
  });
});

describe('fraction', () => {
  it('returns the remaining fraction', () => {
    expect(fraction(damage(createHealth(200), 50))).toBeCloseTo(0.75);
  });

  it('is zero for a zero-max pool', () => {
    expect(fraction({ current: 0, max: 0 })).toBe(0);
  });
});
