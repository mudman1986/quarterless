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

export interface StoryMissionPlan {
  id: string;
  title: string;
  hook: string;
  primaryGoal: string;
  secondaryPressure: string;
  failureState: string;
  payoff: string;
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

export interface StoryDistrictStateScript {
  label: string;
  summary?: string;
  serviceLaneBlocks?: readonly ServiceObjectiveKind[];
  trafficSpeedMultiplier?: number;
  suppressNpcDriving?: boolean;
  wantedPressureBonus?: number;
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

export type StoryFailRule = LoseActorFailRule | EscortRadiusFailRule;

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

export interface StoryMode {
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
  if (firstObjective?.kind === 'route') return firstObjective.targets[0] ?? null;
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

export function validateStoryMode(story: StoryMode): StoryValidationIssue[] {
  const issues: StoryValidationIssue[] = [];
  const actIds = new Set<string>();
  const chapterIds = new Set<string>();

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
