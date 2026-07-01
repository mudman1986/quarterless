import type { KeyValueStore } from './highScore';
import type { WorldSnapshot } from './world';

export const GAME_STATE_KEY = 'sindicate.gameState';
export const MANUAL_SAVE_KEY = 'sindicate.manualSave';
export const MANUAL_SAVE_SLOT_COUNT = 3;
export const GAME_STATE_VERSION = 1;

export interface GameStateSnapshot {
  version: number;
  world: WorldSnapshot;
  timeOfDay: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A migration transforms a saved snapshot shaped for `fromVersion` into the shape expected by
 * `fromVersion + 1`. Callers should not bump the returned `version` field themselves; the
 * migration runner in `migrateGameStateData` does that. */
export type GameStateMigration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registry of migrations keyed by the saved version they upgrade *from*. Empty today because
 * `GAME_STATE_VERSION` has never changed. When it increments, add the old version's key here
 * with a function that fills in / renames whatever fields changed, instead of letting
 * `loadGameState` silently discard every save with an older version number.
 */
export const GAME_STATE_MIGRATIONS: Readonly<Record<number, GameStateMigration>> = {};

/**
 * Walk `data.version` forward to `targetVersion` by repeatedly applying the registered migration
 * for its current version. Returns `null` if the version is missing/non-numeric, already newer
 * than `targetVersion`, or there is no migration registered to advance it further.
 */
export function migrateGameStateData(
  data: Record<string, unknown>,
  migrations: Readonly<Record<number, GameStateMigration>> = GAME_STATE_MIGRATIONS,
  targetVersion = GAME_STATE_VERSION,
): Record<string, unknown> | null {
  let version = Number(data.version);
  if (!Number.isFinite(version) || version > targetVersion) return null;
  let migrated = data;
  while (version < targetVersion) {
    const migrate = migrations[version];
    if (!migrate) return null;
    migrated = { ...migrate(migrated), version: version + 1 };
    version += 1;
  }
  return migrated;
}

export function manualSaveKey(slot: number): string {
  const normalized = Math.max(1, Math.min(MANUAL_SAVE_SLOT_COUNT, Math.floor(slot) || 1));
  return normalized === 1 ? MANUAL_SAVE_KEY : `${MANUAL_SAVE_KEY}.${normalized}`;
}

export function loadGameState(
  store: KeyValueStore,
  key = GAME_STATE_KEY,
  migrations: Readonly<Record<number, GameStateMigration>> = GAME_STATE_MIGRATIONS,
): GameStateSnapshot | null {
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const migrated = migrateGameStateData(parsed, migrations);
    if (!migrated) return null;
    if (!isRecord(migrated.world) || migrated.world.version !== 1) return null;
    const timeOfDay = Number(migrated.timeOfDay);
    if (!Number.isFinite(timeOfDay) || timeOfDay < 0) return null;
    return {
      version: GAME_STATE_VERSION,
      world: migrated.world as unknown as WorldSnapshot,
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