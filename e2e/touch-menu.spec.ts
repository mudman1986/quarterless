import { test, expect, type Page } from '@playwright/test';
import { launchSindicate } from './helpers';

interface CitySceneProbe {
  paused: boolean;
  touchEnabled: boolean;
  touchAvailable: boolean;
  touchOptedOut: boolean;
  touchControlsGfx: { visible: boolean };
  input: { emit(event: string, pointer: unknown): void };
}

interface GameProbe {
  scene: {
    getScene(key: string): CitySceneProbe;
  };
}

async function boot(page: Page): Promise<void> {
  await launchSindicate(page);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !!(window as unknown as { __game?: unknown }).__game);
  await page.waitForTimeout(300);
}

test('pause menu touch toggle disables touch controls and keeps them off until re-enabled from the menu', async ({
  page,
}) => {
  await boot(page);

  await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    scene.input.emit('pointerdown', { event: { pointerType: 'touch' } });
  });

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    return scene.touchAvailable && scene.touchEnabled;
  });

  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Touch Controls: ON' }).click();

  await expect(page.getByRole('button', { name: 'Touch Controls: OFF' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sindicate.touchEnabled'))).toBe('0');

  await page.getByRole('button', { name: 'Touch Controls: OFF' }).click();
  expect(await page.evaluate(() => localStorage.getItem('sindicate.touchEnabled'))).toBe('1');
  await page.getByRole('button', { name: /Resume Current Run|Continue Story|Start Story/ }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: GameProbe }).__game));

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game?: GameProbe }).__game;
    if (!g) return false;
    const scene = g.scene.getScene('City');
    return (
      scene.touchEnabled === true &&
      scene.touchOptedOut === false
    );
  });

  await page.evaluate(() => {
    localStorage.removeItem('sindicate.touchEnabled');
  });
});
