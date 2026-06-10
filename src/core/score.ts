/** Player money/score with a persisted high score. Pure and engine-agnostic. */
export interface Score {
  /** Current run's money/points. */
  current: number;
  /** Best score seen so far. */
  best: number;
}

export function createScore(best = 0): Score {
  return { current: 0, best: Math.max(0, best) };
}

/** Award points, keeping `best` in sync. Pure. */
export function award(score: Score, points: number): Score {
  const current = Math.max(0, score.current + points);
  return { current, best: Math.max(score.best, current) };
}

/** Reset the current run, preserving the high score. Pure. */
export function resetRun(score: Score): Score {
  return { current: 0, best: score.best };
}
