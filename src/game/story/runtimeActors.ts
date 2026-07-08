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

export interface StoryStageTransitionContext {
  progress: StoryProgressState;
  routeIndices: Record<string, number>;
  storyObjectiveIndex?: number | null;
  routeProgress?: number;
}

export function isStageTransitionMet(
  transition: StoryStageTransition | undefined,
  context: StoryStageTransitionContext,
): boolean {
  if (!transition) return false;
  switch (transition.kind) {
    case 'routeComplete':
      return context.routeIndices[transition.actorId] === Number.MAX_SAFE_INTEGER;
    case 'tailSeconds':
      return context.progress.tailSeconds >= transition.seconds;
    case 'captureSeconds':
      return context.progress.captureSeconds >= transition.seconds;
    case 'storyObjective':
      return (context.storyObjectiveIndex ?? -1) >= transition.objectiveIndex;
    case 'routeProgress':
      return (context.routeProgress ?? 0) >= transition.count;
  }
}

export function normalizeRouteCompletion(routeIndex: number, routeLength: number): number {
  return routeIndex >= routeLength - 1 ? Number.MAX_SAFE_INTEGER : routeIndex;
}

export interface StorySquadMemberPlacement {
  reset: boolean;
  pos: Vec2;
}

/**
 * Decide where a scripted mission-target squad member sits this frame. Members
 * fan out along X around `center`, and park off-map at a fixed despawn row while
 * their objective is inactive. Because parking keeps the per-member fan-out
 * offset, a parked member's X never equals the despawn anchor's X — only its Y
 * stays pinned to the off-map row. Detecting "parked" by that (never-offset) Y,
 * rather than by an exact position match, is what lets a member snap back onto
 * the map when its eliminate objective goes live. The previous exact-match check
 * stranded every offset member off-screen, so eliminate targets never appeared
 * (the towline-oath bug). A `null` current position (never spawned) also counts
 * as parked so the first activation anchors it correctly.
 */
export function placeStorySquadMember(
  current: Vec2 | null,
  center: Vec2,
  memberIndex: number,
  count: number,
  spread: number,
  despawn: Vec2,
  forceReset = false,
): StorySquadMemberPlacement {
  const offsetX = count <= 1 ? 0 : (memberIndex - (count - 1) / 2) * spread;
  const parked = current === null || current.y === despawn.y;
  const reset = forceReset || parked;
  return { reset, pos: reset ? vec2(center.x + offsetX, center.y) : current };
}


/** How close a vehicle route actor must get to a waypoint to count as arrived,
 * when moving along its (turn-rate-limited) heading rather than a raw beeline
 * to the target — see `moveAlongRoute`'s `moveAlongHeading` option. */
const ROUTE_ARRIVE_RADIUS = 16;

function moveAlongRoute(
  pos: Vec2,
  route: readonly Vec2[],
  routeIndex: number,
  speed: number,
  dt: number,
  prevHeading = 0,
  options: { moveAlongHeading?: boolean; keepDrivingAtRouteEnd?: boolean } = {},
): RouteActorStep {
  if (route.length <= 1) {
    return { pos, heading: prevHeading, speed: 0, routeIndex: 0 };
  }
  const lastIndex = route.length - 1;

  if (options.keepDrivingAtRouteEnd && routeIndex >= lastIndex) {
    // The authored route is fully driven — `routeIndex` is reported back
    // exactly as `lastIndex`, unchanged, so a `routeComplete` stage
    // transition watching for it still sees it correctly (this must NEVER
    // stop reporting "done" once it has, or a transition that hasn't fired
    // yet on this exact tick would never fire at all). But whatever gates the
    // mission along from here (a stage transition, a tail/capture timer)
    // might not have finished yet, and a scripted vehicle should still look
    // and act like it's actually driving instead of instantly freezing dead
    // in the street, so it keeps driving straight ahead in its last heading.
    const nextPos = vec2(
      pos.x + Math.cos(prevHeading) * dt * speed,
      pos.y + Math.sin(prevHeading) * dt * speed,
    );
    return { pos: nextPos, heading: prevHeading, speed, routeIndex: lastIndex };
  }

  const safeIndex = Math.max(0, Math.min(lastIndex - 1, routeIndex));
  const target = route[safeIndex + 1] ?? route[safeIndex] ?? pos;
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  const desiredHeading = dist > 0 ? Math.atan2(dy, dx) : prevHeading;
  const turnDelta = wrapAngle(desiredHeading - prevHeading);
  const maxTurn = Math.PI * 1.35 * dt;
  const heading = prevHeading + clamp(turnDelta, -maxTurn, maxTurn);
  const step = Math.min(dist, dt * speed);
  // Moving straight at the target regardless of the turn-limited heading made
  // a sharp waypoint turn look like the car sliding sideways (crab-walking)
  // while its sprite slowly caught up to face the way it was actually going.
  // Moving along the same turn-limited heading instead makes it arc into the
  // turn like a real car, so its facing always matches its actual travel.
  const moveHeading = options.moveAlongHeading ? heading : desiredHeading;
  const nextPos =
    dist > 0 ? vec2(pos.x + Math.cos(moveHeading) * step, pos.y + Math.sin(moveHeading) * step) : pos;
  const reachedTarget = options.moveAlongHeading
    ? distance(nextPos, target) <= ROUTE_ARRIVE_RADIUS || step >= dist - 1e-6
    : step >= dist - 1e-6;
  const nextRouteIndex = reachedTarget ? Math.min(lastIndex, safeIndex + 1) : safeIndex;

  return {
    pos: nextPos,
    heading,
    speed: reachedTarget && !options.moveAlongHeading ? 0 : speed,
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
  return moveAlongRoute(pos, actor.route, routeIndex, actor.speed, dt, prevHeading, {
    moveAlongHeading: true,
    keepDrivingAtRouteEnd: true,
  });
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

  if (targetDisabled && actor.captureOnDisable !== false) {
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
