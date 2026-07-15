import { test, expect } from '@playwright/test';
import { launchPenguinsOfTangram, launchSindicate } from './helpers';

test('Penguins fixed-step simulation drops stale backlog after long frames', async ({ page }) => {
  await launchPenguinsOfTangram(page, 'Penguin');

  const result = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('PenguinsOfTangram') as {
      accumulator?: number;
      update(time: number, deltaMs: number): void;
    };

    const ownsAccumulator = typeof scene.accumulator === 'number';
    scene.accumulator = 0;
    for (let frame = 1; frame <= 20; frame += 1) {
      scene.update(frame * 250, 250);
    }

    return { accumulator: scene.accumulator, ownsAccumulator };
  });

  expect(result.ownsAccumulator).toBe(true);
  expect(result.accumulator).toBeLessThan(1 / 60);
});

test('Penguins publishes power state only on pickup and expiry transitions', async ({ page }) => {
  await launchPenguinsOfTangram(page, 'Penguin');

  const result = await page.evaluate(() => {
    type Simulation = {
      player: { x: number; y: number };
      powerRemaining: number;
    };
    type Scene = {
      simulation: Simulation;
      scene: { pause(): void };
      update(time: number, deltaMs: number): void;
    };
    const game = (window as unknown as { __game: { scene: { getScene(name: string): Scene } } })
      .__game;
    const scene = game.scene.getScene('PenguinsOfTangram');
    scene.scene.pause();

    const hookWindow = window as unknown as { __penguinsOfTangram?: unknown };
    let hookValue = hookWindow.__penguinsOfTangram;
    let writes = 0;
    Object.defineProperty(hookWindow, '__penguinsOfTangram', {
      configurable: true,
      get: () => hookValue,
      set: (value: unknown) => {
        hookValue = value;
        writes += 1;
      },
    });

    for (let frame = 0; frame < 10; frame += 1) scene.update(frame * 17, 17);
    const idleWrites = writes;

    scene.simulation.player.x = 1160;
    scene.simulation.player.y = 176;
    scene.update(200, 17);
    const pickupWrites = writes - idleWrites;
    const pickupLabel = document.querySelector<HTMLElement>('[data-field="power"]')?.textContent;

    scene.simulation.powerRemaining = 0.001;
    scene.update(217, 17);
    const expiryWrites = writes - idleWrites - pickupWrites;
    const expiryLabel = document.querySelector<HTMLElement>('[data-field="power"]')?.textContent;

    return { expiryLabel, expiryWrites, idleWrites, pickupLabel, pickupWrites };
  });

  expect(result.idleWrites).toBe(0);
  expect(result.pickupWrites).toBe(1);
  expect(result.pickupLabel).toBe('Super snack active');
  expect(result.expiryWrites).toBe(1);
  expect(result.expiryLabel).toBe('No power-up');
});

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

test('Sindicate FPS counter is off by default and toggles with F3', async ({ page }) => {
  await launchSindicate(page);

  const hidden = await page.evaluate(() => {
    const scene = (
      window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
    ).__game?.scene.getScene('City') as {
      fpsText?: { visible?: boolean; text?: string };
    };
    return { text: scene?.fpsText?.text ?? '', visible: scene?.fpsText?.visible ?? false };
  });
  expect(hidden).toEqual({ text: '', visible: false });

  await page.keyboard.press('F3');
  await page.waitForFunction(() => {
    const scene = (
      window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
    ).__game?.scene.getScene('City') as {
      fpsText?: { visible?: boolean; text?: string };
    };
    return scene?.fpsText?.visible === true && /^FPS \d+$/.test(scene.fpsText.text ?? '');
  });

  const shown = await page.evaluate(() => {
    const scene = (
      window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
    ).__game?.scene.getScene('City') as {
      fpsText?: { visible?: boolean; text?: string };
    };
    return { text: scene?.fpsText?.text ?? '', visible: scene?.fpsText?.visible ?? false };
  });
  expect(shown.visible).toBe(true);
  expect(shown.text).toMatch(/^FPS \d+$/);

  await page.keyboard.press('F3');
  await page.waitForFunction(() => {
    const scene = (
      window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
    ).__game?.scene.getScene('City') as {
      fpsText?: { visible?: boolean };
    };
    return scene?.fpsText?.visible === false;
  });
});

