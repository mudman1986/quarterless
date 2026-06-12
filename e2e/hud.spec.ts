import { test, expect, type Page } from '@playwright/test';

/**
 * Regression test for the HUD and minimap drifting off-screen on laptops and
 * iPads. The scene zooms its camera to fit the display, and Phaser still applies
 * that zoom (about the viewport centre) to the `scrollFactor(0)` HUD/minimap, so
 * at any zoom other than 1 a UI element placed at a raw screen pixel is rescaled
 * and pushed outside the canvas.
 *
 * Crucially we do NOT trust any analytic camera transform here (`camera.matrix`
 * reports the wrong screen position for scroll-pinned objects in this Phaser
 * build). Instead we measure the GROUND TRUTH: we snapshot the rendered frame
 * with a UI element hidden, snapshot again with it shown, and diff the pixels.
 * The changed pixels are exactly that element, so its on-screen rectangle is
 * whatever the GPU actually drew — completely independent of the production
 * layout maths, which is what makes this a meaningful check and not a tautology.
 */

// Native on-screen size of the minimap square (see MINIMAP_SIZE in CityScene).
const MINIMAP_SIZE = 168;

interface PixelBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
}
interface Measurement {
  canvas: { w: number; h: number };
  gameSize: { w: number; h: number };
  zoom: number;
  hud: PixelBox;
  minimap: PixelBox;
}

const sizes = [
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'large desktop', width: 1920, height: 1080 },
  { name: 'iPad landscape', width: 1024, height: 768 },
  { name: 'iPad portrait', width: 768, height: 1024 },
];

async function boot(page: Page): Promise<void> {
  await page.goto('/sindicate/');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#game canvas').click(); // give Phaser keyboard focus
  await page.waitForFunction(() => !!(window as unknown as { __game?: unknown }).__game);
  await page.waitForTimeout(300); // let the first resize/layout settle
}

/**
 * Measure the true on-screen rectangle of the HUD and the minimap by isolating
 * each one with a hide/show snapshot diff against a frozen background.
 */
async function measureUi(page: Page): Promise<Measurement> {
  return page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const g = (window as any).__game;
    const s = g.scene.getScene('City');
    const canvas: HTMLCanvasElement = g.canvas;
    const w = canvas.width;
    const h = canvas.height;
    const gl: WebGLRenderingContext = g.renderer.gl;

    // Capture the rendered frame deterministically: hook Phaser's post-render
    // event and read the GPU framebuffer while it still holds the frame. This is
    // reliable (fires every frame) unlike the async snapshot-to-Image API.
    // Note: gl.readPixels returns rows bottom-to-top, so y is flipped here and
    // converted back to screen space when the bounding box is reported.
    const grab = (): Promise<Uint8Array> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          g.events.off('postrender', onPost);
          reject(new Error('readback timeout'));
        }, 8000);
        const onPost = (): void => {
          g.events.off('postrender', onPost);
          try {
            const buf = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            clearTimeout(timer);
            resolve(buf);
          } catch (err) {
            clearTimeout(timer);
            reject(err as Error);
          }
        };
        g.events.on('postrender', onPost);
      });
    const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

    const boxOfDiff = (a: Uint8Array, b: Uint8Array) => {
      let minX = w;
      let minBufY = h;
      let maxX = -1;
      let maxBufY = -1;
      let count = 0;
      for (let by = 0; by < h; by++) {
        for (let x = 0; x < w; x++) {
          const i = (by * w + x) * 4;
          const d =
            Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
          if (d > 24) {
            count++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (by < minBufY) minBufY = by;
            if (by > maxBufY) maxBufY = by;
          }
        }
      }
      // Flip buffer rows (bottom-up) back to screen rows (top-down).
      const minY = count === 0 ? h : h - 1 - maxBufY;
      const maxY = count === 0 ? -1 : h - 1 - minBufY;
      return { minX, minY, maxX, maxY, count };
    };

    // Freeze the simulation so the only thing that differs between snapshots is
    // the UI element we toggle (the city, sprites and overlays stay put).
    const wasPaused = s.paused;
    s.paused = true;
    await frame();

    const hud = s.hud;
    const mmBg = s.minimapBg;
    const mmDots = s.minimapDots;

    hud.setVisible(false);
    mmBg.setVisible(false);
    mmDots.setVisible(false);
    await frame();
    await frame();
    const base = await grab();

    mmBg.setVisible(true);
    mmDots.setVisible(true);
    await frame();
    await frame();
    const withMinimap = await grab();
    const minimap = boxOfDiff(base, withMinimap);

    mmBg.setVisible(false);
    mmDots.setVisible(false);
    hud.setVisible(true);
    await frame();
    await frame();
    const withHud = await grab();
    const hudBox = boxOfDiff(base, withHud);

    // Restore the UI and the previous pause state.
    mmBg.setVisible(true);
    mmDots.setVisible(true);
    s.paused = wasPaused;
    await frame();

    const gs = s.scale.gameSize;
    return {
      canvas: { w, h },
      gameSize: { w: gs.width, h: gs.height },
      zoom: s.cameras.main.zoom,
      hud: hudBox,
      minimap,
    };
  });
}

