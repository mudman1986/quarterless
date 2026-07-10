import Phaser from 'phaser';

// Authored art as data, not shipped image files.
//
// Every frame below is a list of vector draw ops transcribed 1:1 from the
// original hand-authored SVG spritesheets. At load we rasterize them straight
// onto a Phaser CanvasTexture with the 2D context — `Path2D` parses the SVG
// path strings verbatim, so this is faithful to the SVG source but pays none of
// the SVG `<img>` decode cost (which was re-incurred on every game launch, since
// leaving a game calls `game.destroy(true)` and wipes the texture cache).
//
// Keeping the art as a diff-able TS data table also means it is unit-testable,
// has no binary blobs, and needs no build step.

type Op =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; rx?: number; o?: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: string; o?: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: string; o?: number }
  | { t: 'path'; d: string; fill?: string; stroke?: string; sw?: number; cap?: CanvasLineCap; o?: number };

interface SheetSpec {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  frames: Op[][];
}

export interface TextureKeys {
  vehicles: string;
  people: string;
  tiles: string;
  effects: string;
  ammo: string;
}

// --- Reusable fragments (mirror the SVG <defs>/<use>) ------------------------

const WHEEL = '#0b0b0e';
const wheelShort: Op[] = [
  { t: 'rect', x: 6, y: 0, w: 8, h: 3, rx: 1, fill: WHEEL },
  { t: 'rect', x: 6, y: 21, w: 8, h: 3, rx: 1, fill: WHEEL },
  { t: 'rect', x: 34, y: 0, w: 8, h: 3, rx: 1, fill: WHEEL },
  { t: 'rect', x: 34, y: 21, w: 8, h: 3, rx: 1, fill: WHEEL },
];
const wheelLong: Op[] = [
  { t: 'rect', x: 5, y: 0, w: 9, h: 3, rx: 1, fill: WHEEL },
  { t: 'rect', x: 5, y: 21, w: 9, h: 3, rx: 1, fill: WHEEL },
  { t: 'rect', x: 35, y: 0, w: 9, h: 3, rx: 1, fill: WHEEL },
  { t: 'rect', x: 35, y: 21, w: 9, h: 3, rx: 1, fill: WHEEL },
];

const HEADLIGHT_S: Op[] = [
  { t: 'rect', x: 40, y: 7, w: 3, h: 3, fill: '#fff3ab' },
  { t: 'rect', x: 40, y: 14, w: 3, h: 3, fill: '#fff3ab' },
];
const HEADLIGHT_L: Op[] = [
  { t: 'rect', x: 41, y: 7, w: 4, h: 3, fill: '#fff3ab' },
  { t: 'rect', x: 41, y: 14, w: 4, h: 3, fill: '#fff3ab' },
];
const HEADLIGHT_VAN: Op[] = [
  { t: 'rect', x: 42, y: 7, w: 4, h: 3, fill: '#fff3ab' },
  { t: 'rect', x: 42, y: 14, w: 4, h: 3, fill: '#fff3ab' },
];
const HEADLIGHT_PICKUP: Op[] = [
  { t: 'rect', x: 41, y: 8, w: 4, h: 3, fill: '#fff3ab' },
  { t: 'rect', x: 41, y: 13, w: 4, h: 3, fill: '#fff3ab' },
];

