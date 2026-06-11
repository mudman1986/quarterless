import { test, expect, type Page } from '@playwright/test';

/**
 * Regression tests for the wanted level resetting. These drive the REAL built
 * game (not the World class in isolation) through the inspection hook
 * `window.__game`, because the reported bug only shows up in the running game —
 * exactly the gap that the `World` unit tests cannot see.
 */

/** Minimal structural view of the bits of the running game we poke at. */
interface GameProbe {
  scene: {
    getScene(key: string): {
      paused: boolean;
      timeOfDay: number;
      world: {
        wanted: { heat: number };
        wantedStars: number;
        status: string;
        health: { current: number; max: number };
        police: { pos: { x: number; y: number }; heading: number; radius: number; kind: string }[];
        cars: { pos: { x: number; y: number }; heading: number; speed: number; radius: number }[];
        focus: { x: number; y: number };
      };
    };
  };
}

const GAME = '() => window.__game';

async function boot(page: Page): Promise<void> {
  await page.goto('/sindicate/');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#game canvas').click(); // give Phaser keyboard focus
  await page.keyboard.press('Space'); // unlock audio / first input
  await page.waitForFunction(GAME);
  await page.waitForTimeout(300);
}

/** Read the live wanted-star count and status from the running game. */
async function readState(page: Page): Promise<{ stars: number; status: string }> {
  return page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return { stars: w.wantedStars, status: w.status };
  });
}

test('wanted level resets after a new game', async ({ page }) => {
  await boot(page);
  // Make the player wanted, then start a new game with the N key.
  await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    g.scene.getScene('City').world.wanted.heat = 500; // ~5 stars
  });
  expect((await readState(page)).stars).toBeGreaterThan(0); // wanted before
  await page.keyboard.press('n'); // new game
  await page.waitForTimeout(500);
  expect((await readState(page)).stars).toBe(0); // wanted cleared after new game
});

test('the player does not become wanted just by standing still', async ({ page }) => {
  await boot(page);
  // Let the living city run for a while: NPC cars crash, pedestrians get run
  // over by traffic, etc. None of it is the player's doing, so no heat.
  await page.waitForTimeout(6000);
  const { stars } = await readState(page);
  expect(stars).toBe(0); // idle player is never wanted
});

test('wanted level resets when the player is busted', async ({ page }) => {
  await boot(page);
  // Make the player wanted and drop an officer on foot right on top of them.
  await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    w.wanted.heat = 250; // ~2 stars
    const f = w.focus;
    w.police.push({ pos: { x: f.x, y: f.y }, heading: 0, radius: 12, kind: 'foot' });
  });
  // Let the chase resolve into an arrest.
  await page.waitForFunction(
    () => (window as unknown as { __game: GameProbe }).__game.scene.getScene('City').world.status === 'busted',
    undefined,
    { timeout: 5000 },
  );
  expect((await readState(page)).stars).toBe(0); // wanted cleared on bust
});

test('wanted level resets when the player is wasted', async ({ page }) => {
  await boot(page);
  // Make the player wanted, nearly dead, and run a fast car onto them on foot.
  await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    w.wanted.heat = 250;
    w.health.current = 5;
    const f = w.focus;
    w.cars.push({ pos: { x: f.x, y: f.y }, heading: 0, speed: 220, radius: 12 });
  });
  await page.waitForFunction(
    () => (window as unknown as { __game: GameProbe }).__game.scene.getScene('City').world.status === 'wasted',
    undefined,
    { timeout: 5000 },
  );
  expect((await readState(page)).stars).toBe(0); // wanted cleared on wasted
});
