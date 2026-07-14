import {
  boundaryWalls,
  buildCity,
  CROSSWALK_BELT_WIDTH,
  crosswalkStripeRects,
  DEFAULT_CITY,
  nearestRoadTileCenter,
  roadStandoffPoint,
  tileCenter,
} from './city';
import { describe, it, expect } from 'vitest';
import { rect, circleIntersectsRect, pointInRect, randomPointInRect } from './collision';
import { CITY_SPEC } from '../game/citySpec';
import { vec2 } from './vector';
import { distance } from './vector';

const overlapsRect = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

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
    expect(kinds).toEqual(new Set(['policeStation', 'hospital', 'towYard', 'taxiDepot']));
    expect(
      city.facilities.reduce(
        (counts, facility) => {
          counts[facility.kind] += 1;
          return counts;
        },
        { policeStation: 0, hospital: 0, towYard: 0, taxiDepot: 0 },
      ),
    ).toEqual({ policeStation: 2, hospital: 2, towYard: 2, taxiDepot: 2 });
    expect(new Set(city.facilities.map((f) => f.buildingIndex)).size).toBe(city.facilities.length);
    for (const facility of city.facilities) {
      // The on-foot spawn is the doorstep on the pavement: on a sidewalk strip,
      // never inside the building wall, and never out on the road.
      expect(city.buildings.some((b) => pointInRect(facility.spawn, b))).toBe(false);
      expect(city.sidewalks.some((s) => pointInRect(facility.spawn, s))).toBe(true);
      // The vehicle spawn sits on a road tile, clear of any building.
      const insideBuilding = city.buildings.some((b) => pointInRect(facility.roadSpawn, b));
      expect(insideBuilding).toBe(false);
      const tx = Math.floor(facility.roadSpawn.x / city.spec.tile);
      const ty = Math.floor(facility.roadSpawn.y / city.spec.tile);
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
    // The east approach of the top-left junction crosses the horizontal road
    // band kerb to kerb: a belt-thick strip the full road width tall.
    const tile = city.spec.tile;
    const east = city.crosswalks.find((cw) => cw.x === 4 * tile && cw.y === 0 && cw.w === CROSSWALK_BELT_WIDTH);
    expect(east).toBeDefined();
    expect(east!.h).toBe(4 * tile); // full road band, kerb to kerb
  });

  it('moves facility spawns when the building footprint moves', () => {
    const snug = buildCity({ cols: 20, rows: 20, tile: 64, block: 6, roadWidth: 4, margin: 9, sidewalkWidth: 20 });
    const roomy = buildCity({ cols: 20, rows: 20, tile: 64, block: 6, roadWidth: 4, margin: 21, sidewalkWidth: 20 });
    const snugPolice = snug.facilities.find((f) => f.kind === 'policeStation');
    const roomyPolice = roomy.facilities.find((f) => f.kind === 'policeStation');
    expect(snugPolice).toBeDefined();
    expect(roomyPolice).toBeDefined();
    expect(snugPolice!.spawn).not.toEqual(roomyPolice!.spawn);
    expect(snugPolice!.roadSpawn).not.toEqual(roomyPolice!.roadSpawn);
  });
});

