/**
 * Audio_Engine adapter (design: "Platform Adapters", audio/engine.ts; Requirements 4.4, 5.4, 8.5,
 * 9.3, 18.1-18.7, 25.4, 6.2, 6.8, 11.4, 13.7).
 *
 * The engine owns one AudioContext and a small graph:
 *
 *   voice (gain ramp from silence over its attack) -> bus -> master -> destination
 *
 * - The master gain is `masterGain()` from the core policy: Master_Volume while audible, zero
 *   for Mute, a Snooze, an idle or locked report, an inactive instance or locked audio. No voice
 *   can exceed it (Requirement 18.4).
 * - The Whisper bus carries `whisperGainFor(level)`, 40%, 70% and 100% of the master level for
 *   levels 3, 4 and 5 (Requirement 18.6).
 * - Each voice rises from silence over `attackMsFor()` (2.5 s in Office_Safe_Mode, 5.4).
 * - Whispers are pre-scheduled on the AudioContext clock, so a throttled timer cannot delay
 *   them (18.7). The first Whisper starts 3 s after level 3 begins. Each later one starts
 *   `nextWhisperDelayMs()` after the previous start (4.4). Two Whispers that have not started
 *   yet are always queued, so one late wake-up does not leave a gap.
 * - A Snooze, a Ritual, an idle report, an inactive instance, or a Haunting below level 3 cancels
 *   the queued Whispers. The next Whisper then waits for the first-delay rule again.
 * - The engine never starts the context by itself. Only `unlock()`, called from a user gesture,
 *   creates or resumes it (18.1). If the browser leaves it non-running, the status becomes
 *   `blocked`, and the UI shows the enable-sound control while the visuals keep running (18.2).
 * - Errors at the adapter boundary are reported and swallowed. They never stop the engine.
 *
 * The core supplies every rule. This file only maps them onto Web Audio nodes.
 */
import {
  attackMsFor,
  masterGain,
  nextWhisperDelayMs,
  whisperGainFor,
} from '../../core/audioPolicy';
import type { Rng } from '../../core/rng';
import type { ScheduleView } from '../../core/scheduler';
import {
  renderChime,
  renderCue,
  renderScream,
  renderWhisper,
  type CuePhase,
} from './synth';

/** Haunting_Level from which Whispers play (Requirement 4.4). */
export const WHISPER_MIN_LEVEL = 3;
/** Delay from the start of level 3 to the first Whisper, in seconds (design: Whisper schedule). */
export const WHISPER_FIRST_DELAY_S = 3;
/** Number of Whispers that must be queued and not yet started at all times. */
export const WHISPER_QUEUE_DEPTH = 2;

const MASTER_TIME_CONSTANT_S = 0.05;
const WHISPER_BUS_TIME_CONSTANT_S = 0.5;
const CANCEL_TIME_CONSTANT_S = 0.05;
/** A cancelled voice stops this long after the cancel, which is later than any fade. */
const CANCEL_STOP_AFTER_S = 0.3;
/** Smallest lead, in seconds, between "now" and a newly scheduled start. */
const MIN_LEAD_S = 0.05;

export type AudioStatus = 'idle' | 'running' | 'blocked' | 'unsupported';

/** A Whisper that is audible now. The UI maps `id` to the caption in the due Ritual's activity (4.13, 4.14). */
export interface WhisperCue {
  readonly id: number;
}

export interface AudioState {
  readonly status: AudioStatus;
  readonly whisper: WhisperCue | null;
  /** The master gain currently applied, in linear units. It never exceeds Master_Volume. */
  readonly outputGain: number;
}

/** The inputs the engine needs at each commit. Volume is a fraction in [0, 1]. */
export interface AudioInput {
  readonly view: ScheduleView;
  readonly volume: number;
  readonly muted: boolean;
  readonly idle: boolean;
  readonly activeInstance: boolean;
  /** Nightmare_Mode is on. The scream plays only while it is (Requirement 5.2). */
  readonly nightmare: boolean;
}

/*
 * The minimal part of the Web Audio API the engine uses. The tests implement it by hand. The
 * default factory adapts the real AudioContext at a single cast.
 */
