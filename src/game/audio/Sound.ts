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
  private lastSirenAt = 0;

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

  resume(): void {
    this.context();
  }

  private blip(
    frequency: number,
    duration: number,
    type: OscillatorType = 'square',
    gain = 0.05,
    whenOffset = 0,
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

      const now = ctx.currentTime + whenOffset;
      amp.gain.setValueAtTime(gain, now);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      /* ignore: audio is best-effort */
    }
  }

  shot(): void {
    this.blip(220, 0.08, 'square', 0.035);
  }

  hit(): void {
    this.blip(130, 0.14, 'sawtooth', 0.05);
  }

  fail(): void {
    this.blip(180, 0.25, 'sine', 0.06);
    this.blip(90, 0.4, 'sine', 0.06, 0.04);
  }

  fanfare(): void {
    this.blip(523, 0.12, 'triangle', 0.05);
    this.blip(784, 0.18, 'triangle', 0.05, 0.12);
  }

  explosion(): void {
    this.blip(80, 0.3, 'sawtooth', 0.08);
    this.blip(42, 0.5, 'triangle', 0.08, 0.04);
  }

  siren(): void {
    const ctx = this.context();
    if (!ctx) return;
    if (ctx.currentTime - this.lastSirenAt < 0.55) return;
    this.lastSirenAt = ctx.currentTime;
    this.blip(660, 0.16, 'square', 0.025);
    this.blip(880, 0.16, 'square', 0.025, 0.18);
  }
}
