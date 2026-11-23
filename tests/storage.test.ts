// Example tests for the Local_Storage adapter with a hand-written fake Storage (Requirements 21.3,
// 21.5, 21.6, 25.7). The fake stands in for the browser storage only; the adapter code is real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DailyLog, parseStored, serialize, storageKey } from '../src/core/persistence';
import { defaultSettings, type Settings } from '../src/core/settings';
import { openStorage, type StorageNotice } from '../src/platform/storage';

class FakeStorage {
  readonly data = new Map<string, string>();
  /** When set, every setItem throws this value (for example a quota or security error). */
  writeError: unknown = null;
  /** When true, every getItem throws. */
  readError = false;

  get length(): number {
    return this.data.size;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    if (this.readError) throw new Error('read blocked');
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.writeError !== null) throw this.writeError;
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function asStorage(fake: FakeStorage): Storage {
  return fake as unknown as Storage;
}

function namedError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

const quotaError = (): Error => namedError('QuotaExceededError');
const securityError = (): Error => namedError('SecurityError');

const settings: Settings = { ...defaultSettings(), masterVolume: 45 };
const log: DailyLog = { day: '2026-11-20', eye: 2, breathing: 1, stretch: 0, away: 0, snoozes: 1 };

describe('openStorage startup probe', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the browser storage and leaves no probe key behind when the probe succeeds', () => {
    const fake = new FakeStorage();
    const report = vi.fn<(notice: StorageNotice) => void>();
    const storage = openStorage({ mode: 'normal', source: () => asStorage(fake), report });

    expect(storage.persistent).toBe(true);
    expect(report).not.toHaveBeenCalled();
    expect(fake.data.size).toBe(0);
  });

  it('keeps records in memory and reports unavailable when reading the storage throws', () => {
    const report = vi.fn<(notice: StorageNotice) => void>();
    const storage = openStorage({
      mode: 'normal',
      source: () => {
        throw securityError();
      },
      report,
    });

    expect(storage.persistent).toBe(false);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('unavailable');
    storage.writeRecord('settings', settings);
    expect(storage.readRecord('settings')).toEqual({ status: 'ok', value: settings });
  });

  it('reports quota when the probe write runs out of space', () => {
    const fake = new FakeStorage();
    fake.writeError = quotaError();
    const report = vi.fn<(notice: StorageNotice) => void>();
    const storage = openStorage({ mode: 'normal', source: () => asStorage(fake), report });

    expect(storage.persistent).toBe(false);
    expect(report).toHaveBeenCalledWith('quota');
  });
});

describe('record keys and envelopes', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the settings envelope under the shared key and the log under the mode key', () => {
    const fake = new FakeStorage();
    const storage = openStorage({ mode: 'demo', source: () => asStorage(fake) });

    storage.writeRecord('settings', settings);
    storage.writeRecord('log', log);

    expect(fake.data.get('sbr:v1:settings')).toBe(serialize('settings', settings));
    expect(fake.data.get('sbr:v1:demo:log')).toBe(serialize('log', log));
    expect(fake.data.has('sbr:v1:log')).toBe(false);
  });

  it('shares settings between normal use and Demo_Mode and keeps the schedule apart', () => {
    const fake = new FakeStorage();
    openStorage({ mode: 'normal', source: () => asStorage(fake) }).writeRecord('settings', settings);

    const demo = openStorage({ mode: 'demo', source: () => asStorage(fake) });
    expect(demo.readRecord('settings')).toEqual({ status: 'ok', value: settings });
    expect(demo.readRecord('schedule')).toEqual({ status: 'missing' });
    expect(storageKey('schedule', 'normal')).not.toBe(storageKey('schedule', 'demo'));
  });

  it('reports missing, invalid and ok reads', () => {
    const fake = new FakeStorage();
    const storage = openStorage({ mode: 'normal', source: () => asStorage(fake) });

    expect(storage.readRecord('log')).toEqual({ status: 'missing' });
    fake.data.set('sbr:v1:log', '{"v":2,"kind":"log","data":{}}');
    expect(storage.readRecord('log')).toEqual({ status: 'invalid' });
    storage.writeRecord('log', log);
    expect(storage.readRecord('log')).toEqual({ status: 'ok', value: log });
    expect(parseStored('log', fake.data.get('sbr:v1:log') ?? null)).toEqual(log);
  });

  it('treats a read that throws as a missing record instead of failing', () => {
    const fake = new FakeStorage();
    const storage = openStorage({ mode: 'normal', source: () => asStorage(fake) });
    fake.readError = true;

    expect(storage.readRecord('settings')).toEqual({ status: 'missing' });
  });
});

