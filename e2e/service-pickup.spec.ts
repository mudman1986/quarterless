import { test, expect, type Page } from '@playwright/test';
import { TEX } from '../src/game/art/textures';
import { buildCity, tileCenter } from '../src/core/city';
import { CITY_SPEC } from '../src/game/citySpec';

interface Vec2 {
  x: number;
  y: number;
}

interface CorpseProbe {
  pos: Vec2;
  offscreenFor: number;
  inFrameFor: number;
}

interface PedestrianProbe {
  pos: Vec2;
  heading?: number;
  radius?: number;
  state?: string;
  target?: Vec2;
  returningTo?: Vec2;
  uniform?: 'medic' | 'towWorker';
  policeSuspectId?: number;
}

interface CarProbe {
  pos: Vec2;
  heading: number;
  speed: number;
  radius: number;
}

interface ServiceProbe {
  pos: Vec2;
  heading: number;
  radius: number;
  dir: Vec2;
  target: Vec2;
  job?: Vec2;
  phase: 'approach' | 'collect' | 'return' | 'depart';
  crew: Vec2 | null;
  pickupElapsed: number;
  age: number;
  speed: number;
  blocked: number;
  health: number;
}

interface TowProbe extends ServiceProbe {
  targetCar: number;
}

interface PlayerServiceMissionProbe {
  id: number;
  kind: 'police' | 'ambulance' | 'tow';
  reward: number;
  stage?: 'pickup' | 'return';
  suspectId?: number;
  pickup?: Vec2;
  targetCar?: number;
  returnTo?: Vec2;
}

interface RuntimeWorld {
  player: { pos: Vec2; angle: number };
  focus: Vec2;
  status: string;
  health: { current: number; max: number };
  wanted: { heat: number };
  score: { current: number };
  pedestrians: PedestrianProbe[];
  police: unknown[];
  bullets: unknown[];
  policeBullets: unknown[];
  explosions: unknown[];
  corpses: CorpseProbe[];
  cars: CarProbe[];
  wreckedCars: boolean[];
  towedCars: boolean[];
  carDrivers: ({ dir: Vec2 } | null)[];
  towDispatchCooldowns: number[];
  ambulance: ServiceProbe | null;
  tows: TowProbe[];
  drivingCarIndex: number | null;
  isDriving: boolean;
  serviceMission: PlayerServiceMissionProbe | null;
  serviceTarget: Vec2 | null;
  carKind(index: number): string;
  tick(
    controls: {
      up: boolean;
      down: boolean;
      left: boolean;
      right: boolean;
      action: boolean;
      confirm: boolean;
      fire: boolean;
    },
    dt: number,
  ): void;
}

interface GameProbe {
  scene: {
    getScene(key: string): {
      hud: { text: string; visible: boolean };
      serviceMarker: { visible: boolean };
      world: RuntimeWorld;
      pedSprites: Array<{ texture: { key: string } }>;
      syncSprites(): void;
      syncMinimap(): void;
    };
  };
}

type ParkedServiceKind = 'police' | 'ambulance' | 'tow';

interface FacilityProbe {
  kind: 'policeStation' | 'hospital' | 'towYard' | 'taxiDepot';
  roadSpawn: Vec2;
  building: { x: number; y: number; w: number; h: number };
}

interface ParkedServiceCase {
  kind: ParkedServiceKind;
  facilityKind: FacilityProbe['kind'];
  campaignTitle: string;
  genericDescription: string;
  detail: string;
  serviceHud: string;
}

const parkedServiceCases: readonly ParkedServiceCase[] = [
  {
    kind: 'police',
    facilityKind: 'policeStation',
    campaignTitle: 'Patrol Duty',
    genericDescription: 'Steal a patrol car and bust 1 suspect',
    detail: 'Bust the suspect',
    serviceHud: 'POLICE: Bust the suspect',
  },
  {
    kind: 'ambulance',
    facilityKind: 'hospital',
    campaignTitle: 'Hospital Run',
    genericDescription: 'Steal an ambulance and complete 1 recovery',
    detail: 'Recover the body',
    serviceHud: 'AMBULANCE: Recover the body',
  },
  {
    kind: 'tow',
    facilityKind: 'towYard',
    campaignTitle: 'Tow Shift',
    genericDescription: 'Steal a tow truck and complete 1 recovery',
    detail: 'Recover the wreck',
    serviceHud: 'TOW: Recover the wreck',
  },
];

