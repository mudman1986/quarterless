import { type Rect, rect } from './collision';
import { type Vec2, vec2 } from './vector';

/**
 * A band of water cutting across the map. A horizontal river spans a range of
 * rows (crossed by vertical roads); a vertical river spans a range of columns
 * (crossed by horizontal roads). Crossing roads become bridges at a regular
 * interval; the rest of the band is impassable water.
 */
export interface RiverSpec {
  orientation: 'horizontal' | 'vertical';
  /** First tile row (horizontal) or column (vertical) of the water band. */
  start: number;
  /** Thickness of the band in tiles. */
  span: number;
  /**
   * A crossing road carries a bridge when its lane index is a multiple of this.
   * 1 (the default) bridges every crossing road; 2 bridges every other one, so
   * the river is a real barrier the player must navigate around.
   */
  bridgeEvery?: number;
}

/** Grid description of a block-based city. */
export interface CitySpec {
  /** Number of tiles across. */
  cols: number;
  /** Number of tiles down. */
  rows: number;
  /** Pixel size of one tile. */
  tile: number;
  /** Tiles per block; every `block`-th row/column is a road lane. */
  block: number;
  /**
   * Pixels each building is inset from its block edges, widening the drivable
   * space along the roads. Optional; defaults to 0 (buildings meet the road).
   */
  margin?: number;
  /** Rivers of water cutting across the map, crossed by bridges. */
  rivers?: RiverSpec[];
}

export interface City {
  spec: CitySpec;
  /** Total width in pixels. */
  width: number;
  /** Total height in pixels. */
  height: number;
  /** One merged rectangle per building block (for rendering and collision). */
  buildings: Rect[];
  /** Special named facilities embedded in the building stock, with the road
   * point their vehicles / NPCs spawn from. */
  facilities: Facility[];
  /** Lethal water rectangles (for rendering and drowning checks). */
  water: Rect[];
  /** Thin rails along the sides of every bridge (added to wall collision). */
  fences: Rect[];
  /** Sidewalk strips hugging the buildings (pedestrians wander along these). */
  sidewalks: Rect[];
  /** Crossing zones at intersections (rendering + where peds cross). */
  crosswalks: Rect[];
  /** Parking bays beside the kerbs where parked cars sit. */
  parkingSpots: ParkingSpot[];
  /** Whether the given tile coordinate is a drivable road lane (incl. bridges). */
  isRoad(tx: number, ty: number): boolean;
  /** Whether the given tile coordinate is lethal water. */
  isWater(tx: number, ty: number): boolean;
  /** Whether the given tile coordinate is a bridge crossing the water. */
  isBridge(tx: number, ty: number): boolean;
}

/** A kerbside parking bay: where a parked car sits and which way it points. */
export interface ParkingSpot {
  pos: Vec2;
  heading: number;
}

export type FacilityKind = 'policeStation' | 'hospital' | 'towYard';

/** A named civic/service building and the road point its vehicles emerge from. */
export interface Facility {
  kind: FacilityKind;
  /** Index into `city.buildings` of the building used as this facility. */
  buildingIndex: number;
  building: Rect;
  /** Road-adjacent spawn point where the corresponding NPC/car appears. */
  spawn: Vec2;
}

export const DEFAULT_CITY: CitySpec = { cols: 25, rows: 25, tile: 64, block: 5 };
export const CROSSWALK_ROAD_MARGIN = 4;
export const CROSSWALK_WIDTH_RATIO = 0.5;

/** Thickness in pixels of the rails lining each bridge. */
const FENCE = 5;
/** Width in pixels of the sidewalk strip around each building. */
const SIDEWALK_WIDTH = 12;
/** Spacing in pixels between parked cars along a kerb. */
const PARK_SLOT = 60;
/** Distance from the kerb (sidewalk road-edge) to a parked car's centre, so the
 * car sits right against the pavement with no gap. */
const PARK_INSET = 11;

interface TileRect {
  tx: number;
  ty: number;
  tw: number;
  th: number;
}

type FacilitySide = 'left' | 'right' | 'top' | 'bottom';

/** Remove a river band's rows (horizontal) or columns (vertical) from a tile
 * rect, returning the 0–2 pieces left over. Pure. */
