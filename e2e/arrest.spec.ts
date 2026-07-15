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

interface PoliceProbe {
  pos: Vec2;
  heading?: number;
  radius: number;
  kind: 'foot' | 'car';
  speed?: number;
  home?: Vec2;
  returningHome?: boolean;
}

interface ArrestTrace {
  maxStoppedWhilePlaying: number;
  maxStoppedBeforeContact: number;
  firstContactStoppedFor: number | null;
  contactAfterMs: number | null;
  bustStoppedFor: number | null;
}

interface RuntimeWorld {
  player: { pos: Vec2; angle: number };
  focus: Vec2;
  status: string;
  health: { current: number; max: number };
  wanted: { heat: number };
  pedestrians: unknown[];
  police: PoliceProbe[];
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
  tick(controls: Record<string, boolean>, dt: number): void;
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

async function seedStoppedPlayerCarUnderFootCop(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;

    w.status = 'playing';
    w.health.current = w.health.max;
    w.wanted.heat = 250;
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

    const parked = { x: w.focus.x + 40, y: w.focus.y };
    w.cars[0] = { pos: parked, heading: 0, speed: 0, radius: 12 };
    w.player.pos = { ...parked };
    w.player.angle = 0;
    w.drivingCarIndex = 0;
    w.carStoppedForBusted = 0;
    w.police = [{ pos: parked, heading: 0, radius: 12, kind: 'foot', speed: 0, home: parked }];
  });
}

async function seedStoppedPlayerCarWithDistantFootCop(page: Page): Promise<void> {
  const parked = tileCenter(CITY_SPEC, 10, 1);
  const copPos = tileCenter(CITY_SPEC, 14, 1);

  await page.evaluate(
    ({ parkedPos, copStart }) => {
      const g = (window as unknown as { __game: GameProbe }).__game;
      const w = g.scene.getScene('City').world;

      w.status = 'playing';
      w.health.current = w.health.max;
      w.wanted.heat = 250;
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

      w.cars[0] = { pos: parkedPos, heading: 0, speed: 0, radius: 12 };
      w.player.pos = { ...parkedPos };
      w.player.angle = 0;
      w.drivingCarIndex = 0;
      w.carStoppedForBusted = 0;
      w.police = [
        { pos: copStart, heading: Math.PI, radius: 12, kind: 'foot', speed: 0, home: copStart },
      ];
    },
    { parkedPos: parked, copStart: copPos },
  );
}

async function traceImmediateContactBust(page: Page): Promise<ArrestTrace> {
  return page.evaluate(() => {
    const win = window as unknown as { __game: GameProbe };
    const w = win.__game.scene.getScene('City').world;
    const controls = {
      up: false,
      down: false,
      left: false,
      right: false,
      action: false,
      confirm: false,
      fire: false,
    };
    const trace: ArrestTrace = {
      maxStoppedWhilePlaying: 0,
      maxStoppedBeforeContact: 0,
      firstContactStoppedFor: w.carStoppedForBusted,
      contactAfterMs: 0,
      bustStoppedFor: null,
    };

    for (let frame = 0; frame < 90 && w.status === 'playing'; frame += 1) {
      w.tick(controls, 1 / 60);
      trace.maxStoppedWhilePlaying = Math.max(trace.maxStoppedWhilePlaying, w.carStoppedForBusted);
    }
    if (w.status === 'busted') trace.bustStoppedFor = w.carStoppedForBusted;
    return trace;
  });
}

async function traceDelayedContactBust(page: Page): Promise<ArrestTrace> {
  return page.evaluate(() => {
    const win = window as unknown as { __game: GameProbe };
    const w = win.__game.scene.getScene('City').world;
    const controls = {
      up: false,
      down: false,
      left: false,
      right: false,
      action: false,
      confirm: false,
      fire: false,
    };
    const trace: ArrestTrace = {
      maxStoppedWhilePlaying: 0,
      maxStoppedBeforeContact: 0,
      firstContactStoppedFor: null,
      contactAfterMs: null,
      bustStoppedFor: null,
    };

    for (let frame = 0; frame < 90; frame += 1) {
      w.tick(controls, 1 / 60);
      trace.maxStoppedBeforeContact = Math.max(
        trace.maxStoppedBeforeContact,
        w.carStoppedForBusted,
      );
    }

    const footCop = w.police.find((cop) => cop.kind === 'foot' && !cop.returningHome);
    if (!footCop) throw new Error('expected a foot officer');
    const contactPos = { ...w.focus };
    footCop.pos = contactPos;
    footCop.speed = 0;
    trace.firstContactStoppedFor = w.carStoppedForBusted;
    trace.contactAfterMs = 1500;

    for (let frame = 0; frame < 90 && w.status === 'playing'; frame += 1) {
      w.tick(controls, 1 / 60);
      trace.maxStoppedWhilePlaying = Math.max(
        trace.maxStoppedWhilePlaying,
        w.carStoppedForBusted,
      );
    }
    if (w.status === 'busted') trace.bustStoppedFor = w.carStoppedForBusted;
    return trace;
  });
}

test('a foot officer only busts a stopped player car after one second in the live game', async ({
  page,
}) => {
  await boot(page);
  await seedStoppedPlayerCarUnderFootCop(page);
  const trace = await traceImmediateContactBust(page);

  const state = await page.evaluate(() => {
    const win = window as unknown as { __game: GameProbe };
    const w = win.__game.scene.getScene('City').world;
    return {
      status: w.status,
      isDriving: w.isDriving,
      stoppedFor: w.carStoppedForBusted,
    };
  });

  expect(state.isDriving).toBe(true);
  expect(state.status).toBe('busted');
  expect(trace.maxStoppedWhilePlaying).toBeGreaterThanOrEqual(0.9);
  expect(trace.maxStoppedWhilePlaying).toBeLessThan(1.05);
  expect(trace.bustStoppedFor).toBeGreaterThanOrEqual(1);
  expect(trace.bustStoppedFor).toBeLessThan(1.2);
  expect(state.stoppedFor).toBeGreaterThanOrEqual(1);
});

test('a player parked for over one second is not busted instantly when a foot officer reaches the car in the live game', async ({
  page,
}) => {
  await boot(page);
  await seedStoppedPlayerCarWithDistantFootCop(page);
  const trace = await traceDelayedContactBust(page);

  const state = await page.evaluate(() => {
    const win = window as unknown as { __game: GameProbe };
    const w = win.__game.scene.getScene('City').world;
    return {
      status: w.status,
      isDriving: w.isDriving,
      stoppedFor: w.carStoppedForBusted,
    };
  });

  expect(state.isDriving).toBe(true);
  expect(state.status).toBe('busted');
  expect(trace.contactAfterMs).toBeGreaterThan(1000);
  expect(trace.maxStoppedBeforeContact).toBeLessThan(0.1);
  expect(trace.firstContactStoppedFor).toBeGreaterThanOrEqual(0);
  expect(trace.firstContactStoppedFor).toBeLessThan(0.2);
  expect(trace.bustStoppedFor).toBeGreaterThanOrEqual(1);
  expect(trace.bustStoppedFor).toBeLessThan(1.2);
  expect(state.stoppedFor).toBeGreaterThanOrEqual(1);
});
