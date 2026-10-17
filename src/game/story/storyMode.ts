import {
  createMission,
  type Mission,
  type MissionSpec,
  type Objective,
  type ServiceObjectiveKind,
} from '../../core/mission';
import type { VehicleKind } from '../../core/world';
import type { Vec2 } from '../../core/vector';
import type { Pedestrian } from '../../core/pedestrianAI';

export type StorySystem =
  | 'scriptedEncounter'
  | 'escort'
  | 'tail'
  | 'deliver'
  | 'vehicleCondition'
  | 'timedMultiStop'
  | 'defend'
  | 'sabotage'
  | 'capture'
  | 'stealth'
  | 'branching'
  | 'districtState';

export interface RuntimeCampaignTemplate {
  id: string;
  title: string;
  summary: string;
  missions: readonly MissionSpec[];
}

/**
 * Citywide reactivity (Stage 13). A branch outcome no longer only swaps mission text/runtime;
 * it can also push signed consequences onto three accumulating axes so later missions and the
 * launcher can read how the city has shifted overall, not just which single branch key was set.
 * - `district`: how a physical district now behaves toward Rook.
 * - `faction`: how a power bloc (union, informants, pirate radio, police) stands.
 * - `service`: how an emergency/service network (ambulance, tow, police response) is strained.
 */
export type StoryCityAxis = 'district' | 'faction' | 'service';

export interface StoryCityEffect {
  axis: StoryCityAxis;
  /** Stable id within its axis, e.g. `informants`, `nightlife`, `ambulance`. */
  id: string;
  /** Human display label, e.g. `Informant Network`. */
  label: string;
  /** Signed intensity: positive = allied/relieved, negative = hostile/strained. */
  delta: number;
  /** Optional short human phrase surfaced in the archive and mission summaries. */
  note?: string;
}

export interface StoryCityStanding {
  axis: StoryCityAxis;
  id: string;
  label: string;
  total: number;
  notes: string[];
}

export interface StoryCityState {
  standings: StoryCityStanding[];
}

/** A threshold test a mission variant can run against the accumulated city state instead of, or
 * in addition to, a single branch key. */
export interface StoryCityStateCondition {
  axis: StoryCityAxis;
  id: string;
  atLeast?: number;
  atMost?: number;
}

export interface StoryMissionVariantOverride {
  title?: string;
  hook?: string;
  primaryGoal?: string;
  secondaryPressure?: string;
  failureState?: string;
  payoff?: string;
  presentation?: StoryMissionPresentation;
  requiredSystems?: readonly StorySystem[];
  prototypeRuntime?: MissionSpec;
  prototypeScript?: StoryRuntimeScript;
}

export interface StoryMissionVariant extends StoryMissionVariantOverride {
  branchId?: string;
  outcomeId?: string;
  /** City-state thresholds this variant requires. When present, the variant only resolves if the
   * accumulated city state satisfies every condition. A variant must declare a branch key, at
   * least one city-state condition, or both. */
  cityState?: readonly StoryCityStateCondition[];
}

export interface StoryMissionBranchOutcome {
  branchId: string;
  outcomeId: string;
  /** Citywide consequences this outcome applies when recorded (Stage 13). */
  effects?: readonly StoryCityEffect[];
}

export interface StoryBeatPresentation {
  speaker: string;
  role?: string;
  kicker?: string;
}

export interface StoryMissionPresentation {
  briefing?: StoryBeatPresentation;
  summary?: StoryBeatPresentation;
}

export interface StoryChapterPresentation {
  opener?: StoryBeatPresentation;
  briefing?: StoryBeatPresentation;
  summary?: StoryBeatPresentation;
}

export interface StoryMissionPlan {
  id: string;
  title: string;
  hook: string;
  primaryGoal: string;
  secondaryPressure: string;
  failureState: string;
  payoff: string;
  /** Optional in-world marker used to start the mission before the authored objectives begin. */
  startMarker?: Vec2;
  presentation?: StoryMissionPresentation;
  branchOutcome?: StoryMissionBranchOutcome;
  requiredSystems?: readonly StorySystem[];
  prototypeRuntime?: MissionSpec;
  prototypeScript?: StoryRuntimeScript;
  variants?: readonly StoryMissionVariant[];
}

export interface VehicleRouteActorScript {
  kind: 'vehicleRoute';
  actorId: string;
  vehicleKind: VehicleKind;
  route: readonly Vec2[];
  speed: number;
  followRadius: number;
  captureRadius?: number;
  captureMaxSpeed?: number;
  tailDrainPerSecond?: number;
  loseGraceSeconds?: number;
  captureOnDisable?: boolean;
}

export interface PedestrianRouteActorScript {
  kind: 'pedestrianRoute';
  actorId: string;
  route: readonly Vec2[];
  speed: number;
  uniform?: Pedestrian['uniform'];
  escortRadius?: number;
}

export interface PedestrianSquadActorScript {
  kind: 'pedestrianSquad';
  actorId: string;
  center: Vec2;
  count: number;
  spread: number;
  uniform?: Pedestrian['uniform'];
  missionTargets?: boolean;
}

export type StoryActorScript =
  | VehicleRouteActorScript
  | PedestrianRouteActorScript
  | PedestrianSquadActorScript;

export interface VehicleRouteActorOptions {
  followRadius?: number;
  captureRadius?: number;
  captureMaxSpeed?: number;
  tailDrainPerSecond?: number;
  loseGraceSeconds?: number;
  captureOnDisable?: boolean;
}

/** A road lane reserved by a scripted district state: NPC traffic near any of
 * `points` (within `radius`) yields almost to a stop, keeping the lane clear
 * for an escort or getaway route. */
export interface StoryReservedRouteScript {
  points: readonly Vec2[];
  radius: number;
}

export interface StoryDistrictStateScript {
  label: string;
  summary?: string;
  serviceLaneBlocks?: readonly ServiceObjectiveKind[];
  trafficSpeedMultiplier?: number;
  suppressNpcDriving?: boolean;
  wantedPressureBonus?: number;
  /** Every intersection behaves as an all-way stop instead of following the
   * normal traffic-light cycle, for citywide blackout beats. */
  blackoutIntersections?: boolean;
  /** Lanes NPC traffic should stay clear of for the duration of this state. */
  reservedRoutes?: readonly StoryReservedRouteScript[];
}

export interface LoseActorFailRule {
  kind: 'loseActor';
  actorId: string;
  maxSeconds: number;
  failureText: string;
}

export interface EscortRadiusFailRule {
  kind: 'escortRadius';
  actorId: string;
  radius: number;
  maxSeconds: number;
  failureText: string;
}

