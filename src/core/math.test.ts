import { describe, it, expect } from 'vitest';
import { clamp, approachZero, wrap } from './math';

describe('clamp', () => {
  it('limits a value to the inclusive range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('approachZero', () => {
  it('moves toward zero without overshooting', () => {
    expect(approachZero(5, 2)).toBe(3);
    expect(approachZero(1, 5)).toBe(0);
    expect(approachZero(-1, 5)).toBe(0);
  });
});

describe('wrap', () => {
  it('leaves a value already in range unchanged', () => {
    expect(wrap(20, 100)).toBe(20);
  });

  it('wraps a value past the upper edge back toward the start', () => {
    expect(wrap(120, 100)).toBe(20);
  });

  it('wraps a negative value round to the far end', () => {
    expect(wrap(-10, 100)).toBe(90);
  });

  it('maps the upper bound itself to zero', () => {
    expect(wrap(100, 100)).toBe(0);
  });

  it('is safe for a zero or negative range', () => {
    expect(wrap(5, 0)).toBe(0);
  });
});
