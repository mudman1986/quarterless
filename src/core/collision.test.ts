import { describe, it, expect } from 'vitest';
import {
  closestPointOnRect,
  circleIntersectsRect,
  resolveCircleRect,
  resolveCircleRects,
  rect,
} from './collision';
import { vec2, distance } from './vector';

const box = rect(0, 0, 100, 50);

describe('closestPointOnRect', () => {
  it('returns the point itself when inside the rect', () => {
    expect(closestPointOnRect(vec2(10, 10), box)).toEqual({ x: 10, y: 10 });
  });

  it('clamps a point outside the rect to the nearest edge', () => {
    expect(closestPointOnRect(vec2(-20, 25), box)).toEqual({ x: 0, y: 25 });
    expect(closestPointOnRect(vec2(200, 200), box)).toEqual({ x: 100, y: 50 });
  });
});

describe('circleIntersectsRect', () => {
  it('is true when the circle overlaps the rect', () => {
    expect(circleIntersectsRect(vec2(-5, 25), 10, box)).toBe(true);
  });

  it('is false when the circle is clear of the rect', () => {
    expect(circleIntersectsRect(vec2(-20, 25), 10, box)).toBe(false);
  });
});

describe('resolveCircleRect', () => {
  it('leaves a non-overlapping circle untouched', () => {
    expect(resolveCircleRect(vec2(-20, 25), 10, box)).toEqual({ x: -20, y: 25 });
  });

  it('pushes a circle out to the left edge', () => {
    const resolved = resolveCircleRect(vec2(-5, 25), 10, box);
    expect(resolved.x).toBeCloseTo(-10);
    expect(resolved.y).toBeCloseTo(25);
    // No longer overlapping (touching counts as resolved).
    expect(circleIntersectsRect(resolved, 10, box)).toBe(false);
  });

  it('ejects a circle whose centre is inside through the nearest edge', () => {
    // Closer to the top edge (y=0) than any other.
    const resolved = resolveCircleRect(vec2(50, 5), 8, box);
    expect(resolved).toEqual({ x: 50, y: -8 });
  });
});

describe('resolveCircleRects', () => {
  it('resolves against every rect in turn', () => {
    const walls = [rect(0, 0, 20, 20), rect(40, 0, 20, 20)];
    // Sitting inside the first wall; should be pushed clear of it.
    const resolved = resolveCircleRects(vec2(18, 10), 6, walls);
    expect(distance(resolved, vec2(18, 10))).toBeGreaterThan(0);
    expect(circleIntersectsRect(resolved, 6, walls[0])).toBe(false);
  });
});
