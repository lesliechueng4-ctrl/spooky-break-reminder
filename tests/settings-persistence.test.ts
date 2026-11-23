// Example tests for the settings schema and the stored record format (Requirements 21.1, 21.2, 21.4).
import { describe, expect, it } from 'vitest';
import {
  parseStored,
  serialize,
  storageKey,
  type DailyLog,
  type PersistedSchedule,
  type StoreKind,
} from '../src/core/persistence';
import { applySettingInput, defaultSettings, parseSettings, type Settings } from '../src/core/settings';

const settings: Settings = defaultSettings();

/** Builds stored text by hand, so tests can break the envelope or the data on purpose. */
function envelope(kind: StoreKind | string, data: unknown, v: unknown = 1): string {
  return JSON.stringify({ v, kind, data });
}

const log: DailyLog = { day: '2026-11-20', eye: 2, breathing: 1, stretch: 0, away: 1, snoozes: 3 };
const calmSchedule: PersistedSchedule = {
  state: { phase: { kind: 'calm', workElapsedMs: 600_000, pause: null }, breakCounter: 1 },
  lastAliveWall: 1_800_000_000_000,
  frozenAtWall: null,
  awayOpenSinceWall: null,
};
const hauntSchedule: PersistedSchedule = {
  state: {
    phase: {
      kind: 'haunting',
      breakType: 'long',
      overdueMs: 150_000,
      escalationStepMs: 120_000,
      snoozeMs: 300_000,
      snoozesUsed: 1,
      snoozeRemainingMs: 60_000,
      jumpScareShown: false,
      seed: 123_456,
    },
    breakCounter: 2,
  },
  lastAliveWall: 1_800_000_000_000,
  frozenAtWall: 1_800_000_000_500,
  awayOpenSinceWall: null,
};

describe('parseSettings and defaultSettings', () => {
  it('accepts the defaults and keeps the requested language', () => {
    expect(parseSettings(settings)).toEqual(settings);
    expect(defaultSettings('zh-CN').language).toBe('zh-CN');
  });

  it('accepts the boundary values of the numeric ranges', () => {
    const low = { ...settings, workIntervalMin: 5, masterVolume: 0 };
    const high = { ...settings, workIntervalMin: 90, masterVolume: 100 };
    expect(parseSettings(low)).toEqual(low);
    expect(parseSettings(high)).toEqual(high);
  });

  it('rejects values that are not objects', () => {
    for (const raw of [null, 'settings', 42, [], [settings]]) {
      expect(parseSettings(raw)).toBeNull();
    }
  });

  it('rejects a missing key and an extra key', () => {
    const { muted: _muted, ...missing } = settings;
    expect(parseSettings(missing)).toBeNull();
    expect(parseSettings({ ...settings, extra: true })).toBeNull();
  });

  it('rejects numbers outside the range, off the step, or not integers', () => {
    expect(parseSettings({ ...settings, workIntervalMin: 4 })).toBeNull();
    expect(parseSettings({ ...settings, workIntervalMin: 91 })).toBeNull();
    expect(parseSettings({ ...settings, workIntervalMin: 20.5 })).toBeNull();
    expect(parseSettings({ ...settings, masterVolume: 52 })).toBeNull();
    expect(parseSettings({ ...settings, longBreakFrequency: 0 })).toBeNull();
    expect(parseSettings({ ...settings, snoozeMin: '5' })).toBeNull();
    expect(parseSettings({ ...settings, escalationStepMin: Number.NaN })).toBeNull();
  });

  it('rejects flags and enums with the wrong type or value', () => {
    expect(parseSettings({ ...settings, muted: 'no' })).toBeNull();
    expect(parseSettings({ ...settings, reducedMotion: 'auto' })).toBeNull();
    expect(parseSettings({ ...settings, language: 'fr' })).toBeNull();
  });
});