export interface AudioParamLike {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
  cancelScheduledValues(cancelTime: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): unknown;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface AudioBufferLike {
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNodeLike;
  createBufferSource(): BufferSourceLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  addEventListener(type: 'statechange', listener: () => void): void;
}

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface TimerApi {
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export interface AudioEngineDeps {
  /** Seeded generator for Whisper delays and Whisper noise. A given seed replays the same Whispers. */
  rng: Rng;
  /**
   * Creates the context. Called only from `unlock()`, so the context is created inside the
   * user gesture. Returns null where Web Audio is missing. The default uses the global AudioContext.
   */
  createContext?: () => AudioContextLike | null;
  /** Timers for the Whisper captions. Tests inject fakes. */
  timers?: TimerApi;
  /** Receives every adapter error. The default logs to the console. */
  onError?: (message: string, error: unknown) => void;
}

export interface AudioEngine {
  /** Creates or resumes the context. Call it only from a user gesture handler (Requirement 18.1). */
  unlock(): Promise<void>;
  /** Applies the schedule view and the output settings. Safe to call at every commit. */
  update(input: AudioInput): void;
  /** Plays the Eye_Ritual completion chime (Requirement 8.5). */
  playChime(): boolean;
  /** Plays the cue tone for a breathing phase change (Requirement 9.3). */
  playCue(phase: CuePhase): boolean;
  /** Plays the Jump_Scare scream. It is refused outside Nightmare_Mode (Requirement 5.2). */
  playScream(): boolean;
  getState(): AudioState;
  /** Registers a listener for state changes. Returns the function that removes it. */
  subscribe(listener: (state: AudioState) => void): () => void;
  /** Cancels every Whisper, closes the context and stops the engine. */
  dispose(): void;
}

interface Voice {
  readonly source: BufferSourceLike;
  readonly gain: GainNodeLike;
}

interface PlannedWhisper {
  readonly id: number;
  readonly startAt: number;
  readonly endAt: number;
  readonly voice: Voice;
  readonly timers: TimerHandle[];
}

type SoundKey = 'chime' | 'cue-inhale' | 'cue-exhale' | 'scream';

interface Session {
  readonly ctx: AudioContextLike;
  readonly master: GainNodeLike;
  readonly whisperBus: GainNodeLike;
  readonly sounds: Map<SoundKey, AudioBufferLike>;
  appliedOutputGain: number;
  appliedBusGain: number;
}

const defaultTimers: TimerApi = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

function defaultCreateContext(): AudioContextLike | null {
  if (typeof AudioContext !== 'function') return null;
  // The browser's AudioContext implements the members listed in AudioContextLike. The cast
  // states that boundary; the members are not checked at runtime.
  return new AudioContext() as unknown as AudioContextLike;
}

function defaultReport(message: string, error: unknown): void {
  console.error(message, error);
}

export function createAudioEngine(deps: AudioEngineDeps): AudioEngine {
  const { rng } = deps;
  const createContext = deps.createContext ?? defaultCreateContext;
  const timers = deps.timers ?? defaultTimers;
  const report = deps.onError ?? defaultReport;

  let state: AudioState = { status: 'idle', whisper: null, outputGain: 0 };
  const listeners = new Set<(state: AudioState) => void>();
  let session: Session | null = null;
  let unlocking: Promise<void> | null = null;
  let nightmare = false;
  let planned: PlannedWhisper[] = [];
  let lastWhisperStartAt: number | null = null;
  let nextWhisperId = 1;

  /** Runs one adapter step. A thrown error is reported, and the engine keeps running. */
  function guard<T>(label: string, step: () => T): T | undefined {
    try {
      return step();
    } catch (error) {
      report(`Audio_Engine: ${label} failed`, error);
      return undefined;
    }
  }

  function publish(patch: Partial<AudioState>): void {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) {
      guard('state listener', () => listener(state));
    }
  }

  function setWhisper(cue: WhisperCue | null): void {
    if (state.whisper?.id === cue?.id) return;
    publish({ whisper: cue });
  }

  function refreshStatus(): void {
    if (session === null) return;
    publish({ status: session.ctx.state === 'running' ? 'running' : 'blocked' });
  }

  function buildSession(ctx: AudioContextLike): Session {
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.connect(ctx.destination);

    const whisperBus = ctx.createGain();
    whisperBus.gain.setValueAtTime(0, ctx.currentTime);
    whisperBus.connect(master);

    return {
      ctx,
      master,
      whisperBus,
      sounds: new Map(),
      appliedOutputGain: 0,
      appliedBusGain: 0,
    };
  }

  async function resumeContext(): Promise<void> {
    try {
      if (session === null) {
        const created = createContext();
        if (created === null) {
          publish({ status: 'unsupported' });
          return;
        }
        session = buildSession(created);
        created.addEventListener('statechange', () => {
          guard('statechange', () => {
            if (state.status === 'running' || state.status === 'blocked') refreshStatus();
          });
        });
      }
      await session.ctx.resume();
      refreshStatus();
    } catch (error) {
      report('Audio_Engine: could not start audio', error);
      publish({ status: 'blocked' });
    }
  }

  /** Builds a buffer from synthesized samples. */
  function bufferFrom(ctx: AudioContextLike, samples: Float32Array): AudioBufferLike {
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  }

  function soundBuffer(current: Session, key: SoundKey): AudioBufferLike {
    const cached = current.sounds.get(key);
    if (cached !== undefined) return cached;
    const rate = current.ctx.sampleRate;
    const samples = (() => {
      switch (key) {
        case 'chime':
          return renderChime(rate);
        case 'cue-inhale':
          return renderCue(rate, 'inhale');
        case 'cue-exhale':
          return renderCue(rate, 'exhale');
        case 'scream':
          return renderScream(rate, rng);
      }
    })();
    const buffer = bufferFrom(current.ctx, samples);
    current.sounds.set(key, buffer);
    return buffer;
  }

  /**
   * Starts a buffer through a gain ramp that rises from silence to `target` over `attackMs`.
   * The ramp is scheduled on the AudioContext clock at `startAt`.
   */
  function startVoice(
    ctx: AudioContextLike,
    buffer: AudioBufferLike,
    target: number,
    attackMs: number,
    startAt: number,
    bus: GainNodeLike,
  ): Voice {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(target, startAt + attackMs / 1000);
    gain.connect(bus);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(startAt);
    return { source, gain };
  }

  /** Silences a voice at `now` and stops its source shortly after. A voice that has not started yet stays silent. */
  function silence(voice: Voice, now: number): void {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, CANCEL_TIME_CONSTANT_S);
    voice.source.stop(now + CANCEL_STOP_AFTER_S);
  }

