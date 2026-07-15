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
  CAMPAIGN_LEVELS,
  FIRST_LEVEL_ID,
  getTangramLevel,
  nextTangramLevelId,
  type Rect,
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
  type TangramPlaytestSummary,
  type TangramProgress,
} from './progress';

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
  checkpointReached: boolean;
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
  audioMuted: boolean;
  reducedMotion: boolean;
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
  destroy: () => void;
};

function buildJumpAudit(level: TangramLevelDefinition, character: TangramCharacterDefinition): JumpAudit {
  return buildTangramJumpAudit(level, character.movement);
}

function formatBest(best: TangramLevelBest | undefined): string {
  return best ? `Personal best: ${best.badgesCollected} badges • ${best.durationSeconds}s • ${best.falls} falls` : 'No personal best yet';
}

function formatPlaytestSummary(summary: TangramPlaytestSummary | undefined): string {
  if (!summary) return '';
  const averageSeconds = Math.round(summary.totalDurationSeconds / summary.attempts);
  return `Local notes: ${summary.attempts} tries • ${averageSeconds}s average • ${summary.totalFalls} falls • ${summary.checkpointUses} checkpoint uses`;
}

function createTouchControls(parent: HTMLElement): TangramTouchControls {
  const controls = document.createElement('div');
  controls.className = 'tangram-platformer-touch-controls';
  controls.hidden = true;
  controls.innerHTML = `
    <button type="button" data-control="left" aria-label="Move left">←</button>
    <button type="button" data-control="right" aria-label="Move right">→</button>
    <button type="button" data-control="jump" aria-label="Jump">Jump</button>`;
  parent.append(controls);

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
    destroy() {
      reset();
      cleanups.forEach((cleanup) => cleanup());
      controls.remove();
    },
  };
  const pointerDown = (event: PointerEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-control]');
    if (!button) return;
    event.preventDefault();
    const control = button.dataset.control;
    if (control === 'jump') touchControls.jumpPressed = true;
    if (control === 'left' || control === 'right') touchControls[control] = true;
  };
  controls.addEventListener('pointerdown', pointerDown);
  controls.addEventListener('pointerup', reset);
  controls.addEventListener('pointercancel', reset);
  controls.addEventListener('pointerleave', reset);
  cleanups.push(
    () => controls.removeEventListener('pointerdown', pointerDown),
    () => controls.removeEventListener('pointerup', reset),
    () => controls.removeEventListener('pointercancel', reset),
    () => controls.removeEventListener('pointerleave', reset),
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
    onHudUpdate: (snapshot: HudSnapshot) => void;
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
  private powerSnack!: Phaser.GameObjects.Container;
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
  accumulator = 0;
  private lastJumpDown = false;
  private paused = false;

  constructor(
    character: TangramCharacterDefinition,
    level: TangramLevelDefinition,
    touchControls: TangramTouchControls,
    callbacks: {
      onHudUpdate: (snapshot: HudSnapshot) => void;
      onSceneState: (snapshot: SceneHookState) => void;
      onComplete: (summary: LevelSummary) => void;
    },
    options: { muted: boolean; reducedMotion: boolean },
  ) {
    super('PenguinsOfTangram');
    this.character = character;
    this.level = level;
    this.touchControls = touchControls;
    this.callbacks = callbacks;
    this.muted = options.muted;
    this.reducedMotion = options.reducedMotion;
    this.jumpAudit = buildJumpAudit(level, character);
    this.simulation = createTangramPlatformerState(level);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.level.skyColor);
    this.cameras.main.setBounds(0, 0, this.level.worldWidth, this.level.worldHeight);
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
    tickTangramPlatformer(
      this.simulation,
      this.level,
      this.character.movement,
      { direction: 0, jumpPressed: false },
      TANGRAM_FIXED_STEP,
      this.simulationEvents,
    );
    this.syncSimulationVisuals();
    this.applySimulationEvents();
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
    this.movingPlatforms = (this.level.movingPlatforms ?? []).map((platform) => {
      const sprite = this.add.container(platform.x + platform.width / 2, platform.y + platform.height / 2);
      sprite.setDepth(3);
      sprite.add([
        this.add.rectangle(0, 0, platform.width, platform.height, platform.color),
        this.add.rectangle(0, -platform.height / 2 + 4, platform.width, 8, platform.trim),
        this.add.text(0, platform.height / 2 + 12, 'MOVE', {
          fontFamily: 'Arial, sans-serif',
          fontSize: '11px',
          color: '#103047',
          fontStyle: 'bold',
        }).setOrigin(0.5),
      ]);
      return { sprite };
    });
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
      sprite: this.createBadge(entry.x, entry.y, entry.secret ? 0xff93c2 : 0xffd166),
    }));
  }

  private createHazards(): void {
    for (const hazard of this.level.hazards) this.createPuddle(hazard);
  }

  private createEnemies(): void {
    this.enemies = this.level.enemies.map((enemy, index) => ({
      sprite: this.createCritter(enemy.x, enemy.y, index),
    }));
  }

  private createBoss(): void {
    const boss = this.level.boss;
    if (!boss) return;
    this.bossSprite = this.add.container(boss.x + boss.width / 2, boss.y + boss.height / 2);
    this.bossSprite.setDepth(5);
    this.bossHealthLabel = this.add.text(0, -64, `STOMPS: ${boss.hits}`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      color: '#103047',
      fontStyle: 'bold',
      backgroundColor: '#ffffffcc',
      padding: { left: 5, right: 5, top: 2, bottom: 2 },
    }).setOrigin(0.5);
    this.bossTelegraphLabel = this.add.text(0, -82, 'CHARGE READY', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      color: '#8d5b34',
      fontStyle: 'bold',
      backgroundColor: '#ffef8e',
      padding: { left: 5, right: 5, top: 2, bottom: 2 },
    }).setOrigin(0.5).setVisible(false);
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
      this.add.text(0, -48, boss.label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        color: '#103047',
        fontStyle: 'bold',
        backgroundColor: '#ffffffcc',
        padding: { left: 6, right: 6, top: 3, bottom: 3 },
      }).setOrigin(0.5),
      this.bossHealthLabel,
      this.bossTelegraphLabel,
    ]);
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
    this.bouncePads = (this.level.bouncePads ?? []).map((pad) => {
      const container = this.add.container(pad.x + pad.width / 2, pad.y + pad.height / 2);
      container.setDepth(4);
      container.add([
        this.add.rectangle(0, 0, pad.width, pad.height, pad.color),
        this.add.text(0, 0, '⇧', { fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#103047', fontStyle: 'bold' }).setOrigin(0.5),
      ]);
      return container;
    });
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
    const body = this.add.ellipse(0, -8, 44, 56, bodyColor);
    const belly = this.add.ellipse(0, -2, 24, 30, 0xf7fbff);
    const leftFlipper = this.add.rectangle(-20, -8, 10, 24, accessoryColor);
    const rightFlipper = this.add.rectangle(20, -8, 10, 24, accessoryColor);
    const leftFoot = this.add.ellipse(-10, 22, 14, 8, 0xffb15f);
    const rightFoot = this.add.ellipse(10, 22, 14, 8, 0xffb15f);
    container.add([
      shadow,
      body,
      belly,
      this.add.rectangle(0, -30, 36, 10, accentColor),
      leftFlipper,
      rightFlipper,
      this.add.circle(-9, -18, 4, 0xffffff),
      this.add.circle(9, -18, 4, 0xffffff),
      this.add.circle(-9, -18, 2, 0x103047),
      this.add.circle(9, -18, 2, 0x103047),
      this.add.triangle(0, -8, -8, -4, 8, -4, 0, 8, 0xffb15f),
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
    this.player.scaleX = playerState.facing;
    this.player.rotation = Phaser.Math.Linear(this.player.rotation, playerState.velocityX * 0.0008, 0.15);
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
      this.bossHealthLabel?.setText(`STOMPS: ${bossState.hitsRemaining}`);
      const warning = bossState.warningRemaining > 0;
      const charging = bossState.charging;
      this.bossTelegraphLabel?.setVisible(warning || charging);
      this.bossTelegraphLabel?.setText(charging ? 'CHARGE!' : 'CHARGE READY');
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
    this.powerSnack.setVisible(this.simulation.powerSnackAvailable);
    this.powerSnack.y = this.level.powerup.y + 26 + (this.reducedMotion ? 0 : Math.sin(this.time.now * 0.004) * 5);
    this.powerSnack.rotation = this.reducedMotion ? 0 : Math.sin(this.time.now * 0.002) * 0.12;
    this.powerSnack.setScale(this.reducedMotion ? 1 : 1 + Math.sin(this.time.now * 0.006) * 0.06);
    this.checkpointBanner.y = this.level.checkpoint.y + 60 + (this.reducedMotion ? 0 : Math.sin(this.time.now * 0.003) * 2);
    this.goalBanner.y = this.level.goal.y + 84 + (this.reducedMotion ? 0 : Math.sin(this.time.now * 0.003 + 1) * 3);
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

      this.playerShadow.setScale(walking ? 1.08 : 1, walking ? 0.9 : 1);
      this.playerShadow.setAlpha(airborne ? 0.1 : 0.18);
      this.playerBody.y = -8 + bob;
      this.playerBody.scaleY = 1 + (powered ? 0.04 : 0);
      this.playerBelly.y = -2 + bob;
      this.playerFlippers[0].y = -8 + bob - tuck * 3;
      this.playerFlippers[1].y = -8 + bob - tuck * 3;
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
    this.callbacks.onHudUpdate({
      zoneTitle: this.level.title,
      characterName: this.character.name,
      characterClass: this.character.className,
      badgesCollected: this.simulation.badgesCollected,
      totalBadges: this.collectibles.length,
      checkpointLabel: this.simulation.respawnPoint.label,
      powerLabel: isTangramPoweredUp(this.simulation) ? 'Super snack active' : 'No power-up',
      hint: this.simulation.hint,
    });
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

function createPauseButton(parent: HTMLElement, onPause: () => void): {
  setVisible: (visible: boolean) => void;
} {
  const button = document.createElement('button');
  button.className = 'tangram-platformer-pause-button';
  button.type = 'button';
  button.textContent = 'Pause';
  button.hidden = true;
  button.addEventListener('click', onPause);
  parent.append(button);
  return {
    setVisible(visible) {
      button.hidden = !visible;
    },
  };
}

function createPauseOverlay(
  parent: HTMLElement,
  actions: { onResume: () => void; onMap: () => void; onRestart: () => void },
): { overlay: HTMLDivElement; show: () => void; hide: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay tangram-platformer-overlay--pause';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="tangram-platformer-panel">
      <p class="tangram-platformer-kicker">Tangram pause</p>
      <h2>Parade paused</h2>
      <p class="tangram-platformer-copy">The simulation is frozen. Take a breath, then jump back into the route.</p>
      <div class="tangram-platformer-action-row">
        <button class="tangram-platformer-button" type="button" data-action="resume">Resume run</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="restart">Restart level</button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-action="map">Back to school map</button>
      </div>
    </section>`;
  parent.append(overlay);
  overlay.querySelector<HTMLButtonElement>('[data-action="resume"]')?.addEventListener('click', actions.onResume);
  overlay.querySelector<HTMLButtonElement>('[data-action="restart"]')?.addEventListener('click', actions.onRestart);
  overlay.querySelector<HTMLButtonElement>('[data-action="map"]')?.addEventListener('click', actions.onMap);
  return {
    overlay,
    show: () => { overlay.hidden = false; },
    hide: () => { overlay.hidden = true; },
  };
}

function createAudioToggle(
  parent: HTMLElement,
  muted: boolean,
  onToggle: (muted: boolean) => void,
): { setMuted: (muted: boolean) => void } {
  const button = document.createElement('button');
  button.className = 'tangram-platformer-audio-button';
  button.type = 'button';
  parent.append(button);
  const setMuted = (nextMuted: boolean): void => {
    button.textContent = nextMuted ? 'Sound: Off' : 'Sound: On';
    button.setAttribute('aria-pressed', String(nextMuted));
    button.setAttribute('aria-label', nextMuted ? 'Turn sound on' : 'Mute sound');
  };
  button.addEventListener('click', () => {
    const nextMuted = button.getAttribute('aria-pressed') !== 'true';
    setMuted(nextMuted);
    onToggle(nextMuted);
  });
  setMuted(muted);
  return { setMuted };
}

function createChildHelpPanel(
  parent: HTMLElement,
  options: {
    reducedMotion: boolean;
    playtestEnabled: boolean;
    onReducedMotion: (reduced: boolean) => void;
    onPlaytest: (enabled: boolean) => void;
    onReset: () => void;
  },
): {
  setReducedMotion: (reduced: boolean) => void;
  setPlaytestEnabled: (enabled: boolean) => void;
} {
  const openButton = document.createElement('button');
  openButton.className = 'tangram-platformer-help-button';
  openButton.type = 'button';
  openButton.textContent = 'How to play';
  openButton.setAttribute('aria-label', 'Open how to play and settings');

  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay tangram-platformer-overlay--help';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="tangram-platformer-panel">
      <p class="tangram-platformer-kicker">Tangram helper</p>
      <h2>How to play</h2>
      <p class="tangram-platformer-copy">Move, jump, collect badges, and ring the bell. Falling is okay: checkpoints remember your place.</p>
      <div class="tangram-platformer-help-list">
        <p><strong>Keyboard</strong><br>Arrow keys or A/D move. Space, W, or Up jumps.</p>
        <p><strong>Touch</strong><br>Use the big buttons on the screen to move and jump.</p>
        <p><strong>Pause</strong><br>Press P or Escape, or choose Pause.</p>
      </div>
      <div class="tangram-platformer-action-row tangram-platformer-action-row--settings">
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-help-action="motion"></button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-help-action="playtest"></button>
        <button class="tangram-platformer-button tangram-platformer-button--ghost" type="button" data-help-action="reset">Reset campaign</button>
        <button class="tangram-platformer-button" type="button" data-help-action="close">Close</button>
      </div>
    </section>`;
  parent.append(openButton, overlay);

  const motionButton = overlay.querySelector<HTMLButtonElement>('[data-help-action="motion"]');
  const playtestButton = overlay.querySelector<HTMLButtonElement>('[data-help-action="playtest"]');
  const setReducedMotion = (reduced: boolean): void => {
    if (!motionButton) return;
    motionButton.textContent = reduced ? 'Motion: Reduced' : 'Motion: Normal';
    motionButton.setAttribute('aria-pressed', String(reduced));
  };
  const setPlaytestEnabled = (enabled: boolean): void => {
    if (!playtestButton) return;
    playtestButton.textContent = enabled ? 'Route notes: On' : 'Route notes: Off';
    playtestButton.setAttribute('aria-pressed', String(enabled));
  };
  openButton.addEventListener('click', () => {
    overlay.hidden = false;
    overlay.querySelector<HTMLButtonElement>('[data-help-action="close"]')?.focus();
  });
  overlay.querySelector<HTMLButtonElement>('[data-help-action="close"]')?.addEventListener('click', () => {
    overlay.hidden = true;
    openButton.focus();
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
  overlay.querySelector<HTMLButtonElement>('[data-help-action="reset"]')?.addEventListener('click', () => {
    if (window.confirm('Reset the school map and start again?')) {
      overlay.hidden = true;
      options.onReset();
    }
  });
  setReducedMotion(options.reducedMotion);
  setPlaytestEnabled(options.playtestEnabled);
  return { setReducedMotion, setPlaytestEnabled };
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
    <p class="tangram-platformer-kicker">Tangram school adventure</p>
    <h2>Penguins of Tangram</h2>
    <p class="tangram-platformer-copy">
      Pick a classmate, run and jump through five school zones, collect badges,
      and ring the festival bell.
    </p>
    <p class="tangram-platformer-copy tangram-platformer-copy--soft">
      Every class is fun to play. Try different classmates to find your favorite.
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
  render: (
    selectedLevelId: TangramLevelId,
    unlocked: readonly TangramLevelId[],
    completed: readonly TangramLevelId[],
    bestByLevel: Partial<Record<TangramLevelId, TangramLevelBest>>,
    playtestByLevel: Partial<Record<TangramLevelId, TangramPlaytestSummary>>,
  ) => void;
} {
  const overlay = document.createElement('div');
  overlay.className = 'tangram-platformer-overlay';
  overlay.hidden = true;
  const panel = document.createElement('section');
  panel.className = 'tangram-platformer-panel';
  panel.innerHTML = `
    <p class="tangram-platformer-kicker">School map</p>
    <h2>Five-zone adventure</h2>
    <p class="tangram-platformer-copy">Finish a zone to open the next one. You can replay any finished zone whenever you like.</p>`;
  const grid = document.createElement('div');
  grid.className = 'story-chapter-grid story-chapter-grid--map';
  panel.append(grid);
  overlay.append(panel);
  parent.append(overlay);
  const render = (
    selectedLevelId: TangramLevelId,
    unlocked: readonly TangramLevelId[],
    completed: readonly TangramLevelId[],
    bestByLevel: Partial<Record<TangramLevelId, TangramLevelBest>>,
    playtestByLevel: Partial<Record<TangramLevelId, TangramPlaytestSummary>>,
  ): void => {
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
          <span class="story-chapter-meta">${formatBest(bestByLevel[level.id])}</span>
          ${formatPlaytestSummary(playtestByLevel[level.id]) ? `<span class="story-chapter-meta">${formatPlaytestSummary(playtestByLevel[level.id])}</span>` : ''}
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
  show: (summary: LevelSummary, personalBest?: TangramLevelBest) => void;
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
      <p class="tangram-platformer-copy tangram-platformer-copy--soft" data-field="best"></p>
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
  const best = overlay.querySelector('[data-field="best"]') as HTMLParagraphElement;
  const nextButton = overlay.querySelector('[data-action="next"]') as HTMLButtonElement;
  return {
    overlay,
    show(summary, personalBest?: TangramLevelBest) {
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
      best.textContent = formatBest(personalBest);
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

  const hud = createHudPanel(parent);
  const touchControls = createTouchControls(parent);
  let progress: TangramProgress = loadTangramProgress();
  let selectedCharacterId: TangramCharacterId = progress.selectedCharacterId;
  let selectedLevelId: TangramLevelId = FIRST_LEVEL_ID;
  const unlockedLevelIds: TangramLevelId[] = getUnlockedTangramLevelIds(progress.completedLevelIds);
  const completedLevelIds: TangramLevelId[] = [...progress.completedLevelIds];
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

  const pauseButton = createPauseButton(parent, () => togglePause());
  const pauseOverlay = createPauseOverlay(parent, {
    onResume: () => togglePause(false),
    onRestart: () => startLevel(selectedLevelId),
    onMap: () => showMap(selectedLevelId),
  });
  const audioToggle = createAudioToggle(parent, audioMuted, (muted) => {
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
      progress = { ...progress, selectedCharacterId };
      saveTangramProgress(progress);
      select.updateSelection(id);
      lastHookState = {
        ...lastHookState,
        jumpAudit: buildJumpAudit(getTangramLevel(selectedLevelId), getTangramCharacter(selectedCharacterId)),
      };
      emitHook();
    },
    () => showMap(selectedLevelId),
  );

  const helpPanel = createChildHelpPanel(parent, {
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
    onReset() {
      progress = resetTangramProgress();
      selectedCharacterId = progress.selectedCharacterId;
      selectedLevelId = FIRST_LEVEL_ID;
      completedLevelIds.splice(0, completedLevelIds.length);
      unlockedLevelIds.splice(0, unlockedLevelIds.length, ...getUnlockedTangramLevelIds([]));
      audioMuted = progress.audioMuted;
      reducedMotion = progress.reducedMotion;
      playtestEnabled = progress.playtestEnabled;
      audioToggle.setMuted(audioMuted);
      helpPanel.setReducedMotion(reducedMotion);
      helpPanel.setPlaytestEnabled(playtestEnabled);
      select.updateSelection(selectedCharacterId);
      showCharacterSelect();
    },
  });

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
    touchControls.setVisible(false);
    pauseButton.setVisible(false);
    pauseOverlay.hide();
    isPaused = false;
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
    touchControls.setVisible(false);
    pauseButton.setVisible(false);
    pauseOverlay.hide();
    isPaused = false;
    selectedLevelId = unlockedLevelIds.includes(levelId) ? levelId : unlockedLevelIds[unlockedLevelIds.length - 1];
    select.overlay.hidden = true;
    completion.overlay.hidden = true;
    map.render(
      selectedLevelId,
      unlockedLevelIds,
      completedLevelIds,
      progress.bestByLevel,
      playtestEnabled ? progress.playtestByLevel : {},
    );
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
    map.overlay.hidden = true;
    destroyGame();
    const level = getTangramLevel(levelId);
    const character = getTangramCharacter(selectedCharacterId);
    const scene = new PenguinsOfTangramScene(character, level, touchControls, {
      onHudUpdate(snapshot) {
        updateHudForScene(snapshot);
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
        emitHook();
      },
    }, { muted: audioMuted, reducedMotion });
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
