import { test, expect } from '@playwright/test';

// Smoke test: the production build must load and Phaser must render a canvas.
// This runs against `vite preview` (the real GitHub Pages artifact) and gates
// deployment in CI.
test('game boots and renders a canvas', async ({ page }) => {
  await page.goto('/sindicate/');

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
});