  function pruneWhispers(now: number): void {
    planned = planned.filter((whisper) => whisper.endAt > now);
  }

  function cancelWhispers(now: number): void {
    for (const whisper of planned) {
      for (const handle of whisper.timers) timers.clearTimeout(handle);
      guard('cancel Whisper', () => silence(whisper.voice, now));
    }
    planned = [];
    lastWhisperStartAt = null;
    setWhisper(null);
  }

  /** Queues one Whisper on the AudioContext clock and schedules its caption. */
  function scheduleWhisper(current: Session, now: number): void {
    const startAt = Math.max(
      lastWhisperStartAt === null
        ? now + WHISPER_FIRST_DELAY_S
        : lastWhisperStartAt + nextWhisperDelayMs(rng) / 1000,
      now + MIN_LEAD_S,
    );
    const samples = renderWhisper(current.ctx.sampleRate, rng);
    const buffer = bufferFrom(current.ctx, samples);
    const endAt = startAt + buffer.duration;
    const voice = startVoice(
      current.ctx,
      buffer,
      1,
      attackMsFor({ scream: false, nightmare }),
      startAt,
      current.whisperBus,
    );

    const id = nextWhisperId;
    nextWhisperId += 1;
    const captionOn = timers.setTimeout(
      () => guard('Whisper caption on', () => setWhisper({ id })),
      Math.max(0, (startAt - now) * 1000),
    );
    const captionOff = timers.setTimeout(
      () => guard('Whisper caption off', () => {
        if (state.whisper?.id === id) setWhisper(null);
      }),
      Math.max(0, (endAt - now) * 1000),
    );

    planned.push({ id, startAt, endAt, voice, timers: [captionOn, captionOff] });
    lastWhisperStartAt = startAt;
  }

