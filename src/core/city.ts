import { type Rect, rect } from './collision';
import { type Vec2, vec2, distance } from './vector';

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
  /** Tiles per repeating city block, including the road band and buildable area. */
  block: number;
  /** Width in tiles of each road band that starts at a `block` boundary. */
  roadWidth?: number;
  /**
   * Pixels each building is inset from its block edges, widening the drivable
   * space along the roads. Optional; defaults to 0 (buildings meet the road).
   */
  margin?: number;
  /** Width in pixels of the sidewalk strip around each building. */
  sidewalkWidth?: number;
  /** Rivers of water cutting across the map, crossed by bridges. */
  rivers?: RiverSpec[];
  /**
   * When set, deterministically fuse some neighbouring blocks into larger
   * super-blocks (2×1, 1×2 or 2×2), removing the interior roads between them so
   * a single bigger building fills the merged footprint. This breaks up the
   * monotonous every-block grid — fewer intersections, varied block sizes — while
   * remaining fully reproducible (the layout is a pure function of tile position,
   * not a stateful RNG). Off by default; the regular modulo grid is unchanged.
   */
  mergeBlocks?: boolean;
   /** Optional road bands along the outer right and bottom edges of the map. */
   edgeRoads?: { right?: boolean; bottom?: boolean };
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

export type FacilityKind = 'policeStation' | 'hospital' | 'towYard' | 'taxiDepot';

/** A named civic/service building and the road point its vehicles emerge from. */
export interface Facility {
  kind: FacilityKind;
  /** Index into `city.buildings` of the building used as this facility. */
  buildingIndex: number;
  building: Rect;
  /** Doorstep point on the pavement in front of the building, where its on-foot
   * NPCs (e.g. police) emerge. Tied to the building, so it moves with it. */
  spawn: Vec2;
  /** Road-adjacent point where service and patrol vehicles appear. */
  roadSpawn: Vec2;
}

export const DEFAULT_CITY: CitySpec = { cols: 25, rows: 25, tile: 64, block: 5 };
/** Default clearance used by pedestrian routing around a zebra belt. */
export const CROSSWALK_BELT_WIDTH = 56;

/** Thickness in pixels of the rails lining each bridge. */
const FENCE = 5;
/** Width in pixels of the sidewalk strip around each building. */
const SIDEWALK_WIDTH = 12;
/** Spacing in pixels between parked cars along a kerb. */
const PARK_SLOT = 60;
/** Distance from the kerb (sidewalk road-edge) to a parked car's centre, so the
 * car sits right against the pavement with no gap. */
const PARK_INSET = 11;
/** Radius kept clear around facility vehicle bays so garages are not blocked. */
const GARAGE_PARKING_CLEARANCE = 60;

interface TileRect {
  tx: number;
  ty: number;
  tw: number;
  th: number;
}

type FacilitySide = 'left' | 'right' | 'top' | 'bottom';

function roadWidthFor(spec: CitySpec): number {
  return Math.max(1, Math.min(spec.block, spec.roadWidth ?? 1));
}

export type RoadAxis = 'horizontal' | 'vertical';

/** Start tile of a road band, including optional right/bottom perimeter roads. */
export function roadBandStart(spec: CitySpec, tileIndex: number, axis: RoadAxis): number {
  const width = roadWidthFor(spec);
  const edgeEnabled = axis === 'vertical' ? spec.edgeRoads?.right : spec.edgeRoads?.bottom;
  const size = axis === 'vertical' ? spec.cols : spec.rows;
  if (edgeEnabled && tileIndex >= size - width) return size - width;
  return Math.floor(tileIndex / spec.block) * spec.block;
}

