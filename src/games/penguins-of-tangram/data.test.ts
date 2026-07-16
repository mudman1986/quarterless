import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARACTER_ID,
  PLAYABLE_CHARACTERS,
  getTangramCharacter,
  isTangramCharacterId,
} from './data';
import { CAMPAIGN_LEVELS } from './levels';
import {
  TANGRAM_FIXED_STEP,
  buildTangramJumpAudit,
  createTangramPlatformerState,
  getTangramCheckpointSupport,
  tickTangramPlatformer,
  type TangramPlatformerEvent,
} from '../../core/tangramPlatformer';

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

  it('gives every checkpoint a platform to stand on', () => {
    for (const level of CAMPAIGN_LEVELS) {
      const support = getTangramCheckpointSupport(level);
      expect(support, `${level.id} checkpoint is unsupported`).not.toBeNull();
      expect(support?.x).toBeLessThanOrEqual(level.checkpoint.x + level.checkpoint.width / 2);
      expect((support?.x ?? 0) + (support?.width ?? 0)).toBeGreaterThanOrEqual(
        level.checkpoint.x + level.checkpoint.width / 2,
      );
      expect(support?.y).toBeGreaterThanOrEqual(level.checkpoint.y);
    }
  });

  it('keeps every power snack block reachable from below', () => {
    for (const level of CAMPAIGN_LEVELS) {
      const state = createTangramPlatformerState(level);
      const events: TangramPlatformerEvent[] = [];
      const snack = level.powerup;
      state.player.x = snack.x;
      state.player.y = snack.y + snack.height + 20;
      state.player.velocityY = -740;

      for (let tick = 0; tick < 30 && !state.powerBlockHit; tick += 1) {
        tickTangramPlatformer(
          state,
          level,
          getTangramCharacter('penguin').movement,
          { direction: 0, jumpPressed: false },
          TANGRAM_FIXED_STEP,
          events,
        );
      }

      expect(state.powerBlockHit, `${level.id} power snack cannot be hit`).toBe(true);
    }
  });

  it('keeps the opening route welcoming without a badge gate', () => {
    expect(CAMPAIGN_LEVELS[0].requiredBadges).toBe(0);
  });
});
