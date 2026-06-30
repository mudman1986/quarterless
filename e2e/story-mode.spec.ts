import { test, expect } from '@playwright/test';

const MANUAL_SAVE_KEY = 'sindicate.manualSave';
const UNLOCKED_THROUGH_STATIC_ON_THE_HOSPITAL_BAND = [
  'dead-drop-district',
  'spare-parts-gospel',
  'static-on-the-hospital-band',
] as const;
const UNLOCKED_THROUGH_METER_RUNNING = [
  ...UNLOCKED_THROUGH_STATIC_ON_THE_HOSPITAL_BAND,
  'meter-running',
] as const;
const COMPLETED_THROUGH_WARD_6_EXIT = [
  'night-ferry-run',
  'burned-locker',
  'wreck-before-dawn',
  'false-ambulance',
  'last-call-at-pier-9',
  'yard-talk',
  'hook-chain',
  'the-empty-shell',
  'crusher-feed',
  'towline-oath',
  'cold-intake',
  'flatline-gap',
  'clean-sheets',
  'crash-cart',
] as const;

function storyManualSaveKey(slot: number): string {
  return slot <= 1
    ? `${MANUAL_SAVE_KEY}.storyProgress`
    : `${MANUAL_SAVE_KEY}.${slot}.storyProgress`;
}

async function launchStoryMode(page: import('@playwright/test').Page): Promise<void> {
  await launchStoryModeWithOptions(page, { acknowledgeBrief: true });
}

async function forceStoryChapterCompletion(
  page: import('@playwright/test').Page,
  state: {
    actId: string;
    chapterId: string;
    missionId: string;
    completedMissionIds: string[];
  },
): Promise<void> {
  await page.evaluate(({ actId, chapterId, missionId, completedMissionIds }) => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: { campaign?: { missions: Array<unknown>; currentIndex: number } | null };
      storyProgress?: {
        current: {
          actId: string;
          missionId: string;
          chapterId: string;
          objectiveIndex: number;
        } | null;
        completedMissionIds: string[];
      };
      prevMissionId?: string | null;
      prevMissionComplete?: boolean;
      pendingStoryRestart?: unknown;
      handleEvents?: () => void;
      scene: { restart(data: unknown): void };
    };
    if (
      !scene?.world?.campaign ||
      !scene.storyProgress ||
      typeof scene.handleEvents !== 'function'
    ) {
      throw new Error('Missing chapter completion hooks');
    }

    scene.storyProgress.current = {
      actId,
      chapterId,
      missionId,
      objectiveIndex: 0,
    };
    scene.storyProgress.completedMissionIds = completedMissionIds;
    scene.prevMissionId = missionId;
    scene.prevMissionComplete = false;
    scene.world.campaign.currentIndex = scene.world.campaign.missions.length;
    scene.handleEvents();
    scene.scene.restart({
      skipResume: true,
      mode: 'story',
      storyProgress: scene.pendingStoryRestart,
    });
  }, state);
}

async function restartIntoStoryProgress(
  page: import('@playwright/test').Page,
  storyProgress: unknown,
): Promise<void> {
  await page.evaluate((progress) => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      scene: { restart(data: unknown): void };
    };
    scene?.scene.restart({ skipResume: true, mode: 'story', storyProgress: progress });
  }, storyProgress);
}

async function acknowledgeStoryPanel(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      acknowledgeStoryPanel?: () => void;
    };
    scene?.acknowledgeStoryPanel?.();
  });
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      paused: boolean;
      storyPanel?: { visible: boolean };
    };
    return scene?.paused === false && !scene?.storyPanel?.visible;
  });
}

async function launchStoryModeWithOptions(
  page: import('@playwright/test').Page,
  options: { acknowledgeBrief: boolean },
): Promise<void> {
  await page.goto('/quarterless/');
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Play Sindicate' }).click();
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Start Story|Continue Story|Resume Current Run/ }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#game canvas').click();
  if (options.acknowledgeBrief) await acknowledgeStoryPanel(page);
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    localStorage.removeItem('sindicate.gameState');
    localStorage.removeItem('sindicate.storyProgress');
    localStorage.removeItem('sindicate.manualSave');
    localStorage.removeItem('sindicate.manualSave.storyProgress');
    localStorage.removeItem('sindicate.manualSave.2');
    localStorage.removeItem('sindicate.manualSave.2.storyProgress');
    localStorage.removeItem('sindicate.manualSave.3');
    localStorage.removeItem('sindicate.manualSave.3.storyProgress');
    sessionStorage.removeItem('sindicate.storyLaunchRequest');
  });
});

test('landing page exposes a single Sindicate story entry point', async ({ page }) => {
  await page.goto('/quarterless/');
  await expect(page.getByRole('button', { name: 'Play Sindicate' })).toBeVisible();
});

test('story mode opens a dedicated story menu with chapter select', async ({ page }) => {
  await page.goto('/quarterless/');
  await page.getByRole('button', { name: 'Play Sindicate' }).click();
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dead Drop District/i })).toBeVisible();
  await expect(page.getByLabel('Recap archive')).toBeVisible();
  await expect(page.getByLabel('Find The Missing Dispatcher')).toBeVisible();
  await expect(page.getByLabel("Court The City's Middle Powers")).toBeVisible();
});

test('story menu can launch a later unlocked chapter from a different act', async ({ page }) => {
  await page.goto('/quarterless/');
  await page.evaluate(() => {
    localStorage.setItem(
      'sindicate.storyProgress',
      JSON.stringify({
        version: 1,
        storyId: 'sindicate-story-mode',
        current: {
          actId: 'court-the-citys-middle-powers',
          chapterId: 'freight-union-morning',
          missionId: 'union-test-run',
          objectiveIndex: 0,
        },
        unlockedChapterIds: [
          'dead-drop-district',
          'spare-parts-gospel',
          'static-on-the-hospital-band',
          'meter-running',
          'precinct-ashes',
          'the-switchboard-name',
          'freight-union-morning',
        ],
        completedChapterIds: [
          'dead-drop-district',
          'spare-parts-gospel',
          'static-on-the-hospital-band',
          'meter-running',
          'precinct-ashes',
          'the-switchboard-name',
        ],
        completedMissionIds: [],
        branchOutcomes: {},
      }),
    );
  });
  await page.getByRole('button', { name: 'Play Sindicate' }).click();
  await page.getByRole('button', { name: /Freight Union Morning/i }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: { current: { chapterId: string; missionId: string } | null };
    };
    return (
      scene?.storyProgress?.current?.chapterId === 'freight-union-morning' &&
      scene?.storyProgress?.current?.missionId === 'union-test-run'
    );
  });
});

