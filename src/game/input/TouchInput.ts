import Phaser from 'phaser';
import type { Controls } from '../../core/types';
import { vec2, type Vec2 } from '../../core/vector';
import { emptyTouchSnapshot, readTouchSnapshot, type TouchLayout, type TouchSnapshot } from './touchControls';

export class TouchInput {
  private enabled = false;
  private layout: TouchLayout | null = null;
  private readonly activePointers = new Map<number, Vec2>();

  constructor(private readonly input: Phaser.Input.InputPlugin) {
    this.input.addPointer(3);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
    this.input.on('gameout', this.clear, this);
  }

  destroy(): void {
    this.input.off('pointerdown', this.handlePointerDown, this);
    this.input.off('pointermove', this.handlePointerMove, this);
    this.input.off('pointerup', this.handlePointerUp, this);
    this.input.off('pointerupoutside', this.handlePointerUp, this);
    this.input.off('gameout', this.clear, this);
    this.clear();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  setLayout(layout: TouchLayout): void {
    this.layout = layout;
  }

  read(): Controls {
    return this.snapshot().controls;
  }

  snapshot(): TouchSnapshot {
    if (!this.enabled) return emptyTouchSnapshot(this.layout?.move.center);
    if (!this.layout) return emptyTouchSnapshot();
    return readTouchSnapshot([...this.activePointers.values()], this.layout);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    this.activePointers.set(pointer.id, vec2(pointer.x, pointer.y));
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    if (pointer.isDown || this.activePointers.has(pointer.id)) {
      this.activePointers.set(pointer.id, vec2(pointer.x, pointer.y));
    }
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    this.activePointers.delete(pointer.id);
  }

  private clear(): void {
    this.activePointers.clear();
  }
}