import { type Rect, rect } from './collision';
import { type Vec2, vec2 } from './vector';

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
}

export interface City {
  spec: CitySpec;
  /** Total width in pixels. */
  width: number;
  /** Total height in pixels. */
  height: number;
  /** One merged rectangle per building block (for rendering and collision). */
  buildings: Rect[];
  /** Whether the given tile coordinate is a road lane. */
  isRoad(tx: number, ty: number): boolean;
}

export const DEFAULT_CITY: CitySpec = { cols: 25, rows: 25, tile: 64, block: 5 };

/**
 * Build a city: roads run along every `block`-th row and column, and the
 * interior of each block is a single rectangular building.
 */
export function buildCity(spec: CitySpec = DEFAULT_CITY): City {
  const { cols, rows, tile, block } = spec;
  const margin = spec.margin ?? 0;
  const isRoad = (tx: number, ty: number): boolean => tx % block === 0 || ty % block === 0;

  const buildings: Rect[] = [];
  for (let bx = 0; bx * block < cols; bx++) {
    for (let by = 0; by * block < rows; by++) {
      const x0 = bx * block + 1;
      const y0 = by * block + 1;
      const w = Math.min((bx + 1) * block, cols) - x0;
      const h = Math.min((by + 1) * block, rows) - y0;
      if (w > 0 && h > 0) {
        // Inset by `margin` so the building does not butt right up to the road.
        buildings.push(
          rect(x0 * tile + margin, y0 * tile + margin, w * tile - 2 * margin, h * tile - 2 * margin),
        );
      }
    }
  }

  return { spec, width: cols * tile, height: rows * tile, buildings, isRoad };
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
