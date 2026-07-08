import Phaser from 'phaser';

const VEHICLES_URL = new URL('./assets/vehicles.svg', import.meta.url).toString();
const PEOPLE_URL = new URL('./assets/pedestrians.svg', import.meta.url).toString();
const TILES_URL = new URL('./assets/tiles.svg', import.meta.url).toString();
const EFFECTS_URL = new URL('./assets/effects.svg', import.meta.url).toString();
const AMMO_URL = new URL('./assets/ammo.svg', import.meta.url).toString();

export const TEX = {
  playerCar: 'tex-player-car',
  npcCar: 'tex-npc-car',
  npcCarAlt: 'tex-npc-car-alt',
  npcCarAlt2: 'tex-npc-car-alt-2',
  sedan: 'tex-sedan',
  sedanAlt: 'tex-sedan-alt',
  coupe: 'tex-coupe',
  coupeAlt: 'tex-coupe-alt',
  muscle: 'tex-muscle',
  muscleAlt: 'tex-muscle-alt',
  sports: 'tex-sports',
  sportsAlt: 'tex-sports-alt',
  pickup: 'tex-pickup',
  pickupAlt: 'tex-pickup-alt',
  van: 'tex-van',
  vanAlt: 'tex-van-alt',
  limo: 'tex-limo',
  limoAlt: 'tex-limo-alt',
  taxi: 'tex-taxi',
  policeCar: 'tex-police-car',
  ambulance: 'tex-ambulance',
  tow: 'tex-tow',
  player: 'tex-player',
  pedestrian: 'tex-pedestrian',
  pedestrianTeal: 'tex-pedestrian-teal',
  pedestrianCoral: 'tex-pedestrian-coral',
  pedestrianIndigo: 'tex-pedestrian-indigo',
  policeFoot: 'tex-police-foot',
  medic: 'tex-medic',
  towWorker: 'tex-tow-worker',
  ammo: 'tex-ammo',
} as const;

export const SHEET = {
  vehicles: 'tex-sheet-vehicles',
  people: 'tex-sheet-people',
  tiles: 'tex-sheet-tiles',
  effects: 'tex-sheet-effects',
} as const;

export interface TextureRef {
  texture: string;
  frame?: string | number;
  frames?: readonly (string | number)[];
}

type TextureKey = (typeof TEX)[keyof typeof TEX];

const VEHICLE_FRAME_BY_KEY: Partial<Record<TextureKey, number>> = {
  [TEX.playerCar]: 0,
  [TEX.npcCar]: 1,
  [TEX.npcCarAlt]: 2,
  [TEX.npcCarAlt2]: 3,
  [TEX.sedan]: 4,
  [TEX.sedanAlt]: 5,
  [TEX.coupe]: 6,
  [TEX.coupeAlt]: 7,
  [TEX.muscle]: 8,
  [TEX.muscleAlt]: 9,
  [TEX.sports]: 10,
  [TEX.sportsAlt]: 11,
  [TEX.pickup]: 12,
  [TEX.pickupAlt]: 13,
  [TEX.van]: 14,
  [TEX.vanAlt]: 15,
  [TEX.limo]: 16,
  [TEX.limoAlt]: 17,
  [TEX.taxi]: 18,
  [TEX.policeCar]: 19,
  [TEX.ambulance]: 20,
  [TEX.tow]: 21,
};

const PEOPLE_FRAMES_BY_KEY: Partial<Record<TextureKey, readonly [number, number]>> = {
  [TEX.player]: [0, 1],
  [TEX.pedestrian]: [2, 3],
  [TEX.pedestrianTeal]: [4, 5],
  [TEX.pedestrianCoral]: [6, 7],
  [TEX.pedestrianIndigo]: [8, 9],
  [TEX.policeFoot]: [10, 11],
  [TEX.medic]: [12, 13],
  [TEX.towWorker]: [14, 15],
};

export const TILE = {
  road: { texture: SHEET.tiles, frame: 0 },
  sidewalk: { texture: SHEET.tiles, frame: 1 },
  water: { texture: SHEET.tiles, frame: 2 },
  bridge: { texture: SHEET.tiles, frame: 3 },
  building: { texture: SHEET.tiles, frame: 4 },
  crosswalk: { texture: SHEET.tiles, frame: 5 },
  park: { texture: SHEET.tiles, frame: 6 },
  roof: { texture: SHEET.tiles, frame: 7 },
  rubble: { texture: SHEET.tiles, frame: 8 },
  sparkle: { texture: SHEET.tiles, frame: 9 },
} as const;