export function isRoadBandTile(spec: CitySpec, tileIndex: number, axis: RoadAxis): boolean {
  const width = roadWidthFor(spec);
  const size = axis === 'vertical' ? spec.cols : spec.rows;
  if (tileIndex < 0 || tileIndex >= size) return false;
  const start = roadBandStart(spec, tileIndex, axis);
  const edgeEnabled = axis === 'vertical' ? spec.edgeRoads?.right : spec.edgeRoads?.bottom;
  const edgeStart = size - width;
  const finalRegularStart = Math.floor((size - 1) / spec.block) * spec.block;
  if (
    edgeEnabled &&
    finalRegularStart < edgeStart &&
    finalRegularStart + width > edgeStart &&
    tileIndex >= finalRegularStart &&
    tileIndex < edgeStart
  ) {
    return false;
  }
  return tileIndex >= start && tileIndex < start + width;
}

export function isVerticalRoadTile(spec: CitySpec, tx: number): boolean {
  return isRoadBandTile(spec, tx, 'vertical');
}

export function isHorizontalRoadTile(spec: CitySpec, ty: number): boolean {
  return isRoadBandTile(spec, ty, 'horizontal');
}

function sidewalkWidthFor(spec: CitySpec): number {
  return spec.sidewalkWidth ?? SIDEWALK_WIDTH;
}

function subtractRect(base: Rect, cut: Rect): Rect[] {
  const left = Math.max(base.x, cut.x);
  const right = Math.min(base.x + base.w, cut.x + cut.w);
  const top = Math.max(base.y, cut.y);
  const bottom = Math.min(base.y + base.h, cut.y + cut.h);
  if (left >= right || top >= bottom) return [base];

  const pieces: Rect[] = [];
  if (base.y < top) pieces.push(rect(base.x, base.y, base.w, top - base.y));
  if (bottom < base.y + base.h) pieces.push(rect(base.x, bottom, base.w, base.y + base.h - bottom));
  if (base.x < left) pieces.push(rect(base.x, top, left - base.x, bottom - top));
  if (right < base.x + base.w) pieces.push(rect(right, top, base.x + base.w - right, bottom - top));
  return pieces.filter((piece) => piece.w > 0 && piece.h > 0);
}

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

/** Pick two distinct building blocks per service type, favouring separate
 * quadrants so they read as deliberate landmarks spread across town. Hospitals
 * may occupy merged blocks; the smaller service buildings may not.
 * Each facility also gets a road-adjacent spawn point on a preferred frontage,
 * with fallbacks if that side is missing (e.g. the map edge or a cropped block).
 */
