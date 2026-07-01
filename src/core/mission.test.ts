import { describe, it, expect } from 'vitest';
import {
  createMission,
  currentObjective,
  updateMission,
  isComplete,
  isFailed,
  failMission,
  objectiveProgress,
  resetMission,
  type Objective,
  type MissionContext,
  type MissionBaseline,
} from './mission';
import { vec2 } from './vector';

const reachThenKill: Objective[] = [
  { kind: 'reach', description: 'Drive to the docks', target: vec2(100, 0), radius: 10 },
  { kind: 'eliminate', description: 'Take out 2 rivals', count: 2 },
];

const mission = () =>
  createMission({ id: 'm1', title: 'Turf War', objectives: reachThenKill, reward: 500 });

/** Build a mission context with sensible defaults. */
const ctx = (partial: Partial<MissionContext> = {}): MissionContext => ({
  playerPos: vec2(0, 0),
  kills: 0,
  targetKills: 0,
  collected: 0,
  elapsed: 0,
  wantedStars: 0,
  ...partial,
});

/** Build a baseline snapshot with sensible defaults. */
const base = (partial: Partial<MissionBaseline> = {}): MissionBaseline => ({
  kills: 0,
  targetKills: 0,
  collected: 0,
  elapsed: 0,
  ...partial,
});

describe('createMission', () => {
  it('starts active on the first objective', () => {
    const m = mission();
    expect(m.status).toBe('active');
    expect(m.currentIndex).toBe(0);
    expect(currentObjective(m)?.description).toBe('Drive to the docks');
  });

  it('is immediately complete with no objectives', () => {
    const m = createMission({ id: 'empty', title: 'Nothing', objectives: [] });
    expect(isComplete(m)).toBe(true);
  });
});

describe('updateMission — reach objective', () => {
  it('does not advance while the player is far away', () => {
    const m = updateMission(mission(), ctx({ playerPos: vec2(0, 0) }), base());
    expect(m.currentIndex).toBe(0);
  });

  it('advances to the next objective on arrival', () => {
    const m = updateMission(mission(), ctx({ playerPos: vec2(100, 0) }), base());
    expect(m.currentIndex).toBe(1);
    expect(currentObjective(m)?.kind).toBe('eliminate');
  });
});

describe('updateMission — eliminate objective', () => {
  it('completes the mission once enough kills happen', () => {
    let m = updateMission(mission(), ctx({ playerPos: vec2(100, 0) }), base());
    m = updateMission(m, ctx({ playerPos: vec2(100, 0), kills: 2 }), base());
    expect(isComplete(m)).toBe(true);
    expect(currentObjective(m)).toBeNull();
  });

  it('counts only kills made after the objective began', () => {
    let m = updateMission(mission(), ctx({ playerPos: vec2(100, 0), kills: 5 }), base());
    const started = base({ kills: 5 }); // objective began with 5 prior kills
    m = updateMission(m, ctx({ playerPos: vec2(100, 0), kills: 6 }), started);
    expect(isComplete(m)).toBe(false); // only 1 of 2 required
    m = updateMission(m, ctx({ playerPos: vec2(100, 0), kills: 7 }), started);
    expect(isComplete(m)).toBe(true);
  });

  it('counts only designated target kills when the objective requires actual targets', () => {
    const targetMission = () =>
      createMission({
        id: 't',
        title: 'Takedown',
        objectives: [{ kind: 'eliminate', description: 'Take down 2 marked targets', count: 2, targetsOnly: true }],
      });

    expect(isComplete(updateMission(targetMission(), ctx({ kills: 9, targetKills: 1 }), base()))).toBe(false);
    expect(isComplete(updateMission(targetMission(), ctx({ kills: 9, targetKills: 2 }), base()))).toBe(true);
  });
});

describe('updateMission — collect objective', () => {
  const collectMission = () =>
    createMission({
      id: 'c',
      title: 'Supply Run',
      objectives: [{ kind: 'collect', description: 'Grab 3 crates', count: 3 }],
    });

  it('completes once enough pickups are collected after it began', () => {
    const started = base({ collected: 1 });
    expect(isComplete(updateMission(collectMission(), ctx({ collected: 3 }), started))).toBe(false);
    expect(isComplete(updateMission(collectMission(), ctx({ collected: 4 }), started))).toBe(true);
  });
});

