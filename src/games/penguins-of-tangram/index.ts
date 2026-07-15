import Phaser from 'phaser';
import type { GameRuntime } from '../../arcade/types';
import { Sound as TangramSound } from '../../game/audio/Sound';
import {
  TANGRAM_FIXED_STEP,
  TANGRAM_MAX_FRAME_DT,
  TANGRAM_MAX_SUBSTEPS,
  TANGRAM_PLAYER_HEIGHT,
  TANGRAM_PLAYER_WIDTH,
  buildTangramJumpAudit,
  createTangramPlatformerState,
  getTangramCheckpointRespawn,
  isTangramPoweredUp,
  tickTangramPlatformer,
  type TangramPlatformerEvent,
  type TangramPlatformerState,
} from '../../core/tangramPlatformer';
import {
  PLAYABLE_CHARACTERS,
  getTangramCharacter,
  type TangramCharacterDefinition,
  type TangramCharacterId,
} from './data';
import {
  FIRST_LEVEL_ID,
  getTangramLevel,
  nextTangramLevelId,
  type Rect,
  type EnemyDefinition,
  type TangramLevelDefinition,
  type TangramLevelId,
} from './levels';
import {
  getUnlockedTangramLevelIds,
  loadTangramProgress,
  recordTangramPlaytest,
  recordTangramLevelCompletion,
  resetTangramProgress,
  saveTangramProgress,
  type TangramLevelBest,

  type TangramProgress,
} from './progress';
import {
  tangramLanguageLabel,
  tangramText,
  type TangramLanguage,
} from './language';

const VIEWPORT_WIDTH = 960;
const VIEWPORT_HEIGHT = 540;

type Collectible = {
  sprite: Phaser.GameObjects.Container;
};
type Enemy = {
  sprite: Phaser.GameObjects.Container;
};
type MovingPlatformSprite = {
  sprite: Phaser.GameObjects.Container;
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
  checkpointReached: boolean;
  falls: number;
  nextLevelId: TangramLevelId | null;
  campaignComplete: boolean;
};

type HookStateName = 'select' | 'running' | 'complete' | 'campaign-complete';

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
  audioMuted: boolean;
  reducedMotion: boolean;
  language: TangramLanguage;
  playtestEnabled: boolean;
  bossActive: boolean;
  bossHitsRemaining: number;
  bossWarning: boolean;
  bossCharging: boolean;
  jumpAudit: JumpAudit;
  completeCurrentLevel?: () => void;
};

type SceneHookState = {
  badgesCollected: number;
  totalBadges: number;
  checkpointLabel: string;
  poweredUp: boolean;
  bossActive?: boolean;
  bossHitsRemaining?: number;
  bossWarning?: boolean;
  bossCharging?: boolean;
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

type TangramTouchControls = {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  setVisible: (visible: boolean) => void;
  setLanguage: (language: TangramLanguage) => void;
  destroy: () => void;
};

function buildJumpAudit(level: TangramLevelDefinition, character: TangramCharacterDefinition): JumpAudit {
  return buildTangramJumpAudit(level, character.movement);
}

function formatBest(language: TangramLanguage, best: TangramLevelBest | undefined): string {
  return best
    ? `${tangramText(language, 'Personal best: ')}${best.badgesCollected} ${tangramText(language, 'badges')} • ${best.durationSeconds}s • ${best.falls} ${tangramText(language, 'falls')}`
    : tangramText(language, 'No personal best yet');
}

function createTouchControls(parent: HTMLElement, language: TangramLanguage): TangramTouchControls {
  const controls = document.createElement('div');
  controls.className = 'tangram-platformer-touch-controls';
  controls.hidden = true;
  controls.innerHTML = `
    <div class="tangram-platformer-touch-zone" data-control="move" aria-hidden="true"></div>
    <button type="button" data-control="jump" aria-label="${tangramText(language, 'Jump')}">↟</button>`;
  parent.append(controls);
  const setLanguage = (nextLanguage: TangramLanguage): void => {
    const jump = controls.querySelector<HTMLButtonElement>('[data-control="jump"]');
    if (jump) {
      jump.textContent = '↟';
      jump.setAttribute('aria-label', tangramText(nextLanguage, 'Jump'));
    }
  };

  const cleanups: Array<() => void> = [];
  const reset = (): void => {
    touchControls.left = false;
    touchControls.right = false;
    touchControls.jumpPressed = false;
  };
  const touchControls: TangramTouchControls = {
    left: false,
    right: false,
    jumpPressed: false,
    setVisible(visible) {
      controls.hidden = !visible;
      if (!visible) reset();
    },
    setLanguage,
    destroy() {
      reset();
      cleanups.forEach((cleanup) => cleanup());
      controls.remove();
    },
  };
  const pointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('[data-control="jump"]');
    event.preventDefault();
    if (button) {
      touchControls.jumpPressed = true;
    } else {
      const bounds = controls.getBoundingClientRect();
      const forward = event.clientX >= bounds.left + bounds.width / 2;
      touchControls.left = !forward;
      touchControls.right = forward;
    }
    if (event.pointerId) controls.setPointerCapture(event.pointerId);
  };
  controls.addEventListener('pointerdown', pointerDown);
  controls.addEventListener('pointerup', reset);
  controls.addEventListener('pointercancel', reset);
  window.addEventListener('pointerup', reset);
  window.addEventListener('pointercancel', reset);
  cleanups.push(
    () => controls.removeEventListener('pointerdown', pointerDown),
    () => controls.removeEventListener('pointerup', reset),
    () => controls.removeEventListener('pointercancel', reset),
    () => window.removeEventListener('pointerup', reset),
    () => window.removeEventListener('pointercancel', reset),
  );
  window.addEventListener('blur', reset);
  cleanups.push(() => window.removeEventListener('blur', reset));
  return touchControls;
}

class PenguinsOfTangramScene extends Phaser.Scene {
  private readonly character: TangramCharacterDefinition;
  private readonly level: TangramLevelDefinition;
  private readonly touchControls: TangramTouchControls;
  private readonly callbacks: {
    onScoreUpdate: (score: number) => void;
    onSceneState: (snapshot: SceneHookState) => void;
    onComplete: (summary: LevelSummary) => void;
  };

  private readonly jumpAudit: JumpAudit;
  private keys: TangramKeys | undefined;
  private player!: Phaser.GameObjects.Container;
  private playerAura!: Phaser.GameObjects.Ellipse;
  private playerBody!: Phaser.GameObjects.Ellipse;
  private playerBelly!: Phaser.GameObjects.Ellipse;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private playerFlippers!: Phaser.GameObjects.Rectangle[];
  private playerFeet!: Phaser.GameObjects.Ellipse[];
  private checkpointBanner!: Phaser.GameObjects.Container;
  private goalBanner!: Phaser.GameObjects.Container;
  private goalFlag!: Phaser.GameObjects.Container;
  private powerBlock!: Phaser.GameObjects.Container;
  private powerSnack!: Phaser.GameObjects.Container;
  private breakableBlocks: Phaser.GameObjects.Container[] = [];
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private bossHealthLabel: Phaser.GameObjects.Text | null = null;
  private bossTelegraphLabel: Phaser.GameObjects.Text | null = null;
  private collectibles: Collectible[] = [];
  private enemies: Enemy[] = [];
  private movingPlatforms: MovingPlatformSprite[] = [];
  private bouncePads: Phaser.GameObjects.Container[] = [];
  private readonly simulation: TangramPlatformerState;
  private readonly simulationEvents: TangramPlatformerEvent[] = [];
  private effects: TangramSound | null = null;
  private previousBadges = 0;
  private previousGrounded = false;
  private previousPowered = false;
  private previousBossHits: number | null = null;
  private readonly reducedMotion: boolean;
  private readonly muted: boolean;
  private readonly language: TangramLanguage;
  accumulator = 0;
  private lastJumpDown = false;
  private paused = false;
  private lastCameraWidth = 0;
  private lastCameraHeight = 0;

