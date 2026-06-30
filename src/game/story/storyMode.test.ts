import { buildCity } from '../../core/city';
import { currentObjective } from '../../core/mission';
import { describe, expect, it } from 'vitest';
import { CITY_SPEC } from '../citySpec';
import { DEAD_DROP_DISTRICT, STORY_MODE_PROTOTYPE } from './deadDropDistrict';
import { buildSandboxCampaigns } from './sandboxCampaigns';
import {
  STORY_MISSION_GROUP_SELECTION_INDEX,
  compileStoryMissionRuntime,
  compileStoryChapterRuntimeCampaign,
  chapterMissingSystems,
  compileCampaignTemplate,
  countStoryChapters,
  countStoryMissions,
  isChapterRuntimeReady,
  resolveStoryMissionPlan,
  storyChapterPendingMissionGroup,
  storyMissionInitialObjectiveIndex,
  storyObjectiveIndexFromRuntime,
  validateStoryMode,
} from './storyMode';

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

describe('validateStoryMode', () => {
  it('accepts the first implemented story slice', () => {
    expect(validateStoryMode(STORY_MODE_PROTOTYPE)).toEqual([]);
    expect(countStoryChapters(STORY_MODE_PROTOTYPE)).toBe(9);
    expect(countStoryMissions(STORY_MODE_PROTOTYPE)).toBe(45);
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