describe('updateMission — route objective', () => {
  const routeMission = () =>
    createMission({
      id: 'route',
      title: 'Locker Run',
      objectives: [
        {
          kind: 'route',
          description: 'Hit 3 lockers in sequence',
          targets: [vec2(10, 0), vec2(20, 0), vec2(30, 0)],
          radius: 5,
          timeLimitSeconds: 60,
        },
      ],
    });

  it('tracks sequential checkpoint progress before completing', () => {
    let m = updateMission(routeMission(), ctx({ playerPos: vec2(10, 0) }), base());
    expect(isComplete(m)).toBe(false);
    expect(m.objectiveState).toEqual({ kind: 'route', completed: 1 });

    m = updateMission(m, ctx({ playerPos: vec2(30, 0) }), base());
    expect(m.objectiveState).toEqual({ kind: 'route', completed: 1 });

    m = updateMission(m, ctx({ playerPos: vec2(20, 0) }), base());
    expect(m.objectiveState).toEqual({ kind: 'route', completed: 2 });
    m = updateMission(m, ctx({ playerPos: vec2(30, 0) }), base());
    expect(isComplete(m)).toBe(true);
  });

  it('fails the mission once the time limit expires', () => {
    const m = updateMission(routeMission(), ctx({ playerPos: vec2(10, 0), elapsed: 61 }), base());
    expect(isFailed(m)).toBe(true);
    expect(isComplete(m)).toBe(false);
    expect(m.failureReason).toContain('Hit 3 lockers in sequence');
  });
});

describe('updateMission — sabotage objective', () => {
  const sabotageMission = () =>
    createMission({
      id: 'sab',
      title: 'Crusher Feed',
      objectives: [
        {
          kind: 'sabotage',
          description: 'Trip 3 crusher safeties in order',
          targets: [vec2(10, 0), vec2(20, 0), vec2(30, 0)],
          radius: 5,
          timeLimitSeconds: 60,
        },
      ],
    });

  it('tracks sequential sabotage progress before completing', () => {
    let m = updateMission(sabotageMission(), ctx({ playerPos: vec2(10, 0) }), base());
    expect(isComplete(m)).toBe(false);
    expect(m.objectiveState).toEqual({ kind: 'route', completed: 1 });

    m = updateMission(m, ctx({ playerPos: vec2(20, 0) }), base());
    expect(m.objectiveState).toEqual({ kind: 'route', completed: 2 });

    m = updateMission(m, ctx({ playerPos: vec2(30, 0) }), base());
    expect(isComplete(m)).toBe(true);
  });

  it('fails the mission once the time limit expires', () => {
    const m = updateMission(sabotageMission(), ctx({ playerPos: vec2(10, 0), elapsed: 61 }), base());
    expect(isFailed(m)).toBe(true);
    expect(m.failureReason).toContain('Trip 3 crusher safeties in order');
  });
});

describe('updateMission — tail objective', () => {
  const tailMission = () =>
    createMission({
      id: 'tail',
      title: 'Follow',
      objectives: [{ kind: 'tail', description: 'Tail the target for 12s', seconds: 12 }],
    });

  it('completes once enough tail progress accumulates after the objective began', () => {
    const started = base({ tailSeconds: 4 });
    expect(isComplete(updateMission(tailMission(), ctx({ tailSeconds: 15 }), started))).toBe(false);
    expect(isComplete(updateMission(tailMission(), ctx({ tailSeconds: 16 }), started))).toBe(true);
  });
});

describe('updateMission — capture objective', () => {
  const captureMission = () =>
    createMission({
      id: 'capture',
      title: 'Box In',
      objectives: [{ kind: 'capture', description: 'Hold the target for 3s', seconds: 3 }],
    });

  it('completes once enough capture progress accumulates after the objective began', () => {
    const started = base({ captureSeconds: 1 });
    expect(isComplete(updateMission(captureMission(), ctx({ captureSeconds: 3 }), started))).toBe(false);
    expect(isComplete(updateMission(captureMission(), ctx({ captureSeconds: 4 }), started))).toBe(true);
  });
});

describe('updateMission — survive objective', () => {
  const surviveMission = () =>
    createMission({
      id: 's',
      title: 'Lay Low',
      objectives: [{ kind: 'survive', description: 'Survive 30s', seconds: 30 }],
    });

  it('completes only after the duration has elapsed since it began', () => {
    const started = base({ elapsed: 10 });
    expect(isComplete(updateMission(surviveMission(), ctx({ elapsed: 30 }), started))).toBe(false);
    expect(isComplete(updateMission(surviveMission(), ctx({ elapsed: 41 }), started))).toBe(true);
  });
});