export interface WantedPressureFailRule {
  kind: 'wantedPressure';
  minStars: number;
  maxSeconds: number;
  failureText: string;
}

export interface ActorVehicleConditionFailRule {
  kind: 'actorVehicleCondition';
  actorId: string;
  minHealth: number;
  maxSeconds: number;
  failureText: string;
}

export type StoryFailRule =
  | LoseActorFailRule
  | EscortRadiusFailRule
  | WantedPressureFailRule
  | ActorVehicleConditionFailRule;

export interface RouteCompleteStageTransition {
  kind: 'routeComplete';
  actorId: string;
}

export interface TailSecondsStageTransition {
  kind: 'tailSeconds';
  seconds: number;
}

export interface CaptureSecondsStageTransition {
  kind: 'captureSeconds';
  seconds: number;
}

export interface StoryObjectiveStageTransition {
  kind: 'storyObjective';
  objectiveIndex: number;
}

export interface RouteProgressStageTransition {
  kind: 'routeProgress';
  count: number;
}

export type StoryStageTransition =
  | RouteCompleteStageTransition
  | TailSecondsStageTransition
  | CaptureSecondsStageTransition
  | StoryObjectiveStageTransition
  | RouteProgressStageTransition;

export interface StoryRuntimeStage {
  id: string;
  title: string;
  primaryActorId?: string;
  actors: readonly StoryActorScript[];
  failRules?: readonly StoryFailRule[];
  districtState?: StoryDistrictStateScript;
  nextWhen?: StoryStageTransition;
}

export interface StoryRuntimeScript {
  primaryActorId: string;
  actors: readonly StoryActorScript[];
  failRules?: readonly StoryFailRule[];
  stages?: readonly StoryRuntimeStage[];
}

/** The visible ring and activation radius used by story mission markers. */
export const STORY_MISSION_MARKER_RADIUS = 52;

function mapStoryObjectivePosition(objective: Objective, mapPosition: (position: Vec2) => Vec2): Objective {
  if (objective.kind === 'reach' || objective.kind === 'defend') {
    return { ...objective, target: mapPosition(objective.target) };
  }
  if (objective.kind === 'route' || objective.kind === 'sabotage') {
    return { ...objective, targets: objective.targets.map(mapPosition) };
  }
  return objective;
}

function mapStoryActorPosition(
  actor: StoryActorScript,
  mapPosition: (position: Vec2) => Vec2,
): StoryActorScript {
  if (actor.kind === 'vehicleRoute' || actor.kind === 'pedestrianRoute') {
    return { ...actor, route: actor.route.map(mapPosition) };
  }
  return { ...actor, center: mapPosition(actor.center) };
}

function mapStoryScriptPositions(
  script: StoryRuntimeScript,
  mapPosition: (position: Vec2) => Vec2,
): StoryRuntimeScript {
  const mapStage = (stage: StoryRuntimeStage): StoryRuntimeStage => ({
    ...stage,
    actors: stage.actors.map((actor) => mapStoryActorPosition(actor, mapPosition)),
    districtState: stage.districtState
      ? {
          ...stage.districtState,
          reservedRoutes: stage.districtState.reservedRoutes?.map((route) => ({
            ...route,
            points: route.points.map(mapPosition),
          })),
        }
      : undefined,
  });
  return {
    ...script,
    actors: script.actors.map((actor) => mapStoryActorPosition(actor, mapPosition)),
    stages: script.stages?.map(mapStage),
  };
}

/** Project authored story coordinates onto the active map's walkable road grid. */
export function mapStoryMissionPlanPositions(
  plan: StoryMissionPlan,
  mapPosition: (position: Vec2) => Vec2,
): StoryMissionPlan {
  return {
    ...plan,
    startMarker: plan.startMarker ? mapPosition(plan.startMarker) : undefined,
    prototypeRuntime: plan.prototypeRuntime
      ? {
          ...plan.prototypeRuntime,
          objectives: plan.prototypeRuntime.objectives.map((objective) =>
            mapStoryObjectivePosition(objective, mapPosition),
          ),
        }
      : undefined,
    prototypeScript: plan.prototypeScript
      ? mapStoryScriptPositions(plan.prototypeScript, mapPosition)
      : undefined,
  };
}

/**
 * Reusable authoring helpers for the escort-route pattern: a pedestrian actor walks a route
 * while an escort-radius fail rule restarts the mission if the player drifts too far away.
 * This is the most repeated mission shape in the current story data, so chapters should build
 * escort actors and fail rules through these helpers instead of re-typing the same object shape.
 */
export function escortRouteActor(
  actorId: string,
  route: readonly Vec2[],
  speed: number,
  escortRadius = 180,
): PedestrianRouteActorScript {
  return { kind: 'pedestrianRoute', actorId, route, speed, escortRadius };
}

export function vehicleRouteActor(
  actorId: string,
  vehicleKind: VehicleKind,
  route: readonly Vec2[],
  speed: number,
  options: VehicleRouteActorOptions = {},
): VehicleRouteActorScript {
  return {
    kind: 'vehicleRoute',
    actorId,
    vehicleKind,
    route,
    speed,
    followRadius: options.followRadius ?? 320,
    captureRadius: options.captureRadius,
    captureMaxSpeed: options.captureMaxSpeed,
    tailDrainPerSecond: options.tailDrainPerSecond,
    loseGraceSeconds: options.loseGraceSeconds,
    captureOnDisable: options.captureOnDisable,
  };
}

export function missionTargetSquadActor(
  actorId: string,
  center: Vec2,
  count: number,
  spread: number,
  uniform?: Pedestrian['uniform'],
): PedestrianSquadActorScript {
  return {
    kind: 'pedestrianSquad',
    actorId,
    center,
    count,
    spread,
    uniform,
    missionTargets: true,
  };
}

export function escortRadiusFailRule(
  actorId: string,
  failureText: string,
  radius = 220,
  maxSeconds = 3,
): EscortRadiusFailRule {
  return { kind: 'escortRadius', actorId, radius, maxSeconds, failureText };
}

export interface EscortMissionScriptOptions {
  actorId: string;
  route: readonly Vec2[];
  speed: number;
  failureText: string;
  escortRadius?: number;
  failRadius?: number;
  maxSeconds?: number;
}

/** Build the standard single-actor escort runtime script from an escort actor plus its matching
 * escort-radius fail rule. Use `escortRouteActor` / `escortRadiusFailRule` directly instead when a
 * mission needs to combine the escort actor with other actors in the same script. */
