export const TANGRAM_FIXED_STEP = 1 / 60;
export const TANGRAM_MAX_SUBSTEPS = 5;
export const TANGRAM_MAX_FRAME_DT = 0.25;
export const TANGRAM_PLAYER_WIDTH = 52;
export const TANGRAM_PLAYER_HEIGHT = 72;
export const TANGRAM_POWER_DURATION = 5;

export const TANGRAM_GRAVITY = 2200;
const PLAYER_MAX_FALL_SPEED = 960;
const FLAG_SLIDE_SPEED = 90;
const FLAG_TO_PLAYER_SPEED = 60;

export interface TangramRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TangramMovingPlatform extends TangramRect {
  axis: 'x' | 'y';
  distance: number;
  speed: number;
}

export interface TangramBreakableBlock extends TangramRect {
  label: string;
}

export interface TangramBossDefinition extends TangramRect {
  minX: number;
  maxX: number;
  speed: number;
  hits: number;
  label: string;
  warningSeconds: number;
  chargeSpeed: number;
}

export interface TangramMovementSpec {
  maxSpeed: number;
  poweredMaxSpeed: number;
  jumpVelocity: number;
  poweredJumpVelocity: number;
  acceleration: number;
  drag: number;
  respawnShieldMs: number;
}

export interface TangramSimulationLevel {
  title: string;
  worldWidth: number;
  worldHeight: number;
  start: { x: number; y: number; label: string };
  hint: string;
  platforms: readonly TangramRect[];
  breakableBlocks?: readonly TangramBreakableBlock[];
  movingPlatforms?: readonly TangramMovingPlatform[];
  boss?: TangramBossDefinition;
  collectibles: ReadonlyArray<{ x: number; y: number; label: string; secret?: boolean }>;
  hazards: ReadonlyArray<TangramRect & { label: string }>;
  enemies: ReadonlyArray<
    TangramRect & { minX: number; maxX: number; speed: number }
  >;
  bouncePads?: ReadonlyArray<TangramRect & { label: string; strength: number }>;
  checkpoints: readonly (TangramRect & { label: string })[];
  goal: TangramRect;
  powerups: ReadonlyArray<TangramRect & { label: string }>;
  requiredBadges?: number;
}

export function getTangramCheckpointSupport(
  level: TangramSimulationLevel,
  checkpoint: TangramRect,
): TangramRect | null {
  const checkpointCenter = checkpoint.x + checkpoint.width / 2;
  const platforms = level.platforms;
  return (
    platforms
      .filter(
        (platform) =>
          checkpointCenter > platform.x &&
          checkpointCenter < platform.x + platform.width &&
          platform.y >= checkpoint.y &&
          platform.y <= checkpoint.y + checkpoint.height + TANGRAM_PLAYER_HEIGHT,
      )
      .sort((a, b) => a.y - b.y)[0] ?? null
  );
}

export function getTangramCheckpointRespawn(
  level: TangramSimulationLevel,
  checkpoint: TangramRect & { label: string },
): { x: number; y: number; label: string } | null {
  const support = getTangramCheckpointSupport(level, checkpoint);
  if (!support) return null;
  return {
    x: clamp(
      checkpoint.x + 12,
      support.x,
      support.x + support.width - TANGRAM_PLAYER_WIDTH,
    ),
    y: support.y - TANGRAM_PLAYER_HEIGHT,
    label: checkpoint.label,
  };
}

export interface TangramPlayerState {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  grounded: boolean;
  facing: 1 | -1;
}

export interface TangramEnemyState {
  x: number;
  direction: 1 | -1;
  active: boolean;
}

export interface TangramMovingPlatformState extends TangramMovingPlatform {
  direction: 1 | -1;
  velocityX: number;
  velocityY: number;
}

export interface TangramBossState {
  x: number;
  direction: 1 | -1;
  hitsRemaining: number;
  active: boolean;
  stunRemaining: number;
  warningRemaining: number;
  charging: boolean;
  chargeCooldown: number;
}

