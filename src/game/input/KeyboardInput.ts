import Phaser from 'phaser';
import type { Controls } from '../../core/types';

/**
 * Reads the keyboard each frame and maps it to the engine-agnostic `Controls`
 * the core simulation understands. Arrow keys or WASD to move, Space to
 * enter/exit a vehicle, Ctrl/F to fire, Enter to continue from the busted screen.
 */
export class KeyboardInput {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasd: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private readonly enter: Phaser.Input.Keyboard.Key;
  private readonly fire: Phaser.Input.Keyboard.Key;

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys('W,A,S,D') as typeof this.wasd;
    this.enter = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.fire = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
  }

  read(): Controls {
    const c = this.cursors;
    const k = this.wasd;
    return {
      up: c.up.isDown || k.W.isDown,
      down: c.down.isDown || k.S.isDown,
      left: c.left.isDown || k.A.isDown,
      right: c.right.isDown || k.D.isDown,
      action: c.space.isDown,
      confirm: this.enter.isDown,
      fire: this.fire.isDown || c.shift.isDown,
    };
  }
}
