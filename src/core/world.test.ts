import { describe, it, expect } from 'vitest';
import {
  World,
  AMBULANCE_DISPATCH_DELAY,
  CAR_MAX_HEALTH,
  SCORE_PER_PEDESTRIAN,
  SCORE_PER_POLICE,
  PLAYER_MAX_HEALTH,
} from './world';
import { type OnFootActor } from './entity';
import { type Car } from './vehicle';
import { type Pedestrian } from './pedestrianAI';
import { tileCoord, type TrafficAI } from './trafficAI';
import { rect, pointInRect } from './collision';
import { buildCity, tileCenter } from './city';
import { controls } from './types';
import { addHeat, createWanted, CRIME_HEAT } from './wantedLevel';
import { createMission } from './mission';
import { createTrafficLights, LIGHT_GREEN, LIGHT_PERIOD } from './trafficLight';
import { vec2, distance } from './vector';

const player = (): OnFootActor => ({ pos: vec2(0, 0), angle: 0, radius: 8 });
const carAt = (x: number, y: number): Car => ({
  pos: vec2(x, y),
  heading: 0,
  speed: 0,
  radius: 12,
});
const pedAt = (x: number, y: number): Pedestrian => ({
  pos: vec2(x, y),
  heading: 0,
  radius: 7,
  state: 'wander',
  target: vec2(x, y),
});

describe('World on foot', () => {
  it('starts on foot with the camera focused on the player', () => {
    const w = new World({ player: player() });
    expect(w.isDriving).toBe(false);
    expect(w.focus).toEqual(vec2(0, 0));
  });

  it('moves the player when walking', () => {
    const w = new World({ player: player() });
    w.tick(controls({ right: true }), 1);
    expect(w.player.pos.x).toBeGreaterThan(0);
  });

  it('blocks the player from walking through a wall', () => {
    const w = new World({ player: player(), walls: [rect(20, -50, 10, 100)] });
    for (let i = 0; i < 120; i++) w.tick(controls({ right: true }), 1 / 60);
    // The wall starts at x=20; player radius 8 means it can reach at most x=12.
    expect(w.player.pos.x).toBeLessThanOrEqual(12 + 1e-6);
  });
});

describe('World entering and exiting a car', () => {
  it('enters a nearby car when action is pressed', () => {
    const w = new World({ player: player(), cars: [carAt(20, 0)] });
    w.tick(controls({ action: true }), 1 / 60);
    expect(w.isDriving).toBe(true);
    expect(w.focus).toEqual(vec2(20, 0));
  });

  it('does not enter a car that is out of range', () => {
    const w = new World({ player: player(), cars: [carAt(500, 0)] });
    w.tick(controls({ action: true }), 1 / 60);
    expect(w.isDriving).toBe(false);
  });

  it('requires a fresh press to act (edge-triggered, not held)', () => {
    const w = new World({ player: player(), cars: [carAt(20, 0)] });
    w.tick(controls({ action: true }), 1 / 60); // enters
    w.tick(controls({ action: true }), 1 / 60); // still held -> stays in
    expect(w.isDriving).toBe(true);
  });

  it('drives the car forward and the camera follows it', () => {
    const w = new World({ player: player(), cars: [carAt(20, 0)] });
    w.tick(controls({ action: true }), 1 / 60);
    for (let i = 0; i < 60; i++) w.tick(controls({ up: true }), 1 / 60);
    expect(w.drivingCar!.speed).toBeGreaterThan(0);
    expect(w.focus.x).toBeGreaterThan(20);
  });

  it('exits the car on a fresh action press and returns to foot', () => {
    const w = new World({ player: player(), cars: [carAt(20, 0)] });
    w.tick(controls({ action: true }), 1 / 60); // enter
    w.tick(controls(), 1 / 60); // release
    w.tick(controls({ action: true }), 1 / 60); // exit
    expect(w.isDriving).toBe(false);
    // Player is placed next to the car, not on top of it.
    expect(distance(w.player.pos, vec2(20, 0))).toBeGreaterThan(0);
  });
});

describe('World pedestrians', () => {
  it('starts unwanted with no police', () => {
    const w = new World({ player: player(), pedestrians: [pedAt(300, 300)] });
    expect(w.wantedStars).toBe(0);
    expect(w.police).toHaveLength(0);
  });

  it('lets pedestrians wander when there is no threat', () => {
    const ped = pedAt(300, 300);
    const w = new World({
      player: player(),
      pedestrians: [ped],
      bounds: { width: 1000, height: 1000 },
    });
    w.tick(controls(), 1 / 60);
    // The single pedestrian remains and stays in the wander state.
    expect(w.pedestrians).toHaveLength(1);
    expect(w.pedestrians[0].state).toBe('wander');
  });

  it('does not let a pedestrian walk through a building', () => {
    const wall = rect(120, 0, 40, 200);
    const ped: ReturnType<typeof pedAt> = {
      pos: vec2(100, 100),
      heading: 0,
      radius: 7,
      state: 'wander',
      target: vec2(300, 100), // on the far side of the wall
    };
    const w = new World({
      player: player(),
      pedestrians: [ped],
      walls: [wall],
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
    });
    for (let i = 0; i < 600; i++) {
      w.tick(controls(), 1 / 60);
      const p = w.pedestrians[0];
      // The pedestrian's centre must never end up inside the building: it cannot
      // tunnel through it.
      const insideBuilding =
        p.pos.x > wall.x &&
        p.pos.x < wall.x + wall.w &&
        p.pos.y > wall.y &&
        p.pos.y < wall.y + wall.h;
      expect(insideBuilding).toBe(false);
    }
  });

  it('redirects a wandering pedestrian that is blocked by a building', () => {
    const wall = rect(120, 0, 40, 200);
    const ped: ReturnType<typeof pedAt> = {
      pos: vec2(100, 100),
      heading: 0,
      radius: 7,
      state: 'wander',
      target: vec2(300, 100),
    };
    const w = new World({
      player: player(),
      pedestrians: [ped],
      walls: [wall],
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
    });
    for (let i = 0; i < 60; i++) w.tick(controls(), 1 / 60);
    // Having hit the wall, it abandoned the unreachable original target.
    expect(w.pedestrians[0].target).not.toEqual(vec2(300, 100));
  });

  it('runs over a pedestrian when driving fast into it, raising the wanted level', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      pedestrians: [pedAt(60, 0)],
    });
    w.tick(controls({ action: true }), 1 / 60); // enter the car
    // Accelerate straight into the pedestrian ahead.
    for (let i = 0; i < 120; i++) w.tick(controls({ up: true }), 1 / 60);
    expect(w.pedestrians).toHaveLength(0);
    expect(w.wantedStars).toBeGreaterThanOrEqual(1);
    expect(w.kills).toBe(1); // the player gets credit for the kill
    expect(w.score.current).toBe(SCORE_PER_PEDESTRIAN);
  });
});

describe('World police and wanted level', () => {
  it('spawns police that pursue the player once wanted', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      pedestrians: [pedAt(60, 0)],
      policeSpawns: [vec2(800, 800)],
    });
    w.tick(controls({ action: true }), 1 / 60);
    for (let i = 0; i < 120; i++) w.tick(controls({ up: true }), 1 / 60); // commit the crime

    expect(w.wantedStars).toBeGreaterThanOrEqual(1);
    expect(w.police.length).toBeGreaterThanOrEqual(1);

    const before = distance(w.police[0].pos, w.focus);
    for (let i = 0; i < 60; i++) w.tick(controls(), 1 / 60);
    const after = distance(w.police[0].pos, w.focus);
    expect(after).toBeLessThan(before); // the cop closed the distance
  });

  it('decays the wanted level over time and disperses police when clear', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      pedestrians: [pedAt(60, 0)],
      policeSpawns: [vec2(800, 800)],
    });
    w.tick(controls({ action: true }), 1 / 60);
    for (let i = 0; i < 120; i++) w.tick(controls({ up: true }), 1 / 60);
    expect(w.wantedStars).toBeGreaterThanOrEqual(1);

    // Coast for a long while committing no further crimes.
    for (let i = 0; i < 60 * 120; i++) w.tick(controls(), 1 / 60);
    expect(w.wantedStars).toBe(0);
    expect(w.police).toHaveLength(0);
  });

  it('dispatches a mix of officers on foot and patrol cars', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      pedestrians: [pedAt(60, 0), pedAt(90, 0)],
      policeSpawns: [vec2(800, 800), vec2(-800, 800)],
      bounds: { width: 4000, height: 4000 },
    });
    w.tick(controls({ action: true }), 1 / 60);
    for (let i = 0; i < 120; i++) w.tick(controls({ up: true }), 1 / 60);

    expect(w.wantedStars).toBeGreaterThanOrEqual(2);
    const kinds = new Set(w.police.map((c) => c.kind));
    expect(kinds.has('foot')).toBe(true);
    expect(kinds.has('car')).toBe(true);
  });

  it('lets a speeding car mow down officers on foot, adding extra heat', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      pedestrians: [pedAt(50, 0)],
      policeSpawns: [vec2(150, 0)],
      bounds: { width: 4000, height: 4000 },
    });
    w.tick(controls({ action: true }), 1 / 60);
    let reachedTwoStars = false;
    for (let i = 0; i < 200; i++) {
      w.tick(controls({ up: true }), 1 / 60);
      reachedTwoStars ||= w.wantedStars >= 2;
      if (w.isWasted || w.isBusted) break;
    }
    // One pedestrian alone is a single star; reaching two at any point proves
    // an officer on foot was also run over (which adds far more heat). The run
    // may later end if the ensuing vehicle pile-up explodes.
    expect(reachedTwoStars).toBe(true);
  });
});

