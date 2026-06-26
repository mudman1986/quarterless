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
const MANUAL_SAVE_KEY = 'sindicate.manualSave';

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

test('Sindicate can manually save a run and load it later from pause', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City');
    const world = scene.world;
    world.player.pos = { x: 310, y: 470 };
    world.health.current = 74;
    world.weapon.ammo = 11;
    world.score.current = 321;
    world.score.best = 654;
    world.wanted.heat = 130;
    scene.timeOfDay = 222.25;
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: GameProbe }).__game;
    if (!game) return false;
    const hudText = game.scene.getScene('City').hud.text;
    return hudText.includes('HP 74/100') && hudText.includes('$321  (best $654)');
  });

  const manualBaseline = await readState(page);
  expect(manualBaseline.wantedStars).toBe(1);

  await page.keyboard.press('p');
  await page.keyboard.press('s');

  const manualRaw = await page.evaluate((key) => window.localStorage.getItem(key), MANUAL_SAVE_KEY);
  expect(manualRaw).not.toBeNull();
  const manualStored = JSON.parse(manualRaw ?? 'null') as StoredSave;
  expect(manualStored.world.player.pos).toEqual({ x: 310, y: 470 });
  expect(manualStored.world.score).toEqual({ current: 321, best: 654 });

  await page.keyboard.press('p');

  await page.evaluate(() => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City');
    const world = scene.world;
    world.player.pos = { x: 900, y: 901 };
    world.health.current = 18;
    world.weapon.ammo = 2;
    world.score.current = 999;
    world.score.best = 999;
    world.wanted.heat = 0;
    scene.timeOfDay = 700;
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: GameProbe }).__game;
    if (!game) return false;
    const hudText = game.scene.getScene('City').hud.text;
    return hudText.includes('HP 18/100') && hudText.includes('$999  (best $999)');
  });
  await page.waitForTimeout(700);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible();
  await boot(page);

  const resumedState = await readState(page);
  expect(resumedState.pos).toEqual({ x: 900, y: 901 });
  expect(resumedState.health.current).toBe(18);
  expect(resumedState.ammo).toBe(2);
  expect(resumedState.score).toEqual({ current: 999, best: 999 });
  expect(resumedState.wantedStars).toBe(0);

  await page.keyboard.press('p');
  await page.keyboard.press('l');

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: GameProbe }).__game;
    if (!game) return false;
    const scene = game.scene.getScene('City');
    const world = scene.world;
    return (
      world.player.pos.x === 310 &&
      world.player.pos.y === 470 &&
      world.health.current === 74 &&
      world.weapon.ammo === 11 &&
      world.score.current === 321 &&
      world.score.best === 654 &&
      world.wantedStars === 1
    );
  });

  const loadedState = await readState(page);
  expect(loadedState.pos).toEqual(manualBaseline.pos);
  expect(loadedState.health).toEqual(manualBaseline.health);
  expect(loadedState.ammo).toBe(manualBaseline.ammo);
  expect(loadedState.score).toEqual(manualBaseline.score);
  expect(loadedState.wantedStars).toBe(manualBaseline.wantedStars);
  expect(loadedState.wantedHeat).toBeGreaterThan(120);
  expect(loadedState.wantedHeat).toBeLessThanOrEqual(130);
  expect(loadedState.hudText).toBe(manualBaseline.hudText);
  expect(loadedState.timeOfDay).toBeGreaterThanOrEqual(manualStored.timeOfDay);
  expect(loadedState.timeOfDay).toBeLessThan(manualStored.timeOfDay + 5);
});