import {
  buildCity,
  tileCenter,
  type City,
  type ParkingSpot,
} from '../../core/city';
import Phaser from 'phaser';
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
import { uiScreenToWorld, uiCounterScale, uiAnchorOnScreen } from '../../core/hudLayout';
import { greenAxis } from '../../core/trafficLight';
import { KeyboardInput } from '../input/KeyboardInput';
import { Sound } from '../audio/Sound';
import { createGameTextures, TEX } from '../art/textures';

const COLORS = {
  road: 0x2b2b30,
  roadLine: 0x52525b,
  building: 0x4b5563,
  buildingEdge: 0x111827,
  buildingRoof: 0x596577,
  policeBuilding: 0x1d4ed8,
  hospitalBuilding: 0xf8fafc,
  towBuilding: 0xf59e0b,
  policeRoof: 0x0f285f,
  hospitalRoof: 0xe2e8f0,
  towRoof: 0x92400e,
  window: 0xfde68a,
  windowDark: 0x334155,
  bullet: 0xfde047,
  marker: 0x22d3ee,
  ammo: 0xfacc15,
  // Water & bridges.
  water: 0x1d4e6f,
  waterEdge: 0x123a52,
  bridge: 0x3a3a42,
  bridgeEdge: 0x18181b,
  fence: 0xa8a29e,
  // Streets.
  sidewalk: 0x6b7280,
  crosswalk: 0xd1d5db,
  lightGreen: 0x22c55e,
  lightRed: 0xef4444,
  parkingLine: 0xca8a04,
  // Minimap.
  mmBg: 0x0b0f17,
  mmRoad: 0x334155,
  mmBuilding: 0x1e293b,
  mmPoliceBuilding: 0x2563eb,
  mmHospitalBuilding: 0xe5e7eb,
  mmTowBuilding: 0xf59e0b,
  mmWater: 0x1d4e6f,
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
 * A roomy city: 70x70 tiles, with buildings inset from the roads (`margin`) so
 * there is comfortable driving space along every street. A wide river cuts
 * across the middle, crossed by bridges on every other road.
 */
const CITY_SPEC = {
  cols: 70,
  rows: 70,
  tile: 64,
  block: 5,
  margin: 18,
  rivers: [{ orientation: 'horizontal' as const, start: 31, span: 4, bridgeEvery: 2 }],
};
const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 5;
const PLAYER_SIZE = 14;
const PED_SIZE = 10;
/** Roughly how many of the city's parking bays actually hold a parked car. */
const PARKED_CAR_BUDGET = 90;
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
/** On-screen size of the square minimap. */
const MINIMAP_SIZE = 168;
/** Seconds a mission announcement banner stays on screen. */
const ANNOUNCE_SECONDS = 3.2;
/** Length in seconds of a full day/night cycle (30 minutes). */
const DAY_LENGTH = 1800;
/** Tow-truck amber beacon: blink interval (ms) and how far forward (px) of the
 * truck's centre the cab-roof light sits. */
const TOW_BEACON_BLINK_MS = 280;
const TOW_BEACON_FWD = 9.5;
/** Ambulance light bar: strobe interval (ms), and how far forward (px) and to
 * each side (px) of the centre the blue and red lamps sit (over the roof bar). */
const AMB_BEACON_BLINK_MS = 220;
const AMB_BEACON_FWD = 6.5;
const AMB_BEACON_SIDE = 3.5;

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
  private policeBulletSprites: Phaser.GameObjects.Rectangle[] = [];
  private ammoSprites: { sprite: Phaser.GameObjects.Image; pickup: AmmoPickup }[] = [];
  private missionMarker!: Phaser.GameObjects.Arc;
  private explosionGfx!: Phaser.GameObjects.Graphics;
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

  // Minimap.
  private minimapBg!: Phaser.GameObjects.Image;
  private minimapDots!: Phaser.GameObjects.Graphics;

  private accumulator = 0;

  /** Pause / menu state. */
  private paused = false;
  private pauseKey!: Phaser.Input.Keyboard.Key;
  private newGameKey!: Phaser.Input.Keyboard.Key;
  private pauseMenu!: Phaser.GameObjects.Text;

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
  private prevExplosions = 0;
  /** Seconds until the next siren wail while a chase is on. */
  private sirenTimer = 0;
  /** Seconds left to show the announcement banner. */
  private announceRemaining = 0;
  /** Elapsed time driving the day/night cycle, and its dimming overlay. */
  private timeOfDay = 0;
  private dayNightOverlay!: Phaser.GameObjects.Rectangle;
  /** Night-time city lighting: intersection glows + a player aura. */
  private nightLights!: Phaser.GameObjects.Container;
  private nightAura!: Phaser.GameObjects.Image;

  constructor() {
    super('City');
  }

  create(): void {
    // Reset per-run state so a new game (scene.restart) starts clean: the lazily
    // built sprite pools must not keep references to the previous run's objects.
    this.carSprites = [];
    this.pedSprites = [];
    this.policeSprites = [];
    this.bulletSprites = [];
    this.policeBulletSprites = [];
    this.ammoSprites = [];
    this.parkedSpots = [];
    this.accumulator = 0;
    this.sirenTimer = 0;
    this.timeOfDay = 0;
    this.prevBullets = 0;
    this.prevKills = 0;
    this.prevExplosions = 0;
    this.prevStatus = 'playing';
    this.prevMissionComplete = false;
    this.prevMissionId = null;
    this.prevObjective = '';

    this.city = buildCity(CITY_SPEC);
    createGameTextures(this);
    this.intersectionCenters = this.computeIntersectionCenters();
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
      walls: [...this.city.buildings, ...this.city.fences],
      water: this.city.water,
      sidewalks: this.city.sidewalks,
      bestScore: this.savedBest,
      campaigns: this.buildCampaigns(),
    });

    this.drawCity();
    this.createEntitySprites();
    this.setupCamera();
    this.createHud();
    this.createMinimap();
    this.layoutHud();

    this.input_ = new KeyboardInput(this.input.keyboard!);
    // Menu keys: P pauses/resumes, N starts a fresh game.
    const kb = this.input.keyboard!;
    this.pauseKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.newGameKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    this.paused = false;
    // Browsers block audio until a user gesture: unlock on the first key press.
    this.input.keyboard?.once('keydown', () => this.sfx.resume());
  }

  /** A lively mix of cars parked in the marked bays and cars driven by NPC traffic. */
  private spawnTraffic(): { cars: Car[]; drivers: (TrafficAI | null)[] } {
    const { spec } = this.city;
    const { block, cols } = spec;
    const cars: Car[] = [];
    const drivers: (TrafficAI | null)[] = [];

    // Parked cars fill a spread-out subset of the kerbside bays (right against
    // the sidewalks), kept to a budget so the streets — and the collision
    // workload — stay sensible.
    const spots = this.city.parkingSpots;
    const stride = Math.max(1, Math.ceil(spots.length / PARKED_CAR_BUDGET));
    spots.forEach((spot, i) => {
      if (i % stride !== 0) return;
      cars.push({ pos: spot.pos, heading: spot.heading, speed: 0, radius: 14 });
      drivers.push(null);
      this.parkedSpots.push(spot);
    });

    // NPC cars cruise the lane centres, one per vertical road, heading up or down.
    // They start clear of the player's spawn tile.
    let n = 0;
    for (let tx = block; tx < cols; tx += block) {
      const dir = n % 2 === 0 ? vec2(0, 1) : vec2(0, -1);
      const start = tileCenter(spec, tx, block * 2);
      if (!this.city.isWater(tx, block * 2)) {
        cars.push({ pos: start, heading: Math.atan2(dir.y, dir.x), speed: 0, radius: 14 });
        drivers.push({ dir });
      }
      n++;
    }
    return { cars, drivers };
  }

  /** Scatter pedestrians along the sidewalks so they start off the road. */
  private spawnPedestrians(): Pedestrian[] {
    const peds: Pedestrian[] = [];
    this.city.sidewalks.forEach((s, i) => {
      if (i % 12 !== 0) return; // a manageable scattering across the city
      const pos = vec2(s.x + s.w / 2, s.y + s.h / 2);
      peds.push({ pos, heading: 0, radius: PED_SIZE / 2, state: 'wander', target: pos });
    });
    return peds;
  }

  /** Police appear from the four corners of the map when the player is wanted. */
  private policeSpawnPoints(): Vec2[] {
    const stations = this.city.facilities
      .filter((f) => f.kind === 'policeStation')
      .map((f) => f.spawn);
    if (stations.length > 0) return stations;
    const { width, height } = this.city;
    return [vec2(40, 40), vec2(width - 40, 40), vec2(40, height - 40), vec2(width - 40, height - 40)];
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
  private buildCampaigns(): Mission[][] {
    const { spec } = this.city;
    const b = spec.block;
    const reach = (tx: number, ty: number, description: string) => ({
      kind: 'reach' as const,
      description,
      target: tileCenter(spec, tx, ty),
      radius: 56,
    });

    const makeName: Mission[] = [
      createMission({
        id: 'intro',
        title: 'Make a Name',
        objectives: [
          reach(b * 3, b * 2, 'Drive to the marked junction (yellow ring)'),
          { kind: 'eliminate', description: 'Take down 3 targets — press F to shoot', count: 3 },
        ],
        reward: 1000,
      }),
      createMission({
        id: 'supply',
        title: 'Tooled Up',
        objectives: [
          { kind: 'collect', description: 'Grab 2 ammo crates (drive or walk over them)', count: 2 },
          reach(b * 6, b * 3, 'Deliver to the lockup (yellow ring)'),
        ],
        reward: 1500,
      }),
    ];

    const heat: Mission[] = [
      createMission({
        id: 'rampage',
        title: 'Send a Message',
        objectives: [
          { kind: 'wanted', description: 'Cause chaos until you hit a 3-star wanted level', stars: 3 },
        ],
        reward: 2000,
      }),
      createMission({
        id: 'laylow',
        title: 'Lay Low',
        objectives: [
          { kind: 'survive', description: 'Shake the cops — stay alive 30s while wanted', seconds: 30 },
        ],
        reward: 3000,
      }),
    ];

    const mostWanted: Mission[] = [
      createMission({
        id: 'takedown',
        title: 'Takedown',
        objectives: [
          {
            kind: 'eliminate',
            description: 'Take down 6 targets — run them over or shoot (F)',
            count: 6,
          },
        ],
        reward: 4000,
      }),
      createMission({
        id: 'getaway',
        title: 'Getaway',
        objectives: [
          reach(b * 9, b * 9, 'Reach the safehouse across town (yellow ring)'),
          { kind: 'survive', description: 'Lie low for 20s', seconds: 20 },
        ],
        reward: 5000,
      }),
    ];

    return [makeName, heat, mostWanted];
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

    // Water and bridges cover the road/markings where the river cuts across.
    this.drawTerrain();
    // Sidewalks, crosswalks, and parking bays.
    this.drawStreets();

    // Buildings with rooftops and lit windows for a denser city look.
    const g = this.add.graphics();
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
              : shades[i % shades.length];
      const roofColor =
        facility?.kind === 'policeStation'
          ? COLORS.policeRoof
          : facility?.kind === 'hospital'
            ? COLORS.hospitalRoof
            : facility?.kind === 'towYard'
              ? COLORS.towRoof
              : COLORS.buildingRoof;
      g.fillStyle(bodyColor, 1);
      g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle(roofColor, 1);
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

      if (facility?.kind === 'hospital') {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        g.fillStyle(0xdc2626, 1);
        g.fillRect(cx - 6, cy - 18, 12, 36);
        g.fillRect(cx - 18, cy - 6, 36, 12);
      } else if (facility?.kind === 'policeStation') {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        g.fillStyle(0xbfdbfe, 1);
        g.fillRect(cx - 16, cy - 12, 32, 6);
        g.fillRect(cx - 12, cy - 4, 24, 6);
        g.fillRect(cx - 8, cy + 4, 16, 6);
      } else if (facility?.kind === 'towYard') {
        g.fillStyle(0x111114, 1);
        for (let k = 0; k < 5; k++) {
          g.fillRect(b.x + 16 + k * 18, b.y + b.h / 2 - 4, 10, 8);
        }
      }
    });

    // Forecourt markers where service vehicles / police emerge from the facility.
    g.fillStyle(0xffffff, 0.9);
    for (const facility of this.city.facilities) {
      g.fillCircle(facility.spawn.x, facility.spawn.y, 6);
      g.lineStyle(2, COLORS.buildingEdge, 1);
      g.strokeCircle(facility.spawn.x, facility.spawn.y, 6);
    }
  }

  /** Draw the river water, the bridge decks crossing it, and the bridge rails. */
  private drawTerrain(): void {
    if (this.city.water.length === 0) return;
    const { tile } = this.city.spec;

    // Water bodies.
    const w = this.add.graphics().setDepth(1);
    for (const body of this.city.water) {
      w.fillStyle(COLORS.water, 1);
      w.fillRect(body.x, body.y, body.w, body.h);
      w.lineStyle(2, COLORS.waterEdge, 1);
      w.strokeRect(body.x, body.y, body.w, body.h);
    }

    // Bridge decks: a solid plank covering each bridge tile so it reads as a
    // crossing over the water rather than part of the river.
    const decks = this.add.graphics().setDepth(2);
    const { cols, rows } = this.city.spec;
    decks.fillStyle(COLORS.bridge, 1);
    for (let tx = 0; tx < cols; tx++) {
      for (let ty = 0; ty < rows; ty++) {
        if (this.city.isBridge(tx, ty)) {
          decks.fillRect(tx * tile, ty * tile, tile, tile);
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
    const { cols, rows, block } = this.city.spec;
    const centers: Vec2[] = [];
    for (let tx = 0; tx < cols; tx += block) {
      for (let ty = 0; ty < rows; ty += block) {
        if (this.city.isRoad(tx, ty) && !this.city.isWater(tx, ty)) {
          centers.push(tileCenter(this.city.spec, tx, ty));
        }
      }
    }
    return centers;
  }

  private drawStreets(): void {
    const tile = this.city.spec.tile;
    const g = this.add.graphics().setDepth(0);

    // Sidewalks: pale strips hugging the buildings.
    g.fillStyle(COLORS.sidewalk, 1);
    for (const s of this.city.sidewalks) g.fillRect(s.x, s.y, s.w, s.h);

    // Crosswalks: zebra stripes laid across the road at each crossing tile.
    // A tile on a vertical road is crossed east-west (upright bars); one on a
    // horizontal road is crossed north-south (flat bars).
    g.fillStyle(COLORS.crosswalk, 0.9);
    const bars = 4;
    const stripe = tile / (bars * 2); // half on, half gap
    for (const cw of this.city.crosswalks) {
      const verticalRoad = cw.w > cw.h; // crossed east-west
      for (let k = 0; k < bars; k++) {
        const off = k * 2 * stripe + stripe / 2;
        if (verticalRoad) {
          g.fillRect(cw.x + off, cw.y, stripe, cw.h); // upright bars
        } else {
          g.fillRect(cw.x, cw.y + off, cw.w, stripe); // flat bars
        }
      }
    }

    // Parking bays: a thin outline under each parked car, oriented to its kerb.
    g.lineStyle(1.5, COLORS.parkingLine, 0.7);
    for (const spot of this.parkedSpots) {
      const along = Math.abs(Math.cos(spot.heading)) > 0.5; // pointing along x?
      const halfW = along ? 17 : 9;
      const halfH = along ? 9 : 17;
      g.strokeRect(spot.pos.x - halfW, spot.pos.y - halfH, halfW * 2, halfH * 2);
    }
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

    // A graphics layer for drawing explosion blasts above everything else.
    this.explosionGfx = this.add.graphics().setDepth(11);
    // Traffic-light indicators sit above the road but below entities.
    this.lightsGfx = this.add.graphics().setDepth(7);
    // Corpses and their blood puddles sit just above the road, below the living.
    this.corpseGfx = this.add.graphics().setDepth(4);
    // The ambulance: a white emergency vehicle, hidden until dispatched.
    this.ambulanceSprite = this.add.image(0, 0, TEX.ambulance).setDepth(6).setVisible(false);
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
      const light = this.add.image(c.x, c.y, 'glow').setScale(0.7).setBlendMode(Phaser.BlendModes.ADD);
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
    const g = this.explosionGfx;
    g.clear();
    for (const e of this.world.explosions) {
      const t = e.age / e.life; // 0 -> 1 over the blast's life
      const r = e.radius * (0.4 + 0.6 * t);
      g.fillStyle(0xfacc15, (1 - t) * 0.5); // yellow flash
      g.fillCircle(e.pos.x, e.pos.y, r);
      g.fillStyle(0xf97316, (1 - t) * 0.6); // orange core
      g.fillCircle(e.pos.x, e.pos.y, r * 0.6);
    }
  }

  /** Draw the traffic lights: a green/red bar for each travel axis at every
   * intersection, reflecting the current shared light phase. */
  private syncLights(): void {
    const axis = greenAxis(this.world.lights);
    const g = this.lightsGfx;
    g.clear();
    const ew = axis === 'horizontal' ? COLORS.lightGreen : COLORS.lightRed;
    const ns = axis === 'vertical' ? COLORS.lightGreen : COLORS.lightRed;
    for (const c of this.intersectionCenters) {
      g.fillStyle(ew, 1);
      g.fillRect(c.x - 7, c.y - 1.5, 14, 3); // east-west indicator
      g.fillStyle(ns, 1);
      g.fillRect(c.x - 1.5, c.y - 7, 3, 14); // north-south indicator
    }
  }

  /** Draw each corpse as a body lying in a pool of blood. */
  private syncCorpses(): void {
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
    this.ambulanceSprite.setVisible(true).setPosition(amb.pos.x, amb.pos.y).setRotation(amb.heading);

    // The medic on foot, while the ambulance is parked fetching the body.
    if (amb.crew) {
      this.medicSprite ??= this.add.image(0, 0, TEX.medic).setDepth(6);
      const goal = amb.phase === 'collect' ? amb.target : amb.pos;
      this.medicSprite
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
        sprite = this.add.image(0, 0, TEX.tow).setDepth(6);
        this.towSprites[i] = sprite;
      }
      sprite.setVisible(true).setPosition(tow.pos.x, tow.pos.y).setRotation(tow.heading);

      // The operator on foot, while the truck is parked hooking the wreck.
      let worker = this.towWorkerSprites[i];
      if (tow.crew) {
        if (!worker) {
          worker = this.add.image(0, 0, TEX.towWorker).setDepth(6);
          this.towWorkerSprites[i] = worker;
        }
        const goal = tow.phase === 'collect' ? tow.target : tow.pos;
        worker
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

  private setupCamera(): void {
    const f = this.world.focus;
    this.focusPoint = this.add.rectangle(f.x, f.y, 1, 1, 0x000000, 0);
    this.cameras.main.setBounds(0, 0, this.city.width, this.city.height);
    this.cameras.main.startFollow(this.focusPoint, true, 0.15, 0.15);
    this.applyZoom();
    // Re-fit when the viewport changes — window resize, device rotation, or
    // mobile Safari showing/hiding its toolbars (the iPad "car off-screen" bug).
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
    });
  }

  /** Fit the camera zoom to the current viewport so the player stays centred and
   * a consistent amount of the city is visible on every device. */
  private applyZoom(): void {
    const { width, height } = this.scale.gameSize;
    const span = Math.min(width, height);
    if (span <= 0) return;
    const zoom = Phaser.Math.Clamp(span / VIEW_SPAN, MIN_ZOOM, MAX_ZOOM);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(this.world.focus.x, this.world.focus.y);
  }

  /** Handle a viewport resize: refit the zoom and recentre screen-space UI. */
  private onResize(): void {
    this.applyZoom();
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
      obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text | Phaser.GameObjects.Graphics | undefined,
      screenX: number,
      screenY: number,
    ): void => {
      if (!obj) return;
      const w = uiScreenToWorld(vec2(screenX, screenY), viewport, zoom);
      obj.setPosition(w.x, w.y).setScale(counter);
    };

    place(this.hud, 10, 10); // top-left status readout
    place(this.banner, width / 2, 84); // mission announcement
    place(this.bustedText, width / 2, height / 2);
    place(this.pauseMenu, width / 2, height / 2);

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

    // The pause menu overlay (shown while paused).
    this.pauseMenu = this.add
      .text(
        this.scale.width / 2,
        this.scale.height / 2,
        'PAUSED\n\nP — Resume\nN — New Game',
        {
          fontFamily: 'monospace',
          fontSize: '28px',
          color: '#e5e7eb',
          align: 'center',
          backgroundColor: '#000000d0',
          padding: { x: 28, y: 22 },
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2500)
      .setVisible(false);

    // A full-screen dimming overlay for the day/night cycle. Oversized and
    // centred so it covers the viewport at any camera zoom; depth below the HUD.
    this.dayNightOverlay = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width * 3, this.scale.height * 3, 0x0a0f24, 0)
      .setScrollFactor(0)
      .setDepth(900);
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
    for (const facility of this.city.facilities) {
      g.fillStyle(
        facility.kind === 'policeStation'
          ? COLORS.mmPoliceBuilding
          : facility.kind === 'hospital'
            ? COLORS.mmHospitalBuilding
            : COLORS.mmTowBuilding,
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
    // Dots are drawn in the minimap's own local space (0..MINIMAP_SIZE). The
    // graphics object's position and counter-zoom scale (set in layoutHud) place
    // and size it on screen, so no screen offset is baked into the geometry.
    const g = this.minimapDots;
    g.clear();

    const objective = this.world.missionObjective;
    if (objective && objective.kind === 'reach') {
      g.lineStyle(2, COLORS.mmTarget, 1);
      g.strokeCircle(objective.target.x * scale, objective.target.y * scale, 4);
    }

    g.fillStyle(COLORS.mmAmmo, 1);
    for (const a of this.world.ammoPickups) {
      g.fillRect(a.pos.x * scale - 1, a.pos.y * scale - 1, 3, 3);
    }

    g.fillStyle(COLORS.mmPolice, 1);
    for (const cop of this.world.police) {
      g.fillCircle(cop.pos.x * scale, cop.pos.y * scale, 2);
    }

    g.fillStyle(COLORS.mmPlayer, 1);
    g.fillCircle(this.world.focus.x * scale, this.world.focus.y * scale, 3);
  }

  update(_time: number, deltaMs: number): void {
    // New game from scratch, available at any time.
    if (Phaser.Input.Keyboard.JustDown(this.newGameKey)) {
      this.startNewGame();
      return;
    }
    // Toggle pause; while paused the simulation is frozen.
    if (Phaser.Input.Keyboard.JustDown(this.pauseKey)) this.togglePause();
    if (this.paused) return;

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
    this.updateSiren(dt);
    this.updateDayNight(dt);

    // Count down the announcement banner.
    if (this.announceRemaining > 0) {
      this.announceRemaining -= dt;
      if (this.announceRemaining <= 0) this.banner.setVisible(false);
    }
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

  /** Freeze or resume the simulation and show/hide the pause menu. */
  private togglePause(): void {
    this.paused = !this.paused;
    this.pauseMenu.setVisible(this.paused);
  }

  /** Restart the scene, beginning a brand-new game (the high score persists). */
  private startNewGame(): void {
    this.paused = false;
    this.scene.restart();
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
    if (w.explosionsTriggered > this.prevExplosions) this.sfx.explosion();
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
    this.prevExplosions = w.explosionsTriggered;
  }

  /** Flash a banner message for a few seconds. */
  private showBanner(text: string): void {
    this.banner.setText(text).setVisible(true);
    this.announceRemaining = ANNOUNCE_SECONDS;
  }

  private syncSprites(): void {
    this.world.cars.forEach((car, i) => {
      const sprite = this.carSprites[i];
      if (this.world.towedCars[i]) {
        sprite.setVisible(false); // hauled away by a tow truck
        return;
      }
      if (this.world.wreckedCars[i]) {
        // A destroyed car is a charred, static wreck.
        sprite.setVisible(true).setTexture(TEX.npcCar).setTint(0x3a3a3a).setPosition(car.pos.x, car.pos.y).setRotation(car.heading);
        return;
      }
      sprite
        .clearTint()
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

    // Police spawn dynamically and arrive on foot or in patrol cars. While a
    // chase is on, their lights flash red/blue.
    const flashBlue = Math.floor(this.time.now / 200) % 2 === 0;
    const lightTint = flashBlue ? 0x60a5fa : 0xf87171;
    this.world.police.forEach((cop, i) => {
      let sprite = this.policeSprites[i];
      if (!sprite) {
        sprite = this.add.image(cop.pos.x, cop.pos.y, TEX.policeFoot).setDepth(6);
        this.policeSprites[i] = sprite;
      }
      sprite
        .setTexture(cop.kind === 'car' ? TEX.policeCar : TEX.policeFoot)
        .setVisible(true)
        .setTint(lightTint)
        .setPosition(cop.pos.x, cop.pos.y)
        .setRotation(cop.heading);
    });
    for (let i = this.world.police.length; i < this.policeSprites.length; i++) {
      this.policeSprites[i].setVisible(false);
    }

    this.syncBullets();
    this.syncExplosions();
    this.syncLights();
    this.syncCorpses();
    this.syncAmbulance();
    this.syncTow();

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

  /** A "(done/goal)" tag for the current objective, or '' for reach/none. */
  private progressText(): string {
    const p = this.world.missionProgress;
    return p ? `  (${p.current}/${p.goal})` : '';
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
        ? `▶ ${w.mission.title}: ${w.missionObjective?.description ?? ''}${this.progressText()}`
        : '';

    const ammo =
      w.weapon.ammo <= 4
        ? `Pistol ${w.weapon.ammo}  ⚠ LOW — grab a crate`
        : `Pistol ${w.weapon.ammo}`;

    const status = w.isDriving
      ? `DRIVING ${speed}  ·  WASD steer · Space exit · F shoot · P pause`
      : 'ON FOOT  ·  WASD move · Space car · F shoot · P pause';

    return [`WANTED ${stars}    HP ${hp}`, `${money}    ${ammo}`, mission, status]
      .filter(Boolean)
      .join('\n');
  }
}
