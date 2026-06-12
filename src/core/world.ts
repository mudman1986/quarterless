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
  tileCoord,
  isIntersection,
  openDirections,
} from './trafficAI';
import { type RoadVehicle, stepRoadVehicle, seekChooser, nearestCardinal } from './roadVehicle';
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

/** A dead pedestrian left on the ground (with a blood puddle, rendered later). */
export interface Corpse {
  pos: Vec2;
  /** Seconds the corpse has been continuously out of frame. */
  offscreenFor: number;
  /** Seconds the corpse has been continuously in frame. */
  inFrameFor: number;
}

/** Common state for a dispatched service vehicle that follows the roads. */
export interface ServiceVehicle {
  pos: Vec2;
  heading: number;
  radius: number;
  /** Current cardinal travel direction (for the shared road-following model). */
  dir: Vec2;
  /** Where it is currently headed (its job, then the map edge to leave by). */
  target: Vec2;
  /** Whether it has loaded its cargo and is driving away. */
  carrying: boolean;
  /** Seconds since it was dispatched (it gives up after SERVICE_TIMEOUT). */
  age: number;
  /** Speed it is actually travelling this step (0 while yielding to someone in
   * its path); read by the road-kill check so a halted vehicle is harmless. */
  speed: number;
  /** Seconds it has been held up by an obstacle ahead (drives the reroute). */
  blocked: number;
}

/** An ambulance that drives the roads to an on-screen corpse, loads it, leaves. */
export type Ambulance = ServiceVehicle;