test('Sindicate FPS counter can be toggled from the story launch menu', async ({ page }) => {
  await page.goto('/quarterless/');
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Play Sindicate' }).click();
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });

  const fpsButton = page.locator('[data-story-action="fps"]');
  await expect(fpsButton).toHaveText('FPS Counter: OFF');
  await fpsButton.click();
  await expect(page.locator('[data-story-action="fps"]')).toHaveText('FPS Counter: ON');
  await page.getByRole('button', { name: /Start Story|Continue Story|Resume Current Run/ }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => {
    const scene = (
      window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
    ).__game?.scene.getScene('City') as {
      fpsText?: { visible?: boolean; text?: string };
    };
    return scene?.fpsText?.visible === true && /^FPS \d+$/.test(scene.fpsText.text ?? '');
  });
});

test('Sindicate keeps the live render cadence above the severe-stall floor', async ({ page }) => {
  await launchSindicate(page);

  const result = await page.evaluate(async () => {
    const game = (window as unknown as {
      __game?: { loop?: { actualFps?: number } };
    }).__game;
    const samples: number[] = [];
    for (let frame = 0; frame < 90; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const fps = game?.loop?.actualFps;
      if (typeof fps === 'number' && Number.isFinite(fps)) samples.push(fps);
    }
    samples.sort((a, b) => a - b);
    return {
      p10: samples[Math.floor(samples.length * 0.1)] ?? 0,
      samples: samples.length,
    };
  });

  expect(result.samples).toBeGreaterThan(30);
  expect(result.p10).toBeGreaterThanOrEqual(20);
});

test('full-world autosaves stay below the per-second hitch budget', async ({ page }) => {
  await launchSindicate(page);

  const saveCount = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      saveAccumulator: number;
      persistGameState: () => void;
      update(time: number, deltaMs: number): void;
    };
    let saves = 0;
    scene.saveAccumulator = 0;
    scene.persistGameState = () => {
      saves += 1;
      scene.saveAccumulator = 0;
    };
    for (let frame = 1; frame <= 300; frame += 1) {
      scene.update(frame * (1000 / 60), 1000 / 60);
    }
    return saves;
  });

  expect(saveCount).toBeLessThanOrEqual(3);
});

test('visual particles update and compact in place', async ({ page }) => {
  await launchSindicate(page);

  const result = await page.evaluate(() => {
    type TestParticle = {
      pos: { x: number; y: number };
      vel: { x: number; y: number };
      age: number;
      life: number;
      radius: number;
      color: number;
      alpha: number;
      stretch: number;
    };
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      visualParticles: TestParticle[];
      syncFeedbackParticles(dt: number): void;
    };
    const pos = { x: 10, y: 20 };
    const vel = { x: 30, y: -10 };
    const liveParticle: TestParticle = {
      pos,
      vel,
      age: 0,
      life: 1,
      radius: 2,
      color: 0xffffff,
      alpha: 1,
      stretch: 4,
    };
    const expiredParticle: TestParticle = {
      ...liveParticle,
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      age: 0.99,
      life: 1,
    };

    scene.visualParticles = [liveParticle, expiredParticle];
    scene.syncFeedbackParticles(1 / 60);

    return {
      count: scene.visualParticles.length,
      retainedParticle: scene.visualParticles[0] === liveParticle,
      retainedPosition: scene.visualParticles[0]?.pos === pos,
      retainedVelocity: scene.visualParticles[0]?.vel === vel,
      moved: scene.visualParticles[0]?.pos.x > 10,
    };
  });

  expect(result).toEqual({
    count: 1,
    retainedParticle: true,
    retainedPosition: true,
    retainedVelocity: true,
    moved: true,
  });
});