function buildFacilities(
  spec: CitySpec,
  buildings: readonly Rect[],
  isRoad: (tx: number, ty: number) => boolean,
): Facility[] {
  const { cols, rows, tile } = spec;
  const sidewalkWidth = sidewalkWidthFor(spec);
  const center = (r: Rect): Vec2 => vec2(r.x + r.w / 2, r.y + r.h / 2);
  const spawnFor = (building: Rect, prefs: readonly FacilitySide[]): { spawn: Vec2; roadSpawn: Vec2 } | null => {
    const roadPointFor = (side: FacilitySide): Vec2 => {
      if (side === 'left') return vec2(building.x - sidewalkWidth - 1, building.y + building.h / 2);
      if (side === 'right') return vec2(building.x + building.w + sidewalkWidth + 1, building.y + building.h / 2);
      if (side === 'top') return vec2(building.x + building.w / 2, building.y - sidewalkWidth - 1);
      return vec2(building.x + building.w / 2, building.y + building.h + sidewalkWidth + 1);
    };
    const doorstepFor = (side: FacilitySide): Vec2 => {
      // A point on the pavement right at the building's door, so on-foot police
      // appear to step out of the station rather than off the kerb. It moves
      // automatically with the building because it is derived from its rect.
      const out = sidewalkWidth / 2;
      if (side === 'left') return vec2(building.x - out, building.y + building.h / 2);
      if (side === 'right') return vec2(building.x + building.w + out, building.y + building.h / 2);
      if (side === 'top') return vec2(building.x + building.w / 2, building.y - out);
      return vec2(building.x + building.w / 2, building.y + building.h + out);
    };
    for (const side of prefs) {
      const roadSpawn = roadPointFor(side);
      const tx = Math.floor(roadSpawn.x / tile);
      const ty = Math.floor(roadSpawn.y / tile);
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue;
      if (!isRoad(tx, ty)) continue;
      return { spawn: doorstepFor(side), roadSpawn };
    }
    return null;
  };

  const east = cols * tile;
  const south = rows * tile;
  const plans: { kind: FacilityKind; target: Vec2; prefs: FacilitySide[] }[] = [
    { kind: 'policeStation', target: vec2(east * 0.18, south * 0.18), prefs: ['top', 'left', 'right', 'bottom'] },
    { kind: 'policeStation', target: vec2(east * 0.82, south * 0.82), prefs: ['bottom', 'right', 'left', 'top'] },
    { kind: 'hospital', target: vec2(east * 0.82, south * 0.18), prefs: ['right', 'top', 'bottom', 'left'] },
    { kind: 'hospital', target: vec2(east * 0.18, south * 0.82), prefs: ['left', 'bottom', 'top', 'right'] },
    { kind: 'towYard', target: vec2(east * 0.18, south * 0.82), prefs: ['left', 'bottom', 'top', 'right'] },
    { kind: 'towYard', target: vec2(east * 0.82, south * 0.18), prefs: ['right', 'top', 'bottom', 'left'] },
    { kind: 'taxiDepot', target: vec2(east * 0.18, south * 0.5), prefs: ['left', 'top', 'bottom', 'right'] },
    { kind: 'taxiDepot', target: vec2(east * 0.82, south * 0.5), prefs: ['right', 'top', 'bottom', 'left'] },
  ];

  const singleSize = (spec.block - roadWidthFor(spec)) * tile - 2 * (spec.margin ?? 0);
  const isMergedBuilding = (building: Rect): boolean =>
    building.w > singleSize || building.h > singleSize;
  const used = new Set<number>();
  const facilities: Facility[] = [];
  for (const plan of plans) {
    const pick = buildings
      .map((building, i) => ({
        i,
        building,
        dist: Math.hypot(center(building).x - plan.target.x, center(building).y - plan.target.y),
      }))
      .filter((c) => !used.has(c.i) && (plan.kind === 'hospital' || !isMergedBuilding(c.building)))
      .sort((a, b) => a.dist - b.dist)
      .find((c) => spawnFor(c.building, plan.prefs) !== null);
    if (!pick) continue;
    const spawn = spawnFor(pick.building, plan.prefs)!;
    used.add(pick.i);
    facilities.push({
      kind: plan.kind,
      buildingIndex: pick.i,
      building: pick.building,
      spawn: spawn.spawn,
      roadSpawn: spawn.roadSpawn,
    });
  }
  return facilities;
}

/** A rectangular group of block-cells fused into one super-block, measured in
 * block units (not tiles). A plain `1×1` is an ordinary single block. */
interface SuperBlock {
  bcx: number;
  bcy: number;
  bcw: number;
  bch: number;
}

/** Deterministic hash of a block-cell coordinate to a float in [0, 1). Pure and
 * stateless, so the merged layout is identical on every load. */
