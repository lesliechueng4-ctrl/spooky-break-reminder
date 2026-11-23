// Unit tests for the Audio_Engine adapter (src/platform/audio/engine.ts). The Web Audio API is
// replaced by a hand-written fake AudioContext and fake timers, so each test runs the real engine
// against a recorded graph. Requirements: 4.4, 4.14, 5.4, 5.2, 6.8, 8.5, 9.3, 11.4, 13.7, 18.1,
// 18.2, 18.4, 18.5, 18.6, 18.7.
import { describe, expect, it, vi } from 'vitest';
import {
  createAudioEngine,
  type AudioBufferLike,
  type AudioContextLike,
  type AudioInput,
  type AudioParamLike,
  type BufferSourceLike,
  type GainNodeLike,
  type TimerApi,
  type TimerHandle,
} from '../src/platform/audio/engine';
import { createRng } from '../src/core/rng';
import type { ScheduleView } from '../src/core/scheduler';

interface ParamEvent {
  readonly kind: 'set' | 'ramp' | 'target' | 'cancel';
  readonly value?: number;
  readonly time: number;
  readonly timeConstant?: number;
}

class FakeParam implements AudioParamLike {
  readonly events: ParamEvent[] = [];

  setValueAtTime(value: number, time: number): void {
    this.events.push({ kind: 'set', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.events.push({ kind: 'ramp', value, time });
  }

  setTargetAtTime(target: number, startTime: number, timeConstant: number): void {
    this.events.push({ kind: 'target', value: target, time: startTime, timeConstant });
  }

  cancelScheduledValues(cancelTime: number): void {
    this.events.push({ kind: 'cancel', time: cancelTime });
  }

  /** The most recent target set with setTargetAtTime, or the most recent set value. */
  lastTarget(): number | undefined {
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      const event = this.events[i];
      if ((event.kind === 'target' || event.kind === 'set') && event.value !== undefined) return event.value;
    }
    return undefined;
  }
}

class FakeNode {
  readonly connections: unknown[] = [];

  connect(destination: unknown): unknown {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.connections.length = 0;
  }
}

class FakeGain extends FakeNode implements GainNodeLike {
  readonly gain = new FakeParam();
}

class FakeBuffer implements AudioBufferLike {
  readonly data: Float32Array;

  constructor(readonly duration: number, length: number) {
    this.data = new Float32Array(length);
  }

  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeSource extends FakeNode implements BufferSourceLike {
  buffer: AudioBufferLike | null = null;
  startedAt: number | null = null;
  stopAt: number | null = null;

  start(when = 0): void {
    if (this.startedAt !== null) throw new Error('start called twice');
    this.startedAt = when;
  }

  stop(when = 0): void {
    this.stopAt = when;
  }
}

class FakeContext implements AudioContextLike {
  state = 'suspended';
  currentTime = 0;
  readonly sampleRate = 48_000;
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  closed = false;
  /** The state that resume() leaves the context in. Set to 'reject' to make resume() fail. */
  resumeOutcome: string | 'reject' = 'running';
  private readonly stateListeners: Array<() => void> = [];

  resume(): Promise<void> {
    if (this.resumeOutcome === 'reject') return Promise.reject(new Error('audio blocked'));
    this.setState(this.resumeOutcome);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  createBuffer(_channels: number, length: number, sampleRate: number): FakeBuffer {
    return new FakeBuffer(length / sampleRate, length);
  }

  addEventListener(_type: 'statechange', listener: () => void): void {
    this.stateListeners.push(listener);
  }

  setState(state: string): void {
    this.state = state;
    for (const listener of this.stateListeners) listener();
  }
}

class FakeTimers implements TimerApi {
  private nextId = 1;
  private now = 0;
  private readonly pending = new Map<number, { due: number; callback: () => void }>();

  setTimeout(callback: () => void, ms: number): TimerHandle {
    const id = this.nextId;
    this.nextId += 1;
    this.pending.set(id, { due: this.now + ms, callback });
    return id as unknown as TimerHandle;
  }

  clearTimeout(handle: TimerHandle): void {
    this.pending.delete(handle as unknown as number);
  }