test('visual feedback reuses its frame-state collections', async ({ page }) => {
  await launchSindicate(page);

  const result = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as {
      world: { ammoPickups: Array<{ pos: { x: number; y: number }; amount: number }> };
      prevAmmoPickups: { clear(): void };
      prevCarHealth: number[];
      prevCarHeadings: number[];
      visualParticles: unknown[];
      syncVisualFeedback(dt: number): void;
    };

    const pickup = { pos: { x: 100, y: 100 }, amount: 12 };
    scene.prevAmmoPickups.clear();
    scene.world.ammoPickups = [pickup];
    scene.syncVisualFeedback(1 / 60);
    const ammoPickups = scene.prevAmmoPickups;
    const carHealth = scene.prevCarHealth;
    const carHeadings = scene.prevCarHeadings;
    scene.visualParticles = [];
    scene.world.ammoPickups = [];
    scene.syncVisualFeedback(1 / 60);

    return {
      ammoPickups: scene.prevAmmoPickups === ammoPickups,
      carHealth: scene.prevCarHealth === carHealth,
      carHeadings: scene.prevCarHeadings === carHeadings,
      pickupBurstCount: scene.visualParticles.length,
    };
  });

  expect(result).toEqual({
    ammoPickups: true,
    carHealth: true,
    carHeadings: true,
    pickupBurstCount: 8,
  });
});

test('transient combat effects stay bounded during sustained activity', async ({ page }) => {
  await launchSindicate(page);

  const result = await page.evaluate(() => {
    type Scene = {
      world: {
        bullets: Array<{
          pos: { x: number; y: number };
          velocity: { x: number; y: number };
          life: number;
          damage: number;
        }>;
        explosions: Array<{
          pos: { x: number; y: number };
          radius: number;
          age: number;
          life: number;
        }>;
      };
      bulletSprites: unknown[];
      explosionSprites: unknown[];
      syncBullets(): void;
      syncExplosions(): void;
    };
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } })
      .__game;
    const scene = game?.scene.getScene('City') as Scene;
    const baselineChildren = (scene as unknown as { children: { list: unknown[] } }).children.list.length;
    let maxChildren = baselineChildren;
    let maxBulletSprites = scene.bulletSprites.length;
    let maxExplosionSprites = scene.explosionSprites.length;

    for (let frame = 0; frame < 600; frame += 1) {
      scene.world.bullets = [
        { pos: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, life: 1, damage: 0 },
      ];
      scene.world.explosions = [
        { pos: { x: 0, y: 0 }, radius: 18, age: 0, life: 1 },
      ];
      scene.syncBullets();
      scene.syncExplosions();
      scene.world.bullets = [];
      scene.world.explosions = [];
      scene.syncBullets();
      scene.syncExplosions();

      const children = (scene as unknown as { children: { list: unknown[] } }).children.list.length;
      maxChildren = Math.max(maxChildren, children);
      maxBulletSprites = Math.max(maxBulletSprites, scene.bulletSprites.length);
      maxExplosionSprites = Math.max(maxExplosionSprites, scene.explosionSprites.length);
    }

    return {
      baselineChildren,
      finalChildren: (scene as unknown as { children: { list: unknown[] } }).children.list.length,
      maxChildren,
      maxBulletSprites,
      maxExplosionSprites,
    };
  });

  expect(result.maxChildren).toBeLessThanOrEqual(result.baselineChildren + 2);
  expect(result.finalChildren).toBeLessThanOrEqual(result.baselineChildren + 2);
  expect(result.maxBulletSprites).toBeLessThanOrEqual(1);
  expect(result.maxExplosionSprites).toBeLessThanOrEqual(1);
});
