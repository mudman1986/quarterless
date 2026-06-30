import { GAME_STATE_KEY } from '../../core/gameState';
import type { KeyValueStore } from '../../core/highScore';
import {
  STORY_MISSION_GROUP_SELECTION_INDEX,
  resolveStoryMissionPlan,
  storyChapterPendingMissionGroup,
  storyMissionGroupObjectiveIndex,
  storyMissionInitialObjectiveIndex,
  type StoryChapter,
  type StoryMissionPlan,
  type StoryMode,
} from './storyMode';

export const STORY_PROGRESS_KEY = 'sindicate.storyProgress';
export const STORY_PROGRESS_VERSION = 1;
export const STORY_LAUNCH_PROGRESS_KEY = 'sindicate.launchStoryProgress';

export function storyProgressSaveKey(gameSaveKey = GAME_STATE_KEY): string {
  return gameSaveKey === GAME_STATE_KEY ? STORY_PROGRESS_KEY : `${gameSaveKey}.storyProgress`;
}

export interface StoryCursor {
  actId: string;
  chapterId: string;
  missionId: string;
  objectiveIndex: number;
}

export interface StoryProgressSnapshot {
  version: number;
  storyId: string;
  current: StoryCursor | null;
  unlockedChapterIds: string[];
  completedChapterIds: string[];
  completedMissionIds: string[];
  branchOutcomes: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function orderedChapters(story: StoryMode): StoryChapter[] {
  return story.acts.flatMap((act) => act.chapters);
}

function firstChapter(story: StoryMode): StoryChapter {
  const chapter = orderedChapters(story)[0];
  if (!chapter) throw new Error(`Story "${story.id}" has no chapters`);
  return chapter;
}

function firstMission(chapter: StoryChapter): StoryMissionPlan {
  const mission = chapter.missions[0];
  if (!mission) throw new Error(`Chapter "${chapter.id}" has no missions`);
  return mission;
}

export function storyChapterById(story: StoryMode, chapterId: string): StoryChapter | null {
  return orderedChapters(story).find((chapter) => chapter.id === chapterId) ?? null;
}

export function storyMissionById(chapter: StoryChapter, missionId: string): StoryMissionPlan | null {
  return chapter.missions.find((mission) => mission.id === missionId) ?? null;
}

function nextChapterAfter(story: StoryMode, chapterId: string): StoryChapter | null {
  const chapters = orderedChapters(story);
  const index = chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index === -1) return null;
  return chapters[index + 1] ?? null;
}

function cloneBranchOutcomes(branchOutcomes: Record<string, string>): Record<string, string> {
  return { ...branchOutcomes };
}

function cursorForPendingGroup(
  chapter: StoryChapter,
  pending: readonly StoryMissionPlan[],
  branchOutcomes: Record<string, string> = {},
): StoryCursor {
  const mission = pending[0];
  if (!mission) throw new Error(`Chapter "${chapter.id}" has no pending missions`);
  const resolvedMission = resolveStoryMissionPlan(mission, branchOutcomes);
  return {
    actId: chapter.actId,
    chapterId: chapter.id,
    missionId: resolvedMission.id,
    objectiveIndex: storyMissionGroupObjectiveIndex(resolvedMission, pending.length),
  };
}

function initialCursor(story: StoryMode): StoryCursor {
  const chapter = firstChapter(story);
  const pending = storyChapterPendingMissionGroup(chapter, []);
  if (!pending) throw new Error(`Chapter "${chapter.id}" has no pending missions`);
  return cursorForPendingGroup(chapter, pending);
}

export function createStoryProgress(story: StoryMode): StoryProgressSnapshot {
  const chapter = firstChapter(story);
  return {
    version: STORY_PROGRESS_VERSION,
    storyId: story.id,
    current: initialCursor(story),
    unlockedChapterIds: [chapter.id],
    completedChapterIds: [],
    completedMissionIds: [],
    branchOutcomes: {},
  };
}

export function currentStoryChapter(
  story: StoryMode,
  progress: Pick<StoryProgressSnapshot, 'storyId' | 'current'>,
): StoryChapter | null {
  if (progress.storyId !== story.id || !progress.current) return null;
  return storyChapterById(story, progress.current.chapterId);
}