const GAME = '() => window.__game';
const LIVE_CITY = buildCity(CITY_SPEC);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nearestLiveRoadPoint(target: Vec2): Vec2 {
  let best = tileCenter(LIVE_CITY.spec, 0, 0);
  let bestDistance = Infinity;
  for (let tx = 0; tx < LIVE_CITY.spec.cols; tx++) {
    for (let ty = 0; ty < LIVE_CITY.spec.rows; ty++) {
      if (!LIVE_CITY.isRoad(tx, ty)) continue;
      const candidate = tileCenter(LIVE_CITY.spec, tx, ty);
      const candidateDistance = Math.hypot(candidate.x - target.x, candidate.y - target.y);
      if (candidateDistance >= bestDistance) continue;
      best = candidate;
      bestDistance = candidateDistance;
    }
  }
  return best;
}

async function boot(page: Page): Promise<void> {
  await page.goto('/sindicate/');
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Space');
  await page.waitForFunction(GAME);
  await page.waitForTimeout(300);
}

async function seedAmbulanceLoading(page: Page, pickupElapsed = 0): Promise<void> {
  await page.evaluate(({ elapsed }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;

    w.status = 'playing';
    w.health.current = w.health.max;
    w.wanted.heat = 0;
    w.pedestrians = [];
    w.police = [];
    w.bullets = [];
    w.policeBullets = [];
    w.explosions = [];
    w.ambulance = null;
    w.tows = [];
    w.drivingCarIndex = null;
    for (let i = 0; i < w.cars.length; i++) {
      w.cars[i] = { ...w.cars[i], pos: { x: 4000 + i * 24, y: 4000 }, heading: 0, speed: 0 };
      w.wreckedCars[i] = false;
      w.towedCars[i] = false;
      w.carDrivers[i] = null;
      if (i < w.towDispatchCooldowns.length) w.towDispatchCooldowns[i] = 0;
    }

    const parked = { x: w.focus.x + 40, y: w.focus.y };
    const body = { x: parked.x + 48, y: parked.y };
    w.player.pos = { ...parked };
    w.player.angle = 0;
    w.corpses = [{ pos: body, offscreenFor: 0, inFrameFor: 0 }];
    w.ambulance = {
      pos: parked,
      heading: 0,
      radius: 14,
      dir: { x: 1, y: 0 },
      target: body,
      phase: 'collect',
      crew: body,
      pickupElapsed: elapsed,
      age: 0,
      speed: 0,
      blocked: 0,
      health: 60,
    };
  }, { elapsed: pickupElapsed });
}

async function seedTowLoading(page: Page, pickupElapsed = 0): Promise<void> {
  await page.evaluate(({ elapsed }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;

    w.status = 'playing';
    w.health.current = w.health.max;
    w.wanted.heat = 0;
    w.pedestrians = [];
    w.police = [];
    w.bullets = [];
    w.policeBullets = [];
    w.explosions = [];
    w.corpses = [];
    w.ambulance = null;
    w.tows = [];
    w.drivingCarIndex = null;
    for (let i = 0; i < w.cars.length; i++) {
      w.cars[i] = { ...w.cars[i], pos: { x: 4000 + i * 24, y: 4000 }, heading: 0, speed: 0 };
      w.wreckedCars[i] = false;
      w.towedCars[i] = false;
      w.carDrivers[i] = null;
      if (i < w.towDispatchCooldowns.length) w.towDispatchCooldowns[i] = 0;
    }

    const parked = { x: w.focus.x + 40, y: w.focus.y };
    const wreck = { x: parked.x + 48, y: parked.y };
    w.player.pos = { ...parked };
    w.player.angle = 0;
    w.cars[0] = { pos: wreck, heading: 0, speed: 0, radius: 12 };
    w.wreckedCars[0] = true;
    w.towedCars[0] = false;
    w.carDrivers[0] = null;
    w.towDispatchCooldowns[0] = 0;
    w.tows = [
      {
        pos: parked,
        heading: 0,
        radius: 14,
        dir: { x: 1, y: 0 },
        target: wreck,
        targetCar: 0,
        phase: 'collect',
        crew: wreck,
        pickupElapsed: elapsed,
        age: 0,
        speed: 0,
        blocked: 0,
        health: 60,
      },
    ];
  }, { elapsed: pickupElapsed });
}

