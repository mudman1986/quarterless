import type { Page } from '@playwright/test';

export interface StoryMissionTarget {
  actId: string;
  chapterId: string;
  missionId: string;
  objectiveIndex: number;
  unlockedChapterIds?: string[];
  completedChapterIds?: string[];
  completedMissionIds?: string[];
  branchOutcomes?: Record<string, string>;
}

interface StoryProgressSnapshotLike {
  current: { actId: string; chapterId: string; missionId: string; objectiveIndex: number } | null;
  completedMissionIds: string[];
  completedChapterIds: string[];
}

interface StoryCompletionResult {
  missionId: string | null;
  panelText: string;
  restarted: boolean;
  progress: StoryProgressSnapshotLike | null;
}

export async function acknowledgeStoryPanel(page: Page): Promise<void> {
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

export async function restartIntoStoryMission(page: Page, target: StoryMissionTarget): Promise<void> {
  await page.evaluate(
    ({
      actId,
      chapterId,
      missionId,
      objectiveIndex,
      unlockedChapterIds,
      completedChapterIds,
      completedMissionIds,
      branchOutcomes,
    }) => {
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
          current: { actId, chapterId, missionId, objectiveIndex },
          unlockedChapterIds: unlockedChapterIds ?? [chapterId],
          completedChapterIds: completedChapterIds ?? [],
          completedMissionIds: completedMissionIds ?? [],
          branchOutcomes: branchOutcomes ?? {},
        },
      });
    },
    target,
  );
}

export async function completeActiveStoryMission(page: Page): Promise<StoryCompletionResult> {
  return page.evaluate(() => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      world: {
        campaign?: {
          missions: Array<{
            currentIndex: number;
            objectives: unknown[];
            objectiveState: unknown;
            status: string;
          }> | null;
          currentIndex: number;
        } | null;
      };
      storyPanel?: { text: string; visible: boolean };
      storyProgress?: StoryProgressSnapshotLike | null;
      pendingStoryRestart?: StoryProgressSnapshotLike | null;
      pendingStoryRestartResume?: boolean;
      syncStoryMissionSummaryBaseline?: () => void;
      handleEvents?: () => void;
      scene: { restart(data: unknown): void };
    };
    if (!scene?.world?.campaign || !scene.storyProgress || typeof scene.handleEvents !== 'function') {
      throw new Error('Missing story mission completion hooks');
    }

    const campaign = scene.world.campaign;
    const missions = campaign.missions;
    const missionId = scene.storyProgress.current?.missionId ?? null;
    if (!missions) {
      throw new Error('Missing story campaign missions');
    }
    const activeMission = missions[campaign.currentIndex];
    if (!activeMission) {
      throw new Error('No active mission to complete');
    }

    scene.syncStoryMissionSummaryBaseline?.();
    activeMission.currentIndex = activeMission.objectives.length;
    activeMission.objectiveState = null;
    activeMission.status = 'completed';
    campaign.currentIndex += 1;
    scene.handleEvents();

    const panelText = scene.storyPanel?.text ?? '';
    const progress = scene.storyProgress
      ? {
          current: scene.storyProgress.current,
          completedMissionIds: [...scene.storyProgress.completedMissionIds],
          completedChapterIds: [...scene.storyProgress.completedChapterIds],
        }
      : null;
    const restarted = !!scene.pendingStoryRestart;
    if (scene.pendingStoryRestart) {
      const nextProgress = scene.pendingStoryRestart;
      const resume = !!scene.pendingStoryRestartResume;
      scene.pendingStoryRestart = null;
      scene.pendingStoryRestartResume = false;
      scene.scene.restart({
        skipResume: !resume,
        mode: 'story',
        storyProgress: nextProgress,
        freshMissionOnResume: resume,
      });
    }

    return { missionId, panelText, restarted, progress } satisfies StoryCompletionResult;
  });
}

export async function waitForStoryProgress(
  page: Page,
  expected: { missionId: string | null; chapterId: string | null; completedMissionId: string },
): Promise<void> {
  await page.waitForFunction(({ missionId, chapterId, completedMissionId }) => {
    const game = (window as unknown as { __game?: { scene: { getScene(name: string): unknown } } }).__game;
    const scene = game?.scene.getScene('City') as {
      storyProgress?: {
        current: { missionId: string; chapterId: string } | null;
        completedMissionIds: string[];
      } | null;
    };
    const progress = scene?.storyProgress;
    if (!progress?.completedMissionIds.includes(completedMissionId)) return false;
    if (missionId === null || chapterId === null) return progress.current === null;
    return progress.current?.missionId === missionId && progress.current?.chapterId === chapterId;
  }, expected);
}
