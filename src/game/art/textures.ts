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
  policeCar: 'tex-police-car',
  player: 'tex-player',
  pedestrian: 'tex-pedestrian',
  policeFoot: 'tex-police-foot',
  ammo: 'tex-ammo',
} as const;

const CAR_W = 34;
const CAR_H = 18;
const PERSON = 16;

/** Draw a top-down car (pointing +x) into a graphics buffer. */
function drawCar(g: Phaser.GameObjects.Graphics, body: number, roof: number): void {
  // Tyres first, so the body sits over them.
  g.fillStyle(0x111114, 1);
  g.fillRect(6, -1, 7, 3);
  g.fillRect(6, CAR_H - 2, 7, 3);
  g.fillRect(CAR_W - 14, -1, 7, 3);
  g.fillRect(CAR_W - 14, CAR_H - 2, 7, 3);

  // Body.
  g.fillStyle(body, 1);
  g.fillRoundedRect(0, 1, CAR_W, CAR_H - 2, 4);

  // Cabin / roof.
  g.fillStyle(roof, 1);
  g.fillRoundedRect(9, 3, 14, CAR_H - 6, 3);

  // Windshield highlight near the front.
  g.fillStyle(0xbfe6ff, 0.85);
  g.fillRect(CAR_W - 11, 4, 3, CAR_H - 8);

  // Headlights at the very front.
  g.fillStyle(0xfff6c2, 1);
  g.fillRect(CAR_W - 2, 3, 2, 3);
  g.fillRect(CAR_W - 2, CAR_H - 6, 2, 3);
}

/** Draw a top-down person (facing +x) into a graphics buffer. */
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
  make(TEX.policeCar, CAR_W, CAR_H, (g) => drawCar(g, 0x1d4ed8, 0x0b245f));

  make(TEX.player, PERSON, PERSON, (g) => drawPerson(g, 0x39ff14, 0xf5d6a8));
  make(TEX.pedestrian, PERSON, PERSON, (g) => drawPerson(g, 0xfbbf24, 0xf5d6a8));
  make(TEX.policeFoot, PERSON, PERSON, (g) => drawPerson(g, 0x3b82f6, 0xf5d6a8));

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