test('story mode boots and restores saved story progress after refresh', async ({ page }) => {
  await launchStoryMode(page);
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: { current: { chapterId: string } | null };
    };
    return scene?.storyProgress?.current?.chapterId === 'dead-drop-district';
  });

  const beforeRefresh = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: { mission?: { id: string; currentIndex: number } | null };
    };
    const raw = localStorage.getItem('sindicate.storyProgress');
    return {
      missionId: scene?.world.mission?.id ?? null,
      objectiveIndex: scene?.world.mission?.currentIndex ?? null,
      save: raw ? JSON.parse(raw) : null,
    };
  });

  expect(beforeRefresh.save?.storyId).toBe('sindicate-story-mode');
  expect(beforeRefresh.save?.current?.chapterId).toBe('dead-drop-district');
  expect(beforeRefresh.missionId).toBeTruthy();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible();
  await launchStoryMode(page);

  const afterRefresh = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: { mission?: { id: string; currentIndex: number } | null };
    };
    const raw = localStorage.getItem('sindicate.storyProgress');
    return {
      missionId: scene?.world.mission?.id ?? null,
      objectiveIndex: scene?.world.mission?.currentIndex ?? null,
      save: raw ? JSON.parse(raw) : null,
    };
  });

  expect(afterRefresh.save?.storyId).toBe('sindicate-story-mode');
  expect(afterRefresh.save?.current?.chapterId).toBe('dead-drop-district');
  expect(afterRefresh.missionId).toBe(beforeRefresh.missionId);
  expect(afterRefresh.objectiveIndex).toBe(beforeRefresh.objectiveIndex);
});

test('story mission briefing stays visible until Enter acknowledges it', async ({ page }) => {
  await launchStoryModeWithOptions(page, { acknowledgeBrief: false });

  const before = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      paused: boolean;
      storyPanel?: { visible: boolean; text: string };
    };
    return {
      paused: !!scene?.paused,
      visible: !!scene?.storyPanel?.visible,
      text: scene?.storyPanel?.text ?? '',
    };
  });

  expect(before.paused).toBe(true);
  expect(before.visible).toBe(true);
  expect(before.text).toContain('MISSION BRIEF');
  expect(before.text).toContain('Press Enter or tap to continue');

  await page.keyboard.press('Enter');

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      paused: boolean;
      storyPanel?: { visible: boolean };
    };
    return scene?.paused === false && !scene?.storyPanel?.visible;
  });
});

test('location-based story missions keep their start and route targets on the minimap', async ({
  page,
}) => {
  await launchStoryMode(page);

  const missionMarkers = async (storyProgress: unknown) => {
    await page.evaluate((progress) => {
      const game = (
        window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
      ).__game;
      const scene = game?.scene.getScene('City') as {
        scene: { restart(data: unknown): void };
      };
      scene?.scene.restart({ skipResume: true, mode: 'story', storyProgress: progress });
    }, storyProgress);

    return page.waitForFunction(() => {
      const game = (
        window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
      ).__game;
      const scene = game?.scene.getScene('City') as {
        debugMinimapMarkers?: () => Array<{ kind: string; x: number; y: number }>;
      };
      return scene?.debugMinimapMarkers?.() ?? [];
    });
  };

  const startMarkers = await missionMarkers({
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'dead-drop-district',
      missionId: 'night-ferry-run',
      objectiveIndex: -1,
    },
    unlockedChapterIds: ['dead-drop-district'],
    completedChapterIds: [],
    completedMissionIds: [],
    branchOutcomes: {},
  });
  expect(
    await startMarkers.evaluate((markers) => markers.some((marker) => marker.kind === 'objective')),
  ).toBe(true);

  const routeMarkers = await missionMarkers({
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'dead-drop-district',
      missionId: 'burned-locker',
      objectiveIndex: 0,
    },
    unlockedChapterIds: ['dead-drop-district'],
    completedChapterIds: [],
    completedMissionIds: ['night-ferry-run'],
    branchOutcomes: {},
  });
  expect(
    await routeMarkers.evaluate((markers) => markers.some((marker) => marker.kind === 'objective')),
  ).toBe(true);

  const sabotageMarkers = await missionMarkers({
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'spare-parts-gospel',
      missionId: 'crusher-feed',
      objectiveIndex: 1,
    },
    unlockedChapterIds: ['dead-drop-district', 'spare-parts-gospel'],
    completedChapterIds: ['dead-drop-district'],
    completedMissionIds: [
      'night-ferry-run',
      'burned-locker',
      'wreck-before-dawn',
      'false-ambulance',
      'last-call-at-pier-9',
      'yard-talk',
      'hook-chain',
      'the-empty-shell',
    ],
    branchOutcomes: {},
  });
  expect(
    await sabotageMarkers.evaluate((markers) => markers.some((marker) => marker.kind === 'objective')),
  ).toBe(true);
});

test('story combat and chase missions keep NPC target markers on the minimap', async ({ page }) => {
  await launchStoryMode(page);

  const restartAndReadMarkers = async (storyProgress: unknown) => {
    await page.evaluate((progress) => {
      const game = (
        window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
      ).__game;
      const scene = game?.scene.getScene('City') as {
        scene: { restart(data: unknown): void };
      };
      scene?.scene.restart({ skipResume: true, mode: 'story', storyProgress: progress });
    }, storyProgress);

    return page.waitForFunction(() => {
      const game = (
        window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
      ).__game;
      const scene = game?.scene.getScene('City') as {
        debugMinimapMarkers?: () => Array<{ kind: string; x: number; y: number }>;
      };
      const markers = scene?.debugMinimapMarkers?.() ?? [];
      return markers.length > 0 ? markers : null;
    });
  };

  const eliminateMarkers = await restartAndReadMarkers({
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'dead-drop-district',
      missionId: 'wreck-before-dawn',
      objectiveIndex: 1,
    },
    unlockedChapterIds: ['dead-drop-district'],
    completedChapterIds: [],
    completedMissionIds: ['night-ferry-run', 'burned-locker'],
    branchOutcomes: {},
  });
  expect(
    await eliminateMarkers.evaluate((markers) =>
      (markers ?? []).some((marker) => marker.kind === 'mission-target'),
    ),
  ).toBe(true);

  const chaseMarkers = await restartAndReadMarkers({
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'dead-drop-district',
      missionId: 'false-ambulance',
      objectiveIndex: 0,
    },
    unlockedChapterIds: ['dead-drop-district'],
    completedChapterIds: [],
    completedMissionIds: ['night-ferry-run', 'burned-locker', 'wreck-before-dawn'],
    branchOutcomes: {},
  });
  expect(
    await chaseMarkers.evaluate((markers) =>
      (markers ?? []).some((marker) => marker.kind === 'story-target'),
    ),
  ).toBe(true);
});