const VEHICLES: SheetSpec = {
  frameWidth: 48,
  frameHeight: 24,
  columns: 11,
  frames: [
    // 0 player car
    [
      ...wheelLong,
      { t: 'rect', x: 1, y: 3, w: 46, h: 18, rx: 5, fill: '#3ac978' },
      { t: 'rect', x: 10, y: 5, w: 24, h: 14, rx: 3, fill: '#151f28' },
      { t: 'rect', x: 11, y: 6, w: 12, h: 12, rx: 2, fill: '#bfe8ff' },
      { t: 'rect', x: 24, y: 6, w: 9, h: 12, rx: 2, fill: '#8ed5ff' },
      { t: 'rect', x: 3, y: 7, w: 4, h: 5, fill: '#f7f2b5' },
      { t: 'rect', x: 42, y: 7, w: 4, h: 4, fill: '#fff2a2' },
      { t: 'rect', x: 42, y: 13, w: 4, h: 4, fill: '#fff2a2' },
    ],
    // 1 npc car
    [
      ...wheelShort,
      { t: 'rect', x: 1, y: 3, w: 46, h: 18, rx: 4, fill: '#c54b4b' },
      { t: 'rect', x: 12, y: 5, w: 20, h: 14, rx: 3, fill: '#102030' },
      { t: 'rect', x: 14, y: 6, w: 8, h: 12, fill: '#bee7ff' },
      { t: 'rect', x: 23, y: 6, w: 7, h: 12, fill: '#80c8ff' },
      ...HEADLIGHT_S,
    ],
    // 2 npc car alt
    [
      ...wheelShort,
      { t: 'rect', x: 1, y: 3, w: 46, h: 18, rx: 4, fill: '#148c87' },
      { t: 'rect', x: 12, y: 5, w: 20, h: 14, rx: 3, fill: '#113239' },
      { t: 'rect', x: 14, y: 6, w: 8, h: 12, fill: '#b8eef2' },
      { t: 'rect', x: 23, y: 6, w: 7, h: 12, fill: '#7adddb' },
      ...HEADLIGHT_S,
    ],
    // 3 npc car alt 2
    [
      ...wheelShort,
      { t: 'rect', x: 1, y: 3, w: 46, h: 18, rx: 4, fill: '#4b57d6' },
      { t: 'rect', x: 12, y: 5, w: 20, h: 14, rx: 3, fill: '#23255e' },
      { t: 'rect', x: 14, y: 6, w: 8, h: 12, fill: '#d5dbff' },
      { t: 'rect', x: 23, y: 6, w: 7, h: 12, fill: '#aab5ff' },
      ...HEADLIGHT_S,
    ],
    // 4 sedan
    [
      ...wheelLong,
      { t: 'path', d: 'M1 4h39l6 5-6 11H1z', fill: '#8f4f2c' },
      { t: 'rect', x: 12, y: 6, w: 18, h: 12, rx: 2, fill: '#1d2936' },
      { t: 'rect', x: 14, y: 7, w: 7, h: 10, fill: '#d9efff' },
      { t: 'rect', x: 22, y: 7, w: 7, h: 10, fill: '#a0d9ff' },
      ...HEADLIGHT_L,
    ],
    // 5 sedan alt
    [
      ...wheelLong,
      { t: 'path', d: 'M1 4h39l6 5-6 11H1z', fill: '#70351d' },
      { t: 'rect', x: 12, y: 6, w: 18, h: 12, rx: 2, fill: '#27140d' },
      { t: 'rect', x: 14, y: 7, w: 7, h: 10, fill: '#f1dfc8' },
      { t: 'rect', x: 22, y: 7, w: 7, h: 10, fill: '#d7b187' },
      ...HEADLIGHT_L,
    ],
    // 6 coupe
    [
      ...wheelShort,
      { t: 'path', d: 'M2 5h30l10 6-10 8H2z', fill: '#e24c43' },
      { t: 'rect', x: 13, y: 7, w: 13, h: 11, rx: 2, fill: '#1b2430' },
      { t: 'rect', x: 14, y: 8, w: 6, h: 9, fill: '#daf0ff' },
      { t: 'rect', x: 21, y: 8, w: 5, h: 9, fill: '#9fd7ff' },
      { t: 'rect', x: 38, y: 9, w: 3, h: 3, fill: '#fff3ab' },
      { t: 'rect', x: 38, y: 13, w: 3, h: 3, fill: '#fff3ab' },
    ],
    // 7 coupe alt
    [
      ...wheelShort,
      { t: 'path', d: 'M2 5h30l10 6-10 8H2z', fill: '#f1962a' },
      { t: 'rect', x: 13, y: 7, w: 13, h: 11, rx: 2, fill: '#482014' },
      { t: 'rect', x: 14, y: 8, w: 6, h: 9, fill: '#ffe5cc' },
      { t: 'rect', x: 21, y: 8, w: 5, h: 9, fill: '#ffc58b' },
      { t: 'rect', x: 38, y: 9, w: 3, h: 3, fill: '#fff3ab' },
      { t: 'rect', x: 38, y: 13, w: 3, h: 3, fill: '#fff3ab' },
    ],
    // 8 muscle
    [
      ...wheelLong,
      { t: 'path', d: 'M1 4h39l6 4v8l-6 5H1z', fill: '#8d2748' },
      { t: 'rect', x: 9, y: 6, w: 22, h: 13, rx: 2, fill: '#27111b' },
      { t: 'rect', x: 10, y: 7, w: 11, h: 11, fill: '#f2d7e3' },
      { t: 'rect', x: 22, y: 7, w: 9, h: 11, fill: '#d7a1b8' },
      ...HEADLIGHT_L,
    ],
    // 9 muscle alt
    [
      ...wheelLong,
      { t: 'path', d: 'M1 4h39l6 4v8l-6 5H1z', fill: '#d9800f' },
      { t: 'rect', x: 9, y: 6, w: 22, h: 13, rx: 2, fill: '#553213' },
      { t: 'rect', x: 10, y: 7, w: 11, h: 11, fill: '#ffefcf' },
      { t: 'rect', x: 22, y: 7, w: 9, h: 11, fill: '#ffd49a' },
      ...HEADLIGHT_L,
    ],
    // 10 sports
    [
      ...wheelShort,
      { t: 'path', d: 'M2 6h26l12 5-12 6H2z', fill: '#0aa0b6' },
      { t: 'rect', x: 12, y: 8, w: 12, h: 8, rx: 2, fill: '#15303c' },
      { t: 'rect', x: 13, y: 9, w: 5, h: 6, fill: '#d6f7ff' },
      { t: 'rect', x: 19, y: 9, w: 4, h: 6, fill: '#8edfff' },
      { t: 'rect', x: 37, y: 9, w: 3, h: 3, fill: '#fff3ab' },
      { t: 'rect', x: 37, y: 13, w: 3, h: 3, fill: '#fff3ab' },
    ],
    // 11 sports alt
    [
      ...wheelShort,
      { t: 'path', d: 'M2 6h26l12 5-12 6H2z', fill: '#15926c' },
      { t: 'rect', x: 12, y: 8, w: 12, h: 8, rx: 2, fill: '#14372f' },
      { t: 'rect', x: 13, y: 9, w: 5, h: 6, fill: '#dffbf4' },
      { t: 'rect', x: 19, y: 9, w: 4, h: 6, fill: '#93f0d7' },
      { t: 'rect', x: 37, y: 9, w: 3, h: 3, fill: '#fff3ab' },
      { t: 'rect', x: 37, y: 13, w: 3, h: 3, fill: '#fff3ab' },
    ],
    // 12 pickup
    [
      ...wheelLong,
      { t: 'path', d: 'M1 3h26l9 4h8l5 5-5 9H1z', fill: '#8d4c25' },
      { t: 'rect', x: 10, y: 5, w: 16, h: 13, rx: 2, fill: '#1f2a32' },
      { t: 'rect', x: 11, y: 6, w: 7, h: 11, fill: '#dbefff' },
      { t: 'rect', x: 19, y: 6, w: 6, h: 11, fill: '#9ed8ff' },
      ...HEADLIGHT_PICKUP,
    ],
    // 13 pickup alt
    [
      ...wheelLong,
      { t: 'path', d: 'M1 3h26l9 4h8l5 5-5 9H1z', fill: '#b9552c' },
      { t: 'rect', x: 10, y: 5, w: 16, h: 13, rx: 2, fill: '#392016' },
      { t: 'rect', x: 11, y: 6, w: 7, h: 11, fill: '#ffe8d4' },
      { t: 'rect', x: 19, y: 6, w: 6, h: 11, fill: '#ffc18f' },
      ...HEADLIGHT_PICKUP,
    ],
    // 14 van
    [
      ...wheelLong,
      { t: 'rect', x: 1, y: 3, w: 46, h: 18, rx: 3, fill: '#59657c' },
      { t: 'rect', x: 7, y: 5, w: 28, h: 14, rx: 2, fill: '#202838' },
      { t: 'rect', x: 9, y: 6, w: 12, h: 12, fill: '#dbefff' },
      { t: 'rect', x: 22, y: 6, w: 11, h: 12, fill: '#abd8ff' },
      ...HEADLIGHT_VAN,
    ],
    // 15 van alt
    [
      ...wheelLong,
      { t: 'rect', x: 1, y: 3, w: 46, h: 18, rx: 3, fill: '#7a4ce0' },
      { t: 'rect', x: 7, y: 5, w: 28, h: 14, rx: 2, fill: '#291643' },
      { t: 'rect', x: 9, y: 6, w: 12, h: 12, fill: '#efe5ff' },
      { t: 'rect', x: 22, y: 6, w: 11, h: 12, fill: '#ceb7ff' },
      ...HEADLIGHT_VAN,
    ],
    // 16 limo
    [
      ...wheelLong,
      { t: 'rect', x: 0, y: 4, w: 47, h: 16, rx: 4, fill: '#0f0f12' },
      { t: 'rect', x: 10, y: 6, w: 25, h: 12, rx: 2, fill: '#20242d' },
      { t: 'rect', x: 12, y: 7, w: 11, h: 10, fill: '#cfd8e6' },
      { t: 'rect', x: 24, y: 7, w: 9, h: 10, fill: '#8fa3bd' },
      ...HEADLIGHT_VAN,
    ],
    // 17 limo alt
    [
      ...wheelLong,
      { t: 'rect', x: 0, y: 4, w: 47, h: 16, rx: 4, fill: '#34343a' },
      { t: 'rect', x: 10, y: 6, w: 25, h: 12, rx: 2, fill: '#18181d' },
      { t: 'rect', x: 12, y: 7, w: 11, h: 10, fill: '#d9dde6' },
      { t: 'rect', x: 24, y: 7, w: 9, h: 10, fill: '#9ea6b5' },
      ...HEADLIGHT_VAN,
    ],
    // 18 taxi
    [
      ...wheelShort,
      { t: 'rect', x: 1, y: 3, w: 46, h: 18, rx: 4, fill: '#f0c319' },
      { t: 'rect', x: 13, y: 5, w: 18, h: 14, rx: 2, fill: '#15171e' },
      { t: 'rect', x: 14, y: 6, w: 7, h: 12, fill: '#fff2bf' },
      { t: 'rect', x: 22, y: 6, w: 8, h: 12, fill: '#f9d845' },
      { t: 'rect', x: 6, y: 4, w: 7, h: 2, fill: '#15171e' },
      { t: 'rect', x: 6, y: 18, w: 7, h: 2, fill: '#15171e' },
    ],
    // 19 police car
    [
      ...wheelLong,
      { t: 'rect', x: 1, y: 3, w: 46, h: 18, rx: 4, fill: '#224c9a' },
      { t: 'rect', x: 9, y: 5, w: 24, h: 14, rx: 2, fill: '#0f1e3f' },
      { t: 'rect', x: 10, y: 6, w: 11, h: 12, fill: '#d2ebff' },
      { t: 'rect', x: 22, y: 6, w: 9, h: 12, fill: '#9dd4ff' },
      { t: 'rect', x: 31, y: 4, w: 4, h: 16, fill: '#dc2626' },
      { t: 'rect', x: 35, y: 4, w: 4, h: 16, fill: '#60a5fa' },
    ],
    // 20 ambulance
    [
      ...wheelLong,
      { t: 'rect', x: 1, y: 3, w: 46, h: 18, rx: 4, fill: '#eef1f5' },
      { t: 'rect', x: 9, y: 5, w: 24, h: 14, rx: 2, fill: '#9ca3af' },
      { t: 'rect', x: 10, y: 6, w: 11, h: 12, fill: '#ffffff' },
      { t: 'rect', x: 22, y: 6, w: 9, h: 12, fill: '#dbeafe' },
      { t: 'rect', x: 30, y: 4, w: 5, h: 16, fill: '#dc2626' },
      { t: 'rect', x: 35, y: 4, w: 5, h: 16, fill: '#60a5fa' },
      { t: 'rect', x: 4, y: 8, w: 6, h: 8, fill: '#dc2626' },
    ],
    // 21 tow
    [
      ...wheelLong,
      { t: 'path', d: 'M1 3h23l10 3h10l5 5-5 10H1z', fill: '#e29017' },
      { t: 'rect', x: 11, y: 5, w: 14, h: 13, rx: 2, fill: '#4a2e12' },
      { t: 'rect', x: 12, y: 6, w: 6, h: 11, fill: '#ffefc7' },
      { t: 'rect', x: 19, y: 6, w: 5, h: 11, fill: '#ffd277' },
      { t: 'path', d: 'M26 6h8l3 6h-8z', fill: '#f1b44c' },
      { t: 'rect', x: 34, y: 4, w: 3, h: 16, fill: '#f8fafc' },
    ],
  ],
};

