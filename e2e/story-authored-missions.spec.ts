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

const scriptedRouteVehicleCases = [
  {
    actId: 'find-the-missing-dispatcher',
    chapterId: 'dead-drop-district',
    missionId: 'false-ambulance',
    actorId: 'false-ambulance-van',
  },
  {
    actId: 'find-the-missing-dispatcher',
    chapterId: 'precinct-ashes',
    missionId: 'suspect-carousel',
    actorId: 'framed-convoy-car',
  },
] as const;

async function restartIntoStoryMission(
  page: import('@playwright/test').Page,
  target: { actId: string; chapterId: string; missionId: string; objectiveIndex: number },
): Promise<void> {
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
  }, target);
}

async function acknowledgeStoryPanel(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      acknowledgeStoryPanel?: () => void;
    };
    scene?.acknowledgeStoryPanel?.();
  });
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      paused: boolean;
      storyPanel?: { visible: boolean };
    };
    return scene?.paused === false && !scene?.storyPanel?.visible;
  });
}

async function forceStoryMissionRuntimeState(
  page: import('@playwright/test').Page,
  update: { missionId: string; currentIndex?: number; routeCompleted?: number },
): Promise<void> {
  await page.evaluate(({ missionId, currentIndex, routeCompleted }) => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        mission?: {
          id: string;
          currentIndex: number;
          objectiveState?: { kind: 'route'; completed: number } | null;
          status: string;
        } | null;
      };
      syncStoryScript?: (dt?: number) => void;
    };
    if (!scene?.world?.mission || scene.world.mission.id !== missionId) {
      throw new Error(`Mission ${missionId} is not active`);
    }
    if (currentIndex !== undefined) {
      scene.world.mission.currentIndex = currentIndex;
    }
    if (routeCompleted !== undefined) {
      scene.world.mission.objectiveState = { kind: 'route', completed: routeCompleted };
    }
    scene.syncStoryScript?.(0);
  }, update);
}

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
    const objectiveIndex = entry.mission.prototypeScript ? 0 : -1;
    await restartIntoStoryMission(page, {
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

test('scripted route vehicles advance instead of snapping back to their spawn point', async ({ page }) => {
  await launchSindicate(page);

  for (const target of scriptedRouteVehicleCases) {
    await restartIntoStoryMission(page, { ...target, objectiveIndex: 0 });
    await acknowledgeStoryPanel(page);

    const initial = await page.waitForFunction(({ missionId, actorId }) => {
      const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
      const scene = game?.scene.getScene('City') as {
        storyScript?: { actorCarIndices: Record<string, number> } | null;
        world: { mission?: { id: string } | null; cars: Array<{ pos: { x: number; y: number } }> };
      };
      if (scene?.world?.mission?.id !== missionId) return null;
      const carIndex = scene.storyScript?.actorCarIndices?.[actorId];
      if (carIndex === undefined) return null;
      const car = scene.world.cars[carIndex];
      return car ? { x: car.pos.x, y: car.pos.y } : null;
    }, target);

    const start = (await initial.jsonValue()) as { x: number; y: number };

    const moved = await page.waitForFunction(
      ({ missionId, actorId, start }) => {
        const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
        const scene = game?.scene.getScene('City') as {
          storyScript?: { actorCarIndices: Record<string, number> } | null;
          world: { mission?: { id: string } | null; cars: Array<{ pos: { x: number; y: number } }> };
        };
        if (scene?.world?.mission?.id !== missionId) return null;
        const carIndex = scene.storyScript?.actorCarIndices?.[actorId];
        if (carIndex === undefined) return null;
        const car = scene.world.cars[carIndex];
        if (!car) return null;
        const dx = car.pos.x - start.x;
        const dy = car.pos.y - start.y;
        return Math.hypot(dx, dy) > 8 ? { x: car.pos.x, y: car.pos.y } : null;
      },
      { missionId: target.missionId, actorId: target.actorId, start },
      { timeout: 3000 },
    );

    expect(await moved.jsonValue()).not.toBeNull();
  }
});

test('dead drop district missions expose scripted stage shifts for route and objective progress', async ({
  page,
}) => {
  await launchSindicate(page);

  await restartIntoStoryMission(page, {
    actId: 'find-the-missing-dispatcher',
    chapterId: 'dead-drop-district',
    missionId: 'burned-locker',
    objectiveIndex: 0,
  });
  await acknowledgeStoryPanel(page);
  await forceStoryMissionRuntimeState(page, { missionId: 'burned-locker', routeCompleted: 1 });
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      storyPanel?: { visible: boolean; text: string };
      storyStateText?: { text: string };
    };
    return (
      !!scene?.storyPanel?.visible &&
      scene.storyPanel.text.includes('STAGE SHIFT') &&
      scene.storyPanel.text.includes('Beat the middle sweep') &&
      scene.storyStateText?.text.includes('The middle lockers are pulling the response inward')
    );
  });

  await restartIntoStoryMission(page, {
    actId: 'find-the-missing-dispatcher',
    chapterId: 'dead-drop-district',
    missionId: 'last-call-at-pier-9',
    objectiveIndex: 0,
  });
  await acknowledgeStoryPanel(page);
  await forceStoryMissionRuntimeState(page, { missionId: 'last-call-at-pier-9', currentIndex: 2 });
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      storyPanel?: { visible: boolean; text: string };
      storyStateText?: { text: string };
    };
    return (
      !!scene?.storyPanel?.visible &&
      scene.storyPanel.text.includes('STAGE SHIFT') &&
      scene.storyPanel.text.includes('Clear the office cleaners') &&
      scene.storyStateText?.text.includes('The evidence room is live and the cleaners are holding the badge')
    );
  });
});