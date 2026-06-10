import { describe, it, expect } from 'vitest';
import {
  World,
  SCORE_PER_PEDESTRIAN,
  SCORE_PER_POLICE,
  PLAYER_MAX_HEALTH,
} from './world';
import { type OnFootActor } from './entity';
import { type Car } from './vehicle';
import { type Pedestrian } from './pedestrianAI';
import { rect } from './collision';
import { buildCity, tileCenter } from './city';
import { controls } from './types';
import { addHeat, createWanted, CRIME_HEAT } from './wantedLevel';
import { createMission } from './mission';
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
    for (let i = 0; i < 200; i++) w.tick(controls({ up: true }), 1 / 60);
    // One pedestrian alone is a single star; reaching two proves an officer on
    // foot was also run over (which adds far more heat).
    expect(w.wantedStars).toBeGreaterThanOrEqual(2);
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
});
