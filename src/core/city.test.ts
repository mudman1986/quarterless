import {
  boundaryWalls,
  buildCity,
  crosswalkStripeRects,
  CROSSWALK_ROAD_MARGIN,
  CROSSWALK_WIDTH_RATIO,
  DEFAULT_CITY,
  tileCenter,
} from './city';
import { describe, it, expect } from 'vitest';
import { rect, circleIntersectsRect, pointInRect, randomPointInRect } from './collision';
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

  it('assigns custom service buildings with road-adjacent spawn points', () => {
    const kinds = new Set(city.facilities.map((f) => f.kind));
    expect(kinds).toEqual(new Set(['policeStation', 'hospital', 'towYard']));
    expect(new Set(city.facilities.map((f) => f.buildingIndex)).size).toBe(city.facilities.length);
    for (const facility of city.facilities) {
      const insideBuilding = city.buildings.some((b) => pointInRect(facility.spawn, b));
      expect(insideBuilding).toBe(false);
      const tx = Math.floor(facility.spawn.x / city.spec.tile);
      const ty = Math.floor(facility.spawn.y / city.spec.tile);
      expect(city.isRoad(tx, ty)).toBe(true);
    }
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

describe('buildCity with wider roads', () => {
  const city = buildCity({ cols: 18, rows: 18, tile: 64, block: 6, roadWidth: 4, margin: 20, sidewalkWidth: 20 });

  it('treats the full road band as drivable', () => {
    expect(city.isRoad(0, 5)).toBe(true);
    expect(city.isRoad(3, 5)).toBe(true);
    expect(city.isRoad(5, 3)).toBe(true);
    expect(city.isRoad(5, 4)).toBe(false);
    expect(city.isRoad(5, 5)).toBe(false);
  });

  it('shrinks the buildable footprint within each block', () => {
    expect(city.buildings[0]).toEqual(rect(276, 276, 88, 88));
  });

  it('widens sidewalks independently of building margin', () => {
    const b = city.buildings[0];
    const top = city.sidewalks.find((s) => s.y + s.h === b.y);
    expect(top).toBeDefined();
    expect(top!.h).toBe(20);
    expect(top!.w).toBe(b.w + 40);
  });

  it('spans crosswalks across the full wide-road frontage', () => {
    const rightApproach = city.crosswalks.find((cw) => cw.x === 4 * city.spec.tile + (city.spec.tile - cw.w) * 0.5);
    expect(rightApproach).toBeDefined();
    expect(rightApproach!.h).toBe(4 * city.spec.tile);
  });

  it('moves facility spawns when the building footprint moves', () => {
    const snug = buildCity({ cols: 20, rows: 20, tile: 64, block: 6, roadWidth: 4, margin: 9, sidewalkWidth: 20 });
    const roomy = buildCity({ cols: 20, rows: 20, tile: 64, block: 6, roadWidth: 4, margin: 21, sidewalkWidth: 20 });
    const snugPolice = snug.facilities.find((f) => f.kind === 'policeStation');
    const roomyPolice = roomy.facilities.find((f) => f.kind === 'policeStation');
    expect(snugPolice).toBeDefined();
    expect(roomyPolice).toBeDefined();
    expect(snugPolice!.spawn).not.toEqual(roomyPolice!.spawn);
  });
});

describe('crosswalkStripeRects', () => {
  it('starts at the block corner and reaches the far kerb on a wide north-south crossing', () => {
    const cw = rect(0, 300, 256, 32);
    const stripes = crosswalkStripeRects(cw);
    expect(stripes[0]).toBeDefined();
    expect(stripes[0]!.x).toBe(cw.x);
    const last = stripes[stripes.length - 1]!;
    expect(last.x + last.w).toBeCloseTo(cw.x + cw.w);
  });

  it('starts at the block corner and reaches the far kerb on a wide east-west crossing', () => {
    const cw = rect(400, 0, 32, 256);
    const stripes = crosswalkStripeRects(cw);
    expect(stripes[0]).toBeDefined();
    expect(stripes[0]!.y).toBe(cw.y);
    const last = stripes[stripes.length - 1]!;
    expect(last.y + last.h).toBeCloseTo(cw.y + cw.h);
  });
});

describe('tileCenter', () => {
  it('returns the centre pixel of a tile', () => {
    expect(tileCenter(DEFAULT_CITY, 0, 0)).toEqual(vec2(32, 32));
    expect(tileCenter(DEFAULT_CITY, 1, 2)).toEqual(vec2(96, 160));
  });
});

describe('buildCity with a river', () => {
  // Road columns at 0,5,10,15; with bridgeEvery 2 the bridges are at 0 and 10,
  // while the crossing roads at 5 and 15 dead-end at the water.
  const spec = {
    cols: 20,
    rows: 20,
    tile: 64,
    block: 5,
    rivers: [{ orientation: 'horizontal' as const, start: 11, span: 3, bridgeEvery: 2 }],
  };
  const city = buildCity(spec);

  it('marks band tiles as water except at the bridges', () => {
    expect(city.isWater(2, 12)).toBe(true); // building-interior tile in the band
    expect(city.isWater(5, 12)).toBe(true); // a non-bridge crossing road = water
    expect(city.isWater(0, 12)).toBe(false); // bridge column 0
    expect(city.isWater(10, 12)).toBe(false); // bridge column 10
    expect(city.isWater(2, 5)).toBe(false); // outside the band entirely
  });

  it('keeps bridges drivable and water off-road', () => {
    expect(city.isBridge(0, 12)).toBe(true);
    expect(city.isBridge(10, 12)).toBe(true);
    expect(city.isBridge(5, 12)).toBe(false);
    expect(city.isRoad(0, 12)).toBe(true); // bridge is a road
    expect(city.isRoad(5, 12)).toBe(false); // water is not
    expect(city.isRoad(2, 12)).toBe(false); // water interior is not
    expect(city.isRoad(0, 5)).toBe(true); // a normal road outside the band
  });

  it('produces water rectangles confined to the band rows', () => {
    expect(city.water.length).toBeGreaterThan(0);
    const river = spec.rivers[0];
    const yTop = river.start * spec.tile;
    const yBottom = (river.start + river.span) * spec.tile;
    for (const w of city.water) {
      expect(w.y).toBeGreaterThanOrEqual(yTop);
      expect(w.y + w.h).toBeLessThanOrEqual(yBottom);
    }
  });

  it('lines every bridge with two side rails', () => {
    // Two bridges (columns 0 and 10), two rails each.
    expect(city.fences).toHaveLength(4);
  });

  it('removes buildings from the water band', () => {
    const river = spec.rivers[0];
    const yTop = river.start * spec.tile;
    const yBottom = (river.start + river.span) * spec.tile;
    const overlapsBand = city.buildings.some((b) => b.y < yBottom && b.y + b.h > yTop);
    expect(overlapsBand).toBe(false);
  });

  it('leaves a plain city with no water or fences', () => {
    const plain = buildCity({ cols: 20, rows: 20, tile: 64, block: 5 });
    expect(plain.water).toHaveLength(0);
    expect(plain.fences).toHaveLength(0);
    expect(plain.isWater(2, 12)).toBe(false);
    expect(plain.isBridge(0, 12)).toBe(false);
  });
});

describe('buildCity with a vertical river', () => {
  // A vertical band of columns crossed by horizontal roads (rows 0,5,10,15);
  // bridgeEvery 2 bridges rows 0 and 10.
  const spec = {
    cols: 20,
    rows: 20,
    tile: 64,
    block: 5,
    rivers: [{ orientation: 'vertical' as const, start: 11, span: 3, bridgeEvery: 2 }],
  };
  const city = buildCity(spec);

  it('marks band columns as water except at the bridges', () => {
    expect(city.isWater(12, 2)).toBe(true); // interior column in the band
    expect(city.isWater(12, 5)).toBe(true); // a non-bridge crossing road
    expect(city.isWater(12, 0)).toBe(false); // bridge row 0
    expect(city.isBridge(12, 10)).toBe(true);
  });

  it('confines water rectangles to the band columns and rails every bridge', () => {
    const river = spec.rivers[0];
    const xLeft = river.start * spec.tile;
    const xRight = (river.start + river.span) * spec.tile;
    for (const w of city.water) {
      expect(w.x).toBeGreaterThanOrEqual(xLeft);
      expect(w.x + w.w).toBeLessThanOrEqual(xRight);
    }
    expect(city.fences).toHaveLength(4); // two bridges, two rails each
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

describe('sidewalks, crosswalks and parking', () => {
  const city = buildCity({ cols: 20, rows: 20, tile: 64, block: 5, margin: 18 });

  it('rings every building with sidewalk strips', () => {
    expect(city.sidewalks.length).toBe(city.buildings.length * 4);
    // A sidewalk strip never sits inside the building it hugs.
    const b = city.buildings[0];
    for (const s of city.sidewalks) {
      const insideBuilding =
        s.x >= b.x && s.x + s.w <= b.x + b.w && s.y >= b.y && s.y + s.h <= b.y + b.h;
      expect(insideBuilding).toBe(false);
    }
  });

  it('places crosswalks on the road approaches to each intersection', () => {
    expect(city.crosswalks.length).toBeGreaterThan(0);
    const { block, tile } = city.spec;
    const expectedSpan = (tile - CROSSWALK_ROAD_MARGIN * 2) * CROSSWALK_WIDTH_RATIO;
    for (const cw of city.crosswalks) {
      const tx = Math.round(cw.x / city.spec.tile);
      const ty = Math.round(cw.y / city.spec.tile);
      // A crossing tile is a road tile with exactly one coordinate on a block
      // edge (the road line) and the other one tile off it (the approach) —
      // i.e. adjacent to an intersection, never the junction tile itself.
      const onColLine = tx % block === 0;
      const onRowLine = ty % block === 0;
      expect(onColLine !== onRowLine).toBe(true); // exactly one, not both
      expect(city.isRoad(tx, ty)).toBe(true);
      if (onColLine) {
        expect(cw.x).toBe(tx * tile);
        expect(cw.w).toBe(tile);
        expect(cw.h).toBe(expectedSpan);
      } else {
        expect(cw.y).toBe(ty * tile);
        expect(cw.w).toBe(expectedSpan);
        expect(cw.h).toBe(tile);
      }
    }
  });

  it('places parking bays that are not inside any building', () => {
    expect(city.parkingSpots.length).toBeGreaterThan(0);
    for (const spot of city.parkingSpots) {
      const inBuilding = city.buildings.some((b) => pointInRect(spot.pos, b));
      expect(inBuilding).toBe(false);
    }
  });

  it('parks right against a sidewalk with no gap', () => {
    // Every bay sits within a car-inset of some sidewalk strip (no empty space).
    for (const spot of city.parkingSpots.slice(0, 50)) {
      const nearest = Math.min(
        ...city.sidewalks.map((s) =>
          Math.hypot(
            spot.pos.x - Math.max(s.x, Math.min(spot.pos.x, s.x + s.w)),
            spot.pos.y - Math.max(s.y, Math.min(spot.pos.y, s.y + s.h)),
          ),
        ),
      );
      expect(nearest).toBeLessThanOrEqual(12); // PARK_INSET-ish: flush to the kerb
    }
  });

  it('keeps parking bays out of the water', () => {
    const withRiver = buildCity({
      cols: 20,
      rows: 20,
      tile: 64,
      block: 5,
      rivers: [{ orientation: 'horizontal', start: 11, span: 3 }],
    });
    for (const spot of withRiver.parkingSpots) {
      const tx = Math.floor(spot.pos.x / withRiver.spec.tile);
      const ty = Math.floor(spot.pos.y / withRiver.spec.tile);
      expect(withRiver.isWater(tx, ty)).toBe(false);
    }
  });
});

describe('randomPointInRect', () => {
  it('returns a point inside the rect', () => {
    const r = rect(10, 20, 30, 40);
    expect(randomPointInRect(r, () => 0.5)).toEqual(vec2(25, 40));
    const p = randomPointInRect(r, () => 0.99);
    expect(pointInRect(p, r)).toBe(true);
  });
});