describe('quota and write failures during a session', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('switches to memory on the first quota error, reports once and reads back later writes', () => {
    const fake = new FakeStorage();
    const report = vi.fn<(notice: StorageNotice) => void>();
    const storage = openStorage({ mode: 'normal', source: () => asStorage(fake), report });
    storage.writeRecord('settings', settings);

    fake.writeError = quotaError();
    storage.writeRecord('log', log);
    storage.writeRecord('log', { ...log, eye: 3 });

    expect(storage.persistent).toBe(false);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('quota');
    expect(storage.readRecord('log')).toEqual({ status: 'ok', value: { ...log, eye: 3 } });
    expect(storage.readRecord('settings')).toEqual({ status: 'ok', value: settings });
    expect(fake.data.has('sbr:v1:log')).toBe(false);
  });

  it('reports unavailable when a write is blocked by a security error', () => {
    const fake = new FakeStorage();
    const report = vi.fn<(notice: StorageNotice) => void>();
    const storage = openStorage({ mode: 'normal', source: () => asStorage(fake), report });

    fake.writeError = securityError();
    storage.writeRecord('settings', settings);

    expect(report).toHaveBeenCalledWith('unavailable');
    expect(storage.readRecord('settings')).toEqual({ status: 'ok', value: settings });
  });

  it('does not let a throwing report handler stop the storage', () => {
    const storage = openStorage({
      mode: 'normal',
      source: () => {
        throw securityError();
      },
      report: () => {
        throw new Error('handler failed');
      },
    });

    expect(() => storage.writeRecord('settings', settings)).not.toThrow();
    expect(storage.readRecord('settings')).toEqual({ status: 'ok', value: settings });
  });
});

describe('eraseAll', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes every sbr: key, including Demo_Mode keys, and leaves other keys alone', () => {
    const fake = new FakeStorage();
    fake.data.set('other-app:theme', 'dark');
    const normal = openStorage({ mode: 'normal', source: () => asStorage(fake) });
    normal.writeRecord('settings', settings);
    openStorage({ mode: 'demo', source: () => asStorage(fake) }).writeRecord('log', log);

    normal.eraseAll();

    expect([...fake.data.keys()]).toEqual(['other-app:theme']);
    expect(normal.readRecord('settings')).toEqual({ status: 'missing' });
  });

  it('clears records kept in memory after a switch', () => {
    const fake = new FakeStorage();
    const storage = openStorage({ mode: 'normal', source: () => asStorage(fake) });
    fake.writeError = quotaError();
    storage.writeRecord('settings', settings);

    storage.eraseAll();

    expect(storage.readRecord('settings')).toEqual({ status: 'missing' });
  });

  it('erases the browser keys written before a switch to memory', () => {
    const fake = new FakeStorage();
    const storage = openStorage({ mode: 'normal', source: () => asStorage(fake) });
    storage.writeRecord('settings', settings);
    fake.writeError = quotaError();
    storage.writeRecord('log', log);

    storage.eraseAll();

    expect(fake.data.size).toBe(0);
    expect(storage.readRecord('log')).toEqual({ status: 'missing' });
  });
});
