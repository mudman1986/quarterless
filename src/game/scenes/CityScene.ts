import Phaser from 'phaser';
import { buildCity, tileCenter, type City } from '../../core/city';
import { World } from '../../core/world';
import { createMission, type Mission } from '../../core/mission';
import {
  loadHighScore,
  saveHighScore,
  type KeyValueStore,
} from '../../core/highScore';
import type { Car } from '../../core/vehicle';
import type { Pedestrian } from '../../core/pedestrianAI';
import type { TrafficAI } from '../../core/trafficAI';
import { vec2, type Vec2 } from '../../core/vector';
import { KeyboardInput } from '../input/KeyboardInput';
import { Sound } from '../audio/Sound';

const COLORS = {
  road: 0x2b2b30,
  roadLine: 0x3f3f46,
  building: 0x4b5563,
  buildingEdge: 0x1f2937,
  player: 0x39ff14,
  playerStroke: 0x166534,
  car: 0xef4444,
  carStroke: 0x7f1d1d,
  pedestrian: 0xfbbf24,
  police: 0x3b82f6,
  policeStroke: 0x1e3a8a,
  windshield: 0x0f172a,
  bullet: 0xfde047,
  marker: 0x22d3ee,
};

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
  };
}

/** A roomy city: 60x60 tiles (~3840px square). */
const CITY_SPEC = { cols: 60, rows: 60, tile: 64, block: 5 };
const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 5;
const PLAYER_SIZE = 14;
const CAR_LENGTH = 30;
const CAR_WIDTH = 16;
const PED_SIZE = 10;
/** A focus jump larger than this (px) means the player wrapped a map edge:
 * snap the camera there rather than panning smoothly across the whole city. */
const WRAP_SNAP_DISTANCE = 256;

/**
 * Renders the core `World` simulation with Phaser. The scene owns no game
 * rules: it builds the city, feeds keyboard input into `world.tick`, and draws
 * whatever the simulation reports each frame.
 */
export class CityScene extends Phaser.Scene {
  private city!: City;
  private world!: World;
  private input_!: KeyboardInput;

  private playerSprite!: Phaser.GameObjects.Container;
  private carSprites: Phaser.GameObjects.Container[] = [];
  private pedSprites: Phaser.GameObjects.Arc[] = [];
  private policeSprites: {
    sprite: Phaser.GameObjects.Container | Phaser.GameObjects.Arc;
    kind: 'foot' | 'car';
  }[] = [];
  private bulletSprites: Phaser.GameObjects.Rectangle[] = [];
  private missionMarker!: Phaser.GameObjects.Arc;
  private focusPoint!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Text;
  private bustedText!: Phaser.GameObjects.Text;

  private accumulator = 0;

  /** High-score persistence. */
  private store: KeyValueStore = safeStorage();
  private savedBest = 0;

  /** Procedural sound effects. */
  private readonly sfx = new Sound();

  // Previous-frame snapshots, for detecting events worth a sound.
  private prevBullets = 0;
  private prevKills = 0;
  private prevStatus: 'playing' | 'busted' | 'wasted' = 'playing';
  private prevMissionComplete = false;

  constructor() {
    super('City');
  }

  create(): void {
    this.city = buildCity(CITY_SPEC);
    const spawn = tileCenter(this.city.spec, this.city.spec.block, this.city.spec.block);

    const traffic = this.spawnTraffic();
    this.savedBest = loadHighScore(this.store);

    this.world = new World({
      player: { pos: spawn, angle: 0, radius: PLAYER_SIZE / 2 },
      cars: traffic.cars,
      carDrivers: traffic.drivers,
      city: this.city,
      pedestrians: this.spawnPedestrians(),
      policeSpawns: this.policeSpawnPoints(),
      bounds: { width: this.city.width, height: this.city.height },
      walls: [...this.city.buildings],
      bestScore: this.savedBest,
      missions: this.buildCampaign(),
    });

    this.drawCity();
    this.createEntitySprites();
    this.setupCamera();
    this.createHud();

    this.input_ = new KeyboardInput(this.input.keyboard!);
    // Browsers block audio until a user gesture: unlock on the first key press.
    this.input.keyboard?.once('keydown', () => this.sfx.resume());
  }