// --- People ------------------------------------------------------------------

const pedShadow: Op = { t: 'ellipse', cx: 8, cy: 13, rx: 5, ry: 2, fill: '#0f172a', o: 0.22 };

function poseA(skin: string, body: string, leg: string, extras: Op[] = []): Op[] {
  return [
    pedShadow,
    { t: 'rect', x: 4, y: 6, w: 6, h: 6, rx: 2, fill: skin },
    { t: 'rect', x: 4, y: 12, w: 7, h: 8, rx: 2, fill: body },
    { t: 'rect', x: 1, y: 13, w: 3, h: 3, fill: body },
    { t: 'rect', x: 10, y: 14, w: 3, h: 3, fill: body },
    ...extras,
    { t: 'rect', x: 5, y: 20, w: 2, h: 5, fill: leg },
    { t: 'rect', x: 8, y: 19, w: 2, h: 6, fill: leg },
  ];
}

function poseB(skin: string, body: string, leg: string, extras: Op[] = []): Op[] {
  return [
    pedShadow,
    { t: 'rect', x: 4, y: 6, w: 6, h: 6, rx: 2, fill: skin },
    { t: 'rect', x: 4, y: 12, w: 7, h: 8, rx: 2, fill: body },
    { t: 'rect', x: 2, y: 14, w: 3, h: 3, fill: body },
    { t: 'rect', x: 9, y: 13, w: 3, h: 3, fill: body },
    ...extras,
    { t: 'rect', x: 4, y: 19, w: 2, h: 6, fill: leg },
    { t: 'rect', x: 9, y: 20, w: 2, h: 5, fill: leg },
  ];
}

