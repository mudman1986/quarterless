import { describe, it, expect } from 'vitest';
import {
  type Viewport,
  cameraWorldToScreen,
  uiScreenToWorld,
  uiCounterScale,
  uiAnchorOnScreen,
} from './hudLayout';
import { vec2 } from './vector';

// A spread of viewports a real player might have, plus the full clamped zoom
// range the scene derives (MIN_ZOOM 0.6 .. MAX_ZOOM 2.5). Zoom 1 is the trivial
// case; the bug only bites when zoom != 1.
const viewports: Viewport[] = [
  { width: 1366, height: 768 }, // common laptop
  { width: 1920, height: 1080 }, // large desktop (zoom > 1)
  { width: 1024, height: 768 }, // iPad landscape
  { width: 768, height: 1024 }, // iPad portrait
  { width: 800, height: 600 }, // small window (zoom < 1)
];
const zooms = [0.6, 0.8, 1, 1.25, 1.42, 2, 2.5];

describe('cameraWorldToScreen / uiScreenToWorld', () => {
  it('round-trips: placing a UI element via uiScreenToWorld lands it on the wanted screen pixel', () => {
    // This is the whole point: Phaser still applies the camera zoom to a
    // scrollFactor-0 object, so to make it appear at screen pixel S we must
    // place it at the world point uiScreenToWorld(S). Feeding that back through
    // the camera transform must return S.
    for (const v of viewports) {
      for (const zoom of zooms) {
        for (const screen of [vec2(10, 10), vec2(v.width / 2, 84), vec2(v.width - 180, 12)]) {
          const world = uiScreenToWorld(screen, v, zoom);
          const back = cameraWorldToScreen(world, v, zoom);
          expect(back.x).toBeCloseTo(screen.x, 6);
          expect(back.y).toBeCloseTo(screen.y, 6);
        }
      }
    }
  });

  it('is the identity when the camera is not zoomed', () => {
    const v = { width: 1280, height: 720 };
    expect(uiScreenToWorld(vec2(10, 10), v, 1)).toEqual(vec2(10, 10));
    expect(cameraWorldToScreen(vec2(10, 10), v, 1)).toEqual(vec2(10, 10));
  });

  it('keeps the viewport centre fixed at any zoom', () => {
    for (const v of viewports) {
      for (const zoom of zooms) {
        const centre = vec2(v.width / 2, v.height / 2);
        const back = cameraWorldToScreen(uiScreenToWorld(centre, v, zoom), v, zoom);
        expect(back.x).toBeCloseTo(centre.x, 6);
        expect(back.y).toBeCloseTo(centre.y, 6);
      }
    }
  });

  it('reproduces the bug: a raw screen anchor drifts off-screen once zoomed', () => {
    // A top-right minimap drawn at a raw screen coordinate (the old behaviour):
    // under any zoom != 1 the camera transform pushes it outside the viewport,
    // which is exactly why the map/HUD vanished on laptops and iPads.
    const v = { width: 1920, height: 1080 };
    const rawTopRight = vec2(v.width - 180, 12);
    const drifted = cameraWorldToScreen(rawTopRight, v, 1.42);
    const offScreen = drifted.x > v.width || drifted.x < 0 || drifted.y < 0 || drifted.y > v.height;
    expect(offScreen).toBe(true);
  });
});

describe('uiCounterScale', () => {
  it('is the reciprocal of the zoom, so the element keeps its native pixel size', () => {
    expect(uiCounterScale(2)).toBeCloseTo(0.5);
    expect(uiCounterScale(0.5)).toBeCloseTo(2);
    expect(uiCounterScale(1)).toBe(1);
  });
});

describe('uiAnchorOnScreen', () => {
  it('keeps a corner-anchored element fully within the viewport at every zoom', () => {
    // The minimap is a 168px square anchored 12px from the top-right corner.
    const size = { width: 168, height: 168 };
    const margin = 12;
    for (const v of viewports) {
      for (const zoom of zooms) {
        const anchor = uiAnchorOnScreen(
          vec2(v.width - size.width - margin, margin),
          size,
          v,
          zoom,
        );
        // Map the element's on-screen corners back through the camera: both must
        // sit inside [0,width] x [0,height], i.e. the whole map is visible.
        const topLeft = cameraWorldToScreen(anchor, v, zoom);
        const bottomRight = cameraWorldToScreen(
          vec2(anchor.x + size.width / zoom, anchor.y + size.height / zoom),
          v,
          zoom,
        );
        expect(topLeft.x).toBeGreaterThanOrEqual(-1e-6);
        expect(topLeft.y).toBeGreaterThanOrEqual(-1e-6);
        expect(bottomRight.x).toBeLessThanOrEqual(v.width + 1e-6);
        expect(bottomRight.y).toBeLessThanOrEqual(v.height + 1e-6);
      }
    }
  });

  it('clamps an anchor that would otherwise overflow a tiny viewport', () => {
    // Viewport narrower than the element + margins: the anchor is pulled in so
    // the element never starts off the left/top edge.
    const v = { width: 150, height: 150 };
    const size = { width: 168, height: 168 };
    const anchor = uiAnchorOnScreen(vec2(v.width - size.width - 12, 12), size, v, 1);
    expect(anchor.x).toBeGreaterThanOrEqual(0);
    expect(anchor.y).toBeGreaterThanOrEqual(0);
  });
});
