import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../core/highScore';
import {
  TANGRAM_PROGRESS_KEY,
  getUnlockedTangramLevelIds,
  loadTangramProgress,
  recordTangramPlaytest,
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
      audioMuted: false,
      reducedMotion: false,
      playtestEnabled: false,
      completedLevelIds: ['school-gate-morning-run'],
      bestByLevel: {
        'school-gate-morning-run': { badgesCollected: 12, durationSeconds: 48, falls: 2 },
      },
      playtestByLevel: {},
    });
  });

  it('rejects malformed storage and keeps the first route available', () => {
    const store = fakeStore();
    store.setItem(TANGRAM_PROGRESS_KEY, '{not-json');
    expect(loadTangramProgress(store).completedLevelIds).toEqual([]);
    expect(getUnlockedTangramLevelIds([])).toEqual(['school-gate-morning-run']);
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
      audioMuted: false,
      reducedMotion: false,
      playtestEnabled: false,
      completedLevelIds: ['school-gate-morning-run'],
      bestByLevel: {
        'school-gate-morning-run': { badgesCollected: 12, durationSeconds: 48, falls: 2 },
      },
      playtestByLevel: {},
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

  it('keeps local playtest notes opt-in and bounded', () => {
    const progress = {
      ...loadTangramProgress(fakeStore()),
      playtestEnabled: true,
    };
    const recorded = recordTangramPlaytest(progress, 'school-gate-morning-run', 48.8, 2.7, true);
    expect(recorded.playtestByLevel['school-gate-morning-run']).toEqual({
      attempts: 1,
      totalDurationSeconds: 48,
      totalFalls: 2,
      checkpointUses: 1,
    });
    expect(recordTangramPlaytest({ ...progress, playtestEnabled: false }, 'school-gate-morning-run', 10, 1, false))
      .toEqual({ ...progress, playtestEnabled: false });
  });

  it('keeps older local playtest notes when checkpoint counts are absent', () => {
    const store = fakeStore();
    store.setItem(TANGRAM_PROGRESS_KEY, JSON.stringify({
      version: 1,
      selectedCharacterId: 'penguin',
      audioMuted: false,
      reducedMotion: false,
      playtestEnabled: true,
      completedLevelIds: [],
      bestByLevel: {},
      playtestByLevel: {
        'school-gate-morning-run': { attempts: 2, totalDurationSeconds: 80, totalFalls: 1 },
      },
    }));
    expect(loadTangramProgress(store).playtestByLevel['school-gate-morning-run']).toEqual({
      attempts: 2,
      totalDurationSeconds: 80,
      totalFalls: 1,
      checkpointUses: 0,
    });
  });
});