describe('applySettingInput', () => {
  it('applies an in-range value on a step', () => {
    const result = applySettingInput(settings, 'masterVolume', 45);
    expect(result).toEqual({ ok: true, settings: { ...settings, masterVolume: 45 } });
  });

  it('keeps the previous settings and returns the range for an out-of-range value', () => {
    const result = applySettingInput(settings, 'snoozeMin', 16);
    expect(result).toEqual({
      ok: false,
      settings,
      range: { min: 1, max: 15, step: 1 },
    });
  });

  it('rejects a value off the step even when it is inside the range', () => {
    const result = applySettingInput(settings, 'masterVolume', 52);
    expect(result).toEqual({
      ok: false,
      settings,
      range: { min: 0, max: 100, step: 5 },
    });
  });

  it('rejects NaN', () => {
    expect(applySettingInput(settings, 'workIntervalMin', Number.NaN).ok).toBe(false);
  });
});

describe('serialize and parseStored', () => {
  it('writes the envelope with v, kind and data', () => {
    expect(JSON.parse(serialize('settings', settings))).toEqual({ v: 1, kind: 'settings', data: settings });
  });

  it('round-trips every stored kind', () => {
    expect(parseStored('settings', serialize('settings', settings))).toEqual(settings);
    expect(parseStored('meta', serialize('meta', { onboarded: true }))).toEqual({ onboarded: true });
    expect(parseStored('log', serialize('log', log))).toEqual(log);
    expect(parseStored('schedule', serialize('schedule', calmSchedule))).toEqual(calmSchedule);
    expect(parseStored('schedule', serialize('schedule', hauntSchedule))).toEqual(hauntSchedule);
  });

  it('returns null for missing text and for text that is not JSON', () => {
    expect(parseStored('settings', null)).toBeNull();
    expect(parseStored('settings', '{"v":1,')).toBeNull();
  });

  it('returns null for another version, another kind, or extra envelope keys', () => {
    expect(parseStored('settings', envelope('settings', settings, 2))).toBeNull();
    expect(parseStored('settings', envelope('log', settings))).toBeNull();
    expect(parseStored('settings', JSON.stringify({ v: 1, kind: 'settings', data: settings, extra: 1 }))).toBeNull();
  });

  it('returns null when the data fails the validator for its kind', () => {
    expect(parseStored('settings', envelope('settings', { ...settings, masterVolume: 101 }))).toBeNull();
    expect(parseStored('meta', envelope('meta', { onboarded: 'yes' }))).toBeNull();
  });

  it('rejects impossible calendar days in a Daily_Log', () => {
    expect(parseStored('log', envelope('log', { ...log, day: '2026-02-30' }))).toBeNull();
    expect(parseStored('log', envelope('log', { ...log, day: '2026-11-2' }))).toBeNull();
    expect(parseStored('log', envelope('log', { ...log, eye: -1 }))).toBeNull();
  });

  it('rejects schedule data with a bad phase, a bad break type, or a snooze longer than its snapshot', () => {
    const haunting = hauntSchedule.state.phase;
    const bad = (phase: unknown) => envelope('schedule', { ...hauntSchedule, state: { ...hauntSchedule.state, phase } });
    expect(parseStored('schedule', bad({ ...haunting, breakType: 'short' }))).toBeNull();
    expect(parseStored('schedule', bad({ kind: 'paused', workElapsedMs: 0, pause: null }))).toBeNull();
    expect(parseStored('schedule', bad({ ...haunting, snoozeRemainingMs: 300_001 }))).toBeNull();
    expect(parseStored('schedule', bad({ ...haunting, escalationStepMs: 0 }))).toBeNull();
    expect(parseStored('schedule', bad({ ...haunting, snoozesUsed: 4 }))).toBeNull();
    expect(parseStored('schedule', bad({ kind: 'calm', workElapsedMs: 1.5, pause: null }))).toBeNull();
  });
});

describe('storageKey', () => {
  it('shares settings and meta keys between both modes', () => {
    expect(storageKey('settings', 'demo')).toBe('sbr:v1:settings');
    expect(storageKey('meta', 'demo')).toBe('sbr:v1:meta');
  });

  it('namespaces schedule and log keys for Demo_Mode', () => {
    expect(storageKey('schedule', 'normal')).toBe('sbr:v1:schedule');
    expect(storageKey('schedule', 'demo')).toBe('sbr:v1:demo:schedule');
    expect(storageKey('log', 'normal')).toBe('sbr:v1:log');
    expect(storageKey('log', 'demo')).toBe('sbr:v1:demo:log');
  });
});
