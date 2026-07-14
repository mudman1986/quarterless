import { describe, expect, it } from 'vitest';
import { vec2 } from '../../core/vector';
import {
  advancePedestrianRouteActor,
  advanceVehicleRouteActor,
  applyStoryFailRules,
  isStageTransitionMet,
  normalizeRouteCompletion,
  placeStorySquadMember,
  updateTailCaptureProgress,
  type StoryProgressState,
} from './runtimeActors';

describe('placeStorySquadMember', () => {
  const despawn = vec2(-100000, -100000);

  it('snaps a parked mission-target squad member onto the map when its objective activates', () => {
    // While inactive, squad members park off-map fanned out along X, so a
    // member's parked X never matches the despawn anchor's X — only its Y stays
    // pinned to the off-map row. Reactivation must still recognise it as parked
    // and move it to the objective anchor, otherwise the eliminate targets never
    // appear on the map or the minimap (the towline-oath regression).
    const parkedWithSpreadOffset = vec2(despawn.x + 42, despawn.y);
    const placement = placeStorySquadMember(
      parkedWithSpreadOffset,
      vec2(1216, 2304),
      4,
      6,
      28,
      despawn,
    );
    expect(placement.reset).toBe(true);
    expect(placement.pos.y).toBe(2304);
    // Anchored near the objective center (with its fan-out offset), i.e. on the map.
    expect(Math.abs(placement.pos.x - 1216)).toBeLessThanOrEqual(6 * 28);
  });

  it('leaves an already-active squad member exactly where it stands', () => {
    const active = vec2(1250, 2310);
    const placement = placeStorySquadMember(active, vec2(1216, 2304), 0, 6, 28, despawn);
    expect(placement.reset).toBe(false);
    expect(placement.pos).toEqual(active);
  });

  it('always re-anchors when a reset is forced (parking an actor off-map)', () => {
    const placement = placeStorySquadMember(vec2(1250, 2310), despawn, 2, 6, 28, despawn, true);
    expect(placement.reset).toBe(true);
    expect(placement.pos.y).toBe(despawn.y);
  });

  it('treats a never-spawned member as parked so it anchors on first activation', () => {
    const placement = placeStorySquadMember(null, vec2(300, 400), 0, 1, 20, despawn);
    expect(placement.reset).toBe(true);
    expect(placement.pos).toEqual(vec2(300, 400));
  });
});

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

  it('arcs into a sharp waypoint turn along its own heading instead of snapping straight at the next point', () => {
    // Regression: movement used to follow the raw straight-line direction to
    // the target regardless of the turn-rate-limited heading, so a sharp
    // corner made the car visibly slide sideways (its sprite still facing the
    // old direction while its position beelined toward the new one) for a
    // stretch of frames until the heading caught up.
    const actor = {
      kind: 'vehicleRoute' as const,
      actorId: 'a',
      vehicleKind: 'sedan' as const,
      route: [vec2(0, 0), vec2(100, 0), vec2(100, 100)],
      speed: 100,
      followRadius: 300,
    };
    // Positioned exactly at the sharp turn (route[1]), heading 0 (east) from
    // having just driven the first leg, about to turn south (+y).
    const step = advanceVehicleRouteActor(actor, vec2(100, 0), 1, 1 / 60, 0);
    const displacement = { x: step.pos.x - 100, y: step.pos.y - 0 };
    const displacementAngle = Math.atan2(displacement.y, displacement.x);
    // Actual movement direction must match the reported (turn-limited)
    // heading, not the desired end direction (south, ~PI/2).
    expect(displacementAngle).toBeCloseTo(step.heading, 5);
    expect(Math.abs(step.heading)).toBeLessThan(Math.PI / 4);
  });

  it('keeps driving in its current heading instead of freezing once the route is fully driven', () => {
    // Regression: once a vehicle actor reached its route's last waypoint, it
    // froze there forever (speed reported as 0, position never changing)
    // regardless of whether whatever gates the mission along (a stage
    // transition, a tail/capture timer) had actually finished yet — looking
    // like the target car abruptly, unnaturally stopping dead mid-mission.
    const actor = {
      kind: 'vehicleRoute' as const,
      actorId: 'a',
      vehicleKind: 'sedan' as const,
      route: [vec2(0, 0), vec2(100, 0)],
      speed: 100,
      followRadius: 300,
    };
    // routeIndex already reports "fully arrived" (lastIndex), as it would on
    // any tick after the one that first reached the end.
    const step = advanceVehicleRouteActor(actor, vec2(100, 0), 1, 1 / 60, 0);
    expect(step.pos.x).toBeGreaterThan(100); // keeps moving, not frozen
    // Still reports "fully driven" so a routeComplete stage transition
    // watching for it keeps seeing it correctly (must never regress back to
    // an earlier-looking index once it has reached the end).
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
  it('accumulates tail progress near the actor and capture progress before the route ends', () => {
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
      {
        playerPos: vec2(0, 0),
        playerSpeed: 0,
        wantedStars: 0,
        dt: 1,
        actorPositions: {},
        actorVehicleHealth: {},
        actorVehicleDisabled: {},
      },
      vec2(10, 0),
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
      {
        playerPos: vec2(100, 0),
        playerSpeed: 25,
        wantedStars: 0,
        dt: 1,
        actorPositions: {},
        actorVehicleHealth: {},
        actorVehicleDisabled: {},
      },
      vec2(10, 0),
    );

    expect(next.tailSeconds).toBe(3);
    expect(next.tailLostSeconds).toBeCloseTo(3.6);
    expect(next.captureSeconds).toBe(0);
  });

  it('treats a disabled target as immediately captured', () => {
    const actor = {
      kind: 'vehicleRoute' as const,
      actorId: 'a',
      vehicleKind: 'ambulance' as const,
      route: [vec2(0, 0), vec2(10, 0)],
      speed: 100,
      followRadius: 40,
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
      {
        playerPos: vec2(100, 0),
        playerSpeed: 25,
        wantedStars: 0,
        dt: 1,
        actorPositions: {},
        actorVehicleHealth: {},
        actorVehicleDisabled: {},
      },
      vec2(10, 0),
      true,
    );

    expect(next.captureSeconds).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('does not auto-capture a disabled target when the actor opts out', () => {
    const actor = {
      kind: 'vehicleRoute' as const,
      actorId: 'a',
      vehicleKind: 'ambulance' as const,
      route: [vec2(0, 0), vec2(10, 0)],
      speed: 100,
      followRadius: 40,
      captureRadius: 20,
      captureMaxSpeed: 10,
      captureOnDisable: false,
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
      {
        playerPos: vec2(100, 0),
        playerSpeed: 25,
        wantedStars: 0,
        dt: 1,
        actorPositions: {},
        actorVehicleHealth: {},
        actorVehicleDisabled: {},
      },
      vec2(10, 0),
      true,
    );

    expect(next.captureSeconds).toBe(0);
  });
});

describe('applyStoryFailRules', () => {
  it('fails when an escort actor is left outside its allowed radius too long', () => {
    const result = applyStoryFailRules(
      [
        {
          kind: 'escortRadius',
          actorId: 'escort',
          radius: 30,
          maxSeconds: 2,
          failureText: 'Escort lost',
        },
      ],
      { tailSeconds: 0, captureSeconds: 0, tailLostSeconds: 0, failCounters: {} },
      {
        playerPos: vec2(0, 0),
        playerSpeed: 0,
        wantedStars: 0,
        dt: 2.1,
        actorPositions: { escort: vec2(100, 0) },
        actorVehicleHealth: {},
        actorVehicleDisabled: {},
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
        wantedStars: 0,
        dt: 1.6,
        actorPositions: { van: null },
        actorVehicleHealth: {},
        actorVehicleDisabled: {},
      },
    );

    expect(result.failureText).toBe('Target lost');
    expect(result.progress.failCounters.van).toBeCloseTo(1.6);
  });

  it('fails when a stealth route stays loud for too long', () => {
    const result = applyStoryFailRules(
      [{ kind: 'wantedPressure', minStars: 2, maxSeconds: 2, failureText: 'Stealth blown' }],
      { tailSeconds: 0, captureSeconds: 0, tailLostSeconds: 0, failCounters: {} },
      {
        playerPos: vec2(0, 0),
        playerSpeed: 0,
        wantedStars: 2,
        dt: 2.1,
        actorPositions: {},
        actorVehicleHealth: {},
        actorVehicleDisabled: {},
      },
    );

    expect(result.failureText).toBe('Stealth blown');
    expect(result.progress.failCounters['wanted-pressure:2:Stealth blown']).toBeCloseTo(2.1);
  });

  it('fails when a protected story vehicle stays below its minimum condition', () => {
    const result = applyStoryFailRules(
      [
        {
          kind: 'actorVehicleCondition',
          actorId: 'shell',
          minHealth: 55,
          maxSeconds: 0.5,
          failureText: 'Cargo wrecked',
        },
      ],
      { tailSeconds: 0, captureSeconds: 0, tailLostSeconds: 0, failCounters: {} },
      {
        playerPos: vec2(0, 0),
        playerSpeed: 0,
        wantedStars: 0,
        dt: 0.6,
        actorPositions: { shell: vec2(10, 0) },
        actorVehicleHealth: { shell: 40 },
        actorVehicleDisabled: { shell: false },
      },
    );

    expect(result.failureText).toBe('Cargo wrecked');
    expect(result.progress.failCounters['actor-vehicle-condition:shell']).toBeCloseTo(0.6);
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
      isStageTransitionMet({
        kind: 'routeComplete',
        actorId: 'van',
      }, {
        progress,
        routeIndices: { van: normalizeRouteCompletion(2, 3) },
      }),
    ).toBe(true);
  });

  it('supports tail and capture second thresholds', () => {
    const progress: StoryProgressState = {
      tailSeconds: 12,
      captureSeconds: 3,
      tailLostSeconds: 0,
      failCounters: {},
    };
    expect(
      isStageTransitionMet({ kind: 'tailSeconds', seconds: 10 }, { progress, routeIndices: {} }),
    ).toBe(true);
    expect(
      isStageTransitionMet({ kind: 'captureSeconds', seconds: 4 }, { progress, routeIndices: {} }),
    ).toBe(false);
  });

  it('supports story-objective and route-progress thresholds', () => {
    const progress: StoryProgressState = {
      tailSeconds: 0,
      captureSeconds: 0,
      tailLostSeconds: 0,
      failCounters: {},
    };
    expect(
      isStageTransitionMet(
        { kind: 'storyObjective', objectiveIndex: 1 },
        { progress, routeIndices: {}, storyObjectiveIndex: 1 },
      ),
    ).toBe(true);
    expect(
      isStageTransitionMet(
        { kind: 'routeProgress', count: 2 },
        { progress, routeIndices: {}, routeProgress: 1 },
      ),
    ).toBe(false);
  });
});
