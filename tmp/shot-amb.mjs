// Dev-only: injects an ambulance via the dev hook, forces night, pins it in
// place, then samples the blue-lamp and red-lamp pixels over time. A working
// strobe makes them swing in anti-phase (blue bright while red dim, then swap).
// Not part of the app or test suite. Usage: node tmp/shot-amb.mjs
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://127.0.0.1:4173/sindicate/', { waitUntil: 'load' });
await page.waitForSelector('#game canvas', { timeout: 15000 });
await page.keyboard.press('Space');
await page.waitForTimeout(800);

const ZOOM = 2.4;
const OFFSET_Y = -90;
const FWD = 6.5; // beacon constants baked into syncAmbulance
const SIDE = 3.5;

await page.evaluate(
  ({ zoom, offsetY }) => {
    // @ts-ignore - dev hook
    const scene = window.__game.scene.getScene('City');
    scene.timeOfDay = 900; // midnight, for contrast
    scene.cameras.main.setZoom(zoom);
    scene.nightAura.setVisible(false); // isolate the beacon's own light
    scene.nightLights.setVisible(false);
    const f = scene.world.focus;
    scene.world.ambulance = {
      pos: { x: f.x, y: f.y + offsetY },
      heading: 0,
      radius: 14,
      dir: { x: 1, y: 0 },
      target: { x: f.x + 4000, y: f.y + offsetY },
      carrying: true,
      age: 0,
    };
  },
  { zoom: ZOOM, offsetY: OFFSET_Y },
);

const cx = 900 / 2;
const cy = 600 / 2;
const baseSX = Math.round(cx + FWD * ZOOM);
const blueSX = baseSX;
const blueSY = Math.round(cy + (OFFSET_Y - SIDE) * ZOOM);
const redSX = baseSX;
const redSY = Math.round(cy + (OFFSET_Y + SIDE) * ZOOM);

function sampleAt(x, y) {
  return page.evaluate(
    ({ x, y, offsetY }) =>
      new Promise((resolve) => {
        // @ts-ignore - dev hook
        const scene = window.__game.scene.getScene('City');
        const f = scene.world.focus;
        const a = scene.world.ambulance;
        if (a) {
          a.pos = { x: f.x, y: f.y + offsetY };
          a.heading = 0;
        }
        scene.game.renderer.snapshotPixel(x, y, (c) => resolve([c.red, c.green, c.blue]));
      }),
    { x, y, offsetY: OFFSET_Y },
  );
}

const rows = [];
for (let i = 0; i < 16; i++) {
  const blue = await sampleAt(blueSX, blueSY);
  const red = await sampleAt(redSX, redSY);
  rows.push({ blue, red });
  await page.waitForTimeout(55);
}

console.log('blue lamp screen:', blueSX, blueSY, ' red lamp screen:', redSX, redSY);
for (const { blue, red } of rows) {
  console.log(`blue B=${String(blue[2]).padStart(3)}  red R=${String(red[0]).padStart(3)}`);
}

await page.screenshot({ path: 'tmp/shot-amb.png' });
await browser.close();
if (errors.length) console.error('PAGE ERRORS:\n' + errors.join('\n'));
