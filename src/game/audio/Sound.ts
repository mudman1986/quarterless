/**
 * Tiny procedural sound effects via the Web Audio API. Every sound is
 * synthesised at runtime (no asset files, nothing copyrighted), and every call
 * is defensive: if Web Audio is unavailable or blocked, sounds silently no-op
 * so the game never throws. Browsers suspend audio until a user gesture, so
 * call {@link Sound.resume} from an input handler to unlock playback.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private available = true;

  /** Lazily create (and resume) the audio context, or null if unavailable. */
  private context(): AudioContext | null {
    if (!this.available) return null;
    try {
      if (typeof AudioContext === 'undefined') {
        this.available = false;
        return null;
      }
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      this.available = false;
      return null;
    }
  }

  /** Unlock audio in response to a user gesture (browsers require this). */
  resume(): void {
    this.context();
  }

  /** Play a single decaying tone. */
  private blip(
    frequency: number,
    duration: number,
    type: OscillatorType = 'square',
    gain = 0.05,
  ): void {
    const ctx = this.context();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      osc.connect(amp);
      amp.connect(ctx.destination);

      const now = ctx.currentTime;
      amp.gain.setValueAtTime(gain, now);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      /* ignore: audio is best-effort */
    }
  }

  /** A short, dry shot. */
  shot(): void {
    this.blip(220, 0.08, 'square', 0.035);
  }

  /** A low thud for an elimination. */
  hit(): void {
    this.blip(130, 0.14, 'sawtooth', 0.05);
  }

  /** A descending tone for being busted or wasted. */
  fail(): void {
    this.blip(180, 0.25, 'sine', 0.06);
    this.blip(90, 0.4, 'sine', 0.06);
  }

  /** A bright two-note flourish for completing a mission. */
  fanfare(): void {
    this.blip(523, 0.12, 'triangle', 0.05);
    this.blip(784, 0.18, 'triangle', 0.05);
  }

  /** A low, noisy boom for a car explosion. */
  explosion(): void {
    this.blip(90, 0.35, 'sawtooth', 0.08);
    this.blip(55, 0.5, 'square', 0.06);
  }

  /** One wail of a police siren (two alternating tones). Call repeatedly while
   * a chase is on to get a continuous effect. */
  siren(): void {
    this.blip(740, 0.18, 'sine', 0.03);
    this.blip(580, 0.18, 'sine', 0.03);
  }
}