  constructor(
    character: TangramCharacterDefinition,
    level: TangramLevelDefinition,
    touchControls: TangramTouchControls,
    callbacks: {
      onScoreUpdate: (score: number) => void;
      onSceneState: (snapshot: SceneHookState) => void;
      onComplete: (summary: LevelSummary) => void;
    },
    options: { muted: boolean; reducedMotion: boolean; language: TangramLanguage },
  ) {
    super('PenguinsOfTangram');
    this.character = character;
    this.level = level;
    this.touchControls = touchControls;
    this.callbacks = callbacks;
    this.muted = options.muted;
    this.reducedMotion = options.reducedMotion;
    this.language = options.language;
    this.jumpAudit = buildJumpAudit(level, character);
    this.simulation = createTangramPlatformerState(level);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.level.skyColor);
    this.cameras.main.setBounds(0, 0, this.level.worldWidth, this.level.worldHeight);
    this.updateCameraLayout();
    this.createBackdrop();
    this.createPlatforms();
    this.createDecor();
    this.createCollectibles();
    this.createHazards();
    this.createEnemies();
    this.createBoss();
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
    if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
      this.effects = new TangramSound({
        context: this.sound.context,
        destination: this.sound.destination,
      });
      this.effects.setMuted(this.muted);
    }
    this.previousBossHits = this.simulation.boss?.hitsRemaining ?? null;
    this.updateHud();
  }

  update(_: number, deltaMs: number): void {
    if (this.simulation.finished || this.paused) return;
    this.updateCameraLayout();
    const leftDown = Boolean(this.keys?.left.isDown || this.keys?.a.isDown || this.touchControls.left);
    const rightDown = Boolean(this.keys?.right.isDown || this.keys?.d.isDown || this.touchControls.right);
    const jumpDown = Boolean(this.keys?.up.isDown || this.keys?.w.isDown || this.keys?.space.isDown);
    const direction = ((rightDown ? 1 : 0) - (leftDown ? 1 : 0)) as -1 | 0 | 1;
    let jumpPressed = (jumpDown && !this.lastJumpDown) || this.touchControls.jumpPressed;
    this.lastJumpDown = jumpDown;
    this.accumulator += Math.min(deltaMs / 1000, TANGRAM_MAX_FRAME_DT);
    let steps = 0;
    while (this.accumulator >= TANGRAM_FIXED_STEP && steps < TANGRAM_MAX_SUBSTEPS) {
      tickTangramPlatformer(
        this.simulation,
        this.level,
        this.character.movement,
        { direction, jumpPressed },
        TANGRAM_FIXED_STEP,
        this.simulationEvents,
      );
      jumpPressed = false;
      this.accumulator -= TANGRAM_FIXED_STEP;
      steps += 1;
    }

    if (steps > 0) this.touchControls.jumpPressed = false;
    if (steps === TANGRAM_MAX_SUBSTEPS && this.accumulator >= TANGRAM_FIXED_STEP) {
      this.accumulator = 0;
    }
    this.syncSimulationVisuals();
    this.applySimulationEvents();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.touchControls.setVisible(!paused);
  }

  setMuted(muted: boolean): void {
    this.effects?.setMuted(muted);
  }

  shutdown(): void {
    this.effects?.destroy();
    this.effects = null;
  }

  debugCompleteLevel(): void {
    if (this.simulation.finished) return;
    this.simulation.collected.fill(true);
    this.simulation.badgesCollected = this.collectibles.length;
    this.simulation.checkpointActivated = true;
    this.simulation.respawnPoint = getTangramCheckpointRespawn(this.level) ?? this.simulation.respawnPoint;
    this.simulation.player.x = this.level.goal.x;
    this.simulation.player.y = this.level.goal.y;
    if (this.simulation.boss) {
      this.simulation.boss.active = false;
      this.simulation.boss.hitsRemaining = 0;
    }
    for (let tick = 0; tick < 90 && !this.simulation.finished; tick += 1) {
      tickTangramPlatformer(
        this.simulation,
        this.level,
        this.character.movement,
        { direction: 0, jumpPressed: false },
        TANGRAM_FIXED_STEP,
        this.simulationEvents,
      );
    }
    this.syncSimulationVisuals();
    this.applySimulationEvents();
  }

  private updateCameraLayout(): void {
    if (this.scale.width === this.lastCameraWidth && this.scale.height === this.lastCameraHeight) return;
    this.lastCameraWidth = this.scale.width;
    this.lastCameraHeight = this.scale.height;
    const widthZoom = this.scale.width / VIEWPORT_WIDTH;
    const heightZoom = this.scale.height / VIEWPORT_HEIGHT;
    this.cameras.main.setZoom(Math.max(1, Math.min(widthZoom, heightZoom)));
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
          this.add.triangle(0, -18, -24, 0, 24, 0, 0, 26, 0x59d0ff),
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
          this.add.circle(0, -44, 14, 0xffd166),
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
          this.add.triangle(0, -46, -22, 14, 22, 14, 0, -18, 0xffd166),
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
          this.add.circle(0, -10, 14, 0xffd166),
        ]);
        break;
      }
    }
  }

  private createPlatforms(): void {
    for (const platform of this.level.platforms) {
      this.add.rectangle(platform.x + platform.width / 2, platform.y + platform.height / 2, platform.width, platform.height, platform.color)
        .setDepth(2)
        .setStrokeStyle(4, 0x103047, 0.92);
      this.add.rectangle(platform.x + platform.width / 2, platform.y + 6, platform.width, 12, platform.trim)
        .setDepth(3)
        .setStrokeStyle(2, 0x103047, 0.8);
    }
    this.breakableBlocks = (this.level.breakableBlocks ?? []).map((block) => {
      const container = this.add.container(
        block.x + block.width / 2,
        block.y + block.height / 2,
      );
      container.setDepth(3);
      container.add([
        this.add.rectangle(0, 0, block.width, block.height, block.color).setStrokeStyle(4, 0x103047, 1),
        this.add.rectangle(0, -block.height / 2 + 5, block.width, 8, block.trim),
        this.add.triangle(-8, -6, -14, -14, 0, -14, -8, 2, 0xffffff),
        this.add.triangle(8, -6, 0, -14, 16, -14, 8, 2, 0xff8f66),
        this.add.triangle(0, 8, -8, 2, 8, 2, 0, 16, 0x59d0ff),
      ]);
      return container;
    });
    this.movingPlatforms = (this.level.movingPlatforms ?? []).map((platform) => {
      const sprite = this.add.container(platform.x + platform.width / 2, platform.y + platform.height / 2);
      sprite.setDepth(3);
      sprite.add([
        this.add.rectangle(0, 0, platform.width, platform.height, platform.color),
        this.add.rectangle(0, -platform.height / 2 + 4, platform.width, 8, platform.trim),
        this.add.triangle(0, platform.height / 2 + 12, -7, 4, 7, 4, 0, -5, 0x103047),
      ]);
      sprite.list.forEach((child) => {
        if ('setStrokeStyle' in child && typeof child.setStrokeStyle === 'function') {
          child.setStrokeStyle(3, 0x103047, 0.95);
        }
      });
      return { sprite };
    });
  }

  private createDecor(): void {
    for (const sign of this.level.signs) {
      const post = this.add.container(sign.x, 348);
      post.setDepth(1.5);
      post.add([
        this.add.rectangle(0, 54, 12, 106, 0x8d5b34),
        this.add.rectangle(0, 8, 112, 44, Phaser.Display.Color.HexStringToColor(sign.color).color)
          .setStrokeStyle(3, 0x103047, 0.9),
        this.add.circle(0, 8, 11, 0xffffff).setStrokeStyle(2, 0x103047, 0.9),
        this.add.triangle(0, 8, -8, 14, 8, 14, 0, -8, 0x103047),
      ]);
    }
  }

  private createCollectibles(): void {
    this.collectibles = this.level.collectibles.map((entry) => ({
      sprite: this.createBadge(entry.x, entry.y, entry.secret ? 0xff93c2 : 0xffd166),
    }));
  }

  private createHazards(): void {
    for (const hazard of this.level.hazards) this.createPuddle(hazard);
  }

  private createEnemies(): void {
    this.enemies = this.level.enemies.map((enemy) => ({
      sprite: this.createCritter(enemy.x, enemy.y, enemy.kind),
    }));
  }

  private createBoss(): void {
    const boss = this.level.boss;
    if (!boss) return;
    this.bossSprite = this.add.container(boss.x + boss.width / 2, boss.y + boss.height / 2);
    this.bossSprite.setDepth(5);
    this.bossHealthLabel = null;
    this.bossTelegraphLabel = null;
    this.bossSprite.add([
      this.add.ellipse(0, 8, 64, 58, 0xff8f66),
      this.add.rectangle(0, -22, 72, 16, 0xffd166),
      this.add.rectangle(0, -12, 44, 12, 0x103047),
      this.add.circle(-14, -4, 6, 0xffffff),
      this.add.circle(14, -4, 6, 0xffffff),
      this.add.circle(-14, -4, 3, 0x103047),
      this.add.circle(14, -4, 3, 0x103047),
      this.add.rectangle(-18, 35, 18, 8, 0x5f3f20),
      this.add.rectangle(18, 35, 18, 8, 0x5f3f20),
    ]);
  }

  private createCheckpoint(): void {
    this.checkpointBanner = this.add.container(this.level.checkpoint.x + 20, this.level.checkpoint.y + 60);
    this.checkpointBanner.setDepth(4);
    this.checkpointBanner.add([
      this.add.rectangle(0, 24, 10, 120, 0x8d5b34),
      this.add.rectangle(34, -16, 66, 34, 0xffd166),
      this.add.circle(34, -16, 8, 0x59d0ff),
    ]);
  }

  private createGoal(): void {
    this.goalBanner = this.add.container(this.level.goal.x + this.level.goal.width / 2, 0);
    this.goalBanner.setDepth(4);
    this.goalBanner.add([
      this.add.rectangle(0, this.level.goal.y + this.level.goal.height / 2, 12, this.level.goal.height, 0x8d5b34)
        .setStrokeStyle(3, 0x103047, 0.95),
      this.add.circle(0, this.level.goal.y + this.level.goal.height, 9, 0xffd166)
        .setStrokeStyle(3, 0x103047, 0.95),
    ]);
    this.goalFlag = this.add.container(10, this.level.goal.y + 28);
    this.goalFlag.add([
      this.add.triangle(36, 0, 0, -2, 76, 14, 0, 30, 0xff8f66)
        .setStrokeStyle(3, 0x103047, 0.95),
      this.add.triangle(25, 7, 10, 0, 25, 0, 25, 15, 0xfff7d1),
      this.add.triangle(39, 7, 25, 0, 53, 0, 39, 18, 0x59d0ff),
      this.add.triangle(25, 21, 10, 15, 25, 7, 25, 28, 0x71d2b6),
      this.add.triangle(39, 21, 25, 7, 53, 15, 39, 28, 0xffd166),
    ]);
    this.goalBanner.add(this.goalFlag);
  }

  private createBouncePads(): void {
    this.bouncePads = (this.level.bouncePads ?? []).map((pad) => {
      const container = this.add.container(pad.x + pad.width / 2, pad.y + pad.height / 2);
      container.setDepth(4);
      container.add([
        this.add.rectangle(0, 0, pad.width, pad.height, pad.color),
        this.add.triangle(0, 0, -8, 6, 8, 6, 0, -8, 0x103047),
      ]);
      return container;
    });
  }

  private createPowerSnack(): void {
    this.powerBlock = this.add.container(this.level.powerup.x + this.level.powerup.width / 2, this.level.powerup.y + 26);
    this.powerBlock.setDepth(4);
    this.powerBlock.add([
      this.add.rectangle(0, 0, 46, 46, 0xffd166),
      this.add.rectangle(0, -16, 46, 8, 0xfff0a8),
      this.add.triangle(0, 4, -12, 8, 12, 8, 0, -10, 0x8d5b34),
    ]);
    this.powerSnack = this.add.container(this.level.powerup.x + this.level.powerup.width / 2, this.level.powerup.y - 18);
    this.powerSnack.setDepth(4);
    this.powerSnack.add([
      this.add.ellipse(0, 0, 40, 28, 0x71d2b6),
      this.add.rectangle(0, 0, 25, 14, 0xffd166),
      this.add.circle(-13, 0, 5, 0xffd166),
      this.add.circle(13, 0, 5, 0xffd166),
    ]);
  }

  private createPlayer(): Phaser.GameObjects.Container {
    const container = this.add.container(
      this.simulation.player.x + TANGRAM_PLAYER_WIDTH / 2,
      this.simulation.player.y + TANGRAM_PLAYER_HEIGHT / 2,
    );
    container.setSize(TANGRAM_PLAYER_WIDTH, TANGRAM_PLAYER_HEIGHT);
    container.setDepth(6);
    const bodyColor = Phaser.Display.Color.HexStringToColor(this.character.body).color;
    const accentColor = Phaser.Display.Color.HexStringToColor(this.character.accent).color;
    const accessoryColor = Phaser.Display.Color.HexStringToColor(this.character.accessory).color;
    const shadow = this.add.ellipse(0, 22, 38, 14, 0x000000, 0.18);
    const isCrocodile = this.character.id === 'crocodile';
    const isTurtle = this.character.id === 'turtle';
    const body = this.add.ellipse(0, -8, isCrocodile ? 58 : isTurtle ? 42 : 44, isCrocodile ? 34 : isTurtle ? 44 : 56, bodyColor);
    const belly = this.add.ellipse(0, -2, isCrocodile ? 34 : isTurtle ? 22 : 24, isCrocodile ? 14 : isTurtle ? 24 : 30, isTurtle ? 0x9fd8b4 : this.character.id === 'penguin' ? 0xf7fbff : accessoryColor);
    const limbWidth = isCrocodile ? 12 : 10;
    const limbHeight = isCrocodile ? 10 : 24;
    const limbY = isCrocodile ? 8 : -8;
    const leftFlipper = this.add.rectangle(-20, limbY, limbWidth, limbHeight, accessoryColor);
    const rightFlipper = this.add.rectangle(20, limbY, limbWidth, limbHeight, accessoryColor);
    const footColor = isCrocodile || isTurtle ? bodyColor : this.character.id === 'penguin' ? 0xffb15f : accessoryColor;
    const leftFoot = this.add.ellipse(-10, 22, 14, 8, footColor);
    const rightFoot = this.add.ellipse(10, 22, 14, 8, footColor);
    const eyeCenterX = isCrocodile || isTurtle ? 24 : 0;
    const eyeY = isCrocodile || isTurtle ? -19 : -18;
    const eyes = [
      this.add.circle(eyeCenterX - 5, eyeY, 4, 0xffffff),
      this.add.circle(eyeCenterX + 5, eyeY, 4, 0xffffff),
      this.add.circle(eyeCenterX - 5, eyeY, 2, 0x103047),
      this.add.circle(eyeCenterX + 5, eyeY, 2, 0x103047),
    ];
    const speciesArt: Phaser.GameObjects.GameObject[] = [];
    switch (this.character.id) {
      case 'crocodile':
        speciesArt.push(
          this.add.triangle(-34, -5, -30, -12, -30, 10, -50, 2, bodyColor),
          this.add.rectangle(38, -8, 28, 14, bodyColor).setStrokeStyle(2, 0x103047, 1),
          this.add.triangle(39, 1, 31, -4, 31, 5, 42, 2, 0xf7d86c),
          this.add.circle(33, -12, 3, 0x103047),
        );
        break;
      case 'monkey':
        speciesArt.push(
          this.add.circle(-23, -15, 11, bodyColor),
          this.add.circle(23, -15, 11, bodyColor),
          this.add.arc(-25, 10, 44, 65, 275, false, bodyColor, 7),
          this.add.ellipse(0, 28, 28, 10, bodyColor),
        );
        break;
      case 'turtle':
        speciesArt.push(
          this.add.ellipse(-3, -8, 60, 42, accentColor).setStrokeStyle(3, 0x355342, 1),
          this.add.arc(-3, -8, 44, 0, 180, false, 0x355342, 2),
          this.add.circle(28, -8, 12, bodyColor),
        );
        break;
      case 'kangaroo':
        speciesArt.push(
          this.add.ellipse(-10, -40, 10, 28, bodyColor),
          this.add.ellipse(10, -40, 10, 28, bodyColor),
          this.add.ellipse(0, 10, 28, 24, accentColor).setStrokeStyle(2, 0x103047, 1),
          this.add.arc(-22, 12, 46, 120, 260, false, bodyColor, 6),
        );
        break;
      case 'lion':
        speciesArt.push(
          this.add.circle(0, -10, 30, accentColor).setStrokeStyle(3, 0x8d5b34, 1),
          this.add.circle(-18, -32, 8, accentColor),
          this.add.circle(18, -32, 8, accentColor),
          this.add.arc(24, 10, 34, -80, 100, false, bodyColor, 5),
        );
        break;
      default:
        speciesArt.push(this.add.triangle(0, -8, -8, -4, 8, -4, 0, 8, 0xffb15f));
        break;
    }
    container.add([
      shadow,
      ...speciesArt,
      body,
      belly,
      leftFlipper,
      rightFlipper,
      ...eyes,
      leftFoot,
      rightFoot,
    ]);
    this.playerShadow = shadow;
    this.playerBody = body;
    this.playerBelly = belly;
    this.playerFlippers = [leftFlipper, rightFlipper];
    this.playerFeet = [leftFoot, rightFoot];
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

  private createCritter(x: number, y: number, kind: EnemyDefinition['kind']): Phaser.GameObjects.Container {
    const critter = this.add.container(x + 22, y + 18);
    critter.setDepth(5);
    if (kind === 'backpack') {
      critter.add([
        this.add.rectangle(0, 8, 42, 34, 0xff8f66).setStrokeStyle(3, 0x103047, 1),
        this.add.rectangle(0, -12, 28, 8, 0xffd166),
        this.add.rectangle(-12, 5, 4, 28, 0x103047),
        this.add.rectangle(12, 5, 4, 28, 0x103047),
        this.add.circle(-9, 5, 4, 0xffffff),
        this.add.circle(9, 5, 4, 0xffffff),
        this.add.rectangle(-14, 26, 10, 6, 0x5f3f20),
        this.add.rectangle(14, 26, 10, 6, 0x5f3f20),
      ]);
    } else if (kind === 'ball') {
      critter.add([
        this.add.circle(0, 8, 22, 0xffd166).setStrokeStyle(3, 0x103047, 1),
        this.add.arc(0, 8, 14, -70, 70, false, 0xff8f66, 1).setStrokeStyle(4, 0x103047, 1),
        this.add.circle(-7, 2, 3, 0x103047),
        this.add.circle(7, 2, 3, 0x103047),
        this.add.triangle(0, 14, -7, 8, 7, 8, 0, 19, 0x103047),
      ]);
    } else if (kind === 'chalkbug') {
      critter.add([
        this.add.rectangle(0, 8, 42, 28, 0x71d2b6).setStrokeStyle(3, 0x103047, 1),
        this.add.rectangle(-12, -12, 8, 18, 0xfff7d1),
        this.add.rectangle(12, -12, 8, 18, 0xfff7d1),
        this.add.circle(-10, 5, 3, 0x103047),
        this.add.circle(10, 5, 3, 0x103047),
        this.add.rectangle(-16, 25, 10, 6, 0x5f3f20),
        this.add.rectangle(16, 25, 10, 6, 0x5f3f20),
      ]);
    } else if (kind === 'bookworm') {
      critter.add([
        this.add.rectangle(0, 8, 42, 30, 0x8dc0ff).setStrokeStyle(3, 0x103047, 1),
        this.add.rectangle(0, 8, 3, 30, 0xffd166),
        this.add.circle(-11, -3, 7, 0xffffff).setStrokeStyle(2, 0x103047, 1),
        this.add.circle(11, -3, 7, 0xffffff).setStrokeStyle(2, 0x103047, 1),
        this.add.rectangle(-4, -3, 8, 3, 0x103047),
        this.add.rectangle(-14, 25, 9, 6, 0x5f3f20),
        this.add.rectangle(14, 25, 9, 6, 0x5f3f20),
      ]);
    } else {
      critter.add([
        this.add.triangle(0, 8, -22, 28, 22, 28, 0, -22, 0xff8f66).setStrokeStyle(3, 0x103047, 1),
        this.add.rectangle(0, 4, 25, 6, 0xfff7d1),
        this.add.circle(-7, -1, 3, 0x103047),
        this.add.circle(7, -1, 3, 0x103047),
        this.add.rectangle(-14, 28, 10, 5, 0x5f3f20),
        this.add.rectangle(14, 28, 10, 5, 0x5f3f20),
      ]);
    }
    return critter;
  }

  private syncSimulationVisuals(): void {
    const playerState = this.simulation.player;
    const powered = isTangramPoweredUp(this.simulation);
    if (this.effects) {
      if (this.simulation.badgesCollected > this.previousBadges) this.effects.collect();
      if (this.previousGrounded && !playerState.grounded && playerState.velocityY < 0) this.effects.jump();
      if (!this.previousGrounded && playerState.grounded) this.effects.land();
      if (!this.previousPowered && powered) this.effects.powerup();
      if (
        this.simulation.boss &&
        this.previousBossHits !== null &&
        this.simulation.boss.hitsRemaining < this.previousBossHits
      ) {
        this.effects.bossHit();
      }
    }
    this.previousBadges = this.simulation.badgesCollected;
    this.previousGrounded = playerState.grounded;
    this.previousPowered = powered;
    this.previousBossHits = this.simulation.boss?.hitsRemaining ?? null;
    this.player.x = playerState.x + TANGRAM_PLAYER_WIDTH / 2;
    this.player.y = playerState.y + TANGRAM_PLAYER_HEIGHT / 2;
    const playerScale = powered ? 1.18 : 1;
    this.player.scaleX = playerState.facing * playerScale;
    this.player.scaleY = playerScale;
    this.player.rotation = this.simulation.goalPhase === 'none'
      ? Phaser.Math.Linear(this.player.rotation, playerState.velocityX * 0.0008, 0.15)
      : 0;
    this.animatePlayer();

    for (let index = 0; index < this.enemies.length; index += 1) {
      const enemyState = this.simulation.enemies[index];
      const definition = this.level.enemies[index];
      const sprite = this.enemies[index].sprite;
      sprite.setVisible(enemyState.active);
      sprite.x = enemyState.x + definition.width / 2;
      sprite.y = definition.y + definition.height / 2
        + (this.reducedMotion ? 0 : Math.sin(this.time.now * 0.004 + index) * 2);
      sprite.scaleX = enemyState.direction;
    }
    if (this.bossSprite && this.simulation.boss && this.level.boss) {
      const bossState = this.simulation.boss;
      this.bossSprite.setVisible(bossState.active);
      this.bossSprite.x = bossState.x + this.level.boss.width / 2;
      this.bossSprite.y = this.level.boss.y + this.level.boss.height / 2;
      this.bossSprite.scaleX = bossState.direction;
      this.bossSprite.alpha = bossState.stunRemaining > 0
        ? this.reducedMotion ? 0.65 : 0.55 + Math.sin(this.time.now * 0.04) * 0.35
        : 1;
      this.bossHealthLabel?.setText(`${this.t('STOMPS: ')}${bossState.hitsRemaining}`);
      const warning = bossState.warningRemaining > 0;
      const charging = bossState.charging;
      this.bossTelegraphLabel?.setVisible(warning || charging);
      this.bossTelegraphLabel?.setText(this.t(charging ? 'CHARGE!' : 'CHARGE READY'));
      if (this.bossTelegraphLabel) this.bossTelegraphLabel.setTint(charging ? 0xff6b5f : 0x8d5b34);
    }
    for (let index = 0; index < this.movingPlatforms.length; index += 1) {
      const platformState = this.simulation.movingPlatforms[index];
      const sprite = this.movingPlatforms[index].sprite;
      sprite.x = platformState.x + platformState.width / 2;
      sprite.y = platformState.y + platformState.height / 2;
      sprite.rotation = platformState.axis === 'x' ? 0 : Math.sin(this.time.now * 0.003) * 0.02;
    }
    for (let index = 0; index < this.bouncePads.length; index += 1) {
      const pad = this.bouncePads[index];
      const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.time.now * 0.006 + index) * 0.08;
      pad.setScale(pulse, 1 / pulse);
    }
    for (let index = 0; index < this.collectibles.length; index += 1) {
      const sprite = this.collectibles[index].sprite;
      sprite.setVisible(!this.simulation.collected[index]);
      if (!this.simulation.collected[index]) {
        const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.time.now * 0.005 + index) * 0.08;
        sprite.setScale(pulse);
        sprite.rotation = this.reducedMotion ? 0 : Math.sin(this.time.now * 0.002 + index) * 0.08;
      }
    }
    this.powerBlock.setVisible(!this.simulation.powerBlockHit);
    this.powerSnack.setVisible(this.simulation.powerBlockHit && this.simulation.powerSnackAvailable);
    for (let index = 0; index < this.breakableBlocks.length; index += 1) {
      this.breakableBlocks[index].setVisible(!this.simulation.breakableBlocksBroken[index]);
    }
    this.powerSnack.y = this.level.powerup.y - 18 + (this.reducedMotion ? 0 : Math.sin(this.time.now * 0.004) * 5);
    this.powerSnack.rotation = this.reducedMotion ? 0 : Math.sin(this.time.now * 0.002) * 0.12;
    this.powerSnack.setScale(this.reducedMotion ? 1 : 1 + Math.sin(this.time.now * 0.006) * 0.06);
    this.checkpointBanner.y = this.level.checkpoint.y + 60 + (this.reducedMotion ? 0 : Math.sin(this.time.now * 0.003) * 2);
    this.goalFlag.y = this.simulation.goalPhase === 'none'
      ? this.level.goal.y + 28
      : this.simulation.goalFlagY + 28;
    this.playerAura.setVisible(powered);
    this.playerAura.x = this.player.x;
    this.playerAura.y = this.player.y - 10;
    if (this.simulation.checkpointActivated) {
      this.checkpointBanner.list.forEach((child) => {
        if ('setTint' in child && typeof child.setTint === 'function') child.setTint(0x7dfc8a);
      });
    }
  }

  private animatePlayer(): void {
      const playerState = this.simulation.player;
      const speed = Math.abs(playerState.velocityX);
      const walking = playerState.grounded && speed > 12;
      const phase = this.reducedMotion ? 0 : this.time.now * (walking ? 0.024 : 0.008);
      const stride = walking ? Math.sin(phase) * 5 : 0;
      const bob = playerState.grounded
        ? walking
          ? Math.abs(Math.sin(phase)) * 1.4
          : Math.sin(phase) * 0.8
        : 0;
      const airborne = !playerState.grounded;
      const tuck = airborne ? Math.min(1, Math.abs(playerState.velocityY) / 900) : 0;
      const powered = isTangramPoweredUp(this.simulation);
      const limbRestY = this.character.id === 'crocodile' ? 8 : -8;

      this.playerShadow.setScale(walking ? 1.08 : 1, walking ? 0.9 : 1);
      this.playerShadow.setAlpha(airborne ? 0.1 : 0.18);
      this.playerBody.y = -8 + bob;
      this.playerBody.scaleY = 1 + (powered ? 0.04 : 0);
      this.playerBelly.y = -2 + bob;
      this.playerFlippers[0].y = limbRestY + bob - tuck * 3;
      this.playerFlippers[1].y = limbRestY + bob - tuck * 3;
      this.playerFlippers[0].rotation = -0.18 - Math.sin(phase) * (walking ? 0.22 : 0.04);
      this.playerFlippers[1].rotation = 0.18 + Math.sin(phase) * (walking ? 0.22 : 0.04);
      this.playerFeet[0].x = -10 + stride;
      this.playerFeet[1].x = 10 - stride;
      this.playerFeet[0].y = 22 + bob - tuck * 5;
      this.playerFeet[1].y = 22 + bob - tuck * 5;
  }

  private applySimulationEvents(): void {
    let shouldUpdateHud = false;
    for (const event of this.simulationEvents) {
      if (event.type === 'hud') shouldUpdateHud = true;
      if (event.type === 'shake' && !this.reducedMotion) this.cameras.main.shake(180, 0.004);
      if (event.type === 'complete') {
        this.effects?.fanfare();
        this.completeLevel();
      }
    }
    this.simulationEvents.length = 0;
    if (shouldUpdateHud && !this.simulation.finished) this.updateHud();
  }

  private completeLevel(): void {
    const nextLevelId = nextTangramLevelId(this.level.id);
    this.callbacks.onComplete({
      characterName: this.character.name,
      levelTitle: this.level.title,
      badgesCollected: this.simulation.badgesCollected,
      totalBadges: this.collectibles.length,
      durationSeconds: Math.max(1, Math.round(this.simulation.elapsedSeconds)),
      checkpointLabel: this.simulation.respawnPoint.label,
      checkpointReached: this.simulation.checkpointActivated,
      falls: this.simulation.falls,
      nextLevelId,
      campaignComplete: nextLevelId === null,
    });
  }

  private updateHud(): void {
    this.callbacks.onScoreUpdate(this.simulation.badgesCollected);
    this.callbacks.onSceneState(this.currentSceneHookState());
  }

  private currentSceneHookState(): SceneHookState {
    return {
      badgesCollected: this.simulation.badgesCollected,
      totalBadges: this.collectibles.length,
      checkpointLabel: this.simulation.respawnPoint.label,
      poweredUp: isTangramPoweredUp(this.simulation),
      bossActive: this.simulation.boss?.active ?? false,
      bossHitsRemaining: this.simulation.boss?.hitsRemaining ?? 0,
      bossWarning: (this.simulation.boss?.warningRemaining ?? 0) > 0,
      bossCharging: this.simulation.boss?.charging ?? false,
      jumpAudit: this.jumpAudit,
    };
  }

  private t(value: string): string {
    return tangramText(this.language, value);
  }
}