describe('buildCity with the live wide river layout', () => {
  const city = buildCity(CITY_SPEC);
  const { block, roadWidth, tile, margin } = {
    block: CITY_SPEC.block,
    roadWidth: CITY_SPEC.roadWidth!,
    tile: CITY_SPEC.tile,
    margin: CITY_SPEC.margin!,
  };
  const singleSize = (block - roadWidth) * tile - 2 * margin;
  const doubleSize = (2 * block - roadWidth) * tile - 2 * margin;
  const riverSplitSize = doubleSize - CITY_SPEC.rivers![0].span * tile;

  it('keeps full-size (merged) building footprints beside the river instead of clipping them into slivers', () => {
    // With mergeBlocks on, footprints are one block (single), two fused blocks
    // (double), or a two-block block halved by the river band — never a thin
    // clipped sliver. Every side matches one of those authored sizes.
    const allowed = new Set([singleSize, doubleSize, riverSplitSize]);
    expect(city.buildings.every((b) => allowed.has(b.w) && allowed.has(b.h))).toBe(true);
    expect(city.buildings.every((b) => b.w >= singleSize && b.h >= singleSize)).toBe(true);
  });

  it('does not place sidewalk strips over the water band', () => {
    const wetSidewalk = city.sidewalks.some((sidewalk) => city.water.some((water) => overlapsRect(sidewalk, water)));
    expect(wetSidewalk).toBe(false);
  });

  it('keeps crosswalks off the sidewalks', () => {
    const overlapping = city.crosswalks.some((crosswalk) => city.sidewalks.some((sidewalk) => overlapsRect(crosswalk, sidewalk)));
    expect(overlapping).toBe(false);
  });

  it('does not let crosswalks extend into the water band', () => {
    const wetCrosswalk = city.crosswalks.some((crosswalk) => city.water.some((water) => overlapsRect(crosswalk, water)));
    expect(wetCrosswalk).toBe(false);
  });

  it('keeps every in-bounds crosswalk exit on dry land', () => {
    const { cols, rows, tile } = city.spec;
    for (const crosswalk of city.crosswalks) {
      const centerTx = Math.floor((crosswalk.x + crosswalk.w / 2) / tile);
      const centerTy = Math.floor((crosswalk.y + crosswalk.h / 2) / tile);
      if (crosswalk.w > crosswalk.h) {
        const leftTx = Math.floor((crosswalk.x - 1) / tile);
        const rightTx = Math.floor((crosswalk.x + crosswalk.w + 1) / tile);
        if (leftTx >= 0 && leftTx < cols) expect(city.isWater(leftTx, centerTy)).toBe(false);
        if (rightTx >= 0 && rightTx < cols) expect(city.isWater(rightTx, centerTy)).toBe(false);
      } else {
        const topTy = Math.floor((crosswalk.y - 1) / tile);
        const bottomTy = Math.floor((crosswalk.y + crosswalk.h + 1) / tile);
        if (topTy >= 0 && topTy < rows) expect(city.isWater(centerTx, topTy)).toBe(false);
        if (bottomTy >= 0 && bottomTy < rows) expect(city.isWater(centerTx, bottomTy)).toBe(false);
      }
    }
  });

  it('never runs a road tile through the water, so traffic cannot drive into the river', () => {
    let roadWater = 0;
    for (let ty = 0; ty < CITY_SPEC.rows; ty++) {
      for (let tx = 0; tx < CITY_SPEC.cols; tx++) {
        if (city.isRoad(tx, ty) && city.isWater(tx, ty)) roadWater++;
      }
    }
    expect(roadWater).toBe(0);
  });
});