function subtractBand(r: TileRect, river: RiverSpec): TileRect[] {
  const bStart = river.start;
  const bEnd = river.start + river.span;
  if (river.orientation === 'horizontal') {
    const top = r.ty;
    const bottom = r.ty + r.th;
    if (bEnd <= top || bStart >= bottom) return [r];
    const pieces: TileRect[] = [];
    if (top < bStart) pieces.push({ tx: r.tx, ty: top, tw: r.tw, th: bStart - top });
    if (bEnd < bottom) pieces.push({ tx: r.tx, ty: bEnd, tw: r.tw, th: bottom - bEnd });
    return pieces;
  }
  const left = r.tx;
  const right = r.tx + r.tw;
  if (bEnd <= left || bStart >= right) return [r];
  const pieces: TileRect[] = [];
  if (left < bStart) pieces.push({ tx: left, ty: r.ty, tw: bStart - left, th: r.th });
  if (bEnd < right) pieces.push({ tx: bEnd, ty: r.ty, tw: right - bEnd, th: r.th });
  return pieces;
}

/** Pick three distinct building blocks to act as the police station, hospital,
 * and tow yard, favouring the city corners so they read as deliberate landmarks.
 * Each facility also gets a road-adjacent spawn point on a preferred frontage,
 * with fallbacks if that side is missing (e.g. the map edge or a cropped block).
 */
function buildFacilities(
  spec: CitySpec,
  tileRects: readonly TileRect[],
  buildings: readonly Rect[],
  isRoad: (tx: number, ty: number) => boolean,
): Facility[] {
  const { cols, rows, tile } = spec;
  const center = (r: Rect): Vec2 => vec2(r.x + r.w / 2, r.y + r.h / 2);
  const spawnFor = (r: TileRect, prefs: readonly FacilitySide[]): Vec2 | null => {
    const midTx = r.tx + Math.floor((r.tw - 1) / 2);
    const midTy = r.ty + Math.floor((r.th - 1) / 2);
    const tileFor = (side: FacilitySide): { tx: number; ty: number } => {
      if (side === 'left') return { tx: r.tx - 1, ty: midTy };
      if (side === 'right') return { tx: r.tx + r.tw, ty: midTy };
      if (side === 'top') return { tx: midTx, ty: r.ty - 1 };
      return { tx: midTx, ty: r.ty + r.th };
    };
    for (const side of prefs) {
      const { tx, ty } = tileFor(side);
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue;
      if (!isRoad(tx, ty)) continue;
      return vec2(tx * tile + tile / 2, ty * tile + tile / 2);
    }
    return null;
  };

  const plans: { kind: FacilityKind; target: Vec2; prefs: FacilitySide[] }[] = [
    { kind: 'policeStation', target: vec2(0, 0), prefs: ['top', 'left', 'right', 'bottom'] },
    { kind: 'hospital', target: vec2(cols * tile, 0), prefs: ['right', 'top', 'bottom', 'left'] },
    { kind: 'towYard', target: vec2(0, rows * tile), prefs: ['left', 'bottom', 'top', 'right'] },
  ];

  const used = new Set<number>();
  const facilities: Facility[] = [];
  for (const plan of plans) {
    const pick = buildings
      .map((building, i) => ({
        i,
        building,
        tileRect: tileRects[i],
        dist: Math.hypot(center(building).x - plan.target.x, center(building).y - plan.target.y),
      }))
      .filter((c) => !used.has(c.i))
      .sort((a, b) => a.dist - b.dist)
      .find((c) => spawnFor(c.tileRect, plan.prefs) !== null);
    if (!pick) continue;
    used.add(pick.i);
    facilities.push({
      kind: plan.kind,
      buildingIndex: pick.i,
      building: pick.building,
      spawn: spawnFor(pick.tileRect, plan.prefs)!,
    });
  }
  return facilities;
}

/**
 * Build a city: roads run along every `block`-th row and column, and the
 * interior of each block is a single rectangular building. Any rivers carve a
 * band of water across the map, removing the buildings there and leaving
 * bridges (with side rails) where crossing roads continue across the water.
 */
