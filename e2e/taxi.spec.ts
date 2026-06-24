import { test, expect, type Page } from '@playwright/test';
import { launchSindicate } from './helpers';

/** Minimal structural view of the running game used by this regression. */
interface GameProbe {
  scene: {
    getScene(key: string): {
      hud: { text: string; visible: boolean };
      taxiMarker: { visible: boolean };
      world: {
        player: { pos: { x: number; y: number }; angle: number; radius: number };
        cars: { pos: { x: number; y: number }; heading: number; speed: number; radius: number }[];
        pedestrians: { taxiPassengerRole?: 'playerFare' | 'npcFare' }[];
        drivingCarIndex: number | null;
        taxiMission: {
          id: number;
          stage: 'pickup' | 'dropoff';
          passengerName: string;
          reward: number;
        } | null;
        taxiTarget: { x: number; y: number } | null;
        score: { current: number };
        carKind(index: number): string;
      };
    };
  };
}

async function boot(page: Page): Promise<void> {
  await launchSindicate(page);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !!(window as unknown as { __game?: unknown }).__game);
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City');
    return scene.hud.visible && scene.hud.text.length > 0;
  });
}

test('stealing a taxi lets the player pick up and drop off a live fare', async ({ page }) => {
  await boot(page);

  // Shortcut the setup by moving the player beside an actual live taxi in the
  // running production build, then use the real action key to steal it.
  await page.evaluate(() => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City');
    const world = scene.world;
    const taxiIndex = world.cars.findIndex((_, index) => world.carKind(index) === 'taxi');
    if (taxiIndex === -1) throw new Error('No taxi found in live traffic');

    const anchor = { x: world.player.pos.x, y: world.player.pos.y };
    const taxi = world.cars[taxiIndex];
    taxi.pos = { x: anchor.x + taxi.radius + world.player.radius - 2, y: anchor.y };
    taxi.heading = 0;
    world.player.angle = 0;
    world.player.pos = anchor;
    taxi.speed = 0;
  });

  await page.keyboard.press('Space');

  await page.waitForFunction(
    () => {
      const game = (window as unknown as { __game: GameProbe }).__game;
      const scene = game.scene.getScene('City');
      const world = scene.world;
      const driving = world.drivingCarIndex;
      return (
        driving !== null &&
        world.carKind(driving) === 'taxi' &&
        !!world.taxiMission &&
        scene.hud.text.includes('TAXI:') &&
        scene.taxiMarker.visible
      );
    },
    undefined,
    { timeout: 5_000 },
  );

  const start = await page.evaluate(() => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City');
    return {
      hud: scene.hud.text,
      markerVisible: scene.taxiMarker.visible,
      mission: scene.world.taxiMission,
      score: scene.world.score.current,
    };
  });

  expect(start.markerVisible).toBe(true);
  expect(start.mission?.stage).toBe('pickup');
  expect(start.hud).toContain('TAXI:');
  expect(start.hud).toContain(`Pick up ${start.mission?.passengerName}`);

  // Drive the live taxi onto the live fare target. We shortcut the travel so
  // the regression stays deterministic, but the actual pickup/dropoff logic is
  // still executed by the running production game loop.
  await page.evaluate(() => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const world = game.scene.getScene('City').world;
    const driving = world.drivingCarIndex;
    if (driving === null || world.taxiTarget === null)
      throw new Error('Taxi is not ready for pickup');
    world.cars[driving].pos = { x: world.taxiTarget.x, y: world.taxiTarget.y };
    world.cars[driving].speed = 0;
  });

  await page.waitForFunction(
    (fareId: number) => {
      const game = (window as unknown as { __game: GameProbe }).__game;
      const scene = game.scene.getScene('City');
      const world = scene.world;
      return (
        world.taxiMission?.id === fareId &&
        world.taxiMission.stage === 'dropoff' &&
        !world.pedestrians.some((ped) => ped.taxiPassengerRole === 'playerFare') &&
        scene.taxiMarker.visible &&
        scene.hud.text.includes(`Drop off ${world.taxiMission.passengerName}`)
      );
    },
    start.mission!.id,
    { timeout: 5_000 },
  );

  const boarded = await page.evaluate(() => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City');
    return {
      hud: scene.hud.text,
      markerVisible: scene.taxiMarker.visible,
      mission: scene.world.taxiMission,
      score: scene.world.score.current,
    };
  });

  expect(boarded.mission?.id).toBe(start.mission?.id);
  expect(boarded.mission?.stage).toBe('dropoff');
  expect(boarded.score).toBe(start.score);
  expect(boarded.hud).toContain(`Drop off ${start.mission?.passengerName}`);

  await page.evaluate(() => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const world = game.scene.getScene('City').world;
    const driving = world.drivingCarIndex;
    if (driving === null || world.taxiTarget === null)
      throw new Error('Taxi is not ready for dropoff');
    world.cars[driving].pos = { x: world.taxiTarget.x, y: world.taxiTarget.y };
    world.cars[driving].speed = 0;
  });

  await page.waitForFunction(
    ({ fareId, scoreAfterReward }: { fareId: number; scoreAfterReward: number }) => {
      const game = (window as unknown as { __game: GameProbe }).__game;
      const scene = game.scene.getScene('City');
      const world = scene.world;
      return (
        !!world.taxiMission &&
        world.taxiMission.id !== fareId &&
        world.taxiMission.stage === 'pickup' &&
        world.score.current === scoreAfterReward &&
        scene.taxiMarker.visible &&
        scene.hud.text.includes(`Pick up ${world.taxiMission.passengerName}`)
      );
    },
    { fareId: start.mission!.id, scoreAfterReward: start.score + start.mission!.reward },
    { timeout: 5_000 },
  );

  const completed = await page.evaluate(() => {
    const game = (window as unknown as { __game: GameProbe }).__game;
    const scene = game.scene.getScene('City');
    return {
      hud: scene.hud.text,
      markerVisible: scene.taxiMarker.visible,
      mission: scene.world.taxiMission,
      score: scene.world.score.current,
    };
  });

  expect(completed.markerVisible).toBe(true);
  expect(completed.score).toBe(start.score + start.mission!.reward);
  expect(completed.mission?.id).not.toBe(start.mission?.id);
  expect(completed.mission?.stage).toBe('pickup');
  expect(completed.hud).toContain('TAXI:');
  expect(completed.hud).toContain(`Pick up ${completed.mission?.passengerName}`);
});
