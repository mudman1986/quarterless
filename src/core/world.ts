import { type Vec2, vec2, add, distance, fromAngle, sub, scale } from './vector';
import { type Rect, resolveCircleRects, resolveCircleCircles, circleIntersectsRect } from './collision';
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
import {
  type TrafficAI,
  stepTraffic,
  TRAFFIC_SPEED,
  obstacleAhead,
  chooseDetour,
  tileCoord,
} from './trafficAI';
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
  createMission,
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

export interface Corpse {
  id: number;
  pos: Vec2;
  kind: 'pedestrian' | 'police';
  age: number;
  offscreen: number;
}

export interface Ambulance {
  id: number;
  car: Car;
  targetCorpseId: number | null;
}

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
  /** Whether the mission list should reshuffle and restart forever. */
  loopMissions?: boolean;
  /** RNG injected for deterministic pedestrian wandering in tests. */
  rng?: () => number;
}

const EXIT_GAP = 4;
const RUN_OVER_SPEED = 45;
const RESPAWN_DELAY = 10;
const BUST_SPEED = 40;
export const PLAYER_MAX_HEALTH = 100;
export const BULLET_RADIUS = 2;
export const SCORE_PER_PEDESTRIAN = 50;
export const SCORE_PER_POLICE = 150;
export const AMMO_PICKUP_RADIUS = 22;
const CAR_MAX_HP = 75;
const CAR_WRECK_TIME = 8;
const CIVILIAN_CAR_INTERVAL = 4;
const TRAFFIC_MANEUVER_WAIT = 2.4;
const POLICE_FIRE_STARS = 3;
const POLICE_PIN_MIN_STARS = 3;
const POLICE_FIRE_RANGE = 340;
const POLICE_FIRE_COOLDOWN = 1.1;
const POLICE_BULLET_DAMAGE = 18;
const CORPSE_DESPAWN_TIME = 10;
const CORPSE_VIEW_DISTANCE = 420;
const AMBULANCE_DISPATCH_DELAY = 3;
const AMBULANCE_SPEED = 190;
const DAY_LENGTH = 120;

function resetMission(mission: Mission): Mission {
  return createMission({
    id: mission.id,
    title: mission.title,
    objectives: mission.objectives,
    reward: mission.reward,
  });
}

function withCarDefaults(car: Car): Car {
  return { kind: 'civilian', hp: CAR_MAX_HP, wreckTimer: 0, parked: false, ...car };
}

function isWrecked(car: Car): boolean {
  return (car.wreckTimer ?? 0) > 0 || (car.hp ?? CAR_MAX_HP) <= 0;
}

function targetAngle(from: Vec2, to: Vec2): number {
  const d = sub(to, from);
  return Math.atan2(d.y, d.x);
}

export class World {
  player: OnFootActor;
  readonly cars: Car[];
  readonly walls: Rect[];
  pedestrians: Pedestrian[];
  police: Police[];
  wanted: WantedState = createWanted();
  health: Health;
  weapon: Weapon;
  bullets: Bullet[] = [];
  score: Score;
  kills = 0;
  collected = 0;
  ammoPickups: AmmoPickup[];
  corpses: Corpse[] = [];
  ambulances: Ambulance[] = [];
  readonly enterRadius: number;
  drivingCarIndex: number | null = null;
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
  private campaign: Campaign | null;
  private objectiveBaseline: MissionBaseline = { kills: 0, collected: 0, elapsed: 0 };
  private elapsed = 0;
  private readonly loopMissions: boolean;
  private readonly missionPool: readonly Mission[];
  private civilianTimer = 0;
  private nextCorpseId = 1;
  private nextAmbulanceId = 1;

  constructor(opts: WorldOptions) {
    this.player = opts.player;
    this.cars = (opts.cars ?? []).map(withCarDefaults);
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
    this.loopMissions = opts.loopMissions ?? false;
    this.missionPool = missions.map(resetMission);
    this.campaign =
      missions.length > 0
        ? createCampaign(this.loopMissions ? this.shuffleMissions(this.missionPool) : this.missionPool.slice())
        : null;
    this.ammoPickups = opts.ammoPickups ?? [];
  }

  get isDriving(): boolean {
    return this.drivingCarIndex !== null;
  }

  get drivingCar(): Car | null {
    return this.drivingCarIndex === null ? null : this.cars[this.drivingCarIndex];
  }

  get wantedStars(): number {
    return stars(this.wanted);
  }

