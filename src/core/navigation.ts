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
  /** How a walker should aim for the next walkable cell. */
  waypointMode?: 'center' | 'entry';
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
  return { cols, rows, tile, waypointMode: 'center', walkable };
}

/**
 * Build a calmer-foot-traffic grid: sidewalks, marked crosswalks, bridges, and
 * other dry non-road open ground are walkable, but ordinary road lanes are not.
 * This keeps wandering pedestrians on the pavement unless a crossing/bridge is
 * the intended safe route.
 */
export function buildPedestrianNavGrid(city: City): NavGrid {
  const base = city.spec.tile;
  const cell = Math.max(8, Math.floor(base / 8));
  const cols = Math.ceil(city.width / cell);
  const rows = Math.ceil(city.height / cell);
  const bridgeCols = new Set<number>();
  const bridgeRows = new Set<number>();
  for (let ty = 0; ty < city.spec.rows; ty++) {
    for (let tx = 0; tx < city.spec.cols; tx++) {
      if (!city.isBridge(tx, ty)) continue;
      bridgeCols.add(tx);
      bridgeRows.add(ty);
    }
  }
  const walkable: boolean[] = new Array(cols * rows).fill(false);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const centre = vec2(cx * cell + cell / 2, cy * cell + cell / 2);
      const tx = Math.floor(centre.x / base);
      const ty = Math.floor(centre.y / base);
      if (city.isWater(tx, ty)) continue;
      const onSidewalk = city.sidewalks.some((sidewalk) => pointInRect(centre, sidewalk));
      const onCrosswalk = city.crosswalks.some((crosswalk) => pointInRect(centre, crosswalk));
      const onBridgeApproach = city.isRoad(tx, ty) && (bridgeCols.has(tx) || bridgeRows.has(ty));
      if (onSidewalk || onCrosswalk || city.isBridge(tx, ty) || onBridgeApproach) {
        walkable[cy * cols + cx] = true;
        continue;
      }
      if (!city.isRoad(tx, ty) && !city.buildings.some((b) => pointInRect(centre, b))) {
        walkable[cy * cols + cx] = true;
      }
    }
  }
  return { cols, rows, tile: cell, waypointMode: 'entry', walkable };
}

/** Pixel centre of a tile. */
function tileCentre(grid: NavGrid, tx: number, ty: number): Vec2 {
  return vec2(tx * grid.tile + grid.tile / 2, ty * grid.tile + grid.tile / 2);
}

/** The walkable tile nearest to (tx, ty), searched in growing rings, or null.
 * When a flow field is supplied, prefer a nearby reachable tile with the lowest
 * remaining distance to the target, so an actor nudged just off the grid still
 * snaps back onto the route rather than the merely closest safe cell. */
function nearestWalkable(
  grid: NavGrid,
  tx: number,
  ty: number,
  field?: FlowField,
): { tx: number; ty: number } | null {
  const here = inBounds(grid, tx, ty) ? ty * grid.cols + tx : -1;
  if (isWalkable(grid, tx, ty) && (!field || field[here] !== -1)) return { tx, ty };
  const maxR = Math.max(grid.cols, grid.rows);
  for (let r = 1; r <= maxR; r++) {
    let best: { tx: number; ty: number; dist: number; flow: number } | null = null;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring perimeter only
        const nx = tx + dx;
        const ny = ty + dy;
        if (!isWalkable(grid, nx, ny)) continue;
        const flow = field ? field[ny * grid.cols + nx] : 0;
        if (field && flow === -1) continue;
        const dist = Math.abs(dx) + Math.abs(dy);
        if (!best || flow < best.flow || (flow === best.flow && dist < best.dist)) {
          best = { tx: nx, ty: ny, dist, flow };
        }
      }
    }
    if (best) return { tx: best.tx, ty: best.ty };
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

/** A point just inside the tile nearest to `from`, so a walker can enter a
 * narrow safe cell (crosswalk edge, sidewalk strip, bridge apron) without first
 * stepping through the unsafe space outside it. */
function tileEntryPoint(grid: NavGrid, tx: number, ty: number, from: Vec2): Vec2 {
  const x0 = tx * grid.tile;
  const y0 = ty * grid.tile;
  const x1 = x0 + grid.tile;
  const y1 = y0 + grid.tile;
  const eps = Math.min(1, grid.tile / 8);
  const x = Math.max(x0 + eps, Math.min(x1 - eps, from.x));
  const y = Math.max(y0 + eps, Math.min(y1 - eps, from.y));
  return vec2(x, y);
}

function waypointPoint(grid: NavGrid, tx: number, ty: number, from: Vec2): Vec2 {
  return grid.waypointMode === 'entry' ? tileEntryPoint(grid, tx, ty, from) : tileCentre(grid, tx, ty);
}

export interface FlowTile {
  tx: number;
  ty: number;
}

/**
 * The next point a foot NPC at `from` should steer toward to follow the flow
 * field to its target: the centre of the adjacent walkable tile closest to the
 * target. Returns null when already in the target's tile (caller should then
 * home directly) or when no route exists. Pure.
 */
export function flowNextTile(grid: NavGrid, field: FlowField, from: Vec2): FlowTile | null {
  const tx = Math.floor(from.x / grid.tile);
  const ty = Math.floor(from.y / grid.tile);

  // Off the walkable grid (e.g. nudged into a margin): aim for the nearest tile.
  if (!isWalkable(grid, tx, ty)) {
    const near = nearestWalkable(grid, tx, ty, field);
    return near ? { tx: near.tx, ty: near.ty } : null;
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
  return bestTile;
}

export function flowWaypointForTile(grid: NavGrid, tile: FlowTile, from: Vec2): Vec2 {
  return waypointPoint(grid, tile.tx, tile.ty, from);
}

export function flowWaypoint(grid: NavGrid, field: FlowField, from: Vec2): Vec2 | null {
  const tile = flowNextTile(grid, field, from);
  return tile ? flowWaypointForTile(grid, tile, from) : null;
}
