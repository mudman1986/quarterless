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
      await page.getByRole('button', { name: 'Resume' }).click();
      await page.waitForFunction(
        (expectedZone) => {
          const hook = (window as unknown as { __penguinsOfTangram?: { state?: string; currentLevelId?: string } }).__penguinsOfTangram;
          return hook?.state === 'running' && hook.currentLevelId === expectedZone;
        },
        ['playground-adventure', 'classroom-maze', 'library-art-room-secrets', 'sports-day-finale'][index],
      );
    }
  }

  await expect(page.getByText('School festival complete!')).toBeVisible();
  await page.getByRole('button', { name: 'Choose class' }).click();
  await expect(page.getByRole('heading', { name: 'Penguins of Tangram' })).toBeVisible();
});
