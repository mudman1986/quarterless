import { buildCity } from '../../core/city';
import { currentObjective } from '../../core/mission';
import { describe, expect, it } from 'vitest';
import { CITY_SPEC } from '../citySpec';
import { DEAD_DROP_DISTRICT, STORY_MODE_PROTOTYPE } from './deadDropDistrict';
import { buildSandboxCampaigns } from './sandboxCampaigns';
import {
  STORY_MISSION_GROUP_SELECTION_INDEX,
  STORY_MODE_SCHEMA_VERSION,
  compileStoryMissionRuntime,
  compileStoryChapterRuntimeCampaign,
  chapterMissingSystems,
  compileCampaignTemplate,
  countStoryChapters,
  countStoryMissions,
  createEscortMissionScript,
  escortRadiusFailRule,
  escortRouteActor,
  actorVehicleConditionFailRule,
  createProtectedVehicleTailScript,
  formatStorySystem,
  wantedPressureFailRule,
  isChapterRuntimeReady,
  resolveStoryMissionPlan,
  storyChapterPendingMissionGroup,
  storyMissionInitialObjectiveIndex,
  storyObjectiveIndexFromRuntime,
  validateStoryMode,
} from './storyMode';
import type { StoryChapter, StoryMissionPlan, StoryMode } from './storyMode';

function fixedObjectiveTargets(runtime: ReturnType<typeof compileStoryMissionRuntime>) {
  return (
    runtime?.objectives.flatMap((objective) => {
      if (objective.kind === 'reach' || objective.kind === 'defend') return [objective.target];
      if (objective.kind === 'route' || objective.kind === 'sabotage') return objective.targets;
      return [];
    }) ?? []
  );
}

function storyPlansForMarkerValidation() {
  return STORY_MODE_PROTOTYPE.acts.flatMap((act) =>
    act.chapters.flatMap((chapter) =>
      chapter.missions.flatMap((mission) => {
        const basePlan = [{
          label: `${act.id}/${chapter.id}/${mission.id}`,
          plan: mission,
        }];
        const variantPlans = (mission.variants ?? []).map((variant) => ({
          label: `${act.id}/${chapter.id}/${mission.id}:${variant.branchId}=${variant.outcomeId}`,
          plan: resolveStoryMissionPlan(mission, { [variant.branchId]: variant.outcomeId }),
        }));
        return [...basePlan, ...variantPlans];
      }),
    ),
  );
}

describe('compileCampaignTemplate', () => {
  it('creates fresh runtime missions from authored specs', () => {
    const missions = compileCampaignTemplate({
      id: 'test-campaign',
      title: 'Test Campaign',
      summary: 'Compile a single mission.',
      missions: [
        {
          id: 'first',
          title: 'First Mission',
          objectives: [
            {
              kind: 'reach',
              description: 'Reach the marker',
              target: { x: 10, y: 20 },
              radius: 12,
            },
          ],
          reward: 123,
        },
      ],
    });

    expect(missions).toHaveLength(1);
    expect(missions[0]?.title).toBe('First Mission');
    expect(currentObjective(missions[0]!)?.kind).toBe('reach');
    expect(missions[0]?.reward).toBe(123);
  });
});

function minimalMission(id: string): StoryMissionPlan {
  return {
    id,
    title: `${id} title`,
    hook: 'Hook',
    primaryGoal: 'Goal',
    secondaryPressure: 'Pressure',
    failureState: 'Failure',
    payoff: 'Payoff',
  };
}

function minimalChapter(id: string, actId: string, order: number): StoryChapter {
  return {
    id,
    actId,
    order,
    title: `${id} title`,
    storyRole: 'Role',
    combinedGoal: 'Combined goal',
    missions: Array.from({ length: 5 }, (_, index) => minimalMission(`${id}-m${index + 1}`)),
  };
}