  /** Moves the fake time forward and runs every timer that comes due, in order. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      let next: { id: number; due: number; callback: () => void } | null = null;
      for (const [id, timer] of this.pending) {
        if (timer.due <= target && (next === null || timer.due < next.due)) {
          next = { id, due: timer.due, callback: timer.callback };
        }
      }
      if (next === null) break;
      this.pending.delete(next.id);
      this.now = next.due;
      next.callback();
    }
    this.now = target;
  }

  get size(): number {
    return this.pending.size;
  }
}

function haunting(level: 1 | 2 | 3 | 4 | 5, extra: { snoozeRemainingMs?: number; ritual?: 'eye' | 'breathing' | 'stretch' | null } = {}): ScheduleView {
  return {
    phase: 'haunting',
    level,
    breakType: 'micro',
    overdueMs: 0,
    overdueWholeMin: 0,
    escalationStepMs: 120_000,
    offered: ['eye'],
    snoozesLeft: 3,
    snoozeMs: 300_000,
    snoozeRemainingMs: extra.snoozeRemainingMs ?? 0,
    jumpScareShown: false,
    ritual: extra.ritual ?? null,
  };
}

const CALM: ScheduleView = {
  phase: 'calm',
  level: 0,
  remainingMs: 1_200_000,
  candleFraction: 1,
  nextBreak: 'micro',
  pause: null,
  ritual: null,
};

function input(view: ScheduleView, overrides: Partial<Omit<AudioInput, 'view'>> = {}): AudioInput {
  return {
    view,
    volume: 0.3,
    muted: false,
    idle: false,
    activeInstance: true,
    nightmare: false,
    ...overrides,
  };
}

function harness(options: { createContext?: () => AudioContextLike | null } = {}) {
  const ctx = new FakeContext();
  const timers = new FakeTimers();
  const errors: Array<{ message: string; error: unknown }> = [];
  const createContext = vi.fn(options.createContext ?? (() => ctx));
  const engine = createAudioEngine({
    rng: createRng(42),
    createContext,
    timers,
    onError: (message, error) => errors.push({ message, error }),
  });

  /** Moves the AudioContext clock and the fake timers forward together. */
  const advance = (seconds: number): void => {
    ctx.currentTime += seconds;
    timers.advance(seconds * 1000);
  };

  /** The gain that feeds the destination. */
  const master = (): FakeGain | undefined => ctx.gains.find((g) => g.connections.includes(ctx.destination));
  /** The gain that feeds the master gain. */
  const whisperBus = (): FakeGain | undefined => {
    const outputNode = master();
    return ctx.gains.find((g) => outputNode !== undefined && g.connections.includes(outputNode));
  };

  return { engine, ctx, timers, errors, createContext, advance, master, whisperBus };
}

async function unlocked(h: ReturnType<typeof harness>): Promise<void> {
  await h.engine.unlock();
}

describe('Audio_Engine unlock and blocked audio', () => {
  it('creates no AudioContext before a user gesture (Requirement 18.1)', () => {
    const h = harness();
    h.engine.update(input(haunting(5)));
    expect(h.createContext).not.toHaveBeenCalled();
    expect(h.engine.playChime()).toBe(false);
  });

  it('reports running once the gesture resumes the context (Requirement 18.1)', async () => {
    const h = harness();
    await unlocked(h);
    expect(h.createContext).toHaveBeenCalledTimes(1);
    expect(h.engine.getState().status).toBe('running');
  });

  it('shows the enable-sound state when the browser leaves the context suspended (Requirement 18.2)', async () => {
    const h = harness();
    h.ctx.resumeOutcome = 'suspended';
    await unlocked(h);
    expect(h.engine.getState().status).toBe('blocked');

    h.engine.update(input(haunting(5)));
    expect(h.engine.getState().outputGain).toBe(0);
    expect(h.errors).toEqual([]);
  });

  it('clears the enable-sound state when a later gesture resumes the context (Requirement 18.2)', async () => {
    const h = harness();
    h.ctx.resumeOutcome = 'suspended';
    await unlocked(h);
    h.ctx.resumeOutcome = 'running';
    await h.engine.unlock();
    expect(h.engine.getState().status).toBe('running');
  });

  it('reports blocked and logs the error when resume rejects, without throwing (Requirement 18.2)', async () => {
    const h = harness();
    h.ctx.resumeOutcome = 'reject';
    await expect(h.engine.unlock()).resolves.toBeUndefined();
    expect(h.engine.getState().status).toBe('blocked');
    expect(h.errors).toHaveLength(1);
  });

  it('reports unsupported when no AudioContext exists and never throws', async () => {
    const h = harness({ createContext: () => null });
    await unlocked(h);
    expect(h.engine.getState().status).toBe('unsupported');
    expect(() => h.engine.update(input(haunting(3)))).not.toThrow();
  });

  it('moves to blocked when a state change suspends a running context', async () => {
    const h = harness();
    await unlocked(h);
    h.ctx.setState('suspended');
    expect(h.engine.getState().status).toBe('blocked');
  });
});

describe('Audio_Engine gain (Requirements 18.4, 18.5, 11.4, 13.7)', () => {
  it('sets the master gain to Master_Volume while audible', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(CALM, { volume: 0.3 }));
    expect(h.master()?.gain.lastTarget()).toBeCloseTo(0.3, 10);
    expect(h.engine.getState().outputGain).toBeCloseTo(0.3, 10);
  });

