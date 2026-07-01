import './arcade/arcade.css';
import { startPreviews } from './arcade/previews';
import type { GameRuntime } from './arcade/types';
import { STORY_MODE_PROTOTYPE } from './game/story/storyCampaign';
import {
  clearGameState,
  GAME_STATE_KEY,
  loadGameState,
  MANUAL_SAVE_SLOT_COUNT,
  manualSaveKey,
  saveGameState,
} from './core/gameState';
import {
  clearStoryProgress,
  createStoryProgress,
  currentStoryChapter,
  currentStoryMissionChoices,
  currentStoryMission,
  loadStoryProgress,
  saveStoryProgress,
  selectStoryChapter,
  storyProgressSaveKey,
} from './game/story/storyProgress';
import {
  clearStoryLaunchRequest,
  saveStoryLaunchRequest,
  type StoryLaunchRequest,
} from './game/story/storyLaunchState';
import { loadStoryMissionScorecards } from './game/story/storyMissionScorecards';
import { chapterMissingSystems, formatStorySystem } from './game/story/storyMode';
import { arcadeGames as games, type ArcadeGame, type LaunchMode } from './games/catalog';

let activeGame: GameRuntime | null = null;
let stopPreviews: (() => void) | null = null;

function chapterCards(progress = createStoryProgress(STORY_MODE_PROTOTYPE)): string {
  const currentChapterId = progress.current?.chapterId ?? null;
  return STORY_MODE_PROTOTYPE.acts
    .map((act) => {
      const cards = act.chapters
        .map((chapter) => {
          const unlocked = progress.unlockedChapterIds.includes(chapter.id);
          const completed = progress.completedChapterIds.includes(chapter.id);
          const current = currentChapterId === chapter.id;
          const completedMissionCount = chapter.missions.filter((mission) =>
            progress.completedMissionIds.includes(mission.id),
          ).length;
          const status = completed
            ? 'Completed'
            : current
              ? 'Current lead'
              : unlocked
                ? 'Unlocked'
                : 'Locked';
          return `
            <button
              class="story-chapter-card${unlocked ? '' : ' story-chapter-card--locked'}${current ? ' story-chapter-card--current' : ''}${completed ? ' story-chapter-card--completed' : ''}"
              type="button"
              data-story-chapter="${chapter.id}"
              ${unlocked ? '' : 'disabled'}
              aria-label="${chapter.title}${unlocked ? '' : ' locked'}"
            >
              <span class="story-chapter-node" aria-hidden="true"></span>
              <span class="story-chapter-kicker">Chapter ${chapter.order}</span>
              <span class="story-chapter-title">${chapter.title}</span>
              <span class="story-chapter-copy">${chapter.combinedGoal}</span>
              <span class="story-chapter-meta">${status} • ${completedMissionCount}/${chapter.missions.length} missions</span>
              ${renderTagList(
                chapterMissingSystems(chapter).map(formatStorySystem),
                'story-tag-list story-tag-list--chapter',
                'No tracked systems',
              )}
            </button>`;
        })
        .join('');
      return `
        <section class="story-act-section" aria-label="${act.title}">
          <h3 class="story-act-title">${act.title}</h3>
          <p class="story-act-summary">${act.summary}</p>
          <div class="story-chapter-grid story-chapter-grid--map">
            ${cards}
          </div>
        </section>`;
    })
    .join('');
}

function recapItems(progress = createStoryProgress(STORY_MODE_PROTOTYPE)): string {
  const chapters = STORY_MODE_PROTOTYPE.acts.flatMap((act) => act.chapters);
  const completed = chapters.filter((chapter) => progress.completedChapterIds.includes(chapter.id));
  if (completed.length === 0) {
    return '<li class="story-archive-empty">No completed chapters yet.</li>';
  }
  return completed
    .map(
      (chapter) => `
        <li class="story-archive-item">
          <span class="story-archive-title">${chapter.title}</span>
          <span class="story-archive-copy">${chapter.combinedGoal}</span>
        </li>`,
    )
    .join('');
}