test('grouped chapter leads show simultaneous mission markers and start the chosen mission in-world', async ({
  page,
}) => {
  await launchStoryMode(page);

  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      scene: { restart(data: unknown): void };
    };
    scene?.scene.restart({
      skipResume: true,
      mode: 'story',
      storyProgress: {
        version: 1,
        storyId: 'sindicate-story-mode',
        current: {
          actId: 'find-the-missing-dispatcher',
          chapterId: 'spare-parts-gospel',
          missionId: 'hook-chain',
          objectiveIndex: -2,
        },
        unlockedChapterIds: ['dead-drop-district', 'spare-parts-gospel'],
        completedChapterIds: ['dead-drop-district'],
        completedMissionIds: [
          'night-ferry-run',
          'burned-locker',
          'wreck-before-dawn',
          'false-ambulance',
          'last-call-at-pier-9',
          'yard-talk',
        ],
        branchOutcomes: {},
      },
    });
  });

  const choices = await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyMissionChoiceTargets?: () => Array<{
        mission: { id: string; title: string };
        target: { x: number; y: number };
      }>;
    };
    const targets = scene?.storyMissionChoiceTargets?.() ?? [];
    return targets.length >= 2 ? targets : null;
  });

  expect(
    await choices.evaluate((targets) => (targets ?? []).map((target) => target.mission.id)),
  ).toEqual(['hook-chain', 'the-empty-shell']);

  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: { player: { pos: { x: number; y: number } } };
      maybeStartSelectedStoryMission?: () => boolean;
      storyMissionChoiceTargets?: () => Array<{
        mission: { id: string };
        target: { x: number; y: number };
      }>;
    };
    const target = scene
      ?.storyMissionChoiceTargets?.()
      .find((choice) => choice.mission.id === 'the-empty-shell');
    if (!scene || !target) throw new Error('Missing grouped mission choice target');
    scene.world.player = { ...scene.world.player, pos: target.target };
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: { current: { missionId: string; objectiveIndex: number } | null };
      world: { mission?: { id: string } | null };
    };
    return (
      scene?.storyProgress?.current?.missionId === 'the-empty-shell' &&
      scene?.storyProgress?.current?.objectiveIndex === -1 &&
      scene?.world.mission?.id === 'the-empty-shell'
    );
  });
});

test('meter-running grouped leads record a branch outcome when the chosen lead starts', async ({
  page,
}) => {
  await launchStoryMode(page);

  await restartIntoStoryProgress(page, {
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'meter-running',
      missionId: 'double-booking',
      objectiveIndex: -2,
    },
    unlockedChapterIds: UNLOCKED_THROUGH_METER_RUNNING,
    completedChapterIds: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
    ],
    completedMissionIds: [...COMPLETED_THROUGH_WARD_6_EXIT, 'ward-6-exit', 'ghost-fare'],
    branchOutcomes: {},
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyMissionChoiceTargets?: () => Array<{
        mission: { id: string };
        target: { x: number; y: number };
      }>;
    };
    return (scene?.storyMissionChoiceTargets?.() ?? []).length >= 2;
  });

  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: { player: { pos: { x: number; y: number } } };
      storyMissionChoiceTargets?: () => Array<{
        mission: { id: string };
        target: { x: number; y: number };
      }>;
    };
    const target = scene
      ?.storyMissionChoiceTargets?.()
      .find((choice) => choice.mission.id === 'red-light-choir');
    if (!scene || !target) throw new Error('Missing meter-running mission choice target');
    scene.world.player = { ...scene.world.player, pos: target.target };
    scene.maybeStartSelectedStoryMission?.();
  });

  const branch = await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: {
        current: { missionId: string; objectiveIndex: number } | null;
        branchOutcomes: Record<string, string>;
      } | null;
      world: { mission?: { id: string; title: string } | null };
    };
    if (scene?.storyProgress?.current?.missionId !== 'red-light-choir') return null;
    if (scene.storyProgress.branchOutcomes['double-booking'] !== 'save-passenger-b') return null;
    return {
      objectiveIndex: scene.storyProgress.current.objectiveIndex,
      branch: scene.storyProgress.branchOutcomes['double-booking'] ?? '',
      title: scene.world.mission?.title ?? '',
    };
  });

  expect(await branch.jsonValue()).toEqual({
    objectiveIndex: -1,
    branch: 'save-passenger-b',
    title: 'Red Light Choir: River Lead',
  });
});

test('the empty shell uses staged scripted district-state beats after mission start', async ({
  page,
}) => {
  await launchStoryMode(page);

  await restartIntoStoryProgress(page, {
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'spare-parts-gospel',
      missionId: 'the-empty-shell',
      objectiveIndex: 0,
    },
    unlockedChapterIds: ['dead-drop-district', 'spare-parts-gospel'],
    completedChapterIds: ['dead-drop-district'],
    completedMissionIds: [
      'night-ferry-run',
      'burned-locker',
      'wreck-before-dawn',
      'false-ambulance',
      'last-call-at-pier-9',
      'yard-talk',
    ],
    branchOutcomes: {},
  });

  const stateLabel = await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyStateText?: { visible: boolean; text: string };
    };
    return scene?.storyStateText?.visible ? scene.storyStateText.text : null;
  });

  expect(await stateLabel.jsonValue()).toContain('Decoy wrecks are dragging the chase east');
});