async function seedWideSidewalkCorpse(page: Page): Promise<void> {
  const body = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    const nearFocus =
      w.pedestrians
        .filter((ped) => {
          const dx = ped.pos.x - w.focus.x;
          const dy = ped.pos.y - w.focus.y;
          const d = Math.hypot(dx, dy);
          return d >= 128 && d <= 640;
        })
        .sort(
          (a, b) =>
            Math.hypot(a.pos.x - w.focus.x, a.pos.y - w.focus.y) -
            Math.hypot(b.pos.x - w.focus.x, b.pos.y - w.focus.y),
        )[0] ?? w.pedestrians[0];
    if (!nearFocus) throw new Error('expected a live sidewalk pedestrian to seed a corpse from');

    return nearFocus.pos;
  });
  const approach = nearestLiveRoadPoint(body);

  await page.evaluate(({ bodyPos, approachPos }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;

    w.status = 'playing';
    w.health.current = w.health.max;
    w.wanted.heat = 0;
    w.police = [];
    w.bullets = [];
    w.policeBullets = [];
    w.explosions = [];
    w.tows = [];
    w.drivingCarIndex = null;
    w.player.pos = { x: 64, y: 64 };
    w.player.angle = 0;
    w.pedestrians = [];
    w.corpses = [{ pos: bodyPos, offscreenFor: 0, inFrameFor: 3 }];

    for (let i = 0; i < w.cars.length; i++) {
      w.cars[i] = { ...w.cars[i], pos: { x: 4000 + i * 24, y: 4000 }, heading: 0, speed: 0 };
      w.wreckedCars[i] = false;
      w.towedCars[i] = false;
      w.carDrivers[i] = null;
      if (i < w.towDispatchCooldowns.length) w.towDispatchCooldowns[i] = 0;
    }

    w.ambulance = {
      pos: approachPos,
      heading: 0,
      radius: 14,
      dir: { x: 1, y: 0 },
      target: approachPos,
      job: bodyPos,
      phase: 'approach',
      crew: null,
      pickupElapsed: 0,
      age: 0,
      speed: 0,
      blocked: 0,
      health: 60,
    };
  }, { bodyPos: body, approachPos: approach });
}

async function seedPolicePatrolMission(page: Page): Promise<{ patrol: Vec2; suspectA: Vec2; suspectB: Vec2 }> {
  const patrol = tileCenter(LIVE_CITY.spec, LIVE_CITY.spec.block, LIVE_CITY.spec.block);
  const suspectA = tileCenter(LIVE_CITY.spec, LIVE_CITY.spec.block * 2, LIVE_CITY.spec.block);
  const suspectB = tileCenter(LIVE_CITY.spec, LIVE_CITY.spec.block * 2, LIVE_CITY.spec.block * 2);
  const patrolHome = tileCenter(LIVE_CITY.spec, LIVE_CITY.spec.block * 3, LIVE_CITY.spec.block);

  await page.evaluate(({ patrolPos, patrolHomePos, suspectPosA, suspectPosB }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;

    w.status = 'playing';
    w.health.current = w.health.max;
    w.wanted.heat = 0;
    w.score.current = 0;
    w.bullets = [];
    w.policeBullets = [];
    w.explosions = [];
    w.corpses = [];
    w.ambulance = null;
    w.tows = [];
    w.drivingCarIndex = null;
    for (let i = 0; i < w.cars.length; i++) {
      w.cars[i] = { ...w.cars[i], pos: { x: 4000 + i * 24, y: 4000 }, heading: 0, speed: 0 };
      w.wreckedCars[i] = false;
      w.towedCars[i] = false;
      w.carDrivers[i] = null;
      if (i < w.towDispatchCooldowns.length) w.towDispatchCooldowns[i] = 0;
    }

    w.player.pos = { ...patrolPos };
    w.player.angle = 0;
    w.pedestrians = [
      { pos: suspectPosA, heading: 0, radius: 7, state: 'wander', target: suspectPosA },
      { pos: suspectPosB, heading: 0, radius: 7, state: 'wander', target: suspectPosB },
    ];
    w.police = [{ pos: patrolPos, heading: 0, radius: 14, kind: 'car', home: patrolHomePos, speed: 0, health: 60 }];
  }, { patrolPos: patrol, patrolHomePos: patrolHome, suspectPosA: suspectA, suspectPosB: suspectB });

  return { patrol, suspectA, suspectB };
}

