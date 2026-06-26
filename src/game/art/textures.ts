import Phaser from 'phaser';

/**
 * Procedurally generated top-down sprite textures. Everything is drawn at
 * runtime with the Graphics API — no asset files, nothing copyrighted. Each
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

const CAR_W = 34;
const CAR_H = 18;
// Service vehicles (ambulance, tow truck) are longer and a touch wider than a
// regular car, matching their bigger collision radius.
const SVC_W = 40;
const SVC_H = 20;
const PERSON = 16;

interface CarShape {
  roofX?: number;
  roofY?: number;
  roofW?: number;
  roofH?: number;
  bodyRadius?: number;
  windshieldX?: number;
}

/** Draw a top-down car (pointing +x) into a graphics buffer. */
function drawCar(g: Phaser.GameObjects.Graphics, body: number, roof: number, shape: CarShape = {}): void {
  const roofX = shape.roofX ?? 9;
  const roofY = shape.roofY ?? 3;
  const roofW = shape.roofW ?? 14;
  const roofH = shape.roofH ?? CAR_H - 6;
  const bodyRadius = shape.bodyRadius ?? 4;
  const windshieldX = shape.windshieldX ?? CAR_W - 11;

  // Tyres first, so the body sits over them.
  g.fillStyle(0x111114, 1);
  g.fillRect(6, -1, 7, 3);
  g.fillRect(6, CAR_H - 2, 7, 3);
  g.fillRect(CAR_W - 14, -1, 7, 3);
  g.fillRect(CAR_W - 14, CAR_H - 2, 7, 3);

  // Body.
  g.fillStyle(body, 1);
  g.fillRoundedRect(0, 1, CAR_W, CAR_H - 2, bodyRadius);

  // Cabin / roof.
  g.fillStyle(roof, 1);
  g.fillRoundedRect(roofX, roofY, roofW, roofH, 3);

  // Windshield highlight near the front.
  g.fillStyle(0xbfe6ff, 0.85);
  g.fillRect(windshieldX, 4, 3, CAR_H - 8);

  // Headlights at the very front.
  g.fillStyle(0xfff6c2, 1);
  g.fillRect(CAR_W - 2, 3, 2, 3);
  g.fillRect(CAR_W - 2, CAR_H - 6, 2, 3);
}

/**
 * Draw a top-down ambulance (pointing +x). Built in the same layered style as
 * {@link drawCar} — tyres, body, cab, windshield, headlights — then dressed as
 * an emergency vehicle: a white box-body with red flank stripes, a roof cross
 * and a blue/red roof light bar.
 */
function drawAmbulance(g: Phaser.GameObjects.Graphics): void {
  // Tyres first, so the body sits over them.
  g.fillStyle(0x111114, 1);
  g.fillRect(8, -1, 8, 3);
  g.fillRect(8, SVC_H - 2, 8, 3);
  g.fillRect(SVC_W - 16, -1, 8, 3);
  g.fillRect(SVC_W - 16, SVC_H - 2, 8, 3);

  // Body: a tall white box (the patient compartment) running the full length.
  g.fillStyle(0xf8fafc, 1);
  g.fillRoundedRect(0, 1, SVC_W, SVC_H - 2, 4);

  // Driver cab at the front, a slightly cooler white to read as a separate cab.
  g.fillStyle(0xe2e8f0, 1);
  g.fillRoundedRect(SVC_W - 12, 2, 11, SVC_H - 4, 3);

  // A red stripe down each flank (the classic EMS belt line).
  g.fillStyle(0xdc2626, 1);
  g.fillRect(2, 3, 25, 2.5);
  g.fillRect(2, SVC_H - 5.5, 25, 2.5);

  // Red cross on the roof, centred over the box.
  g.fillStyle(0xdc2626, 1);
  g.fillRect(11.5, 6, 3, 8);
  g.fillRect(9, 8.5, 8, 3);

  // Roof light bar at the cab seam: blue one side, red the other.
  g.fillStyle(0x2563eb, 1);
  g.fillRect(25, 5, 3, 4);
  g.fillStyle(0xdc2626, 1);
  g.fillRect(25, SVC_H - 9, 3, 4);

  // Windshield near the very front.
  g.fillStyle(0xbfe6ff, 0.9);
  g.fillRect(SVC_W - 11, 4, 3, SVC_H - 8);

  // Headlights at the very front.
  g.fillStyle(0xfff6c2, 1);
  g.fillRect(SVC_W - 2, 3, 2, 3);
  g.fillRect(SVC_W - 2, SVC_H - 6, 2, 3);
}

/**
 * Draw a top-down tow truck (pointing +x). Same layered construction as
 * {@link drawCar}, dressed as a recovery vehicle: a dark chassis with a grey
 * flatbed and boom, amber cab, hazard stripes at the rear and a roof beacon.
 */
