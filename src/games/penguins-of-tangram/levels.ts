export type Rect = { x: number; y: number; width: number; height: number };
export type Platform = Rect & { color: number; trim: number; label?: string; secret?: boolean };
export type BreakableBlock = Rect & { color: number; trim: number; label: string };
export type CollectiblePlacement = { x: number; y: number; label: string; secret?: boolean };
export type HazardPlacement = Rect & { label: string };
export type EnemyDefinition = {
  x: number;
  y: number;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  speed: number;
  kind: 'backpack' | 'ball' | 'chalkbug' | 'bookworm' | 'cone';
};
export type BouncePad = Rect & { label: string; strength: number; color: number };
export type MovingPlatform = Platform & { axis: 'x' | 'y'; distance: number; speed: number };
export type BossPlacement = Rect & {
  minX: number;
  maxX: number;
  speed: number;
  hits: number;
  label: string;
  warningSeconds: number;
  chargeSpeed: number;
};

export type TangramLevelId =
  | 'school-gate-morning-run'
  | 'playground-adventure'
  | 'classroom-maze'
  | 'library-art-room-secrets'
  | 'sports-day-finale';

export interface TangramLevelDefinition {
  id: TangramLevelId;
  title: string;
  kicker: string;
  summary: string;
  worldWidth: number;
  worldHeight: number;
  start: { x: number; y: number; label: string };
  hint: string;
  mapAccent: string;
  skyColor: string;
  landmark: 'school' | 'playground' | 'classroom' | 'library' | 'stadium';
  signs: ReadonlyArray<{ x: number; label: string; color: string }>;
  platforms: readonly Platform[];
  breakableBlocks?: readonly BreakableBlock[];
  movingPlatforms?: readonly MovingPlatform[];
  boss?: BossPlacement;
  collectibles: readonly CollectiblePlacement[];
  hazards: readonly HazardPlacement[];
  enemies: readonly EnemyDefinition[];
  bouncePads?: readonly BouncePad[];
  checkpoints: readonly (Rect & { label: string })[];
  goal: Rect & { label: string };
  powerup: Rect & { label: string };
  requiredBadges?: number;
}

const ground = (x: number, width: number): Platform => ({
  x,
  y: 448,
  width,
  height: 92,
  color: 0x73c66f,
  trim: 0x5aa65a,
});