export function buildCity(spec: CitySpec = DEFAULT_CITY): City {
  const { cols, rows, tile, block } = spec;
  const margin = spec.margin ?? 0;
  const rivers = spec.rivers ?? [];

  const isRoadLane = (tx: number, ty: number): boolean => tx % block === 0 || ty % block === 0;
  const inBand = (river: RiverSpec, tx: number, ty: number): boolean => {
    const idx = river.orientation === 'horizontal' ? ty : tx;
    return idx >= river.start && idx < river.start + river.span;
  };
  const isBridgeFor = (river: RiverSpec, tx: number, ty: number): boolean => {
    const every = river.bridgeEvery ?? 1;
    // A horizontal river is crossed by vertical roads (column `tx`); a vertical
    // river by horizontal roads (row `ty`).
    const lane = river.orientation === 'horizontal' ? tx : ty;
    return lane % block === 0 && (lane / block) % every === 0;
  };

  const isBridge = (tx: number, ty: number): boolean =>
    rivers.some((r) => inBand(r, tx, ty) && isBridgeFor(r, tx, ty));
  const isWater = (tx: number, ty: number): boolean =>
    rivers.some((r) => inBand(r, tx, ty)) && !isBridge(tx, ty);
  const isRoad = (tx: number, ty: number): boolean => isRoadLane(tx, ty) && !isWater(tx, ty);

  // Building blocks, then carve the rivers out of them.
  let tileRects: TileRect[] = [];
  for (let bx = 0; bx * block < cols; bx++) {
    for (let by = 0; by * block < rows; by++) {
      const tx = bx * block + 1;
      const ty = by * block + 1;
      const tw = Math.min((bx + 1) * block, cols) - tx;
      const th = Math.min((by + 1) * block, rows) - ty;
      if (tw > 0 && th > 0) tileRects.push({ tx, ty, tw, th });
    }
  }
  for (const river of rivers) tileRects = tileRects.flatMap((r) => subtractBand(r, river));

  const buildings = tileRects
    .map((r) =>
      rect(r.tx * tile + margin, r.ty * tile + margin, r.tw * tile - 2 * margin, r.th * tile - 2 * margin),
    )
    .filter((b) => b.w > 0 && b.h > 0);
  const facilities = buildFacilities(spec, tileRects, buildings, isRoad);

  // Water rectangles (band segments between bridges) and the bridge side rails.
  const water: Rect[] = [];
  const fences: Rect[] = [];
  for (const river of rivers) {
    const horizontal = river.orientation === 'horizontal';
    const acrossCount = horizontal ? cols : rows;
    const bandPx = river.start * tile;
    const bandSpanPx = river.span * tile;

    // Walk the cross-axis, emitting a water rect for each run between bridges.
    let runStart = 0;
    for (let i = 0; i <= acrossCount; i++) {
      const bridge = i < acrossCount && (horizontal ? isBridge(i, river.start) : isBridge(river.start, i));
      if (bridge || i === acrossCount) {
        if (i > runStart) {
          const segPx = runStart * tile;
          const segSpanPx = (i - runStart) * tile;
          water.push(
            horizontal
              ? rect(segPx, bandPx, segSpanPx, bandSpanPx)
              : rect(bandPx, segPx, bandSpanPx, segSpanPx),
          );
        }
        if (bridge) {
          // Rails on both water-facing edges of this one-tile-wide bridge.
          const edge0 = i * tile;
          const edge1 = (i + 1) * tile;
          if (horizontal) {
            fences.push(rect(edge0, bandPx, FENCE, bandSpanPx));
            fences.push(rect(edge1 - FENCE, bandPx, FENCE, bandSpanPx));
          } else {
            fences.push(rect(bandPx, edge0, bandSpanPx, FENCE));
            fences.push(rect(bandPx, edge1 - FENCE, bandSpanPx, FENCE));
          }
        }
        runStart = i + 1;
      }
    }
  }

  return {
    spec,
    width: cols * tile,
    height: rows * tile,
    buildings,
    facilities,
    water,
    fences,
    sidewalks: buildSidewalks(buildings),
    crosswalks: buildCrosswalks(spec, isRoad, isWater),
    parkingSpots: buildParkingSpots(spec, buildings, isWater),
    isRoad,
    isWater,
    isBridge,
  };
}

/** A sidewalk ring hugging the outside of every building. */
function buildSidewalks(buildings: readonly Rect[]): Rect[] {
  const s = SIDEWALK_WIDTH;
  const strips: Rect[] = [];
  for (const b of buildings) {
    strips.push(rect(b.x - s, b.y - s, b.w + 2 * s, s)); // top
    strips.push(rect(b.x - s, b.y + b.h, b.w + 2 * s, s)); // bottom
    strips.push(rect(b.x - s, b.y, s, b.h)); // left
    strips.push(rect(b.x + b.w, b.y, s, b.h)); // right
  }
  return strips;
}