export function createEscortMissionScript(
  options: EscortMissionScriptOptions,
): StoryRuntimeScript {
  const { actorId, route, speed, failureText, escortRadius, failRadius, maxSeconds } = options;
  return {
    primaryActorId: actorId,
    actors: [escortRouteActor(actorId, route, speed, escortRadius)],
    failRules: [escortRadiusFailRule(actorId, failureText, failRadius, maxSeconds)],
  };
}

/**
 * Reusable authoring helper for the wanted-pressure pattern: fail the mission once the player's
 * checkpoint/wanted pressure holds at or above `minStars` for longer than `maxSeconds`. Extends
 * the escort-route helper treatment to the tail/wanted-pressure pattern used across chase and
 * stealth-adjacent missions.
 */
export function wantedPressureFailRule(
  minStars: number,
  failureText: string,
  maxSeconds = 2,
): WantedPressureFailRule {
  return { kind: 'wantedPressure', minStars, maxSeconds, failureText };
}

export interface WantedPressureStageOptions {
  id: string;
  title: string;
  label: string;
  summary: string;
  minStars: number;
  failureText: string;
  maxSeconds?: number;
  serviceLaneBlocks?: readonly ServiceObjectiveKind[];
  trafficSpeedMultiplier?: number;
  suppressNpcDriving?: boolean;
  wantedPressureBonus?: number;
  blackoutIntersections?: boolean;
  reservedRoutes?: readonly StoryReservedRouteScript[];
}

export function createWantedPressureStage(
  options: WantedPressureStageOptions,
): StoryRuntimeStage {
  const {
    id,
    title,
    label,
    summary,
    minStars,
    failureText,
    maxSeconds,
    serviceLaneBlocks,
    trafficSpeedMultiplier,
    suppressNpcDriving,
    wantedPressureBonus,
    blackoutIntersections,
    reservedRoutes,
  } = options;
  return {
    id,
    title,
    primaryActorId: id,
    actors: [],
    districtState: {
      label,
      summary,
      serviceLaneBlocks,
      trafficSpeedMultiplier,
      suppressNpcDriving,
      wantedPressureBonus,
      blackoutIntersections,
      reservedRoutes,
    },
    failRules: [wantedPressureFailRule(minStars, failureText, maxSeconds)],
  };
}

export interface WantedPressureMissionScriptOptions extends WantedPressureStageOptions {
  primaryActorId?: string;
}

export function createWantedPressureMissionScript(
  options: WantedPressureMissionScriptOptions,
): StoryRuntimeScript {
  const stage = createWantedPressureStage(options);
  return {
    primaryActorId: options.primaryActorId ?? stage.primaryActorId ?? stage.id,
    actors: [],
    stages: [stage],
  };
}

/**
 * Reusable authoring helper for the protected-vehicle / fragile-cargo pattern: fail the mission
 * once an actor's vehicle health drops below `minHealth` for longer than `maxSeconds`. Extends the
 * escort-route helper treatment to the vehicle-condition pattern used by fragile-cargo missions.
 */
export function actorVehicleConditionFailRule(
  actorId: string,
  minHealth: number,
  failureText: string,
  maxSeconds = 3,
): ActorVehicleConditionFailRule {
  return { kind: 'actorVehicleCondition', actorId, minHealth, maxSeconds, failureText };
}

export interface ProtectedVehicleTailScriptOptions {
  actorId: string;
  vehicleKind: VehicleKind;
  route: readonly Vec2[];
  speed: number;
  followRadius: number;
  minHealth: number;
  failureText: string;
  maxSeconds?: number;
}

/** Build the standard single-actor "fragile cargo" runtime script: a vehicle actor drives a route
 * while a vehicle-condition fail rule ends the mission if the escorted vehicle takes too much
 * damage for too long. Pairs the vehicle-route actor shape with `actorVehicleConditionFailRule`. */
export function createProtectedVehicleTailScript(
  options: ProtectedVehicleTailScriptOptions,
): StoryRuntimeScript {
  const { actorId, vehicleKind, route, speed, followRadius, minHealth, failureText, maxSeconds } =
    options;
  return {
    primaryActorId: actorId,
    actors: [{ kind: 'vehicleRoute', actorId, vehicleKind, route, speed, followRadius }],
    failRules: [actorVehicleConditionFailRule(actorId, minHealth, failureText, maxSeconds)],
  };
}

export interface StoryChapter {
  id: string;
  actId: string;
  order: number;
  title: string;
  storyRole: string;
  combinedGoal: string;
  presentation?: StoryChapterPresentation;
  missions: readonly StoryMissionPlan[];
  missionGroups?: readonly (readonly string[])[];
}

export interface StoryAct {
  id: string;
  order: number;
  title: string;
  summary: string;
  chapters: readonly StoryChapter[];
}

/**
 * Schema version for the authored story-data contracts (StoryMode / StoryChapter /
 * StoryMissionPlan / mission variants / actor-script types). Bump this when one of those
 * shapes changes in a way that would make older authored data or saved branch/mission ids
 * ambiguous, and update `validateStoryMode` and any migration logic that depends on it.
 */
export const STORY_MODE_SCHEMA_VERSION = 1;

export interface StoryMode {
  schemaVersion: number;
  id: string;
  title: string;
  premise: string;
  acts: readonly StoryAct[];
}

export interface StoryValidationIssue {
  path: string;
  message: string;
}

export const STORY_MISSION_GROUP_SELECTION_INDEX = -2;

function rawStoryChapterMissionGroups(chapter: StoryChapter): readonly (readonly string[])[] {
  return chapter.missionGroups && chapter.missionGroups.length > 0
    ? chapter.missionGroups
    : chapter.missions.map((mission) => [mission.id]);
}

export function storyChapterMissionGroups(chapter: StoryChapter): StoryMissionPlan[][] {
  const missionById = new Map(chapter.missions.map((mission) => [mission.id, mission]));
  return rawStoryChapterMissionGroups(chapter)
    .map((group) =>
      group
        .map((missionId) => missionById.get(missionId))
        .filter((mission): mission is StoryMissionPlan => !!mission),
    )
    .filter((group) => group.length > 0);
}

export function storyChapterPendingMissionGroup(
  chapter: StoryChapter,
  completedMissionIds: readonly string[],
): StoryMissionPlan[] | null {
  const completed = new Set(completedMissionIds);
  for (const group of storyChapterMissionGroups(chapter)) {
    const pending = group.filter((mission) => !completed.has(mission.id));
    if (pending.length > 0) return pending;
  }
  return null;
}

