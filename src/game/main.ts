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

// Entry point: only constructed in a browser. Unit tests import from src/core
// and never touch this file, so Phaser is never loaded in the Node test runner.
new Phaser.Game(config);