describe('crosswalkStripeRects', () => {
  it('lays upright zebra bars across a wide crossing over a north-south road', () => {
    // Wide, shallow belt: pedestrians cross east-west and cars run north-south,
    // so the bars are upright (parallel to the cars) and march across in x.
    const cw = rect(0, 300, 256, 56);
    const stripes = crosswalkStripeRects(cw);
    expect(stripes.length).toBeGreaterThan(1);
    expect(stripes.every((s) => s.y === cw.y && s.h === cw.h)).toBe(true); // full belt height
    expect(stripes.every((s) => s.w < s.h)).toBe(true); // upright (thin) bars, not lane lines
    expect(new Set(stripes.map((s) => s.x)).size).toBe(stripes.length); // march along x
    const last = stripes[stripes.length - 1]!;
    expect(last.x + last.w).toBeLessThanOrEqual(cw.x + cw.w + 1e-6);
  });

  it('lays flat zebra bars across a tall crossing over an east-west road', () => {
    // Tall, narrow belt: pedestrians cross north-south and cars run east-west,
    // so the bars are flat (parallel to the cars) and march down in y.
    const cw = rect(400, 0, 56, 256);
    const stripes = crosswalkStripeRects(cw);
    expect(stripes.length).toBeGreaterThan(1);
    expect(stripes.every((s) => s.x === cw.x && s.w === cw.w)).toBe(true); // full belt width
    expect(stripes.every((s) => s.h < s.w)).toBe(true); // flat (thin) bars, not lane lines
    expect(new Set(stripes.map((s) => s.y)).size).toBe(stripes.length); // march down y
    const last = stripes[stripes.length - 1]!;
    expect(last.y + last.h).toBeLessThanOrEqual(cw.y + cw.h + 1e-6);
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

  it('bridges the full width of a wide road band', () => {
    const wide = buildCity({
      cols: 24,
      rows: 24,
      tile: 64,
      block: 6,
      roadWidth: 4,
      rivers: [{ orientation: 'horizontal', start: 11, span: 3, bridgeEvery: 2 }],
    });
    for (let tx = 0; tx < 4; tx++) {
      expect(wide.isWater(tx, 12)).toBe(false);
      expect(wide.isBridge(tx, 12)).toBe(true);
    }
    for (let tx = 6; tx < 10; tx++) {
      expect(wide.isWater(tx, 12)).toBe(true);
      expect(wide.isBridge(tx, 12)).toBe(false);
    }
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
    const { tile } = city.spec;
    const roadSpan = tile; // single-lane roads here (roadWidth defaults to 1)
    for (const cw of city.crosswalks) {
      // Each crossing is a belt spanning a full road band kerb to kerb: one
      // dimension is the road span, the other the zebra belt width.
      const northSouth = cw.w === roadSpan && cw.h === CROSSWALK_BELT_WIDTH;
      const eastWest = cw.w === CROSSWALK_BELT_WIDTH && cw.h === roadSpan;
      expect(northSouth || eastWest).toBe(true);
      // Its centre lies on a dry road tile (an approach), never over water.
      const tx = Math.floor((cw.x + cw.w / 2) / tile);
      const ty = Math.floor((cw.y + cw.h / 2) / tile);
      expect(city.isRoad(tx, ty)).toBe(true);
      expect(city.isWater(tx, ty)).toBe(false);
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

  it('keeps parking bays away from facility vehicle garages', () => {
    for (const candidate of [city, buildCity(CITY_SPEC)]) {
      for (const facility of candidate.facilities) {
        for (const spot of candidate.parkingSpots) {
          expect(
            Math.hypot(spot.pos.x - facility.roadSpawn.x, spot.pos.y - facility.roadSpawn.y),
          ).toBeGreaterThanOrEqual(60);
        }
      }
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

describe('roadStandoffPoint', () => {
  const city = buildCity(CITY_SPEC);

  const onRoad = (p: { x: number; y: number }): boolean => {
    const tx = Math.floor(p.x / city.spec.tile);
    const ty = Math.floor(p.y / city.spec.tile);
    return city.isRoad(tx, ty);
  };

  it('returns a road-tile centre at least minDistance from the anchor', () => {
    const anchor = vec2(city.width / 2, city.height / 2);
    const minDistance = city.spec.tile * 3;
    const p = roadStandoffPoint(city, anchor, minDistance);
    expect(onRoad(p)).toBe(true);
    expect(distance(p, anchor)).toBeGreaterThanOrEqual(minDistance);
  });

  it('returns the nearest qualifying road point (none closer satisfies the minimum)', () => {
    const anchor = vec2(city.width / 2, city.height / 2);
    const minDistance = city.spec.tile * 3;
    const p = roadStandoffPoint(city, anchor, minDistance);
    const chosen = distance(p, anchor);
    // No road tile that also clears the minimum sits closer to the anchor.
    for (let tx = 0; tx < city.spec.cols; tx++) {
      for (let ty = 0; ty < city.spec.rows; ty++) {
        if (!city.isRoad(tx, ty)) continue;
        const d = distance(tileCenter(city.spec, tx, ty), anchor);
        if (d >= minDistance) expect(d).toBeGreaterThanOrEqual(chosen);
      }
    }
  });

  it('never returns water, a building interior, or the off-map despawn slot', () => {
    // Sample many anchors; every relocated spawn must be valid drivable ground.
    for (let ax = 0; ax <= city.width; ax += city.spec.tile * 5) {
      for (let ay = 0; ay <= city.height; ay += city.spec.tile * 5) {
        const p = roadStandoffPoint(city, vec2(ax, ay), city.spec.tile * 4);
        const tx = Math.floor(p.x / city.spec.tile);
        const ty = Math.floor(p.y / city.spec.tile);
        expect(city.isRoad(tx, ty)).toBe(true);
        expect(city.isWater(tx, ty)).toBe(false);
        expect(city.buildings.some((b) => pointInRect(p, b))).toBe(false);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('keeps the widest authored squad spread inside the road band', () => {
    // pedestrianSquad members fan out by (count-1)/2 * spread along x. The
    // widest authored squad (count 5, spread 26) reaches 52px from the base
    // point, well inside the 256px (roadWidth 4 x tile 64) road band, so every
    // member stays on drivable ground around any road-tile standoff point.
    const maxHalfSpread = ((5 - 1) / 2) * 26;
    const roadBandHalfWidth = ((city.spec.roadWidth ?? 1) * city.spec.tile) / 2;
    expect(maxHalfSpread).toBeLessThan(roadBandHalfWidth);
  });
});

describe('nearestRoadTileCenter', () => {
  // A full-grid brute-force scan: the ground truth the bounded ring search must match.
  const bruteForceNearest = (city: ReturnType<typeof buildCity>, target: { x: number; y: number }) => {
    let best: { x: number; y: number } | null = null;
    let bestDistance = Infinity;
    for (let tx = 0; tx < city.spec.cols; tx++) {
      for (let ty = 0; ty < city.spec.rows; ty++) {
        if (!city.isRoad(tx, ty)) continue;
        const candidate = tileCenter(city.spec, tx, ty);
        const d = distance(candidate, target);
        if (d < bestDistance) {
          bestDistance = d;
          best = candidate;
        }
      }
    }
    return best;
  };

  const cities = {
    default: buildCity(DEFAULT_CITY),
    live: buildCity(CITY_SPEC),
    river: buildCity({
      ...DEFAULT_CITY,
      rivers: [{ orientation: 'horizontal', start: 6, span: 4, bridgeEvery: 2 }],
    }),
  };

  for (const [name, city] of Object.entries(cities)) {
    it(`matches a full-grid scan across ${name} city sample points`, () => {
      const { width, height, spec } = city;
      const samples: Array<{ x: number; y: number }> = [];
      for (let x = -spec.tile; x <= width + spec.tile; x += spec.tile * 1.5) {
        for (let y = -spec.tile; y <= height + spec.tile; y += spec.tile * 1.5) {
          samples.push(vec2(x, y));
        }
      }
      for (const target of samples) {
        const bounded = nearestRoadTileCenter(city, target);
        const brute = bruteForceNearest(city, target);
        // Ties (equidistant road tiles) are equally valid, so compare the
        // achieved distance rather than the specific tile chosen.
        expect(bounded).not.toBeNull();
        expect(distance(bounded!, target)).toBeCloseTo(distance(brute!, target), 6);
      }
    }, 15000);

    it(`always returns a drivable, non-water tile for ${name} city`, () => {
      const p = nearestRoadTileCenter(city, vec2(city.width / 2, city.height / 2));
      expect(p).not.toBeNull();
      const tx = Math.floor(p!.x / city.spec.tile);
      const ty = Math.floor(p!.y / city.spec.tile);
      expect(city.isRoad(tx, ty)).toBe(true);
      expect(city.isWater(tx, ty)).toBe(false);
    });
  }

  it('finds the true nearest road for a far off-map query (despawn slot)', () => {
    const city = buildCity(CITY_SPEC);
    const target = vec2(-100000, -100000);
    const bounded = nearestRoadTileCenter(city, target);
    const brute = bruteForceNearest(city, target);
    expect(bounded).not.toBeNull();
    expect(distance(bounded!, target)).toBeCloseTo(distance(brute!, target), 6);
  });

  it('returns null when the city has no road tiles', () => {
    const empty = { ...DEFAULT_CITY, cols: 0, rows: 0 };
    expect(nearestRoadTileCenter(buildCity(empty), vec2(0, 0))).toBeNull();
  });
});