function blockHash01(x: number, y: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * Partition the block grid into super-blocks. With `mergeBlocks` off every cell
 * is its own `1×1` block (the classic regular grid). With it on, a greedy
 * row-major pass fuses free neighbours into `2×2`, `2×1` or `1×2` groups using a
 * position hash, yielding a deterministic mix of block sizes at roughly a
 * moderate merge rate. Always a valid tiling: every cell is covered exactly
 * once, so the surviving roads still form a connected grid. Pure.
 */
function partitionSuperBlocks(spec: CitySpec): SuperBlock[] {
  const { cols, rows, block } = spec;
  const bcols = Math.ceil(cols / block);
  const brows = Math.ceil(rows / block);
  const result: SuperBlock[] = [];
  if (!spec.mergeBlocks) {
    for (let by = 0; by < brows; by++) {
      for (let bx = 0; bx < bcols; bx++) result.push({ bcx: bx, bcy: by, bcw: 1, bch: 1 });
    }
    return result;
  }
  const taken = new Uint8Array(bcols * brows);
  const idx = (x: number, y: number): number => y * bcols + x;
  const free = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < bcols && y < brows && taken[idx(x, y)] === 0;
  for (let by = 0; by < brows; by++) {
    for (let bx = 0; bx < bcols; bx++) {
      if (taken[idx(bx, by)] === 1) continue;
      const h = blockHash01(bx, by);
      const canRight = free(bx + 1, by);
      const canDown = free(bx, by + 1);
      const canSquare = canRight && canDown && free(bx + 1, by + 1);
      let bcw = 1;
      let bch = 1;
      if (canSquare && h < 0.15) {
        bcw = 2;
        bch = 2;
      } else if (canRight && h < 0.34) {
        bcw = 2;
      } else if (canDown && h < 0.5) {
        bch = 2;
      }
      for (let dy = 0; dy < bch; dy++) {
        for (let dx = 0; dx < bcw; dx++) taken[idx(bx + dx, by + dy)] = 1;
      }
      result.push({ bcx: bx, bcy: by, bcw, bch });
    }
  }
  return result;
}

/**
 * Build a city: roads run along every `block`-th row and column, and the
 * interior of each block is a single rectangular building. Any rivers carve a
 * band of water across the map, removing the buildings there and leaving
 * bridges (with side rails) where crossing roads continue across the water.
 * When {@link CitySpec.mergeBlocks} is set, some neighbouring blocks fuse into
 * larger super-blocks with their interior roads removed (see
 * {@link partitionSuperBlocks}).
 */
export function buildCity(spec: CitySpec = DEFAULT_CITY): City {
  const { cols, rows, tile, block } = spec;
  const roadWidth = roadWidthFor(spec);
  const margin = spec.margin ?? 0;
  const rivers = spec.rivers ?? [];

  // Super-block partition, and the set of interior road tiles it swallows.
  const superBlocks = partitionSuperBlocks(spec);
  const removedRoad = new Uint8Array(cols * rows);
  for (const sb of superBlocks) {
    if (sb.bcw === 1 && sb.bch === 1) continue; // a plain block removes no roads
    const x0 = sb.bcx * block + roadWidth;
    const x1 = Math.min((sb.bcx + sb.bcw) * block, cols);
    const y0 = sb.bcy * block + roadWidth;
    const y1 = Math.min((sb.bcy + sb.bch) * block, rows);
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        if (tx % block < roadWidth || ty % block < roadWidth) removedRoad[ty * cols + tx] = 1;
      }
    }
  }
  const isInteriorRoad = (tx: number, ty: number): boolean =>
    tx >= 0 &&
    ty >= 0 &&
    tx < cols &&
    ty < rows &&
    removedRoad[ty * cols + tx] === 1 &&
    !(
      (spec.edgeRoads?.right && tx >= cols - roadWidth) ||
      (spec.edgeRoads?.bottom && ty >= rows - roadWidth)
    );

  const isRoadLane = (tx: number, ty: number): boolean =>
    isVerticalRoadTile(spec, tx) || isHorizontalRoadTile(spec, ty);
  const inBand = (river: RiverSpec, tx: number, ty: number): boolean => {
    const idx = river.orientation === 'horizontal' ? ty : tx;
    return idx >= river.start && idx < river.start + river.span;
  };
  const isBridgeFor = (river: RiverSpec, tx: number, ty: number): boolean => {
    const every = river.bridgeEvery ?? 1;
    // A horizontal river is crossed by vertical roads (column `tx`); a vertical
    // river by horizontal roads (row `ty`).
    const lane = river.orientation === 'horizontal' ? tx : ty;
    const axis = river.orientation === 'horizontal' ? 'vertical' : 'horizontal';
    if (!isRoadBandTile(spec, lane, axis)) return false;
    const edgeRoad =
      (river.orientation === 'horizontal' && spec.edgeRoads?.right && lane >= cols - roadWidth) ||
      (river.orientation === 'vertical' && spec.edgeRoads?.bottom && lane >= rows - roadWidth);
    if (edgeRoad) return true;
    const band = Math.floor(lane / block) * block;
    return (band / block) % every === 0;
  };

  const isBridge = (tx: number, ty: number): boolean =>
    rivers.some((r) => inBand(r, tx, ty) && isBridgeFor(r, tx, ty));
  const isWater = (tx: number, ty: number): boolean =>
    rivers.some((r) => inBand(r, tx, ty)) && !isBridge(tx, ty);
  const isRoad = (tx: number, ty: number): boolean =>
    isRoadLane(tx, ty) && !isWater(tx, ty) && !isInteriorRoad(tx, ty);

  // One building per super-block (its full merged footprint), then carve the
  // rivers out of them.
  let tileRects: TileRect[] = superBlocks
    .map((sb) => {
      const tx = sb.bcx * block + roadWidth;
      const ty = sb.bcy * block + roadWidth;
      const xEnd = Math.min((sb.bcx + sb.bcw) * block, cols);
      const yEnd = Math.min((sb.bcy + sb.bch) * block, rows);
      const tw = xEnd - (xEnd === cols && spec.edgeRoads?.right ? roadWidth : 0) - tx;
      const th = yEnd - (yEnd === rows && spec.edgeRoads?.bottom ? roadWidth : 0) - ty;
      return { tx, ty, tw, th };
    })
    .filter((r) => r.tw > 0 && r.th > 0);
  for (const river of rivers) tileRects = tileRects.flatMap((r) => subtractBand(r, river));

  const buildings = tileRects
    .map((r) =>
      rect(r.tx * tile + margin, r.ty * tile + margin, r.tw * tile - 2 * margin, r.th * tile - 2 * margin),
    )
    .filter((b) => b.w > 0 && b.h > 0);
  const facilities = buildFacilities(spec, buildings, isRoad);

  // Water rectangles (band segments between bridges) and the bridge side rails.
  const water: Rect[] = [];
  const fences: Rect[] = [];
  for (const river of rivers) {
    const horizontal = river.orientation === 'horizontal';
    const acrossCount = horizontal ? cols : rows;
    const bandPx = river.start * tile;
    const bandSpanPx = river.span * tile;

    // Walk the cross-axis in runs so a multi-tile bridge band gets just one
    // pair of rails, and the water fills the gaps between those bridge runs.
    for (let i = 0; i < acrossCount; ) {
      const bridge = horizontal ? isBridge(i, river.start) : isBridge(river.start, i);
      let j = i + 1;
      while (j < acrossCount && (horizontal ? isBridge(j, river.start) : isBridge(river.start, j)) === bridge) j++;

      const segPx = i * tile;
      const segSpanPx = (j - i) * tile;
      if (bridge) {
        const edge0 = segPx;
        const edge1 = segPx + segSpanPx;
        if (horizontal) {
          fences.push(rect(edge0, bandPx, FENCE, bandSpanPx));
          fences.push(rect(edge1 - FENCE, bandPx, FENCE, bandSpanPx));
        } else {
          fences.push(rect(bandPx, edge0, bandSpanPx, FENCE));
          fences.push(rect(bandPx, edge1 - FENCE, bandSpanPx, FENCE));
        }
      } else {
        water.push(
          horizontal
            ? rect(segPx, bandPx, segSpanPx, bandSpanPx)
            : rect(bandPx, segPx, bandSpanPx, segSpanPx),
        );
      }
      i = j;
    }
  }

  const sidewalkWidth = sidewalkWidthFor(spec);
  const sidewalks = buildSidewalks(buildings, sidewalkWidth, water);
  return {
    spec,
    width: cols * tile,
    height: rows * tile,
    buildings,
    facilities,
    water,
    fences,
    sidewalks,
    crosswalks: buildCrosswalks(spec, isRoad, isWater, sidewalks),
    parkingSpots: buildParkingSpots(spec, buildings, facilities, isWater),
    isRoad,
    isWater,
    isBridge,
  };
}

