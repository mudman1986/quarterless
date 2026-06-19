import { describe, it, expect } from 'vitest';
import {
  World,
  AMBULANCE_DISPATCH_DELAY,
  SCORE_PER_PEDESTRIAN,
  SCORE_PER_POLICE,
  PLAYER_MAX_HEALTH,
  SERVICE_TIMEOUT,
  VEHICLE_BURN_DURATION,
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
import { type Bullet } from './weapon';
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
const advance = (w: World, seconds: number, c = controls()): void => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) w.tick(c, 1 / 60);
};

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

  it('sends a foot officer back to the station instead of dispersing when clear', () => {
    const w = new World({
      player: player(),
      police: [{ pos: vec2(0, 0), heading: 0, radius: 12, kind: 'foot' }],
      policeSpawns: [vec2(200, 0)],
      bounds: { width: 4000, height: 4000 },
    });
    const before = distance(w.police[0].pos, vec2(200, 0));

    w.tick(controls(), 1);

    expect(w.police).toHaveLength(1);
    expect(distance(w.police[0].pos, vec2(200, 0))).toBeLessThan(before);

    w.tick(controls(), 1);
    expect(w.police).toHaveLength(0); // reached the station and stood down
  });

  it('sends a patrol car back to the station along the roads instead of dispersing when clear', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const station = tileCenter(city.spec, 0, 4);
    const start = tileCenter(city.spec, 8, 4);
    const w = new World({
      player: player(),
      city,
      police: [{ pos: start, heading: Math.PI, radius: 14, kind: 'car', speed: 0 }],
      policeSpawns: [station],
      bounds: { width: city.width, height: city.height },
    });

    const before = distance(w.police[0].pos, station);
    for (let i = 0; i < 60; i++) w.tick(controls(), 1 / 60);

    expect(w.police).toHaveLength(1);
    expect(distance(w.police[0].pos, station)).toBeLessThan(before);
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
      viewRadius: 100,
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

  it('makes an NPC driver turn the car away after the vehicle is shot', () => {
    const city = miniCity();
    const npcCar: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const shooter = vec2(npcCar.pos.x + 120, npcCar.pos.y + 40);
    const w = new World({
      player: { pos: shooter, angle: Math.atan2(npcCar.pos.y - shooter.y, npcCar.pos.x - shooter.x), radius: 8 },
      cars: [npcCar],
      city,
      carDrivers: [{ dir: vec2(1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    const startX = w.cars[0].pos.x;
    for (let i = 0; i < 30; i++) w.tick(controls({ fire: i === 0 }), 1 / 60);
    for (let i = 0; i < 60; i++) w.tick(controls(), 1 / 60);

    expect(w.cars[0].pos.x).toBeLessThan(startX);
  });

  it('makes an NPC driver flee when police gunfire passes close to the car', () => {
    const city = miniCity();
    const npcCar: Car = { pos: tileCenter(city.spec, 2, 4), heading: Math.PI, speed: 0, radius: 12 };
    const w = new World({
      player: player(),
      cars: [npcCar],
      city,
      carDrivers: [{ dir: vec2(-1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice); // keep police bullets active this tick
    w.policeBullets = [
      { pos: vec2(npcCar.pos.x - 24, npcCar.pos.y + 28), velocity: vec2(240, 0), life: 1, damage: 0 },
    ];

    const startX = w.cars[0].pos.x;
    w.tick(controls(), 1 / 60); // register the near miss
    for (let i = 0; i < 60; i++) w.tick(controls(), 1 / 60);

    expect(w.cars[0].pos.x).toBeGreaterThan(startX);
  });

  it('runs a red light to flee after being shot at', () => {
    const city = miniCity();
    const npc: Car = { pos: tileCenter(city.spec, 4, 2), heading: Math.PI / 2, speed: 0, radius: 12 };
    const shooter = vec2(npc.pos.x, npc.pos.y - 120);
    const w = new World({
      player: { pos: shooter, angle: Math.PI / 2, radius: 8 },
      cars: [npc],
      city,
      carDrivers: [{ dir: vec2(0, 1) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    w.lights = createTrafficLights(0); // vertical traffic is red

    const intersectionY = tileCenter(city.spec, 4, 4).y - city.spec.tile / 2;
    w.tick(controls({ fire: true }), 1 / 60);
    for (let i = 0; i < 90; i++) w.tick(controls(), 1 / 60);

    expect(w.cars[0].pos.y).toBeGreaterThanOrEqual(intersectionY);
  });
});

describe('World busted and respawn', () => {
  const miniCity = () => buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });

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

  it('respawns a busted player at the nearest police station', () => {
    const city = miniCity();
    const policeStations = city.facilities.filter((f) => f.kind === 'policeStation');
    const arrestPos = vec2(policeStations[0].spawn.x + 18, policeStations[0].spawn.y + 6);
    const expected = policeStations.reduce((best, station) =>
      distance(station.spawn, arrestPos) < distance(best.spawn, arrestPos) ? station : best,
    );
    const w = new World({
      player: { pos: arrestPos, angle: 0, radius: 8 },
      police: [{ pos: arrestPos, heading: 0, radius: 12, kind: 'foot' }],
      policeSpawns: policeStations.map((f) => f.spawn),
      city,
      bounds: { width: city.width, height: city.height },
    });

    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice);
    w.tick(controls(), 1 / 60);
    expect(w.isBusted).toBe(true);

    w.tick(controls({ confirm: true }), 1 / 60);
    expect(w.isBusted).toBe(false);
    expect(w.player.pos).toEqual(expected.spawn);
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

  it('stops a driven car from passing through a wreck', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0), carAt(140, 0)], // hijack the first; the second is a wreck ahead
      bounds: { width: 4000, height: 4000 },
    });
    w.wreckedCars[1] = true;

    w.tick(controls({ action: true }), 1 / 60);
    for (let i = 0; i < 240; i++) w.tick(controls({ up: true }), 1 / 60);

    const gap = distance(w.cars[0].pos, w.cars[1].pos);
    expect(w.cars[0].pos.x).toBeLessThan(w.cars[1].pos.x);
    expect(gap).toBeGreaterThanOrEqual(w.cars[0].radius + w.cars[1].radius - 1);
  });

  it('makes NPC traffic stop short of a wreck instead of driving through it', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const npc: Car = { pos: tileCenter(city.spec, 0, 4), heading: 0, speed: 0, radius: 12 };
    const wreck: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: { pos: vec2(-9999, -9999), angle: 0, radius: 8 },
      cars: [npc, wreck],
      city,
      carDrivers: [{ dir: vec2(1, 0) }, null],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    w.wreckedCars[1] = true;

    let yielded = false;
    for (let i = 0; i < 240; i++) {
      w.tick(controls(), 1 / 60);
      yielded ||= w.cars[0].speed === 0;
      expect(distance(w.cars[0].pos, w.cars[1].pos)).toBeGreaterThanOrEqual(
        w.cars[0].radius + w.cars[1].radius - 1,
      );
    }

    expect(yielded).toBe(true);
    expect(w.cars[0].pos.x).toBeLessThan(w.cars[1].pos.x);
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

  it('makes a nearby pedestrian flee when a shot passes close by', () => {
    const pedestrian = pedAt(90, 30);
    const w = new World({
      player: player(), // origin, facing +x
      pedestrians: [pedestrian],
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
    });

    const before = { ...w.pedestrians[0].pos };
    w.tick(controls({ fire: true }), 1 / 60);
    w.tick(controls(), 1 / 60);

    expect(w.pedestrians[0].state).toBe('flee');
    expect(w.pedestrians[0].pos.y).toBeGreaterThan(before.y);
  });

  it('makes a walking pedestrian flee when gunfire passes nearby', () => {
    const ped = pedAt(80, 40);
    ped.target = vec2(160, 40);
    const w = new World({
      player: player(),
      pedestrians: [ped],
      bounds: { width: 1000, height: 1000 },
      rng: () => 0.5,
    });
    const nearMiss: Bullet = {
      pos: vec2(36, 58),
      velocity: vec2(240, 0),
      life: 1,
      damage: 25,
    };
    w.bullets = [nearMiss];

    w.tick(controls(), 1 / 60); // record the gunfire threat
    const before = { ...w.pedestrians[0].pos };
    w.tick(controls(), 1 / 60);

    expect(w.pedestrians[0].state).toBe('flee');
    expect(distance(w.pedestrians[0].pos, vec2(40, 58))).toBeGreaterThan(distance(before, vec2(40, 58)));
  });

  it('clears a corpse left out of frame and respawns a pedestrian', () => {
    const city = miniCity();
    const corpsePos = tileCenter(city.spec, 2, 4);
    const hospital = city.facilities
      .filter((f) => f.kind === 'hospital')
      .sort((a, b) => distance(a.roadSpawn, corpsePos) - distance(b.roadSpawn, corpsePos))[0];
    expect(hospital).toBeDefined();
    const w = new World({
      player: player(),
      city,
      viewRadius: 20, // the body ends up outside the (tiny) view
      bounds: { width: city.width, height: city.height },
      rng: () => 0,
    });
    w.corpses = [{ pos: corpsePos, offscreenFor: 0, inFrameFor: 0 }];
    expect(w.corpses).toHaveLength(1);

    for (let i = 0; i < 11 * 60 && w.corpses.length > 0; i++) w.tick(controls(), 1 / 60); // wait out the 10s
    expect(w.corpses).toHaveLength(0); // cleared while off-screen
    expect(w.pedestrians).toHaveLength(1);
    expect(w.pedestrians[0].pos).toEqual(hospital!.spawn);
  });

  it('sends an ambulance to collect a body that stays on screen', () => {
    const city = miniCity();
    const spot = tileCenter(city.spec, 2, 4); // on road row 4
    const hospital = city.facilities
      .filter((f) => f.kind === 'hospital')
      .sort((a, b) => distance(a.roadSpawn, spot) - distance(b.roadSpawn, spot))[0];
    expect(hospital).toBeDefined();
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
    expect(w.pedestrians.some((ped) => ped.pos.x === hospital!.spawn.x && ped.pos.y === hospital!.spawn.y)).toBe(true);
  });

  it('dispatches the ambulance from the nearest hospital building', () => {
    const city = miniCity();
    const corpsePos = tileCenter(city.spec, 2, 4);
    const hospital = city.facilities
      .filter((f) => f.kind === 'hospital')
      .sort((a, b) => distance(a.roadSpawn, corpsePos) - distance(b.roadSpawn, corpsePos))[0];
    expect(hospital).toBeDefined();
    const w = new World({
      player: player(),
      city,
      bounds: { width: city.width, height: city.height },
    });
    w.corpses = [
      { pos: corpsePos, offscreenFor: 0, inFrameFor: AMBULANCE_DISPATCH_DELAY },
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

  it('respawns a wasted player at the nearest hospital', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const hospitals = city.facilities.filter((f) => f.kind === 'hospital');
    const deathPos = vec2(hospitals[0].spawn.x + 22, hospitals[0].spawn.y - 10);
    const expected = hospitals.reduce((best, hospital) =>
      distance(hospital.spawn, deathPos) < distance(best.spawn, deathPos) ? hospital : best,
    );
    const w = new World({
      player: { pos: deathPos, angle: 0, radius: 8 },
      cars: [{ pos: vec2(deathPos.x + 8, deathPos.y), heading: 0, speed: 100, radius: 12 }],
      spawn: vec2(0, 0),
      city,
      bounds: { width: city.width, height: city.height },
    });

    w.tick(controls(), 1 / 60);
    expect(w.isWasted).toBe(true);

    w.tick(controls({ confirm: true }), 1 / 60);
    expect(w.isWasted).toBe(false);
    expect(w.player.pos).toEqual(expected.spawn);
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

  it('runs over a foot officer into a corpse instead of making them vanish', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      police: [{ pos: vec2(70, 0), heading: 0, radius: 12, kind: 'foot' }],
      bounds: { width: 4000, height: 4000 },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice);

    w.tick(controls({ action: true }), 1 / 60);
    for (let i = 0; i < 120 && w.police.length > 0; i++) w.tick(controls({ up: true }), 1 / 60);

    expect(w.police).toHaveLength(0);
    expect(w.corpses).toHaveLength(1);
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
  it('waits one second before a foot officer busts a player sitting still in a car', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      police: [{ pos: vec2(20, 0), heading: 0, radius: 12, kind: 'foot' }],
      bounds: { width: 4000, height: 4000 },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice);

    w.tick(controls({ action: true }), 1 / 60); // enter the parked car under the officer
    expect(w.isDriving).toBe(true);
    expect(w.isBusted).toBe(false);

    for (let i = 0; i < 58; i++) w.tick(controls(), 1 / 60);
    expect(w.isBusted).toBe(false);

    w.tick(controls(), 1 / 60);
    expect(w.isBusted).toBe(true);
  });

  it('resets the in-car arrest timer if the player moves before one second passes', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      police: [{ pos: vec2(20, 0), heading: 0, radius: 12, kind: 'foot' }],
      bounds: { width: 4000, height: 4000 },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice);

    w.tick(controls({ action: true }), 1 / 60); // enter the parked car under the officer
    for (let i = 0; i < 30; i++) w.tick(controls(), 1 / 60);
    expect(w.isBusted).toBe(false);

    w.tick(controls({ up: true }), 1 / 60); // nudge the car: the stop timer must reset
    expect(w.isBusted).toBe(false);

    for (let i = 0; i < 55; i++) w.tick(controls(), 1 / 60);
    expect(w.isBusted).toBe(false);

    for (let i = 0; i < 10 && !w.isBusted; i++) w.tick(controls(), 1 / 60);
    expect(w.isBusted).toBe(true);
  });

  it('does not preload the in-car arrest timer before an officer reaches the stopped car', () => {
    const w = new World({
      player: player(),
      cars: [carAt(20, 0)],
      police: [{ pos: vec2(200, 0), heading: Math.PI, radius: 12, kind: 'foot' }],
      bounds: { width: 4000, height: 4000 },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice);

    w.tick(controls({ action: true }), 1 / 60); // enter the parked car and wait

    for (let i = 0; i < 70; i++) w.tick(controls(), 1 / 60); // the player has been stopped for >1s
    expect(w.isBusted).toBe(false);

    w.police[0] = { ...w.police[0], pos: w.focus, heading: 0 }; // the officer finally reaches the car
    w.tick(controls(), 1 / 60);
    expect(w.isBusted).toBe(false); // contact starts the timer; it must not arrest immediately

    for (let i = 0; i < 58; i++) w.tick(controls(), 1 / 60);
    expect(w.isBusted).toBe(false);

    w.tick(controls(), 1 / 60);
    expect(w.isBusted).toBe(true);
  });

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
  it('sets a shot-up car on fire before it explodes into a wreck', () => {
    const w = new World({
      player: player(), // origin, facing +x
      cars: [carAt(140, 0)], // far enough that the blast does not reach the player
      bounds: { width: 4000, height: 4000 },
    });
    for (let i = 0; i < 180 && !w.carIsBurning(0); i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.carIsBurning(0)).toBe(true);
    expect(w.wreckedCars[0]).toBe(false);
    expect(w.explosionsTriggered).toBe(0);

    advance(w, VEHICLE_BURN_DURATION - 1);
    expect(w.wreckedCars[0]).toBe(false);

    advance(w, 2);
    expect(w.wreckedCars[0]).toBe(true);
    expect(w.explosionsTriggered).toBeGreaterThanOrEqual(1);
    expect(w.isWasted).toBe(false); // the player was clear of the blast
    expect(w.wantedStars).toBeGreaterThanOrEqual(1); // blowing up a car is a crime
  });

  it('sets a nearby car on fire, then chains the later blast to it', () => {
    const w = new World({
      player: player(),
      cars: [carAt(140, 0), carAt(184, 0)], // the second sits inside the first's blast
      bounds: { width: 4000, height: 4000 },
    });
    for (let i = 0; i < 180 && !w.carIsBurning(0); i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.carIsBurning(0)).toBe(true);

    advance(w, VEHICLE_BURN_DURATION + 1);
    expect(w.wreckedCars[0]).toBe(true);
    expect(w.carIsBurning(1)).toBe(true); // ignited by the chain reaction
    expect(w.wreckedCars[1]).toBe(false);

    advance(w, VEHICLE_BURN_DURATION + 1);
    expect(w.wreckedCars[1]).toBe(true);
  });

  it('does not let the player drive a burning or wrecked car', () => {
    const w = new World({
      player: { pos: vec2(120, 0), angle: 0, radius: 8 },
      cars: [carAt(140, 0)],
      bounds: { width: 4000, height: 4000 },
    });
    for (let i = 0; i < 180 && !w.carIsBurning(0); i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.carIsBurning(0)).toBe(true);
    w.tick(controls({ action: true }), 1 / 60); // try to get in
    expect(w.isDriving).toBe(false);

    advance(w, VEHICLE_BURN_DURATION + 1);
    expect(w.wreckedCars[0]).toBe(true);
    w.tick(controls({ action: true }), 1 / 60);
    expect(w.isDriving).toBe(false);
  });

  it('only hurts the player once the delayed blast actually goes off', () => {
    const w = new World({
      player: player(), // origin, within blast range of the car
      cars: [carAt(60, 0)],
      bounds: { width: 4000, height: 4000 },
    });
    for (let i = 0; i < 180 && !w.carIsBurning(0); i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.carIsBurning(0)).toBe(true);
    expect(w.health.current).toBe(PLAYER_MAX_HEALTH);

    advance(w, VEHICLE_BURN_DURATION - 1);
    expect(w.health.current).toBe(PLAYER_MAX_HEALTH);

    advance(w, 2);
    expect(w.wreckedCars[0]).toBe(true);
    expect(w.health.current).toBeLessThan(PLAYER_MAX_HEALTH); // singed by the explosion
  });

  it('lets the player get out of a burning car before the delayed explosion', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const playerCar: Car = { pos: tileCenter(city.spec, 3, 4), heading: 0, speed: 0, radius: 12 };
    const rammer: Car = { pos: tileCenter(city.spec, 1, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: { pos: playerCar.pos, angle: 0, radius: 8 },
      cars: [playerCar, rammer],
      city,
      carDrivers: [null, { dir: vec2(1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    w.lights = createTrafficLights(0);

    w.tick(controls({ action: true }), 1 / 60); // get into the car
    (w as unknown as { carHealth: number[] }).carHealth[0] = 1;

    for (let i = 0; i < 900 && !w.carIsBurning(0); i++) w.tick(controls(), 1 / 60);
    expect(w.carIsBurning(0)).toBe(true);
    expect(w.isWasted).toBe(false);

    w.tick(controls({ action: true }), 1 / 60); // bail out
    expect(w.isDriving).toBe(false);

    advance(w, VEHICLE_BURN_DURATION + 1, controls({ up: true }));
    expect(w.wreckedCars[0]).toBe(true);
    expect(w.isWasted).toBe(false);
  });

  it('makes the driver bail out and flee when a shot-up NPC car catches fire', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const npcCar: Car = { pos: tileCenter(city.spec, 3, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: { pos: tileCenter(city.spec, 0, 4), angle: 0, radius: 8 },
      cars: [npcCar],
      city,
      carDrivers: [{ dir: vec2(1, 0) }],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    for (let i = 0; i < 180 && !w.carIsBurning(0); i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.carIsBurning(0)).toBe(true);
    expect(w.pedestrians).toHaveLength(1);

    const before = distance(w.pedestrians[0].pos, w.cars[0].pos);
    for (let i = 0; i < 30; i++) w.tick(controls(), 1 / 60);
    expect(distance(w.pedestrians[0].pos, w.cars[0].pos)).toBeGreaterThan(before);
  });

  it('makes nearby pedestrians flee from a burning car even when the player is not driving it', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const firePos = tileCenter(city.spec, 3, 4);
    const bystander = pedAt(firePos.x + 20, firePos.y);
    const w = new World({
      player: player(),
      cars: [{ pos: firePos, heading: 0, speed: 0, radius: 12 }],
      city,
      pedestrians: [bystander],
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    (w as unknown as { carBurnTimers: number[] }).carBurnTimers[0] = VEHICLE_BURN_DURATION;
    const before = distance(w.pedestrians[0].pos, w.cars[0].pos);
    w.tick(controls(), 1 / 60);

    expect(distance(w.pedestrians[0].pos, w.cars[0].pos)).toBeGreaterThan(before);
    expect(w.pedestrians[0].state).toBe('flee');
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

  it('sets an ambulance on fire, sends the medic home, and only explodes after the fuse', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const ambulancePos = tileCenter(city.spec, 3, 4);
    const hospital = city.facilities
      .filter((facility) => facility.kind === 'hospital')
      .sort((a, b) => distance(a.roadSpawn, ambulancePos) - distance(b.roadSpawn, ambulancePos))[0];
    expect(hospital).toBeDefined();
    const w = new World({
      player: { pos: tileCenter(city.spec, 0, 4), angle: 0, radius: 8 },
      cars: [],
      city,
      bounds: { width: city.width, height: city.height },
    });
    w.ambulance = {
      pos: ambulancePos,
      heading: 0,
      radius: 14,
      dir: vec2(1, 0),
      target: vec2(ambulancePos.x + 800, ambulancePos.y),
      phase: 'depart',
      crew: null,
      pickupElapsed: 0,
      age: 0,
      speed: 0,
      blocked: 0,
      health: 1,
    };

    for (let i = 0; i < 120 && w.ambulance; i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.ambulance).toBeNull();
    const medic = w.pedestrians.find((ped) => ped.uniform === 'medic');
    expect(medic?.returningTo).toEqual(hospital!.spawn);
    const idx = w.cars.findIndex((_, i) => w.carKind(i) === 'ambulance' && w.carIsBurning(i));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(w.explosionsTriggered).toBe(0);

    advance(w, VEHICLE_BURN_DURATION - 1);
    expect(w.wreckedCars[idx]).toBe(false);

    advance(w, 2);
    expect(w.wreckedCars[idx]).toBe(true);
    expect(w.explosionsTriggered).toBeGreaterThanOrEqual(1);
  });

  it('sets a tow truck on fire, sends the operator home, and only explodes after the fuse', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const towPos = tileCenter(city.spec, 3, 4);
    const towYard = city.facilities
      .filter((facility) => facility.kind === 'towYard')
      .sort((a, b) => distance(a.roadSpawn, towPos) - distance(b.roadSpawn, towPos))[0];
    expect(towYard).toBeDefined();
    const w = new World({
      player: { pos: tileCenter(city.spec, 0, 4), angle: 0, radius: 8 },
      cars: [carAt(400, 400)],
      city,
      bounds: { width: city.width, height: city.height },
    });
    w.tows = [
      {
        pos: towPos,
        heading: 0,
        radius: 14,
        dir: vec2(1, 0),
        target: vec2(towPos.x + 800, towPos.y),
        phase: 'depart',
        crew: null,
        pickupElapsed: 0,
        age: 0,
        speed: 0,
        blocked: 0,
        health: 1,
        targetCar: 0,
      },
    ];

    for (let i = 0; i < 120 && w.tows.length > 0; i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.tows).toHaveLength(0);
    const worker = w.pedestrians.find((ped) => ped.uniform === 'towWorker');
    expect(worker?.returningTo).toEqual(towYard!.spawn);
    const idx = w.cars.findIndex((_, i) => w.carKind(i) === 'tow' && w.carIsBurning(i));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(w.explosionsTriggered).toBe(0);

    advance(w, VEHICLE_BURN_DURATION - 1);
    expect(w.wreckedCars[idx]).toBe(false);

    advance(w, 2);
    expect(w.wreckedCars[idx]).toBe(true);
    expect(w.explosionsTriggered).toBeGreaterThanOrEqual(1);
  });

  it('sets a patrol car on fire, sends the officer back to the station, and only explodes after the fuse', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const station = city.facilities.find((facility) => facility.kind === 'policeStation');
    expect(station).toBeDefined();
    const w = new World({
      player: { pos: tileCenter(city.spec, 0, 4), angle: 0, radius: 8 },
      city,
      police: [{ pos: tileCenter(city.spec, 3, 4), heading: Math.PI, radius: 14, kind: 'car', home: station!.spawn, health: 1 }],
      bounds: { width: city.width, height: city.height },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice); // keep the patrol car active

    for (let i = 0; i < 120 && w.police.some((c) => c.kind === 'car'); i++) {
      w.tick(controls({ fire: true }), 1 / 60);
    }
    expect(w.police.some((c) => c.kind === 'car')).toBe(false);
    const officer = w.police.find((cop) => cop.kind === 'foot' && cop.returningHome);
    expect(officer?.home).toEqual(station!.spawn);
    const before = distance(officer!.pos, station!.spawn);
    advance(w, 2);
    const returning = w.police.find((cop) => cop.kind === 'foot' && cop.returningHome);
    expect(returning).toBeDefined();
    expect(distance(returning!.pos, station!.spawn)).toBeLessThan(before);
    const idx = w.cars.findIndex((_, i) => w.carKind(i) === 'police' && w.carIsBurning(i));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(w.explosionsTriggered).toBe(0);

    advance(w, VEHICLE_BURN_DURATION + 1);
    expect(w.wreckedCars[idx]).toBe(true);
    expect(w.explosionsTriggered).toBeGreaterThanOrEqual(1);
  });

  it('makes a returning officer step away from a burning patrol car before heading home', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const station = city.facilities.find((facility) => facility.kind === 'policeStation');
    expect(station).toBeDefined();
    const w = new World({
      player: { pos: tileCenter(city.spec, 0, 4), angle: 0, radius: 8 },
      city,
      police: [{ pos: tileCenter(city.spec, 3, 4), heading: Math.PI, radius: 14, kind: 'car', home: station!.spawn, health: 1 }],
      bounds: { width: city.width, height: city.height },
    });
    w.wanted = addHeat(createWanted(), CRIME_HEAT.hitPolice);

    for (let i = 0; i < 120 && w.police.some((c) => c.kind === 'car'); i++) {
      w.tick(controls({ fire: true }), 1 / 60);
    }
    const officer = w.police.find((cop) => cop.kind === 'foot' && cop.returningHome);
    const burningIdx = w.cars.findIndex((_, i) => w.carKind(i) === 'police' && w.carIsBurning(i));
    expect(officer).toBeDefined();
    expect(burningIdx).toBeGreaterThanOrEqual(0);

    const before = distance(officer!.pos, w.cars[burningIdx].pos);
    w.tick(controls(), 1 / 60);
    const after = distance(
      w.police.find((cop) => cop.kind === 'foot' && cop.returningHome)!.pos,
      w.cars[burningIdx].pos,
    );
    expect(after).toBeGreaterThan(before);
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
    for (let i = 0; i < 200 && !w.carIsBurning(0); i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.carIsBurning(0)).toBe(true);
    advance(w, VEHICLE_BURN_DURATION + 1);
    expect(w.wreckedCars[0]).toBe(true);

    let dispatched = false;
    for (let i = 0; i < 1800 && !w.towedCars[0]; i++) {
      w.tick(controls(), 1 / 60);
      if (w.tows.length > 0) dispatched = true;
    }
    expect(dispatched).toBe(true); // a tow truck arrived
    expect(w.towedCars[0]).toBe(true); // and hauled the wreck away
  });

  it('holds a tow truck at a red light instead of driving into the intersection', () => {
    const city = miniCity();
    const wreck: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: player(),
      cars: [wreck],
      city,
      carDrivers: [null],
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    w.wreckedCars[0] = true;
    w.tick(controls(), 0);
    expect(w.tows).toHaveLength(1);

    w.tows[0] = {
      ...w.tows[0]!,
      pos: tileCenter(city.spec, 4, 2),
      heading: Math.PI / 2,
      dir: vec2(0, 1),
      target: tileCenter(city.spec, 4, 6),
      phase: 'approach',
      crew: null,
      speed: 0,
      blocked: 0,
    };
    w.lights = createTrafficLights(0); // horizontal green, so this southbound tow faces red

    const intersectionY = tileCenter(city.spec, 4, 4).y - city.spec.tile / 2;
    const ticks = Math.floor((LIGHT_GREEN - 1) * 60);
    for (let i = 0; i < ticks; i++) {
      w.tick(controls(), 1 / 60);
      expect(w.tows[0]?.pos.y).toBeLessThan(intersectionY);
    }
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

  it('dispatches the tow truck from the nearest tow yard building', () => {
    const city = miniCity();
    const wreckPos = tileCenter(city.spec, 2, 4);
    const towYard = city.facilities
      .filter((f) => f.kind === 'towYard')
      .sort((a, b) => distance(a.roadSpawn, wreckPos) - distance(b.roadSpawn, wreckPos))[0];
    expect(towYard).toBeDefined();
    const w = new World({
      player: player(),
      cars: [{ pos: wreckPos, heading: 0, speed: 0, radius: 12 }],
      city,
      carDrivers: [null],
      bounds: { width: city.width, height: city.height },
    });
    w.wreckedCars[0] = true;

    w.tick(controls(), 0); // dispatch without advancing away from the spawn point
    expect(w.tows[0]?.pos).toEqual(towYard!.roadSpawn);
  });

  it('respawns a picked-up exploded car at the nearest tow yard', () => {
    const city = miniCity();
    const wreckPos = tileCenter(city.spec, 2, 4);
    const towYard = city.facilities
      .filter((f) => f.kind === 'towYard')
      .sort((a, b) => distance(a.roadSpawn, wreckPos) - distance(b.roadSpawn, wreckPos))[0];
    expect(towYard).toBeDefined();
    const w = new World({
      player: { pos: tileCenter(city.spec, 0, 4), angle: 0, radius: 8 },
      cars: [{ pos: wreckPos, heading: 0, speed: 0, radius: 12 }],
      city,
      carDrivers: [null],
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
      rng: () => 0,
    });

    for (let i = 0; i < 200 && !w.carIsBurning(0); i++) w.tick(controls({ fire: true }), 1 / 60);
    expect(w.carIsBurning(0)).toBe(true);
    advance(w, VEHICLE_BURN_DURATION + 1);
    expect(w.wreckedCars[0]).toBe(true);

    for (let i = 0; i < 1500 && !w.towedCars[0]; i++) w.tick(controls(), 1 / 60);
    expect(w.towedCars[0]).toBe(true);

    w.tick(controls(), 0); // process the respawn without letting the new car drive away
    expect(w.wreckedCars[0]).toBe(false);
    expect(w.cars[0].pos).toEqual(towYard!.roadSpawn);
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
    for (let i = 0; i < 1800 && !w.towedCars[0]; i++) {
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

  const advanceUntilAmbulanceLoading = (w: World): void => {
    for (let i = 0; i < 3000; i++) {
      w.tick(controls(), 1 / 60);
      const amb = w.ambulance;
      if (amb?.crew && amb.phase === 'collect' && distance(amb.crew, amb.target) <= 0.01) return;
    }
    throw new Error('ambulance never entered the loading window');
  };

  const advanceUntilTowLoading = (w: World): void => {
    for (let i = 0; i < 3000; i++) {
      w.tick(controls(), 1 / 60);
      const tow = w.tows[0];
      if (tow?.crew && tow.phase === 'collect' && distance(tow.crew, tow.target) <= 0.01) return;
    }
    throw new Error('tow never entered the loading window');
  };

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
    w.cars[0] = { ...w.cars[0], pos: vec2(-1000, -1000), speed: 0 };
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

  it('leaves a corpse when the medic is run over on foot', () => {
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
    expect(w.ambulance?.crew).not.toBeNull();
    expect(w.ambulance?.phase).toBe('return');

    const crew = w.ambulance!.crew!;
    w.cars[0] = { ...w.cars[0], pos: vec2(crew.x - 16, crew.y), heading: 0, speed: 100 };
    w.tick(controls(), 1 / 60);

    expect(w.ambulance).toBeNull();
    expect(w.corpses).toHaveLength(1);
    const abandoned = w.cars.findIndex((_, i) => w.carKind(i) === 'ambulance' && w.wreckedCars[i]);
    expect(abandoned).toBeGreaterThanOrEqual(0);
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

  it('keeps the body on the ground for 3 seconds once the medic reaches it', () => {
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
  w.cars[0] = { ...w.cars[0], pos: vec2(-1000, -1000), speed: 0 };
    advanceUntilAmbulanceLoading(w);

    expect(w.corpses).toHaveLength(1);
    expect(w.ambulance?.phase).toBe('collect');
    for (let i = 0; i < 170; i++) w.tick(controls(), 1 / 60);

    expect(w.corpses).toHaveLength(1);
    expect(w.ambulance?.phase).toBe('collect');

    for (let i = 0; i < 20; i++) w.tick(controls(), 1 / 60);

    expect(w.corpses).toHaveLength(0);
    expect(w.ambulance?.phase).toBe('return');
  });

  it('reaches a corpse on a wide live-style sidewalk instead of timing out circling it', () => {
    const city = buildCity({ cols: 21, rows: 21, tile: 64, block: 7, roadWidth: 4, margin: 42, sidewalkWidth: 42 });
    const strip = city.sidewalks[0]!;
    const bodyPos = vec2(strip.x + strip.w / 2, strip.y + strip.h / 2);
    const w = new World({
      player: player(),
      city,
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    w.corpses = [{ pos: bodyPos, offscreenFor: 0, inFrameFor: AMBULANCE_DISPATCH_DELAY }];

    advanceUntilAmbulanceLoading(w);

    expect(w.ambulance?.phase).toBe('collect');
    expect(w.ambulance?.crew).not.toBeNull();
  });

  it('lets the player steal the parked ambulance while the medic is loading the body', () => {
    const city = miniCity();
    const parkedPos = tileCenter(city.spec, 3, 4);
    const bodyPos = tileCenter(city.spec, 2, 4);
    const policeSpawns = city.facilities.filter((f) => f.kind === 'policeStation').map((f) => f.spawn);
    const w = new World({
      player: player(),
      cars: [{ pos: vec2(4000, 4000), heading: 0, speed: 0, radius: 12 }],
      city,
      carDrivers: [null],
      policeSpawns,
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    w.corpses = [{ pos: bodyPos, offscreenFor: 0, inFrameFor: 0 }];
    w.ambulance = {
      pos: parkedPos,
      heading: 0,
      radius: 14,
      dir: vec2(1, 0),
      target: bodyPos,
      phase: 'collect',
      crew: bodyPos,
      pickupElapsed: 1,
      age: 0,
      speed: 0,
      blocked: 0,
      health: 60,
    };

    const parked = w.ambulance!;
    const medicPos = parked.crew!;
    const hospital = city.facilities
      .filter((f) => f.kind === 'hospital')
      .reduce((best, facility) =>
        distance(facility.spawn, parked.pos) < distance(best.spawn, parked.pos) ? facility : best,
      );
    w.player = { ...w.player, pos: parked.pos, angle: parked.heading };
    w.tick(controls({ action: true }), 0);

    expect(w.isDriving).toBe(true);
    expect(w.ambulance).toBeNull();
    expect(w.corpses).toHaveLength(1);
    expect(w.cars).toHaveLength(2);
    expect(w.wantedStars).toBeGreaterThan(0);
    expect(w.police.length).toBeGreaterThan(0);
    expect(w.pedestrians).toHaveLength(1);
    expect(w.pedestrians[0].pos).toEqual(medicPos);
    expect((w.pedestrians[0] as { uniform?: string }).uniform).toBe('medic');

    const startDistance = distance(w.pedestrians[0].pos, hospital.spawn);
    for (let i = 0; i < 120; i++) w.tick(controls(), 1 / 60);
    expect(distance(w.pedestrians[0].pos, hospital.spawn)).toBeLessThan(startDistance);
  });

  it('retargets an ambulance to another body instead of vanishing when its first job disappears', () => {
    const city = miniCity();
    const firstBody = tileCenter(city.spec, 2, 4);
    const secondBody = tileCenter(city.spec, 6, 4);
    const w = new World({
      player: player(),
      city,
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    w.corpses = [
      { pos: firstBody, offscreenFor: 0, inFrameFor: AMBULANCE_DISPATCH_DELAY },
      { pos: secondBody, offscreenFor: 0, inFrameFor: AMBULANCE_DISPATCH_DELAY },
    ];
    w.tick(controls(), 0);
    expect(w.ambulance).not.toBeNull();

    w.corpses = w.corpses.filter((corpse) => corpse.pos.x !== firstBody.x || corpse.pos.y !== firstBody.y);
    w.tick(controls(), 1 / 60);

    expect(w.ambulance).not.toBeNull();
    expect(w.ambulance?.job).toEqual(secondBody);
  });

  it('sends a timed-out ambulance into a visible depart phase instead of vanishing', () => {
    const city = miniCity();
    const bodyPos = tileCenter(city.spec, 2, 4);
    const ambPos = tileCenter(city.spec, 3, 4);
    const w = new World({
      player: player(),
      city,
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });

    w.corpses = [{ pos: bodyPos, offscreenFor: 0, inFrameFor: AMBULANCE_DISPATCH_DELAY }];
    w.ambulance = {
      pos: ambPos,
      heading: 0,
      radius: 14,
      dir: vec2(1, 0),
      target: bodyPos,
      job: bodyPos,
      phase: 'approach',
      crew: null,
      pickupElapsed: 0,
      age: SERVICE_TIMEOUT,
      speed: 0,
      blocked: 0,
      health: 60,
    };

    w.tick(controls(), 1 / 60);

    expect(w.ambulance).not.toBeNull();
    expect(w.ambulance?.phase).toBe('depart');
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

  it('keeps the wreck unhooked for 3 seconds once the operator reaches it', () => {
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

    advanceUntilTowLoading(w);

    expect(w.towedCars[0]).toBe(false);
    expect(w.tows[0]?.phase).toBe('collect');
    for (let i = 0; i < 170; i++) w.tick(controls(), 1 / 60);

    expect(w.towedCars[0]).toBe(false);
    expect(w.tows[0]?.phase).toBe('collect');

    for (let i = 0; i < 20; i++) w.tick(controls(), 1 / 60);

    expect(w.towedCars[0]).toBe(true);
    expect(w.tows[0]?.phase).toBe('return');
  });

  it('retargets a tow truck to another wreck instead of vanishing when its first job disappears', () => {
    const city = miniCity();
    const firstWreck: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const secondWreck: Car = { pos: tileCenter(city.spec, 6, 4), heading: 0, speed: 0, radius: 12 };
    const w = new World({
      player: player(),
      cars: [firstWreck, secondWreck],
      city,
      carDrivers: [null, null],
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    w.wreckedCars[0] = true;
    w.wreckedCars[1] = true;
    (w as unknown as { towDispatchCooldowns: number[] }).towDispatchCooldowns[1] = 999;

    w.tick(controls(), 0);
    expect(w.tows).toHaveLength(1);

    (w as unknown as { towDispatchCooldowns: number[] }).towDispatchCooldowns[1] = 0;
    w.towedCars[0] = true;
    w.tick(controls(), 1 / 60);

    expect(w.tows).toHaveLength(1);
    expect(w.tows[0]?.targetCar).toBe(1);
  });

  it('sends a timed-out tow truck into a visible depart phase instead of vanishing', () => {
    const city = miniCity();
    const wreck: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const towPos = tileCenter(city.spec, 3, 4);
    const w = new World({
      player: player(),
      cars: [wreck],
      city,
      carDrivers: [null],
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
      rng: () => 0.9,
    });
    w.wreckedCars[0] = true;
    w.tows = [
      {
        pos: towPos,
        heading: 0,
        radius: 14,
        dir: vec2(1, 0),
        target: wreck.pos,
        job: wreck.pos,
        targetCar: 0,
        phase: 'approach',
        crew: null,
        pickupElapsed: 0,
        age: SERVICE_TIMEOUT,
        speed: 0,
        blocked: 0,
        health: 60,
      },
    ];

    w.tick(controls(), 1 / 60);

    expect(w.tows.some((tow) => tow.phase === 'depart')).toBe(true);
  });

  it('lets the player steal the parked tow truck while the operator is hooking the wreck', () => {
    const city = miniCity();
    const wreck: Car = { pos: tileCenter(city.spec, 2, 4), heading: 0, speed: 0, radius: 12 };
    const parkedPos = tileCenter(city.spec, 3, 4);
    const policeSpawns = city.facilities.filter((f) => f.kind === 'policeStation').map((f) => f.spawn);
    const w = new World({
      player: player(),
      cars: [wreck],
      city,
      carDrivers: [null],
      policeSpawns,
      viewRadius: 4000,
      bounds: { width: city.width, height: city.height },
    });
    w.wreckedCars[0] = true;
    w.tows = [
      {
        pos: parkedPos,
        heading: 0,
        radius: 14,
        dir: vec2(1, 0),
        target: wreck.pos,
        targetCar: 0,
        phase: 'collect',
        crew: wreck.pos,
        pickupElapsed: 1,
        age: 0,
        speed: 0,
        blocked: 0,
        health: 60,
      },
    ];

    const parked = w.tows[0]!;
    const operatorPos = parked.crew!;
    const towYard = city.facilities
      .filter((f) => f.kind === 'towYard')
      .reduce((best, facility) =>
        distance(facility.spawn, parked.pos) < distance(best.spawn, parked.pos) ? facility : best,
      );
    w.player = { ...w.player, pos: parked.pos, angle: parked.heading };
    w.tick(controls({ action: true }), 0);

    expect(w.isDriving).toBe(true);
    expect(w.tows).toHaveLength(0);
    expect(w.towedCars[0]).toBe(false);
    expect(w.cars).toHaveLength(2);
    expect(w.wantedStars).toBeGreaterThan(0);
    expect(w.police.length).toBeGreaterThan(0);
    expect(w.pedestrians).toHaveLength(1);
    expect(distance(w.pedestrians[0].pos, operatorPos)).toBeLessThan(distance(w.pedestrians[0].pos, parked.pos));
    expect((w.pedestrians[0] as { uniform?: string }).uniform).toBe('towWorker');

    const startDistance = distance(w.pedestrians[0].pos, towYard.spawn);
    for (let i = 0; i < 120; i++) w.tick(controls(), 1 / 60);
    expect(distance(w.pedestrians[0].pos, towYard.spawn)).toBeLessThan(startDistance);
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

  it('leaves a corpse when the tow operator is run over on foot', () => {
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

    const crew = w.tows[0].crew!;
    w.cars.push({ pos: vec2(crew.x - 16, crew.y), heading: 0, speed: 100, radius: 12 });
    w.wreckedCars.push(false);
    w.towedCars.push(false);
    w.tick(controls(), 1 / 60);

    expect(w.corpses).toHaveLength(1);
    expect(w.cars).toHaveLength(3);
    expect(w.wreckedCars[2]).toBe(true);
    expect(w.towedCars[2]).toBe(false);
  });

  it('makes a medic returning from a burning ambulance run from the fire before heading home', () => {
    const city = miniCity();
    const ambulancePos = tileCenter(city.spec, 3, 4);
    const w = new World({
      player: { pos: tileCenter(city.spec, 0, 4), angle: 0, radius: 8 },
      city,
      bounds: { width: city.width, height: city.height },
    });
    w.ambulance = {
      pos: ambulancePos,
      heading: 0,
      radius: 14,
      dir: vec2(1, 0),
      target: vec2(ambulancePos.x + 800, ambulancePos.y),
      phase: 'depart',
      crew: null,
      pickupElapsed: 0,
      age: 0,
      speed: 0,
      blocked: 0,
      health: 1,
    };

    for (let i = 0; i < 120 && w.ambulance; i++) w.tick(controls({ fire: true }), 1 / 60);
    const medic = w.pedestrians.find((ped) => ped.uniform === 'medic');
    const burningIdx = w.cars.findIndex((_, i) => w.carKind(i) === 'ambulance' && w.carIsBurning(i));
    expect(medic).toBeDefined();
    expect(burningIdx).toBeGreaterThanOrEqual(0);

    const before = distance(medic!.pos, w.cars[burningIdx].pos);
    w.tick(controls(), 1 / 60);
    const after = distance(w.pedestrians.find((ped) => ped.uniform === 'medic')!.pos, w.cars[burningIdx].pos);
    expect(after).toBeGreaterThan(before);
  });
});

describe('World mission', () => {
  it('starts looping taxi fares after the player steals a taxi', () => {
    const city = buildCity({ cols: 20, rows: 20, tile: 64, block: 5, roadWidth: 4, margin: 20, sidewalkWidth: 20 });
    const depot = city.facilities.find((facility) => facility.kind === 'taxiDepot');
    expect(depot).toBeDefined();

    const w = new World({
      player: { ...player(), pos: vec2(depot!.roadSpawn.x - 18, depot!.roadSpawn.y) },
      cars: [{ pos: depot!.roadSpawn, heading: 0, speed: 0, radius: 14 }],
      carDrivers: [{ dir: vec2(1, 0) }],
      carKinds: ['taxi'],
      city,
      sidewalks: city.sidewalks,
      walls: city.buildings,
      bounds: { width: city.width, height: city.height },
      rng: () => 0,
    });

    w.tick(controls({ action: true }), 1 / 60);

    expect(w.isDriving).toBe(true);
    expect(w.carKind(w.drivingCarIndex!)).toBe('taxi');
    expect(w.taxiMission?.stage).toBe('pickup');
    expect(w.taxiTarget).not.toBeNull();
    expect(w.pedestrians.some((ped) => ped.taxiPassengerRole === 'playerFare')).toBe(true);

    const firstFareId = w.taxiMission!.id;
    const pickup = w.taxiTarget!;
    w.cars[0] = { ...w.cars[0], pos: pickup, speed: 0 };
    w.tick(controls(), 1 / 60);

    expect(w.taxiMission?.stage).toBe('dropoff');
    const dropoff = w.taxiTarget!;
    const beforeReward = w.score.current;
    w.cars[0] = { ...w.cars[0], pos: dropoff, speed: 0 };
    w.tick(controls(), 1 / 60);

    expect(w.score.current).toBeGreaterThan(beforeReward);
    expect(w.taxiMission?.stage).toBe('pickup');
    expect(w.taxiMission?.id).not.toBe(firstFareId);
  });

  it('starts looping police busts after the player steals a patrol car', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const station = city.facilities.find((facility) => facility.kind === 'policeStation');
    expect(station).toBeDefined();
    const patrolPos = tileCenter(city.spec, 3, 4);
    const farSuspect = tileCenter(city.spec, 8, 4);
    const backupSuspect = tileCenter(city.spec, 8, 8);
    const w = new World({
      player: { ...player(), pos: patrolPos },
      city,
      police: [{ pos: patrolPos, heading: 0, radius: 14, kind: 'car', home: station!.spawn, speed: 0, health: 60 }],
      policeSpawns: [station!.spawn],
      pedestrians: [pedAt(farSuspect.x, farSuspect.y), pedAt(backupSuspect.x, backupSuspect.y)],
      walls: city.buildings,
      sidewalks: city.sidewalks,
      bounds: { width: city.width, height: city.height },
      rng: () => 0,
    });

    w.tick(controls({ action: true }), 0);

    expect(w.isDriving).toBe(true);
    expect(w.carKind(w.drivingCarIndex!)).toBe('police');
    expect(w.serviceMission?.kind).toBe('police');
    expect(w.serviceTarget).toEqual(farSuspect);

    const firstBustId = w.serviceMission!.id;
    const reward = w.serviceMission!.reward;
    w.police = [];
    w.cars[w.drivingCarIndex!] = { ...w.cars[w.drivingCarIndex!], pos: farSuspect, speed: 0 };
    w.tick(controls(), 1 / 60);

    expect(w.score.current).toBe(reward);
    expect(w.serviceMission?.kind).toBe('police');
    expect(w.serviceMission?.id).not.toBe(firstBustId);
  });

  it('lets the player ambulance recover a corpse for a reward', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const bodyPos = tileCenter(city.spec, 2, 4);
    const hospitalRoad = city.facilities
      .filter((facility) => facility.kind === 'hospital')
      .sort((a, b) => distance(a.roadSpawn, bodyPos) - distance(b.roadSpawn, bodyPos))[0]!
      .roadSpawn;
    const w = new World({
      player: player(),
      cars: [{ pos: tileCenter(city.spec, 3, 4), heading: 0, speed: 0, radius: 14 }],
      carDrivers: [null],
      carKinds: ['ambulance'],
      city,
      bounds: { width: city.width, height: city.height },
      rng: () => 0,
    });

    w.drivingCarIndex = 0;
    w.corpses = [{ pos: bodyPos, offscreenFor: 0, inFrameFor: 0 }];
    w.tick(controls(), 1 / 60);

    expect(w.serviceMission?.kind).toBe('ambulance');
    const reward = w.serviceMission!.reward;
    w.cars[0] = { ...w.cars[0], pos: bodyPos, speed: 0 };
    advance(w, 3.1);

    expect(w.corpses).toHaveLength(0);
    expect(w.score.current).toBe(0);
    expect(w.serviceMission?.kind).toBe('ambulance');
    expect(w.serviceMission && w.serviceMission.kind === 'ambulance' ? w.serviceMission.stage : null).toBe('return');
    expect(w.serviceTarget).toEqual(hospitalRoad);
    expect(w.pedestrians).toHaveLength(0);

    w.cars[0] = { ...w.cars[0], pos: hospitalRoad, speed: 0 };
    w.tick(controls(), 1 / 60);

    expect(w.score.current).toBe(reward);
    expect(w.serviceMission).toBeNull();
    expect(w.pedestrians).toHaveLength(1);
  });

  it('lets the player tow truck recover a wreck for a reward', () => {
    const city = buildCity({ cols: 12, rows: 12, tile: 64, block: 4 });
    const towPos = tileCenter(city.spec, 3, 4);
    const wreckPos = tileCenter(city.spec, 2, 4);
    const towYardRoad = city.facilities
      .filter((facility) => facility.kind === 'towYard')
      .sort((a, b) => distance(a.roadSpawn, wreckPos) - distance(b.roadSpawn, wreckPos))[0]!
      .roadSpawn;
    const w = new World({
      player: player(),
      cars: [
        { pos: towPos, heading: 0, speed: 0, radius: 14 },
        { pos: wreckPos, heading: 0, speed: 0, radius: 12 },
      ],
      carDrivers: [null, null],
      carKinds: ['tow', 'car'],
      city,
      bounds: { width: city.width, height: city.height },
      rng: () => 0,
    });

    w.drivingCarIndex = 0;
    w.wreckedCars[1] = true;
    w.tick(controls(), 1 / 60);

    expect(w.serviceMission?.kind).toBe('tow');
    const reward = w.serviceMission!.reward;
    w.cars[0] = { ...w.cars[0], pos: wreckPos, speed: 0 };
    advance(w, 3.1);

    expect(w.towedCars[1]).toBe(true);
    expect(w.wreckedCars[1]).toBe(true);
    expect(w.score.current).toBe(0);
    expect(w.serviceMission?.kind).toBe('tow');
    expect(w.serviceMission && w.serviceMission.kind === 'tow' ? w.serviceMission.stage : null).toBe('return');
    expect(w.serviceTarget).toEqual(towYardRoad);

    w.cars[0] = { ...w.cars[0], pos: towYardRoad, speed: 0 };
    w.tick(controls(), 1 / 60);

    expect(w.wreckedCars[1]).toBe(false);
    expect(w.score.current).toBe(reward);
    expect(w.serviceMission).toBeNull();
  });

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

  it('marks actual pedestrians as takedown targets and ignores bystander kills', () => {
    const w = new World({
      player: player(),
      pedestrians: [pedAt(40, 0), pedAt(40, 90), pedAt(40, 180)],
      bounds: { width: 1000, height: 1000 },
      rng: () => 0,
      mission: createMission({
        id: 'm-targets',
        title: 'Takedown',
        objectives: [{ kind: 'eliminate', description: 'Take out 2 marked targets', count: 2, targetsOnly: true }],
        reward: 500,
      }),
    });

    expect(w.pedestrians.filter((ped) => ped.missionTarget).length).toBe(2);
    const bystander = w.pedestrians.find((ped) => !ped.missionTarget);
    expect(bystander).toBeDefined();

    w.player = { ...w.player, pos: vec2(bystander!.pos.x - 30, bystander!.pos.y), angle: 0 };
    for (let i = 0; i < 30 && w.kills < 1; i++) {
      w.tick(controls({ fire: true }), 1 / 60);
    }

    expect(w.kills).toBe(1);
    expect(w.missionComplete).toBe(false);
    expect(w.missionProgress).toEqual({ current: 0, goal: 2 });

    const target = w.pedestrians.find((ped) => ped.missionTarget);
    expect(target).toBeDefined();
    w.player = { ...w.player, pos: vec2(target!.pos.x - 30, target!.pos.y), angle: 0 };
    for (let i = 0; i < 30 && (w.missionProgress?.current ?? 0) < 1; i++) {
      w.tick(controls({ fire: true }), 1 / 60);
    }

    expect(w.missionProgress).toEqual({ current: 1, goal: 2 });
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
