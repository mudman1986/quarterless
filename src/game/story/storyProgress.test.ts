import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../core/highScore';
import { DEAD_DROP_DISTRICT } from './deadDropDistrict';
import {
  clearStoryProgress,
  completeStoryMission,
  createStoryProgress,
  currentStoryMission,
  loadStoryProgress,
  recordBranchOutcome,
  saveStoryProgress,
  selectStoryChapter,
  setStoryObjectiveIndex,
  STORY_PROGRESS_KEY,
  storyChapterById,
  type StoryProgressSnapshot,
} from './storyProgress';
import type { StoryMode } from './storyMode';

function fakeStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function fiveMissionChapter(id: string, actId: string, order: number) {
  return {
    id,
    actId,
    order,
    title: id,
    storyRole: `${id} role`,
    combinedGoal: `${id} goal`,
    missions: Array.from({ length: 5 }, (_, index) => ({
      id: `${id}-m${index + 1}`,
      title: `${id} mission ${index + 1}`,
      hook: 'Hook',
      primaryGoal: 'Goal',
      secondaryPressure: 'Pressure',
      failureState: 'Failure',
      payoff: 'Payoff',
    })),
  };
}

const TWO_CHAPTER_STORY: StoryMode = {
  id: 'test-story',
  title: 'Test Story',
  premise: 'Premise',
  acts: [
    {
      id: 'act-1',
      order: 1,
      title: 'Act 1',
      summary: 'Summary',
      chapters: [fiveMissionChapter('chapter-1', 'act-1', 1), fiveMissionChapter('chapter-2', 'act-1', 2)],
    },
  ],
};

describe('createStoryProgress', () => {
  it('starts on the first mission of the first chapter and unlocks only that chapter', () => {
    const progress = createStoryProgress(TWO_CHAPTER_STORY);

    expect(progress.current).toEqual({
      actId: 'act-1',
      chapterId: 'chapter-1',
      missionId: 'chapter-1-m1',
      objectiveIndex: 0,
    });
    expect(progress.unlockedChapterIds).toEqual(['chapter-1']);
    expect(progress.completedChapterIds).toEqual([]);
  });
});

describe('completeStoryMission', () => {
  it('advances to the next mission inside the current chapter', () => {
    const progress = completeStoryMission(TWO_CHAPTER_STORY, createStoryProgress(TWO_CHAPTER_STORY));

    expect(progress.current?.missionId).toBe('chapter-1-m2');
    expect(progress.completedMissionIds).toEqual(['chapter-1-m1']);
  });

  it('unlocks the next chapter after the chapter finale', () => {
    let progress = createStoryProgress(TWO_CHAPTER_STORY);
    for (let i = 0; i < 5; i++) progress = completeStoryMission(TWO_CHAPTER_STORY, progress);

    expect(progress.completedChapterIds).toEqual(['chapter-1']);
    expect(progress.unlockedChapterIds).toEqual(['chapter-1', 'chapter-2']);
    expect(progress.current?.chapterId).toBe('chapter-2');
    expect(progress.current?.missionId).toBe('chapter-2-m1');
  });

  it('marks the story finished after the final mission', () => {
    let progress = createStoryProgress(TWO_CHAPTER_STORY);
    for (let i = 0; i < 10; i++) progress = completeStoryMission(TWO_CHAPTER_STORY, progress);

    expect(progress.current).toBeNull();
    expect(progress.completedChapterIds).toEqual(['chapter-1', 'chapter-2']);
  });
});

describe('story progress helpers', () => {
  it('updates objective index and branch outcomes without losing the current cursor', () => {
    const branched = recordBranchOutcome(
      setStoryObjectiveIndex(createStoryProgress(TWO_CHAPTER_STORY), 3),
      'double-booking',
      'save-passenger-a',
    );

    expect(branched.current?.objectiveIndex).toBe(3);
    expect(branched.branchOutcomes).toEqual({ 'double-booking': 'save-passenger-a' });
  });

  it('lets unlocked chapters be selected and rejects locked ones', () => {
    let progress = createStoryProgress(TWO_CHAPTER_STORY);
    const lockedAttempt = selectStoryChapter(TWO_CHAPTER_STORY, progress, 'chapter-2');
    expect(lockedAttempt).toBe(progress);

    for (let i = 0; i < 5; i++) progress = completeStoryMission(TWO_CHAPTER_STORY, progress);
    const selected = selectStoryChapter(TWO_CHAPTER_STORY, progress, 'chapter-1');

    expect(selected.current?.chapterId).toBe('chapter-1');
    expect(selected.current?.missionId).toBe('chapter-1-m1');
  });

  it('resolves the current authored mission against the story data', () => {
    const progress = createStoryProgress({
      ...TWO_CHAPTER_STORY,
      acts: [{ ...TWO_CHAPTER_STORY.acts[0], chapters: [DEAD_DROP_DISTRICT, fiveMissionChapter('chapter-2', 'act-1', 2)] }],
    });

    expect(currentStoryMission({
      ...TWO_CHAPTER_STORY,
      acts: [{ ...TWO_CHAPTER_STORY.acts[0], chapters: [DEAD_DROP_DISTRICT, fiveMissionChapter('chapter-2', 'act-1', 2)] }],
    }, progress)?.id).toBe('night-ferry-run');
    expect(storyChapterById(TWO_CHAPTER_STORY, 'chapter-1')?.id).toBe('chapter-1');
  });
});

describe('story progress persistence', () => {
  it('round-trips a saved snapshot', () => {
    const store = fakeStore();
    const progress = recordBranchOutcome(
      setStoryObjectiveIndex(createStoryProgress(TWO_CHAPTER_STORY), 2),
      'branch-a',
      'outcome-b',
    );

    saveStoryProgress(store, {
      storyId: progress.storyId,
      current: progress.current,
      unlockedChapterIds: progress.unlockedChapterIds,
      completedChapterIds: progress.completedChapterIds,
      completedMissionIds: progress.completedMissionIds,
      branchOutcomes: progress.branchOutcomes,
    });

    expect(loadStoryProgress(store)).toEqual({
      version: 1,
      storyId: 'test-story',
      current: progress.current,
      unlockedChapterIds: ['chapter-1'],
      completedChapterIds: [],
      completedMissionIds: [],
      branchOutcomes: { 'branch-a': 'outcome-b' },
    });
  });

  it('returns null for malformed saves and clears stored progress', () => {
    const store = fakeStore();
    store.setItem(STORY_PROGRESS_KEY, '{bad json');
    expect(loadStoryProgress(store)).toBeNull();

    const validStore = fakeStore();
    const progress: StoryProgressSnapshot = createStoryProgress(TWO_CHAPTER_STORY);
    saveStoryProgress(validStore, {
      storyId: progress.storyId,
      current: progress.current,
      unlockedChapterIds: progress.unlockedChapterIds,
      completedChapterIds: progress.completedChapterIds,
      completedMissionIds: progress.completedMissionIds,
      branchOutcomes: progress.branchOutcomes,
    });
    clearStoryProgress(validStore);
    expect(loadStoryProgress(validStore)).toBeNull();
  });
});