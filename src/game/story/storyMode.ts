import { createMission, type Mission, type MissionSpec } from '../../core/mission';
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

export interface StoryRuntimeScript {
  primaryActorId: string;
  actors: readonly StoryActorScript[];
  failRules?: readonly StoryFailRule[];
}

export interface StoryChapter {
  id: string;
  actId: string;
  order: number;
  title: string;
  storyRole: string;
  combinedGoal: string;
  missions: readonly StoryMissionPlan[];
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

export function compileCampaignTemplate(template: RuntimeCampaignTemplate): Mission[] {
  return template.missions.map(createMission);
}

export function compileStoryChapterRuntimeCampaign(
  chapter: StoryChapter,
  startMissionId = chapter.missions[0]?.id,
  startObjectiveIndex = 0,
): Mission[] | null {
  const startIndex = chapter.missions.findIndex((mission) => mission.id === startMissionId);
  if (startIndex === -1) return null;
  const plans = chapter.missions.slice(startIndex);
  if (plans.some((mission) => !mission.prototypeRuntime)) return null;

  return plans.map((plan, index) => {
    const mission = createMission(plan.prototypeRuntime!);
    if (index > 0) return mission;
    return {
      ...mission,
      currentIndex: Math.max(0, Math.min(mission.objectives.length - 1, Math.floor(startObjectiveIndex) || 0)),
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
    (sum, act) => sum + act.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.missions.length, 0),
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
    if (actIds.has(act.id)) issues.push({ path: `${actPath}.id`, message: `Duplicate act id "${act.id}"` });
    actIds.add(act.id);
    if (act.order !== actIndex + 1) {
      issues.push({
        path: `${actPath}.order`,
        message: `Act order should be ${actIndex + 1}, got ${act.order}`,
      });
    }
    if (act.chapters.length === 0) {
      issues.push({ path: `${actPath}.chapters`, message: 'Act must contain at least one chapter' });
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
          issues.push({ path: `${missionPath}.id`, message: `Duplicate mission id "${mission.id}"` });
        }
        missionIds.add(mission.id);
        if (!mission.title.trim()) issues.push({ path: `${missionPath}.title`, message: 'Mission title must not be empty' });
        if (!mission.primaryGoal.trim()) {
          issues.push({ path: `${missionPath}.primaryGoal`, message: 'Mission primaryGoal must not be empty' });
        }
        if (!mission.failureState.trim()) {
          issues.push({ path: `${missionPath}.failureState`, message: 'Mission failureState must not be empty' });
        }
      }
    }
  }

  return issues;
}