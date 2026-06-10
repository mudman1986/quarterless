import { describe, it, expect } from 'vitest';
import {
  add,
  angle,
  clampLength,
  distance,
  dot,
  fromAngle,
  length,
  lerp,
  normalize,
  scale,
  sub,
  vec2,
} from './vector';

describe('vec2', () => {
  it('defaults to the origin', () => {
    expect(vec2()).toEqual({ x: 0, y: 0 });
  });

  it('stores provided components', () => {
    expect(vec2(3, -4)).toEqual({ x: 3, y: -4 });
  });
});

describe('add / sub / scale', () => {
  it('adds component-wise', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 });
  });

  it('subtracts component-wise', () => {
    expect(sub(vec2(5, 5), vec2(1, 2))).toEqual({ x: 4, y: 3 });
  });

  it('scales by a scalar', () => {
    expect(scale(vec2(2, -3), 2)).toEqual({ x: 4, y: -6 });
  });
});

describe('length / distance', () => {
  it('computes magnitude (3-4-5 triangle)', () => {
    expect(length(vec2(3, 4))).toBe(5);
  });

  it('computes distance between points', () => {
    expect(distance(vec2(0, 0), vec2(3, 4))).toBe(5);
  });
});

describe('normalize', () => {
  it('returns a unit vector', () => {
    expect(length(normalize(vec2(0, 8)))).toBeCloseTo(1);
  });

  it('returns the zero vector when given the zero vector', () => {
    expect(normalize(vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });
});

describe('dot', () => {
  it('is zero for perpendicular vectors', () => {
    expect(dot(vec2(1, 0), vec2(0, 1))).toBe(0);
  });
});

describe('fromAngle / angle', () => {
  it('builds a vector pointing along the given angle', () => {
    const v = fromAngle(Math.PI / 2, 2);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(2);
  });

  it('round-trips through angle()', () => {
    expect(angle(fromAngle(0.75))).toBeCloseTo(0.75);
  });
});

describe('clampLength', () => {
  it('leaves short vectors untouched', () => {
    expect(clampLength(vec2(1, 0), 5)).toEqual({ x: 1, y: 0 });
  });

  it('shortens vectors that exceed the limit', () => {
    expect(length(clampLength(vec2(100, 0), 5))).toBeCloseTo(5);
  });
});

describe('lerp', () => {
  it('returns the midpoint at t=0.5', () => {
    expect(lerp(vec2(0, 0), vec2(10, 20), 0.5)).toEqual({ x: 5, y: 10 });
  });

  it('clamps t outside [0, 1]', () => {
    expect(lerp(vec2(0, 0), vec2(10, 0), 2)).toEqual({ x: 10, y: 0 });
    expect(lerp(vec2(0, 0), vec2(10, 0), -1)).toEqual({ x: 0, y: 0 });
  });
});