function missionScorecardItems(): string {
  const store = currentGameStore();
  const cards = store ? loadStoryMissionScorecards(store) : [];
  if (cards.length === 0) {
    return '<li class="story-scorecard-empty">No mission scorecards yet.</li>';
  }
  return cards
    .map((card) => {
      const stamp = new Date(card.recordedAt);
      const when = Number.isNaN(stamp.getTime())
        ? ''
        : stamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `
        <li class="story-scorecard-item">
          <span class="story-scorecard-kicker">${card.chapterTitle}${when ? ` • ${when}` : ''}</span>
          <strong class="story-scorecard-title">${card.missionTitle}</strong>
          <span class="story-scorecard-copy story-scorecard-copy--outcome">${card.outcome}</span>
          <div class="story-scorecard-metrics">
            <span class="story-scorecard-metric"><strong>Reward</strong><span>$${card.reward}</span></span>
            <span class="story-scorecard-metric"><strong>Duration</strong><span>${card.durationSeconds}s</span></span>
            <span class="story-scorecard-metric"><strong>Vehicle</strong><span>${card.vehicleConditionText}</span></span>
            <span class="story-scorecard-metric"><strong>Service</strong><span>${card.serviceLaneText}</span></span>
            <span class="story-scorecard-metric"><strong>Faction</strong><span>${card.factionEffectText}</span></span>
            <span class="story-scorecard-metric"><strong>Story</strong><span>${card.unlockText}</span></span>
          </div>
          <span class="story-scorecard-copy">${card.nextText}</span>
          ${renderTagList(
            card.systemsText
              .split('·')
              .map((value) => value.trim())
              .filter(Boolean),
            'story-tag-list story-tag-list--scorecard',
            'No tracked systems',
          )}
        </li>`;
    })
    .join('');
}

function activeConsequenceItems(progress = createStoryProgress(STORY_MODE_PROTOTYPE)): string {
  const entries = Object.entries(progress.branchOutcomes);
  if (entries.length === 0) {
    return '<li class="story-archive-empty">No carried consequences yet.</li>';
  }
  return entries
    .map(
      ([branchId, outcomeId]) => `
        <li class="story-archive-item">
          <span class="story-archive-title">${storyBranchOutcomeTitle(branchId, outcomeId)}</span>
          <span class="story-archive-copy">${branchId}</span>
        </li>`,
    )
    .join('');
}

