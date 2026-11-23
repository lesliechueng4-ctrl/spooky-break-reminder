// Idle_Monitor adapter (design: "Platform Adapters" and "Schedule Continuity"; Requirements 13.2, 13.3,
// 13.8, 13.9, 14.5, 24.4).
//
// This module wraps the Idle Detection API (`IdleDetector`, Chromium only). It reports when the user became
// idle or the screen locked (`awayOpened`, with the start time back-dated to the idle threshold for an idle
// user) and when the user is active and unlocked again (`awayClosed`). It knows nothing about the schedule.
// src/app/engine.ts subscribes to these signals and applies them through dispatch, so this module never calls
// dispatch.
//
// The API is feature-detected. Without it, `support` is 'none', `requestPermission()` resolves 'none' without
// a prompt, and `start()` resolves false (Requirement 13.8). Every browser call is wrapped: a failure is logged
// and returned as a value, so it never stops the engine.
//
// Permission is requested only through `requestPermission()`. The Settings toggle calls it from its click
// handler, so the request is a user gesture (Requirements 13.2, 24.4). `start()` does not prompt.
//
// This file imports from src/core only.
import { toWholeMs } from '../core/time';

/** The detection threshold, which is also the minimum that the Idle Detection API accepts (Requirement 13.3). */
export const IDLE_THRESHOLD_MS = 60_000;

/** 'available' when the browser provides IdleDetector, otherwise 'none' (Requirement 13.8). */
export type IdleSupport = 'none' | 'available';

/** The outcome of the permission request. 'none' means the API is missing, so nothing was asked. */
export type IdleRequestResult = 'granted' | 'denied' | 'none';

/** The subset of IdleDetector that this adapter uses. */
export interface IdleDetectorLike extends EventTarget {
  readonly userState: 'active' | 'idle' | null;
  readonly screenState: 'locked' | 'unlocked' | null;
  start(options: { readonly threshold: number; readonly signal?: AbortSignal }): Promise<void>;
}

/** The IdleDetector constructor, with its static permission request. */
export interface IdleDetectorCtor {
  new (): IdleDetectorLike;
  requestPermission(): Promise<'granted' | 'denied'>;
}

/** What the monitor reports. `awayOpened` may be sent again with an earlier start time. The engine keeps the earliest. */
export type IdleSignal =
  | { readonly type: 'awayOpened'; readonly sinceWall: number }
  | { readonly type: 'awayClosed' };

/** An idle signal with the wall-clock time at which the monitor reported it. */
export type IdleEvent = IdleSignal & { readonly atWall: number };

export interface IdleMonitor {
  readonly support: IdleSupport;
  /**
   * Asks the browser for the idle-detection permission. Call it synchronously from a click handler: the browser
   * request starts inside this call. Resolves 'none' without prompting when the API is missing.
   */
  requestPermission(): Promise<IdleRequestResult>;
  /**
   * Starts observing with the 60 s threshold. Resolves true when observation runs. Resolves false when the API
   * is missing, or when the browser refuses to start (for example, the permission was revoked). The engine
   * turns the feature off in that case.
   */
  start(): Promise<boolean>;
  /** Stops observing. It reports nothing, so the engine decides how to close an open Away_Period. Idempotent. */
  stop(): void;
  /** Registers a listener. Returns a function that removes it. */
  subscribe(listener: (event: IdleEvent) => void): () => void;
}

export interface IdleMonitorOptions {
  /** The wall clock. The monitor reads it when a change arrives. */
  readonly clock: { wall(): number };
  /** The IdleDetector constructor, or undefined when the browser lacks it. The App gets it from `detectIdleDetector()`. */
  readonly detector: IdleDetectorCtor | undefined;
  /** Receives every caught error. Defaults to console.warn. */
  readonly log?: (message: string, error: unknown) => void;
}

/** Reads the IdleDetector constructor from a global scope. Absent in most browsers, so the result can be undefined. */
export function detectIdleDetector(scope: object = globalThis): IdleDetectorCtor | undefined {
  const candidate = (scope as { IdleDetector?: unknown }).IdleDetector;
  return typeof candidate === 'function' ? (candidate as IdleDetectorCtor) : undefined;
}

