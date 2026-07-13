import { test, expect } from '@playwright/test';
import { launchSindicate } from './helpers';

test('fixed-step simulation drops stale backlog after long frames', async ({ page }) => {
  await launchSindicate(page);

  const result = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      accumulator: number;
      update(time: number, deltaMs: number): void;
    };

    scene.accumulator = 0;
    for (let frame = 1; frame <= 20; frame += 1) {
      scene.update(frame * 250, 250);
    }

    return scene.accumulator;
  });

  expect(result).toBeLessThan(1 / 60);
});