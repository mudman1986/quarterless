import { describe, expect, it } from 'vitest';
import { tangramText } from './language';

describe('Tangram language', () => {
  it('keeps English source text unchanged', () => {
    expect(tangramText('en', 'How to play')).toBe('How to play');
  });

  it('translates authored and dynamic messages at the display boundary', () => {
    expect(tangramText('nl', 'Penguins of Tangram')).toBe('Pinguins van Tangram');
    expect(tangramText('nl', 'Penguins Class')).toBe('Pinguinklas');
    expect(tangramText('nl', 'Tap ahead or behind the player to move. Tap the big circle to jump.')).toContain('Tik');
    expect(tangramText('nl', 'School Gate Morning Run')).toBe('Ochtendrun bij de schoolpoort');
    expect(tangramText('nl', 'Checkpoint reached: Library Steps')).toBe('Checkpoint bereikt: Bibliotheektrap');
    expect(tangramText('nl', 'You still need 2 more Tangram badges.')).toBe('Je hebt nog 2 Tangram-badges nodig.');
  });
});
