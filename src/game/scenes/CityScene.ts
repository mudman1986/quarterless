import Phaser from 'phaser';
import { bridgeBarriers, buildCity, edgeRoadSpawnPoints, tileCenter, type City, type Crosswalk } from '../../core/city';
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
  road: 0x23272f,
  roadLine: 0x7c8aa5,
  building: 0x4b5563,
  buildingEdge: 0x111827,
  buildingRoof: 0x64748b,
  window: 0xfde68a,
  windowDark: 0x334155,
  bullet: 0xfde047,
  marker: 0x22d3ee,
  ammo: 0xfacc15,
  water: 0x0f4c81,
  bridge: 0x64748b,
  sidewalk: 0x9ca3af,
  crosswalk: 0xf8fafc,
  parking: 0xe5e7eb,
  corpse: 0x3f1d1d,
  blood: 0x991b1b,
  lightRed: 0xef4444,
  lightGreen: 0x22c55e,
  dusk: 0x0f172a,
  mmBg: 0x0b0f17,
  mmRoad: 0x334155,
  mmBuilding: 0x1e293b,
  mmPlayer: 0x39ff14,
  mmPolice: 0x3b82f6,
  mmTarget: 0x22d3ee,
  mmAmmo: 0xfacc15,
  mmCorpse: 0xef4444,
};

function safeStorage(): KeyValueStore {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* fall through */
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
  };
}

const CITY_SPEC = {
  cols: 80,
  rows: 80,
  tile: 64,
  block: 5,
  margin: 18,
  river: { startCol: 37, width: 4 },
};
const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 5;
const PLAYER_SIZE = 14;
const PED_SIZE = 10;
const MINIMAP_SIZE = 168;
const ANNOUNCE_SECONDS = 3.2;

interface CorpseSprite {
  id: number;
  body: Phaser.GameObjects.Ellipse;
  blood: Phaser.GameObjects.Ellipse;
}