export function currentStoryMission(
  story: StoryMode,
  progress: Pick<StoryProgressSnapshot, 'storyId' | 'current'> & Partial<Pick<StoryProgressSnapshot, 'branchOutcomes'>>,
): StoryMissionPlan | null {
  const chapter = currentStoryChapter(story, progress);
  if (!chapter || !progress.current) return null;
  const mission = storyMissionById(chapter, progress.current.missionId);
  return mission ? resolveStoryMissionPlan(mission, progress.branchOutcomes ?? {}) : null;
}

export function currentStoryMissionChoices(
  story: StoryMode,
  progress: Pick<StoryProgressSnapshot, 'storyId' | 'current' | 'completedMissionIds'> & Partial<Pick<StoryProgressSnapshot, 'branchOutcomes'>>,
): StoryMissionPlan[] {
  if (!progress.current || progress.storyId !== story.id) return [];
  const chapter = currentStoryChapter(story, progress);
  if (!chapter || progress.current.objectiveIndex !== STORY_MISSION_GROUP_SELECTION_INDEX) return [];
  return (storyChapterPendingMissionGroup(chapter, progress.completedMissionIds) ?? []).map((mission) =>
    resolveStoryMissionPlan(mission, progress.branchOutcomes ?? {}),
  );
}

export function isChapterUnlocked(progress: StoryProgressSnapshot, chapterId: string): boolean {
  return progress.unlockedChapterIds.includes(chapterId);
}

export function setStoryObjectiveIndex(
  progress: StoryProgressSnapshot,
  objectiveIndex: number,
): StoryProgressSnapshot {
  if (!progress.current) return progress;
  return {
    ...progress,
    current: {
      ...progress.current,
      objectiveIndex: Math.max(STORY_MISSION_GROUP_SELECTION_INDEX, Math.floor(objectiveIndex) || 0),
    },
  };
}

export function recordBranchOutcome(
  progress: StoryProgressSnapshot,
  branchId: string,
  outcomeId: string,
): StoryProgressSnapshot {
  return {
    ...progress,
    branchOutcomes: { ...progress.branchOutcomes, [branchId]: outcomeId },
  };
}

export function selectStoryChapter(
  story: StoryMode,
  progress: StoryProgressSnapshot,
  chapterId: string,
): StoryProgressSnapshot {
  if (!isChapterUnlocked(progress, chapterId)) return progress;
  const chapter = storyChapterById(story, chapterId);
  if (!chapter) return progress;
  return {
    ...progress,
    current: cursorForPendingGroup(
      chapter,
      storyChapterPendingMissionGroup(chapter, progress.completedMissionIds) ?? [firstMission(chapter)],
      progress.branchOutcomes,
    ),
  };
}

export function selectStoryMission(
  story: StoryMode,
  progress: StoryProgressSnapshot,
  missionId: string,
): StoryProgressSnapshot {
  if (!progress.current || progress.storyId !== story.id) return progress;
  const chapter = currentStoryChapter(story, progress);
  if (!chapter) return progress;
  const pending = storyChapterPendingMissionGroup(chapter, progress.completedMissionIds) ?? [];
  const mission = pending.find((candidate) => candidate.id === missionId);
  if (!mission) return progress;
  const branchOutcomes = mission.branchOutcome
    ? { ...progress.branchOutcomes, [mission.branchOutcome.branchId]: mission.branchOutcome.outcomeId }
    : progress.branchOutcomes;
  const resolvedMission = resolveStoryMissionPlan(mission, branchOutcomes);
  return {
    ...progress,
    branchOutcomes,
    current: {
      actId: chapter.actId,
      chapterId: chapter.id,
      missionId: resolvedMission.id,
      objectiveIndex: storyMissionInitialObjectiveIndex(resolvedMission),
    },
  };
}

