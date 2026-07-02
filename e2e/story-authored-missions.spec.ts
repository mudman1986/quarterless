import { expect, test } from '@playwright/test';
import { launchSindicate } from './helpers';
import {
  acknowledgeStoryPanel,
  completeActiveStoryMission,
  restartIntoStoryMission,
  waitForStoryProgress,
} from './storyTestHelpers';
import { STORY_MODE_PROTOTYPE } from '../src/game/story/storyCampaign';
import {
  completeStoryMission,
  type StoryProgressSnapshot,
} from '../src/game/story/storyProgress';

const authoredMissions = STORY_MODE_PROTOTYPE.acts.flatMap((act) =>
  act.chapters.flatMap((chapter) =>
    chapter.missions
      .filter((mission) => mission.prototypeRuntime)
      .map((mission) => ({ actId: act.id, chapter, mission })),
  ),
);
const chapterSequence = STORY_MODE_PROTOTYPE.acts.flatMap((act) => act.chapters);

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

type AuthoredMissionEntry = (typeof authoredMissions)[number];

function storyProgressForMission(entry: AuthoredMissionEntry): StoryProgressSnapshot {
  const chapterIndex = chapterSequence.findIndex((chapter) => chapter.id === entry.chapter.id);
  const earlierChapters = chapterSequence.slice(0, chapterIndex);
  const missionIndex = entry.chapter.missions.findIndex((mission) => mission.id === entry.mission.id);
  return {
    version: 1,
    storyId: STORY_MODE_PROTOTYPE.id,
    current: {
      actId: entry.actId,
      chapterId: entry.chapter.id,
      missionId: entry.mission.id,
      objectiveIndex: entry.mission.prototypeScript ? 0 : -1,
    },
    unlockedChapterIds: chapterSequence.slice(0, chapterIndex + 1).map((chapter) => chapter.id),
    completedChapterIds: earlierChapters.map((chapter) => chapter.id),
    completedMissionIds: [
      ...earlierChapters.flatMap((chapter) => chapter.missions.map((mission) => mission.id)),
      ...entry.chapter.missions.slice(0, missionIndex).map((mission) => mission.id),
    ],
    branchOutcomes: {},
  };
}

const missionCompletionCases = authoredMissions.map((entry) => {
  const startProgress = storyProgressForMission(entry);
  return {
    entry,
    startProgress,
    expectedProgress: completeStoryMission(STORY_MODE_PROTOTYPE, startProgress, entry.mission.id),
  };
});

async function forceStoryMissionRuntimeState(
  page: import('@playwright/test').Page,
  update: { missionId: string; currentIndex?: number; routeCompleted?: number },
): Promise<{
  bannerVisible: boolean;
  bannerText: string;
  panelVisible: boolean;
  panelText: string;
}> {
  return page.evaluate(({ missionId, currentIndex, routeCompleted }) => {
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
      banner?: { visible: boolean; text: string };
      storyPanel?: { visible: boolean; text: string };
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
    scene.syncStoryScript?.(0);
    return {
      bannerVisible: !!scene.banner?.visible,
      bannerText: scene.banner?.text ?? '',
      panelVisible: !!scene.storyPanel?.visible,
      panelText: scene.storyPanel?.text ?? '',
    };
  }, update);
}

async function movePlayerToActiveObjectiveTarget(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        player: { pos: { x: number; y: number } };
        drivingCarIndex: number | null;
        cars: Array<{ pos: { x: number; y: number } }>;
        mission?: {
          currentIndex: number;
          objectives: Array<
            | { kind: 'reach' | 'defend'; target: { x: number; y: number } }
            | { kind: 'route'; targets: Array<{ x: number; y: number }> }
          >;
          objectiveState?: { kind: 'route'; completed: number } | null;
        } | null;
      };
    };
    const mission = scene?.world.mission;
    if (!scene || !mission) throw new Error('Missing active mission');
    const objective = mission.objectives[mission.currentIndex];
    if (!objective) throw new Error('Missing active objective');
    const target =
      objective.kind === 'route'
        ? objective.targets[mission.objectiveState?.kind === 'route' ? mission.objectiveState.completed : 0]
        : objective.target;
    if (!target) throw new Error('Missing active target');
    scene.world.player.pos = { x: target.x, y: target.y };
    if (scene.world.drivingCarIndex !== null && scene.world.cars[scene.world.drivingCarIndex]) {
      scene.world.cars[scene.world.drivingCarIndex] = {
        ...scene.world.cars[scene.world.drivingCarIndex]!,
        pos: { x: target.x, y: target.y },
      };
    }
  });
}