/** A sidewalk ring hugging the outside of every building. */
function buildSidewalks(buildings: readonly Rect[], sidewalkWidth: number, water: readonly Rect[] = []): Rect[] {
  const s = sidewalkWidth;
  const strips: Rect[] = [];
  for (const b of buildings) {
    strips.push(rect(b.x - s, b.y - s, b.w + 2 * s, s)); // top
    strips.push(rect(b.x - s, b.y + b.h, b.w + 2 * s, s)); // bottom
    strips.push(rect(b.x - s, b.y, s, b.h)); // left
    strips.push(rect(b.x + b.w, b.y, s, b.h)); // right
  }
  return strips.flatMap((strip) =>
    water.reduce<Rect[]>((parts, body) => parts.flatMap((part) => subtractRect(part, body)), [strip]),
  );
}

/**
 * Striped pedestrian crossings around every intersection. Each crossing spans
 * the full width of the road it crosses — kerb to kerb, i.e. exactly the road
 * band — and sits just outside the junction square on each open approach, so it
 * starts at the block corner / sidewalk edge rather than over the pavement. A
 * crossing is only kept when its in-bounds exits land on dry ground, so bridge
 * approaches over a river do not paint zebra stripes that spill out into the
 * water. Its short dimension is the {@link CROSSWALK_BELT_WIDTH} belt the
 * pedestrian steps across. Pure.
 */
