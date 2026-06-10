import { type Vec2, vec2, add, distance, fromAngle } from './vector';
import { type Rect, resolveCircleRects, circleIntersectsRect } from './collision';
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
import { type Pedestrian, stepPedestrian } from './pedestrianAI';
import { type Police, policeSpeedFor, stepPolice, stepPoliceCar, hasCaught } from './policeAI';
import { type TrafficAI, stepTraffic, TRAFFIC_SPEED, obstacleAhead } from './trafficAI';
import type { City } from './city';
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
  currentObjective,
  updateMission,
  isComplete,
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
  private readonly rng: () => number;
  private readonly city?: City;
  private readonly spawn: Vec2;
  private carDrivers: (TrafficAI | null)[];
  private bustedTimer = 0;
  private prevAction = false;
  private prevConfirm = false;
  /** The campaign of missions being tracked, or null when there are none. */
  private campaign: Campaign | null;
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
    this.enterRadius = opts.enterRadius ?? 28;
    this.tuning = opts.carTuning ?? DEFAULT_CAR_TUNING;
    this.rng = opts.rng ?? Math.random;
    this.city = opts.city;
    this.spawn = opts.spawn ?? opts.player.pos;
    this.carDrivers = this.cars.map((_, i) => opts.carDrivers?.[i] ?? null);
    this.health = createHealth(opts.maxHealth ?? PLAYER_MAX_HEALTH);
    this.weapon = opts.weapon ?? createPistol();
    this.score = createScore(opts.bestScore ?? 0);
    const missions = opts.missions ?? (opts.mission ? [opts.mission] : []);
    this.campaign = missions.length > 0 ? createCampaign(missions) : null;
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

  /** Whether the whole campaign of missions has been completed. */
  get missionComplete(): boolean {
    return this.campaign ? isCampaignComplete(this.campaign) : false;
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
    this.updateTraffic(dt);
    this.resolveCarCollisions();
    this.updatePedestrians(dt);
    this.checkRoadKill();
    this.collectAmmo();
    this.updateWeapon(c, dt);
    this.updateBullets(dt);
    this.updateWantedAndPolice(dt);
    this.resolvePoliceVehicleCollisions();
    this.updateMissionProgress();
    this.checkBusted();
    this.prevAction = c.action;
    this.prevConfirm = c.confirm;
  }

  private updateOnFoot(c: Controls, dt: number, actionPressed: boolean): void {
    const moved = walk(this.player, c, dt);
    this.player = {
      ...moved,
      pos: this.wrapPos(resolveCircleRects(moved.pos, moved.radius, this.walls)),
    };

    if (actionPressed) {
      const idx = this.nearestCarIndex(this.player.pos, this.enterRadius);
      if (idx !== null) {
        this.drivingCarIndex = idx;
        this.cars[idx] = { ...this.cars[idx], speed: 0 };
        this.carDrivers[idx] = null; // any NPC driver bails out
      }
    }
  }

  private updateTraffic(dt: number): void {
    if (!this.city) return;
    const obstacles = this.yieldObstacles();
    for (let i = 0; i < this.cars.length; i++) {
      const ai = this.carDrivers[i];
      if (!ai || i === this.drivingCarIndex) continue;
      // Brake for anyone in the lane ahead rather than driving through them.
      const speed = obstacleAhead(this.cars[i].pos, ai.dir, obstacles) ? 0 : TRAFFIC_SPEED;
      const out = stepTraffic(this.cars[i], ai, this.city, dt, speed, this.rng);
      this.cars[i] = out.car;
      this.carDrivers[i] = out.ai;
    }
  }

  /** Positions NPC traffic brakes for: pedestrians and the player when on foot. */
  private yieldObstacles(): Vec2[] {
    const obstacles = this.pedestrians.map((p) => p.pos);
    if (!this.isDriving) obstacles.push(this.player.pos);
    return obstacles;
  }

  /** Push any overlapping cars apart so they collide instead of passing through. */
  private resolveCarCollisions(): void {
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const [a, b] = collideCars(this.cars[i], this.cars[j]);
        this.cars[i] = a;
        this.cars[j] = b;
      }
    }
  }

  /** Make patrol cars physically collide with the player's car (no driving through). */
  private resolvePoliceVehicleCollisions(): void {
    const idx = this.drivingCarIndex;
    if (idx === null) return;
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
      // Any car moving fast enough runs the pedestrian over; only the player's
      // own car earns them heat for it.
      const hitter = this.cars.findIndex(
        (car) =>
          Math.abs(car.speed) >= RUN_OVER_SPEED &&
          distance(car.pos, ped.pos) <= car.radius + ped.radius,
      );
      if (hitter !== -1) {
        if (hitter === this.drivingCarIndex) {
          this.registerKill('pedestrian'); // the player ran them down
        }
        continue; // pedestrian is run over and removed
      }
      const stepped = stepPedestrian(ped, { threats, bounds: this.bounds }, dt, this.rng);
      const pos = resolveCircleRects(stepped.pos, stepped.radius, this.walls);
      const blocked = pos.x !== stepped.pos.x || pos.y !== stepped.pos.y;
      // A wandering pedestrian that walks into a building turns around (picks a
      // new target) rather than grinding against the wall.
      const target =
        blocked && stepped.state === 'wander'
          ? vec2(this.rng() * this.bounds.width, this.rng() * this.bounds.height)
          : stepped.target;
      survivors.push({ ...stepped, pos, target });
    }
    this.pedestrians = survivors;
  }

  /** Kill the player if a fast car strikes them while on foot. */
  private checkRoadKill(): void {
    if (this.status !== 'playing' || this.isDriving) return; // safe inside a car
    const striker = this.cars.find(
      (car) =>
        Math.abs(car.speed) >= RUN_OVER_SPEED &&
        distance(car.pos, this.player.pos) <= car.radius + this.player.radius,
    );
    if (!striker) return;
    this.health = damage(this.health, Math.abs(striker.speed));
    if (isDead(this.health)) {
      this.status = 'wasted';
      this.bustedTimer = RESPAWN_DELAY;
    }
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
      surviving.push(stepped);
    }
    this.bullets = surviving;
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
    const advanced = updateMission(
      mission,
      {
        playerPos: this.focus,
        kills: this.kills,
        collected: this.collected,
        elapsed: this.elapsed,
        wantedStars: this.wantedStars,
      },
      this.objectiveBaseline,
    );
    if (advanced.currentIndex !== mission.currentIndex) {
      this.objectiveBaseline = this.baselineNow(); // the next objective counts from here
    }
    if (isComplete(advanced) && !isComplete(mission)) {
      this.score = award(this.score, advanced.reward);
      this.objectiveBaseline = this.baselineNow(); // the next mission counts from here
    }
    this.campaign = updateCampaign(this.campaign, advanced);
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
    // present); officers on foot home in directly but cannot cross buildings.
    this.police = this.police.map((cop) => {
      if (cop.kind === 'car' && this.city) {
        return stepPoliceCar(cop, this.focus, this.city, dt, policeSpeedFor('car', this.wantedStars));
      }
      const stepped = stepPolice(cop, this.focus, dt, policeSpeedFor(cop.kind, this.wantedStars));
      return { ...stepped, pos: resolveCircleRects(stepped.pos, stepped.radius, this.walls) };
    });
  }

  /** Bust the player if a pursuing officer reaches them while they cannot escape. */
  private checkBusted(): void {
    if (this.status !== 'playing') return; // already busted or wasted this tick
    if (!isWanted(this.wanted) || this.police.length === 0) return;
    const escaping = this.isDriving && Math.abs(this.drivingCar!.speed) >= BUST_SPEED;
    if (escaping) return; // a fast car outruns the law
    if (this.police.some((cop) => hasCaught(cop, this.focus))) {
      this.status = 'busted';
      this.bustedTimer = RESPAWN_DELAY;
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
    this.health = createHealth(this.health.max);
    this.drivingCarIndex = null;
    this.bustedTimer = 0;
    this.status = 'playing';
  }

  private nearestCarIndex(p: Vec2, within: number): number | null {
    let best: number | null = null;
    let bestDist = within;
    this.cars.forEach((car, i) => {
      const d = distance(p, car.pos);
      if (d <= bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }
}