const policeExtras: Op[] = [{ t: 'rect', x: 4, y: 10, w: 7, h: 2, fill: '#11213d' }];
const towExtras: Op[] = [{ t: 'rect', x: 4, y: 10, w: 7, h: 2, fill: '#6a3f12' }];
const medicExtras: Op[] = [
  { t: 'rect', x: 6, y: 13, w: 3, h: 6, fill: '#dc2626' },
  { t: 'rect', x: 5, y: 15, w: 5, h: 2, fill: '#dc2626' },
];

const PEOPLE: SheetSpec = {
  frameWidth: 16,
  frameHeight: 32,
  columns: 8,
  frames: [
    poseA('#f4c47d', '#39ff14', '#1c2b38'), // 0 player A
    poseB('#f4c47d', '#39ff14', '#1c2b38'), // 1 player B
    poseA('#f4c47d', '#f5be28', '#2f3a4a'), // 2 yellow A
    poseB('#f4c47d', '#f5be28', '#2f3a4a'), // 3 yellow B
    poseA('#e8bc9a', '#16b1a5', '#1b2a3a'), // 4 teal A
    poseB('#e8bc9a', '#16b1a5', '#1b2a3a'), // 5 teal B
    poseA('#8f5a3d', '#f57b44', '#3a1f42'), // 6 coral A
    poseB('#8f5a3d', '#f57b44', '#3a1f42'), // 7 coral B
    poseA('#c58d63', '#6671f2', '#49464f'), // 8 indigo A
    poseB('#c58d63', '#6671f2', '#49464f'), // 9 indigo B
    poseA('#f4c47d', '#3680f4', '#17202a', policeExtras), // 10 police A
    poseB('#f4c47d', '#3680f4', '#17202a', policeExtras), // 11 police B
    poseA('#f4c47d', '#eef2f7', '#2d3748', medicExtras), // 12 medic A
    poseB('#f4c47d', '#eef2f7', '#2d3748', medicExtras), // 13 medic B
    poseA('#f4c47d', '#ec9a1d', '#2b3038', towExtras), // 14 tow A
    poseB('#f4c47d', '#ec9a1d', '#2b3038', towExtras), // 15 tow B
  ],
};