describe('World NPC traffic', () => {
  const miniCity = () => buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });

  it('drives NPC cars along the roads while parked cars stay put', () => {
    const city = miniCity();
    const driven: Car = { pos: tileCenter(city.spec, 4, 4), heading: 0, speed: 0, radius: 12 };
    const parked: Car = { pos: tileCenter(city.spec, 8, 8), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: player(),
      cars: [driven, parked],
      city,
      carDrivers: [{ dir: vec2(1, 0) }, null],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    const drivenStart = { ...w.cars[0].pos };
    for (let i = 0; i < 120; i++) w.tick(controls(), 1 / 60);

    expect(distance(w.cars[0].pos, drivenStart)).toBeGreaterThan(20); // the NPC car moved
    expect(w.cars[1].pos).toEqual(tileCenter(city.spec, 8, 8)); // the parked car did not
    const insideBuilding = city.buildings.some(
      (b) =>
        w.cars[0].pos.x > b.x &&
        w.cars[0].pos.x < b.x + b.w &&
        w.cars[0].pos.y > b.y &&
        w.cars[0].pos.y < b.y + b.h,
    );
    expect(insideBuilding).toBe(false);
  });

  it('lets the player hijack a moving NPC car, stopping its driver', () => {
    const city = miniCity();
    const npcCar: Car = { pos: vec2(20, 0), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: player(),
      cars: [npcCar],
      city,
      carDrivers: [{ dir: vec2(1, 0) }],
      rng: () => 0.9,
    });
    w.tick(controls({ action: true }), 1 / 60);
    expect(w.isDriving).toBe(true);

    const posAfterEnter = { ...w.cars[0].pos };
    for (let i = 0; i < 60; i++) w.tick(controls(), 1 / 60); // no input: must not auto-drive
    expect(w.cars[0].pos).toEqual(posAfterEnter);
  });
});

describe('World busted and respawn', () => {
  // Make the player wanted directly and drop a lone officer right next to them,
  // then let the arrest happen. This keeps the scenario deterministic.
  const setupBust = () => {
    const w = new World({
      player: player(),
      police: [{ pos: vec2(40, 0), heading: 0, radius: 12, kind: 'foot' }],
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice);
    for (let i = 0; i < 180 && !w.isBusted; i++) w.tick(controls(), 1 / 60);
    return w;
  };

  it('busts the player when an officer catches them on foot', () => {
    const w = setupBust();
    expect(w.isBusted).toBe(true);
  });

  it('clears the wanted level and police the moment the player is busted', () => {
    const w = setupBust();
    expect(w.isBusted).toBe(true);
    // The chase ends at once — stars gone and police dispersed — without waiting
    // for the respawn countdown.
    expect(w.wantedStars).toBe(0);
    expect(w.police).toHaveLength(0);
  });

  it('respawns at the start after the busted delay elapses', () => {
    const w = setupBust();
    expect(w.isBusted).toBe(true);

    for (let i = 0; i < 11 * 60; i++) w.tick(controls(), 1 / 60); // wait out the 10s timer
    expect(w.isBusted).toBe(false);
    expect(w.isDriving).toBe(false);
    expect(w.wantedStars).toBe(0);
    expect(w.player.pos).toEqual(vec2(0, 0));
  });

  it('respawns immediately when the player presses continue', () => {
    const w = setupBust();
    expect(w.isBusted).toBe(true);

    w.tick(controls({ confirm: true }), 1 / 60);
    expect(w.isBusted).toBe(false);
    expect(w.player.pos).toEqual(vec2(0, 0));
  });

  it('clears the wanted level the moment a wanted player is wasted', () => {
    const w = new World({
      player: player(), // on foot at the origin
      cars: [{ pos: vec2(15, 0), heading: 0, speed: 200, radius: 12 }], // fast, lethal
      bounds: { width: 4000, height: 4000 },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice); // wanted before dying
    w.tick(controls(), 1 / 60);
    expect(w.isWasted).toBe(true);
    expect(w.wantedStars).toBe(0); // death ends the chase immediately
    expect(w.police).toHaveLength(0);
  });
});

describe('World police obey buildings', () => {
  it('does not let pursuing police walk through a building', () => {
    const wall = rect(40, -50, 20, 100); // stands between the cop and the player
    const w = new World({
      player: player(), // at (0,0)
      police: [{ pos: vec2(200, 0), heading: 0, radius: 12, kind: 'foot' }],
      walls: [wall],
      bounds: { width: 4000, height: 4000 },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice); // wanted -> the cop pursues

    for (let i = 0; i < 600; i++) {
      w.tick(controls(), 1 / 60);
      const c = w.police[0];
      const inside =
        c.pos.x > wall.x && c.pos.x < wall.x + wall.w && c.pos.y > wall.y && c.pos.y < wall.y + wall.h;
      expect(inside).toBe(false);
    }
  });

  it('routes a foot officer around a block to reach the player instead of getting stuck', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    // Player on road row 4; officer two intersections away. The block between
    // them would trap a straight-line chaser, but flow-field nav goes around.
    const w = new World({
      player: { pos: tileCenter(city.spec, 4, 4), angle: 0, radius: 8 },
      city,
      police: [{ pos: tileCenter(city.spec, 8, 8), heading: 0, radius: 12, kind: 'foot' }],
      walls: [...city.buildings],
      bounds: { width: city.width, height: city.height },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice);

    const start = distance(w.police[0].pos, w.focus);
    for (let i = 0; i < 600 && !w.isBusted; i++) w.tick(controls(), 1 / 60);
    // Either it caught the player (busted) or it closed in a lot — never stuck.
    const closed = w.isBusted || distance(w.police[0].pos, w.focus) < start - 100;
    expect(closed).toBe(true);
  });
});

describe('World map wrap-around', () => {
  it('wraps the player to the opposite edge instead of hitting an invisible wall', () => {
    const w = new World({
      player: { pos: vec2(5, 100), angle: 0, radius: 8 },
      bounds: { width: 500, height: 500 },
    });
    let wrapped = false;
    let prev = w.player.pos.x;
    for (let i = 0; i < 300; i++) {
      w.tick(controls({ left: true }), 1 / 60);
      const x = w.player.pos.x;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(500);
      if (x > prev + 100) wrapped = true; // jumped across to the far side
      prev = x;
    }
    expect(wrapped).toBe(true);
  });

  it('wraps a driven car around the edges too', () => {
    const w = new World({
      player: player(),
      cars: [carAt(10, 0)],
      bounds: { width: 500, height: 500 },
    });
    w.tick(controls({ action: true }), 1 / 60); // hijack the car
    let wrapped = false;
    let prev = w.drivingCar!.pos.x;
    for (let i = 0; i < 300; i++) {
      w.tick(controls({ down: true }), 1 / 60); // reverse off the left edge
      const x = w.drivingCar!.pos.x;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(500);
      if (x > prev + 100) wrapped = true;
      prev = x;
    }
    expect(wrapped).toBe(true);
  });
});

describe('World car collisions', () => {
  it('stops a driven car from passing through another car', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0), carAt(140, 0)], // hijack the first; the second sits ahead
      bounds: { width: 4000, height: 4000 },
    });
    w.tick(controls({ action: true }), 1 / 60); // hijack the first car
    for (let i = 0; i < 240; i++) w.tick(controls({ up: true }), 1 / 60); // drive into the other

    const gap = distance(w.cars[0].pos, w.cars[1].pos);
    expect(gap).toBeLessThan(40); // they actually met
    expect(gap).toBeGreaterThanOrEqual(w.cars[0].radius + w.cars[1].radius - 1); // never overlapped
  });
});

describe('World actor-car collision', () => {
  it('blocks the player from walking through a parked car and never wastes them', () => {
    const w = new World({
      player: player(), // (0,0), radius 8
      cars: [carAt(40, 0)], // parked (speed 0), radius 12
      bounds: { width: 4000, height: 4000 },
    });
    for (let i = 0; i < 240; i++) {
      w.tick(controls({ right: true }), 1 / 60); // keep shoving east into the car
      expect(w.isWasted).toBe(false); // a stopped car is never lethal
    }
    // Centre at x=40, radii 8+12=20: the player can press up to x=20 but no further.
    expect(w.player.pos.x).toBeLessThanOrEqual(20 + 1e-6);
    expect(distance(w.player.pos, w.cars[0].pos)).toBeGreaterThanOrEqual(20 - 1e-6);
  });

  it('does not waste a player who walks into an NPC car that braked for them', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    // NPC heads east along road row 4; the player stands east of it and walks
    // west into its path. The car brakes, the player cannot tunnel past it, so
    // it never lurches forward and runs them down.
    const npc: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: { pos: tileCenter(city.spec, 4, 4), angle: 0, radius: 8 },
      cars: [npc],
      city,
      carDrivers: [{ dir: vec2(1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9, // never turn at intersections
    });
    for (let i = 0; i < 120; i++) {
      w.tick(controls({ left: true }), 1 / 60);
      expect(w.isWasted).toBe(false);
      // The player never tunnels into the car (which is what caused the lurch).
      expect(distance(w.player.pos, w.cars[0].pos)).toBeGreaterThanOrEqual(
        w.player.radius + w.cars[0].radius - 1,
      );
    }
  });

  it('stops a pedestrian from walking through a parked car', () => {
    const ped: Pedestrian = {
      pos: vec2(100, 100),
      heading: 0,
      radius: 7,
      state: 'wander',
      target: vec2(300, 100), // straight through the car
    };
    const w = new World({
      player: player(),
      cars: [carAt(180, 100)], // parked across the pedestrian's path
      pedestrians: [ped],
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
    });
    for (let i = 0; i < 600; i++) {
      w.tick(controls(), 1 / 60);
      if (w.pedestrians.length === 0) break; // (it never gets run over: car is parked)
      const p = w.pedestrians[0];
      // Its centre may approach but never enters the car's body.
      expect(distance(p.pos, w.cars[0].pos)).toBeGreaterThanOrEqual(
        p.radius + w.cars[0].radius - 1,
      );
    }
    expect(w.pedestrians).toHaveLength(1); // a parked car never kills it
  });
});

