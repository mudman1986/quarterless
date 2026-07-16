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
  tangramBadgeTotal,
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
const COMPLETION_AUTO_RESUME_MS = 10_000;
const BACKDROP_DISPLAY_SCALE = 4 / 3;
const ACTOR_DISPLAY_SCALE = 0.7;
const CLOUD_POSITIONS = [[0.3, 0.18], [0.72, 0.29]] as const;

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
    <div class="tangram-platformer-touch-zone" data-control="move" aria-hidden="true">
      <div class="tangram-platformer-touch-stick"></div>
    </div>
    <button type="button" data-control="jump" aria-label="${tangramText(language, 'Jump')}">↟</button>`;
  parent.append(controls);
  const movePad = controls.querySelector<HTMLElement>('[data-control="move"]');
  const moveStick = controls.querySelector<HTMLElement>('.tangram-platformer-touch-stick');
  const jumpButton = controls.querySelector<HTMLButtonElement>('[data-control="jump"]');
  if (!movePad || !moveStick || !jumpButton) {
    throw new Error('Unable to create Tangram touch controls.');
  }
  const setLanguage = (nextLanguage: TangramLanguage): void => {
    jumpButton.textContent = '↟';
    jumpButton.setAttribute('aria-label', tangramText(nextLanguage, 'Jump'));
  };

  const cleanups: Array<() => void> = [];
  let movementPointerId: number | undefined;
  const resetMovement = (): void => {
    movementPointerId = undefined;
    touchControls.left = false;
    touchControls.right = false;
    moveStick.style.removeProperty('--stick-offset-x');
  };
  const reset = (): void => {
    resetMovement();
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
  const updateMovement = (event: PointerEvent): void => {
    const bounds = movePad.getBoundingClientRect();
    const horizontalOffset = event.clientX - (bounds.left + bounds.width / 2);
    const deadZone = bounds.width * 0.1;
    const stickLimit = bounds.width * 0.25;
    const stickOffset = Math.max(-stickLimit, Math.min(stickLimit, horizontalOffset));
    moveStick.style.setProperty('--stick-offset-x', `${stickOffset}px`);
    touchControls.left = horizontalOffset < -deadZone;
    touchControls.right = horizontalOffset > deadZone;
  };
  const startMovement = (event: PointerEvent): void => {
    if (movementPointerId !== undefined) return;
    event.preventDefault();
    movementPointerId = event.pointerId;
    updateMovement(event);
    movePad.setPointerCapture(event.pointerId);
  };
  const moveMovement = (event: PointerEvent): void => {
    if (event.pointerId !== movementPointerId) return;
    event.preventDefault();
    updateMovement(event);
  };
  const stopMovement = (event: PointerEvent): void => {
    if (event.pointerId === movementPointerId) resetMovement();
  };
  const stopLostMovement = (event: PointerEvent): void => {
    if (event.pointerId === movementPointerId && event.buttons === 0) resetMovement();
  };
  const resetWhenHidden = (): void => {
    if (document.visibilityState !== 'visible') reset();
  };
  const pressJump = (event: PointerEvent): void => {
    event.preventDefault();
    touchControls.jumpPressed = true;
  };
  movePad.addEventListener('pointerdown', startMovement);
  movePad.addEventListener('pointermove', moveMovement);
  movePad.addEventListener('pointerup', stopMovement);
  movePad.addEventListener('pointercancel', stopMovement);
  movePad.addEventListener('lostpointercapture', stopLostMovement);
  jumpButton.addEventListener('pointerdown', pressJump);
  window.addEventListener('pointerup', stopMovement);
  window.addEventListener('pointercancel', stopMovement);
  document.addEventListener('visibilitychange', resetWhenHidden);
  cleanups.push(
    () => movePad.removeEventListener('pointerdown', startMovement),
    () => movePad.removeEventListener('pointermove', moveMovement),
    () => movePad.removeEventListener('pointerup', stopMovement),
    () => movePad.removeEventListener('pointercancel', stopMovement),
    () => movePad.removeEventListener('lostpointercapture', stopLostMovement),
    () => jumpButton.removeEventListener('pointerdown', pressJump),
    () => window.removeEventListener('pointerup', stopMovement),
    () => window.removeEventListener('pointercancel', stopMovement),
    () => document.removeEventListener('visibilitychange', resetWhenHidden),
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
  private playerFlippers!: Array<Phaser.GameObjects.Ellipse | Phaser.GameObjects.Rectangle>;
  private playerInnerFlippers: Phaser.GameObjects.Ellipse[] = [];
  private playerFeet!: Phaser.GameObjects.Ellipse[];
  private checkpointBanners: Phaser.GameObjects.Container[] = [];
  private goalBanner!: Phaser.GameObjects.Container;
  private goalFlag!: Phaser.GameObjects.Container;
  private powerBlocks: Phaser.GameObjects.Container[] = [];
  private powerSnacks: Phaser.GameObjects.Container[] = [];
  private breakableBlocks: Phaser.GameObjects.Container[] = [];
  private bossSprite: Phaser.GameObjects.Container | null = null;
  private bossHealthLabel: Phaser.GameObjects.Text | null = null;
  private bossTelegraphLabel: Phaser.GameObjects.Text | null = null;
  private collectibles: Collectible[] = [];
  private enemies: Enemy[] = [];
  private movingPlatforms: MovingPlatformSprite[] = [];
  private bouncePads: Phaser.GameObjects.Container[] = [];
  private cloudClusters: Phaser.GameObjects.Container[] = [];
  private backdropLandmark: Phaser.GameObjects.Container | null = null;
  private backdropLandmarkWidth = 0;
  private readonly simulation: TangramPlatformerState;
  private readonly simulationEvents: TangramPlatformerEvent[] = [];
  private effects: TangramSound | null = null;
  private previousBadges = 0;
  private previousGrounded = false;
  private previousPowered = false;
  private previousBossHits: number | null = null;
  private respawnTransition = false;
  private readonly reducedMotion: boolean;
  private readonly muted: boolean;
  private readonly language: TangramLanguage;
  accumulator = 0;
  private lastJumpDown = false;
  private paused = false;

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
    this.applyCameraZoom();
    this.createBackdrop();
    this.createPlatforms();
    this.createDecor();
    this.createCollectibles();
    this.createHazards();
    this.createEnemies();
    this.createBoss();
    this.createCheckpoints();
    this.createGoal();
    this.createBouncePads();
    this.createPowerSnack();
    this.player = this.createPlayer();
    this.playerAura = this.add.ellipse(0, 0, 88, 92, 0xffef8e, 0.24).setVisible(false);
    this.playerAura.setDepth(4);
    this.cameras.main.startFollow(this.player, true, 0.12, 0, 0, 30);
    this.syncBackdropLayout();
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
    });
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
    this.syncBackdropLayout();
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
    this.simulation.badgesCollected = tangramBadgeTotal(this.level);
    this.simulation.checkpointActivated = true;
    const checkpoint = this.level.checkpoints[this.level.checkpoints.length - 1];
    this.simulation.respawnPoint = getTangramCheckpointRespawn(this.level, checkpoint) ?? this.simulation.respawnPoint;
    this.simulation.player.x = this.level.goal.x;
    this.simulation.player.y = this.level.goal.y;
    if (this.simulation.boss) {
      this.simulation.boss.active = false;
      this.simulation.boss.hitsRemaining = 0;
    }
    for (let tick = 0; tick < 240 && !this.simulation.finished; tick += 1) {
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

  private applyCameraZoom(): void {
    const widthZoom = this.scale.width / VIEWPORT_WIDTH;
    const heightZoom = this.scale.height / VIEWPORT_HEIGHT;
    this.cameras.main.setZoom(Math.max(1, widthZoom, heightZoom));
  }

  private createBackdrop(): void {
    this.add.rectangle(this.level.worldWidth / 2, this.level.worldHeight / 2, this.level.worldWidth, this.level.worldHeight, Phaser.Display.Color.HexStringToColor(this.level.skyColor).color)
      .setScrollFactor(0, 0)
      .setAlpha(0.82);
    for (let index = 0; index < CLOUD_POSITIONS.length; index += 1) {
      const cloud = this.add.container().setScrollFactor(0).setDepth(1);
      cloud.add([
        this.add.ellipse(0, 4, 96, 34, 0x5ca8c7, 0.45),
        this.add.ellipse(0, 0, 90, 32, 0xffffff, 0.85),
        this.add.ellipse(30, 5, 62, 24, 0xffffff, 0.85),
        this.add.ellipse(-32, 6, 54, 22, 0xffffff, 0.85),
      ]);
      this.cloudClusters.push(cloud);
    }
    this.createLandmark();
  }

  private onResize(): void {
    this.applyCameraZoom();
    this.syncBackdropLayout();
  }

  private syncBackdropLayout(): void {
    const camera = this.cameras.main;
    const objectX = (screenX: number): number => screenX / camera.zoom - camera.scrollX;
    const objectY = (screenY: number): number => screenY / camera.zoom - camera.scrollY;
    const counterScale = BACKDROP_DISPLAY_SCALE / camera.zoom;
    this.cloudClusters.forEach((cloud, index) => {
      const [x, y] = CLOUD_POSITIONS[index];
      cloud
        .setPosition(objectX(this.scale.width * x), objectY(this.scale.height * y))
        .setScale(counterScale);
    });
    if (!this.backdropLandmark) return;
    const displayWidth = Math.min(this.scale.width * 0.86, this.backdropLandmarkWidth * BACKDROP_DISPLAY_SCALE);
    this.backdropLandmark
      .setPosition(objectX(this.scale.width * 0.5), objectY(this.scale.height * 0.39))
      .setScale(displayWidth / this.backdropLandmarkWidth * counterScale);
  }

  private createLandmark(): void {
    switch (this.level.landmark) {
      case 'school': {
        const school = this.add.container(340, 294);
        school.setScrollFactor(0.3, 0.34);
        school.setAlpha(0.76);
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
        this.backdropLandmark = school.setScrollFactor(0);
        this.backdropLandmarkWidth = 380;
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
        this.backdropLandmark = playground.setScrollFactor(0);
        this.backdropLandmarkWidth = 320;
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
        this.backdropLandmark = classroom.setScrollFactor(0);
        this.backdropLandmarkWidth = 360;
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
        this.backdropLandmark = library.setScrollFactor(0);
        this.backdropLandmarkWidth = 360;
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
        this.backdropLandmark = stadium.setScrollFactor(0);
        this.backdropLandmarkWidth = 420;
        break;
      }
    }
  }

  private createPlatforms(): void {
    const outlineWidth = 6;
    const outlineColor = 0x103047;
    for (const platform of this.level.platforms) {
      const isGround = platform.y + platform.height >= this.level.worldHeight;
      const platformBody = this.add.rectangle(
        platform.x + platform.width / 2,
        platform.y + platform.height / 2,
        platform.width,
        platform.height,
        platform.color,
      ).setDepth(2);
      platformBody.setStrokeStyle(outlineWidth, outlineColor, 1);
      if (isGround) continue;
      this.add.rectangle(platform.x + platform.width / 2, platform.y + 6, platform.width, 12, platform.trim)
        .setDepth(3)
        .setStrokeStyle(3, outlineColor, 1);
    }
    this.breakableBlocks = (this.level.breakableBlocks ?? []).map((block) => {
      const container = this.add.container(
        block.x + block.width / 2,
        block.y + block.height / 2,
      );
      container.setDepth(3);
      container.add([
        this.add.rectangle(0, 0, block.width, block.height, block.color).setStrokeStyle(outlineWidth, outlineColor, 1),
        this.add.rectangle(0, -block.height / 2 + 5, block.width, 8, block.trim),
        this.add.circle(0, 4, 15, 0xf7fbff).setStrokeStyle(2, 0x103047, 1),
        this.add.triangle(-6, 0, -13, -8, 1, -8, -6, 5, 0xff8f66),
        this.add.triangle(6, 0, 1, -8, 13, -8, 6, 5, 0x59d0ff),
        this.add.triangle(0, 9, -6, 4, 6, 4, 0, 15, 0x71d2b6),
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
          child.setStrokeStyle(5, outlineColor, 1);
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

  private createCheckpoints(): void {
    this.checkpointBanners = this.level.checkpoints.map((checkpoint) => {
      const banner = this.add.container(checkpoint.x + 20, checkpoint.y + 60);
      banner.setDepth(4);
      banner.add([
        this.add.rectangle(0, 24, 10, 120, 0x8d5b34),
        this.add.rectangle(34, -16, 66, 34, 0xffd166),
        this.add.circle(34, -16, 8, 0x59d0ff),
      ]);
      return banner;
    });
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
      this.add.rectangle(34, 14, 30, 24, 0xf7fbff).setStrokeStyle(2, 0x103047, 1),
      this.add.triangle(27, 8, 18, 2, 34, 2, 27, 16, 0xff8f66),
      this.add.triangle(41, 8, 34, 2, 50, 2, 41, 16, 0x59d0ff),
      this.add.rectangle(34, 14, 8, 8, 0xffd166).setStrokeStyle(1, 0x103047, 1),
      this.add.triangle(27, 20, 19, 15, 27, 15, 27, 25, 0x71d2b6),
      this.add.triangle(41, 20, 41, 15, 49, 15, 41, 25, 0x8d5b34),
    ]);
    this.goalBanner.add(this.goalFlag);
  }

  private createBouncePads(): void {
    this.bouncePads = (this.level.bouncePads ?? []).map((pad) => {
      const container = this.add.container(pad.x + pad.width / 2, pad.y + pad.height / 2);
      container.setDepth(4);
      container.add([
        this.add.rectangle(-pad.width * 0.3, 8, 5, 14, 0x103047),
        this.add.rectangle(pad.width * 0.3, 8, 5, 14, 0x103047),
        this.add.rectangle(0, 2, pad.width - 8, 6, 0x103047),
        this.add.ellipse(0, -5, pad.width, 13, pad.color).setStrokeStyle(3, 0x103047, 1),
        this.add.line(-pad.width * 0.28, 8, 0, 0, -8, 13, 0xfff1b8).setLineWidth(3),
        this.add.line(pad.width * 0.28, 8, 0, 0, 8, 13, 0xfff1b8).setLineWidth(3),
      ]);
      return container;
    });
  }

  private createPowerSnack(): void {
    const outlineWidth = 5;
    this.powerBlocks = this.level.powerups.map((powerup) => {
      const block = this.add.container(powerup.x + powerup.width / 2, powerup.y + 26).setDepth(4);
      block.add([
        this.add.rectangle(0, 0, 46, 46, 0xffd166).setStrokeStyle(outlineWidth, 0x103047, 1),
        this.add.rectangle(0, -16, 46, 8, 0xfff0a8),
        this.add.rectangle(0, 4, 24, 24, 0xf7fbff).setStrokeStyle(3, 0x103047, 1),
        this.add.triangle(-6, 0, -12, -6, 0, -6, -6, 6, 0xff8f66),
        this.add.triangle(6, 0, 0, -6, 12, -6, 6, 6, 0x59d0ff),
        this.add.triangle(0, 9, -6, 4, 6, 4, 0, 14, 0x71d2b6),
      ]);
      return block;
    });
    this.powerSnacks = this.level.powerups.map((powerup) => {
      const snack = this.add.container(powerup.x + powerup.width / 2, powerup.y - 18).setDepth(4);
      snack.add([
        this.add.ellipse(0, 0, 40, 28, 0x71d2b6).setStrokeStyle(4, 0x103047, 1),
        this.add.rectangle(0, 0, 25, 14, 0xffd166),
        this.add.circle(-13, 0, 5, 0xffd166),
        this.add.circle(13, 0, 5, 0xffd166),
      ]);
      return snack;
    });
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
    const shadow = this.add.ellipse(0, 22, 38, 14, 0x000000, 0.18);
    const isPenguin = this.character.id === 'penguin';
    const isCrocodile = this.character.id === 'crocodile';
    const isTurtle = this.character.id === 'turtle';
    const isKangaroo = this.character.id === 'kangaroo';
    const isLion = this.character.id === 'lion';
    const body = this.add.ellipse(
      0,
      -8,
      isCrocodile ? 48 : isTurtle ? 56 : isKangaroo ? 42 : isLion ? 46 : isPenguin ? 46 : 44,
      isCrocodile ? 58 : isTurtle ? 52 : isKangaroo ? 64 : isLion ? 62 : isPenguin ? 70 : 60,
      bodyColor,
    );
    const belly = this.add.ellipse(
      isPenguin ? 1 : 0,
      isPenguin ? -1 : -2,
      isCrocodile ? 30 : isTurtle ? 30 : isKangaroo || isLion ? 28 : isPenguin ? 32 : 27,
      isCrocodile ? 34 : isTurtle ? 28 : isKangaroo || isLion ? 34 : isPenguin ? 48 : 36,
      isCrocodile ? 0xd9f0c4
        : isTurtle ? 0x9fd8b4
          : isKangaroo ? 0xf2c6a5
            : isLion ? 0xffe0a3
              : isPenguin ? 0xf7fbff
                : 0xe6b78a,
    );
    const limbWidth = isPenguin ? 12 : isTurtle ? 11 : 10;
    const limbHeight = isPenguin ? 30 : isCrocodile ? 18 : isTurtle ? 14 : isKangaroo ? 18 : 22;
    const limbY = isCrocodile ? 0 : isTurtle ? 4 : isKangaroo ? -1 : isLion ? 9 : isPenguin ? -4 : -6;
    const limbOffset = isPenguin ? 24 : isTurtle ? 25 : isCrocodile ? 23 : isKangaroo ? 17 : isLion ? 18 : 21;
    const flipperColor = isPenguin ? 0x274a67 : bodyColor;
    const leftFlipper = this.add.ellipse(-limbOffset, limbY, limbWidth, limbHeight, flipperColor);
    const rightFlipper = this.add.ellipse(limbOffset, limbY, limbWidth, limbHeight, flipperColor);
    const innerFlippers = isPenguin
      ? [
        this.add.ellipse(-24, limbY, 5, 18, 0xf7fbff),
        this.add.ellipse(24, limbY, 5, 18, 0xf7fbff),
      ]
      : [];
    const footColor = isPenguin ? 0xffb15f : isLion ? 0xd99a43 : bodyColor;
    const footWidth = isPenguin ? 18 : isTurtle ? 16 : 15;
    const leftFoot = this.add.ellipse(-11, 22, footWidth, 8, footColor);
    const rightFoot = this.add.ellipse(11, 22, footWidth, 8, footColor);
    const eyeCenterX = isCrocodile ? 15 : isTurtle ? 27 : isKangaroo ? 6 : isLion ? 17 : isPenguin ? 8 : 0;
    const eyeY = isCrocodile ? -25 : isTurtle ? -17 : isKangaroo ? -27 : isLion ? -23 : -20;
    const eyes = isPenguin
      ? [
        this.add.ellipse(2, -20, 11, 14, 0xf7fbff).setStrokeStyle(2, 0x103047, 1),
        this.add.ellipse(14, -20, 11, 14, 0xf7fbff).setStrokeStyle(2, 0x103047, 1),
        this.add.circle(2, -19, 3, 0x103047),
        this.add.circle(14, -19, 3, 0x103047),
      ]
      : [
        this.add.circle(eyeCenterX - 5, eyeY, 4, 0xffffff),
        this.add.circle(eyeCenterX + 5, eyeY, 4, 0xffffff),
        this.add.circle(eyeCenterX - 5, eyeY, 2, 0x103047),
        this.add.circle(eyeCenterX + 5, eyeY, 2, 0x103047),
      ];
    const speciesArt: Phaser.GameObjects.GameObject[] = [];
    const speciesDetails: Phaser.GameObjects.GameObject[] = [];
    switch (this.character.id) {
      case 'crocodile': {
        const torso = this.add.graphics();
        torso.fillStyle(bodyColor, 1);
        torso.fillRoundedRect(-21, -30, 39, 53, 15);
        torso.lineStyle(4, 0x103047, 1);
        torso.strokeRoundedRect(-21, -30, 39, 53, 15);
        speciesArt.push(
          torso,
          this.add.ellipse(-29, 6, 30, 12, bodyColor).setStrokeStyle(2, 0x103047, 1),
        );
        speciesDetails.push(
          this.add.ellipse(-2, 4, 26, 29, 0xd9f0c4).setStrokeStyle(2, 0x103047, 1),
          this.add.ellipse(24, -13, 32, 18, 0x80d36d).setStrokeStyle(3, 0x103047, 1),
          this.add.circle(30, -13, 2, 0x103047),
          this.add.circle(38, -13, 2, 0x103047),
          this.add.circle(-10, -33, 4, 0x80d36d),
          this.add.circle(0, -36, 4, 0x80d36d),
        );
        break;
      }
      case 'monkey': {
        const torso = this.add.graphics();
        torso.fillStyle(bodyColor, 1);
        torso.fillRoundedRect(-17, -22, 34, 45, 14);
        torso.lineStyle(4, 0x103047, 1);
        torso.strokeRoundedRect(-17, -22, 34, 45, 14);
        speciesArt.push(
          torso,
          this.add.ellipse(-28, 8, 12, 38, bodyColor).setRotation(0.5).setStrokeStyle(2, 0x103047, 1),
          this.add.circle(-31, 24, 8, bodyColor).setStrokeStyle(2, 0x103047, 1),
          this.add.circle(-20, -25, 10, bodyColor).setStrokeStyle(2, 0x103047, 1),
          this.add.circle(20, -25, 10, bodyColor).setStrokeStyle(2, 0x103047, 1),
        );
        speciesDetails.push(
          this.add.circle(0, -24, 20, bodyColor).setStrokeStyle(3, 0x103047, 1),
          this.add.ellipse(0, 4, 24, 28, 0xe6b78a).setStrokeStyle(2, 0x103047, 1),
          this.add.ellipse(0, -9, 28, 22, 0xe6b78a).setStrokeStyle(2, 0x103047, 1),
          this.add.circle(-5, -10, 1.5, 0x103047),
          this.add.circle(5, -10, 1.5, 0x103047),
        );
        break;
      }
      case 'turtle':
        speciesArt.push(
          this.add.ellipse(-31, 5, 22, 9, bodyColor).setStrokeStyle(2, 0x103047, 1),
          this.add.ellipse(-3, -8, 64, 52, accentColor).setStrokeStyle(3, 0x355342, 1),
        );
        speciesDetails.push(
          this.add.ellipse(-3, 5, 42, 26, bodyColor).setStrokeStyle(2, 0x103047, 1),
          this.add.ellipse(-4, 5, 30, 17, 0x9fd8b4).setStrokeStyle(2, 0x355342, 1),
          this.add.ellipse(28, -10, 24, 21, bodyColor).setStrokeStyle(2, 0x103047, 1),
          this.add.circle(-14, -18, 6, 0x9fd8b4).setStrokeStyle(2, 0x355342, 1),
          this.add.circle(0, -26, 6, 0x9fd8b4).setStrokeStyle(2, 0x355342, 1),
          this.add.circle(13, -13, 6, 0x9fd8b4).setStrokeStyle(2, 0x355342, 1),
          this.add.circle(-1, 6, 6, 0x9fd8b4).setStrokeStyle(2, 0x355342, 1),
        );
        break;
      case 'kangaroo':
        speciesArt.push(
          this.add.ellipse(-30, 14, 52, 13, bodyColor).setRotation(-0.16).setStrokeStyle(2, 0x103047, 1),
          this.add.ellipse(-6, 7, 34, 35, bodyColor).setStrokeStyle(3, 0x103047, 1),
          this.add.ellipse(3, -10, 28, 34, bodyColor).setStrokeStyle(3, 0x103047, 1),
          this.add.ellipse(-2, -46, 8, 25, bodyColor).setStrokeStyle(2, 0x103047, 1),
          this.add.ellipse(13, -46, 8, 25, bodyColor).setStrokeStyle(2, 0x103047, 1),
        );
        speciesDetails.push(
          this.add.ellipse(-5, 10, 24, 22, 0xf2c6a5).setStrokeStyle(2, 0x103047, 1),
          this.add.ellipse(6, -30, 27, 23, bodyColor).setStrokeStyle(3, 0x103047, 1),
          this.add.ellipse(17, -29, 14, 9, 0xf2c6a5).setStrokeStyle(2, 0x103047, 1),
          this.add.circle(21, -29, 2, 0x103047),
        );
        break;
      case 'lion': {
        const torso = this.add.graphics();
        torso.fillStyle(bodyColor, 1);
        torso.fillRoundedRect(-28, -7, 45, 27, 12);
        torso.lineStyle(4, 0x103047, 1);
        torso.strokeRoundedRect(-28, -7, 45, 27, 12);
        speciesArt.push(
          torso,
          this.add.ellipse(-39, -1, 38, 8, bodyColor).setRotation(0.14).setStrokeStyle(2, 0x103047, 1),
          this.add.circle(-54, -4, 5, accentColor).setStrokeStyle(2, 0x8d5b34, 1),
          this.add.ellipse(19, -25, 50, 51, accentColor).setStrokeStyle(3, 0x8d5b34, 1),
          this.add.circle(7, -40, 7, accentColor).setStrokeStyle(2, 0x8d5b34, 1),
          this.add.circle(30, -40, 7, accentColor).setStrokeStyle(2, 0x8d5b34, 1),
        );
        speciesDetails.push(
          this.add.ellipse(-5, 5, 23, 15, 0xffe0a3).setStrokeStyle(2, 0x8d5b34, 1),
          this.add.circle(19, -25, 18, 0xffc45b).setStrokeStyle(3, 0x8d5b34, 1),
          this.add.ellipse(23, -16, 22, 13, 0xffe0a3).setStrokeStyle(2, 0x8d5b34, 1),
          this.add.circle(24, -19, 3, 0x805a2a),
        );
        break;
      }
    }
    const penguinFace: Phaser.GameObjects.GameObject[] = isPenguin
      ? [this.add.ellipse(5, -18, 32, 27, 0xf7fbff)]
      : [];
    const penguinDetails: Phaser.GameObjects.GameObject[] = isPenguin
      ? [
        this.add.ellipse(-8, -34, 16, 6, 0x5f8ee0, 0.45),
        this.add.ellipse(23, -10, 16, 10, 0xffb15f).setStrokeStyle(2, 0x103047, 1),
        this.add.ellipse(24, -6, 10, 4, 0xe37b3f),
        this.add.circle(1, -22, 1.3, 0xf7fbff),
        this.add.circle(13, -22, 1.3, 0xf7fbff),
        this.add.ellipse(-18, 1, 5, 17, 0x5f8ee0, 0.45),
        this.add.ellipse(18, 1, 5, 17, 0x5f8ee0, 0.45),
        this.add.ellipse(-8, 14, 8, 3, 0xd9e3ea),
        this.add.ellipse(8, 14, 8, 3, 0xd9e3ea),
      ]
      : [];
    if (!isPenguin) {
      body.setVisible(false);
      belly.setVisible(false);
    }
    body.setStrokeStyle(5, 0x103047, 1);
    belly.setStrokeStyle(3, 0x103047, 1);
    leftFlipper.setStrokeStyle(3, 0x103047, 1);
    rightFlipper.setStrokeStyle(3, 0x103047, 1);
    leftFoot.setStrokeStyle(2, 0x103047, 1);
    rightFoot.setStrokeStyle(2, 0x103047, 1);
    container.add([
      shadow,
      ...speciesArt,
      body,
      belly,
      ...penguinFace,
      leftFlipper,
      rightFlipper,
      ...innerFlippers,
      ...speciesDetails,
      ...eyes,
      ...penguinDetails,
      leftFoot,
      rightFoot,
    ]);
    this.playerShadow = shadow;
    this.playerBody = body;
    this.playerBelly = belly;
    this.playerFlippers = [leftFlipper, rightFlipper];
    this.playerInnerFlippers = innerFlippers;
    this.playerFeet = [leftFoot, rightFoot];
    return container;
  }

  private createBadge(x: number, y: number, baseColor: number): Phaser.GameObjects.Container {
    const badge = this.add.container(x, y);
    badge.setDepth(4);
    badge.add([
      this.add.circle(0, 0, 13, baseColor).setStrokeStyle(3, 0x103047, 1),
      this.add.circle(0, 0, 9, 0xfff1b8).setStrokeStyle(2, 0x103047, 1),
      this.add.text(0, 0, '★', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#8d5b34', fontStyle: 'bold' }).setOrigin(0.5),
    ]);
    return badge;
  }

  private emitBadges(x: number, y: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const badge = this.createBadge(x, y, 0xffd166).setDepth(8).setScale(0.55);
      this.tweens.add({
        targets: badge,
        x: x + (index - (count - 1) / 2) * 28,
        y: y - 56 - index * 16,
        alpha: 0,
        scaleX: 0.9,
        scaleY: 0.9,
        duration: 650,
        delay: index * 75,
        ease: 'Cubic.easeOut',
        onComplete: () => badge.destroy(),
      });
    }
  }

  private createPuddle(hazard: Rect): Phaser.GameObjects.Container {
    const puddle = this.add.container(hazard.x + hazard.width / 2, hazard.y + hazard.height / 2);
    puddle.setDepth(3.5);
    puddle.add([
      this.add.ellipse(0, 0, hazard.width, hazard.height - 8, 0x5cc8ff).setStrokeStyle(4, 0x103047, 1),
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
    const playerScale = (powered ? 1.18 : 1) * ACTOR_DISPLAY_SCALE;
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
      sprite.scaleX = enemyState.direction * ACTOR_DISPLAY_SCALE;
      sprite.scaleY = ACTOR_DISPLAY_SCALE;
    }
    if (this.bossSprite && this.simulation.boss && this.level.boss) {
      const bossState = this.simulation.boss;
      this.bossSprite.setVisible(bossState.active);
      this.bossSprite.x = bossState.x + this.level.boss.width / 2;
      this.bossSprite.y = this.level.boss.y + this.level.boss.height / 2;
      this.bossSprite.scaleX = bossState.direction * ACTOR_DISPLAY_SCALE;
      this.bossSprite.scaleY = ACTOR_DISPLAY_SCALE;
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
        sprite.setScale(pulse * ACTOR_DISPLAY_SCALE);
        sprite.rotation = this.reducedMotion ? 0 : Math.sin(this.time.now * 0.002 + index) * 0.08;
      }
    }
    for (let index = 0; index < this.powerBlocks.length; index += 1) {
      const powerup = this.level.powerups[index];
      const snack = this.powerSnacks[index];
      this.powerBlocks[index].setVisible(!this.simulation.powerBlockHit[index]);
      snack.setVisible(this.simulation.powerBlockHit[index] && this.simulation.powerSnackAvailable[index]);
      snack.y = powerup.y - 18 + (this.reducedMotion ? 0 : Math.sin(this.time.now * 0.004 + index) * 5);
      snack.rotation = this.reducedMotion ? 0 : Math.sin(this.time.now * 0.002 + index) * 0.12;
      snack.setScale(
        (this.reducedMotion ? 1 : 1 + Math.sin(this.time.now * 0.006 + index) * 0.06) * ACTOR_DISPLAY_SCALE,
      );
    }
    for (let index = 0; index < this.breakableBlocks.length; index += 1) {
      this.breakableBlocks[index].setVisible(!this.simulation.breakableBlocksBroken[index]);
    }
    for (let index = 0; index < this.checkpointBanners.length; index += 1) {
      const checkpoint = this.level.checkpoints[index];
      const banner = this.checkpointBanners[index];
      banner.y = checkpoint.y + 60 + (this.reducedMotion ? 0 : Math.sin(this.time.now * 0.003 + index) * 2);
      if (this.simulation.checkpointIndex >= index) {
        banner.list.forEach((child) => {
          if ('setTint' in child && typeof child.setTint === 'function') child.setTint(0x7dfc8a);
        });
      }
    }
    this.goalFlag.y = this.simulation.goalPhase === 'none'
      ? this.level.goal.y + 28
      : this.simulation.goalFlagY + 28;
    this.playerAura.setVisible(powered && !this.respawnTransition);
    this.playerAura.x = this.player.x;
    this.playerAura.y = this.player.y - 10;
    this.playerAura.setScale(ACTOR_DISPLAY_SCALE);
  }

  private animatePlayer(): void {
      const playerState = this.simulation.player;
      const speed = Math.abs(playerState.velocityX);
      const walking = playerState.grounded && speed > 12;
      const phase = this.reducedMotion ? 0 : this.time.now * (walking ? 0.012 : 0.008);
      const isPenguin = this.character.id === 'penguin';
      const step = walking ? Math.sin(this.time.now * 0.012) : 0;
      const stride = step * (isPenguin ? 11 : 8);
      const leftFootLift = Math.max(0, step) * (isPenguin ? 12 : 8);
      const rightFootLift = Math.max(0, -step) * (isPenguin ? 12 : 8);
      const bob = playerState.grounded
        ? walking
          ? Math.abs(Math.sin(phase)) * 1.4
          : Math.sin(phase) * 0.8
        : 0;
      const airborne = !playerState.grounded;
      const tuck = airborne ? Math.min(1, Math.abs(playerState.velocityY) / 900) : 0;
      const powered = isTangramPoweredUp(this.simulation);
      const limbRestY = this.character.id === 'crocodile'
        ? 0
        : this.character.id === 'turtle'
          ? 4
          : this.character.id === 'kangaroo'
            ? -1
            : this.character.id === 'lion'
              ? 9
              : -8;

      this.playerShadow.setScale(walking ? 1.08 : 1, walking ? 0.9 : 1);
      this.playerShadow.setAlpha(airborne ? 0.1 : 0.18);
      this.playerBody.y = -8 + bob;
      this.playerBody.scaleY = 1 + (powered ? 0.04 : 0);
      this.playerBelly.y = -2 + bob;
      this.playerFlippers[0].y = limbRestY + bob - tuck * 3;
      this.playerFlippers[1].y = limbRestY + bob - tuck * 3;
      this.playerFlippers[0].rotation = -0.18 - Math.sin(phase) * (walking ? 0.22 : 0.04);
      this.playerFlippers[1].rotation = 0.18 + Math.sin(phase) * (walking ? 0.22 : 0.04);
      this.playerInnerFlippers.forEach((flipper, index) => {
        flipper.y = limbRestY + bob - tuck * 3;
        flipper.rotation = this.playerFlippers[index].rotation;
      });
      const footSpacing = isPenguin ? 11 : this.character.id === 'lion' ? 17 : 10;
      this.playerFeet[0].x = -footSpacing + stride;
      this.playerFeet[1].x = footSpacing - stride;
      this.playerFeet[0].y = 22 + bob - tuck * 5 - leftFootLift;
      this.playerFeet[1].y = 22 + bob - tuck * 5 - rightFootLift;
  }

  private applySimulationEvents(): void {
    let shouldUpdateHud = false;
    for (const event of this.simulationEvents) {
      if (event.type === 'hud') shouldUpdateHud = true;
      if (event.type === 'respawn') this.transitionToRespawn();
      if (event.type === 'shake' && !this.reducedMotion) this.cameras.main.shake(180, 0.004);
      if (event.type === 'badge') this.emitBadges(event.x, event.y, event.count);
      if (event.type === 'complete') {
        this.effects?.fanfare();
        this.completeLevel();
      }
    }
    this.simulationEvents.length = 0;
    if (shouldUpdateHud && !this.simulation.finished) this.updateHud();
  }

  private transitionToRespawn(): void {
    if (this.reducedMotion) return;
    const camera = this.cameras.main;
    this.respawnTransition = true;
    this.player.setVisible(false);
    this.playerAura.setVisible(false);
    camera.stopFollow();
    camera.pan(this.player.x, camera.centerY, 420, 'Sine.easeInOut', true, () => {
      this.respawnTransition = false;
      this.player.setVisible(true);
      camera.startFollow(this.player, true, 0.12, 0, 0, 30);
    });
  }

  private completeLevel(): void {
    const nextLevelId = nextTangramLevelId(this.level.id);
    this.callbacks.onComplete({
      characterName: this.character.name,
      levelTitle: this.level.title,
      badgesCollected: this.simulation.badgesCollected,
      totalBadges: tangramBadgeTotal(this.level),
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
      totalBadges: tangramBadgeTotal(this.level),
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
  settings: { muted: boolean; reducedMotion: boolean },
  actions: {
    onResume: () => void;
    onMap: () => void;
    onRestart: () => void;
    onExit: () => void;
    onMuted: (muted: boolean) => void;
    onReducedMotion: (reduced: boolean) => void;
    onLanguage: (language: TangramLanguage) => void;
    onReset: () => void;
  },
): {
  overlay: HTMLDivElement;
  show: () => void;
  hide: () => void;
  setLanguage: (language: TangramLanguage) => void;
  setMuted: (muted: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
} {
  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay tangram-platformer-overlay--pause';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="tangram-platformer-panel">
      <p class="tangram-platformer-kicker" data-label="kicker">Tangram pause</p>
      <h2 data-label="title">Parade paused</h2>
      <p class="tangram-platformer-copy" data-label="copy">The simulation is frozen. Take a breath, then jump back into the route.</p>
      <h3 data-label="how-to-play">How to play</h3>
      <div class="tangram-platformer-help-list">
        <p><strong data-label="keyboard">Keyboard</strong><br><span data-label="keyboard-copy">Arrow keys or A/D move. Space, W, or Up jumps.</span></p>
        <p><strong data-label="touch">Touch</strong><br><span data-label="touch-copy">Tap ahead or behind the player to move. Tap the big circle to jump.</span></p>
      </div>
      <div class="tangram-platformer-action-row">
        <button class="tangram-platformer-button" type="button" data-action="resume">Resume run</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="restart">Restart level</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="map">Choose class</button>
      </div>
      <div class="tangram-platformer-action-row tangram-platformer-action-row--settings">
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-setting-action="sound"></button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-setting-action="language"></button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-setting-action="motion"></button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-setting-action="reset"></button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="arcade">Back to arcade hall</button>
      </div>
      <div class="tangram-platformer-reset-confirmation" data-reset-confirmation hidden>
        <p data-label="reset-copy">Reset the game and start again?</p>
        <div class="tangram-platformer-action-row">
          <button class="tangram-platformer-button" type="button" data-setting-action="confirm-reset">Yes, reset game</button>
          <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-setting-action="cancel-reset">Keep playing</button>
        </div>
      </div>
    </section>`;
  parent.append(overlay);
  overlay.querySelector<HTMLButtonElement>('[data-action="resume"]')?.addEventListener('click', actions.onResume);
  overlay.querySelector<HTMLButtonElement>('[data-action="restart"]')?.addEventListener('click', actions.onRestart);
  overlay.querySelector<HTMLButtonElement>('[data-action="map"]')?.addEventListener('click', actions.onMap);
  overlay.querySelector<HTMLButtonElement>('[data-action="arcade"]')?.addEventListener('click', actions.onExit);
  const soundButton = overlay.querySelector<HTMLButtonElement>('[data-setting-action="sound"]');
  const motionButton = overlay.querySelector<HTMLButtonElement>('[data-setting-action="motion"]');
  const languageButton = overlay.querySelector<HTMLButtonElement>('[data-setting-action="language"]');
  const resetConfirmation = overlay.querySelector<HTMLElement>('[data-reset-confirmation]');
  let currentLanguage = language;
  const setMuted = (muted: boolean): void => {
    if (!soundButton) return;
    soundButton.textContent = tangramText(currentLanguage, muted ? 'Sound: Off' : 'Sound: On');
    soundButton.setAttribute('aria-pressed', String(muted));
    soundButton.setAttribute('aria-label', tangramText(currentLanguage, muted ? 'Turn sound on' : 'Mute sound'));
  };
  const setReducedMotion = (reduced: boolean): void => {
    if (!motionButton) return;
    motionButton.textContent = tangramText(currentLanguage, reduced ? 'Motion: Reduced' : 'Motion: Normal');
    motionButton.setAttribute('aria-pressed', String(reduced));
  };
  soundButton?.addEventListener('click', () => {
    const muted = soundButton.getAttribute('aria-pressed') !== 'true';
    setMuted(muted);
    actions.onMuted(muted);
  });
  motionButton?.addEventListener('click', () => {
    const reduced = motionButton.getAttribute('aria-pressed') !== 'true';
    setReducedMotion(reduced);
    actions.onReducedMotion(reduced);
  });
  languageButton?.addEventListener('click', () => {
    actions.onLanguage(currentLanguage === 'nl' ? 'en' : 'nl');
  });
  overlay.querySelector<HTMLButtonElement>('[data-setting-action="reset"]')?.addEventListener('click', () => {
    if (!resetConfirmation) return;
    resetConfirmation.hidden = false;
    overlay.querySelector<HTMLButtonElement>('[data-setting-action="confirm-reset"]')?.focus();
  });
  overlay.querySelector<HTMLButtonElement>('[data-setting-action="cancel-reset"]')?.addEventListener('click', () => {
    if (resetConfirmation) resetConfirmation.hidden = true;
  });
  overlay.querySelector<HTMLButtonElement>('[data-setting-action="confirm-reset"]')?.addEventListener('click', () => {
    if (resetConfirmation) resetConfirmation.hidden = true;
    actions.onReset();
  });
  const setLanguage = (nextLanguage: TangramLanguage): void => {
    currentLanguage = nextLanguage;
    const labels: Record<string, string> = {
      kicker: 'Tangram pause',
      title: 'Parade paused',
      copy: 'The simulation is frozen. Take a breath, then jump back into the route.',
      'how-to-play': 'How to play',
      keyboard: 'Keyboard',
      'keyboard-copy': 'Arrow keys or A/D move. Space, W, or Up jumps.',
      touch: 'Touch',
      'touch-copy': 'Tap ahead or behind the player to move. Tap the big circle to jump.',
      'reset-copy': 'Reset the game and start again?',
    };
    for (const [key, value] of Object.entries(labels)) {
      overlay.querySelector<HTMLElement>(`[data-label="${key}"]`)!.textContent = tangramText(nextLanguage, value);
    }
    for (const action of ['resume', 'restart', 'map', 'arcade'] as const) {
      const text = action === 'resume' ? 'Resume run' : action === 'restart' ? 'Restart level' : action === 'map' ? 'Choose class' : 'Back to arcade hall';
      overlay.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.textContent = tangramText(nextLanguage, text);
    }
    if (languageButton) languageButton.textContent = `${tangramLanguageLabel(nextLanguage)} / ${nextLanguage === 'nl' ? 'English' : 'Nederlands'}`;
    overlay.querySelector<HTMLButtonElement>('[data-setting-action="reset"]')!.textContent = tangramText(nextLanguage, 'Reset game');
    overlay.querySelector<HTMLButtonElement>('[data-setting-action="confirm-reset"]')!.textContent = tangramText(nextLanguage, 'Yes, reset game');
    overlay.querySelector<HTMLButtonElement>('[data-setting-action="cancel-reset"]')!.textContent = tangramText(nextLanguage, 'Keep playing');
    setMuted(soundButton?.getAttribute('aria-pressed') === 'true');
    setReducedMotion(motionButton?.getAttribute('aria-pressed') === 'true');
  };
  setMuted(settings.muted);
  setReducedMotion(settings.reducedMotion);
  setLanguage(language);
  return {
    overlay,
    show: () => {
      if (resetConfirmation) resetConfirmation.hidden = true;
      overlay.hidden = false;
    },
    hide: () => {
      if (resetConfirmation) resetConfirmation.hidden = true;
      overlay.hidden = true;
    },
    setLanguage,
    setMuted,
    setReducedMotion,
  };
}