function minimalStoryMode(): StoryMode {
  return {
    schemaVersion: STORY_MODE_SCHEMA_VERSION,
    id: 'test-story',
    title: 'Test Story',
    premise: 'Premise',
    acts: [
      {
        id: 'act-1',
        order: 1,
        title: 'Act 1',
        summary: 'Summary',
        chapters: [minimalChapter('chapter-1', 'act-1', 1)],
      },
    ],
  };
}

/** Replace the first mission of the fixture's only chapter, keeping everything else valid. */
function withFirstMission(story: StoryMode, mission: StoryMissionPlan): StoryMode {
  const chapter = story.acts[0]!.chapters[0]!;
  return {
    ...story,
    acts: [
      {
        ...story.acts[0]!,
        chapters: [{ ...chapter, missions: [mission, ...chapter.missions.slice(1)] }],
      },
    ],
  };
}

describe('validateStoryMode', () => {
  it('accepts the first implemented story slice', () => {
    expect(validateStoryMode(STORY_MODE_PROTOTYPE)).toEqual([]);
    expect(countStoryChapters(STORY_MODE_PROTOTYPE)).toBe(10);
    expect(countStoryMissions(STORY_MODE_PROTOTYPE)).toBe(50);
  });

  it('accepts a minimal well-formed fixture', () => {
    expect(validateStoryMode(minimalStoryMode())).toEqual([]);
  });

  it('flags a schemaVersion mismatch', () => {
    const story: StoryMode = { ...minimalStoryMode(), schemaVersion: 999 };
    expect(validateStoryMode(story)).toContainEqual(
      expect.objectContaining({ path: 'schemaVersion' }),
    );
  });

  it('flags duplicate act ids', () => {
    const story = minimalStoryMode();
    const duplicated: StoryMode = { ...story, acts: [...story.acts, { ...story.acts[0]! }] };
    expect(validateStoryMode(duplicated).some((issue) => issue.message.includes('Duplicate act id'))).toBe(
      true,
    );
  });

  it('flags a mission group that references an unknown mission id', () => {
    const story = minimalStoryMode();
    const chapter = story.acts[0]!.chapters[0]!;
    const malformed: StoryMode = {
      ...story,
      acts: [{ ...story.acts[0]!, chapters: [{ ...chapter, missionGroups: [['does-not-exist']] }] }],
    };
    expect(
      validateStoryMode(malformed).some((issue) => issue.message.includes('unknown mission id')),
    ).toBe(true);
  });

  it('flags a prototypeScript primaryActorId that is not one of its own actors', () => {
    const story = minimalStoryMode();
    const mission: StoryMissionPlan = {
      ...minimalMission('chapter-1-m1'),
      prototypeScript: {
        primaryActorId: 'ghost-actor',
        actors: [escortRouteActor('real-actor', [{ x: 0, y: 0 }], 100)],
      },
    };
    const malformed = withFirstMission(story, mission);
    expect(
      validateStoryMode(malformed).some((issue) => issue.message.includes('primaryActorId')),
    ).toBe(true);
  });

  it('flags a fail rule that references an unknown actor id', () => {
    const story = minimalStoryMode();
    const mission: StoryMissionPlan = {
      ...minimalMission('chapter-1-m1'),
      prototypeScript: {
        primaryActorId: 'real-actor',
        actors: [escortRouteActor('real-actor', [{ x: 0, y: 0 }], 100)],
        failRules: [escortRadiusFailRule('someone-else', 'Lost the escort')],
      },
    };
    const malformed = withFirstMission(story, mission);
    expect(
      validateStoryMode(malformed).some((issue) => issue.message.includes('unknown actor id')),
    ).toBe(true);
  });

  it('flags a mission variant that references a branch outcome no mission ever sets', () => {
    const story = minimalStoryMode();
    const mission: StoryMissionPlan = {
      ...minimalMission('chapter-1-m1'),
      variants: [{ branchId: 'ghost-branch', outcomeId: 'ghost-outcome', title: 'Variant' }],
    };
    const malformed = withFirstMission(story, mission);
    expect(
      validateStoryMode(malformed).some((issue) =>
        issue.message.includes('that no mission ever sets'),
      ),
    ).toBe(true);
  });
});

