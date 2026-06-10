import { describe, it, expect } from 'vitest';
import {
  createMission,
  currentObjective,
  updateMission,
  isComplete,
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
  collected: 0,
  elapsed: 0,
  wantedStars: 0,
  ...partial,
});

/** Build a baseline snapshot with sensible defaults. */
const base = (partial: Partial<MissionBaseline> = {}): MissionBaseline => ({
  kills: 0,
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
