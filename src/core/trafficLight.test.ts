import { describe, it, expect } from 'vitest';
import {
  createTrafficLights,
  tickLights,
  greenAxis,
  axisOf,
  hasGreen,
  LIGHT_GREEN,
  LIGHT_GAP,
  LIGHT_PERIOD,
} from './trafficLight';
import { vec2 } from './vector';

describe('createTrafficLights', () => {
  it('wraps the starting time into the cycle', () => {
    expect(createTrafficLights(0).time).toBe(0);
    expect(createTrafficLights(LIGHT_PERIOD + 1).time).toBeCloseTo(1);
    expect(createTrafficLights(-1).time).toBeCloseTo(LIGHT_PERIOD - 1);
  });
});

describe('tickLights', () => {
  it('advances and wraps at the end of the cycle', () => {
    const l = tickLights(createTrafficLights(LIGHT_PERIOD - 0.5), 1);
    expect(l.time).toBeCloseTo(0.5);
  });
});

describe('greenAxis', () => {
  it('serves horizontal first, then vertical, with all-red gaps between', () => {
    expect(greenAxis(createTrafficLights(0))).toBe('horizontal');
    expect(greenAxis(createTrafficLights(LIGHT_GREEN - 0.1))).toBe('horizontal');
    expect(greenAxis(createTrafficLights(LIGHT_GREEN + LIGHT_GAP / 2))).toBeNull(); // gap
    expect(greenAxis(createTrafficLights(LIGHT_PERIOD / 2))).toBe('vertical');
    expect(greenAxis(createTrafficLights(LIGHT_PERIOD - 0.1))).toBeNull(); // final gap
  });

  it('never lets both axes go at once', () => {
    for (let t = 0; t < LIGHT_PERIOD; t += 0.1) {
      const axis = greenAxis(createTrafficLights(t));
      expect(axis === 'horizontal' || axis === 'vertical' || axis === null).toBe(true);
    }
  });
});

describe('axisOf and hasGreen', () => {
  it('classifies cardinal directions by axis', () => {
    expect(axisOf(vec2(1, 0))).toBe('horizontal');
    expect(axisOf(vec2(-1, 0))).toBe('horizontal');
    expect(axisOf(vec2(0, 1))).toBe('vertical');
  });

  it('gives a car green only when its axis is green', () => {
    const horizontalGreen = createTrafficLights(0);
    expect(hasGreen(horizontalGreen, vec2(1, 0))).toBe(true);
    expect(hasGreen(horizontalGreen, vec2(0, 1))).toBe(false);
  });
});
