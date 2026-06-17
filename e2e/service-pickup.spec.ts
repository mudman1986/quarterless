import { test, expect, type Page } from '@playwright/test';
import { TEX } from '../src/game/art/textures';

interface Vec2 {
  x: number;
  y: number;
}

interface CorpseProbe {
  pos: Vec2;
  offscreenFor: number;
  inFrameFor: number;
}

interface PedestrianProbe {
  pos: Vec2;
  returningTo?: Vec2;
  uniform?: 'medic' | 'towWorker';
}

interface CarProbe {
  pos: Vec2;
  heading: number;
  speed: number;
  radius: number;
}

interface ServiceProbe {
  pos: Vec2;
  heading: number;
  radius: number;
  dir: Vec2;
  target: Vec2;
  phase: 'approach' | 'collect' | 'return' | 'depart';
  crew: Vec2 | null;
  pickupElapsed: number;
  age: number;
  speed: number;
  blocked: number;
  health: number;
}

interface TowProbe extends ServiceProbe {
  targetCar: number;
}

interface RuntimeWorld {
  player: { pos: Vec2; angle: number };
  focus: Vec2;
  status: string;
  health: { current: number; max: number };
  wanted: { heat: number };
  pedestrians: PedestrianProbe[];
  police: unknown[];
  bullets: unknown[];
  policeBullets: unknown[];
  explosions: unknown[];
  corpses: CorpseProbe[];
  cars: CarProbe[];
  wreckedCars: boolean[];
  towedCars: boolean[];
  carDrivers: ({ dir: Vec2 } | null)[];
  towDispatchCooldowns: number[];
  ambulance: ServiceProbe | null;
  tows: TowProbe[];
  drivingCarIndex: number | null;
  isDriving: boolean;
  carKind(index: number): string;
}

interface GameProbe {
  scene: {
    getScene(key: string): {
      world: RuntimeWorld;
      pedSprites: Array<{ texture: { key: string } }>;
    };
  };
}

const GAME = '() => window.__game';

async function boot(page: Page): Promise<void> {
  await page.goto('/sindicate/');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Space');
  await page.waitForFunction(GAME);
  await page.waitForTimeout(300);
}

async function seedAmbulanceLoading(page: Page, pickupElapsed = 0): Promise<void> {
  await page.evaluate(({ elapsed }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;

    w.status = 'playing';
    w.health.current = w.health.max;
    w.wanted.heat = 0;
    w.pedestrians = [];
    w.police = [];
    w.bullets = [];
    w.policeBullets = [];
    w.explosions = [];
    w.ambulance = null;
    w.tows = [];
    w.drivingCarIndex = null;
    for (let i = 0; i < w.cars.length; i++) {
      w.cars[i] = { ...w.cars[i], pos: { x: 4000 + i * 24, y: 4000 }, heading: 0, speed: 0 };
      w.wreckedCars[i] = false;
      w.towedCars[i] = false;
      w.carDrivers[i] = null;
      if (i < w.towDispatchCooldowns.length) w.towDispatchCooldowns[i] = 0;
    }

    const parked = { x: w.focus.x + 40, y: w.focus.y };
    const body = { x: parked.x + 48, y: parked.y };
    w.player.pos = { ...parked };
    w.player.angle = 0;
    w.corpses = [{ pos: body, offscreenFor: 0, inFrameFor: 0 }];
    w.ambulance = {
      pos: parked,
      heading: 0,
      radius: 14,
      dir: { x: 1, y: 0 },
      target: body,
      phase: 'collect',
      crew: body,
      pickupElapsed: elapsed,
      age: 0,
      speed: 0,
      blocked: 0,
      health: 60,
    };
  }, { elapsed: pickupElapsed });
}

async function seedTowLoading(page: Page, pickupElapsed = 0): Promise<void> {
  await page.evaluate(({ elapsed }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;

    w.status = 'playing';
    w.health.current = w.health.max;
    w.wanted.heat = 0;
    w.pedestrians = [];
    w.police = [];
    w.bullets = [];
    w.policeBullets = [];
    w.explosions = [];
    w.corpses = [];
    w.ambulance = null;
    w.tows = [];
    w.drivingCarIndex = null;
    for (let i = 0; i < w.cars.length; i++) {
      w.cars[i] = { ...w.cars[i], pos: { x: 4000 + i * 24, y: 4000 }, heading: 0, speed: 0 };
      w.wreckedCars[i] = false;
      w.towedCars[i] = false;
      w.carDrivers[i] = null;
      if (i < w.towDispatchCooldowns.length) w.towDispatchCooldowns[i] = 0;
    }

    const parked = { x: w.focus.x + 40, y: w.focus.y };
    const wreck = { x: parked.x + 48, y: parked.y };
    w.player.pos = { ...parked };
    w.player.angle = 0;
    w.cars[0] = { pos: wreck, heading: 0, speed: 0, radius: 12 };
    w.wreckedCars[0] = true;
    w.towedCars[0] = false;
    w.carDrivers[0] = null;
    w.towDispatchCooldowns[0] = 0;
    w.tows = [
      {
        pos: parked,
        heading: 0,
        radius: 14,
        dir: { x: 1, y: 0 },
        target: wreck,
        targetCar: 0,
        phase: 'collect',
        crew: wreck,
        pickupElapsed: elapsed,
        age: 0,
        speed: 0,
        blocked: 0,
        health: 60,
      },
    ];
  }, { elapsed: pickupElapsed });
}

