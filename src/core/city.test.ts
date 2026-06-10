import { describe, it, expect } from 'vitest';
import { buildCity, tileCenter, boundaryWalls, DEFAULT_CITY } from './city';
import { circleIntersectsRect } from './collision';
import { vec2 } from './vector';

describe('buildCity', () => {
  const city = buildCity(DEFAULT_CITY);

  it('computes pixel dimensions from the grid', () => {
    expect(city.width).toBe(DEFAULT_CITY.cols * DEFAULT_CITY.tile);
    expect(city.height).toBe(DEFAULT_CITY.rows * DEFAULT_CITY.tile);
  });

  it('marks every block-th row and column as road', () => {
    expect(city.isRoad(0, 3)).toBe(true); // column 0
    expect(city.isRoad(3, 0)).toBe(true); // row 0
    expect(city.isRoad(5, 7)).toBe(true); // column 5 (block edge)
    expect(city.isRoad(2, 3)).toBe(false); // interior building tile
  });

  it('creates one building per block', () => {
    const blocksPerAxis = Math.ceil(DEFAULT_CITY.cols / DEFAULT_CITY.block);
    expect(city.buildings).toHaveLength(blocksPerAxis * blocksPerAxis);
  });

  it('keeps road intersections clear of buildings', () => {
    const intersection = tileCenter(DEFAULT_CITY, 5, 5);
    const onAnyBuilding = city.buildings.some((b) => circleIntersectsRect(intersection, 8, b));
    expect(onAnyBuilding).toBe(false);
  });
});

describe('tileCenter', () => {
  it('returns the centre pixel of a tile', () => {
    expect(tileCenter(DEFAULT_CITY, 0, 0)).toEqual(vec2(32, 32));
    expect(tileCenter(DEFAULT_CITY, 1, 2)).toEqual(vec2(96, 160));
  });
});

describe('boundaryWalls', () => {
  it('surrounds the map on all four sides', () => {
    const city = buildCity(DEFAULT_CITY);
    expect(boundaryWalls(city)).toHaveLength(4);
  });

  it('blocks a point just outside the map edge', () => {
    const city = buildCity(DEFAULT_CITY);
    const walls = boundaryWalls(city);
    const justOutsideRight = vec2(city.width + 10, city.height / 2);
    expect(walls.some((w) => circleIntersectsRect(justOutsideRight, 8, w))).toBe(true);
  });
});
