import { expect, test, type Page } from '@playwright/test';
import { launchSindicate } from './helpers';

const VEHICLE_SHEET = 'tex-sheet-vehicles';
const PEOPLE_SHEET = 'tex-sheet-people';
const TILE_SHEET = 'tex-sheet-tiles';
const EFFECTS_SHEET = 'tex-sheet-effects';

interface RenderStats {
  allCarSpritesUseSheet: boolean;
  allPedSpritesUseSheet: boolean;
  tileSheetFrames: number;
  effectsSheetFrames: number;
  vehicleSheetFrames: number;
  peopleSheetFrames: number;
  uniqueCarFrames: number;
  uniquePedFrames: number;
  visibleCars: number;
  visiblePeds: number;
  distinctBuckets: number;
  brightPixels: number;
  saturatedPixels: number;
  roadLikePixels: number;
}

test.use({ viewport: { width: 1366, height: 768 } });

async function boot(page: Page): Promise<void> {
  await launchSindicate(page);
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene?: { getScene: (key: string) => unknown } } }).__game;
    const scene = game?.scene?.getScene('City') as
      | {
          carSprites?: unknown[];
          pedSprites?: unknown[];
          hud?: { visible?: boolean };
          minimapBg?: { visible?: boolean };
          minimapDots?: { visible?: boolean };
        }
      | undefined;
    return (
      (scene?.carSprites?.length ?? 0) > 0 &&
      (scene?.pedSprites?.length ?? 0) > 0 &&
      !!scene?.hud?.visible &&
      !!scene?.minimapBg?.visible &&
      !!scene?.minimapDots?.visible
    );
  });
  await page.waitForTimeout(100);
}

