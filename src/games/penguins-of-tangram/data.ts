export type TangramCharacterId =
  | 'penguin'
  | 'crocodile'
  | 'monkey'
  | 'turtle'
  | 'kangaroo'
  | 'lion';

export interface TangramCharacterDefinition {
  id: TangramCharacterId;
  name: string;
  className: string;
  accent: string;
  body: string;
  accessory: string;
  description: string;
}

export const PLAYABLE_CHARACTERS: readonly TangramCharacterDefinition[] = [
  {
    id: 'penguin',
    name: 'Penguin',
    className: 'Penguins Class',
    accent: '#59d0ff',
    body: '#1f3348',
    accessory: '#ff7f50',
    description: 'The cheerful Tangram lead with a balanced, confident platforming style.',
  },
  {
    id: 'crocodile',
    name: 'Crocodile',
    className: 'Crocodiles Class',
    accent: '#80d36d',
    body: '#3d6d47',
    accessory: '#f7d86c',
    description: 'A sturdy classmate with a bold grin and a backpack built for adventure.',
  },
  {
    id: 'monkey',
    name: 'Monkey',
    className: 'Monkeys Class',
    accent: '#ffb15f',
    body: '#6f4d35',
    accessory: '#7fe1c9',
    description: 'A playful, energetic friend who treats every bench and bar like a jungle gym.',
  },
  {
    id: 'turtle',
    name: 'Turtle',
    className: 'Turtles Class',
    accent: '#71d2b6',
    body: '#486856',
    accessory: '#7ac5ff',
    description: 'A calm explorer who turns every school trip into a cozy expedition.',
  },
  {
    id: 'kangaroo',
    name: 'Kangaroo',
    className: 'Kangaroos Class',
    accent: '#ff93c2',
    body: '#8d5a4c',
    accessory: '#f5da62',
    description: 'A springy sports-day star who is always ready to bound ahead.',
  },
  {
    id: 'lion',
    name: 'Lion',
    className: 'Lions Class',
    accent: '#ffd166',
    body: '#805a2a',
    accessory: '#ff8f66',
    description: 'A brave hall hero with festival-leader energy and a sunny roar.',
  },
] as const;

export const DEFAULT_CHARACTER_ID: TangramCharacterId = 'penguin';

export function getTangramCharacter(id: TangramCharacterId): TangramCharacterDefinition {
  return PLAYABLE_CHARACTERS.find((character) => character.id === id) ?? PLAYABLE_CHARACTERS[0];
}

export function isTangramCharacterId(value: string): value is TangramCharacterId {
  return PLAYABLE_CHARACTERS.some((character) => character.id === value);
}