async function shadowStoryActor(
  page: import('@playwright/test').Page,
  actorId: string,
  offset = { x: -20, y: -12 },
): Promise<void> {
  await page.evaluate(
    ({ actorId, offset }) => {
      const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
      const scene = game?.scene.getScene('City') as {
        storyScript?: { actorCarIndices: Record<string, number> } | null;
        world: {
          player: { pos: { x: number; y: number } };
          drivingCarIndex: number | null;
          cars: Array<{ pos: { x: number; y: number } }>;
        };
      };
      const carIndex = scene?.storyScript?.actorCarIndices[actorId];
      const actorPos = carIndex !== undefined ? scene.world.cars[carIndex]?.pos : null;
      if (!scene || !actorPos) throw new Error(`Missing actor ${actorId}`);
      const nextPos = { x: actorPos.x + offset.x, y: actorPos.y + offset.y };
      scene.world.player.pos = nextPos;
      if (scene.world.drivingCarIndex !== null && scene.world.cars[scene.world.drivingCarIndex]) {
        scene.world.cars[scene.world.drivingCarIndex] = {
          ...scene.world.cars[scene.world.drivingCarIndex]!,
          pos: nextPos,
        };
      }
    },
    { actorId, offset },
  );
}

async function storyPedActorState(
  page: import('@playwright/test').Page,
  actorId: string,
): Promise<{
  missionId: string | null;
  objectiveKind: string | null;
  actorCount: number;
  missionTargetCount: number;
}> {
  return page.evaluate((targetActorId) => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        mission?: {
          id: string;
          currentIndex: number;
          objectives: Array<{ kind: string }>;
        } | null;
        pedestrians: Array<{ storyActorId?: string; missionTarget?: boolean }>;
      };
    };
    const mission = scene?.world.mission ?? null;
    const actorPeds = scene?.world.pedestrians.filter((ped) => ped.storyActorId === targetActorId) ?? [];
    return {
      missionId: mission?.id ?? null,
      objectiveKind: mission ? mission.objectives[mission.currentIndex]?.kind ?? null : null,
      actorCount: actorPeds.length,
      missionTargetCount: actorPeds.filter((ped) => ped.missionTarget).length,
    };
  }, actorId);
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
    const progress = storyProgressForMission(entry);
    await restartIntoStoryMission(page, {
      actId: entry.actId,
      chapterId: entry.chapter.id,
      missionId: entry.mission.id,
      objectiveIndex: progress.current!.objectiveIndex,
      unlockedChapterIds: progress.unlockedChapterIds,
      completedChapterIds: progress.completedChapterIds,
      completedMissionIds: progress.completedMissionIds,
      branchOutcomes: progress.branchOutcomes,
    });

    const state = await page.waitForFunction((missionId) => {
      const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
      const scene = game?.scene.getScene('City') as {
        world: { mission?: { id: string; title: string } | null };
        hud?: { text: string };
      };
      if (scene?.world?.mission?.id !== missionId) return null;
      return {
        missionId: scene.world.mission?.id ?? null,
        missionTitle: scene.world.mission?.title ?? null,
        hudText: scene.hud?.text ?? '',
      };
    }, entry.mission.id);

    const value = (await state.jsonValue()) as {
      missionId: string;
      missionTitle: string;
      hudText: string;
    };

    expect(value.missionId).toBe(entry.mission.id);
    expect(value.missionTitle).toBe(entry.mission.title);
    expect(value.hudText).not.toContain(entry.mission.title);
  }
});