test('the empty shell fails when the cargo sedan is too damaged', async ({ page }) => {
  await launchStoryMode(page);

  await restartIntoStoryProgress(page, {
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'spare-parts-gospel',
      missionId: 'the-empty-shell',
      objectiveIndex: 0,
    },
    unlockedChapterIds: ['dead-drop-district', 'spare-parts-gospel'],
    completedChapterIds: ['dead-drop-district'],
    completedMissionIds: [
      'night-ferry-run',
      'burned-locker',
      'wreck-before-dawn',
      'false-ambulance',
      'last-call-at-pier-9',
      'yard-talk',
    ],
    branchOutcomes: {},
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyScript?: { actorCarIndices: Record<string, number> } | null;
    };
    return scene?.storyScript?.actorCarIndices?.['empty-shell-sedan'] !== undefined;
  });

  const failure = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyScript?: { actorCarIndices: Record<string, number> } | null;
      pendingStoryRestart?: unknown;
      storyPanel?: { text: string; visible: boolean };
      storyProgress?: { current: { objectiveIndex: number } | null } | null;
      syncStoryScript?: (dt?: number) => void;
      world: unknown;
    };
    const carIndex = scene?.storyScript?.actorCarIndices?.['empty-shell-sedan'];
    if (carIndex === undefined || typeof scene?.syncStoryScript !== 'function') {
      throw new Error('Missing empty shell vehicle hooks');
    }
    const world = scene.world as {
      carHealth: number[];
      wreckedCars: boolean[];
    };
    world.carHealth[carIndex] = 40;
    world.wreckedCars[carIndex] = false;
    scene.syncStoryScript(0.6);
    return {
      pendingRestart: !!scene.pendingStoryRestart,
      text: scene.storyPanel?.text ?? '',
      objectiveIndex: scene.storyProgress?.current?.objectiveIndex ?? null,
      visible: !!scene.storyPanel?.visible,
    };
  });

  expect(failure).toEqual({
    pendingRestart: true,
    text:
      'MISSION FAILED\n\n' +
      'The stripped sedan was smashed before the cargo route could be read.\n\n' +
      'Retrying The Empty Shell...',
    objectiveIndex: 0,
    visible: true,
  });
});

test('scripted district-state missions announce stage shifts and update the active district label', async ({
  page,
}) => {
  await launchStoryMode(page);

  await restartIntoStoryProgress(page, {
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'spare-parts-gospel',
      missionId: 'the-empty-shell',
      objectiveIndex: 0,
    },
    unlockedChapterIds: ['dead-drop-district', 'spare-parts-gospel'],
    completedChapterIds: ['dead-drop-district'],
    completedMissionIds: [
      'night-ferry-run',
      'burned-locker',
      'wreck-before-dawn',
      'false-ambulance',
      'last-call-at-pier-9',
      'yard-talk',
    ],
    branchOutcomes: {},
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyScript?: { actorCarIndices: Record<string, number> } | null;
    };
    return scene?.storyScript?.actorCarIndices?.['empty-shell-sedan'] !== undefined;
  });

  const shift = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyScript?: {
        actorCarIndices: Record<string, number>;
        actorRouteIndices: Record<string, number>;
      } | null;
      world: {
        cars: Array<{
          pos: { x: number; y: number };
          heading: number;
          speed: number;
          radius: number;
        }>;
      };
      storyPanel?: { visible: boolean; text: string };
      storyStateText?: { text: string };
      syncStoryScript?: (dt?: number) => void;
    };
    const storyScript = scene?.storyScript;
    const carIndex = storyScript?.actorCarIndices?.['empty-shell-sedan'];
    if (!storyScript || carIndex === undefined || typeof scene?.syncStoryScript !== 'function') {
      throw new Error('Missing scripted actor stage hooks');
    }
    const car = scene.world.cars[carIndex];
    scene.world.cars[carIndex] = { ...car, pos: { x: 2496, y: 2112 } };
    storyScript.actorRouteIndices['empty-shell-sedan'] = 2;
    scene.syncStoryScript(0);
    scene.syncStoryScript(0);
    return {
      visible: !!scene.storyPanel?.visible,
      panel: scene.storyPanel?.text ?? '',
      state: scene.storyStateText?.text ?? '',
    };
  });

  expect(shift.visible).toBe(true);
  expect(shift.panel).toContain('STAGE SHIFT');
  expect(shift.panel).toContain('Confirm the receiving yard');
  expect(shift.panel).toContain('Hold the tail until the receiving yard is unmistakable.');
  expect(shift.state).toContain('The real shell is slipping through the salvage gate');
});

test('scripted encounter mission summaries keep their authored objective outcome text', async ({
  page,
}) => {
  await launchStoryMode(page);

  const result = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        campaign?: { currentIndex: number } | null;
        kills: number;
        targetKills: number;
        explosionsTriggered: number;
        elapsedSeconds: number;
      };
      storyProgress?: {
        current: {
          actId: string;
          chapterId: string;
          missionId: string;
          objectiveIndex: number;
        } | null;
        completedMissionIds: string[];
        unlockedChapterIds: string[];
        completedChapterIds: string[];
      };
      storyMissionSummaryBaseline?: {
        missionId: string;
        kills: number;
        targetKills: number;
        explosionsTriggered: number;
        elapsedSeconds: number;
        unlockedChapterIds: string[];
        completedChapterIds: string[];
      } | null;
      prevMissionId?: string | null;
      prevMissionComplete?: boolean;
      handleEvents?: () => void;
      storyPanel?: { visible: boolean; text: string };
    };
    if (
      !scene?.world?.campaign ||
      !scene.storyProgress ||
      typeof scene.handleEvents !== 'function'
    ) {
      throw new Error('Missing scripted mission summary hooks');
    }

    scene.storyProgress.current = {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'dead-drop-district',
      missionId: 'last-call-at-pier-9',
      objectiveIndex: 0,
    };
    scene.storyProgress.completedMissionIds = [
      'night-ferry-run',
      'burned-locker',
      'wreck-before-dawn',
      'false-ambulance',
    ];
    scene.storyMissionSummaryBaseline = {
      missionId: 'false-ambulance',
      kills: scene.world.kills,
      targetKills: scene.world.targetKills,
      explosionsTriggered: scene.world.explosionsTriggered,
      elapsedSeconds: Math.max(0, scene.world.elapsedSeconds - 18),
      unlockedChapterIds: [...scene.storyProgress.unlockedChapterIds],
      completedChapterIds: [...scene.storyProgress.completedChapterIds],
    };
    scene.prevMissionId = 'false-ambulance';
    scene.prevMissionComplete = false;
    scene.world.campaign.currentIndex = 4;
    scene.handleEvents();

    return {
      visible: !!scene.storyPanel?.visible,
      text: scene.storyPanel?.text ?? '',
    };
  });

  expect(result.visible).toBe(true);
  expect(result.text).toContain('MISSION SUMMARY');
  expect(result.text).toContain('False Ambulance');
  expect(result.text).toContain(
    "Objective Outcome: The rescued contact confirms the cleaners are storing Nia's badge and paper trail in the Pier 9 office.",
  );
  expect(result.text).toContain('Next: Last Call At Pier 9');
});