  get focus(): Vec2 {
    return this.drivingCar?.pos ?? this.player.pos;
  }

  get isBusted(): boolean {
    return this.status === 'busted';
  }

  get isWasted(): boolean {
    return this.status === 'wasted';
  }

  get respawnIn(): number {
    return Math.max(0, Math.ceil(this.bustedTimer));
  }

  get mission(): Mission | null {
    return this.campaign ? currentMission(this.campaign) : null;
  }

  get missionObjective(): Objective | null {
    const m = this.mission;
    return m ? currentObjective(m) : null;
  }

  get missionComplete(): boolean {
    return this.campaign ? isCampaignComplete(this.campaign) : false;
  }

  get missionProgress(): string {
    const obj = this.missionObjective;
    if (!obj) return '';
    switch (obj.kind) {
      case 'reach':
        return '';
      case 'eliminate':
        return `${Math.min(obj.count, this.kills - this.objectiveBaseline.kills)}/${obj.count}`;
      case 'collect':
        return `${Math.min(obj.count, this.collected - this.objectiveBaseline.collected)}/${obj.count}`;
      case 'survive': {
        const elapsed = Math.max(0, this.elapsed - this.objectiveBaseline.elapsed);
        return `${Math.min(obj.seconds, Math.floor(elapsed))}/${obj.seconds}s`;
      }
      case 'wanted':
        return `${Math.min(obj.stars, this.wantedStars)}/${obj.stars}★`;
    }
  }

