import { type Vec2, distance } from './vector';

/** Reach a position within `radius`. */
export interface ReachObjective {
  kind: 'reach';
  description: string;
  target: Vec2;
  radius: number;
}

/** Eliminate a number of targets. */
export interface EliminateObjective {
  kind: 'eliminate';
  description: string;
  count: number;
}

export type Objective = ReachObjective | EliminateObjective;

export type MissionStatus = 'active' | 'completed';

/** A linear sequence of objectives with a completion reward. */
export interface Mission {
  id: string;
  title: string;
  objectives: readonly Objective[];
  /** Index of the objective currently in progress. */
  currentIndex: number;
  status: MissionStatus;
  /** Score awarded when the final objective is completed. */
  reward: number;
}

/** Snapshot of world facts the mission reads to evaluate its objectives. */
export interface MissionContext {
  playerPos: Vec2;
  /** Total eliminations so far this run. */
  kills: number;
}

export interface MissionSpec {
  id: string;
  title: string;
  objectives: readonly Objective[];
  reward?: number;
}

export function createMission(spec: MissionSpec): Mission {
  return {
    id: spec.id,
    title: spec.title,
    objectives: spec.objectives,
    currentIndex: 0,
    status: spec.objectives.length === 0 ? 'completed' : 'active',
    reward: spec.reward ?? 0,
  };
}

/** The objective currently in progress, or null when the mission is done. */
export function currentObjective(m: Mission): Objective | null {
  return m.status === 'active' ? m.objectives[m.currentIndex] : null;
}

function isObjectiveMet(obj: Objective, ctx: MissionContext, killsAtStart: number): boolean {
  switch (obj.kind) {
    case 'reach':
      return distance(ctx.playerPos, obj.target) <= obj.radius;
    case 'eliminate':
      return ctx.kills - killsAtStart >= obj.count;
  }
}

/**
 * Advance the mission against the current context. Completes the active
 * objective when met and moves to the next; marks the mission completed after
 * the last. Pure: returns a new mission. `killsAtStart` is the kill count when
 * the current objective began (for eliminate objectives).
 */
export function updateMission(
  m: Mission,
  ctx: MissionContext,
  killsAtStart: number,
): Mission {
  const obj = currentObjective(m);
  if (!obj) return m;
  if (!isObjectiveMet(obj, ctx, killsAtStart)) return m;

  const nextIndex = m.currentIndex + 1;
  if (nextIndex >= m.objectives.length) {
    return { ...m, currentIndex: m.objectives.length, status: 'completed' };
  }
  return { ...m, currentIndex: nextIndex };
}

export function isComplete(m: Mission): boolean {
  return m.status === 'completed';
}
