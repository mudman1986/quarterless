import { describe, it, expect } from 'vitest';
import {
  stepPolice,
  hasCaught,
  policeSpeedForStars,
  policeSpeedFor,
  POLICE_BASE_SPEED,
  type Police,
} from './policeAI';
import { vec2, distance } from './vector';

const cop = (overrides: Partial<Police> = {}): Police => ({
  pos: vec2(0, 0),
  heading: 0,
  radius: 12,
  kind: 'foot',
  ...overrides,
});

describe('policeSpeedForStars', () => {
  it('uses the base speed at one star', () => {
    expect(policeSpeedForStars(1)).toBe(POLICE_BASE_SPEED);
  });

  it('increases with the wanted level', () => {
    expect(policeSpeedForStars(3)).toBeGreaterThan(policeSpeedForStars(1));
  });
});

describe('policeSpeedFor', () => {
  it('makes patrol cars faster than officers on foot at the same level', () => {
    expect(policeSpeedFor('car', 2)).toBeGreaterThan(policeSpeedFor('foot', 2));
  });

  it('scales both kinds up with the wanted level', () => {
    expect(policeSpeedFor('foot', 4)).toBeGreaterThan(policeSpeedFor('foot', 1));
    expect(policeSpeedFor('car', 4)).toBeGreaterThan(policeSpeedFor('car', 1));
  });
});

describe('stepPolice', () => {
  it('moves toward the target', () => {
    const target = vec2(100, 0);
    const next = stepPolice(cop(), target, 0.1);
    expect(next.pos.x).toBeGreaterThan(0);
    expect(distance(next.pos, target)).toBeLessThan(distance(vec2(0, 0), target));
  });

  it('faces the target', () => {
    const next = stepPolice(cop(), vec2(0, 50), 0.1);
    expect(next.heading).toBeCloseTo(Math.PI / 2);
  });

  it('does not overshoot the target', () => {
    const target = vec2(1, 0);
    const next = stepPolice(cop(), target, 1, 1000);
    expect(next.pos.x).toBeLessThanOrEqual(target.x + 1e-9);
  });

  it('stays put when already on the target', () => {
    const next = stepPolice(cop({ pos: vec2(5, 5) }), vec2(5, 5), 0.1);
    expect(next.pos).toEqual(vec2(5, 5));
  });
});

describe('hasCaught', () => {
  it('is true within the police radius', () => {
    expect(hasCaught(cop({ radius: 12 }), vec2(5, 0))).toBe(true);
  });

  it('is false outside the police radius', () => {
    expect(hasCaught(cop({ radius: 12 }), vec2(50, 0))).toBe(false);
  });
});