test('story mode resolves branch-dependent mission variants from saved outcomes', async ({
  page,
}) => {
  await launchStoryMode(page);

  await restartIntoStoryProgress(page, {
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'meter-running',
      missionId: 'red-light-choir',
      objectiveIndex: 0,
    },
    unlockedChapterIds: UNLOCKED_THROUGH_METER_RUNNING,
    completedChapterIds: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
    ],
    completedMissionIds: [
      ...COMPLETED_THROUGH_WARD_6_EXIT,
      'ward-6-exit',
      'ghost-fare',
      'double-booking',
    ],
    branchOutcomes: { 'double-booking': 'save-passenger-a' },
  });

  const variant = await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        mission?: { id: string; title: string } | null;
        missionObjective?: { description: string } | null;
      };
      storyStateText?: { text: string };
    };
    if (scene?.world?.mission?.id !== 'red-light-choir') return null;
    return {
      title: scene.world.mission?.title ?? '',
      objective: scene.world.missionObjective?.description ?? '',
      state: scene.storyStateText?.text ?? '',
    };
  });

  expect(await variant.jsonValue()).toEqual({
    title: 'Red Light Choir: Uptown Lead',
    objective: 'Tail the radio host through the uptown club strip',
    state: 'DISTRICT STATE\nThe host is still circling the uptown clubs',
  });
});

test('story mode carries grouped-lead outcomes into later mission setup', async ({ page }) => {
  await launchStoryMode(page);

  await restartIntoStoryProgress(page, {
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'meter-running',
      missionId: 'meter-burn',
      objectiveIndex: 0,
    },
    unlockedChapterIds: UNLOCKED_THROUGH_METER_RUNNING,
    completedChapterIds: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
    ],
    completedMissionIds: [
      ...COMPLETED_THROUGH_WARD_6_EXIT,
      'ward-6-exit',
      'ghost-fare',
      'double-booking',
      'red-light-choir',
    ],
    branchOutcomes: { 'double-booking': 'save-passenger-b' },
  });

  const variant = await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        mission?: { id: string; title: string } | null;
        missionObjective?: { description: string } | null;
      };
      storyStateText?: { text: string };
    };
    if (scene?.world?.mission?.id !== 'meter-burn') return null;
    return {
      title: scene.world.mission?.title ?? '',
      objective: scene.world.missionObjective?.description ?? '',
      state: scene.storyStateText?.text ?? '',
    };
  });

  expect(await variant.jsonValue()).toEqual({
    title: 'Meter Burn: River Slip',
    objective: 'Clear the river fare route through the checkpoint strip',
    state: 'DISTRICT STATE\nRiver-wall readers are sweeping the darker fare lane',
  });
});

test('story mode resolves branch-dependent mission variants from a live recorded outcome', async ({
  page,
}) => {
  await launchStoryMode(page);

  await restartIntoStoryProgress(page, {
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'meter-running',
      missionId: 'double-booking',
      objectiveIndex: 0,
    },
    unlockedChapterIds: UNLOCKED_THROUGH_METER_RUNNING,
    completedChapterIds: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
    ],
    completedMissionIds: [...COMPLETED_THROUGH_WARD_6_EXIT, 'ward-6-exit', 'ghost-fare'],
    branchOutcomes: {},
  });
  await acknowledgeStoryPanel(page);

  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        campaign?: {
          currentIndex: number;
          missions: Array<{
            currentIndex: number;
            objectives: unknown[];
            status: 'active' | 'completed';
          }>;
        } | null;
        updateMissionProgress?: () => void;
      };
      storyProgress?: {
        current: { missionId: string; objectiveIndex: number } | null;
        branchOutcomes: Record<string, string>;
      } | null;
      handleEvents?: () => void;
      persistGameState?: () => void;
      scene: { restart(data: unknown): void };
    };
    if (
      !scene?.world?.campaign ||
      !scene.storyProgress ||
      typeof scene.handleEvents !== 'function'
    ) {
      throw new Error('Missing live branch recording hooks');
    }

    scene.storyProgress.branchOutcomes = {
      ...scene.storyProgress.branchOutcomes,
      'double-booking': 'save-passenger-b',
    };
    const mission = scene.world.campaign.missions[scene.world.campaign.currentIndex];
    if (!mission) throw new Error('Missing current story mission');
    mission.currentIndex = mission.objectives.length;
    mission.status = 'completed';
    scene.world.updateMissionProgress?.();
    scene.handleEvents();
    if (
      !scene.storyProgress.current ||
      scene.storyProgress.current.missionId !== 'red-light-choir'
    ) {
      throw new Error('Missing next mission after live branch recording');
    }
    scene.storyProgress.current.objectiveIndex = 0;
    scene.persistGameState?.();
    scene.scene.restart({ skipResume: true, mode: 'story', storyProgress: scene.storyProgress });
  });

  const variant = await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        mission?: { id: string; title: string } | null;
        missionObjective?: { description: string } | null;
      };
      storyProgress?: { branchOutcomes: Record<string, string> } | null;
      storyPanel?: { text: string };
      storyStateText?: { text: string };
    };
    if (scene?.world?.mission?.id !== 'red-light-choir') return null;
    const saved = localStorage.getItem('sindicate.storyProgress');
    const parsed = saved ? JSON.parse(saved) : null;
    return {
      title: scene.world.mission?.title ?? '',
      objective: scene.world.missionObjective?.description ?? '',
      state: scene.storyStateText?.text ?? '',
      panel: scene.storyPanel?.text ?? '',
      branch: scene.storyProgress?.branchOutcomes['double-booking'] ?? '',
      savedBranch: parsed?.branchOutcomes?.['double-booking'] ?? '',
    };
  });

  const branchValue = (await variant.jsonValue()) as {
    title: string;
    objective: string;
    state: string;
    panel: string;
    branch: string;
    savedBranch: string;
  };

  expect(branchValue).toMatchObject({
    title: 'Red Light Choir: River Lead',
    objective: 'Tail the radio host through the riverfront lanes',
    state: 'DISTRICT STATE\nThe host is sweeping the riverfront lanes',
    branch: 'save-passenger-b',
    savedBranch: 'save-passenger-b',
  });
  expect(branchValue.panel).toContain('MISSION BRIEF');
  expect(branchValue.panel).toContain('Red Light Choir: River Lead');
});