/** A tow truck that drives the roads to a wreck, hauls it off, and leaves. */
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
  /** The counters captured when the current mission objective began. */
  private objectiveBaseline: MissionBaseline = { kills: 0, collected: 0, elapsed: 0 };
  /** Seconds elapsed in the current run (drives survive objectives). */
  private elapsed = 0;

  constructor(opts: WorldOptions) {
    this.player = opts.player;
    this.cars = opts.cars ?? [];
    this.walls = opts.walls ?? [];
    this.pedestrians = opts.pedestrians ?? [];
    this.police = opts.police ?? [];
    this.policeSpawns = opts.policeSpawns ?? [];
    this.bounds = opts.bounds ?? { width: 1600, height: 1600 };
    this.water = opts.water ?? [];
    this.sidewalks = opts.sidewalks ?? [];
    this.viewRadius = opts.viewRadius ?? DEFAULT_VIEW_RADIUS;
    this.enterRadius = opts.enterRadius ?? 28;
    this.tuning = opts.carTuning ?? DEFAULT_CAR_TUNING;
    this.rng = opts.rng ?? Math.random;
    this.city = opts.city;
    this.navGrid = opts.city ? buildNavGrid(opts.city) : undefined;
    this.spawn = opts.spawn ?? opts.player.pos;
    this.carDrivers = this.cars.map((_, i) => opts.carDrivers?.[i] ?? null);
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
    this.resolveCarCollisions();
    this.updatePedestrians(dt);
    this.updateNpcDriving(dt);
    this.checkRoadKill();
    this.checkDrowning();
    this.collectAmmo();
    this.updateWeapon(c, dt);
    this.updateBullets(dt);
    this.updateWantedAndPolice(dt);
    this.resolvePoliceVehicleCollisions();
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
    return this.cars.filter((car) => Math.abs(car.speed) < RUN_OVER_SPEED);
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

      let driver = ai;
      let speed = TRAFFIC_SPEED;
      if (obstacleAhead(car.pos, ai.dir, obstacles)) {
        // Wait behind a pedestrian/player in the lane; after a few seconds give
        // up and reroute (turn around) to find another way around them.
        const waited = (ai.blocked ?? 0) + dt;
        if (waited >= TRAFFIC_REROUTE_WAIT) {
          driver = { dir: vec2(-ai.dir.x, -ai.dir.y), blocked: 0 }; // U-turn and go
        } else {
          driver = { ...ai, blocked: waited };
          speed = 0;
        }
      } else if (this.redLightAhead(car, ai.dir)) {
        speed = 0; // hold at the red light (not counted as being stuck)
        driver = ai.blocked ? { ...ai, blocked: 0 } : ai;
      } else if (ai.blocked) {
        driver = { ...ai, blocked: 0 }; // path cleared
      }

      const out = stepTraffic(car, driver, this.city, dt, speed, this.rng);
      this.cars[i] = out.car;
      this.carDrivers[i] = out.ai;
    }
  }

  /** Whether an NPC car is approaching an intersection it must stop at for a red
   * light. Looks a tile or two ahead along the car's direction. */
  private redLightAhead(car: Car, dir: Vec2): boolean {
    if (!this.city || hasGreen(this.lights, dir)) return false; // our axis is green
    const { tx, ty } = tileCoord(this.city.spec, car.pos);
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

  /** Age corpses; one left out of frame long enough is cleared and a fresh
   * pedestrian respawns elsewhere so the streets stay populated. */
  private updateCorpses(dt: number): void {
    if (this.corpses.length === 0) return;
    const survivors: Corpse[] = [];
    for (const corpse of this.corpses) {
      const inFrame = distance(this.focus, corpse.pos) <= this.viewRadius;
      const next: Corpse = {
        pos: corpse.pos,
        inFrameFor: inFrame ? corpse.inFrameFor + dt : 0,
        offscreenFor: inFrame ? 0 : corpse.offscreenFor + dt,
      };
      if (next.offscreenFor >= CORPSE_RESPAWN_DELAY) {
        this.respawnPedestrian(); // out of sight: the body is gone, life goes on
        continue;
      }
      survivors.push(next);
    }
    this.corpses = survivors;
  }

  /** Spawn a fresh wandering pedestrian on a sidewalk to keep the population up. */
  private respawnPedestrian(): void {
    const ctx = { threats: [], bounds: this.bounds, sidewalks: this.sidewalks };
    const pos = wanderTarget(ctx, this.spawn, this.rng);
    this.pedestrians.push({ pos, heading: 0, radius: 7, state: 'wander', target: pos });
  }

  /** Dispatch and drive an ambulance to collect a body that lingers on screen.
   * It follows the road grid (no driving through buildings). */
  private updateAmbulance(dt: number): void {
    if (!this.city) return; // service vehicles need roads to drive
    if (!this.ambulance) {
      const corpse = this.corpses.find((c) => c.inFrameFor >= AMBULANCE_DISPATCH_DELAY);
      if (!corpse) return;
      this.ambulance = this.dispatchService(corpse.pos);
    }

    const amb = this.driveService(this.ambulance, dt, AMBULANCE_SPEED);
    this.ambulance = amb;

    if (amb.carrying) {
      if (this.serviceArrived(amb)) this.ambulance = null; // delivered and gone
      return;
    }
    if (amb.age >= SERVICE_TIMEOUT) {
      this.ambulance = null; // gave up
      return;
    }
    const idx = this.corpses.findIndex(
      (c) => distance(amb.pos, c.pos) <= amb.radius + AMBULANCE_PICKUP_RADIUS,
    );
    if (idx !== -1) {
      this.corpses.splice(idx, 1); // body loaded aboard
      this.ambulance = { ...amb, carrying: true, target: this.farthestCornerTile(amb.pos) };
    } else if (!this.corpses.some((c) => distance(c.pos, amb.target) <= AMBULANCE_PICKUP_RADIUS)) {
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
      const tow = this.driveService(prev, dt, TOW_SPEED);
      if (tow.carrying) {
        if (!this.serviceArrived(tow)) alive.push(tow); // still hauling it off-map
        continue;
      }
      if (tow.age >= SERVICE_TIMEOUT || this.towedCars[tow.targetCar]) continue; // gave up / gone
      if (distance(tow.pos, this.cars[tow.targetCar].pos) <= tow.radius + AMBULANCE_PICKUP_RADIUS) {
        this.towedCars[tow.targetCar] = true; // hooked up; removed from play
        alive.push({ ...tow, carrying: true, target: this.farthestCornerTile(tow.pos) });
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
      this.tows.push({ ...this.dispatchService(this.cars[idx].pos), targetCar: idx });
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

  /** A fresh service vehicle, spawned on the nearest corner road tile and aimed
   * (via the road grid) at `target`. */
  private dispatchService(target: Vec2): ServiceVehicle {
    const pos = this.nearestCornerTile(target);
    return {
      pos,
      heading: 0,
      radius: 14,
      dir: nearestCardinal(angle(sub(target, pos))),
      target,
      carrying: false,
      age: 0,
      speed: 0,
      blocked: 0,
    };
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
    if (obstacleAhead(v.pos, v.dir, this.yieldObstacles())) {
      blocked += dt;
      if (blocked >= TRAFFIC_REROUTE_WAIT) {
        dir = vec2(-v.dir.x, -v.dir.y); // give up waiting: turn back and divert
        blocked = 0;
      } else {
        speed = 0; // hold short of them
      }
    } else {
      blocked = 0;
    }
    const rv: RoadVehicle = { pos: v.pos, heading: v.heading, dir };
    const next = stepRoadVehicle(rv, this.city!, dt, speed, seekChooser(v.target));
    return {
      ...v,
      pos: next.pos,
      heading: next.heading,
      dir: next.dir,
      age: v.age + dt,
      speed,
      blocked,
    };
  }

  /** Whether a (carrying) service vehicle has reached the map edge it leaves by. */
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

  /** Push any overlapping cars apart so they collide instead of passing through,
   * and damage both from the impact so repeated ramming eventually destroys a car. */
  private resolveCarCollisions(): void {
    for (let i = 0; i < this.cars.length; i++) {
      if (this.towedCars[i]) continue;
      for (let j = i + 1; j < this.cars.length; j++) {
        if (this.towedCars[j]) continue;
        const a = this.cars[i];
        const b = this.cars[j];
        const delta = sub(a.pos, b.pos);
        const dist = length(delta);
        if (dist >= a.radius + b.radius) continue; // not touching
        const [na, nb] = collideCars(a, b);
        this.cars[i] = na;
        this.cars[j] = nb;
        // Impact = closing speed along the contact normal; a hard enough knock
        // damages both cars (so being rammed repeatedly blows a car up too).
        const normal = dist === 0 ? vec2(1, 0) : normalize(delta);
        const velA = scale(fromAngle(a.heading), a.speed);
        const velB = scale(fromAngle(b.heading), b.speed);
        const closing = Math.abs(dot(sub(velA, velB), normal));
        if (closing > CAR_RAM_THRESHOLD) {
          const dmg = (closing - CAR_RAM_THRESHOLD) * CAR_RAM_DAMAGE_SCALE;
          // A ram is the player's doing only when their own car is the rammer:
          // each car's damage is "by player" when the OTHER car is the player's.
          this.damageCar(i, dmg, j === this.drivingCarIndex);
          this.damageCar(j, dmg, i === this.drivingCarIndex);
        }
      }
    }
  }

  /** Make patrol cars physically collide with the player's car (no driving through). */
  private resolvePoliceVehicleCollisions(): void {
    const idx = this.drivingCarIndex;
    if (idx === null || this.towedCars[idx]) return;
    let car = this.cars[idx];
    this.police = this.police.map((cop) => {
      if (cop.kind !== 'car') return cop;
      const [movedCar, movedCop] = collideCars(car, {
        pos: cop.pos,
        heading: cop.heading,
        speed: 0,
        radius: cop.radius,
      });
      car = movedCar;
      return { ...cop, pos: movedCop.pos };
    });
    this.cars[idx] = car;
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
        this.addCorpse(this.pedestrians[pedIdx].pos);
        this.pedestrians.splice(pedIdx, 1);
        this.registerKill('pedestrian');
        continue;
      }
      const copIdx = this.police.findIndex((cop) => bulletHits(stepped, cop.pos, cop.radius));
      if (copIdx !== -1) {
        this.police.splice(copIdx, 1);
        this.registerKill('police');
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
    this.wreckedCars[idx] = true;
    this.carHealth[idx] = 0;
    this.carDrivers[idx] = null;
    const center = this.cars[idx].pos;
    this.cars[idx] = { ...this.cars[idx], speed: 0 };

    this.explosions.push({ pos: center, radius: EXPLOSION_RADIUS, age: 0, life: EXPLOSION_LIFE });
    this.explosionsTriggered += 1;
    if (byPlayer) {
      this.kills += 1;
      this.score = award(this.score, SCORE_PER_CAR);
      this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPedestrian);
    }

    // The blast catches pedestrians, police, the player, and other cars.
    this.pedestrians = this.pedestrians.filter((p) => {
      if (distance(center, p.pos) > EXPLOSION_RADIUS + p.radius) return true;
      this.addCorpse(p.pos);
      if (byPlayer) this.registerKill('pedestrian');
      return false;
    });
    this.police = this.police.filter((cop) => {
      if (distance(center, cop.pos) > EXPLOSION_RADIUS + cop.radius) return true;
      if (byPlayer) this.registerKill('police');
      return false;
    });
    if (distance(center, this.focus) <= EXPLOSION_RADIUS + this.player.radius) {
      if (this.isDriving && this.drivingCarIndex === idx) {
        this.drivingCarIndex = null; // thrown clear of the wreck they were driving
        this.player = { ...this.player, pos: center };
      }
      this.applyPlayerDamage(EXPLOSION_DAMAGE);
    }
    // Chain reaction: other cars in range detonate too, inheriting the cause so
    // a blast the player set off keeps crediting them (and an NPC one never does).
    this.cars.forEach((car, i) => {
      if (i === idx || this.wreckedCars[i]) return;
      if (distance(center, car.pos) <= EXPLOSION_RADIUS + car.radius) {
        this.damageCar(i, EXPLOSION_CAR_DAMAGE, byPlayer);
      }
    });
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

  private updateWantedAndPolice(dt: number): void {
    this.wanted = decay(this.wanted, dt);

    if (!isWanted(this.wanted)) {
      this.police = []; // crime cleared: police disperse
      return;
    }

    const desired = this.wantedStars;
    while (this.police.length < desired && this.policeSpawns.length > 0) {
      const spawn = this.policeSpawns[this.police.length % this.policeSpawns.length];
      // Alternate between officers on foot and patrol cars.
      const kind: 'foot' | 'car' = this.police.length % 2 === 0 ? 'foot' : 'car';
      this.police.push({ pos: spawn, heading: 0, radius: kind === 'car' ? 14 : 12, kind });
    }

    // A speeding car mows down officers on foot (patrol cars are immune).
    const car = this.drivingCar;
    if (car && Math.abs(car.speed) >= RUN_OVER_SPEED) {
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
        if (arrestable && this.patrolAtDeployRange(cop)) return cop; // pull up, don't ram
        return stepPoliceCar(cop, this.focus, this.city, dt, policeSpeedFor('car', this.wantedStars));
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
      return { ...stepped, pos: resolveCircleRects(stepped.pos, stepped.radius, this.walls) };
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
    if (this.status !== 'playing' || !this.arrestable) return;
    const deployed: Police[] = [];
    this.police = this.police.map((cop) => {
      if (cop.kind !== 'car' || cop.deployed) return cop;
      if (this.patrolAtDeployRange(cop)) {
        const side = fromAngle(cop.heading + Math.PI / 2, cop.radius + 12);
        deployed.push({ pos: add(cop.pos, side), heading: cop.heading, radius: 12, kind: 'foot' });
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
