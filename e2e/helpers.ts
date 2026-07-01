import { expect, type Page } from '@playwright/test';

interface ArcadeGameTestHook {
  triggerGameOver(score?: number): void;
}

type TangramTestHook = {
  state?: string;
  completeCurrentLevel?: () => void;
  jumpAudit?: {
    allCriticalPlatformsReachable?: boolean;
    unreachable?: string[];
  };
};

export async function launchSindicate(page: Page): Promise<void> {
  await page.goto('/quarterless/');
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Play Sindicate' }).click();
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Start Story|Continue Story|Resume Current Run/ }).click();
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await canvas.click();
  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      acknowledgeStoryPanel?: () => void;
    };
    scene?.acknowledgeStoryPanel?.();
  });
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      paused: boolean;
      storyPanel?: { visible: boolean };
    };
    return scene?.paused === false && !scene?.storyPanel?.visible;
  });
}

export async function launchArcadeGame(page: Page, title: 'Pixel Sprint' | 'Void Sweep'): Promise<void> {
  await page.goto('/quarterless/');
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: `Play ${title}` }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __arcadeGame?: unknown }).__arcadeGame));
}

export async function launchPenguinsOfTangram(
  page: Page,
  character: 'Penguin' | 'Crocodile' | 'Monkey' | 'Turtle' | 'Kangaroo' | 'Lion' = 'Penguin',
  level: string = 'School Gate Morning Run',
): Promise<void> {
  await page.goto('/quarterless/');
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Play Penguins of Tangram' }).click();
  await expect(page.getByRole('heading', { name: 'Penguins of Tangram' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: new RegExp(`^${character}`) }).click();
  await page.getByRole('button', { name: 'Open school map' }).click();
  await expect(page.getByRole('heading', { name: 'Five-zone adventure' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: `Play ${level}` }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(
    () => (window as unknown as { __penguinsOfTangram?: TangramTestHook }).__penguinsOfTangram?.state === 'running',
  );
}

export async function completeTangramLevel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hook = (window as unknown as { __penguinsOfTangram?: TangramTestHook }).__penguinsOfTangram;
    hook?.completeCurrentLevel?.();
  });
}

export async function tangramJumpAudit(page: Page): Promise<{ reachable: boolean; unreachable: string[] }> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __penguinsOfTangram?: TangramTestHook }).__penguinsOfTangram;
    return {
      reachable: Boolean(hook?.jumpAudit?.allCriticalPlatformsReachable),
      unreachable: hook?.jumpAudit?.unreachable ?? [],
    };
  });
}

export async function triggerArcadeGameOver(page: Page, score?: number): Promise<void> {
  await page.evaluate((nextScore) => {
    const hook = (window as unknown as { __arcadeGame?: ArcadeGameTestHook }).__arcadeGame;
    if (!hook) throw new Error('Missing arcade test hook');
    hook.triggerGameOver(nextScore);
  }, score);
}
