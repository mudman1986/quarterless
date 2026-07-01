import Phaser from 'phaser';
import type { GameRuntime } from '../arcade/types';
import {
  DEFAULT_CHARACTER_ID,
  PLAYABLE_CHARACTERS,
  getTangramCharacter,
  type TangramCharacterDefinition,
  type TangramCharacterId,
} from './penguinsOfTangramData';

const VIEWPORT_WIDTH = 960;
const VIEWPORT_HEIGHT = 540;
const WORLD_WIDTH = 3600;
const WORLD_HEIGHT = 540;
const PLAYER_WIDTH = 52;
const PLAYER_HEIGHT = 72;
const PLAYER_MAX_SPEED = 340;
const PLAYER_POWERED_SPEED = 410;
const PLAYER_JUMP_VELOCITY = -690;
const PLAYER_POWERED_JUMP_VELOCITY = -760;
const PLAYER_ACCELERATION = 1900;
const PLAYER_DRAG = 1650;
const PLAYER_GRAVITY = 2200;
const PLAYER_MAX_FALL_SPEED = 960;
const POWERUP_DURATION_MS = 12_000;

type Rect = { x: number; y: number; width: number; height: number };
type Platform = Rect & { color: number; trim: number };
type Collectible = { x: number; y: number; sprite: Phaser.GameObjects.Container; collected: boolean };
type Hazard = Rect & { sprite: Phaser.GameObjects.Container };
type Enemy = {
  x: number;
  y: number;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  speed: number;
  direction: 1 | -1;
  active: boolean;
  sprite: Phaser.GameObjects.Container;
};

type HudSnapshot = {
  characterName: string;
  characterClass: string;
  badgesCollected: number;
  totalBadges: number;
  checkpointLabel: string;
  powerLabel: string;
  hint: string;
};

type LevelSummary = {
  characterName: string;
  badgesCollected: number;
  totalBadges: number;
  durationSeconds: number;
  checkpointLabel: string;
  falls: number;
};

type TestHook = {
  state: 'select' | 'running' | 'complete';
  selectedCharacterId: TangramCharacterId;
  badgesCollected: number;
  totalBadges: number;
  checkpointLabel: string;
  poweredUp: boolean;
};

const levelPlatforms: readonly Platform[] = [
  { x: 0, y: 448, width: 480, height: 92, color: 0x73c66f, trim: 0x5aa65a },
  { x: 550, y: 404, width: 180, height: 24, color: 0xffd166, trim: 0xe3a938 },
  { x: 780, y: 448, width: 480, height: 92, color: 0x73c66f, trim: 0x5aa65a },
  { x: 930, y: 330, width: 150, height: 22, color: 0x8dc0ff, trim: 0x5f8ee0 },
  { x: 1110, y: 278, width: 130, height: 22, color: 0xffb3c7, trim: 0xff8ea8 },
  { x: 1330, y: 448, width: 200, height: 92, color: 0x73c66f, trim: 0x5aa65a },
  { x: 1740, y: 402, width: 150, height: 24, color: 0xffd166, trim: 0xe3a938 },
  { x: 1950, y: 448, width: 550, height: 92, color: 0x73c66f, trim: 0x5aa65a },
  { x: 2060, y: 332, width: 150, height: 22, color: 0x8dc0ff, trim: 0x5f8ee0 },
  { x: 2260, y: 284, width: 130, height: 22, color: 0xffb3c7, trim: 0xff8ea8 },
  { x: 2560, y: 448, width: 420, height: 92, color: 0x73c66f, trim: 0x5aa65a },
  { x: 2860, y: 362, width: 120, height: 22, color: 0xffd166, trim: 0xe3a938 },
  { x: 3040, y: 448, width: 420, height: 92, color: 0x73c66f, trim: 0x5aa65a },
  { x: 3250, y: 336, width: 130, height: 22, color: 0x8dc0ff, trim: 0x5f8ee0 },
];

const collectiblePositions = [
  { x: 232, y: 386 },
  { x: 612, y: 352 },
  { x: 958, y: 278 },
  { x: 1180, y: 226 },
  { x: 1452, y: 386 },
  { x: 1808, y: 350 },
  { x: 2128, y: 280 },
  { x: 2308, y: 232 },
  { x: 2732, y: 386 },
  { x: 2918, y: 312 },
  { x: 3170, y: 386 },
  { x: 3300, y: 284 },
] as const;

const checkpointZone: Rect & { label: string } = {
  x: 2140,
  y: 300,
  width: 54,
  height: 132,
  label: 'Library Steps',
};

const goalZone: Rect = { x: 3380, y: 252, width: 84, height: 170 };
const powerupZone: Rect = { x: 1160, y: 198, width: 44, height: 56 };

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

class PenguinsOfTangramScene extends Phaser.Scene {
  private readonly character: TangramCharacterDefinition;
  private readonly callbacks: {
    onHudUpdate: (snapshot: HudSnapshot) => void;
    onComplete: (summary: LevelSummary) => void;
    onStateChange: (state: TestHook) => void;
  };