test('scripted escort fail rules restart the current story mission', async ({ page }) => {
  await launchStoryMode(page);

  await restartIntoStoryProgress(page, {
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'static-on-the-hospital-band',
      missionId: 'ward-6-exit',
      objectiveIndex: 0,
    },
    unlockedChapterIds: UNLOCKED_THROUGH_STATIC_ON_THE_HOSPITAL_BAND,
    completedChapterIds: ['dead-drop-district', 'spare-parts-gospel'],
    completedMissionIds: COMPLETED_THROUGH_WARD_6_EXIT,
    branchOutcomes: {},
  });
  await acknowledgeStoryPanel(page);

  const failure = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        drivingCarIndex: number | null;
        player: { pos: { x: number; y: number } };
        cars: Array<{ pos: { x: number; y: number } }>;
      };
      pendingStoryRestart?: unknown;
      storyPanel?: { text: string; visible: boolean };
      storyProgress?: { current: { objectiveIndex: number } | null } | null;
      syncStoryScript?: (dt?: number) => void;
    };
    if (!scene?.world || typeof scene.syncStoryScript !== 'function') {
      throw new Error('Missing scripted fail hooks');
    }

    scene.world.player.pos = { x: 0, y: 0 };
    if (scene.world.drivingCarIndex !== null) {
      scene.world.cars[scene.world.drivingCarIndex]!.pos = { x: 0, y: 0 };
    }
    scene.syncStoryScript(3.2);
    return {
      pendingRestart: !!scene.pendingStoryRestart,
      text: scene.storyPanel?.text ?? '',
      objectiveIndex: scene.storyProgress?.current?.objectiveIndex ?? null,
      visible: !!scene.storyPanel?.visible,
    };
  });

  expect(failure).toEqual({
    pendingRestart: true,
    text:
      'MISSION FAILED\n\n' +
      'The nurse hacker was left behind in the lockdown corridor.\n\n' +
      'Retrying Ward 6 Exit...',
    objectiveIndex: 0,
    visible: true,
  });

  const restarted = await page.waitForFunction(
    () => {
      const game = (
        window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
      ).__game;
      const scene = game?.scene.getScene('City') as {
        world: { mission?: { id: string } | null };
        pendingStoryRestart?: unknown;
        storyPanel?: { text: string; visible: boolean };
        storyProgress?: { current: { missionId: string; objectiveIndex: number } | null } | null;
      };
      if (scene?.pendingStoryRestart) return null;
      if (scene?.world?.mission?.id !== 'ward-6-exit') return null;
      if (scene.storyProgress?.current?.missionId !== 'ward-6-exit') return null;
      if (scene.storyProgress.current.objectiveIndex !== 0) return null;
      if (!scene.storyPanel?.visible) return null;
      if (!scene.storyPanel.text.startsWith('MISSION BRIEF\nWard 6 Exit')) return null;
      return {
        text: scene.storyPanel?.text ?? '',
        visible: !!scene.storyPanel?.visible,
      };
    },
    undefined,
    { timeout: 8_000 },
  );

  const restartedValue = (await restarted.jsonValue()) as { text: string; visible: boolean };

  expect(restartedValue.visible).toBe(true);
  expect(restartedValue.text).toContain('MISSION BRIEF');
  expect(restartedValue.text).toContain('Ward 6 Exit');
});

test('story mode fails quiet-route missions when the wanted level stays hot', async ({ page }) => {
  await launchStoryMode(page);
  await restartIntoStoryProgress(page, {
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'meter-running',
      missionId: 'ghost-fare',
      objectiveIndex: 0,
    },
    unlockedChapterIds: UNLOCKED_THROUGH_METER_RUNNING,
    completedChapterIds: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
    ],
    completedMissionIds: COMPLETED_THROUGH_WARD_6_EXIT,
    branchOutcomes: {},
  });
  await acknowledgeStoryPanel(page);

  const failure = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: { wanted: { heat: number } };
      pendingStoryRestart?: unknown;
      storyPanel?: { text: string; visible: boolean };
      storyProgress?: { current: { objectiveIndex: number } | null } | null;
      syncStoryScript?: (dt?: number) => void;
    };
    if (!scene?.world || typeof scene.syncStoryScript !== 'function') {
      throw new Error('Missing quiet-route fail hooks');
    }

    scene.world.wanted.heat = 200;
    scene.syncStoryScript(2.1);
    return {
      pendingRestart: !!scene.pendingStoryRestart,
      text: scene.storyPanel?.text ?? '',
      objectiveIndex: scene.storyProgress?.current?.objectiveIndex ?? null,
      visible: !!scene.storyPanel?.visible,
    };
  });

  expect(failure).toEqual({
    pendingRestart: true,
    text:
      'MISSION FAILED\n\n' +
      'The ghost fare vanished once the route got too loud.\n\n' +
      'Retrying Ghost Fare...',
    objectiveIndex: 0,
    visible: true,
  });
});

test('story mode can complete a longer multi-objective encounter and roll into the next chapter', async ({
  page,
}) => {
  await launchStoryMode(page);

  await restartIntoStoryProgress(page, {
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'static-on-the-hospital-band',
      missionId: 'ward-6-exit',
      objectiveIndex: 0,
    },
    unlockedChapterIds: UNLOCKED_THROUGH_STATIC_ON_THE_HOSPITAL_BAND,
    completedChapterIds: ['dead-drop-district', 'spare-parts-gospel'],
    completedMissionIds: COMPLETED_THROUGH_WARD_6_EXIT,
    branchOutcomes: {},
  });
  await acknowledgeStoryPanel(page);

  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        player: { pos: { x: number; y: number } };
        elapsed: number;
        kills: number;
        targetKills: number;
        campaign?: { currentIndex: number } | null;
        updateMissionProgress?: () => void;
      };
      handleEvents?: () => void;
    };
    if (!scene?.world?.campaign || typeof scene.handleEvents !== 'function') {
      throw new Error('Missing long encounter completion hooks');
    }

    scene.world.player.pos = { x: 3776, y: 1280 };
    scene.world.updateMissionProgress?.();
    scene.handleEvents();

    scene.world.kills += 5;
    scene.world.targetKills += 5;
    scene.world.updateMissionProgress?.();
    scene.handleEvents();

    scene.world.elapsed += 16;
    scene.world.updateMissionProgress?.();
    scene.handleEvents();
  });

  const completion = await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      pendingStoryRestart?: unknown;
      storyPanel?: { text: string };
    };
    if (!scene?.pendingStoryRestart) return null;
    return scene.storyPanel?.text ?? '';
  });

  const completionText = (await completion.jsonValue()) as string;

  expect(completionText).toContain('CHAPTER COMPLETE');
  expect(completionText).toContain('Static On The Hospital Band');
  expect(completionText).toContain('Next: Meter Running');

  const result = await page.waitForFunction(
    () => {
      const game = (
        window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
      ).__game;
      const scene = game?.scene.getScene('City') as {
        world: { mission?: { title: string } | null };
        pendingStoryRestart?: unknown;
        storyPanel?: { text: string };
        storyProgress?: {
          current: { chapterId: string; missionId: string } | null;
          unlockedChapterIds: string[];
          completedChapterIds: string[];
        } | null;
      };
      if (scene?.pendingStoryRestart) return null;
      if (scene?.storyProgress?.current?.chapterId !== 'meter-running') return null;
      if (scene.storyProgress.current.missionId !== 'ghost-fare') return null;
      if (scene.world.mission?.title !== 'Ghost Fare') return null;
      if (!scene.storyPanel?.text.startsWith('MISSION BRIEF\nGhost Fare')) return null;
      return {
        missionTitle: scene.world.mission?.title ?? '',
        panel: scene.storyPanel?.text ?? '',
        unlocked: [...scene.storyProgress.unlockedChapterIds],
        completed: [...scene.storyProgress.completedChapterIds],
      };
    },
    undefined,
    { timeout: 8_000 },
  );

  const longEncounterValue = (await result.jsonValue()) as {
    missionTitle: string;
    panel: string;
    unlocked: string[];
    completed: string[];
  };

  expect(longEncounterValue).toMatchObject({
    missionTitle: 'Ghost Fare',
    unlocked: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
      'meter-running',
    ],
    completed: ['dead-drop-district', 'spare-parts-gospel', 'static-on-the-hospital-band'],
  });
  expect(longEncounterValue.panel).toContain('MISSION BRIEF');
  expect(longEncounterValue.panel).toContain('Ghost Fare');
});

