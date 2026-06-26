import { expect, test, type Page } from '@playwright/test';
import { launchSindicate } from './helpers';

interface GameProbe {
  scene: {
    getScene(key: string): {
      timeOfDay: number;
      hud: { text: string };
      world: {
        player: { pos: { x: number; y: number } };
        wanted: { heat: number };
        wantedStars: number;
        health: { current: number; max: number };
        weapon: { ammo: number };
        score: { current: number; best: number };
      };
    };
  };
}

const GAME = '() => window.__game';
const SAVE_KEY = 'sindicate.gameState';

type PersistedState = {
  pos: { x: number; y: number };
  health: { current: number; max: number };
  ammo: number;
  score: { current: number; best: number };
  wantedHeat: number;
  wantedStars: number;
  timeOfDay: number;
  hudText: string;
};

type StoredSave = {
  version: number;
  timeOfDay: number;
  world: {
    score: { current: number; best: number };
    player: { pos: { x: number; y: number } };
  };
};

async function boot(page: Page): Promise<void> {
  await launchSindicate(page);
  await page.keyboard.press('Space');
  await page.waitForFunction(GAME);
  await page.waitForTimeout(300);
}

async function readState(page: Page): Promise<PersistedState> {
  return page.evaluate(() => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City');
    const world = scene.world;
    return {
      pos: { ...world.player.pos },
      health: { ...world.health },
      ammo: world.weapon.ammo,
      score: { ...world.score },
      wantedHeat: world.wanted.heat,
      wantedStars: world.wantedStars,
      timeOfDay: scene.timeOfDay,
      hudText: scene.hud.text,
    };
  });
}

test('Sindicate restores the live run after a browser refresh', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City');
    const world = scene.world;
    world.player.pos = { x: 432, y: 654 };
    world.health.current = 37;
    world.weapon.ammo = 3;
    world.score.current = 987;
    world.score.best = 1234;
    world.wanted.heat = 240;
    scene.timeOfDay = 456.75;
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: GameProbe }).__game;
    if (!game) return false;
    const scene = game.scene.getScene('City');
    return scene.hud.text.includes('HP 37/100') && scene.hud.text.includes('$987  (best $1234)');
  });

  const beforeReload = await readState(page);
  expect(beforeReload.wantedStars).toBe(2);
  expect(beforeReload.hudText).toContain('WANTED ★★');
  expect(beforeReload.hudText).toContain('HP 37/100');
  expect(beforeReload.hudText).toContain('$987  (best $1234)');
  expect(beforeReload.hudText).toContain('Pistol 3  ⚠ LOW — grab a crate');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible();

  const storedRaw = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  expect(storedRaw).not.toBeNull();
  const stored = JSON.parse(storedRaw ?? 'null') as StoredSave;
  expect(stored.version).toBe(1);
  expect(stored.world.player.pos).toEqual({ x: 432, y: 654 });
  expect(stored.world.score).toEqual({ current: 987, best: 1234 });
  expect(stored.timeOfDay).toBeGreaterThan(456);

  await boot(page);

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: GameProbe }).__game;
    if (!game) return false;
    const scene = game.scene.getScene('City');
    const world = scene.world;
    return (
      world.player.pos.x === 432 &&
      world.player.pos.y === 654 &&
      world.health.current === 37 &&
      world.weapon.ammo === 3 &&
      world.score.current === 987 &&
      world.score.best === 1234 &&
      world.wantedStars === 2
    );
  });

  const afterReload = await readState(page);
  expect(afterReload.pos).toEqual(beforeReload.pos);
  expect(afterReload.health).toEqual(beforeReload.health);
  expect(afterReload.ammo).toBe(beforeReload.ammo);
  expect(afterReload.score).toEqual(beforeReload.score);
  expect(afterReload.wantedStars).toBe(beforeReload.wantedStars);
  expect(afterReload.wantedHeat).toBeGreaterThan(200);
  expect(afterReload.wantedHeat).toBeLessThanOrEqual(240);
  expect(afterReload.hudText).toBe(beforeReload.hudText);
  expect(afterReload.timeOfDay).toBeGreaterThanOrEqual(stored.timeOfDay);
  expect(afterReload.timeOfDay).toBeLessThan(stored.timeOfDay + 5);
});