const STORY_CITY_AXIS_ORDER: Record<StoryCityAxis, number> = {
  district: 0,
  faction: 1,
  service: 2,
};

function storyCityEffectsByOutcome(story: StoryMode): Map<string, readonly StoryCityEffect[]> {
  const effects = new Map<string, readonly StoryCityEffect[]>();
  for (const act of story.acts) {
    for (const chapter of act.chapters) {
      for (const mission of chapter.missions) {
        const outcome = mission.branchOutcome;
        if (outcome?.effects && outcome.effects.length > 0) {
          effects.set(`${outcome.branchId}::${outcome.outcomeId}`, outcome.effects);
        }
      }
    }
  }
  return effects;
}

/** Accumulate the citywide consequences of every recorded branch outcome into a single, ordered
 * city-state summary. Later missions and the launcher read this instead of probing one branch key. */
export function summarizeStoryCityState(
  story: StoryMode,
  branchOutcomes: Record<string, string> = {},
): StoryCityState {
  const effectsByOutcome = storyCityEffectsByOutcome(story);
  const standings = new Map<string, StoryCityStanding>();
  for (const [branchId, outcomeId] of Object.entries(branchOutcomes)) {
    const effects = effectsByOutcome.get(`${branchId}::${outcomeId}`);
    if (!effects) continue;
    for (const effect of effects) {
      const key = `${effect.axis}::${effect.id}`;
      const existing = standings.get(key);
      if (existing) {
        existing.total += effect.delta;
        if (effect.note) existing.notes.push(effect.note);
      } else {
        standings.set(key, {
          axis: effect.axis,
          id: effect.id,
          label: effect.label,
          total: effect.delta,
          notes: effect.note ? [effect.note] : [],
        });
      }
    }
  }
  return {
    standings: [...standings.values()].sort(
      (a, b) =>
        STORY_CITY_AXIS_ORDER[a.axis] - STORY_CITY_AXIS_ORDER[b.axis] ||
        a.label.localeCompare(b.label),
    ),
  };
}

export function storyCityStandingTotal(
  state: StoryCityState,
  axis: StoryCityAxis,
  id: string,
): number {
  return (
    state.standings.find((standing) => standing.axis === axis && standing.id === id)?.total ?? 0
  );
}

export function storyCityStateConditionMet(
  state: StoryCityState,
  condition: StoryCityStateCondition,
): boolean {
  const total = storyCityStandingTotal(state, condition.axis, condition.id);
  if (condition.atLeast !== undefined && total < condition.atLeast) return false;
  if (condition.atMost !== undefined && total > condition.atMost) return false;
  return true;
}

function storyVariantMatches(
  variant: StoryMissionVariant,
  branchOutcomes: Record<string, string>,
  cityState: StoryCityState | undefined,
): boolean {
  if (variant.branchId !== undefined && variant.outcomeId !== undefined) {
    if (branchOutcomes[variant.branchId] !== variant.outcomeId) return false;
  }
  const conditions = variant.cityState ?? [];
  if (conditions.length > 0) {
    if (!cityState) return false;
    for (const condition of conditions) {
      if (!storyCityStateConditionMet(cityState, condition)) return false;
    }
  }
  return true;
}

/** One-line label for a standing, e.g. `Informant Network +2`. */
export function formatStoryCityStanding(standing: StoryCityStanding): string {
  const sign = standing.total > 0 ? `+${standing.total}` : `${standing.total}`;
  return `${standing.label} ${sign}`;
}

/** Compact accumulated-standing line for the launcher and mission summaries. */
export function formatStoryCityState(state: StoryCityState): string {
  if (state.standings.length === 0) return 'City steady — no lasting shifts yet';
  return state.standings.map(formatStoryCityStanding).join(' · ');
}

export function resolveStoryMissionPlan(
  plan: StoryMissionPlan,
  branchOutcomes: Record<string, string> = {},
  cityState?: StoryCityState,
): StoryMissionPlan {
  const variant = plan.variants?.find((candidate) =>
    storyVariantMatches(candidate, branchOutcomes, cityState),
  );
  if (!variant) return plan;
  const overrides: StoryMissionVariantOverride = {};
  if (variant.title !== undefined) overrides.title = variant.title;
  if (variant.hook !== undefined) overrides.hook = variant.hook;
  if (variant.primaryGoal !== undefined) overrides.primaryGoal = variant.primaryGoal;
  if (variant.secondaryPressure !== undefined) overrides.secondaryPressure = variant.secondaryPressure;
  if (variant.failureState !== undefined) overrides.failureState = variant.failureState;
  if (variant.payoff !== undefined) overrides.payoff = variant.payoff;
  if (variant.presentation !== undefined) overrides.presentation = variant.presentation;
  if (variant.requiredSystems !== undefined) overrides.requiredSystems = variant.requiredSystems;
  if (variant.prototypeRuntime !== undefined) overrides.prototypeRuntime = variant.prototypeRuntime;
  if (variant.prototypeScript !== undefined) overrides.prototypeScript = variant.prototypeScript;
  return {
    ...plan,
    ...overrides,
    variants: plan.variants,
  };
}

function storyActorStartPosition(actor: StoryActorScript | undefined): Vec2 | null {
  if (!actor) return null;
  if (actor.kind === 'vehicleRoute' || actor.kind === 'pedestrianRoute') {
    return actor.route[0] ?? null;
  }
  return actor.center;
}

function storyPrimaryActor(runtime: StoryRuntimeScript): StoryActorScript | undefined {
  const firstStage = runtime.stages?.[0];
  const actors = firstStage?.actors ?? runtime.actors;
  const primaryActorId = firstStage?.primaryActorId ?? runtime.primaryActorId;
  return actors.find((actor) => actor.actorId === primaryActorId) ?? actors[0];
}

function storyMissionEntryObjective(plan: StoryMissionPlan): Objective | null {
  const start = storyMissionStartPosition(plan);
  if (!start) return null;
  return {
    kind: 'reach',
    description: `Go to the mission marker to start ${plan.title}`,
    target: start,
    radius: STORY_MISSION_MARKER_RADIUS,
  };
}

export function storyMissionStartPosition(
  plan: Pick<StoryMissionPlan, 'startMarker' | 'prototypeRuntime' | 'prototypeScript'>,
): Vec2 | null {
  if (plan.startMarker) return plan.startMarker;
  const firstObjective = plan.prototypeRuntime?.objectives[0];
  if (firstObjective?.kind === 'reach') return firstObjective.target;
  if (firstObjective?.kind === 'defend') return firstObjective.target;
  if (firstObjective?.kind === 'route' || firstObjective?.kind === 'sabotage')
    return firstObjective.targets[0] ?? null;
  return plan.prototypeScript
    ? storyActorStartPosition(storyPrimaryActor(plan.prototypeScript))
    : null;
}

