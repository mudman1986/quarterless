import { describe, expect, it } from 'vitest';
import {
  TANGRAM_FIXED_STEP,
  TANGRAM_MAX_FRAME_DT,
  TANGRAM_MAX_SUBSTEPS,
  createTangramPlatformerState,
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
});