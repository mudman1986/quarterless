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
  ): void {
    const output = this.output;
    if (this.destroyed || !output || output.context.state === 'closed') return;
    let oscillator: OscillatorNode | null = null;
    let amplifier: GainNode | null = null;
    try {
      oscillator = output.context.createOscillator();
      amplifier = output.context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.connect(amplifier);
      amplifier.connect(output.destination);

      const now = output.context.currentTime;
      amplifier.gain.setValueAtTime(gain, now);
      amplifier.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      this.activeTones.set(oscillator, amplifier);
      oscillator.onended = () => this.handleToneEnded(oscillator!);
      oscillator.start(now);
      oscillator.stop(now + duration);
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
