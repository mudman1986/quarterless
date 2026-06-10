import { describe, it, expect } from 'vitest';
import { controlDirection, walk, WALK_SPEED, type OnFootActor } from './entity';
import { POLICE_BASE_SPEED } from './policeAI';
import { controls } from './types';
import { length, vec2 } from './vector';

const actor = (): OnFootActor => ({ pos: vec2(0, 0), angle: 0, radius: 8 });

describe('controlDirection', () => {
  it('points up for the up button (screen y grows downward)', () => {
    expect(controlDirection(controls({ up: true }))).toEqual({ x: 0, y: -1 });
  });

  it('combines axes for diagonals', () => {
    expect(controlDirection(controls({ down: true, right: true }))).toEqual({ x: 1, y: 1 });
  });

  it('cancels opposing buttons to zero', () => {
    expect(controlDirection(controls({ left: true, right: true }))).toEqual({ x: 0, y: 0 });
  });
});

describe('walk', () => {
  it('moves right at the walking speed', () => {
    const next = walk(actor(), controls({ right: true }), 1);
    expect(next.pos.x).toBeCloseTo(WALK_SPEED);
    expect(next.pos.y).toBeCloseTo(0);
  });

  it('updates facing to the movement direction', () => {
    const next = walk(actor(), controls({ down: true }), 1);
    expect(next.angle).toBeCloseTo(Math.PI / 2);
  });

  it('normalizes diagonals so they are not faster', () => {
    const next = walk(actor(), controls({ down: true, right: true }), 1);
    expect(length(next.pos)).toBeCloseTo(WALK_SPEED);
  });

  it('does not move or rotate when idle', () => {
    const start = actor();
    expect(walk(start, controls(), 1)).toEqual(start);
  });

  it('respects a custom speed', () => {
    const next = walk(actor(), controls({ right: true }), 1, 10);
    expect(next.pos.x).toBeCloseTo(10);
  });

  it('lets the player run at least as fast as an officer on foot', () => {
    expect(WALK_SPEED).toBeGreaterThanOrEqual(POLICE_BASE_SPEED);
  });
});
