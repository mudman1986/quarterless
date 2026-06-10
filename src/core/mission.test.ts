import { describe, it, expect } from 'vitest';
import {
  createMission,
  currentObjective,
  updateMission,
  isComplete,
  type Objective,
} from './mission';
import { vec2 } from './vector';

const reachThenKill: Objective[] = [
  { kind: 'reach', description: 'Drive to the docks', target: vec2(100, 0), radius: 10 },
  { kind: 'eliminate', description: 'Take out 2 rivals', count: 2 },
];

const mission = () =>
  createMission({ id: 'm1', title: 'Turf War', objectives: reachThenKill, reward: 500 });

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
    const m = updateMission(mission(), { playerPos: vec2(0, 0), kills: 0 }, 0);
    expect(m.currentIndex).toBe(0);
  });

  it('advances to the next objective on arrival', () => {
    const m = updateMission(mission(), { playerPos: vec2(100, 0), kills: 0 }, 0);
    expect(m.currentIndex).toBe(1);
    expect(currentObjective(m)?.kind).toBe('eliminate');
  });
});

describe('updateMission — eliminate objective', () => {
  it('completes the mission once enough kills happen', () => {
    let m = updateMission(mission(), { playerPos: vec2(100, 0), kills: 0 }, 0);
    // Now on the eliminate objective; 0 kills so far at its start.
    m = updateMission(m, { playerPos: vec2(100, 0), kills: 2 }, 0);
    expect(isComplete(m)).toBe(true);
    expect(currentObjective(m)).toBeNull();
  });

  it('counts only kills made after the objective began', () => {
    let m = updateMission(mission(), { playerPos: vec2(100, 0), kills: 5 }, 0);
    const killsAtStart = 5; // objective began with 5 prior kills
    m = updateMission(m, { playerPos: vec2(100, 0), kills: 6 }, killsAtStart);
    expect(isComplete(m)).toBe(false); // only 1 of 2 required
    m = updateMission(m, { playerPos: vec2(100, 0), kills: 7 }, killsAtStart);
    expect(isComplete(m)).toBe(true);
  });
});

describe('updateMission — purity and idempotence', () => {
  it('does not mutate the input mission', () => {
    const m = mission();
    updateMission(m, { playerPos: vec2(100, 0), kills: 0 }, 0);
    expect(m.currentIndex).toBe(0);
  });

  it('is a no-op once completed', () => {
    let m = updateMission(mission(), { playerPos: vec2(100, 0), kills: 0 }, 0);
    m = updateMission(m, { playerPos: vec2(100, 0), kills: 2 }, 0);
    const done = updateMission(m, { playerPos: vec2(0, 0), kills: 99 }, 0);
    expect(done).toEqual(m);
  });
});
