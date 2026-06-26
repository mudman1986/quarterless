import { test, expect, type Page } from '@playwright/test';
import { launchArcadeGame, triggerArcadeGameOver } from './helpers';

type ArcadeTitle = 'Pixel Sprint' | 'Void Sweep';

const scoreKeys: Record<ArcadeTitle, string> = {
  'Pixel Sprint': 'quarterless.arcade.pixelSprint.leaderboard',
  'Void Sweep': 'quarterless.arcade.voidSweep.leaderboard',
};

async function saveNamedScore(page: Page, title: ArcadeTitle, name: string, score: number): Promise<void> {
  await launchArcadeGame(page, title);
  await triggerArcadeGameOver(page, score);
  await expect(page.getByRole('heading', { name: 'Game over' })).toBeVisible();
  await page.getByLabel('Top 10 name').fill(name);
}

async function expectLeaderboardEntry(
  page: Page,
  index: number,
  name: string,
  score: number,
): Promise<void> {
  const item = page.locator('.mini-game-gameover-item').nth(index);
  await expect(item).toContainText(name);
  await expect(item).toContainText(String(score));
}

test('Pixel Sprint saves leaderboard entries, restarts by button, and survives refresh', async ({ page }) => {
  await saveNamedScore(page, 'Pixel Sprint', 'ADA', 42);
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByRole('heading', { name: 'Game over' })).toBeHidden();

  await saveNamedScore(page, 'Pixel Sprint', 'CY', 84);
  await expectLeaderboardEntry(page, 0, 'CY', 84);
  await expectLeaderboardEntry(page, 1, 'ADA', 42);

  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByRole('heading', { name: 'Game over' })).toBeHidden();

  await triggerArcadeGameOver(page);
  await expect(page.getByText('Score 0')).toBeVisible();
  await expectLeaderboardEntry(page, 0, 'CY', 84);
  await expectLeaderboardEntry(page, 1, 'ADA', 42);
  await expect(page.getByText('ADA')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible();
  await launchArcadeGame(page, 'Pixel Sprint');
  await triggerArcadeGameOver(page);
  await expectLeaderboardEntry(page, 0, 'CY', 84);
  await expectLeaderboardEntry(page, 1, 'ADA', 42);

  const stored = await page.evaluate((key) => window.localStorage.getItem(key), scoreKeys['Pixel Sprint']);
  expect(stored).toContain('ADA');
  expect(stored).toContain('CY');
});

test('Void Sweep saves leaderboard entries, restarts on Enter, and survives refresh', async ({ page }) => {
  await saveNamedScore(page, 'Void Sweep', 'BEA', 75);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Game over' })).toBeHidden();

  await saveNamedScore(page, 'Void Sweep', 'CY', 75);
  await expectLeaderboardEntry(page, 0, 'CY', 75);
  await expectLeaderboardEntry(page, 1, 'BEA', 75);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Game over' })).toBeHidden();

  await triggerArcadeGameOver(page);
  await expect(page.getByText('Score 0')).toBeVisible();
  await expectLeaderboardEntry(page, 0, 'CY', 75);
  await expectLeaderboardEntry(page, 1, 'BEA', 75);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible();
  await launchArcadeGame(page, 'Void Sweep');
  await triggerArcadeGameOver(page);
  await expectLeaderboardEntry(page, 0, 'CY', 75);
  await expectLeaderboardEntry(page, 1, 'BEA', 75);

  const stored = await page.evaluate((key) => window.localStorage.getItem(key), scoreKeys['Void Sweep']);
  expect(stored).toContain('BEA');
  expect(stored).toContain('CY');
});