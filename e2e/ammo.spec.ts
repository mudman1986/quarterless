import { test, expect, type Page } from '@playwright/test';
import { AMMO_RESPAWN_DELAY } from '../src/core/world';
import { launchSindicate } from './helpers';

interface Vec2 {
  x: number;
  y: number;
}

interface AmmoPickupProbe {
  pos: Vec2;
  amount: number;
}

interface RuntimeWorld {
  player: { pos: Vec2; angle: number; radius: number };
  focus: Vec2;
  status: string;
  health: { current: number; max: number };
  wanted: { heat: number };
  score: { current: number };
  bullets: unknown[];
  policeBullets: unknown[];
  explosions: unknown[];
  police: unknown[];
  pedestrians: unknown[];
  corpses: unknown[];
  drivingCarIndex: number | null;
  ammoPickups: AmmoPickupProbe[];
  weapon: { ammo: number };
  tick(
    controls: {
      up: boolean;
      down: boolean;
      left: boolean;
      right: boolean;
      action: boolean;
      confirm: boolean;
      fire: boolean;
    },
    dt: number,
  ): void;
}

interface GameProbe {
  canvas: HTMLCanvasElement;
  renderer: { gl: WebGLRenderingContext };
  events: { on(event: string, cb: () => void): void; off(event: string, cb: () => void): void };
  scene: {
    getScene(key: string): {
      paused: boolean;
      world: RuntimeWorld;
      hud: { text: string; visible: boolean; width: number; height: number };
      minimapBg: { visible: boolean };
      minimapDots: { visible: boolean };
      ammoSprites: Array<{ sprite: { visible: boolean } }>;
      syncSprites(): void;
      syncMinimap(): void;
    };
  };
}

async function boot(page: Page): Promise<void> {
  await launchSindicate(page);
  await page.waitForFunction(() => !!(window as unknown as { __game?: unknown }).__game);
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: GameProbe }).__game;
    const scene = game?.scene?.getScene('City');
    return (
      !!scene?.hud?.visible &&
      scene.hud.text.length > 0 &&
      scene.hud.width > 0 &&
      scene.hud.height > 0 &&
      !!scene.minimapBg?.visible &&
      !!scene.minimapDots?.visible
    );
  });
  await page.waitForTimeout(100);
}

test('collected ammo respawns later at a different live location and refreshes the sprite pool', async ({
  page,
}) => {
  await boot(page);

  const state = await page.evaluate(
    ({ respawnDelay }) => {
      const g = (window as unknown as { __game: GameProbe }).__game;
      const scene = g.scene.getScene('City');
      const w = scene.world;
      const idle = {
        up: false,
        down: false,
        left: false,
        right: false,
        action: false,
        confirm: false,
        fire: false,
      };
      const step = 1 / 30;
      const original = { ...w.player.pos };
      const wasPaused = scene.paused;

      scene.paused = true;
      w.status = 'playing';
      w.health.current = w.health.max;
      w.wanted.heat = 0;
      w.score.current = 0;
      w.bullets = [];
      w.policeBullets = [];
      w.explosions = [];
      w.police = [];
      w.pedestrians = [];
      w.corpses = [];
      w.drivingCarIndex = null;
      w.player.pos = { ...original };
      w.player.angle = 0;
      w.weapon = { ...w.weapon, ammo: 0 };
      w.ammoPickups = [{ pos: original, amount: 18 }];

      scene.syncSprites();
      w.tick(idle, step);
      scene.syncSprites();

      const afterCollect = {
        ammo: w.weapon.ammo,
        pickups: w.ammoPickups.map((pickup) => ({ ...pickup.pos })),
        visibleSprites: scene.ammoSprites.filter((entry) => entry.sprite.visible).length,
      };

      for (let elapsed = 0; elapsed < respawnDelay + step; elapsed += step) {
        w.tick(idle, step);
      }
      scene.syncSprites();

      const afterRespawn = {
        ammo: w.weapon.ammo,
        pickups: w.ammoPickups.map((pickup) => ({ ...pickup.pos })),
        visibleSprites: scene.ammoSprites.filter((entry) => entry.sprite.visible).length,
      };

      scene.paused = wasPaused;
      scene.syncSprites();

      return { original, afterCollect, afterRespawn };
    },
    { respawnDelay: AMMO_RESPAWN_DELAY },
  );

  expect(state.afterCollect.ammo).toBe(18);
  expect(state.afterCollect.pickups).toHaveLength(0);
  expect(state.afterCollect.visibleSprites).toBe(0);

  expect(state.afterRespawn.ammo).toBe(18);
  expect(state.afterRespawn.pickups).toHaveLength(1);
  expect(state.afterRespawn.visibleSprites).toBe(1);
  expect(state.afterRespawn.pickups[0]).not.toEqual(state.original);
});

test('ammo pickups do not add dots to the minimap', async ({ page }) => {
  await boot(page);

  const changedPixels = await page.evaluate(async () => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    const canvas = g.canvas;
    const gl = g.renderer.gl;
    const frame = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const grab = (): Promise<Uint8Array> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          g.events.off('postrender', onPost);
          reject(new Error('readback timeout'));
        }, 8000);
        const onPost = (): void => {
          g.events.off('postrender', onPost);
          try {
            const buf = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            clearTimeout(timer);
            resolve(buf);
          } catch (error) {
            clearTimeout(timer);
            reject(error as Error);
          }
        };
        g.events.on('postrender', onPost);
      });
    const diffCount = (before: Uint8Array, after: Uint8Array): number => {
      let count = 0;
      for (let i = 0; i < before.length; i += 4) {
        const d =
          Math.abs(before[i] - after[i]) +
          Math.abs(before[i + 1] - after[i + 1]) +
          Math.abs(before[i + 2] - after[i + 2]);
        if (d > 24) count += 1;
      }
      return count;
    };

    const originalAmmo = w.ammoPickups.map((pickup) => ({
      pos: { ...pickup.pos },
      amount: pickup.amount,
    }));
    const sample = originalAmmo[0]?.pos ?? { x: w.focus.x + 160, y: w.focus.y };
    const wasPaused = scene.paused;

    scene.paused = true;
    w.ammoPickups = [];
    scene.syncMinimap();
    await frame();
    await frame();
    const base = await grab();

    w.ammoPickups = [{ pos: sample, amount: 18 }];
    scene.syncMinimap();
    await frame();
    await frame();
    const withAmmo = await grab();

    w.ammoPickups = originalAmmo;
    scene.syncMinimap();
    scene.paused = wasPaused;
    await frame();

    return diffCount(base, withAmmo);
  });

  expect(changedPixels).toBe(0);
});
