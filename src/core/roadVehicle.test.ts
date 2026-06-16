import { describe, it, expect } from 'vitest';
import {
  stepRoadVehicle,
  seekChooser,
  wanderChooser,
  nearestCardinal,
  laneCentersForRoad,
  openDirections,
  roadAt,
  tileCoord,
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
  // plain road with no crossing and the junction sits at columns 8-11 × rows
  // 8-11. The southbound lanes of the column-8 band are its eastern half,
  // columns 10 (the right/kerb lane) and 11 (the left lane).
  const grid = buildCity({ cols: 24, rows: 24, tile: 64, block: 8, roadWidth: 4 });
  const spec = grid.spec;

  // A driver that turns onto `turnDir` the moment that road is offered (which,
  // with junction-only turning, can only happen at the intersection) and
  // otherwise carries straight on down its lane.
  const forceTurn =
    (turnDir: Vec2): DirectionChooser =>
    (options, current) =>
      options.find((o) => isSameDir(o, turnDir)) ??
      options.find((o) => isSameDir(o, current)) ??
      current;

  it('drives a block then turns right, ending in the right lane', () => {
    // Start in the right (kerb) southbound lane, column 10, a full block north of
    // the junction.
    const start = tileCenter(spec, 10, 4);
    let v: RoadVehicle = { pos: { ...start }, heading: Math.PI / 2, dir: vec2(0, 1) };
    const driveRight = forceTurn(vec2(-1, 0)); // south -> west is a right turn

    let turnedAt = -1;
    let turnY = 0;
    for (let i = 0; i < 240; i++) {
      const prevDir = v.dir;
      v = stepRoadVehicle(v, grid, DT, 130, driveRight);
      if (turnedAt < 0 && !isSameDir(v.dir, prevDir)) {
        turnedAt = i;
        turnY = v.pos.y;
      }
      // Down the whole block it holds its lane exactly — it never weaves into the
      // neighbouring lane of its own band.
      if (turnedAt < 0) {
        expect(v.pos.x).toBeCloseTo(start.x, 1);
        expect(v.dir).toEqual(vec2(0, 1));
      }
    }

    // It turned exactly once, and only after reaching the junction (row 8+).
    expect(turnedAt).toBeGreaterThan(0);
    expect(turnY).toBeGreaterThanOrEqual(8 * spec.tile);
    expect(v.dir).toEqual(vec2(-1, 0)); // now westbound
    // The right (kerb) lane of the new westbound road is its northern lane,
    // row 8 — it has settled cleanly into it, not into oncoming or astride two.
    expect(v.pos.y).toBeCloseTo(tileCenter(spec, 0, 8).y, 1);
  });

  it('drives a block then turns left, ending in the right lane', () => {
    // Start in the correct lane for a left turn: the left southbound lane,
    // column 11, a full block north of the junction.
    const start = tileCenter(spec, 11, 4);
    let v: RoadVehicle = { pos: { ...start }, heading: Math.PI / 2, dir: vec2(0, 1) };
    const driveLeft = forceTurn(vec2(1, 0)); // south -> east is a left turn

    let turnedAt = -1;
    let turnY = 0;
    for (let i = 0; i < 240; i++) {
      const prevDir = v.dir;
      v = stepRoadVehicle(v, grid, DT, 130, driveLeft);
      if (turnedAt < 0 && !isSameDir(v.dir, prevDir)) {
        turnedAt = i;
        turnY = v.pos.y;
      }
      if (turnedAt < 0) {
        expect(v.pos.x).toBeCloseTo(start.x, 1);
        expect(v.dir).toEqual(vec2(0, 1));
      }
    }

    expect(turnedAt).toBeGreaterThan(0);
    expect(turnY).toBeGreaterThanOrEqual(8 * spec.tile);
    expect(v.dir).toEqual(vec2(1, 0)); // now eastbound
    // The matching eastbound lane for that left turn is its northern lane,
    // row 10 — it has settled cleanly into it.
    expect(v.pos.y).toBeCloseTo(tileCenter(spec, 0, 10).y, 1);
  });
});
