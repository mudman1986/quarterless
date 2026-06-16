import { type Vec2, vec2, add, sub, scale, dot, angle } from './vector';
import { type City, type CitySpec, tileCenter } from './city';

/**
 * Shared "drive along the road grid" model used by every AI-controlled vehicle
 * (NPC traffic, patrol cars, ambulances, tow trucks). A vehicle holds a current
 * cardinal travel direction; each step it advances along that direction and,
 * when it crosses into a new tile, a {@link DirectionChooser} decides which open
 * road to take next. Type-specific behaviour (wander vs. seek a target) lives
 * entirely in the chooser, so all vehicles obey the same road rules and never
 * cut through buildings. Pure and engine-agnostic.
 */
export interface RoadVehicle {
  pos: Vec2;
  /** Facing in radians (derived from `dir`). */
  heading: number;
  /** Unit cardinal direction currently being travelled. */
  dir: Vec2;
}

/** The four cardinal travel directions. */
export const CARDINALS: readonly Vec2[] = [vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1)];

export function isSameDir(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isOppositeDir(a: Vec2, b: Vec2): boolean {
  return a.x === -b.x && a.y === -b.y;
}

/** Tile coordinate containing a pixel position. */
export function tileCoord(spec: CitySpec, pos: Vec2): { tx: number; ty: number } {
  return { tx: Math.floor(pos.x / spec.tile), ty: Math.floor(pos.y / spec.tile) };
}

function inBounds(spec: CitySpec, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < spec.cols && ty < spec.rows;
}

/** Whether a tile exists on the map and is a drivable road lane. */
export function roadAt(city: City, tx: number, ty: number): boolean {
  return inBounds(city.spec, tx, ty) && city.isRoad(tx, ty);
}

function roadWidth(spec: CitySpec): number {
  return Math.max(1, Math.min(spec.block, spec.roadWidth ?? 1));
}

function lanesPerDirection(spec: CitySpec): number {
  return Math.max(1, Math.floor(roadWidth(spec) / 2));
}

function roadBandStart(spec: CitySpec, tileIndex: number): number {
  return Math.floor(tileIndex / spec.block) * spec.block;
}

function laneCenterPx(spec: CitySpec, bandStart: number, lane: number): number {
  return (bandStart + lane) * spec.tile + spec.tile / 2;
}

function laneIndicesForDirection(spec: CitySpec, dir: Vec2): number[] {
  const width = roadWidth(spec);
  const perDirection = lanesPerDirection(spec);
  if (dir.x > 0 || dir.y > 0) {
    return Array.from({ length: perDirection }, (_, i) => width - perDirection + i);
  }
  return Array.from({ length: perDirection }, (_, i) => perDirection - 1 - i);
}

function lanePosition(spec: CitySpec, pos: Vec2, dir: Vec2, lane: number): Vec2 {
  const tile = tileCoord(spec, pos);
  if (dir.x !== 0) {
    const bandStart = roadBandStart(spec, tile.ty);
    return vec2(pos.x, laneCenterPx(spec, bandStart, lane));
  }
  const bandStart = roadBandStart(spec, tile.tx);
  return vec2(laneCenterPx(spec, bandStart, lane), pos.y);
}

function nearestLane(spec: CitySpec, pos: Vec2, dir: Vec2): number {
  const candidates = laneIndicesForDirection(spec, dir);
  const lateral = dir.x !== 0 ? pos.y : pos.x;
  const tile = tileCoord(spec, pos);
  const bandStart = roadBandStart(spec, dir.x !== 0 ? tile.ty : tile.tx);
  return candidates.reduce((best, lane) => {
    const bestDelta = Math.abs(lateral - laneCenterPx(spec, bandStart, best));
    const laneDelta = Math.abs(lateral - laneCenterPx(spec, bandStart, lane));
    return laneDelta < bestDelta ? lane : best;
  }, candidates[0]!);
}

function alignToLane(spec: CitySpec, pos: Vec2, dir: Vec2): Vec2 {
  return lanePosition(spec, pos, dir, nearestLane(spec, pos, dir));
}

/** Pixels per second a cruising vehicle drifts back toward its lane centre. Kept
 * close to traffic speed so a turn settles into the new lane within the junction
 * rather than snapping there in a single frame (the disappear/reappear bug). */
const LANE_KEEP_RATE = 130;

/** The cross-travel (lateral) coordinate of a point for a travel direction:
 * the y for an east/west mover, the x for a north/south mover. */
export function laneCross(p: Vec2, dir: Vec2): number {
  return dir.x !== 0 ? p.y : p.x;
}

/** Ease the lateral (cross-travel) position toward a lane centre, capped per
 * frame. With an explicit `targetLateral` (a committed lane change) it eases to
 * that lane; otherwise it drifts toward the nearest lane centre of the current
 * direction so turns and stray drift settle smoothly. Pure. */
function easeToLane(spec: CitySpec, pos: Vec2, dir: Vec2, dt: number, targetLateral?: number): Vec2 {
  const goal = targetLateral ?? laneCross(alignToLane(spec, pos, dir), dir);
  const cur = laneCross(pos, dir);
  const next = cur + Math.sign(goal - cur) * Math.min(Math.abs(goal - cur), LANE_KEEP_RATE * dt);
  return dir.x !== 0 ? vec2(pos.x, next) : vec2(next, pos.y);
}

/** Undo a step that would carry the vehicle off the road or past a dead end:
 * reset the travelled-axis coordinate back to the tile we came from, leaving the
 * cross axis for lane-keeping to settle. At most a half-tile move. Pure. */
function pivotInTile(spec: CitySpec, pos: Vec2, travelled: Vec2, before: { tx: number; ty: number }): Vec2 {
  const c = tileCenter(spec, before.tx, before.ty);
  return travelled.x !== 0 ? vec2(c.x, pos.y) : vec2(pos.x, c.y);
}

/** All lane centres on the current road, sorted from the current lane outward. */
export function laneCentersForRoad(city: City, pos: Vec2, dir: Vec2): Vec2[] {
  const spec = city.spec;
  const current = alignToLane(spec, pos, dir);
  const lateralDelta = (candidate: Vec2): number =>
    dir.x !== 0 ? Math.abs(candidate.y - current.y) : Math.abs(candidate.x - current.x);
  return laneIndicesForDirection(spec, dir)
    .map((lane) => lanePosition(spec, current, dir, lane))
    .sort((a, b) => lateralDelta(a) - lateralDelta(b));
}

/** Cardinal directions from a tile that lead onto another road tile. */
export function openDirections(city: City, tx: number, ty: number): Vec2[] {
  return CARDINALS.filter((d) => roadAt(city, tx + d.x, ty + d.y));
}

/**
 * Travel directions a vehicle may actually take from a tile. It always carries
 * straight on along its current road (and may reverse only at a dead end), but
 * may turn onto a perpendicular road *only at a genuine junction* — where a road
 * row crosses a road column. This stops a car on a wide multi-lane band from
 * treating the adjacent parallel lane as a "cross road" and sliding sideways out
 * of its lane between intersections. Pure.
 */
export function routeDirections(city: City, tx: number, ty: number, dir: Vec2): Vec2[] {
  const { block } = city.spec;
  const width = roadWidth(city.spec);
  const atJunction = tx % block < width && ty % block < width;
  const straightOpen = roadAt(city, tx + dir.x, ty + dir.y);
  return CARDINALS.filter((d) => {
    if (!roadAt(city, tx + d.x, ty + d.y)) return false;
    if (isSameDir(d, dir) || isOppositeDir(d, dir)) return true; // along our own road
    return atJunction || !straightOpen; // perpendicular: only at a junction, or forced
  });
}

/** The cardinal direction nearest to a heading (radians). */
export function nearestCardinal(heading: number): Vec2 {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return Math.abs(c) >= Math.abs(s) ? vec2(Math.sign(c) || 1, 0) : vec2(0, Math.sign(s) || 1);
}

/**
 * Decides the next travel direction when a vehicle reaches a tile, given the
 * open roads there, the current direction, and the tile centre. Implementations
 * capture any extra state (RNG, a chase target) in a closure.
 */
export type DirectionChooser = (options: readonly Vec2[], current: Vec2, center: Vec2) => Vec2;

/** Chase a fixed point: take whichever open road heads most directly toward it.
 * A U-turn is avoided unless it is the only way out, so when the direct road is
 * blocked (and the caller turns the vehicle back) it diverts onto a side road at
 * the next junction instead of oscillating in place — letting it route around a
 * stationary obstacle rather than nosing into it forever. */
export function seekChooser(target: Vec2): DirectionChooser {
  return (options, current, center) => {
    const toTarget = sub(target, center);
    const forward = options.filter((d) => !isOppositeDir(d, current));
    const choices = forward.length > 0 ? forward : options;
    return choices.reduce(
      (best, d) => (dot(d, toTarget) > dot(best, toTarget) ? d : best),
      choices[0],
    );
  };
}

/**
 * Cruise the grid: continue straight, occasionally turning onto a crossing road
 * (probability `turnChance`) and turning at dead ends, never reversing unless
 * there is no other way out.
 */
export function wanderChooser(rng: () => number, turnChance: number): DirectionChooser {
  return (options, current) => {
    const turns = options.filter((d) => !isSameDir(d, current) && !isOppositeDir(d, current));
    const canContinue = options.some((d) => isSameDir(d, current));
    if (!canContinue) {
      // The road ahead has ended: take a side road, or double back if trapped.
      return turns.length > 0
        ? (turns[Math.floor(rng() * turns.length)] ?? current)
        : vec2(-current.x, -current.y);
    }
    if (turns.length > 0 && rng() < turnChance) {
      return turns[Math.floor(rng() * turns.length)] ?? current;
    }
    return current;
  };
}

/**
 * Advance a road vehicle one step at `speed`. On crossing into a new tile the
 * chooser picks the next direction; lane-keeping then eases the vehicle toward a
 * lane centre (the committed `laneTarget`, else the nearest lane) a little each
 * frame, so it stays on the road through turns without ever snapping across the
 * band. Pure: returns a new vehicle.
 */
export function stepRoadVehicle(
  v: RoadVehicle,
  city: City,
  dt: number,
  speed: number,
  choose: DirectionChooser,
  laneTarget?: number,
): RoadVehicle {
  const spec = city.spec;
  let dir = v.dir;
  let pos = add(v.pos, scale(dir, speed * dt));
  const before = tileCoord(spec, v.pos);
  const after = tileCoord(spec, pos);

  if (after.tx !== before.tx || after.ty !== before.ty) {
    const onRoad = roadAt(city, after.tx, after.ty);
    const tile = onRoad ? after : before;
    const options = routeDirections(city, tile.tx, tile.ty, dir);
    if (options.length === 0) {
      dir = vec2(-dir.x, -dir.y); // fully boxed in: reverse
      pos = pivotInTile(spec, pos, v.dir, before);
    } else {
      const chosen = choose(options, dir, tileCenter(spec, tile.tx, tile.ty));
      if (!onRoad) {
        dir = chosen; // would leave the road: turn, staying on the current tile
        pos = pivotInTile(spec, pos, v.dir, before);
      } else if (!isSameDir(chosen, dir)) {
        dir = chosen; // turning onto a crossing road; lane-keeping eases us over
      }
      // else: carry straight on.
    }
  }

  // Continuous lane keeping: ease the cross-travel position toward a lane centre
  // (the committed change target, or the nearest lane) so turns and any drift
  // resolve smoothly over several frames instead of teleporting across the wide
  // road band in a single step. A fresh turn invalidates an old target's axis.
  const turned = !isSameDir(dir, v.dir);
  const beforeEase = pos;
  pos = easeToLane(spec, pos, dir, dt, turned ? undefined : laneTarget);

  // Visual facing follows the car's ACTUAL travel: its forward motion plus any
  // lateral lane-keeping / lane-change drift. So a car easing into another lane
  // or rounding a corner points where it is going (a natural steer) rather than
  // facing straight ahead while sliding sideways. A stopped car keeps its
  // cardinal facing instead of swinging toward a stray sideways nudge.
  const lateral = sub(pos, beforeEase);
  const heading = speed > 1e-3 ? angle(add(scale(dir, speed), scale(lateral, 1 / dt))) : angle(dir);

  return { pos, heading, dir };
}
