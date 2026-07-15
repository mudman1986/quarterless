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
import {
  DEFAULT_TANGRAM_LANGUAGE,
  isTangramLanguage,
  type TangramLanguage,
} from './language';

export const TANGRAM_PROGRESS_KEY = 'penguins-of-tangram.progress';
const PROGRESS_VERSION = 1;

export type TangramLevelBest = {
  badgesCollected: number;
  durationSeconds: number;
  falls: number;
};

export type TangramPlaytestSummary = {
  attempts: number;
  totalDurationSeconds: number;
  totalFalls: number;
  checkpointUses: number;
};

export interface TangramProgress {
  version: 1;
  selectedCharacterId: TangramCharacterId;
  language: TangramLanguage;
  audioMuted: boolean;
  reducedMotion: boolean;
  playtestEnabled: boolean;
  completedLevelIds: TangramLevelId[];
  bestByLevel: Partial<Record<TangramLevelId, TangramLevelBest>>;
  playtestByLevel: Partial<Record<TangramLevelId, TangramPlaytestSummary>>;
}

function isTangramLevelId(value: unknown): value is TangramLevelId {
  return typeof value === 'string' && CAMPAIGN_LEVELS.some((level) => level.id === value);
}

function defaultProgress(): TangramProgress {
  return {
    version: PROGRESS_VERSION,
    selectedCharacterId: DEFAULT_CHARACTER_ID,
    language: DEFAULT_TANGRAM_LANGUAGE,
    audioMuted: false,
    reducedMotion: false,
    playtestEnabled: false,
    completedLevelIds: [],
    bestByLevel: {},
    playtestByLevel: {},
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
    language: isTangramLanguage(candidate.language) ? candidate.language : DEFAULT_TANGRAM_LANGUAGE,
    audioMuted: candidate.audioMuted === true,
    reducedMotion: candidate.reducedMotion === true,
    playtestEnabled: candidate.playtestEnabled === true,
    completedLevelIds: [...new Set(completedLevelIds)],
    bestByLevel,
    playtestByLevel: normalizePlaytestSummaries(candidate.playtestByLevel),
  };
}

function normalizePlaytestSummaries(
  value: unknown,
): Partial<Record<TangramLevelId, TangramPlaytestSummary>> {
  const summaries: Partial<Record<TangramLevelId, TangramPlaytestSummary>> = {};
  if (!value || typeof value !== 'object') return summaries;
  for (const level of CAMPAIGN_LEVELS) {
    const candidate = (value as Record<string, unknown>)[level.id];
    if (!candidate || typeof candidate !== 'object') continue;
    const summary = candidate as Partial<TangramPlaytestSummary>;
    const attempts = Number(summary.attempts);
    const totalDurationSeconds = Number(summary.totalDurationSeconds);
    const totalFalls = Number(summary.totalFalls);
    const checkpointUses = Number(summary.checkpointUses ?? 0);
    if (
      Number.isFinite(attempts) &&
      Number.isFinite(totalDurationSeconds) &&
      Number.isFinite(totalFalls) &&
      Number.isFinite(checkpointUses) &&
      attempts > 0 &&
      totalDurationSeconds >= 0 &&
      totalFalls >= 0 &&
      checkpointUses >= 0
    ) {
      summaries[level.id] = {
        attempts: Math.min(20, Math.floor(attempts)),
        totalDurationSeconds: Math.floor(totalDurationSeconds),
        totalFalls: Math.floor(totalFalls),
        checkpointUses: Math.floor(checkpointUses),
      };
    }
  }
  return summaries;
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

export function resetTangramProgress(store: KeyValueStore = safeStorage()): TangramProgress {
  const progress = defaultProgress();
  saveTangramProgress(progress, store);
  return progress;
}

export function recordTangramPlaytest(
  progress: TangramProgress,
  levelId: TangramLevelId,
  durationSeconds: number,
  falls: number,
  checkpointReached: boolean,
): TangramProgress {
  if (!progress.playtestEnabled) return progress;
  const previous = progress.playtestByLevel[levelId] ?? {
    attempts: 0,
    totalDurationSeconds: 0,
    totalFalls: 0,
    checkpointUses: 0,
  };
  return normalizeProgress({
    ...progress,
    playtestByLevel: {
      ...progress.playtestByLevel,
      [levelId]: {
        attempts: Math.min(20, previous.attempts + 1),
        totalDurationSeconds: previous.totalDurationSeconds + Math.max(0, Math.floor(durationSeconds)),
        totalFalls: previous.totalFalls + Math.max(0, Math.floor(falls)),
        checkpointUses: previous.checkpointUses + (checkpointReached ? 1 : 0),
      },
    },
  });
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
