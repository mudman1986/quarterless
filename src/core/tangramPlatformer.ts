export const TANGRAM_FIXED_STEP = 1 / 60;
export const TANGRAM_MAX_SUBSTEPS = 5;
export const TANGRAM_MAX_FRAME_DT = 0.25;
export const TANGRAM_PLAYER_WIDTH = 52;
export const TANGRAM_PLAYER_HEIGHT = 72;
export const TANGRAM_POWER_DURATION = 12;

const PLAYER_GRAVITY = 2200;
const PLAYER_MAX_FALL_SPEED = 960;

export interface TangramRect {
  x: number;
  y: number;
  width: number;
  height: number;
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
  collectibles: ReadonlyArray<{ x: number; y: number; label: string; secret?: boolean }>;
  hazards: ReadonlyArray<TangramRect & { label: string }>;
  enemies: ReadonlyArray<
    TangramRect & { minX: number; maxX: number; speed: number }
  >;
  bouncePads?: ReadonlyArray<TangramRect & { label: string; strength: number }>;
  checkpoint: TangramRect & { label: string };
  goal: TangramRect;
  powerup: TangramRect & { label: string };
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

export interface TangramPlatformerState {
  player: TangramPlayerState;
  enemies: TangramEnemyState[];
  collected: boolean[];
  badgesCollected: number;
  checkpointActivated: boolean;
  respawnPoint: { x: number; y: number; label: string };
  falls: number;
  powerRemaining: number;
  powerSnackAvailable: boolean;
  invulnerableRemaining: number;
  hint: string;
  hintRemaining: number;
  elapsedSeconds: number;
  finished: boolean;
}

export interface TangramPlatformerInput {
  direction: -1 | 0 | 1;
  jumpPressed: boolean;
}

export type TangramPlatformerEvent =
  | { type: 'hud' }
  | { type: 'shake' }
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
    collected: level.collectibles.map(() => false),
    badgesCollected: 0,
    checkpointActivated: false,
    respawnPoint: { ...level.start },
    falls: 0,
    powerRemaining: 0,
    powerSnackAvailable: true,
    invulnerableRemaining: 0,
    hint: level.hint,
    hintRemaining: 0,
    elapsedSeconds: 0,
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
    enemy.x += definition.speed * enemy.direction * dt;
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

function resolveHorizontal(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  previousX: number,
): void {
  const playerRect = tangramPlayerRect(state);
  for (const platform of level.platforms) {
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
): void {
  const playerRect = tangramPlayerRect(state);
  for (const platform of level.platforms) {
    if (!intersects(playerRect, platform)) continue;
    const wasAbove = previousY + TANGRAM_PLAYER_HEIGHT <= platform.y;
    const wasBelow = previousY >= platform.y + platform.height;
    if (wasAbove && state.player.velocityY >= 0) {
      state.player.y = platform.y - TANGRAM_PLAYER_HEIGHT;
      state.player.velocityY = 0;
      state.player.grounded = true;
    } else if (wasBelow && state.player.velocityY < 0) {
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
    player.velocityY + PLAYER_GRAVITY * dt,
    -1800,
    PLAYER_MAX_FALL_SPEED,
  );
  player.y += player.velocityY * dt;
  player.grounded = false;
  resolveVertical(state, level, previousY);

  if (player.y > level.worldHeight + 120) {
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

function handleCheckpoint(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  events: TangramPlatformerEvent[],
): void {
  if (state.checkpointActivated || !intersects(tangramPlayerRect(state), level.checkpoint)) return;
  state.checkpointActivated = true;
  state.respawnPoint = {
    x: level.checkpoint.x + 12,
    y: level.checkpoint.y - 8,
    label: level.checkpoint.label,
  };
  setHint(state, `Checkpoint reached: ${level.checkpoint.label}`, events);
}

function handlePowerSnack(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  events: TangramPlatformerEvent[],
): void {
  if (!state.powerSnackAvailable || !intersects(tangramPlayerRect(state), level.powerup)) return;
  state.powerSnackAvailable = false;
  state.powerRemaining = TANGRAM_POWER_DURATION;
  setHint(
    state,
    `${level.powerup.label} active! Bigger jumps and faster waddles for a short time.`,
    events,
  );
}

function handleGoal(
  state: TangramPlatformerState,
  level: TangramSimulationLevel,
  events: TangramPlatformerEvent[],
): void {
  if (!intersects(tangramPlayerRect(state), level.goal)) return;
  if (state.badgesCollected < level.collectibles.length) {
    setHint(
      state,
      `You still need ${level.collectibles.length - state.badgesCollected} more Tangram badges.`,
      events,
    );
    return;
  }
  state.finished = true;
  events.push({ type: 'complete' });
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
  updateEnemies(state, level, dt);
  const previousY = updatePlayer(state, level, movement, input, dt, events);
  handleBouncePads(state, level, events);
  handleCollectibles(state, level, events);
  handleHazards(state, level, movement, events);
  handleEnemies(state, level, movement, previousY, events);
  handleCheckpoint(state, level, events);
  handlePowerSnack(state, level, events);
  handleGoal(state, level, events);
}

function jumpRiseForVelocity(jumpVelocity: number): number {
  return (jumpVelocity * jumpVelocity) / (2 * PLAYER_GRAVITY);
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