async function seedParkedFacilityServiceRun(page: Page, serviceCase: ParkedServiceCase): Promise<void> {
  await page.evaluate(({ config }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world as RuntimeWorld & {
      city?: { width: number; height: number; facilities: FacilityProbe[] };
      campaign?: {
        missions: Array<{
          id: string;
          title: string;
          objectives: Array<{
            kind: 'service';
            description: string;
            service: ParkedServiceKind;
            count: number;
          }>;
          currentIndex: number;
          status: 'active';
          reward: number;
        }>;
        currentIndex: number;
      } | null;
      objectiveBaseline?: {
        kills: number;
        targetKills: number;
        collected: number;
        elapsed: number;
        serviceCompleted: { police: number; ambulance: number; tow: number };
      };
      completedServiceJobs?: { police: number; ambulance: number; tow: number };
      playerServiceMission?: PlayerServiceMissionProbe | null;
      playerTaxiMission?: unknown | null;
      stolenServiceVehicles?: boolean[];
      prevAction?: boolean;
      prevConfirm?: boolean;
    };

    const facility = w.city?.facilities.find((entry) => entry.kind === config.facilityKind);
    if (!facility || !w.city) throw new Error(`expected a ${config.facilityKind} facility in the live city`);

    let parkedIndex = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < w.cars.length; i++) {
      if (w.carKind(i) !== config.kind) continue;
      const dx = w.cars[i].pos.x - facility.roadSpawn.x;
      const dy = w.cars[i].pos.y - facility.roadSpawn.y;
      const d = Math.hypot(dx, dy);
      if (d >= bestDistance) continue;
      bestDistance = d;
      parkedIndex = i;
    }
    if (parkedIndex < 0) throw new Error(`expected a parked ${config.kind} at the ${config.facilityKind}`);

    const parked = { ...w.cars[parkedIndex].pos };
    const verticalRoad =
      facility.roadSpawn.x < facility.building.x || facility.roadSpawn.x > facility.building.x + facility.building.w;
    const inwardOffset = verticalRoad
      ? { x: 0, y: facility.roadSpawn.y < w.city.height / 2 ? 160 : -160 }
      : { x: facility.roadSpawn.x < w.city.width / 2 ? 160 : -160, y: 0 };
    const jobPos = { x: parked.x + inwardOffset.x, y: parked.y + inwardOffset.y };

    w.status = 'playing';
    w.health.current = w.health.max;
    w.wanted.heat = 0;
    w.score.current = 0;
    w.bullets = [];
    w.policeBullets = [];
    w.explosions = [];
    w.police = [];
    w.corpses = [];
    w.pedestrians = [];
    w.ambulance = null;
    w.tows = [];
    w.drivingCarIndex = null;
    w.player.pos = { ...parked };
    w.player.angle = 0;
    w.playerServiceMission = null;
    w.playerTaxiMission = null;
    w.completedServiceJobs = { police: 0, ambulance: 0, tow: 0 };
    w.stolenServiceVehicles = w.cars.map(() => false);
    w.prevAction = false;
    w.prevConfirm = false;
    w.campaign = {
      missions: [
        {
          id: `parked-${config.kind}`,
          title: config.campaignTitle,
          objectives: [
            {
              kind: 'service',
              description: config.genericDescription,
              service: config.kind,
              count: 1,
            },
          ],
          currentIndex: 0,
          status: 'active',
          reward: 300,
        },
      ],
      currentIndex: 0,
    };
    w.objectiveBaseline = {
      kills: 0,
      targetKills: 0,
      collected: 0,
      elapsed: 0,
      serviceCompleted: { police: 0, ambulance: 0, tow: 0 },
    };

    for (let i = 0; i < w.cars.length; i++) {
      if (i === parkedIndex) continue;
      w.cars[i] = { ...w.cars[i], pos: { x: 5000 + i * 24, y: 5000 }, heading: 0, speed: 0 };
      w.wreckedCars[i] = false;
      w.towedCars[i] = false;
      w.carDrivers[i] = null;
      if (i < w.towDispatchCooldowns.length) w.towDispatchCooldowns[i] = 0;
    }

    w.cars[parkedIndex] = { ...w.cars[parkedIndex], pos: parked, speed: 0 };
    w.wreckedCars[parkedIndex] = false;
    w.towedCars[parkedIndex] = false;
    w.carDrivers[parkedIndex] = null;

    if (config.kind === 'police') {
      w.pedestrians = [{ pos: jobPos, heading: 0, radius: 7, state: 'wander', target: jobPos }];
      return;
    }

    if (config.kind === 'ambulance') {
      w.corpses = [{ pos: jobPos, offscreenFor: 0, inFrameFor: 0 }];
      return;
    }

    const wreckIndex = parkedIndex === 0 ? 1 : 0;
    w.cars[wreckIndex] = { pos: jobPos, heading: 0, speed: 0, radius: 12 };
    w.wreckedCars[wreckIndex] = true;
    w.towedCars[wreckIndex] = false;
    w.carDrivers[wreckIndex] = null;
    if (wreckIndex < w.towDispatchCooldowns.length) w.towDispatchCooldowns[wreckIndex] = 0;
  }, { config: serviceCase });
}