function storyProgressStore(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function launchProgressStore(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function currentGameStore(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function currentStoryProgress() {
  const store = storyProgressStore();
  return store
    ? (loadStoryProgress(store) ?? createStoryProgress(STORY_MODE_PROTOTYPE))
    : createStoryProgress(STORY_MODE_PROTOTYPE);
}

function primeStoryLaunch(request: StoryLaunchRequest): void {
  const store = launchProgressStore();
  if (!store) return;
  saveStoryLaunchRequest(store, request);
}

type StoryRunOverview = {
  hasAutosave: boolean;
  chapterTitle: string;
  missionTitle: string;
  objectiveText: string;
  scoreText: string;
  choiceTitles: string[];
};

function renderTagList(
  tags: readonly string[],
  className = 'story-tag-list',
  emptyText = 'None',
): string {
  const values = tags.filter((tag) => tag.trim().length > 0);
  if (values.length === 0) {
    return `<span class="${className}"><span class="story-tag">${emptyText}</span></span>`;
  }
  return `<span class="${className}">${values
    .map((tag) => `<span class="story-tag">${tag}</span>`)
    .join('')}</span>`;
}

function storyBranchOutcomeTitle(branchId: string, outcomeId: string): string {
  for (const act of STORY_MODE_PROTOTYPE.acts) {
    for (const chapter of act.chapters) {
      for (const mission of chapter.missions) {
        const variant = mission.variants?.find(
          (entry) => entry.branchId === branchId && entry.outcomeId === outcomeId,
        );
        if (variant?.title) return variant.title;
      }
    }
  }
  return `${branchId}: ${outcomeId}`;
}

const STORY_TOUCH_PREF_KEY = 'sindicate.touchEnabled';

function readTouchPreference(): boolean | null {
  const store = currentGameStore();
  if (!store) return null;
  const raw = store.getItem(STORY_TOUCH_PREF_KEY);
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

function writeTouchPreference(enabled: boolean): void {
  const store = currentGameStore();
  if (!store) return;
  store.setItem(STORY_TOUCH_PREF_KEY, enabled ? '1' : '0');
}

function currentStoryRunOverview(): StoryRunOverview {
  const progress = currentStoryProgress();
  const store = currentGameStore();
  const gameState = store ? loadGameState(store) : null;
  const chapter = currentStoryChapter(STORY_MODE_PROTOTYPE, progress);
  const mission = currentStoryMission(STORY_MODE_PROTOTYPE, progress);
  const choices = currentStoryMissionChoices(STORY_MODE_PROTOTYPE, progress);
  const objectiveText =
    progress.current === null
      ? 'Current slice complete.'
      : choices.length > 0
        ? `Choose a lead: ${choices.map((entry) => entry.title).join(' / ')}`
        : progress.current.objectiveIndex < 0
          ? `Go to the mission marker to start ${mission?.title ?? 'the next mission'}`
          : (mission?.prototypeRuntime?.objectives[progress.current.objectiveIndex]?.description ??
            mission?.primaryGoal ??
            'Resume the investigation.');
  const score = gameState?.world.score.current ?? 0;
  return {
    hasAutosave: !!gameState,
    chapterTitle: chapter?.title ?? 'Story Complete',
    missionTitle: mission?.title ?? (choices.length > 0 ? 'Mission Choice' : 'No Active Mission'),
    objectiveText,
    scoreText: `$${score}`,
    choiceTitles: choices.map((entry) => entry.title),
  };
}

function slotOverview(slot: number): {
  key: string;
  occupied: boolean;
  chapterTitle: string;
  missionTitle: string;
} {
  const store = currentGameStore();
  const key = manualSaveKey(slot);
  if (!store)
    return { key, occupied: false, chapterTitle: 'Empty', missionTitle: 'No save present' };
  const save = loadGameState(store, key);
  const progress = loadStoryProgress(store, storyProgressSaveKey(key));
  const chapter = progress ? currentStoryChapter(STORY_MODE_PROTOTYPE, progress) : null;
  const mission = progress ? currentStoryMission(STORY_MODE_PROTOTYPE, progress) : null;
  return {
    key,
    occupied: !!save,
    chapterTitle: chapter?.title ?? (save ? 'Unknown Chapter' : 'Empty'),
    missionTitle: mission?.title ?? (save ? 'Resume from this slot' : 'No save present'),
  };
}

function copyCurrentRunToSlot(slot: number): boolean {
  const store = currentGameStore();
  if (!store) return false;
  const autosave = loadGameState(store, GAME_STATE_KEY);
  const story = loadStoryProgress(store);
  if (!autosave || !story) return false;
  const key = manualSaveKey(slot);
  saveGameState(store, { world: autosave.world, timeOfDay: autosave.timeOfDay }, key);
  saveStoryProgress(
    store,
    {
      storyId: story.storyId,
      current: story.current,
      unlockedChapterIds: story.unlockedChapterIds,
      completedChapterIds: story.completedChapterIds,
      completedMissionIds: story.completedMissionIds,
      branchOutcomes: story.branchOutcomes,
    },
    storyProgressSaveKey(key),
  );
  return true;
}

function appRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Missing #app root');
  return root;
}

function setBodyMode(mode: 'landing' | 'loading' | 'playing'): void {
  document.body.classList.toggle('is-landing', mode === 'landing');
  document.body.classList.toggle('is-loading', mode === 'loading');
  document.body.classList.toggle('is-playing', mode === 'playing');
}

function stopActiveGame(): void {
  activeGame?.stop();
  activeGame = null;
  delete (window as unknown as { __game?: unknown }).__game;
}

function syncLaunchQuery(mode?: LaunchMode): void {
  const url = new URL(window.location.href);
  if (mode === 'story') {
    url.searchParams.set('mode', 'story');
    url.searchParams.set('story', '1');
  } else {
    url.searchParams.delete('mode');
    url.searchParams.delete('story');
  }
  window.history.replaceState({}, '', url);
}

function launchButtons(game: ArcadeGame): string {
  const options = game.launchOptions ?? [
    {
      label: `Play ${game.title}`,
      mode: (game.id === 'sindicate' ? 'story' : 'sandbox') as LaunchMode,
    },
  ];
  const stacked = options.length > 1 ? ' play-actions--stacked' : '';
  return `
    <div class="play-actions${stacked}">
      ${options
        .map(
          (option) => `
        <button
          class="play-button${option.mode === 'story' ? ' play-button--secondary' : ''}"
          type="button"
          data-play="${game.id}"
          data-mode="${option.mode}"
          aria-label="${option.label}"
        >
          ${option.label}
        </button>`,
        )
        .join('')}
    </div>`;
}

function gameCard(game: ArcadeGame): string {
  return `
    <article class="game-card" style="--accent: ${game.accent}">
      <div class="preview-wrap">
        <canvas class="game-preview" data-preview="${game.id}" aria-hidden="true"></canvas>
        ${game.badge ? `<span class="preview-badge">${game.badge}</span>` : ''}
      </div>
      <div class="game-card-body">
        <h2>${game.title}</h2>
        <p>${game.description}</p>
        ${launchButtons(game)}
      </div>
    </article>`;
}

function renderLanding(): void {
  syncLaunchQuery();
  const launchStore = launchProgressStore();
  if (launchStore) clearStoryLaunchRequest(launchStore);
  stopActiveGame();
  stopPreviews?.();
  setBodyMode('landing');
  const root = appRoot();
  root.innerHTML = `
    <main class="arcade-page">
      <div class="arcade-inner">
        <header class="arcade-topbar">
          <div>
            <h1 class="arcade-title">Retro Arcade</h1>
          </div>
        </header>
        <section class="game-grid" aria-label="Game selection">
          ${games.map(gameCard).join('')}
        </section>
      </div>
    </main>`;

  stopPreviews = startPreviews(root);
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-play]')) {
    button.addEventListener('click', () => {
      const selected = games.find((game) => game.id === button.dataset.play);
      const mode = button.dataset.mode === 'story' ? 'story' : 'sandbox';
      if (!selected) return;
      if (selected.id === 'sindicate') {
        renderStoryMenu(selected);
        return;
      }
      void launchGame(selected, mode);
    });
  }
}

function renderStoryMenu(game: ArcadeGame): void {
  stopPreviews?.();
  stopPreviews = null;
  stopActiveGame();
  setBodyMode('landing');
  const progress = currentStoryProgress();
  const currentChapter = currentStoryChapter(STORY_MODE_PROTOTYPE, progress);
  const run = currentStoryRunOverview();
  const slots = Array.from({ length: MANUAL_SAVE_SLOT_COUNT }, (_, index) =>
    slotOverview(index + 1),
  );
  const touchEnabled = readTouchPreference() !== false;
  const root = appRoot();
  root.innerHTML = `
    <main class="arcade-page" aria-label="Story mode selection">
      <div class="arcade-inner">
        <header class="arcade-topbar">
          <div>
            <h1 class="arcade-title">Story Mode</h1>
            <p class="story-menu-copy">Choose where Rook's investigation continues. Pause now routes here instead of opening a separate in-game overlay.</p>
          </div>
        </header>
        <section class="story-menu-grid story-menu-grid--integrated">
          <article class="story-menu-panel story-menu-panel--primary">
            <h2>Sindicate Story</h2>
            <p>${STORY_MODE_PROTOTYPE.premise}</p>
            <div class="play-actions play-actions--stacked">
              <button class="play-button" type="button" data-story-action="resume">
                ${run.hasAutosave ? 'Resume Current Run' : progress.completedChapterIds.length === 0 && progress.current?.chapterId === 'dead-drop-district' ? 'Start Story' : 'Continue Story'}
              </button>
              <button class="play-button play-button--secondary" type="button" data-story-action="checkpoint">
                Restart From Story Checkpoint
              </button>
              <button class="play-button play-button--secondary" type="button" data-story-action="new">
                New Story
              </button>
              <button class="play-button play-button--secondary" type="button" data-story-touch>
                Touch Controls: ${touchEnabled ? 'ON' : 'OFF'}
              </button>
              <button class="play-button play-button--secondary" type="button" data-story-action="back">
                Back to Arcade
              </button>
            </div>
            <p class="story-menu-status">Current chapter: ${currentChapter?.title ?? 'Dead Drop District'}</p>
            <p class="story-menu-status">Unlocked chapters: ${progress.unlockedChapterIds.length}/${STORY_MODE_PROTOTYPE.acts.flatMap((act) => act.chapters).length}</p>
          </article>
          <section class="story-menu-panel" aria-label="Current run">
            <h2>Current Run</h2>
            <div class="story-run-card">
              <span class="story-run-kicker">${run.hasAutosave ? 'Live Autosave Ready' : 'Story Checkpoint Ready'}</span>
              <strong class="story-run-title">${run.chapterTitle}</strong>
              <span class="story-run-mission">${run.missionTitle}</span>
              <span class="story-run-copy">${run.objectiveText}</span>
              <span class="story-run-meta">Run score: ${run.scoreText}</span>
              ${run.choiceTitles.length > 0 ? `<span class="story-run-meta">Open leads: ${run.choiceTitles.join(' / ')}</span>` : ''}
            </div>
            <div class="story-slot-grid" aria-label="Manual save slots">
              ${slots
                .map(
                  (slot, index) => `
                    <article class="story-slot-card${slot.occupied ? '' : ' story-slot-card--empty'}">
                      <span class="story-slot-kicker">Slot ${index + 1}</span>
                      <strong class="story-slot-title">${slot.chapterTitle}</strong>
                      <span class="story-slot-copy">${slot.missionTitle}</span>
                      <div class="play-actions play-actions--stacked">
                        <button class="play-button play-button--secondary" type="button" data-story-slot-save="${index + 1}" ${run.hasAutosave ? '' : 'disabled'}>
                          Save Current Run
                        </button>
                        <button class="play-button play-button--secondary" type="button" data-story-slot-load="${index + 1}" ${slot.occupied ? '' : 'disabled'}>
                          Load Slot ${index + 1}
                        </button>
                      </div>
                    </article>`,
                )
                .join('')}
            </div>
            <div class="story-scorecard-block" aria-label="Active consequences">
              <h3>Active Consequences</h3>
              <ul class="story-archive-list">
                ${activeConsequenceItems(progress)}
              </ul>
            </div>
            <div class="story-scorecard-block" aria-label="Recent mission scorecards">
              <h3>Recent Scorecards</h3>
              <ul class="story-scorecard-list">
                ${missionScorecardItems()}
              </ul>
            </div>
          </section>
          <section class="story-menu-panel" aria-label="Unlocked chapters">
            <h2>Chapter Map</h2>
            ${chapterCards(progress)}
          </section>
          <section class="story-menu-panel" aria-label="Recap archive">
            <h2>Recap Archive</h2>
            <ul class="story-archive-list">
              ${recapItems(progress)}
            </ul>
          </section>
        </section>
      </div>
    </main>`;

  root
    .querySelector<HTMLButtonElement>('[data-story-action="resume"]')
    ?.addEventListener('click', () => {
      const launchStore = launchProgressStore();
      if (launchStore) clearStoryLaunchRequest(launchStore);
      void launchGame(game, 'story');
    });
  root
    .querySelector<HTMLButtonElement>('[data-story-action="checkpoint"]')
    ?.addEventListener('click', () => {
      primeStoryLaunch({ mode: 'story', skipResume: true, storyProgress: progress });
      void launchGame(game, 'story');
    });
  root
    .querySelector<HTMLButtonElement>('[data-story-action="new"]')
    ?.addEventListener('click', () => {
      const fresh = createStoryProgress(STORY_MODE_PROTOTYPE);
      const store = currentGameStore();
      if (store) {
        clearGameState(store);
        clearStoryProgress(store);
      }
      primeStoryLaunch({ mode: 'story', skipResume: true, storyProgress: fresh });
      void launchGame(game, 'story');
    });
  root
    .querySelector<HTMLButtonElement>('[data-story-action="back"]')
    ?.addEventListener('click', renderLanding);
  root.querySelector<HTMLButtonElement>('[data-story-touch]')?.addEventListener('click', () => {
    writeTouchPreference(!touchEnabled);
    renderStoryMenu(game);
  });
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-story-chapter]')) {
    button.addEventListener('click', () => {
      const chapterId = button.dataset.storyChapter;
      if (!chapterId) return;
      const selected = selectStoryChapter(STORY_MODE_PROTOTYPE, progress, chapterId);
      primeStoryLaunch({ mode: 'story', skipResume: true, storyProgress: selected });
      void launchGame(game, 'story');
    });
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-story-slot-save]')) {
    button.addEventListener('click', () => {
      const slot = Number(button.dataset.storySlotSave);
      if (!copyCurrentRunToSlot(slot)) return;
      renderStoryMenu(game);
    });
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-story-slot-load]')) {
    button.addEventListener('click', () => {
      const slot = Number(button.dataset.storySlotLoad);
      const slotState = slotOverview(slot);
      if (!slotState.occupied) return;
      primeStoryLaunch({ mode: 'story', loadSaveKey: slotState.key });
      void launchGame(game, 'story');
    });
  }
}

