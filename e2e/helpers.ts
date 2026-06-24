import { expect, type Page } from '@playwright/test';

export async function launchSindicate(page: Page): Promise<void> {
  await page.goto('/sindicate/');
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Play Sindicate' }).click();
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await canvas.click();
}