function characterPreviewSvg(character: TangramCharacterDefinition): string {
  const { accent, body, id } = character;
  if (id === 'kangaroo') {
    return `<svg viewBox="-60 -60 120 120" focusable="false"><ellipse cx="0" cy="22" rx="19" ry="7" fill="#000" opacity=".18"/><ellipse cx="-30" cy="14" rx="26" ry="6.5" fill="${body}" stroke="#103047" stroke-width="2" transform="rotate(-9 -30 14)"/><ellipse cx="-6" cy="7" rx="17" ry="17.5" fill="${body}" stroke="#103047" stroke-width="3"/><ellipse cx="3" cy="-10" rx="14" ry="17" fill="${body}" stroke="#103047" stroke-width="3"/><ellipse cx="-2" cy="-46" rx="4" ry="12.5" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="13" cy="-46" rx="4" ry="12.5" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="6" cy="-30" rx="13.5" ry="11.5" fill="${body}" stroke="#103047" stroke-width="3"/><ellipse cx="17" cy="-29" rx="7" ry="4.5" fill="#f2c6a5" stroke="#103047" stroke-width="2"/><circle cx="1" cy="-30" r="4" fill="#fff"/><circle cx="11" cy="-30" r="4" fill="#fff"/><circle cx="1" cy="-30" r="2" fill="#103047"/><circle cx="11" cy="-30" r="2" fill="#103047"/><ellipse cx="-17" cy="-1" rx="5" ry="9" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="17" cy="-1" rx="5" ry="9" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="-5" cy="10" rx="12" ry="11" fill="#f2c6a5" stroke="#103047" stroke-width="2"/><ellipse cx="-11" cy="22" rx="8" ry="4" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="11" cy="22" rx="8" ry="4" fill="${body}" stroke="#103047" stroke-width="2"/></svg>`;
  }
  if (id === 'lion') {
    return `<svg viewBox="-60 -60 120 120" focusable="false"><ellipse cx="0" cy="22" rx="19" ry="7" fill="#000" opacity=".18"/><ellipse cx="-39" cy="-1" rx="19" ry="4" fill="${body}" stroke="#103047" stroke-width="2" transform="rotate(8 -39 -1)"/><circle cx="-54" cy="-4" r="5" fill="${accent}" stroke="#8d5b34" stroke-width="2"/><rect x="-28" y="-7" width="45" height="27" rx="12" fill="${body}" stroke="#103047" stroke-width="3"/><ellipse cx="19" cy="-25" rx="25" ry="25.5" fill="${accent}" stroke="#8d5b34" stroke-width="3"/><circle cx="7" cy="-40" r="7" fill="${accent}" stroke="#8d5b34" stroke-width="2"/><circle cx="30" cy="-40" r="7" fill="${accent}" stroke="#8d5b34" stroke-width="2"/><circle cx="19" cy="-25" r="18" fill="#ffc45b" stroke="#8d5b34" stroke-width="3"/><ellipse cx="23" cy="-16" rx="11" ry="6.5" fill="#ffe0a3" stroke="#8d5b34" stroke-width="2"/><circle cx="24" cy="-19" r="3" fill="${body}"/><circle cx="12" cy="-23" r="4" fill="#fff"/><circle cx="22" cy="-23" r="4" fill="#fff"/><circle cx="12" cy="-23" r="2" fill="#103047"/><circle cx="22" cy="-23" r="2" fill="#103047"/><ellipse cx="-18" cy="9" rx="5" ry="11" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="18" cy="9" rx="5" ry="11" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="-17" cy="22" rx="7.5" ry="4" fill="#d99a43" stroke="#103047" stroke-width="2"/><ellipse cx="17" cy="22" rx="7.5" ry="4" fill="#d99a43" stroke="#103047" stroke-width="2"/></svg>`;
  }
  const previews: Record<TangramCharacterId, string> = {
    crocodile: `<ellipse cx="0" cy="22" rx="19" ry="7" fill="#000" opacity=".18"/><ellipse cx="-29" cy="6" rx="15" ry="6" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="0" cy="-8" rx="24" ry="29" fill="${body}" stroke="#103047" stroke-width="4"/><ellipse cx="0" cy="-2" rx="15" ry="17" fill="#d9f0c4" stroke="#103047" stroke-width="2"/><ellipse cx="24" cy="-13" rx="16" ry="9" fill="#80d36d" stroke="#103047" stroke-width="2"/><circle cx="10" cy="-25" r="4" fill="#fff"/><circle cx="20" cy="-25" r="4" fill="#fff"/><circle cx="10" cy="-25" r="2" fill="#103047"/><circle cx="20" cy="-25" r="2" fill="#103047"/><circle cx="30" cy="-13" r="2" fill="#103047"/><circle cx="38" cy="-13" r="2" fill="#103047"/><ellipse cx="-23" cy="0" rx="5" ry="9" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="23" cy="0" rx="5" ry="9" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="-11" cy="22" rx="8" ry="4" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="11" cy="22" rx="8" ry="4" fill="${body}" stroke="#103047" stroke-width="2"/><circle cx="-10" cy="-33" r="4" fill="#80d36d"/><circle cx="0" cy="-36" r="4" fill="#80d36d"/>`,
    monkey: `<ellipse cx="0" cy="22" rx="19" ry="7" fill="#000" opacity=".18"/><ellipse cx="-28" cy="8" rx="6" ry="19" fill="${body}" stroke="#103047" stroke-width="2" transform="rotate(28 -28 8)"/><circle cx="-31" cy="24" r="8" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="0" cy="-8" rx="22" ry="30" fill="${body}" stroke="#103047" stroke-width="4"/><ellipse cx="0" cy="-2" rx="14" ry="18" fill="#e6b78a" stroke="#103047" stroke-width="2"/><circle cx="-20" cy="-25" r="10" fill="${body}" stroke="#103047" stroke-width="2"/><circle cx="20" cy="-25" r="10" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="0" cy="-9" rx="14" ry="11" fill="#e6b78a" stroke="#103047" stroke-width="2"/><circle cx="-5" cy="-20" r="4" fill="#fff"/><circle cx="5" cy="-20" r="4" fill="#fff"/><circle cx="-5" cy="-20" r="2" fill="#103047"/><circle cx="5" cy="-20" r="2" fill="#103047"/><ellipse cx="-21" cy="-6" rx="5" ry="11" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="21" cy="-6" rx="5" ry="11" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="-11" cy="22" rx="8" ry="4" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="11" cy="22" rx="8" ry="4" fill="${body}" stroke="#103047" stroke-width="2"/>`,
    turtle: `<ellipse cx="0" cy="22" rx="19" ry="7" fill="#000" opacity=".18"/><ellipse cx="-31" cy="5" rx="11" ry="4.5" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="-3" cy="-8" rx="32" ry="26" fill="${accent}" stroke="#355342" stroke-width="3"/><ellipse cx="0" cy="-8" rx="28" ry="26" fill="${body}" stroke="#103047" stroke-width="3"/><ellipse cx="0" cy="-2" rx="15" ry="14" fill="#9fd8b4" stroke="#103047" stroke-width="2"/><ellipse cx="28" cy="-10" rx="12" ry="10.5" fill="${body}" stroke="#103047" stroke-width="2"/><circle cx="-14" cy="-18" r="6" fill="#9fd8b4" stroke="#355342" stroke-width="2"/><circle cx="0" cy="-26" r="6" fill="#9fd8b4" stroke="#355342" stroke-width="2"/><circle cx="13" cy="-13" r="6" fill="#9fd8b4" stroke="#355342" stroke-width="2"/><circle cx="-1" cy="6" r="6" fill="#9fd8b4" stroke="#355342" stroke-width="2"/><circle cx="22" cy="-17" r="4" fill="#fff"/><circle cx="32" cy="-17" r="4" fill="#fff"/><circle cx="22" cy="-17" r="2" fill="#103047"/><circle cx="32" cy="-17" r="2" fill="#103047"/><ellipse cx="-25" cy="4" rx="5.5" ry="7" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="25" cy="4" rx="5.5" ry="7" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="-11" cy="22" rx="8" ry="4" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="11" cy="22" rx="8" ry="4" fill="${body}" stroke="#103047" stroke-width="2"/>`,
    kangaroo: `<ellipse cx="0" cy="22" rx="19" ry="7" fill="#000" opacity=".18"/><ellipse cx="-30" cy="11" rx="25" ry="7.5" fill="${body}" stroke="#103047" stroke-width="2" transform="rotate(-10 -30 11)"/><ellipse cx="0" cy="-8" rx="21" ry="32" fill="${body}" stroke="#103047" stroke-width="4"/><ellipse cx="0" cy="-2" rx="14" ry="17" fill="#f2c6a5" stroke="#103047" stroke-width="2"/><ellipse cx="-10" cy="-42" rx="5" ry="14" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="10" cy="-42" rx="5" ry="14" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="0" cy="-24" rx="12" ry="7" fill="#f2c6a5" stroke="#103047" stroke-width="2"/><circle cx="-5" cy="-27" r="4" fill="#fff"/><circle cx="5" cy="-27" r="4" fill="#fff"/><circle cx="-5" cy="-27" r="2" fill="#103047"/><circle cx="5" cy="-27" r="2" fill="#103047"/><ellipse cx="-21" cy="-6" rx="5" ry="11" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="21" cy="-6" rx="5" ry="11" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="0" cy="8" rx="15" ry="12.5" fill="#f2c6a5" stroke="#103047" stroke-width="2"/><ellipse cx="-11" cy="22" rx="8" ry="4" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="11" cy="22" rx="8" ry="4" fill="${body}" stroke="#103047" stroke-width="2"/>`,
    lion: `<ellipse cx="0" cy="22" rx="19" ry="7" fill="#000" opacity=".18"/><ellipse cx="-29" cy="10" rx="21" ry="5" fill="${body}" stroke="#103047" stroke-width="2" transform="rotate(12 -29 10)"/><ellipse cx="0" cy="-17" rx="32" ry="33" fill="${accent}" stroke="#8d5b34" stroke-width="3"/><ellipse cx="0" cy="-8" rx="23" ry="31" fill="${body}" stroke="#103047" stroke-width="4"/><ellipse cx="0" cy="-2" rx="14" ry="17" fill="#ffe0a3" stroke="#8d5b34" stroke-width="2"/><circle cx="-18" cy="-39" r="8" fill="${accent}" stroke="#8d5b34" stroke-width="2"/><circle cx="18" cy="-39" r="8" fill="${accent}" stroke="#8d5b34" stroke-width="2"/><ellipse cx="0" cy="-7" rx="14" ry="9.5" fill="#ffe0a3" stroke="#8d5b34" stroke-width="2"/><circle cx="0" cy="-11" r="3" fill="${body}"/><circle cx="-7" cy="-23" r="4" fill="#fff"/><circle cx="7" cy="-23" r="4" fill="#fff"/><circle cx="-7" cy="-23" r="2" fill="#103047"/><circle cx="7" cy="-23" r="2" fill="#103047"/><ellipse cx="-21" cy="-6" rx="5" ry="11" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="21" cy="-6" rx="5" ry="11" fill="${body}" stroke="#103047" stroke-width="2"/><ellipse cx="-11" cy="22" rx="8" ry="4" fill="#d99a43" stroke="#103047" stroke-width="2"/><ellipse cx="11" cy="22" rx="8" ry="4" fill="#d99a43" stroke="#103047" stroke-width="2"/>`,
    penguin: `<ellipse cx="0" cy="22" rx="19" ry="7" fill="#000" opacity=".18"/><ellipse cx="0" cy="-8" rx="23" ry="35" fill="${body}" stroke="#103047" stroke-width="4"/><ellipse cx="1" cy="-1" rx="16" ry="24" fill="#f7fbff" stroke="#103047" stroke-width="2"/><ellipse cx="5" cy="-18" rx="16" ry="13.5" fill="#f7fbff"/><ellipse cx="-24" cy="-4" rx="6" ry="15" fill="#274a67" stroke="#103047" stroke-width="2"/><ellipse cx="24" cy="-4" rx="6" ry="15" fill="#274a67" stroke="#103047" stroke-width="2"/><ellipse cx="-24" cy="-4" rx="2.5" ry="9" fill="#f7fbff"/><ellipse cx="24" cy="-4" rx="2.5" ry="9" fill="#f7fbff"/><ellipse cx="2" cy="-20" rx="5.5" ry="7" fill="#f7fbff" stroke="#103047" stroke-width="2"/><ellipse cx="14" cy="-20" rx="5.5" ry="7" fill="#f7fbff" stroke="#103047" stroke-width="2"/><circle cx="2" cy="-19" r="3" fill="#103047"/><circle cx="14" cy="-19" r="3" fill="#103047"/><ellipse cx="23" cy="-10" rx="8" ry="5" fill="#ffb15f" stroke="#103047" stroke-width="2"/><ellipse cx="24" cy="-6" rx="5" ry="2" fill="#e37b3f"/><ellipse cx="-11" cy="22" rx="9" ry="4" fill="#ffb15f" stroke="#103047" stroke-width="2"/><ellipse cx="11" cy="22" rx="9" ry="4" fill="#ffb15f" stroke="#103047" stroke-width="2"/>`,
  };
  return `<svg viewBox="-60 -60 120 120" focusable="false">${previews[id]}</svg>`;
}

