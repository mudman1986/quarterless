import { type Mission, isComplete } from './mission';

/** An ordered series of missions played one after another. */
export interface Campaign {
  missions: readonly Mission[];
  /** Index of the mission currently in progress. */
  currentIndex: number;
}

export function createCampaign(missions: readonly Mission[]): Campaign {
  return { missions, currentIndex: 0 };
}

/** The mission currently in progress, or null once the campaign is finished. */
export function currentMission(c: Campaign): Mission | null {
  return c.currentIndex < c.missions.length ? c.missions[c.currentIndex] : null;
}

/** Whether every mission in the campaign has been completed. */
export function isCampaignComplete(c: Campaign): boolean {
  return c.currentIndex >= c.missions.length;
}

/**
 * Write an advanced version of the current mission back into the campaign,
 * stepping to the next mission when that one is complete. Pure: returns a new
 * campaign. A no-op once the campaign is finished.
 */
export function updateCampaign(c: Campaign, mission: Mission): Campaign {
  if (c.currentIndex >= c.missions.length) return c;
  const missions = c.missions.slice();
  missions[c.currentIndex] = mission;
  const currentIndex = isComplete(mission) ? c.currentIndex + 1 : c.currentIndex;
  return { missions, currentIndex };
}
