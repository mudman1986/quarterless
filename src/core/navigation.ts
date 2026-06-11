import { type Vec2, vec2 } from './vector';
import { type City } from './city';
import { pointInRect } from './collision';

/**
 * Generic on-foot navigation over the city, the walking counterpart to the
 * shared road-vehicle model. A {@link NavGrid} marks which tiles a pedestrian or
 * officer can stand on; a breadth-first {@link FlowField} from a target tile then
 * lets any number of foot NPCs follow the shortest walkable route to it —
 * around buildings rather than grinding straight into them. Pure and engine
 * agnostic, so it is fully unit testable.
 */
export interface NavGrid {
  cols: number;
  rows: number;
  tile: number;
  /** Walkable flag per tile, indexed `ty * cols + tx`. */
  walkable: readonly boolean[];
}

/** Distance in steps from each tile to the flow-field target; -1 = unreachable. */
export type FlowField = Int32Array;

function inBounds(grid: NavGrid, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < grid.cols && ty < grid.rows;
}

/** Whether a tile exists and can be walked on. */
export function isWalkable(grid: NavGrid, tx: number, ty: number): boolean {
  return inBounds(grid, tx, ty) && grid.walkable[ty * grid.cols + tx];
}

/**
 * Build a walkability grid for a city: a tile is walkable when it is on the map,
 * not water, and its centre is not inside a building. (With block buildings that
 * leaves the road network and open ground, so foot NPCs route along the streets.)
 * Pure.
 */
export function buildNavGrid(city: City): NavGrid {
  const { cols, rows, tile } = city.spec;
  const walkable: boolean[] = new Array(cols * rows).fill(false);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (city.isWater(tx, ty)) continue;
      const centre = vec2(tx * tile + tile / 2, ty * tile + tile / 2);
      if (!city.buildings.some((b) => pointInRect(centre, b))) {
        walkable[ty * cols + tx] = true;
      }
    }
  }
  return { cols, rows, tile, walkable };
}

/** The walkable tile nearest to (tx, ty), searched in growing rings, or null. */
function nearestWalkable(grid: NavGrid, tx: number, ty: number): { tx: number; ty: number } | null {
  if (isWalkable(grid, tx, ty)) return { tx, ty };
  const maxR = Math.max(grid.cols, grid.rows);
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring perimeter only
        if (isWalkable(grid, tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
      }
    }
  }
  return null;
}

const NEIGHBOURS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Breadth-first distance field over walkable tiles, measured from the tile
 * containing `target` (or the nearest walkable tile to it). Every reachable tile
 * holds its step-distance to the target; unreachable tiles stay -1. Pure.
 */
export function computeFlowField(grid: NavGrid, target: Vec2): FlowField {
  const field = new Int32Array(grid.cols * grid.rows).fill(-1);
  const start = nearestWalkable(
    grid,
    Math.floor(target.x / grid.tile),
    Math.floor(target.y / grid.tile),
  );
  if (!start) return field;

  const queue: number[] = [start.ty * grid.cols + start.tx];
  field[queue[0]] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const tx = cell % grid.cols;
    const ty = Math.floor(cell / grid.cols);
    const dist = field[cell];
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (!isWalkable(grid, nx, ny)) continue;
      const ni = ny * grid.cols + nx;
      if (field[ni] !== -1) continue; // already visited
      field[ni] = dist + 1;
      queue.push(ni);
    }
  }
  return field;
}

/** Pixel centre of a tile. */
function tileCentre(grid: NavGrid, tx: number, ty: number): Vec2 {
  return vec2(tx * grid.tile + grid.tile / 2, ty * grid.tile + grid.tile / 2);
}

/**
 * The next point a foot NPC at `from` should steer toward to follow the flow
 * field to its target: the centre of the adjacent walkable tile closest to the
 * target. Returns null when already in the target's tile (caller should then
 * home directly) or when no route exists. Pure.
 */
export function flowWaypoint(grid: NavGrid, field: FlowField, from: Vec2): Vec2 | null {
  const tx = Math.floor(from.x / grid.tile);
  const ty = Math.floor(from.y / grid.tile);

  // Off the walkable grid (e.g. nudged into a margin): aim for the nearest tile.
  if (!isWalkable(grid, tx, ty)) {
    const near = nearestWalkable(grid, tx, ty);
    if (!near) return null;
    return tileCentre(grid, near.tx, near.ty);
  }

  const here = field[ty * grid.cols + tx];
  if (here <= 0) return null; // at (or unreachable from) the target tile

  let best = here;
  let bestTile: { tx: number; ty: number } | null = null;
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (!isWalkable(grid, nx, ny)) continue;
    const d = field[ny * grid.cols + nx];
    if (d !== -1 && d < best) {
      best = d;
      bestTile = { tx: nx, ty: ny };
    }
  }
  return bestTile ? tileCentre(grid, bestTile.tx, bestTile.ty) : null;
}
