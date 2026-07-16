import { expect, test } from '@playwright/test';
import { launchPenguinsOfTangram } from './helpers';

const PROGRESS_KEY = 'penguins-of-tangram.progress';

test('Penguins shrinks moving gameplay visuals without changing the laptop camera', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await launchPenguinsOfTangram(page);
  const view = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: { scene: { getScene(name: string): unknown } };
    }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      enemies: Array<{ sprite: { scaleX: number; scaleY: number } }>;
      player: { scaleX: number; scaleY: number };
      cameras: { main: { zoom: number } };
      scale: { width: number; height: number };
    };
    return {
      cameraZoom: scene.cameras.main.zoom,
      enemyScales: scene.enemies.map(({ sprite }) => ({ x: Math.abs(sprite.scaleX), y: sprite.scaleY })),
      playerScale: { x: Math.abs(scene.player.scaleX), y: scene.player.scaleY },
      baseZoom: Math.max(1, scene.scale.width / 960, scene.scale.height / 540),
    };
  });

  expect(view.cameraZoom).toBeCloseTo(view.baseZoom, 3);
  expect(view.playerScale).toEqual({ x: 0.7, y: 0.7 });
  expect(view.enemyScales).toEqual(expect.arrayContaining([{ x: 0.7, y: 0.7 }]));
});

test('Penguins follows the running player from the horizontal center', async ({ page }) => {
  await launchPenguinsOfTangram(page);
  const followOffset = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: { scene: { getScene(name: string): unknown } };
    }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      cameras: { main: { followOffset: { x: number; y: number } } };
    };
    return scene.cameras.main.followOffset;
  });

  expect(followOffset).toEqual({ x: 0, y: 30 });
});

test('Penguins defaults to Dutch and can switch to English with persistence', async ({ page }) => {
  await page.goto('/quarterless/');
  await page.getByRole('button', { name: 'Play Penguins of Tangram' }).click();
  await expect(page.getByRole('heading', { name: 'Pinguins van Tangram' })).toBeVisible();
  await expect(page.locator('.tangram-platformer-character-art svg')).toHaveCount(6);
  await expect(page.locator('.tangram-platformer-character-art path')).toHaveCount(0);
  await expect(page.locator('.tangram-platformer-character small')).toHaveCount(0);
  const previewLayers = await page.locator('.tangram-platformer-character').evaluateAll((cards) => (
    Object.fromEntries(cards.map((card) => [
      card.getAttribute('data-character-id'),
      card.querySelector('svg')?.children.length ?? 0,
    ]))
  ));
  for (const id of ['crocodile', 'monkey', 'turtle', 'kangaroo', 'lion']) {
    expect(previewLayers[id]).toBeGreaterThanOrEqual(16);
  }
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

test('Penguins keeps the ground still while jumping', async ({ page }) => {
  await launchPenguinsOfTangram(page);
  const initial = await page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      simulation: { player: { y: number } };
      cameras: { main: { scrollY: number; lerp: { y: number } } };
    };
    return { playerY: scene.simulation.player.y, cameraY: scene.cameras.main.scrollY, cameraLerpY: scene.cameras.main.lerp.y };
  });

  await page.locator('#game canvas').click();
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);

  const jumped = await page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      simulation: { player: { y: number } };
      cameras: { main: { scrollY: number; lerp: { y: number } } };
    };
    return { playerY: scene.simulation.player.y, cameraY: scene.cameras.main.scrollY, cameraLerpY: scene.cameras.main.lerp.y };
  });

  expect(jumped.playerY).toBeLessThan(initial.playerY);
  expect(initial.cameraLerpY).toBe(0);
  expect(jumped.cameraLerpY).toBe(0);
  expect(jumped.cameraY).toBeCloseTo(initial.cameraY, 6);
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

test('Penguin has a distinct layered character design', async ({ page }) => {
  await launchPenguinsOfTangram(page);
  const penguin = await page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      player: { list: unknown[] };
      playerBody: { width: number; height: number; type: string };
      playerBelly: { width: number; height: number; type: string };
      playerInnerFlippers?: Array<{ fillColor: number }>;
    };
    return {
      body: { width: scene.playerBody.width, height: scene.playerBody.height, type: scene.playerBody.type },
      belly: { width: scene.playerBelly.width, height: scene.playerBelly.height, type: scene.playerBelly.type },
      whiteInnerArms: scene.playerInnerFlippers?.filter((flipper) => flipper.fillColor === 0xf7fbff).length,
      layers: scene.player.list.length,
    };
  });

  expect(penguin.body).toEqual({ width: 46, height: 70, type: 'Ellipse' });
  expect(penguin.belly).toEqual({ width: 32, height: 48, type: 'Ellipse' });
  expect(penguin.whiteInnerArms).toBe(2);
  expect(penguin.layers).toBeGreaterThanOrEqual(20);
});