test('ambulance pickup waits 3 seconds before the body is removed', async ({ page }) => {
  await boot(page);
  await seedAmbulanceLoading(page, 2.5);

  let state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return {
      corpses: w.corpses.length,
      phase: w.ambulance?.phase ?? null,
      pickupElapsed: w.ambulance?.pickupElapsed ?? 0,
    };
  });

  expect(state.corpses).toBe(1);
  expect(state.phase).toBe('collect');
  expect(state.pickupElapsed).toBeGreaterThanOrEqual(2.5);

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return w.ambulance?.phase === 'return' && w.corpses.length === 0;
  }, undefined, { timeout: 5000 });

  state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return {
      corpses: w.corpses.length,
      phase: w.ambulance?.phase ?? null,
      pickupElapsed: w.ambulance?.pickupElapsed ?? 0,
    };
  });

  expect(state.corpses).toBe(0);
  expect(state.phase).toBe('return');
});

test('tow pickup waits 3 seconds before the wreck is hooked', async ({ page }) => {
  await boot(page);
  await seedTowLoading(page, 2.5);

  let state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return {
      towed: w.towedCars[0],
      phase: w.tows[0]?.phase ?? null,
      pickupElapsed: w.tows[0]?.pickupElapsed ?? 0,
    };
  });

  expect(state.towed).toBe(false);
  expect(state.phase).toBe('collect');
  expect(state.pickupElapsed).toBeGreaterThanOrEqual(2.5);

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return w.tows[0]?.phase === 'return' && w.towedCars[0] === true;
  }, undefined, { timeout: 5000 });

  state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return {
      towed: w.towedCars[0],
      phase: w.tows[0]?.phase ?? null,
      pickupElapsed: w.tows[0]?.pickupElapsed ?? 0,
    };
  });

  expect(state.towed).toBe(true);
  expect(state.phase).toBe('return');
});

test('the player can steal the parked ambulance during the loading window', async ({ page }) => {
  await boot(page);
  await seedAmbulanceLoading(page, 1);

  await page.locator('#game canvas').click();
  await page.keyboard.press('Space');

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return w.isDriving && w.drivingCarIndex !== null && w.carKind(w.drivingCarIndex) === 'ambulance';
  }, undefined, { timeout: 1000 });

  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      corpses: w.corpses.length,
      hasAmbulance: w.ambulance !== null,
      drivingKind: w.drivingCarIndex === null ? null : w.carKind(w.drivingCarIndex),
      wantedHeat: w.wanted.heat,
      police: w.police.length,
      returningCrew: w.pedestrians.length,
      crewHeadingHome: w.pedestrians[0]?.returningTo !== undefined,
      crewUniform: w.pedestrians[0]?.uniform ?? null,
      crewTexture: scene.pedSprites[0]?.texture.key ?? null,
    };
  });

  expect(state.drivingKind).toBe('ambulance');
  expect(state.hasAmbulance).toBe(false);
  expect(state.corpses).toBe(1);
  expect(state.wantedHeat).toBeGreaterThan(0);
  expect(state.police).toBeGreaterThan(0);
  expect(state.returningCrew).toBe(1);
  expect(state.crewHeadingHome).toBe(true);
  expect(state.crewUniform).toBe('medic');
  expect(state.crewTexture).toBe(TEX.medic);
});

test('the player can steal the parked tow truck during the loading window', async ({ page }) => {
  await boot(page);
  await seedTowLoading(page, 1);

  await page.locator('#game canvas').click();
  await page.keyboard.press('Space');

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return w.isDriving && w.drivingCarIndex !== null && w.carKind(w.drivingCarIndex) === 'tow';
  }, undefined, { timeout: 1000 });

  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      tows: w.tows.length,
      towed: w.towedCars[0],
      drivingKind: w.drivingCarIndex === null ? null : w.carKind(w.drivingCarIndex),
      wantedHeat: w.wanted.heat,
      police: w.police.length,
      returningCrew: w.pedestrians.length,
      crewHeadingHome: w.pedestrians[0]?.returningTo !== undefined,
      crewUniform: w.pedestrians[0]?.uniform ?? null,
      crewTexture: scene.pedSprites[0]?.texture.key ?? null,
    };
  });

  expect(state.drivingKind).toBe('tow');
  expect(state.tows).toBe(0);
  expect(state.towed).toBe(false);
  expect(state.wantedHeat).toBeGreaterThan(0);
  expect(state.police).toBeGreaterThan(0);
  expect(state.returningCrew).toBe(1);
  expect(state.crewHeadingHome).toBe(true);
  expect(state.crewUniform).toBe('towWorker');
  expect(state.crewTexture).toBe(TEX.towWorker);
});

