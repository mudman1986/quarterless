import type { KeyValueStore } from './highScore';
import type { WorldSnapshot } from './world';

export const GAME_STATE_KEY = 'sindicate.gameState';
export const MANUAL_SAVE_KEY = 'sindicate.manualSave';
export const GAME_STATE_VERSION = 1;

export interface GameStateSnapshot {
  version: number;
  world: WorldSnapshot;
  timeOfDay: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function loadGameState(
  store: KeyValueStore,
  key = GAME_STATE_KEY,
): GameStateSnapshot | null {
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.version !== GAME_STATE_VERSION) return null;
    if (!isRecord(parsed.world) || parsed.world.version !== 1) return null;
    const timeOfDay = Number(parsed.timeOfDay);
    if (!Number.isFinite(timeOfDay) || timeOfDay < 0) return null;
    return {
      version: GAME_STATE_VERSION,
      world: parsed.world as unknown as WorldSnapshot,
      timeOfDay,
    };
  } catch {
    return null;
  }
}

export function saveGameState(
  store: KeyValueStore,
  snapshot: Omit<GameStateSnapshot, 'version'>,
  key = GAME_STATE_KEY,
): void {
  store.setItem(
    key,
    JSON.stringify({
      version: GAME_STATE_VERSION,
      world: snapshot.world,
      timeOfDay: snapshot.timeOfDay,
    } satisfies GameStateSnapshot),
  );
}

export function clearGameState(store: KeyValueStore, key = GAME_STATE_KEY): void {
  if (store.removeItem) {
    store.removeItem(key);
    return;
  }
  store.setItem(key, '');
}