  private keys:
    | ReturnType<Phaser.Input.Keyboard.KeyboardPlugin['addKeys']>
    | undefined;
  private player!: Phaser.GameObjects.Container;
  private playerAura!: Phaser.GameObjects.Ellipse;
  private checkpointBanner!: Phaser.GameObjects.Container;
  private goalBanner!: Phaser.GameObjects.Container;
  private powerSnack!: Phaser.GameObjects.Container;
  private platforms: readonly Platform[] = levelPlatforms;
  private collectibles: Collectible[] = [];
  private hazards: Hazard[] = [];
  private enemies: Enemy[] = [];
  private playerState = {
    x: 104,
    y: 376,
    velocityX: 0,
    velocityY: 0,
    grounded: false,
    facing: 1 as 1 | -1,
  };
  private startTime = 0;
  private lastCheckpoint = { x: 104, y: 376, label: 'School Gate' };
  private badgesCollected = 0;
  private falls = 0;
  private powerUntil = 0;
  private finished = false;
  private checkpointActivated = false;
  private hint = 'Collect every Tangram badge and ring the festival bell.';
  private hintUntil = 0;
  private lastJumpDown = false;
  private invulnerableUntil = 0;

  constructor(
    character: TangramCharacterDefinition,
    callbacks: {
      onHudUpdate: (snapshot: HudSnapshot) => void;
      onComplete: (summary: LevelSummary) => void;
      onStateChange: (state: TestHook) => void;
    },
  ) {
    super('PenguinsOfTangram');
    this.character = character;
    this.callbacks = callbacks;
  }