  /** A lively mix of cars parked along the kerbs and cars driven by NPC traffic. */
  private spawnTraffic(): { cars: Car[]; drivers: (TrafficAI | null)[] } {
    const { spec } = this.city;
    const { block, cols, rows, tile } = spec;
    const cars: Car[] = [];
    const drivers: (TrafficAI | null)[] = [];
    const curb = tile / 2 - CAR_WIDTH / 2 - 4; // offset from the lane centre to the kerb

    // Parked cars hug the kerbs of the vertical roads, pointing along the lane.
    for (let tx = block; tx < cols; tx += block * 2) {
      for (let ty = 1; ty < rows - 1; ty += block) {
        const c = tileCenter(spec, tx, ty);
        const side = (tx / block + ty) % 2 === 0 ? 1 : -1; // alternate kerbs
        cars.push({ pos: vec2(c.x + side * curb, c.y), heading: Math.PI / 2, speed: 0, radius: 14 });
        drivers.push(null);
      }
    }

    // NPC cars cruise the lane centres, one per vertical road, heading up or down.
    // They start clear of the player's spawn tile.
    let n = 0;
    for (let tx = block; tx < cols; tx += block) {
      const dir = n % 2 === 0 ? vec2(0, 1) : vec2(0, -1);
      const start = tileCenter(spec, tx, block * 2);
      cars.push({ pos: start, heading: Math.atan2(dir.y, dir.x), speed: 0, radius: 14 });
      drivers.push({ dir });
      n++;
    }
    return { cars, drivers };
  }

  /** Scatter pedestrians along the road grid. */
  private spawnPedestrians(): Pedestrian[] {
    const { spec } = this.city;
    const peds: Pedestrian[] = [];
    for (let tx = spec.block; tx < spec.cols; tx += spec.block) {
      for (let ty = 2; ty < spec.rows; ty += spec.block + 2) {
        const pos = tileCenter(spec, tx, ty);
        peds.push({ pos, heading: 0, radius: PED_SIZE / 2, state: 'wander', target: pos });
      }
    }
    return peds;
  }

  /** Police appear from the four corners of the map when the player is wanted. */
  private policeSpawnPoints(): Vec2[] {
    const { width, height } = this.city;
    return [vec2(40, 40), vec2(width - 40, 40), vec2(40, height - 40), vec2(width - 40, height - 40)];
  }

