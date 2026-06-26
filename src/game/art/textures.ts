import Phaser from 'phaser';

/**
 * Procedurally generated top-down sprite textures. Everything is drawn at
 * runtime with the Graphics API - no asset files, nothing copyrighted. Each
 * texture points to the right (+x) so a sprite's rotation matches an entity's
 * heading. Call {@link createGameTextures} once during scene `create`.
 */
export const TEX = {
  playerCar: 'tex-player-car',
  npcCar: 'tex-npc-car',
  sedan: 'tex-sedan',
  coupe: 'tex-coupe',
  muscle: 'tex-muscle',
  sports: 'tex-sports',
  pickup: 'tex-pickup',
  van: 'tex-van',
  limo: 'tex-limo',
  taxi: 'tex-taxi',
  policeCar: 'tex-police-car',
  ambulance: 'tex-ambulance',
  tow: 'tex-tow',
  player: 'tex-player',
  pedestrian: 'tex-pedestrian',
  policeFoot: 'tex-police-foot',
  medic: 'tex-medic',
  towWorker: 'tex-tow-worker',
  ammo: 'tex-ammo',
} as const;

type SpriteFrame = { width: number; height: number };

const PLAYER_CAR_FRAME: SpriteFrame = { width: 36, height: 19 };
const NPC_CAR_FRAME: SpriteFrame = { width: 34, height: 18 };
const SEDAN_FRAME: SpriteFrame = { width: 36, height: 18 };
const COUPE_FRAME: SpriteFrame = { width: 32, height: 16 };
const MUSCLE_FRAME: SpriteFrame = { width: 38, height: 19 };
const SPORTS_FRAME: SpriteFrame = { width: 30, height: 15 };
const PICKUP_FRAME: SpriteFrame = { width: 40, height: 20 };
const VAN_FRAME: SpriteFrame = { width: 41, height: 22 };
const LIMO_FRAME: SpriteFrame = { width: 46, height: 18 };
const TAXI_FRAME: SpriteFrame = { width: 35, height: 18 };
const POLICE_FRAME: SpriteFrame = { width: 36, height: 18 };
const SVC_FRAME: SpriteFrame = { width: 42, height: 22 };
const PERSON = 16;

const TYRE = 0x111114;
const OUTLINE = 0x09090b;
const CHROME = 0xe5e7eb;
const HEADLIGHT = 0xfff6c2;
const TAILLIGHT = 0xf87171;
const GLASS = 0xbfe6ff;
const GLASS_DARK = 0x5b7086;

interface DetailedCarSpec {
  frame: SpriteFrame;
  body: number;
  roof: number;
  roofX: number;
  roofY: number;
  roofW: number;
  roofH: number;
  bodyRadius: number;
  windshieldX: number;
  windshieldW: number;
  rearWheelX: number;
  frontWheelX: number;
  wheelW?: number;
}