  create(): void {
    this.startTime = this.time.now;
    this.cameras.main.setBackgroundColor('#8fd8ff');
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.createBackdrop();
    this.createPlatforms();
    this.createDecor();
    this.createCollectibles();
    this.createHazards();
    this.createEnemies();
    this.createCheckpoint();
    this.createGoal();
    this.createPowerSnack();
    this.player = this.createPlayer();
    this.playerAura = this.add.ellipse(0, 0, 88, 92, 0xffef8e, 0.24).setVisible(false);
    this.playerAura.setDepth(4);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12, 120, 30);
    this.keys = this.input.keyboard?.addKeys({
      left: 'LEFT',
      right: 'RIGHT',
      up: 'UP',
      a: 'A',
      d: 'D',
      w: 'W',
      space: 'SPACE',
    });
    this.updateHud();
  }

  update(_: number, deltaMs: number): void {
    if (this.finished) return;
    const delta = Math.min(deltaMs / 1000, 1 / 30);
    this.updateEnemies(delta);
    this.updatePlayer(delta);
    this.updatePlayerVisuals();
    this.handleCollectibles();
    this.handleHazards();
    this.handleEnemies();
    this.handleCheckpoint();
    this.handlePowerSnack();
    this.handleGoal();
    this.updateHintExpiry();
    this.updatePowerVisual();
  }

  private createBackdrop(): void {
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x8fd8ff).setScrollFactor(
      0,
      0,
    );
    this.add.rectangle(WORLD_WIDTH / 2, 390, WORLD_WIDTH, 180, 0xb9ec7b).setScrollFactor(0.12, 0.2);
    for (let index = 0; index < 8; index++) {
      const cloudX = 160 + index * 440;
      const cloudY = 90 + (index % 3) * 38;
      this.add.ellipse(cloudX, cloudY, 120, 44, 0xffffff, 0.95).setScrollFactor(0.12, 0.08);
      this.add.ellipse(cloudX + 40, cloudY + 6, 88, 36, 0xffffff, 0.95).setScrollFactor(0.12, 0.08);
      this.add.ellipse(cloudX - 46, cloudY + 8, 76, 32, 0xffffff, 0.95).setScrollFactor(0.12, 0.08);
    }
    for (let index = 0; index < 7; index++) {
      const hillX = 260 + index * 520;
      this.add.ellipse(hillX, 430, 360, 180, index % 2 === 0 ? 0x88d06d : 0x72c25f, 1).setScrollFactor(
        0.28,
        0.3,
      );
    }
    const school = this.add.container(340, 294);
    school.setScrollFactor(0.3, 0.34);
    school.add([
      this.add.rectangle(0, 34, 340, 140, 0xfff4d6),
      this.add.rectangle(0, -10, 220, 70, 0xffd166),
      this.add.rectangle(0, 90, 380, 28, 0xff8f66),
      this.add.rectangle(-92, 34, 38, 76, 0x9bd0ff),
      this.add.rectangle(-28, 34, 38, 76, 0x9bd0ff),
      this.add.rectangle(36, 34, 38, 76, 0x9bd0ff),
      this.add.rectangle(100, 34, 38, 76, 0x9bd0ff),
      this.add.rectangle(0, 66, 68, 76, 0x8d5b34),
      this.add.text(0, -18, 'TANGRAM', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '28px',
        color: '#0f3550',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    ]);
    const playground = this.add.container(1380, 348);
    playground.setScrollFactor(0.52, 0.48);
    playground.add([
      this.add.rectangle(-50, 0, 24, 144, 0xff8f66),
      this.add.rectangle(50, 0, 24, 144, 0xff8f66),
      this.add.rectangle(0, -56, 140, 18, 0xffd166),
      this.add.rectangle(-84, 46, 20, 96, 0x5bb4ff),
      this.add.rectangle(84, 46, 20, 96, 0x5bb4ff),
      this.add.rectangle(0, 94, 210, 18, 0x7ad46e),
    ]);
  }

  private createPlatforms(): void {
    for (const platform of this.platforms) {
      const body = this.add.rectangle(
        platform.x + platform.width / 2,
        platform.y + platform.height / 2,
        platform.width,
        platform.height,
        platform.color,
      );
      body.setOrigin(0.5);
      body.setDepth(2);
      const topTrim = this.add.rectangle(
        platform.x + platform.width / 2,
        platform.y + 6,
        platform.width,
        12,
        platform.trim,
      );
      topTrim.setOrigin(0.5);
      topTrim.setDepth(3);
    }
  }

  private createDecor(): void {
    const classSigns: Array<{ x: number; label: string; color: string }> = [
      { x: 410, label: 'Penguins', color: '#59d0ff' },
      { x: 990, label: 'Monkeys', color: '#ffb15f' },
      { x: 1630, label: 'Turtles', color: '#71d2b6' },
      { x: 2480, label: 'Crocodiles', color: '#80d36d' },
      { x: 3150, label: 'Lions', color: '#ffd166' },
    ];
    for (const sign of classSigns) {
      const post = this.add.container(sign.x, 348);
      post.setDepth(1.5);
      post.add([
        this.add.rectangle(0, 54, 12, 106, 0x8d5b34),
        this.add.rectangle(0, 8, 112, 44, Phaser.Display.Color.HexStringToColor(sign.color).color),
        this.add.text(0, 8, sign.label, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '18px',
          color: '#103047',
          fontStyle: 'bold',
        }).setOrigin(0.5),
      ]);
    }
    this.add.text(136, 246, 'School Gate Start', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#103047',
      fontStyle: 'bold',
      backgroundColor: '#ffffffaa',
      padding: { left: 10, right: 10, top: 6, bottom: 6 },
    }).setDepth(5);
    this.add.text(3316, 208, 'Festival Bell', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#103047',
      fontStyle: 'bold',
      backgroundColor: '#ffffffaa',
      padding: { left: 10, right: 10, top: 6, bottom: 6 },
    }).setDepth(5);
  }

  private createCollectibles(): void {
    this.collectibles = collectiblePositions.map((entry) => ({
      x: entry.x,
      y: entry.y,
      collected: false,
      sprite: this.createBadge(entry.x, entry.y),
    }));
  }

  private createHazards(): void {
    const hazardData: readonly Rect[] = [
      { x: 1540, y: 460, width: 160, height: 54 },
      { x: 2992, y: 460, width: 44, height: 54 },
    ];
    this.hazards = hazardData.map((hazard) => ({
      ...hazard,
      sprite: this.createPuddle(hazard),
    }));
  }

  private createEnemies(): void {
    const enemyData = [
      { x: 884, y: 404, width: 44, height: 40, minX: 820, maxX: 1180, speed: 72 },
      { x: 2010, y: 404, width: 44, height: 40, minX: 1980, maxX: 2440, speed: 84 },
      { x: 3098, y: 404, width: 44, height: 40, minX: 3070, maxX: 3370, speed: 88 },
    ] as const;
    this.enemies = enemyData.map((enemy, index) => ({
      ...enemy,
      direction: index % 2 === 0 ? 1 : -1,
      active: true,
      sprite: this.createCritter(enemy.x, enemy.y, index),
    }));
  }

  private createCheckpoint(): void {
    this.checkpointBanner = this.add.container(checkpointZone.x + 20, checkpointZone.y + 60);
    this.checkpointBanner.setDepth(4);
    this.checkpointBanner.add([
      this.add.rectangle(0, 24, 10, 120, 0x8d5b34),
      this.add.rectangle(34, -16, 66, 34, 0xffd166),
      this.add.text(34, -16, 'CHECK', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        color: '#103047',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    ]);
  }

  private createGoal(): void {
    this.goalBanner = this.add.container(goalZone.x + 34, goalZone.y + 84);
    this.goalBanner.setDepth(4);
    this.goalBanner.add([
      this.add.rectangle(-22, 56, 10, 140, 0x8d5b34),
      this.add.rectangle(22, 56, 10, 140, 0x8d5b34),
      this.add.rectangle(0, -8, 110, 18, 0xff8f66),
      this.add.rectangle(0, 18, 96, 44, 0x59d0ff),
      this.add.text(0, 18, 'RING!', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: '#103047',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    ]);
  }

  private createPowerSnack(): void {
    this.powerSnack = this.add.container(powerupZone.x + powerupZone.width / 2, powerupZone.y + 26);
    this.powerSnack.setDepth(4);
    this.powerSnack.add([
      this.add.ellipse(0, 0, 44, 30, 0xfff0a8),
      this.add.ellipse(0, -2, 36, 22, 0xffd166),
      this.add.text(0, 0, '★', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#8d5b34',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    ]);
  }

  private createPlayer(): Phaser.GameObjects.Container {
    const container = this.add.container(this.playerState.x, this.playerState.y);
    container.setSize(PLAYER_WIDTH, PLAYER_HEIGHT);
    container.setDepth(6);
    const bodyColor = Phaser.Display.Color.HexStringToColor(this.character.body).color;
    const accentColor = Phaser.Display.Color.HexStringToColor(this.character.accent).color;
    const accessoryColor = Phaser.Display.Color.HexStringToColor(this.character.accessory).color;
    container.add([
      this.add.ellipse(0, 22, 38, 14, 0x000000, 0.18),
      this.add.ellipse(0, -8, 44, 56, bodyColor),
      this.add.ellipse(0, -2, 24, 30, 0xf7fbff),
      this.add.rectangle(0, -30, 36, 10, accentColor),
      this.add.rectangle(-20, -8, 10, 24, accessoryColor),
      this.add.rectangle(20, -8, 10, 24, accessoryColor),
      this.add.circle(-9, -18, 4, 0xffffff),
      this.add.circle(9, -18, 4, 0xffffff),
      this.add.circle(-9, -18, 2, 0x103047),
      this.add.circle(9, -18, 2, 0x103047),
      this.add.triangle(0, -8, -8, -4, 8, -4, 0, 8, 0xffb15f),
      this.add.ellipse(-10, 22, 14, 8, 0xffb15f),
      this.add.ellipse(10, 22, 14, 8, 0xffb15f),
    ]);
    return container;
  }

  private createBadge(x: number, y: number): Phaser.GameObjects.Container {
    const badge = this.add.container(x, y);
    badge.setDepth(4);
    badge.add([
      this.add.circle(0, 0, 13, 0xffd166),
      this.add.circle(0, 0, 9, 0xfff1b8),
      this.add.text(0, 0, '★', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        color: '#8d5b34',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    ]);
    return badge;
  }

  private createPuddle(hazard: Rect): Phaser.GameObjects.Container {
    const puddle = this.add.container(hazard.x + hazard.width / 2, hazard.y + hazard.height / 2);
    puddle.setDepth(3.5);
    puddle.add([
      this.add.ellipse(0, 0, hazard.width, hazard.height - 8, 0x5cc8ff),
      this.add.ellipse(-20, -4, hazard.width * 0.36, hazard.height * 0.36, 0x9fe4ff, 0.85),
      this.add.ellipse(16, 5, hazard.width * 0.28, hazard.height * 0.24, 0x9fe4ff, 0.75),
    ]);
    return puddle;
  }

  private createCritter(x: number, y: number, index: number): Phaser.GameObjects.Container {
    const palette = [0xff8f66, 0x71d2b6, 0xffd166][index % 3];
    const critter = this.add.container(x + 22, y + 18);
    critter.setDepth(5);
    critter.add([
      this.add.rectangle(0, 10, 38, 24, palette),
      this.add.circle(-12, 0, 10, 0x103047),
      this.add.circle(12, 0, 10, 0x103047),
      this.add.circle(-12, 0, 4, 0xffffff),
      this.add.circle(12, 0, 4, 0xffffff),
      this.add.circle(-12, 0, 2, 0x103047),
      this.add.circle(12, 0, 2, 0x103047),
      this.add.rectangle(-12, 24, 10, 6, 0x5f3f20),
      this.add.rectangle(12, 24, 10, 6, 0x5f3f20),
    ]);
    return critter;
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      enemy.x += enemy.speed * enemy.direction * delta;
      if (enemy.x <= enemy.minX) {
        enemy.x = enemy.minX;
        enemy.direction = 1;
      }
      if (enemy.x >= enemy.maxX) {
        enemy.x = enemy.maxX;
        enemy.direction = -1;
      }
      enemy.sprite.x = enemy.x + enemy.width / 2;
      enemy.sprite.scaleX = enemy.direction;
    }
  }

  private updatePlayer(delta: number): void {
    const leftDown = Boolean(this.keys?.left.isDown || this.keys?.a.isDown);
    const rightDown = Boolean(this.keys?.right.isDown || this.keys?.d.isDown);
    const jumpDown = Boolean(this.keys?.up.isDown || this.keys?.w.isDown || this.keys?.space.isDown);
    const inputDirection = (rightDown ? 1 : 0) - (leftDown ? 1 : 0);
    const maxSpeed = this.isPoweredUp() ? PLAYER_POWERED_SPEED : PLAYER_MAX_SPEED;
    const jumpVelocity = this.isPoweredUp() ? PLAYER_POWERED_JUMP_VELOCITY : PLAYER_JUMP_VELOCITY;
    const previous = { x: this.playerState.x, y: this.playerState.y };

    if (inputDirection !== 0) {
      this.playerState.velocityX += inputDirection * PLAYER_ACCELERATION * delta;
      this.playerState.velocityX = clamp(this.playerState.velocityX, -maxSpeed, maxSpeed);
      this.playerState.facing = inputDirection > 0 ? 1 : -1;
    } else {
      const drag = PLAYER_DRAG * delta;
      if (Math.abs(this.playerState.velocityX) <= drag) this.playerState.velocityX = 0;
      else this.playerState.velocityX -= Math.sign(this.playerState.velocityX) * drag;
    }

    if (jumpDown && !this.lastJumpDown && this.playerState.grounded) {
      this.playerState.velocityY = jumpVelocity;
      this.playerState.grounded = false;
      this.setHint('Leap over the puddles and stomp the schoolyard critters.');
    }
    this.lastJumpDown = jumpDown;

    this.playerState.x += this.playerState.velocityX * delta;
    this.resolveHorizontal(previous.x);
    this.playerState.velocityY = clamp(
      this.playerState.velocityY + PLAYER_GRAVITY * delta,
      -1600,
      PLAYER_MAX_FALL_SPEED,
    );
    this.playerState.y += this.playerState.velocityY * delta;
    this.playerState.grounded = false;
    this.resolveVertical(previous.y);

    if (this.playerState.y > WORLD_HEIGHT + 120) {
      this.respawn('Take the safer playground route!');
      return;
    }
    this.playerState.x = clamp(this.playerState.x, 0, WORLD_WIDTH - PLAYER_WIDTH);
    this.player.x = this.playerState.x + PLAYER_WIDTH / 2;
    this.player.y = this.playerState.y + PLAYER_HEIGHT / 2;
  }

  private resolveHorizontal(previousX: number): void {
    const playerRect = this.playerRect();
    for (const platform of this.platforms) {
      if (!intersects(playerRect, platform)) continue;
      const wasLeft = previousX + PLAYER_WIDTH <= platform.x;
      const wasRight = previousX >= platform.x + platform.width;
      if (wasLeft) this.playerState.x = platform.x - PLAYER_WIDTH;
      else if (wasRight) this.playerState.x = platform.x + platform.width;
      else if (this.playerState.velocityX > 0) this.playerState.x = platform.x - PLAYER_WIDTH;
      else this.playerState.x = platform.x + platform.width;
      this.playerState.velocityX = 0;
      playerRect.x = this.playerState.x;
    }
  }

  private resolveVertical(previousY: number): void {
    const playerRect = this.playerRect();
    for (const platform of this.platforms) {
      if (!intersects(playerRect, platform)) continue;
      const wasAbove = previousY + PLAYER_HEIGHT <= platform.y;
      const wasBelow = previousY >= platform.y + platform.height;
      if (wasAbove && this.playerState.velocityY >= 0) {
        this.playerState.y = platform.y - PLAYER_HEIGHT;
        this.playerState.velocityY = 0;
        this.playerState.grounded = true;
      } else if (wasBelow && this.playerState.velocityY < 0) {
        this.playerState.y = platform.y + platform.height;
        this.playerState.velocityY = 0;
      } else if (this.playerState.velocityY > 0) {
        this.playerState.y = platform.y - PLAYER_HEIGHT;
        this.playerState.velocityY = 0;
        this.playerState.grounded = true;
      }
      playerRect.y = this.playerState.y;
    }
  }

  private updatePlayerVisuals(): void {
    this.player.scaleX = this.playerState.facing;
    this.player.rotation = Phaser.Math.Linear(this.player.rotation, this.playerState.velocityX * 0.0008, 0.15);
    this.player.y += this.playerState.grounded ? Math.sin(this.time.now * 0.02) * 0.08 : 0;
  }

  private handleCollectibles(): void {
    const playerRect = this.playerRect();
    for (const collectible of this.collectibles) {
      if (collectible.collected) continue;
      if (
        intersects(playerRect, {
          x: collectible.x - 13,
          y: collectible.y - 13,
          width: 26,
          height: 26,
        })
      ) {
        collectible.collected = true;
        collectible.sprite.setVisible(false);
        this.badgesCollected += 1;
        this.setHint(`Badges collected: ${this.badgesCollected}/${this.collectibles.length}`);
        this.updateHud();
      }
    }
  }

  private handleHazards(): void {
    if (this.time.now < this.invulnerableUntil) return;
    const feetRect = {
      x: this.playerState.x + 8,
      y: this.playerState.y + PLAYER_HEIGHT - 14,
      width: PLAYER_WIDTH - 16,
      height: 16,
    };
    for (const hazard of this.hazards) {
      if (intersects(feetRect, hazard)) {
        this.respawn('Splash! Start again from the checkpoint.');
        return;
      }
    }
  }

  private handleEnemies(): void {
    if (this.time.now < this.invulnerableUntil) return;
    const playerRect = this.playerRect();
    const previousBottom = this.playerState.y + PLAYER_HEIGHT - this.playerState.velocityY * (1 / 60);
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const enemyRect = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
      if (!intersects(playerRect, enemyRect)) continue;
      if (this.playerState.velocityY > 0 && previousBottom <= enemy.y + 10) {
        enemy.active = false;
        enemy.sprite.setVisible(false);
        this.playerState.velocityY = -420;
        this.setHint('Nice stomp! Keep moving to the festival bell.');
        return;
      }
      this.respawn('A critter bumped you back to safety.');
      return;
    }
  }

  private handleCheckpoint(): void {
    if (this.checkpointActivated) return;
    if (intersects(this.playerRect(), checkpointZone)) {
      this.checkpointActivated = true;
      this.lastCheckpoint = { x: checkpointZone.x + 12, y: checkpointZone.y - 8, label: checkpointZone.label };
      this.checkpointBanner.list.forEach((child) => child.setTint(0x7dfc8a));
      this.setHint(`Checkpoint reached: ${checkpointZone.label}`);
      this.updateHud();
    }
  }

  private handlePowerSnack(): void {
    if (!this.powerSnack.visible) return;
    if (
      intersects(this.playerRect(), {
        x: powerupZone.x,
        y: powerupZone.y,
        width: powerupZone.width,
        height: powerupZone.height,
      })
    ) {
      this.powerSnack.setVisible(false);
      this.powerUntil = this.time.now + POWERUP_DURATION_MS;
      this.setHint('Super snack! Bigger jumps and faster waddles for a short time.');
      this.updateHud();
    }
  }

  private handleGoal(): void {
    if (!intersects(this.playerRect(), goalZone)) return;
    if (this.badgesCollected < this.collectibles.length) {
      this.setHint(`You still need ${this.collectibles.length - this.badgesCollected} more Tangram badges.`);
      return;
    }
    this.finished = true;
    const summary: LevelSummary = {
      characterName: this.character.name,
      badgesCollected: this.badgesCollected,
      totalBadges: this.collectibles.length,
      durationSeconds: Math.max(1, Math.round((this.time.now - this.startTime) / 1000)),
      checkpointLabel: this.lastCheckpoint.label,
      falls: this.falls,
    };
    this.callbacks.onStateChange(this.currentTestHook('complete'));
    this.callbacks.onComplete(summary);
  }

  private updateHintExpiry(): void {
    if (this.hintUntil !== 0 && this.time.now > this.hintUntil) {
      this.hintUntil = 0;
      this.hint = this.isPoweredUp()
        ? 'Power snack active — race ahead while it lasts.'
        : 'Collect every Tangram badge and ring the festival bell.';
      this.updateHud();
    }
  }

  private updatePowerVisual(): void {
    const powered = this.isPoweredUp();
    this.playerAura.setVisible(powered);
    this.playerAura.x = this.player.x;
    this.playerAura.y = this.player.y - 10;
    this.callbacks.onStateChange(this.currentTestHook('running'));
  }

  private respawn(message: string): void {
    this.falls += 1;
    this.playerState.x = this.lastCheckpoint.x;
    this.playerState.y = this.lastCheckpoint.y;
    this.playerState.velocityX = 0;
    this.playerState.velocityY = 0;
    this.playerState.grounded = false;
    this.invulnerableUntil = this.time.now + 1200;
    this.cameras.main.shake(180, 0.004);
    this.setHint(message);
    this.updateHud();
  }

  private setHint(message: string): void {
    this.hint = message;
    this.hintUntil = this.time.now + 3200;
    this.updateHud();
  }

  private updateHud(): void {
    this.callbacks.onHudUpdate({
      characterName: this.character.name,
      characterClass: this.character.className,
      badgesCollected: this.badgesCollected,
      totalBadges: this.collectibles.length,
      checkpointLabel: this.lastCheckpoint.label,
      powerLabel: this.isPoweredUp() ? 'Super snack active' : 'No power-up',
      hint: this.hint,
    });
    this.callbacks.onStateChange(this.currentTestHook(this.finished ? 'complete' : 'running'));
  }

  private currentTestHook(state: TestHook['state']): TestHook {
    return {
      state,
      selectedCharacterId: this.character.id,
      badgesCollected: this.badgesCollected,
      totalBadges: this.collectibles.length,
      checkpointLabel: this.lastCheckpoint.label,
      poweredUp: this.isPoweredUp(),
    };
  }

  private isPoweredUp(): boolean {
    return this.time.now < this.powerUntil;
  }

  private playerRect(): Rect {
    return { x: this.playerState.x, y: this.playerState.y, width: PLAYER_WIDTH, height: PLAYER_HEIGHT };
  }
}

function createHudPanel(parent: HTMLElement): {
  panel: HTMLDivElement;
  character: HTMLSpanElement;
  badges: HTMLSpanElement;
  checkpoint: HTMLSpanElement;
  power: HTMLSpanElement;
  hint: HTMLParagraphElement;
} {
  const panel = document.createElement('section');
  panel.className = 'tangram-platformer-hud';
  panel.innerHTML = `
    <div class="tangram-platformer-chip-grid">
      <span class="tangram-platformer-chip"><strong>Character</strong><span data-field="character"></span></span>
      <span class="tangram-platformer-chip"><strong>Badges</strong><span data-field="badges"></span></span>
      <span class="tangram-platformer-chip"><strong>Checkpoint</strong><span data-field="checkpoint"></span></span>
      <span class="tangram-platformer-chip"><strong>Power</strong><span data-field="power"></span></span>
    </div>
    <p class="tangram-platformer-hint" data-field="hint"></p>`;
  parent.append(panel);
  return {
    panel,
    character: panel.querySelector('[data-field="character"]') as HTMLSpanElement,
    badges: panel.querySelector('[data-field="badges"]') as HTMLSpanElement,
    checkpoint: panel.querySelector('[data-field="checkpoint"]') as HTMLSpanElement,
    power: panel.querySelector('[data-field="power"]') as HTMLSpanElement,
    hint: panel.querySelector('[data-field="hint"]') as HTMLParagraphElement,
  };
}

function createCharacterSelect(
  parent: HTMLElement,
  selectedCharacterId: TangramCharacterId,
  onSelect: (id: TangramCharacterId) => void,
  onStart: () => void,
): {
  overlay: HTMLDivElement;
  updateSelection: (id: TangramCharacterId) => void;
} {
  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay';
  const title = document.createElement('section');
  title.className = 'tangram-platformer-panel';
  const description = document.createElement('p');
  description.className = 'tangram-platformer-copy';
  const roster = document.createElement('div');
  roster.className = 'tangram-platformer-character-grid';
  const startButton = document.createElement('button');
  startButton.className = 'tangram-platformer-button';
  startButton.type = 'button';
  startButton.textContent = 'Start adventure';
  startButton.addEventListener('click', onStart);
  title.innerHTML = `
    <p class="tangram-platformer-kicker">New Phaser platformer</p>
    <h2>Penguins of Tangram</h2>
    <p class="tangram-platformer-copy">
      Choose your Tangram classmate, collect every badge, reach the checkpoint at the library steps,
      and ring the festival bell at the end of the playground.
    </p>
    <p class="tangram-platformer-copy tangram-platformer-copy--soft">
      Style direction: cartoony, playful, and school-themed. Character differences are mostly cosmetic for now.
    </p>`;

  const buttons = PLAYABLE_CHARACTERS.map((character) => {
    const button = document.createElement('button');
    button.className = 'tangram-platformer-character';
    button.type = 'button';
    button.dataset.characterId = character.id;
    button.innerHTML = `
      <strong>${character.name}</strong>
      <span>${character.className}</span>
      <small>${character.description}</small>`;
    button.style.setProperty('--accent', character.accent);
    button.addEventListener('click', () => onSelect(character.id));
    roster.append(button);
    return button;
  });

  description.className = 'tangram-platformer-selection-note';
  title.append(roster, description, startButton);
  overlay.append(title);
  parent.append(overlay);

  const updateSelection = (id: TangramCharacterId): void => {
    const character = getTangramCharacter(id);
    for (const button of buttons) {
      const selected = button.dataset.characterId === id;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    description.textContent = `${character.name} — ${character.className}. ${character.description}`;
  };
  updateSelection(selectedCharacterId);
  return { overlay, updateSelection };
}

function createCompletionOverlay(
  parent: HTMLElement,
  onReplay: () => void,
  onChooseAnother: () => void,
): {
  overlay: HTMLDivElement;
  show: (summary: LevelSummary) => void;
} {
  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay tangram-platformer-overlay--complete';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="tangram-platformer-panel tangram-platformer-panel--complete">
      <p class="tangram-platformer-kicker">Level complete</p>
      <h2>Festival bell reached!</h2>
      <p class="tangram-platformer-copy" data-field="summary"></p>
      <div class="tangram-platformer-summary-grid">
        <span class="tangram-platformer-chip"><strong>Badges</strong><span data-field="badges"></span></span>
        <span class="tangram-platformer-chip"><strong>Time</strong><span data-field="time"></span></span>
        <span class="tangram-platformer-chip"><strong>Checkpoint</strong><span data-field="checkpoint"></span></span>
        <span class="tangram-platformer-chip"><strong>Falls</strong><span data-field="falls"></span></span>
      </div>
      <div class="tangram-platformer-action-row">
        <button class="tangram-platformer-button" type="button" data-action="replay">Play again</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="choose">
          Choose another class
        </button>
      </div>
    </section>`;
  parent.append(overlay);
  overlay.querySelector<HTMLButtonElement>('[data-action="replay"]')?.addEventListener('click', onReplay);
  overlay
    .querySelector<HTMLButtonElement>('[data-action="choose"]')
    ?.addEventListener('click', onChooseAnother);
  const summaryText = overlay.querySelector('[data-field="summary"]') as HTMLParagraphElement;
  const badges = overlay.querySelector('[data-field="badges"]') as HTMLSpanElement;
  const time = overlay.querySelector('[data-field="time"]') as HTMLSpanElement;
  const checkpoint = overlay.querySelector('[data-field="checkpoint"]') as HTMLSpanElement;
  const falls = overlay.querySelector('[data-field="falls"]') as HTMLSpanElement;
  return {
    overlay,
    show(summary) {
      summaryText.textContent = `${summary.characterName} guided the Tangram class parade across the playground and rang the festival bell.`;
      badges.textContent = `${summary.badgesCollected}/${summary.totalBadges}`;
      time.textContent = `${summary.durationSeconds}s`;
      checkpoint.textContent = summary.checkpointLabel;
      falls.textContent = String(summary.falls);
      overlay.hidden = false;
    },
  };
}

function createConfig(parent: HTMLElement, scene: PenguinsOfTangramScene): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#8fd8ff',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
    },
    scene: [scene],
  };
}

function updateHook(hook: TestHook): void {
  (window as unknown as { __penguinsOfTangram?: TestHook }).__penguinsOfTangram = hook;
}

export function startGame(parent: HTMLElement, onExit: () => void): GameRuntime {
  parent.innerHTML = '';
  parent.classList.add('tangram-platformer-stage');

  const host = document.createElement('div');
  host.className = 'tangram-platformer-host';
  parent.append(host);

  const hud = createHudPanel(parent);
  const completion = createCompletionOverlay(
    parent,
    () => startAdventure(selectedCharacterId),
    () => {
      destroyGame();
      completion.overlay.hidden = true;
      select.overlay.hidden = false;
      updateHook({
        state: 'select',
        selectedCharacterId,
        badgesCollected: 0,
        totalBadges: collectiblePositions.length,
        checkpointLabel: 'School Gate',
        poweredUp: false,
      });
    },
  );

  let game: Phaser.Game | null = null;
  let selectedCharacterId: TangramCharacterId = DEFAULT_CHARACTER_ID;

  const select = createCharacterSelect(
    parent,
    selectedCharacterId,
    (id) => {
      selectedCharacterId = id;
      select.updateSelection(id);
      updateHook({
        state: 'select',
        selectedCharacterId,
        badgesCollected: 0,
        totalBadges: collectiblePositions.length,
        checkpointLabel: 'School Gate',
        poweredUp: false,
      });
    },
    () => startAdventure(selectedCharacterId),
  );

  const keyboardHandler = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      onExit();
    }
  };
  window.addEventListener('keydown', keyboardHandler);

  const destroyGame = (): void => {
    game?.destroy(true);
    game = null;
    delete (window as unknown as { __game?: Phaser.Game }).__game;
  };

  const startAdventure = (characterId: TangramCharacterId): void => {
    const character = getTangramCharacter(characterId);
    completion.overlay.hidden = true;
    select.overlay.hidden = true;
    destroyGame();
    const scene = new PenguinsOfTangramScene(character, {
      onHudUpdate(snapshot) {
        hud.character.textContent = `${snapshot.characterName} • ${snapshot.characterClass}`;
        hud.badges.textContent = `${snapshot.badgesCollected}/${snapshot.totalBadges}`;
        hud.checkpoint.textContent = snapshot.checkpointLabel;
        hud.power.textContent = snapshot.powerLabel;
        hud.hint.textContent = snapshot.hint;
      },
      onComplete(summary) {
        completion.show(summary);
      },
      onStateChange(state) {
        updateHook(state);
      },
    });
    game = new Phaser.Game(createConfig(host, scene));
    (window as unknown as { __game?: Phaser.Game }).__game = game;
  };

  hud.character.textContent = `${getTangramCharacter(selectedCharacterId).name} • ${getTangramCharacter(selectedCharacterId).className}`;
  hud.badges.textContent = `0/${collectiblePositions.length}`;
  hud.checkpoint.textContent = 'School Gate';
  hud.power.textContent = 'No power-up';
  hud.hint.textContent = 'Choose a Tangram classmate, then start the playground adventure.';
  updateHook({
    state: 'select',
    selectedCharacterId,
    badgesCollected: 0,
    totalBadges: collectiblePositions.length,
    checkpointLabel: 'School Gate',
    poweredUp: false,
  });

  return {
    stop() {
      destroyGame();
      window.removeEventListener('keydown', keyboardHandler);
      delete (window as unknown as { __penguinsOfTangram?: TestHook }).__penguinsOfTangram;
      parent.innerHTML = '';
      parent.classList.remove('tangram-platformer-stage');
    },
  };
}
