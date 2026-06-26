import { describe, expect, it } from 'vitest';
import { createMission } from './mission';
import {
  clearGameState,
  GAME_STATE_KEY,
  MANUAL_SAVE_KEY,
  manualSaveKey,
  loadGameState,
  saveGameState,
} from './gameState';
import type { KeyValueStore } from './highScore';
import { World } from './world';

function fakeStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

describe('World snapshot persistence', () => {
  it('round-trips a restored world snapshot exactly', () => {
    const base = new World({
      player: { pos: { x: 10, y: 20 }, angle: 0.25, radius: 7 },
      cars: [{ pos: { x: 40, y: 50 }, heading: 1, speed: 30, radius: 12 }],
      pedestrians: [
        {
          pos: { x: 100, y: 80 },
          heading: 0.5,
          radius: 5,
          state: 'wait',
          target: { x: 100, y: 80 },
        },
      ],
      police: [{ pos: { x: 140, y: 160 }, heading: 0, radius: 10, kind: 'foot' }],
      ammoPickups: [{ pos: { x: 200, y: 220 }, amount: 12 }],
      spawn: { x: 8, y: 8 },
      missions: [
        createMission({
          id: 'restore',
          title: 'Restore',
          objectives: [{ kind: 'collect', description: 'Collect one crate', count: 1 }],
          reward: 250,
        }),
      ],
    });

    const snapshot = base.snapshot();
    snapshot.player.pos = { x: 300, y: 310 };
    snapshot.player.angle = 1.2;
    snapshot.wanted = { heat: 180 };
    snapshot.health = { current: 65, max: 100 };
    snapshot.weapon = {
      cooldown: 0.35,
      heat: 0.1,
      ammo: 9,
      damage: 25,
      bulletSpeed: 520,
      bulletLife: 1.2,
    };
    snapshot.bullets = [{ pos: { x: 12, y: 13 }, velocity: { x: 4, y: 5 }, life: 0.8, damage: 25 }];
    snapshot.policeBullets = [
      { pos: { x: 22, y: 23 }, velocity: { x: -4, y: 3 }, life: 0.4, damage: 10 },
    ];
    snapshot.explosions = [{ pos: { x: 90, y: 91 }, radius: 60, age: 0.2, life: 1.3 }];
    snapshot.explosionsTriggered = 3;
    snapshot.gunfireThreats = [{ x: 33, y: 44 }];
    snapshot.wreckedCars = [true];
    snapshot.towedCars = [false];
    snapshot.lights = { time: 2.5 };
    snapshot.corpses = [{ pos: { x: 77, y: 88 }, offscreenFor: 1, inFrameFor: 3 }];
    snapshot.ambulance = {
      pos: { x: 50, y: 60 },
      heading: 0,
      radius: 12,
      dir: { x: 1, y: 0 },
      target: { x: 70, y: 80 },
      depot: { x: 20, y: 20 },
      job: { x: 75, y: 85 },
      phase: 'collect',
      crew: { x: 72, y: 83 },
      pickupElapsed: 1.5,
      age: 5,
      speed: 0,
      blocked: 0,
      health: 60,
    };
    snapshot.tows = [
      {
        pos: { x: 110, y: 120 },
        heading: 0,
        radius: 12,
        dir: { x: 0, y: 1 },
        target: { x: 130, y: 140 },
        depot: { x: 30, y: 30 },
        job: { x: 125, y: 145 },
        phase: 'return',
        crew: { x: 126, y: 146 },
        pickupElapsed: 2,
        age: 8,
        speed: 0,
        blocked: 1,
        health: 60,
        targetCar: 0,
        completedWrecks: 2,
      },
    ];
    snapshot.score = { current: 420, best: 900 };
    snapshot.kills = 6;
    snapshot.targetKills = 2;
    snapshot.collected = 4;
    snapshot.ammoPickups = [{ pos: { x: 210, y: 230 }, amount: 20 }];
    snapshot.drivingCarIndex = 0;
    snapshot.status = 'busted';
    snapshot.ammoRespawns = [{ pickup: { pos: { x: 9, y: 9 }, amount: 6 }, cooldown: 4.5 }];
    snapshot.carDrivers = [{ dir: { x: 1, y: 0 }, blocked: 0.5, laneTarget: 64 }];
    snapshot.carKinds = ['taxi'];
    snapshot.taxiStates = [
      {
        fare: {
          id: 4,
          passengerId: 5,
          passengerName: 'Ava',
          stage: 'dropoff',
          pickup: { x: 10, y: 11 },
          dropoff: { x: 20, y: 21 },
          reward: 333,
          dwell: 0.8,
        },
        cooldown: 2.2,
      },
    ];
    snapshot.carRespawnsAtTow = [false];
    snapshot.carHealth = [14];
    snapshot.carBurnTimers = [3.2];
    snapshot.carBurnByPlayer = [true];
    snapshot.stolenServiceVehicles = [true];
    snapshot.towDispatchCooldowns = [9];
    snapshot.carStoppedForBusted = 0.7;
    snapshot.bustedTimer = 6;
    snapshot.prevAction = true;
    snapshot.prevConfirm = false;
    snapshot.campaign = {
      missions: [
        {
          id: 'restore',
          title: 'Restore',
          objectives: [{ kind: 'collect', description: 'Collect one crate', count: 1 }],
          currentIndex: 0,
          status: 'active',
          reward: 250,
        },
      ],
      currentIndex: 0,
    };
    snapshot.campaignIndex = 2;
    snapshot.vehicleImpactCooldowns = [['car:0|car:1', 0.25]];
    snapshot.objectiveBaseline = { kills: 1, targetKills: 1, collected: 1, elapsed: 2 };
    snapshot.elapsed = 15;
    snapshot.playerTaxiMission = {
      id: 7,
      passengerId: 8,
      passengerName: 'Theo',
      stage: 'pickup',
      pickup: { x: 60, y: 70 },
      dropoff: { x: 160, y: 170 },
      reward: 540,
    };
    snapshot.playerServiceMission = {
      id: 12,
      kind: 'ambulance',
      stage: 'return',
      reward: 250,
      pickup: { x: 61, y: 71 },
      returnTo: { x: 20, y: 20 },
    };
    snapshot.playerServiceActionLock = 0.4;
    snapshot.nextTaxiMissionId = 10;
    snapshot.nextTaxiPassengerId = 11;
    snapshot.nextServiceMissionId = 12;
    snapshot.nextPoliceSuspectId = 13;
    snapshot.completedServiceJobs = { police: 1, ambulance: 2, tow: 3, taxi: 4 };

    const restored = World.fromSnapshot(
      {
        player: { pos: { x: 0, y: 0 }, angle: 0, radius: 7 },
        spawn: { x: 8, y: 8 },
      },
      snapshot,
    );

    expect(restored.snapshot()).toEqual(snapshot);
  });
});