  get timeOfDay(): number {
    return ((this.elapsed % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH / DAY_LENGTH;
  }

  get elapsedSeconds(): number {
    return this.elapsed;
  }

  tick(c: Controls, dt: number): void {
    if (this.status !== 'playing') {
      this.updateDown(c, dt);
      this.prevAction = c.action;
      this.prevConfirm = c.confirm;
      return;
    }

    const actionPressed = c.action && !this.prevAction;
    this.elapsed += dt;
    this.updateWrecks(dt);
    if (this.isDriving) this.updateDriving(c, dt, actionPressed);
    else this.updateOnFoot(c, dt, actionPressed);
    this.updateTraffic(dt);
    this.resolveCarCollisions();
    this.updatePedestrians(dt);
    this.spawnCivilianDrivers(dt);
    this.checkRoadKill();
    this.collectAmmo();
    this.updateWeapon(c, dt);
    this.updatePoliceFire(dt);
    this.updateBullets(dt);
    this.updateWantedAndPolice(dt);
    this.updateCorpsesAndAmbulances(dt);
    this.resolvePoliceVehicleCollisions();
    this.updateMissionProgress();
    this.checkBusted();
    this.prevAction = c.action;
    this.prevConfirm = c.confirm;
  }

  private updateWrecks(dt: number): void {
    for (let i = 0; i < this.cars.length; i++) {
      if ((this.cars[i].wreckTimer ?? 0) > 0) {
        this.cars[i] = { ...this.cars[i], wreckTimer: Math.max(0, (this.cars[i].wreckTimer ?? 0) - dt), speed: 0 };
      }
    }
  }

  private updateOnFoot(c: Controls, dt: number, actionPressed: boolean): void {
    const moved = walk(this.player, c, dt);
    const wrapped = this.wrapPos(moved.pos);
    const walls = resolveCircleRects(wrapped, moved.radius, this.walls);
    this.player = {
      ...moved,
      pos: resolveCircleCircles(walls, moved.radius, this.blockingCars()),
    };

    if (actionPressed) {
      const idx = this.nearestCarIndex(this.player.pos, this.enterRadius);
      if (idx !== null && !isWrecked(this.cars[idx])) {
        this.drivingCarIndex = idx;
        this.cars[idx] = { ...this.cars[idx], speed: 0, parked: false };
        this.carDrivers[idx] = null;
      }
    }
  }

  private updateTraffic(dt: number): void {
    if (!this.city) return;
    const obstacles = this.yieldObstacles();
    for (let i = 0; i < this.cars.length; i++) {
      const ai = this.carDrivers[i];
      if (!ai || i === this.drivingCarIndex || isWrecked(this.cars[i])) continue;
      const car = this.cars[i];
      const stoppedForObstacle = obstacleAhead(car.pos, ai.dir, obstacles);
      const stoppedForLight = this.redLightAhead(car.pos, ai.dir);
      let nextAi: TrafficAI = { ...ai, wait: stoppedForObstacle ? (ai.wait ?? 0) + dt : 0 };
      let speed = ai.style === 'ambulance' ? AMBULANCE_SPEED : TRAFFIC_SPEED;
      if (stoppedForLight || (stoppedForObstacle && (nextAi.wait ?? 0) < TRAFFIC_MANEUVER_WAIT)) {
        speed = 0;
      } else if (stoppedForObstacle) {
        const tile = tileCoord(this.city.spec, car.pos);
        nextAi = {
          ...nextAi,
          dir: chooseDetour(this.city, tile.tx, tile.ty, ai.dir, this.rng),
          wait: 0,
        };
      }
      const out = stepTraffic(car, nextAi, this.city, dt, speed, this.rng);
      this.cars[i] = out.car;
      this.carDrivers[i] = out.ai;
    }
  }

  private redLightAhead(pos: Vec2, dir: Vec2): boolean {
    if (!this.city) return false;
    const ahead = add(pos, scale(dir, this.city.spec.tile * 0.65));
    const tile = tileCoord(this.city.spec, ahead);
    if (tile.tx % this.city.spec.block !== 0 || tile.ty % this.city.spec.block !== 0) return false;
    const state = this.city.lightState(tile.tx, tile.ty, this.elapsed);
    const wantsNS = Math.abs(dir.y) > Math.abs(dir.x);
    return wantsNS ? state !== 'ns' : state !== 'ew';
  }

  private yieldObstacles(): Vec2[] {
    const obstacles = this.pedestrians.map((p) => p.pos);
    this.corpses.forEach((c) => obstacles.push(c.pos));
    if (!this.isDriving) obstacles.push(this.player.pos);
    return obstacles;
  }

  private blockingCars() {
    return this.cars.filter((car) => !isWrecked(car));
  }

  private resolveCarCollisions(): void {
    for (let i = 0; i < this.cars.length; i++) {
      if (isWrecked(this.cars[i])) continue;
      for (let j = i + 1; j < this.cars.length; j++) {
        if (isWrecked(this.cars[j])) continue;
        const [a, b] = collideCars(this.cars[i], this.cars[j]);
        this.cars[i] = a;
        this.cars[j] = b;
      }
    }
  }

  private resolvePoliceVehicleCollisions(): void {
    const idx = this.drivingCarIndex;
    if (idx === null || this.wantedStars < POLICE_PIN_MIN_STARS) return;
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

  private wrapPos(p: Vec2): Vec2 {
    return vec2(wrap(p.x, this.bounds.width), wrap(p.y, this.bounds.height));
  }

  private updateDriving(c: Controls, dt: number, actionPressed: boolean): void {
    const idx = this.drivingCarIndex!;
    const car = this.cars[idx];
    if (isWrecked(car)) {
      this.player = { ...this.player, pos: add(car.pos, vec2(0, car.radius + this.player.radius + EXIT_GAP)) };
      this.drivingCarIndex = null;
      return;
    }

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
    const drivingCar = this.drivingCar;
    const threats: Vec2[] = [];
    if (drivingCar && Math.abs(drivingCar.speed) >= 20) threats.push(drivingCar.pos);
    const survivors: Pedestrian[] = [];

    for (const ped of this.pedestrians) {
      if (drivingCar && Math.abs(drivingCar.speed) >= 20) {
        const nearCar = distance(drivingCar.pos, ped.pos) <= drivingCar.radius + ped.radius + 12;
        if (nearCar) threats.length = 0;
        else threats.splice(0, threats.length, drivingCar.pos);
      }
      const hitter = this.cars.findIndex(
        (car) =>
          !isWrecked(car) && Math.abs(car.speed) >= RUN_OVER_SPEED && distance(car.pos, ped.pos) <= car.radius + ped.radius,
      );
      if (hitter !== -1) {
        const pos = ped.pos;
        if (hitter === this.drivingCarIndex) this.registerKill('pedestrian', pos);
        else this.spawnCorpse('pedestrian', pos);
        continue;
      }
      const stepped = stepPedestrian(
        ped,
        { threats, bounds: this.bounds, waypoints: this.city?.sidewalkNodes },
        dt,
        this.rng,
      );
      const walls = resolveCircleRects(stepped.pos, stepped.radius, this.walls);
      const pos = resolveCircleCircles(walls, stepped.radius, this.blockingCars());
      const blocked = pos.x !== stepped.pos.x || pos.y !== stepped.pos.y;
      const target = blocked
        ? this.city?.sidewalkNodes[Math.floor(this.rng() * this.city.sidewalkNodes.length)] ?? vec2(this.rng() * this.bounds.width, this.rng() * this.bounds.height)
        : stepped.target;
      survivors.push({ ...stepped, pos, target });
    }
    this.pedestrians = survivors;
  }

  private spawnCivilianDrivers(dt: number): void {
    this.civilianTimer += dt;
    if (this.civilianTimer < CIVILIAN_CAR_INTERVAL || !this.city || this.pedestrians.length === 0) return;
    this.civilianTimer = 0;
    for (let i = 0; i < this.cars.length; i++) {
      if (this.carDrivers[i] || !this.cars[i].parked || isWrecked(this.cars[i])) continue;
      const pedIdx = this.pedestrians.findIndex((ped) => distance(ped.pos, this.cars[i].pos) <= 26);
      if (pedIdx === -1) continue;
      const dir = Math.abs(Math.cos(this.cars[i].heading)) > 0.5 ? vec2(1, 0) : vec2(0, 1);
      this.carDrivers[i] = { dir, wait: 0, style: 'civilian' };
      this.cars[i] = { ...this.cars[i], parked: false };
      this.pedestrians.splice(pedIdx, 1);
      return;
    }
  }

  private checkRoadKill(): void {
    if (this.status !== 'playing' || this.isDriving) return;
    const striker = this.cars.find(
      (car) => !isWrecked(car) && Math.abs(car.speed) >= RUN_OVER_SPEED && distance(car.pos, this.player.pos) <= car.radius + this.player.radius,
    );
    if (!striker) return;
    this.health = damage(this.health, Math.abs(striker.speed));
    if (isDead(this.health)) {
      this.status = 'wasted';
      this.bustedTimer = RESPAWN_DELAY;
    }
  }

  private updateWeapon(c: Controls, dt: number): void {
    this.weapon = cool(this.weapon, dt);
    if (!c.fire) return;
    const heading = this.drivingCar?.heading ?? this.player.angle;
    const muzzle = (this.drivingCar?.radius ?? this.player.radius) + 6;
    const origin = add(this.focus, fromAngle(heading, muzzle));
    const result = fire(this.weapon, origin, heading, 'player');
    this.weapon = result.weapon;
    if (result.bullet) this.bullets.push(result.bullet);
  }

  private updatePoliceFire(dt: number): void {
    if (this.wantedStars < POLICE_FIRE_STARS || this.status !== 'playing') {
      this.police = this.police.map((cop) => ({ ...cop, cooldown: Math.max(0, (cop.cooldown ?? 0) - dt) }));
      return;
    }
    this.police = this.police.map((cop) => {
      const cooldown = Math.max(0, (cop.cooldown ?? 0) - dt);
      const heading = targetAngle(cop.pos, this.focus);
      if (cop.kind !== 'foot' || cooldown > 0 || distance(cop.pos, this.focus) > POLICE_FIRE_RANGE) {
        return { ...cop, cooldown, heading, alert: cop.kind === 'car' ? true : cop.alert };
      }
      const muzzle = cop.radius + 6;
      this.bullets.push({
        pos: add(cop.pos, fromAngle(heading, muzzle)),
        velocity: fromAngle(heading, 420),
        life: 0.9,
        damage: POLICE_BULLET_DAMAGE,
        owner: 'police',
      });
      return { ...cop, cooldown: POLICE_FIRE_COOLDOWN, heading, alert: cop.alert };
    });
  }

  private updateBullets(dt: number): void {
    const surviving: Bullet[] = [];
    for (const current of this.bullets) {
      const stepped = stepBullet(current, dt);
      if (!stepped) continue;
      if (this.walls.some((w) => circleIntersectsRect(stepped.pos, BULLET_RADIUS, w))) continue;

      if (stepped.owner === 'player') {
        const pedIdx = this.pedestrians.findIndex((p) => bulletHits(stepped, p.pos, p.radius));
        if (pedIdx !== -1) {
          const pos = this.pedestrians[pedIdx].pos;
          this.pedestrians.splice(pedIdx, 1);
          this.registerKill('pedestrian', pos);
          continue;
        }
        const copIdx = this.police.findIndex((cop) => bulletHits(stepped, cop.pos, cop.radius));
        if (copIdx !== -1) {
          const pos = this.police[copIdx].pos;
          this.police.splice(copIdx, 1);
          this.registerKill('police', pos);
          continue;
        }
        const carIdx = this.cars.findIndex(
          (car, idx) => idx !== this.drivingCarIndex && !isWrecked(car) && bulletHits(stepped, car.pos, car.radius),
        );
        if (carIdx !== -1) {
          const hp = (this.cars[carIdx].hp ?? CAR_MAX_HP) - stepped.damage;
          this.cars[carIdx] = { ...this.cars[carIdx], hp };
          if (hp <= 0) this.explodeCar(carIdx);
          continue;
        }
      } else if (!this.isDriving && bulletHits(stepped, this.player.pos, this.player.radius)) {
        this.health = damage(this.health, stepped.damage);
        if (isDead(this.health)) {
          this.status = 'wasted';
          this.bustedTimer = RESPAWN_DELAY;
        }
        continue;
      }

      surviving.push(stepped);
    }
    this.bullets = surviving;
  }

  private explodeCar(index: number): void {
    const car = this.cars[index];
    this.cars[index] = { ...car, hp: 0, wreckTimer: CAR_WRECK_TIME, speed: 0 };
    this.carDrivers[index] = null;
    if (index === this.drivingCarIndex) {
      this.player = { ...this.player, pos: add(car.pos, vec2(0, car.radius + this.player.radius + EXIT_GAP)) };
      this.drivingCarIndex = null;
    }
    this.pedestrians = this.pedestrians.filter((ped) => {
      if (distance(ped.pos, car.pos) <= car.radius + 24) {
        this.spawnCorpse('pedestrian', ped.pos);
        return false;
      }
      return true;
    });
  }

  private registerKill(kind: 'pedestrian' | 'police', pos: Vec2): void {
    this.kills += 1;
    this.spawnCorpse(kind, pos);
    if (kind === 'pedestrian') {
      this.score = award(this.score, SCORE_PER_PEDESTRIAN);
      this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPedestrian);
    } else {
      this.score = award(this.score, SCORE_PER_POLICE);
      this.wanted = addHeat(this.wanted, CRIME_HEAT.hitPolice);
    }
  }

  private spawnCorpse(kind: 'pedestrian' | 'police', pos: Vec2): void {
    this.corpses.push({ id: this.nextCorpseId++, pos, kind, age: 0, offscreen: 0 });
  }

  private updateCorpsesAndAmbulances(dt: number): void {
    const replacements: Vec2[] = [];
    const focus = this.focus;
    this.corpses = this.corpses.filter((corpse) => {
      const visible = distance(corpse.pos, focus) <= CORPSE_VIEW_DISTANCE;
      corpse.age += dt;
      corpse.offscreen = visible ? 0 : corpse.offscreen + dt;
      if (corpse.age >= AMBULANCE_DISPATCH_DELAY && visible) this.dispatchAmbulance(corpse.id, corpse.pos);
      if (corpse.offscreen >= CORPSE_DESPAWN_TIME) {
        if (corpse.kind === 'pedestrian') replacements.push(corpse.pos);
        return false;
      }
      return true;
    });

    replacements.forEach((pos) => {
      const nodes = this.city?.sidewalkNodes ?? [];
      const target = nodes.length > 0 ? (nodes[Math.floor(this.rng() * nodes.length)] ?? pos) : pos;
      this.pedestrians.push({ pos: target, heading: 0, radius: 7, state: 'wander', target });
    });

    this.ambulances = this.ambulances.filter((ambulance) => {
      if (ambulance.targetCorpseId === null) return false;
      const corpse = this.corpses.find((c) => c.id === ambulance.targetCorpseId);
      if (!corpse) return false;
      const heading = targetAngle(ambulance.car.pos, corpse.pos);
      const nextPos = add(ambulance.car.pos, fromAngle(heading, AMBULANCE_SPEED * dt));
      ambulance.car = { ...ambulance.car, pos: nextPos, heading, speed: AMBULANCE_SPEED, kind: 'ambulance', parked: false };
      if (distance(nextPos, corpse.pos) <= 26) {
        this.corpses = this.corpses.filter((c) => c.id !== corpse.id);
        return false;
      }
      return true;
    });
  }

  private dispatchAmbulance(targetCorpseId: number, pos: Vec2): void {
    if (this.ambulances.some((a) => a.targetCorpseId === targetCorpseId)) return;
    const spawn = vec2(Math.min(this.bounds.width - 32, pos.x + 180), Math.max(32, pos.y - 180));
    this.ambulances.push({
      id: this.nextAmbulanceId++,
      targetCorpseId,
      car: { pos: spawn, heading: targetAngle(spawn, pos), speed: AMBULANCE_SPEED, radius: 14, kind: 'ambulance', hp: CAR_MAX_HP },
    });
  }

  private updateMissionProgress(): void {
    if (this.status !== 'playing' || !this.campaign) return;
    const mission = currentMission(this.campaign);
    if (!mission) return;
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
    if (advanced.currentIndex !== mission.currentIndex) this.objectiveBaseline = this.baselineNow();
    if (isComplete(advanced) && !isComplete(mission)) {
      this.score = award(this.score, advanced.reward);
      this.objectiveBaseline = this.baselineNow();
    }
    const campaign = updateCampaign(this.campaign, advanced);
    if (this.loopMissions && isCampaignComplete(campaign) && this.missionPool.length > 0) {
      this.campaign = createCampaign(this.shuffleMissions(this.missionPool));
      this.objectiveBaseline = this.baselineNow();
      return;
    }
    this.campaign = campaign;
  }

  private baselineNow(): MissionBaseline {
    return { kills: this.kills, collected: this.collected, elapsed: this.elapsed };
  }

  private shuffleMissions(source: readonly Mission[]): Mission[] {
    const deck = source.map(resetMission);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  private updateWantedAndPolice(dt: number): void {
    this.wanted = decay(this.wanted, dt);

    if (!isWanted(this.wanted)) {
      this.police = [];
      return;
    }

    const desired = this.wantedStars;
    while (this.police.length < desired && this.policeSpawns.length > 0) {
      const spawn = this.policeSpawns[this.police.length % this.policeSpawns.length];
      const kind: 'foot' | 'car' = this.police.length % 2 === 0 ? 'foot' : 'car';
      this.police.push({ pos: spawn, heading: 0, radius: kind === 'car' ? 14 : 12, kind, alert: kind === 'car' });
    }

    const car = this.drivingCar;
    if (car && Math.abs(car.speed) >= RUN_OVER_SPEED) {
      const survivors: Police[] = [];
      for (const cop of this.police) {
        if (cop.kind === 'foot' && distance(car.pos, cop.pos) <= car.radius + cop.radius) {
          this.registerKill('police', cop.pos);
        } else {
          survivors.push(cop);
        }
      }
      this.police = survivors;
    }

    this.police = this.police.map((cop) => {
      if (cop.kind === 'car' && this.city) {
        const moved = stepPoliceCar(cop, this.focus, this.city, dt, policeSpeedFor('car', this.wantedStars));
        return { ...moved, cooldown: Math.max(0, (cop.cooldown ?? 0) - dt), alert: true };
      }
      const stepped = stepPolice(cop, this.focus, dt, policeSpeedFor(cop.kind, this.wantedStars));
      return {
        ...stepped,
        pos: resolveCircleRects(stepped.pos, stepped.radius, this.walls),
        cooldown: Math.max(0, (cop.cooldown ?? 0) - dt),
      };
    });

    this.tryPolicePin();
  }

  private tryPolicePin(): void {
    const idx = this.drivingCarIndex;
    if (idx === null || this.wantedStars < POLICE_PIN_MIN_STARS) return;
    const playerCar = this.cars[idx];
    if (Math.abs(playerCar.speed) > BUST_SPEED) return;
    for (let i = 0; i < this.police.length; i++) {
      const cop = this.police[i];
      if (cop.kind !== 'car') continue;
      if (distance(cop.pos, playerCar.pos) > playerCar.radius + cop.radius + 8) continue;
      this.cars[idx] = { ...playerCar, speed: 0 };
      this.police[i] = {
        pos: add(playerCar.pos, fromAngle(cop.heading + Math.PI / 2, playerCar.radius + 10)),
        heading: targetAngle(cop.pos, playerCar.pos),
        radius: 12,
        kind: 'foot',
      };
      return;
    }
  }

  private checkBusted(): void {
    if (this.status !== 'playing') return;
    if (!isWanted(this.wanted) || this.police.length === 0) return;
    const escaping = this.isDriving && Math.abs(this.drivingCar!.speed) >= BUST_SPEED;
    if (escaping) return;
    if (this.police.some((cop) => hasCaught(cop, this.focus))) {
      this.status = 'busted';
      this.bustedTimer = RESPAWN_DELAY;
    }
  }

  private updateDown(c: Controls, dt: number): void {
    this.bustedTimer -= dt;
    const confirmPressed = c.confirm && !this.prevConfirm;
    if (confirmPressed || this.bustedTimer <= 0) this.respawn();
  }

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
      if (isWrecked(car)) return;
      const d = distance(p, car.pos);
      if (d <= bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }
}
