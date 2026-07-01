import type { GameRuntime } from '../arcade/types';
import { createGameOverOverlay } from '../arcade/gameOverOverlay';

interface ArcadeGameTestHook {
  triggerGameOver(score?: number): void;
}

interface Obstacle {
  x: number;
  width: number;
  height: number;
}

interface Coin {
  x: number;
  y: number;
  collected: boolean;
}

const logicalWidth = 960;
const logicalHeight = 540;
const groundY = 420;

export function startGame(parent: HTMLElement, onExit: () => void): GameRuntime {
  parent.innerHTML = '';
  parent.classList.add('mini-game-stage');
  const canvas = document.createElement('canvas');
  canvas.className = 'mini-game-canvas';
  parent.append(canvas);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.imageSmoothingEnabled = false;

  const pauseButton = document.createElement('button');
  pauseButton.className = 'mini-game-pause';
  pauseButton.type = 'button';
  const pauseOverlay = document.createElement('div');
  pauseOverlay.className = 'mini-game-pause-overlay';
  pauseOverlay.textContent = 'Paused\nPress P or tap Resume';
  parent.append(pauseOverlay, pauseButton);

  let frameId = 0;
  let lastTime = performance.now();
  let playerY = groundY - 54;
  let velocityY = 0;
  let distance = 0;
  let score = 0;
  let speed = 250;
  let obstacleTimer = 0;
  let coinTimer = 0;
  let gameOver = false;
  let paused = false;
  let running = true;
  const obstacles: Obstacle[] = [];
  const coins: Coin[] = [];
  const gameOverOverlay = createGameOverOverlay(parent, {
    title: 'Pixel Sprint',
    storageKey: 'quarterless.arcade.pixelSprint.leaderboard',
    onRestart: () => {
      paused = false;
      syncPauseUi();
      reset();
      lastTime = performance.now();
    },
  });
  const testHook: ArcadeGameTestHook = {
    triggerGameOver(nextScore) {
      if (typeof nextScore === 'number') score = Math.max(0, Math.floor(nextScore));
      paused = false;
      syncPauseUi();
      gameOver = true;
      gameOverOverlay.show(score);
    },
  };
  (window as unknown as { __arcadeGame?: ArcadeGameTestHook }).__arcadeGame = testHook;

  const syncPauseUi = (): void => {
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseOverlay.hidden = !paused;
  };

  const togglePause = (): void => {
    paused = !paused;
    lastTime = performance.now();
    syncPauseUi();
  };

  const resize = (): void => {
    const bounds = parent.getBoundingClientRect();
    const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = Math.max(1, Math.floor(bounds.width * pixelRatio));
    canvas.height = Math.max(1, Math.floor(bounds.height * pixelRatio));
    context.setTransform(canvas.width / logicalWidth, 0, 0, canvas.height / logicalHeight, 0, 0);
    context.imageSmoothingEnabled = false;
  };

  const jump = (): void => {
    if (gameOver) return;
    if (playerY >= groundY - 56) velocityY = -620;
  };

  const reset = (): void => {
    playerY = groundY - 54;
    velocityY = 0;
    distance = 0;
    score = 0;
    speed = 250;
    obstacleTimer = 0;
    coinTimer = 0;
    gameOver = false;
    obstacles.length = 0;
    coins.length = 0;
  };

  const keydown = (event: KeyboardEvent): void => {
    if (event.code === 'Enter' && gameOverOverlay.isVisible()) {
      event.preventDefault();
      gameOverOverlay.restart();
      return;
    }
    if (event.code === 'Escape') {
      onExit();
      return;
    }
    if (gameOverOverlay.isVisible()) return;
    if (event.code === 'KeyP' && !event.repeat) {
      event.preventDefault();
      togglePause();
      return;
    }
    if (paused) return;
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault();
      jump();
    }
  };

  const pointerdown = (): void => {
    if (paused || gameOverOverlay.isVisible()) return;
    jump();
  };

  const update = (deltaSeconds: number): void => {
    if (gameOver) return;

    distance += speed * deltaSeconds;
    score = Math.max(score, Math.floor(distance / 12));
    speed += deltaSeconds * 8;
    velocityY += 1700 * deltaSeconds;
    playerY = Math.min(groundY - 54, playerY + velocityY * deltaSeconds);

    obstacleTimer -= deltaSeconds;
    if (obstacleTimer <= 0) {
      obstacles.push({
        x: logicalWidth + 40,
        width: 34,
        height: 46 + Math.floor(Math.random() * 34),
      });
      obstacleTimer = 0.9 + Math.random() * 0.55;
    }

    coinTimer -= deltaSeconds;
    if (coinTimer <= 0) {
      const coinY = 260 + Math.random() * 80;
      for (let index = 0; index < 4; index++)
        coins.push({ x: logicalWidth + 80 + index * 34, y: coinY, collected: false });
      coinTimer = 1.4 + Math.random() * 0.9;
    }

    for (const obstacle of obstacles) obstacle.x -= speed * deltaSeconds;
    for (const coin of coins) coin.x -= speed * deltaSeconds;

    while (obstacles[0] && obstacles[0].x < -80) obstacles.shift();
    while (coins[0] && coins[0].x < -40) coins.shift();

    const player = { x: 126, y: playerY, width: 36, height: 54 };
    for (const obstacle of obstacles) {
      const hit =
        player.x < obstacle.x + obstacle.width &&
        player.x + player.width > obstacle.x &&
        player.y < groundY &&
        player.y + player.height > groundY - obstacle.height;
      if (hit) {
        gameOver = true;
        gameOverOverlay.show(score);
        break;
      }
    }

    for (const coin of coins) {
      if (coin.collected) continue;
      const hit = Math.abs(player.x + 18 - coin.x) < 28 && Math.abs(player.y + 18 - coin.y) < 34;
      if (hit) {
        coin.collected = true;
        score += 25;
      }
    }
  };

  const draw = (): void => {
    context.fillStyle = '#090b10';
    context.fillRect(0, 0, logicalWidth, logicalHeight);
    context.fillStyle = '#111827';
    context.fillRect(0, groundY, logicalWidth, logicalHeight - groundY);

    context.strokeStyle = '#263449';
    context.lineWidth = 2;
    for (let x = -((distance * 0.18) % 48); x < logicalWidth; x += 48) {
      context.beginPath();
      context.moveTo(x, groundY + 42);
      context.lineTo(x + 24, groundY + 42);
      context.stroke();
    }

    context.fillStyle = '#47d7ff';
    for (let index = 0; index < 24; index++) {
      const starX = (index * 83 - distance * 0.08) % logicalWidth;
      const starY = 30 + ((index * 47) % 180);
      context.fillRect(starX < 0 ? starX + logicalWidth : starX, starY, 3, 3);
    }

    context.fillStyle = '#ff4bb8';
    for (const obstacle of obstacles)
      context.fillRect(obstacle.x, groundY - obstacle.height, obstacle.width, obstacle.height);

    context.fillStyle = '#ffd166';
    for (const coin of coins) {
      if (!coin.collected) context.fillRect(coin.x - 7, coin.y - 7, 14, 14);
    }

    context.fillStyle = gameOver ? '#ff5d5d' : '#7dfc8a';
    context.fillRect(126, playerY, 36, 54);
    context.fillStyle = '#061018';
    context.fillRect(150, playerY + 12, 8, 8);
    context.fillRect(130, playerY + 54, 10, 14);
    context.fillRect(152, playerY + 54, 10, 14);

    context.fillStyle = '#eef7ff';
    context.font = '24px monospace';
    context.fillText(`SCORE ${score}`, 26, 42);
  };

  const frame = (time: number): void => {
    if (!running) return;
    if (paused) {
      lastTime = time;
      draw();
      frameId = window.requestAnimationFrame(frame);
      return;
    }
    const deltaSeconds = Math.min(0.04, (time - lastTime) / 1000);
    lastTime = time;
    update(deltaSeconds);
    draw();
    frameId = window.requestAnimationFrame(frame);
  };

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', keydown);
  pauseButton.addEventListener('click', togglePause);
  canvas.addEventListener('pointerdown', pointerdown);
  syncPauseUi();
  resize();
  frameId = window.requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', keydown);
      pauseButton.removeEventListener('click', togglePause);
      canvas.removeEventListener('pointerdown', pointerdown);
      gameOverOverlay.destroy();
      delete (window as unknown as { __arcadeGame?: ArcadeGameTestHook }).__arcadeGame;
      pauseButton.remove();
      pauseOverlay.remove();
      canvas.remove();
      parent.classList.remove('mini-game-stage');
    },
  };
}