function createCharacterSelect(
  parent: HTMLElement,
  language: TangramLanguage,
  selectedCharacterId: TangramCharacterId,
  onSelect: (id: TangramCharacterId) => void,
  onLanguage: (language: TangramLanguage) => void,
): { overlay: HTMLDivElement; updateSelection: (id: TangramCharacterId) => void; setLanguage: (language: TangramLanguage) => void } {
  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay';
  const title = document.createElement('section');
  title.className = 'tangram-platformer-panel';
  const header = document.createElement('div');
  header.className = 'tangram-platformer-selection-header';
  const heading = document.createElement('h2');
  const languageButton = document.createElement('button');
  languageButton.className = 'tangram-platformer-button tangram-platformer-button--ghost';
  languageButton.type = 'button';
  header.append(heading, languageButton);
  const roster = document.createElement('div');
  roster.className = 'tangram-platformer-character-grid';
  let currentLanguage = language;
  let currentCharacterId = selectedCharacterId;
  const buttons = PLAYABLE_CHARACTERS.map((character) => {
    const button = document.createElement('button');
    button.className = 'tangram-platformer-character';
    button.type = 'button';
    button.dataset.characterId = character.id;
    button.innerHTML = `<span class="tangram-platformer-character-art" aria-hidden="true">${characterPreviewSvg(character)}</span><strong></strong>`;
    button.classList.add(`tangram-platformer-character--${character.id}`);
    button.style.setProperty('--accent', character.accent);
    button.addEventListener('click', () => onSelect(character.id));
    roster.append(button);
    return button;
  });
  languageButton.addEventListener('click', () => onLanguage(currentLanguage === 'nl' ? 'en' : 'nl'));
  title.append(header, roster);
  overlay.append(title);
  parent.append(overlay);
  const updateSelection = (id: TangramCharacterId): void => {
    currentCharacterId = id;
    for (const button of buttons) {
      const selected = button.dataset.characterId === id;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  };
  const setLanguage = (nextLanguage: TangramLanguage): void => {
    currentLanguage = nextLanguage;
    heading.textContent = tangramText(nextLanguage, 'Penguins of Tangram');
    languageButton.textContent = `${tangramLanguageLabel(nextLanguage)} / ${nextLanguage === 'nl' ? 'English' : 'Nederlands'}`;
    for (const button of buttons) {
      const character = getTangramCharacter(button.dataset.characterId as TangramCharacterId);
      button.querySelector('strong')!.textContent = tangramText(nextLanguage, character.className);
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
    onResume: () => void;
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
        <button class="tangram-platformer-button" type="button" data-action="resume">Resume</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="map">Choose class</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="replay">Replay level</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="choose">Choose another class</button>
      </div>
    </section>`;
  parent.append(overlay);
  overlay.querySelector<HTMLButtonElement>('[data-action="resume"]')?.addEventListener('click', actions.onResume);
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
  const resumeButton = overlay.querySelector('[data-action="resume"]') as HTMLButtonElement;
  let currentLanguage = language;
  const setLanguage = (nextLanguage: TangramLanguage): void => {
    currentLanguage = nextLanguage;
    for (const [key, value] of Object.entries({ badges: 'Badges', time: 'Time', checkpoint: 'Checkpoint', falls: 'Falls' })) {
      overlay.querySelector<HTMLElement>(`[data-label="${key}"]`)!.textContent = tangramText(nextLanguage, value);
    }
    for (const action of ['resume', 'map', 'replay', 'choose'] as const) {
      const text = action === 'resume' ? 'Resume' : action === 'map' ? 'Choose class' : action === 'replay' ? 'Replay level' : 'Choose another class';
      overlay.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.textContent = tangramText(nextLanguage, text);
    }
  };
  setLanguage(language);
  return {
    overlay,
    show(summary, personalBest?: TangramLevelBest) {
      const nextLevel = summary.nextLevelId ? getTangramLevel(summary.nextLevelId) : null;
      kicker.textContent = tangramText(currentLanguage, summary.campaignComplete ? 'Game complete' : 'Level complete');
      title.textContent = summary.campaignComplete
        ? tangramText(currentLanguage, 'School festival complete!')
        : `${tangramText(currentLanguage, summary.levelTitle)} ${currentLanguage === 'nl' ? 'afgerond!' : 'cleared!'}`;
      summaryText.textContent = summary.campaignComplete
        ? `${tangramText(currentLanguage, summary.characterName)} ${currentLanguage === 'nl' ? 'bracht elke klassenparade naar de laatste bel en maakte de hele Tangram-schooldag af.' : 'carried every class parade to the final bell and wrapped the full Tangram school day.'}`
        : `${tangramText(currentLanguage, summary.characterName)} ${currentLanguage === 'nl' ? 'maakte' : 'cleared'} ${tangramText(currentLanguage, summary.levelTitle)} ${currentLanguage === 'nl' ? 'af en opende' : 'and unlocked'} ${tangramText(currentLanguage, nextLevel?.title ?? 'Next level')}.`;
      badges.textContent = `${summary.badgesCollected}/${summary.totalBadges}`;
      time.textContent = `${summary.durationSeconds}s`;
      checkpoint.textContent = tangramText(currentLanguage, summary.checkpointLabel);
      falls.textContent = String(summary.falls);
      best.textContent = formatBest(currentLanguage, personalBest);
      resumeButton.hidden = summary.nextLevelId === null;
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
    totalBadges: tangramBadgeTotal(getTangramLevel(selectedLevelId)),
    checkpointLabel: getTangramLevel(selectedLevelId).start.label,
    poweredUp: false,
    jumpAudit: buildJumpAudit(getTangramLevel(selectedLevelId), getTangramCharacter(selectedCharacterId)),
  };
  let currentState: HookStateName = 'select';
  let pendingSummary: LevelSummary | null = null;
  let isPaused = false;
  let audioMuted = progress.audioMuted;
  let reducedMotion = progress.reducedMotion || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  let lastSingleTouchEnd = -Infinity;
  let multiTouchGesture = false;
  const isTouchControlGesture = (event: TouchEvent): boolean => event.composedPath().some(
    (target) => target instanceof HTMLElement
      && target.classList.contains('tangram-platformer-touch-controls'),
  );
  const trackTouchStart = (event: TouchEvent): void => {
    multiTouchGesture ||= event.touches.length > 1;
  };
  const preventDoubleTapZoom = (event: TouchEvent): void => {
    if (isTouchControlGesture(event)) {
      event.preventDefault();
      multiTouchGesture = false;
      lastSingleTouchEnd = -Infinity;
      return;
    }
    if (event.touches.length > 0) return;
    if (multiTouchGesture) {
      multiTouchGesture = false;
      lastSingleTouchEnd = -Infinity;
      return;
    }
    const now = event.timeStamp;
    if (now - lastSingleTouchEnd < 300) event.preventDefault();
    lastSingleTouchEnd = now;
  };
  parent.addEventListener('touchstart', trackTouchStart, { passive: true });
  parent.addEventListener('touchend', preventDoubleTapZoom, { passive: false });

  const pauseButton = createPauseButton(parent, language, () => togglePause());
  const pauseOverlay = createPauseOverlay(
    parent,
    language,
    { muted: audioMuted, reducedMotion },
    {
      onResume: () => togglePause(false),
      onRestart: () => startLevel(selectedLevelId),
      onMap: () => showCharacterSelect(),
      onExit,
      onMuted(muted) {
        audioMuted = muted;
        progress = { ...progress, audioMuted };
        saveTangramProgress(progress);
        activeScene?.setMuted(muted);
        emitHook();
      },
      onReducedMotion(reduced) {
        reducedMotion = reduced;
        progress = { ...progress, reducedMotion };
        saveTangramProgress(progress);
        emitHook();
      },
      onLanguage: applyLanguage,
      onReset() {
        progress = resetTangramProgress();
        language = progress.language;
        selectedCharacterId = progress.selectedCharacterId;
        selectedLevelId = FIRST_LEVEL_ID;
        completedLevelIds.splice(0, completedLevelIds.length);
        unlockedLevelIds.splice(0, unlockedLevelIds.length, ...getUnlockedTangramLevelIds([]));
        audioMuted = progress.audioMuted;
        reducedMotion = progress.reducedMotion;
        touchControls.setLanguage(language);
        score.setLanguage(language);
        pauseButton.setLanguage(language);
        pauseOverlay.setLanguage(language);
        pauseOverlay.setMuted(audioMuted);
        pauseOverlay.setReducedMotion(reducedMotion);
        select.setLanguage(language);
        completion.setLanguage(language);
        select.updateSelection(selectedCharacterId);
        showCharacterSelect();
      },
    },
  );

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
    onResume: () => {
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
      startLevel(selectedLevelId);
    },
    applyLanguage,
  );

  function applyLanguage(nextLanguage: TangramLanguage): void {
    const wasPaused = isPaused;
    language = nextLanguage;
    progress = { ...progress, language };
    saveTangramProgress(progress);
    touchControls.setLanguage(language);
    score.setLanguage(language);
    pauseButton.setLanguage(language);
    pauseOverlay.setLanguage(language);
    select.setLanguage(language);
    completion.setLanguage(language);
    if (currentState === 'running') {
      startLevel(selectedLevelId);
      if (wasPaused) togglePause(true);
    } else if (currentState === 'select') {
      showCharacterSelect();
    }
    emitHook();
  }

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
      totalBadges: tangramBadgeTotal(getTangramLevel(selectedLevelId)),
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
          }, COMPLETION_AUTO_RESUME_MS);
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
      totalBadges: tangramBadgeTotal(level),
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
      parent.removeEventListener('touchstart', trackTouchStart);
      parent.removeEventListener('touchend', preventDoubleTapZoom);
      delete (window as unknown as { __penguinsOfTangram?: TestHook }).__penguinsOfTangram;
      parent.innerHTML = '';
      parent.classList.remove('tangram-platformer-stage');
    },
  };
}