describe('chapter runtime readiness', () => {
  it('tracks which new systems still block the chapter from full runtime play', () => {
    expect(isChapterRuntimeReady(DEAD_DROP_DISTRICT)).toBe(true);
    expect(chapterMissingSystems(DEAD_DROP_DISTRICT)).toEqual(
      expect.arrayContaining(['scriptedEncounter', 'timedMultiStop', 'districtState', 'sabotage', 'tail', 'capture']),
    );
  });

  it('supports grouped free-order story missions inside a chapter', () => {
    const pending = storyChapterPendingMissionGroup(STORY_MODE_PROTOTYPE.acts[0]!.chapters[1]!, ['yard-talk']);

    expect(pending?.map((mission) => mission.id)).toEqual(['hook-chain', 'the-empty-shell']);
    expect(STORY_MISSION_GROUP_SELECTION_INDEX).toBe(-2);
  });
});

describe('compileStoryChapterRuntimeCampaign', () => {
  it('prepends a mission-start marker before the authored objectives', () => {
    const runtime = compileStoryMissionRuntime(DEAD_DROP_DISTRICT.missions[0]!);

    expect(runtime?.objectives[0]).toMatchObject({
      kind: 'reach',
      description: 'Go to the mission marker to start Night Ferry Run',
    });
    expect(storyMissionInitialObjectiveIndex(DEAD_DROP_DISTRICT.missions[0]!)).toBe(-1);
  });

  it('builds a playable runtime campaign from the current chapter and can resume mid-chapter', () => {
    const missions = compileStoryChapterRuntimeCampaign(DEAD_DROP_DISTRICT, 'burned-locker', 1);

    expect(missions).toHaveLength(4);
    expect(missions?.[0]).toMatchObject({ id: 'burned-locker', currentIndex: 2 });
    expect(storyObjectiveIndexFromRuntime(DEAD_DROP_DISTRICT.missions[1]!, missions?.[0]?.currentIndex ?? -1)).toBe(1);
    expect(missions?.[1]).toMatchObject({ id: 'wreck-before-dawn' });
  });

  it('resolves branch-dependent mission variants when compiling a chapter runtime', () => {
    const chapter = STORY_MODE_PROTOTYPE.acts[0]!.chapters[3]!;
    const resolved = resolveStoryMissionPlan(chapter.missions[2]!, { 'double-booking': 'save-passenger-a' });
    const missions = compileStoryChapterRuntimeCampaign(chapter, 'red-light-choir', 0, {
      'double-booking': 'save-passenger-a',
    });

    expect(resolved.title).toBe('Red Light Choir: Uptown Lead');
    expect(resolved.prototypeScript?.stages?.[0]?.districtState?.label).toBe('The host is still circling the uptown clubs');
    expect(missions?.[0]).toMatchObject({
      id: 'red-light-choir',
      title: 'Red Light Choir: Uptown Lead',
    });
    expect(missions?.[0] ? currentObjective(missions[0])?.description : null).toBe('Tail the radio host through the uptown club strip');
  });

  it('resolves later mission variants from a recorded grouped-lead outcome', () => {
    const chapter = STORY_MODE_PROTOTYPE.acts[0]!.chapters[3]!;
    const resolved = resolveStoryMissionPlan(chapter.missions[3]!, { 'double-booking': 'save-passenger-b' });

    expect(resolved.title).toBe('Meter Burn: River Slip');
    expect(resolved.prototypeRuntime?.objectives[0]).toMatchObject({
      kind: 'route',
      description: 'Clear the river fare route through the checkpoint strip',
    });
    expect(resolved.prototypeScript?.stages?.[0]?.districtState?.label).toBe(
      'River-wall readers are sweeping the darker fare lane',
    );
  });

  it('keeps fixed-position story markers out of water across all authored mission plans', () => {
    const city = buildCity(CITY_SPEC);
    let checkedTargets = 0;
    const invalidTargets = new Set<string>();

    for (const { label, plan } of storyPlansForMarkerValidation()) {
      for (const target of fixedObjectiveTargets(compileStoryMissionRuntime(plan))) {
        checkedTargets += 1;
        const tx = Math.floor(target.x / city.spec.tile);
        const ty = Math.floor(target.y / city.spec.tile);
        if (city.isWater(tx, ty)) {
          invalidTargets.add(`${label} -> (${target.x}, ${target.y})`);
        }
      }
    }

    expect(checkedTargets).toBeGreaterThan(0);
    expect([...invalidTargets]).toEqual([]);
  });
});