export const FX = {
  fire: { texture: SHEET.effects, frames: [0, 1] as const },
  skid: { texture: SHEET.effects, frames: [2, 3] as const },
  explosion: { texture: SHEET.effects, frames: [4, 5] as const },
  damage: { texture: SHEET.effects, frames: [6, 7] as const },
  pickup: { texture: SHEET.effects, frames: [8, 9] as const },
  wreck: { texture: SHEET.effects, frames: [10, 11] as const },
} as const;

export function preloadGameTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(SHEET.vehicles)) {
    scene.load.spritesheet(SHEET.vehicles, VEHICLES_URL, {
      frameWidth: 48,
      frameHeight: 24,
    });
  }
  if (!scene.textures.exists(SHEET.people)) {
    scene.load.spritesheet(SHEET.people, PEOPLE_URL, {
      frameWidth: 16,
      frameHeight: 32,
    });
  }
  if (!scene.textures.exists(SHEET.tiles)) {
    scene.load.spritesheet(SHEET.tiles, TILES_URL, {
      frameWidth: 64,
      frameHeight: 64,
    });
  }
  if (!scene.textures.exists(SHEET.effects)) {
    scene.load.spritesheet(SHEET.effects, EFFECTS_URL, {
      frameWidth: 32,
      frameHeight: 32,
    });
  }
  if (!scene.textures.exists(TEX.ammo)) {
    scene.load.image(TEX.ammo, AMMO_URL);
  }
}

export function createGameTextures(): void {
  // Authored art now loads through Scene.preload via preloadGameTextures().
}

export function textureRef(key: TextureKey): TextureRef {
  const peopleFrames = PEOPLE_FRAMES_BY_KEY[key];
  if (peopleFrames) {
    return { texture: SHEET.people, frame: peopleFrames[0], frames: peopleFrames };
  }

  const vehicleFrame = VEHICLE_FRAME_BY_KEY[key];
  if (vehicleFrame !== undefined) {
    return { texture: SHEET.vehicles, frame: vehicleFrame };
  }

  return { texture: key };
}

export const CIVILIAN_VEHICLE_TEXTURES = {
  car: [textureRef(TEX.npcCar), textureRef(TEX.npcCarAlt), textureRef(TEX.npcCarAlt2)],
  sedan: [textureRef(TEX.sedan), textureRef(TEX.sedanAlt)],
  coupe: [textureRef(TEX.coupe), textureRef(TEX.coupeAlt)],
  muscle: [textureRef(TEX.muscle), textureRef(TEX.muscleAlt)],
  sports: [textureRef(TEX.sports), textureRef(TEX.sportsAlt)],
  pickup: [textureRef(TEX.pickup), textureRef(TEX.pickupAlt)],
  van: [textureRef(TEX.van), textureRef(TEX.vanAlt)],
  limo: [textureRef(TEX.limo), textureRef(TEX.limoAlt)],
} as const;

export const PEDESTRIAN_VARIANT_TEXTURES = [
  textureRef(TEX.pedestrian),
  textureRef(TEX.pedestrianTeal),
  textureRef(TEX.pedestrianCoral),
  textureRef(TEX.pedestrianIndigo),
] as const;

export function pickVariantTexture(keys: readonly TextureRef[], seed: number): TextureRef {
  if (keys.length === 0) return { texture: '' };
  const index = ((Math.trunc(seed) % keys.length) + keys.length) % keys.length;
  return keys[index] ?? keys[0]!;
}

export function cycleFrame(ref: TextureRef, phase: number): string | number | undefined {
  if (!ref.frames || ref.frames.length === 0) return ref.frame;
  const index = ((Math.trunc(phase) % ref.frames.length) + ref.frames.length) % ref.frames.length;
  return ref.frames[index] ?? ref.frame;
}

export function effectFrame(frames: readonly number[], phase: number): number {
  const index = ((Math.trunc(phase) % frames.length) + frames.length) % frames.length;
  return frames[index] ?? frames[0] ?? 0;
}