export function storyMissionInitialObjectiveIndex(
  plan: Pick<StoryMissionPlan, 'prototypeRuntime' | 'prototypeScript'>,
): number {
  return storyMissionStartPosition(plan) ? -1 : 0;
}

export function storyMissionGroupObjectiveIndex(
  plan: Pick<StoryMissionPlan, 'prototypeRuntime' | 'prototypeScript'>,
  pendingInGroup: number,
): number {
  return pendingInGroup > 1
    ? STORY_MISSION_GROUP_SELECTION_INDEX
    : storyMissionInitialObjectiveIndex(plan);
}

export function runtimeObjectiveIndexFromStory(
  plan: Pick<StoryMissionPlan, 'prototypeRuntime' | 'prototypeScript'>,
  storyObjectiveIndex: number,
): number {
  const authoredObjectiveCount = plan.prototypeRuntime?.objectives.length ?? 0;
  if (authoredObjectiveCount <= 0) return 0;
  const hasEntryMarker = storyMissionInitialObjectiveIndex(plan) < 0;
  const minStoryIndex = hasEntryMarker ? -1 : 0;
  const normalized = Math.floor(storyObjectiveIndex);
  const clamped = Math.max(
    minStoryIndex,
    Math.min(authoredObjectiveCount - 1, Number.isFinite(normalized) ? normalized : 0),
  );
  return hasEntryMarker ? clamped + 1 : clamped;
}

export function storyObjectiveIndexFromRuntime(
  plan: Pick<StoryMissionPlan, 'prototypeRuntime' | 'prototypeScript'>,
  runtimeObjectiveIndex: number,
): number {
  const authoredObjectiveCount = plan.prototypeRuntime?.objectives.length ?? 0;
  if (authoredObjectiveCount <= 0) return 0;
  const hasEntryMarker = storyMissionInitialObjectiveIndex(plan) < 0;
  const normalized = Math.floor(runtimeObjectiveIndex);
  const clamped = Math.max(
    0,
    Math.min(
      authoredObjectiveCount - 1 + (hasEntryMarker ? 1 : 0),
      Number.isFinite(normalized) ? normalized : 0,
    ),
  );
  return hasEntryMarker ? clamped - 1 : clamped;
}

export function compileStoryMissionRuntime(plan: StoryMissionPlan): Mission | null {
  if (!plan.prototypeRuntime) return null;
  const entryObjective = storyMissionEntryObjective(plan);
  return createMission({
    ...plan.prototypeRuntime,
    objectives: entryObjective
      ? [entryObjective, ...plan.prototypeRuntime.objectives]
      : plan.prototypeRuntime.objectives,
  });
}

export function compileCampaignTemplate(template: RuntimeCampaignTemplate): Mission[] {
  return template.missions.map(createMission);
}

export function compileStoryChapterRuntimeCampaign(
  chapter: StoryChapter,
  startMissionId = chapter.missions[0]?.id,
  startObjectiveIndex?: number,
  branchOutcomes: Record<string, string> = {},
  cityState?: StoryCityState,
  mapPosition?: (position: Vec2) => Vec2,
): Mission[] | null {
  const startIndex = chapter.missions.findIndex((mission) => mission.id === startMissionId);
  if (startIndex === -1) return null;
  const plans = chapter.missions
    .slice(startIndex)
    .map((mission) => resolveStoryMissionPlan(mission, branchOutcomes, cityState))
    .map((mission) => (mapPosition ? mapStoryMissionPlanPositions(mission, mapPosition) : mission));
  if (plans.some((mission) => !mission.prototypeRuntime)) return null;

  return plans.map((plan, index) => {
    const mission = compileStoryMissionRuntime(plan);
    if (!mission) return createMission(plan.prototypeRuntime!);
    if (index > 0) return mission;
    const resumeObjectiveIndex = startObjectiveIndex ?? storyMissionInitialObjectiveIndex(plan);
    return {
      ...mission,
      currentIndex: Math.max(
        0,
        Math.min(
          mission.objectives.length - 1,
          runtimeObjectiveIndexFromStory(plan, resumeObjectiveIndex),
        ),
      ),
      status: mission.objectives.length === 0 ? 'completed' : 'active',
      objectiveState: null,
    };
  });
}

export function countStoryChapters(story: StoryMode): number {
  return story.acts.reduce((sum, act) => sum + act.chapters.length, 0);
}

export function countStoryMissions(story: StoryMode): number {
  return story.acts.reduce(
    (sum, act) =>
      sum + act.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.missions.length, 0),
    0,
  );
}

export function isChapterRuntimeReady(chapter: StoryChapter): boolean {
  return chapter.missions.every((mission) => mission.prototypeRuntime);
}

export function chapterMissingSystems(chapter: StoryChapter): StorySystem[] {
  const missing = new Set<StorySystem>();
  for (const mission of chapter.missions) {
    for (const system of mission.requiredSystems ?? []) missing.add(system);
  }
  return [...missing];
}

