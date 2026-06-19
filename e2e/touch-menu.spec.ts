import { test, expect, type Page } from '@playwright/test';

interface CitySceneProbe {
  paused: boolean;
  touchEnabled: boolean;
  touchAvailable: boolean;
  touchOptedOut: boolean;
  pauseTouchButton: { visible: boolean; text: string; emit(event: string): void };
  touchControlsGfx: { visible: boolean };
  input: { emit(event: string, pointer: unknown): void };
}

interface GameProbe {
  scene: {
    getScene(key: string): CitySceneProbe;
  };
}

async function boot(page: Page): Promise<void> {
  await page.goto('/sindicate/');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !!(window as unknown as { __game?: unknown }).__game);
  await page.waitForTimeout(300);
}

test('pause menu touch toggle disables touch controls and keeps them off until re-enabled from the menu', async ({ page }) => {
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

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    return scene.paused && scene.pauseTouchButton.visible && scene.pauseTouchButton.text.includes('Touch Controls: ON');
  });

  await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    g.scene.getScene('City').pauseTouchButton.emit('pointerdown');
  });

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    return scene.touchEnabled === false &&
      scene.touchOptedOut === true &&
      scene.pauseTouchButton.text.includes('Touch Controls: OFF') &&
      scene.touchControlsGfx.visible === false;
  });

  await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    scene.input.emit('pointerdown', { event: { pointerType: 'touch' } });
  });

  await page.waitForTimeout(100);

  const disabled = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    return {
      touchEnabled: scene.touchEnabled,
      touchOptedOut: scene.touchOptedOut,
      buttonText: scene.pauseTouchButton.text,
      touchVisible: scene.touchControlsGfx.visible,
    };
  });

  expect(disabled.touchEnabled).toBe(false);
  expect(disabled.touchOptedOut).toBe(true);
  expect(disabled.buttonText).toContain('Touch Controls: OFF');
  expect(disabled.touchVisible).toBe(false);

  await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    g.scene.getScene('City').pauseTouchButton.emit('pointerdown');
  });

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    return scene.touchEnabled === true &&
      scene.touchOptedOut === false &&
      scene.pauseTouchButton.text.includes('Touch Controls: ON');
  });
});