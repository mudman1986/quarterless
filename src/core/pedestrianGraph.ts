import { type Vec2, vec2, distance } from './vector';
import { type Rect, pointInRect } from './collision';
import { type City, CROSSWALK_BELT_WIDTH } from './city';

/**
 * A precomputed pedestrian waypoint network. Calm pedestrians stroll from node
 * to node in straight lines instead of recomputing an expensive per-tick flow
 * field. Edges only ever cross a road through a marked crosswalk, so following
 * the graph keeps NPCs on the pavement and sends them over zebra crossings by
 * construction — no routing search at runtime.
 */
export interface PedestrianGraph {
  /** Waypoint positions. */
  readonly nodes: readonly Vec2[];
  /** Adjacency list: `adjacency[i]` are the node indices reachable from node i. */
  readonly adjacency: readonly (readonly number[])[];
  /** Index of the node nearest to `pos`, or -1 when the graph is empty. */
  nearestNode(pos: Vec2): number;
}

const DEFAULT_SIDEWALK_WIDTH = 12;

/** Whether a point is ground a calm pedestrian may stand on: a sidewalk, a
 * marked crosswalk, a bridge deck, or open dry ground — never a bare road lane
 * or water. Mirrors the walkability used by the (now removed) fine nav grid. */
export function pedWalkable(city: City, p: Vec2): boolean {
  const { tile, cols, rows } = city.spec;
  const tx = Math.floor(p.x / tile);
  const ty = Math.floor(p.y / tile);
  if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return false;
  if (city.isWater(tx, ty)) return false;
  if (city.sidewalks.some((s) => pointInRect(p, s))) return true;
  if (city.crosswalks.some((c) => pointInRect(p, c))) return true;
  if (city.isBridge(tx, ty)) return true;
  return !city.isRoad(tx, ty) && !city.buildings.some((b) => pointInRect(p, b));
}

/** Whether every point along the straight segment a→b is walkable, so a
 * pedestrian can walk it without stepping onto a bare road lane or into water. */
function segmentWalkable(city: City, a: Vec2, b: Vec2): boolean {
  const steps = Math.max(2, Math.ceil(distance(a, b) / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!pedWalkable(city, vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t))) return false;
  }
  return true;
}

/** A simple uniform-grid bucket index for nearest-node queries. */
class NodeIndex {
  private readonly buckets = new Map<string, number[]>();
  constructor(
    nodes: readonly Vec2[],
    private readonly cell: number,
  ) {
    for (let i = 0; i < nodes.length; i++) {
      const key = this.key(nodes[i]);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(i);
      else this.buckets.set(key, [i]);
    }
  }

  private key(p: Vec2): string {
    return `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)}`;
  }

