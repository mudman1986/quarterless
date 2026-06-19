import Phaser from 'phaser';
import { CityScene } from './scenes/CityScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
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

let game: Phaser.Game | null = null;

// Entry point: only constructed in a browser. Unit tests import from src/core
// and never touch this file, so Phaser is never loaded in the Node test runner.
export function startGame(): Phaser.Game {
  if (game) return game;
  game = new Phaser.Game(config);

  // Dev/e2e inspection hook: exposes the running game so tooling (screenshots,
  // smoke tests) can read scene state. Has no effect on gameplay.
  (window as unknown as { __game?: Phaser.Game }).__game = game;
  return game;
}
