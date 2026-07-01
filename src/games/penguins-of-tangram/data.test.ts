import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARACTER_ID,
  PLAYABLE_CHARACTERS,
  getTangramCharacter,
  isTangramCharacterId,
} from './penguinsOfTangramData';

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
});
