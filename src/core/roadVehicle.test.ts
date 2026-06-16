import { describe, it, expect } from 'vitest';
import {
  stepRoadVehicle,
  seekChooser,
  wanderChooser,
  nearestCardinal,
  laneCentersForRoad,
  openDirections,
  routeDirections,
  roadAt,
  tileCoord,
  laneCross,
  isSameDir,
  isOppositeDir,
  type RoadVehicle,
  type DirectionChooser,
} from './roadVehicle';
import { buildCity, tileCenter, type City } from './city';
import { vec2, type Vec2 } from './vector';

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

  it('lists same-direction lane centres on a wide road', () => {
    const wide = buildCity({ cols: 18, rows: 18, tile: 64, block: 6, roadWidth: 4 });
    const lanes = laneCentersForRoad(wide, tileCenter(wide.spec, 6, 2), vec2(1, 0));
    expect(lanes).toHaveLength(2);
    expect(lanes[0]!.y).toBeCloseTo(tileCenter(wide.spec, 6, 2).y);
    expect(lanes[1]!.y).toBeCloseTo(tileCenter(wide.spec, 6, 3).y);
  });
});

describe('stepRoadVehicle on wide roads', () => {
  const wide = buildCity({ cols: 18, rows: 18, tile: 64, block: 6, roadWidth: 4 });
  const insideWide = (p: { x: number; y: number }): boolean =>
    wide.buildings.some((b) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h);

  it('stays aligned to its chosen lane on a multi-lane street', () => {
    const start = tileCenter(wide.spec, 6, 3);
    const v: RoadVehicle = { pos: start, heading: 0, dir: vec2(1, 0) };
    const next = stepRoadVehicle(v, wide, DT, 130, wanderChooser(() => 0.9, 0.35));
    expect(next.pos.x).toBeGreaterThan(start.x);
    expect(next.pos.y).toBeCloseTo(start.y);
  });

  it('does not hard-snap sideways while cruising inside the same road band', () => {
    const start = vec2(tileCenter(wide.spec, 6, 2).x, tileCenter(wide.spec, 6, 2).y + 12);
    const v: RoadVehicle = { pos: start, heading: 0, dir: vec2(1, 0) };
    const next = stepRoadVehicle(v, wide, DT, 130, wanderChooser(() => 0.9, 0.35));
    // It eases gently back toward the lane centre but never jumps there.
    expect(Math.abs(next.pos.y - start.y)).toBeLessThan(5);
  });

  it('never teleports sideways when turning at junctions on a wide road', () => {
    // Force a turn at every junction and confirm each tick only ever moves a
    // little: a forward step plus a capped lane-keeping ease, never a multi-lane
    // snap across the 4-wide band (the disappear/reappear bug).
    let v: RoadVehicle = { pos: tileCenter(wide.spec, 3, 6), heading: Math.PI / 2, dir: vec2(0, 1) };
    const cruise = 200 * DT;
    for (let i = 0; i < 600; i++) {
      const prev = v.pos;
      v = stepRoadVehicle(v, wide, DT, 200, wanderChooser(() => 0, 1)); // always turn when able
      const moved = Math.hypot(v.pos.x - prev.x, v.pos.y - prev.y);
      expect(moved).toBeLessThan(cruise + 36); // forward + at most a half-tile pivot
      expect(insideWide(v.pos)).toBe(false);
    }
  });
});

