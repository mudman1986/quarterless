import { type Vec2, vec2, add, sub, scale, normalize, length, distance, dot, fromAngle, angle } from './vector';
import {
  type Rect,
  resolveCircleRects,
  resolveCircleCircles,
  circleIntersectsRect,
  segmentIntersectsRect,
  pointInRect,
  randomPointInRect,
} from './collision';
import { wrap } from './math';
import {
  type Car,
  type CarTuning,
  DEFAULT_CAR_TUNING,
  stepCar,
  carWallRetention,
  collideCarWithWalls,
  collideCars,
} from './vehicle';
import { type OnFootActor, walk } from './entity';
import { ARRIVE_RADIUS, PANIC_RADIUS, type Pedestrian, stepPedestrian, wanderTarget } from './pedestrianAI';
import { type Police, policeSpeedFor, stepPolice, stepPoliceCar, hasCaught } from './policeAI';
import {
  type TrafficAI,
  stepTraffic,
  TRAFFIC_SPEED,
  obstacleAhead,
  laneChangeTarget,
  tileCoord,
  isIntersection,
  openDirections,
} from './trafficAI';
import { type RoadVehicle, stepRoadVehicle, seekChooser, nearestCardinal, laneCross } from './roadVehicle';
import {
  type TrafficLights,
  createTrafficLights,
  tickLights,
  hasGreen,
} from './trafficLight';
import { type City, tileCenter } from './city';
import {
  type NavGrid,
  type FlowField,
  buildNavGrid,
  computeFlowField,
  flowWaypoint,
} from './navigation';
import { type PedestrianGraph, buildPedestrianGraph, nextWanderNode } from './pedestrianGraph';
import {
  type WantedState,
  createWanted,
  stars,
  isWanted,
  addHeat,
  decay,
  CRIME_HEAT,
} from './wantedLevel';
import {
  type Weapon,
  type Bullet,
  type AmmoPickup,
  createPistol,
  cool,
  fire,
  giveAmmo,
  stepBullet,
  bulletHits,
} from './weapon';
import { type Health, createHealth, damage, isDead } from './health';
import { type Score, createScore, award } from './score';
import {
  type Mission,
  type Objective,
  type MissionBaseline,
  type ObjectiveProgress,
  type ServiceCompletionCounts,
  currentObjective,
  updateMission,
  isComplete,
  objectiveProgress,
  resetMission,
} from './mission';
import {
  type Campaign,
  createCampaign,
  currentMission,
  isCampaignComplete,
  updateCampaign,
} from './campaign';
import type { Controls } from './types';

export interface WorldOptions {
  player: OnFootActor;
  cars?: Car[];
  walls?: Rect[];
  pedestrians?: Pedestrian[];
  police?: Police[];
  /** Points at which police appear while the player is wanted. */
  policeSpawns?: Vec2[];
  /** Map extent, used by pedestrian wandering. */
  bounds?: { width: number; height: number };
  /** Distance from the focus within which a corpse is "in frame". */
  viewRadius?: number;
  /** Lethal water regions; the player is wasted if their centre is over one. */
  water?: Rect[];
  /** Sidewalk strips wandering pedestrians keep to. */
  sidewalks?: Rect[];
  /** How close the player must be to a car to enter it. */
  enterRadius?: number;
  carTuning?: CarTuning;
  /** City grid; required for NPC traffic to follow the roads. */
  city?: City;
  /** Per-car NPC driver (or null for a parked car), parallel to `cars`. */
  carDrivers?: (TrafficAI | null)[];
  /** Render / behavior kind for each world car, parallel to `cars`. */
  carKinds?: VehicleKind[];
  /** Whether each initial car slot should recycle back into traffic after towing. */
  carRespawnsAtTow?: boolean[];
  /** Fallback player respawn point when the map has no matching facility. */
  spawn?: Vec2;
  /** The player's starting weapon. Defaults to a pistol. */
  weapon?: Weapon;
  /** Maximum player health. */
  maxHealth?: number;
  /** Previous best score to seed the high score with. */
  bestScore?: number;
  /** An optional scripted mission to track. */
  mission?: Mission;
  /** An optional series of missions played one after another. */
  missions?: Mission[];
  /** A pool of campaigns played endlessly: when one finishes, a random other
   * begins, so the action never stops. Takes precedence over `missions`. */
  campaigns?: Mission[][];
  /** Ammo pickups scattered around the map. */
  ammoPickups?: AmmoPickup[];
  /** RNG injected for deterministic pedestrian wandering in tests. */
  rng?: () => number;
}

/** Gap left between the player and the car when exiting. */
const EXIT_GAP = 4;
/** Minimum car speed (px/s) that counts as running a pedestrian over. */
const RUN_OVER_SPEED = 45;
/** Seconds the busted screen shows before the player is respawned. */
const RESPAWN_DELAY = 10;
/** A car moving faster than this outruns capture; slower or on foot you get busted. */
const BUST_SPEED = 40;
/** A player car must be effectively stopped to be arrested from it. */
const CAR_BUST_STOP_SPEED = 1;
/** Seconds the player car must stay stopped before a cop can complete the arrest. */
const CAR_BUST_STOP_DELAY = 1;
/** Default maximum player health. */
export const PLAYER_MAX_HEALTH = 100;
/** Collision radius (px) of a bullet, for stopping it at walls. */
export const BULLET_RADIUS = 2;
/** Spatial-hash cell size for static rect lookups (walls/sidewalks/crosswalks). */
const STATIC_RECT_SPATIAL_CELL = 128;
/** Spatial-hash cell size for bullet broad-phase lookups. */
const BULLET_SPATIAL_CELL = 64;
/** Largest circular target radius bullets currently test against. */
const MAX_BULLET_TARGET_RADIUS = 14;
/** Score awarded for eliminating a pedestrian. */
export const SCORE_PER_PEDESTRIAN = 50;
/** Score awarded for eliminating a police officer. */
export const SCORE_PER_POLICE = 150;
/** How close the player must be to an ammo pickup to collect it. */
export const AMMO_PICKUP_RADIUS = 22;
/** Seconds after collection before an ammo crate may reappear elsewhere. */
export const AMMO_RESPAWN_DELAY = 6;
/** Minimum wanted level at which officers open fire on the player. */
export const POLICE_SHOOT_MIN_STARS = 3;
/** How far (px) an officer will shoot from. */
export const POLICE_SHOOT_RANGE = 280;
/** Seconds between an officer's shots. */
export const POLICE_FIRE_COOLDOWN = 1.1;
/** Damage a single police bullet does to the player. */
export const POLICE_BULLET_DAMAGE = 10;
/** Police bullet speed (px/s) and lifetime (s). */
export const POLICE_BULLET_SPEED = 460;
export const POLICE_BULLET_LIFE = 0.9;
/** Extra reach (px) beyond contact within which a patrol car has the player
 * pinned and drops an officer to make the arrest. */
export const PIN_GAP = 12;
/** Range (px) within which a patrol car drops an officer to make the arrest,
 * rather than driving into the player. About one tile, so the car pulls up near
 * the player and an officer covers the last stretch on foot. */
export const POLICE_DEPLOY_RANGE = 72;
/** Hit points a car has before it is destroyed. */
export const CAR_MAX_HEALTH = 60;
/** Seconds a destroyed vehicle burns before it finally explodes. */
export const VEHICLE_BURN_DURATION = 5;
/** Radius (px) of a car explosion's blast. */
export const EXPLOSION_RADIUS = 72;
/** Damage an explosion does to the player caught in the blast. */
export const EXPLOSION_DAMAGE = 65;
/** Damage an explosion does to other cars (enough to chain-detonate them). */
export const EXPLOSION_CAR_DAMAGE = CAR_MAX_HEALTH;
/** Seconds an explosion's visual lingers (drives rendering). */
export const EXPLOSION_LIFE = 1.3;
/** Closing speed (px/s) below which a car-on-car bump does no damage. */
export const CAR_RAM_THRESHOLD = 70;
/** Hit points lost per px/s of closing speed above the threshold, per contact tick. */
export const CAR_RAM_DAMAGE_SCALE = 0.15;
/** Minimum time between damage applications for the same overlapping vehicle pair. */
export const VEHICLE_IMPACT_COOLDOWN = 0.75;
/** NPC-only crashes can still wreck vehicles, but one impact should not usually one-shot them. */
export const NPC_IMPACT_DAMAGE_CAP = 12;
/** Score awarded for destroying a car. */
export const SCORE_PER_CAR = 100;
/** Seconds an NPC car waits behind an obstacle before rerouting around it. */
export const TRAFFIC_REROUTE_WAIT = 2.5;
/** How close a pedestrian must be to a parked car to get in and drive off. */
export const PED_ENTER_RADIUS = 24;
/** Chance per second a pedestrian beside a parked car decides to drive it away. */
export const NPC_DRIVE_CHANCE = 0.25;
/** Distance from the camera focus within which a corpse counts as "in frame". */
export const DEFAULT_VIEW_RADIUS = 520;
/** Seconds a corpse must stay out of frame before it is cleared and respawned. */
export const CORPSE_RESPAWN_DELAY = 10;
/** Seconds a corpse must stay in frame before an ambulance is dispatched. */
export const AMBULANCE_DISPATCH_DELAY = 2.5;
/** Ambulance driving speed (px/s). */
export const AMBULANCE_SPEED = 170;
/** How close a service vehicle must get to its target to load it. */
export const AMBULANCE_PICKUP_RADIUS = 60;
/** Tow-truck driving speed (px/s). */
export const TOW_SPEED = 150;
/** Seconds a wreck must stay in frame before a tow truck is dispatched. */
export const TOW_DISPATCH_DELAY = 2.5;
/** Most tow trucks active at once (each handles a different wreck). */
export const MAX_TOWS = 3;
/** Seconds a dispatched service vehicle keeps trying before giving up and leaving. */
export const SERVICE_TIMEOUT = 40;
/** Spacing (px) between vehicles fanning out from the same facility frontage. */
export const SERVICE_SPAWN_SPACING = 36;
/** Speed (px/s) the medic / tow operator walks to and from the body or wreck. */
export const CREW_WALK_SPEED = 55;
/** How close the crew must get to the body/wreck (or back to their vehicle) to act. */
export const CREW_REACH_RADIUS = 8;
/** Seconds a medic or tow operator spends loading the cargo once they reach it. */
export const SERVICE_PICKUP_DWELL = 3;
/** How close a taxi must get to a passenger or dropoff to service it. */
export const TAXI_STOP_RADIUS = 44;
/** The cab must be nearly stopped before someone boards or gets out. */
export const TAXI_SERVICE_SPEED_MAX = 18;
/** Fraction of cruising speed a vehicle still rolls forward at while easing into
 * another lane, so a lane change is a natural diagonal swerve rather than a car
 * sliding straight sideways. */
const LANE_CHANGE_SPEED_FACTOR = 0.6;
const TAXI_NPC_ASSIGN_CHANCE = 0.18;
const TAXI_STOP_DWELL = 1.1;
const TAXI_MIN_PICKUP_DISTANCE = 220;
const TAXI_MIN_DROPOFF_DISTANCE = 420;
const TAXI_HAIL_SEARCH_RADIUS = 320;
const TAXI_COOLDOWN_MIN = 3;
const TAXI_COOLDOWN_MAX = 7;
const TAXI_REWARD_BASE = 250;
const TAXI_REWARD_PER_PIXEL = 0.35;
const TAXI_PASSENGER_NAMES = ['Ava', 'Milo', 'Nina', 'Theo', 'Jules', 'Sana', 'Omar', 'Ivy'] as const;
const PLAYER_POLICE_MIN_TARGET_DISTANCE = 180;
const PLAYER_POLICE_BUST_RADIUS = 42;
const PLAYER_POLICE_REWARD = 300;
const PLAYER_AMBULANCE_REWARD = 200;
const PLAYER_TOW_REWARD = 225;

/** A dead pedestrian left on the ground (with a blood puddle, rendered later). */
export interface Corpse {
  pos: Vec2;
  /** Seconds the corpse has been continuously out of frame. */
  offscreenFor: number;
  /** Seconds the corpse has been continuously in frame. */
  inFrameFor: number;
}

/** The stage a dispatched service vehicle is at in its pickup sequence. */
export type ServicePhase = 'approach' | 'collect' | 'return' | 'depart';

/** Vehicle body rendered for a drivable world car slot. */
export type VehicleKind = 'car' | 'ambulance' | 'tow' | 'police' | 'taxi';

/** Common state for a dispatched service vehicle that follows the roads. */
export interface ServiceVehicle {
  pos: Vec2;
  heading: number;
  radius: number;
  /** Current cardinal travel direction (for the shared road-following model). */
  dir: Vec2;
  /** Where it is currently headed (a reachable road stop beside the job, then
   * the on-foot pickup point, then the map edge to leave by). */
  target: Vec2;
  /** Actual body / wreck location the crew must fetch on foot once parked. */
  job?: Vec2;
  /** Which step of the pickup sequence it is in: driving out to the job
   * ('approach'), parked while the crew walk out to fetch the cargo ('collect'),
   * parked while they carry it back to the vehicle ('return'), or driving away
   * with it ('depart'). */
  phase: ServicePhase;
  /** Position of the crew member while they are out of the vehicle on foot, or
   * null when they are aboard. The vehicle stays parked whenever this is set. */
  crew: Vec2 | null;
  /** Seconds spent loading the body/wreck after the crew reaches it. */
  pickupElapsed: number;
  /** Seconds since it was dispatched (it gives up after SERVICE_TIMEOUT). */
  age: number;
  /** Speed it is actually travelling this step (0 while yielding to someone in
   * its path, or while parked with the crew out); read by the road-kill check
   * so a halted vehicle is harmless. */
  speed: number;
  /** Seconds it has been held up by an obstacle ahead (drives the reroute). */
  blocked: number;
  /** Cross-travel coordinate of the lane it is easing into during a lane change,
   * or undefined when simply keeping its current lane. */
  laneTarget?: number;
  /** Remaining hit points of the vehicle body. Enough bullets or impacts turn
   * it into an explosion, just like any other vehicle. */
  health: number;
}

/** An ambulance that drives to a corpse, parks, sends a medic out to fetch the
 * body on foot, then drives it away. */
export type Ambulance = ServiceVehicle;

/** A tow truck that drives to a wreck, parks, sends an operator out to hook it
 * on foot, then hauls it away. Carries one car at a time. */
export interface TowTruck extends ServiceVehicle {
  /** Index into `cars` of the wreck it was sent to collect. */
  targetCar: number;
}

/** A live explosion, for rendering its expanding blast. */
export interface Explosion {
  pos: Vec2;
  radius: number;
  /** Seconds since it went off. */
  age: number;
  /** Total time the visual lasts. */
  life: number;
}

export type TaxiMissionStage = 'pickup' | 'dropoff';

/** A player taxi side mission: collect a named fare, then drop them off. */
export interface TaxiMission {
  id: number;
  passengerId: number;
  passengerName: string;
  stage: TaxiMissionStage;
  pickup: Vec2;
  dropoff: Vec2;
  reward: number;
}

interface TaxiFareState extends TaxiMission {
  dwell: number;
}

interface TaxiCabState {
  fare: TaxiFareState | null;
  cooldown: number;
}

export type PlayerServiceMissionKind = 'police' | 'ambulance' | 'tow';
export type PlayerServiceStage = 'pickup' | 'return';

export type PlayerServiceMission =
  | { id: number; kind: 'police'; reward: number; suspectId: number }
  | { id: number; kind: 'ambulance'; stage: PlayerServiceStage; reward: number; pickup: Vec2; returnTo: Vec2 }
  | { id: number; kind: 'tow'; stage: PlayerServiceStage; reward: number; targetCar: number; returnTo: Vec2 };

type DamageableVehicleRef =
  | { kind: 'car'; index: number }
  | { kind: 'ambulance'; vehicle: Ambulance }
  | { kind: 'tow'; vehicle: TowTruck }
  | { kind: 'patrol'; vehicle: Police };

type PedestrianRouteCache = {
  tx: number;
  ty: number;
  field: FlowField;
};

type HazardVehicle = {
  pos: Vec2;
  radius: number;
  speed: number;
  byPlayer: boolean;
};

type TickSpatialCache = {
  blockingCars: readonly Car[];
  hazardVehicles: readonly HazardVehicle[];
  fireThreats: readonly Vec2[];
  civilianThreats: readonly Vec2[];
};

type SpatialHash<T> = Map<string, T[]>;

type BulletSpatialIndex = {
  pedestrians: SpatialHash<Pedestrian>;
  police: SpatialHash<Police>;
  cars: SpatialHash<number>;
  tows: SpatialHash<TowTruck>;
  towCrews: SpatialHash<TowTruck>;
};

/**
 * Authoritative game simulation. Holds all entities and advances them with a
 * fixed timestep. Has no rendering or input-device knowledge, so it is fully
 * unit testable.
 */
export class World {
  player: OnFootActor;
  readonly cars: Car[];
  readonly walls: Rect[];
  pedestrians: Pedestrian[];
  police: Police[];
  wanted: WantedState = createWanted();
  /** Player health pool. Reaching zero is fatal (wasted). */
  health: Health;
  /** The player's equipped weapon. */
  weapon: Weapon;
  /** Live bullets in flight. */
  bullets: Bullet[] = [];
  /** Bullets fired by the police at the player. */
  policeBullets: Bullet[] = [];
  /** Active explosions, for rendering their blast. */
  explosions: Explosion[] = [];
  /** Total explosions triggered this run (lets the view play a boom once each). */
  explosionsTriggered = 0;
  /** Bullet positions from the previous tick that nearby pedestrians react to as gunfire. */
  private gunfireThreats: Vec2[] = [];
  /** Whether each car (parallel to `cars`) has been destroyed into a wreck. */
  wreckedCars: boolean[] = [];
  /** Whether each wreck (parallel to `cars`) has been hauled away by a tow truck. */
  towedCars: boolean[] = [];
  /** City-wide traffic-light controller (NPC traffic obeys it). */
  lights: TrafficLights = createTrafficLights();
  /** Dead pedestrians lying in the street (with blood puddles). */
  corpses: Corpse[] = [];
  /** The active ambulance coming to collect a body, or null. */
  ambulance: Ambulance | null = null;
  /** Active tow trucks coming to haul off wrecks (one per wreck, capped). */
  tows: TowTruck[] = [];
  /** Money/points for this run, with a high score. */
  score: Score;
  /** Total on-foot NPCs / vehicles the player has eliminated this run. */
  kills = 0;
  /** Designated mission targets the player has eliminated this run. */
  targetKills = 0;
  /** Ammo (and other) pickups the player has collected this run. */
  collected = 0;
  /** Ammo pickups still on the map. */
  ammoPickups: AmmoPickup[];
  readonly enterRadius: number;
  drivingCarIndex: number | null = null;
  /** Whether the game is in normal play or showing the busted/wasted screen. */
  status: 'playing' | 'busted' | 'wasted' = 'playing';