  it('holds the master gain at zero while Mute is on, during a Snooze, when idle and in an inactive instance', async () => {
    const h = harness();
    await unlocked(h);

    h.engine.update(input(CALM, { muted: true }));
    expect(h.master()?.gain.lastTarget()).toBe(0);

    h.engine.update(input(CALM));
    h.engine.update(input(haunting(2, { snoozeRemainingMs: 60_000 })));
    expect(h.master()?.gain.lastTarget()).toBe(0);

    h.engine.update(input(CALM, { idle: true }));
    expect(h.master()?.gain.lastTarget()).toBe(0);

    h.engine.update(input(CALM, { activeInstance: false }));
    expect(h.master()?.gain.lastTarget()).toBe(0);
  });

  it('caps the master gain at Master_Volume while the scream and Whispers play (Requirement 18.4)', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(haunting(5), { volume: 0.2, nightmare: true }));
    expect(h.engine.playScream()).toBe(true);
    expect(h.engine.playChime()).toBe(true);
    expect(h.master()?.gain.lastTarget()).toBeCloseTo(0.2, 10);
    expect(h.engine.getState().outputGain).toBeCloseTo(0.2, 10);
    // The Whisper bus at level 5 is 100% of the master level, so it never adds gain above it.
    expect(h.whisperBus()?.gain.lastTarget()).toBe(1);
  });
});

describe('Audio_Engine voice envelopes (Requirements 5.4, 5.2, 6.8, 8.5, 9.3)', () => {
  it('ramps the completion chime from silence to its target over the 2.5 s attack (Requirement 5.4)', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(CALM));
    h.advance(10);
    expect(h.engine.playChime()).toBe(true);

    const voice = h.ctx.gains.at(-1);
    expect(voice?.gain.events).toEqual([
      { kind: 'set', value: 0, time: 10 },
      { kind: 'ramp', value: 1, time: 12.5 },
    ]);
    expect(h.ctx.sources.at(-1)?.startedAt).toBe(10);
  });

  it('ramps a breathing cue over the same 2.5 s attack (Requirements 5.4, 9.3)', async () => {
    const h = harness();
    await unlocked(h);
    expect(h.engine.playCue('inhale')).toBe(true);
    expect(h.engine.playCue('exhale')).toBe(true);
    const ramps = h.ctx.gains.flatMap((g) => g.gain.events.filter((e) => e.kind === 'ramp').map((e) => e.time));
    expect(ramps).toEqual([2.5, 2.5]);
  });

  it('refuses the scream outside Nightmare_Mode (Requirement 5.2)', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(haunting(5), { nightmare: false }));
    const sourcesBefore = h.ctx.sources.length;
    expect(h.engine.playScream()).toBe(false);
    expect(h.ctx.sources).toHaveLength(sourcesBefore);
  });

  it('plays the scream with its 10 ms attack in Nightmare_Mode (Requirements 6.8, 5.4)', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(haunting(5), { nightmare: true }));
    expect(h.engine.playScream()).toBe(true);
    const voice = h.ctx.gains.at(-1);
    expect(voice?.gain.events.find((e) => e.kind === 'ramp')).toEqual({ kind: 'ramp', value: 1, time: 0.01 });
  });
});