// --- Tiles -------------------------------------------------------------------

const TILES: SheetSpec = {
  frameWidth: 64,
  frameHeight: 64,
  columns: 5,
  frames: [
    // 0 road (plain asphalt — lane markings are drawn as oriented lines in CityScene)
    [
      { t: 'rect', x: 0, y: 0, w: 64, h: 64, fill: '#3a4250' },
      { t: 'path', d: 'M0 10h64M0 30h64M0 50h64', stroke: '#313a48', sw: 2, o: 0.35 },
      { t: 'path', d: 'M14 0v64M34 0v64M54 0v64', stroke: '#2d3542', sw: 2, o: 0.3 },
    ],
    // 1 sidewalk
    [
      { t: 'rect', x: 0, y: 0, w: 64, h: 64, fill: '#9aa4b2' },
      { t: 'path', d: 'M6 16h52M6 32h52M6 48h52', stroke: '#b3bcc8', sw: 2, o: 0.5 },
      { t: 'path', d: 'M16 6v52M32 6v52M48 6v52', stroke: '#7c8593', sw: 2, o: 0.4 },
    ],
    // 2 water
    [
      { t: 'rect', x: 0, y: 0, w: 64, h: 64, fill: '#1d84a6' },
      { t: 'path', d: 'M0 8c16 6 32 6 64 0M0 28c18 6 34 6 64 0M0 48c14 6 30 6 64 0', stroke: '#8ff0ff', sw: 3, o: 0.35 },
      { t: 'path', d: 'M0 2h64M0 62h64', stroke: '#155a72', sw: 4, o: 0.75 },
    ],
    // 3 bridge
    [
      { t: 'rect', x: 0, y: 0, w: 64, h: 64, fill: '#565760' },
      { t: 'path', d: 'M0 8h64M0 56h64', stroke: '#26262b', sw: 5, o: 0.9 },
      { t: 'path', d: 'M10 16v32M22 16v32M34 16v32M46 16v32M58 16v32', stroke: '#898f9b', sw: 2, o: 0.6 },
    ],
    // 4 building
    [
      { t: 'rect', x: 0, y: 0, w: 64, h: 64, fill: '#5d6675' },
      { t: 'rect', x: 4, y: 4, w: 56, h: 56, fill: '#6f7a8b' },
      {
        t: 'path',
        d: 'M12 12h8v8h-8zM28 12h8v8h-8zM44 12h8v8h-8zM12 28h8v8h-8zM28 28h8v8h-8zM44 28h8v8h-8zM20 44h10v8H20zM36 44h14v8H36z',
        fill: '#f5d977',
        o: 0.85,
      },
      { t: 'path', d: 'M0 0h64v64H0z', stroke: '#0f172a', sw: 4 },
    ],
    // 5 crosswalk (bare stripes only — the road shows between them)
    [
      { t: 'path', d: 'M12 16h40M12 32h40M12 48h40', stroke: '#b9c2d0', sw: 4, cap: 'square', o: 0.7 },
    ],
    // 6 park
    [
      { t: 'rect', x: 0, y: 0, w: 64, h: 64, fill: '#2c5138' },
      { t: 'path', d: 'M8 10l10 8-6 10-12-6zM32 8l12 6-6 12-14-4zM18 34l14 6-8 14-16-5zM42 36l12 8-6 12-14-6z', fill: '#3f714f' },
      { t: 'path', d: 'M14 22l4-6M36 18l5-4M28 46l4-6M50 48l4-6', stroke: '#86c48e', sw: 3, o: 0.55 },
    ],
    // 7 roof
    [
      { t: 'rect', x: 0, y: 0, w: 64, h: 64, fill: '#566170' },
      { t: 'path', d: 'M10 52h44', stroke: '#374151', sw: 8, o: 0.7 },
      { t: 'path', d: 'M16 10h10v10H16zM30 14h18v8H30zM18 30h14v8H18zM36 32h12v10H36z', fill: '#8391a5' },
      { t: 'path', d: 'M20 12h6v6H20zM34 16h10v4H34zM20 32h10v4H20zM38 34h6v6H38z', fill: '#dce7f2', o: 0.4 },
    ],
    // 8 rubble
    [
      { t: 'rect', x: 0, y: 0, w: 64, h: 64, fill: '#6b1d1d' },
      { t: 'path', d: 'M10 42c8-14 22-18 44-10-8 16-24 22-44 10z', fill: '#c43b2f', o: 0.92 },
      { t: 'path', d: 'M22 24c8-8 18-8 30 0-6 10-16 12-30 0z', fill: '#f59e0b', o: 0.8 },
      { t: 'circle', cx: 34, cy: 32, r: 8, fill: '#fde68a', o: 0.78 },
    ],
    // 9 sparkle
    [
      { t: 'rect', x: 0, y: 0, w: 64, h: 64, fill: '#1e293b' },
      { t: 'path', d: 'M10 48c8-10 16-14 26-14 8 0 14 4 18 10', stroke: '#94a3b8', sw: 4, o: 0.65 },
      { t: 'path', d: 'M16 46l8-8M24 50l8-10M38 48l8-8', stroke: '#f8fafc', sw: 3, o: 0.5 },
      { t: 'circle', cx: 24, cy: 26, r: 4, fill: '#fb923c' },
      { t: 'circle', cx: 36, cy: 20, r: 3, fill: '#fef08a' },
      { t: 'circle', cx: 44, cy: 28, r: 3, fill: '#22d3ee' },
    ],
  ],
};

