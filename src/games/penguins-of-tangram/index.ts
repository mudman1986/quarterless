import Phaser from 'phaser';
import type { GameRuntime } from '../../arcade/types';
import {
  DEFAULT_CHARACTER_ID,
  PLAYABLE_CHARACTERS,
  getTangramCharacter,
  type TangramCharacterDefinition,
  type TangramCharacterId,
} from './data';
import {
  CAMPAIGN_LEVELS,
  FIRST_LEVEL_ID,
  getTangramLevel,
  nextTangramLevelId,
  type EnemyDefinition,
  type Rect,
  type TangramLevelDefinition,
  type TangramLevelId,
} from './levels';

const VIEWPORT_WIDTH = 960;
const VIEWPORT_HEIGHT = 540;
const PLAYER_WIDTH = 52;
const PLAYER_HEIGHT = 72;
const PLAYER_GRAVITY = 2200;
const PLAYER_MAX_FALL_SPEED = 960;
const POWERUP_DURATION_MS = 12_000;

type Collectible = {
  x: number;
  y: number;
  label: string;
  secret: boolean;
  sprite: Phaser.GameObjects.Container;
  collected: boolean;
};
type Hazard = Rect & { label: string; sprite: Phaser.GameObjects.Container };
type Enemy = EnemyDefinition & {
  direction: 1 | -1;
  active: boolean;
  sprite: Phaser.GameObjects.Container;
};

type HudSnapshot = {
  zoneTitle: string;
  characterName: string;
  characterClass: string;
  badgesCollected: number;
  totalBadges: number;
  checkpointLabel: string;
  powerLabel: string;
  hint: string;
};

type JumpAudit = {
  allCriticalPlatformsReachable: boolean;
  jumpRise: number;
  maxRequiredRise: number;
  unreachable: string[];
};

type LevelSummary = {
  characterName: string;
  levelTitle: string;
  badgesCollected: number;
  totalBadges: number;
  durationSeconds: number;
  checkpointLabel: string;
  falls: number;
  nextLevelId: TangramLevelId | null;
  campaignComplete: boolean;
};

type HookStateName = 'select' | 'map' | 'running' | 'complete' | 'campaign-complete';

type TestHook = {
  state: HookStateName;
  selectedCharacterId: TangramCharacterId;
  currentLevelId: TangramLevelId | null;
  unlockedLevelIds: TangramLevelId[];
  completedLevelIds: TangramLevelId[];
  badgesCollected: number;
  totalBadges: number;
  checkpointLabel: string;
  poweredUp: boolean;
  jumpAudit: JumpAudit;
  completeCurrentLevel?: () => void;
};

type SceneHookState = {
  badgesCollected: number;
  totalBadges: number;
  checkpointLabel: string;
  poweredUp: boolean;
  jumpAudit: JumpAudit;
};

type TangramKeys = {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
};

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function jumpRiseForVelocity(jumpVelocity: number): number {
  return (jumpVelocity * jumpVelocity) / (2 * PLAYER_GRAVITY);
}

function horizontalGapBetween(a: { x: number; width: number }, b: { x: number; width: number }): number {
  if (a.x + a.width < b.x) return b.x - (a.x + a.width);
  if (b.x + b.width < a.x) return a.x - (b.x + b.width);
  return 0;
}

function buildJumpAudit(level: TangramLevelDefinition, character: TangramCharacterDefinition): JumpAudit {
  const nodes = [
    { label: level.start.label, x: level.start.x, width: PLAYER_WIDTH, topY: level.start.y },
    ...level.platforms.map((platform) => ({
      label: platform.label ?? `Platform ${platform.x}`,
      x: platform.x,
      width: platform.width,
      topY: platform.y - PLAYER_HEIGHT,
    })),
  ];
  const reachable = new Set<number>([0]);
  const maxRiseByNode = new Map<number, number>([[0, 0]]);
  const jumpRise = jumpRiseForVelocity(Math.abs(character.movement.jumpVelocity));
  let changed = true;
  while (changed) {
    changed = false;
    for (let from = 0; from < nodes.length; from += 1) {
      if (!reachable.has(from)) continue;
      for (let to = 1; to < nodes.length; to += 1) {
        if (from === to || reachable.has(to)) continue;
        const rise = nodes[from].topY - nodes[to].topY;
        const gap = horizontalGapBetween(nodes[from], nodes[to]);
        const allowableGap = rise >= 0 ? 270 : 340;
        const allowed = rise <= jumpRise + 6 && gap <= allowableGap;
        if (!allowed) continue;
        reachable.add(to);
        maxRiseByNode.set(to, Math.max(maxRiseByNode.get(from) ?? 0, Math.max(0, rise)));
        changed = true;
      }
    }
  }
  const unreachable = level.platforms
    .map((platform, index) => ({ platform, node: index + 1 }))
    .filter(({ node }) => !reachable.has(node))
    .map(({ platform }) => platform.label ?? `Platform ${platform.x}`);
  const maxRequiredRise = Math.max(0, ...Array.from(maxRiseByNode.values()));
  return {
    allCriticalPlatformsReachable: unreachable.length === 0,
    jumpRise,
    maxRequiredRise,
    unreachable,
  };
}

