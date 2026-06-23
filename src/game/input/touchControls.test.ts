import { describe, expect, it } from 'vitest';
import { vec2 } from '../../core/vector';
import { clampStick, readTouchSnapshot, touchLayoutForViewport, touchSupported, type TouchLayout } from './touchControls';

const layout: TouchLayout = {
  move: {
    center: vec2(96, 240),
    radius: 72,
    captureRadius: 110,
    deadZone: 18,
    maxOffset: 30,
    knobRadius: 26,
  },
  action: { center: vec2(300, 226), radius: 38 },
  fire: { center: vec2(360, 170), radius: 38 },
  confirm: { center: vec2(360, 88), radius: 30 },
};

describe('touchSupported', () => {
  it('detects coarse-pointer and touch-capable devices', () => {
    expect(touchSupported({ coarsePointer: true })).toBe(true);
    expect(touchSupported({ maxTouchPoints: 5 })).toBe(true);
    expect(touchSupported({ maxTouchPoints: 0, coarsePointer: false })).toBe(false);
  });
});

describe('clampStick', () => {
  it('caps the thumb knob offset to the configured max distance', () => {
    const knob = clampStick(vec2(196, 240), layout.move);
    expect(knob.x).toBeCloseTo(layout.move.center.x + layout.move.maxOffset);
    expect(knob.y).toBeCloseTo(layout.move.center.y);
  });
});

describe('readTouchSnapshot', () => {
  it('returns neutral controls with no touches', () => {
    const snapshot = readTouchSnapshot([], layout);
    expect(snapshot.controls).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
      action: false,
      confirm: false,
      fire: false,
    });
    expect(snapshot.knob).toEqual(layout.move.center);
  });

  it('maps a movement touch into directional controls', () => {
    const snapshot = readTouchSnapshot([vec2(130, 214)], layout);
    expect(snapshot.controls.right).toBe(true);
    expect(snapshot.controls.up).toBe(true);
    expect(snapshot.controls.left).toBe(false);
    expect(snapshot.controls.down).toBe(false);
  });

  it('reads action, fire, and confirm buttons independently of movement', () => {
    const snapshot = readTouchSnapshot(
      [vec2(96, 240), vec2(300, 226), vec2(360, 170), vec2(360, 88)],
      layout,
    );
    expect(snapshot.controls.action).toBe(true);
    expect(snapshot.controls.fire).toBe(true);
    expect(snapshot.controls.confirm).toBe(true);
  });

  it('ignores touches outside the movement capture radius', () => {
    const snapshot = readTouchSnapshot([vec2(240, 240)], layout);
    expect(snapshot.controls.left).toBe(false);
    expect(snapshot.controls.right).toBe(false);
    expect(snapshot.knob).toEqual(layout.move.center);
  });
});

describe('touchLayoutForViewport', () => {
  it('keeps every touch control circle fully inside mobile and tablet viewports', () => {
    const viewports = [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
    ];

    for (const viewport of viewports) {
      const l = touchLayoutForViewport(viewport.width, viewport.height);
      const circles = [l.move, l.action, l.fire, l.confirm].filter((circle) => !!circle);
      for (const circle of circles) {
        expect(circle.center.x - circle.radius).toBeGreaterThanOrEqual(0);
        expect(circle.center.y - circle.radius).toBeGreaterThanOrEqual(0);
        expect(circle.center.x + circle.radius).toBeLessThanOrEqual(viewport.width);
        expect(circle.center.y + circle.radius).toBeLessThanOrEqual(viewport.height);
      }
    }
  });
});