// --- Effects -----------------------------------------------------------------

const EFFECTS: SheetSpec = {
  frameWidth: 32,
  frameHeight: 32,
  columns: 6,
  frames: [
    // 0 fire A
    [
      { t: 'ellipse', cx: 16, cy: 16, rx: 14, ry: 8, fill: '#2a3342', o: 0.45 },
      { t: 'path', d: 'M8 20l4-12 6 6 6-8 4 12-6 8H14z', fill: '#f97316', o: 0.85 },
      { t: 'path', d: 'M13 17l3-7 4 4 4-5 2 7-4 5h-6z', fill: '#facc15', o: 0.95 },
    ],
    // 1 fire B
    [
      { t: 'ellipse', cx: 16, cy: 16, rx: 14, ry: 8, fill: '#2a3342', o: 0.45 },
      { t: 'path', d: 'M9 20l5-11 5 5 5-9 5 11-5 9H15z', fill: '#fb923c', o: 0.85 },
      { t: 'path', d: 'M14 17l3-6 3 3 4-5 3 6-4 6h-6z', fill: '#fde047', o: 0.95 },
    ],
    // 2 skid A
    [
      { t: 'ellipse', cx: 16, cy: 16, rx: 14, ry: 8, fill: '#374151', o: 0.3 },
      { t: 'path', d: 'M6 17h20', stroke: '#0f172a', sw: 4, o: 0.55 },
      { t: 'path', d: 'M10 12h12', stroke: '#0f172a', sw: 3, o: 0.45 },
      { t: 'path', d: 'M12 22h10', stroke: '#0f172a', sw: 3, o: 0.45 },
    ],
    // 3 skid B
    [
      { t: 'ellipse', cx: 16, cy: 16, rx: 14, ry: 8, fill: '#374151', o: 0.24 },
      { t: 'path', d: 'M7 18h18', stroke: '#111827', sw: 4, o: 0.55 },
      { t: 'path', d: 'M10 13h12', stroke: '#111827', sw: 3, o: 0.4 },
      { t: 'path', d: 'M13 22h8', stroke: '#111827', sw: 3, o: 0.4 },
    ],
    // 4 explosion A
    [
      { t: 'circle', cx: 16, cy: 16, r: 12, fill: '#facc15', o: 0.55 },
      { t: 'circle', cx: 16, cy: 16, r: 8, fill: '#f97316', o: 0.75 },
      { t: 'circle', cx: 16, cy: 16, r: 4, fill: '#fde68a', o: 0.95 },
    ],
    // 5 explosion B
    [
      { t: 'circle', cx: 16, cy: 16, r: 13, fill: '#fde047', o: 0.5 },
      { t: 'circle', cx: 16, cy: 16, r: 9, fill: '#fb923c', o: 0.72 },
      { t: 'circle', cx: 16, cy: 16, r: 5, fill: '#fff7b8', o: 0.95 },
    ],
    // 6 damage A
    [
      { t: 'path', d: 'M8 24c4-10 12-14 24-12-4 12-14 16-24 12z', fill: '#2f3744', o: 0.55 },
      { t: 'path', d: 'M16 18l8-4M12 20l10-2M18 22l8 2', stroke: '#111827', sw: 3, o: 0.5 },
    ],
    // 7 damage B
    [
      { t: 'path', d: 'M8 24c6-8 14-12 24-10-5 10-13 14-24 10z', fill: '#394252', o: 0.55 },
      { t: 'path', d: 'M14 17l8-5M12 20l10-2M18 23l8 2', stroke: '#111827', sw: 3, o: 0.5 },
    ],
    // 8 pickup A
    [
      { t: 'path', d: 'M7 22l6-8 4 4 6-10 4 8-4 8H13z', fill: '#22d3ee', o: 0.75 },
      { t: 'path', d: 'M14 20l3-5 3 2 4-5 2 5-3 5h-5z', fill: '#facc15', o: 0.85 },
    ],
    // 9 pickup B
    [
      { t: 'path', d: 'M8 22l5-8 5 4 5-10 5 8-5 8H13z', fill: '#38bdf8', o: 0.72 },
      { t: 'path', d: 'M14 20l3-5 3 2 4-5 3 5-4 5h-5z', fill: '#fde047', o: 0.85 },
    ],
    // 10 wreck A
    [
      { t: 'path', d: 'M10 10h12l6 8-6 8H10l-6-8z', fill: '#3b3f46', o: 0.9 },
      { t: 'path', d: 'M10 10h12', stroke: '#8b5a3c', sw: 4, o: 0.85 },
      { t: 'path', d: 'M6 17l18 2M8 22l12-7', stroke: '#18181b', sw: 3, o: 0.7 },
    ],
    // 11 wreck B
    [
      { t: 'path', d: 'M10 10h12l6 8-6 8H10l-6-8z', fill: '#43474f', o: 0.9 },
      { t: 'path', d: 'M10 10h12', stroke: '#b07d53', sw: 4, o: 0.85 },
      { t: 'path', d: 'M6 16l18 4M8 23l12-8', stroke: '#18181b', sw: 3, o: 0.7 },
    ],
  ],
};

