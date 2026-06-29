import { expect, test } from '@playwright/test';
import { launchSindicate } from './helpers';
import { STORY_MODE_PROTOTYPE } from '../src/game/story/deadDropDistrict';

const authoredMissions = STORY_MODE_PROTOTYPE.acts.flatMap((act) =>
  act.chapters.flatMap((chapter) =>
    chapter.missions
      .filter((mission) => mission.prototypeRuntime)
      .map((mission) => ({ actId: act.id, chapter, mission })),
  ),
);

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    localStorage.removeItem('sindicate.gameState');
    localStorage.removeItem('sindicate.storyProgress');
    sessionStorage.removeItem('sindicate.storyLaunchRequest');
  });
});

test('every authored runtime mission boots into the expected mission shell', async ({ page }) => {
  await launchSindicate(page);

  for (const entry of authoredMissions) {
    const objectiveIndex = entry.mission.prototypeScript ? 0 : entry.mission.prototypeRuntime?.objectives[0]?.kind === 'reach' || entry.mission.prototypeRuntime?.objectives[0]?.kind === 'route' ? -1 : 0;
    await page.evaluate(({ actId, chapterId, missionId, objectiveIndex }) => {
      const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
      const scene = game?.scene.getScene('City') as {
        scene: { restart(data: unknown): void };
      };
      scene?.scene.restart({
        skipResume: true,
        mode: 'story',
        storyProgress: {
          version: 1,
          storyId: 'sindicate-story-mode',
          current: {
            actId,
            chapterId,
            missionId,
            objectiveIndex,
          },
          unlockedChapterIds: ['dead-drop-district', 'spare-parts-gospel', 'static-on-the-hospital-band', 'meter-running', 'precinct-ashes', 'the-switchboard-name', 'freight-union-morning', 'neon-couriers', 'glass-towers-empty-floors'],
          completedChapterIds: [],
          completedMissionIds: [],
          branchOutcomes: {},
        },
      });
    }, {
      actId: entry.actId,
      chapterId: entry.chapter.id,
      missionId: entry.mission.id,
      objectiveIndex,
    });

    const state = await page.waitForFunction((missionId) => {
      const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
      const scene = game?.scene.getScene('City') as {
        world: { mission?: { id: string; title: string } | null };
        hud?: { text: string };
        storyStateText?: { visible: boolean; text: string };
      };
      if (scene?.world?.mission?.id !== missionId) return null;
      return {
        missionId: scene.world.mission?.id ?? null,
        missionTitle: scene.world.mission?.title ?? null,
        hudText: scene.hud?.text ?? '',
        storyStateVisible: !!scene.storyStateText?.visible,
        storyStateText: scene.storyStateText?.text ?? '',
      };
    }, entry.mission.id);

    const value = await state.jsonValue() as {
      missionId: string;
      missionTitle: string;
      hudText: string;
      storyStateVisible: boolean;
      storyStateText: string;
    };

    expect(value.missionId).toBe(entry.mission.id);
    expect(value.missionTitle).toBe(entry.mission.title);
    expect(value.hudText).toContain(entry.mission.title);
    if (entry.mission.prototypeScript) {
      expect(value.storyStateVisible).toBe(true);
      expect(value.storyStateText.length).toBeGreaterThan(0);
    }
  }
});