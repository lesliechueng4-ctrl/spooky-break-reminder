// Ritual session (design: "Core: Rituals" and "Runtime Loop"; Requirements 2.5, 2.6, 4.11, 7.3-7.9, 8.5,
// 9.3, 13.5, 17.5).
//
// The session runs one Ritual at a time. It owns the pure Ritual state machine, feeds it the monotonic
// clock (performance.now() through the injected Clock) for every input, plays the chime and the cue
// tones, and publishes a snapshot for the Ritual dialog. Start, completion and end are reported through
// callbacks. The composition root (src/app/main.tsx) wires them to engine.dispatch, so this module never
// changes the schedule itself.
//
// A Ritual is presented by one document: the App document, or the Ghost_Window when it was started there
// (Requirement 17.5). The presenting document decides the pause and the timeout (Requirement 7.7, 7.8), and
// its own timers drive the countdown, because a background window is throttled. The presenter is set when
// the Ritual starts and cleared when it ends.
//
// The session reads the clock only here. The state machines in src/core stay pure.
import { computed, signal, type ReadonlySignal } from '@preact/signals';
import { breathingGuide, breathingOutcome, breathingStep, startBreathing, type BreathingInput, type BreathingState } from '../core/rituals/breathing';
import type { RitualOutcome } from '../core/rituals/common';
import { eyeOutcome, eyeStep, startEye, type EyeInput, type EyeState } from '../core/rituals/eye';
import { startStretch, stretchOutcome, stretchStep, type StretchInput, type StretchState } from '../core/rituals/stretch';
import type { RitualKind, RitualOrigin } from '../core/scheduler';
import type { Clock } from '../platform/clock';
import type { VisibilitySource } from '../platform/ticker';
import type { RitualIntent, RitualSnapshot } from '../ui/rituals/types';
import type { AudioPort } from './store';

/** Wake-up interval of the countdowns in visible time. Hidden documents are throttled by the browser. */
export const RITUAL_TICK_MS = 100;

/** The document that presents a Ritual: the App document, or the Ghost_Window (Requirement 17.5). */
export type RitualSurface = 'app' | 'ghost';

/** Timers of a presenting window. A Ritual in the Ghost_Window uses that window's timers, not the App's. */
export interface RitualTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** The document that presents a Ritual, with its visibility and its timers. */
export interface RitualPresenter {
  readonly surface: RitualSurface;
  readonly visibility: VisibilitySource;
  readonly timers: RitualTimers;
}

/** Result of a Ritual that ended, reported once to the engine. */
export interface RitualFinish {
  readonly kind: RitualKind;
  readonly status: 'completed' | 'ended';
  /**
   * Wall-clock time of the end. A Ritual that timed out while its document was hidden is stamped at
   * `hiddenAt + 60 s` (Requirement 7.8), even when the user returns later.
   */
  readonly atWall: number;
}

export interface RitualSessionDeps {
  readonly clock: Clock;
  /** Visibility of the App document. It presents a Ritual unless the Ritual starts in the Ghost_Window. */
  readonly visibility: VisibilitySource;
  readonly audio: Pick<AudioPort, 'unlock' | 'playChime' | 'playCue'>;
  /** Reports the start to the engine as `ritualStarted`. */
  readonly onStarted: (kind: RitualKind, origin: RitualOrigin) => void;
  /** Reports the end to the engine as `ritualCompleted` or `ritualEnded`. */
  readonly onFinished: (finish: RitualFinish) => void;
  /**
   * Reports that the presenting document became hidden, at wall-clock time `atWall`. The engine starts the 60 s
   * hidden deadline from it, so the Ritual ends at `atWall + 60 s` even when the browser delays this session's timers
   * (Requirement 7.8).
   */
  readonly onHidden?: (atWall: number) => void;
  /** Reports that the presenting document became visible again, at wall-clock time `atWall`. It clears the hidden deadline. */
  readonly onVisible?: (atWall: number) => void;
  /** Receives adapter errors. Defaults to console.error. */
  readonly report?: (message: string, error: unknown) => void;
  /** Countdown wake-up interval in milliseconds. Defaults to RITUAL_TICK_MS. */
  readonly tickMs?: number;
}