const AMMO: Op[] = [
  { t: 'rect', x: 1, y: 4, w: 16, h: 10, rx: 2, fill: '#4a420d' },
  { t: 'rect', x: 1, y: 4, w: 16, h: 5, rx: 2, fill: '#d1a114' },
  { t: 'rect', x: 4, y: 1, w: 2, h: 5, fill: '#f6e163' },
  { t: 'rect', x: 8, y: 1, w: 2, h: 5, fill: '#f6e163' },
  { t: 'rect', x: 12, y: 1, w: 2, h: 5, fill: '#f6e163' },
  { t: 'rect', x: 2, y: 10, w: 14, h: 2, fill: '#7d6711', o: 0.6 },
];

const TAU = Math.PI * 2;

function drawOp(ctx: CanvasRenderingContext2D, op: Op): void {
  ctx.save();
  ctx.globalAlpha = op.o ?? 1;
  if (op.t === 'path') {
    const p = new Path2D(op.d);
    if (op.fill) {
      ctx.fillStyle = op.fill;
      ctx.fill(p);
    }
    if (op.stroke) {
      ctx.strokeStyle = op.stroke;
      ctx.lineWidth = op.sw ?? 1;
      ctx.lineCap = op.cap ?? 'butt';
      ctx.stroke(p);
    }
  } else {
    ctx.beginPath();
    if (op.t === 'rect') {
      if (op.rx) ctx.roundRect(op.x, op.y, op.w, op.h, op.rx);
      else ctx.rect(op.x, op.y, op.w, op.h);
    } else if (op.t === 'circle') {
      ctx.arc(op.cx, op.cy, op.r, 0, TAU);
    } else {
      ctx.ellipse(op.cx, op.cy, op.rx, op.ry, 0, 0, TAU);
    }
    if (op.fill) {
      ctx.fillStyle = op.fill;
      ctx.fill();
    }
    if (op.t === 'rect' && op.stroke) {
      ctx.strokeStyle = op.stroke;
      ctx.lineWidth = op.sw ?? 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function buildSheet(scene: Phaser.Scene, key: string, spec: SheetSpec): void {
  if (scene.textures.exists(key)) return;
  const rows = Math.ceil(spec.frames.length / spec.columns);
  const width = spec.columns * spec.frameWidth;
  const height = rows * spec.frameHeight;
  const tex = scene.textures.createCanvas(key, width, height);
  if (!tex) return;
  const ctx = tex.context;
  ctx.clearRect(0, 0, width, height);
  spec.frames.forEach((ops, index) => {
    const col = index % spec.columns;
    const row = Math.floor(index / spec.columns);
    const cx = col * spec.frameWidth;
    const cy = row * spec.frameHeight;
    ctx.save();
    ctx.translate(cx, cy);
    for (const op of ops) drawOp(ctx, op);
    ctx.restore();
    tex.add(index, 0, cx, cy, spec.frameWidth, spec.frameHeight);
  });
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  tex.refresh();
}

function buildImage(scene: Phaser.Scene, key: string, ops: Op[], width: number, height: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, width, height);
  if (!tex) return;
  const ctx = tex.context;
  ctx.clearRect(0, 0, width, height);
  for (const op of ops) drawOp(ctx, op);
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  tex.refresh();
}

/**
 * Rasterizes all authored game art onto Phaser CanvasTextures. Synchronous and
 * idempotent — guarded by `textures.exists`, so a `scene.restart()` is a no-op.
 */
export function generateGameTextures(scene: Phaser.Scene, keys: TextureKeys): void {
  buildSheet(scene, keys.vehicles, VEHICLES);
  buildSheet(scene, keys.people, PEOPLE);
  buildSheet(scene, keys.tiles, TILES);
  buildSheet(scene, keys.effects, EFFECTS);
  buildImage(scene, keys.ammo, AMMO, 18, 18);
}
