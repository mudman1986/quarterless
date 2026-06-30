import type { KeyValueStore } from '../../core/highScore';

export const STORY_MISSION_SCORECARDS_KEY = 'sindicate.storyMissionScorecards';
const STORY_MISSION_SCORECARD_LIMIT = 8;

export interface StoryMissionScorecardSnapshot {
  chapterTitle: string;
  missionTitle: string;
  reward: number;
  outcome: string;
  durationSeconds: number;
  collateralText: string;
  unlockText: string;
  nextText: string;
  vehicleConditionText: string;
  serviceLaneText: string;
  factionEffectText: string;
  recordedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isScorecard(value: unknown): value is StoryMissionScorecardSnapshot {
  return (
    isRecord(value) &&
    typeof value.chapterTitle === 'string' &&
    typeof value.missionTitle === 'string' &&
    typeof value.reward === 'number' &&
    typeof value.outcome === 'string' &&
    typeof value.durationSeconds === 'number' &&
    typeof value.collateralText === 'string' &&
    typeof value.unlockText === 'string' &&
    typeof value.nextText === 'string' &&
    typeof value.vehicleConditionText === 'string' &&
    typeof value.serviceLaneText === 'string' &&
    typeof value.factionEffectText === 'string' &&
    typeof value.recordedAt === 'number'
  );
}

export function loadStoryMissionScorecards(
  store: Pick<KeyValueStore, 'getItem'>,
  key = STORY_MISSION_SCORECARDS_KEY,
): StoryMissionScorecardSnapshot[] {
  const raw = store.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isScorecard) : [];
  } catch {
    return [];
  }
}

export function saveStoryMissionScorecards(
  store: Pick<KeyValueStore, 'setItem'>,
  cards: readonly StoryMissionScorecardSnapshot[],
  key = STORY_MISSION_SCORECARDS_KEY,
): void {
  store.setItem(key, JSON.stringify(cards.slice(0, STORY_MISSION_SCORECARD_LIMIT)));
}

export function pushStoryMissionScorecard(
  store: Pick<KeyValueStore, 'getItem' | 'setItem'>,
  card: StoryMissionScorecardSnapshot,
  key = STORY_MISSION_SCORECARDS_KEY,
): void {
  const existing = loadStoryMissionScorecards(store, key);
  saveStoryMissionScorecards(store, [card, ...existing], key);
}