function buildCrosswalks(
  spec: CitySpec,
  isRoad: (tx: number, ty: number) => boolean,
  isWater: (tx: number, ty: number) => boolean,
  sidewalks: readonly Rect[],
): Rect[] {
  const { cols, rows, tile, block } = spec;
  const roadWidth = roadWidthFor(spec);
  const belt = spec.sidewalkWidth ?? CROSSWALK_BELT_WIDTH;
  const dryIfInBounds = (tx: number, ty: number): boolean =>
    tx < 0 || ty < 0 || tx >= cols || ty >= rows || !isWater(tx, ty);
  const dry = (tx: number, ty: number): boolean =>
    tx >= 0 && ty >= 0 && tx < cols && ty < rows && isRoad(tx, ty) && !isWater(tx, ty);
  const zones: Rect[] = [];
  const overlapsOrTouches = (a0: number, a1: number, b0: number, b1: number): boolean =>
    Math.min(a1, b1) >= Math.max(a0, b0);
  const sidewalkWidth = sidewalkWidthFor(spec);
  const sidewalkGap =
    Math.max(0, (spec.margin ?? 0) - sidewalkWidth) + Math.max(0, belt - sidewalkWidth);
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= sidewalkGap + 1e-6;
  const touchesSidewalk = (zone: Rect): boolean => {
    const wide = zone.w >= zone.h;
    const endpoints = wide ? [zone.x, zone.x + zone.w] : [zone.y, zone.y + zone.h];
    return endpoints.every((edge) =>
      sidewalks.some((sidewalk) =>
        wide
          ? (near(sidewalk.x + sidewalk.w, edge) || near(sidewalk.x, edge)) &&
            overlapsOrTouches(sidewalk.y, sidewalk.y + sidewalk.h, zone.y, zone.y + zone.h)
          : (near(sidewalk.y + sidewalk.h, edge) || near(sidewalk.y, edge)) &&
            overlapsOrTouches(sidewalk.x, sidewalk.x + sidewalk.w, zone.x, zone.x + zone.w),
      ),
    );
  };
  const addZone = (zone: Rect): void => {
    if (touchesSidewalk(zone)) zones.push(zone);
  };
  const roadRuns = (size: number, edgeEnabled: boolean): { start: number; span: number }[] => {
    const edgeStart = size - roadWidth;
    const starts: number[] = [];
    for (let start = 0; start < size; start += block) {
      if (!(edgeEnabled && start < edgeStart && start + roadWidth > edgeStart)) starts.push(start);
    }
    if (edgeEnabled) starts.push(edgeStart);
    starts.sort((a, b) => a - b);
    const runs: { start: number; span: number }[] = [];
    for (const start of starts) {
      const end = Math.min(size, start + roadWidth);
      const previous = runs[runs.length - 1];
      if (previous && start <= previous.start + previous.span) {
        previous.span = Math.max(previous.span, end - previous.start);
      } else if (end > start) {
        runs.push({ start, span: end - start });
      }
    }
    return runs;
  };
  const verticalRoadRuns = roadRuns(cols, spec.edgeRoads?.right === true);
  const horizontalRoadRuns = roadRuns(rows, spec.edgeRoads?.bottom === true);

  for (const vertical of verticalRoadRuns) {
    for (const horizontal of horizontalRoadRuns) {
      const bx = vertical.start;
      const by = horizontal.start;
      const verticalSpan = vertical.span * tile;
      const horizontalSpan = horizontal.span * tile;
      if (!dry(bx, by)) continue; // a dry road intersection only
      const x0 = bx * tile;
      const y0 = by * tile;
      const x1 = x0 + verticalSpan;
      const y1 = y0 + horizontalSpan;
      // North / south crossings span the vertical road band (full width in x).
      if (
        dry(bx, by - 1) &&
        dryIfInBounds(bx - 1, by - 1) &&
        dryIfInBounds(bx + vertical.span, by - 1)
      ) {
        addZone(rect(x0, y0 - belt, verticalSpan, belt));
      }
      if (
        dry(bx, by + horizontal.span) &&
        dryIfInBounds(bx - 1, by + horizontal.span) &&
        dryIfInBounds(bx + vertical.span, by + horizontal.span)
      ) {
        addZone(rect(x0, y1, verticalSpan, belt));
      }
      // East / west crossings span the horizontal road band (full width in y).
      if (
        dry(bx - 1, by) &&
        dryIfInBounds(bx - 1, by - 1) &&
        dryIfInBounds(bx - 1, by + horizontal.span)
      ) {
        addZone(rect(x0 - belt, y0, belt, horizontalSpan));
      }
      if (
        dry(bx + vertical.span, by) &&
        dryIfInBounds(bx + vertical.span, by - 1) &&
        dryIfInBounds(bx + vertical.span, by + horizontal.span)
      ) {
        addZone(rect(x1, y0, belt, horizontalSpan));
      }
    }
  }
  return zones;
}

