import { clamp } from '../../core/math';
import { NO_CONTROLS, controls, type Controls } from '../../core/types';
import { add, length, scale, sub, type Vec2, vec2 } from '../../core/vector';

const STICK_DEAD_ZONE_RATIO = 0.24;
const STICK_CAPTURE_RATIO = 1.45;
const STICK_KNOB_RATIO = 0.42;
const STICK_TRAVEL_RATIO = 0.56;

export interface TouchCircle {
  center: Vec2;
  radius: number;
}

export interface TouchStickLayout extends TouchCircle {
  captureRadius: number;
  deadZone: number;
  maxOffset: number;
  knobRadius: number;
}

export interface TouchLayout {
  move: TouchStickLayout;
  action: TouchCircle;
  fire: TouchCircle;
  confirm?: TouchCircle;
}

export interface TouchSnapshot {
  controls: Controls;
  movePointer: Vec2 | null;
  knob: Vec2;
  actionPressed: boolean;
  firePressed: boolean;
  confirmPressed: boolean;
}

export interface TouchCapabilities {
  maxTouchPoints?: number;
  coarsePointer?: boolean;
}

export function touchSupported(capabilities: TouchCapabilities): boolean {
  return (capabilities.maxTouchPoints ?? 0) > 0 || !!capabilities.coarsePointer;
}

export function touchDeviceLikely(): boolean {
  return touchSupported({
    maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
    coarsePointer: typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches,
  });
}

/** Screen-space layout for tablet/phone touch controls. */
export function touchLayoutForViewport(width: number, height: number): TouchLayout {
  const span = Math.min(width, height);
  const margin = clamp(span * 0.035, 18, 34);
  const stickRadius = clamp(span * 0.1, 48, 74);
  const buttonRadius = clamp(span * 0.078, 40, 62);
  const confirmRadius = clamp(span * 0.038, 18, 28);
  return {
    move: {
      center: vec2(margin + stickRadius, height - margin - stickRadius),
      radius: stickRadius,
      captureRadius: stickRadius * STICK_CAPTURE_RATIO,
      deadZone: stickRadius * STICK_DEAD_ZONE_RATIO,
      maxOffset: stickRadius * STICK_TRAVEL_RATIO,
      knobRadius: stickRadius * STICK_KNOB_RATIO,
    },
    action: {
      center: vec2(width - margin - buttonRadius * 2.25, height - margin - buttonRadius * 0.95),
      radius: buttonRadius,
    },
    fire: {
      center: vec2(width - margin - buttonRadius, height - margin - buttonRadius * 2.3),
      radius: buttonRadius,
    },
    confirm: {
      center: vec2(width - margin - confirmRadius, margin + confirmRadius),
      radius: confirmRadius,
    },
  };
}

function insideCircle(point: Vec2, circle: TouchCircle): boolean {
  return length(sub(point, circle.center)) <= circle.radius;
}

function nearestTouch(points: readonly Vec2[], center: Vec2, radius: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestDistance = Infinity;
  for (const point of points) {
    const d = length(sub(point, center));
    if (d > radius || d >= bestDistance) continue;
    best = point;
    bestDistance = d;
  }
  return best;
}

/** Clamp a thumb-stick drag so the knob never leaves its travel circle. */
export function clampStick(point: Vec2 | null, stick: TouchStickLayout): Vec2 {
  if (!point) return stick.center;
  const delta = sub(point, stick.center);
  const d = length(delta);
  if (d === 0 || d <= stick.maxOffset) return point;
  return add(stick.center, scale(delta, stick.maxOffset / d));
}

export function emptyTouchSnapshot(center: Vec2 = vec2(0, 0)): TouchSnapshot {
  return {
    controls: NO_CONTROLS,
    movePointer: null,
    knob: center,
    actionPressed: false,
    firePressed: false,
    confirmPressed: false,
  };
}

export function readTouchSnapshot(points: readonly Vec2[], layout: TouchLayout): TouchSnapshot {
  const movePointer = nearestTouch(points, layout.move.center, layout.move.captureRadius);
  const knob = clampStick(movePointer, layout.move);
  const delta = sub(knob, layout.move.center);
  const actionPressed = points.some((point) => insideCircle(point, layout.action));
  const firePressed = points.some((point) => insideCircle(point, layout.fire));
  const confirmPressed = !!layout.confirm && points.some((point) => insideCircle(point, layout.confirm!));

  return {
    controls: controls({
      up: delta.y <= -layout.move.deadZone,
      down: delta.y >= layout.move.deadZone,
      left: delta.x <= -layout.move.deadZone,
      right: delta.x >= layout.move.deadZone,
      action: actionPressed,
      fire: firePressed,
      confirm: confirmPressed,
    }),
    movePointer,
    knob,
    actionPressed,
    firePressed,
    confirmPressed,
  };
}

/** Merge several device inputs into one engine-agnostic `Controls` value. */
export function mergeControls(...parts: Controls[]): Controls {
  return parts.reduce(
    (merged, part) => ({
      up: merged.up || part.up,
      down: merged.down || part.down,
      left: merged.left || part.left,
      right: merged.right || part.right,
      action: merged.action || part.action,
      confirm: merged.confirm || part.confirm,
      fire: merged.fire || part.fire,
    }),
    controls(),
  );
}