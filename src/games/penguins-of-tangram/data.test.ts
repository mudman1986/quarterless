import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARACTER_ID,
  PLAYABLE_CHARACTERS,
  getTangramCharacter,
  isTangramCharacterId,
} from './data';
import { CAMPAIGN_LEVELS } from './levels';
import { buildTangramJumpAudit } from '../../core/tangramPlatformer';

describe('penguins of tangram character roster', () => {
  it('keeps penguin as the default class hero', () => {
    expect(DEFAULT_CHARACTER_ID).toBe('penguin');
    expect(getTangramCharacter(DEFAULT_CHARACTER_ID).name).toBe('Penguin');
  });

  it('includes each Tangram animal class exactly once', () => {
    const ids = PLAYABLE_CHARACTERS.map((character) => character.id);
    expect(new Set(ids).size).toBe(PLAYABLE_CHARACTERS.length);
    expect(ids).toEqual(['penguin', 'crocodile', 'monkey', 'turtle', 'kangaroo', 'lion']);
  });

  it('recognizes only supported character ids', () => {
    expect(isTangramCharacterId('monkey')).toBe(true);
    expect(isTangramCharacterId('penguin')).toBe(true);
    expect(isTangramCharacterId('fox')).toBe(false);
  });

  it('adds light movement differences across the roster', () => {
    const penguin = getTangramCharacter('penguin');
    const kangaroo = getTangramCharacter('kangaroo');
    const lion = getTangramCharacter('lion');
    const turtle = getTangramCharacter('turtle');

    expect(kangaroo.movement.jumpVelocity).toBeLessThan(penguin.movement.jumpVelocity);
    expect(lion.movement.maxSpeed).toBeGreaterThan(penguin.movement.maxSpeed);
    expect(turtle.movement.respawnShieldMs).toBeGreaterThan(penguin.movement.respawnShieldMs);
  });

  it('keeps every campaign route reachable for every playable class', () => {
    for (const level of CAMPAIGN_LEVELS) {
      for (const character of PLAYABLE_CHARACTERS) {
        const audit = buildTangramJumpAudit(level, character.movement);
        expect(audit.allCriticalPlatformsReachable, `${character.id} cannot reach ${level.id}`).toBe(true);
      }
    }
  });

  it('keeps moving platforms and the finale inside their authored route bounds', () => {
    for (const level of CAMPAIGN_LEVELS) {
      for (const platform of level.movingPlatforms ?? []) {
        expect(platform.distance).toBeGreaterThan(0);
        expect(platform.speed).toBeGreaterThan(0);
        const end = platform.axis === 'x'
          ? platform.x + platform.distance + platform.width
          : platform.y + platform.distance + platform.height;
        expect(end).toBeLessThanOrEqual(platform.axis === 'x' ? level.worldWidth : level.worldHeight);
      }
      if (level.boss) {
        expect(level.boss.minX).toBeGreaterThanOrEqual(0);
        expect(level.boss.maxX + level.boss.width).toBeLessThanOrEqual(level.worldWidth);
        expect(level.boss.warningSeconds).toBeGreaterThan(0);
        expect(level.boss.chargeSpeed).toBeGreaterThan(level.boss.speed);
      }
    }
  });
});
