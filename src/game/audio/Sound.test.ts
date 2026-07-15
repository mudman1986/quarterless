import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldPlaySiren, Sound } from './Sound';

class FakeAudioNode {
  connectedTo: unknown = null;
  disconnectCalls = 0;

  connect(destination: unknown): unknown {
    this.connectedTo = destination;
    return destination;
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.connectedTo = null;
  }
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

class FakeOscillatorNode extends FakeAudioNode {
  type: OscillatorType = 'sine';
  readonly frequency = { value: 0 };
  onended: ((event: Event) => void) | null = null;
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FakeAudioContext {
  readonly state = 'running';
  readonly currentTime = 12;
  readonly destination = new FakeAudioNode();
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly gains: FakeGainNode[] = [];

  createOscillator(): OscillatorNode {
    const oscillator = new FakeOscillatorNode();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }
}

type ManagedSoundConstructor = new (output?: {
  context: AudioContext;
  destination: AudioNode;
}) => Sound & { destroy?: () => void };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sound', () => {
  it('stops scheduling the siren when wanted stars reach zero', () => {
    expect(shouldPlaySiren('playing', 2, 2)).toBe(true);
    expect(shouldPlaySiren('playing', 0, 2)).toBe(false);
  });

  it('does not create an independent AudioContext', () => {
    let globalContextCount = 0;
    class GlobalAudioContext extends FakeAudioContext {
      constructor() {
        super();
        globalContextCount += 1;
      }
    }
    vi.stubGlobal('AudioContext', GlobalAudioContext);
    const ManagedSound = Sound as ManagedSoundConstructor;

    new ManagedSound().shot();

    expect(globalContextCount).toBe(0);
  });

  it('routes tones through the managed destination and disconnects them on destroy', () => {
    const managedContext = new FakeAudioContext();
    const managedDestination = new FakeAudioNode();
    let globalContextCount = 0;
    class GlobalAudioContext extends FakeAudioContext {
      constructor() {
        super();
        globalContextCount += 1;
      }
    }
    vi.stubGlobal('AudioContext', GlobalAudioContext);
    const ManagedSound = Sound as ManagedSoundConstructor;
    const sound = new ManagedSound({
      context: managedContext as unknown as AudioContext,
      destination: managedDestination as unknown as AudioNode,
    });

    sound.shot();

    expect(globalContextCount).toBe(0);
    expect(managedContext.oscillators).toHaveLength(1);
    expect(managedContext.gains).toHaveLength(1);
    expect(managedContext.gains[0].connectedTo).toBe(managedDestination);
    expect(sound.destroy).toBeTypeOf('function');

    sound.destroy?.();

    expect(managedContext.oscillators[0].stop).toHaveBeenCalledTimes(2);
    expect(managedContext.oscillators[0].disconnectCalls).toBe(1);
    expect(managedContext.gains[0].disconnectCalls).toBe(1);
  });

  it('releases a tone when its oscillator ends without a current target', () => {
    const managedContext = new FakeAudioContext();
    const sound = new Sound({
      context: managedContext as unknown as AudioContext,
      destination: managedContext.destination as unknown as AudioNode,
    });

    sound.shot();
    managedContext.oscillators[0].onended?.({ currentTarget: null } as unknown as Event);

    expect((sound as unknown as { activeTones: Map<unknown, unknown> }).activeTones.size).toBe(0);
    expect(managedContext.oscillators[0].disconnectCalls).toBe(1);
    expect(managedContext.gains[0].disconnectCalls).toBe(1);
  });
});