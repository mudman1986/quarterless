import { describe, expect, it } from 'vitest';
import {
  TANGRAM_FIXED_STEP,
  TANGRAM_MAX_FRAME_DT,
  TANGRAM_MAX_SUBSTEPS,
  createTangramPlatformerState,
  getTangramCheckpointRespawn,
  isTangramPoweredUp,
  tickTangramPlatformer,
  type TangramMovementSpec,
  type TangramPlatformerEvent,
  type TangramSimulationLevel,
} from './tangramPlatformer';

const movement: TangramMovementSpec = {
  maxSpeed: 340,
  poweredMaxSpeed: 410,
  jumpVelocity: -740,
  poweredJumpVelocity: -820,
  acceleration: 1900,
  drag: 1650,
  respawnShieldMs: 1200,
};

function level(platformY = 448): TangramSimulationLevel {
  return {
    title: 'Test Run',
    worldWidth: 2000,
    worldHeight: 540,
    start: { x: 100, y: platformY - 72, label: 'Start' },
    hint: 'Test hint',
    platforms: [{ x: 0, y: platformY, width: 2000, height: 92 }],
    collectibles: [],
    hazards: [],
    enemies: [],
    checkpoint: { x: 1500, y: 300, width: 50, height: 120, label: 'Checkpoint' },
    goal: { x: 1800, y: 300, width: 80, height: 150 },
    powerup: { x: 900, y: 300, width: 40, height: 50, label: 'Snack' },
  };
}

function simulate(renderHz: number): ReturnType<typeof createTangramPlatformerState> {
  const simulationLevel = level();
  const state = createTangramPlatformerState(simulationLevel);
  const events: TangramPlatformerEvent[] = [];
  let accumulator = 0;
  const frameDt = 1 / renderHz;
  const frameCount = renderHz * 2;
  for (let frame = 0; frame < frameCount; frame += 1) {
    accumulator += Math.min(frameDt, TANGRAM_MAX_FRAME_DT);
    let steps = 0;
    while (accumulator >= TANGRAM_FIXED_STEP && steps < TANGRAM_MAX_SUBSTEPS) {
      tickTangramPlatformer(
        state,
        simulationLevel,
        movement,
        { direction: 1, jumpPressed: frame === 0 && steps === 0 },
        TANGRAM_FIXED_STEP,
        events,
      );
      accumulator -= TANGRAM_FIXED_STEP;
      steps += 1;
    }
    if (steps === TANGRAM_MAX_SUBSTEPS && accumulator >= TANGRAM_FIXED_STEP) accumulator = 0;
    events.length = 0;
  }
  return state;
}