for (const { entry, expectedProgress, startProgress } of missionCompletionCases) {
  test(`authored mission ${entry.chapter.id}/${entry.mission.id} can finish and advance story state`, async ({
    page,
  }) => {
    await launchSindicate(page);
    await restartIntoStoryMission(page, {
      actId: entry.actId,
      chapterId: entry.chapter.id,
      missionId: entry.mission.id,
      objectiveIndex: startProgress.current!.objectiveIndex,
      unlockedChapterIds: startProgress.unlockedChapterIds,
      completedChapterIds: startProgress.completedChapterIds,
      completedMissionIds: startProgress.completedMissionIds,
      branchOutcomes: startProgress.branchOutcomes,
    });
    await acknowledgeStoryPanel(page);

    const completion = await completeActiveStoryMission(page);

    expect(completion.missionId).toBe(entry.mission.id);
    expect(completion.progress?.completedMissionIds).toContain(entry.mission.id);

    if (expectedProgress.current) {
      if (expectedProgress.current.chapterId === entry.chapter.id) {
        expect(/MISSION SUMMARY|MISSION COMPLETE/.test(completion.panelText)).toBe(true);
      } else {
        expect(completion.panelText).toContain('CHAPTER COMPLETE');
      }
    } else {
      expect(completion.panelText).toContain('STORY COMPLETE');
    }

    await waitForStoryProgress(page, {
      missionId: expectedProgress.current?.missionId ?? null,
      chapterId: expectedProgress.current?.chapterId ?? null,
      completedMissionId: entry.mission.id,
    });
  });
}

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
  const burnedLockerShift = await forceStoryMissionRuntimeState(page, {
    missionId: 'burned-locker',
    routeCompleted: 1,
  });
  expect(burnedLockerShift.bannerVisible).toBe(true);
  expect(burnedLockerShift.bannerText).toContain('STAGE SHIFT');
  expect(burnedLockerShift.bannerText).toContain('Beat the middle sweep');

  await restartIntoStoryMission(page, {
    actId: 'find-the-missing-dispatcher',
    chapterId: 'dead-drop-district',
    missionId: 'last-call-at-pier-9',
    objectiveIndex: 0,
  });
  await acknowledgeStoryPanel(page);
  const pierShift = await forceStoryMissionRuntimeState(page, {
    missionId: 'last-call-at-pier-9',
    currentIndex: 2,
  });
  expect(pierShift.bannerVisible).toBe(true);
  expect(pierShift.bannerText).toContain('STAGE SHIFT');
  expect(pierShift.bannerText).toContain('Clear the office cleaners');
});

test('live route objectives advance through authored checkpoints without forced completion hooks', async ({
  page,
}) => {
  await launchSindicate(page);
  await restartIntoStoryMission(page, {
    actId: 'find-the-missing-dispatcher',
    chapterId: 'dead-drop-district',
    missionId: 'burned-locker',
    objectiveIndex: 0,
    unlockedChapterIds: ['dead-drop-district'],
    completedMissionIds: ['night-ferry-run'],
  });
  await acknowledgeStoryPanel(page);

  for (const expectedCompleted of [1, 2]) {
    await movePlayerToActiveObjectiveTarget(page);
    await page.waitForFunction(
      (expected) => {
        const game = (
          window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }
        ).__game;
        const scene = game?.scene.getScene('City') as {
          world: { mission?: { objectiveState?: { kind: 'route'; completed: number } | null } | null };
        };
        return scene?.world.mission?.objectiveState?.kind === 'route'
          ? scene.world.mission.objectiveState.completed === expected
          : false;
      },
      expectedCompleted,
    );
  }

  await movePlayerToActiveObjectiveTarget(page);
  await waitForStoryProgress(page, {
    missionId: 'wreck-before-dawn',
    chapterId: 'dead-drop-district',
    completedMissionId: 'burned-locker',
  });
});

