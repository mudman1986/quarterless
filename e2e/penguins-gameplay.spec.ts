import { expect, test } from '@playwright/test';
import { completeTangramLevel, launchPenguinsOfTangram, tangramJumpAudit } from './helpers';

const ZONES = [
  'School Gate Morning Run',
  'Playground Adventure',
  'Classroom Maze',
  'Library and Art Room Secrets',
  'Sports Day Finale',
] as const;

test('Penguins of Tangram campaign unlocks every zone and keeps jump routes reachable', async ({ page }) => {
  await launchPenguinsOfTangram(page, 'Penguin', ZONES[0]);

  for (const [index, zone] of ZONES.entries()) {
    const audit = await tangramJumpAudit(page);
    expect(audit.reachable, `unreachable routes in ${zone}: ${audit.unreachable.join(', ')}`).toBe(true);

    await completeTangramLevel(page);

    if (index < ZONES.length - 1) {
      await expect(page.getByText(`${zone} cleared!`)).toBeVisible();
      await page.getByRole('button', { name: /Next:/ }).click();
      await expect(page.getByText(ZONES[index + 1])).toBeVisible();
      await page.waitForFunction(
        () => (window as unknown as { __penguinsOfTangram?: { state?: string } }).__penguinsOfTangram?.state === 'running',
      );
    }
  }

  await expect(page.getByText('School festival complete!')).toBeVisible();
  await page.getByRole('button', { name: 'Back to school map' }).click();
  await expect(page.getByRole('heading', { name: 'Five-zone adventure' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Sports Day Finale' })).toBeVisible();
});
