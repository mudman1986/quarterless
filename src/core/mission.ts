import { type Vec2, distance } from './vector';
import { clamp } from './math';

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
  /** When true, only designated mission targets count toward the objective. */
  targetsOnly?: boolean;
}

/** Collect a number of pickups. */
export interface CollectObjective {
  kind: 'collect';
  description: string;
  count: number;
}

/** Stay alive for a number of seconds. */
export interface SurviveObjective {
  kind: 'survive';
  description: string;
  seconds: number;
}

/** Reach a given wanted-level star rating. */
export interface WantedObjective {
  kind: 'wanted';
  description: string;
  stars: number;
}

export type ServiceObjectiveKind = 'police' | 'ambulance' | 'tow';

export interface ServiceCompletionCounts {
  police: number;
  ambulance: number;
  tow: number;
}

/** Complete a number of police / ambulance / tow service runs. */
export interface ServiceObjective {
  kind: 'service';
  description: string;
  service: ServiceObjectiveKind;
  count: number;
}

export type Objective =
  | ReachObjective
  | EliminateObjective
  | CollectObjective
  | SurviveObjective
  | WantedObjective
  | ServiceObjective;

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
  /** Total designated mission targets eliminated so far this run. */
  targetKills: number;
  /** Total pickups collected so far this run. */
  collected: number;
  /** Total seconds elapsed so far this run. */
  elapsed: number;
  /** Current wanted-level star rating. */
  wantedStars: number;
  /** Completed player service runs so far this run. */
  serviceCompleted?: ServiceCompletionCounts;
}

/**
 * Counters captured when the current objective began, so progress
 * (kills/pickups/time) is measured relative to its start.
 */
export interface MissionBaseline {
  kills: number;
  targetKills: number;
  collected: number;
  elapsed: number;
  serviceCompleted?: ServiceCompletionCounts;
}

function eliminateProgress(
  obj: EliminateObjective,
  ctx: MissionContext,
  base: MissionBaseline,
): number {
  return obj.targetsOnly ? ctx.targetKills - base.targetKills : ctx.kills - base.kills;
}

function serviceProgress(obj: ServiceObjective, ctx: MissionContext, base: MissionBaseline): number {
  const now = ctx.serviceCompleted?.[obj.service] ?? 0;
  const then = base.serviceCompleted?.[obj.service] ?? 0;
  return now - then;
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

function isObjectiveMet(obj: Objective, ctx: MissionContext, base: MissionBaseline): boolean {
  switch (obj.kind) {
    case 'reach':
      return distance(ctx.playerPos, obj.target) <= obj.radius;
    case 'eliminate':
      return eliminateProgress(obj, ctx, base) >= obj.count;
    case 'collect':
      return ctx.collected - base.collected >= obj.count;
    case 'survive':
      return ctx.elapsed - base.elapsed >= obj.seconds;
    case 'wanted':
      return ctx.wantedStars >= obj.stars;
    case 'service':
      return serviceProgress(obj, ctx, base) >= obj.count;
  }
}

/**
 * Advance the mission against the current context. Completes the active
 * objective when met and moves to the next; marks the mission completed after
 * the last. Pure: returns a new mission. `baseline` holds the counters captured
 * when the current objective began (for relative progress).
 */
export function updateMission(m: Mission, ctx: MissionContext, baseline: MissionBaseline): Mission {
  const obj = currentObjective(m);
  if (!obj) return m;
  if (!isObjectiveMet(obj, ctx, baseline)) return m;

  const nextIndex = m.currentIndex + 1;
  if (nextIndex >= m.objectives.length) {
    return { ...m, currentIndex: m.objectives.length, status: 'completed' };
  }
  return { ...m, currentIndex: nextIndex };
}

export function isComplete(m: Mission): boolean {
  return m.status === 'completed';
}

/** A completed/total tally for showing objective progress on the HUD. */
export interface ObjectiveProgress {
  current: number;
  goal: number;
}

/**
 * Numeric progress toward an objective, for HUD feedback (e.g. "3/8"). A
 * 'reach' objective has no count (it is shown by a map marker instead), so it
 * reports null. Pure.
 */
export function objectiveProgress(
  obj: Objective,
  ctx: MissionContext,
  base: MissionBaseline,
): ObjectiveProgress | null {
  switch (obj.kind) {
    case 'reach':
      return null;
    case 'eliminate':
      return { current: clamp(eliminateProgress(obj, ctx, base), 0, obj.count), goal: obj.count };
    case 'collect':
      return { current: clamp(ctx.collected - base.collected, 0, obj.count), goal: obj.count };
    case 'survive':
      return {
        current: clamp(Math.floor(ctx.elapsed - base.elapsed), 0, obj.seconds),
        goal: obj.seconds,
      };
    case 'wanted':
      return { current: clamp(ctx.wantedStars, 0, obj.stars), goal: obj.stars };
    case 'service':
      return { current: clamp(serviceProgress(obj, ctx, base), 0, obj.count), goal: obj.count };
  }
}

/** A fresh copy of a mission reset to its first objective. Pure. */
export function resetMission(m: Mission): Mission {
  return {
    ...m,
    currentIndex: 0,
    status: m.objectives.length === 0 ? 'completed' : 'active',
  };
}