/** Turn a camelCase `StorySystem` id into a display label, e.g. `districtState` -> `District State`. */
export function formatStorySystem(system: StorySystem): string {
  return system
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

interface ResolvedStoryStage {
  label: string;
  actorIds: Set<string>;
  primaryActorId: string;
  failRules: readonly StoryFailRule[];
  nextWhen?: StoryStageTransition;
}

/** Mirrors CityScene's stage resolution: a script with no authored `stages` runs as one
 * synthetic stage built from its top-level actors/failRules/primaryActorId. Each stage only
 * ever sees its own `actors` list, never actors from other stages, so id references must stay
 * within the stage that declares them. */
function resolvedStoryStages(script: StoryRuntimeScript): ResolvedStoryStage[] {
  if (script.stages && script.stages.length > 0) {
    return script.stages.map((stage, index) => ({
      label: stage.id || `stages[${index}]`,
      actorIds: new Set(stage.actors.map((actor) => actor.actorId)),
      primaryActorId: stage.primaryActorId ?? script.primaryActorId,
      failRules: stage.failRules ?? script.failRules ?? [],
      nextWhen: stage.nextWhen,
    }));
  }
  return [
    {
      label: `${script.primaryActorId}-stage`,
      actorIds: new Set(script.actors.map((actor) => actor.actorId)),
      primaryActorId: script.primaryActorId,
      failRules: script.failRules ?? [],
      nextWhen: undefined,
    },
  ];
}

/** Fail rules that reference a specific actor id; `wantedPressure` does not. */
function failRuleActorId(rule: StoryFailRule): string | null {
  return rule.kind === 'wantedPressure' ? null : rule.actorId;
}

function validateStoryStageTransition(
  mission: Pick<StoryMissionPlan, 'prototypeRuntime'>,
  stage: ResolvedStoryStage,
  stagePath: string,
  issues: StoryValidationIssue[],
): void {
  const transition = stage.nextWhen;
  if (!transition) return;
  if (transition.kind === 'routeComplete' && !stage.actorIds.has(transition.actorId)) {
    issues.push({
      path: stagePath,
      message: `Stage transition "${transition.kind}" references unknown actor id "${transition.actorId}"`,
    });
    return;
  }
  if (transition.kind === 'storyObjective') {
    const objectiveCount = mission.prototypeRuntime?.objectives.length ?? 0;
    if (!Number.isInteger(transition.objectiveIndex) || transition.objectiveIndex < 0) {
      issues.push({
        path: stagePath,
        message: `Stage transition "storyObjective" must use a non-negative integer objectiveIndex`,
      });
    } else if (objectiveCount === 0 || transition.objectiveIndex >= objectiveCount) {
      issues.push({
        path: stagePath,
        message: `Stage transition "storyObjective" references objective index ${transition.objectiveIndex}, but only ${objectiveCount} authored objectives exist`,
      });
    }
    return;
  }
  if (transition.kind === 'routeProgress') {
    const maxOrderedTargetCount = Math.max(
      0,
      ...(mission.prototypeRuntime?.objectives
        .filter((objective) => objective.kind === 'route' || objective.kind === 'sabotage')
        .map((objective) => objective.targets.length) ?? []),
    );
    if (!Number.isInteger(transition.count) || transition.count < 1) {
      issues.push({
        path: stagePath,
        message: `Stage transition "routeProgress" must use a positive integer count`,
      });
    } else if (maxOrderedTargetCount < transition.count) {
      issues.push({
        path: stagePath,
        message: `Stage transition "routeProgress" requires ${transition.count} ordered targets, but the mission only defines ${maxOrderedTargetCount}`,
      });
    }
  }
}

function validateStoryRuntimeScript(
  mission: Pick<StoryMissionPlan, 'prototypeRuntime'>,
  script: StoryRuntimeScript,
  path: string,
  issues: StoryValidationIssue[],
): void {
  for (const stage of resolvedStoryStages(script)) {
    const stagePath = `${path} (${stage.label})`;
    // A stage with no actors (pure district-state / wanted-pressure beats) has no actor to
    // track, so `primaryActorId` is just a stable label rather than a real reference.
    if (stage.actorIds.size > 0 && !stage.actorIds.has(stage.primaryActorId)) {
      issues.push({
        path: stagePath,
        message: `primaryActorId "${stage.primaryActorId}" is not one of this stage's actors`,
      });
    }
    for (const rule of stage.failRules) {
      const actorId = failRuleActorId(rule);
      if (actorId && !stage.actorIds.has(actorId)) {
        issues.push({
          path: stagePath,
          message: `Fail rule "${rule.kind}" references unknown actor id "${actorId}"`,
        });
      }
    }
    validateStoryStageTransition(mission, stage, stagePath, issues);
  }
}

function collectStoryBranchOutcomes(story: StoryMode): Set<string> {
  const outcomes = new Set<string>();
  for (const act of story.acts) {
    for (const chapter of act.chapters) {
      for (const mission of chapter.missions) {
        if (mission.branchOutcome) {
          outcomes.add(`${mission.branchOutcome.branchId}::${mission.branchOutcome.outcomeId}`);
        }
      }
    }
  }
  return outcomes;
}

function collectStoryVariantBranchReferences(story: StoryMode): Set<string> {
  const refs = new Set<string>();
  for (const act of story.acts) {
    for (const chapter of act.chapters) {
      for (const mission of chapter.missions) {
        for (const variant of mission.variants ?? []) {
          if (variant.branchId !== undefined && variant.outcomeId !== undefined) {
            refs.add(`${variant.branchId}::${variant.outcomeId}`);
          }
        }
      }
    }
  }
  return refs;
}

/** Every `axis::id` that some branch outcome actually pushes an effect onto — the set of city-state
 * standings a variant condition is allowed to reference. */
function collectStoryCityAxes(story: StoryMode): Set<string> {
  const axes = new Set<string>();
  for (const act of story.acts) {
    for (const chapter of act.chapters) {
      for (const mission of chapter.missions) {
        for (const effect of mission.branchOutcome?.effects ?? []) {
          axes.add(`${effect.axis}::${effect.id}`);
        }
      }
    }
  }
  return axes;
}

export function validateStoryMode(story: StoryMode): StoryValidationIssue[] {
  const issues: StoryValidationIssue[] = [];
  const actIds = new Set<string>();
  const chapterIds = new Set<string>();
  const knownBranchOutcomes = collectStoryBranchOutcomes(story);
  const knownCityAxes = collectStoryCityAxes(story);

  if (story.schemaVersion !== STORY_MODE_SCHEMA_VERSION) {
    issues.push({
      path: 'schemaVersion',
      message: `Story schemaVersion should be ${STORY_MODE_SCHEMA_VERSION}, got ${story.schemaVersion}`,
    });
  }

  for (const [actIndex, act] of story.acts.entries()) {
    const actPath = `acts[${actIndex}]`;
    if (actIds.has(act.id))
      issues.push({ path: `${actPath}.id`, message: `Duplicate act id "${act.id}"` });
    actIds.add(act.id);
    if (act.order !== actIndex + 1) {
      issues.push({
        path: `${actPath}.order`,
        message: `Act order should be ${actIndex + 1}, got ${act.order}`,
      });
    }
    if (act.chapters.length === 0) {
      issues.push({
        path: `${actPath}.chapters`,
        message: 'Act must contain at least one chapter',
      });
    }

    for (const [chapterIndex, chapter] of act.chapters.entries()) {
      const chapterPath = `${actPath}.chapters[${chapterIndex}]`;
      if (chapter.actId !== act.id) {
        issues.push({
          path: `${chapterPath}.actId`,
          message: `Chapter actId "${chapter.actId}" does not match parent act "${act.id}"`,
        });
      }
      if (chapterIds.has(chapter.id)) {
        issues.push({ path: `${chapterPath}.id`, message: `Duplicate chapter id "${chapter.id}"` });
      }
      chapterIds.add(chapter.id);
      if (chapter.order !== chapterIndex + 1) {
        issues.push({
          path: `${chapterPath}.order`,
          message: `Chapter order should be ${chapterIndex + 1}, got ${chapter.order}`,
        });
      }
      if (chapter.missions.length < 5) {
        issues.push({
          path: `${chapterPath}.missions`,
          message: `Chapter must contain at least 5 missions, got ${chapter.missions.length}`,
        });
      }

      const missionIds = new Set<string>();
      for (const [missionIndex, mission] of chapter.missions.entries()) {
        const missionPath = `${chapterPath}.missions[${missionIndex}]`;
        if (missionIds.has(mission.id)) {
          issues.push({
            path: `${missionPath}.id`,
            message: `Duplicate mission id "${mission.id}"`,
          });
        }
        missionIds.add(mission.id);
        if (!mission.title.trim())
          issues.push({ path: `${missionPath}.title`, message: 'Mission title must not be empty' });
        if (!mission.primaryGoal.trim()) {
          issues.push({
            path: `${missionPath}.primaryGoal`,
            message: 'Mission primaryGoal must not be empty',
          });
        }
        if (!mission.failureState.trim()) {
          issues.push({
            path: `${missionPath}.failureState`,
            message: 'Mission failureState must not be empty',
          });
        }
        if (mission.prototypeScript) {
          validateStoryRuntimeScript(mission, mission.prototypeScript, `${missionPath}.prototypeScript`, issues);
        }
        for (const [variantIndex, variant] of (mission.variants ?? []).entries()) {
          const variantPath = `${missionPath}.variants[${variantIndex}]`;
          const hasBranch = variant.branchId !== undefined && variant.outcomeId !== undefined;
          const conditions = variant.cityState ?? [];
          if (!hasBranch && conditions.length === 0) {
            issues.push({
              path: variantPath,
              message:
                'Variant must declare a branch outcome, at least one city-state condition, or both',
            });
          }
          if (hasBranch && !knownBranchOutcomes.has(`${variant.branchId}::${variant.outcomeId}`)) {
            issues.push({
              path: variantPath,
              message: `Variant references branch outcome "${variant.branchId}=${variant.outcomeId}" that no mission ever sets`,
            });
          }
          for (const [conditionIndex, condition] of conditions.entries()) {
            const conditionPath = `${variantPath}.cityState[${conditionIndex}]`;
            if (condition.atLeast === undefined && condition.atMost === undefined) {
              issues.push({
                path: conditionPath,
                message: 'City-state condition must set atLeast, atMost, or both',
              });
            }
            if (!knownCityAxes.has(`${condition.axis}::${condition.id}`)) {
              issues.push({
                path: conditionPath,
                message: `City-state condition references "${condition.axis}=${condition.id}" that no branch outcome ever affects`,
              });
            }
          }
          if (variant.prototypeScript) {
            validateStoryRuntimeScript(
              { prototypeRuntime: variant.prototypeRuntime ?? mission.prototypeRuntime },
              variant.prototypeScript,
              `${variantPath}.prototypeScript`,
              issues,
            );
          }
        }
      }

      const groupedIds = rawStoryChapterMissionGroups(chapter).flat();
      const missionIdList = chapter.missions.map((mission) => mission.id);
      if (groupedIds.length !== missionIdList.length) {
        issues.push({
          path: `${chapterPath}.missionGroups`,
          message: 'Mission groups must cover every mission exactly once',
        });
      }
      const groupedIdSet = new Set<string>();
      for (const [groupIndex, group] of rawStoryChapterMissionGroups(chapter).entries()) {
        if (group.length === 0) {
          issues.push({
            path: `${chapterPath}.missionGroups[${groupIndex}]`,
            message: 'Mission group must not be empty',
          });
        }
        for (const missionId of group) {
          if (!missionIds.has(missionId)) {
            issues.push({
              path: `${chapterPath}.missionGroups[${groupIndex}]`,
              message: `Mission group references unknown mission id "${missionId}"`,
            });
            continue;
          }
          if (groupedIdSet.has(missionId)) {
            issues.push({
              path: `${chapterPath}.missionGroups[${groupIndex}]`,
              message: `Mission id "${missionId}" appears in more than one mission group`,
            });
            continue;
          }
          groupedIdSet.add(missionId);
        }
      }
      for (const missionId of missionIdList) {
        if (!groupedIdSet.has(missionId)) {
          issues.push({
            path: `${chapterPath}.missionGroups`,
            message: `Mission groups do not include mission id "${missionId}"`,
          });
        }
      }
    }
  }

  // Dead flexibility: a branch outcome a mission records but no variant ever
  // reads is a dangling declaration — either a variant is missing or the branch
  // is dead and should be removed.
  const variantBranchReferences = collectStoryVariantBranchReferences(story);
  for (const outcome of knownBranchOutcomes) {
    if (!variantBranchReferences.has(outcome)) {
      issues.push({
        path: 'branchOutcomes',
        message: `Branch outcome "${outcome.replace('::', '=')}" is recorded by a mission but no variant ever reads it`,
      });
    }
  }

  return issues;
}

/**
 * Numeric balance envelope every authored mission must stay inside (Stage 14 ship gate). These are
 * deliberately wide "typo and gross-imbalance" guards, not a rigid difficulty curve: they catch a
 * mission that pays 50 credits, demands a 9-star response, or uses an impossible 5-unit escort
 * radius, while still leaving authoring room inside each act.
 */
export const STORY_BALANCE_BOUNDS = {
  reward: { min: 1000, max: 15000 },
  routeTimeLimitSeconds: { min: 30, max: 180 },
  holdSeconds: { min: 1, max: 90 },
  wantedStars: { min: 1, max: 6 },
  objectiveRadius: { min: 10, max: 600 },
  actorRadius: { min: 40, max: 800 },
  failRuleSeconds: { min: 0.25, max: 300 },
  actorMinHealthPercent: { min: 1, max: 100 },
} as const;

type StoryBalanceBound = { min: number; max: number };

function checkStoryBalanceRange(
  value: number,
  bound: StoryBalanceBound,
  label: string,
  path: string,
  issues: StoryValidationIssue[],
): void {
  if (!Number.isFinite(value) || value < bound.min || value > bound.max) {
    issues.push({
      path,
      message: `${label} ${value} is outside the balance range [${bound.min}, ${bound.max}]`,
    });
  }
}

function validateStoryObjectiveBalance(
  objectives: readonly Objective[],
  path: string,
  issues: StoryValidationIssue[],
): void {
  for (const [index, objective] of objectives.entries()) {
    const objPath = `${path}.objectives[${index}]`;
    if (objective.kind === 'reach' || objective.kind === 'route' || objective.kind === 'sabotage' || objective.kind === 'defend') {
      checkStoryBalanceRange(objective.radius, STORY_BALANCE_BOUNDS.objectiveRadius, 'Objective radius', objPath, issues);
    }
    if ((objective.kind === 'route' || objective.kind === 'sabotage') && objective.timeLimitSeconds !== undefined) {
      checkStoryBalanceRange(objective.timeLimitSeconds, STORY_BALANCE_BOUNDS.routeTimeLimitSeconds, 'Route time limit', objPath, issues);
    }
    if (objective.kind === 'tail' || objective.kind === 'capture' || objective.kind === 'survive' || objective.kind === 'defend') {
      checkStoryBalanceRange(objective.seconds, STORY_BALANCE_BOUNDS.holdSeconds, 'Hold seconds', objPath, issues);
    }
    if (objective.kind === 'wanted') {
      checkStoryBalanceRange(objective.stars, STORY_BALANCE_BOUNDS.wantedStars, 'Wanted stars', objPath, issues);
    }
  }
}

function validateStoryScriptBalance(
  script: StoryRuntimeScript,
  path: string,
  issues: StoryValidationIssue[],
): void {
  const stages =
    script.stages && script.stages.length > 0
      ? script.stages.map((stage, index) => ({
          label: stage.id || `stages[${index}]`,
          actors: stage.actors,
          failRules: stage.failRules ?? script.failRules ?? [],
        }))
      : [{ label: 'stage', actors: script.actors, failRules: script.failRules ?? [] }];
  for (const stage of stages) {
    const stagePath = `${path} (${stage.label})`;
    for (const actor of stage.actors) {
      if (actor.kind === 'vehicleRoute') {
        checkStoryBalanceRange(actor.followRadius, STORY_BALANCE_BOUNDS.actorRadius, 'Follow radius', stagePath, issues);
        if (actor.captureRadius !== undefined) {
          checkStoryBalanceRange(actor.captureRadius, STORY_BALANCE_BOUNDS.actorRadius, 'Capture radius', stagePath, issues);
        }
      } else if (actor.kind === 'pedestrianRoute' && actor.escortRadius !== undefined) {
        checkStoryBalanceRange(actor.escortRadius, STORY_BALANCE_BOUNDS.actorRadius, 'Escort radius', stagePath, issues);
      }
    }
    for (const rule of stage.failRules) {
      checkStoryBalanceRange(rule.maxSeconds, STORY_BALANCE_BOUNDS.failRuleSeconds, 'Fail-rule maxSeconds', stagePath, issues);
      if (rule.kind === 'escortRadius') {
        checkStoryBalanceRange(rule.radius, STORY_BALANCE_BOUNDS.actorRadius, 'Escort-radius fail rule radius', stagePath, issues);
      }
      if (rule.kind === 'wantedPressure') {
        checkStoryBalanceRange(rule.minStars, STORY_BALANCE_BOUNDS.wantedStars, 'Wanted-pressure minStars', stagePath, issues);
      }
      if (rule.kind === 'actorVehicleCondition') {
        checkStoryBalanceRange(rule.minHealth, STORY_BALANCE_BOUNDS.actorMinHealthPercent, 'Actor vehicle minHealth', stagePath, issues);
      }
    }
  }
}

/**
 * Stage 14 ship gate: assert the authored economy, mission timings, wanted pressure, and escort
 * tolerances stay inside {@link STORY_BALANCE_BOUNDS}, and that the reward economy never regresses
 * from one act to the next. This keeps the balance that was hand-tuned once from silently drifting
 * as later edits land. Kept separate from {@link validateStoryMode} (structural integrity) so each
 * gate can be reasoned about — and fixed — independently.
 */
export function validateStoryBalance(story: StoryMode): StoryValidationIssue[] {
  const issues: StoryValidationIssue[] = [];
  const actAverageRewards: { actId: string; average: number }[] = [];

  for (const [actIndex, act] of story.acts.entries()) {
    let rewardSum = 0;
    let rewardCount = 0;
    for (const [chapterIndex, chapter] of act.chapters.entries()) {
      for (const [missionIndex, mission] of chapter.missions.entries()) {
        const missionPath = `acts[${actIndex}].chapters[${chapterIndex}].missions[${missionIndex}]`;

        const baseReward = mission.prototypeRuntime?.reward;
        if (mission.prototypeRuntime && baseReward === undefined) {
          issues.push({
            path: `${missionPath}.prototypeRuntime.reward`,
            message: 'Shippable mission must define a reward',
          });
        } else if (baseReward !== undefined) {
          rewardSum += baseReward;
          rewardCount += 1;
        }

        const runtimes: { runtime: MissionSpec; script?: StoryRuntimeScript; label: string }[] = [];
        if (mission.prototypeRuntime) {
          runtimes.push({ runtime: mission.prototypeRuntime, script: mission.prototypeScript, label: missionPath });
        }
        for (const [variantIndex, variant] of (mission.variants ?? []).entries()) {
          if (variant.prototypeRuntime) {
            runtimes.push({
              runtime: variant.prototypeRuntime,
              script: variant.prototypeScript ?? mission.prototypeScript,
              label: `${missionPath}.variants[${variantIndex}]`,
            });
          }
        }
        for (const entry of runtimes) {
          if (entry.runtime.reward !== undefined) {
            checkStoryBalanceRange(entry.runtime.reward, STORY_BALANCE_BOUNDS.reward, 'Reward', `${entry.label}.reward`, issues);
          }
          validateStoryObjectiveBalance(entry.runtime.objectives, entry.label, issues);
          if (entry.script) {
            validateStoryScriptBalance(entry.script, `${entry.label}.prototypeScript`, issues);
          }
        }
      }
    }
    if (rewardCount > 0) {
      actAverageRewards.push({ actId: act.id, average: rewardSum / rewardCount });
    }
  }

  for (let i = 1; i < actAverageRewards.length; i += 1) {
    const previous = actAverageRewards[i - 1]!;
    const current = actAverageRewards[i]!;
    if (current.average < previous.average) {
      issues.push({
        path: `acts[${i}]`,
        message: `Act "${current.actId}" average reward ${Math.round(current.average)} regresses below the previous act "${previous.actId}" average ${Math.round(previous.average)}; the reward economy should not drop across acts`,
      });
    }
  }

  return issues;
}
