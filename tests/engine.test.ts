// Engine and storage wiring (Requirements 1.6, 1.9, 7.8, 14.1-14.7, 21.4, 21.5, 25.1, 25.7).
// Fakes replace only the browser: the fake storage backs the real storage adapter, and the fake clock,
// ticker and lifecycle feed the real engine. The store, the scheduler and the continuity rules are real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine, isDemoSearch, storageReporter, type Engine } from '../src/app/engine';
import { createRitualSession } from '../src/app/ritualSession';
import { createAppStore, type AppStore } from '../src/app/store';
import { createRng } from '../src/core/rng';
import { defaultSettings } from '../src/core/settings';
import { MINUTE_MS } from '../src/core/time';
import { createAudioEngine, type AudioEngine } from '../src/platform/audio/engine';
import type { Clock } from '../src/platform/clock';
import type { LifecycleAdapter, LifecycleEvent } from '../src/platform/lifecycle';
import { openStorage, type AppStorage } from '../src/platform/storage';
import type { Ticker, TickListener, VisibilitySource } from '../src/platform/ticker';

const T0 = 1_800_000_000_000;
const MIN = MINUTE_MS;

/** A browser storage backed by a Map. `failWrites` makes every later write throw an error with that name. */
interface FakeBrowserStorage {
  readonly items: Map<string, string>;
  readonly writes: string[];
  failWrites(name: string | null): void;
  readonly storage: Storage;
}

function fakeBrowserStorage(): FakeBrowserStorage {
  const items = new Map<string, string>();
  const writes: string[] = [];
  let failure: string | null = null;
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
      if (failure !== null) throw Object.assign(new Error('storage is full'), { name: failure });
      writes.push(key);
      items.set(key, value);
    },
    removeItem(key: string): void {
      items.delete(key);
    },
  };
  return {
    items,
    writes,
    failWrites(name) {
      failure = name;
    },
    storage: backend as unknown as Storage,
  };
}