function drawTowTruck(g: Phaser.GameObjects.Graphics): void {
  // Tyres first, so the body sits over them.
  g.fillStyle(0x111114, 1);
  g.fillRect(8, -1, 8, 3);
  g.fillRect(8, SVC_H - 2, 8, 3);
  g.fillRect(SVC_W - 16, -1, 8, 3);
  g.fillRect(SVC_W - 16, SVC_H - 2, 8, 3);

  // Dark chassis running the full length.
  g.fillStyle(0x3f3f46, 1);
  g.fillRoundedRect(0, 1, SVC_W, SVC_H - 2, 3);

  // Grey flatbed deck over the rear two-thirds.
  g.fillStyle(0x52525b, 1);
  g.fillRect(2, 3, 24, SVC_H - 6);

  // Hazard stripes (amber/black) along the rear edge of the bed.
  for (let i = 0; i < 3; i++) {
    g.fillStyle(i % 2 === 0 ? 0xf59e0b : 0x111114, 1);
    g.fillRect(2 + i * 2.5, 3, 2.5, SVC_H - 6);
  }

  // Boom arm reaching back from the cab over the bed, ending in a hook.
  g.fillStyle(0x9ca3af, 1);
  g.fillRect(10, SVC_H / 2 - 1, 16, 2);
  g.fillStyle(0xd4d4d8, 1);
  g.fillCircle(10, SVC_H / 2, 2);

  // Amber cab at the front.
  g.fillStyle(0xf59e0b, 1);
  g.fillRoundedRect(SVC_W - 15, 1, 15, SVC_H - 2, 4);

  // Cab roof, a darker amber.
  g.fillStyle(0xb45309, 1);
  g.fillRoundedRect(SVC_W - 13, 3, 9, SVC_H - 6, 2);

  // Roof beacon (bright amber).
  g.fillStyle(0xfde047, 1);
  g.fillRect(SVC_W - 12, SVC_H / 2 - 2, 3, 4);

  // Windshield near the very front.
  g.fillStyle(0xbfe6ff, 0.9);
  g.fillRect(SVC_W - 7, 4, 3, SVC_H - 8);

  // Headlights at the very front.
  g.fillStyle(0xfff6c2, 1);
  g.fillRect(SVC_W - 2, 3, 2, 3);
  g.fillRect(SVC_W - 2, SVC_H - 6, 2, 3);
}

/** Draw a top-down taxi (pointing +x): bright yellow with a checker belt and roof sign. */
function drawTaxi(g: Phaser.GameObjects.Graphics): void {
  drawCar(g, 0xfacc15, 0xa16207);

  g.fillStyle(0x111114, 1);
  for (let i = 0; i < 5; i++) {
    const x = 7 + i * 4;
    g.fillRect(x, 4, 2, 2);
    g.fillRect(x + 2, CAR_H - 6, 2, 2);
  }

  g.fillStyle(0xf8fafc, 1);
  g.fillRoundedRect(13, 1, 8, 3, 1.5);
  g.fillStyle(0x111114, 1);
  g.fillRect(15, 2, 4, 1);
}

function drawSedan(g: Phaser.GameObjects.Graphics): void {
  drawCar(g, 0x0f766e, 0x164e63, { roofX: 8, roofW: 16 });
  g.fillStyle(0xe2e8f0, 0.75);
  g.fillRect(4, 8, 24, 1.5);
}

function drawCoupe(g: Phaser.GameObjects.Graphics): void {
  drawCar(g, 0x2563eb, 0x1e3a8a, { roofX: 11, roofW: 11, bodyRadius: 5 });
  g.fillStyle(0x93c5fd, 0.9);
  g.fillRect(8, 4, 3, 2);
}

function drawMuscle(g: Phaser.GameObjects.Graphics): void {
  drawCar(g, 0xea580c, 0x7c2d12, { roofX: 10, roofW: 12, bodyRadius: 5 });
  g.fillStyle(0xfef3c7, 0.9);
  g.fillRect(5, 5, 18, 2);
  g.fillRect(5, CAR_H - 7, 18, 2);
}

function drawSports(g: Phaser.GameObjects.Graphics): void {
  drawCar(g, 0xbe123c, 0x881337, { roofX: 12, roofY: 4, roofW: 10, roofH: CAR_H - 8, bodyRadius: 6 });
  g.fillStyle(0xfda4af, 0.9);
  g.fillRect(6, CAR_H / 2 - 1, 16, 2);
}

