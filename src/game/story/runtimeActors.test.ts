import { describe, expect, it } from 'vitest';
import { vec2 } from '../../core/vector';
import {
  advancePedestrianRouteActor,
  advanceVehicleRouteActor,
  applyStoryFailRules,
  isStageTransitionMet,
  normalizeRouteCompletion,
  updateTailCaptureProgress,
  type StoryProgressState,
} from './runtimeActors';

describe('advanceVehicleRouteActor', () => {
  it('moves a route vehicle from the first waypoint toward the second waypoint', () => {
    const actor = {
      kind: 'vehicleRoute' as const,
      actorId: 'a',
      vehicleKind: 'ambulance' as const,
      route: [vec2(10, 0), vec2(20, 0)],
      speed: 100,
      followRadius: 300,
    };
    const step = advanceVehicleRouteActor(actor, vec2(10, 0), 0, 0.2, 0);
    expect(step.pos.x).toBeGreaterThan(10);
    expect(step.routeIndex).toBe(1);
  });

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

  it('drains tail progress after the lose grace expires and clears capture when the player is moving too fast', () => {
    const actor = {
      kind: 'vehicleRoute' as const,
      actorId: 'a',
      vehicleKind: 'ambulance' as const,
      route: [vec2(0, 0), vec2(10, 0)],
      speed: 100,
      followRadius: 40,
      captureRadius: 20,
      captureMaxSpeed: 10,
      tailDrainPerSecond: 2,
      loseGraceSeconds: 2.5,
    };
    const progress: StoryProgressState = {
      tailSeconds: 5,
      captureSeconds: 1.5,
      tailLostSeconds: 2.6,
      failCounters: {},
    };

    const next = updateTailCaptureProgress(
      actor,
      progress,
      { playerPos: vec2(100, 0), playerSpeed: 25, dt: 1, actorPositions: {} },
      vec2(10, 0),
      1,
    );

    expect(next.tailSeconds).toBe(3);
    expect(next.tailLostSeconds).toBeCloseTo(3.6);
    expect(next.captureSeconds).toBe(0);
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

  it('fails when a required actor disappears for too long', () => {
    const result = applyStoryFailRules(
      [{ kind: 'loseActor', actorId: 'van', maxSeconds: 1.5, failureText: 'Target lost' }],
      { tailSeconds: 0, captureSeconds: 0, tailLostSeconds: 0, failCounters: {} },
      {
        playerPos: vec2(0, 0),
        playerSpeed: 0,
        dt: 1.6,
        actorPositions: { van: null },
      },
    );

    expect(result.failureText).toBe('Target lost');
    expect(result.progress.failCounters.van).toBeCloseTo(1.6);
  });
});

describe('stage transitions', () => {
  it('treats a completed route actor as a routeComplete transition', () => {
    const progress: StoryProgressState = {
      tailSeconds: 0,
      captureSeconds: 0,
      tailLostSeconds: 0,
      failCounters: {},
    };
    expect(
      isStageTransitionMet(
        { kind: 'routeComplete', actorId: 'van' },
        progress,
        { van: normalizeRouteCompletion(2, 3) },
      ),
    ).toBe(true);
  });

  it('supports tail and capture second thresholds', () => {
    const progress: StoryProgressState = {
      tailSeconds: 12,
      captureSeconds: 3,
      tailLostSeconds: 0,
      failCounters: {},
    };
    expect(isStageTransitionMet({ kind: 'tailSeconds', seconds: 10 }, progress, {})).toBe(true);
    expect(isStageTransitionMet({ kind: 'captureSeconds', seconds: 4 }, progress, {})).toBe(false);
  });
});