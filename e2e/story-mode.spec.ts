import { test, expect } from '@playwright/test';

const MANUAL_SAVE_KEY = 'sindicate.manualSave';

function storyManualSaveKey(slot: number): string {
  return slot <= 1 ? `${MANUAL_SAVE_KEY}.storyProgress` : `${MANUAL_SAVE_KEY}.${slot}.storyProgress`;
}

async function launchStoryMode(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/quarterless/');
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Story Mode' }).click();
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Start Story|Continue Story/ }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#game canvas').click();
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
  });
});

test('landing page exposes a story-mode entry point for Sindicate', async ({ page }) => {
  await page.goto('/quarterless/');
  await expect(page.getByRole('button', { name: 'Story Mode' })).toBeVisible();
});

test('story mode opens a dedicated story menu with chapter select', async ({ page }) => {
  await page.goto('/quarterless/');
  await page.getByRole('button', { name: 'Story Mode' }).click();
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dead Drop District/i })).toBeVisible();
});

test('story mode boots and restores saved story progress after refresh', async ({ page }) => {
  await launchStoryMode(page);
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: { current: { chapterId: string } | null };
    };
    return scene?.storyProgress?.current?.chapterId === 'dead-drop-district';
  });

  const beforeRefresh = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
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
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
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

test('story mode persists manual save slots alongside story progress', async ({ page }) => {
  await launchStoryMode(page);

  await page.keyboard.press('p');
  await page.keyboard.press('2');
  await page.keyboard.press('s');

  const slotTwo = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, storyManualSaveKey(2));

  expect(slotTwo?.storyId).toBe('sindicate-story-mode');
  expect(slotTwo?.current?.chapterId).toBe('dead-drop-district');

  await page.keyboard.press('p');
  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      world: { campaign?: { currentIndex: number; missions: Array<{ currentIndex: number }> } | null };
      paused: boolean;
    };
    if (!scene?.world?.campaign) throw new Error('Missing story campaign');
    scene.world.campaign.currentIndex = 0;
    if (scene.world.campaign.missions[0]) scene.world.campaign.missions[0].currentIndex = 1;
    scene.paused = false;
  });

  await page.keyboard.press('p');
  await page.keyboard.press('1');
  await page.keyboard.press('s');
  const slotOne = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, storyManualSaveKey(1));

  expect(slotOne?.storyId).toBe('sindicate-story-mode');
  expect(slotOne?.current?.chapterId).toBe('dead-drop-district');
  expect(slotOne).not.toEqual(slotTwo);
});

test('story mode shows a prototype-complete panel when the current story slice finishes', async ({ page }) => {
  await launchStoryMode(page);

  const result = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      world: { campaign?: { missions: Array<unknown>; currentIndex: number } | null };
      storyProgress?: { current: { missionId: string; chapterId: string; objectiveIndex: number } | null };
      prevMissionId?: string | null;
      prevMissionComplete?: boolean;
      handleEvents?: () => void;
      storyPanel?: { visible: boolean; text: string };
    };
    if (!scene?.world?.campaign || !scene.storyProgress || typeof scene.handleEvents !== 'function') {
      throw new Error('Missing story-mode scene hooks');
    }

    scene.storyProgress.current = {
      chapterId: 'static-on-the-hospital-band',
      missionId: 'ward-6-exit',
      objectiveIndex: 0,
    };
    scene.prevMissionId = 'ward-6-exit';
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

test('story mode shows an authored mission transition panel between chapter missions', async ({ page }) => {
  await launchStoryMode(page);

  const result = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      world: { campaign?: { currentIndex: number } | null; mission?: { title: string } | null };
      storyProgress?: { current: { chapterId: string; missionId: string; objectiveIndex: number } | null };
      prevMissionId?: string | null;
      prevMissionComplete?: boolean;
      handleEvents?: () => void;
      storyPanel?: { visible: boolean; text: string };
    };
    if (!scene?.world?.campaign || !scene.storyProgress || typeof scene.handleEvents !== 'function') {
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
  expect(result.text).toContain('MISSION COMPLETE');
  expect(result.text).toContain('Night Ferry Run');
  expect(result.text).toContain('Burned Locker');
  expect(result.missionTitle).toBe('Burned Locker');
});

test('story mode restarts into the next chapter after chapter completion', async ({ page }) => {
  await launchStoryMode(page);

  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      world: { campaign?: { missions: Array<unknown>; currentIndex: number } | null };
      storyProgress?: { current: { missionId: string; chapterId: string; objectiveIndex: number } | null };
      prevMissionId?: string | null;
      prevMissionComplete?: boolean;
      pendingStoryRestart?: unknown;
      storyPanelRemaining?: number;
      handleEvents?: () => void;
      scene: { restart(data: unknown): void };
    };
    if (!scene?.world?.campaign || !scene.storyProgress || typeof scene.handleEvents !== 'function') {
      throw new Error('Missing chapter completion hooks');
    }

    scene.storyProgress.current = {
      chapterId: 'dead-drop-district',
      missionId: 'last-call-at-pier-9',
      objectiveIndex: 0,
    };
    scene.prevMissionId = 'last-call-at-pier-9';
    scene.prevMissionComplete = false;
    scene.world.campaign.currentIndex = scene.world.campaign.missions.length;
    scene.handleEvents();
    scene.scene.restart({ skipResume: true, mode: 'story', storyProgress: scene.pendingStoryRestart });
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
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

test('story mode pause menu can replay an unlocked chapter selection', async ({ page }) => {
  await launchStoryMode(page);

  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: { unlockedChapterIds: string[]; current: { chapterId: string } | null };
    };
    if (!scene?.storyProgress?.current) throw new Error('Missing story progress');
    scene.storyProgress.unlockedChapterIds = ['dead-drop-district', 'spare-parts-gospel'];
  });

  await page.keyboard.press('p');
  await page.keyboard.press('c');
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      pauseChapterButton?: { text: string };
    };
    return scene?.pauseChapterButton?.text.includes('Spare Parts Gospel') ?? false;
  });

  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
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
          chapterId: 'spare-parts-gospel',
          missionId: 'yard-talk',
          objectiveIndex: 0,
        },
        unlockedChapterIds: ['dead-drop-district', 'spare-parts-gospel'],
        completedChapterIds: ['dead-drop-district'],
        completedMissionIds: [],
        branchOutcomes: {},
      },
    });
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
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