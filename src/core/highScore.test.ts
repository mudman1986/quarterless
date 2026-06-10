import { describe, it, expect } from 'vitest';
import {
  loadHighScore,
  saveHighScore,
  HIGH_SCORE_KEY,
  type KeyValueStore,
} from './highScore';

/** An in-memory KeyValueStore for deterministic tests. */
const fakeStore = (): KeyValueStore => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
};

describe('loadHighScore', () => {
  it('returns 0 when nothing is stored', () => {
    expect(loadHighScore(fakeStore())).toBe(0);
  });

  it('returns 0 for a malformed value', () => {
    const store = fakeStore();
    store.setItem(HIGH_SCORE_KEY, 'not-a-number');
    expect(loadHighScore(store)).toBe(0);
  });

  it('reads back a stored value', () => {
    const store = fakeStore();
    store.setItem(HIGH_SCORE_KEY, '1234');
    expect(loadHighScore(store)).toBe(1234);
  });
});

describe('saveHighScore', () => {
  it('stores a new high score and reports it', () => {
    const store = fakeStore();
    expect(saveHighScore(store, 500)).toBe(500);
    expect(loadHighScore(store)).toBe(500);
  });

  it('keeps the larger of the stored and the given value', () => {
    const store = fakeStore();
    saveHighScore(store, 500);
    expect(saveHighScore(store, 200)).toBe(500); // lower score does not overwrite
    expect(loadHighScore(store)).toBe(500);
  });

  it('floors fractional values', () => {
    const store = fakeStore();
    saveHighScore(store, 99.9);
    expect(loadHighScore(store)).toBe(99);
  });

  it('round-trips through a custom key', () => {
    const store = fakeStore();
    saveHighScore(store, 42, 'custom');
    expect(loadHighScore(store, 'custom')).toBe(42);
    expect(loadHighScore(store)).toBe(0); // default key untouched
  });
});