/** Zebra-stripe rectangles filling a crosswalk. Real zebra bars run *parallel to
 * the traffic* (perpendicular to the pedestrian's path): so on a wide crossing
 * over a north-south road the bars are upright and march across in x, and on a
 * tall crossing over an east-west road they are flat and march down in y. Each
 * bar spans the full belt (the short dimension) and they repeat along the road
 * width (the long dimension the pedestrian walks), with equal bar/gap spacing. */
export function crosswalkStripeRects(crosswalk: Rect, bars = 8): Rect[] {
  // The long axis is the road width the pedestrian crosses; bars repeat along it.
  const alongX = crosswalk.w >= crosswalk.h;
  const span = alongX ? crosswalk.w : crosswalk.h;
  const stripe = span / Math.max(1, bars * 2 - 1);
  const stripes: Rect[] = [];
  for (let k = 0; k < bars; k++) {
    const off = k * stripe * 2;
    stripes.push(
      alongX
        ? rect(crosswalk.x + off, crosswalk.y, stripe, crosswalk.h) // upright bars
        : rect(crosswalk.x, crosswalk.y + off, crosswalk.w, stripe), // flat bars
    );
  }
  return stripes;
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
  facilities: readonly Facility[],
  isWater: (tx: number, ty: number) => boolean,
): ParkingSpot[] {
  const { cols, rows, tile } = spec;
  const s = sidewalkWidthFor(spec);
  const spots: ParkingSpot[] = [];
  const dryAt = (x: number, y: number): boolean => {
    const tx = Math.floor(x / tile);
    const ty = Math.floor(y / tile);
    return tx >= 0 && ty >= 0 && tx < cols && ty < rows && !isWater(tx, ty);
  };
  const clearOfGarage = (x: number, y: number): boolean =>
    facilities.every(
      (facility) => Math.hypot(x - facility.roadSpawn.x, y - facility.roadSpawn.y) >= GARAGE_PARKING_CLEARANCE,
    );
  const canPark = (x: number, y: number): boolean => dryAt(x, y) && clearOfGarage(x, y);

  for (const b of buildings) {
    // Left kerb: cars run down the vertical road, parked against the pavement.
    const leftX = b.x - s - PARK_INSET;
    for (let y = b.y + PARK_SLOT / 2; y <= b.y + b.h - PARK_SLOT / 2 + 1; y += PARK_SLOT) {
      if (canPark(leftX, y)) spots.push({ pos: vec2(leftX, y), heading: Math.PI / 2 });
    }
    // Top kerb: cars run along the horizontal road, parked against the pavement.
    const topY = b.y - s - PARK_INSET;
    for (let x = b.x + PARK_SLOT / 2; x <= b.x + b.w - PARK_SLOT / 2 + 1; x += PARK_SLOT) {
      if (canPark(x, topY)) spots.push({ pos: vec2(x, topY), heading: 0 });
    }
  }
  return spots;
}