/** A clock whose wall and monotonic readings move together, except through `set` (a clock step). */
interface FakeClock extends Clock {
  advance(ms: number): void;
  set(wall: number): void;
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
    set(next) {
      now = next;
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

interface FakeLifecycle extends LifecycleAdapter {
  emit(event: LifecycleEvent): void;
}

function fakeLifecycle(startupIntervention: LifecycleAdapter['startupIntervention'] = 'none'): FakeLifecycle {
  const listeners = new Set<(event: LifecycleEvent) => void>();
  return {
    support: { freezeResume: true, wasDiscarded: true },
    startupIntervention,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      listeners.clear();
    },
    emit(event) {
      for (const listener of [...listeners]) listener(event);
    },
  };
}

/** The browser side of one page session: storage, clock and the stored data survive a restart. */
interface Env {
  readonly files: FakeBrowserStorage;
  readonly clock: FakeClock;
}

function newEnv(wall: number = T0): Env {
  return { files: fakeBrowserStorage(), clock: fakeClock(wall) };
}

interface Boot {
  readonly engine: Engine;
  readonly store: AppStore;
  readonly storage: AppStorage;
  readonly ticker: FakeTicker;
  readonly lifecycle: FakeLifecycle;
  /** Messages of every adapter error that the engine reported. */
  readonly errors: string[];
}

interface BootOptions {
  readonly demo?: boolean;
  readonly intervention?: LifecycleAdapter['startupIntervention'];
  readonly audio?: AudioEngine;
}

/** Starts one page session on the environment. Each call is a new page load. */
function boot(env: Env, options: BootOptions = {}): Boot {
  const demo = options.demo ?? false;
  const errors: string[] = [];
  const audio = options.audio ?? createAudioEngine({ rng: createRng(7), createContext: () => null });
  const store = createAppStore({ audio, demo, defaultLanguage: 'en' });
  const storage = openStorage({
    mode: demo ? 'demo' : 'normal',
    source: () => env.files.storage,
    report: storageReporter(store),
  });
  const ticker = fakeTicker();
  const lifecycle = fakeLifecycle(options.intervention);
  const engine = createEngine({
    store,
    storage,
    clock: env.clock,
    ticker,
    lifecycle,
    demo,
    defaultLanguage: 'en',
    report: (message) => {
      errors.push(message);
    },
  });
  engine.start();
  return { engine, store, storage, ticker, lifecycle, errors };
}

/** Moves the clock forward in steps and fires a ticker wake-up after each step, as the browser does. */
function runTo(env: Env, b: Boot, target: number, step = 10_000): void {
  while (env.clock.wall() < target) {
    env.clock.advance(Math.min(step, target - env.clock.wall()));
    b.ticker.fire(env.clock.wall());
  }
}

/** The stored `data` of a record, or null when the key is absent. */
function storedData(files: FakeBrowserStorage, key: string): unknown {
  const text = files.items.get(key);
  return text === undefined ? null : (JSON.parse(text) as { data: unknown }).data;
}

function scheduleWrites(files: FakeBrowserStorage): number {
  return files.writes.filter((key) => key === 'sbr:v1:schedule').length;
}

describe('engine persistence and page lifecycle', () => {
  it('starts a new Work_Interval and stores the defaults on an empty store', () => {
    const env = newEnv();
    const b = boot(env);

    expect(b.store.view.value).toMatchObject({ phase: 'calm', remainingMs: 20 * MIN });
    expect(storedData(env.files, 'sbr:v1:settings')).toEqual(defaultSettings('en'));
    expect(storedData(env.files, 'sbr:v1:schedule')).not.toBeNull();
  });

  it('writes the schedule on the 30 second heartbeat and not on every wake-up', () => {
    const env = newEnv();
    const b = boot(env);
    const baseline = scheduleWrites(env.files);

    runTo(env, b, T0 + 20_000);
    expect(scheduleWrites(env.files)).toBe(baseline);

    runTo(env, b, T0 + 30_000);
    expect(scheduleWrites(env.files)).toBe(baseline + 1);
    expect(storedData(env.files, 'sbr:v1:schedule')).toMatchObject({ lastAliveWall: T0 + 30_000 });
  });

  it('persists on pagehide and writes frozenAtWall synchronously when the page freezes', () => {
    const env = newEnv();
    const b = boot(env);
    runTo(env, b, T0 + 5_000);
    const before = scheduleWrites(env.files);

    b.lifecycle.emit({ type: 'pagehide', persisted: false, atWall: env.clock.wall(), atMono: env.clock.mono() });
    expect(scheduleWrites(env.files)).toBe(before + 1);

    b.lifecycle.emit({ type: 'freeze', atWall: env.clock.wall(), atMono: env.clock.mono() });
    expect(storedData(env.files, 'sbr:v1:schedule')).toMatchObject({ frozenAtWall: T0 + 5_000 });
  });
});

describe('gap accounting on restart and resume', () => {
  it('counts a short stop as elapsed work time', () => {
    const env = newEnv();
    const first = boot(env);
    runTo(env, first, T0 + 2 * MIN);
    first.engine.stop();

    env.clock.advance(3 * MIN);
    const second = boot(env);

    expect(second.store.view.value).toMatchObject({ phase: 'calm', remainingMs: 15 * MIN });
  });

  it('treats a stop of at least Natural_Break_Duration as an Away_Period', () => {
    const env = newEnv();
    const first = boot(env);
    runTo(env, first, T0 + 2 * MIN);
    first.engine.stop();

    env.clock.advance(6 * MIN);
    const second = boot(env);

    expect(second.store.view.value).toMatchObject({ phase: 'calm', remainingMs: 20 * MIN });
    expect(second.store.welcomeBack.value).toEqual({ awayMinutes: 6 });
  });

  it('counts an unobserved discard as elapsed time up to the Unobserved_Gap_Limit', () => {
    const env = newEnv();
    boot(env).engine.stop();

    env.clock.advance(30 * MIN);
    const second = boot(env, { intervention: 'discarded' });

    // 30 minutes of work: the 20-minute Work_Interval is over, and 10 minutes are overdue (level 1 + 5 steps, capped at 5).
    expect(second.store.view.value).toMatchObject({ phase: 'haunting', overdueMs: 10 * MIN, level: 5 });
  });

  it('counts a freeze followed by a resume as elapsed time', () => {
    const env = newEnv();
    const b = boot(env);
    runTo(env, b, T0 + MIN);
    b.lifecycle.emit({ type: 'freeze', atWall: env.clock.wall(), atMono: env.clock.mono() });

    env.clock.advance(10 * MIN);
    b.lifecycle.emit({
      type: 'resume',
      frozenAtWall: T0 + MIN,
      atWall: env.clock.wall(),
      atMono: env.clock.mono(),
    });

    expect(b.store.view.value).toMatchObject({ phase: 'calm', remainingMs: 9 * MIN });
  });

  it('treats a backward clock step as zero elapsed time', () => {
    const env = newEnv();
    const b = boot(env);
    runTo(env, b, T0 + 5 * MIN);

    env.clock.set(T0 + 2 * MIN);
    b.ticker.fire(env.clock.wall());
    expect(b.store.view.value).toMatchObject({ phase: 'calm', remainingMs: 15 * MIN });

    env.clock.advance(MIN);
    b.ticker.fire(env.clock.wall());
    expect(b.store.view.value).toMatchObject({ phase: 'calm', remainingMs: 14 * MIN });
  });
});

describe('hidden Ritual timeout', () => {
  it('applies a Ritual that ended at its own time, so overdue time resumes from that moment', () => {
    const env = newEnv();
    const b = boot(env);
    runTo(env, b, T0 + 21 * MIN);
    b.engine.dispatch({ type: 'ritualStarted', kind: 'eye', origin: 'haunting' });

    // The page learns at 25 min that the Ritual timed out at 22 min (60 s hidden after it began at 21 min).
    env.clock.advance(4 * MIN);
    b.engine.dispatch({ type: 'ritualEnded' }, T0 + 22 * MIN);

    // Overdue time: 1 minute before the Ritual, nothing while it ran, and 3 minutes after it ended.
    expect(b.store.view.value).toMatchObject({ phase: 'haunting', overdueMs: MIN, ritual: null });
    b.ticker.fire(env.clock.wall());
    expect(b.store.view.value).toMatchObject({ phase: 'haunting', overdueMs: 4 * MIN });
  });
});

describe('Demo_Mode', () => {
  it('uses the demo namespace for the schedule, shares the settings and runs 60 times faster', () => {
    const env = newEnv();
    const b = boot(env, { demo: true });

    expect(storedData(env.files, 'sbr:v1:demo:schedule')).not.toBeNull();
    expect(env.files.items.has('sbr:v1:schedule')).toBe(false);
    expect(storedData(env.files, 'sbr:v1:settings')).not.toBeNull();

    // 20 Work_Interval minutes of schedule time pass in 20 wall-clock seconds.
    runTo(env, b, T0 + 20_000);
    expect(b.store.view.value).toMatchObject({ phase: 'haunting', level: 1 });
  });

  it('treats a 90 second stop as an Away_Period, because Demo_Mode uses a one-minute Natural_Break_Duration', () => {
    const env = newEnv();
    const first = boot(env, { demo: true });
    runTo(env, first, T0 + 10_000);
    first.engine.stop();

    env.clock.advance(90_000);
    const second = boot(env, { demo: true });

    expect(second.store.view.value).toMatchObject({ phase: 'calm', remainingMs: 20 * MIN });
    expect(second.store.welcomeBack.value).toEqual({ awayMinutes: 1 });
  });

  it('runs a Demo_Mode Snooze for 5 minutes of wall-clock time', () => {
    const env = newEnv();
    const b = boot(env, { demo: true });
    runTo(env, b, T0 + 20_000);
    expect(b.store.view.value).toMatchObject({ phase: 'haunting', level: 1 });

    b.engine.dispatch({ type: 'snooze' });
    const snoozedAt = env.clock.wall();
    expect(b.store.view.value).toMatchObject({ snoozeMs: 5 * MIN, snoozeRemainingMs: 5 * MIN });

    runTo(env, b, snoozedAt + 4 * MIN + 59_000);
    expect(b.store.view.value).toMatchObject({ snoozeRemainingMs: 1_000, snoozesLeft: 2 });

    runTo(env, b, snoozedAt + 5 * MIN);
    expect(b.store.view.value).toMatchObject({ snoozeRemainingMs: 0, snoozesLeft: 2 });
  });

  it('runs a Demo_Mode Pause for 30 minutes of wall-clock time, then the candle runs at 60 times speed', () => {
    const env = newEnv();
    const b = boot(env, { demo: true });
    b.engine.dispatch({ type: 'pause', durationMs: 30 * MIN });
    const pausedAt = env.clock.wall();
    expect(b.store.view.value).toMatchObject({ pause: { remainingMs: 30 * MIN }, remainingMs: 20 * MIN });

    runTo(env, b, pausedAt + 29 * MIN);
    expect(b.store.view.value).toMatchObject({ pause: { remainingMs: MIN }, remainingMs: 20 * MIN });

    runTo(env, b, pausedAt + 30 * MIN);
    expect(b.store.view.value).toMatchObject({ pause: null, remainingMs: 20 * MIN });

    runTo(env, b, pausedAt + 30 * MIN + 20_000);
    expect(b.store.view.value).toMatchObject({ phase: 'haunting', level: 1 });
  });

  it('reads ?demo=1 as Demo_Mode and nothing else', () => {
    expect(isDemoSearch('?demo=1')).toBe(true);
    expect(isDemoSearch('?x=1&demo=1')).toBe(true);
    expect(isDemoSearch('?demo=0')).toBe(false);
    expect(isDemoSearch('?demo=10')).toBe(false);
    expect(isDemoSearch('')).toBe(false);
  });
});

describe('invalid stored data and storage faults', () => {
  it('loads the defaults, starts a new Work_Interval and raises the reset notice for invalid data', () => {
    const env = newEnv();
    env.files.items.set('sbr:v1:settings', '{"v":1,"kind":"settings","data":{"workIntervalMin":999}}');

    const b = boot(env);

    expect(b.store.notices.value).toContain('reset');
    expect(b.store.settings.value).toEqual(defaultSettings('en'));
    expect(b.store.view.value).toMatchObject({ phase: 'calm', remainingMs: 20 * MIN });
    expect(storedData(env.files, 'sbr:v1:settings')).toEqual(defaultSettings('en'));
  });

  it('keeps running in memory and raises the notice when browser storage is unavailable at startup', () => {
    const env = newEnv();
    env.files.failWrites('QuotaExceededError');

    const b = boot(env);
    runTo(env, b, T0 + 10_000);

    expect(b.store.notices.value).toContain('notSaved');
    expect(b.store.view.value).toMatchObject({ phase: 'calm', remainingMs: 20 * MIN - 10_000 });
  });

  it('switches to memory on a quota error during a later write and keeps running', () => {
    const env = newEnv();
    const b = boot(env);
    env.files.failWrites('QuotaExceededError');

    b.lifecycle.emit({ type: 'pagehide', persisted: false, atWall: env.clock.wall(), atMono: env.clock.mono() });
    expect(b.store.notices.value).toContain('notSaved');

    runTo(env, b, T0 + 10_000);
    expect(b.store.view.value).toMatchObject({ phase: 'calm', remainingMs: 20 * MIN - 10_000 });
  });
});

describe('settings changes and adapter errors', () => {
  it('applies a shorter Work_Interval at once and stores the new settings', () => {
    const env = newEnv();
    const b = boot(env);
    runTo(env, b, T0 + 12 * MIN);

    const next = { ...defaultSettings('en'), workIntervalMin: 10 };
    b.engine.updateSettings(next);

    // 12 minutes are already elapsed, so the Work_Interval is over at once with zero overdue (Requirement 1.9).
    expect(b.store.view.value).toMatchObject({ phase: 'haunting', level: 1, overdueMs: 0 });
    expect(storedData(env.files, 'sbr:v1:settings')).toEqual(next);
  });

  it('keeps running when the audio adapter throws, and reports the error', () => {
    const env = newEnv();
    const audio = createAudioEngine({ rng: createRng(7), createContext: () => null });
    const broken: AudioEngine = {
      ...audio,
      update: () => {
        throw new Error('audio is down');
      },
    };
    const b = boot(env, { audio: broken });

    runTo(env, b, T0 + 10_000);

    expect(b.store.view.value).toMatchObject({ phase: 'calm', remainingMs: 20 * MIN - 10_000 });
    expect(b.errors).toContain('audio update failed');
  });
});

describe('engine Jump_Scare presentation (Requirements 6.5-6.11)', () => {
  /** A real Audio_Engine that counts the scream calls it receives. Without a context, the real scream is refused. */
  function countingAudio(): { audio: AudioEngine; screams: () => number } {
    const real = createAudioEngine({ rng: createRng(7), createContext: () => null });
    let count = 0;
    return {
      audio: {
        ...real,
        playScream: () => {
          count += 1;
          return real.playScream();
        },
      },
      screams: () => count,
    };
  }

  it('presents no Jump_Scare when the warning is confirmed during a level-5 Haunting, and presents it once when the next Snooze runs out (6.11)', () => {
    const env = newEnv();
    const counting = countingAudio();
    const b = boot(env, { audio: counting.audio });

    // Level 5 needs 20 minutes of work and 8 minutes overdue (1 plus 4 Escalation_Steps of 2 minutes).
    runTo(env, b, T0 + 28 * MIN);
    expect(b.store.view.value).toMatchObject({ phase: 'haunting', level: 5, jumpScareShown: false });
    expect(b.store.jumpScareCount.peek()).toBe(0);

    // Confirming the warning turns Nightmare_Mode on while the App document is visible. The hold keeps the scare off.
    b.engine.updateSettings({ ...b.store.settings.peek(), nightmare: true });
    runTo(env, b, T0 + 29 * MIN);
    expect(b.store.settings.value.nightmare).toBe(true);
    expect(b.store.jumpScareCount.peek()).toBe(0);
    expect(counting.screams()).toBe(0);

    // A running Snooze keeps the scare back. When it runs out, the scare is presented once (6.6).
    b.engine.dispatch({ type: 'snooze' });
    runTo(env, b, T0 + 33 * MIN);
    expect(b.store.jumpScareCount.peek()).toBe(0);
    runTo(env, b, T0 + 34 * MIN + 10_000);
    expect(b.store.jumpScareCount.peek()).toBe(1);
    expect(counting.screams()).toBe(1);

    // The same Haunting presents no second Jump_Scare (6.7).
    runTo(env, b, T0 + 36 * MIN);
    expect(b.store.jumpScareCount.peek()).toBe(1);
    expect(counting.screams()).toBe(1);
  });
});

/** A visibility source that the test controls. `set` changes it and notifies the listeners, as `visibilitychange` does. */
interface FakeVisibility extends VisibilitySource {
  set(hidden: boolean): void;
}

function fakeVisibility(): FakeVisibility {
  let hidden = false;
  const listeners = new Set<() => void>();
  return {
    isHidden: () => hidden,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next) {
      hidden = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

describe('hidden Ritual deadline (Requirement 7.8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends a hidden Ritual at hiddenAt + 60 s when the metronome wakes up late, and counts overdue time from that deadline', () => {
    const env = newEnv();
    const b = boot(env);
    const visibility = fakeVisibility();
    // The real Ritual session runs the Ritual. Its countdown uses the fake timers, so the test decides when the
    // hidden document runs them. The callbacks match the composition root in src/app/main.tsx.
    const session = createRitualSession({
      clock: env.clock,
      visibility,
      audio: b.store.audio,
      onStarted: (kind, origin) => b.engine.dispatch({ type: 'ritualStarted', kind, origin }),
      onFinished: ({ status, atWall }) =>
        b.engine.dispatch(status === 'completed' ? { type: 'ritualCompleted' } : { type: 'ritualEnded' }, atWall),
      onHidden: (atWall) => b.engine.dispatch({ type: 'ritualHidden' }, atWall),
      onVisible: (atWall) => b.engine.dispatch({ type: 'ritualVisible' }, atWall),
    });

    // Haunting at level 1 after 21 minutes: 1 minute overdue. The Eye_Ritual starts there.
    runTo(env, b, T0 + 21 * MIN);
    expect(session.start('eye', 'haunting')).toBe(true);

    // The page is hidden at H. The Ritual's deadline is H + 60 s.
    const hiddenAt = env.clock.wall();
    visibility.set(true);

    // The metronome wakes on time at H + 50 s. The Ritual still runs, and overdue time stays frozen.
    runTo(env, b, hiddenAt + 50_000);
    expect(b.store.view.value).toMatchObject({ phase: 'haunting', ritual: 'eye', overdueMs: MIN });

    // The next wake-up is late. It lands at H + 69 s, 9 s after the deadline.
    env.clock.advance(19_000);
    b.ticker.fire(env.clock.wall());

    // The Ritual ended at H + 60 s, so the 9 s from there to the wake-up count as overdue time.
    expect(b.store.view.value).toMatchObject({ phase: 'haunting', ritual: null, overdueMs: MIN + 9_000 });

    // The session's own countdown fires afterwards and reports the same end. It adds no overdue time.
    vi.advanceTimersByTime(100);
    expect(b.store.view.value).toMatchObject({ phase: 'haunting', ritual: null, overdueMs: MIN + 9_000 });
  });
});
