/** Per-frame input state, decoupled from any specific input device. */
export interface Controls {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
  /** Context action: enter/exit a vehicle. */
  readonly action: boolean;
  /** Confirm / continue (e.g. dismiss the busted screen). */
  readonly confirm: boolean;
  /** Fire the equipped weapon. */
  readonly fire: boolean;
}

export const NO_CONTROLS: Controls = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  confirm: false,
  fire: false,
});

/** Build a Controls value, defaulting any unspecified buttons to released. */
export function controls(partial: Partial<Controls> = {}): Controls {
  return { ...NO_CONTROLS, ...partial };
}
