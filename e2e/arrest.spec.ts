import { test, expect, type Page } from '@playwright/test';

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

interface ArrestTrace {
  maxStoppedWhilePlaying: number;
  bustStoppedFor: number | null;
}

interface RuntimeWorld {
  player: { pos: Vec2; angle: number };
  focus: Vec2;
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
  carDrivers: (unknown | null)[];
  towDispatchCooldowns: number[];
  ambulance: unknown;
  tows: unknown[];
  drivingCarIndex: number | null;
  isDriving: boolean;
  carStoppedForBusted: number;
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
  await page.goto('/sindicate/');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Space');
  await page.waitForFunction(GAME);
  await page.waitForTimeout(300);
}

async function seedStoppedPlayerCarUnderFootCop(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;

    w.status = 'playing';
    w.health.current = w.health.max;
    w.wanted.heat = 1;
    w.pedestrians = [];
    w.police = [];
    w.bullets = [];
    w.policeBullets = [];
    w.explosions = [];
    w.corpses = [];
    w.ambulance = null;
    w.tows = [];

    while (w.cars.length < 1) {
      w.cars.push({ pos: { x: 4000, y: 4000 }, heading: 0, speed: 0, radius: 12 });
      w.carDrivers.push(null);
      w.wreckedCars.push(false);
      w.towedCars.push(false);
      w.towDispatchCooldowns.push(0);
    }

    for (let i = 0; i < w.cars.length; i++) {
      w.cars[i] = { ...w.cars[i], pos: { x: 4000 + i * 24, y: 4000 }, heading: 0, speed: 0, radius: 12 };
      w.wreckedCars[i] = false;
      w.towedCars[i] = false;
      w.carDrivers[i] = null;
      if (i < w.towDispatchCooldowns.length) w.towDispatchCooldowns[i] = 0;
    }

    const parked = { x: w.focus.x + 40, y: w.focus.y };
    w.cars[0] = { pos: parked, heading: 0, speed: 0, radius: 12 };
    w.player.pos = { ...parked };
    w.player.angle = 0;
    w.drivingCarIndex = 0;
    w.carStoppedForBusted = 0;
    w.police = [{ pos: parked, heading: 0, radius: 12, kind: 'foot', speed: 0, home: parked }];
  });
}

async function traceInCarBustDelay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as { __game: GameProbe; __arrestTrace?: ArrestTrace };
    win.__arrestTrace = { maxStoppedWhilePlaying: 0, bustStoppedFor: null };

    const sample = () => {
      const w = win.__game.scene.getScene('City').world;
      if (w.status === 'playing') {
        win.__arrestTrace!.maxStoppedWhilePlaying = Math.max(
          win.__arrestTrace!.maxStoppedWhilePlaying,
          w.carStoppedForBusted,
        );
        requestAnimationFrame(sample);
        return;
      }

      if (w.status === 'busted' && win.__arrestTrace!.bustStoppedFor === null) {
        win.__arrestTrace!.bustStoppedFor = w.carStoppedForBusted;
      }
    };

    requestAnimationFrame(sample);
  });
}

test('a foot officer only busts a stopped player car after one second in the live game', async ({ page }) => {
  await boot(page);
  await seedStoppedPlayerCarUnderFootCop(page);
  await traceInCarBustDelay(page);

  await page.waitForFunction(() => {
    const win = window as unknown as { __arrestTrace?: ArrestTrace };
    return win.__arrestTrace?.bustStoppedFor !== null;
  }, undefined, { timeout: 5000 });

  const state = await page.evaluate(() => {
    const win = window as unknown as { __game: GameProbe; __arrestTrace?: ArrestTrace };
    const w = win.__game.scene.getScene('City').world;
    return {
      status: w.status,
      isDriving: w.isDriving,
      stoppedFor: w.carStoppedForBusted,
      trace: win.__arrestTrace,
    };
  });

  expect(state.isDriving).toBe(true);
  expect(state.status).toBe('busted');
  expect(state.trace).toBeDefined();
  expect(state.trace?.maxStoppedWhilePlaying).toBeGreaterThanOrEqual(0.9);
  expect(state.trace?.maxStoppedWhilePlaying).toBeLessThan(1.05);
  expect(state.trace?.bustStoppedFor).toBeGreaterThanOrEqual(1);
  expect(state.trace?.bustStoppedFor).toBeLessThan(1.2);
  expect(state.stoppedFor).toBeGreaterThanOrEqual(1);
});