const defaultLog = (message: string, error: unknown): void => {
  console.warn(`[idle] ${message}`, error);
};

/** Constructs the detector, or returns null and logs when the browser refuses. */
function tryCreate(Ctor: IdleDetectorCtor, log: (message: string, error: unknown) => void): IdleDetectorLike | null {
  try {
    return new Ctor();
  } catch (error) {
    log('could not create the idle detector', error);
    return null;
  }
}

export function createIdleMonitor(options: IdleMonitorOptions): IdleMonitor {
  const { clock, detector: Ctor } = options;
  const log = options.log ?? defaultLog;
  const support: IdleSupport = Ctor === undefined ? 'none' : 'available';
  const listeners = new Set<(event: IdleEvent) => void>();

  /** The running detector, or null while the monitor is stopped. */
  let instance: IdleDetectorLike | null = null;
  let controller: AbortController | null = null;
  /** The earliest start of the open absence that this monitor has reported. Null while nothing is open. */
  let openSince: number | null = null;

  function emit(signal: IdleSignal, atWall: number): void {
    const event: IdleEvent = { ...signal, atWall };
    // Copy the set, so a listener that unsubscribes during delivery does not skip another one.
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        log('a listener failed', error);
      }
    }
  }

  /**
   * Reads the detector and reports the state. An absence is open while the user is idle or the screen is locked.
   * `initial` reports a closed state even when this monitor has no open absence, so the engine can close an
   * Away_Period that it stored before the page loaded.
   */
  function report(detectorNow: IdleDetectorLike, initial: boolean): void {
    const atWall = toWholeMs(clock.wall());
    const idleNow = detectorNow.userState === 'idle';
    const locked = detectorNow.screenState === 'locked';

    if (!idleNow && !locked) {
      if (openSince !== null || initial) {
        openSince = null;
        emit({ type: 'awayClosed' }, atWall);
      }
      return;
    }

    // An idle user has been inactive for the threshold (Requirement 13.3). A locked screen started at the lock.
    const candidate = idleNow ? atWall - IDLE_THRESHOLD_MS : atWall;
    if (openSince === null || candidate < openSince) {
      openSince = candidate;
      emit({ type: 'awayOpened', sinceWall: candidate }, atWall);
    }
  }

  const handleChange = (): void => {
    const current = instance;
    if (current === null) return;
    try {
      report(current, false);
    } catch (error) {
      log('could not read the idle state', error);
    }
  };

  function resetState(): void {
    if (instance !== null) instance.removeEventListener('change', handleChange);
    controller?.abort();
    instance = null;
    controller = null;
    openSince = null;
  }

  return {
    support,

    requestPermission() {
      if (Ctor === undefined) return Promise.resolve<IdleRequestResult>('none');
      try {
        // The browser request starts synchronously here, so it stays inside the caller's click handler.
        return Ctor.requestPermission().then(
          (result): IdleRequestResult => (result === 'granted' ? 'granted' : 'denied'),
          (error: unknown): IdleRequestResult => {
            log('could not request the idle-detection permission', error);
            return 'denied';
          },
        );
      } catch (error) {
        log('could not request the idle-detection permission', error);
        return Promise.resolve<IdleRequestResult>('denied');
      }
    },

    async start() {
      if (Ctor === undefined) return false;
      if (instance !== null) return true;

      const abort = new AbortController();
      const created = tryCreate(Ctor, log);
      if (created === null) return false;
      created.addEventListener('change', handleChange);
      instance = created;
      controller = abort;

      try {
        await created.start({ threshold: IDLE_THRESHOLD_MS, signal: abort.signal });
      } catch (error) {
        // A stop() during start() aborts the request. That is not a failure, so it is not logged.
        if (!abort.signal.aborted) log('could not start idle detection', error);
        if (instance === created) resetState();
        return false;
      }

      // stop() ran while the browser was starting the detector, so the new detector is already discarded.
      if (instance !== created) return false;

      try {
        // Report the current state now. A change event only fires after a change, so the first state is read here.
        report(created, true);
      } catch (error) {
        log('could not read the idle state', error);
      }
      return true;
    },

    stop() {
      try {
        resetState();
      } catch (error) {
        log('could not stop idle detection', error);
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
