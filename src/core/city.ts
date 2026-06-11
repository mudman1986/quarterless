import { type Rect, rect } from './collision';
import { type Vec2, vec2 } from './vector';

export interface ParkingSpot {
  pos: Vec2;
  heading: number;
}

export interface Crosswalk {
  rect: Rect;
  horizontal: boolean;
  center: Vec2;
}

export interface TrafficLight {
  tx: number;
  ty: number;
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
  /** Optional vertical river carved through the city. */
  river?: { startCol: number; width: number };
}

export interface City {
  spec: CitySpec;
  /** Total width in pixels. */
  width: number;
  /** Total height in pixels. */
  height: number;
  /** One merged rectangle per building block (for rendering and collision). */
  buildings: Rect[];
  /** Decorative sidewalks ringing the city blocks. */
  sidewalks: Rect[];
  /** Candidate civilian walking waypoints that hug the sidewalks/crosswalks. */
  sidewalkNodes: Vec2[];
  /** Zebra crossings at road intersections. */
  crosswalks: Crosswalk[];
  /** Marked parking spots along the kerb. */
  parkingSpots: ParkingSpot[];
  /** Decorative water bodies. */
  water: Rect[];
  /** Road segments that span the water. */
  bridges: Rect[];
  /** Intersections that carry a traffic light. */
  trafficLights: TrafficLight[];
  /** Length in seconds of a full traffic-light cycle. */
  lightCycle: number;
  /** Whether the given tile coordinate is a road lane. */
  isRoad(tx: number, ty: number): boolean;
  /** The active green axis for the given light at time `t` seconds. */
  lightState(tx: number, ty: number, t: number): 'ns' | 'ew';
}

export const DEFAULT_CITY: CitySpec = { cols: 25, rows: 25, tile: 64, block: 5 };
const DEFAULT_LIGHT_CYCLE = 8;

function isRiverColumn(spec: CitySpec, tx: number): boolean {
  return !!spec.river && tx >= spec.river.startCol && tx < spec.river.startCol + spec.river.width;
}

function pushUniqueNode(nodes: Vec2[], pos: Vec2): void {
  if (nodes.some((n) => n.x === pos.x && n.y === pos.y)) return;
  nodes.push(pos);
}

/**
 * Build a city: roads run along every `block`-th row and column, and the
 * interior of each block is a single rectangular building.
 */
