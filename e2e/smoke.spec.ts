import { test, expect } from '@playwright/test';
import { launchPenguinsOfTangram, launchSindicate } from './helpers';

// Smoke tests: the production build must load the arcade landing page, then
// launch Sindicate and render a Phaser canvas.
// This runs against `vite preview` (the real GitHub Pages artifact) and gates
// deployment in CI.
test('landing page lists the playable games', async ({ page }) => {
  await page.goto('/quarterless/');
  await expect(page.getByRole('heading', { name: 'Retro Arcade' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Sindicate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Pixel Sprint' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Penguins of Tangram' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Void Sweep' })).toBeVisible();
});

test('game boots and renders a canvas', async ({ page }) => {
  await launchSindicate(page);
  const canvas = page.locator('#game canvas');

  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
});

test('canvas fits inside a mobile-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await launchSindicate(page);

  const canvas = page.locator('#game canvas');

  const box = await canvas.boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
});

test('Penguins of Tangram starts after character selection', async ({ page }) => {
  await launchPenguinsOfTangram(page, 'Monkey');
  const hud = page.locator('.tangram-platformer-hud');
  await expect(hud.getByText('Monkey • Monkeys Class')).toBeVisible();
  await expect(hud.getByText('0/12')).toBeVisible();
  await expect(hud.getByText('No power-up')).toBeVisible();
});
