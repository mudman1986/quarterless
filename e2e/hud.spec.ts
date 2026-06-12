import { test, expect, type Page } from '@playwright/test';

/**
 * Regression test for the HUD and minimap drifting off-screen on laptops and
 * iPads. The scene zooms its camera to fit the display, and Phaser still applies
 * that zoom to the `scrollFactor(0)` HUD/minimap — so at any zoom other than 1
 * they used to be rescaled and pushed outside the canvas. This drives the REAL
 * built game (via `window.__game`) at several viewport sizes and asserts both
 * pieces of UI render fully inside the canvas — the gap the `World` unit tests
 * cannot see.
 */

interface SceneProbe {
  cameras: {
    main: {
      zoom: number;
      matrix: { transformPoint(x: number, y: number): { x: number; y: number } };
    };
  };
  scale: { gameSize: { width: number; height: number } };
  hud: { x: number; y: number; displayWidth: number; displayHeight: number };
  minimapBg: { x: number; y: number; displayWidth: number; displayHeight: number };
}
interface GameProbe {
  scene: { getScene(key: string): SceneProbe };
}

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface UiSnapshot {
  width: number;
  height: number;
  zoom: number;
  hud: ScreenRect;
  minimap: ScreenRect;
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

/** Read the on-screen rectangles of the HUD and minimap from the running game,
 * using the camera's own transform matrix (so it reflects what is actually
 * rendered, zoom included). */
async function readUi(page: Page): Promise<UiSnapshot> {
  return page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const s = g.scene.getScene('City');
    const zoom = s.cameras.main.zoom;
    const { width, height } = s.scale.gameSize;
    const rectOf = (o: {
      x: number;
      y: number;
      displayWidth: number;
      displayHeight: number;
    }): ScreenRect => {
      const tl = s.cameras.main.matrix.transformPoint(o.x, o.y); // origin (0,0)
      return {
        left: tl.x,
        top: tl.y,
        right: tl.x + o.displayWidth * zoom,
        bottom: tl.y + o.displayHeight * zoom,
      };
    };
    return { width, height, zoom, hud: rectOf(s.hud), minimap: rectOf(s.minimapBg) };
  });
}

function expectWithinCanvas(ui: UiSnapshot): void {
  for (const [label, r] of [
    ['HUD', ui.hud],
    ['minimap', ui.minimap],
  ] as const) {
    expect(r.left, `${label} left edge`).toBeGreaterThanOrEqual(-1);
    expect(r.top, `${label} top edge`).toBeGreaterThanOrEqual(-1);
    expect(r.right, `${label} right edge`).toBeLessThanOrEqual(ui.width + 1);
    expect(r.bottom, `${label} bottom edge`).toBeLessThanOrEqual(ui.height + 1);
  }
}

for (const size of sizes) {
  test(`HUD and minimap stay fully on-screen at ${size.name} (${size.width}x${size.height})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await boot(page);
    expectWithinCanvas(await readUi(page));
  });
}

test('HUD and minimap re-fit when the viewport is resized (browser zoom)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await boot(page);
  expectWithinCanvas(await readUi(page));

  // Simulate the player zooming the browser / rotating the device: the viewport
  // changes, the derived camera zoom changes with it, and the UI must re-pin.
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForTimeout(400);
  expectWithinCanvas(await readUi(page));
});
