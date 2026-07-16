import { expect, test } from '@playwright/test';
import { launchPenguinsOfTangram } from './helpers';

const PROGRESS_KEY = 'penguins-of-tangram.progress';

test('Penguins defaults to Dutch and can switch to English with persistence', async ({ page }) => {
  await page.goto('/quarterless/');
  await page.getByRole('button', { name: 'Play Penguins of Tangram' }).click();
  await expect(page.getByRole('heading', { name: 'Pinguins van Tangram' })).toBeVisible();
  await expect(page.locator('.tangram-platformer-character-art svg')).toHaveCount(6);
  await expect(page.locator('.tangram-platformer-character-art path')).toHaveCount(0);
  await expect(page.locator('.tangram-platformer-character small')).toHaveCount(0);
  await page.waitForFunction(() => (
    (window as unknown as { __penguinsOfTangram?: { language?: string } }).__penguinsOfTangram?.language === 'nl'
  ));
  await page.getByRole('button', { name: 'Nederlands / English' }).click();
  await expect(page.getByRole('heading', { name: 'Penguins of Tangram' })).toBeVisible();
  await page.getByRole('button', { name: /^Penguin/ }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Play Penguins of Tangram' }).click();
  await page.getByRole('button', { name: /^Penguin/ }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
});

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

test('Penguins keeps the arcade return inside the pause menu', async ({ page }) => {
  await launchPenguinsOfTangram(page);

  await expect(page.getByRole('button', { name: 'Back to arcade' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause' }).click();
  const arcadeReturn = page.getByRole('button', { name: 'Back to arcade hall' });
  await expect(page.locator('.tangram-platformer-action-row--settings').getByRole('button', { name: 'Back to arcade hall' })).toBeVisible();
  await arcadeReturn.click();
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible();
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

test('Penguins can finish the opening route without collecting every bonus badge', async ({ page }) => {
  await launchPenguinsOfTangram(page);
  await page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      level: { goal: { x: number; y: number } };
      simulation: { finished: boolean; player: { x: number; y: number; collected: boolean[] } };
      update(time: number, deltaMs: number): void;
    };
    scene.simulation.player.x = scene.level.goal.x;
    scene.simulation.player.y = scene.level.goal.y;
    for (let tick = 0; tick < 240 && !scene.simulation.finished; tick += 1) {
      scene.update(100 + tick * 17, 17);
    }
  });
  await expect(page.getByText('School Gate Morning Run cleared!')).toBeVisible();
  await expect(page.locator('.tangram-platformer-overlay--complete [data-field="badges"]')).toHaveText('0/12');
  await page.waitForTimeout(1_100);
  await expect(page.getByText('School Gate Morning Run cleared!')).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForFunction(() => (
    (window as unknown as { __penguinsOfTangram?: { state?: string } }).__penguinsOfTangram?.state === 'running'
  ));
});

test('Penguins persists mute and campaign progress across reloads', async ({ page }) => {
  await launchPenguinsOfTangram(page, 'Lion');

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Mute sound' }).click();
  await expect(page.getByRole('button', { name: 'Turn sound on' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume run' }).click();
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
  await expect(page.getByRole('button', { name: 'Turn sound on' })).toHaveCount(0);
  await page.waitForFunction(() => {
    const hook = (window as unknown as {
      __penguinsOfTangram?: { state?: string; completedLevelIds?: string[] };
    })
      .__penguinsOfTangram;
    return hook?.completedLevelIds?.includes('school-gate-morning-run') === true;
  });
  await page.getByRole('button', { name: /^Penguin/ }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn sound on' })).toBeVisible();
  await page.getByRole('button', { name: 'Motion: Normal' }).click();
  await expect(page.getByRole('button', { name: 'Motion: Reduced' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset campaign' }).click();
  await expect(page.getByText('Reset the adventure and start again?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, reset campaign' }).click();
  await page.waitForFunction(() => {
    const hook = (window as unknown as {
      __penguinsOfTangram?: { state?: string; completedLevelIds?: string[] };
    })
      .__penguinsOfTangram;
    return hook?.state === 'select' && hook.completedLevelIds?.length === 0;
  });
});

test('Sports Day exposes a boss and always accepts the final flag', async ({ page }) => {
  await page.goto('/quarterless/');
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        selectedCharacterId: 'penguin',
        language: 'en',
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

  await page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      level: { goal: { x: number; y: number } };
      simulation: { player: { x: number; y: number } };
      update(time: number, deltaMs: number): void;
    };
    scene.simulation.player.x = scene.level.goal.x;
    scene.simulation.player.y = scene.level.goal.y;
    scene.update(100, 17);
  });
  await page.waitForFunction(
    () => (window as unknown as { __penguinsOfTangram?: { state?: string } }).__penguinsOfTangram?.state === 'campaign-complete',
  );
});

test('Sports Day keeps the largest zone render loop responsive', async ({ page }) => {
  await page.goto('/quarterless/');
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        selectedCharacterId: 'penguin',
        language: 'en',
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
    const moveZone = page.locator('[data-control="move"]');
    await expect(moveZone).toBeVisible();
    const before = await page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        simulation: { player: { x: number } };
      }).simulation.player.x;
    });
    await moveZone.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 350 });
    await expect.poll(async () => page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        touchControls: { right: boolean };
      }).touchControls.right;
    })).toBe(true);
    await moveZone.dispatchEvent('pointerleave', { pointerType: 'touch' });
    await expect.poll(async () => page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        touchControls: { right: boolean };
      }).touchControls.right;
    })).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        simulation: { player: { x: number } };
      }).simulation.player.x;
    })).toBeGreaterThan(before);
    await moveZone.dispatchEvent('pointerup', { pointerType: 'touch' });
  });
});
