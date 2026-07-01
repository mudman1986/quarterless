import Phaser from 'phaser';
import { CityScene } from '../../game/scenes/CityScene';
import type { GameRuntime } from '../../arcade/types';

function config(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#111111',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
    },
    scene: [CityScene],
  };
}

let game: Phaser.Game | null = null;

// Entry point: only constructed in a browser. Unit tests import from src/core
// and never touch this file, so Phaser is never loaded in the Node test runner.
export function startGame(parent: HTMLElement, onExit: () => void): GameRuntime {
  if (game) game.destroy(true);
  game = new Phaser.Game(config(parent));
  game.registry.set('exitToLaunchMenu', onExit);

  // Dev/e2e inspection hook: exposes the running game so tooling (screenshots,
  // smoke tests) can read scene state. Has no effect on gameplay.
  (window as unknown as { __game?: Phaser.Game }).__game = game;
  return {
    stop() {
      game?.destroy(true);
      game = null;
      delete (window as unknown as { __game?: Phaser.Game }).__game;
    },
  };
}