export interface TangramPlatformerState {
  player: TangramPlayerState;
  enemies: TangramEnemyState[];
  movingPlatforms: TangramMovingPlatformState[];
  boss: TangramBossState | null;
  collected: boolean[];
  badgesCollected: number;
  checkpointActivated: boolean;
  checkpointIndex: number;
  respawnPoint: { x: number; y: number; label: string };
  falls: number;
  powerRemaining: number;
  powerSnackAvailable: boolean[];
  powerBlockHit: boolean[];
  breakableBlocksBroken: boolean[];
  invulnerableRemaining: number;
  hint: string;
  hintRemaining: number;
  elapsedSeconds: number;
  goalPhase: 'none' | 'grab' | 'slide';
  goalFlagY: number;
  finished: boolean;
}

export interface TangramPlatformerInput {
  direction: -1 | 0 | 1;
  jumpPressed: boolean;
}

export type TangramPlatformerEvent =
  | { type: 'hud' }
  | { type: 'shake' }
  | { type: 'badge'; x: number; y: number; count: number }
  | { type: 'complete' };

export interface TangramJumpAudit {
  allCriticalPlatformsReachable: boolean;
  jumpRise: number;
  maxRequiredRise: number;
  unreachable: string[];
}

export function createTangramPlatformerState(
  level: TangramSimulationLevel,
): TangramPlatformerState {
  for (const checkpoint of level.checkpoints) {
    if (!getTangramCheckpointRespawn(level, checkpoint)) {
      throw new Error(`Tangram checkpoint has no supporting platform: ${level.title}`);
    }
  }
  return {
    player: {
      x: level.start.x,
      y: level.start.y,
      velocityX: 0,
      velocityY: 0,
      grounded: false,
      facing: 1,
    },
    enemies: level.enemies.map((enemy, index) => ({
      x: enemy.x,
      direction: index % 2 === 0 ? 1 : -1,
      active: true,
    })),
    movingPlatforms: (level.movingPlatforms ?? []).map((platform) => ({
      ...platform,
      direction: 1,
      velocityX: 0,
      velocityY: 0,
    })),
    boss: level.boss
      ? {
          x: level.boss.x,
          direction: 1,
          hitsRemaining: level.boss.hits,
          active: true,
          stunRemaining: 0,
          warningRemaining: 0,
          charging: false,
          chargeCooldown: 0,
        }
      : null,
    collected: level.collectibles.map(() => false),
    badgesCollected: 0,
    checkpointActivated: false,
    checkpointIndex: -1,
    respawnPoint: { ...level.start },
    falls: 0,
    powerRemaining: 0,
    powerSnackAvailable: level.powerups.map(() => true),
    powerBlockHit: level.powerups.map(() => false),
    breakableBlocksBroken: (level.breakableBlocks ?? []).map(() => false),
    invulnerableRemaining: 0,
    hint: level.hint,
    hintRemaining: 0,
    elapsedSeconds: 0,
    goalPhase: 'none',
    goalFlagY: level.goal.y,
    finished: false,
  };
}

export function tangramPlayerRect(state: TangramPlatformerState): TangramRect {
  return {
    x: state.player.x,
    y: state.player.y,
    width: TANGRAM_PLAYER_WIDTH,
    height: TANGRAM_PLAYER_HEIGHT,
  };
}

export function isTangramPoweredUp(state: TangramPlatformerState): boolean {
  return state.powerRemaining > 0;
}

export function tangramBadgeTotal(level: TangramSimulationLevel): number {
  return level.collectibles.length + (level.breakableBlocks?.length ?? 0) + 3;
}