const AUTHORED_LEVELS: readonly TangramLevelDefinition[] = [
  {
    id: 'school-gate-morning-run',
    title: 'School Gate Morning Run',
    kicker: 'Level 1',
    summary: 'Race from the gate through benches, monkey bars, and the opening badge line.',
    worldWidth: 4400,
    worldHeight: 540,
    start: { x: 104, y: 376, label: 'School Gate' },
    hint: 'Use the big buttons or arrow keys to move. Try a jump, then ring the bell. Badges are bonus fun.',
    requiredBadges: 0,
    mapAccent: '#59d0ff',
    skyColor: '#8fd8ff',
    landmark: 'school',
    signs: [
      { x: 410, label: 'Penguins', color: '#59d0ff' },
      { x: 990, label: 'Monkeys', color: '#ffb15f' },
      { x: 1630, label: 'Turtles', color: '#71d2b6' },
      { x: 2480, label: 'Crocodiles', color: '#80d36d' },
      { x: 3150, label: 'Lions', color: '#ffd166' },
    ],
    platforms: [
      ground(0, 4400),
      { x: 550, y: 404, width: 180, height: 24, color: 0xffd166, trim: 0xe3a938, label: 'Bench' },
      { x: 930, y: 330, width: 150, height: 22, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Monkey bars' },
      { x: 1110, y: 256, width: 150, height: 22, color: 0xffb3c7, trim: 0xff8ea8, label: 'Ribbon ledge' },
      { x: 1740, y: 402, width: 150, height: 24, color: 0xffd166, trim: 0xe3a938, label: 'Story bench' },
      { x: 2060, y: 332, width: 150, height: 22, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Library rail' },
      { x: 2260, y: 280, width: 150, height: 22, color: 0xffb3c7, trim: 0xff8ea8, label: 'Secret chalk shelf', secret: true },
      { x: 2860, y: 362, width: 120, height: 22, color: 0xffd166, trim: 0xe3a938, label: 'Bell step' },
      { x: 3250, y: 330, width: 140, height: 22, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Bell rope' },
    ],
    collectibles: [
      { x: 232, y: 386, label: 'Gate badge' },
      { x: 612, y: 352, label: 'Bench badge' },
      { x: 958, y: 278, label: 'Monkey bars badge' },
      { x: 1188, y: 204, label: 'Ribbon badge' },
      { x: 1452, y: 386, label: 'Parade badge' },
      { x: 1808, y: 350, label: 'Story badge' },
      { x: 2128, y: 280, label: 'Rail badge' },
      { x: 2320, y: 228, label: 'Secret shelf badge', secret: true },
      { x: 2732, y: 386, label: 'Field badge' },
      { x: 2918, y: 312, label: 'Bell steps badge' },
      { x: 3170, y: 386, label: 'Bell lawn badge' },
      { x: 3300, y: 278, label: 'Bell rope badge' },
    ],
    hazards: [
      { x: 1540, y: 460, width: 160, height: 54, label: 'Puddle lane' },
      { x: 2992, y: 460, width: 44, height: 54, label: 'Narrow puddle' },
    ],
    enemies: [
      { x: 884, y: 404, width: 44, height: 40, minX: 820, maxX: 1180, speed: 72, kind: 'backpack' },
      { x: 2010, y: 404, width: 44, height: 40, minX: 1980, maxX: 2440, speed: 84, kind: 'backpack' },
      { x: 3098, y: 404, width: 44, height: 40, minX: 3070, maxX: 3370, speed: 88, kind: 'backpack' },
    ],
    checkpoints: [{ x: 2140, y: 300, width: 54, height: 132, label: 'Library Steps' }],
    goal: { x: 4200, y: 80, width: 84, height: 368, label: 'Festival Flag' },
    breakableBlocks: [
      { x: 1280, y: 300, width: 48, height: 48, color: 0xffd166, trim: 0xe3a938, label: 'Tangram block' },
    ],
    powerup: { x: 1360, y: 300, width: 44, height: 56, label: 'Super Snack' },
  },
  {
    id: 'playground-adventure',
    title: 'Playground Adventure',
    kicker: 'Level 2',
    summary: 'Bounce across jungle-gym platforms and race over the slide-yard set piece.',
    worldWidth: 4000,
    worldHeight: 540,
    start: { x: 96, y: 376, label: 'Playground Gate' },
    hint: 'Use the bounce pads to reach the monkey-bar route.',
    mapAccent: '#ffb15f',
    skyColor: '#8fd8ff',
    landmark: 'playground',
    signs: [
      { x: 360, label: 'Slides', color: '#ff8f66' },
      { x: 1180, label: 'Swings', color: '#59d0ff' },
      { x: 2140, label: 'Climbers', color: '#ffd166' },
      { x: 2880, label: 'Finish', color: '#71d2b6' },
    ],
    platforms: [
      ground(0, 800),
      { x: 470, y: 390, width: 110, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Slide ramp' },
      { x: 660, y: 312, width: 150, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Monkey bar start' },
      { x: 900, y: 252, width: 170, height: 20, color: 0xffb3c7, trim: 0xff8ea8, label: 'Monkey bar high route' },
      ground(828, 1292),
      { x: 1460, y: 356, width: 130, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Swing seat' },
      { x: 1660, y: 286, width: 140, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Swing beam' },
      { x: 1880, y: 226, width: 160, height: 20, color: 0xffb3c7, trim: 0xff8ea8, label: 'Secret bridge', secret: true },
      ground(2120, 700),
      { x: 2420, y: 348, width: 120, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Climber rung' },
      { x: 2620, y: 288, width: 140, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Climber crown' },
      ground(2820, 240),
      ground(3120, 880),
    ],
    movingPlatforms: [
      { x: 1040, y: 350, width: 132, height: 20, color: 0xff8f66, trim: 0xe56d4f, label: 'Traveling slide', axis: 'x', distance: 220, speed: 92 },
    ],
    collectibles: [
      { x: 200, y: 386, label: 'Gate badge' },
      { x: 520, y: 338, label: 'Slide badge' },
      { x: 740, y: 260, label: 'Monkey bar badge' },
      { x: 980, y: 200, label: 'High monkey bar badge' },
      { x: 1280, y: 386, label: 'Play yard badge' },
      { x: 1510, y: 304, label: 'Swing badge' },
      { x: 1710, y: 234, label: 'Swing beam badge' },
      { x: 1960, y: 174, label: 'Secret bridge badge', secret: true },
      { x: 2240, y: 386, label: 'Climber field badge' },
      { x: 2480, y: 296, label: 'Climber badge' },
      { x: 2690, y: 236, label: 'Climber crown badge' },
      { x: 2960, y: 386, label: 'Finish lawn badge' },
    ],
    hazards: [
      { x: 1320, y: 460, width: 120, height: 54, label: 'Sandbox puddle' },
      { x: 2320, y: 460, width: 72, height: 54, label: 'Tire-track puddle' },
    ],
    enemies: [
      { x: 540, y: 404, width: 44, height: 40, minX: 460, maxX: 760, speed: 76, kind: 'ball' },
      { x: 1540, y: 404, width: 44, height: 40, minX: 1380, maxX: 1820, speed: 88, kind: 'ball' },
      { x: 2480, y: 404, width: 44, height: 40, minX: 2180, maxX: 2800, speed: 92, kind: 'ball' },
    ],
    bouncePads: [
      { x: 392, y: 426, width: 54, height: 22, label: 'Slide spring', strength: 910, color: 0xff8f66 },
      { x: 1788, y: 426, width: 54, height: 22, label: 'Swing spring', strength: 920, color: 0x71d2b6 },
    ],
    checkpoints: [{ x: 1460, y: 306, width: 54, height: 126, label: 'Swing Midway' }],
    goal: { x: 3780, y: 80, width: 84, height: 368, label: 'Playground Flag' },
    breakableBlocks: [
      { x: 2080, y: 286, width: 48, height: 48, color: 0xffd166, trim: 0xe3a938, label: 'Tangram block' },
    ],
    powerup: { x: 1280, y: 300, width: 44, height: 56, label: 'Rocket Juice' },
  },
  {
    id: 'classroom-maze',
    title: 'Classroom Maze',
    kicker: 'Level 3',
    summary: 'Thread through desk islands, chalk shelves, and a winding classroom obstacle lane.',
    worldWidth: 3800,
    worldHeight: 540,
    start: { x: 96, y: 376, label: 'Homeroom Door' },
    hint: 'Hop from desk to desk and use the chalk-tray shelves to cut corners.',
    mapAccent: '#71d2b6',
    skyColor: '#b7e5ff',
    landmark: 'classroom',
    signs: [
      { x: 280, label: 'Desks', color: '#ffd166' },
      { x: 1080, label: 'Cubbies', color: '#59d0ff' },
      { x: 1860, label: 'Chalk', color: '#ff93c2' },
      { x: 2660, label: 'Bell Rope', color: '#71d2b6' },
    ],
    platforms: [
      ground(0, 760),
      { x: 410, y: 392, width: 120, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Desk 1' },
      { x: 600, y: 332, width: 120, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Desk 2' },
      { x: 790, y: 272, width: 130, height: 20, color: 0xffb3c7, trim: 0xff8ea8, label: 'Chalk tray' },
      ground(820, 1120),
      { x: 1280, y: 360, width: 110, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Cubby top' },
      { x: 1480, y: 300, width: 130, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Window sill' },
      { x: 1700, y: 240, width: 150, height: 20, color: 0xffb3c7, trim: 0xff8ea8, label: 'Banner rail' },
      ground(2000, 760),
      { x: 2280, y: 340, width: 120, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Shelf 1' },
      { x: 2460, y: 280, width: 130, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Shelf 2' },
      { x: 2670, y: 220, width: 150, height: 20, color: 0xffb3c7, trim: 0xff8ea8, label: 'Secret rope route', secret: true },
      ground(2760, 200),
      ground(3020, 780),
    ],
    movingPlatforms: [
      { x: 1040, y: 350, width: 132, height: 20, color: 0x71d2b6, trim: 0x4aa98d, label: 'Rolling desk', axis: 'x', distance: 220, speed: 84 },
    ],
    collectibles: [
      { x: 180, y: 386, label: 'Door badge' },
      { x: 466, y: 340, label: 'Desk badge 1' },
      { x: 652, y: 280, label: 'Desk badge 2' },
      { x: 850, y: 220, label: 'Chalk tray badge' },
      { x: 1100, y: 386, label: 'Hallway badge' },
      { x: 1334, y: 308, label: 'Cubby badge' },
      { x: 1536, y: 248, label: 'Window badge' },
      { x: 1760, y: 188, label: 'Banner badge' },
      { x: 2070, y: 386, label: 'Maze floor badge' },
      { x: 2330, y: 288, label: 'Shelf badge 1' },
      { x: 2516, y: 228, label: 'Shelf badge 2' },
      { x: 2736, y: 168, label: 'Secret rope badge', secret: true },
    ],
    hazards: [
      { x: 1160, y: 460, width: 120, height: 54, label: 'Spilled paint' },
      { x: 2140, y: 460, width: 120, height: 54, label: 'Glue puddle' },
    ],
    enemies: [
      { x: 620, y: 404, width: 44, height: 40, minX: 560, maxX: 940, speed: 78, kind: 'chalkbug' },
      { x: 1400, y: 404, width: 44, height: 40, minX: 1180, maxX: 1880, speed: 82, kind: 'chalkbug' },
      { x: 2380, y: 404, width: 44, height: 40, minX: 2020, maxX: 2840, speed: 90, kind: 'chalkbug' },
    ],
    checkpoints: [{ x: 1490, y: 254, width: 54, height: 126, label: 'Window Middle' }],
    goal: { x: 3600, y: 80, width: 84, height: 368, label: 'Classroom Flag' },
    breakableBlocks: [
      { x: 1980, y: 300, width: 48, height: 48, color: 0xffd166, trim: 0xe3a938, label: 'Tangram block' },
    ],
    powerup: { x: 2140, y: 300, width: 44, height: 56, label: 'Focus Snack' },
  },
  {
    id: 'library-art-room-secrets',
    title: 'Library and Art Room Secrets',
    kicker: 'Level 4',
    summary: 'Climb book stacks, thread art-room rafters, and find the hidden badge route overhead.',
    worldWidth: 4200,
    worldHeight: 540,
    start: { x: 96, y: 376, label: 'Library Door' },
    hint: 'The secret route hides above the bright art-room banners.',
    mapAccent: '#ff93c2',
    skyColor: '#c6ebff',
    landmark: 'library',
    signs: [
      { x: 320, label: 'Stacks', color: '#59d0ff' },
      { x: 1160, label: 'Reading Nook', color: '#ffd166' },
      { x: 2140, label: 'Art Room', color: '#ff93c2' },
      { x: 3060, label: 'Rooftop', color: '#71d2b6' },
    ],
    platforms: [
      ground(0, 700),
      { x: 420, y: 390, width: 110, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Book stack 1' },
      { x: 620, y: 320, width: 120, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Book stack 2' },
      { x: 810, y: 250, width: 140, height: 20, color: 0xffb3c7, trim: 0xff8ea8, label: 'Top shelf' },
      ground(780, 1200),
      { x: 1370, y: 356, width: 120, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Reading rail' },
      { x: 1560, y: 286, width: 140, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Lantern beam' },
      { x: 1760, y: 216, width: 160, height: 20, color: 0xffb3c7, trim: 0xff8ea8, label: 'Banner loft', secret: true },
      ground(2040, 920),
      { x: 2320, y: 350, width: 120, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Paint shelf' },
      { x: 2520, y: 290, width: 140, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Canvas bridge' },
      { x: 2740, y: 220, width: 160, height: 20, color: 0xffb3c7, trim: 0xff8ea8, label: 'Rafter secret', secret: true },
      ground(2960, 180),
      ground(3200, 1000),
      { x: 3160, y: 330, width: 140, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Rooftop gate' },
    ],
    collectibles: [
      { x: 180, y: 386, label: 'Door badge' },
      { x: 470, y: 338, label: 'Book badge 1' },
      { x: 668, y: 268, label: 'Book badge 2' },
      { x: 874, y: 198, label: 'Top shelf badge' },
      { x: 1150, y: 386, label: 'Reading badge' },
      { x: 1425, y: 304, label: 'Rail badge' },
      { x: 1612, y: 234, label: 'Lantern badge' },
      { x: 1836, y: 164, label: 'Banner loft badge', secret: true },
      { x: 2140, y: 386, label: 'Art room badge' },
      { x: 2380, y: 298, label: 'Paint shelf badge' },
      { x: 2580, y: 238, label: 'Canvas bridge badge' },
      { x: 2810, y: 168, label: 'Rafter badge', secret: true },
      { x: 3210, y: 278, label: 'Rooftop badge' },
    ],
    hazards: [
      { x: 1230, y: 460, width: 120, height: 54, label: 'Spilled paint' },
      { x: 2860, y: 460, width: 80, height: 54, label: 'Ink puddle' },
    ],
    enemies: [
      { x: 470, y: 404, width: 44, height: 40, minX: 390, maxX: 760, speed: 80, kind: 'bookworm' },
      { x: 1450, y: 404, width: 44, height: 40, minX: 1180, maxX: 1900, speed: 84, kind: 'bookworm' },
      { x: 2440, y: 404, width: 44, height: 40, minX: 2040, maxX: 2920, speed: 94, kind: 'bookworm' },
    ],
    bouncePads: [
      { x: 1916, y: 426, width: 54, height: 22, label: 'Art-room spring', strength: 930, color: 0xff93c2 },
    ],
    checkpoints: [{ x: 2320, y: 302, width: 54, height: 126, label: 'Art Room Midway' }],
    goal: { x: 4080, y: 80, width: 84, height: 368, label: 'Library Flag' },
    breakableBlocks: [
      { x: 2020, y: 300, width: 48, height: 48, color: 0xffd166, trim: 0xe3a938, label: 'Tangram block' },
    ],
    powerup: { x: 2220, y: 300, width: 44, height: 56, label: 'Painter Snack' },
  },
  {
    id: 'sports-day-finale',
    title: 'Sports Day Finale',
    kicker: 'Level 5',
    summary: 'Sprint over hurdles, podium lifts, and the final stadium banner before the school celebration ends.',
    worldWidth: 4500,
    worldHeight: 540,
    start: { x: 96, y: 376, label: 'Sports Gate' },
    hint: 'This final route rewards clean speed and confident jumps.',
    mapAccent: '#ffd166',
    skyColor: '#aee6ff',
    landmark: 'stadium',
    signs: [
      { x: 300, label: 'Track', color: '#ff8f66' },
      { x: 1120, label: 'Long Jump', color: '#59d0ff' },
      { x: 2060, label: 'Podium', color: '#ffd166' },
      { x: 3200, label: 'Finale', color: '#71d2b6' },
    ],
    platforms: [
      ground(0, 700),
      { x: 500, y: 396, width: 90, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Hurdle 1' },
      { x: 700, y: 336, width: 110, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Hurdle 2' },
      { x: 900, y: 276, width: 130, height: 20, color: 0xffb3c7, trim: 0xff8ea8, label: 'Stand rail' },
      ground(800, 1180),
      { x: 1480, y: 364, width: 100, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Long-jump board' },
      { x: 1670, y: 296, width: 130, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Judge table' },
      { x: 1880, y: 228, width: 150, height: 20, color: 0xffb3c7, trim: 0xff8ea8, label: 'Score banner', secret: true },
      ground(2120, 840),
      { x: 2440, y: 360, width: 120, height: 20, color: 0xffd166, trim: 0xe3a938, label: 'Podium 1' },
      { x: 2640, y: 300, width: 130, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Podium 2' },
      { x: 2850, y: 238, width: 150, height: 20, color: 0xffb3c7, trim: 0xff8ea8, label: 'Victory banner' },
      ground(2960, 180),
      ground(3260, 1240),
      { x: 3320, y: 326, width: 140, height: 20, color: 0x8dc0ff, trim: 0x5f8ee0, label: 'Final podium' },
    ],
    movingPlatforms: [
      { x: 1160, y: 350, width: 132, height: 20, color: 0xff8f66, trim: 0xe56d4f, label: 'Long-jump lift', axis: 'y', distance: 92, speed: 56 },
    ],
    collectibles: [
      { x: 180, y: 386, label: 'Track badge' },
      { x: 540, y: 344, label: 'Hurdle badge 1' },
      { x: 746, y: 284, label: 'Hurdle badge 2' },
      { x: 962, y: 224, label: 'Stand rail badge' },
      { x: 1280, y: 386, label: 'Sprint badge' },
      { x: 1530, y: 312, label: 'Long-jump badge' },
      { x: 1732, y: 244, label: 'Judge table badge' },
      { x: 1950, y: 176, label: 'Score banner badge', secret: true },
      { x: 2250, y: 386, label: 'Podium lawn badge' },
      { x: 2498, y: 308, label: 'Podium badge 1' },
      { x: 2702, y: 248, label: 'Podium badge 2' },
      { x: 2918, y: 186, label: 'Victory banner badge' },
      { x: 3368, y: 274, label: 'Final podium badge' },
    ],
    hazards: [
      { x: 1360, y: 460, width: 120, height: 54, label: 'Water jump' },
      { x: 3020, y: 460, width: 60, height: 54, label: 'Final lane puddle' },
    ],
    enemies: [
      { x: 560, y: 404, width: 44, height: 40, minX: 420, maxX: 980, speed: 86, kind: 'cone' },
      { x: 1660, y: 404, width: 44, height: 40, minX: 1180, maxX: 2040, speed: 92, kind: 'cone' },
      { x: 2620, y: 404, width: 44, height: 40, minX: 2140, maxX: 3040, speed: 96, kind: 'cone' },
      { x: 3300, y: 404, width: 44, height: 40, minX: 3120, maxX: 3480, speed: 102, kind: 'cone' },
    ],
    bouncePads: [
      { x: 1420, y: 426, width: 54, height: 22, label: 'Long-jump spring', strength: 940, color: 0xffd166 },
      { x: 2988, y: 426, width: 54, height: 22, label: 'Victory spring', strength: 940, color: 0xff8f66 },
    ],
    checkpoints: [{ x: 2450, y: 308, width: 54, height: 126, label: 'Podium Midway' }],
    goal: { x: 4220, y: 80, width: 84, height: 368, label: 'Sports Day Flag' },
    breakableBlocks: [
      { x: 2180, y: 300, width: 48, height: 48, color: 0xffd166, trim: 0xe3a938, label: 'Tangram block' },
    ],
    powerup: { x: 2280, y: 300, width: 44, height: 56, label: 'Victory Snack' },
    boss: {
      x: 3090,
      y: 376,
      width: 72,
      height: 72,
      minX: 3060,
      maxX: 3290,
      speed: 72,
      hits: 3,
      label: 'Relay Captain',
      warningSeconds: 0.55,
      chargeSpeed: 260,
    },
  },
];

function repeatRoute<T extends { x: number }>(
  items: readonly T[],
  width: number,
): T[] {
  return [1, 2].flatMap((copy) => items.map((item) => ({ ...item, x: item.x + width * copy })));
}

function extendLevel(level: TangramLevelDefinition): TangramLevelDefinition {
  const addedWidth = level.worldWidth * 2;
  const worldWidth = level.worldWidth + addedWidth;
  const routePlatforms = repeatRoute(
    level.platforms.filter((platform) => platform.y + platform.height < level.worldHeight),
    level.worldWidth,
  );
  const enemies = [1, 2].flatMap((copy) => level.enemies.map((enemy) => ({
    ...enemy,
    x: enemy.x + level.worldWidth * copy,
    minX: enemy.minX + level.worldWidth * copy,
    maxX: enemy.maxX + level.worldWidth * copy,
  })));
  return {
    ...level,
    worldWidth,
    platforms: [...level.platforms, ground(level.worldWidth, addedWidth), ...routePlatforms],
    collectibles: [...level.collectibles, ...repeatRoute(level.collectibles, level.worldWidth)],
    enemies: [...level.enemies, ...enemies],
    hazards: [...level.hazards, ...repeatRoute(level.hazards, level.worldWidth)],
    bouncePads: level.bouncePads ? [...level.bouncePads, ...repeatRoute(level.bouncePads, level.worldWidth)] : undefined,
    movingPlatforms: level.movingPlatforms ? [...level.movingPlatforms, ...repeatRoute(level.movingPlatforms, level.worldWidth)] : undefined,
    checkpoints: [...level.checkpoints, ...repeatRoute(level.checkpoints, level.worldWidth)],
    goal: { ...level.goal, x: worldWidth - 180 },
  };
}

export const CAMPAIGN_LEVELS: readonly TangramLevelDefinition[] = AUTHORED_LEVELS.map(extendLevel);

export const FIRST_LEVEL_ID: TangramLevelId = CAMPAIGN_LEVELS[0].id;

export function getTangramLevel(id: TangramLevelId): TangramLevelDefinition {
  return CAMPAIGN_LEVELS.find((level) => level.id === id) ?? CAMPAIGN_LEVELS[0];
}

export function nextTangramLevelId(id: TangramLevelId): TangramLevelId | null {
  const index = CAMPAIGN_LEVELS.findIndex((level) => level.id === id);
  if (index === -1 || index === CAMPAIGN_LEVELS.length - 1) return null;
  return CAMPAIGN_LEVELS[index + 1].id;
}