test('False Ambulance can be completed from the start with its stop objective and rewards the next mission', async ({
  page,
}) => {
  await launchStoryMode(page);

  await restartIntoStoryProgress(page, {
    version: 1,
    storyId: 'sindicate-story-mode',
    current: {
      actId: 'find-the-missing-dispatcher',
      chapterId: 'dead-drop-district',
      missionId: 'false-ambulance',
      objectiveIndex: 0,
    },
    unlockedChapterIds: ['dead-drop-district'],
    completedChapterIds: [],
    completedMissionIds: ['night-ferry-run', 'burned-locker', 'wreck-before-dawn'],
    branchOutcomes: {},
  });
  await acknowledgeStoryPanel(page);

  // The runtime mission now starts directly on the stop objective.
  const beforeTail = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        mission?: { id: string; currentIndex: number; objectives: Array<{ kind: string }> } | null;
      };
    };
    const mission = scene?.world.mission;
    return {
      id: mission?.id ?? null,
      kind: mission ? mission.objectives[mission.currentIndex]?.kind : null,
    };
  });
  expect(beforeTail).toEqual({ id: 'false-ambulance', kind: 'capture' });

  // Feed capture progress directly; stopping the ambulance no longer waits on a
  // mandatory tail phase first.
  const result = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        mission?: { currentIndex: number; objectives: Array<{ kind: string }> } | null;
        setStoryObjectiveProgress(
          progress: { tailSeconds?: number; captureSeconds?: number } | null,
        ): void;
        updateMissionProgress?: () => void;
      };
      handleEvents?: () => void;
      storyProgress?: { current: { missionId: string } | null } | null;
      storyPanel?: { text: string };
    };
    if (
      typeof scene?.world.updateMissionProgress !== 'function' ||
      typeof scene.handleEvents !== 'function'
    ) {
      throw new Error('Missing mission completion hooks');
    }

    scene.world.setStoryObjectiveProgress({ tailSeconds: 0, captureSeconds: 50 });
    scene.world.updateMissionProgress();
    scene.handleEvents();

    return {
      curMission: scene.storyProgress?.current?.missionId ?? null,
      panel: scene.storyPanel?.text ?? '',
    };
  });

  // Completing the stop objective pays out and rolls Rook into the next dead-drop mission.
  expect(result.curMission).toBe('last-call-at-pier-9');

  const after = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as { world: { mission?: { title: string } | null } };
    return scene?.world.mission?.title ?? null;
  });
  expect(after).toBe('Last Call At Pier 9');
  expect(result.panel).toContain('MISSION SUMMARY');
  expect(result.panel).toContain('False Ambulance');
  expect(result.panel).toContain('Reward: $4200');
});

test('pause routes into the integrated Sindicate launch page with the current objective visible', async ({
  page,
}) => {
  await launchStoryMode(page);

  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel('Current run')).toContainText('Night Ferry Run');
  await expect(page.getByLabel('Current run')).toContainText('Go to the mission marker');

  await page.getByRole('button', { name: /Resume Current Run|Continue Story|Start Story/ }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
});

test('story mode persists manual save slots alongside story progress', async ({ page }) => {
  await launchStoryMode(page);

  await page.keyboard.press('p');
  await page.locator('[data-story-slot-save="2"]').click();

  const slotTwo = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, storyManualSaveKey(2));
  const slotTwoGame = await page.evaluate(() => {
    const raw = localStorage.getItem('sindicate.manualSave.2');
    return raw ? JSON.parse(raw) : null;
  });

  expect(slotTwo?.storyId).toBe('sindicate-story-mode');
  expect(slotTwo?.current?.chapterId).toBe('dead-drop-district');

  await page.getByRole('button', { name: /Resume Current Run|Continue Story|Start Story/ }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        campaign?: { currentIndex: number; missions: Array<{ currentIndex: number }> } | null;
      };
    };
    if (!scene?.world?.campaign) throw new Error('Missing story campaign');
    scene.world.campaign.currentIndex = 0;
    if (scene.world.campaign.missions[0]) scene.world.campaign.missions[0].currentIndex = 1;
  });

  await page.keyboard.press('p');
  await page.locator('[data-story-slot-save="1"]').click();
  const slotOne = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, storyManualSaveKey(1));
  const slotOneGame = await page.evaluate(() => {
    const raw = localStorage.getItem('sindicate.manualSave');
    return raw ? JSON.parse(raw) : null;
  });

  expect(slotOne?.storyId).toBe('sindicate-story-mode');
  expect(slotOne?.current?.chapterId).toBe('dead-drop-district');
  expect(slotOneGame?.world?.campaign?.missions?.[0]?.currentIndex).toBe(1);
  expect(slotTwoGame?.world?.campaign?.missions?.[0]?.currentIndex).not.toBe(1);
});

