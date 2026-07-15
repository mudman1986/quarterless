import { expect, test } from '@playwright/test';
import { launchPenguinsOfTangram } from './helpers';

const PROGRESS_KEY = 'penguins-of-tangram.progress';

test('Penguins pause freezes the simulation and resume restores it', async ({ page }) => {
  await launchPenguinsOfTangram(page);

  const beforePause = await page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      simulation: { player: { x: number; y: number } };
    };
    return { x: scene.simulation.player.x, y: scene.simulation.player.y };
  });

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('heading', { name: 'Parade paused' })).toBeVisible();
  await page.waitForTimeout(120);

  const afterPause = await page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      simulation: { player: { x: number; y: number } };
    };
    return { x: scene.simulation.player.x, y: scene.simulation.player.y };
  });
  expect(afterPause).toEqual(beforePause);

  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Parade paused' })).toBeHidden();
});

test('Penguins can restart the current level from its starting point', async ({ page }) => {
  await launchPenguinsOfTangram(page);
  await page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      simulation: { player: { x: number }; checkpointActivated: boolean; falls: number };
    };
    scene.simulation.player.x = 900;
    scene.simulation.checkpointActivated = true;
    scene.simulation.falls = 2;
  });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Restart level' }).click();
  await page.waitForFunction(() => (
    (window as unknown as { __penguinsOfTangram?: { state?: string } }).__penguinsOfTangram?.state === 'running'
  ));
  const restarted = await page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      level: { start: { x: number } };
      simulation: { player: { x: number }; checkpointActivated: boolean; falls: number };
    };
    return {
      checkpointActivated: scene.simulation.checkpointActivated,
      falls: scene.simulation.falls,
      x: scene.simulation.player.x,
      startX: scene.level.start.x,
    };
  });
  expect(restarted).toEqual({ checkpointActivated: false, falls: 0, x: restarted.startX, startX: restarted.startX });
});

test('Penguins persists mute and campaign progress across reloads', async ({ page }) => {
  await launchPenguinsOfTangram(page, 'Lion');

  await page.getByRole('button', { name: 'Mute sound' }).click();
  await expect(page.getByRole('button', { name: 'Turn sound on' })).toBeVisible();
  await page.evaluate(() => {
    const hook = (window as unknown as { __penguinsOfTangram?: { completeCurrentLevel?: () => void } })
      .__penguinsOfTangram;
    hook?.completeCurrentLevel?.();
  });
  await expect(page.getByText('School Gate Morning Run cleared!')).toBeVisible();
  await expect(page.getByText(/Personal best:/)).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Play Penguins of Tangram' }).click();
  await expect(page.getByRole('heading', { name: 'Penguins of Tangram' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn sound on' })).toBeVisible();
  await page.waitForFunction(() => {
    const hook = (window as unknown as {
      __penguinsOfTangram?: { state?: string; completedLevelIds?: string[] };
    })
      .__penguinsOfTangram;
    return hook?.completedLevelIds?.includes('school-gate-morning-run') === true;
  });
  await page.getByRole('button', { name: 'Open school map' }).click();
  await expect(page.getByText(/Personal best:/)).toBeVisible();
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await page.getByRole('button', { name: 'Motion: Normal' }).click();
  await page.getByRole('button', { name: 'Route notes: Off' }).click();
  await expect(page.getByRole('button', { name: 'Motion: Reduced' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Route notes: On' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset campaign' }).click();
  await page.waitForFunction(() => {
    const hook = (window as unknown as {
      __penguinsOfTangram?: { state?: string; completedLevelIds?: string[] };
    })
      .__penguinsOfTangram;
    return hook?.state === 'select' && hook.completedLevelIds?.length === 0;
  });
});

test('Sports Day exposes boss telegraph state and locks the final bell', async ({ page }) => {
  await page.goto('/quarterless/');
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        selectedCharacterId: 'penguin',
        audioMuted: false,
        completedLevelIds: [
          'school-gate-morning-run',
          'playground-adventure',
          'classroom-maze',
          'library-art-room-secrets',
        ],
        bestByLevel: {},
      }),
    );
  }, PROGRESS_KEY);
  await page.getByRole('button', { name: 'Play Penguins of Tangram' }).click();
  await page.getByRole('button', { name: /^Penguin/ }).click();
  await page.getByRole('button', { name: 'Open school map' }).click();
  await page.getByRole('button', { name: 'Play Sports Day Finale' }).click();

  await page.waitForFunction(() => {
    const hook = (window as unknown as {
      __penguinsOfTangram?: {
        state?: string;
        bossActive?: boolean;
        bossHitsRemaining?: number;
      };
    }).__penguinsOfTangram;
    return hook?.state === 'running' && hook.bossActive === true && hook.bossHitsRemaining === 3;
  });

  const telegraph = await page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      simulation: { boss?: { warningRemaining: number; charging: boolean } };
      bossTelegraphLabel?: { visible: boolean; text: string };
      update(time: number, deltaMs: number): void;
    };
    if (!scene.simulation.boss) throw new Error('Missing finale boss');
    scene.simulation.boss.warningRemaining = 1;
    scene.simulation.boss.charging = false;
    scene.update(50, 17);
    return { text: scene.bossTelegraphLabel?.text, visible: scene.bossTelegraphLabel?.visible };
  });
  expect(telegraph).toEqual({ text: 'CHARGE READY', visible: true });

  const goalLocked = await page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      level: { goal: { x: number; y: number } };
      simulation: { player: { x: number; y: number } };
      update(time: number, deltaMs: number): void;
    };
    scene.simulation.player.x = scene.level.goal.x;
    scene.simulation.player.y = scene.level.goal.y;
    scene.update(100, 17);
    return (window as unknown as { __penguinsOfTangram?: { state?: string } }).__penguinsOfTangram?.state;
  });
  expect(goalLocked).toBe('running');
});

