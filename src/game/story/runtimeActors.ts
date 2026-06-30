import { distance, vec2, type Vec2 } from '../../core/vector';
import type {
  ActorVehicleConditionFailRule,
  EscortRadiusFailRule,
  LoseActorFailRule,
  PedestrianRouteActorScript,
  StoryFailRule,
  StoryStageTransition,
  VehicleRouteActorScript,
  WantedPressureFailRule,
} from './storyMode';

export interface RouteActorStep {
  pos: Vec2;
  heading: number;
  speed: number;
  routeIndex: number;
}

function wrapAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  wantedStars: number;
  dt: number;
  actorPositions: Record<string, Vec2 | null>;
  actorVehicleHealth: Record<string, number | null>;
  actorVehicleDisabled: Record<string, boolean>;
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
  prevHeading = 0,
): RouteActorStep {
  if (route.length <= 1) {
    return { pos, heading: prevHeading, speed: 0, routeIndex: 0 };
  }

  const safeIndex = Math.max(0, Math.min(route.length - 2, routeIndex));
  const current = route[safeIndex] ?? pos;
  const target = route[safeIndex + 1] ?? current;
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  const desiredHeading = dist > 0 ? Math.atan2(dy, dx) : prevHeading;
  const turnDelta = wrapAngle(desiredHeading - prevHeading);
  const maxTurn = Math.PI * 1.35 * dt;
  const heading = prevHeading + clamp(turnDelta, -maxTurn, maxTurn);
  const step = Math.min(dist, dt * speed);
  const nextPos = dist > 0 ? vec2(pos.x + (dx / dist) * step, pos.y + (dy / dist) * step) : pos;
  const reachedTarget = step >= dist - 1e-6;
  const nextRouteIndex = reachedTarget ? Math.min(route.length - 1, safeIndex + 1) : safeIndex;

  return {
    pos: nextPos,
    heading,
    speed: reachedTarget ? 0 : speed,
    routeIndex: nextRouteIndex,
  };
}

export function advanceVehicleRouteActor(
  actor: VehicleRouteActorScript,
  pos: Vec2,
  routeIndex: number,
  dt: number,
  prevHeading = 0,
): RouteActorStep {
  return moveAlongRoute(pos, actor.route, routeIndex, actor.speed, dt, prevHeading);
}

export function advancePedestrianRouteActor(
  actor: PedestrianRouteActorScript,
  pos: Vec2,
  routeIndex: number,
  dt: number,
  prevHeading = 0,
): RouteActorStep {
  return moveAlongRoute(pos, actor.route, routeIndex, actor.speed, dt, prevHeading);
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

function applyWantedPressureRule(
  rule: WantedPressureFailRule,
  progress: StoryProgressState,
  ctx: StoryScriptTickContext,
): StoryScriptTickResult {
  const key = `wanted-pressure:${rule.minStars}:${rule.failureText}`;
  const nextCounter =
    ctx.wantedStars >= rule.minStars ? (progress.failCounters[key] ?? 0) + ctx.dt : 0;
  const failCounters = { ...progress.failCounters, [key]: nextCounter };
  return {
    progress: { ...progress, failCounters },
    failureText: nextCounter >= rule.maxSeconds ? rule.failureText : null,
  };
}

function applyActorVehicleConditionRule(
  rule: ActorVehicleConditionFailRule,
  progress: StoryProgressState,
  ctx: StoryScriptTickContext,
): StoryScriptTickResult {
  const key = `actor-vehicle-condition:${rule.actorId}`;
  const health = ctx.actorVehicleHealth[rule.actorId] ?? null;
  const disabled = ctx.actorVehicleDisabled[rule.actorId] ?? false;
  const compromised = health === null || disabled || health < rule.minHealth;
  const nextCounter = compromised ? (progress.failCounters[key] ?? 0) + ctx.dt : 0;
  const failCounters = { ...progress.failCounters, [key]: nextCounter };
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
        : rule.kind === 'escortRadius'
          ? applyEscortRadiusRule(rule, next, ctx)
          : rule.kind === 'wantedPressure'
            ? applyWantedPressureRule(rule, next, ctx)
            : applyActorVehicleConditionRule(rule, next, ctx);
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
  targetDisabled = false,
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

  if (targetDisabled) {
    captureSeconds = Number.MAX_SAFE_INTEGER;
  } else if (
    actor.captureRadius !== undefined &&
    actor.captureMaxSpeed !== undefined &&
    playerDist <= actor.captureRadius &&
    Math.abs(ctx.playerSpeed) <= actor.captureMaxSpeed
  ) {
    captureSeconds += ctx.dt;
  } else {
    captureSeconds = 0;
  }

  return { ...progress, tailSeconds, tailLostSeconds, captureSeconds };
}