function createBadgeScore(parent: HTMLElement, language: TangramLanguage): {
  setScore: (score: number) => void;
  setLanguage: (language: TangramLanguage) => void;
} {
  const score = document.createElement('div');
  score.className = 'tangram-platformer-score';
  score.setAttribute('aria-label', tangramText(language, 'Badges collected'));
  score.innerHTML = '<span class="tangram-platformer-score-icon" aria-hidden="true">◆</span><strong>0</strong>';
  parent.append(score);
  const value = score.querySelector('strong')!;
  return {
    setScore(nextScore) {
      value.textContent = String(nextScore);
    },
    setLanguage(nextLanguage) {
      score.setAttribute('aria-label', tangramText(nextLanguage, 'Badges collected'));
    },
  };
}

function createPauseButton(parent: HTMLElement, language: TangramLanguage, onPause: () => void): {
  setVisible: (visible: boolean) => void;
  setLanguage: (language: TangramLanguage) => void;
} {
  const button = document.createElement('button');
  button.className = 'tangram-platformer-pause-button';
  button.type = 'button';
  button.textContent = tangramText(language, 'Pause');
  button.hidden = true;
  button.addEventListener('click', onPause);
  parent.append(button);
  return {
    setVisible(visible) {
      button.hidden = !visible;
    },
    setLanguage(nextLanguage) {
      button.textContent = tangramText(nextLanguage, 'Pause');
    },
  };
}