export interface RitualSession {
  /** The Ritual on screen, or null when none runs. */
  readonly snapshot: ReadonlySignal<RitualSnapshot | null>;
  /** Progress in [0, 1] of the running Ritual, or 0 when none runs. It scales the effects (4.11). */
  readonly progress: ReadonlySignal<number>;
  /** The document that presents the running Ritual, or null when none runs. */
  readonly presenter: ReadonlySignal<RitualSurface | null>;
  /**
   * Starts a Ritual. Call it from a user gesture, because the chime and the cues need the audio
   * unlocked (Requirement 18.1). `presenter` defaults to the App document. Returns false when a Ritual
   * already runs.
   */
  start(kind: RitualKind, origin: RitualOrigin, presenter?: RitualPresenter): boolean;
  /** Feeds one user intent to the running Ritual. Without a Ritual the call does nothing. */
  input(intent: RitualIntent): void;
  /**
   * Ends the running Ritual without completion when `surface` presents it. The Ghost_Window calls this when
   * it closes (Requirement 17.5 and the close rule of task 15.5).
   */
  endPresentedBy(surface: RitualSurface): void;
  /**
   * Drops the session without reporting it. Used when the engine has already cleared the Ritual, for
   * example after an Away_Exorcism (Requirement 13.5).
   */
  cancel(): void;
  /** Stops the countdown and removes the visibility listener. */
  dispose(): void;
}

type Machine =
  | { readonly kind: 'eye'; readonly state: EyeState }
  | { readonly kind: 'breathing'; readonly state: BreathingState }
  | { readonly kind: 'stretch'; readonly state: StretchState };

/** What the session feeds to a machine: a timer tick, a visibility change, or a user intent. */
type Signal = { readonly type: 'tick' | 'hidden' | 'visible' } | RitualIntent;

interface Active {
  readonly origin: RitualOrigin;
  readonly presenter: RitualPresenter;
  /** Removes the visibility listener of the presenting document. Set right after the Ritual starts. */
  unsubscribe: (() => void) | null;
  machine: Machine;
  /** Breathing phase last cued, so the cue plays once per change (9.3). */
  phase: 'inhale' | 'exhale';
  /** Handle of the pending countdown tick, or null. */
  timer: unknown;
}

const defaultReport = (message: string, error: unknown): void => {
  console.error(`[ritual] ${message}`, error);
};

/** The App document's timers. */
const globalTimers: RitualTimers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function startMachine(kind: RitualKind, at: number): Machine {
  switch (kind) {
    case 'eye':
      return { kind, state: startEye(at) };
    case 'breathing':
      return { kind, state: startBreathing(at) };
    case 'stretch':
      return { kind, state: startStretch(at) };
  }
}

function isTime(signal: Signal): signal is { readonly type: 'tick' | 'hidden' | 'visible' } {
  return signal.type === 'tick' || signal.type === 'hidden' || signal.type === 'visible';
}

/** Maps one signal to the input of the Eye_Ritual, or null when the Eye_Ritual ignores it. */
function eyeInput(at: number, signal: Signal): EyeInput | null {
  if (isTime(signal)) {
    switch (signal.type) {
      case 'tick':
        return { type: 'tick', at };
      case 'hidden':
        return { type: 'hidden', at };
      case 'visible':
        return { type: 'visible', at };
    }
  }
  if (signal.type === 'press') return { type: 'input', at, onAbandon: false };
  if (signal.type === 'key') return { type: 'input', at, onAbandon: false, key: signal.key };
  return null;
}

function breathingInput(at: number, signal: Signal): BreathingInput | null {
  if (isTime(signal)) {
    switch (signal.type) {
      case 'tick':
        return { type: 'tick', at };
      case 'hidden':
        return { type: 'hidden', at };
      case 'visible':
        return { type: 'visible', at };
    }
  }
  if (signal.type === 'press') return { type: 'press', at, repeat: signal.repeat === true };
  if (signal.type === 'release') return { type: 'release', at };
  return null;
}

function stretchInput(at: number, signal: Signal): StretchInput | null {
  if (isTime(signal)) {
    switch (signal.type) {
      case 'tick':
        return { type: 'tick', at };
      case 'hidden':
        return { type: 'hidden', at };
      case 'visible':
        return { type: 'visible', at };
    }
  }
  if (signal.type === 'done') return { type: 'done', at };
  return null;
}

/** Feeds one signal to the machine. A signal the machine does not use returns the same machine. */
function stepMachine(machine: Machine, at: number, signal: Signal): Machine {
  switch (machine.kind) {
    case 'eye': {
      const input = eyeInput(at, signal);
      return input === null ? machine : { kind: 'eye', state: eyeStep(machine.state, input) };
    }
    case 'breathing': {
      const input = breathingInput(at, signal);
      return input === null ? machine : { kind: 'breathing', state: breathingStep(machine.state, input) };
    }
    case 'stretch': {
      const input = stretchInput(at, signal);
      return input === null ? machine : { kind: 'stretch', state: stretchStep(machine.state, input) };
    }
  }
}

function outcomeOf(machine: Machine): RitualOutcome {
  switch (machine.kind) {
    case 'eye':
      return eyeOutcome(machine.state);
    case 'breathing':
      return breathingOutcome(machine.state);
    case 'stretch':
      return stretchOutcome(machine.state);
  }
}