class PenguinsOfTangramScene extends Phaser.Scene {
  private readonly character: TangramCharacterDefinition;
  private readonly level: TangramLevelDefinition;
  private readonly callbacks: {
    onHudUpdate: (snapshot: HudSnapshot) => void;
    onSceneState: (snapshot: SceneHookState) => void;
    onComplete: (summary: LevelSummary) => void;
  };

  private readonly jumpAudit: JumpAudit;
  private keys: TangramKeys | undefined;
  private player!: Phaser.GameObjects.Container;
  private playerAura!: Phaser.GameObjects.Ellipse;
  private checkpointBanner!: Phaser.GameObjects.Container;
  private goalBanner!: Phaser.GameObjects.Container;
  private powerSnack!: Phaser.GameObjects.Container;
  private collectibles: Collectible[] = [];
  private hazards: Hazard[] = [];
  private enemies: Enemy[] = [];
  private playerState!: {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    grounded: boolean;
    facing: 1 | -1;
  };
  private startTime = 0;
  private lastCheckpoint!: { x: number; y: number; label: string };
  private badgesCollected = 0;
  private falls = 0;
  private powerUntil = 0;
  private finished = false;
  private checkpointActivated = false;
  private hint!: string;
  private hintUntil = 0;
  private lastJumpDown = false;
  private invulnerableUntil = 0;

  constructor(
    character: TangramCharacterDefinition,
    level: TangramLevelDefinition,
    callbacks: {
      onHudUpdate: (snapshot: HudSnapshot) => void;
      onSceneState: (snapshot: SceneHookState) => void;
      onComplete: (summary: LevelSummary) => void;
    },
  ) {
    super('PenguinsOfTangram');
    this.character = character;
    this.level = level;
    this.callbacks = callbacks;
    this.jumpAudit = buildJumpAudit(level, character);
    this.playerState = {
      x: level.start.x,
      y: level.start.y,
      velocityX: 0,
      velocityY: 0,
      grounded: false,
      facing: 1,
    };
    this.lastCheckpoint = { ...level.start };
    this.hint = level.hint;
  }

