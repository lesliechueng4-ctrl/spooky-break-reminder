// Single active tab (design: "Platform Adapters", instanceLock.ts; Requirements 22.1-22.4, 25.7).
//
// One tab holds the Web Lock of its mode: `sbr-active` in normal use and `sbr-active-demo` in Demo_Mode
// (ACTIVE_LOCK_NAME in src/app/engine.ts; the caller passes the name in). The holder is the Active_Instance.
// A tab that finds the lock taken becomes inactive and reports it (Requirement 22.1). It also queues a normal
// request, which is granted when the holder closes (Requirement 22.4). A take-over aborts that queued request
// and requests the lock with `steal: true` (Requirement 22.3).
//
// The browser does not tell a holder that its lock was stolen. The stealing tab therefore posts a message on a
// BroadcastChannel named after the lock, and the holder that receives it becomes inactive (Requirement 22.2).
// Without a BroadcastChannel a free lock is still handed over, but a stolen holder keeps running.
//
// Without Web Locks the tab is the Active_Instance from the start. A failed request also leaves the tab as the
// Active_Instance, so a browser fault never blocks the App. Errors are logged and never thrown to the caller.
//
// This module imports nothing from src/core or src/app. The caller reacts to state changes; it starts and stops
// the engine (src/app/main.tsx).

/**
 * `pending` until the first answer from the browser. `active` means this tab runs the Scheduler. `inactive` means
 * another tab does.
 */
export type InstanceState = 'pending' | 'active' | 'inactive';

/** 'available' when the browser has Web Locks, otherwise 'none' (Requirement 22). */
export type InstanceSupport = 'available' | 'none';

/** The options of LockManager.request that this adapter uses. */
export interface LockRequestOptions {
  readonly ifAvailable?: boolean;
  readonly steal?: boolean;
  readonly signal?: AbortSignal;
}

/** The subset of LockManager that this adapter uses. */
export interface LockManagerLike {
  request(name: string, options: LockRequestOptions, callback: (lock: object | null) => unknown): Promise<unknown>;
}