describe('game state storage', () => {
  it('round-trips a saved game state', () => {
    const store = fakeStore();
    const world = new World({ player: { pos: { x: 1, y: 2 }, angle: 0, radius: 7 } });

    saveGameState(store, { world: world.snapshot(), timeOfDay: 123.5 });

    expect(loadGameState(store)).toEqual({
      version: 1,
      world: world.snapshot(),
      timeOfDay: 123.5,
    });
  });

  it('returns null for malformed saves', () => {
    const store = fakeStore();
    store.setItem(GAME_STATE_KEY, '{bad json');
    expect(loadGameState(store)).toBeNull();
  });

  it('clears a stored save', () => {
    const store = fakeStore();
    const world = new World({ player: { pos: { x: 1, y: 2 }, angle: 0, radius: 7 } });
    saveGameState(store, { world: world.snapshot(), timeOfDay: 10 });

    clearGameState(store);

    expect(loadGameState(store)).toBeNull();
  });

  it('supports an independent custom save slot', () => {
    const store = fakeStore();
    const world = new World({ player: { pos: { x: 4, y: 5 }, angle: 0, radius: 7 } });

    saveGameState(store, { world: world.snapshot(), timeOfDay: 88 }, MANUAL_SAVE_KEY);

    expect(loadGameState(store)).toBeNull();
    expect(loadGameState(store, MANUAL_SAVE_KEY)).toEqual({
      version: 1,
      world: world.snapshot(),
      timeOfDay: 88,
    });
  });

  it('keeps multiple manual save slots independent', () => {
    const store = fakeStore();
    const first = new World({ player: { pos: { x: 4, y: 5 }, angle: 0, radius: 7 } });
    const second = new World({ player: { pos: { x: 8, y: 9 }, angle: 0, radius: 7 } });

    saveGameState(store, { world: first.snapshot(), timeOfDay: 88 }, manualSaveKey(1));
    saveGameState(store, { world: second.snapshot(), timeOfDay: 144 }, manualSaveKey(2));

    expect(loadGameState(store, manualSaveKey(1))).toEqual({
      version: 1,
      world: first.snapshot(),
      timeOfDay: 88,
    });
    expect(loadGameState(store, manualSaveKey(2))).toEqual({
      version: 1,
      world: second.snapshot(),
      timeOfDay: 144,
    });
  });
});