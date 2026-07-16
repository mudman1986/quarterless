import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../core/highScore';
import {
  TANGRAM_PROGRESS_KEY,
  getUnlockedTangramLevelIds,
  loadTangramProgress,
  recordTangramLevelCompletion,
  saveTangramProgress,
} from './progress';

function fakeStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

describe('Tangram progress', () => {
  it('round-trips selection, completion, and best results', () => {
    const store = fakeStore();
    const progress = loadTangramProgress(store);
    const recorded = recordTangramLevelCompletion(progress, 'school-gate-morning-run', {
      badgesCollected: 12,
      durationSeconds: 48,
      falls: 2,
    });
    recorded.selectedCharacterId = 'lion';
    saveTangramProgress(recorded, store);

    expect(loadTangramProgress(store)).toEqual({
      version: 1,
      selectedCharacterId: 'lion',
      language: 'nl',
      audioMuted: false,
      reducedMotion: false,
      completedLevelIds: ['school-gate-morning-run'],
      bestByLevel: {
        'school-gate-morning-run': { badgesCollected: 12, durationSeconds: 48, falls: 2 },
      },
    });
  });

  it('rejects malformed storage and keeps the first route available', () => {
    const store = fakeStore();
    store.setItem(TANGRAM_PROGRESS_KEY, '{not-json');
    expect(loadTangramProgress(store).completedLevelIds).toEqual([]);
    expect(getUnlockedTangramLevelIds([])).toEqual(['school-gate-morning-run']);
  });

  it('defaults to Dutch and preserves only supported language choices', () => {
    const store = fakeStore();
    expect(loadTangramProgress(store).language).toBe('nl');
    store.setItem(TANGRAM_PROGRESS_KEY, JSON.stringify({ version: 1, language: 'en' }));
    expect(loadTangramProgress(store).language).toBe('en');
    store.setItem(TANGRAM_PROGRESS_KEY, JSON.stringify({ version: 1, language: 'fr' }));
    expect(loadTangramProgress(store).language).toBe('nl');
  });

  it('normalizes invalid saved entries instead of trusting storage', () => {
    const store = fakeStore();
    store.setItem(
      TANGRAM_PROGRESS_KEY,
      JSON.stringify({
        version: 1,
        selectedCharacterId: 'not-a-character',
        completedLevelIds: ['school-gate-morning-run', 'not-a-level', 'school-gate-morning-run'],
        bestByLevel: { 'school-gate-morning-run': { badgesCollected: 12.9, durationSeconds: 48.8, falls: 2.7 } },
      }),
    );

    expect(loadTangramProgress(store)).toEqual({
      version: 1,
      selectedCharacterId: 'penguin',
      language: 'nl',
      audioMuted: false,
      reducedMotion: false,
      completedLevelIds: ['school-gate-morning-run'],
      bestByLevel: {
        'school-gate-morning-run': { badgesCollected: 12, durationSeconds: 48, falls: 2 },
      },
    });
  });

  it('keeps the strongest result when a later replay is worse', () => {
    const first = recordTangramLevelCompletion(loadTangramProgress(fakeStore()), 'school-gate-morning-run', {
      badgesCollected: 12,
      durationSeconds: 48,
      falls: 1,
    });
    const replay = recordTangramLevelCompletion(first, 'school-gate-morning-run', {
      badgesCollected: 12,
      durationSeconds: 60,
      falls: 3,
    });

    expect(replay.bestByLevel['school-gate-morning-run']).toEqual({
      badgesCollected: 12,
      durationSeconds: 48,
      falls: 1,
    });
  });

});
