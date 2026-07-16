import { describe, expect, it } from 'vitest';
import {
  TANGRAM_FIXED_STEP,
  TANGRAM_MAX_FRAME_DT,
  TANGRAM_MAX_SUBSTEPS,
  TANGRAM_POWER_DURATION,
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
    checkpoints: [{ x: 1500, y: 300, width: 50, height: 120, label: 'Checkpoint' }],
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
    expect(getTangramCheckpointRespawn(simulationLevel, simulationLevel.checkpoints[0])).toEqual({
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

  it('keeps the furthest checkpoint as the respawn point', () => {
    const simulationLevel = {
      ...level(),
      checkpoints: [
        { x: 600, y: 300, width: 50, height: 120, label: 'First' },
        { x: 1400, y: 300, width: 50, height: 120, label: 'Second' },
      ],
    };
    const state = createTangramPlatformerState(simulationLevel);
    const events: TangramPlatformerEvent[] = [];

    state.player.x = 600;
    state.player.y = 300;
    tickTangramPlatformer(state, simulationLevel, movement, { direction: 0, jumpPressed: false }, TANGRAM_FIXED_STEP, events);
    state.player.x = 1400;
    tickTangramPlatformer(state, simulationLevel, movement, { direction: 0, jumpPressed: false }, TANGRAM_FIXED_STEP, events);
    state.player.x = 600;
    tickTangramPlatformer(state, simulationLevel, movement, { direction: 0, jumpPressed: false }, TANGRAM_FIXED_STEP, events);

    expect(state.respawnPoint.label).toBe('Second');
    expect(state.checkpointIndex).toBe(1);
  });

  it('lets the first route finish without collecting bonus badges', () => {
    const simulationLevel = {
      ...level(),
      requiredBadges: 0,
      goal: { x: 100, y: 376, width: 80, height: 72 },
    };
    const state = createTangramPlatformerState(simulationLevel);
    const events: TangramPlatformerEvent[] = [];
    for (let tick = 0; tick < 60 && !state.finished; tick += 1) {
      tickTangramPlatformer(
        state,
        simulationLevel,
        movement,
        { direction: 0, jumpPressed: false },
        TANGRAM_FIXED_STEP,
        events,
      );
    }
    expect(state.finished).toBe(true);
    expect(events).toContainEqual({ type: 'complete' });
  });

  it('holds the player on the flag while the Tangram flag slides down', () => {
    const simulationLevel = {
      ...level(),
      goal: { x: 100, y: 80, width: 80, height: 368 },
    };
    const state = createTangramPlatformerState(simulationLevel);
    const events: TangramPlatformerEvent[] = [];
    state.player.x = 100;
    state.player.y = 220;

    tickTangramPlatformer(
      state,
      simulationLevel,
      movement,
      { direction: 0, jumpPressed: false },
      TANGRAM_FIXED_STEP,
      events,
    );
    expect(state.goalPhase).toBe('grab');
    expect(state.goalFlagY).toBe(simulationLevel.goal.y);
    expect(state.finished).toBe(false);

    tickTangramPlatformer(
      state,
      simulationLevel,
      movement,
      { direction: 0, jumpPressed: false },
      TANGRAM_FIXED_STEP,
      events,
    );
    expect(state.goalPhase).toBe('grab');
    expect(state.goalFlagY).toBeCloseTo(simulationLevel.goal.y + 1, 5);
    expect(state.player.y).toBeCloseTo(220.611111, 5);

    for (let tick = 0; tick < 300 && !state.finished; tick += 1) {
      tickTangramPlatformer(
        state,
        simulationLevel,
        movement,
        { direction: 0, jumpPressed: false },
        TANGRAM_FIXED_STEP,
        events,
      );
    }
    expect(state.finished).toBe(true);
    expect(events).toContainEqual({ type: 'complete' });
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

  it('breaks a Tangram block from below only while powered up', () => {
    const simulationLevel = {
      ...level(),
      breakableBlocks: [{ x: 300, y: 300, width: 48, height: 48, label: 'Tangram block' }],
    };
    const state = createTangramPlatformerState(simulationLevel);
    const events: TangramPlatformerEvent[] = [];
    state.player.x = 300;
    state.player.y = 360;
    state.player.velocityY = -700;
    tickTangramPlatformer(
      state,
      simulationLevel,
      movement,
      { direction: 0, jumpPressed: false },
      TANGRAM_FIXED_STEP,
      events,
    );
    expect(state.breakableBlocksBroken[0]).toBe(false);

    state.powerRemaining = 1;
    tickTangramPlatformer(
      state,
      simulationLevel,
      movement,
      { direction: 0, jumpPressed: false },
      TANGRAM_FIXED_STEP,
      events,
    );
    expect(state.breakableBlocksBroken[0]).toBe(true);
    expect(events).toContainEqual({ type: 'shake' });
  });

  it('pops and collects a power snack after a clean underside hit', () => {
    const simulationLevel = {
      ...level(),
      powerup: { x: 300, y: 300, width: 44, height: 56, label: 'Super Snack' },
    };
    const state = createTangramPlatformerState(simulationLevel);
    const events: TangramPlatformerEvent[] = [];
    state.player.x = 300;
    state.player.y = 356;
    state.player.velocityY = -700;

    tickTangramPlatformer(
      state,
      simulationLevel,
      movement,
      { direction: 0, jumpPressed: false },
      TANGRAM_FIXED_STEP,
      events,
    );

    expect(state.powerBlockHit).toBe(true);
    expect(state.powerSnackAvailable).toBe(true);
    expect(events).toContainEqual({ type: 'hud' });

    state.player.y = 250;
    state.player.velocityY = 0;
    tickTangramPlatformer(
      state,
      simulationLevel,
      movement,
      { direction: 0, jumpPressed: false },
      TANGRAM_FIXED_STEP,
      events,
    );

    expect(state.powerSnackAvailable).toBe(false);
    expect(state.powerRemaining).toBe(TANGRAM_POWER_DURATION);
    expect(isTangramPoweredUp(state)).toBe(true);
  });

  it('turns enemies around before they leave a platform edge', () => {
    const simulationLevel = {
      ...level(),
      platforms: [
        { x: 0, y: 448, width: 340, height: 92 },
        { x: 440, y: 448, width: 1560, height: 92 },
      ],
      enemies: [{ x: 280, y: 404, width: 44, height: 40, minX: 200, maxX: 560, speed: 120 }],
    };
    const state = createTangramPlatformerState(simulationLevel);
    const events: TangramPlatformerEvent[] = [];
    state.enemies[0].direction = 1;

    tickTangramPlatformer(
      state,
      simulationLevel,
      movement,
      { direction: 0, jumpPressed: false },
      0.5,
      events,
    );

    expect(state.enemies[0].x).toBe(296);
    expect(state.enemies[0].direction).toBe(-1);
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