function shade(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

function blend(a: number, b: number, amount: number): number {
  const mix = (x: number, y: number) => Math.round(x + (y - x) * amount);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (mix(ar, br) << 16) | (mix(ag, bg) << 8) | mix(ab, bb);
}

function drawWheelSet(
  g: Phaser.GameObjects.Graphics,
  frame: SpriteFrame,
  rearX: number,
  frontX: number,
  wheelW = 7,
): void {
  g.fillStyle(TYRE, 1);
  g.fillRect(rearX, -1, wheelW, 3);
  g.fillRect(rearX, frame.height - 2, wheelW, 3);
  g.fillRect(frontX, -1, wheelW, 3);
  g.fillRect(frontX, frame.height - 2, wheelW, 3);

  const hubW = Math.max(3, wheelW - 2);
  g.fillStyle(0x404046, 1);
  g.fillRect(rearX + 1, 0, hubW, 1);
  g.fillRect(rearX + 1, frame.height - 1, hubW, 1);
  g.fillRect(frontX + 1, 0, hubW, 1);
  g.fillRect(frontX + 1, frame.height - 1, hubW, 1);
}

function drawVehicleLamps(g: Phaser.GameObjects.Graphics, frame: SpriteFrame): void {
  g.fillStyle(HEADLIGHT, 1);
  g.fillRect(frame.width - 2, 3, 2, 3);
  g.fillRect(frame.width - 2, frame.height - 6, 2, 3);
  g.fillStyle(TAILLIGHT, 1);
  g.fillRect(0, 4, 2, 2.5);
  g.fillRect(0, frame.height - 6.5, 2, 2.5);
}

function drawGlassCanopy(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  frontX: number,
  frontW: number,
): void {
  g.fillStyle(GLASS_DARK, 1);
  g.fillRoundedRect(x + 1, y + 1, w - 2, h - 2, 2);
  g.fillStyle(GLASS, 0.92);
  g.fillRoundedRect(frontX, y + 1, frontW, h - 2, 2);
  g.fillStyle(blend(GLASS, CHROME, 0.55), 0.95);
  g.fillRect(x + 2, y + 2, w - 4, 1.2);
  g.fillStyle(GLASS_DARK, 0.95);
  g.fillRect(x + 4, y + 1, 1, h - 2);
  g.fillRect(x + w - 5, y + 1, 1, h - 2);
}

function drawCarTrim(
  g: Phaser.GameObjects.Graphics,
  frame: SpriteFrame,
  body: number,
  roofX: number,
  roofY: number,
  roofW: number,
  roofH: number,
): void {
  const lowerBody = shade(body, 0.7);
  const upperBody = blend(body, CHROME, 0.18);
  g.fillStyle(lowerBody, 0.95);
  g.fillRect(2, frame.height - 4, frame.width - 4, 2);
  g.fillStyle(upperBody, 0.95);
  g.fillRect(3, 2, frame.width - 9, 1.4);
  g.fillStyle(OUTLINE, 0.35);
  g.fillRect(Math.max(5, Math.round(frame.width * 0.15)), 4, 1, frame.height - 8);
  g.fillRect(frame.width - Math.max(8, Math.round(frame.width * 0.22)), 4, 1, frame.height - 8);
  g.fillRect(roofX - 1, roofY + 1, 1, roofH - 2);
  g.fillRect(roofX + roofW, roofY + 1, 1, roofH - 2);
  g.fillRect(Math.round(frame.width * 0.3), 3, 1, 2);
  g.fillRect(Math.round(frame.width * 0.3), frame.height - 5, 1, 2);
  g.fillStyle(shade(body, 0.5), 0.75);
  g.fillRect(2, 6, 3, 6);
  g.fillStyle(CHROME, 0.75);
  g.fillRect(frame.width - 5, 7, 2, 4);
}

function drawDetailedCar(g: Phaser.GameObjects.Graphics, spec: DetailedCarSpec): void {
  const { frame, body, roof, roofX, roofY, roofW, roofH, bodyRadius, windshieldX, windshieldW } = spec;
  const roofHighlight = blend(roof, CHROME, 0.22);

  drawWheelSet(g, frame, spec.rearWheelX, spec.frontWheelX, spec.wheelW ?? 7);

  g.fillStyle(body, 1);
  g.fillRoundedRect(0, 1, frame.width, frame.height - 2, bodyRadius);
  g.lineStyle(1, OUTLINE, 0.9);
  g.strokeRoundedRect(0.5, 1.5, frame.width - 1, frame.height - 3, bodyRadius);

  g.fillStyle(blend(body, CHROME, 0.14), 0.95);
  g.fillRoundedRect(2, 2, frame.width - 8, 3, bodyRadius);

  drawCarTrim(g, frame, body, roofX, roofY, roofW, roofH);

  g.fillStyle(roof, 1);
  g.fillRoundedRect(roofX, roofY, roofW, roofH, 3);
  g.fillStyle(roofHighlight, 0.95);
  g.fillRoundedRect(roofX + 1, roofY + 1, roofW - 2, 1.5, 2);
  g.lineStyle(1, OUTLINE, 0.8);
  g.strokeRoundedRect(roofX + 0.5, roofY + 0.5, roofW - 1, roofH - 1, 3);

  drawGlassCanopy(g, roofX, roofY, roofW, roofH, windshieldX, windshieldW);
  drawVehicleLamps(g, frame);
}

function drawAmbulance(g: Phaser.GameObjects.Graphics, frame: SpriteFrame = SVC_FRAME): void {
  drawWheelSet(g, frame, 8, frame.width - 16, 8);

  g.fillStyle(0xf8fafc, 1);
  g.fillRoundedRect(0, 1, frame.width, frame.height - 2, 4);
  g.lineStyle(1, OUTLINE, 0.85);
  g.strokeRoundedRect(0.5, 1.5, frame.width - 1, frame.height - 3, 4);
  g.fillStyle(0xdbe4ee, 0.95);
  g.fillRoundedRect(2, 2, frame.width - 11, 3, 3);

  g.fillStyle(0xe2e8f0, 1);
  g.fillRoundedRect(frame.width - 12, 2, 11, frame.height - 4, 3);
  g.fillStyle(blend(0xe2e8f0, CHROME, 0.4), 0.95);
  g.fillRoundedRect(frame.width - 11, 3, 8, 1.5, 2);

  g.fillStyle(0xdc2626, 1);
  g.fillRect(2, 3, frame.width - 17, 2.5);
  g.fillRect(2, frame.height - 5.5, frame.width - 17, 2.5);
  g.fillStyle(0xfca5a5, 0.85);
  g.fillRect(3, 5.8, frame.width - 21, 1);
  g.fillRect(3, frame.height - 6.8, frame.width - 21, 1);

  g.fillStyle(0xdc2626, 1);
  g.fillRect(Math.round(frame.width * 0.28), 6, 3, 8);
  g.fillRect(Math.round(frame.width * 0.21), 8.5, 8, 3);

  g.fillStyle(0x2563eb, 1);
  g.fillRect(frame.width - 17, 5, 3, 4);
  g.fillStyle(0xdc2626, 1);
  g.fillRect(frame.width - 17, frame.height - 9, 3, 4);
  g.fillStyle(OUTLINE, 0.35);
  g.fillRect(6, 4, 1, frame.height - 8);
  g.fillRect(Math.round(frame.width * 0.52), 4, 1, frame.height - 8);
  g.fillRect(frame.width - 12, 4, 1, frame.height - 8);
  g.fillStyle(GLASS_DARK, 1);
  g.fillRoundedRect(frame.width - 15, 4, 8, frame.height - 8, 2);
  g.fillStyle(GLASS, 0.9);
  g.fillRect(frame.width - 12, 5, 3, frame.height - 10);

  drawVehicleLamps(g, frame);
}

function drawTowTruck(g: Phaser.GameObjects.Graphics, frame: SpriteFrame = SVC_FRAME): void {
  drawWheelSet(g, frame, 8, frame.width - 16, 8);

  g.fillStyle(0x3f3f46, 1);
  g.fillRoundedRect(0, 1, frame.width, frame.height - 2, 3);
  g.lineStyle(1, OUTLINE, 0.85);
  g.strokeRoundedRect(0.5, 1.5, frame.width - 1, frame.height - 3, 3);

  g.fillStyle(0x52525b, 1);
  g.fillRect(2, 3, frame.width - 18, frame.height - 6);
  g.fillStyle(0x71717a, 0.95);
  g.fillRect(3, 4, frame.width - 21, 1.2);
  g.fillRect(3, frame.height - 5.2, frame.width - 21, 1.2);

  for (let i = 0; i < 3; i++) {
    g.fillStyle(i % 2 === 0 ? 0xf59e0b : TYRE, 1);
    g.fillRect(2 + i * 2.5, 3, 2.5, frame.height - 6);
  }

  g.fillStyle(0x9ca3af, 1);
  g.fillRect(Math.round(frame.width * 0.24), frame.height / 2 - 1, Math.round(frame.width * 0.38), 2);
  g.fillRect(Math.round(frame.width * 0.43), 5, 2, frame.height - 10);
  g.fillStyle(0xd4d4d8, 1);
  g.fillCircle(Math.round(frame.width * 0.24), frame.height / 2, 2);
  g.fillRect(5, frame.height / 2 - 0.5, 5, 1);

  g.fillStyle(0xf59e0b, 1);
  g.fillRoundedRect(frame.width - 15, 1, 15, frame.height - 2, 4);
  g.fillStyle(0xb45309, 1);
  g.fillRoundedRect(frame.width - 13, 3, 9, frame.height - 6, 2);
  g.fillStyle(0xfcd34d, 0.9);
  g.fillRoundedRect(frame.width - 13, 3, 8, 1.5, 2);

  g.fillStyle(0xfde047, 1);
  g.fillRect(frame.width - 12, frame.height / 2 - 2, 3, 4);
  g.fillStyle(OUTLINE, 0.4);
  g.fillRect(7, 4, 1, frame.height - 8);
  g.fillRect(Math.round(frame.width * 0.57), 4, 1, frame.height - 8);
  g.fillStyle(GLASS_DARK, 1);
  g.fillRoundedRect(frame.width - 12, 4, 7, frame.height - 8, 2);
  g.fillStyle(GLASS, 0.92);
  g.fillRect(frame.width - 9, 5, 2.5, frame.height - 10);

  drawVehicleLamps(g, frame);
}

function drawTaxi(g: Phaser.GameObjects.Graphics, frame: SpriteFrame = TAXI_FRAME): void {
  drawDetailedCar(g, {
    frame,
    body: 0xfacc15,
    roof: 0xa16207,
    roofX: 10,
    roofY: 3,
    roofW: 15,
    roofH: frame.height - 6,
    bodyRadius: 4,
    windshieldX: frame.width - 11,
    windshieldW: 5,
    rearWheelX: 6,
    frontWheelX: 23,
  });

  g.fillStyle(TYRE, 1);
  for (let i = 0; i < 5; i++) {
    const x = 7 + i * 4;
    g.fillRect(x, 4, 2, 2);
    g.fillRect(x + 2, frame.height - 6, 2, 2);
  }

  g.fillStyle(0xf8fafc, 1);
  g.fillRoundedRect(13, 1, 8, 3, 1.5);
  g.lineStyle(1, OUTLINE, 0.7);
  g.strokeRoundedRect(13.5, 1.5, 7, 2, 1.5);
  g.fillStyle(TYRE, 1);
  g.fillRect(15, 2, 4, 1);
}

function drawSedan(g: Phaser.GameObjects.Graphics): void {
  drawDetailedCar(g, {
    frame: SEDAN_FRAME,
    body: 0x0f766e,
    roof: 0x164e63,
    roofX: 8,
    roofY: 3,
    roofW: 17,
    roofH: 12,
    bodyRadius: 4,
    windshieldX: 26,
    windshieldW: 5,
    rearWheelX: 6,
    frontWheelX: 23,
  });
  g.fillStyle(CHROME, 0.75);
  g.fillRect(5, 8, 24, 1.2);
  g.fillStyle(OUTLINE, 0.28);
  g.fillRect(14, 4, 1, SEDAN_FRAME.height - 8);
  g.fillRect(20, 4, 1, SEDAN_FRAME.height - 8);
}

function drawCoupe(g: Phaser.GameObjects.Graphics): void {
  drawDetailedCar(g, {
    frame: COUPE_FRAME,
    body: 0x2563eb,
    roof: 0x1e3a8a,
    roofX: 10,
    roofY: 3,
    roofW: 11,
    roofH: 10,
    bodyRadius: 5,
    windshieldX: 23,
    windshieldW: 4,
    rearWheelX: 5,
    frontWheelX: 20,
    wheelW: 6,
  });
  g.fillStyle(0x93c5fd, 0.9);
  g.fillRect(8, 4, 6, 1.5);
  g.fillStyle(CHROME, 0.8);
  g.fillRect(7, COUPE_FRAME.height / 2 - 0.6, 14, 1.2);
}

function drawMuscle(g: Phaser.GameObjects.Graphics): void {
  drawDetailedCar(g, {
    frame: MUSCLE_FRAME,
    body: 0xea580c,
    roof: 0x7c2d12,
    roofX: 11,
    roofY: 3,
    roofW: 13,
    roofH: 13,
    bodyRadius: 5,
    windshieldX: 28,
    windshieldW: 4,
    rearWheelX: 7,
    frontWheelX: 26,
  });
  g.fillStyle(0xfef3c7, 0.9);
  g.fillRect(5, 5, 18, 1.5);
  g.fillRect(5, MUSCLE_FRAME.height - 6.5, 18, 1.5);
  g.fillStyle(OUTLINE, 0.45);
  g.fillRect(9, 7, 3, 1.5);
  g.fillRect(9, MUSCLE_FRAME.height - 8.5, 3, 1.5);
}

function drawSports(g: Phaser.GameObjects.Graphics): void {
  drawDetailedCar(g, {
    frame: SPORTS_FRAME,
    body: 0xbe123c,
    roof: 0x881337,
    roofX: 10,
    roofY: 3,
    roofW: 8,
    roofH: 8,
    bodyRadius: 5,
    windshieldX: 20,
    windshieldW: 4,
    rearWheelX: 5,
    frontWheelX: 19,
    wheelW: 6,
  });
  g.fillStyle(0xfda4af, 0.9);
  g.fillRect(5, SPORTS_FRAME.height / 2 - 1, 15, 2);
  g.fillStyle(OUTLINE, 0.4);
  g.fillRect(7, 4, 2, 1.5);
  g.fillRect(7, SPORTS_FRAME.height - 5, 2, 1.5);
  g.fillRect(19, 5, 2, 1.2);
  g.fillRect(19, SPORTS_FRAME.height - 6, 2, 1.2);
}

function drawPickup(g: Phaser.GameObjects.Graphics): void {
  drawWheelSet(g, PICKUP_FRAME, 6, 27, 7);

  g.fillStyle(0x65a30d, 1);
  g.fillRoundedRect(7, 1, PICKUP_FRAME.width - 7, PICKUP_FRAME.height - 2, 4);
  g.fillRect(0, 3, 14, PICKUP_FRAME.height - 6);
  g.lineStyle(1, OUTLINE, 0.85);
  g.strokeRoundedRect(7.5, 1.5, PICKUP_FRAME.width - 8, PICKUP_FRAME.height - 3, 4);

  g.fillStyle(0x3f6212, 1);
  g.fillRoundedRect(16, 3, 11, PICKUP_FRAME.height - 6, 3);
  drawGlassCanopy(g, 16, 3, 11, PICKUP_FRAME.height - 6, 22, 3);

  g.fillStyle(shade(0x65a30d, 0.62), 0.95);
  g.fillRect(1, 3, 12, 1.5);
  g.fillRect(1, PICKUP_FRAME.height - 4.5, 12, 1.5);
  g.fillStyle(CHROME, 0.65);
  g.fillRect(3, 4.5, 8, 0.8);
  g.fillRect(3, PICKUP_FRAME.height - 5.3, 8, 0.8);

  g.lineStyle(1.5, 0xd9f99d, 0.7);
  g.strokeRect(2, 4, 10, PICKUP_FRAME.height - 8);
  g.fillStyle(OUTLINE, 0.4);
  g.fillRect(13, 4, 1, PICKUP_FRAME.height - 8);
  drawVehicleLamps(g, PICKUP_FRAME);
}

function drawVan(g: Phaser.GameObjects.Graphics): void {
  drawWheelSet(g, VAN_FRAME, 6, 28, 7);

  g.fillStyle(0xe5e7eb, 1);
  g.fillRoundedRect(0, 1, VAN_FRAME.width, VAN_FRAME.height - 2, 3);
  g.lineStyle(1, OUTLINE, 0.85);
  g.strokeRoundedRect(0.5, 1.5, VAN_FRAME.width - 1, VAN_FRAME.height - 3, 3);
  g.fillStyle(0xf8fafc, 0.95);
  g.fillRect(2, 2, VAN_FRAME.width - 12, 2);
  g.fillStyle(0x1d4ed8, 1);
  g.fillRect(3, 4, 20, VAN_FRAME.height - 8);
  g.fillStyle(0x94a3b8, 1);
  g.fillRoundedRect(VAN_FRAME.width - 14, 2, 12, VAN_FRAME.height - 4, 2);
  drawGlassCanopy(g, VAN_FRAME.width - 14, 2, 12, VAN_FRAME.height - 4, VAN_FRAME.width - 9, 3);
  g.fillStyle(OUTLINE, 0.4);
  g.fillRect(9, 4, 1, VAN_FRAME.height - 8);
  g.fillRect(20, 4, 1, VAN_FRAME.height - 8);
  g.fillStyle(CHROME, 0.6);
  g.fillRect(4, VAN_FRAME.height / 2 - 0.6, 18, 1.2);
  drawVehicleLamps(g, VAN_FRAME);
}

function drawLimo(g: Phaser.GameObjects.Graphics): void {
  drawDetailedCar(g, {
    frame: LIMO_FRAME,
    body: 0x111827,
    roof: 0x020617,
    roofX: 7,
    roofY: 3,
    roofW: 23,
    roofH: 12,
    bodyRadius: 4,
    windshieldX: 36,
    windshieldW: 5,
    rearWheelX: 7,
    frontWheelX: 34,
  });
  g.fillStyle(CHROME, 0.7);
  g.fillRect(5, 4, 2, LIMO_FRAME.height - 8);
  g.fillRect(10, 4, 2, LIMO_FRAME.height - 8);
  g.fillRect(15, 4, 2, LIMO_FRAME.height - 8);
  g.fillRect(20, 4, 2, LIMO_FRAME.height - 8);
  g.fillRect(25, 4, 2, LIMO_FRAME.height - 8);
  g.fillRect(30, 4, 2, LIMO_FRAME.height - 8);
  g.fillStyle(blend(0x111827, CHROME, 0.25), 0.95);
  g.fillRect(4, LIMO_FRAME.height / 2 - 0.6, 30, 1.2);
}

function drawPlayerCar(g: Phaser.GameObjects.Graphics): void {
  drawDetailedCar(g, {
    frame: PLAYER_CAR_FRAME,
    body: 0x2f7d32,
    roof: 0x1b4d1f,
    roofX: 9,
    roofY: 3,
    roofW: 16,
    roofH: 13,
    bodyRadius: 4,
    windshieldX: 26,
    windshieldW: 5,
    rearWheelX: 6,
    frontWheelX: 24,
  });
}

function drawNpcCar(g: Phaser.GameObjects.Graphics): void {
  drawDetailedCar(g, {
    frame: NPC_CAR_FRAME,
    body: 0xb91c1c,
    roof: 0x7f1212,
    roofX: 9,
    roofY: 3,
    roofW: 14,
    roofH: 12,
    bodyRadius: 4,
    windshieldX: 24,
    windshieldW: 4,
    rearWheelX: 6,
    frontWheelX: 21,
  });
}

function drawPoliceCar(g: Phaser.GameObjects.Graphics): void {
  drawDetailedCar(g, {
    frame: POLICE_FRAME,
    body: 0x1d4ed8,
    roof: 0x0b245f,
    roofX: 9,
    roofY: 3,
    roofW: 16,
    roofH: 12,
    bodyRadius: 4,
    windshieldX: 26,
    windshieldW: 5,
    rearWheelX: 6,
    frontWheelX: 23,
  });
  g.fillStyle(0xf8fafc, 0.95);
  g.fillRect(9, 4, 8, POLICE_FRAME.height - 8);
  g.fillRect(18, 4, 5, POLICE_FRAME.height - 8);
  g.fillStyle(0x2563eb, 1);
  g.fillRoundedRect(13, 1, 8, 3, 1.5);
  g.fillStyle(0xef4444, 1);
  g.fillRect(13, 1, 3, 3);
  g.fillStyle(0x60a5fa, 1);
  g.fillRect(18, 1, 3, 3);
}

function drawPerson(g: Phaser.GameObjects.Graphics, shirt: number, skin: number): void {
  const c = PERSON / 2;
  g.fillStyle(shirt, 1);
  g.fillCircle(c - 1, c, 6);
  g.fillStyle(skin, 1);
  g.fillCircle(c + 3, c, 3.5);
}

/** Generate all game textures into the scene's texture manager. */
export function createGameTextures(scene: Phaser.Scene): void {
  const make = (key: string, w: number, h: number, paint: (g: Phaser.GameObjects.Graphics) => void): void => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    paint(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };

  make(TEX.playerCar, PLAYER_CAR_FRAME.width, PLAYER_CAR_FRAME.height, drawPlayerCar);
  make(TEX.npcCar, NPC_CAR_FRAME.width, NPC_CAR_FRAME.height, drawNpcCar);
  make(TEX.sedan, SEDAN_FRAME.width, SEDAN_FRAME.height, drawSedan);
  make(TEX.coupe, COUPE_FRAME.width, COUPE_FRAME.height, drawCoupe);
  make(TEX.muscle, MUSCLE_FRAME.width, MUSCLE_FRAME.height, drawMuscle);
  make(TEX.sports, SPORTS_FRAME.width, SPORTS_FRAME.height, drawSports);
  make(TEX.pickup, PICKUP_FRAME.width, PICKUP_FRAME.height, drawPickup);
  make(TEX.van, VAN_FRAME.width, VAN_FRAME.height, drawVan);
  make(TEX.limo, LIMO_FRAME.width, LIMO_FRAME.height, drawLimo);
  make(TEX.taxi, TAXI_FRAME.width, TAXI_FRAME.height, drawTaxi);
  make(TEX.policeCar, POLICE_FRAME.width, POLICE_FRAME.height, drawPoliceCar);

  make(TEX.ambulance, SVC_FRAME.width, SVC_FRAME.height, drawAmbulance);
  make(TEX.tow, SVC_FRAME.width, SVC_FRAME.height, drawTowTruck);

  make(TEX.player, PERSON, PERSON, (g) => drawPerson(g, 0x39ff14, 0xf5d6a8));
  make(TEX.pedestrian, PERSON, PERSON, (g) => drawPerson(g, 0xfbbf24, 0xf5d6a8));
  make(TEX.policeFoot, PERSON, PERSON, (g) => drawPerson(g, 0x3b82f6, 0xf5d6a8));
  make(TEX.medic, PERSON, PERSON, (g) => drawPerson(g, 0xf8fafc, 0xf5d6a8));
  make(TEX.towWorker, PERSON, PERSON, (g) => drawPerson(g, 0xf59e0b, 0xf5d6a8));

  make(TEX.ammo, 18, 18, (g) => {
    g.fillStyle(0x3f3f12, 1);
    g.fillRoundedRect(1, 4, 16, 10, 2);
    g.fillStyle(0xca8a04, 1);
    g.fillRoundedRect(1, 4, 16, 5, 2);
    g.fillStyle(0xfde047, 1);
    g.fillRect(4, 1, 2, 5);
    g.fillRect(8, 1, 2, 5);
    g.fillRect(12, 1, 2, 5);
  });
}
