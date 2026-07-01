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

export interface StoryMissionVariantOverride {
  title?: string;
  hook?: string;
  primaryGoal?: string;
  secondaryPressure?: string;
  failureState?: string;
  payoff?: string;
  requiredSystems?: readonly StorySystem[];
  prototypeRuntime?: MissionSpec;
  prototypeScript?: StoryRuntimeScript;
}

export interface StoryMissionVariant extends StoryMissionVariantOverride {
  branchId: string;
  outcomeId: string;
}

export interface StoryMissionBranchOutcome {
  branchId: string;
  outcomeId: string;
}

export interface StoryMissionPlan {
  id: string;
  title: string;
  hook: string;
  primaryGoal: string;
  secondaryPressure: string;
  failureState: string;
  payoff: string;
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

export type StoryStageTransition =
  | RouteCompleteStageTransition
  | TailSecondsStageTransition
  | CaptureSecondsStageTransition;

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

export function resolveStoryMissionPlan(
  plan: StoryMissionPlan,
  branchOutcomes: Record<string, string> = {},
): StoryMissionPlan {
  const variant = plan.variants?.find(
    ({ branchId, outcomeId }) => branchOutcomes[branchId] === outcomeId,
  );
  if (!variant) return plan;
  const overrides: StoryMissionVariantOverride = {
    title: variant.title,
    hook: variant.hook,
    primaryGoal: variant.primaryGoal,
    secondaryPressure: variant.secondaryPressure,
    failureState: variant.failureState,
    payoff: variant.payoff,
    requiredSystems: variant.requiredSystems,
    prototypeRuntime: variant.prototypeRuntime,
    prototypeScript: variant.prototypeScript,
  };
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
    radius: 24,
  };
}

export function storyMissionStartPosition(
  plan: Pick<StoryMissionPlan, 'prototypeRuntime' | 'prototypeScript'>,
): Vec2 | null {
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
): Mission[] | null {
  const startIndex = chapter.missions.findIndex((mission) => mission.id === startMissionId);
  if (startIndex === -1) return null;
  const plans = chapter.missions
    .slice(startIndex)
    .map((mission) => resolveStoryMissionPlan(mission, branchOutcomes));
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
    }));
  }
  return [
    {
      label: `${script.primaryActorId}-stage`,
      actorIds: new Set(script.actors.map((actor) => actor.actorId)),
      primaryActorId: script.primaryActorId,
      failRules: script.failRules ?? [],
    },
  ];
}

/** Fail rules that reference a specific actor id; `wantedPressure` does not. */
function failRuleActorId(rule: StoryFailRule): string | null {
  return rule.kind === 'wantedPressure' ? null : rule.actorId;
}

function validateStoryRuntimeScript(
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

export function validateStoryMode(story: StoryMode): StoryValidationIssue[] {
  const issues: StoryValidationIssue[] = [];
  const actIds = new Set<string>();
  const chapterIds = new Set<string>();
  const knownBranchOutcomes = collectStoryBranchOutcomes(story);

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
          validateStoryRuntimeScript(mission.prototypeScript, `${missionPath}.prototypeScript`, issues);
        }
        for (const [variantIndex, variant] of (mission.variants ?? []).entries()) {
          const variantPath = `${missionPath}.variants[${variantIndex}]`;
          if (!knownBranchOutcomes.has(`${variant.branchId}::${variant.outcomeId}`)) {
            issues.push({
              path: variantPath,
              message: `Variant references branch outcome "${variant.branchId}=${variant.outcomeId}" that no mission ever sets`,
            });
          }
          if (variant.prototypeScript) {
            validateStoryRuntimeScript(
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

  return issues;
}
