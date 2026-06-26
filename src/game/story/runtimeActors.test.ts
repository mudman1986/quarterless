import { describe, expect, it } from 'vitest';
import { vec2 } from '../../core/vector';
import {
  advancePedestrianRouteActor,
  advanceVehicleRouteActor,
  applyStoryFailRules,
  updateTailCaptureProgress,
  type StoryProgressState,
} from './runtimeActors';

describe('advanceVehicleRouteActor', () => {
  it('moves a route vehicle toward the next waypoint and advances the route index on arrival', () => {
    const actor = {
      kind: 'vehicleRoute' as const,
      actorId: 'a',
      vehicleKind: 'ambulance' as const,
      route: [vec2(10, 0), vec2(20, 0)],
      speed: 100,
      followRadius: 300,
    };
    const step = advanceVehicleRouteActor(actor, vec2(0, 0), 0, 0.2);
    expect(step.pos.x).toBeGreaterThan(0);
    expect(step.routeIndex).toBe(1);
  });
});

describe('advancePedestrianRouteActor', () => {
  it('moves an escort actor along its route at walking speed', () => {
    const actor = {
      kind: 'pedestrianRoute' as const,
      actorId: 'escort',
      route: [vec2(0, 0), vec2(0, 20)],
      speed: 40,
    };
    const step = advancePedestrianRouteActor(actor, vec2(0, 0), 1, 0.25);
    expect(step.pos.y).toBeGreaterThan(0);
  });
});

describe('updateTailCaptureProgress', () => {
  it('accumulates tail progress near the actor and capture progress at the final stop', () => {
    const actor = {
      kind: 'vehicleRoute' as const,
      actorId: 'a',
      vehicleKind: 'ambulance' as const,
      route: [vec2(0, 0), vec2(10, 0)],
      speed: 100,
      followRadius: 100,
      captureRadius: 20,
      captureMaxSpeed: 10,
    };
    const progress: StoryProgressState = {
      tailSeconds: 0,
      captureSeconds: 0,
      tailLostSeconds: 0,
      failCounters: {},
    };
    const next = updateTailCaptureProgress(
      actor,
      progress,
      { playerPos: vec2(0, 0), playerSpeed: 0, dt: 1, actorPositions: {} },
      vec2(10, 0),
      1,
    );
    expect(next.tailSeconds).toBe(1);
    expect(next.captureSeconds).toBe(1);
  });
});

describe('applyStoryFailRules', () => {
  it('fails when an escort actor is left outside its allowed radius too long', () => {
    const result = applyStoryFailRules(
      [{ kind: 'escortRadius', actorId: 'escort', radius: 30, maxSeconds: 2, failureText: 'Escort lost' }],
      { tailSeconds: 0, captureSeconds: 0, tailLostSeconds: 0, failCounters: {} },
      {
        playerPos: vec2(0, 0),
        playerSpeed: 0,
        dt: 2.1,
        actorPositions: { escort: vec2(100, 0) },
      },
    );
    expect(result.failureText).toBe('Escort lost');
  });
});