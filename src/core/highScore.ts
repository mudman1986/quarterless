/**
 * High-score persistence, decoupled from the browser. Operates on a minimal
 * key/value store (the subset of the Web Storage API we need), so it is fully
 * unit testable with an in-memory fake and wired to `localStorage` in the game.
 */

/** A minimal key/value store: the part of the Web Storage API we use. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** Storage key under which the high score is kept. */
export const HIGH_SCORE_KEY = 'sindicate.highScore';

/** Read the saved high score, returning 0 when missing or malformed. */
export function loadHighScore(store: KeyValueStore, key = HIGH_SCORE_KEY): number {
  const raw = store.getItem(key);
  if (raw === null) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Persist a high score, keeping only the larger of the stored and given values
 * (and never a fraction). Returns the value that is now stored.
 */
export function saveHighScore(store: KeyValueStore, value: number, key = HIGH_SCORE_KEY): number {
  const best = Math.max(loadHighScore(store, key), Math.floor(value));
  store.setItem(key, String(best));
  return best;
}
