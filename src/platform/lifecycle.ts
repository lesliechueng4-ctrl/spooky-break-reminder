// Browser page lifecycle adapter (Requirements 14.1, 14.4, 14.6, 14.8; design "Platform Adapters").
//
// This module reads browser lifecycle signals and reports them as events to subscribers. It does
// not dispatch to the engine (only src/app/engine.ts calls dispatch) and it does not touch storage.
// Listeners run synchronously inside the browser event handler, so the engine can write
// `frozenAtWall` before the browser freezes the page.
//
// Chromium-only signals (freeze, resume, document.wasDiscarded) are feature-detected. An absent
// signal never throws and reports 'none' (Requirement 14.8).
import { toWholeMs } from '../core/time';

/** What the browser reported about a gap. 'none' means no Intervention_Signal exists. */
export type InterventionSignal = 'none' | 'frozen' | 'discarded';

/** Injected time sources. Values are read in milliseconds and rounded before they become events. */
export interface LifecycleClock {
  wall(): number;
  mono(): number;
}

/** The subset of Document that this adapter reads. */
export interface LifecycleDocument extends EventTarget {
  readonly visibilityState: DocumentVisibilityState;
  /** Chromium only. Absent in Firefox and Safari. */
  readonly wasDiscarded?: boolean;
}

export type LifecycleSignal =
  | { readonly type: 'visibility'; readonly visible: boolean }
  | { readonly type: 'pagehide'; readonly persisted: boolean }
  | { readonly type: 'pageshow'; readonly persisted: boolean }
  | { readonly type: 'freeze' }
  | { readonly type: 'resume'; readonly frozenAtWall: number | null };

/** A lifecycle signal with the wall and monotonic readings taken when the browser reported it. */
export type LifecycleEvent = LifecycleSignal & {
  readonly atWall: number;
  readonly atMono: number;
};

export interface LifecycleSupport {
  /** `freeze` and `resume` are available on the document (Chromium). */
  readonly freezeResume: boolean;
  /** `document.wasDiscarded` is available (Chromium). */
  readonly wasDiscarded: boolean;
}

export interface LifecycleAdapter {
  readonly support: LifecycleSupport;
  /** Read once at creation: 'discarded' when the page loaded after a discard (Requirement 14.4). */
  readonly startupIntervention: InterventionSignal;
  /** Registers a listener. Returns a function that removes it. */
  subscribe(listener: (event: LifecycleEvent) => void): () => void;
  /** Removes every browser listener and every subscriber. */
  dispose(): void;
}

export interface LifecycleOptions {
  readonly doc: LifecycleDocument;
  /** The window, which fires `pagehide` and `pageshow`. */
  readonly win: EventTarget;
  readonly clock: LifecycleClock;
  /** Receives every caught error. Defaults to console.error. */
  readonly onError?: (error: unknown) => void;
}

type Listener = (event: LifecycleEvent) => void;

/**
 * Attaches the lifecycle listeners and returns the adapter.
 *
 * - `visibilitychange` (document) reports visible or hidden.
 * - `pagehide` and `pageshow` (window) report the `persisted` flag. The engine persists on pagehide.
 * - `freeze` and `resume` (document, feature-detected) report the freeze. `frozenAtWall` is the
 *   time of the freeze in this page session, so the engine can classify the gap on resume.
 * - `document.wasDiscarded` is read once at creation (feature-detected).
 */
export function createLifecycle(options: LifecycleOptions): LifecycleAdapter {
  const { doc, win, clock } = options;
  const logError = options.onError ?? ((error: unknown) => console.error('[lifecycle]', error));

  const listeners = new Set<Listener>();
  const registered: Array<{ target: EventTarget; type: string; handler: EventListener }> = [];
  let frozenAtWall: number | null = null;

  const support: LifecycleSupport = {
    freezeResume: 'onfreeze' in doc && 'onresume' in doc,
    wasDiscarded: 'wasDiscarded' in doc,
  };
  const startupIntervention: InterventionSignal =
    support.wasDiscarded && doc.wasDiscarded === true ? 'discarded' : 'none';

  function deliver(event: LifecycleEvent): void {
    // Copy the set so a listener that unsubscribes during delivery does not skip another listener.
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        logError(error);
      }
    }
  }

  function emit(signal: LifecycleSignal, atWall: number): void {
    deliver({ ...signal, atWall, atMono: toWholeMs(clock.mono()) });
  }

  /** Wraps a browser handler so that an exception is logged and never escapes into the page. */
  function guarded(handler: (event: Event) => void): EventListener {
    return (event: Event) => {
      try {
        handler(event);
      } catch (error) {
        logError(error);
      }
    };
  }

  function register(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    registered.push({ target, type, handler });
  }

  register(
    doc,
    'visibilitychange',
    guarded(() => {
      const atWall = toWholeMs(clock.wall());
      emit({ type: 'visibility', visible: doc.visibilityState === 'visible' }, atWall);
    }),
  );

  register(
    win,
    'pagehide',
    guarded((event) => {
      const atWall = toWholeMs(clock.wall());
      emit({ type: 'pagehide', persisted: isPersisted(event) }, atWall);
    }),
  );

  register(
    win,
    'pageshow',
    guarded((event) => {
      const atWall = toWholeMs(clock.wall());
      emit({ type: 'pageshow', persisted: isPersisted(event) }, atWall);
    }),
  );

  if (support.freezeResume) {
    register(
      doc,
      'freeze',
      guarded(() => {
        const atWall = toWholeMs(clock.wall());
        frozenAtWall = atWall;
        emit({ type: 'freeze' }, atWall);
      }),
    );

    register(
      doc,
      'resume',
      guarded(() => {
        const atWall = toWholeMs(clock.wall());
        const freezeWall = frozenAtWall;
        frozenAtWall = null;
        emit({ type: 'resume', frozenAtWall: freezeWall }, atWall);
      }),
    );
  }

  return {
    support,
    startupIntervention,
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose(): void {
      for (const { target, type, handler } of registered.splice(0)) {
        target.removeEventListener(type, handler);
      }
      listeners.clear();
    },
  };
}

function isPersisted(event: Event): boolean {
  return (event as Event & { persisted?: unknown }).persisted === true;
}