describe('seekChooser', () => {
  it('picks the option pointing most toward the target', () => {
    const choose = seekChooser(vec2(1000, 0)); // far east
    const options = [vec2(0, 1), vec2(1, 0), vec2(0, -1)];
    expect(choose(options, vec2(0, 1), vec2(0, 0))).toEqual(vec2(1, 0));
  });

  it('diverts onto a side road rather than doubling back', () => {
    const choose = seekChooser(vec2(-1000, 0)); // target lies straight behind
    const options = [vec2(-1, 0), vec2(0, 1)]; // reverse (toward target) or turn
    // Even though reversing points right at the target, it takes the side road
    // so a blocked vehicle routes around the obstacle instead of oscillating.
    expect(choose(options, vec2(1, 0), vec2(0, 0))).toEqual(vec2(0, 1));
  });

  it('still reverses when the way back is the only option', () => {
    const choose = seekChooser(vec2(-1000, 0));
    const chosen = choose([vec2(-1, 0)], vec2(1, 0), vec2(0, 0));
    expect(chosen.x).toBe(-1); // a genuine dead end: turning back is allowed
    expect(chosen.y).toBeCloseTo(0);
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

describe('stepRoadVehicle keeps its lane through a turn', () => {
  // A two-lanes-each-way grid with a clear block between junctions: road bands
  // run at columns/rows 0-3, 8-11 and 16-19, so rows 4-7 are a full block of
  // plain road with no crossing and the junction sits at columns 8-11 x rows
  // 8-11.
  const grid = buildCity({ cols: 24, rows: 24, tile: 64, block: 8, roadWidth: 4 });
  const spec = grid.spec;
  const junctionBand = 8;

  const rightTurn = (dir: Vec2): Vec2 => vec2(-dir.y, dir.x);
  const leftTurn = (dir: Vec2): Vec2 => vec2(dir.y, -dir.x);

  const rightHandLaneIndices = (dir: Vec2): number[] =>
    dir.x > 0 || dir.y < 0 ? [2, 3] : [1, 0];

  const lanePoint = (dir: Vec2, alongTile: number, laneIndex: number): Vec2 =>
    dir.x !== 0
      ? tileCenter(spec, alongTile, junctionBand + laneIndex)
      : tileCenter(spec, junctionBand + laneIndex, alongTile);

  const laneCrossFor = (dir: Vec2, laneIndex: number): number =>
    laneCross(lanePoint(dir, 0, laneIndex), dir);

  const startVehicle = (dir: Vec2, laneKind: 'inner' | 'kerb'): RoadVehicle => {
    const lanes = rightHandLaneIndices(dir);
    const laneIndex = laneKind === 'inner' ? lanes[0]! : lanes[lanes.length - 1]!;
    const alongTile = dir.x > 0 || dir.y > 0 ? 4 : 15;
    return {
      pos: lanePoint(dir, alongTile, laneIndex),
      heading: Math.atan2(dir.y, dir.x),
      dir,
    };
  };

  const inJunction = (p: Vec2): boolean => {
    const { tx, ty } = tileCoord(spec, p);
    return tx >= junctionBand && tx < junctionBand + 4 && ty >= junctionBand && ty < junctionBand + 4;
  };

  // A driver that turns onto `turnDir` the moment that road is offered (which,
  // with junction-only turning, can only happen at the intersection) and
  // otherwise carries straight on down its lane.
  const forceTurn =
    (turnDir: Vec2): DirectionChooser =>
    (options, current) =>
      options.find((o) => isSameDir(o, turnDir)) ??
      options.find((o) => isSameDir(o, current)) ??
      current;

  const driveScenario = (startDir: Vec2, turnDir: Vec2, startLane: 'inner' | 'kerb') => {
    let v = startVehicle(startDir, startLane);
    const start = v.pos;
    const targetLane = isOppositeDir(startDir, turnDir)
      ? rightHandLaneIndices(turnDir)[0]!
      : isSameDir(turnDir, rightTurn(startDir))
        ? rightHandLaneIndices(turnDir).at(-1)!
        : rightHandLaneIndices(turnDir)[0]!;
    const targetCross = laneCrossFor(turnDir, targetLane);
    let turnedAt = -1;
    let settledAt = -1;
    let firstTurnPos = start;
    let maxPreTurnLaneDrift = 0;
    let maxStep = 0;
    for (let i = 0; i < 300; i++) {
      const prev = v.pos;
      const prevDir = v.dir;
      v = stepRoadVehicle(v, grid, DT, 130, forceTurn(turnDir));
      maxStep = Math.max(maxStep, Math.hypot(v.pos.x - prev.x, v.pos.y - prev.y));
      if (turnedAt < 0 && !isSameDir(v.dir, prevDir)) {
        turnedAt = i;
        firstTurnPos = v.pos;
      }
      if (turnedAt < 0) {
        maxPreTurnLaneDrift = Math.max(
          maxPreTurnLaneDrift,
          Math.abs(laneCross(v.pos, startDir) - laneCross(start, startDir)),
        );
      }
      if (turnedAt >= 0 && Math.abs(laneCross(v.pos, turnDir) - targetCross) < 1) {
        settledAt = i;
        break;
      }
    }
    return { v, turnedAt, settledAt, firstTurnPos, maxPreTurnLaneDrift, maxStep, targetCross };
  };

  it.each([
    ['eastbound', vec2(1, 0)],
    ['southbound', vec2(0, 1)],
    ['westbound', vec2(-1, 0)],
    ['northbound', vec2(0, -1)],
  ])('drives a block then turns right from the kerb lane (%s)', (_label, startDir) => {
    const turnDir = rightTurn(startDir);
    const result = driveScenario(startDir, turnDir, 'kerb');

    expect(result.turnedAt).toBeGreaterThan(0);
    expect(inJunction(result.firstTurnPos)).toBe(true);
    expect(result.maxPreTurnLaneDrift).toBeLessThan(1);
    expect(result.maxStep).toBeLessThan(6);
    expect(result.settledAt).toBeGreaterThan(result.turnedAt);
    expect(isSameDir(result.v.dir, turnDir)).toBe(true);
    expect(Math.abs(laneCross(result.v.pos, turnDir) - result.targetCross)).toBeLessThan(1);
  });

  it.each([
    ['eastbound', vec2(1, 0)],
    ['southbound', vec2(0, 1)],
    ['westbound', vec2(-1, 0)],
    ['northbound', vec2(0, -1)],
  ])('drives a block then turns left from the inner lane (%s)', (_label, startDir) => {
    const turnDir = leftTurn(startDir);
    const result = driveScenario(startDir, turnDir, 'inner');

    expect(result.turnedAt).toBeGreaterThan(0);
    expect(inJunction(result.firstTurnPos)).toBe(true);
    expect(result.maxPreTurnLaneDrift).toBeLessThan(1);
    expect(result.maxStep).toBeLessThan(6);
    expect(result.settledAt).toBeGreaterThan(result.turnedAt);
    expect(isSameDir(result.v.dir, turnDir)).toBe(true);
    expect(Math.abs(laneCross(result.v.pos, turnDir) - result.targetCross)).toBeLessThan(1);
  });

  it('does not offer a U-turn on an ordinary continuing road', () => {
    const options = routeDirections(grid, 5, 10, vec2(1, 0));
    expect(options.some((o) => isSameDir(o, vec2(1, 0)))).toBe(true);
    expect(options.some((o) => isSameDir(o, vec2(-1, 0)))).toBe(false);
  });

  it('does not turn into a road that dead-ends before leaving the junction', () => {
    const riverCity = buildCity({
      cols: 70,
      rows: 70,
      tile: 64,
      block: 7,
      roadWidth: 4,
      rivers: [{ orientation: 'horizontal', start: 32, span: 3, bridgeEvery: 2 }],
    });
    const options = routeDirections(riverCity, 21, 38, vec2(1, 0), true);

    expect(options.some((o) => isSameDir(o, vec2(1, 0)))).toBe(true);
    expect(options.some((o) => isSameDir(o, vec2(0, -1)))).toBe(false);
  });

  it('only U-turns at a dead end, then settles into the opposite inner lane', () => {
    let v: RoadVehicle = { pos: tileCenter(spec, 23, 10), heading: 0, dir: vec2(1, 0) };
    const turnDir = vec2(-1, 0);
    const targetCross = laneCrossFor(turnDir, rightHandLaneIndices(turnDir)[0]!);
    let turnedAt = -1;
    let maxStep = 0;

    for (let i = 0; i < 240; i++) {
      const prev = v;
      v = stepRoadVehicle(v, grid, DT, 130, forceTurn(turnDir));
      maxStep = Math.max(maxStep, Math.hypot(v.pos.x - prev.pos.x, v.pos.y - prev.pos.y));
      if (turnedAt < 0 && !isSameDir(v.dir, prev.dir)) turnedAt = i;
      const { tx, ty } = tileCoord(spec, v.pos);
      expect(roadAt(grid, tx, ty)).toBe(true);
    }

    expect(turnedAt).toBeGreaterThanOrEqual(0);
    expect(maxStep).toBeLessThan(40);
    expect(v.dir).toEqual(turnDir);
    expect(laneCross(v.pos, turnDir)).toBeCloseTo(targetCross, 1);
  });

  it('does not chain several turns inside one wide intersection into a U-turn', () => {
    let seed = 1;
    const rng = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let v = startVehicle(vec2(1, 0), 'inner');
    const choose = wanderChooser(rng, 1); // turn whenever a turn is offered
    let entered = false;
    let exited = false;
    let entryDir = v.dir;
    let exitDir = v.dir;
    let turnsInside = 0;

    for (let i = 0; i < 300; i++) {
      const before = v;
      const wasInside = inJunction(before.pos);
      v = stepRoadVehicle(v, grid, DT, 130, choose);
      const nowInside = inJunction(v.pos);
      if (!entered && !wasInside && nowInside) {
        entered = true;
        entryDir = before.dir;
      }
      if (entered && !isSameDir(before.dir, v.dir)) turnsInside++;
      if (entered && wasInside && !nowInside) {
        exited = true;
        exitDir = v.dir;
        break;
      }
    }

    expect(exited).toBe(true);
    expect(turnsInside).toBe(1);
    expect(isOppositeDir(entryDir, exitDir)).toBe(false);
  });
});
