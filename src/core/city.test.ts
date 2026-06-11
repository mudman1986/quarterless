import { describe, it, expect } from 'vitest';
import { buildCity, tileCenter, boundaryWalls, bridgeBarriers, edgeRoadSpawnPoints, DEFAULT_CITY } from './city';
import { rect, circleIntersectsRect } from './collision';
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

describe('buildCity with a road margin', () => {
  it('insets each building within its block footprint', () => {
    const margin = 16;
    const city = buildCity({ cols: 10, rows: 10, tile: 64, block: 5, margin });
    // Block (0,0): tiles x0=1,y0=1, w=4,h=4 -> base rect (64,64,256,256), inset by 16.
    expect(city.buildings[0]).toEqual(rect(80, 80, 224, 224));
  });

  it('widens the drivable space beside a road', () => {
    const plain = buildCity({ cols: 10, rows: 10, tile: 64, block: 5 });
    const roomy = buildCity({ cols: 10, rows: 10, tile: 64, block: 5, margin: 16 });
    // A point just past the road edge (tile 0 is road, tile 1 begins at x=64).
    const besideRoad = vec2(70, 96);
    expect(plain.buildings.some((b) => circleIntersectsRect(besideRoad, 4, b))).toBe(true);
    expect(roomy.buildings.some((b) => circleIntersectsRect(besideRoad, 4, b))).toBe(false);
  });
});

describe('buildCity with a river', () => {
  const city = buildCity({ cols: 16, rows: 16, tile: 64, block: 4, river: { startCol: 8, width: 2 } });

  it('blocks vertical road columns that pass through open water', () => {
    expect(city.isRoad(8, 1)).toBe(false);
    expect(city.isRoad(8, 4)).toBe(true);
  });

  it('keeps parking spots out of the river', () => {
    expect(city.parkingSpots.every((spot) => !city.water.some((water) => circleIntersectsRect(spot.pos, 14, water)))).toBe(true);
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

describe('edgeRoadSpawnPoints', () => {
  it('returns road-aligned spawn points around the city edge', () => {
    const city = buildCity({ cols: 16, rows: 16, tile: 64, block: 4, river: { startCol: 8, width: 2 } });
    const points = edgeRoadSpawnPoints(city);
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((point) => city.isRoad(Math.floor(point.x / city.spec.tile), Math.floor(point.y / city.spec.tile)))).toBe(true);
  });
});

describe('bridgeBarriers', () => {
  it('adds a fence line along each side of every bridge', () => {
    const city = buildCity({ cols: 16, rows: 16, tile: 64, block: 4, river: { startCol: 8, width: 2 } });
    expect(bridgeBarriers(city)).toHaveLength(city.bridges.length * 2);
  });
});
