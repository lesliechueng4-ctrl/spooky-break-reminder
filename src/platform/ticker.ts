/**
 * Ticker adapter: decides when the engine wakes up (design: "Wake-up Cadence";
 * Requirements 1.7, 1.8, 16.6 and 19.10).
 *
 * - Visible document: a `setTimeout` to the next instant the engine asked for (see
 *   `setNextWake`), clamped to 16..1000 ms. Without a hint the wake-up comes every second.
 * - Hidden document: a message from the metronome Worker every 10 s. If the Worker cannot be
 *   created, or it fails at runtime, a main-thread `setTimeout` every 10 s takes over.
 * - Visibility changes wake the engine at once, so it catches up on return.
 *
 * The ticker passes only the wall-clock reading to its listeners. The engine reads the
 * monotonic clock itself, when it dispatches.
 */
import type { Clock } from './clock';
import type { MetronomeCommand, MetronomeMessage } from './metronome.worker';

export const VISIBLE_MIN_WAKE_MS = 16;
export const VISIBLE_MAX_WAKE_MS = 1_000;
/** Hidden-document wake-up interval. Requirement 1.8 allows 60 s; 10 s leaves room for the 30 s heartbeat. */
export const HIDDEN_WAKE_MS = 10_000;

/** Delay until the next visible wake-up, clamped to 16..1000 ms. A null or non-finite hint gives 1000 ms. */
export function visibleWakeDelay(hintMs: number | null): number {
  if (hintMs === null || !Number.isFinite(hintMs)) return VISIBLE_MAX_WAKE_MS;
  return Math.min(VISIBLE_MAX_WAKE_MS, Math.max(VISIBLE_MIN_WAKE_MS, Math.round(hintMs)));
}

/** Reads whether the App document is hidden, and reports changes to it. */
export interface VisibilitySource {
  isHidden(): boolean;
  /** Calls the listener on each visibility change. Returns the function that removes it. */
  subscribe(listener: () => void): () => void;
}

/** Visibility of a real document, driven by the `visibilitychange` event. */
export function documentVisibility(doc: Document): VisibilitySource {
  return {
    isHidden: () => doc.visibilityState === 'hidden',
    subscribe: (listener) => {
      doc.addEventListener('visibilitychange', listener);
      return () => doc.removeEventListener('visibilitychange', listener);
    },
  };
}

/** Creates the metronome Worker, or returns null where Workers are unsupported. */
export function createMetronomeWorker(): Worker | null {
  if (typeof Worker !== 'function') return null;
  // The literal `new Worker(new URL(...))` form lets Vite emit the worker under the base path.
  return new Worker(new URL('./metronome.worker.ts', import.meta.url), { type: 'module' });
}

export interface TimerApi {
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
}

export type TickListener = (atWall: number) => void;

export interface Ticker {
  /** Starts the wake-ups for the current visibility. Idempotent. */
  start(): void;
  /** Stops every wake-up source and terminates the Worker. Idempotent. */
  stop(): void;
  /**
   * Sets how long until the engine next needs to look at the schedule, in milliseconds from now.
   * It applies to the next visible wake-up only, and the hidden cadence is fixed at 10 s.
   * Null means no hint, which gives the default cadence of one second.
   */
  setNextWake(delayMs: number | null): void;
  /** Registers a listener for wake-ups. Returns the function that removes it. */
  onTick(listener: TickListener): () => void;
}

export interface TickerDeps {
  clock: Clock;
  visibility: VisibilitySource;
  /** Defaults to `createMetronomeWorker`. Tests inject a fake. */
  createWorker?: () => Worker | null;
  /** Defaults to the global timer functions. Tests inject fake timers. */
  timers?: TimerApi;
}

const defaultTimers: TimerApi = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (id) => clearTimeout(id),
};

function isMetronomeTick(data: unknown): data is MetronomeMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'tick';
}

export function createTicker(deps: TickerDeps): Ticker {
  const { clock, visibility } = deps;
  const createWorker = deps.createWorker ?? createMetronomeWorker;
  const timers = deps.timers ?? defaultTimers;

  const listeners = new Set<TickListener>();
  let running = false;
  let nextWakeHintMs: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let worker: Worker | null = null;
  // Set once the Worker cannot be created or fails. The ticker then uses main-thread timers only.
  let workerUnavailable = false;
  let unsubscribeVisibility: (() => void) | undefined;

  function emit(): void {
    const atWall = clock.wall();
    for (const listener of [...listeners]) {
      try {
        listener(atWall);
      } catch (error) {
        // Adapter errors are logged and never stop the engine (design: error handling).
        console.error('Ticker listener failed', error);
      }
    }
  }

  function clearTimer(): void {
    if (timerId !== undefined) {
      timers.clearTimeout(timerId);
      timerId = undefined;
    }
  }

  function markWorkerUnavailable(reason: unknown): void {
    console.warn('Metronome worker unavailable; using main-thread timers', reason);
    workerUnavailable = true;
    if (worker) {
      worker.terminate();
      worker = null;
    }
  }

  function postToWorker(command: MetronomeCommand): void {
    if (!worker) return;
    try {
      worker.postMessage(command);
    } catch (error) {
      markWorkerUnavailable(error);
    }
  }

  function ensureWorker(): boolean {
    if (worker) return true;
    if (workerUnavailable) return false;
    try {
      const created = createWorker();
      if (!created) {
        workerUnavailable = true;
        return false;
      }
      created.onmessage = (event: MessageEvent<unknown>) => {
        if (isMetronomeTick(event.data)) emit();
      };
      created.onerror = (event: ErrorEvent) => {
        markWorkerUnavailable(event.message);
        arm();
      };
      worker = created;
      return true;
    } catch (error) {
      markWorkerUnavailable(error);
      return false;
    }
  }

  function onTimer(): void {
    timerId = undefined;
    // A hint covers one visible wake-up. A listener that still needs a sooner wake-up sets it again.
    nextWakeHintMs = null;
    emit();
    arm();
  }

  function arm(): void {
    clearTimer();
    if (!running) return;

    if (visibility.isHidden()) {
      if (ensureWorker()) {
        postToWorker({ type: 'start', intervalMs: HIDDEN_WAKE_MS });
        return;
      }
      timerId = timers.setTimeout(onTimer, HIDDEN_WAKE_MS);
      return;
    }

    postToWorker({ type: 'stop' });
    timerId = timers.setTimeout(onTimer, visibleWakeDelay(nextWakeHintMs));
  }

  function onVisibilityChange(): void {
    if (!running) return;
    emit();
    arm();
  }

  return {
    start() {
      if (running) return;
      running = true;
      unsubscribeVisibility = visibility.subscribe(onVisibilityChange);
      arm();
    },

    stop() {
      if (!running) return;
      running = false;
      unsubscribeVisibility?.();
      unsubscribeVisibility = undefined;
      clearTimer();
      if (worker) {
        worker.terminate();
        worker = null;
      }
    },

    setNextWake(delayMs) {
      nextWakeHintMs = delayMs;
      if (running && !visibility.isHidden()) arm();
    },

    onTick(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
