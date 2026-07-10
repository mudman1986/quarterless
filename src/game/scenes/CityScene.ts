import {
  buildCity,
  crosswalkStripeRects,
  nearestRoadTileCenter,
  roadStandoffPoint,
  tileCenter,
  type City,
  type Facility,
  type ParkingSpot,
} from '../../core/city';
import Phaser from 'phaser';
import {
  SERVICE_SPAWN_SPACING,
  World,
  type VehicleKind,
  type WorldSnapshot,
  vehicleBodySpecForKind,
} from '../../core/world';
import type { WorldOptions } from '../../core/world';
import { CITY_SPEC } from '../citySpec';
import { clearGameState, GAME_STATE_KEY, loadGameState, saveGameState } from '../../core/gameState';
import { loadHighScore, saveHighScore, type KeyValueStore } from '../../core/highScore';
import { isFailed, type Mission } from '../../core/mission';
import type { Car } from '../../core/vehicle';
import type { Pedestrian } from '../../core/pedestrianAI';
import { type TrafficAI, openDirections, tileCoord } from '../../core/trafficAI';
import type { AmmoPickup } from '../../core/weapon';
import { distance, fromAngle, vec2, type Vec2 } from '../../core/vector';
import { uiScreenToWorld, uiCounterScale, uiAnchorOnScreen } from '../../core/hudLayout';
import { greenAxis } from '../../core/trafficLight';
import { KeyboardInput } from '../input/KeyboardInput';
import { TouchInput } from '../input/TouchInput';
import {
  mergeControls,
  touchDeviceLikely,
  touchLayoutForViewport,
  type TouchLayout,
  type TouchSnapshot,
} from '../input/touchControls';
import { Sound } from '../audio/Sound';
import {
  CIVILIAN_VEHICLE_TEXTURES,
  cycleFrame,
  effectFrame,
  FX,
  PEDESTRIAN_VARIANT_TEXTURES,
  pickVariantTexture,
  preloadGameTextures,
  TILE,
  TEX,
  textureRef,
  type TextureRef,
} from '../art/textures';
import { NO_CONTROLS } from '../../core/types';
import { buildSandboxCampaigns } from '../story/sandboxCampaigns';
import { STORY_MODE_PROTOTYPE } from '../story/storyCampaign';
import {
  clearStoryProgress,
  completeStoryMission,
  createStoryProgress,
  currentStoryChapter,
  currentStoryMissionChoices,
  currentStoryMission,
  loadStoryProgress,
  saveStoryProgress,
  selectStoryMission,
  setStoryObjectiveIndex,
  STORY_LAUNCH_PROGRESS_KEY,
  storyProgressSaveKey,
  type StoryProgressSnapshot,
} from '../story/storyProgress';
import { clearStoryLaunchRequest, loadStoryLaunchRequest } from '../story/storyLaunchState';
import {
  compileStoryChapterRuntimeCampaign,
  formatStoryCityState,
  formatStorySystem,
  resolveStoryMissionPlan,
  STORY_MISSION_GROUP_SELECTION_INDEX,
  storyMissionStartPosition,
  storyObjectiveIndexFromRuntime,
  summarizeStoryCityState,
} from '../story/storyMode';
import type {
  StoryBeatPresentation,
  PedestrianRouteActorScript,
  PedestrianSquadActorScript,
  StoryChapter,
  StoryMissionPlan,
  StoryRuntimeScript,
  StoryRuntimeStage,
  VehicleRouteActorScript,
} from '../story/storyMode';
import { pushStoryMissionScorecard } from '../story/storyMissionScorecards';
import {
  advancePedestrianRouteActor,
  advanceVehicleRouteActor,
  applyStoryFailRules,
  isStageTransitionMet,
  normalizeRouteCompletion,
  placeStorySquadMember,
  updateTailCaptureProgress,
} from '../story/runtimeActors';

const COLORS = {
  road: 0x1f2430,
  roadLine: 0x6b7280,
  roadShadow: 0x121720,
  building: 0x4b5563,
  buildingEdge: 0x0f172a,
  buildingRoof: 0x6a7688,
  policeBuilding: 0x1d4ed8,
  hospitalBuilding: 0xf8fafc,
  towBuilding: 0xf59e0b,
  taxiBuilding: 0xfacc15,
  policeRoof: 0x0f285f,
  hospitalRoof: 0xe2e8f0,
  towRoof: 0x92400e,
  taxiRoof: 0x854d0e,
  window: 0xfde68a,
  windowDark: 0x334155,
  bullet: 0xfde047,
  marker: 0x22d3ee,
  taxiMarker: 0xfacc15,
  policeMarker: 0x60a5fa,
  ambulanceMarker: 0xf8fafc,
  towMarker: 0xf59e0b,
  garageApron: 0x3f3f46,
  garageDoor: 0x18181b,
  garageStripe: 0xf8fafc,
  ammo: 0xfacc15,
  // Water & bridges.
  water: 0x155e75,
  waterEdge: 0x0f3f54,
  waterFoam: 0x67e8f9,
  bridge: 0x3a3a42,
  bridgeEdge: 0x18181b,
  fence: 0xa8a29e,
  // Streets.
  sidewalk: 0x7b8592,
  sidewalkShade: 0x5f6977,
  curbLine: 0xa8b2c0,
  crosswalk: 0xe2e8f0,
  lightGreen: 0x22c55e,
  lightRed: 0xef4444,
  parkingLine: 0xf59e0b,
  spark: 0xfb923c,
  sparkCore: 0xfef08a,
  pickupSpark: 0x22d3ee,
  pickupCore: 0xfacc15,
  skid: 0x0f172a,
  fireGlow: 0xf97316,
  fireCore: 0xfacc15,
  smoke: 0x111827,
  // Minimap.
  mmBg: 0x0b0f17,
  mmRoad: 0x334155,
  mmBuilding: 0x1e293b,
  mmPoliceBuilding: 0x2563eb,
  mmHospitalBuilding: 0xe5e7eb,
  mmTowBuilding: 0xf59e0b,
  mmTaxiBuilding: 0xfacc15,
  mmWater: 0x1d4e6f,
  mmPlayer: 0x39ff14,
  mmPolice: 0x3b82f6,
  mmTarget: 0x22d3ee,
  mmTaxiTarget: 0xfacc15,
  mmPoliceTarget: 0x60a5fa,
  mmAmbulanceTarget: 0xf8fafc,
  mmTowTarget: 0xf59e0b,
  mmAmmo: 0xfacc15,
};

type VisualParticle = {
  pos: Vec2;
  vel: Vec2;
  age: number;
  life: number;
  radius: number;
  color: number;
  alpha: number;
  stretch: number;
};

function blendColor(a: number, b: number, amount: number): number {
  const mix = (x: number, y: number) => Math.round(x + (y - x) * amount);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (mix(ar, br) << 16) | (mix(ag, bg) << 8) | mix(ab, bb);
}

function stableVisualSeed(...values: number[]): number {
  let seed = 17;
  for (const value of values) {
    seed = Math.imul(seed, 31) + Math.trunc(value);
    seed |= 0;
  }
  return Math.abs(seed);
}

function stringSeed(value: string | undefined): number {
  if (!value) return 0;
  let seed = 0;
  for (let i = 0; i < value.length; i++) {
    seed = Math.imul(seed, 33) + value.charCodeAt(i);
    seed |= 0;
  }
  return Math.abs(seed);
}

function pickupVisualKey(pickup: AmmoPickup): string {
  return `${Math.round(pickup.pos.x)}:${Math.round(pickup.pos.y)}:${pickup.amount}`;
}

/**
 * The browser's `localStorage`, or an in-memory fallback when it is unavailable
 * (e.g. blocked by privacy settings). Keeps the high score from ever throwing.
 */
function safeStorage(): KeyValueStore {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* access denied: fall through to the in-memory store */
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
}

const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 5;
/** Largest per-frame delta (seconds) ever fed into the simulation/story timers. A dropped
 * frame, a GC pause, or the browser tab losing focus and later resuming can otherwise hand a
 * multi-second `deltaMs` to a single `update()` call; unclamped, that jumps straight past any
 * story fail-rule's `maxSeconds` in one shot (a mission could fail the instant the tab regains
 * focus, well before the player could ever have actually held the failing condition that long). */
const MAX_FRAME_DT = 0.25;
const PLAYER_SIZE = 14;
const PED_SIZE = 10;
/** Every Nth sidewalk strip gets a starting pedestrian. Lower means denser crowds. */
const PEDESTRIAN_SIDEWALK_STRIDE = 6;
/** Roughly how many of the city's parking bays actually hold a parked car. */
const PARKED_CAR_BUDGET = 90;
/** Minimap dots do not need a full 60 Hz redraw to read clearly. */
const MINIMAP_REFRESH_INTERVAL = 1 / 30;
/** A focus jump larger than this (px) means the player wrapped a map edge:
 * snap the camera there rather than panning smoothly across the whole city. */
const WRAP_SNAP_DISTANCE = 256;
/** World units kept visible across the viewport's smaller side. The camera zoom
 * is derived from this so a consistent slice of the city shows on any screen
 * (phones, tablets, desktops), keeping the player centred and on-screen. */
const VIEW_SPAN = 760;
/** Clamp the derived zoom so it never becomes extreme on unusual displays. */
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.5;
/** Extra camera room beyond the wrapped map so edge actors are fully visible. */
const CAMERA_EDGE_GUTTER = 12;
/** On-screen size of the square minimap. */
const MINIMAP_SIZE = 168;
const MINIMAP_BG_TEXTURE_KEY = 'minimap-bg';
const BANNER_DEFAULT_SECONDS = 15;
const BANNER_MAX_WIDTH = 420;

function enteredCarLabel(kind: VehicleKind): string {
  if (kind === 'ambulance') return 'AMBULANCE';
  if (kind === 'tow') return 'TOW TRUCK';
  if (kind === 'police') return 'POLICE CAR';
  if (kind === 'taxi') return 'TAXI';
  if (kind === 'sedan') return 'SEDAN';
  if (kind === 'coupe') return 'COUPE';
  if (kind === 'muscle') return 'MUSCLE CAR';
  if (kind === 'sports') return 'SPORTS CAR';
  if (kind === 'pickup') return 'PICKUP TRUCK';
  if (kind === 'van') return 'VAN';
  if (kind === 'limo') return 'LIMO';
  return 'CAR';
}
/** Length in seconds of a full day/night cycle (30 minutes). */
const DAY_LENGTH = 1800;
const SAVE_INTERVAL = 0.5;
/** Tow-truck amber beacon: blink interval (ms) and how far forward (px) of the
 * truck's centre the cab-roof light sits. */
const TOW_BEACON_BLINK_MS = 280;
const TOW_BEACON_FWD = 9.5;
/** Ambulance light bar: strobe interval (ms), and how far forward (px) and to
 * each side (px) of the centre the blue and red lamps sit (over the roof bar). */
const AMB_BEACON_BLINK_MS = 220;
const AMB_BEACON_FWD = 6.5;
const AMB_BEACON_SIDE = 3.5;
const TOUCH_ALPHA = 0.88;
const TOUCH_STICK_FILL = 0x0f172a;
const TOUCH_STICK_STROKE = 0xe2e8f0;
const TOUCH_ACTION = 0xf59e0b;
const TOUCH_FIRE = 0xef4444;
const TOUCH_CONFIRM = 0x22d3ee;
const TOUCH_PREF_KEY = 'sindicate.touchEnabled';
const PARKED_TRAFFIC_MIX: readonly VehicleKind[] = [
  'sedan',
  'car',
  'coupe',
  'pickup',
  'van',
  'muscle',
  'limo',
  'car',
];
const MOVING_TRAFFIC_MIX: readonly VehicleKind[] = [
  'car',
  'sedan',
  'coupe',
  'muscle',
  'sports',
  'pickup',
  'van',
  'car',
];
/** Parking spot for story actors that have been handed off / dropped by a stage transition or
 * mission change. Far enough outside any city bounds to stay off-screen and off the minimap. */
const STORY_ACTOR_DESPAWN_POS: Vec2 = vec2(-100000, -100000);

interface CitySceneStartData {
  loadSaveKey?: string | null;
  skipResume?: boolean;
  mode?: 'sandbox' | 'story';
  storyProgress?: StoryProgressSnapshot | null;
  /** When resuming from a restored snapshot, rebuild the active mission/campaign
   * fresh instead of keeping the snapshot's (often already-complete) one. Used for
   * story chapter transitions, which must preserve run stats but not the just-
   * finished chapter's mission state. */
  freshMissionOnResume?: boolean;
}

interface StoryScriptState {
  chapterId: string;
  missionId: string;
  stageIndex: number;
  stageLabel: string;
  tailSeconds: number;
  captureSeconds: number;
  tailLostSeconds: number;
  actorCarIndices: Record<string, number>;
  actorPedIndices: Record<string, number[]>;
  actorRouteIndices: Record<string, number>;
  failCounters: Record<string, number>;
  targetPedIndex: number | null;
  targetSpawned: boolean;
  introShown: boolean;
  recapShown: boolean;
}

interface StoryMissionSummaryBaseline {
  chapterId: string;
  missionId: string;
  kills: number;
  targetKills: number;
  explosionsTriggered: number;
  elapsedSeconds: number;
  unlockedChapterIds: string[];
  completedChapterIds: string[];
  branchOutcomes: Record<string, string>;
  playerVehicleHealth: number | null;
}

interface StoryMissionSummaryCard {
  chapterTitle: string;
  title: string;
  voiceText: string | null;
  beatText: string | null;
  reward: number;
  outcome: string;
  durationSeconds: number;
  collateralIncidents: number;
  vehicleLosses: number;
  vehicleConditionText: string;
  serviceLaneText: string;
  factionEffectText: string;
  cityStateText: string;
  systemsText: string;
  unlockText: string;
  nextText: string;
}

type StoryPanelTone = 'chapter' | 'brief' | 'summary' | 'complete' | 'danger';

interface StoryPanelBeat {
  text: string;
  tone: StoryPanelTone;
  beat?: StoryBeatPresentation;
  focusTarget?: Vec2 | null;
  seconds?: number;
  requiresAcknowledge?: boolean;
  pauseGame?: boolean;
}

/**
 * Renders the core `World` simulation with Phaser. The scene owns no game
 * rules: it builds the city, feeds keyboard input into `world.tick`, and draws
 * whatever the simulation reports each frame.
 */
export class CityScene extends Phaser.Scene {
  private city!: City;
  private world!: World;
  private input_!: KeyboardInput;
  private touchInput_!: TouchInput;
  private touchAvailable = false;
  private touchOptedOut = false;
  private touchEnabled = false;
  private touchLayout: TouchLayout | null = null;

  private playerSprite!: Phaser.GameObjects.Image;
  private carSprites: Phaser.GameObjects.Image[] = [];
  private pedSprites: Phaser.GameObjects.Image[] = [];
  private policeSprites: Phaser.GameObjects.Image[] = [];
  private waterTiles: Phaser.GameObjects.TileSprite[] = [];
  private shimmerSprites: Phaser.GameObjects.Image[] = [];
  private explosionSprites: Phaser.GameObjects.Image[] = [];
  private fireSprites: Phaser.GameObjects.Image[] = [];
  private damageSprites: Phaser.GameObjects.Image[] = [];
  private bulletSprites: Phaser.GameObjects.Rectangle[] = [];
  private policeBulletSprites: Phaser.GameObjects.Rectangle[] = [];
  private ammoSprites: { sprite: Phaser.GameObjects.Image; pickup: AmmoPickup }[] = [];
  private missionMarker!: Phaser.GameObjects.Arc;
  private storyChoiceMarkersGfx!: Phaser.GameObjects.Graphics;
  private taxiMarker!: Phaser.GameObjects.Arc;
  private serviceMarker!: Phaser.GameObjects.Arc;
  private feedbackGfx!: Phaser.GameObjects.Graphics;
  private lightsGfx!: Phaser.GameObjects.Graphics;
  private corpseGfx!: Phaser.GameObjects.Graphics;
  private ambulanceSprite!: Phaser.GameObjects.Image;
  /** The ambulance's roof light bar: two lamps that strobe blue then red. */
  private ambulanceBeaconBlue?: Phaser.GameObjects.Container;
  private ambulanceBeaconRed?: Phaser.GameObjects.Container;
  /** The medic on foot while the ambulance is parked fetching a body. */
  private medicSprite?: Phaser.GameObjects.Image;
  private towSprites: Phaser.GameObjects.Image[] = [];
  /** Flashing amber beacon overlaid on each tow truck (parallel to `towSprites`). */
  private towBeacons: Phaser.GameObjects.Container[] = [];
  /** The operator on foot beside each parked tow truck (parallel to `towSprites`). */
  private towWorkerSprites: Phaser.GameObjects.Image[] = [];
  /** The parking bays that actually hold a parked car (for drawing the markings). */
  private parkedSpots: ParkingSpot[] = [];
  /** Centre of every intersection, for drawing the traffic lights. */
  private intersectionCenters: Vec2[] = [];
  private focusPoint!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Text;
  private bustedText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private bannerCloseButton!: Phaser.GameObjects.Text;
  private storyPanelFrame!: Phaser.GameObjects.Graphics;
  private storyPanelAccent!: Phaser.GameObjects.Rectangle;
  private storyPortraitBackdrop!: Phaser.GameObjects.Graphics;
  private storyPortraitFrame!: Phaser.GameObjects.Graphics;
  private storyPortraitBadge!: Phaser.GameObjects.Arc;
  private storyPortraitMonogram!: Phaser.GameObjects.Text;
  private storyPortraitName!: Phaser.GameObjects.Text;
  private storyPortraitRole!: Phaser.GameObjects.Text;
  private storyPortraitKicker!: Phaser.GameObjects.Text;
  private storyPanel!: Phaser.GameObjects.Text;
  private storyStateText!: Phaser.GameObjects.Text;
  private touchControlsGfx!: Phaser.GameObjects.Graphics;
  private prevTouchConfirm = false;

  // Minimap.
  private minimapBg!: Phaser.GameObjects.Image;
  private minimapDots!: Phaser.GameObjects.Graphics;

  private accumulator = 0;
  private minimapAccumulator = MINIMAP_REFRESH_INTERVAL;
  private saveAccumulator = 0;

  private paused = false;
  private pauseKey!: Phaser.Input.Keyboard.Key;
  private storyAcknowledgeKey!: Phaser.Input.Keyboard.Key;
  private newGameKey!: Phaser.Input.Keyboard.Key;
  private pauseTouchButton!: Phaser.GameObjects.Text;

  /** High-score persistence. */
  private store: KeyValueStore = safeStorage();
  private savedBest = 0;
  private skipPersistOnShutdown = false;
  private requestedLoadKey: string | null = GAME_STATE_KEY;
  private skipResumeOnCreate = false;
  private readonly beforeUnloadHandler = (): void => {
    this.persistGameState(GAME_STATE_KEY, { pruneStoryActors: true });
  };

  /** Procedural sound effects. */
  private readonly sfx = new Sound();

  // Previous-frame snapshots, for detecting events worth a sound or a banner.
  private prevBullets = 0;
  private prevKills = 0;
  private prevStatus: 'playing' | 'busted' | 'wasted' = 'playing';
  private prevMissionComplete = false;
  private prevCarHeadings: number[] = [];
  private prevCarHealth: number[] = [];
  private prevAmmoPickups = new Map<string, AmmoPickup>();
  private visualParticles: VisualParticle[] = [];
  private prevMissionId: string | null = null;
  private prevObjective = '';
  private prevTaxiMissionId: number | null = null;
  private prevTaxiStage: 'pickup' | 'dropoff' | '' = '';
  private prevServiceMissionId: number | null = null;
  private prevServiceStage: 'pickup' | 'return' | '' = '';
  private prevExplosions = 0;
  private prevDrivingCarIndex: number | null = null;
  private prevHudText = '';
  private prevBustedMessage = '';
  private prevLightAxis: 'horizontal' | 'vertical' | null = null;
  private prevCorpseSignature: string | null = null;
  private prevTouchControlsKey = '';
  private touchControlsDirty = true;
  /** Seconds until the next siren wail while a chase is on. */
  private sirenTimer = 0;
  /** Seconds left to show the announcement banner. */
  private announceRemaining = 0;
  private bannerStageKey: string | null = null;
  private storyPanelRemaining = 0;
  private storyPanelRequiresAcknowledge = false;
  private storyPanelPauseGame = false;
  private storyPanelTone: StoryPanelTone = 'brief';
  private storyPanelCinematicActive = false;
  private storyPanelBaseZoom = 1;
  private storyPanelFocusTarget: Vec2 | null = null;
  private storyPanelQueue: StoryPanelBeat[] = [];
  private pendingStoryRestart: StoryProgressSnapshot | null = null;
  /** True when the pending restart should resume from the just-saved game
   * state (e.g. a chapter-complete advance) instead of wiping progress (a
   * mission-failure retry, which intentionally resets to a clean slate). */
  private pendingStoryRestartResume = false;
  /** True when a resumed restart should rebuild the active mission/campaign fresh
   * rather than keep the restored snapshot's (often already-complete) one. */
  private freshMissionOnResume = false;
  /** Elapsed time driving the day/night cycle, and its dimming overlay. */
  private timeOfDay = 0;
  private dayNightOverlay!: Phaser.GameObjects.Rectangle;
  /** Night-time city lighting: intersection glows + a player aura. */
  private nightLights!: Phaser.GameObjects.Container;
  private nightAura!: Phaser.GameObjects.Image;
  private requestedMode: 'sandbox' | 'story' = 'sandbox';
  private mode: 'sandbox' | 'story' = 'sandbox';
  private requestedStoryProgress: StoryProgressSnapshot | null = null;
  private storyProgress: StoryProgressSnapshot | null = null;
  private storyScript: StoryScriptState | null = null;
  private storyMissionSummaryBaseline: StoryMissionSummaryBaseline | null = null;
  private storyReusableCarIndices: number[] = [];
  private storyReusablePedIndices: number[] = [];
  private despawnedStoryCarIndices = new Set<number>();
  private despawnedStoryPedIndices = new Set<number>();

  constructor() {
    super('City');
  }

  preload(): void {
    preloadGameTextures(this);
  }

  init(data: CitySceneStartData = {}): void {
    const launchStore = (() => {
      try {
        return typeof window !== 'undefined' ? window.sessionStorage : null;
      } catch {
        return null;
      }
    })();
    const launchRequest = launchStore ? loadStoryLaunchRequest(launchStore) : null;
    const launchProgress = launchStore
      ? loadStoryProgress(launchStore, STORY_LAUNCH_PROGRESS_KEY)
      : null;
    if (launchStore) {
      clearStoryProgress(launchStore, STORY_LAUNCH_PROGRESS_KEY);
      clearStoryLaunchRequest(launchStore);
    }
    this.requestedLoadKey = data.loadSaveKey ?? launchRequest?.loadSaveKey ?? GAME_STATE_KEY;
    this.skipResumeOnCreate = !!(data.skipResume ?? launchRequest?.skipResume);
    this.freshMissionOnResume = !!data.freshMissionOnResume;
    this.requestedMode = data.mode ?? launchRequest?.mode ?? this.queryRequestsStoryMode();
    this.requestedStoryProgress =
      data.storyProgress ?? launchRequest?.storyProgress ?? launchProgress ?? null;
  }

  private queryRequestsStoryMode(): 'sandbox' | 'story' {
    if (typeof window === 'undefined') return 'sandbox';
    const params = new URLSearchParams(window.location.search);
    return params.get('story') === '1' || params.get('mode') === 'story' ? 'story' : 'sandbox';
  }