describe('updateMission — defend objective', () => {
  const defendMission = () =>
    createMission({
      id: 'd',
      title: 'Hold Fast',
      objectives: [
        { kind: 'defend', description: 'Hold the yard for 10s', target: vec2(100, 0), radius: 20, seconds: 10 },
      ],
    });

  it('accumulates hold time only while the player stays inside the defend radius', () => {
    let m = updateMission(defendMission(), ctx({ playerPos: vec2(100, 0), elapsed: 4 }), base({ elapsed: 0 }));
    expect(m.objectiveState).toEqual({ kind: 'defend', heldSeconds: 4, lastElapsed: 4 });

    m = updateMission(m, ctx({ playerPos: vec2(160, 0), elapsed: 6 }), base({ elapsed: 0 }));
    expect(m.objectiveState).toEqual({ kind: 'defend', heldSeconds: 0, lastElapsed: 6 });

    m = updateMission(m, ctx({ playerPos: vec2(100, 0), elapsed: 12 }), base({ elapsed: 0 }));
    expect(m.objectiveState).toEqual({ kind: 'defend', heldSeconds: 6, lastElapsed: 12 });
    expect(isComplete(m)).toBe(false);
  });

  it('completes once the defend area is held continuously for the full duration', () => {
    const started = updateMission(
      defendMission(),
      ctx({ playerPos: vec2(100, 0), elapsed: 5 }),
      base({ elapsed: 0 }),
    );
    const done = updateMission(started, ctx({ playerPos: vec2(100, 0), elapsed: 10 }), base({ elapsed: 0 }));
    expect(isComplete(done)).toBe(true);
  });
});

describe('updateMission — wanted objective', () => {
  const wantedMission = () =>
    createMission({
      id: 'w',
      title: 'Rampage',
      objectives: [{ kind: 'wanted', description: 'Reach 3 stars', stars: 3 }],
    });

  it('completes when the wanted level is high enough', () => {
    expect(isComplete(updateMission(wantedMission(), ctx({ wantedStars: 2 }), base()))).toBe(false);
    expect(isComplete(updateMission(wantedMission(), ctx({ wantedStars: 3 }), base()))).toBe(true);
  });
});

describe('updateMission — service objective', () => {
  const serviceMission = () =>
    createMission({
      id: 'svc',
      title: 'First Responder',
      objectives: [{ kind: 'service', description: 'Complete 2 ambulance runs', service: 'ambulance', count: 2 }],
    });

  it('completes only after enough service runs finish after the objective began', () => {
    const started = base({ serviceCompleted: { police: 1, ambulance: 3, tow: 0, taxi: 0 } });
    expect(
      isComplete(
        updateMission(serviceMission(), ctx({ serviceCompleted: { police: 1, ambulance: 4, tow: 0, taxi: 0 } }), started),
      ),
    ).toBe(false);
    expect(
      isComplete(
        updateMission(serviceMission(), ctx({ serviceCompleted: { police: 1, ambulance: 5, tow: 0, taxi: 0 } }), started),
      ),
    ).toBe(true);
  });
});

describe('updateMission — purity and idempotence', () => {
  it('does not mutate the input mission', () => {
    const m = mission();
    updateMission(m, ctx({ playerPos: vec2(100, 0) }), base());
    expect(m.currentIndex).toBe(0);
  });

  it('is a no-op once completed', () => {
    let m = updateMission(mission(), ctx({ playerPos: vec2(100, 0) }), base());
    m = updateMission(m, ctx({ playerPos: vec2(100, 0), kills: 2 }), base());
    const done = updateMission(m, ctx({ playerPos: vec2(0, 0), kills: 99 }), base());
    expect(done).toEqual(m);
  });
});

