import { type Vec2, vec2, add, sub, scale, normalize, length, distance, dot, fromAngle, angle } from './vector';
import {
  type Rect,
  resolveCircleRects,
  resolveCircleCircles,
  circleIntersectsRect,
  pointInRect,
  segmentIntersectsRect,
} from './collision';
import { wrap } from './math';
import {
  type Car,
  type CarTuning,
  DEFAULT_CAR_TUNING,
  stepCar,
  collideCarWithWalls,
  collideCars,
} from './vehicle';
import { type OnFootActor, walk } from './entity';
import { type Pedestrian, stepPedestrian, wanderTarget } from './pedestrianAI';
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
  /** Where the player respawns after being busted. Defaults to their start. */
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
/** Default maximum player health. */
export const PLAYER_MAX_HEALTH = 100;
/** Collision radius (px) of a bullet, for stopping it at walls. */
export const BULLET_RADIUS = 2;
/** Score awarded for eliminating a pedestrian. */
export const SCORE_PER_PEDESTRIAN = 50;
/** Score awarded for eliminating a police officer. */
export const SCORE_PER_POLICE = 150;
/** How close the player must be to an ammo pickup to collect it. */
export const AMMO_PICKUP_RADIUS = 22;
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
/** Fraction of cruising speed a vehicle still rolls forward at while easing into
 * another lane, so a lane change is a natural diagonal swerve rather than a car
 * sliding straight sideways. */
const LANE_CHANGE_SPEED_FACTOR = 0.6;

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

