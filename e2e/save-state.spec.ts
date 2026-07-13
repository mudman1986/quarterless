import { expect, test, type Page } from '@playwright/test';
import { buildCity, tileCenter } from '../src/core/city';
import { circleIntersectsRect } from '../src/core/collision';
import { CITY_SPEC } from '../src/game/citySpec';
import { launchSindicate, waitForCitySceneReady } from './helpers';

interface Vec2 {
  x: number;
  y: number;
}

interface GameProbe {
  scene: {
    getScene(key: string): {
      scene: { restart(data: unknown): void };
      timeOfDay: number;
      hud: { text: string };
      world: {
        player: { pos: { x: number; y: number } };
        cars: Array<{ pos: Vec2; speed: number }>;
        drivingCarIndex: number | null;
        wanted: { heat: number };
        wantedStars: number;
        health: { current: number; max: number };
        weapon: { ammo: number };
        score: { current: number; best: number };
      };
    };
  };
}

const SAVE_KEY = 'sindicate.gameState';
const MANUAL_SAVE_KEY = 'sindicate.manualSave';
const LIVE_CITY = buildCity(CITY_SPEC);

function safeRoadPoint(index: number): Vec2 {
  const points: Vec2[] = [];
  const blockers = [...LIVE_CITY.buildings, ...LIVE_CITY.fences];
  for (let ty = 0; ty < LIVE_CITY.spec.rows; ty++) {
    for (let tx = 0; tx < LIVE_CITY.spec.cols; tx++) {
      if (!LIVE_CITY.isRoad(tx, ty)) continue;
      const point = tileCenter(LIVE_CITY.spec, tx, ty);
      if (blockers.some((blocker) => circleIntersectsRect(point, 8, blocker))) continue;
      points.push(point);
    }
  }
  const point = points[index];
  if (!point) throw new Error(`expected safe road point ${index}`);
  return point;
}

const SAVE_POS_A = safeRoadPoint(12);
const SAVE_POS_B = safeRoadPoint(28);
const SAVE_POS_C = safeRoadPoint(44);
const SAVE_POS_D = safeRoadPoint(60);
const SAVE_POS_E = safeRoadPoint(76);
const SAVE_POS_F = safeRoadPoint(92);

function manualSaveKey(slot: number): string {
  return slot <= 1 ? MANUAL_SAVE_KEY : `${MANUAL_SAVE_KEY}.${slot}`;
}

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
  await waitForCitySceneReady(page);
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

async function stageSaveState(
  page: Page,
  state: {
    pos: Vec2;
    health?: number;
    ammo?: number;
    score?: number;
    best?: number;
    wantedHeat?: number;
    timeOfDay?: number;
  },
): Promise<void> {
  await page.evaluate((nextState) => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City');
    const world = scene.world;
    world.drivingCarIndex = null;
    for (let i = 0; i < world.cars.length; i++) {
      world.cars[i] = { ...world.cars[i], pos: { x: 5000 + i * 24, y: 5000 }, speed: 0 };
    }
    world.player.pos = nextState.pos;
    if (nextState.health !== undefined) world.health.current = nextState.health;
    if (nextState.ammo !== undefined) world.weapon.ammo = nextState.ammo;
    if (nextState.score !== undefined) world.score.current = nextState.score;
    if (nextState.best !== undefined) world.score.best = nextState.best;
    if (nextState.wantedHeat !== undefined) world.wanted.heat = nextState.wantedHeat;
    if (nextState.timeOfDay !== undefined) scene.timeOfDay = nextState.timeOfDay;
  }, state);
}