function createPauseOverlay(
  parent: HTMLElement,
  language: TangramLanguage,
  actions: { onResume: () => void; onMap: () => void; onRestart: () => void; onHelp: () => void },
): { overlay: HTMLDivElement; show: () => void; hide: () => void; setLanguage: (language: TangramLanguage) => void } {
  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay tangram-platformer-overlay--pause';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="tangram-platformer-panel">
      <p class="tangram-platformer-kicker" data-label="kicker">Tangram pause</p>
      <h2 data-label="title">Parade paused</h2>
      <p class="tangram-platformer-copy" data-label="copy">The simulation is frozen. Take a breath, then jump back into the route.</p>
      <div class="tangram-platformer-action-row">
        <button class="tangram-platformer-button" type="button" data-action="resume">Resume run</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="restart">Restart level</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="help">How to play</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="map">Choose class</button>
      </div>
    </section>`;
  parent.append(overlay);
  overlay.querySelector<HTMLButtonElement>('[data-action="resume"]')?.addEventListener('click', actions.onResume);
  overlay.querySelector<HTMLButtonElement>('[data-action="restart"]')?.addEventListener('click', actions.onRestart);
  overlay.querySelector<HTMLButtonElement>('[data-action="help"]')?.addEventListener('click', actions.onHelp);
  overlay.querySelector<HTMLButtonElement>('[data-action="map"]')?.addEventListener('click', actions.onMap);
  const setLanguage = (nextLanguage: TangramLanguage): void => {
    const labels: Record<string, string> = {
      kicker: 'Tangram pause',
      title: 'Parade paused',
      copy: 'The simulation is frozen. Take a breath, then jump back into the route.',
    };
    for (const [key, value] of Object.entries(labels)) {
      overlay.querySelector<HTMLElement>(`[data-label="${key}"]`)!.textContent = tangramText(nextLanguage, value);
    }
    for (const action of ['resume', 'restart', 'help', 'map'] as const) {
      const text = action === 'resume' ? 'Resume run' : action === 'restart' ? 'Restart level' : action === 'help' ? 'How to play' : 'Choose class';
      overlay.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.textContent = tangramText(nextLanguage, text);
    }
  };
  setLanguage(language);
  return {
    overlay,
    show: () => { overlay.hidden = false; },
    hide: () => { overlay.hidden = true; },
    setLanguage,
  };
}

function createAudioToggle(
  parent: HTMLElement,
  language: TangramLanguage,
  muted: boolean,
  onToggle: (muted: boolean) => void,
): { setMuted: (muted: boolean) => void; setLanguage: (language: TangramLanguage) => void } {
  const button = document.createElement('button');
  button.className = 'tangram-platformer-audio-button';
  button.type = 'button';
  parent.append(button);
  let currentLanguage = language;
  const setMuted = (nextMuted: boolean): void => {
    button.textContent = tangramText(currentLanguage, nextMuted ? 'Sound: Off' : 'Sound: On');
    button.setAttribute('aria-pressed', String(nextMuted));
    button.setAttribute('aria-label', tangramText(currentLanguage, nextMuted ? 'Turn sound on' : 'Mute sound'));
  };
  button.addEventListener('click', () => {
    const nextMuted = button.getAttribute('aria-pressed') !== 'true';
    setMuted(nextMuted);
    onToggle(nextMuted);
  });
  setMuted(muted);
  return {
    setMuted,
    setLanguage(nextLanguage) {
      currentLanguage = nextLanguage;
      setMuted(button.getAttribute('aria-pressed') === 'true');
    },
  };
}

function createChildHelpPanel(
  parent: HTMLElement,
  options: {
    language: TangramLanguage;
    reducedMotion: boolean;
    playtestEnabled: boolean;
    onReducedMotion: (reduced: boolean) => void;
    onPlaytest: (enabled: boolean) => void;
    onLanguage: (language: TangramLanguage) => void;
    onReset: () => void;
    onClose: () => void;
  },
): {
  show: () => void;
  hide: () => void;
  setReducedMotion: (reduced: boolean) => void;
  setPlaytestEnabled: (enabled: boolean) => void;
  setLanguage: (language: TangramLanguage) => void;
} {
  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay tangram-platformer-overlay--help';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="tangram-platformer-panel">
      <p class="tangram-platformer-kicker" data-label="kicker">Tangram helper</p>
      <h2 data-label="title">How to play</h2>
      <p class="tangram-platformer-copy" data-label="copy">Move, jump, collect badges, and ring the bell. Falling is okay: checkpoints remember your place.</p>
      <div class="tangram-platformer-help-list">
        <p><strong data-label="keyboard">Keyboard</strong><br><span data-label="keyboard-copy">Arrow keys or A/D move. Space, W, or Up jumps.</span></p>
        <p><strong data-label="touch">Touch</strong><br><span data-label="touch-copy">Tap ahead or behind the player to move. Tap the big circle to jump.</span></p>
        <p><strong data-label="pause">Pause</strong><br><span data-label="pause-copy">Press P or Escape, or choose Pause.</span></p>
      </div>
      <div class="tangram-platformer-action-row tangram-platformer-action-row--settings">
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-help-action="language"></button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-help-action="motion"></button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-help-action="playtest"></button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-help-action="reset"></button>
        <button class="tangram-platformer-button" type="button" data-help-action="close"></button>
      </div>
    </section>`;
  parent.append(overlay);

  const motionButton = overlay.querySelector<HTMLButtonElement>('[data-help-action="motion"]');
  const playtestButton = overlay.querySelector<HTMLButtonElement>('[data-help-action="playtest"]');
  const languageButton = overlay.querySelector<HTMLButtonElement>('[data-help-action="language"]');
  let currentLanguage = options.language;
  const setReducedMotion = (reduced: boolean): void => {
    if (!motionButton) return;
    motionButton.textContent = tangramText(currentLanguage, reduced ? 'Motion: Reduced' : 'Motion: Normal');
    motionButton.setAttribute('aria-pressed', String(reduced));
  };
  const setPlaytestEnabled = (enabled: boolean): void => {
    if (!playtestButton) return;
    playtestButton.textContent = tangramText(currentLanguage, enabled ? 'Route notes: On' : 'Route notes: Off');
    playtestButton.setAttribute('aria-pressed', String(enabled));
  };
  const show = (): void => {
    overlay.hidden = false;
    overlay.querySelector<HTMLButtonElement>('[data-help-action="close"]')?.focus();
  };
  const hide = (): void => {
    overlay.hidden = true;
    options.onClose();
  };
  overlay.querySelector<HTMLButtonElement>('[data-help-action="close"]')?.addEventListener('click', () => {
    hide();
  });
  motionButton?.addEventListener('click', () => {
    const reduced = motionButton.getAttribute('aria-pressed') !== 'true';
    setReducedMotion(reduced);
    options.onReducedMotion(reduced);
  });
  playtestButton?.addEventListener('click', () => {
    const enabled = playtestButton.getAttribute('aria-pressed') !== 'true';
    setPlaytestEnabled(enabled);
    options.onPlaytest(enabled);
  });
  languageButton?.addEventListener('click', () => {
    options.onLanguage(currentLanguage === 'nl' ? 'en' : 'nl');
  });
  overlay.querySelector<HTMLButtonElement>('[data-help-action="reset"]')?.addEventListener('click', () => {
    if (window.confirm(tangramText(currentLanguage, 'Reset the adventure and start again?'))) {
      overlay.hidden = true;
      options.onReset();
    }
  });
  setReducedMotion(options.reducedMotion);
  setPlaytestEnabled(options.playtestEnabled);
  const setLanguage = (nextLanguage: TangramLanguage): void => {
    currentLanguage = nextLanguage;
    const labels: Record<string, string> = {
      kicker: 'Tangram helper',
      title: 'How to play',
      copy: 'Move, jump, collect badges, and ring the bell. Falling is okay: checkpoints remember your place.',
      keyboard: 'Keyboard',
      'keyboard-copy': 'Arrow keys or A/D move. Space, W, or Up jumps.',
      touch: 'Touch',
      'touch-copy': 'Tap ahead or behind the player to move. Tap the big circle to jump.',
      pause: 'Pause',
      'pause-copy': 'Press P or Escape, or choose Pause.',
    };
    for (const [key, value] of Object.entries(labels)) {
      overlay.querySelector<HTMLElement>(`[data-label="${key}"]`)!.textContent = tangramText(nextLanguage, value);
    }
    if (languageButton) languageButton.textContent = `${tangramLanguageLabel(nextLanguage)} / ${nextLanguage === 'nl' ? 'English' : 'Nederlands'}`;
    overlay.querySelector<HTMLButtonElement>('[data-help-action="reset"]')!.textContent = tangramText(nextLanguage, 'Reset campaign');
    overlay.querySelector<HTMLButtonElement>('[data-help-action="close"]')!.textContent = tangramText(nextLanguage, 'Close');
    setReducedMotion(Boolean(motionButton?.getAttribute('aria-pressed') === 'true'));
    setPlaytestEnabled(Boolean(playtestButton?.getAttribute('aria-pressed') === 'true'));
  };
  setLanguage(options.language);
  return { show, hide, setReducedMotion, setPlaytestEnabled, setLanguage };
}