test('Sports Day keeps the largest zone render loop responsive', async ({ page }) => {
  await page.goto('/quarterless/');
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        selectedCharacterId: 'penguin',
        audioMuted: true,
        completedLevelIds: [
          'school-gate-morning-run',
          'playground-adventure',
          'classroom-maze',
          'library-art-room-secrets',
        ],
        bestByLevel: {},
      }),
    );
  }, PROGRESS_KEY);
  await page.getByRole('button', { name: 'Play Penguins of Tangram' }).click();
  await page.getByRole('button', { name: /^Penguin/ }).click();
  await page.getByRole('button', { name: 'Open school map' }).click();
  await page.getByRole('button', { name: 'Play Sports Day Finale' }).click();
  await page.waitForFunction(() => (
    (window as unknown as { __penguinsOfTangram?: { state?: string } }).__penguinsOfTangram?.state === 'running'
  ));

  const result = await page.evaluate(async () => {
    const game = (window as unknown as {
      __game?: { loop?: { actualFps?: number }; scene: { getScene(name: string): unknown } };
    }).__game;
    const scene = game?.scene.getScene('PenguinsOfTangram') as {
      level?: { worldWidth?: number };
    };
    const samples: number[] = [];
    for (let frame = 0; frame < 45; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (typeof game?.loop?.actualFps === 'number') samples.push(game.loop.actualFps);
    }
    samples.sort((a, b) => a - b);
    return {
      p10: samples[Math.floor(samples.length * 0.1)] ?? 0,
      samples: samples.length,
      worldWidth: scene?.level?.worldWidth ?? 0,
    };
  });

  expect(result.worldWidth).toBeGreaterThan(3000);
  expect(result.samples).toBeGreaterThan(20);
  expect(result.p10).toBeGreaterThan(0);
});

test.describe('reduced motion', () => {
  test('publishes reduced-motion mode to the game hook', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await launchPenguinsOfTangram(page);
    await expect.poll(async () => page.evaluate(() => (
      window as unknown as { __penguinsOfTangram?: { reducedMotion?: boolean } }
    ).__penguinsOfTangram?.reducedMotion)).toBe(true);
  });
});

test.describe('coarse pointer controls', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('renders and forwards touch controls', async ({ page }) => {
    await launchPenguinsOfTangram(page);
    const left = page.locator('[data-control="left"]');
    await expect(left).toBeVisible();
    await left.dispatchEvent('pointerdown', { pointerType: 'touch' });
    await expect.poll(async () => page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        touchControls: { left: boolean };
      }).touchControls.left;
    })).toBe(true);
    await left.dispatchEvent('pointerup', { pointerType: 'touch' });
  });
});
