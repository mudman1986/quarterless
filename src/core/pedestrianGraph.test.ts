import { describe, it, expect } from 'vitest';
import { buildCity, type City } from './city';
import { CITY_SPEC } from '../game/citySpec';
import { vec2, type Vec2, distance } from './vector';
import { pointInRect } from './collision';
import { buildPedestrianGraph, pedWalkable, nextWanderNode } from './pedestrianGraph';

const miniCity = (): City => buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });

/** Replicates World.onForbiddenRoad: a bare road lane that is not a crossing. */
function onForbiddenRoad(city: City, p: Vec2): boolean {
  if (city.sidewalks.some((s) => pointInRect(p, s))) return false;
  const tx = Math.floor(p.x / city.spec.tile);
  const ty = Math.floor(p.y / city.spec.tile);
  if (!city.isRoad(tx, ty) || city.isWater(tx, ty)) return false;
  if (city.isBridge(tx, ty)) return false;
  return !city.crosswalks.some((c) => pointInRect(p, c));
}

/** Every distinct undirected edge as a pair of node indices. */
function edges(adjacency: readonly (readonly number[])[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < adjacency.length; i++) {
    for (const j of adjacency[i]) if (i < j) out.push([i, j]);
  }
  return out;
}

describe('pedWalkable', () => {
  it('accepts sidewalk centrelines and rejects bare road lanes and buildings', () => {
    const city = miniCity();
    const b = city.buildings[0];
    const half = (city.spec.sidewalkWidth ?? 12) / 2;
    expect(pedWalkable(city, vec2(b.x + b.w / 2, b.y - half))).toBe(true); // top sidewalk
    expect(pedWalkable(city, vec2(b.x + b.w / 2, b.y + b.h / 2))).toBe(false); // inside building
    expect(pedWalkable(city, vec2(32, 32))).toBe(false); // road tile (0,0) centre
  });

  it('rejects points over water', () => {
    const city = buildCity(CITY_SPEC);
    const water = city.water[0];
    expect(water).toBeDefined();
    expect(pedWalkable(city, vec2(water.x + water.w / 2, water.y + water.h / 2))).toBe(false);
  });
});

describe('buildPedestrianGraph', () => {
  it('places every waypoint on walkable ground', () => {
    for (const city of [miniCity(), buildCity(CITY_SPEC)]) {
      const graph = buildPedestrianGraph(city);
      expect(graph.nodes.length).toBeGreaterThan(0);
      for (const node of graph.nodes) expect(pedWalkable(city, node)).toBe(true);
    }
  });

  it('never routes an edge across a bare road lane (crossings only at crosswalks)', () => {
    for (const city of [miniCity(), buildCity(CITY_SPEC)]) {
      const graph = buildPedestrianGraph(city);
      for (const [i, j] of edges(graph.adjacency)) {
        const a = graph.nodes[i];
        const b = graph.nodes[j];
        const steps = Math.max(2, Math.ceil(distance(a, b) / 6));
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          const p = vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
          expect(onForbiddenRoad(city, p)).toBe(false);
        }
      }
    }
  });

  it('connects the rings across roads through crosswalks', () => {
    const city = buildCity(CITY_SPEC);
    const graph = buildPedestrianGraph(city);
    // At least one edge must run through a crosswalk: a genuine road crossing.
    const crossing = edges(graph.adjacency).some(([i, j]) => {
      const mid = vec2(
        (graph.nodes[i].x + graph.nodes[j].x) / 2,
        (graph.nodes[i].y + graph.nodes[j].y) / 2,
      );
      return city.crosswalks.some((c) => pointInRect(mid, c));
    });
    expect(crossing).toBe(true);

    // The largest connected component should gather a big share of the network
    // and span many blocks horizontally, proving the crosswalk crossings stitch
    // the per-building rings into one walkable landmass. (A horizontal river
    // splits the map into two such landmasses, so a single component is ~half.)
    const visited = new Array<boolean>(graph.nodes.length).fill(false);
    let bestSize = 0;
    let bestSpanX = 0;
    for (let start = 0; start < graph.nodes.length; start++) {
      if (visited[start]) continue;
      const queue = [start];
      visited[start] = true;
      let size = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      while (queue.length) {
        const n = queue.pop()!;
        size++;
        minX = Math.min(minX, graph.nodes[n].x);
        maxX = Math.max(maxX, graph.nodes[n].x);
        for (const m of graph.adjacency[n]) {
          if (!visited[m]) {
            visited[m] = true;
            queue.push(m);
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        bestSpanX = maxX - minX;
      }
    }
    expect(bestSize).toBeGreaterThan(graph.nodes.length * 0.4);
    expect(bestSpanX).toBeGreaterThan(city.width * 0.5);
  });

  it('returns the nearest node for a query point', () => {
    const city = miniCity();
    const graph = buildPedestrianGraph(city);
    const target = graph.nodes[5];
    const probe = vec2(target.x + 3, target.y - 2);
    const got = graph.nearestNode(probe);
    expect(distance(graph.nodes[got], probe)).toBeLessThanOrEqual(distance(target, probe) + 1e-6);
  });
});

describe('nextWanderNode', () => {
  it('avoids an immediate U-turn when another neighbour exists', () => {
    const graph = {
      nodes: [vec2(0, 0), vec2(1, 0), vec2(2, 0)],
      adjacency: [[1], [0, 2], [1]],
      nearestNode: () => 0,
    };
    // At node 1 having come from 0, the only non-backtracking option is 2.
    expect(nextWanderNode(graph, 1, 0, () => 0)).toBe(2);
    expect(nextWanderNode(graph, 1, 0, () => 0.999)).toBe(2);
  });

  it('allows the only neighbour even if it is the way back', () => {
    const graph = {
      nodes: [vec2(0, 0), vec2(1, 0)],
      adjacency: [[1], [0]],
      nearestNode: () => 0,
    };
    expect(nextWanderNode(graph, 1, 0, () => 0)).toBe(0);
  });
});