  /** A short campaign of escalating missions across the city. */
  private buildCampaign(): Mission[] {
    const { spec } = this.city;
    const b = spec.block;
    return [
      createMission({
        id: 'intro',
        title: 'Make a Name',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the marked junction (F to shoot)',
            target: tileCenter(spec, b * 3, b * 2),
            radius: 48,
          },
          { kind: 'eliminate', description: 'Take out 3 targets', count: 3 },
        ],
        reward: 1000,
      }),
      createMission({
        id: 'heat',
        title: 'Heat Wave',
        objectives: [
          {
            kind: 'reach',
            description: 'Drive across town to the docks',
            target: tileCenter(spec, spec.cols - b * 2, spec.rows - b * 2),
            radius: 56,
          },
          { kind: 'eliminate', description: 'Eliminate 5 more targets', count: 5 },
        ],
        reward: 2500,
      }),
      createMission({
        id: 'mostwanted',
        title: 'Most Wanted',
        objectives: [{ kind: 'eliminate', description: 'Cause chaos: 8 takedowns', count: 8 }],
        reward: 5000,
      }),
    ];
  }

  private drawCity(): void {
    const { width, height, spec } = this.city;
    this.cameras.main.setBackgroundColor(COLORS.road);

    // Lane markings along the road grid.
    const lines = this.add.graphics();
    lines.lineStyle(2, COLORS.roadLine, 1);
    for (let tx = 0; tx <= spec.cols; tx += spec.block) {
      lines.lineBetween(tx * spec.tile + spec.tile / 2, 0, tx * spec.tile + spec.tile / 2, height);
    }
    for (let ty = 0; ty <= spec.rows; ty += spec.block) {
      lines.lineBetween(0, ty * spec.tile + spec.tile / 2, width, ty * spec.tile + spec.tile / 2);
    }

    // Buildings.
    const blocks = this.add.graphics();
    for (const b of this.city.buildings) {
      blocks.fillStyle(COLORS.building, 1);
      blocks.fillRect(b.x, b.y, b.w, b.h);
      blocks.lineStyle(3, COLORS.buildingEdge, 1);
      blocks.strokeRect(b.x, b.y, b.w, b.h);
    }
  }

  private createEntitySprites(): void {
    // A pulsing ring marking the current 'reach' objective.
    this.missionMarker = this.add
      .circle(0, 0, 48, COLORS.marker, 0.12)
      .setStrokeStyle(3, COLORS.marker)
      .setDepth(3)
      .setVisible(false);

    this.carSprites = this.world.cars.map((car) => {
      const sprite = this.makeCarSprite(COLORS.car, COLORS.carStroke);
      sprite.setPosition(car.pos.x, car.pos.y).setRotation(car.heading);
      return sprite;
    });

    this.pedSprites = this.world.pedestrians.map((ped) => this.makePersonSprite(ped, COLORS.pedestrian));

    const p = this.world.player;
    this.playerSprite = this.makePlayerSprite();
    this.playerSprite.setPosition(p.pos.x, p.pos.y).setRotation(p.angle);
  }

  /** A car body with a darker windshield near the front, so facing is visible. */
  private makeCarSprite(fill: number, stroke: number): Phaser.GameObjects.Container {
    const body = this.add.rectangle(0, 0, CAR_LENGTH, CAR_WIDTH, fill).setStrokeStyle(2, stroke);
    const windshield = this.add.rectangle(CAR_LENGTH / 2 - 6, 0, 6, CAR_WIDTH - 5, COLORS.windshield, 0.7);
    return this.add.container(0, 0, [body, windshield]).setDepth(4);
  }

  /** The player: a body square with a bright nose marking the way they face. */
  private makePlayerSprite(): Phaser.GameObjects.Container {
    const body = this.add
      .rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, COLORS.player)
      .setStrokeStyle(2, COLORS.playerStroke);
    const nose = this.add.rectangle(PLAYER_SIZE / 2 - 1, 0, 4, PLAYER_SIZE - 4, 0xeafff0);
    return this.add.container(0, 0, [body, nose]).setDepth(10);
  }

  /** A person (pedestrian or foot officer) drawn as a small round token. */
  private makePersonSprite(at: { pos: Vec2 }, fill: number): Phaser.GameObjects.Arc {
    return this.add
      .circle(at.pos.x, at.pos.y, PED_SIZE / 2 + 1, fill)
      .setStrokeStyle(2, 0x000000, 0.25)
      .setDepth(5);
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
  }

  private setupCamera(): void {
    const f = this.world.focus;
    this.focusPoint = this.add.rectangle(f.x, f.y, 1, 1, 0x000000, 0);
    this.cameras.main.setBounds(0, 0, this.city.width, this.city.height);
    this.cameras.main.startFollow(this.focusPoint, true, 0.15, 0.15);
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
  }

  update(_time: number, deltaMs: number): void {
    const controls = this.input_.read();

    this.accumulator += deltaMs / 1000;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_SUBSTEPS) {
      this.world.tick(controls, FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      steps += 1;
    }

    this.syncSprites();
    this.handleEvents();
  }

  /** Persist the high score and play sounds for things that just happened. */
  private handleEvents(): void {
    const w = this.world;

    // Save a new high score as soon as it is beaten.
    if (w.score.best > this.savedBest) {
      this.savedBest = saveHighScore(this.store, w.score.best);
    }

    if (w.bullets.length > this.prevBullets) this.sfx.shot();
    if (w.kills > this.prevKills) this.sfx.hit();
    if (w.status !== 'playing' && this.prevStatus === 'playing') this.sfx.fail();
    if (w.missionComplete && !this.prevMissionComplete) this.sfx.fanfare();

    this.prevBullets = w.bullets.length;
    this.prevKills = w.kills;
    this.prevStatus = w.status;
    this.prevMissionComplete = w.missionComplete;
  }

  private syncSprites(): void {
    this.world.cars.forEach((car, i) => {
      const sprite = this.carSprites[i];
      sprite.setPosition(car.pos.x, car.pos.y);
      sprite.setRotation(car.heading);
    });

    // Pedestrians can be removed (run over): hide any surplus sprites.
    this.pedSprites.forEach((sprite, i) => {
      const ped = this.world.pedestrians[i];
      if (ped) {
        sprite.setVisible(true).setPosition(ped.pos.x, ped.pos.y);
      } else {
        sprite.setVisible(false);
      }
    });

    // Police spawn dynamically and arrive on foot or in patrol cars.
    this.world.police.forEach((cop, i) => {
      let entry = this.policeSprites[i];
      if (!entry || entry.kind !== cop.kind) {
        entry?.sprite.destroy();
        const sprite =
          cop.kind === 'car'
            ? this.makeCarSprite(COLORS.police, COLORS.policeStroke).setDepth(6)
            : this.makePersonSprite(cop, COLORS.police).setDepth(6);
        entry = { sprite, kind: cop.kind };
        this.policeSprites[i] = entry;
      }
      entry.sprite.setVisible(true).setPosition(cop.pos.x, cop.pos.y).setRotation(cop.heading);
    });
    for (let i = this.world.police.length; i < this.policeSprites.length; i++) {
      this.policeSprites[i].sprite.setVisible(false);
    }

    this.syncBullets();

    // Mission marker: show the ring only while a 'reach' objective is active.
    const objective = this.world.missionObjective;
    if (objective && objective.kind === 'reach') {
      this.missionMarker.setVisible(true).setPosition(objective.target.x, objective.target.y);
    } else {
      this.missionMarker.setVisible(false);
    }

    const p = this.world.player;
    this.playerSprite.setPosition(p.pos.x, p.pos.y);
    this.playerSprite.setRotation(p.angle);
    this.playerSprite.setVisible(!this.world.isDriving);

    const focus = this.world.focus;
    const jump = Math.hypot(focus.x - this.focusPoint.x, focus.y - this.focusPoint.y);
    this.focusPoint.setPosition(focus.x, focus.y);
    // On a wrap the focus leaps the width/height of the map; recentre the camera
    // instantly so it doesn't sweep across everything in between.
    if (jump > WRAP_SNAP_DISTANCE) this.cameras.main.centerOn(focus.x, focus.y);

    this.hud.setText(this.hudText());

    if (this.world.status !== 'playing') {
      const title = this.world.isWasted ? 'WASTED' : 'BUSTED';
      this.bustedText
        .setVisible(true)
        .setText(`${title}\n\nRespawning in ${this.world.respawnIn}s\nPress Enter to continue`);
    } else {
      this.bustedText.setVisible(false);
    }
  }

  /** Build the multi-line HUD: wanted, health, money, weapon, mission, controls. */
  private hudText(): string {
    const w = this.world;
    const stars = '★'.repeat(w.wantedStars) || '—';
    const hp = `${Math.ceil(w.health.current)}/${w.health.max}`;
    const money =
      w.score.best > 0 ? `$${w.score.current}  (best $${w.score.best})` : `$${w.score.current}`;
    const speed = w.drivingCar ? Math.round(Math.abs(w.drivingCar.speed)) : 0;

    const mission = w.missionComplete
      ? 'ALL MISSIONS COMPLETE'
      : w.mission
        ? `▶ ${w.mission.title}: ${w.missionObjective?.description ?? ''}`
        : '';

    const status = w.isDriving
      ? `DRIVING ${speed}  ·  WASD steer · Space exit · F shoot`
      : 'ON FOOT  ·  WASD move · Space car · F shoot';

    return [`WANTED ${stars}    HP ${hp}`, `${money}    Pistol ${w.weapon.ammo}`, mission, status]
      .filter(Boolean)
      .join('\n');
  }
}