test('Penguin lifts alternating feet while walking', async ({ page }) => {
  await launchPenguinsOfTangram(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      playerFeet: Array<{ y: number }>;
    };
    return Math.abs(scene.playerFeet[0].y - scene.playerFeet[1].y);
  })).toBeGreaterThan(8);
  await page.keyboard.up('ArrowRight');
});

test('Penguin steps while walking with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await launchPenguinsOfTangram(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      playerFeet: Array<{ y: number }>;
      reducedMotion: boolean;
    };
    return {
      footSeparation: Math.abs(scene.playerFeet[0].y - scene.playerFeet[1].y),
      reducedMotion: scene.reducedMotion,
    };
  })).toEqual(expect.objectContaining({ footSeparation: expect.any(Number), reducedMotion: true }));
  await expect.poll(async () => page.evaluate(() => {
    const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game.scene.getScene('PenguinsOfTangram') as {
      playerFeet: Array<{ y: number }>;
    };
    return Math.abs(scene.playerFeet[0].y - scene.playerFeet[1].y);
  })).toBeGreaterThan(8);
  await page.keyboard.up('ArrowRight');
});

for (const character of ['Crocodile', 'Monkey', 'Turtle', 'Kangaroo', 'Lion'] as const) {
  test(`${character} lifts alternating feet while walking`, async ({ page }) => {
    await launchPenguinsOfTangram(page, character);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      const scene = game.scene.getScene('PenguinsOfTangram') as {
        playerFeet: Array<{ y: number }>;
      };
      return Math.abs(scene.playerFeet[0].y - scene.playerFeet[1].y);
    })).toBeGreaterThan(5);
    await page.keyboard.up('ArrowRight');
  });
}

