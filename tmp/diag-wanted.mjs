// Diagnostic: drive realistic scenarios and read BOTH the internal world state
// AND the actual on-screen HUD text, to find where wanted fails to reset.
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
await page.goto('http://127.0.0.1:4173/sindicate/', { waitUntil: 'load' });
await page.waitForSelector('#game canvas', { timeout: 15000 });
await page.locator('#game canvas').click();
await page.keyboard.press('Space');
await page.waitForTimeout(400);

const read = () =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene('City');
    return {
      stars: s.world.wantedStars,
      heat: Math.round(s.world.wanted.heat),
      status: s.world.status,
      paused: s.paused,
      police: s.world.police.length,
      hud: s.hud?.text ?? '(no hud)',
    };
  });

// --- Scenario: busted while DRIVING (realistic: player flees in a car) ---
await page.evaluate(() => {
  const w = window.__game.scene.getScene('City').world;
  w.wanted.heat = 300;
  // Put the player in the nearest car and drop a foot officer on them.
  const f = w.focus;
  w.police.push({ pos: { x: f.x, y: f.y }, heading: 0, radius: 12, kind: 'foot' });
});
await page.waitForTimeout(500);
console.log('after bust setup:', JSON.stringify(await read()));
await page.waitForTimeout(1500);
console.log('1.5s later     :', JSON.stringify(await read()));

// Press Enter to continue (skip respawn) and see the post-respawn HUD.
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
console.log('after Enter    :', JSON.stringify(await read()));

await browser.close();