interface AmbulanceSprite {
  id: number;
  sprite: Phaser.GameObjects.Image;
}

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
  private corpseSprites: CorpseSprite[] = [];
  private ambulanceSprites: AmbulanceSprite[] = [];
  private missionMarker!: Phaser.GameObjects.Arc;
  private focusPoint!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Text;
  private bustedText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private pauseMenu!: Phaser.GameObjects.Text;
  private nightOverlay!: Phaser.GameObjects.Rectangle;
  private lightOverlay!: Phaser.GameObjects.Graphics;
  private trafficLightOverlay!: Phaser.GameObjects.Graphics;

  private minimapBg!: Phaser.GameObjects.Image;
  private minimapDots!: Phaser.GameObjects.Graphics;

  private accumulator = 0;
  private pausedGame = false;
  private readonly store: KeyValueStore = safeStorage();
  private savedBest = 0;
  private readonly sfx = new Sound();
  private prevBullets = 0;
  private prevKills = 0;
  private prevStatus: 'playing' | 'busted' | 'wasted' = 'playing';
  private prevMissionComplete = false;
  private prevMissionId: string | null = null;
  private prevObjective = '';
  private prevWrecks = 0;
  private announceRemaining = 0;
  private pauseKey?: Phaser.Input.Keyboard.Key;
  private newGameKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super('City');
  }

  create(): void {
    this.city = buildCity(CITY_SPEC);
    createGameTextures(this);
    this.buildWorld();
    this.drawCity();
    this.createEntitySprites();
    this.setupCamera();
    this.createHud();
    this.createMinimap();
    this.createOverlay();

    this.input_ = new KeyboardInput(this.input.keyboard!);
    this.pauseKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.newGameKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    this.input.keyboard?.once('keydown', () => this.sfx.resume());
    this.scale.on('resize', () => this.layoutUi());
    this.layoutUi();
  }

  private buildWorld(): void {
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
      walls: [...this.city.buildings, ...bridgeBarriers(this.city)],
      bestScore: this.savedBest,
      missions: this.buildCampaign(),
      loopMissions: true,
    });
  }

  private spawnTraffic(): { cars: Car[]; drivers: (TrafficAI | null)[] } {
    const { spec } = this.city;
    const cars: Car[] = [];
    const drivers: (TrafficAI | null)[] = [];

    this.city.parkingSpots.slice(0, 32).forEach((spot, i) => {
      cars.push({ pos: spot.pos, heading: spot.heading, speed: 0, radius: 14, parked: true });
      drivers.push(null);
      if (i % 5 === 0) {
        const cruise = tileCenter(spec, spec.block + (i % 3) * spec.block, spec.block * 2 + (i % 4) * spec.block);
        cars.push({ pos: cruise, heading: 0, speed: 0, radius: 14 });
        drivers.push({ dir: vec2(i % 2 === 0 ? 1 : -1, 0), style: 'civilian', wait: 0 });
      }
    });

    for (let tx = spec.block; tx < spec.cols; tx += spec.block) {
      if (!this.city.isRoad(tx, spec.block * 2)) continue;
      const dir = tx % (spec.block * 2) === 0 ? vec2(0, 1) : vec2(0, -1);
      const start = tileCenter(spec, tx, spec.block * 2);
      cars.push({ pos: start, heading: Math.atan2(dir.y, dir.x), speed: 0, radius: 14 });
      drivers.push({ dir, style: 'civilian', wait: 0 });
    }
    return { cars, drivers };
  }

  private spawnPedestrians(): Pedestrian[] {
    return this.city.sidewalkNodes.slice(0, 70).map((pos) => ({
      pos,
      heading: 0,
      radius: PED_SIZE / 2,
      state: 'wander',
      target: pos,
    }));
  }

  private policeSpawnPoints(): Vec2[] {
    return edgeRoadSpawnPoints(this.city);
  }

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

  private buildCampaign(): Mission[] {
    const { spec } = this.city;
    const b = spec.block;
    const reach = (x: number, y: number, description: string) => ({
      kind: 'reach' as const,
      description,
      target: tileCenter(spec, x, y),
      radius: 56,
    });
    return [
      createMission({
        id: 'intro',
        title: 'Make a Name',
        objectives: [
          reach(b * 3, b * 2, 'Drive to the marked meetup'),
          { kind: 'eliminate', description: 'Takedown 3 street targets', count: 3 },
        ],
        reward: 1000,
      }),
      createMission({
        id: 'supply',
        title: 'Tooled Up',
        objectives: [
          { kind: 'collect', description: 'Grab 2 ammo crates from around town', count: 2 },
          reach(b * 6, b * 7, 'Deliver the haul to the lockup'),
        ],
        reward: 1500,
      }),
      createMission({
        id: 'bridge-burner',
        title: 'Bridge Burner',
        objectives: [
          reach(40, b * 4, 'Cross the river bridge and make contact'),
          { kind: 'wanted', description: 'Raise a 2-star response on the bridge', stars: 2 },
        ],
        reward: 1700,
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
        objectives: [{ kind: 'eliminate', description: 'Eliminate 8 targets', count: 8 }],
        reward: 5000,
      }),
      createMission({
        id: 'shakedown',
        title: 'Shakedown',
        objectives: [
          reach(b * 8, b * 3, 'Drive to the shakedown point marked on the map'),
          { kind: 'collect', description: 'Escape with 2 ammo crates after the pickup', count: 2 },
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
          { kind: 'eliminate', description: 'Eliminate 4 targets', count: 4 },
          reach(b * 2, b * 8, 'Drive back to the safehouse'),
        ],
        reward: 3200,
      }),
      createMission({
        id: 'river-run',
        title: 'River Run',
        objectives: [
          reach(42, b * 10, 'Take the eastern bridge crossing'),
          { kind: 'survive', description: 'Keep moving for 20s', seconds: 20 },
        ],
        reward: 2600,
      }),
      createMission({
        id: 'crate-job',
        title: 'Crate Job',
        objectives: [
          { kind: 'collect', description: 'Collect 3 ammo crates', count: 3 },
          { kind: 'wanted', description: 'Lose the heat after the pickup', stars: 1 },
        ],
        reward: 2800,
      }),
      createMission({
        id: 'shutdown',
        title: 'Shutdown',
        objectives: [
          reach(b * 11, b * 4, 'Hit the riverside checkpoint'),
          { kind: 'eliminate', description: 'Neutralize 5 defenders', count: 5 },
        ],
        reward: 3600,
      }),
    ];
  }

  private drawCity(): void {
    const { width, height, spec } = this.city;
    this.cameras.main.setBackgroundColor(COLORS.road);

    const g = this.add.graphics();
    g.fillStyle(COLORS.road, 1);
    g.fillRect(0, 0, width, height);

    g.fillStyle(COLORS.water, 1);
    this.city.water.forEach((w) => g.fillRect(w.x, w.y, w.w, w.h));

    g.fillStyle(COLORS.bridge, 1);
    this.city.bridges.forEach((b) => g.fillRect(b.x, b.y, b.w, b.h));

    g.lineStyle(2, COLORS.roadLine, 0.55);
    for (let tx = 0; tx <= spec.cols; tx += spec.block) {
      const x = tx * spec.tile + spec.tile / 2;
      g.lineBetween(x, 0, x, height);
    }
    for (let ty = 0; ty <= spec.rows; ty += spec.block) {
      const y = ty * spec.tile + spec.tile / 2;
      g.lineBetween(0, y, width, y);
    }

    g.lineStyle(2, COLORS.parking, 0.5);
    this.city.parkingSpots.forEach((spot) => {
      g.strokeRect(spot.pos.x - 10, spot.pos.y - 18, 20, 36);
    });

    const shades = [0x3f4654, 0x4b5563, 0x434b59, 0x515b6b, 0x3a4150];
    this.city.buildings.forEach((b, i) => {
      g.fillStyle(shades[i % shades.length], 1);
      g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle(COLORS.buildingRoof, 1);
      g.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      g.lineStyle(2, COLORS.buildingEdge, 1);
      g.strokeRect(b.x, b.y, b.w, b.h);
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

    g.fillStyle(COLORS.sidewalk, 0.8);
    this.city.sidewalks.forEach((s) => g.fillRect(s.x, s.y, s.w, s.h));

    g.fillStyle(COLORS.crosswalk, 0.9);
    this.city.crosswalks.forEach((crosswalk, i) => {
      this.drawCrosswalk(g, crosswalk, i);
    });

    g.lineStyle(2, 0xcbd5e1, 0.9);
    this.city.bridges.forEach((bridge) => {
      g.lineBetween(bridge.x, bridge.y + 6, bridge.x + bridge.w, bridge.y + 6);
      g.lineBetween(bridge.x, bridge.y + bridge.h - 6, bridge.x + bridge.w, bridge.y + bridge.h - 6);
    });
  }

  private drawCrosswalk(g: Phaser.GameObjects.Graphics, crosswalk: Crosswalk, index: number): void {
    const stripes = 5;
    if (crosswalk.horizontal) {
      const stripeW = crosswalk.rect.w / stripes;
      for (let i = 0; i < stripes; i += 2) {
        g.fillRect(crosswalk.rect.x + i * stripeW, crosswalk.rect.y, stripeW * 0.7, crosswalk.rect.h);
      }
    } else {
      const stripeH = crosswalk.rect.h / stripes;
      for (let i = 0; i < stripes; i += 2) {
        g.fillRect(crosswalk.rect.x, crosswalk.rect.y + i * stripeH, crosswalk.rect.w, stripeH * 0.7);
      }
    }
    if (index % 6 === 0) {
      g.fillStyle(0xffffff, 0.15);
      g.fillCircle(crosswalk.center.x, crosswalk.center.y, 3);
    }
  }

  private createEntitySprites(): void {
    this.missionMarker = this.add.circle(0, 0, 52, COLORS.marker, 0.12).setStrokeStyle(3, COLORS.marker).setDepth(3).setVisible(false);

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

  private setupCamera(): void {
    const f = this.world.focus;
    this.focusPoint = this.add.rectangle(f.x, f.y, 1, 1, 0x000000, 0);
    this.cameras.main.setBounds(0, 0, this.city.width, this.city.height);
    this.cameras.main.startFollow(this.focusPoint, true, 0.12, 0.12);
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

    this.pauseMenu = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#f8fafc',
        align: 'center',
        backgroundColor: '#020617d0',
        padding: { x: 24, y: 18 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2100)
      .setVisible(false);
  }

  private createOverlay(): void {
    this.nightOverlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, COLORS.dusk, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1300);
    this.lightOverlay = this.add.graphics().setDepth(1301);
    this.trafficLightOverlay = this.add.graphics().setDepth(7);
  }

  private createMinimap(): void {
    const scale = MINIMAP_SIZE / this.city.width;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(COLORS.mmRoad, 1);
    g.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    g.fillStyle(COLORS.water, 1);
    this.city.water.forEach((b) => g.fillRect(b.x * scale, b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale)));
    g.fillStyle(COLORS.mmBuilding, 1);
    for (const b of this.city.buildings) {
      g.fillRect(b.x * scale, b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
    }
    g.generateTexture('minimap-bg', MINIMAP_SIZE, MINIMAP_SIZE);
    g.destroy();

    this.minimapBg = this.add.image(0, 0, 'minimap-bg').setOrigin(0, 0).setScrollFactor(0).setDepth(1400).setAlpha(0.85);
    this.minimapDots = this.add.graphics().setScrollFactor(0).setDepth(1401);
  }

  private layoutUi(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const zoom = Phaser.Math.Clamp(Math.min(width / 960, height / 640), 0.65, 1.15);
    this.cameras.main.setZoom(zoom);
    this.hud.setPosition(10, 10);
    this.banner.setPosition(width / 2, 84);
    this.bustedText.setPosition(width / 2, height / 2);
    this.pauseMenu.setPosition(width / 2, height / 2);
    this.nightOverlay.setSize(width, height);
  }

  private syncBullets(): void {
    this.world.bullets.forEach((b, i) => {
      let sprite = this.bulletSprites[i];
      if (!sprite) {
        sprite = this.add.rectangle(b.pos.x, b.pos.y, 7, 3, COLORS.bullet).setDepth(8);
        this.bulletSprites[i] = sprite;
      }
      sprite.setVisible(true).setPosition(b.pos.x, b.pos.y).setRotation(Math.atan2(b.velocity.y, b.velocity.x));
    });
    for (let i = this.world.bullets.length; i < this.bulletSprites.length; i++) this.bulletSprites[i].setVisible(false);
  }

  private syncCorpses(): void {
    this.world.corpses.forEach((corpse) => {
      let sprite = this.corpseSprites.find((s) => s.id === corpse.id);
      if (!sprite) {
        sprite = {
          id: corpse.id,
          blood: this.add.ellipse(corpse.pos.x, corpse.pos.y, 22, 12, COLORS.blood, 0.8).setDepth(4.5),
          body: this.add.ellipse(corpse.pos.x, corpse.pos.y, 12, 8, COLORS.corpse, 1).setDepth(5),
        };
        this.corpseSprites.push(sprite);
      }
      sprite.blood.setVisible(true).setPosition(corpse.pos.x, corpse.pos.y + 4);
      sprite.body.setVisible(true).setPosition(corpse.pos.x, corpse.pos.y);
    });
    this.corpseSprites = this.corpseSprites.filter((sprite) => {
      const live = this.world.corpses.some((corpse) => corpse.id === sprite.id);
      if (!live) {
        sprite.body.destroy();
        sprite.blood.destroy();
      }
      return live;
    });
  }

  private syncAmbulances(): void {
    this.world.ambulances.forEach((ambulance) => {
      let sprite = this.ambulanceSprites.find((s) => s.id === ambulance.id);
      if (!sprite) {
        sprite = { id: ambulance.id, sprite: this.add.image(ambulance.car.pos.x, ambulance.car.pos.y, TEX.ambulanceCar).setDepth(6) };
        this.ambulanceSprites.push(sprite);
      }
      sprite.sprite.setVisible(true).setPosition(ambulance.car.pos.x, ambulance.car.pos.y).setRotation(ambulance.car.heading);
    });
    this.ambulanceSprites = this.ambulanceSprites.filter((sprite) => {
      const live = this.world.ambulances.some((ambulance) => ambulance.id === sprite.id);
      if (!live) sprite.sprite.destroy();
      return live;
    });
  }

  private syncTrafficLights(): void {
    const g = this.trafficLightOverlay;
    g.clear();
    const t = this.world.elapsedSeconds;
    this.city.trafficLights.forEach((light) => {
      const center = tileCenter(this.city.spec, light.tx, light.ty);
      const state = this.city.lightState(light.tx, light.ty, t);
      g.fillStyle(state === 'ns' ? COLORS.lightGreen : COLORS.lightRed, 1);
      g.fillCircle(center.x - 10, center.y - 10, 3);
      g.fillStyle(state === 'ew' ? COLORS.lightGreen : COLORS.lightRed, 1);
      g.fillCircle(center.x + 10, center.y + 10, 3);
    });
  }

  private syncDayNight(): void {
    const phase = this.world.timeOfDay;
    const darkness = phase < 0.25 || phase > 0.75 ? 0.35 : Math.max(0, Math.abs(phase - 0.5) - 0.18) * 0.9;
    this.nightOverlay.setAlpha(darkness);
    this.lightOverlay.clear();
    if (darkness <= 0.05) return;
    this.lightOverlay.fillStyle(0xfffbeb, 0.15 + darkness * 0.2);
    this.world.cars.forEach((car) => {
      if ((car.wreckTimer ?? 0) > 0) return;
      const front = vec2(car.pos.x + Math.cos(car.heading) * 16, car.pos.y + Math.sin(car.heading) * 16);
      this.lightOverlay.fillCircle(front.x, front.y, 8);
    });
    this.world.police.forEach((cop, i) => {
      if (cop.kind !== 'car' || !cop.alert) return;
      const blink = (Math.floor(this.world.elapsedSeconds * 8) + i) % 2 === 0;
      this.lightOverlay.fillStyle(blink ? 0xef4444 : 0x60a5fa, 0.6);
      this.lightOverlay.fillCircle(cop.pos.x - 5, cop.pos.y, 4);
      this.lightOverlay.fillStyle(blink ? 0x60a5fa : 0xef4444, 0.6);
      this.lightOverlay.fillCircle(cop.pos.x + 5, cop.pos.y, 4);
    });
  }

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
    this.world.ammoPickups.forEach((a) => g.fillRect(ox + a.pos.x * scale - 1, oy + a.pos.y * scale - 1, 3, 3));

    g.fillStyle(COLORS.mmPolice, 1);
    this.world.police.forEach((cop) => g.fillCircle(ox + cop.pos.x * scale, oy + cop.pos.y * scale, 2));

    g.fillStyle(COLORS.mmCorpse, 1);
    this.world.corpses.forEach((corpse) => g.fillRect(ox + corpse.pos.x * scale - 1, oy + corpse.pos.y * scale - 1, 2, 2));

    g.fillStyle(COLORS.mmPlayer, 1);
    g.fillCircle(ox + this.world.focus.x * scale, oy + this.world.focus.y * scale, 3);
  }

  update(_time: number, deltaMs: number): void {
    if (this.newGameKey && Phaser.Input.Keyboard.JustDown(this.newGameKey)) {
      this.scene.restart();
      return;
    }
    if (this.pauseKey && Phaser.Input.Keyboard.JustDown(this.pauseKey)) this.pausedGame = !this.pausedGame;

    const controls = this.input_.read();
    const dt = deltaMs / 1000;

    if (!this.pausedGame) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < MAX_SUBSTEPS) {
        this.world.tick(controls, FIXED_STEP);
        this.accumulator -= FIXED_STEP;
        steps += 1;
      }
    }

    this.syncSprites();
    this.syncMinimap();
    this.syncTrafficLights();
    this.syncDayNight();
    this.handleEvents();

    if (this.announceRemaining > 0) {
      this.announceRemaining -= dt;
      this.banner.setPosition(this.scale.width / 2, 84);
      if (this.announceRemaining <= 0) this.banner.setVisible(false);
    }
  }

  private handleEvents(): void {
    const w = this.world;
    if (w.score.best > this.savedBest) this.savedBest = saveHighScore(this.store, w.score.best);
    if (w.bullets.length > this.prevBullets) this.sfx.shot();
    if (w.kills > this.prevKills) this.sfx.hit();
    const wrecks = w.cars.filter((car) => (car.wreckTimer ?? 0) > 0).length;
    if (wrecks > this.prevWrecks) this.sfx.explosion();
    if (w.police.some((cop) => cop.kind === 'car' && cop.alert)) this.sfx.siren();
    if (w.status !== 'playing' && this.prevStatus === 'playing') this.sfx.fail();

    const missionId = w.mission?.id ?? null;
    const objective = w.missionObjective?.description ?? '';
    if (w.missionComplete && !this.prevMissionComplete) {
      this.sfx.fanfare();
      this.showBanner('MISSION DECK REFRESHED');
    } else if (missionId !== this.prevMissionId) {
      if (this.prevMissionId !== null) this.sfx.fanfare();
      if (w.mission) this.showBanner(`NEW MISSION\n${w.mission.title}\n${objective}`);
    } else if (objective !== '' && objective !== this.prevObjective) {
      this.showBanner(objective);
    }

    this.prevBullets = w.bullets.length;
    this.prevKills = w.kills;
    this.prevStatus = w.status;
    this.prevMissionComplete = w.missionComplete;
    this.prevMissionId = missionId;
    this.prevObjective = objective;
    this.prevWrecks = wrecks;
  }

  private showBanner(text: string): void {
    this.banner.setText(text).setVisible(true);
    this.announceRemaining = ANNOUNCE_SECONDS;
  }

  private syncSprites(): void {
    this.world.cars.forEach((car, i) => {
      const wrecked = (car.wreckTimer ?? 0) > 0;
      const texture = i === this.world.drivingCarIndex ? TEX.playerCar : car.kind === 'ambulance' ? TEX.ambulanceCar : TEX.npcCar;
      this.carSprites[i].setTexture(texture).setPosition(car.pos.x, car.pos.y).setRotation(car.heading).setVisible(true);
      this.carSprites[i].setTint(wrecked ? 0xf97316 : 0xffffff).setAlpha(wrecked ? 0.75 : 1);
    });

    this.pedSprites.forEach((sprite, i) => {
      const ped = this.world.pedestrians[i];
      if (ped) sprite.setVisible(true).setPosition(ped.pos.x, ped.pos.y);
      else sprite.setVisible(false);
    });

    for (const { sprite, pickup } of this.ammoSprites) sprite.setVisible(this.world.ammoPickups.includes(pickup));

    this.world.police.forEach((cop, i) => {
      let sprite = this.policeSprites[i];
      if (!sprite) {
        sprite = this.add.image(cop.pos.x, cop.pos.y, TEX.policeFoot).setDepth(6);
        this.policeSprites[i] = sprite;
      }
      sprite.setTexture(cop.kind === 'car' ? TEX.policeCar : TEX.policeFoot).setVisible(true).setPosition(cop.pos.x, cop.pos.y).setRotation(cop.heading);
    });
    for (let i = this.world.police.length; i < this.policeSprites.length; i++) this.policeSprites[i].setVisible(false);

    this.syncBullets();
    this.syncCorpses();
    this.syncAmbulances();

    const objective = this.world.missionObjective;
    if (objective && objective.kind === 'reach') this.missionMarker.setVisible(true).setPosition(objective.target.x, objective.target.y);
    else this.missionMarker.setVisible(false);

    const p = this.world.player;
    this.playerSprite.setPosition(p.pos.x, p.pos.y).setRotation(p.angle).setVisible(!this.world.isDriving);
    const focus = this.world.focus;
    this.focusPoint.setPosition(focus.x, focus.y);
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

    this.pauseMenu
      .setVisible(this.pausedGame)
      .setText('PAUSED\n\nPress P to resume\nPress N for a new game');
  }

  private hudText(): string {
    const w = this.world;
    const stars = '★'.repeat(w.wantedStars) || '—';
    const hp = `${Math.ceil(w.health.current)}/${w.health.max}`;
    const money = w.score.best > 0 ? `$${w.score.current}  (best $${w.score.best})` : `$${w.score.current}`;
    const speed = w.drivingCar ? Math.round(Math.abs(w.drivingCar.speed)) : 0;
    const mission = w.mission
      ? `▶ ${w.mission.title}: ${w.missionObjective?.description ?? ''}${w.missionProgress ? ` (${w.missionProgress})` : ''}`
      : '▶ Deck looping — new jobs keep coming';
    const ammo = w.weapon.ammo <= 4 ? `Pistol ${w.weapon.ammo}  ⚠ LOW — grab a crate` : `Pistol ${w.weapon.ammo}`;
    const status = w.isDriving ? `DRIVING ${speed}  ·  WASD steer · Space exit · F shoot · P pause` : 'ON FOOT  ·  WASD move · Space car · F shoot · P pause';
    const cycle = w.timeOfDay < 0.25 || w.timeOfDay > 0.75 ? 'Night' : w.timeOfDay < 0.5 ? 'Morning' : 'Day';
    return [`WANTED ${stars}    HP ${hp}    ${cycle}`, `${money}    ${ammo}`, mission, status, 'N = new game'].filter(Boolean).join('\n');
  }
}
