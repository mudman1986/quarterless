import { describe, it, expect } from 'vitest';
import {
  stepPedestrian,
  wanderTarget,
  PANIC_RADIUS,
  ARRIVE_RADIUS,
  PED_WALK_SPEED,
  PED_FLEE_SPEED,
  type Pedestrian,
  type PedestrianContext,
} from './pedestrianAI';
import { DEFAULT_CAR_TUNING } from './vehicle';
import { rect, pointInRect } from './collision';
import { vec2, distance } from './vector';

const ped = (overrides: Partial<Pedestrian> = {}): Pedestrian => ({
  pos: vec2(100, 100),
  heading: 0,
  radius: 7,
  state: 'wander',
  target: vec2(100, 100),
  ...overrides,
});

const ctx = (threats: ReturnType<typeof vec2>[] = []): PedestrianContext => ({
  threats,
  bounds: { width: 1000, height: 1000 },
});

describe('pedestrian speeds are realistic', () => {
  it('walks slower than it flees', () => {
    expect(PED_WALK_SPEED).toBeLessThan(PED_FLEE_SPEED);
  });

  it('even a fleeing pedestrian is slower than a car at full speed', () => {
    expect(PED_FLEE_SPEED).toBeLessThan(DEFAULT_CAR_TUNING.maxSpeed);
  });
});

describe('stepPedestrian fleeing', () => {
  it('flees from a threat inside the panic radius', () => {
    const p = ped();
    const threat = vec2(100 + PANIC_RADIUS / 2, 100);
    const next = stepPedestrian(p, ctx([threat]), 0.1);
    expect(next.state).toBe('flee');
    // Moves away from the threat.
    expect(distance(next.pos, threat)).toBeGreaterThan(distance(p.pos, threat));
  });

  it('ignores a threat outside the panic radius', () => {
    const threat = vec2(100 + PANIC_RADIUS * 2, 100);
    const next = stepPedestrian(ped(), ctx([threat]), 0.1);
    expect(next.state).toBe('wander');
  });

  it('flees the nearest of several threats', () => {
    const near = vec2(110, 100);
    const far = vec2(100, 180);
    const next = stepPedestrian(ped(), ctx([far, near]), 0.1);
    // Fleeing the near threat (to its left) moves the ped left (-x).
    expect(next.pos.x).toBeLessThan(100);
  });

  it('does not produce NaN when a threat is exactly on top of it', () => {
    const next = stepPedestrian(ped({ heading: 0 }), ctx([vec2(100, 100)]), 0.1);
    expect(Number.isNaN(next.pos.x)).toBe(false);
    expect(Number.isNaN(next.pos.y)).toBe(false);
  });
});

describe('stepPedestrian wandering', () => {
  it('keeps a taxi fare waiting even if a car threat is nearby', () => {
    const p = ped({ taxiPassengerRole: 'playerFare', state: 'wait' });
    const threat = vec2(100 + PANIC_RADIUS / 2, 100);
    const next = stepPedestrian(p, ctx([threat]), 0.1);
    expect(next.state).toBe('wait');
    expect(next.pos).toEqual(p.pos);
  });

  it('walks toward its current target', () => {
    const p = ped({ target: vec2(500, 100) });
    const next = stepPedestrian(p, ctx(), 0.1);
    expect(next.pos.x).toBeGreaterThan(100);
    expect(distance(next.pos, p.target)).toBeLessThan(distance(p.pos, p.target));
  });

  it('chooses a new target on arrival using the injected RNG', () => {
    const p = ped({ pos: vec2(100, 100), target: vec2(100 + ARRIVE_RADIUS / 2, 100) });
    const next = stepPedestrian(p, ctx(), 0.1, () => 0.5);
    // RNG 0.5 over 1000x1000 bounds → target near the map centre.
    expect(next.target).toEqual(vec2(500, 500));
  });
});

describe('pedestrians keep to sidewalks', () => {
  // Two sidewalk strips: one beside the ped, one far away.
  const near = rect(120, 96, 40, 12);
  const far = rect(800, 800, 40, 12);
  const sidewalkCtx: PedestrianContext = {
    threats: [],
    bounds: { width: 1000, height: 1000 },
    sidewalks: [near, far],
  };

  it('picks a nearby sidewalk point as the next wander target', () => {
    const target = wanderTarget(sidewalkCtx, vec2(100, 100), () => 0.5);
    expect(pointInRect(target, near)).toBe(true); // chose the close strip, not the far one
  });

  it('sends a wandering pedestrian onto a sidewalk on arrival', () => {
    const p = ped({ pos: vec2(100, 100), target: vec2(100 + ARRIVE_RADIUS / 2, 100) });
    const next = stepPedestrian(p, sidewalkCtx, 0.1, () => 0.5);
    expect(pointInRect(next.target, near)).toBe(true);
  });

  it('still lets a frightened pedestrian flee off the sidewalk', () => {
    const threat = vec2(110, 100); // right on top, inside the panic radius
    const next = stepPedestrian(ped(), { ...sidewalkCtx, threats: [threat] }, 0.1);
    expect(next.state).toBe('flee'); // panic overrides staying on the pavement
    expect(distance(next.pos, threat)).toBeGreaterThan(0);
  });
});
