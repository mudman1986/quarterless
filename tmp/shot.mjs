// Dev-only screenshot helper: launches the built game in headless Chromium,
// optionally fast-forwards the day/night clock, and writes a PNG so the
// developer/agent can visually inspect the rendering. Not part of the app or
// the test suite. Usage: node tmp/shot.mjs <outfile> [warmupMs] [nightFrac]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'tmp/shot.png';
const warmupMs = Number(process.argv[3] ?? 1500);
const nightFrac = process.argv[4] !== undefined ? Number(process.argv[4]) : null;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://127.0.0.1:4173/sindicate/', { waitUntil: 'load' });
await page.waitForSelector('#game canvas', { timeout: 15000 });
// A key press unlocks audio and lets us drive a little movement for variety.
await page.keyboard.press('Space');
await page.waitForTimeout(warmupMs);

// Optionally jump the day/night cycle to a given fraction (0=noon..0.5=midnight)
// by holding nothing and letting the scene's own clock run is too slow, so we
// poke the scene through the global Phaser game if exposed; otherwise skip.
if (nightFrac !== null) {
  await page.evaluate((frac) => {
    // @ts-ignore - dev hook
    const g = window.__game;
    const scene = g?.scene?.getScene?.('City');
    if (scene) scene.timeOfDay = frac * 150;
  }, nightFrac);
  await page.waitForTimeout(200);
}

await page.screenshot({ path: out });
await browser.close();
if (errors.length) console.error('PAGE ERRORS:\n' + errors.join('\n'));
console.log('wrote ' + out);