describe('Audio_Engine Whispers', () => {
  it('starts the first Whisper 3 s after level 3 begins and spaces the rest 20 to 40 s apart (Requirements 4.4, 18.7)', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(haunting(3)));

    for (let t = 1; t <= 150; t += 1) {
      h.advance(1);
      h.engine.update(input(haunting(3)));
    }

    const starts = h.ctx.sources.map((s) => s.startedAt);
    expect(starts.length).toBeGreaterThanOrEqual(4);
    expect(starts[0]).toBe(3);
    for (let i = 1; i < starts.length; i += 1) {
      const gap = (starts[i] ?? 0) - (starts[i - 1] ?? 0);
      expect(gap).toBeGreaterThanOrEqual(20);
      expect(gap).toBeLessThanOrEqual(40);
    }
  });

  it('keeps the next Whisper scheduled on the AudioContext clock without further updates (Requirement 18.7)', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(haunting(4)));
    // No update for the rest of the run, as in a hidden tab with no wake-ups.
    const starts = h.ctx.sources.map((s) => s.startedAt);
    expect(starts).toHaveLength(2);
    expect(starts[0]).toBe(3);
    const gap = (starts[1] ?? 0) - 3;
    expect(gap).toBeGreaterThanOrEqual(20);
    expect(gap).toBeLessThanOrEqual(40);
  });

  it('never schedules a Whisper below Haunting_Level 3 or in Calm_State', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(haunting(2)));
    h.engine.update(input(CALM));
    h.advance(120);
    h.engine.update(input(CALM));
    expect(h.ctx.sources).toHaveLength(0);
  });

  it('sets the Whisper gain to 40%, 70% and 100% of Master_Volume at levels 3, 4 and 5 (Requirement 18.6)', async () => {
    const h = harness();
    await unlocked(h);
    const expected: Array<[1 | 2 | 3 | 4 | 5, number]> = [
      [2, 0],
      [3, 0.4],
      [4, 0.7],
      [5, 1],
    ];
    for (const [level, gain] of expected) {
      h.engine.update(input(haunting(level)));
      expect(h.whisperBus()?.gain.lastTarget()).toBeCloseTo(gain, 10);
    }
  });

  it('cancels queued Whispers during a Snooze and schedules a new first Whisper after it (Requirements 11.4, 4.4)', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(haunting(3)));
    expect(h.ctx.sources).toHaveLength(2);
    h.advance(1);

    h.engine.update(input(haunting(3, { snoozeRemainingMs: 300_000 })));
    for (const source of h.ctx.sources) {
      expect(source.stopAt).toBe(1.3);
    }
    expect(h.ctx.sources).toHaveLength(2);

    h.advance(1);
    h.engine.update(input(haunting(3)));
    expect(h.ctx.sources).toHaveLength(4);
    expect(h.ctx.sources[2]?.startedAt).toBe(5);
  });

  it('cancels Whispers while a Ritual runs (design: state changes reschedule)', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(haunting(3)));
    h.engine.update(input(haunting(3, { ritual: 'eye' })));
    expect(h.ctx.sources.every((s) => s.stopAt !== null)).toBe(true);
    expect(h.engine.getState().whisper).toBeNull();
  });

  it('shows the caption from the Whisper start to its end and clears it afterwards (Requirement 4.14)', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(haunting(3)));

    expect(h.engine.getState().whisper).toBeNull();
    h.advance(3);
    expect(h.engine.getState().whisper).not.toBeNull();
    h.advance(3.4);
    expect(h.engine.getState().whisper).not.toBeNull();
    h.advance(0.2);
    expect(h.engine.getState().whisper).toBeNull();
  });

  it('plays Whispers and captions while Mute is on, with the output gain at zero', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(haunting(3), { muted: true }));
    expect(h.ctx.sources).toHaveLength(2);
    h.advance(3);
    expect(h.engine.getState().whisper).not.toBeNull();
    expect(h.engine.getState().outputGain).toBe(0);
  });
});

describe('Audio_Engine state and adapter errors (Requirement 18.2 and the error boundary)', () => {
  it('notifies subscribers and keeps notifying the rest when one listener throws', async () => {
    const h = harness();
    const seen: string[] = [];
    h.engine.subscribe(() => {
      throw new Error('listener broke');
    });
    h.engine.subscribe((state) => seen.push(state.status));
    await unlocked(h);
    expect(seen).toContain('running');
    expect(h.errors.length).toBeGreaterThan(0);
  });

  it('stops Whispers, closes the context and reports idle on dispose', async () => {
    const h = harness();
    await unlocked(h);
    h.engine.update(input(haunting(3)));
    h.engine.dispose();
    expect(h.ctx.sources.every((s) => s.stopAt !== null)).toBe(true);
    expect(h.ctx.closed).toBe(true);
    expect(h.engine.getState()).toEqual({ status: 'idle', whisper: null, outputGain: 0 });
    expect(h.timers.size).toBe(0);
  });
});
