import { distance, vec2, type Vec2 } from '../../core/vector';
import type {
  EscortRadiusFailRule,
  LoseActorFailRule,
  PedestrianRouteActorScript,
  StoryFailRule,
  StoryStageTransition,
  VehicleRouteActorScript,
} from './storyMode';

export interface RouteActorStep {
  pos: Vec2;
  heading: number;
  speed: number;
  routeIndex: number;
}

export interface StoryProgressState {
  tailSeconds: number;
  captureSeconds: number;
  tailLostSeconds: number;
  failCounters: Record<string, number>;
}

export interface StoryScriptTickContext {
  playerPos: Vec2;
  playerSpeed: number;
  dt: number;
  actorPositions: Record<string, Vec2 | null>;
}

export interface StoryScriptTickResult {
  progress: StoryProgressState;
  failureText: string | null;
}

export function isStageTransitionMet(
  transition: StoryStageTransition | undefined,
  progress: StoryProgressState,
  routeIndices: Record<string, number>,
): boolean {
  if (!transition) return false;
  switch (transition.kind) {
    case 'routeComplete':
      return routeIndices[transition.actorId] === Number.MAX_SAFE_INTEGER;
    case 'tailSeconds':
      return progress.tailSeconds >= transition.seconds;
    case 'captureSeconds':
      return progress.captureSeconds >= transition.seconds;
  }
}

export function normalizeRouteCompletion(routeIndex: number, routeLength: number): number {
  return routeIndex >= routeLength - 1 ? Number.MAX_SAFE_INTEGER : routeIndex;
}

function moveAlongRoute(
  pos: Vec2,
  route: readonly Vec2[],
  routeIndex: number,
  speed: number,
  dt: number,
): RouteActorStep {
  const first = route[0] ?? pos;
  const safeIndex = Math.max(0, Math.min(route.length - 1, routeIndex));
  const target = route[safeIndex] ?? first;
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  const heading = dist > 0 ? Math.atan2(dy, dx) : 0;
  const step = Math.min(dist, dt * speed);
  const nextPos = dist > 0 ? vec2(pos.x + (dx / dist) * step, pos.y + (dy / dist) * step) : pos;
  return {
    pos: nextPos,
    heading,
    speed: step > 0 ? speed : 0,
    routeIndex: step >= dist && safeIndex < route.length - 1 ? safeIndex + 1 : safeIndex,
  };
}

export function advanceVehicleRouteActor(
  actor: VehicleRouteActorScript,
  pos: Vec2,
  routeIndex: number,
  dt: number,
): RouteActorStep {
  return moveAlongRoute(pos, actor.route, routeIndex, actor.speed, dt);
}

export function advancePedestrianRouteActor(
  actor: PedestrianRouteActorScript,
  pos: Vec2,
  routeIndex: number,
  dt: number,
): RouteActorStep {
  return moveAlongRoute(pos, actor.route, routeIndex, actor.speed, dt);
}

function applyLoseActorRule(
  rule: LoseActorFailRule,
  progress: StoryProgressState,
  ctx: StoryScriptTickContext,
): StoryScriptTickResult {
  const actorPos = ctx.actorPositions[rule.actorId] ?? null;
  const nextCounter = actorPos ? 0 : (progress.failCounters[rule.actorId] ?? 0) + ctx.dt;
  const failCounters = { ...progress.failCounters, [rule.actorId]: nextCounter };
  return {
    progress: { ...progress, failCounters },
    failureText: nextCounter >= rule.maxSeconds ? rule.failureText : null,
  };
}

function applyEscortRadiusRule(
  rule: EscortRadiusFailRule,
  progress: StoryProgressState,
  ctx: StoryScriptTickContext,
): StoryScriptTickResult {
  const actorPos = ctx.actorPositions[rule.actorId] ?? null;
  const outOfRange = !actorPos || distance(ctx.playerPos, actorPos) > rule.radius;
  const nextCounter = outOfRange ? (progress.failCounters[rule.actorId] ?? 0) + ctx.dt : 0;
  const failCounters = { ...progress.failCounters, [rule.actorId]: nextCounter };
  return {
    progress: { ...progress, failCounters },
    failureText: nextCounter >= rule.maxSeconds ? rule.failureText : null,
  };
}

export function applyStoryFailRules(
  rules: readonly StoryFailRule[] | undefined,
  progress: StoryProgressState,
  ctx: StoryScriptTickContext,
): StoryScriptTickResult {
  if (!rules || rules.length === 0) return { progress, failureText: null };

  let next = progress;
  for (const rule of rules) {
    const result =
      rule.kind === 'loseActor'
        ? applyLoseActorRule(rule, next, ctx)
        : applyEscortRadiusRule(rule, next, ctx);
    next = result.progress;
    if (result.failureText) return result;
  }
  return { progress: next, failureText: null };
}

export function updateTailCaptureProgress(
  actor: VehicleRouteActorScript,
  progress: StoryProgressState,
  ctx: StoryScriptTickContext,
  actorPos: Vec2,
  routeIndex: number,
): StoryProgressState {
  const playerDist = distance(ctx.playerPos, actorPos);
  let tailSeconds = progress.tailSeconds;
  let tailLostSeconds = progress.tailLostSeconds;
  let captureSeconds = progress.captureSeconds;

  if (playerDist <= actor.followRadius) {
    tailSeconds += ctx.dt;
    tailLostSeconds = 0;
  } else {
    tailLostSeconds += ctx.dt;
  }

  const tailDrain = actor.tailDrainPerSecond ?? 2;
  const loseGrace = actor.loseGraceSeconds ?? 2.5;
  if (tailLostSeconds > loseGrace) tailSeconds = Math.max(0, tailSeconds - ctx.dt * tailDrain);

  const captureReady =
    actor.captureRadius !== undefined &&
    actor.captureMaxSpeed !== undefined &&
    routeIndex >= actor.route.length - 1;
  if (captureReady && playerDist <= (actor.captureRadius ?? 0) && Math.abs(ctx.playerSpeed) <= (actor.captureMaxSpeed ?? 0)) {
    captureSeconds += ctx.dt;
  } else {
    captureSeconds = 0;
  }

  return { ...progress, tailSeconds, tailLostSeconds, captureSeconds };
}