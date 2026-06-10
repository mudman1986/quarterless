import { describe, it, expect } from 'vitest';
import {
  createCampaign,
  currentMission,
  isCampaignComplete,
  updateCampaign,
} from './campaign';
import { createMission, updateMission, type Objective, type MissionContext } from './mission';
import { vec2 } from './vector';

const reach = (target = vec2(0, 0)): Objective => ({
  kind: 'reach',
  description: 'Go there',
  target,
  radius: 10,
});

const mission = (id: string, reward = 100) =>
  createMission({ id, title: id, objectives: [reach()], reward });

/** A mission context at a player position, with no other progress. */
const at = (pos = vec2(0, 0)): MissionContext => ({
  playerPos: pos,
  kills: 0,
  collected: 0,
  elapsed: 0,
  wantedStars: 0,
});
const fresh = { kills: 0, collected: 0, elapsed: 0 };

describe('createCampaign', () => {
  it('starts on the first mission', () => {
    const c = createCampaign([mission('a'), mission('b')]);
    expect(c.currentIndex).toBe(0);
    expect(currentMission(c)?.id).toBe('a');
    expect(isCampaignComplete(c)).toBe(false);
  });

  it('is immediately complete when empty', () => {
    const c = createCampaign([]);
    expect(currentMission(c)).toBeNull();
    expect(isCampaignComplete(c)).toBe(true);
  });
});

describe('updateCampaign', () => {
  it('keeps the current mission while it is still active', () => {
    const c = createCampaign([mission('a'), mission('b')]);
    // Mission still active (player far from the target): index stays.
    const advanced = updateMission(currentMission(c)!, at(vec2(500, 0)), fresh);
    const next = updateCampaign(c, advanced);
    expect(next.currentIndex).toBe(0);
    expect(currentMission(next)?.id).toBe('a');
  });

  it('advances to the next mission once the current one is complete', () => {
    const c = createCampaign([mission('a'), mission('b')]);
    const done = updateMission(currentMission(c)!, at(vec2(0, 0)), fresh);
    const next = updateCampaign(c, done);
    expect(next.currentIndex).toBe(1);
    expect(currentMission(next)?.id).toBe('b');
    expect(isCampaignComplete(next)).toBe(false);
  });

  it('finishes the campaign after the last mission completes', () => {
    let c = createCampaign([mission('a')]);
    const done = updateMission(currentMission(c)!, at(vec2(0, 0)), fresh);
    c = updateCampaign(c, done);
    expect(isCampaignComplete(c)).toBe(true);
    expect(currentMission(c)).toBeNull();
  });

  it('does not mutate the input campaign', () => {
    const c = createCampaign([mission('a'), mission('b')]);
    const done = updateMission(currentMission(c)!, at(vec2(0, 0)), fresh);
    updateCampaign(c, done);
    expect(c.currentIndex).toBe(0);
  });

  it('is a no-op once the campaign is finished', () => {
    let c = createCampaign([mission('a')]);
    const done = updateMission(currentMission(c)!, at(vec2(0, 0)), fresh);
    c = updateCampaign(c, done); // now complete
    const after = updateCampaign(c, done);
    expect(after).toEqual(c);
  });
});