export function buildCity(spec: CitySpec = DEFAULT_CITY): City {
  const { cols, rows, tile, block } = spec;
  const margin = spec.margin ?? 0;
  const sidewalkWidth = Math.max(10, Math.min(tile / 5, Math.max(12, margin * 0.75 || 14)));
  const isRoad = (tx: number, ty: number): boolean => {
    if (tx % block !== 0 && ty % block !== 0) return false;
    if (!isRiverColumn(spec, tx)) return true;
    return ty % block === 0;
  };

  const buildings: Rect[] = [];
  const sidewalks: Rect[] = [];
  const sidewalkNodes: Vec2[] = [];
  for (let bx = 0; bx * block < cols; bx++) {
    for (let by = 0; by * block < rows; by++) {
      const x0 = bx * block + 1;
      const y0 = by * block + 1;
      const w = Math.min((bx + 1) * block, cols) - x0;
      const h = Math.min((by + 1) * block, rows) - y0;
      if (w <= 0 || h <= 0) continue;
      const building = rect(x0 * tile + margin, y0 * tile + margin, w * tile - 2 * margin, h * tile - 2 * margin);
      buildings.push(building);

      if (building.w <= sidewalkWidth * 2 || building.h <= sidewalkWidth * 2) continue;
      const top = rect(building.x, building.y, building.w, sidewalkWidth);
      const bottom = rect(building.x, building.y + building.h - sidewalkWidth, building.w, sidewalkWidth);
      const left = rect(building.x, building.y, sidewalkWidth, building.h);
      const right = rect(building.x + building.w - sidewalkWidth, building.y, sidewalkWidth, building.h);
      sidewalks.push(top, bottom, left, right);

      pushUniqueNode(sidewalkNodes, vec2(building.x + building.w / 2, building.y + sidewalkWidth / 2));
      pushUniqueNode(
        sidewalkNodes,
        vec2(building.x + building.w / 2, building.y + building.h - sidewalkWidth / 2),
      );
      pushUniqueNode(sidewalkNodes, vec2(building.x + sidewalkWidth / 2, building.y + building.h / 2));
      pushUniqueNode(
        sidewalkNodes,
        vec2(building.x + building.w - sidewalkWidth / 2, building.y + building.h / 2),
      );
    }
  }

  const crosswalks: Crosswalk[] = [];
  const trafficLights: TrafficLight[] = [];
  const parkingSpots: ParkingSpot[] = [];
  const laneHalf = tile / 2;
  for (let tx = 0; tx < cols; tx += block) {
    if (isRiverColumn(spec, tx)) continue;
    for (let ty = 0; ty < rows; ty += block) {
      const center = tileCenter(spec, tx, ty);
      crosswalks.push(
        {
          rect: rect(center.x - laneHalf, center.y - 8, tile, 16),
          horizontal: true,
          center,
        },
        {
          rect: rect(center.x - 8, center.y - laneHalf, 16, tile),
          horizontal: false,
          center,
        },
      );
      trafficLights.push({ tx, ty });
      pushUniqueNode(sidewalkNodes, vec2(center.x - laneHalf - sidewalkWidth / 2, center.y - laneHalf - sidewalkWidth / 2));
      pushUniqueNode(sidewalkNodes, vec2(center.x + laneHalf + sidewalkWidth / 2, center.y - laneHalf - sidewalkWidth / 2));
      pushUniqueNode(sidewalkNodes, vec2(center.x - laneHalf - sidewalkWidth / 2, center.y + laneHalf + sidewalkWidth / 2));
      pushUniqueNode(sidewalkNodes, vec2(center.x + laneHalf + sidewalkWidth / 2, center.y + laneHalf + sidewalkWidth / 2));
    }
  }

  const curb = tile / 2 - 13;
  for (let tx = block; tx < cols; tx += block) {
    if (isRiverColumn(spec, tx)) continue;
    for (let ty = 1; ty < rows - 1; ty += block) {
      const c = tileCenter(spec, tx, ty);
      const side = (tx / block + ty) % 2 === 0 ? 1 : -1;
      parkingSpots.push({ pos: vec2(c.x + side * curb, c.y), heading: Math.PI / 2 });
    }
  }

  const water: Rect[] = [];
  const bridges: Rect[] = [];
  if (spec.river) {
    const { startCol, width } = spec.river;
    for (let ty = 0; ty < rows; ty++) {
      const y = ty * tile;
      if (ty % block === 0) {
        bridges.push(rect(startCol * tile, y, width * tile, tile));
      } else {
        water.push(rect(startCol * tile, y, width * tile, tile));
      }
    }
  }

  const lightState = (tx: number, ty: number, t: number): 'ns' | 'ew' => {
    const bucket = Math.floor(((t % DEFAULT_LIGHT_CYCLE) + DEFAULT_LIGHT_CYCLE) % DEFAULT_LIGHT_CYCLE / (DEFAULT_LIGHT_CYCLE / 2));
    return (tx / block + ty / block + bucket) % 2 === 0 ? 'ns' : 'ew';
  };

  return {
    spec,
    width: cols * tile,
    height: rows * tile,
    buildings,
    sidewalks,
    sidewalkNodes,
    crosswalks,
    parkingSpots,
    water,
    bridges,
    trafficLights,
    lightCycle: DEFAULT_LIGHT_CYCLE,
    isRoad,
    lightState,
  };
}

/** Pixel centre of a tile. */
export function tileCenter(spec: CitySpec, tx: number, ty: number): Vec2 {
  return vec2(tx * spec.tile + spec.tile / 2, ty * spec.tile + spec.tile / 2);
}

/** Solid rectangles enclosing the city so entities cannot leave the map. */
export function boundaryWalls(city: City, thickness = 64): Rect[] {
  const { width, height } = city;
  return [
    rect(-thickness, -thickness, width + thickness * 2, thickness),
    rect(-thickness, height, width + thickness * 2, thickness),
    rect(-thickness, 0, thickness, height),
    rect(width, 0, thickness, height),
  ];
}

export function edgeRoadSpawnPoints(city: City): Vec2[] {
  const { spec } = city;
  const points: Vec2[] = [];
  const lastRoadCol = Math.floor((spec.cols - 1) / spec.block) * spec.block;
  const lastRoadRow = Math.floor((spec.rows - 1) / spec.block) * spec.block;

  for (let ty = 0; ty <= lastRoadRow; ty += spec.block) {
    if (city.isRoad(0, ty)) pushUniqueNode(points, tileCenter(spec, 0, ty));
    if (city.isRoad(lastRoadCol, ty)) pushUniqueNode(points, tileCenter(spec, lastRoadCol, ty));
  }
  for (let tx = 0; tx <= lastRoadCol; tx += spec.block) {
    if (city.isRoad(tx, 0)) pushUniqueNode(points, tileCenter(spec, tx, 0));
    if (city.isRoad(tx, lastRoadRow)) pushUniqueNode(points, tileCenter(spec, tx, lastRoadRow));
  }
  return points;
}

export function bridgeBarriers(city: City, thickness = 6): Rect[] {
  return city.bridges.flatMap((bridge) => [
    rect(bridge.x, bridge.y, bridge.w, thickness),
    rect(bridge.x, bridge.y + bridge.h - thickness, bridge.w, thickness),
  ]);
}