export function completeStoryMission(
  story: StoryMode,
  progress: StoryProgressSnapshot,
  missionId = progress.current?.missionId,
): StoryProgressSnapshot {
  if (!progress.current || !missionId) return progress;
  if (progress.storyId !== story.id) return progress;

  const chapter = currentStoryChapter(story, progress);
  if (!chapter || progress.current.chapterId !== chapter.id) return progress;
  if (progress.current.missionId !== missionId) return progress;

  const missionIndex = chapter.missions.findIndex((mission) => mission.id === missionId);
  if (missionIndex === -1) return progress;

  const completedMissionIds = unique([...progress.completedMissionIds, missionId]);
  const pendingGroup = storyChapterPendingMissionGroup(chapter, completedMissionIds);
  if (pendingGroup) {
    return {
      ...progress,
      completedMissionIds,
      current: cursorForPendingGroup(chapter, pendingGroup, progress.branchOutcomes),
    };
  }

  const completedChapterIds = unique([...progress.completedChapterIds, chapter.id]);
  const nextChapter = nextChapterAfter(story, chapter.id);
  if (!nextChapter) {
    return {
      ...progress,
      completedMissionIds,
      completedChapterIds,
      current: null,
    };
  }

  const firstNextMission = firstMission(nextChapter);
  const nextPendingGroup = storyChapterPendingMissionGroup(nextChapter, completedMissionIds) ?? [firstNextMission];
  return {
    ...progress,
    completedMissionIds,
    completedChapterIds,
    unlockedChapterIds: unique([...progress.unlockedChapterIds, nextChapter.id]),
    current: cursorForPendingGroup(nextChapter, nextPendingGroup, progress.branchOutcomes),
  };
}

export function saveStoryProgress(
  store: KeyValueStore,
  snapshot: Omit<StoryProgressSnapshot, 'version'>,
  key = STORY_PROGRESS_KEY,
): void {
  store.setItem(
    key,
    JSON.stringify({
      version: STORY_PROGRESS_VERSION,
      storyId: snapshot.storyId,
      current: snapshot.current,
      unlockedChapterIds: snapshot.unlockedChapterIds,
      completedChapterIds: snapshot.completedChapterIds,
      completedMissionIds: snapshot.completedMissionIds,
      branchOutcomes: snapshot.branchOutcomes,
    } satisfies StoryProgressSnapshot),
  );
}

function parseStoryCursor(value: unknown): StoryCursor | null {
  if (value === null) return null;
  if (!isRecord(value)) return null;
  const actId = typeof value.actId === 'string' ? value.actId : null;
  const chapterId = typeof value.chapterId === 'string' ? value.chapterId : null;
  const missionId = typeof value.missionId === 'string' ? value.missionId : null;
  const objectiveIndex = Number(value.objectiveIndex);
  if (!actId || !chapterId || !missionId) return null;
  if (!Number.isFinite(objectiveIndex) || objectiveIndex < STORY_MISSION_GROUP_SELECTION_INDEX) return null;
  return {
    actId,
    chapterId,
    missionId,
    objectiveIndex: Math.floor(objectiveIndex),
  };
}

function parseBranchOutcomes(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, outcome]) => typeof outcome !== 'string')) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

export function loadStoryProgress(
  store: KeyValueStore,
  key = STORY_PROGRESS_KEY,
): StoryProgressSnapshot | null {
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.version !== STORY_PROGRESS_VERSION) return null;
    if (typeof parsed.storyId !== 'string' || !parsed.storyId) return null;
    if (!isStringArray(parsed.unlockedChapterIds)) return null;
    if (!isStringArray(parsed.completedChapterIds)) return null;
    if (!isStringArray(parsed.completedMissionIds)) return null;
    const current = parseStoryCursor(parsed.current);
    if (parsed.current !== null && !current) return null;
    const branchOutcomes = parseBranchOutcomes(parsed.branchOutcomes);
    if (!branchOutcomes) return null;
    return {
      version: STORY_PROGRESS_VERSION,
      storyId: parsed.storyId,
      current,
      unlockedChapterIds: unique(parsed.unlockedChapterIds),
      completedChapterIds: unique(parsed.completedChapterIds),
      completedMissionIds: unique(parsed.completedMissionIds),
      branchOutcomes: cloneBranchOutcomes(branchOutcomes),
    };
  } catch {
    return null;
  }
}

export function clearStoryProgress(store: KeyValueStore, key = STORY_PROGRESS_KEY): void {
  if (store.removeItem) {
    store.removeItem(key);
    return;
  }
  store.setItem(key, '');
}