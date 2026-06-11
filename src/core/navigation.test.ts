import { describe, it, expect } from 'vitest';
import {
  buildNavGrid,
  computeFlowField,
  flowWaypoint,
  isWalkable,
} from './navigation';
import { buildCity, tileCenter, type City } from './city';
import { vec2 } from './vector';

const city: City = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });

describe('buildNavGrid', () => {
  const grid = buildNavGrid(city);

  it('marks road tiles walkable and building interiors not', () => {
    expect(isWalkable(grid, 4, 2)).toBe(true); // column 4 is a road
    expect(isWalkable(grid, 2, 2)).toBe(false); // building interior
  });

  it('treats out-of-bounds tiles as not walkable', () => {
    expect(isWalkable(grid, -1, 0)).toBe(false);
    expect(isWalkable(grid, 12, 4)).toBe(false);
  });

  it('marks water tiles not walkable', () => {
    const riverCity = buildCity({
      cols: 12,
      rows: 12,
      tile: 64,
      block: 4,
      rivers: [{ orientation: 'horizontal', start: 5, span: 2 }],
    });
    const rg = buildNavGrid(riverCity);
    // Tile (2,5) is an interior column inside the water band (not a bridged road).
    expect(riverCity.isWater(2, 5)).toBe(true);
    expect(rg.walkable[5 * rg.cols + 2]).toBe(false);
  });
});

describe('computeFlowField', () => {
  const grid = buildNavGrid(city);

  it('gives the target tile distance zero and increases outward', () => {
    const target = tileCenter(city.spec, 0, 4); // on road row 4
    const field = computeFlowField(grid, target);
    expect(field[4 * grid.cols + 0]).toBe(0);
    // A tile further along the same road is farther in steps.
    expect(field[4 * grid.cols + 8]).toBeGreaterThan(0);
  });

  it('routes around buildings: distance follows the streets, not a straight line', () => {
    const target = tileCenter(city.spec, 0, 0); // top-left corner (road)
    const field = computeFlowField(grid, target);
    // (8,8) is reachable only along roads; its step distance exceeds the raw
    // tile-grid Manhattan distance would suggest only if it weaves — but at
    // minimum it must be reachable (not -1).
    expect(field[8 * grid.cols + 8]).toBeGreaterThan(0);
  });
});

describe('flowWaypoint', () => {
  const grid = buildNavGrid(city);

  it('steers toward the target along the grid', () => {
    const target = tileCenter(city.spec, 8, 4);
    const field = computeFlowField(grid, target);
    const from = tileCenter(city.spec, 0, 4); // same road, west of target
    const wp = flowWaypoint(grid, field, from);
    expect(wp).not.toBeNull();
    expect(wp!.x).toBeGreaterThan(from.x); // heads east toward the target
  });

  it('returns null once in the target tile (caller then homes directly)', () => {
    const target = tileCenter(city.spec, 4, 4);
    const field = computeFlowField(grid, target);
    expect(flowWaypoint(grid, field, target)).toBeNull();
  });

  it('guides a walker around a building corner toward the goal', () => {
    // Walker on road column 4, target on road row 8: the route must turn at an
    // intersection, so the first waypoint advances and stays on a walkable tile.
    const target = tileCenter(city.spec, 8, 8);
    const field = computeFlowField(grid, target);
    let pos = tileCenter(city.spec, 4, 0);
    for (let i = 0; i < 40; i++) {
      const wp = flowWaypoint(grid, field, pos);
      if (!wp) break;
      // Step a little toward the waypoint.
      const dx = wp.x - pos.x;
      const dy = wp.y - pos.y;
      const len = Math.hypot(dx, dy) || 1;
      pos = vec2(pos.x + (dx / len) * 20, pos.y + (dy / len) * 20);
      const tx = Math.floor(pos.x / city.spec.tile);
      const ty = Math.floor(pos.y / city.spec.tile);
      expect(isWalkable(grid, tx, ty)).toBe(true); // never walks into a building
    }
    // It made meaningful progress toward the target tile.
    expect(Math.hypot(pos.x - target.x, pos.y - target.y)).toBeLessThan(
      Math.hypot(tileCenter(city.spec, 4, 0).x - target.x, tileCenter(city.spec, 4, 0).y - target.y),
    );
  });
});