  function queuedWhispers(now: number): number {
    return planned.filter((whisper) => whisper.startAt > now).length;
  }

  function applyView(current: Session, input: AudioInput): void {
    const { view } = input;
    const now = current.ctx.currentTime;
    const level = view.phase === 'haunting' ? view.level : 0;
    const snoozed = view.phase === 'haunting' && view.snoozeRemainingMs > 0;

    const outputGain = masterGain({
      volume: input.volume,
      muted: input.muted,
      snoozed,
      idle: input.idle,
      activeInstance: input.activeInstance,
      unlocked: state.status === 'running',
    });
    if (outputGain !== current.appliedOutputGain) {
      current.master.gain.setTargetAtTime(outputGain, now, MASTER_TIME_CONSTANT_S);
      current.appliedOutputGain = outputGain;
      publish({ outputGain });
    }

    const busGain = whisperGainFor(level);
    if (busGain !== current.appliedBusGain) {
      current.whisperBus.gain.setTargetAtTime(busGain, now, WHISPER_BUS_TIME_CONSTANT_S);
      current.appliedBusGain = busGain;
    }

    const whispersWanted =
      view.phase === 'haunting' &&
      view.level >= WHISPER_MIN_LEVEL &&
      !snoozed &&
      view.ritual === null &&
      !input.idle &&
      input.activeInstance &&
      state.status === 'running';

    if (!whispersWanted) {
      cancelWhispers(now);
      return;
    }

    pruneWhispers(now);
    while (queuedWhispers(now) < WHISPER_QUEUE_DEPTH) {
      scheduleWhisper(current, now);
    }
  }

  function playOneShot(key: SoundKey, attackMs: number): boolean {
    if (session === null || state.status !== 'running') return false;
    const current = session;
    startVoice(
      current.ctx,
      soundBuffer(current, key),
      1,
      attackMs,
      current.ctx.currentTime,
      current.master,
    );
    return true;
  }

  return {
    async unlock(): Promise<void> {
      if (state.status === 'running' || state.status === 'unsupported') return;
      if (unlocking === null) {
        unlocking = resumeContext().finally(() => {
          unlocking = null;
        });
      }
      await unlocking;
    },

    update(input: AudioInput): void {
      guard('update', () => {
        nightmare = input.nightmare;
        if (session === null) {
          // Before the first gesture there is no graph. The policy still answers with zero.
          const outputGain = masterGain({
            volume: input.volume,
            muted: input.muted,
            snoozed: input.view.phase === 'haunting' && input.view.snoozeRemainingMs > 0,
            idle: input.idle,
            activeInstance: input.activeInstance,
            unlocked: false,
          });
          if (outputGain !== state.outputGain) publish({ outputGain });
          return;
        }
        applyView(session, input);
      });
    },

    playChime(): boolean {
      return guard('playChime', () => playOneShot('chime', attackMsFor({ scream: false, nightmare }))) ?? false;
    },

    playCue(phase: CuePhase): boolean {
      const key: SoundKey = phase === 'inhale' ? 'cue-inhale' : 'cue-exhale';
      return guard('playCue', () => playOneShot(key, attackMsFor({ scream: false, nightmare }))) ?? false;
    },

    playScream(): boolean {
      if (!nightmare) return false;
      return guard('playScream', () => playOneShot('scream', attackMsFor({ scream: true, nightmare: true }))) ?? false;
    },

    getState(): AudioState {
      return state;
    },

    subscribe(listener: (state: AudioState) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose(): void {
      guard('dispose', () => {
        if (session !== null) cancelWhispers(session.ctx.currentTime);
        const closing = session?.ctx.close();
        session = null;
        if (closing !== undefined) void closing.catch((error: unknown) => report('Audio_Engine: close failed', error));
        publish({ status: 'idle', whisper: null, outputGain: 0 });
      });
    },
  };
}