describe('buildSandboxCampaigns', () => {
  it('keeps the live endless campaigns available through the new authoring pipeline', () => {
    const campaigns = buildSandboxCampaigns(buildCity(CITY_SPEC));

    expect(campaigns).toHaveLength(4);
    expect(campaigns[0]).toHaveLength(2);
    expect(campaigns[0]?.[0]?.title).toBe('Make a Name');
    expect(campaigns[3]?.[0]).toBeDefined();
    const firstServiceMission = campaigns[3]?.[0];
    expect(firstServiceMission ? currentObjective(firstServiceMission)?.kind : null).toBe('reach');
  });
});

describe('escort authoring helpers', () => {
  const route = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it('builds a pedestrian route actor with the default escort radius', () => {
    expect(escortRouteActor('guide', route, 40)).toEqual({
      kind: 'pedestrianRoute',
      actorId: 'guide',
      route,
      speed: 40,
      escortRadius: 180,
    });
  });

  it('builds an escort-radius fail rule with the default radius and grace period', () => {
    expect(escortRadiusFailRule('guide', 'The guide was lost.')).toEqual({
      kind: 'escortRadius',
      actorId: 'guide',
      radius: 220,
      maxSeconds: 3,
      failureText: 'The guide was lost.',
    });
  });

  it('composes a full single-actor escort runtime script', () => {
    const script = createEscortMissionScript({
      actorId: 'guide',
      route,
      speed: 40,
      failureText: 'The guide was lost.',
    });

    expect(script).toEqual({
      primaryActorId: 'guide',
      actors: [escortRouteActor('guide', route, 40)],
      failRules: [escortRadiusFailRule('guide', 'The guide was lost.')],
    });
  });
});

describe('wanted-pressure and protected-vehicle authoring helpers', () => {
  const route = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it('builds a wanted-pressure fail rule with the default grace period', () => {
    expect(wantedPressureFailRule(2, 'The fare was burned.')).toEqual({
      kind: 'wantedPressure',
      minStars: 2,
      maxSeconds: 2,
      failureText: 'The fare was burned.',
    });
  });

  it('builds an actor-vehicle-condition fail rule with the default grace period', () => {
    expect(actorVehicleConditionFailRule('cargo-van', 55, 'The cargo was lost.')).toEqual({
      kind: 'actorVehicleCondition',
      actorId: 'cargo-van',
      minHealth: 55,
      maxSeconds: 3,
      failureText: 'The cargo was lost.',
    });
  });

  it('composes a full single-actor protected-vehicle runtime script', () => {
    const script = createProtectedVehicleTailScript({
      actorId: 'cargo-van',
      vehicleKind: 'van',
      route,
      speed: 90,
      followRadius: 260,
      minHealth: 55,
      failureText: 'The cargo was lost.',
    });

    expect(script).toEqual({
      primaryActorId: 'cargo-van',
      actors: [
        {
          kind: 'vehicleRoute',
          actorId: 'cargo-van',
          vehicleKind: 'van',
          route,
          speed: 90,
          followRadius: 260,
        },
      ],
      failRules: [actorVehicleConditionFailRule('cargo-van', 55, 'The cargo was lost.')],
    });
  });
});

describe('formatStorySystem', () => {
  it('turns camelCase system ids into title-case labels', () => {
    expect(formatStorySystem('districtState')).toBe('District State');
    expect(formatStorySystem('escort')).toBe('Escort');
    expect(formatStorySystem('timedMultiStop')).toBe('Timed Multi Stop');
  });
});