function renderLoading(game: ArcadeGame, mode: LaunchMode): void {
  setBodyMode('loading');
  appRoot().innerHTML = `
    <main class="loading-screen" aria-live="polite">
      <div class="loading-panel">
        <h1>Loading ${mode === 'story' ? `${game.title} Story Mode` : game.title}</h1>
        <div class="loading-bar" aria-hidden="true"></div>
      </div>
    </main>`;
}

function renderError(message: string): void {
  setBodyMode('landing');
  const root = appRoot();
  root.innerHTML = `
    <main class="error-screen">
      <div class="error-panel">
        <h1>Game failed to load</h1>
        <p>${message}</p>
        <button class="retry-button" type="button">Back to arcade</button>
      </div>
    </main>`;
  root.querySelector<HTMLButtonElement>('.retry-button')?.addEventListener('click', renderLanding);
}

async function launchGame(game: ArcadeGame, mode: LaunchMode = 'sandbox'): Promise<void> {
  stopPreviews?.();
  stopPreviews = null;
  stopActiveGame();
  syncLaunchQuery(game.id === 'sindicate' ? mode : undefined);
  renderLoading(game, mode);

  try {
    const module = await game.load();
    setBodyMode('playing');
    const returnToMenu = game.id === 'sindicate' ? () => renderStoryMenu(game) : renderLanding;
    const root = appRoot();
    root.innerHTML = `
      <main class="game-shell" style="--accent: ${game.accent}">
        <button class="arcade-back" type="button" aria-label="${game.id === 'sindicate' ? 'Back to Sindicate menu' : 'Back to arcade'}">${game.id === 'sindicate' ? 'Sindicate Menu' : 'Arcade'}</button>
        <div id="game" class="game-stage"></div>
      </main>`;
    root.querySelector<HTMLButtonElement>('.arcade-back')?.addEventListener('click', returnToMenu);
    const stage = root.querySelector<HTMLElement>('#game');
    if (!stage) throw new Error('Missing game stage');
    activeGame = module.startGame(stage, returnToMenu);
  } catch (error) {
    renderError(error instanceof Error ? error.message : 'Unknown error');
  }
}

const scheduleBoot = (): void => {
  window.requestAnimationFrame(renderLanding);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleBoot, { once: true });
} else {
  scheduleBoot();
}
