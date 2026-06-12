import { type Vec2, vec2 } from './vector';
import { clamp } from './math';

/**
 * Screen-space HUD layout maths, kept pure (no Phaser) so it is fully unit
 * testable. The scene zooms its camera to fit each display, but Phaser still
 * applies that zoom to `scrollFactor(0)` objects — so a HUD or minimap drawn at
 * a raw screen pixel is rescaled and shifted off-screen whenever the zoom is not
 * exactly 1 (the "map/HUD missing on laptops and iPads" bug). These helpers undo
 * the camera zoom so a UI element lands on the screen pixel we intend, at its
 * native size, on every display.
 */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Where a `scrollFactor(0)` world point appears on screen once the camera
 * applies `zoom` about the viewport centre (camera origin 0.5, no extra offset):
 *
 *   screen = zoom * world + (viewport / 2) * (1 - zoom)
 *
 * This is exactly Phaser's transform for a scroll-pinned object, so it documents
 * the behaviour the other helpers invert. Pure.
 */
export function cameraWorldToScreen(world: Vec2, viewport: Viewport, zoom: number): Vec2 {
  return vec2(
    zoom * world.x + (viewport.width / 2) * (1 - zoom),
    zoom * world.y + (viewport.height / 2) * (1 - zoom),
  );
}

/**
 * The world position to give a `scrollFactor(0)` object so that, after the
 * camera applies `zoom`, it appears at screen pixel `screen`. The inverse of
 * {@link cameraWorldToScreen}:
 *
 *   world = screen / zoom + (viewport / 2) * (1 - 1 / zoom)
 *
 * Pair with {@link uiCounterScale} so the element also keeps its native size.
 * Pure.
 */
export function uiScreenToWorld(screen: Vec2, viewport: Viewport, zoom: number): Vec2 {
  return vec2(
    screen.x / zoom + (viewport.width / 2) * (1 - 1 / zoom),
    screen.y / zoom + (viewport.height / 2) * (1 - 1 / zoom),
  );
}

/** The scale a `scrollFactor(0)` UI object needs so the camera zoom leaves it at
 * its native pixel size: the reciprocal of the zoom. Pure. */
export function uiCounterScale(zoom: number): number {
  return 1 / zoom;
}

/**
 * Place a corner-anchored UI element (origin top-left) of the given native
 * `size` at `screenAnchor`, but first clamp that anchor so the whole element
 * stays within the viewport even on very small displays. Returns the world
 * position for a `scrollFactor(0)` object; combine with {@link uiCounterScale}.
 * Pure.
 */
export function uiAnchorOnScreen(
  screenAnchor: Vec2,
  size: Viewport,
  viewport: Viewport,
  zoom: number,
): Vec2 {
  const maxX = Math.max(0, viewport.width - size.width);
  const maxY = Math.max(0, viewport.height - size.height);
  const clamped = vec2(clamp(screenAnchor.x, 0, maxX), clamp(screenAnchor.y, 0, maxY));
  return uiScreenToWorld(clamped, viewport, zoom);
}