  private readonly tuning: CarTuning;
  private readonly policeSpawns: Vec2[];
  private readonly bounds: { width: number; height: number };
  private readonly water: Rect[];
  private readonly sidewalks: Rect[];
  private readonly crosswalks: Rect[];
  private readonly wallSpatial?: SpatialHash<Rect>;
  private readonly sidewalkSpatial?: SpatialHash<Rect>;
  private readonly crosswalkSpatial?: SpatialHash<Rect>;
  private readonly viewRadius: number;
  private readonly rng: () => number;
  private readonly city?: City;
  /** Walkability grid for on-foot NPC navigation (built from the city, if any). */
  private readonly navGrid?: NavGrid;
  /** Waypoint network calm pedestrians stroll along (built once from the city). */
  private readonly pedestrianGraph?: PedestrianGraph;
  /** Flow field to the player, recomputed each tick and shared by all foot cops. */
  private copFlow?: FlowField;
  /** Count of expensive pedestrian flow-field computations; a perf-regression guard. */
  pedestrianFlowFieldComputations = 0;
  /** Reuse a pedestrian's last route field until its destination tile changes. */
  private readonly pedestrianRouteCache = new WeakMap<Pedestrian, PedestrianRouteCache>();
  /** Candidate city locations at which ammo crates may respawn. */
  private readonly ammoRespawnPoints: Vec2[];
  /** Collected ammo crates waiting to respawn after a delay. */
  private ammoRespawns: { pickup: AmmoPickup; cooldown: number }[] = [];
  private readonly spawn: Vec2;
  private carDrivers: (TrafficAI | null)[];
  private carKinds: VehicleKind[];
  private taxiStates: (TaxiCabState | null)[];
  /** Whether a recovered wreck at this slot should be recycled back into play
   * from a tow yard (ordinary cars do; abandoned service vehicles do not). */
  private carRespawnsAtTow: boolean[];
  /** Remaining hit points of each car, parallel to `cars`. */
  private carHealth: number[];
  /** Seconds each intact car has left on its burning fuse, or 0 when not on fire. */
  private carBurnTimers: number[];
  /** Whether each burning car's eventual explosion should be credited to the player. */
  private carBurnByPlayer: boolean[];
  /** Whether a parked service vehicle slot has already been stolen and charged. */
  private stolenServiceVehicles: boolean[];
  /** Seconds until each wreck may be claimed by a fresh tow dispatch again. */
  private towDispatchCooldowns: number[];
  /** Continuous time the player's current car has been stopped for a bust. */
  private carStoppedForBusted = 0;
  private bustedTimer = 0;
  private prevAction = false;
  private prevConfirm = false;
  /** The campaign of missions being tracked, or null when there are none. */
  private campaign: Campaign | null;
  /** Campaign templates to loop through endlessly (empty for a fixed campaign). */
  private readonly campaignPool: Mission[][];
  /** Whether to start a new random campaign when the current one finishes. */
  private readonly loopCampaigns: boolean;
  /** Index of the campaign currently playing, to avoid repeating it back-to-back. */
  private campaignIndex = -1;
  /** Per-pair cooldown so one stuck overlap is not treated as dozens of fresh crashes. */
  private vehicleImpactCooldowns = new Map<string, number>();
  /** The counters captured when the current mission objective began. */
  private objectiveBaseline: MissionBaseline = { kills: 0, targetKills: 0, collected: 0, elapsed: 0 };
  /** Seconds elapsed in the current run (drives survive objectives). */
  private elapsed = 0;
  /** The currently active player taxi fare, if the player is driving a cab. */
  private playerTaxiMission: TaxiMission | null = null;
  /** The player's current side mission in a stolen police, ambulance, or tow vehicle. */
  private playerServiceMission: PlayerServiceMission | null = null;
  /** Delay before a newly started ambulance/tow side mission may complete. */
  private playerServiceActionLock = 0;
  private nextTaxiMissionId = 1;
  private nextTaxiPassengerId = 1;
  private nextServiceMissionId = 1;
  private nextPoliceSuspectId = 1;
  private completedServiceJobs: ServiceCompletionCounts = { police: 0, ambulance: 0, tow: 0 };

  constructor(opts: WorldOptions) {
    this.player = opts.player;
    this.cars = opts.cars ?? [];
    this.walls = opts.walls ?? [];
    this.pedestrians = opts.pedestrians ?? [];
    this.police = (opts.police ?? []).map((cop) =>
      cop.kind === 'car'
        ? { ...cop, speed: cop.speed ?? 0, health: cop.health ?? CAR_MAX_HEALTH }
        : { ...cop, speed: 0 },
    );
    this.policeSpawns = opts.policeSpawns ?? [];
    this.bounds = opts.bounds ?? { width: 1600, height: 1600 };
    this.water = opts.water ?? [];
    this.city = opts.city;
    this.sidewalks = opts.sidewalks ?? this.city?.sidewalks ?? [];
    this.crosswalks = this.city?.crosswalks ?? [];
    this.wallSpatial = this.walls.length > 0 ? this.buildRectSpatialHash(this.walls) : undefined;
    this.sidewalkSpatial = this.sidewalks.length > 0 ? this.buildRectSpatialHash(this.sidewalks) : undefined;
    this.crosswalkSpatial = this.crosswalks.length > 0 ? this.buildRectSpatialHash(this.crosswalks) : undefined;
    this.viewRadius = opts.viewRadius ?? DEFAULT_VIEW_RADIUS;
    this.enterRadius = opts.enterRadius ?? 28;
    this.tuning = opts.carTuning ?? DEFAULT_CAR_TUNING;
    this.rng = opts.rng ?? Math.random;
    this.navGrid = opts.city ? buildNavGrid(opts.city) : undefined;
    this.pedestrianGraph = opts.city ? buildPedestrianGraph(opts.city) : undefined;
    this.ammoRespawnPoints = opts.city ? this.buildAmmoRespawnPoints(opts.city) : [];
    this.spawn = opts.spawn ?? opts.player.pos;
    this.carDrivers = this.cars.map((_, i) => opts.carDrivers?.[i] ?? null);
    this.carKinds = this.cars.map((_, i) => opts.carKinds?.[i] ?? 'car');
    this.taxiStates = this.cars.map((_, i) => (this.carKinds[i] === 'taxi' ? this.createTaxiState() : null));
    this.carRespawnsAtTow = this.cars.map((_, i) => opts.carRespawnsAtTow?.[i] ?? true);
    this.carHealth = this.cars.map(() => CAR_MAX_HEALTH);
    this.carBurnTimers = this.cars.map(() => 0);
    this.carBurnByPlayer = this.cars.map(() => false);
    this.stolenServiceVehicles = this.cars.map(() => false);
    this.towDispatchCooldowns = this.cars.map(() => 0);
    this.wreckedCars = this.cars.map(() => false);
    this.towedCars = this.cars.map(() => false);
    this.health = createHealth(opts.maxHealth ?? PLAYER_MAX_HEALTH);
    this.weapon = opts.weapon ?? createPistol();
    this.score = createScore(opts.bestScore ?? 0);
    const missions = opts.missions ?? (opts.mission ? [opts.mission] : []);
    this.campaignPool = opts.campaigns ?? [];
    this.loopCampaigns = this.campaignPool.length > 0;
    if (this.loopCampaigns) {
      this.campaign = this.pickNextCampaign();
    } else {
      this.campaign = missions.length > 0 ? createCampaign(missions) : null;
    }
    this.ammoPickups = opts.ammoPickups ?? [];
    this.syncMissionTargets();
  }

  get isDriving(): boolean {
    return this.drivingCarIndex !== null;
  }

  get drivingCar(): Car | null {
    return this.drivingCarIndex === null ? null : this.cars[this.drivingCarIndex];
  }

  carKind(index: number): VehicleKind {
    return this.carKinds[index] ?? 'car';
  }

  /** Whether a car slot is currently burning down toward an explosion. */
  carIsBurning(index: number): boolean {
    return !this.wreckedCars[index] && (this.carBurnTimers[index] ?? 0) > 0;
  }

  /** Current wanted-level star rating (0..6). */
  get wantedStars(): number {
    return stars(this.wanted);
  }

  /** World point the camera should follow. */
  get focus(): Vec2 {
    return this.drivingCar?.pos ?? this.player.pos;
  }

  /** Whether the given world point is currently visible to the player. */
  private inFrame(pos: Vec2): boolean {
    return distance(this.focus, pos) <= this.viewRadius;
  }

  /** Whether the busted screen is showing. */
  get isBusted(): boolean {
    return this.status === 'busted';
  }

  /** Whether the wasted (killed) screen is showing. */
  get isWasted(): boolean {
    return this.status === 'wasted';
  }

  /** Whole seconds remaining before an automatic respawn while busted. */
  get respawnIn(): number {
    return Math.max(0, Math.ceil(this.bustedTimer));
  }

  /** The mission currently in progress, or null when there are none / all done. */
  get mission(): Mission | null {
    return this.campaign ? currentMission(this.campaign) : null;
  }

  /** The mission objective currently in progress, or null. */
  get missionObjective(): Objective | null {
    const m = this.mission;
    return m ? currentObjective(m) : null;
  }

  /** Whether the whole campaign of missions has been completed. Endless
   * campaign pools never report complete — a new contract always follows. */
  get missionComplete(): boolean {
    if (this.loopCampaigns) return false;
    return this.campaign ? isCampaignComplete(this.campaign) : false;
  }

  /** Numeric progress (e.g. 3/8) toward the current objective, or null for a
   * 'reach' objective (shown by a map marker) or when there is no mission. */
  get missionProgress(): ObjectiveProgress | null {
    const obj = this.missionObjective;
    if (!obj) return null;
    return objectiveProgress(obj, this.missionCtx(), this.objectiveBaseline);
  }

  /** The player's active taxi fare, if they are currently driving a cab. */
  get taxiMission(): TaxiMission | null {
    return this.playerTaxiMission;
  }

  /** The current taxi-side-mission target: passenger first, then the dropoff. */
  get taxiTarget(): Vec2 | null {
    const fare = this.playerTaxiMission;
    if (!fare) return null;
    return fare.stage === 'pickup' ? (this.findTaxiPassenger(fare.passengerId)?.pos ?? fare.pickup) : fare.dropoff;
  }

  /** The player's active police / ambulance / tow side mission, if any. */
  get serviceMission(): PlayerServiceMission | null {
    return this.playerServiceMission;
  }

  /** The current service-side-mission target: suspect, corpse, or wreck. */
  get serviceTarget(): Vec2 | null {
    const mission = this.playerServiceMission;
    if (!mission) return null;
    if (mission.kind === 'police') return this.findPoliceSuspect(mission.suspectId)?.pos ?? null;
    if (mission.kind === 'ambulance') {
      if (mission.stage === 'return') return mission.returnTo;
      return this.corpses.some((corpse) => distance(corpse.pos, mission.pickup) <= AMBULANCE_PICKUP_RADIUS)
        ? mission.pickup
        : null;
    }
    if (mission.stage === 'return') return mission.returnTo;
    return this.playerTowTargetAvailable(mission.targetCar) ? this.cars[mission.targetCar]?.pos ?? null : null;
  }

  /** Advance the simulation by `dt` seconds. */
  tick(c: Controls, dt: number): void {
    if (this.status !== 'playing') {
      this.updateDown(c, dt);
      this.prevAction = c.action;
      this.prevConfirm = c.confirm;
      return;
    }

    const actionPressed = c.action && !this.prevAction; // rising edge only
    this.elapsed += dt;
    if (this.isDriving) {
      this.updateDriving(c, dt, actionPressed);
    } else {
      this.updateOnFoot(c, dt, actionPressed);
    }
    this.updateTaxiSystems();
    this.updatePlayerServiceMissions(dt);
    this.lights = tickLights(this.lights, dt);
    this.updateTraffic(dt);
    this.resolveVehicleCollisions(dt);
    const tickSpatial = this.buildTickSpatialCache();
    this.updatePedestrians(dt, tickSpatial);
    this.updateNpcDriving(dt);
    this.checkRoadKill(tickSpatial.hazardVehicles);
    this.checkDrowning();
    this.collectAmmo();
    this.updateAmmoRespawns(dt);
    this.gunfireThreats = [];
    this.updateWeapon(c, dt);
    this.updateBullets(dt);
    this.updateWantedAndPolice(dt);
    this.updateArrest();
    this.updateCarBustTimer(dt);
    this.updatePoliceBullets(dt);
    this.stepExplosions(dt);
    this.updateCorpses(dt);
    this.updateAmbulance(dt);
    this.updateTow(dt);
    this.stepBurningCars(dt);
    this.updateMissionProgress();
    this.checkBusted();
    this.prevAction = c.action;
    this.prevConfirm = c.confirm;
  }

  private updateOnFoot(c: Controls, dt: number, actionPressed: boolean): void {
    const moved = walk(this.player, c, dt);

    // Entering a car takes priority over being blocked by it, so the player can
    // get into a car they are standing on top of.
    if (actionPressed) {
      if (this.hijackNearbyServiceVehicle(moved.pos, this.enterRadius)) {
        this.player = moved;
        return;
      }
      if (this.hijackNearbyPatrolCar(moved.pos, this.enterRadius)) {
        this.player = moved;
        return;
      }
      const idx = this.nearestCarIndex(moved.pos, this.enterRadius);
      if (idx !== null) {
        if (this.carKind(idx) === 'taxi') this.clearNpcTaxiFare(idx, this.cars[idx].pos);
        this.markServiceVehicleTheft(idx);
        this.drivingCarIndex = idx;
        this.cars[idx] = { ...this.cars[idx], speed: 0 };
        this.carDrivers[idx] = null; // any NPC driver bails out
        this.player = moved;
        return;
      }
    }

    // Block the player from walking through cars that are too slow to run them
    // over (a fast car instead mows them down, handled in checkRoadKill), then
    // keep them out of buildings (resolved last so a building always wins).
    const offCars = resolveCircleCircles(moved.pos, moved.radius, this.blockingCars());
    this.player = {
      ...moved,
      pos: this.wrapPos(resolveCircleRects(offCars, moved.radius, this.walls)),
    };
  }

  /** Cars solid enough to block actors on foot (a faster car runs them over). */
  private blockingCars(): readonly Car[] {
    return this.cars.filter((car, i) => !(this.wreckedCars[i] && this.towedCars[i]) && Math.abs(car.speed) < RUN_OVER_SPEED);
  }

  /** Wrecks that still physically exist in the world and block movement. */
  private wreckObstacles(): readonly Car[] {
    return this.cars.filter((_, i) => this.wreckedCars[i] && !this.towedCars[i]);
  }

  private nearestCrewedServiceVehicle(
    p: Vec2,
    within: number,
  ): { kind: 'ambulance'; vehicle: Ambulance } | { kind: 'tow'; vehicle: TowTruck; index: number } | null {
    let best: { kind: 'ambulance'; vehicle: Ambulance } | { kind: 'tow'; vehicle: TowTruck; index: number } | null = null;
    let bestDist = within;
    if (this.ambulance?.crew) {
      const d = distance(p, this.ambulance.pos);
      if (d <= bestDist) {
        best = { kind: 'ambulance', vehicle: this.ambulance };
        bestDist = d;
      }
    }
    this.tows.forEach((tow, index) => {
      if (!tow.crew) return;
      const d = distance(p, tow.pos);
      if (d <= bestDist) {
        best = { kind: 'tow', vehicle: tow, index };
        bestDist = d;
      }
    });
    return best;
  }

  private nearestPatrolCar(p: Vec2, within: number): { vehicle: Police; index: number } | null {
    let best: { vehicle: Police; index: number } | null = null;
    let bestDist = within;
    this.police.forEach((cop, index) => {
      if (cop.kind !== 'car') return;
      const d = distance(p, cop.pos);
      if (d > bestDist) return;
      best = { vehicle: cop, index };
      bestDist = d;
    });
    return best;
  }