function snapshotOf(active: Active): RitualSnapshot {
  const outcome = outcomeOf(active.machine);
  const { origin } = active;
  switch (active.machine.kind) {
    case 'eye':
      return { kind: 'eye', origin, outcome, state: active.machine.state };
    case 'breathing':
      return { kind: 'breathing', origin, outcome, state: active.machine.state };
    case 'stretch':
      return { kind: 'stretch', origin, outcome, state: active.machine.state };
  }
}

export function createRitualSession(deps: RitualSessionDeps): RitualSession {
  const { clock, audio, onStarted, onFinished } = deps;
  const report = deps.report ?? defaultReport;
  const tickMs = deps.tickMs ?? RITUAL_TICK_MS;
  const appPresenter: RitualPresenter = { surface: 'app', visibility: deps.visibility, timers: globalTimers };

  const snapshot = signal<RitualSnapshot | null>(null);
  const presenter = signal<RitualSurface | null>(null);
  const progress = computed(() => snapshot.value?.outcome.progress ?? 0);
  let active: Active | null = null;

  function stopTimer(current: Active): void {
    if (current.timer !== null) {
      current.presenter.timers.clearTimeout(current.timer);
      current.timer = null;
    }
  }

  /** Clears the session: the countdown, the visibility listener and the published state. */
  function release(current: Active): void {
    stopTimer(current);
    current.unsubscribe?.();
    current.unsubscribe = null;
    active = null;
    snapshot.value = null;
    presenter.value = null;
  }

  function publish(): void {
    snapshot.value = active === null ? null : snapshotOf(active);
  }

  function finish(status: 'completed' | 'ended', endedAt: number): void {
    const current = active;
    if (current === null) return;
    // Clear the session before reporting, so the engine's view update finds no Ritual to cancel.
    release(current);
    if (status === 'completed') audio.playChime();

    const reading = { wall: clock.wall(), mono: clock.mono() };
    const atWall = reading.wall - Math.max(0, reading.mono - endedAt);
    onFinished({ kind: current.machine.kind, status, atWall });
  }

  /** Feeds one signal at the current monotonic time and reports the end if the Ritual reached one. */
  function apply(signal: Signal): void {
    const current = active;
    if (current === null) return;
    const at = clock.mono();
    current.machine = stepMachine(current.machine, at, signal);

    if (current.machine.kind === 'breathing') {
      const phase = breathingGuide(current.machine.state).phase;
      if (phase !== current.phase) {
        current.phase = phase;
        audio.playCue(phase);
      }
    }

    const outcome = outcomeOf(current.machine);
    if (outcome.status === 'completed' || outcome.status === 'ended') {
      finish(outcome.status, current.machine.state.endedAt ?? at);
      return;
    }
    publish();
  }

  /** Reports a visibility change of the presenting document before the machine applies it. */
  function reportVisibility(hidden: boolean): void {
    const atWall = clock.wall();
    if (hidden) {
      deps.onHidden?.(atWall);
    } else {
      deps.onVisible?.(atWall);
    }
  }

  function scheduleTick(current: Active): void {
    current.timer = current.presenter.timers.setTimeout(() => {
      if (active !== current) return;
      current.timer = null;
      apply({ type: 'tick' });
      if (active === current) scheduleTick(current);
    }, tickMs);
  }

  function start(kind: RitualKind, origin: RitualOrigin, target: RitualPresenter = appPresenter): boolean {
    if (active !== null) return false;

    // The unlock is called synchronously, inside the click that started the Ritual (Requirement 18.1).
    try {
      audio.unlock().catch((error: unknown) => report('audio could not be unlocked', error));
    } catch (error) {
      report('audio could not be unlocked', error);
    }

    const current: Active = {
      origin,
      presenter: target,
      unsubscribe: null,
      machine: startMachine(kind, clock.mono()),
      phase: 'inhale',
      timer: null,
    };
    active = current;
    presenter.value = target.surface;
    current.unsubscribe = target.visibility.subscribe(() => {
      if (active !== current) return;
      const hidden = target.visibility.isHidden();
      reportVisibility(hidden);
      apply({ type: hidden ? 'hidden' : 'visible' });
    });
    onStarted(kind, origin);
    publish();
    if (target.visibility.isHidden()) {
      reportVisibility(true);
      apply({ type: 'hidden' });
    }
    if (active === current) scheduleTick(current);
    return true;
  }

  function input(intent: RitualIntent): void {
    if (active === null) return;
    // Abandon and Escape end the Ritual from every kind. The progress is discarded (7.5).
    if (intent.type === 'abandon' || (intent.type === 'key' && intent.key === 'Escape')) {
      finish('ended', clock.mono());
      return;
    }
    apply(intent);
  }

  function endPresentedBy(surface: RitualSurface): void {
    if (active?.presenter.surface !== surface) return;
    finish('ended', clock.mono());
  }

  function cancel(): void {
    const current = active;
    if (current === null) return;
    release(current);
  }

  function dispose(): void {
    cancel();
  }

  return { snapshot, progress, presenter, start, input, endPresentedBy, cancel, dispose };
}
