import type { KeyValueStore } from '../../core/highScore';
import { safeStorage } from '../../arcade/leaderboard';
import {
  CAMPAIGN_LEVELS,
  FIRST_LEVEL_ID,
  nextTangramLevelId,
  type TangramLevelId,
} from './levels';
import {
  DEFAULT_CHARACTER_ID,
  isTangramCharacterId,
  type TangramCharacterId,
} from './data';

export const TANGRAM_PROGRESS_KEY = 'penguins-of-tangram.progress';
const PROGRESS_VERSION = 1;

export type TangramLevelBest = {
  badgesCollected: number;
  durationSeconds: number;
  falls: number;
};

export interface TangramProgress {
  version: 1;
  selectedCharacterId: TangramCharacterId;
  audioMuted: boolean;
  completedLevelIds: TangramLevelId[];
  bestByLevel: Partial<Record<TangramLevelId, TangramLevelBest>>;
}

function isTangramLevelId(value: unknown): value is TangramLevelId {
  return typeof value === 'string' && CAMPAIGN_LEVELS.some((level) => level.id === value);
}

function defaultProgress(): TangramProgress {
  return {
    version: PROGRESS_VERSION,
    selectedCharacterId: DEFAULT_CHARACTER_ID,
    audioMuted: false,
    completedLevelIds: [],
    bestByLevel: {},
  };
}

function normalizeBest(value: unknown): TangramLevelBest | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TangramLevelBest>;
  const badgesCollected = Number(candidate.badgesCollected);
  const durationSeconds = Number(candidate.durationSeconds);
  const falls = Number(candidate.falls);
  if (
    !Number.isFinite(badgesCollected) ||
    !Number.isFinite(durationSeconds) ||
    !Number.isFinite(falls) ||
    badgesCollected < 0 ||
    durationSeconds < 0 ||
    falls < 0
  ) {
    return null;
  }
  return {
    badgesCollected: Math.floor(badgesCollected),
    durationSeconds: Math.floor(durationSeconds),
    falls: Math.floor(falls),
  };
}

function normalizeProgress(value: unknown): TangramProgress {
  if (!value || typeof value !== 'object') return defaultProgress();
  const candidate = value as Partial<TangramProgress>;
  if (candidate.version !== PROGRESS_VERSION) return defaultProgress();
  const completedLevelIds = Array.isArray(candidate.completedLevelIds)
    ? candidate.completedLevelIds.filter(isTangramLevelId)
    : [];
  const bestByLevel: Partial<Record<TangramLevelId, TangramLevelBest>> = {};
  if (candidate.bestByLevel && typeof candidate.bestByLevel === 'object') {
    for (const level of CAMPAIGN_LEVELS) {
      const best = normalizeBest(candidate.bestByLevel[level.id]);
      if (best) bestByLevel[level.id] = best;
    }
  }
  return {
    version: PROGRESS_VERSION,
    selectedCharacterId:
      typeof candidate.selectedCharacterId === 'string' && isTangramCharacterId(candidate.selectedCharacterId)
        ? candidate.selectedCharacterId
        : DEFAULT_CHARACTER_ID,
    audioMuted: candidate.audioMuted === true,
    completedLevelIds: [...new Set(completedLevelIds)],
    bestByLevel,
  };
}

export function loadTangramProgress(store: KeyValueStore = safeStorage()): TangramProgress {
  const raw = store.getItem(TANGRAM_PROGRESS_KEY);
  if (!raw) return defaultProgress();
  try {
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return defaultProgress();
  }
}

export function saveTangramProgress(progress: TangramProgress, store: KeyValueStore = safeStorage()): void {
  store.setItem(TANGRAM_PROGRESS_KEY, JSON.stringify(normalizeProgress(progress)));
}

export function getUnlockedTangramLevelIds(completedLevelIds: readonly TangramLevelId[]): TangramLevelId[] {
  const unlocked = new Set<TangramLevelId>([FIRST_LEVEL_ID]);
  for (const levelId of completedLevelIds) {
    const nextLevelId = nextTangramLevelId(levelId);
    if (nextLevelId) unlocked.add(nextLevelId);
  }
  return CAMPAIGN_LEVELS.filter((level) => unlocked.has(level.id)).map((level) => level.id);
}

export function recordTangramLevelCompletion(
  progress: TangramProgress,
  levelId: TangramLevelId,
  best: TangramLevelBest,
): TangramProgress {
  const previous = progress.bestByLevel[levelId];
  const isBetter =
    !previous ||
    best.badgesCollected > previous.badgesCollected ||
    (best.badgesCollected === previous.badgesCollected &&
      (best.falls < previous.falls ||
        (best.falls === previous.falls && best.durationSeconds < previous.durationSeconds)));
  const next: TangramProgress = {
    ...progress,
    completedLevelIds: progress.completedLevelIds.includes(levelId)
      ? [...progress.completedLevelIds]
      : [...progress.completedLevelIds, levelId],
    bestByLevel: isBetter
      ? { ...progress.bestByLevel, [levelId]: normalizeBest(best) ?? best }
      : { ...progress.bestByLevel },
  };
  return normalizeProgress(next);
}