test('live scripted capture pressure builds from actor proximity instead of direct state mutation', async ({
  page,
}) => {
  await launchSindicate(page);
  await restartIntoStoryMission(page, {
    actId: 'court-the-citys-middle-powers',
    chapterId: 'glass-towers-empty-floors',
    missionId: 'lobby-flood',
    objectiveIndex: 1,
    unlockedChapterIds: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
      'meter-running',
      'precinct-ashes',
      'the-switchboard-name',
      'freight-union-morning',
      'neon-couriers',
      'glass-towers-empty-floors',
    ],
    completedMissionIds: ['tenant-warning', 'window-tax'],
    completedChapterIds: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
      'meter-running',
      'precinct-ashes',
      'the-switchboard-name',
      'freight-union-morning',
      'neon-couriers',
    ],
  });
  await acknowledgeStoryPanel(page);
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      storyScript?: { stageIndex: number; actorCarIndices: Record<string, number> } | null;
    };
    return (
      scene?.storyScript?.stageIndex === 1 &&
      scene.storyScript.actorCarIndices['broker-sedan'] !== undefined
    );
  });

  for (let i = 0; i < 12; i++) {
    await shadowStoryActor(page, 'broker-sedan');
    await page.waitForTimeout(250);
  }

  const captureSeconds = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      storyScript?: { captureSeconds: number } | null;
    };
    return scene?.storyScript?.captureSeconds ?? 0;
  });
  expect(captureSeconds).toBeGreaterThan(0.75);
});

test('eliminate-story squads stay out of the marker until the eliminate objective actually starts', async ({
  page,
}) => {
  await launchSindicate(page);
  await restartIntoStoryMission(page, {
    actId: 'court-the-citys-middle-powers',
    chapterId: 'freight-union-morning',
    missionId: 'picket-line-breaker',
    objectiveIndex: -1,
    unlockedChapterIds: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
      'meter-running',
      'precinct-ashes',
      'the-switchboard-name',
      'freight-union-morning',
    ],
    completedMissionIds: ['union-test-run'],
    completedChapterIds: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
      'meter-running',
      'precinct-ashes',
      'the-switchboard-name',
    ],
  });
  await acknowledgeStoryPanel(page);

  expect(await storyPedActorState(page, 'picket-blockers')).toEqual({
    missionId: 'picket-line-breaker',
    objectiveKind: 'reach',
    actorCount: 0,
    missionTargetCount: 0,
  });

  await movePlayerToActiveObjectiveTarget(page);
  await movePlayerToActiveObjectiveTarget(page);
  await page.waitForFunction(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      world: { mission?: { objectives: Array<{ kind: string }>; currentIndex: number } | null };
    };
    return scene?.world.mission?.objectives[scene.world.mission.currentIndex]?.kind === 'eliminate';
  });

  expect(await storyPedActorState(page, 'picket-blockers')).toEqual({
    missionId: 'picket-line-breaker',
    objectiveKind: 'eliminate',
    actorCount: 4,
    missionTargetCount: 4,
  });
});