test('stealing a patrol car starts and completes a live suspect bust side mission', async ({ page }) => {
  await boot(page);
  const { patrol, suspectA } = await seedPolicePatrolMission(page);

  await page.locator('#game canvas').click();
  await page.evaluate(({ patrolPos }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    const patrolWorld = w as RuntimeWorld & {
      appendVehicleSlot(
        car: CarProbe,
        kind: 'police',
        opts: { health: number; wrecked?: boolean; respawnsAtTow?: boolean },
      ): number;
      startPlayerPoliceMission(from: Vec2): PlayerServiceMissionProbe | null;
      playerServiceMission: PlayerServiceMissionProbe | null;
      wanted: { heat: number };
      player: { pos: Vec2; angle: number };
      police: unknown[];
    };
    patrolWorld.player.pos = { ...patrolPos };
    patrolWorld.police = [];
    patrolWorld.drivingCarIndex = patrolWorld.appendVehicleSlot(
      { pos: patrolPos, heading: 0, speed: 0, radius: 14 },
      'police',
      { health: 60, respawnsAtTow: false },
    );
    patrolWorld.wanted.heat = 250;
    patrolWorld.playerServiceMission = patrolWorld.startPlayerPoliceMission(patrolPos);
    scene.syncSprites();
    scene.syncMinimap();
  }, { patrolPos: patrol });

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return w.isDriving &&
      w.drivingCarIndex !== null &&
      w.carKind(w.drivingCarIndex) === 'police' &&
      w.serviceMission?.kind === 'police' &&
      w.serviceTarget !== null;
  }, undefined, { timeout: 2000 });

  const start = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      drivingKind: w.drivingCarIndex === null ? null : w.carKind(w.drivingCarIndex),
      mission: w.serviceMission,
      target: w.serviceTarget,
      score: w.score.current,
      suspectCount: w.pedestrians.filter((ped) => ped.policeSuspectId !== undefined).length,
      hud: scene.hud.text,
      markerVisible: scene.serviceMarker.visible,
    };
  });

  expect(start.drivingKind).toBe('police');
  expect(start.mission?.kind).toBe('police');
  expect(start.target).toEqual(suspectA);
  expect(start.suspectCount).toBe(1);
  expect(start.markerVisible).toBe(true);
  expect(start.hud).toContain('POLICE: Bust the suspect');

  await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    w.police = [];
    w.wanted.heat = 0;
    if (w.drivingCarIndex === null) throw new Error('expected to be driving the stolen patrol car');
    if (!w.serviceTarget) throw new Error('expected an active police service target');
    w.cars[w.drivingCarIndex] = { ...w.cars[w.drivingCarIndex], pos: w.serviceTarget, speed: 0 };
    w.tick(
      { up: false, down: false, left: false, right: false, action: false, confirm: false, fire: false },
      1 / 60,
    );
    scene.syncSprites();
    scene.syncMinimap();
  });

  const completed = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      mission: w.serviceMission,
      score: w.score.current,
      remainingSuspects: w.pedestrians.filter((ped) => ped.policeSuspectId !== undefined).length,
      markerVisible: scene.serviceMarker.visible,
    };
  });

  expect(completed.score).toBe(start.mission!.reward);
  expect(completed.mission?.kind).toBe('police');
  expect(completed.mission?.id).not.toBe(start.mission?.id);
  expect(completed.remainingSuspects).toBe(1);
  expect(completed.markerVisible).toBe(true);
});