  /** Node indices in the cells overlapping a square of `radius` around `pos`. */
  near(pos: Vec2, radius: number): number[] {
    const minX = Math.floor((pos.x - radius) / this.cell);
    const maxX = Math.floor((pos.x + radius) / this.cell);
    const minY = Math.floor((pos.y - radius) / this.cell);
    const maxY = Math.floor((pos.y + radius) / this.cell);
    const out: number[] = [];
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.buckets.get(`${cx},${cy}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }
}

/** The eight ring waypoints around a building: four corners and four edge
 * midpoints, sitting on the centreline of the sidewalk that hugs the building. */
function buildingRing(b: Rect, half: number): Vec2[] {
  const x0 = b.x - half;
  const x1 = b.x + b.w + half;
  const y0 = b.y - half;
  const y1 = b.y + b.h + half;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  // Ordered clockwise so consecutive entries are adjacent along one strip.
  return [
    vec2(x0, y0), // 0 NW
    vec2(cx, y0), // 1 N
    vec2(x1, y0), // 2 NE
    vec2(x1, cy), // 3 E
    vec2(x1, y1), // 4 SE
    vec2(cx, y1), // 5 S
    vec2(x0, y1), // 6 SW
    vec2(x0, cy), // 7 W
  ];
}

/** The two kerb ends and centre of a crosswalk, along its crossing axis. */
function crosswalkPoints(cw: Rect): { a: Vec2; mid: Vec2; b: Vec2 } {
  const eps = 1;
  if (cw.w >= cw.h) {
    const y = cw.y + cw.h / 2;
    return { a: vec2(cw.x + eps, y), mid: vec2(cw.x + cw.w / 2, y), b: vec2(cw.x + cw.w - eps, y) };
  }
  const x = cw.x + cw.w / 2;
  return { a: vec2(x, cw.y + eps), mid: vec2(x, cw.y + cw.h / 2), b: vec2(x, cw.y + cw.h - eps) };
}

/**
 * Build the pedestrian waypoint graph for a city. Nodes sit on the sidewalk ring
 * around each building; ring edges run along the pavement; crosswalk nodes
 * bridge the rings across a road so the only way the graph crosses a carriageway
 * is over a zebra crossing. Pure and computed once per city.
 */
export function buildPedestrianGraph(city: City): PedestrianGraph {
  const s = city.spec.sidewalkWidth ?? DEFAULT_SIDEWALK_WIDTH;
  const half = s / 2;
  const nodes: Vec2[] = [];
  const adjacency: number[][] = [];

  const addNode = (p: Vec2): number => {
    nodes.push(p);
    adjacency.push([]);
    return nodes.length - 1;
  };
  const link = (i: number, j: number): void => {
    if (i === j) return;
    if (!adjacency[i].includes(j)) adjacency[i].push(j);
    if (!adjacency[j].includes(i)) adjacency[j].push(i);
  };

  // 1. Sidewalk rings: a walkable node ring around every building.
  let ringCount = 0;
  for (const b of city.buildings) {
    const ring = buildingRing(b, half);
    const idx = ring.map((p) => (pedWalkable(city, p) ? addNode(p) : -1));
    for (let k = 0; k < ring.length; k++) {
      const ai = idx[k];
      const bi = idx[(k + 1) % ring.length];
      if (ai >= 0 && bi >= 0 && segmentWalkable(city, nodes[ai], nodes[bi])) link(ai, bi);
    }
    ringCount = nodes.length;
  }

  // Index the ring nodes so crosswalk ends can attach to the nearest pavement.
  const ringIndex = new NodeIndex(nodes.slice(0, ringCount), Math.max(16, city.spec.tile));
  const attachRadius = CROSSWALK_BELT_WIDTH + 2 * s + city.spec.tile / 2;

  // 2. Crosswalk crossings: stitch the rings on opposite kerbs together so the
  //    graph can only span a road through a marked crossing.
  for (const cw of city.crosswalks) {
    const { a, mid, b } = crosswalkPoints(cw);
    const ai = addNode(a);
    const mi = addNode(mid);
    const bi = addNode(b);
    link(ai, mi);
    link(mi, bi);
    for (const [end, endIdx] of [
      [a, ai],
      [b, bi],
    ] as const) {
      const candidates = ringIndex
        .near(end, attachRadius)
        .map((ni) => ({ ni, d: distance(end, nodes[ni]) }))
        .filter((c) => c.d <= attachRadius && segmentWalkable(city, end, nodes[c.ni]))
        .sort((x, y) => x.d - y.d);
      for (const c of candidates.slice(0, 2)) link(endIdx, c.ni);
    }
  }

  const index = new NodeIndex(nodes, Math.max(16, city.spec.tile));
  return {
    nodes,
    adjacency,
    nearestNode(pos: Vec2): number {
      if (nodes.length === 0) return -1;
      for (let r = city.spec.tile; r <= city.width + city.height; r *= 2) {
        let best = -1;
        let bestD = Infinity;
        for (const ni of index.near(pos, r)) {
          const d = distance(pos, nodes[ni]);
          if (d < bestD) {
            bestD = d;
            best = ni;
          }
        }
        if (best !== -1) return best;
      }
      return 0;
    },
  };
}

/**
 * Pick the next waypoint for a strolling pedestrian at node `current` that
 * arrived from node `from`: a random neighbour, avoiding an immediate U-turn
 * back to `from` unless it is the only way out. Pure (uses the injected RNG).
 */
export function nextWanderNode(
  graph: PedestrianGraph,
  current: number,
  from: number,
  rng: () => number,
): number {
  const adj = graph.adjacency[current];
  if (!adj || adj.length === 0) return current;
  const forward = adj.length > 1 ? adj.filter((n) => n !== from) : adj;
  const pool = forward.length > 0 ? forward : adj;
  return pool[Math.floor(rng() * pool.length)] ?? pool[0];
}