test('story mode shows a prototype-complete panel when the current story slice finishes', async ({
  page,
}) => {
  await launchStoryMode(page);

  const result = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: { campaign?: { missions: Array<unknown>; currentIndex: number } | null };
      storyProgress?: {
        current: {
          actId: string;
          missionId: string;
          chapterId: string;
          objectiveIndex: number;
        } | null;
        completedMissionIds: string[];
      };
      prevMissionId?: string | null;
      prevMissionComplete?: boolean;
      handleEvents?: () => void;
      storyPanel?: { visible: boolean; text: string };
    };
    if (
      !scene?.world?.campaign ||
      !scene.storyProgress ||
      typeof scene.handleEvents !== 'function'
    ) {
      throw new Error('Missing story-mode scene hooks');
    }

    scene.storyProgress.current = {
      actId: 'court-the-citys-middle-powers',
      chapterId: 'glass-towers-empty-floors',
      missionId: 'vacancy-notice',
      objectiveIndex: 0,
    };
    scene.storyProgress.completedMissionIds = [
      'union-test-run',
      'picket-line-breaker',
      'harbor-echo',
      'crane-jam',
      'the-long-manifest',
      'signal-sprint',
      'drop-stack',
      'blind-corner',
      'rival-tape',
      'lamps-out',
      'tenant-warning',
      'window-tax',
      'lobby-flood',
      'fire-sale-run',
    ];
    scene.prevMissionId = 'vacancy-notice';
    scene.prevMissionComplete = false;
    scene.world.campaign.currentIndex = scene.world.campaign.missions.length;
    scene.handleEvents();

    return {
      visible: !!scene.storyPanel?.visible,
      text: scene.storyPanel?.text ?? '',
      current: scene.storyProgress.current,
    };
  });

  expect(result.visible).toBe(true);
  expect(result.text).toContain('STORY COMPLETE');
  expect(result.current).toBeNull();
});

test('story mode shows an authored mission transition panel between chapter missions', async ({
  page,
}) => {
  await launchStoryMode(page);

  const result = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: { campaign?: { currentIndex: number } | null; mission?: { title: string } | null };
      storyProgress?: {
        current: { chapterId: string; missionId: string; objectiveIndex: number } | null;
      };
      prevMissionId?: string | null;
      prevMissionComplete?: boolean;
      handleEvents?: () => void;
      storyPanel?: { visible: boolean; text: string };
    };
    if (
      !scene?.world?.campaign ||
      !scene.storyProgress ||
      typeof scene.handleEvents !== 'function'
    ) {
      throw new Error('Missing story mission transition hooks');
    }

    scene.storyProgress.current = {
      chapterId: 'dead-drop-district',
      missionId: 'burned-locker',
      objectiveIndex: 0,
    };
    scene.world.campaign.currentIndex = 1;
    scene.prevMissionId = 'night-ferry-run';
    scene.prevMissionComplete = false;
    scene.handleEvents();

    return {
      visible: !!scene.storyPanel?.visible,
      text: scene.storyPanel?.text ?? '',
      missionTitle: scene.world.mission?.title ?? null,
    };
  });

  expect(result.visible).toBe(true);
  expect(result.text).toContain('MISSION SUMMARY');
  expect(result.text).toContain('Night Ferry Run');
  expect(result.text).toContain('Reward: $1500');
  expect(result.text).toContain('Burned Locker');
  expect(result.missionTitle).toBe('Burned Locker');
});

test('story mode restarts into the next chapter after chapter completion', async ({ page }) => {
  await launchStoryMode(page);

  await forceStoryChapterCompletion(page, {
    actId: 'find-the-missing-dispatcher',
    chapterId: 'dead-drop-district',
    missionId: 'last-call-at-pier-9',
    completedMissionIds: [
      'night-ferry-run',
      'burned-locker',
      'wreck-before-dawn',
      'false-ambulance',
    ],
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: { current: { chapterId: string; missionId: string } | null };
      storyPanel?: { text: string; visible: boolean };
    };
    return (
      scene?.storyProgress?.current?.chapterId === 'spare-parts-gospel' &&
      scene?.storyProgress?.current?.missionId === 'yard-talk'
    );
  });
});

test('story mode can progress across multiple chapter finales and preserve unlock state', async ({
  page,
}) => {
  await launchStoryMode(page);

  await forceStoryChapterCompletion(page, {
    actId: 'find-the-missing-dispatcher',
    chapterId: 'dead-drop-district',
    missionId: 'last-call-at-pier-9',
    completedMissionIds: [
      'night-ferry-run',
      'burned-locker',
      'wreck-before-dawn',
      'false-ambulance',
    ],
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: {
        current: { chapterId: string; missionId: string } | null;
        unlockedChapterIds: string[];
        completedChapterIds: string[];
      };
    };
    return (
      scene?.storyProgress?.current?.chapterId === 'spare-parts-gospel' &&
      scene?.storyProgress?.current?.missionId === 'yard-talk' &&
      scene.storyProgress.unlockedChapterIds.includes('spare-parts-gospel') &&
      scene.storyProgress.completedChapterIds.includes('dead-drop-district')
    );
  });

  await forceStoryChapterCompletion(page, {
    actId: 'find-the-missing-dispatcher',
    chapterId: 'spare-parts-gospel',
    missionId: 'towline-oath',
    completedMissionIds: [
      'night-ferry-run',
      'burned-locker',
      'wreck-before-dawn',
      'false-ambulance',
      'last-call-at-pier-9',
      'yard-talk',
      'hook-chain',
      'the-empty-shell',
      'crusher-feed',
    ],
  });

  const result = await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: {
        current: { chapterId: string; missionId: string } | null;
        unlockedChapterIds: string[];
        completedChapterIds: string[];
      };
    };
    if (scene?.storyProgress?.current?.chapterId !== 'static-on-the-hospital-band') return null;
    return {
      missionId: scene.storyProgress.current?.missionId ?? null,
      unlocked: [...scene.storyProgress.unlockedChapterIds],
      completed: [...scene.storyProgress.completedChapterIds],
    };
  });

  expect(await result.jsonValue()).toEqual({
    missionId: 'cold-intake',
    unlocked: ['dead-drop-district', 'spare-parts-gospel', 'static-on-the-hospital-band'],
    completed: ['dead-drop-district', 'spare-parts-gospel'],
  });
});

test('the integrated Sindicate launcher can replay an unlocked chapter selection after pausing', async ({
  page,
}) => {
  await launchStoryMode(page);

  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: {
        unlockedChapterIds: string[];
        completedChapterIds: string[];
        current: { chapterId: string } | null;
      };
    };
    if (!scene?.storyProgress?.current) throw new Error('Missing story progress');
    scene.storyProgress.unlockedChapterIds = [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
    ];
    scene.storyProgress.completedChapterIds = ['dead-drop-district'];
  });

  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: /Spare Parts Gospel/i })).toBeVisible();
  await page.getByRole('button', { name: /Spare Parts Gospel/i }).click();

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: { current: { chapterId: string; missionId: string } | null };
      storyPanel?: { text: string; visible: boolean };
    };
    return (
      scene?.storyProgress?.current?.chapterId === 'spare-parts-gospel' &&
      scene?.storyProgress?.current?.missionId === 'yard-talk'
    );
  });
});