test('stealing an ambulance starts and completes a live corpse recovery side mission', async ({ page }) => {
  await boot(page);
  await seedAmbulanceLoading(page, 1);

  await page.locator('#game canvas').click();
  await page.keyboard.press('Space');

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return w.isDriving &&
      w.drivingCarIndex !== null &&
      w.carKind(w.drivingCarIndex) === 'ambulance' &&
      w.serviceMission?.kind === 'ambulance' &&
      w.serviceTarget !== null &&
      scene.serviceMarker.visible &&
      scene.hud.text.includes('AMBULANCE: Recover the body');
  }, undefined, { timeout: 2000 });

  const start = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      corpses: w.corpses.length,
      mission: w.serviceMission,
      target: w.serviceTarget,
      score: w.score.current,
      hud: scene.hud.text,
      markerVisible: scene.serviceMarker.visible,
    };
  });

  expect(start.corpses).toBe(1);
  expect(start.mission?.kind).toBe('ambulance');
  expect(start.target).not.toBeNull();
  expect(start.markerVisible).toBe(true);
  expect(start.hud).toContain('AMBULANCE: Recover the body');
  expect(start.mission?.stage).toBe('pickup');

  await page.waitForTimeout(600);
  const locked = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return { corpses: w.corpses.length, score: w.score.current, missionKind: w.serviceMission?.kind ?? null };
  });
  expect(locked.corpses).toBe(1);
  expect(locked.score).toBe(0);
  expect(locked.missionKind).toBe('ambulance');

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return w.corpses.length === 0 &&
      w.serviceMission?.kind === 'ambulance' &&
      w.serviceMission.stage === 'return' &&
      w.serviceTarget !== null &&
      scene.serviceMarker.visible &&
      scene.hud.text.includes('AMBULANCE: Return to the hospital');
  }, undefined, { timeout: 6000 });

  const returning = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      mission: w.serviceMission,
      target: w.serviceTarget,
      score: w.score.current,
      corpses: w.corpses.length,
      hud: scene.hud.text,
      markerVisible: scene.serviceMarker.visible,
    };
  });

  expect(returning.mission?.kind).toBe('ambulance');
  expect(returning.mission?.stage).toBe('return');
  expect(returning.target).not.toBeNull();
  expect(returning.score).toBe(0);
  expect(returning.corpses).toBe(0);
  expect(returning.hud).toContain('AMBULANCE: Return to the hospital');
  expect(returning.markerVisible).toBe(true);

  await page.evaluate(({ target }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    if (w.drivingCarIndex === null) throw new Error('expected to be driving the stolen ambulance');
    w.cars[w.drivingCarIndex] = { ...w.cars[w.drivingCarIndex], pos: target, speed: 0 };
  }, { target: returning.target! });

  await page.waitForFunction(({ reward }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return w.score.current === reward &&
      w.serviceMission === null &&
      !scene.serviceMarker.visible;
  }, { reward: start.mission!.reward }, { timeout: 4000 });

  const completed = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      corpses: w.corpses.length,
      score: w.score.current,
      mission: w.serviceMission,
      markerVisible: scene.serviceMarker.visible,
    };
  });

  expect(completed.corpses).toBe(0);
  expect(completed.score).toBe(start.mission!.reward);
  expect(completed.mission).toBeNull();
  expect(completed.markerVisible).toBe(false);
});

test('stealing a tow truck starts and completes a live wreck recovery side mission', async ({ page }) => {
  await boot(page);
  await seedTowLoading(page, 1);

  await page.locator('#game canvas').click();
  await page.keyboard.press('Space');

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return w.isDriving &&
      w.drivingCarIndex !== null &&
      w.carKind(w.drivingCarIndex) === 'tow' &&
      w.serviceMission?.kind === 'tow' &&
      w.serviceTarget !== null &&
      scene.serviceMarker.visible &&
      scene.hud.text.includes('TOW: Recover the wreck');
  }, undefined, { timeout: 2000 });

  const start = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      towed: w.towedCars[0],
      mission: w.serviceMission,
      target: w.serviceTarget,
      score: w.score.current,
      hud: scene.hud.text,
      markerVisible: scene.serviceMarker.visible,
    };
  });

  expect(start.towed).toBe(false);
  expect(start.mission?.kind).toBe('tow');
  expect(start.target).not.toBeNull();
  expect(start.markerVisible).toBe(true);
  expect(start.hud).toContain('TOW: Recover the wreck');
  expect(start.mission?.stage).toBe('pickup');

  await page.waitForTimeout(600);
  const locked = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return { towed: w.towedCars[0], score: w.score.current, missionKind: w.serviceMission?.kind ?? null };
  });
  expect(locked.towed).toBe(false);
  expect(locked.score).toBe(0);
  expect(locked.missionKind).toBe('tow');

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return w.towedCars[0] === true &&
      w.wreckedCars[0] === true &&
      w.serviceMission?.kind === 'tow' &&
      w.serviceMission.stage === 'return' &&
      w.serviceTarget !== null &&
      scene.serviceMarker.visible &&
      scene.hud.text.includes('TOW: Return to the tow yard');
  }, undefined, { timeout: 6000 });

  const returning = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      mission: w.serviceMission,
      target: w.serviceTarget,
      score: w.score.current,
      towed: w.towedCars[0],
      wrecked: w.wreckedCars[0],
      hud: scene.hud.text,
      markerVisible: scene.serviceMarker.visible,
    };
  });

  expect(returning.mission?.kind).toBe('tow');
  expect(returning.mission?.stage).toBe('return');
  expect(returning.target).not.toBeNull();
  expect(returning.score).toBe(0);
  expect(returning.towed).toBe(true);
  expect(returning.wrecked).toBe(true);
  expect(returning.hud).toContain('TOW: Return to the tow yard');
  expect(returning.markerVisible).toBe(true);

  await page.evaluate(({ target }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    if (w.drivingCarIndex === null) throw new Error('expected to be driving the stolen tow truck');
    w.cars[w.drivingCarIndex] = { ...w.cars[w.drivingCarIndex], pos: target, speed: 0 };
  }, { target: returning.target! });

  await page.waitForFunction(({ reward }) => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return w.score.current === reward &&
      w.serviceMission === null &&
      !scene.serviceMarker.visible;
  }, { reward: start.mission!.reward }, { timeout: 4000 });

  const completed = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const scene = g.scene.getScene('City');
    const w = scene.world;
    return {
      towed: w.towedCars[0],
      wrecked: w.wreckedCars[0],
      score: w.score.current,
      mission: w.serviceMission,
      markerVisible: scene.serviceMarker.visible,
    };
  });

  expect(completed.towed).toBe(true);
  expect(completed.wrecked).toBe(false);
  expect(completed.score).toBe(start.mission!.reward);
  expect(completed.mission).toBeNull();
  expect(completed.markerVisible).toBe(false);
});