test('Sindicate restores the live run after a browser refresh', async ({ page }) => {
  await boot(page);

  await stageSaveState(page, {
    pos: SAVE_POS_A,
    health: 37,
    ammo: 3,
    score: 987,
    best: 1234,
    wantedHeat: 240,
    timeOfDay: 456.75,
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
  expect(stored.world.player.pos).toEqual(SAVE_POS_A);
  expect(stored.world.score).toEqual({ current: 987, best: 1234 });
  expect(stored.timeOfDay).toBeGreaterThan(456);

  await boot(page);

  await page.waitForFunction((expectedPos) => {
    const game = (window as unknown as { __game?: GameProbe }).__game;
    if (!game) return false;
    const scene = game.scene.getScene('City');
    const world = scene.world;
    return (
      world.player.pos.x === expectedPos.x &&
      world.player.pos.y === expectedPos.y &&
      world.health.current === 37 &&
      world.weapon.ammo === 3 &&
      world.score.current === 987 &&
      world.score.best === 1234 &&
      world.wantedStars === 2
    );
  }, SAVE_POS_A);

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

  await stageSaveState(page, {
    pos: SAVE_POS_B,
    health: 74,
    ammo: 11,
    score: 321,
    best: 654,
    wantedHeat: 130,
    timeOfDay: 222.25,
  });

  const manualBaseline = await readState(page);
  expect(manualBaseline.wantedStars).toBe(1);

  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-story-slot-save="1"]').click();

  const manualRaw = await page.evaluate((key) => window.localStorage.getItem(key), manualSaveKey(1));
  expect(manualRaw).not.toBeNull();
  const manualStored = JSON.parse(manualRaw ?? 'null') as StoredSave;
  expect(manualStored.world.player.pos).toEqual(SAVE_POS_B);
  expect(manualStored.world.score).toEqual({ current: 321, best: 654 });

  await page.getByRole('button', { name: /Resume Current Run|Continue Story|Start Story/ }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await waitForCitySceneReady(page);

  await stageSaveState(page, {
    pos: SAVE_POS_C,
    health: 18,
    ammo: 2,
    score: 999,
    best: 999,
    wantedHeat: 0,
    timeOfDay: 700,
  });
  await page.waitForTimeout(700);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible();
  await boot(page);

  const resumedState = await readState(page);
  expect(resumedState.pos).toEqual(SAVE_POS_C);
  expect(resumedState.health.current).toBe(18);
  expect(resumedState.ammo).toBe(2);
  expect(resumedState.score).toEqual({ current: 999, best: 999 });
  expect(resumedState.wantedStars).toBe(0);

  await page.evaluate((key) => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City') as { scene: { restart(data: unknown): void } };
    scene.scene.restart({ loadSaveKey: key });
  }, manualSaveKey(1));
  await waitForCitySceneReady(page);

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

test('Sindicate keeps multiple manual save slots independent', async ({ page }) => {
  await boot(page);

  await stageSaveState(page, {
    pos: SAVE_POS_D,
    health: 66,
    ammo: 7,
    score: 100,
    best: 400,
    wantedHeat: 115,
    timeOfDay: 150,
  });

  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: GameProbe }).__game;
    if (!game) return false;
    const hudText = game.scene.getScene('City').hud.text;
    return hudText.includes('HP 66/100') && hudText.includes('$100  (best $400)');
  });

  const slotOneState = await readState(page);
  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-story-slot-save="1"]').click();

  await page.getByRole('button', { name: /Resume Current Run|Continue Story|Start Story/ }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await waitForCitySceneReady(page);
  await stageSaveState(page, {
    pos: SAVE_POS_E,
    health: 55,
    ammo: 13,
    score: 200,
    best: 500,
    wantedHeat: 230,
    timeOfDay: 320,
  });

  const slotTwoState = await readState(page);
  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-story-slot-save="2"]').click();

  const slotOneRaw = await page.evaluate((key) => window.localStorage.getItem(key), manualSaveKey(1));
  const slotTwoRaw = await page.evaluate((key) => window.localStorage.getItem(key), manualSaveKey(2));
  expect(slotOneRaw).not.toBeNull();
  expect(slotTwoRaw).not.toBeNull();
  expect(slotOneRaw).not.toBe(slotTwoRaw);

  await page.getByRole('button', { name: /Resume Current Run|Continue Story|Start Story/ }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });

  await page.evaluate((key) => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City') as { scene: { restart(data: unknown): void } };
    scene.scene.restart({ loadSaveKey: key });
  }, manualSaveKey(1));
  await waitForCitySceneReady(page);

  const loadedSlotOneState = await readState(page);
  expect(loadedSlotOneState.pos).toEqual(slotOneState.pos);
  expect(loadedSlotOneState.health).toEqual(slotOneState.health);
  expect(loadedSlotOneState.ammo).toBe(slotOneState.ammo);
  expect(loadedSlotOneState.score).toEqual(slotOneState.score);
  expect(loadedSlotOneState.wantedStars).toBe(slotOneState.wantedStars);

  await page.evaluate((key) => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City') as { scene: { restart(data: unknown): void } };
    scene.scene.restart({ loadSaveKey: key });
  }, manualSaveKey(2));
  await waitForCitySceneReady(page);

  const loadedSlotTwoState = await readState(page);
  expect(loadedSlotTwoState.pos).toEqual(slotTwoState.pos);
  expect(loadedSlotTwoState.health).toEqual(slotTwoState.health);
  expect(loadedSlotTwoState.ammo).toBe(slotTwoState.ammo);
  expect(loadedSlotTwoState.score).toEqual(slotTwoState.score);
  expect(loadedSlotTwoState.wantedStars).toBe(slotTwoState.wantedStars);
});

test('clicking the real Load-slot button in the story menu restores that slot', async ({
  page,
}) => {
  await boot(page);

  await stageSaveState(page, {
    pos: SAVE_POS_D,
    health: 55,
    ammo: 9,
    score: 555,
    best: 777,
  });

  const savedState = await readState(page);

  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-story-slot-save="1"]').click();

  await page.getByRole('button', { name: /Resume Current Run|Continue Story|Start Story/ }).click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await waitForCitySceneReady(page);

  // Drift away from the saved slot so we can tell whether Load actually restores it.
  await stageSaveState(page, {
    pos: SAVE_POS_F,
    health: 12,
    ammo: 0,
    score: 1,
    best: 1,
  });

  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: 'Story Mode' })).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-story-slot-load="1"]').click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await waitForCitySceneReady(page);
  await page.waitForFunction((expectedPos) => {
    const game = (window as unknown as { __game?: GameProbe }).__game;
    const world = game?.scene.getScene('City').world;
    if (!world) return false;
    return world.player.pos.x === expectedPos.x && world.player.pos.y === expectedPos.y;
  }, SAVE_POS_D);

  const loadedState = await readState(page);
  expect(loadedState.pos).toEqual(savedState.pos);
  expect(loadedState.health).toEqual(savedState.health);
  expect(loadedState.ammo).toBe(savedState.ammo);
  expect(loadedState.score).toEqual(savedState.score);
});