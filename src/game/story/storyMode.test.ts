import { buildCity } from '../../core/city';
import { currentObjective } from '../../core/mission';
import { describe, expect, it } from 'vitest';
import { CITY_SPEC } from '../citySpec';
import { DEAD_DROP_DISTRICT, STORY_MODE_PROTOTYPE } from './deadDropDistrict';
import { buildSandboxCampaigns } from './sandboxCampaigns';
import {
  compileStoryChapterRuntimeCampaign,
  chapterMissingSystems,
  compileCampaignTemplate,
  countStoryChapters,
  countStoryMissions,
  isChapterRuntimeReady,
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
    expect(countStoryChapters(STORY_MODE_PROTOTYPE)).toBe(1);
    expect(countStoryMissions(STORY_MODE_PROTOTYPE)).toBe(5);
  });
});

describe('chapter runtime readiness', () => {
  it('tracks which new systems still block the chapter from full runtime play', () => {
    expect(isChapterRuntimeReady(DEAD_DROP_DISTRICT)).toBe(true);
    expect(chapterMissingSystems(DEAD_DROP_DISTRICT)).toEqual(
      expect.arrayContaining(['scriptedEncounter', 'timedMultiStop', 'districtState', 'sabotage', 'tail', 'capture']),
    );
  });
});

describe('compileStoryChapterRuntimeCampaign', () => {
  it('builds a playable runtime campaign from the current chapter and can resume mid-chapter', () => {
    const missions = compileStoryChapterRuntimeCampaign(DEAD_DROP_DISTRICT, 'burned-locker', 1);

    expect(missions).toHaveLength(4);
    expect(missions?.[0]?.id).toBe('burned-locker');
    expect(missions?.[0]?.currentIndex).toBe(1);
    expect(missions?.[1]?.id).toBe('wreck-before-dawn');
  });
});

describe('buildSandboxCampaigns', () => {
  it('keeps the live endless campaigns available through the new authoring pipeline', () => {
    const campaigns = buildSandboxCampaigns(buildCity(CITY_SPEC));

    expect(campaigns).toHaveLength(4);
    expect(campaigns[0]).toHaveLength(2);
    expect(campaigns[0]?.[0]?.title).toBe('Make a Name');
    expect(currentObjective(campaigns[3]?.[0]!)?.kind).toBe('reach');
  });
});