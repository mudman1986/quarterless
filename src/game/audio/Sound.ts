/**
 * Tiny procedural sound effects via the Web Audio API. Every sound is
 * synthesised at runtime (no asset files, nothing copyrighted), and every call
 * is defensive: if Phaser did not select Web Audio, sounds silently no-op so
 * the game never throws.
 */
export type ProceduralAudioOutput = {
  context: AudioContext;
  destination: AudioNode;
};

export function shouldPlaySiren(
  status: 'playing' | 'busted' | 'wasted',
  wantedStars: number,
  policeCount: number,
): boolean {
  return status === 'playing' && wantedStars > 0 && policeCount > 0;
}

export class Sound {
  private output: ProceduralAudioOutput | null;
  private readonly activeTones = new Map<OscillatorNode, GainNode>();
  private destroyed = false;
  private muted = false;

  constructor(output: ProceduralAudioOutput | null = null) {
    this.output = output;
  }

  private handleToneEnded(oscillator: OscillatorNode): void {
    const gain = this.activeTones.get(oscillator);
    if (gain) this.disconnectTone(oscillator, gain);
  }

  /** Play a single decaying tone. */
  private blip(
    frequency: number,
    duration: number,
    type: OscillatorType = 'square',
    gain = 0.05,
    delay = 0,
  ): void {
    const output = this.output;
    if (this.destroyed || this.muted || !output || output.context.state === 'closed') return;
    let oscillator: OscillatorNode | null = null;
    let amplifier: GainNode | null = null;
    try {
      oscillator = output.context.createOscillator();
      amplifier = output.context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.connect(amplifier);
      amplifier.connect(output.destination);

      const start = output.context.currentTime + delay;
      amplifier.gain.setValueAtTime(gain, start);
      amplifier.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      this.activeTones.set(oscillator, amplifier);
      oscillator.onended = () => this.handleToneEnded(oscillator!);
      oscillator.start(start);
      oscillator.stop(start + duration);
    } catch {
      if (oscillator && amplifier) this.disconnectTone(oscillator, amplifier);
      /* ignore: audio is best-effort */
    }
  }

  private disconnectTone(oscillator: OscillatorNode, gain: GainNode): void {
    this.activeTones.delete(oscillator);
    oscillator.onended = null;
    try {
      oscillator.disconnect();
      gain.disconnect();
    } catch {
      /* ignore: nodes may already be disconnected */
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.output = null;
    for (const [oscillator, gain] of this.activeTones) {
      oscillator.onended = null;
      try {
        oscillator.stop();
      } catch {
        /* ignore: oscillator may already have stopped */
      }

      this.disconnectTone(oscillator, gain);
    }
    this.activeTones.clear();
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (!muted) return;
    for (const [oscillator, gain] of this.activeTones) {
      try {
        oscillator.stop();
      } catch {
        /* already stopped */
      }
      this.disconnectTone(oscillator, gain);
    }
  }

  /** A short, dry shot. */
  shot(): void {
    this.blip(220, 0.08, 'square', 0.035);
  }

  /** A light step-up cue for platformer landings. */
  land(): void {
    this.blip(180, 0.06, 'sine', 0.025);
  }

  /** A quick lift cue for a platformer jump. */
  jump(): void {
    this.blip(330, 0.1, 'triangle', 0.03);
  }

  /** A bright cue for collecting a Tangram badge. */
  collect(): void {
    this.blip(660, 0.07, 'triangle', 0.035);
    this.blip(990, 0.1, 'triangle', 0.03, 0.06);
  }

  /** A short flourish for a temporary power-up. */
  powerup(): void {
    this.blip(523, 0.08, 'triangle', 0.035);
    this.blip(659, 0.08, 'triangle', 0.035, 0.07);
    this.blip(784, 0.12, 'triangle', 0.035, 0.14);
  }

  /** A low confirmation cue for a boss stomp. */
  bossHit(): void {
    this.blip(120, 0.16, 'square', 0.05);
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

  /** One soft, alternating police pulse. Call repeatedly while a chase is on. */
  siren(): void {
    this.blip(440, 0.24, 'triangle', 0.018);
    this.blip(554, 0.24, 'triangle', 0.018, 0.22);
  }
}