test('an ambulance reaches a corpse on a wide sidewalk in the live game instead of timing out', async ({ page }) => {
  await boot(page);
  await seedWideSidewalkCorpse(page);

  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const amb = g.scene.getScene('City').world.ambulance;
    return amb?.phase === 'collect' && amb.crew !== null && amb.speed === 0;
  }, undefined, { timeout: 10000 });

  const state = await page.evaluate(() => {
    const g = (window as unknown as { __game: GameProbe }).__game;
    const w = g.scene.getScene('City').world;
    return {
      corpses: w.corpses.length,
      hasAmbulance: w.ambulance !== null,
      phase: w.ambulance?.phase ?? null,
      crew: w.ambulance?.crew ?? null,
      speed: w.ambulance?.speed ?? 0,
      target: w.ambulance?.target ?? null,
    };
  });

  expect(state.corpses).toBe(1);
  expect(state.hasAmbulance).toBe(true);
  expect(state.phase).toBe('collect');
  expect(state.crew).not.toBeNull();
  expect(state.speed).toBe(0);
  expect(state.target).not.toBeNull();
});

for (const serviceCase of parkedServiceCases) {
  test(`stealing the parked ${serviceCase.kind} at its facility raises wanted and shows live service HUD text`, async ({
    page,
  }) => {
    await boot(page);
    await seedParkedFacilityServiceRun(page, serviceCase);

    await page.evaluate(() => {
      const g = (window as unknown as { __game: GameProbe }).__game;
      const scene = g.scene.getScene('City');
      const w = scene.world;
      const press = {
        up: false,
        down: false,
        left: false,
        right: false,
        action: true,
        confirm: false,
        fire: false,
      };
      const release = { ...press, action: false };
      w.tick(press, 1 / 60);
      w.tick(release, 1 / 60);
      scene.syncSprites();
      scene.syncMinimap();
    });

    const state = await page.evaluate(() => {
      const g = (window as unknown as { __game: GameProbe }).__game;
      const scene = g.scene.getScene('City');
      const w = scene.world;
      return {
        drivingKind: w.drivingCarIndex === null ? null : w.carKind(w.drivingCarIndex),
        wantedHeat: w.wanted.heat,
        police: w.police.length,
        mission: w.serviceMission,
        target: w.serviceTarget,
        markerVisible: scene.serviceMarker.visible,
        hud: scene.hud.text,
      };
    });

    expect(state.drivingKind).toBe(serviceCase.kind);
    expect(state.wantedHeat).toBeGreaterThan(0);
    expect(state.police).toBeGreaterThan(0);
    expect(state.mission?.kind).toBe(serviceCase.kind);
    expect(state.target).not.toBeNull();
    expect(state.markerVisible).toBe(true);
    expect(state.hud).toContain(serviceCase.serviceHud);
    expect(state.hud).toMatch(
      new RegExp(`▶ ${escapeRegExp(serviceCase.campaignTitle)}: ${escapeRegExp(serviceCase.detail)}\\s+\\(0/1\\)`),
    );
    expect(state.hud).not.toContain(serviceCase.genericDescription);
  });
}