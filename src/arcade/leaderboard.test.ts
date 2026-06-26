import { describe, expect, it } from 'vitest';
import {
  createMemoryStore,
  LEADERBOARD_LIMIT,
  loadLeaderboard,
  qualifiesForLeaderboard,
  saveLeaderboardScore,
} from './leaderboard';

const KEY = 'arcade.test.leaderboard';

describe('loadLeaderboard', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(loadLeaderboard(createMemoryStore(), KEY)).toEqual([]);
  });

  it('ignores malformed stored values', () => {
    const store = createMemoryStore();
    store.setItem(KEY, '{bad json');
    expect(loadLeaderboard(store, KEY)).toEqual([]);
  });
});

describe('saveLeaderboardScore', () => {
  it('stores entries sorted by score and recency', () => {
    const store = createMemoryStore();
    saveLeaderboardScore(store, KEY, 120, 'Ada', 10, 1000);
    saveLeaderboardScore(store, KEY, 180, 'Bea', 10, 1001);
    saveLeaderboardScore(store, KEY, 180, 'Cy', 10, 1002);

    expect(loadLeaderboard(store, KEY)).toEqual([
      { name: 'Cy', score: 180, achievedAt: 1002 },
      { name: 'Bea', score: 180, achievedAt: 1001 },
      { name: 'Ada', score: 120, achievedAt: 1000 },
    ]);
  });

  it('keeps only the best ten entries', () => {
    const store = createMemoryStore();
    for (let index = 0; index < LEADERBOARD_LIMIT + 2; index++) {
      saveLeaderboardScore(store, KEY, index, `P${index}`, LEADERBOARD_LIMIT, 1000 + index);
    }

    const board = loadLeaderboard(store, KEY);
    expect(board).toHaveLength(LEADERBOARD_LIMIT);
    expect(board[0]?.score).toBe(11);
    expect(board.at(-1)?.score).toBe(2);
  });
});

describe('qualifiesForLeaderboard', () => {
  it('accepts any score while the table has space', () => {
    expect(qualifiesForLeaderboard([], 0)).toBe(true);
  });

  it('requires beating or matching the current floor when full', () => {
    const store = createMemoryStore();
    for (let index = 0; index < LEADERBOARD_LIMIT; index++) {
      saveLeaderboardScore(store, KEY, 100 - index, `P${index}`, LEADERBOARD_LIMIT, 1000 + index);
    }
    const board = loadLeaderboard(store, KEY);

    expect(qualifiesForLeaderboard(board, 91)).toBe(true);
    expect(qualifiesForLeaderboard(board, 90)).toBe(false);
    expect(qualifiesForLeaderboard(board, 89)).toBe(false);
  });
});