test('ambulance pickup waits 3 seconds before the body is removed', async ({ page }) => {
  await boot(page);
  await seedAmbulanceLoading(page, 2.5);

  let state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return {
      corpses: w.corpses.length,
      phase: w.ambulance?.phase ?? null,
      pickupElapsed: w.ambulance?.pickupElapsed ?? 0,
    };
  });

  expect(state.corpses).toBe(1);
  expect(state.phase).toBe('collect');
  expect(state.pickupElapsed).toBeGreaterThanOrEqual(2.5);

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return w.ambulance?.phase === 'return' && w.corpses.length === 0;
  }, undefined, { timeout: 5000 });

  state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return {
      corpses: w.corpses.length,
      phase: w.ambulance?.phase ?? null,
      pickupElapsed: w.ambulance?.pickupElapsed ?? 0,
    };
  });

  expect(state.corpses).toBe(0);
  expect(state.phase).toBe('return');
});

test('tow pickup waits 3 seconds before the wreck is hooked', async ({ page }) => {
  await boot(page);
  await seedTowLoading(page, 2.5);

  let state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return {
      towed: w.towedCars[0],
      phase: w.tows[0]?.phase ?? null,
      pickupElapsed: w.tows[0]?.pickupElapsed ?? 0,
    };
  });

  expect(state.towed).toBe(false);
  expect(state.phase).toBe('collect');
  expect(state.pickupElapsed).toBeGreaterThanOrEqual(2.5);

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return w.tows[0]?.phase === 'return' && w.towedCars[0] === true;
  }, undefined, { timeout: 5000 });

  state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return {
      towed: w.towedCars[0],
      phase: w.tows[0]?.phase ?? null,
      pickupElapsed: w.tows[0]?.pickupElapsed ?? 0,
    };
  });

  expect(state.towed).toBe(true);
  expect(state.phase).toBe('return');
});

test('the player can steal the parked ambulance during the loading window', async ({ page }) => {
  await boot(page);
  await seedAmbulanceLoading(page, 1);

  await page.locator('#game canvas').click();
  await page.keyboard.press('Space');

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return w.isDriving && w.drivingCarIndex !== null && w.carKind(w.drivingCarIndex) === 'ambulance';
  }, undefined, { timeout: 1000 });

  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      corpses: w.corpses.length,
      hasAmbulance: w.ambulance !== null,
      drivingKind: w.drivingCarIndex === null ? null : w.carKind(w.drivingCarIndex),
      wantedHeat: w.wanted.heat,
      police: w.police.length,
      returningCrew: w.pedestrians.length,
      crewHeadingHome: w.pedestrians[0]?.returningTo !== undefined,
      crewUniform: w.pedestrians[0]?.uniform ?? null,
      crewTexture: scene.pedSprites[0]?.texture.key ?? null,
    };
  });

  expect(state.drivingKind).toBe('ambulance');
  expect(state.hasAmbulance).toBe(false);
  expect(state.corpses).toBe(1);
  expect(state.wantedHeat).toBeGreaterThan(0);
  expect(state.police).toBeGreaterThan(0);
  expect(state.returningCrew).toBe(1);
  expect(state.crewHeadingHome).toBe(true);
  expect(state.crewUniform).toBe('medic');
  expect(state.crewTexture).toBe(TEX.medic);
});

test('the player can steal the parked tow truck during the loading window', async ({ page }) => {
  await boot(page);
  await seedTowLoading(page, 1);

  await page.locator('#game canvas').click();
  await page.keyboard.press('Space');

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return w.isDriving && w.drivingCarIndex !== null && w.carKind(w.drivingCarIndex) === 'tow';
  }, undefined, { timeout: 1000 });

  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      tows: w.tows.length,
      towed: w.towedCars[0],
      drivingKind: w.drivingCarIndex === null ? null : w.carKind(w.drivingCarIndex),
      wantedHeat: w.wanted.heat,
      police: w.police.length,
      returningCrew: w.pedestrians.length,
      crewHeadingHome: w.pedestrians[0]?.returningTo !== undefined,
      crewUniform: w.pedestrians[0]?.uniform ?? null,
      crewTexture: scene.pedSprites[0]?.texture.key ?? null,
    };
  });

  expect(state.drivingKind).toBe('tow');
  expect(state.tows).toBe(0);
  expect(state.towed).toBe(false);
  expect(state.wantedHeat).toBeGreaterThan(0);
  expect(state.police).toBeGreaterThan(0);
  expect(state.returningCrew).toBe(1);
  expect(state.crewHeadingHome).toBe(true);
  expect(state.crewUniform).toBe('towWorker');
  expect(state.crewTexture).toBe(TEX.towWorker);
});