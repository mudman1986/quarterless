import { describe, it, expect } from 'vitest';
import {
  createWanted,
  stars,
  isWanted,
  addHeat,
  decay,
  MAX_STARS,
  HEAT_PER_STAR,
  CRIME_HEAT,
} from './wantedLevel';

describe('createWanted', () => {
  it('starts with no heat and no stars', () => {
    const w = createWanted();
    expect(w.heat).toBe(0);
    expect(stars(w)).toBe(0);
    expect(isWanted(w)).toBe(false);
  });
});

describe('stars', () => {
  it('awards one star per HEAT_PER_STAR of heat', () => {
    expect(stars({ heat: HEAT_PER_STAR })).toBe(1);
    expect(stars({ heat: HEAT_PER_STAR * 2.5 })).toBe(2);
  });

  it('never exceeds MAX_STARS', () => {
    expect(stars({ heat: HEAT_PER_STAR * 100 })).toBe(MAX_STARS);
  });
});

describe('addHeat', () => {
  it('raises the star rating across a threshold', () => {
    const w = addHeat(createWanted(), HEAT_PER_STAR);
    expect(stars(w)).toBe(1);
    expect(isWanted(w)).toBe(true);
  });

  it('clamps heat to the maximum', () => {
    const w = addHeat(createWanted(), HEAT_PER_STAR * 1000);
    expect(stars(w)).toBe(MAX_STARS);
  });

  it('is pure (does not mutate the input)', () => {
    const w = createWanted();
    addHeat(w, 50);
    expect(w.heat).toBe(0);
  });
});

describe('decay', () => {
  it('reduces heat at the given rate over time', () => {
    expect(decay({ heat: 100 }, 1, 8).heat).toBe(92);
  });

  it('never drops below zero', () => {
    expect(decay({ heat: 5 }, 1, 100).heat).toBe(0);
  });
});

describe('CRIME_HEAT', () => {
  it('punishes hitting police more than hitting pedestrians', () => {
    expect(CRIME_HEAT.hitPolice).toBeGreaterThan(CRIME_HEAT.hitPedestrian);
  });
});