describe('Tangram platformer simulation', () => {
  it('places a checkpoint respawn on its supporting platform', () => {
    const simulationLevel = level();
    expect(getTangramCheckpointRespawn(simulationLevel)).toEqual({
      x: 1512,
      y: 376,
      label: 'Checkpoint',
    });

    const state = createTangramPlatformerState(simulationLevel);
    state.player.x = 1500;
    state.player.y = 300;
    const events: TangramPlatformerEvent[] = [];
    tickTangramPlatformer(state, simulationLevel, movement, { direction: 0, jumpPressed: false }, TANGRAM_FIXED_STEP, events);
    expect(state.checkpointActivated).toBe(true);
    expect(state.respawnPoint.y).toBe(376);

    state.player.y = simulationLevel.worldHeight + 200;
    tickTangramPlatformer(state, simulationLevel, movement, { direction: 0, jumpPressed: false }, TANGRAM_FIXED_STEP, events);
    tickTangramPlatformer(state, simulationLevel, movement, { direction: 0, jumpPressed: false }, TANGRAM_FIXED_STEP, events);
    expect(state.player.y).toBe(376);
    expect(state.player.grounded).toBe(true);
  });

  it('reaches the same state across 30, 60, and 120 Hz rendering', () => {
    const at30 = simulate(30);
    const at60 = simulate(60);
    const at120 = simulate(120);

    expect(at30.player.x).toBeCloseTo(at60.player.x, 6);
    expect(at120.player.x).toBeCloseTo(at60.player.x, 6);
    expect(at30.player.y).toBeCloseTo(at60.player.y, 6);
    expect(at120.player.y).toBeCloseTo(at60.player.y, 6);
    expect(at30.player.velocityX).toBeCloseTo(at60.player.velocityX, 6);
    expect(at120.player.velocityX).toBeCloseTo(at60.player.velocityX, 6);
  });

  it('lands on a platform at maximum fall speed without tunneling', () => {
    const simulationLevel = level(300);
    const state = createTangramPlatformerState(simulationLevel);
    const events: TangramPlatformerEvent[] = [];
    state.player.y = 205;
    state.player.velocityY = 960;

    for (let tick = 0; tick < 4; tick += 1) {
      tickTangramPlatformer(
        state,
        simulationLevel,
        movement,
        { direction: 0, jumpPressed: false },
        TANGRAM_FIXED_STEP,
        events,
      );
    }

    expect(state.player.y).toBe(300 - 72);
    expect(state.player.velocityY).toBe(0);
    expect(state.player.grounded).toBe(true);
  });

  it('consumes power and invulnerability in simulation time', () => {
    const simulationLevel = level();
    const state = createTangramPlatformerState(simulationLevel);
    const events: TangramPlatformerEvent[] = [];
    state.powerRemaining = 12;
    state.invulnerableRemaining = 1.2;

    for (let tick = 0; tick < 72; tick += 1) {
      tickTangramPlatformer(
        state,
        simulationLevel,
        movement,
        { direction: 0, jumpPressed: false },
        TANGRAM_FIXED_STEP,
        events,
      );
    }
    expect(state.invulnerableRemaining).toBeCloseTo(0, 8);
    expect(isTangramPoweredUp(state)).toBe(true);

    for (let tick = 72; tick < 720; tick += 1) {
      tickTangramPlatformer(
        state,
        simulationLevel,
        movement,
        { direction: 0, jumpPressed: false },
        TANGRAM_FIXED_STEP,
        events,
      );
    }
    expect(state.powerRemaining).toBeCloseTo(0, 8);
    expect(isTangramPoweredUp(state)).toBe(false);
  });

  it('moves platforms deterministically and carries a grounded player', () => {
    const simulationLevel: TangramSimulationLevel = {
      ...level(),
      platforms: [{ x: 0, y: 448, width: 2000, height: 92 }],
      movingPlatforms: [{ x: 100, y: 300, width: 140, height: 20, axis: 'x', distance: 80, speed: 120 }],
    };
    const state = createTangramPlatformerState(simulationLevel);
    const events: TangramPlatformerEvent[] = [];
    state.player.x = 120;
    state.player.y = 228;
    state.player.grounded = true;

    tickTangramPlatformer(
      state,
      simulationLevel,
      movement,
      { direction: 0, jumpPressed: false },
      TANGRAM_FIXED_STEP,
      events,
    );

    expect(state.movingPlatforms[0].x).toBeGreaterThan(100);
    expect(state.player.x).toBeGreaterThan(120);

    for (let tick = 0; tick < 50; tick += 1) {
      tickTangramPlatformer(
        state,
        simulationLevel,
        movement,
        { direction: 0, jumpPressed: false },
        TANGRAM_FIXED_STEP,
        events,
      );
    }
    expect(state.movingPlatforms[0].direction).toBe(-1);
  });

  it('requires three clean stomps to clear a finale boss', () => {
    const simulationLevel: TangramSimulationLevel = {
      ...level(),
      platforms: [{ x: 0, y: 448, width: 2000, height: 92 }],
      boss: {
        x: 140,
        y: 376,
        width: 72,
        height: 72,
        minX: 140,
        maxX: 240,
        speed: 0,
        hits: 3,
        label: 'Relay Captain',
        warningSeconds: 0.55,
        chargeSpeed: 260,
      },
    };
    const state = createTangramPlatformerState(simulationLevel);
    const events: TangramPlatformerEvent[] = [];
    state.player.x = 150;
    state.player.y = 304;
    state.player.velocityY = 1000;

    tickTangramPlatformer(
      state,
      simulationLevel,
      movement,
      { direction: 0, jumpPressed: false },
      TANGRAM_FIXED_STEP,
      events,
    );

    expect(state.boss?.hitsRemaining).toBe(2);
    expect(state.boss?.active).toBe(true);

    state.player.y = 304;
    state.player.velocityY = 1000;
    for (let hit = 0; hit < 2; hit += 1) {
      state.player.x = 500;
      state.player.y = 376;
      state.player.grounded = true;
      for (let tick = 0; tick < 48; tick += 1) {
        tickTangramPlatformer(
          state,
          simulationLevel,
          movement,
          { direction: 0, jumpPressed: false },
          TANGRAM_FIXED_STEP,
          events,
        );
      }
      state.player.x = 150;
      state.player.y = 304;
      state.player.velocityY = 1000;
      tickTangramPlatformer(
        state,
        simulationLevel,
        movement,
        { direction: 0, jumpPressed: false },
        TANGRAM_FIXED_STEP,
        events,
      );
    }

    expect(state.boss?.hitsRemaining).toBe(0);
    expect(state.boss?.active).toBe(false);
  });

  it('warns before a finale charge and ends the charge at its patrol bounds', () => {
    const simulationLevel: TangramSimulationLevel = {
      ...level(),
      platforms: [{ x: 0, y: 448, width: 2000, height: 92 }],
      boss: {
        x: 140,
        y: 376,
        width: 72,
        height: 72,
        minX: 100,
        maxX: 220,
        speed: 0,
        hits: 3,
        label: 'Relay Captain',
        warningSeconds: 0.1,
        chargeSpeed: 500,
      },
    };
    const state = createTangramPlatformerState(simulationLevel);
    const events: TangramPlatformerEvent[] = [];
    state.player.x = 250;
    state.player.y = 376;
    state.player.grounded = true;

    tickTangramPlatformer(
      state,
      simulationLevel,
      movement,
      { direction: 0, jumpPressed: false },
      TANGRAM_FIXED_STEP,
      events,
    );
    expect(state.boss?.warningRemaining).toBeGreaterThan(0);
    expect(state.boss?.charging).toBe(false);

    for (let tick = 0; tick < 20; tick += 1) {
      state.player.x = 500;
      state.player.y = 376;
      state.player.grounded = true;
      tickTangramPlatformer(
        state,
        simulationLevel,
        movement,
        { direction: 0, jumpPressed: false },
        TANGRAM_FIXED_STEP,
        events,
      );
    }
    expect(state.boss?.charging).toBe(false);
    expect(state.boss?.x).toBeLessThanOrEqual(220);
  });
});