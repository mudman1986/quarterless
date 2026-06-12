import { describe, it, expect } from 'vitest';
import {
  closestPointOnRect,
  circleIntersectsRect,
  pointInRect,
  segmentIntersectsRect,
  resolveCircleRect,
  resolveCircleRects,
  resolveCircleCircle,
  resolveCircleCircles,
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

describe('pointInRect', () => {
  it('is true for a point inside the rect', () => {
    expect(pointInRect(vec2(10, 10), box)).toBe(true);
  });

  it('is false for a point outside the rect', () => {
    expect(pointInRect(vec2(-1, 10), box)).toBe(false);
    expect(pointInRect(vec2(10, 60), box)).toBe(false);
  });

  it('counts the boundary as inside', () => {
    expect(pointInRect(vec2(0, 0), box)).toBe(true);
    expect(pointInRect(vec2(100, 50), box)).toBe(true);
  });
});

describe('segmentIntersectsRect', () => {
  it('is true when the segment crosses the rect', () => {
    expect(segmentIntersectsRect(vec2(-20, 25), vec2(120, 25), box)).toBe(true);
  });

  it('is true when an endpoint lies inside the rect', () => {
    expect(segmentIntersectsRect(vec2(-20, 25), vec2(50, 25), box)).toBe(true);
  });

  it('is false when the segment stops short of the rect', () => {
    expect(segmentIntersectsRect(vec2(-20, 25), vec2(-5, 25), box)).toBe(false);
  });

  it('is false when the segment passes clear of the rect', () => {
    expect(segmentIntersectsRect(vec2(-20, -10), vec2(120, -10), box)).toBe(false);
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

describe('resolveCircleCircle', () => {
  it('leaves a circle clear of the obstacle untouched', () => {
    const out = resolveCircleCircle(vec2(50, 0), 8, { pos: vec2(0, 0), radius: 12 });
    expect(out).toEqual({ x: 50, y: 0 });
  });

  it('treats just-touching circles as resolved (no push)', () => {
    // distance 20 == radius 8 + obstacle radius 12: they only touch.
    const out = resolveCircleCircle(vec2(20, 0), 8, { pos: vec2(0, 0), radius: 12 });
    expect(out).toEqual({ x: 20, y: 0 });
  });

  it('pushes an overlapping circle out until the two just touch', () => {
    const obstacle = { pos: vec2(0, 0), radius: 12 };
    const out = resolveCircleCircle(vec2(10, 0), 8, obstacle);
    // Ejected along +x to exactly radius (8) + obstacle radius (12) = 20.
    expect(out.x).toBeCloseTo(20);
    expect(out.y).toBeCloseTo(0);
    expect(distance(out, obstacle.pos)).toBeCloseTo(20);
  });

  it('ejects a concentric circle along +x by the combined radius', () => {
    const out = resolveCircleCircle(vec2(0, 0), 8, { pos: vec2(0, 0), radius: 12 });
    expect(out).toEqual({ x: 20, y: 0 });
  });
});

describe('resolveCircleCircles', () => {
  it('resolves against every obstacle in turn', () => {
    const cars = [
      { pos: vec2(0, 0), radius: 12 },
      { pos: vec2(80, 0), radius: 12 },
    ];
    // Overlapping the first car; after resolution it must be clear of both.
    const out = resolveCircleCircles(vec2(8, 0), 8, cars);
    expect(distance(out, cars[0].pos)).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(distance(out, cars[1].pos)).toBeGreaterThanOrEqual(20 - 1e-6);
  });
});
