import type { StoryProgressSnapshot } from './storyProgress';

export const STORY_LAUNCH_REQUEST_KEY = 'sindicate.storyLaunchRequest';

export interface StoryLaunchRequest {
  mode?: 'sandbox' | 'story';
  loadSaveKey?: string | null;
  skipResume?: boolean;
  storyProgress?: StoryProgressSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStoryProgressSnapshot(value: unknown): value is StoryProgressSnapshot | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return typeof value.storyId === 'string' && Array.isArray(value.unlockedChapterIds) && Array.isArray(value.completedChapterIds);
}

export function saveStoryLaunchRequest(store: Storage, request: StoryLaunchRequest): void {
  store.setItem(STORY_LAUNCH_REQUEST_KEY, JSON.stringify(request));
}

export function loadStoryLaunchRequest(store: Storage): StoryLaunchRequest | null {
  const raw = store.getItem(STORY_LAUNCH_REQUEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.mode !== undefined && parsed.mode !== 'sandbox' && parsed.mode !== 'story') return null;
    if (parsed.loadSaveKey !== undefined && parsed.loadSaveKey !== null && typeof parsed.loadSaveKey !== 'string') return null;
    if (parsed.skipResume !== undefined && typeof parsed.skipResume !== 'boolean') return null;
    if (!isStoryProgressSnapshot(parsed.storyProgress)) return null;
    return {
      mode: parsed.mode,
      loadSaveKey: parsed.loadSaveKey ?? undefined,
      skipResume: parsed.skipResume,
      storyProgress: parsed.storyProgress ?? null,
    };
  } catch {
    return null;
  }
}

export function clearStoryLaunchRequest(store: Storage): void {
  store.removeItem(STORY_LAUNCH_REQUEST_KEY);
}