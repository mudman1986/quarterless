export type TangramCharacterId =
  | 'penguin'
  | 'crocodile'
  | 'monkey'
  | 'turtle'
  | 'kangaroo'
  | 'lion';

export interface TangramCharacterMovement {
  maxSpeed: number;
  poweredMaxSpeed: number;
  jumpVelocity: number;
  poweredJumpVelocity: number;
  acceleration: number;
  drag: number;
  respawnShieldMs: number;
  skill: string;
}

export interface TangramCharacterDefinition {
  id: TangramCharacterId;
  name: string;
  className: string;
  accent: string;
  body: string;
  accessory: string;
  description: string;
  movement: TangramCharacterMovement;
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
    movement: {
      maxSpeed: 340,
      poweredMaxSpeed: 410,
      jumpVelocity: -740,
      poweredJumpVelocity: -820,
      acceleration: 1900,
      drag: 1650,
      respawnShieldMs: 1200,
      skill: 'Balanced all-rounder with reliable jumps.',
    },
  },
  {
    id: 'crocodile',
    name: 'Crocodile',
    className: 'Crocodiles Class',
    accent: '#80d36d',
    body: '#3d6d47',
    accessory: '#f7d86c',
    description: 'A sturdy classmate with a bold grin and a backpack built for adventure.',
    movement: {
      maxSpeed: 326,
      poweredMaxSpeed: 398,
      jumpVelocity: -748,
      poweredJumpVelocity: -828,
      acceleration: 1820,
      drag: 1720,
      respawnShieldMs: 1450,
      skill: 'Heavier landings, steadier recovery after danger.',
    },
  },
  {
    id: 'monkey',
    name: 'Monkey',
    className: 'Monkeys Class',
    accent: '#ffb15f',
    body: '#6f4d35',
    accessory: '#7fe1c9',
    description: 'A playful, energetic friend who treats every bench and bar like a jungle gym.',
    movement: {
      maxSpeed: 364,
      poweredMaxSpeed: 432,
      jumpVelocity: -756,
      poweredJumpVelocity: -836,
      acceleration: 2080,
      drag: 1580,
      respawnShieldMs: 1200,
      skill: 'Quick acceleration for playful platform links.',
    },
  },
  {
    id: 'turtle',
    name: 'Turtle',
    className: 'Turtles Class',
    accent: '#71d2b6',
    body: '#486856',
    accessory: '#7ac5ff',
    description: 'A calm explorer who turns every school trip into a cozy expedition.',
    movement: {
      maxSpeed: 312,
      poweredMaxSpeed: 386,
      jumpVelocity: -744,
      poweredJumpVelocity: -824,
      acceleration: 1740,
      drag: 1780,
      respawnShieldMs: 1800,
      skill: 'Safer recovery window after spills and bumps.',
    },
  },
  {
    id: 'kangaroo',
    name: 'Kangaroo',
    className: 'Kangaroos Class',
    accent: '#ff93c2',
    body: '#8d5a4c',
    accessory: '#f5da62',
    description: 'A springy sports-day star who is always ready to bound ahead.',
    movement: {
      maxSpeed: 352,
      poweredMaxSpeed: 422,
      jumpVelocity: -808,
      poweredJumpVelocity: -888,
      acceleration: 1960,
      drag: 1600,
      respawnShieldMs: 1200,
      skill: 'Highest jump arc for the tallest routes.',
    },
  },
  {
    id: 'lion',
    name: 'Lion',
    className: 'Lions Class',
    accent: '#ffd166',
    body: '#805a2a',
    accessory: '#ff8f66',
    description: 'A brave hall hero with festival-leader energy and a sunny roar.',
    movement: {
      maxSpeed: 392,
      poweredMaxSpeed: 458,
      jumpVelocity: -748,
      poweredJumpVelocity: -828,
      acceleration: 2140,
      drag: 1540,
      respawnShieldMs: 1200,
      skill: 'Fastest dash for long sports-day straightaways.',
    },
  },
] as const;

export const DEFAULT_CHARACTER_ID: TangramCharacterId = 'penguin';

export function getTangramCharacter(id: TangramCharacterId): TangramCharacterDefinition {
  return PLAYABLE_CHARACTERS.find((character) => character.id === id) ?? PLAYABLE_CHARACTERS[0];
}

export function isTangramCharacterId(value: string): value is TangramCharacterId {
  return PLAYABLE_CHARACTERS.some((character) => character.id === value);
}
