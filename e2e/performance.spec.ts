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
