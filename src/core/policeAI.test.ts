import { describe, it, expect } from 'vitest';
import {
  stepPolice,
  stepPoliceCar,
  hasCaught,
  policeSpeedForStars,
  policeSpeedFor,
  POLICE_BASE_SPEED,
  POLICE_CAR_MAX_SPEED,
  type Police,
} from './policeAI';
import { buildCity, tileCenter, type City } from './city';
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

  it('caps patrol cars at the player car top speed', () => {
    expect(policeSpeedFor('car', 99)).toBe(POLICE_CAR_MAX_SPEED);
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

describe('stepPoliceCar', () => {
  const city: City = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
  const insideBuilding = (p: { x: number; y: number }): boolean =>
    city.buildings.some((b) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h);

  it('drives along the road toward a target down the same lane', () => {
    const start = tileCenter(city.spec, 0, 4); // road row 4
    const patrol = cop({ pos: start, heading: 0, kind: 'car' });
    const next = stepPoliceCar(patrol, tileCenter(city.spec, 8, 4), city, 1 / 60, 200);
    expect(next.pos.x).toBeGreaterThan(start.x); // moved east, toward the target
    expect(next.pos.y).toBeCloseTo(start.y);
  });

  it('chases along the grid and never enters a building', () => {
    let patrol = cop({ pos: tileCenter(city.spec, 0, 4), heading: 0, kind: 'car' });
    const target = tileCenter(city.spec, 8, 8); // requires turning off row 4
    const startDist = distance(patrol.pos, target);
    for (let i = 0; i < 600; i++) {
      patrol = stepPoliceCar(patrol, target, city, 1 / 60, 200);
      expect(insideBuilding(patrol.pos)).toBe(false);
    }
    expect(distance(patrol.pos, target)).toBeLessThan(startDist); // it closed in
  });

  it('turns back at a dead end rather than leaving the road', () => {
    // Easternmost road tile on row 4; pushing east would leave the map.
    const start = vec2(767, tileCenter(city.spec, 11, 4).y);
    const next = stepPoliceCar(cop({ pos: start, heading: 0, kind: 'car' }), vec2(2000, start.y), city, 1 / 60, 200);
    expect(insideBuilding(next.pos)).toBe(false);
  });
});
