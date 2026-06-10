import { describe, it, expect } from 'vitest';
import { createScore, award, resetRun } from './score';

describe('createScore', () => {
  it('starts at zero with an optional best', () => {
    expect(createScore()).toEqual({ current: 0, best: 0 });
    expect(createScore(500)).toEqual({ current: 0, best: 500 });
  });

  it('never accepts a negative best', () => {
    expect(createScore(-10).best).toBe(0);
  });
});

describe('award', () => {
  it('adds points to the current score', () => {
    expect(award(createScore(), 100).current).toBe(100);
  });

  it('raises the best when the current exceeds it', () => {
    const s = award(createScore(50), 100);
    expect(s.best).toBe(100);
  });

  it('keeps a higher best when the current is lower', () => {
    const s = award(createScore(500), 100);
    expect(s.best).toBe(500);
  });

  it('does not allow the current score to go negative', () => {
    expect(award(createScore(), -50).current).toBe(0);
  });
});

describe('resetRun', () => {
  it('clears the current score but keeps the best', () => {
    const s = award(createScore(), 300);
    const reset = resetRun(s);
    expect(reset.current).toBe(0);
    expect(reset.best).toBe(300);
  });
});