/** Pixel centre of a tile. */
export function tileCenter(spec: CitySpec, tx: number, ty: number): Vec2 {
  return vec2(tx * spec.tile + spec.tile / 2, ty * spec.tile + spec.tile / 2);
}

/**
 * Nearest road-tile centre to `target`, found with a bounded outward ring
 * search instead of scanning the whole grid. Roads recur on a fixed lattice, so
 * the nearest lane is almost always a few tiles away; the search stops as soon
 * as no unexplored ring could beat the best hit, and never scans more than the
 * full grid. Returns the same tile a full scan would, without the per-call
 * O(cols×rows) cost that made service dispatch a hot spot. Null only when the
 * city has no road tiles.
 */
export function nearestRoadTileCenter(city: City, target: Vec2): Vec2 | null {
  const { cols, rows, tile } = city.spec;
  if (cols <= 0 || rows <= 0) return null;
  const cx = Math.min(cols - 1, Math.max(0, Math.floor(target.x / tile)));
  const cy = Math.min(rows - 1, Math.max(0, Math.floor(target.y / tile)));
  let best: Vec2 | null = null;
  let bestDistance = Infinity;
  const consider = (tx: number, ty: number): void => {
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return;
    if (!city.isRoad(tx, ty)) return;
    const candidate = tileCenter(city.spec, tx, ty);
    const d = distance(candidate, target);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  };
  const maxRadius = cols + rows;
  for (let r = 0; r <= maxRadius; r++) {
    // Every tile centre on ring r sits at least (r-1)*tile from the target, so
    // once the best hit is closer than that no later ring can improve on it.
    if (best && (r - 1) * tile > bestDistance) break;
    if (r === 0) {
      consider(cx, cy);
      continue;
    }
    for (let dx = -r; dx <= r; dx++) {
      consider(cx + dx, cy - r);
      consider(cx + dx, cy + r);
    }
    for (let dy = -r + 1; dy <= r - 1; dy++) {
      consider(cx - r, cy + dy);
      consider(cx + r, cy + dy);
    }
  }
  return best;
}

/**
 * Nearest road-tile centre to `anchor` that sits at least `minDistance` pixels
 * away. Used to place a story mission's spawning actors a short walk from the
 * player so arriving at the objective does not drop the targets on top of the
 * player (instant kill / no chase). Falls back to the farthest road point if
 * nothing clears the minimum, and to `anchor` itself if the city has no roads.
 */
export function roadStandoffPoint(city: City, anchor: Vec2, minDistance: number): Vec2 {
  let best: Vec2 | null = null;
  let bestDistance = Infinity;
  let farthest: Vec2 | null = null;
  let farthestDistance = -Infinity;
  for (let tx = 0; tx < city.spec.cols; tx++) {
    for (let ty = 0; ty < city.spec.rows; ty++) {
      if (!city.isRoad(tx, ty)) continue;
      const candidate = tileCenter(city.spec, tx, ty);
      const d = distance(candidate, anchor);
      if (d > farthestDistance) {
        farthestDistance = d;
        farthest = candidate;
      }
      if (d < minDistance) continue;
      if (d < bestDistance) {
        bestDistance = d;
        best = candidate;
      }
    }
  }
  return best ?? farthest ?? anchor;
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