/** The subset of BroadcastChannel that this adapter uses. */
export interface LockChannel {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

export interface InstanceLockOptions {
  /** The lock name of this mode: ACTIVE_LOCK_NAME.normal or ACTIVE_LOCK_NAME.demo. */
  readonly name: string;
  /** The lock manager, or undefined when the browser has none. The App gets it from `detectLockManager()`. */
  readonly locks: LockManagerLike | undefined;
  /**
   * Opens the channel that tells a stolen holder that its lock was taken. Returns null when the browser has no
   * BroadcastChannel. Defaults to the global BroadcastChannel, named after the lock.
   */
  readonly openChannel?: (name: string) => LockChannel | null;
  /** Receives every caught error. Defaults to console.warn. */
  readonly log?: (message: string, error: unknown) => void;
}

export interface InstanceLock {
  readonly support: InstanceSupport;
  readonly state: InstanceState;
  /**
   * Requests the lock. The answer arrives through `subscribe`, and without Web Locks it is `active` at once. Calls
   * after the first one do nothing.
   */
  start(): void;
  /**
   * Takes the lock from the holder (Requirement 22.3). It is called from a click handler. Does nothing while this
   * tab is the Active_Instance.
   */
  takeOver(): void;
  /** Registers a listener for state changes. Returns the function that removes it. */
  subscribe(listener: (state: InstanceState) => void): () => void;
}

/** The message that the stealing tab posts to the holder it displaced. */
const STOLEN_MESSAGE = 'instance-stolen';

function defaultLog(message: string, error: unknown): void {
  console.warn(`[instance] ${message}`, error);
}

/** Reads the lock manager from a global scope. Returns undefined when the browser has no Web Locks. */
export function detectLockManager(scope: object = globalThis): LockManagerLike | undefined {
  const navigatorLike = (scope as unknown as { navigator?: { locks?: unknown } }).navigator;
  const candidate = navigatorLike?.locks as Partial<LockManagerLike> | undefined | null;
  return candidate !== undefined && candidate !== null && typeof candidate.request === 'function'
    ? (candidate as LockManagerLike)
    : undefined;
}

/** Opens a BroadcastChannel with the given name, or returns null where the browser has none. */
function openBroadcastChannel(name: string): LockChannel | null {
  const Ctor = (globalThis as unknown as { BroadcastChannel?: new (channelName: string) => LockChannel })
    .BroadcastChannel;
  return typeof Ctor === 'function' ? new Ctor(name) : null;
}

/** Calls `manager.request`, and turns a synchronous throw into a rejected promise. */
function requestLock(
  manager: LockManagerLike,
  name: string,
  options: LockRequestOptions,
  callback: (lock: object | null) => unknown,
): Promise<unknown> {
  try {
    return manager.request(name, options, callback);
  } catch (error) {
    return Promise.reject(error);
  }
}

export function createInstanceLock(options: InstanceLockOptions): InstanceLock {
  const { name, locks } = options;
  const log = options.log ?? defaultLog;
  const openChannel = options.openChannel ?? openBroadcastChannel;
  const support: InstanceSupport = locks === undefined ? 'none' : 'available';
  const listeners = new Set<(state: InstanceState) => void>();

  let state: InstanceState = 'pending';
  let started = false;
  /** Resolves the callback of the held lock. The browser releases the lock when that callback settles. */
  let releaseHeld: (() => void) | null = null;
  /** The queued request of an inactive tab. Null when no request waits. */
  let queued: AbortController | null = null;
  let channel: LockChannel | null = null;

  function setState(next: InstanceState): void {
    if (next === state) return;
    state = next;
    // Copy the set, so a listener that unsubscribes during delivery does not skip another listener.
    for (const listener of [...listeners]) {
      try {
        listener(next);
      } catch (error) {
        log('an instance listener failed', error);
      }
    }
  }

  /** Marks this tab as the Active_Instance. The returned promise keeps the lock held until it settles. */
  function acquired(): Promise<void> {
    // A hold that this tab still has ends with the lock that replaced it.
    releaseHeld?.();
    const held = new Promise<void>((resolve) => {
      releaseHeld = () => resolve();
    });
    setState('active');
    return held;
  }

  /** Queues a normal request. It is granted when the holder closes or releases the lock (Requirement 22.4). */
  function queueNormal(manager: LockManagerLike): void {
    const controller = new AbortController();
    queued = controller;
    requestLock(manager, name, { signal: controller.signal }, (lock) => {
      if (queued === controller) queued = null;
      if (lock === null) return undefined;
      return acquired();
    }).catch((error: unknown) => {
      // An abort is the take-over removing this request on purpose, so it is not an error.
      if (!controller.signal.aborted) log('the queued instance request failed', error);
    });
  }

  /** The first request. Denial makes this tab inactive and queues it (Requirement 22.1). */
  function requestIfAvailable(manager: LockManagerLike): void {
    let granted = false;
    requestLock(manager, name, { ifAvailable: true }, (lock) => {
      if (lock === null) return undefined;
      granted = true;
      return acquired();
    }).then(
      // A denied request settles at once, because its callback returns without a held lock.
      () => {
        if (granted) return;
        setState('inactive');
        queueNormal(manager);
      },
      (error: unknown) => {
        log('could not request the instance lock; this tab runs as the Active_Instance', error);
        setState('active');
      },
    );
  }

  /** The holder's side of the steal: it learns about the take-over and becomes inactive (Requirement 22.2). */
  function onChannelMessage(event: MessageEvent): void {
    if (event.data !== STOLEN_MESSAGE || state !== 'active') return;
    // The stealer holds the lock now, so this tab only ends its own hold.
    releaseHeld?.();
    releaseHeld = null;
    setState('inactive');
    if (locks !== undefined) queueNormal(locks);
  }

  function openHolderChannel(): LockChannel | null {
    try {
      const opened = openChannel(name);
      if (opened === null) {
        log('BroadcastChannel is unavailable; a lock taken from this tab will not stop it', null);
        return null;
      }
      opened.onmessage = onChannelMessage;
      return opened;
    } catch (error) {
      log('could not open the instance channel', error);
      return null;
    }
  }

  return {
    support,

    get state() {
      return state;
    },

    start() {
      if (started) return;
      started = true;
      if (locks === undefined) {
        setState('active');
        return;
      }
      channel = openHolderChannel();
      requestIfAvailable(locks);
    },

    takeOver() {
      if (locks === undefined || state === 'active') return;
      // Abort the queue first. A queued request that won the lock would otherwise run ahead of the steal (Requirement 22.3).
      queued?.abort();
      queued = null;
      requestLock(locks, name, { steal: true }, (lock) => {
        if (lock === null) return undefined;
        const held = acquired();
        try {
          channel?.postMessage(STOLEN_MESSAGE);
        } catch (error) {
          log('could not tell the holder that its lock was taken', error);
        }
        return held;
      }).catch((error: unknown) => {
        log('could not take over the instance lock', error);
      });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