  create(): void {
    // Reset per-run state so a new game (scene.restart) starts clean: the lazily
    // built sprite pools must not keep references to the previous run's objects.
    this.carSprites = [];
    this.pedSprites = [];
    this.policeSprites = [];
    this.waterTiles = [];
    this.shimmerSprites = [];
    this.explosionSprites = [];
    this.fireSprites = [];
    this.damageSprites = [];
    this.bulletSprites = [];
    this.policeBulletSprites = [];
    this.ammoSprites = [];
    this.parkedSpots = [];
    this.accumulator = 0;
    this.minimapAccumulator = MINIMAP_REFRESH_INTERVAL;
    this.saveAccumulator = 0;
    this.visualParticles = [];
    this.prevCarHeadings = [];
    this.prevCarHealth = [];
    this.prevAmmoPickups = new Map();
    this.sirenTimer = 0;
    this.timeOfDay = 0;
    this.skipPersistOnShutdown = false;
    this.prevBullets = 0;
    this.prevKills = 0;
    this.prevExplosions = 0;
    this.prevStatus = 'playing';
    this.prevMissionComplete = false;
    this.prevMissionId = null;
    this.prevObjective = '';
    this.prevTaxiMissionId = null;
    this.prevTaxiStage = '';
    this.prevServiceMissionId = null;
    this.prevServiceStage = '';
    this.prevDrivingCarIndex = null;
    this.prevHudText = '';
    this.prevBustedMessage = '';
    this.prevLightAxis = null;
    this.prevCorpseSignature = null;
    this.prevTouchControlsKey = '';
    this.touchControlsDirty = true;
    this.prevTouchConfirm = false;
    this.storyPanelRemaining = 0;
    this.storyPanelRequiresAcknowledge = false;
    this.storyPanelPauseGame = false;
    this.storyPanelQueue = [];
    this.pendingStoryRestart = null;
    this.pendingStoryRestartResume = false;
    this.storyScript = null;
    this.storyMissionSummaryBaseline = null;
    this.storyReusableCarIndices = [];
    this.storyReusablePedIndices = [];
    this.despawnedStoryCarIndices.clear();
    this.despawnedStoryPedIndices.clear();

    this.city = buildCity(CITY_SPEC);
    this.intersectionCenters = this.computeIntersectionCenters();
    const spawn = tileCenter(this.city.spec, this.city.spec.block, this.city.spec.block);

    const loadKey = this.skipResumeOnCreate ? null : this.requestedLoadKey;
    const savedState = loadKey ? loadGameState(this.store, loadKey) : null;
    const savedStoryProgress = loadKey
      ? loadStoryProgress(this.store, storyProgressSaveKey(loadKey))
      : null;
    this.mode =
      this.requestedMode === 'story' || savedStoryProgress || this.requestedStoryProgress
        ? 'story'
        : 'sandbox';
    this.storyProgress =
      this.mode === 'story'
        ? (this.requestedStoryProgress ??
          savedStoryProgress ??
          createStoryProgress(STORY_MODE_PROTOTYPE))
        : null;
    this.savedBest = Math.max(loadHighScore(this.store), savedState?.world.score.best ?? 0);
    if (this.savedBest > 0) this.savedBest = saveHighScore(this.store, this.savedBest);
    const worldOptions = this.buildWorldOptions(spawn, this.savedBest);
    if (savedState) {
      try {
        this.world = World.fromSnapshot(worldOptions, savedState.world);
        this.timeOfDay = savedState.timeOfDay;
        if (this.freshMissionOnResume) this.world.resetActiveMission(worldOptions.missions);
      } catch {
        clearGameState(this.store, loadKey ?? GAME_STATE_KEY);
        this.world = new World(worldOptions);
      }
    } else {
      this.world = new World(worldOptions);
    }
    this.freshMissionOnResume = false;
    this.prevDrivingCarIndex = this.world.drivingCarIndex;
    this.requestedLoadKey = GAME_STATE_KEY;
    this.skipResumeOnCreate = false;
    this.requestedStoryProgress = null;

    this.drawCity();
    this.createEntitySprites();
    this.setupCamera();
    this.createHud();
    this.createTouchControls();
    this.syncHudText();
    this.createMinimap();
    this.layoutHud();
    this.syncMinimap();
    this.paused = false;
    this.syncStoryScript(0);
    this.syncStoryMissionSummaryBaseline();
    this.showStoryBriefingIfNeeded();

    this.input_ = new KeyboardInput(this.input.keyboard!);
    this.touchInput_ = new TouchInput(this.input);
    this.touchAvailable = touchDeviceLikely();
    const storedTouchPreference = this.store.getItem(TOUCH_PREF_KEY);
    const preferredTouchEnabled =
      storedTouchPreference === null ? this.touchAvailable : storedTouchPreference === '1';
    this.setTouchEnabled(preferredTouchEnabled);
    if (this.touchLayout) this.touchInput_.setLayout(this.touchLayout);
    // Menu keys: P pauses/resumes, N starts a fresh game.
    const kb = this.input.keyboard!;
    this.pauseKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.storyAcknowledgeKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.newGameKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    const handleStoryAcknowledge = (): void => {
      if (this.storyPanelRequiresAcknowledge) this.acknowledgeStoryPanel();
    };
    kb.on('keydown-ENTER', handleStoryAcknowledge);
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }
    // Browsers block audio until a user gesture: unlock on the first key press.
    this.input.keyboard?.once('keydown', () => this.sfx.resume());
    const handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
      this.sfx.resume();
      const pointerType = (pointer.event as PointerEvent | undefined)?.pointerType;
      if (pointerType === 'touch') {
        this.touchAvailable = true;
        if (!this.touchEnabled && !this.touchOptedOut) this.setTouchEnabled(true);
        else this.refreshPauseTouchButton();
      }
    };
    this.input.on('pointerdown', handlePointerDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb.off('keydown-ENTER', handleStoryAcknowledge);
      this.input.off('pointerdown', handlePointerDown);
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      }
      if (!this.skipPersistOnShutdown) this.persistGameState();
      this.touchInput_?.destroy();
    });
    this.persistGameState();
  }

  private buildWorldOptions(spawn: Vec2, bestScore: number): WorldOptions {
    const traffic = this.spawnTraffic();
    const storyMissions = this.buildStoryCampaign();
    return {
      player: { pos: spawn, angle: 0, radius: PLAYER_SIZE / 2 },
      cars: traffic.cars,
      carDrivers: traffic.drivers,
      carKinds: traffic.kinds,
      carRespawnsAtTow: traffic.respawnsAtTow,
      city: this.city,
      pedestrians: this.spawnPedestrians(),
      policeSpawns: this.policeSpawnPoints(),
      ammoPickups: this.spawnAmmoPickups(),
      bounds: { width: this.city.width, height: this.city.height },
      walls: [...this.city.buildings, ...this.city.fences],
      water: this.city.water,
      sidewalks: this.city.sidewalks,
      bestScore,
      ...(this.mode === 'story'
        ? storyMissions
          ? { missions: storyMissions }
          : {}
        : { campaigns: this.buildCampaigns() }),
    };
  }

  private buildStoryCampaign(): Mission[] | null {
    if (this.mode !== 'story' || !this.storyProgress?.current) return null;
    if (this.storyProgress.current.objectiveIndex === STORY_MISSION_GROUP_SELECTION_INDEX)
      return null;
    const chapter = currentStoryChapter(STORY_MODE_PROTOTYPE, this.storyProgress);
    if (!chapter) return null;
    return compileStoryChapterRuntimeCampaign(
      chapter,
      this.storyProgress.current.missionId,
      this.storyProgress.current.objectiveIndex,
      this.storyProgress.branchOutcomes,
      summarizeStoryCityState(STORY_MODE_PROTOTYPE, this.storyProgress.branchOutcomes),
    );
  }

  private selectingStoryMission(): boolean {
    return this.storyProgress?.current?.objectiveIndex === STORY_MISSION_GROUP_SELECTION_INDEX;
  }

  private storyMissionChoices(): StoryMissionPlan[] {
    if (this.mode !== 'story' || !this.storyProgress) return [];
    return currentStoryMissionChoices(STORY_MODE_PROTOTYPE, this.storyProgress);
  }

  private storyMissionChoiceTargets(): Array<{ mission: StoryMissionPlan; target: Vec2 }> {
    return this.storyMissionChoices()
      .map((mission) => ({ mission, target: storyMissionStartPosition(mission) }))
      .filter((choice): choice is { mission: StoryMissionPlan; target: Vec2 } => !!choice.target);
  }

  private storyMissionRuntimeActive(): boolean {
    return this.mode === 'story' && !!this.storyProgress?.current && this.storyProgress.current.objectiveIndex >= 0;
  }

  private suspendStoryScript(): void {
    if (this.storyScript) this.clearActiveStoryActors();
    else {
      this.world.setStoryObjectiveProgress(null);
      this.world.setStoryDistrictStateEffects(null);
    }
  }

  private syncStoryScript(dt = 0): void {
    if (this.mode !== 'story' || !this.storyProgress?.current) {
      this.suspendStoryScript();
      return;
    }
    if (!this.storyMissionRuntimeActive()) {
      this.suspendStoryScript();
      this.syncStoryStateText();
      return;
    }

    const chapter = currentStoryChapter(STORY_MODE_PROTOTYPE, this.storyProgress);
    const mission = currentStoryMission(STORY_MODE_PROTOTYPE, this.storyProgress);
    if (!chapter || !mission) {
      this.storyScript = null;
      this.world.setStoryObjectiveProgress(null);
      this.world.setStoryDistrictStateEffects(null);
      return;
    }

    if (
      !this.storyScript ||
      this.storyScript.chapterId !== chapter.id ||
      this.storyScript.missionId !== mission.id
    ) {
      if (this.storyScript) {
        for (const actorId of Object.keys(this.storyScript.actorCarIndices)) {
          this.despawnStoryActor(actorId);
        }
        for (const actorId of Object.keys(this.storyScript.actorPedIndices)) {
          this.despawnStoryActor(actorId);
        }
      }
      this.storyScript = {
        chapterId: chapter.id,
        missionId: mission.id,
        stageIndex: 0,
        stageLabel: '',
        tailSeconds: 0,
        captureSeconds: 0,
        tailLostSeconds: 0,
        actorCarIndices: {},
        actorPedIndices: {},
        actorRouteIndices: {},
        failCounters: {},
        targetPedIndex: null,
        targetSpawned: false,
        introShown: false,
        recapShown: false,
      };
    }

    this.runStoryScript(mission, dt);
    const missionState = this.world.mission;
    if (missionState && isFailed(missionState) && !this.pendingStoryRestart) {
      this.restartCurrentStoryMission(missionState.failureReason ?? `Ran out of time.`);
    }
    this.world.setStoryObjectiveProgress({
      tailSeconds: this.storyScript.tailSeconds,
      captureSeconds: this.storyScript.captureSeconds,
    });
    this.syncStoryStateText();
  }

  private runtimeStages(runtime: StoryRuntimeScript): readonly StoryRuntimeStage[] {
    if (runtime.stages && runtime.stages.length > 0) return runtime.stages;
    return [
      {
        id: `${runtime.primaryActorId}-stage`,
        title: 'Encounter',
        actors: runtime.actors,
        failRules: runtime.failRules,
      },
    ];
  }

  /**
   * Keep a freshly-spawning story actor off the player's screen. Authored missions frequently
   * anchor their first target on the same tile that doubles as the mission-start marker, so
   * spawning at the raw anchor pops the target into view right on top of the player (instant kill /
   * no chase, and the player watches it materialise). When the requested spawn is on-screen, snap
   * it to the nearest road tile just beyond the camera viewport instead, so the actor appears
   * off-screen and has to be approached. Leaves the off-map despawn slot and already-off-screen
   * spawns untouched, so it only intervenes on the visible overlap.
   */
  private storyActorSpawnPoint(pos: Vec2): Vec2 {
    if (pos.x === STORY_ACTOR_DESPAWN_POS.x && pos.y === STORY_ACTOR_DESPAWN_POS.y) return pos;
    const player = this.world.focus;
    const minDistance = this.offscreenSpawnDistance();
    if (distance(pos, player) < minDistance) return roadStandoffPoint(this.city, player, minDistance);
    // Already off-screen: keep the authored point, but never let an actor start
    // in the river or off the map — snap those to the nearest drivable tile so
    // an authoring slip can't strand a mission target in water or out of bounds.
    if (this.spawnPointIsUnsafe(pos)) return nearestRoadTileCenter(this.city, pos) ?? pos;
    return pos;
  }

  /** Whether a would-be spawn point sits in lethal water or outside the map. */
  private spawnPointIsUnsafe(pos: Vec2): boolean {
    const { cols, rows, tile } = this.city.spec;
    const tx = Math.floor(pos.x / tile);
    const ty = Math.floor(pos.y / tile);
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return true;
    return this.city.isWater(tx, ty);
  }

  /**
   * Distance from the player, in world units, that is guaranteed to sit just past the visible
   * camera viewport in every direction (half the viewport diagonal plus a one-tile margin), so a
   * relocated story actor always spawns off-screen regardless of window size or zoom.
   */
  private offscreenSpawnDistance(): number {
    const { width, height } = this.scale.gameSize;
    const zoom = this.cameras.main.zoom || 1;
    const halfDiagonal = 0.5 * Math.hypot(width / zoom, height / zoom);
    return halfDiagonal + this.city.spec.tile;
  }

  private ensureStoryTargetCar(
    actorId: string,
    pos: Vec2,
    kind: VehicleKind = 'ambulance',
  ): number {
    const script = this.storyScript!;
    const existing = script.actorCarIndices[actorId];
    if (existing !== undefined && this.world.cars[existing]) {
      return existing;
    }
    pos = this.storyActorSpawnPoint(pos);
    const carDrivers = (this.world as unknown as { carDrivers: (TrafficAI | null)[] }).carDrivers;
    const carKinds = (this.world as unknown as { carKinds: VehicleKind[] }).carKinds;
    const taxiStates = (this.world as unknown as { taxiStates: null[] }).taxiStates;
    const carRespawnsAtTow = (this.world as unknown as { carRespawnsAtTow: boolean[] }).carRespawnsAtTow;
    const carHealth = (this.world as unknown as { carHealth: number[] }).carHealth;
    const carBurnTimers = (this.world as unknown as { carBurnTimers: number[] }).carBurnTimers;
    const carBurnByPlayer = (this.world as unknown as { carBurnByPlayer: boolean[] }).carBurnByPlayer;
    const stolenServiceVehicles = (this.world as unknown as { stolenServiceVehicles: boolean[] })
      .stolenServiceVehicles;
    const towDispatchCooldowns = (this.world as unknown as { towDispatchCooldowns: number[] })
      .towDispatchCooldowns;
    const wreckedCars = (this.world as unknown as { wreckedCars: boolean[] }).wreckedCars;
    const towedCars = (this.world as unknown as { towedCars: boolean[] }).towedCars;
    const index = this.storyReusableCarIndices.pop() ?? this.world.cars.length;
    this.despawnedStoryCarIndices.delete(index);
    const car = {
      pos,
      heading: 0,
      speed: 0,
      radius: vehicleBodySpecForKind(kind).radius,
    };
    if (index < this.world.cars.length) {
      this.world.cars[index] = car;
      carDrivers[index] = { dir: vec2(1, 0) };
      carKinds[index] = kind;
      taxiStates[index] = null;
      carRespawnsAtTow[index] = false;
      carHealth[index] = 100;
      carBurnTimers[index] = 0;
      carBurnByPlayer[index] = false;
      stolenServiceVehicles[index] = false;
      towDispatchCooldowns[index] = 0;
      wreckedCars[index] = false;
      towedCars[index] = false;
    } else {
      this.world.cars.push(car);
      carDrivers.push({ dir: vec2(1, 0) });
      carKinds.push(kind);
      taxiStates.push(null);
      carRespawnsAtTow.push(false);
      carHealth.push(100);
      carBurnTimers.push(0);
      carBurnByPlayer.push(false);
      stolenServiceVehicles.push(false);
      towDispatchCooldowns.push(0);
      wreckedCars.push(false);
      towedCars.push(false);
    }
    script.actorCarIndices[actorId] = index;
    script.actorRouteIndices[actorId] = 0;
    return index;
  }

  private ensureStoryTargetPed(
    actorId: string,
    pos: Vec2,
    opts: {
      uniform?: Pedestrian['uniform'];
      missionTarget?: boolean;
      count?: number;
      spread?: number;
      resetPosition?: boolean;
    } = {},
  ): number[] {
    const script = this.storyScript!;
    const count = Math.max(1, opts.count ?? 1);
    const spread = opts.spread ?? 20;
    pos = this.storyActorSpawnPoint(pos);
    const existing = this.storyPedIndices(actorId);
    if (existing && existing.length > 0) {
      existing.forEach((index, i) => {
        const ped = this.world.pedestrians[index];
        if (!ped) return;
        const placement = placeStorySquadMember(
          ped.pos,
          pos,
          i,
          count,
          spread,
          STORY_ACTOR_DESPAWN_POS,
          opts.resetPosition ?? false,
        );
        this.world.pedestrians[index] = {
          ...ped,
          pos: placement.pos,
          heading: placement.reset ? 0 : ped.heading,
          state: placement.reset ? 'wait' : ped.state,
          target: placement.reset ? placement.pos : ped.target,
          missionTarget: opts.missionTarget ?? false,
          uniform: opts.uniform,
          storyActorId: actorId,
          storyActorOrder: i,
          visualSeed: ped.visualSeed ?? stableVisualSeed(stringSeed(actorId), i + 1),
        };
        this.despawnedStoryPedIndices.delete(index);
      });
      return existing;
    }

    const created: number[] = [];
    for (let i = 0; i < count; i++) {
      const offsetX = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
      const ped: Pedestrian = {
        pos: vec2(pos.x + offsetX, pos.y),
        heading: 0,
        radius: 7,
        state: 'wait',
        target: vec2(pos.x + offsetX, pos.y),
        missionTarget: opts.missionTarget ?? false,
        uniform: opts.uniform,
        storyActorId: actorId,
        storyActorOrder: i,
        visualSeed: stableVisualSeed(stringSeed(actorId), i + 1),
      };
      const index = this.storyReusablePedIndices.pop() ?? this.world.pedestrians.length;
      this.despawnedStoryPedIndices.delete(index);
      if (index < this.world.pedestrians.length) {
        this.world.pedestrians[index] = ped;
      } else {
        this.world.pedestrians.push(ped);
      }
      created.push(index);
    }
    script.actorPedIndices[actorId] = created;
    script.actorRouteIndices[actorId] = 0;
    return created;
  }

  private storyPedIndices(actorId: string): number[] {
    const matches: Array<{ index: number; order: number }> = [];
    for (let i = 0; i < this.world.pedestrians.length; i++) {
      const ped = this.world.pedestrians[i];
      if (ped.storyActorId !== actorId) continue;
      matches.push({ index: i, order: ped.storyActorOrder ?? i });
    }
    matches.sort((a, b) => a.order - b.order);
    return matches.map((match) => match.index);
  }

  /**
   * Remove a mission actor from active play: park its car/pedestrians off-map and forget its
   * script indices, so a later stage or mission reusing the same actor id spawns fresh instead of
   * resuming a stale, already-handed-off actor. Used when a stage transition drops an actor
   * (e.g. the Empty Shell decoy split) and when a mission ends, so actors do not pile up frozen
   * in the world for the rest of the story run.
   */
  private despawnStoryActor(actorId: string): void {
    const script = this.storyScript;
    if (!script) return;
    const carIndex = script.actorCarIndices[actorId];
    if (carIndex !== undefined && this.world.cars[carIndex]) {
      if (this.world.drivingCarIndex === carIndex) this.world.exitVehicle();
      const carDrivers = (this.world as unknown as { carDrivers: (TrafficAI | null)[] }).carDrivers;
      const carHealth = (this.world as unknown as { carHealth: number[] }).carHealth;
      const carBurnTimers = (this.world as unknown as { carBurnTimers: number[] }).carBurnTimers;
      const carBurnByPlayer = (this.world as unknown as { carBurnByPlayer: boolean[] })
        .carBurnByPlayer;
      const towDispatchCooldowns = (this.world as unknown as { towDispatchCooldowns: number[] })
        .towDispatchCooldowns;
      const wreckedCars = (this.world as unknown as { wreckedCars: boolean[] }).wreckedCars;
      const towedCars = (this.world as unknown as { towedCars: boolean[] }).towedCars;
      this.world.cars[carIndex] = {
        ...this.world.cars[carIndex]!,
        pos: STORY_ACTOR_DESPAWN_POS,
        speed: 0,
      };
      carDrivers[carIndex] = null;
      carHealth[carIndex] = 100;
      carBurnTimers[carIndex] = 0;
      carBurnByPlayer[carIndex] = false;
      towDispatchCooldowns[carIndex] = 0;
      wreckedCars[carIndex] = false;
      towedCars[carIndex] = false;
      this.despawnedStoryCarIndices.add(carIndex);
      if (!this.storyReusableCarIndices.includes(carIndex)) this.storyReusableCarIndices.push(carIndex);
    }
    delete script.actorCarIndices[actorId];

    const pedIndices = this.storyPedIndices(actorId);
    if (pedIndices) {
      for (const idx of pedIndices) {
        if (!this.world.pedestrians[idx]) continue;
        this.world.pedestrians[idx] = {
          ...this.world.pedestrians[idx],
          pos: STORY_ACTOR_DESPAWN_POS,
          target: STORY_ACTOR_DESPAWN_POS,
          state: 'wait',
          missionTarget: false,
          storyActorId: undefined,
          storyActorOrder: undefined,
        };
        this.despawnedStoryPedIndices.add(idx);
        if (!this.storyReusablePedIndices.includes(idx)) this.storyReusablePedIndices.push(idx);
      }
    }
    delete script.actorPedIndices[actorId];
    delete script.actorRouteIndices[actorId];
  }

  private clearActiveStoryActors(): void {
    if (!this.storyScript) return;
    for (const actorId of Object.keys(this.storyScript.actorCarIndices)) this.despawnStoryActor(actorId);
    for (const actorId of Object.keys(this.storyScript.actorPedIndices)) this.despawnStoryActor(actorId);
    this.storyScript = null;
    this.world.setStoryObjectiveProgress(null);
    this.world.setStoryDistrictStateEffects(null);
  }

  private storyTargetCarDisabled(carIndex: number): boolean {
    const wreckedCars = (this.world as unknown as { wreckedCars: boolean[] }).wreckedCars;
    return !!wreckedCars[carIndex] || this.world.carIsBurning(carIndex);
  }

  private runVehicleRouteActor(
    actor: VehicleRouteActorScript,
    dt: number,
    locked = false,
  ): { carIndex: number; routeIndex: number; disabled: boolean } {
    const script = this.storyScript!;
    const first = actor.route[0] ?? vec2(0, 0);
    const carIndex = this.ensureStoryTargetCar(actor.actorId, first, actor.vehicleKind);
    const routeIndex = script.actorRouteIndices[actor.actorId] ?? 0;
    const car = this.world.cars[carIndex]!;
    const disabled = this.storyTargetCarDisabled(carIndex);
    if (disabled || locked) {
      this.world.cars[carIndex] = { ...car, speed: 0 };
      return { carIndex, routeIndex, disabled };
    }
    const step = advanceVehicleRouteActor(actor, car.pos, routeIndex, dt, car.heading);
    const nextPos = this.world.keepNpcCarOutOfWater(car.pos, step.pos);
    const blockedByWater =
      nextPos.x === car.pos.x &&
      nextPos.y === car.pos.y &&
      (step.pos.x !== car.pos.x || step.pos.y !== car.pos.y);
    this.world.cars[carIndex] = {
      ...car,
      heading: step.heading,
      speed: blockedByWater ? 0 : step.speed,
      pos: nextPos,
    };
    script.actorRouteIndices[actor.actorId] = blockedByWater ? routeIndex : step.routeIndex;
    return {
      carIndex,
      routeIndex: blockedByWater ? routeIndex : step.routeIndex,
      disabled,
    };
  }

  private runPedestrianRouteActor(
    actor: PedestrianRouteActorScript,
    dt: number,
  ): { pedIndex: number; routeIndex: number } {
    const script = this.storyScript!;
    const first = actor.route[0] ?? vec2(0, 0);
    const pedIndex = this.ensureStoryTargetPed(actor.actorId, first, {
      uniform: actor.uniform,
    })[0]!;
    const ped = this.world.pedestrians[pedIndex]!;
    const routeIndex = script.actorRouteIndices[actor.actorId] ?? 0;
    const step = advancePedestrianRouteActor(actor, ped.pos, routeIndex, dt, ped.heading);
    this.world.pedestrians[pedIndex] = {
      ...ped,
      pos: step.pos,
      heading: step.heading,
      state: 'wander',
      target: actor.route[Math.min(step.routeIndex, actor.route.length - 1)] ?? step.pos,
      uniform: actor.uniform,
    };
    script.actorRouteIndices[actor.actorId] = step.routeIndex;
    return { pedIndex, routeIndex: step.routeIndex };
  }

  private runPedestrianSquadActor(actor: PedestrianSquadActorScript): number[] {
    const indices = this.ensureStoryTargetPed(actor.actorId, actor.center, {
      count: actor.count,
      spread: actor.spread,
      uniform: actor.uniform,
      missionTarget: actor.missionTargets,
    });
    if (actor.missionTargets) {
      for (const index of indices) {
        const ped = this.world.pedestrians[index];
        if (!ped || ped.missionTarget) continue;
        this.world.pedestrians[index] = { ...ped, missionTarget: true };
      }
    }
    return indices;
  }

  private restartCurrentStoryMission(failureText: string): void {
    if (!this.storyProgress?.current) return;
    const restart: StoryProgressSnapshot = {
      ...this.storyProgress,
      current: { ...this.storyProgress.current, objectiveIndex: 0 },
    };
    saveGameState(
      this.store,
      {
        world: this.snapshotForPersist({ pruneStoryActors: true }),
        timeOfDay: this.timeOfDay,
      },
      GAME_STATE_KEY,
    );
    saveStoryProgress(this.store, restart, storyProgressSaveKey(GAME_STATE_KEY));
    this.storyProgress = restart;
    this.showStoryPanel(
      `MISSION FAILED\n\n${failureText}\n\nRetrying ${currentStoryMission(STORY_MODE_PROTOTYPE, restart)?.title ?? 'mission'}...`,
      2.6,
      'danger',
    );
    this.pendingStoryRestart = restart;
    this.pendingStoryRestartResume = true;
  }

  private activeStoryStage(runtime: StoryRuntimeScript): StoryRuntimeStage | null {
    const stages = this.runtimeStages(runtime);
    if (stages.length === 0) return null;
    const safeIndex = Math.max(0, Math.min(stages.length - 1, this.storyScript?.stageIndex ?? 0));
    return stages[safeIndex] ?? null;
  }

  private runStoryScript(mission: StoryMissionPlan, dt: number): void {
    const script = this.storyScript!;
    const runtime = mission.prototypeScript;
    if (!runtime) {
      script.tailSeconds = 0;
      script.captureSeconds = 0;
      script.stageLabel = '';
      this.world.setStoryDistrictStateEffects(null);
      return;
    }

    const stage = this.activeStoryStage(runtime);
    if (!stage) {
      this.world.setStoryDistrictStateEffects(null);
      return;
    }
    script.stageLabel = stage.districtState?.label ?? stage.title;
    this.world.setStoryDistrictStateEffects(stage.districtState ?? null);

    const stagePrimaryActorId = stage.primaryActorId ?? runtime.primaryActorId;
    const liveObjective = this.world.missionObjective;
    const actorPositions: Record<string, Vec2 | null> = {};
    const actorVehicleHealth: Record<string, number | null> = {};
    const actorVehicleDisabled: Record<string, boolean> = {};
    const routeIndices: Record<string, number> = {};
    let primaryVehicleActor: VehicleRouteActorScript | null = null;
    let primaryVehiclePos: Vec2 | null = null;
    let primaryVehicleDisabled = false;
    const carHealth = (this.world as unknown as { carHealth: number[] }).carHealth;

    for (const actor of stage.actors) {
      if (actor.kind === 'vehicleRoute') {
        const state = this.runVehicleRouteActor(
          actor,
          dt,
          actor.actorId === stagePrimaryActorId && script.captureSeconds > 0,
        );
        const pos = this.world.cars[state.carIndex]!.pos;
        actorPositions[actor.actorId] = pos;
        actorVehicleHealth[actor.actorId] = carHealth[state.carIndex] ?? null;
        actorVehicleDisabled[actor.actorId] = state.disabled;
        routeIndices[actor.actorId] = normalizeRouteCompletion(
          state.routeIndex,
          actor.route.length,
        );
        if (actor.actorId === stagePrimaryActorId) {
          primaryVehicleActor = actor;
          primaryVehiclePos = pos;
          primaryVehicleDisabled = state.disabled;
        }
        continue;
      }
      if (actor.kind === 'pedestrianRoute') {
        const state = this.runPedestrianRouteActor(actor, dt);
        actorPositions[actor.actorId] = this.world.pedestrians[state.pedIndex]?.pos ?? null;
        actorVehicleHealth[actor.actorId] = null;
        actorVehicleDisabled[actor.actorId] = false;
        routeIndices[actor.actorId] = normalizeRouteCompletion(
          state.routeIndex,
          actor.route.length,
        );
        continue;
      }
      if (actor.missionTargets && liveObjective?.kind !== 'eliminate') {
        this.ensureStoryTargetPed(actor.actorId, STORY_ACTOR_DESPAWN_POS, {
          count: actor.count,
          spread: actor.spread,
          uniform: actor.uniform,
          missionTarget: false,
          resetPosition: true,
        });
        actorPositions[actor.actorId] = null;
        actorVehicleHealth[actor.actorId] = null;
        actorVehicleDisabled[actor.actorId] = false;
        routeIndices[actor.actorId] = 0;
        continue;
      }
      const indices = this.runPedestrianSquadActor(actor);
      actorPositions[actor.actorId] =
        indices.length > 0 ? (this.world.pedestrians[indices[0]]?.pos ?? null) : null;
      actorVehicleHealth[actor.actorId] = null;
      actorVehicleDisabled[actor.actorId] = false;
      routeIndices[actor.actorId] = 0;
    }

    let progress = {
      tailSeconds: script.tailSeconds,
      captureSeconds: script.captureSeconds,
      tailLostSeconds: script.tailLostSeconds,
      failCounters: script.failCounters,
    };

    if (primaryVehicleActor && primaryVehiclePos) {
      progress = updateTailCaptureProgress(
        primaryVehicleActor,
        progress,
        {
          playerPos: this.world.focus,
          playerSpeed: this.world.drivingCar?.speed ?? 0,
          wantedStars: this.world.wantedStars,
          dt,
          actorPositions,
          actorVehicleHealth,
          actorVehicleDisabled,
        },
        primaryVehiclePos,
        primaryVehicleDisabled,
      );
      if (progress.captureSeconds > 0 && !primaryVehicleDisabled) {
        const primaryCarIndex = script.actorCarIndices[stagePrimaryActorId];
        if (primaryCarIndex !== undefined && this.world.cars[primaryCarIndex]) {
          this.world.cars[primaryCarIndex] = { ...this.world.cars[primaryCarIndex]!, speed: 0 };
        }
      }
    } else {
      progress = { ...progress, tailSeconds: 0, captureSeconds: 0, tailLostSeconds: 0 };
    }

    const fail = applyStoryFailRules(stage.failRules ?? runtime.failRules, progress, {
      playerPos: this.world.focus,
      playerSpeed: this.world.drivingCar?.speed ?? 0,
      wantedStars: this.world.wantedStars,
      dt,
      actorPositions,
      actorVehicleHealth,
      actorVehicleDisabled,
    });
    script.tailSeconds = fail.progress.tailSeconds;
    script.captureSeconds = fail.progress.captureSeconds;
    script.tailLostSeconds = fail.progress.tailLostSeconds;
    script.failCounters = fail.progress.failCounters;
    if (fail.failureText) this.restartCurrentStoryMission(fail.failureText);

    const storyObjectiveIndex = this.world.mission
      ? storyObjectiveIndexFromRuntime(mission, this.world.mission.currentIndex)
      : null;
    const routeProgress =
      this.world.mission?.objectiveState?.kind === 'route'
        ? this.world.mission.objectiveState.completed
        : 0;
    if (
      isStageTransitionMet(stage.nextWhen, {
        progress: fail.progress,
        routeIndices,
        storyObjectiveIndex,
        routeProgress,
      })
    ) {
      const stages = this.runtimeStages(runtime);
      if (script.stageIndex < stages.length - 1) {
        const nextStage = stages[script.stageIndex + 1]!;
        const nextActorIds = new Set(nextStage.actors.map((nextActor) => nextActor.actorId));
        for (const actor of stage.actors) {
          if (!nextActorIds.has(actor.actorId)) this.despawnStoryActor(actor.actorId);
        }
        // An actor that persists into the next stage starts that stage's route
        // fresh: the new stage's `route` array is a separately authored path,
        // not a continuation of the old one's waypoint indices. Without this,
        // a leftover index from the previous stage's (often differently-sized)
        // route can land past the end of, or partway into, the new route,
        // silently skipping its earlier waypoints (or freezing immediately if
        // the leftover index already reads as "at the end").
        for (const actorId of nextActorIds) {
          script.actorRouteIndices[actorId] = 0;
        }
        script.stageIndex += 1;
        script.failCounters = {};
        if (!this.shouldSuppressStageShiftBanner(mission.id, nextStage.id)) {
          this.showBanner(
            `STAGE SHIFT\n${nextStage.title}\n${nextStage.districtState?.summary ?? 'The city is changing around the mission.'}`,
            { stageBound: true },
          );
        }
      }
    }
  }

  private persistGameState(key = GAME_STATE_KEY, options: { pruneStoryActors?: boolean } = {}): void {
    if (!this.world) return;
    saveGameState(
      this.store,
      {
        world: this.snapshotForPersist(options),
        timeOfDay: this.timeOfDay,
      },
      key,
    );
    if (this.mode === 'story' && this.storyProgress) {
      saveStoryProgress(
        this.store,
        {
          storyId: this.storyProgress.storyId,
          current: this.storyProgress.current,
          unlockedChapterIds: this.storyProgress.unlockedChapterIds,
          completedChapterIds: this.storyProgress.completedChapterIds,
          completedMissionIds: this.storyProgress.completedMissionIds,
          branchOutcomes: this.storyProgress.branchOutcomes,
        },
        storyProgressSaveKey(key),
      );
    }
    if (key === GAME_STATE_KEY) this.saveAccumulator = 0;
  }

  private snapshotForPersist(options: { pruneStoryActors?: boolean } = {}): WorldSnapshot {
    const snapshot = this.world.snapshot();
    return options.pruneStoryActors ? this.pruneStoryActorsFromSnapshot(snapshot) : snapshot;
  }

  private pruneStoryActorsFromSnapshot(snapshot: WorldSnapshot): WorldSnapshot {
    const storyCarIndices = new Set(
      Object.values(this.storyScript?.actorCarIndices ?? {}).filter((index) => Number.isInteger(index)),
    );
    for (const index of this.despawnedStoryCarIndices) storyCarIndices.add(index);
    const keepCarIndex = (index: number): boolean => {
      const car = snapshot.cars[index];
      return (
        !storyCarIndices.has(index) &&
        car?.pos.x !== STORY_ACTOR_DESPAWN_POS.x &&
        car?.pos.y !== STORY_ACTOR_DESPAWN_POS.y
      );
    };
    const carIndexRemap = new Map<number, number>();
    let nextCarIndex = 0;
    for (let i = 0; i < snapshot.cars.length; i++) {
      if (!keepCarIndex(i)) continue;
      carIndexRemap.set(i, nextCarIndex);
      nextCarIndex += 1;
    }
    const keepCar = (_: unknown, index: number): boolean => keepCarIndex(index);
    snapshot.cars = snapshot.cars.filter(keepCar);
    snapshot.wreckedCars = snapshot.wreckedCars.filter(keepCar);
    snapshot.towedCars = snapshot.towedCars.filter(keepCar);
    snapshot.carDrivers = snapshot.carDrivers.filter(keepCar);
    snapshot.carKinds = snapshot.carKinds.filter(keepCar);
    snapshot.taxiStates = snapshot.taxiStates.filter(keepCar);
    snapshot.carRespawnsAtTow = snapshot.carRespawnsAtTow.filter(keepCar);
    snapshot.carHealth = snapshot.carHealth.filter(keepCar);
    snapshot.carBurnTimers = snapshot.carBurnTimers.filter(keepCar);
    snapshot.carBurnByPlayer = snapshot.carBurnByPlayer.filter(keepCar);
    snapshot.stolenServiceVehicles = snapshot.stolenServiceVehicles.filter(keepCar);
    snapshot.towDispatchCooldowns = snapshot.towDispatchCooldowns.filter(keepCar);
    snapshot.drivingCarIndex =
      snapshot.drivingCarIndex === null ? null : (carIndexRemap.get(snapshot.drivingCarIndex) ?? null);
    snapshot.tows = snapshot.tows.flatMap((tow) => {
      const targetCar = carIndexRemap.get(tow.targetCar);
      return targetCar === undefined ? [] : [{ ...tow, targetCar }];
    });
    if (snapshot.playerServiceMission?.kind === 'tow') {
      const targetCar = carIndexRemap.get(snapshot.playerServiceMission.targetCar);
      snapshot.playerServiceMission =
        targetCar === undefined ? null : { ...snapshot.playerServiceMission, targetCar };
    }
    snapshot.vehicleImpactCooldowns = [];
    const storyPedIndices = new Set(
      Object.values(this.storyScript?.actorPedIndices ?? {})
        .flat()
        .filter((index) => Number.isInteger(index)),
    );
    for (const index of this.despawnedStoryPedIndices) storyPedIndices.add(index);
    snapshot.pedestrians = snapshot.pedestrians
      .filter(
        (ped, index) =>
          !ped.storyActorId &&
          !storyPedIndices.has(index) &&
          ped.pos.x !== STORY_ACTOR_DESPAWN_POS.x &&
          ped.pos.y !== STORY_ACTOR_DESPAWN_POS.y,
      )
      .map((ped) => ({
        ...ped,
        missionTarget: false,
        storyActorId: undefined,
        storyActorOrder: undefined,
      }));
    return snapshot;
  }

  /** A lively mix of cars parked in the marked bays and cars driven by NPC traffic. */
  private spawnTraffic(): {
    cars: Car[];
    drivers: (TrafficAI | null)[];
    kinds: VehicleKind[];
    respawnsAtTow: boolean[];
  } {
    const { spec } = this.city;
    const { block, cols, rows } = spec;
    const roadWidth = Math.max(1, Math.min(block, spec.roadWidth ?? 1));
    const lanesPerDirection = Math.max(1, Math.floor(roadWidth / 2));
    const cars: Car[] = [];
    const drivers: (TrafficAI | null)[] = [];
    const kinds: VehicleKind[] = [];
    const respawnsAtTow: boolean[] = [];
    const parkedKind = (seed: number): VehicleKind =>
      PARKED_TRAFFIC_MIX[seed % PARKED_TRAFFIC_MIX.length] ?? 'car';
    const movingKind = (seed: number): VehicleKind =>
      MOVING_TRAFFIC_MIX[seed % MOVING_TRAFFIC_MIX.length] ?? 'car';
    const bodyRadius = (kind: VehicleKind): number => vehicleBodySpecForKind(kind).radius;

    const pushTrafficCar = (
      car: Car,
      driver: TrafficAI | null,
      kind: VehicleKind,
      options: { respawnsAtTow?: boolean } = {},
    ): void => {
      cars.push(car);
      drivers.push(driver);
      kinds.push(kind);
      respawnsAtTow.push(options.respawnsAtTow ?? true);
    };

    const facilityVehiclePos = (facility: Facility, slot = 1): Vec2 => {
      const verticalRoad =
        facility.roadSpawn.x < facility.building.x ||
        facility.roadSpawn.x > facility.building.x + facility.building.w;
      const offset = slot * SERVICE_SPAWN_SPACING;
      const pos = verticalRoad
        ? vec2(facility.roadSpawn.x, facility.roadSpawn.y + offset)
        : vec2(facility.roadSpawn.x + offset, facility.roadSpawn.y);
      const { tx, ty } = tileCoord(spec, pos);
      const center = tileCenter(spec, tx, ty);
      return verticalRoad ? vec2(center.x, pos.y) : vec2(pos.x, center.y);
    };

    const pushFacilityVehicle = (facility: Facility, kind: VehicleKind): void => {
      const pos = facilityVehiclePos(facility);
      const { tx, ty } = tileCoord(spec, pos);
      const dir = openDirections(this.city, tx, ty)[0] ?? vec2(1, 0);
      pushTrafficCar(
        { pos, heading: Math.atan2(dir.y, dir.x), speed: 0, radius: bodyRadius(kind) },
        null,
        kind,
        { respawnsAtTow: false },
      );
    };

    // Parked cars fill a spread-out subset of the kerbside bays (right against
    // the sidewalks), kept to a budget so the streets — and the collision
    // workload — stay sensible.
    const spots = this.city.parkingSpots;
    const stride = Math.max(1, Math.ceil(spots.length / PARKED_CAR_BUDGET));
    spots.forEach((spot, i) => {
      if (i % stride !== 0) return;
      const kind = parkedKind(i);
      pushTrafficCar(
        { pos: spot.pos, heading: spot.heading, speed: 0, radius: bodyRadius(kind) },
        null,
        kind,
      );
      this.parkedSpots.push(spot);
    });

    // Dedicated taxis start from the two taxi depots so they read as part of
    // the city rather than random yellow traffic.
    for (const depot of this.city.facilities.filter((facility) => facility.kind === 'taxiDepot')) {
      const verticalRoad =
        depot.roadSpawn.x < depot.building.x ||
        depot.roadSpawn.x > depot.building.x + depot.building.w;
      const depotPos = verticalRoad
        ? vec2(
            tileCenter(
              spec,
              ...(Object.values(tileCoord(spec, depot.roadSpawn)) as [number, number]),
            ).x,
            depot.roadSpawn.y,
          )
        : vec2(
            depot.roadSpawn.x,
            tileCenter(
              spec,
              ...(Object.values(tileCoord(spec, depot.roadSpawn)) as [number, number]),
            ).y,
          );
      const { tx, ty } = tileCoord(spec, depotPos);
      const dir = openDirections(this.city, tx, ty)[0] ?? vec2(1, 0);
      pushTrafficCar(
        { pos: depotPos, heading: Math.atan2(dir.y, dir.x), speed: 0, radius: bodyRadius('taxi') },
        { dir },
        'taxi',
      );
    }

    for (const station of this.city.facilities.filter(
      (facility) => facility.kind === 'policeStation',
    )) {
      pushFacilityVehicle(station, 'police');
    }
    for (const hospital of this.city.facilities.filter(
      (facility) => facility.kind === 'hospital',
    )) {
      pushFacilityVehicle(hospital, 'ambulance');
    }
    for (const yard of this.city.facilities.filter((facility) => facility.kind === 'towYard')) {
      pushFacilityVehicle(yard, 'tow');
    }

    // NPC cars use both directions and both lanes of the wider streets, spread
    // across vertical and horizontal corridors so the traffic system exercises
    // lane changes instead of bunching into a single file.
    let n = 0;
    for (let tx = block; tx < cols; tx += block) {
      const southLane = lanesPerDirection - 1 - (n % lanesPerDirection);
      const northLane = roadWidth - lanesPerDirection + (n % lanesPerDirection);
      const southTx = tx + southLane;
      const northTx = tx + northLane;
      const southTy = block * 2;
      const northTy = Math.max(block * 2, rows - block * 2 - 1);
      if (southTx < cols && !this.city.isWater(southTx, southTy)) {
        const start = tileCenter(spec, southTx, southTy);
        const kind = n % 6 === 0 ? 'taxi' : movingKind(n);
        pushTrafficCar(
          { pos: start, heading: Math.PI / 2, speed: 0, radius: bodyRadius(kind) },
          { dir: vec2(0, 1) },
          kind,
        );
      }
      if (northTx < cols && !this.city.isWater(northTx, northTy)) {
        const start = tileCenter(spec, northTx, northTy);
        const kind = n % 7 === 0 ? 'taxi' : movingKind(n + 3);
        pushTrafficCar(
          { pos: start, heading: -Math.PI / 2, speed: 0, radius: bodyRadius(kind) },
          { dir: vec2(0, -1) },
          kind,
        );
      }
      n++;
    }
    for (let ty = block; ty < rows; ty += block) {
      const eastLane = roadWidth - lanesPerDirection + (n % lanesPerDirection);
      const westLane = lanesPerDirection - 1 - (n % lanesPerDirection);
      const eastTx = block * 2;
      const westTx = Math.max(block * 2, cols - block * 2 - 1);
      const eastTy = ty + eastLane;
      const westTy = ty + westLane;
      if (eastTy < rows && !this.city.isWater(eastTx, eastTy)) {
        const start = tileCenter(spec, eastTx, eastTy);
        const kind = n % 6 === 0 ? 'taxi' : movingKind(n + 1);
        pushTrafficCar(
          { pos: start, heading: 0, speed: 0, radius: bodyRadius(kind) },
          { dir: vec2(1, 0) },
          kind,
        );
      }
      if (westTy < rows && !this.city.isWater(westTx, westTy)) {
        const start = tileCenter(spec, westTx, westTy);
        const kind = n % 7 === 0 ? 'taxi' : movingKind(n + 4);
        pushTrafficCar(
          { pos: start, heading: Math.PI, speed: 0, radius: bodyRadius(kind) },
          { dir: vec2(-1, 0) },
          kind,
        );
      }
      n++;
    }
    return { cars, drivers, kinds, respawnsAtTow };
  }

  /** Scatter pedestrians along the sidewalks so they start off the road. */
  private spawnPedestrians(): Pedestrian[] {
    const peds: Pedestrian[] = [];
    this.city.sidewalks.forEach((s, i) => {
      if (i % PEDESTRIAN_SIDEWALK_STRIDE !== 0) return; // a denser but still manageable scattering across the city
      const pos = vec2(s.x + s.w / 2, s.y + s.h / 2);
          peds.push({
            pos,
            heading: 0,
            radius: PED_SIZE / 2,
            state: 'wander',
            target: pos,
            visualSeed: stableVisualSeed(i + 1, Math.round(pos.x), Math.round(pos.y)),
          });
    });
    return peds;
  }

  /** Police emerge on foot from the police station's doorstep (falling back to
   * the map corners only on atypical maps without a station). */
  private policeSpawnPoints(): Vec2[] {
    const stations = this.city.facilities
      .filter((f) => f.kind === 'policeStation')
      .map((f) => f.spawn);
    if (stations.length > 0) return stations;
    const { width, height } = this.city;
    return [
      vec2(40, 40),
      vec2(width - 40, 40),
      vec2(40, height - 40),
      vec2(width - 40, height - 40),
    ];
  }

  /** Ammo crates sit at road intersections around town. */
  private spawnAmmoPickups(): AmmoPickup[] {
    const { spec } = this.city;
    const pickups: AmmoPickup[] = [];
    for (let tx = spec.block * 2; tx < spec.cols; tx += spec.block * 3) {
      for (let ty = spec.block * 2; ty < spec.rows; ty += spec.block * 3) {
        if (this.city.isWater(tx, ty)) continue; // no crates in the river
        pickups.push({ pos: tileCenter(spec, tx, ty), amount: 18 });
      }
    }
    return pickups;
  }

  /** A pool of short campaigns. When one is finished a random other begins, so
   * the action never stops. Objective text spells out exactly what to do. */
  private buildCampaigns() {
    return buildSandboxCampaigns(this.city);
  }

  private drawCity(): void {
    const { width, height, spec } = this.city;
    const roadWidth = Math.max(1, Math.min(spec.block, spec.roadWidth ?? 1));
    this.cameras.main.setBackgroundColor(COLORS.roadShadow);

    this.add
      .tileSprite(0, 0, width, height, TILE.road.texture, TILE.road.frame)
      .setOrigin(0)
      .setDepth(-0.2);

    // Lane markings between every lane, with a stronger divider between the two directions.
    const lines = this.add.graphics();
    for (let tx = 0; tx < spec.cols; tx += spec.block) {
      for (let lane = 1; lane < roadWidth; lane++) {
        const divider = (tx + lane) * spec.tile;
        lines.lineStyle(2, COLORS.roadLine, lane === roadWidth / 2 ? 0.85 : 0.45);
        lines.lineBetween(divider, 0, divider, height);
      }
    }
    for (let ty = 0; ty < spec.rows; ty += spec.block) {
      for (let lane = 1; lane < roadWidth; lane++) {
        const divider = (ty + lane) * spec.tile;
        lines.lineStyle(2, COLORS.roadLine, lane === roadWidth / 2 ? 0.85 : 0.45);
        lines.lineBetween(0, divider, width, divider);
      }
    }

    // Water and bridges cover the road/markings where the river cuts across.
    this.drawTerrain();
    // Sidewalks, crosswalks, and parking bays.
    this.drawStreets();

    // Buildings with rooftops and lit windows for a denser city look.
    const g = this.add.graphics();
    const emblemG = this.add.graphics().setDepth(1.2);
    const shades = [0x3f4654, 0x4b5563, 0x434b59, 0x515b6b, 0x3a4150];
    const facilities = new Map(this.city.facilities.map((f) => [f.buildingIndex, f]));
    this.city.buildings.forEach((b, i) => {
      const facility = facilities.get(i);
      const bodyColor =
        facility?.kind === 'policeStation'
          ? COLORS.policeBuilding
          : facility?.kind === 'hospital'
            ? COLORS.hospitalBuilding
            : facility?.kind === 'towYard'
              ? COLORS.towBuilding
              : facility?.kind === 'taxiDepot'
                ? COLORS.taxiBuilding
                : shades[i % shades.length];
      const roofColor =
        facility?.kind === 'policeStation'
          ? COLORS.policeRoof
          : facility?.kind === 'hospital'
            ? COLORS.hospitalRoof
            : facility?.kind === 'towYard'
              ? COLORS.towRoof
              : facility?.kind === 'taxiDepot'
                ? COLORS.taxiRoof
                : COLORS.buildingRoof;

      this.add
        .rectangle(b.x + 8 + b.w / 2, b.y + 10 + b.h / 2, b.w, b.h, COLORS.roadShadow, 0.22)
        .setDepth(0.6)
        .setOrigin(0.5);
      this.add
        .tileSprite(b.x, b.y, b.w, b.h, TILE.building.texture, TILE.building.frame)
        .setOrigin(0)
        .setDepth(0.8)
        .setTint(bodyColor);
      this.add
        .tileSprite(b.x + 5, b.y + 5, b.w - 10, b.h - 10, TILE.roof.texture, TILE.roof.frame)
        .setOrigin(0)
        .setDepth(0.9)
        .setTint(roofColor);
      g.lineStyle(2, COLORS.buildingEdge, 1);
      g.strokeRect(b.x, b.y, b.w, b.h);

      const sparkle = this.add
        .image(b.x + b.w - 18, b.y + 18, TILE.sparkle.texture, TILE.sparkle.frame)
        .setDepth(1.1)
        .setScale(0.34)
        .setTint(facility ? COLORS.window : roofColor);
      this.shimmerSprites.push(sparkle);

      if (b.w >= 70 && b.h >= 70) {
        this.add
          .image(b.x + b.w - 21, b.y + 19, TILE.roof.texture, TILE.roof.frame)
          .setDepth(1.05)
          .setScale(0.28)
          .setTint(blendColor(roofColor, COLORS.buildingEdge, 0.35));
        this.add
          .image(b.x + 24, b.y + b.h - 22, TILE.roof.texture, TILE.roof.frame)
          .setDepth(1.05)
          .setScale(0.33)
          .setTint(blendColor(roofColor, COLORS.buildingEdge, 0.42));
      }

      if (facility) {
        this.drawFacilityEmblem(emblemG, facility.kind, b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h));
      }
    });

    for (const facility of this.city.facilities) {
      this.drawFacilityGarage(g, facility);
    }
  }

  private drawFacilityGarage(g: Phaser.GameObjects.Graphics, facility: Facility): void {
    const b = facility.building;
    const road = facility.roadSpawn;
    const doorColor =
      facility.kind === 'hospital'
        ? 0xdc2626
        : facility.kind === 'towYard'
          ? 0x111114
          : facility.kind === 'policeStation'
            ? 0xbfdbfe
            : 0x111114;
    const doorSpan = Math.min(42, Math.max(26, Math.min(b.w, b.h) * 0.45));
    const doorDepth = 12;
    const apronSpan = doorSpan + 14;
    const clamp = (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value));

    if (road.x < b.x || road.x > b.x + b.w) {
      const side = road.x < b.x ? -1 : 1;
      const edgeX = side < 0 ? b.x : b.x + b.w;
      const cy = clamp(road.y, b.y + doorSpan / 2, b.y + b.h - doorSpan / 2);
      const apronX = Math.min(edgeX, road.x);
      const apronW = Math.max(doorDepth, Math.abs(edgeX - road.x));
      g.fillStyle(COLORS.garageApron, 0.92);
      g.fillRect(apronX, cy - apronSpan / 2, apronW, apronSpan);
      g.lineStyle(2, COLORS.garageStripe, 0.55);
      g.lineBetween(road.x, cy, edgeX, cy);
      const doorX = side < 0 ? b.x - doorDepth : b.x + b.w;
      g.fillStyle(COLORS.garageDoor, 1);
      g.fillRect(doorX, cy - doorSpan / 2, doorDepth, doorSpan);
      g.fillStyle(doorColor, 1);
      g.fillRect(doorX, cy - doorSpan / 2, doorDepth, 5);
      g.lineStyle(2, COLORS.buildingEdge, 1);
      g.strokeRect(doorX, cy - doorSpan / 2, doorDepth, doorSpan);
      return;
    }

    const side = road.y < b.y ? -1 : 1;
    const edgeY = side < 0 ? b.y : b.y + b.h;
    const cx = clamp(road.x, b.x + doorSpan / 2, b.x + b.w - doorSpan / 2);
    const apronY = Math.min(edgeY, road.y);
    const apronH = Math.max(doorDepth, Math.abs(edgeY - road.y));
    g.fillStyle(COLORS.garageApron, 0.92);
    g.fillRect(cx - apronSpan / 2, apronY, apronSpan, apronH);
    g.lineStyle(2, COLORS.garageStripe, 0.55);
    g.lineBetween(cx, road.y, cx, edgeY);
    const doorY = side < 0 ? b.y - doorDepth : b.y + b.h;
    g.fillStyle(COLORS.garageDoor, 1);
    g.fillRect(cx - doorSpan / 2, doorY, doorSpan, doorDepth);
    g.fillStyle(doorColor, 1);
    g.fillRect(cx - doorSpan / 2, doorY, doorSpan, 5);
    g.lineStyle(2, COLORS.buildingEdge, 1);
    g.strokeRect(cx - doorSpan / 2, doorY, doorSpan, doorDepth);
  }

  /** A clear rooftop emblem so each service building's purpose reads at a glance:
   * red medical cross (hospital), white badge star (police), amber hazard chevrons
   * (tow yard), black/yellow checker (taxi depot). Drawn on a layer above the roofs. */
  private drawFacilityEmblem(
    g: Phaser.GameObjects.Graphics,
    kind: Facility['kind'],
    cx: number,
    cy: number,
    size: number,
  ): void {
    const panel = Math.min(56, Math.max(28, size * 0.5));
    const half = panel / 2;
    const drawPanel = (fill: number): void => {
      g.fillStyle(fill, 0.96);
      g.fillRoundedRect(cx - half, cy - half, panel, panel, 6);
      g.lineStyle(2, COLORS.buildingEdge, 0.9);
      g.strokeRoundedRect(cx - half, cy - half, panel, panel, 6);
    };
    if (kind === 'hospital') {
      drawPanel(0xf8fafc);
      const arm = panel * 0.16;
      const len = panel * 0.66;
      g.fillStyle(0xdc2626, 1);
      g.fillRect(cx - arm, cy - len / 2, arm * 2, len);
      g.fillRect(cx - len / 2, cy - arm, len, arm * 2);
    } else if (kind === 'policeStation') {
      drawPanel(0x1d4ed8);
      this.drawStar(g, cx, cy, 5, panel * 0.42, panel * 0.18, 0xffffff);
    } else if (kind === 'towYard') {
      drawPanel(0xf59e0b);
      const hw = panel * 0.3;
      const hh = panel * 0.16;
      const t = panel * 0.13;
      for (let k = 0; k < 3; k++) {
        this.drawChevron(g, cx, cy - panel * 0.22 + k * (hh + t * 0.5), hw, hh, t, 0x1c1917);
      }
    } else if (kind === 'taxiDepot') {
      drawPanel(0xfacc15);
      const cell = panel / 6;
      g.fillStyle(0x111114, 1);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 6; col++) {
          if ((row + col) % 2 === 0) {
            g.fillRect(cx - half + col * cell, cy - cell * 1.5 + row * cell, cell, cell);
          }
        }
      }
    }
  }

  /** Filled N-point star, used for the police badge emblem. */
  private drawStar(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    spikes: number,
    outer: number,
    inner: number,
    color: number,
  ): void {
    const points: Phaser.Math.Vector2[] = [];
    const step = Math.PI / spikes;
    let rot = -Math.PI / 2;
    for (let i = 0; i < spikes; i++) {
      points.push(new Phaser.Math.Vector2(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer));
      rot += step;
      points.push(new Phaser.Math.Vector2(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner));
      rot += step;
    }
    g.fillStyle(color, 1);
    g.fillPoints(points, true);
  }

  /** A thick downward chevron, stacked to form the tow-yard hazard emblem. */
  private drawChevron(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    y: number,
    hw: number,
    hh: number,
    t: number,
    color: number,
  ): void {
    g.fillStyle(color, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(cx - hw, y),
        new Phaser.Math.Vector2(cx, y + hh),
        new Phaser.Math.Vector2(cx + hw, y),
        new Phaser.Math.Vector2(cx + hw, y + t),
        new Phaser.Math.Vector2(cx, y + hh + t),
        new Phaser.Math.Vector2(cx - hw, y + t),
      ],
      true,
    );
  }

  /** Draw the river water, the bridge decks crossing it, and the bridge rails. */
  private drawTerrain(): void {
    if (this.city.water.length === 0) return;
    const { tile } = this.city.spec;

    for (const body of this.city.water) {
      const water = this.add
        .tileSprite(body.x, body.y, body.w, body.h, TILE.water.texture, TILE.water.frame)
        .setOrigin(0)
        .setDepth(1);
      this.waterTiles.push(water);
    }

    // Bridge decks: a solid plank covering each bridge tile so it reads as a
    // crossing over the water rather than part of the river.
    const { cols, rows } = this.city.spec;
    for (let tx = 0; tx < cols; tx++) {
      for (let ty = 0; ty < rows; ty++) {
        if (this.city.isBridge(tx, ty)) {
          this.add
            .image(tx * tile + tile / 2, ty * tile + tile / 2, TILE.bridge.texture, TILE.bridge.frame)
            .setDisplaySize(tile, tile)
            .setDepth(2);
        }
      }
    }

    // Bridge side rails (also solid wall collision in the World).
    const rails = this.add.graphics().setDepth(3);
    rails.fillStyle(COLORS.fence, 1);
    for (const f of this.city.fences) {
      rails.fillRect(f.x, f.y, f.w, f.h);
    }
  }

  /** Draw sidewalks, crosswalk stripes, and parking bay outlines. */
  /** Centres of every dry road intersection (block-aligned road tiles), used to
   * place traffic-light indicators and night-time street lights. */
  private computeIntersectionCenters(): Vec2[] {
    const { cols, rows, block, tile } = this.city.spec;
    const roadWidth = Math.max(1, Math.min(block, this.city.spec.roadWidth ?? 1));
    const centers: Vec2[] = [];
    for (let tx = 0; tx < cols; tx += block) {
      for (let ty = 0; ty < rows; ty += block) {
        if (this.city.isRoad(tx, ty) && !this.city.isWater(tx, ty)) {
          centers.push(
            vec2(tx * tile + (roadWidth * tile) / 2, ty * tile + (roadWidth * tile) / 2),
          );
        }
      }
    }
    return centers;
  }

  private drawStreets(): void {
    const g = this.add.graphics().setDepth(0.4);

    for (const s of this.city.sidewalks) {
      this.add
        .tileSprite(s.x, s.y, s.w, s.h, TILE.sidewalk.texture, TILE.sidewalk.frame)
        .setOrigin(0)
        .setDepth(0);
      g.lineStyle(1, COLORS.sidewalkShade, 0.35);
      g.strokeRect(s.x + 1, s.y + 1, Math.max(0, s.w - 2), Math.max(0, s.h - 2));
    }

    g.lineStyle(1, COLORS.curbLine, 0.18);
    for (const s of this.city.sidewalks) {
      g.strokeRect(s.x, s.y, s.w, s.h);
    }

    // Zebra crossings: draw the authored stripe rects directly so each bar is
    // oriented per crossing (upright over N-S roads, flat over E-W roads).
    g.fillStyle(0xd9e0e9, 0.61);
    for (const cw of this.city.crosswalks) {
      for (const stripe of crosswalkStripeRects(cw)) {
        g.fillRect(stripe.x, stripe.y, stripe.w, stripe.h);
      }
    }

    // Parking bays: a thin outline under each parked car, oriented to its kerb.
    g.lineStyle(1.5, COLORS.parkingLine, 0.7);
    for (const spot of this.parkedSpots) {
      const along = Math.abs(Math.cos(spot.heading)) > 0.5; // pointing along x?
      const halfW = along ? 17 : 9;
      const halfH = along ? 9 : 17;
      g.fillStyle(COLORS.roadShadow, 0.1);
      g.fillRect(spot.pos.x - halfW, spot.pos.y - halfH, halfW * 2, halfH * 2);
      g.strokeRect(spot.pos.x - halfW, spot.pos.y - halfH, halfW * 2, halfH * 2);
    }
  }

  private syncEnvironmentArt(dt: number): void {
    for (const water of this.waterTiles) {
      water.tilePositionX += dt * 18;
      water.tilePositionY += dt * 6;
    }

    const pulse = this.time.now / 420;
    this.shimmerSprites.forEach((sprite, index) => {
      const strength = 0.5 + 0.5 * Math.sin(pulse + index * 0.9);
      sprite.setAlpha(0.18 + strength * 0.36);
      sprite.setScale(0.28 + strength * 0.08);
    });
  }

  private createEntitySprites(): void {
    // A pulsing ring marking the current 'reach' objective.
    this.missionMarker = this.add
      .circle(0, 0, 52, COLORS.marker, 0.12)
      .setStrokeStyle(3, COLORS.marker)
      .setDepth(3)
      .setVisible(false);
    this.storyChoiceMarkersGfx = this.add.graphics().setDepth(3);
    this.taxiMarker = this.add
      .circle(0, 0, 46, COLORS.taxiMarker, 0.12)
      .setStrokeStyle(3, COLORS.taxiMarker)
      .setDepth(3)
      .setVisible(false);
    this.serviceMarker = this.add
      .circle(0, 0, 46, COLORS.marker, 0.12)
      .setStrokeStyle(3, COLORS.marker)
      .setDepth(3)
      .setVisible(false);

    this.carSprites = this.world.cars.map((car, i) =>
      this.spawnImage(car.pos.x, car.pos.y, this.carTexture(i)).setDepth(4).setRotation(car.heading),
    );

    this.pedSprites = this.world.pedestrians.map((ped, index) =>
      this.spawnImage(ped.pos.x, ped.pos.y, this.pedTexture(ped, index)).setDepth(5),
    );

    this.ammoSprites = this.world.ammoPickups.map((pickup) => ({
      pickup,
      sprite: this.add.image(pickup.pos.x, pickup.pos.y, TEX.ammo).setDepth(5),
    }));

    const p = this.world.player;
    const playerTexture = textureRef(TEX.player);
    this.playerSprite = this.add
      .image(p.pos.x, p.pos.y, playerTexture.texture, playerTexture.frame)
      .setDepth(10)
      .setRotation(p.angle);

    // Quick transient trails and impact bursts keep motion readable.
    this.feedbackGfx = this.add.graphics().setDepth(6.4);
    // Traffic-light indicators sit above the road but below entities.
    this.lightsGfx = this.add.graphics().setDepth(7);
    // Corpses and their blood puddles sit just above the road, below the living.
    this.corpseGfx = this.add.graphics().setDepth(4);
    // The ambulance: a white emergency vehicle, hidden until dispatched.
    this.ambulanceSprite = this.spawnImage(0, 0, textureRef(TEX.ambulance)).setDepth(6).setVisible(false);
    // Tow trucks: amber service vehicles, created on demand into a pool.
    this.towSprites = [];

    this.createNightLights();
  }

  /** Build the night-time lighting: a warm glow at every intersection that fades
   * in after dark, plus a soft aura around the player so the streets stay
   * playable at midnight. All additive, so by day (alpha 0) they cost nothing. */
  private createNightLights(): void {
    // A reusable soft radial-glow texture (concentric translucent circles).
    if (!this.textures.exists('glow')) {
      const size = 256;
      const r = size / 2;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      for (let rad = r; rad > 0; rad -= 2) {
        g.fillStyle(0xffe1aa, 0.05);
        g.fillCircle(r, r, rad);
      }
      g.generateTexture('glow', size, size);
      g.destroy();
    }

    // Streetlights at every intersection (world space), hidden by day.
    this.nightLights = this.add.container(0, 0).setDepth(901).setAlpha(0);
    for (const c of this.intersectionCenters) {
      const light = this.add
        .image(c.x, c.y, 'glow')
        .setScale(0.7)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.nightLights.add(light);
    }

    // A soft aura that follows the player on screen, so wherever they are is lit.
    this.nightAura = this.add
      .image(this.scale.width / 2, this.scale.height / 2, 'glow')
      .setScrollFactor(0)
      .setDepth(902)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(3.2)
      .setAlpha(0);
  }

  /** Reconcile the bullet sprite pool with the live bullets. */
  private syncBullets(): void {
    this.world.bullets.forEach((b, i) => {
      let sprite = this.bulletSprites[i];
      if (!sprite) {
        sprite = this.add.rectangle(b.pos.x, b.pos.y, 7, 3, COLORS.bullet).setDepth(8);
        this.bulletSprites[i] = sprite;
      }
      sprite
        .setVisible(true)
        .setPosition(b.pos.x, b.pos.y)
        .setRotation(Math.atan2(b.velocity.y, b.velocity.x));
    });
    for (let i = this.world.bullets.length; i < this.bulletSprites.length; i++) {
      this.bulletSprites[i].setVisible(false);
    }

    // Police return fire is drawn in a separate, red-tinted pool.
    this.world.policeBullets.forEach((b, i) => {
      let sprite = this.policeBulletSprites[i];
      if (!sprite) {
        sprite = this.add.rectangle(b.pos.x, b.pos.y, 7, 3, 0xf87171).setDepth(8);
        this.policeBulletSprites[i] = sprite;
      }
      sprite
        .setVisible(true)
        .setPosition(b.pos.x, b.pos.y)
        .setRotation(Math.atan2(b.velocity.y, b.velocity.x));
    });
    for (let i = this.world.policeBullets.length; i < this.policeBulletSprites.length; i++) {
      this.policeBulletSprites[i].setVisible(false);
    }
  }

  /** Draw each active explosion as an expanding, fading blast. */
  private syncExplosions(): void {
    this.world.explosions.forEach((e, i) => {
      let sprite = this.explosionSprites[i];
      if (!sprite) {
        sprite = this.add.image(e.pos.x, e.pos.y, FX.explosion.texture, FX.explosion.frames[0]).setDepth(11);
        this.explosionSprites[i] = sprite;
      }
      const t = e.age / e.life;
      this.applyTextureFrame(
        sprite,
        { texture: FX.explosion.texture },
        effectFrame(FX.explosion.frames, Math.floor(t * FX.explosion.frames.length)),
      )
        .setVisible(true)
        .setPosition(e.pos.x, e.pos.y)
        .setScale((e.radius / 18) * (0.85 + t * 0.55))
        .setAlpha(0.95 - t * 0.55);
    });
    for (let i = this.world.explosions.length; i < this.explosionSprites.length; i++) {
      this.explosionSprites[i].setVisible(false);
    }
  }

  /** Draw a flickering fire + smoke overlay on cars that are currently burning. */
  private syncBurningCars(): void {
    this.world.cars.forEach((car, i) => {
      let sprite = this.fireSprites[i];
      if (!sprite) {
        sprite = this.add.image(car.pos.x, car.pos.y, FX.fire.texture, FX.fire.frames[0]).setDepth(5.5);
        this.fireSprites[i] = sprite;
      }
      if (!this.world.carIsBurning(i)) {
        sprite.setVisible(false);
        return;
      }

      const pulse = 0.55 + 0.45 * Math.sin(this.time.now / 120 + i * 1.1);
      this.applyTextureFrame(
        sprite,
        { texture: FX.fire.texture },
        effectFrame(FX.fire.frames, Math.floor(this.time.now / 120 + i)),
      )
        .setVisible(true)
        .setPosition(car.pos.x, car.pos.y - car.radius * 0.1)
        .setRotation(car.heading)
        .setScale((car.radius / 12) * (0.9 + pulse * 0.22))
        .setAlpha(0.5 + pulse * 0.35);
    });
  }

  private burningCarTint(index: number): number {
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 90 + index * 1.7);
    const red = Math.round(132 + pulse * 123);
    const green = Math.round(42 + pulse * 118);
    const blue = Math.round(18 + (1 - pulse) * 20);
    return Phaser.Display.Color.GetColor(red, green, blue);
  }

  /** Draw the traffic lights: a green/red bar for each travel axis at every
   * intersection, reflecting the current shared light phase. */
  private syncLights(): void {
    const axis = greenAxis(this.world.lights);
    if (axis === this.prevLightAxis) return;
    this.prevLightAxis = axis;
    const g = this.lightsGfx;
    g.clear();
    const ew = axis === 'horizontal' ? COLORS.lightGreen : COLORS.lightRed;
    const ns = axis === 'vertical' ? COLORS.lightGreen : COLORS.lightRed;
    const ewAlpha = axis === 'horizontal' ? 1 : 0.78;
    const nsAlpha = axis === 'vertical' ? 1 : 0.78;
    for (const c of this.intersectionCenters) {
      // Dark signal housing behind each lamp bar.
      g.fillStyle(0x0a0e16, 0.85);
      g.fillRoundedRect(c.x - 9, c.y - 3.5, 18, 7, 2);
      g.fillRoundedRect(c.x - 3.5, c.y - 9, 7, 18, 2);
      // Soft green glow along whichever axis currently has right of way.
      if (axis === 'horizontal') {
        g.fillStyle(COLORS.lightGreen, 0.22);
        g.fillRect(c.x - 11, c.y - 3, 22, 6);
      } else {
        g.fillStyle(COLORS.lightGreen, 0.22);
        g.fillRect(c.x - 3, c.y - 11, 6, 22);
      }
      // Rounded lamp bars, the stopped axis dimmed so green reads as “go”.
      g.fillStyle(ew, ewAlpha);
      g.fillRoundedRect(c.x - 7, c.y - 1.75, 14, 3.5, 1.5);
      g.fillStyle(ns, nsAlpha);
      g.fillRoundedRect(c.x - 1.75, c.y - 7, 3.5, 14, 1.5);
    }
  }

  /** Draw each corpse as a body lying in a pool of blood. */
  private syncCorpses(): void {
    const signature = this.world.corpses.map((c) => `${c.pos.x},${c.pos.y}`).join('|');
    if (signature === this.prevCorpseSignature) return;
    this.prevCorpseSignature = signature;
    const g = this.corpseGfx;
    g.clear();
    for (const c of this.world.corpses) {
      g.fillStyle(0x6b1414, 0.5); // blood puddle
      g.fillEllipse(c.pos.x, c.pos.y, 30, 20);
      g.fillStyle(0x3b4252, 1); // the body, lying on its back (torso)
      g.fillEllipse(c.pos.x, c.pos.y + 1, 16, 9);
      g.fillStyle(0xd6a77a, 1); // head
      g.fillCircle(c.pos.x - 9, c.pos.y, 4);
      g.fillStyle(0x2b2f3a, 1); // legs
      g.fillRect(c.pos.x + 5, c.pos.y - 4, 7, 3);
      g.fillRect(c.pos.x + 5, c.pos.y + 1, 7, 3);
    }
  }

  /** Show the ambulance when one is active, tracking its position and heading.
   * Its roof light bar strobes blue then red the whole time it is on a call. */
  private syncAmbulance(): void {
    const amb = this.world.ambulance;
    if (!amb) {
      this.ambulanceSprite.setVisible(false);
      this.ambulanceBeaconBlue?.setVisible(false);
      this.ambulanceBeaconRed?.setVisible(false);
      this.medicSprite?.setVisible(false);
      return;
    }
    this.ambulanceSprite
      .setVisible(true)
      .setPosition(amb.pos.x, amb.pos.y)
      .setRotation(amb.heading);

    // The medic on foot, while the ambulance is parked fetching the body.
    if (amb.crew) {
      this.medicSprite ??= this.spawnImage(0, 0, textureRef(TEX.medic)).setDepth(6);
      const goal = amb.phase === 'collect' ? amb.target : amb.pos;
      const medicTexture = textureRef(TEX.medic);
      this.applyTextureFrame(
        this.medicSprite,
        medicTexture,
        this.animatedFrame(
          medicTexture,
          Math.hypot(amb.crew.x - this.medicSprite.x, amb.crew.y - this.medicSprite.y) > 0.12,
          165,
        ),
      )
        .setVisible(true)
        .setPosition(amb.crew.x, amb.crew.y)
        .setRotation(Math.atan2(goal.y - amb.crew.y, goal.x - amb.crew.x));
    } else {
      this.medicSprite?.setVisible(false);
    }

    if (!this.ambulanceBeaconBlue || !this.ambulanceBeaconRed) {
      const lamp = (tint: number, core: number): Phaser.GameObjects.Container => {
        const halo = this.add
          .image(0, 0, 'glow')
          .setScale(0.1)
          .setTint(tint)
          .setBlendMode(Phaser.BlendModes.ADD);
        const bulb = this.add.circle(0, 0, 2, core);
        return this.add.container(0, 0, [halo, bulb]).setDepth(7);
      };
      this.ambulanceBeaconBlue = lamp(0x3b82f6, 0xbfdbfe);
      this.ambulanceBeaconRed = lamp(0xef4444, 0xfecaca);
    }

    // The two lamps sit on the cab roof, one each side of the centreline, and
    // strobe in alternation — blue, then red — like a real ambulance light bar.
    const cos = Math.cos(amb.heading);
    const sin = Math.sin(amb.heading);
    const baseX = amb.pos.x + cos * AMB_BEACON_FWD;
    const baseY = amb.pos.y + sin * AMB_BEACON_FWD;
    this.ambulanceBeaconBlue
      .setVisible(true)
      .setPosition(baseX + sin * AMB_BEACON_SIDE, baseY - cos * AMB_BEACON_SIDE);
    this.ambulanceBeaconRed
      .setVisible(true)
      .setPosition(baseX - sin * AMB_BEACON_SIDE, baseY + cos * AMB_BEACON_SIDE);

    const blueOn = Math.floor(this.time.now / AMB_BEACON_BLINK_MS) % 2 === 0;
    this.ambulanceBeaconBlue.setAlpha(blueOn ? 1 : 0.12);
    this.ambulanceBeaconRed.setAlpha(blueOn ? 0.12 : 1);
  }

  /** Show every active tow truck, tracking each one's position and heading. Its
   * cab-roof beacon flashes amber the whole time it is on a recovery run. */
  private syncTow(): void {
    const beaconOn = Math.floor(this.time.now / TOW_BEACON_BLINK_MS) % 2 === 0;
    this.world.tows.forEach((tow, i) => {
      let sprite = this.towSprites[i];
      if (!sprite) {
        sprite = this.spawnImage(0, 0, textureRef(TEX.tow)).setDepth(6);
        this.towSprites[i] = sprite;
      }
      sprite.setVisible(true).setPosition(tow.pos.x, tow.pos.y).setRotation(tow.heading);

      // The operator on foot, while the truck is parked hooking the wreck.
      let worker = this.towWorkerSprites[i];
      if (tow.crew) {
        if (!worker) {
          worker = this.spawnImage(0, 0, textureRef(TEX.towWorker)).setDepth(6);
          this.towWorkerSprites[i] = worker;
        }
        const goal = tow.phase === 'collect' ? tow.target : tow.pos;
        const workerTexture = textureRef(TEX.towWorker);
        this.applyTextureFrame(
          worker,
          workerTexture,
          this.animatedFrame(
            workerTexture,
            Math.hypot(tow.crew.x - worker.x, tow.crew.y - worker.y) > 0.12,
            165,
          ),
        )
          .setVisible(true)
          .setPosition(tow.crew.x, tow.crew.y)
          .setRotation(Math.atan2(goal.y - tow.crew.y, goal.x - tow.crew.x));
      } else {
        worker?.setVisible(false);
      }

      let beacon = this.towBeacons[i];
      if (!beacon) {
        const halo = this.add
          .image(0, 0, 'glow')
          .setScale(0.13)
          .setTint(0xf59e0b)
          .setBlendMode(Phaser.BlendModes.ADD);
        const core = this.add.circle(0, 0, 2.5, 0xfde047);
        beacon = this.add.container(0, 0, [halo, core]).setDepth(7);
        this.towBeacons[i] = beacon;
      }
      // Place the beacon over the cab roof, rotated with the truck, and blink it.
      beacon
        .setVisible(true)
        .setPosition(
          tow.pos.x + Math.cos(tow.heading) * TOW_BEACON_FWD,
          tow.pos.y + Math.sin(tow.heading) * TOW_BEACON_FWD,
        )
        .setAlpha(beaconOn ? 1 : 0.12);
    });
    for (let i = this.world.tows.length; i < this.towSprites.length; i++) {
      this.towSprites[i].setVisible(false);
      this.towBeacons[i]?.setVisible(false);
      this.towWorkerSprites[i]?.setVisible(false);
    }
  }

  private spawnImage(x: number, y: number, ref: TextureRef): Phaser.GameObjects.Image {
    return this.add.image(x, y, ref.texture, ref.frame);
  }

  private animatedFrame(ref: TextureRef, moving: boolean, rateMs = 180): string | number | undefined {
    if (!moving || !ref.frames || ref.frames.length === 0) return ref.frame;
    return cycleFrame(ref, Math.floor(this.time.now / rateMs));
  }

  private applyTextureFrame(
    sprite: Phaser.GameObjects.Image,
    ref: TextureRef,
    frame: string | number | undefined,
  ): Phaser.GameObjects.Image {
    return sprite.setTexture(ref.texture, frame);
  }

  private pedTexture(ped: Pedestrian, index: number): TextureRef {
    if (ped.uniform === 'medic') return textureRef(TEX.medic);
    if (ped.uniform === 'towWorker') return textureRef(TEX.towWorker);
    const seed =
      ped.visualSeed ??
      stableVisualSeed(
        index + 1,
        ped.taxiPassengerId ?? 0,
        ped.policeSuspectId ?? 0,
        ped.storyActorOrder ?? 0,
        stringSeed(ped.storyActorId),
      );
    return pickVariantTexture(PEDESTRIAN_VARIANT_TEXTURES, seed);
  }

  private setupCamera(): void {
    const f = this.world.focus;
    this.focusPoint = this.add.rectangle(f.x, f.y, 1, 1, 0x000000, 0);
    this.cameras.main.setBounds(
      -CAMERA_EDGE_GUTTER,
      -CAMERA_EDGE_GUTTER,
      this.city.width + CAMERA_EDGE_GUTTER * 2,
      this.city.height + CAMERA_EDGE_GUTTER * 2,
    );
    this.cameras.main.startFollow(this.focusPoint, true, 0.15, 0.15);
    this.applyZoom();
    // Re-fit when the viewport changes — window resize, device rotation, or
    // mobile Safari showing/hiding its toolbars (the iPad "car off-screen" bug).
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
    });
  }

  private viewportBaseZoom(): number {
    const { width, height } = this.scale.gameSize;
    const span = Math.min(width, height);
    if (span <= 0) return MIN_ZOOM;
    return Phaser.Math.Clamp(span / VIEW_SPAN, MIN_ZOOM, MAX_ZOOM);
  }

  /** Fit the camera zoom to the current viewport so the player stays centred and
   * a consistent amount of the city is visible on every device. */
  private applyZoom(): void {
    const zoom = this.viewportBaseZoom();
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(this.world.focus.x, this.world.focus.y);
  }

  /** Handle a viewport resize: refit the zoom and recentre screen-space UI. */
  private onResize(): void {
    if (this.storyPanelCinematicActive) {
      this.storyPanelBaseZoom = this.viewportBaseZoom();
      this.cameras.main.setZoom(this.storyPanelTargetZoom(this.storyPanelTone));
      const focus = this.storyPanelFocusTarget ?? this.world.focus;
      this.cameras.main.centerOn(focus.x, focus.y);
    } else {
      this.applyZoom();
    }
    const { width, height } = this.scale.gameSize;
    this.dayNightOverlay?.setSize(width * 3, height * 3);
    this.layoutHud();
  }

  /**
   * Re-pin every screen-space UI element against the current camera zoom. Phaser
   * keeps a `scrollFactor(0)` object's scroll fixed but still applies the camera
   * zoom to it, so each element is placed at the world point that maps back to
   * its intended screen pixel and counter-scaled to its native size. Without
   * this the HUD and minimap are rescaled and pushed off-screen whenever the
   * derived zoom is not 1 — the map/HUD-missing bug seen on laptops and iPads.
   */
  private layoutHud(): void {
    const { width, height } = this.scale.gameSize;
    const viewport = { width, height };
    const zoom = this.cameras.main.zoom;
    const counter = uiCounterScale(zoom);

    const place = (
      obj:
        | Phaser.GameObjects.Image
        | Phaser.GameObjects.Text
        | Phaser.GameObjects.Graphics
        | Phaser.GameObjects.Rectangle
        | Phaser.GameObjects.Arc
        | undefined,
      screenX: number,
      screenY: number,
    ): void => {
      if (!obj) return;
      const w = uiScreenToWorld(vec2(screenX, screenY), viewport, zoom);
      obj.setPosition(w.x, w.y).setScale(counter);
    };

    place(this.hud, 10, 10); // top-left status readout
    const bannerTop = 18 + this.hud.height;
    place(this.banner, 10, bannerTop);
    place(this.bannerCloseButton, 24 + this.banner.width, bannerTop + 6);
    place(this.storyStateText, 10, bannerTop + this.banner.height + 8);
    place(this.storyPanelFrame, width / 2, height / 2 - 12);
    place(this.storyPanelAccent, width / 2 - 322, height / 2 - 12);
    place(this.storyPortraitBackdrop, width / 2 - 224, height / 2 - 12);
    place(this.storyPortraitFrame, width / 2 - 224, height / 2 - 12);
    place(this.storyPortraitBadge, width / 2 - 224, height / 2 - 74);
    place(this.storyPortraitMonogram, width / 2 - 224, height / 2 - 74);
    place(this.storyPortraitKicker, width / 2 - 224, height / 2 - 138);
    place(this.storyPortraitName, width / 2 - 224, height / 2 + 6);
    place(this.storyPortraitRole, width / 2 - 224, height / 2 + 42);
    place(this.storyPanel, width / 2, height / 2 - 12);
    place(this.bustedText, width / 2, height / 2);
    place(this.pauseTouchButton, width / 2, height / 2 + 306);

    if (this.minimapBg) {
      // Clamp the top-right anchor so the whole map stays on screen even on a
      // very small viewport; both the backdrop and the live dots share it.
      const anchor = uiAnchorOnScreen(
        vec2(width - MINIMAP_SIZE - 12, 12),
        { width: MINIMAP_SIZE, height: MINIMAP_SIZE },
        viewport,
        zoom,
      );
      this.minimapBg.setPosition(anchor.x, anchor.y).setScale(counter);
      this.minimapDots.setPosition(anchor.x, anchor.y).setScale(counter);
    }

    this.touchLayout = touchLayoutForViewport(width, height);
    this.touchInput_?.setLayout(this.touchLayout);
    this.syncTouchControls();
  }

  private createHud(): void {
    this.hud = this.add
      .text(10, 10, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#e5e7eb',
        backgroundColor: '#00000080',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.bustedText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#fca5a5',
        align: 'center',
        backgroundColor: '#000000c0',
        padding: { x: 24, y: 18 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000)
      .setVisible(false);

    // A transient banner that announces each new mission / objective.
    this.banner = this.add
      .text(10, 84, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#67e8f9',
        align: 'left',
        backgroundColor: '#000000b0',
        padding: { x: 18, y: 10 },
        wordWrap: { width: BANNER_MAX_WIDTH, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1500)
      .setVisible(false);

    this.bannerCloseButton = this.add
      .text(0, 0, '✕', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#f8fafc',
        backgroundColor: '#000000d0',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1501)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.dismissBanner());

    this.storyPanel = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 12, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#f8fafc',
        align: 'center',
        backgroundColor: '#000000e0',
        padding: { x: 22, y: 16 },
        wordWrap: { width: 560, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2502)
      .setVisible(false);

    this.storyPanelFrame = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(2500)
      .setVisible(false);

    this.storyPanelAccent = this.add
      .rectangle(this.scale.width / 2 - 322, this.scale.height / 2 - 12, 12, 308, 0x67e8f9, 0.95)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2501)
      .setVisible(false);

    this.storyPortraitBackdrop = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(2501)
      .setVisible(false);

    this.storyPortraitFrame = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(2502)
      .setVisible(false);

    this.storyPortraitBadge = this.add
      .circle(this.scale.width / 2 - 224, this.scale.height / 2 - 74, 34, 0x67e8f9, 0.95)
      .setScrollFactor(0)
      .setDepth(2504)
      .setVisible(false);

    this.storyPortraitMonogram = this.add
      .text(this.scale.width / 2 - 224, this.scale.height / 2 - 74, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#f8fafc',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2505)
      .setVisible(false);

    this.storyPortraitKicker = this.add
      .text(this.scale.width / 2 - 224, this.scale.height / 2 - 138, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e2e8f0',
        align: 'center',
        backgroundColor: '#082f49d0',
        padding: { x: 10, y: 6 },
        wordWrap: { width: 152, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2505)
      .setVisible(false);

    this.storyPortraitName = this.add
      .text(this.scale.width / 2 - 224, this.scale.height / 2 + 6, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#f8fafc',
        align: 'center',
        wordWrap: { width: 168, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2505)
      .setVisible(false);

    this.storyPortraitRole = this.add
      .text(this.scale.width / 2 - 224, this.scale.height / 2 + 42, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#cbd5e1',
        align: 'center',
        backgroundColor: '#020617d0',
        padding: { x: 10, y: 6 },
        wordWrap: { width: 168, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2505)
      .setVisible(false);

    this.syncStoryPanelFrame();

    this.storyStateText = this.add
      .text(this.scale.width / 2, 140, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#facc15',
        align: 'center',
        backgroundColor: '#000000c8',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2501)
      .setVisible(false);

    this.pauseTouchButton = this.add
      .text(this.scale.width / 2, this.scale.height / 2 + 214, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#67e8f9',
        align: 'center',
        backgroundColor: '#000000d0',
        padding: { x: 18, y: 12 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2501)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggleTouchEnabled());
    this.refreshPauseTouchButton();

    // A full-screen dimming overlay for the day/night cycle. Oversized and
    // centred so it covers the viewport at any camera zoom; depth below the HUD.
    this.dayNightOverlay = this.add
      .rectangle(
        this.scale.width / 2,
        this.scale.height / 2,
        this.scale.width * 3,
        this.scale.height * 3,
        0x0a0f24,
        0,
      )
      .setScrollFactor(0)
      .setDepth(900);
  }

  private createTouchControls(): void {
    this.touchControlsGfx = this.add.graphics().setScrollFactor(0).setDepth(1700);
    const { width, height } = this.scale.gameSize;
    this.touchLayout = touchLayoutForViewport(width, height);
  }

  /** Build the corner minimap: a static city backdrop plus a live dot overlay. */
  private createMinimap(): void {
    const scale = MINIMAP_SIZE / this.city.width;
    if (!this.textures.exists(MINIMAP_BG_TEXTURE_KEY)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(COLORS.mmRoad, 1);
      g.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
      g.fillStyle(COLORS.mmBuilding, 1);
      for (const b of this.city.buildings) {
        g.fillRect(b.x * scale, b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
      }
      for (const facility of this.city.facilities) {
        g.fillStyle(
          facility.kind === 'policeStation'
            ? COLORS.mmPoliceBuilding
            : facility.kind === 'hospital'
              ? COLORS.mmHospitalBuilding
              : facility.kind === 'towYard'
                ? COLORS.mmTowBuilding
                : COLORS.mmTaxiBuilding,
          1,
        );
        const b = facility.building;
        g.fillRect(b.x * scale, b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
      }
      g.fillStyle(COLORS.mmWater, 1);
      for (const water of this.city.water) {
        g.fillRect(
          water.x * scale,
          water.y * scale,
          Math.max(1, water.w * scale),
          Math.max(1, water.h * scale),
        );
      }
      g.generateTexture(MINIMAP_BG_TEXTURE_KEY, MINIMAP_SIZE, MINIMAP_SIZE);
      g.destroy();
    }

    this.minimapBg = this.add
      .image(0, 0, MINIMAP_BG_TEXTURE_KEY)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1400)
      .setAlpha(0.85);
    this.minimapDots = this.add.graphics().setScrollFactor(0).setDepth(1401);
  }

  /** Redraw the minimap's live markers (player, police, objectives, mission targets). */
  private syncMinimap(): void {
    const scale = MINIMAP_SIZE / this.city.width;
    // Dots are drawn in the minimap's own local space (0..MINIMAP_SIZE). The
    // graphics object's position and counter-zoom scale (set in layoutHud) place
    // and size it on screen, so no screen offset is baked into the geometry.
    const g = this.minimapDots;
    g.clear();

    for (const marker of this.debugMinimapMarkers()) {
      if (marker.style === 'stroke') {
        g.lineStyle(2, marker.color, 1);
        g.strokeCircle(marker.x * scale, marker.y * scale, 4);
        continue;
      }
      g.fillStyle(marker.color, 1);
      g.fillCircle(marker.x * scale, marker.y * scale, marker.radius ?? 2);
    }

    g.fillStyle(COLORS.mmPolice, 1);
    for (const cop of this.world.police) {
      g.fillCircle(cop.pos.x * scale, cop.pos.y * scale, 2);
    }

    g.fillStyle(COLORS.mmPlayer, 1);
    g.fillCircle(this.world.focus.x * scale, this.world.focus.y * scale, 3);
  }

  private storyMissionTargetPosition(): Vec2 | null {
    const objective = this.world.missionObjective;
    if (!objective || (objective.kind !== 'tail' && objective.kind !== 'capture')) return null;
    if (!this.storyScript || !this.storyProgress) return null;
    const mission = currentStoryMission(STORY_MODE_PROTOTYPE, this.storyProgress);
    const runtime = mission?.prototypeScript;
    if (!runtime) return null;
    const stage = this.activeStoryStage(runtime);
    if (!stage) return null;
    const primaryActorId = stage.primaryActorId ?? runtime.primaryActorId;
    const actor = stage.actors.find((candidate) => candidate.actorId === primaryActorId);
    if (!actor) return null;
    if (actor.kind === 'vehicleRoute') {
      const carIndex = this.storyScript.actorCarIndices[actor.actorId];
      return carIndex !== undefined ? (this.world.cars[carIndex]?.pos ?? null) : null;
    }
    const pedIndex = this.storyPedIndices(actor.actorId)[0];
    return pedIndex !== undefined ? (this.world.pedestrians[pedIndex]?.pos ?? null) : null;
  }

  private debugMinimapMarkers(): Array<{
    kind: string;
    x: number;
    y: number;
    color: number;
    style: 'stroke' | 'fill';
    radius?: number;
  }> {
    const markers: Array<{
      kind: string;
      x: number;
      y: number;
      color: number;
      style: 'stroke' | 'fill';
      radius?: number;
    }> = [];
    if (this.selectingStoryMission()) {
      for (const choice of this.storyMissionChoiceTargets()) {
        markers.push({
          kind: 'choice',
          x: choice.target.x,
          y: choice.target.y,
          color: COLORS.mmTarget,
          style: 'stroke',
        });
      }
    }
    const objective = this.world.missionObjective;
    if (!this.selectingStoryMission() && (objective?.kind === 'reach' || objective?.kind === 'defend')) {
      markers.push({
        kind: 'objective',
        x: objective.target.x,
        y: objective.target.y,
        color: COLORS.mmTarget,
        style: 'stroke',
      });
    } else if (
      !this.selectingStoryMission() &&
      (objective?.kind === 'route' || objective?.kind === 'sabotage')
    ) {
      const completed =
        this.world.mission?.objectiveState?.kind === 'route'
          ? this.world.mission.objectiveState.completed
          : 0;
      const target = objective.targets[completed];
      if (target) {
        markers.push({
          kind: 'objective',
          x: target.x,
          y: target.y,
          color: COLORS.mmTarget,
          style: 'stroke',
        });
      }
    } else if (!this.selectingStoryMission()) {
      const storyTarget = this.storyMissionTargetPosition();
      if (storyTarget) {
        markers.push({
          kind: 'story-target',
          x: storyTarget.x,
          y: storyTarget.y,
          color: COLORS.mmTarget,
          style: 'stroke',
        });
      }
    }

    const taxiTarget = this.world.taxiTarget;
    if (taxiTarget) {
      markers.push({
        kind: 'taxi',
        x: taxiTarget.x,
        y: taxiTarget.y,
        color: COLORS.mmTaxiTarget,
        style: 'stroke',
      });
    }

    const serviceMission = this.world.serviceMission;
    const serviceTarget = this.world.serviceTarget;
    if (serviceMission && serviceTarget) {
      markers.push({
        kind: 'service',
        x: serviceTarget.x,
        y: serviceTarget.y,
        color: this.serviceMarkerColor(serviceMission.kind, true),
        style: 'stroke',
      });
    }

    for (const ped of this.world.pedestrians) {
      if (!ped.missionTarget) continue;
      markers.push({
        kind: 'mission-target',
        x: ped.pos.x,
        y: ped.pos.y,
        color: COLORS.mmTarget,
        style: 'fill',
        radius: 2,
      });
    }
    return markers;
  }

  private maybeStartSelectedStoryMission(): boolean {
    if (!this.selectingStoryMission() || !this.storyProgress) return false;
    const choice = this.storyMissionChoiceTargets().find(
      (entry) => distance(this.world.focus, entry.target) <= 24,
    );
    if (!choice) return false;
    const selected = selectStoryMission(
      STORY_MODE_PROTOTYPE,
      this.storyProgress,
      choice.mission.id,
    );
    if (selected === this.storyProgress) return false;
    this.storyProgress = selected;
    this.skipPersistOnShutdown = true;
    this.scene.restart({ skipResume: true, mode: 'story', storyProgress: selected });
    return true;
  }

  update(_time: number, deltaMs: number): void {
    const touchSnapshot = this.touchInput_?.snapshot();
    const touchConfirmPressed =
      !!touchSnapshot &&
      this.touchEnabled &&
      touchSnapshot.confirmPressed &&
      !this.prevTouchConfirm;
    const acknowledgePressed = Phaser.Input.Keyboard.JustDown(this.storyAcknowledgeKey);
    this.syncTouchControls(touchSnapshot);

    if (this.storyPanelRequiresAcknowledge && (acknowledgePressed || touchConfirmPressed)) {
      this.acknowledgeStoryPanel();
      this.prevTouchConfirm = !!touchSnapshot?.confirmPressed;
      return;
    }

    // New game from scratch, available at any time.
    if (Phaser.Input.Keyboard.JustDown(this.newGameKey)) {
      this.prevTouchConfirm = !!touchSnapshot?.confirmPressed;
      this.startNewGame();
      return;
    }
    if (touchConfirmPressed && this.world.status === 'playing') {
      this.prevTouchConfirm = !!touchSnapshot?.confirmPressed;
      this.returnToLaunchMenu();
      return;
    }
    // Story pause now lives in the Sindicate launcher rather than an in-scene overlay.
    if (Phaser.Input.Keyboard.JustDown(this.pauseKey)) {
      this.returnToLaunchMenu();
      this.prevTouchConfirm = !!touchSnapshot?.confirmPressed;
      return;
    }
    if (this.paused) {
      this.prevTouchConfirm = !!touchSnapshot?.confirmPressed;
      return;
    }

    if (this.pendingStoryRestart) {
      if (this.storyPanelRemaining > 0) {
        this.storyPanelRemaining -= deltaMs / 1000;
      }
      if (this.storyPanelRemaining <= 0) {
        if (this.advanceStoryPanelQueue()) {
          this.prevTouchConfirm = !!touchSnapshot?.confirmPressed;
          return;
        }
        const progress = this.pendingStoryRestart;
        const resume = this.pendingStoryRestartResume;
        this.pendingStoryRestart = null;
        this.pendingStoryRestartResume = false;
        this.hideStoryPanel();
        this.skipPersistOnShutdown = true;
        if (!resume) clearGameState(this.store);
        this.scene.restart({
          skipResume: !resume,
          mode: 'story',
          storyProgress: progress,
          freshMissionOnResume: resume,
        });
      }
      this.prevTouchConfirm = !!touchSnapshot?.confirmPressed;
      return;
    }

    const keyboard = this.input_.read();
    const touch = this.touchEnabled && touchSnapshot ? touchSnapshot.controls : NO_CONTROLS;
    const controls = mergeControls(keyboard, touch);
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_DT);

    this.syncStoryScript(dt);

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_SUBSTEPS) {
      this.world.tick(controls, FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      steps += 1;
    }

    if (this.maybeStartSelectedStoryMission()) {
      this.prevTouchConfirm = !!touchSnapshot?.confirmPressed;
      return;
    }

    this.syncSprites();
  this.syncEnvironmentArt(dt);
    this.syncVisualFeedback(dt);
    this.minimapAccumulator += dt;
    if (this.minimapAccumulator >= MINIMAP_REFRESH_INTERVAL) {
      this.syncMinimap();
      this.minimapAccumulator = 0;
    }
    this.handleEvents();
    this.updateSiren(dt);
    this.updateDayNight(dt);
    this.saveAccumulator += dt;
    if (this.saveAccumulator >= SAVE_INTERVAL) this.persistGameState();

    // Count down the announcement banner.
    if (this.announceRemaining > 0) {
      const activeStageKey = this.currentStoryStageKey();
      if (
        this.bannerStageKey &&
        activeStageKey !== this.bannerStageKey &&
        !this.rebindStageBoundObjectiveBanner(activeStageKey)
      ) {
        this.dismissBanner();
      }
      this.announceRemaining -= dt;
      if (this.announceRemaining <= 0) this.dismissBanner();
    }
    if (!this.storyPanelRequiresAcknowledge && this.storyPanelRemaining > 0) {
      this.storyPanelRemaining -= dt;
      if (this.storyPanelRemaining <= 0) {
        if (!this.advanceStoryPanelQueue()) this.hideStoryPanel();
      }
    }

    this.prevTouchConfirm = !!touchSnapshot?.confirmPressed;
  }

  /** Advance the day/night cycle and dim the world toward midnight, while the
   * city lights and the player's aura fade in to keep the streets readable. */
  private updateDayNight(dt: number): void {
    this.timeOfDay += dt;
    const phase = (this.timeOfDay % DAY_LENGTH) / DAY_LENGTH; // 0..1 across a day
    const darkness = (1 - Math.cos(phase * Math.PI * 2)) / 2; // 0 at noon → 1 at midnight
    // Cap the gloom so midnight is dusky, not pitch black, then light it up.
    this.dayNightOverlay
      .setPosition(this.scale.width / 2, this.scale.height / 2)
      .setFillStyle(0x0a0f24, darkness * 0.45);
    this.nightLights.setAlpha(darkness * 0.5);
    this.nightAura
      .setPosition(this.scale.width / 2, this.scale.height / 2)
      .setAlpha(darkness * 0.8);
  }

  /** Wail the siren on a steady cadence whenever a chase is on. */
  private updateSiren(dt: number): void {
    if (this.world.status !== 'playing' || this.world.police.length === 0) {
      this.sirenTimer = 0;
      return;
    }
    this.sirenTimer -= dt;
    if (this.sirenTimer <= 0) {
      this.sfx.siren();
      this.sirenTimer = 0.42; // matches the two-tone wail length
    }
  }

  private setTouchEnabled(enabled: boolean): void {
    this.touchEnabled = enabled;
    this.touchOptedOut = this.touchAvailable && !enabled;
    this.touchInput_?.setEnabled(enabled);
    if (!enabled) this.prevTouchConfirm = false;
    this.store.setItem(TOUCH_PREF_KEY, enabled ? '1' : '0');
    this.touchControlsDirty = true;
    this.refreshPauseTouchButton();
    this.syncTouchControls();
  }

  private toggleTouchEnabled(): void {
    this.touchAvailable = true;
    this.setTouchEnabled(!this.touchEnabled);
  }

  private refreshPauseTouchButton(): void {
    if (!this.pauseTouchButton) return;
    const show = false;
    this.pauseTouchButton
      .setText(
        this.touchEnabled
          ? 'Touch Controls: ON\nTap to disable'
          : 'Touch Controls: OFF\nTap to enable',
      )
      .setVisible(show);
  }

  private returnToLaunchMenu(): void {
    this.persistGameState();
    const onExit = this.game.registry.get('exitToLaunchMenu') as (() => void) | undefined;
    onExit?.();
  }

  /** Restart the scene, beginning a brand-new game (the high score persists). */
  private startNewGame(): void {
    this.paused = false;
    this.skipPersistOnShutdown = true;
    clearGameState(this.store);
    clearStoryProgress(this.store);
    this.scene.restart({ skipResume: true, mode: this.mode === 'story' ? 'story' : 'sandbox' });
  }

  /** Persist the high score, play sounds, and announce mission changes. */
  private handleEvents(): void {
    const w = this.world;
    const previousStoryChapter =
      this.mode === 'story' && this.storyProgress
        ? currentStoryChapter(STORY_MODE_PROTOTYPE, this.storyProgress)
        : null;

    // Save a new high score as soon as it is beaten.
    if (w.score.best > this.savedBest) {
      this.savedBest = saveHighScore(this.store, w.score.best);
    }

    if (w.bullets.length > this.prevBullets) this.sfx.shot();
    if (w.kills > this.prevKills) this.sfx.hit();
    if (w.explosionsTriggered > this.prevExplosions) this.sfx.explosion();
    if (w.status !== 'playing' && this.prevStatus === 'playing') this.sfx.fail();

    const missionId = w.mission?.id ?? null;
    const objective = w.missionObjective?.description ?? '';
    if (this.mode === 'story' && this.storyProgress) {
      if (missionId !== this.prevMissionId && this.prevMissionId !== null) {
        this.storyProgress = completeStoryMission(
          STORY_MODE_PROTOTYPE,
          this.storyProgress,
          this.prevMissionId,
        );
      }
      if (w.mission && this.storyProgress.current) {
        const authoredMission = currentStoryMission(STORY_MODE_PROTOTYPE, this.storyProgress);
        this.storyProgress = setStoryObjectiveIndex(
          this.storyProgress,
          authoredMission
            ? storyObjectiveIndexFromRuntime(authoredMission, w.mission.currentIndex)
            : w.mission.currentIndex,
        );
      }
    }
    if (this.prevDrivingCarIndex === null && w.drivingCarIndex !== null) {
      this.showBanner(`ENTERED ${enteredCarLabel(w.carKind(w.drivingCarIndex))}`);
    }
    if (w.missionComplete && !this.prevMissionComplete) {
      this.sfx.fanfare();
      if (this.mode === 'story') {
        const nextMission = this.storyProgress
          ? currentStoryMission(STORY_MODE_PROTOTYPE, this.storyProgress)
          : null;
        const nextChapter = this.storyProgress
          ? currentStoryChapter(STORY_MODE_PROTOTYPE, this.storyProgress)
          : null;
        this.clearActiveStoryActors();
        this.persistGameState(GAME_STATE_KEY, { pruneStoryActors: true });
        if (nextMission?.prototypeRuntime && nextChapter) {
          this.queueStoryPanelSequence(
            this.chapterCompleteSequence(previousStoryChapter ?? nextChapter, nextChapter, nextMission),
          );
          this.pendingStoryRestart = this.storyProgress;
          this.pendingStoryRestartResume = true;
          return;
        }
        this.showStoryPanel(
          this.storyProgress?.current
            ? 'STORY PROTOTYPE COMPLETE\n\nThe next authored chapter has not been wired into runtime play yet.'
            : 'STORY COMPLETE\n\nRook and Nia have broken the current live slice of the Switchboard.',
          3.2,
          'complete',
        );
      } else {
        this.showBanner('ALL MISSIONS COMPLETE!');
      }
    } else if (missionId !== this.prevMissionId) {
      // A new mission begins — the first one, or after finishing the previous.
      if (this.prevMissionId !== null) this.sfx.fanfare();
      if (w.mission) {
        if (this.mode === 'story') {
          if (this.prevMissionId !== null) this.clearActiveStoryActors();
          if (this.prevMissionId !== null) this.showMissionTransitionPanel(this.prevMissionId);
          else if (!this.storyPanel.visible) this.showMissionBriefingPanel();
        }
        this.showBanner(`NEW MISSION\n${w.mission.title}\n${objective}`, { stageBound: true });
      }
    } else if (objective !== '' && objective !== this.prevObjective) {
      this.showBanner(objective, { stageBound: true }); // next objective within the same mission
    }

    const taxiMission = w.taxiMission;
    if (taxiMission) {
      if (taxiMission.id !== this.prevTaxiMissionId) {
        this.showBanner(`TAXI FARE\nPick up ${taxiMission.passengerName}`);
      } else if (taxiMission.stage !== this.prevTaxiStage) {
        this.showBanner(`Drop off ${taxiMission.passengerName}`);
      }
    }
    const serviceMission = w.serviceMission;
    if (serviceMission && serviceMission.id !== this.prevServiceMissionId) {
      this.showBanner(
        serviceMission.kind === 'police'
          ? 'POLICE JOB\nBust the suspect'
          : serviceMission.kind === 'ambulance'
            ? 'AMBULANCE RUN\nRecover the body'
            : 'TOW JOB\nRecover the wreck',
      );
    } else if (
      serviceMission?.kind === 'ambulance' &&
      serviceMission.stage !== this.prevServiceStage
    ) {
      this.showBanner('AMBULANCE RUN\nReturn the body to the hospital');
    } else if (serviceMission?.kind === 'tow' && serviceMission.stage !== this.prevServiceStage) {
      this.showBanner('TOW JOB\nReturn the wreck to the tow yard');
    }

    this.syncStoryMissionSummaryBaseline();

    this.prevBullets = w.bullets.length;
    this.prevKills = w.kills;
    this.prevStatus = w.status;
    this.prevMissionComplete = w.missionComplete;
    this.prevMissionId = missionId;
    this.prevObjective = objective;
    this.prevTaxiMissionId = taxiMission?.id ?? null;
    this.prevTaxiStage = taxiMission?.stage ?? '';
    this.prevServiceMissionId = serviceMission?.id ?? null;
    this.prevServiceStage =
      serviceMission && serviceMission.kind !== 'police' ? serviceMission.stage : '';
    this.prevExplosions = w.explosionsTriggered;
    this.prevDrivingCarIndex = w.drivingCarIndex;
  }

  private serviceMarkerColor(kind: 'police' | 'ambulance' | 'tow', minimap = false): number {
    if (kind === 'police') return minimap ? COLORS.mmPoliceTarget : COLORS.policeMarker;
    if (kind === 'ambulance') return minimap ? COLORS.mmAmbulanceTarget : COLORS.ambulanceMarker;
    return minimap ? COLORS.mmTowTarget : COLORS.towMarker;
  }

  /** Flash a banner message in the HUD corner for a few seconds. */
  private showBanner(
    text?: string,
    options: {
      seconds?: number;
      stageBound?: boolean;
    } = {},
  ): void {
    const content = typeof text === 'string' ? text.trim() : '';
    if (content.length === 0) {
      this.dismissBanner();
      return;
    }
    this.banner.setText(content).setVisible(true);
    this.bannerCloseButton.setVisible(true);
    this.announceRemaining = Math.max(0, options.seconds ?? BANNER_DEFAULT_SECONDS);
    this.bannerStageKey = options.stageBound ? this.currentStoryStageKey() : null;
    this.layoutHud();
  }

  private shouldSuppressStageShiftBanner(missionId: string, nextStageId?: string): boolean {
    return missionId === 'wreck-before-dawn' && nextStageId === 'wreck-hold';
  }

  private rebindStageBoundObjectiveBanner(activeStageKey: string | null): boolean {
    if (!activeStageKey || !this.banner.visible) return false;
    const objectiveText = this.world.missionObjective?.description?.trim() ?? '';
    if (objectiveText.length === 0 || this.banner.text.trim() !== objectiveText) return false;
    this.bannerStageKey = activeStageKey;
    return true;
  }

  private dismissBanner(): void {
    this.banner.setVisible(false).setText('');
    this.bannerCloseButton.setVisible(false);
    this.announceRemaining = 0;
    this.bannerStageKey = null;
    this.layoutHud();
  }

  private storyPanelToneStyle(tone: StoryPanelTone): {
    backgroundColor: string;
    accentColor: number;
    lineColor: number;
    shadowAlpha: number;
    width: number;
  } {
    if (tone === 'chapter') {
      return {
        backgroundColor: '#130d04f0',
        accentColor: 0xfbbf24,
        lineColor: 0xf59e0b,
        shadowAlpha: 0.44,
        width: 648,
      };
    }
    if (tone === 'summary') {
      return {
        backgroundColor: '#04130ef0',
        accentColor: 0x34d399,
        lineColor: 0x10b981,
        shadowAlpha: 0.44,
        width: 648,
      };
    }
    if (tone === 'complete') {
      return {
        backgroundColor: '#071221f0',
        accentColor: 0x60a5fa,
        lineColor: 0x38bdf8,
        shadowAlpha: 0.44,
        width: 648,
      };
    }
    if (tone === 'danger') {
      return {
        backgroundColor: '#190708f0',
        accentColor: 0xf87171,
        lineColor: 0xef4444,
        shadowAlpha: 0.5,
        width: 648,
      };
    }
    return {
      backgroundColor: '#06131af0',
      accentColor: 0x67e8f9,
      lineColor: 0x22d3ee,
      shadowAlpha: 0.44,
      width: 648,
    };
  }

  private storyPanelTargetZoom(tone: StoryPanelTone): number {
    const multiplier =
      tone === 'chapter' || tone === 'complete'
        ? 1.12
        : tone === 'summary'
          ? 1.08
          : tone === 'danger'
            ? 1.1
            : 1.05;
    return Phaser.Math.Clamp(this.storyPanelBaseZoom * multiplier, MIN_ZOOM, MAX_ZOOM);
  }

  private beginStoryPanelCinematic(tone: StoryPanelTone, pauseGame: boolean): void {
    this.storyPanelCinematicActive = true;
    this.storyPanelBaseZoom = this.viewportBaseZoom();
    const focus = this.storyPanelFocusTarget ?? this.world.focus;
    this.tweens.killTweensOf(this.storyPanel);
    this.tweens.killTweensOf(this.storyPanelFrame);
    this.tweens.killTweensOf(this.storyPanelAccent);
    this.tweens.killTweensOf(this.storyPortraitBackdrop);
    this.tweens.killTweensOf(this.storyPortraitFrame);
    this.tweens.killTweensOf(this.storyPortraitBadge);
    this.tweens.killTweensOf(this.storyPortraitMonogram);
    this.tweens.killTweensOf(this.storyPortraitName);
    this.tweens.killTweensOf(this.storyPortraitRole);
    this.tweens.killTweensOf(this.storyPortraitKicker);
    this.tweens.killTweensOf(this.cameras.main);
    this.cameras.main.stopFollow();
    this.storyPanel.setAlpha(0);
    this.storyPanelFrame.setAlpha(0);
    this.storyPanelAccent.setAlpha(0);
    this.storyPortraitBackdrop.setAlpha(0);
    this.storyPortraitFrame.setAlpha(0);
    this.storyPortraitBadge.setAlpha(0);
    this.storyPortraitMonogram.setAlpha(0);
    this.storyPortraitName.setAlpha(0);
    this.storyPortraitRole.setAlpha(0);
    this.storyPortraitKicker.setAlpha(0);
    this.tweens.add({
      targets: [
        this.storyPanelFrame,
        this.storyPanelAccent,
        this.storyPanel,
        this.storyPortraitBackdrop,
        this.storyPortraitFrame,
        this.storyPortraitBadge,
        this.storyPortraitMonogram,
        this.storyPortraitName,
        this.storyPortraitRole,
        this.storyPortraitKicker,
      ],
      alpha: 1,
      duration: pauseGame ? 220 : 160,
      ease: 'Quad.easeOut',
    });
    this.cameras.main.pan(focus.x, focus.y, pauseGame ? 260 : 200, 'Quad.easeOut', true);
    this.tweens.add({
      targets: this.cameras.main,
      zoom: this.storyPanelTargetZoom(tone),
      duration: pauseGame ? 260 : 200,
      ease: 'Quad.easeOut',
    });
  }

  private endStoryPanelCinematic(): void {
    this.storyPanelCinematicActive = false;
    this.storyPanelFocusTarget = null;
    this.tweens.killTweensOf(this.storyPanel);
    this.tweens.killTweensOf(this.storyPanelFrame);
    this.tweens.killTweensOf(this.storyPanelAccent);
    this.tweens.killTweensOf(this.storyPortraitBackdrop);
    this.tweens.killTweensOf(this.storyPortraitFrame);
    this.tweens.killTweensOf(this.storyPortraitBadge);
    this.tweens.killTweensOf(this.storyPortraitMonogram);
    this.tweens.killTweensOf(this.storyPortraitName);
    this.tweens.killTweensOf(this.storyPortraitRole);
    this.tweens.killTweensOf(this.storyPortraitKicker);
    this.tweens.killTweensOf(this.cameras.main);
    this.storyPanel.setAlpha(1);
    this.storyPanelFrame.setAlpha(1);
    this.storyPanelAccent.setAlpha(1);
    this.storyPortraitBackdrop.setAlpha(1);
    this.storyPortraitFrame.setAlpha(1);
    this.storyPortraitBadge.setAlpha(1);
    this.storyPortraitMonogram.setAlpha(1);
    this.storyPortraitName.setAlpha(1);
    this.storyPortraitRole.setAlpha(1);
    this.storyPortraitKicker.setAlpha(1);
    this.cameras.main.startFollow(this.focusPoint, true, 0.15, 0.15);
    this.tweens.add({
      targets: this.cameras.main,
      zoom: this.viewportBaseZoom(),
      duration: 180,
      ease: 'Quad.easeInOut',
    });
  }

  private applyStoryPanelTone(tone: StoryPanelTone): void {
    this.storyPanelTone = tone;
    const style = this.storyPanelToneStyle(tone);
    this.storyPanel.setStyle({
      backgroundColor: style.backgroundColor,
      wordWrap: { width: 560, useAdvancedWrap: true },
      padding: { x: 22, y: 16 },
    });
    this.storyPanelAccent.setFillStyle(style.accentColor, 0.95);
    this.storyPortraitBadge.setFillStyle(style.accentColor, 0.95);
    this.storyPortraitKicker.setStyle({ backgroundColor: `${style.backgroundColor.slice(0, -2)}ff` });
    this.storyPortraitRole.setStyle({ backgroundColor: `${style.backgroundColor.slice(0, -2)}d8` });
  }

  private syncStoryPanelFrame(): void {
    const style = this.storyPanelToneStyle(this.storyPanelTone);
    const width = style.width;
    const height = Math.max(228, this.storyPanel.height + 34);
    this.storyPanelFrame.clear();
    this.storyPanelFrame.fillStyle(0x000000, style.shadowAlpha);
    this.storyPanelFrame.fillRoundedRect(-width / 2 + 12, -height / 2 + 12, width, height, 18);
    this.storyPanelFrame.fillStyle(0x020617, 0.9);
    this.storyPanelFrame.fillRoundedRect(-width / 2, -height / 2, width, height, 18);
    this.storyPanelFrame.lineStyle(3, style.lineColor, 0.95);
    this.storyPanelFrame.strokeRoundedRect(-width / 2, -height / 2, width, height, 18);
    this.storyPanelAccent.setDisplaySize(12, Math.max(188, height - 36));

    this.storyPortraitBackdrop.clear();
    this.storyPortraitBackdrop.fillStyle(style.accentColor, 0.16);
    this.storyPortraitBackdrop.fillRoundedRect(-84, -100, 168, 200, 18);
    this.storyPortraitBackdrop.fillStyle(style.lineColor, 0.12);
    this.storyPortraitBackdrop.fillTriangle(-84, 42, 84, -54, 84, 100);
    this.storyPortraitBackdrop.fillStyle(0xf8fafc, 0.08);
    this.storyPortraitBackdrop.fillRect(-72, -90, 144, 8);
    this.storyPortraitBackdrop.fillRect(-72, 68, 144, 8);

    this.storyPortraitFrame.clear();
    this.storyPortraitFrame.fillStyle(0x020617, 0.92);
    this.storyPortraitFrame.fillRoundedRect(-88, -104, 176, 208, 18);
    this.storyPortraitFrame.lineStyle(3, style.lineColor, 0.95);
    this.storyPortraitFrame.strokeRoundedRect(-88, -104, 176, 208, 18);
  }

  private storyPortraitSeed(beat: StoryBeatPresentation): number {
    return `${beat.speaker}|${beat.role ?? ''}|${beat.kicker ?? ''}`
      .split('')
      .reduce((hash, char) => (hash * 33 + char.charCodeAt(0)) >>> 0, 5381);
  }

  private syncStoryPortraitArt(beat: StoryBeatPresentation): void {
    const style = this.storyPanelToneStyle(this.storyPanelTone);
    const seed = this.storyPortraitSeed(beat);
    const profileShift = (seed % 24) - 12;
    const shoulderWidth = 104 + (seed % 28);
    const shoulderHeight = 44 + ((seed >> 3) % 16);
    const auraRadius = 42 + ((seed >> 5) % 12);
    const stripeHeight = 18 + ((seed >> 7) % 16);

    this.storyPortraitBackdrop.clear();
    this.storyPortraitBackdrop.fillStyle(style.accentColor, 0.14);
    this.storyPortraitBackdrop.fillRoundedRect(-84, -100, 168, 200, 18);
    this.storyPortraitBackdrop.fillStyle(style.lineColor, 0.18);
    this.storyPortraitBackdrop.fillTriangle(-84, 54, 84, -38, 84, 100);
    this.storyPortraitBackdrop.fillStyle(0xf8fafc, 0.08);
    this.storyPortraitBackdrop.fillRect(-68, -86, 136, 7);
    this.storyPortraitBackdrop.fillRect(-68, 72, 136, 7);
    this.storyPortraitBackdrop.fillStyle(style.accentColor, 0.18);
    this.storyPortraitBackdrop.fillRect(-84, -100, 168, stripeHeight);
    this.storyPortraitBackdrop.fillCircle(profileShift - 4, -12, auraRadius);
    this.storyPortraitBackdrop.fillStyle(0x020617, 0.78);
    this.storyPortraitBackdrop.fillCircle(profileShift + 8, -20, 30);
    this.storyPortraitBackdrop.fillRoundedRect(
      -shoulderWidth / 2 + profileShift,
      10,
      shoulderWidth,
      shoulderHeight,
      22,
    );
    this.storyPortraitBackdrop.fillRoundedRect(profileShift - 12, -16, 46, 84, 20);
    this.storyPortraitBackdrop.fillStyle(style.lineColor, 0.22);
    this.storyPortraitBackdrop.fillRect(-84, 84, 168, 4);
  }

  private storyPortraitMonogramText(beat: StoryBeatPresentation | undefined): string {
    if (!beat) return '';
    const letters = beat.speaker
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
    return letters || '?';
  }

  private syncStoryPortrait(beat: StoryBeatPresentation | undefined): void {
    const visible = !!beat;
    this.storyPortraitBackdrop.setVisible(visible);
    this.storyPortraitFrame.setVisible(visible);
    this.storyPortraitBadge.setVisible(visible);
    this.storyPortraitMonogram.setVisible(visible);
    this.storyPortraitName.setVisible(visible);
    this.storyPortraitRole.setVisible(visible);
    this.storyPortraitKicker.setVisible(visible && !!beat?.kicker);
    if (!beat) {
      this.storyPortraitBackdrop.clear();
      this.storyPortraitMonogram.setText('');
      this.storyPortraitName.setText('');
      this.storyPortraitRole.setText('');
      this.storyPortraitKicker.setText('');
      return;
    }
    this.syncStoryPortraitArt(beat);
    this.storyPortraitMonogram.setText(this.storyPortraitMonogramText(beat));
    this.storyPortraitName.setText(beat.speaker);
    this.storyPortraitRole.setText(beat.role ?? beat.kicker ?? 'City contact');
    this.storyPortraitKicker.setText(beat.kicker?.toUpperCase() ?? '');
  }

  private storyMissionFocus(plan: Pick<StoryMissionPlan, 'prototypeRuntime' | 'prototypeScript'>): Vec2 | null {
    const focus = storyMissionStartPosition(plan);
    return focus ? { x: focus.x, y: focus.y } : null;
  }

  private chapterOpenerFocus(chapter: StoryChapter): Vec2 | null {
    const firstMission = chapter.missions[0];
    return firstMission ? this.storyMissionFocus(firstMission) : null;
  }

  private missionBriefingFocus(mission: StoryMissionPlan): Vec2 | null {
    return this.storyMissionFocus(mission);
  }

  private missionSummaryFocus(mission: StoryMissionPlan): Vec2 | null {
    return this.storyMissionFocus(mission);
  }

  private presentStoryPanelBeat(beat: StoryPanelBeat): void {
    const requiresAcknowledge = beat.requiresAcknowledge ?? false;
    const pauseGame = beat.pauseGame ?? requiresAcknowledge;
    this.applyStoryPanelTone(beat.tone);
    this.storyPanelFocusTarget = beat.focusTarget ?? null;
    this.syncStoryPortrait(beat.beat);
    this.storyPanel
      .setText(requiresAcknowledge ? `${beat.text}\n\nPress Enter or tap to continue` : beat.text)
      .setVisible(true);
    this.storyPanelFrame.setVisible(true);
    this.storyPanelAccent.setVisible(true);
    this.syncStoryPanelFrame();
    this.beginStoryPanelCinematic(beat.tone, pauseGame);
    this.storyPanelRemaining = requiresAcknowledge ? 0 : Math.max(0, beat.seconds ?? 0);
    this.storyPanelRequiresAcknowledge = requiresAcknowledge;
    this.storyPanelPauseGame = pauseGame;
    if (pauseGame && !this.paused) {
      this.paused = true;
      this.touchControlsDirty = true;
      this.refreshPauseTouchButton();
      this.syncTouchControls();
    }
  }

  private queueStoryPanelSequence(beats: readonly StoryPanelBeat[]): void {
    if (beats.length === 0) return;
    this.storyPanelQueue = beats.slice(1);
    this.presentStoryPanelBeat(beats[0]!);
  }

  private advanceStoryPanelQueue(): boolean {
    const nextBeat = this.storyPanelQueue.shift();
    if (!nextBeat) return false;
    this.presentStoryPanelBeat(nextBeat);
    return true;
  }

  private hideStoryPanel(): void {
    this.endStoryPanelCinematic();
    this.storyPanel.setVisible(false);
    this.storyPanelFrame.setVisible(false);
    this.storyPanelAccent.setVisible(false);
    this.syncStoryPortrait(undefined);
    this.storyPanelQueue = [];
  }

  private showStoryPanel(
    text: string,
    seconds: number,
    tone: StoryPanelTone = 'brief',
    beat?: StoryBeatPresentation,
    focusTarget: Vec2 | null = null,
  ): void {
    this.storyPanelQueue = [];
    this.presentStoryPanelBeat({
      text,
      tone,
      beat,
      focusTarget,
      seconds,
      requiresAcknowledge: false,
      pauseGame: false,
    });
  }

  private showPersistentStoryPanel(
    text: string,
    pauseGame = true,
    tone: StoryPanelTone = 'brief',
    beat?: StoryBeatPresentation,
    focusTarget: Vec2 | null = null,
  ): void {
    this.storyPanelQueue = [];
    this.presentStoryPanelBeat({
      text,
      tone,
      beat,
      focusTarget,
      requiresAcknowledge: true,
      pauseGame,
    });
  }

  private acknowledgeStoryPanel(): void {
    if (this.advanceStoryPanelQueue()) return;
    const shouldResume = this.storyPanelPauseGame && this.paused;
    this.hideStoryPanel();
    this.storyPanelRemaining = 0;
    this.storyPanelRequiresAcknowledge = false;
    this.storyPanelPauseGame = false;
    if (shouldResume) {
      this.paused = false;
      this.touchControlsDirty = true;
      this.refreshPauseTouchButton();
      this.syncTouchControls();
    }
  }

  private syncStoryStateText(): void {
    this.storyStateText.setVisible(false);
  }

  private currentStoryStageKey(): string | null {
    if (this.mode !== 'story' || !this.storyProgress?.current || !this.storyScript) return null;
    return [
      this.storyProgress.current.chapterId,
      this.storyProgress.current.missionId,
      this.storyScript.stageIndex,
    ].join(':');
  }

  private currentStoryActTitle(chapter: { actId: string }): string {
    return STORY_MODE_PROTOTYPE.acts.find((act) => act.id === chapter.actId)?.title ?? chapter.actId;
  }

  private currentStoryCityStandingText(): string {
    if (this.mode !== 'story' || !this.storyProgress) {
      return 'City steady - no lasting shifts yet';
    }
    return formatStoryCityState(
      summarizeStoryCityState(STORY_MODE_PROTOTYPE, this.storyProgress.branchOutcomes),
    );
  }

  private storyChapterById(chapterId: string): StoryChapter | null {
    return STORY_MODE_PROTOTYPE.acts
      .flatMap((act) => act.chapters)
      .find((chapter) => chapter.id === chapterId) ?? null;
  }

  private storyVoiceLine(beat: StoryBeatPresentation | undefined): string | null {
    if (!beat) return null;
    return beat.role ? `Voice: ${beat.speaker} (${beat.role})` : `Voice: ${beat.speaker}`;
  }

  private storyBeatLine(beat: StoryBeatPresentation | undefined): string | null {
    return beat?.kicker ? `Beat: ${beat.kicker}` : null;
  }

  private chapterOpenerBeat(chapter: StoryChapter): StoryBeatPresentation | undefined {
    return chapter.presentation?.opener;
  }

  private missionBriefingBeat(
    chapter: StoryChapter,
    mission: StoryMissionPlan,
  ): StoryBeatPresentation | undefined {
    return mission.presentation?.briefing ?? chapter.presentation?.briefing ?? chapter.presentation?.opener;
  }

  private missionSummaryBeat(
    chapter: StoryChapter,
    mission: StoryMissionPlan,
  ): StoryBeatPresentation | undefined {
    return (
      mission.presentation?.summary ??
      chapter.presentation?.summary ??
      mission.presentation?.briefing ??
      chapter.presentation?.briefing ??
      chapter.presentation?.opener
    );
  }

  private missionBriefingText(
    chapter: StoryChapter,
    mission: StoryMissionPlan,
  ): string {
    const beat = this.missionBriefingBeat(chapter, mission);
    return [
      'MISSION BRIEF',
      mission.title,
      '',
      `Chapter ${chapter.order} • ${chapter.title}`,
      `Act: ${this.currentStoryActTitle(chapter)}`,
      this.storyVoiceLine(beat),
      this.storyBeatLine(beat),
      `Beat: ${chapter.storyRole}`,
      '',
      mission.hook,
      '',
      `Goal: ${mission.primaryGoal}`,
      `Pressure: ${mission.secondaryPressure}`,
      `Failure: ${mission.failureState}`,
      `City Standing: ${this.currentStoryCityStandingText()}`,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');
  }

  private chapterBriefingText(chapter: StoryChapter): string {
    const beat = this.chapterOpenerBeat(chapter);
    return [
      `CHAPTER ${chapter.order}`,
      chapter.title,
      '',
      `Act: ${this.currentStoryActTitle(chapter)}`,
      this.storyVoiceLine(beat),
      this.storyBeatLine(beat),
      `Role: ${chapter.storyRole}`,
      '',
      `Goal: ${chapter.combinedGoal}`,
      `City Standing: ${this.currentStoryCityStandingText()}`,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');
  }

  private chapterOpenerSequence(chapter: StoryChapter, mission: StoryMissionPlan): StoryPanelBeat[] {
    return [
      {
        text: this.chapterBriefingText(chapter),
        tone: 'chapter',
        beat: this.chapterOpenerBeat(chapter),
        focusTarget: this.chapterOpenerFocus(chapter),
        requiresAcknowledge: true,
        pauseGame: true,
      },
      {
        text: this.missionBriefingText(chapter, mission),
        tone: 'brief',
        beat: this.missionBriefingBeat(chapter, mission),
        focusTarget: this.missionBriefingFocus(mission),
        requiresAcknowledge: true,
        pauseGame: true,
      },
    ];
  }

  private chapterCompleteSequence(
    previousChapter: StoryChapter,
    nextChapter: StoryChapter,
    nextMission: StoryMissionPlan,
  ): StoryPanelBeat[] {
    return [
      {
        text: [
          'CHAPTER COMPLETE',
          previousChapter.title,
          '',
          previousChapter.combinedGoal,
          '',
          `City Standing: ${this.currentStoryCityStandingText()}`,
        ].join('\n'),
        tone: 'complete',
        beat: this.chapterOpenerBeat(previousChapter),
        focusTarget: this.chapterOpenerFocus(previousChapter),
        seconds: 1.8,
        pauseGame: false,
      },
      {
        text: [
          `NEXT CHAPTER • ${nextChapter.order}`,
          nextChapter.title,
          '',
          `Act: ${this.currentStoryActTitle(nextChapter)}`,
          this.storyVoiceLine(this.chapterOpenerBeat(nextChapter)),
          this.storyBeatLine(this.chapterOpenerBeat(nextChapter)),
          `Role: ${nextChapter.storyRole}`,
          '',
          `Opening lead: ${nextMission.title}`,
          nextMission.primaryGoal,
        ]
          .filter((line): line is string => Boolean(line))
          .join('\n'),
        tone: 'chapter',
        beat: this.chapterOpenerBeat(nextChapter),
        focusTarget: this.chapterOpenerFocus(nextChapter),
        seconds: 2.2,
        pauseGame: false,
      },
    ];
  }

  private showMissionBriefingPanel(): void {
    if (this.mode !== 'story' || !this.storyProgress) return;
    if (this.selectingStoryMission()) {
      this.showMissionChoicePanel();
      return;
    }
    const chapter = currentStoryChapter(STORY_MODE_PROTOTYPE, this.storyProgress);
    const mission = currentStoryMission(STORY_MODE_PROTOTYPE, this.storyProgress);
    if (!chapter || !mission) return;
    this.showPersistentStoryPanel(
      this.missionBriefingText(chapter, mission),
      true,
      'brief',
      this.missionBriefingBeat(chapter, mission),
      this.missionBriefingFocus(mission),
    );
  }

  private showMissionTransitionPanel(previousMissionId: string): void {
    if (this.mode !== 'story' || !this.storyProgress) return;
    const chapter = currentStoryChapter(STORY_MODE_PROTOTYPE, this.storyProgress);
    const mission = currentStoryMission(STORY_MODE_PROTOTYPE, this.storyProgress);
    if (!chapter) return;
    const previousMission = chapter.missions.find((entry) => entry.id === previousMissionId);
    if (!previousMission) {
      this.showMissionBriefingPanel();
      return;
    }
    const resolvedPreviousMission = resolveStoryMissionPlan(
      previousMission,
      this.storyProgress.branchOutcomes,
      summarizeStoryCityState(STORY_MODE_PROTOTYPE, this.storyProgress.branchOutcomes),
    );
    const summary = this.buildStoryMissionSummaryCard(resolvedPreviousMission, this.storyProgress);
    if (summary) {
      pushStoryMissionScorecard(this.store, {
        chapterTitle: summary.chapterTitle,
        missionTitle: summary.title,
        reward: summary.reward,
        outcome: summary.outcome,
        durationSeconds: summary.durationSeconds,
        collateralText:
          summary.collateralIncidents === 0 && summary.vehicleLosses === 0
            ? 'Clean run'
            : `${summary.collateralIncidents} bystander incidents • ${summary.vehicleLosses} vehicle losses`,
        unlockText: summary.unlockText,
        nextText: summary.nextText,
        vehicleConditionText: summary.vehicleConditionText,
        serviceLaneText: summary.serviceLaneText,
        factionEffectText: summary.factionEffectText,
        cityStateText: summary.cityStateText,
        systemsText: summary.systemsText,
        recordedAt: Date.now(),
      });
      this.showPersistentStoryPanel(
        this.storyMissionSummaryText(summary),
        true,
        'summary',
        chapter ? this.missionSummaryBeat(chapter, resolvedPreviousMission) : undefined,
        this.missionSummaryFocus(resolvedPreviousMission),
      );
      return;
    }
    if (!mission) return;
    const reward = resolvedPreviousMission.prototypeRuntime?.reward ?? 0;
    this.showStoryPanel(
      `MISSION COMPLETE\n${resolvedPreviousMission.title}\nReward: $${reward}\n\n${resolvedPreviousMission.payoff}\n\nNext: ${mission.title}\n${mission.primaryGoal}`,
      4.8,
      'complete',
      chapter ? this.missionSummaryBeat(chapter, resolvedPreviousMission) : undefined,
      this.missionSummaryFocus(resolvedPreviousMission),
    );
  }

  private showMissionChoicePanel(previousMissionId: string | null = null): void {
    if (this.mode !== 'story' || !this.storyProgress) return;
    const chapter = currentStoryChapter(STORY_MODE_PROTOTYPE, this.storyProgress);
    const choices = this.storyMissionChoices();
    if (!chapter || choices.length === 0) return;
    const previousMission = previousMissionId
      ? chapter.missions.find((entry) => entry.id === previousMissionId)
      : null;
    const resolvedPreviousMission = previousMission
      ? resolveStoryMissionPlan(
          previousMission,
          this.storyProgress.branchOutcomes,
          summarizeStoryCityState(STORY_MODE_PROTOTYPE, this.storyProgress.branchOutcomes),
        )
      : null;
    const leads = choices
      .map((mission, index) => `${index + 1}. ${mission.title}\n${mission.primaryGoal}`)
      .join('\n\n');
    const header = resolvedPreviousMission
      ? [
          'MISSION COMPLETE',
          resolvedPreviousMission.title,
          '',
          resolvedPreviousMission.payoff,
          '',
          `City Standing: ${this.currentStoryCityStandingText()}`,
        ].join('\n')
      : [
          `CHAPTER ${chapter.order}`,
          chapter.title,
          '',
          `Role: ${chapter.storyRole}`,
          `City Standing: ${this.currentStoryCityStandingText()}`,
        ].join('\n');
    this.showStoryPanel(
      `${header}\n\nChoose the next lead by driving into a mission marker.\n\n${leads}`,
      6.2,
      'chapter',
      chapter.presentation?.opener,
      resolvedPreviousMission
        ? this.missionSummaryFocus(resolvedPreviousMission)
        : this.chapterOpenerFocus(chapter),
    );
  }

  private showStoryBriefingIfNeeded(): void {
    if (this.mode !== 'story' || !this.storyProgress?.current) return;
    if (this.selectingStoryMission()) {
      this.showMissionChoicePanel();
      return;
    }
    const chapter = currentStoryChapter(STORY_MODE_PROTOTYPE, this.storyProgress);
    const mission = currentStoryMission(STORY_MODE_PROTOTYPE, this.storyProgress);
    if (!chapter || !mission) return;
    if (this.storyProgress.current.objectiveIndex >= 0) return;
    if (mission.id !== chapter.missions[0]?.id) return;
    this.queueStoryPanelSequence(this.chapterOpenerSequence(chapter, mission));
    this.syncStoryStateText();
  }

  private storyChapterTitle(chapterId: string): string {
    return (
      STORY_MODE_PROTOTYPE.acts
        .flatMap((act) => act.chapters)
        .find((chapter) => chapter.id === chapterId)?.title ?? chapterId
    );
  }

  private currentPlayerVehicleHealth(): number | null {
    const carIndex = this.world.drivingCarIndex;
    if (carIndex === null) return null;
    const carHealth = (this.world as unknown as { carHealth: number[] }).carHealth;
    return carHealth[carIndex] ?? null;
  }

  private storyServiceLaneSummary(previousMission: StoryMissionPlan): string {
    const blocked = new Set<string>();
    previousMission.prototypeScript?.stages?.forEach((stage) =>
      stage.districtState?.serviceLaneBlocks?.forEach((kind) => blocked.add(kind)),
    );
    if (blocked.size === 0) return 'No service-lane shifts';
    return `Paused: ${[...blocked].join(' / ')}`;
  }

  private storySystemsText(mission: StoryMissionPlan): string {
    const systems = mission.requiredSystems ?? [];
    if (systems.length === 0) return 'No tracked systems';
    return systems.map(formatStorySystem).join(' · ');
  }

  private storyFactionEffectSummary(
    baseline: StoryMissionSummaryBaseline,
    nextProgress: StoryProgressSnapshot | null,
  ): string {
    if (!nextProgress) return 'No chapter-wide shifts';
    const changed = Object.entries(nextProgress.branchOutcomes).filter(
      ([branchId, outcomeId]) => baseline.branchOutcomes[branchId] !== outcomeId,
    );
    if (changed.length === 0) return 'No chapter-wide shifts';
    return changed
      .map(([branchId, outcomeId]) => this.storyBranchOutcomeLabel(branchId, outcomeId))
      .join(' • ');
  }

  private storyBranchOutcomeLabel(branchId: string, outcomeId: string): string {
    for (const act of STORY_MODE_PROTOTYPE.acts) {
      for (const chapter of act.chapters) {
        for (const mission of chapter.missions) {
          const variant = mission.variants?.find(
            (entry) => entry.branchId === branchId && entry.outcomeId === outcomeId,
          );
          if (variant) return variant.title ?? `${branchId}: ${outcomeId}`;
        }
      }
    }
    return `${branchId}: ${outcomeId}`;
  }

  private syncStoryMissionSummaryBaseline(): void {
    if (this.mode !== 'story' || !this.storyProgress || this.selectingStoryMission()) {
      this.storyMissionSummaryBaseline = null;
      return;
    }
    const chapter = currentStoryChapter(STORY_MODE_PROTOTYPE, this.storyProgress);
    const mission = currentStoryMission(STORY_MODE_PROTOTYPE, this.storyProgress);
    if (!chapter || !mission) {
      this.storyMissionSummaryBaseline = null;
      return;
    }
    if (this.storyMissionSummaryBaseline?.missionId === mission.id) return;
    this.storyMissionSummaryBaseline = {
      chapterId: chapter.id,
      missionId: mission.id,
      kills: this.world.kills,
      targetKills: this.world.targetKills,
      explosionsTriggered: this.world.explosionsTriggered,
      elapsedSeconds: this.world.elapsedSeconds,
      unlockedChapterIds: [...this.storyProgress.unlockedChapterIds],
      completedChapterIds: [...this.storyProgress.completedChapterIds],
      branchOutcomes: { ...this.storyProgress.branchOutcomes },
      playerVehicleHealth: this.currentPlayerVehicleHealth(),
    };
  }

  private buildStoryMissionSummaryCard(
    previousMission: StoryMissionPlan,
    nextProgress: StoryProgressSnapshot | null,
  ): StoryMissionSummaryCard | null {
    const baseline = this.storyMissionSummaryBaseline;
    if (!baseline || baseline.missionId !== previousMission.id) return null;
    const reward = previousMission.prototypeRuntime?.reward ?? 0;
    const collateralIncidents = Math.max(
      0,
      this.world.kills - baseline.kills - (this.world.targetKills - baseline.targetKills),
    );
    const vehicleLosses = Math.max(
      0,
      this.world.explosionsTriggered - baseline.explosionsTriggered,
    );
    const durationSeconds = Math.max(
      1,
      Math.round(this.world.elapsedSeconds - baseline.elapsedSeconds),
    );
    const unlocked = nextProgress
      ? nextProgress.unlockedChapterIds.filter(
          (chapterId) => !baseline.unlockedChapterIds.includes(chapterId),
        )
      : [];
    const completed = nextProgress
      ? nextProgress.completedChapterIds.filter(
          (chapterId) => !baseline.completedChapterIds.includes(chapterId),
        )
      : [];
    const unlockLines = [
      ...completed.map((chapterId) => `Chapter complete: ${this.storyChapterTitle(chapterId)}`),
      ...unlocked
        .filter((chapterId) => !completed.includes(chapterId))
        .map((chapterId) => `Unlocked: ${this.storyChapterTitle(chapterId)}`),
    ];
    const nextChoices = nextProgress
      ? currentStoryMissionChoices(STORY_MODE_PROTOTYPE, nextProgress)
      : [];
    const nextMission = nextProgress
      ? currentStoryMission(STORY_MODE_PROTOTYPE, nextProgress)
      : null;
    const nextText = nextProgress?.current
      ? nextChoices.length > 0
        ? `Choose next lead: ${nextChoices.map((mission) => mission.title).join(' / ')}`
        : `Next: ${nextMission?.title ?? 'Continue story'}`
      : 'Story complete';
    const chapterId =
      baseline.chapterId ?? nextProgress?.current?.chapterId ?? this.storyProgress?.current?.chapterId;
    const chapter = chapterId ? this.storyChapterById(chapterId) : null;
    const startHealth =
      typeof baseline.playerVehicleHealth === 'number' || baseline.playerVehicleHealth === null
        ? baseline.playerVehicleHealth
        : null;
    const endHealth = this.currentPlayerVehicleHealth();
    const vehicleConditionText =
      startHealth === null && endHealth === null
        ? 'No tracked player vehicle'
        : startHealth === null
          ? `Vehicle swap • ended at ${Math.round(endHealth ?? 0)}%`
          : endHealth === null
            ? `Vehicle lost • started at ${Math.round(startHealth)}%`
            : `${Math.round(startHealth)}% → ${Math.round(endHealth)}%`;
    const beat = chapter ? this.missionSummaryBeat(chapter, previousMission) : undefined;
    return {
      chapterTitle: chapter?.title ?? chapterId ?? 'Current chapter',
      title: previousMission.title,
      voiceText: this.storyVoiceLine(beat),
      beatText: this.storyBeatLine(beat),
      reward,
      outcome: previousMission.payoff,
      durationSeconds,
      collateralIncidents,
      vehicleLosses,
      vehicleConditionText,
      serviceLaneText: this.storyServiceLaneSummary(previousMission),
      factionEffectText: this.storyFactionEffectSummary(baseline, nextProgress),
      cityStateText: formatStoryCityState(
        summarizeStoryCityState(
          STORY_MODE_PROTOTYPE,
          nextProgress?.branchOutcomes ?? baseline.branchOutcomes,
        ),
      ),
      systemsText: this.storySystemsText(previousMission),
      unlockText: unlockLines.length > 0 ? unlockLines.join(' • ') : 'No new unlocks',
      nextText,
    };
  }

  private storyMissionSummaryText(card: StoryMissionSummaryCard): string {
    const collateralText =
      card.collateralIncidents === 0 && card.vehicleLosses === 0
        ? 'Clean run'
        : `${card.collateralIncidents} bystander incidents • ${card.vehicleLosses} vehicle losses`;
    return [
      'MISSION SUMMARY',
      card.title,
      '',
      `Chapter: ${card.chapterTitle}`,
      card.voiceText,
      card.beatText,
      `Objective Outcome: ${card.outcome}`,
      `Story Changes: ${card.unlockText}`,
      `City Standing: ${card.cityStateText}`,
      card.nextText,
      '',
      `Reward: $${card.reward}`,
      `Duration: ${card.durationSeconds}s`,
      `Damage / Collateral: ${collateralText}`,
      `Vehicle Condition: ${card.vehicleConditionText}`,
      `Service Lanes: ${card.serviceLaneText}`,
      `Faction Effects: ${card.factionEffectText}`,
      `Systems: ${card.systemsText}`,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');
  }

  private carTexture(index: number): TextureRef {
    const kind = this.world.carKind(index);
    if (kind === 'ambulance') return textureRef(TEX.ambulance);
    if (kind === 'tow') return textureRef(TEX.tow);
    if (kind === 'police') return textureRef(TEX.policeCar);
    if (kind === 'taxi') return textureRef(TEX.taxi);
    const seed = stableVisualSeed(index + 1, kind.length * 13);
    if (kind === 'sedan') return pickVariantTexture(CIVILIAN_VEHICLE_TEXTURES.sedan, seed);
    if (kind === 'coupe') return pickVariantTexture(CIVILIAN_VEHICLE_TEXTURES.coupe, seed);
    if (kind === 'muscle') return pickVariantTexture(CIVILIAN_VEHICLE_TEXTURES.muscle, seed);
    if (kind === 'sports') return pickVariantTexture(CIVILIAN_VEHICLE_TEXTURES.sports, seed);
    if (kind === 'pickup') return pickVariantTexture(CIVILIAN_VEHICLE_TEXTURES.pickup, seed);
    if (kind === 'van') return pickVariantTexture(CIVILIAN_VEHICLE_TEXTURES.van, seed);
    if (kind === 'limo') return pickVariantTexture(CIVILIAN_VEHICLE_TEXTURES.limo, seed);
    return index === this.world.drivingCarIndex
      ? textureRef(TEX.playerCar)
      : pickVariantTexture(CIVILIAN_VEHICLE_TEXTURES.car, seed);
  }

  private carDamageTint(healthRatio: number): number | null {
    const severity = 1 - healthRatio;
    if (severity < 0.2) return null;
    const target = severity > 0.55 ? 0x8b5a3c : 0x94a3b8;
    return blendColor(0xffffff, target, Math.min(0.6, severity * 0.8));
  }

  private syncSprites(): void {
    this.world.cars.forEach((car, i) => {
      const size = vehicleBodySpecForKind(this.world.carKind(i));
      const healthRatio = this.world.carHealthRatio(i);
      const liveTexture = this.carTexture(i);
      let sprite = this.carSprites[i];
      if (!sprite) {
        sprite = this.spawnImage(car.pos.x, car.pos.y, liveTexture).setDisplaySize(size.spriteWidth, size.spriteHeight).setDepth(4);
        this.carSprites[i] = sprite;
      }
      if (this.world.towedCars[i] && this.world.wreckedCars[i]) {
        sprite.setVisible(false); // hauled away by a tow truck
        return;
      }
      if (this.world.wreckedCars[i]) {
        // A destroyed car is a charred, static wreck.
        const wreckFrame = effectFrame(FX.wreck.frames, Math.floor(this.time.now / 260 + i));
        sprite
          .setVisible(true)
          .setTexture(FX.wreck.texture, wreckFrame)
          .setDisplaySize(size.spriteWidth + 6, size.spriteHeight + 4)
          .setTint(0xffffff)
          .setPosition(car.pos.x, car.pos.y)
          .setRotation(car.heading);
        return;
      }
      if (this.world.carIsBurning(i)) {
        sprite
          .setVisible(true)
          .setTexture(liveTexture.texture, liveTexture.frame)
          .setDisplaySize(size.spriteWidth, size.spriteHeight)
          .setTint(this.burningCarTint(i))
          .setPosition(car.pos.x, car.pos.y)
          .setRotation(car.heading);
        return;
      }
      const damageTint = this.carDamageTint(healthRatio);
      sprite
        .setVisible(true)
        .setTexture(liveTexture.texture, liveTexture.frame)
        .setDisplaySize(size.spriteWidth, size.spriteHeight)
        .setPosition(car.pos.x, car.pos.y)
        .setRotation(car.heading);
      if (damageTint === null) sprite.clearTint();
      else sprite.setTint(damageTint);
    });

    // Pedestrians can be removed (run over): hide any surplus sprites.
    this.world.pedestrians.forEach((ped, i) => {
      const pedTexture = this.pedTexture(ped, i);
      let sprite = this.pedSprites[i];
      if (!sprite) {
        sprite = this.spawnImage(ped.pos.x, ped.pos.y, pedTexture).setDepth(5);
        this.pedSprites[i] = sprite;
      }
      const moving = Math.hypot(ped.pos.x - sprite.x, ped.pos.y - sprite.y) > 0.12 && ped.state !== 'wait';
      this.applyTextureFrame(sprite, pedTexture, this.animatedFrame(pedTexture, moving, 170))
        .setVisible(true)
        .setPosition(ped.pos.x, ped.pos.y)
        .setRotation(ped.heading);
      if (ped.missionTarget) {
        sprite.setTint(COLORS.marker);
      } else if (ped.taxiPassengerRole === 'playerFare') {
        sprite.setTint(COLORS.taxiMarker);
      } else {
        sprite.clearTint();
      }
    });
    for (let i = this.world.pedestrians.length; i < this.pedSprites.length; i++) {
      this.pedSprites[i].setVisible(false);
    }

    // Ammo crates can respawn as fresh pickup objects, so the pool must grow
    // dynamically and track the current live pickups by index rather than identity.
    this.world.ammoPickups.forEach((pickup, i) => {
      let entry = this.ammoSprites[i];
      if (!entry) {
        entry = {
          pickup,
          sprite: this.add.image(pickup.pos.x, pickup.pos.y, TEX.ammo).setDepth(5),
        };
        this.ammoSprites[i] = entry;
      }
      entry.pickup = pickup;
      entry.sprite.setVisible(true).setPosition(pickup.pos.x, pickup.pos.y);
    });
    for (let i = this.world.ammoPickups.length; i < this.ammoSprites.length; i++) {
      this.ammoSprites[i].sprite.setVisible(false);
    }

    // Police spawn dynamically and arrive on foot or in patrol cars. While a
    // chase is on, their lights flash red/blue.
    const flashBlue = Math.floor(this.time.now / 200) % 2 === 0;
    const lightTint = flashBlue ? 0x60a5fa : 0xf87171;
    this.world.police.forEach((cop, i) => {
      const copTexture = cop.kind === 'car' ? textureRef(TEX.policeCar) : textureRef(TEX.policeFoot);
      let sprite = this.policeSprites[i];
      if (!sprite) {
        sprite = this.spawnImage(cop.pos.x, cop.pos.y, textureRef(TEX.policeFoot)).setDepth(6);
        this.policeSprites[i] = sprite;
      }
      const moving = Math.hypot(cop.pos.x - sprite.x, cop.pos.y - sprite.y) > 0.12;
      this.applyTextureFrame(
        sprite,
        copTexture,
        cop.kind === 'car' ? copTexture.frame : this.animatedFrame(copTexture, moving, 155),
      )
        .setVisible(true)
        .setTint(lightTint)
        .setPosition(cop.pos.x, cop.pos.y)
        .setRotation(cop.heading);
    });
    for (let i = this.world.police.length; i < this.policeSprites.length; i++) {
      this.policeSprites[i].setVisible(false);
    }

    this.syncBurningCars();
    this.syncBullets();
    this.syncExplosions();
    this.syncLights();
    this.syncCorpses();
    this.syncAmbulance();
    this.syncTow();

    this.storyChoiceMarkersGfx.clear();
    if (this.selectingStoryMission()) {
      this.storyChoiceMarkersGfx.lineStyle(3, COLORS.marker, 1).fillStyle(COLORS.marker, 0.12);
      for (const choice of this.storyMissionChoiceTargets()) {
        this.storyChoiceMarkersGfx.strokeCircle(choice.target.x, choice.target.y, 52);
        this.storyChoiceMarkersGfx.fillCircle(choice.target.x, choice.target.y, 52);
      }
    }

    // Mission marker: show the ring while the active objective points to a fixed place.
    const objective = this.world.missionObjective;
    if (this.selectingStoryMission()) {
      this.missionMarker.setVisible(false);
    } else if (objective && (objective.kind === 'reach' || objective.kind === 'defend')) {
      this.missionMarker.setVisible(true).setPosition(objective.target.x, objective.target.y);
    } else if (objective && (objective.kind === 'route' || objective.kind === 'sabotage')) {
      const completed =
        this.world.mission?.objectiveState?.kind === 'route'
          ? this.world.mission.objectiveState.completed
          : 0;
      const target = objective.targets[completed];
      if (target) this.missionMarker.setVisible(true).setPosition(target.x, target.y);
      else this.missionMarker.setVisible(false);
    } else {
      const storyTarget = this.storyMissionTargetPosition();
      if (storyTarget)
        this.missionMarker.setVisible(true).setPosition(storyTarget.x, storyTarget.y);
      else this.missionMarker.setVisible(false);
    }
    const taxiTarget = this.world.taxiTarget;
    if (taxiTarget) {
      this.taxiMarker.setVisible(true).setPosition(taxiTarget.x, taxiTarget.y);
    } else {
      this.taxiMarker.setVisible(false);
    }
    const serviceMission = this.world.serviceMission;
    const serviceTarget = this.world.serviceTarget;
    if (serviceMission && serviceTarget) {
      const color = this.serviceMarkerColor(serviceMission.kind);
      this.serviceMarker
        .setVisible(true)
        .setPosition(serviceTarget.x, serviceTarget.y)
        .setFillStyle(color, 0.12)
        .setStrokeStyle(3, color);
    } else {
      this.serviceMarker.setVisible(false);
    }

    const p = this.world.player;
    const playerTexture = textureRef(TEX.player);
    const playerMoving = Math.hypot(p.pos.x - this.playerSprite.x, p.pos.y - this.playerSprite.y) > 0.15;
    this.applyTextureFrame(this.playerSprite, playerTexture, this.animatedFrame(playerTexture, playerMoving, 145));
    this.playerSprite.setPosition(p.pos.x, p.pos.y);
    this.playerSprite.setRotation(p.angle);
    this.playerSprite.setVisible(!this.world.isDriving);

    const focus = this.world.focus;
    const jump = Math.hypot(focus.x - this.focusPoint.x, focus.y - this.focusPoint.y);
    this.focusPoint.setPosition(focus.x, focus.y);
    // On a wrap the focus leaps the width/height of the map; recentre the camera
    // instantly so it doesn't sweep across everything in between.
    if (jump > WRAP_SNAP_DISTANCE) {
      const cameraFocus = this.storyPanelCinematicActive ? this.storyPanelFocusTarget ?? focus : focus;
      this.cameras.main.centerOn(cameraFocus.x, cameraFocus.y);
    }

    this.syncHudText();
    this.syncBustedText();
  }


  private syncVisualFeedback(dt: number): void {
    const currentPickups = new Map<string, AmmoPickup>();
    for (const pickup of this.world.ammoPickups) {
      currentPickups.set(pickupVisualKey(pickup), pickup);
    }
    for (const [key, pickup] of this.prevAmmoPickups) {
      if (!currentPickups.has(key)) this.emitPickupParticles(pickup.pos);
    }

    const nextCarHealth: number[] = [];
    const nextCarHeadings: number[] = [];
    this.world.cars.forEach((car, i) => {
      const healthRatio = this.world.carHealthRatio(i);
      const prevHealthRatio = this.prevCarHealth[i];
      if (prevHealthRatio !== undefined && healthRatio < prevHealthRatio - 0.015 && !this.world.wreckedCars[i]) {
        this.emitHitParticles(car.pos, car.heading, prevHealthRatio - healthRatio);
      }

      const prevHeading = this.prevCarHeadings[i];
      if (
        prevHeading !== undefined &&
        Math.abs(Phaser.Math.Angle.Wrap(car.heading - prevHeading)) > 0.11 &&
        Math.abs(car.speed) > 110 &&
        !this.world.wreckedCars[i] &&
        !this.world.carIsBurning(i)
      ) {
        this.emitSkidParticles(car);
      }

      nextCarHealth[i] = healthRatio;
      nextCarHeadings[i] = car.heading;
    });

    this.prevAmmoPickups = currentPickups;
    this.prevCarHealth = nextCarHealth;
    this.prevCarHeadings = nextCarHeadings;

    this.syncDamageOverlays();
    this.syncFeedbackParticles(dt);
  }

  private emitHitParticles(pos: Vec2, heading: number, severity: number): void {
    const forward = fromAngle(heading, 1);
    const side = fromAngle(heading + Math.PI / 2, 1);
    const count = Math.min(9, 4 + Math.round(severity * 20));
    for (let i = 0; i < count; i++) {
      const sideOffset = (i - (count - 1) / 2) * 1.8;
      const drift = 60 + severity * 160 + i * 5;
      this.visualParticles.push({
        pos: vec2(pos.x + side.x * sideOffset, pos.y + side.y * sideOffset),
        vel: vec2(
          forward.x * (drift * 0.45) + side.x * sideOffset * 12,
          forward.y * (drift * 0.45) + side.y * sideOffset * 12,
        ),
        age: 0,
        life: 0.28 + severity * 0.18,
        radius: 1.5 + severity * 1.8,
        color: i % 3 === 0 ? COLORS.sparkCore : COLORS.spark,
        alpha: 0.85,
        stretch: 10 + severity * 8,
      });
    }
  }

  private emitPickupParticles(pos: Vec2): void {
    for (let i = 0; i < 8; i++) {
      const heading = (Math.PI * 2 * i) / 8;
      const burst = fromAngle(heading, 45 + i * 8);
      this.visualParticles.push({
        pos: vec2(pos.x, pos.y),
        vel: burst,
        age: 0,
        life: 0.45,
        radius: i % 2 === 0 ? 2.4 : 1.8,
        color: i % 2 === 0 ? COLORS.pickupCore : COLORS.pickupSpark,
        alpha: 0.9,
        stretch: 6,
      });
    }
  }

  private emitSkidParticles(car: Car): void {
    const rear = fromAngle(car.heading + Math.PI, car.radius * 0.48);
    const side = fromAngle(car.heading + Math.PI / 2, car.radius * 0.34);
    const drift = fromAngle(car.heading + Math.PI, 28 + Math.min(60, Math.abs(car.speed) * 0.18));
    for (const dir of [-1, 1] as const) {
      this.visualParticles.push({
        pos: vec2(car.pos.x + rear.x + side.x * dir, car.pos.y + rear.y + side.y * dir),
        vel: vec2(drift.x + side.x * dir * 8, drift.y + side.y * dir * 8),
        age: 0,
        life: 0.36,
        radius: 2.2,
        color: COLORS.skid,
        alpha: 0.38,
        stretch: 14,
      });
    }
  }

  private syncFeedbackParticles(dt: number): void {
    const g = this.feedbackGfx;
    g.clear();
    const next: VisualParticle[] = [];
    for (const particle of this.visualParticles) {
      const age = particle.age + dt;
      if (age >= particle.life) continue;
      const drag = Math.max(0, 1 - dt * 4.5);
      const vel = vec2(particle.vel.x * drag, particle.vel.y * drag);
      const pos = vec2(particle.pos.x + vel.x * dt, particle.pos.y + vel.y * dt);
      const alpha = particle.alpha * (1 - age / particle.life);
      g.lineStyle(Math.max(1, particle.radius * 0.65), particle.color, alpha * 0.85);
      g.lineBetween(
        pos.x,
        pos.y,
        pos.x - vel.x * 0.03 * particle.stretch,
        pos.y - vel.y * 0.03 * particle.stretch,
      );
      g.fillStyle(particle.color, alpha);
      g.fillCircle(pos.x, pos.y, particle.radius);
      next.push({ ...particle, pos, vel, age });
    }
    this.visualParticles = next;
  }

  private syncDamageOverlays(): void {
    this.world.cars.forEach((car, i) => {
      let sprite = this.damageSprites[i];
      if (!sprite) {
        sprite = this.add.image(car.pos.x, car.pos.y, FX.damage.texture, FX.damage.frames[0]).setDepth(4.6);
        this.damageSprites[i] = sprite;
      }

      if (this.world.wreckedCars[i] || this.world.towedCars[i] || this.world.carIsBurning(i)) {
        sprite.setVisible(false);
        return;
      }

      const severity = 1 - this.world.carHealthRatio(i);
      if (severity < 0.22) {
        sprite.setVisible(false);
        return;
      }

      this.applyTextureFrame(
        sprite,
        { texture: FX.damage.texture },
        effectFrame(FX.damage.frames, severity > 0.58 ? 1 : 0),
      )
        .setVisible(true)
        .setPosition(car.pos.x, car.pos.y)
        .setRotation(car.heading)
        .setScale(car.radius / 14)
        .setAlpha(0.26 + severity * 0.45);
    });
  }

  /** Build the multi-line HUD: wanted, health, money, weapon, and controls. */
  private hudText(): string {
    const w = this.world;
    const stars = '★'.repeat(w.wantedStars) || '—';
    const hp = `${Math.ceil(w.health.current)}/${w.health.max}`;
    const money =
      w.score.best > 0 ? `$${w.score.current}  (best $${w.score.best})` : `$${w.score.current}`;
    const speed = w.drivingCar ? Math.round(Math.abs(w.drivingCar.speed)) : 0;

    const ammo =
      w.weapon.ammo <= 4
        ? `Pistol ${w.weapon.ammo}  ⚠ LOW — grab a crate`
        : `Pistol ${w.weapon.ammo}`;

    const status = this.touchEnabled
      ? w.isDriving
        ? `DRIVING ${speed}  ·  touch stick move · tap buttons shoot/exit · pause top-right`
        : 'ON FOOT  ·  touch stick move · tap buttons interact/shoot · pause top-right'
      : w.isDriving
        ? `DRIVING ${speed}  ·  WASD steer · Space exit · F shoot · P pause`
        : 'ON FOOT  ·  WASD move · Space car · F shoot · P pause';
    const objective = w.missionObjective?.description;
    const compactObjective =
      objective && objective.startsWith('Go to the mission marker to start ')
        ? 'Go to the mission marker'
        : objective;
    const progress = w.missionProgress;
    const objectiveLine = compactObjective
      ? `OBJECTIVE ${compactObjective}${progress ? ` (${progress.current}/${progress.goal})` : ''}`
      : null;

    return [`WANTED ${stars}    HP ${hp}`, `${money}    ${ammo}`, status, objectiveLine]
      .filter((line): line is string => !!line)
      .join('\n');
  }

  private syncHudText(): void {
    const text = this.hudText();
    if (text === this.prevHudText) return;
    this.prevHudText = text;
    this.hud.setText(text);
    this.layoutHud();
  }

  private syncBustedText(): void {
    if (this.world.status === 'playing') {
      this.prevBustedMessage = '';
      this.bustedText.setVisible(false);
      return;
    }
    const title = this.world.isWasted ? 'WASTED' : 'BUSTED';
    const text = `${title}\n\nRespawning in ${this.world.respawnIn}s\nPress Enter to continue`;
    if (text !== this.prevBustedMessage) {
      this.prevBustedMessage = text;
      this.bustedText.setText(text);
    }
    this.bustedText.setVisible(true);
  }

  private touchControlsKey(snapshot?: TouchSnapshot): string {
    const layout = this.touchLayout;
    if (!layout || !this.touchEnabled) return 'hidden';
    const confirm = layout.confirm;
    return [
      this.paused || this.world.status !== 'playing' ? 'confirm' : 'pause',
      snapshot?.movePointer ? 'move' : 'rest',
      snapshot?.actionPressed ? 'action' : 'idle',
      snapshot?.firePressed ? 'fire' : 'idle',
      snapshot?.confirmPressed ? 'confirm' : 'idle',
      (snapshot?.knob.x ?? layout.move.center.x).toFixed(1),
      (snapshot?.knob.y ?? layout.move.center.y).toFixed(1),
      layout.move.center.x.toFixed(1),
      layout.move.center.y.toFixed(1),
      layout.action.center.x.toFixed(1),
      layout.action.center.y.toFixed(1),
      layout.fire.center.x.toFixed(1),
      layout.fire.center.y.toFixed(1),
      confirm
        ? `${confirm.center.x.toFixed(1)},${confirm.center.y.toFixed(1)},${confirm.radius.toFixed(1)}`
        : 'none',
      this.cameras.main.zoom.toFixed(3),
    ].join('|');
  }

  private syncTouchControls(snapshot = this.touchInput_?.snapshot()): void {
    if (!this.touchControlsGfx) return;
    const layout = this.touchLayout;
    if (!layout || !this.touchEnabled) {
      this.prevTouchControlsKey = 'hidden';
      this.touchControlsDirty = false;
      this.touchControlsGfx.setVisible(false);
      return;
    }
    const key = this.touchControlsKey(snapshot);
    if (!this.touchControlsDirty && key === this.prevTouchControlsKey) return;
    this.prevTouchControlsKey = key;
    this.touchControlsDirty = false;
    this.touchControlsGfx.clear();
    this.touchControlsGfx.setVisible(true);
    if (!snapshot) return;
    const confirmMode = this.paused || this.world.status !== 'playing';
    const { width, height } = this.scale.gameSize;
    const zoom = this.cameras.main.zoom;
    const counter = uiCounterScale(zoom);
    const origin = uiScreenToWorld(vec2(0, 0), { width, height }, zoom);
    this.touchControlsGfx.setPosition(origin.x, origin.y).setScale(counter);

    this.touchControlsGfx.lineStyle(3, TOUCH_STICK_STROKE, 0.52);
    this.touchControlsGfx.fillStyle(TOUCH_STICK_FILL, 0.22 * TOUCH_ALPHA);
    this.touchControlsGfx.fillCircle(
      layout.move.center.x,
      layout.move.center.y,
      layout.move.radius,
    );
    this.touchControlsGfx.strokeCircle(
      layout.move.center.x,
      layout.move.center.y,
      layout.move.radius,
    );

    this.touchControlsGfx.fillStyle(
      TOUCH_STICK_STROKE,
      snapshot.movePointer ? 0.42 * TOUCH_ALPHA : 0.28 * TOUCH_ALPHA,
    );
    this.touchControlsGfx.fillCircle(snapshot.knob.x, snapshot.knob.y, layout.move.knobRadius);

    const drawButton = (center: Vec2, radius: number, color: number, pressed: boolean): void => {
      this.touchControlsGfx.lineStyle(3, color, 0.82);
      this.touchControlsGfx.fillStyle(color, (pressed ? 0.38 : 0.18) * TOUCH_ALPHA);
      this.touchControlsGfx.fillCircle(center.x, center.y, radius);
      this.touchControlsGfx.strokeCircle(center.x, center.y, radius);
    };

    drawButton(layout.action.center, layout.action.radius, TOUCH_ACTION, snapshot.actionPressed);
    drawButton(layout.fire.center, layout.fire.radius, TOUCH_FIRE, snapshot.firePressed);
    if (layout.confirm) {
      drawButton(
        layout.confirm.center,
        layout.confirm.radius,
        TOUCH_CONFIRM,
        snapshot.confirmPressed,
      );
    }

    const drawPauseGlyph = (center: Vec2, radius: number): void => {
      this.touchControlsDirty = true;
      const w = radius * 0.28;
      const h = radius * 0.78;
      this.touchControlsGfx.fillStyle(0xf8fafc, 0.9);
      this.touchControlsGfx.fillRect(center.x - w * 1.45, center.y - h / 2, w, h);
      this.touchControlsGfx.fillRect(center.x + w * 0.45, center.y - h / 2, w, h);
    };

    const drawConfirmGlyph = (center: Vec2, radius: number): void => {
      this.touchControlsGfx.lineStyle(4, 0xf8fafc, 0.9);
      this.touchControlsGfx.beginPath();
      this.touchControlsGfx.moveTo(center.x - radius * 0.42, center.y + radius * 0.02);
      this.touchControlsGfx.lineTo(center.x - radius * 0.1, center.y + radius * 0.32);
      this.touchControlsGfx.lineTo(center.x + radius * 0.46, center.y - radius * 0.28);
      this.touchControlsGfx.strokePath();
    };

    const drawActionGlyph = (center: Vec2, radius: number): void => {
      this.touchControlsGfx.lineStyle(3, 0xf8fafc, 0.88);
      this.touchControlsGfx.strokeCircle(center.x, center.y, radius * 0.34);
      this.touchControlsGfx.beginPath();
      this.touchControlsGfx.moveTo(center.x + radius * 0.12, center.y);
      this.touchControlsGfx.lineTo(center.x + radius * 0.52, center.y);
      this.touchControlsGfx.lineTo(center.x + radius * 0.34, center.y - radius * 0.18);
      this.touchControlsGfx.moveTo(center.x + radius * 0.52, center.y);
      this.touchControlsGfx.lineTo(center.x + radius * 0.34, center.y + radius * 0.18);
      this.touchControlsGfx.strokePath();
    };

    const drawFireGlyph = (center: Vec2, radius: number): void => {
      this.touchControlsGfx.lineStyle(3, 0xf8fafc, 0.88);
      this.touchControlsGfx.strokeCircle(center.x, center.y, radius * 0.12);
      this.touchControlsGfx.beginPath();
      this.touchControlsGfx.moveTo(center.x - radius * 0.44, center.y);
      this.touchControlsGfx.lineTo(center.x - radius * 0.18, center.y);
      this.touchControlsGfx.moveTo(center.x + radius * 0.18, center.y);
      this.touchControlsGfx.lineTo(center.x + radius * 0.44, center.y);
      this.touchControlsGfx.moveTo(center.x, center.y - radius * 0.44);
      this.touchControlsGfx.lineTo(center.x, center.y - radius * 0.18);
      this.touchControlsGfx.moveTo(center.x, center.y + radius * 0.18);
      this.touchControlsGfx.lineTo(center.x, center.y + radius * 0.44);
      this.touchControlsGfx.strokePath();
    };

    drawActionGlyph(layout.action.center, layout.action.radius);
    drawFireGlyph(layout.fire.center, layout.fire.radius);
    if (layout.confirm) {
      if (confirmMode) drawConfirmGlyph(layout.confirm.center, layout.confirm.radius);
      else drawPauseGlyph(layout.confirm.center, layout.confirm.radius);
    }
  }
}
