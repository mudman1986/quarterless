import { expect, type Page } from '@playwright/test';

interface ArcadeGameTestHook {
  triggerGameOver(score?: number): void;
}

type TangramTestHook = {
  state?: string;
  language?: 'nl' | 'en';
  audioMuted?: boolean;
  reducedMotion?: boolean;
  bossActive?: boolean;
  bossHitsRemaining?: number;
  bossWarning?: boolean;
  bossCharging?: boolean;
  completeCurrentLevel?: () => void;
  jumpAudit?: {
    allCriticalPlatformsReachable?: boolean;
    unreachable?: string[];
  };
};

interface WaitForCitySceneOptions {
  requireCampaign?: boolean;
  requireUnpaused?: boolean;
  timeout?: number;
}

export async function waitForCitySceneReady(
  page: Page,
  options: WaitForCitySceneOptions = {},
): Promise<void> {
  await page.waitForFunction(
    ({ requireCampaign, requireUnpaused }) => {
      const game = (
        window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
      ).__game;
      const scene = game?.scene.getScene('City') as {
        paused?: boolean;
        hud?: { text: string };
        world?: { campaign?: unknown };
        scene?: { restart(data: unknown): void };
      };
      if (!scene?.world || !scene.hud || !scene.scene) return false;
      if (requireCampaign && !scene.world.campaign) return false;
      if (requireUnpaused && scene.paused !== false) return false;
      return true;
    },
    {
      requireCampaign: options.requireCampaign ?? false,
      requireUnpaused: options.requireUnpaused ?? false,
    },
    { timeout: options.timeout ?? 15_000 },
  );
}

export async function launchSindicate(page: Page): Promise<void> {
  await page.goto('/quarterless/');
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Play Sindicate' }).click();
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Start Story|Continue Story|Resume Current Run/ }).click();
  await page.waitForURL(/\/quarterless\/\?mode=story&story=1$/, { timeout: 15_000 });
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await waitForCitySceneReady(page);
  await canvas.click();
  for (let step = 0; step < 4; step += 1) {
    const visible = await page.evaluate(() => {
      const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
        .__game;
      const scene = game?.scene.getScene('City') as {
        storyPanel?: { visible: boolean };
        acknowledgeStoryPanel?: () => void;
      };
      if (!scene?.storyPanel?.visible) return false;
      scene.acknowledgeStoryPanel?.();
      return true;
    });
    if (!visible) break;
    await page.waitForFunction(() => {
      const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
        .__game;
      const scene = game?.scene.getScene('City') as {
        storyPanel?: { visible: boolean };
      };
      return scene !== undefined && scene.storyPanel !== undefined;
    });
  }
  await waitForCitySceneReady(page, { requireUnpaused: true });
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      storyPanel?: { visible: boolean };
    };
    return !scene?.storyPanel?.visible;
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
  void level;
  await page.goto('/quarterless/');
  await page.evaluate(() => {
    const key = 'penguins-of-tangram.progress';
    const raw = localStorage.getItem(key);
    const progress = raw ? JSON.parse(raw) as Record<string, unknown> : { version: 1 };
    localStorage.setItem(key, JSON.stringify({ ...progress, version: 1, language: 'en' }));
  });
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Play Penguins of Tangram' }).click();
  await expect(page.getByRole('heading', { name: 'Penguins of Tangram' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: new RegExp(`^${character}`) }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(
    () => (window as unknown as { __penguinsOfTangram?: TangramTestHook }).__penguinsOfTangram?.state === 'running',
  );
}

export async function completeTangramLevel(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('PenguinsOfTangram') as { sys?: { isActive?: () => boolean } } | undefined;
    return scene?.sys?.isActive?.() === true;
  });
  await page.evaluate(() => {
    const hook = (window as unknown as { __penguinsOfTangram?: TangramTestHook }).__penguinsOfTangram;
    hook?.completeCurrentLevel?.();
  });
  await expect(page.locator('.tangram-platformer-overlay--complete')).toBeVisible();
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