describe('World NPC yielding', () => {
  const miniCity = () => buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });

  it('brakes an NPC car for someone in the road instead of driving through them', () => {
    const city = miniCity();
    const standing = tileCenter(city.spec, 3, 4); // on road row 4
    const npc: Car = { pos: tileCenter(city.spec, 0, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: { pos: standing, angle: 0, radius: 8 },
      cars: [npc],
      city,
      carDrivers: [{ dir: vec2(1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    for (let i = 0; i < 120; i++) w.tick(controls(), 1 / 60);
    expect(w.isWasted).toBe(false); // the person was not run down
    expect(w.cars[0].pos.x).toBeLessThan(standing.x - 10); // the car stopped short
  });
});

describe('World traffic rerouting and lights', () => {
  const miniCity = () => buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
  const wideLightCity = () => buildCity({ cols: 28, rows: 28, tile: 64, block: 7, roadWidth: 4 });

  const rightHandLaneIndices = (dir: { x: number; y: number }): number[] =>
    dir.x > 0 || dir.y < 0 ? [2, 3] : [1, 0];

  const lightJunctionBand = 14;
  const lightRoadWidth = 4;
  const lanePoint = (
    city: ReturnType<typeof wideLightCity>,
    dir: { x: number; y: number },
    alongTile: number,
  ) => {
    const lane = rightHandLaneIndices(dir)[0]!;
    return dir.x !== 0
      ? tileCenter(city.spec, alongTile, lightJunctionBand + lane)
      : tileCenter(city.spec, lightJunctionBand + lane, alongTile);
  };

  const frontGapToLight = (car: Car, dir: { x: number; y: number }): number => {
    const frontX = car.pos.x + dir.x * car.radius;
    const frontY = car.pos.y + dir.y * car.radius;
    if (dir.x > 0) return lightJunctionBand * 64 - frontX;
    if (dir.x < 0) return frontX - (lightJunctionBand + lightRoadWidth) * 64;
    if (dir.y > 0) return lightJunctionBand * 64 - frontY;
    return frontY - (lightJunctionBand + lightRoadWidth) * 64;
  };

  const redLightFor = (dir: { x: number; y: number }) =>
    createTrafficLights(dir.x !== 0 ? LIGHT_GREEN + 0.1 : 0);

  const inWideLightJunction = (city: ReturnType<typeof wideLightCity>, car: Car): boolean => {
    const { tx, ty } = tileCoord(city.spec, car.pos);
    return (
      tx >= lightJunctionBand &&
      tx < lightJunctionBand + lightRoadWidth &&
      ty >= lightJunctionBand &&
      ty < lightJunctionBand + lightRoadWidth
    );
  };

  it('reroutes an NPC car around someone who blocks the road too long', () => {
    const city = miniCity();
    const standing = tileCenter(city.spec, 2, 4); // in the lane, east of the car
    const npc: Car = { pos: tileCenter(city.spec, 0, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: { pos: standing, angle: 0, radius: 8 },
      cars: [npc],
      city,
      carDrivers: [{ dir: vec2(1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9, // never voluntarily turn at intersections
    });

    // Drive up, get blocked, then keep waiting past the reroute timer.
    for (let i = 0; i < 360; i++) w.tick(controls(), 1 / 60);
    expect(w.isWasted).toBe(false); // it never ran the blocker over
    // Having given up waiting, it turned back the way it came (now west of them).
    expect(w.cars[0].pos.x).toBeLessThan(standing.x - 10);
  });

  it('stops an NPC car at a red light instead of crossing the intersection', () => {
    const city = miniCity();
    // Southbound car approaching the intersection at (4,4); horizontal has the
    // green, so this car's (vertical) light is red.
    const npc: Car = { pos: tileCenter(city.spec, 4, 2), heading: Math.PI / 2, speed: 0, radius: 12 };
    const w = new World({
      player: player(), // far away at the origin
      cars: [npc],
      city,
      carDrivers: [{ dir: vec2(0, 1) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    w.lights = createTrafficLights(0); // horizontal green for the next LIGHT_GREEN secs

    const intersectionY = tileCenter(city.spec, 4, 4).y - city.spec.tile / 2; // top edge
    const ticks = Math.floor((LIGHT_GREEN - 1) * 60); // stay within the red phase
    for (let i = 0; i < ticks; i++) {
      w.tick(controls(), 1 / 60);
      expect(w.cars[0].pos.y).toBeLessThan(intersectionY); // never entered the box
    }
  });

  it('keeps a wide-road NPC in its lane while waiting at a red light', () => {
    const city = buildCity({ cols: 18, rows: 18, tile: 64, block: 6, roadWidth: 4 });
    const start = tileCenter(city.spec, 1, 4);
    const npc: Car = { pos: start, heading: Math.PI / 2, speed: 0, radius: 12 };
    const w = new World({
      player: player(),
      cars: [npc],
      city,
      carDrivers: [{ dir: vec2(0, 1) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    w.lights = createTrafficLights(0);

    for (let i = 0; i < 90; i++) w.tick(controls(), 1 / 60);
    expect(w.cars[0].pos.x).toBeCloseTo(start.x);
  });

  it('halts a wide-road NPC cleanly before the junction at a red light', () => {
    const city = buildCity({ cols: 21, rows: 21, tile: 64, block: 7, roadWidth: 4 });
    const col = 7 + 1; // a southbound lane of the road band starting at column 7
    const start = tileCenter(city.spec, col, 7 + 4 + 1); // a few tiles north of junction row 14
    const junctionEdgeY = 14 * city.spec.tile;
    const w = new World({
      player: player(),
      cars: [{ pos: start, heading: Math.PI / 2, speed: 0, radius: 14 }],
      city,
      carDrivers: [{ dir: vec2(0, 1) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.99,
    });
    w.lights = createTrafficLights(0); // horizontal green => our southbound car faces red

    for (let i = 0; i < 200; i++) w.tick(controls(), 1 / 60); // within the 4s green phase
    const car = w.cars[0];
    expect(car.pos.y + car.radius).toBeLessThanOrEqual(junctionEdgeY); // never noses into the box
    expect(car.pos.y).toBeGreaterThan(junctionEdgeY - 64); // actually drove up to the line
    expect(car.pos.x).toBeCloseTo(start.x); // and held its lane
  });

  it.each([
    ['eastbound', vec2(1, 0), 10],
    ['westbound', vec2(-1, 0), 20],
    ['southbound', vec2(0, 1), 10],
    ['northbound', vec2(0, -1), 20],
  ])('stops at a natural traffic-light line on a wide road (%s)', (_label, dir, alongTile) => {
    const city = wideLightCity();
    const start = lanePoint(city, dir, alongTile);
    const trafficCar: Car = {
      pos: start,
      heading: Math.atan2(dir.y, dir.x),
      speed: 0,
      radius: 14,
    };
    const world = new World({
      player: player(),
      cars: [trafficCar],
      city,
      carDrivers: [{ dir }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.99,
    });
    world.lights = redLightFor(dir);

    for (let i = 0; i < 180; i++) world.tick(controls(), 1 / 60);

    const stopped = world.cars[0];
    const frontGap = frontGapToLight(stopped, dir);
    expect(stopped.speed).toBe(0);
    expect(frontGap).toBeGreaterThanOrEqual(8);
    expect(frontGap).toBeLessThanOrEqual(32);
    const lateral = dir.x !== 0 ? stopped.pos.y : stopped.pos.x;
    const startLateral = dir.x !== 0 ? start.y : start.x;
    expect(lateral).toBeCloseTo(startLateral);
  });

  it('releases a naturally stopped car when its traffic light turns green', () => {
    const city = wideLightCity();
    const dir = vec2(1, 0);
    const start = lanePoint(city, dir, 10);
    const trafficCar: Car = { pos: start, heading: 0, speed: 0, radius: 14 };
    const world = new World({
      player: player(),
      cars: [trafficCar],
      city,
      carDrivers: [{ dir }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.99,
    });
    world.lights = createTrafficLights(LIGHT_GREEN + 0.1); // horizontal traffic is red

    for (let i = 0; i < 180; i++) world.tick(controls(), 1 / 60);
    const stoppedX = world.cars[0].pos.x;
    expect(frontGapToLight(world.cars[0], dir)).toBeLessThanOrEqual(32);

    const ticksUntilGreenRelease = Math.ceil((LIGHT_PERIOD - (LIGHT_GREEN + 0.1) + 0.75) * 60);
    for (let i = 0; i < ticksUntilGreenRelease; i++) world.tick(controls(), 1 / 60);

    expect(world.cars[0].pos.x).toBeGreaterThan(stoppedX + 40);
    expect(world.cars[0].speed).toBeGreaterThan(0);
  });

  it('does not stop in the intersection after turning onto a red axis', () => {
    const city = wideLightCity();
    const dir = vec2(1, 0);
    const start = lanePoint(city, dir, 10);
    const trafficCar: Car = { pos: start, heading: 0, speed: 0, radius: 14 };
    const world = new World({
      player: player(),
      cars: [trafficCar],
      city,
      carDrivers: [{ dir }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0, // force a turn when the junction offers one
    });
    world.lights = createTrafficLights(0); // horizontal green, vertical red

    let turned = false;
    let stoppedInJunction = false;
    let clearedJunction = false;
    for (let i = 0; i < 360; i++) {
      world.tick(controls(), 1 / 60);
      const car = world.cars[0];
      turned ||= car.heading > 0.1;
      if (turned && inWideLightJunction(city, car) && car.speed === 0) stoppedInJunction = true;
      if (turned && !inWideLightJunction(city, car)) {
        clearedJunction = true;
        break;
      }
    }

    expect(turned).toBe(true);
    expect(stoppedInJunction).toBe(false);
    expect(clearedJunction).toBe(true);
  });

  it('changes lanes gradually instead of teleporting sideways', () => {
    const city = buildCity({ cols: 18, rows: 18, tile: 64, block: 6, roadWidth: 4 });
    const start = tileCenter(city.spec, 6, 2);
    const blocker = vec2(start.x + 40, start.y);
    const w = new World({
      player: { pos: blocker, angle: 0, radius: 8 },
      cars: [{ pos: start, heading: 0, speed: 0, radius: 12 }],
      city,
      carDrivers: [{ dir: vec2(1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    w.tick(controls(), 1 / 60);
    const car = w.cars[0];
    const shift = Math.abs(car.pos.y - start.y); // lateral (eastbound)
    expect(shift).toBeGreaterThan(0);
    expect(shift).toBeLessThan(20); // eased a little, not teleported
    // It keeps rolling forward while easing over — a diagonal swerve, never a
    // car sliding straight sideways.
    expect(car.pos.x).toBeGreaterThan(start.x);
    // And it faces where it is actually going (diagonally), not straight ahead.
    expect(Math.abs(car.heading)).toBeGreaterThan(0.05);
    expect(Math.abs(car.heading)).toBeLessThan(Math.PI / 2);
  });

  it('never teleports NPC cars across a wide road while they cruise and turn', () => {
    const city = buildCity({ cols: 24, rows: 24, tile: 64, block: 6, roadWidth: 4 });
    const cars: Car[] = [];
    const drivers: (TrafficAI | null)[] = [];
    for (let tx = 6; tx < 18; tx += 6) {
      cars.push({ pos: tileCenter(city.spec, tx + 3, 7), heading: Math.PI / 2, speed: 0, radius: 14 });
      drivers.push({ dir: vec2(0, 1) });
    }
    let seed = 7;
    const rng = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const w = new World({
      player: { pos: vec2(-9999, -9999), angle: 0, radius: 8 },
      cars,
      city,
      carDrivers: drivers,
      bounds: { width: city.width, height: city.height },
      rng,
    });
    const prev = w.cars.map((c) => ({ ...c.pos }));
    let maxJump = 0;
    for (let f = 0; f < 1200; f++) {
      w.tick(controls(), 1 / 60);
      w.cars.forEach((c, i) => {
        maxJump = Math.max(maxJump, Math.hypot(c.pos.x - prev[i].x, c.pos.y - prev[i].y));
        prev[i] = { ...c.pos };
      });
    }
    // Cruise (~2px/tick) plus a capped pivot — never a multi-lane teleport.
    expect(maxJump).toBeLessThan(40);
  });

  it('keeps a calm pedestrian off the road except at a crosswalk', () => {
    const city = miniCity();
    // A pedestrian on a building-interior tile (off the road) with a target on
    // the far side of the road: calm, it must not stride across mid-block.
    const start = tileCenter(city.spec, 2, 2); // interior tile, not a road
    const ped: Pedestrian = {
      pos: start,
      heading: 0,
      radius: 7,
      state: 'wander',
      target: tileCenter(city.spec, 2, 6), // across road row 4
    };
    const w = new World({
      player: player(),
      city,
      pedestrians: [ped],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.5,
    });

    const roadRowTop = 4 * city.spec.tile; // y where road row 4 begins
    const roadRowBottom = 5 * city.spec.tile;
    for (let i = 0; i < 600; i++) {
      w.tick(controls(), 1 / 60);
      const p = w.pedestrians[0];
      const onRoadRow = p.pos.y > roadRowTop && p.pos.y < roadRowBottom;
      const onSidewalk = city.sidewalks.some((sidewalk) => pointInRect(p.pos, sidewalk));
      const onCrosswalk = city.crosswalks.some((crosswalk) => pointInRect(p.pos, crosswalk));
      // It may only be within the road row if it is still on kerbside pavement
      // or at the marked crossing.
      if (onRoadRow && !onSidewalk) expect(onCrosswalk).toBe(true);
    }
  });

  it('lets a calm pedestrian cross the road at a crosswalk to reach the far side', () => {
    // A city with a building margin so sidewalks sit just off the road.
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4, margin: 10 });
    const y = 3 * city.spec.tile + city.spec.tile / 2;
    const roadStart = 4 * city.spec.tile;
    const roadEnd = 5 * city.spec.tile;
    const westBuilding = city.buildings
      .filter((b) => b.x + b.w <= roadStart && y >= b.y && y <= b.y + b.h)
      .sort((a, b) => b.x + b.w - (a.x + a.w))[0];
    const eastBuilding = city.buildings
      .filter((b) => b.x >= roadEnd && y >= b.y && y <= b.y + b.h)
      .sort((a, b) => a.x - b.x)[0];
    expect(westBuilding).toBeDefined();
    expect(eastBuilding).toBeDefined();
    const radius = 7;
    // Crosswalks are the road tiles adjacent to an intersection; (4,3) is the
    // approach just north of junction (4,4) on the vertical road. A pedestrian
    // crosses it east-west from the west sidewalk to the east sidewalk.
    const ped: Pedestrian = {
      pos: vec2(westBuilding!.x + westBuilding!.w + radius, y),
      heading: 0,
      radius,
      state: 'wander',
      target: vec2(eastBuilding!.x - radius, y),
    };
    const w = new World({
      player: player(),
      city,
      pedestrians: [ped],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.5,
    });

    let reachedFarSide = false;
    for (let i = 0; i < 1200; i++) {
      w.tick(controls(), 1 / 60);
      if (w.pedestrians[0].pos.x >= ped.target.x - 5) {
        reachedFarSide = true; // made it across the road to the east side
        break;
      }
    }
    expect(reachedFarSide).toBe(true); // it actually crossed, rather than being stuck
  });
});

describe('World living world', () => {
  const miniCity = () => buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });

  it('lets a pedestrian get into a parked car and drive away', () => {
    const city = miniCity();
    const parked: Car = { pos: tileCenter(city.spec, 0, 4), heading: Math.PI / 2, speed: 0, radius: 12 };
    const start = { ...parked.pos };
    const beside: Pedestrian = {
      pos: vec2(parked.pos.x + 18, parked.pos.y),
      heading: 0,
      radius: 7,
      state: 'wander',
      target: vec2(parked.pos.x + 18, parked.pos.y),
    };
    const w = new World({
      player: player(),
      cars: [parked],
      city,
      carDrivers: [null],
      pedestrians: [beside],
      bounds: { width: city.width, height: city.height },
      rng: () => 0, // the pedestrian always decides to drive, taking the first open road
    });

    for (let i = 0; i < 120; i++) w.tick(controls(), 1 / 60);
    expect(w.pedestrians).toHaveLength(0); // the pedestrian is now the driver
    expect(distance(w.cars[0].pos, start)).toBeGreaterThan(20); // and drove off
  });

  it('leaves a corpse where a pedestrian is shot', () => {
    const w = new World({
      player: player(), // origin, facing +x
      pedestrians: [pedAt(40, 0)],
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
    });
    for (let i = 0; i < 30 && w.pedestrians.length > 0; i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.pedestrians).toHaveLength(0);
    expect(w.corpses).toHaveLength(1);
  });

  it('clears a corpse left out of frame and respawns a pedestrian', () => {
    const w = new World({
      player: player(),
      pedestrians: [pedAt(40, 0)],
      viewRadius: 20, // the body ends up outside the (tiny) view
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
    });
    for (let i = 0; i < 30 && w.pedestrians.length > 0; i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.corpses).toHaveLength(1);

    for (let i = 0; i < 11 * 60; i++) w.tick(controls(), 1 / 60); // wait out the 10s
    expect(w.corpses).toHaveLength(0); // cleared while off-screen
    expect(w.pedestrians.length).toBeGreaterThanOrEqual(1); // a replacement appeared
  });

  it('sends an ambulance to collect a body that stays on screen', () => {
    const city = miniCity();
    const spot = tileCenter(city.spec, 2, 4); // on road row 4
    const victim = pedAt(spot.x, spot.y);
    const runner: Car = { pos: vec2(spot.x - 10, spot.y), heading: 0, speed: 100, radius: 12 };
    const w = new World({
      player: player(),
      cars: [runner],
      city,
      carDrivers: [null],
      pedestrians: [victim],
      viewRadius: 4000, // the whole map is "in frame"
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    w.tick(controls(), 1 / 60); // the NPC car runs the pedestrian down
    expect(w.corpses.length).toBeGreaterThanOrEqual(1);

    let dispatched = false;
    for (let i = 0; i < 3000 && w.corpses.length > 0; i++) {
      w.tick(controls(), 1 / 60);
      if (w.ambulance) dispatched = true;
    }
    expect(dispatched).toBe(true); // an ambulance was sent
    expect(w.corpses).toHaveLength(0); // and it took the body away
  });

  it('dispatches the ambulance from the hospital building', () => {
    const city = miniCity();
    const hospital = city.facilities.find((f) => f.kind === 'hospital');
    expect(hospital).toBeDefined();
    const w = new World({
      player: player(),
      city,
      bounds: { width: city.width, height: city.height },
    });
    w.corpses = [
      { pos: tileCenter(city.spec, 2, 4), offscreenFor: 0, inFrameFor: AMBULANCE_DISPATCH_DELAY },
    ];

    w.tick(controls(), 0); // dispatch without advancing away from the spawn point
    expect(w.ambulance?.pos).toEqual(hospital!.roadSpawn);
  });
});

describe('World road deaths', () => {
  it('kills the player when a fast car runs into them on foot', () => {
    const w = new World({
      player: player(), // (0,0)
      cars: [{ pos: vec2(15, 0), heading: 0, speed: 100, radius: 12 }], // fast and right on top
      bounds: { width: 4000, height: 4000 },
    });
    w.tick(controls(), 1 / 60);
    expect(w.isWasted).toBe(true);
  });

  it('does not kill the player when a slow car nudges them', () => {
    const w = new World({
      player: player(),
      cars: [{ pos: vec2(15, 0), heading: 0, speed: 10, radius: 12 }],
      bounds: { width: 4000, height: 4000 },
    });
    w.tick(controls(), 1 / 60);
    expect(w.isWasted).toBe(false);
  });

  it('respawns the player at the start after being run over', () => {
    const w = new World({
      player: { pos: vec2(100, 100), angle: 0, radius: 8 },
      cars: [{ pos: vec2(108, 100), heading: 0, speed: 100, radius: 12 }],
      spawn: vec2(0, 0),
      bounds: { width: 4000, height: 4000 },
    });
    w.tick(controls(), 1 / 60);
    expect(w.isWasted).toBe(true);

    w.tick(controls({ confirm: true }), 1 / 60);
    expect(w.isWasted).toBe(false);
    expect(w.player.pos).toEqual(vec2(0, 0));
  });

  it('lets NPC traffic run a pedestrian over without raising the wanted level', () => {
    const w = new World({
      player: player(),
      cars: [{ pos: vec2(55, 0), heading: 0, speed: 100, radius: 12 }], // fast, already on the ped
      pedestrians: [pedAt(60, 0)],
      bounds: { width: 4000, height: 4000 },
    });
    w.tick(controls(), 1 / 60);
    expect(w.pedestrians).toHaveLength(0); // killed by the NPC car
    expect(w.wantedStars).toBe(0); // but the player earns no heat for it
    expect(w.kills).toBe(0); // and gets no credit or score
    expect(w.score.current).toBe(0);
  });
});

describe('World water', () => {
  it('wastes the player who walks into the water', () => {
    const w = new World({
      player: player(), // (0,0)
      water: [rect(40, -50, 80, 200)],
      bounds: { width: 4000, height: 4000 },
    });
    for (let i = 0; i < 240 && !w.isWasted; i++) w.tick(controls({ right: true }), 1 / 60);
    expect(w.isWasted).toBe(true);
  });

  it('keeps the player safe on a bridge between two stretches of water', () => {
    const w = new World({
      player: { pos: vec2(70, 50), angle: 0, radius: 8 }, // on the dry gap
      water: [rect(0, -50, 60, 200), rect(80, -50, 60, 200)],
      bounds: { width: 4000, height: 4000 },
    });
    for (let i = 0; i < 120; i++) w.tick(controls(), 1 / 60);
    expect(w.isWasted).toBe(false);
  });

  it('drowns a car driven off into the water', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      water: [rect(220, -80, 400, 200)],
      bounds: { width: 4000, height: 4000 },
    });
    w.tick(controls({ action: true }), 1 / 60); // hijack the car
    for (let i = 0; i < 300 && !w.isWasted; i++) w.tick(controls({ up: true }), 1 / 60);
    expect(w.isWasted).toBe(true);
  });
});

describe('World combat', () => {
  it('starts the player at full health with a loaded weapon', () => {
    const w = new World({ player: player() });
    expect(w.health.current).toBe(PLAYER_MAX_HEALTH);
    expect(w.health.current).toBe(w.health.max);
    expect(w.weapon.ammo).toBeGreaterThan(0);
  });

  it('fires a bullet toward the player facing, spending ammo', () => {
    const w = new World({ player: player() }); // facing +x (angle 0)
    const ammo = w.weapon.ammo;
    w.tick(controls({ fire: true }), 1 / 60);
    expect(w.bullets).toHaveLength(1);
    expect(w.weapon.ammo).toBe(ammo - 1);
    expect(w.bullets[0].velocity.x).toBeGreaterThan(0); // travelling east
  });

  it('shoots a pedestrian dead, scoring and counting the kill', () => {
    const w = new World({
      player: player(), // at (0,0) facing +x
      pedestrians: [pedAt(40, 0)],
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
    });
    for (let i = 0; i < 30 && w.pedestrians.length > 0; i++) {
      w.tick(controls({ fire: true }), 1 / 60);
    }
    expect(w.pedestrians).toHaveLength(0);
    expect(w.kills).toBe(1);
    expect(w.score.current).toBe(SCORE_PER_PEDESTRIAN);
    expect(w.wantedStars).toBeGreaterThanOrEqual(1); // shooting people is a crime
  });

  it('shoots a pursuing officer, scoring more than a civilian', () => {
    const w = new World({
      player: player(),
      police: [{ pos: vec2(50, 0), heading: 0, radius: 12, kind: 'foot' }],
      bounds: { width: 4000, height: 4000 },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice); // wanted, so the officer stays
    for (let i = 0; i < 20 && w.police.length > 0; i++) {
      w.tick(controls({ fire: true }), 1 / 60);
    }
    expect(w.police).toHaveLength(0);
    expect(w.corpses).toHaveLength(1); // cops die into bodies instead of vanishing
    expect(w.kills).toBe(1);
    expect(w.score.current).toBe(SCORE_PER_POLICE);
  });

  it('expires a bullet after its range without a hit', () => {
    const w = new World({ player: player() });
    w.tick(controls({ fire: true }), 1 / 60);
    expect(w.bullets).toHaveLength(1);
    for (let i = 0; i < 120; i++) w.tick(controls(), 1 / 60); // 2s > bullet life
    expect(w.bullets).toHaveLength(0);
  });

  it('stops a bullet at a building instead of shooting through it', () => {
    const wall = rect(20, -50, 10, 100); // between the player and the pedestrian
    const w = new World({
      player: player(),
      pedestrians: [pedAt(60, 0)],
      walls: [wall],
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
    });
    for (let i = 0; i < 60; i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.pedestrians).toHaveLength(1); // the wall shielded them
  });
});

describe('World health', () => {
  it('injures but does not kill the player on a survivable car hit', () => {
    const w = new World({
      player: player(),
      cars: [{ pos: vec2(15, 0), heading: 0, speed: 60, radius: 12 }],
      maxHealth: 100,
      bounds: { width: 4000, height: 4000 },
    });
    w.tick(controls(), 1 / 60);
    expect(w.isWasted).toBe(false);
    expect(w.health.current).toBe(40); // 100 - 60
  });

  it('restores full health after respawning', () => {
    const w = new World({
      player: { pos: vec2(100, 100), angle: 0, radius: 8 },
      cars: [{ pos: vec2(108, 100), heading: 0, speed: 200, radius: 12 }],
      spawn: vec2(0, 0),
      bounds: { width: 4000, height: 4000 },
    });
    w.tick(controls(), 1 / 60);
    expect(w.isWasted).toBe(true);
    expect(w.health.current).toBe(0);

    w.tick(controls({ confirm: true }), 1 / 60);
    expect(w.isWasted).toBe(false);
    expect(w.health.current).toBe(w.health.max);
  });
});

describe('World police shooting', () => {
  it('does not shoot at a low wanted level', () => {
    const w = new World({
      player: player(),
      police: [{ pos: vec2(200, 0), heading: Math.PI, radius: 12, kind: 'foot' }],
      bounds: { width: 4000, height: 4000 },
    });
    w.wanted = addHeat(createWanted(), 250); // 2 stars: below the shooting threshold
    for (let i = 0; i < 10; i++) w.tick(controls(), 1 / 60);
    expect(w.policeBullets).toHaveLength(0);
  });

  it('opens fire above two stars and wounds the player', () => {
    const w = new World({
      player: player(), // on foot at the origin
      police: [{ pos: vec2(180, 0), heading: Math.PI, radius: 12, kind: 'foot' }],
      bounds: { width: 4000, height: 4000 },
    });
    w.wanted = addHeat(createWanted(), 500); // 5 stars: officers shoot
    w.tick(controls(), 1 / 60);
    expect(w.policeBullets.length).toBeGreaterThanOrEqual(1); // fired on sight

    const full = w.health.current;
    for (let i = 0; i < 24 && !w.isWasted; i++) w.tick(controls(), 1 / 60);
    expect(w.health.current).toBeLessThan(full); // a bullet connected
  });
});

describe('World patrol car arrest', () => {
  it('drops an officer to bust a player it has pinned in a stopped car', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      city,
      police: [{ pos: vec2(46, 0), heading: Math.PI, radius: 14, kind: 'car' }],
      bounds: { width: city.width, height: city.height },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice); // wanted, so the cop stays
    w.tick(controls({ action: true }), 1 / 60); // hijack the car, then sit still

    let footAppeared = false;
    for (let i = 0; i < 300 && !w.isBusted; i++) {
      w.tick(controls(), 1 / 60);
      if (w.police.some((c) => c.kind === 'foot')) footAppeared = true;
    }
    expect(footAppeared).toBe(true); // an officer got out of the patrol car
    expect(w.isBusted).toBe(true); // and made the arrest
  });

  it('drops an officer to arrest an on-foot player instead of ramming them', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const spot = tileCenter(city.spec, 4, 4); // on the road grid
    const w = new World({
      player: { pos: spot, angle: 0, radius: 8 },
      city,
      police: [{ pos: vec2(spot.x + 60, spot.y), heading: Math.PI, radius: 14, kind: 'car' }],
      bounds: { width: city.width, height: city.height },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice);

    let footAppeared = false;
    let minCarDist = Infinity;
    for (let i = 0; i < 360 && !w.isBusted; i++) {
      w.tick(controls(), 1 / 60);
      const patrol = w.police.find((c) => c.kind === 'car');
      if (patrol) minCarDist = Math.min(minCarDist, distance(patrol.pos, w.focus));
      if (w.police.some((c) => c.kind === 'foot')) footAppeared = true;
    }
    expect(footAppeared).toBe(true); // the car deployed an officer
    expect(w.isBusted).toBe(true); // who arrested the player on foot
    // The car itself stopped short rather than driving onto the player.
    expect(minCarDist).toBeGreaterThan(8); // never overlapped the player's centre
  });

  it('does not bust the player by patrol-car contact alone (no officer)', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const spot = tileCenter(city.spec, 4, 4);
    const w = new World({
      player: { pos: spot, angle: 0, radius: 8 },
      city,
      // A patrol car sitting right on the player, but already "spent" its officer.
      police: [{ pos: spot, heading: 0, radius: 14, kind: 'car', deployed: true }],
      bounds: { width: city.width, height: city.height },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice);
    w.tick(controls(), 1 / 60);
    expect(w.isBusted).toBe(false); // a car alone cannot make the arrest
  });
});

describe('World busts a player on the sidewalk', () => {
  it('lets a foot officer arrest a player loitering on the pavement by a corner', () => {
    // Buildings are inset from the roads (margin), like the real city, so the
    // pavement hugging a building sits inside a tile whose centre is the
    // building itself — that tile is off the walkable nav-grid. Near a corner
    // the nearest walkable tile is diagonal, so an officer routed purely by the
    // flow field is steered away and can never close the final step. It must
    // still be able to bust a player who just stands on the pavement.
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 5, margin: 18 });
    const onPavement = vec2(76, 96); // left pavement, by the building's top-left corner
    expect(city.sidewalks.some((s) => pointInRect(onPavement, s))).toBe(true);

    const w = new World({
      player: { pos: onPavement, angle: 0, radius: 8 },
      city,
      police: [{ pos: vec2(40, 96), heading: 0, radius: 12, kind: 'foot' }],
      walls: [...city.buildings, ...city.fences],
      bounds: { width: city.width, height: city.height },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice);

    for (let i = 0; i < 600 && !w.isBusted; i++) w.tick(controls(), 1 / 60);
    expect(w.isBusted).toBe(true);
  });
});


describe('World car explosions', () => {
  it('destroys a car after enough shots, leaving a wreck and a blast', () => {
    const w = new World({
      player: player(), // origin, facing +x
      cars: [carAt(140, 0)], // far enough that the blast does not reach the player
      bounds: { width: 4000, height: 4000 },
    });
    for (let i = 0; i < 180 && !w.wreckedCars[0]; i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.wreckedCars[0]).toBe(true);
    expect(w.explosionsTriggered).toBeGreaterThanOrEqual(1);
    expect(w.isWasted).toBe(false); // the player was clear of the blast
    expect(w.wantedStars).toBeGreaterThanOrEqual(1); // blowing up a car is a crime
  });

  it('chains the blast to a nearby car', () => {
    const w = new World({
      player: player(),
      cars: [carAt(140, 0), carAt(184, 0)], // the second sits inside the first's blast
      bounds: { width: 4000, height: 4000 },
    });
    for (let i = 0; i < 180 && !w.wreckedCars[0]; i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.wreckedCars[0]).toBe(true);
    expect(w.wreckedCars[1]).toBe(true); // detonated by the chain reaction
  });

  it('does not let the player drive a wrecked car', () => {
    const w = new World({
      player: { pos: vec2(120, 0), angle: 0, radius: 8 },
      cars: [carAt(140, 0)],
      bounds: { width: 4000, height: 4000 },
    });
    for (let i = 0; i < 180 && !w.wreckedCars[0]; i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.wreckedCars[0]).toBe(true);
    w.tick(controls({ action: true }), 1 / 60); // try to get in
    expect(w.isDriving).toBe(false);
  });

  it('wounds the player caught in the blast of a car they shoot', () => {
    const w = new World({
      player: player(), // origin, within blast range of the car
      cars: [carAt(60, 0)],
      bounds: { width: 4000, height: 4000 },
    });
    for (let i = 0; i < 180 && !w.wreckedCars[0]; i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.wreckedCars[0]).toBe(true);
    expect(w.health.current).toBeLessThan(PLAYER_MAX_HEALTH); // singed by the explosion
  });

  it('blows up a car that is repeatedly rammed by another car', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    // A stopped car sits in the lane; an NPC keeps driving into it.
    const stopped: Car = { pos: tileCenter(city.spec, 3, 4), heading: 0, speed: 0, radius: 12 };
    const rammer: Car = { pos: tileCenter(city.spec, 1, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: player(), // far away at the origin
      cars: [stopped, rammer],
      city,
      carDrivers: [null, { dir: vec2(1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9, // the NPC keeps driving straight
    });
    w.lights = createTrafficLights(0); // east-west green, so the rammer never stops

    for (let i = 0; i < 1800 && w.explosionsTriggered === 0; i++) w.tick(controls(), 1 / 60);
    expect(w.explosionsTriggered).toBeGreaterThanOrEqual(1); // rammed to destruction
    expect(w.wreckedCars.some(Boolean)).toBe(true);
    // The player was nowhere near it, so the crash must NOT make them wanted.
    expect(w.wantedStars).toBe(0);
    expect(w.kills).toBe(0);
  });

  it('does not make the player wanted when two NPC cars crash and explode', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    // Two NPC cars driving head-on toward each other on the same lane.
    const east: Car = { pos: tileCenter(city.spec, 1, 4), heading: 0, speed: 0, radius: 12 };
    const west: Car = { pos: tileCenter(city.spec, 6, 4), heading: Math.PI, speed: 0, radius: 12 };
    const w = new World({
      player: player(), // far away at the origin, doing nothing
      cars: [east, west],
      city,
      carDrivers: [{ dir: vec2(1, 0) }, { dir: vec2(-1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9, // neither turns off the lane
    });
    w.lights = createTrafficLights(0); // east-west green: both keep driving

    for (let i = 0; i < 1200 && w.explosionsTriggered === 0; i++) w.tick(controls(), 1 / 60);
    expect(w.explosionsTriggered).toBeGreaterThanOrEqual(1); // they crashed and blew up
    expect(w.wantedStars).toBe(0); // the player did nothing: no heat
    expect(w.kills).toBe(0);
    expect(w.score.current).toBe(0);
  });

  it('does not let two NPC cars blow up immediately on first impact', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const east: Car = { pos: tileCenter(city.spec, 1, 4), heading: 0, speed: 0, radius: 12 };
    const west: Car = { pos: tileCenter(city.spec, 6, 4), heading: Math.PI, speed: 0, radius: 12 };
    const w = new World({
      player: player(),
      cars: [east, west],
      city,
      carDrivers: [{ dir: vec2(1, 0) }, { dir: vec2(-1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    w.lights = createTrafficLights(0);

    for (let i = 0; i < 180 && w.explosionsTriggered === 0; i++) w.tick(controls(), 1 / 60);
    expect(w.explosionsTriggered).toBe(0); // the first crash is messy, but not instant fireball city
  });

  it('blows up an ambulance that is repeatedly rammed by a car', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const laneY = tileCenter(city.spec, 0, 4).y;
    const w = new World({
      player: player(),
      cars: [{ pos: tileCenter(city.spec, 1, 4), heading: 0, speed: 0, radius: 12 }],
      city,
      carDrivers: [{ dir: vec2(1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    w.lights = createTrafficLights(0); // east-west green: the rammer keeps going
    w.ambulance = {
      pos: tileCenter(city.spec, 3, 4),
      heading: 0,
      radius: 14,
      dir: vec2(1, 0),
      target: vec2(tileCenter(city.spec, 3, 4).x + 600, laneY),
      phase: 'collect',
      crew: tileCenter(city.spec, 3, 4),
      age: 0,
      speed: 0,
      blocked: 0,
      health: CAR_MAX_HEALTH,
    };

    for (let i = 0; i < 2400 && w.ambulance; i++) w.tick(controls(), 1 / 60);
    expect(w.ambulance).toBeNull();
    expect(w.explosionsTriggered).toBeGreaterThanOrEqual(1);
  });

  it('destroys a tow truck after enough shots, leaving an explosion', () => {
    const w = new World({
      player: player(),
      cars: [carAt(400, 400)],
      bounds: { width: 4000, height: 4000 },
    });
    w.tows = [
      {
        pos: vec2(140, 0),
        heading: Math.PI,
        radius: 14,
        dir: vec2(-1, 0),
        target: vec2(0, 0),
        phase: 'approach',
        crew: null,
        age: 0,
        speed: 0,
        blocked: 0,
        health: CAR_MAX_HEALTH,
        targetCar: 0,
      },
    ];

    for (let i = 0; i < 180 && w.tows.length > 0; i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.tows).toHaveLength(0);
    expect(w.explosionsTriggered).toBeGreaterThanOrEqual(1);
  });

  it('destroys a patrol car after enough shots, leaving an explosion', () => {
    const w = new World({
      player: player(),
      police: [{ pos: vec2(140, 0), heading: Math.PI, radius: 14, kind: 'car' }],
      bounds: { width: 4000, height: 4000 },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice); // keep the patrol car active

    for (let i = 0; i < 180 && w.police.some((c) => c.kind === 'car'); i++) {
      w.tick(controls({ fire: true }), 1 / 60);
    }
    expect(w.police.some((c) => c.kind === 'car')).toBe(false);
    expect(w.explosionsTriggered).toBeGreaterThanOrEqual(1);
  });
});

describe('World tow truck', () => {
  const miniCity = () => buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });

  it('sends a tow truck to haul away a wreck', () => {
    const city = miniCity();
    const target: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: { pos: tileCenter(city.spec, 0, 4), angle: 0, radius: 8 }, // on road row 4, facing +x
      cars: [target],
      city,
      carDrivers: [null],
      viewRadius: 4000, // the wreck stays "in frame"
      bounds: { width: city.width, height: city.height },
    });

    // Shoot the car until it is destroyed into a wreck.
    for (let i = 0; i < 200 && !w.wreckedCars[0]; i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.wreckedCars[0]).toBe(true);

    let dispatched = false;
    for (let i = 0; i < 1200 && !w.towedCars[0]; i++) {
      w.tick(controls(), 1 / 60);
      if (w.tows.length > 0) dispatched = true;
    }
    expect(dispatched).toBe(true); // a tow truck arrived
    expect(w.towedCars[0]).toBe(true); // and hauled the wreck away
  });

  it('clears several wrecks at once with multiple tow trucks', () => {
    const city = miniCity();
    // Three wrecks dotted along the road grid (marked wrecked up front).
    const cars: Car[] = [
      { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 },
      { pos: tileCenter(city.spec, 6, 4), heading: 0, speed: 0, radius: 12 },
      { pos: tileCenter(city.spec, 8, 8), heading: 0, speed: 0, radius: 12 },
    ];
    const w = new World({
      player: { pos: tileCenter(city.spec, 8, 0), angle: 0, radius: 8 },
      cars,
      city,
      carDrivers: [null, null, null],
      bounds: { width: city.width, height: city.height },
    });
    // Force all three into wrecks (no need to shoot each one).
    for (let i = 0; i < cars.length; i++) w.wreckedCars[i] = true;

    let maxConcurrent = 0;
    for (let i = 0; i < 5000 && !w.towedCars.every(Boolean); i++) {
      w.tick(controls(), 1 / 60);
      maxConcurrent = Math.max(maxConcurrent, w.tows.length);
    }
    expect(maxConcurrent).toBeGreaterThan(1); // several tows worked in parallel
    expect(w.towedCars.every(Boolean)).toBe(true); // every wreck was hauled away
  });

  it('dispatches the tow truck from the tow yard building', () => {
    const city = miniCity();
    const towYard = city.facilities.find((f) => f.kind === 'towYard');
    expect(towYard).toBeDefined();
    const w = new World({
      player: player(),
      cars: [{ pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 }],
      city,
      carDrivers: [null],
      bounds: { width: city.width, height: city.height },
    });
    w.wreckedCars[0] = true;

    w.tick(controls(), 0); // dispatch without advancing away from the spawn point
    expect(w.tows[0]?.pos).toEqual(towYard!.roadSpawn);
  });
});

describe('World service vehicles treat actors as solid', () => {
  const miniCity = () => buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });

  it('makes a dispatched vehicle brake for someone in its path and route around them', () => {
    const city = miniCity();
    const wreck: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: { pos: tileCenter(city.spec, 0, 4), angle: 0, radius: 8 }, // stands across the lane
      cars: [wreck],
      city,
      carDrivers: [null],
      viewRadius: 4000, // the wreck stays "in frame" so a tow is dispatched
      bounds: { width: city.width, height: city.height },
    });
    w.wreckedCars[0] = true;

    let yielded = false;
    for (let i = 0; i < 1200 && !w.towedCars[0]; i++) {
      w.tick(controls(), 1 / 60);
      if (w.tows[0]?.speed === 0) yielded = true; // braked to a halt for the player
    }
    expect(yielded).toBe(true); // it waited rather than driving straight through them
    expect(w.towedCars[0]).toBe(true); // and found a way around to reach its job
    expect(w.isWasted).toBe(false); // the blocked player was never driven over
  });

  it('runs over the player when a dispatched vehicle bears down on them', () => {
    const city = miniCity();
    const wreck: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: player(),
      cars: [wreck],
      city,
      carDrivers: [null],
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
    });
    w.wreckedCars[0] = true;

    w.tick(controls(), 0); // dispatch the tow at the yard without moving it yet
    const tow = w.tows[0]!;
    w.player = {
      ...w.player,
      pos: vec2(tow.pos.x + Math.cos(tow.heading) * 15, tow.pos.y + Math.sin(tow.heading) * 15),
      angle: tow.heading,
    };

    for (let i = 0; i < 400 && !w.isWasted; i++) w.tick(controls(), 1 / 60);
    expect(w.isWasted).toBe(true); // the moving tow truck mowed the player down
  });
});

describe('World service vehicle crew fetch the cargo on foot', () => {
  const miniCity = () => buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });

  it('leaves a corpse when the medic is shot on foot', () => {
    const city = miniCity();
    const spot = tileCenter(city.spec, 2, 4);
    const runner: Car = { pos: vec2(spot.x - 10, spot.y), heading: 0, speed: 100, radius: 12 };
    const w = new World({
      player: player(),
      cars: [runner],
      city,
      carDrivers: [null],
      pedestrians: [pedAt(spot.x, spot.y)],
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    w.tick(controls(), 1 / 60); // create the corpse that summons the ambulance
    for (let i = 0; i < 3000; i++) {
      w.tick(controls(), 1 / 60);
      if (w.ambulance?.crew && w.ambulance.phase === 'return' && w.corpses.length === 0) break;
    }
    expect(w.ambulance?.crew).not.toBeNull();
    expect(w.ambulance?.phase).toBe('return');

    for (let i = 0; i < 30 && w.ambulance; i++) {
      const crew = w.ambulance.crew;
      if (crew) w.player = { ...w.player, pos: vec2(crew.x - 30, crew.y), angle: 0 };
      w.tick(controls({ fire: true }), 1 / 60);
    }
    expect(w.ambulance).toBeNull();
    expect(w.corpses).toHaveLength(1); // the medic's body remains in the street
    expect(w.cars).toHaveLength(2);
    expect(w.wreckedCars[1]).toBe(true); // the abandoned ambulance stays behind for recovery
    expect(w.towedCars[1]).toBe(false);
    expect(w.kills).toBe(1);
  });

  it('has a tow truck recover an abandoned ambulance after the medic is killed', () => {
    const city = miniCity();
    const spot = tileCenter(city.spec, 2, 4);
    const runner: Car = { pos: vec2(spot.x - 10, spot.y), heading: 0, speed: 100, radius: 12 };
    const w = new World({
      player: player(),
      cars: [runner],
      city,
      carDrivers: [null],
      pedestrians: [pedAt(spot.x, spot.y)],
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    w.tick(controls(), 1 / 60);
    for (let i = 0; i < 3000; i++) {
      w.tick(controls(), 1 / 60);
      if (w.ambulance?.crew && w.ambulance.phase === 'return' && w.corpses.length === 0) break;
    }

    for (let i = 0; i < 30 && w.ambulance; i++) {
      const crew = w.ambulance.crew;
      if (crew) w.player = { ...w.player, pos: vec2(crew.x - 30, crew.y), angle: 0 };
      w.tick(controls({ fire: true }), 1 / 60);
    }

    expect(w.ambulance).toBeNull();
    expect(w.wreckedCars[1]).toBe(true);
    for (let i = 0; i < 4000 && !w.towedCars[1]; i++) w.tick(controls(), 1 / 60);
    expect(w.towedCars[1]).toBe(true); // another tow eventually hauls off the abandoned ambulance
  });

  it('parks the ambulance and sends a medic out to collect the body', () => {
    const city = miniCity();
    const spot = tileCenter(city.spec, 2, 4); // on road row 4
    const runner: Car = { pos: vec2(spot.x - 10, spot.y), heading: 0, speed: 100, radius: 12 };
    const w = new World({
      player: player(),
      cars: [runner],
      city,
      carDrivers: [null],
      pedestrians: [pedAt(spot.x, spot.y)],
      viewRadius: 4000, // the whole map is "in frame"
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    w.tick(controls(), 1 / 60); // the NPC car runs the pedestrian down
    expect(w.corpses.length).toBeGreaterThanOrEqual(1);

    // Drive on until the body is collected, watching the medic step out on foot.
    let medicWalkedOut = false;
    let parkedBesideBody = false;
    for (let i = 0; i < 3000 && w.corpses.length > 0; i++) {
      w.tick(controls(), 1 / 60);
      const amb = w.ambulance;
      if (amb?.crew) {
        medicWalkedOut = true;
        // While the medic is out, the ambulance is stopped and the body still lies there.
        if (amb.speed === 0 && w.corpses.length > 0) parkedBesideBody = true;
      }
    }
    expect(medicWalkedOut).toBe(true); // a medic got out and walked to the body
    expect(parkedBesideBody).toBe(true); // the ambulance waited, stationary, beside it
    expect(w.corpses).toHaveLength(0); // and the medic picked the body up

    // The medic carries it back, climbs in, and only then does the ambulance leave.
    let climbedBackIn = false;
    for (let i = 0; i < 3000 && w.ambulance; i++) {
      w.tick(controls(), 1 / 60);
      if (w.ambulance && w.ambulance.crew === null) climbedBackIn = true;
    }
    expect(climbedBackIn).toBe(true); // the medic got back aboard
    expect(w.ambulance).toBeNull(); // and the ambulance drove off the map
  });

  it('parks the tow truck and sends an operator out to hook the one wreck', () => {
    const city = miniCity();
    const wreck: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: player(), // (0,0) — clear of the truck's route and the wreck
      cars: [wreck],
      city,
      carDrivers: [null],
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
    });
    w.wreckedCars[0] = true;

    let operatorWalkedOut = false;
    let parkedBesideWreck = false;
    for (let i = 0; i < 1500 && !w.towedCars[0]; i++) {
      w.tick(controls(), 1 / 60);
      const tow = w.tows[0];
      if (tow?.crew) {
        operatorWalkedOut = true;
        // While the operator is out, the truck is stopped and the wreck not yet hooked.
        if (tow.speed === 0 && !w.towedCars[0]) parkedBesideWreck = true;
      }
    }
    expect(operatorWalkedOut).toBe(true); // an operator got out and walked to the wreck
    expect(parkedBesideWreck).toBe(true); // the truck waited, stationary, beside it
    expect(w.towedCars[0]).toBe(true); // and the operator hooked it up

    // It carries the single car away and leaves; no second car is ever taken.
    for (let i = 0; i < 3000 && w.tows.length > 0; i++) w.tick(controls(), 1 / 60);
    expect(w.tows).toHaveLength(0); // the lone truck departed once its one car was done
    expect(w.towedCars.filter(Boolean)).toHaveLength(1); // exactly one car was taken
  });

  it('leaves a corpse when the tow operator is shot on foot', () => {
    const city = miniCity();
    const wreck: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: player(),
      cars: [wreck],
      city,
      carDrivers: [null],
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
    });
    w.wreckedCars[0] = true;

    for (let i = 0; i < 3000; i++) {
      w.tick(controls(), 1 / 60);
      if (w.tows[0]?.crew && w.tows[0].phase === 'return' && w.towedCars[0]) break;
    }
    expect(w.tows[0]?.crew).not.toBeNull();
    expect(w.tows[0]?.phase).toBe('return');

    for (let i = 0; i < 30 && w.tows.length > 0; i++) {
      const crew = w.tows[0].crew;
      if (crew) w.player = { ...w.player, pos: vec2(crew.x - 30, crew.y), angle: 0 };
      w.tick(controls({ fire: true }), 1 / 60);
    }
    expect(w.corpses).toHaveLength(1); // the operator dies into a body instead of vanishing
    expect(w.cars).toHaveLength(2);
    expect(w.wreckedCars[1]).toBe(true); // the abandoned tow truck remains for later pickup
    expect(w.towedCars[1]).toBe(false);
    for (let i = 0; i < 4000 && !w.towedCars[1]; i++) w.tick(controls(), 1 / 60);
    expect(w.towedCars[1]).toBe(true); // another tow eventually recovers the abandoned truck
    expect(w.kills).toBe(1);
  });
});

describe('World mission', () => {
  it('tracks a reach-then-eliminate mission and banks the reward', () => {
    const w = new World({
      player: player(), // already at the reach target (0,0)
      pedestrians: [pedAt(40, 0)],
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
      mission: createMission({
        id: 'm1',
        title: 'Cleanup',
        objectives: [
          { kind: 'reach', description: 'Get to the spot', target: vec2(0, 0), radius: 10 },
          { kind: 'eliminate', description: 'Take out 1 target', count: 1 },
        ],
        reward: 500,
      }),
    });

    w.tick(controls(), 1 / 60); // standing on the target advances past 'reach'
    expect(w.missionObjective?.kind).toBe('eliminate');

    for (let i = 0; i < 30 && !w.missionComplete; i++) {
      w.tick(controls({ fire: true }), 1 / 60);
    }
    expect(w.missionComplete).toBe(true);
    // Reward plus the score for the pedestrian eliminated.
    expect(w.score.current).toBe(500 + SCORE_PER_PEDESTRIAN);
  });

  it('rolls through a multi-mission campaign one mission at a time', () => {
    const w = new World({
      player: player(), // at (0,0)
      bounds: { width: 1000, height: 1000 },
      missions: [
        createMission({
          id: 'm1',
          title: 'First',
          objectives: [{ kind: 'reach', description: 'A', target: vec2(0, 0), radius: 10 }],
          reward: 100,
        }),
        createMission({
          id: 'm2',
          title: 'Second',
          objectives: [{ kind: 'reach', description: 'B', target: vec2(200, 0), radius: 10 }],
          reward: 300,
        }),
      ],
    });

    // Standing on the first target completes mission 1 and rolls onto mission 2.
    w.tick(controls(), 1 / 60);
    expect(w.mission?.id).toBe('m2');
    expect(w.missionComplete).toBe(false);
    expect(w.score.current).toBe(100); // first reward banked

    // Walk to the second target to finish the whole campaign.
    for (let i = 0; i < 300 && !w.missionComplete; i++) w.tick(controls({ right: true }), 1 / 60);
    expect(w.missionComplete).toBe(true);
    expect(w.mission).toBeNull();
    expect(w.score.current).toBe(100 + 300);
  });

  it('loops endlessly through a pool of campaigns, never reporting complete', () => {
    const w = new World({
      player: player(), // at (0,0)
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
      campaigns: [
        [
          createMission({
            id: 'a1',
            title: 'Contract A',
            objectives: [{ kind: 'reach', description: 'A', target: vec2(0, 0), radius: 10 }],
            reward: 100,
          }),
        ],
        [
          createMission({
            id: 'b1',
            title: 'Contract B',
            objectives: [{ kind: 'reach', description: 'B', target: vec2(0, 0), radius: 10 }],
            reward: 200,
          }),
        ],
      ],
    });

    // Standing on the target completes whichever campaign is active; a fresh one
    // immediately takes over, so the game never declares "all complete".
    expect(w.mission).not.toBeNull();
    for (let i = 0; i < 10; i++) w.tick(controls(), 1 / 60);
    expect(w.missionComplete).toBe(false); // endless: always another contract
    expect(w.mission).not.toBeNull();
    expect(w.score.current).toBeGreaterThan(0); // rewards keep banking as it loops
  });

  it('reports numeric progress for an eliminate objective', () => {
    const w = new World({
      player: player(),
      pedestrians: [pedAt(40, 0), pedAt(-40, 0)],
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
      mission: createMission({
        id: 'spree',
        title: 'Spree',
        objectives: [{ kind: 'eliminate', description: 'Take down 2', count: 2 }],
        reward: 300,
      }),
    });
    expect(w.missionProgress).toEqual({ current: 0, goal: 2 });
    for (let i = 0; i < 30 && (w.missionProgress?.current ?? 0) < 1; i++) {
      w.tick(controls({ fire: true }), 1 / 60);
    }
    expect(w.missionProgress?.current).toBeGreaterThanOrEqual(1);
  });

  it('completes a survive objective after enough time passes', () => {
    const w = new World({
      player: player(),
      bounds: { width: 1000, height: 1000 },
      missions: [
        createMission({
          id: 'lay-low',
          title: 'Lay Low',
          objectives: [{ kind: 'survive', description: 'Survive 2s', seconds: 2 }],
          reward: 400,
        }),
      ],
    });

    for (let i = 0; i < 60; i++) w.tick(controls(), 1 / 60); // 1s elapsed
    expect(w.missionComplete).toBe(false);
    for (let i = 0; i < 90; i++) w.tick(controls(), 1 / 60); // 2.5s total
    expect(w.missionComplete).toBe(true);
    expect(w.score.current).toBe(400);
  });

  it('completes a collect objective by picking up ammo', () => {
    const w = new World({
      player: player(), // at (0,0)
      bounds: { width: 1000, height: 1000 },
      ammoPickups: [{ pos: vec2(0, 0), amount: 10 }],
      missions: [
        createMission({
          id: 'supply',
          title: 'Supply Run',
          objectives: [{ kind: 'collect', description: 'Grab 1 crate', count: 1 }],
          reward: 200,
        }),
      ],
    });
    const ammoBefore = w.weapon.ammo;

    w.tick(controls(), 1 / 60);
    expect(w.collected).toBe(1);
    expect(w.weapon.ammo).toBe(ammoBefore + 10);
    expect(w.ammoPickups).toHaveLength(0);
    expect(w.missionComplete).toBe(true);
    expect(w.score.current).toBe(200);
  });
});

describe('World ammo pickups', () => {
  it('refills ammo when the player reaches a pickup, then removes it', () => {
    const w = new World({
      player: player(),
      ammoPickups: [{ pos: vec2(10, 0), amount: 12 }],
      bounds: { width: 1000, height: 1000 },
    });
    const before = w.weapon.ammo;
    w.tick(controls(), 1 / 60);
    expect(w.weapon.ammo).toBe(before + 12);
    expect(w.ammoPickups).toHaveLength(0);
  });

  it('leaves a distant pickup untouched', () => {
    const w = new World({
      player: player(),
      ammoPickups: [{ pos: vec2(500, 500), amount: 12 }],
      bounds: { width: 1000, height: 1000 },
    });
    const before = w.weapon.ammo;
    w.tick(controls(), 1 / 60);
    expect(w.weapon.ammo).toBe(before);
    expect(w.ammoPickups).toHaveLength(1);
  });
});

describe('World patrol car collisions', () => {
  it('stops a patrol car from driving through the player car', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      city,
      police: [{ pos: vec2(44, 0), heading: Math.PI, radius: 14, kind: 'car' }],
      bounds: { width: city.width, height: city.height },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice); // wanted -> the patrol car stays
    w.tick(controls({ action: true }), 1 / 60); // hijack the car

    // Check separation each tick while the chase is live (the player may get
    // arrested partway through, which disperses the police).
    for (let i = 0; i < 20 && !w.isBusted; i++) {
      w.tick(controls(), 1 / 60);
      const patrol = w.police.find((c) => c.kind === 'car');
      if (patrol) {
        expect(distance(patrol.pos, w.drivingCar!.pos)).toBeGreaterThanOrEqual(
          patrol.radius + w.drivingCar!.radius - 1,
        );
      }
    }
  });
});