test('Wreck Before Dawn uses a 15 second objective banner window after the eliminate stage', async ({
  page,
}) => {
  await launchSindicate(page);
  await restartIntoStoryMission(page, {
    actId: 'find-the-missing-dispatcher',
    chapterId: 'dead-drop-district',
    missionId: 'wreck-before-dawn',
    objectiveIndex: 1,
    unlockedChapterIds: ['dead-drop-district'],
    completedMissionIds: ['night-ferry-run', 'burned-locker'],
  });
  await acknowledgeStoryPanel(page);

  const bannerState = await page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        registerKill?: (kind: 'pedestrian' | 'police', missionTarget?: boolean) => void;
        addCorpse?: (pos: { x: number; y: number }) => void;
        missionObjective?: { description: string } | null;
      };
      storyScript?: { stageIndex: number } | null;
      banner?: { visible: boolean; text: string };
      announceRemaining?: number;
      update: (time: number, deltaMs: number) => void;
    };
    if (!scene?.world.registerKill || !scene.world.addCorpse) {
      throw new Error('Missing mission transition hooks');
    }

    for (let i = 0; i < 4; i++) {
      scene.world.registerKill('pedestrian', true);
      scene.world.addCorpse({ x: 2368 + i * 8, y: 1088 });
    }
    for (let i = 0; i < 120 && scene.storyScript?.stageIndex !== 2; i++) {
      scene.update(i * 16.7, 16.7);
    }

    const text = scene.banner?.text ?? '';
    const initialSeconds = scene.announceRemaining ?? 0;

    for (let i = 0; i < Math.ceil(14 / 0.1); i++) scene.update(i * 100, 100);
    const visibleAt14Seconds = !!scene.banner?.visible;
    for (let i = 0; i < Math.ceil(2 / 0.1); i++) scene.update((i + 200) * 100, 100);

    return {
      text,
      initialSeconds,
      visibleAt14Seconds,
      visibleAt16Seconds: !!scene.banner?.visible,
    };
  });

  expect(bannerState.text).toBe('Hold the roadblock for 10 seconds and get clear');
  expect(bannerState.initialSeconds).toBeCloseTo(15, 1);
  expect(bannerState.visibleAt14Seconds).toBe(true);
  expect(bannerState.visibleAt16Seconds).toBe(false);
});

test('story actor pools stay bounded as scripted missions advance across a live chapter sequence', async ({
  page,
}) => {
  await launchSindicate(page);
  await restartIntoStoryMission(page, {
    actId: 'court-the-citys-middle-powers',
    chapterId: 'freight-union-morning',
    missionId: 'harbor-echo',
    objectiveIndex: 0,
    unlockedChapterIds: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
      'meter-running',
      'precinct-ashes',
      'the-switchboard-name',
      'freight-union-morning',
    ],
    completedMissionIds: ['union-test-run', 'picket-line-breaker'],
    completedChapterIds: [
      'dead-drop-district',
      'spare-parts-gospel',
      'static-on-the-hospital-band',
      'meter-running',
      'precinct-ashes',
      'the-switchboard-name',
    ],
    branchOutcomes: { 'double-booking': 'save-passenger-a' },
  });
  await acknowledgeStoryPanel(page);

  const worldCounts = () =>
    page.evaluate(() => {
      const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
      const scene = game?.scene.getScene('City') as {
        world: { cars: unknown[]; pedestrians: unknown[]; mission?: { id: string } | null };
      };
      return {
        missionId: scene?.world.mission?.id ?? null,
        cars: scene?.world.cars.length ?? 0,
        pedestrians: scene?.world.pedestrians.length ?? 0,
      };
    });

  const harborCounts = await worldCounts();
  await completeActiveStoryMission(page);
  await waitForStoryProgress(page, {
    missionId: 'crane-jam',
    chapterId: 'freight-union-morning',
    completedMissionId: 'harbor-echo',
  });
  await acknowledgeStoryPanel(page);
  const craneCounts = await worldCounts();

  await completeActiveStoryMission(page);
  await waitForStoryProgress(page, {
    missionId: 'the-long-manifest',
    chapterId: 'freight-union-morning',
    completedMissionId: 'crane-jam',
  });
  await acknowledgeStoryPanel(page);
  const manifestCounts = await worldCounts();

  expect(harborCounts.missionId).toBe('harbor-echo');
  expect(craneCounts.missionId).toBe('crane-jam');
  expect(manifestCounts.missionId).toBe('the-long-manifest');
  expect(craneCounts.cars).toBe(harborCounts.cars);
  expect(manifestCounts.cars).toBe(harborCounts.cars);
  expect(manifestCounts.pedestrians).toBeLessThanOrEqual(harborCounts.pedestrians + 1);
});