/** Common state for a dispatched service vehicle that follows the roads. */
export interface ServiceVehicle {
  pos: Vec2;
  heading: number;
  radius: number;
  /** Current cardinal travel direction (for the shared road-following model). */
  dir: Vec2;
  /** Where it is currently headed (its job, then the map edge to leave by). */
  target: Vec2;
  /** Which step of the pickup sequence it is in: driving out to the job
   * ('approach'), parked while the crew walk out to fetch the cargo ('collect'),
   * parked while they carry it back to the vehicle ('return'), or driving away
   * with it ('depart'). */
  phase: ServicePhase;
  /** Position of the crew member while they are out of the vehicle on foot, or
   * null when they are aboard. The vehicle stays parked whenever this is set. */
  crew: Vec2 | null;
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

type DamageableVehicleRef =
  | { kind: 'car'; index: number }
  | { kind: 'ambulance'; vehicle: Ambulance }
  | { kind: 'tow'; vehicle: TowTruck }
  | { kind: 'patrol'; vehicle: Police };

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
  /** Targets the player has eliminated this run. */
  kills = 0;
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
  private readonly viewRadius: number;
  private readonly rng: () => number;
  private readonly city?: City;
  /** Walkability grid for on-foot NPC navigation (built from the city, if any). */
  private readonly navGrid?: NavGrid;
  /** Flow field to the player, recomputed each tick and shared by all foot cops. */
  private copFlow?: FlowField;
  private readonly spawn: Vec2;
  private carDrivers: (TrafficAI | null)[];
  /** Whether a recovered wreck at this slot should be recycled back into play
   * from a tow yard (ordinary cars do; abandoned service vehicles do not). */
  private carRespawnsAtTow: boolean[];
  /** Remaining hit points of each car, parallel to `cars`. */
  private carHealth: number[];
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
  private objectiveBaseline: MissionBaseline = { kills: 0, collected: 0, elapsed: 0 };
  /** Seconds elapsed in the current run (drives survive objectives). */
  private elapsed = 0;

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
    this.sidewalks = opts.sidewalks ?? opts.city?.sidewalks ?? [];
    this.viewRadius = opts.viewRadius ?? DEFAULT_VIEW_RADIUS;
    this.enterRadius = opts.enterRadius ?? 28;
    this.tuning = opts.carTuning ?? DEFAULT_CAR_TUNING;
    this.rng = opts.rng ?? Math.random;
    this.city = opts.city;
    this.navGrid = opts.city ? buildNavGrid(opts.city) : undefined;
    this.spawn = opts.spawn ?? opts.player.pos;
    this.carDrivers = this.cars.map((_, i) => opts.carDrivers?.[i] ?? null);
    this.carRespawnsAtTow = this.cars.map(() => true);
    this.carHealth = this.cars.map(() => CAR_MAX_HEALTH);
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
  }

  get isDriving(): boolean {
    return this.drivingCarIndex !== null;
  }

  get drivingCar(): Car | null {
    return this.drivingCarIndex === null ? null : this.cars[this.drivingCarIndex];
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
    this.lights = tickLights(this.lights, dt);
    this.updateTraffic(dt);
    this.resolveVehicleCollisions(dt);
    this.updatePedestrians(dt);
    this.updateNpcDriving(dt);
    this.checkRoadKill();
    this.checkDrowning();
    this.collectAmmo();
    this.updateWeapon(c, dt);
    this.updateBullets(dt);
    this.updateWantedAndPolice(dt);
    this.updateArrest();
    this.updatePoliceBullets(dt);
    this.stepExplosions(dt);
    this.updateCorpses(dt);
    this.updateAmbulance(dt);
    this.updateTow(dt);
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
      const idx = this.nearestCarIndex(moved.pos, this.enterRadius);
      if (idx !== null) {
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

  /** Every vehicle that can currently run an actor over — player, NPC and police
   * cars and dispatched service vehicles (ambulances, tow trucks) alike — in one
   * normalised list, so the road-kill rule is applied uniformly and any future
   * vehicle type inherits it for free. `byPlayer` flags hits the player is to
   * blame for (those earn heat and score). */
  private hazardVehicles(): { pos: Vec2; radius: number; speed: number; byPlayer: boolean }[] {
    const hazards: { pos: Vec2; radius: number; speed: number; byPlayer: boolean }[] = [];
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
  private runningOver(pos: Vec2, r: number): { byPlayer: boolean; speed: number } | null {
    for (const h of this.hazardVehicles()) {
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
      if (!ai || i === this.drivingCarIndex || this.wreckedCars[i]) continue;
      const car = this.cars[i];

      let dir = ai.dir;
      let blocked = ai.blocked ?? 0;
      let speed = TRAFFIC_SPEED;
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
      } else if (this.redLightAhead(car, ai.dir)) {
        speed = 0; // hold at the red light (not counted as being stuck)
        blocked = 0;
      } else {
        blocked = 0; // path cleared
      }

      const out = stepTraffic(car, { dir, blocked, laneTarget }, this.city, dt, speed, this.rng);
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
      if (i === this.drivingCarIndex || this.carDrivers[i] || this.wreckedCars[i]) continue;
      if (distance(p, this.cars[i].pos) <= PED_ENTER_RADIUS + this.cars[i].radius) return i;
    }
    return null;
  }

  /** Record a dead pedestrian as a corpse left lying in the street. */
  private addCorpse(pos: Vec2): void {
    this.corpses.push({ pos, offscreenFor: 0, inFrameFor: 0 });
  }

  /** Resolve an on-foot NPC death into a body left in the world, crediting the
   * player only when they caused it. Shared by pedestrians, foot police, and
   * any service crew member currently out of their vehicle. */
  private killOnFootNpc(pos: Vec2, kind: 'pedestrian' | 'police', byPlayer: boolean): void {
    this.addCorpse(pos);
    if (byPlayer) this.registerKill(kind);
  }

  /** Kill the ambulance medic currently out on foot, aborting the call. */
  private killAmbulanceCrew(byPlayer: boolean): void {
    const amb = this.ambulance;
    const crew = amb?.crew;
    if (!amb || !crew) return;
    this.killOnFootNpc(crew, 'pedestrian', byPlayer);
    this.abandonServiceVehicle(amb);
    this.ambulance = null;
  }

  /** Kill a tow-truck operator currently out on foot, abandoning that truck's
   * job. The wreck remains available for another tow to claim later. */
  private killTowCrew(index: number, byPlayer: boolean): void {
    const tow = this.tows[index];
    if (!tow?.crew) return;
    this.killOnFootNpc(tow.crew, 'pedestrian', byPlayer);
    this.abandonServiceVehicle(tow);
    this.tows.splice(index, 1);
  }

  /** Leave an unused service vehicle behind as a towable wreck instead of
   * making it vanish when its crew dies on foot. */
  private abandonServiceVehicle(v: ServiceVehicle): void {
    this.cars.push({ pos: v.pos, heading: v.heading, speed: 0, radius: v.radius });
    this.carDrivers.push(null);
    this.carRespawnsAtTow.push(false);
    this.carHealth.push(0);
    this.wreckedCars.push(true);
    this.towedCars.push(false);
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

  /** Apply damage to any vehicle type, exploding it once its health runs out. */
  private damageVehicle(ref: DamageableVehicleRef, amount: number, byPlayer: boolean): void {
    if (ref.kind === 'car') {
      this.damageCar(ref.index, amount, byPlayer);
      return;
    }
    if (ref.kind === 'ambulance') {
      if (this.ambulance !== ref.vehicle) return;
      const health = ref.vehicle.health - amount;
      if (health <= 0) {
        this.explodeServiceVehicle(ref, byPlayer);
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
        this.explodeServiceVehicle(ref, byPlayer);
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
      this.explodePatrolCar(ref, byPlayer);
    } else {
      const next = { ...ref.vehicle, health };
      this.police[idx] = next;
      ref.vehicle = next;
    }
  }

  /** Destroy a service vehicle in an explosion and remove it from play. */
  private explodeServiceVehicle(
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
    const center = vehicle.pos;
    const crew = vehicle.crew;
    if (ref.kind === 'ambulance') {
      this.ambulance = null;
    } else {
      const idx = this.tows.indexOf(ref.vehicle);
      if (idx === -1) return;
      this.tows.splice(idx, 1);
    }
    if (crew) this.killOnFootNpc(crew, 'pedestrian', byPlayer);
    this.triggerExplosion(center, byPlayer);
  }

  /** Destroy a patrol car in an explosion and remove it from play. */
  private explodePatrolCar(
    ref: Extract<DamageableVehicleRef, { kind: 'patrol' }>,
    byPlayer: boolean,
  ): void {
    const idx = this.police.indexOf(ref.vehicle);
    if (idx === -1 || ref.vehicle.kind !== 'car') return;
    const center = ref.vehicle.pos;
    this.police.splice(idx, 1);
    this.triggerExplosion(center, byPlayer);
  }

  /** Spawn an explosion and apply its blast uniformly to actors and vehicles. */
  private triggerExplosion(center: Vec2, byPlayer: boolean): void {
    this.explosions.push({ pos: center, radius: EXPLOSION_RADIUS, age: 0, life: EXPLOSION_LIFE });
    this.explosionsTriggered += 1;
    this.noteVehicleDestroyed(byPlayer);

    this.pedestrians = this.pedestrians.filter((p) => {
      if (distance(center, p.pos) > EXPLOSION_RADIUS + p.radius) return true;
      this.killOnFootNpc(p.pos, 'pedestrian', byPlayer);
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
    this.wreckedCars[idx] = false;
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

    // Crew on foot: the medic is walking out to the body or carrying it back.
    if (amb.crew) {
      this.ambulance = this.stepCrew(amb, dt, () => {
        const idx = this.corpses.findIndex(
          (c) => distance(c.pos, amb.target) <= AMBULANCE_PICKUP_RADIUS,
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
      this.ambulance = null; // gave up
      return;
    }
    if (distance(driven.pos, driven.target) <= driven.radius + AMBULANCE_PICKUP_RADIUS) {
      // Pull up beside the body and send the medic out on foot to fetch it.
      this.ambulance = { ...driven, phase: 'collect', crew: driven.pos, speed: 0 };
    } else if (!this.corpses.some((c) => distance(c.pos, driven.target) <= AMBULANCE_PICKUP_RADIUS)) {
      this.ambulance = null; // the body it was sent for is already gone: give up
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
      if (tow.age >= SERVICE_TIMEOUT || this.towedCars[tow.targetCar]) continue; // gave up / gone
      if (distance(tow.pos, this.cars[tow.targetCar].pos) <= tow.radius + AMBULANCE_PICKUP_RADIUS) {
        // Pull up beside the wreck and send the operator out on foot to hook it.
        alive.push({ ...tow, phase: 'collect', crew: tow.pos, speed: 0 });
      } else {
        alive.push(tow);
      }
    }
    this.tows = alive;

    // Dispatch fresh trucks to any wrecks not yet claimed, up to the cap.
    const claimed = new Set(this.tows.map((t) => t.targetCar));
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
      if (!this.wreckedCars[i] || this.towedCars[i] || claimed.has(i)) continue;
      const d = distance(this.focus, this.cars[i].pos);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
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
    return {
      pos,
      heading: 0,
      radius: 14,
      dir: nearestCardinal(angle(sub(target, pos))),
      target,
      phase: 'approach',
      crew: null,
      age: 0,
      speed: 0,
      blocked: 0,
      health: CAR_MAX_HEALTH,
    };
  }

  /** Spawn point outside the named service building nearest the job, or null if
   * the city has no such facility (tiny test maps can still fall back to
   * corner dispatch). */
  private nearestFacility(kind: 'hospital' | 'towYard', target: Vec2): City['facilities'][number] | null {
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
      if (distance(crew, v.target) <= CREW_REACH_RADIUS) {
        onCollect(); // reached it: pick the body up / hook the wreck
        return { ...v, crew, phase: 'return', speed: 0 };
      }
      return { ...v, crew, speed: 0 };
    }
    // 'return': carry it back to the vehicle, then climb in and prepare to leave.
    const crew = advance(v.crew!, v.pos);
    if (distance(crew, v.pos) <= CREW_REACH_RADIUS) {
      return { ...v, crew: null, phase: 'depart', target: this.farthestCornerTile(v.pos), speed: 0 };
    }
    return { ...v, crew, speed: 0 };
  }

  /** Whether a (departing) service vehicle has reached the map edge it leaves by. */
  private serviceArrived(v: ServiceVehicle): boolean {
    return distance(v.pos, v.target) <= v.radius + this.city!.spec.tile;
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

  /** Positions NPC traffic brakes for: pedestrians and the player when on foot. */
  private yieldObstacles(): Vec2[] {
    const obstacles = this.pedestrians.map((p) => p.pos);
    if (!this.isDriving) obstacles.push(this.player.pos);
    return obstacles;
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
      } else {
        remaining.push(pickup);
      }
    }
    this.ammoPickups = remaining;
  }

  /** Wrap a position so leaving one edge of the map re-enters the opposite one. */
  private wrapPos(p: Vec2): Vec2 {
    return vec2(wrap(p.x, this.bounds.width), wrap(p.y, this.bounds.height));
  }

  private updateDriving(c: Controls, dt: number, actionPressed: boolean): void {
    const idx = this.drivingCarIndex!;
    const car = this.cars[idx];

    if (actionPressed) {
      const offset = fromAngle(car.heading + Math.PI / 2, car.radius + this.player.radius + EXIT_GAP);
      this.player = { ...this.player, pos: add(car.pos, offset), angle: car.heading };
      this.drivingCarIndex = null;
      return;
    }

    const stepped = stepCar(car, c, dt, this.tuning);
    const collided = collideCarWithWalls(stepped, this.walls);
    this.cars[idx] = { ...collided, pos: this.wrapPos(collided.pos) };
  }

  private updatePedestrians(dt: number): void {
    if (this.pedestrians.length === 0) return;

    // A fast-moving player car is a threat pedestrians flee from.
    const drivingCar = this.drivingCar;
    const threats: Vec2[] = drivingCar ? [drivingCar.pos] : [];
    const survivors: Pedestrian[] = [];

    for (const ped of this.pedestrians) {
      // Any vehicle moving fast enough runs the pedestrian over; only when the
      // player is at the wheel do they earn heat for it.
      const hit = this.runningOver(ped.pos, ped.radius);
      if (hit) {
        if (hit.byPlayer) this.registerKill('pedestrian'); // the player ran them down
        this.addCorpse(ped.pos); // leave a body in the road
        continue; // pedestrian is run over and removed
      }
      const stepped = stepPedestrian(
        ped,
        { threats, bounds: this.bounds, sidewalks: this.sidewalks },
        dt,
        this.rng,
      );
      // Pedestrians cannot walk through cars too slow to have run them over
      // (handled above); buildings are resolved last so they stay authoritative.
      const offCars = resolveCircleCircles(stepped.pos, stepped.radius, this.blockingCars());
      let pos = resolveCircleRects(offCars, stepped.radius, this.walls);
      // When calm, a pedestrian keeps to the pavement and only steps onto the
      // road at a crosswalk; a fleeing pedestrian will bolt across anywhere.
      if (stepped.state === 'wander' && this.onForbiddenRoad(pos)) {
        pos = ped.pos; // hold at the kerb instead of jaywalking
      }
      const blocked = pos.x !== stepped.pos.x || pos.y !== stepped.pos.y;
      // A wandering pedestrian that walks into a building (or up to the kerb)
      // turns around (picks a new target) rather than grinding against it.
      const target =
        blocked && stepped.state === 'wander'
          ? wanderTarget({ threats, bounds: this.bounds, sidewalks: this.sidewalks }, pos, this.rng)
          : stepped.target;
      survivors.push({ ...stepped, pos, target });
    }
    this.pedestrians = survivors;
  }

  /** Whether a point is on an open road lane that is not a marked crossing, so a
   * calm pedestrian should not step there (no jaywalking). */
  private onForbiddenRoad(pos: Vec2): boolean {
    if (!this.city) return false;
    if (this.sidewalks.some((sidewalk) => pointInRect(pos, sidewalk))) return false;
    const { tx, ty } = tileCoord(this.city.spec, pos);
    if (!this.city.isRoad(tx, ty) || this.city.isWater(tx, ty)) return false;
    return !this.city.crosswalks.some((cw) => pointInRect(pos, cw));
  }

  /** Kill the player if a fast vehicle strikes them while on foot. */
  private checkRoadKill(): void {
    if (this.status !== 'playing' || this.isDriving) return; // safe inside a car
    const hit = this.runningOver(this.player.pos, this.player.radius);
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
    for (const current of this.bullets) {
      const stepped = stepBullet(current, dt);
      if (!stepped) continue; // expired
      if (this.walls.some((w) => circleIntersectsRect(stepped.pos, BULLET_RADIUS, w))) {
        continue; // stopped by a building
      }
      const pedIdx = this.pedestrians.findIndex((p) => bulletHits(stepped, p.pos, p.radius));
      if (pedIdx !== -1) {
        this.killOnFootNpc(this.pedestrians[pedIdx].pos, 'pedestrian', true);
        this.pedestrians.splice(pedIdx, 1);
        continue;
      }
      const copIdx = this.police.findIndex((cop) => bulletHits(stepped, cop.pos, cop.radius));
      if (copIdx !== -1) {
        const cop = this.police[copIdx];
        if (cop.kind === 'foot') {
          this.police.splice(copIdx, 1);
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
      const towIdx = this.tows.findIndex(
        (tow) => tow.crew && bulletHits(stepped, tow.crew, this.player.radius),
      );
      if (towIdx !== -1) {
        this.killTowCrew(towIdx, true);
        continue;
      }
      if (this.ambulance && bulletHits(stepped, this.ambulance.pos, this.ambulance.radius)) {
        this.damageVehicle({ kind: 'ambulance', vehicle: this.ambulance }, stepped.damage, true);
        continue;
      }
      const tow = this.tows.find((t) => bulletHits(stepped, t.pos, t.radius));
      if (tow) {
        this.damageVehicle({ kind: 'tow', vehicle: tow }, stepped.damage, true);
        continue;
      }
      // Shooting a car damages it; enough hits destroy it. The car the player is
      // driving is excluded (their muzzle sits ahead of it anyway).
      const carIdx = this.cars.findIndex(
        (car, i) =>
          !this.wreckedCars[i] &&
          i !== this.drivingCarIndex &&
          bulletHits(stepped, car.pos, car.radius),
      );
      if (carIdx !== -1) {
        this.damageCar(carIdx, stepped.damage, true); // the player shot it
        continue;
      }
      surviving.push(stepped);
    }
    this.bullets = surviving;
  }

  /** Apply damage to a car; destroy it into a wreck once its health runs out.
   * `byPlayer` carries whether the player caused this damage, so only the player's
   * own havoc earns them heat (NPC pile-ups do not). */
  private damageCar(idx: number, amount: number, byPlayer: boolean): void {
    if (this.wreckedCars[idx]) return;
    this.carHealth[idx] -= amount;
    if (this.carHealth[idx] <= 0) this.explodeCar(idx, byPlayer);
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
    this.carDrivers[idx] = null;
    const center = this.cars[idx].pos;
    this.cars[idx] = { ...this.cars[idx], speed: 0 };
    this.triggerExplosion(center, byPlayer);
  }

  /** Advance active explosions, dropping those whose visual has finished. */
  private stepExplosions(dt: number): void {
    if (this.explosions.length === 0) return;
    this.explosions = this.explosions
      .map((e) => ({ ...e, age: e.age + dt }))
      .filter((e) => e.age < e.life);
  }

  /** Record an elimination by the player: counts a kill, scores, and adds heat. */
  private registerKill(kind: 'pedestrian' | 'police'): void {
    this.kills += 1;
    if (kind === 'pedestrian') {
      this.score = award(this.score, SCORE_PER_PEDESTRIAN);
      this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPedestrian);
    } else {
      this.score = award(this.score, SCORE_PER_POLICE);
      this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPolice);
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
  }

  /** Snapshot of world facts the mission system reads to evaluate objectives. */
  private missionCtx() {
    return {
      playerPos: this.focus,
      kills: this.kills,
      collected: this.collected,
      elapsed: this.elapsed,
      wantedStars: this.wantedStars,
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
    return { kills: this.kills, collected: this.collected, elapsed: this.elapsed };
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

  /** A speeding player car still runs over officers on foot, even if they are
   * currently returning to the station after the chase has ended. */
  private runDownFootPolice(): void {
    const car = this.drivingCar;
    if (!car || Math.abs(car.speed) < RUN_OVER_SPEED) return;
    const survivors: Police[] = [];
    for (const cop of this.police) {
      if (cop.kind === 'foot' && distance(car.pos, cop.pos) <= car.radius + cop.radius) {
        this.registerKill('police'); // the player ran them down
      } else {
        survivors.push(cop);
      }
    }
    this.police = survivors;
  }

  /** Move a single police unit back to its station. Returns null once it has
   * effectively reached home and can be removed from the world. */
  private returnPoliceToStation(cop: Police, dt: number): Police | null {
    const home = this.policeHome(cop);
    if (!home) return null;

    if (cop.kind === 'car' && this.city) {
      const speed = policeSpeedFor('car', 1);
      const stepped = { ...stepPoliceCar(cop, home, this.city, dt, speed), speed, fireCooldown: 0 };
      return distance(stepped.pos, home) <= stepped.radius + this.city.spec.tile ? null : stepped;
    }

    const speed = policeSpeedFor(cop.kind, 1);
    const sightBlocked = this.walls.some((wll) => segmentIntersectsRect(cop.pos, home, wll));
    const homeFlow = sightBlocked && this.navGrid ? computeFlowField(this.navGrid, home) : undefined;
    const waypoint =
      sightBlocked && this.navGrid && homeFlow
        ? (flowWaypoint(this.navGrid, homeFlow, cop.pos) ?? home)
        : home;
    const stepped = stepPolice(cop, waypoint, dt, speed);
    const resolved = {
      ...stepped,
      pos: resolveCircleRects(stepped.pos, stepped.radius, this.walls),
      speed: cop.kind === 'car' ? speed : 0,
      fireCooldown: 0,
    };
    return hasCaught(resolved, home) ? null : resolved;
  }

  private updateWantedAndPolice(dt: number): void {
    this.wanted = decay(this.wanted, dt);

    if (!isWanted(this.wanted)) {
      this.policeBullets = []; // chase over: stop any remaining incoming fire
      this.runDownFootPolice();
      this.police = this.police.flatMap((cop) => {
        const next = this.returnPoliceToStation(cop, dt);
        return next ? [next] : [];
      });
      return;
    }

    const desired = this.wantedStars;
    while (this.police.length < desired && this.policeSpawns.length > 0) {
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

    this.runDownFootPolice();

    // Police pursue the player. Patrol cars follow the road grid (when a city is
    // present); officers on foot follow a flow field through the streets so they
    // route around buildings instead of grinding straight into them. A patrol car
    // pulls up at arrest range and stops (rather than ramming the player) while an
    // officer it dropped closes in to make the arrest.
    const arrestable = this.arrestable;
    // One BFS toward the player, shared by every officer on foot this tick.
    this.copFlow =
      this.navGrid && this.police.some((c) => c.kind === 'foot')
        ? computeFlowField(this.navGrid, this.focus)
        : undefined;
    this.police = this.police.map((cop) => {
      if (cop.kind === 'car' && this.city) {
        if (arrestable && this.patrolAtDeployRange(cop)) return { ...cop, speed: 0 }; // pull up, don't ram
        const speed = policeSpeedFor('car', this.wantedStars);
        return { ...stepPoliceCar(cop, this.focus, this.city, dt, speed), speed };
      }
      // An officer on foot charges straight at the player whenever no building
      // blocks the line of sight; the flow field is only needed to route around
      // buildings. Homing directly closes the final step onto a player loitering
      // on the pavement, whose tile sits off the walkable nav-grid (so a flow-
      // field-only officer is steered to a road tile and never quite reaches).
      const sightBlocked = this.walls.some((wll) => segmentIntersectsRect(cop.pos, this.focus, wll));
      const waypoint =
        sightBlocked && this.navGrid && this.copFlow
          ? (flowWaypoint(this.navGrid, this.copFlow, cop.pos) ?? this.focus)
          : this.focus;
      const stepped = stepPolice(cop, waypoint, dt, policeSpeedFor(cop.kind, this.wantedStars));
      return { ...stepped, pos: resolveCircleRects(stepped.pos, stepped.radius, this.walls), speed: 0 };
    });

    this.updatePoliceShooting(dt);
  }

  /** Whether the player can currently be arrested: on foot, or in a car too slow
   * to escape. (A fast car outruns the law.) */
  private get arrestable(): boolean {
    return !this.isDriving || Math.abs(this.drivingCar!.speed) < BUST_SPEED;
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
      if (cop.kind !== 'foot') return cop;
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
    for (const current of this.policeBullets) {
      const stepped = stepBullet(current, dt);
      if (!stepped) continue; // expired
      if (this.walls.some((w) => circleIntersectsRect(stepped.pos, BULLET_RADIUS, w))) {
        continue; // stopped by a building
      }
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
    if (!this.arrestable) return; // a fast car outruns the law
    if (this.police.some((cop) => cop.kind === 'foot' && hasCaught(cop, this.focus))) {
      this.status = 'busted';
      this.bustedTimer = RESPAWN_DELAY;
      this.endChase(); // the arrest ends the chase: clear the wanted level now
    }
  }

  /** Count down the busted/wasted screen; respawn on confirm or when time runs out. */
  private updateDown(c: Controls, dt: number): void {
    this.bustedTimer -= dt;
    const confirmPressed = c.confirm && !this.prevConfirm; // rising edge
    if (confirmPressed || this.bustedTimer <= 0) this.respawn();
  }

  /** Reset the player to the start, clear the heat, and resume play. */
  private respawn(): void {
    this.player = { ...this.player, pos: this.spawn, angle: 0 };
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
    this.bustedTimer = 0;
    this.status = 'playing';
  }

  private nearestCarIndex(p: Vec2, within: number): number | null {
    let best: number | null = null;
    let bestDist = within;
    this.cars.forEach((car, i) => {
      if (this.wreckedCars[i]) return; // can't get into a wreck
      const d = distance(p, car.pos);
      if (d <= bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }
}