/**
 * Crossing zones at each intersection. A crosswalk sits on the road tiles
 * immediately *adjacent* to an intersection (its four approaches), not on the
 * junction tile itself: those approach tiles are the road squares a pedestrian
 * actually steps across to get from one sidewalk to the other. (The junction
 * tile is surrounded by road on all sides, so nobody could ever reach it.)
 */
function buildCrosswalks(
  spec: CitySpec,
  isRoad: (tx: number, ty: number) => boolean,
  isWater: (tx: number, ty: number) => boolean,
): Rect[] {
  const { cols, rows, tile, block } = spec;
  const crosswalkSpan = (tile - CROSSWALK_ROAD_MARGIN * 2) * CROSSWALK_WIDTH_RATIO;
  const crosswalkInset = (tile - crosswalkSpan) * 0.5;
  const crossable = (tx: number, ty: number): boolean =>
    tx >= 0 && ty >= 0 && tx < cols && ty < rows && isRoad(tx, ty) && !isWater(tx, ty);
  const seen = new Set<string>();
  const zones: Rect[] = [];
  for (let bx = 0; bx < cols; bx += block) {
    for (let by = 0; by < rows; by += block) {
      if (!crossable(bx, by)) continue; // dry road intersection only
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const tx = bx + dx;
        const ty = by + dy;
        const key = `${tx},${ty}`;
        if (crossable(tx, ty) && !seen.has(key)) {
          seen.add(key);
          const verticalRoad = tx % block === 0;
          zones.push(
            verticalRoad
              ? rect(tx * tile, ty * tile + crosswalkInset, tile, crosswalkSpan)
              : rect(tx * tile + crosswalkInset, ty * tile, crosswalkSpan, tile),
          );
        }
      }
    }
  }
  return zones;
}

/**
 * Parallel parking laid out along the kerbs, right against the sidewalks. Each
 * building lines the road on its left (cars pointing along the vertical road)
 * and the road above it (cars along the horizontal road); since each road has
 * exactly one bordering building do this, the bays never double up. Cars sit
 * one car-width off the pavement, so there is no gap. Pure.
 */
function buildParkingSpots(
  spec: CitySpec,
  buildings: readonly Rect[],
  isWater: (tx: number, ty: number) => boolean,
): ParkingSpot[] {
  const { cols, rows, tile } = spec;
  const s = SIDEWALK_WIDTH;
  const spots: ParkingSpot[] = [];
  const dryAt = (x: number, y: number): boolean => {
    const tx = Math.floor(x / tile);
    const ty = Math.floor(y / tile);
    return tx >= 0 && ty >= 0 && tx < cols && ty < rows && !isWater(tx, ty);
  };

  for (const b of buildings) {
    // Left kerb: cars run down the vertical road, parked against the pavement.
    const leftX = b.x - s - PARK_INSET;
    for (let y = b.y + PARK_SLOT / 2; y <= b.y + b.h - PARK_SLOT / 2 + 1; y += PARK_SLOT) {
      if (dryAt(leftX, y)) spots.push({ pos: vec2(leftX, y), heading: Math.PI / 2 });
    }
    // Top kerb: cars run along the horizontal road, parked against the pavement.
    const topY = b.y - s - PARK_INSET;
    for (let x = b.x + PARK_SLOT / 2; x <= b.x + b.w - PARK_SLOT / 2 + 1; x += PARK_SLOT) {
      if (dryAt(x, topY)) spots.push({ pos: vec2(x, topY), heading: 0 });
    }
  }
  return spots;
}

/** Pixel centre of a tile. */
export function tileCenter(spec: CitySpec, tx: number, ty: number): Vec2 {
  return vec2(tx * spec.tile + spec.tile / 2, ty * spec.tile + spec.tile / 2);
}

/** Solid rectangles enclosing the city so entities cannot leave the map. */
export function boundaryWalls(city: City, thickness = 64): Rect[] {
  const { width, height } = city;
  return [
    rect(-thickness, -thickness, width + thickness * 2, thickness), // top
    rect(-thickness, height, width + thickness * 2, thickness), // bottom
    rect(-thickness, 0, thickness, height), // left
    rect(width, 0, thickness, height), // right
  ];
}
