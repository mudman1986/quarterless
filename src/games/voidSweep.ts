import type { GameRuntime } from '../arcade/types';
import { createGameOverOverlay } from '../arcade/gameOverOverlay';

interface Vec2 {
  x: number;
  y: number;
}

interface Rock extends Vec2 {
  radius: number;
  velocityX: number;
  velocityY: number;
}

interface Shot extends Vec2 {
  life: number;
}

const logicalWidth = 960;
const logicalHeight = 540;
const keyboardSpeed = 320;

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

  const player: Vec2 = { x: logicalWidth / 2, y: logicalHeight - 72 };
  const target: Vec2 = { ...player };
  const keys = new Set<string>();
  const rocks: Rock[] = [];
  const shots: Shot[] = [];
  let frameId = 0;
  let lastTime = performance.now();
  let shotTimer = 0;
  let rockTimer = 0;
  let score = 0;
  let shield = 3;
  let invulnerableFor = 0;
  let gameOver = false;
  let paused = false;
  let running = true;
  const gameOverOverlay = createGameOverOverlay(parent, {
    title: 'Void Sweep',
    storageKey: 'quarterless.arcade.voidSweep.leaderboard',
    onRestart: () => {
      paused = false;
      syncPauseUi();
      restart();
      lastTime = performance.now();
    },
  });

  const syncPauseUi = (): void => {
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseOverlay.hidden = !paused;
  };

  const togglePause = (): void => {
    paused = !paused;
    target.x = player.x;
    target.y = player.y;
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

  const restart = (): void => {
    rocks.length = 0;
    shots.length = 0;
    player.x = logicalWidth / 2;
    player.y = logicalHeight - 72;
    target.x = player.x;
    target.y = player.y;
    shotTimer = 0;
    rockTimer = 0;
    score = 0;
    shield = 3;
    invulnerableFor = 0;
    gameOver = false;
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
    keys.add(event.code);
  };

  const keyup = (event: KeyboardEvent): void => {
    keys.delete(event.code);
  };

  const pointermove = (event: PointerEvent): void => {
    if (paused || gameOverOverlay.isVisible()) return;
    const bounds = canvas.getBoundingClientRect();
    target.x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * logicalWidth;
    target.y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * logicalHeight;
  };

  const update = (deltaSeconds: number): void => {
    if (gameOver) return;
    const keyboardX =
      (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) -
      (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    const keyboardY =
      (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) -
      (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
    if (keyboardX !== 0 || keyboardY !== 0) {
      const magnitude = Math.hypot(keyboardX, keyboardY) || 1;
      player.x += (keyboardX / magnitude) * keyboardSpeed * deltaSeconds;
      player.y += (keyboardY / magnitude) * keyboardSpeed * deltaSeconds;
      target.x = player.x;
      target.y = player.y;
    } else {
      player.x += (target.x - player.x) * Math.min(1, deltaSeconds * 9);
      player.y += (target.y - player.y) * Math.min(1, deltaSeconds * 9);
    }
    player.x = Math.max(28, Math.min(logicalWidth - 28, player.x));
    player.y = Math.max(46, Math.min(logicalHeight - 34, player.y));
    target.x = Math.max(28, Math.min(logicalWidth - 28, target.x));
    target.y = Math.max(46, Math.min(logicalHeight - 34, target.y));

    shotTimer -= deltaSeconds;
    if (shotTimer <= 0) {
      shots.push({ x: player.x, y: player.y - 28, life: 1.4 });
      shotTimer = 0.16;
    }

    rockTimer -= deltaSeconds;
    if (rockTimer <= 0) {
      rocks.push({
        x: 40 + Math.random() * (logicalWidth - 80),
        y: -40,
        radius: 18 + Math.random() * 26,
        velocityX: -60 + Math.random() * 120,
        velocityY: 80 + Math.random() * 110 + score * 0.02,
      });
      rockTimer = Math.max(0.28, 0.78 - score * 0.0015);
    }

    for (const shot of shots) {
      shot.y -= 620 * deltaSeconds;
      shot.life -= deltaSeconds;
    }
    for (const rock of rocks) {
      rock.x += rock.velocityX * deltaSeconds;
      rock.y += rock.velocityY * deltaSeconds;
      if (rock.x < rock.radius || rock.x > logicalWidth - rock.radius) rock.velocityX *= -1;
    }

    for (const shot of shots) {
      for (const rock of rocks) {
        if (rock.radius <= 0) continue;
        const distance = Math.hypot(shot.x - rock.x, shot.y - rock.y);
        if (distance < rock.radius) {
          shot.life = 0;
          rock.radius = 0;
          score += 20;
        }
      }
    }

    if (invulnerableFor > 0) invulnerableFor -= deltaSeconds;
    for (const rock of rocks) {
      if (rock.radius <= 0 || invulnerableFor > 0) continue;
      const distance = Math.hypot(player.x - rock.x, player.y - rock.y);
      if (distance < rock.radius + 18) {
        rock.radius = 0;
        shield -= 1;
        invulnerableFor = 1.2;
        if (shield <= 0) {
          shield = 0;
          gameOver = true;
          gameOverOverlay.show(score);
          return;
        }
      }
    }

    while (shots[0] && (shots[0].life <= 0 || shots[0].y < -40)) shots.shift();
    while (rocks[0] && (rocks[0].radius <= 0 || rocks[0].y > logicalHeight + 80)) rocks.shift();
  };

  const draw = (time: number): void => {
    context.fillStyle = '#05070a';
    context.fillRect(0, 0, logicalWidth, logicalHeight);
    context.fillStyle = '#eef7ff';
    for (let index = 0; index < 70; index++) {
      const starX = (index * 151 + time * 0.026) % logicalWidth;
      const starY = (index * 67 + time * 0.075) % logicalHeight;
      context.fillRect(starX, starY, 2, 2);
    }

    context.fillStyle = '#47d7ff';
    for (const shot of shots) context.fillRect(shot.x - 3, shot.y - 18, 6, 22);

    context.strokeStyle = '#ff4bb8';
    context.lineWidth = 4;
    for (const rock of rocks) {
      if (rock.radius <= 0) continue;
      context.beginPath();
      context.arc(rock.x, rock.y, rock.radius, 0, Math.PI * 2);
      context.stroke();
    }

    context.fillStyle = gameOver ? '#ff5d5d' : invulnerableFor > 0 ? '#ffd166' : '#7dfc8a';
    context.beginPath();
    context.moveTo(player.x, player.y - 30);
    context.lineTo(player.x + 28, player.y + 28);
    context.lineTo(player.x, player.y + 16);
    context.lineTo(player.x - 28, player.y + 28);
    context.closePath();
    context.fill();

    context.fillStyle = '#eef7ff';
    context.font = '24px monospace';
    context.fillText(`SCORE ${score}`, 26, 42);
    context.fillText(`SHIELD ${shield}`, 26, 76);
  };

  const frame = (time: number): void => {
    if (!running) return;
    if (paused) {
      lastTime = time;
      draw(time);
      frameId = window.requestAnimationFrame(frame);
      return;
    }
    const deltaSeconds = Math.min(0.04, (time - lastTime) / 1000);
    lastTime = time;
    update(deltaSeconds);
    draw(time);
    frameId = window.requestAnimationFrame(frame);
  };

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  pauseButton.addEventListener('click', togglePause);
  canvas.addEventListener('pointermove', pointermove);
  canvas.addEventListener('pointerdown', pointermove);
  syncPauseUi();
  resize();
  frameId = window.requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      pauseButton.removeEventListener('click', togglePause);
      canvas.removeEventListener('pointermove', pointermove);
      canvas.removeEventListener('pointerdown', pointermove);
      gameOverOverlay.destroy();
      pauseButton.remove();
      pauseOverlay.remove();
      canvas.remove();
      parent.classList.remove('mini-game-stage');
    },
  };
}
