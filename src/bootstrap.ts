import './arcade/arcade.css';
import { startPreviews } from './arcade/previews';
import type { GameRuntime, GameStarter } from './arcade/types';
import { STORY_MODE_PROTOTYPE } from './game/story/deadDropDistrict';
import {
  clearStoryProgress,
  createStoryProgress,
  loadStoryProgress,
  saveStoryProgress,
  selectStoryChapter,
  STORY_LAUNCH_PROGRESS_KEY,
} from './game/story/storyProgress';

type LaunchMode = 'sandbox' | 'story';

interface LaunchOption {
  label: string;
  mode: LaunchMode;
}

interface ArcadeGame {
  id: string;
  title: string;
  badge?: string;
  description: string;
  accent: string;
  launchOptions?: readonly LaunchOption[];
  load: () => Promise<{ startGame: GameStarter }>;
}

const games: readonly ArcadeGame[] = [
  {
    id: 'sindicate',
    title: 'Sindicate',
    badge: 'Work in progress',
    description:
      'Top-down city chaos with traffic, wanted heat, service vehicles, taxis, and missions.',
    accent: '#47d7ff',
    launchOptions: [
      { label: 'Play Sindicate', mode: 'sandbox' },
      { label: 'Story Mode', mode: 'story' },
    ],
    load: () => import('./game/main'),
  },
  {
    id: 'pixel-sprint',
    title: 'Pixel Sprint',
    badge: 'Work in progress',
    description:
      'A twitchy side-scroller built from chunky pixels, hazards, coins, and rising speed.',
    accent: '#ffd166',
    load: () => import('./games/pixelSprint'),
  },
  {
    id: 'void-sweep',
    title: 'Void Sweep',
    badge: 'Work in progress',
    description:
      'A neon space sweep where auto-fire, drifting rocks, and quick dodges keep the screen hot.',
    accent: '#ff4bb8',
    load: () => import('./games/voidSweep'),
  },
];

let activeGame: GameRuntime | null = null;
let stopPreviews: (() => void) | null = null;

function chapterCards(progress = createStoryProgress(STORY_MODE_PROTOTYPE)): string {
  const chapters = STORY_MODE_PROTOTYPE.acts.flatMap((act) => act.chapters);
  return chapters
    .map((chapter) => {
      const unlocked = progress.unlockedChapterIds.includes(chapter.id);
      const completed = progress.completedChapterIds.includes(chapter.id);
      return `
        <button
          class="story-chapter-card${unlocked ? '' : ' story-chapter-card--locked'}"
          type="button"
          data-story-chapter="${chapter.id}"
          ${unlocked ? '' : 'disabled'}
          aria-label="${chapter.title}${unlocked ? '' : ' locked'}"
        >
          <span class="story-chapter-kicker">Chapter ${chapter.order}</span>
          <span class="story-chapter-title">${chapter.title}</span>
          <span class="story-chapter-meta">${completed ? 'Completed' : unlocked ? 'Unlocked' : 'Locked'}</span>
        </button>`;
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

function currentStoryProgress() {
  const store = storyProgressStore();
  return store ? loadStoryProgress(store) ?? createStoryProgress(STORY_MODE_PROTOTYPE) : createStoryProgress(STORY_MODE_PROTOTYPE);
}

function primeStoryLaunch(progress: ReturnType<typeof createStoryProgress>): void {
  const store = launchProgressStore();
  if (!store) return;
  saveStoryProgress(
    store,
    {
      storyId: progress.storyId,
      current: progress.current,
      unlockedChapterIds: progress.unlockedChapterIds,
      completedChapterIds: progress.completedChapterIds,
      completedMissionIds: progress.completedMissionIds,
      branchOutcomes: progress.branchOutcomes,
    },
    STORY_LAUNCH_PROGRESS_KEY,
  );
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
  const options = game.launchOptions ?? [{ label: `Play ${game.title}`, mode: 'sandbox' as const }];
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
  if (launchStore) clearStoryProgress(launchStore, STORY_LAUNCH_PROGRESS_KEY);
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
      if (selected.id === 'sindicate' && mode === 'story') {
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
  const currentChapter = STORY_MODE_PROTOTYPE.acts
    .flatMap((act) => act.chapters)
    .find((chapter) => chapter.id === progress.current?.chapterId);
  const root = appRoot();
  root.innerHTML = `
    <main class="arcade-page" aria-label="Story mode selection">
      <div class="arcade-inner">
        <header class="arcade-topbar">
          <div>
            <h1 class="arcade-title">Story Mode</h1>
            <p class="story-menu-copy">Choose where Rook's investigation continues.</p>
          </div>
        </header>
        <section class="story-menu-grid">
          <article class="story-menu-panel story-menu-panel--primary">
            <h2>Sindicate Story</h2>
            <p>${STORY_MODE_PROTOTYPE.premise}</p>
            <div class="play-actions play-actions--stacked">
              <button class="play-button" type="button" data-story-action="continue">
                ${progress.completedChapterIds.length === 0 && progress.current?.chapterId === 'dead-drop-district' ? 'Start Story' : 'Continue Story'}
              </button>
              <button class="play-button play-button--secondary" type="button" data-story-action="new">
                New Story
              </button>
              <button class="play-button play-button--secondary" type="button" data-story-action="back">
                Back to Arcade
              </button>
            </div>
            <p class="story-menu-status">Current chapter: ${currentChapter?.title ?? 'Dead Drop District'}</p>
          </article>
          <section class="story-menu-panel" aria-label="Unlocked chapters">
            <h2>Chapter Select</h2>
            <div class="story-chapter-grid">
              ${chapterCards(progress)}
            </div>
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

  root.querySelector<HTMLButtonElement>('[data-story-action="continue"]')?.addEventListener('click', () => {
    primeStoryLaunch(progress);
    void launchGame(game, 'story');
  });
  root.querySelector<HTMLButtonElement>('[data-story-action="new"]')?.addEventListener('click', () => {
    const fresh = createStoryProgress(STORY_MODE_PROTOTYPE);
    primeStoryLaunch(fresh);
    void launchGame(game, 'story');
  });
  root.querySelector<HTMLButtonElement>('[data-story-action="back"]')?.addEventListener('click', renderLanding);
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-story-chapter]')) {
    button.addEventListener('click', () => {
      const chapterId = button.dataset.storyChapter;
      if (!chapterId) return;
      const selected = selectStoryChapter(STORY_MODE_PROTOTYPE, progress, chapterId);
      primeStoryLaunch(selected);
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
    const root = appRoot();
    root.innerHTML = `
      <main class="game-shell" style="--accent: ${game.accent}">
        <button class="arcade-back" type="button" aria-label="Back to arcade">Arcade</button>
        <div id="game" class="game-stage"></div>
      </main>`;
    root.querySelector<HTMLButtonElement>('.arcade-back')?.addEventListener('click', renderLanding);
    const stage = root.querySelector<HTMLElement>('#game');
    if (!stage) throw new Error('Missing game stage');
    activeGame = module.startGame(stage, renderLanding);
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
