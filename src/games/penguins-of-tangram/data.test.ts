import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARACTER_ID,
  PLAYABLE_CHARACTERS,
  getTangramCharacter,
  isTangramCharacterId,
} from './data';

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
});