function intersects(a: TangramRect, b: TangramRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function setHint(
  state: TangramPlatformerState,
  message: string,
  events: TangramPlatformerEvent[],
): void {
  state.hint = message;
  state.hintRemaining = 3.2;
  events.push({ type: 'hud' });
}

function awardBadges(
  state: TangramPlatformerState,
  count: number,
  x: number,
  y: number,
  events: TangramPlatformerEvent[],
): void {
  state.badgesCollected += count;
  events.push({ type: 'badge', x, y, count });
  events.push({ type: 'hud' });
}

function respawn(
  state: TangramPlatformerState,
  movement: TangramMovementSpec,
  message: string,
  events: TangramPlatformerEvent[],
): void {
  state.falls += 1;
  state.player.x = state.respawnPoint.x;
  state.player.y = state.respawnPoint.y;
  state.player.velocityX = 0;
  state.player.velocityY = 0;
  state.player.grounded = false;
  state.invulnerableRemaining = movement.respawnShieldMs / 1000;
  setHint(state, message, events);
  events.push({ type: 'shake' });
}

function updateTimers(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  dt: number,
  events: TangramPlatformerEvent[],
): void {
  const wasPowered = isTangramPoweredUp(state);
  state.powerRemaining = Math.max(0, state.powerRemaining - dt);
  state.invulnerableRemaining = Math.max(0, state.invulnerableRemaining - dt);
  if (wasPowered && !isTangramPoweredUp(state)) events.push({ type: 'hud' });

  if (state.hintRemaining <= 0) return;
  state.hintRemaining = Math.max(0, state.hintRemaining - dt);
  if (state.hintRemaining === 0) {
    state.hint = isTangramPoweredUp(state)
      ? 'Power snack active — race ahead while it lasts.'
      : level.hint;
    events.push({ type: 'hud' });
  }
}

function updateEnemies(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  dt: number,
): void {
  for (let index = 0; index < state.enemies.length; index += 1) {
    const enemy = state.enemies[index];
    const definition = level.enemies[index];
    if (!enemy.active) continue;
    const nextX = enemy.x + definition.speed * enemy.direction * dt;
    const platforms = platformRects(state, level);
    const supported = platforms.some(
      (platform) =>
        Math.abs(platform.y - (definition.y + definition.height)) <= 4 &&
        nextX < platform.x + platform.width &&
        nextX + definition.width > platform.x,
    );
    if (!supported) {
      const currentPlatform = platforms.find(
        (platform) =>
          Math.abs(platform.y - (definition.y + definition.height)) <= 4 &&
          enemy.x < platform.x + platform.width &&
          enemy.x + definition.width > platform.x,
      );
      if (currentPlatform) {
        enemy.x = enemy.direction === 1
          ? currentPlatform.x + currentPlatform.width - definition.width
          : currentPlatform.x;
      }
      enemy.direction = enemy.direction === 1 ? -1 : 1;
      continue;
    }
    enemy.x = nextX;
    if (enemy.x <= definition.minX) {
      enemy.x = definition.minX;
      enemy.direction = 1;
    }
    if (enemy.x >= definition.maxX) {
      enemy.x = definition.maxX;
      enemy.direction = -1;
    }
  }
}

function updateMovingPlatforms(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  dt: number,
): void {
  for (let index = 0; index < state.movingPlatforms.length; index += 1) {
    const platform = state.movingPlatforms[index];
    const definition = level.movingPlatforms?.[index];
    if (!definition) continue;
    const previousX = platform.x;
    const previousY = platform.y;
    const distance = platform.speed * platform.direction * dt;
    if (platform.axis === 'x') platform.x += distance;
    else platform.y += distance;

    const offset = platform.axis === 'x' ? platform.x - definition.x : platform.y - definition.y;
    if (offset <= 0) {
      platform.x = definition.x;
      platform.y = definition.y;
      platform.direction = 1;
    } else if (offset >= definition.distance) {
      if (platform.axis === 'x') platform.x = definition.x + definition.distance;
      else platform.y = definition.y + definition.distance;
      platform.direction = -1;
    }
    platform.velocityX = (platform.x - previousX) / dt;
    platform.velocityY = (platform.y - previousY) / dt;
  }
}

function updateBoss(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  dt: number,
  events: TangramPlatformerEvent[],
): void {
  const boss = state.boss;
  const definition = level.boss;
  if (!boss || !definition || !boss.active) return;
  boss.stunRemaining = Math.max(0, boss.stunRemaining - dt);
  boss.chargeCooldown = Math.max(0, boss.chargeCooldown - dt);
  if (boss.stunRemaining > 0) return;
  if (boss.warningRemaining > 0) {
    boss.warningRemaining = Math.max(0, boss.warningRemaining - dt);
    if (boss.warningRemaining === 0) {
      boss.charging = true;
      events.push({ type: 'hud' });
    }
    return;
  }
  if (boss.charging) {
    boss.x += definition.chargeSpeed * boss.direction * dt;
    if (boss.x <= definition.minX || boss.x >= definition.maxX) {
      boss.x = clamp(boss.x, definition.minX, definition.maxX);
      boss.charging = false;
      boss.chargeCooldown = 1.4;
      events.push({ type: 'hud' });
    }
    return;
  }
  boss.x += definition.speed * boss.direction * dt;
  if (boss.x <= definition.minX) {
    boss.x = definition.minX;
    boss.direction = 1;
  } else if (boss.x >= definition.maxX) {
    boss.x = definition.maxX;
    boss.direction = -1;
  }
  if (
    boss.chargeCooldown === 0 &&
    Math.abs(state.player.x - boss.x) < 280 &&
    Math.abs(state.player.y - definition.y) < TANGRAM_PLAYER_HEIGHT
  ) {
    boss.direction = state.player.x >= boss.x ? 1 : -1;
    boss.warningRemaining = definition.warningSeconds;
    events.push({ type: 'hud' });
  }
}

function platformRects(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
): readonly TangramRect[] {
  return [
    ...level.platforms,
    ...(level.breakableBlocks ?? []).filter(
      (_, index) => !state.breakableBlocksBroken[index],
    ),
    ...level.powerups.filter((_, index) => !state.powerBlockHit[index]),
    ...state.movingPlatforms,
  ];
}

function movingPlatformUnderPlayer(
  state: TangramPlatformerState,
): TangramMovingPlatformState | null {
  if (!state.player.grounded) return null;
  const player = tangramPlayerRect(state);
  const bottom = player.y + player.height;
  return (
    state.movingPlatforms.find(
      (platform) =>
        Math.abs(bottom - platform.y) <= 3 &&
        player.x < platform.x + platform.width &&
        player.x + player.width > platform.x,
    ) ?? null
  );
}

function resolveHorizontal(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  previousX: number,
): void {
  const playerRect = tangramPlayerRect(state);
  for (const platform of platformRects(state, level)) {
    if (!intersects(playerRect, platform)) continue;
    const wasLeft = previousX + TANGRAM_PLAYER_WIDTH <= platform.x;
    const wasRight = previousX >= platform.x + platform.width;
    if (wasLeft) state.player.x = platform.x - TANGRAM_PLAYER_WIDTH;
    else if (wasRight) state.player.x = platform.x + platform.width;
    else if (state.player.velocityX > 0) state.player.x = platform.x - TANGRAM_PLAYER_WIDTH;
    else state.player.x = platform.x + platform.width;
    state.player.velocityX = 0;
    playerRect.x = state.player.x;
  }
}

function resolveVertical(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  previousY: number,
  events: TangramPlatformerEvent[],
): void {
  const playerRect = tangramPlayerRect(state);
  for (const platform of platformRects(state, level)) {
    if (!intersects(playerRect, platform)) continue;
    const wasAbove = previousY + TANGRAM_PLAYER_HEIGHT <= platform.y;
    const wasBelow = previousY >= platform.y + platform.height;
    if (wasAbove && state.player.velocityY >= 0) {
      state.player.y = platform.y - TANGRAM_PLAYER_HEIGHT;
      state.player.velocityY = 0;
      state.player.grounded = true;
    } else if (wasBelow && state.player.velocityY < 0) {
      const breakableIndex = (level.breakableBlocks ?? []).findIndex(
        (block) => block === platform,
      );
      if (breakableIndex >= 0) {
        const block = level.breakableBlocks![breakableIndex];
        state.breakableBlocksBroken[breakableIndex] = true;
        awardBadges(state, 1, block.x + block.width / 2, block.y + block.height / 2, events);
        setHint(state, `${block.label} broken! Badge earned.`, events);
        events.push({ type: 'shake' });
      }
      state.player.y = platform.y + platform.height;
      state.player.velocityY = 0;
    } else if (state.player.velocityY > 0) {
      state.player.y = platform.y - TANGRAM_PLAYER_HEIGHT;
      state.player.velocityY = 0;
      state.player.grounded = true;
    }
    playerRect.y = state.player.y;
  }
}

function handleBadgeBoxes(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  previousX: number,
  previousY: number,
  events: TangramPlatformerEvent[],
): void {
  if (state.player.velocityY >= 0) return;
  const player = tangramPlayerRect(state);
  for (let index = 0; index < (level.breakableBlocks?.length ?? 0); index += 1) {
    const block = level.breakableBlocks![index];
    if (
      state.breakableBlocksBroken[index] ||
      previousY < block.y + block.height ||
      player.y + player.height <= block.y ||
      previousX + player.width <= block.x ||
      previousX >= block.x + block.width
    ) continue;
    state.breakableBlocksBroken[index] = true;
    state.player.y = block.y + block.height;
    state.player.velocityY = 0;
    awardBadges(state, 1, block.x + block.width / 2, block.y + block.height / 2, events);
    setHint(state, `${block.label} broken! Badge earned.`, events);
    events.push({ type: 'shake' });
    return;
  }
}

function updatePlayer(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  movement: TangramMovementSpec,
  input: TangramPlatformerInput,
  dt: number,
  events: TangramPlatformerEvent[],
): number {
  const player = state.player;
  const powered = isTangramPoweredUp(state);
  const maxSpeed = powered ? movement.poweredMaxSpeed : movement.maxSpeed;
  const jumpVelocity = powered ? movement.poweredJumpVelocity : movement.jumpVelocity;
  const movingPlatform = movingPlatformUnderPlayer(state);
  if (movingPlatform) {
    player.x += movingPlatform.velocityX * dt;
    player.y += movingPlatform.velocityY * dt;
  }
  const previousX = player.x;
  const previousY = player.y;

  if (input.direction !== 0) {
    player.velocityX = clamp(
      player.velocityX + input.direction * movement.acceleration * dt,
      -maxSpeed,
      maxSpeed,
    );
    player.facing = input.direction;
  } else {
    const dragAmount = movement.drag * dt;
    player.velocityX =
      Math.abs(player.velocityX) <= dragAmount
        ? 0
        : player.velocityX - Math.sign(player.velocityX) * dragAmount;
  }

  if (input.jumpPressed && player.grounded) {
    player.velocityY = jumpVelocity;
    player.grounded = false;
    setHint(state, `Leap into ${level.title.toLowerCase()} and keep the parade moving.`, events);
  }

  player.x += player.velocityX * dt;
  resolveHorizontal(state, level, previousX);
  player.velocityY = clamp(
    player.velocityY + TANGRAM_GRAVITY * dt,
    -1800,
    PLAYER_MAX_FALL_SPEED,
  );
  player.y += player.velocityY * dt;
  player.grounded = false;
  handlePowerSnack(state, level, previousY, events);
  handleBadgeBoxes(state, level, previousX, previousY, events);
  resolveVertical(state, level, previousY, events);

  if (player.y > level.worldHeight + 120 && player.x + TANGRAM_PLAYER_WIDTH < level.goal.x) {
    respawn(
      state,
      movement,
      `Take the safer route through ${level.title.toLowerCase()}.`,
      events,
    );
  }
  player.x = clamp(player.x, 0, level.worldWidth - TANGRAM_PLAYER_WIDTH);
  return previousY;
}

function handleBouncePads(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  events: TangramPlatformerEvent[],
): void {
  const feetRect = {
    x: state.player.x + 10,
    y: state.player.y + TANGRAM_PLAYER_HEIGHT - 10,
    width: TANGRAM_PLAYER_WIDTH - 20,
    height: 12,
  };
  for (const pad of level.bouncePads ?? []) {
    if (!intersects(feetRect, pad)) continue;
    if (state.player.velocityY > 0 || state.player.grounded) {
      state.player.velocityY = -pad.strength;
      state.player.grounded = false;
      setHint(state, `${pad.label} launches you toward the high route.`, events);
    }
  }
}

function handleCollectibles(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  events: TangramPlatformerEvent[],
): void {
  const playerRect = tangramPlayerRect(state);
  for (let index = 0; index < level.collectibles.length; index += 1) {
    const collectible = level.collectibles[index];
    if (state.collected[index]) continue;
    if (
      !intersects(playerRect, {
        x: collectible.x - 13,
        y: collectible.y - 13,
        width: 26,
        height: 26,
      })
    ) {
      continue;
    }
    state.collected[index] = true;
    state.badgesCollected += 1;
    setHint(
      state,
      collectible.secret
        ? `Secret found: ${collectible.label}.`
        : `Badges collected: ${state.badgesCollected}/${level.collectibles.length}`,
      events,
    );
  }
}

function handleHazards(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  movement: TangramMovementSpec,
  events: TangramPlatformerEvent[],
): void {
  if (state.invulnerableRemaining > 0) return;
  const feetRect = {
    x: state.player.x + 8,
    y: state.player.y + TANGRAM_PLAYER_HEIGHT - 14,
    width: TANGRAM_PLAYER_WIDTH - 16,
    height: 16,
  };
  for (const hazard of level.hazards) {
    if (!intersects(feetRect, hazard)) continue;
    respawn(state, movement, `${hazard.label}! Start again from the checkpoint.`, events);
    return;
  }
}

function handleEnemies(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  movement: TangramMovementSpec,
  previousY: number,
  events: TangramPlatformerEvent[],
): void {
  if (state.invulnerableRemaining > 0) return;
  const playerRect = tangramPlayerRect(state);
  const previousBottom = previousY + TANGRAM_PLAYER_HEIGHT;
  for (let index = 0; index < state.enemies.length; index += 1) {
    const enemy = state.enemies[index];
    const definition = level.enemies[index];
    if (!enemy.active) continue;
    const enemyRect = { ...definition, x: enemy.x };
    if (!intersects(playerRect, enemyRect)) continue;
    if (state.player.velocityY > 0 && previousBottom <= definition.y + 10) {
      enemy.active = false;
      state.player.velocityY = -460;
      setHint(state, 'Nice stomp! Keep the class parade moving.', events);
      return;
    }
    respawn(state, movement, 'A critter bumped you back to safety.', events);
    return;
  }
}

function handleBoss(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  movement: TangramMovementSpec,
  previousY: number,
  events: TangramPlatformerEvent[],
): void {
  const boss = state.boss;
  const definition = level.boss;
  if (!boss?.active || !definition || boss.stunRemaining > 0 || state.invulnerableRemaining > 0) return;
  const playerRect = tangramPlayerRect(state);
  const bossRect = { ...definition, x: boss.x };
  if (!intersects(playerRect, bossRect)) return;
  const previousBottom = previousY + TANGRAM_PLAYER_HEIGHT;
  if (state.player.velocityY > 0 && previousBottom <= definition.y + 12) {
    boss.hitsRemaining -= 1;
    boss.stunRemaining = 0.8;
    boss.warningRemaining = 0;
    boss.charging = false;
    boss.chargeCooldown = 1.4;
    state.player.velocityY = -520;
    setHint(
      state,
      boss.hitsRemaining > 0
        ? `${definition.label} staggered — ${boss.hitsRemaining} more clean stomps.`
        : `${definition.label} cleared! The festival bell is open.`,
      events,
    );
    if (boss.hitsRemaining <= 0) {
      boss.hitsRemaining = 0;
      boss.active = false;
    }
    events.push({ type: 'hud' });
    return;
  }
  respawn(state, movement, `${definition.label} sent you back to the checkpoint.`, events);
}

function handleCheckpoint(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  events: TangramPlatformerEvent[],
): void {
  for (let index = level.checkpoints.length - 1; index > state.checkpointIndex; index -= 1) {
    const checkpoint = level.checkpoints[index];
    if (!intersects(tangramPlayerRect(state), checkpoint)) continue;
    state.checkpointActivated = true;
    state.checkpointIndex = index;
    state.respawnPoint = getTangramCheckpointRespawn(level, checkpoint) ?? state.respawnPoint;
    setHint(state, `Checkpoint reached: ${checkpoint.label}`, events);
    return;
  }
}

function handlePowerSnack(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  previousY: number,
  events: TangramPlatformerEvent[],
): void {
  const player = tangramPlayerRect(state);
  for (let index = 0; index < level.powerups.length; index += 1) {
    const block = level.powerups[index];
    const hitBlockFromBelow =
      !state.powerBlockHit[index] &&
      state.player.velocityY < 0 &&
      previousY >= block.y + block.height &&
      player.y + player.height > block.y &&
      player.y < block.y + block.height &&
      player.x < block.x + block.width &&
      player.x + player.width > block.x;
    if (hitBlockFromBelow) {
      state.powerBlockHit[index] = true;
      state.player.y = block.y + block.height;
      state.player.velocityY = 0;
      setHint(state, 'A super Tangram popped out!', events);
      continue;
    }
    if (
      !state.powerBlockHit[index] ||
      !state.powerSnackAvailable[index] ||
      !intersects(player, { ...block, y: block.y - 42 })
    ) continue;
    state.powerSnackAvailable[index] = false;
    state.powerRemaining = TANGRAM_POWER_DURATION;
    setHint(
      state,
      `${block.label} active! Bigger jumps and faster waddles for a short time.`,
      events,
    );
  }
}

function handleGoal(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  events: TangramPlatformerEvent[],
): void {
  if (state.goalPhase !== 'none') return;
  const player = tangramPlayerRect(state);
  if (!intersects(player, level.goal) && player.x + player.width < level.goal.x) return;
  const height = level.goal.y + level.goal.height - player.y;
  const badgeCount = clamp(Math.ceil(height / (level.goal.height / 3)), 1, 3);
  awardBadges(
    state,
    badgeCount,
    level.goal.x + level.goal.width / 2,
    player.y,
    events,
  );
  state.goalPhase = 'grab';
  state.goalFlagY = level.goal.y;
  state.player.x = level.goal.x + level.goal.width / 2 - TANGRAM_PLAYER_WIDTH / 2;
  state.player.velocityX = 0;
  state.player.velocityY = 0;
  state.player.grounded = false;
  setHint(state, 'Hold on to the Tangram flag!', events);
}

function updateGoalSequence(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  dt: number,
  events: TangramPlatformerEvent[],
): void {
  if (state.goalPhase === 'grab') {
    const grabY = clamp(
      state.player.y - 12,
      level.goal.y,
      level.goal.y + level.goal.height - 30,
    );
    state.goalFlagY = Math.min(grabY, state.goalFlagY + FLAG_TO_PLAYER_SPEED * dt);
    state.player.x = level.goal.x + level.goal.width / 2 - TANGRAM_PLAYER_WIDTH / 2;
    state.player.y = grabY + 12;
    if (state.goalFlagY < grabY) return;
    state.goalPhase = 'slide';
    events.push({ type: 'hud' });
  }
  if (state.goalPhase !== 'slide') return;
  const bottom = level.goal.y + level.goal.height - 30;
  state.goalFlagY = Math.min(bottom, state.goalFlagY + FLAG_SLIDE_SPEED * dt);
  state.player.x = level.goal.x + level.goal.width / 2 - TANGRAM_PLAYER_WIDTH / 2;
  state.player.y = state.goalFlagY + 12;
  state.player.velocityX = 0;
  state.player.velocityY = 0;
  if (state.goalFlagY >= bottom) {
    state.goalPhase = 'none';
    state.finished = true;
    events.push({ type: 'complete' });
  }
}

export function tickTangramPlatformer(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  movement: TangramMovementSpec,
  input: TangramPlatformerInput,
  dt: number,
  events: TangramPlatformerEvent[],
): void {
  if (state.finished) return;
  state.elapsedSeconds += dt;
  updateTimers(state, level, dt, events);
  if (state.goalPhase !== 'none') {
    updateGoalSequence(state, level, dt, events);
    return;
  }
  updateEnemies(state, level, dt);
  updateMovingPlatforms(state, level, dt);
  updateBoss(state, level, dt, events);
  const previousY = updatePlayer(state, level, movement, input, dt, events);
  handleBouncePads(state, level, events);
  handleCollectibles(state, level, events);
  handleGoal(state, level, events);
  if (state.finished) return;
  handleHazards(state, level, movement, events);
  handleEnemies(state, level, movement, previousY, events);
  handleBoss(state, level, movement, previousY, events);
  handleCheckpoint(state, level, events);
}

function jumpRiseForVelocity(jumpVelocity: number): number {
  return (jumpVelocity * jumpVelocity) / (2 * TANGRAM_GRAVITY);
}

function horizontalGapBetween(
  a: { x: number; width: number },
  b: { x: number; width: number },
): number {
  if (a.x + a.width < b.x) return b.x - (a.x + a.width);
  if (b.x + b.width < a.x) return a.x - (b.x + b.width);
  return 0;
}

export function buildTangramJumpAudit(
  level: TangramSimulationLevel,
  movement: TangramMovementSpec,
): TangramJumpAudit {
  const nodes = [
    { label: level.start.label, x: level.start.x, width: TANGRAM_PLAYER_WIDTH, topY: level.start.y },
    ...level.platforms.map((platform, index) => ({
      label: 'label' in platform && typeof platform.label === 'string'
        ? platform.label
        : `Platform ${index + 1}`,
      x: platform.x,
      width: platform.width,
      topY: platform.y - TANGRAM_PLAYER_HEIGHT,
    })),
    ...(level.movingPlatforms ?? []).map((platform, index) => ({
      label: `Moving platform ${index + 1}`,
      x: platform.x,
      width: platform.width,
      topY: platform.y - TANGRAM_PLAYER_HEIGHT,
    })),
  ];
  const reachable = new Set<number>([0]);
  const maxRiseByNode = new Map<number, number>([[0, 0]]);
  const jumpRise = jumpRiseForVelocity(Math.abs(movement.jumpVelocity));
  let changed = true;
  while (changed) {
    changed = false;
    for (let from = 0; from < nodes.length; from += 1) {
      if (!reachable.has(from)) continue;
      for (let to = 1; to < nodes.length; to += 1) {
        if (from === to || reachable.has(to)) continue;
        const rise = nodes[from].topY - nodes[to].topY;
        const gap = horizontalGapBetween(nodes[from], nodes[to]);
        const allowableGap = rise >= 0 ? 270 : 340;
        if (rise > jumpRise + 6 || gap > allowableGap) continue;
        reachable.add(to);
        maxRiseByNode.set(to, Math.max(maxRiseByNode.get(from) ?? 0, Math.max(0, rise)));
        changed = true;
      }
    }
  }
  const unreachable = nodes.slice(1).filter((_, index) => !reachable.has(index + 1)).map((node) => node.label);
  return {
    allCriticalPlatformsReachable: unreachable.length === 0,
    jumpRise,
    maxRequiredRise: Math.max(0, ...maxRiseByNode.values()),
    unreachable,
  };
}