function createCharacterSelect(
  parent: HTMLElement,
  language: TangramLanguage,
  selectedCharacterId: TangramCharacterId,
  onSelect: (id: TangramCharacterId) => void,
  onStart: () => void,
): { overlay: HTMLDivElement; updateSelection: (id: TangramCharacterId) => void; setLanguage: (language: TangramLanguage) => void } {
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
  let currentLanguage = language;
  let currentCharacterId = selectedCharacterId;
  startButton.textContent = tangramText(language, 'Start adventure');
  startButton.addEventListener('click', onStart);
  const header = document.createElement('div');
  title.append(header);
  const buttons = PLAYABLE_CHARACTERS.map((character) => {
    const button = document.createElement('button');
    button.className = 'tangram-platformer-character';
    button.type = 'button';
    button.dataset.characterId = character.id;
    button.innerHTML = '<span class="tangram-platformer-character-art" aria-hidden="true"></span><strong></strong><span data-role="class"></span><small></small>';
    button.classList.add(`tangram-platformer-character--${character.id}`);
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
    currentCharacterId = id;
    const character = getTangramCharacter(id);
    for (const button of buttons) {
      const selected = button.dataset.characterId === id;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    description.textContent = tangramText(currentLanguage, character.description);
  };
  const setLanguage = (nextLanguage: TangramLanguage): void => {
    currentLanguage = nextLanguage;
    header.innerHTML = `
      <p class="tangram-platformer-kicker">${tangramText(nextLanguage, 'Tangram school adventure')}</p>
      <h2>${tangramText(nextLanguage, 'Penguins of Tangram')}</h2>
      <p class="tangram-platformer-copy">${tangramText(nextLanguage, 'Pick a classmate and jump through the school.')}</p>`;
    startButton.textContent = tangramText(nextLanguage, 'Start adventure');
    for (const button of buttons) {
      const character = getTangramCharacter(button.dataset.characterId as TangramCharacterId);
      button.querySelector('strong')!.textContent = tangramText(nextLanguage, character.name);
      button.querySelector('[data-role="class"]')!.textContent = tangramText(nextLanguage, character.className);
      button.querySelector('small')!.textContent = tangramText(nextLanguage, character.description);
    }
    updateSelection(currentCharacterId);
  };
  setLanguage(language);
  return { overlay, updateSelection, setLanguage };
}

function createCompletionOverlay(
  parent: HTMLElement,
  language: TangramLanguage,
  actions: {
    onReplay: () => void;
    onMap: () => void;
    onChooseAnother: () => void;
    onNext: () => void;
  },
): {
  overlay: HTMLDivElement;
  show: (summary: LevelSummary, personalBest?: TangramLevelBest) => void;
  setLanguage: (language: TangramLanguage) => void;
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
        <span class="tangram-platformer-chip"><strong data-label="badges">Badges</strong><span data-field="badges"></span></span>
        <span class="tangram-platformer-chip"><strong data-label="time">Time</strong><span data-field="time"></span></span>
        <span class="tangram-platformer-chip"><strong data-label="checkpoint">Checkpoint</strong><span data-field="checkpoint"></span></span>
        <span class="tangram-platformer-chip"><strong data-label="falls">Falls</strong><span data-field="falls"></span></span>
      </div>
      <p class="tangram-platformer-copy tangram-platformer-copy--soft" data-field="best"></p>
      <div class="tangram-platformer-action-row">
        <button class="tangram-platformer-button" type="button" data-action="next">Next zone</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="map">Choose class</button>
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
  const best = overlay.querySelector('[data-field="best"]') as HTMLParagraphElement;
  const nextButton = overlay.querySelector('[data-action="next"]') as HTMLButtonElement;
  let currentLanguage = language;
  const setLanguage = (nextLanguage: TangramLanguage): void => {
    currentLanguage = nextLanguage;
    for (const [key, value] of Object.entries({ badges: 'Badges', time: 'Time', checkpoint: 'Checkpoint', falls: 'Falls' })) {
      overlay.querySelector<HTMLElement>(`[data-label="${key}"]`)!.textContent = tangramText(nextLanguage, value);
    }
    for (const action of ['next', 'map', 'replay', 'choose'] as const) {
      const text = action === 'next' ? 'Next zone' : action === 'map' ? 'Choose class' : action === 'replay' ? 'Replay zone' : 'Choose another class';
      overlay.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.textContent = tangramText(nextLanguage, text);
    }
  };
  setLanguage(language);
  return {
    overlay,
    show(summary, personalBest?: TangramLevelBest) {
      const nextLevel = summary.nextLevelId ? getTangramLevel(summary.nextLevelId) : null;
      kicker.textContent = tangramText(currentLanguage, summary.campaignComplete ? 'Campaign complete' : 'Zone complete');
      title.textContent = summary.campaignComplete
        ? tangramText(currentLanguage, 'School festival complete!')
        : `${tangramText(currentLanguage, summary.levelTitle)} ${currentLanguage === 'nl' ? 'afgerond!' : 'cleared!'}`;
      summaryText.textContent = summary.campaignComplete
        ? `${tangramText(currentLanguage, summary.characterName)} ${currentLanguage === 'nl' ? 'bracht elke klassenparade naar de laatste bel en maakte de hele Tangram-schooldag af.' : 'carried every class parade to the final bell and wrapped the full Tangram school day.'}`
        : `${tangramText(currentLanguage, summary.characterName)} ${currentLanguage === 'nl' ? 'maakte' : 'cleared'} ${tangramText(currentLanguage, summary.levelTitle)} ${currentLanguage === 'nl' ? 'af en opende' : 'and unlocked'} ${tangramText(currentLanguage, nextLevel?.title ?? 'Next route')}.`;
      badges.textContent = `${summary.badgesCollected}/${summary.totalBadges}`;
      time.textContent = `${summary.durationSeconds}s`;
      checkpoint.textContent = tangramText(currentLanguage, summary.checkpointLabel);
      falls.textContent = String(summary.falls);
      best.textContent = formatBest(currentLanguage, personalBest);
      nextButton.hidden = summary.nextLevelId === null;
      nextButton.textContent = summary.campaignComplete
        ? tangramText(currentLanguage, 'Choose class')
        : `${currentLanguage === 'nl' ? 'Volgende' : 'Next'}: ${tangramText(currentLanguage, nextLevel?.kicker ?? 'Next zone')}`;
      overlay.hidden = false;
    },
    setLanguage,
  };
}

function createConfig(parent: HTMLElement, scene: PenguinsOfTangramScene, level: TangramLevelDefinition): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: level.skyColor,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    render: { powerPreference: 'high-performance' },
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

  let progress: TangramProgress = loadTangramProgress();
  let language: TangramLanguage = progress.language;
  const score = createBadgeScore(parent, language);
  const touchControls = createTouchControls(parent, language);
  let selectedCharacterId: TangramCharacterId = progress.selectedCharacterId;
  const unlockedLevelIds: TangramLevelId[] = getUnlockedTangramLevelIds(progress.completedLevelIds);
  const completedLevelIds: TangramLevelId[] = [...progress.completedLevelIds];
  let selectedLevelId: TangramLevelId =
    unlockedLevelIds.find((levelId) => !completedLevelIds.includes(levelId)) ?? FIRST_LEVEL_ID;
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
  let isPaused = false;
  let audioMuted = progress.audioMuted;
  let reducedMotion = progress.reducedMotion || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  let playtestEnabled = progress.playtestEnabled;
  let openHelp = (): void => {};

  const pauseButton = createPauseButton(parent, language, () => togglePause());
  const pauseOverlay = createPauseOverlay(parent, language, {
    onResume: () => togglePause(false),
    onRestart: () => startLevel(selectedLevelId),
    onHelp: () => {
      pauseOverlay.hide();
      openHelp();
    },
    onMap: () => showCharacterSelect(),
  });
  const audioToggle = createAudioToggle(parent, language, audioMuted, (muted) => {
    audioMuted = muted;
    progress = { ...progress, audioMuted };
    saveTangramProgress(progress);
    activeScene?.setMuted(muted);
    emitHook();
  });

  function togglePause(nextValue?: boolean): void {
    if (currentState !== 'running' || !activeScene) return;
    isPaused = nextValue ?? !isPaused;
    activeScene.setPaused(isPaused);
    pauseButton.setVisible(!isPaused);
    if (isPaused) pauseOverlay.show();
    else pauseOverlay.hide();
  }

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
      audioMuted,
      reducedMotion,
      language,
      playtestEnabled,
      bossActive: lastHookState.bossActive ?? false,
      bossHitsRemaining: lastHookState.bossHitsRemaining ?? 0,
      bossWarning: lastHookState.bossWarning ?? false,
      bossCharging: lastHookState.bossCharging ?? false,
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

  const completion = createCompletionOverlay(parent, language, {
    onReplay: () => startLevel(selectedLevelId),
    onMap: () => showCharacterSelect(),
    onChooseAnother: () => showCharacterSelect(),
    onNext: () => {
      if (pendingSummary?.nextLevelId) startLevel(pendingSummary.nextLevelId);
      else showCharacterSelect();
    },
  });

  const select = createCharacterSelect(
    parent,
    language,
    selectedCharacterId,
    (id) => {
      selectedCharacterId = id;
      progress = { ...progress, selectedCharacterId };
      saveTangramProgress(progress);
      select.updateSelection(id);
      lastHookState = {
        ...lastHookState,
        jumpAudit: buildJumpAudit(getTangramLevel(selectedLevelId), getTangramCharacter(selectedCharacterId)),
      };
      emitHook();
    },
    () => startLevel(selectedLevelId),
  );

  const helpPanel = createChildHelpPanel(parent, {
    language,
    reducedMotion,
    playtestEnabled,
    onReducedMotion(reduced) {
      reducedMotion = reduced;
      progress = { ...progress, reducedMotion };
      saveTangramProgress(progress);
      emitHook();
    },
    onPlaytest(enabled) {
      playtestEnabled = enabled;
      progress = { ...progress, playtestEnabled };
      saveTangramProgress(progress);
      emitHook();
    },
    onLanguage(nextLanguage) {
      const wasPaused = isPaused;
      language = nextLanguage;
      progress = { ...progress, language };
      saveTangramProgress(progress);
      touchControls.setLanguage(language);
      score.setLanguage(language);
      pauseButton.setLanguage(language);
      pauseOverlay.setLanguage(language);
      audioToggle.setLanguage(language);
      helpPanel.setLanguage(language);
      select.setLanguage(language);
      completion.setLanguage(language);
      if (currentState === 'running') {
        startLevel(selectedLevelId);
        if (wasPaused) togglePause(true);
      }
      else if (currentState === 'select') showCharacterSelect();
      emitHook();
    },
    onClose: () => {
      if (currentState === 'running' && isPaused) pauseOverlay.show();
    },
    onReset() {
      progress = resetTangramProgress();
      language = progress.language;
      selectedCharacterId = progress.selectedCharacterId;
      selectedLevelId = FIRST_LEVEL_ID;
      completedLevelIds.splice(0, completedLevelIds.length);
      unlockedLevelIds.splice(0, unlockedLevelIds.length, ...getUnlockedTangramLevelIds([]));
      audioMuted = progress.audioMuted;
      reducedMotion = progress.reducedMotion;
      playtestEnabled = progress.playtestEnabled;
      audioToggle.setMuted(audioMuted);
      audioToggle.setLanguage(language);
      touchControls.setLanguage(language);
      score.setLanguage(language);
      pauseButton.setLanguage(language);
      pauseOverlay.setLanguage(language);
      helpPanel.setLanguage(language);
      select.setLanguage(language);
      completion.setLanguage(language);
      helpPanel.setReducedMotion(reducedMotion);
      helpPanel.setPlaytestEnabled(playtestEnabled);
      select.updateSelection(selectedCharacterId);
      showCharacterSelect();
    },
  });
  openHelp = helpPanel.show;

  function showCharacterSelect(): void {
    destroyGame();
    touchControls.setVisible(false);
    pauseButton.setVisible(false);
    pauseOverlay.hide();
    isPaused = false;
    completion.overlay.hidden = true;
    select.overlay.hidden = false;
    currentState = 'select';
    lastHookState = {
      badgesCollected: 0,
      totalBadges: getTangramLevel(selectedLevelId).collectibles.length,
      checkpointLabel: getTangramLevel(selectedLevelId).start.label,
      poweredUp: false,
      jumpAudit: buildJumpAudit(getTangramLevel(selectedLevelId), getTangramCharacter(selectedCharacterId)),
    };
    emitHook();
  }

  function markCompleted(levelId: TangramLevelId): void {
    if (!completedLevelIds.includes(levelId)) completedLevelIds.push(levelId);
    const nextLevelId = nextTangramLevelId(levelId);
    if (nextLevelId && !unlockedLevelIds.includes(nextLevelId)) unlockedLevelIds.push(nextLevelId);
    if (pendingSummary) {
      progress = recordTangramLevelCompletion(progress, levelId, {
        badgesCollected: pendingSummary.badgesCollected,
        durationSeconds: pendingSummary.durationSeconds,
        falls: pendingSummary.falls,
      });
      progress = recordTangramPlaytest(
        progress,
        levelId,
        pendingSummary.durationSeconds,
        pendingSummary.falls,
        pendingSummary.checkpointReached,
      );
      saveTangramProgress(progress);
    }
  }

  function startLevel(levelId: TangramLevelId): void {
    selectedLevelId = levelId;
    pendingSummary = null;
    completion.overlay.hidden = true;
    pauseOverlay.hide();
    pauseButton.setVisible(false);
    isPaused = false;
    select.overlay.hidden = true;
    destroyGame();
    const level = getTangramLevel(levelId);
    const character = getTangramCharacter(selectedCharacterId);
    const scene = new PenguinsOfTangramScene(character, level, touchControls, {
      onScoreUpdate(nextScore) {
        score.setScore(nextScore);
      },
      onSceneState(snapshot) {
        lastHookState = snapshot;
        emitHook();
      },
      onComplete(summary) {
        destroyGame();
        touchControls.setVisible(false);
        pauseButton.setVisible(false);
        pauseOverlay.hide();
        isPaused = false;
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
        completion.show(summary, progress.bestByLevel[levelId]);
        if (summary.nextLevelId) {
          window.setTimeout(() => {
            if (currentState === 'complete' && pendingSummary === summary) startLevel(summary.nextLevelId!);
          }, reducedMotion ? 0 : 900);
        }
        emitHook();
      },
    }, { muted: audioMuted, reducedMotion, language });
    activeScene = scene;
    touchControls.setVisible(true);
    pauseButton.setVisible(true);
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
    if (event.code === 'KeyP' || (event.code === 'Escape' && currentState === 'running')) {
      event.preventDefault();
      togglePause();
      return;
    }
    if (event.code !== 'Escape') return;
    event.preventDefault();
    onExit();
  };
  window.addEventListener('keydown', keyboardHandler);

  showCharacterSelect();

  return {
    stop() {
      destroyGame();
      touchControls.destroy();
      window.removeEventListener('keydown', keyboardHandler);
      delete (window as unknown as { __penguinsOfTangram?: TestHook }).__penguinsOfTangram;
      parent.innerHTML = '';
      parent.classList.remove('tangram-platformer-stage');
    },
  };
}