describe('objectiveProgress', () => {
  it('reports null for a reach objective (shown by a marker)', () => {
    const obj: Objective = { kind: 'reach', description: 'Go', target: vec2(0, 0), radius: 10 };
    expect(objectiveProgress(obj, ctx(), base())).toBeNull();
  });

  it('counts eliminations relative to the objective baseline', () => {
    const obj: Objective = { kind: 'eliminate', description: 'Take out 8', count: 8 };
    expect(objectiveProgress(obj, ctx({ kills: 5 }), { kills: 2, targetKills: 0, collected: 0, elapsed: 0 })).toEqual(
      { current: 3, goal: 8 },
    );
  });

  it('clamps progress to the goal and never goes negative', () => {
    const obj: Objective = { kind: 'collect', description: 'Grab 3', count: 3 };
    expect(objectiveProgress(obj, ctx({ collected: 99 }), base())).toEqual({ current: 3, goal: 3 });
  });

  it('reports sequential route progress from mission state', () => {
    const route = createMission({
      id: 'route',
      title: 'Route',
      objectives: [{ kind: 'route', description: 'Visit 2 stops', targets: [vec2(1, 0), vec2(2, 0)], radius: 5 }],
    });
    const started = updateMission(route, ctx({ playerPos: vec2(1, 0) }), base());
    expect(objectiveProgress(started.objectives[0]!, ctx(), base(), started)).toEqual({ current: 1, goal: 2 });
  });

  it('reports sequential sabotage progress from mission state', () => {
    const sabotage = createMission({
      id: 'sab',
      title: 'Sabotage',
      objectives: [
        { kind: 'sabotage', description: 'Trip 2 switches', targets: [vec2(1, 0), vec2(2, 0)], radius: 5 },
      ],
    });
    const started = updateMission(sabotage, ctx({ playerPos: vec2(1, 0) }), base());
    expect(objectiveProgress(started.objectives[0]!, ctx(), base(), started)).toEqual({
      current: 1,
      goal: 2,
    });
  });

  it('reports survive progress in whole seconds and wanted progress in stars', () => {
    const survive: Objective = { kind: 'survive', description: 'Last 30s', seconds: 30 };
    expect(objectiveProgress(survive, ctx({ elapsed: 12.7 }), base())).toEqual({ current: 12, goal: 30 });
    const defendMission = createMission({
      id: 'defend',
      title: 'Defend',
      objectives: [{ kind: 'defend', description: 'Hold', target: vec2(0, 0), radius: 10, seconds: 8 }],
    });
    const defendStarted = updateMission(defendMission, ctx({ playerPos: vec2(0, 0), elapsed: 3.8 }), base());
    expect(objectiveProgress(defendStarted.objectives[0]!, ctx(), base(), defendStarted)).toEqual({
      current: 3,
      goal: 8,
    });
    const wanted: Objective = { kind: 'wanted', description: '3 stars', stars: 3 };
    expect(objectiveProgress(wanted, ctx({ wantedStars: 2 }), base())).toEqual({ current: 2, goal: 3 });
  });

  it('reports service progress relative to the objective baseline', () => {
    const service: Objective = { kind: 'service', description: 'Finish 3 tow jobs', service: 'tow', count: 3 };
    expect(
      objectiveProgress(
        service,
        ctx({ serviceCompleted: { police: 0, ambulance: 0, tow: 4, taxi: 0 } }),
        base({ serviceCompleted: { police: 0, ambulance: 0, tow: 2, taxi: 0 } }),
      ),
    ).toEqual({ current: 2, goal: 3 });
  });

  it('reports tail and capture progress in whole seconds', () => {
    const tail: Objective = { kind: 'tail', description: 'Tail for 10s', seconds: 10 };
    const capture: Objective = { kind: 'capture', description: 'Hold for 4s', seconds: 4 };
    expect(objectiveProgress(tail, ctx({ tailSeconds: 8.7 }), base({ tailSeconds: 2 }))).toEqual({ current: 6, goal: 10 });
    expect(objectiveProgress(capture, ctx({ captureSeconds: 5.2 }), base({ captureSeconds: 3 }))).toEqual({ current: 2, goal: 4 });
  });
});

describe('resetMission', () => {
  it('rewinds a finished mission to its first objective', () => {
    let m = updateMission(mission(), ctx({ playerPos: vec2(100, 0) }), base());
    m = updateMission(m, ctx({ playerPos: vec2(100, 0), kills: 2 }), base());
    expect(isComplete(m)).toBe(true);
    const fresh = resetMission(m);
    expect(fresh.currentIndex).toBe(0);
    expect(fresh.status).toBe('active');
    expect(currentObjective(fresh)?.kind).toBe('reach');
  });

  it('clears a failure reason when rewinding a failed mission', () => {
    const failed = failMission(mission(), 'Got caught');
    const fresh = resetMission(failed);
    expect(fresh.status).toBe('active');
    expect(fresh.failureReason).toBeUndefined();
  });
});

describe('failMission / isFailed', () => {
  it('marks a mission failed with a reason and leaves other missions untouched', () => {
    const m = mission();
    const failed = failMission(m, 'Blew the cover');
    expect(isFailed(failed)).toBe(true);
    expect(isFailed(m)).toBe(false);
    expect(failed.failureReason).toBe('Blew the cover');
    expect(isComplete(failed)).toBe(false);
  });
});