function drawPickup(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x111114, 1);
  g.fillRect(6, -1, 7, 3);
  g.fillRect(6, CAR_H - 2, 7, 3);
  g.fillRect(CAR_W - 14, -1, 7, 3);
  g.fillRect(CAR_W - 14, CAR_H - 2, 7, 3);

  g.fillStyle(0x65a30d, 1);
  g.fillRoundedRect(7, 1, CAR_W - 7, CAR_H - 2, 4);
  g.fillRect(0, 3, 13, CAR_H - 6);

  g.fillStyle(0x3f6212, 1);
  g.fillRoundedRect(14, 3, 10, CAR_H - 6, 3);

  g.lineStyle(1.5, 0xd9f99d, 0.7);
  g.strokeRect(2, 4, 9, CAR_H - 8);

  g.fillStyle(0xbfe6ff, 0.85);
  g.fillRect(CAR_W - 11, 4, 3, CAR_H - 8);

  g.fillStyle(0xfff6c2, 1);
  g.fillRect(CAR_W - 2, 3, 2, 3);
  g.fillRect(CAR_W - 2, CAR_H - 6, 2, 3);
}

function drawVan(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x111114, 1);
  g.fillRect(5, -1, 7, 3);
  g.fillRect(5, CAR_H - 2, 7, 3);
  g.fillRect(CAR_W - 14, -1, 7, 3);
  g.fillRect(CAR_W - 14, CAR_H - 2, 7, 3);

  g.fillStyle(0xe5e7eb, 1);
  g.fillRoundedRect(0, 1, CAR_W, CAR_H - 2, 3);
  g.fillStyle(0x1d4ed8, 1);
  g.fillRect(3, 4, 18, CAR_H - 8);
  g.fillStyle(0x94a3b8, 1);
  g.fillRoundedRect(18, 2, 12, CAR_H - 4, 2);
  g.fillStyle(0xbfe6ff, 0.9);
  g.fillRect(CAR_W - 10, 4, 3, CAR_H - 8);

  g.fillStyle(0xfff6c2, 1);
  g.fillRect(CAR_W - 2, 3, 2, 3);
  g.fillRect(CAR_W - 2, CAR_H - 6, 2, 3);
}

function drawLimo(g: Phaser.GameObjects.Graphics): void {
  drawCar(g, 0x111827, 0x020617, { roofX: 6, roofW: 19, bodyRadius: 4 });
  g.fillStyle(0xe5e7eb, 0.65);
  g.fillRect(5, 4, 2, CAR_H - 8);
  g.fillRect(10, 4, 2, CAR_H - 8);
  g.fillRect(15, 4, 2, CAR_H - 8);
}

function drawPerson(g: Phaser.GameObjects.Graphics, shirt: number, skin: number): void {
  const c = PERSON / 2;
  // Shoulders.
  g.fillStyle(shirt, 1);
  g.fillCircle(c - 1, c, 6);
  // Head toward the facing direction.
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

  make(TEX.playerCar, CAR_W, CAR_H, (g) => drawCar(g, 0x2f7d32, 0x1b4d1f));
  make(TEX.npcCar, CAR_W, CAR_H, (g) => drawCar(g, 0xb91c1c, 0x7f1212));
  make(TEX.sedan, CAR_W, CAR_H, drawSedan);
  make(TEX.coupe, CAR_W, CAR_H, drawCoupe);
  make(TEX.muscle, CAR_W, CAR_H, drawMuscle);
  make(TEX.sports, CAR_W, CAR_H, drawSports);
  make(TEX.pickup, CAR_W, CAR_H, drawPickup);
  make(TEX.van, CAR_W, CAR_H, drawVan);
  make(TEX.limo, CAR_W, CAR_H, drawLimo);
  make(TEX.taxi, CAR_W, CAR_H, drawTaxi);
  make(TEX.policeCar, CAR_W, CAR_H, (g) => drawCar(g, 0x1d4ed8, 0x0b245f));

  make(TEX.ambulance, SVC_W, SVC_H, drawAmbulance);
  make(TEX.tow, SVC_W, SVC_H, drawTowTruck);

  make(TEX.player, PERSON, PERSON, (g) => drawPerson(g, 0x39ff14, 0xf5d6a8));
  make(TEX.pedestrian, PERSON, PERSON, (g) => drawPerson(g, 0xfbbf24, 0xf5d6a8));
  make(TEX.policeFoot, PERSON, PERSON, (g) => drawPerson(g, 0x3b82f6, 0xf5d6a8));
  // Service-vehicle crew on foot: a white-coated medic and a hi-vis tow operator.
  make(TEX.medic, PERSON, PERSON, (g) => drawPerson(g, 0xf8fafc, 0xf5d6a8));
  make(TEX.towWorker, PERSON, PERSON, (g) => drawPerson(g, 0xf59e0b, 0xf5d6a8));

  make(TEX.ammo, 18, 18, (g) => {
    g.fillStyle(0x3f3f12, 1);
    g.fillRoundedRect(1, 4, 16, 10, 2);
    g.fillStyle(0xca8a04, 1);
    g.fillRoundedRect(1, 4, 16, 5, 2);
    // Three "shells" on top.
    g.fillStyle(0xfde047, 1);
    g.fillRect(4, 1, 2, 5);
    g.fillRect(8, 1, 2, 5);
    g.fillRect(12, 1, 2, 5);
  });
}
