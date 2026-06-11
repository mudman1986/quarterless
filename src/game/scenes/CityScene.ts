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
import type { AmmoPickup } from '../../core/weapon';
import { vec2, type Vec2 } from '../../core/vector';
import { KeyboardInput } from '../input/KeyboardInput';
import { Sound } from '../audio/Sound';
import { createGameTextures, TEX } from '../art/textures';

const COLORS = {
  road: 0x2b2b30,
  roadLine: 0x52525b,
  building: 0x4b5563,
  buildingEdge: 0x111827,
  buildingRoof: 0x596577,
  window: 0xfde68a,
  windowDark: 0x334155,
  bullet: 0xfde047,
  marker: 0x22d3ee,
  ammo: 0xfacc15,
  // Minimap.
  mmBg: 0x0b0f17,
  mmRoad: 0x334155,
  mmBuilding: 0x1e293b,
  mmPlayer: 0x39ff14,
  mmPolice: 0x3b82f6,
  mmTarget: 0x22d3ee,
  mmAmmo: 0xfacc15,
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

/**
 * A roomy city: 60x60 tiles, with buildings inset from the roads (`margin`) so
 * there is comfortable driving space along every street.
 */
const CITY_SPEC = { cols: 60, rows: 60, tile: 64, block: 5, margin: 18 };
const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 5;
const PLAYER_SIZE = 14;
const PED_SIZE = 10;
/** Car body width (px), used to offset parked cars to the kerb. */
const CAR_WIDTH = 18;
/** A focus jump larger than this (px) means the player wrapped a map edge:
 * snap the camera there rather than panning smoothly across the whole city. */
const WRAP_SNAP_DISTANCE = 256;
/** On-screen size of the square minimap. */
const MINIMAP_SIZE = 168;
/** Seconds a mission announcement banner stays on screen. */
const ANNOUNCE_SECONDS = 3.2;

/**
 * Renders the core `World` simulation with Phaser. The scene owns no game
 * rules: it builds the city, feeds keyboard input into `world.tick`, and draws
 * whatever the simulation reports each frame.
 */
export class CityScene extends Phaser.Scene {
  private city!: City;
  private world!: World;
  private input_!: KeyboardInput;

  private playerSprite!: Phaser.GameObjects.Image;
  private carSprites: Phaser.GameObjects.Image[] = [];
  private pedSprites: Phaser.GameObjects.Image[] = [];
  private policeSprites: Phaser.GameObjects.Image[] = [];
  private bulletSprites: Phaser.GameObjects.Rectangle[] = [];
  private ammoSprites: { sprite: Phaser.GameObjects.Image; pickup: AmmoPickup }[] = [];
  private missionMarker!: Phaser.GameObjects.Arc;
  private focusPoint!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Text;
  private bustedText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;

  // Minimap.
  private minimapBg!: Phaser.GameObjects.Image;
  private minimapDots!: Phaser.GameObjects.Graphics;

  private accumulator = 0;

  /** High-score persistence. */
  private store: KeyValueStore = safeStorage();
  private savedBest = 0;

  /** Procedural sound effects. */
  private readonly sfx = new Sound();

  // Previous-frame snapshots, for detecting events worth a sound or a banner.
  private prevBullets = 0;
  private prevKills = 0;
  private prevStatus: 'playing' | 'busted' | 'wasted' = 'playing';
  private prevMissionComplete = false;
  private prevMissionId: string | null = null;
  private prevObjective = '';
  /** Seconds left to show the announcement banner. */
  private announceRemaining = 0;

  constructor() {
    super('City');
  }

  create(): void {
    this.city = buildCity(CITY_SPEC);
    createGameTextures(this);
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
      ammoPickups: this.spawnAmmoPickups(),
      bounds: { width: this.city.width, height: this.city.height },
      walls: [...this.city.buildings],
      bestScore: this.savedBest,
      missions: this.buildCampaign(),
      loopMissions: true,
    });

    this.drawCity();
    this.createEntitySprites();
    this.setupCamera();
    this.createHud();
    this.createMinimap();

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

  /** Ammo crates sit at road intersections around town. */
  private spawnAmmoPickups(): AmmoPickup[] {
    const { spec } = this.city;
    const pickups: AmmoPickup[] = [];
    for (let tx = spec.block * 2; tx < spec.cols; tx += spec.block * 3) {
      for (let ty = spec.block * 2; ty < spec.rows; ty += spec.block * 3) {
        pickups.push({ pos: tileCenter(spec, tx, ty), amount: 18 });
      }
    }
    return pickups;
  }

  /** A larger mission pool that the world reshuffles and loops forever. */
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
            radius: 56,
          },
          { kind: 'eliminate', description: 'Eliminate 3 targets (pedestrians or police)', count: 3 },
        ],
        reward: 1000,
      }),
      createMission({
        id: 'supply',
        title: 'Tooled Up',
        objectives: [
          { kind: 'collect', description: 'Grab 2 ammo crates', count: 2 },
          {
            kind: 'reach',
            description: 'Deliver to the lockup',
            target: tileCenter(spec, b * 6, b * 7),
            radius: 56,
          },
        ],
        reward: 1500,
      }),
      createMission({
        id: 'rampage',
        title: 'Send a Message',
        objectives: [{ kind: 'wanted', description: 'Reach a 3-star wanted level', stars: 3 }],
        reward: 2000,
      }),
      createMission({
        id: 'laylow',
        title: 'Lay Low',
        objectives: [{ kind: 'survive', description: 'Evade the law for 30s', seconds: 30 }],
        reward: 3000,
      }),
      createMission({
        id: 'mostwanted',
        title: 'Most Wanted',
        objectives: [{ kind: 'eliminate', description: 'Eliminate 8 targets (pedestrians or police)', count: 8 }],
        reward: 5000,
      }),
      createMission({
        id: 'shakedown',
        title: 'Shakedown',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the shakedown point',
            target: tileCenter(spec, b * 8, b * 3),
            radius: 56,
          },
          { kind: 'collect', description: 'Collect 2 ammo crates on the way out', count: 2 },
        ],
        reward: 1800,
      }),
      createMission({
        id: 'heatcheck',
        title: 'Heat Check',
        objectives: [
          { kind: 'wanted', description: 'Reach a 2-star wanted level', stars: 2 },
          { kind: 'survive', description: 'Stay alive for 15s', seconds: 15 },
        ],
        reward: 2400,
      }),
      createMission({
        id: 'cleanup',
        title: 'Cleanup Crew',
        objectives: [
          { kind: 'eliminate', description: 'Eliminate 4 targets (pedestrians or police)', count: 4 },
          {
            kind: 'reach',
            description: 'Drive back to the safehouse',
            target: tileCenter(spec, b * 2, b * 8),
            radius: 56,
          },
        ],
        reward: 3200,
      }),
    ];
  }

  private drawCity(): void {
    const { width, height, spec } = this.city;
    this.cameras.main.setBackgroundColor(COLORS.road);

    // Lane markings down the middle of every road.
    const lines = this.add.graphics();
    lines.lineStyle(2, COLORS.roadLine, 0.5);
    for (let tx = 0; tx <= spec.cols; tx += spec.block) {
      const x = tx * spec.tile + spec.tile / 2;
      lines.lineBetween(x, 0, x, height);
    }
    for (let ty = 0; ty <= spec.rows; ty += spec.block) {
      const y = ty * spec.tile + spec.tile / 2;
      lines.lineBetween(0, y, width, y);
    }

    // Buildings with rooftops and lit windows for a denser city look.
    const g = this.add.graphics();
    const shades = [0x3f4654, 0x4b5563, 0x434b59, 0x515b6b, 0x3a4150];
    this.city.buildings.forEach((b, i) => {
      g.fillStyle(shades[i % shades.length], 1);
      g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle(COLORS.buildingRoof, 1);
      g.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      g.lineStyle(2, COLORS.buildingEdge, 1);
      g.strokeRect(b.x, b.y, b.w, b.h);

      // A grid of windows; a deterministic few are "lit".
      const pad = 12;
      const cell = 18;
      for (let wx = b.x + pad; wx <= b.x + b.w - pad - 8; wx += cell) {
        for (let wy = b.y + pad; wy <= b.y + b.h - pad - 8; wy += cell) {
          const lit = (Math.floor(wx) + Math.floor(wy)) % 3 === 0;
          g.fillStyle(lit ? COLORS.window : COLORS.windowDark, lit ? 0.85 : 1);
          g.fillRect(wx, wy, 8, 8);
        }
      }
    });
  }

  private createEntitySprites(): void {
    // A pulsing ring marking the current 'reach' objective.
    this.missionMarker = this.add
      .circle(0, 0, 52, COLORS.marker, 0.12)
      .setStrokeStyle(3, COLORS.marker)
      .setDepth(3)
      .setVisible(false);

    this.carSprites = this.world.cars.map((car) =>
      this.add.image(car.pos.x, car.pos.y, TEX.npcCar).setDepth(4).setRotation(car.heading),
    );

    this.pedSprites = this.world.pedestrians.map((ped) =>
      this.add.image(ped.pos.x, ped.pos.y, TEX.pedestrian).setDepth(5),
    );

    this.ammoSprites = this.world.ammoPickups.map((pickup) => ({
      pickup,
      sprite: this.add.image(pickup.pos.x, pickup.pos.y, TEX.ammo).setDepth(5),
    }));

    const p = this.world.player;
    this.playerSprite = this.add.image(p.pos.x, p.pos.y, TEX.player).setDepth(10).setRotation(p.angle);
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

    // A transient banner that announces each new mission / objective.
    this.banner = this.add
      .text(this.scale.width / 2, 84, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#67e8f9',
        align: 'center',
        backgroundColor: '#000000b0',
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1500)
      .setVisible(false);
  }

  /** Build the corner minimap: a static city backdrop plus a live dot overlay. */
  private createMinimap(): void {
    const scale = MINIMAP_SIZE / this.city.width;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(COLORS.mmRoad, 1);
    g.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    g.fillStyle(COLORS.mmBuilding, 1);
    for (const b of this.city.buildings) {
      g.fillRect(b.x * scale, b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
    }
    g.generateTexture('minimap-bg', MINIMAP_SIZE, MINIMAP_SIZE);
    g.destroy();

    this.minimapBg = this.add
      .image(0, 0, 'minimap-bg')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1400)
      .setAlpha(0.85);
    this.minimapDots = this.add.graphics().setScrollFactor(0).setDepth(1401);
  }

  /** Redraw the minimap's moving dots (player, police, ammo, objective). */
  private syncMinimap(): void {
    const scale = MINIMAP_SIZE / this.city.width;
    const ox = this.scale.width - MINIMAP_SIZE - 12;
    const oy = 12;
    this.minimapBg.setPosition(ox, oy);

    const g = this.minimapDots;
    g.clear();

    const objective = this.world.missionObjective;
    if (objective && objective.kind === 'reach') {
      g.lineStyle(2, COLORS.mmTarget, 1);
      g.strokeCircle(ox + objective.target.x * scale, oy + objective.target.y * scale, 4);
    }

    g.fillStyle(COLORS.mmAmmo, 1);
    for (const a of this.world.ammoPickups) {
      g.fillRect(ox + a.pos.x * scale - 1, oy + a.pos.y * scale - 1, 3, 3);
    }

    g.fillStyle(COLORS.mmPolice, 1);
    for (const cop of this.world.police) {
      g.fillCircle(ox + cop.pos.x * scale, oy + cop.pos.y * scale, 2);
    }

    g.fillStyle(COLORS.mmPlayer, 1);
    g.fillCircle(ox + this.world.focus.x * scale, oy + this.world.focus.y * scale, 3);
  }

  update(_time: number, deltaMs: number): void {
    const controls = this.input_.read();
    const dt = deltaMs / 1000;

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_SUBSTEPS) {
      this.world.tick(controls, FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      steps += 1;
    }

    this.syncSprites();
    this.syncMinimap();
    this.handleEvents();

    // Count down the announcement banner.
    if (this.announceRemaining > 0) {
      this.announceRemaining -= dt;
      this.banner.setPosition(this.scale.width / 2, 84);
      if (this.announceRemaining <= 0) this.banner.setVisible(false);
    }
  }

  /** Persist the high score, play sounds, and announce mission changes. */
  private handleEvents(): void {
    const w = this.world;

    // Save a new high score as soon as it is beaten.
    if (w.score.best > this.savedBest) {
      this.savedBest = saveHighScore(this.store, w.score.best);
    }

    if (w.bullets.length > this.prevBullets) this.sfx.shot();
    if (w.kills > this.prevKills) this.sfx.hit();
    if (w.status !== 'playing' && this.prevStatus === 'playing') this.sfx.fail();

    const missionId = w.mission?.id ?? null;
    const objective = w.missionObjective?.description ?? '';
    if (w.missionComplete && !this.prevMissionComplete) {
      this.sfx.fanfare();
      this.showBanner('ALL MISSIONS COMPLETE!');
    } else if (missionId !== this.prevMissionId) {
      // A new mission begins — the first one, or after finishing the previous.
      if (this.prevMissionId !== null) this.sfx.fanfare();
      if (w.mission) this.showBanner(`NEW MISSION\n${w.mission.title}\n${objective}`);
    } else if (objective !== '' && objective !== this.prevObjective) {
      this.showBanner(objective); // next objective within the same mission
    }

    this.prevBullets = w.bullets.length;
    this.prevKills = w.kills;
    this.prevStatus = w.status;
    this.prevMissionComplete = w.missionComplete;
    this.prevMissionId = missionId;
    this.prevObjective = objective;
  }

  /** Flash a banner message for a few seconds. */
  private showBanner(text: string): void {
    this.banner.setText(text).setVisible(true);
    this.announceRemaining = ANNOUNCE_SECONDS;
  }

  private syncSprites(): void {
    this.world.cars.forEach((car, i) => {
      this.carSprites[i]
        .setTexture(i === this.world.drivingCarIndex ? TEX.playerCar : TEX.npcCar)
        .setPosition(car.pos.x, car.pos.y)
        .setRotation(car.heading);
    });

    // Pedestrians can be removed (run over): hide any surplus sprites.
    this.pedSprites.forEach((sprite, i) => {
      const ped = this.world.pedestrians[i];
      if (ped) sprite.setVisible(true).setPosition(ped.pos.x, ped.pos.y);
      else sprite.setVisible(false);
    });

    // Ammo crates disappear once their specific pickup is collected.
    for (const { sprite, pickup } of this.ammoSprites) {
      sprite.setVisible(this.world.ammoPickups.includes(pickup));
    }

    // Police spawn dynamically and arrive on foot or in patrol cars.
    this.world.police.forEach((cop, i) => {
      let sprite = this.policeSprites[i];
      if (!sprite) {
        sprite = this.add.image(cop.pos.x, cop.pos.y, TEX.policeFoot).setDepth(6);
        this.policeSprites[i] = sprite;
      }
      sprite
        .setTexture(cop.kind === 'car' ? TEX.policeCar : TEX.policeFoot)
        .setVisible(true)
        .setPosition(cop.pos.x, cop.pos.y)
        .setRotation(cop.heading);
    });
    for (let i = this.world.police.length; i < this.policeSprites.length; i++) {
      this.policeSprites[i].setVisible(false);
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
        .setPosition(this.scale.width / 2, this.scale.height / 2)
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
        ? `▶ ${w.mission.title}: ${w.missionObjective?.description ?? ''}${w.missionProgress ? ` (${w.missionProgress})` : ''}`
        : '';

    const ammo =
      w.weapon.ammo <= 4
        ? `Pistol ${w.weapon.ammo}  ⚠ LOW — grab a crate`
        : `Pistol ${w.weapon.ammo}`;

    const status = w.isDriving
      ? `DRIVING ${speed}  ·  WASD steer · Space exit · F shoot`
      : 'ON FOOT  ·  WASD move · Space car · F shoot';

    return [`WANTED ${stars}    HP ${hp}`, `${money}    ${ammo}`, mission, status]
      .filter(Boolean)
      .join('\n');
  }
}
