import { describe, it, expect } from 'vitest';
import {
  stepRoadVehicle,
  seekChooser,
  wanderChooser,
  nearestCardinal,
  openDirections,
  roadAt,
  tileCoord,
  isSameDir,
  isOppositeDir,
  type RoadVehicle,
} from './roadVehicle';
import { buildCity, tileCenter, type City } from './city';
import { vec2 } from './vector';

const city: City = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
const DT = 1 / 60;
const insideBuilding = (p: { x: number; y: number }): boolean =>
  city.buildings.some((b) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h);

describe('direction helpers', () => {
  it('compares cardinal directions', () => {
    expect(isSameDir(vec2(1, 0), vec2(1, 0))).toBe(true);
    expect(isOppositeDir(vec2(1, 0), vec2(-1, 0))).toBe(true);
    expect(isOppositeDir(vec2(1, 0), vec2(0, 1))).toBe(false);
  });

  it('maps a heading to the nearest cardinal', () => {
    expect(nearestCardinal(0)).toEqual(vec2(1, 0));
    expect(nearestCardinal(Math.PI / 2)).toEqual(vec2(0, 1));
    expect(nearestCardinal(Math.PI)).toEqual(vec2(-1, 0));
  });

  it('maps pixels to tiles and finds open roads', () => {
    expect(tileCoord(city.spec, vec2(70, 10))).toEqual({ tx: 1, ty: 0 });
    expect(roadAt(city, 4, 2)).toBe(true);
    expect(roadAt(city, 2, 2)).toBe(false);
    expect(openDirections(city, 4, 4)).toHaveLength(4); // crossroads
  });
});

describe('seekChooser', () => {
  it('picks the option pointing most toward the target', () => {
    const choose = seekChooser(vec2(1000, 0)); // far east
    const options = [vec2(0, 1), vec2(1, 0), vec2(0, -1)];
    expect(choose(options, vec2(0, 1), vec2(0, 0))).toEqual(vec2(1, 0));
  });
});

describe('wanderChooser', () => {
  it('continues straight when not turning', () => {
    const choose = wanderChooser(() => 0.99, 0.35); // 0.99 ≥ turnChance: no turn
    const options = [vec2(1, 0), vec2(-1, 0), vec2(0, 1)];
    expect(choose(options, vec2(1, 0), vec2(0, 0))).toEqual(vec2(1, 0));
  });

  it('turns at a dead end where it cannot continue', () => {
    const choose = wanderChooser(() => 0, 0.35);
    const options = [vec2(-1, 0), vec2(0, 1)]; // cannot go straight (east absent)
    const chosen = choose(options, vec2(1, 0), vec2(0, 0));
    expect(chosen).toEqual(vec2(0, 1)); // takes the perpendicular turn
  });

  it('reverses only when fully boxed in', () => {
    const choose = wanderChooser(() => 0, 0.35);
    const chosen = choose([vec2(-1, 0)], vec2(1, 0), vec2(0, 0));
    expect(chosen.x).toBe(-1); // the way back is the only option
    expect(chosen.y).toBeCloseTo(0); // (avoid the -0 vs 0 equality gotcha)
  });
});

describe('stepRoadVehicle', () => {
  it('drives straight along a clear lane', () => {
    const start = tileCenter(city.spec, 0, 4);
    const v: RoadVehicle = { pos: start, heading: 0, dir: vec2(1, 0) };
    const next = stepRoadVehicle(v, city, DT, 130, wanderChooser(() => 0.9, 0.35));
    expect(next.pos.x).toBeGreaterThan(start.x);
    expect(next.pos.y).toBeCloseTo(start.y);
  });

  it('seeks toward a target across the grid without entering buildings', () => {
    let v: RoadVehicle = { pos: tileCenter(city.spec, 0, 4), heading: 0, dir: vec2(1, 0) };
    const target = tileCenter(city.spec, 8, 8);
    const start = v.pos;
    for (let i = 0; i < 600; i++) {
      v = stepRoadVehicle(v, city, DT, 200, seekChooser(target));
      expect(insideBuilding(v.pos)).toBe(false);
    }
    expect(Math.hypot(v.pos.x - target.x, v.pos.y - target.y)).toBeLessThan(
      Math.hypot(start.x - target.x, start.y - target.y),
    );
  });
});