  create(): void {
    this.startTime = this.time.now;
    this.cameras.main.setBackgroundColor(this.level.skyColor);
    this.cameras.main.setBounds(0, 0, this.level.worldWidth, this.level.worldHeight);
    this.createBackdrop();
    this.createPlatforms();
    this.createDecor();
    this.createCollectibles();
    this.createHazards();
    this.createEnemies();
    this.createCheckpoint();
    this.createGoal();
    this.createBouncePads();
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
    }) as TangramKeys | undefined;
    this.updateHud();
  }

  update(_: number, deltaMs: number): void {
    if (this.finished) return;
    const delta = Math.min(deltaMs / 1000, 1 / 30);
    this.updateEnemies(delta);
    this.updatePlayer(delta);
    this.updatePlayerVisuals();
    this.handleBouncePads();
    this.handleCollectibles();
    this.handleHazards();
    this.handleEnemies();
    this.handleCheckpoint();
    this.handlePowerSnack();
    this.handleGoal();
    this.updateHintExpiry();
    this.updatePowerVisual();
  }

  debugCompleteLevel(): void {
    if (this.finished) return;
    this.badgesCollected = this.collectibles.length;
    for (const collectible of this.collectibles) {
      collectible.collected = true;
      collectible.sprite.setVisible(false);
    }
    this.lastCheckpoint = { x: this.level.checkpoint.x + 12, y: this.level.checkpoint.y - 8, label: this.level.checkpoint.label };
    this.playerState.x = this.level.goal.x;
    this.playerState.y = this.level.goal.y;
    this.player.x = this.playerState.x + PLAYER_WIDTH / 2;
    this.player.y = this.playerState.y + PLAYER_HEIGHT / 2;
    this.handleGoal();
  }

  private createBackdrop(): void {
    this.add.rectangle(this.level.worldWidth / 2, this.level.worldHeight / 2, this.level.worldWidth, this.level.worldHeight, Phaser.Display.Color.HexStringToColor(this.level.skyColor).color).setScrollFactor(0, 0);
    this.add.rectangle(this.level.worldWidth / 2, 390, this.level.worldWidth, 180, 0xb9ec7b).setScrollFactor(0.12, 0.2);
    for (let index = 0; index < Math.ceil(this.level.worldWidth / 440); index += 1) {
      const cloudX = 160 + index * 440;
      const cloudY = 90 + (index % 3) * 38;
      this.add.ellipse(cloudX, cloudY, 120, 44, 0xffffff, 0.95).setScrollFactor(0.12, 0.08);
      this.add.ellipse(cloudX + 40, cloudY + 6, 88, 36, 0xffffff, 0.95).setScrollFactor(0.12, 0.08);
      this.add.ellipse(cloudX - 46, cloudY + 8, 76, 32, 0xffffff, 0.95).setScrollFactor(0.12, 0.08);
    }
    for (let index = 0; index < Math.ceil(this.level.worldWidth / 520); index += 1) {
      const hillX = 260 + index * 520;
      const color = index % 2 === 0 ? this.level.hillColors[0] : this.level.hillColors[1];
      this.add.ellipse(hillX, 430, 360, 180, color, 1).setScrollFactor(0.28, 0.3);
    }
    this.createLandmark();
  }

  private createLandmark(): void {
    switch (this.level.landmark) {
      case 'school': {
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
          this.add.text(0, -18, 'TANGRAM', { fontFamily: 'Arial, sans-serif', fontSize: '28px', color: '#0f3550', fontStyle: 'bold' }).setOrigin(0.5),
        ]);
        break;
      }
      case 'playground': {
        const playground = this.add.container(900, 340);
        playground.setScrollFactor(0.42, 0.36);
        playground.add([
          this.add.rectangle(-90, 10, 24, 160, 0xff8f66),
          this.add.rectangle(90, 10, 24, 160, 0xff8f66),
          this.add.rectangle(0, -66, 220, 18, 0xffd166),
          this.add.rectangle(-130, 44, 22, 92, 0x5bb4ff),
          this.add.rectangle(130, 44, 22, 92, 0x5bb4ff),
          this.add.rectangle(0, 94, 320, 18, 0x7ad46e),
        ]);
        break;
      }
      case 'classroom': {
        const classroom = this.add.container(860, 296);
        classroom.setScrollFactor(0.34, 0.34);
        classroom.add([
          this.add.rectangle(0, 24, 360, 160, 0xfff8ef),
          this.add.rectangle(0, -42, 280, 56, 0x71d2b6),
          this.add.rectangle(-108, 36, 80, 52, 0xd8b27e),
          this.add.rectangle(0, 36, 80, 52, 0xd8b27e),
          this.add.rectangle(108, 36, 80, 52, 0xd8b27e),
          this.add.text(0, -44, 'CLASSROOM MAZE', { fontFamily: 'Arial, sans-serif', fontSize: '24px', color: '#103047', fontStyle: 'bold' }).setOrigin(0.5),
        ]);
        break;
      }
      case 'library': {
        const library = this.add.container(920, 290);
        library.setScrollFactor(0.34, 0.34);
        library.add([
          this.add.rectangle(0, 24, 360, 160, 0xfff4ef),
          this.add.rectangle(-110, 20, 70, 120, 0x8d5b34),
          this.add.rectangle(0, 20, 70, 120, 0x6f4d35),
          this.add.rectangle(110, 20, 70, 120, 0x805a2a),
          this.add.rectangle(0, -46, 280, 50, 0xff93c2),
          this.add.text(0, -46, 'LIBRARY + ART', { fontFamily: 'Arial, sans-serif', fontSize: '24px', color: '#103047', fontStyle: 'bold' }).setOrigin(0.5),
        ]);
        break;
      }
      case 'stadium': {
        const stadium = this.add.container(980, 308);
        stadium.setScrollFactor(0.34, 0.34);
        stadium.add([
          this.add.rectangle(0, 48, 420, 108, 0xfff4d6),
          this.add.rectangle(0, -10, 360, 42, 0xff8f66),
          this.add.rectangle(-120, 24, 82, 22, 0x59d0ff),
          this.add.rectangle(0, 24, 82, 22, 0x71d2b6),
          this.add.rectangle(120, 24, 82, 22, 0xffd166),
          this.add.text(0, -10, 'SPORTS DAY', { fontFamily: 'Arial, sans-serif', fontSize: '28px', color: '#103047', fontStyle: 'bold' }).setOrigin(0.5),
        ]);
        break;
      }
    }
  }

  private createPlatforms(): void {
    for (const platform of this.level.platforms) {
      this.add.rectangle(platform.x + platform.width / 2, platform.y + platform.height / 2, platform.width, platform.height, platform.color).setDepth(2);
      this.add.rectangle(platform.x + platform.width / 2, platform.y + 6, platform.width, 12, platform.trim).setDepth(3);
    }
  }

  private createDecor(): void {
    for (const sign of this.level.signs) {
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
    this.add.text(this.level.start.x + 32, 246, this.level.start.label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#103047',
      fontStyle: 'bold',
      backgroundColor: '#ffffffaa',
      padding: { left: 10, right: 10, top: 6, bottom: 6 },
    }).setDepth(5);
    this.add.text(this.level.goal.x - 40, 208, this.level.goal.label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#103047',
      fontStyle: 'bold',
      backgroundColor: '#ffffffaa',
      padding: { left: 10, right: 10, top: 6, bottom: 6 },
    }).setDepth(5);
  }

  private createCollectibles(): void {
    this.collectibles = this.level.collectibles.map((entry) => ({
      x: entry.x,
      y: entry.y,
      label: entry.label,
      secret: Boolean(entry.secret),
      collected: false,
      sprite: this.createBadge(entry.x, entry.y, entry.secret ? 0xff93c2 : 0xffd166),
    }));
  }

  private createHazards(): void {
    this.hazards = this.level.hazards.map((hazard) => ({
      ...hazard,
      sprite: this.createPuddle(hazard),
    }));
  }

  private createEnemies(): void {
    this.enemies = this.level.enemies.map((enemy, index) => ({
      ...enemy,
      direction: index % 2 === 0 ? 1 : -1,
      active: true,
      sprite: this.createCritter(enemy.x, enemy.y, index),
    }));
  }

  private createCheckpoint(): void {
    this.checkpointBanner = this.add.container(this.level.checkpoint.x + 20, this.level.checkpoint.y + 60);
    this.checkpointBanner.setDepth(4);
    this.checkpointBanner.add([
      this.add.rectangle(0, 24, 10, 120, 0x8d5b34),
      this.add.rectangle(34, -16, 66, 34, 0xffd166),
      this.add.text(34, -16, 'CHECK', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#103047', fontStyle: 'bold' }).setOrigin(0.5),
    ]);
  }

  private createGoal(): void {
    this.goalBanner = this.add.container(this.level.goal.x + 34, this.level.goal.y + 84);
    this.goalBanner.setDepth(4);
    this.goalBanner.add([
      this.add.rectangle(-22, 56, 10, 140, 0x8d5b34),
      this.add.rectangle(22, 56, 10, 140, 0x8d5b34),
      this.add.rectangle(0, -8, 110, 18, 0xff8f66),
      this.add.rectangle(0, 18, 96, 44, 0x59d0ff),
      this.add.text(0, 18, 'RING!', { fontFamily: 'Arial, sans-serif', fontSize: '24px', color: '#103047', fontStyle: 'bold' }).setOrigin(0.5),
    ]);
  }

  private createBouncePads(): void {
    for (const pad of this.level.bouncePads ?? []) {
      const container = this.add.container(pad.x + pad.width / 2, pad.y + pad.height / 2);
      container.setDepth(4);
      container.add([
        this.add.rectangle(0, 0, pad.width, pad.height, pad.color),
        this.add.text(0, 0, '⇧', { fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#103047', fontStyle: 'bold' }).setOrigin(0.5),
      ]);
    }
  }

  private createPowerSnack(): void {
    this.powerSnack = this.add.container(this.level.powerup.x + this.level.powerup.width / 2, this.level.powerup.y + 26);
    this.powerSnack.setDepth(4);
    this.powerSnack.add([
      this.add.ellipse(0, 0, 44, 30, 0xfff0a8),
      this.add.ellipse(0, -2, 36, 22, 0xffd166),
      this.add.text(0, 0, '★', { fontFamily: 'Arial, sans-serif', fontSize: '22px', color: '#8d5b34', fontStyle: 'bold' }).setOrigin(0.5),
    ]);
  }

  private createPlayer(): Phaser.GameObjects.Container {
    const container = this.add.container(this.playerState.x + PLAYER_WIDTH / 2, this.playerState.y + PLAYER_HEIGHT / 2);
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

  private createBadge(x: number, y: number, baseColor: number): Phaser.GameObjects.Container {
    const badge = this.add.container(x, y);
    badge.setDepth(4);
    badge.add([
      this.add.circle(0, 0, 13, baseColor),
      this.add.circle(0, 0, 9, 0xfff1b8),
      this.add.text(0, 0, '★', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#8d5b34', fontStyle: 'bold' }).setOrigin(0.5),
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
    const maxSpeed = this.isPoweredUp() ? this.character.movement.poweredMaxSpeed : this.character.movement.maxSpeed;
    const jumpVelocity = this.isPoweredUp() ? this.character.movement.poweredJumpVelocity : this.character.movement.jumpVelocity;
    const acceleration = this.character.movement.acceleration;
    const drag = this.character.movement.drag;
    const previous = { x: this.playerState.x, y: this.playerState.y };

    if (inputDirection !== 0) {
      this.playerState.velocityX += inputDirection * acceleration * delta;
      this.playerState.velocityX = clamp(this.playerState.velocityX, -maxSpeed, maxSpeed);
      this.playerState.facing = inputDirection > 0 ? 1 : -1;
    } else {
      const dragAmount = drag * delta;
      if (Math.abs(this.playerState.velocityX) <= dragAmount) this.playerState.velocityX = 0;
      else this.playerState.velocityX -= Math.sign(this.playerState.velocityX) * dragAmount;
    }

    if (jumpDown && !this.lastJumpDown && this.playerState.grounded) {
      this.playerState.velocityY = jumpVelocity;
      this.playerState.grounded = false;
      this.setHint(`Leap into ${this.level.title.toLowerCase()} and keep the parade moving.`);
    }
    this.lastJumpDown = jumpDown;

    this.playerState.x += this.playerState.velocityX * delta;
    this.resolveHorizontal(previous.x);
    this.playerState.velocityY = clamp(this.playerState.velocityY + PLAYER_GRAVITY * delta, -1800, PLAYER_MAX_FALL_SPEED);
    this.playerState.y += this.playerState.velocityY * delta;
    this.playerState.grounded = false;
    this.resolveVertical(previous.y);

    if (this.playerState.y > this.level.worldHeight + 120) {
      this.respawn(`Take the safer route through ${this.level.title.toLowerCase()}.`);
      return;
    }
    this.playerState.x = clamp(this.playerState.x, 0, this.level.worldWidth - PLAYER_WIDTH);
    this.player.x = this.playerState.x + PLAYER_WIDTH / 2;
    this.player.y = this.playerState.y + PLAYER_HEIGHT / 2;
  }

  private resolveHorizontal(previousX: number): void {
    const playerRect = this.playerRect();
    for (const platform of this.level.platforms) {
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
    for (const platform of this.level.platforms) {
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

  private handleBouncePads(): void {
    const feetRect = {
      x: this.playerState.x + 10,
      y: this.playerState.y + PLAYER_HEIGHT - 10,
      width: PLAYER_WIDTH - 20,
      height: 12,
    };
    for (const pad of this.level.bouncePads ?? []) {
      if (!intersects(feetRect, pad)) continue;
      if (this.playerState.velocityY > 0 || this.playerState.grounded) {
        this.playerState.velocityY = -pad.strength;
        this.playerState.grounded = false;
        this.setHint(`${pad.label} launches ${this.character.name.toLowerCase()} toward the high route.`);
      }
    }
  }

  private handleCollectibles(): void {
    const playerRect = this.playerRect();
    for (const collectible of this.collectibles) {
      if (collectible.collected) continue;
      if (!intersects(playerRect, { x: collectible.x - 13, y: collectible.y - 13, width: 26, height: 26 })) continue;
      collectible.collected = true;
      collectible.sprite.setVisible(false);
      this.badgesCollected += 1;
      this.setHint(
        collectible.secret
          ? `Secret found: ${collectible.label}.`
          : `Badges collected: ${this.badgesCollected}/${this.collectibles.length}`,
      );
      this.updateHud();
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
        this.respawn(`${hazard.label}! Start again from the checkpoint.`);
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
        this.playerState.velocityY = -460;
        this.setHint('Nice stomp! Keep the class parade moving.');
        return;
      }
      this.respawn('A critter bumped you back to safety.');
      return;
    }
  }

  private handleCheckpoint(): void {
    if (this.checkpointActivated) return;
    if (!intersects(this.playerRect(), this.level.checkpoint)) return;
    this.checkpointActivated = true;
    this.lastCheckpoint = { x: this.level.checkpoint.x + 12, y: this.level.checkpoint.y - 8, label: this.level.checkpoint.label };
    this.checkpointBanner.list.forEach((child) => {
      if ('setTint' in child && typeof child.setTint === 'function') child.setTint(0x7dfc8a);
    });
    this.setHint(`Checkpoint reached: ${this.level.checkpoint.label}`);
    this.updateHud();
  }

  private handlePowerSnack(): void {
    if (!this.powerSnack.visible) return;
    if (!intersects(this.playerRect(), this.level.powerup)) return;
    this.powerSnack.setVisible(false);
    this.powerUntil = this.time.now + POWERUP_DURATION_MS;
    this.setHint(`${this.level.powerup.label} active! Bigger jumps and faster waddles for a short time.`);
    this.updateHud();
  }

  private handleGoal(): void {
    if (!intersects(this.playerRect(), this.level.goal)) return;
    if (this.badgesCollected < this.collectibles.length) {
      this.setHint(`You still need ${this.collectibles.length - this.badgesCollected} more Tangram badges.`);
      return;
    }
    this.finished = true;
    this.callbacks.onComplete({
      characterName: this.character.name,
      levelTitle: this.level.title,
      badgesCollected: this.badgesCollected,
      totalBadges: this.collectibles.length,
      durationSeconds: Math.max(1, Math.round((this.time.now - this.startTime) / 1000)),
      checkpointLabel: this.lastCheckpoint.label,
      falls: this.falls,
      nextLevelId: nextTangramLevelId(this.level.id),
      campaignComplete: nextTangramLevelId(this.level.id) === null,
    });
  }

  private updateHintExpiry(): void {
    if (this.hintUntil === 0 || this.time.now <= this.hintUntil) return;
    this.hintUntil = 0;
    this.hint = this.isPoweredUp() ? 'Power snack active — race ahead while it lasts.' : this.level.hint;
    this.updateHud();
  }

  private updatePowerVisual(): void {
    const powered = this.isPoweredUp();
    this.playerAura.setVisible(powered);
    this.playerAura.x = this.player.x;
    this.playerAura.y = this.player.y - 10;
    this.callbacks.onSceneState(this.currentSceneHookState());
  }

  private respawn(message: string): void {
    this.falls += 1;
    this.playerState.x = this.lastCheckpoint.x;
    this.playerState.y = this.lastCheckpoint.y;
    this.playerState.velocityX = 0;
    this.playerState.velocityY = 0;
    this.playerState.grounded = false;
    this.invulnerableUntil = this.time.now + this.character.movement.respawnShieldMs;
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
      zoneTitle: this.level.title,
      characterName: this.character.name,
      characterClass: this.character.className,
      badgesCollected: this.badgesCollected,
      totalBadges: this.collectibles.length,
      checkpointLabel: this.lastCheckpoint.label,
      powerLabel: this.isPoweredUp() ? 'Super snack active' : 'No power-up',
      hint: this.hint,
    });
    this.callbacks.onSceneState(this.currentSceneHookState());
  }

  private currentSceneHookState(): SceneHookState {
    return {
      badgesCollected: this.badgesCollected,
      totalBadges: this.collectibles.length,
      checkpointLabel: this.lastCheckpoint.label,
      poweredUp: this.isPoweredUp(),
      jumpAudit: this.jumpAudit,
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
  character: HTMLSpanElement;
  zone: HTMLSpanElement;
  badges: HTMLSpanElement;
  checkpoint: HTMLSpanElement;
  power: HTMLSpanElement;
  hint: HTMLParagraphElement;
} {
  const panel = document.createElement('div');
  panel.className = 'tangram-platformer-hud';
  panel.innerHTML = `
    <div class="tangram-platformer-chip-grid">
      <span class="tangram-platformer-chip"><strong>Character</strong><span data-field="character"></span></span>
      <span class="tangram-platformer-chip"><strong>Zone</strong><span data-field="zone"></span></span>
      <span class="tangram-platformer-chip"><strong>Badges</strong><span data-field="badges"></span></span>
      <span class="tangram-platformer-chip"><strong>Checkpoint</strong><span data-field="checkpoint"></span></span>
      <span class="tangram-platformer-chip"><strong>Power</strong><span data-field="power"></span></span>
    </div>
    <p class="tangram-platformer-hint" data-field="hint"></p>`;
  parent.append(panel);
  return {
    character: panel.querySelector('[data-field="character"]') as HTMLSpanElement,
    zone: panel.querySelector('[data-field="zone"]') as HTMLSpanElement,
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
): { overlay: HTMLDivElement; updateSelection: (id: TangramCharacterId) => void } {
  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay';
  const title = document.createElement('section');
  title.className = 'tangram-platformer-panel';
  const description = document.createElement('p');
  const roster = document.createElement('div');
  roster.className = 'tangram-platformer-character-grid';
  const startButton = document.createElement('button');
  startButton.className = 'tangram-platformer-button';
  startButton.type = 'button';
  startButton.textContent = 'Open school map';
  startButton.addEventListener('click', onStart);
  title.innerHTML = `
    <p class="tangram-platformer-kicker">Expanded Phaser platformer</p>
    <h2>Penguins of Tangram</h2>
    <p class="tangram-platformer-copy">
      Choose your Tangram classmate, travel across five themed school zones, collect every badge,
      discover secret routes, and ring the final festival bell.
    </p>
    <p class="tangram-platformer-copy tangram-platformer-copy--soft">
      Each class now has a light movement perk, from Kangaroo's bigger jumps to Lion's faster dash.
    </p>`;
  const buttons = PLAYABLE_CHARACTERS.map((character) => {
    const button = document.createElement('button');
    button.className = 'tangram-platformer-character';
    button.type = 'button';
    button.dataset.characterId = character.id;
    button.innerHTML = `
      <strong>${character.name}</strong>
      <span>${character.className}</span>
      <small>${character.description} ${character.movement.skill}</small>`;
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
    description.textContent = `${character.name} — ${character.className}. ${character.movement.skill}`;
  };
  updateSelection(selectedCharacterId);
  return { overlay, updateSelection };
}

function createCampaignMap(
  parent: HTMLElement,
  onStartLevel: (id: TangramLevelId) => void,
): {
  overlay: HTMLDivElement;
  render: (selectedLevelId: TangramLevelId, unlocked: readonly TangramLevelId[], completed: readonly TangramLevelId[]) => void;
} {
  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay';
  overlay.hidden = true;
  const panel = document.createElement('section');
  panel.className = 'tangram-platformer-panel';
  panel.innerHTML = `
    <p class="tangram-platformer-kicker">School map</p>
    <h2>Five-zone adventure</h2>
    <p class="tangram-platformer-copy">Complete each zone to unlock the next class route and finish the school festival run.</p>`;
  const grid = document.createElement('div');
  grid.className = 'story-chapter-grid story-chapter-grid--map';
  panel.append(grid);
  overlay.append(panel);
  parent.append(overlay);
  const render = (selectedLevelId: TangramLevelId, unlocked: readonly TangramLevelId[], completed: readonly TangramLevelId[]): void => {
    const unlockedSet = new Set(unlocked);
    const completedSet = new Set(completed);
    grid.innerHTML = CAMPAIGN_LEVELS.map((level, index) => {
      const isUnlocked = unlockedSet.has(level.id);
      const isCompleted = completedSet.has(level.id);
      const isSelected = level.id === selectedLevelId;
      return `
        <button
          class="story-chapter-card${isSelected ? ' story-chapter-card--current' : ''}${isCompleted ? ' story-chapter-card--completed' : ''}${isUnlocked ? '' : ' story-chapter-card--locked'}"
          type="button"
          data-level-id="${level.id}"
          ${isUnlocked ? '' : 'disabled'}
          aria-label="Play ${level.title}"
        >
          <span class="story-chapter-node" aria-hidden="true"></span>
          <span class="story-chapter-kicker">Zone ${index + 1}</span>
          <span class="story-chapter-title">${level.title}</span>
          <span class="story-chapter-copy">${level.summary}</span>
          <span class="story-chapter-meta">${isCompleted ? 'Completed' : isUnlocked ? 'Unlocked' : 'Locked'} • ${level.collectibles.length} badges</span>
        </button>`;
    }).join('');
    for (const button of grid.querySelectorAll<HTMLButtonElement>('[data-level-id]')) {
      button.addEventListener('click', () => onStartLevel(button.dataset.levelId as TangramLevelId));
    }
  };
  return { overlay, render };
}

function createCompletionOverlay(
  parent: HTMLElement,
  actions: {
    onReplay: () => void;
    onMap: () => void;
    onChooseAnother: () => void;
    onNext: () => void;
  },
): {
  overlay: HTMLDivElement;
  show: (summary: LevelSummary) => void;
} {
  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay tangram-platformer-overlay--complete';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="tangram-platformer-panel tangram-platformer-panel--complete">
      <p class="tangram-platformer-kicker" data-field="kicker"></p>
      <h2 data-field="title"></h2>
      <p class="tangram-platformer-copy" data-field="summary"></p>
      <div class="tangram-platformer-summary-grid">
        <span class="tangram-platformer-chip"><strong>Badges</strong><span data-field="badges"></span></span>
        <span class="tangram-platformer-chip"><strong>Time</strong><span data-field="time"></span></span>
        <span class="tangram-platformer-chip"><strong>Checkpoint</strong><span data-field="checkpoint"></span></span>
        <span class="tangram-platformer-chip"><strong>Falls</strong><span data-field="falls"></span></span>
      </div>
      <div class="tangram-platformer-action-row">
        <button class="tangram-platformer-button" type="button" data-action="next">Next zone</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="map">Back to school map</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="replay">Replay zone</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="choose">Choose another class</button>
      </div>
    </section>`;
  parent.append(overlay);
  overlay.querySelector<HTMLButtonElement>('[data-action="next"]')?.addEventListener('click', actions.onNext);
  overlay.querySelector<HTMLButtonElement>('[data-action="map"]')?.addEventListener('click', actions.onMap);
  overlay.querySelector<HTMLButtonElement>('[data-action="replay"]')?.addEventListener('click', actions.onReplay);
  overlay.querySelector<HTMLButtonElement>('[data-action="choose"]')?.addEventListener('click', actions.onChooseAnother);
  const kicker = overlay.querySelector('[data-field="kicker"]') as HTMLParagraphElement;
  const title = overlay.querySelector('[data-field="title"]') as HTMLHeadingElement;
  const summaryText = overlay.querySelector('[data-field="summary"]') as HTMLParagraphElement;
  const badges = overlay.querySelector('[data-field="badges"]') as HTMLSpanElement;
  const time = overlay.querySelector('[data-field="time"]') as HTMLSpanElement;
  const checkpoint = overlay.querySelector('[data-field="checkpoint"]') as HTMLSpanElement;
  const falls = overlay.querySelector('[data-field="falls"]') as HTMLSpanElement;
  const nextButton = overlay.querySelector('[data-action="next"]') as HTMLButtonElement;
  return {
    overlay,
    show(summary) {
      const nextLevel = summary.nextLevelId ? getTangramLevel(summary.nextLevelId) : null;
      kicker.textContent = summary.campaignComplete ? 'Campaign complete' : 'Zone complete';
      title.textContent = summary.campaignComplete ? 'School festival complete!' : `${summary.levelTitle} cleared!`;
      summaryText.textContent = summary.campaignComplete
        ? `${summary.characterName} carried every class parade to the final bell and wrapped the full Tangram school day.`
        : `${summary.characterName} cleared ${summary.levelTitle} and unlocked ${nextLevel?.title ?? 'the next route'}.`;
      badges.textContent = `${summary.badgesCollected}/${summary.totalBadges}`;
      time.textContent = `${summary.durationSeconds}s`;
      checkpoint.textContent = summary.checkpointLabel;
      falls.textContent = String(summary.falls);
      nextButton.hidden = summary.nextLevelId === null;
      nextButton.textContent = summary.campaignComplete ? 'Back to school map' : `Next: ${nextLevel?.kicker ?? 'Next zone'}`;
      overlay.hidden = false;
    },
  };
}

function createConfig(parent: HTMLElement, scene: PenguinsOfTangramScene, level: TangramLevelDefinition): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: level.skyColor,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
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
  let selectedCharacterId: TangramCharacterId = DEFAULT_CHARACTER_ID;
  let selectedLevelId: TangramLevelId = FIRST_LEVEL_ID;
  const unlockedLevelIds: TangramLevelId[] = [FIRST_LEVEL_ID];
  const completedLevelIds: TangramLevelId[] = [];
  let game: Phaser.Game | null = null;
  let activeScene: PenguinsOfTangramScene | null = null;
  let lastHookState: SceneHookState = {
    badgesCollected: 0,
    totalBadges: getTangramLevel(selectedLevelId).collectibles.length,
    checkpointLabel: getTangramLevel(selectedLevelId).start.label,
    poweredUp: false,
    jumpAudit: buildJumpAudit(getTangramLevel(selectedLevelId), getTangramCharacter(selectedCharacterId)),
  };
  let currentState: HookStateName = 'select';
  let pendingSummary: LevelSummary | null = null;

  const emitHook = (): void => {
    updateHook({
      state: currentState,
      selectedCharacterId,
      currentLevelId: currentState === 'select' ? null : selectedLevelId,
      unlockedLevelIds: [...unlockedLevelIds],
      completedLevelIds: [...completedLevelIds],
      badgesCollected: lastHookState.badgesCollected,
      totalBadges: lastHookState.totalBadges,
      checkpointLabel: lastHookState.checkpointLabel,
      poweredUp: lastHookState.poweredUp,
      jumpAudit: lastHookState.jumpAudit,
      completeCurrentLevel: activeScene ? () => activeScene?.debugCompleteLevel() : undefined,
    });
  };

  const destroyGame = (): void => {
    game?.destroy(true);
    game = null;
    activeScene = null;
    delete (window as unknown as { __game?: Phaser.Game }).__game;
  };

  const completion = createCompletionOverlay(parent, {
    onReplay: () => startLevel(selectedLevelId),
    onMap: () => showMap(selectedLevelId),
    onChooseAnother: () => showCharacterSelect(),
    onNext: () => {
      if (pendingSummary?.nextLevelId) startLevel(pendingSummary.nextLevelId);
      else showMap(selectedLevelId);
    },
  });

  const map = createCampaignMap(parent, (levelId) => {
    selectedLevelId = levelId;
    startLevel(levelId);
  });

  const select = createCharacterSelect(
    parent,
    selectedCharacterId,
    (id) => {
      selectedCharacterId = id;
      select.updateSelection(id);
      lastHookState = {
        ...lastHookState,
        jumpAudit: buildJumpAudit(getTangramLevel(selectedLevelId), getTangramCharacter(selectedCharacterId)),
      };
      emitHook();
    },
    () => showMap(selectedLevelId),
  );

  const updateHudForScene = (snapshot: HudSnapshot): void => {
    hud.character.textContent = `${snapshot.characterName} • ${snapshot.characterClass}`;
    hud.zone.textContent = snapshot.zoneTitle;
    hud.badges.textContent = `${snapshot.badgesCollected}/${snapshot.totalBadges}`;
    hud.checkpoint.textContent = snapshot.checkpointLabel;
    hud.power.textContent = snapshot.powerLabel;
    hud.hint.textContent = snapshot.hint;
  };

  function showCharacterSelect(): void {
    destroyGame();
    completion.overlay.hidden = true;
    map.overlay.hidden = true;
    select.overlay.hidden = false;
    currentState = 'select';
    lastHookState = {
      badgesCollected: 0,
      totalBadges: getTangramLevel(selectedLevelId).collectibles.length,
      checkpointLabel: getTangramLevel(selectedLevelId).start.label,
      poweredUp: false,
      jumpAudit: buildJumpAudit(getTangramLevel(selectedLevelId), getTangramCharacter(selectedCharacterId)),
    };
    hud.character.textContent = `${getTangramCharacter(selectedCharacterId).name} • ${getTangramCharacter(selectedCharacterId).className}`;
    hud.zone.textContent = 'School map';
    hud.badges.textContent = `0/${getTangramLevel(selectedLevelId).collectibles.length}`;
    hud.checkpoint.textContent = getTangramLevel(selectedLevelId).start.label;
    hud.power.textContent = 'No power-up';
    hud.hint.textContent = 'Choose a Tangram classmate, then open the school map.';
    emitHook();
  }

  function showMap(levelId: TangramLevelId): void {
    destroyGame();
    selectedLevelId = unlockedLevelIds.includes(levelId) ? levelId : unlockedLevelIds[unlockedLevelIds.length - 1];
    select.overlay.hidden = true;
    completion.overlay.hidden = true;
    map.render(selectedLevelId, unlockedLevelIds, completedLevelIds);
    map.overlay.hidden = false;
    currentState = 'map';
    lastHookState = {
      badgesCollected: 0,
      totalBadges: getTangramLevel(selectedLevelId).collectibles.length,
      checkpointLabel: getTangramLevel(selectedLevelId).start.label,
      poweredUp: false,
      jumpAudit: buildJumpAudit(getTangramLevel(selectedLevelId), getTangramCharacter(selectedCharacterId)),
    };
    hud.character.textContent = `${getTangramCharacter(selectedCharacterId).name} • ${getTangramCharacter(selectedCharacterId).className}`;
    hud.zone.textContent = getTangramLevel(selectedLevelId).title;
    hud.badges.textContent = `0/${getTangramLevel(selectedLevelId).collectibles.length}`;
    hud.checkpoint.textContent = getTangramLevel(selectedLevelId).start.label;
    hud.power.textContent = 'No power-up';
    hud.hint.textContent = 'Pick any unlocked zone on the school map.';
    emitHook();
  }

  function markCompleted(levelId: TangramLevelId): void {
    if (!completedLevelIds.includes(levelId)) completedLevelIds.push(levelId);
    const nextLevelId = nextTangramLevelId(levelId);
    if (nextLevelId && !unlockedLevelIds.includes(nextLevelId)) unlockedLevelIds.push(nextLevelId);
  }

  function startLevel(levelId: TangramLevelId): void {
    selectedLevelId = levelId;
    pendingSummary = null;
    completion.overlay.hidden = true;
    select.overlay.hidden = true;
    map.overlay.hidden = true;
    destroyGame();
    const level = getTangramLevel(levelId);
    const character = getTangramCharacter(selectedCharacterId);
    const scene = new PenguinsOfTangramScene(character, level, {
      onHudUpdate(snapshot) {
        updateHudForScene(snapshot);
      },
      onSceneState(snapshot) {
        lastHookState = snapshot;
        emitHook();
      },
      onComplete(summary) {
        destroyGame();
        pendingSummary = summary;
        markCompleted(levelId);
        currentState = summary.campaignComplete ? 'campaign-complete' : 'complete';
        lastHookState = {
          badgesCollected: summary.badgesCollected,
          totalBadges: summary.totalBadges,
          checkpointLabel: summary.checkpointLabel,
          poweredUp: false,
          jumpAudit: buildJumpAudit(level, character),
        };
        completion.show(summary);
        emitHook();
      },
    });
    activeScene = scene;
    currentState = 'running';
    lastHookState = {
      badgesCollected: 0,
      totalBadges: level.collectibles.length,
      checkpointLabel: level.start.label,
      poweredUp: false,
      jumpAudit: buildJumpAudit(level, character),
    };
    game = new Phaser.Game(createConfig(host, scene, level));
    (window as unknown as { __game?: Phaser.Game }).__game = game;
    emitHook();
  }

  const keyboardHandler = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') return;
    event.preventDefault();
    onExit();
  };
  window.addEventListener('keydown', keyboardHandler);

  showCharacterSelect();

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
