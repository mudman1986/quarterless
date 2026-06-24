import { test, expect, type Page } from '@playwright/test';
import { tileCenter } from '../src/core/city';
import { CITY_SPEC } from '../src/game/citySpec';
import { launchSindicate } from './helpers';

interface Vec2 {
  x: number;
  y: number;
}

interface CarProbe {
  pos: Vec2;
  heading: number;
  speed: number;
  radius: number;
}

interface RuntimeWorld {
  player: { pos: Vec2; angle: number };
  status: string;
  health: { current: number; max: number };
  wanted: { heat: number };
  pedestrians: unknown[];
  police: unknown[];
  bullets: unknown[];
  policeBullets: unknown[];
  explosions: unknown[];
  corpses: unknown[];
  cars: CarProbe[];
  wreckedCars: boolean[];
  towedCars: boolean[];
  carDrivers: ({ dir: Vec2 } | null)[];
  towDispatchCooldowns: number[];
  ambulance: unknown;
  tows: unknown[];
  drivingCarIndex: number | null;
  isDriving: boolean;
}

interface GameProbe {
  scene: {
    getScene(key: string): {
      world: RuntimeWorld;
    };
  };
}

const GAME = '() => window.__game';

async function boot(page: Page): Promise<void> {
  await launchSindicate(page);
  await page.keyboard.press('Space');
  await page.waitForFunction(GAME);
  await page.waitForTimeout(300);
}

async function seedDrivenCarFacingWreck(page: Page): Promise<{ start: Vec2; wreck: Vec2 }> {
  const start = tileCenter(CITY_SPEC, 10, 1);
  const wreck = tileCenter(CITY_SPEC, 12, 1);

  await page.evaluate(
    ({ startPos, wreckPos }) => {
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

      while (w.cars.length < 2) {
        w.cars.push({ pos: { x: 4000, y: 4000 }, heading: 0, speed: 0, radius: 12 });
        w.carDrivers.push(null);
        w.wreckedCars.push(false);
        w.towedCars.push(false);
        w.towDispatchCooldowns.push(0);
      }

      for (let i = 0; i < w.cars.length; i++) {
        w.cars[i] = {
          ...w.cars[i],
          pos: { x: 4000 + i * 24, y: 4000 },
          heading: 0,
          speed: 0,
          radius: 12,
        };
        w.wreckedCars[i] = false;
        w.towedCars[i] = false;
        w.carDrivers[i] = null;
        if (i < w.towDispatchCooldowns.length) w.towDispatchCooldowns[i] = 0;
      }

      w.cars[0] = { pos: startPos, heading: 0, speed: 0, radius: 12 };
      w.cars[1] = { pos: wreckPos, heading: 0, speed: 0, radius: 12 };
      w.wreckedCars[1] = true;
      w.towedCars[1] = false;
      w.towDispatchCooldowns[1] = 999;

      w.player.pos = { ...startPos };
      w.player.angle = 0;
      w.drivingCarIndex = 0;
    },
    { startPos: start, wreckPos: wreck },
  );

  return { start, wreck };
}

test('a driven car cannot pass through a wreck in the live game', async ({ page }) => {
  await boot(page);
  const { start, wreck } = await seedDrivenCarFacingWreck(page);

  await page.locator('#game canvas').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(
    (startX) => {
      const g = (window as unknown as { __game: GameProbe }).__game;
      return g.scene.getScene('City').world.cars[0].pos.x > startX + 40;
    },
    start.x,
    { timeout: 4000 },
  );
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowUp');

  const state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    const car = w.cars[0];
    const wreckCar = w.cars[1];
    return {
      isDriving: w.isDriving,
      carPos: car.pos,
      carSpeed: car.speed,
      wreckPos: wreckCar.pos,
      gap: Math.hypot(car.pos.x - wreckCar.pos.x, car.pos.y - wreckCar.pos.y),
      minGap: car.radius + wreckCar.radius,
      wrecked: w.wreckedCars[1],
    };
  });

  expect(state.isDriving).toBe(true);
  expect(state.wrecked).toBe(true);
  expect(state.carPos.x).toBeGreaterThan(start.x + 40);
  expect(state.carPos.x).toBeLessThan(wreck.x);
  expect(state.gap).toBeGreaterThanOrEqual(state.minGap - 1);
  expect(state.wreckPos).toEqual(wreck);
  expect(Math.abs(state.carSpeed)).toBeLessThan(220);
});
