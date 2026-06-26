import type { KeyValueStore } from '../core/highScore';

export interface LeaderboardEntry {
  name: string;
  score: number;
  achievedAt: number;
}

export const LEADERBOARD_LIMIT = 10;

const DEFAULT_NAME = 'YOU';
const fallbackStore = createMemoryStore();

function normalizeEntry(entry: Partial<LeaderboardEntry>): LeaderboardEntry | null {
  const score = Math.max(0, Math.floor(Number(entry.score)));
  const achievedAt = Math.floor(Number(entry.achievedAt));
  if (!Number.isFinite(score) || !Number.isFinite(achievedAt) || achievedAt <= 0) return null;
  return {
    name: normalizeName(entry.name),
    score,
    achievedAt,
  };
}

function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.score - a.score || b.achievedAt - a.achievedAt;
}

function normalizeName(name: unknown): string {
  if (typeof name !== 'string') return DEFAULT_NAME;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed.slice(0, 16) || DEFAULT_NAME;
}

export function createMemoryStore(): KeyValueStore {
  const mem = new Map<string, string>();
  return {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => void mem.set(key, value),
    removeItem: (key) => void mem.delete(key),
  };
}

export function safeStorage(): KeyValueStore {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* blocked storage: use memory fallback */
  }
  return fallbackStore;
}

export function loadLeaderboard(
  store: KeyValueStore,
  key: string,
  limit = LEADERBOARD_LIMIT,
): LeaderboardEntry[] {
  const raw = store.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (entry && typeof entry === 'object' ? normalizeEntry(entry) : null))
      .filter((entry): entry is LeaderboardEntry => entry !== null)
      .sort(compareEntries)
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function qualifiesForLeaderboard(
  entries: readonly LeaderboardEntry[],
  score: number,
  limit = LEADERBOARD_LIMIT,
): boolean {
  const normalizedScore = Math.max(0, Math.floor(score));
  if (entries.length < limit) return true;
  const floor = entries.at(limit - 1);
  return floor ? normalizedScore >= floor.score : true;
}

export function saveLeaderboardScore(
  store: KeyValueStore,
  key: string,
  score: number,
  name: string,
  limit = LEADERBOARD_LIMIT,
  achievedAt = Date.now(),
): LeaderboardEntry[] {
  const next = [
    ...loadLeaderboard(store, key, limit),
    {
      name: normalizeName(name),
      score: Math.max(0, Math.floor(score)),
      achievedAt: Math.max(1, Math.floor(achievedAt)),
    },
  ]
    .sort(compareEntries)
    .slice(0, limit);
  store.setItem(key, JSON.stringify(next));
  return next;
}