/** Assert a UI element is rendered and lies fully inside the canvas. */
function expectFullyVisible(label: string, box: PixelBox, m: Measurement): void {
  expect(box.count, `${label} should actually be rendered (non-empty)`).toBeGreaterThan(200);
  expect(box.minX, `${label} left edge inside canvas`).toBeGreaterThanOrEqual(0);
  expect(box.minY, `${label} top edge inside canvas`).toBeGreaterThanOrEqual(0);
  expect(box.maxX, `${label} right edge inside canvas`).toBeLessThanOrEqual(m.canvas.w - 1);
  expect(box.maxY, `${label} bottom edge inside canvas`).toBeLessThanOrEqual(m.canvas.h - 1);
}

for (const size of sizes) {
  test(`HUD and minimap stay fully on-screen at ${size.name} (${size.width}x${size.height})`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await boot(page);
    const m = await measureUi(page);

    // Backing-store pixels per game unit (1 unless the device has a DPR > 1).
    const pxPerUnit = m.canvas.w / m.gameSize.w;

    expectFullyVisible('HUD', m.hud, m);
    // The HUD is anchored top-left, so it must sit in the top-left quadrant —
    // catches it drifting toward/over the opposite edges under zoom.
    expect(m.hud.minX, 'HUD hugs the left').toBeLessThan(m.canvas.w * 0.5);
    expect(m.hud.minY, 'HUD hugs the top').toBeLessThan(m.canvas.h * 0.5);

    expectFullyVisible('minimap', m.minimap, m);
    // The minimap is counter-scaled, so its on-screen size must equal its native
    // size at every zoom; if it were clipped by an edge the measured size would
    // shrink. This is the crux of the "not fully visible" bug.
    const expected = MINIMAP_SIZE * pxPerUnit;
    expect(m.minimap.maxX - m.minimap.minX, 'minimap full width visible').toBeGreaterThanOrEqual(
      expected - 6,
    );
    expect(m.minimap.maxY - m.minimap.minY, 'minimap full height visible').toBeGreaterThanOrEqual(
      expected - 6,
    );
    // Anchored top-right.
    expect(m.minimap.maxX, 'minimap hugs the right').toBeGreaterThan(m.canvas.w * 0.5);
    expect(m.minimap.minY, 'minimap hugs the top').toBeLessThan(m.canvas.h * 0.5);
  });
}

test('HUD and minimap re-fit when the viewport is resized (browser zoom)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await boot(page);
  let m = await measureUi(page);
  expectFullyVisible('minimap', m.minimap, m);
  expectFullyVisible('HUD', m.hud, m);

  // Simulate the player zooming the browser / rotating the device: the viewport
  // changes, the derived camera zoom changes with it, and the UI must re-pin.
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForTimeout(400);
  m = await measureUi(page);
  expectFullyVisible('minimap', m.minimap, m);
  expectFullyVisible('HUD', m.hud, m);
});
