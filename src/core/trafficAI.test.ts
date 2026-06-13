import { describe, it, expect } from 'vitest';
import {
  stepTraffic,
  tileCoord,
  roadAt,
  openDirections,
  isIntersection,
  obstacleAhead,
  laneChangeTarget,
  TRAFFIC_SPEED,
  type TrafficAI,
} from './trafficAI';
import { buildCity, tileCenter, type City } from './city';
import { vec2 } from './vector';
import type { Car } from './vehicle';

const city: City = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
const DT = 1 / 60;

const carAt = (x: number, y: number): Car => ({ pos: vec2(x, y), heading: 0, speed: 0, radius: 12 });
const insideAnyBuilding = (pos: { x: number; y: number }): boolean =>
  city.buildings.some((b) => pos.x > b.x && pos.x < b.x + b.w && pos.y > b.y && pos.y < b.y + b.h);

describe('tileCoord', () => {
  it('maps a pixel position to its tile', () => {
    expect(tileCoord(city.spec, vec2(70, 10))).toEqual({ tx: 1, ty: 0 });
    expect(tileCoord(city.spec, vec2(288, 288))).toEqual({ tx: 4, ty: 4 });
  });
});

describe('roadAt', () => {
  it('is true on road lanes and false elsewhere', () => {
    expect(roadAt(city, 4, 2)).toBe(true); // column 4 is a road
    expect(roadAt(city, 2, 2)).toBe(false); // building interior
  });

  it('is false outside the map', () => {
    expect(roadAt(city, -1, 0)).toBe(false);
    expect(roadAt(city, 12, 4)).toBe(false);
  });
});

describe('openDirections', () => {
  it('offers all four ways at a crossroads', () => {
    expect(openDirections(city, 4, 4)).toHaveLength(4);
  });

  it('offers only along-the-road ways on a straight stretch', () => {
    // (2,0) sits on the top road; only east/west continue onto road tiles.
    expect(openDirections(city, 2, 0)).toHaveLength(2);
  });

  it('treats every tile inside a wide crossing as part of the intersection', () => {
    const wide = buildCity({ cols: 18, rows: 18, tile: 64, block: 6, roadWidth: 4 });
    expect(isIntersection(wide, 2, 6)).toBe(true);
    expect(isIntersection(wide, 3, 7)).toBe(true);
    expect(isIntersection(wide, 4, 6)).toBe(false);
  });
});

describe('obstacleAhead', () => {
  it('detects an obstacle directly ahead within range', () => {
    expect(obstacleAhead(vec2(0, 0), vec2(1, 0), [vec2(40, 0)])).toBe(true);
  });

  it('ignores an obstacle behind the car', () => {
    expect(obstacleAhead(vec2(0, 0), vec2(1, 0), [vec2(-40, 0)])).toBe(false);
  });

  it('ignores an obstacle in another lane', () => {
    expect(obstacleAhead(vec2(0, 0), vec2(1, 0), [vec2(40, 80)])).toBe(false);
  });

  it('ignores an obstacle beyond the look-ahead distance', () => {
    expect(obstacleAhead(vec2(0, 0), vec2(1, 0), [vec2(500, 0)])).toBe(false);
  });
});

describe('laneChangeTarget', () => {
  const wide = buildCity({ cols: 18, rows: 18, tile: 64, block: 6, roadWidth: 4 });

  it('chooses the neighboring same-direction lane when it is clear', () => {
    const start = tileCenter(wide.spec, 6, 2);
    const target = laneChangeTarget(wide, start, vec2(1, 0), [vec2(start.x + 40, start.y)]);
    expect(target).not.toBeNull();
    expect(target!.x).toBeCloseTo(start.x);
    expect(target!.y).toBeCloseTo(tileCenter(wide.spec, 6, 3).y);
  });

  it('returns null when every same-direction lane is blocked', () => {
    const start = tileCenter(wide.spec, 6, 2);
    const blockers = [
      vec2(start.x + 40, start.y),
      vec2(start.x + 40, tileCenter(wide.spec, 6, 3).y),
    ];
    expect(laneChangeTarget(wide, start, vec2(1, 0), blockers)).toBeNull();
  });
});

describe('stepTraffic', () => {
  it('drives forward along a clear road', () => {
    const start = tileCenter(city.spec, 0, 4); // on the row-4 road
    const { car } = stepTraffic(carAt(start.x, start.y), { dir: vec2(1, 0) }, city, DT, TRAFFIC_SPEED, () => 0.9);
    expect(car.pos.x).toBeGreaterThan(start.x);
    expect(car.pos.y).toBeCloseTo(start.y);
    expect(car.heading).toBeCloseTo(0);
  });

  it('turns onto a crossing road at an intersection', () => {
    // One step away from entering crossroads (4,4) while heading east.
    const { car } = stepTraffic(
      { pos: vec2(255, 288), heading: 0, speed: 0, radius: 12 },
      { dir: vec2(1, 0) },
      city,
      DT,
      TRAFFIC_SPEED,
      () => 0, // force a turn, pick the first option
    );
    expect(car.heading).toBeCloseTo(Math.PI / 2); // now heading south
  });

  it('turns back at a dead end instead of leaving the road', () => {
    // Near the eastern end of road row 4; one step would leave the map.
    const start = vec2(767, tileCenter(city.spec, 11, 4).y);
    const { ai } = stepTraffic(carAt(start.x, start.y), { dir: vec2(1, 0) }, city, DT, TRAFFIC_SPEED, () => 0.9);
    expect(ai.dir.x).toBe(-1); // reversed back to the west
    expect(ai.dir.y).toBeCloseTo(0);
  });

  it('keeps NPC cars on the road network over a long drive', () => {
    let seed = 1;
    const rng = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const start = tileCenter(city.spec, 0, 4);
    let state: { car: Car; ai: TrafficAI } = {
      car: carAt(start.x, start.y),
      ai: { dir: vec2(1, 0) },
    };

    for (let i = 0; i < 3000; i++) {
      state = stepTraffic(state.car, state.ai, city, DT, TRAFFIC_SPEED, rng);
      expect(insideAnyBuilding(state.car.pos)).toBe(false);
    }
  });
});