  private hijackNearbyPatrolCar(p: Vec2, within: number): boolean {
    const target = this.nearestPatrolCar(p, within);
    if (!target) return false;
    const patrol = target.vehicle;
    const home = this.policeHome(patrol) ?? patrol.pos;
    const side = fromAngle(patrol.heading + Math.PI / 2, patrol.radius + 12);

    this.police.splice(target.index, 1);
    this.police.push({
      pos: add(patrol.pos, side),
      heading: patrol.heading,
      radius: 12,
      kind: 'foot',
      home,
      fireCooldown: 0,
    });

    const idx = this.appendVehicleSlot(
      { pos: patrol.pos, heading: patrol.heading, speed: 0, radius: patrol.radius },
      'police',
      { health: patrol.health ?? CAR_MAX_HEALTH, respawnsAtTow: false },
    );
    this.drivingCarIndex = idx;
    this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPolice);
    return true;
  }

  private hijackNearbyServiceVehicle(p: Vec2, within: number): boolean {
    const target = this.nearestCrewedServiceVehicle(p, within);
    if (!target) return false;
    const crew = target.vehicle.crew;
    if (!crew) return false;
    this.sendServiceCrewHome(crew, target.kind, target.vehicle.pos);
    const idx = this.materializeServiceVehicle(target.vehicle, target.kind, false);
    this.drivingCarIndex = idx;
    this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPedestrian);
    if (target.kind === 'ambulance') {
      this.corpses = this.corpses.map((corpse) =>
        distance(corpse.pos, target.vehicle.target) <= AMBULANCE_PICKUP_RADIUS
          ? { ...corpse, inFrameFor: 0 }
          : corpse,
      );
      this.ambulance = null;
    } else {
      this.towDispatchCooldowns[target.vehicle.targetCar] = TOW_DISPATCH_DELAY;
      this.tows.splice(target.index, 1);
    }
    return true;
  }

  private buildTickSpatialCache(): TickSpatialCache {
    const blockingCars = this.blockingCars();
    const hazardVehicles = this.hazardVehicles();
    const fireThreats = this.burningCarThreats();
    const civilianThreats = [
      ...fireThreats,
      ...this.gunfireThreats,
    ];
    return { blockingCars, hazardVehicles, fireThreats, civilianThreats };
  }

  private spatialHashKey(cellX: number, cellY: number): string {
    return `${cellX},${cellY}`;
  }

  private addToSpatialHash<T>(hash: SpatialHash<T>, item: T, pos: Vec2): void {
    const cellX = Math.floor(pos.x / BULLET_SPATIAL_CELL);
    const cellY = Math.floor(pos.y / BULLET_SPATIAL_CELL);
    const key = this.spatialHashKey(cellX, cellY);
    const bucket = hash.get(key);
    if (bucket) bucket.push(item);
    else hash.set(key, [item]);
  }

  private buildRectSpatialHash(rects: readonly Rect[]): SpatialHash<Rect> {
    const hash = new Map<string, Rect[]>();
    for (const r of rects) {
      const minX = Math.floor(r.x / STATIC_RECT_SPATIAL_CELL);
      const maxX = Math.floor((r.x + r.w) / STATIC_RECT_SPATIAL_CELL);
      const minY = Math.floor(r.y / STATIC_RECT_SPATIAL_CELL);
      const maxY = Math.floor((r.y + r.h) / STATIC_RECT_SPATIAL_CELL);
      for (let cellY = minY; cellY <= maxY; cellY++) {
        for (let cellX = minX; cellX <= maxX; cellX++) {
          const key = this.spatialHashKey(cellX, cellY);
          const bucket = hash.get(key);
          if (bucket) bucket.push(r);
          else hash.set(key, [r]);
        }
      }
    }
    return hash;
  }

  private nearbyRects(
    hash: SpatialHash<Rect> | undefined,
    pos: Vec2,
    radius: number,
    fallback: readonly Rect[],
  ): readonly Rect[] {
    if (!hash) return fallback;
    const minX = Math.floor((pos.x - radius) / STATIC_RECT_SPATIAL_CELL);
    const maxX = Math.floor((pos.x + radius) / STATIC_RECT_SPATIAL_CELL);
    const minY = Math.floor((pos.y - radius) / STATIC_RECT_SPATIAL_CELL);
    const maxY = Math.floor((pos.y + radius) / STATIC_RECT_SPATIAL_CELL);
    const unique = new Set<Rect>();
    for (let cellY = minY; cellY <= maxY; cellY++) {
      for (let cellX = minX; cellX <= maxX; cellX++) {
        const bucket = hash.get(this.spatialHashKey(cellX, cellY));
        if (!bucket) continue;
        for (const rect of bucket) unique.add(rect);
      }
    }
    return unique.size > 0 ? [...unique] : [];
  }

  private nearbyWalls(pos: Vec2, radius: number): readonly Rect[] {
    return this.nearbyRects(this.wallSpatial, pos, radius, this.walls);
  }

  private nearbySidewalks(pos: Vec2): readonly Rect[] {
    return this.nearbyRects(this.sidewalkSpatial, pos, 0, this.sidewalks);
  }

  private nearbyCrosswalks(pos: Vec2): readonly Rect[] {
    return this.nearbyRects(this.crosswalkSpatial, pos, 0, this.crosswalks);
  }

  private forEachNearbyInSpatialHash<T>(
    hash: SpatialHash<T>,
    pos: Vec2,
    radius: number,
    visit: (item: T) => void,
  ): void {
    const minX = Math.floor((pos.x - radius) / BULLET_SPATIAL_CELL);
    const maxX = Math.floor((pos.x + radius) / BULLET_SPATIAL_CELL);
    const minY = Math.floor((pos.y - radius) / BULLET_SPATIAL_CELL);
    const maxY = Math.floor((pos.y + radius) / BULLET_SPATIAL_CELL);
    for (let cellY = minY; cellY <= maxY; cellY++) {
      for (let cellX = minX; cellX <= maxX; cellX++) {
        const bucket = hash.get(this.spatialHashKey(cellX, cellY));
        if (!bucket) continue;
        for (const item of bucket) visit(item);
      }
    }
  }

  private findNearbyArrayEntry<T>(
    hash: SpatialHash<T>,
    pos: Vec2,
    radius: number,
    items: readonly T[],
    predicate: (item: T) => boolean,
  ): { item: T; index: number } | null {
    let bestItem: T | undefined;
    let bestIndex = Infinity;
    this.forEachNearbyInSpatialHash(hash, pos, radius, (item) => {
      if (!predicate(item)) return;
      const index = items.indexOf(item);
      if (index === -1 || index >= bestIndex) return;
      bestItem = item;
      bestIndex = index;
    });
    return bestItem === undefined ? null : { item: bestItem, index: bestIndex };
  }

  private findNearbyCarIndex(
    hash: SpatialHash<number>,
    pos: Vec2,
    radius: number,
    predicate: (index: number) => boolean,
  ): number {
    let best = -1;
    this.forEachNearbyInSpatialHash(hash, pos, radius, (index) => {
      if (!predicate(index)) return;
      if (best === -1 || index < best) best = index;
    });
    return best;
  }

  private buildBulletSpatialIndex(): BulletSpatialIndex {
    const pedestrians = new Map<string, Pedestrian[]>();
    const police = new Map<string, Police[]>();
    const cars = new Map<string, number[]>();
    const tows = new Map<string, TowTruck[]>();
    const towCrews = new Map<string, TowTruck[]>();

    for (const ped of this.pedestrians) this.addToSpatialHash(pedestrians, ped, ped.pos);
    for (const cop of this.police) this.addToSpatialHash(police, cop, cop.pos);
    for (let i = 0; i < this.cars.length; i++) {
      if (this.wreckedCars[i] || i === this.drivingCarIndex) continue;
      this.addToSpatialHash(cars, i, this.cars[i].pos);
    }
    for (const tow of this.tows) {
      this.addToSpatialHash(tows, tow, tow.pos);
      if (tow.crew) this.addToSpatialHash(towCrews, tow, tow.crew);
    }

    return { pedestrians, police, cars, tows, towCrews };
  }

  /** Every vehicle that can currently run an actor over — player, NPC and police
   * cars and dispatched service vehicles (ambulances, tow trucks) alike — in one
   * normalised list, so the road-kill rule is applied uniformly and any future
   * vehicle type inherits it for free. `byPlayer` flags hits the player is to
   * blame for (those earn heat and score). */
  private hazardVehicles(): HazardVehicle[] {
    const hazards: HazardVehicle[] = [];
    for (let i = 0; i < this.cars.length; i++) {
      if (this.wreckedCars[i]) continue;
      const car = this.cars[i];
      hazards.push({
        pos: car.pos,
        radius: car.radius,
        speed: Math.abs(car.speed),
        byPlayer: i === this.drivingCarIndex,
      });
    }
    if (this.ambulance) {
      const a = this.ambulance;
      hazards.push({ pos: a.pos, radius: a.radius, speed: Math.abs(a.speed), byPlayer: false });
    }
    for (const tow of this.tows) {
      hazards.push({ pos: tow.pos, radius: tow.radius, speed: Math.abs(tow.speed), byPlayer: false });
    }
    return hazards;
  }

  /** The vehicle currently running over an actor at `pos` with radius `r`, if
   * any: one moving fast enough to be lethal whose body overlaps the actor. */
  private runningOver(
    pos: Vec2,
    r: number,
    hazards: readonly HazardVehicle[] = this.hazardVehicles(),
  ): { byPlayer: boolean; speed: number } | null {
    for (const h of hazards) {
      if (h.speed >= RUN_OVER_SPEED && distance(h.pos, pos) <= h.radius + r) {
        return { byPlayer: h.byPlayer, speed: h.speed };
      }
    }
    return null;
  }

  private updateTraffic(dt: number): void {
    if (!this.city) return;
    const obstacles = this.yieldObstacles();
    for (let i = 0; i < this.cars.length; i++) {
      const ai = this.carDrivers[i];
      if (!ai || i === this.drivingCarIndex || this.wreckedCars[i] || this.carIsBurning(i)) continue;
      const car = this.cars[i];

      let dir = ai.dir;
      let blocked = ai.blocked ?? 0;
      let speed = TRAFFIC_SPEED;
      let escapeTarget = ai.escapeTarget;
      let routeTarget = ai.routeTarget;
      if (escapeTarget && distance(car.pos, escapeTarget) <= this.city.spec.tile) {
        escapeTarget = undefined;
      }
      const taxiPlan = this.carKind(i) === 'taxi' ? this.planTaxiTraffic(i, car, dt) : null;
      if (taxiPlan) {
        routeTarget = taxiPlan.routeTarget;
        if (taxiPlan.hold) {
          this.cars[i] = { ...car, speed: 0 };
          this.carDrivers[i] = {
            ...ai,
            blocked: 0,
            laneTarget: undefined,
            escapeTarget,
            routeTarget,
          };
          continue;
        }
      }
      // Drop a finished lane change once the car has reached the chosen lane.
      let laneTarget = ai.laneTarget;
      if (laneTarget !== undefined && Math.abs(laneCross(car.pos, ai.dir) - laneTarget) < 1.5) {
        laneTarget = undefined;
      }
      if (obstacleAhead(car.pos, ai.dir, obstacles)) {
        if (laneTarget === undefined) {
          const lane = laneChangeTarget(this.city, car.pos, ai.dir, obstacles);
          if (lane) laneTarget = laneCross(lane, ai.dir);
        }
        if (laneTarget !== undefined) {
          speed = TRAFFIC_SPEED * LANE_CHANGE_SPEED_FACTOR; // roll forward while easing across
          blocked = 0;
        } else {
          // Nowhere to go around them: wait, then U-turn to find another route.
          const waited = blocked + dt;
          if (waited >= TRAFFIC_REROUTE_WAIT) {
            dir = vec2(-ai.dir.x, -ai.dir.y);
            blocked = 0;
          } else {
            blocked = waited;
            speed = 0;
          }
        }
      } else if (!escapeTarget && this.redLightAhead(car, dir)) {
        speed = 0; // hold at the red light (not counted as being stuck)
        blocked = 0;
      } else {
        blocked = 0; // path cleared
      }

      const out = stepTraffic(car, { dir, blocked, laneTarget, escapeTarget, routeTarget }, this.city, dt, speed, this.rng);
      const turned = out.ai.dir.x !== ai.dir.x || out.ai.dir.y !== ai.dir.y;
      this.cars[i] = out.car;
      this.carDrivers[i] = turned ? { ...out.ai, laneTarget: undefined } : out.ai;
    }
  }

  /** Whether an NPC car is approaching an intersection it must stop at for a red
   * light. Looks a tile or two ahead along the car's direction. */
  private redLightAhead(car: Car, dir: Vec2): boolean {
    if (!this.city || hasGreen(this.lights, dir)) return false; // our axis is green
    const { tx, ty } = tileCoord(this.city.spec, car.pos);
    if (isIntersection(this.city, tx, ty)) return false; // already committed: clear the junction
    for (let step = 1; step <= 2; step++) {
      const ix = tx + dir.x * step;
      const iy = ty + dir.y * step;
      if (isIntersection(this.city, ix, iy)) {
        return obstacleAhead(car.pos, dir, [tileCenter(this.city.spec, ix, iy)]);
      }
      if (!this.city.isRoad(ix, iy)) break; // road ends before any intersection
    }
    return false;
  }

  /** Occasionally a wandering pedestrian beside a parked car gets in and drives
   * off, joining the flow of traffic — a little extra life on the streets. */
  private updateNpcDriving(dt: number): void {
    if (!this.city) return;
    if (this.rng() >= NPC_DRIVE_CHANCE * dt) return; // usually nobody bothers this tick
    for (let pi = 0; pi < this.pedestrians.length; pi++) {
      if (this.pedestrians[pi].state !== 'wander') continue;
      const ci = this.parkedCarNear(this.pedestrians[pi].pos);
      if (ci === null) continue;
      const { tx, ty } = tileCoord(this.city.spec, this.cars[ci].pos);
      const dirs = openDirections(this.city, tx, ty);
      if (dirs.length === 0) continue;
      this.carDrivers[ci] = { dir: dirs[Math.floor(this.rng() * dirs.length)] ?? dirs[0] };
      this.cars[ci] = { ...this.cars[ci], speed: 0 };
      this.pedestrians.splice(pi, 1); // the pedestrian is now the driver
      return; // at most one per tick
    }
  }

  /** Index of a parked (driverless, intact) car within reach of a point, or null. */
  private parkedCarNear(p: Vec2): number | null {
    for (let i = 0; i < this.cars.length; i++) {
      if (i === this.drivingCarIndex || this.carDrivers[i] || this.wreckedCars[i] || this.carIsBurning(i)) continue;
      if (!this.isCivilianRoadCar(i)) continue;
      if (distance(p, this.cars[i].pos) <= PED_ENTER_RADIUS + this.cars[i].radius) return i;
    }
    return null;
  }

  /** Record a dead pedestrian as a corpse left lying in the street. */
  private addCorpse(pos: Vec2): void {
    this.corpses.push({ pos, offscreenFor: 0, inFrameFor: 0 });
  }

  private sendServiceCrewHome(crew: Vec2, kind: 'ambulance' | 'tow', near: Vec2): void {
    const facilityKind = kind === 'ambulance' ? 'hospital' : 'towYard';
    const home = this.nearestFacility(facilityKind, near)?.spawn ?? this.spawn;
    this.pedestrians.push({
      pos: crew,
      heading: angle(sub(home, crew)),
      radius: 7,
      state: 'wander',
      target: home,
      returningTo: home,
      uniform: kind === 'ambulance' ? 'medic' : 'towWorker',
    });
  }

  private sendPatrolOfficerHome(pos: Vec2, home: Vec2 | null): void {
    const station =
      home ??
      this.nearestFacility('policeStation', pos)?.spawn ??
      this.nearestPoliceSpawn(pos) ??
      this.spawn;
    this.police.push({
      pos,
      heading: angle(sub(station, pos)),
      radius: 12,
      kind: 'foot',
      home: station,
      speed: 0,
      fireCooldown: 0,
      returningHome: true,
    });
  }

  /** Resolve an on-foot NPC death into a body left in the world, crediting the
   * player only when they caused it. Shared by pedestrians, foot police, and
   * any service crew member currently out of their vehicle. */
  private killOnFootNpc(
    pos: Vec2,
    kind: 'pedestrian' | 'police',
    byPlayer: boolean,
    missionTarget = false,
  ): void {
    this.addCorpse(pos);
    if (byPlayer) this.registerKill(kind, missionTarget);
  }

  /** Kill the ambulance medic currently out on foot, aborting the call. */
  private killAmbulanceCrew(byPlayer: boolean): void {
    const amb = this.ambulance;
    const crew = amb?.crew;
    if (!amb || !crew) return;
    this.killOnFootNpc(crew, 'pedestrian', byPlayer);
    this.abandonServiceVehicle(amb, 'ambulance');
    this.ambulance = null;
  }

  /** Kill a tow-truck operator currently out on foot, abandoning that truck's
   * job. The wreck remains available for another tow to claim later. */
  private killTowCrew(index: number, byPlayer: boolean): void {
    const tow = this.tows[index];
    if (!tow?.crew) return;
    this.killOnFootNpc(tow.crew, 'pedestrian', byPlayer);
    this.abandonServiceVehicle(tow, 'tow');
    this.tows.splice(index, 1);
  }

  /** Leave an unused service vehicle behind as a towable wreck instead of
   * making it vanish when its crew dies on foot. */
  private abandonServiceVehicle(v: ServiceVehicle, kind: 'ambulance' | 'tow'): void {
    this.materializeServiceVehicle(v, kind, true);
  }

  private appendVehicleSlot(
    car: Car,
    kind: VehicleKind,
    opts: { health: number; wrecked?: boolean; respawnsAtTow?: boolean },
  ): number {
    const wrecked = opts.wrecked ?? false;
    this.cars.push(car);
    this.carDrivers.push(null);
    this.carKinds.push(kind);
    this.taxiStates.push(kind === 'taxi' ? this.createTaxiState() : null);
    this.carRespawnsAtTow.push(opts.respawnsAtTow ?? false);
    this.carHealth.push(wrecked ? 0 : opts.health);
    this.carBurnTimers.push(0);
    this.carBurnByPlayer.push(false);
    this.stolenServiceVehicles.push(false);
    this.towDispatchCooldowns.push(0);
    this.wreckedCars.push(wrecked);
    this.towedCars.push(false);
    return this.cars.length - 1;
  }

  private materializeServiceVehicle(
    v: ServiceVehicle,
    kind: 'ambulance' | 'tow',
    wrecked: boolean,
  ): number {
    return this.appendVehicleSlot(
      { pos: v.pos, heading: v.heading, speed: 0, radius: v.radius },
      kind,
      { health: v.health, wrecked, respawnsAtTow: false },
    );
  }

  /** Record that the player destroyed a vehicle, using the same reward/heat rule
   * as the original car-only explosion logic. */
  private noteVehicleDestroyed(byPlayer: boolean): void {
    if (!byPlayer) return;
    this.kills += 1;
    this.score = award(this.score, SCORE_PER_CAR);
    this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPedestrian);
  }

  /** Every active vehicle body that can be shot, rammed, or blown up. */
  private damageableVehicles(): DamageableVehicleRef[] {
    const refs: DamageableVehicleRef[] = [];
    for (let i = 0; i < this.cars.length; i++) {
      if (this.wreckedCars[i]) continue;
      refs.push({ kind: 'car', index: i });
    }
    if (this.ambulance) refs.push({ kind: 'ambulance', vehicle: this.ambulance });
    for (const tow of this.tows) refs.push({ kind: 'tow', vehicle: tow });
    for (const cop of this.police) {
      if (cop.kind === 'car') refs.push({ kind: 'patrol', vehicle: cop });
    }
    return refs;
  }

  /** Current physical body of a damageable vehicle, or null if it no longer exists. */
  private vehicleBody(ref: DamageableVehicleRef): Car | null {
    if (ref.kind === 'car') {
      if (this.wreckedCars[ref.index]) return null;
      return this.cars[ref.index];
    }
    if (ref.kind === 'ambulance') {
      return this.ambulance === ref.vehicle ? ref.vehicle : null;
    }
    if (ref.kind === 'tow') {
      return this.tows.includes(ref.vehicle) ? ref.vehicle : null;
    }
    return ref.vehicle.kind === 'car' && this.police.includes(ref.vehicle)
      ? {
          pos: ref.vehicle.pos,
          heading: ref.vehicle.heading,
          speed: ref.vehicle.speed ?? 0,
          radius: ref.vehicle.radius,
        }
      : null;
  }

  /** Overwrite a vehicle body's physical state after collision resolution. */
  private setVehicleBody(ref: DamageableVehicleRef, body: Car): void {
    if (ref.kind === 'car') {
      this.cars[ref.index] = body;
      return;
    }
    if (ref.kind === 'ambulance') {
      if (this.ambulance !== ref.vehicle) return;
      const next = {
        ...ref.vehicle,
        pos: body.pos,
        heading: body.heading,
        speed: body.speed,
        radius: body.radius,
      };
      this.ambulance = next;
      ref.vehicle = next;
      return;
    }
    if (ref.kind === 'tow') {
      const idx = this.tows.indexOf(ref.vehicle);
      if (idx === -1) return;
      const next = {
        ...ref.vehicle,
        pos: body.pos,
        heading: body.heading,
        speed: body.speed,
        radius: body.radius,
      };
      this.tows[idx] = next;
      ref.vehicle = next;
      return;
    }
    const idx = this.police.indexOf(ref.vehicle);
    if (idx === -1 || ref.vehicle.kind !== 'car') return;
    const next = {
      ...ref.vehicle,
      pos: body.pos,
      heading: body.heading,
      speed: body.speed,
      radius: body.radius,
    };
    this.police[idx] = next;
    ref.vehicle = next;
  }

  /** Whether a damageable vehicle is the player's currently driven car. */
  private isPlayerVehicle(ref: DamageableVehicleRef): boolean {
    return ref.kind === 'car' && ref.index === this.drivingCarIndex;
  }

  /** Apply damage to any vehicle type, igniting it once its health runs out. */
  private damageVehicle(ref: DamageableVehicleRef, amount: number, byPlayer: boolean): void {
    if (ref.kind === 'car') {
      this.damageCar(ref.index, amount, byPlayer);
      return;
    }
    if (ref.kind === 'ambulance') {
      if (this.ambulance !== ref.vehicle) return;
      const health = ref.vehicle.health - amount;
      if (health <= 0) {
        this.igniteServiceVehicle(ref, byPlayer);
      } else {
        const next = { ...ref.vehicle, health };
        this.ambulance = next;
        ref.vehicle = next;
      }
      return;
    }
    if (ref.kind === 'tow') {
      const idx = this.tows.indexOf(ref.vehicle);
      if (idx === -1) return;
      const health = ref.vehicle.health - amount;
      if (health <= 0) {
        this.igniteServiceVehicle(ref, byPlayer);
      } else {
        const next = { ...ref.vehicle, health };
        this.tows[idx] = next;
        ref.vehicle = next;
      }
      return;
    }
    const idx = this.police.indexOf(ref.vehicle);
    if (idx === -1 || ref.vehicle.kind !== 'car') return;
    const health = (ref.vehicle.health ?? CAR_MAX_HEALTH) - amount;
    if (health <= 0) {
      this.ignitePatrolCar(ref, byPlayer);
    } else {
      const next = { ...ref.vehicle, health };
      this.police[idx] = next;
      ref.vehicle = next;
    }
  }

  /** Abort a burning service call, send the crew home, and leave the vehicle to burn down. */
  private igniteServiceVehicle(
    ref: Extract<DamageableVehicleRef, { kind: 'ambulance' | 'tow' }>,
    byPlayer: boolean,
  ): void {
    const vehicle =
      ref.kind === 'ambulance'
        ? this.ambulance === ref.vehicle
          ? ref.vehicle
          : null
        : this.tows.includes(ref.vehicle)
          ? ref.vehicle
          : null;
    if (!vehicle) return;
    const crew = vehicle.crew ?? vehicle.pos;
    if (ref.kind === 'ambulance') {
      this.ambulance = null;
    } else {
      const idx = this.tows.indexOf(ref.vehicle);
      if (idx === -1) return;
      this.tows.splice(idx, 1);
    }
    this.sendServiceCrewHome(crew, ref.kind, vehicle.pos);
    const idx = this.materializeServiceVehicle(vehicle, ref.kind, false);
    this.igniteCar(idx, byPlayer);
  }

  /** Abandon a burning patrol car, send the officer home, and leave the cruiser to burn down. */
  private ignitePatrolCar(
    ref: Extract<DamageableVehicleRef, { kind: 'patrol' }>,
    byPlayer: boolean,
  ): void {
    const idx = this.police.indexOf(ref.vehicle);
    if (idx === -1 || ref.vehicle.kind !== 'car') return;
    const center = ref.vehicle.pos;
    const home = this.policeHome(ref.vehicle);
    const body = {
      pos: ref.vehicle.pos,
      heading: ref.vehicle.heading,
      speed: 0,
      radius: ref.vehicle.radius,
    };
    this.police.splice(idx, 1);
    this.sendPatrolOfficerHome(center, home);
    const slot = this.appendVehicleSlot(body, 'police', {
      health: ref.vehicle.health ?? CAR_MAX_HEALTH,
      respawnsAtTow: false,
    });
    this.igniteCar(slot, byPlayer);
  }

  /** Spawn an explosion and apply its blast uniformly to actors and vehicles. */
  private triggerExplosion(center: Vec2, byPlayer: boolean): void {
    this.explosions.push({ pos: center, radius: EXPLOSION_RADIUS, age: 0, life: EXPLOSION_LIFE });
    this.explosionsTriggered += 1;
    this.noteVehicleDestroyed(byPlayer);

    this.pedestrians = this.pedestrians.filter((p) => {
      if (distance(center, p.pos) > EXPLOSION_RADIUS + p.radius) return true;
      this.killOnFootNpc(p.pos, 'pedestrian', byPlayer, !!p.missionTarget);
      return false;
    });
    this.police = this.police.filter((cop) => {
      if (cop.kind !== 'foot' || distance(center, cop.pos) > EXPLOSION_RADIUS + cop.radius) return true;
      this.killOnFootNpc(cop.pos, 'police', byPlayer);
      return false;
    });
    if (
      this.ambulance?.crew &&
      distance(center, this.ambulance.crew) <= EXPLOSION_RADIUS + this.player.radius
    ) {
      this.killAmbulanceCrew(byPlayer);
    }
    for (let i = this.tows.length - 1; i >= 0; i--) {
      const crew = this.tows[i].crew;
      if (crew && distance(center, crew) <= EXPLOSION_RADIUS + this.player.radius) {
        this.killTowCrew(i, byPlayer);
      }
    }
    if (distance(center, this.focus) <= EXPLOSION_RADIUS + this.player.radius) {
      if (this.isDriving && distance(center, this.drivingCar!.pos) <= EXPLOSION_RADIUS + this.drivingCar!.radius) {
        this.drivingCarIndex = null; // thrown clear of the wreck they were driving
        this.player = { ...this.player, pos: center };
      }
      this.applyPlayerDamage(EXPLOSION_DAMAGE);
    }
    for (const ref of this.damageableVehicles()) {
      const body = this.vehicleBody(ref);
      if (!body) continue;
      if (distance(center, body.pos) <= EXPLOSION_RADIUS + body.radius) {
        this.damageVehicle(ref, EXPLOSION_CAR_DAMAGE, byPlayer);
      }
    }
  }

  /** Age corpses; one left out of frame long enough is cleared and a fresh
   * NPC emerges from the nearest hospital so the streets stay populated. */
  private updateCorpses(dt: number): void {
    if (this.corpses.length === 0) return;
    const survivors: Corpse[] = [];
    for (const corpse of this.corpses) {
      const inFrame = this.inFrame(corpse.pos);
      const next: Corpse = {
        pos: corpse.pos,
        inFrameFor: inFrame ? corpse.inFrameFor + dt : 0,
        offscreenFor: inFrame ? 0 : corpse.offscreenFor + dt,
      };
      if (next.offscreenFor >= CORPSE_RESPAWN_DELAY) {
        this.respawnPedestrian(corpse.pos); // out of sight: they reappear at the hospital
        continue;
      }
      survivors.push(next);
    }
    this.corpses = survivors;
  }

  /** Spawn a fresh wandering pedestrian at the nearest hospital doorway. When a
   * map has no hospital (e.g. tiny ad hoc tests), fall back to the old general
   * sidewalk wandering spawn so the world still repopulates. */
  private respawnPedestrian(target: Vec2): void {
    const pos = this.nearestFacility('hospital', target)?.spawn ?? wanderTarget(
      { threats: [], bounds: this.bounds, sidewalks: this.sidewalks },
      this.spawn,
      this.rng,
    );
    this.pedestrians.push({ pos, heading: 0, radius: 7, state: 'wander', target: pos });
  }

  /** Recycle an exploded ordinary car back into play at the nearest tow yard's
   * road spawn. Recovered service-vehicle wrecks are excluded. */
  private respawnCarAtTowYard(idx: number, slot = 0): void {
    if (!this.city || !this.carRespawnsAtTow[idx]) return;
    const wreck = this.cars[idx];
    const pos = this.serviceSpawnPoint('towYard', wreck.pos, slot);
    if (!pos) return;
    const { tx, ty } = tileCoord(this.city.spec, pos);
    const dirs = openDirections(this.city, tx, ty);
    if (dirs.length === 0) return;
    const dir = dirs[Math.floor(this.rng() * dirs.length)] ?? dirs[0];
    this.cars[idx] = { ...wreck, pos, heading: angle(dir), speed: 0 };
    this.carDrivers[idx] = { dir };
    this.carHealth[idx] = CAR_MAX_HEALTH;
    this.carBurnTimers[idx] = 0;
    this.carBurnByPlayer[idx] = false;
    this.stolenServiceVehicles[idx] = false;
    this.towDispatchCooldowns[idx] = 0;
    this.wreckedCars[idx] = false;
    this.taxiStates[idx] = this.carKind(idx) === 'taxi' ? this.createTaxiState() : null;
  }

  /** Dispatch and drive an ambulance to collect a body that lingers on screen.
   * It follows the road grid (no driving through buildings), parks beside the
   * body and sends a medic out on foot to fetch it before driving away. */
  private updateAmbulance(dt: number): void {
    if (!this.city) return; // service vehicles need roads to drive
    if (!this.ambulance) {
      const corpse = this.corpses.find((c) => c.inFrameFor >= AMBULANCE_DISPATCH_DELAY);
      if (!corpse) return;
      this.ambulance = this.dispatchService(corpse.pos, 'hospital');
    }
    const amb = this.ambulance;
    const job = amb.job ?? amb.target;

    // Crew on foot: the medic is walking out to the body or carrying it back.
    if (amb.crew) {
      this.ambulance = this.stepCrew(amb, dt, () => {
        const idx = this.corpses.findIndex(
          (c) => distance(c.pos, job) <= AMBULANCE_PICKUP_RADIUS,
        );
        if (idx !== -1) {
          const corpse = this.corpses[idx];
          this.corpses.splice(idx, 1); // body loaded aboard
          this.respawnPedestrian(corpse.pos);
        }
      });
      return;
    }

    // Driving — out toward the body, or away once it has been collected.
    const driven = this.driveService(amb, dt, AMBULANCE_SPEED);
    this.ambulance = driven;
    if (driven.phase === 'depart') {
      if (this.serviceArrived(driven)) this.ambulance = null; // delivered and gone
      return;
    }
    if (driven.age >= SERVICE_TIMEOUT) {
      this.ambulance = this.departServiceVehicle(driven); // gave up: leave visibly instead of vanishing
      return;
    }
    if (distance(driven.pos, driven.target) <= this.serviceStopRadius(driven.radius)) {
      // Pull up beside the body and send the medic out on foot to fetch it.
      this.ambulance = {
        ...driven,
        phase: 'collect',
        target: job,
        crew: driven.pos,
        pickupElapsed: 0,
        speed: 0,
      };
    } else if (!this.corpses.some((c) => distance(c.pos, job) <= AMBULANCE_PICKUP_RADIUS)) {
      const nextCorpse = this.nearestCorpse(driven.pos);
      this.ambulance = nextCorpse ? this.redirectServiceVehicle(driven, nextCorpse.pos) : this.departServiceVehicle(driven);
    }
  }

  /**
   * Drive the active tow trucks and dispatch new ones so every wrecked car is
   * eventually hauled away. Several tows run at once (one per wreck, capped by
   * {@link MAX_TOWS}) and target the nearest untowed wreck not already claimed,
   * so a pile-up of explosions all get cleared rather than just the first.
   */
  private updateTow(dt: number): void {
    if (!this.city) return;
    this.towDispatchCooldowns = this.towDispatchCooldowns.map((cooldown) => Math.max(0, cooldown - dt));

    // Advance the trucks already on the job, reaping those that finish or give up.
    const alive: TowTruck[] = [];
    for (const prev of this.tows) {
      // Crew on foot: the operator walks out to hook the wreck or back to the cab.
      if (prev.crew) {
        alive.push(
          this.stepCrew(prev, dt, () => {
            this.towedCars[prev.targetCar] = true; // hooked up; removed from play
            const slot = Math.max(0, this.tows.indexOf(prev));
            this.respawnCarAtTowYard(prev.targetCar, slot);
          }),
        );
        continue;
      }
      const tow = this.driveService(prev, dt, TOW_SPEED);
      if (tow.phase === 'depart') {
        if (!this.serviceArrived(tow)) alive.push(tow); // still hauling it off-map
        continue;
      }
      if (tow.age >= SERVICE_TIMEOUT) {
        alive.push(this.departTowTruck(tow)); // gave up: leave visibly instead of vanishing
        continue;
      }
      if (this.towedCars[tow.targetCar]) {
        const claimed = new Set(
          this.tows
            .filter((other) => other !== prev && other.phase !== 'depart')
            .map((other) => other.targetCar),
        );
        const nextTarget = this.nearestUntowedWreckFrom(tow.pos, claimed);
        alive.push(nextTarget === -1 ? this.departTowTruck(tow) : this.redirectTowTruck(tow, nextTarget));
        continue;
      }
      if (distance(tow.pos, this.cars[tow.targetCar].pos) <= tow.radius + AMBULANCE_PICKUP_RADIUS) {
        // Pull up beside the wreck and send the operator out on foot to hook it.
        alive.push({
          ...tow,
          phase: 'collect',
          target: tow.job ?? this.cars[tow.targetCar].pos,
          crew: tow.pos,
          pickupElapsed: 0,
          speed: 0,
        });
      } else {
        alive.push(tow);
      }
    }
    this.tows = alive;

    // Dispatch fresh trucks to any wrecks not yet claimed, up to the cap.
    const claimed = new Set(this.tows.filter((t) => t.phase !== 'depart').map((t) => t.targetCar));
    while (this.tows.length < MAX_TOWS) {
      const idx = this.nearestUntowedWreck(claimed);
      if (idx === -1) break;
      this.tows.push({ ...this.dispatchService(this.cars[idx].pos, 'towYard', claimed.size), targetCar: idx });
      claimed.add(idx);
    }
  }

  /** Index of the untowed wreck nearest the player that no truck is handling,
   * or -1 if there is none. */
  private nearestUntowedWreck(claimed: ReadonlySet<number>): number {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.cars.length; i++) {
      if (!this.wreckedCars[i] || this.towedCars[i] || claimed.has(i) || this.towDispatchCooldowns[i] > 0) continue;
      const d = distance(this.focus, this.cars[i].pos);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  private nearestUntowedWreckFrom(from: Vec2, claimed: ReadonlySet<number>): number {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.cars.length; i++) {
      if (!this.wreckedCars[i] || this.towedCars[i] || claimed.has(i) || this.towDispatchCooldowns[i] > 0) continue;
      const d = distance(from, this.cars[i].pos);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  private nearestCorpse(from: Vec2): Corpse | null {
    if (this.corpses.length === 0) return null;
    return this.corpses.reduce((best, corpse) => (distance(corpse.pos, from) < distance(best.pos, from) ? corpse : best));
  }

  private redirectServiceVehicle<T extends ServiceVehicle>(vehicle: T, job: Vec2): T {
    const approach = this.nearestRoadPoint(job) ?? job;
    return {
      ...vehicle,
      target: approach,
      job,
      phase: 'approach',
      crew: null,
      pickupElapsed: 0,
      age: 0,
      speed: 0,
      blocked: 0,
      laneTarget: undefined,
    };
  }

  private departServiceVehicle<T extends ServiceVehicle>(vehicle: T): T {
    return {
      ...vehicle,
      target: this.farthestCornerTile(vehicle.pos),
      phase: 'depart',
      crew: null,
      pickupElapsed: 0,
      age: 0,
      speed: 0,
      blocked: 0,
      laneTarget: undefined,
    };
  }

  private redirectTowTruck(vehicle: TowTruck, targetCar: number): TowTruck {
    return { ...this.redirectServiceVehicle(vehicle, this.cars[targetCar].pos), targetCar };
  }

  private departTowTruck(vehicle: TowTruck): TowTruck {
    return this.departServiceVehicle(vehicle);
  }

  /** A fresh service vehicle, spawned outside the closest matching service
   * building when the city has one and otherwise on the nearest corner road
   * tile, then aimed (via the road grid) at `target`. */
  private dispatchService(
    target: Vec2,
    facilityKind: 'hospital' | 'towYard',
    slot = 0,
  ): ServiceVehicle {
    const pos = this.serviceSpawnPoint(facilityKind, target, slot) ?? this.nearestCornerTile(target);
    const approach = this.nearestRoadPoint(target) ?? target;
    return {
      pos,
      heading: 0,
      radius: 14,
      dir: nearestCardinal(angle(sub(approach, pos))),
      target: approach,
      job: target,
      phase: 'approach',
      crew: null,
      pickupElapsed: 0,
      age: 0,
      speed: 0,
      blocked: 0,
      health: CAR_MAX_HEALTH,
    };
  }

  /** Spawn point outside the named service building nearest the job, or null if
   * the city has no such facility (tiny test maps can still fall back to
   * corner dispatch). */
  private nearestFacility(
    kind: 'policeStation' | 'hospital' | 'towYard' | 'taxiDepot',
    target: Vec2,
  ): City['facilities'][number] | null {
    const facilities = this.city?.facilities.filter((f) => f.kind === kind);
    if (!facilities || facilities.length === 0) return null;
    let facility = facilities[0];
    let bestDistance = distance(facility.roadSpawn, target);
    for (let i = 1; i < facilities.length; i++) {
      const candidate = facilities[i];
      const candidateDistance = distance(candidate.roadSpawn, target);
      if (candidateDistance >= bestDistance) continue;
      facility = candidate;
      bestDistance = candidateDistance;
    }
    return facility;
  }

  private serviceSpawnPoint(kind: 'hospital' | 'towYard', target: Vec2, slot = 0): Vec2 | null {
    const facility = this.nearestFacility(kind, target);
    if (!facility) return null;
    const offsetRank = Math.ceil(slot / 2);
    const offset = slot === 0 ? 0 : (slot % 2 === 1 ? 1 : -1) * offsetRank * SERVICE_SPAWN_SPACING;
    const verticalRoad =
      facility.roadSpawn.x < facility.building.x ||
      facility.roadSpawn.x > facility.building.x + facility.building.w;
    return verticalRoad
      ? vec2(facility.roadSpawn.x, facility.roadSpawn.y + offset)
      : vec2(facility.roadSpawn.x + offset, facility.roadSpawn.y);
  }

  /** Nearest road-tile centre a service vehicle can actually drive to beside a job. */
  private nearestRoadPoint(target: Vec2): Vec2 | null {
    if (!this.city) return null;
    let best: Vec2 | null = null;
    let bestDistance = Infinity;
    for (let tx = 0; tx < this.city.spec.cols; tx++) {
      for (let ty = 0; ty < this.city.spec.rows; ty++) {
        if (!this.city.isRoad(tx, ty)) continue;
        const candidate = tileCenter(this.city.spec, tx, ty);
        const candidateDistance = distance(candidate, target);
        if (candidateDistance >= bestDistance) continue;
        best = candidate;
        bestDistance = candidateDistance;
      }
    }
    return best;
  }

  /**
   * Advance a service vehicle one step along the roads toward its target. Like
   * NPC traffic it yields to anyone in its path rather than driving through
   * them: it brakes for a pedestrian or the player directly ahead and, if held
   * up too long, turns around to find another way around them. The speed it
   * actually moves is recorded so the shared road-kill check can run an actor
   * over only when the vehicle is genuinely bearing down on them.
   */
  private driveService<T extends ServiceVehicle>(v: T, dt: number, fullSpeed: number): T {
    let dir = v.dir;
    let blocked = v.blocked;
    let speed = fullSpeed;
    const obstacles = this.yieldObstacles();
    let laneTarget = v.laneTarget;
    if (laneTarget !== undefined && Math.abs(laneCross(v.pos, v.dir) - laneTarget) < 1.5) {
      laneTarget = undefined; // reached the lane it was easing into
    }
    if (obstacleAhead(v.pos, v.dir, obstacles)) {
      if (laneTarget === undefined) {
        const lane = laneChangeTarget(this.city!, v.pos, v.dir, obstacles);
        if (lane) laneTarget = laneCross(lane, v.dir);
      }
      if (laneTarget !== undefined) {
        speed = fullSpeed * LANE_CHANGE_SPEED_FACTOR; // roll forward while easing across
        blocked = 0;
      } else {
        blocked += dt;
        if (blocked >= TRAFFIC_REROUTE_WAIT) {
          dir = vec2(-v.dir.x, -v.dir.y); // give up waiting: turn back and divert
          blocked = 0;
        } else {
          speed = 0; // hold short of them
        }
      }
    } else if (this.redLightAhead(v, dir)) {
      speed = 0; // hold at the red light without counting as blocked
      blocked = 0;
    } else {
      blocked = 0;
    }
    const rv: RoadVehicle = { pos: v.pos, heading: v.heading, dir };
    const next = stepRoadVehicle(rv, this.city!, dt, speed, seekChooser(v.target), laneTarget);
    const turned = next.dir.x !== v.dir.x || next.dir.y !== v.dir.y;
    return {
      ...v,
      pos: next.pos,
      heading: next.heading,
      dir: next.dir,
      laneTarget: turned ? undefined : laneTarget,
      age: v.age + dt,
      speed,
      blocked,
    };
  }

  /**
   * Advance a parked service vehicle whose crew member is out on foot. They walk
   * from the vehicle to the cargo ('collect'), and the moment they reach it
   * `onCollect` fires so the caller can load the body / hook the wreck; then they
   * carry it back to the vehicle ('return') and climb aboard, after which it
   * drives off toward the map edge. The vehicle stays put (speed 0) the whole
   * time the crew are out, so it cannot run anyone over while parked. Returns the
   * updated vehicle.
   */
  private stepCrew<T extends ServiceVehicle>(v: T, dt: number, onCollect: () => void): T {
    const step = CREW_WALK_SPEED * dt;
    const advance = (from: Vec2, to: Vec2): Vec2 => {
      const delta = sub(to, from);
      const d = length(delta);
      return d <= step ? to : add(from, scale(normalize(delta), step));
    };
    if (v.phase === 'collect') {
      const crew = advance(v.crew!, v.target); // walk out to the body/wreck
      if (distance(crew, v.target) > CREW_REACH_RADIUS) {
        return { ...v, crew, pickupElapsed: 0, speed: 0 };
      }
      const pickupElapsed = v.pickupElapsed + dt;
      if (pickupElapsed < SERVICE_PICKUP_DWELL) {
        return { ...v, crew, pickupElapsed, speed: 0 };
      }
      onCollect(); // finished loading it: pick the body up / hook the wreck
      return { ...v, crew, phase: 'return', pickupElapsed: 0, speed: 0 };
    }
    // 'return': carry it back to the vehicle, then climb in and prepare to leave.
    const crew = advance(v.crew!, v.pos);
    if (distance(crew, v.pos) <= CREW_REACH_RADIUS) {
      return {
        ...v,
        crew: null,
        phase: 'depart',
        target: this.farthestCornerTile(v.pos),
        pickupElapsed: 0,
        speed: 0,
      };
    }
    return { ...v, crew, pickupElapsed: 0, speed: 0 };
  }

  /** Whether a (departing) service vehicle has reached the map edge it leaves by. */
  private serviceArrived(v: ServiceVehicle): boolean {
    return distance(v.pos, v.target) <= v.radius + this.city!.spec.tile;
  }

  /** How close a service vehicle must get to its chosen road-side stop point to
   * park and send the crew out. Wide multi-lane roads allow stopping from the
   * opposite half of the band; narrow roads keep the original pickup radius. */
  private serviceStopRadius(vehicleRadius: number): number {
    const roadWidth = Math.max(1, Math.min(this.city!.spec.block, this.city!.spec.roadWidth ?? 1));
    return vehicleRadius + Math.max(AMBULANCE_PICKUP_RADIUS, (roadWidth * this.city!.spec.tile) / 2);
  }

  /** Centres of the four corner road tiles (always on the road network). */
  private cornerTiles(): Vec2[] {
    const { spec } = this.city!;
    const lastCol = Math.floor((spec.cols - 1) / spec.block) * spec.block;
    const lastRow = Math.floor((spec.rows - 1) / spec.block) * spec.block;
    return [
      tileCenter(spec, 0, 0),
      tileCenter(spec, lastCol, 0),
      tileCenter(spec, 0, lastRow),
      tileCenter(spec, lastCol, lastRow),
    ];
  }

  private nearestCornerTile(p: Vec2): Vec2 {
    return this.cornerTiles().reduce((a, b) => (distance(p, b) < distance(p, a) ? b : a));
  }

  private farthestCornerTile(p: Vec2): Vec2 {
    return this.cornerTiles().reduce((a, b) => (distance(p, b) > distance(p, a) ? b : a));
  }

  private burningCarThreats(): Vec2[] {
    const threats: Vec2[] = [];
    for (let i = 0; i < this.cars.length; i++) {
      if (this.carIsBurning(i)) threats.push(this.cars[i].pos);
    }
    return threats;
  }

  private nearestThreat(from: Vec2, threats: readonly Vec2[], within = Infinity): Vec2 | null {
    let best: Vec2 | null = null;
    let bestDistance = within;
    for (const threat of threats) {
      const threatDistance = distance(from, threat);
      if (threatDistance > bestDistance) continue;
      best = threat;
      bestDistance = threatDistance;
    }
    return best;
  }

  private panicTarget(from: Vec2, threat: Vec2, panicDistance = PANIC_RADIUS): Vec2 {
    const delta = sub(from, threat);
    const dir = length(delta) > 1e-6 ? normalize(delta) : vec2(1, 0);
    return add(from, scale(dir, panicDistance));
  }

  private playerCarThreatFor(ped: Pedestrian): Vec2 | null {
    if (!this.drivingCar) return null;
    const mission = this.playerServiceMission;
    if (
      mission?.kind === 'police' &&
      ped.policeSuspectId === mission.suspectId &&
      this.drivingCarIndex !== null &&
      this.carKind(this.drivingCarIndex) === 'police'
    ) {
      return null;
    }
    return this.drivingCar.pos;
  }

  /** Positions NPC traffic brakes for: pedestrians and the player when on foot. */
  private yieldObstacles(): Vec2[] {
    const obstacles = this.pedestrians.map((p) => p.pos);
    if (!this.isDriving) obstacles.push(this.player.pos);
    obstacles.push(...this.wreckObstacles().map((wreck) => wreck.pos));
    return obstacles;
  }

  /** Push a live vehicle out of any wrecks it overlapped this tick. Wrecks are
   * static obstacles, so unlike live car-vs-car contacts the wreck does not move. */
  private resolveVehicleAgainstWrecks(body: Car): Car {
    const resolved = resolveCircleCircles(body.pos, body.radius, this.wreckObstacles());
    const pushOut = sub(resolved, body.pos);
    if (length(pushOut) <= 1e-6) return body;
    if (body.speed === 0) return { ...body, pos: resolved };

    const normal = normalize(pushOut);
    const travelDir = scale(fromAngle(body.heading), Math.sign(body.speed) || 1);
    return { ...body, pos: resolved, speed: body.speed * carWallRetention(travelDir, normal) };
  }

  /** Push overlapping vehicles apart so they collide instead of passing through,
   * and damage both from the impact so repeated ramming can destroy any vehicle. */
  private resolveVehicleCollisions(dt: number): void {
    for (const [key, remaining] of this.vehicleImpactCooldowns) {
      const next = remaining - dt;
      if (next > 0) {
        this.vehicleImpactCooldowns.set(key, next);
      } else {
        this.vehicleImpactCooldowns.delete(key);
      }
    }
    const refs = this.damageableVehicles();
    for (let i = 0; i < refs.length; i++) {
      const refA = refs[i];
      const a = this.vehicleBody(refA);
      if (!a) continue;
      for (let j = i + 1; j < refs.length; j++) {
        const refB = refs[j];
        const b = this.vehicleBody(refB);
        if (!b) continue;
        const delta = sub(a.pos, b.pos);
        const dist = length(delta);
        if (dist >= a.radius + b.radius) continue; // not touching
        const [na, nb] = collideCars(a, b);
        this.setVehicleBody(refA, na);
        this.setVehicleBody(refB, nb);
        // Impact = closing speed along the contact normal; a hard enough knock
        // damages both vehicles (so repeated ramming blows any of them up too).
        const normal = dist === 0 ? vec2(1, 0) : normalize(delta);
        const velA = scale(fromAngle(a.heading), a.speed);
        const velB = scale(fromAngle(b.heading), b.speed);
        const closing = Math.abs(dot(sub(velA, velB), normal));
        if (closing > CAR_RAM_THRESHOLD) {
          const pairKey = this.vehicleImpactPairKey(refA, refB);
          if (this.vehicleImpactCooldowns.has(pairKey)) continue;
          // A ram is the player's doing only when their own car is the rammer:
          // each vehicle's damage is "by player" when the OTHER vehicle is theirs.
          const byPlayerA = this.isPlayerVehicle(refB);
          const byPlayerB = this.isPlayerVehicle(refA);
          const rawDmg = (closing - CAR_RAM_THRESHOLD) * CAR_RAM_DAMAGE_SCALE;
          const dmg = byPlayerA || byPlayerB ? rawDmg : Math.min(rawDmg, NPC_IMPACT_DAMAGE_CAP);
          this.damageVehicle(refA, dmg, byPlayerA);
          this.damageVehicle(refB, dmg, byPlayerB);
          this.vehicleImpactCooldowns.set(pairKey, VEHICLE_IMPACT_COOLDOWN);
        }
      }
    }
    for (const ref of refs) {
      const body = this.vehicleBody(ref);
      if (!body) continue;
      this.setVehicleBody(ref, this.resolveVehicleAgainstWrecks(body));
    }
  }

  /** Stable-ish key for a vehicle body within the current simulation state. */
  private vehicleImpactRefKey(ref: DamageableVehicleRef): string {
    if (ref.kind === 'car') return `car:${ref.index}`;
    if (ref.kind === 'ambulance') return 'ambulance';
    if (ref.kind === 'tow') return `tow:${this.tows.indexOf(ref.vehicle)}`;
    return `patrol:${this.police.indexOf(ref.vehicle)}`;
  }

  /** Order-independent key for a vehicle-pair impact cooldown. */
  private vehicleImpactPairKey(a: DamageableVehicleRef, b: DamageableVehicleRef): string {
    const ka = this.vehicleImpactRefKey(a);
    const kb = this.vehicleImpactRefKey(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  }

  /** Collect any ammo pickup the player is standing on (on foot or driving). */
  private collectAmmo(): void {
    if (this.ammoPickups.length === 0) return;
    const reach = AMMO_PICKUP_RADIUS + this.player.radius;
    const remaining: AmmoPickup[] = [];
    for (const pickup of this.ammoPickups) {
      if (distance(this.focus, pickup.pos) <= reach) {
        this.weapon = giveAmmo(this.weapon, pickup.amount);
        this.collected += 1;
        if (this.ammoRespawnPoints.length > 0) this.ammoRespawns.push({ pickup, cooldown: AMMO_RESPAWN_DELAY });
      } else {
        remaining.push(pickup);
      }
    }
    this.ammoPickups = remaining;
  }

  private updateAmmoRespawns(dt: number): void {
    if (this.ammoRespawns.length === 0) return;
    const occupied = this.ammoPickups.map((pickup) => pickup.pos);
    const pending: { pickup: AmmoPickup; cooldown: number }[] = [];
    for (const respawn of this.ammoRespawns) {
      const cooldown = Math.max(0, respawn.cooldown - dt);
      if (cooldown > 0) {
        pending.push({ ...respawn, cooldown });
        continue;
      }
      const pickup = this.respawnAmmoPickup(respawn.pickup, occupied);
      if (!pickup) {
        pending.push({ ...respawn, cooldown: 0 });
        continue;
      }
      this.ammoPickups.push(pickup);
      occupied.push(pickup.pos);
    }
    this.ammoRespawns = pending;
  }

  private buildAmmoRespawnPoints(city: City): Vec2[] {
    const { spec } = city;
    const roadWidth = Math.max(1, Math.min(spec.block, spec.roadWidth ?? 1));
    const lane = Math.floor((roadWidth - 1) / 2);
    const points: Vec2[] = [];
    for (let tx = 0; tx < spec.cols; tx += spec.block) {
      for (let ty = 0; ty < spec.rows; ty += spec.block) {
        const px = Math.min(spec.cols - 1, tx + lane);
        const py = Math.min(spec.rows - 1, ty + lane);
        if (!city.isRoad(px, py) || city.isWater(px, py)) continue;
        points.push(tileCenter(spec, px, py));
      }
    }
    return points;
  }

  private respawnAmmoPickup(collected: AmmoPickup, occupied: readonly Vec2[]): AmmoPickup | null {
    if (this.ammoRespawnPoints.length === 0) return null;
    const isFree = (pos: Vec2) => occupied.every((other) => distance(pos, other) > 1);
    const moved = (pos: Vec2) => distance(pos, collected.pos) > 1;
    const offCamera = (pos: Vec2) => !this.inFrame(pos);
    const options = this.ammoRespawnPoints.filter((pos) => moved(pos) && offCamera(pos) && isFree(pos));
    const fallback = this.ammoRespawnPoints.filter((pos) => moved(pos) && isFree(pos));
    const pool = options.length > 0 ? options : fallback;
    if (pool.length === 0) return null;
    const pos = pool[Math.floor(this.rng() * pool.length)] ?? pool[0];
    return { pos, amount: collected.amount };
  }

  /** Wrap a position so leaving one edge of the map re-enters the opposite one. */
  private wrapPos(p: Vec2): Vec2 {
    return vec2(wrap(p.x, this.bounds.width), wrap(p.y, this.bounds.height));
  }

  private createTaxiState(): TaxiCabState {
    return { fare: null, cooldown: this.nextTaxiCooldown() };
  }

  private nextTaxiCooldown(): number {
    return TAXI_COOLDOWN_MIN + this.rng() * (TAXI_COOLDOWN_MAX - TAXI_COOLDOWN_MIN);
  }

  private isCivilianRoadCar(index: number): boolean {
    const kind = this.carKind(index);
    return kind === 'car' || kind === 'taxi';
  }

  private taxiPassengerName(): string {
    return TAXI_PASSENGER_NAMES[Math.floor(this.rng() * TAXI_PASSENGER_NAMES.length)] ?? 'Fare';
  }

  private spawnCivilianPedestrian(pos: Vec2): void {
    this.pedestrians.push({ pos, heading: 0, radius: 7, state: 'wander', target: pos });
  }

  private findTaxiPassenger(passengerId: number): Pedestrian | null {
    return this.pedestrians.find((ped) => ped.taxiPassengerId === passengerId) ?? null;
  }

  private removeTaxiPassenger(passengerId: number): Pedestrian | null {
    const idx = this.pedestrians.findIndex((ped) => ped.taxiPassengerId === passengerId);
    if (idx === -1) return null;
    const [passenger] = this.pedestrians.splice(idx, 1);
    return passenger ?? null;
  }

  private clearTaxiPassengerRole(passengerId: number): void {
    const idx = this.pedestrians.findIndex((ped) => ped.taxiPassengerId === passengerId);
    if (idx === -1) return;
    const ped = this.pedestrians[idx];
    this.pedestrians[idx] = {
      ...ped,
      state: 'wander',
      target: ped.pos,
      taxiPassengerId: undefined,
      taxiPassengerRole: undefined,
    };
  }

  private randomTaxiStop(awayFrom: Vec2, minDistance: number): Vec2 {
    const sample = (): Vec2 => {
      if (this.sidewalks.length > 0) {
        const strip = this.sidewalks[Math.floor(this.rng() * this.sidewalks.length)] ?? this.sidewalks[0];
        return randomPointInRect(strip, this.rng);
      }
      return vec2(this.rng() * this.bounds.width, this.rng() * this.bounds.height);
    };

    let fallback = sample();
    for (let i = 0; i < 24; i++) {
      const candidate = sample();
      fallback = candidate;
      if (distance(candidate, awayFrom) >= minDistance) return candidate;
    }

    let dir = sub(fallback, awayFrom);
    if (length(dir) < 1e-6) dir = vec2(1, 0);
    return this.wrapPos(add(awayFrom, scale(normalize(dir), minDistance)));
  }

  private taxiFareReward(pickup: Vec2, dropoff: Vec2): number {
    return TAXI_REWARD_BASE + Math.round(distance(pickup, dropoff) * TAXI_REWARD_PER_PIXEL);
  }

  private findPoliceSuspect(suspectId: number): Pedestrian | null {
    return this.pedestrians.find((ped) => ped.policeSuspectId === suspectId) ?? null;
  }

  private removePoliceSuspect(suspectId: number): Pedestrian | null {
    const idx = this.pedestrians.findIndex((ped) => ped.policeSuspectId === suspectId);
    if (idx === -1) return null;
    const [suspect] = this.pedestrians.splice(idx, 1);
    return suspect ?? null;
  }

  private clearPoliceSuspect(suspectId: number): void {
    const idx = this.pedestrians.findIndex((ped) => ped.policeSuspectId === suspectId);
    if (idx === -1) return;
    const ped = this.pedestrians[idx];
    this.pedestrians[idx] = { ...ped, policeSuspectId: undefined };
  }

  private isEligiblePoliceSuspect(ped: Pedestrian): boolean {
    return this.isEligibleMissionTarget(ped) && !ped.policeSuspectId;
  }

  private findPoliceSuspectIndex(near: Vec2): number | null {
    let bestAny: number | null = null;
    let bestAnyDist = Infinity;
    let bestFar: number | null = null;
    let bestFarDist = Infinity;

    for (let i = 0; i < this.pedestrians.length; i++) {
      const ped = this.pedestrians[i];
      if (!this.isEligiblePoliceSuspect(ped)) continue;
      const d = distance(near, ped.pos);
      if (d < bestAnyDist) {
        bestAny = i;
        bestAnyDist = d;
      }
      if (d >= PLAYER_POLICE_MIN_TARGET_DISTANCE && d < bestFarDist) {
        bestFar = i;
        bestFarDist = d;
      }
    }

    return bestFar ?? bestAny;
  }

  private startPlayerPoliceMission(from: Vec2): PlayerServiceMission | null {
    const suspectIndex = this.findPoliceSuspectIndex(from);
    if (suspectIndex === null) return null;
    const suspectId = this.nextPoliceSuspectId++;
    const ped = this.pedestrians[suspectIndex];
    this.pedestrians[suspectIndex] = { ...ped, policeSuspectId: suspectId };
    return {
      id: this.nextServiceMissionId++,
      kind: 'police',
      reward: PLAYER_POLICE_REWARD,
      suspectId,
    };
  }

  private playerServiceReturnPoint(kind: 'hospital' | 'towYard', near: Vec2): Vec2 {
    return this.nearestFacility(kind, near)?.roadSpawn ?? this.nearestRoadPoint(near) ?? near;
  }

  private startPlayerAmbulanceMission(from: Vec2): PlayerServiceMission | null {
    const corpse = this.nearestCorpse(from);
    if (!corpse) return null;
    return {
      id: this.nextServiceMissionId++,
      kind: 'ambulance',
      stage: 'pickup',
      reward: PLAYER_AMBULANCE_REWARD,
      pickup: corpse.pos,
      returnTo: this.playerServiceReturnPoint('hospital', corpse.pos),
    };
  }

  private playerTowTargetAvailable(targetCar: number): boolean {
    return targetCar >= 0 && targetCar < this.cars.length && this.wreckedCars[targetCar] && !this.towedCars[targetCar];
  }

  private nearestPlayerTowTarget(from: Vec2): number {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.cars.length; i++) {
      if (!this.playerTowTargetAvailable(i)) continue;
      const d = distance(from, this.cars[i].pos);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    }
    return best;
  }

  private startPlayerTowMission(from: Vec2): PlayerServiceMission | null {
    const targetCar = this.nearestPlayerTowTarget(from);
    if (targetCar === -1) return null;
    return {
      id: this.nextServiceMissionId++,
      kind: 'tow',
      stage: 'pickup',
      reward: PLAYER_TOW_REWARD,
      targetCar,
      returnTo: this.playerServiceReturnPoint('towYard', this.cars[targetCar]?.pos ?? from),
    };
  }

  private startPlayerServiceMission(kind: PlayerServiceMissionKind, from: Vec2): PlayerServiceMission | null {
    const mission =
      kind === 'police'
        ? this.startPlayerPoliceMission(from)
        : kind === 'ambulance'
          ? this.startPlayerAmbulanceMission(from)
          : this.startPlayerTowMission(from);
    this.playerServiceActionLock = mission && kind !== 'police' ? SERVICE_PICKUP_DWELL : 0;
    return mission;
  }

  private clearPlayerServiceMission(): void {
    const mission = this.playerServiceMission;
    if (mission?.kind === 'police') this.clearPoliceSuspect(mission.suspectId);
    this.playerServiceMission = null;
    this.playerServiceActionLock = 0;
  }

  private markServiceVehicleTheft(index: number): void {
    if (this.stolenServiceVehicles[index]) return;
    const kind = this.carKind(index);
    if (kind === 'police') {
      this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPolice);
      this.stolenServiceVehicles[index] = true;
      return;
    }
    if (kind === 'ambulance' || kind === 'tow') {
      this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPedestrian);
      this.stolenServiceVehicles[index] = true;
    }
  }

  private recordCompletedServiceJob(kind: keyof ServiceCompletionCounts): void {
    this.completedServiceJobs = {
      ...this.completedServiceJobs,
      [kind]: this.completedServiceJobs[kind] + 1,
    };
  }

  private startPlayerTaxiMission(from: Vec2): void {
    const pickup = this.randomTaxiStop(from, TAXI_MIN_PICKUP_DISTANCE);
    const dropoff = this.randomTaxiStop(pickup, TAXI_MIN_DROPOFF_DISTANCE);
    const passengerId = this.nextTaxiPassengerId++;
    this.pedestrians.push({
      pos: pickup,
      heading: 0,
      radius: 7,
      state: 'wait',
      target: pickup,
      taxiPassengerId: passengerId,
      taxiPassengerRole: 'playerFare',
    });
    this.playerTaxiMission = {
      id: this.nextTaxiMissionId++,
      passengerId,
      passengerName: this.taxiPassengerName(),
      stage: 'pickup',
      pickup,
      dropoff,
      reward: this.taxiFareReward(pickup, dropoff),
    };
  }

  private cancelPlayerTaxiMission(at: Vec2): void {
    const fare = this.playerTaxiMission;
    if (!fare) return;
    if (fare.stage === 'pickup') this.clearTaxiPassengerRole(fare.passengerId);
    else this.spawnCivilianPedestrian(at);
    this.playerTaxiMission = null;
  }

  private updateTaxiSystems(): void {
    const idx = this.drivingCarIndex;
    if (idx === null || this.carKind(idx) !== 'taxi' || this.wreckedCars[idx] || this.carIsBurning(idx)) {
      if (this.playerTaxiMission) this.cancelPlayerTaxiMission(this.focus);
      return;
    }

    if (!this.playerTaxiMission) this.startPlayerTaxiMission(this.cars[idx].pos);
    const fare = this.playerTaxiMission;
    if (!fare) return;

    const car = this.cars[idx];
    if (Math.abs(car.speed) > TAXI_SERVICE_SPEED_MAX) return;

    if (fare.stage === 'pickup') {
      const passengerPos = this.findTaxiPassenger(fare.passengerId)?.pos ?? fare.pickup;
      if (distance(car.pos, passengerPos) > TAXI_STOP_RADIUS) return;
      const boarded = this.removeTaxiPassenger(fare.passengerId);
      if (!boarded) {
        this.playerTaxiMission = null;
        this.startPlayerTaxiMission(car.pos);
        return;
      }
      this.playerTaxiMission = { ...fare, stage: 'dropoff' };
      return;
    }

    if (distance(car.pos, fare.dropoff) > TAXI_STOP_RADIUS) return;
    this.score = award(this.score, fare.reward);
    this.spawnCivilianPedestrian(fare.dropoff);
    this.playerTaxiMission = null;
    this.startPlayerTaxiMission(car.pos);
  }

  private updatePlayerServiceMissions(dt: number): void {
    const idx = this.drivingCarIndex;
    const kind = idx === null ? null : this.carKind(idx);
    if (idx === null || (kind !== 'police' && kind !== 'ambulance' && kind !== 'tow') || this.wreckedCars[idx] || this.carIsBurning(idx)) {
      if (this.playerServiceMission) this.clearPlayerServiceMission();
      return;
    }

    const car = this.cars[idx];
    if (!this.playerServiceMission || this.playerServiceMission.kind !== kind) {
      this.clearPlayerServiceMission();
      this.playerServiceMission = this.startPlayerServiceMission(kind, car.pos);
    }

    const mission = this.playerServiceMission;
    if (!mission) return;

    if (this.playerServiceActionLock > 0) {
      this.playerServiceActionLock = Math.max(0, this.playerServiceActionLock - dt);
      if (this.playerServiceActionLock > 0) return;
    }

    if (mission.kind === 'police') {
      const suspect = this.findPoliceSuspect(mission.suspectId);
      if (!suspect) {
        this.clearPlayerServiceMission();
        this.playerServiceMission = this.startPlayerPoliceMission(car.pos);
        return;
      }
      if (Math.abs(car.speed) > TAXI_SERVICE_SPEED_MAX || distance(car.pos, suspect.pos) > PLAYER_POLICE_BUST_RADIUS) {
        return;
      }
      const busted = this.removePoliceSuspect(mission.suspectId);
      this.playerServiceMission = null;
      if (!busted) {
        this.playerServiceMission = this.startPlayerPoliceMission(car.pos);
        return;
      }
      this.score = award(this.score, mission.reward);
      this.recordCompletedServiceJob('police');
      this.spawnCivilianPedestrian(this.nearestFacility('policeStation', busted.pos)?.spawn ?? busted.pos);
      this.playerServiceMission = this.startPlayerPoliceMission(car.pos);
      return;
    }

    if (mission.kind === 'ambulance') {
      if (mission.stage === 'pickup') {
        const corpseIndex = this.corpses.findIndex((corpse) => distance(corpse.pos, mission.pickup) <= AMBULANCE_PICKUP_RADIUS);
        if (corpseIndex === -1) {
          this.playerServiceMission = this.startPlayerAmbulanceMission(car.pos);
          return;
        }
        if (Math.abs(car.speed) > TAXI_SERVICE_SPEED_MAX || distance(car.pos, this.corpses[corpseIndex].pos) > AMBULANCE_PICKUP_RADIUS) {
          return;
        }
        const [corpse] = this.corpses.splice(corpseIndex, 1);
        if (!corpse) return;
        this.playerServiceMission = { ...mission, stage: 'return' };
        return;
      }

      if (Math.abs(car.speed) > TAXI_SERVICE_SPEED_MAX || distance(car.pos, mission.returnTo) > TAXI_STOP_RADIUS) {
        return;
      }
      this.respawnPedestrian(mission.pickup);
      this.score = award(this.score, mission.reward);
      this.recordCompletedServiceJob('ambulance');
      this.playerServiceMission = this.startPlayerAmbulanceMission(car.pos);
      return;
    }

    if (mission.stage === 'pickup') {
      if (!this.playerTowTargetAvailable(mission.targetCar)) {
        this.playerServiceMission = this.startPlayerTowMission(car.pos);
        return;
      }
      const wreck = this.cars[mission.targetCar];
      if (Math.abs(car.speed) > TAXI_SERVICE_SPEED_MAX || distance(car.pos, wreck.pos) > AMBULANCE_PICKUP_RADIUS) {
        return;
      }
      this.towedCars[mission.targetCar] = true;
      this.playerServiceMission = { ...mission, stage: 'return' };
      return;
    }

    if (Math.abs(car.speed) > TAXI_SERVICE_SPEED_MAX || distance(car.pos, mission.returnTo) > TAXI_STOP_RADIUS) {
      return;
    }
    this.respawnCarAtTowYard(mission.targetCar);
    this.score = award(this.score, mission.reward);
    this.recordCompletedServiceJob('tow');
    this.playerServiceMission = this.startPlayerTowMission(car.pos);
  }

  private isEligibleTaxiPassenger(ped: Pedestrian): boolean {
    return ped.state === 'wander' && !ped.returningTo && !ped.uniform && !ped.missionTarget && !ped.taxiPassengerRole && !ped.policeSuspectId;
  }

  private findTaxiHailPassengerIndex(near: Vec2): number | null {
    let best: number | null = null;
    let bestDist = TAXI_HAIL_SEARCH_RADIUS;
    for (let i = 0; i < this.pedestrians.length; i++) {
      const ped = this.pedestrians[i];
      if (!this.isEligibleTaxiPassenger(ped)) continue;
      const d = distance(near, ped.pos);
      if (d > bestDist) continue;
      best = i;
      bestDist = d;
    }
    return best;
  }

  private beginNpcTaxiFare(passengerIndex: number): TaxiFareState {
    const passengerId = this.nextTaxiPassengerId++;
    const ped = this.pedestrians[passengerIndex];
    const waiting: Pedestrian = {
      ...ped,
      state: 'wait',
      target: ped.pos,
      missionTarget: false,
      taxiPassengerId: passengerId,
      taxiPassengerRole: 'npcFare',
    };
    this.pedestrians[passengerIndex] = waiting;
    return {
      id: this.nextTaxiMissionId++,
      passengerId,
      passengerName: this.taxiPassengerName(),
      stage: 'pickup',
      pickup: waiting.pos,
      dropoff: this.randomTaxiStop(waiting.pos, TAXI_MIN_DROPOFF_DISTANCE),
      reward: 0,
      dwell: 0,
    };
  }

  private clearNpcTaxiFare(index: number, releasePos: Vec2): void {
    const state = this.taxiStates[index];
    if (!state) return;
    const fare = state.fare;
    if (!fare) {
      state.cooldown = this.nextTaxiCooldown();
      return;
    }
    if (fare.stage === 'pickup') this.clearTaxiPassengerRole(fare.passengerId);
    else this.spawnCivilianPedestrian(releasePos);
    state.fare = null;
    state.cooldown = this.nextTaxiCooldown();
  }

  private planTaxiTraffic(index: number, car: Car, dt: number): { hold: boolean; routeTarget: Vec2 | undefined } {
    const state = this.taxiStates[index];
    if (!state) return { hold: false, routeTarget: undefined };

    let fare = state.fare;
    if (!fare) {
      if (state.cooldown > 0) {
        state.cooldown = Math.max(0, state.cooldown - dt);
        return { hold: false, routeTarget: undefined };
      }
      if (this.rng() >= TAXI_NPC_ASSIGN_CHANCE * dt) return { hold: false, routeTarget: undefined };
      const passengerIndex = this.findTaxiHailPassengerIndex(car.pos);
      if (passengerIndex === null) {
        state.cooldown = this.nextTaxiCooldown();
        return { hold: false, routeTarget: undefined };
      }
      fare = this.beginNpcTaxiFare(passengerIndex);
      state.fare = fare;
    }

    if (fare.stage === 'pickup') {
      const passenger = this.findTaxiPassenger(fare.passengerId);
      if (!passenger) {
        state.fare = null;
        state.cooldown = this.nextTaxiCooldown();
        return { hold: false, routeTarget: undefined };
      }
      fare = { ...fare, pickup: passenger.pos };
      state.fare = fare;
      const routeTarget = this.nearestRoadPoint(passenger.pos) ?? passenger.pos;
      if (distance(car.pos, passenger.pos) > TAXI_STOP_RADIUS) return { hold: false, routeTarget };
      const dwell = fare.dwell + dt;
      if (dwell < TAXI_STOP_DWELL) {
        state.fare = { ...fare, dwell };
        return { hold: true, routeTarget };
      }
      const boarded = this.removeTaxiPassenger(fare.passengerId);
      if (!boarded) {
        state.fare = null;
        state.cooldown = this.nextTaxiCooldown();
        return { hold: false, routeTarget: undefined };
      }
      state.fare = { ...fare, stage: 'dropoff', dwell: 0 };
      return { hold: false, routeTarget: this.nearestRoadPoint(fare.dropoff) ?? fare.dropoff };
    }

    const routeTarget = this.nearestRoadPoint(fare.dropoff) ?? fare.dropoff;
    if (distance(car.pos, fare.dropoff) > TAXI_STOP_RADIUS) return { hold: false, routeTarget };
    const dwell = fare.dwell + dt;
    if (dwell < TAXI_STOP_DWELL) {
      state.fare = { ...fare, dwell };
      return { hold: true, routeTarget };
    }
    this.spawnCivilianPedestrian(fare.dropoff);
    state.fare = null;
    state.cooldown = this.nextTaxiCooldown();
    return { hold: true, routeTarget: undefined };
  }

  private updateDriving(c: Controls, dt: number, actionPressed: boolean): void {
    const idx = this.drivingCarIndex!;
    const car = this.cars[idx];

    if (actionPressed) {
      const offset = fromAngle(car.heading + Math.PI / 2, car.radius + this.player.radius + EXIT_GAP);
      this.player = { ...this.player, pos: add(car.pos, offset), angle: car.heading };
      if (this.carKind(idx) === 'taxi') this.cancelPlayerTaxiMission(add(car.pos, offset));
      this.drivingCarIndex = null;
      return;
    }

    if (this.carIsBurning(idx)) {
      this.cars[idx] = { ...car, speed: 0 };
      return;
    }

    const stepped = stepCar(car, c, dt, this.tuning);
    const collided = collideCarWithWalls(stepped, this.walls);
    this.cars[idx] = { ...collided, pos: this.wrapPos(collided.pos) };
  }

  private updatePedestrians(dt: number, tickSpatial?: TickSpatialCache): void {
    if (this.pedestrians.length === 0) return;

    const blockers = tickSpatial?.blockingCars ?? this.blockingCars();
    const hazards = tickSpatial?.hazardVehicles ?? this.hazardVehicles();
    const fireThreats = tickSpatial?.fireThreats ?? this.burningCarThreats();
    const civilianThreats =
      tickSpatial?.civilianThreats ?? [
        ...fireThreats,
        ...this.gunfireThreats,
      ];
    const survivors: Pedestrian[] = [];

    for (const ped of this.pedestrians) {
      const returningTo = ped.returningTo;
      const playerCarThreat = returningTo ? null : this.playerCarThreatFor(ped);
      const threats = returningTo
        ? fireThreats
        : playerCarThreat
          ? [playerCarThreat, ...civilianThreats]
          : civilianThreats;
      let routeCache: PedestrianRouteCache | undefined;
      if (returningTo && distance(ped.pos, returningTo) <= ARRIVE_RADIUS) {
        continue; // reached the building entrance: disappear inside
      }
      // Any vehicle moving fast enough runs the pedestrian over; only when the
      // player is at the wheel do they earn heat for it.
      const hit = this.runningOver(ped.pos, ped.radius, hazards);
      if (hit) {
        if (hit.byPlayer) this.registerKill('pedestrian', !!ped.missionTarget); // the player ran them down
        this.addCorpse(ped.pos); // leave a body in the road
        continue; // pedestrian is run over and removed
      }
      const homeTarget = (() => {
        if (!returningTo) return ped.target;
        const sightBlocked = this.walls.some((wll) => segmentIntersectsRect(ped.pos, returningTo, wll));
        if (!sightBlocked || !this.navGrid) return returningTo;
        const route = this.routePedestrianTo(ped, this.navGrid, returningTo);
        routeCache = route.cache;
        return route.waypoint ?? returningTo;
      })();
      // A calm pedestrian strolls the precomputed waypoint graph: it walks
      // straight to its current node and, on arrival, picks a neighbouring node
      // (never doubling straight back). Edges only cross a road over a crosswalk,
      // so this keeps NPCs on the pavement and over zebra crossings with no
      // per-tick routing search. Worlds without a city keep the free-roam wander.
      let navNode = ped.navNode;
      let navFrom = ped.navFrom;
      const graph = !returningTo ? this.pedestrianGraph : undefined;
      const steerPoint = (() => {
        if (!graph) return undefined;
        if (navNode === undefined || navNode < 0 || navNode >= graph.nodes.length) {
          navNode = graph.nearestNode(ped.pos);
          navFrom = -1;
        }
        if (navNode < 0) return undefined;
        if (distance(ped.pos, graph.nodes[navNode]) <= ARRIVE_RADIUS) {
          const next = nextWanderNode(graph, navNode, navFrom ?? -1, this.rng);
          navFrom = navNode;
          navNode = next;
        }
        return graph.nodes[navNode];
      })();
      const stepped = stepPedestrian(
        { ...ped, target: steerPoint ?? homeTarget },
        { threats, bounds: this.bounds, sidewalks: this.sidewalks, steerTarget: steerPoint },
        dt,
        this.rng,
      );
      // Pedestrians cannot walk through cars too slow to have run them over
      // (handled above); buildings are resolved last so they stay authoritative.
      const offCars = resolveCircleCircles(stepped.pos, stepped.radius, blockers);
      let pos = resolveCircleRects(offCars, stepped.radius, this.nearbyWalls(offCars, stepped.radius));
      // When calm, a pedestrian keeps to the pavement and only steps onto the
      // road at a crosswalk; a fleeing pedestrian will bolt across anywhere.
      if (!returningTo && stepped.state === 'wander' && this.onForbiddenRoad(pos)) {
        pos = ped.pos; // hold at the kerb instead of jaywalking
      }
      const blocked = pos.x !== stepped.pos.x || pos.y !== stepped.pos.y;
      // A blocked graph walker re-acquires the nearest reachable node so it
      // never grinds against an obstacle; a blocked free-roamer turns around.
      if (graph && blocked && navNode !== undefined && navNode >= 0) {
        navNode = graph.nearestNode(pos);
        navFrom = -1;
      }
      const target = (() => {
        if (graph && navNode !== undefined && navNode >= 0) return graph.nodes[navNode];
        if (blocked && stepped.state === 'wander') {
          return returningTo
            ? returningTo
            : wanderTarget({ threats, bounds: this.bounds, sidewalks: this.sidewalks }, pos, this.rng);
        }
        return stepped.target;
      })();
      if (returningTo && distance(pos, returningTo) <= ARRIVE_RADIUS) {
        continue;
      }
      const survivor = { ...stepped, pos, target, returningTo, navNode, navFrom };
      if (routeCache) this.pedestrianRouteCache.set(survivor, routeCache);
      survivors.push(survivor);
    }
    this.pedestrians = survivors;
  }

  private routePedestrianTo(
    ped: Pedestrian,
    grid: NavGrid,
    target: Vec2,
  ): { waypoint: Vec2 | null; cache: PedestrianRouteCache } {
    const tx = Math.floor(target.x / grid.tile);
    const ty = Math.floor(target.y / grid.tile);
    const cached = this.pedestrianRouteCache.get(ped);
    const targetMatches = cached && cached.tx === tx && cached.ty === ty;
    let field: FlowField;
    if (targetMatches) {
      field = cached.field;
    } else {
      field = computeFlowField(grid, target);
      this.pedestrianFlowFieldComputations++;
    }
    return {
      waypoint: flowWaypoint(grid, field, ped.pos),
      cache: { tx, ty, field },
    };
  }

  /** Whether a point is on an open road lane that is not a marked crossing, so a
   * calm pedestrian should not step there (no jaywalking). */
  private onForbiddenRoad(pos: Vec2): boolean {
    if (!this.city) return false;
    if (this.nearbySidewalks(pos).some((sidewalk) => pointInRect(pos, sidewalk))) return false;
    const { tx, ty } = tileCoord(this.city.spec, pos);
    if (!this.city.isRoad(tx, ty) || this.city.isWater(tx, ty)) return false;
    if (this.city.isBridge(tx, ty)) return false;
    return !this.nearbyCrosswalks(pos).some((cw) => pointInRect(pos, cw));
  }

  /** Kill the player if a fast vehicle strikes them while on foot. */
  private checkRoadKill(hazards: readonly HazardVehicle[] = this.hazardVehicles()): void {
    if (this.status !== 'playing') return;
    this.runOverFootPolice(hazards);
    this.runOverServiceCrews(hazards);
    if (this.isDriving) return; // safe inside a car
    const hit = this.runningOver(this.player.pos, this.player.radius, hazards);
    if (hit) this.applyPlayerDamage(hit.speed);
  }

  /** Drown the player (on foot or driving) if their centre passes over water. */
  private checkDrowning(): void {
    if (this.status !== 'playing' || this.water.length === 0) return;
    if (!this.water.some((w) => pointInRect(this.focus, w))) return;
    this.applyPlayerDamage(this.health.max); // water is always lethal
  }

  /** Apply damage to the player, triggering the wasted state if it is fatal. */
  private applyPlayerDamage(amount: number): void {
    if (this.status !== 'playing') return;
    this.health = damage(this.health, amount);
    if (isDead(this.health)) {
      this.cancelPlayerTaxiMission(this.focus);
      this.clearPlayerServiceMission();
      this.status = 'wasted';
      this.bustedTimer = RESPAWN_DELAY;
      this.endChase(); // dying ends the chase: the heat clears at once
    }
  }

  /** Clear the wanted level and all pursuit (police + their bullets). Used the
   * moment the player is busted or wasted, so the chase visibly ends right away
   * rather than lingering through the respawn countdown. */
  private endChase(): void {
    this.wanted = createWanted();
    this.police = [];
    this.policeBullets = [];
  }

  /** Fire the weapon toward the player's facing when the fire button is held. */
  private updateWeapon(c: Controls, dt: number): void {
    this.weapon = cool(this.weapon, dt);
    if (!c.fire) return;
    const heading = this.drivingCar?.heading ?? this.player.angle;
    const muzzle = (this.drivingCar?.radius ?? this.player.radius) + 6;
    const origin = add(this.focus, fromAngle(heading, muzzle));
    const result = fire(this.weapon, origin, heading);
    this.weapon = result.weapon;
    if (result.bullet) this.bullets.push(result.bullet);
  }

  /** Advance bullets, removing those that expire, hit a wall, or hit a target. */
  private updateBullets(dt: number): void {
    const surviving: Bullet[] = [];
    const spatial = this.buildBulletSpatialIndex();
    for (const current of this.bullets) {
      const stepped = stepBullet(current, dt);
      if (!stepped) continue; // expired
      if (this.walls.some((w) => circleIntersectsRect(stepped.pos, BULLET_RADIUS, w))) {
        continue; // stopped by a building
      }
      const pedHit = this.findNearbyArrayEntry(
        spatial.pedestrians,
        stepped.pos,
        MAX_BULLET_TARGET_RADIUS,
        this.pedestrians,
        (ped) => bulletHits(stepped, ped.pos, ped.radius),
      );
      if (pedHit) {
        const ped = pedHit.item;
        this.killOnFootNpc(ped.pos, 'pedestrian', true, !!ped.missionTarget);
        this.pedestrians.splice(pedHit.index, 1);
        continue;
      }
      const copHit = this.findNearbyArrayEntry(
        spatial.police,
        stepped.pos,
        MAX_BULLET_TARGET_RADIUS,
        this.police,
        (cop) => bulletHits(stepped, cop.pos, cop.radius),
      );
      if (copHit) {
        const cop = copHit.item;
        if (cop.kind === 'foot') {
          this.police.splice(copHit.index, 1);
          this.killOnFootNpc(cop.pos, 'police', true);
        } else {
          this.damageVehicle({ kind: 'patrol', vehicle: cop }, stepped.damage, true);
        }
        continue;
      }
      if (this.ambulance?.crew && bulletHits(stepped, this.ambulance.crew, this.player.radius)) {
        this.killAmbulanceCrew(true);
        continue;
      }
      const towCrewHit = this.findNearbyArrayEntry(
        spatial.towCrews,
        stepped.pos,
        MAX_BULLET_TARGET_RADIUS,
        this.tows,
        (tow) => !!tow.crew && bulletHits(stepped, tow.crew, this.player.radius),
      );
      if (towCrewHit) {
        this.killTowCrew(towCrewHit.index, true);
        continue;
      }
      if (this.ambulance && bulletHits(stepped, this.ambulance.pos, this.ambulance.radius)) {
        this.damageVehicle({ kind: 'ambulance', vehicle: this.ambulance }, stepped.damage, true);
        continue;
      }
      const towHit = this.findNearbyArrayEntry(
        spatial.tows,
        stepped.pos,
        MAX_BULLET_TARGET_RADIUS,
        this.tows,
        (tow) => bulletHits(stepped, tow.pos, tow.radius),
      );
      if (towHit) {
        this.damageVehicle({ kind: 'tow', vehicle: towHit.item }, stepped.damage, true);
        continue;
      }
      this.reactToNearbyGunfire(stepped.pos, stepped.velocity, spatial.cars);
      // Shooting a car damages it; enough hits destroy it. The car the player is
      // driving is excluded (their muzzle sits ahead of it anyway).
      const carIdx = this.findNearbyCarIndex(
        spatial.cars,
        stepped.pos,
        MAX_BULLET_TARGET_RADIUS,
        (i) => !this.wreckedCars[i] && i !== this.drivingCarIndex && bulletHits(stepped, this.cars[i].pos, this.cars[i].radius),
      );
      if (carIdx !== -1) {
        this.redirectNpcDriverFromShot(carIdx, stepped.velocity);
        this.damageCar(carIdx, stepped.damage, true); // the player shot it
        continue;
      }
      surviving.push(stepped);
    }
    this.bullets = surviving;
  }

  private reactToNearbyGunfire(pos: Vec2, travel: Vec2, carsHash?: SpatialHash<number>): void {
    this.gunfireThreats.push(pos);
    if (!this.city) return;
    const panicRadius = PANIC_RADIUS / 2 + MAX_BULLET_TARGET_RADIUS;
    const visitCar = (i: number): void => {
      if (i === this.drivingCarIndex || this.wreckedCars[i] || this.carIsBurning(i) || !this.isCivilianRoadCar(i)) {
        return;
      }
      const driver = this.carDrivers[i];
      if (!driver) return;
      const car = this.cars[i];
      if (distance(pos, car.pos) > car.radius + PANIC_RADIUS / 2) return;
      this.redirectNpcDriverFromShot(i, travel);
    };
    if (carsHash) {
      this.forEachNearbyInSpatialHash(carsHash, pos, panicRadius, visitCar);
      return;
    }
    for (let i = 0; i < this.cars.length; i++) {
      visitCar(i);
    }
  }

  /** Apply damage to a car; destroy it into a wreck once its health runs out.
   * `byPlayer` carries whether the player caused this damage, so only the player's
   * own havoc earns them heat (NPC pile-ups do not). */
  private damageCar(idx: number, amount: number, byPlayer: boolean): void {
    if (this.wreckedCars[idx] || this.carIsBurning(idx)) return;
    this.carHealth[idx] -= amount;
    if (this.carHealth[idx] <= 0) this.igniteCar(idx, byPlayer);
  }

  private redirectNpcDriverFromShot(idx: number, travel: Vec2): void {
    if (!this.city || idx === this.drivingCarIndex || !this.isCivilianRoadCar(idx)) return;
    const driver = this.carDrivers[idx];
    if (!driver) return;
    const escapeDir = length(travel) > 1e-6 ? nearestCardinal(angle(travel)) : driver.dir;
    const escapeTarget = add(this.cars[idx].pos, scale(escapeDir, this.city.spec.tile * 4));
    this.carDrivers[idx] = {
      ...driver,
      dir: escapeDir,
      blocked: 0,
      laneTarget: undefined,
      escapeTarget,
    };
  }

  private evacuateNpcDriver(idx: number): void {
    if (idx === this.drivingCarIndex || !this.isCivilianRoadCar(idx)) return;
    const driver = this.carDrivers[idx];
    if (!driver) return;
    const car = this.cars[idx];
    const exitPos = add(car.pos, fromAngle(angle(driver.dir) + Math.PI / 2, car.radius + 10));
    this.pedestrians.push({
      pos: exitPos,
      heading: angle(driver.dir),
      radius: 7,
      state: 'wander',
      target: this.panicTarget(exitPos, car.pos),
    });
  }

  /** Start a car burning in place; it explodes after a short escape window. */
  private igniteCar(idx: number, byPlayer: boolean): void {
    if (this.wreckedCars[idx] || this.carIsBurning(idx)) return;
    const kind = this.carKind(idx);
    if (kind === 'taxi') {
      this.clearNpcTaxiFare(idx, this.cars[idx].pos);
      if (idx === this.drivingCarIndex) this.cancelPlayerTaxiMission(this.cars[idx].pos);
    } else if (idx === this.drivingCarIndex && (kind === 'police' || kind === 'ambulance' || kind === 'tow')) {
      this.clearPlayerServiceMission();
    }
    this.towedCars[idx] = false;
    this.carHealth[idx] = 0;
    this.carBurnTimers[idx] = VEHICLE_BURN_DURATION;
    this.carBurnByPlayer[idx] = byPlayer;
    this.towDispatchCooldowns[idx] = 0;
    this.evacuateNpcDriver(idx);
    this.carDrivers[idx] = null;
    this.cars[idx] = { ...this.cars[idx], speed: 0 };
  }

  /**
   * Destroy a car: leave a wreck, spawn an explosion, and damage everything in
   * the blast (chaining to nearby cars). `byPlayer` credits the player with the
   * kill and the heat for setting it off.
   */
  private explodeCar(idx: number, byPlayer: boolean): void {
    if (this.wreckedCars[idx]) return;
    this.towedCars[idx] = false; // a fresh wreck can be recovered again later
    this.wreckedCars[idx] = true;
    this.carHealth[idx] = 0;
    this.carBurnTimers[idx] = 0;
    this.carBurnByPlayer[idx] = false;
    this.towDispatchCooldowns[idx] = 0;
    this.carDrivers[idx] = null;
    const center = this.cars[idx].pos;
    this.cars[idx] = { ...this.cars[idx], speed: 0 };
    this.triggerExplosion(center, byPlayer);
  }

  /** Count burning fuses down and detonate any vehicles whose timer has expired. */
  private stepBurningCars(dt: number): void {
    const exploding: { index: number; byPlayer: boolean }[] = [];
    for (let i = 0; i < this.carBurnTimers.length; i++) {
      const remaining = this.carBurnTimers[i] ?? 0;
      if (remaining <= 0 || this.wreckedCars[i]) continue;
      const next = remaining - dt;
      this.carBurnTimers[i] = next;
      if (next <= 0) {
        exploding.push({ index: i, byPlayer: this.carBurnByPlayer[i] ?? false });
      }
    }
    for (const { index, byPlayer } of exploding) {
      this.explodeCar(index, byPlayer);
    }
  }

  /** Advance active explosions, dropping those whose visual has finished. */
  private stepExplosions(dt: number): void {
    if (this.explosions.length === 0) return;
    this.explosions = this.explosions
      .map((e) => ({ ...e, age: e.age + dt }))
      .filter((e) => e.age < e.life);
  }

  /** Record an elimination by the player: counts a kill, scores, and adds heat. */
  private registerKill(kind: 'pedestrian' | 'police', missionTarget = false): void {
    this.kills += 1;
    if (missionTarget) this.targetKills += 1;
    if (kind === 'pedestrian') {
      this.score = award(this.score, SCORE_PER_PEDESTRIAN);
      this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPedestrian);
    } else {
      this.score = award(this.score, SCORE_PER_POLICE);
      this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPolice);
    }
  }

  private clearMissionTargets(): void {
    for (let i = 0; i < this.pedestrians.length; i++) {
      const ped = this.pedestrians[i];
      if (!ped.missionTarget) continue;
      this.pedestrians[i] = { ...ped, missionTarget: false };
    }
  }

  private isEligibleMissionTarget(ped: Pedestrian): boolean {
    return !ped.returningTo && !ped.uniform && !ped.taxiPassengerRole && !ped.policeSuspectId;
  }

  private syncMissionTargets(): void {
    const obj = this.missionObjective;
    if (obj?.kind !== 'eliminate' || !obj.targetsOnly) {
      this.clearMissionTargets();
      return;
    }

    const progress = Math.max(0, this.targetKills - this.objectiveBaseline.targetKills);
    const remaining = Math.max(0, obj.count - progress);
    const targeted: number[] = [];
    const candidates: number[] = [];

    for (let i = 0; i < this.pedestrians.length; i++) {
      const ped = this.pedestrians[i];
      if (!this.isEligibleMissionTarget(ped)) {
        if (ped.missionTarget) this.pedestrians[i] = { ...ped, missionTarget: false };
        continue;
      }
      if (ped.missionTarget) {
        targeted.push(i);
      } else {
        candidates.push(i);
      }
    }

    for (let i = remaining; i < targeted.length; i++) {
      const idx = targeted[i];
      this.pedestrians[idx] = { ...this.pedestrians[idx], missionTarget: false };
    }

    const need = Math.max(0, remaining - Math.min(targeted.length, remaining));
    const pool = candidates.slice();
    for (let i = 0; i < need && pool.length > 0; i++) {
      const pick = Math.floor(this.rng() * pool.length);
      const idx = pool.splice(pick, 1)[0];
      this.pedestrians[idx] = { ...this.pedestrians[idx], missionTarget: true };
    }
  }

  /** Advance the active mission, bank its reward, and roll on to the next one. */
  private updateMissionProgress(): void {
    if (this.status !== 'playing' || !this.campaign) return;
    const mission = currentMission(this.campaign);
    if (!mission) return; // campaign finished
    const advanced = updateMission(mission, this.missionCtx(), this.objectiveBaseline);
    if (advanced.currentIndex !== mission.currentIndex) {
      this.objectiveBaseline = this.baselineNow(); // the next objective counts from here
    }
    if (isComplete(advanced) && !isComplete(mission)) {
      this.score = award(this.score, advanced.reward);
      this.objectiveBaseline = this.baselineNow(); // the next mission counts from here
    }
    this.campaign = updateCampaign(this.campaign, advanced);
    // Endless play: when a whole campaign is done, line up a fresh random one.
    if (this.loopCampaigns && isCampaignComplete(this.campaign)) {
      this.campaign = this.pickNextCampaign();
      this.objectiveBaseline = this.baselineNow();
    }
    this.syncMissionTargets();
  }

  /** Snapshot of world facts the mission system reads to evaluate objectives. */
  private missionCtx() {
    return {
      playerPos: this.focus,
      kills: this.kills,
      targetKills: this.targetKills,
      collected: this.collected,
      elapsed: this.elapsed,
      wantedStars: this.wantedStars,
      serviceCompleted: { ...this.completedServiceJobs },
    };
  }

  /** Build a fresh campaign from a randomly chosen template (avoiding an
   * immediate repeat when more than one is available). */
  private pickNextCampaign(): Campaign {
    const n = this.campaignPool.length;
    let pick = Math.floor(this.rng() * n);
    if (n > 1 && pick === this.campaignIndex) pick = (pick + 1) % n; // no back-to-back repeat
    this.campaignIndex = pick;
    return createCampaign(this.campaignPool[pick].map(resetMission));
  }

  /** Snapshot the progress counters for measuring the next objective. */
  private baselineNow(): MissionBaseline {
    return {
      kills: this.kills,
      targetKills: this.targetKills,
      collected: this.collected,
      elapsed: this.elapsed,
      serviceCompleted: { ...this.completedServiceJobs },
    };
  }

  /** Police station nearest a point, or null on atypical maps without any. */
  private nearestPoliceSpawn(p: Vec2): Vec2 | null {
    if (this.policeSpawns.length === 0) return null;
    return this.policeSpawns.reduce((best, spawn) => (distance(p, spawn) < distance(p, best) ? spawn : best));
  }

  /** Home station a police unit returns to once the wanted level is gone. */
  private policeHome(cop: Police): Vec2 | null {
    return cop.home ?? this.nearestPoliceSpawn(cop.pos);
  }

  /** Any lethal vehicle striking an officer on foot turns them into a corpse.
   * Player-caused impacts still award the higher police kill score and heat. */
  private runOverFootPolice(hazards: readonly HazardVehicle[]): void {
    const survivors: Police[] = [];
    for (const cop of this.police) {
      if (cop.kind !== 'foot') {
        survivors.push(cop);
        continue;
      }
      const hit = this.runningOver(cop.pos, cop.radius, hazards);
      if (!hit) {
        survivors.push(cop);
        continue;
      }
      this.killOnFootNpc(cop.pos, 'police', hit.byPlayer);
    }
    this.police = survivors;
  }

  /** Any lethal vehicle striking a medic or tow operator on foot kills them,
   * leaving a corpse and abandoning the service vehicle for later recovery. */
  private runOverServiceCrews(hazards: readonly HazardVehicle[]): void {
    const crewRadius = 7;
    const ambCrew = this.ambulance?.crew;
    if (ambCrew) {
      const hit = this.runningOver(ambCrew, crewRadius, hazards);
      if (hit) this.killAmbulanceCrew(hit.byPlayer);
    }
    for (let i = this.tows.length - 1; i >= 0; i--) {
      const crew = this.tows[i].crew;
      if (!crew) continue;
      const hit = this.runningOver(crew, crewRadius, hazards);
      if (hit) this.killTowCrew(i, hit.byPlayer);
    }
  }

  /** Move a single police unit back to its station. Returns null once it has
   * effectively reached home and can be removed from the world. */
  private returnPoliceToStation(cop: Police, dt: number): Police | null {
    const home = this.policeHome(cop);
    if (!home) return null;

    if (cop.kind === 'car' && this.city) {
      const speed = policeSpeedFor('car', 1);
      const stepped = { ...stepPoliceCar(cop, home, this.city, dt, speed), speed, fireCooldown: 0 };
      return distance(stepped.pos, home) <= stepped.radius + this.city.spec.tile
        ? null
        : { ...stepped, returningHome: cop.returningHome };
    }

    const speed = policeSpeedFor(cop.kind, 1);
    const fireThreat = this.nearestThreat(cop.pos, this.burningCarThreats(), PANIC_RADIUS);
    const sightBlocked = !fireThreat && this.walls.some((wll) => segmentIntersectsRect(cop.pos, home, wll));
    const homeFlow = !fireThreat && sightBlocked && this.navGrid ? computeFlowField(this.navGrid, home) : undefined;
    const waypoint = fireThreat
      ? this.panicTarget(cop.pos, fireThreat)
      : sightBlocked && this.navGrid && homeFlow
        ? (flowWaypoint(this.navGrid, homeFlow, cop.pos) ?? home)
        : home;
    const stepped = stepPolice(cop, waypoint, dt, speed);
    const resolved = {
      ...stepped,
      pos: resolveCircleRects(stepped.pos, stepped.radius, this.walls),
      speed: cop.kind === 'car' ? speed : 0,
      fireCooldown: 0,
      returningHome: cop.returningHome,
    };
    return hasCaught(resolved, home) ? null : resolved;
  }

  private updateWantedAndPolice(dt: number): void {
    this.wanted = decay(this.wanted, dt);

    if (!isWanted(this.wanted)) {
      this.policeBullets = []; // chase over: stop any remaining incoming fire
      this.police = this.police.flatMap((cop) => {
        const next = this.returnPoliceToStation(cop, dt);
        return next ? [next] : [];
      });
      return;
    }

    const desired = this.wantedStars;
    while (this.police.filter((cop) => !cop.returningHome).length < desired && this.policeSpawns.length > 0) {
      const spawn = this.policeSpawns[this.police.length % this.policeSpawns.length];
      // Alternate between officers on foot and patrol cars.
      const kind: 'foot' | 'car' = this.police.length % 2 === 0 ? 'foot' : 'car';
      this.police.push({
        pos: spawn,
        heading: 0,
        radius: kind === 'car' ? 14 : 12,
        kind,
        home: spawn,
        speed: 0,
        health: kind === 'car' ? CAR_MAX_HEALTH : undefined,
      });
    }

    // Police pursue the player. Patrol cars follow the road grid (when a city is
    // present); officers on foot follow a flow field through the streets so they
    // route around buildings instead of grinding straight into them. A patrol car
    // pulls up at arrest range and stops (rather than ramming the player) while an
    // officer it dropped closes in to make the arrest.
    const arrestable = this.arrestable;
    // One BFS toward the player, shared by every officer on foot this tick.
    this.copFlow =
      this.navGrid && this.police.some((c) => c.kind === 'foot' && !c.returningHome)
        ? computeFlowField(this.navGrid, this.focus)
        : undefined;
    this.police = this.police.flatMap((cop) => {
      if (cop.returningHome) {
        const next = this.returnPoliceToStation(cop, dt);
        return next ? [next] : [];
      }
      if (cop.kind === 'car' && this.city) {
        if (arrestable && this.patrolAtDeployRange(cop)) return [{ ...cop, speed: 0 }]; // pull up, don't ram
        const speed = policeSpeedFor('car', this.wantedStars);
        return [{ ...stepPoliceCar(cop, this.focus, this.city, dt, speed), speed }];
      }
      // An officer on foot charges straight at the player whenever no building
      // blocks the line of sight; the flow field is only needed to route around
      // buildings. Homing directly closes the final step onto a player loitering
      // on the pavement, whose tile sits off the walkable nav-grid (so a flow-
      // field-only officer is steered to a road tile and never quite reaches).
      const fireThreat = this.nearestThreat(cop.pos, this.burningCarThreats(), PANIC_RADIUS);
      const sightBlocked = !fireThreat && this.walls.some((wll) => segmentIntersectsRect(cop.pos, this.focus, wll));
      const waypoint = fireThreat
        ? this.panicTarget(cop.pos, fireThreat)
        : sightBlocked && this.navGrid && this.copFlow
          ? (flowWaypoint(this.navGrid, this.copFlow, cop.pos) ?? this.focus)
          : this.focus;
      const stepped = stepPolice(cop, waypoint, dt, policeSpeedFor(cop.kind, this.wantedStars));
      return [{ ...stepped, pos: resolveCircleRects(stepped.pos, stepped.radius, this.walls), speed: 0 }];
    });

    this.updatePoliceShooting(dt);
  }

  /** Whether the player is pinned enough that police begin an arrest attempt:
   * on foot, or in a car too slow to escape. (A fast car outruns the law.) */
  private get arrestable(): boolean {
    return !this.isDriving || Math.abs(this.drivingCar!.speed) < BUST_SPEED;
  }

  /** Whether a pursuing officer may actually complete the arrest right now. On
   * foot this is immediate; in a car the player must have been fully stopped for
   * a full second first. */
  private get bustable(): boolean {
    return !this.isDriving || this.carStoppedForBusted >= CAR_BUST_STOP_DELAY;
  }

  /** Whether a patrol car is near enough to pull up and drop an officer to make
   * the arrest. The car stops here rather than driving onto the player. */
  private patrolAtDeployRange(cop: Police): boolean {
    return cop.kind === 'car' && distance(cop.pos, this.focus) <= POLICE_DEPLOY_RANGE;
  }

  /** At a high wanted level, officers on foot open fire on the player. */
  private updatePoliceShooting(dt: number): void {
    const shooting = this.wantedStars >= POLICE_SHOOT_MIN_STARS;
    const target = this.focus;
    this.police = this.police.map((cop) => {
      if (cop.kind !== 'foot' || cop.returningHome) return cop;
      const cooldown = (cop.fireCooldown ?? 0) - dt;
      if (shooting && cooldown <= 0 && distance(cop.pos, target) <= POLICE_SHOOT_RANGE) {
        const heading = angle(sub(target, cop.pos));
        const origin = add(cop.pos, fromAngle(heading, cop.radius + 4));
        this.policeBullets.push({
          pos: origin,
          velocity: fromAngle(heading, POLICE_BULLET_SPEED),
          life: POLICE_BULLET_LIFE,
          damage: POLICE_BULLET_DAMAGE,
        });
        return { ...cop, fireCooldown: POLICE_FIRE_COOLDOWN };
      }
      return { ...cop, fireCooldown: Math.max(0, cooldown) };
    });
  }

  /** Advance police bullets, stopping at walls and wounding the player on a hit. */
  private updatePoliceBullets(dt: number): void {
    if (this.policeBullets.length === 0) return;
    const surviving: Bullet[] = [];
    const spatial = this.buildBulletSpatialIndex();
    for (const current of this.policeBullets) {
      const stepped = stepBullet(current, dt);
      if (!stepped) continue; // expired
      if (this.walls.some((w) => circleIntersectsRect(stepped.pos, BULLET_RADIUS, w))) {
        continue; // stopped by a building
      }
      const carIdx = this.findNearbyCarIndex(
        spatial.cars,
        stepped.pos,
        MAX_BULLET_TARGET_RADIUS,
        (i) => !this.wreckedCars[i] && i !== this.drivingCarIndex && bulletHits(stepped, this.cars[i].pos, this.cars[i].radius),
      );
      if (carIdx !== -1) {
        this.redirectNpcDriverFromShot(carIdx, stepped.velocity);
        this.damageCar(carIdx, stepped.damage, false);
        continue;
      }
      this.reactToNearbyGunfire(stepped.pos, stepped.velocity, spatial.cars);
      const hitRadius = this.drivingCar?.radius ?? this.player.radius;
      if (this.status === 'playing' && bulletHits(stepped, this.focus, hitRadius)) {
        this.applyPlayerDamage(stepped.damage);
        continue;
      }
      surviving.push(stepped);
    }
    this.policeBullets = surviving;
  }

  /**
   * A patrol car that has pulled up near a catchable player drops an officer to
   * make the arrest (whether the player is on foot or stuck in a slow car). Each
   * patrol car drops at most one officer; that officer then closes in and busts
   * the player like any cop on foot, so cars never make the arrest by ramming.
   */
  private updateArrest(): void {
    if (this.status !== 'playing' || !isWanted(this.wanted) || !this.arrestable) return;
    const deployed: Police[] = [];
    this.police = this.police.map((cop) => {
      if (cop.kind !== 'car' || cop.deployed) return cop;
      if (this.patrolAtDeployRange(cop)) {
        const side = fromAngle(cop.heading + Math.PI / 2, cop.radius + 12);
        deployed.push({
          pos: add(cop.pos, side),
          heading: cop.heading,
          radius: 12,
          kind: 'foot',
          home: this.policeHome(cop) ?? cop.pos,
        });
        return { ...cop, deployed: true };
      }
      return cop;
    });
    this.police.push(...deployed);
  }

  /** Bust the player if a pursuing officer ON FOOT reaches them while they cannot
   * escape. Patrol cars never bust by contact — they must drop an officer. */
  private checkBusted(): void {
    if (this.status !== 'playing') return; // already busted or wasted this tick
    if (!isWanted(this.wanted) || this.police.length === 0) return;
    if (!this.bustable) return; // in a car, you must have been stopped long enough
    if (this.police.some((cop) => cop.kind === 'foot' && !cop.returningHome && hasCaught(cop, this.focus))) {
      this.cancelPlayerTaxiMission(this.focus);
      this.clearPlayerServiceMission();
      this.status = 'busted';
      this.bustedTimer = RESPAWN_DELAY;
      this.endChase(); // the arrest ends the chase: clear the wanted level now
    }
  }

  /** Track how long the current player car has been fully stopped for arrest. */
  private updateCarBustTimer(dt: number): void {
    if (!this.isDriving) {
      this.carStoppedForBusted = 0;
      return;
    }
    const underArrestAttempt = this.police.some(
      (cop) => cop.kind === 'foot' && !cop.returningHome && hasCaught(cop, this.focus),
    );
    if (!underArrestAttempt) {
      this.carStoppedForBusted = 0;
      return;
    }
    this.carStoppedForBusted =
      Math.abs(this.drivingCar!.speed) <= CAR_BUST_STOP_SPEED ? this.carStoppedForBusted + dt : 0;
  }

  /** Count down the busted/wasted screen; respawn on confirm or when time runs out. */
  private updateDown(c: Controls, dt: number): void {
    this.bustedTimer -= dt;
    const confirmPressed = c.confirm && !this.prevConfirm; // rising edge
    if (confirmPressed || this.bustedTimer <= 0) this.respawn();
  }

  /** Hospital for wasted, police station for busted, or the fallback spawn. */
  private playerRespawnPoint(): Vec2 {
    const anchor = this.focus;
    if (this.status === 'wasted') {
      return this.nearestFacility('hospital', anchor)?.spawn ?? this.spawn;
    }
    if (this.status === 'busted') {
      return (
        this.nearestFacility('policeStation', anchor)?.spawn ??
        this.nearestPoliceSpawn(anchor) ??
        this.spawn
      );
    }
    return this.spawn;
  }

  /** Reset the player to the appropriate respawn point, clear the heat, and resume play. */
  private respawn(): void {
    this.clearPlayerServiceMission();
    this.player = { ...this.player, pos: this.playerRespawnPoint(), angle: 0 };
    this.wanted = createWanted();
    this.police = [];
    this.bullets = [];
    this.policeBullets = [];
    this.explosions = [];
    this.corpses = [];
    this.ambulance = null;
    this.tows = [];
    this.health = createHealth(this.health.max);
    this.drivingCarIndex = null;
    this.playerTaxiMission = null;
    this.playerServiceMission = null;
    this.playerServiceActionLock = 0;
    this.carStoppedForBusted = 0;
    this.bustedTimer = 0;
    this.status = 'playing';
  }

  private nearestCarIndex(p: Vec2, within: number): number | null {
    let best: number | null = null;
    let bestDist = within;
    this.cars.forEach((car, i) => {
      if (this.wreckedCars[i] || this.carIsBurning(i)) return; // can't get into a wreck or a burning car
      const d = distance(p, car.pos);
      if (d <= bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }
}