test('Penguins can finish the opening route without collecting field badges', async ({ page }) => {
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
  await expect(page.locator('.tangram-platformer-overlay--complete [data-field="badges"]')).toHaveText('3/79');
  await page.waitForTimeout(1_100);
  await expect(page.getByText('School Gate Morning Run cleared!')).toBeVisible();
  await expect(page.getByText('Level complete')).toBeVisible();
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
  await page.getByRole('button', { name: 'Reset game' }).click();
  await expect(page.getByText('Reset the game and start again?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, reset game' }).click();
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

test('Sports Day keeps the largest level render loop responsive', async ({ page }) => {
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

  test('keeps the complete backdrop aligned on narrow screens', async ({ page }) => {
    await launchPenguinsOfTangram(page);
    const backdrop = await page.evaluate(() => {
      const game = (window as unknown as {
        __game: { scene: { getScene(name: string): unknown } };
      }).__game;
      const scene = game.scene.getScene('PenguinsOfTangram') as {
        backdropLandmark: { x: number; y: number; scrollFactorX: number; scrollFactorY: number };
        cloudClusters: Array<{ scrollFactorX: number; scrollFactorY: number }>;
        cameras: { main: { zoom: number; scrollX: number; scrollY: number } };
        scale: { width: number; height: number };
      };
      const camera = scene.cameras.main;
      const landmark = scene.backdropLandmark;
      return {
        clouds: scene.cloudClusters.map(({ scrollFactorX, scrollFactorY }) => ({ scrollFactorX, scrollFactorY })),
        landmark: {
          screenX: (landmark.x + camera.scrollX) * camera.zoom,
          screenY: (landmark.y + camera.scrollY) * camera.zoom,
          scrollFactorX: landmark.scrollFactorX,
          scrollFactorY: landmark.scrollFactorY,
        },
        viewport: { width: scene.scale.width, height: scene.scale.height },
      };
    });

    expect(backdrop.viewport).toEqual({ width: 390, height: 844 });
    expect(backdrop.clouds).toEqual([
      { scrollFactorX: 0, scrollFactorY: 0 },
      { scrollFactorX: 0, scrollFactorY: 0 },
    ]);
    expect(backdrop.landmark.screenX).toBeCloseTo(195, 1);
    expect(backdrop.landmark.screenY).toBeCloseTo(329.16, 1);
    expect(backdrop.landmark.scrollFactorX).toBe(0);
    expect(backdrop.landmark.scrollFactorY).toBe(0);
  });

  test('renders and forwards touch controls', async ({ page }) => {
    await launchPenguinsOfTangram(page);
    const moveZone = page.locator('[data-control="move"]');
    const jumpButton = page.locator('[data-control="jump"]');
    await expect(moveZone).toBeVisible();
    const moveBox = await moveZone.boundingBox();
    const jumpBox = await jumpButton.boundingBox();
    expect(moveBox?.width).toBeCloseTo((jumpBox?.width ?? 0) * 1.5, 0);
    const before = await page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        simulation: { player: { x: number } };
      }).simulation.player.x;
    });
    await page.mouse.move(
      (moveBox?.x ?? 0) + (moveBox?.width ?? 0) * 0.64,
      (moveBox?.y ?? 0) + (moveBox?.height ?? 0) / 2,
    );
    await page.mouse.down();
    await expect.poll(async () => page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        touchControls: { right: boolean };
      }).touchControls.right;
    })).toBe(true);
    await page.mouse.move(
      (moveBox?.x ?? 0) + (moveBox?.width ?? 0) + 80,
      (moveBox?.y ?? 0) + (moveBox?.height ?? 0) / 2,
    );
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
    const touchDefaults = await page.locator('#game').evaluate((stage) => {
      const dispatch = (type: string, touchCount: number): boolean => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', { value: { length: touchCount } });
        stage.dispatchEvent(event);
        return event.defaultPrevented;
      };
      dispatch('touchstart', 1);
      const firstTap = dispatch('touchend', 0);
      dispatch('touchstart', 1);
      const secondTap = dispatch('touchend', 0);
      dispatch('touchstart', 2);
      dispatch('touchend', 1);
      const pinchEnd = dispatch('touchend', 0);
      return { firstTap, secondTap, pinchEnd };
    });
    expect(touchDefaults).toEqual({ firstTap: false, secondTap: true, pinchEnd: false });
    const controlTouchDefault = await jumpButton.evaluate((button) => {
      const event = new Event('touchend', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: { length: 1 } });
      button.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(controlTouchDefault).toBe(true);
    await expect(moveZone).toHaveCSS('touch-action', 'none');
    await expect(jumpButton).toHaveCSS('touch-action', 'none');
    await moveZone.dispatchEvent('lostpointercapture', { pointerId: 1, buttons: 1 });
    await expect.poll(async () => page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        touchControls: { right: boolean };
      }).touchControls.right;
    })).toBe(true);
    expect(await page.evaluate(() => document.dispatchEvent(
      new Event('gesturestart', { cancelable: true }),
    ))).toBe(true);
    await expect(page.locator('#game')).toHaveCSS('touch-action', 'pinch-zoom');
    await moveZone.dispatchEvent('lostpointercapture', { pointerId: 1, buttons: 0 });
    await expect.poll(async () => page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      const controls = (game.scene.getScene('PenguinsOfTangram') as {
        touchControls: { left: boolean; right: boolean };
      }).touchControls;
      return { left: controls.left, right: controls.right };
    })).toEqual({ left: false, right: false });
    await page.mouse.up();
    await expect.poll(async () => page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      const controls = (game.scene.getScene('PenguinsOfTangram') as {
        touchControls: { left: boolean; right: boolean };
      }).touchControls;
      return { left: controls.left, right: controls.right };
    })).toEqual({ left: false, right: false });
  });

  test('pans to a respawn checkpoint before revealing the player', async ({ page }) => {
    await launchPenguinsOfTangram(page);
    await page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      const scene = game.scene.getScene('PenguinsOfTangram') as {
        level: { worldHeight: number };
        simulation: { player: { x: number; y: number } };
        cameras: { main: { centerOn(x: number, y: number): void; centerY: number } };
      };
      scene.simulation.player.x = 760;
      scene.cameras.main.centerOn(800, scene.cameras.main.centerY);
      scene.simulation.player.y = scene.level.worldHeight + 200;
    });
    await expect.poll(async () => page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        simulation: { falls: number };
      }).simulation.falls;
    })).toBe(1);
    expect(await page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      const scene = game.scene.getScene('PenguinsOfTangram') as {
        player: { visible: boolean; x: number };
        respawnTransition: boolean;
        reducedMotion: boolean;
        cameras: { main: { scrollX: number; panEffect: { isRunning: boolean; duration: number } } };
      };
      return {
        visible: scene.player.visible,
        playerX: scene.player.x,
        transitioning: scene.respawnTransition,
        reducedMotion: scene.reducedMotion,
        scrollX: scene.cameras.main.scrollX,
        panning: scene.cameras.main.panEffect.isRunning,
        duration: scene.cameras.main.panEffect.duration,
      };
    })).toMatchObject({
      visible: true,
      transitioning: true,
      reducedMotion: false,
      panning: true,
      duration: 2000,
    });
    const initialPlayerX = await page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        player: { x: number };
      }).player.x;
    });
    const initialScrollX = await page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        cameras: { main: { scrollX: number } };
      }).cameras.main.scrollX;
    });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        cameras: { main: { scrollX: number } };
      }).cameras.main.scrollX;
    })).toBeLessThan(initialScrollX);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        player: { x: number };
      }).player.x;
    })).toBeLessThan(initialPlayerX);
    await expect.poll(async () => page.evaluate(() => {
      const game = (window as unknown as { __game: { scene: { getScene(name: string): unknown } } }).__game;
      return (game.scene.getScene('PenguinsOfTangram') as {
        respawnTransition: boolean;
      }).respawnTransition;
    }), { timeout: 15_000 }).toBe(false);
  });
});
