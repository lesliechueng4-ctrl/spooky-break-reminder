// **Feature: spooky-break-reminder, Property 25: Settings round trip and validation**
// **Validates: Requirements 20.5, 21.2, 21.4, 29.8**
//
// For any valid Settings, serializing and parsing yields equal Settings. For any malformed text or
// object that violates SETTINGS_SPEC, parsing yields no Settings and the App falls back to the
// defaults. For any numeric input outside its range, applySettingInput returns the previous
// Settings unchanged together with the valid range.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseStored, serialize } from '../src/core/persistence';
import {
  SETTINGS_SPEC,
  applySettingInput,
  defaultSettings,
  parseSettings,
  type NumericKey,
  type Settings,
} from '../src/core/settings';

// The allowed values of each non-numeric field, written out here so the generators do not depend
// on the validators under test.
const FLAG_VALUES = {
  muted: [true, false],
  nightmare: [true, false],
  awayDetection: [true, false],
  notifications: [true, false],
  reducedMotion: ['system', 'on', 'off'],
  language: ['en', 'zh-CN'],
} as const;

type FlagKey = keyof typeof FLAG_VALUES;
const NUMERIC_KEYS = Object.keys(SETTINGS_SPEC) as NumericKey[];
const FLAG_KEYS = Object.keys(FLAG_VALUES) as FlagKey[];
const ALL_KEYS: string[] = [...NUMERIC_KEYS, ...FLAG_KEYS];

/** Every value on the grid of a numeric setting: min, min + step, ... up to max. */
function gridValues(key: NumericKey): number[] {
  const { min, max, step } = SETTINGS_SPEC[key];
  const values: number[] = [];
  for (let value = min; value <= max; value += step) values.push(value);
  return values;
}

/** A value that SETTINGS_SPEC accepts for `key`. */
const arbValidNumeric = (key: NumericKey): fc.Arbitrary<number> => fc.constantFrom(...gridValues(key));

/**
 * A number that SETTINGS_SPEC rejects for `key`: an integer outside the range, an integer off the
 * step inside the range, a non-integer, or a non-finite value.
 */
function arbInvalidNumeric(key: NumericKey): fc.Arbitrary<number> {
  const { min, max } = SETTINGS_SPEC[key];
  const valid = new Set(gridValues(key));
  return fc.oneof(
    fc.integer({ min: min - 100, max: max + 100 }).filter((value) => !valid.has(value)),
    fc.double({ noNaN: true, noDefaultInfinity: true }).filter((value) => !Number.isInteger(value)),
    fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
  );
}

/** A value of the wrong type or outside the allowed set for a flag or enum field. */
function arbBadFlag(key: FlagKey): fc.Arbitrary<unknown> {
  const allowed: readonly unknown[] = FLAG_VALUES[key];
  return fc
    .oneof(fc.integer(), fc.string(), fc.constant(null), fc.boolean())
    .filter((value) => !allowed.includes(value));
}

/** Valid Settings, built field by field from the spec. */
const arbSettings: fc.Arbitrary<Settings> = fc.record({
  workIntervalMin: arbValidNumeric('workIntervalMin'),
  longBreakFrequency: arbValidNumeric('longBreakFrequency'),
  escalationStepMin: arbValidNumeric('escalationStepMin'),
  snoozeMin: arbValidNumeric('snoozeMin'),
  naturalBreakMin: arbValidNumeric('naturalBreakMin'),
  masterVolume: arbValidNumeric('masterVolume'),
  muted: fc.boolean(),
  nightmare: fc.boolean(),
  reducedMotion: fc.constantFrom('system', 'on', 'off'),
  awayDetection: fc.boolean(),
  notifications: fc.boolean(),
  language: fc.constantFrom('en', 'zh-CN'),
});

/** A value that violates SETTINGS_SPEC. Each case starts from valid Settings and breaks one thing. */
const arbMalformedObject: fc.Arbitrary<unknown> = arbSettings.chain((valid) =>
  fc.oneof(
    // A numeric field with a rejected value.
    fc.constantFrom(...NUMERIC_KEYS).chain((key) =>
      arbInvalidNumeric(key).map((value) => ({ ...valid, [key]: value })),
    ),
    // A flag or enum field with a wrong value.
    fc.constantFrom(...FLAG_KEYS).chain((key) =>
      arbBadFlag(key).map((value) => ({ ...valid, [key]: value })),
    ),
    // One key missing.
    fc.constantFrom(...ALL_KEYS).map((key) => {
      const copy: Record<string, unknown> = { ...valid };
      delete copy[key];
      return copy;
    }),
    // One unknown key added.
    fc.string({ minLength: 1 })
      .filter((key) => !ALL_KEYS.includes(key))
      .map((key) => ({ ...valid, [key]: 0 })),
    // Not an object at all.
    fc.oneof(fc.integer(), fc.string(), fc.boolean(), fc.constant(null), fc.array(fc.integer())),
  ),
);

/** A numeric change from the Settings_Panel with a value the spec rejects. */
const arbNumericInput = fc
  .constantFrom(...NUMERIC_KEYS)
  .chain((key) => arbInvalidNumeric(key).map((value) => ({ key, value })));

/** Builds stored text for the settings kind, with arbitrary data. */
const envelope = (data: unknown): string => JSON.stringify({ v: 1, kind: 'settings', data });

describe('Property 25: Settings round trip and validation', () => {
  it('round-trips valid settings, falls back to defaults on malformed data, and rejects out-of-range numeric input', () => {
    fc.assert(
      fc.property(
        arbSettings,
        arbMalformedObject,
        fc.string(),
        arbNumericInput,
        (settings, malformed, rawText, input) => {
          // Valid Settings survive serialize and parse unchanged (20.5, 21.4).
          expect(parseStored('settings', serialize('settings', settings))).toEqual(settings);

          // Malformed text or an object yields no Settings, so the App loads the defaults (21.4).
          expect(parseSettings(malformed)).toBeNull();
          expect(parseStored('settings', envelope(malformed))).toBeNull();
          expect(parseStored('settings', rawText)).toBeNull();
          expect(parseStored('settings', envelope(malformed)) ?? defaultSettings()).toEqual(defaultSettings());

          // An out-of-range numeric input keeps the previous Settings and returns the valid range (21.2).
          const before = { ...settings };
          const { min, max, step } = SETTINGS_SPEC[input.key];
          const update = applySettingInput(settings, input.key, input.value);
          expect(update).toEqual({ ok: false, settings: before, range: { min, max, step } });
          expect(settings).toEqual(before);
        },
      ),
      { numRuns: 200 },
    );
  });
});
