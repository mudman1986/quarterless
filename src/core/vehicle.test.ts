import { describe, it, expect } from 'vitest';
import {
  stepCar,
  DEFAULT_CAR_TUNING,
  carWallRetention,
  collideCarWithWalls,
  collideCars,
  type Car,
} from './vehicle';
import { rect, circleIntersectsRect } from './collision';
import { controls } from './types';
import { vec2, normalize, distance } from './vector';

const car = (overrides: Partial<Car> = {}): Car => ({
  pos: vec2(0, 0),
  heading: 0,
  speed: 0,
  radius: 12,
  ...overrides,
});

describe('stepCar throttle and braking', () => {
  it('accelerates forward under throttle', () => {
    const next = stepCar(car(), controls({ up: true }), 1);
    expect(next.speed).toBeCloseTo(DEFAULT_CAR_TUNING.enginePower);
  });

  it('coasts toward a stop via drag', () => {
    const next = stepCar(car({ speed: 100 }), controls(), 0.1);
    expect(next.speed).toBeCloseTo(100 - DEFAULT_CAR_TUNING.drag * 0.1);
    expect(next.speed).toBeLessThan(100);
  });

  it('does not overshoot zero while coasting', () => {
    const next = stepCar(car({ speed: 10 }), controls(), 1);
    expect(next.speed).toBe(0);
  });

  it('brakes when moving forward and pressing down', () => {
    const next = stepCar(car({ speed: 200 }), controls({ down: true }), 0.1);
    expect(next.speed).toBeCloseTo(200 - DEFAULT_CAR_TUNING.brakePower * 0.1);
  });

  it('reverses from a standstill when pressing down', () => {
    const next = stepCar(car(), controls({ down: true }), 0.1);
    expect(next.speed).toBeCloseTo(-DEFAULT_CAR_TUNING.reversePower * 0.1);
  });

  it('clamps to the maximum forward speed', () => {
    const next = stepCar(car({ speed: DEFAULT_CAR_TUNING.maxSpeed }), controls({ up: true }), 1);
    expect(next.speed).toBe(DEFAULT_CAR_TUNING.maxSpeed);
  });

  it('clamps to the maximum reverse speed', () => {
    const next = stepCar(
      car({ speed: -DEFAULT_CAR_TUNING.maxReverseSpeed }),
      controls({ down: true }),
      1,
    );
    expect(next.speed).toBe(-DEFAULT_CAR_TUNING.maxReverseSpeed);
  });
});

describe('stepCar steering', () => {
  it('does not steer when stationary', () => {
    const next = stepCar(car(), controls({ right: true }), 1);
    expect(next.heading).toBe(0);
  });

  it('turns right (increasing heading) when moving forward', () => {
    const next = stepCar(car({ speed: 200 }), controls({ right: true }), 0.1);
    expect(next.heading).toBeGreaterThan(0);
  });

  it('inverts steering when reversing', () => {
    const forward = stepCar(car({ speed: 200 }), controls({ right: true }), 0.1).heading;
    const backward = stepCar(car({ speed: -200 }), controls({ right: true }), 0.1).heading;
    expect(Math.sign(forward)).toBe(1);
    expect(Math.sign(backward)).toBe(-1);
  });
});

describe('stepCar movement', () => {
  it('advances position along the heading', () => {
    const next = stepCar(car({ heading: 0, speed: 100 }), controls(), 0.1);
    expect(next.pos.x).toBeGreaterThan(0);
    expect(next.pos.y).toBeCloseTo(0);
  });

  it('advances downward when heading is +90 degrees', () => {
    const next = stepCar(car({ heading: Math.PI / 2, speed: 100 }), controls(), 0.1);
    expect(next.pos.x).toBeCloseTo(0);
    expect(next.pos.y).toBeGreaterThan(0);
  });
});

describe('carWallRetention', () => {
  it('stops a head-on impact', () => {
    // Travelling +x into a wall whose outward normal points -x.
    expect(carWallRetention(vec2(1, 0), vec2(-1, 0))).toBeCloseTo(0);
  });

  it('preserves a parallel graze', () => {
    // Travelling +x alongside a wall whose normal points +y.
    expect(carWallRetention(vec2(1, 0), vec2(0, 1))).toBeCloseTo(1);
  });

  it('keeps more speed the more glancing the angle', () => {
    const glancing = carWallRetention(normalize(vec2(6, 1)), vec2(0, -1)); // near-parallel
    const angled = carWallRetention(normalize(vec2(1, 1)), vec2(0, -1)); // 45 degrees
    expect(glancing).toBeGreaterThan(angled);
    expect(angled).toBeGreaterThan(0);
    expect(glancing).toBeLessThan(1);
  });
});

describe('collideCarWithWalls', () => {
  const wall = rect(120, -100, 40, 200); // vertical wall, left edge at x=120

  it('leaves a car clear of all walls untouched', () => {
    const c = car({ pos: vec2(0, 0), speed: 100 });
    expect(collideCarWithWalls(c, [wall])).toEqual(c);
  });

  it('stops a car driving straight into a wall', () => {
    // Heading +x, overlapping the wall: a head-on hit.
    const c = car({ pos: vec2(115, 0), heading: 0, speed: 200, radius: 12 });
    const out = collideCarWithWalls(c, [wall]);
    expect(out.speed).toBeCloseTo(0);
    expect(circleIntersectsRect(out.pos, out.radius, wall)).toBe(false);
  });

  it('keeps most speed when clipping a wall at a shallow angle', () => {
    // Heading mostly +y (parallel to the wall) while overlapping it.
    const c = car({ pos: vec2(115, 0), heading: Math.PI / 2, speed: 200, radius: 12 });
    const out = collideCarWithWalls(c, [wall]);
    expect(out.speed).toBeGreaterThan(150);
    expect(circleIntersectsRect(out.pos, out.radius, wall)).toBe(false);
  });
});

describe('collideCars', () => {
  it('leaves two separated cars untouched', () => {
    const a = car({ pos: vec2(0, 0) });
    const b = car({ pos: vec2(100, 0) });
    expect(collideCars(a, b)).toEqual([a, b]);
  });

  it('pushes two overlapping cars apart until they just touch', () => {
    const a = car({ pos: vec2(0, 0), radius: 12 });
    const b = car({ pos: vec2(10, 0), radius: 12 }); // overlap of 14
    const [na, nb] = collideCars(a, b);
    expect(distance(na.pos, nb.pos)).toBeCloseTo(24); // sum of radii
    expect(na.pos.x).toBeLessThan(0); // shoved away from b
    expect(nb.pos.x).toBeGreaterThan(10);
  });

  it('stops a car that rams another head-on', () => {
    const a = car({ pos: vec2(0, 0), heading: 0, speed: 200, radius: 12 }); // driving +x into b
    const b = car({ pos: vec2(18, 0), heading: 0, speed: 0, radius: 12 });
    const [na] = collideCars(a, b);
    expect(na.speed).toBeCloseTo(0);
  });

  it('barely slows a glancing touch', () => {
    // a moving +y, just clipping b sitting to its +x side.
    const a = car({ pos: vec2(0, 0), heading: Math.PI / 2, speed: 200, radius: 12 });
    const b = car({ pos: vec2(18, 0), heading: 0, speed: 0, radius: 12 });
    const [na] = collideCars(a, b);
    expect(na.speed).toBeGreaterThan(150);
  });
});