async function measureCityRender(page: Page): Promise<RenderStats> {
  return page.evaluate(async ({ vehicleSheet, peopleSheet, tileSheet, effectsSheet }) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const game = (window as any).__game;
    const scene = game.scene.getScene('City');
    const canvas: HTMLCanvasElement = game.canvas;
    const gl: WebGLRenderingContext = game.renderer.gl;
    const cam = scene.cameras.main;

    const grab = (): Promise<Uint8Array> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          game.events.off('postrender', onPost);
          reject(new Error('readback timeout'));
        }, 8000);
        const onPost = (): void => {
          game.events.off('postrender', onPost);
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
        game.events.on('postrender', onPost);
      });
    const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

    const viewContains = (x: number, y: number): boolean =>
      x >= cam.worldView.x &&
      x <= cam.worldView.x + cam.worldView.width &&
      y >= cam.worldView.y &&
      y <= cam.worldView.y + cam.worldView.height;

    const crowdedWindowCenter = (): { x: number; y: number } => {
      const entities = [
        ...scene.world.cars.map((car: { pos: { x: number; y: number } }) => car.pos),
        ...scene.world.pedestrians.map((ped: { pos: { x: number; y: number } }) => ped.pos),
      ];
      const windowSize = 360;
      let best = { count: -1, x: scene.world.player.pos.x, y: scene.world.player.pos.y };
      const bins = new Map<string, { count: number; x: number; y: number }>();
      for (const pos of entities) {
        const bx = Math.floor(pos.x / windowSize);
        const by = Math.floor(pos.y / windowSize);
        const key = `${bx}:${by}`;
        const entry = bins.get(key) ?? { count: 0, x: (bx + 0.5) * windowSize, y: (by + 0.5) * windowSize };
        entry.count += 1;
        bins.set(key, entry);
        if (entry.count > best.count) best = entry;
      }
      return { x: best.x, y: best.y };
    };

    const wasPaused = scene.paused;
    const prevZoom = cam.zoom;
    const prevScrollX = cam.scrollX;
    const prevScrollY = cam.scrollY;
    const hudVisible = scene.hud.visible;
    const minimapBgVisible = scene.minimapBg.visible;
    const minimapDotsVisible = scene.minimapDots.visible;

    scene.paused = true;
    scene.hud.setVisible(false);
    scene.minimapBg.setVisible(false);
    scene.minimapDots.setVisible(false);

    const focus = crowdedWindowCenter();
    cam.stopFollow();
    cam.setZoom(Math.min(prevZoom, 0.9));
    cam.centerOn(focus.x, focus.y);

    await frame();
    await frame();
    const pixels = await grab();

    const allCarSpritesUseSheet = scene.carSprites.every((sprite: { texture: { key: string } }) => sprite.texture.key === vehicleSheet);
    const allPedSpritesUseSheet = scene.pedSprites.every((sprite: { texture: { key: string } }) => sprite.texture.key === peopleSheet);
    const tileSheetFrames = scene.textures.get(tileSheet).getFrameNames().filter((name: string) => name !== '__BASE').length;
    const effectsSheetFrames = scene.textures.get(effectsSheet).getFrameNames().filter((name: string) => name !== '__BASE').length;
    const vehicleSheetFrames = scene.textures.get(vehicleSheet).getFrameNames().filter((name: string) => name !== '__BASE').length;
    const peopleSheetFrames = scene.textures.get(peopleSheet).getFrameNames().filter((name: string) => name !== '__BASE').length;
    const uniqueCarFrames = new Set(
      scene.carSprites.map((sprite: { frame: { name: string | number } }) => String(sprite.frame.name)),
    ).size;
    const uniquePedFrames = new Set(
      scene.pedSprites.map((sprite: { frame: { name: string | number } }) => String(sprite.frame.name)),
    ).size;
    const visibleCars = scene.carSprites.filter((sprite: { x: number; y: number; visible: boolean }) => sprite.visible && viewContains(sprite.x, sprite.y)).length;
    const visiblePeds = scene.pedSprites.filter((sprite: { x: number; y: number; visible: boolean }) => sprite.visible && viewContains(sprite.x, sprite.y)).length;

    const buckets = new Set<string>();
    let brightPixels = 0;
    let saturatedPixels = 0;
    let roadLikePixels = 0;
    for (let by = 0; by < canvas.height; by += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const i = (by * canvas.width + x) * 4;
        const alpha = pixels[i + 3];
        if (alpha < 200) continue;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        buckets.add(`${r >> 5}-${g >> 5}-${b >> 5}`);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max > 180 && r + g + b > 420) brightPixels += 1;
        if (max > 90 && max - min > 55) saturatedPixels += 1;
        if (max < 72 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20) roadLikePixels += 1;
      }
    }

    cam.setZoom(prevZoom);
    cam.setScroll(prevScrollX, prevScrollY);
    if (scene.focusPoint) cam.startFollow(scene.focusPoint, true, 0.15, 0.15);
    scene.hud.setVisible(hudVisible);
    scene.minimapBg.setVisible(minimapBgVisible);
    scene.minimapDots.setVisible(minimapDotsVisible);
    scene.paused = wasPaused;
    await frame();

    return {
      allCarSpritesUseSheet,
      allPedSpritesUseSheet,
      tileSheetFrames,
      effectsSheetFrames,
      vehicleSheetFrames,
      peopleSheetFrames,
      uniqueCarFrames,
      uniquePedFrames,
      visibleCars,
      visiblePeds,
      distinctBuckets: buckets.size,
      brightPixels,
      saturatedPixels,
      roadLikePixels,
    };
  }, { vehicleSheet: VEHICLE_SHEET, peopleSheet: PEOPLE_SHEET, tileSheet: TILE_SHEET, effectsSheet: EFFECTS_SHEET });
}

test('city render stays varied and uses authored art sheets', async ({ page }) => {
  await boot(page);
  const stats = await measureCityRender(page);

  expect(stats.allCarSpritesUseSheet).toBeTruthy();
  expect(stats.allPedSpritesUseSheet).toBeTruthy();
  expect(stats.tileSheetFrames).toBeGreaterThanOrEqual(10);
  expect(stats.effectsSheetFrames).toBeGreaterThanOrEqual(12);
  expect(stats.vehicleSheetFrames).toBeGreaterThanOrEqual(22);
  expect(stats.peopleSheetFrames).toBeGreaterThanOrEqual(16);
  expect(stats.uniqueCarFrames).toBeGreaterThanOrEqual(8);
  expect(stats.uniquePedFrames).toBeGreaterThanOrEqual(1);
  expect(stats.visibleCars).toBeGreaterThanOrEqual(4);
  expect(stats.visiblePeds).toBeGreaterThanOrEqual(1);
  expect(stats.distinctBuckets).toBeGreaterThanOrEqual(24);
  expect(stats.brightPixels).toBeGreaterThanOrEqual(500);
  expect(stats.saturatedPixels).toBeGreaterThanOrEqual(1200);
  expect(stats.roadLikePixels).toBeGreaterThanOrEqual(10_000);
});