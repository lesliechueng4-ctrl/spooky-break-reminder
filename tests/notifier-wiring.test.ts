// Notifier wiring (Requirements 15.2, 22.2). The engine hands every commit to the Notifier through `onCommit`.
// Fakes replace only the browser: storage, clock, ticker, lifecycle, the document visibility and the Notification
// constructor. The engine, the store, the scheduler, the notification policy and the notifier are real.
import { describe, expect, it } from 'vitest';
import { createEngine, storageReporter, type Engine } from '../src/app/engine';
import { createAppStore, type AppStore } from '../src/app/store';
import { createRng } from '../src/core/rng';
import type { DomainEvent, ScheduleView } from '../src/core/scheduler';
import { defaultSettings } from '../src/core/settings';
import { MINUTE_MS } from '../src/core/time';
import { createAudioEngine } from '../src/platform/audio/engine';
import type { Clock } from '../src/platform/clock';
import type { LifecycleAdapter, LifecycleEvent } from '../src/platform/lifecycle';
import {
  createNotifier,
  type NotificationCtor,
  type NotificationLike,
  type NotificationOptionsLike,
} from '../src/platform/notifier';
import { openStorage } from '../src/platform/storage';
import type { Ticker, TickListener } from '../src/platform/ticker';

const T0 = 1_800_000_000_000;

interface ShownNotification {
  readonly title: string;
  readonly options: NotificationOptionsLike;
}

/** A Notification constructor that records every notice it shows. The permission is granted. */
function fakeNotificationCtor(): { ctor: NotificationCtor; shown: ShownNotification[] } {
  const shown: ShownNotification[] = [];
  class FakeNotification implements NotificationLike {
    static readonly permission: string = 'granted';
    static requestPermission(): Promise<string> {
      return Promise.resolve('granted');
    }
    onclick: ((event: Event) => unknown) | null = null;
    constructor(title: string, options: NotificationOptionsLike) {
      shown.push({ title, options });
    }
    close(): void {}
  }
  return { ctor: FakeNotification as unknown as NotificationCtor, shown };
}

/** A Storage backed by a Map, which is enough for the storage adapter's probe and writes. */
function fakeStorage(): Storage {
  const items = new Map<string, string>();
  const backend = {
    get length(): number {
      return items.size;
    },
    key(index: number): string | null {
      return [...items.keys()][index] ?? null;
    },
    getItem(key: string): string | null {
      return items.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      items.set(key, value);
    },
    removeItem(key: string): void {
      items.delete(key);
    },
  };
  return backend as unknown as Storage;
}

interface FakeClock extends Clock {
  advance(ms: number): void;
}

function fakeClock(wall: number): FakeClock {
  let now = wall;
  let mono = 5_000;
  return {
    wall: () => now,
    mono: () => mono,
    advance(ms) {
      now += ms;
      mono += ms;
    },
  };
}

interface FakeTicker extends Ticker {
  fire(atWall: number): void;
}

function fakeTicker(): FakeTicker {
  const listeners = new Set<TickListener>();
  return {
    start() {},
    stop() {},
    setNextWake() {},
    onTick(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fire(atWall) {
      for (const listener of [...listeners]) listener(atWall);
    },
  };
}

function fakeLifecycle(): LifecycleAdapter {
  return {
    support: { freezeResume: true, wasDiscarded: true },
    startupIntervention: 'none',
    subscribe(_listener: (event: LifecycleEvent) => void) {
      return () => {};
    },
    dispose() {},
  };
}

/** The hook that the engine receives. It is the App's wiring, or a replacement for the error test. */
type CommitHook = (prev: ScheduleView, next: ScheduleView, events: readonly DomainEvent[]) => void;

interface Session {
  readonly engine: Engine;
  readonly store: AppStore;
  readonly clock: FakeClock;
  readonly ticker: FakeTicker;
  /** The document. Changing `visibilityState` changes what the Notifier sees at the next commit. */
  readonly doc: { visibilityState: DocumentVisibilityState };
  /** Notices that the Notification constructor received. */
  readonly shown: ShownNotification[];
  /** Messages of the adapter errors that the engine reported. */
  readonly errors: string[];
}

/**
 * Starts one App session with notifications turned on. Without `hook`, the engine calls the real notifier, wired the
 * same way as in src/app/main.tsx.
 */
function startSession(visibility: DocumentVisibilityState, hook?: CommitHook): Session {
  const clock = fakeClock(T0);
  const ticker = fakeTicker();
  const doc = { visibilityState: visibility };
  const notification = fakeNotificationCtor();
  const audio = createAudioEngine({ rng: createRng(7), createContext: () => null });
  const store = createAppStore({ audio, demo: false, defaultLanguage: 'en' });
  const browserStorage = fakeStorage();
  const storage = openStorage({ mode: 'normal', source: () => browserStorage, report: storageReporter(store) });
  const notifier = createNotifier({
    doc,
    win: { focus() {} },
    Notification: notification.ctor,
    isActiveInstance: () => store.activeInstance.peek(),
    isEnabled: () => store.settings.peek().notifications,
    translate: (key) => key,
    iconUrl: (id) => `/spooky-break-reminder/icons/${id}.svg`,
    onOffer: () => {},
  });
  const errors: string[] = [];
  const engine = createEngine({
    store,
    storage,
    clock,
    ticker,
    lifecycle: fakeLifecycle(),
    demo: false,
    defaultLanguage: 'en',
    onCommit: hook ?? ((prev, next, events) => notifier.handleCommit(prev, next, events)),
    report: (message) => {
      errors.push(message);
    },
  });
  engine.start();
  engine.updateSettings({ ...defaultSettings('en'), notifications: true });
  return { engine, store, clock, ticker, doc, shown: notification.shown, errors };
}

/** Moves the clock forward in steps and fires a ticker wake-up after each step, as the browser does. */
function runTo(session: Session, target: number, step = 10_000): void {
  while (session.clock.wall() < target) {
    session.clock.advance(Math.min(step, target - session.clock.wall()));
    session.ticker.fire(session.clock.wall());
  }
}

describe('notifier wiring at commit (Requirements 15.2, 22.2)', () => {
  it('shows a Haunting notification when a Haunting starts while the document is hidden and this tab is the Active_Instance', () => {
    const session = startSession('hidden');

    runTo(session, T0 + 20 * MINUTE_MS);

    expect(session.store.view.value.phase).toBe('haunting');
    expect(session.shown).toHaveLength(1);
    expect(session.shown[0]?.title).toBe('notice.haunting.title');
    expect(session.shown[0]?.options.tag).toBe('sbr-haunting');
  });

  it('shows no notification when the same Haunting starts while the document is visible', () => {
    const session = startSession('visible');

    runTo(session, T0 + 20 * MINUTE_MS);

    expect(session.store.view.value.phase).toBe('haunting');
    expect(session.shown).toEqual([]);
  });

  it('keeps the engine running and reports the error when the commit hook throws', () => {
    const session = startSession('hidden', () => {
      throw new Error('notifier is down');
    });

    runTo(session, T0 + 20 * MINUTE_MS);

    expect(session.store.view.value.phase).toBe('haunting');
    expect(session.errors).toContain('commit hook failed');
  });
});
