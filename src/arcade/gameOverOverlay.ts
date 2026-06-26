import {
  LEADERBOARD_LIMIT,
  loadLeaderboard,
  qualifiesForLeaderboard,
  safeStorage,
  saveLeaderboardScore,
  type LeaderboardEntry,
} from './leaderboard';

interface GameOverOverlayOptions {
  title: string;
  storageKey: string;
  onRestart: () => void;
}

interface OverlayState {
  score: number;
  qualifies: boolean;
}

export interface GameOverOverlay {
  isVisible(): boolean;
  restart(): void;
  show(score: number): void;
  hide(): void;
  destroy(): void;
}

const PENDING_SCORE_TIME = Number.MAX_SAFE_INTEGER;

export function createGameOverOverlay(
  parent: HTMLElement,
  options: GameOverOverlayOptions,
): GameOverOverlay {
  const store = safeStorage();
  const overlay = document.createElement('div');
  overlay.className = 'mini-game-gameover';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="mini-game-gameover-panel">
      <p class="mini-game-gameover-kicker">${options.title}</p>
      <h2 class="mini-game-gameover-title">Game over</h2>
      <p class="mini-game-gameover-score"></p>
      <div class="mini-game-gameover-entry" hidden>
        <label class="mini-game-gameover-label" for="${options.storageKey}-name">Top 10 name</label>
        <input id="${options.storageKey}-name" class="mini-game-gameover-input" type="text" maxlength="16" autocomplete="nickname" spellcheck="false" />
        <p class="mini-game-gameover-note"></p>
      </div>
      <div class="mini-game-gameover-board">
        <div class="mini-game-gameover-board-heading">
          <span>High scores</span>
          <span>Top ${LEADERBOARD_LIMIT}</span>
        </div>
        <ol class="mini-game-gameover-list"></ol>
      </div>
      <button class="mini-game-gameover-button" type="button">New game</button>
      <p class="mini-game-gameover-hint">Press Enter or tap New game.</p>
    </div>`;
  parent.append(overlay);

  const scoreText = overlay.querySelector<HTMLElement>('.mini-game-gameover-score');
  const entryWrap = overlay.querySelector<HTMLElement>('.mini-game-gameover-entry');
  const nameInput = overlay.querySelector<HTMLInputElement>('.mini-game-gameover-input');
  const note = overlay.querySelector<HTMLElement>('.mini-game-gameover-note');
  const list = overlay.querySelector<HTMLOListElement>('.mini-game-gameover-list');
  const button = overlay.querySelector<HTMLButtonElement>('.mini-game-gameover-button');
  if (!scoreText || !entryWrap || !nameInput || !note || !list || !button)
    throw new Error('Game-over overlay failed to initialize');

  let state: OverlayState | null = null;

  const buildPreviewEntries = (): LeaderboardEntry[] => {
    const entries = loadLeaderboard(store, options.storageKey);
    if (!state?.qualifies) return entries;
    return [
      ...entries,
      {
        name: nameInput.value.trim() || 'YOU',
        score: state.score,
        achievedAt: PENDING_SCORE_TIME,
      },
    ]
      .sort((a, b) => b.score - a.score || b.achievedAt - a.achievedAt)
      .slice(0, LEADERBOARD_LIMIT);
  };

  const renderList = (): void => {
    const entries = buildPreviewEntries();
    list.innerHTML = '';
    for (const [index, entry] of entries.entries()) {
      const item = document.createElement('li');
      item.className = 'mini-game-gameover-item';
      if (entry.achievedAt === PENDING_SCORE_TIME) item.classList.add('is-pending');
      const rank = document.createElement('span');
      rank.className = 'mini-game-gameover-rank';
      rank.textContent = `#${index + 1}`;
      const name = document.createElement('span');
      name.className = 'mini-game-gameover-name';
      name.textContent = entry.name;
      const value = document.createElement('span');
      value.className = 'mini-game-gameover-value';
      value.textContent = String(entry.score);
      item.append(rank, name, value);
      list.append(item);
    }
  };

  const render = (): void => {
    if (!state) return;
    scoreText.textContent = `Score ${state.score}`;
    entryWrap.hidden = !state.qualifies;
    if (state.qualifies) {
      const preview = buildPreviewEntries();
      const rank = preview.findIndex((entry) => entry.achievedAt === PENDING_SCORE_TIME) + 1;
      note.textContent = rank > 0 ? `This run lands at #${rank}.` : 'This run made the board.';
    }
    renderList();
  };

  const commitScore = (): void => {
    if (!state?.qualifies) return;
    saveLeaderboardScore(store, options.storageKey, state.score, nameInput.value, LEADERBOARD_LIMIT);
  };

  const restart = (): void => {
    if (!state) return;
    commitScore();
    state = null;
    overlay.hidden = true;
    options.onRestart();
  };

  const syncPreview = (): void => {
    if (state?.qualifies) render();
  };

  nameInput.addEventListener('input', syncPreview);
  button.addEventListener('click', restart);

  return {
    isVisible() {
      return state !== null;
    },
    restart,
    show(score: number) {
      const normalizedScore = Math.max(0, Math.floor(score));
      const entries = loadLeaderboard(store, options.storageKey);
      state = {
        score: normalizedScore,
        qualifies: qualifiesForLeaderboard(entries, normalizedScore),
      };
      nameInput.value = '';
      overlay.hidden = false;
      render();
      window.requestAnimationFrame(() => {
        if (!state) return;
        (state.qualifies ? nameInput : button).focus();
      });
    },
    hide() {
      state = null;
      overlay.hidden = true;
    },
    destroy() {
      nameInput.removeEventListener('input', syncPreview);
      button.removeEventListener('click', restart);
      overlay.remove();
    },
  };
}